/* eslint-disable */

import { View, Text, TextInput, TouchableOpacity } from "react-native-web";
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
  printBuilder,
  removeUnusedFields,
  resolveStatus,
  calculateWaitEstimateLabel,
  findTemplateByType,
  compressImage,
  scheduleAutoText,
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
import ReactDOM from "react-dom";
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
import { dbSavePrintObj, dbTestCustomerPhoneWrite, dbTestCustomerPhoneWriteHTTP, dbUploadWorkorderMedia, dbSendSMS, dbSendEmail, dbUploadPDFAndSendSMS, dbRequestNewId, startNewWorkorder } from "../../../db_calls_wrapper";

const DROPDOWN_SELECTED_OPACITY = 0.3;
const RECEIPT_DROPDOWN_SELECTIONS = [
  RECEIPT_TYPES.intake,
  RECEIPT_TYPES.workorder,
];

export const ActiveWorkorderComponent = ({}) => {
  // store getters ///////////////////////////////////////////////////////////////////
  const zOpenWorkorder = useOpenWorkordersStore((state) => {
    let id = state.workorderPreviewID || state.openWorkorderID;
    return state.workorders.find((o) => o.id === id) || null;
  });
  const zIsPreview = useOpenWorkordersStore((state) => !!state.workorderPreviewID && state.workorderPreviewID !== state.openWorkorderID);
  const zIsLocked = useOpenWorkordersStore((state) => !!state.lockedWorkorderID && state.lockedWorkorderID === (state.workorderPreviewID || state.openWorkorderID));
  const zWorkordersLoaded = useOpenWorkordersStore((state) => state.workordersLoaded);
  const zCustomerRefreshed = useCurrentCustomerStore((state) => state.customerRefreshed);
  const zCustomerLanguage = useCurrentCustomerStore((state) => state.customer?.language || "");
  const zCustomerDeposits = useCurrentCustomerStore((state) => state.customer?.deposits) || [];
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
  const [sShowMediaModal, _setShowMediaModal] = useState(null); // null | "upload" | "view"
  const [sWaitTimeBlink, _setWaitTimeBlink] = useState(false);
  const uploadInputRef = useRef(null);
  const sUploadProgress = useUploadProgressStore((s) => s.progress);
  const [sPendingFiles, _setPendingFiles] = useState(null); // null | File[]
  const [sCompressConfirm, _setCompressConfirm] = useState(true);
  const [sPrinterAlert, _setPrinterAlert] = useState(null); // { x, y }

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

  function handleDirectUpload(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    _setPendingFiles(files);
    _setCompressConfirm(true);
    if (uploadInputRef.current) uploadInputRef.current.value = "";
  }

  function handleCancelUpload() {
    _setPendingFiles(null);
  }

  async function handleConfirmUpload() {
    let files = sPendingFiles;
    let shouldCompress = sCompressConfirm;
    _setPendingFiles(null);
    if (!files?.length) return;
    let total = files.length;
    let completed = 0;
    let failed = 0;
    useUploadProgressStore.getState().setProgress({ completed: 0, total, failed: 0, done: false });
    let newMedia = [...(zOpenWorkorder?.media || [])];
    let storeName = (zSettings?.storeInfo?.displayName || "photo").replace(/\s+/g, "_");
    for (let i = 0; i < files.length; i++) {
      let fileToUpload = files[i];
      let originalFilename = fileToUpload.name;
      let originalFileSize = fileToUpload.size;
      let ext = fileToUpload.name.split(".").pop() || "jpg";
      let rand = Math.floor(1000 + Math.random() * 9000);
      let typeLabel = fileToUpload.type.startsWith("video") ? "Video" : "Image";
      let cleanName = `${storeName}_${typeLabel}_${rand}.${ext}`;
      if (shouldCompress && fileToUpload.type.startsWith("image")) {
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
      const result = await dbUploadWorkorderMedia(zOpenWorkorder.id, fileToUpload, { originalFilename, originalFileSize });
      if (result.success) {
        newMedia.push(result.mediaItem);
        completed++;
      } else {
        failed++;
      }
      useUploadProgressStore.getState().setProgress({ completed, total, failed, done: false });
    }
    useOpenWorkordersStore.getState().setField("media", newMedia, zOpenWorkorder.id);
    useUploadProgressStore.getState().setProgress({ completed, total, failed, done: true });
    setTimeout(() => useUploadProgressStore.getState().setProgress(null), failed > 0 ? 5000 : 3000);
  }

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
    useLoginStore.getState().requireLogin(() => {
      useCurrentCustomerStore.getState().setCustomer(null, false);
      useOpenWorkordersStore.getState().setWorkorderPreviewID(null);
      startNewWorkorder();
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
    useLoginStore.getState().requireLogin(() => {
      startNewWorkorder(customer);
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
    dbSavePrintObj(toPrint, _settings?.selectedPrinterID || "");
  }

  function handleIntakePrintPress(e) {
    let px = e?.nativeEvent?.pageX || e?.pageX;
    let py = e?.nativeEvent?.pageY || e?.pageY;
    if (px && py) _setPrinterAlert({ x: px, y: py });
    const settings = useSettingsStore.getState().getSettings();
    const _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings };

    // Print
    if (settings?.autoPrintIntakeReceipt !== false) {
      let toPrint = printBuilder.intake(
        zOpenWorkorder,
        zCustomer,
        settings?.salesTaxPercent,
        _ctx
      );
      log("INTAKE PRINT OBJ", JSON.stringify(toPrint, null, 2));
      dbSavePrintObj(toPrint, settings?.selectedPrinterID || "");
    }

    // Look up templates
    const smsTemplate = findTemplateByType(settings?.smsTemplates || settings?.textTemplates, "intakeReceipt");
    const emailTemplate = findTemplateByType(settings?.emailTemplates, "intakeReceipt");

    const shouldSMS = settings?.autoSMSIntakeReceipt && zCustomer.customerCell;
    const shouldEmail = settings?.autoEmailIntakeReceipt && zCustomer.email;

    // Check for empty template content
    const smsContent = smsTemplate?.content || smsTemplate?.message || smsTemplate?.text || "";
    const emailContent = emailTemplate?.content || emailTemplate?.body || "";
    let emptyParts = [];
    if (shouldSMS && !smsContent.trim()) emptyParts.push("SMS");
    if (shouldEmail && !emailContent.trim()) emptyParts.push("email");
    if (emptyParts.length > 0) {
      useAlertScreenStore.getState().setValues({
        title: "Empty Template",
        message: "The intake receipt " + emptyParts.join(" and ") + " template is empty. Fill in the template content in Dashboard > " + (emptyParts.includes("SMS") ? "Text Templates" : "Email Templates") + ", or uncheck the auto " + emptyParts.join("/") + " option in Dashboard > Printing.",
        btn1Text: "OK",
        handleBtn1Press: () => useAlertScreenStore.getState().setShowAlert(false),
        canExitOnOuterClick: true,
      });
    }

    // Send only if template has content
    const canSMS = shouldSMS && smsContent.trim();
    const canEmail = shouldEmail && emailContent.trim();
    if (canSMS || canEmail) {
      sendIntakeReceipt(settings, zCustomer, zOpenWorkorder, canSMS ? smsTemplate : null, canEmail ? emailTemplate : null);
    }
  }

  function handleIntakePrintOnly() {
    const settings = useSettingsStore.getState().getSettings();
    const _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings };
    let toPrint = printBuilder.intake(
      zOpenWorkorder,
      zCustomer,
      settings?.salesTaxPercent,
      _ctx
    );
    dbSavePrintObj(toPrint, settings?.selectedPrinterID || "");
  }

  function handleIntakeRightClick() {
    useAlertScreenStore.getState().setValues({
      title: "Print Only",
      message: "Print the intake receipt without sending SMS or email?",
      btn1Text: "Print",
      btn1Icon: ICONS.receipt,
      handleBtn1Press: () => {
        handleIntakePrintOnly();
        useAlertScreenStore.getState().setShowAlert(false);
      },
      btn2Text: "Cancel",
      handleBtn2Press: () => {
        useAlertScreenStore.getState().setShowAlert(false);
      },
      canExitOnOuterClick: true,
    });
  }

  async function sendIntakeReceipt(settings, customer, workorder, smsTemplate, emailTemplate) {
    const { tenantID, storeID } = useSettingsStore.getState().getSettings();
    const firstName = customer?.first || "Customer";
    const storeName = settings?.storeInfo?.displayName || "our store";
    const brand = workorder?.brand || "";
    const description = workorder?.description || "";
    const workorderLink = workorder?.customerPin ? (window.location.origin + "/wo/" + workorder.customerPin) : "";

    function applyVars(template, v) {
      let result = template;
      for (const [key, val] of Object.entries(v)) {
        result = result.replace(new RegExp("\\{" + key + "\\}", "g"), val || "");
      }
      return result;
    }

    // Generate PDF
    let receiptURL = "";
    try {
      const _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings };
      const receiptData = printBuilder.intake(workorder, customer, settings?.salesTaxPercent, _ctx);
      const { generateWorkorderTicketPDF } = await import("../../../pdfGenerator");
      const base64 = generateWorkorderTicketPDF(receiptData);
      const storagePath = build_db_path.cloudStorage.intakeReceiptPDF(workorder.id, tenantID, storeID);

      // SMS — upload PDF and send link in one call
      if (smsTemplate && settings.autoSMSIntakeReceipt && customer.customerCell) {
        const vars = { firstName, storeName, brand, description, link: "{link}", workorderLink };
        const msg = applyVars(smsTemplate.content || smsTemplate.message || smsTemplate.text || "", vars);
        const result = await dbUploadPDFAndSendSMS({
          base64,
          storagePath,
          message: msg,
          phoneNumber: customer.customerCell,
          customerID: workorder?.customerID || "",
          messageID: crypto.randomUUID(),
        });
        if (result?.data?.url) receiptURL = result.data.url;
        log("Sent intake receipt SMS to", customer.customerCell);
      } else {
        // No SMS but still upload PDF for email link
        const { uploadStringToStorage } = await import("../../../db_calls");
        const uploadResult = await uploadStringToStorage(base64, storagePath, "base64");
        if (uploadResult?.downloadURL) receiptURL = uploadResult.downloadURL;
      }
    } catch (e) {
      log("Error generating/uploading intake receipt PDF:", e);
    }

    // Email
    if (emailTemplate && settings.autoEmailIntakeReceipt && customer.email) {
      const linkHtml = receiptURL
        ? "<a href='" + receiptURL + "' style='display:inline-block;padding:12px 24px;background-color:#4CAF50;color:white;text-decoration:none;border-radius:6px;font-size:14px'>View Receipt</a>"
        : "";
      const receiptLink = receiptURL
        ? "<p style='margin:24px 0'>" + linkHtml + "</p>"
        : "";
      const workorderLinkHtml = workorderLink
        ? "<p style='margin:16px 0'><a href='" + workorderLink + "' style='display:inline-block;padding:12px 24px;background-color:#2196F3;color:white;text-decoration:none;border-radius:6px;font-size:14px'>Track Your Workorder</a></p>"
        : "";
      const vars = { firstName, storeName, brand, description, link: linkHtml || receiptURL, receiptLink, workorderLink: workorderLinkHtml || workorderLink };
      const subject = applyVars(emailTemplate.subject || "", vars);
      const html = applyVars(emailTemplate.content || emailTemplate.body || "", vars);
      dbSendEmail(customer.email, subject, html);
      log("Sent intake receipt email to", customer.email);
    }
  }

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "space-between",
        alignItems: "center",
        paddingBottom: 11,
        paddingTop: 5,
        paddingHorizontal: 5,
        backgroundColor: (zIsPreview || zIsLocked)
              ? lightenRGBByPercent(C.lightred, 80)
              : C.backgroundWhite,
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
            let deps = zCustomerDeposits.filter((d) => d.amountCents > 0);
            if (deps.length === 0) return null;
            let totalDeposit = deps.filter((d) => d.type === "deposit").reduce((s, d) => s + d.amountCents, 0);
            let totalCredit = deps.filter((d) => d.type === "credit").reduce((s, d) => s + d.amountCents, 0);
            if (totalDeposit === 0 && totalCredit === 0) return null;
            return (
              <View style={{ flexDirection: "row", justifyContent: "space-between", width: "95%", paddingHorizontal: 5, paddingVertical: 1 }}>
                {totalDeposit > 0 ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <View style={{ backgroundColor: lightenRGBByPercent(C.green, 70), paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                      <Text style={{ fontSize: 10, fontWeight: "600", color: C.green }}>Deposit</Text>
                    </View>
                    <Text style={{ fontSize: 11, fontWeight: "600", color: C.green }}>{formatCurrencyDisp(totalDeposit, true)}</Text>
                  </View>
                ) : <View />}
                {totalCredit > 0 ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <View style={{ backgroundColor: lightenRGBByPercent(C.blue, 70), paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                      <Text style={{ fontSize: 10, fontWeight: "600", color: C.blue }}>Credit</Text>
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
            <Text style={{ fontSize: 11, color: gray(0.5), textAlign: "center" }}>
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

        {(!zWorkordersLoaded || !zCustomerRefreshed) && zOpenWorkorder && (
          <StaleBanner
            text="Waiting on customer refresh...."
            style={{ marginTop: 8, width: "100%" }}
          />
        )}

        <View pointerEvents={isDonePaid ? "none" : "auto"} style={{ width: "100%" }}>
          <View
            style={{
              marginTop: 10,
              borderColor: gray(0.05),
              paddingHorizontal: 8,
              paddingVertical: 8,
              backgroundColor: C.backgroundListWhite,
              borderWidth: 1,
              borderRadius: 5,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-start",
                alignItems: "center",
                width: "100%",
                // backgroundColor: "blue",
              }}
            >
              {/* <View style={{}}> */}
              <TextInput_
                placeholder={"Brand"}
                editable={!isDonePaid}
                style={{
                  width: "45%",
                  borderWidth: 1,
                  borderColor: C.buttonLightGreenOutline,
                  color: C.text,
                  paddingVertical: 2,
                  paddingHorizontal: 4,
                  fontSize: 15,
                  outlineWidth: 0,
                  borderRadius: 5,
                  fontWeight: zOpenWorkorder?.brand ? "500" : null,
                }}
                value={zOpenWorkorder?.brand}
                onChangeText={(val) =>
                  useOpenWorkordersStore.getState().setField("brand", val, zOpenWorkorder.id)
                }
              />
              {/* </View> */}
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
                  style={{
                    width: "48%",
                    height: "100%",
                    // marginTop: 11,
                  }}
                >
                  <DropdownMenu
                    dataArr={zSettings.bikeBrands}
                    enabled={!isDonePaid}
                    onSelect={(item, idx) => {
                      useOpenWorkordersStore.getState().setField("brand", item, zOpenWorkorder.id);
                    }}
                    buttonStyle={{
                      opacity: zOpenWorkorder?.brand
                        ? DROPDOWN_SELECTED_OPACITY
                        : 1,
                    }}
                    modalCoordX={-6}
                    ref={bikesRef}
                    buttonText={zSettings.bikeBrandsName}
                  />
                </View>
                <View style={{ width: 5 }} />
                <View
                  style={{
                    width: "48%",
                    alignItems: null,
                    justifyContent: "center",
                  }}
                >
                  <DropdownMenu
                    dataArr={zSettings.bikeOptionalBrands}
                    enabled={!isDonePaid}
                    onSelect={(item, idx) => {
                      useOpenWorkordersStore.getState().setField("brand", item, zOpenWorkorder.id);
                    }}
                    buttonStyle={{
                      opacity: zOpenWorkorder?.brand
                        ? DROPDOWN_SELECTED_OPACITY
                        : 1,
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

                marginTop: 11,
                // backgroundColor: "blue",
              }}
            >
              <TextInput_
                placeholder={"Model/Description"}
                editable={!isDonePaid}
                style={{
                  width: "45%",
                  borderWidth: 1,
                  borderColor: C.buttonLightGreenOutline,
                  color: C.text,
                  paddingVertical: 2,
                  paddingHorizontal: 4,
                  fontSize: 15,
                  outlineWidth: 0,
                  borderRadius: 5,
                  fontWeight: zOpenWorkorder?.description ? "500" : null,
                }}
                value={zOpenWorkorder?.description}
                onChangeText={(val) => {
                  useOpenWorkordersStore.getState().setField("description", val, zOpenWorkorder.id);
                }}
              />
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
                <View style={{ width: "100%" }}>
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
                    }}
                    // modalCoordinateVars={{ x: 30, y: 30 }}
                    buttonStyle={{
                      opacity: zOpenWorkorder?.description
                        ? DROPDOWN_SELECTED_OPACITY
                        : 1,
                    }}
                    ref={descriptionRef}
                    buttonText={"Descriptions"}
                  />
                </View>
              </View>
            </View>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                width: "45%",
                alignItems: "center",
                width: "100%",
                marginTop: 11,
              }}
            >
              <TextInput_
                placeholder={"Color 1"}
                editable={!isDonePaid}
                value={zOpenWorkorder?.color1.label}
                style={{
                  width: "48%",
                  borderWidth: 1,
                  borderColor: C.buttonLightGreenOutline,
                  paddingVertical: 2,
                  paddingHorizontal: 4,
                  fontSize: 15,
                  outlineWidth: 0,
                  borderRadius: 5,
                  fontWeight: zOpenWorkorder?.color1.label ? "500" : null,
                  backgroundColor: zOpenWorkorder?.color1.backgroundColor,
                  color: zOpenWorkorder?.color1.textColor,
                }}
                onChangeText={(val) => {
                  setBikeColor(val, "color1");
                }}
              />
              <View style={{ width: 5 }} />
              <TextInput_
                placeholder={"Color 2"}
                editable={!isDonePaid}
                value={zOpenWorkorder?.color2.label}
                style={{
                  width: "48%",
                  borderWidth: 1,
                  borderColor: C.buttonLightGreenOutline,
                  paddingVertical: 2,
                  paddingHorizontal: 4,
                  fontSize: 15,
                  outlineWidth: 0,
                  borderRadius: 5,
                  fontWeight: zOpenWorkorder?.color2.label ? "500" : null,
                  backgroundColor: zOpenWorkorder?.color2.backgroundColor,
                  color: zOpenWorkorder?.color2.textColor,
                }}
                onChangeText={(val) => {
                  setBikeColor(val, "color2");
                }}
              />
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
                  style={{
                    width: "48%",
                    height: "100%",
                    justifyContent: "center",
                    // marginTop: 11,
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
                    buttonStyle={{
                      opacity: zOpenWorkorder?.color1
                        ? DROPDOWN_SELECTED_OPACITY
                        : 1,
                    }}
                    ref={color1Ref}
                    buttonText={"Color 1"}
                    modalCoordX={0}
                  />
                </View>
                <View style={{ width: 5 }} />

                <View
                  style={{
                    width: "48%",
                    height: "100%",
                    justifyContent: "center",
                    // marginTop: 11,
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
                    buttonStyle={{
                      opacity: zOpenWorkorder?.color1
                        ? DROPDOWN_SELECTED_OPACITY
                        : 1,
                    }}
                    ref={color2Ref}
                    buttonText={"Color 2"}
                  />
                </View>
              </View>
            </View>
            {(() => {
              const rs = resolveStatus(zOpenWorkorder?.status, zSettings?.statuses);
              return (
                <StatusPickerModal
                  statuses={(zSettings.statuses || []).filter((s) => !s.systemOwned)}
                  enabled={!isDonePaid}
                  onSelect={(val) => {
                    const store = useOpenWorkordersStore.getState();
                    store.setField("status", val.id, zOpenWorkorder.id);
                    // Stamp finishedOnMillis when status is set to "Finished"
                    if (val.id === "33knktg") {
                      store.setField("finishedOnMillis", Date.now(), zOpenWorkorder.id);
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
                  }}
                  buttonStyle={{
                    width: "100%",
                    backgroundColor: rs.backgroundColor,
                    marginTop: 11,
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
              );
            })()}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-start",
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
                  borderColor: C.buttonLightGreenOutline,
                  color: C.text,
                  paddingVertical: 2,
                  paddingHorizontal: 4,
                  fontSize: 15,
                  outlineWidth: 0,
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
                <View style={{ width: "100%" }}>
                  <DropdownMenu
                    modalCoordX={50}
                    dataArr={zSettings.waitTimes}
                    enabled={!isDonePaid}
                    onSelect={(item, idx) => {
                      let isNonRemovable = NONREMOVABLE_WAIT_TIMES.some((nr) => nr.id === item.id);
                      let waitObj = { ...item, removable: !isNonRemovable };
                      useOpenWorkordersStore.getState().setField("waitTime", waitObj, zOpenWorkorder.id);
                    }}
                    buttonStyle={{
                      opacity: zOpenWorkorder?.waitTime?.label
                        ? DROPDOWN_SELECTED_OPACITY
                        : 1,
                    }}
                    ref={waitTimesRef}
                    buttonText={"Wait Times"}
                  />
                </View>
              </View>
            </View>
            {(() => {
              let estimateLabel = calculateWaitEstimateLabel(zOpenWorkorder, useSettingsStore.getState().getSettings());
              let isMissing = estimateLabel === "Missing estimate" || estimateLabel === "No estimate";
              return estimateLabel ? (
                <Text
                  style={{
                    color: gray(0.5),
                    fontSize: 13,
                    fontStyle: "italic",
                    marginTop: 4,
                    width: "100%",
                    backgroundColor: sWaitTimeBlink && isMissing ? "rgba(255, 255, 0, 0.35)" : "transparent",
                    transition: "background-color 300ms ease",
                    borderRadius: 3,
                    paddingHorizontal: 4,
                    paddingVertical: 2,
                  }}
                >
                  {estimateLabel}
                </Text>
              ) : null;
            })()}
          </View>

          <View
            style={{
              marginTop: 11,
              width: "100%",

              // borderColor: gray(0.05),
              paddingHorizontal: 8,
              paddingVertical: 8,
              backgroundColor: gray(0.05),
              // borderWidth: 1,
              borderRadius: 5,
            }}
          >
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
                placeholder={"Part name/description"}
                editable={!isDonePaid}
                style={{
                  width: "100%",
                  borderWidth: 1,
                  borderColor: C.buttonLightGreenOutline,
                  color: C.text,
                  paddingVertical: 2,
                  paddingHorizontal: 4,
                  fontSize: 15,
                  outlineWidth: 0,
                  borderRadius: 5,
                  fontWeight: zOpenWorkorder?.partOrdered ? "500" : null,
                  backgroundColor: C.backgroundWhite,
                }}
                value={zOpenWorkorder?.partOrdered}
                onChangeText={(val) => {
                  useOpenWorkordersStore.getState().setField("partOrdered", val, zOpenWorkorder.id);
                  useOpenWorkordersStore.getState().setField("partOrderedMillis", Date.now(), zOpenWorkorder.id);
                }}
              />
            </View>

            <View
              style={{
                // marginTop: 8,
                flexDirection: "row",
                justifyContent: "flex-start",
                alignItems: "center",
                width: "100%",
                marginTop: 11,
              }}
            >
              <TextInput_
                value={zOpenWorkorder?.partSource}
                placeholder={"Part Source"}
                editable={!isDonePaid}
                style={{
                  width: "50%",
                  borderWidth: 1,
                  borderColor: C.buttonLightGreenOutline,
                  color: C.text,
                  paddingVertical: 2,
                  paddingHorizontal: 4,
                  fontSize: 15,
                  outlineWidth: 0,
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
                <DropdownMenu
                  dataArr={zSettings.partSources}
                  enabled={!isDonePaid}
                  onSelect={(item, idx) => {
                    useOpenWorkordersStore.getState().setField("partSource", item, zOpenWorkorder.id);
                    useOpenWorkordersStore.getState().setField("partOrderedMillis", Date.now(), zOpenWorkorder.id);
                  }}
                  modalCoordX={20}
                  buttonStyle={{
                    opacity: zOpenWorkorder?.brand
                      ? DROPDOWN_SELECTED_OPACITY
                      : 1,
                    paddingHorizontal: 40,
                  }}
                  ref={partSourcesRef}
                  buttonText={"Part Sources"}
                />
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
              <View style={{ flexDirection: "row", alignItems: "center", opacity: zOpenWorkorder?.partToBeOrdered ? 0.35 : 1 }}>
                <Text style={{ fontSize: 13, color: gray(0.45), marginRight: 8 }}>
                  Est. delivery
                </Text>
                <TouchableOpacity
                  disabled={isDonePaid || !!zOpenWorkorder?.partToBeOrdered}
                  onPress={() => updateWaitDays(Math.max(0, sWaitDays - 1))}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 4,
                    backgroundColor: (isDonePaid || zOpenWorkorder?.partToBeOrdered) ? gray(0.85) : C.buttonLightGreen,
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
                  disabled={isDonePaid || !!zOpenWorkorder?.partToBeOrdered}
                  onPress={() => updateWaitDays(sWaitDays + 1)}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 4,
                    backgroundColor: (isDonePaid || zOpenWorkorder?.partToBeOrdered) ? gray(0.85) : C.buttonLightGreen,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: gray(0.55), fontSize: 14, fontWeight: "700", marginTop: -1 }}>+</Text>
                </TouchableOpacity>
                {!!zOpenWorkorder?.partOrderEstimateMillis && !zOpenWorkorder?.partToBeOrdered && (
                  <Text style={{ fontSize: 14, color: gray(0.45), marginLeft: 8 }}>
                    {formatMillisForDisplay(zOpenWorkorder.partOrderEstimateMillis)}
                  </Text>
                )}
              </View>
              <CheckBox_
                text="To be ordered"
                isChecked={!!zOpenWorkorder?.partToBeOrdered}
                disabled={isDonePaid}
                onCheck={() => {
                  useOpenWorkordersStore.getState().setField("partToBeOrdered", !zOpenWorkorder?.partToBeOrdered, zOpenWorkorder.id);
                }}
                textStyle={{ fontSize: 12, color: gray(0.55) }}
              />
            </View>
          </View>
        </View>
      </View>
      {/* Media Buttons */}
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        onChange={handleDirectUpload}
        style={{ display: "none" }}
      />
      <style>{`
        @keyframes uploadBarCycle {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
      `}</style>
      <View
        style={{
          backgroundColor: 'transparent',
          borderRadius: 10,
          borderColor: C.listItemBorder,
          borderWidth: 0,
          paddingHorizontal: 25,
          // paddingTop: 4, paddingBottom: 0,
          marginBottom: 0,
          alignItems: "center",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
          <Tooltip text={sUploadProgress && !sUploadProgress.done ? "Upload in progress, you may continue work safely" : "Upload photo"} position="top">
            <Button_
              icon={ICONS.uploadCamera}
              iconSize={40}
              disabled={isDonePaid}
              onPress={() => !isDonePaid && uploadInputRef.current?.click()}
              buttonStyle={{
                backgroundColor: "transparent",
                paddingHorizontal: 0,
                paddingVertical: 0,
                opacity: isDonePaid ? 0.3 : 1,
              }}
            />
          </Tooltip>
          <View>
            <Tooltip text={sUploadProgress && !sUploadProgress.done ? "Upload in progress, you may continue work safely" : "View photos"} position="top">
              <Button_
                icon={ICONS.viewPhoto}
                iconSize={50}
                onPress={() => _setShowMediaModal("view")}
                buttonStyle={{
                  backgroundColor: "transparent",
                  paddingHorizontal: 0,
                  paddingVertical: 0,
                }}
              />
            </Tooltip>
            {/* {zOpenWorkorder?.media?.length > 0 && ( */}
              <View
                style={{
                  position: "absolute",
                  top: -1,
                  right: -5,
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
            {/* )} */}
          </View>
        </View>
        {/* Upload progress bar */}
        {sUploadProgress && (
          <Tooltip text={!sUploadProgress.done ? "Upload in progress, you may continue work safely" : ""} position="bottom" style={{ alignSelf: "stretch" }}>
            <View style={{ flexDirection: "row", alignItems: "center", width: "100%", paddingBottom: 4 }}>
              <Text style={{ fontSize: 11, color: sUploadProgress.done ? (sUploadProgress.failed > 0 ? C.red : C.green) : gray(0.45), fontWeight: "700", marginRight: 6 }}>
                {sUploadProgress.completed}/{sUploadProgress.total}
              </Text>
              <View style={{ flex: 1, height: 4, backgroundColor: gray(0.88), borderRadius: 2, overflow: "hidden" }}>
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
            </View>
          </Tooltip>
        )}
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
          paddingHorizontal: 10,
        }}
      >
        <Tooltip text="New Workorder" position="top">
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
        <Pressable_
          onPress={handleIntakePrintPress}
          onRightPress={handleIntakeRightClick}
          tooltip="Send intake receipt. Right-click to print only"
        >
          <Button_
            icon={ICONS.receipt}
            iconSize={35}
            iconStyle={{ paddingHorizontal: 0 }}
            buttonStyle={{ paddingHorizontal: 0, paddingVertical: 0 }}
            onPress={handleIntakePrintPress}
          />
        </Pressable_>
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
      {/* Upload confirmation modal */}
      {sPendingFiles && ReactDOM.createPortal(
        <View
          style={{
            position: "fixed",
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 9999,
          }}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={handleCancelUpload}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, cursor: "default" }}
          />
          <View
            style={{
              width: 624,
              backgroundColor: C.backgroundWhite,
              borderRadius: 12,
              borderWidth: 2,
              borderColor: C.buttonLightGreenOutline,
              padding: 20,
            }}
          >
            <Text style={{ fontSize: 14, color: C.text, marginBottom: 10, lineHeight: 20, textAlign: "center" }}>
              Compression is set to medium. Only uncheck the box if you need high zoom capability, as the process takes drastically longer. Recommendation: first try the compressed image to see if it's good enough before using the uncompressed option.
            </Text>
            {sPendingFiles.map((f, idx) => (
              <Text key={idx} style={{ fontSize: 12, color: gray(0.45), textAlign: "center" }}>
                {f.name} — {f.size < 1048576 ? (f.size / 1024).toFixed(0) + " KB" : (f.size / 1048576).toFixed(1) + " MB"}
              </Text>
            ))}
            <View style={{ height: 14 }} />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <CheckBox_
                text="Medium compression"
                isChecked={sCompressConfirm}
                onCheck={() => _setCompressConfirm(!sCompressConfirm)}
              />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Button_
                  text="Upload"
                  colorGradientArr={COLOR_GRADIENTS.green}
                  onPress={handleConfirmUpload}
                  buttonStyle={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 5 }}
                  textStyle={{ fontSize: 14 }}
                />
                <Button_
                  text="Cancel"
                  colorGradientArr={COLOR_GRADIENTS.grey}
                  onPress={handleCancelUpload}
                  buttonStyle={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 5 }}
                  textStyle={{ fontSize: 14 }}
                />
              </View>
            </View>
          </View>
        </View>,
        document.body
      )}
      {sShowMediaModal && (
        <WorkorderMediaModal
          visible={!!sShowMediaModal}
          onClose={() => _setShowMediaModal(null)}
          workorderID={zOpenWorkorder?.id}
          mode={sShowMediaModal}
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

