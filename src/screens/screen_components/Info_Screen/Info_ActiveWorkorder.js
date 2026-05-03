/* eslint-disable */

import { View, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, Modal } from "react-native-web";
import {
  capitalizeFirstLetterOfString,
  checkInputForNumbersOnly,
  formatCurrencyDisp,
  formatMillisForDisplay,
  formatPhoneWithDashes,
  createNewWorkorder,
  generateEAN13Barcode,
  gray,
  lightenRGBByPercent,
  log,
  deepEqual,
  printBuilder,
  removeUnusedFields,
  resolveStatus,
  calculateWaitEstimateLabel,
  findTemplateByType,

  scheduleAutoText,
  localStorageWrapper,
} from "../../../utils";
import {
  ScreenModal,
  SHADOW_RADIUS_NOTHING,
  DropdownMenu,
  Button_,
  Image_,
  TextInput_,
  PrinterButton,
  StatusPickerModal,
  Tooltip,
  CheckBox_,
  Pressable_,
  StaleBanner,
  PrinterAlert,
  WebPageModal,
  TimePicker_,
  DatePicker_,
} from "../../../components";
import { C, COLOR_GRADIENTS, Colors, ICONS } from "../../../styles";
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
} from "../../../data";
import { MILLIS_IN_DAY, build_db_path } from "../../../constants";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { cloneDeep } from "lodash";
import {
  useCurrentCustomerStore,
  useOpenWorkordersStore,
  useLoginStore,
  useSettingsStore,
  useTabNamesStore,
  useAlertScreenStore,
  useUploadProgressStore,
} from "../../../stores";
import { CustomerInfoScreenModalComponent } from "../modal_screens/CustomerInfoModalScreen";
import { WorkorderMediaModal } from "../modal_screens/WorkorderMediaModal";
import { dbSavePrintObj, dbTestCustomerPhoneWrite, dbTestCustomerPhoneWriteHTTP, dbSendSMS, dbSendEmail, dbUploadPDFAndSendSMS, startNewWorkorder } from "../../../db_calls_wrapper";

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
  const [sPickerCoords, _sSetPickerCoords] = useState({ x: 0, y: 0 });

  const dateRef = useRef(null);
  const startRef = useRef(null);
  const endRef = useRef(null);

  const openPicker = (ref, setter) => {
    const el = ref.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      _sSetPickerCoords({ x: rect.left, y: rect.bottom + 4 });
    }
    setter(true);
  };

  const pillStyle = {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
    backgroundColor: C.blue,
  };
  const pillText = { fontSize: 12, color: "white", fontWeight: "600" };
  const labelText = { fontSize: 11, color: gray(0.5), fontStyle: "italic", marginRight: 4 };

  const startParts = parse12To24Parts(pd.startTime);
  const endParts = parse12To24Parts(pd.endTime);

  const pickerOverlay = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 };

  return (
    <>
      <View ref={dateRef}>
        <TouchableOpacity
          disabled={isDonePaid}
          onPress={() => openPicker(dateRef, _sSetShowDatePicker)}
          style={[pillStyle, { backgroundColor: C.green }]}
        >
          <Text style={pillText}>{dateLabel}</Text>
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View ref={startRef}>
          <TouchableOpacity
            disabled={isDonePaid}
            onPress={() => openPicker(startRef, _sSetShowStartPicker)}
            style={pillStyle}
          >
            <Text style={pillText}>{formatTime12(pd.startTime)}</Text>
          </TouchableOpacity>
        </View>
        <Text style={[labelText, { marginLeft: 7 }]}>to</Text>
        <View ref={endRef}>
          <TouchableOpacity
            disabled={isDonePaid}
            onPress={() => openPicker(endRef, _sSetShowEndPicker)}
            style={pillStyle}
          >
            <Text style={pillText}>{formatTime12(pd.endTime)}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Date picker modal */}
      <Modal visible={sShowDatePicker} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => _sSetShowDatePicker(false)}>
          <View style={pickerOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={{ position: "absolute", left: sPickerCoords.x, top: sPickerCoords.y }}>
                <DatePicker_
                  initialMonth={Number(pd.month) || new Date().getMonth() + 1}
                  initialDay={Number(pd.day) || new Date().getDate()}
                  onConfirm={({ month, day }) => {
                    updatePickupFields({ month: String(month), day: String(day) });
                    _sSetShowDatePicker(false);
                  }}
                  onCancel={() => _sSetShowDatePicker(false)}
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Start time picker modal */}
      <Modal visible={sShowStartPicker} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => _sSetShowStartPicker(false)}>
          <View style={pickerOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={{ position: "absolute", left: sPickerCoords.x, top: sPickerCoords.y }}>
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
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* End time picker modal */}
      <Modal visible={sShowEndPicker} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => _sSetShowEndPicker(false)}>
          <View style={pickerOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={{ position: "absolute", left: sPickerCoords.x, top: sPickerCoords.y }}>
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
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
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
  const hasItemOrderingData = !!(zOpenWorkorder?.partOrdered || zOpenWorkorder?.partSource || zOpenWorkorder?.trackingNumber || zOpenWorkorder?.partToBeOrdered === false || zOpenWorkorder?.partOrderEstimateMillis || zOpenWorkorder?.partOrderedMillis);

  // Estimated wait days — local state for instant UI, debounced DB write
  const [sWaitDays, _setWaitDays] = useState(0);
  const waitDaysTimerRef = useRef(null);

  useEffect(() => {
    if (!zOpenWorkorder?.partOrderEstimateMillis || !zOpenWorkorder?.partOrderedMillis) {
      _setWaitDays(0);
      return;
    }
    const days = Math.max(0, Math.round((zOpenWorkorder.partOrderEstimateMillis - zOpenWorkorder.partOrderedMillis) / MILLIS_IN_DAY));
    _setWaitDays(days);
  }, [zOpenWorkorder?.id]);

  // Blink wait time input when status requires wait time but none is selected
  useEffect(() => {
    let statusObj = (zSettings?.statuses || []).find((s) => s.id === zOpenWorkorder?.status);
    let waitLabel = zOpenWorkorder?.waitTime?.label || "";
    let maxDays = zOpenWorkorder?.waitTime?.maxWaitTimeDays;
    let needsBlink = statusObj?.requireWaitTime && (waitLabel.length <= 3 || maxDays === 0 || maxDays === "0");
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
    _setWaitDays(newDays);
    clearTimeout(waitDaysTimerRef.current);
    const woID = zOpenWorkorder?.id;
    if (!woID) return;
    waitDaysTimerRef.current = setTimeout(() => {
      let now = Date.now();
      useOpenWorkordersStore.getState().setField("partOrderedMillis", now, woID, false);
      useOpenWorkordersStore.getState().setField("partOrderEstimateMillis", now + (newDays * MILLIS_IN_DAY), woID);
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
  const [sHoveredDropdown, _setHoveredDropdown] = useState(null);
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

  const isDonePaid = resolveStatus(zOpenWorkorder?.status, zSettings?.statuses)?.label?.toLowerCase() === "done & paid";


  // Stable reference so ScreenModal doesn't remount the modal content on parent re-renders
  const CustomerInfoComponent = useCallback(() => (
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
    const emailContent = emailTemplate?.content || emailTemplate?.body || "";
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

  async function sendIntakeReceipt(settings, customer, workorder, smsTemplate, emailTemplate) {
    useAlertScreenStore.getState().setValues({
      title: "Sending ticket...",
      message: "",
      btn1Icon: ICONS.wheelGIF,
      icon1Size: 40,
      canExitOnOuterClick: false,
    });

    const { tenantID, storeID } = useSettingsStore.getState().getSettings();
    const firstName = customer?.first || "Customer";
    const storeName = settings?.storeInfo?.displayName || "our store";
    const brand = workorder?.brand || "";
    const description = workorder?.description || "";

    function applyVars(template, v) {
      let result = template;
      for (const [key, val] of Object.entries(v)) {
        result = result.replace(new RegExp("\\{" + key + "\\}", "g"), val || "");
      }
      return result;
    }

    let results = [];
    let errors = [];

    let receiptURL = "";
    try {
      const _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings };
      const receiptData = printBuilder.intake(workorder, customer, settings?.salesTaxPercent, _ctx);
      const { generateWorkorderTicketPDF } = await import("../../../pdfGenerator");
      const base64 = generateWorkorderTicketPDF(receiptData);
      const storagePath = build_db_path.cloudStorage.intakeReceiptPDF(workorder.id, tenantID, storeID);

      if (smsTemplate && customer.customerCell) {
        const vars = { firstName, storeName, brand, description, link: "{link}" };
        const msg = applyVars(smsTemplate.content || smsTemplate.message || smsTemplate.text || "", vars);
        try {
          const result = await dbUploadPDFAndSendSMS({
            base64,
            storagePath,
            message: msg,
            phoneNumber: customer.customerCell,
            customerID: workorder?.customerID || "",
            messageID: crypto.randomUUID(),
          });
          if (result?.data?.url) receiptURL = result.data.url;
          results.push("SMS sent to " + customer.customerCell);
        } catch (smsErr) {
          errors.push("SMS failed: " + (smsErr?.message || String(smsErr)));
        }
      } else {
        const { uploadStringToStorage } = await import("../../../db_calls");
        try {
          const uploadResult = await uploadStringToStorage(base64, storagePath, "base64");
          if (uploadResult?.downloadURL) receiptURL = uploadResult.downloadURL;
        } catch (uploadErr) {
          errors.push("PDF upload failed: " + (uploadErr?.message || String(uploadErr)));
        }
      }
    } catch (e) {
      errors.push("PDF generation failed: " + (e?.message || String(e)));
    }

    if (emailTemplate && customer.email) {
      const linkHtml = receiptURL
        ? "<a href='" + receiptURL + "' style='display:inline-block;padding:12px 24px;background-color:#4CAF50;color:white;text-decoration:none;border-radius:6px;font-size:14px'>View Receipt</a>"
        : "";
      const receiptLink = receiptURL
        ? "<p style='margin:24px 0'>" + linkHtml + "</p>"
        : "";
      const vars = { firstName, storeName, brand, description, link: linkHtml || receiptURL, receiptLink };
      const subject = applyVars(emailTemplate.subject || "", vars);
      const html = applyVars(emailTemplate.content || emailTemplate.body || "", vars);
      try {
        await dbSendEmail(customer.email, subject, html);
        results.push("Email sent to " + customer.email);
      } catch (emailErr) {
        errors.push("Email failed: " + (emailErr?.message || String(emailErr)));
      }
    }

    if (errors.length > 0) {
      useAlertScreenStore.getState().setValues({
        title: "Intake Receipt Errors",
        message: (results.length > 0 ? results.join("\n") + "\n\n" : "") + errors.join("\n"),
        btn1Text: "OK",
        handleBtn1Press: () => useAlertScreenStore.getState().setShowAlert(false),
        canExitOnOuterClick: true,
      });
    } else {
      useAlertScreenStore.getState().setValues({
        title: "Sent",
        message: results.join("\n"),
        canExitOnOuterClick: true,
      });
      setTimeout(() => useAlertScreenStore.getState().setShowAlert(false), 2000);
    }
  }

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "space-between",
        alignItems: "center",
        paddingBottom: 0,
        paddingTop: 5,
        paddingHorizontal: 5,
        backgroundImage: (zIsPreview || zIsLocked)
              ? `repeating-linear-gradient(135deg, ${lightenRGBByPercent(C.lightred, 92)}, ${lightenRGBByPercent(C.lightred, 92)} 10px, transparent 10px, transparent 20px)`
              : undefined,
        backgroundColor: C.backgroundWhite,
        borderRadius: 7,
      }}
    >
      <View
        style={{
          width: "100%",
          alignItems: "center",
        }}
      >
        <View
          style={{
            width: "100%",
            justifyContent: "center",
            alignItems: "center",
            paddingVertical: 11,
            backgroundColor: C.buttonLightGreen,
            borderColor: C.buttonLightGreenOutline,
            borderWidth: 1,
            borderRadius: 7,
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
              <View style={{ flexDirection: "row", justifyContent: "space-between", width: "95%", paddingHorizontal: 5, paddingVertical: 1 }}>
                {totalDeposit > 0 ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <View style={{ backgroundColor: lightenRGBByPercent(C.green, 70), paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                      <Text style={{ fontSize: 10, fontWeight: "600", color: C.green }}>{activeDeps.length > 1 ? "Deposits" : "Deposit"}</Text>
                    </View>
                    <Text style={{ fontSize: 11, fontWeight: "600", color: C.green }}>{formatCurrencyDisp(totalDeposit, true)}</Text>
                  </View>
                ) : <View />}
                {totalCredit > 0 ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <View style={{ backgroundColor: lightenRGBByPercent(C.blue, 70), paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                      <Text style={{ fontSize: 10, fontWeight: "600", color: C.blue }}>{activeCreds.length > 1 ? "Credits" : "Credit"}</Text>
                    </View>
                    <Text style={{ fontSize: 11, fontWeight: "600", color: C.blue }}>{formatCurrencyDisp(totalCredit, true)}</Text>
                  </View>
                ) : <View />}
              </View>
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
            <Text style={{ fontSize: 12, color: gray(0.5), textAlign: "center", fontStyle: "italic" }}>
              {zCustomerLanguage}
            </Text>
          )}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              borderColor: C.buttonLightGreenOutline,
              borderRadius: 15,
              borderWidth: 1,
              marginTop: 5,
              padding: 5,
              paddingRight: 8,
              width: "95%",
            }}
          >
            {(zCustomer?.customerCell?.length > 0 || zOpenWorkorder?.customerCell?.length > 0) && (
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Image_
                  icon={ICONS.cellPhone}
                  size={20}
                  style={{ marginRight: 5 }}
                />
                <Text style={{ color: C.text, fontSize: 12 }}>
                  {formatPhoneWithDashes(zCustomer?.customerCell || zOpenWorkorder?.customerCell)}
                </Text>
              </View>
            )}
            {!zCustomer?.customerLandline.length > 0 && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  fontSize: 12,
                }}
              >
                <Image_
                  icon={ICONS.home}
                  size={18}
                  style={{ marginRight: 7 }}
                />
                <Text style={{ color: C.text, fontSize: 12 }}>
                  {/* {formatPhoneWithDashes(zCustomer.customerLandline)} */}
                  {formatPhoneWithDashes(2343234323)}
                </Text>
              </View>
            )}
            {zCustomer?.contactRestriction === CONTACT_RESTRICTIONS.call && (
              <Text style={{ color: C.text, fontSize: 13 }}>CALL ONLY</Text>
            )}
            {zCustomer?.contactRestriction === CONTACT_RESTRICTIONS.email && (
              <Text style={{ color: C.text, fontSize: 13 }}>EMAIL ONLY</Text>
            )}
          </View>
        </View>

        {/* {(!zWorkordersLoaded || !zCustomerRefreshed) && zOpenWorkorder && (
          <StaleBanner
            text="Waiting on customer refresh...."
            style={{ marginTop: 8, width: "100%" }}
          />
        )} */}

        <View pointerEvents={isDonePaid ? "none" : "auto"} style={{ width: "100%" }}>
          <View
            style={{
              marginTop: 10,
              borderColor: gray(0.05),
              paddingHorizontal: 8,
              paddingVertical: 8,
              // backgroundColor: C.backgroundListWhite,
              backgroundColor: gray(0.05),

              borderWidth: 1,
              borderRadius: 5,
              zIndex: 10,
              overflow: "visible",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-start",
                alignItems: "center",
                width: "100%",
                zIndex: 10,
                overflow: "visible",
                // backgroundColor: "blue",
              }}
            >
              <View ref={brandWrapperRef} style={{ width: "45%", zIndex: 10 }}>
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
                  onFocus={() => { _setBrandFocused(true); brandBackspaced.current = false; }}
                  onBlur={() => {
                    setTimeout(() => {
                      _setBrandFocused(false);
                      brandBackspaced.current = false;
                      saveBrandToAllBrands(zOpenWorkorder?.brand);
                    }, 150);
                  }}
                />
                {brandSuggestions.length > 0 && (
                  <View
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      backgroundColor: C.listItemWhite,
                      borderWidth: 1,
                      borderColor: C.buttonLightGreenOutline,
                      borderRadius: 5,
                      maxHeight: 200,
                      overflow: "auto",
                      zIndex: 999,
                    }}
                  >
                    {brandSuggestions.map((item) => (
                      <View
                        key={item}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = gray(0.06); }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                        style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6, paddingHorizontal: 8 }}
                      >
                        <TouchableOpacity
                          onPress={() => {
                            useOpenWorkordersStore.getState().setField("brand", item, zOpenWorkorder.id);
                            _setBrandFocused(false);
                          }}
                          style={{ flex: 1, cursor: "pointer" }}
                        >
                          <Text style={{ fontSize: 14, color: C.text }}>{item}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            const updated = (zSettings.allBrands || []).filter((b) => b !== item);
                            useSettingsStore.getState().setField("allBrands", updated);
                          }}
                          style={{ paddingLeft: 8, cursor: "pointer" }}
                        >
                          <Text style={{ fontSize: 12, color: gray(0.55) }}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </View>
              <View
                style={{
                  // marginTop: 11,
                  width: "55%",
                  flexDirection: "row",
                  paddingLeft: 5,
                  justifyContent: "flex-start",
                  alignItems: "center",
                  justifyContent: "space-between",
                  // backgroundColor: "green",
                }}
              >
                <View
                  onMouseEnter={() => _setHoveredDropdown("brandBikes")}
                  onMouseLeave={() => _setHoveredDropdown(null)}
                  style={{
                    width: "48%",
                    height: "100%",
                    opacity: sHoveredDropdown === "brandBikes" ? 1 : (zOpenWorkorder?.brand ? FILLED_DROPDOWN_OPACITY : 1),
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
                  />
                </View>
                <View style={{ width: 5 }} />
                <View
                  onMouseEnter={() => _setHoveredDropdown("brandOptional")}
                  onMouseLeave={() => _setHoveredDropdown(null)}
                  style={{
                    width: "48%",
                    alignItems: null,
                    justifyContent: "center",
                    opacity: sHoveredDropdown === "brandOptional" ? 1 : (zOpenWorkorder?.brand ? FILLED_DROPDOWN_OPACITY : 1),
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
                  />
                </View>
              </View>
            </View>
            <View
              style={{
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
              <View ref={descInputRef} style={{ width: "45%", zIndex: 10 }}>
                <TextInput_
                  placeholder={"Model/Description"}
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
                  onFocus={() => { _setDescFocused(true); descBackspaced.current = false; }}
                  onBlur={() => {
                    setTimeout(() => {
                      _setDescFocused(false);
                      descBackspaced.current = false;
                      saveDescToAllDescriptions(zOpenWorkorder?.description);
                    }, 150);
                  }}
                />
                {descSuggestions.length > 0 && (
                  <View
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      backgroundColor: C.listItemWhite,
                      borderWidth: 1,
                      borderColor: C.buttonLightGreenOutline,
                      borderRadius: 5,
                      maxHeight: 200,
                      overflow: "auto",
                      zIndex: 999,
                    }}
                  >
                    {descSuggestions.map((item) => (
                      <View
                        key={item}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = gray(0.06); }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                        style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6, paddingHorizontal: 8 }}
                      >
                        <TouchableOpacity
                          onPress={() => {
                            useOpenWorkordersStore.getState().setField("description", item, zOpenWorkorder.id);
                            _setDescFocused(false);
                          }}
                          style={{ flex: 1, cursor: "pointer" }}
                        >
                          <Text style={{ fontSize: 14, color: C.text }}>{item}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            const updated = (zSettings.allDescriptions || []).filter((d) => d !== item);
                            useSettingsStore.getState().setField("allDescriptions", updated);
                          }}
                          style={{ paddingLeft: 8, cursor: "pointer" }}
                        >
                          <Text style={{ fontSize: 12, color: gray(0.55) }}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </View>
              <View
                style={{
                  // marginTop: 11,
                  width: "55%",
                  flexDirection: "row",
                  paddingLeft: 5,
                  justifyContent: "center",
                  alignItems: "center",
                  // backgroundColor: "green",
                }}
              >
                <View
                  onMouseEnter={() => _setHoveredDropdown("description")}
                  onMouseLeave={() => _setHoveredDropdown(null)}
                  style={{ width: "100%", opacity: sHoveredDropdown === "description" ? 1 : (zOpenWorkorder?.description ? FILLED_DROPDOWN_OPACITY : 1) }}
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
                  />
                </View>
              </View>
            </View>

            <View
              ref={color1InputRef}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                width: "100%",
                alignItems: "center",
                zIndex: 8,
                overflow: "visible",
                marginTop: 11,
              }}
            >
              <View style={{ width: "45%", flexDirection: "row", zIndex: 10 }}>
                <View ref={color1WrapperRef} style={{ width: "48%", zIndex: 10 }}>
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
                    onFocus={() => { _setColor1Focused(true); color1Backspaced.current = false; }}
                    onBlur={() => {
                      setTimeout(() => {
                        _setColor1Focused(false);
                        color1Backspaced.current = false;
                      }, 150);
                    }}
                  />
                  {color1Suggestions.length > 0 && (
                    <View
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        right: 0,
                        backgroundColor: C.listItemWhite,
                        borderWidth: 1,
                        borderColor: C.buttonLightGreenOutline,
                        borderRadius: 5,
                        maxHeight: 200,
                        overflow: "auto",
                        zIndex: 999,
                      }}
                    >
                      {color1Suggestions.map((item) => (
                        <View
                          key={item}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = gray(0.06); }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                          style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6, paddingHorizontal: 8 }}
                        >
                          <TouchableOpacity
                            onPress={() => {
                              setBikeColor(item, "color1");
                              _setColor1Focused(false);
                            }}
                            style={{ flex: 1, cursor: "pointer" }}
                          >
                            <Text style={{ fontSize: 14, color: C.text }}>{item}</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
                <View style={{ width: 5 }} />
                <View ref={color2InputRef} style={{ width: "48%", zIndex: 10 }}>
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
                    onFocus={() => { _setColor2Focused(true); color2Backspaced.current = false; }}
                    onBlur={() => {
                      setTimeout(() => {
                        _setColor2Focused(false);
                        color2Backspaced.current = false;
                      }, 150);
                    }}
                  />
                  {color2Suggestions.length > 0 && (
                    <View
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        right: 0,
                        backgroundColor: C.listItemWhite,
                        borderWidth: 1,
                        borderColor: C.buttonLightGreenOutline,
                        borderRadius: 5,
                        maxHeight: 200,
                        overflow: "auto",
                        zIndex: 999,
                      }}
                    >
                      {color2Suggestions.map((item) => (
                        <View
                          key={item}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = gray(0.06); }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                          style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6, paddingHorizontal: 8 }}
                        >
                          <TouchableOpacity
                            onPress={() => {
                              setBikeColor(item, "color2");
                              _setColor2Focused(false);
                            }}
                            style={{ flex: 1, cursor: "pointer" }}
                          >
                            <Text style={{ fontSize: 14, color: C.text }}>{item}</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
              <View
                style={{
                  // marginTop: 11,
                  width: "55%",
                  flexDirection: "row",
                  paddingLeft: 5,
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <View
                  onMouseEnter={() => _setHoveredDropdown("color1")}
                  onMouseLeave={() => _setHoveredDropdown(null)}
                  style={{
                    width: "48%",
                    height: "100%",
                    justifyContent: "center",
                    opacity: sHoveredDropdown === "color1" ? 1 : (zOpenWorkorder?.color1?.label ? FILLED_DROPDOWN_OPACITY : 1),
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
                  />
                </View>
                <View style={{ width: 5 }} />

                <View
                  onMouseEnter={() => _setHoveredDropdown("color2")}
                  onMouseLeave={() => _setHoveredDropdown(null)}
                  style={{
                    width: "48%",
                    height: "100%",
                    justifyContent: "center",
                    opacity: sHoveredDropdown === "color2" ? 1 : ((zOpenWorkorder?.color2?.label || zOpenWorkorder?.color1?.label) ? FILLED_DROPDOWN_OPACITY : 1),
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
                  />
                </View>
              </View>
            </View>
            {(() => {
              const rs = resolveStatus(zOpenWorkorder?.status, zSettings?.statuses);
              const isPickupDelivery = zOpenWorkorder?.status === "pickup" || zOpenWorkorder?.status === "delivery";
              const pd = zOpenWorkorder?.pickupDelivery || {};

              const handleStatusSelect = (val) => {
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
                if (val.id === "33knktg") {
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
                  let modalMessage = "Would you like to send a text to let the customer know their bike is ready for pickup?";
                  if (hasOthers && !allOthersFinished) {
                    modalMessage = "This customer has other bikes that are still being worked on. Would you like to send a text to let them know this bike is ready?";
                  } else if (allOthersFinished) {
                    modalMessage = "All of this customer's bikes are now complete! Would you like to send a text to let them know everything is ready for pickup?";
                  }
                  useAlertScreenStore.getState().setValues({
                    title: "Send Finished Text?",
                    message: modalMessage,
                    btn1Text: "Send",
                    handleBtn1Press: () => {
                      const finishedRule = { smsTemplateID: "finished_sms", emailTemplateID: "", delayMinutes: 0, delaySeconds: 0 };
                      const wo = store.getWorkorders().find((w) => w.id === zOpenWorkorder.id) || zOpenWorkorder;
                      scheduleAutoText(finishedRule, wo, zSettings);
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
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: isPickupDelivery ? "space-between" : undefined, marginTop: 11, width: "100%" }}>
                  <View style={{ width: isPickupDelivery ? "33%" : "100%" }}>
                    <StatusPickerModal
                      statuses={(zSettings.statuses || []).filter((s) => !s.systemOwned && !s.hidden)}
                      enabled={!isDonePaid}
                      onSelect={handleStatusSelect}
                      buttonStyle={{
                        width: "100%",
                        backgroundColor: rs.backgroundColor,
                        paddingHorizontal: isPickupDelivery ? 12 : 8,
                      }}
                      buttonTextStyle={{
                        color: rs.textColor,
                        fontWeight: "normal",
                        fontSize: 14,
                      }}
                      modalCoordX={100}
                      modalCoordY={40}
                      buttonText={rs.label}
                    />
                  </View>
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
                </View>
              );
            })()}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                width: "100%",
                alignItems: "center",
                marginTop: 11,
              }}
            >
              <Text style={{ color: gray(0.5), fontSize: 13, marginRight: 4 }}>
                Max wait days:
              </Text>
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
              <View
                style={{
                  flex: 1,
                  flexDirection: "row",
                  paddingLeft: 5,
                  justifyContent: "flex-start",
                  alignItems: "center",
                }}
              >
                <View
                  onMouseEnter={() => _setHoveredDropdown("waitTime")}
                  onMouseLeave={() => _setHoveredDropdown(null)}
                  style={{ width: "100%", opacity: sHoveredDropdown === "waitTime" ? 1 : (zOpenWorkorder?.waitTime?.label ? FILLED_DROPDOWN_OPACITY : 1) }}
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
                    buttonText={"Wait Times"}
                  />
                </View>
              </View>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", width: "100%", marginTop: 4 }}>
              {(() => {
                let estimateLabel = calculateWaitEstimateLabel(zOpenWorkorder, useSettingsStore.getState().getSettings());
                let isMissing = estimateLabel === "Missing estimate" || estimateLabel === "No estimate";
                return estimateLabel ? (
                  <Text
                    style={{
                      color: isMissing ? C.red : gray(0.5),
                      fontSize: 13,
                      fontStyle: "italic",
                      backgroundColor: sWaitTimeBlink && isMissing ? "rgba(255, 255, 0, 0.35)" : "transparent",
                      transition: "background-color 300ms ease",
                      borderRadius: 3,
                      paddingHorizontal: 4,
                      paddingVertical: 2,
                    }}
                  >
                    {estimateLabel}
                  </Text>
                ) : <View />;
              })()}
              <CheckBox_
                isChecked={!!zOpenWorkorder?.itemNotHere}
                text="Customer item not here"
                textStyle={{ fontSize: 13, opacity: zOpenWorkorder?.itemNotHere ? 1 : 0.6, color: zOpenWorkorder?.itemNotHere ? C.red : undefined }}
                buttonStyle={{ backgroundColor: "transparent", opacity: zOpenWorkorder?.itemNotHere ? 1 : 0.6 }}
                onCheck={() => {
                  if (isDonePaid) return;
                  useOpenWorkordersStore.getState().setField("itemNotHere", !zOpenWorkorder?.itemNotHere, zOpenWorkorder.id);
                }}
              />
            </View>
          </View>

          <View
            style={{
              marginTop: 0,
              width: "100%",

              // borderColor: gray(0.05),
              paddingHorizontal: 8,
              paddingVertical: 8,
              backgroundColor: gray(0.05),
              // borderWidth: 1,
              borderRadius: 5,

            }}
          >
            <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center', marginBottom: (sShowItemOrdering || hasItemOrderingData) ? 7 : 0, opacity: .5 }}>
              <View style={{ flex: 1, height: 3, borderRadius: 5, backgroundColor: gray(0.25) }} />
              <TouchableOpacity
                disabled={hasItemOrderingData}
                onPress={() => {
                  const willShow = !sShowItemOrdering;
                  _sSetShowItemOrdering(willShow);
                  if (willShow && !zOpenWorkorder?.partOrdered && !zOpenWorkorder?.partSource && !zOpenWorkorder?.trackingNumber) {
                    useOpenWorkordersStore.getState().setField("partToBeOrdered", true, zOpenWorkorder.id);
                  }
                }}
                style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 8 }}
                activeOpacity={hasItemOrderingData ? 1 : 0.6}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', fontStyle: 'italic', color: (sShowItemOrdering || hasItemOrderingData) ? C.orange : gray(0.5), marginRight: 5 }}>Ordering Info</Text>
                <Text style={{ fontSize: 10, color: (sShowItemOrdering || hasItemOrderingData) ? C.orange : gray(0.5), transform: [{ rotate: (sShowItemOrdering || hasItemOrderingData) ? '90deg' : '0deg' }] }}>▶</Text>
              </TouchableOpacity>
              <View style={{ flex: 1, height: 3, borderRadius: 5, backgroundColor: gray(0.25) }} />
            </View>
            {(sShowItemOrdering || hasItemOrderingData) && <>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-start",
                alignItems: "center",
                width: "100%",
                marginTop: 5,
              }}
            >
              <TextInput_
                placeholder={"Item names/descriptions"}
                placeholderTextColor={gray(0.2)}
                editable={!isDonePaid}
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
                  fontWeight: zOpenWorkorder?.partOrdered ? "500" : null,
                  backgroundColor: C.backgroundWhite,
                }}
                value={capitalizeFirstLetterOfString(zOpenWorkorder?.partOrdered)}
                onChangeText={(val) => {
                  useOpenWorkordersStore.getState().setField("partOrdered", val, zOpenWorkorder.id);
                  useOpenWorkordersStore.getState().setField("partOrderedMillis", Date.now(), zOpenWorkorder.id);
                }}
              />
            </View>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-start",
                alignItems: "center",
                width: "100%",
                marginTop: 11,
              }}
            >
              <TextInput_
                value={capitalizeFirstLetterOfString(zOpenWorkorder?.partSource)}
                placeholder={"Item sources"}
                placeholderTextColor={gray(0.2)}
                editable={!isDonePaid}
                capitalize={true}
                style={{
                  width: "50%",
                  borderWidth: 1,
                  borderColor: zOpenWorkorder?.partSource ? FILLED_BORDER_COLOR : C.buttonLightGreenOutline,
                  color: C.text,
                  paddingVertical: 2,
                  paddingHorizontal: 4,
                  fontSize: 15,
                  outlineStyle: "none",
                  borderRadius: 5,
                  fontWeight: zOpenWorkorder?.partSource ? "500" : null,
                  backgroundColor: C.backgroundWhite,
                }}
                onChangeText={(val) => {
                  useOpenWorkordersStore.getState().setField("partSource", val, zOpenWorkorder.id);
                  useOpenWorkordersStore.getState().setField("partOrderedMillis", Date.now(), zOpenWorkorder.id);
                }}
              />
              <View
                style={{
                  // marginTop: 11,
                  width: "50%",
                  flexDirection: "row",
                  paddingLeft: 5,
                  justifyContent: "",
                  alignItems: "center",
                  justifyContent: "center",
                  // backgroundColor: "blue",
                }}
              >
                <View
                  onMouseEnter={() => _setHoveredDropdown("partSource")}
                  onMouseLeave={() => _setHoveredDropdown(null)}
                  style={{ opacity: sHoveredDropdown === "partSource" ? 1 : (zOpenWorkorder?.partSource ? FILLED_DROPDOWN_OPACITY : 1) }}
                >
                  <DropdownMenu
                    dataArr={zSettings.partSources}
                    enabled={!isDonePaid}
                    onSelect={(item, idx) => {
                      useOpenWorkordersStore.getState().setField("partSource", item, zOpenWorkorder.id);
                      useOpenWorkordersStore.getState().setField("partOrderedMillis", Date.now(), zOpenWorkorder.id);
                    }}
                    modalCoordX={20}
                    buttonStyle={{
                      paddingHorizontal: 40,
                    }}
                    ref={partSourcesRef}
                    buttonText={"Sources"}
                  />
                </View>
              </View>
            </View>

            {/* Estimated wait days picker + To be ordered checkbox */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                marginTop: 11,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ fontSize: 13, color: gray(0.45), marginRight: 8 }}>
                  Est. delivery
                </Text>
                <TouchableOpacity
                  disabled={isDonePaid}
                  onPress={() => updateWaitDays(Math.max(0, sWaitDays - 1))}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 4,
                    backgroundColor: isDonePaid ? gray(0.85) : C.buttonLightGreen,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: gray(0.55), fontSize: 14, fontWeight: "700", marginTop: -1 }}>−</Text>
                </TouchableOpacity>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "400",
                    color: C.text,
                    minWidth: 50,
                    textAlign: "center",
                  }}
                >
                  {sWaitDays + " days"}
                </Text>
                <TouchableOpacity
                  disabled={isDonePaid}
                  onPress={() => updateWaitDays(sWaitDays + 1)}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 4,
                    backgroundColor: isDonePaid ? gray(0.85) : C.buttonLightGreen,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: gray(0.55), fontSize: 14, fontWeight: "700", marginTop: -1 }}>+</Text>
                </TouchableOpacity>
              </View>
              {!!zOpenWorkorder?.partOrderEstimateMillis && (
                <Text style={{ fontSize: 14, color: sWaitDays > 0 ? gray(0.45) : "transparent" }}>
                  {formatMillisForDisplay(zOpenWorkorder.partOrderEstimateMillis)}
                </Text>
              )}
              <TouchableOpacity
                disabled={isDonePaid}
                activeOpacity={0.7}
                onPress={() => {
                  const newVal = !zOpenWorkorder?.partToBeOrdered;
                  const store = useOpenWorkordersStore.getState();
                  store.setField("partToBeOrdered", newVal, zOpenWorkorder.id);
                  store.setField("status", newVal ? "is_order_part_for_customer" : "part_ordered", zOpenWorkorder.id);
                }}
                style={{ flexDirection: 'row', alignItems: 'center' }}
              >
                <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: zOpenWorkorder?.partToBeOrdered ? C.red : C.green, justifyContent: 'center', alignItems: 'center', marginRight: 4 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: zOpenWorkorder?.partToBeOrdered ? C.red : C.green }} />
                </View>
                <Text style={{ fontSize: 11, fontWeight: '600', color: zOpenWorkorder?.partToBeOrdered ? C.red : C.green }}>{zOpenWorkorder?.partToBeOrdered ? "Not ordered" : "Ordered"}</Text>
              </TouchableOpacity>
            </View>
            <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingVertical: 2 }}>
              <TextInput_
                placeholder="Tracking num or website here..."
                placeholderTextColor={gray(.3)}
                value={zOpenWorkorder?.trackingNumber || ""}
                onChangeText={(val) => {
                  useOpenWorkordersStore.getState().setField("trackingNumber", val, zOpenWorkorder.id);
                }}
                multiline={false}
                numberOfLines={1}
                style={{ height: '100%', fontSize: 11, flex: 1, paddingHorizontal: 5, borderWidth: 1, borderColor: gray(.15), borderRadius: 6, resize: "none", overflow: "hidden", color: C.text, outlineStyle: "none" }}
              />
              {zOpenWorkorder?.trackingNumber ? (() => {
                const inputVal = zOpenWorkorder.trackingNumber.trim();
                const isURL = /^https?:\/\/|^www\./i.test(inputVal);
                if (isURL) {
                  const openUrl = inputVal.startsWith("www.") ? "https://" + inputVal : inputVal;
                  return (
                    <View onContextMenu={(e) => { e.preventDefault(); navigator.clipboard.writeText(inputVal); }}>
                      <Tooltip text="Press to open, right-click to copy" position="top">
                        <Pressable_ onPress={() => window.open(openUrl, "_blank")} style={{ height: '90%', marginLeft: 5 }}>
                          <View style={{ height: '100%', backgroundColor: C.buttonLightGreen, borderColor: C.buttonLightGreenOutline, borderWidth: 1, borderRadius: 5, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8 }}>
                            <Text style={{ fontSize: 13, color: gray(0.55), fontWeight: '500' }}>Open</Text>
                          </View>
                        </Pressable_>
                      </Tooltip>
                    </View>
                  );
                }
                return (
                  <View onContextMenu={(e) => { e.preventDefault(); navigator.clipboard.writeText(inputVal); }}>
                    <Tooltip text="Press to track, right-click to copy" position="top">
                      <WebPageModal
                        url={"https://parcelsapp.com/en/tracking/" + inputVal}
                        title="Package Tracking"
                        subtitle={inputVal}
                        buttonLabel="Track"
                        buttonStyle={{ height: '90%', marginLeft: 5 }}
                      />
                    </Tooltip>
                  </View>
                );
              })() : null}
            </View>
            {!!(zOpenWorkorder?.trackingNumber || "").trim() && (
              <Text style={{ fontSize: 10, fontStyle: 'italic', color: gray(0.3), marginTop: 3 }}>Place additional tracking info in Internal Notes</Text>
            )}
            </>}
          </View>
        </View>
      </View>

      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          width: "100%",
          alignItems: "center",
          borderRadius: 5,
          borderWidth: 0,
          borderColor: 'transparent',
          // backgroundColor: C.backgroundListWhite,

          borderWidth: 1,
          paddingHorizontal: 3,
        }}
      >
        <Tooltip text="New workorder / customer lookup" position="right">
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
        <Tooltip text="Print Workorder" position="top">
          <Button_
            icon={ICONS.workorder}
            iconSize={30}
            iconStyle={{ paddingHorizontal: 0 }}
            buttonStyle={{ paddingHorizontal: 0, paddingVertical: 0 }}
            onPress={handleWorkorderPrintPress}
            // onPress={}
          />
        </Tooltip>
        <Tooltip text="Print intake/estimate, right-click to send text/email" position="top">
        <Pressable_
          onPress={handleIntakePrintPress}
          onRightPress={handleIntakeSendElectronic}
          >
          <Button_
            icon={ICONS.receipt}
            iconSize={35}
            iconStyle={{ paddingHorizontal: 0 }}
            buttonStyle={{ paddingHorizontal: 0, paddingVertical: 0 }}
            onPress={handleIntakePrintPress}
          />
          </Pressable_>
        </Tooltip>

        <Tooltip text={sUploadProgress && !sUploadProgress.done ? "Upload in progress, you may continue work safely" : "View & upload photos to workorder"} position="top">
          <View>
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
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: -3,
                right: -10,
                borderRadius: 8,
                minWidth: 16,
                height: 16,
                justifyContent: "center",
                alignItems: "center",
                paddingHorizontal: 3,
              }}
            >
              <Text
                style={{
                  color: zOpenWorkorder?.media?.length > 0 ? C.red : 'gray',
                  fontSize: 15,
                  fontWeight: "700",
                }}
              >
                {zOpenWorkorder?.media?.length || 0}
              </Text>
            </View>
            {sUploadProgress && (
              <View style={{ position: "absolute", bottom: -2, left: 0, right: 0, height: 4, backgroundColor: gray(0.88), borderRadius: 2, overflow: "hidden" }}>
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
                  <View
                    style={{
                      width: "100%",
                      height: "100%",
                      backgroundColor: sUploadProgress.failed > 0 ? C.red : C.green,
                      borderRadius: 2,
                    }}
                  />
                )}
              </View>
            )}
          </View>
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
      </View>
      {sShowMediaModal && (
        <WorkorderMediaModal
          visible={sShowMediaModal}
          onClose={() => _setShowMediaModal(false)}
          workorderID={zOpenWorkorder?.id}
          mode="view"
          isDonePaid={isDonePaid}
        />
      )}
      <PrinterAlert
        visible={!!sPrinterAlert}
        x={sPrinterAlert?.x}
        y={sPrinterAlert?.y}
        onDone={() => _setPrinterAlert(null)}
      />
    </View>
  );
};

