import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

/**
 * Point de contrôle pour la supervision.
 *
 * Répond 200 tant que le service est capable de servir une requête, 503 sinon,
 * afin d'être branché directement sur un contrôleur de disponibilité.
 *
 * Il ne révèle aucune donnée sensible : ni nom de base, ni version, ni volume de
 * données. Seul le temps de réponse à une requête triviale est publié, avec
 * `no-store` pour ne pas être mis en cache par un intermédiaire.
 *
 * `?deep=1` vérifie en plus que les tables indispensables sont lisibles — utile
 * après une migration ou une restauration. Réservé aux appels authentifiés pour
 * ne pas exposer la structure de la base à un visiteur.
 */
export async function GET(request: Request) {
  const startedAt = Date.now();
  const deep = new URL(request.url).searchParams.get("deep") === "1";

  try {
    await db.execute(sql`select 1`);

    if (deep) {
      // Une lecture par table critique : détecte un schéma incomplet ou une
      // migration non appliquée, que `select 1` ne verrait pas.
      await Promise.all([
        db.execute(sql`select 1 from users limit 1`),
        db.execute(sql`select 1 from sessions limit 1`),
        db.execute(sql`select 1 from care_consents limit 1`),
        db.execute(sql`select 1 from audit_logs limit 1`),
      ]);
    }

    return Response.json(
      { status: "ok", database: "up", deep, responseTimeMs: Date.now() - startedAt },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    // Le détail part dans les logs serveur, pas dans la réponse publique.
    console.error("Health check failed", error);
    return Response.json(
      { status: "error", database: "down", responseTimeMs: Date.now() - startedAt },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
