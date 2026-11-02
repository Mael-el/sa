import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, doctors, medicalDocuments, medicalRecords, notifications, users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { encryptValue } from "@/lib/crypto";
import { hasCareConsent, sameOrigin, withinRateLimit } from "@/lib/security";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origine non autorisée." }, { status: 403 });
  try {
    const current = await getSessionUser();
    if (!current || current.role !== "doctor") return Response.json({ error: "Accès réservé aux médecins authentifiés." }, { status: 403 });
    if (!(await withinRateLimit(request, "upload", 30, 3600, String(current.id)))) return Response.json({ error: "Limite d'envoi atteinte. Réessayez plus tard." }, { status: 429 });
    const [doctor] = await db.select().from(doctors).where(eq(doctors.userId, current.id)).limit(1);
    if (!doctor || doctor.status !== "actif") return Response.json({ error: "Compte médecin non autorisé." }, { status: 403 });
    const form = await request.formData(); const file = form.get("file"); const patientId = Number(form.get("patientId"));
    const title = String(form.get("title") || "").trim().slice(0, 180); const category = String(form.get("category") || "analyse");
    const [patient] = await db.select().from(users).where(and(eq(users.id, patientId), eq(users.role, "patient"))).limit(1);
    if (!patient || !(file instanceof File) || title.length < 3 || !["analyse", "imagerie", "autre"].includes(category)) return Response.json({ error: "Patient, titre ou fichier invalide." }, { status: 400 });
    if (!(await hasCareConsent(current, patientId))) return Response.json({ error: "Consentement du patient requis pour ce document." }, { status: 403 });
    if (file.size > 5 * 1024 * 1024 || file.size === 0 || !["application/pdf", "image/png", "image/jpeg"].includes(file.type)) return Response.json({ error: "PDF, PNG ou JPG de moins de 5 Mo requis." }, { status: 400 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const valid = file.type === "application/pdf" ? bytes.subarray(0, 5).toString() === "%PDF-" : file.type === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (!valid) return Response.json({ error: "Le contenu du fichier ne correspond pas au format déclaré." }, { status: 400 });
    const name = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 190);
    await db.insert(medicalDocuments).values({ patientId, doctorId: doctor.id, title, category, fileName: name, mimeType: file.type, data: encryptValue(bytes.toString("base64")) });
    await db.insert(medicalRecords).values({ patientId, doctorId: doctor.id, hospitalId: doctor.hospitalId, category, title, description: "Document ajouté au dossier médical.", details: name });
    await db.insert(notifications).values({ userId: patientId, title: "Nouveau document médical", message: `Le document « ${title} » est disponible dans votre dossier.`, category: "dossier" });
    await db.insert(auditLogs).values({ userId: current.id, action: "Ajout de document", resource: `Patient ${patient.npi || patient.id}`, details: `Document #${name}` });
    return Response.json({ message: "Document chiffré, enregistré et transmis au patient." });
  } catch (error) { console.error("Document upload error", error); return Response.json({ error: "Impossible d'envoyer ce document." }, { status: 500 }); }
}
