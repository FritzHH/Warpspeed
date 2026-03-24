/* eslint-disable */

import { View, Text, TextInput, TouchableOpacity } from "react-native-web";
import {
  capitalizeFirstLetterOfString,
  checkInputForNumbersOnly,
  formatMillisForDisplay,
  formatPhoneWithDashes,
  createNewWorkorder,
  generateRandomID,
  generateUPCBarcode,
  gray,
  lightenRGBByPercent,
  log,
  printBuilder,
  removeUnusedFields,
  resolveStatus,
  calculateWaitEstimateLabel,
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
} from "../../../data";
import { MILLIS_IN_DAY } from "../../../constants";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { cloneDeep } from "lodash";
import {
  useCurrentCustomerStore,
  useOpenWorkordersStore,
  useLoginStore,
  useSettingsStore,
  useTabNamesStore,
  useAlertScreenStore,
} from "../../../stores";
import { CustomerInfoScreenModalComponent } from "../modal_screens/CustomerInfoModalScreen";
import { WorkorderMediaModal } from "../modal_screens/WorkorderMediaModal";
import { dbSavePrintObj, dbTestCustomerPhoneWrite, dbTestCustomerPhoneWriteHTTP, dbUploadWorkorderMedia, dbSendSMS, dbSendEmail } from "../../../db_calls_wrapper";

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
    let needsBlink = statusObj?.requireWaitTime && waitLabel.length <= 3;
    if (!needsBlink) {
      _setWaitTimeBlink(false);
      return;
    }
    _setWaitTimeBlink(true);
    let interval = setInterval(() => {
      _setWaitTimeBlink((prev) => !prev);
    }, 500);
    return () => clearInterval(interval);
  }, [zOpenWorkorder?.status, zOpenWorkorder?.waitTime?.label, zSettings?.statuses]);

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

  async function handleDirectUpload(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    let newMedia = [...(zOpenWorkorder?.media || [])];
    for (let i = 0; i < files.length; i++) {
      const result = await dbUploadWorkorderMedia(zOpenWorkorder.id, files[i]);
      if (result.success) newMedia.push(result.mediaItem);
    }
    useOpenWorkordersStore.getState().setField("media", newMedia, zOpenWorkorder.id);
    if (uploadInputRef.current) uploadInputRef.current.value = "";
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
      let store = useOpenWorkordersStore.getState();
      store.setWorkorderPreviewID(null);
      let existing = store.workorders.find((o) => o.isStandaloneSale);

      if (existing) {
        let elapsed = Date.now() - (existing.lastInteractionMillis || existing.startedOnMillis || 0);
        if (elapsed > 5 * 60 * 1000) {
          store.removeWorkorder(existing.id);
        } else {
          store.setOpenWorkorderID(existing.id);
          useTabNamesStore.getState().setItems({
            infoTabName: TAB_NAMES.infoTab.checkout,
            itemsTabName: TAB_NAMES.itemsTab.workorderItems,
            optionsTabName: TAB_NAMES.optionsTab.inventory,
          });
          return;
        }
      }

      let wo = cloneDeep(WORKORDER_PROTO);
      wo.isStandaloneSale = true;
      wo.id = generateUPCBarcode();
      wo.startedBy = useLoginStore.getState().currentUser?.id;
      wo.startedOnMillis = new Date().getTime();

      useOpenWorkordersStore.getState().setWorkorder(wo);
      useOpenWorkordersStore.getState().setOpenWorkorderID(wo.id);
      useTabNamesStore.getState().setItems({
        infoTabName: TAB_NAMES.infoTab.checkout,
        itemsTabName: TAB_NAMES.itemsTab.workorderItems,
        optionsTabName: TAB_NAMES.optionsTab.inventory,
      });
    });
  }

  function handleNewWorkorderPress() {
    useOpenWorkordersStore.getState().setOpenWorkorderID(null);
    useTabNamesStore.getState().setItems({
      infoTabName: TAB_NAMES.infoTab.customer,
      itemsTabName: TAB_NAMES.itemsTab.empty,
      optionsTabName: TAB_NAMES.optionsTab.workorders,
    });
    useCurrentCustomerStore.getState().setCustomer(null);
  }

  function handleCustomerNewWorkorderPress(customer) {
    useLoginStore.getState().requireLogin(() => {
      _setShowCustomerInfoScreen(false);
      let _currentUser = useLoginStore.getState().currentUser;
      let wo = createNewWorkorder({
        customerID: customer.id,
        customerFirst: customer.first,
        customerLast: customer.last,
        customerCell: customer.customerCell || customer.customerLandline,
        customerLandline: customer.customerLandline,
        customerEmail: customer.email,
        customerContactRestriction: customer.contactRestriction,
        startedByFirst: _currentUser?.first,
        startedByLast: _currentUser?.last,
        status: SETTINGS_OBJ.statuses[0]?.id || "",
      });
      useOpenWorkordersStore.getState().setWorkorder(wo, false);
      useOpenWorkordersStore.getState().setOpenWorkorderID(wo.id);
    });
  }

  function handleWorkorderPrintPress() {
    let toPrint = printBuilder.workorder(
      zOpenWorkorder,
      zCustomer,
      useSettingsStore.getState().settings?.salesTaxPercent
    );
    log("Print object:", JSON.stringify(toPrint, null, 2));
    dbSavePrintObj(toPrint, "8C:77:3B:60:33:22_Star MCP31");
  }

  function handleIntakePrintPress() {
    const settings = useSettingsStore.getState().getSettings();

    // Print
    if (settings?.autoPrintIntakeReceipt !== false) {
      let toPrint = printBuilder.intake(
        zOpenWorkorder,
        zCustomer,
        settings?.salesTaxPercent
      );
      dbSavePrintObj(toPrint, "8C:77:3B:60:33:22_Star MCP31");
    }

    // SMS — only if enabled in settings and customer has a phone number
    if (settings?.autoSMSIntakeReceipt && zCustomer.customerCell) {
      sendIntakeReceipt(settings, zCustomer, zOpenWorkorder, "sms");
    }

    // Email — only if enabled in settings and customer has an email
    if (settings?.autoEmailIntakeReceipt && zCustomer.email) {
      sendIntakeReceipt(settings, zCustomer, zOpenWorkorder, "email");
    }
  }

  function sendIntakeReceipt(settings, customer, workorder, channel) {
    const firstName = customer?.first || "Customer";
    const storeName = settings?.storeName || "our store";
    const brand = workorder?.brand || "";
    const description = workorder?.model || workorder?.description || "";
    const vars = { firstName, storeName, brand, description };

    function applyTemplate(template, v) {
      let result = template;
      for (const [key, val] of Object.entries(v)) {
        result = result.replace(new RegExp("\\{" + key + "\\}", "g"), val || "");
      }
      return result;
    }

    if (channel === "sms") {
      const msg = applyTemplate(
        settings.intakeReceiptMessage || "Hi {firstName}, your intake receipt for your {brand} {description} is ready. Thank you for choosing {storeName}!",
        vars
      );
      dbSendSMS({
        message: msg,
        phoneNumber: customer.customerCell,
        customerID: workorder?.customerID || "",
        id: generateRandomID(),
        canRespond: false,
      });
      log("Sent intake receipt SMS to", customer.customerCell);
    }

    if (channel === "email") {
      const subject = applyTemplate(
        settings.intakeReceiptEmailSubject || "Your intake receipt from {storeName}",
        vars
      );
      const html = applyTemplate(
        settings.intakeReceiptEmailTemplate || "<div style='font-family:Arial,sans-serif;max-width:500px;margin:0 auto'><p>Hi {firstName},</p><p>Your intake receipt for your {brand} {description} is ready.</p><p>Thank you for choosing {storeName}!</p></div>",
        vars
      );
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
        backgroundColor: zIsPreview ? lightenRGBByPercent(C.lightred, 80) : C.backgroundWhite,
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
                paddingVertical: 5,
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

        <View pointerEvents={isDonePaid ? "none" : "auto"} style={{ width: "100%" }}>
          <View
            style={{
              marginTop: 20,
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
                  statuses={zSettings.statuses}
                  enabled={!isDonePaid}
                  onSelect={(val) => {
                    const store = useOpenWorkordersStore.getState();
                    store.setField("status", val.id, zOpenWorkorder.id);
                    // Auto-populate linked wait time if one is configured for this status
                    const linked = zSettings?.waitTimeLinkedStatus?.[val.id];
                    if (linked) {
                      store.setField("waitTime", linked, zOpenWorkorder.id);
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
                    ...WAIT_TIMES_PROTO,
                    id: zOpenWorkorder?.waitTime?.id || generateRandomID(),
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
              let estimateLabel = calculateWaitEstimateLabel(zOpenWorkorder);
              return estimateLabel ? (
                <Text style={{ color: gray(0.5), fontSize: 13, fontStyle: "italic", marginTop: 4, width: "100%" }}>
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
                placeholder={"Part Ordered"}
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

            {/* Estimated wait days picker */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                width: "100%",
                marginTop: 11,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ fontSize: 13, color: gray(0.45), marginRight: 8 }}>
                  Estimated delivery
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
                {!!zOpenWorkorder?.partOrderEstimateMillis && (
                  <Text style={{ fontSize: 14, color: gray(0.45), marginLeft: 8 }}>
                    {formatMillisForDisplay(zOpenWorkorder.partOrderEstimateMillis)}
                  </Text>
                )}
              </View>
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
      <View
        style={{
          flexDirection: "row",
          justifyContent: "center",
          backgroundColor: C.backgroundListWhite,
          alignItems: "center",
          borderRadius: 5,
          borderColor: C.listItemBorder,
          borderWidth: 1,
          paddingHorizontal: 25,
          borderRadius: 10,
          paddingVertical: 4,
          marginBottom: 8,
        }}
      >
        <Tooltip text="Upload photo" position="top">
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
          <Tooltip text="View photos" position="top">
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
              // backgroundColor: C.backgroundWhite,
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
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          width: "100%",
          alignItems: "center",
          borderRadius: 5,
          borderColor: C.listItemBorder,
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
          />
        </Tooltip>
        <Tooltip text="Print intake receipt" position="top">
          <Button_
            icon={ICONS.receipt}
            iconSize={35}
            iconStyle={{ paddingHorizontal: 0 }}
            buttonStyle={{ paddingHorizontal: 0, paddingVertical: 0 }}
            onPress={handleIntakePrintPress}
          />
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
          visible={!!sShowMediaModal}
          onClose={() => _setShowMediaModal(null)}
          workorderID={zOpenWorkorder?.id}
          mode={sShowMediaModal}
        />
      )}
    </View>
  );
};

