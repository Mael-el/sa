import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 48) throw new Error("SESSION_SECRET must be at least 48 characters");
if (!/^[a-f0-9]{64}$/i.test(process.env.DATA_ENCRYPTION_KEY || "")) throw new Error("DATA_ENCRYPTION_KEY must be 64 hexadecimal characters");

const email = (process.env.ADMIN_EMAIL || "admin@santeplus.bj").trim().toLowerCase();
const fullName = (process.env.ADMIN_NAME || "Administrateur SANTÉ+").trim();
let password = process.env.ADMIN_INITIAL_PASSWORD;
const generated = !password;
if (!password) password = `${randomBytes(15).toString("base64url")}!A7`;
if (password.length < 12) throw new Error("ADMIN_INITIAL_PASSWORD must be at least 12 characters");

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const { rows } = await client.query("SELECT count(*)::int AS count FROM users");
  if (rows[0].count > 0) {
    const existing = await client.query("SELECT email, role, must_change_password FROM users LIMIT 1");
    if (rows[0].count === 1 && existing.rows[0].role === "admin" && existing.rows[0].email === email) {
      console.log(`Administrateur déjà initialisé : ${email}. Aucun mot de passe réinitialisé.`);
      process.exit(0);
    }
    throw new Error("La base contient déjà des comptes. Utilisez une base vide pour l'initialisation.");
  }
  const passwordHash = await hash(password, 12);
  await client.query("BEGIN");
  const admin = await client.query(
    `INSERT INTO users (full_name, email, password_hash, role, must_change_password, is_active)
     VALUES ($1, $2, $3, 'admin', true, true) RETURNING id`,
    [fullName, email, passwordHash]
  );
  await client.query(
    `INSERT INTO platform_settings (key, value) VALUES
      ('registrations_open', 'true'),
      ('appointment_reminders', 'true'),
      ('blood_donation_alerts', 'true'),
      ('support_email', $1)
     ON CONFLICT (key) DO NOTHING`,
    [process.env.ADMIN_SUPPORT_EMAIL || "contact@santeplus.bj"]
  );
  await client.query(
    `INSERT INTO audit_logs (user_id, action, resource, details) VALUES ($1, 'Initialisation', 'Compte administrateur', 'Création unique par script sécurisé')`,
    [admin.rows[0].id]
  );
  await client.query("COMMIT");
  console.log("\nCompte administrateur créé (à usage unique, première connexion) :");
  console.log(`Email : ${email}`);
  if (generated) console.log(`Mot de passe temporaire : ${password}`);
  else console.log("Mot de passe temporaire : celui fourni via ADMIN_INITIAL_PASSWORD");
  console.log("À la première connexion : remplacez ce mot de passe temporaire.\n");
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await client.end();
}
