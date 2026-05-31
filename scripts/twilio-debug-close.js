/**
 * Twilio subaccount close diagnostic.
 *
 * Bypasses Firestore gating in platformAdminDeleteTenantCallable +
 * closeSubaccountInternal. Talks straight to Twilio's REST API with
 * verbose step-by-step logging so we can see exactly where the close
 * sequence breaks.
 *
 * Auth: Application Default Credentials (same as seed-test-tenant.js).
 * Prereqs:
 *   gcloud auth application-default login --account=fritz@retailsoftsystems.com
 *   gcloud auth application-default set-quota-project cadence-pos
 *
 * Usage:
 *   node scripts/twilio-debug-close.js AC2bc1234567890abcdef
 *   node scripts/twilio-debug-close.js AC... --no-release    (skip number release)
 *   node scripts/twilio-debug-close.js AC... --dry           (fetch only, no mutations)
 */

const PROJECT_ID = "cadence-pos";
const MASTER_SID_SECRET = "TWILIO_MASTER_ACCOUNT_SID";
const MASTER_TOKEN_SECRET = "TWILIO_MASTER_AUTH_TOKEN";

const args = process.argv.slice(2);
const subaccountSid = args.find((a) => a.startsWith("AC"));
const skipRelease = args.includes("--no-release");
const dryRun = args.includes("--dry");

if (!subaccountSid) {
  console.error("Usage: node scripts/twilio-debug-close.js <SUBACCOUNT_SID> [--no-release] [--dry]");
  console.error("       SID must start with AC");
  process.exit(1);
}

const { SecretManagerServiceClient } = require("@google-cloud/secret-manager");
const Twilio = require("twilio");

function line(char = "=") {
  return char.repeat(72);
}

async function fetchSecret(secretClient, secretName) {
  const name = `projects/${PROJECT_ID}/secrets/${secretName}/versions/latest`;
  console.log(`[secret] Fetching ${secretName}...`);
  const [version] = await secretClient.accessSecretVersion({ name });
  const value = version.payload.data.toString("utf8").trim();
  console.log(`[secret] ${secretName} fetched (length=${value.length})`);
  return value;
}

function logTwilioError(prefix, err) {
  console.error(`${prefix}: ${err.message}`);
  if (err.code !== undefined) console.error(`${prefix}   code:      ${err.code}`);
  if (err.status !== undefined) console.error(`${prefix}   status:    ${err.status}`);
  if (err.moreInfo) console.error(`${prefix}   moreInfo:  ${err.moreInfo}`);
  if (err.details) console.error(`${prefix}   details:   ${JSON.stringify(err.details)}`);
}

(async () => {
  console.log(line());
  console.log(`Twilio subaccount close diagnostic`);
  console.log(`Target SID: ${subaccountSid}`);
  console.log(`Project:    ${PROJECT_ID}`);
  console.log(`Dry run:    ${dryRun}`);
  console.log(`Skip release: ${skipRelease}`);
  console.log(line());

  let masterSid;
  let masterToken;
  try {
    const secretClient = new SecretManagerServiceClient();
    masterSid = await fetchSecret(secretClient, MASTER_SID_SECRET);
    masterToken = await fetchSecret(secretClient, MASTER_TOKEN_SECRET);
  } catch (err) {
    console.error(`[FATAL] Could not fetch master credentials from Secret Manager.`);
    console.error(`        ${err.message}`);
    console.error(`        Check: gcloud auth application-default login --account=fritz@retailsoftsystems.com`);
    console.error(`        Check: gcloud auth application-default set-quota-project ${PROJECT_ID}`);
    process.exit(1);
  }
  console.log(`Master SID:  ${masterSid}`);

  const master = Twilio(masterSid, masterToken);

  console.log(`\n${line("-")}\nSTEP 1: Fetch current subaccount state\n${line("-")}`);
  let current;
  try {
    current = await master.api.v2010.accounts(subaccountSid).fetch();
    console.log(`status:           ${current.status}`);
    console.log(`friendlyName:     ${current.friendlyName}`);
    console.log(`ownerAccountSid:  ${current.ownerAccountSid}`);
    console.log(`dateCreated:      ${current.dateCreated}`);
    if (current.ownerAccountSid !== masterSid) {
      console.warn(`[WARN] Subaccount owner (${current.ownerAccountSid}) does not match master (${masterSid})`);
      console.warn(`       This subaccount may belong to a different master. Close will fail.`);
    }
  } catch (err) {
    logTwilioError(`[FATAL] Fetch`, err);
    process.exit(1);
  }

  if (current.status === "closed") {
    console.log(`\nSubaccount already closed. Nothing to do.`);
    process.exit(0);
  }

  if (dryRun) {
    console.log(`\n[dry] Stopping here. No mutations performed.`);
    process.exit(0);
  }

  console.log(`\n${line("-")}\nSTEP 2: List phone numbers attached to subaccount\n${line("-")}`);
  let numbers = [];
  const subClient = Twilio(masterSid, masterToken, { accountSid: subaccountSid });
  try {
    numbers = await subClient.incomingPhoneNumbers.list({ limit: 100 });
    console.log(`number count: ${numbers.length}`);
    numbers.forEach((n) => {
      console.log(`  - ${n.phoneNumber}  sid=${n.sid}`);
    });
  } catch (err) {
    logTwilioError(`[ERROR] List numbers`, err);
  }

  if (numbers.length > 0 && !skipRelease) {
    console.log(`\nReleasing ${numbers.length} numbers before close (Twilio rejects close-with-numbers)...`);
    for (const n of numbers) {
      try {
        await subClient.incomingPhoneNumbers(n.sid).remove();
        console.log(`  [released] ${n.phoneNumber}`);
      } catch (err) {
        logTwilioError(`  [ERROR] release ${n.phoneNumber}`, err);
      }
    }
  } else if (numbers.length > 0 && skipRelease) {
    console.warn(`\n[WARN] --no-release set but ${numbers.length} numbers attached. Close will likely fail.`);
  }

  if (current.status === "active") {
    console.log(`\n${line("-")}\nSTEP 3: Suspend subaccount\n${line("-")}`);
    try {
      const suspended = await master.api.v2010.accounts(subaccountSid).update({ status: "suspended" });
      console.log(`suspend OK. new status: ${suspended.status}`);
    } catch (err) {
      logTwilioError(`[ERROR] Suspend`, err);
    }
  } else {
    console.log(`\n${line("-")}\nSTEP 3: skipping suspend (current status=${current.status})\n${line("-")}`);
  }

  console.log(`\n${line("-")}\nSTEP 4: Close subaccount\n${line("-")}`);
  try {
    const closed = await master.api.v2010.accounts(subaccountSid).update({ status: "closed" });
    console.log(`close OK. new status: ${closed.status}`);
  } catch (err) {
    logTwilioError(`[ERROR] Close`, err);
  }

  console.log(`\n${line("-")}\nSTEP 5: Re-fetch final state\n${line("-")}`);
  try {
    const final = await master.api.v2010.accounts(subaccountSid).fetch();
    console.log(`final status: ${final.status}`);
    if (final.status !== "closed") {
      console.error(`[FAIL] Subaccount did not reach closed state. Final status: ${final.status}`);
      process.exit(1);
    }
  } catch (err) {
    logTwilioError(`[ERROR] Re-fetch`, err);
  }

  console.log(`\n${line()}`);
  console.log(`Done.`);
})().catch((err) => {
  console.error(`\n[FATAL] Unhandled error: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
