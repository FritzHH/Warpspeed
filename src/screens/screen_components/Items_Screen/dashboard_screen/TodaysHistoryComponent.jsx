/*eslint-disable*/
import React, { useEffect, useState, useCallback, lazy, Suspense } from "react";
import { Dialog } from "../../../../dom_components";
import { C } from "../../../../styles";
import { formatCurrencyDisp, calculateRunningTotals, formatPhoneWithDashes } from "../../../../utils";
import { useSettingsStore } from "../../../../stores";
import {
  dbListCompletedSalesSince,
  dbListCompletedWorkordersSince,
  dbListDeletedWorkorders,
  dbRehydrateWorkorder,
} from "../../../../db_calls_wrapper";
import { queryTransactionsByDateRange } from "../../modal_screens/newCheckoutModalScreen/newCheckoutFirebaseCalls";
import styles from "./TodaysHistoryComponent.module.css";

const FullSaleModal = lazy(() =>
  import("../../../../dom_components/FullSaleModal/FullSaleModal").then((m) => ({ default: m.FullSaleModal }))
);
const ClosedWorkorderModal = lazy(() =>
  import("../../modal_screens/ClosedWorkorderModal").then((m) => ({ default: m.ClosedWorkorderModal }))
);

const TZ = "America/New_York";

function startOfTodayEasternMillis() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  const y = parseInt(get("year"), 10);
  const mo = parseInt(get("month"), 10);
  const d = parseInt(get("day"), 10);
  let h = parseInt(get("hour"), 10);
  if (h === 24) h = 0;
  const mi = parseInt(get("minute"), 10);
  const s = parseInt(get("second"), 10);
  const easternNowAsUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  const offsetMs = easternNowAsUtc - now.getTime();
  const midnightEasternAsUtc = Date.UTC(y, mo - 1, d, 0, 0, 0);
  return midnightEasternAsUtc - offsetMs;
}

function formatEasternTime(millis) {
  if (!millis) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(millis));
}

function findCloserFromChangeLog(changeLog) {
  if (!Array.isArray(changeLog) || changeLog.length === 0) return "";
  for (let i = changeLog.length - 1; i >= 0; i--) {
    const entry = changeLog[i];
    if (!entry || typeof entry !== "object") continue;
    const to = String(entry.to || "").toLowerCase();
    const field = String(entry.field || "").toLowerCase();
    if (field === "status" && (to.includes("done") || to.includes("paid"))) {
      return entry.user || "";
    }
  }
  for (let i = changeLog.length - 1; i >= 0; i--) {
    const entry = changeLog[i];
    if (entry && typeof entry === "object" && entry.user) return entry.user;
  }
  return "";
}

function getWorkorderTotals(workorder, salesTaxPercent) {
  if (!workorder) return { itemCount: 0, finalTotal: 0 };
  const totals = calculateRunningTotals(workorder, salesTaxPercent || 0, [], false, !!workorder.taxFree);
  return { itemCount: totals.runningQty || 0, finalTotal: totals.finalTotal || 0 };
}

function formatStatus(status) {
  if (typeof status !== "string" || !status) return "—";
  return status.split(/[_\s]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

function capitalizeName(s) {
  if (typeof s !== "string" || !s) return "";
  return s.split(/\s+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

function getWorkorderCustomerName(wo) {
  const first = capitalizeName(wo?.customerFirst || "");
  const last = capitalizeName(wo?.customerLast || "");
  return `${first} ${last}`.trim();
}

function getWorkorderPhone(wo) {
  const cell = wo?.customerCell || "";
  if (cell) return formatPhoneWithDashes(cell);
  const landline = wo?.customerLandline || "";
  if (landline) return formatPhoneWithDashes(landline);
  return "";
}

function formatPaymentMethod(transactionIDs, txnsById) {
  if (!Array.isArray(transactionIDs) || transactionIDs.length === 0) return "—";
  const methods = new Set();
  for (const id of transactionIDs) {
    const txn = txnsById?.[id];
    const m = (txn?.method || "").toLowerCase();
    if (m) methods.add(m);
  }
  if (methods.size === 0) return "—";
  if (methods.size === 1) {
    const only = [...methods][0];
    return only.charAt(0).toUpperCase() + only.slice(1);
  }
  return [...methods].map((m) => m.charAt(0).toUpperCase() + m.slice(1)).join(" + ");
}

export const TodaysHistoryComponent = () => {
  const zSalesTaxPercent = useSettingsStore((state) => state.settings?.salesTaxPercent) || 0;
  const [sEvents, _setEvents] = useState([]);
  const [sFilter, _setFilter] = useState("all");
  const [sTxnsById, _setTxnsById] = useState({});
  const [sSalesById, _setSalesById] = useState({});
  const [sWosById, _setWosById] = useState({});
  const [sLoading, _setLoading] = useState(true);
  const [sSaleModalItem, _setSaleModalItem] = useState(null);
  const [sWorkorderModalItem, _setWorkorderModalItem] = useState(null);
  const [sRestoreCandidate, _setRestoreCandidate] = useState(null);
  const [sRestoring, _setRestoring] = useState(false);

  const loadData = useCallback(async () => {
    _setLoading(true);
    const since = startOfTodayEasternMillis();
    try {
      const [salesRes, wosRes, deletedRes, txns] = await Promise.all([
        dbListCompletedSalesSince(since),
        dbListCompletedWorkordersSince(since),
        dbListDeletedWorkorders(since),
        queryTransactionsByDateRange(since, Date.now()),
      ]);

      const txnsById = {};
      for (const t of txns || []) { if (t?.id) txnsById[t.id] = t; }
      const salesById = {};
      for (const s of salesRes?.sales || []) { if (s?.id) salesById[s.id] = s; }
      const wosById = {};
      for (const w of wosRes?.workorders || []) { if (w?.id) wosById[w.id] = w; }

      // Only standalone sales (no customerID) — sales tied to a customer
      // already surface via their corresponding completed-workorder card.
      const saleEvents = (salesRes?.sales || [])
        .filter((sale) => !sale.customerID)
        .map((sale) => ({
          type: "sale",
          millis: sale.millis || 0,
          data: sale,
        }));
      // Skip standalone workorders (no customerID) — their Sale Completed card
      // already represents the transaction.
      const woEvents = (wosRes?.workorders || [])
        .filter((wo) => !!wo.customerID)
        .map((wo) => ({
          type: "completed",
          millis: wo.endedOnMillis || wo.paidOnMillis || 0,
          data: wo,
        }));
      const deletedEvents = (deletedRes?.workorders || []).map((wo) => ({
        type: "deleted",
        millis: wo._deletedAt || 0,
        data: wo,
      }));

      const all = [...saleEvents, ...woEvents, ...deletedEvents]
        .sort((a, b) => b.millis - a.millis);
      _setEvents(all);
      _setTxnsById(txnsById);
      _setSalesById(salesById);
      _setWosById(wosById);
    } catch (err) {
      console.error("TodaysHistoryComponent: load failed", err);
      _setEvents([]);
      _setTxnsById({});
      _setSalesById({});
      _setWosById({});
    }
    _setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleRestoreConfirm() {
    if (!sRestoreCandidate?.id) return;
    _setRestoring(true);
    const result = await dbRehydrateWorkorder(sRestoreCandidate.id);
    _setRestoring(false);
    if (result?.success) {
      _setEvents((prev) => prev.filter((e) => !(e.type === "deleted" && e.data.id === sRestoreCandidate.id)));
      _setRestoreCandidate(null);
    } else {
      alert(result?.message || "Failed to restore workorder.");
    }
  }

  const FILTERS = [
    { id: "all", label: "All" },
    { id: "sale", label: "Sales" },
    { id: "completed", label: "Workorders" },
    { id: "deleted", label: "Deleted Workorders" },
  ];
  const filteredEvents = sFilter === "all" ? sEvents : sEvents.filter((e) => e.type === sFilter);

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <div className={styles.chipRow}>
          {FILTERS.map((f) => (
            <div
              key={f.id}
              className={`${styles.chip} ${sFilter === f.id ? styles.chipActive : ""}`}
              onClick={() => _setFilter(f.id)}
            >
              {f.label}
            </div>
          ))}
        </div>
        <div className={styles.toolbarSpacer} />
        <div className={styles.refreshBtn} onClick={loadData}>Refresh</div>
      </div>

      <div className={styles.list}>
        {sLoading ? (
          <div className={styles.loadingState}>Loading…</div>
        ) : filteredEvents.length === 0 ? (
          <div className={styles.emptyState}>No events today yet.</div>
        ) : (
          filteredEvents.map((event, idx) => (
            <EventCard
              key={event.type + "-" + (event.data.id || idx)}
              event={event}
              salesTaxPercent={zSalesTaxPercent}
              txnsById={sTxnsById}
              salesById={sSalesById}
              wosById={sWosById}
              onOpenSale={() => _setSaleModalItem({ saleID: event.data.id, source: "completed" })}
              onOpenWorkorder={() => _setWorkorderModalItem(event.data)}
              onRestore={() => _setRestoreCandidate(event.data)}
            />
          ))
        )}
      </div>

      {sSaleModalItem && (
        <Suspense fallback={null}>
          <FullSaleModal
            item={sSaleModalItem}
            onClose={() => _setSaleModalItem(null)}
            onRefund={() => _setSaleModalItem(null)}
          />
        </Suspense>
      )}

      {sWorkorderModalItem && (
        <Suspense fallback={null}>
          <ClosedWorkorderModal
            workorder={sWorkorderModalItem}
            onClose={() => _setWorkorderModalItem(null)}
          />
        </Suspense>
      )}

      {sRestoreCandidate && (
        <RestoreConfirmModal
          workorder={sRestoreCandidate}
          salesTaxPercent={zSalesTaxPercent}
          restoring={sRestoring}
          onCancel={() => _setRestoreCandidate(null)}
          onConfirm={handleRestoreConfirm}
        />
      )}
    </div>
  );
};

const EventCard = ({ event, salesTaxPercent, txnsById, salesById, wosById, onOpenSale, onOpenWorkorder, onRestore }) => {
  if (event.type === "sale") {
    const sale = event.data;
    const backingWo = wosById?.[sale.workorderIDs?.[0]] || null;
    const totals = getWorkorderTotals(backingWo, salesTaxPercent);
    const payment = formatPaymentMethod(sale.transactionIDs, txnsById);
    return (
      <div className={`${styles.eventCard} ${styles.eventCardSale}`}>
        <div className={styles.cardTopRow}>
          <div className={styles.cardTypeLabel}>Sale Completed</div>
          <div className={styles.cardTime}>{formatEasternTime(event.millis)}</div>
          <div className={styles.cardSpacer} />
          <div className={`${styles.cardAction} ${styles.cardActionSale}`} onClick={onOpenSale}>View Sale</div>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.cardRow}>
            <span className={styles.cardLabel}>Sale ID:</span>
            <span className={styles.cardValue}>{sale.id || "—"}</span>
            <span className={styles.cardLabel}>Payment:</span>
            <span className={styles.cardValue}>{payment}</span>
          </div>
          <div className={styles.cardRow}>
            <span className={styles.cardLabel}>Cashier:</span>
            <span className={styles.cardValue}>{sale.createdBy || "—"}</span>
          </div>
          <div className={styles.cardRow}>
            <span className={styles.cardLabel}>Items:</span>
            <span className={styles.cardValue}>{totals.itemCount}</span>
            <span className={styles.cardLabel}>Total:</span>
            <span className={styles.cardTotal}>${formatCurrencyDisp(totals.finalTotal)}</span>
          </div>
        </div>
      </div>
    );
  }

  if (event.type === "completed") {
    const wo = event.data;
    const totals = getWorkorderTotals(wo, salesTaxPercent);
    const closer = findCloserFromChangeLog(wo.changeLog);
    const customerName = getWorkorderCustomerName(wo);
    const phone = getWorkorderPhone(wo);
    const email = wo.customerEmail || "";
    const isStandalone = !wo.customerID;
    const backingSale = salesById?.[wo.saleID || wo.activeSaleID] || null;
    const payment = formatPaymentMethod(backingSale?.transactionIDs, txnsById);
    return (
      <div className={`${styles.eventCard} ${styles.eventCardCompleted}`}>
        <div className={styles.cardTopRow}>
          <div className={styles.cardTypeLabel}>Workorder Completed</div>
          <div className={styles.cardTime}>{formatEasternTime(event.millis)}</div>
          <div className={styles.cardSpacer} />
          <div className={`${styles.cardAction} ${styles.cardActionCompleted}`} onClick={onOpenWorkorder}>View Workorder</div>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.cardRow}>
            <span className={styles.cardLabel}>Workorder ID:</span>
            <span className={styles.cardValue}>{wo.id || "—"}</span>
            <span className={styles.cardLabel}>Payment:</span>
            <span className={styles.cardValue}>{payment}</span>
          </div>
          {isStandalone ? (
            <div className={styles.cardRow}>
              <span className={styles.cardLabel}>Customer:</span>
              <span className={styles.cardValue}>Standalone</span>
            </div>
          ) : (
            <div className={styles.cardRow}>
              <span className={styles.cardLabel}>Customer:</span>
              <span className={styles.cardValue}>{customerName || "—"}</span>
              {phone ? (<>
                <span className={styles.cardLabel}>Phone:</span>
                <span className={styles.cardValue}>{phone}</span>
              </>) : null}
              {email ? (<>
                <span className={styles.cardLabel}>Email:</span>
                <span className={styles.cardValue}>{email}</span>
              </>) : null}
            </div>
          )}
          <div className={styles.cardRow}>
            <span className={styles.cardLabel}>Started by:</span>
            <span className={styles.cardValue}>{wo.startedBy || "—"}</span>
            <span className={styles.cardLabel}>Closed by:</span>
            <span className={styles.cardValue}>{closer || "—"}</span>
          </div>
          <div className={styles.cardRow}>
            <span className={styles.cardLabel}>Items:</span>
            <span className={styles.cardValue}>{totals.itemCount}</span>
            <span className={styles.cardLabel}>Total:</span>
            <span className={styles.cardTotal}>${formatCurrencyDisp(totals.finalTotal)}</span>
          </div>
        </div>
      </div>
    );
  }

  if (event.type === "deleted") {
    const wo = event.data;
    const totals = getWorkorderTotals(wo, salesTaxPercent);
    const customerName = getWorkorderCustomerName(wo);
    const phone = getWorkorderPhone(wo);
    const email = wo.customerEmail || "";
    const isStandalone = !(wo._deletedCustomerID || wo.customerID);
    return (
      <div className={`${styles.eventCard} ${styles.eventCardDeleted}`}>
        <div className={styles.cardTopRow}>
          <div className={styles.cardTypeLabel}>Workorder Deleted</div>
          <div className={styles.cardTime}>{formatEasternTime(event.millis)}</div>
          <div className={styles.cardSpacer} />
          <div className={`${styles.cardAction} ${styles.cardActionDeleted}`} onClick={onRestore}>Restore</div>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.cardRow}>
            <span className={styles.cardLabel}>Workorder ID:</span>
            <span className={styles.cardValue}>{wo.id || "—"}</span>
          </div>
          {isStandalone ? (
            <div className={styles.cardRow}>
              <span className={styles.cardLabel}>Customer:</span>
              <span className={styles.cardValue}>Standalone Sale</span>
            </div>
          ) : (
            <div className={styles.cardRow}>
              <span className={styles.cardLabel}>Customer:</span>
              <span className={styles.cardValue}>{customerName || "—"}</span>
              {phone ? (<>
                <span className={styles.cardLabel}>Phone:</span>
                <span className={styles.cardValue}>{phone}</span>
              </>) : null}
              {email ? (<>
                <span className={styles.cardLabel}>Email:</span>
                <span className={styles.cardValue}>{email}</span>
              </>) : null}
            </div>
          )}
          <div className={styles.cardRow}>
            <span className={styles.cardLabel}>Started by:</span>
            <span className={styles.cardValue}>{wo.startedBy || "—"}</span>
            <span className={styles.cardLabel}>Deleted by:</span>
            <span className={styles.cardValue}>{wo._deletedBy || "—"}</span>
          </div>
          <div className={styles.cardRow}>
            <span className={styles.cardLabel}>Items:</span>
            <span className={styles.cardValue}>{totals.itemCount}</span>
            <span className={styles.cardLabel}>Total:</span>
            <span className={styles.cardTotal}>${formatCurrencyDisp(totals.finalTotal)}</span>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

const RestoreConfirmModal = ({ workorder, salesTaxPercent, restoring, onCancel, onConfirm }) => {
  const lines = workorder?.workorderLines || [];
  const totals = getWorkorderTotals(workorder, salesTaxPercent);
  const customerName = getWorkorderCustomerName(workorder);
  const phone = getWorkorderPhone(workorder);
  const email = workorder?.customerEmail || "";
  const isStandalone = !(workorder?._deletedCustomerID || workorder?.customerID);

  return (
    <Dialog visible={true} onClose={onCancel} title="Restore Workorder">
      <div className={styles.confirmCard}>
        <div className={styles.confirmHeader}>Restore Workorder {workorder.id || ""}?</div>
        <div className={styles.confirmBody}>
          <div className={styles.confirmSection}>
            <div className={styles.confirmSectionTitle}>Details</div>
            {isStandalone ? (
              <div className={styles.cardRow}>
                <span className={styles.cardLabel}>Customer:</span>
                <span className={styles.cardValue}>Standalone Sale</span>
              </div>
            ) : (
              <div className={styles.cardRow}>
                <span className={styles.cardLabel}>Customer:</span>
                <span className={styles.cardValue}>{customerName || "—"}</span>
                {phone ? (<>
                  <span className={styles.cardLabel}>Phone:</span>
                  <span className={styles.cardValue}>{phone}</span>
                </>) : null}
                {email ? (<>
                  <span className={styles.cardLabel}>Email:</span>
                  <span className={styles.cardValue}>{email}</span>
                </>) : null}
              </div>
            )}
            <div className={styles.cardRow}>
              <span className={styles.cardLabel}>Started by:</span>
              <span className={styles.cardValue}>{workorder.startedBy || "—"}</span>
              <span className={styles.cardLabel}>Deleted by:</span>
              <span className={styles.cardValue}>{workorder._deletedBy || "—"}</span>
            </div>
            <div className={styles.cardRow}>
              <span className={styles.cardLabel}>Deleted at:</span>
              <span className={styles.cardValue}>{formatEasternTime(workorder._deletedAt)}</span>
              <span className={styles.cardLabel}>Status was:</span>
              <span className={styles.cardValue}>{formatStatus(workorder.status)}</span>
            </div>
          </div>

          <div className={styles.confirmSection}>
            <div className={styles.confirmSectionTitle}>Items ({totals.itemCount})</div>
            <div className={styles.confirmLineItems}>
              {lines.length === 0 ? (
                <div className={styles.cardLabel}>(empty workorder)</div>
              ) : lines.map((line, idx) => (
                <div key={line.id || idx} className={styles.confirmLineItem}>
                  <span className={styles.confirmLineQty}>{line.qty || 1}×</span>
                  <span className={styles.confirmLineName}>{line.inventoryItem?.formalName || line.inventoryItem?.informalName || "Item"}</span>
                  <span className={styles.confirmLinePrice}>${formatCurrencyDisp(line.inventoryItem?.price || 0)}</span>
                </div>
              ))}
            </div>
            <div className={styles.cardRow}>
              <span className={styles.cardLabel}>Total:</span>
              <span className={styles.cardTotal}>${formatCurrencyDisp(totals.finalTotal)}</span>
            </div>
          </div>

          {(workorder._deletedActiveSaleID || workorder.activeSaleID) && (
            <div className={styles.confirmSection}>
              <div className={styles.confirmSectionTitle}>Note</div>
              <div style={{ color: C.textMuted, fontSize: 12 }}>
                Restore returns the workorder without any payment linkage. Any deposits, credits, or captured payments that were on the original sale will not be re-attached.
              </div>
            </div>
          )}

          {Array.isArray(workorder.customerNotes) && workorder.customerNotes.length > 0 && (
            <div className={styles.confirmSection}>
              <div className={styles.confirmSectionTitle}>Customer Notes</div>
              <div style={{ fontSize: 12, color: C.text, display: "flex", flexDirection: "column", gap: 4 }}>
                {workorder.customerNotes.map((n, i) => (
                  <div key={n.id || i} style={{ whiteSpace: "pre-wrap" }}>
                    {n.name ? <strong>{n.name}: </strong> : null}{n.value || ""}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className={styles.confirmFooter}>
          <div className={styles.confirmBtn} onClick={onCancel}>Cancel</div>
          <div
            className={`${styles.confirmBtn} ${styles.confirmBtnPrimary}`}
            onClick={restoring ? undefined : onConfirm}
            style={{ opacity: restoring ? 0.5 : 1, cursor: restoring ? "wait" : "pointer" }}
          >
            {restoring ? "Restoring…" : "Restore Workorder"}
          </div>
        </div>
      </div>
    </Dialog>
  );
};
