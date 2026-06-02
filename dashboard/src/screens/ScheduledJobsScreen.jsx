import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

const listJobsCallable = httpsCallable(
  functions,
  "platformAdminListScheduledJobsCallable"
);
const syncJobsCallable = httpsCallable(
  functions,
  "platformAdminSyncScheduledJobsCallable"
);
const updateJobCallable = httpsCallable(
  functions,
  "platformAdminUpdateScheduledJobCallable"
);

function formatErr(err, fallback) {
  const code = err?.code || "";
  const msg = err?.message || fallback;
  return code ? `${code}: ${msg}` : msg;
}

function formatTime(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function stateBadgeTone(state) {
  switch (state) {
    case "ENABLED":
      return "accent";
    case "UPDATE_FAILED":
      return "danger";
    case "PAUSED":
    case "DISABLED":
    default:
      return "info";
  }
}

// Jobs grouped by vendorMeta.vendor, alpha by displayName. Unmatched jobs
// (no vendorMeta) collapse into a trailing "Other" group so they're still
// visible — that's a key point of the mirror.
function groupJobs(jobs) {
  const buckets = new Map();
  const other = [];
  for (const job of jobs) {
    const vm = job.vendorMeta;
    if (vm && vm.vendor) {
      const key = vm.vendor;
      if (!buckets.has(key)) {
        buckets.set(key, {
          vendor: key,
          displayName: vm.vendorDisplayName || key,
          jobs: [],
        });
      }
      buckets.get(key).jobs.push(job);
    } else {
      other.push(job);
    }
  }
  const groups = Array.from(buckets.values()).sort((a, b) =>
    a.displayName.localeCompare(b.displayName)
  );
  for (const g of groups) {
    g.jobs.sort((a, b) => (a.jobID || "").localeCompare(b.jobID || ""));
  }
  if (other.length > 0) {
    other.sort((a, b) => (a.jobID || "").localeCompare(b.jobID || ""));
    groups.push({ vendor: "_other", displayName: "Other", jobs: other });
  }
  return groups;
}

export function ScheduledJobsScreen() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  // Per-jobID action state (busy flag + last error). Keyed by jobID.
  const [actionState, setActionState] = useState({});
  // Single-row inline edit — only one cadence edit at a time.
  const [editingJobID, setEditingJobID] = useState(null);
  const [editScheduleInput, setEditScheduleInput] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await listJobsCallable({});
      setJobs(res.data?.jobs || []);
    } catch (err) {
      setLoadError(formatErr(err, "Failed to load scheduled jobs."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMessage("");
    try {
      const res = await syncJobsCallable({});
      const d = res.data || {};
      setSyncMessage(
        `Synced ${d.synced ?? 0} jobs · removed ${d.deleted ?? 0} orphans.`
      );
      await load();
    } catch (err) {
      setSyncMessage(formatErr(err, "Sync failed."));
    } finally {
      setSyncing(false);
    }
  };

  const setJobActionPatch = (jobID, patch) => {
    setActionState((prev) => ({
      ...prev,
      [jobID]: { ...(prev[jobID] || {}), ...patch },
    }));
  };

  const applyJob = (updated) => {
    setJobs((prev) =>
      prev.map((j) => (j.jobID === updated.jobID ? updated : j))
    );
  };

  const handlePauseResume = async (job) => {
    const action = job.state === "PAUSED" ? "resume" : "pause";
    setJobActionPatch(job.jobID, { busy: true, error: "" });
    try {
      const res = await updateJobCallable({ jobID: job.jobID, action });
      if (res.data?.job) applyJob(res.data.job);
    } catch (err) {
      setJobActionPatch(job.jobID, {
        error: formatErr(err, `${action} failed.`),
      });
    } finally {
      setJobActionPatch(job.jobID, { busy: false });
    }
  };

  const startEditCadence = (job) => {
    setEditingJobID(job.jobID);
    setEditScheduleInput(job.schedule || "");
    setJobActionPatch(job.jobID, { error: "" });
  };

  const cancelEditCadence = () => {
    setEditingJobID(null);
    setEditScheduleInput("");
  };

  const handleSaveCadence = async (job) => {
    const schedule = editScheduleInput.trim();
    if (!schedule) {
      setJobActionPatch(job.jobID, { error: "Cron expression required." });
      return;
    }
    setJobActionPatch(job.jobID, { busy: true, error: "" });
    try {
      const res = await updateJobCallable({
        jobID: job.jobID,
        action: "updateSchedule",
        schedule,
      });
      if (res.data?.job) applyJob(res.data.job);
      setEditingJobID(null);
      setEditScheduleInput("");
    } catch (err) {
      setJobActionPatch(job.jobID, { error: formatErr(err, "Save failed.") });
    } finally {
      setJobActionPatch(job.jobID, { busy: false });
    }
  };

  const useRecommended = (job) => {
    const rec = job.vendorMeta?.recommendedCadence;
    if (rec) setEditScheduleInput(rec);
  };

  const groups = useMemo(() => groupJobs(jobs), [jobs]);

  return (
    <div className="pageScreen">
      <div className="card cardList">
        <div className="listHeader">
          <div>
            <Link to="/admin" className="linkButton">
              ← Back to admin
            </Link>
            <h1 className="cardTitle">Scheduled jobs</h1>
            <p className="cardSubtitle">
              Cloud Scheduler jobs in this project, mirrored every 10 minutes
              from GCP. Pause, resume, or change cadence on platform-owned
              jobs; Firebase-deploy-owned jobs are read-only here — edit them
              in source and redeploy.
            </p>
          </div>
          <div className="buttonRow">
            <button
              type="button"
              className="secondaryButton"
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing ? "Syncing…" : "Force sync"}
            </button>
          </div>
        </div>

        {syncMessage && <div className="helperText">{syncMessage}</div>}
        {loadError && <div className="errorText">{loadError}</div>}
        {loading && !jobs.length && (
          <div className="placeholderText">Loading…</div>
        )}
        {!loading && !jobs.length && !loadError && (
          <div className="emptyState">
            No jobs in the mirror yet. Try "Force sync" to pull from GCP.
          </div>
        )}

        {groups.map((group) => (
          <div key={group.vendor} className="formBlock">
            <div className="sectionHeading">{group.displayName}</div>
            {group.jobs.map((job) => (
              <JobCard
                key={job.jobID}
                job={job}
                actionState={actionState[job.jobID] || {}}
                editing={editingJobID === job.jobID}
                editScheduleInput={editScheduleInput}
                setEditScheduleInput={setEditScheduleInput}
                onPauseResume={() => handlePauseResume(job)}
                onStartEdit={() => startEditCadence(job)}
                onCancelEdit={cancelEditCadence}
                onSaveEdit={() => handleSaveCadence(job)}
                onUseRecommended={() => useRecommended(job)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function JobCard({
  job,
  actionState,
  editing,
  editScheduleInput,
  setEditScheduleInput,
  onPauseResume,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onUseRecommended,
}) {
  const vm = job.vendorMeta;
  const displayName = vm?.displayName || job.jobID;
  const stateText = job.state || "UNKNOWN";
  const tone = stateBadgeTone(stateText);
  const cadenceDiffers =
    vm?.recommendedCadence &&
    job.schedule &&
    vm.recommendedCadence !== job.schedule;

  return (
    <div className="scheduledJobCard">
      <div className="scheduledJobHeader">
        <div>
          <div className="scheduledJobTitle">{displayName}</div>
          <div className="helperText">
            <code>{job.jobID}</code>
            {!job.mutable && <> · owned by Firebase Functions deploy</>}
          </div>
        </div>
        <div className={`badge badge-${tone}`}>{stateText}</div>
      </div>

      {vm?.description && <p className="helperText">{vm.description}</p>}

      {!editing && (
        <div className="helperText">
          Schedule: <code>{job.schedule || "—"}</code>
          {job.timeZone ? (
            <>
              {" "}
              · TZ: <code>{job.timeZone}</code>
            </>
          ) : null}
          {cadenceDiffers && (
            <>
              {" "}
              · recommended: <code>{vm.recommendedCadence}</code>
            </>
          )}
        </div>
      )}

      {editing && (
        <div>
          <div className="fieldLabel">Cron schedule</div>
          <input
            className="textInput"
            type="text"
            value={editScheduleInput}
            onChange={(e) => setEditScheduleInput(e.target.value)}
            disabled={actionState.busy}
            placeholder={vm?.recommendedCadence || "0 5 * * *"}
          />
          <div className="helperText">
            Timezone stays at <code>{job.timeZone || "—"}</code>.
            {vm?.recommendedCadence && (
              <>
                {" "}
                <button
                  type="button"
                  className="linkButton"
                  onClick={onUseRecommended}
                  disabled={actionState.busy}
                >
                  Use recommended ({vm.recommendedCadence})
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="helperText">
        Last run: {formatTime(job.lastAttemptTime)} · Updated:{" "}
        {formatTime(job.userUpdateTime)}
      </div>

      {vm?.tooltip && (
        <p className="helperText">
          <em>{vm.tooltip}</em>
        </p>
      )}

      {actionState.error && (
        <div className="errorText">{actionState.error}</div>
      )}

      <div className="buttonRow">
        {job.mutable && !editing && (
          <>
            <button
              type="button"
              className="secondaryButton"
              onClick={onPauseResume}
              disabled={actionState.busy}
            >
              {actionState.busy
                ? "…"
                : job.state === "PAUSED"
                ? "Resume"
                : "Pause"}
            </button>
            <button
              type="button"
              className="secondaryButton"
              onClick={onStartEdit}
              disabled={actionState.busy}
            >
              Edit cadence
            </button>
          </>
        )}
        {job.mutable && editing && (
          <>
            <button
              type="button"
              className="primaryButton"
              onClick={onSaveEdit}
              disabled={actionState.busy}
            >
              {actionState.busy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="secondaryButton"
              onClick={onCancelEdit}
              disabled={actionState.busy}
            >
              Cancel
            </button>
          </>
        )}
        {!job.mutable && (
          <span className="placeholderText">
            Edit in source and redeploy.
          </span>
        )}
      </div>
    </div>
  );
}
