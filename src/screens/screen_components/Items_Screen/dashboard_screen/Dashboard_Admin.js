/*eslint-disable*/
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  Modal,
} from "react-native-web";
import {
  formatPhoneWithDashes,
  bestForegroundHex,
  checkInputForNumbersOnly,
  clog,
  formatCurrencyDisp,
  formatMillisForDisplay,
  searchInventory,
  generateRandomID,
  generateTimesForListDisplay,
  generateEAN13Barcode,
  getNextID,
  getDayOfWeekFrom0To7Input,
  log,
  gray,
  moveItemInArr,
  NUMS,
  removeDashesFromPhone,
  dollarsToCents,
  capitalizeFirstLetterOfString,
  printBuilder,
  calculateRunningTotals,
  localStorageWrapper,
} from "../../../../utils";
import {
  // useDatabaseStore,
  useAlertScreenStore,
  useInventoryStore,
  useLoginStore,
  useOpenWorkordersStore,
  useSettingsStore,
  useTabNamesStore,
  useStripePaymentStore,
  useMigrationStore,
} from "../../../../stores";
import {
  Button,
  Button_,
  CheckBox_,
  DropdownMenu,
  Image_,
  ModalDropdown,
  NumberSpinner_,
  ScreenModal,
  TextInput_,
  TimePicker_,
  TimeSpinner,
  Tooltip,
  StatusPickerModal,
} from "../../../../components";
import { cloneDeep, set, debounce } from "lodash";
import { Children, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FaceEnrollModalScreen } from "../../modal_screens/FaceEnrollModalScreen";
import { C, COLOR_GRADIENTS, Fonts, ICONS } from "../../../../styles";
import { DISCOUNT_TYPES, PERMISSION_LEVELS, build_db_path } from "../../../../constants";
import { APP_USER, INTAKE_BUTTON_PROTO, INTAKE_QUICK_BUTTON_PROTO, SETTINGS_OBJ, STATUS_AUTO_TEXT_PROTO, TIME_PUNCH_PROTO } from "../../../../data";
import { UserClockHistoryModal } from "../../modal_screens/UserClockHistoryModalScreen";
import { useCallback } from "react";
import { ColorWheel } from "../../../../ColorWheel";
import { SalesReportsModal } from "../../modal_screens/SalesReports";
import { PayrollModal } from "../../modal_screens/PayrollModal";
import { dbSaveSettingsField, dbSaveSettings, dbListenToDevLogs, dbSaveOpenWorkorder, dbSaveCompletedWorkorder, dbSaveCompletedSale, dbSaveActiveSale, dbSaveCustomer, dbRehydrateFromArchive, dbSavePunchObject, dbSavePrintObj, dbBatchWrite, dbClearCollection } from "../../../../db_calls_wrapper";
import { mapCustomers, mapWorkorders, mapSales, mapStatuses, extractStatusesFromWorkorders, parseCSV } from "../../../../lightspeed_import";
import { lightspeedInitiateAuthCallable, lightspeedImportDataCallable, firestoreRead, firestoreQuery, firestoreDelete, firestoreWrite, firestoreBatchWrite } from "../../../../db_calls";
import { DB_NODES } from "../../../../constants";
import { newCheckoutGetStripeReaders } from "../../modal_screens/newCheckoutModalScreen/newCheckoutFirebaseCalls";

const TAB_NAMES = {
  users: "User Control",
  payments: "Payments/Printers",
  statuses: "Workorder Statuses",
  lists: "Lists & Options",
  waitTimes: "Wait Times",
  storeInfo: "Store Info",
  quickItems: "Quick Item Buttons",
  intakeButtons: "Intake Buttons",
  standButtons: "Stand Buttons",
  sales: "Sales Reports",
  payroll: "Payroll",
  ordering: "Ordering",
  textTemplates: "Text Templates",
  emailTemplates: "Email Templates",
  blockedNumbers: "Blocked Numbers",
  import: "Import",
  backup: "Backup & Recovery",
};

const DROPDOWN_ORDERING_SELECTION_NAMES = {
  importOrder: "Import Order",
  viewPreviousOrders: "View Previous Orders",
};

export function Dashboard_Admin({}) {
  // store getters ///////////////////////////////////////////////////////////
  const zSettingsObj = useSettingsStore((state) => state.settings);
  const zLiveReaders = useStripePaymentStore((state) => state.readersArr) || [];
  // local state ///////////////////////////////////////////////////////////
  const [sFacialRecognitionModalUserObj, _setFacialRecognitionModalUserObj] =
    useState(false);
  const [sPunchClockUserObj, _setPunchClockUserObj] = useState(null);
  const [sShowSalesReportModal, _setShowSalesReportModal] = useState(false);
  const [sShowPayrollModal, _setShowPayrollModal] = useState(false);
  const sExpand = useTabNamesStore((state) => state.getDashboardExpand());
  const _setExpand = useTabNamesStore((state) => state.setDashboardExpand);
  const [sOrderingMenuSelectionName, _setOrderingMenuSelectionName] = useState(
    DROPDOWN_ORDERING_SELECTION_NAMES.importOrder
  );
  const [sIntakeEditButtonObj, _setIntakeEditButtonObj] = useState(null);
  const [sStandEditButtonObj, _setStandEditButtonObj] = useState(null);

  //////////////////////////////////////////////////////////////////////////

  // Per-field debounced DB saves (500ms). Store updates are immediate.
  const debouncedDBSavesRef = useRef({});
  function debouncedDBSave(fieldName, fieldValue) {
    if (!debouncedDBSavesRef.current[fieldName]) {
      debouncedDBSavesRef.current[fieldName] = debounce((val) => {
        useSettingsStore.getState().setField(fieldName, val);
      }, 500);
    }
    debouncedDBSavesRef.current[fieldName](fieldValue);
  }

  function cancelDebouncedDBSave(fieldName) {
    if (debouncedDBSavesRef.current[fieldName]) {
      debouncedDBSavesRef.current[fieldName].cancel();
    }
  }

  function commitUserInfoChange(userObj, sNewUserObj) {
    let userArr;
    if (sNewUserObj) {
      userArr = [userObj, ...zSettingsObj.users];
    } else {
      userArr = zSettingsObj.users.map((o) => {
        if (o.id === userObj.id) return userObj;
        return o;
      });
    }

    useSettingsStore.getState().setField("users", userArr, false);
    debouncedDBSave("users", userArr);
  }

  function handleRemoveUserPress(userObj) {
    cancelDebouncedDBSave("users");
    let userArr = zSettingsObj.users.filter((o) => o.id != userObj.id);
    useSettingsStore.getState().setField("users", userArr);
  }

  function handleDescriptorCapture(userObj, desc) {
    cancelDebouncedDBSave("users");
    let userArr = zSettingsObj.users.map((o) => {
      if (o.id === userObj.id) {
        return { ...o, faceDescriptor: desc };
      }
      return o;
    });
    useSettingsStore.getState().setField("users", userArr);
  }

  function handleSettingsFieldChange(fieldName, fieldValue) {
    useSettingsStore.getState().setField(fieldName, fieldValue, false);
    debouncedDBSave(fieldName, fieldValue);
  }

  //////////////////////////////////////////////////////////////////////////
  // Main component /////////////////////////////////////////////////////////
  let OuterWrapper = sExpand === TAB_NAMES.quickItems ? View : ScrollView;
  return (
    <OuterWrapper
      style={{
        padding: 0,
        paddingTop: 20,
        flex: sExpand === TAB_NAMES.quickItems ? 1 : undefined,
      }}
    >
      {/**Modals that will appear when user takes an action */}
      {!!sFacialRecognitionModalUserObj && (
        <FaceEnrollModalScreen
          userObj={sFacialRecognitionModalUserObj}
          handleDescriptorCapture={handleDescriptorCapture}
          handleExitPress={() => _setFacialRecognitionModalUserObj(null)}
        />
      )}
      {!!sPunchClockUserObj && (
        <UserClockHistoryModal
          handleExit={() => _setPunchClockUserObj()}
          userObj={sPunchClockUserObj}
        />
      )}
      {!!sShowSalesReportModal && (
        <SalesReportsModal handleExit={() => _setShowSalesReportModal(false)} />
      )}
      {!!sShowPayrollModal && (
        <PayrollModal handleExit={() => _setShowPayrollModal(false)} />
      )}
      {!!sIntakeEditButtonObj && (
        <IntakeButtonEditModal
          buttonObj={sIntakeEditButtonObj}
          onClose={() => _setIntakeEditButtonObj(null)}
          onSave={(updatedBtn) => {
            let updated = (zSettingsObj?.intakeButtons || []).map((o) =>
              o.id === updatedBtn.id ? updatedBtn : o
            );
            handleSettingsFieldChange("intakeButtons", updated);
            _setIntakeEditButtonObj(null);
          }}
        />
      )}
      {!!sStandEditButtonObj && (
        <StandButtonInventoryModal
          buttonObj={sStandEditButtonObj}
          onClose={() => _setStandEditButtonObj(null)}
          onSave={(updatedBtn) => {
            let rows = zSettingsObj?.intakeQuickButtons || [];
            let updatedRows = rows.map((row) =>
              row.map((btn) => (btn.id === updatedBtn.id ? updatedBtn : btn))
            );
            handleSettingsFieldChange("intakeQuickButtons", updatedRows);
            _setStandEditButtonObj(null);
          }}
        />
      )}

      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          paddingHorizontal: 5,
          flex: sExpand === TAB_NAMES.quickItems ? 1 : undefined,
        }}
      >
        {/*********************left-side column container *****************/}
        <View style={{ width: "30%" }}>
          <View
            style={{
              width: "100%",
              alignItems: "flex-start",
              borderRadius: 5,
              paddingRight: 10,
              paddingLeft: 5,
              backgroundColor: C.backgroundListWhite,
              borderColor: C.buttonLightGreenOutline,
              borderWidth: 1,
              paddingTop: 13,
              paddingBottom: 13,
            }}
          >
            {/************************* settings list names ****************** */}
            <MenuListLabelComponent
              selected={sExpand === TAB_NAMES.quickItems}
              handleExpandPress={() =>
                _setExpand(
                  sExpand === TAB_NAMES.quickItems ? null : TAB_NAMES.quickItems
                )
              }
              text={TAB_NAMES.quickItems}
              icon={ICONS.quickItemButton}
              style={{
                fontWeight: sExpand === TAB_NAMES.quickItems ? 500 : null,
                color: sExpand === TAB_NAMES.quickItems ? C.green : gray(0.6),
              }}
            />
            <VerticalSpacer />
            <MenuListLabelComponent
              selected={sExpand === TAB_NAMES.intakeButtons}
              handleExpandPress={() =>
                _setExpand(
                  sExpand === TAB_NAMES.intakeButtons
                    ? null
                    : TAB_NAMES.intakeButtons
                )
              }
              text={TAB_NAMES.intakeButtons}
              icon={ICONS.bicycle}
              style={{
                fontWeight: sExpand === TAB_NAMES.intakeButtons ? 500 : null,
                color:
                  sExpand === TAB_NAMES.intakeButtons ? C.green : gray(0.6),
              }}
            />
            <VerticalSpacer />
            <MenuListLabelComponent
              selected={sExpand === TAB_NAMES.standButtons}
              handleExpandPress={() =>
                _setExpand(
                  sExpand === TAB_NAMES.standButtons
                    ? null
                    : TAB_NAMES.standButtons
                )
              }
              text={TAB_NAMES.standButtons}
              icon={ICONS.tools1}
              style={{
                fontWeight: sExpand === TAB_NAMES.standButtons ? 500 : null,
                color:
                  sExpand === TAB_NAMES.standButtons ? C.green : gray(0.6),
              }}
            />
            <VerticalSpacer />
            <MenuListLabelComponent
              selected={sExpand === TAB_NAMES.users}
              handleExpandPress={() =>
                _setExpand(sExpand === TAB_NAMES.users ? null : TAB_NAMES.users)
              }
              text={TAB_NAMES.users}
              icon={ICONS.userControl}
              style={{
                fontWeight: sExpand === TAB_NAMES.users ? 500 : null,
                color: sExpand === TAB_NAMES.users ? C.green : gray(0.6),
              }}
            />
            <VerticalSpacer />
            <MenuListLabelComponent
              selected={sExpand === TAB_NAMES.payments}
              handleExpandPress={() => {
                let opening = sExpand !== TAB_NAMES.payments;
                _setExpand(opening ? TAB_NAMES.payments : null);
                if (opening) {
                  newCheckoutGetStripeReaders().then((result) => {
                    let arr = result?.data?.data || [];
                    useStripePaymentStore.getState().setReadersArr(arr);
                  }).catch(() => { });
                }
              }}
              text={TAB_NAMES.payments}
              icon={ICONS.paymentProcessing}
              style={{
                fontWeight: sExpand === TAB_NAMES.payments ? 500 : null,

                color: sExpand === TAB_NAMES.payments ? C.green : gray(0.6),
              }}
            />
            <VerticalSpacer />
            <MenuListLabelComponent
              selected={sExpand === TAB_NAMES.statuses}
              handleExpandPress={() =>
                _setExpand(
                  sExpand === TAB_NAMES.statuses ? null : TAB_NAMES.statuses
                )
              }
              text={TAB_NAMES.statuses}
              icon={ICONS.workorderStatuses}
              style={{
                fontWeight: sExpand === TAB_NAMES.statuses ? 500 : null,

                color: sExpand === TAB_NAMES.statuses ? C.green : gray(0.6),
              }}
            />
            <VerticalSpacer />
            <MenuListLabelComponent
              selected={sExpand === TAB_NAMES.lists}
              handleExpandPress={() =>
                _setExpand(sExpand === TAB_NAMES.lists ? null : TAB_NAMES.lists)
              }
              icon={ICONS.listsAndOptions}
              style={{
                fontWeight: sExpand === TAB_NAMES.lists ? 500 : null,

                color: sExpand === TAB_NAMES.lists ? C.green : gray(0.6),
              }}
              text={TAB_NAMES.lists}
            />
            <VerticalSpacer />
            <MenuListLabelComponent
              selected={sExpand === TAB_NAMES.storeInfo}
              handleExpandPress={() =>
                _setExpand(
                  sExpand === TAB_NAMES.storeInfo ? null : TAB_NAMES.storeInfo
                )
              }
              icon={ICONS.storeInfo}
              style={{
                fontWeight: sExpand === TAB_NAMES.storeInfo ? 500 : null,
                color: sExpand === TAB_NAMES.storeInfo ? C.green : gray(0.6),
              }}
              text={TAB_NAMES.storeInfo}
            />
            <VerticalSpacer />
            {/****************** sales report modal *****************************/}
            <MenuListLabelComponent
              selected={sExpand === TAB_NAMES.sales}
              handleExpandPress={() => _setShowSalesReportModal(true)}
              style={{
                fontWeight: sExpand === TAB_NAMES.sales ? 500 : null,
                color: sExpand === TAB_NAMES.sales ? C.green : gray(0.6),
              }}
              text={TAB_NAMES.sales}
              icon={ICONS.dollarYellow}
              iconSize={25}
            />
            <VerticalSpacer />
            {/****************** payroll modal *****************************/}
            <MenuListLabelComponent
              selected={sExpand === TAB_NAMES.payroll}
              handleExpandPress={() => _setShowPayrollModal(true)}
              style={{
                fontWeight: sExpand === TAB_NAMES.payroll ? 500 : null,
                color: sExpand === TAB_NAMES.payroll ? C.green : gray(0.6),
              }}
              text={TAB_NAMES.payroll}
              icon={ICONS.greenDollar}
              iconSize={25}
            />
            <VerticalSpacer />
            {/****************** ordering tab***********************************/}
            <MenuListLabelComponent
              selected={sExpand === TAB_NAMES.ordering}
              handleExpandPress={() =>
                _setExpand(
                  sExpand === TAB_NAMES.ordering ? null : TAB_NAMES.ordering
                )
              }
              style={{
                fontWeight: sExpand === TAB_NAMES.ordering ? 500 : null,
                color: sExpand === TAB_NAMES.ordering ? C.green : gray(0.6),
              }}
              text={TAB_NAMES.ordering}
              icon={ICONS.ordering}
            />
            <VerticalSpacer />
            {/****************** text templates tab *****************************/}
            <MenuListLabelComponent
              selected={sExpand === TAB_NAMES.textTemplates}
              handleExpandPress={() =>
                _setExpand(
                  sExpand === TAB_NAMES.textTemplates
                    ? null
                    : TAB_NAMES.textTemplates
                )
              }
              style={{
                fontWeight: sExpand === TAB_NAMES.textTemplates ? 500 : null,
                color:
                  sExpand === TAB_NAMES.textTemplates ? C.green : gray(0.6),
              }}
              text={TAB_NAMES.textTemplates}
              icon={ICONS.notes}
            />
            <VerticalSpacer />
            {/****************** email templates tab *****************************/}
            <MenuListLabelComponent
              selected={sExpand === TAB_NAMES.emailTemplates}
              handleExpandPress={() =>
                _setExpand(
                  sExpand === TAB_NAMES.emailTemplates
                    ? null
                    : TAB_NAMES.emailTemplates
                )
              }
              style={{
                fontWeight: sExpand === TAB_NAMES.emailTemplates ? 500 : null,
                color:
                  sExpand === TAB_NAMES.emailTemplates ? C.green : gray(0.6),
              }}
              text={TAB_NAMES.emailTemplates}
              icon={ICONS.notes}
            />
            <VerticalSpacer />
            {/****************** blocked numbers tab *****************************/}
            <MenuListLabelComponent
              selected={sExpand === TAB_NAMES.blockedNumbers}
              handleExpandPress={() =>
                _setExpand(
                  sExpand === TAB_NAMES.blockedNumbers
                    ? null
                    : TAB_NAMES.blockedNumbers
                )
              }
              style={{
                fontWeight: sExpand === TAB_NAMES.blockedNumbers ? 500 : null,
                color:
                  sExpand === TAB_NAMES.blockedNumbers ? C.green : gray(0.6),
              }}
              text={TAB_NAMES.blockedNumbers}
              icon={ICONS.notes}
            />
            <VerticalSpacer />
            {/****************** import tab *****************************/}
            <MenuListLabelComponent
              selected={sExpand === TAB_NAMES.import}
              handleExpandPress={() =>
                _setExpand(
                  sExpand === TAB_NAMES.import ? null : TAB_NAMES.import
                )
              }
              style={{
                fontWeight: sExpand === TAB_NAMES.import ? 500 : null,
                color: sExpand === TAB_NAMES.import ? C.green : gray(0.6),
              }}
              text={TAB_NAMES.import}
              icon={ICONS.importIcon}
            />
            <VerticalSpacer />
            {/****************** backup & recovery tab *****************************/}
            <MenuListLabelComponent
              selected={sExpand === TAB_NAMES.backup}
              handleExpandPress={() =>
                _setExpand(
                  sExpand === TAB_NAMES.backup ? null : TAB_NAMES.backup
                )
              }
              style={{
                fontWeight: sExpand === TAB_NAMES.backup ? 500 : null,
                color: sExpand === TAB_NAMES.backup ? C.green : gray(0.6),
              }}
              text={TAB_NAMES.backup}
              icon={ICONS.tools}
            />
          </View>
        </View>

        {/*********************right-side column container****************** */}

        <View
          style={{
            width: "70%",
            alignItems: "center",
            flex: sExpand === TAB_NAMES.quickItems ? 1 : undefined,
          }}
        >
          {!sExpand && (<>
            <TouchableOpacity
              onPress={async () => {
                const statusesText = await fetch("/import_data/statuses.csv").then(r => r.text());
                const statuses = mapStatuses(statusesText);
                const settings = { ...cloneDeep(SETTINGS_OBJ), statuses };
                await dbSaveSettings(settings);
                useSettingsStore.getState().setSettings(settings);
              }}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 10,
                borderWidth: 2,
                borderColor: C.buttonLightGreenOutline,
                backgroundColor: C.listItemWhite,
                alignItems: "center",
                justifyContent: "center",
                marginTop: 20,
              }}
            >
              <Text style={{ fontSize: 13, color: C.text, fontWeight: "700" }}>
                Inject Settings
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                let printObj = {
                  id: generateRandomID(),
                  receiptType: "Workorder",
                  barcode: "100000000001",
                  workorderNumber: "WO-10001",
                  customerFirstName: "John",
                  customerLastName: "Smith",
                  customerCell: "239-555-1234",
                  customerEmail: "john.smith@email.com",
                  customerAddress: "123 Main St, Bonita Springs, FL 34135",
                  brand: "Trek",
                  model: "Domane SL 5",
                  description: "Road Bike",
                  color1: "Matte Black",
                  color2: "Red",
                  status: "In Progress",
                  startedBy: "Mike",
                  startedOnDate: "03/20/2026",
                  finishedOnDate: "",
                  subtotal: "$185.00",
                  discount: "$10.00",
                  tax: "$12.25",
                  total: "$187.25",
                  salesTaxPercent: "7%",
                  labor: "$75.00",
                  parts: "$110.00",
                  shopName: "Bonita Bikes LLC",
                  shopContactBlurb: "239-555-0000 | bonitabikes@email.com",
                  thankYouBlurb: "Thank you for choosing Bonita Bikes!",
                  workorderLines: [
                    { qty: 1, inventoryItem: { formalName: "Brake Pad Set - Shimano 105", price: 3500 }, id: "line1" },
                    { qty: 2, inventoryItem: { formalName: "Inner Tube 700x25c", price: 800 }, id: "line2" },
                    { qty: 1, inventoryItem: { formalName: "Chain - KMC X11 Silver", price: 3500 }, id: "line3" },
                    { qty: 1, inventoryItem: { formalName: "Labor - Full Tune Up", price: 7500 }, id: "line4" },
                  ],
                  customerNotes: ["Customer requested rush service", "Pickup after 5pm"],
                  internalNotes: ["Rear derailleur cable frayed — replaced"],
                };
                dbSavePrintObj(printObj, "8C:77:3B:60:33:22_Star MCP31");
              }}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 10,
                borderWidth: 2,
                borderColor: C.buttonLightGreenOutline,
                backgroundColor: C.listItemWhite,
                alignItems: "center",
                justifyContent: "center",
                marginTop: 20,
              }}
            >
              <Text style={{ fontSize: 13, color: C.text, fontWeight: "700" }}>
                Test Print
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={async () => {
                let dayjs = (await import("dayjs")).default;
                let userID = "1234";
                let now = dayjs();
                let startDate = now.subtract(3, "month").startOf("day");
                let endDate = now.startOf("day");
                let current = startDate;
                let allPunches = [];

                while (current.isBefore(endDate) || current.isSame(endDate, "day")) {
                  // 3-7 punch pairs per day
                  let pairCount = 3 + Math.floor(Math.random() * 5);
                  // Spread pairs across 10am-7pm (600 min window)
                  let windowStart = 600; // 10:00 AM in minutes from midnight
                  let windowEnd = 1140;  // 7:00 PM in minutes from midnight
                  let slotSize = Math.floor((windowEnd - windowStart) / pairCount);

                  for (let i = 0; i < pairCount; i++) {
                    let slotStart = windowStart + (i * slotSize);
                    let slotEnd = slotStart + slotSize;
                    // Random in time within first 60% of slot
                    let inMinutes = slotStart + Math.floor(Math.random() * (slotSize * 0.5));
                    // Random out time in last 40% of slot, at least 10 min after in
                    let outMinutes = Math.min(
                      inMinutes + 10 + Math.floor(Math.random() * (slotSize * 0.4)),
                      slotEnd - 1
                    );
                    if (outMinutes > windowEnd) outMinutes = windowEnd;
                    if (outMinutes <= inMinutes) outMinutes = inMinutes + 10;

                    let inMillis = current.add(inMinutes, "minute").valueOf();
                    let outMillis = current.add(outMinutes, "minute").valueOf();

                    allPunches.push({
                      ...TIME_PUNCH_PROTO,
                      userID,
                      id: generateRandomID(),
                      millis: inMillis,
                      option: "in",
                    });
                    allPunches.push({
                      ...TIME_PUNCH_PROTO,
                      userID,
                      id: generateRandomID(),
                      millis: outMillis,
                      option: "out",
                    });
                  }
                  current = current.add(1, "day");
                }

                log("Injecting " + allPunches.length + " punches for user 1234...");
                let batchSize = 20;
                for (let i = 0; i < allPunches.length; i += batchSize) {
                  let batch = allPunches.slice(i, i + batchSize);
                  await Promise.all(batch.map((p) => dbSavePunchObject(p)));
                }
                log("Done! Injected " + allPunches.length + " punches.");
                alert("Injected " + allPunches.length + " punches for user 1234 (3 months).");
              }}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 10,
                borderWidth: 2,
                borderColor: C.orange,
                backgroundColor: C.listItemWhite,
                alignItems: "center",
                justifyContent: "center",
                marginTop: 10,
              }}
            >
              <Text style={{ fontSize: 13, color: C.orange, fontWeight: "700" }}>
                Inject Test Punches (1234)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={async () => {
                try {
                  const settings = useSettingsStore.getState().getSettings();
                  const { tenantID, storeID } = settings;
                  const _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings };

                  const workorder = SPOOF_WORKORDER;
                  const customer = {
                    first: workorder.customerFirst,
                    last: workorder.customerLast,
                    customerCell: workorder.customerCell,
                    customerLandline: workorder.customerLandline,
                    email: workorder.customerEmail,
                    contactRestriction: workorder.customerContactRestriction,
                  };

                  const totals = calculateRunningTotals(workorder, settings?.salesTaxPercent, [], false, !!workorder.taxFree);
                  const fakeSale = {
                    id: getNextID("sale"),
                    millis: Date.now(),
                    subtotal: totals.runningSubtotal,
                    discount: totals.runningDiscount,
                    tax: totals.runningTax,
                    total: totals.finalTotal,
                    amountCaptured: totals.finalTotal,
                    payments: [],
                    refunds: [],
                    workorderID: workorder.id,
                  };
                  const cardAmount = Math.round(totals.finalTotal * 0.6);
                  const cashAmount = totals.finalTotal - cardAmount;
                  const fakeCardPayment = {
                    amountCaptured: cardAmount,
                    amountTendered: cardAmount,
                    cash: false,
                    last4: "4242",
                    cardType: "Visa",
                    brand: "visa",
                    paymentMethod: "card_present",
                    authorizationCode: "A83F72",
                  };
                  const fakeCashPayment = {
                    amountCaptured: cashAmount,
                    amountTendered: cashAmount + 500,
                    cash: true,
                  };

                  const receiptData = printBuilder.sale(fakeSale, [fakeCardPayment, fakeCashPayment], customer, workorder, settings?.salesTaxPercent, _ctx);
                  log("SPOOF SALE RECEIPT", JSON.stringify(receiptData, null, 2));

                  // Send to thermal printer
                  dbSavePrintObj(receiptData, "8C:77:3B:60:33:22_Star MCP31");

                  // Generate and upload PDF
                  const { generateSaleReceiptPDF } = await import("../../../../pdfGenerator");
                  const base64 = generateSaleReceiptPDF(receiptData);
                  const storagePath = build_db_path.cloudStorage.saleReceiptPDF(fakeSale.id, tenantID, storeID);
                  const { uploadStringToStorage } = await import("../../../../db_calls");
                  const uploadResult = await uploadStringToStorage(base64, storagePath, "base64");
                  if (uploadResult?.downloadURL) {
                    log("Spoof sale PDF uploaded:", uploadResult.downloadURL);
                    window.open(uploadResult.downloadURL, "_blank");
                  } else {
                    useAlertScreenStore.getState().setValues({
                      title: "Spoof Sale Receipt",
                      message: "Sent to printer. PDF upload may have failed.",
                      btn1Text: "OK",
                      handleBtn1Press: () => useAlertScreenStore.getState().setShowAlert(false),
                      canExitOnOuterClick: true,
                    });
                  }
                } catch (e) {
                  log("Spoof sale receipt error:", e);
                  useAlertScreenStore.getState().setValues({
                    title: "Error",
                    message: e.message,
                    btn1Text: "OK",
                    handleBtn1Press: () => useAlertScreenStore.getState().setShowAlert(false),
                    canExitOnOuterClick: true,
                  });
                }
              }}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 10,
                borderWidth: 2,
                borderColor: C.purple,
                backgroundColor: C.listItemWhite,
                alignItems: "center",
                justifyContent: "center",
                marginTop: 10,
              }}
            >
              <Text style={{ fontSize: 13, color: C.purple, fontWeight: "700" }}>
                Spoof Sale Receipt
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={async () => {
                const WO_ID = "049366289294";
                try {
                  const settings = useSettingsStore.getState().getSettings();
                  const { tenantID, storeID } = settings;
                  if (!tenantID || !storeID) { log("Revert: missing tenantID/storeID"); return; }

                  const basePath = `tenants/${tenantID}/stores/${storeID}`;

                  // 1. Find the workorder — check open-workorders first, then completed-workorders
                  let wo = null;
                  let wasCompleted = false;
                  const openPath = `${basePath}/open-workorders/${WO_ID}`;
                  wo = await firestoreRead(openPath);
                  if (!wo) {
                    const completedPath = `${basePath}/completed-workorders/${WO_ID}`;
                    wo = await firestoreRead(completedPath);
                    if (wo) wasCompleted = true;
                  }
                  if (!wo) {
                    log("Revert: workorder not found in open or completed", WO_ID);
                    useAlertScreenStore.getState().setValues({ title: "Revert Failed", message: "Workorder " + WO_ID + " not found.", btn1Text: "OK", handleBtn1Press: () => useAlertScreenStore.getState().setShowAlert(false), canExitOnOuterClick: true });
                    return;
                  }

                  // 2. Delete associated sales (active + completed)
                  let saleIDs = [wo.activeSaleID, wo.saleID, ...(wo.sales || [])].filter(Boolean);
                  let uniqueSaleIDs = [...new Set(saleIDs)];
                  for (let sid of uniqueSaleIDs) {
                    await firestoreDelete(`${basePath}/active-sales/${sid}`).catch(() => {});
                    await firestoreDelete(`${basePath}/completed-sales/${sid}`).catch(() => {});
                  }

                  // 3. Strip payment/sale fields from workorder
                  wo.paymentComplete = false;
                  wo.amountPaid = 0;
                  wo.activeSaleID = "";
                  wo.saleID = "";
                  wo.sales = [];
                  wo.endedOnMillis = "";

                  // 4. Write clean workorder to open-workorders
                  await firestoreWrite(openPath, wo);

                  // 5. Delete from completed-workorders if it was there
                  if (wasCompleted) {
                    await firestoreDelete(`${basePath}/completed-workorders/${WO_ID}`);
                  }

                  // 6. Update local Zustand store
                  useOpenWorkordersStore.getState().setWorkorder(wo, false);

                  log("Revert complete for", WO_ID);
                  useAlertScreenStore.getState().setValues({ title: "Reverted", message: "Workorder " + WO_ID + " reset to fresh state in open-workorders.", btn1Text: "OK", handleBtn1Press: () => useAlertScreenStore.getState().setShowAlert(false), canExitOnOuterClick: true });
                } catch (e) {
                  log("Revert error:", e);
                  useAlertScreenStore.getState().setValues({ title: "Revert Error", message: e.message, btn1Text: "OK", handleBtn1Press: () => useAlertScreenStore.getState().setShowAlert(false), canExitOnOuterClick: true });
                }
              }}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 10,
                borderWidth: 2,
                borderColor: C.red,
                backgroundColor: C.listItemWhite,
                alignItems: "center",
                justifyContent: "center",
                marginTop: 10,
              }}
            >
              <Text style={{ fontSize: 13, color: C.red, fontWeight: "700" }}>
                Revert Sale (049366289294)
              </Text>
            </TouchableOpacity>
          </>)}
          {!!sExpand && (
            <Text
              style={{
                borderColor: C.buttonLightGreenOutline,
                color: gray(0.6),
                marginBottom: 10,
                fontSize: 17,
                fontWeight: 500,
              }}
            >
              {sExpand?.toUpperCase()}
            </Text>
          )}
          {sExpand === TAB_NAMES.payments && (
            <>
              <PaymentProcessingComponent
                zSettingsObj={zSettingsObj}
                handleSettingsFieldChange={handleSettingsFieldChange}
                liveReaders={zLiveReaders}
              />
              <PrintersComponent
                zSettingsObj={zSettingsObj}
                handleSettingsFieldChange={handleSettingsFieldChange}
              />
            </>
          )}
          {sExpand === TAB_NAMES.users && (
            <AppUserListComponent
              handleRemoveUserPress={handleRemoveUserPress}
              zSettingsObj={zSettingsObj}
              commitUserInfoChange={commitUserInfoChange}
              _setFacialRecognitionModalUserObj={
                _setFacialRecognitionModalUserObj
              }
              _setPunchClockUserObj={_setPunchClockUserObj}
              handleSettingsFieldChange={handleSettingsFieldChange}
            />
          )}
          {sExpand === TAB_NAMES.statuses && (
            <WorkorderStatusesComponent
              zSettingsObj={zSettingsObj}
              handleSettingsFieldChange={handleSettingsFieldChange}
            />
          )}
          {sExpand === TAB_NAMES.lists && (
            <ListOptionsComponent
              zSettingsObj={zSettingsObj}
              handleSettingsFieldChange={handleSettingsFieldChange}
            />
          )}
          {sExpand === TAB_NAMES.storeInfo && (
            <StoreInfoComponent
              zSettingsObj={zSettingsObj}
              handleSettingsFieldChange={handleSettingsFieldChange}
            />
          )}
          {sExpand === TAB_NAMES.quickItems && (
            <QuickItemButtonsComponent
              zSettingsObj={zSettingsObj}
              handleSettingsFieldChange={handleSettingsFieldChange}
            />
          )}
          {sExpand === TAB_NAMES.intakeButtons && (
            <IntakeButtonsComponent
              zSettingsObj={zSettingsObj}
              handleSettingsFieldChange={handleSettingsFieldChange}
              _setIntakeEditButtonObj={_setIntakeEditButtonObj}
            />
          )}
          {sExpand === TAB_NAMES.standButtons && (
            <StandButtonsEditorComponent
              zSettingsObj={zSettingsObj}
              handleSettingsFieldChange={handleSettingsFieldChange}
              _setStandEditButtonObj={_setStandEditButtonObj}
            />
          )}
          {sExpand === TAB_NAMES.ordering && (
            <OrderingComponent
              sOrderingMenuSelectionName={sOrderingMenuSelectionName}
              _setOrderingMenuSelectionName={_setOrderingMenuSelectionName}
            />
          )}
          {sExpand === TAB_NAMES.textTemplates && (
            <TextTemplatesComponent
              zSettingsObj={zSettingsObj}
              handleSettingsFieldChange={handleSettingsFieldChange}
            />
          )}
          {sExpand === TAB_NAMES.emailTemplates && (
            <EmailTemplatesComponent
              zSettingsObj={zSettingsObj}
              handleSettingsFieldChange={handleSettingsFieldChange}
            />
          )}
          {sExpand === TAB_NAMES.blockedNumbers && (
            <BlockedNumbersComponent
              zSettingsObj={zSettingsObj}
              handleSettingsFieldChange={handleSettingsFieldChange}
            />
          )}
          {sExpand === TAB_NAMES.import && <ImportComponent />}
          {sExpand === TAB_NAMES.backup && <BackupRecoveryComponent />}
        </View>
      </View>
    </OuterWrapper>
  );
}

////////////////////////////////////////////////////////////////////////////////

function VerticalSpacer({ height }) {
  return (
    <View
      style={{
        height: 1,
        marginVertical: 7,
        width: "100%",
        backgroundColor: gray(0.1),
      }}
    />
  );
}

function BoxContainerOuterComponent({ style = {}, children }) {
  return (
    <View
      style={{
        width: "97%",
        alignItems: "center",

        // marginHorizontal: 0,
        ...style,
      }}
    >
      {children}
    </View>
  );
}

function MenuListLabelComponent({
  text,
  style = {},
  icon,
  iconSize,
  dropdownLabel,
  handleExpandPress,
  selected,
  dropdownDataArr,
  onDropdownSelect,
}) {
  let ICON_SIZE = 18;
  const [sOpacity, _setOpacity] = useState(1);
  return (
    <TouchableOpacity
      onMouseEnter={() => _setOpacity(0.6)}
      onMouseLeave={() => _setOpacity(1)}
      onPress={handleExpandPress}
      style={{
        flexDirection: "row",
        width: "100%",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 4,
        opacity: sOpacity,
        backgroundColor: selected ? C.orange : "transparent",
        borderRadius: 5,
        paddingVertical: 4,
        paddingHorizontal: 6,
      }}
    >
      {!dropdownDataArr && (
        <Text
          style={{
            fontSize: 16,
            color: selected ? C.textWhite : gray(0.5),
            fontWeight: "500",
          }}
        >
          {text.toUpperCase()}
        </Text>
      )}
      {!!dropdownDataArr && (
        <DropdownMenu
          buttonStyle={{
            backgroundColor: "transparent",
            paddingHorizontal: 0,
            paddingVertical: 0,
          }}
          itemStyle={{
            width: null,
          }}
          buttonText={dropdownLabel}
          dataArr={dropdownDataArr}
          onSelect={onDropdownSelect}
          buttonTextStyle={{
            fontSize: 15,
            color: gray(0.5),
            textAlign: "left",
            fontWeight: "500",
          }}
        />
      )}
      <Image_ size={iconSize || ICON_SIZE} icon={icon || ICONS.expandGreen} />
    </TouchableOpacity>
  );
}

function BoxContainerInnerComponent({ style = {}, children }) {
  return (
    <View
      style={{
        // width: null,
        borderWidth: 1,
        borderColor: C.buttonLightGreenOutline,
        backgroundColor: C.listItemWhite,
        borderRadius: 10,
        alignItems: "flex-end",
        padding: 15,
        borderColore: C.buttonLightGreenOutline,
        width: "100%",
        ...style,
      }}
    >
      {children}
    </View>
  );
}

function BoxButton1({
  label,
  style = {},
  icon,
  iconSize,
  textStyle,
  onPress,
  colorGradientArr,
}) {
  return (
    <Button_
      colorGradientArr={colorGradientArr}
      text={label}
      icon={icon || ICONS.add}
      iconSize={iconSize || 30}
      textStyle={{ fontSize: 14, color: gray(0.6), ...textStyle }}
      buttonStyle={{
        paddingHorizontal: 0,
        paddingVertical: 0,
        borderRadius: 5,
        backgroundColor: gray(0.2),
        marginBottom: 0,
        ...style,
      }}
      onPress={onPress}
    />
  );
}

const LS_CARD_READER_KEY = "warpspeed_selected_card_reader";

function CardReaderManager({ liveReaders = [], savedReaders = [], onSaveReaders }) {
  const [sEditingId, _setEditingId] = useState(null);
  const [sLabelDraft, _setLabelDraft] = useState("");
  const [sSelectedReader, _setSelectedReader] = useState(() => localStorageWrapper.getItem(LS_CARD_READER_KEY));

  // Merge live Stripe readers with saved labels
  let mergedReaders = liveReaders.map((live) => {
    let saved = savedReaders.find((s) => s.id === live.id);
    return {
      id: live.id,
      label: saved?.label || "",
      status: live.status || "offline",
      device_type: live.device_type || "",
      isLive: true,
    };
  });
  // Add saved readers not in live list (stale/disconnected)
  savedReaders.forEach((saved) => {
    if (saved.id && !mergedReaders.find((m) => m.id === saved.id)) {
      mergedReaders.push({ id: saved.id, label: saved.label || "", status: "offline", device_type: "", isLive: false });
    }
  });

  function saveLabel(readerId, label) {
    let updated = savedReaders.filter((s) => s.id !== readerId);
    if (label.trim()) updated.push({ id: readerId, label: label.trim() });
    onSaveReaders(updated);
  }

  function handleDeleteReader(reader) {
    let isConnected = reader.isLive;
    useAlertScreenStore.getState().setValues({
      title: isConnected ? "Reader Connected" : "Remove Reader",
      message: isConnected
        ? "This reader is connected to the Stripe account. It will appear back in this list until it is removed from your account."
        : "This reader is no longer connected to the account. Safely remove?",
      btn1Text: "Remove",
      btn2Text: "Cancel",
      handleBtn1Press: () => {
        let updated = savedReaders.filter((s) => s.id !== reader.id);
        onSaveReaders(updated);
        // If this was the selected reader, clear local selection
        if (sSelectedReader?.id === reader.id) {
          _setSelectedReader(null);
          localStorageWrapper.removeItem(LS_CARD_READER_KEY);
        }
        useAlertScreenStore.getState().setShowAlert(false);
      },
      handleBtn2Press: () => useAlertScreenStore.getState().setShowAlert(false),
      canExitOnOuterClick: true,
    });
  }

  // Build dropdown data for selected reader
  let dropdownData = mergedReaders.map((r) => {
    let isOffline = r.status !== "online";
    return {
      id: r.id,
      label: (r.label || r.id) + (isOffline ? "  (offline)" : ""),
      disabled: isOffline,
      rawLabel: r.label,
      textColor: isOffline ? gray(0.5) : C.text,
    };
  });

  let selectedLabel = "";
  if (sSelectedReader?.id) {
    selectedLabel = sSelectedReader.label || sSelectedReader.id;
  }

  return (
    <View style={{ marginTop: 7, width: "100%", alignItems: "flex-end" }}>
      <View
        style={{
          borderRadius: 8,
          backgroundColor: C.backgroundListWhite,
          borderWidth: 1,
          borderColor: C.buttonLightGreenOutline,
          padding: 10,
          width: "100%",
        }}
      >
        <Text style={{ fontSize: 12, color: gray(0.6), marginBottom: 10 }}>
          {"STRIPE CARD READERS"}
        </Text>

        {mergedReaders.length === 0 && (
          <Text style={{ fontSize: 12, color: gray(0.4), fontStyle: "italic", marginBottom: 5 }}>
            No readers found on account
          </Text>
        )}

        <FlatList
          data={mergedReaders}
          ItemSeparatorComponent={() => <View style={{ height: 5 }} />}
          renderItem={(obj) => {
            let reader = obj.item;
            let isOnline = reader.status === "online";
            let isEditing = sEditingId === reader.id;
            let hasLabel = !!reader.label;

            return (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: C.listItemWhite,
                  borderRadius: 6,
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  borderWidth: 1,
                  borderColor: C.buttonLightGreenOutline,
                }}
              >
                {/* Status dot */}
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: isOnline ? C.green : gray(0.4),
                    marginRight: 10,
                  }}
                />
                {/* Reader info */}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, color: gray(0.5) }}>
                    {reader.device_type ? reader.device_type + "  ·  " : ""}{reader.id.length > 20 ? "..." + reader.id.slice(-12) : reader.id}
                  </Text>
                  {hasLabel && !isEditing && (
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                      <Text style={{ fontSize: 14, color: C.text, fontWeight: "500" }}>
                        {reader.label}
                      </Text>
                      <Button_
                        icon={ICONS.editPencil}
                        iconSize={14}
                        buttonStyle={{ paddingHorizontal: 6, backgroundColor: "transparent" }}
                        onPress={() => {
                          _setEditingId(reader.id);
                          _setLabelDraft(reader.label);
                        }}
                      />
                    </View>
                  )}
                  {(!hasLabel || isEditing) && (
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                      <TextInput_
                        value={isEditing ? sLabelDraft : ""}
                        onChangeText={(val) => {
                          _setLabelDraft(val);
                          saveLabel(reader.id, val);
                        }}
                        placeholder="Enter label..."
                        placeholderTextColor={gray(0.4)}
                        style={{
                          outlineWidth: 0,
                          fontSize: 14,
                          paddingVertical: 3,
                          paddingHorizontal: 6,
                          backgroundColor: C.backgroundWhite,
                          borderWidth: 1,
                          borderColor: C.buttonLightGreenOutline,
                          borderRadius: 5,
                          minWidth: 140,
                        }}
                        onFocus={() => {
                          if (sEditingId !== reader.id) {
                            _setEditingId(reader.id);
                            _setLabelDraft(reader.label || "");
                          }
                        }}
                        onBlur={() => {
                          _setEditingId(null);
                          _setLabelDraft("");
                        }}
                      />
                    </View>
                  )}
                </View>
                {/* Delete button */}
                <TouchableOpacity
                  onPress={() => handleDeleteReader(reader)}
                  style={{ padding: 6, marginLeft: 4 }}
                >
                  <Image_ source={ICONS.close1} style={{ width: 12, height: 12, opacity: 0.4 }} />
                </TouchableOpacity>
              </View>
            );
          }}
        />
      </View>

      {/* Selected Reader Dropdown */}
      <View
        style={{
          flexDirection: "row",
          width: "100%",
          justifyContent: "flex-end",
          alignItems: "center",
          marginTop: 15,
        }}
      >
        <Text style={{ marginRight: 5 }}>Selected Reader: </Text>
        <DropdownComponent
          label={selectedLabel || "None"}
          data={dropdownData}
          onSelect={(item) => {
            if (item.disabled) return;
            let obj = { id: item.id, label: item.rawLabel || "" };
            _setSelectedReader(obj);
            localStorageWrapper.setItem(LS_CARD_READER_KEY, obj);
          }}
          itemTextStyle={{}}
          itemStyle={{}}
        />
      </View>
    </View>
  );
}

function DropdownComponent({
  ref,
  data,
  onSelect,
  textStyle = {},
  buttonStyle = {},
  itemStyle = {},
  itemTextStyle = {},
  label,
  modalCoordX,
  modalCoordY,
  menuMaxHeight,
  centerMenuVertically,
}) {
  return (
    <DropdownMenu
      buttonText={label}
      buttonTextStyle={{ fontSize: 14, ...textStyle }}
      buttonStyle={{
        borderRadius: 5,
        borderWidth: 1,
        borderColor: C.buttonLightGreenOutline,
        paddingHorizontal: 7,
        paddingVertical: 3,
        ...buttonStyle,
      }}
      itemTextStyle={{ ...itemTextStyle }}
      itemStyle={{ ...itemStyle }}
      onSelect={onSelect}
      dataArr={data}
      ref={ref}
      modalCoordX={modalCoordX}
      modalCoordY={modalCoordY}
      menuMaxHeight={menuMaxHeight}
      centerMenuVertically={centerMenuVertically}
    />
  );
}

////////////////////////////////////////////////////////////////////////////////////

function UserQuickCard({ userObj, isClockedIn }) {
  const [sHover, _setHover] = useState(false);
  return (
    <TouchableOpacity
      onPress={() => { }}
      onMouseEnter={() => _setHover(true)}
      onMouseLeave={() => _setHover(false)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: C.listItemWhite,
        borderWidth: 1,
        borderColor: isClockedIn ? C.green : C.buttonLightGreenOutline,
        borderRadius: 8,
        paddingVertical: 6,
        paddingHorizontal: 10,
        opacity: sHover ? 0.7 : 1,
      }}
    >
      <View style={{ marginRight: 8 }}>
        <Text style={{ fontSize: 13, color: C.text, fontWeight: "500" }}>
          {capitalizeFirstLetterOfString(userObj.first) + " " + capitalizeFirstLetterOfString(userObj.last)}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => {
          let option = isClockedIn ? "out" : "in";
          let name = capitalizeFirstLetterOfString(userObj.first) + " " + capitalizeFirstLetterOfString(userObj.last);
          useAlertScreenStore.getState().setValues({
            title: "PUNCH CLOCK",
            message: (option === "in" ? "Clock in " : "Clock out ") + name + "?",
            btn1Text: option === "in" ? "CLOCK IN" : "CLOCK OUT",
            btn2Text: "CANCEL",
            handleBtn1Press: () => {
              useLoginStore.getState().setCreateUserClock(userObj.id, new Date().getTime(), option);
            },
            handleBtn2Press: () => null,
            showAlert: true,
          });
        }}
        style={{
          backgroundColor: isClockedIn ? C.lightred : C.green,
          borderRadius: 5,
          paddingVertical: 3,
          paddingHorizontal: 8,
        }}
      >
        <Text style={{ fontSize: 11, color: C.textWhite, fontWeight: "600" }}>
          {isClockedIn ? "Clock Out" : "Clock In"}
        </Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const AppUserListComponent = ({
  zSettingsObj,
  commitUserInfoChange,
  _setFacialRecognitionModalUserObj,
  _setPunchClockUserObj,
  handleRemoveUserPress,
  handleSettingsFieldChange,
}) => {
  const [sEditUserIndex, _setEditUserIndex] = useState(null);
  const [sShowPinIndex, _setShowPinIndex] = useState(false);
  const [sShowWageIndex, _setShowWageIndex] = useState(false);
  const [sNewUserObj, _setNewUserObj] = useState(null);
  const [sExpand, _setExpand] = useState(false);
  const [sShowUserList, _setShowUserList] = useState(true);
  const [sLoginTimeout, _setLoginTimeout] = useState(zSettingsObj?.activeLoginTimeoutSeconds || "");
  const [sLockHours, _setLockHours] = useState(zSettingsObj?.idleLoginTimeoutHours ? String(Math.round(zSettingsObj.idleLoginTimeoutHours)) : "");
  const [sPinLength, _setPinLength] = useState(zSettingsObj?.userPinStrength || "");
  const zPunchClock = useLoginStore((state) => state.punchClock);

  const userListItemRefs = useRef([]);

  function handleNewUserPress() {
    let userObj = cloneDeep(APP_USER);
    userObj.id = generateEAN13Barcode();
    let role = PERMISSION_LEVELS.user;
    userObj.permissions = role;
    commitUserInfoChange(userObj, true);
    _setEditUserIndex(0);
  }

  return (
    <BoxContainerOuterComponent style={{}}>
      {/*User quick list with clock in/out*/}
      <BoxContainerInnerComponent
        style={{
          backgroundColor: C.backgroundListWhite,
          borderWidth: 0,
          marginBottom: 10,
        }}
      >
        <TouchableOpacity
          onPress={() => _setShowUserList(!sShowUserList)}
          style={{ flexDirection: "row", alignItems: "center", marginBottom: sShowUserList ? 8 : 0 }}
        >
          <Text style={{ fontSize: 13, color: gray(0.5), fontWeight: "600" }}>
            {sShowUserList ? "Hide Users  ▲" : "Show Users  ▼"}
          </Text>
        </TouchableOpacity>
        {sShowUserList && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {[...(zSettingsObj?.users || [])].sort((a, b) => {
              let aIn = zPunchClock[a.id] ? 0 : 1;
              let bIn = zPunchClock[b.id] ? 0 : 1;
              return aIn - bIn;
            }).map((userObj) => (
              <UserQuickCard key={userObj.id} userObj={userObj} isClockedIn={!!zPunchClock[userObj.id]} />
            ))}
          </View>
        )}
      </BoxContainerInnerComponent>
      {/**Flatlist showing all app users, edit functions. sPunchClockUserObj */}
      <BoxContainerInnerComponent
        style={{
          backgroundColor: C.backgroundListWhite,
          borderWidth: 0
          // width: "100%",
        }}
      >
        <View style={{ width: "100%", justifyContent: "flex-end" }}>
          <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
            <Text
              style={{
                color: C.text,
              }}
            >
              {"Seconds to log user out: "}
            </Text>
            <TextInput_
              onChangeText={(val) => {
                _setLoginTimeout(val);
                handleSettingsFieldChange("activeLoginTimeoutSeconds", val);
              }}
              style={{
                width: 50,
                marginLeft: 10,
                borderColor: C.green,
                borderWidth: 1,
                borderRadius: 5,
                paddingLeft: 3,
                outlineWidth: 0,
                color: C.text,
              }}
              value={String(sLoginTimeout)}
            />
          </View>
        </View>
        <View style={{ justifyContent: "flex-end" }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
              marginTop: 10,
            }}
          >
            <Text
              style={{
                // width: "40%",
                color: C.text,
              }}
            >
              {"Hours to lock app: "}
            </Text>
            <TextInput_
              onChangeText={(val) => {
                _setLockHours(val);
                handleSettingsFieldChange("idleLoginTimeoutHours", val);
              }}
              style={{
                width: 50,
                marginLeft: 10,
                borderColor: C.green,
                borderWidth: 1,
                borderRadius: 5,
                paddingLeft: 3,
                color: C.text,
                outlineWidth: 0,
              }}
              value={String(sLockHours)}
            />
          </View>
          <View style={{ width: "100%", justifyContent: "flex-end" }}>
            <View style={{ flexDirection: "row", marginTop: 10 }}>
              <Text
                style={{
                  // width: "40%",
                  color: C.text,
                }}
              >
                {"User login PIN length: "}
              </Text>
              <TextInput_
                onChangeText={(val) => {
                  _setPinLength(val);
                  handleSettingsFieldChange("userPinStrength", val);
                }}
                style={{
                  width: 50,
                  marginLeft: 10,
                  borderColor: C.green,
                  borderWidth: 1,
                  borderRadius: 5,
                  paddingLeft: 3,
                  outlineWidth: 0,
                  color: C.text,
                }}
                value={String(sPinLength)}
              />
            </View>
          </View>
        </View>
        <View
          style={{ width: "100%", justifyContent: "flex-end", marginTop: 10 }}
        >
          <CheckBox_
            buttonStyle={{ justifyContent: "flex-end" }}
            isChecked={zSettingsObj?.lockScreenWhenUserLogsOut}
            text={"Lock screen when user logs out"}
            onCheck={() => {
              handleSettingsFieldChange(
                "lockScreenWhenUserLogsOut",
                !zSettingsObj.lockScreenWhenUserLogsOut
              );
            }}
          />
        </View>
        {/* <View
            style={{
              flexDirection: "row",
              width: "100%",
              justifyContent: "flex-end",
              alignItems: "center",
            }}
          > */}
        {/* <Button_
            onPress={fillPunchHistory}
            text={"Fill History"}
            buttonStyle={{
              borderRadius: 5,
              padding: 0,
              height: 20,
              backgroundColor: C.buttonLightGreen,
              borderColor: C.buttonLightGreenOutline,
              borderWidth: 1,
            }}
            textStyle={{
              fontSize: 14,
              fontColor: C.textMain,
            }}
          /> */}

        {/* </View> */}
        <View
          style={{
            width: "100%",
            alignItems: "flex-start",
          }}
        >
          <BoxButton1
            iconSize={35}
            icon={ICONS.add}
            onPress={handleNewUserPress}
            style={{}}
          />
        </View>
        <View style={{ width: "100%" }}>
          <FlatList
            ItemSeparatorComponent={() => (
              <View
                style={{
                  height: 5,
                }}
              />
            )}
            style={{ borderRadius: 5 }}
            data={
              zSettingsObj
                ? sNewUserObj
                  ? [sNewUserObj, ...zSettingsObj.users]
                  : zSettingsObj.users
                : []
            }
            renderItem={(obj) => {
              obj = cloneDeep(obj);
              let idx = obj.index;
              let userObj = obj.item;
              let editable = sEditUserIndex === idx;
              return (
                <View
                  ref={(element) => (userListItemRefs.current[idx] = element)}
                  style={{
                    flexDirection: "row",
                    backgroundColor: C.listItemWhite,
                    borderWidth: 1,
                    borderColor: C.buttonLightGreenOutline,
                    borderRadius: 5,
                    padding: 3,
                    paddingRight: 10,
                    opacity: !editable && sEditUserIndex ? 0.3 : 1,
                  }}
                >
                  <View
                    style={{
                      justifyContent: "space-around",
                      marginRight: 5,
                      width: "12%",
                    }}
                  >
                    <TouchableOpacity
                      onPress={() => {
                        _setEditUserIndex(sEditUserIndex != null ? null : idx);
                        _setShowPinIndex(null);
                        _setShowWageIndex(null);
                      }}
                      style={{ marginLeft: 10 }}
                    >
                      <Image_ icon={editable ? ICONS.close1 : ICONS.editPencil} size={20} />
                    </TouchableOpacity>
                    <Button_
                      text={"Enroll"}
                      onPress={() => {
                        _setFacialRecognitionModalUserObj(userObj);
                      }}
                      enabled={editable}
                      buttonStyle={{
                        borderWidth: 1,
                        borderColor: C.buttonLightGreenOutline,
                        backgroundColor: C.buttonLightGreen,
                        paddingVertical: 2,
                        paddingHorizontal: 4,
                        borderRadius: 5,
                        width: "100%",
                      }}
                      mouseOverOptions={{ opacity: 0.7 }}
                      textStyle={{ fontSize: 11, color: C.text, fontWeight: "600", numLines: 2, width: '100%', textAlign: "center" }}
                    />
                  </View>
                  <View
                    style={{
                      justifyContent: "center",
                      marginTop: 2,
                      width: "88%",
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        // width: "100%",
                        // backgroundColor: "red",
                      }}
                    >
                      <TextInput_
                        value={userObj.first}
                        placeholder="First name"
                        placeholderTextColor={"lightgray"}
                        editable={editable}
                        style={{
                          paddingHorizontal: 5,
                          padding: 1,
                          borderColor: editable
                            ? C.buttonLightGreenOutline
                            : "transparent",
                          outlineWidth: 0,
                          width: "49%",
                          // marginRight: 10,
                          borderWidth: 1,
                          fontSize: 14,
                          height: 25,
                        }}
                        onChangeText={(value) => {
                          userObj.first = value;
                          commitUserInfoChange(userObj);
                        }}
                      />
                      <TextInput_
                        value={userObj.last}
                        onChangeText={(value) => {
                          userObj.last = value;
                          commitUserInfoChange(userObj);
                        }}
                        placeholder="Last name"
                        placeholderTextColor={"lightgray"}
                        editable={editable}
                        style={{
                          paddingHorizontal: 5,
                          // paddingHorizontal: 2,
                          borderColor: editable
                            ? C.buttonLightGreenOutline
                            : "transparent",
                          outlineWidth: 0,
                          width: "49%",
                          // marginRight: 10,
                          borderWidth: 1,
                          fontSize: 14,
                          height: 25,
                        }}
                      />
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        width: "100%",
                        alignItems: "center",
                        marginTop: 7,
                      }}
                    >
                      <TextInput
                        value={formatPhoneWithDashes(userObj.phone)}
                        onChangeText={(value) => {
                          let val = removeDashesFromPhone(value);
                          userObj.phone = val;
                          commitUserInfoChange(userObj);
                        }}
                        placeholder="Phone num."
                        placeholderTextColor={"lightgray"}
                        editable={editable}
                        style={{
                          paddingHorizontal: 5,
                          padding: 1,
                          borderColor: editable
                            ? C.buttonLightGreenOutline
                            : "transparent",
                          outlineWidth: 0,
                          width: 120,
                          borderWidth: 1,
                          height: 25,
                          fontSize: 14,
                        }}
                      />
                      <TextInput_
                        value={userObj.email || ""}
                        onChangeText={(value) => {
                          userObj.email = value;
                          commitUserInfoChange(userObj);
                        }}
                        placeholder="Email"
                        placeholderTextColor={"lightgray"}
                        editable={editable}
                        style={{
                          paddingHorizontal: 5,
                          padding: 1,
                          borderColor: editable
                            ? C.buttonLightGreenOutline
                            : "transparent",
                          backgroundColor: "transparent",
                          outlineWidth: 0,
                          flex: 1,
                          marginLeft: 5,
                          borderWidth: 1,
                          height: 25,
                          fontSize: 14,
                        }}
                      />
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-around",
                        width: "100%",
                        marginTop: 7,
                        alignItems: "center",
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          borderColor: editable
                            ? C.buttonLightGreenOutline
                            : "transparent",
                          width: "22%",
                          borderWidth: 1,
                          justifyContent: "space-between",
                          alignItems: "center",
                          height: 25,
                        }}
                      >
                        <TextInput_
                          caretHidden={sShowPinIndex != idx}
                          focused={sShowPinIndex === idx}
                          value={sShowPinIndex === idx ? userObj.pin : ""}
                          onChangeText={(value) => {
                            userObj.pin = value;
                            commitUserInfoChange(userObj);
                          }}
                          placeholder={sShowPinIndex === idx ? "pin..." : "PIN"}
                          placeholderTextColor={"lightgray"}
                          editable={editable}
                          style={{
                            outlineWidth: 0,
                            paddingHorizontal: 5,
                            padding: 1,
                            fontSize: 14,
                            width: "80%",
                          }}
                        />
                        {editable ? (
                          <TouchableOpacity
                            onPress={() =>
                              _setShowPinIndex(
                                sShowPinIndex != null ? null : idx
                              )
                            }
                          >
                            <Image_ icon={ICONS.editPencil} size={15} />
                          </TouchableOpacity>
                        ) : (
                          <View style={{ width: 15 }} />
                        )}
                      </View>
                      <View
                        style={{
                          flexDirection: "row",
                          borderColor: editable
                            ? C.buttonLightGreenOutline
                            : "transparent",
                          width: "22%",
                          borderWidth: 1,
                          justifyContent: "space-between",
                          alignItems: "center",
                          height: 25,
                        }}
                      >
                        <TextInput_
                          caretHidden={sShowWageIndex != idx}
                          value={
                            sShowWageIndex === idx ? userObj.hourlyWage : ""
                          }
                          onChangeText={(value) => {
                            userObj.hourlyWage = value;
                            commitUserInfoChange(userObj);
                          }}
                          placeholder={
                            sShowWageIndex === idx ? "wage..." : "Wage"
                          }
                          placeholderTextColor={"lightgray"}
                          editable={editable}
                          style={{
                            outlineWidth: 0,
                            paddingHorizontal: 5,
                            padding: 1,
                            fontSize: 14,
                            width: "80%",
                          }}
                        />
                        {editable ? (
                          <TouchableOpacity
                            onPress={() =>
                              _setShowWageIndex(
                                sShowWageIndex != null ? null : idx
                              )
                            }
                          >
                            <Image_ icon={ICONS.editPencil} size={15} />
                          </TouchableOpacity>
                        ) : (
                          <View style={{ width: 15 }} />
                        )}
                      </View>
                      <View style={{ width: "40%", alignItems: "center" }}>
                        <DropdownMenu
                          enabled={editable}
                          ref={userListItemRefs.current[idx]}
                          dataArr={Object.values(PERMISSION_LEVELS).map(
                            (o) => o.name
                          )}
                          onSelect={(item) => {
                            if (!editable) return;
                            let perm = Object.values(PERMISSION_LEVELS).find(
                              (o) => o.name === item
                            );
                            userObj.permissions = perm;
                            commitUserInfoChange(userObj);
                          }}
                          buttonStyle={{
                            paddingHorizontal: 5,
                            padding: 1,
                            borderColor: C.buttonLightGreenOutline,
                            outlineWidth: 0,
                            borderRadius: 5,
                            minWidth: 100,
                            height: 25,
                            borderWidth: 1,
                            alignItems: "flex-start",
                            backgroundColor: editable
                              ? C.buttonLightGreen
                              : "transparent",
                            paddingVertical: 2,
                          }}
                          buttonText={userObj.permissions.name}
                          buttonTextStyle={{
                            color: C.text,
                            fontSize: 14,
                          }}
                        />
                      </View>
                      {editable && (
                        <TouchableOpacity
                          onPress={() => {
                            useAlertScreenStore.getState().setValues({
                              title: "DELETE USER",
                              message: "Are you sure you want to delete " + capitalizeFirstLetterOfString(userObj.first) + " " + capitalizeFirstLetterOfString(userObj.last) + "?",
                              btn1Text: "DELETE",
                              btn2Text: "CANCEL",
                              handleBtn1Press: () => {
                                handleRemoveUserPress(userObj);
                                _setEditUserIndex(null);
                              },
                              handleBtn2Press: () => null,
                              showAlert: true,
                            });
                          }}
                        >
                          <Image_ icon={ICONS.trash} size={18} />
                        </TouchableOpacity>
                      )}
                    </View>
                    {/* ROW 4: Statuses */}
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        marginTop: 7,
                        flexWrap: "wrap",
                        gap: 5,
                      }}
                    >
                      {editable && (
                        <StatusPickerModal
                          statuses={zSettingsObj.statuses}
                          onSelect={(item) => {
                            if (!item) return;
                            let currentStatuses = userObj.statuses || [];
                            if (currentStatuses.includes(item.id)) return;
                            userObj.statuses = [...currentStatuses, item.id];
                            commitUserInfoChange(userObj);
                          }}
                          buttonText="+ Status"
                          modalCoordX={80}
                          modalCoordY={0}
                          buttonStyle={{
                            paddingHorizontal: 8,
                            paddingVertical: 2,
                            borderColor: C.buttonLightGreenOutline,
                            borderRadius: 5,
                            height: 25,
                            borderWidth: 1,
                            alignItems: "center",
                            backgroundColor: C.buttonLightGreen,
                          }}
                          buttonTextStyle={{
                            color: C.text,
                            fontSize: 12,
                          }}
                        />
                      )}
                      {(userObj.statuses || []).map((statusId) => {
                        let status = zSettingsObj.statuses.find(
                          (s) => s.id === statusId
                        );
                        if (!status) return null;
                        return (
                          <View
                            key={statusId}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              backgroundColor: status.backgroundColor,
                              borderRadius: 4,
                              paddingHorizontal: 6,
                              paddingVertical: 2,
                            }}
                          >
                            <Text
                              style={{
                                color: status.textColor,
                                fontSize: 12,
                                fontWeight: "600",
                              }}
                            >
                              {status.label}
                            </Text>
                            {editable && (
                              <TouchableOpacity
                                onPress={() => {
                                  userObj.statuses = (
                                    userObj.statuses || []
                                  ).filter((id) => id !== statusId);
                                  commitUserInfoChange(userObj);
                                }}
                                style={{ marginLeft: 4 }}
                              >
                                <Text
                                  style={{
                                    color: status.textColor,
                                    fontSize: 14,
                                    fontWeight: "700",
                                  }}
                                >
                                  ×
                                </Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  </View>
                </View>
              );
            }}
          />
        </View>
      </BoxContainerInnerComponent>
    </BoxContainerOuterComponent>
  );
};

// the next components are compiled into the ListOptionsComponent  //////////
const ListOptionsComponent = ({ zSettingsObj, handleSettingsFieldChange }) => {
  return (
    <BoxContainerOuterComponent>
      <BoxContainerInnerComponent
        style={{ width: "100%", alignItems: "center" }}
      >
        <BikeBrandsComponent
          zSettingsObj={zSettingsObj}
          handleSettingsFieldChange={handleSettingsFieldChange}
        />
        <DiscountsComponent
          zSettingsObj={zSettingsObj}
          handleSettingsFieldChange={handleSettingsFieldChange}
        />
        <WaitTimesComponent
          zSettingsObj={zSettingsObj}
          handleSettingsFieldChange={handleSettingsFieldChange}
        />
        <PartSourcesComponent
          zSettingsObj={zSettingsObj}
          handleSettingsFieldChange={handleSettingsFieldChange}
        />
      </BoxContainerInnerComponent>
    </BoxContainerOuterComponent>
  );
};

const BikeBrandsComponent = ({ zSettingsObj, handleSettingsFieldChange }) => {
  // const [sExpand, _setExpand] = useState();

  return (
    <BoxContainerInnerComponent
      style={{ width: "100%", alignItems: "center", borderWidth: 0 }}
    >
      {/**Bike brands */}
      <View style={{ width: "100%", alignItems: "center" }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "flex-end",
            backgroundColor: C.buttonLightGreen,
            borderRadius: 5,
            paddingHorizontal: 5,
            paddingVertical: 5,
            width: "95%",
          }}
        >
          <Text style={{ color: C.text }}>Category Name:</Text>
          <TextInput_
            style={{
              width: "50%",
              marginLeft: 10,
              padding: 5,
              borderWidth: 2,
              borderRadius: 5,
              borderColor: C.buttonLightGreenOutline,
              outlineWidth: 0,
              color: C.text,
              marginRight: 10,
            }}
            value={zSettingsObj?.bikeBrandsName}
            onChangeText={(val) => {
              handleSettingsFieldChange("bikeBrandsName", val);
            }}
          />
          <BoxButton1
            onPress={() => {
              let brandsArr = zSettingsObj?.bikeBrands;
              brandsArr.push("New Bike Brand...");
              handleSettingsFieldChange("bikeBrands", brandsArr);
            }}
          />
        </View>
        <View style={{ marginTop: 10, width: "100%" }}>
          <FlatList
            data={zSettingsObj?.bikeBrands || []}
            renderItem={(obj) => {
              let idx = obj.index;
              let brandName = obj.item;
              return (
                <View
                  style={{
                    alignItems: "center",
                    width: "100%",
                    flexDirection: "row",
                    justifyContent: "center",
                  }}
                >
                  <TextInput_
                    onChangeText={(val) => {
                      let brandsArr = zSettingsObj.bikeBrands;
                      brandsArr[idx] = val;
                      handleSettingsFieldChange("bikeBrands", brandsArr);
                    }}
                    style={{
                      marginBottom: 5,
                      borderColor: C.buttonLightGreenOutline,
                      borderWidth: 1,
                      borderRadius: 5,
                      padding: 5,
                      width: "80%",
                      textAlign: "center",
                      color: C.text,
                      outlineWidth: 0,
                    }}
                    value={brandName}
                  />
                  <BoxButton1
                    onPress={() => {
                      let arr = zSettingsObj.bikeBrands.filter(
                        (name) => name !== brandName
                      );
                      handleSettingsFieldChange("bikeBrands", arr);
                    }}
                    style={{ marginLeft: 15 }}
                    iconSize={15}
                    icon={ICONS.close1}
                  />
                </View>
              );
            }}
          />
        </View>
      </View>

      {/**Optional bike brands */}
      <View style={{ width: "100%", alignItems: "center" }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "flex-end",
            backgroundColor: C.buttonLightGreen,
            borderRadius: 5,
            paddingHorizontal: 5,
            paddingVertical: 5,
            marginTop: 20,
            marginBottom: 10,
            width: "95%",
          }}
        >
          <Text style={{ color: C.text }}>Category Name:</Text>
          <TextInput_
            style={{
              width: "50%",
              marginLeft: 10,
              padding: 5,
              borderWidth: 2,
              borderRadius: 5,
              borderColor: C.buttonLightGreenOutline,
              outlineWidth: 0,
              color: C.text,
              marginRight: 10,
            }}
            value={zSettingsObj?.bikeOptionalBrandsName}
            onChangeText={(val) => {
              handleSettingsFieldChange("bikeOptionalBrandsName", val);
            }}
          />
          <BoxButton1
            onPress={() => {
              let brandsArr = zSettingsObj?.bikeOptionalBrands;
              brandsArr.push("New Bike Brand...");
              handleSettingsFieldChange("bikeOptionalBrands", brandsArr);
            }}
          />
        </View>
        <View style={{ marginTop: 10, width: "100%" }}>
          <FlatList
            data={zSettingsObj?.bikeOptionalBrands || []}
            renderItem={(obj) => {
              let idx = obj.index;
              let brandName = obj.item;
              return (
                <View
                  style={{
                    alignItems: "center",
                    width: "100%",
                    flexDirection: "row",
                    justifyContent: "center",
                  }}
                >
                  <TextInput_
                    onChangeText={(val) => {
                      let brandsArr = zSettingsObj.bikeOptionalBrands;
                      brandsArr[idx] = val;
                      handleSettingsFieldChange(
                        "bikeOptionalBrands",
                        brandsArr
                      );
                    }}
                    style={{
                      marginBottom: 5,
                      borderColor: C.buttonLightGreenOutline,
                      borderWidth: 1,
                      borderRadius: 5,
                      padding: 5,
                      width: "80%",
                      textAlign: "center",
                      color: C.text,
                      outlineWidth: 0,
                    }}
                    value={brandName}
                  />
                  <BoxButton1
                    onPress={() => {
                      let arr = zSettingsObj.bikeOptionalBrands.filter(
                        (name) => name !== brandName
                      );
                      handleSettingsFieldChange("bikeOptionalBrands", arr);
                    }}
                    style={{ marginLeft: 15 }}
                    iconSize={15}
                    icon={ICONS.close1}
                  />
                </View>
              );
            }}
          />
        </View>
      </View>

      {/**Bike Descriptions*/}
      <View style={{ width: "100%", alignItems: "center" }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: C.buttonLightGreen,
            borderRadius: 5,
            paddingHorizontal: 20,
            paddingVertical: 5,
            marginTop: 20,
            marginBottom: 10,
            width: "95%",
          }}
        >
          <Text style={{ color: C.text, marginRight: 20 }}>
            Bike Descriptions
          </Text>
          <BoxButton1
            onPress={() => {
              let brandsArr = zSettingsObj?.bikeDescriptions;
              brandsArr.push("New Bike Description...");
              handleSettingsFieldChange("bikeDescriptions", brandsArr);
            }}
          />
        </View>
        <View style={{ marginTop: 10, width: "100%" }}>
          <FlatList
            data={zSettingsObj?.bikeDescriptions || []}
            renderItem={(obj) => {
              let idx = obj.index;
              let brandName = obj.item;
              return (
                <View
                  style={{
                    alignItems: "center",
                    width: "100%",
                    flexDirection: "row",
                    justifyContent: "center",
                  }}
                >
                  <TextInput_
                    onChangeText={(val) => {
                      let descriptionsArr = zSettingsObj.bikeDescriptions;
                      descriptionsArr[idx] = val;
                      handleSettingsFieldChange(
                        "bikeDescriptions",
                        descriptionsArr
                      );
                    }}
                    style={{
                      marginBottom: 5,
                      borderColor: C.buttonLightGreenOutline,
                      borderWidth: 1,
                      borderRadius: 5,
                      padding: 5,
                      width: "80%",
                      textAlign: "center",
                      color: C.text,
                      outlineWidth: 0,
                    }}
                    value={brandName}
                  />
                  <BoxButton1
                    onPress={() => {
                      let arr = zSettingsObj.bikeDescriptions.filter(
                        (name) => name !== brandName
                      );
                      handleSettingsFieldChange("bikeDescriptions", arr);
                    }}
                    style={{ marginLeft: 15 }}
                    iconSize={15}
                    icon={ICONS.close1}
                  />
                </View>
              );
            }}
          />
        </View>
      </View>
    </BoxContainerInnerComponent>
  );
};

const DiscountsComponent = ({
  zSettingsObj,
  handleSettingsFieldChange,
  sExpand,
}) => {
  // const [sExpand, _setExpand] = useState();

  return (
    <BoxContainerInnerComponent
      style={{ width: "100%", alignItems: "center", borderWidth: 0 }}
    >
      <View style={{ width: "100%", alignItems: "center" }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "flex-end",
            borderRadius: 10,
            paddingHorizontal: 5,
            width: "100%",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: C.buttonLightGreen,
              borderRadius: 5,
              paddingHorizontal: 20,
              paddingVertical: 5,
              marginTop: 20,
              marginBottom: 10,
              width: "100%",
            }}
          >
            <Text style={{ color: C.text, marginRight: 20 }}>Discounts</Text>
            <BoxButton1
              onPress={() => {
                let discountsArr = zSettingsObj.discounts;
                let discount = {};
                discount.name = "";
                discount.type = "Percent";
                discount.value = "20";
                discount.id = generateRandomID();
                discountsArr.push(discount);
                discountsArr.push(discount);
                handleSettingsFieldChange("discounts", discountsArr);
              }}
            />
          </View>
        </View>
        <View style={{ marginTop: 10, width: "100%", alignItems: "" }}>
          <FlatList
            data={zSettingsObj?.discounts || []}
            renderItem={(obj) => {
              let idx = obj.index;
              let item = obj.item;
              return (
                <View
                  style={{
                    alignItems: "center",
                    width: "100%",
                    flexDirection: "row",
                    justifyContent: "center",
                    marginBottom: 10,
                    // backgroundColor: "blue",
                  }}
                >
                  <TextInput_
                    onChangeText={(val) => {
                      let discountsArr = zSettingsObj.discounts.map((o) => {
                        if (o.id === item.id) return { ...o, name: val };
                        return o;
                      });
                      handleSettingsFieldChange("discounts", discountsArr);
                    }}
                    placeholder={"Discount Name"}
                    placeholderTextColor={gray(0.15)}
                    style={{
                      borderColor: C.buttonLightGreenOutline,
                      borderWidth: 1,
                      borderRadius: 5,
                      padding: 5,
                      width: "80%",
                      textAlign: "center",
                      color: C.text,
                      outlineWidth: 0,
                      fontSize: 14,
                      marginRight: 20,
                      backgroundColor: C.listItemWhite,
                    }}
                    value={item.name}
                  />
                  <View
                    style={{
                      width: "20%",
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    <DropdownComponent
                      onSelect={(val) => {
                        let discountsArr = zSettingsObj.discounts.map((o) => {
                          if (o.id === item.id) return { ...o, type: val };
                          return o;
                        });
                        handleSettingsFieldChange("discounts", discountsArr);
                      }}
                      textStyle={{ fontSize: 13 }}
                      buttonStyle={{ width: 40 }}
                      label={item.type}
                      data={[DISCOUNT_TYPES.percent, DISCOUNT_TYPES.dollar]}
                    />
                    <BoxButton1
                      onPress={() => {
                        let arr = zSettingsObj.discounts.filter(
                          (o) => o.id !== item.id
                        );
                        handleSettingsFieldChange("discounts", arr);
                      }}
                      style={{ marginLeft: 15 }}
                      iconSize={15}
                      icon={ICONS.close1}
                    />
                  </View>
                </View>
              );
            }}
          />
        </View>
      </View>
    </BoxContainerInnerComponent>
  );
};

const WaitTimesComponent = ({
  zSettingsObj,
  handleSettingsFieldChange,
  sExpand,
}) => {
  // const [sExpand, _setExpand] = useState();

  return (
    <BoxContainerInnerComponent
      style={{ width: "100%", alignItems: "center", borderWidth: 0 }}
    >
      <View style={{ width: "100%", alignItems: "center" }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "flex-end",
            borderRadius: 5,
            paddingHorizontal: 5,
            width: "100%",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: C.buttonLightGreen,
              borderRadius: 5,
              paddingHorizontal: 20,
              paddingVertical: 5,
              marginTop: 20,
              marginBottom: 10,
              width: "100%",
            }}
          >
            <Text style={{ color: C.text, marginRight: 20 }}>
              Wait Estimates
            </Text>
            <BoxButton1
              onPress={() => {
                let waitTimesArr = zSettingsObj.waitTimes;
                let waitTime = {};
                waitTime.label = "New wait time...";
                waitTime.maxWaitTimeDays = 0;
                waitTime.id = generateRandomID();
                waitTimesArr.push(waitTime);
                handleSettingsFieldChange("waitTimes", waitTimesArr);
              }}
            />
          </View>
        </View>
        <View
          style={{
            width: "100%",
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <View
            style={{
              width: "66%",
              fontSize: 12,
              backgroundColor: "transparent",
            }}
          >
            <Text style={{ fontColor: C.text }}>Label</Text>
          </View>
          <View
            style={{
              width: "20%",
              alignItems: "center",
              // backgroundColor: "green",
            }}
          >
            <Text
              style={{
                // width: "100%",
                fontColor: C.text,
                textAlign: "center",
                fontSize: 12,
              }}
            >
              Max Wait Days
            </Text>
          </View>
          <View style={{ width: "10%" }}></View>
        </View>
        <View style={{ marginTop: 10, width: "100%" }}>
          <FlatList
            data={[...(zSettingsObj?.waitTimes || [])].sort((a, b) => (Number(a.maxWaitTimeDays) || 0) - (Number(b.maxWaitTimeDays) || 0))}
            style={{ width: "100%" }}
            renderItem={(obj) => {
              let idx = obj.index;
              let item = obj.item;
              return (
                <View
                  style={{
                    alignItems: "center",
                    width: "100%",
                    flexDirection: "row",
                    // justifyContent: "space-between",
                    marginBottom: 10,
                  }}
                >
                  <TextInput_
                    onChangeText={(val) => {
                      let arr = zSettingsObj.waitTimes.map((o) => {
                        if (o.id === item.id) return { ...o, label: val };
                        return o;
                      });
                      handleSettingsFieldChange("waitTimes", arr);
                    }}
                    placeholder={"Wait time label"}
                    placeholderTextColor={gray(0.15)}
                    style={{
                      borderColor: C.buttonLightGreenOutline,
                      borderWidth: 1,
                      borderRadius: 5,
                      padding: 5,
                      width: "70%",
                      textAlign: "center",
                      color: C.text,
                      outlineWidth: 0,
                      fontSize: 13,
                      marginRight: 20,
                      backgroundColor: C.listItemWhite,
                    }}
                    value={item.label}
                  />
                  <TextInput_
                    onChangeText={(val) => {
                      let arr = zSettingsObj.waitTimes.map((o) => {
                        if (o.id === item.id)
                          return { ...o, maxWaitTimeDays: val };
                        return o;
                      });
                      handleSettingsFieldChange("waitTimes", arr);
                    }}
                    placeholder={"Days"}
                    placeholderTextColor={gray(0.15)}
                    style={{
                      borderColor: C.buttonLightGreenOutline,
                      borderWidth: 1,
                      borderRadius: 5,
                      padding: 5,
                      width: "20%",
                      textAlign: "center",
                      color: C.text,
                      outlineWidth: 0,
                      fontSize: 13,
                      marginRight: 20,
                      backgroundColor: C.listItemWhite,
                    }}
                    value={item.maxWaitTimeDays}
                  />
                  <View
                    style={{
                      width: "10%",
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    <BoxButton1
                      onPress={() => {
                        let arr = zSettingsObj.waitTimes.filter(
                          (o) => o.id !== item.id
                        );
                        handleSettingsFieldChange("waitTimes", arr);
                      }}
                      style={{ marginLeft: 15 }}
                      iconSize={15}
                      icon={ICONS.close1}
                    />
                  </View>
                </View>
              );
            }}
          />
        </View>
      </View>
    </BoxContainerInnerComponent>
  );
};

const PartSourcesComponent = ({ zSettingsObj, handleSettingsFieldChange }) => {
  return (
    <BoxContainerInnerComponent
      style={{ width: "100%", alignItems: "center", borderWidth: 0 }}
    >
      {/**Bike brands */}
      <View style={{ width: "100%", alignItems: "center" }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: C.buttonLightGreen,
            borderRadius: 5,
            paddingVertical: 5,
            width: "95%",
          }}
        >
          <Text style={{ color: C.text, marginRight: 20 }}>Part Sources</Text>
          <BoxButton1
            onPress={() => {
              let partSourcesArr = zSettingsObj?.partSources;
              partSourcesArr.push("New part source...");
              handleSettingsFieldChange("partSources", partSourcesArr);
            }}
          />
        </View>
        <View style={{ marginTop: 10, width: "100%" }}>
          <FlatList
            data={zSettingsObj?.partSources || []}
            renderItem={(obj) => {
              let idx = obj.index;
              let partSourceName = obj.item;
              return (
                <View
                  style={{
                    alignItems: "center",
                    width: "100%",
                    flexDirection: "row",
                    justifyContent: "center",
                  }}
                >
                  <TextInput_
                    onChangeText={(val) => {
                      let partSourcesArr = zSettingsObj.partSources;
                      partSourcesArr[idx] = val;
                      handleSettingsFieldChange("partSources", partSourcesArr);
                    }}
                    style={{
                      marginBottom: 5,
                      borderColor: C.buttonLightGreenOutline,
                      borderWidth: 1,
                      borderRadius: 5,
                      padding: 5,
                      width: "80%",
                      textAlign: "center",
                      color: C.text,
                      outlineWidth: 0,
                    }}
                    value={partSourceName}
                  />
                  <BoxButton1
                    onPress={() => {
                      let arr = zSettingsObj.partSources.filter(
                        (name) => name !== partSourceName
                      );
                      handleSettingsFieldChange("partSources", arr);
                    }}
                    style={{ marginLeft: 15 }}
                    iconSize={15}
                    icon={ICONS.close1}
                  />
                </View>
              );
            }}
          />
        </View>
      </View>
    </BoxContainerInnerComponent>
  );
};

// end compile into ListOptionsComponent /////////////////////////////////////////

const StoreInfoComponent = ({ zSettingsObj, handleSettingsFieldChange }) => {
  const [sPickerDay, _sSetPickerDay] = useState(null);
  const [sPickerType, _sSetPickerType] = useState(null);

  if (!zSettingsObj) return null;
  return (
    <BoxContainerOuterComponent style={{ marginBottom: 20 }}>
      <BoxContainerInnerComponent
        style={{ width: "100%", alignItems: "center", paddingVertical: 20 }}
      >
        <View
          style={{
            width: "100%",
            justifyContent: "flex-end",
            flexDirection: "row",
            alignItems: "center",

            // backgroundColor: "green",
          }}
        >
          <Text
            style={{
              textAlign: "right",
              fontColor: C.text,
              width: "30%",
            }}
          >
            Display Name:
          </Text>
          <TextInput_
            style={{
              width: "50%",
              marginLeft: 10,
              borderWidth: 1,
              borderColor: C.buttonLightGreenOutline,
              padding: 3,
              paddingRight: 7,
              textAlign: "right",
              outlineWidth: 0,
            }}
            value={zSettingsObj?.storeInfo.displayName}
            onChangeText={(displayName) => {
              handleSettingsFieldChange("storeInfo", {
                ...zSettingsObj.storeInfo,
                displayName,
              });
            }}
          />
          <CheckBox_
            onCheck={() => {}}
            buttonStyle={{ marginLeft: 7 }}
            text={"Receipt"}
            textStyle={{ fontSize: 12 }}
            isChecked={zSettingsObj?.receiptSetup.includeFieldsInReceipt?.find(
              (o) => o === "displayName"
            )}
          />
        </View>
        <View
          style={{
            width: "100%",
            justifyContent: "flex-end",
            flexDirection: "row",
            alignItems: "center",
            marginTop: 10,

            // backgroundColor: "green",
          }}
        >
          <Text
            style={{
              textAlign: "right",
              fontColor: C.text,
              width: "30%",
            }}
          >
            Phone Number:
          </Text>
          <TextInput
            style={{
              width: "50%",
              marginLeft: 10,
              borderWidth: 1,
              borderColor: C.buttonLightGreenOutline,
              padding: 3,
              paddingRight: 7,
              textAlign: "right",
              outlineWidth: 0,
            }}
            value={formatPhoneWithDashes(zSettingsObj?.storeInfo.phone)}
            onChangeText={(phone) => {
              handleSettingsFieldChange("storeInfo", {
                ...zSettingsObj.storeInfo,
                phone,
              });
            }}
          />
          <CheckBox_
            buttonStyle={{ marginLeft: 7 }}
            text={"Receipt"}
            textStyle={{ fontSize: 12 }}
            isChecked={zSettingsObj?.receiptSetup.includeFieldsInReceipt?.find(
              (o) => o === "phone"
            )}
          />
        </View>

        <View
          style={{
            width: "100%",
            justifyContent: "flex-end",
            flexDirection: "row",
            alignItems: "center",
            marginTop: 10,

            // backgroundColor: "green",
          }}
        >
          <Text
            style={{
              textAlign: "right",
              fontColor: C.text,
              width: "30%",
            }}
          >
            Street:
          </Text>
          <TextInput_
            style={{
              width: "50%",
              marginLeft: 10,
              borderWidth: 1,
              borderColor: C.buttonLightGreenOutline,
              padding: 3,
              paddingRight: 7,
              textAlign: "right",
              outlineWidth: 0,
            }}
            value={zSettingsObj?.storeInfo.street}
            onChangeText={(street) => {
              handleSettingsFieldChange("storeInfo", {
                ...zSettingsObj.storeInfo,
                street,
              });
            }}
          />
          <CheckBox_
            buttonStyle={{ marginLeft: 7 }}
            text={"Receipt"}
            textStyle={{ fontSize: 12 }}
            isChecked={zSettingsObj?.receiptSetup.includeFieldsInReceipt?.find(
              (o) => o === "street"
            )}
          />
        </View>
        <View
          style={{
            width: "100%",
            justifyContent: "flex-end",
            flexDirection: "row",
            alignItems: "center",
            marginTop: 10,

            // backgroundColor: "green",
          }}
        >
          <Text
            style={{
              textAlign: "right",
              fontColor: C.text,
              width: "30%",
            }}
          >
            Unit:
          </Text>
          <TextInput_
            style={{
              width: "50%",
              marginLeft: 10,
              borderWidth: 1,
              borderColor: C.buttonLightGreenOutline,
              padding: 3,
              paddingRight: 7,
              textAlign: "right",
              outlineWidth: 0,
            }}
            value={zSettingsObj?.storeInfo.unit}
            onChangeText={(unit) => {
              handleSettingsFieldChange("storeInfo", {
                ...zSettingsObj?.storeInfo,
                unit,
              });
            }}
          />
          <CheckBox_
            buttonStyle={{ marginLeft: 7 }}
            text={"Receipt"}
            textStyle={{ fontSize: 12 }}
            isChecked={zSettingsObj?.receiptSetup.includeFieldsInReceipt?.find(
              (o) => o === "unit"
            )}
          />
        </View>
        <View
          style={{
            width: "100%",
            justifyContent: "flex-end",
            flexDirection: "row",
            alignItems: "center",
            marginTop: 10,

            // backgroundColor: "green",
          }}
        >
          <Text
            style={{
              textAlign: "right",
              fontColor: C.text,
              width: "30%",
            }}
          >
            City:
          </Text>
          <TextInput_
            style={{
              width: "50%",
              marginLeft: 10,
              borderWidth: 1,
              borderColor: C.buttonLightGreenOutline,
              padding: 3,
              paddingRight: 7,
              textAlign: "right",
              outlineWidth: 0,
            }}
            value={zSettingsObj?.storeInfo.city}
            onChangeText={(city) => {
              handleSettingsFieldChange("storeInfo", {
                ...zSettingsObj?.storeInfo,
                city,
              });
            }}
          />
          <CheckBox_
            buttonStyle={{ marginLeft: 7 }}
            text={"Receipt"}
            textStyle={{ fontSize: 12 }}
            isChecked={zSettingsObj?.receiptSetup.includeFieldsInReceipt?.find(
              (o) => o === "city"
            )}
          />
        </View>
        <View
          style={{
            width: "100%",
            justifyContent: "flex-end",
            flexDirection: "row",
            alignItems: "center",
            marginTop: 10,

            // backgroundColor: "green",
          }}
        >
          <Text
            style={{
              textAlign: "right",
              fontColor: C.text,
              width: "30%",
            }}
          >
            State or Abbrev.
          </Text>
          <TextInput_
            style={{
              width: "50%",
              marginLeft: 10,
              borderWidth: 1,
              borderColor: C.buttonLightGreenOutline,
              padding: 3,
              paddingRight: 7,
              textAlign: "right",
              outlineWidth: 0,
            }}
            value={zSettingsObj?.storeInfo.state}
            onChangeText={(state) => {
              handleSettingsFieldChange("storeInfo", {
                ...zSettingsObj?.storeInfo,
                state,
              });
            }}
          />
          <CheckBox_
            buttonStyle={{ marginLeft: 7 }}
            text={"Receipt"}
            textStyle={{ fontSize: 12 }}
            isChecked={zSettingsObj?.receiptSetup.includeFieldsInReceipt?.find(
              (o) => o === "state"
            )}
          />
        </View>
        <View
          style={{
            width: "100%",
            justifyContent: "flex-end",
            flexDirection: "row",
            alignItems: "center",
            marginTop: 10,

            // backgroundColor: "green",
          }}
        >
          <Text
            style={{
              textAlign: "right",
              fontColor: C.text,
              width: "30%",
            }}
          >
            Zip Code:
          </Text>
          <TextInput_
            style={{
              width: "50%",
              marginLeft: 10,
              borderWidth: 1,
              borderColor: C.buttonLightGreenOutline,
              padding: 3,
              paddingRight: 7,
              textAlign: "right",
              outlineWidth: 0,
            }}
            value={zSettingsObj?.storeInfo.zip}
            onChangeText={(zip) => {
              handleSettingsFieldChange("storeInfo", {
                ...zSettingsObj.storeInfo,
                zip,
              });
            }}
          />
          <CheckBox_
            buttonStyle={{ marginLeft: 7 }}
            text={"Receipt"}
            textStyle={{ fontSize: 12 }}
            isChecked={zSettingsObj?.receiptSetup.includeFieldsInReceipt?.find(
              (o) => o === "zip"
            )}
          />
        </View>
        {/***************** open and closing hours **************************/}
        <View
          style={{
            marginTop: 20,
            borderWidth: 1,
            borderColor: C.buttonLightGreenOutline,
            borderRadius: 5,
            padding: 4,
            width: "100%",
          }}
        >
          {zSettingsObj?.storeHours.standard.map((item, idx) => {
            const openParts = item.open.split(" ");
            const [openH, openM] = openParts[0].split(":").map(Number);
            const openP = openParts[1] || "AM";
            const closeParts = item.close.split(" ");
            const [closeH, closeM] = closeParts[0].split(":").map(Number);
            const closeP = closeParts[1] || "PM";
            const isOpenPicker = sPickerDay === item.id && sPickerType === "open";
            const isClosePicker = sPickerDay === item.id && sPickerType === "close";

            const closePicker = () => { _sSetPickerDay(null); _sSetPickerType(null); };

            const saveTime = (field, hour, minute, period) => {
              const timeStr = hour + ":" + String(minute).padStart(2, "0") + " " + period;
              let standardStoreHours = zSettingsObj.storeHours.standard.map((o) => {
                if (o.id === item.id) return { ...o, [field]: timeStr };
                return o;
              });
              handleSettingsFieldChange("storeHours", {
                standard: standardStoreHours,
                special: zSettingsObj.storeHours.special,
              });
              closePicker();
            };

            return (
              <View key={item.id}>
                <View
                  style={{
                    width: "100%",
                    flexDirection: "row",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      alignItems: "center",
                      width: "25%",
                      textAlign: "right",
                      paddingRight: 20,
                    }}
                  >
                    {getDayOfWeekFrom0To7Input(idx)}
                  </Text>
                  <View
                    style={{
                      width: "55%",
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    <TouchableOpacity
                      onPress={() => {
                        if (isOpenPicker) { closePicker(); }
                        else { _sSetPickerDay(item.id); _sSetPickerType("open"); }
                      }}
                      style={{
                        borderWidth: 1,
                        borderColor: C.buttonLightGreenOutline,
                        borderRadius: 5,
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        backgroundColor: isOpenPicker ? "#e8f0fe" : "transparent",
                      }}
                    >
                      <Text style={{ fontSize: 15 }}>{item.open}</Text>
                    </TouchableOpacity>
                    <Image_
                      style={{ width: 22, height: 12, marginHorizontal: 10 }}
                      icon={ICONS.rightArrowBlue}
                    />
                    <TouchableOpacity
                      onPress={() => {
                        if (isClosePicker) { closePicker(); }
                        else { _sSetPickerDay(item.id); _sSetPickerType("close"); }
                      }}
                      style={{
                        borderWidth: 1,
                        borderColor: C.buttonLightGreenOutline,
                        borderRadius: 5,
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        backgroundColor: isClosePicker ? "#e8f0fe" : "transparent",
                      }}
                    >
                      <Text style={{ fontSize: 15 }}>{item.close}</Text>
                    </TouchableOpacity>
                  </View>
                  <View
                    style={{
                      width: "20%",
                      alignItems: "flex-end",
                    }}
                  >
                    <CheckBox_
                      buttonStyle={{ marginLeft: 20 }}
                      text={"Open"}
                      isChecked={item.isOpen}
                      onCheck={() => {
                        let standardStoreHours =
                          zSettingsObj.storeHours.standard.map((o) => {
                            if (o.id === item.id) {
                              return { ...o, isOpen: !o.isOpen };
                            }
                            return o;
                          });
                        handleSettingsFieldChange("storeHours", {
                          standard: standardStoreHours,
                          special: zSettingsObj.storeHours.special,
                        });
                      }}
                    />
                  </View>
                </View>
                <Modal visible={isOpenPicker} transparent animationType="fade">
                  <TouchableWithoutFeedback onPress={closePicker}>
                    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.3)" }}>
                      <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                        <View>
                          <TimePicker_
                            initialHour={openH}
                            initialMinute={openM}
                            initialPeriod={openP}
                            onConfirm={({ hour, minute, period }) => saveTime("open", hour, minute, period)}
                            onCancel={closePicker}
                          />
                        </View>
                      </TouchableWithoutFeedback>
                    </View>
                  </TouchableWithoutFeedback>
                </Modal>
                <Modal visible={isClosePicker} transparent animationType="fade">
                  <TouchableWithoutFeedback onPress={closePicker}>
                    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.3)" }}>
                      <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                        <View>
                          <TimePicker_
                            initialHour={closeH}
                            initialMinute={closeM}
                            initialPeriod={closeP}
                            onConfirm={({ hour, minute, period }) => saveTime("close", hour, minute, period)}
                            onCancel={closePicker}
                          />
                        </View>
                      </TouchableWithoutFeedback>
                    </View>
                  </TouchableWithoutFeedback>
                </Modal>
              </View>
            );
          })}
        </View>
      </BoxContainerInnerComponent>
    </BoxContainerOuterComponent>
  );
};

const PaymentProcessingComponent = ({
  zSettingsObj,
  handleSettingsFieldChange,
  liveReaders: zLiveReaders = [],
}) => {
  // const [sExpand, _setExpand] = useState();

  return (
    <BoxContainerOuterComponent>
      <BoxContainerInnerComponent>
        <CheckBox_
          isChecked={zSettingsObj?.acceptChecks}
          textStyle={{ fontSize: 15 }}
          buttonStyle={{
            backgroundColor: "transparent",
          }}
          text={"Accepts checks"}
          onCheck={() =>
            handleSettingsFieldChange(
              "acceptChecks",
              !zSettingsObj?.acceptChecks
            )
          }
        />
        <CheckBox_
          isChecked={zSettingsObj?.autoConnectToCardReader}
          textStyle={{ fontSize: 15 }}
          buttonStyle={{
            marginVertical: 10,
            backgroundColor: "transparent",
          }}
          text={"Auto connect to card reader"}
          onCheck={() =>
            handleSettingsFieldChange(
              "autoConnectToCardReader",
              !zSettingsObj?.autoConnectToCardReader
            )
          }
        />
        {/**card reader list — auto-discovered from Stripe */}
        <CardReaderManager
          liveReaders={zLiveReaders}
          savedReaders={zSettingsObj?.cardReaders || []}
          onSaveReaders={(arr) => handleSettingsFieldChange("cardReaders", arr)}
        />
        <View
          style={{
            width: "100%",
            flexDirection: "row",
            justifyContent: "flex-end",
            alignItems: "center",
            marginTop: 20,
          }}
        >
          <Text style={{ marginRight: 20 }}>State Sales Tax:</Text>
          <TextInput
            style={{
              outlineWidth: 0,
              borderRadius: 5,
              textAlign: "right",
              borderWidth: 1,
              borderColor: C.buttonLightGreenOutline,
              paddingHorizontal: 5,
              paddingVertical: 3,
              marginRight: 3,
              width: 75,
            }}
            value={zSettingsObj?.salesTaxPercent || ""}
            onChangeText={(val) => {
              const regex = new RegExp(".", "g");
              let containsDecimalAlready = val.split(".").length > 2;
              if (checkInputForNumbersOnly(val) && !containsDecimalAlready) {
                handleSettingsFieldChange("salesTaxPercent", val);
              }
            }}
          />
          <Text>%</Text>
        </View>
      </BoxContainerInnerComponent>
    </BoxContainerOuterComponent>
  );
};

const PrintersComponent = ({ zSettingsObj, handleSettingsFieldChange }) => {
  const printersObj = zSettingsObj?.printers || {};
  const printersList = Object.values(printersObj);
  const selectedPrinterID = zSettingsObj?.selectedPrinterID || "";

  return (
    <>
    <BoxContainerOuterComponent style={{ marginTop: 20 }}>
      <BoxContainerInnerComponent>
        <View style={{ width: "100%", marginBottom: 10 }}>
          <Text style={{ fontSize: 12, color: gray(0.6) }}>PRINTERS</Text>
        </View>
        {printersList.length === 0 && (
          <Text style={{ fontSize: 13, color: gray(0.5) }}>No printers configured</Text>
        )}
        {printersList.map((printer, idx) => (
          <View
            key={printer.id || idx}
            style={{
              borderRadius: 8,
              borderWidth: 1,
              borderColor: selectedPrinterID === printer.id ? C.green : C.buttonLightGreenOutline,
              backgroundColor: C.backgroundListWhite,
              padding: 10,
              marginBottom: idx < printersList.length - 1 ? 8 : 0,
              width: "100%",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: printer.online === true ? C.green : C.red, marginRight: 8 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: C.text }}>{printer.label || "Unlabeled"}</Text>
                <Text style={{ fontSize: 12, color: gray(0.5), marginTop: 2 }}>{printer.printerName || "—"}</Text>
              </View>
            </View>
            <CheckBox_
              isChecked={selectedPrinterID === printer.id}
              text="Use this printer"
              textStyle={{ fontSize: 13 }}
              buttonStyle={{ backgroundColor: "transparent", marginTop: 8 }}
              onCheck={() => handleSettingsFieldChange("selectedPrinterID", printer.id)}
            />
          </View>
        ))}
      </BoxContainerInnerComponent>
    </BoxContainerOuterComponent>
    <BoxContainerOuterComponent style={{ marginTop: 20 }}>
      <BoxContainerInnerComponent>
        <View style={{ width: "100%", marginBottom: 10 }}>
          <Text style={{ fontSize: 12, color: gray(0.6) }}>INTAKE RECEIPTS</Text>
        </View>
        <CheckBox_
          isChecked={zSettingsObj?.autoPrintIntakeReceipt}
          textStyle={{ fontSize: 15 }}
          buttonStyle={{ backgroundColor: "transparent" }}
          text={"Auto print intake receipt"}
          onCheck={() =>
            handleSettingsFieldChange("autoPrintIntakeReceipt", !zSettingsObj?.autoPrintIntakeReceipt)
          }
        />
        <CheckBox_
          isChecked={zSettingsObj?.autoSMSIntakeReceipt}
          textStyle={{ fontSize: 15 }}
          buttonStyle={{ backgroundColor: "transparent" }}
          text={"Auto SMS intake receipt"}
          onCheck={() =>
            handleSettingsFieldChange("autoSMSIntakeReceipt", !zSettingsObj?.autoSMSIntakeReceipt)
          }
        />
        <CheckBox_
          isChecked={zSettingsObj?.autoEmailIntakeReceipt}
          textStyle={{ fontSize: 15 }}
          buttonStyle={{ backgroundColor: "transparent" }}
          text={"Auto email intake receipt"}
          onCheck={() =>
            handleSettingsFieldChange("autoEmailIntakeReceipt", !zSettingsObj?.autoEmailIntakeReceipt)
          }
        />
      </BoxContainerInnerComponent>
    </BoxContainerOuterComponent>
    <BoxContainerOuterComponent style={{ marginTop: 20 }}>
      <BoxContainerInnerComponent>
        <View style={{ width: "100%", marginBottom: 10 }}>
          <Text style={{ fontSize: 12, color: gray(0.6) }}>SALES RECEIPTS</Text>
        </View>
        <CheckBox_
          isChecked={zSettingsObj?.autoPrintSalesReceipt}
          textStyle={{ fontSize: 15 }}
          buttonStyle={{ backgroundColor: "transparent" }}
          text={"Auto print sales receipt"}
          onCheck={() =>
            handleSettingsFieldChange("autoPrintSalesReceipt", !zSettingsObj?.autoPrintSalesReceipt)
          }
        />
        <CheckBox_
          isChecked={zSettingsObj?.autoSMSSalesReceipt}
          textStyle={{ fontSize: 15 }}
          buttonStyle={{ backgroundColor: "transparent" }}
          text={"Auto SMS sales receipt"}
          onCheck={() =>
            handleSettingsFieldChange("autoSMSSalesReceipt", !zSettingsObj?.autoSMSSalesReceipt)
          }
        />
        <CheckBox_
          isChecked={zSettingsObj?.autoEmailSalesReceipt}
          textStyle={{ fontSize: 15 }}
          buttonStyle={{ backgroundColor: "transparent" }}
          text={"Auto email sales receipt"}
          onCheck={() =>
            handleSettingsFieldChange("autoEmailSalesReceipt", !zSettingsObj?.autoEmailSalesReceipt)
          }
        />
      </BoxContainerInnerComponent>
    </BoxContainerOuterComponent>
    </>
  );
};

const WorkorderStatusesComponent = ({
  zSettingsObj,
  handleSettingsFieldChange,
}) => {
  const [sColorModalItem, _setColorModalItem] = useState(null);
  const [sModalBgColor, _setModalBgColor] = useState("");
  const [sModalTextColor, _setModalTextColor] = useState("");
  const [sEditableInputIdx, _setEditableInputIdx] = useState(null);
  const [sDragIdx, _setDragIdx] = useState(null);
  const [sDragOverIdx, _setDragOverIdx] = useState(null);
  const [sShowAutoText, _setShowAutoText] = useState(false);

  function reorderStatuses(fromIdx, toIdx) {
    if (fromIdx === null || toIdx === null || fromIdx === toIdx) return;
    let statuses = [...(zSettingsObj?.statuses || [])];
    let [dragged] = statuses.splice(fromIdx, 1);
    statuses.splice(toIdx, 0, dragged);
    handleSettingsFieldChange("statuses", statuses);
  }

  let statuses = zSettingsObj?.statuses || [];

  return (
    <BoxContainerOuterComponent style={{}}>
      <BoxContainerInnerComponent
        style={{
          backgroundColor: "transparent",
          borderWidth: 0,
          alignItems: "center",
          paddingHorizontal: 0,
          paddingVertical: 0,
          width: "100%",
        }}
      >
        <View
          style={{
            width: "100%",
            alignItems: "center",
            borderWidth: 1,
            paddingBottom: 30,
            paddingTop: 13,
            paddingHorizontal: 10,
            borderColor: C.buttonLightGreenOutline,
            backgroundColor: C.backgroundListWhite,
            borderRadius: 10,
          }}
        >
          {/* Status Auto-Text show/hide */}
          <View style={{ width: "100%", marginBottom: 12 }}>
            <TouchableOpacity
              onPress={() => _setShowAutoText(!sShowAutoText)}
              style={{ flexDirection: "row", alignItems: "center", marginBottom: sShowAutoText ? 8 : 0 }}
            >
              <Text style={{ fontSize: 13, color: gray(0.5), fontWeight: "600" }}>
                {sShowAutoText ? "Status Auto-Text  \u25B2" : "Status Auto-Text  \u25BC"}
              </Text>
            </TouchableOpacity>
            {sShowAutoText && (
              <StatusAutoTextSection
                zSettingsObj={zSettingsObj}
                handleSettingsFieldChange={handleSettingsFieldChange}
              />
            )}
          </View>

          <View style={{ width: "100%", alignItems: "flex-start" }}>
            <BoxButton1
              style={{
                marginBottom: 10,
                alignSelf: "flex-start",
              }}
              onPress={() => {
                let proto = {};
                Object.keys(zSettingsObj.statuses[0]).forEach((key) => {
                  proto[key] = "";
                });
                proto.label = "New Status";
                proto.id = generateRandomID();
                proto.backgroundColor = gray(0.3);
                proto.textColor = C.text;
                proto.removable = true;
                proto.requireWaitTime = false;
                let newStatuses = [proto, ...zSettingsObj.statuses];
                handleSettingsFieldChange("statuses", newStatuses);
              }}
            />
          </View>
          {statuses.map((item, idx) => {
            let isEditing = sEditableInputIdx === idx;
            return (
              <div
                key={item.id}
                style={{
                  flexDirection: "column",
                  alignItems: "center",
                  width: "100%",
                }}
              >
                <div
                  draggable
                  onDragStart={() => _setDragIdx(idx)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    _setDragOverIdx(idx);
                  }}
                  onDragEnd={() => {
                    _setDragIdx(null);
                    _setDragOverIdx(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    reorderStatuses(sDragIdx, idx);
                    _setDragIdx(null);
                    _setDragOverIdx(null);
                  }}
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    width: "100%",
                    alignItems: "center",
                    borderWidth: sDragOverIdx === idx ? 2 : 1,
                    borderStyle: "solid",
                    borderColor:
                      sDragOverIdx === idx
                        ? C.blue
                        : C.buttonLightGreenOutline,
                    borderRadius: 8,
                    backgroundColor: C.listItemWhite,
                    padding: 6,
                    marginBottom: 4,
                    cursor: "grab",
                    opacity: sDragIdx === idx ? 0.5 : 1,
                    position: "relative",
                    boxSizing: "border-box",
                  }}
                >
                  {/* Status color bar + label */}
                  <View
                    style={{
                      backgroundColor: item.backgroundColor,
                      alignItems: "center",
                      flexDirection: "row",
                      flex: 1,
                      minHeight: 35,
                      borderRadius: 5,
                    }}
                  >
                    {!item.removable && (
                      <View style={{ width: "10%" }} />
                    )}
                    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                      <TextInput_
                        style={{
                          width: "100%",
                          textAlign: "center",
                          color: item.textColor,
                          outlineWidth: 0,
                          paddingVertical: 4,
                          fontSize: 13,
                          borderWidth: 1,
                          borderColor:
                            isEditing && item.removable
                              ? gray(0.4)
                              : "transparent",
                        }}
                        onChangeText={(val) => {
                          let newStatuses = zSettingsObj.statuses.map((o) => {
                            if (o.id === item.id) return { ...o, label: val };
                            return o;
                          });
                          handleSettingsFieldChange("statuses", newStatuses);
                        }}
                        editable={isEditing && item.removable}
                        autoFocus={isEditing}
                        value={item.label}
                      />
                      {!!zSettingsObj?.waitTimeLinkedStatus?.[item.id] && (
                        <Text style={{ color: item.textColor, fontSize: 10, textAlign: "center", marginTop: -2 }}>
                          <Text style={{ fontStyle: "italic" }}>{"Wait time: "}</Text>
                          {zSettingsObj.waitTimeLinkedStatus[item.id].label}
                        </Text>
                      )}
                    </View>
                    {!item.removable && (
                      <View
                        style={{
                          width: "10%",
                          height: "100%",
                          alignItems: "flex-end",
                          justifyContent: "flex-start",
                          padding: 3,
                        }}
                      >
                        <Image_ icon={ICONS.blocked} size={15} />
                      </View>
                    )}
                  </View>
                  {/* Controls: edit, delete, color pickers */}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginLeft: 10,
                    }}
                  >
                    <Tooltip text="Edit label" position="top">
                      <BoxButton1
                        style={{ paddingHorizontal: 5 }}
                        iconSize={17}
                        icon={isEditing ? ICONS.clickHere : ICONS.editPencil}
                        onPress={() =>
                          _setEditableInputIdx(
                            isEditing ? null : idx
                          )
                        }
                      />
                    </Tooltip>
                    <Tooltip text="Delete status" position="top">
                      <BoxButton1
                        style={{ paddingHorizontal: 5 }}
                        iconSize={15}
                        icon={ICONS.close1}
                        onPress={() => {
                          let newStatuses = zSettingsObj.statuses.filter(
                            (o) => o.id != item.id
                          );
                          handleSettingsFieldChange("statuses", newStatuses);
                        }}
                      />
                    </Tooltip>
                    <Tooltip text="Edit colors" position="top">
                      <BoxButton1
                        style={{ paddingHorizontal: 5 }}
                        iconSize={23}
                        icon={ICONS.colorWheel}
                        onPress={() => {
                          _setColorModalItem(item);
                          _setModalBgColor(item.backgroundColor);
                          _setModalTextColor(item.textColor);
                        }}
                      />
                    </Tooltip>
                    <Tooltip text="Link wait time" position="top">
                      <DropdownMenu
                        dataArr={[
                          { id: "__none__", label: "No linked wait time" },
                          ...(zSettingsObj?.waitTimes || []),
                        ]}
                        onSelect={(selected) => {
                          let updated = { ...(zSettingsObj?.waitTimeLinkedStatus || {}) };
                          if (selected.id === "__none__") {
                            delete updated[item.id];
                          } else {
                            updated[item.id] = selected;
                          }
                          handleSettingsFieldChange("waitTimeLinkedStatus", updated);
                        }}
                        buttonIcon={ICONS.clock}
                        buttonIconSize={18}
                        buttonStyle={{
                          backgroundColor: "transparent",
                          borderWidth: 0,
                          paddingHorizontal: 5,
                          paddingVertical: 0,
                        }}
                        buttonText={""}
                        modalCoordX={-120}
                        modalCoordY={30}
                        menuMaxHeight={300}
                      />
                    </Tooltip>
                    <Tooltip text="Require wait time" position="top">
                      <CheckBox_
                        text=""
                        isChecked={!!item.requireWaitTime}
                        onCheck={() => {
                          let newStatuses = zSettingsObj.statuses.map((o) => {
                            if (o.id === item.id) return { ...o, requireWaitTime: !o.requireWaitTime };
                            return o;
                          });
                          handleSettingsFieldChange("statuses", newStatuses);
                        }}
                        buttonStyle={{ marginLeft: 5 }}
                      />
                    </Tooltip>
                  </View>
                  {/* Drag direction indicators */}
                  {sDragOverIdx === idx && sDragIdx !== null && sDragIdx !== idx && sDragIdx > idx && (
                    <Image_
                      icon={ICONS.backRed}
                      size={14}
                      style={{
                        position: "absolute",
                        bottom: 4,
                        left: 4,
                      }}
                    />
                  )}
                  {sDragOverIdx === idx && sDragIdx !== null && sDragIdx !== idx && sDragIdx < idx && (
                    <Image_
                      icon={ICONS.rightArrowBlue}
                      size={14}
                      style={{
                        position: "absolute",
                        bottom: 4,
                        left: 4,
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </View>
      </BoxContainerInnerComponent>

      {/* Color picker modal */}
      {!!sColorModalItem && createPortal(
        <View
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 9999,
          }}
        >
          <View
            style={{
              backgroundColor: C.backgroundListWhite,
              borderRadius: 10,
              padding: 30,
              alignItems: "center",
              maxWidth: 650,
              width: "90%",
              borderWidth: 2,
              borderColor: C.buttonLightGreenOutline,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "600", color: C.text, marginBottom: 20 }}>
              Edit Status Colors
            </Text>

            {/* Live preview */}
            <View
              style={{
                backgroundColor: sModalBgColor,
                borderRadius: 5,
                paddingVertical: 10,
                paddingHorizontal: 30,
                alignItems: "center",
                justifyContent: "center",
                minWidth: 200,
                marginBottom: 25,
              }}
            >
              <Text style={{ color: sModalTextColor, fontSize: 14, fontWeight: "500" }}>
                {sColorModalItem.label}
              </Text>
            </View>

            {/* Two color wheels side by side */}
            <View style={{ flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: 30 }}>
              <View style={{ alignItems: "center" }}>
                <Text style={{ fontSize: 13, color: C.text, marginBottom: 8, fontWeight: "500" }}>
                  Background Color
                </Text>
                <ColorWheel
                  key={"bg-" + sColorModalItem.id}
                  initialColor={sModalBgColor}
                  onColorChange={(val) => {
                    _setModalBgColor(val.hex);
                    _setModalTextColor(bestForegroundHex(val.hex));
                  }}
                />
              </View>
              <View style={{ alignItems: "center" }}>
                <Text style={{ fontSize: 13, color: C.text, marginBottom: 8, fontWeight: "500" }}>
                  Text Color
                </Text>
                <ColorWheel
                  key={"text-" + sColorModalItem.id}
                  initialColor={sModalTextColor}
                  onColorChange={(val) => {
                    _setModalTextColor(val.hex);
                  }}
                />
              </View>
            </View>

            {/* Action buttons */}
            <View style={{ flexDirection: "row", justifyContent: "center", marginTop: 25, gap: 15 }}>
              <Button_
                text="Save Changes"
                colorGradientArr={COLOR_GRADIENTS.green}
                onPress={() => {
                  let newStatuses = zSettingsObj.statuses.map((o) => {
                    if (o.id === sColorModalItem.id)
                      return { ...o, backgroundColor: sModalBgColor, textColor: sModalTextColor };
                    return o;
                  });
                  handleSettingsFieldChange("statuses", newStatuses);
                  _setColorModalItem(null);
                }}
              />
              <Button_
                text="Exit (discard any changes)"
                colorGradientArr={COLOR_GRADIENTS.grey}
                onPress={() => _setColorModalItem(null)}
              />
            </View>
          </View>
        </View>,
        document.body
      )}
    </BoxContainerOuterComponent>
  );
};

const StatusAutoTextSection = ({ zSettingsObj, handleSettingsFieldChange }) => {
  let rules = zSettingsObj?.statusAutoText || [];
  let statuses = zSettingsObj?.statuses || [];
  let smsTemplates = zSettingsObj?.smsTemplates || [];
  let emailTemplates = zSettingsObj?.emailTemplates || [];
  let usedStatusIDs = rules.map((r) => r.statusID);

  function updateRule(ruleID, field, value) {
    let updated = rules.map((r) => (r.id === ruleID ? { ...r, [field]: value } : r));
    handleSettingsFieldChange("statusAutoText", updated);
  }

  function deleteRule(ruleID) {
    handleSettingsFieldChange("statusAutoText", rules.filter((r) => r.id !== ruleID));
  }

  function addRule() {
    let newRule = { ...STATUS_AUTO_TEXT_PROTO, id: generateRandomID() };
    handleSettingsFieldChange("statusAutoText", [...rules, newRule]);
  }

  function getStatusLabel(statusID) {
    let s = statuses.find((o) => o.id === statusID);
    return s ? s.label : "Select Status";
  }

  function getTemplateLabel(templateID, templates) {
    if (!templateID) return "None";
    let t = templates.find((o) => o.id === templateID);
    return t ? t.label : "None";
  }

  return (
    <View style={{ width: "100%", paddingHorizontal: 4 }}>
      <BoxButton1
        style={{ alignSelf: "flex-start", marginBottom: 8 }}
        onPress={addRule}
      />
      {rules.map((rule) => {
        let availableStatuses = statuses.filter(
          (s) => s.id === rule.statusID || !usedStatusIDs.includes(s.id)
        );
        let statusObj = statuses.find((s) => s.id === rule.statusID);
        return (
          <View
            key={rule.id}
            style={{
              width: "100%",
              borderWidth: 1,
              borderColor: C.buttonLightGreenOutline,
              borderRadius: 8,
              backgroundColor: C.listItemWhite,
              padding: 10,
              marginBottom: 8,
            }}
          >
            {/* Status selector */}
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
              <Text style={{ fontSize: 12, color: gray(0.5), width: 70 }}>Status</Text>
              <DropdownMenu
                dataArr={availableStatuses.map((s) => ({ label: s.label, id: s.id }))}
                onSelect={(val) => updateRule(rule.id, "statusID", val.id)}
                buttonText={getStatusLabel(rule.statusID)}
                buttonStyle={{
                  flex: 1,
                  backgroundColor: statusObj?.backgroundColor || gray(0.1),
                  paddingVertical: 6,
                  borderRadius: 6,
                }}
                buttonTextStyle={{
                  color: statusObj?.textColor || C.text,
                  fontSize: 12,
                  fontWeight: "500",
                }}
              />
            </View>

            {/* SMS template selector */}
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
              <Text style={{ fontSize: 12, color: gray(0.5), width: 70 }}>SMS</Text>
              <DropdownMenu
                dataArr={[{ label: "None", id: "" }, ...smsTemplates.map((t) => ({ label: t.label, id: t.id }))]}
                onSelect={(val) => updateRule(rule.id, "smsTemplateID", val.id)}
                buttonText={getTemplateLabel(rule.smsTemplateID, smsTemplates)}
                buttonStyle={{
                  flex: 1,
                  paddingVertical: 6,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: gray(0.15),
                }}
                buttonTextStyle={{ fontSize: 12, color: C.text }}
              />
            </View>

            {/* Email template selector */}
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
              <Text style={{ fontSize: 12, color: gray(0.5), width: 70 }}>Email</Text>
              <DropdownMenu
                dataArr={[{ label: "None", id: "" }, ...emailTemplates.map((t) => ({ label: t.label, id: t.id }))]}
                onSelect={(val) => updateRule(rule.id, "emailTemplateID", val.id)}
                buttonText={getTemplateLabel(rule.emailTemplateID, emailTemplates)}
                buttonStyle={{
                  flex: 1,
                  paddingVertical: 6,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: gray(0.15),
                }}
                buttonTextStyle={{ fontSize: 12, color: C.text }}
              />
            </View>

            {/* Delay inputs */}
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
              <Text style={{ fontSize: 12, color: gray(0.5), width: 70 }}>Delay</Text>
              <TextInput_
                value={String(rule.delayMinutes || 0)}
                onChangeText={(val) => {
                  let num = parseInt(val, 10);
                  if (isNaN(num) || num < 0) num = 0;
                  updateRule(rule.id, "delayMinutes", num);
                }}
                style={{
                  width: 50,
                  height: 30,
                  borderWidth: 1,
                  borderColor: gray(0.15),
                  borderRadius: 6,
                  paddingHorizontal: 6,
                  textAlign: "center",
                  fontSize: 12,
                  outlineWidth: 0,
                }}
              />
              <Text style={{ fontSize: 11, color: gray(0.4), marginHorizontal: 4 }}>min</Text>
              <TextInput_
                value={String(rule.delaySeconds || 0)}
                onChangeText={(val) => {
                  let num = parseInt(val, 10);
                  if (isNaN(num) || num < 0) num = 0;
                  if (num > 59) num = 59;
                  updateRule(rule.id, "delaySeconds", num);
                }}
                style={{
                  width: 50,
                  height: 30,
                  borderWidth: 1,
                  borderColor: gray(0.15),
                  borderRadius: 6,
                  paddingHorizontal: 6,
                  textAlign: "center",
                  fontSize: 12,
                  outlineWidth: 0,
                }}
              />
              <Text style={{ fontSize: 11, color: gray(0.4), marginHorizontal: 4 }}>sec</Text>
            </View>

            {/* Delete button */}
            <TouchableOpacity
              onPress={() => deleteRule(rule.id)}
              style={{ alignSelf: "flex-end" }}
            >
              <Text style={{ fontSize: 11, color: C.lightred, fontWeight: "500" }}>Delete</Text>
            </TouchableOpacity>
          </View>
        );
      })}
      {rules.length === 0 && (
        <Text style={{ fontSize: 11, color: gray(0.4), fontStyle: "italic" }}>
          No auto-text rules configured. Tap + to add one.
        </Text>
      )}
    </View>
  );
};

const QuickItemButtonsComponent = ({
  zSettingsObj,
  handleSettingsFieldChange,
}) => {
  const sCurrentParentID = useTabNamesStore((state) => state.getDashboardQBParentID());
  const _setCurrentParentID = useTabNamesStore((state) => state.setDashboardQBParentID);
  const sMenuPath = useTabNamesStore((state) => state.getDashboardQBMenuPath());
  const _setMenuPath = (valOrFn) => {
    if (typeof valOrFn === "function") {
      let current = useTabNamesStore.getState().getDashboardQBMenuPath();
      useTabNamesStore.getState().setDashboardQBMenuPath(valOrFn(current));
    } else {
      useTabNamesStore.getState().setDashboardQBMenuPath(valOrFn);
    }
  };
  const [sDragIdx, _setDragIdx] = useState(null);
  const [sDragOverIdx, _setDragOverIdx] = useState(null);
  const [sEditingID, _setEditingID] = useState(null);
  const [sShowInvSearchModal, _setShowInvSearchModal] = useState(false);
  const zInventoryArr = useInventoryStore((state) => state.inventoryArr);

  function getDescendantIDs(buttonID, allButtons) {
    let descendants = [];
    let children = allButtons.filter((b) => b.parentID === buttonID);
    children.forEach((child) => {
      descendants.push(child.id);
      descendants.push(...getDescendantIDs(child.id, allButtons));
    });
    return descendants;
  }

  function getChildCount(buttonID) {
    return (zSettingsObj?.quickItemButtons || []).filter(
      (b) => b.parentID === buttonID
    ).length;
  }

  function drillIn(btn) {
    _setMenuPath((prev) => [...prev, { id: btn.id, name: btn.name }]);
    _setCurrentParentID(btn.id);
  }

  function handleBack() {
    let path = [...sMenuPath];
    path.pop();
    _setMenuPath(path);
    _setCurrentParentID(path.length > 0 ? path[path.length - 1].id : null);
  }

  function handleDelete(btn) {
    if (btn.id === "labor" || btn.id === "part") return;
    let deletedParentID = btn.parentID || null;
    let updated = zSettingsObj.quickItemButtons
      .filter((o) => o.id !== btn.id)
      .map((o) =>
        o.parentID === btn.id ? { ...o, parentID: deletedParentID } : o
      );
    useSettingsStore.getState().setField("quickItemButtons", updated);
  }

  function handleNameChange(btn, val) {
    handleSettingsFieldChange(
      "quickItemButtons",
      zSettingsObj.quickItemButtons.map((o) =>
        o.id === btn.id ? { ...o, name: val } : o
      )
    );
  }

  function handleAdd() {
    let newID = generateRandomID();
    let quickButtonsArr = [...(zSettingsObj?.quickItemButtons || [])];
    quickButtonsArr.push({
      id: newID,
      name: "",
      parentID: sCurrentParentID,
      items: [],
    });
    handleSettingsFieldChange("quickItemButtons", quickButtonsArr);
    _setEditingID(newID);
  }

  function handleAddItemsToButton(itemIDs) {
    if (!sCurrentParentID) return;
    let updated = (zSettingsObj?.quickItemButtons || []).map((b) => {
      if (b.id !== sCurrentParentID) return b;
      let existing = b.items || [];
      let newIDs = itemIDs.filter((id) => !existing.includes(id));
      return { ...b, items: [...existing, ...newIDs] };
    });
    handleSettingsFieldChange("quickItemButtons", updated);
  }

  function InventorySearchModal() {
    const [sInvSearch, _setInvSearch] = useState("");
    const [sInvResults, _setInvResults] = useState([]);
    const [sSelectedIDs, _setSelectedIDs] = useState(new Set());

    const parentBtn = (zSettingsObj?.quickItemButtons || []).find((b) => b.id === sCurrentParentID);
    const parentName = parentBtn?.name || "(unnamed)";

    function doSearch(val) {
      _setInvSearch(val);
      if (!val || val.length < 3) { _setInvResults([]); return; }
      _setInvResults(searchInventory(val, zInventoryArr));
    }

    function clearSearch() {
      _setInvSearch("");
      _setInvResults([]);
    }

    function toggleSelected(id) {
      _setSelectedIDs((prev) => {
        let next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
    }

    function handleSingleSelect(id) {
      handleAddItemsToButton([id]);
      _setShowInvSearchModal(false);
    }

    function handleMultiSelect() {
      if (sSelectedIDs.size === 0) return;
      handleAddItemsToButton([...sSelectedIDs]);
      _setShowInvSearchModal(false);
    }

    return createPortal(
      <div
        style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0,0,0,0.45)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 9999,
        }}
        onClick={() => _setShowInvSearchModal(false)}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 550,
            height: window.innerHeight - 100,
            backgroundColor: C.backgroundWhite,
            borderRadius: 12,
            border: "1px solid " + C.buttonLightGreenOutline,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderBottomWidth: 1,
              borderBottomColor: gray(0.1),
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "bold", color: C.text }}>
              {"Add items to "}
              <Text style={{ color: C.green }}>{parentName}</Text>
            </Text>
            <Button_
              icon={ICONS.close1}
              iconSize={28}
              onPress={() => _setShowInvSearchModal(false)}
              buttonStyle={{ backgroundColor: "transparent", paddingHorizontal: 0, paddingVertical: 0, marginBottom: 0 }}
            />
          </View>

          {/* Search bar */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingVertical: 8,
            }}
          >
            <Button_
              icon={ICONS.reset1}
              iconSize={20}
              onPress={clearSearch}
              useColorGradient={false}
            />
            <TextInput_
              autoFocus={true}
              style={{
                flex: 1,
                borderBottomWidth: 1,
                borderBottomColor: gray(0.2),
                fontSize: 18,
                color: C.text,
                outlineWidth: 0,
                outlineStyle: "none",
                paddingVertical: 4,
                marginLeft: 8,
              }}
              placeholder="Search inventory"
              placeholderTextColor={gray(0.2)}
              value={sInvSearch}
              onChangeText={doSearch}
            />
          </View>

          {/* Select Items button — always visible, disabled when 0 selected */}
          <View style={{ paddingHorizontal: 16, paddingVertical: 6 }}>
            <Button_
              text={sSelectedIDs.size > 0 ? "Select Items (" + sSelectedIDs.size + ")" : "Select Items"}
              onPress={handleMultiSelect}
              enabled={sSelectedIDs.size > 0}
              colorGradientArr={COLOR_GRADIENTS.green}
              buttonStyle={{ borderRadius: 6, paddingVertical: 8, opacity: sSelectedIDs.size > 0 ? 1 : 0.4 }}
              textStyle={{ fontSize: 13, color: C.textWhite }}
            />
          </View>

          {/* Results */}
          <FlatList
            data={sInvResults}
            keyExtractor={(item) => item.id}
            style={{ flex: 1, paddingHorizontal: 8 }}
            renderItem={({ item, index }) => {
              let isChecked = sSelectedIDs.has(item.id);
              return (
                <div
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.7"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    borderRadius: 6,
                    border: "1px solid " + gray(0.12),
                    backgroundColor: index % 2 === 0 ? C.backgroundListWhite : gray(0.04),
                    marginBottom: 2,
                    paddingTop: 6,
                    paddingBottom: 6,
                    paddingLeft: 6,
                    paddingRight: 6,
                    cursor: "pointer",
                  }}
                >
                  <CheckBox_
                    isChecked={isChecked}
                    onCheck={() => toggleSelected(item.id)}
                    buttonStyle={{ marginRight: 4 }}
                  />
                  <TouchableOpacity
                    onPress={() => handleSingleSelect(item.id)}
                    style={{ flex: 1, flexDirection: "row", alignItems: "center" }}
                  >
                    <View style={{ flex: 1, paddingLeft: 4 }}>
                      <Text style={{ fontSize: 14, color: C.text }} numberOfLines={1}>
                        {item.informalName || item.formalName}
                      </Text>
                      {!!item.informalName && (
                        <Text style={{ fontSize: 11, color: gray(0.4) }} numberOfLines={1}>
                          {item.formalName}
                        </Text>
                      )}
                    </View>
                    <Text style={{ fontSize: 13, color: C.text, marginLeft: 8 }}>
                      {"$" + formatCurrencyDisp(item.price)}
                    </Text>
                  </TouchableOpacity>
                </div>
              );
            }}
          />
        </div>
      </div>,
      document.body
    );
  }

  function reorderSubButtons(fromIdx, toIdx) {
    if (fromIdx === null || toIdx === null || fromIdx === toIdx) return;
    let allButtons = [...zSettingsObj.quickItemButtons];
    let children = allButtons.filter(
      (b) => sCurrentParentID === null ? !b.parentID : b.parentID === sCurrentParentID
    );
    let [dragged] = children.splice(fromIdx, 1);
    children.splice(toIdx, 0, dragged);
    let childIndex = 0;
    let isMatch = sCurrentParentID === null ? (b) => !b.parentID : (b) => b.parentID === sCurrentParentID;
    let result = allButtons.map((b) => {
      if (isMatch(b)) return children[childIndex++];
      return b;
    });
    handleSettingsFieldChange("quickItemButtons", result);
  }

  let allButtons = zSettingsObj?.quickItemButtons || [];
  let topLevelButtons = allButtons.filter((b) => !b.parentID);
  let currentChildren = allButtons.filter(
    (b) => b.parentID === sCurrentParentID
  );

  function renderButtonCard(btn, idx, isDraggable, isColumn) {
    let isEditing = sEditingID === btn.id;
    let childCount = getChildCount(btn.id);
    return (
      <div
        key={btn.id}
        draggable={isDraggable}
        onDragStart={isDraggable ? () => _setDragIdx(idx) : undefined}
        onDragOver={
          isDraggable
            ? (e) => {
                e.preventDefault();
                _setDragOverIdx(idx);
              }
            : undefined
        }
        onDragEnd={
          isDraggable
            ? () => {
                _setDragIdx(null);
                _setDragOverIdx(null);
              }
            : undefined
        }
        onDrop={
          isDraggable
            ? (e) => {
                e.preventDefault();
                reorderSubButtons(sDragIdx, idx);
                _setDragIdx(null);
                _setDragOverIdx(null);
              }
            : undefined
        }
        onMouseEnter={(e) => {
          if (!isEditing) e.currentTarget.style.opacity = "0.7";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = "1";
        }}
        style={{
          width: isColumn ? "100%" : 170,
          minHeight: isColumn ? 44 : 60,
          margin: 4,
          padding: 8,
          display: "flex",
          flexDirection: isColumn ? "row" : "column",
          borderWidth: isDraggable && sDragOverIdx === idx ? 2 : 1,
          borderStyle: "solid",
          borderColor:
            isDraggable && sDragOverIdx === idx
              ? C.blue
              : C.buttonLightGreenOutline,
          borderRadius: 8,
          backgroundColor: isEditing ? "rgb(245,166,35)" : C.listItemWhite,
          alignItems: "center",
          justifyContent: isColumn ? "flex-start" : "center",
          position: "relative",
          cursor: isDraggable ? "grab" : "pointer",
          opacity: isDraggable && sDragIdx === idx ? 0.5 : 1,
          boxSizing: "border-box",
        }}
      >
        {/* Name area */}
        {isEditing ? (
          <TextInput_
            autoFocus={true}
            onChangeText={(val) => handleNameChange(btn, val)}
            placeholder="Enter name..."
            placeholderTextColor={gray(0.3)}
            style={{
              flex: isColumn ? 1 : undefined,
              width: isColumn ? undefined : "100%",
              paddingHorizontal: 5,
              paddingVertical: 3,
              fontSize: 13,
              textAlign: isColumn ? "left" : "center",
              color: C.text,
              outlineWidth: 0,
              outlineStyle: "none",
            }}
            value={btn.name}
          />
        ) : (
          <TouchableOpacity
            onPress={() => drillIn(btn)}
            style={{
              flex: isColumn ? 1 : undefined,
              width: isColumn ? undefined : "100%",
              cursor: "pointer",
            }}
          >
            <Text
              style={{
                width: "100%",
                fontSize: 13,
                textAlign: isColumn ? "left" : "center",
                color: C.text,
                paddingHorizontal: 5,
                paddingVertical: 3,
              }}
              numberOfLines={1}
            >
              {btn.name || "(unnamed)"}
            </Text>
          </TouchableOpacity>
        )}
        {/* Controls row: badge + edit + delete */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            marginTop: isColumn ? 0 : 4,
            marginLeft: isColumn ? 8 : 0,
          }}
        >
          {childCount > 0 && (
            <View
              style={{
                backgroundColor: C.blue,
                borderRadius: 8,
                minWidth: 16,
                height: 16,
                alignItems: "center",
                justifyContent: "center",
                marginRight: 6,
              }}
            >
              <Text
                style={{
                  color: C.textWhite,
                  fontSize: 10,
                  fontWeight: "bold",
                  paddingHorizontal: 4,
                }}
              >
                {childCount}
              </Text>
            </View>
          )}
          <BoxButton1
            onPress={() =>
              _setEditingID(isEditing ? null : btn.id)
            }
            iconSize={isEditing ? 37 : 17}
            icon={isEditing ? ICONS.clickHere : ICONS.editPencil}
          />
          <BoxButton1
            onPress={() => handleDelete(btn)}
            style={{ marginLeft: 6 }}
            iconSize={17}
            icon={ICONS.close1}
          />
        </View>
        {isDraggable && sDragOverIdx === idx && sDragIdx !== null && sDragIdx !== idx && sDragIdx > idx && (
          <Image_
            icon={ICONS.backRed}
            size={14}
            style={{
              position: "absolute",
              bottom: 4,
              left: 4,
            }}
          />
        )}
        {isDraggable && sDragOverIdx === idx && sDragIdx !== null && sDragIdx !== idx && sDragIdx < idx && (
          <Image_
            icon={ICONS.rightArrowBlue}
            size={14}
            style={{
              position: "absolute",
              bottom: 4,
              left: isColumn ? 4 : undefined,
              right: isColumn ? undefined : 4,
            }}
          />
        )}
      </div>
    );
  }

  // ── TOP-LEVEL VIEW ──
  if (sCurrentParentID === null) {
    return (
      <BoxContainerOuterComponent style={{ flex: 1 }}>
        <BoxContainerInnerComponent
          style={{ width: "100%", alignItems: "center", borderWidth: 0, flex: 1 }}
        >
          <View style={{ width: "100%", alignItems: "flex-start", flexDirection: "row", marginBottom: 10 }}>
            <Tooltip text="Add sub-menu" position="right">
              <BoxButton1 onPress={handleAdd} icon={ICONS.menu1} iconSize={22} />
            </Tooltip>
          </View>
          <View
            style={{
              width: "100%",
              flex: 1,
              borderWidth: 1,
              borderColor: C.buttonLightGreenOutline,
              backgroundColor: C.backgroundListWhite,
              borderRadius: 10,
              paddingVertical: 10,
              paddingHorizontal: 10,
            }}
          >
            <ScrollView style={{ width: "100%", flex: 1 }}>
              {topLevelButtons.map((btn, idx) =>
                renderButtonCard(btn, idx, true, true)
              )}
            </ScrollView>
          </View>
        </BoxContainerInnerComponent>
      </BoxContainerOuterComponent>
    );
  }

  // ── SUB-LEVEL VIEW ──
  return (
    <BoxContainerOuterComponent>
      <BoxContainerInnerComponent
        style={{ width: "100%", alignItems: "center", borderWidth: 0 }}
      >
        <View style={{ width: "100%" }}>
          {/* Navigation header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 10,
              flexWrap: "wrap",
            }}
          >
            <TouchableOpacity
              onPress={() => {
                _setCurrentParentID(null);
                _setMenuPath([]);
              }}
              style={{
                paddingVertical: 4,
                paddingHorizontal: 8,
                borderRadius: 5,
                borderWidth: 1,
                borderColor: C.buttonLightGreenOutline,
                marginRight: 8,
              }}
            >
              <Text style={{ fontSize: 12, color: C.blue, fontWeight: "bold" }}>
                {"Top Level"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleBack}
              style={{
                paddingVertical: 4,
                paddingHorizontal: 8,
                borderRadius: 5,
                borderWidth: 1,
                borderColor: C.buttonLightGreenOutline,
                marginRight: 12,
              }}
            >
              <Text style={{ fontSize: 12, color: C.text }}>
                {"\u25C0 Back"}
              </Text>
            </TouchableOpacity>
            {/* Breadcrumb trail */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              {sMenuPath.map((crumb, i) => (
                <View
                  key={crumb.id}
                  style={{ flexDirection: "row", alignItems: "center" }}
                >
                  {i > 0 && (
                    <Text
                      style={{
                        color: gray(0.3),
                        marginHorizontal: 4,
                        fontSize: 13,
                      }}
                    >
                      {">"}
                    </Text>
                  )}
                  <TouchableOpacity
                    onPress={() => {
                      _setMenuPath((prev) => prev.slice(0, i + 1));
                      _setCurrentParentID(crumb.id);
                    }}
                  >
                    <Text
                      style={{
                        color:
                          i === sMenuPath.length - 1 ? C.text : C.blue,
                        fontSize: 13,
                        fontWeight:
                          i === sMenuPath.length - 1 ? "bold" : "normal",
                      }}
                    >
                      {crumb.name || "(unnamed)"}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>

          {/* Add buttons */}
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
            <Tooltip text="Add item" position="right">
              <BoxButton1 onPress={() => _setShowInvSearchModal(true)} iconSize={40} />
            </Tooltip>
            <View style={{ marginLeft: 8 }}>
              <Tooltip text="Add sub-menu" position="right">
                <BoxButton1 onPress={handleAdd} icon={ICONS.menu1} iconSize={22} />
              </Tooltip>
            </View>
          </View>

          {sShowInvSearchModal && <InventorySearchModal />}

          {/* Flex-wrap grid of sub-buttons */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              flexWrap: "wrap",
              marginTop: 10,
            }}
          >
            {currentChildren.map((btn, idx) =>
              renderButtonCard(btn, idx, true)
            )}
          </div>
        </View>
      </BoxContainerInnerComponent>
    </BoxContainerOuterComponent>
  );
};

////////////////////////////////////////////////////////////////////////////////
// Intake Buttons Component
////////////////////////////////////////////////////////////////////////////////

const IntakeButtonsComponent = ({ zSettingsObj, handleSettingsFieldChange, _setIntakeEditButtonObj }) => {
  const [sDragIdx, _setDragIdx] = useState(null);
  const [sDragOverIdx, _setDragOverIdx] = useState(null);

  let intakeButtons = zSettingsObj?.intakeButtons || [];

  function handleAdd() {
    let newBtn = {
      ...cloneDeep(INTAKE_BUTTON_PROTO),
      id: generateRandomID(),
      label: "",
      itemsToAdd: [],
    };
    let updated = [...intakeButtons, newBtn];
    handleSettingsFieldChange("intakeButtons", updated);
  }

  function handleDelete(btn) {
    let updated = intakeButtons.filter((o) => o.id !== btn.id);
    handleSettingsFieldChange("intakeButtons", updated);
  }

  function handleLabelChange(btn, val) {
    let updated = intakeButtons.map((o) =>
      o.id === btn.id ? { ...o, label: val } : o
    );
    handleSettingsFieldChange("intakeButtons", updated);
  }

  function handleReorder(fromIdx, toIdx) {
    if (fromIdx === null || toIdx === null || fromIdx === toIdx) return;
    let arr = [...intakeButtons];
    let [dragged] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, dragged);
    handleSettingsFieldChange("intakeButtons", arr);
  }

  return (
    <BoxContainerOuterComponent>
      <BoxContainerInnerComponent
        style={{ width: "100%", alignItems: "center", borderWidth: 0 }}
      >
        <View style={{ width: "100%" }}>
          <BoxButton1 onPress={handleAdd} style={{ marginBottom: 10 }} />
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              flexWrap: "wrap",
              marginTop: 10,
            }}
          >
            {intakeButtons.map((btn, idx) => (
              <IntakeButtonCard
                key={btn.id}
                btn={btn}
                idx={idx}
                sDragIdx={sDragIdx}
                sDragOverIdx={sDragOverIdx}
                _setDragIdx={_setDragIdx}
                _setDragOverIdx={_setDragOverIdx}
                handleReorder={handleReorder}
                handleLabelChange={handleLabelChange}
                handleDelete={handleDelete}
                handleEditPress={() => _setIntakeEditButtonObj(btn)}
              />
            ))}
          </div>
          {intakeButtons.length === 0 && (
            <Text
              style={{
                color: gray(0.4),
                fontSize: 13,
                textAlign: "center",
                paddingVertical: 20,
              }}
            >
              No intake buttons yet. Click + to add one.
            </Text>
          )}
        </View>
      </BoxContainerInnerComponent>
    </BoxContainerOuterComponent>
  );
};

const IntakeButtonCard = ({
  btn,
  idx,
  sDragIdx,
  sDragOverIdx,
  _setDragIdx,
  _setDragOverIdx,
  handleReorder,
  handleLabelChange,
  handleDelete,
  handleEditPress,
}) => {
  const [sIsEditingLabel, _setIsEditingLabel] = useState(!btn.label);

  return (
    <div
      draggable
      onDragStart={() => _setDragIdx(idx)}
      onDragOver={(e) => {
        e.preventDefault();
        _setDragOverIdx(idx);
      }}
      onDragEnd={() => {
        _setDragIdx(null);
        _setDragOverIdx(null);
      }}
      onDrop={(e) => {
        e.preventDefault();
        handleReorder(sDragIdx, idx);
        _setDragIdx(null);
        _setDragOverIdx(null);
      }}
      onMouseEnter={(e) => {
        if (!sIsEditingLabel) e.currentTarget.style.opacity = "0.7";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.opacity = "1";
      }}
      style={{
        width: 170,
        minHeight: 60,
        margin: 4,
        padding: 8,
        display: "flex",
        flexDirection: "column",
        borderWidth: sDragOverIdx === idx ? 2 : 1,
        borderStyle: "solid",
        borderColor:
          sDragOverIdx === idx ? C.blue : C.buttonLightGreenOutline,
        borderRadius: 8,
        backgroundColor: C.listItemWhite,
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        cursor: "grab",
        opacity: sDragIdx === idx ? 0.5 : 1,
        boxSizing: "border-box",
      }}
    >
      {/* Label area */}
      {sIsEditingLabel ? (
        <TextInput_
          autoFocus={true}
          onChangeText={(val) => handleLabelChange(btn, val)}
          placeholder="Enter label..."
          placeholderTextColor={gray(0.3)}
          style={{
            width: "100%",
            paddingHorizontal: 5,
            paddingVertical: 3,
            fontSize: 13,
            textAlign: "center",
            color: C.text,
            outlineWidth: 0,
            outlineStyle: "none",
          }}
          value={btn.label}
        />
      ) : (
        <Text
          style={{
            width: "100%",
            fontSize: 13,
            textAlign: "center",
            color: C.text,
            paddingHorizontal: 5,
            paddingVertical: 3,
          }}
          numberOfLines={1}
        >
          {btn.label || "(unnamed)"}
        </Text>
      )}

      {/* Controls row: badge + edit + items + delete */}
      <div
        draggable={false}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 4,
        }}
      >
        {(btn.itemsToAdd?.length || 0) > 0 && (
          <View
            style={{
              backgroundColor: C.blue,
              borderRadius: 8,
              minWidth: 16,
              height: 16,
              alignItems: "center",
              justifyContent: "center",
              marginRight: 6,
            }}
          >
            <Text
              style={{
                color: C.textWhite,
                fontSize: 10,
                fontWeight: "bold",
                paddingHorizontal: 4,
              }}
            >
              {btn.itemsToAdd.length}
            </Text>
          </View>
        )}
        <BoxButton1
          onPress={() => _setIsEditingLabel(!sIsEditingLabel)}
          iconSize={sIsEditingLabel ? 37 : 17}
          icon={sIsEditingLabel ? ICONS.clickHere : ICONS.editPencil}
        />
        <BoxButton1
          onPress={handleEditPress}
          style={{ marginLeft: 6 }}
          iconSize={17}
          icon={ICONS.search}
        />
        <BoxButton1
          onPress={() => handleDelete(btn)}
          style={{ marginLeft: 6 }}
          iconSize={17}
          icon={ICONS.close1}
        />
      </div>

      {/* Drag direction indicators */}
      {sDragOverIdx === idx && sDragIdx !== null && sDragIdx !== idx && sDragIdx > idx && (
        <Image_
          icon={ICONS.backRed}
          size={14}
          style={{ position: "absolute", bottom: 4, left: 4 }}
        />
      )}
      {sDragOverIdx === idx && sDragIdx !== null && sDragIdx !== idx && sDragIdx < idx && (
        <Image_
          icon={ICONS.rightArrowBlue}
          size={14}
          style={{ position: "absolute", bottom: 4, right: 4 }}
        />
      )}
    </div>
  );
};

////////////////////////////////////////////////////////////////////////////////
// Intake Button Edit Modal — inventory search to add items to itemsToAdd
////////////////////////////////////////////////////////////////////////////////

const IntakeButtonEditModal = ({ buttonObj, onClose, onSave }) => {
  const zInventory = useInventoryStore((state) => state.inventoryArr);
  const [sItemsToAdd, _setItemsToAdd] = useState(buttonObj.itemsToAdd || []);
  const [sSearchString, _setSearchString] = useState("");
  const [sSearchResults, _setSearchResults] = useState([]);

  function handleSearch(val) {
    _setSearchString(val);
    if (!val || val.length < 3) {
      _setSearchResults([]);
      return;
    }
    _setSearchResults(searchInventory(val, zInventory));
  }

  function handleAddItem(invItem) {
    if (!sItemsToAdd.includes(invItem.id)) {
      _setItemsToAdd([...sItemsToAdd, invItem.id]);
    }
    _setSearchString("");
    _setSearchResults([]);
  }

  function handleRemoveItem(itemId) {
    _setItemsToAdd(sItemsToAdd.filter((id) => id !== itemId));
  }

  function resolveItem(itemId) {
    return zInventory.find((o) => o.id === itemId);
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
        justifyContent: "center",
        alignItems: "center",
        zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 550,
          height: "85vh",
          backgroundColor: "white",
          borderRadius: 12,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            padding: 16,
            borderBottomWidth: 1,
            borderBottomColor: gray(0.15),
          }}
        >
          <Text
            style={{
              fontSize: 16,
              fontWeight: Fonts.weight.textHeavy,
              color: C.text,
            }}
          >
            {buttonObj.label || "(unnamed)"} — Items
          </Text>
          <TouchableOpacity onPress={onClose}>
            <Image_ icon={ICONS.close1} size={18} />
          </TouchableOpacity>
        </View>

        {/* Search Input */}
        <View style={{ padding: 16, paddingBottom: 8 }}>
          <TextInput_
            style={{
              borderBottomColor: gray(0.3),
              borderBottomWidth: 1,
              width: "100%",
              fontSize: 15,
              color: C.text,
              paddingVertical: 6,
              outlineWidth: 0,
              outlineStyle: "none",
            }}
            value={sSearchString}
            onChangeText={handleSearch}
            placeholder="Search inventory..."
            placeholderTextColor={gray(0.3)}
            autoFocus
          />
        </View>

        {/* Added Items */}
        <View style={{ padding: 16, paddingTop: 12, maxHeight: "40%" }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: Fonts.weight.textHeavy,
              color: C.blue,
              marginBottom: 6,
            }}
          >
            ITEMS ({sItemsToAdd.length})
          </Text>
          <ScrollView>
            {sItemsToAdd.map((itemId, idx) => {
              let item = resolveItem(itemId);
              let name = item
                ? item.formalName || item.informalName || "Unknown"
                : itemId;
              return (
                <View
                  key={itemId + idx}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingVertical: 5,
                    paddingHorizontal: 8,
                    marginBottom: 3,
                    backgroundColor: "rgb(230, 240, 252)",
                    borderRadius: 4,
                    borderLeftWidth: 3,
                    borderLeftColor: C.blue,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, color: C.text }}>{name}</Text>
                    {!!item && (
                      <Text style={{ fontSize: 11, color: C.lightText }}>
                        ${formatCurrencyDisp(item.price || 0)}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => handleRemoveItem(itemId)}
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      backgroundColor: gray(0.08),
                      borderRadius: 4,
                    }}
                  >
                    <Text style={{ fontSize: 10, color: C.lightred }}>
                      Remove
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
            {sItemsToAdd.length === 0 && (
              <Text style={{ fontSize: 12, color: gray(0.4), textAlign: "center", paddingVertical: 20 }}>
                No items added yet. Search above to add inventory items.
              </Text>
            )}
          </ScrollView>
        </View>

        {/* Search Results */}
        {sSearchResults.length > 0 && (
          <ScrollView
            style={{
              flex: 1,
              marginHorizontal: 16,
              marginBottom: 8,
              borderWidth: 1,
              borderColor: gray(0.1),
              borderRadius: 4,
              backgroundColor: "white",
            }}
          >
            {sSearchResults.map((item, idx) => (
              <TouchableOpacity
                key={item.id || idx}
                onPress={() => handleAddItem(item)}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: 8,
                  borderBottomWidth: 1,
                  borderBottomColor: gray(0.08),
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, color: C.text }}>
                    {item.formalName || item.informalName || "Unknown"}
                  </Text>
                  {!!item.brand && (
                    <Text style={{ fontSize: 11, color: gray(0.5) }}>
                      {item.brand}
                    </Text>
                  )}
                </View>
                <Text style={{ fontSize: 13, color: C.text }}>
                  ${formatCurrencyDisp(item.price || 0)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Footer */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "flex-end",
            padding: 16,
            borderTopWidth: 1,
            borderTopColor: gray(0.15),
          }}
        >
          <Button_
            text="Cancel"
            onPress={onClose}
            buttonStyle={{
              paddingHorizontal: 16,
              paddingVertical: 8,
              marginRight: 10,
              backgroundColor: gray(0.15),
            }}
            textStyle={{ color: C.text }}
          />
          <Button_
            text="Save"
            colorGradientArr={COLOR_GRADIENTS.green}
            onPress={() => onSave({ ...buttonObj, itemsToAdd: sItemsToAdd })}
            buttonStyle={{ paddingHorizontal: 16, paddingVertical: 8 }}
          />
        </View>
      </div>
    </div>,
    document.body
  );
};

const TEMPLATE_EMOJIS = [
  { id: "🎉", label: "🎉  Party" },
  { id: "✅", label: "✅  Checkmark" },
  { id: "🔧", label: "🔧  Wrench" },
  { id: "🛠️", label: "🛠️  Tools" },
  { id: "⚙️", label: "⚙️  Gear" },
  { id: "🔩", label: "🔩  Bolt" },
  { id: "🚲", label: "🚲  Bicycle" },
  { id: "🚴", label: "🚴  Cyclist" },
  { id: "💰", label: "💰  Money Bag" },
  { id: "💳", label: "💳  Credit Card" },
  { id: "🧾", label: "🧾  Receipt" },
  { id: "🏷️", label: "🏷️  Price Tag" },
  { id: "🛒", label: "🛒  Cart" },
  { id: "🎁", label: "🎁  Gift" },
  { id: "📋", label: "📋  Clipboard" },
  { id: "📝", label: "📝  Memo" },
  { id: "📱", label: "📱  Phone" },
  { id: "📧", label: "📧  Email" },
  { id: "🔔", label: "🔔  Bell" },
  { id: "⭐", label: "⭐  Star" },
  { id: "🌟", label: "🌟  Glowing Star" },
  { id: "❤️", label: "❤️  Heart" },
  { id: "👋", label: "👋  Wave" },
  { id: "👍", label: "👍  Thumbs Up" },
  { id: "🙏", label: "🙏  Thank You" },
  { id: "😊", label: "😊  Smile" },
  { id: "🤝", label: "🤝  Handshake" },
  { id: "💪", label: "💪  Strong" },
  { id: "🏆", label: "🏆  Trophy" },
  { id: "🔥", label: "🔥  Fire" },
];

const TEXT_TEMPLATE_VARIABLES = [
  { label: "First Name", variable: "{firstName}" },
  { label: "Last Name", variable: "{lastName}" },
  { label: "Brand", variable: "{brand}" },
  { label: "Description", variable: "{description}" },
  { label: "Total Amount", variable: "{totalAmount}" },
  { label: "Line Items", variable: "{lineItems}" },
  { label: "Part Ordered", variable: "{partOrdered}" },
  { label: "Part Source", variable: "{partSource}" },
  { label: "Store Hours", variable: "{storeHours}" },
  { label: "Store Phone", variable: "{storePhone}" },
];

const OrderingComponent = ({
  sOrderingMenuSelectionName,
  _setOrderingMenuSelectionName,
}) => {
  return (
    <BoxContainerOuterComponent>
      <BoxContainerInnerComponent style={{ width: "100%", alignItems: "center" }}>
        {/* Sub-tab buttons */}
        <View
          style={{
            flexDirection: "row",
            width: "100%",
            marginBottom: 15,
            borderBottomWidth: 1,
            borderColor: C.buttonLightGreenOutline,
            paddingBottom: 10,
          }}
        >
          {Object.values(DROPDOWN_ORDERING_SELECTION_NAMES).map((name) => {
            let isActive = sOrderingMenuSelectionName === name;
            return (
              <TouchableOpacity
                key={name}
                onPress={() => _setOrderingMenuSelectionName(name)}
                style={{
                  marginRight: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 5,
                  borderRadius: 7,
                  borderWidth: 1,
                  borderColor: isActive ? C.green : C.buttonLightGreenOutline,
                  backgroundColor: isActive ? C.buttonLightGreen : "transparent",
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: isActive ? "500" : "400",
                    color: isActive ? C.green : gray(0.5),
                  }}
                >
                  {name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Content area */}
        <View style={{ width: "100%", alignItems: "center" }}>
          <Text style={{ color: gray(0.4), fontSize: 14 }}>
            {sOrderingMenuSelectionName}
          </Text>
        </View>
      </BoxContainerInnerComponent>
    </BoxContainerOuterComponent>
  );
};

let _lsConnectionCache = null;
let _lsCsvData = null;

const ImportComponent = () => {
  const [sLsConnected, _setLsConnected] = useState(_lsConnectionCache?.connected || false);
  const [sLsImporting, _setLsImporting] = useState("");
  const [sLsResult, _setLsResult] = useState("");
  const [sWoLookup, _setWoLookup] = useState("2949");
  const [sCustLookup, _setCustLookup] = useState("");
  const [sLookupLoading, _setLookupLoading] = useState(false);

  // --- Lightspeed handlers ---

  const lsConnectionPollRef = useRef(null);
  const lsConnectionTimeoutRef = useRef(null);

  function stopLsConnectionPoll() {
    if (lsConnectionPollRef.current) {
      clearInterval(lsConnectionPollRef.current);
      lsConnectionPollRef.current = null;
    }
    if (lsConnectionTimeoutRef.current) {
      clearTimeout(lsConnectionTimeoutRef.current);
      lsConnectionTimeoutRef.current = null;
    }
  }

  async function checkLsConnection() {
    const settings = useSettingsStore.getState().settings;
    const tenantID = settings?.tenantID;
    const storeID = settings?.storeID;
    if (!tenantID || !storeID) return;
    try {
      const path = `tenants/${tenantID}/stores/${storeID}/integrations/lightspeed`;
      const lsDoc = await firestoreRead(path);
      if (lsDoc?.accessToken) {
        _lsConnectionCache = { connected: true, accountName: lsDoc.accountID || "" };
        _setLsConnected(true);
        _setLsResult("Connected to Lightspeed" + (lsDoc.accountID ? ": " + lsDoc.accountID : ""));
        _setLsImporting("");
        stopLsConnectionPoll();
      }
    } catch (e) {
      // silently fail
    }
  }

  // Check Lightspeed connection once per session (reads Firestore doc directly, no Cloud Function)
  if (!_lsConnectionCache) { checkLsConnection(); }

  async function handleLsConnect() {
    try {
      _setLsImporting("connecting");
      _setLsResult("");
      const settings = useSettingsStore.getState().settings;
      const tenantID = settings?.tenantID;
      const storeID = settings?.storeID;
      if (!tenantID || !storeID) {
        _setLsResult("Error: tenantID or storeID not found in settings");
        _setLsImporting("");
        return;
      }
      const res = await lightspeedInitiateAuthCallable({ tenantID, storeID });
      if (res.data?.authUrl) {
        window.open(res.data.authUrl, "_blank");
        _setLsResult("Waiting for authorization...");
        _setLsImporting("checking");
        // Auto-poll for connection every 5 seconds, give up after 1 minute
        stopLsConnectionPoll();
        lsConnectionPollRef.current = setInterval(checkLsConnection, 5000);
        lsConnectionTimeoutRef.current = setTimeout(() => {
          stopLsConnectionPoll();
          _setLsResult("Authorization timed out — try again");
          _setLsImporting("");
        }, 60000);
      } else {
        _setLsResult("Error: No auth URL returned");
        _setLsImporting("");
      }
    } catch (e) {
      _setLsResult("Error: " + (e.message || "Connection failed"));
      _setLsImporting("");
    }
  }

  const CSV_EXPORT_TYPES = [
    { type: "csv-workorders", label: "Workorders" },
    { type: "csv-workorderitems", label: "Workorder Items" },
    { type: "csv-serialized", label: "Serialized" },
    { type: "csv-items", label: "Items" },
    { type: "csv-customers", label: "Customers" },
    { type: "csv-sales", label: "Sales" },
    { type: "csv-salelines", label: "Sale Lines" },
    { type: "csv-salepayments", label: "Sale Payments" },
    { type: "csv-employees", label: "Employees" },
    { type: "csv-cccharges", label: "CC Charges" },
  ];

  async function handleExportAllCsvs() {
    _setLsImporting("all-csvs");
    _setLsResult("");
    const settings = useSettingsStore.getState().settings;
    const tenantID = settings?.tenantID;
    const storeID = settings?.storeID;
    let completed = 0;
    let failed = 0;

    for (const btn of CSV_EXPORT_TYPES) {
      console.log("[Export All] " + (completed + failed + 1) + "/" + CSV_EXPORT_TYPES.length + " — " + btn.label + "...");
      _setLsResult("Exporting " + (completed + failed + 1) + "/" + CSV_EXPORT_TYPES.length + ": " + btn.label + "...");
      let unsubDevLog = null;
      try {
        let logsDone = null;
        const logsFinished = new Promise((resolve) => { logsDone = resolve; });
        let lastLogCount = -1;
        unsubDevLog = dbListenToDevLogs("lightspeed-import", (data) => {
          if (!data?.logs) return;
          if (lastLogCount === -1) { lastLogCount = data.logs.length; return; }
          let newEntries = data.logs.slice(lastLogCount);
          for (let entry of newEntries) {
            if (entry.type === "csv-download") {
              try {
                let csvInfo = JSON.parse(entry.msg);
                let link = document.createElement("a");
                link.href = csvInfo.url;
                link.download = csvInfo.filename || "download.csv";
                link.target = "_blank";
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              } catch (e) {}
              continue;
            }
            if (entry.type === "error") console.error("[Export All] " + btn.label + ": " + entry.msg);
          }
          lastLogCount = data.logs.length;
          if (newEntries.length > 0 && (data.status === "complete" || data.status === "error")) {
            logsDone();
          }
        });

        const res = await lightspeedImportDataCallable({ tenantID, storeID, importType: btn.type, saveToDB: false });
        await logsFinished;
        if (unsubDevLog) { unsubDevLog(); unsubDevLog = null; }

        if (res.data?.success) {
          completed++;
          console.log("[Export All] " + btn.label + " — done");
        } else {
          failed++;
          console.error("[Export All] " + btn.label + " — no success flag");
        }
      } catch (e) {
        if (unsubDevLog) unsubDevLog();
        failed++;
        console.error("[Export All] " + btn.label + " — error: " + e.message);
      }
    }

    _setLsResult("Export All: " + completed + " completed, " + failed + " failed");
    _setLsImporting("");
    console.log("[Export All] Finished: " + completed + " completed, " + failed + " failed");
  }

  async function handleLsImportType(importType, saveToDB) {
    let unsubDevLog = null;
    try {
      _setLsImporting(importType);
      _setLsResult("");
      const settings = useSettingsStore.getState().settings;
      const tenantID = settings?.tenantID;
      const storeID = settings?.storeID;

      // Start dev log listener for real-time console output
      let lastLogCount = -1;
      let logsDone = null;
      const logsFinished = new Promise((resolve) => { logsDone = resolve; });
      unsubDevLog = dbListenToDevLogs("lightspeed-import", (data) => {
        if (!data?.logs) return;
        // On first callback, skip existing logs so we don't replay previous exports
        if (lastLogCount === -1) { lastLogCount = data.logs.length; return; }
        let newEntries = data.logs.slice(lastLogCount);
        for (let entry of newEntries) {
          if (entry.type === "csv-download") {
            try {
              let csvInfo = JSON.parse(entry.msg);
              let link = document.createElement("a");
              link.href = csvInfo.url;
              link.download = csvInfo.filename || "download.csv";
              link.target = "_blank";
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            } catch (e) {
            }
            continue;
          }
          let prefix = entry.type === "error" ? "[ERROR]" : entry.type === "success" ? "[OK]" : entry.type === "warn" ? "[WARN]" : "[INFO]";
        }
        lastLogCount = data.logs.length;
        if (newEntries.length > 0) {
          _setLsResult(newEntries[newEntries.length - 1].msg);
        }
        if (newEntries.length > 0 && (data.status === "complete" || data.status === "error")) {
          logsDone();
        }
      });

      const res = await lightspeedImportDataCallable({
        tenantID,
        storeID,
        importType,
        saveToDB,
      });

      await logsFinished;
      if (unsubDevLog) { unsubDevLog(); unsubDevLog = null; }

      if (res.data?.success) {
        let msg = importType.charAt(0).toUpperCase() + importType.slice(1) + " import complete.";
        if (res.data.customerCount != null) msg += ` Customers: ${res.data.customerCount}.`;
        if (res.data.saleCount != null) msg += ` Sales: ${res.data.saleCount}.`;
        if (res.data.workorderCount != null) msg += ` Workorders: ${res.data.workorderCount} (${res.data.linked || 0} linked).`;
        _setLsResult(msg);
      } else {
        _setLsResult("Import returned no success flag");
      }
    } catch (e) {
      _setLsResult("Error: " + (e.message || "Import failed"));
    }
    if (unsubDevLog) unsubDevLog();
    _setLsImporting("");
  }

  // --- Mapping lookup handlers ---

  async function loadAndCacheLightspeedData() {
    if (_lsCsvData) return _lsCsvData;
    const [custText, woText, wiText, serText, itemsText, slText, salesText, spText, stripeText, empText] = await Promise.all([
      fetch("/lightspeed/customers.csv").then(r => r.text()),
      fetch("/lightspeed/workorders.csv").then(r => r.text()),
      fetch("/lightspeed/workorderItems.csv").then(r => r.text()),
      fetch("/lightspeed/serialized.csv").then(r => r.text()),
      fetch("/lightspeed/items.csv").then(r => r.text()),
      fetch("/lightspeed/salesLines.csv").then(r => r.text()),
      fetch("/lightspeed/sales.csv").then(r => r.text()),
      fetch("/lightspeed/salesPayments.csv").then(r => r.text()),
      fetch("/lightspeed/stripePayments.csv").then(r => r.text()),
      fetch("/lightspeed/employees.csv").then(r => r.ok ? r.text() : "").catch(() => ""),
    ]);
    const customers = mapCustomers(custText);
    const customerMap = {};
    for (const c of customers) customerMap[c.id] = c;
    const settings = useSettingsStore.getState().settings;
    const statuses = settings?.statuses || [];
    const workorders = mapWorkorders(woText, wiText, serText, itemsText, slText, customerMap, statuses, empText, salesText);
    // Build workorderMap: lsSaleID → [mapped workorder objects]
    const workorderMap = {};
    for (const wo of workorders) {
      const lsSaleID = wo._lsSaleID;
      if (lsSaleID && lsSaleID !== "0") {
        if (!workorderMap[lsSaleID]) workorderMap[lsSaleID] = [];
        workorderMap[lsSaleID].push(wo);
      }
    }
    const sales = mapSales(salesText, spText, stripeText, workorderMap, customerMap);
    _lsCsvData = { customers, customerMap, workorders, sales, itemsText };
    return _lsCsvData;
  }

  async function handleWoLookup() {
    if (!sWoLookup.trim()) return;
    _setLookupLoading(true);
    try {
      const data = await loadAndCacheLightspeedData();
      const wo = data.workorders.find(w => w.workorderNumber === sWoLookup.trim());
      if (wo) {
        const linkedSale = wo.saleID ? data.sales.find(s => s.id === wo.saleID) : null;
        await dbSaveOpenWorkorder(wo);
        useOpenWorkordersStore.getState().setOpenWorkorders([wo]);
        useOpenWorkordersStore.getState().setOpenWorkorderID(wo.id);
        _setLsResult("Workorder " + sWoLookup.trim() + " saved to DB");
      } else {
        _setLsResult("Workorder " + sWoLookup.trim() + " not found");
      }
    } catch (e) {
      _setLsResult("Error: " + e.message);
    }
    _setLookupLoading(false);
  }

  async function handleCustLookup() {
    if (!sCustLookup.trim()) return;
    _setLookupLoading(true);
    try {
      const data = await loadAndCacheLightspeedData();
      const digits = sCustLookup.trim().replace(/\D/g, "");
      const cust = data.customers.find(c => {
        const cellDigits = c.customerCell.replace(/\D/g, "");
        const landlineDigits = c.customerLandline.replace(/\D/g, "");
        return cellDigits === digits || landlineDigits === digits;
      });
      if (cust) {
        _setLsResult("Customer " + capitalizeFirstLetterOfString(cust.first) + " " + capitalizeFirstLetterOfString(cust.last) + " found");
      } else {
        _setLsResult("No customer with phone " + sCustLookup.trim());
      }
    } catch (e) {
      _setLsResult("Error: " + e.message);
    }
    _setLookupLoading(false);
  }

  async function handleDevImport() {
    _setLookupLoading(true);
    _setLsResult("");
    try {
      const data = await loadAndCacheLightspeedData();
      const settings = useSettingsStore.getState().settings;
      const statuses = settings?.statuses || [];

      // Build set of valid status IDs from settings
      const validStatusIDs = new Set(statuses.map(s => s.id));

      // Build status label lookup for "done & paid" detection
      const statusByLabel = {};
      for (const s of statuses) statusByLabel[s.label.toLowerCase()] = s;
      const doneAndPaidID = statusByLabel["done & paid"]?.id;

      // Sale lookup for linked sales
      const saleByID = {};
      for (const s of data.sales) saleByID[s.id] = s;

      // Grab all workorders whose status matches any status in settings, limit 40
      const allWorkorders = data.workorders
        .filter(wo => validStatusIDs.has(wo.status))
        .slice(0, 40);

      // Collect unique customers from all workorders
      const customersSaved = new Set();
      for (const wo of allWorkorders) {
        if (wo.customerID && !customersSaved.has(wo.customerID)) {
          const cust = data.customerMap[wo.customerID];
          if (cust) {
            await dbSaveCustomer(cust);
            customersSaved.add(wo.customerID);
          }
        }
      }

      // Save workorders + sales to correct Firestore collections
      const openWorkorders = [];
      const completedWorkorders = [];
      const salesSaved = new Set();

      for (const wo of allWorkorders) {
        if (wo.status === doneAndPaidID) {
          await dbSaveCompletedWorkorder(wo);
          completedWorkorders.push(wo);
          if (wo.saleID && !salesSaved.has(wo.saleID)) {
            const sale = saleByID[wo.saleID];
            if (sale) {
              await dbSaveCompletedSale(sale);
              salesSaved.add(wo.saleID);
            }
          }
        } else {
          await dbSaveOpenWorkorder(wo);
          openWorkorders.push(wo);
        }
      }

      // Update local store with open workorders only
      useOpenWorkordersStore.getState().setOpenWorkorders(openWorkorders);

      _setLsResult(
        "Dev Import: " + allWorkorders.length + " workorders (" +
        completedWorkorders.length + " completed, " + openWorkorders.length + " open), " +
        salesSaved.size + " sales, " + customersSaved.size + " customers"
      );
    } catch (e) {
      console.error("[Dev Import] Error:", e);
      _setLsResult("Error: " + e.message);
    }
    _setLookupLoading(false);
  }

  async function handleInventoryImport() {
    _setLookupLoading(true);
    _setLsResult("");
    try {
      const data = await loadAndCacheLightspeedData();
      const itemRows = parseCSV(data.itemsText);
      const activeItems = itemRows.filter(row => row.archived !== "true" && row.description);

      const settings = useSettingsStore.getState().settings;
      const tenantID = settings?.tenantID;
      const storeID = settings?.storeID;
      if (!tenantID || !storeID) { _setLsResult("Error: missing tenantID or storeID"); _setLookupLoading(false); return; }

      const mapped = activeItems.map(item => {
        const isLabor = (item.description || "").toLowerCase().includes("labor");
        const id = item.itemID || generateRandomID();
        return {
          id,
          formalName: item.description || "",
          informalName: "",
          brand: "",
          price: dollarsToCents(item.defaultCost),
          salePrice: 0,
          cost: dollarsToCents(item.avgCost || item.defaultCost),
          category: isLabor ? "Labor" : "Part",
          upc: item.upc || "",
          ean: item.ean || "",
          customSku: item.customSku || "",
          manufacturerSku: item.manufacturerSku || "",
          minutes: 0,
          customPart: false,
          customLabor: false,
        };
      });

      // Write in parallel batches of 50
      const BATCH_SIZE = 50;
      for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
        const batch = mapped.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(item => {
          const path = `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.INVENTORY}/${item.id}`;
          return firestoreWrite(path, item);
        }));
      }

      _setLsResult("Inventory Import: " + mapped.length + " items saved");
    } catch (e) {
      console.error("[Inventory Import] Error:", e);
      _setLsResult("Error: " + e.message);
    }
    _setLookupLoading(false);
  }

  const sMigrating = useMigrationStore((s) => s.getMigrating());
  const sDevMigrating = useMigrationStore((s) => s.getDevMigrating());
  const sMigrationStep = useMigrationStore((s) => s.getStep());
  const sMigrationProgress = useMigrationStore((s) => s.getProgress());
  const _setMigrating = useMigrationStore((s) => s.setMigrating);
  const _setDevMigrating = useMigrationStore((s) => s.setDevMigrating);
  const _setMigrationStep = useMigrationStore((s) => s.setStep);
  const _setMigrationProgress = useMigrationStore((s) => s.setProgress);

  async function handleFullMigration() {
    _setMigrating(true);
    _setMigrationStep("Loading & mapping CSVs...");
    _setMigrationProgress({ done: 0, total: 0 });
    _setLsResult("");

    try {
      // Fire-and-forget: clear existing collections in background
      console.log("[Migration] Clearing collections in background...");
      Promise.all([
        dbClearCollection("open-workorders"),
        dbClearCollection("completed-workorders"),
        dbClearCollection("customers"),
        dbClearCollection("completed-sales"),
        dbClearCollection("active-sales"),
      ]).then(() => console.log("[Migration] Collections cleared."))
        .catch(e => console.error("[Migration] Clear error:", e));

      // Load & map all CSV data
      _setMigrationStep("Loading & mapping CSVs...");
      console.log("[Migration] Loading & mapping CSVs...");
      const data = await loadAndCacheLightspeedData();

      // Extract statuses from workorder data and merge into settings
      const settings = cloneDeep(useSettingsStore.getState().settings || {});
      _setMigrationStep("Extracting statuses...");
      console.log("[Migration] Extracting statuses...");
      const woText = await fetch("/lightspeed/workorders.csv").then(r => r.text());
      const mergedStatuses = extractStatusesFromWorkorders(woText);
      settings.statuses = mergedStatuses;
      await dbSaveSettings(settings);
      useSettingsStore.getState().setSettings(settings);

      // Re-map workorders with updated statuses so status IDs resolve correctly
      _lsCsvData = null;
      const freshData = await loadAndCacheLightspeedData();

      // Save customers
      _setMigrationStep("Saving customers...");
      console.log("[Migration] Saving " + freshData.customers.length + " customers...");
      _setMigrationProgress({ done: 0, total: freshData.customers.length });
      await dbBatchWrite(freshData.customers, "customers", (done, total) => {
        _setMigrationProgress({ done, total });
      });
      console.log("[Migration] Customers done.");

      // Save inventory
      _setMigrationStep("Saving inventory...");
      const itemRows = parseCSV(freshData.itemsText);
      const activeItems = itemRows.filter(row => row.archived !== "true" && row.description);
      const mappedItems = activeItems.map(item => {
        const isLabor = (item.description || "").toLowerCase().includes("labor");
        return {
          id: item.itemID || generateRandomID(),
          formalName: item.description || "",
          informalName: "",
          brand: "",
          price: dollarsToCents(item.defaultCost),
          salePrice: 0,
          cost: dollarsToCents(item.avgCost || item.defaultCost),
          category: isLabor ? "Labor" : "Part",
          upc: item.upc || "",
          ean: item.ean || "",
          customSku: item.customSku || "",
          manufacturerSku: item.manufacturerSku || "",
          minutes: 0,
          customPart: false,
          customLabor: false,
        };
      });
      console.log("[Migration] Saving " + mappedItems.length + " inventory items...");
      _setMigrationProgress({ done: 0, total: mappedItems.length });
      await dbBatchWrite(mappedItems, "inventory", (done, total) => {
        _setMigrationProgress({ done, total });
      });
      console.log("[Migration] Inventory done.");

      // Route & save workorders
      _setMigrationStep("Saving workorders...");
      const statusByLabel = {};
      for (const s of (settings.statuses || [])) statusByLabel[s.label.toLowerCase()] = s;
      const doneAndPaidID = statusByLabel["done & paid"]?.id;

      const openWorkorders = freshData.workorders.filter(wo => wo.status !== doneAndPaidID);
      const completedWorkorders = freshData.workorders.filter(wo => wo.status === doneAndPaidID);
      const allWOs = [...openWorkorders, ...completedWorkorders];
      console.log("[Migration] Saving " + openWorkorders.length + " open WOs + " + completedWorkorders.length + " completed WOs...");
      _setMigrationProgress({ done: 0, total: allWOs.length });
      let woDone = 0;
      await dbBatchWrite(openWorkorders, "open-workorders", (done) => {
        woDone = done;
        _setMigrationProgress({ done: woDone, total: allWOs.length });
      });
      await dbBatchWrite(completedWorkorders, "completed-workorders", (done) => {
        _setMigrationProgress({ done: woDone + done, total: allWOs.length });
      });
      console.log("[Migration] Workorders done.");

      // Route & save sales
      _setMigrationStep("Saving sales...");
      const completedSales = freshData.sales.filter(s => s.paymentComplete);
      console.log("[Migration] Saving " + completedSales.length + " completed sales (skipping " + (freshData.sales.length - completedSales.length) + " incomplete)...");
      _setMigrationProgress({ done: 0, total: completedSales.length });
      await dbBatchWrite(completedSales, "completed-sales", (done, total) => {
        _setMigrationProgress({ done, total });
      });
      console.log("[Migration] Sales done.");

      // Update local store with open workorders
      useOpenWorkordersStore.getState().setOpenWorkorders(openWorkorders);

      // Summary
      const summary = "Full Migration Complete: " +
        freshData.customers.length + " customers, " +
        mappedItems.length + " inventory, " +
        openWorkorders.length + " open WOs, " +
        completedWorkorders.length + " completed WOs, " +
        completedSales.length + " completed sales";
      console.log("[Migration] " + summary);
      _setMigrationStep("Complete!");
      _setMigrationProgress({ done: 0, total: 0 });
      _setLsResult(summary);
    } catch (e) {
      console.error("[Migration] Error:", e);
      _setMigrationStep("Error");
      _setLsResult("Migration Error: " + e.message);
    }
    _setMigrating(false);
  }

  async function handleDevMigration() {
    _setDevMigrating(true);
    _setMigrationStep("Loading & mapping CSVs...");
    _setMigrationProgress({ done: 0, total: 0 });
    _setLsResult("");

    try {
      // Fire-and-forget: clear existing collections in background
      console.log("[Dev Migration] Clearing collections in background...");
      Promise.all([
        dbClearCollection("open-workorders"),
        dbClearCollection("completed-workorders"),
        dbClearCollection("customers"),
        dbClearCollection("completed-sales"),
        dbClearCollection("active-sales"),
      ]).then(() => console.log("[Dev Migration] Collections cleared."))
        .catch(e => console.error("[Dev Migration] Clear error:", e));

      _setMigrationStep("Loading & mapping CSVs...");
      console.log("[Dev Migration] Loading & mapping CSVs...");
      const data = await loadAndCacheLightspeedData();
      const settings = cloneDeep(useSettingsStore.getState().settings || {});

      // Extract statuses and re-map
      _setMigrationStep("Extracting statuses...");
      console.log("[Dev Migration] Extracting statuses...");
      const woText = await fetch("/lightspeed/workorders.csv").then(r => r.text());
      const mergedStatuses = extractStatusesFromWorkorders(woText);
      settings.statuses = mergedStatuses;
      await dbSaveSettings(settings);
      useSettingsStore.getState().setSettings(settings);
      _lsCsvData = null;
      const freshData = await loadAndCacheLightspeedData();

      // Get the last 100 workorders sorted by timestamp (most recent first)
      const sorted = [...freshData.workorders]
        .filter(wo => wo.startedOnMillis)
        .sort((a, b) => b.startedOnMillis - a.startedOnMillis);
      const matchedWOs = sorted.slice(0, 100);
      console.log("[Dev Migration] Selected last " + matchedWOs.length + " workorders by timestamp (of " + freshData.workorders.length + " total).");

      // Collect associated customer IDs and sale IDs from matched workorders
      const customerIDSet = new Set();
      const saleIDSet = new Set();
      for (const wo of matchedWOs) {
        if (wo.customerID) customerIDSet.add(wo.customerID);
        if (wo.saleID) saleIDSet.add(wo.saleID);
        if (wo.sales) wo.sales.forEach(sid => { if (sid) saleIDSet.add(sid); });
      }

      // Also collect all sales from matched customers
      const matchedCustomers = freshData.customers.filter(c => customerIDSet.has(c.id));
      for (const c of matchedCustomers) {
        if (c.sales) c.sales.forEach(sid => { if (sid) saleIDSet.add(sid); });
      }

      // Filter sales
      const matchedSales = freshData.sales.filter(s => saleIDSet.has(s.id));
      console.log("[Dev Migration] Matched " + matchedCustomers.length + " customers, " + matchedSales.length + " sales.");

      // Save inventory (full)
      _setMigrationStep("Saving inventory...");
      const itemRows = parseCSV(freshData.itemsText);
      const activeItems = itemRows.filter(row => row.archived !== "true" && row.description);
      const mappedItems = activeItems.map(item => {
        const isLabor = (item.description || "").toLowerCase().includes("labor");
        return {
          id: item.itemID || generateRandomID(),
          formalName: item.description || "",
          informalName: "",
          brand: "",
          price: dollarsToCents(item.defaultCost),
          salePrice: 0,
          cost: dollarsToCents(item.avgCost || item.defaultCost),
          category: isLabor ? "Labor" : "Part",
          upc: item.upc || "",
          ean: item.ean || "",
          customSku: item.customSku || "",
          manufacturerSku: item.manufacturerSku || "",
          minutes: 0,
          customPart: false,
          customLabor: false,
        };
      });
      console.log("[Dev Migration] Saving " + mappedItems.length + " inventory items...");
      _setMigrationProgress({ done: 0, total: mappedItems.length });
      await dbBatchWrite(mappedItems, "inventory", (done, total) => {
        _setMigrationProgress({ done, total });
      });
      console.log("[Dev Migration] Inventory done.");

      // Save customers
      _setMigrationStep("Saving customers...");
      console.log("[Dev Migration] Saving " + matchedCustomers.length + " customers...");
      _setMigrationProgress({ done: 0, total: matchedCustomers.length });
      await dbBatchWrite(matchedCustomers, "customers", (done, total) => {
        _setMigrationProgress({ done, total });
      });
      console.log("[Dev Migration] Customers done.");

      // Route & save workorders
      _setMigrationStep("Saving workorders...");
      const statusByLabel = {};
      for (const s of (settings.statuses || [])) statusByLabel[s.label.toLowerCase()] = s;
      const doneAndPaidID = statusByLabel["done & paid"]?.id;
      const openWOs = matchedWOs.filter(wo => wo.status !== doneAndPaidID);
      const completedWOs = matchedWOs.filter(wo => wo.status === doneAndPaidID);
      const allWOs = [...openWOs, ...completedWOs];
      console.log("[Dev Migration] Saving " + openWOs.length + " open WOs + " + completedWOs.length + " completed WOs...");
      _setMigrationProgress({ done: 0, total: allWOs.length });
      let woDone = 0;
      await dbBatchWrite(openWOs, "open-workorders", (done) => {
        woDone = done;
        _setMigrationProgress({ done: woDone, total: allWOs.length });
      });
      await dbBatchWrite(completedWOs, "completed-workorders", (done) => {
        _setMigrationProgress({ done: woDone + done, total: allWOs.length });
      });
      console.log("[Dev Migration] Workorders done.");

      // Save completed sales only (skip incomplete LS sale stubs)
      _setMigrationStep("Saving sales...");
      const completedSales = matchedSales.filter(s => s.paymentComplete);
      console.log("[Dev Migration] Saving " + completedSales.length + " completed sales (skipping " + (matchedSales.length - completedSales.length) + " incomplete)...");
      _setMigrationProgress({ done: 0, total: completedSales.length });
      await dbBatchWrite(completedSales, "completed-sales", (done, total) => {
        _setMigrationProgress({ done, total });
      });
      console.log("[Dev Migration] Sales done.");

      // Update local store
      useOpenWorkordersStore.getState().setOpenWorkorders(openWOs);

      const summary = "Dev Migration Complete: " +
        matchedWOs.length + "/" + freshData.workorders.length + " workorders, " +
        matchedCustomers.length + " customers, " +
        completedSales.length + " completed sales, " +
        mappedItems.length + " inventory";
      console.log("[Dev Migration] " + summary);
      _setMigrationStep("Complete!");
      _setMigrationProgress({ done: 0, total: 0 });
      _setLsResult(summary);
    } catch (e) {
      console.error("[Dev Migration] Error:", e);
      _setMigrationStep("Error");
      _setLsResult("Dev Migration Error: " + e.message);
    }
    _setDevMigrating(false);
  }

  let buttonStyle = {
    width: 200,
    height: 80,
    borderWidth: 1,
    borderColor: C.buttonLightGreenOutline,
    borderRadius: 10,
    backgroundColor: C.listItemWhite,
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  };

  return (
    <BoxContainerOuterComponent>
      <BoxContainerInnerComponent
        style={{ width: "100%", alignItems: "center", borderWidth: 0 }}
      >
        {/* --- Full Migration --- */}
        <TouchableOpacity
          onPress={handleFullMigration}
          disabled={sLookupLoading || sMigrating || sDevMigrating}
          style={{
            width: 300,
            paddingVertical: 14,
            borderRadius: 10,
            borderWidth: 2,
            borderColor: C.red,
            backgroundColor: sMigrating ? gray(0.85) : C.listItemWhite,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 10,
            opacity: sLookupLoading || sMigrating || sDevMigrating ? 0.5 : 1,
          }}
        >
          <Text style={{ fontSize: 15, color: C.red, fontWeight: "700" }}>
            {sMigrating ? "Migrating..." : "Full Migration"}
          </Text>
          <Text style={{ fontSize: 11, color: gray(0.5), marginTop: 3 }}>
            All customers, inventory, workorders, sales
          </Text>
        </TouchableOpacity>
        {sMigrating && sMigrationStep ? (
          <View style={{ width: 300, marginBottom: 10, alignItems: "center" }}>
            <Text style={{ fontSize: 13, color: C.text, fontWeight: "600", marginBottom: 4 }}>
              {sMigrationStep}
            </Text>
            {sMigrationProgress.total > 0 ? (
              <View style={{ width: "100%", height: 8, backgroundColor: gray(0.85), borderRadius: 4, overflow: "hidden" }}>
                <View style={{ width: Math.round((sMigrationProgress.done / sMigrationProgress.total) * 100) + "%", height: "100%", backgroundColor: C.green, borderRadius: 4 }} />
              </View>
            ) : null}
            {sMigrationProgress.total > 0 ? (
              <Text style={{ fontSize: 11, color: gray(0.5), marginTop: 2 }}>
                {sMigrationProgress.done} / {sMigrationProgress.total}
              </Text>
            ) : null}
          </View>
        ) : null}
        {/* --- Dev Migration --- */}
        <TouchableOpacity
          onPress={handleDevMigration}
          disabled={sLookupLoading || sMigrating || sDevMigrating}
          style={{
            width: 300,
            paddingVertical: 14,
            borderRadius: 10,
            borderWidth: 2,
            borderColor: C.orange,
            backgroundColor: sDevMigrating ? gray(0.85) : C.listItemWhite,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 10,
            opacity: sLookupLoading || sMigrating || sDevMigrating ? 0.5 : 1,
          }}
        >
          <Text style={{ fontSize: 15, color: C.orange, fontWeight: "700" }}>
            {sDevMigrating ? "Migrating..." : "Dev Migration"}
          </Text>
          <Text style={{ fontSize: 11, color: gray(0.5), marginTop: 3 }}>
            Status-matched WOs + linked customers & sales + full inventory
          </Text>
        </TouchableOpacity>
        {sDevMigrating && sMigrationStep ? (
          <View style={{ width: 300, marginBottom: 10, alignItems: "center" }}>
            <Text style={{ fontSize: 13, color: C.text, fontWeight: "600", marginBottom: 4 }}>
              {sMigrationStep}
            </Text>
            {sMigrationProgress.total > 0 ? (
              <View style={{ width: "100%", height: 8, backgroundColor: gray(0.85), borderRadius: 4, overflow: "hidden" }}>
                <View style={{ width: Math.round((sMigrationProgress.done / sMigrationProgress.total) * 100) + "%", height: "100%", backgroundColor: C.green, borderRadius: 4 }} />
              </View>
            ) : null}
            {sMigrationProgress.total > 0 ? (
              <Text style={{ fontSize: 11, color: gray(0.5), marginTop: 2 }}>
                {sMigrationProgress.done} / {sMigrationProgress.total}
              </Text>
            ) : null}
          </View>
        ) : null}
        <View style={{ width: "100%", height: 1, backgroundColor: C.buttonLightGreenOutline, marginBottom: 10 }} />
        {/* --- Dev Import --- */}
        <TouchableOpacity
          onPress={handleDevImport}
          disabled={sLookupLoading}
          style={{
            width: 300,
            paddingVertical: 14,
            borderRadius: 10,
            borderWidth: 2,
            borderColor: C.buttonLightGreenOutline,
            backgroundColor: sLookupLoading ? gray(0.85) : C.listItemWhite,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 10,
            opacity: sLookupLoading ? 0.5 : 1,
          }}
        >
          <Text style={{ fontSize: 15, color: C.text, fontWeight: "700" }}>
            {sLookupLoading ? "Importing..." : "Dev Import"}
          </Text>
          <Text style={{ fontSize: 11, color: gray(0.5), marginTop: 3 }}>
            Up to 40 workorders (matching statuses)
          </Text>
        </TouchableOpacity>
        {/* --- Inventory Import --- */}
        <TouchableOpacity
          onPress={handleInventoryImport}
          disabled={sLookupLoading}
          style={{
            width: 300,
            paddingVertical: 14,
            borderRadius: 10,
            borderWidth: 2,
            borderColor: C.buttonLightGreenOutline,
            backgroundColor: sLookupLoading ? gray(0.85) : C.listItemWhite,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 20,
            opacity: sLookupLoading ? 0.5 : 1,
          }}
        >
          <Text style={{ fontSize: 15, color: C.text, fontWeight: "700" }}>
            {sLookupLoading ? "Importing..." : "Inventory Import"}
          </Text>
          <Text style={{ fontSize: 11, color: gray(0.5), marginTop: 3 }}>
            All items from Lightspeed CSV
          </Text>
        </TouchableOpacity>
        {/* --- Clear DB --- */}
        <TouchableOpacity
          onPress={async () => {
            if (!window.confirm("Clear ALL customers, workorders, and sales from the database? This cannot be undone.")) return;
            _setLookupLoading(true);
            _setLsResult("");
            try {
              console.log("[Clear DB] Clearing collections...");
              const results = await Promise.all([
                dbClearCollection("customers"),
                dbClearCollection("open-workorders"),
                dbClearCollection("completed-workorders"),
                dbClearCollection("completed-sales"),
                dbClearCollection("active-sales"),
              ]);
              const total = results.reduce((sum, r) => sum + (r.deletedCount || 0), 0);
              console.log("[Clear DB] Done. Deleted " + total + " documents.");
              _setLsResult("Cleared " + total + " documents (customers, workorders, sales)");
            } catch (e) {
              console.error("[Clear DB] Error:", e);
              _setLsResult("Clear DB error: " + e.message);
            } finally {
              _setLookupLoading(false);
            }
          }}
          disabled={sLookupLoading}
          style={{
            width: 300,
            paddingVertical: 14,
            borderRadius: 10,
            borderWidth: 2,
            borderColor: C.lightred,
            backgroundColor: sLookupLoading ? gray(0.85) : C.listItemWhite,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 10,
            opacity: sLookupLoading ? 0.5 : 1,
          }}
        >
          <Text style={{ fontSize: 15, color: C.lightred, fontWeight: "700" }}>
            {sLookupLoading ? "Clearing..." : "Clear DB"}
          </Text>
          <Text style={{ fontSize: 11, color: gray(0.5), marginTop: 3 }}>
            Customers, workorders, sales
          </Text>
        </TouchableOpacity>
        {/* --- Clear Inventory --- */}
        <TouchableOpacity
          onPress={async () => {
            if (!window.confirm("Clear ALL inventory items from the database? This cannot be undone.")) return;
            _setLookupLoading(true);
            _setLsResult("");
            try {
              console.log("[Clear Inventory] Clearing...");
              const result = await dbClearCollection("inventory");
              console.log("[Clear Inventory] Done. Deleted " + (result.deletedCount || 0) + " items.");
              _setLsResult("Cleared " + (result.deletedCount || 0) + " inventory items");
            } catch (e) {
              console.error("[Clear Inventory] Error:", e);
              _setLsResult("Clear Inventory error: " + e.message);
            } finally {
              _setLookupLoading(false);
            }
          }}
          disabled={sLookupLoading}
          style={{
            width: 300,
            paddingVertical: 14,
            borderRadius: 10,
            borderWidth: 2,
            borderColor: C.lightred,
            backgroundColor: sLookupLoading ? gray(0.85) : C.listItemWhite,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 20,
            opacity: sLookupLoading ? 0.5 : 1,
          }}
        >
          <Text style={{ fontSize: 15, color: C.lightred, fontWeight: "700" }}>
            {sLookupLoading ? "Clearing..." : "Clear Inventory"}
          </Text>
          <Text style={{ fontSize: 11, color: gray(0.5), marginTop: 3 }}>
            All inventory items
          </Text>
        </TouchableOpacity>
        <View style={{ width: "100%", height: 1, backgroundColor: C.buttonLightGreenOutline, marginBottom: 10 }} />
        {/* --- Lightspeed Connection --- */}
        <Text style={{ fontSize: 16, fontWeight: "600", color: C.text, marginBottom: 10 }}>
          Lightspeed
        </Text>
        <View
          style={{
            width: "100%",
            flexDirection: "row",
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <View style={{ alignItems: "center", margin: 10 }}>
            <TouchableOpacity
              onPress={handleLsConnect}
              disabled={!!sLsImporting || sLsConnected}
              style={{
                ...buttonStyle,
                opacity: sLsImporting || sLsConnected ? 0.5 : 1,
                backgroundColor: sLsConnected ? C.green : C.listItemWhite,
              }}
            >
              <Image_ icon={ICONS.importIcon} size={30} />
              <Text
                style={{
                  fontSize: 14,
                  color: sLsConnected ? "white" : C.text,
                  marginTop: 8,
                  fontWeight: "500",
                  textAlign: "center",
                }}
              >
                {sLsImporting === "connecting"
                  ? "Connecting..."
                  : sLsImporting === "checking"
                  ? "Checking..."
                  : sLsConnected
                  ? "Connected"
                  : "Connect to Lightspeed"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        {/* --- Lightspeed CSV Exports --- */}
        <View style={{ width: "100%", height: 1, backgroundColor: C.buttonLightGreenOutline, marginTop: 20, marginBottom: 10 }} />
        <Text style={{ fontSize: 16, fontWeight: "600", color: C.text, marginBottom: 10 }}>
          Lightspeed CSV Exports
        </Text>
        <TouchableOpacity
          onPress={handleExportAllCsvs}
          disabled={!!sLsImporting || !sLsConnected}
          style={{
            width: 300,
            paddingVertical: 14,
            borderRadius: 10,
            borderWidth: 2,
            borderColor: C.buttonLightGreenOutline,
            backgroundColor: sLsImporting === "all-csvs" ? gray(0.85) : C.listItemWhite,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 15,
            opacity: sLsImporting || !sLsConnected ? 0.5 : 1,
          }}
        >
          <Text style={{ fontSize: 15, color: C.text, fontWeight: "700" }}>
            {sLsImporting === "all-csvs" ? "Exporting..." : "Export All CSVs"}
          </Text>
          <Text style={{ fontSize: 11, color: gray(0.5), marginTop: 3 }}>
            All 10 exports, sequentially
          </Text>
        </TouchableOpacity>
        <View style={{ width: "100%", flexDirection: "row", justifyContent: "center", flexWrap: "wrap" }}>
          {CSV_EXPORT_TYPES.map((btn) => (
            <View key={btn.type} style={{ alignItems: "center", margin: 10 }}>
              <TouchableOpacity
                onPress={() => handleLsImportType(btn.type, false)}
                disabled={!!sLsImporting || !sLsConnected}
                style={{
                  ...buttonStyle,
                  opacity: sLsImporting || !sLsConnected ? 0.5 : 1,
                }}
              >
                <Image_ icon={ICONS.importIcon} size={30} />
                <Text
                  style={{
                    fontSize: 14,
                    color: C.text,
                    marginTop: 8,
                    fontWeight: "500",
                    textAlign: "center",
                  }}
                >
                  {sLsImporting === btn.type ? "Exporting..." : "Export " + btn.label}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* --- Mapping Preview --- */}
        <View style={{ width: "100%", height: 1, backgroundColor: C.buttonLightGreenOutline, marginTop: 20, marginBottom: 10 }} />
        <Text style={{ fontSize: 16, fontWeight: "600", color: C.text, marginBottom: 10 }}>
          Mapping Preview
        </Text>
        <View style={{ width: "100%", alignItems: "center" }}>
          {/* Workorder lookup */}
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
            <Text style={{ fontSize: 13, color: C.text, marginRight: 8, width: 80 }}>Workorder #</Text>
            <TextInput
              value={sWoLookup}
              onChangeText={_setWoLookup}
              placeholder="e.g. 12345"
              placeholderTextColor={gray(0.4)}
              style={{
                width: 160,
                borderWidth: 2,
                borderColor: C.buttonLightGreenOutline,
                borderRadius: 10,
                backgroundColor: C.listItemWhite,
                paddingVertical: 8,
                paddingHorizontal: 10,
                fontSize: 13,
                color: C.text,
                outlineStyle: "none",
                marginRight: 8,
              }}
              onSubmitEditing={handleWoLookup}
            />
            <TouchableOpacity
              onPress={handleWoLookup}
              disabled={sLookupLoading || !sWoLookup.trim()}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 16,
                borderRadius: 10,
                backgroundColor: sLookupLoading || !sWoLookup.trim() ? gray(0.7) : C.green,
                opacity: sLookupLoading || !sWoLookup.trim() ? 0.5 : 1,
              }}
            >
              <Text style={{ fontSize: 13, color: "white", fontWeight: "600" }}>
                {sLookupLoading ? "..." : "Go"}
              </Text>
            </TouchableOpacity>
          </View>
          {/* Customer lookup */}
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
            <Text style={{ fontSize: 13, color: C.text, marginRight: 8, width: 80 }}>Customer Ph</Text>
            <TextInput
              value={sCustLookup}
              onChangeText={_setCustLookup}
              placeholder="e.g. 239-291-9396"
              placeholderTextColor={gray(0.4)}
              style={{
                width: 160,
                borderWidth: 2,
                borderColor: C.buttonLightGreenOutline,
                borderRadius: 10,
                backgroundColor: C.listItemWhite,
                paddingVertical: 8,
                paddingHorizontal: 10,
                fontSize: 13,
                color: C.text,
                outlineStyle: "none",
                marginRight: 8,
              }}
              onSubmitEditing={handleCustLookup}
            />
            <TouchableOpacity
              onPress={handleCustLookup}
              disabled={sLookupLoading || !sCustLookup.trim()}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 16,
                borderRadius: 10,
                backgroundColor: sLookupLoading || !sCustLookup.trim() ? gray(0.7) : C.green,
                opacity: sLookupLoading || !sCustLookup.trim() ? 0.5 : 1,
              }}
            >
              <Text style={{ fontSize: 13, color: "white", fontWeight: "600" }}>
                {sLookupLoading ? "..." : "Go"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {sLsResult ? (
          <Text style={{ fontSize: 13, color: sLsResult.startsWith("Error") ? C.red : C.green, marginTop: 10, textAlign: "center" }}>
            {sLsResult}
          </Text>
        ) : null}
      </BoxContainerInnerComponent>
    </BoxContainerOuterComponent>
  );
};

const TextTemplatesComponent = ({ zSettingsObj, handleSettingsFieldChange }) => {
  const [sSelectedTemplateId, _setSelectedTemplateId] = useState(null);
  const [sLocalEdits, _setLocalEdits] = useState({});
  const [sNewTemplateIds, _setNewTemplateIds] = useState([]);
  const [sUnsavedTemplates, _setUnsavedTemplates] = useState([]);
  const [sEmojiModalTemplateId, _setEmojiModalTemplateId] = useState(null);
  const cursorPositionRefs = useRef({});
  const textInputRefs = useRef({});

  let savedTemplates = zSettingsObj?.smsTemplates || zSettingsObj?.textTemplates || [];
  let templates = [...sUnsavedTemplates, ...savedTemplates].sort((a, b) => (b.type ? 1 : 0) - (a.type ? 1 : 0));

  // Backward compat helpers
  function getLabel(t) { return t.label || t.name || t.buttonLabel || ""; }
  function getContent(t) { return t.content || t.message || t.text || ""; }

  function getLocalValue(templateId, field) {
    let key = templateId + "_" + field;
    return key in sLocalEdits ? sLocalEdits[key] : null;
  }

  function isNewTemplate(templateId) {
    return sNewTemplateIds.indexOf(templateId) !== -1;
  }

  function handleAddTemplate() {
    let newTemplate = {
      id: generateRandomID(),
      label: "",
      content: "",
      type: "",
    };
    _setUnsavedTemplates([newTemplate, ...sUnsavedTemplates]);
    _setNewTemplateIds([...sNewTemplateIds, newTemplate.id]);
    _setSelectedTemplateId(newTemplate.id);
  }

  function handleSaveNewTemplate(templateObj) {
    let finalTemplate = {
      id: templateObj.id,
      label: getLocalValue(templateObj.id, "label") ?? getLabel(templateObj),
      content: getLocalValue(templateObj.id, "content") ?? getContent(templateObj),
      type: templateObj.type || "",
    };
    let arr = [finalTemplate, ...savedTemplates];
    handleSettingsFieldChange("smsTemplates", arr);
    _setUnsavedTemplates(sUnsavedTemplates.filter((t) => t.id !== templateObj.id));
    _setNewTemplateIds(sNewTemplateIds.filter((id) => id !== templateObj.id));
    let newEdits = { ...sLocalEdits };
    delete newEdits[templateObj.id + "_label"];
    delete newEdits[templateObj.id + "_content"];
    _setLocalEdits(newEdits);
  }

  function handleDeleteTemplate(templateObj) {
    if (isNewTemplate(templateObj.id)) {
      _setUnsavedTemplates(sUnsavedTemplates.filter((t) => t.id !== templateObj.id));
      _setNewTemplateIds(sNewTemplateIds.filter((id) => id !== templateObj.id));
    } else {
      let arr = savedTemplates.filter((t) => t.id !== templateObj.id);
      handleSettingsFieldChange("smsTemplates", arr);
    }
    if (sSelectedTemplateId === templateObj.id) _setSelectedTemplateId(null);
    let newEdits = { ...sLocalEdits };
    delete newEdits[templateObj.id + "_label"];
    delete newEdits[templateObj.id + "_content"];
    _setLocalEdits(newEdits);
  }

  function handleFieldChange(templateObj, field, val) {
    if (isNewTemplate(templateObj.id)) {
      _setLocalEdits({ ...sLocalEdits, [templateObj.id + "_" + field]: val });
    } else {
      let arr = savedTemplates.map((t) => {
        if (t.id === templateObj.id) return { ...t, [field]: val };
        return t;
      });
      handleSettingsFieldChange("smsTemplates", arr);
    }
  }

  function handleInsertVariable(templateObj, variableStr) {
    let currentContent = isNewTemplate(templateObj.id)
      ? (getLocalValue(templateObj.id, "content") ?? getContent(templateObj))
      : getContent(templateObj);
    let cursorPos =
      cursorPositionRefs.current[templateObj.id] ?? currentContent.length;
    let before = currentContent.slice(0, cursorPos);
    let after = currentContent.slice(cursorPos);
    let newContent = before + variableStr + after;

    if (isNewTemplate(templateObj.id)) {
      _setLocalEdits({ ...sLocalEdits, [templateObj.id + "_content"]: newContent });
    } else {
      let arr = savedTemplates.map((t) => {
        if (t.id === templateObj.id) return { ...t, content: newContent };
        return t;
      });
      handleSettingsFieldChange("smsTemplates", arr);
    }
    cursorPositionRefs.current[templateObj.id] =
      cursorPos + variableStr.length;
    textInputRefs.current[templateObj.id]?.focus();
  }

  return (
    <BoxContainerOuterComponent>
      <BoxContainerInnerComponent
        style={{ width: "100%", alignItems: "center" }}
      >
        {/* Add button */}
        <View style={{ width: "100%", alignItems: "flex-start" }}>
          <BoxButton1 onPress={handleAddTemplate} />
        </View>

        {/* Templates list */}
        <View style={{ marginTop: 10, width: "100%" }}>
          <FlatList
            data={templates}
            keyExtractor={(item) => item.id}
            renderItem={({ item: templateObj }) => {
              let isSelected = sSelectedTemplateId === templateObj.id;

              return (
                <View
                  style={{
                    width: "100%",
                    marginBottom: 15,
                    borderWidth: 1,
                    borderColor: isSelected
                      ? C.green
                      : C.buttonLightGreenOutline,
                    borderRadius: 10,
                    padding: 10,
                    backgroundColor: C.backgroundListWhite,
                  }}
                >
                  {/* Row: template name + delete button */}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginBottom: 8,
                    }}
                  >
                    <TextInput_
                      onChangeText={(val) =>
                        handleFieldChange(templateObj, "label", val)
                      }
                      onFocus={() => _setSelectedTemplateId(templateObj.id)}
                      placeholder="Template name..."
                      placeholderTextColor={gray(0.3)}
                      style={{
                        flex: 1,
                        borderColor: C.buttonLightGreenOutline,
                        borderWidth: 1,
                        borderRadius: 5,
                        padding: 5,
                        color: C.text,
                        outlineWidth: 0,
                        fontWeight: "500",
                        fontSize: 14,
                      }}
                      value={isNewTemplate(templateObj.id) ? (getLocalValue(templateObj.id, "label") ?? getLabel(templateObj)) : getLabel(templateObj)}
                    />
                    {!templateObj.type && (
                      <Tooltip text="Delete template" position="top">
                        <BoxButton1
                          onPress={() => handleDeleteTemplate(templateObj)}
                          style={{ marginLeft: 8 }}
                          iconSize={15}
                          icon={ICONS.close1}
                        />
                      </Tooltip>
                    )}
                  </View>

                  {/* Message body */}
                  <TextInput
                    ref={(el) => {
                      if (el) {
                        textInputRefs.current[templateObj.id] = el;
                        setTimeout(() => { if (el.style) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }, 0);
                      }
                    }}
                    multiline={true}
                    onChangeText={(val) =>
                      handleFieldChange(templateObj, "content", val)
                    }
                    onFocus={() => _setSelectedTemplateId(templateObj.id)}
                    onSelectionChange={(event) => {
                      let { start } = event.nativeEvent.selection;
                      cursorPositionRefs.current[templateObj.id] = start;
                    }}
                    onContentSizeChange={(event) => {
                      let el = event?.target || event?.nativeEvent?.target;
                      if (el) {
                        el.style.height = "auto";
                        el.style.height = el.scrollHeight + "px";
                      }
                    }}
                    placeholder="Message body..."
                    placeholderTextColor={gray(0.3)}
                    style={{
                      borderColor: C.buttonLightGreenOutline,
                      borderWidth: 1,
                      borderRadius: 5,
                      padding: 8,
                      color: C.text,
                      outlineWidth: 0,
                      fontSize: 14,
                      minHeight: 80,
                      textAlignVertical: "top",
                      overflow: "hidden",
                    }}
                    value={isNewTemplate(templateObj.id) ? (getLocalValue(templateObj.id, "content") ?? getContent(templateObj)) : getContent(templateObj)}
                  />

                  {/* Variable buttons + emoji picker - shown when template is selected */}
                  {isSelected && (
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        marginTop: 8,
                        alignItems: "center",
                      }}
                    >
                      <TouchableOpacity
                        onPress={() => _setEmojiModalTemplateId(templateObj.id)}
                        style={{
                          backgroundColor: C.buttonLightGreen,
                          borderWidth: 1,
                          borderColor: C.buttonLightGreenOutline,
                          borderRadius: 5,
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          marginRight: 5,
                          marginBottom: 5,
                        }}
                      >
                        <Text style={{ fontSize: 14 }}>{"😊"}</Text>
                      </TouchableOpacity>
                      {TEXT_TEMPLATE_VARIABLES.map((v) => (
                        <TouchableOpacity
                          key={v.variable}
                          onPress={() =>
                            handleInsertVariable(templateObj, v.variable)
                          }
                          style={{
                            backgroundColor: C.buttonLightGreen,
                            borderWidth: 1,
                            borderColor: C.buttonLightGreenOutline,
                            borderRadius: 5,
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                            marginRight: 5,
                            marginBottom: 5,
                          }}
                        >
                          <Text style={{ fontSize: 12, color: C.text }}>
                            {v.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* Save button - only for new unsaved templates */}
                  {isNewTemplate(templateObj.id) && (
                    <Button_
                      colorGradientArr={COLOR_GRADIENTS.greenblue}
                      text="SAVE"
                      onPress={() => handleSaveNewTemplate(templateObj)}
                      textStyle={{ color: C.textWhite, fontSize: 13 }}
                      buttonStyle={{
                        alignSelf: "flex-end",
                        marginTop: 8,
                        width: 100,
                      }}
                    />
                  )}
                </View>
              );
            }}
          />
        </View>

        {/* Emoji picker modal — portaled to body to avoid z-index issues */}
        {!!sEmojiModalTemplateId && createPortal(
          <View style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.4)", zIndex: 9999 }}>
            <TouchableWithoutFeedback onPress={() => _setEmojiModalTemplateId(null)}>
              <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
            </TouchableWithoutFeedback>
            <View style={{ backgroundColor: C.backgroundWhite, borderRadius: 12, padding: 15, width: 320 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: C.text, marginBottom: 10, textAlign: "center" }}>{"Insert Emoji"}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center" }}>
                {TEMPLATE_EMOJIS.map((e) => (
                  <TouchableOpacity
                    key={e.id}
                    onPress={() => {
                      let tObj = templates.find((t) => t.id === sEmojiModalTemplateId);
                      if (tObj) handleInsertVariable(tObj, e.id);
                      _setEmojiModalTemplateId(null);
                    }}
                    style={{ width: 48, height: 48, justifyContent: "center", alignItems: "center", borderRadius: 8 }}
                  >
                    <Text style={{ fontSize: 24 }}>{e.id}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>,
          document.body
        )}

      </BoxContainerInnerComponent>
    </BoxContainerOuterComponent>
  );
};

const EMAIL_TEMPLATE_VARIABLES = [
  { label: "First Name", variable: "{firstName}" },
  { label: "Last Name", variable: "{lastName}" },
  { label: "Customer Email", variable: "{customerEmail}" },
  { label: "Brand", variable: "{brand}" },
  { label: "Description", variable: "{description}" },
  { label: "Total Amount", variable: "{totalAmount}" },
  { label: "Line Items", variable: "{lineItems}" },
  { label: "Customer Notes", variable: "{customerNotes}" },
  { label: "Store Name", variable: "{storeName}" },
  { label: "Store Address", variable: "{storeAddress}" },
  { label: "Store Hours", variable: "{storeHours}" },
  { label: "Store Phone", variable: "{storePhone}" },
  { label: "Employee Name", variable: "{employeeName}" },
  { label: "Pay Period", variable: "{payPeriod}" },
  { label: "Daily Breakdown", variable: "{dailyBreakdown}" },
  { label: "Total Hours", variable: "{totalHours}" },
  { label: "Pay Rate", variable: "{payRate}" },
  { label: "Total Pay", variable: "{totalPay}" },
];

const EmailTemplatesComponent = ({ zSettingsObj, handleSettingsFieldChange }) => {
  const [sSelectedTemplateId, _setSelectedTemplateId] = useState(null);
  const [sLocalEdits, _setLocalEdits] = useState({});
  const [sNewTemplateIds, _setNewTemplateIds] = useState([]);
  const [sUnsavedTemplates, _setUnsavedTemplates] = useState([]);
  const [sEmojiModalTemplateId, _setEmojiModalTemplateId] = useState(null);
  const cursorPositionRefs = useRef({});
  const textInputRefs = useRef({});

  let savedTemplates = zSettingsObj?.emailTemplates || [];
  let templates = [...sUnsavedTemplates, ...savedTemplates].sort((a, b) => (b.type ? 1 : 0) - (a.type ? 1 : 0));

  // Backward compat helpers
  function getLabel(t) { return t.label || t.name || ""; }
  function getContent(t) { return t.content || t.body || ""; }

  function getLocalValue(templateId, field) {
    let key = templateId + "_" + field;
    return key in sLocalEdits ? sLocalEdits[key] : null;
  }

  function isNewTemplate(templateId) {
    return sNewTemplateIds.indexOf(templateId) !== -1;
  }

  function handleAddTemplate() {
    let newTemplate = {
      id: generateRandomID(),
      label: "",
      subject: "",
      content: "",
      type: "",
    };
    _setUnsavedTemplates([newTemplate, ...sUnsavedTemplates]);
    _setNewTemplateIds([...sNewTemplateIds, newTemplate.id]);
    _setSelectedTemplateId(newTemplate.id);
  }

  function handleSaveNewTemplate(templateObj) {
    let finalTemplate = {
      id: templateObj.id,
      label: getLocalValue(templateObj.id, "label") ?? getLabel(templateObj),
      subject: getLocalValue(templateObj.id, "subject") ?? templateObj.subject,
      content: getLocalValue(templateObj.id, "content") ?? getContent(templateObj),
      type: templateObj.type || "",
    };
    let arr = [finalTemplate, ...savedTemplates];
    handleSettingsFieldChange("emailTemplates", arr);
    _setUnsavedTemplates(sUnsavedTemplates.filter((t) => t.id !== templateObj.id));
    _setNewTemplateIds(sNewTemplateIds.filter((id) => id !== templateObj.id));
    let newEdits = { ...sLocalEdits };
    delete newEdits[templateObj.id + "_label"];
    delete newEdits[templateObj.id + "_subject"];
    delete newEdits[templateObj.id + "_content"];
    _setLocalEdits(newEdits);
  }

  function handleDeleteTemplate(templateObj) {
    if (isNewTemplate(templateObj.id)) {
      _setUnsavedTemplates(sUnsavedTemplates.filter((t) => t.id !== templateObj.id));
      _setNewTemplateIds(sNewTemplateIds.filter((id) => id !== templateObj.id));
    } else {
      let arr = savedTemplates.filter((t) => t.id !== templateObj.id);
      handleSettingsFieldChange("emailTemplates", arr);
    }
    if (sSelectedTemplateId === templateObj.id) _setSelectedTemplateId(null);
    let newEdits = { ...sLocalEdits };
    delete newEdits[templateObj.id + "_label"];
    delete newEdits[templateObj.id + "_subject"];
    delete newEdits[templateObj.id + "_content"];
    _setLocalEdits(newEdits);
  }

  function handleFieldChange(templateObj, field, val) {
    if (isNewTemplate(templateObj.id)) {
      _setLocalEdits({ ...sLocalEdits, [templateObj.id + "_" + field]: val });
    } else {
      let arr = savedTemplates.map((t) => {
        if (t.id === templateObj.id) return { ...t, [field]: val };
        return t;
      });
      handleSettingsFieldChange("emailTemplates", arr);
    }
  }

  function handleInsertVariable(templateObj, variableStr) {
    let currentContent = isNewTemplate(templateObj.id)
      ? (getLocalValue(templateObj.id, "content") ?? getContent(templateObj))
      : getContent(templateObj);
    let cursorPos =
      cursorPositionRefs.current[templateObj.id] ?? currentContent.length;
    let before = currentContent.slice(0, cursorPos);
    let after = currentContent.slice(cursorPos);
    let newContent = before + variableStr + after;

    if (isNewTemplate(templateObj.id)) {
      _setLocalEdits({ ...sLocalEdits, [templateObj.id + "_content"]: newContent });
    } else {
      let arr = savedTemplates.map((t) => {
        if (t.id === templateObj.id) return { ...t, content: newContent };
        return t;
      });
      handleSettingsFieldChange("emailTemplates", arr);
    }
    cursorPositionRefs.current[templateObj.id] =
      cursorPos + variableStr.length;
    textInputRefs.current[templateObj.id]?.focus();
  }

  return (
    <BoxContainerOuterComponent>
      <BoxContainerInnerComponent
        style={{ width: "100%", alignItems: "center" }}
      >
        {/* Add button */}
        <View style={{ width: "100%", alignItems: "flex-start" }}>
          <BoxButton1 onPress={handleAddTemplate} />
        </View>

        {/* Templates list */}
        <View style={{ marginTop: 10, width: "100%" }}>
          <FlatList
            data={templates}
            keyExtractor={(item) => item.id}
            renderItem={({ item: templateObj }) => {
              let isSelected = sSelectedTemplateId === templateObj.id;

              return (
                <View
                  style={{
                    width: "100%",
                    marginBottom: 15,
                    borderWidth: 1,
                    borderColor: isSelected
                      ? C.green
                      : C.buttonLightGreenOutline,
                    borderRadius: 10,
                    padding: 10,
                    backgroundColor: C.backgroundListWhite,
                  }}
                >
                  {/* Row: template name + type dropdown + delete button */}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginBottom: 8,
                    }}
                  >
                    <TextInput_
                      onChangeText={(val) =>
                        handleFieldChange(templateObj, "label", val)
                      }
                      onFocus={() => _setSelectedTemplateId(templateObj.id)}
                      placeholder="Template name..."
                      placeholderTextColor={gray(0.3)}
                      style={{
                        flex: 1,
                        borderColor: C.buttonLightGreenOutline,
                        borderWidth: 1,
                        borderRadius: 5,
                        padding: 5,
                        color: C.text,
                        outlineWidth: 0,
                        fontWeight: "500",
                        fontSize: 14,
                      }}
                      value={isNewTemplate(templateObj.id) ? (getLocalValue(templateObj.id, "label") ?? getLabel(templateObj)) : getLabel(templateObj)}
                    />
                    {!templateObj.type && (
                      <Tooltip text="Delete template" position="top">
                        <BoxButton1
                          onPress={() => handleDeleteTemplate(templateObj)}
                          style={{ marginLeft: 8 }}
                          iconSize={15}
                          icon={ICONS.close1}
                        />
                      </Tooltip>
                    )}
                  </View>

                  {/* Subject line */}
                  <TextInput_
                    onChangeText={(val) =>
                      handleFieldChange(templateObj, "subject", val)
                    }
                    onFocus={() => _setSelectedTemplateId(templateObj.id)}
                    placeholder="Email subject..."
                    placeholderTextColor={gray(0.3)}
                    style={{
                      borderColor: C.buttonLightGreenOutline,
                      borderWidth: 1,
                      borderRadius: 5,
                      padding: 5,
                      color: C.text,
                      outlineWidth: 0,
                      fontSize: 14,
                      marginBottom: 8,
                    }}
                    value={isNewTemplate(templateObj.id) ? (getLocalValue(templateObj.id, "subject") ?? templateObj.subject) : templateObj.subject}
                  />

                  {/* Email body */}
                  <TextInput
                    ref={(el) => {
                      if (el) {
                        textInputRefs.current[templateObj.id] = el;
                        setTimeout(() => { if (el.style) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }, 0);
                      }
                    }}
                    multiline={true}
                    onChangeText={(val) =>
                      handleFieldChange(templateObj, "content", val)
                    }
                    onFocus={() => _setSelectedTemplateId(templateObj.id)}
                    onSelectionChange={(event) => {
                      let { start } = event.nativeEvent.selection;
                      cursorPositionRefs.current[templateObj.id] = start;
                    }}
                    onContentSizeChange={(event) => {
                      let el = event?.target || event?.nativeEvent?.target;
                      if (el) {
                        el.style.height = "auto";
                        el.style.height = el.scrollHeight + "px";
                      }
                    }}
                    placeholder="Email body (HTML supported)..."
                    placeholderTextColor={gray(0.3)}
                    style={{
                      borderColor: C.buttonLightGreenOutline,
                      borderWidth: 1,
                      borderRadius: 5,
                      padding: 8,
                      color: C.text,
                      outlineWidth: 0,
                      fontSize: 14,
                      minHeight: 120,
                      textAlignVertical: "top",
                      overflow: "hidden",
                    }}
                    value={isNewTemplate(templateObj.id) ? (getLocalValue(templateObj.id, "content") ?? getContent(templateObj)) : getContent(templateObj)}
                  />

                  {/* Variable buttons + emoji picker - shown when template is selected */}
                  {isSelected && (
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        marginTop: 8,
                        alignItems: "center",
                      }}
                    >
                      <TouchableOpacity
                        onPress={() => _setEmojiModalTemplateId(templateObj.id)}
                        style={{
                          backgroundColor: C.buttonLightGreen,
                          borderWidth: 1,
                          borderColor: C.buttonLightGreenOutline,
                          borderRadius: 5,
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          marginRight: 5,
                          marginBottom: 5,
                        }}
                      >
                        <Text style={{ fontSize: 14 }}>{"😊"}</Text>
                      </TouchableOpacity>
                      {EMAIL_TEMPLATE_VARIABLES.map((v) => (
                        <TouchableOpacity
                          key={v.variable}
                          onPress={() =>
                            handleInsertVariable(templateObj, v.variable)
                          }
                          style={{
                            backgroundColor: C.buttonLightGreen,
                            borderWidth: 1,
                            borderColor: C.buttonLightGreenOutline,
                            borderRadius: 5,
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                            marginRight: 5,
                            marginBottom: 5,
                          }}
                        >
                          <Text style={{ fontSize: 12, color: C.text }}>
                            {v.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* Save button - only for new unsaved templates */}
                  {isNewTemplate(templateObj.id) && (
                    <Button_
                      colorGradientArr={COLOR_GRADIENTS.greenblue}
                      text="SAVE"
                      onPress={() => handleSaveNewTemplate(templateObj)}
                      textStyle={{ color: C.textWhite, fontSize: 13 }}
                      buttonStyle={{
                        alignSelf: "flex-end",
                        marginTop: 8,
                        width: 100,
                      }}
                    />
                  )}
                </View>
              );
            }}
          />
        </View>

        {/* Emoji picker modal */}
        {/* Emoji picker modal — portaled to body to avoid z-index issues */}
        {!!sEmojiModalTemplateId && createPortal(
          <View style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.4)", zIndex: 9999 }}>
            <TouchableWithoutFeedback onPress={() => _setEmojiModalTemplateId(null)}>
              <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
            </TouchableWithoutFeedback>
            <View style={{ backgroundColor: C.backgroundWhite, borderRadius: 12, padding: 15, width: 320 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: C.text, marginBottom: 10, textAlign: "center" }}>{"Insert Emoji"}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center" }}>
                {TEMPLATE_EMOJIS.map((e) => (
                  <TouchableOpacity
                    key={e.id}
                    onPress={() => {
                      let tObj = templates.find((t) => t.id === sEmojiModalTemplateId);
                      if (tObj) handleInsertVariable(tObj, e.id);
                      _setEmojiModalTemplateId(null);
                    }}
                    style={{ width: 48, height: 48, justifyContent: "center", alignItems: "center", borderRadius: 8 }}
                  >
                    <Text style={{ fontSize: 24 }}>{e.id}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>,
          document.body
        )}

      </BoxContainerInnerComponent>
    </BoxContainerOuterComponent>
  );
};

////////////////////////////////////////////////////////////////////////////////

const BlockedNumbersComponent = ({ zSettingsObj, handleSettingsFieldChange }) => {
  const [sNewNumber, _setNewNumber] = useState("");

  let blockedNumbers = zSettingsObj?.smsBlockedNumbers || [];

  function handleAddNumber() {
    let cleaned = (sNewNumber || "").replace(/\D/g, "");
    if (cleaned.length !== 10) return;
    if (blockedNumbers.includes(cleaned)) return;
    let arr = [...blockedNumbers, cleaned];
    handleSettingsFieldChange("smsBlockedNumbers", arr);
    _setNewNumber("");
  }

  function handleRemoveNumber(phone) {
    let arr = blockedNumbers.filter((n) => n !== phone);
    handleSettingsFieldChange("smsBlockedNumbers", arr);
  }

  return (
    <BoxContainerOuterComponent>
      <BoxContainerInnerComponent>
        <Text style={{ fontSize: 16, fontWeight: "500", color: C.text, marginBottom: 10, alignSelf: "flex-start" }}>
          Blocked Phone Numbers
        </Text>
        <Text style={{ fontSize: 13, color: gray(0.5), marginBottom: 15, alignSelf: "flex-start" }}>
          Blocked numbers will receive an auto-response and their messages will not be stored.
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", width: "100%", marginBottom: 15 }}>
          <TextInput_
            value={sNewNumber}
            onChangeText={(val) => {
              let cleaned = val.replace(/[^0-9\-]/g, "");
              _setNewNumber(cleaned);
            }}
            placeholder="Phone number (10 digits)"
            placeholderTextColor={gray(0.4)}
            style={{
              flex: 1,
              borderWidth: 2,
              borderColor: C.buttonLightGreenOutline,
              borderRadius: 10,
              backgroundColor: C.listItemWhite,
              paddingVertical: 10,
              paddingHorizontal: 10,
              fontSize: 15,
              color: C.text,
              marginRight: 10,
            }}
          />
          <Button_
            onPress={handleAddNumber}
            text={"Add"}
            enabled={sNewNumber.replace(/\D/g, "").length === 10}
            colorGradientArr={COLOR_GRADIENTS.green}
            buttonStyle={{ borderRadius: 5, paddingHorizontal: 20 }}
          />
        </View>
        {blockedNumbers.length === 0 && (
          <Text style={{ fontSize: 14, color: gray(0.4), fontStyle: "italic", alignSelf: "flex-start" }}>
            No blocked numbers
          </Text>
        )}
        {blockedNumbers.map((phone) => (
          <View
            key={phone}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              paddingVertical: 8,
              paddingHorizontal: 5,
              borderBottomWidth: 1,
              borderBottomColor: gray(0.1),
            }}
          >
            <Text style={{ fontSize: 15, color: C.text }}>
              {formatPhoneWithDashes(phone)}
            </Text>
            <Button_
              onPress={() => handleRemoveNumber(phone)}
              text={"Remove"}
              colorGradientArr={COLOR_GRADIENTS.red}
              buttonStyle={{ borderRadius: 5, paddingHorizontal: 15 }}
            />
          </View>
        ))}
      </BoxContainerInnerComponent>
    </BoxContainerOuterComponent>
  );
};

////////////////////////////////////////////////////////////////////////////////
// BACKUP & RECOVERY COMPONENT
////////////////////////////////////////////////////////////////////////////////

const ARCHIVE_COLLECTION_NAMES = [
  "completed-workorders",
  "completed-sales",
  "customers",
  "sales-index",
];

const MILLIS_IN_WEEK = 7 * 24 * 60 * 60 * 1000;

function BackupRecoveryComponent() {
  const zSettings = useSettingsStore((state) => state.settings);
  const tenantID = zSettings?.tenantID;
  const storeID = zSettings?.storeID;

  const [sLogs, _setLogs] = useState([]);
  const [sLoading, _setLoading] = useState(false);
  const [sRehydrating, _setRehydrating] = useState(false);
  const [sConfirmStep, _setConfirmStep] = useState(0); // 0=idle, 1=first confirm, 2=second confirm
  const [sRehydrateResult, _setRehydrateResult] = useState(null);
  const [sWeeksLoaded, _setWeeksLoaded] = useState(1);

  async function loadLogs(weeksBack) {
    if (!tenantID || !storeID) return;
    _setLoading(true);
    try {
      const endMillis = Date.now();
      const startMillis = endMillis - weeksBack * MILLIS_IN_WEEK;
      const collectionPath = `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.ARCHIVE_LOGS}`;
      const results = await firestoreQuery(
        collectionPath,
        [
          { field: "millis", operator: ">=", value: startMillis },
          { field: "millis", operator: "<=", value: endMillis },
        ],
        { orderBy: { field: "millis", direction: "desc" } }
      );
      _setLogs(results);
    } catch (err) {
      log("BackupRecovery: Error loading logs", err);
    }
    _setLoading(false);
  }

  function handleLoadInitial() {
    _setWeeksLoaded(1);
    loadLogs(1);
  }

  function handleLoadMore() {
    const next = sWeeksLoaded + 1;
    _setWeeksLoaded(next);
    loadLogs(next);
  }

  async function handleRehydrate() {
    _setRehydrating(true);
    _setRehydrateResult(null);
    try {
      const result = await dbRehydrateFromArchive(ARCHIVE_COLLECTION_NAMES);
      _setRehydrateResult(result);
    } catch (err) {
      _setRehydrateResult({ success: false, error: err.message });
    }
    _setRehydrating(false);
    _setConfirmStep(0);
  }

  return (
    <BoxContainerOuterComponent>
      <BoxContainerInnerComponent style={{ alignItems: "center" }}>
        {/*** REHYDRATE SECTION ***/}
        <Text
          style={{
            fontSize: 15,
            fontWeight: "700",
            color: C.text,
            marginBottom: 10,
            alignSelf: "flex-start",
          }}
        >
          EMERGENCY DATA RESTORE
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: gray(0.5),
            marginBottom: 15,
            alignSelf: "flex-start",
          }}
        >
          Restores all archived data from Cloud Storage back to Firestore. Only
          use this if the database has been corrupted or data is missing.
        </Text>

        {sConfirmStep === 0 && (
          <Button_
            text="Restore from Backup"
            onPress={() => _setConfirmStep(1)}
            colorGradientArr={COLOR_GRADIENTS.red}
            buttonStyle={{ borderRadius: 5, paddingHorizontal: 20 }}
            disabled={sRehydrating}
          />
        )}

        {sConfirmStep === 1 && (
          <View style={{ alignItems: "center" }}>
            <Text
              style={{
                fontSize: 13,
                fontWeight: "700",
                color: C.red,
                marginBottom: 10,
              }}
            >
              This will overwrite current Firestore data with the latest nightly
              backup. Are you sure?
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button_
                text="Yes, Continue"
                onPress={() => _setConfirmStep(2)}
                colorGradientArr={COLOR_GRADIENTS.red}
                buttonStyle={{ borderRadius: 5, paddingHorizontal: 15 }}
              />
              <Button_
                text="Cancel"
                onPress={() => _setConfirmStep(0)}
                colorGradientArr={COLOR_GRADIENTS.grey}
                buttonStyle={{ borderRadius: 5, paddingHorizontal: 15 }}
              />
            </View>
          </View>
        )}

        {sConfirmStep === 2 && (
          <View style={{ alignItems: "center" }}>
            <Text
              style={{
                fontSize: 13,
                fontWeight: "700",
                color: C.red,
                marginBottom: 10,
              }}
            >
              FINAL CONFIRMATION: This action cannot be undone. Restore all data
              from the last nightly backup?
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button_
                text={sRehydrating ? "Restoring..." : "CONFIRM RESTORE"}
                onPress={handleRehydrate}
                colorGradientArr={COLOR_GRADIENTS.red}
                buttonStyle={{ borderRadius: 5, paddingHorizontal: 15 }}
                disabled={sRehydrating}
                loading={sRehydrating}
              />
              <Button_
                text="Cancel"
                onPress={() => _setConfirmStep(0)}
                colorGradientArr={COLOR_GRADIENTS.grey}
                buttonStyle={{ borderRadius: 5, paddingHorizontal: 15 }}
                disabled={sRehydrating}
              />
            </View>
          </View>
        )}

        {!!sRehydrateResult && (
          <View
            style={{
              marginTop: 15,
              padding: 10,
              borderRadius: 8,
              backgroundColor: sRehydrateResult.success
                ? "rgba(0,180,0,0.08)"
                : "rgba(220,0,0,0.08)",
              width: "100%",
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "700",
                color: sRehydrateResult.success ? C.green : C.red,
                marginBottom: 5,
              }}
            >
              {sRehydrateResult.success
                ? "Restore Complete"
                : "Restore Failed"}
            </Text>
            {sRehydrateResult.success &&
              sRehydrateResult.results &&
              Object.entries(sRehydrateResult.results).map(([name, r]) => (
                <Text
                  key={name}
                  style={{ fontSize: 12, color: C.text, marginBottom: 2 }}
                >
                  {name}: {r.success ? r.docCount + " docs restored" : "FAILED — " + r.error}
                </Text>
              ))}
            {!sRehydrateResult.success && sRehydrateResult.error && (
              <Text style={{ fontSize: 12, color: C.red }}>
                {sRehydrateResult.error}
              </Text>
            )}
          </View>
        )}
      </BoxContainerInnerComponent>

      {/*** ARCHIVE LOGS SECTION ***/}
      <View style={{ height: 20 }} />
      <BoxContainerInnerComponent style={{ alignItems: "center" }}>
        <Text
          style={{
            fontSize: 15,
            fontWeight: "700",
            color: C.text,
            marginBottom: 10,
            alignSelf: "flex-start",
          }}
        >
          NIGHTLY BACKUP LOGS
        </Text>

        {sLogs.length === 0 && !sLoading && (
          <Button_
            text="Load Logs"
            onPress={handleLoadInitial}
            colorGradientArr={COLOR_GRADIENTS.blue}
            buttonStyle={{ borderRadius: 5, paddingHorizontal: 20 }}
          />
        )}

        {sLoading && (
          <Text style={{ fontSize: 12, color: gray(0.5), marginVertical: 10 }}>
            Loading...
          </Text>
        )}

        {sLogs.length > 0 &&
          sLogs.map((logEntry) => (
            <View
              key={logEntry.id}
              style={{
                width: "100%",
                borderWidth: 1,
                borderColor: C.buttonLightGreenOutline,
                borderRadius: 8,
                padding: 10,
                marginBottom: 8,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "700", color: C.text }}>
                  {logEntry.date || "—"}
                </Text>
                <Text
                  style={{
                    fontSize: 11,
                    color: gray(0.5),
                  }}
                >
                  {logEntry.millis
                    ? formatMillisForDisplay(logEntry.millis)
                    : ""}
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "600",
                  color: logEntry.type === "rehydration" ? C.orange : C.green,
                  marginBottom: 4,
                }}
              >
                {logEntry.type === "rehydration"
                  ? "REHYDRATION"
                  : "NIGHTLY ARCHIVE"}
              </Text>

              {logEntry.archive &&
                Object.entries(logEntry.archive).map(([name, r]) => (
                  <Text
                    key={name}
                    style={{ fontSize: 11, color: C.text, marginBottom: 1 }}
                  >
                    {name}:{" "}
                    {r.success
                      ? r.docCount + " docs"
                      : "FAILED — " + (r.error || "unknown")}
                  </Text>
                ))}

              {logEntry.mediaCleanup && (
                <Text
                  style={{
                    fontSize: 11,
                    color: logEntry.mediaCleanup.success ? C.text : C.red,
                    marginTop: 2,
                  }}
                >
                  Media cleanup:{" "}
                  {logEntry.mediaCleanup.success
                    ? logEntry.mediaCleanup.workordersProcessed +
                      " workorders, " +
                      logEntry.mediaCleanup.mediaFilesDeleted +
                      " files deleted"
                    : "FAILED — " + (logEntry.mediaCleanup.error || "unknown")}
                </Text>
              )}

              {logEntry.collections &&
                Object.entries(logEntry.collections).map(([name, r]) => (
                  <Text
                    key={name}
                    style={{ fontSize: 11, color: C.text, marginBottom: 1 }}
                  >
                    {name}:{" "}
                    {r.success
                      ? r.docCount + " docs restored"
                      : "FAILED — " + (r.error || "unknown")}
                  </Text>
                ))}
            </View>
          ))}

        {sLogs.length > 0 && (
          <Button_
            text={"Load Another Week (Week " + (sWeeksLoaded + 1) + ")"}
            onPress={handleLoadMore}
            colorGradientArr={COLOR_GRADIENTS.blue}
            buttonStyle={{
              borderRadius: 5,
              paddingHorizontal: 20,
              marginTop: 5,
            }}
            loading={sLoading}
            disabled={sLoading}
          />
        )}
      </BoxContainerInnerComponent>
    </BoxContainerOuterComponent>
  );
}

////////////////////////////////////////////////////////////////////////////////
// Spoof data
////////////////////////////////////////////////////////////////////////////////

const SPOOF_WORKORDER = {
  id: "028788618626",
  partSource: "Amazon",
  customerNotes: [
    {
      name: "(Fritz H)  ",
      userID: "1234",
      value: "Here are some customer notes\n\nAnother line of customer notes",
      id: "50799ROzyfyPUnCqI7yo",
      createdAt: 1774375558248,
    },
  ],
  paymentComplete: false,
  startedBy: "Fritz Hieb",
  internalNotes: [
    {
      id: "YUOO8yY18SOeVDByopiz",
      createdAt: 1774360100201,
      value: "Here are the intake notes blah blah\n\nAnother line of intake notes",
      name: "(Fritz H)  ",
      userID: "1234",
    },
  ],
  description: "Hybrid",
  amountPaid: 0,
  customerLandline: "",
  taxFree: false,
  waitTime: { label: "1-2 Days", id: "34j3kj3", maxWaitTimeDays: 2, removable: true },
  model: "",
  color2: { textColor: "white", label: "Red", backgroundColor: "red" },
  changeLog: [],
  media: [],
  workorderLines: [
    {
      receiptNotes: "",
      warranty: false,
      useSalePrice: false,
      inventoryItem: {
        manufacturerSku: "",
        formalName: "HELMET AERIUS RAVEN L/XL M-BK",
        cost: 1995,
        brand: "",
        category: "Part",
        minutes: 0,
        salePrice: 0,
        upc: "",
        id: "05YYGGwRFFZ3cnnszUvz",
        customSku: "",
        informalName: "",
        ean: "",
        price: 0,
      },
      qty: 1,
      intakeNotes: "",
      discountObj: "",
      id: "002462623550",
    },
    {
      inventoryItem: {
        price: 6000,
        ean: "",
        informalName: "",
        customSku: "",
        id: "086Gn523CkHuuPsPIL7r",
        upc: "014658020235",
        salePrice: 0,
        cost: 3249,
        brand: "",
        minutes: 0,
        category: "Part",
        formalName: "CAR RACK HOLYWD CROSSBAR ADAPTER BOOMERPRO",
        manufacturerSku: "BA-PRO",
      },
      intakeNotes: "",
      qty: 2,
      id: "002473171737",
      discountObj: "",
      receiptNotes: "",
      warranty: false,
      useSalePrice: false,
    },
    {
      intakeNotes: "Put this shit on bro",
      qty: 1,
      discountObj: {
        newPrice: 2400,
        name: "20% Off Item",
        value: "20",
        id: "394393",
        savings: 600,
        type: "%",
      },
      id: "002482225496",
      inventoryItem: {
        customSku: "",
        informalName: "",
        ean: "850051028009",
        price: 3000,
        formalName: "BOTTLE CAGE BIKASE ABC SIDEWINDER ADJUSTABLE DRINK HOLDER BK",
        manufacturerSku: "1024",
        salePrice: 0,
        cost: 1849,
        brand: "",
        category: "Part",
        minutes: 0,
        upc: "850051028009",
        id: "0AS4fNqu2f9I7Po11bgC",
      },
      receiptNotes: "Here are the receipt notes for customer",
      warranty: false,
      useSalePrice: false,
    },
    {
      warranty: false,
      useSalePrice: false,
      receiptNotes: "",
      discountObj: {
        name: "50% Off Item",
        value: "50",
        newPrice: 1200,
        savings: 1200,
        id: "1333k",
        type: "%",
      },
      id: "002494882721",
      intakeNotes: "",
      qty: 3,
      inventoryItem: {
        price: 800,
        ean: "",
        informalName: "Valve Core Remover - Park kT",
        customSku: "",
        upc: "763477008572",
        id: "0AwfMK11HyiJJ9FPIbAv",
        salePrice: 0,
        cost: 499,
        brand: "",
        minutes: 0,
        category: "Part",
        formalName: "TOOL VALVE CORE REMOVER PARK VC-1",
        manufacturerSku: "VC-1",
      },
    },
  ],
  status: "383rne3kj",
  sales: [],
  activeSaleID: "",
  customerCell: "2393369177",
  customerContactRestriction: "",
  customerEmail: "hieb.fritz@gmail.com",
  waitTimeEstimateLabel: "First half Tuesday",
  isStandaloneSale: false,
  brand: "Sun",
  workorderNumber: "82860",
  customerLast: "Hieb",
  color1: { backgroundColor: "blue", label: "Blue", textColor: "white" },
  customerID: "011460657456",
  customerFirst: "Fritz",
  startedOnMillis: 1774312878862,
};

////////////////////////////////////////////////////////////////////////////////
// Stand Buttons Editor Component
////////////////////////////////////////////////////////////////////////////////

const StandButtonsEditorComponent = ({
  zSettingsObj,
  handleSettingsFieldChange,
  _setStandEditButtonObj,
}) => {
  const [sDragSource, _setDragSource] = useState(null);
  const [sDragTarget, _setDragTarget] = useState(null);

  let rows = zSettingsObj?.intakeQuickButtons || [];
  // Handle legacy flat format
  if (rows.length > 0 && !Array.isArray(rows[0])) {
    rows = [];
  }

  function saveRows(updatedRows) {
    // Filter out empty rows
    let cleaned = updatedRows.filter((row) => row.length > 0);
    handleSettingsFieldChange("intakeQuickButtons", cleaned);
  }

  function handleAddRow() {
    saveRows([...rows, []]);
  }

  function handleDeleteButton(rowIdx, btnIdx) {
    let updated = rows.map((row) => [...row]);
    updated[rowIdx].splice(btnIdx, 1);
    saveRows(updated);
  }

  function handleLabelChange(rowIdx, btnIdx, val) {
    let updated = rows.map((row) => [...row]);
    updated[rowIdx][btnIdx] = { ...updated[rowIdx][btnIdx], label: val };
    handleSettingsFieldChange("intakeQuickButtons", updated);
  }

  function handleReorder(fromRow, fromBtn, toRow, toBtn) {
    if (
      fromRow === null ||
      fromBtn === null ||
      toRow === null ||
      toBtn === null
    )
      return;
    if (fromRow === toRow && fromBtn === toBtn) return;
    let updated = rows.map((row) => [...row]);
    let [dragged] = updated[fromRow].splice(fromBtn, 1);
    // If source row became empty and target row is after it, adjust index
    if (updated[fromRow].length === 0 && toRow > fromRow) {
      updated.splice(fromRow, 1);
      updated[toRow - 1].splice(toBtn, 0, dragged);
    } else {
      updated[toRow].splice(toBtn, 0, dragged);
      // Clean up empty rows
      updated = updated.filter((row) => row.length > 0);
    }
    handleSettingsFieldChange("intakeQuickButtons", updated);
  }

  return (
    <BoxContainerOuterComponent>
      <BoxContainerInnerComponent
        style={{ width: "100%", alignItems: "center", borderWidth: 0 }}
      >
        <View style={{ width: "100%", alignItems: "center" }}>
          <Text
            style={{
              fontSize: 12,
              color: gray(0.45),
              marginBottom: 12,
              textAlign: "center",
            }}
          >
            This is a preview of the tablet stand layout. Drag buttons to
            reorder. Press + on a row to add a button.
          </Text>

          {/* Tablet mock frame */}
          <div
            style={{
              width: 400,
              minHeight: 650,
              borderWidth: 3,
              borderStyle: "solid",
              borderColor: gray(0.3),
              borderRadius: 20,
              backgroundColor: C.backgroundWhite,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              padding: 12,
              boxSizing: "border-box",
            }}
          >
            {/* Header placeholder */}
            <div
              style={{
                height: 36,
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: gray(0.15),
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                paddingLeft: 10,
                marginBottom: 8,
              }}
            >
              <Text style={{ fontSize: 12, color: gray(0.35) }}>
                Select Workorder...
              </Text>
            </div>

            {/* Items placeholder */}
            <div
              style={{
                flex: 1,
                borderWidth: 1,
                borderStyle: "dashed",
                borderColor: gray(0.15),
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 8,
                minHeight: 120,
              }}
            >
              <Text style={{ fontSize: 11, color: gray(0.3) }}>
                Line Items Area
              </Text>
            </div>

            {/* Quick Buttons area */}
            <div
              style={{
                borderTopWidth: 1,
                borderTopStyle: "solid",
                borderTopColor: gray(0.15),
                paddingTop: 8,
              }}
            >
              {rows.map((row, rowIdx) => (
                <div
                  key={rowIdx}
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 6,
                  }}
                >
                  {row.map((btn, btnIdx) => (
                    <StandButtonCard
                      key={btn.id}
                      btn={btn}
                      rowIdx={rowIdx}
                      btnIdx={btnIdx}
                      sDragSource={sDragSource}
                      sDragTarget={sDragTarget}
                      _setDragSource={_setDragSource}
                      _setDragTarget={_setDragTarget}
                      handleReorder={handleReorder}
                      handleLabelChange={handleLabelChange}
                      handleDeleteButton={handleDeleteButton}
                      handleEditPress={() => _setStandEditButtonObj(btn)}
                    />
                  ))}
                  {/* Add button to this row */}
                  <TouchableOpacity
                    onPress={() => {
                      let newBtn = {
                        ...cloneDeep(INTAKE_QUICK_BUTTON_PROTO),
                        id: generateRandomID(),
                      };
                      let updated = rows.map((r) => [...r]);
                      updated[rowIdx].push(newBtn);
                      handleSettingsFieldChange("intakeQuickButtons", updated);
                      _setStandEditButtonObj(newBtn);
                    }}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      backgroundColor: C.green,
                      alignItems: "center",
                      justifyContent: "center",
                      marginLeft: 4,
                      flexShrink: 0,
                    }}
                  >
                    <Text
                      style={{
                        color: "white",
                        fontSize: 18,
                        fontWeight: "700",
                        marginTop: -2,
                      }}
                    >
                      +
                    </Text>
                  </TouchableOpacity>
                </div>
              ))}

              {rows.length === 0 && (
                <Text
                  style={{
                    fontSize: 12,
                    color: gray(0.35),
                    textAlign: "center",
                    paddingVertical: 16,
                  }}
                >
                  No rows yet. Press "Add Row" below.
                </Text>
              )}
            </div>

            {/* Add Row button */}
            <TouchableOpacity
              onPress={handleAddRow}
              style={{
                marginTop: 6,
                paddingVertical: 8,
                borderWidth: 1,
                borderColor: C.buttonLightGreenOutline,
                borderRadius: 6,
                alignItems: "center",
                backgroundColor: C.listItemWhite,
              }}
            >
              <Text style={{ fontSize: 12, color: C.green, fontWeight: "600" }}>
                + Add Row
              </Text>
            </TouchableOpacity>
          </div>
        </View>
      </BoxContainerInnerComponent>
    </BoxContainerOuterComponent>
  );
};

////////////////////////////////////////////////////////////////////////////////
// Stand Button Card (draggable)
////////////////////////////////////////////////////////////////////////////////

const StandButtonCard = ({
  btn,
  rowIdx,
  btnIdx,
  sDragSource,
  sDragTarget,
  _setDragSource,
  _setDragTarget,
  handleReorder,
  handleLabelChange,
  handleDeleteButton,
  handleEditPress,
}) => {
  const [sIsEditingLabel, _setIsEditingLabel] = useState(false);

  let isOver =
    sDragTarget &&
    sDragTarget.rowIdx === rowIdx &&
    sDragTarget.btnIdx === btnIdx;
  let isDragging =
    sDragSource &&
    sDragSource.rowIdx === rowIdx &&
    sDragSource.btnIdx === btnIdx;

  return (
    <div
      draggable
      onDragStart={() => _setDragSource({ rowIdx, btnIdx })}
      onDragOver={(e) => {
        e.preventDefault();
        _setDragTarget({ rowIdx, btnIdx });
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (sDragSource) {
          handleReorder(
            sDragSource.rowIdx,
            sDragSource.btnIdx,
            rowIdx,
            btnIdx
          );
        }
        _setDragSource(null);
        _setDragTarget(null);
      }}
      onDragEnd={() => {
        _setDragSource(null);
        _setDragTarget(null);
      }}
      style={{
        flex: 1,
        minHeight: 44,
        margin: 3,
        padding: 6,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: isOver ? 2 : 1,
        borderStyle: "solid",
        borderColor: isOver ? C.blue : C.buttonLightGreenOutline,
        borderRadius: 8,
        backgroundColor: C.listItemWhite,
        position: "relative",
        cursor: "grab",
        opacity: isDragging ? 0.5 : 1,
        boxSizing: "border-box",
      }}
    >
      {/* Delete button (top-right) */}
      <TouchableOpacity
        onPress={() => handleDeleteButton(rowIdx, btnIdx)}
        style={{
          position: "absolute",
          top: 2,
          right: 2,
          width: 16,
          height: 16,
          borderRadius: 8,
          backgroundColor: gray(0.12),
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontSize: 10, color: C.lightred, fontWeight: "700" }}>
          ×
        </Text>
      </TouchableOpacity>

      {/* Edit button (top-left) */}
      <TouchableOpacity
        onPress={handleEditPress}
        style={{
          position: "absolute",
          top: 2,
          left: 2,
          width: 16,
          height: 16,
          borderRadius: 8,
          backgroundColor: gray(0.12),
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Image_ icon={ICONS.editPencil} size={9} />
      </TouchableOpacity>

      {/* Label */}
      {sIsEditingLabel ? (
        <TextInput_
          style={{
            fontSize: 11,
            color: C.text,
            textAlign: "center",
            borderBottomWidth: 1,
            borderBottomColor: gray(0.3),
            paddingVertical: 2,
            width: "100%",
            outlineWidth: 0,
            outlineStyle: "none",
          }}
          value={btn.label || ""}
          onChangeText={(val) => handleLabelChange(rowIdx, btnIdx, val)}
          onBlur={() => _setIsEditingLabel(false)}
          autoFocus
          placeholder="Label..."
          placeholderTextColor={gray(0.3)}
        />
      ) : (
        <TouchableOpacity onPress={() => _setIsEditingLabel(true)}>
          <Text
            style={{
              fontSize: 11,
              color: btn.label ? C.text : gray(0.35),
              textAlign: "center",
              fontWeight: "500",
            }}
            numberOfLines={2}
          >
            {btn.label || "(tap to name)"}
          </Text>
        </TouchableOpacity>
      )}
    </div>
  );
};

////////////////////////////////////////////////////////////////////////////////
// Stand Button Inventory Modal
////////////////////////////////////////////////////////////////////////////////

const StandButtonInventoryModal = ({ buttonObj, onClose, onSave }) => {
  const zInventory = useInventoryStore((state) => state.inventoryArr);
  const [sSearchString, _setSearchString] = useState("");
  const [sSearchResults, _setSearchResults] = useState([]);
  const [sSelectedItemID, _setSelectedItemID] = useState(
    buttonObj.inventoryItemID || ""
  );
  const [sLabel, _setLabel] = useState(buttonObj.label || "");

  function handleSearch(val) {
    _setSearchString(val);
    if (!val || val.length < 3) {
      _setSearchResults([]);
      return;
    }
    _setSearchResults(searchInventory(val, zInventory));
  }

  function handleSelectItem(invItem) {
    _setSelectedItemID(invItem.id);
    _setLabel(invItem.informalName || invItem.formalName || "");
    _setSearchString("");
    _setSearchResults([]);
  }

  function resolveItem(itemId) {
    return zInventory.find((o) => o.id === itemId);
  }

  let resolvedItem = sSelectedItemID ? resolveItem(sSelectedItemID) : null;

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
        justifyContent: "center",
        alignItems: "center",
        zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 500,
          height: "70vh",
          backgroundColor: "white",
          borderRadius: 12,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            padding: 16,
            borderBottomWidth: 1,
            borderBottomColor: gray(0.15),
          }}
        >
          <Text
            style={{
              fontSize: 16,
              fontWeight: Fonts.weight.textHeavy,
              color: C.text,
            }}
          >
            Stand Button — Select Item
          </Text>
          <TouchableOpacity onPress={onClose}>
            <Image_ icon={ICONS.close1} size={18} />
          </TouchableOpacity>
        </View>

        {/* Label input */}
        <View style={{ padding: 16, paddingBottom: 8 }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: Fonts.weight.textHeavy,
              color: C.blue,
              marginBottom: 4,
            }}
          >
            BUTTON LABEL
          </Text>
          <TextInput_
            style={{
              borderBottomColor: gray(0.3),
              borderBottomWidth: 1,
              width: "100%",
              fontSize: 14,
              color: C.text,
              paddingVertical: 6,
              outlineWidth: 0,
              outlineStyle: "none",
            }}
            value={sLabel}
            onChangeText={_setLabel}
            placeholder="Button label..."
            placeholderTextColor={gray(0.3)}
          />
        </View>

        {/* Currently selected item */}
        {resolvedItem && (
          <View
            style={{
              marginHorizontal: 16,
              marginBottom: 8,
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 8,
              paddingHorizontal: 10,
              backgroundColor: "rgb(230, 240, 252)",
              borderRadius: 4,
              borderLeftWidth: 3,
              borderLeftColor: C.blue,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, color: C.text }}>
                {resolvedItem.informalName ||
                  resolvedItem.formalName ||
                  "Unknown"}
              </Text>
              <Text style={{ fontSize: 11, color: C.lightText }}>
                ${formatCurrencyDisp(resolvedItem.price || 0)}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                _setSelectedItemID("");
                _setLabel("");
              }}
              style={{
                paddingHorizontal: 8,
                paddingVertical: 4,
                backgroundColor: gray(0.08),
                borderRadius: 4,
              }}
            >
              <Text style={{ fontSize: 10, color: C.lightred }}>Remove</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Search input */}
        <View style={{ padding: 16, paddingTop: 8, paddingBottom: 8 }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: Fonts.weight.textHeavy,
              color: C.blue,
              marginBottom: 4,
            }}
          >
            SEARCH INVENTORY
          </Text>
          <TextInput_
            style={{
              borderBottomColor: gray(0.3),
              borderBottomWidth: 1,
              width: "100%",
              fontSize: 14,
              color: C.text,
              paddingVertical: 6,
              outlineWidth: 0,
              outlineStyle: "none",
            }}
            value={sSearchString}
            onChangeText={handleSearch}
            placeholder="Search inventory (min 3 chars)..."
            placeholderTextColor={gray(0.3)}
            autoFocus
          />
        </View>

        {/* Search results */}
        <ScrollView
          style={{
            flex: 1,
            marginHorizontal: 16,
            marginBottom: 8,
            borderWidth: sSearchResults.length > 0 ? 1 : 0,
            borderColor: gray(0.1),
            borderRadius: 4,
            backgroundColor: "white",
          }}
        >
          {sSearchResults.map((item, idx) => (
            <TouchableOpacity
              key={item.id || idx}
              onPress={() => handleSelectItem(item)}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                padding: 8,
                borderBottomWidth: 1,
                borderBottomColor: gray(0.08),
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, color: C.text }}>
                  {item.informalName || item.formalName || "Unknown"}
                </Text>
                {!!item.brand && (
                  <Text style={{ fontSize: 11, color: gray(0.5) }}>
                    {item.brand}
                  </Text>
                )}
              </View>
              <Text style={{ fontSize: 13, color: C.text }}>
                ${formatCurrencyDisp(item.price || 0)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Footer with Save/Cancel */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "flex-end",
            padding: 16,
            borderTopWidth: 1,
            borderTopColor: gray(0.15),
          }}
        >
          <Button_
            text="Cancel"
            onPress={onClose}
            buttonStyle={{
              paddingHorizontal: 16,
              paddingVertical: 8,
              marginRight: 10,
              backgroundColor: gray(0.15),
            }}
            textStyle={{ color: C.text }}
          />
          <Button_
            text="Save"
            colorGradientArr={COLOR_GRADIENTS.green}
            onPress={() =>
              onSave({
                ...buttonObj,
                label: sLabel,
                inventoryItemID: sSelectedItemID,
              })
            }
            buttonStyle={{ paddingHorizontal: 16, paddingVertical: 8 }}
          />
        </View>
      </div>
    </div>,
    document.body
  );
};
