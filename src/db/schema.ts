import { boolean, doublePrecision, index, integer, jsonb, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  fullName: varchar("full_name", { length: 180 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  phone: varchar("phone", { length: 40 }).unique(),
  passwordHash: text("password_hash").notNull(),
  role: varchar("role", { length: 20 }).notNull().default("patient"),
  npi: varchar("npi", { length: 40 }).unique(),
  bloodGroup: varchar("blood_group", { length: 8 }),
  birthDate: varchar("birth_date", { length: 20 }),
  city: varchar("city", { length: 100 }).default("Cotonou"),
  hospitalId: integer("hospital_id"),
  isActive: boolean("is_active").notNull().default(true),
  isDemo: boolean("is_demo").notNull().default(false),
  privacyAcceptedAt: timestamp("privacy_accepted_at"),
  twoFactorSecret: text("two_factor_secret"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const hospitals = pgTable("hospitals", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  shortName: varchar("short_name", { length: 70 }).notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  address: text("address").notNull(),
  phone: varchar("phone", { length: 40 }).notNull(),
  type: varchar("type", { length: 80 }).notNull().default("Hôpital public"),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  bedsTotal: integer("beds_total").notNull().default(0),
  bedsOccupied: integer("beds_occupied").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

export const doctors = pgTable("doctors", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  hospitalId: integer("hospital_id").notNull().references(() => hospitals.id),
  specialty: varchar("specialty", { length: 120 }).notNull(),
  licenseNumber: varchar("license_number", { length: 60 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("actif"),
  yearsExperience: integer("years_experience").notNull().default(0),
});

export const appointments = pgTable("appointments", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => users.id),
  doctorId: integer("doctor_id").notNull().references(() => doctors.id),
  hospitalId: integer("hospital_id").notNull().references(() => hospitals.id),
  scheduledAt: timestamp("scheduled_at").notNull(),
  reason: text("reason").notNull().default("Consultation générale"),
  type: varchar("type", { length: 60 }).notNull().default("Consultation"),
  status: varchar("status", { length: 30 }).notNull().default("confirmé"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [index("appointment_patient_date_idx").on(table.patientId, table.scheduledAt), index("appointment_doctor_date_idx").on(table.doctorId, table.scheduledAt), index("appointment_hospital_idx").on(table.hospitalId)]);

export const medicalRecords = pgTable("medical_records", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => users.id),
  doctorId: integer("doctor_id").references(() => doctors.id),
  hospitalId: integer("hospital_id").references(() => hospitals.id),
  category: varchar("category", { length: 40 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description").notNull(),
  details: text("details"),
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
}, (table) => [index("medical_record_patient_date_idx").on(table.patientId, table.recordedAt)]);

export type Medication = { name: string; dosage: string; frequency: string; duration: string };

export const prescriptions = pgTable("prescriptions", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => users.id),
  doctorId: integer("doctor_id").notNull().references(() => doctors.id),
  hospitalId: integer("hospital_id").notNull().references(() => hospitals.id),
  diagnosis: text("diagnosis").notNull(),
  medications: jsonb("medications").$type<Medication[]>().notNull().default([]),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [index("prescription_patient_date_idx").on(table.patientId, table.createdAt)]);

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => users.id),
  hospitalId: integer("hospital_id").notNull().references(() => hospitals.id),
  appointmentId: integer("appointment_id").references(() => appointments.id),
  title: varchar("title", { length: 180 }).notNull(),
  amount: integer("amount").notNull(),
  provider: varchar("provider", { length: 30 }),
  status: varchar("status", { length: 30 }).notNull().default("en attente"),
  reference: varchar("reference", { length: 80 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [index("payment_patient_idx").on(table.patientId), index("payment_hospital_idx").on(table.hospitalId)]);

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  title: varchar("title", { length: 180 }).notNull(),
  message: text("message").notNull(),
  category: varchar("category", { length: 40 }).notNull().default("info"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [index("notification_user_date_idx").on(table.userId, table.createdAt)]);

export const bloodDonations = pgTable("blood_donations", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => users.id),
  hospitalId: integer("hospital_id").references(() => hospitals.id),
  status: varchar("status", { length: 30 }).notNull().default("planifié"),
  donatedAt: timestamp("donated_at").notNull().defaultNow(),
});

export const stockItems = pgTable("stock_items", {
  id: serial("id").primaryKey(),
  hospitalId: integer("hospital_id").notNull().references(() => hospitals.id),
  name: varchar("name", { length: 180 }).notNull(),
  category: varchar("category", { length: 80 }).notNull(),
  quantity: integer("quantity").notNull().default(0),
  minQuantity: integer("min_quantity").notNull().default(10),
  unit: varchar("unit", { length: 30 }).notNull().default("unités"),
  price: integer("price").notNull().default(0),
  expiryDate: timestamp("expiry_date"),
});

export const hospitalServices = pgTable("hospital_services", {
  id: serial("id").primaryKey(),
  hospitalId: integer("hospital_id").notNull().references(() => hospitals.id),
  name: varchar("name", { length: 120 }).notNull(),
  bedsTotal: integer("beds_total").notNull().default(0),
  bedsOccupied: integer("beds_occupied").notNull().default(0),
  equipment: text("equipment").notNull().default(""),
});

export const accessRequests = pgTable("access_requests", {
  id: serial("id").primaryKey(),
  applicantName: varchar("applicant_name", { length: 180 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 40 }),
  role: varchar("role", { length: 20 }).notNull(),
  organization: varchar("organization", { length: 180 }),
  specialty: varchar("specialty", { length: 120 }),
  status: varchar("status", { length: 20 }).notNull().default("en attente"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
});

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  action: varchar("action", { length: 140 }).notNull(),
  resource: varchar("resource", { length: 140 }).notNull(),
  details: text("details"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [index("audit_actor_date_idx").on(table.userId, table.createdAt)]);

export const pharmacies = pgTable("pharmacies", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 180 }).notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  address: text("address").notNull(),
  phone: varchar("phone", { length: 40 }).notNull(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  hours: varchar("hours", { length: 100 }).notNull().default("08:00 – 20:00"),
});

export const purchaseOrders = pgTable("purchase_orders", {
  id: serial("id").primaryKey(),
  hospitalId: integer("hospital_id").notNull().references(() => hospitals.id),
  supplier: varchar("supplier", { length: 180 }).notNull(),
  itemName: varchar("item_name", { length: 180 }).notNull(),
  quantity: integer("quantity").notNull(),
  totalCost: integer("total_cost").notNull().default(0),
  status: varchar("status", { length: 30 }).notNull().default("commandé"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const bloodStocks = pgTable("blood_stocks", {
  id: serial("id").primaryKey(),
  hospitalId: integer("hospital_id").notNull().references(() => hospitals.id),
  bloodGroup: varchar("blood_group", { length: 8 }).notNull(),
  units: integer("units").notNull().default(0),
  minUnits: integer("min_units").notNull().default(10),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const medicalDocuments = pgTable("medical_documents", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => users.id),
  doctorId: integer("doctor_id").references(() => doctors.id),
  title: varchar("title", { length: 180 }).notNull(),
  category: varchar("category", { length: 40 }).notNull().default("analyse"),
  fileName: varchar("file_name", { length: 200 }).notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  data: text("data").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const platformSettings = pgTable("platform_settings", {
  key: varchar("key", { length: 80 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  userId: integer("user_id").notNull().references(() => users.id),
  twoFactorVerified: boolean("two_factor_verified").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
});

export const careConsents = pgTable("care_consents", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => users.id),
  doctorId: integer("doctor_id").references(() => doctors.id),
  hospitalId: integer("hospital_id").notNull().references(() => hospitals.id),
  purpose: varchar("purpose", { length: 180 }).notNull().default("Prise en charge médicale"),
  source: varchar("source", { length: 40 }).notNull().default("patient"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
}, (table) => [index("consent_patient_idx").on(table.patientId), index("consent_doctor_expiry_idx").on(table.doctorId, table.expiresAt), index("consent_hospital_expiry_idx").on(table.hospitalId, table.expiresAt)]);

export const rateLimits = pgTable("rate_limits", {
  key: varchar("key", { length: 64 }).primaryKey(),
  hits: integer("hits").notNull().default(0),
  resetAt: timestamp("reset_at").notNull(),
});

export const privacyRequests = pgTable("privacy_requests", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => users.id),
  type: varchar("type", { length: 40 }).notNull(),
  message: text("message").notNull(),
  status: varchar("status", { length: 30 }).notNull().default("en attente"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
}, (table) => [index("privacy_request_patient_idx").on(table.patientId)]);
