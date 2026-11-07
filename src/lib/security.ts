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

// La logique d'autorisation vit désormais dans consents.ts : un seul endroit
// décide de ce qu'un rôle peut consulter ou modifier.
export { consentPermissions, hasCareConsent, requireModify, requireView } from "./consents";

export { passwordProblem } from "./passwords";
