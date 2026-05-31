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

- ~96 hex tiles cover the Miami MSA
- ~140-180 unique bike shops found
- ~90 seconds runtime
- ~$10-13 cost (Places API Enterprise tier)

## Spreadsheet columns

Name, Street, City, State, Zip, Phone, Website, Rating, # Reviews, Hours,
Google Maps, Place ID
