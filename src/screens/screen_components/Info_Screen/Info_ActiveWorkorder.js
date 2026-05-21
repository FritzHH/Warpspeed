/* eslint-disable */

import { capitalizeFirstLetterOfString, checkInputForNumbersOnly, formatCurrencyDisp, formatMillisForDisplay, formatPhoneWithDashes, formatPhoneWithParens, createNewWorkorder, generateEAN13Barcode, generate36CharUUID, lightenRGBByPercent, log, deepEqual, printBuilder, removeUnusedFields, resolveStatus, calculateWaitEstimateLabel, findTemplateByType, scheduleAutoText, localStorageWrapper } from "../../../utils";
import {
  Button as Button_,
  CheckBox,
  DatePicker as DatePicker_,
  DropdownMenu,
  Image as Image_,
  Pressable as Pressable_,
  PrinterAlert,
  ScreenModal,
  TextInput as TextInput_,
  TimePicker as TimePicker_,
  Tooltip,
} from "../../../dom_components";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { C, COLOR_GRADIENTS, Colors, ICONS, Z } from "../../../styles";
import {
  SETTINGS_OBJ,
  WORKORDER_PROTO,
  CUSTOMER_PROTO,
  TAB_NAMES,
  COLORS,
  NONREMOVABLE_STATUSES,
  NONREMOVABLE_WAIT_TIMES,
  CONTACT_RESTRICTIONS,
  RECEIPT_TYPES,
  WAIT_TIMES_PROTO,
  CUSTOM_WAIT_TIME,
  CUSTOMER_LANGUAGES,
  ITEM_ORDERED_PROTO,
} from "../../../data";
import { MILLIS_IN_DAY, build_db_path } from "../../../constants";
import React, { useCallback, useEffect, useRef, useState, lazy, Suspense } from "react";
import cloneDeep from "lodash/cloneDeep";
import {
  useCurrentCustomerStore,
  useOpenWorkordersStore,
  useLoginStore,
  useSettingsStore,
  useTabNamesStore,
  useAlertScreenStore,
  useUploadProgressStore,
} from "../../../stores";
const CustomerInfoScreenModalComponent = lazy(() =>
  import("../modal_screens/CustomerInfoModalScreen").then((m) => ({ default: m.CustomerInfoScreenModalComponent }))
);
const WorkorderMediaModal = lazy(() =>
  import("../modal_screens/WorkorderMediaModal").then((m) => ({ default: m.WorkorderMediaModal }))
);
import { dbSavePrintObj, dbSendReceipt, startNewWorkorder } from "../../../db_calls_wrapper";
import styles from "./Info_ActiveWorkorder.module.css";

// --- Dimming when field has text (easy to adjust) ---
const FILLED_DROPDOWN_OPACITY = 0.3;                          // dropdown button opacity when text present
const FILLED_BORDER_COLOR = "rgba(200, 228, 220, 0.25)";      // faded version of C.buttonLightGreenOutline rgb(200,228,220)
const RECEIPT_DROPDOWN_SELECTIONS = [
  RECEIPT_TYPES.intake,
  RECEIPT_TYPES.workorder,
];

const PickupDeliveryInputs = ({ pd, isDonePaid, dateLabel, formatTime12, parse12To24Parts, to24, updatePickupFields }) => {
  const [sShowDatePicker, _sSetShowDatePicker] = useState(false);
  const [sShowStartPicker, _sSetShowStartPicker] = useState(false);
  const [sShowEndPicker, _sSetShowEndPicker] = useState(false);

  const pillStyle = {
    padding: "4px 8px",
    borderRadius: 5,
    backgroundColor: C.blue,
    border: "none",
    cursor: "pointer",
  };
  const pillText = { fontSize: 12, color: "white", fontWeight: "600" };
  const labelText = { fontSize: 11, color: C.textMuted, fontStyle: "italic", marginRight: 4 };

  const startParts = parse12To24Parts(pd.startTime);
  const endParts = parse12To24Parts(pd.endTime);

  return (
    <>
      <PopoverPrimitive.Root open={sShowDatePicker} onOpenChange={_sSetShowDatePicker}>
        <PopoverPrimitive.Anchor asChild>
          <button
            type="button"
            disabled={isDonePaid}
            onClick={() => _sSetShowDatePicker(v => !v)}
            style={{ ...pillStyle, backgroundColor: C.green }}
          >
            <span style={pillText}>{dateLabel}</span>
          </button>
        </PopoverPrimitive.Anchor>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content sideOffset={4} collisionPadding={10} style={{ zIndex: Z.dropdown }}>
            <div>
              <DatePicker_
                initialMonth={Number(pd.month) || new Date().getMonth() + 1}
                initialDay={Number(pd.day) || new Date().getDate()}
                onConfirm={({ month, day }) => {
                  updatePickupFields({ month: String(month), day: String(day) });
                  _sSetShowDatePicker(false);
                }}
                onCancel={() => _sSetShowDatePicker(false)}
              />
            </div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>

      <div style={{ display: "flex", flexDirection: "row", alignItems: "center" }}>
        <PopoverPrimitive.Root open={sShowStartPicker} onOpenChange={_sSetShowStartPicker}>
          <PopoverPrimitive.Anchor asChild>
            <button type="button" disabled={isDonePaid} onClick={() => _sSetShowStartPicker(v => !v)} style={pillStyle}>
              <span style={pillText}>{formatTime12(pd.startTime)}</span>
            </button>
          </PopoverPrimitive.Anchor>
          <PopoverPrimitive.Portal>
            <PopoverPrimitive.Content sideOffset={4} collisionPadding={10} style={{ zIndex: Z.dropdown }}>
              <div>
                <TimePicker_
                  initialHour={startParts.hour}
                  initialMinute={startParts.minute}
                  initialPeriod={startParts.period}
                  onConfirm={({ hour, minute, period }) => {
                    updatePickupFields({ startTime: to24(hour, minute, period) });
                    _sSetShowStartPicker(false);
                  }}
                  onCancel={() => _sSetShowStartPicker(false)}
                />
              </div>
            </PopoverPrimitive.Content>
          </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>

        <span style={{ ...labelText, marginLeft: 7 }}>to</span>

        <PopoverPrimitive.Root open={sShowEndPicker} onOpenChange={_sSetShowEndPicker}>
          <PopoverPrimitive.Anchor asChild>
            <button type="button" disabled={isDonePaid} onClick={() => _sSetShowEndPicker(v => !v)} style={pillStyle}>
              <span style={pillText}>{formatTime12(pd.endTime)}</span>
            </button>
          </PopoverPrimitive.Anchor>
          <PopoverPrimitive.Portal>
            <PopoverPrimitive.Content sideOffset={4} collisionPadding={10} style={{ zIndex: Z.dropdown }}>
              <div>
                <TimePicker_
                  initialHour={endParts.hour}
                  initialMinute={endParts.minute}
                  initialPeriod={endParts.period}
                  onConfirm={({ hour, minute, period }) => {
                    updatePickupFields({ endTime: to24(hour, minute, period) });
                    _sSetShowEndPicker(false);
                  }}
                  onCancel={() => _sSetShowEndPicker(false)}
                />
              </div>
            </PopoverPrimitive.Content>
          </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
      </div>
    </>
  );
};

export const ActiveWorkorderComponent = ({}) => {
  // store getters ///////////////////////////////////////////////////////////////////
  const zOpenWorkorder = useOpenWorkordersStore(
    (state) => {
      let id = state.workorderPreviewID || state.openWorkorderID;
      return state.workorders.find((o) => o.id === id) || null;
    },
    deepEqual
  );
  const zIsPreview = useOpenWorkordersStore((state) => !!state.workorderPreviewID && state.workorderPreviewID !== state.openWorkorderID);
  const zIsLocked = useOpenWorkordersStore((state) => !!state.lockedWorkorderID && state.lockedWorkorderID === (state.workorderPreviewID || state.openWorkorderID));
  const zWorkordersLoaded = useOpenWorkordersStore((state) => state.workordersLoaded);
  const zCustomerRefreshed = useCurrentCustomerStore((state) => state.customerRefreshed);
  const zCustomerLanguage = useCurrentCustomerStore((state) => state.customer?.language || "");
  const zCustomerDeposits = useCurrentCustomerStore((state) => state.customer?.deposits) || [];
  const zCustomerCredits = useCurrentCustomerStore((state) => state.customer?.credits) || [];
  const zCustomer = {
    first: zOpenWorkorder?.customerFirst || "",
    last: zOpenWorkorder?.customerLast || "",
    customerCell: zOpenWorkorder?.customerCell || "",
    customerLandline: zOpenWorkorder?.customerLandline || "",
    email: zOpenWorkorder?.customerEmail || "",
    contactRestriction: zOpenWorkorder?.customerContactRestriction || "",
  };
  var zSettings = SETTINGS_OBJ;
  zSettings = useSettingsStore((state) => state.settings);

  ///////////////////////////////////////////////////////////////////////////////
  const [sShowCustomerInfoScreen, _setShowCustomerInfoScreen] =
    React.useState(false);
  const [sShowMediaModal, _setShowMediaModal] = useState(false);
  const [sWaitTimeBlink, _setWaitTimeBlink] = useState(false);
  const sUploadProgress = useUploadProgressStore((s) => s.progress);
  const [sPrinterAlert, _setPrinterAlert] = useState(null); // { x, y }
  const [sTrackingModalVisible, _setTrackingModalVisible] = useState(false);

  // Show/hide for Ordering Info section
  const [sShowItemOrdering, _sSetShowItemOrdering] = useState(false);
  const hasItemOrderingData = (zOpenWorkorder?.orderedItems || []).length > 0;

  // Active ordered item — null means no item selected (fields disabled)
  const [sActiveOrderedItem, _sSetActiveOrderedItem] = useState(null);
  const [sActiveOrderedIndex, _sSetActiveOrderedIndex] = useState(-1);
  const [sShowTracker, _sSetShowTracker] = useState(false);
  const hasCommittedRef = useRef(false);
  const hasActiveItem = sActiveOrderedItem !== null;

  function handleAddOrderedItem() {
    useLoginStore.getState().requireLogin(() => {
      const newItem = { ...cloneDeep(ITEM_ORDERED_PROTO), id: generate36CharUUID() };
      const nextIndex = (zOpenWorkorder?.orderedItems || []).length;
      _sSetActiveOrderedItem(newItem);
      _sSetActiveOrderedIndex(nextIndex);
      hasCommittedRef.current = false;
      _setWaitDays(0);
      setTimeout(() => partOrderedInputRef.current?.focus(), 0);
    });
  }

  function commitOrUpdateActiveItem(item) {
    const woID = zOpenWorkorder?.id;
    if (!woID) return;
    const current = zOpenWorkorder?.orderedItems || [];
    if (!hasCommittedRef.current) {
      hasCommittedRef.current = true;
      useOpenWorkordersStore.getState().setField("orderedItems", [...current, item], woID);
    } else {
      const updated = current.map((o) => o.id === item.id ? item : o);
      useOpenWorkordersStore.getState().setField("orderedItems", updated, woID);
    }
  }

  function updateActiveItemField(field, value) {
    if (!sActiveOrderedItem) return;
    const updated = { ...sActiveOrderedItem, [field]: value };
    _sSetActiveOrderedItem(updated);
    commitOrUpdateActiveItem(updated);
  }

  function handleNavigateRight() {
    const items = zOpenWorkorder?.orderedItems || [];
    if (items.length === 0) return;
    const nextIndex = sActiveOrderedIndex >= items.length - 1 ? 0 : sActiveOrderedIndex + 1;
    _sSetActiveOrderedItem(cloneDeep(items[nextIndex]));
    _sSetActiveOrderedIndex(nextIndex);
    hasCommittedRef.current = true;
    const item = items[nextIndex];
    const days = item.partOrderEstimateMillis && item.partOrderedMillis
      ? Math.max(0, Math.round((item.partOrderEstimateMillis - item.partOrderedMillis) / MILLIS_IN_DAY))
      : 0;
    _setWaitDays(days);
  }

  function handleNavigateLeft() {
    const items = zOpenWorkorder?.orderedItems || [];
    if (items.length === 0) return;
    const prevIndex = sActiveOrderedIndex <= 0 ? items.length - 1 : sActiveOrderedIndex - 1;
    _sSetActiveOrderedItem(cloneDeep(items[prevIndex]));
    _sSetActiveOrderedIndex(prevIndex);
    hasCommittedRef.current = true;
    const item = items[prevIndex];
    const days = item.partOrderEstimateMillis && item.partOrderedMillis
      ? Math.max(0, Math.round((item.partOrderEstimateMillis - item.partOrderedMillis) / MILLIS_IN_DAY))
      : 0;
    _setWaitDays(days);
  }

  // Auto-load first ordered item when workorder changes
  useEffect(() => {
    const items = zOpenWorkorder?.orderedItems || [];
    if (items.length > 0) {
      const first = cloneDeep(items[0]);
      _sSetActiveOrderedItem(first);
      _sSetActiveOrderedIndex(0);
      hasCommittedRef.current = true;
      _sSetShowItemOrdering(true);
      const days = first.partOrderEstimateMillis && first.partOrderedMillis
        ? Math.max(0, Math.round((first.partOrderEstimateMillis - first.partOrderedMillis) / MILLIS_IN_DAY))
        : 0;
      _setWaitDays(days);
    } else {
      _sSetActiveOrderedItem(null);
      _sSetActiveOrderedIndex(-1);
      hasCommittedRef.current = false;
      _sSetShowItemOrdering(false);
      _setWaitDays(0);
    }
  }, [zOpenWorkorder?.id]);

  // Estimated wait days — local state for instant UI, debounced write
  const [sWaitDays, _setWaitDays] = useState(0);
  const waitDaysTimerRef = useRef(null);

  // Blink wait time input when status requires wait time but none is selected
  useEffect(() => {
    let statusObj = (zSettings?.statuses || []).find((s) => s.id === zOpenWorkorder?.status);
    let waitLabel = zOpenWorkorder?.waitTime?.label || "";
    let maxDays = zOpenWorkorder?.waitTime?.maxWaitTimeDays;
    let isPickupDelivery = zOpenWorkorder?.status === "pickup" || zOpenWorkorder?.status === "delivery";
    let needsBlink = !isPickupDelivery && statusObj?.requireWaitTime && (waitLabel.length <= 3 || maxDays === 0 || maxDays === "0");
    if (!needsBlink) {
      _setWaitTimeBlink(false);
      return;
    }
    _setWaitTimeBlink(true);
    let interval = setInterval(() => {
      _setWaitTimeBlink((prev) => !prev);
    }, 500);
    return () => clearInterval(interval);
  }, [zOpenWorkorder?.status, zOpenWorkorder?.waitTime?.label, zOpenWorkorder?.waitTime?.maxWaitTimeDays, zSettings?.statuses]);

  function updateWaitDays(newDays) {
    if (!sActiveOrderedItem) return;
    _setWaitDays(newDays);
    clearTimeout(waitDaysTimerRef.current);
    waitDaysTimerRef.current = setTimeout(() => {
      const now = Date.now();
      const updated = {
        ...sActiveOrderedItem,
        partOrderedMillis: now,
        partOrderEstimateMillis: now + (newDays * MILLIS_IN_DAY),
      };
      _sSetActiveOrderedItem(updated);
      commitOrUpdateActiveItem(updated);
    }, 700);
  }

  // Brand autocomplete
  const [sBrandFocused, _setBrandFocused] = useState(false);
  const brandWrapperRef = useRef(null);
  const brandBackspaced = useRef(false);

  const brandSuggestions = sBrandFocused && zOpenWorkorder?.brand?.trim()
    ? (zSettings.allBrands || []).filter(
        (b) => b.toLowerCase().startsWith(zOpenWorkorder.brand.trim().toLowerCase()) && b.toLowerCase() !== zOpenWorkorder.brand.trim().toLowerCase()
      ).slice(0, 8)
    : [];

  function saveBrandToAllBrands(brand) {
    if (!brand || !brand.trim()) return;
    const trimmed = brand.trim();
    const existing = zSettings.allBrands || [];
    if (existing.some((b) => b.toLowerCase() === trimmed.toLowerCase())) return;
    const updated = [...existing, trimmed].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    useSettingsStore.getState().setField("allBrands", updated);
  }

  // Description autocomplete
  const [sDescFocused, _setDescFocused] = useState(false);
  const descInputRef = useRef(null);
  const color1InputRef = useRef(null);
  const descBackspaced = useRef(false);

  const descSuggestions = sDescFocused && zOpenWorkorder?.description?.trim()
    ? (zSettings.allDescriptions || []).filter(
        (d) => d.toLowerCase().startsWith(zOpenWorkorder.description.trim().toLowerCase()) && d.toLowerCase() !== zOpenWorkorder.description.trim().toLowerCase()
      ).slice(0, 8)
    : [];

  function saveDescToAllDescriptions(desc) {
    if (!desc || !desc.trim()) return;
    const trimmed = desc.trim();
    const existing = zSettings.allDescriptions || [];
    if (existing.some((d) => d.toLowerCase() === trimmed.toLowerCase())) return;
    const updated = [...existing, trimmed].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    useSettingsStore.getState().setField("allDescriptions", updated);
  }

  // Color autocomplete
  const [sColor1Focused, _setColor1Focused] = useState(false);
  const [sColor2Focused, _setColor2Focused] = useState(false);

  const color1WrapperRef = useRef(null);
  const color2WrapperRef = useRef(null);
  const color2InputRef = useRef(null);
  const color1Backspaced = useRef(false);
  const color2Backspaced = useRef(false);

  const allColorLabels = COLORS.map((c) => c.label);

  const color1Suggestions = sColor1Focused && zOpenWorkorder?.color1?.label?.trim()
    ? allColorLabels.filter(
        (c) => c.toLowerCase().startsWith(zOpenWorkorder.color1.label.trim().toLowerCase()) && c.toLowerCase() !== zOpenWorkorder.color1.label.trim().toLowerCase()
      ).slice(0, 8)
    : [];

  const color2Suggestions = sColor2Focused && zOpenWorkorder?.color2?.label?.trim()
    ? allColorLabels.filter(
        (c) => c.toLowerCase().startsWith(zOpenWorkorder.color2.label.trim().toLowerCase()) && c.toLowerCase() !== zOpenWorkorder.color2.label.trim().toLowerCase()
      ).slice(0, 8)
    : [];

  // Refs for dropdown components
  const bikesRef = useRef();
  const ebikeRef = useRef();
  const descriptionRef = useRef();
  const color1Ref = useRef();
  const color2Ref = useRef();
  const waitTimesRef = useRef();
  const statusRef = useRef();
  const partSourcesRef = useRef();
  const partOrderedInputRef = useRef();

  const isDonePaid = resolveStatus(zOpenWorkorder?.status, zSettings?.statuses)?.label?.toLowerCase() === "done & paid";

  const selectedPrinterID = localStorageWrapper.getItem("selectedPrinterID");
  const selectedPrinter = selectedPrinterID && zSettings?.printers?.[selectedPrinterID];
  const isPrinterOffline = !!(selectedPrinter && selectedPrinter.active !== true);
  const printerOfflineLabel = selectedPrinter?.name ? `Printer "${selectedPrinter.name}" is offline` : "Selected printer is offline";


  // Stable reference so ScreenModal doesn't remount the modal content on parent re-renders
  const CustomerInfoComponent = useCallback(() => (
    <Suspense fallback={null}>
      <CustomerInfoScreenModalComponent
        customerID={zOpenWorkorder?.customerID}
        button1Text={"New Workorder"}
        button2Text={"Close"}
        handleButton1Press={(customerInfoFromModal) =>
          handleCustomerNewWorkorderPress(
            customerInfoFromModal || useCurrentCustomerStore.getState().customer
          )
        }
        handleButton2Press={() => _setShowCustomerInfoScreen(false)}
      />
    </Suspense>
  ), [zOpenWorkorder?.customerID]);

  ///////////////////////////////////////////////////////////////////////////////
  ///////////////////////////////////////////////////////////////////////////////

  function setBikeColor(incomingColorVal, fieldName) {
    if (isDonePaid) return;
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

    useOpenWorkordersStore.getState().setField(fieldName, newColorObj, zOpenWorkorder.id);
  }

  function handleStartStandaloneSalePress() {
    useLoginStore.getState().requireLogin(async () => {
      useCurrentCustomerStore.getState().setCustomer(null, false);
      useOpenWorkordersStore.getState().setWorkorderPreviewID(null);
      await startNewWorkorder();
      useTabNamesStore.getState().setItems({
        infoTabName: TAB_NAMES.infoTab.checkout,
        itemsTabName: TAB_NAMES.itemsTab.workorderItems,
        optionsTabName: TAB_NAMES.optionsTab.inventory,
      });
    });
  }

  function handleNewWorkorderPress() {
    // If viewing a locked (completed) workorder, remove it from the local store
    const store = useOpenWorkordersStore.getState();
    const lockedID = store.lockedWorkorderID;
    if (lockedID) {
      store.setLockedWorkorderID(null);
      store.removeWorkorder(lockedID, false);
    }
    store.setOpenWorkorderID(null);
    useTabNamesStore.getState().setItems({
      infoTabName: TAB_NAMES.infoTab.customer,
      itemsTabName: TAB_NAMES.itemsTab.empty,
      optionsTabName: TAB_NAMES.optionsTab.workorders,
    });
    useCurrentCustomerStore.getState().setCustomer(null);
  }

  function handleCustomerNewWorkorderPress(customer) {
    useLoginStore.getState().requireLogin(async () => {
      await startNewWorkorder(customer);
      useTabNamesStore.getState().setItems({
        infoTabName: TAB_NAMES.infoTab.workorder,
        itemsTabName: TAB_NAMES.itemsTab.workorderItems,
        optionsTabName: TAB_NAMES.optionsTab.inventory,
      });
      _setShowCustomerInfoScreen(false);
    });
  }

  function handleWorkorderPrintPress(e) {
    let px = e?.nativeEvent?.pageX || e?.pageX;
    let py = e?.nativeEvent?.pageY || e?.pageY;
    if (px && py) _setPrinterAlert({ x: px, y: py });
  // log("WORKORDER OBJ:", JSON.stringify(zOpenWorkorder, null, 2));
    const _settings = useSettingsStore.getState().getSettings();
    const _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings: _settings };
    let toPrint = printBuilder.workorder(
      zOpenWorkorder,
      zCustomer,
      _settings?.salesTaxPercent,
      _ctx
    );
    dbSavePrintObj(toPrint, localStorageWrapper.getItem("selectedPrinterID") || "");
  }

  function handleIntakePrintPress(e) {
    let px = e?.nativeEvent?.pageX || e?.pageX;
    let py = e?.nativeEvent?.pageY || e?.pageY;
    if (px && py) _setPrinterAlert({ x: px, y: py });
    const settings = useSettingsStore.getState().getSettings();
    const _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings };
    let toPrint = printBuilder.intake(
      zOpenWorkorder,
      zCustomer,
      settings?.salesTaxPercent,
      _ctx
    );
    dbSavePrintObj(toPrint, localStorageWrapper.getItem("selectedPrinterID") || "");
  }

  function handleIntakeSendElectronic() {
    const settings = useSettingsStore.getState().getSettings();

    const smsTemplate = findTemplateByType(settings?.smsTemplates || settings?.textTemplates, "intakeReceipt");
    const emailTemplate = findTemplateByType(settings?.emailTemplates, "intakeReceipt");

    const shouldSMS = zCustomer.customerCell;
    const shouldEmail = zCustomer.email;

    const smsContent = smsTemplate?.content || smsTemplate?.message || smsTemplate?.text || "";
    const emailContent = emailTemplate?.message || emailTemplate?.content || emailTemplate?.body || "";
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

    const canSMS = shouldSMS && smsContent.trim();
    const canEmail = shouldEmail && emailContent.trim();
    if (!canSMS && !canEmail) return;
    sendIntakeReceipt(settings, zCustomer, zOpenWorkorder, canSMS ? smsTemplate : null, canEmail ? emailTemplate : null);
  }

  function sendIntakeReceipt(settings, customer, workorder, smsTemplate, emailTemplate) {
    let results = [];
    if (smsTemplate && customer.customerCell) results.push("SMS sending to " + customer.customerCell);
    if (emailTemplate && customer.email) results.push("Email sending to " + customer.email);

    useAlertScreenStore.getState().setValues({
      title: "Sending",
      message: results.join("\n"),
      canExitOnOuterClick: true,
    });
    setTimeout(() => useAlertScreenStore.getState().setShowAlert(false), 1300);

    const { tenantID, storeID } = useSettingsStore.getState().getSettings();
    const _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings };
    const receiptData = printBuilder.intake(workorder, customer, settings?.salesTaxPercent, _ctx);
    const storagePath = build_db_path.cloudStorage.intakeReceiptPDF(workorder.id, tenantID, storeID);

    dbSendReceipt({
      receiptType: "intake",
      receiptData,
      storagePath,
      sendSMS: !!(smsTemplate && customer.customerCell),
      sendEmail: !!(emailTemplate && customer.email),
      customerEmail: customer.email || "",
      customerCell: customer.customerCell || "",
      customerID: workorder?.customerID || "",
      templateVars: {
        firstName: capitalizeFirstLetterOfString((customer?.first || "Customer").trim()),
        storeName: settings?.storeInfo?.displayName || "our store",
        brand: workorder?.brand || "",
        description: workorder?.description || "",
      },
      smsMessageID: crypto.randomUUID(),
      updateWorkorderField: { workorderID: workorder.id, field: "intakeReceiptURL" },
    }).then((result) => {
      if (result?.data?.receiptURL) {
        useOpenWorkordersStore.getState().setField("intakeReceiptURL", result.data.receiptURL, workorder.id);
      }
    }).catch((e) => {
      log("sendIntakeReceipt error:", e?.message || String(e));
    });
  }

  return (
    <div
      className={styles.container}
      style={{
        backgroundColor: C.backgroundWhite,
        backgroundImage:
          zIsPreview || zIsLocked
            ? `repeating-linear-gradient(135deg, ${lightenRGBByPercent(C.lightred, 92)}, ${lightenRGBByPercent(C.lightred, 92)} 10px, transparent 10px, transparent 20px)`
            : undefined,
      }}
    >
      <div className={styles.topSection}>
        <div
          className={styles.customerCard}
          style={{
            backgroundColor: C.buttonLightGreen,
            borderColor: C.buttonLightGreenOutline,
          }}
        >
          {/* Deposits / Credits on file */}
          {(() => {
            let activeDeps = zCustomerDeposits.filter((d) => d.amountCents > 0);
            let activeCreds = zCustomerCredits.filter((d) => d.amountCents > 0);
            let totalDeposit = activeDeps.reduce((s, d) => s + d.amountCents, 0);
            let totalCredit = activeCreds.reduce((s, d) => s + d.amountCents, 0);
            if (totalDeposit === 0 && totalCredit === 0) return null;
            return (
              <div className={styles.depositRow}>
                {totalDeposit > 0 ? (
                  <div className={styles.depositGroup}>
                    <div className={styles.depositChip} style={{ backgroundColor: lightenRGBByPercent(C.green, 70) }}>
                      <span className={styles.depositChipText} style={{ color: C.green }}>{activeDeps.length > 1 ? "Deposits" : "Deposit"}</span>
                    </div>
                    <span className={styles.depositAmount} style={{ color: C.green }}>{formatCurrencyDisp(totalDeposit, true)}</span>
                  </div>
                ) : <div />}
                {totalCredit > 0 ? (
                  <div className={styles.depositGroup}>
                    <div className={styles.depositChip} style={{ backgroundColor: lightenRGBByPercent(C.blue, 70) }}>
                      <span className={styles.depositChipText} style={{ color: C.blue }}>{activeCreds.length > 1 ? "Credits" : "Credit"}</span>
                    </div>
                    <span className={styles.depositAmount} style={{ color: C.blue }}>{formatCurrencyDisp(totalCredit, true)}</span>
                  </div>
                ) : <div />}
              </div>
            );
          })()}
          <Tooltip text="View/edit customer" position="top">
            <ScreenModal
              modalVisible={sShowCustomerInfoScreen}
              showOuterModal={true}
              buttonLabel={
                capitalizeFirstLetterOfString(zCustomer?.first || zOpenWorkorder?.customerFirst) + " " + capitalizeFirstLetterOfString(zCustomer?.last || zOpenWorkorder?.customerLast)
              }
              buttonIcon={ICONS.ridingBike}
              buttonIconStyle={{ width: 35, height: 35 }}
              buttonStyle={{
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 2,
                borderRadius: 5,
                paddingHorizontal: 20,
                backgroundColor: "transparent",
              }}
              handleButtonPress={() => _setShowCustomerInfoScreen(true)}
              buttonTextStyle={{
                fontSize: 20,
                color: Colors.lightText,
              }}
              Component={CustomerInfoComponent}
            />
          </Tooltip>
          {!!zCustomerLanguage && zCustomerLanguage !== CUSTOMER_LANGUAGES.english && (
            <span className={styles.langText} style={{ color: C.textMuted }}>
              {zCustomerLanguage}
            </span>
          )}
          <div
            className={styles.contactRow}
            style={{ borderColor: C.buttonLightGreenOutline }}
          >
            {(zCustomer?.customerCell?.length > 0 || zOpenWorkorder?.customerCell?.length > 0) && (
              <div className={styles.contactItem}>
                <Image_
                  icon={ICONS.cellPhone}
                  size={20}
                  style={{ marginRight: 5 }}
                />
                <span className={styles.contactText} style={{ color: C.text }}>
                  {formatPhoneWithParens(zCustomer?.customerCell || zOpenWorkorder?.customerCell)}
                </span>
              </div>
            )}
            {zCustomer?.customerLandline?.length > 0 && (
              <div className={styles.contactItem}>
                <Image_
                  icon={ICONS.home}
                  size={18}
                  style={{ marginRight: 7 }}
                />
                <span className={styles.contactText} style={{ color: C.text }}>
                  {formatPhoneWithParens(zCustomer.customerLandline)}
                </span>
              </div>
            )}
            {zCustomer?.contactRestriction === CONTACT_RESTRICTIONS.call && (
              <span className={styles.restrictionText} style={{ color: C.text }}>CALL ONLY</span>
            )}
            {zCustomer?.contactRestriction === CONTACT_RESTRICTIONS.email && (
              <span className={styles.restrictionText} style={{ color: C.text }}>EMAIL ONLY</span>
            )}
          </div>
        </div>

        {/* {(!zWorkordersLoaded || !zCustomerRefreshed) && zOpenWorkorder && (
          <StaleBanner
            text="Waiting on customer refresh...."
            style={{ marginTop: 8, width: "100%" }}
          />
        )} */}

        <div style={{ width: "100%", pointerEvents: isDonePaid ? "none" : "auto" }}>
          <div
            style={{
              marginTop: 10,
              padding: "8px 8px",
              backgroundColor: C.surfaceAlt,
              borderRadius: 5,
              zIndex: 10,
              overflow: "visible",
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                justifyContent: "flex-start",
                alignItems: "center",
                width: "100%",
                zIndex: 10,
                overflow: "visible",
              }}
            >
              <div ref={brandWrapperRef} style={{ width: "45%", zIndex: 10, flexShrink: 0 }}>
                <TextInput_
                  placeholder={"Brand"}
                  editable={!isDonePaid}
                  capitalize={true}
                  style={{
                    width: "100%",
                    borderWidth: 1,
                    borderColor: zOpenWorkorder?.brand ? FILLED_BORDER_COLOR : C.buttonLightGreenOutline,
                    color: C.text,
                    paddingVertical: 2,
                    paddingHorizontal: 4,
                    fontSize: 15,
                    outlineStyle: "none",
                    borderRadius: 5,
                    fontWeight: zOpenWorkorder?.brand ? "500" : null,
                  }}
                  value={capitalizeFirstLetterOfString(zOpenWorkorder?.brand)}
                  onKeyPress={(e) => { if (e.nativeEvent.key === "Backspace") brandBackspaced.current = true; }}
                  onChangeText={(val) => {
                    useOpenWorkordersStore.getState().setField("brand", val, zOpenWorkorder.id);
                    if (!brandBackspaced.current && val.trim().length >= 2) {
                      const q = val.trim().toLowerCase();
                      const matches = (useSettingsStore.getState().settings.allBrands || []).filter(
                        (b) => b.toLowerCase().startsWith(q) && b.toLowerCase() !== q
                      );
                      if (matches.length === 1) {
                        useOpenWorkordersStore.getState().setField("brand", matches[0], zOpenWorkorder.id);
                        _setBrandFocused(false);
                        setTimeout(() => { const el = descInputRef.current?.querySelector?.("input"); if (el) el.focus(); }, 50);
                      }
                    }
                  }}
                  onFocus={() => { useLoginStore.getState().requireLogin(() => {}); _setBrandFocused(true); brandBackspaced.current = false; }}
                  onBlur={() => {
                    setTimeout(() => {
                      _setBrandFocused(false);
                      brandBackspaced.current = false;
                      saveBrandToAllBrands(zOpenWorkorder?.brand);
                    }, 150);
                  }}
                />
                {brandSuggestions.length > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      backgroundColor: C.listItemWhite,
                      borderWidth: 1,
                      borderStyle: "solid",
                      borderColor: C.buttonLightGreenOutline,
                      borderRadius: 5,
                      maxHeight: 200,
                      overflow: "auto",
                      zIndex: 999,
                      boxSizing: "border-box",
                    }}
                  >
                    {brandSuggestions.map((item) => (
                      <div
                        key={item}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = C.surfaceAlt; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                        style={{ display: "flex", flexDirection: "row", alignItems: "center", padding: "6px 8px" }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            useOpenWorkordersStore.getState().setField("brand", item, zOpenWorkorder.id);
                            _setBrandFocused(false);
                          }}
                          style={{ flex: 1, cursor: "pointer", background: "none", border: "none", padding: 0, textAlign: "left", font: "inherit" }}
                        >
                          <span style={{ fontSize: 14, color: C.text }}>{item}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = (zSettings.allBrands || []).filter((b) => b !== item);
                            useSettingsStore.getState().setField("allBrands", updated);
                          }}
                          style={{ paddingLeft: 8, cursor: "pointer", background: "none", border: "none", font: "inherit" }}
                        >
                          <span style={{ fontSize: 12, color: C.textMuted }}>✕</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div
                style={{
                  width: "55%",
                  display: "flex",
                  flexDirection: "row",
                  paddingLeft: 5,
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexShrink: 0,
                  boxSizing: "border-box",
                }}
              >
                <div
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = zOpenWorkorder?.brand ? String(FILLED_DROPDOWN_OPACITY) : "1"; }}
                  style={{
                    display: "flex",
                    width: "48%",
                    height: "100%",
                    opacity: zOpenWorkorder?.brand ? FILLED_DROPDOWN_OPACITY : 1,
                  }}
                >
                  <DropdownMenu
                    dataArr={zSettings.bikeBrands}
                    enabled={!isDonePaid}
                    onSelect={(item, idx) => {
                      useOpenWorkordersStore.getState().setField("brand", item, zOpenWorkorder.id);
                      saveBrandToAllBrands(item);
                    }}
                    modalCoordX={-6}
                    ref={bikesRef}
                    buttonText={zSettings.bikeBrandsName}
                    matchValue={zOpenWorkorder?.brand}
                  />
                </div>
                <div style={{ width: 5, flexShrink: 0 }} />
                <div
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = zOpenWorkorder?.brand ? String(FILLED_DROPDOWN_OPACITY) : "1"; }}
                  style={{
                    display: "flex",
                    width: "48%",
                    justifyContent: "center",
                    opacity: zOpenWorkorder?.brand ? FILLED_DROPDOWN_OPACITY : 1,
                  }}
                >
                  <DropdownMenu
                    dataArr={zSettings.bikeOptionalBrands}
                    enabled={!isDonePaid}
                    onSelect={(item, idx) => {
                      useOpenWorkordersStore.getState().setField("brand", item, zOpenWorkorder.id);
                      saveBrandToAllBrands(item);
                    }}
                    modalCoordX={0}
                    ref={ebikeRef}
                    buttonText={zSettings.bikeOptionalBrandsName}
                    matchValue={zOpenWorkorder?.brand}
                  />
                </div>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                justifyContent: "flex-start",
                width: "100%",
                alignItems: "center",
                zIndex: 9,
                overflow: "visible",
                marginTop: 11,
                // backgroundColor: "blue",
              }}
            >
              <div ref={descInputRef} style={{ width: "45%", zIndex: 10, flexShrink: 0 }}>
                <TextInput_
                  placeholder={"Model / description"}
                  editable={!isDonePaid}
                  capitalize={true}
                  style={{
                    width: "100%",
                    borderWidth: 1,
                    borderColor: zOpenWorkorder?.description ? FILLED_BORDER_COLOR : C.buttonLightGreenOutline,
                    color: C.text,
                    paddingVertical: 2,
                    paddingHorizontal: 4,
                    fontSize: 15,
                    outlineStyle: "none",
                    borderRadius: 5,
                    fontWeight: zOpenWorkorder?.description ? "500" : null,
                  }}
                  value={capitalizeFirstLetterOfString(zOpenWorkorder?.description)}
                  onKeyPress={(e) => { if (e.nativeEvent.key === "Backspace") descBackspaced.current = true; }}
                  onChangeText={(val) => {
                    useOpenWorkordersStore.getState().setField("description", val, zOpenWorkorder.id);
                    if (!descBackspaced.current && val.trim().length >= 2) {
                      const q = val.trim().toLowerCase();
                      const matches = (useSettingsStore.getState().settings.allDescriptions || []).filter(
                        (d) => d.toLowerCase().startsWith(q) && d.toLowerCase() !== q
                      );
                      if (matches.length === 1) {
                        useOpenWorkordersStore.getState().setField("description", matches[0], zOpenWorkorder.id);
                        _setDescFocused(false);
                        setTimeout(() => { const el = color1InputRef.current?.querySelector?.("input"); if (el) el.focus(); }, 50);
                      }
                    }
                  }}
                  onFocus={() => { useLoginStore.getState().requireLogin(() => {}); _setDescFocused(true); descBackspaced.current = false; }}
                  onBlur={() => {
                    setTimeout(() => {
                      _setDescFocused(false);
                      descBackspaced.current = false;
                      saveDescToAllDescriptions(zOpenWorkorder?.description);
                    }, 150);
                  }}
                />
                {descSuggestions.length > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      backgroundColor: C.listItemWhite,
                      borderWidth: 1,
                      borderStyle: "solid",
                      borderColor: C.buttonLightGreenOutline,
                      borderRadius: 5,
                      maxHeight: 200,
                      overflow: "auto",
                      zIndex: 999,
                      boxSizing: "border-box",
                    }}
                  >
                    {descSuggestions.map((item) => (
                      <div
                        key={item}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = C.surfaceAlt; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                        style={{ display: "flex", flexDirection: "row", alignItems: "center", padding: "6px 8px" }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            useOpenWorkordersStore.getState().setField("description", item, zOpenWorkorder.id);
                            _setDescFocused(false);
                          }}
                          style={{ flex: 1, cursor: "pointer", background: "none", border: "none", padding: 0, textAlign: "left", font: "inherit" }}
                        >
                          <span style={{ fontSize: 14, color: C.text }}>{item}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = (zSettings.allDescriptions || []).filter((d) => d !== item);
                            useSettingsStore.getState().setField("allDescriptions", updated);
                          }}
                          style={{ paddingLeft: 8, cursor: "pointer", background: "none", border: "none", font: "inherit" }}
                        >
                          <span style={{ fontSize: 12, color: C.textMuted }}>✕</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div
                style={{
                  width: "55%",
                  display: "flex",
                  flexDirection: "row",
                  paddingLeft: 5,
                  justifyContent: "center",
                  alignItems: "center",
                  flexShrink: 0,
                  boxSizing: "border-box",
                }}
              >
                <div
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = zOpenWorkorder?.description ? String(FILLED_DROPDOWN_OPACITY) : "1"; }}
                  style={{ display: "flex", width: "100%", opacity: zOpenWorkorder?.description ? FILLED_DROPDOWN_OPACITY : 1 }}
                >
                  <DropdownMenu
                    modalCoordX={55}
                    dataArr={zSettings.bikeDescriptions}
                    enabled={!isDonePaid}
                    onSelect={(item, idx) => {
                      useOpenWorkordersStore.getState().setField(
                        "description",
                        item,
                        zOpenWorkorder.id
                      );
                      saveDescToAllDescriptions(item);
                    }}
                    ref={descriptionRef}
                    buttonText={"Descriptions"}
                    matchValue={zOpenWorkorder?.description}
                  />
                </div>
              </div>
            </div>

            <div
              ref={color1InputRef}
              style={{
                display: "flex",
                flexDirection: "row",
                justifyContent: "space-between",
                width: "100%",
                alignItems: "center",
                zIndex: 8,
                overflow: "visible",
                marginTop: 11,
                boxSizing: "border-box",
              }}
            >
              <div style={{ width: "45%", display: "flex", flexDirection: "row", zIndex: 10, flexShrink: 0 }}>
                <div ref={color1WrapperRef} style={{ width: "48%", zIndex: 10, flexShrink: 0 }}>
                  <TextInput_
                    placeholder={"Color 1"}
                    editable={!isDonePaid}
                    capitalize={true}
                    value={capitalizeFirstLetterOfString(zOpenWorkorder?.color1.label)}
                    style={{
                      width: "100%",
                      borderWidth: 1,
                      borderColor: zOpenWorkorder?.color1?.label ? FILLED_BORDER_COLOR : C.buttonLightGreenOutline,
                      paddingVertical: 2,
                      paddingHorizontal: 4,
                      fontSize: 15,
                      outlineStyle: "none",
                      borderRadius: 5,
                      fontWeight: zOpenWorkorder?.color1.label ? "500" : null,
                      backgroundColor: zOpenWorkorder?.color1.backgroundColor,
                      color: zOpenWorkorder?.color1.textColor,
                    }}
                    onKeyPress={(e) => { if (e.nativeEvent.key === "Backspace") color1Backspaced.current = true; }}
                    onChangeText={(val) => {
                      setBikeColor(val, "color1");
                      if (!color1Backspaced.current && val.trim().length >= 2) {
                        const q = val.trim().toLowerCase();
                        const matches = allColorLabels.filter(
                          (c) => c.toLowerCase().startsWith(q) && c.toLowerCase() !== q
                        );
                        if (matches.length === 1) {
                          setBikeColor(matches[0], "color1");
                          _setColor1Focused(false);
                          setTimeout(() => { const el = color2InputRef.current?.querySelector?.("input"); if (el) el.focus(); }, 50);
                        }
                      }
                    }}
                    onFocus={() => { useLoginStore.getState().requireLogin(() => {}); _setColor1Focused(true); color1Backspaced.current = false; }}
                    onBlur={() => {
                      setTimeout(() => {
                        _setColor1Focused(false);
                        color1Backspaced.current = false;
                      }, 150);
                    }}
                  />
                  {color1Suggestions.length > 0 && (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        right: 0,
                        backgroundColor: C.listItemWhite,
                        borderWidth: 1,
                        borderStyle: "solid",
                        borderColor: C.buttonLightGreenOutline,
                        borderRadius: 5,
                        maxHeight: 200,
                        overflow: "auto",
                        zIndex: 999,
                        boxSizing: "border-box",
                      }}
                    >
                      {color1Suggestions.map((item) => (
                        <div
                          key={item}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = C.surfaceAlt; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                          style={{ display: "flex", flexDirection: "row", alignItems: "center", padding: "6px 8px" }}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setBikeColor(item, "color1");
                              _setColor1Focused(false);
                            }}
                            style={{ flex: 1, cursor: "pointer", background: "none", border: "none", padding: 0, textAlign: "left", font: "inherit" }}
                          >
                            <span style={{ fontSize: 14, color: C.text }}>{item}</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ width: 5, flexShrink: 0 }} />
                <div ref={color2InputRef} style={{ width: "48%", zIndex: 10, flexShrink: 0 }}>
                  <TextInput_
                    placeholder={"Color 2"}
                    editable={!isDonePaid}
                    capitalize={true}
                    value={capitalizeFirstLetterOfString(zOpenWorkorder?.color2.label)}
                    style={{
                      width: "100%",
                      borderWidth: 1,
                      borderColor: zOpenWorkorder?.color2?.label ? FILLED_BORDER_COLOR : C.buttonLightGreenOutline,
                      paddingVertical: 2,
                      paddingHorizontal: 4,
                      fontSize: 15,
                      outlineStyle: "none",
                      borderRadius: 5,
                      fontWeight: zOpenWorkorder?.color2.label ? "500" : null,
                      backgroundColor: zOpenWorkorder?.color2.backgroundColor,
                      color: zOpenWorkorder?.color2.textColor,
                    }}
                    onKeyPress={(e) => { if (e.nativeEvent.key === "Backspace") color2Backspaced.current = true; }}
                    onChangeText={(val) => {
                      setBikeColor(val, "color2");
                      if (!color2Backspaced.current && val.trim().length >= 2) {
                        const q = val.trim().toLowerCase();
                        const matches = allColorLabels.filter(
                          (c) => c.toLowerCase().startsWith(q) && c.toLowerCase() !== q
                        );
                        if (matches.length === 1) {
                          setBikeColor(matches[0], "color2");
                          _setColor2Focused(false);
                        }
                      }
                    }}
                    onFocus={() => { useLoginStore.getState().requireLogin(() => {}); _setColor2Focused(true); color2Backspaced.current = false; }}
                    onBlur={() => {
                      setTimeout(() => {
                        _setColor2Focused(false);
                        color2Backspaced.current = false;
                      }, 150);
                    }}
                  />
                  {color2Suggestions.length > 0 && (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        right: 0,
                        backgroundColor: C.listItemWhite,
                        borderWidth: 1,
                        borderStyle: "solid",
                        borderColor: C.buttonLightGreenOutline,
                        borderRadius: 5,
                        maxHeight: 200,
                        overflow: "auto",
                        zIndex: 999,
                        boxSizing: "border-box",
                      }}
                    >
                      {color2Suggestions.map((item) => (
                        <div
                          key={item}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = C.surfaceAlt; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                          style={{ display: "flex", flexDirection: "row", alignItems: "center", padding: "6px 8px" }}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setBikeColor(item, "color2");
                              _setColor2Focused(false);
                            }}
                            style={{ flex: 1, cursor: "pointer", background: "none", border: "none", padding: 0, textAlign: "left", font: "inherit" }}
                          >
                            <span style={{ fontSize: 14, color: C.text }}>{item}</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div
                style={{
                  width: "55%",
                  display: "flex",
                  flexDirection: "row",
                  paddingLeft: 5,
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexShrink: 0,
                  boxSizing: "border-box",
                }}
              >
                <div
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = zOpenWorkorder?.color1?.label ? String(FILLED_DROPDOWN_OPACITY) : "1"; }}
                  style={{
                    display: "flex",
                    width: "48%",
                    height: "100%",
                    justifyContent: "center",
                    opacity: zOpenWorkorder?.color1?.label ? FILLED_DROPDOWN_OPACITY : 1,
                  }}
                >
                  <DropdownMenu
                    itemSeparatorStyle={{ height: 0 }}
                    dataArr={COLORS}
                    menuBorderColor={"transparent"}
                    enabled={!isDonePaid}
                    onSelect={(item, idx) => {
                      useOpenWorkordersStore.getState().setField("color1", item, zOpenWorkorder.id);
                    }}
                    ref={color1Ref}
                    buttonText={"Color 1"}
                    modalCoordX={0}
                    itemStyle={{ paddingLeft: 35, paddingRight: 35, paddingTop: 15, paddingBottom: 15 }}
                    matchValue={zOpenWorkorder?.color1?.label}
                    preserveItemBackground={true}
                  />
                </div>
                <div style={{ width: 5, flexShrink: 0 }} />

                <div
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = (zOpenWorkorder?.color2?.label || zOpenWorkorder?.color1?.label) ? String(FILLED_DROPDOWN_OPACITY) : "1"; }}
                  style={{
                    display: "flex",
                    width: "48%",
                    height: "100%",
                    justifyContent: "center",
                    opacity: (zOpenWorkorder?.color2?.label || zOpenWorkorder?.color1?.label) ? FILLED_DROPDOWN_OPACITY : 1,
                  }}
                >
                  <DropdownMenu
                    itemSeparatorStyle={{ height: 0 }}
                    dataArr={COLORS}
                    enabled={!isDonePaid}
                    onSelect={(item, idx) => {
                      useOpenWorkordersStore.getState().setField("color2", item, zOpenWorkorder.id);
                    }}
                    modalCoordX={0}
                    ref={color2Ref}
                    buttonText={"Color 2"}
                    itemStyle={{ paddingLeft: 35, paddingRight: 35, paddingTop: 15, paddingBottom: 15 }}
                    matchValue={zOpenWorkorder?.color2?.label}
                    preserveItemBackground={true}
                  />
                </div>
              </div>
            </div>
            {(() => {
              const rs = resolveStatus(zOpenWorkorder?.status, zSettings?.statuses);
              const isPickupDelivery = zOpenWorkorder?.status === "pickup" || zOpenWorkorder?.status === "delivery";
              const pd = zOpenWorkorder?.pickupDelivery || {};

              const handleStatusSelect = (val) => {
                useLoginStore.getState().requireLogin(() => {
                  const store = useOpenWorkordersStore.getState();
                  store.setField("status", val.id, zOpenWorkorder.id);
                  // Auto-populate pickup/delivery defaults when first selected
                  if (val.id === "pickup" || val.id === "delivery") {
                    const existing = zOpenWorkorder?.pickupDelivery;
                    if (!existing?.month && !existing?.day) {
                      const now = new Date();
                      const tomorrow = new Date(now);
                      tomorrow.setDate(tomorrow.getDate() + 1);
                      store.setField("pickupDelivery", {
                        month: String(tomorrow.getMonth() + 1),
                        day: String(tomorrow.getDate()),
                        startTime: "11:00",
                        endTime: "15:00",
                      }, zOpenWorkorder.id);
                    }
                  }
                  // Stamp finishedOnMillis when status is set to "Finished"
                  if (val.id === "finished") {
                    store.setField("finishedOnMillis", Date.now(), zOpenWorkorder.id);
                  }
                  // Finished SMS confirmation modal
                  if (val.id === "finished" && zOpenWorkorder.customerID) {
                    const allWOs = store.getWorkorders();
                    const otherWOs = allWOs.filter(
                      (w) => w.customerID === zOpenWorkorder.customerID && w.id !== zOpenWorkorder.id
                    );
                    const hasOthers = otherWOs.length > 0;
                    const allOthersFinished = hasOthers && otherWOs.every((w) => w.status === "finished");
                    let modalMessage = "Would you like to send a notification to let the customer know their bike is ready for pickup?";
                    if (hasOthers && !allOthersFinished) {
                      modalMessage = "This customer has other bikes that are still being worked on. Would you like to send a notification to let them know this bike is ready?";
                    } else if (allOthersFinished) {
                      modalMessage = "All of this customer's bikes are now complete! Would you like to send a notification to let them know everything is ready for pickup?";
                    }
                    let smsID = "finished_sms";
                    let emailID = "finished_email";
                    if (allOthersFinished) {
                      smsID = "finished_multiple_items_sms";
                      emailID = "finished_multiple_items_email";
                    }
                    useAlertScreenStore.getState().setValues({
                      title: "Send Finished Notification?",
                      message: modalMessage,
                      btn1Text: "Send",
                      handleBtn1Press: () => {
                        const finishedRule = { smsTemplateID: smsID, emailTemplateID: emailID, delayMinutes: 0, delaySeconds: 0 };
                        const wo = store.getWorkorders().find((w) => w.id === zOpenWorkorder.id) || zOpenWorkorder;
                        scheduleAutoText(finishedRule, wo, zSettings);
                        store.setField("contacted", true, zOpenWorkorder.id);
                        useAlertScreenStore.getState().setShowAlert(false);
                      },
                      btn2Text: "Don't Send",
                      handleBtn2Press: () => useAlertScreenStore.getState().setShowAlert(false),
                      canExitOnOuterClick: true,
                    });
                  }
                  // When "Part Ordered" status is selected, clear the "to be ordered" checkbox
                  if (val.id === "part_ordered") {
                    store.setField("partToBeOrdered", false, zOpenWorkorder.id);
                  }
                  // Auto-populate linked wait time if one is configured for this status
                  const linked = zSettings?.waitTimeLinkedStatus?.[val.id];
                  if (linked) {
                    store.setField("waitTime", linked, zOpenWorkorder.id);
                  }
                  // Auto-text: check if this status has an auto-text rule
                  const autoTextRules = zSettings?.statusAutoText || [];
                  const rule = autoTextRules.find((r) => r.statusID === val.id);
                  if (rule) {
                    const wo = store.getWorkorders().find((w) => w.id === zOpenWorkorder.id) || zOpenWorkorder;
                    scheduleAutoText(rule, wo, zSettings);
                  }
                  // Notify linked users: add this workorder to their pendingWorkorderIDs
                  const woID = zOpenWorkorder.id;
                  const users = zSettings?.users || [];
                  const currentUserID = useLoginStore.getState().getCurrentUser()?.id;
                  let usersChanged = false;
                  const updatedUsers = users.map((u) => {
                    if (!(u.statuses || []).includes(val.id)) return u;
                    if ((u.pendingWorkorderIDs || []).includes(woID)) return u;
                    if (u.id === currentUserID) return u;
                    usersChanged = true;
                    return { ...u, pendingWorkorderIDs: [...(u.pendingWorkorderIDs || []), woID] };
                  });
                  if (usersChanged) {
                    useSettingsStore.getState().setField("users", updatedUsers);
                  }
                });
              };

              const updatePickupFields = (fields) => {
                const store = useOpenWorkordersStore.getState();
                const current = zOpenWorkorder?.pickupDelivery || {};
                store.setField("pickupDelivery", { ...current, ...fields }, zOpenWorkorder.id);
              };

              const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
              const dateLabel = pd.month && pd.day
                ? (MONTH_LABELS[Number(pd.month) - 1] || pd.month) + " " + pd.day
                : "Date";
              const formatTime12 = (t24) => {
                if (!t24) return "--:--";
                const [hStr, mStr] = t24.split(":");
                let h = Number(hStr);
                const period = h >= 12 ? "PM" : "AM";
                if (h === 0) h = 12;
                else if (h > 12) h -= 12;
                return h + ":" + mStr + " " + period;
              };
              const parse12To24Parts = (t24) => {
                if (!t24) return { hour: 11, minute: 0, period: "AM" };
                const [hStr, mStr] = t24.split(":");
                let h = Number(hStr);
                const period = h >= 12 ? "PM" : "AM";
                if (h === 0) h = 12;
                else if (h > 12) h -= 12;
                return { hour: h, minute: Number(mStr), period };
              };
              const to24 = (hour, minute, period) => {
                let h24 = period === "PM" ? (hour === 12 ? 12 : hour + 12) : (hour === 12 ? 0 : hour);
                return String(h24).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
              };

              return (
                <div style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: isPickupDelivery ? "space-between" : undefined, marginTop: 11, width: "100%", boxSizing: "border-box" }}>
                  <div style={{ display: "flex", width: isPickupDelivery ? "33%" : "100%", flexShrink: 0 }}>
                    <DropdownMenu
                      dataArr={(zSettings.statuses || []).filter((s) => !s.systemOwned && !s.hidden)}
                      enabled={!isDonePaid}
                      onSelect={(item) => handleStatusSelect(item)}
                      buttonIcon={null}
                      buttonStyle={{
                        backgroundColor: rs.backgroundColor,
                        borderColor: rs.backgroundColor,
                        paddingLeft: isPickupDelivery ? 12 : 8,
                        paddingRight: isPickupDelivery ? 12 : 8,
                      }}
                      buttonTextStyle={{
                        color: rs.textColor,
                        fontWeight: "normal",
                        fontSize: 14,
                      }}
                      itemStyle={{
                        minHeight: 40,
                        height: 40,
                        paddingTop: 0,
                        paddingBottom: 0,
                      }}
                      itemTextStyle={{
                        fontWeight: "500",
                      }}
                      itemSeparatorStyle={{ height: 0 }}
                      menuBorderColor={"transparent"}
                      modalCoordX={100}
                      menuMaxHeight={"calc(100vh - 20px)"}
                      mouseOverOptions={{ enable: true, opacity: 1 }}
                      ref={statusRef}
                      buttonText={(zOpenWorkorder?.status === "finished" ? (zOpenWorkorder.contacted ? "\u2713 " : "\u2717 ") : "") + rs.label}
                      preserveItemBackground={true}
                      matchValue={rs.label}
                    />
                  </div>
                  {isPickupDelivery && (
                    <PickupDeliveryInputs
                      pd={pd}
                      isDonePaid={isDonePaid}
                      dateLabel={dateLabel}
                      formatTime12={formatTime12}
                      parse12To24Parts={parse12To24Parts}
                      to24={to24}
                      updatePickupFields={updatePickupFields}
                    />
                  )}
                </div>
              );
            })()}
            <div
              style={{
                pointerEvents: (zOpenWorkorder?.status === "pickup" || zOpenWorkorder?.status === "delivery") ? "none" : "auto",
                display: "flex",
                flexDirection: "row",
                justifyContent: "space-between",
                width: "100%",
                alignItems: "center",
                marginTop: 11,
                opacity: (zOpenWorkorder?.status === "pickup" || zOpenWorkorder?.status === "delivery") ? 0.35 : 1,
                boxSizing: "border-box",
              }}
            >
              <span style={{ color: C.textMuted, fontSize: 13, marginRight: 4 }}>
                Max wait days:
              </span>
              <TextInput_
                placeholder={"0"}
                editable={!isDonePaid}
                inputMode="numeric"
                style={{
                  width: 50,
                  borderWidth: 1,
                  borderColor: zOpenWorkorder?.waitTime?.label ? FILLED_BORDER_COLOR : C.buttonLightGreenOutline,
                  color: C.text,
                  paddingVertical: 2,
                  paddingHorizontal: 4,
                  fontSize: 15,
                  outlineStyle: "none",
                  borderRadius: 5,
                  textAlign: "center",
                  fontWeight: (zOpenWorkorder?.waitTime?.maxWaitTimeDays != null && zOpenWorkorder?.waitTime?.maxWaitTimeDays !== "") ? "500" : null,
                  backgroundColor: sWaitTimeBlink ? "rgba(255, 255, 0, 0.35)" : "transparent",
                  transition: "background-color 300ms ease",
                }}
                value={String(zOpenWorkorder?.waitTime?.maxWaitTimeDays ?? "")}
                onChangeText={(val) => {
                  if (val !== "" && !checkInputForNumbersOnly(val)) return;
                  let days = val === "" ? "" : Number(val);
                  let waitObj = {
                    ...CUSTOM_WAIT_TIME,
                    label: val === "" ? "" : val + (days === 1 ? " Day" : " Days"),
                    maxWaitTimeDays: days,
                  };
                  useOpenWorkordersStore.getState().setField("waitTime", waitObj, zOpenWorkorder.id);
                }}
              />
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "row",
                  paddingLeft: 5,
                  justifyContent: "flex-start",
                  alignItems: "center",
                  boxSizing: "border-box",
                }}
              >
                <div
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = zOpenWorkorder?.waitTime?.label ? String(FILLED_DROPDOWN_OPACITY) : "1"; }}
                  style={{ display: "flex", width: "100%", opacity: zOpenWorkorder?.waitTime?.label ? FILLED_DROPDOWN_OPACITY : 1 }}
                >
                  <DropdownMenu
                    modalCoordX={50}
                    dataArr={zSettings.waitTimes}
                    enabled={!isDonePaid}
                    onSelect={(item, idx) => {
                      let isNonRemovable = NONREMOVABLE_WAIT_TIMES.some((nr) => nr.id === item.id);
                      let waitObj = { ...item, removable: !isNonRemovable };
                      useOpenWorkordersStore.getState().setField("waitTime", waitObj, zOpenWorkorder.id);
                    }}
                    ref={waitTimesRef}
                    matchValue={zOpenWorkorder?.waitTime?.label || ""}
                    buttonText={zOpenWorkorder?.waitTime?.label || "Wait Times"}
                  />
                </div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center", width: "100%", marginTop: 4, boxSizing: "border-box" }}>
              {(() => {
                let estimateLabel = calculateWaitEstimateLabel(zOpenWorkorder, useSettingsStore.getState().getSettings());
                let isMissing = estimateLabel === "Missing estimate" || estimateLabel === "No estimate";
                let estimateColor = C.textMuted;
                if (isMissing) estimateColor = C.red;
                else if (/overdue/i.test(estimateLabel) || /today/i.test(estimateLabel)) estimateColor = C.red;
                else if (/tomorrow/i.test(estimateLabel)) estimateColor = C.green;
                else if (estimateLabel) estimateColor = C.blue;
                return estimateLabel ? (
                  <span
                    style={{
                      color: estimateColor,
                      fontSize: 13,
                      fontStyle: "italic",
                      backgroundColor: sWaitTimeBlink && isMissing ? "rgba(255, 255, 0, 0.35)" : "transparent",
                      transition: "background-color 300ms ease",
                      borderRadius: 3,
                      padding: "2px 4px",
                      opacity: (zOpenWorkorder?.status === "pickup" || zOpenWorkorder?.status === "delivery") ? 0.35 : 1,
                    }}
                  >
                    {estimateLabel}
                  </span>
                ) : <div />;
              })()}
              <CheckBox
                isChecked={!!zOpenWorkorder?.itemNotHere}
                text="Customer item not here"
                textStyle={{ fontSize: 13, opacity: zOpenWorkorder?.itemNotHere ? 1 : 0.6, color: zOpenWorkorder?.itemNotHere ? C.red : undefined }}
                buttonStyle={{ backgroundColor: "transparent", opacity: zOpenWorkorder?.itemNotHere ? 1 : 0.6 }}
                onCheck={() => {
                  if (isDonePaid) return;
                  useOpenWorkordersStore.getState().setField("itemNotHere", !zOpenWorkorder?.itemNotHere, zOpenWorkorder.id);
                }}
              />
            </div>
          </div>

          <div
            style={{
              marginTop: 0,
              width: "100%",
              padding: "8px 8px",
              backgroundColor: C.surfaceAlt,
              borderRadius: 5,
              boxSizing: "border-box",
            }}
          >
            <div style={{ width: '100%', display: 'flex', flexDirection: 'row', alignItems: 'center', marginBottom: (sShowItemOrdering || hasItemOrderingData) ? 7 : 0, opacity: .5 }}>
              <div style={{ flex: 1, height: 3, borderRadius: 5, backgroundColor: C.surfaceAlt }} />
              <button
                type="button"
                disabled={hasItemOrderingData}
                onClick={() => {
                  _sSetShowItemOrdering((v) => !v);
                }}
                style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', margin: '0 8px', background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: hasItemOrderingData ? 'default' : 'pointer' }}
              >
                <span style={{ fontSize: 12, fontWeight: '600', fontStyle: 'italic', color: (sShowItemOrdering || hasItemOrderingData) ? C.orange : C.textMuted, marginRight: 5 }}>Ordering Info</span>
                <span style={{ fontSize: 10, color: (sShowItemOrdering || hasItemOrderingData) ? C.orange : C.textMuted, display: 'inline-block', transform: (sShowItemOrdering || hasItemOrderingData) ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
              </button>
              <div style={{ flex: 1, height: 3, borderRadius: 5, backgroundColor: C.surfaceAlt }} />
            </div>
            {(sShowItemOrdering || hasItemOrderingData) && (
              <div style={{ display: "flex", flexDirection: "row", width: "100%", marginTop: 5, boxSizing: "border-box" }}>

                {/* Fields — 87% */}
                <div style={{ width: "87%", flexShrink: 0, paddingRight: 15, opacity: hasActiveItem ? 1 : 0.35, boxSizing: "border-box" }}>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "row",
                      justifyContent: "flex-start",
                      alignItems: "center",
                      width: "100%",
                      boxSizing: "border-box",
                    }}
                  >
                    <TextInput_
                      inputRef={partOrderedInputRef}
                      placeholder={"Item names/descriptions"}
                      placeholderTextColor={C.textDisabled}
                      editable={!isDonePaid && hasActiveItem}
                      capitalize={true}
                      style={{
                        width: "100%",
                        borderWidth: 1,
                        borderColor: C.buttonLightGreenOutline,
                        color: C.text,
                        paddingVertical: 2,
                        paddingHorizontal: 4,
                        fontSize: 15,
                        outlineStyle: "none",
                        borderRadius: 5,
                        fontWeight: sActiveOrderedItem?.partOrdered ? "500" : null,
                        backgroundColor: C.backgroundWhite,
                      }}
                      value={capitalizeFirstLetterOfString(sActiveOrderedItem?.partOrdered || "")}
                      onFocus={() => useLoginStore.getState().requireLogin(() => {})}
                      onChangeText={(val) => {
                        updateActiveItemField("partOrdered", val);
                      }}
                    />
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "row",
                      justifyContent: "flex-start",
                      alignItems: "center",
                      width: "100%",
                      marginTop: 11,
                      boxSizing: "border-box",
                    }}
                  >
                    <TextInput_
                      value={capitalizeFirstLetterOfString(sActiveOrderedItem?.partSource || "")}
                      placeholder={"Item sources"}
                      placeholderTextColor={C.textDisabled}
                      editable={!isDonePaid && hasActiveItem}
                      capitalize={true}
                      style={{
                        width: "50%",
                        borderWidth: 1,
                        borderColor: sActiveOrderedItem?.partSource ? FILLED_BORDER_COLOR : C.buttonLightGreenOutline,
                        color: C.text,
                        paddingVertical: 2,
                        paddingHorizontal: 4,
                        fontSize: 15,
                        outlineStyle: "none",
                        borderRadius: 5,
                        fontWeight: sActiveOrderedItem?.partSource ? "500" : null,
                        backgroundColor: C.backgroundWhite,
                      }}
                      onFocus={() => useLoginStore.getState().requireLogin(() => {})}
                      onChangeText={(val) => {
                        updateActiveItemField("partSource", val);
                      }}
                    />
                    <div
                      style={{
                        width: "50%",
                        display: "flex",
                        flexDirection: "row",
                        paddingLeft: 5,
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        boxSizing: "border-box",
                      }}
                    >
                      <div
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = 1; }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = sActiveOrderedItem?.partSource ? FILLED_DROPDOWN_OPACITY : 1; }}
                        style={{ opacity: sActiveOrderedItem?.partSource ? FILLED_DROPDOWN_OPACITY : 1 }}
                      >
                        <DropdownMenu
                          dataArr={zSettings.partSources}
                          enabled={!isDonePaid && hasActiveItem}
                          onSelect={(item) => {
                            updateActiveItemField("partSource", item);
                          }}
                          modalCoordX={20}
                          buttonStyle={{ paddingHorizontal: 40 }}
                          ref={partSourcesRef}
                          matchValue={sActiveOrderedItem?.partSource || ""}
                          buttonText={sActiveOrderedItem?.partSource || "Sources"}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Estimated wait days picker + To be ordered toggle */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      width: "100%",
                      marginTop: 11,
                      boxSizing: "border-box",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "row", alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: C.textMuted, marginRight: 8, fontStyle: "italic" }}>
                        Est. delivery
                      </span>
                      <button
                        type="button"
                        disabled={isDonePaid || !hasActiveItem}
                        onClick={() => updateWaitDays(Math.max(0, sWaitDays - 1))}
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 4,
                          backgroundColor: (isDonePaid || !hasActiveItem) ? C.surfaceAlt : C.buttonLightGreen,
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          border: "none",
                          padding: 0,
                          cursor: (isDonePaid || !hasActiveItem) ? "default" : "pointer",
                        }}
                      >
                        <span style={{ color: C.textMuted, fontSize: 14, fontWeight: "700", marginTop: -1 }}>−</span>
                      </button>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: "400",
                          color: C.text,
                          minWidth: 50,
                          textAlign: "center",
                        }}
                      >
                        {sWaitDays + " days"}
                      </span>
                      <button
                        type="button"
                        disabled={isDonePaid || !hasActiveItem}
                        onClick={() => updateWaitDays(sWaitDays + 1)}
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 4,
                          backgroundColor: (isDonePaid || !hasActiveItem) ? C.surfaceAlt : C.buttonLightGreen,
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          border: "none",
                          padding: 0,
                          cursor: (isDonePaid || !hasActiveItem) ? "default" : "pointer",
                        }}
                      >
                        <span style={{ color: C.textMuted, fontSize: 14, fontWeight: "700", marginTop: -1 }}>+</span>
                      </button>
                    </div>
                    {!!sActiveOrderedItem?.partOrderEstimateMillis && (
                      <span style={{ fontSize: 12, color: sWaitDays > 0 ? C.textMuted : "transparent" }}>
                        {formatMillisForDisplay(sActiveOrderedItem.partOrderEstimateMillis)}
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={isDonePaid || !hasActiveItem}
                      onClick={() => {
                        const newVal = !sActiveOrderedItem?.partToBeOrdered;
                        updateActiveItemField("partToBeOrdered", newVal);
                        useOpenWorkordersStore.getState().setField("status", newVal ? "is_order_part_for_customer" : "part_ordered", zOpenWorkorder.id);
                      }}
                      style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: (isDonePaid || !hasActiveItem) ? 'default' : 'pointer' }}
                    >
                      <span style={{ display: 'flex', width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderStyle: 'solid', borderColor: sActiveOrderedItem?.partToBeOrdered ? C.red : C.green, justifyContent: 'center', alignItems: 'center', marginRight: 4, boxSizing: 'border-box' }}>
                        <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 3, backgroundColor: sActiveOrderedItem?.partToBeOrdered ? C.red : C.green }} />
                      </span>
                      <span style={{ fontSize: 11, fontWeight: '600', color: sActiveOrderedItem?.partToBeOrdered ? C.red : C.green }}>{sActiveOrderedItem?.partToBeOrdered ? "Not ordered" : "Ordered"}</span>
                    </button>
                  </div>

                  <div style={{ width: '100%', display: 'flex', flexDirection: 'row', alignItems: 'stretch', marginTop: 8, height: 22 }}>
                    <TextInput_
                      placeholder="Tracking num or website here..."
                      placeholderTextColor={C.textDisabled}
                      editable={hasActiveItem}
                      value={sActiveOrderedItem?.trackingNumber || ""}
                      onChangeText={(val) => {
                        updateActiveItemField("trackingNumber", val);
                      }}
                      multiline={false}
                      numberOfLines={1}
                      style={{ height: '100%', boxSizing: 'border-box', fontSize: 11, flex: 1, padding: "0 5px", border: `1px solid ${C.borderSubtle}`, borderRadius: 6, resize: "none", overflow: "hidden", color: C.text, outline: "none" }}
                    />
                    {sActiveOrderedItem?.trackingNumber ? (() => {
                      const inputVal = sActiveOrderedItem.trackingNumber.trim();
                      const isURL = /^https?:\/\/|^www\./i.test(inputVal);
                      const copyOnRightClick = (e) => { e.preventDefault(); navigator.clipboard.writeText(inputVal); };
                      if (isURL) {
                        const openUrl = inputVal.startsWith("www.") ? "https://" + inputVal : inputVal;
                        return (
                          <button
                            type="button"
                            title="Press to open, right-click to copy"
                            onClick={() => window.open(openUrl, "_blank")}
                            onContextMenu={copyOnRightClick}
                            style={{ height: '100%', boxSizing: 'border-box', marginLeft: 5, backgroundColor: C.buttonLightGreen, borderColor: C.buttonLightGreenOutline, borderWidth: 1, borderStyle: 'solid', borderRadius: 5, paddingTop: 0, paddingBottom: 0, paddingLeft: 8, paddingRight: 8, fontSize: 12, color: C.textMuted, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
                          >
                            Open
                          </button>
                        );
                      }
                      return (
                        <button
                          type="button"
                          title="Press to track, right-click to copy"
                          onClick={() => _sSetShowTracker(true)}
                          onContextMenu={copyOnRightClick}
                          style={{ height: '100%', boxSizing: 'border-box', marginLeft: 5, backgroundColor: C.green, borderWidth: 0, borderRadius: 5, paddingTop: 0, paddingBottom: 0, paddingLeft: 8, paddingRight: 8, fontSize: 12, color: 'white', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
                        >
                          Track
                        </button>
                      );
                    })() : null}
                  </div>
                  {sActiveOrderedItem?.trackingNumber && !/^https?:\/\/|^www\./i.test(sActiveOrderedItem.trackingNumber.trim()) ? (
                    <ScreenModal
                      showOuterModal={true}
                      modalVisible={sShowTracker}
                      buttonVisible={false}
                      handleOuterClick={() => _sSetShowTracker(false)}
                      Component={() => (
                        <div style={{ width: "80vw", height: "85vh", backgroundColor: C.backgroundWhite, borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                          <div style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: "10px 15px", backgroundColor: C.green, boxSizing: "border-box" }}>
                            <span style={{ fontSize: 16, fontWeight: "600", color: "white" }}>Package Tracking</span>
                            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", flex: 1, marginLeft: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sActiveOrderedItem.trackingNumber.trim()}</span>
                            <button type="button" onClick={() => _sSetShowTracker(false)} style={{ width: 30, height: 30, borderRadius: 15, display: "flex", justifyContent: "center", alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                              <span style={{ fontSize: 18, fontWeight: "700", color: "white" }}>✕</span>
                            </button>
                          </div>
                          <div style={{ flex: 1, padding: 10 }}>
                            <iframe
                              src={"https://parcelsapp.com/en/tracking/" + sActiveOrderedItem.trackingNumber.trim()}
                              style={{ width: "100%", height: "100%", border: "none", borderRadius: 6 }}
                              title="Package Tracking"
                            />
                          </div>
                        </div>
                      )}
                    />
                  ) : null}
                </div>

                {/* Button column — 13% */}
                {(() => {
                  const items = zOpenWorkorder?.orderedItems || [];
                  const canGoRight = sActiveOrderedIndex < items.length - 1;
                  const canGoLeft = sActiveOrderedIndex > 0;
                  const addTooltip = isDonePaid ? "Workorder is done & paid" : "Add ordered item";
                  const rightTooltip = canGoRight
                    ? `Next item (${sActiveOrderedIndex + 2} of ${items.length})`
                    : items.length === 0 ? "No items yet" : "Already at last item";
                  const leftTooltip = canGoLeft
                    ? `Previous item (${sActiveOrderedIndex} of ${items.length})`
                    : "Already at first item";
                  return (
                    <div style={{ width: "13%", flexShrink: 0, display: "flex", flexDirection: "column", paddingLeft: 5, borderLeftWidth: 1, borderLeftStyle: "solid", borderLeftColor: C.borderSubtle, boxSizing: "border-box" }}>
                      {/* Plus button */}
                      <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center" }}>
                        <Tooltip text={addTooltip} position="left">
                          <button type="button" disabled={isDonePaid} onClick={handleAddOrderedItem} style={{ background: "none", border: "none", padding: 0, cursor: isDonePaid ? "default" : "pointer" }}>
                            <Image_ icon={ICONS.add} size={32} />
                          </button>
                        </Tooltip>
                      </div>
                      {/* Caret navigation */}
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-around", alignItems: "center" }}>
                        <div style={{ opacity: canGoRight ? 1 : 0.2 }}>
                          <Tooltip text={rightTooltip} position="left">
                            <button type="button" disabled={!canGoRight} onClick={handleNavigateRight} style={{ background: "none", border: "none", padding: 0, cursor: canGoRight ? "pointer" : "default" }}>
                              <Image_ icon={ICONS.caretRight} size={22} />
                            </button>
                          </Tooltip>
                        </div>
                        <div style={{ opacity: canGoLeft ? 1 : 0.2 }}>
                          <Tooltip text={leftTooltip} position="left">
                            <button type="button" disabled={!canGoLeft} onClick={handleNavigateLeft} style={{ background: "none", border: "none", padding: 0, cursor: canGoLeft ? "pointer" : "default" }}>
                              <Image_ icon={ICONS.caretLeft} size={22} />
                            </button>
                          </Tooltip>
                        </div>
                      </div>
                    </div>
                  );
                })()}

              </div>
            )}
          </div>
        </div>
      </div>

      <div className={styles.actionBar}>
        <Tooltip text="New workorder / customer lookup" position="top" offsetX={63}>
          <Button_
            icon={ICONS.bicycle}
            iconSize={50}
            buttonStyle={{
              paddingHorizontal: 0,
              paddingVertical: 0,
            }}
            onPress={handleNewWorkorderPress}
          />
        </Tooltip>
        <Tooltip text={isPrinterOffline ? printerOfflineLabel : "Print Workorder"} position="top">
          <Button_
            icon={ICONS.workorder}
            iconSize={30}
            iconStyle={{ paddingHorizontal: 0 }}
            buttonStyle={{ paddingHorizontal: 0, paddingVertical: 0 }}
            onPress={handleWorkorderPrintPress}
            enabled={!isPrinterOffline}
            // onPress={}
          />
        </Tooltip>
        <Tooltip text={isPrinterOffline ? `${printerOfflineLabel}, right-click to send text/email` : "Print intake/estimate, right-click to send text/email"} position="top">
        <Pressable_
          onPress={isPrinterOffline ? undefined : handleIntakePrintPress}
          onRightPress={handleIntakeSendElectronic}
          >
          <Button_
            icon={ICONS.receipt}
            iconSize={35}
            iconStyle={{ paddingHorizontal: 0 }}
            buttonStyle={{ paddingHorizontal: 0, paddingVertical: 0 }}
            onPress={handleIntakePrintPress}
            enabled={!isPrinterOffline}
          />
          </Pressable_>
        </Tooltip>

        <Tooltip text={sUploadProgress && !sUploadProgress.done ? "Upload in progress, you may continue work safely" : "View & upload photos to workorder"} position="top">
          <div className={styles.uploadWrap}>
            <Button_
              icon={ICONS.uploadCamera}
              iconSize={35}
              onPress={() => _setShowMediaModal(true)}
              buttonStyle={{
                backgroundColor: "transparent",
                paddingHorizontal: 0,
                paddingVertical: 0,
              }}
            />
            <div
              style={{
                pointerEvents: "none",
                position: "absolute",
                top: -3,
                right: -10,
                borderRadius: 8,
                minWidth: 16,
                height: 16,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                padding: "0 3px",
              }}
            >
              <span
                style={{
                  color: zOpenWorkorder?.media?.length > 0 ? C.red : 'gray',
                  fontSize: 15,
                  fontWeight: "700",
                }}
              >
                {zOpenWorkorder?.media?.length || 0}
              </span>
            </div>
            {sUploadProgress && (
              <div style={{ position: "absolute", bottom: -2, left: 0, right: 0, height: 4, backgroundColor: C.surfaceAlt, borderRadius: 2, overflow: "hidden" }}>
                {!sUploadProgress.done ? (
                  <div
                    style={{
                      width: "40%",
                      height: "100%",
                      backgroundColor: C.blue,
                      borderRadius: 2,
                      animation: "uploadBarCycle 1.2s ease-in-out infinite",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      backgroundColor: sUploadProgress.failed > 0 ? C.red : C.green,
                      borderRadius: 2,
                    }}
                  />
                )}
              </div>
            )}
          </div>
        </Tooltip>
        <Tooltip text="New sale" position="top">
          <Button_
            icon={ICONS.cashRegister}
            iconSize={35}
            buttonStyle={{
              backgroundColor: "transparent",
              paddingHorizontal: 0,
              paddingVertical: 0,
            }}
            onPress={handleStartStandaloneSalePress}
          />
        </Tooltip>
      </div>
      {sShowMediaModal && (
        <Suspense fallback={null}>
          <WorkorderMediaModal
            visible={sShowMediaModal}
            onClose={() => _setShowMediaModal(false)}
            workorderID={zOpenWorkorder?.id}
            mode="view"
            isDonePaid={isDonePaid}
          />
        </Suspense>
      )}
      <PrinterAlert
        visible={!!sPrinterAlert}
        x={sPrinterAlert?.x}
        y={sPrinterAlert?.y}
        onDone={() => _setPrinterAlert(null)}
      />
    </div>
  );
};

