import { randomInt } from "node:crypto";
import { compare, hash } from "bcryptjs";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { accessRequests, auditLogs, platformSettings, users } from "@/db/schema";
import { clearSession, createSignedToken, getSessionUser, publicUser, setSession, totpCode, verifySignedToken, verifyTotp } from "@/lib/auth";
import { decryptValue } from "@/lib/crypto";
import { ensureSeeded } from "@/lib/seed";
import { sameOrigin, withinRateLimit } from "@/lib/security";

export const dynamic = "force-dynamic";
const credentialsSchema = z.object({ identifier: z.string().trim().min(3), password: z.string().min(1) });
const registerSchema = z.object({ fullName: z.string().trim().min(2).max(180), email: z.email().trim().toLowerCase(), phone: z.string().trim().min(8).max(40), password: z.string().min(12).max(128), bloodGroup: z.string().max(8).optional(), city: z.string().trim().max(100).optional(), privacyConsent: z.literal(true) });
const responseHeaders = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Requête refusée : origine non autorisée." }, { status: 403 });
  try {
    await ensureSeeded();
    const body = await request.json();
    const action = String(body.action || "");
    if (action === "demo") return Response.json({ error: "Connexion directe aux rôles interdite. Utilisez vos identifiants et la double authentification." }, { status: 403 });
    if (action === "logout") { await clearSession(); return Response.json({ ok: true }, { headers: responseHeaders }); }

    if (action === "register") {
      if (!(await withinRateLimit(request, "register", 5, 3600))) return Response.json({ error: "Trop de demandes. Réessayez plus tard." }, { status: 429 });
      const [registrations] = await db.select().from(platformSettings).where(eq(platformSettings.key, "registrations_open")).limit(1);
      if (registrations?.value === "false") return Response.json({ error: "Les inscriptions sont momentanément fermées." }, { status: 403 });
      const parsed = registerSchema.safeParse(body);
      if (!parsed.success) return Response.json({ error: "Vérifiez les informations, acceptez la confidentialité et choisissez un mot de passe d'au moins 12 caractères." }, { status: 400 });
      const { fullName, email, phone, password, bloodGroup, city } = parsed.data;
      const existing = await db.select({ id: users.id }).from(users).where(or(eq(users.email, email), eq(users.phone, phone))).limit(1);
      if (existing.length) return Response.json({ error: "Cet email ou ce numéro est déjà utilisé." }, { status: 409 });
      const npi = `SP-${new Date().getFullYear()}-${randomInt(100000, 999999)}`;
      const [user] = await db.insert(users).values({ fullName, email, phone, passwordHash: await hash(password, 12), role: "patient", npi, bloodGroup: bloodGroup || null, city: city || "Cotonou", privacyAcceptedAt: new Date() }).returning();
      await setSession(user.id);
      await db.insert(auditLogs).values({ userId: user.id, action: "Consentement et création de compte", resource: "Politique de confidentialité v1", details: "Acceptation explicite lors de l'inscription" });
      return Response.json({ user: publicUser(user), message: "Bienvenue sur SANTÉ+ ! Votre identité santé a été créée." }, { status: 201, headers: responseHeaders });
    }

    if (action === "login") {
      const parsed = credentialsSchema.safeParse(body);
      if (!parsed.success) return Response.json({ error: "Identifiant et mot de passe requis." }, { status: 400 });
      const identifier = parsed.data.identifier;
      if (!(await withinRateLimit(request, "login", 8, 900, identifier))) return Response.json({ error: "Trop de tentatives. Réessayez dans 15 minutes." }, { status: 429 });
      const [user] = await db.select().from(users).where(or(eq(users.email, identifier.toLowerCase()), eq(users.phone, identifier))).limit(1);
      if (!user || !user.isActive || (user.isDemo && process.env.ENABLE_DEMO_MODE !== "true") || !(await compare(parsed.data.password, user.passwordHash))) return Response.json({ error: "Identifiants incorrects ou compte indisponible." }, { status: 401 });
      if (["doctor", "hospital", "admin"].includes(user.role)) {
        if (!user.twoFactorSecret) return Response.json({ error: "La double authentification doit être configurée pour ce compte." }, { status: 403 });
        const otpSecret = decryptValue(user.twoFactorSecret);
        return Response.json({ needs2FA: true, challenge: createSignedToken(user.id), demoCode: user.isDemo && process.env.ENABLE_DEMO_MODE === "true" ? totpCode(otpSecret) : undefined, message: "Saisissez le code de votre application d'authentification." }, { headers: responseHeaders });
      }
      await setSession(user.id);
      await db.insert(auditLogs).values({ userId: user.id, action: "Connexion", resource: "Espace patient" });
      return Response.json({ user: publicUser(user), message: "Connexion réussie." }, { headers: responseHeaders });
    }

    if (action === "verify2fa") {
      if (!(await withinRateLimit(request, "verify2fa", 6, 300, String(body.challenge || "")))) return Response.json({ error: "Trop de codes incorrects. Recommencez dans quelques minutes." }, { status: 429 });
      const userId = verifySignedToken(String(body.challenge || ""));
      if (!userId) return Response.json({ error: "Vérification expirée. Recommencez la connexion." }, { status: 401 });
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user || !user.isActive || (user.isDemo && process.env.ENABLE_DEMO_MODE !== "true") || !user.twoFactorSecret || !verifyTotp(decryptValue(user.twoFactorSecret), String(body.code || ""))) return Response.json({ error: "Code de vérification incorrect." }, { status: 401 });
      await setSession(user.id, true);
      await db.insert(auditLogs).values({ userId: user.id, action: "Connexion 2FA", resource: `Espace ${user.role}`, details: "Code temporaire vérifié" });
      return Response.json({ user: publicUser(user), message: "Connexion sécurisée réussie." }, { headers: responseHeaders });
    }

    if (action === "requestAccess") {
      if (!(await withinRateLimit(request, "access-request", 5, 3600))) return Response.json({ error: "Trop de demandes. Réessayez plus tard." }, { status: 429 });
      const role = String(body.role || ""); const applicantName = String(body.applicantName || "").trim(); const email = String(body.email || "").trim().toLowerCase();
      if (!["doctor", "hospital"].includes(role) || applicantName.length < 2 || !z.email().safeParse(email).success) return Response.json({ error: "Veuillez compléter les informations requises." }, { status: 400 });
      const [existing] = await db.select().from(accessRequests).where(and(eq(accessRequests.email, email), eq(accessRequests.status, "en attente"))).limit(1);
      if (existing) return Response.json({ error: "Une demande est déjà en cours pour cette adresse." }, { status: 409 });
      await db.insert(accessRequests).values({ applicantName, email, phone: String(body.phone || ""), role, organization: String(body.organization || ""), specialty: String(body.specialty || "") });
      return Response.json({ message: "Demande reçue. Un contrôle humain est nécessaire avant l'activation." }, { status: 201 });
    }
    if (action === "me") { const user = await getSessionUser(); return Response.json({ user: user ? publicUser(user) : null }, { headers: responseHeaders }); }
    return Response.json({ error: "Action inconnue." }, { status: 400 });
  } catch (error) { console.error("Auth error", error); return Response.json({ error: "Une erreur est survenue. Réessayez." }, { status: 500 }); }
}
