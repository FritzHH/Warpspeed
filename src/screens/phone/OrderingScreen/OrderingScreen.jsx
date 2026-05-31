import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import cloneDeep from "lodash/cloneDeep";
import { ROUTES } from "../../../routes";
import { useLoginStore } from "../../../stores";
import {
  dbSaveVendorOrderItem,
  dbUpdateVendorOrderItemFields,
  dbResolveOrderItem,
  dbUpdateVendorOrderFields,
} from "../../../db_calls_wrapper";
import { VENDOR_ORDER_ITEM_PROTO } from "../../../data";
import { generate36CharUUID } from "../../../utils";
import { ICONS } from "../../../styles";
import { useZ } from "../../../hooks/useZ";
import styles from "./OrderingScreen.module.css";

const SCAN_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.QR_CODE,
];

const SAME_CODE_LOCKOUT_MS = 1500;
const ANY_SCAN_LOCKOUT_MS = 400;

export function OrderingScreen() {
  const navigate = useNavigate();
  const { orderID } = useParams();
  const zCurrentUser = useLoginStore((s) => s.currentUser);
  const userID = zCurrentUser?.id || "";

  const readerRef = useRef(null);
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const lastScanRef = useRef({ code: null, millis: 0 });
  const modalOpenRef = useRef(false);

  const [sItemCount, _setItemCount] = useState(0);
  const [sScannedItem, _setScannedItem] = useState(null);
  const [sCameraError, _setCameraError] = useState("");

  const userIDRef = useRef(userID);
  useEffect(() => {
    userIDRef.current = userID;
  }, [userID]);

  useEffect(() => {
    if (!orderID) navigate(ROUTES.phoneOrdering, { replace: true });
  }, [orderID, navigate]);

  async function handleScan(code) {
    if (!orderID) return;
    modalOpenRef.current = true;
    const now = Date.now();
    const uid = userIDRef.current;

    const itemID = generate36CharUUID();
    const newItem = {
      ...cloneDeep(VENDOR_ORDER_ITEM_PROTO),
      id: itemID,
      scannedBarcode: code,
      qty: 0,
      addedMillis: now,
      addedByUserID: uid,
      lookupStatus: "pending",
    };

    _setScannedItem({ ...newItem, displayName: "", resolved: false });

    dbUpdateVendorOrderFields(orderID, {
      lastModifiedMillis: now,
      lastModifiedByUserID: uid,
    });

    dbSaveVendorOrderItem(orderID, newItem).then(() => {
      dbResolveOrderItem(orderID, newItem).then((res) => {
        _setScannedItem((cur) =>
          cur && cur.id === itemID
            ? { ...cur, displayName: res?.displayName || "", resolved: true }
            : cur,
        );
      });
    });
  }

  const handleScanRef = useRef(handleScan);
  useEffect(() => {
    handleScanRef.current = handleScan;
  });

  function handleDecode(result) {
    if (!result) return;
    if (modalOpenRef.current) return;
    const code = result.getText();
    const now = Date.now();
    if (now - lastScanRef.current.millis < ANY_SCAN_LOCKOUT_MS) return;
    if (
      code === lastScanRef.current.code &&
      now - lastScanRef.current.millis < SAME_CODE_LOCKOUT_MS
    )
      return;
    lastScanRef.current = { code, millis: now };
    handleScanRef.current(code);
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

  async function handleQtySubmit(qty) {
    const item = sScannedItem;
    if (!item || !orderID) return;
    if (!qty || qty < 1) return;
    _setScannedItem(null);
    _setItemCount((c) => c + 1);
    modalOpenRef.current = false;
    lastScanRef.current = { code: item.scannedBarcode, millis: Date.now() };
    try {
      await dbUpdateVendorOrderItemFields(orderID, item.id, { qty });
    } catch {
      // ignore; user already moved on
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <button
          className={styles.backButton}
          onClick={() => navigate(ROUTES.phoneOrdering)}
        >
          ←
        </button>
        <span className={styles.title}>Ordering</span>
        <span className={styles.count}>{sItemCount} items</span>
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
      {sScannedItem && (
        <QtyModal
          itemName={sScannedItem.displayName}
          scannedBarcode={sScannedItem.scannedBarcode}
          resolved={sScannedItem.resolved}
          onSubmit={handleQtySubmit}
        />
      )}
    </div>
  );
}

function QtyModal({ itemName, scannedBarcode, resolved, onSubmit }) {
  const z = useZ("modal");
  const [sCustom, _setCustom] = useState(10);
  const [sFocused, _setFocused] = useState(false);
  const justFocusedRef = useRef(false);

  function handleNumPress(n) {
    if (sFocused) {
      if (justFocusedRef.current) {
        _setCustom(n);
        justFocusedRef.current = false;
        return;
      }
      _setCustom((cur) => {
        const next = parseInt(String(cur) + String(n), 10);
        if (!Number.isFinite(next) || next > 9999) return cur;
        return next;
      });
      return;
    }
    if (n === 0) return;
    onSubmit(n);
  }

  function bump(delta) {
    _setCustom((cur) => {
      const n = (parseInt(cur, 10) || 0) + delta;
      return n < 1 ? 1 : n;
    });
  }

  function focusInput() {
    _setFocused(true);
    justFocusedRef.current = true;
  }

  function submit() {
    const n = parseInt(sCustom, 10);
    if (!n || n < 1) return;
    onSubmit(n);
  }

  return (
    <div className={styles.modalOverlay} style={{ zIndex: z }}>
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          {itemName ? (
            <span className={styles.itemName}>{itemName}</span>
          ) : resolved ? (
            <span className={styles.itemPending}>
              No match · {scannedBarcode}
            </span>
          ) : (
            <span className={styles.itemPending}>
              Looking up {scannedBarcode}…
            </span>
          )}
        </div>
        <div className={styles.qtyLabel}>Quantity</div>
        <div className={styles.keypadGrid}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button
              key={n}
              className={`${styles.numButton} ${
                sFocused ? styles.numButtonGreen : ""
              }`}
              onClick={() => handleNumPress(n)}
            >
              {n}
            </button>
          ))}
        </div>
        <div className={styles.spinnerRow}>
          <button
            className={styles.arrowButton}
            onClick={() => bump(-1)}
            aria-label="Decrease quantity"
          >
            <img
              src={ICONS.downChevron}
              alt=""
              className={styles.arrowIcon}
            />
          </button>
          <button
            className={`${styles.numButton} ${
              sFocused ? styles.numButtonGreen : ""
            }`}
            onClick={() => handleNumPress(0)}
          >
            0
          </button>
          <button
            type="button"
            className={`${styles.customInput} ${
              sFocused ? styles.customInputFocused : ""
            }`}
            onClick={focusInput}
          >
            {sCustom}
          </button>
          <button
            className={styles.arrowButton}
            onClick={() => bump(1)}
            aria-label="Increase quantity"
          >
            <img src={ICONS.upChevron} alt="" className={styles.arrowIcon} />
          </button>
        </div>
        <button className={styles.submitButton} onClick={submit}>
          Submit
        </button>
      </div>
    </div>
  );
}
