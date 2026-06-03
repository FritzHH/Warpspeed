# vendor-catalog-qbp

Cloud Run Job that syncs the QBP API1 catalog into the cadence-pos Realtime Database under `/vendor_catalogs/qbp`. Modeled after `vendor-catalog-jbi` so consumers in `src/db_calls_wrapper.js` read both vendors with identical code paths.

## Modes

Mode is selected via the `QBP_MODE` env var on the Cloud Run Job.

| Mode | Endpoint(s) | Writes to | Cadence | Skip-if-unchanged? |
|------|-------------|-----------|---------|--------------------|
| `master` | `/1/product/skulist` + `/1/product/sku/{sku}` per SKU | `vendor_catalogs/qbp/items/{SKU}` and `vendor_catalogs/qbp/items_by_upc/{upc}` | Daily ~05:00 ET | Yes (sha256 of skulist) |
| `inventory` | `/1/availability/warehouse/{code}` per warehouse | `vendor_catalogs/qbp/inventory_by_item/{SKU}/{warehouseCode}` | Hourly :15 | No (always runs) |

No `specs` mode — QBP returns spec data inside the product detail response. We currently pare that down at master-mode write time and don't persist specs; if a UI ever needs them, the canonical shape gets a `specs` field and master.js's `toCanonicalItem` copies them through.

## Storage shape

```
vendor_catalogs/qbp/
├── items/{SKU}/                ← canonical inventory-mapping shape: {id, name, brand, cost (cents), msrp (cents), primaryUpc, allUpcs}
├── items_by_upc/{upc}: SKU     ← reverse lookup for barcode scans (covers product + pack UPCs)
├── inventory_by_item/{SKU}/
│   ├── PA: 12
│   ├── MN: 0  (omitted — zeros are not written)
│   └── NV: 4
└── _meta/
    ├── lastMasterSync          ← { responseHash, skuCount, itemCount, upcCount, missCount, durationSec, completedAt }
    ├── lastInventorySync       ← { warehouses, warehousesSeen, itemsWithStockCount, totalQty, durationSec, completedAt }
    └── lastTouched             ← server timestamp
```

## Environment variables

| Var | Required | Default | Purpose |
|-----|----------|---------|---------|
| `QBP_MODE` | yes | — | `master` or `inventory` |
| `QBP_API_KEY` | yes | — | Bonita's QBP API1 key (`X-QBPAPI-KEY` header). Bind via Secret Manager. |
| `FIREBASE_DATABASE_URL` | yes | — | e.g. `https://cadence-pos-default-rtdb.firebaseio.com` |
| `QBP_API_BASE_URL` | no | `https://api1.qbp.com/api/1/` | Override if QBP rotates the host. |
| `QBP_CONCURRENCY` | no | `8` | Per-SKU fetch parallelism for master mode. |
| `QBP_WAREHOUSES` | no | `PA,MN,NV` | Comma-separated warehouse codes for inventory mode. |

## One-time setup

### 1. Create the Secret Manager entry for the API key

```
gcloud secrets create qbp-api-key --replication-policy=automatic --project=cadence-pos --account=fritz@retailsoftsystems.com
echo BONITAS_QBP_KEY_HERE | gcloud secrets versions add qbp-api-key --data-file=- --project=cadence-pos --account=fritz@retailsoftsystems.com
```

(Or set via the Secret Manager UI — paste, save, verify with `gcloud secrets versions access latest --secret=qbp-api-key`.)

### 2. Grant the Cloud Run Job service account access

The default Cloud Run service account needs `roles/secretmanager.secretAccessor` for `qbp-api-key`. The `--update-secrets` flag below will fail with a clear permissions error if it's missing.

### 3. Build + push the image and deploy both jobs

From `jobs/vendor-catalog-qbp/`:

```
gcloud builds submit --tag gcr.io/cadence-pos/vendor-catalog-qbp --project=cadence-pos --account=fritz@retailsoftsystems.com
```

Master job:

```
gcloud run jobs deploy vendor-catalog-qbp-master --image=gcr.io/cadence-pos/vendor-catalog-qbp --region=us-central1 --task-timeout=3600 --max-retries=1 --set-env-vars=QBP_MODE=master,FIREBASE_DATABASE_URL=https://cadence-pos-default-rtdb.firebaseio.com --update-secrets=QBP_API_KEY=qbp-api-key:latest --project=cadence-pos --account=fritz@retailsoftsystems.com
```

Inventory job:

```
gcloud run jobs deploy vendor-catalog-qbp-inventory --image=gcr.io/cadence-pos/vendor-catalog-qbp --region=us-central1 --task-timeout=900 --max-retries=1 --set-env-vars=QBP_MODE=inventory,FIREBASE_DATABASE_URL=https://cadence-pos-default-rtdb.firebaseio.com --update-secrets=QBP_API_KEY=qbp-api-key:latest --project=cadence-pos --account=fritz@retailsoftsystems.com
```

### 4. Create Cloud Scheduler triggers

Master — daily 05:00 ET:

```
gcloud scheduler jobs create http vendor-catalog-qbp-master --location=us-central1 --schedule="0 5 * * *" --time-zone="America/New_York" --uri="https://us-central1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/cadence-pos/jobs/vendor-catalog-qbp-master:run" --http-method=POST --oauth-service-account-email=$(gcloud iam service-accounts list --filter='displayName:Default compute service account' --format='value(email)' --project=cadence-pos --account=fritz@retailsoftsystems.com) --project=cadence-pos --account=fritz@retailsoftsystems.com
```

Inventory — hourly at :15:

```
gcloud scheduler jobs create http vendor-catalog-qbp-inventory --location=us-central1 --schedule="15 * * * *" --time-zone="America/New_York" --uri="https://us-central1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/cadence-pos/jobs/vendor-catalog-qbp-inventory:run" --http-method=POST --oauth-service-account-email=$(gcloud iam service-accounts list --filter='displayName:Default compute service account' --format='value(email)' --project=cadence-pos --account=fritz@retailsoftsystems.com) --project=cadence-pos --account=fritz@retailsoftsystems.com
```

After scheduling, the next `platformAdminSyncScheduledJobsCallable` run (or 10-minute auto-sync) picks both jobs up, joins them to the registry entries in `functions/saas/vendor-catalog-jobs.js`, and surfaces them in the admin Scheduled Jobs UI.

## Manual runs

Run on-demand from any machine with `gcloud` authed against cadence-pos:

```
gcloud run jobs execute vendor-catalog-qbp-master --region=us-central1 --project=cadence-pos --account=fritz@retailsoftsystems.com --wait
gcloud run jobs execute vendor-catalog-qbp-inventory --region=us-central1 --project=cadence-pos --account=fritz@retailsoftsystems.com --wait
```

Or locally (requires the same env vars):

```
QBP_MODE=master QBP_API_KEY=... FIREBASE_DATABASE_URL=https://cadence-pos-default-rtdb.firebaseio.com node index.js
QBP_MODE=inventory QBP_API_KEY=... FIREBASE_DATABASE_URL=https://cadence-pos-default-rtdb.firebaseio.com node index.js
```

## Behavior notes

- **Master skip-if-unchanged**: QBP exposes no global "catalog version" timestamp, so the job hashes the `skulist` response and compares against `lastMasterSync.responseHash`. A daily run that finds the same SKU list logs `skipped` and bumps `completedAt` without touching items. Cost of the skip is one cheap `GET /1/product/skulist`.
- **Per-SKU failures don't abort**: a single 404/timeout on `product/sku/{sku}` increments `missCount` and moves on. Look at `lastMasterSync.missCount` for alerts if the count spikes.
- **Master wipes before write**: `items` and `items_by_upc` are nulled in a single multi-path update before re-population, so removed SKUs disappear instead of lingering.
- **Inventory always runs**: warehouse stock changes constantly, so skipping would mask real movements. `inventory_by_item` is wiped + replaced on every run.
- **Zero-qty rows are dropped**: an item with 0 across all warehouses gets no node under `inventory_by_item`. Consumers should treat "missing key" as "out of stock."
- **Retry policy** lives in `api.js`: 3 retries on 429 / 5xx with exponential backoff (500ms → 1500ms → 4500ms), honoring `Retry-After` headers.
