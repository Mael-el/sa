import { eq } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { db } from "@/db";
import { appointments, auditLogs, doctors, hospitals, medicalRecords, payments, prescriptions, users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { hasCareConsent } from "@/lib/security";

export const dynamic = "force-dynamic";

const safe = (text: unknown) => String(text ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "-");
const date = (value: Date) => new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long", year: "numeric" }).format(value);

export async function GET(request: Request) {
  const current = await getSessionUser();
  if (!current) return Response.json({ error: "Connexion requise." }, { status: 401 });
  const url = new URL(request.url);
  const kind = url.searchParams.get("type") || "dossier";
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595, 842]);
  let y = 768;
  const line = (value: unknown, size = 11, isBold = false, gap = 20) => {
    const text = safe(value);
    const words = text.split(" ");
    let currentLine = "";
    const segments: string[] = [];
    for (const word of words) {
      const next = currentLine ? `${currentLine} ${word}` : word;
      if ((isBold ? bold : regular).widthOfTextAtSize(next, size) > 480 && currentLine) { segments.push(currentLine); currentLine = word; }
      else currentLine = next;
    }
    if (currentLine) segments.push(currentLine);
    for (const segment of segments) {
      if (y < 75) { page = pdf.addPage([595, 842]); y = 770; }
      page.drawText(segment, { x: 55, y, size, font: isBold ? bold : regular, color: rgb(0.11, 0.2, 0.26) });
      y -= gap;
    }
  };
  const title = (value: string) => { line(value, 18, true, 29); y -= 6; };
  const section = (value: string) => { y -= 14; line(value, 13, true, 25); };
  line("SANTE+  /  BENIN", 13, true, 32);
  line("Document confidentiel - usage medical uniquement", 9, false, 32);
  page.drawLine({ start: { x: 55, y: y + 12 }, end: { x: 540, y: y + 12 }, thickness: 1, color: rgb(0.16, 0.7, 0.62) });

  if (kind === "dossier") {
    const patientId = current.role === "patient" ? current.id : Number(url.searchParams.get("patientId"));
    if (!Number.isInteger(patientId) || !["patient", "doctor", "hospital"].includes(current.role)) return Response.json({ error: "Accès refusé." }, { status: 403 });
    const [patient] = await db.select().from(users).where(eq(users.id, patientId)).limit(1);
    if (!patient || patient.role !== "patient") return Response.json({ error: "Patient introuvable." }, { status: 404 });
    if (!(await hasCareConsent(current, patientId))) return Response.json({ error: "Consentement requis pour cet export." }, { status: 403 });
    // A valid explicit care grant is sufficient, even without a booked appointment.
    if (current.role === "doctor") {
      const [doctor] = await db.select().from(doctors).where(eq(doctors.userId, current.id)).limit(1);
      if (!doctor) return Response.json({ error: "Accès refusé." }, { status: 403 });
    }
    title("Dossier medical du patient");
    line(`Patient : ${patient.fullName}    NPI : ${patient.npi || "Non renseigne"}`);
    line(`Groupe sanguin : ${patient.bloodGroup || "Non renseigne"}    Ville : ${patient.city || "-"}`);
    line(`Edition du ${date(new Date())}`);
    const records = await db.select().from(medicalRecords).where(eq(medicalRecords.patientId, patientId));
    const scripts = await db.select().from(prescriptions).where(eq(prescriptions.patientId, patientId));
    section("HISTORIQUE MEDICAL");
    for (const item of records.sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())) {
      line(`${date(item.recordedAt)} - ${item.title}`, 11, true);
      line(item.description);
      if (item.details) line(item.details, 10);
      y -= 5;
    }
    section("ORDONNANCES");
    for (const script of scripts) {
      line(`${date(script.createdAt)} - ${script.diagnosis}`, 11, true);
      script.medications.forEach((med) => line(`${med.name} ${med.dosage} - ${med.frequency} - ${med.duration}`, 10));
      y -= 5;
    }
    if (!records.length && !scripts.length) line("Aucune information medicale enregistree.");
  } else if (kind === "prescription") {
    const [script] = await db.select().from(prescriptions).where(eq(prescriptions.id, Number(url.searchParams.get("id")))).limit(1);
    if (!script || (current.role === "patient" && script.patientId !== current.id) || !["patient", "doctor", "hospital"].includes(current.role)) return Response.json({ error: "Ordonnance inaccessible." }, { status: 403 });
    if (!(await hasCareConsent(current, script.patientId))) return Response.json({ error: "Consentement requis pour cette ordonnance." }, { status: 403 });
    if (current.role === "doctor") { const [doctor] = await db.select().from(doctors).where(eq(doctors.userId, current.id)).limit(1); if (!doctor || doctor.id !== script.doctorId) return Response.json({ error: "Accès refusé." }, { status: 403 }); }
    if (current.role === "hospital" && script.hospitalId !== current.hospitalId) return Response.json({ error: "Accès refusé." }, { status: 403 });
    const [patient] = await db.select().from(users).where(eq(users.id, script.patientId)).limit(1);
    const [doctor] = await db.select().from(doctors).where(eq(doctors.id, script.doctorId)).limit(1);
    const [prescriber] = doctor ? await db.select().from(users).where(eq(users.id, doctor.userId)).limit(1) : [];
    title("Ordonnance medicale");
    line(`Date : ${date(script.createdAt)}`);
    line(`Patient : ${patient?.fullName || "-"}    NPI : ${patient?.npi || "-"}`);
    line(`Prescripteur : ${prescriber?.fullName || "-"}`);
    section("DIAGNOSTIC");
    line(script.diagnosis);
    section("TRAITEMENT PRESCRIT");
    script.medications.forEach((med, index) => { line(`${index + 1}. ${med.name} - ${med.dosage}`, 11, true); line(`${med.frequency} pendant ${med.duration}`, 10); y -= 5; });
    if (script.notes) { section("CONSEILS"); line(script.notes); }
  } else if (kind === "report") {
    if (!["hospital", "admin"].includes(current.role)) return Response.json({ error: "Accès refusé." }, { status: 403 });
    const [allHospitals, allAppointments, allPayments, allUsers] = await Promise.all([db.select().from(hospitals), db.select().from(appointments), db.select().from(payments), db.select().from(users)]);
    const scopedAppointments = current.role === "hospital" ? allAppointments.filter((item) => item.hospitalId === current.hospitalId) : allAppointments;
    const scopedPayments = current.role === "hospital" ? allPayments.filter((item) => item.hospitalId === current.hospitalId) : allPayments;
    title(current.role === "admin" ? "Rapport national SANTE+" : "Rapport d'activite hospitaliere");
    line(`Date d'edition : ${date(new Date())}`);
    section("INDICATEURS CLES");
    line(`Etablissements partenaires : ${current.role === "admin" ? allHospitals.length : 1}`);
    line(`Patients suivis : ${current.role === "admin" ? allUsers.filter((item) => item.role === "patient").length : new Set(scopedAppointments.map((item) => item.patientId)).size}`);
    line(`Consultations et rendez-vous : ${scopedAppointments.length}`);
    line(`Paiements enregistres : ${scopedPayments.filter((item) => item.status === "payé").length}`);
    line(`Revenus encaisses : ${scopedPayments.filter((item) => item.status === "payé").reduce((sum, item) => sum + item.amount, 0).toLocaleString("fr-FR")} FCFA`);
    section("ETABLISSEMENTS");
    allHospitals.filter((item) => current.role === "admin" || item.id === current.hospitalId).forEach((item) => line(`${item.name} - ${item.city} - ${item.bedsOccupied}/${item.bedsTotal} lits occupes`));
    section("RENDEZ-VOUS RECENTS");
    scopedAppointments.slice(-12).reverse().forEach((item) => line(`${date(item.scheduledAt)} - ${item.reason} - ${item.status}`));
  } else return Response.json({ error: "Type d'export inconnu." }, { status: 400 });

  await db.insert(auditLogs).values({ userId: current.id, action: "Export PDF", resource: kind, details: "Document généré à la demande" });
  const bytes = await pdf.save();
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="santeplus-${kind}.pdf"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}