import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

/**
 * Purge des données techniques expirées.
 *
 * Rien de ce qui a une valeur médicale ou légale n'est supprimé ici : ni les
 * dossiers, ni les ordonnances, ni le journal d'audit. Seules partent les
 * données dont la durée de vie est déjà fixée par le code.
 *
 *   sessions           expirées depuis plus de 30 jours (révoquées comprises)
 *   password_resets    expirés ou consommés depuis plus de 7 jours
 *   rate_limits        fenêtre de limitation échue
 *   notifications      lues depuis plus de 180 jours
 *
 * Les tables non listées sont laissées intactes volontairement. Toute
 * suppression de donnée de santé relève d'une demande d'exercice de droits
 * traitée par l'administration, pas d'un script planifié.
 *
 * Utilisation :
 *   node scripts/maintenance-purge.mjs [--dry-run]
 */

const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL or MIGRATION_DATABASE_URL is required");

const dryRun = process.argv.includes("--dry-run");
const DAY = 86400000;

const STEPS = [
  {
    table: "sessions",
    label: "Sessions expirées",
    where: "expires_at < NOW() - INTERVAL '30 days'",
    why: "Une session expirée n'a plus d'usage ; on garde 30 jours pour l'investigation d'incident.",
  },
  {
    table: "password_resets",
    label: "Codes de réinitialisation périmés",
    where: "expires_at < NOW() - INTERVAL '7 days' OR (used_at IS NOT NULL AND used_at < NOW() - INTERVAL '7 days')",
    why: "Le code est inutilisable dès expiration ; 7 jours suffisent à la traçabilité.",
  },
  {
    table: "rate_limits",
    label: "Compteurs de limitation échus",
    where: "reset_at < NOW()",
    why: "Fenêtre de limitation dépassée : plus aucun effet.",
  },
  {
    table: "notifications",
    label: "Notifications lues anciennes",
    where: "is_read = true AND created_at < NOW() - INTERVAL '180 days'",
    why: "Notifications lues de plus de 6 mois. Les notifications non lues sont conservées.",
  },
];

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  // Tableau de bord : le script doit pouvoir être exécuté sans risque et être
  // relu par un exploitant, d'où le détail par catégorie.
  console.log(`Purge de maintenance${dryRun ? " (simulation, aucune écriture)" : ""}`);
  console.log(`Base : ${new URL(url).host}${new URL(url).pathname}\n`);

  let total = 0;
  for (const step of STEPS) {
    let count = 0;
    if (dryRun) {
      const { rows } = await client.query(`SELECT count(*)::int AS count FROM ${step.table} WHERE ${step.where}`);
      count = rows[0].count;
    } else {
      const result = await client.query(`DELETE FROM ${step.table} WHERE ${step.where}`);
      count = result.rowCount;
    }
    total += count;
    console.log(`  ${step.label.padEnd(36)} ${String(count).padStart(6)}  ${step.why}`);
  }

  console.log(`\n${dryRun ? "À purger" : "Purgé"} : ${total} ligne(s).`);

  if (!dryRun && total > 0) {
    // La purge elle-même n'est pas une action utilisateur : on la trace sans
    // rattacher de compte, avec l'acteur système.
    await client.query(
      `INSERT INTO audit_logs (user_id, action, resource, details)
       VALUES (NULL, $1, $2, $3)`,
      ["Purge de maintenance", "Données techniques expirées", `${total} ligne(s) : ${STEPS.map((s) => s.table).join(", ")} · exécutée à ${new Date().toISOString()}`],
    );
    console.log("Opération consignée dans le journal d'audit.");
  }
} catch (error) {
  console.error("Purge interrompue :", error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
