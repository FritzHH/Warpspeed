/* eslint-disable */
import { View, Text, ScrollView, TouchableOpacity } from "react-native-web";
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cloneDeep } from "lodash";
import * as faceapi from "face-api.js";
import { C, ICONS, COLOR_GRADIENTS } from "../styles";
import {
  useSettingsStore,
  useOpenWorkordersStore,
  useInventoryStore,
  useCurrentCustomerStore,
  useUploadProgressStore,
  useLoginStore,
  useAlertScreenStore,
} from "../stores";
import {
  resolveStatus,
  formatCurrencyDisp,
  gray,
  lightenRGBByPercent,
  capitalizeFirstLetterOfString,
  applyDiscountToWorkorderItem,
  calculateRunningTotals,
  deepEqual,
  removeDashesFromPhone,
  formatPhoneWithDashes,
  checkInputForNumbersOnly,
  calculateWaitEstimateLabel,
  formatMillisForDisplay,
  compressImage,
  createNewWorkorder,
  scheduleAutoText,
  usdTypeMask,
  generateEAN13Barcode,
  log,
  printBuilder,
  localStorageWrapper,
  findTemplateByType,
  replaceOrAddToArr,
} from "../utils";
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
  Button_,
  Image_,
  TextInput_,
  CheckBox_,
  DropdownMenu,
  StatusPickerModal,
  PhoneNumberInput,
  Tooltip,
  SmallLoadingIndicator,
  NoteHelperDropdown,
} from "../components";
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
  dbUploadPDFAndSendSMS,
  dbSendEmail,
} from "../db_calls_wrapper";
import { WorkorderMediaModal } from "./screen_components/modal_screens/WorkorderMediaModal";
import { InventorySearchModal } from "./screen_components/modal_screens/InventorySearchModal";
import { StandKeypad } from "../shared/StandKeypad";
import { MILLIS_IN_DAY, DISCOUNT_TYPES, FACE_DESCRIPTOR_CONFIDENCE_DISTANCE } from "../constants";
import { openCacheDB, clearStaleCache, loadModelCached } from "../faceDetection";
import warningIcon from "../assets/warning.png";
import plusIcon from "../assets/plus.png";

const DROPDOWN_SELECTED_OPACITY = 0.3;

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
  const zInventory = useInventoryStore((state) => state.inventoryArr);

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
  const [sDiscountCardID, _setDiscountCardID] = useState(null);
  const [sShowInventoryModal, _setShowInventoryModal] = useState(false);
  const [sShowWorkorderList, _setShowWorkorderList] = useState(false);
  const longPressTimerRef = useRef(null);

  // Quick button panel state (mirrors Options_Inventory)
  const [sSelectedButtonID, _setSelectedButtonID] = useState(null);
  const [sCurrentParentID, _setCurrentParentID] = useState(null);
  const [sMenuPath, _setMenuPath] = useState([]);
  const [sCustomItemModal, _setCustomItemModal] = useState(null); // "labor" | "item" | null
  const [sShowBikeDetails, _setShowBikeDetails] = useState(false);
  const [sDetailField, _setDetailField] = useState(null); // null | "brand" | "description" | "color1" | "color2" | "waitDays"
  const [sDetailForm, _setDetailForm] = useState({ brand: "", description: "", color1: "", color2: "", waitDays: "" });
  const detailDebounceRef = useRef(null);
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
  const [sNoteHelperDropdown, _setNoteHelperDropdown] = useState(null); // { anchorPosition, workorderLine }
  const lastCanvasClickTimeRef = useRef(0);
  const lastCanvasClickItemRef = useRef(null);

  const [sSubMenuFontAdj, _setSubMenuFontAdj] = useState(() => {
    let v = localStorageWrapper.getItem("standSubMenuFontAdj");
    return v != null ? Number(v) : 0;
  });
  const [sNoteHelperFontAdj, _setNoteHelperFontAdj] = useState(() => {
    let v = localStorageWrapper.getItem("standNoteHelperFontAdj");
    return v != null ? Number(v) : 0;
  });
  const [sSubMenuWidthAdj, _setSubMenuWidthAdj] = useState(() => {
    let v = localStorageWrapper.getItem("standSubMenuWidthAdj");
    return v != null ? Number(v) : 0;
  });
  const [sSubMenuHeightAdj, _setSubMenuHeightAdj] = useState(() => {
    let v = localStorageWrapper.getItem("standSubMenuHeightAdj");
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

  function openNoteHelperForCanvasItem(invItem, e) {
    if (!invItem) return;
    const nativeEvent = e?.nativeEvent || e;
    const x = nativeEvent?.pageX || nativeEvent?.clientX || 0;
    const y = nativeEvent?.pageY || nativeEvent?.clientY || 0;
    // Get the workorder line for this item
    const wo = useOpenWorkordersStore.getState().workorders.find((o) => o.id === sSelectedWorkorderID);
    if (!wo) return;
    const line = (wo.workorderLines || []).find((ln) => ln.inventoryItem?.id === invItem.id);
    if (!line) return;
    _setNoteHelperDropdown({ anchorPosition: { x, y }, workorderLine: line });
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

  // Bike detail keypad helpers
  const DETAIL_FIELDS = ["brand", "description", "color1", "color2", "waitDays"];

  function activateDetailField(fieldName) {
    if (!selectedWorkorder) return;
    // Sync local form from workorder when activating a field
    _setDetailForm({
      brand: selectedWorkorder.brand || "",
      description: selectedWorkorder.description || "",
      color1: selectedWorkorder.color1?.label || "",
      color2: selectedWorkorder.color2?.label || "",
      waitDays: String(selectedWorkorder.waitTime?.maxWaitTimeDays ?? ""),
    });
    _setDetailField(fieldName);
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
      let waitObj = {
        ...CUSTOM_WAIT_TIME,
        label: val === "" ? "" : val + (days === 1 ? " Day" : " Days"),
        maxWaitTimeDays: days,
      };
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
    let val = sDetailForm[sDetailField] || "";
    if (key === "CLR") {
      val = "";
    } else if (key === "\u232B") {
      val = val.slice(0, -1);
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
    _setDetailForm({ ...sDetailForm, [sDetailField]: val });
    debouncedSaveDetail(sDetailField, val);
  }

  let detailKeypadMode = sDetailField === "waitDays" ? "phone" : "alpha";

  // Printer helpers
  let printersObj = zSettings?.printers || {};
  let receiptPrinters = Object.values(printersObj).filter((p) => p.type === "receipt");
  let selectedPrinter = receiptPrinters.find((p) => p.id === sSelectedPrinterID);
  let selectedPrinterLabel = selectedPrinter?.label || "";
  let selectedPrinterOffline = selectedPrinter && selectedPrinter.active !== true;

  function handleSelectPrinter(printerID) {
    localStorageWrapper.setItem("selectedPrinterID", printerID);
    _setSelectedPrinterID(printerID);
  }

  function handleWorkorderPrint() {
    if (!selectedWorkorder || !sSelectedPrinterID) return;
    let _settings = useSettingsStore.getState().getSettings();
    let _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings: _settings };
    let toPrint = printBuilder.workorder(selectedWorkorder, pendingCust || {}, _settings?.salesTaxPercent, _ctx);
    dbSavePrintObj(toPrint, sSelectedPrinterID);
  }

  function handleIntakePrint() {
    if (!selectedWorkorder || !sSelectedPrinterID) return;
    let _settings = useSettingsStore.getState().getSettings();
    let _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings: _settings };
    let toPrint = printBuilder.intake(selectedWorkorder, pendingCust || {}, _settings?.salesTaxPercent, _ctx);
    dbSavePrintObj(toPrint, sSelectedPrinterID);
  }

  async function handleIntakeElectronic() {
    if (!selectedWorkorder || (!customerCell && !customerEmail)) return;
    let _settings = useSettingsStore.getState().getSettings();
    let _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings: _settings };
    let receiptData = printBuilder.intake(selectedWorkorder, pendingCust || {}, _settings?.salesTaxPercent, _ctx);
    let { generateWorkorderTicketPDF } = await import("../pdfGenerator");
    let base64 = generateWorkorderTicketPDF(receiptData);
    if (customerCell) {
      let smsTemplate = findTemplateByType(_settings?.smsTemplates || _settings?.textTemplates, "intakeReceipt");
      if (smsTemplate?.body) {
        await dbUploadPDFAndSendSMS({
          base64,
          message: smsTemplate.body,
          phoneNumber: removeDashesFromPhone(customerCell),
          customerID: selectedWorkorder.customerID || "",
          messageID: selectedWorkorder.id + "_intake",
          canRespond: false,
        });
      }
    }
    if (customerEmail) {
      let emailTemplate = findTemplateByType(_settings?.emailTemplates, "intakeReceipt");
      if (emailTemplate?.body) {
        await dbSendEmail(customerEmail, emailTemplate.subject || "Intake Receipt", emailTemplate.body);
      }
    }
  }

  async function handleWorkorderElectronic() {
    if (!selectedWorkorder || (!customerCell && !customerEmail)) return;
    let _settings = useSettingsStore.getState().getSettings();
    let _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings: _settings };
    let receiptData = printBuilder.workorder(selectedWorkorder, pendingCust || {}, _settings?.salesTaxPercent, _ctx);
    let { generateWorkorderTicketPDF } = await import("../pdfGenerator");
    let base64 = generateWorkorderTicketPDF(receiptData);
    if (customerCell) {
      let smsTemplate = findTemplateByType(_settings?.smsTemplates || _settings?.textTemplates, "intakeReceipt");
      if (smsTemplate?.body) {
        await dbUploadPDFAndSendSMS({
          base64,
          message: smsTemplate.body,
          phoneNumber: removeDashesFromPhone(customerCell),
          customerID: selectedWorkorder.customerID || "",
          messageID: selectedWorkorder.id + "_workorder",
          canRespond: false,
        });
      }
    }
    if (customerEmail) {
      let emailTemplate = findTemplateByType(_settings?.emailTemplates, "intakeReceipt");
      if (emailTemplate?.body) {
        await dbSendEmail(customerEmail, emailTemplate.subject || "Workorder Receipt", emailTemplate.body);
      }
    }
  }

  //////////////////////////////////////////////////////////////////////////////
  // Login: face recognition + pin
  //////////////////////////////////////////////////////////////////////////////

  function handleNewWorkorderPress() {
    pendingActionRef.current = () => _setShowNewWorkorderModal(true);
    startFaceLogin();
  }

  async function startFaceLogin() {
    // Face recognition disabled — go straight to PIN
    _setShowPinModal(true);
    return;
    if (!modelsLoadedRef.current) {
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

      let secondsLeft = 5;
      countdownRef.current = setInterval(() => {
        secondsLeft--;
        _setFaceCountdown(secondsLeft);
        if (secondsLeft <= 0) {
          stopFaceLogin();
          _setShowFaceModal(false);
          _setShowPinModal(true);
        }
      }, 1000);

      faceIntervalRef.current = setInterval(async () => {
        if (!faceVideoRef.current || faceVideoRef.current.readyState < 2) return;
        let detection = await faceapi
          .detectSingleFace(faceVideoRef.current, new faceapi.TinyFaceDetectorOptions())
          .withFaceLandmarks()
          .withFaceDescriptor();
        if (!detection) return;
        let descriptor = detection.descriptor;
        let users = useSettingsStore.getState().settings?.users || [];
        for (let user of users) {
          if (!user.faceDescriptor) continue;
          try {
            let distance = faceapi.euclideanDistance(Object.values(user.faceDescriptor), descriptor);
            if (distance < FACE_DESCRIPTOR_CONFIDENCE_DISTANCE) {
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
      }, 500);
    } catch (e) {
      _setShowPinModal(true);
    }
  }

  function stopFaceLogin() {
    clearInterval(faceIntervalRef.current);
    clearInterval(countdownRef.current);
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
    let userObj = users.find((u) => u.pin == newPin);
    if (!userObj) userObj = users.find((u) => u.alternatePin == newPin);
    if (!userObj) return;
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
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", maxHeight: "100vh", overflow: "hidden", backgroundColor: C.backgroundWhite, position: "relative" }}>
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
          onSelect={(customerOrStandalone) => {
            _setPendingCustomer(customerOrStandalone);
            _setShowBikeDetails(true);
            _setShowNewWorkorderModal(false);
          }}
          onClose={() => _setShowNewWorkorderModal(false)}
        />
      )}

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
          onSave={handleCustomItemSave}
          onClose={() => _setCustomItemModal(null)}
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
          activeWorkorderID={sSelectedWorkorderID}
        />
      )}

      {/* Face recognition modal */}
      {sShowFaceModal && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.6)",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 200,
          }}
        >
          <View
            style={{
              alignItems: "center",
              paddingHorizontal: 40,
              paddingVertical: 30,
              backgroundColor: "white",
              borderRadius: 16,
            }}
          >
            <SmallLoadingIndicator />
            <Text style={{ fontSize: 22, fontWeight: "600", color: C.text, marginTop: 12 }}>
              Scanning face...
            </Text>
            <Text style={{ fontSize: 52, fontWeight: "700", color: C.green, marginTop: 16 }}>
              {sFaceCountdown}
            </Text>
          </View>
          <video
            ref={faceVideoRef}
            width={0}
            height={0}
            autoPlay
            muted
            onLoadedMetadata={(e) => e.target.play()}
            style={{ position: "absolute", opacity: 0 }}
          />
        </View>
      )}

      {/* Pin login modal */}
      {sShowPinModal && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.6)",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 200,
          }}
        >
          <View
            style={{
              alignItems: "center",
              paddingHorizontal: 40,
              paddingVertical: 30,
              backgroundColor: "white",
              borderRadius: 16,
              minWidth: 280,
            }}
          >
            <Text style={{ fontSize: 35, fontWeight: "600", color: C.text, marginBottom: 20 }}>
              Enter PIN
            </Text>
            <View style={{ flexDirection: "row", marginBottom: 20, alignItems: "center" }}>
              {Array.from({ length: zSettings?.userPinStrength || 4 }).map((_, i) => {
                const isFilled = i < sPin.length;
                const isCursor = i === sPin.length;
                return (
                  <View
                    key={i}
                    style={{
                      width: 44,
                      height: 52,
                      borderWidth: 2,
                      borderColor: isCursor ? C.cursorRed : isFilled ? "#007bff" : "#ddd",
                      borderRadius: 8,
                      marginHorizontal: 4,
                      justifyContent: "center",
                      alignItems: "center",
                      backgroundColor: isCursor ? C.cursorRed : isFilled ? "#fff" : "#f8f9fa",
                      boxShadow: isCursor ? "0 0 10px rgba(255, 107, 107, 0.5)" : "none",
                    }}
                  >
                    {isFilled && (
                      <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: C.text }} />
                    )}
                  </View>
                );
              })}
            </View>
            <StandKeypad mode="phone" onKeyPress={handleStandPinKeyPress} />
            <TouchableOpacity
              onPress={() => { _setShowPinModal(false); _setPin(""); pendingActionRef.current = null; }}
              style={{ marginTop: 16 }}
            >
              <Text style={{ fontSize: 31, color: gray(0.5) }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {sViewMode === "buttons" ? (
        <View style={{ flex: 1 }}>
          {/* ── Header: "Add Customer" button when no WO/pending, full header when ready ── */}
          {!hasWorkorderReady ? (
            <View style={{ width: "100%", height: 1 }} />
          ) : (
            <View>
              {/* Header row: customer info + status + show/hide toggle */}
              <View
                onClick={() => { _setShowBikeDetails((p) => { if (p) _setDetailField(null); return !p; }); }}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6, cursor: "pointer" }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ fontSize: 18, fontWeight: "600", color: C.text }}>
                    {customerName || "Standalone Sale"}
                  </Text>
                  {customerCell ? (
                    <Text style={{ fontSize: 16, color: gray(0.5) }}>
                      {formatPhoneWithDashes(customerCell)}
                    </Text>
                  ) : null}
                </View>
                {selectedWorkorder && (
                  <View onClick={(e) => e.stopPropagation()}>
                    <StatusPickerModal
                      statuses={(zSettings.statuses || []).filter((s) => !s.systemOwned && !s.hidden)}
                      enabled={true}
                      onSelect={handleStatusSelect}
                      buttonStyle={{
                        backgroundColor: rs.backgroundColor,
                        paddingHorizontal: 12,
                      }}
                      buttonTextStyle={{
                        color: rs.textColor,
                        fontWeight: "normal",
                        fontSize: 18,
                      }}
                      modalCoordY={30}
                      buttonText={rs.label}
                    />
                  </View>
                )}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginRight: 10 }}>
                  {selectedWorkorder?.brand ? (
                    <Text style={{ fontSize: 17, fontWeight: "600", color: gray(0.5) }}>
                      {capitalizeFirstLetterOfString(selectedWorkorder.brand)}
                    </Text>
                  ) : null}
                  {selectedWorkorder?.description ? (
                    <Text style={{ fontSize: 17, fontWeight: "600", color: gray(0.5) }}>
                      {capitalizeFirstLetterOfString(selectedWorkorder.description)}
                    </Text>
                  ) : null}
                  <Image_ icon={ICONS.info} size={26} />
                  <Text style={{ fontSize: 18, fontStyle: "italic", color: gray(0.35) }}>Tap for info</Text>
                </View>
              </View>

              {/* Collapsible bike details panel */}
              {sShowBikeDetails && selectedWorkorder && (
                <View style={{ paddingHorizontal: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: gray(0.15) }}>

                  {/* Brand row */}
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                    <TouchableOpacity onPress={() => activateDetailField("brand")} style={{ width: "50%" }}>
                      <View pointerEvents="none">
                        <TextInput_
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
                      </View>
                    </TouchableOpacity>
                    <View style={{ width: "50%", flexDirection: "row", paddingLeft: 5, justifyContent: "space-between", alignItems: "center" }}>
                      <View style={{ width: "48%", height: "100%" }}>
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
                      </View>
                      <View style={{ width: 5 }} />
                      <View style={{ width: "48%", justifyContent: "center" }}>
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
                      </View>
                    </View>
                  </View>

                  {/* Description row */}
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                    <TouchableOpacity onPress={() => activateDetailField("description")} style={{ width: "50%" }}>
                      <View pointerEvents="none">
                        <TextInput_
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
                      </View>
                    </TouchableOpacity>
                    <View style={{ width: "50%", flexDirection: "row", paddingLeft: 5, justifyContent: "center", alignItems: "center" }}>
                      <View style={{ width: "100%" }}>
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
                      </View>
                    </View>
                  </View>

                  {/* Color row */}
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                    <View style={{ width: "50%", flexDirection: "row", alignItems: "center" }}>
                      <TouchableOpacity onPress={() => activateDetailField("color1")} style={{ width: "48%" }}>
                        <View pointerEvents="none">
                          <TextInput_
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
                        </View>
                      </TouchableOpacity>
                      <View style={{ width: "4%" }} />
                      <TouchableOpacity onPress={() => activateDetailField("color2")} style={{ width: "48%" }}>
                        <View pointerEvents="none">
                          <TextInput_
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
                        </View>
                      </TouchableOpacity>
                    </View>
                    <View style={{ width: "50%", flexDirection: "row", paddingLeft: 5, alignItems: "center", justifyContent: "space-between" }}>
                      <View style={{ width: "48%", height: "100%", justifyContent: "center" }}>
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
                      </View>
                      <View style={{ width: 5 }} />
                      <View style={{ width: "48%", height: "100%", justifyContent: "center" }}>
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
                      </View>
                    </View>
                  </View>

                  {/* Wait time row */}
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <View style={{ width: "50%", flexDirection: "row", alignItems: "center" }}>
                      <Text style={{ color: gray(0.5), fontSize: 18, marginRight: 4 }}>
                        Max wait days:
                      </Text>
                      <TouchableOpacity onPress={() => activateDetailField("waitDays")}>
                        <View pointerEvents="none">
                          <TextInput_
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
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          let current = Number(selectedWorkorder?.waitTime?.maxWaitTimeDays) || 0;
                          if (current <= 1) return;
                          let woID = selectedWorkorder.id;
                          let waitObj = { ...(selectedWorkorder?.waitTime || {}), maxWaitTimeDays: current - 1 };
                          useOpenWorkordersStore.getState().setField("waitTime", waitObj, woID, false);
                          clearTimeout(waitDaysDebounceRef.current);
                          waitDaysDebounceRef.current = setTimeout(() => {
                            let wo = useOpenWorkordersStore.getState().getWorkorders().find((w) => w.id === woID);
                            if (wo) useOpenWorkordersStore.getState().setField("waitTime", wo.waitTime, woID, true);
                          }, 500);
                        }}
                        disabled={!selectedWorkorder?.waitTime?.maxWaitTimeDays || Number(selectedWorkorder?.waitTime?.maxWaitTimeDays) <= 1}
                        style={{ marginLeft: 6, opacity: (!selectedWorkorder?.waitTime?.maxWaitTimeDays || Number(selectedWorkorder?.waitTime?.maxWaitTimeDays) <= 1) ? 0.3 : 1 }}
                      >
                        <Image_ icon={ICONS.minus} size={29} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          let current = Number(selectedWorkorder?.waitTime?.maxWaitTimeDays) || 0;
                          let woID = selectedWorkorder.id;
                          let waitObj = { ...(selectedWorkorder?.waitTime || {}), maxWaitTimeDays: current + 1 };
                          useOpenWorkordersStore.getState().setField("waitTime", waitObj, woID, false);
                          clearTimeout(waitDaysDebounceRef.current);
                          waitDaysDebounceRef.current = setTimeout(() => {
                            let wo = useOpenWorkordersStore.getState().getWorkorders().find((w) => w.id === woID);
                            if (wo) useOpenWorkordersStore.getState().setField("waitTime", wo.waitTime, woID, true);
                          }, 500);
                        }}
                        style={{ marginLeft: 4 }}
                      >
                        <Image_ icon={ICONS.add} size={29} />
                      </TouchableOpacity>
                    </View>
                    <View style={{ width: "50%", flexDirection: "row", paddingLeft: 5, alignItems: "center" }}>
                      <View style={{ width: "100%" }}>
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
                      </View>
                    </View>
                  </View>

                  {/* Wait estimate label */}
                  {(() => {
                    let estimateLabel = calculateWaitEstimateLabel(selectedWorkorder, zSettings);
                    let isMissing = estimateLabel === "Missing estimate" || estimateLabel === "No estimate";
                    return estimateLabel ? (
                      <Text
                        style={{
                          color: isMissing ? C.red : gray(0.5),
                          fontSize: 18,
                          fontStyle: "italic",
                          marginTop: 4,
                          paddingHorizontal: 4,
                          paddingVertical: 2,
                        }}
                      >
                        {estimateLabel}
                      </Text>
                    ) : null;
                  })()}

                  {/* On-screen keypad for detail fields */}
                  {sDetailField !== null && (
                    <View style={{ marginTop: 8 }}>
                      <StandKeypad mode={detailKeypadMode} onKeyPress={handleDetailKeyPress} />
                      <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 6, paddingHorizontal: 4 }}>
                        <TouchableOpacity
                          onPress={() => _setDetailField(null)}
                          style={{ padding: 4 }}
                        >
                          <Image_ icon={ICONS.close1} size={32} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {/* Tap/swipe-up divider to hide */}
                  <View
                    onClick={() => { _setShowBikeDetails(false); _setDetailField(null); }}
                    onTouchStart={(e) => { swipeDividerRef.current = e.touches[0].clientY; }}
                    onTouchEnd={(e) => {
                      if (swipeDividerRef.current !== null) {
                        let diff = e.changedTouches[0].clientY - swipeDividerRef.current;
                        if (diff < -20) { _setShowBikeDetails(false); _setDetailField(null); }
                        swipeDividerRef.current = null;
                      }
                    }}
                    style={{
                      height: 15,
                      alignItems: "center",
                      justifyContent: "center",
                      marginTop: 4,
                      cursor: "pointer",
                    }}
                  >
                    <Text style={{ fontSize: 16, fontStyle: "italic", color: gray(0.35) }}>Tap to hide</Text>
                  </View>

                </View>
              )}
            </View>
          )}

          {/* Centered new/search overlay when no workorder */}
          {!hasWorkorderReady && (
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                justifyContent: "center",
                alignItems: "center",
                zIndex: 10,
              }}
            >
              <View style={{ flexDirection: "column", gap: 24 }}>
                <TouchableOpacity
                  onPress={handleNewWorkorderPress}
                  style={{
                    backgroundColor: C.green,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: 60,
                    paddingHorizontal: 60,
                    gap: 12,
                  }}
                >
                  <Image_ icon={ICONS.gears1} size={69} />
                  <Text style={{ fontSize: 32, fontWeight: "700", color: C.textWhite }}>New Workorder</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    pendingActionRef.current = () => _setShowWorkorderList(true);
                    startFaceLogin();
                  }}
                  style={{
                    backgroundColor: C.blue,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: 60,
                    paddingHorizontal: 60,
                    gap: 12,
                  }}
                >
                  <Image_ icon={ICONS.search} size={69} />
                  <Text style={{ fontSize: 32, fontWeight: "700", color: C.textWhite }}>Find Workorder</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── 20% sidebar + 80% canvas ── */}
          <View style={{ flex: 1, flexDirection: "row", opacity: hasWorkorderReady ? 1 : 0.35 }} pointerEvents={hasWorkorderReady ? "auto" : "none"}>
            {/* Left sidebar - root buttons */}
            <View style={{ width: "20%", borderRightWidth: 1, borderRightColor: gray(0.15) }}>
              {/* Breadcrumbs in sidebar */}
              {sCurrentParentID !== null && sMenuPath.length > 0 && (
                <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 6, paddingTop: 6, paddingBottom: 4, flexWrap: "wrap" }}>
                  <TouchableOpacity
                    onPress={() => {
                      _setCurrentParentID(null);
                      _setMenuPath([]);
                      _setSelectedButtonID(null);
                    }}
                  >
                    <Text style={{ fontSize: 13, color: C.blue, fontWeight: "600" }}>{"\u2190"} All</Text>
                  </TouchableOpacity>
                  {sMenuPath.map((crumb, i) => (
                    <View key={crumb.id} style={{ flexDirection: "row", alignItems: "center" }}>
                      <Text style={{ color: gray(0.3), marginHorizontal: 3, fontSize: 13 }}>{">"}</Text>
                      <TouchableOpacity
                        onPress={() => {
                          let newPath = sMenuPath.slice(0, i + 1);
                          _setMenuPath(newPath);
                          _setCurrentParentID(crumb.id);
                          let crumbBtn = (zQuickItemButtons || []).find((b) => b.id === crumb.id);
                          if (crumbBtn?.items?.length > 0) {
                            _setSelectedButtonID(crumb.id);
                          } else {
                            _setSelectedButtonID(null);
                          }
                        }}
                      >
                        <Text style={{
                          color: i === sMenuPath.length - 1 ? gray(0.4) : gray(0.55),
                          fontSize: 13,
                          fontWeight: i === sMenuPath.length - 1 ? "bold" : "normal",
                        }}>
                          {(crumb.name || "").toUpperCase()}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {/* Button list */}
              <ScrollView style={{ flex: 1, paddingHorizontal: 6, paddingTop: 6 }}>
                {/* Inventory search button — always top */}
                <View style={{ marginBottom: 6 }}>
                  <Button_
                    onPress={() => _setShowInventoryModal(true)}
                    colorGradientArr={COLOR_GRADIENTS.purple}
                    buttonStyle={{
                      borderWidth: 1,
                      borderRadius: 5,
                      borderColor: C.buttonLightGreenOutline,
                      paddingHorizontal: 4,
                      paddingVertical: 14,
                      backgroundColor: undefined,
                    }}
                    textStyle={{
                      fontSize: 19,
                      fontWeight: 400,
                      textAlign: "center",
                      color: C.textWhite,
                    }}
                    text={"INVENTORY"}
                  />
                </View>
                {(sCurrentParentID
                  ? currentChildren
                  : (zQuickItemButtons || []).filter((b) => !b.parentID)
                ).map((item) => {
                  let isActive =
                    sSelectedButtonID === item.id ||
                    (sMenuPath.length > 0 && sMenuPath[0].id === item.id);
                  return (
                    <View key={item.id} style={{ marginBottom: 6 }}>
                      <Button_
                        onPress={() => handleNavButtonPress(item)}
                        colorGradientArr={isActive ? ["rgb(245,166,35)", "rgb(245,166,35)"] : (item.id === "labor" || item.id === "item" || item.id === "common") ? COLOR_GRADIENTS.green : COLOR_GRADIENTS.blue}
                        buttonStyle={{
                          borderWidth: 1,
                          borderRadius: 5,
                          borderColor: C.buttonLightGreenOutline,
                          paddingHorizontal: 4,
                          paddingVertical: item.id === "common" ? 22 : (splitButtonLabel(item.name).split("\n").length > 1 || item.name.length > 17) ? 10 : 20,
                          backgroundColor: undefined,
                        }}
                        numLines={splitButtonLabel(item.name).split("\n").length > 1 ? splitButtonLabel(item.name).split("\n").length : (item.name.length > 17 ? 2 : 1)}
                        textStyle={{
                          fontSize: getQuickButtonFontSize(item.name, 12),
                          fontWeight: 400,
                          textAlign: "center",
                          color: isActive ? "white" : C.textWhite,
                        }}
                        text={splitButtonLabel(item.name).toUpperCase()}
                      />
                    </View>
                  );
                })}
              </ScrollView>

              {/* Static bottom container: Print + New buttons */}
              {hasWorkorderReady && (
                <View style={{ paddingHorizontal: 6, paddingVertical: 6, borderTopWidth: 1, borderTopColor: gray(0.15) }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    {/* Print button — opens unified print modal */}
                    {selectedWorkorder && (
                      <TouchableOpacity
                        onPress={() => _setShowPrinterSelectModal(true)}
                        style={{
                          alignItems: "center",
                          justifyContent: "center",
                          paddingHorizontal: 4,
                        }}
                      >
                        <Image_ icon={selectedPrinterOffline ? warningIcon : ICONS.print} size={28} />
                      </TouchableOpacity>
                    )}

                    {/* Search workorders button */}
                    <TouchableOpacity
                      onPress={() => _setShowWorkorderList(true)}
                      style={{
                        alignItems: "center",
                        justifyContent: "center",
                        paddingHorizontal: 4,
                      }}
                    >
                      <Image_ icon={ICONS.search} size={34} />
                    </TouchableOpacity>

                    {/* New workorder button */}
                    <TouchableOpacity
                      onPress={handleNewWorkorderPress}
                      style={{
                        alignItems: "center",
                        justifyContent: "center",
                        paddingHorizontal: 4,
                      }}
                    >
                      <Image_ icon={plusIcon} size={30} />
                    </TouchableOpacity>

                    {/* Edit sub-menu sizing */}
                    <TouchableOpacity
                      onPress={() => _setSubMenuEditMode(!sSubMenuEditMode)}
                      style={{
                        alignItems: "center",
                        justifyContent: "center",
                        paddingHorizontal: 4,
                        marginLeft: "auto",
                      }}
                    >
                      <Image_ icon={ICONS.editPencil} size={24} />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            {/* Right panel - canvas */}
            <View style={{ width: "80%", position: "relative" }}>
              {/* Breadcrumbs + child buttons above canvas */}
              {sCurrentParentID !== null && (
                <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingBottom: 4, paddingTop: 4, flexWrap: "wrap" }}>
                  {sMenuPath.map((crumb, i) => (
                    <View key={crumb.id} style={{ flexDirection: "row", alignItems: "center" }}>
                      {i > 0 && (
                        <Text style={{ color: gray(0.3), marginHorizontal: 4, fontSize: 15 }}>{">"}</Text>
                      )}
                      <TouchableOpacity
                        onPress={() => {
                          let newPath = sMenuPath.slice(0, i + 1);
                          _setMenuPath(newPath);
                          _setCurrentParentID(crumb.id);
                          let crumbBtn = (zQuickItemButtons || []).find((b) => b.id === crumb.id);
                          if (crumbBtn?.items?.length > 0) {
                            _setSelectedButtonID(crumb.id);
                          } else {
                            _setSelectedButtonID(null);
                          }
                        }}
                      >
                        <Text style={{
                          color: i === sMenuPath.length - 1 ? gray(0.4) : gray(0.55),
                          fontSize: 15,
                          fontWeight: i === sMenuPath.length - 1 ? "bold" : "normal",
                        }}>
                          {(crumb.name || "(unnamed)").toUpperCase()}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {currentChildren.length > 0 && (
                <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 0 }}>
                  {currentChildren.map((btn) => {
                    let isSelected = sSelectedButtonID === btn.id;
                    return (
                      <Button_
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
                </View>
              )}

              {/* Canvas */}
              {sSelectedButtonID ? (
                <ScrollView style={{ flex: 1, backgroundColor: lightenRGBByPercent(C.backgroundWhite, 20) }}>
                  <div
                    style={{
                      position: "relative",
                      width: "100%",
                      minHeight: Math.max(500, canvasMaxBottom * 8) * (1 + sSubMenuHeightAdj * 0.03),
                      overflow: "hidden",
                      borderRadius: 6,
                      padding: 5,
                      boxSizing: "border-box",
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
                        <TouchableOpacity
                          key={itemObj.inventoryItemID}
                          activeOpacity={0.6}
                          onPress={(e) => {
                            if (sDiscountCardID) { _setDiscountCardID(null); return; }
                            const now = Date.now();
                            if (lastCanvasClickItemRef.current === itemObj.inventoryItemID && now - lastCanvasClickTimeRef.current < 500) {
                              lastCanvasClickTimeRef.current = 0;
                              lastCanvasClickItemRef.current = null;
                              openNoteHelperForCanvasItem(invItem, e);
                            } else {
                              lastCanvasClickTimeRef.current = now;
                              lastCanvasClickItemRef.current = itemObj.inventoryItemID;
                              inventoryItemSelected(invItem);
                            }
                          }}
                          onLongPress={() => {
                            if (!selectedWorkorder) return;
                            let hasLine = (selectedWorkorder.workorderLines || []).some(
                              (ln) => ln.inventoryItem?.id === itemObj.inventoryItemID
                            );
                            if (hasLine) _setDiscountCardID(itemObj.inventoryItemID);
                          }}
                          delayLongPress={500}
                          style={{
                            position: "absolute",
                            left: (itemObj.x || 0) + "%",
                            top: (itemObj.y || 0) + "%",
                            width: w + "%",
                            height: h + "%",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            borderWidth: 1,
                            borderColor: C.buttonLightGreenOutline,
                            borderRadius: 8,
                            backgroundColor: itemObj.backgroundColor || (isOnWorkorder ? lightenRGBByPercent(C.blue, 70) : C.buttonLightGreenOutline),
                            overflow: "visible",
                            paddingHorizontal: 4,
                            paddingVertical: 2,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: fontSize,
                              color: itemObj.textColor || (invItem ? C.text : gray(0.35)),
                              textAlign: "center",
                              fontWeight: "500",
                            }}
                          >
                            {name}
                          </Text>
                          {hasDiscount && (
                            <Text style={{ fontSize: 10, color: C.green, fontWeight: "600" }}>
                              {workorderLine.discountObj.name || "Discount"}
                            </Text>
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
                                border: "1px solid " + gray(0.2),
                                boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                                minWidth: 140,
                                overflow: "hidden",
                              }}
                            >
                              <div
                                onClick={() => handleDiscountSelect(itemObj.inventoryItemID, null)}
                                style={{ padding: "9px 10px", cursor: "pointer", fontSize: 19, color: C.text, borderBottom: "1px solid " + gray(0.1) }}
                                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = gray(0.05); }}
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
                                  style={{ padding: "9px 10px", cursor: "pointer", fontSize: 19, color: C.text, borderBottom: "1px solid " + gray(0.1) }}
                                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = gray(0.05); }}
                                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "white"; }}
                                >
                                  {d.name}
                                </div>
                              ))}
                            </div>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                    {canvasItems.length === 0 && (
                      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 60 }}>
                        <Text style={{ fontSize: 16, color: gray(0.5), marginTop: 12 }}>No items in this menu</Text>
                      </View>
                    )}
                  </div>
                </ScrollView>
              ) : (
                <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                  <Text style={{ fontSize: 16, color: gray(0.4) }}>Select a button to view items</Text>
                </View>
              )}

              {/* Workorder items overlay — grows upward from bottom */}
              {sShowItemOverlay && selectedWorkorder?.workorderLines?.length > 0 && (
                <View
                  pointerEvents="box-none"
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: 0,
                    bottom: 0,
                    justifyContent: "flex-end",
                    paddingHorizontal: 8,
                    paddingBottom: 58,
                  }}
                >
                  {selectedWorkorder.workorderLines.map((line) => {
                    let inv = line.inventoryItem || {};
                    let informal = inv.informalName || "";
                    let formal = inv.formalName || "";
                    let qtyLabel = (line.qty || 1) > 1 ? " x" + line.qty : "";
                    let isSwiped = sSwipedCardID === line.id;
                    let isSwipedLeft = isSwiped && sSwipeDir === "left";
                    let isSwipedRight = isSwiped && sSwipeDir === "right";
                    return (
                      <View
                        key={line.id}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          alignSelf: "flex-start",
                          marginTop: 4,
                        }}
                      >
                        {/* Discount icon — revealed on swipe right */}
                        {isSwipedRight && (
                          <TouchableOpacity
                            onPress={() => {
                              _setSwipedCardID(null);
                              _setSwipeDir(null);
                              _setDiscountCardID(line.inventoryItem?.id === sDiscountCardID ? null : line.inventoryItem?.id);
                            }}
                            style={{
                              backgroundColor: lightenRGBByPercent(C.orange, 50),
                              borderRadius: 6,
                              paddingVertical: 5,
                              paddingHorizontal: 8,
                              marginRight: 4,
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Image_ icon={ICONS.dollarYellow} size={22} />
                          </TouchableOpacity>
                        )}

                        {/* Card body — tap opens notes modal */}
                        <TouchableOpacity
                          activeOpacity={0.6}
                          onPress={() => {
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
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            backgroundColor: "rgba(255,255,255,0.65)",
                            borderRadius: 6,
                            borderWidth: 1,
                            borderColor: C.buttonLightGreenOutline,
                            paddingVertical: 5,
                            paddingHorizontal: 10,
                          }}
                        >
                          {!inv.customPart && !inv.customLabor && (
                            <Image_ icon={ICONS.editPencil} size={26} style={{ opacity: 0.5, marginRight: 5 }} />
                          )}
                          {(inv.customPart || inv.customLabor) && (
                            <Image_ icon={inv.customLabor ? ICONS.tools1 : ICONS.gears1} size={16} style={{ marginRight: 5 }} />
                          )}
                          <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                            <Text style={{ fontSize: 20, color: C.text, flexShrink: 1 }} numberOfLines={1}>
                              {informal ? informal + " \u2192 " + formal : formal}
                            </Text>
                            {(line.qty || 1) > 1 && (
                              <View style={{
                                backgroundColor: C.blue,
                                borderRadius: 10,
                                minWidth: 24,
                                height: 24,
                                alignItems: "center",
                                justifyContent: "center",
                                paddingHorizontal: 5,
                                marginLeft: 5,
                              }}>
                                <Text style={{ fontSize: 14, fontWeight: "700", color: C.textWhite }}>{line.qty}</Text>
                              </View>
                            )}
                            <View style={{
                              backgroundColor: lightenRGBByPercent(C.green, 70),
                              borderRadius: 10,
                              paddingHorizontal: 7,
                              paddingVertical: 2,
                              marginLeft: 6,
                            }}>
                              <Text style={{ fontSize: 17, fontWeight: "600", color: C.text }}>
                                {formatCurrencyDisp((inv.price || 0) * (line.qty || 1), true)}
                              </Text>
                            </View>
                          </View>
                        </TouchableOpacity>

                        {/* Delete icon — revealed on swipe left */}
                        {isSwipedLeft && (
                          <TouchableOpacity
                            onPress={() => removeWorkorderLine(line.id)}
                            style={{
                              backgroundColor: lightenRGBByPercent("rgb(103, 124, 231)", 50),
                              borderRadius: 6,
                              paddingVertical: 5,
                              paddingHorizontal: 8,
                              marginLeft: 4,
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Image_ icon={ICONS.trash} size={22} />
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}

                </View>
              )}

              {/* Footer — totals or size editor */}
              {sSubMenuEditMode ? (
                <View style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 8,
                  paddingHorizontal: 10,
                  borderTopWidth: 1,
                  borderTopColor: gray(0.1),
                  backgroundColor: "rgba(255,255,255,0.65)",
                  gap: 16,
                }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: gray(0.5) }}>W</Text>
                    <TouchableOpacity onPress={() => { let v = sSubMenuWidthAdj - 1; _setSubMenuWidthAdj(v); localStorageWrapper.setItem("standSubMenuWidthAdj", String(v)); }} style={{ width: 30, height: 30, borderRadius: 6, backgroundColor: gray(0.1), alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 16, fontWeight: "700", color: C.text }}>-</Text>
                    </TouchableOpacity>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: C.text, minWidth: 20, textAlign: "center" }}>{sSubMenuWidthAdj}</Text>
                    <TouchableOpacity onPress={() => { let v = sSubMenuWidthAdj + 1; _setSubMenuWidthAdj(v); localStorageWrapper.setItem("standSubMenuWidthAdj", String(v)); }} style={{ width: 30, height: 30, borderRadius: 6, backgroundColor: gray(0.1), alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 16, fontWeight: "700", color: C.text }}>+</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: gray(0.5) }}>H</Text>
                    <TouchableOpacity onPress={() => { let v = sSubMenuHeightAdj - 1; _setSubMenuHeightAdj(v); localStorageWrapper.setItem("standSubMenuHeightAdj", String(v)); }} style={{ width: 30, height: 30, borderRadius: 6, backgroundColor: gray(0.1), alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 16, fontWeight: "700", color: C.text }}>-</Text>
                    </TouchableOpacity>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: C.text, minWidth: 20, textAlign: "center" }}>{sSubMenuHeightAdj}</Text>
                    <TouchableOpacity onPress={() => { let v = sSubMenuHeightAdj + 1; _setSubMenuHeightAdj(v); localStorageWrapper.setItem("standSubMenuHeightAdj", String(v)); }} style={{ width: 30, height: 30, borderRadius: 6, backgroundColor: gray(0.1), alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 16, fontWeight: "700", color: C.text }}>+</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: gray(0.5) }}>Font</Text>
                    <TouchableOpacity onPress={() => { let v = sSubMenuFontAdj - 1; _setSubMenuFontAdj(v); localStorageWrapper.setItem("standSubMenuFontAdj", String(v)); }} style={{ width: 30, height: 30, borderRadius: 6, backgroundColor: gray(0.1), alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 16, fontWeight: "700", color: C.text }}>-</Text>
                    </TouchableOpacity>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: C.text, minWidth: 20, textAlign: "center" }}>{sSubMenuFontAdj}</Text>
                    <TouchableOpacity onPress={() => { let v = sSubMenuFontAdj + 1; _setSubMenuFontAdj(v); localStorageWrapper.setItem("standSubMenuFontAdj", String(v)); }} style={{ width: 30, height: 30, borderRadius: 6, backgroundColor: gray(0.1), alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 16, fontWeight: "700", color: C.text }}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
              <View
                onClick={() => _setShowItemOverlay((p) => !p)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  borderTopWidth: 1,
                  borderTopColor: gray(0.1),
                  backgroundColor: "rgba(255,255,255,0.65)",
                  cursor: "pointer",
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                  <View style={{ alignItems: "center" }}>
                    <Text style={{ fontSize: 12, color: gray(0.5) }}>Subtotal</Text>
                    <Text style={{ fontSize: 16, fontWeight: "600", color: C.text }}>{formatCurrencyDisp(totals.runningSubtotal, true)}</Text>
                  </View>
                  <View style={{ alignItems: "center" }}>
                    <Text style={{ fontSize: 12, color: gray(0.5) }}>Discount</Text>
                    <Text style={{ fontSize: 16, fontWeight: "600", color: C.red }}>-{formatCurrencyDisp(totals.runningDiscount, true)}</Text>
                  </View>
                  <View style={{ alignItems: "center" }}>
                    <Text style={{ fontSize: 12, color: gray(0.5) }}>Tax</Text>
                    <Text style={{ fontSize: 16, fontWeight: "600", color: C.text }}>{formatCurrencyDisp(totals.runningTax, true)}</Text>
                  </View>
                  <View style={{ alignItems: "center" }}>
                    <Text style={{ fontSize: 15, color: gray(0.5) }}>Total</Text>
                    <Text style={{ fontSize: 20, fontWeight: "700", color: C.text }}>{formatCurrencyDisp(totals.finalTotal, true)}</Text>
                  </View>
                </View>
                {selectedWorkorder?.workorderLines?.length > 0 && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginRight: 10 }}>
                    <Text style={{ fontSize: 22, fontStyle: "italic", color: gray(0.35) }}>Tap for items</Text>
                    <View style={{
                      backgroundColor: C.blue,
                      borderRadius: 8,
                      minWidth: 24,
                      height: 24,
                      alignItems: "center",
                      justifyContent: "center",
                      paddingHorizontal: 4,
                    }}>
                      <Text style={{ fontSize: 17, fontWeight: "700", color: C.textWhite }}>
                        {selectedWorkorder.workorderLines.reduce((sum, ln) => sum + (ln.qty || 1), 0)}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
              )}
            </View>
          </View>

          {/* Printer selection modal */}
          {sShowPrinterSelectModal && (
            <View style={{
              position: "absolute",
              top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: "rgba(0,0,0,0.5)",
              justifyContent: "center",
              alignItems: "center",
            }}>
              <View style={{
                backgroundColor: C.listItemWhite,
                borderRadius: 14,
                width: "75%",
                maxHeight: "85%",
                overflow: "hidden",
              }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: gray(0.15) }}>
                  <Text style={{ fontSize: 20, fontWeight: "700", color: C.text }}>Print & Send</Text>
                  <TouchableOpacity onPress={() => _setShowPrinterSelectModal(false)}>
                    <Text style={{ fontSize: 22, fontWeight: "700", color: gray(0.4) }}>X</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView style={{ paddingHorizontal: 20, paddingVertical: 16 }}>

                  {/* Intake section */}
                  <Text style={{ fontSize: 13, fontWeight: "700", color: gray(0.5), marginBottom: 8, letterSpacing: 1 }}>INTAKE</Text>
                  <View style={{
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: C.buttonLightGreenOutline,
                    backgroundColor: C.backgroundListWhite,
                    padding: 14,
                    marginBottom: 20,
                  }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 15 }}>
                        <Button_
                          text="Print"
                          onPress={() => { handleIntakePrint(); _setShowPrinterSelectModal(false); }}
                          colorGradientArr={COLOR_GRADIENTS.green}
                          style={{ paddingVertical: 14, paddingHorizontal: 24 }}
                          textStyle={{ fontSize: 16, fontWeight: "700" }}
                          enabled={!!sSelectedPrinterID && !selectedPrinterOffline}
                        />
                        {(customerCell || customerEmail) ? (
                          <Button_
                            text={customerCell && customerEmail ? "Text & Email" : customerCell ? "Text" : "Email"}
                            onPress={() => { handleIntakeElectronic(); _setShowPrinterSelectModal(false); }}
                            colorGradientArr={COLOR_GRADIENTS.blue}
                            style={{ paddingVertical: 14, paddingHorizontal: 24 }}
                            textStyle={{ fontSize: 16, fontWeight: "700" }}
                          />
                        ) : null}
                      </View>
                      {(customerCell || customerEmail) ? (
                        <Button_
                          text="Both"
                          onPress={() => { handleIntakePrint(); handleIntakeElectronic(); _setShowPrinterSelectModal(false); }}
                          colorGradientArr={COLOR_GRADIENTS.purple}
                          style={{ paddingVertical: 14, paddingHorizontal: 24 }}
                          textStyle={{ fontSize: 16, fontWeight: "700" }}
                          enabled={!!sSelectedPrinterID && !selectedPrinterOffline}
                        />
                      ) : null}
                    </View>
                  </View>

                  {/* Workorder section */}
                  <Text style={{ fontSize: 13, fontWeight: "700", color: gray(0.5), marginBottom: 8, letterSpacing: 1 }}>WORKORDER</Text>
                  <View style={{
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: C.buttonLightGreenOutline,
                    backgroundColor: C.backgroundListWhite,
                    padding: 14,
                    marginBottom: 20,
                  }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 15 }}>
                        <Button_
                          text="Print"
                          onPress={() => { handleWorkorderPrint(); _setShowPrinterSelectModal(false); }}
                          colorGradientArr={COLOR_GRADIENTS.green}
                          style={{ paddingVertical: 14, paddingHorizontal: 24 }}
                          textStyle={{ fontSize: 16, fontWeight: "700" }}
                          enabled={!!sSelectedPrinterID && !selectedPrinterOffline}
                        />
                        {(customerCell || customerEmail) ? (
                          <Button_
                            text={customerCell && customerEmail ? "Text & Email" : customerCell ? "Text" : "Email"}
                            onPress={() => { handleWorkorderElectronic(); _setShowPrinterSelectModal(false); }}
                            colorGradientArr={COLOR_GRADIENTS.blue}
                            style={{ paddingVertical: 14, paddingHorizontal: 24 }}
                            textStyle={{ fontSize: 16, fontWeight: "700" }}
                          />
                        ) : null}
                      </View>
                      {(customerCell || customerEmail) ? (
                        <Button_
                          text="Both"
                          onPress={() => { handleWorkorderPrint(); handleWorkorderElectronic(); _setShowPrinterSelectModal(false); }}
                          colorGradientArr={COLOR_GRADIENTS.purple}
                          style={{ paddingVertical: 14, paddingHorizontal: 24 }}
                          textStyle={{ fontSize: 16, fontWeight: "700" }}
                          enabled={!!sSelectedPrinterID && !selectedPrinterOffline}
                        />
                      ) : null}
                    </View>
                  </View>

                  {/* Printer selection section */}
                  <Text style={{ fontSize: 13, fontWeight: "700", color: gray(0.5), marginBottom: 8, letterSpacing: 1 }}>PRINTER</Text>
                  {receiptPrinters.length === 0 ? (
                    <Text style={{ fontSize: 16, color: gray(0.5), paddingVertical: 20, textAlign: "center" }}>No receipt printers configured</Text>
                  ) : (
                    receiptPrinters.map((printer, idx) => {
                      let isSelected = printer.id === sSelectedPrinterID;
                      let isOnline = printer.active === true;
                      return (
                        <View
                          key={printer.id}
                          style={{
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: isSelected ? C.green : gray(0.15),
                            backgroundColor: isSelected ? lightenRGBByPercent(C.green, 70) : C.backgroundListWhite,
                            padding: 12,
                            marginBottom: idx < receiptPrinters.length - 1 ? 8 : 0,
                          }}
                        >
                          {!isOnline ? (
                            <View style={{ marginBottom: 6 }}>
                              <Text style={{ fontSize: 12, fontWeight: "700", color: C.red, backgroundColor: "yellow", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: "hidden", alignSelf: "flex-start" }}>Printer Offline</Text>
                            </View>
                          ) : null}
                          <TouchableOpacity
                            onPress={() => handleSelectPrinter(printer.id)}
                            style={{ flexDirection: "row", alignItems: "center" }}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 17, fontWeight: isSelected ? "700" : "normal", color: C.text }}>
                                {printer.label || printer.printerName || printer.id}
                              </Text>
                              {printer.printerName && printer.label ? (
                                <Text style={{ fontSize: 14, color: gray(0.5), marginTop: 2 }}>{printer.printerName}</Text>
                              ) : null}
                            </View>
                            {isSelected && (
                              <Text style={{ fontSize: 18, color: C.green, fontWeight: "700" }}>{"\u2713"}</Text>
                            )}
                          </TouchableOpacity>
                          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10, justifyContent: "flex-end" }}>
                            <Button_
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
                          </View>
                        </View>
                      );
                    })
                  )}
                  <View style={{ height: 16 }} />
                </ScrollView>
              </View>
            </View>
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
            }

            return (
            <div
              onClick={() => _setIntakeNotesLineID(null)}
              style={{
                position: "absolute",
                top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: "rgba(0,0,0,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 9999,
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: "95%",
                  height: "98%",
                  backgroundColor: "rgba(255,255,255,0.97)",
                  borderRadius: 12,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
              >
                {/* Header: item name + target toggle + tap/swipe to close */}
                <div
                  onClick={() => _setIntakeNotesLineID(null)}
                  onTouchStart={(e) => { notesSwipeRef.current = e.touches[0].clientY; }}
                  onTouchEnd={(e) => {
                    if (notesSwipeRef.current !== null) {
                      let diff = e.changedTouches[0].clientY - notesSwipeRef.current;
                      if (diff > 20) _setIntakeNotesLineID(null);
                      notesSwipeRef.current = null;
                    }
                  }}
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: 10,
                    borderBottom: "1px solid " + gray(0.1),
                    cursor: "pointer",
                  }}
                >
                  <Text style={{ fontSize: 22, fontWeight: "600", color: C.text }} numberOfLines={1}>{itemLabel}</Text>
                  <View onClick={(e) => e.stopPropagation()} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ fontSize: 15, fontStyle: "italic", color: gray(0.4) }}>Font size</Text>
                    <TouchableOpacity
                      onPress={() => {
                        let next = sNoteHelperFontAdj - 1;
                        _setNoteHelperFontAdj(next);
                        localStorageWrapper.setItem("standNoteHelperFontAdj", String(next));
                      }}
                      style={{ padding: 4 }}
                    >
                      <Image_ source={ICONS.minus} style={{ width: 22, height: 22 }} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        let next = sNoteHelperFontAdj + 1;
                        _setNoteHelperFontAdj(next);
                        localStorageWrapper.setItem("standNoteHelperFontAdj", String(next));
                      }}
                      style={{ padding: 4 }}
                    >
                      <Image_ source={ICONS.add} style={{ width: 22, height: 22 }} />
                    </TouchableOpacity>
                  </View>
                  <Text style={{ fontSize: 18, fontStyle: "italic", color: gray(0.35) }}>Tap to close</Text>
                </div>

                {/* Note helper categories - horizontal sections */}
                <ScrollView style={{ flex: 1, paddingHorizontal: 10, paddingTop: 8 }}>
                  <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                    {noteHelpers.map((category) => (
                      <View key={category.id} style={{ marginRight: 16, marginBottom: 10, borderWidth: 1, borderColor: gray(0.15), borderRadius: 8, padding: 12 }}>
                        <Text style={{ fontSize: 19 + sNoteHelperFontAdj, fontWeight: "700", color: gray(0.4), marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>
                          {category.label}
                        </Text>
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                          {(category.items || []).map((item, chipIdx) => {
                            let insertText = typeof item === "string" ? item : (item.text || item.buttonLabel || "").trim();
                            let displayLabel = typeof item === "string" ? item : (item.buttonLabel || "");
                            let active = sActiveNoteChips.has(category.id + "::" + insertText);
                            return (
                              <TouchableOpacity
                                key={(item.id || displayLabel) + chipIdx}
                                onPress={() => toggleNoteChip(category.id, item)}
                                style={{
                                  backgroundColor: active ? lightenRGBByPercent(C.blue, 70) : C.buttonLightGreenOutline,
                                  borderRadius: 5,
                                  paddingHorizontal: 12,
                                  paddingVertical: 12,
                                  borderWidth: 1,
                                  borderColor: active ? C.blue : C.buttonLightGreenOutline,
                                }}
                              >
                                <Text style={{ fontSize: 25 + sNoteHelperFontAdj, color: active ? C.blue : gray(0.5), fontWeight: active ? "600" : "400" }}>
                                  {displayLabel}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    ))}
                  </View>
                </ScrollView>

                {/* Notes target label + toggle */}
                <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 6, gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => switchNotesTarget("intakeNotes")}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 5,
                      borderRadius: 6,
                      backgroundColor: sNotesTarget === "intakeNotes" ? C.orange : gray(0.08),
                    }}
                  >
                    <Text style={{ fontSize: 19, fontWeight: "600", color: sNotesTarget === "intakeNotes" ? C.textWhite : gray(0.5) }}>Intake</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => switchNotesTarget("receiptNotes")}
                    style={{
                      marginLeft: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 5,
                      borderRadius: 6,
                      backgroundColor: sNotesTarget === "receiptNotes" ? C.green : gray(0.08),
                    }}
                  >
                    <Text style={{ fontSize: 19, fontWeight: "600", color: sNotesTarget === "receiptNotes" ? C.textWhite : gray(0.5) }}>Receipt</Text>
                  </TouchableOpacity>
                  <Text style={{ fontSize: 21, color: gray(0.4) }}>
                    Adding to <Text style={{ color: sNotesTarget === "intakeNotes" ? C.orange : C.green }}>{sNotesTarget === "intakeNotes" ? "Intake" : "Receipt"}</Text> notes
                  </Text>
                </View>
                <View style={{ paddingHorizontal: 10, paddingBottom: 6 }}>
                  <View style={{
                    borderWidth: 2,
                    borderColor: C.buttonLightGreenOutline,
                    borderRadius: 8,
                    backgroundColor: C.listItemWhite,
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    minHeight: 44,
                    maxHeight: 44,
                  }}>
                    <Text style={{ fontSize: 22, color: C.text }} numberOfLines={2}>
                      {activeText}<Text style={{ color: C.blue }}>|</Text>
                    </Text>
                  </View>
                </View>

                {/* Keypad */}
                <View style={{ paddingHorizontal: 10, paddingBottom: 6 }}>
                  <StandKeypad mode="alpha" showNumberRow={true} onKeyPress={(key) => {
                    if (key === "CLR") { activeSetText(""); return; }
                    if (key === "\u232B") { activeSetText(activeText.slice(0, -1)); return; }
                    let char = key === " " ? " " : key.toLowerCase();
                    if (activeText.length === 0) char = key.toUpperCase();
                    activeSetText(activeText + char);
                  }} />
                </View>

                {/* Action buttons: Discount, Split, Save */}
                <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingBottom: 10, gap: 8 }}>
                  {/* Discount button */}
                  <View style={{ position: "relative" }}>
                    <TouchableOpacity
                      onPress={() => _setNotesDiscountOpen((p) => !p)}
                      style={{
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                        borderRadius: 8,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Image_ icon={ICONS.dollarYellow} size={32} />
                    </TouchableOpacity>
                    {sNotesDiscountOpen && (() => {
                      let currentLine = (selectedWorkorder?.workorderLines || []).find((ln) => ln.id === sIntakeNotesLineID);
                      let invItemID = currentLine?.inventoryItem?.id;
                      return (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            position: "absolute",
                            bottom: "100%",
                            left: 0,
                            zIndex: 100,
                            backgroundColor: "white",
                            borderRadius: 6,
                            border: "1px solid " + gray(0.2),
                            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                            minWidth: 160,
                            overflow: "hidden",
                            marginBottom: 4,
                          }}
                        >
                          <div
                            onClick={() => { handleDiscountSelect(invItemID, null); _setNotesDiscountOpen(false); }}
                            style={{ padding: "9px 10px", cursor: "pointer", fontSize: 19, color: C.text, borderBottom: "1px solid " + gray(0.1) }}
                          >
                            No Discount
                          </div>
                          {(zSettings.discounts || [])
                            .filter((d) => d.type !== "$" || Number(d.value) <= (currentLine?.inventoryItem?.price || 0) * (currentLine?.qty || 1))
                            .map((d, dIdx) => (
                            <div
                              key={d.name + "-" + dIdx}
                              onClick={() => { handleDiscountSelect(invItemID, d); _setNotesDiscountOpen(false); }}
                              style={{ padding: "9px 10px", cursor: "pointer", fontSize: 19, color: C.text, borderBottom: "1px solid " + gray(0.1) }}
                            >
                              {d.name}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </View>
                  {/* Split button */}
                  {(() => {
                    let currentLine = (selectedWorkorder?.workorderLines || []).find((ln) => ln.id === sIntakeNotesLineID);
                    let canSplit = (currentLine?.qty || 1) > 1;
                    return (
                      <TouchableOpacity
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
                        disabled={!canSplit}
                        style={{
                          paddingVertical: 12,
                          paddingHorizontal: 14,
                          borderRadius: 8,
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: canSplit ? 1 : 0.4,
                        }}
                      >
                        <Image_ icon={ICONS.axe} size={32} />
                      </TouchableOpacity>
                    );
                  })()}
                  {/* Save button */}
                  <TouchableOpacity
                    onPress={() => {
                      let updatedLines = (selectedWorkorder?.workorderLines || []).map((ln) =>
                        ln.id === sIntakeNotesLineID ? { ...ln, intakeNotes: sIntakeNotesText, receiptNotes: sReceiptNotesText } : ln
                      );
                      useOpenWorkordersStore.getState().setField("workorderLines", updatedLines, sSelectedWorkorderID, true);
                      _setIntakeNotesLineID(null);
                    }}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 8,
                      backgroundColor: C.green,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ fontSize: 18, fontWeight: "600", color: C.textWhite }}>Save</Text>
                  </TouchableOpacity>
                </View>
              </div>
            </div>
            );
          })()}
        </View>
      ) : (
        <StandWorkorderDetail
          workorderID={sSelectedWorkorderID}
          customer={sSelectedCustomer}
          onBack={handleBackToButtons}
          onShowCustomerModal={() => _setShowCustomerModal(true)}
        />
      )}

      <NoteHelperDropdown
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

const StandWaitTimeIndicator = ({ workorder }) => {
  const info = computeWaitInfo(workorder);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "flex-end",
        height: "100%",
        width: 135,
        paddingRight: 2,
        backgroundColor: C.buttonLightGreen,
        borderWidth: 1,
        borderColor: C.buttonLightGreenOutline,
        borderRadius: 5,
        marginLeft: 5,
      }}
    >
      <View style={{ flexDirection: "column", alignItems: "flex-end", justifyContent: "center" }}>
        {info.isMissing ? null : !!info.waitEndDay && info.waitEndDay.includes("\n") ? (
          <>
            <Text style={{ color: info.textColor, fontSize: 12, textAlign: "right", fontStyle: "italic" }}>
              {capitalizeFirstLetterOfString(info.waitEndDay.split("\n")[0])}
            </Text>
            <Text style={{ color: info.textColor, fontSize: 14, textAlign: "right" }}>
              {info.waitEndDay.split("\n")[1]}
            </Text>
          </>
        ) : !!info.waitEndDay ? (
          <Text style={{ color: info.textColor, fontSize: 14, textAlign: "right" }}>
            {capitalizeFirstLetterOfString(info.waitEndDay)}
          </Text>
        ) : null}
      </View>
    </View>
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

  finalArr.sort((a, b) => {
    let aIsSender = a.lastSMSSenderUserID && a.lastSMSSenderUserID === currentUser?.id;
    let bIsSender = b.lastSMSSenderUserID && b.lastSMSSenderUserID === currentUser?.id;
    if (aIsSender && !bIsSender) return -1;
    if (!aIsSender && bIsSender) return 1;
    return 0;
  });

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

const WorkorderListModal = ({ onSelect, onClose, activeWorkorderID }) => {
  const zWorkorders = useOpenWorkordersStore((state) => state.workorders);
  const zStatuses = useSettingsStore((s) => s.settings?.statuses);
  const _swipeRef = useRef(null);

  let sortedWorkorders = sortWorkordersForStand((zWorkorders || []).filter((wo) => !!wo.customerID));

  return (
    <div
      onClick={onClose}
      style={{
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "95%",
          height: "90%",
          backgroundColor: "white",
          borderRadius: 12,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <View style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: gray(0.1),
        }}>
          <Text style={{ fontSize: 20, fontWeight: "600", color: C.text }}>Open Workorders</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ fontSize: 22, color: gray(0.5), fontWeight: "600", paddingHorizontal: 8 }}>{"\u2715"}</Text>
          </TouchableOpacity>
        </View>

        {/* Tap to close */}
        <View
          onClick={onClose}
          onTouchStart={(e) => { _swipeRef.current = e.touches[0].clientY; }}
          onTouchEnd={(e) => {
            if (_swipeRef.current !== null) {
              let diff = e.changedTouches[0].clientY - _swipeRef.current;
              if (diff > 20) onClose();
              _swipeRef.current = null;
            }
          }}
          style={{
            height: 15,
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <Text style={{ fontSize: 16, fontStyle: "italic", color: gray(0.35) }}>Tap to close</Text>
        </View>

        {/* Workorder list */}
        <ScrollView style={{ flex: 1, paddingHorizontal: 12, paddingTop: 8 }}>
          {sortedWorkorders.length === 0 ? (
            <Text style={{ fontSize: 16, color: gray(0.4), textAlign: "center", paddingVertical: 20 }}>No open workorders.</Text>
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
                <TouchableOpacity
                  key={workorder.id}
                  onPress={() => onSelect(workorder)}
                >
                  <View
                    style={{
                      marginBottom: 4,
                      borderRadius: 7,
                      borderWidth: 1,
                      borderLeftWidth: 4,
                      borderLeftColor: rs.backgroundColor || C.buttonLightGreenOutline,
                      borderColor: C.buttonLightGreenOutline,
                      backgroundColor: isActive ? lightenRGBByPercent(C.lightred, 85) : C.listItemWhite,
                      flexDirection: "column",
                      width: "100%",
                      paddingLeft: 5,
                      paddingRight: 2,
                      paddingVertical: 8,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        width: "100%",
                        justifyContent: "flex-start",
                        alignItems: "center",
                      }}
                    >
                      {/* Left: customer + description */}
                      <View
                        style={{
                          marginVertical: 2,
                          flexDirection: "column",
                          width: "65%",
                          justifyContent: "center",
                        }}
                      >
                        {/* Customer name row */}
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          {workorder.hasNewSMS && (
                            <View
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 4,
                                backgroundColor: C.green,
                                marginRight: 5,
                              }}
                            />
                          )}
                          <Text
                            numberOfLines={1}
                            style={{ fontSize: 21, color: "dimgray" }}
                          >
                            {capitalizeFirstLetterOfString(workorder.customerFirst) + " " + capitalizeFirstLetterOfString(workorder.customerLast)}
                          </Text>
                        </View>

                        {/* Brand + description + line count */}
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <Text style={{ fontSize: 16, fontWeight: "500", color: C.text }}>
                            {capitalizeFirstLetterOfString(workorder.brand) || ""}
                          </Text>
                          {!!workorder.description && (
                            <View style={{ width: 7, height: 2, marginHorizontal: 5, backgroundColor: "lightgray" }} />
                          )}
                          <Text style={{ fontSize: 16, color: C.text }}>
                            {capitalizeFirstLetterOfString(workorder.description)}
                          </Text>
                          {workorder.workorderLines?.length > 0 && (
                            <View
                              style={{
                                backgroundColor: "gray",
                                borderRadius: 10,
                                paddingHorizontal: 6,
                                paddingVertical: 1,
                                marginLeft: 8,
                              }}
                            >
                              <Text style={{ color: "white", fontSize: 15, fontWeight: "600" }}>
                                {workorder.workorderLines.length}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>

                      {/* Right: date, status, wait time */}
                      <View
                        style={{
                          width: "35%",
                          justifyContent: "flex-end",
                          alignItems: "center",
                          flexDirection: "row",
                          height: "100%",
                        }}
                      >
                        <View
                          style={{
                            flexDirection: "column",
                            alignItems: "flex-end",
                            justifyContent: "space-between",
                            height: "100%",
                          }}
                        >
                          <Text style={{ color: "dimgray", fontSize: 15 }}>
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
                          </Text>
                          <View style={{ width: 8 }} />
                          <View
                            style={{
                              backgroundColor: rs.backgroundColor,
                              flexDirection: "row",
                              paddingHorizontal: 11,
                              paddingVertical: 2,
                              alignItems: "center",
                              borderRadius: 10,
                              borderColor: "transparent",
                              borderLeftColor: rs.textColor,
                            }}
                          >
                            {!!wipUser && (
                              <Text style={{ color: C.red, fontSize: 13, fontStyle: "italic", marginRight: 5 }}>{wipUser}</Text>
                            )}
                            <Text style={{ color: rs.textColor, fontSize: 15, fontWeight: "normal" }}>
                              {rs.label}
                            </Text>
                          </View>
                        </View>
                        <StandWaitTimeIndicator workorder={workorder} />
                      </View>
                    </View>

                    {/* Part ordered / source row */}
                    {!!(workorder.partOrdered || workorder.partSource || workorder.trackingNumber) && (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          paddingTop: 2,
                          paddingBottom: 1,
                          marginTop: 2,
                        }}
                      >
                        {!!workorder.partOrdered && (
                          <Text numberOfLines={1} style={{ fontSize: 16, color: C.blue, fontWeight: "500" }}>
                            {capitalizeFirstLetterOfString(workorder.partOrdered)}
                          </Text>
                        )}
                        {!!(workorder.partOrdered && workorder.partSource) && (
                          <View style={{ width: 5, height: 2, marginHorizontal: 5, backgroundColor: "lightgray" }} />
                        )}
                        {!!workorder.partSource && (
                          <Text numberOfLines={1} style={{ fontSize: 16, color: C.orange }}>
                            {capitalizeFirstLetterOfString(workorder.partSource)}
                          </Text>
                        )}
                        {!!(workorder.partOrderedMillis && workorder.partOrderEstimateMillis) && (
                          <Text numberOfLines={1} style={{ fontSize: 14, color: "dimgray", marginLeft: 6 }}>
                            {formatMillisForDisplay(workorder.partOrderedMillis)}
                            {" \u2192 " + formatMillisForDisplay(workorder.partOrderEstimateMillis)}
                          </Text>
                        )}
                        {!!workorder.trackingNumber && (
                          <Text numberOfLines={1} style={{ fontSize: 14, color: C.blue, marginLeft: 6 }}>
                            {workorder.trackingNumber}
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </div>
    </div>
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
    <div
      onClick={onClose}
      style={{
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "95%",
          height: "95%",
          backgroundColor: "white",
          borderRadius: 12,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        {sMode === "create" ? (
          <View style={{
            flexDirection: "row",
            alignItems: "center",
            padding: 12,
            borderBottomWidth: 1,
            borderBottomColor: gray(0.1),
          }}>
            <TouchableOpacity
              onPress={() => _setMode("search")}
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <Text style={{ fontSize: 21, color: C.blue, fontWeight: "600" }}>{"\u2190"} Back to Search</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View
            onClick={onClose}
            onTouchStart={(e) => { _swipeRefCust.current = e.touches[0].clientY; }}
            onTouchEnd={(e) => {
              if (_swipeRefCust.current !== null) {
                let diff = e.changedTouches[0].clientY - _swipeRefCust.current;
                if (diff > 20) onClose();
                _swipeRefCust.current = null;
              }
            }}
            style={{
              paddingVertical: 12,
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <Text style={{ fontSize: 26, fontStyle: "italic", color: gray(0.35) }}>Tap to close</Text>
          </View>
        )}

        {sMode === "search" ? (
          <>
            {/* Search display + mode toggle */}
            <div style={{ padding: 12, display: "flex", flexDirection: "row", alignItems: "stretch", gap: 10 }}>
              <div style={{
                flex: 1,
                borderRadius: 8,
                borderWidth: 2,
                borderStyle: "solid",
                borderColor: C.buttonLightGreenOutline,
                backgroundColor: C.listItemWhite,
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                height: 56,
                paddingLeft: 12,
                paddingRight: 12,
                fontSize: 38,
                fontWeight: "500",
                color: C.text,
              }}>
                <div style={{ flex: 1 }}>
                  {displayText || <span style={{ color: gray(0.3) }}>{sKeypadMode === "phone" ? "Phone number..." : "Name..."}</span>}
                </div>
                {sSearching && <SmallLoadingIndicator size={35} color={C.blue} message="" containerStyle={{ padding: 0 }} />}
              </div>
              <TouchableOpacity
                onPress={() => {
                  let newMode = sKeypadMode === "phone" ? "alpha" : "phone";
                  _setKeypadMode(newMode);
                  _setSearchText("");
                  _setSearchResults([]);
                }}
                style={{
                  paddingHorizontal: 34,
                  borderRadius: 8,
                  backgroundColor: C.blue,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 23, fontWeight: "600", color: "white" }}>
                  {sKeypadMode === "phone" ? "ABC" : "123"}
                </Text>
              </TouchableOpacity>
            </div>

            {/* Keypad */}
            <div style={{ paddingLeft: 12, paddingRight: 12, paddingBottom: 8 }}>
              <StandKeypad mode={effectiveKeypadMode} onKeyPress={handleKeyPress} fontSizeAdj={23} paddingAdj={35} />
            </div>

            {/* Search results */}
            <ScrollView style={{ flex: 1, paddingHorizontal: 12, marginTop: 15 }}>
              {sSearchResults.map((cust) => (
                <TouchableOpacity
                  key={cust.id}
                  onPress={() => handleSelectCustomer(cust)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 17,
                    paddingHorizontal: 12,
                    marginBottom: 4,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: C.buttonLightGreenOutline,
                    backgroundColor: C.listItemWhite,
                    gap: 16,
                  }}
                >
                  <Text style={{ flex: 1, fontSize: 27, fontWeight: "600", color: C.text }}>
                    {capitalizeFirstLetterOfString(cust.first || "")} {capitalizeFirstLetterOfString(cust.last || "")}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    {!(cust.customerCell || cust.cell) && cust.landline && <Text style={{ fontSize: 14, color: gray(0.35) }}>landline</Text>}
                    <Text style={{ fontSize: 25, color: gray(0.5) }} numberOfLines={1}>
                      {(cust.customerCell || cust.cell) ? formatPhoneWithDashes(cust.customerCell || cust.cell) : cust.landline ? formatPhoneWithDashes(cust.landline) : cust.email || ""}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
              {!sSearching && sSearchResults.length === 0 && ((sKeypadMode === "phone" && sSearchText.replace(/\D/g, "").length >= 4) || (sKeypadMode === "alpha" && sSearchText.length >= 3)) && (
                <Text style={{ fontSize: 26, color: gray(0.4), textAlign: "center", paddingVertical: 10 }}>No results found.</Text>
              )}
            </ScrollView>

            {/* Create new customer button - phone: 10 digits + no results; name: 3+ chars */}
            {((sKeypadMode === "phone" && sSearchText.replace(/\D/g, "").length === 10 && sSearchResults.length === 0 && !sSearching) ||
              (sKeypadMode === "alpha" && sSearchText.length >= 3 && !sSearching)) && (
              <div style={{ padding: 12, borderTop: "1px solid " + gray(0.1) }}>
                <TouchableOpacity
                  onPress={handleSwitchToCreate}
                  style={{
                    paddingVertical: 14,
                    borderRadius: 8,
                    backgroundColor: C.green,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontSize: 21, fontWeight: "600", color: "white" }}>+ Create New Customer</Text>
                </TouchableOpacity>
              </div>
            )}
          </>
        ) : (
          /* Create customer mode */
          <>
            {/* Form fields */}
            <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { key: "first", label: "First Name" },
                { key: "last", label: "Last Name" },
                { key: "phone", label: "Phone" },
                { key: "email", label: "Email" },
              ].map((field) => (
                <div
                  key={field.key}
                  onClick={() => _setActiveField(field.key)}
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    padding: 10,
                    borderRadius: 8,
                    borderWidth: 2,
                    borderStyle: "solid",
                    borderColor: sActiveField === field.key ? C.blue : C.buttonLightGreenOutline,
                    backgroundColor: sActiveField === field.key ? lightenRGBByPercent(C.blue, 85) : C.listItemWhite,
                    cursor: "pointer",
                  }}
                >
                  <Text style={{ fontSize: 16, color: gray(0.5), width: 80 }}>{field.label}</Text>
                  <Text style={{ fontSize: 19, fontWeight: "500", color: C.text, flex: 1 }}>
                    {field.key === "phone"
                      ? formatPhoneWithDashes((sCreateForm[field.key] || "").replace(/\D/g, ""))
                      : sCreateForm[field.key] || ""
                    }
                    {sActiveField === field.key && <span style={{ color: C.blue }}>|</span>}
                  </Text>
                </div>
              ))}
            </div>

            {/* Keypad for create mode */}
            <div style={{ paddingLeft: 12, paddingRight: 12, paddingBottom: 8 }}>
              <StandKeypad mode={effectiveKeypadMode} onKeyPress={handleKeyPress} />
            </div>

            {/* Spacer + Create button */}
            <View style={{ flex: 1 }} />
            <div style={{ padding: 12, borderTop: "1px solid " + gray(0.1) }}>
              <TouchableOpacity
                onPress={handleCreateAndStart}
                style={{
                  paddingVertical: 14,
                  borderRadius: 8,
                  backgroundColor: C.green,
                  alignItems: "center",
                  opacity: (sCreateForm.first || sCreateForm.phone) ? 1 : 0.4,
                }}
                disabled={!(sCreateForm.first || sCreateForm.phone)}
              >
                <Text style={{ fontSize: 21, fontWeight: "600", color: "white" }}>Create & Start Workorder</Text>
              </TouchableOpacity>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

////////////////////////////////////////////////////////////////////////////////
// Stand Custom Item Modal (labor / item - with on-screen keypads)
////////////////////////////////////////////////////////////////////////////////

const StandCustomItemModal = ({ type, onSave, onClose }) => {
  const zDiscounts = useSettingsStore((s) => s.settings?.discounts);
  const zLaborRate = useSettingsStore((s) => s.settings?.laborRateByHour);

  const isLabor = type === "labor";

  const [sName, _setName] = useState("");
  const [sPriceDisplay, _setPriceDisplay] = useState("");
  const [sPriceCents, _setPriceCents] = useState(0);
  const [sMinutes, _setMinutes] = useState("");
  const [sIntakeNotes, _setIntakeNotes] = useState("");
  const [sReceiptNotes, _setReceiptNotes] = useState("");
  const [sDiscountObj, _setDiscountObj] = useState(null);
  const [sPriceManuallySet, _setPriceManuallySet] = useState(false);
  const [sActiveField, _setActiveField] = useState("name"); // "name" | "minutes" | "price" | "intake" | "receipt"

  function handleKeyPress(key) {
    let field = sActiveField;
    if (field === "name" || field === "intake" || field === "receipt") {
      let getter = field === "name" ? sName : field === "intake" ? sIntakeNotes : sReceiptNotes;
      let setter = field === "name" ? _setName : field === "intake" ? _setIntakeNotes : _setReceiptNotes;
      if (key === "CLR") {
        setter("");
      } else if (key === "\u232B") {
        setter(getter.slice(0, -1));
      } else if (key === " ") {
        setter(getter + " ");
      } else {
        let char = key.toLowerCase();
        // Auto-cap first letter
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
    fields.push({ key: "minutes", label: "Minutes", sublabel: zLaborRate ? "@ $" + usdTypeMask(zLaborRate, { withDollar: false }).display + "/hr" : "" });
  }
  fields.push(
    { key: "price", label: "Price", required: true },
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
    <div
      onClick={onClose}
      style={{
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "95%",
          height: "95%",
          backgroundColor: "rgba(255,255,255,0.95)",
          borderRadius: 12,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 12,
          borderBottom: "1px solid " + gray(0.1),
        }}>
          <Text style={{ fontSize: 18, fontWeight: "600", color: C.text }}>
            Add Custom {isLabor ? "Labor" : "Item"}
          </Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ fontSize: 20, color: gray(0.5), fontWeight: "600", paddingHorizontal: 8 }}>{"\u2715"}</Text>
          </TouchableOpacity>
        </div>

        {/* Fields */}
        <ScrollView style={{ flex: 1, paddingHorizontal: 12, paddingTop: 8 }}>
          {fields.map((field) => {
            let isActive = sActiveField === field.key;
            let val = getFieldValue(field.key);
            return (
              <div
                key={field.key}
                onClick={() => _setActiveField(field.key)}
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  padding: 10,
                  marginBottom: 6,
                  borderRadius: 8,
                  borderWidth: 2,
                  borderStyle: "solid",
                  borderColor: isActive ? C.blue : C.buttonLightGreenOutline,
                  backgroundColor: isActive ? lightenRGBByPercent(C.blue, 85) : C.listItemWhite,
                  cursor: "pointer",
                }}
              >
                <View style={{ width: 120 }}>
                  <Text style={{ fontSize: 13, color: gray(0.5) }}>
                    {field.label}{field.required ? " *" : ""}
                  </Text>
                  {field.sublabel ? (
                    <Text style={{ fontSize: 10, color: gray(0.4) }}>{field.sublabel}</Text>
                  ) : null}
                </View>
                <Text style={{ fontSize: 16, fontWeight: "500", color: val ? getFieldColor(field.key) : gray(0.3), flex: 1 }}>
                  {val || (field.key === "price" ? "$0.00" : "")}
                  {isActive && <span style={{ color: C.blue }}>|</span>}
                </Text>
              </div>
            );
          })}

          {/* Discount selector */}
          <div style={{ marginTop: 4, marginBottom: 8 }}>
            <Text style={{ fontSize: 12, color: gray(0.5), marginBottom: 4, paddingLeft: 2 }}>Discount</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              <TouchableOpacity
                onPress={() => _setDiscountObj(null)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: !sDiscountObj ? C.blue : gray(0.15),
                  backgroundColor: !sDiscountObj ? lightenRGBByPercent(C.blue, 85) : C.listItemWhite,
                }}
              >
                <Text style={{ fontSize: 13, color: !sDiscountObj ? C.blue : gray(0.5) }}>None</Text>
              </TouchableOpacity>
              {(zDiscounts || [])
                .filter((d) => d.type !== "$" || Number(d.value) <= sPriceCents)
                .map((d) => {
                  let isSelected = sDiscountObj?.name === d.name;
                  return (
                    <TouchableOpacity
                      key={d.name}
                      onPress={() => handleDiscountSelect(d)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: isSelected ? C.blue : gray(0.15),
                        backgroundColor: isSelected ? lightenRGBByPercent(C.blue, 85) : C.listItemWhite,
                      }}
                    >
                      <Text style={{ fontSize: 13, color: isSelected ? C.blue : C.text }}>{d.name}</Text>
                    </TouchableOpacity>
                  );
                })}
            </View>
            {discountedCents !== null && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, paddingLeft: 2 }}>
                <Text style={{ fontSize: 14, color: gray(0.5), textDecorationLine: "line-through" }}>
                  {"$" + usdTypeMask(sPriceCents, { withDollar: false }).display}
                </Text>
                <Text style={{ fontSize: 16, fontWeight: "600", color: C.green }}>
                  {"$" + usdTypeMask(discountedCents, { withDollar: false }).display}
                </Text>
                <Text style={{ fontSize: 12, color: C.lightred }}>
                  {sDiscountObj.type === DISCOUNT_TYPES.percent
                    ? sDiscountObj.value + "% off"
                    : "$" + usdTypeMask(sDiscountObj.value, { withDollar: false }).display + " off"}
                </Text>
              </View>
            )}
          </div>
        </ScrollView>

        {/* Keypad */}
        <div style={{ paddingLeft: 12, paddingRight: 12, paddingBottom: 8 }}>
          <StandKeypad mode={keypadMode} onKeyPress={handleKeyPress} />
        </div>

        {/* Save button */}
        <div style={{ padding: 12, borderTop: "1px solid " + gray(0.1) }}>
          <TouchableOpacity
            onPress={handleSave}
            disabled={!canSave}
            style={{
              paddingVertical: 14,
              borderRadius: 8,
              backgroundColor: C.green,
              alignItems: "center",
              opacity: canSave ? 1 : 0.4,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "600", color: "white" }}>
              Add {isLabor ? "Labor" : "Item"} to Workorder
            </Text>
          </TouchableOpacity>
        </div>
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
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "80%",
          maxWidth: 500,
          maxHeight: "80%",
          backgroundColor: "white",
          borderRadius: 12,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <View style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: gray(0.1),
        }}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: C.text }}>
            Search Customer
          </Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ fontSize: 14, color: gray(0.5) }}>Close</Text>
          </TouchableOpacity>
        </View>

        {/* Phone input */}
        <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
          <PhoneNumberInput
            boxStyle={{
              width: "8%",
              height: 40,
              outlineStyle: "none",
              borderColor: gray(0.08),
              fontSize: 22,
              color: C.text,
            }}
            autoFocus={true}
            value={sPhoneInput}
            onChangeText={handlePhoneChange}
            dashStyle={{ width: 10, marginHorizontal: 4 }}
            dashColor={gray(0.2)}
            textColor={C.text}
          />
        </View>

        {/* Results */}
        <ScrollView style={{ flex: 1, paddingHorizontal: 16, paddingBottom: 12 }}>
          {sIsSearching && (
            <Text style={{ fontSize: 14, color: gray(0.4), textAlign: "center", paddingVertical: 12 }}>
              Searching...
            </Text>
          )}
          {!sIsSearching && sSearchResults.length === 0 && sPhoneInput.length > 0 && removeDashesFromPhone(sPhoneInput).length >= 5 && (
            <Text style={{ fontSize: 14, color: gray(0.4), textAlign: "center", paddingVertical: 12 }}>
              No customers found.
            </Text>
          )}
          {sSearchResults.map((customer) => (
            <TouchableOpacity
              key={customer.id}
              onPress={() => onSelect(customer)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 10,
                paddingHorizontal: 8,
                marginBottom: 4,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: gray(0.08),
                backgroundColor: C.listItemWhite,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, color: C.text, fontWeight: "500" }}>
                  {capitalizeFirstLetterOfString(customer.first || "")} {capitalizeFirstLetterOfString(customer.last || "")}
                </Text>
                <Text style={{ fontSize: 14, color: gray(0.5), marginTop: 2 }}>
                  {formatPhoneWithDashes(customer.customerCell || "")}
                </Text>
              </View>
              {customer.email && (
                <Text style={{ fontSize: 14, color: gray(0.4) }} numberOfLines={1}>
                  {customer.email}
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
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
    <View style={{ flex: 1 }}>
      {/* Top bar: customer info + back button */}
      <View style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: gray(0.1),
      }}>
        <TouchableOpacity
          onPress={onShowCustomerModal}
          style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
        >
          <Image_ icon={ICONS.ridingBike} size={28} style={{ marginRight: 8 }} />
          <View>
            <Text style={{ fontSize: 16, fontWeight: "600", color: C.text }}>
              {custName || "Customer"}
            </Text>
            {custPhone ? (
              <Text style={{ fontSize: 14, color: gray(0.5) }}>
                {formatPhoneWithDashes(custPhone)}
              </Text>
            ) : null}
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onBack}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 6,
            backgroundColor: gray(0.12),
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "600", color: C.text }}>Back to Buttons</Text>
        </TouchableOpacity>
      </View>

      {/* Scrollable form */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
        {/* Bike details section */}
        <View style={{
          paddingHorizontal: 8,
          paddingVertical: 8,
          backgroundColor: C.backgroundListWhite,
          borderWidth: 1,
          borderColor: gray(0.05),
          borderRadius: 5,
        }}>
          {/* Brand row */}
          <View style={{ flexDirection: "row", alignItems: "center", width: "100%" }}>
            <TextInput_
              placeholder="Brand"
              capitalize={true}
              style={{ ...inputStyle, width: "45%", fontWeight: zWorkorder?.brand ? "500" : null }}
              value={zWorkorder?.brand}
              onChangeText={(val) => setField("brand", val)}
            />
            <View style={{ width: "55%", flexDirection: "row", paddingLeft: 5, justifyContent: "space-between" }}>
              <View style={{ width: "48%" }}>
                <DropdownMenu
                  dataArr={zSettings.bikeBrands}
                  onSelect={(item) => setField("brand", item)}
                  buttonStyle={{ opacity: zWorkorder?.brand ? DROPDOWN_SELECTED_OPACITY : 1 }}
                  buttonText={zSettings.bikeBrandsName}
                />
              </View>
              <View style={{ width: "48%" }}>
                <DropdownMenu
                  dataArr={zSettings.bikeOptionalBrands}
                  onSelect={(item) => setField("brand", item)}
                  buttonStyle={{ opacity: zWorkorder?.brand ? DROPDOWN_SELECTED_OPACITY : 1 }}
                  buttonText={zSettings.bikeOptionalBrandsName}
                />
              </View>
            </View>
          </View>

          {/* Model/Description row */}
          <View style={{ flexDirection: "row", alignItems: "center", width: "100%", marginTop: 8 }}>
            <TextInput_
              placeholder="Model/Description"
              capitalize={true}
              style={{ ...inputStyle, width: "45%", fontWeight: zWorkorder?.description ? "500" : null }}
              value={zWorkorder?.description}
              onChangeText={(val) => setField("description", val)}
            />
            <View style={{ width: "55%", paddingLeft: 5 }}>
              <DropdownMenu
                dataArr={zSettings.bikeDescriptions}
                onSelect={(item) => setField("description", item)}
                buttonStyle={{ opacity: zWorkorder?.description ? DROPDOWN_SELECTED_OPACITY : 1 }}
                buttonText="Descriptions"
              />
            </View>
          </View>

          {/* Colors row */}
          <View style={{ flexDirection: "row", alignItems: "center", width: "100%", marginTop: 8 }}>
            <TextInput_
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
            <View style={{ width: 4 }} />
            <TextInput_
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
            <View style={{ width: "50%", flexDirection: "row", paddingLeft: 5, justifyContent: "space-between" }}>
              <View style={{ width: "48%" }}>
                <DropdownMenu
                  itemSeparatorStyle={{ height: 0 }}
                  dataArr={COLORS}
                  menuBorderColor="transparent"
                  onSelect={(item) => setField("color1", item)}
                  buttonStyle={{ opacity: zWorkorder?.color1 ? DROPDOWN_SELECTED_OPACITY : 1 }}
                  buttonText="Color 1"
                />
              </View>
              <View style={{ width: "48%" }}>
                <DropdownMenu
                  itemSeparatorStyle={{ height: 0 }}
                  dataArr={COLORS}
                  menuBorderColor="transparent"
                  onSelect={(item) => setField("color2", item)}
                  buttonStyle={{ opacity: zWorkorder?.color2 ? DROPDOWN_SELECTED_OPACITY : 1 }}
                  buttonText="Color 2"
                />
              </View>
            </View>
          </View>

          {/* Status */}
          <StatusPickerModal
            statuses={(zSettings.statuses || []).filter((s) => !s.systemOwned && !s.hidden)}
            onSelect={(val) => {
              setField("status", val.id);
              if (val.id === "33knktg") setField("finishedOnMillis", Date.now());
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
          <View style={{ flexDirection: "row", alignItems: "center", width: "100%", marginTop: 8 }}>
            <Text style={{ color: gray(0.5), fontSize: 14, marginRight: 4 }}>Max wait days:</Text>
            <TextInput_
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
            <View style={{ flex: 1, paddingLeft: 5 }}>
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
            </View>
          </View>
          {estimateLabel && (
            <Text style={{ color: gray(0.5), fontSize: 14, fontStyle: "italic", marginTop: 4 }}>
              {estimateLabel}
            </Text>
          )}
        </View>

        {/* Parts section */}
        <View style={{
          marginTop: 8,
          paddingHorizontal: 8,
          paddingVertical: 8,
          backgroundColor: gray(0.05),
          borderRadius: 5,
        }}>
          <TextInput_
            placeholder="Part name/description"
            capitalize={true}
            style={{ ...inputStyle, width: "100%", fontWeight: zWorkorder?.partOrdered ? "500" : null, backgroundColor: C.backgroundWhite }}
            value={zWorkorder?.partOrdered}
            onChangeText={(val) => {
              setField("partOrdered", val);
              useOpenWorkordersStore.getState().setField("partOrderedMillis", Date.now(), workorderID, false);
            }}
          />

          <View style={{ flexDirection: "row", alignItems: "center", width: "100%", marginTop: 8 }}>
            <TextInput_
              placeholder="Part Source"
              capitalize={true}
              value={zWorkorder?.partSource}
              style={{ ...inputStyle, width: "50%", fontWeight: zWorkorder?.partSource ? "500" : null, backgroundColor: C.backgroundWhite }}
              onChangeText={(val) => {
                setField("partSource", val);
                useOpenWorkordersStore.getState().setField("partOrderedMillis", Date.now(), workorderID, false);
              }}
            />
            <View style={{ width: "50%", paddingLeft: 5 }}>
              <DropdownMenu
                dataArr={zSettings.partSources}
                onSelect={(item) => {
                  setField("partSource", item);
                  useOpenWorkordersStore.getState().setField("partOrderedMillis", Date.now(), workorderID, false);
                }}
                buttonStyle={{ opacity: zWorkorder?.partSource ? DROPDOWN_SELECTED_OPACITY : 1 }}
                buttonText="Part Sources"
              />
            </View>
          </View>

          {/* Est delivery + to be ordered */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%", marginTop: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", opacity: zWorkorder?.partToBeOrdered ? 0.35 : 1 }}>
              <Text style={{ fontSize: 14, color: gray(0.45), marginRight: 8 }}>Est. delivery</Text>
              <TouchableOpacity
                disabled={!!zWorkorder?.partToBeOrdered}
                onPress={() => updateWaitDays(Math.max(0, sWaitDays - 1))}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 4,
                  backgroundColor: zWorkorder?.partToBeOrdered ? gray(0.85) : C.buttonLightGreen,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: gray(0.55), fontSize: 16, fontWeight: "700", marginTop: -1 }}>-</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 14, fontWeight: "400", color: C.text, minWidth: 50, textAlign: "center" }}>
                {sWaitDays + " days"}
              </Text>
              <TouchableOpacity
                disabled={!!zWorkorder?.partToBeOrdered}
                onPress={() => updateWaitDays(sWaitDays + 1)}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 4,
                  backgroundColor: zWorkorder?.partToBeOrdered ? gray(0.85) : C.buttonLightGreen,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: gray(0.55), fontSize: 16, fontWeight: "700", marginTop: -1 }}>+</Text>
              </TouchableOpacity>
              {!!zWorkorder?.partOrderEstimateMillis && !zWorkorder?.partToBeOrdered && (
                <Text style={{ fontSize: 14, color: gray(0.45), marginLeft: 8 }}>
                  {formatMillisForDisplay(zWorkorder.partOrderEstimateMillis)}
                </Text>
              )}
            </View>
            <CheckBox_
              text="To be ordered"
              isChecked={!!zWorkorder?.partToBeOrdered}
              onCheck={() => setField("partToBeOrdered", !zWorkorder?.partToBeOrdered)}
              textStyle={{ fontSize: 14, color: gray(0.55) }}
            />
          </View>
        </View>

        {/* Media buttons */}
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={handleDirectUpload}
          style={{ display: "none" }}
        />
        <View style={{ alignItems: "center", marginTop: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
            <Button_
              icon={ICONS.uploadCamera}
              iconSize={40}
              onPress={() => uploadInputRef.current?.click()}
              buttonStyle={{ backgroundColor: "transparent", paddingHorizontal: 0, paddingVertical: 0 }}
            />
            <View>
              <Button_
                icon={ICONS.viewPhoto}
                iconSize={50}
                onPress={() => _setShowMediaModal("view")}
                buttonStyle={{ backgroundColor: "transparent", paddingHorizontal: 0, paddingVertical: 0 }}
              />
              <View style={{
                position: "absolute",
                top: -1,
                right: -5,
                borderRadius: 8,
                minWidth: 16,
                height: 16,
                justifyContent: "center",
                alignItems: "center",
                paddingHorizontal: 3,
              }}>
                <Text style={{
                  color: zWorkorder?.media?.length > 0 ? C.red : "gray",
                  fontSize: 15,
                  fontWeight: "700",
                }}>
                  {zWorkorder?.media?.length || 0}
                </Text>
              </View>
            </View>
          </View>
          {/* Upload progress bar */}
          {sUploadProgress && (
            <View style={{ flexDirection: "row", alignItems: "center", width: "100%", paddingBottom: 4 }}>
              <Text style={{
                fontSize: 14,
                color: sUploadProgress.done ? (sUploadProgress.failed > 0 ? C.red : C.green) : gray(0.45),
                fontWeight: "700",
                marginRight: 6,
              }}>
                {sUploadProgress.completed}/{sUploadProgress.total}
              </Text>
              <View style={{ flex: 1, height: 4, backgroundColor: gray(0.88), borderRadius: 2, overflow: "hidden" }}>
                {!sUploadProgress.done ? (
                  <View style={{ width: "40%", height: "100%", backgroundColor: C.blue, borderRadius: 2 }} />
                ) : (
                  <View style={{
                    width: "100%",
                    height: "100%",
                    backgroundColor: sUploadProgress.failed > 0 ? C.red : C.green,
                    borderRadius: 2,
                  }} />
                )}
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Media view modal */}
      <WorkorderMediaModal
        visible={sShowMediaModal === "view"}
        onClose={() => _setShowMediaModal(null)}
        workorderID={workorderID}
        mode="view"
      />
    </View>
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
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "70%",
          maxWidth: 420,
          backgroundColor: "white",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <View style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: gray(0.1),
        }}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: C.text }}>Customer Info</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ fontSize: 14, color: gray(0.5) }}>Close</Text>
          </TouchableOpacity>
        </View>
        <View style={{ padding: 16 }}>
          {fields.map((f, idx) => (
            <View
              key={idx}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 8,
                borderBottomWidth: idx < fields.length - 1 ? 1 : 0,
                borderBottomColor: gray(0.06),
              }}
            >
              <Text style={{ fontSize: 14, color: gray(0.5), width: 100 }}>{f.label}</Text>
              <Text style={{ fontSize: 14, color: C.text, fontWeight: "500", flex: 1 }}>
                {capitalizeFirstLetterOfString(String(f.value))}
              </Text>
            </View>
          ))}
        </View>
      </div>
    </div>,
    document.body
  );
};
