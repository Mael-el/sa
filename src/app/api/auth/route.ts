import { randomInt } from "node:crypto";
import { compare, hash } from "bcryptjs";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { accessRequests, auditLogs, notifications, platformSettings, sessions, users } from "@/db/schema";
import { clearSession, createSignedToken, getSessionUser, publicUser, revokeAllSessions, revokeOtherSessions, setSession, verifySignedToken } from "@/lib/auth";
import { RESET_TTL_MINUTES, consumeReset, findValidReset, issueResetCode } from "@/lib/password-reset";
import { passwordProblem, sameOrigin, withinRateLimit } from "@/lib/security";
import { sendPasswordResetCode, sendSecurityAlert } from "@/lib/mailer";

export const dynamic = "force-dynamic";
const credentialsSchema = z.object({ identifier: z.string().trim().min(3), password: z.string().min(1) });
const registerSchema = z.object({ fullName: z.string().trim().min(2).max(180), email: z.email().trim().toLowerCase(), phone: z.string().trim().min(8).max(40), password: z.string().min(12).max(128), bloodGroup: z.enum(["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"]).optional(), birthDate: z.iso.date().refine((date) => date <= new Date().toISOString().slice(0, 10), "La date de naissance ne peut pas être future.").optional(), city: z.string().trim().max(100).optional(), privacyConsent: z.literal(true) });
const passwordChangeSchema = z.object({ challenge: z.string().min(10), newPassword: z.string().min(12).max(128), confirmPassword: z.string().min(12).max(128), privacyConsent: z.boolean().optional() });
const responseHeaders = { "Cache-Control": "no-store" };
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
      const { fullName, email, phone, password, bloodGroup, birthDate, city } = parsed.data;
      const weakness = passwordProblem(password, { email, fullName });
      if (weakness) return Response.json({ error: weakness }, { status: 400 });
      const [existing] = await db.select({ id: users.id }).from(users).where(or(eq(users.email, email), eq(users.phone, phone))).limit(1);
      if (existing) return Response.json({ error: "Cet email ou ce numéro est déjà utilisé." }, { status: 409 });
      const npi = `SP-${new Date().getFullYear()}-${randomInt(100000, 999999)}`;
      const [user] = await db.insert(users).values({ fullName, email, phone, passwordHash: await hash(password, 12), role: "patient", npi, bloodGroup: bloodGroup || null, birthDate: birthDate || null, city: city || "Cotonou", mustChangePassword: false, privacyAcceptedAt: new Date(), passwordChangedAt: new Date() }).returning();
      const sessionToken = await setSession(user.id);
      await db.insert(auditLogs).values({ userId: user.id, action: "Consentement et création de compte", resource: "Politique de confidentialité v1", details: "Acceptation explicite lors de l'inscription" });
      return Response.json({ user: publicUser(user), sessionToken, message: "Bienvenue sur SANTÉ+ ! Votre identité santé a été créée." }, { status: 201, headers: responseHeaders });
    }

    if (action === "requestPasswordReset") {
      const identifier = String(body.identifier || "").trim();
      const generic = { message: "Si un compte correspond à ces informations, une demande de réinitialisation a été transmise. L'administration vous remettra un code après vérification de votre identité." };
      if (identifier.length < 3) return Response.json(generic, { headers: responseHeaders });
      if (!(await withinRateLimit(request, "reset-request", 4, 3600, identifier.toLowerCase()))) return Response.json({ error: "Trop de demandes. Réessayez dans une heure." }, { status: 429 });
      const [user] = await db.select().from(users).where(or(eq(users.email, identifier.toLowerCase()), eq(users.phone, identifier))).limit(1);
      // Réponse identique dans tous les cas : impossible d'énumérer les comptes existants.
      if (!user || !user.isActive) return Response.json(generic, { headers: responseHeaders });
      const reset = await issueResetCode(user.id, "auto");
      // Si un transport est configuré, le patient reçoit son code directement et
      // n'a plus à attendre qu'un administrateur le lui transmette. Sans
      // transport, le comportement d'origine est conservé (remise humaine).
      const mailed = await sendPasswordResetCode({ to: user.email, fullName: user.fullName, code: reset.code, minutes: RESET_TTL_MINUTES });
      const admins = mailed.sent ? [] : await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
      if (admins.length) {
        await db.insert(notifications).values(admins.map((admin) => ({
          userId: admin.id,
          title: "Demande de réinitialisation",
          message: `${user.fullName} (${user.email}) demande une réinitialisation de mot de passe. Vérifiez son identité puis générez un code depuis Utilisateurs.`,
          category: "securite",
        })));
      }
      await db.insert(auditLogs).values({
        userId: user.id,
        action: "Demande de réinitialisation",
        resource: "Mot de passe",
        details: `${RESET_TTL_MINUTES} minutes · canal : ${mailed.sent ? "email" : `remise administrative${mailed.reason ? ` (${mailed.reason})` : ""}`}`,
      });
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
      // Alerte envoyée sans bloquer la réponse : c'est le signal qui permet de
      // détecter une prise de contrôle de compte. Aucun mot de passe n'y figure.
      await sendSecurityAlert({
        to: current.email,
        fullName: current.fullName,
        message: "Le mot de passe de votre compte SANTÉ+ vient d'être modifié, et vos autres sessions ont été fermées.",
      }).catch(() => {});
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

      if (user.mustChangePassword) {
        return Response.json({ needsPasswordChange: true, role: user.role, challenge: createSignedToken(user.id, "password-change"), message: "Choisissez votre mot de passe personnel pour activer le compte." }, { headers: responseHeaders });
      }

      const sessionToken = await setSession(user.id);
      await db.insert(auditLogs).values({ userId: user.id, action: "Connexion", resource: `Espace ${user.role}` });
      return Response.json({ user: publicUser(user), sessionToken, message: "Connexion réussie." }, { headers: responseHeaders });
    }

    if (action === "completePasswordChange") {
      if (!(await withinRateLimit(request, "password-change", 6, 300, String(body.challenge || "")))) return Response.json({ error: "Trop de tentatives. Réessayez dans quelques minutes." }, { status: 429 });
      const parsed = passwordChangeSchema.safeParse(body);
      if (!parsed.success || parsed.data.newPassword !== parsed.data.confirmPassword) return Response.json({ error: "Les mots de passe doivent correspondre et contenir au moins 12 caractères." }, { status: 400 });
      const userId = verifySignedToken(parsed.data.challenge, "password-change");
      if (!userId) return Response.json({ error: "Session de configuration expirée. Recommencez la connexion." }, { status: 401 });
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user?.isActive || !user.mustChangePassword) return Response.json({ error: "Ce compte ne nécessite plus de changement initial." }, { status: 400 });
      if (user.role === "patient" && parsed.data.privacyConsent !== true) return Response.json({ error: "Vous devez accepter la politique de confidentialité." }, { status: 400 });
      if (await compare(parsed.data.newPassword, user.passwordHash)) return Response.json({ error: "Le nouveau mot de passe doit être différent du mot de passe temporaire." }, { status: 400 });
      const [updated] = await db.update(users).set({ passwordHash: await hash(parsed.data.newPassword, 12), mustChangePassword: false, passwordChangedAt: new Date(), ...(user.role === "patient" ? { privacyAcceptedAt: new Date() } : {}) }).where(and(eq(users.id, user.id), eq(users.mustChangePassword, true))).returning();
      if (!updated) return Response.json({ error: "Le compte a déjà été activé." }, { status: 409 });
      await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, user.id));
      const sessionToken = await setSession(user.id);
      await db.insert(auditLogs).values({ userId: user.id, action: "Activation du compte", resource: "Mot de passe personnel", details: "Mot de passe temporaire remplacé" });
      return Response.json({ user: publicUser(updated), sessionToken, message: "Votre compte est activé." }, { headers: responseHeaders });
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
