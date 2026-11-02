import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appointments, auditLogs, careConsents, medicalDocuments, medicalRecords, payments, prescriptions } from "@/db/schema";
import { getSessionUser, publicUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== "patient") return Response.json({ error: "Accès réservé au patient." }, { status: 403 });
  const [records, scripts, visits, bills, grants, documents] = await Promise.all([
    db.select().from(medicalRecords).where(eq(medicalRecords.patientId, user.id)),
    db.select().from(prescriptions).where(eq(prescriptions.patientId, user.id)),
    db.select().from(appointments).where(eq(appointments.patientId, user.id)),
    db.select().from(payments).where(eq(payments.patientId, user.id)),
    db.select().from(careConsents).where(eq(careConsents.patientId, user.id)),
    db.select({ id: medicalDocuments.id, title: medicalDocuments.title, fileName: medicalDocuments.fileName, createdAt: medicalDocuments.createdAt }).from(medicalDocuments).where(eq(medicalDocuments.patientId, user.id)),
  ]);
  await db.insert(auditLogs).values({ userId: user.id, action: "Export de données", resource: "Portabilité des données", details: "Export JSON demandé par le patient" });
  return Response.json({ exportedAt: new Date().toISOString(), patient: publicUser(user), medicalRecords: records, prescriptions: scripts, appointments: visits, payments: bills, consents: grants, documents }, { headers: { "Content-Disposition": `attachment; filename="santeplus-mes-donnees-${user.id}.json"`, "Cache-Control": "private, no-store" } });
}
