import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { appointments, auditLogs, medicalDocuments, medicalRecords, prescriptions, users } from "@/db/schema";
import { getSessionUser, publicUser } from "@/lib/auth";
import { consentPermissions } from "@/lib/consents";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const current = await getSessionUser();
  if (!current) return Response.json({ error: "Connexion requise." }, { status: 401 });
  const { id } = await context.params;
  const patientId = Number(id);
  if (!Number.isInteger(patientId) || patientId < 1) return Response.json({ error: "Patient invalide." }, { status: 400 });
  const [patient] = await db.select().from(users).where(and(eq(users.id, patientId), eq(users.role, "patient"))).limit(1);
  if (!patient) return Response.json({ error: "Patient introuvable." }, { status: 404 });
  const permissions = await consentPermissions(current, patientId);
  if (!permissions.view) {
    if (current.role !== "patient") {
      await db.insert(auditLogs).values({ userId: current.id, action: "Accès refusé au dossier", resource: `Patient ${patient.npi || patient.id}`, details: permissions.reason.slice(0, 160) });
    }
    return Response.json({ error: `Accès refusé : ${permissions.reason}` }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const [records, scripts, patientAppointments, documents] = await Promise.all([
    db.select().from(medicalRecords).where(eq(medicalRecords.patientId, patientId)),
    db.select().from(prescriptions).where(eq(prescriptions.patientId, patientId)),
    db.select().from(appointments).where(eq(appointments.patientId, patientId)),
    permissions.viewDocuments
      ? db.select({ id: medicalDocuments.id, patientId: medicalDocuments.patientId, title: medicalDocuments.title, category: medicalDocuments.category, fileName: medicalDocuments.fileName, mimeType: medicalDocuments.mimeType, createdAt: medicalDocuments.createdAt }).from(medicalDocuments).where(eq(medicalDocuments.patientId, patientId))
      : Promise.resolve([]),
  ]);
  if (current.role !== "patient") {
    await db.insert(auditLogs).values({
      userId: current.id,
      action: "Consultation du dossier",
      resource: `Patient ${patient.npi || patient.id}`,
      details: `${permissions.reason}${permissions.viewDocuments ? "" : " · documents non autorisés"}`.slice(0, 200),
    });
  }
  return Response.json({
    patient: publicUser(patient), records, prescriptions: scripts, appointments: patientAppointments, documents,
    permissions: { canView: permissions.view, canModify: permissions.modify, canViewDocuments: permissions.viewDocuments },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
