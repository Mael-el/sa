import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { hash } from "bcryptjs";
import pg from "pg";

config({ path: ".env.local", quiet: true });

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
const databaseUrl = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("MIGRATION_DATABASE_URL or DATABASE_URL is required");

const client = new pg.Client({ connectionString: databaseUrl });
const email = `test.admin.${randomUUID()}@santeplus.test`;
const temporaryPassword = "SuperPassword2026!Awa";
const newPassword = "AdminChanged2026!Secure";
let userId;

async function post(body, cookie) {
  return fetch(`${base}/api/auth`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: base,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
    redirect: "manual",
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
}

try {
  await client.connect();
  const passwordHash = await hash(temporaryPassword, 12);
  const inserted = await client.query(
    `INSERT INTO users (full_name, email, password_hash, role, must_change_password, is_active)
     VALUES ('Test Admin Auth', $1, $2, 'admin', true, true) RETURNING id`,
    [email, passwordHash],
  );
  userId = inserted.rows[0].id;

  const login = await post({ action: "login", identifier: email, password: temporaryPassword });
  const loginBody = await login.json();
  assert(login.status === 200 && loginBody.needsPasswordChange, "Un administrateur doit remplacer son mot de passe temporaire");
  assert(!loginBody.needs2FA && !loginBody.needs2FASetup, "La connexion ne demande aucune configuration 2FA");

  const activation = await post({
    action: "completePasswordChange",
    challenge: loginBody.challenge,
    newPassword,
    confirmPassword: newPassword,
  });
  const activationBody = await activation.json();
  const setCookie = activation.headers.get("set-cookie") || "";
  const sessionCookie = setCookie.match(/sante_session=([^;]+)/)?.[0];
  assert(activation.status === 200 && activationBody.user?.role === "admin", "L’administrateur active son compte sans second facteur");
  assert(Boolean(sessionCookie), "L’activation crée une session");

  const bootstrap = await fetch(`${base}/api/bootstrap`, { headers: { Cookie: sessionCookie } });
  const bootstrapBody = await bootstrap.json();
  assert(bootstrap.status === 200 && bootstrapBody.user?.role === "admin", "La session administrateur ouvre l’espace protégé");

  const removedAction = await post({ action: "verify2fa", challenge: "disabled", code: "000000" }, sessionCookie);
  assert(removedAction.status === 400, "L’ancienne action verify2fa n’est plus disponible");
} finally {
  if (client.connectionParameters) {
    if (userId) {
      await client.query("DELETE FROM audit_logs WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM users WHERE id = $1", [userId]);
    }
    await client.end();
  }
}
