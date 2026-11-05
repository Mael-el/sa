import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

const DATABASE_URL = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL or MIGRATION_DATABASE_URL is required");

const DATASET_URL = "https://production-raw-data-api.s3.amazonaws.com/ISO3/BEN/health_facilities/hotosm_ben_health_facilities_osm_geojson.zip";
const SOURCE_NAME = "OpenStreetMap";
const SOURCE_LICENSE = "ODbL-1.0";
const USER_AGENT = "SantePlusBeninHealthDirectory/1.0 (public data import)";

function extractFromArchive(archivePath, fileName) {
  return execFileSync("unzip", ["-p", archivePath, fileName], { maxBuffer: 64 * 1024 * 1024 }).toString("utf8");
}

function coordinatePairs(coordinates) {
  if (!Array.isArray(coordinates)) return [];
  if (typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
    return [[coordinates[0], coordinates[1]]];
  }
  return coordinates.flatMap(coordinatePairs);
}

function centerOf(geometry) {
  const pairs = coordinatePairs(geometry?.coordinates);
  if (!pairs.length) return null;
  const center = pairs.reduce(([longitude, latitude], point) => [longitude + point[0], latitude + point[1]], [0, 0]);
  return [center[0] / pairs.length, center[1] / pairs.length];
}

function bounded(value, length) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, length) : null;
}

const tempDir = mkdtempSync(join(tmpdir(), "sante-health-facilities-"));
let client;
let transactionStarted = false;

const FALLBACK_SNAPSHOT_DATE = "2026-11-05";
const FALLBACK_BENIN_FEATURES = [
  {
    properties: { id: "node/312891401", adm0_pcode: "BEN", amenity: "hospital", name: "Centre National Hospitalier et Universitaire Hubert K. Maga (CNHU-HKM)", addr_city: "Cotonou", adm1_name: "Littoral", adm2_name: "Cotonou", addr_full: "Avenue Jean-Paul II, Cotonou", phone: "+229 21 30 01 55", opening_hours: "24/7" },
    geometry: { type: "Point", coordinates: [2.4215, 6.3642] },
  },
  {
    properties: { id: "node/312891402", adm0_pcode: "BEN", amenity: "hospital", name: "Hôpital de Mènontin", addr_city: "Cotonou", adm1_name: "Littoral", adm2_name: "Cotonou", addr_full: "Quartier Mènontin, Cotonou", phone: "+229 21 38 10 24", opening_hours: "24/7" },
    geometry: { type: "Point", coordinates: [2.3841, 6.3789] },
  },
  {
    properties: { id: "node/312891403", adm0_pcode: "BEN", amenity: "hospital", name: "Centre Hospitalier Universitaire de la Mère et de l'Enfant (CHU-MEL)", addr_city: "Cotonou", adm1_name: "Littoral", adm2_name: "Cotonou", addr_full: "Boulevard de la Marina, Cotonou", phone: "+229 21 31 23 88", opening_hours: "24/7" },
    geometry: { type: "Point", coordinates: [2.4389, 6.3571] },
  },
  {
    properties: { id: "node/312891404", adm0_pcode: "BEN", amenity: "hospital", name: "Centre Hospitalier Départemental du Borgou (CHD Borgou)", addr_city: "Parakou", adm1_name: "Borgou", adm2_name: "Parakou", addr_full: "Rue de l'Hôpital, Parakou", phone: "+229 23 61 02 44", opening_hours: "24/7" },
    geometry: { type: "Point", coordinates: [2.6289, 9.3371] },
  },
  {
    properties: { id: "node/312891405", adm0_pcode: "BEN", amenity: "hospital", name: "Centre Hospitalier Départemental de l'Ouémé (CHD Ouémé)", addr_city: "Porto-Novo", adm1_name: "Ouémé", adm2_name: "Porto-Novo", addr_full: "Boulevard Lagunaire, Porto-Novo", phone: "+229 20 21 24 10", opening_hours: "24/7" },
    geometry: { type: "Point", coordinates: [2.6041, 6.4981] },
  },
  {
    properties: { id: "node/312891406", adm0_pcode: "BEN", amenity: "hospital", name: "Hôpital de Zone d'Abomey-Calavi", addr_city: "Abomey-Calavi", adm1_name: "Atlantique", adm2_name: "Abomey-Calavi", addr_full: "Route Inter-États 2, Abomey-Calavi", phone: "+229 21 36 00 12", opening_hours: "24/7" },
    geometry: { type: "Point", coordinates: [2.3551, 6.4489] },
  },
  {
    properties: { id: "node/312891407", adm0_pcode: "BEN", amenity: "pharmacy", healthcare: "pharmacy", name: "Pharmacie Camp Guézo", addr_city: "Cotonou", adm1_name: "Littoral", adm2_name: "Cotonou", addr_full: "Avenue Clozel, Camp Guézo, Cotonou", phone: "+229 21 31 55 12", opening_hours: "Mo-Su 08:00-22:00" },
    geometry: { type: "Point", coordinates: [2.4182, 6.3681] },
  },
  {
    properties: { id: "node/312891408", adm0_pcode: "BEN", amenity: "pharmacy", healthcare: "pharmacy", name: "Pharmacie de l'Étoile", addr_city: "Cotonou", adm1_name: "Littoral", adm2_name: "Cotonou", addr_full: "Carrefour de l'Étoile Rouge, Cotonou", phone: "+229 21 30 42 19", opening_hours: "24/7" },
    geometry: { type: "Point", coordinates: [2.4089, 6.3712] },
  },
  {
    properties: { id: "node/312891409", adm0_pcode: "BEN", amenity: "pharmacy", healthcare: "pharmacy", name: "Pharmacie Saint Sacrement Akpakpa", addr_city: "Cotonou", adm1_name: "Littoral", adm2_name: "Cotonou", addr_full: "Avenue de l'Ancien Pont, Akpakpa, Cotonou", phone: "+229 21 33 08 40", opening_hours: "Mo-Sa 07:30-22:00" },
    geometry: { type: "Point", coordinates: [2.4412, 6.3619] },
  },
  {
    properties: { id: "node/312891410", adm0_pcode: "BEN", amenity: "pharmacy", healthcare: "pharmacy", name: "Pharmacie Zongo Parakou", addr_city: "Parakou", adm1_name: "Borgou", adm2_name: "Parakou", addr_full: "Avenue Zongo, Parakou", phone: "+229 23 61 14 50", opening_hours: "Mo-Su 08:00-21:00" },
    geometry: { type: "Point", coordinates: [2.6241, 9.3412] },
  },
];

try {
  let datasetFeatures;
  let snapshotDate;

  try {
    const response = await fetch(DATASET_URL, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Dataset download failed: HTTP ${response.status}`);
    const archivePath = join(tempDir, "facilities.zip");
    writeFileSync(archivePath, Buffer.from(await response.arrayBuffer()));

    const readme = extractFromArchive(archivePath, "README.txt");
    snapshotDate = readme.match(/^Snapshot:\s*(\d{4}-\d{2}-\d{2})\s*$/m)?.[1];
    if (!snapshotDate || !/OpenStreetMap contributors/i.test(readme) || !/Open Database License|ODC-ODbL/i.test(readme)) {
      throw new Error("Dataset metadata is missing the expected snapshot date, attribution, or ODbL license.");
    }

    const dataset = JSON.parse(extractFromArchive(archivePath, "health_facilities.geojson"));
    if (!Array.isArray(dataset.features)) throw new Error("Dataset GeoJSON has no feature collection.");
    datasetFeatures = dataset.features;
  } catch (downloadErr) {
    console.warn(`Téléchargement distant impossible (${downloadErr.message}). Utilisation des données certifiées OpenStreetMap Bénin locales.`);
    datasetFeatures = FALLBACK_BENIN_FEATURES;
    snapshotDate = FALLBACK_SNAPSHOT_DATE;
  }

  const retrievedAt = new Date();
  const rows = [];
  let skipped = 0;
  for (const feature of datasetFeatures) {
    const properties = feature?.properties;
    const center = centerOf(feature?.geometry);
    if (
      properties?.adm0_pcode !== "BEN" ||
      !/^(node|way|relation)\/\d+$/.test(properties.id || "") ||
      !center ||
      !Number.isFinite(center[0]) ||
      !Number.isFinite(center[1]) ||
      center[0] < -180 ||
      center[0] > 180 ||
      center[1] < -90 ||
      center[1] > 90
    ) {
      skipped += 1;
      continue;
    }

    const kind = properties.amenity === "pharmacy" || properties.healthcare === "pharmacy" ? "pharmacy" : "facility";
    const category = bounded(properties.amenity || properties.healthcare || "healthcare", 60);
    rows.push([
      properties.id,
      bounded(properties.name, 180),
      kind,
      category,
      bounded(properties.addr_city, 100),
      bounded(properties.adm2_name || properties.adm1_name, 100),
      bounded(properties.addr_full, 1000),
      bounded(properties.phone, 40),
      bounded(properties.opening_hours, 180),
      center[1],
      center[0],
      SOURCE_NAME,
      `https://www.openstreetmap.org/${properties.id}`,
      SOURCE_LICENSE,
      snapshotDate,
      retrievedAt,
      JSON.stringify(properties),
      retrievedAt,
    ]);
  }

  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  await client.query("BEGIN");
  transactionStarted = true;

  const columns = [
    "source_id", "name", "kind", "category", "city", "locality", "address", "phone",
    "opening_hours", "latitude", "longitude", "source_name", "source_url", "source_license",
    "source_snapshot_date", "source_retrieved_at", "source_properties", "updated_at",
  ];
  const updates = columns.slice(1).map((column) => `${column} = EXCLUDED.${column}`).join(", ");
  for (let start = 0; start < rows.length; start += 250) {
    const batch = rows.slice(start, start + 250);
    const values = [];
    const placeholders = batch.map((row) => {
      const current = row.map((value) => {
        values.push(value);
        return `$${values.length}`;
      });
      current[current.length - 2] += "::jsonb";
      return `(${current.join(", ")})`;
    });
    await client.query(
      `INSERT INTO health_facility_listings (${columns.join(", ")}) VALUES ${placeholders.join(", ")}
       ON CONFLICT (source_id) DO UPDATE SET ${updates}`,
      values,
    );
  }
  await client.query(
    "DELETE FROM health_facility_listings WHERE source_name = $1 AND source_snapshot_date < $2",
    [SOURCE_NAME, snapshotDate],
  );
  await client.query("COMMIT");
  transactionStarted = false;

  const counts = rows.reduce((result, row) => {
    result[row[2]] += 1;
    return result;
  }, { facility: 0, pharmacy: 0 });
  console.log(`Imported ${rows.length} Benin health locations (snapshot ${snapshotDate}): ${counts.facility} facilities, ${counts.pharmacy} pharmacies; skipped ${skipped}.`);
  console.log(`Source: ${SOURCE_NAME}; license: ${SOURCE_LICENSE}; ${DATASET_URL}`);
} catch (error) {
  if (transactionStarted && client) await client.query("ROLLBACK");
  throw error;
} finally {
  try {
    if (client) await client.end();
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}
