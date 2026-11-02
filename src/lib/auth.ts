import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";

const COOKIE_NAME = "sante_session";
function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 48) throw new Error("SESSION_SECRET is required and must be at least 48 characters");
  return value;
}
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const sign = (value: string) => createHmac("sha256", secret()).update(value).digest("base64url");

export function createSignedToken(userId: number, purpose: "2fa" = "2fa") {
  const payload = Buffer.from(JSON.stringify({ userId, purpose, exp: Math.floor(Date.now() / 1000) + 300 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySignedToken(token: string, purpose: "2fa" = "2fa"): number | null {
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

export async function setSession(userId: number, twoFactorVerified = false) {
  const token = randomBytes(32).toString("base64url");
  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error("Unknown user");
  const privileged = ["doctor", "hospital", "admin"].includes(user.role);
  if (privileged && !twoFactorVerified) throw new Error("Two-factor authentication required");
  const ttl = privileged ? 60 * 60 * 12 : 60 * 60 * 24 * 7;
  await db.insert(sessions).values({ tokenHash: digest(token), userId, twoFactorVerified, expiresAt: new Date(Date.now() + ttl * 1000) });
  (await cookies()).set(COOKIE_NAME, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: ttl });
}

export async function clearSession() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenHash, digest(token)));
  store.delete(COOKIE_NAME);
}

export async function getSessionUser() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token || token.length < 35) return null;
  const [session] = await db.select().from(sessions).where(and(eq(sessions.tokenHash, digest(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date()))).limit(1);
  if (!session) return null;
  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user?.isActive || (user.isDemo && process.env.ENABLE_DEMO_MODE !== "true")) return null;
  if (["doctor", "hospital", "admin"].includes(user.role) && !session.twoFactorVerified) return null;
  return user;
}

export function totpCode(hexSecret: string, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 30000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", Buffer.from(hexSecret, "hex")).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, "0");
}
export function verifyTotp(hexSecret: string, input: string) {
  return /^\d{6}$/.test(input) && [-30000, 0, 30000].some((offset) => totpCode(hexSecret, Date.now() + offset) === input);
}
export function publicUser(user: typeof users.$inferSelect) {
  return { id: user.id, fullName: user.fullName, email: user.email, phone: user.phone, role: user.role, npi: user.npi, bloodGroup: user.bloodGroup, birthDate: user.birthDate, city: user.city, hospitalId: user.hospitalId, isDemo: user.isDemo, isActive: user.isActive, createdAt: user.createdAt };
}
