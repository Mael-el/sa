import { eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, medicalDocuments } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { decryptValue } from "@/lib/crypto";
import { hasCareConsent } from "@/lib/security";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const current = await getSessionUser();
  if (!current) return Response.json({ error: "Connexion requise." }, { status: 401 });
  const { id } = await context.params;
  if (!Number.isInteger(Number(id)) || Number(id) < 1) return Response.json({ error: "Document invalide." }, { status: 400 });
  const [document] = await db.select().from(medicalDocuments).where(eq(medicalDocuments.id, Number(id))).limit(1);
  if (!document) return Response.json({ error: "Document introuvable." }, { status: 404 });
  if (!(await hasCareConsent(current, document.patientId))) return Response.json({ error: "Consentement nécessaire pour consulter ce document." }, { status: 403 });
  await db.insert(auditLogs).values({ userId: current.id, action: "Téléchargement de document", resource: `Document #${document.id}`, details: "Accès autorisé" });
  const bytes = Buffer.from(decryptValue(document.data), "base64");
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": document.mimeType, "Content-Disposition": `attachment; filename="${document.fileName}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
