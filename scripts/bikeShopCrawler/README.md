# Bike Shop Crawler — Miami Test

A small Places API test that finds every bike shop in the
Miami-Fort Lauderdale-West Palm Beach MSA and writes them to a clean
Excel spreadsheet.

## Setup (first time)

### 1. Create a Google Places API key

- Open https://console.cloud.google.com/
- Pick a GCP project (recommended: a **fresh project** for clean billing —
  the crawler doesn't belong in Bonita prod or cadence-pos infra)
- APIs & Services -> Library -> search "Places API (New)" -> Enable
- APIs & Services -> Credentials -> Create credentials -> API key
- (Recommended) Click the key, restrict it to **Places API (New)** + your IP

### 2. Install dependencies

```
cd scripts\bikeShopCrawler
npm install
```

### 3. Configure your API key

```
copy .env.example .env
```

Open `.env` and paste your key after `GOOGLE_PLACES_API_KEY=`.

## Run

```
npm run miami
```

## Output

Two files land in `output/`:

- `miami-test-<timestamp>.xlsx` — clean Excel spreadsheet, sorted alphabetically
  by name, bold/frozen header row, auto-filter on every column. Opens directly
  in Excel and Google Sheets.
- `miami-test-<timestamp>.meta.json` — run metadata (tile count, API calls,
  estimated cost, elapsed seconds)

## Expected results

- ~117 hex tiles cover the Miami MSA
- ~140-180 unique bike shops found
- ~30-60 seconds runtime
- ~$5 cost (Places API Enterprise tier — 1 call per tile, no pagination)

## Spreadsheet columns (Miami test)

Name, Street, City, State, Zip, Phone, Website, Rating, # Reviews, Hours,
Google Maps, Place ID

---

## Full US sweep

Run after the Miami test has confirmed your API key works:

```
npm run full-us
```

This loops over all geofences in `data/cbsas.json` (top 50 US MSAs + 25 rural
bike-town seeds), geocodes each via Places API Text Search (cached for
re-runs), tiles per density tier, then searches and dedups.

Phases:
1. **Geocode** - resolves each geofence name to a centroid + viewport.
   First run hits the API for ~75 lookups (~$2). Cached in
   `data/geocode-cache.json`; subsequent runs skip this entirely.
2. **Tile** - density-tiered hex packing (8km for dense MSAs, 20km for large,
   35km for mid, single 50km circle for small/rural).
3. **Search** - 5-concurrent Nearby Search calls across all tiles, dedup by
   `place_id`, first-source MSA attribution.

Expected on first run:
- ~1,900 tiles
- ~2-2.5 minutes runtime
- ~$78 cost ($76 nearby + $2 geocoding)
- Subsequent runs: ~$76 (geocoding cached)
- ~3,500-5,000 unique bike shops found

Output: `output/us-full-<timestamp>.xlsx` with an added `MSA / Source` column
so you can filter by metro area.

---

## Email scraper

Run after either the Miami test or full US sweep to enrich the spreadsheet
with email addresses scraped from each shop's website:

```
npm run emails
```

By default it grabs the most recent `.xlsx` in `output/` (skipping any file
already suffixed `-with-emails`). To target a specific file:

```
npm run emails -- output\miami-test-2026-05-31T14-22-10.xlsx
```

What it does, per shop:
1. Fetches the homepage at the `Website` URL.
2. Scans the HTML for `mailto:` links and inline `name@domain.tld` patterns.
3. Light de-obfuscation: handles `name [at] domain [dot] com`, HTML entities,
   `&#64;`, etc.
4. If no email matches the shop's own domain on the homepage, follows up to
   3 same-origin links matching `/contact`, `/about`, `/support`, etc.
5. Filters junk (asset filenames, `example@`, Wix/Squarespace placeholders).
6. Emails matching the shop's own domain sort first (most likely the real one).

Output: `<input>-with-emails.xlsx` with an added `Email` column. Multiple
emails are comma-separated, host-domain matches first. Original file is
left untouched.

Expected hit rate: 60-80% of shops with a website yield at least one email.
JavaScript-only / SPA sites and lazy-loaded contact widgets will miss.

Runtime: ~3 seconds per shop average at 10-concurrent. For ~190 Miami shops:
~1 minute. For ~5,000 full-US shops: ~25 minutes.

Cost: $0. Pure HTTP fetches against public sites; no API.

---

## v1 dataset coverage

`data/cbsas.json` ships with:
- **Top 50 US MSAs by population** (covers ~75% of US population, ~80% of
  bike shops by density correlation)
- **25 curated rural bike-destination towns** (Moab, Bend, Sedona, etc.)

### Coverage gap

~334 smaller MSAs + ~542 Micropolitan Statistical Areas (μSAs) are not
included. These contain bike shops in smaller towns and additional tourist
destinations. Examples NOT covered:

- Smaller MSAs: Tallahassee FL, Eugene OR, Reno NV, Spokane WA, Boise ID,
  Wichita KS, Madison WI, Tucson AZ, Albuquerque NM
- Tourist μSAs: Hailey/Ketchum ID, Glenwood Springs CO, Whitefish MT
  (already added), Bishop CA, Frisco/Breckenridge CO

### Extending the dataset

Two paths:

1. **Manual** - add entries to `data/cbsas.json` `msas` or `ruralSeeds`
   array. Just need `name` (geocodable string) and `population` (drives
   density tier). Geocode cache will fill in centroid/bounding box on next
   run.
2. **Census integration (v2)** - fetch the Census Bureau CBSA Gazetteer +
   Population Estimates files to auto-populate ~1,007 entries. Not yet
   implemented.
