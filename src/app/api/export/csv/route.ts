import { asc, desc } from "drizzle-orm";
import { db } from "@/db";
import { accessRequests, appointments, auditLogs, careConsents, doctors, hospitals, payments, users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Export CSV destiné à l'administration nationale.
 *
 * Choix assumés :
 * - Aucune donnée clinique n'est exportée ici (ni observation, ni ordonnance, ni diagnostic).
 *   Ces contenus relèvent du dossier médical et restent soumis au consentement de soins.
 * - Le séparateur est le point-virgule et le fichier commence par un BOM UTF-8 : c'est ce
 *   qu'attend Excel en configuration francophone pour ouvrir directement les colonnes.
 * - Chaque export est journalisé dans le journal d'audit.
 */

type Column = { header: string; value: (row: Record<string, unknown>) => unknown };

const dateTime = (value: unknown) => {
  if (!value) return "";
  const date = new Date(value as string | Date);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(date);
};

/**
 * Neutralise l'injection de formules (CSV injection).
 *
 * Une cellule commençant par =, @, tabulation ou retour chariot est toujours préfixée.
 * Pour + et -, on ne préfixe que si la valeur n'est pas un simple numéro de téléphone
 * ou un montant signé : sans cette nuance, "+229 97 55 44 33" devenait "'+229 97...".
 */
function cell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  const startsRisky = /^[=@\t\r]/.test(text);
  const signedButNotNumeric = /^[+\-]/.test(text) && !/^[+\-][\d\s().\-\/]*$/.test(text);
  const guarded = startsRisky || signedButNotNumeric ? `'${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
}

function toCsv(columns: Column[], rows: Record<string, unknown>[]) {
  const lines = [columns.map((column) => cell(column.header)).join(";")];
  for (const row of rows) lines.push(columns.map((column) => cell(column.value(row))).join(";"));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

const DEFS: Record<string, { label: string; load: () => Promise<Record<string, unknown>[]>; columns: Column[] }> = {
  utilisateurs: {
    label: "utilisateurs",
    load: async () => {
      const [allUsers, allHospitals] = await Promise.all([
        db.select().from(users).orderBy(asc(users.id)),
        db.select({ id: hospitals.id, shortName: hospitals.shortName }).from(hospitals),
      ]);
      const hospitalNames = new Map(allHospitals.map((hospital) => [hospital.id, hospital.shortName]));
      return allUsers.map((user) => ({ ...user, hospitalName: user.hospitalId ? hospitalNames.get(user.hospitalId) ?? "" : "" }));
    },
    columns: [
      { header: "Identifiant", value: (row) => row.id },
      { header: "Nom complet", value: (row) => row.fullName },
      { header: "Email", value: (row) => row.email },
      { header: "Téléphone", value: (row) => row.phone },
      { header: "Rôle", value: (row) => row.role },
      { header: "NPI", value: (row) => row.npi },
      { header: "Ville", value: (row) => row.city },
      { header: "Établissement", value: (row) => row.hospitalName },
      { header: "Actif", value: (row) => (row.isActive ? "oui" : "non") },
      { header: "Mot de passe à changer", value: (row) => (row.mustChangePassword ? "oui" : "non") },
      { header: "Créé le", value: (row) => dateTime(row.createdAt) },
    ],
  },
  paiements: {
    label: "paiements",
    load: async () => {
      const [allPayments, allUsers, allHospitals] = await Promise.all([
        db.select().from(payments).orderBy(desc(payments.createdAt)),
        db.select({ id: users.id, fullName: users.fullName }).from(users),
        db.select({ id: hospitals.id, shortName: hospitals.shortName }).from(hospitals),
      ]);
      const patients = new Map(allUsers.map((user) => [user.id, user.fullName]));
      const facilities = new Map(allHospitals.map((hospital) => [hospital.id, hospital.shortName]));
      return allPayments.map((payment) => ({
        ...payment,
        patientName: patients.get(payment.patientId) ?? "",
        hospitalName: facilities.get(payment.hospitalId) ?? "",
      }));
    },
    columns: [
      { header: "Référence", value: (row) => row.id },
      { header: "Patient", value: (row) => row.patientName },
      { header: "Établissement", value: (row) => row.hospitalName },
      { header: "Prestation", value: (row) => row.title },
      { header: "Montant (FCFA)", value: (row) => row.amount },
      { header: "Statut", value: (row) => row.status },
      { header: "Moyen de paiement", value: (row) => row.provider },
      { header: "Référence de règlement", value: (row) => row.reference },
      { header: "Date", value: (row) => dateTime(row.createdAt) },
    ],
  },
  audit: {
    label: "journal-audit",
    load: async () => {
      const [allLogs, allUsers] = await Promise.all([
        db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(5000),
        db.select({ id: users.id, fullName: users.fullName, role: users.role }).from(users),
      ]);
      const actors = new Map(allUsers.map((user) => [user.id, user]));
      return allLogs.map((log) => ({
        ...log,
        actorName: log.userId ? actors.get(log.userId)?.fullName ?? "Compte supprimé" : "Système",
        actorRole: log.userId ? actors.get(log.userId)?.role ?? "" : "",
      }));
    },
    columns: [
      { header: "Horodatage", value: (row) => dateTime(row.createdAt) },
      { header: "Acteur", value: (row) => row.actorName },
      { header: "Rôle", value: (row) => row.actorRole },
      { header: "Action", value: (row) => row.action },
      { header: "Ressource", value: (row) => row.resource },
      { header: "Détails", value: (row) => row.details },
    ],
  },
  demandes: {
    label: "demandes-acces",
    load: async () => db.select().from(accessRequests).orderBy(desc(accessRequests.createdAt)),
    columns: [
      { header: "Référence", value: (row) => row.id },
      { header: "Demandeur", value: (row) => row.applicantName },
      { header: "Email", value: (row) => row.email },
      { header: "Téléphone", value: (row) => row.phone },
      { header: "Rôle demandé", value: (row) => row.role },
      { header: "Organisation", value: (row) => row.organization },
      { header: "Spécialité", value: (row) => row.specialty },
      { header: "Numéro d'ordre", value: (row) => row.licenseNumber },
      { header: "Statut", value: (row) => row.status },
      { header: "Déposée le", value: (row) => dateTime(row.createdAt) },
      { header: "Examinée le", value: (row) => dateTime(row.reviewedAt) },
    ],
  },
  etablissements: {
    label: "etablissements",
    load: async () => {
      const [allHospitals, allDoctors] = await Promise.all([
        db.select().from(hospitals).orderBy(asc(hospitals.id)),
        db.select({ hospitalId: appointments.hospitalId }).from(appointments),
      ]);
      const counts = new Map<number, number>();
      for (const row of allDoctors) counts.set(row.hospitalId, (counts.get(row.hospitalId) ?? 0) + 1);
      return allHospitals.map((hospital) => ({ ...hospital, appointmentCount: counts.get(hospital.id) ?? 0 }));
    },
    columns: [
      { header: "Identifiant", value: (row) => row.id },
      { header: "Nom", value: (row) => row.name },
      { header: "Sigle", value: (row) => row.shortName },
      { header: "Type", value: (row) => row.type },
      { header: "Ville", value: (row) => row.city },
      { header: "Adresse", value: (row) => row.address },
      { header: "Téléphone", value: (row) => row.phone },
      { header: "Lits totaux", value: (row) => row.bedsTotal },
      { header: "Lits occupés", value: (row) => row.bedsOccupied },
      { header: "Actif", value: (row) => (row.isActive ? "oui" : "non") },
      { header: "Rendez-vous enregistrés", value: (row) => row.appointmentCount },
    ],
  },
  consentements: {
    label: "consentements",
    load: async () => {
      const [allConsents, allUsers, allDoctors] = await Promise.all([
        db.select().from(careConsents).orderBy(desc(careConsents.createdAt)).limit(5000),
        db.select({ id: users.id, fullName: users.fullName }).from(users),
        db.select({ id: doctors.id, userId: doctors.userId }).from(doctors),
      ]);
      const patients = new Map(allUsers.map((user) => [user.id, user.fullName]));
      const doctorUsers = new Map(allDoctors.map((doctor) => [doctor.id, patients.get(doctor.userId) ?? ""]));
      return allConsents.map((consent) => ({
        ...consent,
        patientName: patients.get(consent.patientId) ?? "",
        doctorName: consent.doctorId ? doctorUsers.get(consent.doctorId) ?? "" : "",
        active: !consent.revokedAt && new Date(consent.expiresAt).getTime() > Date.now() ? "oui" : "non",
      }));
    },
    columns: [
      { header: "Référence", value: (row) => row.id },
      { header: "Patient", value: (row) => row.patientName },
      { header: "Médecin", value: (row) => row.doctorName },
      { header: "Motif déclaré", value: (row) => row.purpose },
      { header: "Origine", value: (row) => row.source },
      { header: "Accordé le", value: (row) => dateTime(row.createdAt) },
      { header: "Expire le", value: (row) => dateTime(row.expiresAt) },
      { header: "Révoqué le", value: (row) => dateTime(row.revokedAt) },
      { header: "Actif", value: (row) => row.active },
    ],
  },
};

export async function GET(request: Request) {
  const current = await getSessionUser();
  if (!current) return Response.json({ error: "Connexion requise." }, { status: 401 });
  if (current.role !== "admin") return Response.json({ error: "Export réservé à l'administration." }, { status: 403 });

  const kind = new URL(request.url).searchParams.get("kind") || "";
  const definition = DEFS[kind];
  if (!definition) return Response.json({ error: "Type d'export inconnu.", available: Object.keys(DEFS) }, { status: 400 });

  const rows = await definition.load();
  const csv = toCsv(definition.columns, rows);
  const stamp = new Date().toISOString().slice(0, 10);

  await db.insert(auditLogs).values({
    userId: current.id,
    action: "Export CSV",
    resource: kind,
    details: `${rows.length} ligne(s) exportée(s)`,
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="santeplus-${definition.label}-${stamp}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
