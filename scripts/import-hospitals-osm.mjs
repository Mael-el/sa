import { readFileSync } from "node:fs";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

/**
 * Enregistre dans la table `hospitals` les établissements de santé béninois
 * réellement cartographiés dans OpenStreetMap, issus de l'export HOT/HDX
 * « hotosm_ben_health_facilities_points_geojson » (relevé du 2025-02-04, ODbL-1.0).
 *
 * Périmètre volontairement restreint aux hôpitaux et cliniques portant un nom
 * distinctif. Sont écartés :
 * - les équipements génériques (« Centre de santé », « Maternité », « Clinique »)
 *   qui ne désignent aucun établissement identifiable ;
 * - les doublons (même nom dans la même ville).
 *
 * Aucune donnée n'est inventée : les colonnes obligatoires du schéma que la source
 * ne fournit pas (adresse postale, téléphone, nombre de lits) sont laissées vides
 * ou à zéro, jamais renseignées par approximation.
 *
 * Utilisation :
 *   node scripts/import-hospitals-osm.mjs --file=/tmp/ben.geojson [--dry-run]
 */

const SOURCE_NAME = "OpenStreetMap";
const SNAPSHOT_DATE = "2025-02-04";
const DATABASE_URL = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL or MIGRATION_DATABASE_URL is required");

const CITIES = {
  "Cotonou": [6.3654, 2.4183],
  "Abomey-Calavi": [6.4489, 2.3556],
  "Porto-Novo": [6.4969, 2.6289],
  "Parakou": [9.3372, 2.6303],
  "Djougou": [9.7085, 1.6659],
  "Bohicon": [7.1783, 2.0667],
  "Natitingou": [10.3042, 1.3797],
  "Abomey": [7.1826, 1.9912],
  "Ouidah": [6.3631, 2.0850],
  "Lokossa": [6.6390, 1.7167],
  "Savalou": [7.9281, 1.9758],
  "Savè": [8.0342, 2.4858],
  "Kandi": [11.1342, 2.9386],
  "Malanville": [11.8667, 3.3833],
  "Nikki": [9.9400, 3.2100],
  "Pobè": [6.9800, 2.6650],
  "Sakété": [6.7364, 2.6586],
  "Allada": [6.6650, 2.1514],
  "Comè": [6.4069, 1.8825],
  "Aplahoué": [6.9333, 1.6833],
  "Dogbo": [6.8000, 1.7833],
  "Bassar": [9.2500, 0.7833],
  "Tanguiéta": [10.6167, 1.2667],
  "Banikoara": [11.2983, 2.4386],
  "Kétou": [7.3633, 2.5997],
  "Dassa-Zoumè": [7.7500, 2.1833],
  "Tchaourou": [8.8864, 2.5975],
  "Bembèrèkè": [10.2283, 2.6636],
  "N'Dali": [9.7500, 2.7167],
  "Gogounou": [10.8333, 2.8333],
};
const CITY_RADIUS_DEGREES = 0.22; // ~24 km

/** Noms qui ne désignent aucun établissement identifiable : écartés. */
const GENERIC_NAMES = new Set([
  "centre", "centre de sante", "centre de santé", "cs", "css", "centre medical", "centre médical",
  "maternite", "maternité", "clinique", "clinique privee", "clinique privée", "dispensaire",
  "hopital", "hôpital", "hospital", "poste de sante", "poste de santé", "cabinet", "cabinet medical",
  "cabinet médical", "polyclinique", "pharmacie", "health centre", "health center", "clinic",
]);

/** Libellés qui désignent un service interne ou un équipement, pas un établissement. */
const SERVICE_LABELS = /^(bloc op[eé]ratoire|chirurgie|urgences?|r[eé]animation|radiologie|imagerie|laboratoire|maternit[eé]|p[eé]diatrie|pharmacie|consultations?|hospitalisation|salle de soins|accueil|administration)$/i;

/** Intitulés administratifs sans identité propre (un par commune : ingérable). */
const ANONYMOUS_PATTERN = /^centre de sant[eé] d.arrondissement$/i;

const normalize = (value) => value
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9 ]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const bounded = (value, length) => (typeof value === "string" && value.trim() ? value.trim().slice(0, length) : null);

function nearestCity(latitude, longitude) {
  let best = null;
  let bestDistance = Infinity;
  for (const [name, [lat, lon]] of Object.entries(CITIES)) {
    const distance = Math.hypot(latitude - lat, longitude - lon);
    if (distance < bestDistance) { bestDistance = distance; best = name; }
  }
  return bestDistance <= CITY_RADIUS_DEGREES ? best : null;
}

/** Type d'établissement tel que déclaré dans OpenStreetMap, sans interprétation. */
function typeOf(properties) {
  const amenity = properties.amenity;
  const healthcare = properties.healthcare;
  if (amenity === "hospital" || healthcare === "hospital") return "Hôpital";
  if (amenity === "clinic" || healthcare === "clinic") return "Clinique";
  if (healthcare === "centre") return "Centre de santé";
  return "Établissement de santé";
}

/**
 * Sigle court dérivé du nom réel. On conserve le nom complet tant qu'il tient
 * dans la colonne (70 caractères) : abréger produisait des libellés tronqués
 * du type « CHD zou et ».
 */
function shortNameOf(name, used) {
  const base = name.replace(/\s+/g, " ").trim();
  let candidate = base.length <= 64 ? base : base.slice(0, 64).replace(/[\s,;:-]+\S*$/, "");
  let unique = candidate;
  let suffix = 2;
  while (used.has(normalize(unique))) { unique = `${candidate} (${suffix++})`; }
  return unique.slice(0, 70);
}

const filePath = process.argv.find((arg) => arg.startsWith("--file="))?.slice("--file=".length);
if (!filePath) throw new Error("Indiquez le fichier GeoJSON : --file=/chemin/ben.geojson");
const dataset = JSON.parse(readFileSync(filePath, "utf8"));
if (!Array.isArray(dataset.features)) throw new Error("Le GeoJSON ne contient aucune collection de features.");

const candidates = [];
const skipped = { generic: 0, unnamed: 0, notFacility: 0, duplicate: 0, noCity: 0 };
const seen = new Set();

for (const feature of dataset.features) {
  const properties = feature?.properties || {};
  const coordinates = feature?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) continue;
  const [longitude, latitude] = coordinates;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

  const amenity = properties.amenity || "";
  const healthcare = properties.healthcare || "";
  const isFacility = ["hospital", "clinic"].includes(amenity) || ["hospital", "clinic", "centre"].includes(healthcare);
  if (!isFacility) { skipped.notFacility += 1; continue; }

  const name = bounded(properties.name || properties["name:fr"] || properties["name:en"], 200);
  if (!name) { skipped.unnamed += 1; continue; }
  if (GENERIC_NAMES.has(normalize(name)) || SERVICE_LABELS.test(name.trim()) || ANONYMOUS_PATTERN.test(name.trim())) {
    skipped.generic += 1;
    continue;
  }

  const rawCity = bounded(properties["addr:city"], 100);
  const city = rawCity || nearestCity(latitude, longitude);
  if (!city) { skipped.noCity += 1; continue; }

  const key = `${normalize(name)}|${normalize(city)}`;
  if (seen.has(key)) { skipped.duplicate += 1; continue; }
  seen.add(key);

  candidates.push({
    name,
    city,
    type: typeOf(properties),
    latitude,
    longitude,
    sourceUrl: `https://www.openstreetmap.org/${properties.id || ""}`,
    osmId: properties.id || null,
  });
}

candidates.sort((a, b) => a.city.localeCompare(b.city, "fr") || a.name.localeCompare(b.name, "fr"));

if (process.argv.includes("--dry-run")) {
  console.log(`Candidats retenus : ${candidates.length}`);
  console.log(`Écartés : ${JSON.stringify(skipped)}`);
  candidates.slice(0, 12).forEach((row) => console.log(`  ${row.city} · ${row.name} (${row.type})`));
  process.exit(0);
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
let started = false;
try {
  await client.query("BEGIN");
  started = true;

  // Import rejouable : on retire les fiches créées par ce script (repérées par
  // leur adresse de provenance) avant de les réinsérer, pour éviter les doublons.
  const cleared = await client.query("DELETE FROM hospitals WHERE address LIKE $1", ["%, Bénin — position OpenStreetMap%"]);
  if (cleared.rowCount) console.log(`Fiches précédemment importées retirées : ${cleared.rowCount}`);

  const existing = await client.query("SELECT short_name FROM hospitals");
  const usedShort = new Set(existing.rows.map((row) => normalize(row.short_name)));

  // Adresse et téléphone sont obligatoires au schéma mais absents de la source :
  // on renseigne la ville et la source, sans fabriquer de coordonnées postales.
  const insert = `
    INSERT INTO hospitals (name, short_name, city, address, phone, type, latitude, longitude, beds_total, beds_occupied, is_active)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,0,true)
    ON CONFLICT DO NOTHING
    RETURNING id`;

  let inserted = 0;
  for (const row of candidates) {
    const shortName = shortNameOf(row.name, usedShort);
    usedShort.add(normalize(shortName));
    const address = `${row.city}, Bénin — position OpenStreetMap (adresse postale non renseignée)`;
    const phone = "Non renseigné";
    const result = await client.query(insert, [
      row.name, shortName, row.city, address, phone, row.type, row.latitude, row.longitude,
    ]);
    if (result.rowCount) inserted += 1;
  }

  await client.query("COMMIT");
  started = false;

  console.log(`Établissements enregistrés : ${inserted}`);
  console.log(`Écartés : génériques ${skipped.generic}, sans nom ${skipped.unnamed}, hors périmètre ${skipped.notFacility}, doublons ${skipped.duplicate}, sans ville ${skipped.noCity}`);
  console.log(`Source : ${SOURCE_NAME} · relevé du ${SNAPSHOT_DATE} · ODbL-1.0. Aucune donnée inventée.`);
} catch (error) {
  if (started) await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
