/*eslint-disable*/
/**
 * DLQAdminModalScreen — cross-tenant SaaS dead-letter-queue admin UI.
 *
 * Backs two Firestore collections that share the same lifecycle shape:
 *   - saas-dlq         — Stripe webhook events (pubsub-dead-letter.js)
 *   - saas-twilio-dlq  — Twilio inbound/outbound envelopes (twilio-pubsub-dead-letter.js)
 *
 * Capabilities per row:
 *   - View payload   (raw JSON)
 *   - Update status  (new / acknowledged / resolved / ignored) with optional note
 *   - Retry          (Stripe tab only — Twilio retry deferred to Stage 2)
 *
 * Gating: This screen is only rendered when the signed-in user has the
 *         `platformAdmin` custom claim. The callables also enforce server-side
 *         via assertPlatformAdmin, so the UI gate is purely for visibility.
 */

import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import {
  Dialog,
  LoadingIndicator,
  TextInput,
  LargeModalHeader,
  LargeModalHeaderButton,
} from "../../../../dom_components";
import { C } from "../../../../styles";
import {
  DB,
  FUNCTIONS,
} from "../../../../db_calls";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import styles from "./DLQAdminModalScreen.module.css";

const TABS = [
  { key: "stripe", label: "Stripe DLQ", collection: "saas-dlq" },
  { key: "twilio", label: "Twilio DLQ", collection: "saas-twilio-dlq" },
];

const STATUS_OPTIONS = [
  { key: "all",          label: "All" },
  { key: "new",          label: "New" },
  { key: "acknowledged", label: "Acknowledged" },
  { key: "resolved",     label: "Resolved" },
  { key: "ignored",      label: "Ignored" },
];

const STATUS_COLOR = {
  new:          "#dc2626",
  acknowledged: "#d97706",
  resolved:     "#059669",
  ignored:      "#6b7280",
};

const ROW_LIMIT = 100;

const dlqRetryCallable = httpsCallable(FUNCTIONS, "dlqRetryCallable");
const dlqUpdateStatusCallable = httpsCallable(FUNCTIONS, "dlqUpdateStatusCallable");

function tsToMs(ts) {
  if (!ts) return 0;
  if (typeof ts === "number") return ts;
  if (ts.toMillis) return ts.toMillis();
  if (ts.seconds) return ts.seconds * 1000;
  return 0;
}

function fmtTs(ts) {
  const ms = tsToMs(ts);
  if (!ms) return "—";
  return dayjs(ms).format("MMM D, YYYY h:mm A");
}

export const DLQAdminModalScreen = ({ handleExit }) => {
  const [sActiveTab, _setActiveTab] = useState("stripe");
  const [sStatusFilter, _setStatusFilter] = useState("new");
  const [sRows, _setRows] = useState([]);
  const [sLoading, _setLoading] = useState(true);
  const [sError, _setError] = useState(null);
  const [sExpandedID, _setExpandedID] = useState(null);
  const [sNoteByID, _setNoteByID] = useState({});
  const [sBusyByID, _setBusyByID] = useState({});

  const activeTabDef = useMemo(
    () => TABS.find((t) => t.key === sActiveTab) || TABS[0],
    [sActiveTab]
  );

  // ── Live subscription on tab / filter change ──
  useEffect(() => {
    _setLoading(true);
    _setError(null);
    _setRows([]);

    const colRef = collection(DB, activeTabDef.collection);
    const constraints = [orderBy("firstSeenAt", "desc"), limit(ROW_LIMIT)];
    if (sStatusFilter !== "all") {
      constraints.unshift(where("status", "==", sStatusFilter));
    }
    const q = query(colRef, ...constraints);

    const unsub = onSnapshot(
      q,
      (snap) => {
        const out = [];
        snap.forEach((d) => out.push({ id: d.id, ...d.data() }));
        _setRows(out);
        _setLoading(false);
      },
      (err) => {
        _setError(err?.message || "Failed to load DLQ entries");
        _setLoading(false);
      }
    );
    return () => unsub();
  }, [sActiveTab, sStatusFilter, activeTabDef.collection]);

  async function handleStatusUpdate(row, newStatus) {
    if (sBusyByID[row.id]) return;
    _setBusyByID((m) => ({ ...m, [row.id]: true }));
    try {
      await dlqUpdateStatusCallable({
        dlqDocID: row.id,
        status: newStatus,
        note: sNoteByID[row.id] || null,
        dlqSource: sActiveTab,
      });
      _setNoteByID((m) => ({ ...m, [row.id]: "" }));
    } catch (err) {
      alert("Status update failed: " + (err?.message || "unknown"));
    } finally {
      _setBusyByID((m) => ({ ...m, [row.id]: false }));
    }
  }

  async function handleRetry(row) {
    if (sBusyByID[row.id]) return;
    if (!confirm("Republish this event to stripe-events?")) return;
    _setBusyByID((m) => ({ ...m, [row.id]: true }));
    try {
      await dlqRetryCallable({ dlqDocID: row.id });
    } catch (err) {
      alert("Retry failed: " + (err?.message || "unknown"));
    } finally {
      _setBusyByID((m) => ({ ...m, [row.id]: false }));
    }
  }

  const newCount = useMemo(
    () => sRows.filter((r) => r.status === "new").length,
    [sRows]
  );
  const escalatedCount = useMemo(
    () => sRows.filter((r) => r.escalated === true).length,
    [sRows]
  );

  return (
    <Dialog
      visible={true}
      onClose={handleExit}
      overlayColor={C.surfaceOverlay}
    >
      <div className={styles.card}>
        <LargeModalHeader
          title={
            <div className={styles.headerLeft}>
              <span className={styles.title}>Dead Letter Queue</span>
              <span className={styles.subtitle}>
                {activeTabDef.label} · {sRows.length} loaded
                {newCount > 0 && (
                  <>
                    {"  ·  "}
                    <span style={{ color: STATUS_COLOR.new, fontWeight: 700 }}>
                      {newCount} new
                    </span>
                  </>
                )}
                {escalatedCount > 0 && (
                  <>
                    {"  ·  "}
                    <span style={{ color: "#facc15", fontWeight: 700 }}>
                      {escalatedCount} escalated
                    </span>
                  </>
                )}
              </span>
            </div>
          }
          actions={
            <LargeModalHeaderButton variant="default" onClick={handleExit}>
              CLOSE
            </LargeModalHeaderButton>
          }
        />
        <div className={styles.toolbar}>
          <select
            value={sStatusFilter}
            onChange={(e) => _setStatusFilter(e.target.value)}
            className={styles.filterSelect}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* ── TAB BAR ── */}
        <div className={styles.tabBar} style={{ borderBottomColor: C.borderStrong }}>
          {TABS.map((t) => {
            const active = sActiveTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  _setActiveTab(t.key);
                  _setExpandedID(null);
                }}
                className={styles.tab}
                style={{
                  background: "none",
                  border: "none",
                  borderBottom: active ? "3px solid " + C.orange : "3px solid transparent",
                  color: active ? C.orange : C.textSecondary,
                  fontWeight: active ? 700 : 500,
                  cursor: "pointer",
                  font: "inherit",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* ── BODY ── */}
        <div className={styles.body}>
          {sLoading && (
            <div className={styles.loadingWrap}>
              <LoadingIndicator size="large" color={C.blue} message="Loading DLQ entries..." />
            </div>
          )}
          {!sLoading && sError && (
            <div className={styles.errorWrap}>
              <span style={{ color: C.red, fontSize: 14 }}>{sError}</span>
            </div>
          )}
          {!sLoading && !sError && sRows.length === 0 && (
            <div className={styles.errorWrap}>
              <span style={{ color: C.textMuted, fontSize: 14 }}>
                No entries in {activeTabDef.label}
                {sStatusFilter !== "all" ? ` with status "${sStatusFilter}"` : ""}.
              </span>
            </div>
          )}
          {!sLoading && !sError && sRows.length > 0 && (
            <div className={styles.scroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", width: 28 }}></th>
                    <th style={{ textAlign: "left" }}>Event / Ref</th>
                    <th style={{ textAlign: "left" }}>Status</th>
                    <th style={{ textAlign: "left" }}>Tenant</th>
                    <th style={{ textAlign: "left" }}>Store</th>
                    <th style={{ textAlign: "left" }}>First Seen</th>
                    <th style={{ textAlign: "left" }}>Last Seen</th>
                    <th style={{ textAlign: "right" }}>Retries</th>
                  </tr>
                </thead>
                <tbody>
                  {sRows.map((row) => {
                    const expanded = sExpandedID === row.id;
                    const ref = sActiveTab === "stripe"
                      ? (row.stripeEventID || row.id)
                      : (row.messageSid || row.envelope?.MessageSid || row.id);
                    const eventTypeLabel = sActiveTab === "stripe"
                      ? (row.eventType || "—")
                      : (row.direction || row.envelope?.direction || "—");
                    return (
                      <React.Fragment key={row.id}>
                        <tr
                          className={styles.row}
                          onClick={() => _setExpandedID(expanded ? null : row.id)}
                          style={{ cursor: "pointer" }}
                        >
                          <td>
                            <span style={{ color: C.textMuted }}>{expanded ? "▼" : "▶"}</span>
                          </td>
                          <td>
                            <div className={styles.code}>{ref}</div>
                            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                              {eventTypeLabel}
                            </div>
                          </td>
                          <td>
                            <span
                              className={styles.statusBadge}
                              style={{
                                backgroundColor: STATUS_COLOR[row.status] || "#6b7280",
                              }}
                            >
                              {row.status || "—"}
                            </span>
                            {row.escalated && (
                              <span className={styles.escalatedBadge}>ESCALATED</span>
                            )}
                          </td>
                          <td style={{ fontSize: 12 }}>{row.tenantID || "—"}</td>
                          <td style={{ fontSize: 12 }}>{row.storeID || "—"}</td>
                          <td style={{ fontSize: 12 }}>{fmtTs(row.firstSeenAt)}</td>
                          <td style={{ fontSize: 12 }}>{fmtTs(row.lastSeenAt)}</td>
                          <td style={{ textAlign: "right", fontWeight: 600 }}>
                            {row.retryCount || 0}
                          </td>
                        </tr>
                        {expanded && (
                          <tr>
                            <td colSpan={8} style={{ padding: 0 }}>
                              <div className={styles.expandWrap}>
                                {/* Error info */}
                                {(row.lastError || row.lastErrorMessage) && (
                                  <div className={styles.section}>
                                    <div className={styles.sectionTitle}>Last Error</div>
                                    <pre className={styles.payloadPre}>
                                      {row.lastError || row.lastErrorMessage}
                                    </pre>
                                  </div>
                                )}

                                {/* Audit history */}
                                {Array.isArray(row.audit) && row.audit.length > 0 && (
                                  <div className={styles.section}>
                                    <div className={styles.sectionTitle}>Audit</div>
                                    <table className={styles.subTable}>
                                      <tbody>
                                        {row.audit.slice().reverse().map((a, i) => (
                                          <tr key={i}>
                                            <td style={{ fontSize: 11, color: C.textMuted, whiteSpace: "nowrap" }}>
                                              {a.at ? dayjs(a.at).format("MMM D, h:mm A") : ""}
                                            </td>
                                            <td style={{ fontSize: 12 }}>
                                              <strong>{a.action}</strong>
                                              {a.fromStatus && a.toStatus && (
                                                <> · {a.fromStatus} → {a.toStatus}</>
                                              )}
                                              {a.note && <> · "{a.note}"</>}
                                            </td>
                                            <td style={{ fontSize: 11, color: C.textMuted }}>
                                              {a.uid || ""}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}

                                {/* Payload viewer */}
                                <div className={styles.section}>
                                  <div className={styles.sectionTitle}>Payload</div>
                                  <pre className={styles.payloadPre}>
                                    {JSON.stringify(
                                      sActiveTab === "stripe"
                                        ? (row.eventPayload || row)
                                        : (row.envelope || row),
                                      null,
                                      2
                                    )}
                                  </pre>
                                </div>

                                {/* Action bar */}
                                <div className={styles.actionBar}>
                                  <TextInput
                                    placeholder="Optional note for audit trail"
                                    value={sNoteByID[row.id] || ""}
                                    onChange={(e) =>
                                      _setNoteByID((m) => ({ ...m, [row.id]: e.target.value }))
                                    }
                                    style={{ flex: "1 1 240px", minWidth: 200 }}
                                  />
                                  <button
                                    type="button"
                                    disabled={sBusyByID[row.id] || row.status === "acknowledged"}
                                    onClick={() => handleStatusUpdate(row, "acknowledged")}
                                    className={styles.actionBtn}
                                    style={{ backgroundColor: STATUS_COLOR.acknowledged }}
                                  >
                                    Acknowledge
                                  </button>
                                  <button
                                    type="button"
                                    disabled={sBusyByID[row.id] || row.status === "resolved"}
                                    onClick={() => handleStatusUpdate(row, "resolved")}
                                    className={styles.actionBtn}
                                    style={{ backgroundColor: STATUS_COLOR.resolved }}
                                  >
                                    Resolve
                                  </button>
                                  <button
                                    type="button"
                                    disabled={sBusyByID[row.id] || row.status === "ignored"}
                                    onClick={() => handleStatusUpdate(row, "ignored")}
                                    className={styles.actionBtn}
                                    style={{ backgroundColor: STATUS_COLOR.ignored }}
                                  >
                                    Ignore
                                  </button>
                                  {sActiveTab === "stripe" && (
                                    <button
                                      type="button"
                                      disabled={
                                        sBusyByID[row.id] ||
                                        row.status === "resolved" ||
                                        row.status === "ignored"
                                      }
                                      onClick={() => handleRetry(row)}
                                      className={styles.actionBtn}
                                      style={{ backgroundColor: C.blue }}
                                    >
                                      Retry (republish)
                                    </button>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              {sRows.length === ROW_LIMIT && (
                <div className={styles.limitNote}>
                  Showing {ROW_LIMIT} most recent. Narrow with a status filter to see older entries.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
};
