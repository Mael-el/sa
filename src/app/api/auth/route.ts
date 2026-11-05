import { randomBytes, randomInt } from "node:crypto";
import { compare, hash } from "bcryptjs";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { accessRequests, auditLogs, notifications, platformSettings, sessions, users } from "@/db/schema";
import { clearSession, createSignedToken, getSessionUser, otpauthUrl, publicUser, revokeAllSessions, revokeOtherSessions, setSession, totpBase32, verifySignedToken, verifyTotpCounter, type TokenPurpose } from "@/lib/auth";
import { consumeReset, findValidReset, issueResetCode } from "@/lib/password-reset";
import { decryptValue, encryptValue } from "@/lib/crypto";
import { passwordProblem, sameOrigin, withinRateLimit } from "@/lib/security";

export const dynamic = "force-dynamic";
const credentialsSchema = z.object({ identifier: z.string().trim().min(3), password: z.string().min(1) });
const registerSchema = z.object({ fullName: z.string().trim().min(2).max(180), email: z.email().trim().toLowerCase(), phone: z.string().trim().min(8).max(40), password: z.string().min(12).max(128), bloodGroup: z.string().max(8).optional(), city: z.string().trim().max(100).optional(), privacyConsent: z.literal(true) });
const passwordChangeSchema = z.object({ challenge: z.string().min(10), newPassword: z.string().min(12).max(128), confirmPassword: z.string().min(12).max(128), privacyConsent: z.boolean().optional() });
const responseHeaders = { "Cache-Control": "no-store" };
const privilegedRoles = ["doctor", "hospital", "admin"];

async function registrationsOpen() {
  const [setting] = await db.select().from(platformSettings).where(eq(platformSettings.key, "registrations_open")).limit(1);
  return setting?.value === "true";
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Requête refusée : origine non autorisée." }, { status: 403 });
  try {
    const body = await request.json();
    const action = String(body.action || "");

    if (action === "config") return Response.json({ registrationsOpen: await registrationsOpen() }, { headers: responseHeaders });
    if (action === "demo") return Response.json({ error: "Le mode démonstration est désactivé." }, { status: 403 });
    if (action === "logout") { await clearSession(); return Response.json({ ok: true }, { headers: responseHeaders }); }

    if (action === "register") {
      if (!(await registrationsOpen())) return Response.json({ error: "Les inscriptions publiques sont fermées. Contactez l'administration pour créer votre compte." }, { status: 403 });
      // Validation avant limitation de débit : les demandes mal formées n'épuisent pas le quota des inscriptions légitimes.
      const parsed = registerSchema.safeParse(body);
      if (!parsed.success) return Response.json({ error: "Vérifiez les informations, acceptez la confidentialité et choisissez un mot de passe d'au moins 12 caractères." }, { status: 400 });
      if (!(await withinRateLimit(request, "register", 5, 3600))) return Response.json({ error: "Trop de demandes. Réessayez plus tard." }, { status: 429 });
      const { fullName, email, phone, password, bloodGroup, city } = parsed.data;
      const weakness = passwordProblem(password, { email, fullName });
      if (weakness) return Response.json({ error: weakness }, { status: 400 });
      const [existing] = await db.select({ id: users.id }).from(users).where(or(eq(users.email, email), eq(users.phone, phone))).limit(1);
      if (existing) return Response.json({ error: "Cet email ou ce numéro est déjà utilisé." }, { status: 409 });
      const npi = `SP-${new Date().getFullYear()}-${randomInt(100000, 999999)}`;
      const [user] = await db.insert(users).values({ fullName, email, phone, passwordHash: await hash(password, 12), role: "patient", npi, bloodGroup: bloodGroup || null, city: city || "Cotonou", mustChangePassword: false, privacyAcceptedAt: new Date(), passwordChangedAt: new Date() }).returning();
      await setSession(user.id);
      await db.insert(auditLogs).values({ userId: user.id, action: "Consentement et création de compte", resource: "Politique de confidentialité v1", details: "Acceptation explicite lors de l'inscription" });
      return Response.json({ user: publicUser(user), message: "Bienvenue sur SANTÉ+ ! Votre identité santé a été créée." }, { status: 201, headers: responseHeaders });
    }

    if (action === "requestPasswordReset") {
      const identifier = String(body.identifier || "").trim();
      const generic = { message: "Si un compte correspond à ces informations, une demande de réinitialisation a été transmise. L'administration vous remettra un code après vérification de votre identité." };
      if (identifier.length < 3) return Response.json(generic, { headers: responseHeaders });
      if (!(await withinRateLimit(request, "reset-request", 4, 3600, identifier.toLowerCase()))) return Response.json({ error: "Trop de demandes. Réessayez dans une heure." }, { status: 429 });
      const [user] = await db.select().from(users).where(or(eq(users.email, identifier.toLowerCase()), eq(users.phone, identifier))).limit(1);
      // Réponse identique dans tous les cas : impossible d'énumérer les comptes existants.
      if (!user || !user.isActive) return Response.json(generic, { headers: responseHeaders });
      await issueResetCode(user.id, "auto");
      const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
      if (admins.length) {
        await db.insert(notifications).values(admins.map((admin) => ({
          userId: admin.id,
          title: "Demande de réinitialisation",
          message: `${user.fullName} (${user.email}) demande une réinitialisation de mot de passe. Vérifiez son identité puis générez un code depuis Utilisateurs.`,
          category: "securite",
        })));
      }
      await db.insert(auditLogs).values({ userId: user.id, action: "Demande de réinitialisation", resource: "Mot de passe", details: "Code à usage unique émis pour 30 minutes" });
      return Response.json(generic, { headers: responseHeaders });
    }

    if (action === "resetPassword") {
      const identifier = String(body.identifier || "").trim();
      const code = String(body.code || "").trim();
      const newPassword = String(body.newPassword || "");
      const confirmPassword = String(body.confirmPassword || "");
      if (!(await withinRateLimit(request, "reset-confirm", 8, 900, `${identifier.toLowerCase()}|${code}`))) return Response.json({ error: "Trop de tentatives. Réessayez dans 15 minutes." }, { status: 429 });
      if (!identifier || !code) return Response.json({ error: "Renseignez votre identifiant et le code reçu." }, { status: 400 });
      if (newPassword !== confirmPassword) return Response.json({ error: "Les deux mots de passe ne correspondent pas." }, { status: 400 });
      const [user] = await db.select().from(users).where(or(eq(users.email, identifier.toLowerCase()), eq(users.phone, identifier))).limit(1);
      if (!user || !user.isActive) return Response.json({ error: "Identifiant ou code invalide." }, { status: 400 });
      const weakness = passwordProblem(newPassword, { email: user.email, fullName: user.fullName });
      if (weakness) return Response.json({ error: weakness }, { status: 400 });
      const record = await findValidReset(user.id, code);
      if (!record) return Response.json({ error: "Ce code est invalide, déjà utilisé ou expiré." }, { status: 400 });
      await db.update(users).set({ passwordHash: await hash(newPassword, 12), mustChangePassword: false, passwordChangedAt: new Date() }).where(eq(users.id, user.id));
      await consumeReset(record.id);
      await revokeAllSessions(user.id);
      await db.insert(auditLogs).values({ userId: user.id, action: "Réinitialisation de mot de passe", resource: "Compte utilisateur", details: "Code à usage unique consommé, sessions révoquées" });
      return Response.json({ message: "Votre mot de passe a été réinitialisé. Connectez-vous avec vos nouveaux identifiants." }, { headers: responseHeaders });
    }

    if (action === "changePassword") {
      const current = await getSessionUser();
      if (!current) return Response.json({ error: "Connexion requise." }, { status: 401 });
      if (!(await withinRateLimit(request, "change-password", 6, 900, String(current.id)))) return Response.json({ error: "Trop de tentatives. Réessayez dans 15 minutes." }, { status: 429 });
      const currentPassword = String(body.currentPassword || "");
      const newPassword = String(body.newPassword || "");
      const confirmPassword = String(body.confirmPassword || "");
      if (!(await compare(currentPassword, current.passwordHash))) return Response.json({ error: "Le mot de passe actuel est incorrect." }, { status: 401 });
      if (newPassword !== confirmPassword) return Response.json({ error: "Les deux mots de passe ne correspondent pas." }, { status: 400 });
      if (await compare(newPassword, current.passwordHash)) return Response.json({ error: "Le nouveau mot de passe doit être différent de l'actuel." }, { status: 400 });
      const weakness = passwordProblem(newPassword, { email: current.email, fullName: current.fullName });
      if (weakness) return Response.json({ error: weakness }, { status: 400 });
      await db.update(users).set({ passwordHash: await hash(newPassword, 12), mustChangePassword: false, passwordChangedAt: new Date() }).where(eq(users.id, current.id));
      await revokeOtherSessions(current.id);
      await db.insert(auditLogs).values({ userId: current.id, action: "Changement de mot de passe", resource: "Compte utilisateur", details: "Autres sessions révoquées" });
      return Response.json({ message: "Mot de passe mis à jour. Vos autres sessions ont été déconnectées." }, { headers: responseHeaders });
    }

    if (action === "logoutAll") {
      const current = await getSessionUser();
      if (!current) return Response.json({ error: "Connexion requise." }, { status: 401 });
      await revokeAllSessions(current.id);
      await db.insert(auditLogs).values({ userId: current.id, action: "Déconnexion globale", resource: "Sessions" });
      await clearSession();
      return Response.json({ message: "Toutes vos sessions ont été fermées." }, { headers: responseHeaders });
    }

    if (action === "login") {
      const parsed = credentialsSchema.safeParse(body);
      if (!parsed.success) return Response.json({ error: "Identifiant et mot de passe requis." }, { status: 400 });
      const identifier = parsed.data.identifier;
      if (!(await withinRateLimit(request, "login", 8, 900, identifier))) return Response.json({ error: "Trop de tentatives. Réessayez dans 15 minutes." }, { status: 429 });
      const [user] = await db.select().from(users).where(or(eq(users.email, identifier.toLowerCase()), eq(users.phone, identifier))).limit(1);
      if (!user || !user.isActive || !(await compare(parsed.data.password, user.passwordHash))) return Response.json({ error: "Identifiants incorrects ou compte indisponible." }, { status: 401 });

      if (user.mustChangePassword && user.role === "patient") {
        return Response.json({ needsPasswordChange: true, role: user.role, challenge: createSignedToken(user.id, "password-change"), message: "Choisissez votre mot de passe personnel pour activer le compte." }, { headers: responseHeaders });
      }

      if (privilegedRoles.includes(user.role)) {
        if (user.mustChangePassword && !user.twoFactorEnrolledAt) {
          const secretHex = randomBytes(20).toString("hex");
          await db.update(users).set({ twoFactorSecret: encryptValue(secretHex), twoFactorEnrolledAt: null, lastTotpCounter: null }).where(eq(users.id, user.id));
          return Response.json({ needs2FASetup: true, challenge: createSignedToken(user.id, "2fa-setup"), setupSecret: totpBase32(secretHex), otpauthUrl: otpauthUrl(user.email, secretHex), message: "Configurez votre application d'authentification avant la première connexion." }, { headers: responseHeaders });
        }
        if (!user.twoFactorSecret || !user.twoFactorEnrolledAt) return Response.json({ error: "La double authentification doit être configurée pour ce compte." }, { status: 403 });
        return Response.json({ needs2FA: true, challenge: createSignedToken(user.id, "2fa"), message: "Saisissez le code de votre application d'authentification." }, { headers: responseHeaders });
      }

      await setSession(user.id);
      await db.insert(auditLogs).values({ userId: user.id, action: "Connexion", resource: "Espace patient" });
      return Response.json({ user: publicUser(user), message: "Connexion réussie." }, { headers: responseHeaders });
    }

    if (action === "verify2fa") {
      const challenge = String(body.challenge || "");
      if (!(await withinRateLimit(request, "verify2fa", 6, 300, challenge))) return Response.json({ error: "Trop de codes incorrects. Recommencez dans quelques minutes." }, { status: 429 });
      let purpose: TokenPurpose = "2fa";
      let userId = verifySignedToken(challenge, "2fa");
      if (!userId) { purpose = "2fa-setup"; userId = verifySignedToken(challenge, "2fa-setup"); }
      if (!userId) return Response.json({ error: "Vérification expirée. Recommencez la connexion." }, { status: 401 });
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user?.isActive || !user.twoFactorSecret) return Response.json({ error: "Code de vérification incorrect." }, { status: 401 });
      if (purpose === "2fa-setup" && (!user.mustChangePassword || user.twoFactorEnrolledAt)) return Response.json({ error: "Configuration invalide." }, { status: 401 });
      if (purpose === "2fa" && !user.twoFactorEnrolledAt) return Response.json({ error: "La double authentification n'est pas encore configurée." }, { status: 401 });
      const counter = verifyTotpCounter(decryptValue(user.twoFactorSecret), String(body.code || ""));
      if (counter === null) return Response.json({ error: "Code de vérification incorrect." }, { status: 401 });
      const [updated] = purpose === "2fa-setup"
        ? await db.update(users).set({ twoFactorEnrolledAt: new Date(), lastTotpCounter: counter }).where(and(eq(users.id, user.id), isNull(users.twoFactorEnrolledAt), eq(users.mustChangePassword, true))).returning({ id: users.id })
        : await db.update(users).set({ lastTotpCounter: counter }).where(and(eq(users.id, user.id), or(isNull(users.lastTotpCounter), lt(users.lastTotpCounter, counter)))).returning({ id: users.id });
      if (!updated) return Response.json({ error: "Ce code a déjà été utilisé. Attendez le prochain code." }, { status: 401 });
      if (user.mustChangePassword) return Response.json({ needsPasswordChange: true, role: user.role, challenge: createSignedToken(user.id, "password-change"), message: "Double authentification configurée. Choisissez maintenant votre mot de passe personnel." }, { headers: responseHeaders });
      await setSession(user.id, true);
      await db.insert(auditLogs).values({ userId: user.id, action: "Connexion 2FA", resource: `Espace ${user.role}`, details: "Code temporaire vérifié" });
      return Response.json({ user: publicUser(user), message: "Connexion sécurisée réussie." }, { headers: responseHeaders });
    }

    if (action === "completePasswordChange") {
      if (!(await withinRateLimit(request, "password-change", 6, 300, String(body.challenge || "")))) return Response.json({ error: "Trop de tentatives. Réessayez dans quelques minutes." }, { status: 429 });
      const parsed = passwordChangeSchema.safeParse(body);
      if (!parsed.success || parsed.data.newPassword !== parsed.data.confirmPassword) return Response.json({ error: "Les mots de passe doivent correspondre et contenir au moins 12 caractères." }, { status: 400 });
      const userId = verifySignedToken(parsed.data.challenge, "password-change");
      if (!userId) return Response.json({ error: "Session de configuration expirée. Recommencez la connexion." }, { status: 401 });
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user?.isActive || !user.mustChangePassword) return Response.json({ error: "Ce compte ne nécessite plus de changement initial." }, { status: 400 });
      if (privilegedRoles.includes(user.role) && !user.twoFactorEnrolledAt) return Response.json({ error: "Configurez d'abord la double authentification." }, { status: 403 });
      if (user.role === "patient" && parsed.data.privacyConsent !== true) return Response.json({ error: "Vous devez accepter la politique de confidentialité." }, { status: 400 });
      if (await compare(parsed.data.newPassword, user.passwordHash)) return Response.json({ error: "Le nouveau mot de passe doit être différent du mot de passe temporaire." }, { status: 400 });
      const [updated] = await db.update(users).set({ passwordHash: await hash(parsed.data.newPassword, 12), mustChangePassword: false, passwordChangedAt: new Date(), ...(user.role === "patient" ? { privacyAcceptedAt: new Date() } : {}) }).where(and(eq(users.id, user.id), eq(users.mustChangePassword, true))).returning();
      if (!updated) return Response.json({ error: "Le compte a déjà été activé." }, { status: 409 });
      await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, user.id));
      await setSession(user.id, privilegedRoles.includes(user.role));
      await db.insert(auditLogs).values({ userId: user.id, action: "Activation du compte", resource: "Mot de passe personnel et sécurité", details: "Mot de passe temporaire remplacé" });
      return Response.json({ user: publicUser(updated), message: "Votre compte est activé et sécurisé." }, { headers: responseHeaders });
    }

    if (action === "requestAccess") {
      if (!(await withinRateLimit(request, "access-request", 5, 3600))) return Response.json({ error: "Trop de demandes. Réessayez plus tard." }, { status: 429 });
      const role = String(body.role || ""); const applicantName = String(body.applicantName || "").trim(); const email = String(body.email || "").trim().toLowerCase();
      if (!["doctor", "hospital"].includes(role) || applicantName.length < 2 || !z.email().safeParse(email).success) return Response.json({ error: "Veuillez compléter les informations requises." }, { status: 400 });
      if (role === "doctor" && String(body.licenseNumber || "").trim().length < 3) return Response.json({ error: "Le numéro d'ordre / licence est requis pour un médecin." }, { status: 400 });
      const [existing] = await db.select().from(accessRequests).where(and(eq(accessRequests.email, email), eq(accessRequests.status, "en attente"))).limit(1);
      if (existing) return Response.json({ error: "Une demande est déjà en cours pour cette adresse." }, { status: 409 });
      await db.insert(accessRequests).values({ applicantName, email, phone: String(body.phone || ""), role, organization: String(body.organization || ""), specialty: String(body.specialty || ""), licenseNumber: String(body.licenseNumber || "") || null });
      return Response.json({ message: "Demande reçue. Un contrôle humain est nécessaire avant l'activation." }, { status: 201 });
    }

    if (action === "me") { const user = await getSessionUser(); return Response.json({ user: user ? publicUser(user) : null }, { headers: responseHeaders }); }
    return Response.json({ error: "Action inconnue." }, { status: 400 });
  } catch (error) { console.error("Auth error", error); return Response.json({ error: "Une erreur est survenue. Réessayez." }, { status: 500 }); }
}
