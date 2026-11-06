import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";

const COOKIE_NAME = "sante_session";
export type TokenPurpose = "password-change";

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 48) throw new Error("SESSION_SECRET is required and must be at least 48 characters");
  return value;
}
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const sign = (value: string) => createHmac("sha256", secret()).update(value).digest("base64url");

export function createSignedToken(userId: number, purpose: TokenPurpose) {
  const payload = Buffer.from(JSON.stringify({ userId, purpose, exp: Math.floor(Date.now() / 1000) + 300 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySignedToken(token: string, purpose: TokenPurpose): number | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { userId: number; purpose: string; exp: number };
    if (data.purpose !== purpose || data.exp < Math.floor(Date.now() / 1000) || !Number.isInteger(data.userId)) return null;
    return data.userId;
  } catch { return null; }
}

/**
 * Attributs du cookie de session.
 *
 * Le choix dépend du contexte d'intégration, et c'est ce qui rend l'espace
 * accessible depuis la prévisualisation Arena :
 *
 * - Production : l'application est servie sur sa propre origine et n'est pas
 *   intégrable (frame-ancestors 'none'). « strict » est le réglage le plus sûr.
 * - Développement sous HTTPS : la prévisualisation affiche l'app dans une iframe
 *   dont l'origine diffère (https://<port>-<id>.e2b.app). Un cookie « strict » OU
 *   « lax » n'est alors jamais renvoyé par le navigateur, ce qui provoque la boucle
 *   « connexion réussie puis retour à /connexion ». Seul « none » (obligatoirement
 *   accompagné de Secure) est transmis dans un contexte tiers.
 * - Développement en HTTP simple (127.0.0.1) : « none » exigerait Secure, que le
 *   navigateur refuserait sur http. On retombe sur « lax ».
 *
 * La protection CSRF ne repose pas sur SameSite mais sur sameOrigin(), vérifié
 * sur chaque mutation : une origine étrangère reste refusée en 403.
 */
async function sessionCookieOptions(ttl: number) {
  const base = { httpOnly: true, path: "/", maxAge: ttl } as const;
  if (process.env.NODE_ENV === "production") return { ...base, secure: true, sameSite: "strict" as const };
  const requestHeaders = await headers();
  const forwardedProto = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const origin = requestHeaders.get("origin") || "";
  const overHttps = forwardedProto === "https" || origin.startsWith("https://");
  return overHttps
    ? { ...base, secure: true, sameSite: "none" as const }
    : { ...base, secure: false, sameSite: "lax" as const };
}

/**
 * Jeton de session transmis hors cookie.
 *
 * Certains contextes d'intégration bloquent totalement les cookies tiers : la
 * prévisualisation Arena affiche l'application dans une iframe dont l'origine
 * diffère, et Chrome/Safari y refusent alors le cookie de session même en
 * SameSite=None. Le serveur continue de poser le cookie (cas normal) mais accepte
 * aussi le jeton via l'en-tête `x-sante-session`, et le renvoie sur les réponses
 * d'authentification pour que le client puisse le conserver.
 *
 * Ce n'est pas un affaiblissement : le jeton reste aléatoire (32 octets), haché en
 * base, révocable et à durée de vie limitée. L'en-tête étant de nature CORS
 * (non simple), il ne peut pas être forgé par un site tiers en cross-origin.
 */
export const SESSION_HEADER = "x-sante-session";

export async function setSession(userId: number) {

  const token = randomBytes(32).toString("base64url");
  const [user] = await db.select({ role: users.role, mustChangePassword: users.mustChangePassword }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error("Unknown user");
  if (user.mustChangePassword) throw new Error("Initial password change required");
  const privileged = ["doctor", "hospital", "admin"].includes(user.role);
  const ttl = privileged ? 60 * 60 * 12 : 60 * 60 * 24 * 7;
  await db.insert(sessions).values({ tokenHash: digest(token), userId, expiresAt: new Date(Date.now() + ttl * 1000) });
  (await cookies()).set(COOKIE_NAME, token, await sessionCookieOptions(ttl));
  return token;
}

export async function clearSession() {
  const store = await cookies();
  const token = (await currentToken());
  if (token) await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenHash, digest(token)));
  store.delete(COOKIE_NAME);
}

/** Jeton courant : en-tête explicite prioritaire, sinon cookie. */
async function currentToken(): Promise<string | null> {
  const fromHeader = (await headers()).get(SESSION_HEADER);
  if (fromHeader && fromHeader.length >= 35) return fromHeader;
  return (await cookies()).get(COOKIE_NAME)?.value ?? null;
}

export async function getSessionUser() {
  const token = await currentToken();
  if (!token || token.length < 35) return null;
  const [session] = await db.select().from(sessions).where(and(eq(sessions.tokenHash, digest(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date()))).limit(1);
  if (!session) return null;
  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user?.isActive || user.mustChangePassword) return null;
  return user;
}

export function publicUser(user: typeof users.$inferSelect) {
  return { id: user.id, fullName: user.fullName, email: user.email, phone: user.phone, role: user.role, npi: user.npi, bloodGroup: user.bloodGroup, birthDate: user.birthDate, city: user.city, hospitalId: user.hospitalId, isActive: user.isActive, mustChangePassword: user.mustChangePassword, createdAt: user.createdAt };
}

/** Révoque toutes les sessions d'un utilisateur (déconnexion globale). */
export async function revokeAllSessions(userId: number) {
  await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

/** Révoque les autres sessions en conservant la session courante. */
export async function revokeOtherSessions(userId: number) {
  const token = await currentToken();
  const keep = token ? digest(token) : "";
  await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), keep ? ne(sessions.tokenHash, keep) : undefined));
}
