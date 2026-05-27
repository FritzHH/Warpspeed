/**
 * SaaS (cadence-pos) test-readiness probe.
 *
 * Read-only. Verifies the live cadence-pos project has what the Stripe Connect
 * Terminal reader payment flow needs before you sit down to test:
 *   - firebase CLI alias bound to `rss` (cadence-pos) for this directory
 *   - Pub/Sub topics: stripe-events, stripe-events-dlq
 *   - GCP secrets: STRIPE_PLATFORM_SECRET_KEY, STRIPE_CONNECT_WEBHOOK_SECRET
 *   - Cloud Functions deployed (Connect callables, webhook, subscribers)
 *   - (Optional, if scripts/serviceAccountKeyCadence.json exists) at least one
 *     onboarded Connect account with chargesEnabled, matching index doc, a
 *     terminalLocationID in connect-config/config for the store, and >=1 reader
 *
 * Usage: node scripts/check-saas-readiness.js
 *
 * Exit code is 0 if all critical checks pass, 1 if any fail.
 * Stripe-side webhook registration must be verified manually in the Stripe
 * Dashboard (Connect -> Webhooks -> events on Connected accounts).
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");

const PROJECT = "cadence-pos";
const ACCOUNT = "fritz@retailsoftsystems.com";

const REQUIRED_FUNCTIONS = [
  "stripeConnectAccountCreate",
  "stripeConnectAccountLinkCreate",
  "stripeConnectAccountStatusCallable",
  "stripeWebhookV2_Connect",
  "pubsubStripeEventSubscriber",
  "pubsubStripeDeadLetterIngestor",
  "stripeConnectInitiatePaymentIntentV2",
  "stripeConnectCancelPaymentIntentV2",
  "stripeConnectCreateTapToPayPaymentIntentCallable",
  "stripeConnectCreateTerminalLocationCallable",
  "stripeConnectRegisterReaderCallable",
  "stripeConnectListReadersCallable",
  "stripeConnectConnectionTokenCallable",
  "stripeConnectCreateCheckoutSessionV2",
];

const REQUIRED_TOPICS = ["stripe-events", "stripe-events-dlq"];

const REQUIRED_SECRETS = [
  "STRIPE_PLATFORM_SECRET_KEY",
  "STRIPE_CONNECT_WEBHOOK_SECRET",
];

let failed = 0;
let warned = 0;

function pass(label) {
  console.log("  [OK] " + label);
}
function fail(label, hint) {
  failed++;
  console.log("  [FAIL] " + label);
  if (hint) console.log("         " + hint);
}
function warn(label, hint) {
  warned++;
  console.log("  [WARN] " + label);
  if (hint) console.log("         " + hint);
}
function section(title) {
  console.log("");
  console.log("== " + title + " ==");
}

function runCmd(cmd, args) {
  const res = spawnSync(cmd, args, { encoding: "utf8", shell: true });
  return {
    stdout: res.stdout || "",
    stderr: res.stderr || "",
    code: res.status == null ? -1 : res.status,
    error: res.error,
  };
}

function gcloud(args) {
  return runCmd("gcloud", args.concat(["--project=" + PROJECT, "--account=" + ACCOUNT]));
}

function checkFirebaseAlias() {
  section("Firebase CLI alias");
  const candidates = [
    process.env.XDG_CONFIG_HOME &&
      path.join(process.env.XDG_CONFIG_HOME, "configstore", "firebase-tools.json"),
    path.join(os.homedir(), ".config", "configstore", "firebase-tools.json"),
  ].filter(Boolean);

  const configstorePath = candidates.find((p) => fs.existsSync(p));
  if (!configstorePath) {
    fail(
      "firebase-tools configstore not found",
      "Run `yarn rss` or `firebase login` first."
    );
    return;
  }
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(configstorePath, "utf8"));
  } catch (e) {
    fail("Could not parse configstore: " + e.message);
    return;
  }
  const projectRoot = path.resolve(__dirname, "..");
  const alias = cfg && cfg.activeProjects && cfg.activeProjects[projectRoot];
  if (alias === "rss") {
    pass("active alias = rss (cadence-pos)");
  } else if (alias) {
    warn(
      "active alias is `" + alias + "`, expected `rss`",
      "Run `yarn rss` to bind cadence-pos. (Probe will still run live checks against " +
        PROJECT +
        ".)"
    );
  } else {
    warn(
      "no active alias set for this directory",
      "Run `yarn rss` to bind cadence-pos."
    );
  }
}

function checkGcloudAuth() {
  section("gcloud authentication");
  const res = runCmd("gcloud", ["auth", "list", "--format=value(account,status)"]);
  if (res.code !== 0) {
    fail(
      "gcloud not available or not authenticated",
      "Install gcloud SDK and run `gcloud auth login " + ACCOUNT + "`."
    );
    return false;
  }
  const lines = res.stdout.split(/\r?\n/).filter(Boolean);
  const has = lines.some((l) => l.includes(ACCOUNT));
  if (has) {
    pass("gcloud has account " + ACCOUNT + " available");
    return true;
  }
  fail(
    "gcloud account " + ACCOUNT + " not signed in",
    "Run `gcloud auth login " + ACCOUNT + "`."
  );
  return false;
}

function checkPubsubTopics() {
  section("Pub/Sub topics");
  const res = gcloud(["pubsub", "topics", "list", "--format=value(name)"]);
  if (res.code !== 0) {
    fail(
      "Could not list pubsub topics: " + (res.stderr.trim() || "unknown error"),
      "Ensure pubsub.googleapis.com is enabled in " + PROJECT + "."
    );
    return;
  }
  const names = new Set(
    res.stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map((s) => s.split("/").pop())
  );
  for (const t of REQUIRED_TOPICS) {
    if (names.has(t)) {
      pass("topic exists: " + t);
    } else {
      fail(
        "topic missing: " + t,
        "Create with: gcloud pubsub topics create " + t + " --project=" + PROJECT +
          " --account=" + ACCOUNT
      );
    }
  }
}

function checkSecrets() {
  section("GCP Secret Manager");
  const res = gcloud(["secrets", "list", "--format=value(name)"]);
  if (res.code !== 0) {
    fail(
      "Could not list secrets: " + (res.stderr.trim() || "unknown error"),
      "Ensure secretmanager.googleapis.com is enabled and you have Secret Manager access."
    );
    return;
  }
  const names = new Set(res.stdout.split(/\r?\n/).filter(Boolean));
  for (const s of REQUIRED_SECRETS) {
    if (names.has(s)) {
      const v = gcloud([
        "secrets",
        "versions",
        "list",
        s,
        "--filter=state=enabled",
        "--format=value(name)",
        "--limit=1",
      ]);
      if (v.code === 0 && v.stdout.trim()) {
        pass("secret has enabled version: " + s);
      } else {
        fail(
          "secret exists but no enabled version: " + s,
          "Add a new version in GCP Console -> Secret Manager."
        );
      }
    } else {
      fail(
        "secret missing: " + s,
        "Create in GCP Console -> Secret Manager (project " + PROJECT + ")."
      );
    }
  }
}

function checkFunctions() {
  section("Cloud Functions deployed");
  const res = gcloud([
    "functions",
    "list",
    "--regions=us-central1",
    "--format=value(name,state)",
  ]);
  if (res.code !== 0) {
    fail(
      "Could not list functions: " + (res.stderr.trim() || "unknown error"),
      "Ensure cloudfunctions.googleapis.com is enabled."
    );
    return;
  }
  const deployed = new Map();
  for (const line of res.stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split(/\s+/);
    const fullName = parts[0];
    const state = parts[1] || "";
    const shortName = fullName.split("/").pop();
    deployed.set(shortName, state);
  }
  for (const fn of REQUIRED_FUNCTIONS) {
    const state = deployed.get(fn);
    if (!state) {
      fail(
        "function not deployed: " + fn,
        "Deploy with: firebase deploy --only functions:" + fn +
          " --project=" + PROJECT + " --account=" + ACCOUNT
      );
    } else if (state.toUpperCase() !== "ACTIVE") {
      warn("function deployed but state=" + state + ": " + fn);
    } else {
      pass("function active: " + fn);
    }
  }
}

function findAdcPath() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }
  const candidates = [
    process.env.APPDATA && path.join(process.env.APPDATA, "gcloud", "application_default_credentials.json"),
    path.join(os.homedir(), ".config", "gcloud", "application_default_credentials.json"),
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function tryFirestoreAdmin() {
  const keyPath = path.join(__dirname, "serviceAccountKeyCadence.json");
  const haveKey = fs.existsSync(keyPath);
  const adcPath = findAdcPath();

  if (!haveKey && !adcPath) {
    section("Firestore data (cadence-pos) -- SKIPPED");
    warn(
      "no credentials available for firebase-admin",
      "Option A: run `gcloud auth application-default login --account=" + ACCOUNT + "` " +
        "and `gcloud auth application-default set-quota-project " + PROJECT + "`.\n" +
        "         Option B: drop a service-account JSON at scripts/serviceAccountKeyCadence.json."
    );
    return null;
  }

  let admin;
  try {
    admin = require("firebase-admin");
  } catch (e) {
    section("Firestore data (cadence-pos) -- SKIPPED");
    warn(
      "firebase-admin not installed in scripts/ workspace",
      "Run: cd scripts && npm install (firebase-admin is in scripts/package.json)."
    );
    return null;
  }

  section(
    "Firestore data (cadence-pos) -- using " +
      (haveKey ? "service-account JSON" : "ADC at " + adcPath)
  );

  try {
    if (haveKey) {
      const key = JSON.parse(fs.readFileSync(keyPath, "utf8"));
      if (key.project_id !== PROJECT) {
        warn(
          "serviceAccountKeyCadence.json project_id=" + key.project_id + " (expected " + PROJECT + ")",
          "Use a service account from " + PROJECT + "."
        );
      }
      if (!admin.apps.length) {
        admin.initializeApp({ credential: admin.credential.cert(key), projectId: PROJECT });
      }
    } else {
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.applicationDefault(),
          projectId: PROJECT,
        });
      }
    }
    return admin.firestore();
  } catch (e) {
    warn("Could not init firebase-admin: " + e.message);
    return null;
  }
}

async function checkFirestore(db) {
  let onboardedAccount = null;
  let onboardedTenantID = null;
  try {
    const tenants = await db.collection("tenants").limit(50).get();
    if (tenants.empty) {
      fail(
        "no tenants/* docs found",
        "Provision at least one tenant via the host onboarding site before testing."
      );
      return;
    }
    let scannedAccounts = 0;
    for (const t of tenants.docs) {
      const accts = await db
        .collection("tenants/" + t.id + "/connect-accounts")
        .limit(20)
        .get();
      for (const a of accts.docs) {
        scannedAccounts++;
        const d = a.data() || {};
        if (
          d.chargesEnabled === true &&
          d.status !== "deauthorized" &&
          (d.detailsSubmitted !== false)
        ) {
          onboardedAccount = { id: a.id, data: d };
          onboardedTenantID = t.id;
          break;
        }
      }
      if (onboardedAccount) break;
    }
    if (!onboardedAccount) {
      fail(
        "no onboarded Connect account with chargesEnabled=true found (scanned " +
          scannedAccounts + " account docs across " + tenants.size + " tenants)",
        "Complete Stripe Connect onboarding for at least one test tenant via /stripe-connect."
      );
      return;
    }
    pass(
      "Connect account ready: tenants/" + onboardedTenantID + "/connect-accounts/" + onboardedAccount.id
    );

    const idxRef = db.doc("connect-accounts-index/" + onboardedAccount.id);
    const idx = await idxRef.get();
    if (idx.exists) {
      pass("connect-accounts-index/" + onboardedAccount.id + " present");
    } else {
      fail(
        "connect-accounts-index/" + onboardedAccount.id + " missing",
        "Webhook routing for this account will fail. Re-run onboarding callable or backfill the index."
      );
    }

    const storesSnap = await db
      .collection("tenants/" + onboardedTenantID + "/stores")
      .limit(20)
      .get();
    if (storesSnap.empty) {
      fail(
        "tenant " + onboardedTenantID + " has no stores/*",
        "Provision at least one store under this tenant."
      );
      return;
    }
    let foundLocation = null;
    let foundReaderStore = null;
    for (const s of storesSnap.docs) {
      const cfg = await db
        .doc("tenants/" + onboardedTenantID + "/stores/" + s.id + "/connect-config/config")
        .get();
      if (cfg.exists && cfg.data() && cfg.data().terminalLocationID) {
        foundLocation = { storeID: s.id, locationID: cfg.data().terminalLocationID };
      }
      const readers = await db
        .collection("tenants/" + onboardedTenantID + "/stores/" + s.id + "/readers")
        .limit(5)
        .get();
      if (!readers.empty) {
        foundReaderStore = { storeID: s.id, count: readers.size };
      }
      if (foundLocation && foundReaderStore) break;
    }
    if (foundLocation) {
      pass(
        "terminalLocationID present: store=" + foundLocation.storeID +
          " location=" + foundLocation.locationID
      );
    } else {
      fail(
        "no store under tenant " + onboardedTenantID + " has connect-config/config.terminalLocationID",
        "Create a Terminal Location via stripeConnectCreateTerminalLocationCallable."
      );
    }
    if (foundReaderStore) {
      pass(
        "readers registered: store=" + foundReaderStore.storeID +
          " count>=" + foundReaderStore.count
      );
    } else {
      fail(
        "no readers in any store under tenant " + onboardedTenantID,
        "Register a test reader via stripeConnectRegisterReaderCallable, then refresh with stripeConnectListReadersCallable."
      );
    }
  } catch (e) {
    fail("Firestore probe error: " + (e.message || e));
  }
}

function manualChecks() {
  section("Manual checks (probe cannot verify)");
  console.log("  - Stripe Dashboard -> Developers -> Webhooks -> Connected accounts endpoint");
  console.log("    points at the deployed stripeWebhookV2_Connect URL and signs with");
  console.log("    STRIPE_CONNECT_WEBHOOK_SECRET. Required event types include:");
  console.log("      terminal.reader.action_succeeded, terminal.reader.action_failed,");
  console.log("      account.updated, account.application.deauthorized,");
  console.log("      payout.paid, payout.failed,");
  console.log("      charge.refunded, charge.dispute.created/updated/closed,");
  console.log("      checkout.session.completed, checkout.session.expired");
  console.log("  - The Stripe test reader is online (Dashboard -> Terminal -> Readers).");
  console.log("  - The signed-in app user's JWT has claims.tenantID matching the tenant");
  console.log("    whose Connect account you're testing against.");
}

async function main() {
  console.log("SaaS test-readiness probe -> project " + PROJECT + " (" + ACCOUNT + ")");

  checkFirebaseAlias();
  const haveGcloud = checkGcloudAuth();
  if (haveGcloud) {
    checkPubsubTopics();
    checkSecrets();
    checkFunctions();
  } else {
    section("Pub/Sub, Secrets, Functions -- SKIPPED");
    warn("gcloud unavailable; cannot probe live project state");
  }

  const db = tryFirestoreAdmin();
  if (db) {
    await checkFirestore(db);
  }

  manualChecks();

  console.log("");
  console.log("== Summary ==");
  console.log("  failed:  " + failed);
  console.log("  warned:  " + warned);
  if (failed === 0) {
    console.log("  OK -- no blocking issues detected. Verify the manual checks above before testing.");
    process.exit(0);
  } else {
    console.log("  X  -- resolve the [FAIL] items above before testing.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Probe crashed: " + (e && e.stack ? e.stack : e));
  process.exit(2);
});
