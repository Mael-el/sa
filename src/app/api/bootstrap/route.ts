import { and, asc, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { accessRequests, appointments, auditLogs, bloodDonations, bloodStocks, careConsents, doctors, healthFacilityListings, hospitalServices, hospitals, medicalDocuments, medicalRecords, notifications, payments, pharmacies, platformSettings, prescriptions, privacyRequests, purchaseOrders, stockItems, users } from "@/db/schema";
import { getSessionUser, publicUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const current = await getSessionUser();
    if (!current) return Response.json({ error: "Connexion requise.", code: "AUTH_REQUIRED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    const role = current.role;
    const ownDoctor = role === "doctor" ? (await db.select().from(doctors).where(eq(doctors.userId, current.id)).limit(1))[0] : null;
    const ownHospitalId = current.hospitalId || -1;
    const grantWhere = role === "patient" ? eq(careConsents.patientId, current.id) : role === "doctor" ? eq(careConsents.doctorId, ownDoctor?.id || -1) : role === "hospital" ? eq(careConsents.hospitalId, ownHospitalId) : undefined;
    const grants = grantWhere ? await db.select().from(careConsents).where(grantWhere).orderBy(desc(careConsents.createdAt)).limit(300) : [];
    const grantedIds = [...new Set(grants.filter((item) => !item.revokedAt && item.expiresAt > new Date()).map((item) => item.patientId))];
    const [allHospitals, allPharmacies, allHealthFacilities, allDoctorsJoined, allAppointments, allUsers, allRecords, allPrescriptions, allPayments, allNotifications, allDonations, allStocks, allServices, allRequests, allAudit, allOrders, allBloodStocks, allDocuments, allSettings, allPrivacyRequests] = await Promise.all([
      db.select().from(hospitals).limit(1000),
      db.select().from(pharmacies).limit(1000),
      db.select({
        id: healthFacilityListings.id,
        sourceId: healthFacilityListings.sourceId,
        name: healthFacilityListings.name,
        kind: healthFacilityListings.kind,
        category: healthFacilityListings.category,
        city: healthFacilityListings.city,
        locality: healthFacilityListings.locality,
        address: healthFacilityListings.address,
        phone: healthFacilityListings.phone,
        openingHours: healthFacilityListings.openingHours,
        latitude: healthFacilityListings.latitude,
        longitude: healthFacilityListings.longitude,
        sourceName: healthFacilityListings.sourceName,
        sourceUrl: healthFacilityListings.sourceUrl,
        sourceLicense: healthFacilityListings.sourceLicense,
        sourceSnapshotDate: healthFacilityListings.sourceSnapshotDate,
      }).from(healthFacilityListings).orderBy(asc(healthFacilityListings.locality), asc(healthFacilityListings.name)).limit(5000),
      db.select({ doctor: doctors, doctorUser: users }).from(doctors).innerJoin(users, eq(doctors.userId, users.id)).limit(1000),
      role === "patient" ? db.select().from(appointments).where(eq(appointments.patientId, current.id)).orderBy(desc(appointments.scheduledAt)).limit(200) : role === "doctor" ? db.select().from(appointments).where(eq(appointments.doctorId, ownDoctor?.id || -1)).orderBy(desc(appointments.scheduledAt)).limit(200) : role === "hospital" ? db.select().from(appointments).where(eq(appointments.hospitalId, ownHospitalId)).orderBy(desc(appointments.scheduledAt)).limit(300) : db.select().from(appointments).orderBy(desc(appointments.scheduledAt)).limit(500),
      role === "patient" ? db.select().from(users).where(eq(users.id, current.id)) : role === "admin" ? db.select().from(users).orderBy(desc(users.createdAt)).limit(500) : grantedIds.length ? db.select().from(users).where(and(eq(users.role, "patient"), inArray(users.id, grantedIds))).limit(300) : Promise.resolve([]),
      role === "patient" ? db.select().from(medicalRecords).where(eq(medicalRecords.patientId, current.id)).orderBy(desc(medicalRecords.recordedAt)).limit(300) : role === "hospital" && grantedIds.length ? db.select().from(medicalRecords).where(and(eq(medicalRecords.hospitalId, ownHospitalId), inArray(medicalRecords.patientId, grantedIds))).orderBy(desc(medicalRecords.recordedAt)).limit(300) : Promise.resolve([]),
      role === "patient" ? db.select().from(prescriptions).where(eq(prescriptions.patientId, current.id)).orderBy(desc(prescriptions.createdAt)).limit(200) : role === "doctor" && ownDoctor && grantedIds.length ? db.select().from(prescriptions).where(and(eq(prescriptions.doctorId, ownDoctor.id), inArray(prescriptions.patientId, grantedIds))).orderBy(desc(prescriptions.createdAt)).limit(200) : role === "hospital" && grantedIds.length ? db.select().from(prescriptions).where(and(eq(prescriptions.hospitalId, ownHospitalId), inArray(prescriptions.patientId, grantedIds))).orderBy(desc(prescriptions.createdAt)).limit(200) : Promise.resolve([]),
      role === "patient" ? db.select().from(payments).where(eq(payments.patientId, current.id)).orderBy(desc(payments.createdAt)).limit(200) : role === "hospital" ? db.select().from(payments).where(eq(payments.hospitalId, ownHospitalId)).orderBy(desc(payments.createdAt)).limit(300) : role === "admin" ? db.select().from(payments).orderBy(desc(payments.createdAt)).limit(500) : Promise.resolve([]),
      db.select().from(notifications).where(eq(notifications.userId, current.id)).orderBy(desc(notifications.createdAt)).limit(100),
      role === "patient" ? db.select().from(bloodDonations).where(eq(bloodDonations.patientId, current.id)).limit(100) : role === "hospital" ? db.select().from(bloodDonations).where(eq(bloodDonations.hospitalId, ownHospitalId)).limit(200) : role === "admin" ? db.select().from(bloodDonations).limit(300) : Promise.resolve([]),
      role === "hospital" ? db.select().from(stockItems).where(eq(stockItems.hospitalId, ownHospitalId)).limit(500) : role === "admin" ? db.select().from(stockItems).limit(500) : Promise.resolve([]),
      role === "hospital" ? db.select().from(hospitalServices).where(eq(hospitalServices.hospitalId, ownHospitalId)).limit(200) : role === "admin" ? db.select().from(hospitalServices).limit(500) : Promise.resolve([]),
      role === "admin" ? db.select().from(accessRequests).orderBy(desc(accessRequests.createdAt)).limit(300) : Promise.resolve([]),
      role === "admin" ? db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(300) : db.select().from(auditLogs).where(eq(auditLogs.userId, current.id)).orderBy(desc(auditLogs.createdAt)).limit(100),
      role === "hospital" ? db.select().from(purchaseOrders).where(eq(purchaseOrders.hospitalId, ownHospitalId)).limit(300) : role === "admin" ? db.select().from(purchaseOrders).limit(300) : Promise.resolve([]),
      role === "hospital" ? db.select().from(bloodStocks).where(eq(bloodStocks.hospitalId, ownHospitalId)).limit(100) : role === "admin" ? db.select().from(bloodStocks).limit(300) : Promise.resolve([]),
      role === "patient" ? db.select({ id: medicalDocuments.id, patientId: medicalDocuments.patientId, doctorId: medicalDocuments.doctorId, title: medicalDocuments.title, category: medicalDocuments.category, fileName: medicalDocuments.fileName, mimeType: medicalDocuments.mimeType, createdAt: medicalDocuments.createdAt }).from(medicalDocuments).where(eq(medicalDocuments.patientId, current.id)).limit(200) : role === "doctor" && grantedIds.length ? db.select({ id: medicalDocuments.id, patientId: medicalDocuments.patientId, doctorId: medicalDocuments.doctorId, title: medicalDocuments.title, category: medicalDocuments.category, fileName: medicalDocuments.fileName, mimeType: medicalDocuments.mimeType, createdAt: medicalDocuments.createdAt }).from(medicalDocuments).where(inArray(medicalDocuments.patientId, grantedIds)).limit(200) : role === "hospital" && grantedIds.length ? db.select({ id: medicalDocuments.id, patientId: medicalDocuments.patientId, doctorId: medicalDocuments.doctorId, title: medicalDocuments.title, category: medicalDocuments.category, fileName: medicalDocuments.fileName, mimeType: medicalDocuments.mimeType, createdAt: medicalDocuments.createdAt }).from(medicalDocuments).where(inArray(medicalDocuments.patientId, grantedIds)).limit(200) : Promise.resolve([]),
      role === "admin" ? db.select().from(platformSettings) : Promise.resolve([]),
      role === "patient" ? db.select().from(privacyRequests).where(eq(privacyRequests.patientId, current.id)).limit(100) : role === "admin" ? db.select().from(privacyRequests).orderBy(desc(privacyRequests.createdAt)).limit(200) : Promise.resolve([]),
    ]);
    const doctorViews = allDoctorsJoined.filter(({ doctor }) => role !== "hospital" || doctor.hospitalId === ownHospitalId).map(({ doctor, doctorUser }) => ({ ...doctor, name: doctorUser.fullName, email: doctorUser.email, phone: doctorUser.phone, hospitalName: allHospitals.find((hospital) => hospital.id === doctor.hospitalId)?.shortName || "" }));
    const visibleUsers = allUsers.map((user) => role === "admin" ? { ...publicUser(user), bloodGroup: null, birthDate: null } : publicUser(user));
    return Response.json({ serverTime: new Date().toISOString(), user: publicUser(current), hospitals: allHospitals, pharmacies: allPharmacies, healthFacilities: allHealthFacilities, doctors: doctorViews, users: visibleUsers, appointments: allAppointments, records: allRecords, prescriptions: allPrescriptions, payments: allPayments, notifications: allNotifications, donations: allDonations, stocks: allStocks, services: allServices, requests: allRequests, audit: allAudit, orders: allOrders, bloodStocks: allBloodStocks, documents: allDocuments, settings: allSettings, consents: role === "patient" ? grants : [], privacyRequests: allPrivacyRequests }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { console.error("Bootstrap error", error); return Response.json({ error: "Impossible de charger les données." }, { status: 500 }); }
}
