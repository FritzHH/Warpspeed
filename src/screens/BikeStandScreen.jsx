/* eslint-disable */
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { useState, useEffect, useRef, forwardRef } from "react";
import { createPortal } from "react-dom";
import cloneDeep from "lodash/cloneDeep";
import * as faceapi from "face-api.js";
import { C, ICONS, COLOR_GRADIENTS, Z } from "../styles";
import {
  useSettingsStore,
  useOpenWorkordersStore,
  useInventoryStore,
  useCurrentCustomerStore,
  useUploadProgressStore,
  useLoginStore,
  useAlertScreenStore,
} from "../stores";
import { resolveStatus, formatCurrencyDisp, lightenRGBByPercent, capitalizeFirstLetterOfString, applyDiscountToWorkorderItem, calculateRunningTotals, deepEqual, removeDashesFromPhone, formatPhoneWithDashes, checkInputForNumbersOnly, calculateWaitEstimateLabel, formatMillisForDisplay, compressImage, createNewWorkorder, scheduleAutoText, usdTypeMask, generateEAN13Barcode, log, printBuilder, localStorageWrapper, replaceOrAddToArr, findTemplateByType } from "../utils";
import {
  WORKORDER_ITEM_PROTO,
  COLORS,
  CUSTOM_WAIT_TIME,
  NONREMOVABLE_WAIT_TIMES,
  SETTINGS_OBJ,
  CONTACT_RESTRICTIONS,
  CUSTOMER_PROTO,
  QUICK_BUTTON_ITEM_PROTO,
  QB_DEFAULT_W,
  QB_DEFAULT_H,
  INVENTORY_ITEM_PROTO,
} from "../data";
import {
  Button,
  Image,
  TextInput,
  PhoneNumberInput,
  SmallLoadingIndicator,
  NoteHelper,
  CheckBox,
  StatusPickerModal,
  DropdownMenu,
  AlertBox,
} from "../dom_components";
import {
  dbListenToSettings,
  dbListenToInventory,
  dbListenToOpenWorkorders,
  dbSaveOpenWorkorder,
  dbSearchCustomersByPhone,
  dbSearchCustomersByName,
  dbUploadWorkorderMedia,
  startNewWorkorder,
  dbSavePrintObj,
  dbSendReceipt,
} from "../db_calls_wrapper";
import { WorkorderMediaModal } from "./screen_components/modal_screens/WorkorderMediaModal";
import { InventorySearchModal } from "./screen_components/modal_screens/InventorySearchModal";
import { StandKeypad } from "../shared/StandKeypad";
import { useMountClickGuard } from "../shared/useMountClickGuard";
import { MILLIS_IN_DAY, DISCOUNT_TYPES, FACE_DESCRIPTOR_CONFIDENCE_DISTANCE, build_db_path } from "../constants";
import { openCacheDB, clearStaleCache, loadModelCached } from "../faceDetection";
import warningIcon from "../assets/webp/warning.webp";
import plusIcon from "../assets/webp/plus.webp";
import styles from "./BikeStandScreen.module.css";

const DROPDOWN_SELECTED_OPACITY = 0.3;

let _standTouchFired = false;
const StandTouch = forwardRef(function StandTouch({ onPress, children, style, className, touchStart = true }, ref) {
  if (!touchStart) return <div ref={ref} onClick={() => onPress?.()} style={style} className={className}>{children}</div>;
  return (
    <div
      ref={ref}
      onTouchStartCapture={(e) => { e.preventDefault(); e.stopPropagation(); _standTouchFired = true; onPress?.(); }}
      onClickCapture={(e) => { if (_standTouchFired) { _standTouchFired = false; e.stopPropagation(); } }}
      style={style}
      className={className}
    >
      {children}
    </div>
  );
});

function getQuickButtonFontSize(text, baseFontSize) {
  let len = (text || "").length;
  if (len <= 15) return baseFontSize;
  return Math.max(7, Math.round(baseFontSize - (len - 15) * 0.5));
}

function splitButtonLabel(text) {
  if (!text) return "";
  return text.split(/\s*[\/\\&]\s*/).join("\n");
}

function normalizeItemEntry(entry, idx) {
  if (typeof entry === "string") {
    return { ...QUICK_BUTTON_ITEM_PROTO, inventoryItemID: entry, x: (idx % 6) * (QB_DEFAULT_W + 1), y: Math.floor(idx / 6) * (QB_DEFAULT_H + 1) };
  }
  return entry;
}

////////////////////////////////////////////////////////////////////////////////
// Main Screen
////////////////////////////////////////////////////////////////////////////////

export function BikeStandScreen() {
  const zQuickItemButtons = useSettingsStore((s) => s.settings?.quickItemButtons, deepEqual);
  const zSettings = useSettingsStore((s) => s.settings) || SETTINGS_OBJ;
  const zWorkorders = useOpenWorkordersStore((state) => state.workorders);
  const zSendStatuses = useOpenWorkordersStore((state) => state._sendStatuses);
  const zInventory = useInventoryStore((state) => state.inventoryArr);
  const zShowAlert = useAlertScreenStore((state) => state.showAlert);

  const [sSelectedWorkorderID, _setSelectedWorkorderID] = useState(null);
  const [sPendingCustomer, _setPendingCustomer] = useState(null); // null | customer object | "standalone"
  const qtyMapRef = useRef({});
  const [sQtyMap, _setQtyMap] = useState({});
  const qtyTimerRef = useRef(null);

  // View mode state
  const [sViewMode, _setViewMode] = useState("buttons"); // "buttons" | "workorder"
  const [sSelectedCustomer, _setSelectedCustomer] = useState(null);
  const [sShowPhoneSearch, _setShowPhoneSearch] = useState(false);
  const [sShowCustomerModal, _setShowCustomerModal] = useState(false);
  const [sShowNewWorkorderModal, _setShowNewWorkorderModal] = useState(false);
  const [sShowBikeInfoModal, _setShowBikeInfoModal] = useState(false);
  const [sDetailKeypadOverride, _setDetailKeypadOverride] = useState(null);
  const [sDiscountCardID, _setDiscountCardID] = useState(null);
  const [sShowInventoryModal, _setShowInventoryModal] = useState(false);
  const [sShowWorkorderList, _setShowWorkorderList] = useState(false);
  const [sShowStandSettings, _setShowStandSettings] = useState(false);
  const [sShowFooterMenu, _setShowFooterMenu] = useState(false);
  const [sFooterMenuCoords, _setFooterMenuCoords] = useState({ x: 0, y: 0 });
  const [sBypassFaceRecognition, _setBypassFaceRecognition] = useState(() => localStorageWrapper.getItem("standBypassFaceRecognition") === "true");
  const longPressTimerRef = useRef(null);

  // Quick button panel state (mirrors Options_Inventory)
  const [sSelectedButtonID, _setSelectedButtonID] = useState(null);
  const [sCurrentParentID, _setCurrentParentID] = useState(null);
  const [sMenuPath, _setMenuPath] = useState([]);
  const [sCustomItemModal, _setCustomItemModal] = useState(null); // "labor" | "item" | null
  const [sEditingLine, _setEditingLine] = useState(null);
  const [sShowBikeDetails, _setShowBikeDetails] = useState(false);
  const [sDetailField, _setDetailField] = useState(null); // null | "brand" | "description" | "color1" | "color2" | "waitDays"
  const [sDetailForm, _setDetailForm] = useState({ brand: "", description: "", color1: "", color2: "", waitDays: "" });
  const [sSuggestionsHidden, _setSuggestionsHidden] = useState(false);
  const detailDebounceRef = useRef(null);
  const detailBackspaced = useRef(false);
  const waitDaysDebounceRef = useRef(null);
  const [sShowPrinterSelectModal, _setShowPrinterSelectModal] = useState(false);
  const [sSelectedPrinterID, _setSelectedPrinterID] = useState(() => localStorageWrapper.getItem("selectedPrinterID") || "");
  const [sShowItemOverlay, _setShowItemOverlay] = useState(true);
  const [sSwipedCardID, _setSwipedCardID] = useState(null); // line.id of swiped card
  const [sSwipeDir, _setSwipeDir] = useState(null); // "left" | "right"
  const itemSwipeRef = useRef(null); // { x, y } touch start
  const [sIntakeNotesLineID, _setIntakeNotesLineID] = useState(null); // line.id being edited
  const [sIntakeNotesText, _setIntakeNotesText] = useState("");
  const [sReceiptNotesText, _setReceiptNotesText] = useState("");
  const [sNotesTarget, _setNotesTarget] = useState(zSettings.noteHelpersTarget || "intakeNotes"); // "intakeNotes" | "receiptNotes"
  const [sActiveNoteChips, _setActiveNoteChips] = useState(new Set());
  const [sNotesDiscountOpen, _setNotesDiscountOpen] = useState(false);
  const [sNotesKeyboardOpen, _setNotesKeyboardOpen] = useState(false);
  const [sNotesCursorPos, _setNotesCursorPos] = useState(null);
  const [sNotesQty, _setNotesQty] = useState(1);
  const [sNoteHelperDropdown, _setNoteHelperDropdown] = useState(null); // { anchorPosition, workorderLine }
  const lastCanvasClickTimeRef = useRef(0);
  const lastCanvasClickItemRef = useRef(null);
  const [sPulseID, _setPulseID] = useState(null);
  const pulseTimerRef = useRef(null);

  const [sSubMenuFontAdj, _setSubMenuFontAdj] = useState(() => {
    let v = localStorageWrapper.getItem("standSubMenuFontAdj");
    return v != null ? Number(v) : 0;
  });
  const [sNoteHelperFontAdj, _setNoteHelperFontAdj] = useState(() => {
    let v = localStorageWrapper.getItem("standNoteHelperFontAdj");
    return v != null ? Number(v) : 0;
  });
  const [sSubMenuWidthAdj] = useState(() => {
    let v = localStorageWrapper.getItem("standSubMenuWidthAdj");
    return v != null ? Number(v) : 0;
  });
  const [sSubMenuHeightAdj, _setSubMenuHeightAdj] = useState(() => {
    let v = localStorageWrapper.getItem("standSubMenuHeightAdj");
    return v != null ? Number(v) : 0;
  });
  const [sNavFontAdj, _setNavFontAdj] = useState(() => {
    let v = localStorageWrapper.getItem("standNavFontAdj");
    return v != null ? Number(v) : 0;
  });
  const [sNavPaddingAdj, _setNavPaddingAdj] = useState(() => {
    let v = localStorageWrapper.getItem("standNavPaddingAdj");
    return v != null ? Number(v) : 0;
  });
  const [sSubMenuEditMode, _setSubMenuEditMode] = useState(false);

  // Refs for bike detail dropdowns
  const bikeBrandsRef = useRef(null);
  const bikeOptBrandsRef = useRef(null);
  const descriptionRef = useRef(null);
  const color1Ref = useRef(null);
  const color2Ref = useRef(null);
  const waitTimesRef = useRef(null);
  const swipeDividerRef = useRef(null);
  const notesSwipeRef = useRef(null);

  // Login state (face recognition + pin)
  const [sShowFaceModal, _setShowFaceModal] = useState(false);
  const [sFaceCountdown, _setFaceCountdown] = useState(5);
  const [sShowPinModal, _setShowPinModal] = useState(false);
  const [sPin, _setPin] = useState("");
  const faceVideoRef = useRef(null);
  const faceStreamRef = useRef(null);
  const faceIntervalRef = useRef(null);
  const countdownRef = useRef(null);
  const modelsLoadedRef = useRef(false);
  const pendingActionRef = useRef(null);
  const inactivityTimerRef = useRef(null);

  const INACTIVITY_TIMEOUT = 5 * 60 * 1000;

  function resetInactivityTimer() {
    clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = setTimeout(() => {
      _setSelectedWorkorderID(null);
      _setPendingCustomer(null);
      _setShowBikeDetails(false);
      _setDetailField(null);
      _setShowBikeInfoModal(false);
      _setShowNewWorkorderModal(false);
      _setShowWorkorderList(false);
      _setShowStandSettings(false);
      _setShowFooterMenu(false);
      _setShowPrinterSelectModal(false);
      _setShowItemOverlay(true);
      _setShowFaceModal(false);
      _setShowPinModal(false);
      _setPin("");
      _setCustomItemModal(null);
      _setEditingLine(null);
      _setIntakeNotesLineID(null);
      _setShowInventoryModal(false);
      _setShowCustomerModal(false);
      _setCurrentParentID(null);
      _setMenuPath([]);
      pendingActionRef.current = null;
      stopFaceLogin();
    }, INACTIVITY_TIMEOUT);
  }

  useEffect(() => {
    let container = document.getElementById("stand-inactivity-root");
    if (!container) return;
    let events = ["touchstart", "click", "keydown"];
    let handler = () => resetInactivityTimer();
    events.forEach((e) => container.addEventListener(e, handler, true));
    resetInactivityTimer();
    return () => {
      events.forEach((e) => container.removeEventListener(e, handler, true));
      clearTimeout(inactivityTimerRef.current);
    };
  }, []);

  // Firebase listeners (same pattern as IntakeScreen)
  useEffect(() => {
    dbListenToSettings((data) => {
      useSettingsStore.getState().setSettings(data, false, false);
    });
    dbListenToInventory((data) => {
      useInventoryStore.getState().setItems(data);
    });
    dbListenToOpenWorkorders((data) => {
      useOpenWorkordersStore.getState().setOpenWorkorders(data);
    });
  }, []);

  // Pre-load face-api models on mount
  useEffect(() => {
    async function loadFaceModels() {
      try {
        let db = null;
        try { db = await openCacheDB(); await clearStaleCache(db); } catch (e) {}
        await Promise.all([
          loadModelCached(faceapi.nets.tinyFaceDetector, "tiny_face_detector_model", db),
          loadModelCached(faceapi.nets.faceLandmark68Net, "face_landmark_68_model", db),
          loadModelCached(faceapi.nets.faceRecognitionNet, "face_recognition_model", db),
        ]);
        if (db) db.close();
        modelsLoadedRef.current = true;
      } catch (e) {
        log("Stand face model loading failed:", e);
      }
    }
    loadFaceModels();
  }, []);

  // DEV: auto-login from saved pin
  useEffect(() => {
    let savedPin = localStorageWrapper.getItem("standDevPin");
    if (!savedPin) return;
    let checkLogin = () => {
      let users = useSettingsStore.getState().settings?.users;
      if (!users) return false;
      let userObj = users.find((u) => u.pin == savedPin) || users.find((u) => u.alternatePin == savedPin);
      if (userObj) {
        useLoginStore.getState().setCurrentUser(userObj);
        useLoginStore.setState({ lastActionMillis: Infinity });
        return true;
      }
      return false;
    };
    if (!checkLogin()) {
      let interval = setInterval(() => { if (checkLogin()) clearInterval(interval); }, 500);
      return () => clearInterval(interval);
    }
  }, []);

  let selectedWorkorder = (zWorkorders || []).find((o) => o.id === sSelectedWorkorderID);
  let hasWorkorderReady = !!selectedWorkorder || sPendingCustomer !== null;

  // Auto-fire "common" button on mount once data is loaded
  const hasAutoFiredRef = useRef(false);
  let isDataLoaded = zQuickItemButtons && zInventory?.length > 0;
  if (isDataLoaded && !hasAutoFiredRef.current) {
    let commonBtn = (zQuickItemButtons || []).find((b) => b.id === "common");
    if (commonBtn) {
      hasAutoFiredRef.current = true;
      setTimeout(() => handleNavButtonPress(commonBtn), 0);
    }
  }

  // Derive the active button's canvas items
  let activeButton = sSelectedButtonID ? (zQuickItemButtons || []).find((b) => b.id === sSelectedButtonID) : null;
  let canvasItems = (activeButton?.items || []).map(normalizeItemEntry);
  let canvasMaxBottom = canvasItems.reduce((max, it) => Math.max(max, (it.y || 0) + (it.h || QB_DEFAULT_H)), 0);

  // Derived: children of current sub-menu level
  let currentChildren = sCurrentParentID
    ? (zQuickItemButtons || []).filter((b) => b.parentID === sCurrentParentID)
    : [];
  if (sCurrentParentID) {
    let activeBtn = (zQuickItemButtons || []).find((b) => b.id === sCurrentParentID);
    if (activeBtn && activeBtn.parentID) currentChildren = [activeBtn, ...currentChildren];
  }

  function findInventoryItem(barcode) {
    let item = (zInventory || []).find((i) => i.id === barcode);
    if (item) return item;
    return (zInventory || []).find((i) => (i.barcodes || []).includes(barcode));
  }

  //////////////////////////////////////////////////////////////////////////////
  // Quick button navigation (ported from Options_Inventory, read-only)
  //////////////////////////////////////////////////////////////////////////////

  function handleNavButtonPress(buttonObj) {
    // Intercept $LABOR and $ITEM buttons
    if (buttonObj.id === "labor" || buttonObj.id === "item") {
      if (!hasWorkorderReady) return;
      _setCustomItemModal(buttonObj.id);
      return;
    }

    let children = (zQuickItemButtons || []).filter((b) => b.parentID === buttonObj.id);
    let hasChildren = children.length > 0;

    let items = [];
    buttonObj.items?.forEach((entry) => {
      let id = typeof entry === "string" ? entry : entry.inventoryItemID;
      let item = findInventoryItem(id);
      if (item) items.push(item);
    });
    let hasItems = items.length > 0;

    if (hasChildren) {
      // Toggle off if clicking the already-active root button
      if (!buttonObj.parentID && sMenuPath.length > 0 && sMenuPath[0].id === buttonObj.id) {
        _setCurrentParentID(null);
        _setMenuPath([]);
        _setSelectedButtonID(null);
        return;
      }
      // Collapse up one level if clicking the active sub-button
      if (buttonObj.parentID && sMenuPath.some((crumb) => crumb.id === buttonObj.id)) {
        let idx = sMenuPath.findIndex((crumb) => crumb.id === buttonObj.id);
        let newPath = sMenuPath.slice(0, idx);
        let newParentID;
        if (newPath.length === 0) {
          newParentID = sMenuPath[0].id;
          _setCurrentParentID(newParentID);
          _setMenuPath([sMenuPath[0]]);
        } else {
          newParentID = newPath[newPath.length - 1].id;
          _setCurrentParentID(newParentID);
          _setMenuPath(newPath);
        }
        let parentBtn = (zQuickItemButtons || []).find((b) => b.id === newParentID);
        if (parentBtn?.items?.length > 0) {
          _setSelectedButtonID(parentBtn.id);
        } else {
          _setSelectedButtonID(null);
        }
        return;
      }
      // Button has children - show them
      if (!buttonObj.parentID) {
        _setMenuPath([{ id: buttonObj.id, name: buttonObj.name }]);
      } else {
        _setMenuPath((prev) => [...prev, { id: buttonObj.id, name: buttonObj.name }]);
      }
      _setCurrentParentID(buttonObj.id);

      if (hasItems) {
        _setSelectedButtonID(buttonObj.id);
      } else {
        _setSelectedButtonID(null);
      }
    } else {
      // Leaf button (no children) - toggle selection
      if (sSelectedButtonID === buttonObj.id) {
        let parentBtn = buttonObj.parentID ? (zQuickItemButtons || []).find((b) => b.id === buttonObj.parentID) : null;
        if (parentBtn) {
          _setSelectedButtonID(parentBtn.id);
        } else {
          _setSelectedButtonID(null);
        }
      } else {
        _setSelectedButtonID(buttonObj.id);
      }
      if (!buttonObj.parentID) {
        _setCurrentParentID(null);
        _setMenuPath([]);
      }
    }
  }

  //////////////////////////////////////////////////////////////////////////////
  // Ensure workorder exists (creates from pending customer on first item add)
  //////////////////////////////////////////////////////////////////////////////

  async function ensureWorkorderExists() {
    if (selectedWorkorder) return selectedWorkorder;
    if (sPendingCustomer === null) return null;
    let customer = sPendingCustomer === "standalone" ? undefined : sPendingCustomer;
    let wo = await startNewWorkorder(customer);
    _setSelectedWorkorderID(wo.id);
    _setPendingCustomer(null);
    return wo;
  }

  //////////////////////////////////////////////////////////////////////////////
  // Inventory item selected (add to workorder)
  //////////////////////////////////////////////////////////////////////////////

  async function inventoryItemSelected(invItem) {
    console.log("[STAND] inventoryItemSelected:", invItem?.formalName, "hasWorkorderReady:", hasWorkorderReady, "selectedWorkorder:", !!selectedWorkorder, "pendingCustomer:", sPendingCustomer);
    if (!hasWorkorderReady || !invItem) return;
    let wo = await ensureWorkorderExists();
    console.log("[STAND] ensureWorkorderExists returned:", wo?.id);
    if (!wo) return;
    await dbSaveOpenWorkorder(wo);

    let lines = [...(wo.workorderLines || [])];
    let existingIdx = lines.findIndex((ln) => ln.inventoryItem?.id === invItem.id);
    if (existingIdx !== -1) {
      lines = cloneDeep(lines);
      lines[existingIdx].qty = (lines[existingIdx].qty || 1) + 1;
    } else {
      let line = cloneDeep(WORKORDER_ITEM_PROTO);
      line.inventoryItem = invItem;
      line.id = crypto.randomUUID();
      lines.push(line);
    }

    useOpenWorkordersStore.getState().setField("workorderLines", lines, wo.id, true);
  }

  //////////////////////////////////////////////////////////////////////////////
  // Custom item save (labor / item modal)
  //////////////////////////////////////////////////////////////////////////////

  async function handleCustomItemSave(lineItem) {
    if (!hasWorkorderReady) return;
    let wo = await ensureWorkorderExists();
    if (!wo) return;
    await dbSaveOpenWorkorder(wo);
    let workorderLines = [...(wo.workorderLines || []), lineItem];
    useOpenWorkordersStore.getState().setField("workorderLines", workorderLines, wo.id, true);
  }

  //////////////////////////////////////////////////////////////////////////////
  // Qty modification (same pattern as Items_WorkorderItems)
  //////////////////////////////////////////////////////////////////////////////

  function modifyQty(workorderLine, direction) {
    if (!selectedWorkorder) return;
    let currentQty = qtyMapRef.current[workorderLine.id] !== undefined
      ? qtyMapRef.current[workorderLine.id]
      : workorderLine.qty;

    let newQty = direction === "up" ? currentQty + 1 : currentQty - 1;
    if (newQty <= 0) return;

    qtyMapRef.current = { ...qtyMapRef.current, [workorderLine.id]: newQty };
    _setQtyMap({ ...qtyMapRef.current });

    clearTimeout(qtyTimerRef.current);
    qtyTimerRef.current = setTimeout(() => {
      let storeWo = useOpenWorkordersStore.getState().workorders.find(
        (o) => o.id === sSelectedWorkorderID
      );
      if (!storeWo) return;

      let updatedLines = storeWo.workorderLines.map((ln) => {
        let overrideQty = qtyMapRef.current[ln.id];
        if (overrideQty === undefined) return ln;
        let newLine = { ...ln, qty: overrideQty };
        if (newLine.discountObj?.name) {
          let discounted = applyDiscountToWorkorderItem(newLine);
          if (discounted.discountObj?.newPrice > 0) return discounted;
        }
        return newLine;
      });

      useOpenWorkordersStore.getState().setField(
        "workorderLines", updatedLines, sSelectedWorkorderID, true
      );
      qtyMapRef.current = {};
      _setQtyMap({});
    }, 700);
  }

  //////////////////////////////////////////////////////////////////////////////
  // Long-press discount
  //////////////////////////////////////////////////////////////////////////////

  function handleLongPressStart(inventoryItemID) {
    longPressTimerRef.current = setTimeout(() => {
      if (!selectedWorkorder) return;
      let hasLine = (selectedWorkorder.workorderLines || []).some(
        (ln) => ln.inventoryItem?.id === inventoryItemID
      );
      if (hasLine) _setDiscountCardID(inventoryItemID);
    }, 500);
  }

  function handleLongPressEnd() {
    clearTimeout(longPressTimerRef.current);
  }

  async function openNoteHelperForCanvasItem(invItem) {
    if (!invItem) return;
    if (!hasWorkorderReady) return;
    let wo = useOpenWorkordersStore.getState().workorders.find((o) => o.id === sSelectedWorkorderID);
    let line = wo ? (wo.workorderLines || []).find((ln) => ln.inventoryItem?.id === invItem.id) : null;
    if (!line) {
      wo = await ensureWorkorderExists();
      if (!wo) return;
      await dbSaveOpenWorkorder(wo);
      let newLine = cloneDeep(WORKORDER_ITEM_PROTO);
      newLine.inventoryItem = invItem;
      newLine.id = crypto.randomUUID();
      let lines = [...(wo.workorderLines || []), newLine];
      useOpenWorkordersStore.getState().setField("workorderLines", lines, wo.id, true);
      line = newLine;
    }
    _setIntakeNotesLineID(line.id);
    _setIntakeNotesText(line.intakeNotes || "");
    _setReceiptNotesText(line.receiptNotes || "");
    _setNotesQty(line.qty || 1);
    _setNotesTarget(zSettings.noteHelpersTarget || "intakeNotes");
    let helpers = zSettings.noteHelpers || [];
    let targetText = (zSettings.noteHelpersTarget || "intakeNotes") === "intakeNotes" ? (line.intakeNotes || "") : (line.receiptNotes || "");
    let existing = targetText.split(", ").map((s) => s.trim()).filter(Boolean);
    let keys = new Set();
    existing.forEach((part) => {
      helpers.forEach((cat) => {
        (cat.items || []).forEach((item) => {
          let insertText = typeof item === "string" ? item : (item.text || item.buttonLabel || "").trim();
          if (insertText === part) keys.add(cat.id + "::" + insertText);
        });
      });
    });
    _setActiveNoteChips(keys);
    _setNotesCursorPos(null);
  }

  function handleNoteHelperUpdate(updatedLine) {
    if (!sSelectedWorkorderID) return;
    const wo = useOpenWorkordersStore.getState().workorders.find((o) => o.id === sSelectedWorkorderID);
    if (!wo) return;
    const updatedLines = replaceOrAddToArr(wo.workorderLines || [], updatedLine);
    useOpenWorkordersStore.getState().setField("workorderLines", updatedLines, sSelectedWorkorderID, true);
    _setNoteHelperDropdown((prev) => prev ? { ...prev, workorderLine: updatedLine } : null);
  }

  function handleDiscountSelect(inventoryItemID, discountObj) {
    if (!selectedWorkorder) return;
    let updatedLines = (selectedWorkorder.workorderLines || []).map((ln) => {
      if (ln.inventoryItem?.id !== inventoryItemID) return ln;
      if (!discountObj) return { ...ln, discountObj: null };
      let updated = { ...ln, discountObj };
      return applyDiscountToWorkorderItem(updated);
    });
    useOpenWorkordersStore.getState().setField(
      "workorderLines", updatedLines, sSelectedWorkorderID, true
    );
    _setDiscountCardID(null);
  }

  function removeWorkorderLine(lineID) {
    if (!selectedWorkorder) return;
    let updatedLines = (selectedWorkorder.workorderLines || []).filter((ln) => ln.id !== lineID);
    useOpenWorkordersStore.getState().setField("workorderLines", updatedLines, sSelectedWorkorderID, true);
    _setSwipedCardID(null);
    _setSwipeDir(null);
  }

  function handleItemCardTouchStart(e) {
    let touch = e.touches?.[0] || e;
    itemSwipeRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function handleItemCardTouchEnd(e, lineID) {
    if (!itemSwipeRef.current) return;
    let touch = e.changedTouches?.[0] || e;
    let dx = touch.clientX - itemSwipeRef.current.x;
    let dy = touch.clientY - itemSwipeRef.current.y;
    itemSwipeRef.current = null;

    // Swipe down on any card hides the entire overlay
    if (dy > 30 && Math.abs(dx) < Math.abs(dy)) {
      _setShowItemOverlay(false);
      _setSwipedCardID(null);
      _setSwipeDir(null);
      return;
    }

    // Swipe left — reveal delete
    if (dx < -30 && Math.abs(dx) > Math.abs(dy)) {
      _setSwipedCardID(lineID);
      _setSwipeDir("left");
      return;
    }

    // Swipe right — reveal discount
    if (dx > 30 && Math.abs(dx) > Math.abs(dy)) {
      _setSwipedCardID(lineID);
      _setSwipeDir("right");
      return;
    }

    // Tap (no significant movement) — reset any revealed action
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      _setSwipedCardID(null);
      _setSwipeDir(null);
    }
  }

  //////////////////////////////////////////////////////////////////////////////
  // Customer search + workorder creation
  //////////////////////////////////////////////////////////////////////////////

  async function handleCustomerSelect(customer) {
    _setShowPhoneSearch(false);
    _setSelectedCustomer(customer);

    let wo = await startNewWorkorder(customer);
    _setSelectedWorkorderID(wo.id);
    _setViewMode("workorder");
  }

  function handleBackToButtons() {
    _setViewMode("buttons");
    _setSelectedCustomer(null);
  }

  //////////////////////////////////////////////////////////////////////////////
  // Inventory modal add
  //////////////////////////////////////////////////////////////////////////////

  async function handleAddInventoryItems(items) {
    if (!hasWorkorderReady || !items.length) return;
    _setShowInventoryModal(false);

    let wo = await ensureWorkorderExists();
    if (!wo) return;
    await dbSaveOpenWorkorder(wo);

    let newLines = [...(wo.workorderLines || [])];
    items.forEach((invItem) => {
      let line = cloneDeep(WORKORDER_ITEM_PROTO);
      line.inventoryItem = invItem;
      line.id = crypto.randomUUID();
      newLines.push(line);
    });

    useOpenWorkordersStore.getState().setField("workorderLines", newLines, wo.id, true);
  }

  //////////////////////////////////////////////////////////////////////////////
  // Status change
  //////////////////////////////////////////////////////////////////////////////

  function handleStatusSelect(val) {
    if (!selectedWorkorder) return;
    useOpenWorkordersStore.getState().setField("status", val.id, selectedWorkorder.id, true);
  }

  function setBikeColor(incomingColorVal, fieldName) {
    if (!selectedWorkorder) return;
    let newColorObj = {};
    let foundColor = false;
    COLORS.forEach((bikeColorObj) => {
      if (bikeColorObj.label.toLowerCase() === incomingColorVal.toLowerCase()) {
        foundColor = true;
        newColorObj = cloneDeep(bikeColorObj);
      }
    });
    if (!foundColor) {
      newColorObj.label = incomingColorVal;
      newColorObj.backgroundColor = null;
      newColorObj.textColor = null;
    }
    useOpenWorkordersStore.getState().setField(fieldName, newColorObj, selectedWorkorder.id);
  }

  function saveBrandToAllBrands(brand) {
    if (!brand || !brand.trim()) return;
    const trimmed = brand.trim();
    if (trimmed.length < 3) return;
    const existing = zSettings.allBrands || [];
    if (existing.some((b) => b.toLowerCase() === trimmed.toLowerCase())) return;
    const updated = [...existing, trimmed].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    useSettingsStore.getState().setField("allBrands", updated);
  }

  function saveDescToAllDescriptions(desc) {
    if (!desc || !desc.trim()) return;
    const trimmed = desc.trim();
    if (trimmed.length < 3) return;
    const existing = zSettings.allDescriptions || [];
    if (existing.some((d) => d.toLowerCase() === trimmed.toLowerCase())) return;
    const updated = [...existing, trimmed].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    useSettingsStore.getState().setField("allDescriptions", updated);
  }

  const allColorLabels = COLORS.map((c) => c.label);

  const brandSuggestions = !sSuggestionsHidden && sDetailField === "brand" && sDetailForm.brand?.trim()
    ? (zSettings.allBrands || []).filter(
        (b) => b.toLowerCase().startsWith(sDetailForm.brand.trim().toLowerCase()) && b.toLowerCase() !== sDetailForm.brand.trim().toLowerCase()
      ).slice(0, 8)
    : [];

  const descSuggestions = !sSuggestionsHidden && sDetailField === "description" && sDetailForm.description?.trim()
    ? (zSettings.allDescriptions || []).filter(
        (d) => d.toLowerCase().startsWith(sDetailForm.description.trim().toLowerCase()) && d.toLowerCase() !== sDetailForm.description.trim().toLowerCase()
      ).slice(0, 8)
    : [];

  const color1Suggestions = !sSuggestionsHidden && sDetailField === "color1" && sDetailForm.color1?.trim()
    ? allColorLabels.filter(
        (c) => c.toLowerCase().startsWith(sDetailForm.color1.trim().toLowerCase()) && c.toLowerCase() !== sDetailForm.color1.trim().toLowerCase()
      ).slice(0, 8)
    : [];

  const color2Suggestions = !sSuggestionsHidden && sDetailField === "color2" && sDetailForm.color2?.trim()
    ? allColorLabels.filter(
        (c) => c.toLowerCase().startsWith(sDetailForm.color2.trim().toLowerCase()) && c.toLowerCase() !== sDetailForm.color2.trim().toLowerCase()
      ).slice(0, 8)
    : [];

  const anySuggestionsVisible = brandSuggestions.length > 0 || descSuggestions.length > 0 || color1Suggestions.length > 0 || color2Suggestions.length > 0;

  // Bike detail keypad helpers
  const DETAIL_FIELDS = ["brand", "description", "color1", "color2", "waitDays"];

  function saveDetailOnLeave(leavingField) {
    if (!leavingField || !selectedWorkorder) return;
    if (leavingField === "brand") saveBrandToAllBrands(selectedWorkorder.brand);
    if (leavingField === "description") saveDescToAllDescriptions(selectedWorkorder.description);
    detailBackspaced.current = false;
  }

  function activateDetailField(fieldName) {
    if (!selectedWorkorder) return;
    saveDetailOnLeave(sDetailField);
    _setDetailForm({
      brand: selectedWorkorder.brand || "",
      description: selectedWorkorder.description || "",
      color1: selectedWorkorder.color1?.label || "",
      color2: selectedWorkorder.color2?.label || "",
      waitDays: String(selectedWorkorder.waitTime?.maxWaitTimeDays ?? ""),
    });
    _setDetailField(fieldName);
    _setDetailKeypadOverride(null);
    _setSuggestionsHidden(false);
  }

  function handleDetailNext() {
    let idx = DETAIL_FIELDS.indexOf(sDetailField);
    let next = DETAIL_FIELDS[(idx + 1) % DETAIL_FIELDS.length];
    _setDetailField(next);
  }

  function saveDetailField(fieldName, val) {
    if (!selectedWorkorder) return;
    if (fieldName === "waitDays") {
      let days = val === "" ? "" : Number(val);
      let allWaits = (zSettings.waitTimes || []).filter((w) => w.maxWaitTimeDays > 0);
      let match = days ? allWaits.reduce((best, w) => (!best || Math.abs(w.maxWaitTimeDays - days) < Math.abs(best.maxWaitTimeDays - days)) ? w : best, null) : null;
      let waitObj = match
        ? { ...match, maxWaitTimeDays: days }
        : { ...CUSTOM_WAIT_TIME, label: val === "" ? "" : val + (days === 1 ? " Day" : " Days"), maxWaitTimeDays: days };
      useOpenWorkordersStore.getState().setField("waitTime", waitObj, selectedWorkorder.id);
    } else if (fieldName === "color1" || fieldName === "color2") {
      setBikeColor(val, fieldName);
    } else {
      useOpenWorkordersStore.getState().setField(fieldName, val, selectedWorkorder.id);
    }
  }

  function debouncedSaveDetail(fieldName, val) {
    clearTimeout(detailDebounceRef.current);
    detailDebounceRef.current = setTimeout(() => {
      saveDetailField(fieldName, val);
    }, 400);
  }

  function handleDetailKeyPress(key) {
    if (!sDetailField) return;
    _setSuggestionsHidden(false);
    let val = sDetailForm[sDetailField] || "";
    let isBackspace = key === "\u232B" || key === "CLR";
    if (key === "CLR") {
      val = "";
    } else if (key === "\u232B") {
      val = val.slice(0, -1);
    } else if (key === "ENTER") {
      if (sDetailField === "waitDays") return;
      val = val + "\n";
    } else if (key === " ") {
      if (sDetailField === "waitDays") return;
      val = val + " ";
    } else {
      if (sDetailField === "waitDays") {
        if (!/^\d$/.test(key)) return;
        val = val + key;
      } else {
        val = val + key.toLowerCase();
      }
    }
    detailBackspaced.current = isBackspace;
    _setDetailForm({ ...sDetailForm, [sDetailField]: val });

    if (!isBackspace && val.trim().length >= 2 && sDetailField !== "waitDays") {
      const q = val.trim().toLowerCase();
      let matches = [];
      if (sDetailField === "brand") {
        matches = (zSettings.allBrands || []).filter((b) => b.toLowerCase().startsWith(q) && b.toLowerCase() !== q);
      } else if (sDetailField === "description") {
        matches = (zSettings.allDescriptions || []).filter((d) => d.toLowerCase().startsWith(q) && d.toLowerCase() !== q);
      } else if (sDetailField === "color1" || sDetailField === "color2") {
        matches = allColorLabels.filter((c) => c.toLowerCase().startsWith(q) && c.toLowerCase() !== q);
      }
      if (matches.length === 1) {
        let match = matches[0];
        if (sDetailField === "brand") {
          useOpenWorkordersStore.getState().setField("brand", match, selectedWorkorder.id);
          saveBrandToAllBrands(match);
          _setDetailForm((prev) => ({ ...prev, brand: match }));
        } else if (sDetailField === "description") {
          useOpenWorkordersStore.getState().setField("description", match, selectedWorkorder.id);
          saveDescToAllDescriptions(match);
          _setDetailForm((prev) => ({ ...prev, description: match }));
        } else {
          setBikeColor(match, sDetailField);
          _setDetailForm((prev) => ({ ...prev, [sDetailField]: match }));
        }
        let idx = DETAIL_FIELDS.indexOf(sDetailField);
        let next = DETAIL_FIELDS[idx + 1];
        if (next) {
          _setDetailField(next);
          _setDetailKeypadOverride(null);
        } else {
          _setDetailField(null);
        }
        return;
      }
    }

    debouncedSaveDetail(sDetailField, val);
  }

  let detailKeypadMode = sDetailKeypadOverride || (sDetailField === "waitDays" ? "phone" : "alpha");

  // Printer helpers
  let printersObj = zSettings?.printers || {};
  let receiptPrinters = Object.values(printersObj).filter((p) => p.type === "receipt");
  if (!sSelectedPrinterID && receiptPrinters.length > 0) {
    let firstOnline = receiptPrinters.find((p) => p.active === true) || receiptPrinters[0];
    handleSelectPrinter(firstOnline.id);
  }
  let selectedPrinter = receiptPrinters.find((p) => p.id === sSelectedPrinterID);
  let selectedPrinterLabel = selectedPrinter?.label || "";
  let selectedPrinterOffline = selectedPrinter && selectedPrinter.active !== true;

  function handleSelectPrinter(printerID) {
    localStorageWrapper.setItem("selectedPrinterID", printerID);
    _setSelectedPrinterID(printerID);
  }

  function getCustomerForPrint() {
    if (pendingCust) return pendingCust;
    if (!selectedWorkorder) return {};
    return {
      first: selectedWorkorder.customerFirst || "",
      last: selectedWorkorder.customerLast || "",
      customerCell: selectedWorkorder.customerCell || "",
      customerLandline: selectedWorkorder.customerLandline || "",
      email: selectedWorkorder.customerEmail || "",
    };
  }

  function handleWorkorderPrint() {
    if (!selectedWorkorder || !sSelectedPrinterID) return;
    let _settings = useSettingsStore.getState().getSettings();
    let _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings: _settings };
    let toPrint = printBuilder.workorder(selectedWorkorder, getCustomerForPrint(), _settings?.salesTaxPercent, _ctx);
    dbSavePrintObj(toPrint, sSelectedPrinterID);
  }

  function handleIntakePrint() {
    if (!selectedWorkorder || !sSelectedPrinterID) return;
    let _settings = useSettingsStore.getState().getSettings();
    let _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings: _settings };
    let toPrint = printBuilder.intake(selectedWorkorder, getCustomerForPrint(), _settings?.salesTaxPercent, _ctx);
    dbSavePrintObj(toPrint, sSelectedPrinterID);
  }

  function handleIntakeElectronic() {
    if (!selectedWorkorder) return;
    let _settings = useSettingsStore.getState().getSettings();
    let customer = getCustomerForPrint();

    let smsTemplate = findTemplateByType(_settings?.smsTemplates || _settings?.textTemplates, "intakeReceipt");
    let emailTemplate = findTemplateByType(_settings?.emailTemplates, "intakeReceipt");

    let shouldSMS = customer.customerCell;
    let shouldEmail = customer.email;

    let smsContent = smsTemplate?.content || smsTemplate?.message || smsTemplate?.text || "";
    let emailContent = emailTemplate?.message || emailTemplate?.content || emailTemplate?.body || "";
    let emptyParts = [];
    if (shouldSMS && !smsContent.trim()) emptyParts.push("SMS");
    if (shouldEmail && !emailContent.trim()) emptyParts.push("email");
    if (emptyParts.length > 0) {
      useAlertScreenStore.getState().setValues({
        title: "Empty Template",
        message: "The intake receipt " + emptyParts.join(" and ") + " template is empty. Fill in the template content in Dashboard > " + (emptyParts.includes("SMS") ? "Text Templates" : "Email Templates") + ".",
        btn1Text: "OK",
        handleBtn1Press: () => useAlertScreenStore.getState().setShowAlert(false),
        canExitOnOuterClick: true,
      });
    }

    let canSMS = shouldSMS && smsContent.trim();
    let canEmail = shouldEmail && emailContent.trim();
    if (!canSMS && !canEmail) return;

    let results = [];
    if (canSMS && customer.customerCell) results.push("SMS sending to " + customer.customerCell);
    if (canEmail && customer.email) results.push("Email sending to " + customer.email);
    useAlertScreenStore.getState().setValues({ title: "Sending", message: results.join("\n"), canExitOnOuterClick: true });
    setTimeout(() => useAlertScreenStore.getState().setShowAlert(false), 1300);

    let { tenantID, storeID } = _settings;
    let _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings: _settings };
    let receiptData = printBuilder.intake(selectedWorkorder, customer, _settings?.salesTaxPercent, _ctx);
    let storagePath = build_db_path.cloudStorage.intakeReceiptPDF(selectedWorkorder.id, tenantID, storeID);

    let woID = selectedWorkorder.id;
    useOpenWorkordersStore.getState().setSendStatus(woID, "sent");

    dbSendReceipt({
      receiptType: "intake",
      receiptData,
      storagePath,
      sendSMS: !!(canSMS && customer.customerCell),
      sendEmail: !!(canEmail && customer.email),
      customerEmail: customer.email || "",
      customerCell: customer.customerCell || "",
      customerID: selectedWorkorder.customerID || "",
      templateVars: {
        firstName: capitalizeFirstLetterOfString((customer?.first || "Customer").trim()),
        storeName: _settings?.storeInfo?.displayName || "our store",
        brand: selectedWorkorder.brand || "",
        description: selectedWorkorder.description || "",
      },
      smsMessageID: crypto.randomUUID(),
      updateWorkorderField: { workorderID: woID, field: "intakeReceiptURL" },
    }).then((result) => {
      if (result?.data?.receiptURL) {
        useOpenWorkordersStore.getState().setField("intakeReceiptURL", result.data.receiptURL, woID);
      }
    }).catch((e) => {
      log("sendIntakeReceipt error:", e?.message || String(e));
      useOpenWorkordersStore.getState().setSendStatus(woID, "failed");
    });
  }

  function handleWorkorderElectronic() {
    if (!selectedWorkorder) return;
    let _settings = useSettingsStore.getState().getSettings();
    let customer = getCustomerForPrint();

    let smsTemplate = findTemplateByType(_settings?.smsTemplates || _settings?.textTemplates, "intakeReceipt");
    let emailTemplate = findTemplateByType(_settings?.emailTemplates, "intakeReceipt");

    let shouldSMS = customer.customerCell;
    let shouldEmail = customer.email;

    let smsContent = smsTemplate?.content || smsTemplate?.message || smsTemplate?.text || "";
    let emailContent = emailTemplate?.message || emailTemplate?.content || emailTemplate?.body || "";

    let canSMS = shouldSMS && smsContent.trim();
    let canEmail = shouldEmail && emailContent.trim();
    if (!canSMS && !canEmail) return;

    let results = [];
    if (canSMS && customer.customerCell) results.push("SMS sending to " + customer.customerCell);
    if (canEmail && customer.email) results.push("Email sending to " + customer.email);
    useAlertScreenStore.getState().setValues({ title: "Sending", message: results.join("\n"), canExitOnOuterClick: true });
    setTimeout(() => useAlertScreenStore.getState().setShowAlert(false), 1300);

    let { tenantID, storeID } = _settings;
    let _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings: _settings };
    let receiptData = printBuilder.workorder(selectedWorkorder, customer, _settings?.salesTaxPercent, _ctx);
    let storagePath = build_db_path.cloudStorage.intakeReceiptPDF(selectedWorkorder.id, tenantID, storeID);

    let woID = selectedWorkorder.id;
    useOpenWorkordersStore.getState().setSendStatus(woID, "sent");

    dbSendReceipt({
      receiptType: "workorder",
      receiptData,
      storagePath,
      sendSMS: !!(canSMS && customer.customerCell),
      sendEmail: !!(canEmail && customer.email),
      customerEmail: customer.email || "",
      customerCell: customer.customerCell || "",
      customerID: selectedWorkorder.customerID || "",
      templateVars: {
        firstName: capitalizeFirstLetterOfString((customer?.first || "Customer").trim()),
        storeName: _settings?.storeInfo?.displayName || "our store",
        brand: selectedWorkorder.brand || "",
        description: selectedWorkorder.description || "",
      },
      smsMessageID: crypto.randomUUID(),
      updateWorkorderField: { workorderID: woID, field: "intakeReceiptURL" },
    }).then((result) => {
      if (result?.data?.receiptURL) {
        useOpenWorkordersStore.getState().setField("intakeReceiptURL", result.data.receiptURL, woID);
      }
    }).catch((e) => {
      log("sendWorkorderReceipt error:", e?.message || String(e));
      useOpenWorkordersStore.getState().setSendStatus(woID, "failed");
    });
  }

  //////////////////////////////////////////////////////////////////////////////
  // Login: face recognition + pin
  //////////////////////////////////////////////////////////////////////////////

  function handleNewWorkorderPress() {
    _setSelectedWorkorderID(null);
    _setPendingCustomer(null);
    pendingActionRef.current = () => _setShowNewWorkorderModal(true);
    startFaceLogin();
  }

  async function startFaceLogin() {
    if (true || sBypassFaceRecognition || !modelsLoadedRef.current) {
      _setShowPinModal(true);
      return;
    }
    try {
      let stream = await navigator.mediaDevices.getUserMedia({ video: true });
      faceStreamRef.current = stream;
      _setShowFaceModal(true);
      _setFaceCountdown(5);

      // Attach stream after video element renders
      setTimeout(() => {
        if (faceVideoRef.current) {
          faceVideoRef.current.srcObject = stream;
        }
      }, 50);

      // Countdown via rAF - immune to main-thread blocking
      let countdownStart = Date.now();
      let lastDisplayed = 5;
      function tickCountdown() {
        if (faceIntervalRef.current === null) return;
        let elapsed = (Date.now() - countdownStart) / 1000;
        let remaining = Math.ceil(5 - elapsed);
        if (remaining < 0) remaining = 0;
        if (remaining !== lastDisplayed) {
          lastDisplayed = remaining;
          _setFaceCountdown(remaining);
        }
        if (remaining <= 0) {
          stopFaceLogin();
          _setShowFaceModal(false);
          _setShowPinModal(true);
          return;
        }
        countdownRef.current = requestAnimationFrame(tickCountdown);
      }
      countdownRef.current = requestAnimationFrame(tickCountdown);

      // Sequential detection loop - one detection at a time, no overlap
      faceIntervalRef.current = true;
      async function detectLoop() {
        while (faceIntervalRef.current) {
          if (faceVideoRef.current && faceVideoRef.current.readyState >= 2) {
            try {
              let detection = await faceapi
                .detectSingleFace(faceVideoRef.current, new faceapi.TinyFaceDetectorOptions())
                .withFaceLandmarks()
                .withFaceDescriptor();
              if (detection && faceIntervalRef.current) {
                let descriptor = detection.descriptor;
                let users = useSettingsStore.getState().settings?.users || [];
                for (let user of users) {
                  if (!user.faceDescriptor) continue;
                  try {
                    let distance = faceapi.euclideanDistance(Object.values(user.faceDescriptor), descriptor);
                    const threshold = useSettingsStore.getState().settings?.faceRecognitionThreshold ?? FACE_DESCRIPTOR_CONFIDENCE_DISTANCE;
                    if (distance < threshold) {
                      stopFaceLogin();
                      _setShowFaceModal(false);
                      localStorageWrapper.setItem("standDevPin", user.pin);
                      useLoginStore.getState().setCurrentUser(user);
                      useLoginStore.setState({ lastActionMillis: Infinity });
                      if (pendingActionRef.current) {
                        pendingActionRef.current();
                        pendingActionRef.current = null;
                      }
                      return;
                    }
                  } catch (e) {}
                }
              }
            } catch (e) {}
          }
          // Brief yield between detections to let UI breathe
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      detectLoop();
    } catch (e) {
      _setShowPinModal(true);
    }
  }

  function stopFaceLogin() {
    faceIntervalRef.current = null;
    cancelAnimationFrame(countdownRef.current);
    if (faceStreamRef.current) {
      faceStreamRef.current.getTracks().forEach((t) => t.stop());
      faceStreamRef.current = null;
    }
  }

  function handleStandPinKeyPress(key) {
    if (key === "CLR") { _setPin(""); return; }
    if (key === "\u232B") { _setPin((prev) => prev.slice(0, -1)); return; }
    let newPin = sPin + key;
    _setPin(newPin);
    let users = zSettings?.users || [];
    let pinLength = zSettings?.userPinStrength || 4;
    let userObj = users.find((u) => u.pin == newPin);
    if (!userObj) userObj = users.find((u) => u.alternatePin == newPin);
    if (!userObj) {
      if (newPin.length >= pinLength) setTimeout(() => _setPin(""), 400);
      return;
    }
    localStorageWrapper.setItem("standDevPin", newPin);
    useLoginStore.getState().setCurrentUser(userObj);
    useLoginStore.setState({ lastActionMillis: Infinity });
    _setShowPinModal(false);
    _setPin("");
    if (pendingActionRef.current) {
      pendingActionRef.current();
      pendingActionRef.current = null;
    }
  }

  //////////////////////////////////////////////////////////////////////////////
  // Render
  //////////////////////////////////////////////////////////////////////////////

  // Derive customer display info from real WO or pending customer
  let pendingCust = sPendingCustomer && sPendingCustomer !== "standalone" ? sPendingCustomer : null;
  let customerName = selectedWorkorder
    ? (capitalizeFirstLetterOfString(selectedWorkorder.customerFirst || "") +
       " " +
       capitalizeFirstLetterOfString(selectedWorkorder.customerLast || "")).trim()
    : pendingCust
      ? (capitalizeFirstLetterOfString(pendingCust.first || "") +
         " " +
         capitalizeFirstLetterOfString(pendingCust.last || "")).trim()
      : "";
  let customerCell = selectedWorkorder?.customerCell || pendingCust?.customerCell || "";
  let customerEmail = selectedWorkorder?.customerEmail || pendingCust?.email || "";

  let rs = resolveStatus(selectedWorkorder?.status, zSettings?.statuses);

  let lines = selectedWorkorder?.workorderLines || [];
  let selectedItemIDs = new Set(lines.map((ln) => ln.inventoryItem?.id).filter(Boolean));
  let totals = selectedWorkorder
    ? calculateRunningTotals(selectedWorkorder, zSettings?.salesTaxPercent || 0, [], false, !!selectedWorkorder?.taxFree)
    : { runningSubtotal: 0, runningDiscount: 0, runningTax: 0, finalTotal: 0 };

  return (
    <div id="stand-inactivity-root" style={{ display: "flex", flexDirection: "column", height: "100vh", maxHeight: "100vh", overflow: "hidden", backgroundColor: C.backgroundWhite, position: "relative" }}>
      <AlertBox showAlert={zShowAlert} />
      {/* Phone search modal (portal) */}
      {sShowPhoneSearch && (
        <PhoneSearchModal
          onSelect={handleCustomerSelect}
          onClose={() => _setShowPhoneSearch(false)}
        />
      )}

      {/* New workorder modal */}
      {sShowNewWorkorderModal && (
        <NewWorkorderModal
          onSelect={async (customerOrStandalone) => {
            _setSelectedWorkorderID(null);
            _setPendingCustomer(null);
            _setShowNewWorkorderModal(false);
            let customer = customerOrStandalone === "standalone" ? undefined : customerOrStandalone;
            let wo = await startNewWorkorder(customer);
            _setSelectedWorkorderID(wo.id);
            _setShowBikeInfoModal(true);
          }}
          onClose={() => _setShowNewWorkorderModal(false)}
        />
      )}

      {/* Bike info modal — shown after customer/standalone selection */}
      {sShowBikeInfoModal && selectedWorkorder && (() => {
        let modalKeypadMode = sDetailKeypadOverride || (sDetailField === "waitDays" ? "phone" : "alpha");
        return (
          <div className={styles.bmBackdrop}>
            <div className={styles.bmDialog} onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className={styles.bmHeader} style={{ borderBottomColor: C.borderSubtle }}>
                <div className={styles.bmHeaderInfo}>
                  <span className={styles.bmHeaderName} style={{ color: C.text }}>
                    {customerName || "Standalone Sale"}
                  </span>
                  {customerCell ? (
                    <span className={styles.bmHeaderPhone} style={{ color: C.textMuted }}>{formatPhoneWithDashes(customerCell)}</span>
                  ) : null}
                </div>
                <StatusPickerModal
                  statuses={(zSettings.statuses || []).filter((s) => !s.systemOwned && !s.hidden)}
                  enabled={true}
                  onSelect={handleStatusSelect}
                  buttonStyle={{
                    backgroundColor: rs.backgroundColor,
                    paddingTop: 15,
                    paddingBottom: 15,
                    paddingLeft: 18,
                    paddingRight: 18,
                    borderRadius: 12,
                    height: "auto",
                  }}
                  buttonTextStyle={{
                    color: rs.textColor,
                    fontWeight: "normal",
                    fontSize: 27,
                  }}
                  modalCoordY={45}
                  buttonText={rs.label}
                  itemHeight={69}
                  itemTextStyle={{ fontSize: 23 }}
                />
                <div style={{ display: "flex", flexDirection: "row", gap: 15 }}>
                <StandTouch
                  className={styles.bmCancelBtn}
                  style={{ backgroundColor: C.green }}
                  touchStart={false}
                  onPress={() => {
                    saveDetailOnLeave(sDetailField);
                    _setShowBikeInfoModal(false);
                    _setDetailField(null);
                  }}
                >
                  <Image icon={ICONS.close1} size={24} />
                  <span className={styles.bmCancelText} style={{ color: C.textWhite }}>Close</span>
                </StandTouch>
                <StandTouch
                  className={styles.bmCancelBtn}
                  style={{ backgroundColor: C.orange }}
                  touchStart={false}
                  onPress={() => {
                    let woID = sSelectedWorkorderID;
                    if (!woID) return;
                    useAlertScreenStore.getState().setValues({
                      title: "Delete Workorder?",
                      message: "This will permanently delete the workorder. This cannot be undone.",
                      btn1Text: "Delete",
                      btn2Text: "Cancel",
                      handleBtn1Press: () => {
                        useAlertScreenStore.getState().setShowAlert(false);
                        _setShowBikeInfoModal(false);
                        _setDetailField(null);
                        _setSelectedWorkorderID(null);
                        _setPendingCustomer(null);
                        useOpenWorkordersStore.getState().removeWorkorder(woID, true);
                      },
                      handleBtn2Press: () => useAlertScreenStore.getState().setShowAlert(false),
                      canExitOnOuterClick: true,
                    });
                  }}
                >
                  <Image icon={ICONS.trash} size={24} />
                  <span className={styles.bmCancelText} style={{ color: C.textWhite }}>Delete WO</span>
                </StandTouch>
                </div>
              </div>

              {/* Fields */}
              <div className={styles.bmScroll}>
                {anySuggestionsVisible && (
                  <div
                    className={styles.bmSuggestionDismiss}
                    onTouchStartCapture={(e) => { e.preventDefault(); e.stopPropagation(); _standTouchFired = true; _setSuggestionsHidden(true); }}
                    onClickCapture={(e) => { if (_standTouchFired) { _standTouchFired = false; e.stopPropagation(); return; } _setSuggestionsHidden(true); }}
                  />
                )}
                {/* Brand row */}
                <div className={styles.bmFieldLabel} style={{ color: C.textMuted }}>Brand</div>
                <div className={styles.bmFieldRow} style={{ zIndex: 12 }}>
                  <div className={styles.bmFieldHalf} style={{ zIndex: 10 }}>
                    <StandTouch onPress={() => activateDetailField("brand")}>
                      <div style={{ pointerEvents: "none" }}>
                        <TextInput
                          placeholder="Brand"
                          editable={false}
                          style={{
                            width: "100%",
                            borderWidth: sDetailField === "brand" ? 2 : 1,
                            borderColor: sDetailField === "brand" ? C.blue : selectedWorkorder?.brand ? "rgba(200, 228, 220, 0.25)" : C.buttonLightGreenOutline,
                            color: C.text,
                            paddingVertical: 12,
                            paddingHorizontal: 10,
                            fontSize: 32,
                            outlineStyle: "none",
                            borderRadius: 8,
                            fontWeight: (sDetailField === "brand" ? sDetailForm.brand : selectedWorkorder?.brand) ? "500" : null,
                            backgroundColor: sDetailField === "brand" ? lightenRGBByPercent(C.blue, 85) : undefined,
                          }}
                          value={sDetailField === "brand" ? capitalizeFirstLetterOfString(sDetailForm.brand) : capitalizeFirstLetterOfString(selectedWorkorder?.brand)}
                        />
                      </div>
                    </StandTouch>
                    {brandSuggestions.length > 0 && (
                      <div className={styles.bmSuggestionList} style={{ backgroundColor: C.listItemWhite, borderColor: C.buttonLightGreenOutline }}>
                        {brandSuggestions.map((item) => (
                          <div
                            key={item}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = C.surfaceAlt; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                            className={styles.bmSuggestionRow}
                          >
                            <StandTouch
                              className={styles.bmSuggestionItem}
                              onPress={() => {
                                useOpenWorkordersStore.getState().setField("brand", item, selectedWorkorder.id);
                                saveBrandToAllBrands(item);
                                _setDetailForm((prev) => ({ ...prev, brand: item }));
                                let idx = DETAIL_FIELDS.indexOf("brand");
                                let next = DETAIL_FIELDS[idx + 1];
                                if (next) { _setDetailField(next); _setDetailKeypadOverride(null); } else { _setDetailField(null); }
                              }}
                            >
                              <span className={styles.bmSuggestionItemText} style={{ color: C.text }}>{item}</span>
                            </StandTouch>
                            <StandTouch
                              className={styles.bmSuggestionRemove}
                              onPress={() => {
                                const updated = (zSettings.allBrands || []).filter((b) => b !== item);
                                useSettingsStore.getState().setField("allBrands", updated);
                              }}
                            >
                              <span className={styles.bmSuggestionRemoveText} style={{ color: C.textMuted }}>{"\u2715"}</span>
                            </StandTouch>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className={styles.bmFieldHalfRight}>
                    <div className={styles.bmDropdownSlot}>
                      <DropdownMenu
                        dataArr={zSettings.bikeBrands}
                        enabled={true}
                        onSelect={(item) => { useOpenWorkordersStore.getState().setField("brand", item, selectedWorkorder.id); saveBrandToAllBrands(item); }}
                        buttonStyle={{ opacity: selectedWorkorder?.brand ? DROPDOWN_SELECTED_OPACITY : 1, paddingVertical: 12 }}
                        buttonTextStyle={{ fontSize: 28 }}
                        itemTextStyle={{ fontSize: 32 }}
                        itemStyle={{ paddingVertical: 28, height: "auto" }}
                        buttonText={zSettings.bikeBrandsName}
                        modalCoordX={0}
                        centerMenuVertically={true}
                        centerOnClickX={true}
                        menuMaxHeight={window.innerHeight - 20}
                      />
                    </div>
                    <div className={styles.bmDropdownSlot}>
                      <DropdownMenu
                        dataArr={zSettings.bikeOptionalBrands}
                        enabled={true}
                        onSelect={(item) => { useOpenWorkordersStore.getState().setField("brand", item, selectedWorkorder.id); saveBrandToAllBrands(item); }}
                        buttonStyle={{ opacity: selectedWorkorder?.brand ? DROPDOWN_SELECTED_OPACITY : 1, paddingVertical: 12 }}
                        buttonTextStyle={{ fontSize: 28 }}
                        itemTextStyle={{ fontSize: 32 }}
                        itemStyle={{ paddingVertical: 28, height: "auto" }}
                        buttonText={zSettings.bikeOptionalBrandsName}
                        modalCoordX={0}
                        centerMenuVertically={true}
                        centerOnClickX={true}
                        menuMaxHeight={window.innerHeight - 20}
                      />
                    </div>
                  </div>
                </div>

                {/* Description row */}
                <div className={styles.bmFieldLabel} style={{ color: C.textMuted }}>Model / Description</div>
                <div className={styles.bmFieldRow} style={{ zIndex: 11 }}>
                  <div className={styles.bmFieldHalf} style={{ zIndex: 9 }}>
                    <StandTouch onPress={() => activateDetailField("description")}>
                      <div style={{ pointerEvents: "none" }}>
                        <TextInput
                          placeholder="Model/Description"
                          editable={false}
                          style={{
                            width: "100%",
                            borderWidth: sDetailField === "description" ? 2 : 1,
                            borderColor: sDetailField === "description" ? C.blue : selectedWorkorder?.description ? "rgba(200, 228, 220, 0.25)" : C.buttonLightGreenOutline,
                            color: C.text,
                            paddingVertical: 12,
                            paddingHorizontal: 10,
                            fontSize: 32,
                            outlineStyle: "none",
                            borderRadius: 8,
                            fontWeight: (sDetailField === "description" ? sDetailForm.description : selectedWorkorder?.description) ? "500" : null,
                            backgroundColor: sDetailField === "description" ? lightenRGBByPercent(C.blue, 85) : undefined,
                          }}
                          value={sDetailField === "description" ? capitalizeFirstLetterOfString(sDetailForm.description) : capitalizeFirstLetterOfString(selectedWorkorder?.description)}
                        />
                      </div>
                    </StandTouch>
                    {descSuggestions.length > 0 && (
                      <div className={styles.bmSuggestionList} style={{ backgroundColor: C.listItemWhite, borderColor: C.buttonLightGreenOutline }}>
                        {descSuggestions.map((item) => (
                          <div
                            key={item}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = C.surfaceAlt; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                            className={styles.bmSuggestionRow}
                          >
                            <StandTouch
                              className={styles.bmSuggestionItem}
                              onPress={() => {
                                useOpenWorkordersStore.getState().setField("description", item, selectedWorkorder.id);
                                saveDescToAllDescriptions(item);
                                _setDetailForm((prev) => ({ ...prev, description: item }));
                                let idx = DETAIL_FIELDS.indexOf("description");
                                let next = DETAIL_FIELDS[idx + 1];
                                if (next) { _setDetailField(next); _setDetailKeypadOverride(null); } else { _setDetailField(null); }
                              }}
                            >
                              <span className={styles.bmSuggestionItemText} style={{ color: C.text }}>{item}</span>
                            </StandTouch>
                            <StandTouch
                              className={styles.bmSuggestionRemove}
                              onPress={() => {
                                const updated = (zSettings.allDescriptions || []).filter((d) => d !== item);
                                useSettingsStore.getState().setField("allDescriptions", updated);
                              }}
                            >
                              <span className={styles.bmSuggestionRemoveText} style={{ color: C.textMuted }}>{"\u2715"}</span>
                            </StandTouch>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ width: "50%", paddingLeft: 8, flexShrink: 0 }}>
                    <DropdownMenu
                      dataArr={zSettings.bikeDescriptions}
                      enabled={true}
                      onSelect={(item) => { useOpenWorkordersStore.getState().setField("description", item, selectedWorkorder.id); saveDescToAllDescriptions(item); }}
                      buttonStyle={{ opacity: selectedWorkorder?.description ? DROPDOWN_SELECTED_OPACITY : 1, paddingVertical: 12 }}
                      buttonTextStyle={{ fontSize: 28 }}
                      itemTextStyle={{ fontSize: 32 }}
                      itemStyle={{ paddingVertical: 28, height: "auto" }}
                      buttonText="Descriptions"
                      modalCoordX={0}
                      centerMenuVertically={true}
                      centerOnClickX={true}
                      menuMaxHeight={window.innerHeight - 20}
                    />
                  </div>
                </div>

                {/* Color row */}
                <div className={styles.bmFieldLabel} style={{ color: C.textMuted }}>Colors</div>
                <div className={styles.bmFieldRow} style={{ zIndex: 10 }}>
                  <div style={{ width: "50%", display: "flex", flexDirection: "row", alignItems: "center", overflow: "visible", flexShrink: 0 }}>
                    <div style={{ width: "48%", position: "relative", zIndex: 8, overflow: "visible", flexShrink: 0 }}>
                      <StandTouch onPress={() => activateDetailField("color1")}>
                        <div style={{ pointerEvents: "none" }}>
                          <TextInput
                            placeholder="Color 1"
                            editable={false}
                            style={{
                              width: "100%",
                              borderWidth: sDetailField === "color1" ? 2 : 1,
                              borderColor: sDetailField === "color1" ? C.blue : selectedWorkorder?.color1?.label ? "rgba(200, 228, 220, 0.25)" : C.buttonLightGreenOutline,
                              paddingVertical: 12,
                              paddingHorizontal: 10,
                              fontSize: 32,
                              outlineStyle: "none",
                              borderRadius: 8,
                              fontWeight: (sDetailField === "color1" ? sDetailForm.color1 : selectedWorkorder?.color1?.label) ? "500" : null,
                              backgroundColor: sDetailField === "color1" ? lightenRGBByPercent(C.blue, 85) : selectedWorkorder?.color1?.backgroundColor,
                              color: selectedWorkorder?.color1?.textColor || C.text,
                            }}
                            value={sDetailField === "color1" ? capitalizeFirstLetterOfString(sDetailForm.color1) : capitalizeFirstLetterOfString(selectedWorkorder?.color1?.label)}
                          />
                        </div>
                      </StandTouch>
                      {color1Suggestions.length > 0 && (
                        <div className={styles.bmSuggestionList} style={{ backgroundColor: C.listItemWhite, borderColor: C.buttonLightGreenOutline }}>
                          {color1Suggestions.map((item) => (
                            <div
                              key={item}
                              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = C.surfaceAlt; }}
                              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                              className={styles.bmSuggestionRow}
                            >
                              <StandTouch
                                className={styles.bmSuggestionItem}
                                onPress={() => {
                                  setBikeColor(item, "color1");
                                  _setDetailForm((prev) => ({ ...prev, color1: item }));
                                  let idx = DETAIL_FIELDS.indexOf("color1");
                                  let next = DETAIL_FIELDS[idx + 1];
                                  if (next) { _setDetailField(next); _setDetailKeypadOverride(null); } else { _setDetailField(null); }
                                }}
                              >
                                <span className={styles.bmSuggestionItemText} style={{ color: C.text }}>{item}</span>
                              </StandTouch>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ width: "4%", flexShrink: 0 }} />
                    <div style={{ width: "48%", position: "relative", zIndex: 7, overflow: "visible", flexShrink: 0 }}>
                      <StandTouch onPress={() => activateDetailField("color2")}>
                        <div style={{ pointerEvents: "none" }}>
                          <TextInput
                            placeholder="Color 2"
                            editable={false}
                            style={{
                              width: "100%",
                              borderWidth: sDetailField === "color2" ? 2 : 1,
                              borderColor: sDetailField === "color2" ? C.blue : selectedWorkorder?.color2?.label ? "rgba(200, 228, 220, 0.25)" : C.buttonLightGreenOutline,
                              paddingVertical: 12,
                              paddingHorizontal: 10,
                              fontSize: 32,
                              outlineStyle: "none",
                              borderRadius: 8,
                              fontWeight: (sDetailField === "color2" ? sDetailForm.color2 : selectedWorkorder?.color2?.label) ? "500" : null,
                              backgroundColor: sDetailField === "color2" ? lightenRGBByPercent(C.blue, 85) : selectedWorkorder?.color2?.backgroundColor,
                              color: selectedWorkorder?.color2?.textColor || C.text,
                            }}
                            value={sDetailField === "color2" ? capitalizeFirstLetterOfString(sDetailForm.color2) : capitalizeFirstLetterOfString(selectedWorkorder?.color2?.label)}
                          />
                        </div>
                      </StandTouch>
                      {color2Suggestions.length > 0 && (
                        <div className={styles.bmSuggestionList} style={{ backgroundColor: C.listItemWhite, borderColor: C.buttonLightGreenOutline }}>
                          {color2Suggestions.map((item) => (
                            <div
                              key={item}
                              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = C.surfaceAlt; }}
                              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                              className={styles.bmSuggestionRow}
                            >
                              <StandTouch
                                className={styles.bmSuggestionItem}
                                onPress={() => {
                                  setBikeColor(item, "color2");
                                  _setDetailForm((prev) => ({ ...prev, color2: item }));
                                  _setDetailField(null);
                                }}
                              >
                                <span className={styles.bmSuggestionItemText} style={{ color: C.text }}>{item}</span>
                              </StandTouch>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className={styles.bmFieldHalfRight}>
                    <div className={styles.bmDropdownSlot} style={{ display: "flex", justifyContent: "center" }}>
                      <DropdownMenu
                        itemSeparatorStyle={{ height: 0 }}
                        dataArr={COLORS}
                        menuBorderColor="transparent"
                        enabled={true}
                        onSelect={(item) => useOpenWorkordersStore.getState().setField("color1", item, selectedWorkorder.id)}
                        buttonStyle={{ opacity: selectedWorkorder?.color1?.label ? DROPDOWN_SELECTED_OPACITY : 1, paddingVertical: 12 }}
                        buttonTextStyle={{ fontSize: 28 }}
                        itemTextStyle={{ fontSize: 32 }}
                        itemStyle={{ paddingVertical: 28, height: "auto" }}
                        menuMaxHeight={window.innerHeight - 20}
                        centerMenuVertically={true}
                        centerOnClickX={true}
                        buttonText="Color 1"
                        modalCoordX={0}
                      />
                    </div>
                    <div className={styles.bmDropdownSlot} style={{ display: "flex", justifyContent: "center" }}>
                      <DropdownMenu
                        itemSeparatorStyle={{ height: 0 }}
                        dataArr={COLORS}
                        enabled={true}
                        onSelect={(item) => useOpenWorkordersStore.getState().setField("color2", item, selectedWorkorder.id)}
                        modalCoordX={0}
                        buttonStyle={{ opacity: selectedWorkorder?.color2?.label ? DROPDOWN_SELECTED_OPACITY : 1, paddingVertical: 12 }}
                        buttonTextStyle={{ fontSize: 28 }}
                        itemTextStyle={{ fontSize: 32 }}
                        itemStyle={{ paddingVertical: 28, height: "auto" }}
                        menuMaxHeight={window.innerHeight - 20}
                        centerMenuVertically={true}
                        centerOnClickX={true}
                        buttonText="Color 2"
                      />
                    </div>
                  </div>
                </div>

                {/* Wait time row */}
                <div className={styles.bmFieldLabel} style={{ color: C.textMuted }}>Wait Time</div>
                <div className={styles.bmWaitRow}>
                  <div className={styles.bmWaitLeft}>
                    <span className={styles.bmWaitDaysLabel} style={{ color: C.textMuted }}>Max wait days:</span>
                    <StandTouch onPress={() => activateDetailField("waitDays")}>
                      <div style={{ pointerEvents: "none" }}>
                        <TextInput
                          placeholder="0"
                          editable={false}
                          style={{
                            width: 70,
                            borderWidth: sDetailField === "waitDays" ? 2 : 1,
                            borderColor: sDetailField === "waitDays" ? C.blue : selectedWorkorder?.waitTime?.label ? "rgba(200, 228, 220, 0.25)" : C.buttonLightGreenOutline,
                            color: C.text,
                            paddingVertical: 12,
                            paddingHorizontal: 8,
                            fontSize: 32,
                            outlineStyle: "none",
                            borderRadius: 8,
                            textAlign: "center",
                            fontWeight: (sDetailField === "waitDays" ? sDetailForm.waitDays : (selectedWorkorder?.waitTime?.maxWaitTimeDays != null && selectedWorkorder?.waitTime?.maxWaitTimeDays !== "")) ? "500" : null,
                            backgroundColor: sDetailField === "waitDays" ? lightenRGBByPercent(C.blue, 85) : undefined,
                          }}
                          value={sDetailField === "waitDays" ? sDetailForm.waitDays : String(selectedWorkorder?.waitTime?.maxWaitTimeDays ?? "")}
                        />
                      </div>
                    </StandTouch>
                    <StandTouch
                      style={{ marginLeft: 10, opacity: (!selectedWorkorder?.waitTime?.maxWaitTimeDays || Number(selectedWorkorder?.waitTime?.maxWaitTimeDays) <= 1) ? 0.3 : 1 }}
                      onPress={() => {
                        let current = Number(selectedWorkorder?.waitTime?.maxWaitTimeDays) || 0;
                        if (current <= 1) return;
                        let newDays = current - 1;
                        let woID = selectedWorkorder.id;
                        let allWaits = (zSettings.waitTimes || []).filter((w) => w.maxWaitTimeDays > 0);
                        let match = allWaits.reduce((best, w) => (!best || Math.abs(w.maxWaitTimeDays - newDays) < Math.abs(best.maxWaitTimeDays - newDays)) ? w : best, null);
                        let waitObj = match ? { ...match, maxWaitTimeDays: newDays } : { ...(selectedWorkorder?.waitTime || {}), maxWaitTimeDays: newDays };
                        useOpenWorkordersStore.getState().setField("waitTime", waitObj, woID, false);
                        clearTimeout(waitDaysDebounceRef.current);
                        waitDaysDebounceRef.current = setTimeout(() => {
                          let wo = useOpenWorkordersStore.getState().getWorkorders().find((w) => w.id === woID);
                          if (wo) useOpenWorkordersStore.getState().setField("waitTime", wo.waitTime, woID, true);
                        }, 500);
                      }}
                    >
                      <Image icon={ICONS.minus} size={36} />
                    </StandTouch>
                    <StandTouch
                      style={{ marginLeft: 6 }}
                      onPress={() => {
                        let current = Number(selectedWorkorder?.waitTime?.maxWaitTimeDays) || 0;
                        let newDays = current + 1;
                        let woID = selectedWorkorder.id;
                        let allWaits = (zSettings.waitTimes || []).filter((w) => w.maxWaitTimeDays > 0);
                        let match = allWaits.reduce((best, w) => (!best || Math.abs(w.maxWaitTimeDays - newDays) < Math.abs(best.maxWaitTimeDays - newDays)) ? w : best, null);
                        let waitObj = match ? { ...match, maxWaitTimeDays: newDays } : { ...(selectedWorkorder?.waitTime || {}), maxWaitTimeDays: newDays };
                        useOpenWorkordersStore.getState().setField("waitTime", waitObj, woID, false);
                        clearTimeout(waitDaysDebounceRef.current);
                        waitDaysDebounceRef.current = setTimeout(() => {
                          let wo = useOpenWorkordersStore.getState().getWorkorders().find((w) => w.id === woID);
                          if (wo) useOpenWorkordersStore.getState().setField("waitTime", wo.waitTime, woID, true);
                        }, 500);
                      }}
                    >
                      <Image icon={ICONS.add} size={36} />
                    </StandTouch>
                  </div>
                  <div className={styles.bmWaitDropdownSlot}>
                    <DropdownMenu
                      modalCoordX={0}
                      dataArr={zSettings.waitTimes}
                      enabled={true}
                      onSelect={(item) => {
                        let isNonRemovable = NONREMOVABLE_WAIT_TIMES.some((nr) => nr.id === item.id);
                        let waitObj = { ...item, removable: !isNonRemovable };
                        useOpenWorkordersStore.getState().setField("waitTime", waitObj, selectedWorkorder.id);
                      }}
                      buttonStyle={{ opacity: selectedWorkorder?.waitTime?.label ? DROPDOWN_SELECTED_OPACITY : 1, paddingVertical: 12 }}
                      buttonTextStyle={{ fontSize: 28 }}
                      itemTextStyle={{ fontSize: 32 }}
                      itemStyle={{ paddingVertical: 28, height: "auto" }}
                      buttonText="Wait Times"
                      centerMenuVertically={true}
                      centerOnClickX={true}
                      menuMaxHeight={window.innerHeight - 20}
                    />
                  </div>
                </div>

                {/* Wait estimate label */}
                {(() => {
                  let estimateLabel = calculateWaitEstimateLabel(selectedWorkorder, zSettings);
                  let isMissing = estimateLabel === "Missing estimate" || estimateLabel === "No estimate";
                  return estimateLabel ? (
                    <span className={styles.bmWaitEstimate} style={{ color: isMissing ? C.red : C.textMuted, display: "block" }}>
                      {estimateLabel}
                    </span>
                  ) : null;
                })()}

              </div>

              {/* Keypad — always docked above the footer */}
              <div className={styles.bmKeypadWrap}>
                <StandKeypad
                  mode={modalKeypadMode}
                  onKeyPress={handleDetailKeyPress}
                  toggleLabel={modalKeypadMode === "phone" ? "ABC" : "123"}
                  onToggle={() => _setDetailKeypadOverride(modalKeypadMode === "phone" ? "alpha" : "phone")}
                />
                {sDetailField !== null && (
                  <div className={styles.bmKeypadCloseRow}>
                    <StandTouch className={styles.bmKeypadCloseBtn} onPress={() => { saveDetailOnLeave(sDetailField); _setDetailField(null); }}>
                      <Image icon={ICONS.close1} size={36} />
                    </StandTouch>
                  </div>
                )}
              </div>

              {/* Footer — Add Items button */}
              {(() => {
                let hasBrand = !!(selectedWorkorder?.brand);
                return (
                  <div className={styles.bmFooter} style={{ borderTopColor: C.borderSubtle }}>
                    <StandTouch
                      className={styles.bmAddItemsBtn}
                      style={{ backgroundColor: hasBrand ? C.green : C.surfaceAlt }}
                      onPress={() => { if (!hasBrand) return; saveDetailOnLeave(sDetailField); _setShowBikeInfoModal(false); _setDetailField(null); }}
                    >
                      <Image icon={ICONS.gears1} size={36} />
                      <span className={styles.bmAddItemsText} style={{ color: hasBrand ? C.textWhite : C.textMuted }}>Back to Workorder</span>
                    </StandTouch>
                  </div>
                );
              })()}
            </div>
          </div>
        );
      })()}

      {/* Customer info view-only modal (portal) */}
      {sShowCustomerModal && sSelectedCustomer && (
        <CustomerInfoViewModal
          customer={sSelectedCustomer}
          onClose={() => _setShowCustomerModal(false)}
        />
      )}

      {/* Inventory search modal */}
      {sShowInventoryModal && (
        <InventorySearchModal
          onAddItems={handleAddInventoryItems}
          onClose={() => _setShowInventoryModal(false)}
        />
      )}

      {/* Custom labor/item modal */}
      {sCustomItemModal && (
        <StandCustomItemModal
          type={sCustomItemModal}
          editLine={sEditingLine}
          onSave={(lineItem) => {
            if (sEditingLine) {
              let updatedLines = (selectedWorkorder?.workorderLines || []).map((ln) =>
                ln.id === sEditingLine.id ? { ...lineItem, id: sEditingLine.id } : ln
              );
              useOpenWorkordersStore.getState().setField("workorderLines", updatedLines, sSelectedWorkorderID, true);
              _setEditingLine(null);
            } else {
              handleCustomItemSave(lineItem);
            }
          }}
          onClose={() => { _setCustomItemModal(null); _setEditingLine(null); }}
        />
      )}

      {/* Workorder list modal */}
      {sShowWorkorderList && (
        <WorkorderListModal
          onSelect={(wo) => {
            _setSelectedWorkorderID(wo.id);
            _setPendingCustomer(null);
            _setShowBikeDetails(false);
            _setDetailField(null);
            _setShowWorkorderList(false);
          }}
          onClose={() => _setShowWorkorderList(false)}
          onNewWorkorder={() => { _setShowWorkorderList(false); handleNewWorkorderPress(); }}
          activeWorkorderID={sSelectedWorkorderID}
        />
      )}

      {/* Stand settings modal */}
      {sShowStandSettings && (
        <div className={styles.standModalBackdrop} style={{ zIndex: Z.modal }}>
          <div className={styles.standSettingsDialog}>
            <StandTouch touchStart={false} onPress={() => _setShowStandSettings(false)}>
              <div className={styles.standSettingsHeader} style={{ borderBottomColor: C.borderSubtle }}>
                <span className={styles.standSettingsHeaderTitle} style={{ color: C.text }}>Stand Settings</span>
                <span className={styles.standSettingsHeaderHint} style={{ color: C.textDisabled }}>Tap to close</span>
              </div>
            </StandTouch>
            <div className={styles.standSettingsBody}>
              <div className={styles.standSettingsSectionLabel} style={{ color: C.textMuted }}>LOGIN</div>
              <StandTouch onPress={() => {
                  let next = !sBypassFaceRecognition;
                  _setBypassFaceRecognition(next);
                  localStorageWrapper.setItem("standBypassFaceRecognition", String(next));
                }}
                className={styles.standSettingsToggleRow}
                style={{ borderColor: C.buttonLightGreenOutline, backgroundColor: C.listItemWhite }}
              >
                <CheckBox
                  isChecked={sBypassFaceRecognition}
                  onCheck={() => {
                    let next = !sBypassFaceRecognition;
                    _setBypassFaceRecognition(next);
                    localStorageWrapper.setItem("standBypassFaceRecognition", String(next));
                  }}
                />
                <div className={styles.standSettingsToggleTextCol}>
                  <span className={styles.standSettingsToggleTitle} style={{ color: C.text }}>Bypass facial recognition</span>
                  <span className={styles.standSettingsToggleSubtitle} style={{ color: C.textMuted }}>Skip face scan and go straight to PIN entry on this device</span>
                </div>
              </StandTouch>
            </div>
          </div>
        </div>
      )}

      {/* Face recognition modal */}
      {sShowFaceModal && (
        <div className={styles.standModalBackdropStrong} style={{ zIndex: 200 }}>
          <div className={styles.standFaceDialog}>
            <SmallLoadingIndicator />
            <span className={styles.standFaceTitle} style={{ color: C.text }}>
              Scanning face...
            </span>
            <span className={styles.standFaceCountdown} style={{ color: C.green }}>
              {sFaceCountdown}
            </span>
            <StandTouch
              onPress={() => {
                stopFaceLogin();
                _setShowFaceModal(false);
                _setShowPinModal(true);
              }}
              className={styles.standFacePinBtn}
              style={{ backgroundColor: C.surfaceAlt }}
            >
              <span className={styles.standFacePinBtnText} style={{ color: C.text }}>Use PIN</span>
            </StandTouch>
          </div>
          <video
            ref={faceVideoRef}
            width={0}
            height={0}
            autoPlay
            muted
            onLoadedMetadata={(e) => e.target.play()}
            style={{ position: "absolute", opacity: 0 }}
          />
        </div>
      )}

      {/* Pin login modal */}
      {sShowPinModal && (
        <div className={styles.standModalBackdropStrong} style={{ zIndex: 200 }}>
          <div className={styles.standPinDialog}>
            <span className={styles.standPinTitle} style={{ color: C.text }}>
              Enter PIN
            </span>
            <div className={styles.standPinDotRow}>
              {Array.from({ length: zSettings?.userPinStrength || 4 }).map((_, i) => {
                const isFilled = i < sPin.length;
                const isCursor = i === sPin.length;
                return (
                  <div
                    key={i}
                    className={styles.standPinDot}
                    style={{
                      borderColor: isCursor ? C.cursorRed : isFilled ? "#007bff" : "#ddd",
                      backgroundColor: isCursor ? C.cursorRed : isFilled ? "#fff" : "#f8f9fa",
                      boxShadow: isCursor ? "0 0 10px rgba(255, 107, 107, 0.5)" : "none",
                    }}
                  >
                    {isFilled && (
                      <div className={styles.standPinDotFilled} style={{ backgroundColor: C.text }} />
                    )}
                  </div>
                );
              })}
            </div>
            <StandKeypad mode="phone" onKeyPress={handleStandPinKeyPress} fontSizeAdj={7} paddingAdj={42} />
            <StandTouch
              onPress={() => { _setShowPinModal(false); _setPin(""); pendingActionRef.current = null; }}
              className={styles.standPinCancel}
            >
              <span className={styles.standPinCancelText} style={{ color: C.textMuted }}>Cancel</span>
            </StandTouch>
          </div>
        </div>
      )}

      {sViewMode === "buttons" ? (
        <div className={styles.bvOuter}>
          {/* ── Header: "Add Customer" button when no WO/pending, full header when ready ── */}
          {!hasWorkorderReady ? (
            <div className={styles.bvSpacer1} />
          ) : (
            <div>
              {/* Header row: customer info + status + show/hide toggle */}
              <StandTouch onPress={() => { _setShowBikeInfoModal(true); }} className={styles.bvHeader}>
                <div className={styles.bvHeaderLeft}>
                  <span className={styles.bvHeaderName} style={{ color: C.text }}>
                    {customerName || "Standalone Sale"}
                  </span>
                  {customerCell ? (
                    <span className={styles.bvHeaderPhone} style={{ color: C.textMuted }}>
                      {formatPhoneWithDashes(customerCell)}
                    </span>
                  ) : null}
                </div>
                {selectedWorkorder && (
                  <div className={styles.bvStatusWrap} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
                    <StatusPickerModal
                      statuses={(zSettings.statuses || []).filter((s) => !s.systemOwned && !s.hidden)}
                      enabled={true}
                      onSelect={handleStatusSelect}
                      buttonStyle={{
                        backgroundColor: rs.backgroundColor,
                        paddingTop: 5,
                        paddingBottom: 5,
                        paddingLeft: 18,
                        paddingRight: 18,
                        height: "auto",
                      }}
                      buttonTextStyle={{
                        color: rs.textColor,
                        fontWeight: "normal",
                        fontSize: 27,
                      }}
                      modalCoordY={45}
                      buttonText={rs.label}
                      itemHeight={69}
                      itemTextStyle={{ fontSize: 23 }}
                    />
                  </div>
                )}
                <div className={styles.bvHeaderRight}>
                  {selectedWorkorder?.brand ? (
                    <span className={styles.bvHeaderBrand} style={{ color: C.textMuted }}>
                      {capitalizeFirstLetterOfString(selectedWorkorder.brand)}
                    </span>
                  ) : null}
                  {selectedWorkorder?.description ? (
                    <span className={styles.bvHeaderDescription} style={{ color: C.textMuted }}>
                      {capitalizeFirstLetterOfString(selectedWorkorder.description)}
                    </span>
                  ) : null}
                  <Image icon={ICONS.info} size={39} />
                  <span className={styles.bvHeaderHint} style={{ color: C.textDisabled }}>Tap for workorder info</span>
                </div>
              </StandTouch>

              {/* Collapsible bike details panel */}
              {sShowBikeDetails && selectedWorkorder && (
                <div className={styles.bvDetailsPanel} style={{ borderBottomColor: C.borderSubtle }}>

                  {/* Brand row */}
                  <div className={styles.bvFieldRow}>
                    <StandTouch onPress={() => activateDetailField("brand")} className={styles.bvFieldHalf}>
                      <div style={{ pointerEvents: "none" }}>
                        <TextInput
                          placeholder={"Brand"}
                          editable={false}
                          style={{
                            width: "100%",
                            borderWidth: sDetailField === "brand" ? 2 : 1,
                            borderColor: sDetailField === "brand" ? C.blue : selectedWorkorder?.brand ? "rgba(200, 228, 220, 0.25)" : C.buttonLightGreenOutline,
                            color: C.text,
                            paddingVertical: 7,
                            paddingHorizontal: 4,
                            fontSize: 26,
                            outlineStyle: "none",
                            borderRadius: 5,
                            fontWeight: (sDetailField === "brand" ? sDetailForm.brand : selectedWorkorder?.brand) ? "500" : null,
                            backgroundColor: sDetailField === "brand" ? lightenRGBByPercent(C.blue, 85) : undefined,
                          }}
                          value={sDetailField === "brand" ? capitalizeFirstLetterOfString(sDetailForm.brand) : capitalizeFirstLetterOfString(selectedWorkorder?.brand)}
                        />
                      </div>
                    </StandTouch>
                    <div className={styles.bvFieldHalfRow}>
                      <div className={styles.bvFieldDropdownSlot48}>
                        <DropdownMenu
                          dataArr={zSettings.bikeBrands}
                          enabled={true}
                          onSelect={(item) => {
                            useOpenWorkordersStore.getState().setField("brand", item, selectedWorkorder.id);
                          }}
                          buttonStyle={{ opacity: selectedWorkorder?.brand ? DROPDOWN_SELECTED_OPACITY : 1, paddingVertical: 7 }}
                          buttonTextStyle={{ fontSize: 24 }}
                          itemTextStyle={{ fontSize: 29 }}
                          itemStyle={{ paddingVertical: 25, height: "auto" }}
                          modalCoordX={-6}
                          ref={bikeBrandsRef}
                          buttonText={zSettings.bikeBrandsName}
                        />
                      </div>
                      <div className={styles.bvFieldGap5} />
                      <div className={styles.bvFieldDropdownSlot48}>
                        <DropdownMenu
                          dataArr={zSettings.bikeOptionalBrands}
                          enabled={true}
                          onSelect={(item) => {
                            useOpenWorkordersStore.getState().setField("brand", item, selectedWorkorder.id);
                          }}
                          buttonStyle={{ opacity: selectedWorkorder?.brand ? DROPDOWN_SELECTED_OPACITY : 1, paddingVertical: 7 }}
                          buttonTextStyle={{ fontSize: 24 }}
                          itemTextStyle={{ fontSize: 29 }}
                          itemStyle={{ paddingVertical: 25, height: "auto" }}
                          modalCoordX={0}
                          ref={bikeOptBrandsRef}
                          buttonText={zSettings.bikeOptionalBrandsName}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Description row */}
                  <div className={styles.bvFieldRow}>
                    <StandTouch onPress={() => activateDetailField("description")} className={styles.bvFieldHalf}>
                      <div style={{ pointerEvents: "none" }}>
                        <TextInput
                          placeholder={"Model/Description"}
                          editable={false}
                          style={{
                            width: "100%",
                            borderWidth: sDetailField === "description" ? 2 : 1,
                            borderColor: sDetailField === "description" ? C.blue : selectedWorkorder?.description ? "rgba(200, 228, 220, 0.25)" : C.buttonLightGreenOutline,
                            color: C.text,
                            paddingVertical: 7,
                            paddingHorizontal: 4,
                            fontSize: 26,
                            outlineStyle: "none",
                            borderRadius: 5,
                            fontWeight: (sDetailField === "description" ? sDetailForm.description : selectedWorkorder?.description) ? "500" : null,
                            backgroundColor: sDetailField === "description" ? lightenRGBByPercent(C.blue, 85) : undefined,
                          }}
                          value={sDetailField === "description" ? capitalizeFirstLetterOfString(sDetailForm.description) : capitalizeFirstLetterOfString(selectedWorkorder?.description)}
                        />
                      </div>
                    </StandTouch>
                    <div className={styles.bvFieldHalfRowCenter}>
                      <div className={styles.bvFieldDropdownSlotFull}>
                        <DropdownMenu
                          modalCoordX={55}
                          dataArr={zSettings.bikeDescriptions}
                          enabled={true}
                          onSelect={(item) => {
                            useOpenWorkordersStore.getState().setField("description", item, selectedWorkorder.id);
                          }}
                          buttonStyle={{ opacity: selectedWorkorder?.description ? DROPDOWN_SELECTED_OPACITY : 1, paddingVertical: 7 }}
                          buttonTextStyle={{ fontSize: 24 }}
                          itemTextStyle={{ fontSize: 29 }}
                          itemStyle={{ paddingVertical: 25, height: "auto" }}
                          ref={descriptionRef}
                          buttonText={"Descriptions"}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Color row */}
                  <div className={styles.bvFieldRow}>
                    <div className={styles.bvColorHalf}>
                      <StandTouch onPress={() => activateDetailField("color1")} className={styles.bvColorInput48}>
                        <div style={{ pointerEvents: "none" }}>
                          <TextInput
                            placeholder={"Color 1"}
                            editable={false}
                            style={{
                              width: "100%",
                              borderWidth: sDetailField === "color1" ? 2 : 1,
                              borderColor: sDetailField === "color1" ? C.blue : selectedWorkorder?.color1?.label ? "rgba(200, 228, 220, 0.25)" : C.buttonLightGreenOutline,
                              paddingVertical: 7,
                              paddingHorizontal: 4,
                              fontSize: 26,
                              outlineStyle: "none",
                              borderRadius: 5,
                              fontWeight: (sDetailField === "color1" ? sDetailForm.color1 : selectedWorkorder?.color1?.label) ? "500" : null,
                              backgroundColor: sDetailField === "color1" ? lightenRGBByPercent(C.blue, 85) : selectedWorkorder?.color1?.backgroundColor,
                              color: selectedWorkorder?.color1?.textColor || C.text,
                            }}
                            value={sDetailField === "color1" ? capitalizeFirstLetterOfString(sDetailForm.color1) : capitalizeFirstLetterOfString(selectedWorkorder?.color1?.label)}
                          />
                        </div>
                      </StandTouch>
                      <div className={styles.bvFieldGap4pct} />
                      <StandTouch onPress={() => activateDetailField("color2")} className={styles.bvColorInput48}>
                        <div style={{ pointerEvents: "none" }}>
                          <TextInput
                            placeholder={"Color 2"}
                            editable={false}
                            style={{
                              width: "100%",
                              borderWidth: sDetailField === "color2" ? 2 : 1,
                              borderColor: sDetailField === "color2" ? C.blue : selectedWorkorder?.color2?.label ? "rgba(200, 228, 220, 0.25)" : C.buttonLightGreenOutline,
                              paddingVertical: 7,
                              paddingHorizontal: 4,
                              fontSize: 26,
                              outlineStyle: "none",
                              borderRadius: 5,
                              fontWeight: (sDetailField === "color2" ? sDetailForm.color2 : selectedWorkorder?.color2?.label) ? "500" : null,
                              backgroundColor: sDetailField === "color2" ? lightenRGBByPercent(C.blue, 85) : selectedWorkorder?.color2?.backgroundColor,
                              color: selectedWorkorder?.color2?.textColor || C.text,
                            }}
                            value={sDetailField === "color2" ? capitalizeFirstLetterOfString(sDetailForm.color2) : capitalizeFirstLetterOfString(selectedWorkorder?.color2?.label)}
                          />
                        </div>
                      </StandTouch>
                    </div>
                    <div className={styles.bvFieldHalfRow}>
                      <div className={styles.bvFieldDropdownSlot48}>
                        <DropdownMenu
                          itemSeparatorStyle={{ height: 0 }}
                          dataArr={COLORS}
                          menuBorderColor={"transparent"}
                          enabled={true}
                          onSelect={(item) => {
                            useOpenWorkordersStore.getState().setField("color1", item, selectedWorkorder.id);
                          }}
                          buttonStyle={{ opacity: selectedWorkorder?.color1?.label ? DROPDOWN_SELECTED_OPACITY : 1, paddingVertical: 7 }}
                          buttonTextStyle={{ fontSize: 24 }}
                          itemTextStyle={{ fontSize: 29 }}
                          itemStyle={{ paddingVertical: 25, height: "auto" }}
                          menuMaxHeight={window.innerHeight - 10}
                          centerMenuVertically={true}
                          ref={color1Ref}
                          buttonText={"Color 1"}
                          modalCoordX={0}
                        />
                      </div>
                      <div className={styles.bvFieldGap5} />
                      <div className={styles.bvFieldDropdownSlot48}>
                        <DropdownMenu
                          itemSeparatorStyle={{ height: 0 }}
                          dataArr={COLORS}
                          enabled={true}
                          onSelect={(item) => {
                            useOpenWorkordersStore.getState().setField("color2", item, selectedWorkorder.id);
                          }}
                          modalCoordX={0}
                          buttonStyle={{ opacity: selectedWorkorder?.color2?.label ? DROPDOWN_SELECTED_OPACITY : 1, paddingVertical: 7 }}
                          buttonTextStyle={{ fontSize: 24 }}
                          itemTextStyle={{ fontSize: 29 }}
                          itemStyle={{ paddingVertical: 25, height: "auto" }}
                          menuMaxHeight={window.innerHeight - 10}
                          centerMenuVertically={true}
                          ref={color2Ref}
                          buttonText={"Color 2"}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Wait time row */}
                  <div className={styles.bvFieldRowTight}>
                    <div className={styles.bvWaitHalf}>
                      <span className={styles.bvWaitLabel} style={{ color: C.textMuted }}>
                        Max wait days:
                      </span>
                      <StandTouch onPress={() => activateDetailField("waitDays")}>
                        <div style={{ pointerEvents: "none" }}>
                          <TextInput
                            placeholder={"0"}
                            editable={false}
                            style={{
                              width: 50,
                              borderWidth: sDetailField === "waitDays" ? 2 : 1,
                              borderColor: sDetailField === "waitDays" ? C.blue : selectedWorkorder?.waitTime?.label ? "rgba(200, 228, 220, 0.25)" : C.buttonLightGreenOutline,
                              color: C.text,
                              paddingVertical: 7,
                              paddingHorizontal: 4,
                              fontSize: 26,
                              outlineStyle: "none",
                              borderRadius: 5,
                              textAlign: "center",
                              fontWeight: (sDetailField === "waitDays" ? sDetailForm.waitDays : (selectedWorkorder?.waitTime?.maxWaitTimeDays != null && selectedWorkorder?.waitTime?.maxWaitTimeDays !== "")) ? "500" : null,
                              backgroundColor: sDetailField === "waitDays" ? lightenRGBByPercent(C.blue, 85) : undefined,
                            }}
                            value={sDetailField === "waitDays" ? sDetailForm.waitDays : String(selectedWorkorder?.waitTime?.maxWaitTimeDays ?? "")}
                          />
                        </div>
                      </StandTouch>
                      <StandTouch
                        onPress={() => {
                          let current = Number(selectedWorkorder?.waitTime?.maxWaitTimeDays) || 0;
                          if (current <= 1) return;
                          let newDays = current - 1;
                          let woID = selectedWorkorder.id;
                          let allWaits = (zSettings.waitTimes || []).filter((w) => w.maxWaitTimeDays > 0);
                          let match = allWaits.reduce((best, w) => (!best || Math.abs(w.maxWaitTimeDays - newDays) < Math.abs(best.maxWaitTimeDays - newDays)) ? w : best, null);
                          let waitObj = match ? { ...match, maxWaitTimeDays: newDays } : { ...(selectedWorkorder?.waitTime || {}), maxWaitTimeDays: newDays };
                          useOpenWorkordersStore.getState().setField("waitTime", waitObj, woID, false);
                          clearTimeout(waitDaysDebounceRef.current);
                          waitDaysDebounceRef.current = setTimeout(() => {
                            let wo = useOpenWorkordersStore.getState().getWorkorders().find((w) => w.id === woID);
                            if (wo) useOpenWorkordersStore.getState().setField("waitTime", wo.waitTime, woID, true);
                          }, 500);
                        }}
                        className={styles.bvWaitStep}
                        style={{ opacity: (!selectedWorkorder?.waitTime?.maxWaitTimeDays || Number(selectedWorkorder?.waitTime?.maxWaitTimeDays) <= 1) ? 0.3 : 1 }}
                      >
                        <Image icon={ICONS.minus} size={29} />
                      </StandTouch>
                      <StandTouch
                        onPress={() => {
                          let current = Number(selectedWorkorder?.waitTime?.maxWaitTimeDays) || 0;
                          let newDays = current + 1;
                          let woID = selectedWorkorder.id;
                          let allWaits = (zSettings.waitTimes || []).filter((w) => w.maxWaitTimeDays > 0);
                          let match = allWaits.reduce((best, w) => (!best || Math.abs(w.maxWaitTimeDays - newDays) < Math.abs(best.maxWaitTimeDays - newDays)) ? w : best, null);
                          let waitObj = match ? { ...match, maxWaitTimeDays: newDays } : { ...(selectedWorkorder?.waitTime || {}), maxWaitTimeDays: newDays };
                          useOpenWorkordersStore.getState().setField("waitTime", waitObj, woID, false);
                          clearTimeout(waitDaysDebounceRef.current);
                          waitDaysDebounceRef.current = setTimeout(() => {
                            let wo = useOpenWorkordersStore.getState().getWorkorders().find((w) => w.id === woID);
                            if (wo) useOpenWorkordersStore.getState().setField("waitTime", wo.waitTime, woID, true);
                          }, 500);
                        }}
                        className={styles.bvWaitStepPlus}
                      >
                        <Image icon={ICONS.add} size={29} />
                      </StandTouch>
                    </div>
                    <div className={styles.bvFieldHalfRowAlign}>
                      <div className={styles.bvFieldDropdownSlotFull}>
                        <DropdownMenu
                          modalCoordX={50}
                          dataArr={zSettings.waitTimes}
                          enabled={true}
                          onSelect={(item) => {
                            let isNonRemovable = NONREMOVABLE_WAIT_TIMES.some((nr) => nr.id === item.id);
                            let waitObj = { ...item, removable: !isNonRemovable };
                            useOpenWorkordersStore.getState().setField("waitTime", waitObj, selectedWorkorder.id);
                          }}
                          buttonStyle={{ opacity: selectedWorkorder?.waitTime?.label ? DROPDOWN_SELECTED_OPACITY : 1, paddingVertical: 7 }}
                          buttonTextStyle={{ fontSize: 24 }}
                          itemTextStyle={{ fontSize: 29 }}
                          itemStyle={{ paddingVertical: 25, height: "auto" }}
                          ref={waitTimesRef}
                          buttonText={"Wait Times"}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Wait estimate label */}
                  {(() => {
                    let estimateLabel = calculateWaitEstimateLabel(selectedWorkorder, zSettings);
                    let isMissing = estimateLabel === "Missing estimate" || estimateLabel === "No estimate";
                    return estimateLabel ? (
                      <span className={styles.bvWaitEstimate} style={{ color: isMissing ? C.red : C.textMuted }}>
                        {estimateLabel}
                      </span>
                    ) : null;
                  })()}

                  {/* On-screen keypad for detail fields */}
                  {sDetailField !== null && (
                    <div className={styles.bvKeypadWrap}>
                      <StandKeypad
                        mode={detailKeypadMode}
                        onKeyPress={handleDetailKeyPress}
                        toggleLabel={detailKeypadMode === "phone" ? "ABC" : "123"}
                        onToggle={() => _setDetailKeypadOverride(detailKeypadMode === "phone" ? "alpha" : "phone")}
                      />
                      <div className={styles.bvKeypadCloseRow}>
                        <StandTouch onPress={() => _setDetailField(null)} className={styles.bvKeypadClose}>
                          <Image icon={ICONS.close1} size={32} />
                        </StandTouch>
                      </div>
                    </div>
                  )}

                  {/* Status picker */}
                  {selectedWorkorder && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      className={styles.bvStatusPickerWrap}
                    >
                      <StatusPickerModal
                        statuses={(zSettings.statuses || []).filter((s) => !s.systemOwned && !s.hidden)}
                        enabled={true}
                        onSelect={handleStatusSelect}
                        buttonStyle={{
                          backgroundColor: rs.backgroundColor,
                          paddingTop: 12,
                          paddingBottom: 12,
                          paddingLeft: 24,
                          paddingRight: 24,
                          height: "auto",
                          borderRadius: 10,
                        }}
                        buttonTextStyle={{
                          color: rs.textColor,
                          fontWeight: "normal",
                          fontSize: 27,
                        }}
                        modalCoordY={45}
                        buttonText={rs.label}
                        itemHeight={69}
                        itemTextStyle={{ fontSize: 23 }}
                      />
                    </div>
                  )}

                  {/* Tap/swipe-up divider to hide */}
                  <div
                    onClick={() => { _setShowBikeDetails(false); _setDetailField(null); }}
                    onTouchStart={(e) => { swipeDividerRef.current = e.touches[0].clientY; }}
                    onTouchEnd={(e) => {
                      if (swipeDividerRef.current !== null) {
                        let diff = e.changedTouches[0].clientY - swipeDividerRef.current;
                        if (diff < -20) { _setShowBikeDetails(false); _setDetailField(null); }
                        swipeDividerRef.current = null;
                      }
                    }}
                    className={styles.bvHideDivider}
                  >
                    <span className={styles.bvHideDividerText} style={{ color: C.textDisabled }}>Tap to hide</span>
                  </div>

                </div>
              )}
            </div>
          )}

          {/* Centered new/search overlay when no workorder */}
          {!hasWorkorderReady && (
            <div className={styles.shoOverlay} style={{ zIndex: 10 }}>
              <div className={styles.shoColumn}>
                <StandTouch
                  className={styles.shoFindBtn}
                  style={{ backgroundColor: C.blue }}
                  onPress={() => {
                    _setSelectedWorkorderID(null);
                    _setPendingCustomer(null);
                    pendingActionRef.current = () => _setShowWorkorderList(true);
                    startFaceLogin();
                  }}
                >
                  <Image icon={ICONS.search} size={69} />
                  <span className={styles.shoFindText} style={{ color: C.textWhite }}>Find Workorder</span>
                </StandTouch>
                <StandTouch
                  className={styles.shoNewBtn}
                  style={{ backgroundColor: C.green }}
                  onPress={handleNewWorkorderPress}
                >
                  <Image icon={ICONS.gears1} size={138} />
                  <span className={styles.shoNewText} style={{ color: C.textWhite }}>New Workorder</span>
                </StandTouch>
              </div>
            </div>
          )}

          {/* ── 20% sidebar + 80% canvas ── */}
          <div className={styles.standMainRow} style={{ opacity: hasWorkorderReady ? 1 : 0.35, pointerEvents: hasWorkorderReady ? "auto" : "none" }}>
            {/* Left sidebar - root buttons */}
            <div className={styles.standSidebar} style={{ borderRightColor: C.borderSubtle }}>
              {/* Breadcrumbs in sidebar */}
              {sCurrentParentID !== null && sMenuPath.length > 0 && (
                <div className={styles.standBreadcrumbRow}>
                  <StandTouch onPress={() => {
                      _setCurrentParentID(null);
                      _setMenuPath([]);
                      _setSelectedButtonID(null);
                  }}>
                    <span className={styles.standBreadcrumbBackText} style={{ color: C.blue }}>{"\u2190"} All</span>
                  </StandTouch>
                  {sMenuPath.map((crumb, i) => (
                    <div key={crumb.id} className={styles.standBreadcrumbSeg}>
                      <span className={styles.standBreadcrumbSep} style={{ color: C.textDisabled }}>{">"}</span>
                      <StandTouch onPress={() => {
                          let newPath = sMenuPath.slice(0, i + 1);
                          _setMenuPath(newPath);
                          _setCurrentParentID(crumb.id);
                          let crumbBtn = (zQuickItemButtons || []).find((b) => b.id === crumb.id);
                          if (crumbBtn?.items?.length > 0) {
                            _setSelectedButtonID(crumb.id);
                          } else {
                            _setSelectedButtonID(null);
                          }
                      }}>
                        <span className={styles.standBreadcrumbText} style={{
                          color: i === sMenuPath.length - 1 ? C.textMuted : C.textMuted,
                          fontWeight: i === sMenuPath.length - 1 ? "bold" : "normal",
                        }}>
                          {(crumb.name || "").toUpperCase()}
                        </span>
                      </StandTouch>
                    </div>
                  ))}
                </div>
              )}

              {/* Button list */}
              <div className={styles.standNavScroll}>
                {/* Inventory search button — always top */}
                <div className={styles.standNavItem}>
                  <Button
                    onPress={() => _setShowInventoryModal(true)}
                    fullWidth
                    colorGradientArr={COLOR_GRADIENTS.purple}
                    buttonStyle={{
                      borderWidth: 1,
                      borderRadius: 5,
                      borderColor: C.buttonLightGreenOutline,
                      paddingHorizontal: 4,
                      paddingVertical: 14 + sNavPaddingAdj,
                      backgroundColor: undefined,
                    }}
                    textStyle={{
                      fontSize: 19 + sNavFontAdj,
                      fontWeight: 400,
                      textAlign: "center",
                      color: C.textWhite,
                    }}
                    text={"INVENTORY"}
                  />
                </div>
                {(sCurrentParentID
                  ? currentChildren
                  : (zQuickItemButtons || []).filter((b) => !b.parentID)
                ).map((item) => {
                  let isActive =
                    sSelectedButtonID === item.id ||
                    (sMenuPath.length > 0 && sMenuPath[0].id === item.id);
                  return (
                    <div key={item.id} className={styles.standNavItem}>
                      <Button
                        onPress={() => handleNavButtonPress(item)}
                        fullWidth
                        colorGradientArr={isActive ? ["rgb(245,166,35)", "rgb(245,166,35)"] : (item.id === "labor" || item.id === "item" || item.id === "common") ? COLOR_GRADIENTS.green : COLOR_GRADIENTS.blue}
                        buttonStyle={{
                          borderWidth: 1,
                          borderRadius: 5,
                          borderColor: C.buttonLightGreenOutline,
                          paddingHorizontal: 4,
                          paddingVertical: (item.id === "common" ? 19 : (splitButtonLabel(item.name).split("\n").length > 1 || item.name.length > 17) ? 10 : 20) + sNavPaddingAdj,
                          backgroundColor: undefined,
                        }}
                        numLines={splitButtonLabel(item.name).split("\n").length > 1 ? splitButtonLabel(item.name).split("\n").length : (item.name.length > 17 ? 2 : 1)}
                        textStyle={{
                          fontSize: getQuickButtonFontSize(item.name, 12) + sNavFontAdj,
                          fontWeight: 400,
                          textAlign: "center",
                          color: isActive ? "white" : C.textWhite,
                        }}
                        text={splitButtonLabel(item.name).toUpperCase()}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Static bottom container: Print + Menu */}
              {hasWorkorderReady && (
                <div className={styles.standSidebarFooter} style={{ borderTopColor: C.borderSubtle }}>
                  <div className={styles.standSidebarFooterRow}>
                    {/* Print button — opens unified print modal */}
                    {selectedWorkorder && (
                      <StandTouch onPress={() => _setShowPrinterSelectModal(true)} className={styles.standFooterIconBtn}>
                        <Image icon={selectedPrinterOffline ? warningIcon : ICONS.print} size={48} />
                      </StandTouch>
                    )}

                    {/* Menu button */}
                    <PopoverPrimitive.Root open={sShowFooterMenu} onOpenChange={_setShowFooterMenu}>
                    <PopoverPrimitive.Anchor asChild>
                      <StandTouch onPress={() => _setShowFooterMenu(v => !v)} className={styles.standFooterIconBtn}>
                        <Image icon={ICONS.listsAndOptions} size={48} />
                      </StandTouch>
                    </PopoverPrimitive.Anchor>

                  {/* Footer action menu popover */}
                  <PopoverPrimitive.Portal>
                    <PopoverPrimitive.Content side="top" align="start" sideOffset={10} collisionPadding={10} style={{ zIndex: Z.dropdown }}>
                      <div className={styles.standFooterMenuContent} style={{ borderColor: C.buttonLightGreenOutline }}>
                        <StandTouch
                          onPress={() => { _setShowFooterMenu(false); _setSelectedWorkorderID(null); _setPendingCustomer(null); _setShowWorkorderList(true); }}
                          className={styles.standFooterMenuItem}
                          style={{ borderBottomColor: C.borderSubtle }}
                        >
                          <Image icon={ICONS.search} size={36} />
                          <span className={styles.standFooterMenuItemText} style={{ color: C.text }}>Find Workorder</span>
                        </StandTouch>
                        <StandTouch
                          onPress={() => { _setShowFooterMenu(false); handleNewWorkorderPress(); }}
                          className={styles.standFooterMenuItem}
                          style={{ borderBottomColor: C.borderSubtle }}
                        >
                          <Image icon={plusIcon} size={36} />
                          <span className={styles.standFooterMenuItemText} style={{ color: C.text }}>New Workorder</span>
                        </StandTouch>
                        <StandTouch
                          onPress={() => { _setShowFooterMenu(false); _setSubMenuEditMode(!sSubMenuEditMode); }}
                          className={styles.standFooterMenuItem}
                          style={{ borderBottomColor: C.borderSubtle }}
                        >
                          <Image icon={ICONS.editPencil} size={36} />
                          <span className={styles.standFooterMenuItemText} style={{ color: C.text }}>Edit Sizing</span>
                        </StandTouch>
                        <StandTouch
                          onPress={() => { _setShowFooterMenu(false); _setShowStandSettings(true); }}
                          className={styles.standFooterMenuItem}
                          style={{ borderBottomColor: C.borderSubtle }}
                        >
                          <Image icon={ICONS.settings} size={36} />
                          <span className={styles.standFooterMenuItemText} style={{ color: C.text }}>Settings</span>
                        </StandTouch>
                        <StandTouch
                          onPress={() => { _setShowFooterMenu(false); window.location.href = window.location.pathname + "?v=" + Date.now(); }}
                          className={styles.standFooterMenuItem}
                        >
                          <Image icon={ICONS.gears1} size={36} />
                          <span className={styles.standFooterMenuItemText} style={{ color: C.text }}>Reload Page</span>
                        </StandTouch>
                      </div>
                    </PopoverPrimitive.Content>
                  </PopoverPrimitive.Portal>
                  </PopoverPrimitive.Root>
                  </div>
                </div>
              )}
            </div>

            {/* Right panel - canvas */}
            <div className={styles.standCanvasPane}>
              {/* Breadcrumbs + child buttons above canvas */}
              {sCurrentParentID !== null && (
                <div className={styles.standTopCrumbRow}>
                  {sMenuPath.map((crumb, i) => (
                    <div key={crumb.id} className={styles.standTopCrumbSeg}>
                      {i > 0 && (
                        <span className={styles.standTopCrumbSep} style={{ color: C.textDisabled }}>{">"}</span>
                      )}
                      <StandTouch onPress={() => {
                          let newPath = sMenuPath.slice(0, i + 1);
                          _setMenuPath(newPath);
                          _setCurrentParentID(crumb.id);
                          let crumbBtn = (zQuickItemButtons || []).find((b) => b.id === crumb.id);
                          if (crumbBtn?.items?.length > 0) {
                            _setSelectedButtonID(crumb.id);
                          } else {
                            _setSelectedButtonID(null);
                          }
                      }}>
                        <span className={styles.standTopCrumbText} style={{
                          color: i === sMenuPath.length - 1 ? C.textMuted : C.textMuted,
                          fontWeight: i === sMenuPath.length - 1 ? "bold" : "normal",
                        }}>
                          {(crumb.name || "(unnamed)").toUpperCase()}
                        </span>
                      </StandTouch>
                    </div>
                  ))}
                </div>
              )}

              {currentChildren.length > 0 && (
                <div className={styles.standChildBtnRow}>
                  {currentChildren.map((btn) => {
                    let isSelected = sSelectedButtonID === btn.id;
                    return (
                      <Button
                        key={btn.id}
                        onPress={() => handleNavButtonPress(btn)}
                        colorGradientArr={isSelected ? ["rgb(240,200,40)", "rgb(240,200,40)"] : [C.green, C.green]}
                        buttonStyle={{
                          borderWidth: 1,
                          borderRadius: 5,
                          borderColor: C.buttonLightGreenOutline,
                          marginRight: 6,
                          marginBottom: 6,
                          paddingHorizontal: 12 + (sSubMenuWidthAdj * 2),
                          paddingVertical: 8 + (sSubMenuHeightAdj * 2),
                        }}
                        textStyle={{
                          fontSize: getQuickButtonFontSize(btn.name, 12 + sSubMenuFontAdj),
                          fontWeight: 400,
                          color: C.textWhite,
                        }}
                        text={btn.name.toUpperCase() + (isSelected ? " \u25BC" : " \u25B6")}
                      />
                    );
                  })}
                </div>
              )}

              {/* Canvas */}
              {sSelectedButtonID ? (
                <div className={styles.standCanvasScroll} style={{ backgroundColor: lightenRGBByPercent(C.backgroundWhite, 20) }}>
                  <div
                    className={styles.standCanvasInner}
                    style={{
                      minHeight: Math.max(500, canvasMaxBottom * 8) * (1 + sSubMenuHeightAdj * 0.03),
                    }}
                  >
                    {canvasItems.map((itemObj) => {
                      let invItem = (zInventory || []).find((i) => i.id === itemObj.inventoryItemID);
                      let name = invItem ? (invItem.informalName || invItem.formalName || "Unknown") : "(not found)";
                      let w = (itemObj.w || QB_DEFAULT_W) + sSubMenuWidthAdj;
                      let h = (itemObj.h || QB_DEFAULT_H);
                      let fontSize = (itemObj.fontSize || 10) + sSubMenuFontAdj;
                      let isOnWorkorder = selectedItemIDs.has(itemObj.inventoryItemID);

                      let workorderLine = isOnWorkorder
                        ? (selectedWorkorder.workorderLines || []).find((ln) => ln.inventoryItem?.id === itemObj.inventoryItemID)
                        : null;
                      let hasDiscount = !!workorderLine?.discountObj?.value;

                      return (
                        <StandTouch
                          key={itemObj.inventoryItemID}
                          className={styles.standCanvasItem}
                          style={{
                            left: (itemObj.x || 0) + "%",
                            top: (itemObj.y || 0) + "%",
                            width: w + "%",
                            height: h + "%",
                            borderColor: C.buttonLightGreenOutline,
                            backgroundColor: itemObj.backgroundColor || C.buttonLightGreenOutline,
                            transform: sPulseID === itemObj.inventoryItemID ? "scale(1.12)" : "scale(1)",
                          }}
                          onPress={() => {
                            if (sDiscountCardID) { _setDiscountCardID(null); return; }
                            const now = Date.now();
                            if (lastCanvasClickItemRef.current === itemObj.inventoryItemID && now - lastCanvasClickTimeRef.current < 700) {
                              lastCanvasClickTimeRef.current = 0;
                              lastCanvasClickItemRef.current = null;
                              openNoteHelperForCanvasItem(invItem);
                            } else {
                              lastCanvasClickTimeRef.current = now;
                              lastCanvasClickItemRef.current = itemObj.inventoryItemID;
                              inventoryItemSelected(invItem);
                              _setPulseID(itemObj.inventoryItemID);
                              clearTimeout(pulseTimerRef.current);
                              pulseTimerRef.current = setTimeout(() => _setPulseID(null), 160);
                            }
                          }}
                          onLongPress={() => openNoteHelperForCanvasItem(invItem)}
                          delayLongPress={150}
                        >
                          <span
                            className={styles.standCanvasItemName}
                            style={{
                              fontSize: fontSize,
                              color: itemObj.textColor || (invItem ? C.text : C.textDisabled),
                            }}
                          >
                            {name}
                          </span>
                          {isOnWorkorder && (
                            <div className={styles.standCanvasQtyBadge} style={{ backgroundColor: C.surfaceAlt }}>
                              <span className={styles.standCanvasQtyText} style={{ color: C.red }}>
                                {workorderLine?.qty || 1}
                              </span>
                            </div>
                          )}
                          {hasDiscount && (
                            <span className={styles.standCanvasDiscountLabel} style={{ color: C.green }}>
                              {workorderLine.discountObj.name || "Discount"}
                            </span>
                          )}
                          {/* Discount dropdown on long-press */}
                          {sDiscountCardID === itemObj.inventoryItemID && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                position: "absolute",
                                top: "100%",
                                left: 0,
                                zIndex: 100,
                                backgroundColor: "white",
                                borderRadius: 6,
                                border: "1px solid " + C.borderSubtle,
                                boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                                minWidth: 140,
                                overflow: "hidden",
                              }}
                            >
                              <div
                                onClick={() => handleDiscountSelect(itemObj.inventoryItemID, null)}
                                style={{ padding: "9px 10px", cursor: "pointer", fontSize: 24, color: C.text, borderBottom: "1px solid " + C.borderSubtle }}
                                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = C.surfaceAlt; }}
                                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "white"; }}
                              >
                                No Discount
                              </div>
                              {(zSettings.discounts || [])
                                .filter((d) => d.type !== "$" || Number(d.value) <= (invItem?.price || 0) * (workorderLine?.qty || 1))
                                .map((d, dIdx) => (
                                <div
                                  key={d.name + "-" + dIdx}
                                  onClick={() => handleDiscountSelect(itemObj.inventoryItemID, d)}
                                  style={{ padding: "9px 10px", cursor: "pointer", fontSize: 24, color: C.text, borderBottom: "1px solid " + C.borderSubtle }}
                                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = C.surfaceAlt; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "white"; }}
                                >
                                  {d.name}
                                </div>
                              ))}
                            </div>
                          )}
                        </StandTouch>
                      );
                    })}
                    {canvasItems.length === 0 && (
                      <div className={styles.standCanvasEmpty}>
                        <span className={styles.standCanvasEmptyText} style={{ color: C.textMuted }}>No items in this menu</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className={styles.standCanvasNoSelect}>
                  <span className={styles.standCanvasNoSelectText} style={{ color: C.textMuted }}>Select a button to view items</span>
                </div>
              )}

              {/* Workorder items overlay — grows upward from bottom, covers full screen */}
              {sShowItemOverlay && selectedWorkorder?.workorderLines?.length > 0 && (
                <StandTouch touchStart={false} className={styles.standItemsOverlay} onPress={() => _setShowItemOverlay(false)}>
                  <div className={styles.standItemsOverlayInner} onClick={(e) => e.stopPropagation()}>
                  {selectedWorkorder.workorderLines.map((line) => {
                    let inv = line.inventoryItem || {};
                    let informal = inv.informalName || "";
                    let formal = inv.formalName || "";
                    let qtyLabel = (line.qty || 1) > 1 ? " x" + line.qty : "";
                    let isSwiped = sSwipedCardID === line.id;
                    let isSwipedLeft = isSwiped && sSwipeDir === "left";
                    let isSwipedRight = isSwiped && sSwipeDir === "right";
                    return (
                      <div key={line.id} className={styles.standItemRow}>
                        {/* Discount icon — revealed on swipe right */}
                        {isSwipedRight && (
                          <StandTouch
                            className={`${styles.standItemSideBtn} ${styles.standItemSideBtnRight}`}
                            style={{ backgroundColor: lightenRGBByPercent(C.orange, 50) }}
                            onPress={() => {
                              _setSwipedCardID(null);
                              _setSwipeDir(null);
                              _setDiscountCardID(line.inventoryItem?.id === sDiscountCardID ? null : line.inventoryItem?.id);
                            }}
                          >
                            <Image icon={ICONS.dollarYellow} size={22} />
                          </StandTouch>
                        )}

                        {/* Card body — tap opens notes modal or custom item editor */}
                        <div
                          className={styles.standItemCard}
                          style={{
                            backgroundColor: inv.customLabor ? lightenRGBByPercent(C.blue, 80) : inv.customPart ? lightenRGBByPercent(C.green, 80) : C.backgroundListWhite,
                            borderColor: C.buttonLightGreenOutline,
                            borderLeftColor: line.discountObj?.name ? C.lightred : lightenRGBByPercent(C.green, 60),
                          }}
                          onClick={() => {
                            if (inv.customPart || inv.customLabor) {
                              _setEditingLine(line);
                              _setCustomItemModal(inv.customLabor ? "labor" : "item");
                              return;
                            }
                            _setIntakeNotesLineID(line.id);
                            _setIntakeNotesText(line.intakeNotes || "");
                            _setReceiptNotesText(line.receiptNotes || "");
                            _setNotesTarget(zSettings.noteHelpersTarget || "intakeNotes");
                            let helpers = zSettings.noteHelpers || [];
                            let targetText = (zSettings.noteHelpersTarget || "intakeNotes") === "intakeNotes" ? (line.intakeNotes || "") : (line.receiptNotes || "");
                            let existing = targetText.split(", ").map((s) => s.trim()).filter(Boolean);
                            let keys = new Set();
                            existing.forEach((part) => {
                              helpers.forEach((cat) => {
                                (cat.items || []).forEach((item) => {
                                  let insertText = typeof item === "string" ? item : (item.text || item.buttonLabel || "").trim();
                                  if (insertText === part) keys.add(cat.id + "::" + insertText);
                                });
                              });
                            });
                            _setActiveNoteChips(keys);
                          }}
                          onTouchStart={handleItemCardTouchStart}
                          onTouchEnd={(e) => handleItemCardTouchEnd(e, line.id)}
                        >
                          {(inv.customPart || inv.customLabor) && (
                            <span className={styles.standItemKindBadge} style={{ backgroundColor: inv.customLabor ? lightenRGBByPercent(C.blue, 55) : lightenRGBByPercent(C.green, 55) }}>
                              <span className={styles.standItemKindBadgeText} style={{ color: inv.customLabor ? lightenRGBByPercent(C.blue, 15) : lightenRGBByPercent(C.green, 15) }}>
                                {inv.customPart ? "ITEM" : inv.minutes ? inv.minutes + " MINS" : "LABOR"}
                              </span>
                            </span>
                          )}
                          <div className={styles.standItemCardBody}>
                            {line.discountObj?.name && (
                              <span className={styles.standItemDiscountName} style={{ color: C.red }}>{line.discountObj.name}</span>
                            )}
                            <div className={styles.standItemNameRow}>
                              <span className={styles.standItemFormalName} style={{ color: C.text }}>
                                {formal}
                              </span>
                              {(line.qty || 1) > 1 && (
                                <span className={styles.standItemQtyPill} style={{ backgroundColor: C.blue }}>
                                  <span className={styles.standItemQtyPillText} style={{ color: C.textWhite }}>{line.qty}</span>
                                </span>
                              )}
                              <span className={styles.standItemPricePill} style={{ backgroundColor: lightenRGBByPercent(C.green, 70) }}>
                                <span className={styles.standItemPricePillText} style={{ color: C.text }}>
                                  {formatCurrencyDisp((inv.price || 0) * (line.qty || 1), true)}
                                </span>
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Delete icon — revealed on swipe left */}
                        {isSwipedLeft && (
                          <StandTouch
                            className={`${styles.standItemSideBtn} ${styles.standItemSideBtnLeft}`}
                            style={{ backgroundColor: lightenRGBByPercent("rgb(103, 124, 231)", 50) }}
                            onPress={() => removeWorkorderLine(line.id)}
                          >
                            <Image icon={ICONS.trash} size={44} />
                          </StandTouch>
                        )}
                      </div>
                    );
                  })}
                  </div>
                </StandTouch>
              )}

              {/* Footer — totals or size editor */}
              {sSubMenuEditMode ? (
                <div className={styles.standCanvasFooterEdit} style={{ borderTopColor: C.borderSubtle }}>
                  <div className={styles.standCanvasFooterEditGroup}>
                    <span className={styles.standCanvasFooterEditLabel} style={{ color: C.textMuted }}>H</span>
                    <StandTouch
                      className={styles.standCanvasFooterEditStep}
                      style={{ backgroundColor: C.surfaceAlt }}
                      onPress={() => { let v = sSubMenuHeightAdj - 1; _setSubMenuHeightAdj(v); localStorageWrapper.setItem("standSubMenuHeightAdj", String(v)); }}
                    >
                      <span className={styles.standCanvasFooterEditStepText} style={{ color: C.text }}>-</span>
                    </StandTouch>
                    <span className={styles.standCanvasFooterEditValue} style={{ color: C.text }}>{sSubMenuHeightAdj}</span>
                    <StandTouch
                      className={styles.standCanvasFooterEditStep}
                      style={{ backgroundColor: C.surfaceAlt }}
                      onPress={() => { let v = sSubMenuHeightAdj + 1; _setSubMenuHeightAdj(v); localStorageWrapper.setItem("standSubMenuHeightAdj", String(v)); }}
                    >
                      <span className={styles.standCanvasFooterEditStepText} style={{ color: C.text }}>+</span>
                    </StandTouch>
                  </div>
                  <div className={styles.standCanvasFooterEditGroup}>
                    <span className={styles.standCanvasFooterEditLabel} style={{ color: C.textMuted }}>Font</span>
                    <StandTouch
                      className={styles.standCanvasFooterEditStep}
                      style={{ backgroundColor: C.surfaceAlt }}
                      onPress={() => { let v = sSubMenuFontAdj - 1; _setSubMenuFontAdj(v); localStorageWrapper.setItem("standSubMenuFontAdj", String(v)); }}
                    >
                      <span className={styles.standCanvasFooterEditStepText} style={{ color: C.text }}>-</span>
                    </StandTouch>
                    <span className={styles.standCanvasFooterEditValue} style={{ color: C.text }}>{sSubMenuFontAdj}</span>
                    <StandTouch
                      className={styles.standCanvasFooterEditStep}
                      style={{ backgroundColor: C.surfaceAlt }}
                      onPress={() => { let v = sSubMenuFontAdj + 1; _setSubMenuFontAdj(v); localStorageWrapper.setItem("standSubMenuFontAdj", String(v)); }}
                    >
                      <span className={styles.standCanvasFooterEditStepText} style={{ color: C.text }}>+</span>
                    </StandTouch>
                  </div>
                  <div className={styles.standCanvasFooterEditDivider} style={{ backgroundColor: C.surfaceAlt }} />
                  <div className={styles.standCanvasFooterEditGroup}>
                    <span className={styles.standCanvasFooterEditLabel} style={{ color: C.textMuted }}>Nav</span>
                    <StandTouch
                      className={styles.standCanvasFooterEditStep}
                      style={{ backgroundColor: C.surfaceAlt }}
                      onPress={() => { let v = sNavFontAdj - 1; _setNavFontAdj(v); localStorageWrapper.setItem("standNavFontAdj", String(v)); }}
                    >
                      <span className={styles.standCanvasFooterEditStepText} style={{ color: C.text }}>-</span>
                    </StandTouch>
                    <span className={styles.standCanvasFooterEditValue} style={{ color: C.text }}>{sNavFontAdj}</span>
                    <StandTouch
                      className={styles.standCanvasFooterEditStep}
                      style={{ backgroundColor: C.surfaceAlt }}
                      onPress={() => { let v = sNavFontAdj + 1; _setNavFontAdj(v); localStorageWrapper.setItem("standNavFontAdj", String(v)); }}
                    >
                      <span className={styles.standCanvasFooterEditStepText} style={{ color: C.text }}>+</span>
                    </StandTouch>
                  </div>
                  <div className={styles.standCanvasFooterEditGroup}>
                    <span className={styles.standCanvasFooterEditLabel} style={{ color: C.textMuted }}>Pad</span>
                    <StandTouch
                      className={styles.standCanvasFooterEditStep}
                      style={{ backgroundColor: C.surfaceAlt }}
                      onPress={() => { let v = sNavPaddingAdj - 1; _setNavPaddingAdj(v); localStorageWrapper.setItem("standNavPaddingAdj", String(v)); }}
                    >
                      <span className={styles.standCanvasFooterEditStepText} style={{ color: C.text }}>-</span>
                    </StandTouch>
                    <span className={styles.standCanvasFooterEditValue} style={{ color: C.text }}>{sNavPaddingAdj}</span>
                    <StandTouch
                      className={styles.standCanvasFooterEditStep}
                      style={{ backgroundColor: C.surfaceAlt }}
                      onPress={() => { let v = sNavPaddingAdj + 1; _setNavPaddingAdj(v); localStorageWrapper.setItem("standNavPaddingAdj", String(v)); }}
                    >
                      <span className={styles.standCanvasFooterEditStepText} style={{ color: C.text }}>+</span>
                    </StandTouch>
                  </div>
                </div>
              ) : (
              <div
                className={styles.standCanvasFooter}
                style={{ borderTopColor: C.borderSubtle }}
                onClick={() => _setShowItemOverlay((p) => !p)}
              >
                <div className={styles.standCanvasFooterLeft}>
                  <div className={styles.standCanvasFooterStat}>
                    <span className={styles.standCanvasFooterStatLabel} style={{ color: C.textMuted }}>Subtotal</span>
                    <span className={styles.standCanvasFooterStatVal} style={{ color: C.text }}>{formatCurrencyDisp(totals.runningSubtotal, true)}</span>
                  </div>
                  <div className={styles.standCanvasFooterStat}>
                    <span className={styles.standCanvasFooterStatLabel} style={{ color: C.textMuted }}>Discount</span>
                    <span className={styles.standCanvasFooterStatVal} style={{ color: C.red }}>-{formatCurrencyDisp(totals.runningDiscount, true)}</span>
                  </div>
                  <div className={styles.standCanvasFooterStat}>
                    <span className={styles.standCanvasFooterStatLabel} style={{ color: C.textMuted }}>Tax</span>
                    <span className={styles.standCanvasFooterStatVal} style={{ color: C.text }}>{formatCurrencyDisp(totals.runningTax, true)}</span>
                  </div>
                  <div className={styles.standCanvasFooterStat}>
                    <span className={styles.standCanvasFooterStatLabelLg} style={{ color: C.textMuted }}>Total</span>
                    <span className={styles.standCanvasFooterStatValLg} style={{ color: C.text }}>{formatCurrencyDisp(totals.finalTotal, true)}</span>
                  </div>
                </div>
                {selectedWorkorder?.workorderLines?.length > 0 && (
                  <div className={styles.standCanvasFooterRight}>
                    <span className={styles.standCanvasFooterHint} style={{ color: sShowItemOverlay ? C.red : C.textDisabled, fontWeight: sShowItemOverlay ? "600" : "normal" }}>{sShowItemOverlay ? "Tap to close" : "Tap for items"}</span>
                    <span className={styles.standCanvasFooterCountPill} style={{ backgroundColor: C.blue }}>
                      <span className={styles.standCanvasFooterCountText} style={{ color: C.textWhite }}>
                        {selectedWorkorder.workorderLines.reduce((sum, ln) => sum + (ln.qty || 1), 0)}
                      </span>
                    </span>
                  </div>
                )}
              </div>
              )}
            </div>
          </div>

          {/* Printer selection modal */}
          {sShowPrinterSelectModal && (
            <StandTouch touchStart={false} className={styles.printerBackdrop} onPress={() => _setShowPrinterSelectModal(false)}>
              <div className={styles.printerDialog} style={{ backgroundColor: C.listItemWhite }} onClick={(e) => e.stopPropagation()}>
                <div className={styles.printerScroll}>

                  {/* Intake section */}
                  <span className={styles.printerSectionLabel} style={{ color: C.textMuted, display: "block" }}>INTAKE</span>
                  <div className={styles.printerIntakeCard} style={{ borderColor: C.buttonLightGreenOutline, backgroundColor: C.backgroundListWhite }}>
                    <div className={styles.printerIntakeRow}>
                      <div className={styles.printerIntakeLeft}>
                        <Button
                          text="Print"
                          onPress={() => { handleIntakePrint(); }}
                          colorGradientArr={COLOR_GRADIENTS.green}
                          style={{ paddingVertical: 14, paddingHorizontal: 24 }}
                          textStyle={{ fontSize: 23, fontWeight: "700" }}
                          enabled={!!sSelectedPrinterID && !selectedPrinterOffline}
                        />
                        {(customerCell || customerEmail) ? (
                          <div className={styles.printerIntakeSent}>
                            <Button
                              text="Text/Email"
                              onPress={() => { handleIntakeElectronic(); }}
                              colorGradientArr={COLOR_GRADIENTS.blue}
                              style={{ paddingVertical: 14, paddingHorizontal: 24 }}
                              textStyle={{ fontSize: 23, fontWeight: "700" }}
                            />
                            {zSendStatuses[sSelectedWorkorderID] === "sent" && (
                              <Image icon={ICONS.check1} size={28} />
                            )}
                            {zSendStatuses[sSelectedWorkorderID] === "failed" && (
                              <Image icon={ICONS.redx} size={28} />
                            )}
                          </div>
                        ) : null}
                      </div>
                      {(customerCell || customerEmail) ? (
                        <Button
                          text="Both"
                          onPress={() => { handleIntakePrint(); handleIntakeElectronic(); }}
                          colorGradientArr={COLOR_GRADIENTS.purple}
                          style={{ paddingVertical: 14, paddingHorizontal: 24 }}
                          textStyle={{ fontSize: 23, fontWeight: "700" }}
                          enabled={!!sSelectedPrinterID && !selectedPrinterOffline}
                        />
                      ) : null}
                    </div>
                  </div>

                  {/* Print workorder button */}
                  <div className={styles.printerWorkorderBlock}>
                    <Button
                      text="PRINT WORKORDER"
                      onPress={() => { handleWorkorderPrint(); }}
                      colorGradientArr={COLOR_GRADIENTS.yellow}
                      buttonStyle={{ paddingVertical: 28, paddingHorizontal: 30 }}
                      textStyle={{ fontSize: 22, fontWeight: "700", color: "white" }}
                      enabled={!!sSelectedPrinterID && !selectedPrinterOffline}
                    />
                  </div>

                  {/* Printer selection section */}
                  <span className={`${styles.printerSectionLabel} ${styles.printerSectionLabelTop}`} style={{ color: C.textMuted, display: "block" }}>AVAILABLE PRINTERS</span>
                  {receiptPrinters.length === 0 ? (
                    <span className={styles.printerEmpty} style={{ color: C.textMuted, display: "block" }}>No receipt printers configured</span>
                  ) : (
                    receiptPrinters.map((printer, idx) => {
                      let isSelected = printer.id === sSelectedPrinterID;
                      let isOnline = printer.active === true;
                      return (
                        <div
                          key={printer.id}
                          className={styles.printerCard}
                          style={{
                            borderColor: isSelected ? C.green : C.borderSubtle,
                            backgroundColor: isSelected ? lightenRGBByPercent(C.green, 70) : C.backgroundListWhite,
                            marginBottom: idx < receiptPrinters.length - 1 ? 8 : 0,
                          }}
                        >
                          {!isOnline ? (
                            <div className={styles.printerOfflineWrap}>
                              <span className={styles.printerOfflineBadge} style={{ color: C.red, backgroundColor: "yellow" }}>Printer Offline</span>
                            </div>
                          ) : null}
                          <div className={styles.printerHeaderRow}>
                            <div className={styles.printerHeaderInfo}>
                              <span className={styles.printerName} style={{ fontWeight: isSelected ? "700" : "normal", color: C.text }}>
                                {printer.label || printer.printerName || printer.id}
                              </span>
                              {printer.printerName && printer.label ? (
                                <span className={styles.printerSubname} style={{ color: C.textMuted }}>{printer.printerName}</span>
                              ) : null}
                            </div>
                          </div>
                          <div className={styles.printerActionRow}>
                            <CheckBox
                              isChecked={isSelected}
                              text="Use this printer"
                              textStyle={{ fontSize: 16 }}
                              buttonStyle={{ backgroundColor: "transparent" }}
                              onCheck={() => handleSelectPrinter(printer.id)}
                            />
                            <Button
                              text="Test Print"
                              onPress={() => {
                                let testObj = printBuilder.test();
                                dbSavePrintObj(testObj, printer.id);
                                useAlertScreenStore.getState().setValues({
                                  title: "Test Print",
                                  message: "Was the test print successful?",
                                  btn1Text: "Yes",
                                  btn2Text: "No",
                                  handleBtn1Press: () => {
                                    handleSelectPrinter(printer.id);
                                    useAlertScreenStore.getState().setShowAlert(false);
                                  },
                                  handleBtn2Press: () => useAlertScreenStore.getState().setShowAlert(false),
                                  canExitOnOuterClick: true,
                                });
                              }}
                              colorGradientArr={COLOR_GRADIENTS.green}
                              style={{ paddingHorizontal: 16, paddingVertical: 10 }}
                              textStyle={{ fontSize: 14, fontWeight: "700" }}
                              enabled={isOnline}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div className={styles.printerSpacer16} />
                </div>
              </div>
            </StandTouch>
          )}

          {/* Intake notes modal for editing a line's intake notes */}
          {sIntakeNotesLineID && (() => {
            let notesLine = (selectedWorkorder?.workorderLines || []).find((ln) => ln.id === sIntakeNotesLineID);
            let itemLabel = notesLine?.inventoryItem?.informalName || notesLine?.inventoryItem?.formalName || "Item";
            let noteHelpers = zSettings.noteHelpers || [];
            let activeText = sNotesTarget === "intakeNotes" ? sIntakeNotesText : sReceiptNotesText;
            let activeSetText = sNotesTarget === "intakeNotes" ? _setIntakeNotesText : _setReceiptNotesText;

            function toggleNoteChip(catId, item) {
              let insertText = typeof item === "string" ? item : (item.text || item.buttonLabel || "").trim();
              let key = catId + "::" + insertText;
              let parts = activeText.split(", ").map((s) => s.trim()).filter(Boolean);
              let wasActive = sActiveNoteChips.has(key);
              if (wasActive) {
                let idx = parts.indexOf(insertText);
                if (idx !== -1) parts.splice(idx, 1);
                let next = new Set(sActiveNoteChips);
                next.delete(key);
                _setActiveNoteChips(next);
              } else {
                parts.push(insertText);
                let next = new Set(sActiveNoteChips);
                next.add(key);
                _setActiveNoteChips(next);
              }
              activeSetText(parts.join(", "));
            }

            function switchNotesTarget(target) {
              let text = target === "intakeNotes" ? sIntakeNotesText : sReceiptNotesText;
              let existing = text.split(", ").map((s) => s.trim()).filter(Boolean);
              let keys = new Set();
              existing.forEach((part) => {
                noteHelpers.forEach((cat) => {
                  (cat.items || []).forEach((item) => {
                    let insertText = typeof item === "string" ? item : (item.text || item.buttonLabel || "").trim();
                    if (insertText === part) keys.add(cat.id + "::" + insertText);
                  });
                });
              });
              _setActiveNoteChips(keys);
              _setNotesTarget(target);
              _setNotesCursorPos(null);
            }

            return (
            <StandTouch touchStart={false} className={styles.notesBackdrop} style={{ zIndex: Z.modal }} onPress={() => _setIntakeNotesLineID(null)}>
              <div
                className={styles.notesDialog}
                onClick={(e) => { e.stopPropagation(); _setNotesDiscountOpen(false); }}
              >
                {/* Header: item name + target toggle + tap/swipe to close */}
                <div
                  className={styles.notesHeader}
                  style={{ borderBottom: "1px solid " + C.borderSubtle }}
                  onClick={() => _setIntakeNotesLineID(null)}
                  onTouchStart={(e) => { notesSwipeRef.current = e.touches[0].clientY; }}
                  onTouchEnd={(e) => {
                    if (notesSwipeRef.current !== null) {
                      let diff = e.changedTouches[0].clientY - notesSwipeRef.current;
                      if (diff > 20) _setIntakeNotesLineID(null);
                      notesSwipeRef.current = null;
                    }
                  }}
                >
                  <span className={styles.notesHeaderTitle} style={{ color: C.text }}>{itemLabel}</span>
                  <div className={styles.notesFontGroup} onClick={(e) => e.stopPropagation()}>
                    <span className={styles.notesFontLabel} style={{ color: C.textMuted }}>Font size</span>
                    <StandTouch
                      className={styles.notesFontBtn}
                      onPress={() => {
                        let next = sNoteHelperFontAdj - 1;
                        _setNoteHelperFontAdj(next);
                        localStorageWrapper.setItem("standNoteHelperFontAdj", String(next));
                      }}
                    >
                      <Image icon={ICONS.minus} style={{ width: 22, height: 22 }} />
                    </StandTouch>
                    <StandTouch
                      className={styles.notesFontBtn}
                      onPress={() => {
                        let next = sNoteHelperFontAdj + 1;
                        _setNoteHelperFontAdj(next);
                        localStorageWrapper.setItem("standNoteHelperFontAdj", String(next));
                      }}
                    >
                      <Image icon={ICONS.add} style={{ width: 22, height: 22 }} />
                    </StandTouch>
                  </div>
                  <span className={styles.notesHeaderHint} style={{ color: C.textDisabled }}>Tap to close</span>
                </div>

                {/* Tap-off overlay to dismiss keyboard */}
                {sNotesKeyboardOpen && (
                  <StandTouch
                    touchStart={false}
                    className={styles.notesKeyboardOverlay}
                    onPress={() => _setNotesKeyboardOpen(false)}
                  />
                )}

                {/* Note helper categories - 2 column layout */}
                <div className={styles.notesCategoryScroll}>
                  <div className={styles.notesCategoryRow}>
                    <div className={`${styles.notesCategoryCol} ${styles.notesCategoryColLeft}`}>
                      {noteHelpers.filter((_, i) => i % 2 === 0).map((category) => (
                        <div key={category.id} className={styles.notesCategoryCard} style={{ borderColor: C.borderSubtle }}>
                          <span className={styles.notesCategoryLabel} style={{ fontSize: 19 + sNoteHelperFontAdj, color: C.textMuted, display: "block" }}>
                            {category.label}
                          </span>
                          <div className={styles.notesChipRow}>
                            {(category.items || []).map((item, chipIdx) => {
                              let insertText = typeof item === "string" ? item : (item.text || item.buttonLabel || "").trim();
                              let displayLabel = typeof item === "string" ? item : (item.buttonLabel || "");
                              let active = sActiveNoteChips.has(category.id + "::" + insertText);
                              return (
                                <StandTouch
                                  key={(item.id || displayLabel) + chipIdx}
                                  className={styles.notesChip}
                                  style={{
                                    backgroundColor: active ? lightenRGBByPercent(C.blue, 70) : C.buttonLightGreenOutline,
                                    borderColor: active ? C.blue : C.buttonLightGreenOutline,
                                  }}
                                  onPress={() => toggleNoteChip(category.id, item)}
                                >
                                  <span style={{ fontSize: 25 + sNoteHelperFontAdj, color: active ? C.blue : C.textMuted, fontWeight: active ? "600" : "400" }}>
                                    {displayLabel}
                                  </span>
                                </StandTouch>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className={styles.notesCategoryDivider} style={{ backgroundColor: C.buttonLightGreenOutline }} />
                    <div className={`${styles.notesCategoryCol} ${styles.notesCategoryColRight}`}>
                      {noteHelpers.filter((_, i) => i % 2 === 1).map((category) => (
                        <div key={category.id} className={styles.notesCategoryCard} style={{ borderColor: C.borderSubtle }}>
                          <span className={styles.notesCategoryLabel} style={{ fontSize: 19 + sNoteHelperFontAdj, color: C.textMuted, display: "block" }}>
                            {category.label}
                          </span>
                          <div className={styles.notesChipRow}>
                            {(category.items || []).map((item, chipIdx) => {
                              let insertText = typeof item === "string" ? item : (item.text || item.buttonLabel || "").trim();
                              let displayLabel = typeof item === "string" ? item : (item.buttonLabel || "");
                              let active = sActiveNoteChips.has(category.id + "::" + insertText);
                              return (
                                <StandTouch
                                  key={(item.id || displayLabel) + chipIdx}
                                  className={styles.notesChip}
                                  style={{
                                    backgroundColor: active ? lightenRGBByPercent(C.blue, 70) : C.buttonLightGreenOutline,
                                    borderColor: active ? C.blue : C.buttonLightGreenOutline,
                                  }}
                                  onPress={() => toggleNoteChip(category.id, item)}
                                >
                                  <span style={{ fontSize: 25 + sNoteHelperFontAdj, color: active ? C.blue : C.textMuted, fontWeight: active ? "600" : "400" }}>
                                    {displayLabel}
                                  </span>
                                </StandTouch>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Notes target label + toggle + action buttons */}
                <div className={styles.notesActionRow}>
                  <StandTouch
                    className={styles.notesTargetBtn}
                    style={{ backgroundColor: sNotesTarget === "intakeNotes" ? C.orange : C.surfaceAlt }}
                    onPress={() => switchNotesTarget("intakeNotes")}
                  >
                    <Image icon={ICONS.editPencil} size={24} />
                    <span className={styles.notesTargetText} style={{ color: sNotesTarget === "intakeNotes" ? C.textWhite : C.textMuted }}>Intake</span>
                  </StandTouch>
                  <StandTouch
                    className={styles.notesTargetBtn}
                    style={{ backgroundColor: sNotesTarget === "receiptNotes" ? C.green : C.surfaceAlt }}
                    onPress={() => switchNotesTarget("receiptNotes")}
                  >
                    <Image icon={ICONS.receipt} size={24} />
                    <span className={styles.notesTargetText} style={{ color: sNotesTarget === "receiptNotes" ? C.textWhite : C.textMuted }}>Receipt</span>
                  </StandTouch>
                  <span className={styles.notesAddingLabel} style={{ color: C.textMuted }}>
                    Adding to <span style={{ color: sNotesTarget === "intakeNotes" ? C.orange : C.green }}>{sNotesTarget === "intakeNotes" ? "Intake" : "Receipt"}</span> notes
                  </span>

                  <div className={styles.notesFlexSpacer} />

                  {/* Discount button */}
                  <div className={styles.notesDiscountWrap}>
                    <StandTouch
                      className={styles.notesActionBtn}
                      style={{ backgroundColor: "rgb(103, 124, 231)" }}
                      onPress={() => _setNotesDiscountOpen((p) => !p)}
                    >
                      <Image icon={ICONS.dollarYellow} size={32} />
                      <span className={styles.notesActionBtnText} style={{ color: C.textWhite }}>Discount</span>
                    </StandTouch>
                    {sNotesDiscountOpen && (() => {
                      let currentLine = (selectedWorkorder?.workorderLines || []).find((ln) => ln.id === sIntakeNotesLineID);
                      let invItemID = currentLine?.inventoryItem?.id;
                      return (
                        <div
                          className={styles.notesDiscountMenu}
                          onClick={(e) => e.stopPropagation()}
                          style={{ border: "1px solid " + C.borderSubtle }}
                        >
                          <StandTouch
                            className={styles.notesDiscountItem}
                            style={{ borderBottom: "1px solid " + C.borderSubtle, color: C.text }}
                            onPress={() => { handleDiscountSelect(invItemID, null); _setNotesDiscountOpen(false); }}
                          >
                            No Discount
                          </StandTouch>
                          {(zSettings.discounts || [])
                            .filter((d) => d.type !== "$" || Number(d.value) <= (currentLine?.inventoryItem?.price || 0) * (currentLine?.qty || 1))
                            .map((d, dIdx) => (
                            <StandTouch
                              key={d.name + "-" + dIdx}
                              className={styles.notesDiscountItem}
                              style={{ borderBottom: "1px solid " + C.borderSubtle, color: C.text }}
                              onPress={() => { handleDiscountSelect(invItemID, d); _setNotesDiscountOpen(false); }}
                            >
                              {d.name}
                            </StandTouch>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Split button */}
                  {(() => {
                    let currentLine = (selectedWorkorder?.workorderLines || []).find((ln) => ln.id === sIntakeNotesLineID);
                    let canSplit = (currentLine?.qty || 1) > 1;
                    return (
                      <StandTouch
                        className={styles.notesActionBtn}
                        style={{ backgroundColor: C.blue, opacity: canSplit ? 1 : 0.4 }}
                        onPress={() => {
                          if (!canSplit) return;
                          let lines = cloneDeep(selectedWorkorder.workorderLines);
                          let idx = lines.findIndex((ln) => ln.id === sIntakeNotesLineID);
                          if (idx === -1) return;
                          let line = lines[idx];
                          let num = line.qty;
                          for (let i = 0; i < num; i++) {
                            let newLine = cloneDeep(line);
                            newLine.qty = 1;
                            newLine.id = crypto.randomUUID();
                            newLine.discountObj = null;
                            if (i === 0) { lines[idx] = newLine; _setIntakeNotesLineID(newLine.id); }
                            else lines.splice(idx + 1 + (i - 1), 0, newLine);
                          }
                          useOpenWorkordersStore.getState().setField("workorderLines", lines, sSelectedWorkorderID, true);
                        }}
                      >
                        <Image icon={ICONS.axe} size={32} />
                        <span className={styles.notesActionBtnText} style={{ color: C.textWhite }}>Split</span>
                      </StandTouch>
                    );
                  })()}

                </div>
                {(() => {
                  let currentLine = (selectedWorkorder?.workorderLines || []).find((ln) => ln.id === sIntakeNotesLineID);
                  let dObj = currentLine?.discountObj;
                  if (dObj && dObj.name) {
                    let label = dObj.name;
                    if (dObj.savings) label += " (-$" + formatCurrencyDisp(dObj.savings, false) + ")";
                    return (
                      <div className={styles.notesDiscountLabelRow}>
                        <span className={styles.notesDiscountLabelText} style={{ color: "rgb(103, 124, 231)" }}>{label}</span>
                      </div>
                    );
                  }
                  return null;
                })()}
                {(() => {
                  let cursorPos = sNotesCursorPos != null ? Math.min(sNotesCursorPos, activeText.length) : activeText.length;
                  return (
                    <>
                      <div className={styles.notesEditorRow}>
                        <div
                          className={styles.notesEditorBox}
                          style={{ borderColor: sNotesKeyboardOpen ? C.blue : C.buttonLightGreenOutline, backgroundColor: C.listItemWhite }}
                          onClick={(e) => {
                            let range = document.caretRangeFromPoint(e.clientX, e.clientY);
                            if (range) {
                              let container = e.currentTarget.querySelector("[data-notes-text]");
                              if (container) {
                                let offset = 0;
                                let walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
                                let node;
                                let found = false;
                                while ((node = walker.nextNode())) {
                                  if (node === range.startContainer) { offset += range.startOffset; found = true; break; }
                                  offset += node.textContent.length;
                                }
                                if (found) _setNotesCursorPos(offset);
                              }
                            }
                            if (!sNotesKeyboardOpen) _setNotesKeyboardOpen(true);
                          }}
                        >
                          {activeText.length === 0 && cursorPos === 0 ? (
                            <span data-notes-text="true" className={styles.notesEditorText} style={{ color: C.text }}>
                              <span className={styles.notesEditorCaret} style={{ color: C.blue }}>|</span>
                              <span className={styles.notesEditorPlaceholder} style={{ color: C.textDisabled }}>Tap here to type</span>
                            </span>
                          ) : (
                            <span data-notes-text="true" className={styles.notesEditorText} style={{ color: C.text }}>
                              {activeText.slice(0, cursorPos)}<span className={styles.notesEditorCaret} style={{ color: C.blue }}>|</span>{activeText.slice(cursorPos)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Keypad — collapsible */}
                      {sNotesKeyboardOpen && (
                        <div className={styles.notesKeypadWrap}>
                          <StandKeypad mode="alpha" showNumberRow={true} onKeyPress={(key) => {
                            let pos = sNotesCursorPos != null ? Math.min(sNotesCursorPos, activeText.length) : activeText.length;
                            if (key === "CLR") { activeSetText(""); _setNotesCursorPos(0); return; }
                            if (key === "\u232B") {
                              if (pos > 0) { activeSetText(activeText.slice(0, pos - 1) + activeText.slice(pos)); _setNotesCursorPos(pos - 1); }
                              return;
                            }
                            if (key === "ENTER") {
                              activeSetText(activeText.slice(0, pos) + "\n" + activeText.slice(pos));
                              _setNotesCursorPos(pos + 1);
                              return;
                            }
                            let char = key === " " ? " " : key.toLowerCase();
                            if (pos === 0) char = key.toUpperCase();
                            activeSetText(activeText.slice(0, pos) + char + activeText.slice(pos));
                            _setNotesCursorPos(pos + 1);
                          }} />
                        </div>
                      )}
                    </>
                  );
                })()}

                {/* Qty arrows + Close button */}
                <div className={styles.notesFooterRow}>
                  <div className={styles.notesQtyGroup}>
                    <Button
                      enabled={sNotesQty > 0}
                      onPress={() => _setNotesQty((q) => Math.max(0, q - 1))}
                      buttonStyle={{ backgroundColor: "transparent", paddingHorizontal: 3 }}
                      icon={ICONS.downArrowOrange}
                      iconSize={96}
                    />
                    <span className={styles.notesQtyValue} style={{ color: sNotesQty === 0 ? C.red : C.text }}>{sNotesQty}</span>
                    <Button
                      onPress={() => _setNotesQty((q) => q + 1)}
                      buttonStyle={{ backgroundColor: "transparent", paddingHorizontal: 3 }}
                      icon={ICONS.upArrowOrange}
                      iconSize={96}
                    />
                  </div>
                  <div className={styles.notesQtySpacer} />
                  <StandTouch
                    className={styles.notesCloseBtn}
                    style={{ backgroundColor: sNotesQty <= 0 ? C.red : C.green }}
                    onPress={() => {
                      if (sNotesQty <= 0) {
                        let updatedLines = (selectedWorkorder?.workorderLines || []).filter((ln) => ln.id !== sIntakeNotesLineID);
                        useOpenWorkordersStore.getState().setField("workorderLines", updatedLines, sSelectedWorkorderID, true);
                      } else {
                        let updatedLines = (selectedWorkorder?.workorderLines || []).map((ln) =>
                          ln.id === sIntakeNotesLineID ? { ...ln, intakeNotes: sIntakeNotesText, receiptNotes: sReceiptNotesText, qty: sNotesQty } : ln
                        );
                        useOpenWorkordersStore.getState().setField("workorderLines", updatedLines, sSelectedWorkorderID, true);
                      }
                      _setIntakeNotesLineID(null);
                    }}
                  >
                    <span className={styles.notesCloseBtnText} style={{ color: C.textWhite }}>
                      {sNotesQty <= 0 ? "REMOVE" : "CLOSE"}
                    </span>
                  </StandTouch>
                </div>

              </div>
            </StandTouch>
            );
          })()}
        </div>
      ) : (
        <StandWorkorderDetail
          workorderID={sSelectedWorkorderID}
          customer={sSelectedCustomer}
          onBack={handleBackToButtons}
          onShowCustomerModal={() => _setShowCustomerModal(true)}
        />
      )}

      <NoteHelper
        visible={!!sNoteHelperDropdown}
        onClose={() => _setNoteHelperDropdown(null)}
        workorderLine={sNoteHelperDropdown?.workorderLine}
        onUpdateLine={handleNoteHelperUpdate}
        anchorPosition={sNoteHelperDropdown?.anchorPosition || { x: 0, y: 0 }}
        noteHelpers={zSettings.noteHelpers || []}
        noteHelpersTarget={zSettings.noteHelpersTarget || "intakeNotes"}
        centered={true}
        fontSizeAdj={8}
        chipPaddingVertAdj={8}
      />
    </div>
  );
}


////////////////////////////////////////////////////////////////////////////////
// Workorder List Modal (browse open workorders)
////////////////////////////////////////////////////////////////////////////////

function computeWaitInfo(workorder) {
  let label = calculateWaitEstimateLabel(workorder, useSettingsStore.getState().getSettings());
  let result = { waitEndDay: "", textColor: C.text, isMissing: false };
  if (!label) return result;
  if (label === "Missing estimate") { result.isMissing = true; return result; }
  if (label === "No estimate") { result.waitEndDay = label; return result; }
  let lowerLabel = label.toLowerCase();
  if (lowerLabel.includes("today") || lowerLabel.includes("overdue")) result.textColor = "red";
  else if (lowerLabel.includes("tomorrow")) result.textColor = C.green;
  if (lowerLabel.startsWith("overdue ")) {
    let after = label.substring(8);
    if (after.toLowerCase() === "yesterday") after = "Yesterday";
    result.waitEndDay = "Overdue\n" + after;
    return result;
  }
  if (lowerLabel.includes("today")) {
    let parts = label.split(/\s+(today)/i);
    result.waitEndDay = parts[0]?.trim() ? parts[0].trim() + "\nToday" : "Today";
    return result;
  }
  if (lowerLabel.includes("tomorrow")) {
    let parts = label.split(/\s+(tomorrow)/i);
    result.waitEndDay = parts[0]?.trim() ? parts[0].trim() + "\nTomorrow" : "Tomorrow";
    return result;
  }
  let dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  for (let day of dayNames) {
    if (label.endsWith(day) && label.length > day.length) {
      result.waitEndDay = label.slice(0, label.length - day.length).trim() + "\n" + day;
      return result;
    }
  }
  result.waitEndDay = label;
  return result;
}

const MONTH_LABELS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_LABELS_SHORT = ["Sun","Mon","Tues","Wed","Thurs","Fri","Sat"];

function formatPickupDeliveryTime(time) {
  if (!time) return "";
  let [h, m] = time.split(":");
  h = Number(h);
  let suffix = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return h + (m && m !== "00" ? ":" + m : "") + suffix;
}

const StandWaitTimeIndicator = ({ workorder }) => {
  const isPickupDelivery = workorder.status === "pickup" || workorder.status === "delivery";
  const pd = workorder.pickupDelivery;

  if (isPickupDelivery) {
    const hasDate = pd?.month && pd?.day;
    let dateStr = "";
    let timeStr = "";
    let isToday = false;
    let isTomorrow = false;
    if (hasDate) {
      const now = new Date();
      const d = new Date(now.getFullYear(), Number(pd.month) - 1, Number(pd.day));
      isToday = Number(pd.month) === now.getMonth() + 1 && Number(pd.day) === now.getDate();
      const tom = new Date(now);
      tom.setDate(tom.getDate() + 1);
      isTomorrow = Number(pd.month) === tom.getMonth() + 1 && Number(pd.day) === tom.getDate();
      dateStr = DAY_LABELS_SHORT[d.getDay()] + ", " + MONTH_LABELS_SHORT[Number(pd.month) - 1] + " " + pd.day;
      timeStr = pd.startTime
        ? formatPickupDeliveryTime(pd.startTime) + (pd.endTime ? "-" + formatPickupDeliveryTime(pd.endTime) : "")
        : "";
    }
    const textColor = isToday ? C.red : isTomorrow ? C.green : C.text;

    return (
      <div
        className={styles.swtBox}
        style={{ backgroundColor: C.buttonLightGreen, borderColor: C.buttonLightGreenOutline }}
      >
        <div className={styles.swtCol}>
          {hasDate ? (
            <>
              {isToday ? (
                <span className={styles.swtTextLg} style={{ color: textColor }}>Today</span>
              ) : isTomorrow ? (
                <span className={styles.swtTextLg} style={{ color: textColor }}>Tomorrow</span>
              ) : (
                <span className={styles.swtTextMd} style={{ color: textColor }}>
                  {dateStr}
                </span>
              )}
              {!!timeStr && (
                <span className={styles.swtTextSm} style={{ color: C.text }}>
                  {timeStr}
                </span>
              )}
            </>
          ) : null}
        </div>
      </div>
    );
  }

  const info = computeWaitInfo(workorder);
  return (
    <div
      className={styles.swtBox}
      style={{ backgroundColor: C.buttonLightGreen, borderColor: C.buttonLightGreenOutline }}
    >
      <div className={styles.swtCol}>
        {info.isMissing ? null : !!info.waitEndDay && info.waitEndDay.includes("\n") ? (
          <>
            <span className={styles.swtTextItalic} style={{ color: info.textColor }}>
              {capitalizeFirstLetterOfString(info.waitEndDay.split("\n")[0])}
            </span>
            <span className={styles.swtTextLg} style={{ color: info.textColor, whiteSpace: "pre" }}>
              {info.waitEndDay.split("\n")[1]}
            </span>
          </>
        ) : !!info.waitEndDay ? (
          <span className={styles.swtTextLg} style={{ color: info.textColor }}>
            {capitalizeFirstLetterOfString(info.waitEndDay)}
          </span>
        ) : null}
      </div>
    </div>
  );
};

const NUM_MILLIS_IN_DAY = 86400000;

function sortWorkordersForStand(inputArr) {
  let finalArr = [];
  const statuses = useSettingsStore.getState().settings?.statuses || [];
  statuses.forEach((status) => {
    let arr = inputArr.filter((wo) => wo.status === status.id);
    arr.sort((a, b) => {
      let aHasWait = !!(a.waitTime?.maxWaitTimeDays != null && a.startedOnMillis);
      let bHasWait = !!(b.waitTime?.maxWaitTimeDays != null && b.startedOnMillis);
      if (!aHasWait && bHasWait) return -1;
      if (aHasWait && !bHasWait) return 1;
      if (!aHasWait && !bHasWait) return 0;
      let aDue = a.startedOnMillis + a.waitTime.maxWaitTimeDays * NUM_MILLIS_IN_DAY;
      let bDue = b.startedOnMillis + b.waitTime.maxWaitTimeDays * NUM_MILLIS_IN_DAY;
      return aDue - bDue;
    });
    finalArr = [...finalArr, ...arr];
  });

  const currentUser = useLoginStore.getState().getCurrentUser();
  const userStatusIDs = currentUser?.statuses || [];
  if (userStatusIDs.length > 0) {
    finalArr.sort((a, b) => {
      let aMatch = userStatusIDs.includes(a.status);
      let bMatch = userStatusIDs.includes(b.status);
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
      return 0;
    });
  }

  const now = new Date();
  const todayMonth = now.getMonth() + 1;
  const todayDay = now.getDate();
  finalArr.sort((a, b) => {
    const aIsToday = (a.status === "pickup" || a.status === "delivery") &&
      Number(a.pickupDelivery?.month) === todayMonth &&
      Number(a.pickupDelivery?.day) === todayDay;
    const bIsToday = (b.status === "pickup" || b.status === "delivery") &&
      Number(b.pickupDelivery?.month) === todayMonth &&
      Number(b.pickupDelivery?.day) === todayDay;
    if (aIsToday && !bIsToday) return -1;
    if (!aIsToday && bIsToday) return 1;
    if (aIsToday && bIsToday) {
      if (a.status === "pickup" && b.status === "delivery") return -1;
      if (a.status === "delivery" && b.status === "pickup") return 1;
      return (a.pickupDelivery?.startTime || "").localeCompare(b.pickupDelivery?.startTime || "");
    }
    return 0;
  });

  return finalArr;
}

const WorkorderListModal = ({ onSelect, onClose, onNewWorkorder, activeWorkorderID }) => {
  const zWorkorders = useOpenWorkordersStore((state) => state.workorders);
  const zStatuses = useSettingsStore((s) => s.settings?.statuses);
  const [sSearch, _setSearch] = useState("");
  const _swipeRef = useRef(null);

  let filtered = (zWorkorders || []).filter((wo) => !!wo.customerID);
  if (sSearch.trim()) {
    let q = sSearch.trim().toLowerCase();
    filtered = filtered.filter((wo) => {
      let fields = [wo.customerFirst, wo.customerLast, wo.customerCell, wo.brand, wo.description, wo.model];
      return fields.some((f) => f && String(f).toLowerCase().includes(q));
    });
  }
  let sortedWorkorders = sortWorkordersForStand(filtered);

  return (
    <StandTouch touchStart={false} className={styles.wlmBackdrop} style={{ zIndex: Z.modal }} onPress={onClose}>
      <div
        className={styles.wlmDialog}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — title, search, new workorder */}
        <div className={styles.wlmHeader} style={{ borderBottomColor: C.borderSubtle }}>
          <span className={styles.wlmTitle} style={{ color: C.text }}>Open Workorders</span>
          <div
            className={styles.wlmSearchBox}
            style={{ borderColor: C.buttonLightGreenOutline, backgroundColor: C.listItemWhite }}
          >
            <Image icon={ICONS.search} size={16} style={{ marginRight: 6, opacity: 0.4 }} />
            <input
              type="text"
              value={sSearch}
              onChange={(e) => _setSearch(e.target.value)}
              placeholder="Search name, brand, description..."
              className={styles.wlmSearchInput}
              style={{ color: C.text }}
            />
            {!!sSearch && (
              <StandTouch className={styles.wlmSearchClearBtn} onPress={() => _setSearch("")}>
                <Image icon={ICONS.close1} size={18} />
              </StandTouch>
            )}
          </div>
          <StandTouch
            className={styles.wlmNewBtn}
            style={{ backgroundColor: C.green }}
            onPress={onNewWorkorder}
          >
            <span className={styles.wlmNewBtnText} style={{ color: C.textWhite }}>+ New Workorder</span>
          </StandTouch>
          <StandTouch
            className={styles.wlmCloseBtn}
            style={{ backgroundColor: C.surfaceAlt }}
            onPress={onClose}
            touchStart={false}
          >
            <span
              className={styles.wlmCloseBtnText}
              style={{ color: C.textMuted }}
              onTouchStart={(e) => { _swipeRef.current = e.touches[0].clientY; }}
              onTouchEnd={(e) => {
                if (_swipeRef.current !== null) {
                  let diff = e.changedTouches[0].clientY - _swipeRef.current;
                  if (diff > 20) onClose();
                  _swipeRef.current = null;
                }
              }}
            >Close</span>
          </StandTouch>
        </div>

        {/* Workorder list */}
        <div className={styles.wlmScroll}>
          {sortedWorkorders.length === 0 ? (
            <span className={styles.wlmEmpty} style={{ color: C.textMuted }}>No open workorders.</span>
          ) : (
            sortedWorkorders.map((workorder) => {
              const rs = resolveStatus(workorder.status, zStatuses);
              let wipUser = "";
              if (workorder.status === "work_in_progress" && workorder.changeLog?.length) {
                for (let i = workorder.changeLog.length - 1; i >= 0; i--) {
                  let entry = workorder.changeLog[i];
                  if (entry.field === "status" && entry.to === rs.label) { wipUser = entry.user || ""; break; }
                }
              }
              let isActive = workorder.id === activeWorkorderID;
              return (
                <StandTouch
                  key={workorder.id}
                  className={styles.wlmItem}
                  style={{
                    borderLeftColor: rs.backgroundColor || C.buttonLightGreenOutline,
                    borderColor: C.buttonLightGreenOutline,
                    backgroundColor: isActive ? lightenRGBByPercent(C.lightred, 85) : C.listItemWhite,
                  }}
                  onPress={() => onSelect(workorder)}
                >
                  <div className={styles.wlmItemTop}>
                    {/* Left: customer + description */}
                    <div className={styles.wlmItemLeft}>
                      {/* Customer name row */}
                      <div className={styles.wlmItemCustRow}>
                        {workorder.hasNewSMS && (
                          <div className={styles.wlmItemSmsDot} style={{ backgroundColor: C.green }} />
                        )}
                        <span className={styles.wlmItemCustName} style={{ color: "dimgray" }}>
                          {capitalizeFirstLetterOfString(workorder.customerFirst) + " " + capitalizeFirstLetterOfString(workorder.customerLast)}
                        </span>
                      </div>

                      {/* Brand + description + line count */}
                      <div className={styles.wlmItemDescRow}>
                        {!!workorder.color1?.backgroundColor && (
                          <div className={styles.wlmItemColorDot} style={{ backgroundColor: workorder.color1.backgroundColor }} />
                        )}
                        {!!workorder.color2?.backgroundColor && (
                          <div className={styles.wlmItemColorDot} style={{ backgroundColor: workorder.color2.backgroundColor }} />
                        )}
                        <span className={styles.wlmItemBrand} style={{ color: C.text }}>
                          {capitalizeFirstLetterOfString(workorder.brand) || ""}
                        </span>
                        {!!workorder.description && (
                          <div className={styles.wlmItemSep} />
                        )}
                        <span className={styles.wlmItemDesc} style={{ color: C.text }}>
                          {capitalizeFirstLetterOfString(workorder.description)}
                        </span>
                        {workorder.workorderLines?.length > 0 && (
                          <div className={styles.wlmItemLineCount}>
                            <span className={styles.wlmItemLineCountText}>
                              {workorder.workorderLines.length}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right: date, status, wait time */}
                    <div className={styles.wlmItemRight}>
                      <div className={styles.wlmItemRightInner}>
                        <span className={styles.wlmItemDate}>
                          {(() => {
                            let d = new Date(workorder.startedOnMillis);
                            let h = d.getHours();
                            let m = d.getMinutes();
                            h = h % 12 || 12;
                            return h + ":" + (m < 10 ? "0" : "") + m + "  ";
                          })()}
                          {formatMillisForDisplay(
                            workorder.startedOnMillis,
                            new Date(workorder.startedOnMillis).getFullYear() !== new Date().getFullYear()
                          )}
                        </span>
                        <div className={styles.wlmItemDateSpacer} />
                        <div
                          className={styles.wlmItemStatus}
                          style={{ backgroundColor: rs.backgroundColor, borderLeftColor: rs.textColor }}
                        >
                          {!!wipUser && (
                            <span className={styles.wlmItemWipUser} style={{ color: C.red }}>{wipUser}</span>
                          )}
                          <span className={styles.wlmItemStatusText} style={{ color: rs.textColor }}>
                            {rs.label}
                          </span>
                        </div>
                      </div>
                      <StandWaitTimeIndicator workorder={workorder} />
                    </div>
                  </div>

                  {/* Part ordered / source row */}
                  {!!(workorder.partOrdered || workorder.partSource || workorder.trackingNumber) && (
                    <div className={styles.wlmItemPartRow}>
                      {!!workorder.partOrdered && (
                        <span className={styles.wlmItemPart} style={{ color: C.blue }}>
                          {capitalizeFirstLetterOfString(workorder.partOrdered)}
                        </span>
                      )}
                      {!!(workorder.partOrdered && workorder.partSource) && (
                        <div className={styles.wlmItemPartSep} />
                      )}
                      {!!workorder.partSource && (
                        <span className={styles.wlmItemPartSource} style={{ color: C.orange }}>
                          {capitalizeFirstLetterOfString(workorder.partSource)}
                        </span>
                      )}
                      {!!(workorder.partOrderedMillis && workorder.partOrderEstimateMillis) && (
                        <span className={styles.wlmItemPartDate}>
                          {formatMillisForDisplay(workorder.partOrderedMillis)}
                          {" \u2192 " + formatMillisForDisplay(workorder.partOrderEstimateMillis)}
                        </span>
                      )}
                      {!!workorder.trackingNumber && (
                        <span className={styles.wlmItemPartTracking} style={{ color: C.blue }}>
                          {workorder.trackingNumber}
                        </span>
                      )}
                    </div>
                  )}
                </StandTouch>
              );
            })
          )}
        </div>
      </div>
    </StandTouch>
  );
};


////////////////////////////////////////////////////////////////////////////////
// New Workorder Modal (custom keypad, search, create customer)
////////////////////////////////////////////////////////////////////////////////

const NewWorkorderModal = ({ onSelect, onClose }) => {
  const [sMode, _setMode] = useState("search"); // "search" | "create"
  const [sKeypadMode, _setKeypadMode] = useState("phone"); // "phone" | "alpha"
  const [sSearchText, _setSearchText] = useState("");
  const [sSearchResults, _setSearchResults] = useState([]);
  const [sSearching, _setSearching] = useState(false);
  const _swipeRefCust = useRef(null);
  const [sCreateForm, _setCreateForm] = useState({ first: "", last: "", phone: "", email: "" });
  const [sActiveField, _setActiveField] = useState("first");
  const searchTimerRef = useRef(null);
  const mountGuard = useMountClickGuard(350);

  // Debounced search
  function handleSearchTextChange(newText) {
    _setSearchText(newText);
    clearTimeout(searchTimerRef.current);
    if (sKeypadMode === "phone" && newText.replace(/\D/g, "").length < 4) {
      _setSearchResults([]);
      return;
    }
    if (sKeypadMode === "alpha" && newText.length < 3) {
      _setSearchResults([]);
      return;
    }
    _setSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      let results = [];
      if (sKeypadMode === "phone") {
        results = await dbSearchCustomersByPhone(newText.replace(/\D/g, ""));
      } else {
        results = await dbSearchCustomersByName(newText);
      }
      _setSearchResults(results || []);
      _setSearching(false);
    }, 300);
  }

  function handleKeyPress(key) {
    if (sMode === "create") {
      handleCreateKeyPress(key);
      return;
    }
    if (key === "CLR") {
      handleSearchTextChange("");
    } else if (key === "\u232B") {
      handleSearchTextChange(sSearchText.slice(0, -1));
    } else if (key === "ENTER") {
      handleSearchTextChange(sSearchText + "\n");
    } else if (key === " ") {
      handleSearchTextChange(sSearchText + " ");
    } else {
      if (sKeypadMode === "phone") {
        if (sSearchText.replace(/\D/g, "").length >= 10) return;
        handleSearchTextChange(sSearchText + key);
      } else {
        let char = (sSearchText.length === 0 || sSearchText.endsWith(" ")) ? key.toUpperCase() : key.toLowerCase();
        handleSearchTextChange(sSearchText + char);
      }
    }
  }

  function handleCreateKeyPress(key) {
    let field = sActiveField;
    let val = sCreateForm[field] || "";
    if (key === "CLR") {
      val = "";
    } else if (key === "\u232B") {
      val = val.slice(0, -1);
    } else if (key === "ENTER") {
      val = val + "\n";
    } else if (key === " ") {
      val = val + " ";
    } else {
      if (field === "phone") {
        if (val.replace(/\D/g, "").length >= 10) return;
        val = val + key;
      } else {
        if (field === "first" || field === "last") {
          val = val + ((val.length === 0 || val.endsWith(" ")) ? key.toUpperCase() : key.toLowerCase());
        } else {
          val = val + key.toLowerCase();
        }
      }
    }
    _setCreateForm({ ...sCreateForm, [field]: val });
  }

  function handleSelectCustomer(customer) {
    onSelect(customer);
  }

  function handleStandaloneSale() {
    onSelect("standalone");
  }

  function handleSwitchToCreate() {
    let form = { first: "", last: "", phone: "", email: "" };
    if (sKeypadMode === "phone" && sSearchText) {
      form.phone = sSearchText.replace(/\D/g, "");
    } else if (sKeypadMode === "alpha" && sSearchText) {
      let parts = sSearchText.split(" ");
      form.first = parts[0] || "";
      form.last = parts[1] || "";
    }
    _setCreateForm(form);
    _setActiveField("first");
    _setMode("create");
  }

  function handleCreateAndStart() {
    let newCustomer = cloneDeep(CUSTOMER_PROTO);
    newCustomer.id = crypto.randomUUID();
    newCustomer.millisCreated = Date.now();
    newCustomer.first = (sCreateForm.first || "").trim();
    newCustomer.last = (sCreateForm.last || "").trim();
    newCustomer.customerCell = (sCreateForm.phone || "").replace(/\D/g, "");
    newCustomer.email = (sCreateForm.email || "").trim();
    useCurrentCustomerStore.getState().setCustomer(newCustomer);
    onSelect(newCustomer);
  }

  // Auto-switch keypad for create mode fields
  let effectiveKeypadMode = sKeypadMode;
  if (sMode === "create") {
    effectiveKeypadMode = sActiveField === "phone" ? "phone" : "alpha";
  }

  // Display text for search mode
  let displayText = "";
  if (sMode === "search") {
    if (sKeypadMode === "phone") {
      let digits = sSearchText.replace(/\D/g, "");
      displayText = digits.length > 0 ? formatPhoneWithDashes(digits) : "";
    } else {
      displayText = sSearchText;
    }
  }

  return (
    <StandTouch touchStart={false} onPress={onClose}>
      <div onClick={onClose} onClickCapture={mountGuard} onTouchStartCapture={mountGuard} className={styles.nwmBackdrop} style={{ zIndex: Z.modal }}>
        <div onClick={(e) => e.stopPropagation()} className={styles.nwmDialog}>
          {/* Header */}
          {sMode === "create" ? (
            <div className={styles.nwmCreateHeader} style={{ borderBottomColor: C.borderSubtle }}>
              <StandTouch onPress={() => _setMode("search")}>
                <span className={styles.nwmBackBtn} style={{ color: C.blue }}>
                  {"\u2190"} Back to Search
                </span>
              </StandTouch>
            </div>
          ) : (
            <div
              onClick={onClose}
              onTouchStart={(e) => { _swipeRefCust.current = e.touches[0].clientY; }}
              onTouchEnd={(e) => {
                if (_swipeRefCust.current !== null) {
                  let diff = e.changedTouches[0].clientY - _swipeRefCust.current;
                  if (diff > 20) onClose();
                  _swipeRefCust.current = null;
                }
              }}
              className={styles.nwmTapToClose}
            >
              <span className={styles.nwmTapToCloseText} style={{ color: C.textDisabled }}>Tap to close</span>
            </div>
          )}

          {sMode === "search" ? (
            <>
              {/* Search display + mode toggle */}
              <div className={styles.nwmSearchRow}>
                <div
                  className={styles.nwmSearchBox}
                  style={{ borderColor: C.buttonLightGreenOutline, backgroundColor: C.listItemWhite, color: C.text }}
                >
                  <div className={styles.nwmSearchText}>
                    {displayText || (
                      <span style={{ color: C.textDisabled }}>
                        {sKeypadMode === "phone" ? "Phone number..." : "Name..."}
                      </span>
                    )}
                  </div>
                  {sSearching && (
                    <SmallLoadingIndicator size={35} color={C.blue} message="" containerStyle={{ padding: 0 }} />
                  )}
                </div>
                <StandTouch onPress={() => {
                  let newMode = sKeypadMode === "phone" ? "alpha" : "phone";
                  _setKeypadMode(newMode);
                  _setSearchText("");
                  _setSearchResults([]);
                }}>
                  <div className={styles.nwmModeToggle} style={{ backgroundColor: C.blue }}>
                    {sKeypadMode === "phone" ? "ABC" : "123"}
                  </div>
                </StandTouch>
              </div>

              {/* Keypad */}
              <div className={styles.nwmKeypadWrap}>
                <StandKeypad mode={effectiveKeypadMode} onKeyPress={handleKeyPress} fontSizeAdj={23} paddingAdj={35} />
              </div>

              {/* Search results */}
              <div className={styles.nwmResultsScroll}>
                {sSearchResults.map((cust) => (
                  <StandTouch key={cust.id} onPress={() => handleSelectCustomer(cust)}>
                    <div
                      className={styles.nwmResultRow}
                      style={{ borderColor: C.buttonLightGreenOutline, backgroundColor: C.listItemWhite }}
                    >
                      <span className={styles.nwmResultName} style={{ color: C.text }}>
                        {capitalizeFirstLetterOfString(cust.first || "")} {capitalizeFirstLetterOfString(cust.last || "")}
                      </span>
                      <div className={styles.nwmResultMeta}>
                        {!(cust.customerCell || cust.cell) && cust.landline && (
                          <span className={styles.nwmResultMetaLandline} style={{ color: C.textDisabled }}>landline</span>
                        )}
                        <span className={styles.nwmResultPhone} style={{ color: C.textMuted }}>
                          {(cust.customerCell || cust.cell)
                            ? formatPhoneWithDashes(cust.customerCell || cust.cell)
                            : cust.landline ? formatPhoneWithDashes(cust.landline) : cust.email || ""}
                        </span>
                      </div>
                    </div>
                  </StandTouch>
                ))}
                {!sSearching && sSearchResults.length === 0 && ((sKeypadMode === "phone" && sSearchText.replace(/\D/g, "").length >= 4) || (sKeypadMode === "alpha" && sSearchText.length >= 3)) && (
                  <div className={styles.nwmNoResults} style={{ color: C.textMuted }}>No results found.</div>
                )}
              </div>

              {/* Create new customer button - phone: 10 digits + no results; name: 3+ chars */}
              {((sKeypadMode === "phone" && sSearchText.replace(/\D/g, "").length === 10 && sSearchResults.length === 0 && !sSearching) ||
                (sKeypadMode === "alpha" && sSearchText.length >= 3 && !sSearching)) && (
                <div className={styles.nwmCreateBtnWrap} style={{ borderTopColor: C.borderSubtle }}>
                  <StandTouch onPress={handleSwitchToCreate}>
                    <div className={styles.nwmCreateBtn} style={{ backgroundColor: C.green, textAlign: "center" }}>
                      + Create New Customer
                    </div>
                  </StandTouch>
                </div>
              )}
            </>
          ) : (
            /* Create customer mode */
            <>
              {/* Form fields */}
              <div className={styles.nwmFormCol}>
                {[
                  { key: "first", label: "First Name" },
                  { key: "last", label: "Last Name" },
                  { key: "phone", label: "Phone" },
                  { key: "email", label: "Email" },
                ].map((field) => (
                  <StandTouch key={field.key} onPress={() => _setActiveField(field.key)}>
                    <div
                      className={styles.nwmFormField}
                      style={{
                        borderColor: sActiveField === field.key ? C.blue : C.buttonLightGreenOutline,
                        backgroundColor: sActiveField === field.key ? lightenRGBByPercent(C.blue, 85) : C.listItemWhite,
                      }}
                    >
                      <span className={styles.nwmFormLabel} style={{ color: C.textMuted }}>{field.label}</span>
                      <span className={styles.nwmFormValue} style={{ color: C.text }}>
                        {field.key === "phone"
                          ? formatPhoneWithDashes((sCreateForm[field.key] || "").replace(/\D/g, ""))
                          : sCreateForm[field.key] || ""}
                        {sActiveField === field.key && <span style={{ color: C.blue }}>|</span>}
                      </span>
                    </div>
                  </StandTouch>
                ))}
              </div>

              {/* Keypad for create mode */}
              <div className={styles.nwmKeypadWrap}>
                <StandKeypad mode={effectiveKeypadMode} onKeyPress={handleKeyPress} />
              </div>

              {/* Spacer + Create button */}
              <div className={styles.nwmSpacer} />
              <div className={styles.nwmCreateBtnWrap} style={{ borderTopColor: C.borderSubtle }}>
                <StandTouch
                  onPress={() => { if (sCreateForm.first || sCreateForm.phone) handleCreateAndStart(); }}
                >
                  <div
                    className={styles.nwmCreateBtn}
                    style={{
                      backgroundColor: C.green,
                      textAlign: "center",
                      opacity: (sCreateForm.first || sCreateForm.phone) ? 1 : 0.4,
                    }}
                  >
                    Create & Start Workorder
                  </div>
                </StandTouch>
              </div>
            </>
          )}
        </div>
      </div>
    </StandTouch>
  );
};

////////////////////////////////////////////////////////////////////////////////
// Stand Custom Item Modal (labor / item - with on-screen keypads)
////////////////////////////////////////////////////////////////////////////////

const StandCustomItemModal = ({ type, editLine, onSave, onClose }) => {
  const zDiscounts = useSettingsStore((s) => s.settings?.discounts);
  const zLaborRate = useSettingsStore((s) => s.settings?.laborRateByHour);
  const zSettings = useSettingsStore((s) => s.settings) || {};

  const isLabor = type === "labor";
  const editInv = editLine?.inventoryItem || null;

  const [sName, _setName] = useState(editInv ? (editInv.formalName || "") : "");
  const [sPriceDisplay, _setPriceDisplay] = useState(editInv ? formatCurrencyDisp(editInv.price || 0) : "");
  const [sPriceCents, _setPriceCents] = useState(editInv ? (editInv.price || 0) : 0);
  const [sMinutes, _setMinutes] = useState(editInv?.minutes ? String(editInv.minutes) : "");
  const [sIntakeNotes, _setIntakeNotes] = useState(editLine?.intakeNotes || "");
  const [sReceiptNotes, _setReceiptNotes] = useState(editLine?.receiptNotes || "");
  const [sDiscountObj, _setDiscountObj] = useState(editLine?.discountObj || null);
  const [sPriceManuallySet, _setPriceManuallySet] = useState(!!editInv);
  const [sActiveField, _setActiveField] = useState("name"); // "name" | "minutes" | "price" | "intake" | "receipt"
  const [sQuickNotesTarget, _setQuickNotesTarget] = useState(null); // null | "intakeNotes" | "receiptNotes"

  function handleKeyPress(key) {
    let field = sActiveField;
    if (field === "name" || field === "intake" || field === "receipt") {
      let getter = field === "name" ? sName : field === "intake" ? sIntakeNotes : sReceiptNotes;
      let setter = field === "name" ? _setName : field === "intake" ? _setIntakeNotes : _setReceiptNotes;
      if (key === "CLR") {
        setter("");
      } else if (key === "\u232B") {
        setter(getter.slice(0, -1));
      } else if (key === "ENTER") {
        setter(getter + "\n");
      } else if (key === " ") {
        setter(getter + " ");
      } else {
        let char = key.toLowerCase();
        if (getter.length === 0) char = key.toUpperCase();
        setter(getter + char);
      }
    } else if (field === "minutes") {
      if (key === "CLR") {
        _setMinutes("");
        return;
      }
      if (key === "\u232B") {
        let newVal = sMinutes.slice(0, -1);
        _setMinutes(newVal);
        autoCalcFromMinutes(newVal);
        return;
      }
      if (!/^\d$/.test(key)) return;
      let newVal = sMinutes + key;
      _setMinutes(newVal);
      autoCalcFromMinutes(newVal);
    } else if (field === "price") {
      if (key === "CLR") {
        _setPriceDisplay("");
        _setPriceCents(0);
        return;
      }
      if (key === "\u232B") {
        let raw = String(sPriceCents);
        let newRaw = raw.slice(0, -1) || "0";
        let { display, cents } = usdTypeMask(newRaw);
        _setPriceDisplay(display);
        _setPriceCents(cents);
        _setPriceManuallySet(true);
        _setMinutes("");
        return;
      }
      if (!/^\d$/.test(key)) return;
      let raw = String(sPriceCents) + key;
      let { display, cents } = usdTypeMask(raw);
      _setPriceDisplay(display);
      _setPriceCents(cents);
      _setPriceManuallySet(true);
      _setMinutes("");
    }
  }

  function autoCalcFromMinutes(val) {
    if (!val || !zLaborRate) return;
    let mins = Number(val);
    if (!mins) return;
    let cents = Math.round((mins * zLaborRate) / 60);
    let { display } = usdTypeMask(cents);
    _setPriceDisplay(display);
    _setPriceCents(cents);
  }

  function handleDiscountSelect(discountObj) {
    _setDiscountObj(discountObj);
  }

  function handleSave() {
    let invItem = cloneDeep(INVENTORY_ITEM_PROTO);
    invItem.formalName = sName.trim();
    invItem.price = sPriceCents;
    invItem.category = isLabor ? "Labor" : "Item";
    invItem.customLabor = isLabor;
    invItem.customPart = !isLabor;
    invItem.minutes = isLabor ? Number(sMinutes) || 0 : 0;
    let barcode = generateEAN13Barcode();
    invItem.id = barcode;
    invItem.primaryBarcode = barcode;

    let line = cloneDeep(WORKORDER_ITEM_PROTO);
    line.inventoryItem = invItem;
    line.intakeNotes = sIntakeNotes;
    line.receiptNotes = sReceiptNotes;
    line.id = crypto.randomUUID();

    if (sDiscountObj) {
      line.discountObj = sDiscountObj;
      line = applyDiscountToWorkorderItem(line);
    }

    onSave(line);
    onClose();
  }

  // Keypad mode based on active field
  let keypadMode = (sActiveField === "minutes" || sActiveField === "price") ? "phone" : "alpha";

  // Discount preview
  let discountedCents = null;
  if (sDiscountObj && sPriceCents > 0) {
    if (sDiscountObj.type === DISCOUNT_TYPES.percent) {
      let multiplier = 1 - Number("." + sDiscountObj.value);
      discountedCents = Math.round(sPriceCents * multiplier);
    } else {
      discountedCents = sPriceCents - (sDiscountObj.value || 0);
      if (discountedCents < 0) discountedCents = 0;
    }
  }

  let canSave = sName.trim().length > 0 && sPriceCents > 0;

  // Field definitions for rendering
  let fields = [
    { key: "name", label: isLabor ? "Labor Description" : "Item Name", required: true },
  ];
  if (isLabor) {
    fields.push({ key: "minutes-price", paired: true });
  } else {
    fields.push({ key: "price", label: "Price", required: true });
  }
  fields.push(
    { key: "intake", label: "Intake Notes" },
    { key: "receipt", label: "Receipt Notes" },
  );

  function getFieldValue(key) {
    if (key === "name") return sName;
    if (key === "minutes") return sMinutes;
    if (key === "price") return sPriceDisplay ? "$" + sPriceDisplay : "";
    if (key === "intake") return sIntakeNotes;
    if (key === "receipt") return sReceiptNotes;
    return "";
  }

  function getFieldColor(key) {
    if (key === "intake") return "orange";
    if (key === "receipt") return C.green;
    return C.text;
  }

  return (
    <div onClick={onClose} className={styles.scimBackdrop} style={{ zIndex: Z.modal }}>
      <div onClick={(e) => e.stopPropagation()} className={styles.scimDialog}>
        {/* Header — tap to close */}
        <StandTouch onPress={onClose}>
          <div className={styles.scimHeader} style={{ borderBottomColor: C.borderSubtle }}>
            <span className={styles.scimTitle} style={{ color: C.text }}>
              Add Custom {isLabor ? "Labor" : "Item"}
            </span>
            <span className={styles.scimTapToClose} style={{ color: C.textDisabled }}>Tap to close</span>
          </div>
        </StandTouch>

        {/* Fields */}
        <div className={styles.scimScroll}>
          {fields.map((field) => {
            if (field.paired) {
              let isMinActive = sActiveField === "minutes";
              let isPriceActive = sActiveField === "price";
              let minVal = getFieldValue("minutes");
              let priceVal = getFieldValue("price");
              return (
                <div key="minutes-price" className={styles.scimPairedRow}>
                  <StandTouch onPress={() => _setActiveField("minutes")} style={{ flex: 1, display: "flex", minWidth: 0 }}>
                    <div
                      className={styles.scimPairedField}
                      style={{
                        borderColor: isMinActive ? C.blue : C.buttonLightGreenOutline,
                        backgroundColor: isMinActive ? lightenRGBByPercent(C.blue, 85) : C.listItemWhite,
                      }}
                    >
                      <div className={styles.scimPairedLabelCol}>
                        <span className={styles.scimPairedLabel} style={{ color: C.textMuted }}>Minutes</span>
                        {zLaborRate ? (
                          <span className={styles.scimPairedSublabel} style={{ color: C.textMuted }}>
                            {"@ $" + usdTypeMask(zLaborRate, { withDollar: false }).display + "/hr"}
                          </span>
                        ) : null}
                      </div>
                      <span className={styles.scimPairedValue} style={{ color: minVal ? C.text : C.textDisabled }}>
                        {minVal || ""}
                        {isMinActive && <span style={{ color: C.blue }}>|</span>}
                      </span>
                    </div>
                  </StandTouch>
                  <StandTouch onPress={() => _setActiveField("price")} style={{ flex: 1, display: "flex", minWidth: 0 }}>
                    <div
                      className={styles.scimPairedField}
                      style={{
                        borderColor: isPriceActive ? C.blue : C.buttonLightGreenOutline,
                        backgroundColor: isPriceActive ? lightenRGBByPercent(C.blue, 85) : C.listItemWhite,
                      }}
                    >
                      <span className={styles.scimPairedLabel} style={{ color: C.textMuted }}>Price *</span>
                      <span className={styles.scimPairedValue} style={{ color: priceVal ? C.text : C.textDisabled }}>
                        {priceVal || "$0.00"}
                        {isPriceActive && <span style={{ color: C.blue }}>|</span>}
                      </span>
                    </div>
                  </StandTouch>
                </div>
              );
            }
            let isActive = sActiveField === field.key;
            let val = getFieldValue(field.key);
            let isNotes = field.key === "intake" || field.key === "receipt";
            return (
              <StandTouch key={field.key} onPress={() => _setActiveField(field.key)}>
                <div
                  className={styles.scimField}
                  style={{
                    borderColor: isActive ? C.blue : C.buttonLightGreenOutline,
                    backgroundColor: isActive ? lightenRGBByPercent(C.blue, 85) : C.listItemWhite,
                    maxWidth: field.key === "price" ? 300 : undefined,
                  }}
                >
                  <div className={styles.scimFieldLabelCol}>
                    <span className={styles.scimFieldLabel} style={{ color: C.textMuted }}>
                      {field.label}{field.required ? " *" : ""}
                    </span>
                    {field.sublabel ? (
                      <span className={styles.scimFieldSublabel} style={{ color: C.textMuted }}>{field.sublabel}</span>
                    ) : null}
                  </div>
                  <span className={styles.scimFieldValue} style={{ color: val ? getFieldColor(field.key) : C.textDisabled }}>
                    {val || (field.key === "price" ? "$0.00" : "")}
                    {isActive && <span style={{ color: C.blue }}>|</span>}
                  </span>
                  {isNotes && (
                    <StandTouch onPress={() => _setQuickNotesTarget(field.key === "intake" ? "intakeNotes" : "receiptNotes")}>
                      <div className={styles.scimQuickNotesBtn} style={{ backgroundColor: C.blue }}>
                        Quick Notes
                      </div>
                    </StandTouch>
                  )}
                </div>
              </StandTouch>
            );
          })}

          {/* Discount selector */}
          <div className={styles.scimDiscountSection}>
            <div className={styles.scimDiscountLabel} style={{ color: C.textMuted }}>Discount</div>
            <div className={styles.scimDiscountChips}>
              <StandTouch onPress={() => _setDiscountObj(null)}>
                <div
                  className={styles.scimDiscountChip}
                  style={{
                    borderColor: !sDiscountObj ? C.blue : C.borderSubtle,
                    backgroundColor: !sDiscountObj ? lightenRGBByPercent(C.blue, 85) : C.listItemWhite,
                    color: !sDiscountObj ? C.blue : C.textMuted,
                  }}
                >
                  None
                </div>
              </StandTouch>
              {(zDiscounts || [])
                .filter((d) => d.type !== "$" || Number(d.value) <= sPriceCents)
                .map((d, dIdx) => {
                  let isSelected = sDiscountObj?.name === d.name;
                  return (
                    <StandTouch key={d.name + "-" + dIdx} onPress={() => handleDiscountSelect(d)}>
                      <div
                        className={styles.scimDiscountChip}
                        style={{
                          borderColor: isSelected ? C.blue : C.borderSubtle,
                          backgroundColor: isSelected ? lightenRGBByPercent(C.blue, 85) : C.listItemWhite,
                          color: isSelected ? C.blue : C.text,
                        }}
                      >
                        {d.name}
                      </div>
                    </StandTouch>
                  );
                })}
            </div>
            {discountedCents !== null && (
              <div className={styles.scimDiscountPreview}>
                <span className={styles.scimDiscountOriginal} style={{ color: C.textMuted }}>
                  {"$" + usdTypeMask(sPriceCents, { withDollar: false }).display}
                </span>
                <span className={styles.scimDiscountFinal} style={{ color: C.green }}>
                  {"$" + usdTypeMask(discountedCents, { withDollar: false }).display}
                </span>
                <span className={styles.scimDiscountAmount} style={{ color: C.lightred }}>
                  {sDiscountObj.type === DISCOUNT_TYPES.percent
                    ? sDiscountObj.value + "% off"
                    : "$" + usdTypeMask(sDiscountObj.value, { withDollar: false }).display + " off"}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Keypad */}
        <div className={styles.scimKeypadWrap}>
          <StandKeypad mode={keypadMode} onKeyPress={handleKeyPress} fontSizeAdj={keypadMode === "phone" ? 28 : 0} paddingAdj={keypadMode === "phone" ? 42 : 0} />
        </div>

        {/* Save button */}
        <div className={styles.scimSaveWrap} style={{ borderTopColor: C.borderSubtle }}>
          <StandTouch onPress={() => { if (canSave) handleSave(); }}>
            <div
              className={styles.scimSaveBtn}
              style={{
                backgroundColor: C.green,
                textAlign: "center",
                opacity: canSave ? 1 : 0.4,
              }}
            >
              CLOSE
            </div>
          </StandTouch>
        </div>

        <NoteHelper
          visible={!!sQuickNotesTarget}
          onClose={() => _setQuickNotesTarget(null)}
          workorderLine={{ intakeNotes: sIntakeNotes, receiptNotes: sReceiptNotes }}
          onUpdateLine={(updatedLine) => {
            _setIntakeNotes(updatedLine.intakeNotes || "");
            _setReceiptNotes(updatedLine.receiptNotes || "");
          }}
          anchorPosition={{ x: 0, y: 0 }}
          noteHelpers={zSettings.noteHelpers || []}
          noteHelpersTarget={sQuickNotesTarget || "intakeNotes"}
          centered={true}
          fontSizeAdj={8}
          chipPaddingVertAdj={8}
        />
      </div>
    </div>
  );
};

////////////////////////////////////////////////////////////////////////////////
// Phone Search Modal
////////////////////////////////////////////////////////////////////////////////

const PhoneSearchModal = ({ onSelect, onClose }) => {
  const [sPhoneInput, _setPhoneInput] = useState("");
  const [sSearchResults, _setSearchResults] = useState([]);
  const [sIsSearching, _setIsSearching] = useState(false);
  const searchTimerRef = useRef(null);

  function handlePhoneChange(incomingText) {
    let rawDigits = removeDashesFromPhone(incomingText);
    if (rawDigits.length > 10) return;
    let formatted = rawDigits.length > 0 ? formatPhoneWithDashes(rawDigits) : "";
    _setPhoneInput(formatted);

    if (rawDigits.length < 5) {
      _setSearchResults([]);
      _setIsSearching(false);
      return;
    }

    _setIsSearching(true);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      dbSearchCustomersByPhone(rawDigits).then((results) => {
        _setSearchResults(results || []);
        _setIsSearching(false);
      }).catch(() => {
        _setIsSearching(false);
      });
    }, 300);
  }

  return createPortal(
    <div onClick={onClose} className={styles.psmBackdrop} style={{ zIndex: Z.modal }}>
      <div onClick={(e) => e.stopPropagation()} className={styles.psmDialog}>
        {/* Header */}
        <div className={styles.psmHeader} style={{ borderBottomColor: C.borderSubtle }}>
          <span className={styles.psmTitle} style={{ color: C.text }}>Search Customer</span>
          <StandTouch onPress={onClose}>
            <span className={styles.psmClose} style={{ color: C.textMuted }}>Close</span>
          </StandTouch>
        </div>

        {/* Phone input */}
        <div className={styles.psmInputWrap}>
          <PhoneNumberInput
            boxStyle={{
              width: "8%",
              height: 40,
              outlineStyle: "none",
              borderColor: C.borderSubtle,
              fontSize: 22,
              color: C.text,
            }}
            autoFocus={true}
            value={sPhoneInput}
            onChangeText={handlePhoneChange}
            dashStyle={{ width: 10, marginHorizontal: 4 }}
            dashColor={C.borderSubtle}
            textColor={C.text}
          />
        </div>

        {/* Results */}
        <div className={styles.psmResults}>
          {sIsSearching && (
            <div className={styles.psmStatusText} style={{ color: C.textMuted }}>Searching...</div>
          )}
          {!sIsSearching && sSearchResults.length === 0 && sPhoneInput.length > 0 && removeDashesFromPhone(sPhoneInput).length >= 5 && (
            <div className={styles.psmStatusText} style={{ color: C.textMuted }}>No customers found.</div>
          )}
          {sSearchResults.map((customer) => (
            <StandTouch key={customer.id} onPress={() => onSelect(customer)}>
              <div
                className={styles.psmResultRow}
                style={{ borderColor: C.borderSubtle, backgroundColor: C.listItemWhite }}
              >
                <div className={styles.psmResultMain}>
                  <span className={styles.psmResultName} style={{ color: C.text }}>
                    {capitalizeFirstLetterOfString(customer.first || "")} {capitalizeFirstLetterOfString(customer.last || "")}
                  </span>
                  <span className={styles.psmResultPhone} style={{ color: C.textMuted }}>
                    {formatPhoneWithDashes(customer.customerCell || "")}
                  </span>
                </div>
                {customer.email && (
                  <span className={styles.psmResultEmail} style={{ color: C.textMuted }}>
                    {customer.email}
                  </span>
                )}
              </div>
            </StandTouch>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
};

////////////////////////////////////////////////////////////////////////////////
// Stand Workorder Detail
////////////////////////////////////////////////////////////////////////////////

const StandWorkorderDetail = ({ workorderID, customer, onBack, onShowCustomerModal }) => {
  const zWorkorder = useOpenWorkordersStore((state) =>
    state.workorders.find((o) => o.id === workorderID) || null
  );
  const zSettings = useSettingsStore((state) => state.settings) || SETTINGS_OBJ;
  const sUploadProgress = useUploadProgressStore((s) => s.progress);

  const [sWaitDays, _setWaitDays] = useState(0);
  const [sShowMediaModal, _setShowMediaModal] = useState(null);
  const waitDaysTimerRef = useRef(null);
  const uploadInputRef = useRef(null);
  const mountGuard = useMountClickGuard(350);

  useEffect(() => {
    if (!zWorkorder?.partOrderEstimateMillis || !zWorkorder?.partOrderedMillis) {
      _setWaitDays(0);
      return;
    }
    let days = Math.max(0, Math.round((zWorkorder.partOrderEstimateMillis - zWorkorder.partOrderedMillis) / MILLIS_IN_DAY));
    _setWaitDays(days);
  }, [zWorkorder?.id]);

  function setField(fieldName, val) {
    useOpenWorkordersStore.getState().setField(fieldName, val, workorderID);
  }

  function setBikeColor(incomingColorVal, fieldName) {
    let foundColor = false;
    let newColorObj = {};
    COLORS.forEach((bikeColorObj) => {
      if (bikeColorObj.label.toLowerCase() === incomingColorVal.toLowerCase()) {
        foundColor = true;
        newColorObj = cloneDeep(bikeColorObj);
      }
    });
    if (!foundColor) {
      newColorObj.label = incomingColorVal;
      newColorObj.backgroundColor = null;
      newColorObj.textColor = null;
    }
    setField(fieldName, newColorObj);
  }

  function updateWaitDays(newDays) {
    _setWaitDays(newDays);
    clearTimeout(waitDaysTimerRef.current);
    waitDaysTimerRef.current = setTimeout(() => {
      let now = Date.now();
      useOpenWorkordersStore.getState().setField("partOrderedMillis", now, workorderID, false);
      useOpenWorkordersStore.getState().setField("partOrderEstimateMillis", now + (newDays * MILLIS_IN_DAY), workorderID);
    }, 700);
  }

  function handleDirectUpload(e) {
    let files = Array.from(e.target.files);
    if (!files.length) return;
    if (uploadInputRef.current) uploadInputRef.current.value = "";
    doUpload(files);
  }

  async function doUpload(files) {
    let total = files.length;
    let completed = 0;
    let failed = 0;
    useUploadProgressStore.getState().setProgress({ completed: 0, total, failed: 0, done: false });
    let newMedia = [...(zWorkorder?.media || [])];
    let storeName = (zSettings?.storeInfo?.displayName || "photo").replace(/\s+/g, "_");
    for (let i = 0; i < files.length; i++) {
      let fileToUpload = files[i];
      let originalFilename = fileToUpload.name;
      let originalFileSize = fileToUpload.size;
      let ext = fileToUpload.name.split(".").pop() || "jpg";
      let rand = Math.floor(1000 + Math.random() * 9000);
      let typeLabel = fileToUpload.type.startsWith("video") ? "Video" : "Image";
      let cleanName = `${storeName}_${typeLabel}_${rand}.${ext}`;
      if (fileToUpload.type.startsWith("image")) {
        let compressed = await compressImage(fileToUpload, 1024, 0.65);
        if (compressed) {
          compressed.name = cleanName;
          fileToUpload = compressed;
        } else {
          fileToUpload = new File([fileToUpload], cleanName, { type: fileToUpload.type });
        }
      } else {
        fileToUpload = new File([fileToUpload], cleanName, { type: fileToUpload.type });
      }
      const result = await dbUploadWorkorderMedia(workorderID, fileToUpload, { originalFilename, originalFileSize });
      if (result.success) {
        newMedia.push(result.mediaItem);
        completed++;
      } else {
        failed++;
      }
      useUploadProgressStore.getState().setProgress({ completed, total, failed, done: false });
    }
    useOpenWorkordersStore.getState().setField("media", newMedia, workorderID);
    useUploadProgressStore.getState().setProgress({ completed, total, failed, done: true });
    setTimeout(() => useUploadProgressStore.getState().setProgress(null), failed > 0 ? 5000 : 3000);
  }

  let rs = resolveStatus(zWorkorder?.status, zSettings?.statuses);
  let estimateLabel = calculateWaitEstimateLabel(zWorkorder, zSettings);

  let custName = (capitalizeFirstLetterOfString(customer?.first || zWorkorder?.customerFirst || "") +
    " " + capitalizeFirstLetterOfString(customer?.last || zWorkorder?.customerLast || "")).trim();
  let custPhone = customer?.customerCell || zWorkorder?.customerCell || "";

  const inputStyle = {
    borderWidth: 1,
    borderColor: C.buttonLightGreenOutline,
    color: C.text,
    paddingVertical: 4,
    paddingHorizontal: 6,
    fontSize: 14,
    outlineWidth: 0,
    borderRadius: 5,
  };

  return (
    <div
      className={styles.swdContainer}
      onClickCapture={mountGuard}
      onMouseDownCapture={mountGuard}
      onPointerDownCapture={mountGuard}
      onTouchStartCapture={mountGuard}
    >
      {/* Top bar: customer info + back button */}
      <div className={styles.swdTopBar} style={{ borderBottomColor: C.borderSubtle }}>
        <StandTouch onPress={onShowCustomerModal} style={{ flex: 1, display: "flex", minWidth: 0 }}>
          <div className={styles.swdCustomerInner}>
            <Image icon={ICONS.ridingBike} size={28} style={{ marginRight: 8 }} />
            <div className={styles.swdCustomerTextCol}>
              <span className={styles.swdCustomerName} style={{ color: C.text }}>
                {custName || "Customer"}
              </span>
              {custPhone ? (
                <span className={styles.swdCustomerPhone} style={{ color: C.textMuted }}>
                  {formatPhoneWithDashes(custPhone)}
                </span>
              ) : null}
            </div>
          </div>
        </StandTouch>
        <StandTouch onPress={onBack}>
          <div className={styles.swdBackButton} style={{ backgroundColor: C.surfaceAlt, color: C.text }}>
            Back to Buttons
          </div>
        </StandTouch>
      </div>

      {/* Scrollable form */}
      <div className={styles.swdScroll}>
        {/* Bike details section */}
        <div className={styles.swdSectionBike} style={{ backgroundColor: C.backgroundListWhite, borderColor: C.borderSubtle }}>
          {/* Brand row */}
          <div className={styles.swdRow}>
            <TextInput
              placeholder="Brand"
              capitalize={true}
              style={{ ...inputStyle, width: "45%", fontWeight: zWorkorder?.brand ? "500" : null }}
              value={zWorkorder?.brand}
              onChangeText={(val) => setField("brand", val)}
            />
            <div className={styles.swdDropdownPair}>
              <div className={styles.swdDropdownHalf}>
                <DropdownMenu
                  dataArr={zSettings.bikeBrands}
                  onSelect={(item) => setField("brand", item)}
                  buttonStyle={{ opacity: zWorkorder?.brand ? DROPDOWN_SELECTED_OPACITY : 1 }}
                  buttonText={zSettings.bikeBrandsName}
                />
              </div>
              <div className={styles.swdDropdownHalf}>
                <DropdownMenu
                  dataArr={zSettings.bikeOptionalBrands}
                  onSelect={(item) => setField("brand", item)}
                  buttonStyle={{ opacity: zWorkorder?.brand ? DROPDOWN_SELECTED_OPACITY : 1 }}
                  buttonText={zSettings.bikeOptionalBrandsName}
                />
              </div>
            </div>
          </div>

          {/* Model/Description row */}
          <div className={`${styles.swdRow} ${styles.swdRowMT}`}>
            <TextInput
              placeholder="Model/Description"
              capitalize={true}
              style={{ ...inputStyle, width: "45%", fontWeight: zWorkorder?.description ? "500" : null }}
              value={zWorkorder?.description}
              onChangeText={(val) => setField("description", val)}
            />
            <div className={styles.swdDescDropdownWrap}>
              <DropdownMenu
                dataArr={zSettings.bikeDescriptions}
                onSelect={(item) => setField("description", item)}
                buttonStyle={{ opacity: zWorkorder?.description ? DROPDOWN_SELECTED_OPACITY : 1 }}
                buttonText="Descriptions"
              />
            </div>
          </div>

          {/* Colors row */}
          <div className={`${styles.swdRow} ${styles.swdRowMT}`}>
            <TextInput
              placeholder="Color 1"
              capitalize={true}
              value={zWorkorder?.color1?.label}
              style={{
                ...inputStyle,
                width: "24%",
                fontWeight: zWorkorder?.color1?.label ? "500" : null,
                backgroundColor: zWorkorder?.color1?.backgroundColor,
                color: zWorkorder?.color1?.textColor || C.text,
              }}
              onChangeText={(val) => setBikeColor(val, "color1")}
            />
            <div className={styles.swdColorGap} />
            <TextInput
              placeholder="Color 2"
              capitalize={true}
              value={zWorkorder?.color2?.label}
              style={{
                ...inputStyle,
                width: "24%",
                fontWeight: zWorkorder?.color2?.label ? "500" : null,
                backgroundColor: zWorkorder?.color2?.backgroundColor,
                color: zWorkorder?.color2?.textColor || C.text,
              }}
              onChangeText={(val) => setBikeColor(val, "color2")}
            />
            <div className={styles.swdColorDropdownPair}>
              <div className={styles.swdDropdownHalf}>
                <DropdownMenu
                  itemSeparatorStyle={{ height: 0 }}
                  dataArr={COLORS}
                  menuBorderColor="transparent"
                  onSelect={(item) => setField("color1", item)}
                  buttonStyle={{ opacity: zWorkorder?.color1 ? DROPDOWN_SELECTED_OPACITY : 1 }}
                  buttonText="Color 1"
                />
              </div>
              <div className={styles.swdDropdownHalf}>
                <DropdownMenu
                  itemSeparatorStyle={{ height: 0 }}
                  dataArr={COLORS}
                  menuBorderColor="transparent"
                  onSelect={(item) => setField("color2", item)}
                  buttonStyle={{ opacity: zWorkorder?.color2 ? DROPDOWN_SELECTED_OPACITY : 1 }}
                  buttonText="Color 2"
                />
              </div>
            </div>
          </div>

          {/* Status */}
          <StatusPickerModal
            statuses={(zSettings.statuses || []).filter((s) => !s.systemOwned && !s.hidden)}
            onSelect={(val) => {
              setField("status", val.id);
              if (val.id === "finished") setField("finishedOnMillis", Date.now());
              if (val.id === "part_ordered") setField("partToBeOrdered", false);
              let linked = zSettings?.waitTimeLinkedStatus?.[val.id];
              if (linked) setField("waitTime", linked);
              let autoTextRules = zSettings?.statusAutoText || [];
              let rule = autoTextRules.find((r) => r.statusID === val.id);
              if (rule) {
                let wo = useOpenWorkordersStore.getState().workorders.find((w) => w.id === workorderID) || zWorkorder;
                scheduleAutoText(rule, wo, zSettings);
              }
            }}
            buttonStyle={{
              width: "100%",
              backgroundColor: rs.backgroundColor,
              marginTop: 8,
            }}
            buttonTextStyle={{
              color: rs.textColor,
              fontWeight: "normal",
              fontSize: 14,
            }}
            buttonText={rs.label}
          />

          {/* Wait time row */}
          <div className={`${styles.swdRow} ${styles.swdRowMT}`}>
            <span className={styles.swdGrayLabel} style={{ color: C.textMuted }}>Max wait days:</span>
            <TextInput
              placeholder="0"
              inputMode="numeric"
              style={{
                ...inputStyle,
                width: 50,
                textAlign: "center",
                fontWeight: (zWorkorder?.waitTime?.maxWaitTimeDays != null && zWorkorder?.waitTime?.maxWaitTimeDays !== "") ? "500" : null,
              }}
              value={String(zWorkorder?.waitTime?.maxWaitTimeDays ?? "")}
              onChangeText={(val) => {
                if (val !== "" && !checkInputForNumbersOnly(val)) return;
                let days = val === "" ? "" : Number(val);
                let waitObj = {
                  ...CUSTOM_WAIT_TIME,
                  label: val === "" ? "" : val + (days === 1 ? " Day" : " Days"),
                  maxWaitTimeDays: days,
                };
                setField("waitTime", waitObj);
              }}
            />
            <div className={styles.swdWaitDropdownWrap}>
              <DropdownMenu
                dataArr={zSettings.waitTimes}
                onSelect={(item) => {
                  let isNonRemovable = NONREMOVABLE_WAIT_TIMES.some((nr) => nr.id === item.id);
                  let waitObj = { ...item, removable: !isNonRemovable };
                  setField("waitTime", waitObj);
                }}
                buttonStyle={{ opacity: zWorkorder?.waitTime?.label ? DROPDOWN_SELECTED_OPACITY : 1 }}
                buttonText="Wait Times"
              />
            </div>
          </div>
          {estimateLabel && (
            <div className={styles.swdEstimateLine} style={{ color: C.textMuted }}>
              {estimateLabel}
            </div>
          )}
        </div>

        {/* Parts section */}
        <div className={styles.swdSectionParts} style={{ backgroundColor: C.surfaceAlt }}>
          <TextInput
            placeholder="Part name/description"
            capitalize={true}
            style={{ ...inputStyle, width: "100%", fontWeight: zWorkorder?.partOrdered ? "500" : null, backgroundColor: C.backgroundWhite }}
            value={zWorkorder?.partOrdered}
            onChangeText={(val) => {
              setField("partOrdered", val);
              useOpenWorkordersStore.getState().setField("partOrderedMillis", Date.now(), workorderID, false);
            }}
          />

          <div className={`${styles.swdRow} ${styles.swdRowMT}`}>
            <TextInput
              placeholder="Part Source"
              capitalize={true}
              value={zWorkorder?.partSource}
              style={{ ...inputStyle, width: "50%", fontWeight: zWorkorder?.partSource ? "500" : null, backgroundColor: C.backgroundWhite }}
              onChangeText={(val) => {
                setField("partSource", val);
                useOpenWorkordersStore.getState().setField("partOrderedMillis", Date.now(), workorderID, false);
              }}
            />
            <div className={styles.swdPartSourceWrap}>
              <DropdownMenu
                dataArr={zSettings.partSources}
                onSelect={(item) => {
                  setField("partSource", item);
                  useOpenWorkordersStore.getState().setField("partOrderedMillis", Date.now(), workorderID, false);
                }}
                buttonStyle={{ opacity: zWorkorder?.partSource ? DROPDOWN_SELECTED_OPACITY : 1 }}
                buttonText="Part Sources"
              />
            </div>
          </div>

          {/* Est delivery + to be ordered */}
          <div className={`${styles.swdRowSpaced} ${styles.swdRowMT}`}>
            <div className={styles.swdEstDeliveryGroup} style={{ opacity: zWorkorder?.partToBeOrdered ? 0.35 : 1 }}>
              <span className={styles.swdEstLabel} style={{ color: C.textMuted }}>Est. delivery</span>
              <StandTouch onPress={() => { if (!zWorkorder?.partToBeOrdered) updateWaitDays(Math.max(0, sWaitDays - 1)); }}>
                <div className={styles.swdAdjustBtn} style={{ backgroundColor: zWorkorder?.partToBeOrdered ? C.surfaceAlt : C.buttonLightGreen }}>
                  <span className={styles.swdAdjustBtnText} style={{ color: C.textMuted }}>-</span>
                </div>
              </StandTouch>
              <span className={styles.swdDaysDisplay} style={{ color: C.text }}>
                {sWaitDays + " days"}
              </span>
              <StandTouch onPress={() => { if (!zWorkorder?.partToBeOrdered) updateWaitDays(sWaitDays + 1); }}>
                <div className={styles.swdAdjustBtn} style={{ backgroundColor: zWorkorder?.partToBeOrdered ? C.surfaceAlt : C.buttonLightGreen }}>
                  <span className={styles.swdAdjustBtnText} style={{ color: C.textMuted }}>+</span>
                </div>
              </StandTouch>
              {!!zWorkorder?.partOrderEstimateMillis && !zWorkorder?.partToBeOrdered && (
                <span className={styles.swdEstDate} style={{ color: C.textMuted }}>
                  {formatMillisForDisplay(zWorkorder.partOrderEstimateMillis)}
                </span>
              )}
            </div>
            <CheckBox
              text="To be ordered"
              isChecked={!!zWorkorder?.partToBeOrdered}
              onCheck={() => setField("partToBeOrdered", !zWorkorder?.partToBeOrdered)}
              textStyle={{ fontSize: 14, color: C.textMuted }}
            />
          </div>
        </div>

        {/* Media buttons */}
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={handleDirectUpload}
          className={styles.swdHiddenInput}
        />
        <div className={styles.swdMediaCol}>
          <div className={styles.swdMediaBtnRow}>
            <StandTouch onPress={() => uploadInputRef.current?.click()}>
              <Button
                icon={ICONS.uploadCamera}
                iconSize={40}
                onPress={() => uploadInputRef.current?.click()}
                buttonStyle={{ backgroundColor: "transparent", paddingHorizontal: 0, paddingVertical: 0 }}
              />
            </StandTouch>
            <div className={styles.swdViewMediaWrap}>
              <StandTouch onPress={() => _setShowMediaModal("view")}>
                <Button
                  icon={ICONS.viewPhoto}
                  iconSize={50}
                  onPress={() => _setShowMediaModal("view")}
                  buttonStyle={{ backgroundColor: "transparent", paddingHorizontal: 0, paddingVertical: 0 }}
                />
              </StandTouch>
              <div className={styles.swdMediaCountBadge}>
                <span
                  className={styles.swdMediaCountText}
                  style={{ color: zWorkorder?.media?.length > 0 ? C.red : "gray" }}
                >
                  {zWorkorder?.media?.length || 0}
                </span>
              </div>
            </div>
          </div>
          {/* Upload progress bar */}
          {sUploadProgress && (
            <div className={styles.swdProgressRow}>
              <span
                className={styles.swdProgressText}
                style={{ color: sUploadProgress.done ? (sUploadProgress.failed > 0 ? C.red : C.green) : C.textMuted }}
              >
                {sUploadProgress.completed}/{sUploadProgress.total}
              </span>
              <div className={styles.swdProgressTrack} style={{ backgroundColor: C.surfaceAlt }}>
                {!sUploadProgress.done ? (
                  <div className={styles.swdProgressFill} style={{ width: "40%", backgroundColor: C.blue }} />
                ) : (
                  <div
                    className={styles.swdProgressFill}
                    style={{ width: "100%", backgroundColor: sUploadProgress.failed > 0 ? C.red : C.green }}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Media view modal */}
      <WorkorderMediaModal
        visible={sShowMediaModal === "view"}
        onClose={() => _setShowMediaModal(null)}
        workorderID={workorderID}
        mode="view"
      />
    </div>
  );
};

////////////////////////////////////////////////////////////////////////////////
// Customer Info View Modal (read-only)
////////////////////////////////////////////////////////////////////////////////

const CustomerInfoViewModal = ({ customer, onClose }) => {
  if (!customer) return null;

  let fields = [
    { label: "First Name", value: customer.first },
    { label: "Last Name", value: customer.last },
    { label: "Cell Phone", value: formatPhoneWithDashes(customer.customerCell || "") },
    { label: "Landline", value: formatPhoneWithDashes(customer.customerLandline || "") },
    { label: "Email", value: customer.email },
    { label: "Address", value: customer.streetAddress },
    { label: "Language", value: customer.language },
    {
      label: "Contact",
      value: customer.contactRestriction === CONTACT_RESTRICTIONS.call
        ? "CALL ONLY"
        : customer.contactRestriction === CONTACT_RESTRICTIONS.email
          ? "EMAIL ONLY"
          : "",
    },
  ].filter((f) => f.value);

  return createPortal(
    <div onClick={onClose} className={styles.cimBackdrop} style={{ zIndex: Z.modal }}>
      <div onClick={(e) => e.stopPropagation()} className={styles.cimDialog}>
        <div className={styles.cimHeader} style={{ borderBottomColor: C.borderSubtle }}>
          <span className={styles.cimTitle} style={{ color: C.text }}>Customer Info</span>
          <StandTouch onPress={onClose}>
            <span className={styles.cimClose} style={{ color: C.textMuted }}>Close</span>
          </StandTouch>
        </div>
        <div className={styles.cimBody}>
          {fields.map((f, idx) => (
            <div
              key={idx}
              className={`${styles.cimField}${idx < fields.length - 1 ? " " + styles.cimFieldBordered : ""}`}
              style={idx < fields.length - 1 ? { borderBottomColor: C.borderSubtle } : undefined}
            >
              <span className={styles.cimFieldLabel} style={{ color: C.textMuted }}>{f.label}</span>
              <span className={styles.cimFieldValue} style={{ color: C.text }}>
                {capitalizeFirstLetterOfString(String(f.value))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
};
