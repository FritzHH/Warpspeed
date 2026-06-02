import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pLimit from "p-limit";
import ExcelJS from "exceljs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONCURRENCY_NEARBY = 5;
const CONCURRENCY_GEOCODE = 3;
const NEARBY_PRICE_PER_1K_USD = 40;
const TEXT_SEARCH_PRICE_PER_1K_USD = 32;

const NEARBY_ENDPOINT = "https://places.googleapis.com/v1/places:searchNearby";
const TEXT_SEARCH_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";

const NEARBY_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.regularOpeningHours",
  "places.googleMapsUri",
].join(",");

const TEXT_SEARCH_FIELD_MASK = [
  "places.location",
  "places.viewport",
  "places.formattedAddress",
].join(",");

const COLUMNS = [
  { header: "Name",         key: "name",     width: 32 },
  { header: "Street",       key: "street",   width: 30 },
  { header: "City",         key: "city",     width: 18 },
  { header: "State",        key: "state",    width: 7  },
  { header: "Zip",          key: "zip",      width: 10 },
  { header: "Phone",        key: "phone",    width: 17 },
  { header: "Website",      key: "website",  width: 38 },
  { header: "Rating",       key: "rating",   width: 8  },
  { header: "# Reviews",    key: "reviews",  width: 11 },
  { header: "Hours",        key: "hours",    width: 60 },
  { header: "MSA / Source", key: "source",   width: 40 },
  { header: "Google Maps",  key: "mapsUri",  width: 32 },
  { header: "Place ID",     key: "placeId",  width: 30 },
];

function tierForPopulation(pop) {
  if (pop >= 5_000_000) return { name: "dense", radiusKm: 8, useBoundingBox: true };
  if (pop >= 1_000_000) return { name: "large", radiusKm: 20, useBoundingBox: true };
  if (pop >= 250_000)   return { name: "mid",   radiusKm: 35, useBoundingBox: true };
  return                       { name: "small", radiusKm: 50, useBoundingBox: false };
}

function generateHexTiles(box, radiusKm) {
  const horizKm = radiusKm * Math.sqrt(3);
  const vertKm = radiusKm * 1.5;
  const vertDeg = vertKm / 111;

  const tiles = [];
  let row = 0;

  for (let lat = box.south; lat <= box.north; lat += vertDeg) {
    const lngKmPerDeg = 111 * Math.cos((lat * Math.PI) / 180);
    const horizDeg = horizKm / lngKmPerDeg;
    const offset = (row % 2) * (horizDeg / 2);

    for (let lng = box.west + offset; lng <= box.east; lng += horizDeg) {
      tiles.push({ lat, lng });
    }
    row++;
  }

  return tiles;
}

async function textSearch(query) {
  const res = await fetch(TEXT_SEARCH_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY,
      "X-Goog-FieldMask": TEXT_SEARCH_FIELD_MASK,
    },
    body: JSON.stringify({ textQuery: query }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Text Search ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.places?.[0] || null;
}

async function searchNearby({ lat, lng, radiusM }) {
  const res = await fetch(NEARBY_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY,
      "X-Goog-FieldMask": NEARBY_FIELD_MASK,
    },
    body: JSON.stringify({
      includedPrimaryTypes: ["bicycle_store"],
      maxResultCount: 20,
      locationRestriction: {
        circle: { center: { latitude: lat, longitude: lng }, radius: radiusM },
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Places API ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.places || [];
}

function parseAddress(formatted) {
  if (!formatted) return { street: "", city: "", state: "", zip: "" };

  const trimmed = formatted.replace(/,\s*(USA|United States)$/i, "").trim();
  const parts = trimmed.split(",").map((p) => p.trim());
  if (parts.length < 2) return { street: trimmed, city: "", state: "", zip: "" };

  const last = parts.pop();
  const m = last.match(/^([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  const state = m ? m[1] : "";
  const zip = m ? m[2] : "";
  const city = parts.pop() || "";
  const street = parts.join(", ");

  return { street, city, state, zip };
}

function loadCache(cachePath) {
  if (!fs.existsSync(cachePath)) return {};
  return JSON.parse(fs.readFileSync(cachePath, "utf8"));
}
function saveCache(cachePath, cache) {
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), "utf8");
}

function ts() {
  return new Date().toTimeString().slice(0, 8);
}

async function geocodePass(geofences, cachePath) {
  const cache = loadCache(cachePath);
  let calls = 0;
  let cached = 0;
  let failed = 0;

  const limit = pLimit(CONCURRENCY_GEOCODE);

  await Promise.all(
    geofences.map((g) =>
      limit(async () => {
        if (cache[g.name]) {
          g.geocode = cache[g.name];
          cached++;
          return;
        }

        try {
          const result = await textSearch(g.name);
          if (!result) {
            console.error(`[${ts()}] Geocode: NO RESULT for ${g.name}`);
            failed++;
            return;
          }
          const geocode = {
            centroid: { lat: result.location.latitude, lng: result.location.longitude },
            boundingBox: {
              north: result.viewport.high.latitude,
              south: result.viewport.low.latitude,
              east: result.viewport.high.longitude,
              west: result.viewport.low.longitude,
            },
            formattedAddress: result.formattedAddress,
          };
          cache[g.name] = geocode;
          g.geocode = geocode;
          saveCache(cachePath, cache);
          calls++;
          console.log(`[${ts()}] Geocode: ${g.name}`);
        } catch (err) {
          console.error(`[${ts()}] Geocode FAILED for ${g.name}: ${err.message}`);
          failed++;
        }
      })
    )
  );

  return { calls, cached, failed };
}

function tileGeofences(geofences) {
  const tiles = [];
  const tierCounts = { dense: 0, large: 0, mid: 0, small: 0 };

  for (const g of geofences) {
    if (!g.geocode) continue;

    const tier = tierForPopulation(g.population || 0);
    g.tier = tier.name;
    tierCounts[tier.name]++;

    if (tier.useBoundingBox) {
      const hexTiles = generateHexTiles(g.geocode.boundingBox, tier.radiusKm);
      for (const t of hexTiles) {
        tiles.push({ ...t, radiusKm: tier.radiusKm, source: g.name });
      }
    } else {
      tiles.push({
        lat: g.geocode.centroid.lat,
        lng: g.geocode.centroid.lng,
        radiusKm: tier.radiusKm,
        source: g.name,
      });
    }
  }

  return { tiles, tierCounts };
}

async function searchPass(tiles) {
  const shopMap = new Map();
  let apiCalls = 0;
  let duplicates = 0;
  let completed = 0;
  let cappedTiles = 0;
  let failedTiles = 0;

  const limit = pLimit(CONCURRENCY_NEARBY);

  await Promise.all(
    tiles.map((tile) =>
      limit(async () => {
        try {
          const places = await searchNearby({
            lat: tile.lat,
            lng: tile.lng,
            radiusM: tile.radiusKm * 1000,
          });
          apiCalls++;
          if (places.length === 20) cappedTiles++;

          for (const p of places) {
            if (shopMap.has(p.id)) {
              duplicates++;
            } else {
              shopMap.set(p.id, { ...p, _source: tile.source });
            }
          }
        } catch (err) {
          failedTiles++;
          if (failedTiles <= 10) {
            console.error(`[${ts()}] Tile failed (${tile.source}): ${err.message}`);
          }
        } finally {
          completed++;
          if (completed % 100 === 0 || completed === tiles.length) {
            console.log(
              `[${ts()}] Progress: ${completed}/${tiles.length} tiles, ${shopMap.size} unique shops so far`
            );
          }
        }
      })
    )
  );

  return { shopMap, apiCalls, duplicates, cappedTiles, failedTiles };
}

function toRow(p) {
  const addr = parseAddress(p.formattedAddress || "");
  return {
    name: p.displayName?.text || "",
    street: addr.street,
    city: addr.city,
    state: addr.state,
    zip: addr.zip,
    phone: p.nationalPhoneNumber || "",
    website: p.websiteUri || "",
    rating: p.rating ?? null,
    reviews: p.userRatingCount ?? null,
    hours: (p.regularOpeningHours?.weekdayDescriptions || []).join(" | "),
    source: p._source || "",
    mapsUri: p.googleMapsUri || "",
    placeId: p.id || "",
  };
}

async function writeXlsx(filepath, shops) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Bike Shop Crawler";
  wb.created = new Date();

  const sheet = wb.addWorksheet("Bike Shops");
  sheet.columns = COLUMNS;

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, size: 11 };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE8E8E8" },
  };
  headerRow.alignment = { vertical: "middle" };
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const sorted = [...shops].sort((a, b) => {
    const an = (a.displayName?.text || "").toLowerCase();
    const bn = (b.displayName?.text || "").toLowerCase();
    return an.localeCompare(bn);
  });

  for (const p of sorted) sheet.addRow(toRow(p));

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: COLUMNS.length },
  };

  await wb.xlsx.writeFile(filepath);
}

async function main() {
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    console.error("Missing GOOGLE_PLACES_API_KEY in .env");
    process.exit(1);
  }

  const startedAt = new Date();
  console.log(`[${ts()}] Bike Shop Crawler - Full US run`);

  const cbsasPath = path.join(__dirname, "data", "cbsas.json");
  if (!fs.existsSync(cbsasPath)) {
    console.error(`Missing ${cbsasPath}`);
    process.exit(1);
  }
  const cbsasFile = JSON.parse(fs.readFileSync(cbsasPath, "utf8"));
  const geofences = [
    ...cbsasFile.msas.map((m) => ({ ...m, type: "msa" })),
    ...cbsasFile.ruralSeeds.map((r) => ({ ...r, type: "rural" })),
  ];
  console.log(
    `[${ts()}] Loaded ${geofences.length} geofences (${cbsasFile.msas.length} MSAs + ${cbsasFile.ruralSeeds.length} rural seeds)`
  );

  console.log(`[${ts()}] Phase 1: Geocoding (with cache)`);
  const cachePath = path.join(__dirname, "data", "geocode-cache.json");
  const geocodeResult = await geocodePass(geofences, cachePath);
  console.log(
    `[${ts()}] Geocode summary: ${geocodeResult.cached} from cache, ${geocodeResult.calls} new, ${geocodeResult.failed} failed`
  );

  console.log(`[${ts()}] Phase 2: Tiling`);
  const { tiles, tierCounts } = tileGeofences(geofences);
  console.log(
    `[${ts()}] Generated ${tiles.length} tiles (dense=${tierCounts.dense}, large=${tierCounts.large}, mid=${tierCounts.mid}, small=${tierCounts.small})`
  );

  console.log(`[${ts()}] Phase 3: Searching ${tiles.length} tiles (${CONCURRENCY_NEARBY} concurrent)`);
  const searchResult = await searchPass(tiles);
  const shops = [...searchResult.shopMap.values()];

  const completedAt = new Date();
  const nearbyCost = (searchResult.apiCalls / 1000) * NEARBY_PRICE_PER_1K_USD;
  const geocodeCost = (geocodeResult.calls / 1000) * TEXT_SEARCH_PRICE_PER_1K_USD;
  const totalCost = nearbyCost + geocodeCost;

  console.log("");
  console.log(`[${ts()}] === Summary ===`);
  console.log(`[${ts()}] Geofences: ${geofences.length}`);
  console.log(`[${ts()}] Nearby API calls: ${searchResult.apiCalls} (${searchResult.failedTiles} failed)`);
  console.log(`[${ts()}] Raw -> dedup: ${shops.length + searchResult.duplicates} -> ${shops.length} unique shops`);
  console.log(`[${ts()}] Capped tiles: ${searchResult.cappedTiles} (dense areas where 20 results may not be enough)`);
  console.log(
    `[${ts()}] Costs: nearby=$${nearbyCost.toFixed(2)}, geocode=$${geocodeCost.toFixed(2)}, total=$${totalCost.toFixed(2)}`
  );
  console.log(`[${ts()}] Elapsed: ${Math.round((completedAt - startedAt) / 1000)}s`);

  const stamp = startedAt.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = path.join(__dirname, "output");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const xlsxPath = path.join(outDir, `us-full-${stamp}.xlsx`);
  await writeXlsx(xlsxPath, shops);
  console.log(`[${ts()}] Wrote ${xlsxPath}`);

  const metaPath = xlsxPath.replace(/\.xlsx$/, ".meta.json");
  fs.writeFileSync(
    metaPath,
    JSON.stringify(
      {
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        elapsedSeconds: Math.round((completedAt - startedAt) / 1000),
        geofenceCount: geofences.length,
        tierCounts,
        geocodeCalls: geocodeResult.calls,
        geocodeCached: geocodeResult.cached,
        geocodeFailed: geocodeResult.failed,
        nearbyApiCalls: searchResult.apiCalls,
        cappedTiles: searchResult.cappedTiles,
        failedTiles: searchResult.failedTiles,
        estimatedCostUsd: totalCost,
        nearbyCostUsd: nearbyCost,
        geocodeCostUsd: geocodeCost,
        uniqueShopsFound: shops.length,
        duplicateHits: searchResult.duplicates,
      },
      null,
      2
    )
  );
  console.log(`[${ts()}] Wrote ${metaPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
