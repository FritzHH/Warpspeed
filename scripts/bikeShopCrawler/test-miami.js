import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pLimit from "p-limit";
import ExcelJS from "exceljs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MIAMI_MSA = {
  name: "Miami-Fort Lauderdale-West Palm Beach, FL",
  population: 6138333,
  tier: "dense",
  boundingBox: { north: 26.97, south: 25.13, east: -80.03, west: -80.88 },
};

const RADIUS_KM = 8;
const RADIUS_M = RADIUS_KM * 1000;
const CONCURRENCY = 5;
const PRICE_PER_1K_USD = 40;

const ENDPOINT = "https://places.googleapis.com/v1/places:searchNearby";
const FIELD_MASK = [
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

const COLUMNS = [
  { header: "Name",        key: "name",    width: 32 },
  { header: "Street",      key: "street",  width: 30 },
  { header: "City",        key: "city",    width: 18 },
  { header: "State",       key: "state",   width: 7  },
  { header: "Zip",         key: "zip",     width: 10 },
  { header: "Phone",       key: "phone",   width: 17 },
  { header: "Website",     key: "website", width: 38 },
  { header: "Rating",      key: "rating",  width: 8  },
  { header: "# Reviews",   key: "reviews", width: 11 },
  { header: "Hours",       key: "hours",   width: 60 },
  { header: "Google Maps", key: "mapsUri", width: 32 },
  { header: "Place ID",    key: "placeId", width: 30 },
];

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

async function searchNearby({ lat, lng, radiusM }) {
  const body = {
    includedPrimaryTypes: ["bicycle_store"],
    maxResultCount: 20,
    locationRestriction: {
      circle: { center: { latitude: lat, longitude: lng }, radius: radiusM },
    },
  };

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(body),
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

function ts() {
  return new Date().toTimeString().slice(0, 8);
}

async function main() {
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    console.error("Missing GOOGLE_PLACES_API_KEY in .env");
    console.error("See .env.example for setup instructions");
    process.exit(1);
  }

  const startedAt = new Date();
  console.log(`[${ts()}] Loaded ${MIAMI_MSA.name}`);
  console.log(
    `[${ts()}] Tier: ${MIAMI_MSA.tier} (pop ${(MIAMI_MSA.population / 1e6).toFixed(1)}M) -> ${RADIUS_KM}km hex tiles`
  );

  const tiles = generateHexTiles(MIAMI_MSA.boundingBox, RADIUS_KM);
  console.log(`[${ts()}] Generated ${tiles.length} tile centers`);

  const shopMap = new Map();
  let apiCalls = 0;
  let duplicates = 0;
  let completed = 0;
  let cappedTiles = 0;
  let failedTiles = 0;

  const limit = pLimit(CONCURRENCY);

  await Promise.all(
    tiles.map((tile) =>
      limit(async () => {
        try {
          const places = await searchNearby({
            lat: tile.lat,
            lng: tile.lng,
            radiusM: RADIUS_M,
          });
          apiCalls++;
          if (places.length === 20) cappedTiles++;

          for (const p of places) {
            if (shopMap.has(p.id)) duplicates++;
            else shopMap.set(p.id, p);
          }

          completed++;
          const cap = places.length === 20 ? " [CAP - may be incomplete]" : "";
          console.log(
            `[${ts()}] Tile ${completed}/${tiles.length} (${tile.lat.toFixed(3)}, ${tile.lng.toFixed(3)}) -> ${places.length} results${cap}`
          );
        } catch (err) {
          completed++;
          failedTiles++;
          console.error(
            `[${ts()}] Tile ${completed}/${tiles.length} FAILED: ${err.message}`
          );
        }
      })
    )
  );

  const completedAt = new Date();
  const shops = [...shopMap.values()];
  const estCost = (apiCalls / 1000) * PRICE_PER_1K_USD;

  console.log("");
  console.log(
    `[${ts()}] Dedup: ${shops.length + duplicates} raw -> ${shops.length} unique shops`
  );
  console.log(`[${ts()}] API calls: ${apiCalls}`);
  console.log(`[${ts()}] Estimated cost: $${estCost.toFixed(2)}`);
  if (cappedTiles > 0) {
    console.log(
      `[${ts()}] WARNING: ${cappedTiles} tile(s) hit the 20-result cap - dense areas may be incomplete`
    );
  }
  if (failedTiles > 0) {
    console.log(`[${ts()}] WARNING: ${failedTiles} tile(s) failed`);
  }

  const stamp = startedAt.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = path.join(__dirname, "output");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const xlsxPath = path.join(outDir, `miami-test-${stamp}.xlsx`);
  await writeXlsx(xlsxPath, shops);
  console.log(`[${ts()}] Wrote ${xlsxPath}`);

  const metaPath = xlsxPath.replace(/\.xlsx$/, ".meta.json");
  fs.writeFileSync(
    metaPath,
    JSON.stringify(
      {
        msa: MIAMI_MSA.name,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        elapsedSeconds: Math.round((completedAt - startedAt) / 1000),
        tilesQueried: tiles.length,
        apiCallsTotal: apiCalls,
        cappedTiles,
        failedTiles,
        estimatedCostUsd: estCost,
        uniqueShopsFound: shops.length,
        duplicateHits: duplicates,
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
