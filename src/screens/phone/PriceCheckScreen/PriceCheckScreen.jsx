import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import cloneDeep from "lodash/cloneDeep";
import { ROUTES } from "../../../routes";
import {
  useInventoryStore,
  useLoginStore,
  useAlertScreenStore,
} from "../../../stores";
import {
  dbSaveInventoryItem,
  dbLookupCatalogByBarcode,
} from "../../../db_calls_wrapper";
import { permissionToLevel, VENDOR_CATALOGS } from "../../../data";
import { formatCurrencyDisp, usdTypeMask } from "../../../utils";
import { ICONS } from "../../../styles";
import { useZ } from "../../../hooks/useZ";
import { AlertBox, SwipeBackHint } from "../../../dom_components";
import { buildInventoryItemFromCatalog } from "../../../shared/inventoryImport";
import styles from "./PriceCheckScreen.module.css";

const SCAN_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.QR_CODE,
];

const ANY_SCAN_LOCKOUT_MS = 400;
const POST_RECOGNITION_LOCKOUT_MS = 2000;

function lookupByBarcode(items, code) {
  if (!code || !Array.isArray(items)) return null;
  return (
    items.find(
      (it) =>
        it.primaryBarcode === code ||
        (Array.isArray(it.barcodes) && it.barcodes.includes(code)),
    ) || null
  );
}

function vendorDisplayName(vendorId) {
  if (!vendorId) return "—";
  const v = VENDOR_CATALOGS.find((x) => x.id === vendorId);
  return v?.displayName || vendorId;
}

export function PriceCheckScreen() {
  const navigate = useNavigate();
  const zInventory = useInventoryStore((s) => s.inventoryArr);
  const zCurrentUser = useLoginStore((s) => s.currentUser);
  const zShowAlert = useAlertScreenStore((s) => s.showAlert);
  const canEdit = permissionToLevel(zCurrentUser?.permissions) >= 2;

  const readerRef = useRef(null);
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const lastScanMillisRef = useRef(0);
  const recognitionLockoutUntilRef = useRef(0);

  const [sActiveItem, _setActiveItem] = useState(null);
  const [sEditing, _setEditing] = useState(false);
  const [sCameraError, _setCameraError] = useState("");
  const [sCheckingCatalog, _setCheckingCatalog] = useState(false);
  const [sIsImportCandidate, _setIsImportCandidate] = useState(false);

  // Swipe-back state (mirrors OrderingScreen pattern; back to /phone/ordering)
  const [sSwipeX, _setSwipeX] = useState(0);
  const [sSwiping, _setSwiping] = useState(false);
  const swipeStartRef = useRef(null);

  function handleSwipeStart(e) {
    const t = e.touches[0];
    if (t.clientX > 30) return;
    swipeStartRef.current = { x: t.clientX, time: Date.now() };
    _setSwiping(true);
  }
  function handleSwipeMove(e) {
    if (!swipeStartRef.current) return;
    const t = e.touches[0];
    const dx = t.clientX - swipeStartRef.current.x;
    if (dx > 0) _setSwipeX(dx);
  }
  function handleSwipeEnd() {
    if (!swipeStartRef.current) return;
    const elapsed = Date.now() - swipeStartRef.current.time;
    const velocity = sSwipeX / Math.max(elapsed, 1);
    const commitThreshold = window.innerWidth * 0.3;
    const isCommit = sSwipeX > commitThreshold || velocity > 0.5;
    swipeStartRef.current = null;
    _setSwiping(false);
    if (isCommit) {
      _setSwipeX(window.innerWidth);
      setTimeout(() => {
        navigate(ROUTES.phoneOrdering + "?switch=1");
        _setSwipeX(0);
      }, 200);
    } else {
      _setSwipeX(0);
    }
  }
  const swipeStyle = {
    transform: `translateX(${sSwipeX}px)`,
    transition: sSwiping ? "none" : "transform 200ms ease",
  };

  const inventoryRef = useRef(zInventory);
  useEffect(() => {
    inventoryRef.current = zInventory;
  }, [zInventory]);

  // Editing pauses background replacement so an in-flight scan doesn't clobber
  // the user's draft. Scanner camera keeps running.
  const editingRef = useRef(sEditing);
  useEffect(() => {
    editingRef.current = sEditing;
  }, [sEditing]);

  async function handleScan(code) {
    if (editingRef.current) return;
    const localItem = lookupByBarcode(inventoryRef.current, code);
    if (localItem) {
      recognitionLockoutUntilRef.current =
        Date.now() + POST_RECOGNITION_LOCKOUT_MS;
      _setIsImportCandidate(false);
      _setActiveItem(localItem);
      return;
    }

    // Local miss → catalog fallback. Hold the scanner off while the network
    // call is in flight; otherwise a second scan races the modal we're about
    // to show.
    recognitionLockoutUntilRef.current = Date.now() + POST_RECOGNITION_LOCKOUT_MS;
    _setCheckingCatalog(true);
    let hit = null;
    try {
      hit = await dbLookupCatalogByBarcode(code);
    } catch {
      // ignore — treated as a miss
    }
    _setCheckingCatalog(false);

    if (hit && hit.catalogItem) {
      const shell = buildInventoryItemFromCatalog(hit.catalogItem, {
        vendorId: hit.vendor?.id || "",
        scannedBarcode: code,
      });
      recognitionLockoutUntilRef.current =
        Date.now() + POST_RECOGNITION_LOCKOUT_MS;
      _setIsImportCandidate(true);
      _setActiveItem(shell);
      return;
    }

    useAlertScreenStore.getState().setValues({
      title: "No Match",
      severity: "info",
      message: "No item was found in the catalogs or local inventory.",
      btn1Text: "Close",
      handleBtn1Press: () =>
        useAlertScreenStore.getState().setShowAlert(false),
    });
  }

  const handleScanRef = useRef(handleScan);
  useEffect(() => {
    handleScanRef.current = handleScan;
  });

  function handleDecode(result) {
    if (!result) return;
    const now = Date.now();
    if (now < recognitionLockoutUntilRef.current) return;
    if (now - lastScanMillisRef.current < ANY_SCAN_LOCKOUT_MS) return;
    lastScanMillisRef.current = now;
    handleScanRef.current(result.getText());
  }

  useEffect(() => {
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, SCAN_FORMATS);
    const reader = new BrowserMultiFormatReader(hints);
    readerRef.current = reader;

    let cancelled = false;
    (async () => {
      try {
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          videoRef.current,
          handleDecode,
        );
        if (cancelled) {
          try {
            controls?.stop();
          } catch {
            // ignore
          }
        } else {
          controlsRef.current = controls;
        }
      } catch (e) {
        _setCameraError(e?.message || "Camera unavailable");
      }
    })();

    return () => {
      cancelled = true;
      try {
        controlsRef.current?.stop();
      } catch {
        // ignore
      }
      controlsRef.current = null;
      readerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function closeModal() {
    _setEditing(false);
    _setIsImportCandidate(false);
    _setActiveItem(null);
  }

  async function handleImportItem(item) {
    useInventoryStore.getState().setItem(item, false);
    _setIsImportCandidate(false);
    try {
      await dbSaveInventoryItem(item);
    } catch {
      // ignore — local optimistic update remains
    }
  }

  return (
    <div
      className={styles.root}
      onTouchStart={handleSwipeStart}
      onTouchMove={handleSwipeMove}
      onTouchEnd={handleSwipeEnd}
      style={swipeStyle}
    >
      <SwipeBackHint label="Ordering" swipeX={sSwipeX} />
      <AlertBox showAlert={zShowAlert} />
      <div className={styles.header}>
        <span className={styles.title}>Price Check</span>
      </div>
      <div className={styles.body}>
        <video
          ref={videoRef}
          className={styles.video}
          muted
          playsInline
          autoPlay
        />
        {sCameraError ? (
          <div className={styles.errorBanner}>{sCameraError}</div>
        ) : (
          <div className={styles.hint}>Point at a UPC to scan</div>
        )}
      </div>
      {sCheckingCatalog && (
        <div className={styles.toastOverlay}>
          <div className={styles.toast}>Checking catalogs…</div>
        </div>
      )}
      {sActiveItem && (
        <ItemDetailModal
          key={sActiveItem.id}
          item={sActiveItem}
          canEdit={canEdit}
          editing={sEditing}
          isImportCandidate={sIsImportCandidate}
          onImport={handleImportItem}
          onEditingChange={_setEditing}
          onClose={closeModal}
        />
      )}
    </div>
  );
}

function ItemDetailModal({
  item,
  canEdit,
  editing,
  isImportCandidate,
  onImport,
  onEditingChange,
  onClose,
}) {
  const z = useZ("modal");
  const [sDraft, _setDraft] = useState(() => cloneDeep(item));
  const [sPriceStr, _setPriceStr] = useState(() =>
    formatCurrencyDisp(item.price),
  );
  const [sMsrpStr, _setMsrpStr] = useState(() =>
    formatCurrencyDisp(item.msrp),
  );
  const [sCostStr, _setCostStr] = useState(() =>
    formatCurrencyDisp(item.cost),
  );

  function setField(name, val) {
    _setDraft((d) => ({ ...d, [name]: val }));
  }

  function handlePriceInput(setter, fieldName) {
    return (e) => {
      const { display, cents } = usdTypeMask(e.target.value);
      setter(display);
      setField(fieldName, cents);
    };
  }

  async function saveAndExitEdit() {
    const merged = { ...item, ...sDraft };
    useInventoryStore.getState().setItem(merged, false);
    onEditingChange(false);
    try {
      await dbSaveInventoryItem(merged);
    } catch {
      // ignore — local optimistic update remains
    }
  }

  function togglePencil() {
    if (editing) {
      saveAndExitEdit();
    } else {
      onEditingChange(true);
    }
  }

  return (
    <div className={styles.modalOverlay} style={{ zIndex: z }}>
      <div className={styles.modalCard}>
        <div className={styles.modalActions}>
          {canEdit && (
            <button
              type="button"
              className={`${styles.iconBtn} ${editing ? styles.iconBtnActive : ""}`}
              onClick={togglePencil}
              aria-label={editing ? "Save changes" : "Edit item"}
            >
              <img src={ICONS.editPencil} alt="" className={styles.iconBtnImg} />
            </button>
          )}
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => {
              /* print: not hooked up yet */
            }}
            aria-label="Print"
          >
            <img src={ICONS.print} alt="" className={styles.iconBtnImg} />
          </button>
        </div>

        <div className={styles.modalBody}>
          <Field
            label="Catalog Name"
            editing={editing}
            display={item.catalogName || "—"}
            input={
              <input
                className={styles.textInput}
                value={sDraft.catalogName || ""}
                onChange={(e) => setField("catalogName", e.target.value)}
              />
            }
          />
          <Field
            label="Price"
            editing={editing}
            display={formatCurrencyDisp(item.price, true)}
            input={
              <input
                className={styles.textInput}
                inputMode="numeric"
                value={sPriceStr}
                onChange={handlePriceInput(_setPriceStr, "price")}
              />
            }
          />
          <Field
            label="MSRP"
            editing={editing}
            display={formatCurrencyDisp(item.msrp, true)}
            input={
              <input
                className={styles.textInput}
                inputMode="numeric"
                value={sMsrpStr}
                onChange={handlePriceInput(_setMsrpStr, "msrp")}
              />
            }
          />
          <Field
            label="Cost"
            editing={editing}
            display={formatCurrencyDisp(item.cost, true)}
            input={
              <input
                className={styles.textInput}
                inputMode="numeric"
                value={sCostStr}
                onChange={handlePriceInput(_setCostStr, "cost")}
              />
            }
          />
          <Field
            label="Vendor"
            editing={editing}
            display={vendorDisplayName(item.vendorId)}
            input={
              <select
                className={styles.textInput}
                value={sDraft.vendorId || ""}
                onChange={(e) => setField("vendorId", e.target.value)}
              >
                <option value="">—</option>
                {VENDOR_CATALOGS.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.displayName}
                  </option>
                ))}
              </select>
            }
          />
          <Field
            label="Vendor ID"
            editing={editing}
            display={item.vendorPartId || "—"}
            input={
              <input
                className={styles.textInput}
                value={sDraft.vendorPartId || ""}
                onChange={(e) => setField("vendorPartId", e.target.value)}
              />
            }
          />
        </div>

        {isImportCandidate && (
          <button
            type="button"
            className={styles.importBtn}
            onClick={() => onImport && onImport(item)}
          >
            Import Item
          </button>
        )}
        <button type="button" className={styles.closeBtn} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

function Field({ label, editing, input, display }) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      {editing ? input : <span className={styles.fieldValue}>{display}</span>}
    </div>
  );
}
