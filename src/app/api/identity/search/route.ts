import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { accessRequests, appointments, auditLogs, doctors, hospitals, users } from "@/db/schema";
import { getSessionUser, publicUser } from "@/lib/auth";
import { hasCareConsent, withinRateLimit } from "@/lib/security";

export const dynamic = "force-dynamic";

/**
 * Recherche d'une identité santé par NPI, nom ou téléphone.
 *
 * Trois niveaux de réponse, du plus large au plus restreint :
 *
 * 1. `introuvable` — aucune correspondance.
 * 2. `fiche` — identité minimale : nom, NPI, ville. Aucun contact, aucune donnée
 *    de santé. Accessible à tout professionnel autorisé (médecin, établissement,
 *    administration) : c'est ce qui permet de confirmer qu'un NPI existe, sans
 *    révéler à qui il appartient au-delà du nécessaire.
 * 3. `dossier` — dossier médical complet. Uniquement si le patient a accordé un
 *    consentement de soins valide, ou s'il s'agit de son propre dossier, ou si
 *    l'administration agit dans le cadre d'une demande de droits en cours
 *    (accès justifié, journalisé, sans donnée clinique).
 *
 * L'administration ne voit jamais le contenu clinique en libre-service : elle
 * n'a accès qu'aux métadonnées administratives, et seulement dans le cadre d'une
 * demande d'exercice de droits.
 */
export async function GET(request: Request) {
  const current = await getSessionUser();
  if (!current) return Response.json({ error: "Connexion requise." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  if (!["patient", "doctor", "hospital", "admin"].includes(current.role)) {
    return Response.json({ error: "Accès refusé." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  if (!(await withinRateLimit(request, "identity-search", 60, 60, String(current.id)))) {
    return Response.json({ error: "Trop de recherches en peu de temps. Réessayez dans une minute." }, { status: 429, headers: { "Cache-Control": "no-store" } });
  }

  const query = (new URL(request.url).searchParams.get("q") || "").trim();
  if (query.length < 3) {
    return Response.json({ error: "Saisissez au moins 3 caractères (NPI, nom ou téléphone)." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  if (query.length > 80) {
    return Response.json({ error: "Recherche trop longue." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const like = `%${query.replace(/[%_\\]/g, (character) => `\\${character}`)}%`;

  const found = await db.select().from(users).where(and(
    query.toUpperCase().includes("SP-") ? eq(users.role, "patient") : undefined,
    or(ilike(users.npi, like), ilike(users.fullName, like), ilike(users.phone, like), ilike(users.email, like)),
  )).limit(20);

  if (!found.length) {
    await db.insert(auditLogs).values({
      userId: current.id,
      action: "Recherche d'identité",
      resource: query.slice(0, 40),
      details: "Aucune correspondance",
    });
    return Response.json({ results: [] }, { headers: { "Cache-Control": "private, no-store" } });
  }

  // Le patient ne peut retrouver que sa propre identité.
  const visible = current.role === "patient" ? found.filter((user) => user.id === current.id) : found;

  const results = [];
  for (const target of visible) {
    const [doctor] = target.role === "doctor"
      ? await db.select({ id: doctors.id, specialty: doctors.specialty, hospitalId: doctors.hospitalId, status: doctors.status, licenseNumber: doctors.licenseNumber, yearsExperience: doctors.yearsExperience }).from(doctors).where(eq(doctors.userId, target.id)).limit(1)
      : [];
    const [hospital] = target.hospitalId
      ? await db.select({ id: hospitals.id, name: hospitals.name, shortName: hospitals.shortName, city: hospitals.city }).from(hospitals).where(eq(hospitals.id, target.hospitalId)).limit(1)
      : [];

    // Niveau 2 : identité minimale, sans coordonnées personnelles.
    const identity = {
      id: target.id,
      fullName: target.fullName,
      npi: target.npi,
      role: target.role,
      city: target.city,
      hospital: hospital ? { id: hospital.id, name: hospital.name, shortName: hospital.shortName, city: hospital.city } : null,
      doctor: doctor || null,
      isActive: target.isActive,
    };

    // Niveau 3 : dossier, seulement si le consentement le permet.
    let access: "dossier" | "fiche" | "refus" = "fiche";
    let reason = "Consentement de soins requis pour ouvrir le dossier.";
    let dossier = null;

    if (current.role === "patient") {
      access = "dossier";
      reason = "Votre propre dossier.";
    } else if (target.role === "patient" && await hasCareConsent(current, target.id)) {
      access = "dossier";
      reason = "Consentement de soins valide.";
    } else if (current.role === "admin" && target.role === "patient") {
      // L'administration n'ouvre un dossier que sur demande de droits en cours,
      // et n'obtient jamais le contenu clinique.
      const [pending] = await db.select({ id: accessRequests.id }).from(accessRequests)
        .where(and(eq(accessRequests.email, target.email || ""), eq(accessRequests.status, "en attente"))).limit(1);
      access = pending ? "dossier" : "fiche";
      reason = pending
        ? "Accès administratif : demande de droits en cours. Aucun contenu clinique n'est transmis."
        : "Aucune demande de droits en cours : seule la fiche administrative est accessible.";
    } else if (target.role === "patient") {
      access = "refus";
      reason = "Ce patient n'a pas accordé de consentement de soins à votre structure.";
    }

    if (access === "dossier") {
      const [appointmentCount] = await db.select({ count: sql<number>`count(*)::int` }).from(appointments).where(eq(appointments.patientId, target.id));
      dossier = {
        appointments: appointmentCount?.count ?? 0,
        // Le détail clinique reste servi par /api/patient/[id], qui revérifie le
        // consentement et journalise l'accès : la recherche ne le duplique pas.
        detailUrl: `/api/patient/${target.id}`,
      };
    }

    results.push({ ...identity, access, reason, dossier });
  }

  if (current.role !== "patient") {
    await db.insert(auditLogs).values({
      userId: current.id,
      action: "Recherche d'identité",
      resource: query.slice(0, 40),
      details: `${results.length} résultat(s) · ${results.filter((item) => item.access === "dossier").length} dossier(s) accessible(s)`,
    });
  }

  return Response.json({ results }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST() {
  return Response.json({ error: "Méthode non autorisée." }, { status: 405 });
}
