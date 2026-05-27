/**
 * One-off seed: provisions a test tenant + store + owner in cadence-pos
 * Firestore so the Stripe Connect reader payment flow can be tested without
 * going through cadence-dashboard's WIP provisioning UI.
 *
 * Mirrors the production logic in functions/saas/auth-claims.js
 * (platformAdminCreateTenantCallable). Uses firebase-admin via ADC --
 * no service account key required.
 *
 * Prereqs (already done by check-saas-readiness probe):
 *   - gcloud auth application-default login --account=fritz@retailsoftsystems.com
 *   - gcloud auth application-default set-quota-project cadence-pos
 *
 * Usage:
 *   node scripts/seed-test-tenant.js
 *   node scripts/seed-test-tenant.js --tenantID=my-test --ownerEmail=me@example.com
 *
 * Idempotent on tenantID -- re-running with an existing tenantID exits non-zero.
 * Owner email must not already carry a tenantID claim (one-user-one-tenant rule).
 */

const admin = require("firebase-admin");

const PROJECT = "cadence-pos";

const DEFAULTS = {
  tenantID: "cadence-test-001",
  tenantName: "Cadence Test Tenant",
  ownerEmail: "fritz+cadencetest@retailsoftsystems.com",
  ownerFirstName: "Test",
  ownerLastName: "Owner",
  ownerPhone: "+14155551234",
  storeStreet: "123 Test Street",
  storeUnit: "",
  storeCity: "Anytown",
  storeState: "CA",
  storeZip: "90001",
  storePhone: "+14155551234",
  salesTaxPercent: "8.5",
};

function parseArgs() {
  const out = { ...DEFAULTS };
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  out.salesTaxPercent = parseFloat(out.salesTaxPercent);
  if (Number.isNaN(out.salesTaxPercent)) {
    console.error("X --salesTaxPercent must be a number");
    process.exit(1);
  }
  return out;
}

function buildShopContactBlurb({ street, unit, city, state, zip, phone }) {
  const line1 = unit ? street + ", " + unit : street;
  const line2 = city + ", " + state + " " + zip;
  return line1 + "\n" + line2 + "\n" + phone;
}

function applyStoreOverrides(settings, { tenantID, storeID, storeDisplayName, storeAddress, salesTaxPercent }) {
  settings.tenantID = tenantID;
  settings.storeID = storeID;
  if (settings.amazonExtension) settings.amazonExtension.storeId = storeID;
  settings.storeInfo = {
    ...settings.storeInfo,
    displayName: storeDisplayName,
    street: storeAddress.street,
    unit: storeAddress.unit,
    city: storeAddress.city,
    state: storeAddress.state,
    zip: storeAddress.zip,
    phone: storeAddress.phone,
  };
  settings.shopContactBlurb = buildShopContactBlurb(storeAddress);
  settings.salesTaxPercent = salesTaxPercent;
  return settings;
}

function regenIDsForArr(arr, gen) {
  return (arr || []).map((item) => ({ ...item, id: gen() }));
}
function regenStatusIDs(statuses, gen) {
  return (statuses || []).map((s) => (s.removable === true ? { ...s, id: gen() } : s));
}
function regenNestedCategoryIDs(categories, gen) {
  return (categories || []).map((cat) => ({
    ...cat,
    id: gen(),
    items: (cat.items || []).map((i) => ({ ...i, id: gen() })),
  }));
}

function buildBootstrapSettings(SETTINGS_OBJ, gen, opts) {
  const settings = JSON.parse(JSON.stringify(SETTINGS_OBJ));
  applyStoreOverrides(settings, opts);
  settings.thankYouBlurb = "Thank you for your business!";
  settings.quickItemButtons = [];
  settings.statuses = regenStatusIDs(settings.statuses, gen);
  settings.discounts = regenIDsForArr(settings.discounts, gen);
  settings.waitTimeLabelCategories = regenIDsForArr(settings.waitTimeLabelCategories, gen);
  settings.waitTimes = regenIDsForArr(settings.waitTimes, gen);
  if (settings.storeHours) {
    settings.storeHours.standard = regenIDsForArr(settings.storeHours.standard, gen);
    settings.storeHours.special = regenIDsForArr(settings.storeHours.special, gen);
  }
  settings.noteHelpers = regenNestedCategoryIDs(settings.noteHelpers, gen);
  settings.customerQuickNotes = regenNestedCategoryIDs(settings.customerQuickNotes, gen);
  return settings;
}

async function main() {
  const args = parseArgs();

  const { SETTINGS_OBJ } = require("../functions/shared/data");
  const { generateEAN13Barcode } = require("../functions/shared/idGen");

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: PROJECT,
    });
  }
  const db = admin.firestore();
  const auth = admin.auth();

  console.log("== Seed test tenant -> " + PROJECT + " ==");
  console.log("  tenantID:    " + args.tenantID);
  console.log("  tenantName:  " + args.tenantName);
  console.log("  ownerEmail:  " + args.ownerEmail);
  console.log("  storeState:  " + args.storeState);
  console.log("");

  const tenantRef = db.collection("tenants").doc(args.tenantID);
  const existing = await tenantRef.get();
  if (existing.exists) {
    console.error("X Tenant '" + args.tenantID + "' already exists.");
    console.error("  Use --tenantID=something-else or delete the existing tenant first.");
    process.exit(1);
  }

  let ownerUser;
  let userCreated = false;
  try {
    ownerUser = await auth.getUserByEmail(args.ownerEmail);
  } catch (err) {
    if (err && err.code === "auth/user-not-found") {
      ownerUser = await auth.createUser({
        email: args.ownerEmail,
        emailVerified: false,
        displayName: args.ownerFirstName + " " + args.ownerLastName,
      });
      userCreated = true;
    } else {
      throw err;
    }
  }
  console.log("[OK] " + (userCreated ? "Created" : "Found") + " Auth user: " + ownerUser.uid);

  const existingClaims = ownerUser.customClaims || {};
  if (existingClaims.tenantID) {
    console.error("X User " + args.ownerEmail + " already has tenantID claim '" + existingClaims.tenantID + "'.");
    console.error("  One-user-one-tenant rule. Use a different --ownerEmail.");
    process.exit(1);
  }

  const storeID = generateEAN13Barcode();
  console.log("[OK] Generated storeID: " + storeID);

  await auth.setCustomUserClaims(ownerUser.uid, {
    tenantID: args.tenantID,
    privilege: "owner",
    stores: [storeID],
  });
  console.log("[OK] Stamped owner claims: { tenantID, privilege: 'owner', stores: [" + storeID + "] }");

  await tenantRef.set({
    name: args.tenantName,
    ownerUID: ownerUser.uid,
    ownerEmail: args.ownerEmail,
    ownerFirstName: args.ownerFirstName,
    ownerLastName: args.ownerLastName,
    ownerPhone: args.ownerPhone,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdByUID: "seed-script",
  });
  console.log("[OK] Wrote tenants/" + args.tenantID);

  const storeAddress = {
    street: args.storeStreet,
    unit: args.storeUnit,
    city: args.storeCity,
    state: args.storeState.toUpperCase(),
    zip: args.storeZip,
    phone: args.storePhone,
  };
  const storeRef = tenantRef.collection("stores").doc(storeID);
  await storeRef.set({
    displayName: args.tenantName,
    street: storeAddress.street,
    unit: storeAddress.unit,
    city: storeAddress.city,
    state: storeAddress.state,
    zip: storeAddress.zip,
    phone: storeAddress.phone,
    salesTaxPercent: args.salesTaxPercent,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdByUID: "seed-script",
  });
  console.log("[OK] Wrote tenants/" + args.tenantID + "/stores/" + storeID);

  const settings = buildBootstrapSettings(SETTINGS_OBJ, generateEAN13Barcode, {
    tenantID: args.tenantID,
    storeID,
    storeDisplayName: args.tenantName,
    storeAddress,
    salesTaxPercent: args.salesTaxPercent,
  });
  await storeRef.collection("settings").doc("settings").set(settings);
  console.log("[OK] Wrote .../settings/settings");

  let signInLink = "";
  try {
    signInLink = await auth.generateSignInWithEmailLink(args.ownerEmail, {
      url: "https://cadence-pos.web.app/invite-accept?bootstrap=1",
      handleCodeInApp: true,
    });
  } catch (e) {
    console.warn("[WARN] Could not mint email sign-in link: " + e.message);
    console.warn("       (Not blocking -- you can sign in via the app's normal email-link flow.)");
  }

  console.log("");
  console.log("== DONE ==");
  console.log("  Tenant:      tenants/" + args.tenantID);
  console.log("  Store:       tenants/" + args.tenantID + "/stores/" + storeID);
  console.log("  Owner UID:   " + ownerUser.uid);
  console.log("  Owner email: " + args.ownerEmail);
  if (signInLink) {
    console.log("");
    console.log("Sign-in link (email magic link, ~1h):");
    console.log("  " + signInLink);
  }
  console.log("");
  console.log("Next steps:");
  console.log("  1. Sign into the warpspeed app as " + args.ownerEmail);
  console.log("     (the app's Firebase config must point at " + PROJECT + ")");
  console.log("  2. Navigate to /stripe-connect and complete Express onboarding");
  console.log("  3. From that screen, create a terminal location + register a reader");
  console.log("  4. Re-run: node scripts/check-saas-readiness.js");
  console.log("  5. Open new-checkout modal, run a test payment");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Seed failed: " + (e && e.stack ? e.stack : e));
    process.exit(2);
  });
