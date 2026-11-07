import { randomBytes, randomInt } from "node:crypto";
import { hash } from "bcryptjs";
import { and, eq, isNull, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { accessRequests, appointments, auditLogs, bloodDonations, bloodStocks, careConsents, doctors, hospitalServices, hospitals, medicalDocuments, medicalRecords, notifications, passwordResets, payments, platformSettings, prescriptions, privacyRequests, purchaseOrders, sessions, stockItems, users, type Medication } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { hasCareConsent, requireModify, sameOrigin, withinRateLimit } from "@/lib/security";
import { checkInteractions } from "@/lib/clinical";
import { issueResetCode } from "@/lib/password-reset";

export const dynamic = "force-dynamic";

const fail = (error: string, status = 400) => Response.json({ error }, { status });
const asNumber = (value: unknown) => Number(value);
const asText = (value: unknown) => String(value ?? "").trim();
const temporaryPassword = () => `${randomBytes(12).toString("base64url")}!A7`;

async function writeAudit(userId: number, action: string, resource: string, details?: string) {
  await db.insert(auditLogs).values({ userId, action, resource, details });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("Origine non autorisée.", 403);
  try {
    const user = await getSessionUser();
    if (!user) return fail("Connectez-vous pour continuer.", 401);
    if (!(await withinRateLimit(request, "actions", 120, 60, String(user.id)))) return fail("Trop de requêtes. Réessayez dans une minute.", 429);
    const body = await request.json() as Record<string, unknown>;
    const action = asText(body.action);
    const role = user.role;

    if (action === "bookAppointment") {
      if (role !== "patient") return fail("Action réservée aux patients.", 403);
      if (body.careConsent !== true) return fail("Votre accord explicite de partage du dossier est nécessaire pour ce rendez-vous.");
      const doctorId = asNumber(body.doctorId);
      const hospitalId = asNumber(body.hospitalId);
      const scheduledAt = new Date(asText(body.scheduledAt));
      const reason = asText(body.reason) || "Consultation";
      if (!Number.isInteger(doctorId) || !Number.isInteger(hospitalId) || !Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now() || reason.length > 500) return fail("Choisissez un médecin, une date future et un motif valide.");
      const [doctor] = await db.select().from(doctors).where(and(eq(doctors.id, doctorId), eq(doctors.hospitalId, hospitalId))).limit(1);
      if (!doctor || doctor.status !== "actif") return fail("Ce médecin n'est pas disponible dans cet établissement.");
      const [doctorAccount] = await db.select({ isActive: users.isActive }).from(users).where(eq(users.id, doctor.userId)).limit(1);
      if (!doctorAccount?.isActive) return fail("Ce médecin n'est pas disponible dans cet établissement.");
      const [targetHospital] = await db.select({ isActive: hospitals.isActive }).from(hospitals).where(eq(hospitals.id, hospitalId)).limit(1);
      if (!targetHospital?.isActive) return fail("Cet établissement ne reçoit pas de nouveaux rendez-vous pour le moment.");
      const [conflict] = await db.select().from(appointments).where(and(eq(appointments.doctorId, doctorId), eq(appointments.scheduledAt, scheduledAt), ne(appointments.status, "annulé"))).limit(1);
      if (conflict) return fail("Ce créneau est déjà réservé. Choisissez une autre heure.", 409);
      const [appointment] = await db.insert(appointments).values({ patientId: user.id, doctorId, hospitalId, scheduledAt, reason, type: asText(body.type) || "Consultation", status: "confirmé" }).returning();
      await db.insert(careConsents).values({ patientId: user.id, doctorId, hospitalId, purpose: reason.slice(0, 180), source: "rendez-vous", expiresAt: new Date(scheduledAt.getTime() + 90 * 86400000) });
      await db.insert(payments).values({ patientId: user.id, hospitalId, appointmentId: appointment.id, title: `Consultation · ${reason.slice(0, 80)}`, amount: doctor.specialty === "Médecine générale" ? 7500 : 12500, status: "en attente" });
      await db.insert(notifications).values([
        { userId: user.id, title: "Rendez-vous confirmé", message: "Votre nouveau rendez-vous est confirmé. Consultez votre agenda pour les détails.", category: "rendez-vous" },
        { userId: doctor.userId, title: "Nouveau rendez-vous", message: `Nouveau rendez-vous avec ${user.fullName}.`, category: "rendez-vous" },
      ]);
      await writeAudit(user.id, "Prise de rendez-vous", `Rendez-vous #${appointment.id}`, reason);
      return Response.json({ message: "Votre rendez-vous a été confirmé.", appointment });
    }

    if (action === "rescheduleAppointment") {
      if (role !== "patient") return fail("Action réservée aux patients.", 403);
      const appointmentId = asNumber(body.id);
      const scheduledAt = new Date(asText(body.scheduledAt));
      if (!Number.isInteger(appointmentId) || !Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) return fail("Choisissez une nouvelle date future valide.");
      if (scheduledAt.getTime() > Date.now() + 365 * 86400000) return fail("La date ne peut pas dépasser un an.");
      const [appointment] = await db.select().from(appointments).where(and(eq(appointments.id, appointmentId), eq(appointments.patientId, user.id))).limit(1);
      if (!appointment) return fail("Rendez-vous introuvable.", 404);
      if (appointment.status !== "confirmé") return fail("Seul un rendez-vous confirmé peut être déplacé.");
      const [conflict] = await db.select({ id: appointments.id }).from(appointments)
        .where(and(eq(appointments.doctorId, appointment.doctorId), eq(appointments.scheduledAt, scheduledAt), ne(appointments.status, "annulé"), ne(appointments.id, appointment.id))).limit(1);
      if (conflict) return fail("Ce créneau est déjà réservé. Choisissez une autre heure.", 409);
      await db.update(appointments).set({ scheduledAt }).where(eq(appointments.id, appointment.id));
      const [doctor] = await db.select().from(doctors).where(eq(doctors.id, appointment.doctorId)).limit(1);
      await db.insert(notifications).values([
        { userId: user.id, title: "Rendez-vous déplacé", message: `Votre rendez-vous est désormais fixé au ${scheduledAt.toLocaleString("fr-FR")}.`, category: "rendez-vous" },
        ...(doctor ? [{ userId: doctor.userId, title: "Rendez-vous déplacé", message: `${user.fullName} a déplacé son rendez-vous au ${scheduledAt.toLocaleString("fr-FR")}.`, category: "rendez-vous" }] : []),
      ]);
      await writeAudit(user.id, "Reprogrammation de rendez-vous", `Rendez-vous #${appointment.id}`, scheduledAt.toISOString());
      return Response.json({ message: "Votre rendez-vous a été déplacé.", scheduledAt: scheduledAt.toISOString() });
    }

    if (action === "cancelAppointment") {
      if (role !== "patient") return fail("Action réservée aux patients.", 403);
      const [appointment] = await db.select().from(appointments).where(and(eq(appointments.id, asNumber(body.id)), eq(appointments.patientId, user.id))).limit(1);
      if (!appointment || appointment.status !== "confirmé") return fail("Ce rendez-vous ne peut plus être annulé.");
      await db.update(appointments).set({ status: "annulé" }).where(eq(appointments.id, appointment.id));
      await db.insert(notifications).values({ userId: user.id, title: "Rendez-vous annulé", message: "Votre rendez-vous a été annulé avec succès.", category: "rendez-vous" });
      await writeAudit(user.id, "Annulation de rendez-vous", `Rendez-vous #${appointment.id}`);
      return Response.json({ message: "Rendez-vous annulé." });
    }

    if (action === "payBill") {
      return fail("Le paiement en ligne n'est pas activé. Réglez auprès de l'établissement, qui enregistrera le paiement.", 503);
    }

    if (action === "recordPayment") {
      if (!["hospital", "admin"].includes(role)) return fail("Action réservée à l'établissement ou à l'administration.", 403);
      const paymentId = asNumber(body.id);
      const provider = asText(body.provider);
      const reference = asText(body.reference);
      if (!Number.isInteger(paymentId) || !provider || reference.length < 3 || reference.length > 80) return fail("Indiquez un moyen de paiement et une référence valide.");
      const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
      if (!payment || payment.status !== "en attente") return fail("Facture introuvable ou déjà traitée.");
      if (role === "hospital" && payment.hospitalId !== user.hospitalId) return fail("Accès refusé.", 403);
      await db.transaction(async (tx) => {
        await tx.update(payments).set({ status: "payé", provider, reference }).where(and(eq(payments.id, payment.id), eq(payments.status, "en attente")));
        await tx.insert(notifications).values({ userId: payment.patientId, title: "Paiement enregistré", message: `Votre paiement de ${payment.amount.toLocaleString("fr-FR")} FCFA a été enregistré. Réf. ${reference}.`, category: "paiement" });
        await tx.insert(auditLogs).values({ userId: user.id, action: "Paiement enregistré", resource: `Facture #${payment.id}`, details: `${provider} · ${reference}` });
      });
      return Response.json({ message: "Paiement enregistré." });
    }

    if (action === "planDonation") {
      if (role !== "patient") return fail("Action réservée aux patients.", 403);
      const hospitalId = asNumber(body.hospitalId);
      const donatedAt = new Date(asText(body.date));
      const [hospital] = await db.select().from(hospitals).where(eq(hospitals.id, hospitalId)).limit(1);
      if (!hospital || !Number.isFinite(donatedAt.getTime()) || donatedAt.getTime() < Date.now()) return fail("Choisissez un lieu et une date future.");
      await db.insert(bloodDonations).values({ patientId: user.id, hospitalId, donatedAt, status: "planifié" });
      await db.insert(notifications).values({ userId: user.id, title: "Don de sang planifié", message: `Votre don de sang à ${hospital.shortName} est planifié. Merci pour votre solidarité !`, category: "don" });
      await writeAudit(user.id, "Planification de don", hospital.shortName);
      return Response.json({ message: "Votre don de sang est planifié. Merci pour votre engagement !" });
    }

    if (action === "markNotification" || action === "markAllNotifications") {
      if (action === "markAllNotifications") await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, user.id));
      else await db.update(notifications).set({ isRead: true }).where(and(eq(notifications.id, asNumber(body.id)), eq(notifications.userId, user.id)));
      return Response.json({ message: "Notifications mises à jour." });
    }

    if (action === "updateProfile") {
      const fullName = asText(body.fullName);
      const city = asText(body.city);
      const phone = asText(body.phone);
      const email = asText(body.email).toLowerCase() || user.email;
      // Champ absent = inchangé : les formulaires partiels ne doivent pas effacer de données.
      const bloodGroup = body.bloodGroup === undefined ? user.bloodGroup : asText(body.bloodGroup) || null;
      const birthDate = body.birthDate === undefined ? user.birthDate : asText(body.birthDate) || null;
      if (fullName.length < 2 || fullName.length > 180) return fail("Le nom complet doit contenir entre 2 et 180 caractères.");
      if (city.length > 100) return fail("La ville ne doit pas dépasser 100 caractères.");
      if (!/^\+?[0-9 .()-]{8,40}$/.test(phone)) return fail("Le numéro de téléphone est invalide.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fail("L'adresse email est invalide.");
      if (bloodGroup && !["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"].includes(bloodGroup)) return fail("Groupe sanguin invalide.");
      if (birthDate) {
        const parsed = new Date(`${birthDate}T00:00:00Z`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || Number.isNaN(parsed.getTime()) || parsed.getTime() > Date.now()) return fail("La date de naissance est invalide.");
        if (parsed.getTime() < Date.now() - 120 * 365.25 * 86400000) return fail("La date de naissance est invalide.");
      }
      const [conflict] = await db.select({ id: users.id, email: users.email, phone: users.phone })
        .from(users).where(and(ne(users.id, user.id), or(eq(users.email, email), eq(users.phone, phone)))).limit(1);
      if (conflict) return fail(conflict.email === email ? "Cette adresse email est déjà utilisée." : "Ce numéro de téléphone est déjà utilisé.", 409);
      await db.update(users).set({ fullName, city, phone, email, bloodGroup, birthDate }).where(eq(users.id, user.id));
      await writeAudit(user.id, "Modification de profil", "Compte utilisateur", email !== user.email ? "Adresse email modifiée" : "Informations personnelles mises à jour");
      return Response.json({ message: "Vos informations ont été mises à jour." });
    }

    if (action === "saveConsultation") {
      if (role !== "doctor") return fail("Action réservée aux médecins.", 403);
      const [doctor] = await db.select().from(doctors).where(eq(doctors.userId, user.id)).limit(1);
      const patientId = asNumber(body.patientId);
      const [patient] = await db.select().from(users).where(and(eq(users.id, patientId), eq(users.role, "patient"))).limit(1);
      const diagnosis = asText(body.diagnosis);
      const reason = asText(body.reason);
      if (!doctor || !patient || diagnosis.length < 3 || reason.length < 3) return fail("Renseignez le patient, le motif et le diagnostic.");
      if (!(await hasCareConsent(user, patientId))) return fail("Consentement du patient absent, expiré ou révoqué.", 403);
      const medications: Medication[] = Array.isArray(body.medications) ? body.medications.slice(0, 12).map((item) => { const med = item as Record<string, unknown>; return { name: asText(med.name), dosage: asText(med.dosage), frequency: asText(med.frequency), duration: asText(med.duration) }; }).filter((item) => item.name) : [];
      const warnings = checkInteractions(medications);
      if (warnings.length && body.acknowledgeInteractions !== true) return Response.json({ error: "Vérifiez les interactions avant de valider.", warnings }, { status: 400 });
      const vitals = [asText(body.bloodPressure) && `Tension : ${asText(body.bloodPressure)}`, asText(body.heartRate) && `Pouls : ${asText(body.heartRate)} bpm`, asText(body.temperature) && `Température : ${asText(body.temperature)} °C`].filter(Boolean).join(" · ");
      await db.insert(medicalRecords).values({ patientId, doctorId: doctor.id, hospitalId: doctor.hospitalId, category: "consultation", title: `Consultation · ${reason.slice(0, 120)}`, description: diagnosis, details: [vitals, asText(body.notes)].filter(Boolean).join("\n") });
      if (medications.length) await db.insert(prescriptions).values({ patientId, doctorId: doctor.id, hospitalId: doctor.hospitalId, diagnosis, medications, notes: asText(body.notes) });
      const appointmentId = asNumber(body.appointmentId);
      if (Number.isInteger(appointmentId) && appointmentId > 0) await db.update(appointments).set({ status: "terminé" }).where(and(eq(appointments.id, appointmentId), eq(appointments.doctorId, doctor.id), eq(appointments.patientId, patientId)));
      await db.insert(notifications).values({ userId: patientId, title: "Votre consultation est disponible", message: `Le compte rendu${medications.length ? " et l'ordonnance" : ""} de votre consultation viennent d'être ajoutés à votre dossier médical.`, category: "dossier" });
      await writeAudit(user.id, "Consultation enregistrée", `Patient ${patient.npi || patient.id}`, warnings.length ? "Interactions vérifiées par le médecin" : "Compte rendu clinique enregistré");
      return Response.json({ message: "Consultation enregistrée et transmise au patient." });
    }

    if (action === "updateAppointment") {
      if (!["doctor", "hospital"].includes(role)) return fail("Accès refusé.", 403);
      const status = asText(body.status);
      if (!["confirmé", "terminé", "annulé"].includes(status)) return fail("Statut invalide.");
      const [appointment] = await db.select().from(appointments).where(eq(appointments.id, asNumber(body.id))).limit(1);
      if (!appointment) return fail("Rendez-vous introuvable.", 404);
      if (role === "hospital" && appointment.hospitalId !== user.hospitalId) return fail("Accès refusé.", 403);
      if (role === "doctor") {
        const [doctor] = await db.select().from(doctors).where(eq(doctors.userId, user.id)).limit(1);
        if (!doctor || doctor.id !== appointment.doctorId) return fail("Accès refusé.", 403);
      }
      await db.update(appointments).set({ status }).where(eq(appointments.id, appointment.id));
      await db.insert(notifications).values({ userId: appointment.patientId, title: "Rendez-vous mis à jour", message: `Le statut de votre rendez-vous est maintenant : ${status}.`, category: "rendez-vous" });
      await writeAudit(user.id, "Statut de rendez-vous", `Rendez-vous #${appointment.id}`, status);
      return Response.json({ message: "Rendez-vous mis à jour." });
    }

    if (action === "addStock" || action === "adjustStock") {
      if (role !== "hospital" || !user.hospitalId) return fail("Accès réservé aux établissements.", 403);
      if (action === "addStock") {
        const name = asText(body.name);
        const quantity = asNumber(body.quantity);
        const minQuantity = asNumber(body.minQuantity);
        if (!name || !Number.isInteger(quantity) || quantity < 0 || !Number.isInteger(minQuantity) || minQuantity < 0) return fail("Données du stock invalides.");
        await db.insert(stockItems).values({ hospitalId: user.hospitalId, name, category: asText(body.category) || "Médicaments", quantity, minQuantity, unit: asText(body.unit) || "unités", price: Math.max(0, asNumber(body.price) || 0), expiryDate: body.expiryDate ? new Date(asText(body.expiryDate)) : null });
        await writeAudit(user.id, "Ajout au stock", name, `${quantity} unités`);
        return Response.json({ message: "Article ajouté au stock." });
      }
      const [item] = await db.select().from(stockItems).where(and(eq(stockItems.id, asNumber(body.id)), eq(stockItems.hospitalId, user.hospitalId))).limit(1);
      const quantity = asNumber(body.quantity);
      if (!item || !Number.isInteger(quantity) || quantity < 0) return fail("Article ou quantité invalide.");
      await db.update(stockItems).set({ quantity }).where(eq(stockItems.id, item.id));
      await writeAudit(user.id, "Mise à jour du stock", item.name, `${item.quantity} → ${quantity}`);
      return Response.json({ message: "Quantité mise à jour." });
    }

    if (action === "addService" || action === "updateService") {
      if (role !== "hospital" || !user.hospitalId) return fail("Accès réservé aux établissements.", 403);
      if (action === "addService") {
        const name = asText(body.name);
        const bedsTotal = asNumber(body.bedsTotal);
        if (!name || !Number.isInteger(bedsTotal) || bedsTotal < 0) return fail("Service ou capacité invalide.");
        await db.insert(hospitalServices).values({ hospitalId: user.hospitalId, name, bedsTotal, bedsOccupied: 0, equipment: asText(body.equipment) });
        await writeAudit(user.id, "Ajout de service", name);
        return Response.json({ message: "Service ajouté." });
      }
      const [service] = await db.select().from(hospitalServices).where(and(eq(hospitalServices.id, asNumber(body.id)), eq(hospitalServices.hospitalId, user.hospitalId))).limit(1);
      const bedsOccupied = asNumber(body.bedsOccupied);
      if (!service || !Number.isInteger(bedsOccupied) || bedsOccupied < 0 || bedsOccupied > service.bedsTotal) return fail("Nombre de lits occupés invalide.");
      await db.update(hospitalServices).set({ bedsOccupied }).where(eq(hospitalServices.id, service.id));
      await writeAudit(user.id, "Mise à jour des lits", service.name, `${bedsOccupied}/${service.bedsTotal}`);
      return Response.json({ message: "Occupation des lits mise à jour." });
    }

    if (action === "createOrder" || action === "updateOrder") {
      if (role !== "hospital" || !user.hospitalId) return fail("Accès réservé aux établissements.", 403);
      if (action === "createOrder") {
        const supplier = asText(body.supplier);
        const itemName = asText(body.itemName);
        const quantity = asNumber(body.quantity);
        if (!supplier || !itemName || !Number.isInteger(quantity) || quantity < 1) return fail("Complétez le fournisseur, l'article et la quantité.");
        await db.insert(purchaseOrders).values({ hospitalId: user.hospitalId, supplier, itemName, quantity, totalCost: Math.max(0, asNumber(body.totalCost) || 0) });
        await writeAudit(user.id, "Commande fournisseur", supplier, `${quantity} × ${itemName}`);
        return Response.json({ message: "Commande créée." });
      }
      const [order] = await db.select().from(purchaseOrders).where(and(eq(purchaseOrders.id, asNumber(body.id)), eq(purchaseOrders.hospitalId, user.hospitalId))).limit(1);
      const status = asText(body.status);
      if (!order || !["commandé", "en livraison", "reçu"].includes(status)) return fail("Commande ou statut invalide.");
      await db.update(purchaseOrders).set({ status }).where(eq(purchaseOrders.id, order.id));
      await writeAudit(user.id, "Suivi de commande", `Commande #${order.id}`, status);
      return Response.json({ message: "Commande mise à jour." });
    }

    if (action === "updateBloodStock") {
      if (role !== "hospital" || !user.hospitalId) return fail("Accès réservé aux établissements.", 403);
      const [stock] = await db.select().from(bloodStocks).where(and(eq(bloodStocks.id, asNumber(body.id)), eq(bloodStocks.hospitalId, user.hospitalId))).limit(1);
      const units = asNumber(body.units);
      if (!stock || !Number.isInteger(units) || units < 0) return fail("Quantité invalide.");
      await db.update(bloodStocks).set({ units, updatedAt: new Date() }).where(eq(bloodStocks.id, stock.id));
      await writeAudit(user.id, "Mise à jour du stock de sang", stock.bloodGroup, `${stock.units} → ${units} poches`);
      return Response.json({ message: "Stock de sang mis à jour." });
    }

    if (action === "requestDoctor") {
      if (role !== "hospital" || !user.hospitalId) return fail("Accès réservé aux établissements.", 403);
      const [hospital] = await db.select().from(hospitals).where(eq(hospitals.id, user.hospitalId)).limit(1);
      const applicantName = asText(body.applicantName);
      const email = asText(body.email).toLowerCase();
      if (applicantName.length < 3 || !email.includes("@")) return fail("Nom et email valides requis.");
      await db.insert(accessRequests).values({ applicantName, email, phone: asText(body.phone), role: "doctor", specialty: asText(body.specialty), licenseNumber: asText(body.licenseNumber) || null, organization: hospital?.shortName || "" });
      await writeAudit(user.id, "Demande d'accès médecin", applicantName);
      return Response.json({ message: "Demande transmise à l'administration SANTÉ+." });
    }

    if (action === "createInvoice") {
      if (role !== "hospital" || !user.hospitalId) return fail("Accès réservé aux établissements.", 403);
      const patientId = asNumber(body.patientId);
      const amount = asNumber(body.amount);
      const title = asText(body.title);
      const [patient] = await db.select().from(users).where(and(eq(users.id, patientId), eq(users.role, "patient"))).limit(1);
      if (!patient || !title || !Number.isInteger(amount) || amount < 1) return fail("Patient, libellé ou montant invalide.");
      if (!(await hasCareConsent(user, patientId))) return fail("Ce patient n’a pas autorisé l’établissement.", 403);
      await db.insert(payments).values({ patientId, hospitalId: user.hospitalId, title, amount, status: "en attente" });
      await db.insert(notifications).values({ userId: patientId, title: "Nouvelle facture", message: `Une facture de ${amount.toLocaleString("fr-FR")} FCFA est disponible.`, category: "paiement" });
      await writeAudit(user.id, "Création de facture", patient.fullName, `${amount} FCFA`);
      return Response.json({ message: "Facture envoyée au patient." });
    }

    if (action === "reviewAccess") {
      if (role !== "admin") return fail("Accès réservé à l'administration.", 403);
      const [access] = await db.select().from(accessRequests).where(eq(accessRequests.id, asNumber(body.id))).limit(1);
      const decision = asText(body.decision);
      if (!access || access.status !== "en attente" || !["approuvé", "refusé"].includes(decision)) return fail("Demande déjà traitée ou décision invalide.");
      let credentials: { email: string; password: string; role: string } | undefined;
      if (decision === "approuvé") {
        const [existing] = await db.select().from(users).where(eq(users.email, access.email)).limit(1);
        if (existing) return fail("Un compte utilise déjà cette adresse email.", 409);
        const allHospitals = await db.select().from(hospitals);
        const organization = (access.organization || "").toLowerCase();
        const matched = allHospitals.find((item) => item.shortName.toLowerCase() === organization || item.name.toLowerCase() === organization);
        if (!matched) return fail("Établissement introuvable. Créez d'abord l'établissement concerné dans Établissements.");
        if (access.role === "doctor" && !access.licenseNumber) return fail("Numéro d'ordre manquant. Demandez au médecin de compléter sa demande.");
        const password = temporaryPassword();
        const passwordHash = await hash(password, 12);
        await db.transaction(async (tx) => {
          const [createdUser] = await tx.insert(users).values({ fullName: access.applicantName, email: access.email, phone: access.phone || null, passwordHash, role: access.role, hospitalId: matched.id, city: matched.city, mustChangePassword: true }).returning();
          if (access.role === "doctor") await tx.insert(doctors).values({ userId: createdUser.id, hospitalId: matched.id, specialty: access.specialty || "Médecine générale", licenseNumber: access.licenseNumber!, yearsExperience: 0, status: "actif" });
          await tx.update(accessRequests).set({ status: decision, reviewedAt: new Date() }).where(eq(accessRequests.id, access.id));
          await tx.insert(auditLogs).values({ userId: user.id, action: "Accès approuvé", resource: access.applicantName, details: access.role });
        });
        credentials = { email: access.email, password, role: access.role };
        return Response.json({ message: "Accès validé. Communiquez le mot de passe temporaire par un canal sécurisé ; le professionnel devra le remplacer à la première connexion.", credentials });
      }
      await db.update(accessRequests).set({ status: decision, reviewedAt: new Date() }).where(eq(accessRequests.id, access.id));
      await writeAudit(user.id, "Accès refusé", access.applicantName, access.role);
      return Response.json({ message: "Demande refusée." });
    }

    if (action === "issuePasswordReset") {
      if (role !== "admin") return fail("Action réservée à l'administration.", 403);
      const targetId = asNumber(body.userId);
      const [target] = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
      if (!target) return fail("Utilisateur introuvable.", 404);
      const { code, expiresAt } = await issueResetCode(target.id, "admin");
      await db.insert(notifications).values({ userId: target.id, title: "Réinitialisation de mot de passe", message: "Un code de réinitialisation a été émis par l'administration. Il expire dans 30 minutes.", category: "securite" });
      await writeAudit(user.id, "Émission d'un code de réinitialisation", `Utilisateur #${target.id}`, "Code à usage unique, 30 minutes");
      return Response.json({ message: `Code de réinitialisation généré pour ${target.email}. Transmettez-le après vérification d'identité.`, code, email: target.email, expiresAt: expiresAt.toISOString() });
    }

    if (action === "toggleUser") {
      if (role !== "admin") return fail("Accès réservé à l'administration.", 403);
      const [target] = await db.select().from(users).where(eq(users.id, asNumber(body.id))).limit(1);
      if (!target || target.id === user.id) return fail("Vous ne pouvez pas modifier votre propre compte ici.");
      await db.update(users).set({ isActive: !target.isActive }).where(eq(users.id, target.id));
      if (target.isActive) await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, target.id));
      await writeAudit(user.id, target.isActive ? "Désactivation de compte" : "Activation de compte", target.fullName);
      return Response.json({ message: `Compte ${target.isActive ? "désactivé" : "activé"}.` });
    }

    if (action === "setDoctorStatus") {
      if (role !== "admin") return fail("Accès réservé à l'administration.", 403);
      const doctorId = asNumber(body.id);
      const status = asText(body.status);
      if (!["actif", "suspendu", "inactif"].includes(status)) return fail("Statut de médecin invalide.");
      const [doctor] = await db.select().from(doctors).where(eq(doctors.id, doctorId)).limit(1);
      if (!doctor) return fail("Médecin introuvable.", 404);
      const [doctorUser] = await db.select().from(users).where(eq(users.id, doctor.userId)).limit(1);
      if (!doctorUser) return fail("Compte du médecin introuvable.", 404);
      const suspended = status !== "actif";
      await db.transaction(async (tx) => {
        await tx.update(doctors).set({ status }).where(eq(doctors.id, doctorId));
        // Suspension : le compte ne peut plus se connecter et toutes ses sessions tombent immédiatement.
        if (suspended && doctorUser.isActive) await tx.update(users).set({ isActive: false }).where(eq(users.id, doctor.userId));
        if (suspended) await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, doctor.userId), isNull(sessions.revokedAt)));
        if (!suspended && !doctorUser.isActive) await tx.update(users).set({ isActive: true }).where(eq(users.id, doctor.userId));
        await tx.insert(auditLogs).values({
          userId: user.id,
          action: suspended ? "Suspension de médecin" : "Réactivation de médecin",
          resource: doctorUser.fullName,
          details: `Statut clinique : ${doctor.status} → ${status}`,
        });
      });
      return Response.json({ message: suspended ? "Médecin suspendu. Ses sessions ont été révoquées et il n'est plus réservable." : "Médecin réactivé." });
    }

    if (action === "updateHospital") {
      if (role !== "admin") return fail("Accès réservé à l'administration.", 403);
      const hospitalId = asNumber(body.id);
      const [hospital] = await db.select().from(hospitals).where(eq(hospitals.id, hospitalId)).limit(1);
      if (!hospital) return fail("Établissement introuvable.", 404);
      const name = asText(body.name) || hospital.name;
      const shortName = asText(body.shortName) || hospital.shortName;
      const city = asText(body.city) || hospital.city;
      const address = asText(body.address) || hospital.address;
      const phone = asText(body.phone) || hospital.phone;
      const type = asText(body.type) || hospital.type;
      const latitude = body.latitude === undefined || body.latitude === "" ? hospital.latitude : asNumber(body.latitude);
      const longitude = body.longitude === undefined || body.longitude === "" ? hospital.longitude : asNumber(body.longitude);
      const bedsTotal = body.bedsTotal === undefined || body.bedsTotal === "" ? hospital.bedsTotal : asNumber(body.bedsTotal);
      const bedsOccupied = body.bedsOccupied === undefined || body.bedsOccupied === "" ? hospital.bedsOccupied : asNumber(body.bedsOccupied);
      if (name.length < 3 || shortName.length < 2 || city.length < 2 || address.length < 5 || phone.length < 8) return fail("Complétez le nom, le sigle, la ville, l'adresse et le téléphone.");
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return fail("Coordonnées géographiques invalides.");
      if (!Number.isInteger(bedsTotal) || bedsTotal < 0 || !Number.isInteger(bedsOccupied) || bedsOccupied < 0) return fail("Capacité en lits invalide.");
      if (bedsOccupied > bedsTotal) return fail("Les lits occupés ne peuvent pas dépasser la capacité totale.");
      await db.update(hospitals).set({ name, shortName, city, address, phone, type, latitude, longitude, bedsTotal, bedsOccupied }).where(eq(hospitals.id, hospitalId));
      await writeAudit(user.id, "Modification d'établissement", shortName, `${city} · ${bedsOccupied}/${bedsTotal} lits`);
      return Response.json({ message: "Établissement mis à jour." });
    }

    if (action === "toggleHospital") {
      if (role !== "admin") return fail("Accès réservé à l'administration.", 403);
      const [hospital] = await db.select().from(hospitals).where(eq(hospitals.id, asNumber(body.id))).limit(1);
      if (!hospital) return fail("Établissement introuvable.", 404);
      const nextActive = !hospital.isActive;
      const restoreStaff = body.restoreStaff === true;
      await db.transaction(async (tx) => {
        await tx.update(hospitals).set({ isActive: nextActive }).where(eq(hospitals.id, hospital.id));
        // Fermeture : les comptes rattachés perdent l'accès immédiatement.
        if (!nextActive) {
          const staff = await tx.select({ id: users.id }).from(users).where(eq(users.hospitalId, hospital.id));
          if (staff.length) await tx.update(users).set({ isActive: false }).where(eq(users.hospitalId, hospital.id));
          for (const member of staff) {
            await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, member.id), isNull(sessions.revokedAt)));
          }
        }
        // Réouverture : l'administrateur peut restaurer d'un coup l'accès des comptes rattachés.
        if (nextActive && restoreStaff) await tx.update(users).set({ isActive: true }).where(eq(users.hospitalId, hospital.id));
        await tx.insert(auditLogs).values({
          userId: user.id,
          action: nextActive ? "Réouverture d'établissement" : "Fermeture d'établissement",
          resource: hospital.shortName,
          details: nextActive
            ? restoreStaff ? "Comptes rattachés réactivés automatiquement" : "Comptes rattachés laissés inactifs"
            : "Comptes rattachés désactivés et sessions révoquées",
        });
      });
      const restoredMessage = nextActive
        ? restoreStaff ? "Établissement réactivé. Les comptes rattachés ont retrouvé leur accès." : "Établissement réactivé. Les comptes rattachés restent inactifs jusqu'à réactivation manuelle."
        : "Établissement désactivé. Les comptes rattachés ont été désactivés et déconnectés.";
      return Response.json({ message: restoredMessage });
    }

    if (action === "deleteAccount") {
      if (role !== "admin") return fail("Accès réservé à l'administration.", 403);
      const targetId = asNumber(body.id);
      if (targetId === user.id) return fail("Vous ne pouvez pas supprimer votre propre compte administrateur.");
      const [target] = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
      if (!target) return fail("Utilisateur introuvable.", 404);
      if (target.role === "admin") return fail("Un compte administrateur ne peut pas être supprimé depuis cette interface.");
      const [doctor] = await db.select({ id: doctors.id }).from(doctors).where(eq(doctors.userId, target.id)).limit(1);
      const [records] = await db.select({ id: medicalRecords.id }).from(medicalRecords).where(eq(medicalRecords.patientId, target.id)).limit(1);
      const [documents] = await db.select({ id: medicalDocuments.id }).from(medicalDocuments).where(eq(medicalDocuments.patientId, target.id)).limit(1);
      const [scripts] = await db.select({ id: prescriptions.id }).from(prescriptions).where(eq(prescriptions.patientId, target.id)).limit(1);
      const [bill] = await db.select({ id: payments.id }).from(payments).where(eq(payments.patientId, target.id)).limit(1);
      if (doctor || records || documents || scripts) {
        return fail("Ce compte porte des données cliniques : la suppression est refusée. Désactivez le compte et traitez une demande d'effacement conforme.", 409);
      }
      if (bill) {
        return fail("Ce compte est lié à des écritures financières : la suppression effacerait la traçabilité des paiements. Désactivez le compte.", 409);
      }
      await db.transaction(async (tx) => {
        await tx.update(accessRequests).set({ reviewedAt: new Date() }).where(eq(accessRequests.email, target.email));
        await tx.delete(sessions).where(eq(sessions.userId, target.id));
        await tx.delete(notifications).where(eq(notifications.userId, target.id));
        await tx.delete(careConsents).where(eq(careConsents.patientId, target.id));
        await tx.delete(passwordResets).where(eq(passwordResets.userId, target.id));
        await tx.delete(privacyRequests).where(eq(privacyRequests.patientId, target.id));
        await tx.delete(bloodDonations).where(eq(bloodDonations.patientId, target.id));
        await tx.delete(appointments).where(eq(appointments.patientId, target.id));
        // Le journal d'audit est conservé mais détaché du compte : la clé étrangère est
        // nullable, on remet user_id à NULL pour garder les lignes sans lien vers un compte supprimé.
        await tx.update(auditLogs).set({ userId: null }).where(eq(auditLogs.userId, target.id));
        await tx.delete(users).where(eq(users.id, target.id));
        await tx.insert(auditLogs).values({ userId: user.id, action: "Suppression de compte", resource: target.email, details: `${target.role} · ${target.id} · journal d'audit conservé et détaché` });
      });
      return Response.json({ message: "Compte supprimé. L'historique d'audit est conservé." });
    }

    if (action === "sendNotification") {
      if (role !== "admin") return fail("Accès réservé à l'administration.", 403);
      const title = asText(body.title);
      const message = asText(body.message);
      const audience = asText(body.audience) || "all";
      const category = asText(body.category) || "annonce";
      if (title.length < 3 || title.length > 180) return fail("Le titre doit contenir entre 3 et 180 caractères.");
      if (message.length < 5 || message.length > 900) return fail("Le message doit contenir entre 5 et 900 caractères.");
      if (!["all", "patient", "doctor", "hospital"].includes(audience)) return fail("Audience inconnue.");
      if (!["annonce", "securite", "maintenance", "info"].includes(category)) return fail("Catégorie inconnue.");
      const recipients = audience === "all"
        ? await db.select({ id: users.id }).from(users).where(eq(users.isActive, true))
        : await db.select({ id: users.id }).from(users).where(and(eq(users.isActive, true), eq(users.role, audience)));
      if (!recipients.length) return fail("Aucun destinataire actif pour cette audience.", 409);
      // Insertion par lots : Postgres limite le nombre de paramètres par requête.
      for (let index = 0; index < recipients.length; index += 200) {
        const batch = recipients.slice(index, index + 200);
        await db.insert(notifications).values(batch.map((recipient) => ({ userId: recipient.id, title, message, category })));
      }
      await writeAudit(user.id, "Notification diffusée", `Audience : ${audience}`, `${recipients.length} destinataire(s) · ${title}`);
      return Response.json({ message: `Notification envoyée à ${recipients.length} destinataire(s).`, recipients: recipients.length });
    }

    if (action === "createHospital") {
      if (role !== "admin") return fail("Accès réservé à l'administration.", 403);
      const name = asText(body.name);
      const shortName = asText(body.shortName);
      const city = asText(body.city);
      const address = asText(body.address);
      const phone = asText(body.phone);
      const type = asText(body.type) || "Hôpital public";
      const latitude = asNumber(body.latitude);
      const longitude = asNumber(body.longitude);
      const bedsTotal = asNumber(body.bedsTotal);
      if (name.length < 3 || shortName.length < 2 || city.length < 2 || address.length < 5 || phone.length < 8) return fail("Complétez le nom, le sigle, la ville, l'adresse et le téléphone.");
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return fail("Coordonnées géographiques invalides.");
      if (!Number.isInteger(bedsTotal) || bedsTotal < 0) return fail("Capacité en lits invalide.");
      const [hospital] = await db.insert(hospitals).values({ name, shortName, city, address, phone, type, latitude, longitude, bedsTotal, bedsOccupied: 0 }).returning();
      await writeAudit(user.id, "Création d'établissement", hospital.shortName, hospital.city);
      return Response.json({ message: "Établissement créé.", hospital });
    }

    if (action === "createUser") {
      if (role !== "admin") return fail("Accès réservé à l'administration.", 403);
      const targetRole = asText(body.role);
      if (!["patient", "doctor", "hospital"].includes(targetRole)) return fail("Rôle invalide.");
      const fullName = asText(body.fullName);
      const email = asText(body.email).toLowerCase();
      const phone = asText(body.phone);
      const city = asText(body.city) || "Cotonou";
      if (fullName.length < 2 || !email.includes("@") || phone.length < 8) return fail("Nom, email et téléphone valides requis.");
      const [existing] = await db.select({ id: users.id }).from(users).where(or(eq(users.email, email), eq(users.phone, phone))).limit(1);
      if (existing) return fail("Cet email ou ce téléphone est déjà utilisé.", 409);
      let hospitalId: number | null = null;
      if (targetRole === "doctor" || targetRole === "hospital") {
        hospitalId = asNumber(body.hospitalId);
        const [hospital] = await db.select().from(hospitals).where(eq(hospitals.id, hospitalId)).limit(1);
        if (!hospital || !hospital.isActive) return fail("Sélectionnez un établissement actif.");
      }
      const specialty = asText(body.specialty);
      const licenseNumber = asText(body.licenseNumber);
      if (targetRole === "doctor" && (specialty.length < 2 || licenseNumber.length < 3)) return fail("Spécialité et numéro d'ordre requis pour un médecin.");
      const password = temporaryPassword();
      const passwordHash = await hash(password, 12);
      const npi = targetRole === "patient" ? `SP-${new Date().getFullYear()}-${randomInt(100000, 999999)}` : null;
      const bloodGroup = asText(body.bloodGroup) || null;
      const [created] = await db.transaction(async (tx) => {
        const [createdUser] = await tx.insert(users).values({ fullName, email, phone, passwordHash, role: targetRole, npi, bloodGroup, city, hospitalId, mustChangePassword: true }).returning();
        if (targetRole === "doctor" && hospitalId) await tx.insert(doctors).values({ userId: createdUser.id, hospitalId, specialty, licenseNumber, yearsExperience: Math.max(0, asNumber(body.yearsExperience) || 0), status: "actif" });
        await tx.insert(auditLogs).values({ userId: user.id, action: "Création de compte", resource: createdUser.email, details: targetRole });
        return [createdUser];
      });
      return Response.json({ message: "Compte créé. Transmettez le mot de passe temporaire par un canal sécurisé.", credentials: { email, password, role: targetRole }, user: { id: created.id } });
    }

    if (action === "requestConsent") {
      // Demande faite par un professionnel : elle ne donne AUCUN accès tant que
      // le patient ne l'a pas accordée explicitement.
      if (!["doctor", "hospital"].includes(role)) return fail("Action réservée aux professionnels de santé.", 403);
      const patientId = asNumber(body.patientId);
      const [patient] = await db.select().from(users).where(and(eq(users.id, patientId), eq(users.role, "patient"))).limit(1);
      if (!patient) return fail("Patient introuvable.");
      const message = asText(body.message);
      if (message.length < 10 || message.length > 400) return fail("Précisez le motif de votre demande en 10 à 400 caractères.");

      let doctorId: number | null = null;
      let hospitalId = user.hospitalId;
      if (role === "doctor") {
        const [doctor] = await db.select().from(doctors).where(eq(doctors.userId, user.id)).limit(1);
        if (!doctor || doctor.status !== "actif") return fail("Votre compte médecin n'est pas actif.", 403);
        doctorId = doctor.id;
        hospitalId = doctor.hospitalId;
      }
      if (!hospitalId) return fail("Aucun établissement de rattachement.", 400);

      const [existing] = await db.select().from(careConsents).where(and(
        eq(careConsents.patientId, patientId),
        eq(careConsents.status, "en attente"),
        isNull(careConsents.revokedAt),
        doctorId ? eq(careConsents.doctorId, doctorId) : eq(careConsents.hospitalId, hospitalId),
      )).limit(1);
      if (existing) return fail("Une demande est déjà en attente de la décision de ce patient.", 409);

      await db.insert(careConsents).values({
        patientId, doctorId, hospitalId,
        purpose: message.slice(0, 180),
        requestMessage: message,
        source: role === "doctor" ? "demande-médecin" : "demande-établissement",
        status: "en attente",
        requestedAt: new Date(),
        // La demande expire d'elle-même : une autorisation ne doit pas rester
        // ouverte indéfiniment sans décision.
        expiresAt: new Date(Date.now() + 30 * 86400000),
        canView: true, canModify: false, canViewDocuments: true,
      });
      const asker = role === "doctor" ? "Un médecin" : "Un établissement de santé";
      await db.insert(notifications).values({
        userId: patientId,
        title: "Nouvelle demande d’accès à votre dossier",
        message: `${asker} demande à consulter votre dossier médical. Motif : ${message.slice(0, 140)}. Vous seul décidez d’accepter ou de refuser.`,
        category: "securite",
      });
      await writeAudit(user.id, "Demande d'accès déposée", `Patient ${patient.npi || patient.id}`, message.slice(0, 180));
      return Response.json({ message: "Demande transmise au patient. Aucun accès n'est ouvert avant sa décision." });
    }

    if (action === "decideConsent") {
      // Décision du patient sur une demande : accorder (avec ou sans
      // modification) ou refuser. Seul le patient concerné peut décider.
      if (role !== "patient") return fail("Accès réservé au patient.", 403);
      const id = asNumber(body.id);
      const [grant] = await db.select().from(careConsents).where(and(eq(careConsents.id, id), eq(careConsents.patientId, user.id))).limit(1);
      if (!grant) return fail("Demande introuvable.", 404);
      if (grant.revokedAt) return fail("Cette demande a déjà été clôturée.");
      if (grant.status !== "en attente") return fail("Cette demande a déjà reçu une décision.", 409);

      if (body.decision === "refuser") {
        await db.update(careConsents).set({ status: "refusé", decidedAt: new Date() }).where(eq(careConsents.id, id));
        await writeAudit(user.id, "Demande d'accès refusée", `Consentement #${id}`, grant.requestMessage?.slice(0, 120) || "");
        return Response.json({ message: "Demande refusée. Le professionnel en est informé." });
      }

      const canModify = body.canModify === true;
      const canViewDocuments = body.canViewDocuments !== false;
      await db.update(careConsents).set({
        status: "accordé",
        decidedAt: new Date(),
        canView: true,
        canModify,
        canViewDocuments,
        expiresAt: new Date(Date.now() + 30 * 86400000),
      }).where(eq(careConsents.id, id));
      await writeAudit(user.id, "Demande d'accès accordée", `Consentement #${id}`, canModify ? "Consultation + modification" : "Consultation seule");
      return Response.json({ message: canModify ? "Accès accordé pour 30 jours, modification incluse." : "Accès en consultation accordé pour 30 jours." });
    }

    if (action === "grantConsent") {
      if (role !== "patient") return fail("Accès réservé au patient.", 403);
      const doctorId = asNumber(body.doctorId);
      const [doctor] = await db.select().from(doctors).where(eq(doctors.id, doctorId)).limit(1);
      if (!doctor || doctor.status !== "actif") return fail("Médecin invalide.");
      const purpose = asText(body.purpose);
      if (purpose.length < 5 || purpose.length > 180) return fail("Indiquez le motif précis de ce partage.");
      await db.insert(careConsents).values({
        patientId: user.id, doctorId, hospitalId: doctor.hospitalId, purpose, source: "patient",
        status: "accordé", decidedAt: new Date(),
        canView: true, canModify: body.canModify === true, canViewDocuments: body.canViewDocuments !== false,
        expiresAt: new Date(Date.now() + 30 * 86400000),
      });
      await writeAudit(user.id, "Consentement accordé", `Médecin #${doctorId}`, body.canModify === true ? "Consultation + modification, 30 jours" : "Consultation, 30 jours");
      return Response.json({ message: "Accès accordé pour 30 jours. Vous pouvez le révoquer à tout moment." });
    }

    if (action === "updateConsentPermissions") {
      // Le patient ajuste une autorisation déjà accordée, sans la révoquer.
      if (role !== "patient") return fail("Accès réservé au patient.", 403);
      const id = asNumber(body.id);
      const [grant] = await db.select().from(careConsents).where(and(eq(careConsents.id, id), eq(careConsents.patientId, user.id))).limit(1);
      if (!grant || grant.status !== "accordé" || grant.revokedAt) return fail("Autorisation introuvable ou inactive.");
      const canModify = body.canModify === true;
      const canViewDocuments = body.canViewDocuments !== false;
      await db.update(careConsents).set({ canModify, canViewDocuments }).where(eq(careConsents.id, id));
      await writeAudit(user.id, "Permissions modifiées", `Consentement #${id}`, canModify ? "Modification autorisée" : "Modification retirée");
      return Response.json({ message: "Permissions mises à jour." });
    }

    if (action === "updateRecord") {
      // Modification d'une donnée médicale : consentement de modification exigé,
      // et traçabilité complète du professionnel qui l'a effectuée.
      if (!["doctor", "hospital"].includes(role)) return fail("Action réservée aux professionnels de santé.", 403);
      const id = asNumber(body.id);
      const [record] = await db.select().from(medicalRecords).where(eq(medicalRecords.id, id)).limit(1);
      if (!record) return fail("Compte rendu introuvable.", 404);
      const blocked = await requireModify(user, record.patientId);
      if (blocked) return fail(`Modification refusée : ${blocked.reason}`, 403);
      if (role === "hospital" && record.hospitalId !== user.hospitalId) return fail("Ce compte rendu appartient à un autre établissement.", 403);

      const description = asText(body.description);
      const notes = asText(body.details);
      if (description.length < 3) return fail("Le contenu médical doit comporter au moins 3 caractères.");
      if (description.length > 4000 || notes.length > 4000) return fail("Contenu trop long (4 000 caractères maximum).");

      await db.update(medicalRecords).set({
        description,
        details: notes || record.details,
        updatedByUserId: user.id,
        updatedAt: new Date(),
        revision: record.revision + 1,
      }).where(eq(medicalRecords.id, id));

      const [patient] = await db.select().from(users).where(eq(users.id, record.patientId)).limit(1);
      await db.insert(notifications).values({
        userId: record.patientId,
        title: "Une donnée de votre dossier a été modifiée",
        message: `Le compte rendu « ${record.title.slice(0, 80)} » a été mis à jour par un professionnel autorisé. La modification est tracée dans le journal d’audit.`,
        category: "dossier",
      });
      await writeAudit(user.id, "Compte rendu modifié", `Patient ${patient?.npi || record.patientId}`, `Compte rendu #${id} · révision ${record.revision + 1} · ${user.fullName}`);
      return Response.json({ message: "Modification enregistrée et tracée." });
    }

    if (action === "revokeConsent") {
      if (role !== "patient") return fail("Accès réservé au patient.", 403);
      const [grant] = await db.select().from(careConsents).where(and(eq(careConsents.id, asNumber(body.id)), eq(careConsents.patientId, user.id))).limit(1);
      if (!grant || grant.revokedAt) return fail("Autorisation introuvable ou déjà révoquée.");
      await db.update(careConsents).set({ revokedAt: new Date() })
        .where(and(eq(careConsents.patientId, user.id), eq(careConsents.id, grant.id), isNull(careConsents.revokedAt)));
      await writeAudit(user.id, "Consentement révoqué", `Autorisation #${grant.id}`, "Effet immédiat");
      return Response.json({ message: "Tous les accès actifs de ce professionnel ont été révoqués immédiatement." });
    }

    if (action === "privacyRequest") {
      if (role !== "patient") return fail("Accès réservé au patient.", 403);
      const type = asText(body.type), message = asText(body.message);
      if (!["accès", "rectification", "effacement", "opposition"].includes(type) || message.length < 10 || message.length > 1000) return fail("Précisez votre demande en 10 à 1 000 caractères.");
      await db.insert(privacyRequests).values({ patientId: user.id, type, message });
      await writeAudit(user.id, "Exercice d'un droit", type, "Demande transmise au responsable de traitement");
      return Response.json({ message: "Votre demande a été enregistrée pour examen par l'équipe de protection des données." });
    }

    if (action === "reviewPrivacyRequest") {
      if (role !== "admin") return fail("Accès réservé à l'administration.", 403);
      const [item] = await db.select().from(privacyRequests).where(eq(privacyRequests.id, asNumber(body.id))).limit(1);
      if (!item || item.status !== "en attente") return fail("Demande déjà prise en charge.");
      await db.update(privacyRequests).set({ status: "en cours", reviewedAt: new Date() }).where(eq(privacyRequests.id, item.id));
      await writeAudit(user.id, "Prise en charge d'un droit", `Demande #${item.id}`, item.type);
      return Response.json({ message: "Demande prise en charge. Le traitement et la réponse au patient restent à effectuer." });
    }

    if (action === "updateSetting") {
      if (role !== "admin") return fail("Accès réservé à l'administration.", 403);
      const key = asText(body.key);
      const value = asText(body.value);
      if (!["registrations_open", "appointment_reminders", "blood_donation_alerts", "support_email"].includes(key)) return fail("Paramètre inconnu.");
      if (key === "support_email" ? !value.includes("@") : !["true", "false"].includes(value)) return fail("Valeur invalide.");
      await db.update(platformSettings).set({ value, updatedAt: new Date() }).where(eq(platformSettings.key, key));
      await writeAudit(user.id, "Modification des paramètres", key, value);
      return Response.json({ message: "Paramètre mis à jour." });
    }

    return fail("Action inconnue.");
  } catch (error) {
    console.error("Action error", error);
    const message = error instanceof Error && error.message.includes("unique") ? "Cette valeur est déjà utilisée." : "Une erreur est survenue. Réessayez.";
    return fail(message, 500);
  }
}