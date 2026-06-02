/* eslint-disable */
// Cloud Scheduler control plane — mirror + edit.
//
// GCP is the system of record. The reconciler (`runScheduledJobsSyncScheduledFn`,
// every 10 min) lists all Cloud Scheduler jobs in the project and upserts a
// mirror doc at `platform-scheduled-jobs/{basename}`. The write callable
// (`platformAdminUpdateScheduledJobCallable`) hits Cloud Scheduler directly
// then re-mirrors that single job before returning, so the UI sees the new
// state immediately without waiting for the next sweep.
//
// Mutability: jobs whose basename starts with `firebase-schedule-` are owned
// by Firebase Functions v2 deploys (`onSchedule`). Pausing/editing them via
// gcloud or the SDK gets clobbered on the next deploy of the owning function.
// We mirror them anyway — visibility matters during triage — but the mutable
// flag is false and the write callable rejects mutations on them. The
// dashboard disables Pause/Edit controls and explains why.
//
// Doc-ID convention: the Firestore doc ID is the basename (e.g.
// `vendor-catalog-jbi-master-daily`); the full resource name lives in
// `resourceName`. listJobs returns the full path; UIs and deeplinks want
// the basename.

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const { CloudSchedulerClient } = require("@google-cloud/scheduler");
const { assertPlatformAdmin } = require("./auth-guards");
const { getVendorJobMeta } = require("./vendor-catalog-jobs");

if (!admin.apps.length) admin.initializeApp();

const COLLECTION = "platform-scheduled-jobs";
const REGION = "us-central1";
const FIREBASE_SCHEDULE_PREFIX = "firebase-schedule-";
// Extend if jobs ever land outside us-central1.
const SYNC_LOCATIONS = ["us-central1"];

let _client = null;
function getClient() {
  if (!_client) _client = new CloudSchedulerClient();
  return _client;
}

function requireAuth(request) {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  return request.auth;
}

function basenameFromResource(name) {
  if (!name) return "";
  const idx = name.lastIndexOf("/");
  return idx >= 0 ? name.slice(idx + 1) : name;
}

// Proto Timestamp -> millis. The Cloud Scheduler client returns `{ seconds,
// nanos }` objects for timestamp fields; values may be strings or numbers
// depending on the long-handling mode.
function tsToMillis(ts) {
  if (!ts) return null;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  const seconds = Number(ts.seconds || 0);
  const nanos = Number(ts.nanos || 0);
  if (!seconds && !nanos) return null;
  return seconds * 1000 + Math.floor(nanos / 1e6);
}

function jobStateToString(state) {
  if (typeof state === "string") return state;
  const map = {
    0: "STATE_UNSPECIFIED",
    1: "ENABLED",
    2: "PAUSED",
    3: "DISABLED",
    4: "UPDATE_FAILED",
  };
  return map[state] || "STATE_UNSPECIFIED";
}

function targetFromJob(job) {
  if (job.httpTarget) {
    return {
      type: "http",
      uri: job.httpTarget.uri || "",
      httpMethod: job.httpTarget.httpMethod
        ? String(job.httpTarget.httpMethod)
        : "",
    };
  }
  if (job.pubsubTarget) {
    return {
      type: "pubsub",
      topic: job.pubsubTarget.topicName || "",
    };
  }
  if (job.appEngineHttpTarget) {
    return {
      type: "appengine",
      uri: job.appEngineHttpTarget.relativeUri || "",
      httpMethod: job.appEngineHttpTarget.httpMethod
        ? String(job.appEngineHttpTarget.httpMethod)
        : "",
    };
  }
  return { type: "unknown" };
}

function serializeJob(job) {
  const resourceName = job.name || "";
  const jobID = basenameFromResource(resourceName);
  const mutable = jobID && !jobID.startsWith(FIREBASE_SCHEDULE_PREFIX);
  // Enrichment from the vendor-jobs registry — display name, vendor grouping,
  // tooltip, recommended cadence. Null when the basename isn't in the registry;
  // the dashboard renders such jobs without grouping context.
  const vendorMeta = getVendorJobMeta(jobID);
  return {
    jobID,
    resourceName,
    description: job.description || "",
    schedule: job.schedule || "",
    timeZone: job.timeZone || "",
    state: jobStateToString(job.state),
    target: targetFromJob(job),
    lastAttemptTime: tsToMillis(job.lastAttemptTime),
    userUpdateTime: tsToMillis(job.userUpdateTime),
    scheduleTime: tsToMillis(job.scheduleTime),
    mutable: !!mutable,
    vendorMeta: vendorMeta || null,
    mirroredAt: Date.now(),
  };
}

async function syncAllLocations(db) {
  const client = getClient();
  const projectID = process.env.GCLOUD_PROJECT;
  if (!projectID) {
    throw new Error("GCLOUD_PROJECT env var is missing.");
  }

  const seen = new Set();
  let total = 0;
  for (const loc of SYNC_LOCATIONS) {
    const parent = `projects/${projectID}/locations/${loc}`;
    const [jobs] = await client.listJobs({ parent });
    for (const job of jobs) {
      const data = serializeJob(job);
      if (!data.jobID) continue;
      await db.collection(COLLECTION).doc(data.jobID).set(data);
      seen.add(data.jobID);
      total += 1;
    }
  }

  // Hard orphan delete: anything in the mirror that the listing didn't
  // return is gone from GCP (out-of-band delete). No grace window — the
  // mirror should not be the system of record for deleted jobs.
  const existing = await db.collection(COLLECTION).get();
  let deleted = 0;
  for (const doc of existing.docs) {
    if (!seen.has(doc.id)) {
      await doc.ref.delete();
      deleted += 1;
    }
  }

  return { synced: total, deleted };
}

exports.runScheduledJobsSyncScheduledFn = onSchedule(
  {
    schedule: "every 10 minutes",
    timeZone: "America/Chicago",
    region: REGION,
  },
  async () => {
    const db = getFirestore();
    const summary = await syncAllLocations(db);
    logger.info("runScheduledJobsSyncScheduledFn: complete", summary);
  }
);

exports.platformAdminSyncScheduledJobsCallable = onCall(
  { region: REGION },
  async (request) => {
    const auth = requireAuth(request);
    assertPlatformAdmin(auth);
    const db = getFirestore();
    const summary = await syncAllLocations(db);
    logger.info("platformAdminSyncScheduledJobsCallable: complete", {
      uid: auth.uid,
      ...summary,
    });
    return { success: true, ...summary };
  }
);

exports.platformAdminListScheduledJobsCallable = onCall(
  { region: REGION },
  async (request) => {
    const auth = requireAuth(request);
    assertPlatformAdmin(auth);
    const db = getFirestore();
    const snap = await db.collection(COLLECTION).get();
    const jobs = snap.docs.map((d) => d.data() || {});
    jobs.sort((a, b) => (a.jobID || "").localeCompare(b.jobID || ""));
    return { success: true, jobs };
  }
);

exports.platformAdminUpdateScheduledJobCallable = onCall(
  { region: REGION },
  async (request) => {
    const auth = requireAuth(request);
    assertPlatformAdmin(auth);

    const data = request.data || {};
    const jobID = typeof data.jobID === "string" ? data.jobID.trim() : "";
    const action = typeof data.action === "string" ? data.action.trim() : "";
    const schedule =
      typeof data.schedule === "string" ? data.schedule.trim() : "";

    if (!jobID) {
      throw new HttpsError("invalid-argument", "jobID is required.");
    }
    if (!["pause", "resume", "updateSchedule"].includes(action)) {
      throw new HttpsError(
        "invalid-argument",
        "action must be one of: pause, resume, updateSchedule."
      );
    }
    if (jobID.startsWith(FIREBASE_SCHEDULE_PREFIX)) {
      throw new HttpsError(
        "failed-precondition",
        "This job is owned by Firebase Functions deploy and can't be edited here. Change the schedule in source and redeploy."
      );
    }
    if (action === "updateSchedule" && !schedule) {
      throw new HttpsError(
        "invalid-argument",
        "schedule (cron string) is required for updateSchedule."
      );
    }

    const db = getFirestore();
    const mirrorRef = db.collection(COLLECTION).doc(jobID);
    const mirrorSnap = await mirrorRef.get();
    if (!mirrorSnap.exists) {
      throw new HttpsError(
        "not-found",
        `Scheduled job '${jobID}' is not in the mirror. Run a sync first or check the basename.`
      );
    }
    const mirror = mirrorSnap.data() || {};
    const resourceName = mirror.resourceName;
    if (!resourceName) {
      throw new HttpsError(
        "internal",
        `Mirror doc for '${jobID}' is missing resourceName.`
      );
    }
    // Belt + suspenders: the basename check above guards against
    // firebase-schedule-* edits, but mirror.mutable is the field the UI
    // gates on, so honor it server-side too in case a future reconciler
    // tightens the rule.
    if (mirror.mutable === false) {
      throw new HttpsError(
        "failed-precondition",
        "Mirror marks this job as immutable. Edit at the source instead."
      );
    }

    const client = getClient();
    if (action === "pause") {
      await client.pauseJob({ name: resourceName });
    } else if (action === "resume") {
      await client.resumeJob({ name: resourceName });
    } else if (action === "updateSchedule") {
      await client.updateJob({
        job: { name: resourceName, schedule },
        updateMask: { paths: ["schedule"] },
      });
    }

    const [job] = await client.getJob({ name: resourceName });
    const serialized = serializeJob(job);
    await mirrorRef.set(serialized);

    logger.info("platformAdminUpdateScheduledJobCallable: applied", {
      uid: auth.uid,
      jobID,
      action,
      newState: serialized.state,
    });

    return { success: true, job: serialized };
  }
);
