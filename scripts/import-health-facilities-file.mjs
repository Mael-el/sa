import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

/**
 * Import du répertoire sanitaire OpenStreetMap du Bénin.
 *
 * Source : export HOT/HDX « hotosm_ben_health_facilities_points_geojson », relevé du
 * 2025-02-04, publié sous licence ODbL-1.0 par les contributeurs OpenStreetMap.
 * Le script télécharge par défaut depuis data.humdata.org ; l'option --file permet
 * d'importer une copie locale du même GeoJSON lorsque l'accès réseau est filtré.
 *
 * Limites assumées et reflétées en base :
 * - les propriétés de l'export ne contiennent ni téléphone, ni horaires, ni adresse :
 *   ces champs restent NULL plutôt que remplis par approximation ;
 * - « addr:city » n'est renseigné que pour une poignée de lieux. La ville est donc
 *   déduite de la proximité géographique (< 24 km) d'un chef-lieu connu, et la valeur
 *   brute d'OpenStreetMap est conservée dans `locality` pour ne rien masquer ;
 * - une donnée OSM ne prouve ni l'activité, ni les horaires, ni les services d'un lieu.
 *
 * L'import est répétable : la clé `source_id` (ex. node/12247822828) sert d'upsert.
 */

const DATASET_URL = "https://production-raw-data-api.s3.amazonaws.com/ISO3/BEN/health_facilities/hotosm_ben_health_facilities_osm_geojson.zip";
const SOURCE_NAME = "OpenStreetMap";
const SOURCE_LICENSE = "ODbL-1.0";
const SNAPSHOT_DATE = "2025-02-04";
const USER_AGENT = "SantePlusBeninHealthDirectory/1.0 (public data import)";

/** Chefs-lieux utilisés uniquement pour rattacher un point à une ville, jamais pour inventer une adresse. */
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

const DATABASE_URL = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL or MIGRATION_DATABASE_URL is required");

function bounded(value, length) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, length) : null;
}

/** Ville la plus proche d'un point, ou null au-delà du rayon : on n'invente jamais de rattachement. */
function nearestCity(latitude, longitude) {
  let best = null;
  let bestDistance = Infinity;
  for (const [name, [cityLat, cityLon]] of Object.entries(CITIES)) {
    const distance = Math.hypot(latitude - cityLat, longitude - cityLon);
    if (distance < bestDistance) { bestDistance = distance; best = name; }
  }
  return bestDistance <= CITY_RADIUS_DEGREES ? best : null;
}

/** Catégorie lisible déduite d'amenity/healthcare, sans invention. */
function categoryOf(properties) {
  const value = properties.amenity || properties.healthcare || "healthcare";
  return bounded(String(value), 60);
}

async function loadDataset() {
  const localPath = process.argv.find((arg) => arg.startsWith("--file="))?.slice("--file=".length);
  if (localPath) {
    const dataset = JSON.parse(readFileSync(localPath, "utf8"));
    if (!Array.isArray(dataset.features)) throw new Error("Le GeoJSON fourni ne contient aucune collection de features.");
    return dataset;
  }
  // Téléchargement : archive ZIP contenant README.txt (métadonnées) et health_facilities.geojson.
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const response = await fetch(DATASET_URL, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Téléchargement du jeu de données échoué : HTTP ${response.status}`);
  const dir = mkdtempSync(join(tmpdir(), "sante-facilities-"));
  const archive = join(dir, "facilities.zip");
  writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
  try {
    const geojson = execFileSync("unzip", ["-p", archive, "health_facilities.geojson"], { maxBuffer: 128 * 1024 * 1024 }).toString("utf8");
    return JSON.parse(geojson);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const dataset = await loadDataset();
const retrievedAt = new Date();
const rows = [];
let skipped = 0;
let withoutCity = 0;

for (const feature of dataset.features) {
  const properties = feature?.properties || {};
  const coordinates = feature?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) { skipped += 1; continue; }
  const [longitude, latitude] = coordinates;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) { skipped += 1; continue; }

  // Identifiant OSM : l'export HOT fournit « node/123 » ; l'export ponctuel fournit osm_id + osm_type.
  const osmId = typeof properties.id === "string"
    ? properties.id
    : properties.osm_id
      ? `${String(properties.osm_type || "node").replace(/s$/, "")}/${properties.osm_id}`
      : null;
  if (!osmId || !/^(node|way|relation)\/\d+$/.test(osmId)) { skipped += 1; continue; }

  const isPharmacy = properties.amenity === "pharmacy" || properties.healthcare === "pharmacy";
  const rawCity = bounded(properties.addr_city || properties.addr_city_en, 100);
  const city = rawCity || nearestCity(latitude, longitude);
  if (!city) withoutCity += 1;

  rows.push([
    osmId,
    bounded(properties.name || properties["name:fr"] || properties["name:en"], 180),
    isPharmacy ? "pharmacy" : "facility",
    categoryOf(properties),
    city,
    rawCity,                                                     // localité d'origine, conservée telle quelle
    bounded(properties.addr_full, 1000),
    bounded(properties.phone, 40),
    bounded(properties.opening_hours, 180),
    latitude,
    longitude,
    SOURCE_NAME,
    `https://www.openstreetmap.org/${osmId}`,
    SOURCE_LICENSE,
    SNAPSHOT_DATE,
    retrievedAt,
    JSON.stringify(properties),
  ]);
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
let started = false;
try {
  await client.query("BEGIN");
  started = true;

  const columns = [
    "source_id", "name", "kind", "category", "city", "locality", "address", "phone",
    "opening_hours", "latitude", "longitude", "source_name", "source_url", "source_license",
    "source_snapshot_date", "source_retrieved_at", "source_properties",
  ];
  const updates = columns.slice(1).map((column) => `${column} = EXCLUDED.${column}`).join(", ");

  for (let start = 0; start < rows.length; start += 250) {
    const batch = rows.slice(start, start + 250);
    const values = [];
    const placeholders = batch.map((row) => {
      const current = row.map((value) => { values.push(value); return `$${values.length}`; });
      current[current.length - 1] += "::jsonb";
      return `(${current.join(", ")})`;
    });
    await client.query(
      `INSERT INTO health_facility_listings (${columns.join(", ")}) VALUES ${placeholders.join(", ")}
       ON CONFLICT (source_id) DO UPDATE SET ${updates}, updated_at = now()`,
      values,
    );
  }

  await client.query("COMMIT");
  started = false;

  const counts = rows.reduce((result, row) => { result[row[2]] += 1; return result; }, { facility: 0, pharmacy: 0 });
  console.log(`Importés : ${rows.length} lieux de santé (${counts.facility} établissements, ${counts.pharmacy} pharmacies).`);
  console.log(`Ignorés faute d'identifiant ou de coordonnées valides : ${skipped}.`);
  console.log(`Sans ville identifiée (localité inconnue) : ${withoutCity}.`);
  console.log(`Source : ${SOURCE_NAME} · relevé du ${SNAPSHOT_DATE} · licence ${SOURCE_LICENSE}.`);
  if (process.argv.includes("--file")) console.log("Import effectué depuis un fichier local (copie du jeu de données HOT/HDX).");
} catch (error) {
  if (started) await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
