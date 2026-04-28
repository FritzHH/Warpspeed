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

const DROPDOWN_SELECTED_OPACITY = 0.3;

function getQuickButtonFontSize(text, baseFontSize) {
  let len = (text || "").length;
  if (len <= 15) return baseFontSize;
  return Math.max(7, Math.round(baseFontSize - (len - 15) * 0.5));
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
  const [sShowPrintMenu, _setShowPrintMenu] = useState(false);
  const [sShowPrinterSelectModal, _setShowPrinterSelectModal] = useState(false);
  const [sShowIntakeActionModal, _setShowIntakeActionModal] = useState(false);
  const [sSelectedPrinterID, _setSelectedPrinterID] = useState(() => localStorageWrapper.getItem("selectedPrinterID") || "");
  const [sShowItemOverlay, _setShowItemOverlay] = useState(true);
  const [sSwipedCardID, _setSwipedCardID] = useState(null); // line.id of swiped card
  const [sSwipeDir, _setSwipeDir] = useState(null); // "left" | "right"
  const itemSwipeRef = useRef(null); // { x, y } touch start
  const [sIntakeNotesLineID, _setIntakeNotesLineID] = useState(null); // line.id being edited
  const [sIntakeNotesText, _setIntakeNotesText] = useState("");

  // Refs for bike detail dropdowns
  const bikeBrandsRef = useRef(null);
  const bikeOptBrandsRef = useRef(null);
  const descriptionRef = useRef(null);
  const color1Ref = useRef(null);
  const color2Ref = useRef(null);
  const waitTimesRef = useRef(null);
  const swipeDividerRef = useRef(null);

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
    if (!hasWorkorderReady || !invItem) return;
    let wo = await ensureWorkorderExists();
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
  let selectedPrinterLabel = receiptPrinters.find((p) => p.id === sSelectedPrinterID)?.label || "";

  function handleSelectPrinter(printerID) {
    localStorageWrapper.setItem("selectedPrinterID", printerID);
    _setSelectedPrinterID(printerID);
    _setShowPrinterSelectModal(false);
  }

  function handleWorkorderPrint() {
    if (!selectedWorkorder || !sSelectedPrinterID) return;
    let _settings = useSettingsStore.getState().getSettings();
    let _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings: _settings };
    let toPrint = printBuilder.workorder(selectedWorkorder, pendingCust || {}, _settings?.salesTaxPercent, _ctx);
    dbSavePrintObj(toPrint, sSelectedPrinterID);
    _setShowPrintMenu(false);
  }

  function handleIntakePrint() {
    if (!selectedWorkorder || !sSelectedPrinterID) return;
    let _settings = useSettingsStore.getState().getSettings();
    let _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings: _settings };
    let toPrint = printBuilder.intake(selectedWorkorder, pendingCust || {}, _settings?.salesTaxPercent, _ctx);
    dbSavePrintObj(toPrint, sSelectedPrinterID);
    _setShowIntakeActionModal(false);
  }

  async function handleIntakeText() {
    if (!selectedWorkorder || !customerCell) return;
    let _settings = useSettingsStore.getState().getSettings();
    let _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings: _settings };
    let smsTemplate = findTemplateByType(_settings?.smsTemplates || _settings?.textTemplates, "intakeReceipt");
    if (!smsTemplate?.body) return;
    let receiptData = printBuilder.intake(selectedWorkorder, pendingCust || {}, _settings?.salesTaxPercent, _ctx);
    let { generateWorkorderTicketPDF } = await import("../pdfGenerator");
    let base64 = generateWorkorderTicketPDF(receiptData);
    let message = smsTemplate.body;
    await dbUploadPDFAndSendSMS({
      base64,
      message,
      phoneNumber: removeDashesFromPhone(customerCell),
      customerID: selectedWorkorder.customerID || "",
      messageID: selectedWorkorder.id + "_intake",
      canRespond: false,
    });
    _setShowIntakeActionModal(false);
  }

  async function handleIntakeEmail() {
    if (!selectedWorkorder || !customerEmail) return;
    let _settings = useSettingsStore.getState().getSettings();
    let _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings: _settings };
    let emailTemplate = findTemplateByType(_settings?.emailTemplates, "intakeReceipt");
    if (!emailTemplate?.body) return;
    let receiptData = printBuilder.intake(selectedWorkorder, pendingCust || {}, _settings?.salesTaxPercent, _ctx);
    let { generateWorkorderTicketPDF } = await import("../pdfGenerator");
    let base64 = generateWorkorderTicketPDF(receiptData);
    let subject = emailTemplate.subject || "Intake Receipt";
    let html = emailTemplate.body;
    await dbSendEmail(customerEmail, subject, html);
    _setShowIntakeActionModal(false);
  }

  async function handleIntakeTextEmail() {
    if (customerCell) await handleIntakeText();
    if (customerEmail) await handleIntakeEmail();
    _setShowIntakeActionModal(false);
  }

  async function handleIntakeAll() {
    if (sSelectedPrinterID) handleIntakePrint();
    if (customerCell) await handleIntakeText();
    if (customerEmail) await handleIntakeEmail();
    _setShowIntakeActionModal(false);
  }

  //////////////////////////////////////////////////////////////////////////////
  // Login: face recognition + pin
  //////////////////////////////////////////////////////////////////////////////

  function handleNewWorkorderPress() {
    pendingActionRef.current = () => _setShowNewWorkorderModal(true);
    startFaceLogin();
  }

  async function startFaceLogin() {
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
              useLoginStore.getState().setCurrentUser(user);
              useLoginStore.getState().setLastActionMillis();
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
    useLoginStore.getState().setCurrentUser(userObj);
    useLoginStore.getState().setLastActionMillis();
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
    <View style={{ flex: 1, backgroundColor: C.backgroundWhite, position: "relative", overflow: "hidden" }}>
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
            <Text style={{ fontSize: 18, fontWeight: "600", color: C.text, marginTop: 12 }}>
              Scanning face...
            </Text>
            <Text style={{ fontSize: 48, fontWeight: "700", color: C.green, marginTop: 16 }}>
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
            <Text style={{ fontSize: 18, fontWeight: "600", color: C.text, marginBottom: 20 }}>
              Enter PIN
            </Text>
            <View style={{ flexDirection: "row", marginBottom: 20, height: 24, alignItems: "center" }}>
              {sPin.split("").map((_, i) => (
                <View
                  key={i}
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    backgroundColor: C.text,
                    marginHorizontal: 6,
                  }}
                />
              ))}
              {sPin.length === 0 && (
                <Text style={{ fontSize: 14, color: gray(0.5) }}>-</Text>
              )}
            </View>
            <StandKeypad mode="phone" onKeyPress={handleStandPinKeyPress} />
            <TouchableOpacity
              onPress={() => { _setShowPinModal(false); _setPin(""); pendingActionRef.current = null; }}
              style={{ marginTop: 16 }}
            >
              <Text style={{ fontSize: 14, color: gray(0.5) }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {sViewMode === "buttons" ? (
        <View style={{ flex: 1 }}>
          {/* ── Header: "Add Customer" button when no WO/pending, full header when ready ── */}
          {!hasWorkorderReady ? (
            <View style={{ flexDirection: "row", paddingHorizontal: 12, paddingVertical: 14, gap: 10 }}>
              <TouchableOpacity
                onPress={handleNewWorkorderPress}
                style={{
                  flex: 1,
                  backgroundColor: C.orange,
                  borderRadius: 8,
                  paddingVertical: 16,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                }}
              >
                <Image_ icon={ICONS.gears1} size={22} />
                <Text style={{ fontSize: 18, fontWeight: "700", color: C.textWhite }}>New Workorder</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  pendingActionRef.current = () => _setShowWorkorderList(true);
                  startFaceLogin();
                }}
                style={{
                  alignItems: "center",
                  justifyContent: "center",
                  paddingHorizontal: 8,
                }}
              >
                <Image_ icon={ICONS.search} size={36} />
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              {/* Header row: customer info + status + show/hide toggle */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: C.text }}>
                    {customerName || "Standalone Sale"}
                  </Text>
                  {customerCell ? (
                    <Text style={{ fontSize: 12, color: gray(0.5) }}>
                      {formatPhoneWithDashes(customerCell)}
                    </Text>
                  ) : null}
                </View>
                {selectedWorkorder && (
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
                      fontSize: 14,
                    }}
                    modalCoordY={30}
                    buttonText={rs.label}
                  />
                )}
                <TouchableOpacity
                  onPress={() => { _setShowBikeDetails((p) => { if (p) _setDetailField(null); return !p; }); }}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  {selectedWorkorder?.brand ? (
                    <Text style={{ fontSize: 13, color: gray(0.5) }}>
                      {capitalizeFirstLetterOfString(selectedWorkorder.brand)}
                    </Text>
                  ) : null}
                  {selectedWorkorder?.description ? (
                    <Text style={{ fontSize: 13, color: gray(0.5) }}>
                      {capitalizeFirstLetterOfString(selectedWorkorder.description)}
                    </Text>
                  ) : null}
                  <Image_ icon={ICONS.info} size={20} />
                </TouchableOpacity>
              </View>

              {/* Collapsible bike details panel */}
              {sShowBikeDetails && selectedWorkorder && (
                <View style={{ paddingHorizontal: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: gray(0.15) }}>

                  {/* Brand row */}
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                    <TouchableOpacity onPress={() => activateDetailField("brand")} style={{ width: "45%" }}>
                      <View pointerEvents="none">
                        <TextInput_
                          placeholder={"Brand"}
                          editable={false}
                          style={{
                            width: "100%",
                            borderWidth: sDetailField === "brand" ? 2 : 1,
                            borderColor: sDetailField === "brand" ? C.blue : selectedWorkorder?.brand ? "rgba(200, 228, 220, 0.25)" : C.buttonLightGreenOutline,
                            color: C.text,
                            paddingVertical: 2,
                            paddingHorizontal: 4,
                            fontSize: 15,
                            outlineStyle: "none",
                            borderRadius: 5,
                            fontWeight: (sDetailField === "brand" ? sDetailForm.brand : selectedWorkorder?.brand) ? "500" : null,
                            backgroundColor: sDetailField === "brand" ? lightenRGBByPercent(C.blue, 85) : undefined,
                          }}
                          value={sDetailField === "brand" ? capitalizeFirstLetterOfString(sDetailForm.brand) : capitalizeFirstLetterOfString(selectedWorkorder?.brand)}
                        />
                      </View>
                    </TouchableOpacity>
                    <View style={{ width: "55%", flexDirection: "row", paddingLeft: 5, justifyContent: "space-between", alignItems: "center" }}>
                      <View style={{ width: "48%", height: "100%" }}>
                        <DropdownMenu
                          dataArr={zSettings.bikeBrands}
                          enabled={true}
                          onSelect={(item) => {
                            useOpenWorkordersStore.getState().setField("brand", item, selectedWorkorder.id);
                          }}
                          buttonStyle={{ opacity: selectedWorkorder?.brand ? DROPDOWN_SELECTED_OPACITY : 1 }}
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
                          buttonStyle={{ opacity: selectedWorkorder?.brand ? DROPDOWN_SELECTED_OPACITY : 1 }}
                          modalCoordX={0}
                          ref={bikeOptBrandsRef}
                          buttonText={zSettings.bikeOptionalBrandsName}
                        />
                      </View>
                    </View>
                  </View>

                  {/* Description row */}
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                    <TouchableOpacity onPress={() => activateDetailField("description")} style={{ width: "45%" }}>
                      <View pointerEvents="none">
                        <TextInput_
                          placeholder={"Model/Description"}
                          editable={false}
                          style={{
                            width: "100%",
                            borderWidth: sDetailField === "description" ? 2 : 1,
                            borderColor: sDetailField === "description" ? C.blue : selectedWorkorder?.description ? "rgba(200, 228, 220, 0.25)" : C.buttonLightGreenOutline,
                            color: C.text,
                            paddingVertical: 2,
                            paddingHorizontal: 4,
                            fontSize: 15,
                            outlineStyle: "none",
                            borderRadius: 5,
                            fontWeight: (sDetailField === "description" ? sDetailForm.description : selectedWorkorder?.description) ? "500" : null,
                            backgroundColor: sDetailField === "description" ? lightenRGBByPercent(C.blue, 85) : undefined,
                          }}
                          value={sDetailField === "description" ? capitalizeFirstLetterOfString(sDetailForm.description) : capitalizeFirstLetterOfString(selectedWorkorder?.description)}
                        />
                      </View>
                    </TouchableOpacity>
                    <View style={{ width: "55%", flexDirection: "row", paddingLeft: 5, justifyContent: "center", alignItems: "center" }}>
                      <View style={{ width: "100%" }}>
                        <DropdownMenu
                          modalCoordX={55}
                          dataArr={zSettings.bikeDescriptions}
                          enabled={true}
                          onSelect={(item) => {
                            useOpenWorkordersStore.getState().setField("description", item, selectedWorkorder.id);
                          }}
                          buttonStyle={{ opacity: selectedWorkorder?.description ? DROPDOWN_SELECTED_OPACITY : 1 }}
                          ref={descriptionRef}
                          buttonText={"Descriptions"}
                        />
                      </View>
                    </View>
                  </View>

                  {/* Color row */}
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                    <TouchableOpacity onPress={() => activateDetailField("color1")} style={{ width: "24%" }}>
                      <View pointerEvents="none">
                        <TextInput_
                          placeholder={"Color 1"}
                          editable={false}
                          style={{
                            width: "100%",
                            borderWidth: sDetailField === "color1" ? 2 : 1,
                            borderColor: sDetailField === "color1" ? C.blue : selectedWorkorder?.color1?.label ? "rgba(200, 228, 220, 0.25)" : C.buttonLightGreenOutline,
                            paddingVertical: 2,
                            paddingHorizontal: 4,
                            fontSize: 15,
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
                    <View style={{ width: 5 }} />
                    <TouchableOpacity onPress={() => activateDetailField("color2")} style={{ width: "24%" }}>
                      <View pointerEvents="none">
                        <TextInput_
                          placeholder={"Color 2"}
                          editable={false}
                          style={{
                            width: "100%",
                            borderWidth: sDetailField === "color2" ? 2 : 1,
                            borderColor: sDetailField === "color2" ? C.blue : selectedWorkorder?.color2?.label ? "rgba(200, 228, 220, 0.25)" : C.buttonLightGreenOutline,
                            paddingVertical: 2,
                            paddingHorizontal: 4,
                            fontSize: 15,
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
                    <View style={{ width: "48%", flexDirection: "row", paddingLeft: 5, alignItems: "center", justifyContent: "space-between" }}>
                      <View style={{ width: "48%", height: "100%", justifyContent: "center" }}>
                        <DropdownMenu
                          itemSeparatorStyle={{ height: 0 }}
                          dataArr={COLORS}
                          menuBorderColor={"transparent"}
                          enabled={true}
                          onSelect={(item) => {
                            useOpenWorkordersStore.getState().setField("color1", item, selectedWorkorder.id);
                          }}
                          buttonStyle={{ opacity: selectedWorkorder?.color1?.label ? DROPDOWN_SELECTED_OPACITY : 1 }}
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
                          buttonStyle={{ opacity: selectedWorkorder?.color2?.label ? DROPDOWN_SELECTED_OPACITY : 1 }}
                          ref={color2Ref}
                          buttonText={"Color 2"}
                        />
                      </View>
                    </View>
                  </View>

                  {/* Wait time row */}
                  <View style={{ flexDirection: "row", justifyContent: "flex-start", width: "100%", alignItems: "center" }}>
                    <Text style={{ color: gray(0.5), fontSize: 13, marginRight: 4 }}>
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
                            paddingVertical: 2,
                            paddingHorizontal: 4,
                            fontSize: 15,
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
                    <View style={{ flex: 1, flexDirection: "row", paddingLeft: 5, justifyContent: "flex-start", alignItems: "center" }}>
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
                          buttonStyle={{ opacity: selectedWorkorder?.waitTime?.label ? DROPDOWN_SELECTED_OPACITY : 1 }}
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
                          fontSize: 13,
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
                          onPress={handleDetailNext}
                          style={{
                            backgroundColor: C.blue,
                            borderRadius: 8,
                            paddingVertical: 8,
                            paddingHorizontal: 24,
                          }}
                        >
                          <Text style={{ color: C.textWhite, fontSize: 14, fontWeight: "600" }}>Next</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {/* Swipe-up divider to hide */}
                  <View
                    onTouchStart={(e) => { swipeDividerRef.current = e.touches[0].clientY; }}
                    onTouchEnd={(e) => {
                      if (swipeDividerRef.current !== null) {
                        let diff = e.changedTouches[0].clientY - swipeDividerRef.current;
                        if (diff < -20) { _setShowBikeDetails(false); _setDetailField(null); }
                        swipeDividerRef.current = null;
                      }
                    }}
                    style={{
                      height: 24,
                      alignItems: "center",
                      justifyContent: "center",
                      marginTop: 4,
                      cursor: "pointer",
                    }}
                  >
                    <Text style={{ fontSize: 10, fontStyle: "italic", color: gray(0.35) }}>Swipe up to minimize</Text>
                  </View>

                </View>
              )}
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
                    <Text style={{ fontSize: 11, color: C.blue, fontWeight: "600" }}>{"\u2190"} All</Text>
                  </TouchableOpacity>
                  {sMenuPath.map((crumb, i) => (
                    <View key={crumb.id} style={{ flexDirection: "row", alignItems: "center" }}>
                      <Text style={{ color: gray(0.3), marginHorizontal: 3, fontSize: 11 }}>{">"}</Text>
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
                          fontSize: 11,
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
                      paddingVertical: 7,
                      backgroundColor: undefined,
                    }}
                    textStyle={{
                      fontSize: 12,
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
                          paddingVertical: item.id === "common" ? 12 : 7,
                          backgroundColor: undefined,
                        }}
                        numLines={item.name.length > 17 ? 2 : 1}
                        textStyle={{
                          fontSize: getQuickButtonFontSize(item.name, 12),
                          fontWeight: 400,
                          textAlign: "center",
                          color: isActive ? "white" : C.textWhite,
                        }}
                        text={item.name.toUpperCase()}
                      />
                    </View>
                  );
                })}
              </ScrollView>

              {/* Static bottom container: Print + New buttons */}
              {hasWorkorderReady && (
                <View style={{ paddingHorizontal: 6, paddingVertical: 6, borderTopWidth: 1, borderTopColor: gray(0.15) }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    {/* Print dropdown (opens upward) */}
                    {selectedWorkorder && (
                      <View style={{ position: "relative" }}>
                        <TouchableOpacity
                          onPress={() => _setShowPrintMenu((p) => !p)}
                          style={{
                            alignItems: "center",
                            justifyContent: "center",
                            paddingHorizontal: 4,
                          }}
                        >
                          <Image_ icon={ICONS.print} size={24} />
                        </TouchableOpacity>

                        {/* Upward dropdown menu + backdrop */}
                        {sShowPrintMenu && (
                          <>
                          <TouchableOpacity
                            activeOpacity={1}
                            onPress={() => _setShowPrintMenu(false)}
                            style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0 }}
                          />
                          <View style={{
                            position: "absolute",
                            bottom: "100%",
                            left: 0,
                            marginBottom: 4,
                            backgroundColor: C.listItemWhite,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: C.buttonLightGreenOutline,
                            minWidth: 180,
                            overflow: "hidden",
                          }}>
                            <TouchableOpacity
                              onPress={() => {
                                _setShowPrintMenu(false);
                                _setShowIntakeActionModal(true);
                              }}
                              style={{ paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: gray(0.1) }}
                            >
                              <Text style={{ fontSize: 14, color: C.text }}>Intake</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={handleWorkorderPrint}
                              style={{ paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: gray(0.1) }}
                            >
                              <Text style={{ fontSize: 14, color: C.text }}>Workorder</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => {
                                _setShowPrintMenu(false);
                                _setShowPrinterSelectModal(true);
                              }}
                              style={{ paddingHorizontal: 14, paddingVertical: 10, backgroundColor: gray(0.05) }}
                            >
                              <Text style={{ fontSize: 13, color: selectedPrinterLabel ? gray(0.5) : C.orange, fontWeight: selectedPrinterLabel ? "normal" : "600" }}>
                                {selectedPrinterLabel ? "Printer: " + selectedPrinterLabel : "Select Printer"}
                              </Text>
                            </TouchableOpacity>
                          </View>
                          </>
                        )}
                      </View>
                    )}

                    {/* New workorder button */}
                    <TouchableOpacity
                      onPress={handleNewWorkorderPress}
                      style={{
                        backgroundColor: C.green,
                        borderRadius: 6,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        flexDirection: "row",
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ fontSize: 16, fontWeight: "700", color: C.textWhite }}>New</Text>
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
                        <Text style={{ color: gray(0.3), marginHorizontal: 4, fontSize: 13 }}>{">"}</Text>
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
                          fontSize: 13,
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
                <View style={{ flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 8, paddingBottom: 4 }}>
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
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                        }}
                        textStyle={{
                          fontSize: getQuickButtonFontSize(btn.name, 12),
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
                      minHeight: Math.max(500, canvasMaxBottom * 8),
                      overflow: "hidden",
                      borderRadius: 6,
                      padding: 5,
                      boxSizing: "border-box",
                    }}
                  >
                    {canvasItems.map((itemObj) => {
                      let invItem = (zInventory || []).find((i) => i.id === itemObj.inventoryItemID);
                      let name = invItem ? (invItem.informalName || invItem.formalName || "Unknown") : "(not found)";
                      let w = itemObj.w || QB_DEFAULT_W;
                      let h = itemObj.h || QB_DEFAULT_H;
                      let fontSize = getQuickButtonFontSize(name, itemObj.fontSize || 10);
                      let isOnWorkorder = selectedItemIDs.has(itemObj.inventoryItemID);

                      let workorderLine = isOnWorkorder
                        ? (selectedWorkorder.workorderLines || []).find((ln) => ln.inventoryItem?.id === itemObj.inventoryItemID)
                        : null;
                      let hasDiscount = !!workorderLine?.discountObj?.value;

                      return (
                        <TouchableOpacity
                          key={itemObj.inventoryItemID}
                          activeOpacity={0.6}
                          onPress={() => {
                            if (sDiscountCardID) { _setDiscountCardID(null); return; }
                            inventoryItemSelected(invItem);
                          }}
                          onMouseDown={() => handleLongPressStart(itemObj.inventoryItemID)}
                          onMouseUp={handleLongPressEnd}
                          onMouseLeave={handleLongPressEnd}
                          onTouchStart={() => handleLongPressStart(itemObj.inventoryItemID)}
                          onTouchEnd={handleLongPressEnd}
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
                            backgroundColor: isOnWorkorder ? lightenRGBByPercent(C.blue, 70) : C.buttonLightGreenOutline,
                            overflow: "visible",
                            paddingHorizontal: 4,
                            paddingVertical: 2,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: fontSize,
                              color: invItem ? C.text : gray(0.35),
                              textAlign: "center",
                              fontWeight: "500",
                              lineHeight: (itemObj.fontSize || 10) + 6,
                            }}
                            numberOfLines={(name || "").split("\n").length}
                          >
                            {name}
                          </Text>
                          {hasDiscount && (
                            <Text style={{ fontSize: 8, color: C.green, fontWeight: "600" }}>
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
                                style={{ padding: "6px 10px", cursor: "pointer", fontSize: 12, color: C.text, borderBottom: "1px solid " + gray(0.1) }}
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
                                  style={{ padding: "6px 10px", cursor: "pointer", fontSize: 12, color: C.text, borderBottom: "1px solid " + gray(0.1) }}
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
                        <Text style={{ fontSize: 14, color: gray(0.5), marginTop: 12 }}>No items in this menu</Text>
                      </View>
                    )}
                  </div>
                </ScrollView>
              ) : (
                <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                  <Text style={{ fontSize: 14, color: gray(0.4) }}>Select a button to view items</Text>
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
                    paddingBottom: 6,
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
                            <Image_ icon={ICONS.dollarYellow} size={20} />
                          </TouchableOpacity>
                        )}

                        {/* Card body */}
                        <View
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
                            <TouchableOpacity
                              onPress={() => {
                                _setIntakeNotesLineID(line.id);
                                _setIntakeNotesText(line.intakeNotes || "");
                              }}
                              style={{ marginRight: 5 }}
                            >
                              <Image_ icon={ICONS.editPencil} size={14} style={{ opacity: 0.5 }} />
                            </TouchableOpacity>
                          )}
                          {(inv.customPart || inv.customLabor) && (
                            <Image_ icon={inv.customLabor ? ICONS.tools1 : ICONS.gears1} size={14} style={{ marginRight: 5 }} />
                          )}
                          <Text style={{ fontSize: 13, color: C.text, flex: 1 }} numberOfLines={1}>
                            {informal ? informal + " \u2192 " + formal : formal}{qtyLabel} - {formatCurrencyDisp((inv.price || 0) * (line.qty || 1), true)}
                          </Text>
                        </View>

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
                            <Image_ icon={ICONS.trash} size={20} />
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}

                  {/* Totals row */}
                  <View
                    pointerEvents="none"
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      alignSelf: "flex-start",
                      marginTop: 6,
                      backgroundColor: "rgba(255,255,255,0.65)",
                      borderRadius: 6,
                      paddingVertical: 4,
                      paddingHorizontal: 10,
                      gap: 14,
                    }}
                  >
                    <View style={{ alignItems: "center" }}>
                      <Text style={{ fontSize: 9, color: gray(0.5) }}>Subtotal</Text>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: C.text }}>{formatCurrencyDisp(totals.runningSubtotal, true)}</Text>
                    </View>
                    <View style={{ alignItems: "center" }}>
                      <Text style={{ fontSize: 9, color: gray(0.5) }}>Discount</Text>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: C.red }}>-{formatCurrencyDisp(totals.runningDiscount, true)}</Text>
                    </View>
                    <View style={{ alignItems: "center" }}>
                      <Text style={{ fontSize: 9, color: gray(0.5) }}>Tax</Text>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: C.text }}>{formatCurrencyDisp(totals.runningTax, true)}</Text>
                    </View>
                    <View style={{ alignItems: "center" }}>
                      <Text style={{ fontSize: 9, color: gray(0.5) }}>Total</Text>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: C.text }}>{formatCurrencyDisp(totals.finalTotal, true)}</Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Slim swipe-up bar at bottom of right panel */}
              <View
                onTouchStart={(e) => { itemSwipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
                onClick={() => _setShowItemOverlay((p) => !p)}
                onTouchEnd={(e) => {
                  if (itemSwipeRef.current) {
                    let dx = e.changedTouches[0].clientX - itemSwipeRef.current.x;
                    let dy = e.changedTouches[0].clientY - itemSwipeRef.current.y;
                    if (dy < -20) { _setShowItemOverlay(true); }
                    else if (Math.abs(dx) < 10 && Math.abs(dy) < 10) { _setShowItemOverlay((p) => !p); }
                    itemSwipeRef.current = null;
                  }
                }}
                style={{
                  height: 22,
                  alignItems: "center",
                  justifyContent: "center",
                  borderTopWidth: 1,
                  borderTopColor: sShowItemOverlay ? "transparent" : gray(0.1),
                  backgroundColor: "rgba(255,255,255,0.4)",
                  cursor: "pointer",
                }}
              >
                {selectedWorkorder?.workorderLines?.length > 0 && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ fontSize: 10, fontStyle: "italic", color: sShowItemOverlay ? "transparent" : gray(0.35) }}>Tap/swipe up to see items</Text>
                    <View style={{
                      backgroundColor: C.blue,
                      borderRadius: 8,
                      minWidth: 16,
                      height: 16,
                      alignItems: "center",
                      justifyContent: "center",
                      paddingHorizontal: 4,
                    }}>
                      <Text style={{ fontSize: 9, fontWeight: "700", color: C.textWhite }}>
                        {selectedWorkorder.workorderLines.reduce((sum, ln) => sum + (ln.qty || 1), 0)}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
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
                borderRadius: 10,
                width: "60%",
                maxHeight: "70%",
                overflow: "hidden",
              }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: gray(0.15) }}>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: C.text }}>Select Printer</Text>
                  <TouchableOpacity onPress={() => _setShowPrinterSelectModal(false)}>
                    <Text style={{ fontSize: 18, fontWeight: "700", color: gray(0.4) }}>X</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
                  {receiptPrinters.length === 0 ? (
                    <Text style={{ fontSize: 14, color: gray(0.5), paddingVertical: 20, textAlign: "center" }}>No receipt printers configured</Text>
                  ) : (
                    receiptPrinters.map((printer) => {
                      let isSelected = printer.id === sSelectedPrinterID;
                      let isOnline = printer.lastSeen && (Date.now() - printer.lastSeen < 2 * 60 * 1000);
                      return (
                        <TouchableOpacity
                          key={printer.id}
                          onPress={() => handleSelectPrinter(printer.id)}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            paddingVertical: 12,
                            paddingHorizontal: 8,
                            borderBottomWidth: 1,
                            borderBottomColor: gray(0.1),
                            backgroundColor: isSelected ? lightenRGBByPercent(C.green, 70) : "transparent",
                            borderRadius: 6,
                            marginBottom: 4,
                          }}
                        >
                          <View style={{
                            width: 10,
                            height: 10,
                            borderRadius: 5,
                            backgroundColor: isOnline ? C.green : gray(0.3),
                            marginRight: 10,
                          }} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 15, fontWeight: isSelected ? "600" : "normal", color: C.text }}>
                              {printer.label || printer.printerName || printer.id}
                            </Text>
                            {printer.printerName && printer.label ? (
                              <Text style={{ fontSize: 12, color: gray(0.5) }}>{printer.printerName}</Text>
                            ) : null}
                          </View>
                          {isSelected && (
                            <Text style={{ fontSize: 16, color: C.green, fontWeight: "700" }}>{"\u2713"}</Text>
                          )}
                        </TouchableOpacity>
                      );
                    })
                  )}
                </ScrollView>
              </View>
            </View>
          )}

          {/* Intake action modal (Print / Text/Email / All) — portal */}
          {sShowIntakeActionModal && createPortal(
            <View style={{
              position: "fixed",
              top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: "rgba(0,0,0,0.5)",
              justifyContent: "center",
              alignItems: "center",
            }}>
              <View style={{
                backgroundColor: C.listItemWhite,
                borderRadius: 10,
                width: 360,
              }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: gray(0.15) }}>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: C.text }}>Intake Receipt</Text>
                  <TouchableOpacity onPress={() => _setShowIntakeActionModal(false)}>
                    <Text style={{ fontSize: 18, fontWeight: "700", color: gray(0.4) }}>X</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ padding: 16 }}>
                  <TouchableOpacity
                    onPress={handleIntakePrint}
                    style={{
                      backgroundColor: sSelectedPrinterID ? C.green : gray(0.3),
                      borderRadius: 8,
                      paddingVertical: 14,
                      alignItems: "center",
                      marginBottom: 10,
                    }}
                    disabled={!sSelectedPrinterID}
                  >
                    <Text style={{ fontSize: 16, fontWeight: "600", color: C.textWhite }}>
                      {sSelectedPrinterID ? "Print" : "Print (no printer selected)"}
                    </Text>
                  </TouchableOpacity>
                  {(customerCell || customerEmail) ? (
                    <TouchableOpacity
                      onPress={handleIntakeTextEmail}
                      style={{
                        backgroundColor: C.blue,
                        borderRadius: 8,
                        paddingVertical: 14,
                        alignItems: "center",
                        marginBottom: 10,
                      }}
                    >
                      <Text style={{ fontSize: 16, fontWeight: "600", color: C.textWhite }}>
                        {customerCell && customerEmail ? "Text/Email" : customerCell ? "Text" : "Email"}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    onPress={handleIntakeAll}
                    style={{
                      backgroundColor: (sSelectedPrinterID || customerCell || customerEmail) ? C.purple : gray(0.3),
                      borderRadius: 8,
                      paddingVertical: 14,
                      alignItems: "center",
                    }}
                    disabled={!sSelectedPrinterID && !customerCell && !customerEmail}
                  >
                    <Text style={{ fontSize: 16, fontWeight: "600", color: C.textWhite }}>All</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>,
            document.body
          )}

          {/* Intake notes modal for editing a line's intake notes */}
          {sIntakeNotesLineID && (
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
                  <Text style={{ fontSize: 18, fontWeight: "600", color: C.text }}>Intake Notes</Text>
                  <TouchableOpacity onPress={() => _setIntakeNotesLineID(null)}>
                    <Text style={{ fontSize: 20, color: gray(0.5), fontWeight: "600", paddingHorizontal: 8 }}>{"\u2715"}</Text>
                  </TouchableOpacity>
                </div>

                {/* Text display area */}
                <View style={{ flex: 1, padding: 12 }}>
                  <View style={{
                    flex: 1,
                    borderWidth: 2,
                    borderColor: C.buttonLightGreenOutline,
                    borderRadius: 10,
                    backgroundColor: C.listItemWhite,
                    padding: 10,
                  }}>
                    <Text style={{ fontSize: 16, color: "orange", minHeight: 40 }}>
                      {sIntakeNotesText}<Text style={{ color: C.blue }}>|</Text>
                    </Text>
                  </View>
                </View>

                {/* Keypad with number row */}
                <div style={{ paddingLeft: 12, paddingRight: 12, paddingBottom: 8 }}>
                  <StandKeypad mode="alpha" showNumberRow={true} onKeyPress={(key) => {
                    if (key === "CLR") { _setIntakeNotesText(""); return; }
                    if (key === "\u232B") { _setIntakeNotesText(sIntakeNotesText.slice(0, -1)); return; }
                    let char = key === " " ? " " : key.toLowerCase();
                    if (sIntakeNotesText.length === 0) char = key.toUpperCase();
                    _setIntakeNotesText(sIntakeNotesText + char);
                  }} />
                </div>

                {/* Save button */}
                <div style={{ padding: 12, borderTop: "1px solid " + gray(0.1) }}>
                  <TouchableOpacity
                    onPress={() => {
                      let updatedLines = (selectedWorkorder?.workorderLines || []).map((ln) =>
                        ln.id === sIntakeNotesLineID ? { ...ln, intakeNotes: sIntakeNotesText } : ln
                      );
                      useOpenWorkordersStore.getState().setField("workorderLines", updatedLines, sSelectedWorkorderID, true);
                      _setIntakeNotesLineID(null);
                    }}
                    style={{
                      paddingVertical: 14,
                      borderRadius: 8,
                      backgroundColor: C.green,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: "600", color: C.textWhite }}>Save</Text>
                  </TouchableOpacity>
                </div>
              </div>
            </div>
          )}
        </View>
      ) : (
        <StandWorkorderDetail
          workorderID={sSelectedWorkorderID}
          customer={sSelectedCustomer}
          onBack={handleBackToButtons}
          onShowCustomerModal={() => _setShowCustomerModal(true)}
        />
      )}
    </View>
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
        width: 90,
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
            <Text style={{ color: info.textColor, fontSize: 10, textAlign: "right", fontStyle: "italic" }}>
              {capitalizeFirstLetterOfString(info.waitEndDay.split("\n")[0])}
            </Text>
            <Text style={{ color: info.textColor, fontSize: 12, textAlign: "right" }}>
              {info.waitEndDay.split("\n")[1]}
            </Text>
          </>
        ) : !!info.waitEndDay ? (
          <Text style={{ color: info.textColor, fontSize: 12, textAlign: "right" }}>
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
          <Text style={{ fontSize: 18, fontWeight: "600", color: C.text }}>Open Workorders</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ fontSize: 20, color: gray(0.5), fontWeight: "600", paddingHorizontal: 8 }}>{"\u2715"}</Text>
          </TouchableOpacity>
        </View>

        {/* Workorder list */}
        <ScrollView style={{ flex: 1, paddingHorizontal: 12, paddingTop: 8 }}>
          {sortedWorkorders.length === 0 ? (
            <Text style={{ fontSize: 14, color: gray(0.4), textAlign: "center", paddingVertical: 20 }}>No open workorders.</Text>
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
                      paddingVertical: 2,
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
                            style={{ fontSize: 15, color: "dimgray" }}
                          >
                            {capitalizeFirstLetterOfString(workorder.customerFirst) + " " + capitalizeFirstLetterOfString(workorder.customerLast)}
                          </Text>
                        </View>

                        {/* Brand + description + line count */}
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <Text style={{ fontSize: 14, fontWeight: "500", color: C.text }}>
                            {capitalizeFirstLetterOfString(workorder.brand) || ""}
                          </Text>
                          {!!workorder.description && (
                            <View style={{ width: 7, height: 2, marginHorizontal: 5, backgroundColor: "lightgray" }} />
                          )}
                          <Text style={{ fontSize: 14, color: C.text }}>
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
                              <Text style={{ color: "white", fontSize: 13, fontWeight: "600" }}>
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
                          <Text style={{ color: "dimgray", fontSize: 13 }}>
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
                              <Text style={{ color: C.red, fontSize: 11, fontStyle: "italic", marginRight: 5 }}>{wipUser}</Text>
                            )}
                            <Text style={{ color: rs.textColor, fontSize: 13, fontWeight: "normal" }}>
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
                          <Text numberOfLines={1} style={{ fontSize: 14, color: C.blue, fontWeight: "500" }}>
                            {capitalizeFirstLetterOfString(workorder.partOrdered)}
                          </Text>
                        )}
                        {!!(workorder.partOrdered && workorder.partSource) && (
                          <View style={{ width: 5, height: 2, marginHorizontal: 5, backgroundColor: "lightgray" }} />
                        )}
                        {!!workorder.partSource && (
                          <Text numberOfLines={1} style={{ fontSize: 14, color: C.orange }}>
                            {capitalizeFirstLetterOfString(workorder.partSource)}
                          </Text>
                        )}
                        {!!(workorder.partOrderedMillis && workorder.partOrderEstimateMillis) && (
                          <Text numberOfLines={1} style={{ fontSize: 12, color: "dimgray", marginLeft: 6 }}>
                            {formatMillisForDisplay(workorder.partOrderedMillis)}
                            {" \u2192 " + formatMillisForDisplay(workorder.partOrderEstimateMillis)}
                          </Text>
                        )}
                        {!!workorder.trackingNumber && (
                          <Text numberOfLines={1} style={{ fontSize: 12, color: C.blue, marginLeft: 6 }}>
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
        handleSearchTextChange(sSearchText + key.toLowerCase());
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
        val = val + (field === "email" ? key.toLowerCase() : key.toLowerCase());
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
        <div style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 12,
          borderBottom: "1px solid " + gray(0.1),
        }}>
          {sMode === "create" ? (
            <TouchableOpacity
              onPress={() => _setMode("search")}
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <Text style={{ fontSize: 16, color: C.blue, fontWeight: "600" }}>{"\u2190"} Back to Search</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={onClose}>
              <Text style={{ fontSize: 20, color: gray(0.5), fontWeight: "600", paddingHorizontal: 8 }}>{"\u2715"}</Text>
            </TouchableOpacity>
          )}
        </div>

        {sMode === "search" ? (
          <>
            {/* Search display + mode toggle */}
            <div style={{ padding: 12, display: "flex", flexDirection: "row", alignItems: "center", gap: 10 }}>
              <div style={{
                flex: 1,
                height: 44,
                borderRadius: 8,
                borderWidth: 2,
                borderStyle: "solid",
                borderColor: C.buttonLightGreenOutline,
                backgroundColor: C.listItemWhite,
                display: "flex",
                alignItems: "center",
                paddingLeft: 12,
                paddingRight: 12,
                fontSize: 20,
                fontWeight: "500",
                color: C.text,
              }}>
                {displayText || <span style={{ color: gray(0.3) }}>{sKeypadMode === "phone" ? "Phone number..." : "Name..."}</span>}
              </div>
              <TouchableOpacity
                onPress={() => {
                  let newMode = sKeypadMode === "phone" ? "alpha" : "phone";
                  _setKeypadMode(newMode);
                  _setSearchText("");
                  _setSearchResults([]);
                }}
                style={{
                  height: 44,
                  paddingHorizontal: 14,
                  borderRadius: 8,
                  backgroundColor: C.blue,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: "white" }}>
                  {sKeypadMode === "phone" ? "ABC" : "123"}
                </Text>
              </TouchableOpacity>
            </div>

            {/* Keypad */}
            <div style={{ paddingLeft: 12, paddingRight: 12, paddingBottom: 8 }}>
              <StandKeypad mode={effectiveKeypadMode} onKeyPress={handleKeyPress} />
            </div>

            {/* Search results */}
            <ScrollView style={{ flex: 1, paddingHorizontal: 12 }}>
              {sSearching && (
                <Text style={{ fontSize: 13, color: gray(0.4), textAlign: "center", paddingVertical: 10 }}>Searching...</Text>
              )}
              {sSearchResults.map((cust) => (
                <TouchableOpacity
                  key={cust.id}
                  onPress={() => handleSelectCustomer(cust)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 12,
                    paddingHorizontal: 12,
                    marginBottom: 4,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: C.buttonLightGreenOutline,
                    backgroundColor: C.listItemWhite,
                    gap: 16,
                  }}
                >
                  <Text style={{ flex: 1, fontSize: 16, fontWeight: "600", color: C.text }}>
                    {capitalizeFirstLetterOfString(cust.first || "")} {capitalizeFirstLetterOfString(cust.last || "")}
                  </Text>
                  <Text style={{ fontSize: 14, color: gray(0.5) }}>
                    {formatPhoneWithDashes(cust.customerCell || cust.cell || "")}
                  </Text>
                  <Text style={{ fontSize: 13, color: gray(0.4) }} numberOfLines={1}>
                    {cust.email || ""}
                  </Text>
                </TouchableOpacity>
              ))}
              {!sSearching && sSearchText.length >= 2 && sSearchResults.length === 0 && (
                <Text style={{ fontSize: 13, color: gray(0.4), textAlign: "center", paddingVertical: 10 }}>No results found.</Text>
              )}
            </ScrollView>

            {/* Create new customer button - phone: 10 digits + no results; name: 3+ chars */}
            {((sKeypadMode === "phone" && sSearchText.replace(/\D/g, "").length === 10 && sSearchResults.length === 0 && !sSearching) ||
              (sKeypadMode === "alpha" && sSearchText.length >= 3)) && (
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
                  <Text style={{ fontSize: 16, fontWeight: "600", color: "white" }}>+ Create New Customer</Text>
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
                  <Text style={{ fontSize: 13, color: gray(0.5), width: 80 }}>{field.label}</Text>
                  <Text style={{ fontSize: 16, fontWeight: "500", color: C.text, flex: 1 }}>
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
                <Text style={{ fontSize: 16, fontWeight: "600", color: "white" }}>Create & Start Workorder</Text>
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
