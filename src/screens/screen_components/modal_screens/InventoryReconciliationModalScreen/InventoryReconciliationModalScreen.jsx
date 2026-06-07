/**
 * InventoryReconciliationModalScreen
 *
 * Maps existing local inventory items (which often lack vendorId/cost/msrp)
 * onto vendor-catalog records by UPC. For each unmapped local item the
 * engine probes every queryable vendor catalog with primaryBarcode +
 * barcodes[]; single-vendor matches are auto-applied, multi-vendor
 * cross-matches are surfaced for the user to pick which vendor owns the
 * item for future ordering.
 *
 * No manual name/brand search yet — items with no UPC match get listed
 * but left alone.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  LargeModalHeader,
  LargeModalHeaderButton,
} from "../../../../dom_components";
import { C, ICONS } from "../../../../styles";
import { useInventoryStore } from "../../../../stores";
import {
  dbProbeInventoryAgainstCatalogs,
  buildReconciliationUpdate,
  dbSaveInventoryItem,
  dbSampleVendorCatalog,
} from "../../../../db_calls_wrapper";
import styles from "./InventoryReconciliationModalScreen.module.css";

const CONCURRENCY = 6;

const TABS = {
  REVIEW: "review",
  APPLIED: "applied",
  NO_MATCH: "noMatch",
  SKIPPED: "skipped",
};

function getItemCodes(item) {
  if (!item) return [];
  const out = [];
  if (typeof item.primaryBarcode === "string" && item.primaryBarcode.trim()) {
    out.push(item.primaryBarcode.trim());
  }
  if (Array.isArray(item.barcodes)) {
    item.barcodes.forEach((b) => {
      if (typeof b === "string" && b.trim()) out.push(b.trim());
    });
  }
  return out;
}

export const InventoryReconciliationModalScreen = ({ handleExit }) => {
  const zInventoryArr = useInventoryStore((s) => s.getInventoryArr?.()) || [];

  // Snapshot inventory once the modal mounts so the scan operates on a
  // stable list. Auto-applied items keep their place in the snapshot;
  // their post-write store update doesn't disturb counts mid-run.
  const snapshotRef = useRef(null);
  if (snapshotRef.current === null) {
    snapshotRef.current = zInventoryArr.slice();
  }
  const snapshot = snapshotRef.current;

  const [sPhase, _setPhase] = useState("idle"); // "idle" | "scanning" | "done"
  const [sScanned, _setScanned] = useState(0);
  const [sTab, _setTab] = useState(TABS.REVIEW);

  const [sReview, _setReview] = useState([]); // [{ localItem, candidates }]
  const [sApplied, _setApplied] = useState([]); // [{ localItem, candidate }]
  const [sNoMatch, _setNoMatch] = useState([]); // [localItem]
  const [sSampling, _setSampling] = useState(false);
  const [sSamplingQbp, _setSamplingQbp] = useState(false);

  const cancelRef = useRef(false);

  // No vendorId skip: re-probe every item with codes so the run pulls fresh
  // catalog data (cost/msrp/name) onto items that were already mapped from
  // a previous reconciliation. Items with no barcodes still can't be probed.
  const { eligibleItems, skipped } = useMemo(() => {
    const eligible = [];
    let skip = 0;
    for (const item of snapshot) {
      if (!item) continue;
      if (getItemCodes(item).length === 0) {
        skip++;
        continue;
      }
      eligible.push(item);
    }
    return { eligibleItems: eligible, skipped: skip };
  }, [snapshot]);

  useEffect(() => {
    return () => {
      cancelRef.current = true;
    };
  }, []);

  async function applyCandidate(localItem, candidate, alternates = []) {
    const payload = buildReconciliationUpdate(localItem, candidate, alternates);
    const merged = { ...localItem, ...payload };
    try {
      await dbSaveInventoryItem(merged, merged.id);
      return merged;
    } catch (e) {
      // Surface the error but don't block the flow.
      console.error("Reconciliation write failed", e);
      return null;
    }
  }

  async function runScan() {
    if (sPhase === "scanning") return;
    cancelRef.current = false;
    _setPhase("scanning");
    _setScanned(0);
    _setReview([]);
    _setApplied([]);
    _setNoMatch([]);
    _setTab(TABS.REVIEW);

    const queue = eligibleItems.slice();
    let processed = 0;

    async function worker() {
      while (!cancelRef.current) {
        const localItem = queue.shift();
        if (!localItem) return;
        try {
          const result = await dbProbeInventoryAgainstCatalogs(localItem);
          if (cancelRef.current) return;
          if (result.status === "matched") {
            const candidate = result.candidates[0];
            const merged = await applyCandidate(localItem, candidate);
            if (merged && !cancelRef.current) {
              _setApplied((prev) => [...prev, { localItem: merged, candidate }]);
            }
          } else if (result.status === "ambiguous") {
            _setReview((prev) => [
              ...prev,
              { localItem, candidates: result.candidates },
            ]);
          } else {
            _setNoMatch((prev) => [...prev, localItem]);
          }
        } catch (e) {
          console.error("Reconciliation probe error", e);
          if (!cancelRef.current) {
            _setNoMatch((prev) => [...prev, localItem]);
          }
        } finally {
          processed += 1;
          if (!cancelRef.current) _setScanned(processed);
        }
      }
    }

    const workers = Array.from(
      { length: Math.min(CONCURRENCY, queue.length || 1) },
      () => worker(),
    );
    await Promise.all(workers);
    if (!cancelRef.current) _setPhase("done");
  }

  function cancelScan() {
    cancelRef.current = true;
    _setPhase("done");
  }

  // Read-only diagnostic: probes the first 10 eligible items and prints local
  // inventory ↔ matched catalog doc side by side to the console. No writes,
  // does not touch the review/applied/no-match lists. Use to confirm what the
  // vendor catalog payload actually contains (cost/msrp/name field shapes).
  async function runSample() {
    if (sSampling || sPhase === "scanning") return;
    _setSampling(true);
    try {
      const sample = eligibleItems.slice(0, 10);
      console.log(
        `[reconcile][sample] probing ${sample.length} of ${eligibleItems.length} eligible items (read-only)`,
      );
      for (const localItem of sample) {
        try {
          const result = await dbProbeInventoryAgainstCatalogs(localItem);
          const candidate = result?.candidates?.[0] || null;
          console.log(
            "[reconcile][sample]",
            JSON.stringify(
              {
                local: {
                  id: localItem.id,
                  catalogName: localItem.catalogName,
                  formalName: localItem.formalName,
                  vendorId: localItem.vendorId,
                  vendorPartId: localItem.vendorPartId,
                  vendorName: localItem.vendorName,
                  cost: localItem.cost,
                  msrp: localItem.msrp,
                  primaryBarcode: localItem.primaryBarcode,
                  barcodes: localItem.barcodes,
                  alternateVendors: localItem.alternateVendors,
                },
                probeStatus: result?.status,
                candidateCount: result?.candidates?.length || 0,
                catalogMatch: candidate
                  ? {
                      vendorID: candidate.vendorID,
                      vendorName: candidate.vendorName,
                      itemId: candidate.itemId,
                      catalogItemKeys: Object.keys(candidate.catalogItem || {}),
                      catalogItem: candidate.catalogItem,
                    }
                  : null,
              },
              null,
              2,
            ),
          );
        } catch (err) {
          console.error("[reconcile][sample] probe failed", localItem?.id, err);
        }
      }
    } finally {
      _setSampling(false);
    }
  }

  // Read-only diagnostic: pulls 3 items + specs straight from the QBP vendor
  // catalog (no UPC probe, no local-item involvement). Used to inspect catalog
  // field shape before we map it for reconciliation/ordering. Each click picks
  // a random lexicographic slice so repeat clicks yield different items.
  async function runQbpSample() {
    if (sSamplingQbp) return;
    _setSamplingQbp(true);
    try {
      const sample = await dbSampleVendorCatalog("qbp", 3);
      console.log(`[reconcile][qbp-sample] pulled ${sample.length} items from QBP catalog`);
      for (const entry of sample) {
        console.log(
          "[reconcile][qbp-sample]",
          JSON.stringify(
            {
              itemId: entry.itemId,
              itemKeys: Object.keys(entry.item || {}),
              item: entry.item,
            },
            null,
            2,
          ),
        );
      }
    } catch (err) {
      console.error("[reconcile][qbp-sample] failed", err);
    } finally {
      _setSamplingQbp(false);
    }
  }

  async function handlePickCandidate(reviewEntry, candidate) {
    // Picked vendor wins; the remaining candidates from OTHER vendors get
    // serialized into alternateVendors[] so the item carries a cross-UPC
    // stock pointer even without a future reconciliation pass.
    const alternates = reviewEntry.candidates.filter(
      (c) => c.vendorID !== candidate.vendorID,
    );
    const merged = await applyCandidate(reviewEntry.localItem, candidate, alternates);
    if (!merged) return;
    _setReview((prev) =>
      prev.filter((r) => r.localItem.id !== reviewEntry.localItem.id),
    );
    _setApplied((prev) => [...prev, { localItem: merged, candidate }]);
  }

  const total = eligibleItems.length;
  const progressPct = total === 0 ? 0 : Math.round((sScanned / total) * 100);

  return (
    <Dialog visible={true} onClose={handleExit} overlayColor={C.surfaceOverlay}>
      <div className={styles.card}>
        <LargeModalHeader
          title={
            <div className={styles.headerLeft}>
              <span className={styles.title}>Inventory Reconciliation</span>
              <span className={styles.subtitle}>
                {sPhase === "idle"
                  ? `${snapshot.length} items`
                  : `${snapshot.length} items total · ${total} eligible · ${skipped} skipped`}
              </span>
            </div>
          }
          actions={[
            sPhase === "scanning" ? (
              <LargeModalHeaderButton
                key="cancel"
                variant="danger"
                icon={ICONS.redx}
                onClick={cancelScan}
              >
                CANCEL
              </LargeModalHeaderButton>
            ) : (
              <LargeModalHeaderButton
                key="go"
                variant="accent"
                icon={ICONS.forwardGreen}
                onClick={runScan}
                disabled={total === 0}
                tooltip={
                  total === 0
                    ? "No items have barcodes to probe"
                    : undefined
                }
              >
                GO
              </LargeModalHeaderButton>
            ),
            <LargeModalHeaderButton
              key="sample"
              variant="default"
              onClick={runSample}
              disabled={total === 0 || sSampling || sPhase === "scanning"}
              tooltip="Read-only: probe first 10 items and log catalog match to console"
            >
              {sSampling ? "TESTING…" : "TEST 10"}
            </LargeModalHeaderButton>,
            <LargeModalHeaderButton
              key="qbpSample"
              variant="default"
              onClick={runQbpSample}
              disabled={sSamplingQbp || sPhase === "scanning"}
              tooltip="Read-only: pull 3 random items + specs from the QBP catalog to console"
            >
              {sSamplingQbp ? "TESTING…" : "TEST QBP"}
            </LargeModalHeaderButton>,
            <LargeModalHeaderButton
              key="close"
              variant="default"
              icon={ICONS.close1}
              onClick={handleExit}
            >
              CLOSE
            </LargeModalHeaderButton>,
          ]}
        />

        <div className={styles.body}>
          {sPhase !== "idle" && (
            <div className={styles.statusBar}>
              <span className={styles.statusLabel}>
                {sPhase === "scanning"
                  ? `Scanning ${sScanned} of ${total}…`
                  : `Done · ${sScanned} of ${total} processed`}
              </span>
              <div className={styles.progressTrack}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          <div className={styles.statsRow}>
            <StatChip
              label="Needs review"
              value={sReview.length}
              variant="review"
              active={sTab === TABS.REVIEW}
              onClick={() => _setTab(TABS.REVIEW)}
            />
            <StatChip
              label="Auto-applied"
              value={sApplied.length}
              active={sTab === TABS.APPLIED}
              onClick={() => _setTab(TABS.APPLIED)}
            />
            <StatChip
              label="No match"
              value={sNoMatch.length}
              variant="noMatch"
              active={sTab === TABS.NO_MATCH}
              onClick={() => _setTab(TABS.NO_MATCH)}
            />
            <StatChip
              label="No barcodes"
              value={skipped}
              active={sTab === TABS.SKIPPED}
              onClick={() => _setTab(TABS.SKIPPED)}
            />
          </div>

          <div className={styles.listWrap}>
            {sTab === TABS.REVIEW && (
              <ReviewList
                rows={sReview}
                onPick={handlePickCandidate}
                phase={sPhase}
              />
            )}
            {sTab === TABS.APPLIED && (
              <AppliedList rows={sApplied} phase={sPhase} />
            )}
            {sTab === TABS.NO_MATCH && (
              <NoMatchList rows={sNoMatch} phase={sPhase} />
            )}
            {sTab === TABS.SKIPPED && (
              <SkippedList snapshot={snapshot} />
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
};

function StatChip({ label, value, variant, active, onClick }) {
  const variantClass =
    variant === "review"
      ? styles.statChipReview
      : variant === "noMatch"
        ? styles.statChipNoMatch
        : "";
  return (
    <button
      type="button"
      className={`${styles.statChip} ${variantClass} ${active ? styles.statChipActive : ""}`}
      onClick={onClick}
    >
      <span className={styles.statChipLabel}>{label}</span>
      <span className={styles.statChipValue}>{value}</span>
    </button>
  );
}

// Canonical catalog reads (post 2026-06): vendor-catalog-*/modes/master.js
// writes {vendorId, vendorPartId, catalogName, brand, cost (cents),
// msrp (cents), primaryBarcode, barcodes, image_url, category}.
// Legacy fallback to `name` for any not-yet-reingested docs.
function pickName(catalogItem) {
  return String(catalogItem?.catalogName || catalogItem?.name || "");
}

function pickBrand(catalogItem) {
  return String(catalogItem?.brand || "");
}

function pickCost(catalogItem) {
  const cents = catalogItem?.cost;
  return Number.isFinite(cents) && cents > 0 ? (cents / 100).toFixed(2) : "";
}

function pickMsrp(catalogItem) {
  const cents = catalogItem?.msrp;
  return Number.isFinite(cents) && cents > 0 ? (cents / 100).toFixed(2) : "";
}

function ReviewList({ rows, onPick, phase }) {
  if (rows.length === 0) {
    return (
      <div className={styles.emptyState}>
        {phase === "idle"
          ? "Reconcile your inventory to update vendor catalog changes."
          : "No cross-matched items."}
      </div>
    );
  }
  return rows.map((entry) => (
    <ReviewCard key={entry.localItem.id} entry={entry} onPick={onPick} />
  ));
}

function ReviewCard({ entry, onPick }) {
  const [sBusy, _setBusy] = useState(false);
  const local = entry.localItem;
  const localName = local.catalogName || local.formalName || "(unnamed item)";
  const codes = getItemCodes(local);
  return (
    <div className={styles.reviewCard}>
      <div className={styles.reviewHeader}>
        <span className={styles.reviewItemName}>{localName}</span>
        <span className={styles.reviewItemMeta}>
          {codes.length === 1
            ? codes[0]
            : `${codes[0]} · +${codes.length - 1} alt`}
        </span>
      </div>
      <div className={styles.candidateGrid}>
        {entry.candidates.map((c, i) => {
          const name = pickName(c.catalogItem);
          const brand = pickBrand(c.catalogItem);
          const cost = pickCost(c.catalogItem);
          const msrp = pickMsrp(c.catalogItem);
          const meta = [
            brand,
            cost ? `cost ${cost}` : null,
            msrp ? `msrp ${msrp}` : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <div key={`${c.vendorID}-${c.itemId}-${i}`} className={styles.candidateRow}>
              <div className={styles.candidateMain}>
                <span className={styles.candidateVendor}>{c.vendorName}</span>
                <span className={styles.candidateName}>
                  {name || "(no catalog name)"}
                </span>
                {meta && <span className={styles.candidateMeta}>{meta}</span>}
              </div>
              <button
                type="button"
                className={styles.pickBtn}
                disabled={sBusy}
                onClick={async () => {
                  _setBusy(true);
                  try {
                    await onPick(entry, c);
                  } finally {
                    _setBusy(false);
                  }
                }}
              >
                Pick
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AppliedList({ rows, phase }) {
  if (rows.length === 0) {
    return (
      <div className={styles.emptyState}>
        {phase === "idle"
          ? "Reconcile your inventory to update vendor catalog changes."
          : "Nothing auto-applied yet."}
      </div>
    );
  }
  return rows.map(({ localItem, candidate }) => {
    const catalogName = pickName(candidate.catalogItem);
    return (
      <div key={localItem.id} className={styles.summaryRow}>
        <span className={styles.summaryItemName}>
          {localItem.catalogName || localItem.formalName || "(unnamed item)"}
        </span>
        <span className={styles.summaryItemMeta}>
          → {candidate.vendorName}
          {catalogName ? ` · ${catalogName}` : ""}
        </span>
        <span className={styles.summaryBadgeApplied}>Applied</span>
      </div>
    );
  });
}

function NoMatchList({ rows, phase }) {
  if (rows.length === 0) {
    return (
      <div className={styles.emptyState}>
        {phase === "idle"
          ? "Reconcile your inventory to update vendor catalog changes."
          : "Every eligible item matched at least one vendor."}
      </div>
    );
  }
  return rows.map((item) => {
    const codes = getItemCodes(item);
    return (
      <div key={item.id} className={styles.summaryRow}>
        <span className={styles.summaryItemName}>
          {item.catalogName || item.formalName || "(unnamed item)"}
        </span>
        <span className={styles.summaryItemMeta}>
          {codes.length === 0
            ? "no barcodes"
            : codes.length === 1
              ? codes[0]
              : `${codes[0]} · +${codes.length - 1} alt`}
        </span>
        <span className={styles.summaryBadgeNoMatch}>No match</span>
      </div>
    );
  });
}

function SkippedList({ snapshot }) {
  const skippedItems = useMemo(() => {
    return snapshot.filter((it) => {
      if (!it) return false;
      return getItemCodes(it).length === 0;
    });
  }, [snapshot]);

  if (skippedItems.length === 0) {
    return (
      <div className={styles.emptyState}>
        Every item has at least one barcode.
      </div>
    );
  }
  return skippedItems.map((item) => (
    <div key={item.id} className={styles.summaryRow}>
      <span className={styles.summaryItemName}>
        {item.catalogName || item.formalName || "(unnamed item)"}
      </span>
      <span className={styles.summaryItemMeta}>no barcodes</span>
      <span className={styles.summaryBadgeSkipped}>Skipped</span>
    </div>
  ));
}
