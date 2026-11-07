export type Role = "patient" | "doctor" | "hospital" | "admin";

export type UserView = { id: number; fullName: string; email: string; phone: string | null; role: string; npi: string | null; bloodGroup: string | null; birthDate: string | null; city: string | null; hospitalId: number | null; isActive: boolean; mustChangePassword: boolean; createdAt: string };
export type Hospital = { id: number; name: string; shortName: string; city: string; address: string; phone: string; type: string; latitude: number; longitude: number; bedsTotal: number; bedsOccupied: number; isActive: boolean };
export type Pharmacy = { id: number; name: string; city: string; address: string; phone: string; latitude: number; longitude: number; hours: string };
export type HealthFacilityListing = { id: number; sourceId: string; name: string | null; kind: "facility" | "pharmacy"; category: string; city: string | null; locality: string | null; address: string | null; phone: string | null; openingHours: string | null; latitude: number; longitude: number; sourceName: string; sourceUrl: string; sourceLicense: string; sourceSnapshotDate: string };
export type DoctorView = { id: number; userId: number; hospitalId: number; specialty: string; licenseNumber: string; status: string; yearsExperience: number; name: string; email: string; phone: string | null; hospitalName: string };
export type Appointment = { id: number; patientId: number; doctorId: number; hospitalId: number; scheduledAt: string; reason: string; type: string; status: string; createdAt: string };
export type MedicalRecord = { id: number; patientId: number; doctorId: number | null; hospitalId: number | null; category: string; title: string; description: string; details: string | null; recordedAt: string };
export type Medication = { name: string; dosage: string; frequency: string; duration: string };
export type Prescription = { id: number; patientId: number; doctorId: number; hospitalId: number; diagnosis: string; medications: Medication[]; notes: string | null; createdAt: string };
export type Payment = { id: number; patientId: number; hospitalId: number; appointmentId: number | null; title: string; amount: number; provider: string | null; status: string; reference: string | null; createdAt: string };
export type Notice = { id: number; userId: number; title: string; message: string; category: string; isRead: boolean; createdAt: string };
export type Donation = { id: number; patientId: number; hospitalId: number | null; status: string; donatedAt: string };
export type StockItem = { id: number; hospitalId: number; name: string; category: string; quantity: number; minQuantity: number; unit: string; price: number; expiryDate: string | null };
export type HospitalService = { id: number; hospitalId: number; name: string; bedsTotal: number; bedsOccupied: number; equipment: string };
export type AccessRequest = { id: number; applicantName: string; email: string; phone: string | null; role: string; organization: string | null; specialty: string | null; licenseNumber: string | null; status: string; createdAt: string; reviewedAt: string | null };
export type AuditLog = { id: number; userId: number | null; action: string; resource: string; details: string | null; createdAt: string };
export type PurchaseOrder = { id: number; hospitalId: number; supplier: string; itemName: string; quantity: number; totalCost: number; status: string; createdAt: string };
export type BloodStock = { id: number; hospitalId: number; bloodGroup: string; units: number; minUnits: number; updatedAt: string };
export type MedicalDocument = { id: number; patientId: number; doctorId: number | null; title: string; category: string; fileName: string; mimeType: string; createdAt: string };
export type PlatformSetting = { key: string; value: string; updatedAt: string };
export type CareConsent = { id: number; patientId: number; doctorId: number | null; hospitalId: number; purpose: string; source: string; canView: boolean; canModify: boolean; canViewDocuments: boolean; status: string; requestMessage: string | null; requestedAt: string | null; decidedAt: string | null; createdAt: string; expiresAt: string; revokedAt: string | null };

/** Demande d'accès telle que présentée au patient, avec l'identité du demandeur. */
export type ConsentRequest = CareConsent & {
  requesterName: string;
  requesterRole: string;
  requesterSpecialty: string | null;
};
export type PrivacyRequest = { id: number; patientId: number; type: string; message: string; status: string; createdAt: string; reviewedAt: string | null };

export type BootstrapData = {
  serverTime: string;
  user: UserView;
  hospitals: Hospital[];
  pharmacies: Pharmacy[];
  healthFacilities: HealthFacilityListing[];
  doctors: DoctorView[];
  users: UserView[];
  appointments: Appointment[];
  records: MedicalRecord[];
  prescriptions: Prescription[];
  payments: Payment[];
  notifications: Notice[];
  donations: Donation[];
  stocks: StockItem[];
  services: HospitalService[];
  requests: AccessRequest[];
  audit: AuditLog[];
  orders: PurchaseOrder[];
  bloodStocks: BloodStock[];
  documents: MedicalDocument[];
  settings: PlatformSetting[];
  consents: CareConsent[];
  consentRequests: ConsentRequest[];
  privacyRequests: PrivacyRequest[];
};
