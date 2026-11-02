import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const url = new URL(databaseUrl);
const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
if (!local && url.searchParams.get("sslmode") !== "require" && process.env.PG_SSL !== "true") {
  throw new Error("A remote PostgreSQL connection must require TLS (sslmode=require)");
}

const globalForDb = globalThis as typeof globalThis & { __santePool?: Pool };
export const pool = globalForDb.__santePool ?? new Pool({
  connectionString: databaseUrl,
  ssl: local ? undefined : { rejectUnauthorized: true, ...(process.env.PG_SSL_CA ? { ca: process.env.PG_SSL_CA } : {}) },
  max: 12,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 15_000,
});
if (process.env.NODE_ENV !== "production") globalForDb.__santePool = pool;
export const db = drizzle(pool);
