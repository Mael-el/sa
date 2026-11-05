import { createHash } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { careConsents, doctors, rateLimits, users } from "@/db/schema";

export function sameOrigin(request: Request) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return true;
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true; // Non-browser API clients do not send Origin.
  try {
    const expected = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
    return new URL(origin).host === expected && new URL(origin).protocol === "https:" || (new URL(origin).host === expected && process.env.NODE_ENV !== "production");
  } catch { return false; }
}

export async function withinRateLimit(request: Request, purpose: string, maxHits: number, windowSeconds: number, identity = "") {
  const ip = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const key = createHash("sha256").update(`${purpose}|${ip}|${identity.toLowerCase()}`).digest("hex");
  const resetAt = new Date(Date.now() + windowSeconds * 1000);
  const [entry] = await db.insert(rateLimits).values({ key, hits: 1, resetAt }).onConflictDoUpdate({
    target: rateLimits.key,
    set: {
      hits: sql`CASE WHEN ${rateLimits.resetAt} < NOW() THEN 1 ELSE ${rateLimits.hits} + 1 END`,
      resetAt: sql`CASE WHEN ${rateLimits.resetAt} < NOW() THEN ${resetAt} ELSE ${rateLimits.resetAt} END`,
    },
  }).returning({ hits: rateLimits.hits });
  return entry.hits <= maxHits;
}

export async function hasCareConsent(current: typeof users.$inferSelect, patientId: number) {
  if (current.role === "patient") return current.id === patientId;
  if (current.role === "admin") return false;
  const conditions = [eq(careConsents.patientId, patientId), isNull(careConsents.revokedAt), gt(careConsents.expiresAt, new Date())];
  if (current.role === "doctor") {
    const [doctor] = await db.select({ id: doctors.id }).from(doctors).where(and(eq(doctors.userId, current.id), eq(doctors.status, "actif"))).limit(1);
    if (!doctor) return false;
    conditions.push(eq(careConsents.doctorId, doctor.id));
  } else if (current.role === "hospital" && current.hospitalId) conditions.push(eq(careConsents.hospitalId, current.hospitalId));
  else return false;
  const [grant] = await db.select({ id: careConsents.id }).from(careConsents).where(and(...conditions)).limit(1);
  return Boolean(grant);
}

export { passwordProblem } from "./passwords";
