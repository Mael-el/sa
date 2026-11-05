import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { passwordResets } from "@/db/schema";

/** Alphabet sans caractères ambigus (pas de I, O, 0, 1). */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const RESET_TTL_MINUTES = 30;

const digest = (code: string) => createHash("sha256").update(code.trim().toUpperCase()).digest("hex");

export function generateResetCode() {
  const bytes = randomBytes(12);
  let raw = "";
  for (const byte of bytes) raw += ALPHABET[byte % ALPHABET.length];
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

/** Invalide les codes précédents et émet un code à usage unique, valable 30 minutes. */
export async function issueResetCode(userId: number, requestedVia: "auto" | "admin" = "auto") {
  await db
    .update(passwordResets)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResets.userId, userId), isNull(passwordResets.usedAt)));
  const code = generateResetCode();
  const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000);
  await db.insert(passwordResets).values({ userId, tokenHash: digest(code), requestedVia, expiresAt });
  return { code, expiresAt };
}

/** Retourne l'enregistrement valide (non utilisé, non expiré) pour cet utilisateur et ce code. */
export async function findValidReset(userId: number, code: string) {
  if (!code || code.trim().length < 8) return null;
  const [record] = await db
    .select()
    .from(passwordResets)
    .where(and(eq(passwordResets.userId, userId), eq(passwordResets.tokenHash, digest(code)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date())))
    .limit(1);
  return record ?? null;
}

export async function consumeReset(id: number) {
  await db.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, id));
}
