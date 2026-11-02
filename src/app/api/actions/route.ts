import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { accessRequests, appointments, auditLogs, bloodDonations, bloodStocks, careConsents, doctors, hospitalServices, hospitals, medicalRecords, notifications, payments, platformSettings, prescriptions, privacyRequests, purchaseOrders, sessions, stockItems, users, type Medication } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { encryptValue } from "@/lib/crypto";
import { hasCareConsent, sameOrigin, withinRateLimit } from "@/lib/security";
import { checkInteractions } from "@/lib/clinical";

export const dynamic = "force-dynamic";

const fail = (error: string, status = 400) => Response.json({ error }, { status });
const asNumber = (value: unknown) => Number(value);
const asText = (value: unknown) => String(value ?? "").trim();

async function writeAudit(userId: number, action: string, resource: string, details?: string) {
  await db.insert(auditLogs).values({ userId, action, resource, details });
}

function toBase32(buffer: Buffer) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let result = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { result += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) result += alphabet[(value << (5 - bits)) & 31];
  return result;
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
      if (role !== "patient") return fail("Action réservée aux patients.", 403);
      const provider = asText(body.provider);
      const phone = asText(body.phone);
      if (!["MTN MoMo", "Moov Money"].includes(provider) || phone.replace(/\D/g, "").length < 8) return fail("Choisissez un opérateur et saisissez un numéro valide.");
      const [payment] = await db.select().from(payments).where(and(eq(payments.id, asNumber(body.id)), eq(payments.patientId, user.id))).limit(1);
      if (!payment || payment.status === "payé") return fail("Facture introuvable ou déjà réglée.");
      if (!user.isDemo) return fail("Le paiement réel Mobile Money n'est pas encore configuré. Aucun débit n'a été effectué.", 503);
      const reference = `SP-${provider === "MTN MoMo" ? "MTN" : "MOOV"}-${Date.now().toString().slice(-8)}`;
      await db.update(payments).set({ status: "payé", provider, reference }).where(eq(payments.id, payment.id));
      await db.insert(notifications).values({ userId: user.id, title: "Paiement enregistré", message: `Votre paiement de ${payment.amount.toLocaleString("fr-FR")} FCFA a été enregistré en mode démonstration. Réf. ${reference}.`, category: "paiement" });
      await writeAudit(user.id, "Paiement simulé", `Facture #${payment.id}`, `${provider} · ${reference}`);
      return Response.json({ message: "Paiement de démonstration enregistré. Aucun compte Mobile Money n'a été débité.", reference });
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
      if (fullName.length < 2 || fullName.length > 180 || city.length > 100 || phone.length < 8) return fail("Vérifiez votre nom, votre ville et votre numéro.");
      await db.update(users).set({ fullName, city, phone }).where(eq(users.id, user.id));
      await writeAudit(user.id, "Modification de profil", "Compte utilisateur");
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
      await db.insert(accessRequests).values({ applicantName, email, phone: asText(body.phone), role: "doctor", specialty: asText(body.specialty), organization: hospital?.shortName || "" });
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
      let credentials: { email: string; password: string; totpSecret: string } | undefined;
      if (decision === "approuvé") {
        const [existing] = await db.select().from(users).where(eq(users.email, access.email)).limit(1);
        if (existing) return fail("Un compte utilise déjà cette adresse email.", 409);
        let hospitalId: number;
        if (access.role === "hospital") {
          const [created] = await db.insert(hospitals).values({ name: access.organization || access.applicantName, shortName: (access.organization || access.applicantName).slice(0, 70), city: "Cotonou", address: "Adresse à compléter", phone: access.phone || "À compléter", type: "Établissement de santé", latitude: 6.365, longitude: 2.423, bedsTotal: 0, bedsOccupied: 0 }).returning();
          hospitalId = created.id;
        } else {
          const allHospitals = await db.select().from(hospitals);
          const matched = allHospitals.find((item) => item.shortName.toLowerCase() === (access.organization || "").toLowerCase() || item.name.toLowerCase().includes((access.organization || "_____").toLowerCase()));
          if (!matched) return fail("Établissement introuvable. Créez d'abord l'établissement concerné.");
          hospitalId = matched.id;
        }
        const password = `${randomBytes(9).toString("base64url")}!A2`;
        const secretBytes = randomBytes(20);
        const [createdUser] = await db.insert(users).values({ fullName: access.applicantName, email: access.email, phone: access.phone, passwordHash: await hash(password, 12), role: access.role, hospitalId, city: "Cotonou", twoFactorSecret: encryptValue(secretBytes.toString("hex")) }).returning();
        if (access.role === "doctor") await db.insert(doctors).values({ userId: createdUser.id, hospitalId, specialty: access.specialty || "Médecine générale", licenseNumber: `ONMB-${new Date().getFullYear()}-${createdUser.id}`, yearsExperience: 0 });
        credentials = { email: access.email, password, totpSecret: toBase32(secretBytes) };
      }
      await db.update(accessRequests).set({ status: decision, reviewedAt: new Date() }).where(eq(accessRequests.id, access.id));
      await writeAudit(user.id, decision === "approuvé" ? "Accès approuvé" : "Accès refusé", access.applicantName, access.role);
      return Response.json({ message: decision === "approuvé" ? "Accès validé. Communiquez les identifiants par un canal sécurisé." : "Demande refusée.", credentials });
    }

    if (action === "toggleUser") {
      if (role !== "admin") return fail("Accès réservé à l'administration.", 403);
      const [target] = await db.select().from(users).where(eq(users.id, asNumber(body.id))).limit(1);
      if (!target || target.id === user.id || target.isDemo) return fail("Ce compte de démonstration ne peut pas être désactivé.");
      await db.update(users).set({ isActive: !target.isActive }).where(eq(users.id, target.id));
      if (target.isActive) await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, target.id));
      await writeAudit(user.id, target.isActive ? "Désactivation de compte" : "Activation de compte", target.fullName);
      return Response.json({ message: `Compte ${target.isActive ? "désactivé" : "activé"}.` });
    }

    if (action === "grantConsent") {
      if (role !== "patient") return fail("Accès réservé au patient.", 403);
      const doctorId = asNumber(body.doctorId);
      const [doctor] = await db.select().from(doctors).where(eq(doctors.id, doctorId)).limit(1);
      if (!doctor || doctor.status !== "actif") return fail("Médecin invalide.");
      const purpose = asText(body.purpose);
      if (purpose.length < 5 || purpose.length > 180) return fail("Indiquez le motif précis de ce partage.");
      await db.insert(careConsents).values({ patientId: user.id, doctorId, hospitalId: doctor.hospitalId, purpose, source: "patient", expiresAt: new Date(Date.now() + 30 * 86400000) });
      await writeAudit(user.id, "Consentement accordé", `Médecin #${doctorId}`, "Accès limité à 30 jours");
      return Response.json({ message: "Accès accordé pour 30 jours. Vous pouvez le révoquer à tout moment." });
    }

    if (action === "revokeConsent") {
      if (role !== "patient") return fail("Accès réservé au patient.", 403);
      const [grant] = await db.select().from(careConsents).where(and(eq(careConsents.id, asNumber(body.id)), eq(careConsents.patientId, user.id))).limit(1);
      if (!grant || grant.revokedAt) return fail("Autorisation introuvable ou déjà révoquée.");
      if (grant.doctorId) await db.update(careConsents).set({ revokedAt: new Date() }).where(and(eq(careConsents.patientId, user.id), eq(careConsents.doctorId, grant.doctorId), isNull(careConsents.revokedAt)));
      else await db.update(careConsents).set({ revokedAt: new Date() }).where(and(eq(careConsents.patientId, user.id), eq(careConsents.hospitalId, grant.hospitalId), isNull(careConsents.doctorId), isNull(careConsents.revokedAt)));
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