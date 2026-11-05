import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function encryptionKey() {
  const hex = process.env.DATA_ENCRYPTION_KEY;
  if (!hex || !/^[a-f0-9]{64}$/i.test(hex)) throw new Error("DATA_ENCRYPTION_KEY must be a 32-byte hex value");
  return Buffer.from(hex, "hex");
}

export function encryptValue(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `enc:v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${ciphertext.toString("base64url")}`;
}

export function decryptValue(value: string) {
  if (!value.startsWith("enc:v1:")) {
    throw new Error("Unencrypted sensitive value refused");
  }
  const [, , iv, tag, ciphertext] = value.split(":");
  if (!iv || !tag || !ciphertext) throw new Error("Invalid encrypted value");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
