import { hash } from "bcryptjs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { encryptValue } from "@/lib/crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accessRequests, appointments, auditLogs, bloodDonations, bloodStocks, careConsents, doctors, hospitalServices, hospitals, medicalDocuments, medicalRecords, notifications, payments, pharmacies, platformSettings, prescriptions, purchaseOrders, stockItems, users } from "@/db/schema";

const when = (days: number, hour = 10, minute = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date;
};

let seedPromise: Promise<void> | null = null;

export function ensureSeeded(): Promise<void> {
  if (process.env.ENABLE_DEMO_MODE !== "true") return Promise.resolve();
  if (!seedPromise) {
    seedPromise = seedDatabase().catch((error) => {
      seedPromise = null;
      throw error;
    });
  }
  return seedPromise;
}

async function seedDatabase() {
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, "aicha.demo@santeplus.bj")).limit(1);
  if (existing.length) return;

  const [cnhu, calavi, lagune, atinkanmey] = await db.insert(hospitals).values([
    { name: "Centre National Hospitalier Universitaire Hubert Koutoukou Maga", shortName: "CNHU-HKM", city: "Cotonou", address: "Avenue Jean-Paul II, Cotonou", phone: "+229 01 21 30 01 55", type: "Hôpital universitaire", latitude: 6.3668, longitude: 2.4233, bedsTotal: 420, bedsOccupied: 316 },
    { name: "Hôpital de Zone d'Abomey-Calavi", shortName: "HZ Abomey-Calavi", city: "Abomey-Calavi", address: "Route de Kpota, Abomey-Calavi", phone: "+229 01 21 36 00 42", type: "Hôpital public", latitude: 6.4498, longitude: 2.3551, bedsTotal: 180, bedsOccupied: 123 },
    { name: "Hôpital de la Mère et de l'Enfant Lagune", shortName: "HOMEL", city: "Cotonou", address: "Boulevard de la Marina, Cotonou", phone: "+229 01 21 31 49 37", type: "Hôpital spécialisé", latitude: 6.3527, longitude: 2.4305, bedsTotal: 210, bedsOccupied: 158 },
    { name: "Clinique Atinkanmey", shortName: "Clinique Atinkanmey", city: "Cotonou", address: "Quartier Cadjèhoun, Cotonou", phone: "+229 01 21 30 84 20", type: "Clinique privée", latitude: 6.3599, longitude: 2.3873, bedsTotal: 65, bedsOccupied: 38 },
  ]).returning();

  const passwordHash = await hash("Demo1234!", 10);
  const [aicha, david, nadia, clarisse, jean, fatou, manager, admin] = await db.insert(users).values([
    { fullName: "Aïcha Dossou", email: "aicha.demo@santeplus.bj", phone: "+22997184260", passwordHash, role: "patient", npi: "SP-2026-083721", bloodGroup: "O+", birthDate: "1995-04-18", city: "Cotonou", isDemo: true },
    { fullName: "David Adomou", email: "david.demo@santeplus.bj", phone: "+22996123458", passwordHash, role: "patient", npi: "SP-2026-052414", bloodGroup: "A+", birthDate: "1987-09-12", city: "Cotonou", isDemo: true },
    { fullName: "Nadia Sossa", email: "nadia.demo@santeplus.bj", phone: "+22994782145", passwordHash, role: "patient", npi: "SP-2026-065882", bloodGroup: "B+", birthDate: "2001-02-07", city: "Abomey-Calavi", isDemo: true },
    { fullName: "Dr. Clarisse Agossou", email: "medecin.demo@santeplus.bj", phone: "+22995917842", passwordHash, role: "doctor", city: "Cotonou", hospitalId: cnhu.id, twoFactorSecret: encryptValue("7f4d91e8a362cf5492f2e3c6832d06f910ab4c52"), isDemo: true },
    { fullName: "Dr. Jean Koffi", email: "jean.koffi@santeplus.bj", phone: "+22997841360", passwordHash, role: "doctor", city: "Cotonou", hospitalId: cnhu.id, twoFactorSecret: encryptValue("66a42ff7879a101bd4a726da0ed593b5e011ac88"), isDemo: true },
    { fullName: "Dr. Fatou Diallo", email: "fatou.diallo@santeplus.bj", phone: "+22991235876", passwordHash, role: "doctor", city: "Abomey-Calavi", hospitalId: calavi.id, twoFactorSecret: encryptValue("c56b028f17b9a4f86355f2ce25b559bc836a7996"), isDemo: true },
    { fullName: "Direction CNHU-HKM", email: "hopital.demo@santeplus.bj", phone: "+22921300155", passwordHash, role: "hospital", city: "Cotonou", hospitalId: cnhu.id, twoFactorSecret: encryptValue("ac129772186c15cde46a5ac8650d5bb8745b7e13"), isDemo: true },
    { fullName: "Aminata Ahouansou", email: "admin.demo@santeplus.bj", phone: "+22997654321", passwordHash, role: "admin", city: "Cotonou", twoFactorSecret: encryptValue("bf2759355cc038f4b8a7f19bb76072e8c9351561"), isDemo: true },
  ]).returning();

  const [drClarisse, drJean, drFatou] = await db.insert(doctors).values([
    { userId: clarisse.id, hospitalId: cnhu.id, specialty: "Cardiologie", licenseNumber: "ONMB-2021-0482", yearsExperience: 9 },
    { userId: jean.id, hospitalId: cnhu.id, specialty: "Médecine générale", licenseNumber: "ONMB-2018-0291", yearsExperience: 12 },
    { userId: fatou.id, hospitalId: calavi.id, specialty: "Pédiatrie", licenseNumber: "ONMB-2020-0658", yearsExperience: 7 },
  ]).returning();

  const [upcoming] = await db.insert(appointments).values([
    { patientId: aicha.id, doctorId: drClarisse.id, hospitalId: cnhu.id, scheduledAt: when(2, 9, 30), reason: "Suivi cardiologique", type: "Consultation de suivi", status: "confirmé" },
    { patientId: aicha.id, doctorId: drJean.id, hospitalId: cnhu.id, scheduledAt: when(8, 14, 0), reason: "Bilan de santé annuel", type: "Bilan de santé", status: "confirmé" },
    { patientId: aicha.id, doctorId: drClarisse.id, hospitalId: cnhu.id, scheduledAt: when(-35, 10, 0), reason: "Contrôle de tension", type: "Consultation", status: "terminé" },
    { patientId: david.id, doctorId: drClarisse.id, hospitalId: cnhu.id, scheduledAt: when(0, 9, 0), reason: "Douleurs thoraciques", type: "Consultation", status: "confirmé" },
    { patientId: nadia.id, doctorId: drClarisse.id, hospitalId: cnhu.id, scheduledAt: when(0, 11, 30), reason: "Suivi médical", type: "Consultation de suivi", status: "confirmé" },
    { patientId: david.id, doctorId: drClarisse.id, hospitalId: cnhu.id, scheduledAt: when(1, 15, 0), reason: "Résultats d'analyse", type: "Consultation", status: "confirmé" },
    { patientId: nadia.id, doctorId: drJean.id, hospitalId: cnhu.id, scheduledAt: when(-2, 9, 30), reason: "Consultation générale", type: "Consultation", status: "terminé" },
  ]).returning();

  await db.insert(medicalRecords).values([
    { patientId: aicha.id, doctorId: drClarisse.id, hospitalId: cnhu.id, category: "consultation", title: "Consultation de cardiologie", description: "Contrôle de routine et suivi de la tension artérielle.", details: "Tension : 12/8 · Fréquence cardiaque : 72 bpm. État général satisfaisant.", recordedAt: when(-35) },
    { patientId: aicha.id, doctorId: drJean.id, hospitalId: cnhu.id, category: "analyse", title: "Bilan sanguin complet", description: "Numération formule sanguine et bilan lipidique.", details: "Résultats dans les valeurs de référence. Hémoglobine : 12,8 g/dL.", recordedAt: when(-63) },
    { patientId: aicha.id, doctorId: drJean.id, hospitalId: cnhu.id, category: "vaccin", title: "Vaccin contre l'hépatite B", description: "Rappel de vaccination effectué.", details: "Lot HB-2025-0841 · Prochain rappel selon calendrier vaccinal.", recordedAt: when(-130) },
    { patientId: aicha.id, doctorId: drJean.id, hospitalId: cnhu.id, category: "consultation", title: "Consultation de médecine générale", description: "Bilan annuel et conseils de prévention.", details: "Examen clinique normal. Recommandation : activité physique régulière.", recordedAt: when(-205) },
    { patientId: aicha.id, doctorId: drJean.id, hospitalId: cnhu.id, category: "vaccin", title: "Vaccination antitétanique", description: "Rappel antitétanique administré.", details: "Aucune réaction indésirable signalée.", recordedAt: when(-330) },
    { patientId: david.id, doctorId: drClarisse.id, hospitalId: cnhu.id, category: "consultation", title: "Consultation de cardiologie", description: "Suivi de la tension artérielle.", details: "Surveillance recommandée.", recordedAt: when(-28) },
    { patientId: nadia.id, doctorId: drJean.id, hospitalId: cnhu.id, category: "analyse", title: "Analyse biologique", description: "Bilan de routine.", details: "Résultats normaux.", recordedAt: when(-18) },
  ]);

  await db.insert(prescriptions).values([
    { patientId: aicha.id, doctorId: drClarisse.id, hospitalId: cnhu.id, diagnosis: "Suivi de la tension artérielle", medications: [{ name: "Amlodipine", dosage: "5 mg", frequency: "1 comprimé le matin", duration: "30 jours" }, { name: "Magnésium B6", dosage: "100 mg", frequency: "1 comprimé par jour", duration: "15 jours" }], notes: "Contrôler la tension régulièrement. Revoir dans un mois.", createdAt: when(-35) },
    { patientId: aicha.id, doctorId: drJean.id, hospitalId: cnhu.id, diagnosis: "Carence légère en vitamine D", medications: [{ name: "Vitamine D3", dosage: "1000 UI", frequency: "1 dose par jour", duration: "30 jours" }], notes: "À prendre au cours d'un repas.", createdAt: when(-205) },
    { patientId: david.id, doctorId: drClarisse.id, hospitalId: cnhu.id, diagnosis: "Hypertension artérielle", medications: [{ name: "Losartan", dosage: "50 mg", frequency: "1 comprimé par jour", duration: "30 jours" }], createdAt: when(-28) },
  ]);

  await db.insert(payments).values([
    { patientId: aicha.id, hospitalId: cnhu.id, appointmentId: upcoming.id, title: "Consultation de cardiologie", amount: 12500, status: "en attente", createdAt: when(-1) },
    { patientId: aicha.id, hospitalId: cnhu.id, title: "Bilan sanguin complet", amount: 18000, provider: "MTN MoMo", status: "payé", reference: "SP-MTN-240831", createdAt: when(-63) },
    { patientId: aicha.id, hospitalId: cnhu.id, title: "Consultation de médecine générale", amount: 7500, provider: "Moov Money", status: "payé", reference: "SP-MOOV-219054", createdAt: when(-205) },
    { patientId: david.id, hospitalId: cnhu.id, title: "Consultation de cardiologie", amount: 12500, provider: "MTN MoMo", status: "payé", reference: "SP-MTN-284810", createdAt: when(-28) },
    { patientId: nadia.id, hospitalId: cnhu.id, title: "Consultation générale", amount: 7500, status: "en attente", createdAt: when(-2) },
  ]);

  await db.insert(notifications).values([
    { userId: aicha.id, title: "Rendez-vous confirmé", message: "Votre consultation avec Dr. Clarisse Agossou est confirmée. Retrouvez les détails dans votre agenda.", category: "rendez-vous", createdAt: when(-1) },
    { userId: aicha.id, title: "Rappel de traitement", message: "N'oubliez pas de prendre votre traitement prescrit aujourd'hui.", category: "traitement", createdAt: when(0, 8) },
    { userId: aicha.id, title: "Votre dossier est à jour", message: "Vos derniers documents médicaux sont disponibles dans votre dossier.", category: "dossier", isRead: true, createdAt: when(-5) },
    { userId: clarisse.id, title: "Nouveau rendez-vous", message: "David Adomou a rendez-vous pour une consultation aujourd'hui.", category: "rendez-vous", createdAt: when(-1) },
    { userId: admin.id, title: "Nouvelles demandes d'accès", message: "Deux professionnels attendent votre validation.", category: "accès", createdAt: when(-1) },
  ]);

  await db.insert(bloodDonations).values([
    { patientId: aicha.id, hospitalId: cnhu.id, status: "effectué", donatedAt: when(-145) },
    { patientId: david.id, hospitalId: cnhu.id, status: "effectué", donatedAt: when(-60) },
  ]);

  await db.insert(stockItems).values([
    { hospitalId: cnhu.id, name: "Paracétamol 500 mg", category: "Médicaments", quantity: 1240, minQuantity: 200, unit: "comprimés", price: 50, expiryDate: when(280) },
    { hospitalId: cnhu.id, name: "Amlodipine 5 mg", category: "Médicaments", quantity: 86, minQuantity: 100, unit: "comprimés", price: 150, expiryDate: when(420) },
    { hospitalId: cnhu.id, name: "Amoxicilline 500 mg", category: "Médicaments", quantity: 342, minQuantity: 150, unit: "gélules", price: 175, expiryDate: when(230) },
    { hospitalId: cnhu.id, name: "Gants stériles", category: "Consommables", quantity: 580, minQuantity: 250, unit: "paires", price: 200, expiryDate: when(590) },
    { hospitalId: cnhu.id, name: "Sérum physiologique", category: "Consommables", quantity: 42, minQuantity: 80, unit: "flacons", price: 800, expiryDate: when(23) },
    { hospitalId: cnhu.id, name: "Tests de glycémie", category: "Équipements", quantity: 214, minQuantity: 100, unit: "tests", price: 1200, expiryDate: when(350) },
    { hospitalId: cnhu.id, name: "Masques chirurgicaux", category: "Consommables", quantity: 1800, minQuantity: 500, unit: "unités", price: 75, expiryDate: when(650) },
    { hospitalId: calavi.id, name: "Paracétamol 500 mg", category: "Médicaments", quantity: 390, minQuantity: 100, unit: "comprimés", price: 50, expiryDate: when(340) },
  ]);

  await db.insert(hospitalServices).values([
    { hospitalId: cnhu.id, name: "Cardiologie", bedsTotal: 64, bedsOccupied: 48, equipment: "ECG, échographe cardiaque" },
    { hospitalId: cnhu.id, name: "Urgences", bedsTotal: 85, bedsOccupied: 72, equipment: "Moniteurs, défibrillateurs" },
    { hospitalId: cnhu.id, name: "Pédiatrie", bedsTotal: 72, bedsOccupied: 49, equipment: "Incubateurs, respirateurs" },
    { hospitalId: cnhu.id, name: "Médecine générale", bedsTotal: 112, bedsOccupied: 91, equipment: "Échographes, laboratoire" },
    { hospitalId: cnhu.id, name: "Chirurgie", bedsTotal: 87, bedsOccupied: 52, equipment: "Blocs opératoires, scanners" },
  ]);

  await db.insert(accessRequests).values([
    { applicantName: "Dr. Sandrine Hounkpatin", email: "sandrine.hounkpatin@example.bj", phone: "+229 96 45 38 12", role: "doctor", organization: "CNHU-HKM", specialty: "Dermatologie", status: "en attente", createdAt: when(-1) },
    { applicantName: "Clinique Les Oliviers", email: "contact@oliviers.example.bj", phone: "+229 21 35 77 00", role: "hospital", organization: "Clinique Les Oliviers", status: "en attente", createdAt: when(-2) },
    { applicantName: "Dr. Rodrigue Tchibozo", email: "rodrigue.tchibozo@example.bj", phone: "+229 97 27 84 11", role: "doctor", organization: "HZ Abomey-Calavi", specialty: "Neurologie", status: "approuvé", reviewedAt: when(-3), createdAt: when(-7) },
  ]);

  await db.insert(auditLogs).values([
    { userId: admin.id, action: "Validation d'un accès", resource: "Demande médecin", details: "Dr. Rodrigue Tchibozo · accès approuvé", createdAt: when(-3) },
    { userId: clarisse.id, action: "Consultation du dossier", resource: "Patient Aïcha Dossou", details: "Accès au dossier médical", createdAt: when(-4) },
    { userId: manager.id, action: "Mise à jour du stock", resource: "Pharmacie CNHU-HKM", details: "Inventaire des médicaments mis à jour", createdAt: when(-5) },
    { userId: admin.id, action: "Connexion sécurisée", resource: "Espace administrateur", details: "Authentification à deux facteurs validée", createdAt: when(-6) },
  ]);

  await db.insert(pharmacies).values([
    { name: "Pharmacie Centrale de Cotonou", city: "Cotonou", address: "Avenue Clozel, centre-ville", phone: "+229 01 21 31 24 00", latitude: 6.3591, longitude: 2.4302, hours: "07:30 – 22:00" },
    { name: "Pharmacie Cadjèhoun", city: "Cotonou", address: "Rue de l'Aéroport, Cadjèhoun", phone: "+229 01 21 30 62 18", latitude: 6.3554, longitude: 2.3922, hours: "08:00 – 21:00" },
    { name: "Pharmacie de Calavi", city: "Abomey-Calavi", address: "Carrefour Kpota, Abomey-Calavi", phone: "+229 01 21 36 11 58", latitude: 6.4485, longitude: 2.354, hours: "08:00 – 20:00" },
  ]);

  await db.insert(purchaseOrders).values([
    { hospitalId: cnhu.id, supplier: "Bénin Pharma Distribution", itemName: "Amlodipine 5 mg", quantity: 500, totalCost: 75000, status: "en livraison", createdAt: when(-3) },
    { hospitalId: cnhu.id, supplier: "Médicaments du Golfe", itemName: "Sérum physiologique", quantity: 250, totalCost: 200000, status: "commandé", createdAt: when(-1) },
    { hospitalId: cnhu.id, supplier: "Médicaments du Golfe", itemName: "Gants stériles", quantity: 500, totalCost: 100000, status: "reçu", createdAt: when(-14) },
  ]);

  await db.insert(bloodStocks).values([
    { hospitalId: cnhu.id, bloodGroup: "O+", units: 34, minUnits: 15 },
    { hospitalId: cnhu.id, bloodGroup: "O-", units: 7, minUnits: 12 },
    { hospitalId: cnhu.id, bloodGroup: "A+", units: 22, minUnits: 12 },
    { hospitalId: cnhu.id, bloodGroup: "A-", units: 9, minUnits: 10 },
    { hospitalId: cnhu.id, bloodGroup: "B+", units: 18, minUnits: 10 },
    { hospitalId: cnhu.id, bloodGroup: "B-", units: 6, minUnits: 8 },
    { hospitalId: cnhu.id, bloodGroup: "AB+", units: 12, minUnits: 8 },
    { hospitalId: cnhu.id, bloodGroup: "AB-", units: 4, minUnits: 6 },
  ]);

  await db.insert(careConsents).values([
    { patientId: aicha.id, doctorId: drClarisse.id, hospitalId: cnhu.id, purpose: "Suivi cardiologique", source: "démonstration", expiresAt: when(90) },
    { patientId: aicha.id, doctorId: drJean.id, hospitalId: cnhu.id, purpose: "Bilan de santé", source: "démonstration", expiresAt: when(90) },
    { patientId: david.id, doctorId: drClarisse.id, hospitalId: cnhu.id, purpose: "Consultation", source: "démonstration", expiresAt: when(90) },
    { patientId: nadia.id, doctorId: drClarisse.id, hospitalId: cnhu.id, purpose: "Suivi médical", source: "démonstration", expiresAt: when(90) },
    { patientId: nadia.id, doctorId: drJean.id, hospitalId: cnhu.id, purpose: "Consultation", source: "démonstration", expiresAt: when(90) },
  ]);

  const document = await PDFDocument.create();
  const page = document.addPage([595, 842]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  page.drawText("SANTE+  |  COMPTE RENDU D'ANALYSE", { x: 55, y: 780, size: 17, font: bold });
  page.drawText("Patient : Aicha Dossou", { x: 55, y: 725, size: 12, font });
  page.drawText("Examen : Bilan sanguin complet", { x: 55, y: 700, size: 12, font });
  page.drawText("Hemoglobine : 12,8 g/dL", { x: 55, y: 655, size: 12, font });
  page.drawText("Resultats dans les valeurs de reference.", { x: 55, y: 630, size: 12, font });
  page.drawText("Document medical confidentiel - SANTE+ Benin", { x: 55, y: 70, size: 10, font });
  await db.insert(medicalDocuments).values({ patientId: aicha.id, doctorId: drJean.id, title: "Résultats du bilan sanguin", category: "analyse", fileName: "bilan-sanguin-aicha.pdf", mimeType: "application/pdf", data: encryptValue(Buffer.from(await document.save()).toString("base64")), createdAt: when(-63) });

  await db.insert(platformSettings).values([
    { key: "registrations_open", value: "true" },
    { key: "appointment_reminders", value: "true" },
    { key: "blood_donation_alerts", value: "true" },
    { key: "support_email", value: "contact@santeplus.bj" },
  ]);
}