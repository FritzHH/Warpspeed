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
  // searchInventory moved to Web Worker
  generateTimesForListDisplay,
  generateEAN13Barcode,
  normalizeBarcode,
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
  createNewWorkorder,
  formatWorkorderNumber,
  intakeButtonsToRows,
  intakeRowsToFlat,
} from "../../../../utils";
import { workerSearchInventory } from "../../../../inventorySearchManager";
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
  useCurrentCustomerStore,
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
import React, { Children, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FaceEnrollModalScreen } from "../../modal_screens/FaceEnrollModalScreen";
import { C, COLOR_GRADIENTS, Fonts, ICONS } from "../../../../styles";
import { DISCOUNT_TYPES, PERMISSION_LEVELS, build_db_path } from "../../../../constants";
import { APP_USER, INTAKE_QUICK_BUTTON_PROTO, NOTE_HELPER_PROTO, QUICK_CUSTOMER_NOTE_PROTO, QUICK_CUSTOMER_NOTE_ITEM_PROTO, WORKORDER_ITEM_PROTO, SETTINGS_OBJ, STATUS_AUTO_TEXT_PROTO, TIME_PUNCH_PROTO, TAB_NAMES as APP_TAB_NAMES, QB_DEFAULT_W, QB_DEFAULT_H, QB_SNAP_PCT } from "../../../../data";
import { UserClockHistoryModal } from "../../modal_screens/UserClockHistoryModalScreen";
import { useCallback } from "react";
import { ColorWheel } from "../../../../ColorWheel";
import { SalesReportsModal } from "../../modal_screens/SalesReports";
import { PayrollModal } from "../../modal_screens/PayrollModal";
import { ScheduleModal } from "../../modal_screens/ScheduleModal";
import { dbSaveSettingsField, dbSaveSettings, dbListenToDevLogs, dbSaveOpenWorkorder, dbSaveCompletedWorkorder, dbSaveCompletedSale, dbSaveActiveSale, dbSaveCustomer, dbRehydrateFromArchive, dbManualArchiveAndCleanup, dbSavePunchObject, dbSavePrintObj, dbBatchWrite, dbClearCollection, dbSaveInventoryItem } from "../../../../db_calls_wrapper";
import { mapCustomers, mapWorkorders, mapSales, mapStatuses, mapEmployees, mapPunchHistory, parseCSV } from "../../../../lightspeed_import";
import { lightspeedInitiateAuthCallable, lightspeedImportDataCallable, firestoreRead, firestoreQuery, firestoreDelete, firestoreWrite, firestoreBatchWrite } from "../../../../db_calls";
import { DB_NODES } from "../../../../constants";
import { newCheckoutGetStripeReaders } from "../../modal_screens/newCheckoutModalScreen/newCheckoutFirebaseCalls";
import { StandButtonsCanvasEditor } from "./StandButtonsCanvas";
import { LabelDesignerModalV2 as LabelDesignerModal } from "../../modal_screens/LabelDesignerModalV2";
import { labelPrintBuilder } from "../../../../shared/labelPrintBuilder";


const TAB_NAMES = {
  users: "User Control",
  payments: "Readers/Printers",
  statuses: "Statuses",
  lists: "Lists & Options",
  waitTimes: "Wait Times",
  storeInfo: "Store Info",
  quickItems: "Quick Buttons",
  sales: "Sales History",
  payroll: "Payroll",
  schedule: "Schedule",
  ordering: "Ordering",
  textTemplates: "Text Templates",
  emailTemplates: "Email Templates",
  blockedNumbers: "Blocked Numbers",
  import: "Import",
  backup: "Backup & Recovery",
  labelDesigner: "Label Designer",
};

const DROPDOWN_ORDERING_SELECTION_NAMES = {
  importOrder: "Import Order",
  viewPreviousOrders: "View Previous Orders",
};

export function Dashboard_Admin({}) {
  // store getters ///////////////////////////////////////////////////////////
  const zSettingsObj = useSettingsStore((state) => state.settings);
  const zLiveReaders = useStripePaymentStore((state) => state.readersArr) || [];
  const zCurrentUserLevel = useLoginStore((state) => state.currentUser?.permissions?.level || 0);
  const sMenuLocked = zCurrentUserLevel < 4;
  // local state ///////////////////////////////////////////////////////////
  const [sFacialRecognitionModalUserObj, _setFacialRecognitionModalUserObj] =
    useState(false);
  const [sPunchClockUserObj, _setPunchClockUserObj] = useState(null);
  const [sShowSalesReportModal, _setShowSalesReportModal] = useState(false);
  const [sShowPayrollModal, _setShowPayrollModal] = useState(false);
  const [sShowScheduleModal, _setShowScheduleModal] = useState(false);
  const sExpand = useTabNamesStore((state) => state.getDashboardExpand());
  const _setExpand = useTabNamesStore((state) => state.setDashboardExpand);
  const [sOrderingMenuSelectionName, _setOrderingMenuSelectionName] = useState(
    DROPDOWN_ORDERING_SELECTION_NAMES.importOrder
  );
  const [sStandEditButtonObj, _setStandEditButtonObj] = useState(null);
  const [sShowStandButtonsModal, _setShowStandButtonsModal] = useState(false);
  const [sShowLabelDesigner, _setShowLabelDesigner] = useState(false);

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
  return (
    <View
      style={{
        paddingTop: 20,
        flex: 1,
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
      {!!sShowScheduleModal && (
        <ScheduleModal handleExit={() => _setShowScheduleModal(false)} />
      )}
      {!!sShowLabelDesigner && (
        <LabelDesignerModal
          handleExit={() => _setShowLabelDesigner(false)}
          handleSettingsFieldChange={handleSettingsFieldChange}
        />
      )}
      {!!sStandEditButtonObj && (
        <StandButtonInventoryModal
          buttonObj={sStandEditButtonObj}
          onClose={() => _setStandEditButtonObj(null)}
          onSave={(updatedBtn) => {
            let flat = zSettingsObj?.intakeQuickButtons || [];
            let updated = flat.map((btn) => (btn.id === updatedBtn.id ? { ...updatedBtn, row: btn.row } : btn));
            handleSettingsFieldChange("intakeQuickButtons", updated);
            _setStandEditButtonObj(null);
          }}
        />
      )}
      {sShowStandButtonsModal &&
        createPortal(
          <div
            onClick={() => _setShowStandButtonsModal(false)}
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
              zIndex: 9998,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "85vw",
                maxWidth: 1200,
                height: "92vh",
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
                  Stand Buttons Editor
                </Text>
                <TouchableOpacity onPress={() => _setShowStandButtonsModal(false)}>
                  <Image_ icon={ICONS.close1} size={18} />
                </TouchableOpacity>
              </View>
              {/* Body: search panel + simulator side by side */}
              <div style={{ flex: 1, display: "flex", flexDirection: "row", overflow: "hidden" }}>
                {/* Left: Inventory Search Panel */}
                <StandButtonsSearchPanel
                  zSettingsObj={zSettingsObj}
                  handleSettingsFieldChange={handleSettingsFieldChange}
                />
                {/* Right: Editor */}
                <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
                  <StandButtonsCanvasEditor
                    zSettingsObj={zSettingsObj}
                    handleSettingsFieldChange={handleSettingsFieldChange}
                    _setStandEditButtonObj={_setStandEditButtonObj}
                    _setShowStandButtonsModal={_setShowStandButtonsModal}
                  />
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          paddingHorizontal: 5,
          flex: 1,
        }}
      >
        {/*********************left-side column container *****************/}
        <ScrollView style={{ width: "30%" }}>
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
            {/****************** label designer *****************************/}
            <MenuListLabelComponent
              handleExpandPress={() => _setShowLabelDesigner(true)}
              text={TAB_NAMES.labelDesigner}
              icon={ICONS.print}
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
              disabled={sMenuLocked}
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
              disabled={sMenuLocked}
            />
            <VerticalSpacer />
            {/****************** schedule modal ****************************/}
            <MenuListLabelComponent
              selected={sExpand === TAB_NAMES.schedule}
              handleExpandPress={() => _setShowScheduleModal(true)}
              style={{
                fontWeight: sExpand === TAB_NAMES.schedule ? 500 : null,
                color: sExpand === TAB_NAMES.schedule ? C.green : gray(0.6),
              }}
              text={TAB_NAMES.schedule}
              icon={ICONS.clock}
              iconSize={22}
              disabled={sMenuLocked}
            />
            <VerticalSpacer />
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
              disabled={sMenuLocked}
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
              disabled={sMenuLocked}
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
              disabled={sMenuLocked}
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
              disabled={sMenuLocked}
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
              disabled={sMenuLocked}
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
              disabled={sMenuLocked}
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
              disabled={sMenuLocked}
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
              disabled={sMenuLocked}
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
              disabled={sMenuLocked}
            />
          </View>
        </ScrollView>

        {/*********************right-side column container****************** */}

        {!sExpand && (
          <View style={{ width: "70%", height: "100%", justifyContent: "center", alignItems: "center" }}>
            <Image_
              icon={require("../../../../resources/default_app_logo_large.png")}
              style={{ opacity: 0.08, width: "60%", height: "60%" }}
            />
          </View>
        )}
        {!!sExpand && <ScrollView
          style={{
            width: "70%",
          }}
          contentContainerStyle={{ alignItems: "center" }}
        >
          <Text
              style={{
                borderColor: C.buttonLightGreenOutline,
                color: gray(0.6),
                marginBottom: 10,
                fontSize: 17,
                fontWeight: 500,
              }}
            >
              {sExpand === TAB_NAMES.payments ? "CARD READERS / RECEIPT PRINTERS" : sExpand?.toUpperCase()}
            </Text>
          {sExpand === TAB_NAMES.payments && (
            <>
              <PrintersComponent
                zSettingsObj={zSettingsObj}
                handleSettingsFieldChange={handleSettingsFieldChange}
              />
              <PaymentProcessingComponent
                zSettingsObj={zSettingsObj}
                handleSettingsFieldChange={handleSettingsFieldChange}
                liveReaders={zLiveReaders}
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
            <QuickItemButtonsComponent />
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
        </ScrollView>}
      </View>
    </View>
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
  disabled,
}) {
  let ICON_SIZE = 18;
  const [sOpacity, _setOpacity] = useState(1);
  return (
    <TouchableOpacity
      onMouseEnter={() => !disabled && _setOpacity(0.6)}
      onMouseLeave={() => _setOpacity(1)}
      onPress={disabled ? undefined : handleExpandPress}
      activeOpacity={disabled ? 1 : 0.2}
      style={{
        flexDirection: "row",
        width: "100%",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 4,
        opacity: disabled ? 0.4 : sOpacity,
        backgroundColor: selected ? C.orange : "transparent",
        borderRadius: 5,
        paddingVertical: 4,
        paddingHorizontal: 6,
        cursor: disabled ? "default" : "pointer",
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
                  <Image_ source={ICONS.trash} style={{ width: 12, height: 12, opacity: 0.4 }} />
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
  const [sLoginTimeout, _setLoginTimeout] = useState(zSettingsObj?.activeLoginTimeoutSeconds || "");
  const [sLockHours, _setLockHours] = useState(zSettingsObj?.idleLoginTimeoutHours ? String(Math.round(zSettingsObj.idleLoginTimeoutHours)) : "");
  const [sPinLength, _setPinLength] = useState(zSettingsObj?.userPinStrength || "");
  const zPunchClock = useLoginStore((state) => state.punchClock);
  const zCurrentUserLevel = useLoginStore((state) => state.currentUser?.permissions?.level || 0);
  const canEditUsers = zCurrentUserLevel >= PERMISSION_LEVELS.superUser.level;

  const userListItemRefs = useRef([]);

  function handleNewUserPress() {
    let userObj = cloneDeep(APP_USER);
    userObj.id = crypto.randomUUID();
    let role = PERMISSION_LEVELS.user;
    userObj.permissions = role;
    commitUserInfoChange(userObj, true);
    _setEditUserIndex(0);
  }

  return (
    <BoxContainerOuterComponent style={{}}>
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
          <View title="Add user">
            <BoxButton1
              iconSize={35}
              icon={ICONS.add}
              onPress={handleNewUserPress}
              style={{}}
            />
          </View>
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
                      marginRight: 5,
                      width: "12%",
                    }}
                  >
                    {/* Row 1 - aligns with name row */}
                    <View style={{ height: 25, justifyContent: "center", alignItems: "center" }}>
                      <TouchableOpacity
                        onPress={() => {
                          if (!canEditUsers) return;
                          _setEditUserIndex(sEditUserIndex != null ? null : idx);
                          _setShowPinIndex(null);
                          _setShowWageIndex(null);
                        }}
                        style={{ opacity: canEditUsers ? 1 : 0.3 }}
                      >
                        <Image_ icon={editable ? ICONS.close1 : ICONS.editPencil} size={20} />
                      </TouchableOpacity>
                    </View>
                    {/* Row 2 - Clock In/Out button (aligns with phone/email row) */}
                    <View style={{ height: 25, justifyContent: "center", marginTop: 7 }}>
                      <Button_
                        text={zPunchClock[userObj.id] ? "Clock Out" : "Clock In"}
                        onPress={() => {
                          let isClockedIn = !!zPunchClock[userObj.id];
                          let option = isClockedIn ? "out" : "in";
                          let name = capitalizeFirstLetterOfString(userObj.first) + " " + capitalizeFirstLetterOfString(userObj.last);
                          useAlertScreenStore.getState().setValues({
                            title: "PUNCH CLOCK",
                            message: (option === "in" ? "Clock in " : "Clock out ") + name + "?",
                            btn1Text: option === "in" ? "CLOCK IN" : "CLOCK OUT",
                            btn2Text: "CANCEL",
                            handleBtn1Press: () => {
                              useLoginStore.getState().setCreateUserClock(userObj.id, new Date().getTime(), option);
                              if (option === "out") {
                                useLoginStore.getState().setCurrentUser(null);
                              }
                            },
                            handleBtn2Press: () => null,
                            showAlert: true,
                          });
                        }}
                        buttonStyle={{
                          borderWidth: 1,
                          borderColor: zPunchClock[userObj.id] ? C.lightred : C.buttonLightGreenOutline,
                          backgroundColor: zPunchClock[userObj.id] ? C.lightred : C.buttonLightGreen,
                          paddingVertical: 2,
                          paddingHorizontal: 4,
                          borderRadius: 5,
                          width: "100%",
                        }}
                        mouseOverOptions={{ opacity: 0.7 }}
                        textStyle={{ fontSize: 11, color: zPunchClock[userObj.id] ? C.textWhite : C.text, fontWeight: "600", numLines: 2, width: '100%', textAlign: "center" }}
                      />
                    </View>
                    {/* Row 3 - Enroll button (aligns with PIN/wage/role row) */}
                    <View style={{ height: 25, justifyContent: "center", marginTop: 7 }}>
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
                    {/* Row 4 - aligns with statuses row */}
                    <View style={{ marginTop: 7 }} />
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
                          borderWidth: 1,
                          fontSize: 14,
                          height: 25,
                          color: editable ? C.text : gray(0.5),
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
                          borderColor: editable
                            ? C.buttonLightGreenOutline
                            : "transparent",
                          outlineWidth: 0,
                          width: "49%",
                          borderWidth: 1,
                          fontSize: 14,
                          height: 25,
                          color: editable ? C.text : gray(0.5),
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
                          color: editable ? C.text : gray(0.5),
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
                          color: editable ? C.text : gray(0.5),
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
                            color: editable ? C.text : gray(0.5),
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
                            color: editable ? C.text : gray(0.5),
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
                            color: editable ? C.text : gray(0.5),
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
                              backgroundColor: editable ? status.backgroundColor : gray(0.85),
                              borderRadius: 4,
                              paddingHorizontal: 6,
                              paddingVertical: 2,
                            }}
                          >
                            <Text
                              style={{
                                color: editable ? status.textColor : gray(0.5),
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
        <NoteHelpersAdminComponent
          zSettingsObj={zSettingsObj}
          handleSettingsFieldChange={handleSettingsFieldChange}
        />
        <CustomerQuickNotesAdminComponent
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
                    icon={ICONS.trash}
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
                    icon={ICONS.trash}
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
                    icon={ICONS.trash}
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
                discount.id = crypto.randomUUID();
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
                      icon={ICONS.trash}
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
                waitTime.id = crypto.randomUUID();
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
                      icon={ICONS.trash}
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
                    icon={ICONS.trash}
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

const NoteHelpersAdminComponent = ({ zSettingsObj, handleSettingsFieldChange }) => {
  const [sCatDragIdx, _setCatDragIdx] = useState(null);
  const [sCatDragOverIdx, _setCatDragOverIdx] = useState(null);
  const [sItemDragCatId, _setItemDragCatId] = useState(null);
  const [sItemDragIdx, _setItemDragIdx] = useState(null);
  const [sItemDragOverIdx, _setItemDragOverIdx] = useState(null);
  const [sEditingItem, _setEditingItem] = useState(null); // { catId, itemIdx }

  const noteHelpers = zSettingsObj?.noteHelpers || [];
  const noteHelpersTarget = zSettingsObj?.noteHelpersTarget || "intakeNotes";

  function reorderCategories(fromIdx, toIdx) {
    if (fromIdx === null || toIdx === null || fromIdx === toIdx) return;
    let arr = [...noteHelpers];
    let [dragged] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, dragged);
    handleSettingsFieldChange("noteHelpers", arr);
  }

  function reorderItems(catId, fromIdx, toIdx) {
    if (fromIdx === null || toIdx === null || fromIdx === toIdx) return;
    let arr = noteHelpers.map((cat) => {
      if (cat.id !== catId) return cat;
      let items = [...(cat.items || [])];
      let [dragged] = items.splice(fromIdx, 1);
      items.splice(toIdx, 0, dragged);
      return { ...cat, items };
    });
    handleSettingsFieldChange("noteHelpers", arr);
  }

  return (
    <BoxContainerInnerComponent
      style={{ width: "100%", alignItems: "center", borderWidth: 0 }}
    >
      <View style={{ width: "100%", alignItems: "center" }}>
        {/* Header */}
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
          <Text style={{ color: C.text, marginRight: 20 }}>Workorder Item Note Helpers</Text>
          <Tooltip text="Add category">
            <BoxButton1
              onPress={() => {
                let newCat = { ...cloneDeep(NOTE_HELPER_PROTO), id: crypto.randomUUID(), label: "New Category" };
                handleSettingsFieldChange("noteHelpers", [...noteHelpers, newCat]);
              }}
            />
          </Tooltip>
        </View>

        {/* Target radio */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 10,
            gap: 20,
          }}
        >
          <Text style={{ fontSize: 13, color: gray(0.5) }}>Notes appear in:</Text>
          <TouchableOpacity
            onPress={() => handleSettingsFieldChange("noteHelpersTarget", "intakeNotes")}
            style={{ flexDirection: "row", alignItems: "center" }}
          >
            <View
              style={{
                width: 16,
                height: 16,
                borderRadius: 8,
                borderWidth: 2,
                borderColor: noteHelpersTarget === "intakeNotes" ? C.blue : gray(0.3),
                alignItems: "center",
                justifyContent: "center",
                marginRight: 5,
              }}
            >
              {noteHelpersTarget === "intakeNotes" && (
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.blue }} />
              )}
            </View>
            <Text style={{ fontSize: 13, color: C.text }}>Intake Notes</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleSettingsFieldChange("noteHelpersTarget", "receiptNotes")}
            style={{ flexDirection: "row", alignItems: "center" }}
          >
            <View
              style={{
                width: 16,
                height: 16,
                borderRadius: 8,
                borderWidth: 2,
                borderColor: noteHelpersTarget === "receiptNotes" ? C.blue : gray(0.3),
                alignItems: "center",
                justifyContent: "center",
                marginRight: 5,
              }}
            >
              {noteHelpersTarget === "receiptNotes" && (
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.blue }} />
              )}
            </View>
            <Text style={{ fontSize: 13, color: C.text }}>Receipt Notes</Text>
          </TouchableOpacity>
        </View>

        {/* Category list */}
        <View style={{ marginTop: 10, width: "95%" }}>
          {noteHelpers.map((cat, catIdx) => (
            <div
              key={cat.id}
              draggable
              onDragStart={(e) => {
                if (sItemDragIdx !== null) { e.preventDefault(); return; }
                _setCatDragIdx(catIdx);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (sItemDragIdx === null) _setCatDragOverIdx(catIdx);
              }}
              onDragEnd={() => { _setCatDragIdx(null); _setCatDragOverIdx(null); }}
              onDrop={(e) => {
                e.preventDefault();
                if (sItemDragIdx === null) {
                  reorderCategories(sCatDragIdx, catIdx);
                  _setCatDragIdx(null);
                  _setCatDragOverIdx(null);
                }
              }}
              style={{
                borderWidth: sCatDragOverIdx === catIdx && sItemDragIdx === null ? 2 : 1,
                borderStyle: "solid",
                borderColor: sCatDragOverIdx === catIdx && sItemDragIdx === null ? C.blue : C.buttonLightGreenOutline,
                borderRadius: 8,
                backgroundColor: C.listItemWhite,
                padding: 8,
                marginBottom: 6,
                cursor: "grab",
                opacity: sCatDragIdx === catIdx ? 0.5 : 1,
              }}
            >
              {/* Category header row */}
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                <TextInput_
                  value={cat.label}
                  onChangeText={(val) => {
                    let arr = noteHelpers.map((c) => c.id === cat.id ? { ...c, label: val } : c);
                    handleSettingsFieldChange("noteHelpers", arr);
                  }}
                  style={{
                    flex: 1,
                    borderColor: C.buttonLightGreenOutline,
                    borderWidth: 1,
                    borderRadius: 5,
                    padding: 5,
                    color: C.text,
                    fontWeight: "600",
                    outlineWidth: 0,
                  }}
                />
                <Tooltip text="Add item">
                  <BoxButton1
                    onPress={() => {
                      let arr = noteHelpers.map((c) => {
                        if (c.id !== cat.id) return c;
                        return { ...c, items: [...(c.items || []), "New Item"] };
                      });
                      handleSettingsFieldChange("noteHelpers", arr);
                    }}
                    style={{ marginLeft: 8, backgroundColor: "transparent" }}
                    iconSize={17}
                  />
                </Tooltip>
                <Tooltip text="Delete category">
                  <BoxButton1
                    onPress={() => {
                      let arr = noteHelpers.filter((c) => c.id !== cat.id);
                      handleSettingsFieldChange("noteHelpers", arr);
                    }}
                    style={{ marginLeft: 4, backgroundColor: "transparent" }}
                    iconSize={15}
                    icon={ICONS.trash}
                  />
                </Tooltip>
              </View>

              {/* Items within category */}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                {(cat.items || []).map((itemText, itemIdx) => {
                  const isEditing = sEditingItem?.catId === cat.id && sEditingItem?.itemIdx === itemIdx;
                  return (
                    <div
                      key={itemText + itemIdx}
                      draggable={!isEditing}
                      onDragStart={(e) => {
                        if (isEditing) { e.preventDefault(); return; }
                        e.stopPropagation();
                        _setItemDragCatId(cat.id);
                        _setItemDragIdx(itemIdx);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (sItemDragCatId === cat.id) _setItemDragOverIdx(itemIdx);
                      }}
                      onDragEnd={() => {
                        _setItemDragCatId(null);
                        _setItemDragIdx(null);
                        _setItemDragOverIdx(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (sItemDragCatId === cat.id) {
                          reorderItems(cat.id, sItemDragIdx, itemIdx);
                          _setItemDragCatId(null);
                          _setItemDragIdx(null);
                          _setItemDragOverIdx(null);
                        }
                      }}
                      style={{
                        display: "flex",
                        flexDirection: "row",
                        alignItems: "center",
                        borderWidth: sItemDragCatId === cat.id && sItemDragOverIdx === itemIdx ? 2 : 1,
                        borderStyle: "solid",
                        borderColor: isEditing ? C.blue : (sItemDragCatId === cat.id && sItemDragOverIdx === itemIdx ? C.blue : C.buttonLightGreenOutline),
                        borderRadius: 6,
                        backgroundColor: "white",
                        paddingHorizontal: 4,
                        paddingVertical: 2,
                        cursor: isEditing ? "text" : "grab",
                        opacity: sItemDragCatId === cat.id && sItemDragIdx === itemIdx ? 0.5 : 1,
                      }}
                    >
                      {isEditing ? (
                        <TextInput_
                          value={itemText}
                          autoFocus
                          onChangeText={(val) => {
                            let arr = noteHelpers.map((c) => {
                              if (c.id !== cat.id) return c;
                              let items = [...(c.items || [])];
                              items[itemIdx] = val;
                              return { ...c, items };
                            });
                            handleSettingsFieldChange("noteHelpers", arr);
                          }}
                          onBlur={() => _setEditingItem(null)}
                          onSubmitEditing={() => _setEditingItem(null)}
                          style={{
                            borderWidth: 0,
                            paddingVertical: 3,
                            paddingHorizontal: 4,
                            fontSize: 13,
                            color: C.text,
                            outlineWidth: 0,
                            width: Math.max(40, (itemText || "").length * 8 + 16),
                          }}
                        />
                      ) : (
                        <Text style={{ fontSize: 13, color: C.text, paddingVertical: 3, paddingHorizontal: 4 }}>
                          {itemText}
                        </Text>
                      )}
                      <Tooltip text="Edit item">
                        <TouchableOpacity
                          onPress={() => _setEditingItem(isEditing ? null : { catId: cat.id, itemIdx })}
                          style={{ padding: 2 }}
                        >
                          <Image_ icon={ICONS.editPencil} size={12} />
                        </TouchableOpacity>
                      </Tooltip>
                      <Tooltip text="Remove item">
                        <TouchableOpacity
                          onPress={() => {
                            let arr = noteHelpers.map((c) => {
                              if (c.id !== cat.id) return c;
                              let items = (c.items || []).filter((_, i) => i !== itemIdx);
                              return { ...c, items };
                            });
                            handleSettingsFieldChange("noteHelpers", arr);
                            if (isEditing) _setEditingItem(null);
                          }}
                          style={{ padding: 2 }}
                        >
                          <Image_ icon={ICONS.trash} size={12} />
                        </TouchableOpacity>
                      </Tooltip>
                    </div>
                  );
                })}
              </View>
            </div>
          ))}
        </View>
      </View>
    </BoxContainerInnerComponent>
  );
};

const CustomerQuickNoteEditorModal = ({ visible, category, isNew, onClose, onSave, onDelete }) => {
  const [sCategory, _setCategory] = useState(null);
  const [sEditingName, _setEditingName] = useState(false);
  const prevVisibleRef = useRef(false);

  if (visible && !prevVisibleRef.current) {
    _setCategory(cloneDeep(category));
    _setEditingName(isNew);
  }
  prevVisibleRef.current = visible;

  if (!visible || !sCategory) return null;

  let nameValid = (sCategory.label || "").trim().length >= 3;

  function updateItem(itemIdx, field, val) {
    let updated = cloneDeep(sCategory);
    updated.items[itemIdx] = { ...updated.items[itemIdx], [field]: val };
    _setCategory(updated);
  }

  function addItem() {
    let updated = cloneDeep(sCategory);
    updated.items = [...(updated.items || []), { ...cloneDeep(QUICK_CUSTOMER_NOTE_ITEM_PROTO), id: crypto.randomUUID(), buttonLabel: "", text: "" }];
    _setCategory(updated);
  }

  function removeItem(itemIdx) {
    let updated = cloneDeep(sCategory);
    updated.items = updated.items.filter((_, i) => i !== itemIdx);
    _setCategory(updated);
  }

  function handleSave() {
    if (!nameValid) return;
    onSave(sCategory);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={{ width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" }}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View style={{
              width: 500,
              height: "75%",
              backgroundColor: "white",
              borderRadius: 12,
              borderWidth: 2,
              borderColor: C.buttonLightGreenOutline,
              overflow: "hidden",
            }}>
              {/* Header */}
              <View style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: C.buttonLightGreenOutline,
                backgroundColor: C.buttonLightGreen,
              }}>
                {sEditingName ? (
                  <TextInput_
                    value={sCategory.label}
                    autoFocus
                    capitalize={true}
                    placeholder="Category name"
                    placeholderTextColor={gray(0.4)}
                    onChangeText={(val) => _setCategory({ ...sCategory, label: val })}
                    onBlur={() => { if (nameValid) _setEditingName(false); }}
                    onSubmitEditing={() => { if (nameValid) _setEditingName(false); }}
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: nameValid ? C.buttonLightGreenOutline : C.lightred,
                      borderRadius: 5,
                      padding: 5,
                      fontSize: 15,
                      color: C.text,
                      fontWeight: "600",
                      outlineWidth: 0,
                      backgroundColor: "white",
                    }}
                  />
                ) : (
                  <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: C.text }}>{sCategory.label}</Text>
                    <TouchableOpacity onPress={() => _setEditingName(true)} style={{ marginLeft: 8, padding: 2 }}>
                      <Image_ icon={ICONS.editPencil} size={14} />
                    </TouchableOpacity>
                  </View>
                )}
                {!isNew && (
                  <TouchableOpacity
                    onPress={() => { onDelete(sCategory.id); onClose(); }}
                    style={{ marginLeft: 10, padding: 4 }}
                  >
                    <Image_ icon={ICONS.trash} size={16} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Items list */}
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14 }}>
                {(sCategory.items || []).map((item, itemIdx) => (
                  <View
                    key={item.id || itemIdx}
                    style={{
                      borderWidth: 1,
                      borderColor: C.buttonLightGreenOutline,
                      borderRadius: 8,
                      backgroundColor: C.listItemWhite,
                      padding: 10,
                      marginBottom: 8,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                      <Text style={{ fontSize: 12, color: gray(0.4), width: 50 }}>Label</Text>
                      <TextInput_
                        value={item.buttonLabel}
                        capitalize={true}
                        placeholder="Button label"
                        placeholderTextColor={gray(0.35)}
                        onChangeText={(val) => updateItem(itemIdx, "buttonLabel", val)}
                        style={{
                          flex: 1,
                          borderWidth: 1,
                          borderColor: C.buttonLightGreenOutline,
                          borderRadius: 5,
                          paddingVertical: 5,
                          paddingHorizontal: 8,
                          fontSize: 13,
                          color: C.text,
                          outlineWidth: 0,
                          backgroundColor: "white",
                        }}
                      />
                      <TouchableOpacity
                        onPress={() => removeItem(itemIdx)}
                        style={{ marginLeft: 8, padding: 4 }}
                      >
                        <Image_ icon={ICONS.trash} size={14} />
                      </TouchableOpacity>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                      <Text style={{ fontSize: 12, color: gray(0.4), width: 50, marginTop: 6 }}>Text</Text>
                      <TextInput_
                        value={item.text}
                        multiline
                        capitalize={true}
                        placeholder="Note injected into customer notes (optional)"
                        placeholderTextColor={gray(0.35)}
                        onChangeText={(val) => updateItem(itemIdx, "text", val)}
                        style={{
                          flex: 1,
                          borderWidth: 1,
                          borderColor: C.buttonLightGreenOutline,
                          borderRadius: 5,
                          paddingVertical: 5,
                          paddingHorizontal: 8,
                          fontSize: 13,
                          color: C.text,
                          outlineWidth: 0,
                          backgroundColor: "white",
                          minHeight: 60,
                          overflow: "hidden",
                          resize: "none",
                        }}
                      />
                    </View>
                  </View>
                ))}

                <TouchableOpacity
                  onPress={addItem}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: C.buttonLightGreenOutline,
                    borderRadius: 8,
                    borderStyle: "dashed",
                    paddingVertical: 10,
                  }}
                >
                  <Text style={{ fontSize: 13, color: gray(0.4), fontWeight: "600" }}>+ Add Item</Text>
                </TouchableOpacity>
              </ScrollView>

              {/* Footer */}
              <View style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                alignItems: "center",
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderTopWidth: 1,
                borderTopColor: C.buttonLightGreenOutline,
              }}>
                {!nameValid && (
                  <Text style={{ fontSize: 12, color: C.lightred, marginRight: 10 }}>Category name must be 3+ characters</Text>
                )}
                <Button_
                  text="Cancel"
                  colorGradientArr={COLOR_GRADIENTS.grey}
                  onPress={onClose}
                  buttonStyle={{ paddingHorizontal: 20, paddingVertical: 7, marginRight: 8 }}
                  textStyle={{ fontSize: 13 }}
                />
                <Button_
                  text="Save"
                  colorGradientArr={nameValid ? COLOR_GRADIENTS.green : COLOR_GRADIENTS.grey}
                  onPress={handleSave}
                  enabled={nameValid}
                  buttonStyle={{ paddingHorizontal: 20, paddingVertical: 7 }}
                  textStyle={{ fontSize: 13 }}
                />
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const CustomerQuickNotesAdminComponent = ({ zSettingsObj, handleSettingsFieldChange }) => {
  const [sCatDragIdx, _setCatDragIdx] = useState(null);
  const [sCatDragOverIdx, _setCatDragOverIdx] = useState(null);
  const [sEditorModal, _setEditorModal] = useState(null); // { category, isNew }

  const quickNotes = zSettingsObj?.customerQuickNotes || [];

  function reorderCategories(fromIdx, toIdx) {
    if (fromIdx === null || toIdx === null || fromIdx === toIdx) return;
    let arr = [...quickNotes];
    let [dragged] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, dragged);
    handleSettingsFieldChange("customerQuickNotes", arr);
  }

  function handleAddCategory() {
    let newCat = { ...cloneDeep(QUICK_CUSTOMER_NOTE_PROTO), id: crypto.randomUUID(), label: "" };
    _setEditorModal({ category: newCat, isNew: true });
  }

  function handleEditCategory(cat) {
    _setEditorModal({ category: cloneDeep(cat), isNew: false });
  }

  function handleSaveCategory(updatedCat) {
    let exists = quickNotes.find((c) => c.id === updatedCat.id);
    let arr;
    if (exists) {
      arr = quickNotes.map((c) => c.id === updatedCat.id ? updatedCat : c);
    } else {
      arr = [...quickNotes, updatedCat];
    }
    handleSettingsFieldChange("customerQuickNotes", arr);
  }

  function handleDeleteCategory(catId) {
    let arr = quickNotes.filter((c) => c.id !== catId);
    handleSettingsFieldChange("customerQuickNotes", arr);
  }

  return (
    <BoxContainerInnerComponent
      style={{ width: "100%", alignItems: "center", borderWidth: 0 }}
    >
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
          <Text style={{ color: C.text, marginRight: 20 }}>Customer Quick Notes</Text>
          <Tooltip text="Add category">
            <BoxButton1 onPress={handleAddCategory} />
          </Tooltip>
        </View>

        <View style={{ marginTop: 10, width: "95%" }}>
          {quickNotes.map((cat, catIdx) => (
            <div
              key={cat.id}
              draggable
              onDragStart={(e) => { _setCatDragIdx(catIdx); }}
              onDragOver={(e) => { e.preventDefault(); _setCatDragOverIdx(catIdx); }}
              onDragEnd={() => { _setCatDragIdx(null); _setCatDragOverIdx(null); }}
              onDrop={(e) => {
                e.preventDefault();
                reorderCategories(sCatDragIdx, catIdx);
                _setCatDragIdx(null);
                _setCatDragOverIdx(null);
              }}
              style={{
                borderWidth: sCatDragOverIdx === catIdx ? 2 : 1,
                borderStyle: "solid",
                borderColor: sCatDragOverIdx === catIdx ? C.blue : C.buttonLightGreenOutline,
                borderRadius: 8,
                backgroundColor: C.listItemWhite,
                padding: 8,
                marginBottom: 6,
                cursor: "grab",
                opacity: sCatDragIdx === catIdx ? 0.5 : 1,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: C.text }}>{cat.label}</Text>
                <Text style={{ fontSize: 12, color: gray(0.4), marginRight: 8 }}>{(cat.items || []).length} items</Text>
                <Tooltip text="Edit category">
                  <TouchableOpacity onPress={() => handleEditCategory(cat)} style={{ padding: 4 }}>
                    <Image_ icon={ICONS.editPencil} size={15} />
                  </TouchableOpacity>
                </Tooltip>
                <Tooltip text="Delete category">
                  <TouchableOpacity
                    onPress={() => handleDeleteCategory(cat.id)}
                    style={{ padding: 4, marginLeft: 4 }}
                  >
                    <Image_ icon={ICONS.trash} size={15} />
                  </TouchableOpacity>
                </Tooltip>
              </View>
              {(cat.items || []).length > 0 && (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                  {(cat.items || []).map((item, itemIdx) => (
                    <View
                      key={item.id || itemIdx}
                      style={{
                        borderWidth: 1,
                        borderColor: C.buttonLightGreenOutline,
                        borderRadius: 6,
                        backgroundColor: "white",
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                      }}
                    >
                      <Text style={{ fontSize: 13, color: C.text }}>{item.buttonLabel}</Text>
                    </View>
                  ))}
                </View>
              )}
            </div>
          ))}
        </View>
      </View>

      <CustomerQuickNoteEditorModal
        visible={!!sEditorModal}
        category={sEditorModal?.category}
        isNew={sEditorModal?.isNew || false}
        onClose={() => _setEditorModal(null)}
        onSave={handleSaveCategory}
        onDelete={handleDeleteCategory}
      />
    </BoxContainerInnerComponent>
  );
};

// end compile into ListOptionsComponent /////////////////////////////////////////

const StoreInfoComponent = ({ zSettingsObj, handleSettingsFieldChange }) => {
  const [sPickerDay, _sSetPickerDay] = useState(null);
  const [sPickerType, _sSetPickerType] = useState(null);
  const [sLogoUploading, _sSetLogoUploading] = useState(false);
  const logoInputRef = useRef(null);

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    _sSetLogoUploading(true);
    try {
      const { storageUpload } = await import("../../../../db_calls");
      const settings = useSettingsStore.getState().getSettings();
      const url = await storageUpload(
        `${settings.tenantID}/${settings.storeID}/store-logo`,
        file,
        { contentType: file.type }
      );
      handleSettingsFieldChange("storeInfo", {
        ...zSettingsObj.storeInfo,
        storeLogo: url,
      });
    } catch (err) {
      log("Logo upload error:", err);
    }
    _sSetLogoUploading(false);
    e.target.value = "";
  };

  if (!zSettingsObj) return null;
  return (
    <BoxContainerOuterComponent style={{ marginBottom: 20 }}>
      <BoxContainerInnerComponent
        style={{ width: "100%", alignItems: "center", paddingVertical: 20 }}
      >
        {/***************** store logo upload **************************/}
        <View
          style={{
            width: "100%",
            alignItems: "center",
            marginBottom: 20,
            paddingBottom: 20,
            borderBottomWidth: 1,
            borderBottomColor: C.buttonLightGreenOutline,
          }}
        >
          <Text
            style={{
              fontWeight: Fonts.weight.textHeavy,
              color: C.text,
              marginBottom: 10,
            }}
          >
            Store Logo
          </Text>
          {zSettingsObj?.storeInfo?.storeLogo ? (
            <Image_
              icon={{ uri: zSettingsObj.storeInfo.storeLogo }}
              style={{
                width: 150,
                height: 150,
                marginBottom: 10,
                borderRadius: 10,
              }}
            />
          ) : (
            <View
              style={{
                width: 150,
                height: 150,
                borderWidth: 2,
                borderColor: C.buttonLightGreenOutline,
                borderRadius: 10,
                borderStyle: "dashed",
                justifyContent: "center",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <Text style={{ color: gray(0.6) }}>No logo</Text>
            </View>
          )}
          <View style={{ flexDirection: "row" }}>
            <Button_
              text={sLogoUploading ? "Uploading..." : "Upload Logo"}
              enabled={!sLogoUploading}
              colorGradientArr={COLOR_GRADIENTS.green}
              buttonStyle={{ paddingHorizontal: 15, paddingVertical: 8 }}
              onPress={() => logoInputRef.current?.click()}
            />
            {!!zSettingsObj?.storeInfo?.storeLogo && (
              <Button_
                text="Remove"
                icon={ICONS.trash}
                iconSize={14}
                colorGradientArr={COLOR_GRADIENTS.red}
                buttonStyle={{
                  marginLeft: 10,
                  paddingHorizontal: 15,
                  paddingVertical: 8,
                }}
                onPress={() =>
                  handleSettingsFieldChange("storeInfo", {
                    ...zSettingsObj.storeInfo,
                    storeLogo: "",
                  })
                }
              />
            )}
          </View>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleLogoUpload}
          />
        </View>
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
          }}
        >
          <Text
            style={{
              textAlign: "right",
              fontColor: C.text,
              width: "30%",
            }}
          >
            Support Email:
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
            value={zSettingsObj?.storeInfo.supportEmail || ""}
            onChangeText={(supportEmail) => {
              handleSettingsFieldChange("storeInfo", {
                ...zSettingsObj.storeInfo,
                supportEmail,
              });
            }}
          />
          <CheckBox_
            buttonStyle={{ marginLeft: 7 }}
            text={"Receipt"}
            textStyle={{ fontSize: 12 }}
            isChecked={zSettingsObj?.receiptSetup.includeFieldsInReceipt?.find(
              (o) => o === "supportEmail"
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
          }}
        >
          <Text
            style={{
              textAlign: "right",
              fontColor: C.text,
              width: "30%",
            }}
          >
            Office Email:
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
            value={zSettingsObj?.storeInfo.officeEmail || ""}
            onChangeText={(officeEmail) => {
              handleSettingsFieldChange("storeInfo", {
                ...zSettingsObj.storeInfo,
                officeEmail,
              });
            }}
          />
          <View style={{ marginLeft: 7, width: 70 }} />
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

function isPrinterOnline(printer) {
  return printer.active === true;
}

const PrintersComponent = ({ zSettingsObj, handleSettingsFieldChange }) => {
  const printersObj = zSettingsObj?.printers || {};
  const printersList = Object.values(printersObj);
  const receiptPrinters = printersList.filter((p) => p.type === "receipt");
  const labelPrinters = printersList.filter((p) => p.type === "label");
  const [sSelectedReceiptPrinter, _setSelectedReceiptPrinter] = useState(localStorageWrapper.getItem("selectedPrinterID") || "");
  const [sSelectedLabelPrinter, _setSelectedLabelPrinter] = useState(localStorageWrapper.getItem("selectedLabelPrinterID") || "");

  function handleSelectReceiptPrinter(printerID) {
    localStorageWrapper.setItem("selectedPrinterID", printerID);
    _setSelectedReceiptPrinter(printerID);
  }

  function handleSelectLabelPrinter(printerID) {
    localStorageWrapper.setItem("selectedLabelPrinterID", printerID);
    _setSelectedLabelPrinter(printerID);
  }

  return (
    <>
    <BoxContainerOuterComponent style={{ marginTop: 20 }}>
      <BoxContainerInnerComponent>
        <View style={{ width: "100%", marginBottom: 10 }}>
          <Text style={{ fontSize: 12, color: gray(0.6) }}>RECEIPT PRINTER</Text>
        </View>
        {receiptPrinters.length === 0 && (
          <Text style={{ fontSize: 13, color: gray(0.5) }}>No receipt printers configured</Text>
        )}
        {receiptPrinters.map((printer, idx) => (
          <View
            key={printer.id || idx}
            style={{
              borderRadius: 8,
              borderWidth: 1,
              borderColor: sSelectedReceiptPrinter === printer.id ? C.green : C.buttonLightGreenOutline,
              backgroundColor: C.backgroundListWhite,
              padding: 10,
              marginBottom: idx < receiptPrinters.length - 1 ? 8 : 0,
              width: "100%",
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              {!isPrinterOnline(printer) ? (
                <Text style={{ fontSize: 12, fontWeight: "700", color: C.red, backgroundColor: "yellow", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: "hidden" }}>Printer Offline</Text>
              ) : <View />}
              <TouchableOpacity
                onPress={() => {
                  useAlertScreenStore.getState().setValues({
                    title: "Remove Printer",
                    message: "This will delete the printer from the database for all users. It must be re-added through the WarpHub app.",
                    btn1Text: "Delete",
                    btn2Text: "Cancel",
                    handleBtn1Press: () => {
                      let updated = { ...printersObj };
                      delete updated[printer.id];
                      handleSettingsFieldChange("printers", updated);
                      if (sSelectedReceiptPrinter === printer.id) {
                        localStorageWrapper.removeItem("selectedPrinterID");
                        _setSelectedReceiptPrinter("");
                      }
                      useAlertScreenStore.getState().setShowAlert(false);
                    },
                    handleBtn2Press: () => useAlertScreenStore.getState().setShowAlert(false),
                    canExitOnOuterClick: true,
                  });
                }}
                style={{ padding: 4 }}
              >
                <Image_ icon={ICONS.trash} size={14} />
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: C.text }}>{printer.label || "Unlabeled"}</Text>
                <Text style={{ fontSize: 12, color: gray(0.5), marginTop: 2 }}>{printer.printerName || "—"}</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, justifyContent: "space-between" }}>
              <CheckBox_
                isChecked={sSelectedReceiptPrinter === printer.id}
                text="Use this printer"
                textStyle={{ fontSize: 13 }}
                buttonStyle={{ backgroundColor: "transparent" }}
                onCheck={() => handleSelectReceiptPrinter(printer.id)}
              />
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
                      handleSelectReceiptPrinter(printer.id);
                      useAlertScreenStore.getState().setShowAlert(false);
                    },
                    handleBtn2Press: () => useAlertScreenStore.getState().setShowAlert(false),
                    canExitOnOuterClick: true,
                  });
                }}
                colorGradientArr={COLOR_GRADIENTS.green}
                style={{ paddingHorizontal: 16, paddingVertical: 10 }}
                textStyle={{ fontSize: 14, fontWeight: "700" }}
                enabled={isPrinterOnline(printer)}
              />
            </View>
          </View>
        ))}
      </BoxContainerInnerComponent>
    </BoxContainerOuterComponent>
    <BoxContainerOuterComponent style={{ marginTop: 20 }}>
      <BoxContainerInnerComponent>
        <View style={{ width: "100%", marginBottom: 10 }}>
          <Text style={{ fontSize: 12, color: gray(0.6) }}>LABEL PRINTER</Text>
        </View>
        {labelPrinters.length === 0 && (
          <Text style={{ fontSize: 13, color: gray(0.5) }}>No label printers configured</Text>
        )}
        {labelPrinters.map((printer, idx) => (
          <View
            key={printer.id || idx}
            style={{
              borderRadius: 8,
              borderWidth: 1,
              borderColor: sSelectedLabelPrinter === printer.id ? C.green : C.buttonLightGreenOutline,
              backgroundColor: C.backgroundListWhite,
              padding: 10,
              marginBottom: idx < labelPrinters.length - 1 ? 8 : 0,
              width: "100%",
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              {!isPrinterOnline(printer) ? (
                <Text style={{ fontSize: 12, fontWeight: "700", color: C.red, backgroundColor: "yellow", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: "hidden" }}>Printer Offline</Text>
              ) : <View />}
              <TouchableOpacity
                onPress={() => {
                  useAlertScreenStore.getState().setValues({
                    title: "Remove Printer",
                    message: "This will delete the printer from the database for all users. It must be re-added through the WarpHub app.",
                    btn1Text: "Delete",
                    btn2Text: "Cancel",
                    handleBtn1Press: () => {
                      let updated = { ...printersObj };
                      delete updated[printer.id];
                      handleSettingsFieldChange("printers", updated);
                      if (sSelectedLabelPrinter === printer.id) {
                        localStorageWrapper.removeItem("selectedLabelPrinterID");
                        _setSelectedLabelPrinter("");
                      }
                      useAlertScreenStore.getState().setShowAlert(false);
                    },
                    handleBtn2Press: () => useAlertScreenStore.getState().setShowAlert(false),
                    canExitOnOuterClick: true,
                  });
                }}
                style={{ padding: 4 }}
              >
                <Image_ icon={ICONS.trash} size={14} />
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: C.text }}>{printer.label || "Unlabeled"}</Text>
                <Text style={{ fontSize: 12, color: gray(0.5), marginTop: 2 }}>{printer.printerName || "—"}</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, justifyContent: "space-between" }}>
              <CheckBox_
                isChecked={sSelectedLabelPrinter === printer.id}
                text="Use this printer"
                textStyle={{ fontSize: 13 }}
                buttonStyle={{ backgroundColor: "transparent" }}
                onCheck={() => handleSelectLabelPrinter(printer.id)}
              />
              <Button_
                text="Test Print"
                onPress={() => {
                  let testObj = labelPrintBuilder.test();
                  dbSavePrintObj(testObj, printer.id);
                }}
                colorGradientArr={COLOR_GRADIENTS.green}
                style={{ paddingHorizontal: 16, paddingVertical: 10 }}
                textStyle={{ fontSize: 14, fontWeight: "700" }}
                enabled={isPrinterOnline(printer)}
              />
            </View>
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

  let statuses = (zSettingsObj?.statuses || []).filter((s) => !s.systemOwned);

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
                proto.id = crypto.randomUUID();
                proto.backgroundColor = gray(0.3);
                proto.textColor = C.text;
                proto.removable = true;
                proto.requireWaitTime = false;
                proto.hidden = false;
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
                    {item.removable ? (
                      <Tooltip text="Delete status" position="top">
                        <BoxButton1
                          style={{ paddingHorizontal: 5 }}
                          iconSize={15}
                          icon={ICONS.trash}
                          onPress={() => {
                            let newStatuses = zSettingsObj.statuses.filter(
                              (o) => o.id != item.id
                            );
                            handleSettingsFieldChange("statuses", newStatuses);
                          }}
                        />
                      </Tooltip>
                    ) : (
                      <View style={{ paddingHorizontal: 5, opacity: 0.3, cursor: "not-allowed" }}>
                        <Image_ icon={ICONS.trash} size={15} />
                      </View>
                    )}
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
                    <Tooltip text="Require wait time before status change" position="top">
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
                    <Tooltip text="Auto-add this wait time" position="top">
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
                    <Tooltip text="Hidden from status picker" position="top">
                      <CheckBox_
                        text=""
                        isChecked={!!item.hidden}
                        onCheck={() => {
                          let newStatuses = zSettingsObj.statuses.map((o) => {
                            if (o.id === item.id) return { ...o, hidden: !o.hidden };
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
    let newRule = { ...STATUS_AUTO_TEXT_PROTO, id: crypto.randomUUID() };
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

const QBInventorySearchModal = ({ parentName, onClose, onAddItems }) => {
  const [sInvSearch, _setInvSearch] = useState("");
  const [sInvResults, _setInvResults] = useState([]);
  const [sSelectedIDs, _setSelectedIDs] = useState(new Set());

  function doSearch(val) {
    _setInvSearch(val);
    if (!val || val.length < 3) { _setInvResults([]); return; }
    workerSearchInventory(val, (results) => _setInvResults(results));
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
    onAddItems([id]);
    onClose();
  }

  function handleMultiSelect() {
    if (sSelectedIDs.size === 0) return;
    onAddItems([...sSelectedIDs]);
    onClose();
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
      onClick={onClose}
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
            onPress={onClose}
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

        {/* Select Items button */}
        <View style={{ paddingHorizontal: 16, paddingVertical: 6 }}>
          <Button_
            text={sSelectedIDs.size > 0 ? "Select Items (" + sSelectedIDs.size + ")" : "Select Items"}
            onPress={handleMultiSelect}
            enabled={sSelectedIDs.size > 0}
            colorGradientArr={COLOR_GRADIENTS.green}
            buttonStyle={{ borderRadius: 5, paddingVertical: 8, opacity: sSelectedIDs.size > 0 ? 1 : 0.4 }}
            textStyle={{ fontSize: 13, color: C.textWhite }}
          />
        </View>

        {/* Results */}
        <FlatList
          data={sInvResults.slice(0, 50)}
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
};

const QuickItemButtonsComponent = () => {
  const zSettingsObj = useSettingsStore((state) => state.settings);
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
    if (btn.id === "labor" || btn.id === "item") return;
    let deletedParentID = btn.parentID || null;
    let updated = zSettingsObj.quickItemButtons
      .filter((o) => o.id !== btn.id)
      .map((o) =>
        o.parentID === btn.id ? { ...o, parentID: deletedParentID } : o
      );
    useSettingsStore.getState().setField("quickItemButtons", updated);
  }

  function handleNameChange(btn, val) {
    useSettingsStore.getState().setField(
      "quickItemButtons",
      zSettingsObj.quickItemButtons.map((o) =>
        o.id === btn.id ? { ...o, name: val } : o
      )
    );
  }

  function handleAdd() {
    let newID = crypto.randomUUID();
    let quickButtonsArr = [...(zSettingsObj?.quickItemButtons || [])];
    quickButtonsArr.push({
      id: newID,
      name: "",
      parentID: sCurrentParentID,
      items: [],
    });
    useSettingsStore.getState().setField("quickItemButtons", quickButtonsArr);
    _setEditingID(newID);
  }

  function handleAddItemsToButton(itemIDs) {
    if (!sCurrentParentID) return;
    let updated = (zSettingsObj?.quickItemButtons || []).map((b) => {
      if (b.id !== sCurrentParentID) return b;
      let existing = b.items || [];
      let existingIDs = existing.map((e) => typeof e === "string" ? e : e.inventoryItemID);
      let newEntries = itemIDs
        .filter((id) => !existingIDs.includes(id))
        .map((id, i) => ({ inventoryItemID: id, x: ((existingIDs.length + i) % 6) * (QB_DEFAULT_W + QB_SNAP_PCT), y: Math.floor((existingIDs.length + i) / 6) * (QB_DEFAULT_H + QB_SNAP_PCT), w: QB_DEFAULT_W, h: QB_DEFAULT_H, fontSize: 10 }));
      return { ...b, items: [...existing, ...newEntries] };
    });
    useSettingsStore.getState().setField("quickItemButtons", updated);
  }

  // Render the extracted component, passing needed props
  function renderInvSearchModal() {
    if (!sShowInvSearchModal) return null;
    const parentBtn = (zSettingsObj?.quickItemButtons || []).find((b) => b.id === sCurrentParentID);
    const parentName = parentBtn?.name || "(unnamed)";
    return (
      <QBInventorySearchModal
        parentName={parentName}
        onClose={() => _setShowInvSearchModal(false)}
        onAddItems={handleAddItemsToButton}
      />
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
    useSettingsStore.getState().setField("quickItemButtons", result);
  }

  function handleToggleDivider(itemID) {
    if (!sCurrentParentID) return;
    let updated = allButtons.map((b) => {
      if (b.id !== sCurrentParentID) return b;
      let dividers = [...(b.dividers || [])];
      let idx = dividers.findIndex((d) => d.itemID === itemID);
      if (idx >= 0) dividers.splice(idx, 1);
      else dividers.push({ itemID, label: "" });
      return { ...b, dividers };
    });
    useSettingsStore.getState().setField("quickItemButtons", updated);
  }

  function handleDividerLabelChange(itemID, label) {
    if (!sCurrentParentID) return;
    let capitalized = label.replace(/(?:^|\s)\S/g, (ch) => ch.toUpperCase());
    let updated = allButtons.map((b) => {
      if (b.id !== sCurrentParentID) return b;
      let dividers = (b.dividers || []).map((d) =>
        d.itemID === itemID ? { ...d, label: capitalized } : d
      );
      return { ...b, dividers };
    });
    useSettingsStore.getState().setField("quickItemButtons", updated);
  }

  let allButtons = zSettingsObj?.quickItemButtons || [];
  let topLevelButtons = allButtons.filter((b) => !b.parentID);
  let currentChildren = allButtons.filter(
    (b) => b.parentID === sCurrentParentID
  );
  let parentButton = sCurrentParentID ? allButtons.find((b) => b.id === sCurrentParentID) : null;
  let parentItems = (parentButton?.items || []).map((entry) => {
    let id = typeof entry === "string" ? entry : entry.inventoryItemID;
    return zInventoryArr.find((o) => o.id === id);
  }).filter(Boolean);

  function renderButtonCard(btn, idx, isDraggable, isColumn) {
    let isEditing = sEditingID === btn.id;
    let childCount = getChildCount(btn.id);
    let formalNames = "";
    if (isEditing) {
      formalNames = (btn.items || []).map((entry) => {
        let id = typeof entry === "string" ? entry : entry.inventoryItemID;
        return zInventoryArr.find((o) => o.id === id)?.formalName;
      }).filter(Boolean).join(", ");
    }
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
          marginRight: 4,
          marginBottom: 4,
          marginLeft: 4,
          marginTop: isEditing && formalNames ? 22 : 4,
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
          backgroundColor: isEditing ? "rgb(245,166,35)" : isColumn ? C.listItemWhite : C.backgroundGreen,
          alignItems: "center",
          justifyContent: isColumn ? "flex-start" : "center",
          position: "relative",
          cursor: isDraggable ? "grab" : "pointer",
          opacity: isDraggable && sDragIdx === idx ? 0.5 : 1,
          boxSizing: "border-box",
        }}
      >
        {/* Formal name helper above card when editing */}
        {isEditing && formalNames ? (
          <Text
            style={{
              position: "absolute",
              top: -18,
              left: 0,
              right: 0,
              fontSize: 10,
              color: gray(0.5),
              textAlign: isColumn ? "left" : "center",
              paddingHorizontal: 4,
              pointerEvents: "none",
            }}
            numberOfLines={1}
          >
            {formalNames}
          </Text>
        ) : null}
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
            onPress={(btn.id === "labor" || btn.id === "item") ? undefined : () => drillIn(btn)}
            style={{
              flex: isColumn ? 1 : undefined,
              width: isColumn ? undefined : "100%",
              cursor: (btn.id === "labor" || btn.id === "item") ? "default" : "pointer",
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
          {btn.removable !== false && (
            <BoxButton1
              onPress={() => handleDelete(btn)}
              style={{ marginLeft: 6 }}
              iconSize={17}
              icon={ICONS.trash}
            />
          )}
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
          <View style={{ width: "100%", alignItems: "center", flexDirection: "column", marginBottom: 10 }}>
            <Tooltip text="Add quick-item button" position="right">
              <BoxButton1 onPress={handleAdd} icon={ICONS.menu1} iconSize={40} />
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
                <BoxButton1 onPress={handleAdd} icon={ICONS.menu1} iconSize={40} />
              </Tooltip>
            </View>
          </View>

          {renderInvSearchModal()}

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

          {/* Inventory items linked to this button */}
          {sCurrentParentID && (
            <ParentButtonItemsList
              sCurrentParentID={sCurrentParentID}
              handleDividerLabelChange={handleDividerLabelChange}
              handleToggleDivider={handleToggleDivider}
            />
          )}
        </View>
      </BoxContainerInnerComponent>
    </BoxContainerOuterComponent>
  );
};

////////////////////////////////////////////////////////////////////////////////
// Parent Button Items List — own drag state, same pattern as WorkorderStatusesComponent
////////////////////////////////////////////////////////////////////////////////

const ParentButtonItemsList = ({
  sCurrentParentID,
  handleDividerLabelChange,
  handleToggleDivider,
}) => {
  const zSettingsObj = useSettingsStore((state) => state.settings);
  const [sDragIdx, _setDragIdx] = useState(null);
  const [sDragOverIdx, _setDragOverIdx] = useState(null);
  const zInventoryArr = useInventoryStore((state) => state.inventoryArr);

  let quickItemButtons = zSettingsObj?.quickItemButtons || [];
  let parentButton = quickItemButtons.find((b) => b.id === sCurrentParentID);
  let parentItems = (parentButton?.items || []).map((entry) => {
    let id = typeof entry === "string" ? entry : entry.inventoryItemID;
    return zInventoryArr.find((o) => o.id === id);
  }).filter(Boolean);

  function handleItemLabelChange(inventoryItemID, val) {
    let invItem = zInventoryArr.find((o) => o.id === inventoryItemID);
    if (!invItem) return;
    let updated = { ...invItem, informalName: val };
    // Update local inventory store immediately for speed
    let updatedArr = zInventoryArr.map((i) => i.id === inventoryItemID ? updated : i);
    useInventoryStore.getState().setItems(updatedArr);
    dbSaveInventoryItem(updated);
  }

  function reorderItems(fromIdx, toIdx) {
    if (fromIdx === null || toIdx === null || fromIdx === toIdx) return;
    let items = [...(parentButton?.items || [])];
    let [dragged] = items.splice(fromIdx, 1);
    items.splice(toIdx, 0, dragged);
    let updated = quickItemButtons.map((b) =>
      b.id === sCurrentParentID ? { ...b, items } : b
    );
    useSettingsStore.getState().setField("quickItemButtons", updated);
  }

  function handleDeleteItem(itemId) {
    let items = (parentButton?.items || []).filter((entry) => {
      let id = typeof entry === "string" ? entry : entry.inventoryItemID;
      return id !== itemId;
    });
    let updated = quickItemButtons.map((b) =>
      b.id === sCurrentParentID ? { ...b, items } : b
    );
    useSettingsStore.getState().setField("quickItemButtons", updated);
  }

  function handleAddToCommon(inventoryItemID) {
    let commonBtn = quickItemButtons.find((b) => b.id === "common");
    if (!commonBtn) return;
    let existingIDs = (commonBtn.items || []).map((e) => typeof e === "string" ? e : e.inventoryItemID);
    if (existingIDs.includes(inventoryItemID)) return;
    let newEntry = { inventoryItemID, x: (existingIDs.length % 6) * (QB_DEFAULT_W + QB_SNAP_PCT), y: Math.floor(existingIDs.length / 6) * (QB_DEFAULT_H + QB_SNAP_PCT), w: QB_DEFAULT_W, h: QB_DEFAULT_H, fontSize: 10 };
    let updated = quickItemButtons.map((b) =>
      b.id === "common" ? { ...b, items: [...(b.items || []), newEntry] } : b
    );
    useSettingsStore.getState().setField("quickItemButtons", updated);
  }

  if (parentItems.length === 0) return null;

  let commonBtn = quickItemButtons.find((b) => b.id === "common");
  let commonItemIDs = (commonBtn?.items || []).map((e) => typeof e === "string" ? e : e.inventoryItemID);

  return (
    <View style={{ marginTop: 10, width: "100%" }}>
      <Text style={{ fontSize: 12, fontWeight: "bold", color: gray(0.5), marginBottom: 6 }}>
        ITEMS ({parentItems.length})
      </Text>
      {parentItems.map((inv, idx) => {
        let dividerObj = (parentButton?.dividers || []).find((d) => d.itemID === inv.id);
        let hasDivider = !!dividerObj;
        let isInCommon = commonItemIDs.includes(inv.id);
        return (
          <React.Fragment key={inv.id}>
            {hasDivider && (
              <View style={{ marginTop: 10, marginBottom: 4 }}>
                <View style={{ height: 4, backgroundColor: C.buttonLightGreenOutline, borderRadius: 2 }} />
                <TextInput_
                  placeholder="Divider label (optional)"
                  value={dividerObj?.label || ""}
                  onChangeText={(val) => handleDividerLabelChange(inv.id, val)}
                  debounceMs={500}
                  style={{
                    fontSize: 12,
                    color: gray(0.5),
                    paddingVertical: 3,
                    paddingHorizontal: 6,
                    outlineWidth: 0,
                    backgroundColor: "transparent",
                  }}
                />
              </View>
            )}
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
                reorderItems(sDragIdx, idx);
                _setDragIdx(null);
                _setDragOverIdx(null);
              }}
              onContextMenu={(e) => { e.preventDefault(); handleToggleDivider(inv.id); }}
              title={hasDivider ? "Right click to remove divider" : "Right click to add divider above"}
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                paddingTop: 6,
                paddingBottom: 6,
                paddingLeft: 8,
                paddingRight: 8,
                borderRadius: 6,
                borderWidth: sDragOverIdx === idx && sDragIdx !== null && sDragIdx !== idx ? 2 : 1,
                borderStyle: "solid",
                borderColor: sDragOverIdx === idx && sDragIdx !== null && sDragIdx !== idx ? C.blue : C.buttonLightGreenOutline,
                backgroundColor: idx % 2 === 0 ? C.backgroundListWhite : C.listItemWhite,
                marginBottom: 2,
                cursor: "grab",
                opacity: sDragIdx === idx ? 0.5 : 1,
                position: "relative",
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, color: C.text }} numberOfLines={1}>
                  {inv.formalName}
                </Text>
                <TextInput_
                  placeholder="Descriptive name"
                  placeholderTextColor={gray(0.35)}
                  value={inv.informalName || ""}
                  onChangeText={(val) => handleItemLabelChange(inv.id, val)}
                  debounceMs={400}
                  style={{
                    fontSize: 11,
                    color: C.blue,
                    paddingVertical: 2,
                    paddingHorizontal: 0,
                    marginTop: 2,
                    outlineWidth: 0,
                    backgroundColor: "transparent",
                    borderBottomWidth: 1,
                    borderBottomColor: gray(0.15),
                  }}
                />
              </View>
              <Text style={{ fontSize: 12, color: gray(0.5), marginRight: 10 }}>
                {"$" + formatCurrencyDisp(inv.price)}
              </Text>
              {sCurrentParentID !== "common" && (
                <Tooltip text={isInCommon ? "Already in Common menu" : "Add to Common menu"}>
                  <TouchableOpacity
                    onPress={isInCommon ? undefined : () => handleAddToCommon(inv.id)}
                    style={{ marginRight: 10, opacity: isInCommon ? 0.3 : 1, cursor: isInCommon ? "default" : "pointer" }}
                  >
                    <Image_ icon={ICONS.add} size={17} />
                  </TouchableOpacity>
                </Tooltip>
              )}
              <TouchableOpacity onPress={() => handleDeleteItem(inv.id)}>
                <Image_ icon={ICONS.trash} size={14} />
              </TouchableOpacity>
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
                  style={{ position: "absolute", bottom: 4, left: 4 }}
                />
              )}
            </div>
          </React.Fragment>
        );
      })}
    </View>
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
    { type: "csv-employeehours", label: "Employee Hours" },
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
          if (lastLogCount === -1) {
            lastLogCount = data.logs.length;
            if (data.status === "complete" || data.status === "error") logsDone();
            return;
          }
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
            let prefix = entry.type === "error" ? "[ERROR]" : entry.type === "success" ? "[OK]" : entry.type === "warn" ? "[WARN]" : "[INFO]";
            console.log("[Export All] " + btn.label + " " + prefix + " " + entry.msg);
          }
          lastLogCount = data.logs.length;
          if (data.status === "complete" || data.status === "error") {
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
        if (lastLogCount === -1) {
          lastLogCount = data.logs.length;
          // If status is already terminal (fast function), resolve immediately
          if (data.status === "complete" || data.status === "error") logsDone();
          return;
        }
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
          console.log("[LS Export] " + prefix + " " + entry.msg);
        }
        lastLogCount = data.logs.length;
        if (newEntries.length > 0) {
          _setLsResult(newEntries[newEntries.length - 1].msg);
        }
        if (data.status === "complete" || data.status === "error") {
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
    const [custText, woText, wiText, serText, itemsText, slText, salesText, spText, paymentsText, empText] = await Promise.all([
      fetch("/lightspeed/customers.csv").then(r => r.text()),
      fetch("/lightspeed/workorders.csv").then(r => r.text()),
      fetch("/lightspeed/workorderItems.csv").then(r => r.text()),
      fetch("/lightspeed/serialized.csv").then(r => r.text()),
      fetch("/lightspeed/items.csv").then(r => r.text()),
      fetch("/lightspeed/salesLines.csv").then(r => r.text()),
      fetch("/lightspeed/sales.csv").then(r => r.text()),
      fetch("/lightspeed/salesPayments.csv").then(r => r.text()),
      fetch("/lightspeed/payments.csv").then(r => r.ok ? r.text() : "").catch(() => ""),
      fetch("/lightspeed/employees.csv").then(r => r.ok ? r.text() : "").catch(() => ""),
    ]);
    const { customers, customerRedirectMap } = mapCustomers(custText);
    const customerMap = {};
    for (const c of customers) customerMap[c.id] = c;
    const settings = useSettingsStore.getState().settings;
    const statuses = settings?.statuses || [];
    const workorders = mapWorkorders(woText, wiText, serText, itemsText, slText, customerMap, statuses, empText, salesText, customerRedirectMap, settings);
    // Build workorderMap: lsSaleID → [mapped workorder objects]
    const workorderMap = {};
    for (const wo of workorders) {
      const lsSaleID = wo._lsSaleID;
      if (lsSaleID && lsSaleID !== "0") {
        if (!workorderMap[lsSaleID]) workorderMap[lsSaleID] = [];
        workorderMap[lsSaleID].push(wo);
      }
    }
    const { sales, transactions } = mapSales(salesText, spText, paymentsText, workorderMap, customerMap, customerRedirectMap);
    _lsCsvData = { customers, customerMap, customerRedirectMap, workorders, sales, transactions, itemsText };
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
      const doneAndPaidID = statusByLabel["finished & paid"]?.id;

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
      console.log("[Inventory Import] Loading inventory.csv...");
      const invText = await fetch("/lightspeed/inventory.csv").then(r => r.text());
      const itemRows = parseCSV(invText);
      const activeItems = itemRows.filter(row => row["Description"]);
      console.log("[Inventory Import] Parsed " + itemRows.length + " rows, " + activeItems.length + " active items.");

      const stripDollar = (val) => (val || "").replace(/[$,]/g, "");

      const toImport = [];
      const skipped = [];
      let invalidCheckDigits = 0;
      for (const item of activeItems) {
        const desc = item["Description"] || "";
        if (desc.includes("Discontinued")) continue;
        const descLower = desc.toLowerCase();
        const isLabor = descLower.includes("labor") || descLower.includes("install");
        const rawUpc = (item["UPC"] || "").trim();
        const rawEan = (item["EAN"] || "").trim();
        const systemId = (item["System ID"] || "").trim();
        const normEan = normalizeBarcode(rawEan);
        const normUpc = normalizeBarcode(rawUpc);
        if (rawEan && !normEan) invalidCheckDigits++;
        if (rawUpc && !normUpc) invalidCheckDigits++;
        // Primary: native EAN-13 (non-leading-0) > padded UPC-A > random
        const isNativeEan = normEan && !normEan.startsWith("0");
        const primaryBarcode = (isNativeEan ? normEan : null) || normUpc || generateEAN13Barcode();
        // Collect all unique normalized barcodes (excluding primary)
        const barcodes = [];
        for (const code of [normEan, normUpc]) {
          if (code && code !== primaryBarcode && !barcodes.includes(code)) barcodes.push(code);
        }
        const id = primaryBarcode;
        const isTube = desc.includes("TUBE ");
        const tubeCost = dollarsToCents(stripDollar(item["Default Cost"]));
        const price = isTube ? (tubeCost > 600 ? 1878 : 939) : dollarsToCents(stripDollar(item["Price"]));
        const mapped = {
          id,
          formalName: desc,
          informalName: "",
          brand: "",
          price,
          salePrice: 0,
          cost: dollarsToCents(stripDollar(item["Default Cost"])),
          category: isLabor ? "Labor" : "Item",
          primaryBarcode,
          barcodes,
          minutes: 0,
          customPart: false,
          customLabor: false,
        };
        if (price > 0) {
          toImport.push(mapped);
        } else {
          skipped.push(mapped);
        }
      }
      skipped.sort((a, b) => {
        const aName = a.formalName.toLowerCase();
        const bName = b.formalName.toLowerCase();
        const aIsLabor = aName.includes("labor");
        const bIsLabor = bName.includes("labor");
        const aIsPart = aName.includes("part");
        const bIsPart = bName.includes("part");
        // Group: Labor first, Part second, Other last
        const aGroup = aIsLabor ? 0 : aIsPart ? 1 : 2;
        const bGroup = bIsLabor ? 0 : bIsPart ? 1 : 2;
        if (aGroup !== bGroup) return aGroup - bGroup;
        return a.formalName.localeCompare(b.formalName);
      });
      console.log("[Inventory Import] " + toImport.length + " items to import, " + skipped.length + " skipped (no price), " + invalidCheckDigits + " invalid check digits.");

      await dbBatchWrite(toImport, "inventory", (done, total) => {
        console.log("[Inventory Import] inventory: " + done + "/" + total + " written.");
      });

      // // Download inventory_imported.csv
      // {
      //   toImport.sort((a, b) => {
      //     const aName = a.formalName.toLowerCase();
      //     const bName = b.formalName.toLowerCase();
      //     const aGroup = aName.includes("labor") ? 0 : aName.includes("part") ? 1 : 2;
      //     const bGroup = bName.includes("labor") ? 0 : bName.includes("part") ? 1 : 2;
      //     if (aGroup !== bGroup) return aGroup - bGroup;
      //     return a.formalName.localeCompare(b.formalName);
      //   });
      //   const esc = (v) => '"' + String(v || "").replace(/"/g, '""') + '"';
      //   const csvHeader = "Category,Description,Price,Cost,Primary Barcode,Other Barcodes";
      //   const csvRows = toImport.map(item =>
      //     [item.category, esc(item.formalName), (item.price / 100).toFixed(2), (item.cost / 100).toFixed(2), esc(item.primaryBarcode), esc(item.barcodes.join("; "))].join(",")
      //   );
      //   const csvContent = csvHeader + "\n" + csvRows.join("\n");
      //   const blob = new Blob([csvContent], { type: "text/csv" });
      //   const url = URL.createObjectURL(blob);
      //   const a = document.createElement("a");
      //   a.href = url;
      //   a.download = "inventory_imported.csv";
      //   a.click();
      //   URL.revokeObjectURL(url);
      //   console.log("[Inventory Import] inventory_imported.csv downloaded (" + toImport.length + " items).");
      // }

      // if (skipped.length > 0) {
      //   console.log("[Inventory Import] Generating CSV for " + skipped.length + " skipped items...");
      //   const csvHeader = "Group,Description,Price,Cost,Primary Barcode,Other Barcodes";
      //   const csvRows = skipped.map(item => {
      //     const group = item.formalName.toLowerCase().includes("labor") ? "Labor" : item.formalName.toLowerCase().includes("item") ? "Item" : "Other";
      //     const esc = (v) => '"' + String(v || "").replace(/"/g, '""') + '"';
      //     return [group, esc(item.formalName), item.price, item.cost, esc(item.primaryBarcode), esc((item.barcodes || []).join("; "))].join(",");
      //   });
      //   const csvContent = csvHeader + "\n" + csvRows.join("\n");
      //   const blob = new Blob([csvContent], { type: "text/csv" });
      //   const url = URL.createObjectURL(blob);
      //   const a = document.createElement("a");
      //   a.href = url;
      //   a.download = "inventory_skipped_items.csv";
      //   a.click();
      //   URL.revokeObjectURL(url);
      //   console.log("[Inventory Import] Skipped items CSV downloaded.");
      // }

      console.log("[Inventory Import] Complete. " + toImport.length + " imported, " + skipped.length + " skipped.");
      _setLsResult("Inventory Import: " + toImport.length + " imported, " + skipped.length + " skipped (no price)");
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
    const migrationStart = Date.now();

    try {
      // Invalidate cached CSV data so fresh files are always used
      _lsCsvData = null;

      // Clear existing collections before writing
      _setMigrationStep("Clearing collections...");
      console.log("[Migration] Clearing collections...");
      await Promise.all([
        dbClearCollection("open-workorders"),
        dbClearCollection("completed-workorders"),
        dbClearCollection("customers"),
        dbClearCollection("completed-sales"),
        dbClearCollection("active-sales"),
        dbClearCollection("inventory"),
        dbClearCollection("punches"),
        dbClearCollection("transactions"),
      ]);
      console.log("[Migration] Collections cleared.");

      // Extract statuses first so the mapping resolves status IDs correctly
      const settings = cloneDeep(useSettingsStore.getState().settings || {});
      _setMigrationStep("Extracting statuses...");
      console.log("[Migration] Extracting statuses...");
      const statusesText = await fetch("/import_data/statuses.csv").then(r => r.text());
      const mergedStatuses = mapStatuses(statusesText);
      settings.statuses = mergedStatuses;
      await dbSaveSettings(settings);
      useSettingsStore.getState().setSettings(settings);

      // Load & map all CSV data with correct statuses
      _setMigrationStep("Loading & mapping CSVs...");
      console.log("[Migration] Loading & mapping CSVs...");
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

      // Save inventory — load inventory.csv for retail prices (items.csv has no price column)
      _setMigrationStep("Saving inventory...");
      const invCsvText = await fetch("/lightspeed/inventory.csv").then(r => r.text());
      const invPriceMap = {};
      const stripDollar = (val) => (val || "").replace(/[$,]/g, "");
      for (const invRow of parseCSV(invCsvText)) {
        const desc = (invRow["Description"] || "").toLowerCase().trim();
        if (desc) invPriceMap[desc] = stripDollar(invRow["Price"]);
      }
      console.log("[Migration] Built inventory price lookup: " + Object.keys(invPriceMap).length + " entries.");
      const itemRows = parseCSV(freshData.itemsText);
      const activeItems = itemRows.filter(row => row.archived !== "true" && row.description);
      const mappedItems = activeItems.map(item => {
        const isLabor = (item.description || "").toLowerCase().includes("labor");
        const descKey = (item.description || "").toLowerCase().trim();
        const retailPrice = invPriceMap[descKey];
        return {
          id: generateEAN13Barcode(),
          formalName: item.description || "",
          informalName: "",
          brand: "",
          price: retailPrice ? dollarsToCents(retailPrice) : dollarsToCents(item.defaultCost),
          salePrice: 0,
          cost: dollarsToCents(item.avgCost || item.defaultCost),
          category: isLabor ? "Labor" : "Item",
          primaryBarcode: normalizeBarcode(item.upc) || normalizeBarcode(item.ean) || generateEAN13Barcode(),
          barcodes: [normalizeBarcode(item.upc), normalizeBarcode(item.ean)].filter(Boolean),
          minutes: 0,
          customPart: false,
          customLabor: false,
        };
      });
      const pricedItems = mappedItems.filter(item => item.price > 0);
      console.log("[Migration] Saving " + pricedItems.length + " inventory items (" + (mappedItems.length - pricedItems.length) + " skipped with $0 price)...");
      _setMigrationProgress({ done: 0, total: pricedItems.length });
      await dbBatchWrite(pricedItems, "inventory", (done, total) => {
        _setMigrationProgress({ done, total });
      });
      console.log("[Migration] Inventory done.");

      // Route & save workorders
      _setMigrationStep("Saving workorders...");
      const statusByLabel = {};
      for (const s of (settings.statuses || [])) statusByLabel[s.label.toLowerCase()] = s;
      const doneAndPaidID = statusByLabel["finished & paid"]?.id;

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

      // Route & save sales — completed go to completed-sales, incomplete only if linked to a workorder go to active-sales
      _setMigrationStep("Saving sales...");
      const completedSales = freshData.sales.filter(s => s.paymentComplete);
      const linkedIncompleteSales = freshData.sales.filter(s => !s.paymentComplete && s.workorderIDs && s.workorderIDs.length > 0);
      const skippedCount = freshData.sales.length - completedSales.length - linkedIncompleteSales.length;
      console.log("[Migration] Saving " + completedSales.length + " completed sales + " + linkedIncompleteSales.length + " linked incomplete sales (skipping " + skippedCount + " unlinked incomplete)...");
      _setMigrationProgress({ done: 0, total: completedSales.length + linkedIncompleteSales.length });
      let salesDone = 0;
      await dbBatchWrite(completedSales, "completed-sales", (done) => {
        salesDone = done;
        _setMigrationProgress({ done: salesDone, total: completedSales.length + linkedIncompleteSales.length });
      });
      if (linkedIncompleteSales.length > 0) {
        await dbBatchWrite(linkedIncompleteSales, "active-sales", (done) => {
          _setMigrationProgress({ done: salesDone + done, total: completedSales.length + linkedIncompleteSales.length });
        });
      }
      console.log("[Migration] Sales done.");

      // Save transactions
      _setMigrationStep("Saving transactions...");
      console.log("[Migration] Saving " + freshData.transactions.length + " transactions...");
      _setMigrationProgress({ done: 0, total: freshData.transactions.length });
      await dbBatchWrite(freshData.transactions, "transactions", (done) => {
        _setMigrationProgress({ done, total: freshData.transactions.length });
      });
      console.log("[Migration] Transactions done.");

      // Map & save employees and punch history
      _setMigrationStep("Mapping employees...");
      const empCsvText = await fetch("/lightspeed/employees.csv").then(r => r.ok ? r.text() : "").catch(() => "");
      const empHoursCsvText = await fetch("/lightspeed/employeeHours.csv").then(r => r.ok ? r.text() : "").catch(() => "");
      let employeeCount = 0;
      let punchCount = 0;
      if (empCsvText) {
        const { users: newUsers, employeeIDMap } = mapEmployees(empCsvText);
        employeeCount = newUsers.length;
        console.log("[Migration] Mapped " + newUsers.length + " employees.");

        // Add new users to settings alongside existing users (Fritz)
        const updatedSettings = cloneDeep(useSettingsStore.getState().settings || {});
        if (!updatedSettings.users) updatedSettings.users = [];
        const existingByLsID = {};
        updatedSettings.users.forEach(function (u) { if (u.lightspeed_id) existingByLsID[u.lightspeed_id] = u; });
        for (const u of newUsers) {
          if (!existingByLsID[u.lightspeed_id]) updatedSettings.users.push(u);
        }
        await dbSaveSettings(updatedSettings);
        useSettingsStore.getState().setSettings(updatedSettings);
        console.log("[Migration] Users saved to settings (" + updatedSettings.users.length + " total).");

        // Map & save punch history
        if (empHoursCsvText) {
          _setMigrationStep("Saving punch history...");
          const punches = mapPunchHistory(empHoursCsvText, employeeIDMap);
          punchCount = punches.length;
          console.log("[Migration] Saving " + punches.length + " punch records...");
          _setMigrationProgress({ done: 0, total: punches.length });
          await dbBatchWrite(punches, "punches", (done, total) => {
            _setMigrationProgress({ done, total });
          });
          console.log("[Migration] Punch history done.");
        }
      }

      // Update local store with open workorders
      useOpenWorkordersStore.getState().setOpenWorkorders(openWorkorders);

      // Summary
      const elapsed = ((Date.now() - migrationStart) / 1000).toFixed(1);
      const summary = "Full Migration Complete in " + elapsed + "s: " +
        freshData.customers.length + " customers, " +
        pricedItems.length + " inventory, " +
        openWorkorders.length + " open WOs, " +
        completedWorkorders.length + " completed WOs, " +
        completedSales.length + " completed sales, " +
        linkedIncompleteSales.length + " active sales, " +
        freshData.transactions.length + " transactions, " +
        employeeCount + " employees, " +
        punchCount + " punches";
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

  function buildCsvString(headers, rows) {
    const escape = (val) => {
      const str = val == null ? "" : String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) return '"' + str.replace(/"/g, '""') + '"';
      return str;
    };
    return headers.map(escape).join(",") + "\n" + rows.map(r => r.map(escape).join(",")).join("\n");
  }

  async function writeCsvToDir(dirHandle, filename, csvString) {
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(csvString);
    await writable.close();
  }

  async function handleDevMigration() {
    _setDevMigrating(true);
    _setMigrationStep("Running full mapping pipeline...");
    _setMigrationProgress({ done: 0, total: 0 });
    _setLsResult("");
    const migrationStart = Date.now();

    try {
      // 1. Run full mapping pipeline (identical to full migration)
      _lsCsvData = null;

      _setMigrationStep("Mapping statuses...");
      console.log("[Dev Migration] Mapping statuses...");
      const statusesText = await fetch("/import_data/statuses.csv").then(r => r.text());
      const mergedStatuses = mapStatuses(statusesText);
      const settings = cloneDeep(useSettingsStore.getState().settings || {});
      settings.statuses = mergedStatuses;
      useSettingsStore.getState().setSettings(settings);

      _setMigrationStep("Loading & mapping CSVs...");
      console.log("[Dev Migration] Loading & mapping CSVs...");
      _lsCsvData = null;
      const freshData = await loadAndCacheLightspeedData();

      // Map employees
      const empCsvText = await fetch("/lightspeed/employees.csv").then(r => r.ok ? r.text() : "").catch(() => "");
      const empHoursCsvText = await fetch("/lightspeed/employeeHours.csv").then(r => r.ok ? r.text() : "").catch(() => "");
      const { users: allEmployees, employeeIDMap } = empCsvText ? mapEmployees(empCsvText) : { users: [], employeeIDMap: {} };
      const allPunches = empHoursCsvText ? mapPunchHistory(empHoursCsvText, employeeIDMap) : [];
      console.log("[Dev Migration] Full mapping complete: " + freshData.workorders.length + " WOs, " + freshData.customers.length + " customers, " + freshData.sales.length + " sales, " + freshData.transactions.length + " transactions, " + allEmployees.length + " employees, " + allPunches.length + " punches.");

      // 2. Pick 20 most recent workorders + pinned WO 12497
      _setMigrationStep("Filtering to 20 most recent WOs...");
      const DEV_PINNED_WO_IDS = ["12497"];
      const sorted = [...freshData.workorders]
        .filter(wo => wo.startedOnMillis)
        .sort((a, b) => b.startedOnMillis - a.startedOnMillis);
      const selectedWOs = sorted.slice(0, 20);
      for (const pinnedID of DEV_PINNED_WO_IDS) {
        const alreadyIncluded = selectedWOs.some(wo => wo.lightspeed_id === pinnedID);
        if (!alreadyIncluded) {
          const pinned = freshData.workorders.find(wo => wo.lightspeed_id === pinnedID);
          if (pinned) {
            selectedWOs.push(pinned);
            console.log("[Dev Migration] Pinned WO " + pinnedID + " added.");
          } else {
            console.warn("[Dev Migration] Pinned WO " + pinnedID + " not found in mapped data — skipping.");
          }
        }
      }
      console.log("[Dev Migration] Selected " + selectedWOs.length + " workorders.");

      // 3. Collect referenced IDs from those 50 workorders
      const customerIDSet = new Set();
      const saleIDSet = new Set();
      const inventoryIDSet = new Set();
      const employeeUserIDSet = new Set();

      for (const wo of selectedWOs) {
        if (wo.customerID) customerIDSet.add(wo.customerID);
        if (wo.saleID) saleIDSet.add(wo.saleID);
        if (wo._lsSaleID) saleIDSet.add(wo._lsSaleID);
        if (wo.startedBy) {
          const appUserID = employeeIDMap[wo.startedBy];
          if (appUserID) employeeUserIDSet.add(appUserID);
        }
        for (const line of (wo.workorderLines || [])) {
          if (line.inventoryItem?.id) inventoryIDSet.add(line.inventoryItem.id);
        }
      }

      // Filter each collection to only referenced items
      const filteredCustomers = freshData.customers.filter(c => customerIDSet.has(c.id));
      const filteredSales = freshData.sales.filter(s => saleIDSet.has(s.id) || saleIDSet.has(s.lightspeed_id));
      const filteredSaleIDSet = new Set(filteredSales.map(s => s.id));
      const filteredTransactions = freshData.transactions.filter(t => filteredSaleIDSet.has(t.saleID));
      const filteredEmployees = allEmployees.filter(u => employeeUserIDSet.has(u.id));
      const filteredPunches = allPunches.filter(p => employeeUserIDSet.has(p.userID));

      // Inventory: the mapped items from handleFullMigration use itemID as id - collect from workorder lines
      // Since workorder lines use custom inline items, we include ALL inventory for dev (small set)
      // but filter to only items whose id appears in workorderLines
      const invCsvText = await fetch("/lightspeed/inventory.csv").then(r => r.text());
      const invPriceMap = {};
      const stripDollar = (val) => (val || "").replace(/[$,]/g, "");
      for (const invRow of parseCSV(invCsvText)) {
        const desc = (invRow["Description"] || "").toLowerCase().trim();
        if (desc) invPriceMap[desc] = stripDollar(invRow["Price"]);
      }
      const itemRows = parseCSV(freshData.itemsText);
      const activeItems = itemRows.filter(row => row.archived !== "true" && row.description);
      const allMappedItems = activeItems.map(item => {
        const isLabor = (item.description || "").toLowerCase().includes("labor");
        const descKey = (item.description || "").toLowerCase().trim();
        const retailPrice = invPriceMap[descKey];
        return {
          id: generateEAN13Barcode(),
          formalName: item.description || "",
          informalName: "",
          brand: "",
          price: retailPrice ? dollarsToCents(retailPrice) : dollarsToCents(item.defaultCost),
          salePrice: 0,
          cost: dollarsToCents(item.avgCost || item.defaultCost),
          category: isLabor ? "Labor" : "Item",
          primaryBarcode: normalizeBarcode(item.upc) || normalizeBarcode(item.ean) || generateEAN13Barcode(),
          barcodes: [normalizeBarcode(item.upc), normalizeBarcode(item.ean)].filter(Boolean),
          minutes: 0,
          customPart: false,
          customLabor: false,
        };
      }).filter(item => item.price > 0);
      // Workorder lines use inline custom items, not inventory IDs - include full inventory for dev
      const filteredInventory = allMappedItems;

      console.log("[Dev Migration] Filtered: " + selectedWOs.length + " WOs, " + filteredCustomers.length + " customers, " + filteredSales.length + " sales, " + filteredTransactions.length + " transactions, " + filteredInventory.length + " inventory, " + filteredEmployees.length + " employees, " + filteredPunches.length + " punches.");

      // 4. Clear collections and write filtered data to DB (same as full migration)
      _setMigrationStep("Clearing collections...");
      console.log("[Dev Migration] Clearing collections...");
      await Promise.all([
        dbClearCollection("open-workorders"),
        dbClearCollection("completed-workorders"),
        dbClearCollection("customers"),
        dbClearCollection("completed-sales"),
        dbClearCollection("active-sales"),
        dbClearCollection("inventory"),
        dbClearCollection("punches"),
        dbClearCollection("transactions"),
      ]);
      console.log("[Dev Migration] Collections cleared.");

      // Save statuses to settings
      await dbSaveSettings(settings);
      useSettingsStore.getState().setSettings(settings);

      // Save customers
      _setMigrationStep("Saving customers...");
      console.log("[Dev Migration] Saving " + filteredCustomers.length + " customers...");
      _setMigrationProgress({ done: 0, total: filteredCustomers.length });
      await dbBatchWrite(filteredCustomers, "customers", (done, total) => {
        _setMigrationProgress({ done, total });
      });

      // Save inventory
      _setMigrationStep("Saving inventory...");
      console.log("[Dev Migration] Saving " + filteredInventory.length + " inventory items...");
      _setMigrationProgress({ done: 0, total: filteredInventory.length });
      await dbBatchWrite(filteredInventory, "inventory", (done, total) => {
        _setMigrationProgress({ done, total });
      });

      // Route & save workorders by status
      _setMigrationStep("Saving workorders...");
      const statusByLabel = {};
      for (const s of (settings.statuses || [])) statusByLabel[s.label.toLowerCase()] = s;
      const doneAndPaidID = statusByLabel["finished & paid"]?.id;

      const openWorkorders = selectedWOs.filter(wo => wo.status !== doneAndPaidID);
      const completedWorkorders = selectedWOs.filter(wo => wo.status === doneAndPaidID);
      const allWOs = [...openWorkorders, ...completedWorkorders];
      console.log("[Dev Migration] Saving " + openWorkorders.length + " open WOs + " + completedWorkorders.length + " completed WOs...");
      _setMigrationProgress({ done: 0, total: allWOs.length });
      let woDone = 0;
      await dbBatchWrite(openWorkorders, "open-workorders", (done) => {
        woDone = done;
        _setMigrationProgress({ done: woDone, total: allWOs.length });
      });
      await dbBatchWrite(completedWorkorders, "completed-workorders", (done) => {
        _setMigrationProgress({ done: woDone + done, total: allWOs.length });
      });

      // Route & save sales
      _setMigrationStep("Saving sales...");
      const completedSales = filteredSales.filter(s => s.paymentComplete);
      const linkedIncompleteSales = filteredSales.filter(s => !s.paymentComplete && s.workorderIDs && s.workorderIDs.length > 0);
      console.log("[Dev Migration] Saving " + completedSales.length + " completed sales + " + linkedIncompleteSales.length + " linked incomplete sales...");
      _setMigrationProgress({ done: 0, total: completedSales.length + linkedIncompleteSales.length });
      let salesDone = 0;
      await dbBatchWrite(completedSales, "completed-sales", (done) => {
        salesDone = done;
        _setMigrationProgress({ done: salesDone, total: completedSales.length + linkedIncompleteSales.length });
      });
      if (linkedIncompleteSales.length > 0) {
        await dbBatchWrite(linkedIncompleteSales, "active-sales", (done) => {
          _setMigrationProgress({ done: salesDone + done, total: completedSales.length + linkedIncompleteSales.length });
        });
      }

      // Save transactions
      _setMigrationStep("Saving transactions...");
      console.log("[Dev Migration] Saving " + filteredTransactions.length + " transactions...");
      _setMigrationProgress({ done: 0, total: filteredTransactions.length });
      await dbBatchWrite(filteredTransactions, "transactions", (done, total) => {
        _setMigrationProgress({ done, total });
      });

      // Save employees to settings + punch history
      if (filteredEmployees.length > 0) {
        _setMigrationStep("Saving employees...");
        const updatedSettings = cloneDeep(useSettingsStore.getState().settings || {});
        if (!updatedSettings.users) updatedSettings.users = [];
        const existingByLsID = {};
        updatedSettings.users.forEach(function (u) { if (u.lightspeed_id) existingByLsID[u.lightspeed_id] = u; });
        for (const u of filteredEmployees) {
          if (!existingByLsID[u.lightspeed_id]) updatedSettings.users.push(u);
        }
        await dbSaveSettings(updatedSettings);
        useSettingsStore.getState().setSettings(updatedSettings);
        console.log("[Dev Migration] Users saved to settings (" + updatedSettings.users.length + " total).");
      }
      if (filteredPunches.length > 0) {
        _setMigrationStep("Saving punch history...");
        console.log("[Dev Migration] Saving " + filteredPunches.length + " punch records...");
        _setMigrationProgress({ done: 0, total: filteredPunches.length });
        await dbBatchWrite(filteredPunches, "punches", (done, total) => {
          _setMigrationProgress({ done, total });
        });
      }

      // Update local store with open workorders
      useOpenWorkordersStore.getState().setOpenWorkorders(openWorkorders);

      const elapsed = ((Date.now() - migrationStart) / 1000).toFixed(1);
      const summary = "Dev Migration Complete in " + elapsed + "s: " +
        selectedWOs.length + "/" + freshData.workorders.length + " workorders (" + openWorkorders.length + " open, " + completedWorkorders.length + " completed), " +
        filteredCustomers.length + " customers, " +
        filteredInventory.length + " inventory, " +
        completedSales.length + " completed sales, " +
        linkedIncompleteSales.length + " active sales, " +
        filteredTransactions.length + " transactions, " +
        filteredEmployees.length + " employees, " +
        filteredPunches.length + " punches";
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

  async function handleValidateExport() {
    _setDevMigrating(true);
    _setMigrationStep("Select folder with _import_ CSVs...");
    _setLsResult("");
    const errors = [];
    const warnings = [];
    const info = [];

    try {
      const dirHandle = await window.showDirectoryPicker({ mode: "read" });

      // --- Read all 8 CSV files ---
      _setMigrationStep("Reading CSV files...");
      const readFile = async (name) => {
        try {
          const fh = await dirHandle.getFileHandle(name);
          const file = await fh.getFile();
          return await file.text();
        } catch (e) {
          return null;
        }
      };

      const [statusesTxt, customersTxt, workordersTxt, salesTxt, transactionsTxt, inventoryTxt, employeesTxt, punchesTxt] = await Promise.all([
        readFile("_import_statuses.csv"),
        readFile("_import_customers.csv"),
        readFile("_import_workorders.csv"),
        readFile("_import_sales.csv"),
        readFile("_import_transactions.csv"),
        readFile("_import_inventory.csv"),
        readFile("_import_employees.csv"),
        readFile("_import_punches.csv"),
      ]);

      const missing = [];
      if (!statusesTxt) missing.push("_import_statuses.csv");
      if (!customersTxt) missing.push("_import_customers.csv");
      if (!workordersTxt) missing.push("_import_workorders.csv");
      if (!salesTxt) missing.push("_import_sales.csv");
      if (!transactionsTxt) missing.push("_import_transactions.csv");
      if (!inventoryTxt) missing.push("_import_inventory.csv");
      if (!employeesTxt) missing.push("_import_employees.csv");
      if (!punchesTxt) missing.push("_import_punches.csv");
      if (missing.length > 0) {
        errors.push("MISSING FILES: " + missing.join(", "));
      }

      // --- Parse CSVs ---
      _setMigrationStep("Parsing CSVs...");
      const statuses = statusesTxt ? parseCSV(statusesTxt) : [];
      const customers = customersTxt ? parseCSV(customersTxt) : [];
      const workorders = workordersTxt ? parseCSV(workordersTxt) : [];
      const sales = salesTxt ? parseCSV(salesTxt) : [];
      const transactions = transactionsTxt ? parseCSV(transactionsTxt) : [];
      const inventory = inventoryTxt ? parseCSV(inventoryTxt) : [];
      const employees = employeesTxt ? parseCSV(employeesTxt) : [];
      const punches = punchesTxt ? parseCSV(punchesTxt) : [];

      info.push("Parsed: " + statuses.length + " statuses, " + customers.length + " customers, " + workorders.length + " workorders, " + sales.length + " sales, " + transactions.length + " transactions, " + inventory.length + " inventory, " + employees.length + " employees, " + punches.length + " punches");

      // --- Build ID sets for lookups ---
      const statusIDSet = new Set(statuses.map(s => s.id));
      const customerIDSet = new Set(customers.map(c => c.id));
      const saleIDSet = new Set(sales.map(s => s.id));
      const saleLsIDSet = new Set(sales.map(s => s.lightspeed_id).filter(Boolean));
      const transactionIDSet = new Set(transactions.map(t => t.id));
      const inventoryIDSet = new Set(inventory.map(i => i.id));
      const employeeIDSet = new Set(employees.map(e => e.id));
      const workorderIDSet = new Set(workorders.map(w => w.id));

      // ================================================================
      // 1. DUPLICATE ID CHECKS
      // ================================================================
      _setMigrationStep("Checking for duplicate IDs...");
      const checkDuplicates = (arr, label) => {
        const seen = new Set();
        const dupes = [];
        for (const item of arr) {
          if (!item.id) { errors.push(label + ": row with empty ID"); continue; }
          if (seen.has(item.id)) dupes.push(item.id);
          seen.add(item.id);
        }
        if (dupes.length > 0) errors.push(label + ": " + dupes.length + " duplicate IDs — " + dupes.slice(0, 5).join(", ") + (dupes.length > 5 ? "..." : ""));
      };
      checkDuplicates(statuses, "Statuses");
      checkDuplicates(customers, "Customers");
      checkDuplicates(workorders, "Workorders");
      checkDuplicates(sales, "Sales");
      checkDuplicates(transactions, "Transactions");
      checkDuplicates(inventory, "Inventory");
      checkDuplicates(employees, "Employees");
      checkDuplicates(punches, "Punches");

      // ================================================================
      // 2. WORKORDER → STATUS
      // ================================================================
      _setMigrationStep("Validating workorder → status...");
      let woMissingStatus = 0;
      const unknownStatuses = new Set();
      for (const wo of workorders) {
        if (!wo.status) { woMissingStatus++; continue; }
        if (!statusIDSet.has(wo.status)) {
          unknownStatuses.add(wo.status);
          woMissingStatus++;
        }
      }
      if (woMissingStatus > 0) errors.push("Workorder → Status: " + woMissingStatus + " workorders reference missing/empty status IDs" + (unknownStatuses.size > 0 ? " — unknown: " + [...unknownStatuses].slice(0, 5).join(", ") : ""));
      else info.push("Workorder → Status: all " + workorders.length + " OK");

      // ================================================================
      // 3. WORKORDER → CUSTOMER
      // ================================================================
      _setMigrationStep("Validating workorder → customer...");
      let woMissingCust = 0;
      let woStandalone = 0;
      const missingCustIDs = new Set();
      for (const wo of workorders) {
        if (!wo.customerID) { woStandalone++; continue; }
        if (!customerIDSet.has(wo.customerID)) {
          woMissingCust++;
          missingCustIDs.add(wo.customerID);
        }
      }
      if (woMissingCust > 0) errors.push("Workorder → Customer: " + woMissingCust + " workorders reference missing customers — " + [...missingCustIDs].slice(0, 5).join(", ") + (missingCustIDs.size > 5 ? "..." : ""));
      else info.push("Workorder → Customer: all OK (" + woStandalone + " standalone)");

      // ================================================================
      // 4. WORKORDER → SALE (saleID and _lsSaleID)
      // ================================================================
      _setMigrationStep("Validating workorder → sale...");
      let woMissingSale = 0;
      let woHasSale = 0;
      const missingSaleIDs = new Set();
      for (const wo of workorders) {
        const hasSaleRef = wo.saleID || wo._lsSaleID;
        if (!hasSaleRef) continue;
        woHasSale++;
        // saleID should match a sale.id; _lsSaleID should match a sale.lightspeed_id
        const saleFound = (wo.saleID && saleIDSet.has(wo.saleID)) || (wo._lsSaleID && saleLsIDSet.has(wo._lsSaleID));
        if (!saleFound) {
          woMissingSale++;
          missingSaleIDs.add(wo.saleID || wo._lsSaleID);
        }
      }
      if (woMissingSale > 0) errors.push("Workorder → Sale: " + woMissingSale + "/" + woHasSale + " workorders reference missing sales — " + [...missingSaleIDs].slice(0, 5).join(", "));
      else info.push("Workorder → Sale: all " + woHasSale + " linked WOs OK");

      // ================================================================
      // 5. SALE → WORKORDER (workorderIDs array)
      // ================================================================
      _setMigrationStep("Validating sale → workorder...");
      let saleMissingWo = 0;
      let saleWoLinks = 0;
      for (const sale of sales) {
        let woIDs = [];
        try { woIDs = JSON.parse(sale.workorderIDs || "[]"); } catch (e) { errors.push("Sale " + sale.id + ": invalid workorderIDs JSON"); continue; }
        if (!Array.isArray(woIDs)) { errors.push("Sale " + sale.id + ": workorderIDs is not an array"); continue; }
        for (const woID of woIDs) {
          saleWoLinks++;
          if (!workorderIDSet.has(woID)) saleMissingWo++;
        }
      }
      if (saleMissingWo > 0) warnings.push("Sale → Workorder: " + saleMissingWo + "/" + saleWoLinks + " links reference workorders not in export (may be outside 50-WO window)");
      else info.push("Sale → Workorder: all " + saleWoLinks + " links OK");

      // ================================================================
      // 6. CUSTOMER → WORKORDER back-references
      // ================================================================
      _setMigrationStep("Validating customer → workorder...");
      let custWoMissing = 0;
      let custWoLinks = 0;
      for (const cust of customers) {
        let woIDs = [];
        try { woIDs = JSON.parse(cust.workorders || "[]"); } catch (e) { errors.push("Customer " + cust.id + ": invalid workorders JSON"); continue; }
        if (!Array.isArray(woIDs)) continue;
        for (const woID of woIDs) {
          custWoLinks++;
          if (!workorderIDSet.has(woID)) custWoMissing++;
        }
      }
      if (custWoMissing > 0) warnings.push("Customer → Workorder: " + custWoMissing + "/" + custWoLinks + " back-references point to workorders not in export (expected for 50-WO filter)");
      else info.push("Customer → Workorder: all " + custWoLinks + " back-refs OK");

      // ================================================================
      // 7. CUSTOMER → SALE back-references
      // ================================================================
      _setMigrationStep("Validating customer → sale...");
      let custSaleMissing = 0;
      let custSaleLinks = 0;
      for (const cust of customers) {
        let saleIDs = [];
        try { saleIDs = JSON.parse(cust.sales || "[]"); } catch (e) { continue; }
        if (!Array.isArray(saleIDs)) continue;
        for (const sid of saleIDs) {
          custSaleLinks++;
          if (!saleIDSet.has(sid)) custSaleMissing++;
        }
      }
      if (custSaleMissing > 0) warnings.push("Customer → Sale: " + custSaleMissing + "/" + custSaleLinks + " back-references point to sales not in export (expected for 50-WO filter)");
      else info.push("Customer → Sale: all " + custSaleLinks + " back-refs OK");

      // ================================================================
      // 8. PUNCH → EMPLOYEE
      // ================================================================
      _setMigrationStep("Validating punch → employee...");
      let punchMissingEmp = 0;
      const missingEmpIDs = new Set();
      for (const punch of punches) {
        if (!punch.userID) { errors.push("Punch " + punch.id + ": empty userID"); continue; }
        if (!employeeIDSet.has(punch.userID)) {
          punchMissingEmp++;
          missingEmpIDs.add(punch.userID);
        }
      }
      if (punchMissingEmp > 0) errors.push("Punch → Employee: " + punchMissingEmp + " punches reference missing employees — " + [...missingEmpIDs].slice(0, 3).join(", "));
      else info.push("Punch → Employee: all " + punches.length + " OK");

      // ================================================================
      // 9. PUNCH PAIRING (in/out balance per employee)
      // ================================================================
      _setMigrationStep("Checking punch in/out pairing...");
      const punchByUser = {};
      for (const p of punches) {
        if (!punchByUser[p.userID]) punchByUser[p.userID] = { in: 0, out: 0 };
        if (p.option === "in") punchByUser[p.userID].in++;
        else if (p.option === "out") punchByUser[p.userID].out++;
      }
      let punchImbalance = 0;
      for (const [uid, counts] of Object.entries(punchByUser)) {
        const diff = Math.abs(counts.in - counts.out);
        if (diff > 1) {
          const emp = employees.find(e => e.id === uid);
          const name = emp ? (emp.first + " " + emp.last).trim() : uid;
          warnings.push("Punch pairing: " + name + " has " + counts.in + " ins, " + counts.out + " outs (diff: " + diff + ")");
          punchImbalance++;
        }
      }
      if (punchImbalance === 0) info.push("Punch pairing: all employees balanced (within 1)");

      // ================================================================
      // 10. PUNCH TIMESTAMPS
      // ================================================================
      let invalidPunchMillis = 0;
      for (const p of punches) {
        const ms = Number(p.millis);
        if (!ms || isNaN(ms) || ms < 0) invalidPunchMillis++;
      }
      if (invalidPunchMillis > 0) errors.push("Punch timestamps: " + invalidPunchMillis + " punches with invalid millis");
      else info.push("Punch timestamps: all " + punches.length + " valid");

      // ================================================================
      // 11. WORKORDER LINE ITEMS → INVENTORY
      // ================================================================
      _setMigrationStep("Validating workorder lines → inventory...");
      let lineItemCount = 0;
      let lineItemMissing = 0;
      let lineItemCustom = 0;
      for (const wo of workorders) {
        let lines = [];
        try { lines = JSON.parse(wo.workorderLines || "[]"); } catch (e) { errors.push("Workorder " + wo.id + ": invalid workorderLines JSON"); continue; }
        if (!Array.isArray(lines)) continue;
        for (const line of lines) {
          lineItemCount++;
          const invItem = line.inventoryItem;
          if (!invItem || !invItem.id) { lineItemMissing++; continue; }
          if (invItem.customPart || invItem.customLabor) { lineItemCustom++; continue; }
          // Non-custom items: check if ID exists in inventory
          if (!inventoryIDSet.has(invItem.id)) {
            // Workorder lines embed the full item inline, so this is info not error
            lineItemMissing++;
          }
        }
      }
      info.push("Workorder lines: " + lineItemCount + " total, " + lineItemCustom + " custom, " + lineItemMissing + " not in inventory CSV (inline items, expected)");

      // ================================================================
      // 12. SALE FINANCIAL INTEGRITY
      // ================================================================
      _setMigrationStep("Validating sale financials...");
      let saleFinancialIssues = 0;
      for (const sale of sales) {
        const subtotal = Number(sale.subtotal) || 0;
        const discount = Number(sale.discount) || 0;
        const tax = Number(sale.salesTax) || 0;
        const total = Number(sale.total) || 0;
        const captured = Number(sale.amountCaptured) || 0;

        // total should ≈ subtotal - discount + tax (allow 2 cent tolerance for rounding)
        const expectedTotal = subtotal - discount + tax;
        if (Math.abs(total - expectedTotal) > 2) {
          saleFinancialIssues++;
          if (saleFinancialIssues <= 3) warnings.push("Sale " + sale.id + " math: subtotal(" + subtotal + ") - discount(" + discount + ") + tax(" + tax + ") = " + expectedTotal + " but total = " + total);
        }

        // paymentComplete should match captured ≥ total
        if (sale.paymentComplete === "true" && captured < total && total > 0) {
          warnings.push("Sale " + sale.id + ": marked complete but captured(" + captured + ") < total(" + total + ")");
        }

      }
      if (saleFinancialIssues === 0) info.push("Sale financials: all " + sales.length + " sales check out");
      else if (saleFinancialIssues > 6) warnings.push("...and " + (saleFinancialIssues - 6) + " more sale financial issues");

      // ================================================================
      // 12b. SALE → TRANSACTION (transactionIDs reference check)
      // ================================================================
      _setMigrationStep("Validating sale → transaction...");
      let saleTxnMissing = 0;
      let saleTxnLinks = 0;
      for (const sale of sales) {
        let txnIDs = [];
        try { txnIDs = JSON.parse(sale.transactionIDs || "[]"); } catch (e) { errors.push("Sale " + sale.id + ": invalid transactionIDs JSON"); continue; }
        if (!Array.isArray(txnIDs)) { errors.push("Sale " + sale.id + ": transactionIDs is not an array"); continue; }
        for (const txnID of txnIDs) {
          saleTxnLinks++;
          if (!transactionIDSet.has(txnID)) saleTxnMissing++;
        }
      }
      if (saleTxnMissing > 0) errors.push("Sale → Transaction: " + saleTxnMissing + "/" + saleTxnLinks + " transactionIDs reference missing transactions");
      else info.push("Sale → Transaction: all " + saleTxnLinks + " links OK");

      // ================================================================
      // 12c. TRANSACTION → SALE (saleID back-reference check)
      // ================================================================
      _setMigrationStep("Validating transaction → sale...");
      let txnSaleMissing = 0;
      for (const txn of transactions) {
        if (!txn.saleID) { errors.push("Transaction " + txn.id + ": empty saleID"); continue; }
        if (!saleIDSet.has(txn.saleID)) txnSaleMissing++;
      }
      if (txnSaleMissing > 0) warnings.push("Transaction → Sale: " + txnSaleMissing + "/" + transactions.length + " transactions reference sales not in export (may be outside 50-WO window)");
      else info.push("Transaction → Sale: all " + transactions.length + " OK");

      // ================================================================
      // 13. WORKORDER TIMESTAMP SANITY
      // ================================================================
      _setMigrationStep("Validating workorder timestamps...");
      let woTimestampIssues = 0;
      for (const wo of workorders) {
        const started = Number(wo.startedOnMillis) || 0;
        const finished = Number(wo.finishedOnMillis) || 0;
        const paid = Number(wo.paidOnMillis) || 0;
        if (!started) { woTimestampIssues++; continue; }
        if (finished && finished < started) {
          woTimestampIssues++;
          if (woTimestampIssues <= 3) warnings.push("Workorder " + wo.id + ": finished(" + new Date(finished).toLocaleDateString() + ") before started(" + new Date(started).toLocaleDateString() + ")");
        }
        if (paid && started && paid < started) {
          woTimestampIssues++;
          if (woTimestampIssues <= 3) warnings.push("Workorder " + wo.id + ": paid before started");
        }
      }
      if (woTimestampIssues === 0) info.push("Workorder timestamps: all " + workorders.length + " valid");
      else warnings.push("Workorder timestamps: " + woTimestampIssues + " issues total");

      // ================================================================
      // 14. BIDIRECTIONAL SALE ↔ WORKORDER CONSISTENCY
      // ================================================================
      _setMigrationStep("Checking sale ↔ workorder bidirectional links...");
      let biDirIssues = 0;
      for (const wo of workorders) {
        if (!wo.saleID && !wo._lsSaleID) continue;
        // Find the sale this WO claims to be linked to
        const linkedSale = sales.find(s => s.id === wo.saleID || s.lightspeed_id === wo._lsSaleID);
        if (!linkedSale) continue; // Already caught in check 4
        // Does the sale's workorderIDs include this WO?
        let saleWoIDs = [];
        try { saleWoIDs = JSON.parse(linkedSale.workorderIDs || "[]"); } catch (e) { continue; }
        if (!saleWoIDs.includes(wo.id)) {
          biDirIssues++;
          if (biDirIssues <= 3) warnings.push("Bidirectional: WO " + wo.id + " links to sale " + (wo.saleID || wo._lsSaleID) + " but sale doesn't list WO in workorderIDs");
        }
      }
      if (biDirIssues === 0) info.push("Sale ↔ Workorder bidirectional: all consistent");
      else if (biDirIssues > 3) warnings.push("...and " + (biDirIssues - 3) + " more bidirectional issues");

      // ================================================================
      // 15. CUSTOMER DATA QUALITY
      // ================================================================
      _setMigrationStep("Checking customer data quality...");
      let custNoName = 0;
      let custNoContact = 0;
      for (const c of customers) {
        if (!c.first && !c.last) custNoName++;
        if (!c.customerCell && !c.customerLandline && !c.email) custNoContact++;
      }
      if (custNoName > 0) warnings.push("Customer quality: " + custNoName + "/" + customers.length + " customers with no name");
      if (custNoContact > 0) warnings.push("Customer quality: " + custNoContact + "/" + customers.length + " customers with no phone or email");
      if (custNoName === 0 && custNoContact === 0) info.push("Customer quality: all have name + contact info");

      // ================================================================
      // 16. EMPLOYEE SKIPPED CHECK (Fritz, Support User, Office User)
      // ================================================================
      for (const emp of employees) {
        const name = ((emp.first || "") + " " + (emp.last || "")).trim().toLowerCase();
        if (name === "support user" || name === "office user") errors.push("Employee: system account \"" + name + "\" was not filtered out");
        if (emp.lightspeed_id === "1") errors.push("Employee: Fritz (LS ID 1) was not filtered out");
      }

      // ================================================================
      // 17. INVENTORY PRICE SANITY
      // ================================================================
      let invZeroPrice = 0;
      let invNegPrice = 0;
      for (const item of inventory) {
        const price = Number(item.price) || 0;
        if (price === 0) invZeroPrice++;
        if (price < 0) invNegPrice++;
      }
      if (invNegPrice > 0) errors.push("Inventory: " + invNegPrice + " items with negative price");
      if (invZeroPrice > 0) warnings.push("Inventory: " + invZeroPrice + "/" + inventory.length + " items with zero price");
      if (invNegPrice === 0 && invZeroPrice === 0) info.push("Inventory prices: all " + inventory.length + " positive");

      // ================================================================
      // REPORT
      // ================================================================
      _setMigrationStep("Validation complete");
      console.log("\n========================================");
      console.log("  IMPORT CSV VALIDATION REPORT");
      console.log("========================================\n");

      if (errors.length > 0) {
        console.log("ERRORS (" + errors.length + "):");
        for (const e of errors) console.log("  [ERROR] " + e);
        console.log("");
      }
      if (warnings.length > 0) {
        console.log("WARNINGS (" + warnings.length + "):");
        for (const w of warnings) console.log("  [WARN]  " + w);
        console.log("");
      }
      console.log("INFO (" + info.length + "):");
      for (const i of info) console.log("  [OK]    " + i);
      console.log("\n========================================");
      console.log("  " + errors.length + " errors, " + warnings.length + " warnings, " + info.length + " passed");
      console.log("========================================\n");

      const resultSummary = errors.length + " errors, " + warnings.length + " warnings, " + info.length + " checks passed";
      _setLsResult((errors.length > 0 ? "FAIL: " : "PASS: ") + resultSummary);

    } catch (e) {
      if (e.name === "AbortError") {
        _setMigrationStep("");
        _setLsResult("Folder selection cancelled");
      } else {
        console.error("[Validate] Error:", e);
        _setMigrationStep("Error");
        _setLsResult("Validation error: " + e.message);
      }
    }
    _setDevMigrating(false);
  }

  async function handleDevUploadMigration() {
    if (!window.confirm("This will CLEAR all collections and upload 20 most recent workorders + all associated data to the database. Continue?")) return;
    _setDevMigrating(true);
    _setMigrationStep("Loading & mapping CSVs...");
    _setMigrationProgress({ done: 0, total: 0 });
    _setLsResult("");
    const migrationStart = Date.now();

    try {
      // Invalidate cached CSV data so fresh files are always used
      _lsCsvData = null;

      // Clear existing collections before writing
      _setMigrationStep("Clearing collections...");
      console.log("[Dev Upload] Clearing collections...");
      await Promise.all([
        dbClearCollection("open-workorders"),
        dbClearCollection("completed-workorders"),
        dbClearCollection("customers"),
        dbClearCollection("completed-sales"),
        dbClearCollection("active-sales"),
        dbClearCollection("inventory"),
        dbClearCollection("punches"),
        dbClearCollection("transactions"),
      ]);
      console.log("[Dev Upload] Collections cleared.");

      // Extract statuses first so the mapping resolves status IDs correctly
      const settings = cloneDeep(useSettingsStore.getState().settings || {});
      _setMigrationStep("Extracting statuses...");
      console.log("[Dev Upload] Extracting statuses...");
      const statusesText = await fetch("/import_data/statuses.csv").then(r => r.text());
      const mergedStatuses = mapStatuses(statusesText);
      settings.statuses = mergedStatuses;
      await dbSaveSettings(settings);
      useSettingsStore.getState().setSettings(settings);

      // Load & map all CSV data with correct statuses
      _setMigrationStep("Loading & mapping CSVs...");
      console.log("[Dev Upload] Loading & mapping CSVs...");
      _lsCsvData = null;
      const freshData = await loadAndCacheLightspeedData();

      // Pick 20 most recent workorders
      const sorted = [...freshData.workorders]
        .filter(wo => wo.startedOnMillis)
        .sort((a, b) => b.startedOnMillis - a.startedOnMillis);
      const selectedWOs = sorted.slice(0, 20);
      console.log("[Dev Upload] Selected " + selectedWOs.length + " most recent workorders.");

      // Collect referenced IDs from those 20 workorders
      const customerIDSet = new Set();
      const saleIDSet = new Set();
      for (const wo of selectedWOs) {
        if (wo.customerID) customerIDSet.add(wo.customerID);
        if (wo.saleID) saleIDSet.add(wo.saleID);
      }

      // Filter associated data
      const filteredCustomers = freshData.customers.filter(c => customerIDSet.has(c.id));
      const filteredSales = freshData.sales.filter(s => saleIDSet.has(s.id));
      const filteredSaleIDSet = new Set(filteredSales.map(s => s.id));
      const filteredTransactions = freshData.transactions.filter(t => filteredSaleIDSet.has(t.saleID));

      // Build inventory (same as full migration)
      const invCsvText = await fetch("/lightspeed/inventory.csv").then(r => r.text());
      const invPriceMap = {};
      const stripDollar = (val) => (val || "").replace(/[$,]/g, "");
      for (const invRow of parseCSV(invCsvText)) {
        const desc = (invRow["Description"] || "").toLowerCase().trim();
        if (desc) invPriceMap[desc] = stripDollar(invRow["Price"]);
      }
      const itemRows = parseCSV(freshData.itemsText);
      const activeItems = itemRows.filter(row => row.archived !== "true" && row.description);
      const mappedItems = activeItems.map(item => {
        const isLabor = (item.description || "").toLowerCase().includes("labor");
        const descKey = (item.description || "").toLowerCase().trim();
        const retailPrice = invPriceMap[descKey];
        return {
          id: generateEAN13Barcode(),
          formalName: item.description || "",
          informalName: "",
          brand: "",
          price: retailPrice ? dollarsToCents(retailPrice) : dollarsToCents(item.defaultCost),
          salePrice: 0,
          cost: dollarsToCents(item.avgCost || item.defaultCost),
          category: isLabor ? "Labor" : "Item",
          primaryBarcode: normalizeBarcode(item.upc) || normalizeBarcode(item.ean) || generateEAN13Barcode(),
          barcodes: [normalizeBarcode(item.upc), normalizeBarcode(item.ean)].filter(Boolean),
          minutes: 0,
          customPart: false,
          customLabor: false,
        };
      });
      const pricedItems = mappedItems.filter(item => item.price > 0);

      // Map employees
      const empCsvText = await fetch("/lightspeed/employees.csv").then(r => r.ok ? r.text() : "").catch(() => "");
      const empHoursCsvText = await fetch("/lightspeed/employeeHours.csv").then(r => r.ok ? r.text() : "").catch(() => "");
      let employeeCount = 0;
      let punchCount = 0;

      console.log("[Dev Upload] Filtered: " + selectedWOs.length + " WOs, " + filteredCustomers.length + " customers, " + filteredSales.length + " sales, " + filteredTransactions.length + " transactions, " + pricedItems.length + " inventory.");

      // Save customers
      _setMigrationStep("Saving customers...");
      console.log("[Dev Upload] Saving " + filteredCustomers.length + " customers...");
      _setMigrationProgress({ done: 0, total: filteredCustomers.length });
      await dbBatchWrite(filteredCustomers, "customers", (done) => {
        _setMigrationProgress({ done, total: filteredCustomers.length });
      });
      console.log("[Dev Upload] Customers done.");

      // Save inventory
      _setMigrationStep("Saving inventory...");
      console.log("[Dev Upload] Saving " + pricedItems.length + " inventory items...");
      _setMigrationProgress({ done: 0, total: pricedItems.length });
      await dbBatchWrite(pricedItems, "inventory", (done) => {
        _setMigrationProgress({ done, total: pricedItems.length });
      });
      console.log("[Dev Upload] Inventory done.");

      // Route & save workorders (same logic as full migration)
      _setMigrationStep("Saving workorders...");
      const statusByLabel = {};
      for (const s of (settings.statuses || [])) statusByLabel[s.label.toLowerCase()] = s;
      const doneAndPaidID = statusByLabel["finished & paid"]?.id;

      const openWorkorders = selectedWOs.filter(wo => wo.status !== doneAndPaidID);
      const completedWorkorders = selectedWOs.filter(wo => wo.status === doneAndPaidID);
      const allWOs = [...openWorkorders, ...completedWorkorders];
      console.log("[Dev Upload] Saving " + openWorkorders.length + " open WOs + " + completedWorkorders.length + " completed WOs...");
      _setMigrationProgress({ done: 0, total: allWOs.length });
      let woDone = 0;
      await dbBatchWrite(openWorkorders, "open-workorders", (done) => {
        woDone = done;
        _setMigrationProgress({ done: woDone, total: allWOs.length });
      });
      await dbBatchWrite(completedWorkorders, "completed-workorders", (done) => {
        _setMigrationProgress({ done: woDone + done, total: allWOs.length });
      });
      console.log("[Dev Upload] Workorders done.");

      // Route & save sales (same logic as full migration)
      _setMigrationStep("Saving sales...");
      const completedSales = filteredSales.filter(s => s.paymentComplete);
      const linkedIncompleteSales = filteredSales.filter(s => !s.paymentComplete && s.workorderIDs && s.workorderIDs.length > 0);
      console.log("[Dev Upload] Saving " + completedSales.length + " completed sales + " + linkedIncompleteSales.length + " linked incomplete sales...");
      _setMigrationProgress({ done: 0, total: completedSales.length + linkedIncompleteSales.length });
      let salesDone = 0;
      await dbBatchWrite(completedSales, "completed-sales", (done) => {
        salesDone = done;
        _setMigrationProgress({ done: salesDone, total: completedSales.length + linkedIncompleteSales.length });
      });
      if (linkedIncompleteSales.length > 0) {
        await dbBatchWrite(linkedIncompleteSales, "active-sales", (done) => {
          _setMigrationProgress({ done: salesDone + done, total: completedSales.length + linkedIncompleteSales.length });
        });
      }
      console.log("[Dev Upload] Sales done.");

      // Save transactions
      _setMigrationStep("Saving transactions...");
      console.log("[Dev Upload] Saving " + filteredTransactions.length + " transactions...");
      _setMigrationProgress({ done: 0, total: filteredTransactions.length });
      await dbBatchWrite(filteredTransactions, "transactions", (done) => {
        _setMigrationProgress({ done, total: filteredTransactions.length });
      });
      console.log("[Dev Upload] Transactions done.");

      // Map & save employees and punch history
      if (empCsvText) {
        _setMigrationStep("Mapping employees...");
        const { users: newUsers, employeeIDMap } = mapEmployees(empCsvText);
        employeeCount = newUsers.length;
        console.log("[Dev Upload] Mapped " + newUsers.length + " employees.");

        const updatedSettings = cloneDeep(useSettingsStore.getState().settings || {});
        if (!updatedSettings.users) updatedSettings.users = [];
        const existingByLsID = {};
        updatedSettings.users.forEach(function (u) { if (u.lightspeed_id) existingByLsID[u.lightspeed_id] = u; });
        for (const u of newUsers) {
          if (!existingByLsID[u.lightspeed_id]) updatedSettings.users.push(u);
        }
        await dbSaveSettings(updatedSettings);
        useSettingsStore.getState().setSettings(updatedSettings);
        console.log("[Dev Upload] Users saved to settings (" + updatedSettings.users.length + " total).");

        if (empHoursCsvText) {
          _setMigrationStep("Saving punch history...");
          const punches = mapPunchHistory(empHoursCsvText, employeeIDMap);
          punchCount = punches.length;
          console.log("[Dev Upload] Saving " + punches.length + " punch records...");
          _setMigrationProgress({ done: 0, total: punches.length });
          await dbBatchWrite(punches, "punches", (done, total) => {
            _setMigrationProgress({ done, total });
          });
          console.log("[Dev Upload] Punch history done.");
        }
      }

      // Update local store with open workorders
      useOpenWorkordersStore.getState().setOpenWorkorders(openWorkorders);

      // Summary
      const elapsed = ((Date.now() - migrationStart) / 1000).toFixed(1);
      const summary = "Dev Upload Complete in " + elapsed + "s: " +
        filteredCustomers.length + " customers, " +
        pricedItems.length + " inventory, " +
        openWorkorders.length + " open WOs, " +
        completedWorkorders.length + " completed WOs, " +
        completedSales.length + " completed sales, " +
        linkedIncompleteSales.length + " active sales, " +
        filteredTransactions.length + " transactions, " +
        employeeCount + " employees, " +
        punchCount + " punches";
      console.log("[Dev Upload] " + summary);
      _setMigrationStep("Complete!");
      _setMigrationProgress({ done: 0, total: 0 });
      _setLsResult(summary);
    } catch (e) {
      console.error("[Dev Upload] Error:", e);
      _setMigrationStep("Error");
      _setLsResult("Dev Upload Error: " + e.message);
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
            {sDevMigrating ? "Migrating..." : "Dev Migration (20 WOs)"}
          </Text>
          <Text style={{ fontSize: 11, color: gray(0.5), marginTop: 3 }}>
            Full mapping, 50 most recent WOs + dependencies, 7 CSVs
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
        {/* --- Validate Export --- */}
        <TouchableOpacity
          onPress={handleValidateExport}
          disabled={sLookupLoading || sMigrating || sDevMigrating}
          style={{
            width: 300,
            paddingVertical: 14,
            borderRadius: 10,
            borderWidth: 2,
            borderColor: C.blue,
            backgroundColor: C.listItemWhite,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 10,
            opacity: sLookupLoading || sMigrating || sDevMigrating ? 0.5 : 1,
          }}
        >
          <Text style={{ fontSize: 15, color: C.blue, fontWeight: "700" }}>
            Validate Export CSVs
          </Text>
          <Text style={{ fontSize: 11, color: gray(0.5), marginTop: 3 }}>
            Cross-check all 7 _import_ files
          </Text>
        </TouchableOpacity>
        {/* --- Dev Upload Migration --- */}
        <TouchableOpacity
          onPress={handleDevUploadMigration}
          disabled={sLookupLoading || sMigrating || sDevMigrating}
          style={{
            width: 300,
            paddingVertical: 14,
            borderRadius: 10,
            borderWidth: 2,
            borderColor: "rgb(115, 83, 173)",
            backgroundColor: sDevMigrating ? gray(0.85) : C.listItemWhite,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 10,
            opacity: sLookupLoading || sMigrating || sDevMigrating ? 0.5 : 1,
          }}
        >
          <Text style={{ fontSize: 15, color: "rgb(115, 83, 173)", fontWeight: "700" }}>
            {sDevMigrating ? "Uploading..." : "Dev Upload Migration"}
          </Text>
          <Text style={{ fontSize: 11, color: gray(0.5), marginTop: 3 }}>
            Clear DB + upload 20 most recent WOs + all dependencies
          </Text>
        </TouchableOpacity>
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
                dbClearCollection("inventory"),
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
            opacity: !sLsConnected ? 0.5 : sLsImporting === "all-csvs" ? 0.5 : 1,
          }}
        >
          <Text style={{ fontSize: 15, color: C.text, fontWeight: "700" }}>
            {sLsImporting === "all-csvs" ? "Exporting..." : "Export All CSVs"}
          </Text>
          <Text style={{ fontSize: 11, color: gray(0.5), marginTop: 3 }}>
            All {CSV_EXPORT_TYPES.length} exports, sequentially
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
                  opacity: !sLsConnected ? 0.5 : sLsImporting === btn.type ? 0.5 : 1,
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

        {/***************** dev tools **************************/}
        <View
          style={{
            width: "100%",
            marginTop: 30,
            paddingTop: 20,
            borderTopWidth: 1,
            borderTopColor: C.buttonLightGreenOutline,
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "700", color: gray(0.5), marginBottom: 10 }}>
            Dev Tools
          </Text>
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
              marginTop: 10,
            }}
          >
            <Text style={{ fontSize: 13, color: C.text, fontWeight: "700" }}>
              Inject Raw Settings
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={async () => {
              const settings = useSettingsStore.getState().getSettings();
              await dbSaveSettings(settings);
              alert("Settings saved to Firestore.");
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
              marginTop: 10,
            }}
          >
            <Text style={{ fontSize: 13, color: C.text, fontWeight: "700" }}>
              Save Settings
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={async () => {
              const liveSettings = useSettingsStore.getState().getSettings();
              const defaults = cloneDeep(SETTINGS_OBJ);
              const merged = { ...defaults, ...liveSettings };
              await dbSaveSettings(merged);
              useSettingsStore.getState().setSettings(merged);
              alert("Settings merged and saved. New fields from defaults injected, existing values preserved.");
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
              marginTop: 10,
            }}
          >
            <Text style={{ fontSize: 13, color: C.text, fontWeight: "700" }}>
              Merge Settings
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={async () => {
              const { dbGetSettings } = await import("../../../../db_calls_wrapper");
              const { tenantID, storeID } = useSettingsStore.getState().getSettings();
              const settings = await dbGetSettings(tenantID, storeID);
              if (settings) {
                useSettingsStore.getState().setSettings(settings);
                alert("Settings rehydrated from Firestore.");
              } else {
                alert("No settings found in Firestore.");
              }
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
              marginTop: 10,
            }}
          >
            <Text style={{ fontSize: 13, color: C.text, fontWeight: "700" }}>
              Rehydrate Settings
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              let printObj = {
                id: crypto.randomUUID(),
                receiptType: "Workorder",
                barcode: "100000000001",
                workorderNumber: "WO-10001",
                customerFirstName: "John",
                customerLastName: "Smith",
                customerCell: "239-555-1234",
                customerEmail: "john.smith@email.com",
                customerAddress: "123 Main St, Bonita Springs, FL 34135",
                brand: "Trek",
                description: "Domane SL 5",
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
              dbSavePrintObj(printObj, localStorageWrapper.getItem("selectedPrinterID") || "");
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
                let pairCount = 3 + Math.floor(Math.random() * 5);
                let windowStart = 600;
                let windowEnd = 1140;
                let slotSize = Math.floor((windowEnd - windowStart) / pairCount);

                for (let i = 0; i < pairCount; i++) {
                  let slotStart = windowStart + (i * slotSize);
                  let slotEnd = slotStart + slotSize;
                  let inMinutes = slotStart + Math.floor(Math.random() * (slotSize * 0.5));
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
                    id: crypto.randomUUID(),
                    millis: inMillis,
                    option: "in",
                  });
                  allPunches.push({
                    ...TIME_PUNCH_PROTO,
                    userID,
                    id: crypto.randomUUID(),
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
                  id: generateEAN13Barcode(),
                  millis: Date.now(),
                  subtotal: totals.runningSubtotal,
                  discount: totals.runningDiscount,
                  tax: totals.runningTax,
                  total: totals.finalTotal,
                  amountCaptured: totals.finalTotal,
                  transactions: [],
                  refunds: [],
                  workorderID: workorder.id,
                };
                const cardAmount = Math.round(totals.finalTotal * 0.6);
                const cashAmount = totals.finalTotal - cardAmount;
                const fakeCardPayment = {
                  amountCaptured: cardAmount,
                  amountTendered: cardAmount,
                  type: "payment",
                  method: "card",
                  last4: "4242",
                  cardType: "Visa",
                  brand: "visa",
                  paymentMethod: "card_present",
                  authorizationCode: "A83F72",
                };
                const fakeCashPayment = {
                  amountCaptured: cashAmount,
                  amountTendered: cashAmount + 500,
                  type: "payment",
                  method: "cash",
                };

                const receiptData = printBuilder.sale(fakeSale, [fakeCardPayment, fakeCashPayment], customer, workorder, settings?.salesTaxPercent, _ctx);
                log("SPOOF SALE RECEIPT", JSON.stringify(receiptData, null, 2));

                dbSavePrintObj(receiptData, localStorageWrapper.getItem("selectedPrinterID") || "");

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
              const WO_IDS = ["1000000000245", "1000000000252"];
              try {
                const settings = useSettingsStore.getState().getSettings();
                const { tenantID, storeID } = settings;
                if (!tenantID || !storeID) { log("Revert: missing tenantID/storeID"); return; }

                const basePath = `tenants/${tenantID}/stores/${storeID}`;
                let results = [];

                for (let WO_ID of WO_IDS) {
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
                    results.push(WO_ID + ": not found");
                    continue;
                  }

                  let saleIDs = [wo.activeSaleID, wo.saleID].filter(Boolean);
                  let uniqueSaleIDs = [...new Set(saleIDs)];

                  for (let sid of uniqueSaleIDs) {
                    await firestoreDelete(`${basePath}/active-sales/${sid}`).catch(() => {});
                    await firestoreDelete(`${basePath}/completed-sales/${sid}`).catch(() => {});
                  }

                  wo.paymentComplete = false;
                  wo.activeSaleID = "";
                  wo.saleID = "";
                  wo.endedOnMillis = "";
                  wo.status = "finished";
                  wo.changeLog = (wo.changeLog || []).filter((e) => e.field !== "payment");

                  await firestoreWrite(openPath, wo);

                  if (wasCompleted) {
                    await firestoreDelete(`${basePath}/completed-workorders/${WO_ID}`);
                  }

                  useOpenWorkordersStore.getState().setWorkorder(wo, false);
                  results.push(WO_ID + ": reverted");
                }

                log("Revert complete:", results);
                useAlertScreenStore.getState().setValues({ title: "Reverted", message: results.join("\n"), btn1Text: "OK", handleBtn1Press: () => useAlertScreenStore.getState().setShowAlert(false), canExitOnOuterClick: true });
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
              Revert Sales (245 + 252)
            </Text>
          </TouchableOpacity>
        </View>
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
      id: crypto.randomUUID(),
      label: "",
      content: "",
      type: "",
      order: 0,
      showInChat: true,
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
      order: templateObj.order || 0,
      showInChat: templateObj.showInChat !== false,
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
                          icon={ICONS.trash}
                        />
                      </Tooltip>
                    )}
                  </View>

                  {/* Order + Show in Chat row */}
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                    <Text style={{ fontSize: 13, color: gray(0.5), marginRight: 6 }}>Order</Text>
                    <DropdownMenu
                      dataArr={(() => {
                        let usedOrders = new Set(savedTemplates.filter(t => t.id !== templateObj.id && t.order > 0).map(t => t.order));
                        let available = [{ label: "---", value: 0 }];
                        for (let i = 1; i <= savedTemplates.length; i++) {
                          if (!usedOrders.has(i)) available.push({ label: String(i), value: i });
                        }
                        return available;
                      })()}
                      onSelect={(item) => handleFieldChange(templateObj, "order", item.value)}
                      buttonText={templateObj.order > 0 ? String(templateObj.order) : "---"}
                      buttonStyle={{ paddingVertical: 4, paddingHorizontal: 8, minWidth: 50 }}
                      buttonTextStyle={{ fontSize: 13 }}
                    />
                    <View style={{ marginLeft: 20 }}>
                      <CheckBox_
                        text="Show in Chat"
                        isChecked={templateObj.showInChat !== false}
                        onCheck={() => handleFieldChange(templateObj, "showInChat", templateObj.showInChat === false)}
                      />
                    </View>
                  </View>

                  {/* Message body */}
                  <TextInput_
                    multiline={true}
                    numberOfLines={6}
                    onChangeText={(val) =>
                      handleFieldChange(templateObj, "content", val)
                    }
                    onFocus={() => _setSelectedTemplateId(templateObj.id)}
                    onSelectionChange={(event) => {
                      let { start } = event.nativeEvent.selection;
                      cursorPositionRefs.current[templateObj.id] = start;
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
      id: crypto.randomUUID(),
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
                          icon={ICONS.trash}
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
              icon={ICONS.trash}
              iconSize={14}
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
  "open-workorders",
  "inventory",
  "settings",
  "active-sales",
  "punch_clock",
  "punches",
];

const MILLIS_IN_WEEK = 7 * 24 * 60 * 60 * 1000;

function BackupRecoveryComponent() {
  const tenantID = useSettingsStore((state) => state.settings?.tenantID);
  const storeID = useSettingsStore((state) => state.settings?.storeID);

  const [sLogs, _setLogs] = useState([]);
  const [sLoading, _setLoading] = useState(false);
  const [sRehydrating, _setRehydrating] = useState(false);
  const [sConfirmStep, _setConfirmStep] = useState(0); // 0=idle, 1=first confirm, 2=second confirm
  const [sRehydrateResult, _setRehydrateResult] = useState(null);
  const [sWeeksLoaded, _setWeeksLoaded] = useState(1);
  const [sArchiving, _setArchiving] = useState(false);
  const [sArchiveResult, _setArchiveResult] = useState(null);

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

  async function handleManualArchive() {
    _setArchiving(true);
    _setArchiveResult(null);
    try {
      const result = await dbManualArchiveAndCleanup();
      _setArchiveResult(result);
    } catch (err) {
      _setArchiveResult({ success: false, error: err.message });
    }
    _setArchiving(false);
  }

  return (
    <BoxContainerOuterComponent>
      {/*** MANUAL BACKUP SECTION ***/}
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
          RUN BACKUP NOW
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: gray(0.5),
            marginBottom: 15,
            alignSelf: "flex-start",
          }}
        >
          Manually runs the full nightly archive process: backs up all collections
          to Cloud Storage, cleans up old media, and cleans up standalone active sales.
        </Text>
        <Button_
          text={sArchiving ? "Archiving..." : "Run Full Backup"}
          onPress={handleManualArchive}
          colorGradientArr={COLOR_GRADIENTS.green}
          buttonStyle={{ borderRadius: 5, paddingHorizontal: 20 }}
          disabled={sArchiving}
          loading={sArchiving}
        />
        {!!sArchiveResult && (
          <View
            style={{
              marginTop: 15,
              padding: 10,
              borderRadius: 8,
              backgroundColor: sArchiveResult.success
                ? "rgba(0,180,0,0.08)"
                : "rgba(220,0,0,0.08)",
              width: "100%",
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "700",
                color: sArchiveResult.success ? C.green : C.red,
                marginBottom: 5,
              }}
            >
              {sArchiveResult.success ? "Backup Complete" : "Backup Failed"}
            </Text>
            {sArchiveResult.success &&
              sArchiveResult.archive &&
              Object.entries(sArchiveResult.archive).map(([name, r]) => (
                <Text
                  key={name}
                  style={{ fontSize: 12, color: C.text, marginBottom: 2 }}
                >
                  {name}: {r.success ? r.docCount + " docs archived" : "FAILED — " + r.error}
                </Text>
              ))}
            {sArchiveResult.success && sArchiveResult.mediaCleanup && (
              <Text style={{ fontSize: 12, color: C.text, marginTop: 2 }}>
                Media cleanup: {sArchiveResult.mediaCleanup.workordersProcessed} workorders,{" "}
                {sArchiveResult.mediaCleanup.mediaFilesDeleted} files deleted
              </Text>
            )}
            {!sArchiveResult.success && sArchiveResult.error && (
              <Text style={{ fontSize: 12, color: C.red }}>
                {sArchiveResult.error}
              </Text>
            )}
          </View>
        )}
      </BoxContainerInnerComponent>

      <View style={{ height: 20 }} />
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

      {/*** SETTINGS CSV EXPORT / IMPORT ***/}
      <View style={{ height: 20 }} />
      <SettingsCSVComponent />
    </BoxContainerOuterComponent>
  );
}

function SettingsCSVComponent() {
  const zSettingsObj = useSettingsStore((state) => state.settings);
  const [sUploading, _setUploading] = useState(false);
  const [sUploadResult, _setUploadResult] = useState(null);
  const fileInputRef = useRef(null);

  function handleDownloadCSV() {
    if (!zSettingsObj) return;
    const rows = [["field", "value"]];
    Object.keys(zSettingsObj).forEach((key) => {
      const val = zSettingsObj[key];
      const serialized =
        typeof val === "string" ? val : JSON.stringify(val);
      // Escape double-quotes for CSV
      const escaped = serialized.replace(/"/g, '""');
      rows.push([key, '"' + escaped + '"']);
    });
    const csvContent = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "settings.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleRehydrateCSV(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    _setUploading(true);
    _setUploadResult(null);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target.result;
        const parsed = parseSettingsCSV(text);
        // Write each field back to settings
        for (const [key, rawVal] of Object.entries(parsed)) {
          let val;
          try {
            val = JSON.parse(rawVal);
          } catch {
            val = rawVal; // plain string
          }
          useSettingsStore.getState().setField(key, val);
        }
        _setUploadResult({ success: true, fieldCount: Object.keys(parsed).length });
      } catch (err) {
        _setUploadResult({ success: false, error: err.message });
      }
      _setUploading(false);
    };
    reader.onerror = () => {
      _setUploadResult({ success: false, error: "Failed to read file" });
      _setUploading(false);
    };
    reader.readAsText(file);
    // Reset so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
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
        SETTINGS CSV
      </Text>
      <Text
        style={{
          fontSize: 12,
          color: gray(0.5),
          marginBottom: 15,
          alignSelf: "flex-start",
        }}
      >
        Download the current settings as a CSV file, or restore settings from a
        previously downloaded CSV.
      </Text>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <Button_
          text="Download Settings CSV"
          onPress={handleDownloadCSV}
          colorGradientArr={COLOR_GRADIENTS.blue}
          buttonStyle={{ borderRadius: 5, paddingHorizontal: 20 }}
        />
        <Button_
          text={sUploading ? "Importing..." : "Rehydrate from CSV"}
          onPress={() => fileInputRef.current?.click()}
          colorGradientArr={COLOR_GRADIENTS.green}
          buttonStyle={{ borderRadius: 5, paddingHorizontal: 20 }}
          disabled={sUploading}
          loading={sUploading}
        />
      </View>

      {/* Hidden file input for CSV upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        style={{ display: "none" }}
        onChange={handleRehydrateCSV}
      />

      {!!sUploadResult && (
        <View
          style={{
            marginTop: 15,
            padding: 10,
            borderRadius: 8,
            backgroundColor: sUploadResult.success
              ? "rgba(0,180,0,0.08)"
              : "rgba(220,0,0,0.08)",
            width: "100%",
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: "700",
              color: sUploadResult.success ? C.green : C.red,
            }}
          >
            {sUploadResult.success
              ? "Settings restored — " + sUploadResult.fieldCount + " fields updated"
              : "Import Failed — " + sUploadResult.error}
          </Text>
        </View>
      )}
    </BoxContainerInnerComponent>
  );
}

/**
 * Parse a settings CSV (field,value) back into an object.
 * Handles quoted values with embedded commas and double-quote escaping.
 */
function parseSettingsCSV(text) {
  const lines = text.split("\n");
  const result = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const commaIdx = line.indexOf(",");
    if (commaIdx === -1) continue;
    const key = line.substring(0, commaIdx);
    let val = line.substring(commaIdx + 1);
    // Strip surrounding quotes and unescape doubled quotes
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1).replace(/""/g, '"');
    }
    result[key] = val;
  }
  return result;
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
        category: "Item",
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
        category: "Item",
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
        category: "Item",
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
        category: "Item",
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
  brand: "Sun",
  workorderNumber: "82860",
  customerLast: "Hieb",
  color1: { backgroundColor: "blue", label: "Blue", textColor: "white" },
  customerID: "011460657456",
  customerFirst: "Fritz",
  startedOnMillis: 1774312878862,
};

////////////////////////////////////////////////////////////////////////////////
// Stand Buttons Search Panel (left side of modal)
////////////////////////////////////////////////////////////////////////////////

const StandButtonsSearchPanel = ({ zSettingsObj, handleSettingsFieldChange }) => {
  const [sSearchString, _setSearchString] = useState("");
  const [sSearchResults, _setSearchResults] = useState([]);
  const [sSelectedItems, _setSelectedItems] = useState([]);

  function handleSearch(val) {
    _setSearchString(val);
    if (!val || val.length < 2) {
      _setSearchResults([]);
      return;
    }
    workerSearchInventory(val, (results) => _setSearchResults(results));
  }

  function toggleItem(item) {
    _setSelectedItems((prev) => {
      let exists = prev.find((o) => o.id === item.id);
      if (exists) return prev.filter((o) => o.id !== item.id);
      return [...prev, item];
    });
  }

  function handleAddSelected() {
    if (sSelectedItems.length === 0) return;
    let rows = intakeButtonsToRows(zSettingsObj?.intakeQuickButtons || []);

    let lastRowIdx = rows.length > 0 ? rows.length - 1 : 0;
    let newButtons = sSelectedItems.map((item) => ({
      ...cloneDeep(INTAKE_QUICK_BUTTON_PROTO),
      id: crypto.randomUUID(),
      label: item.informalName || item.formalName || "",
      inventoryItemID: item.id,
      row: lastRowIdx,
    }));

    if (rows.length === 0) {
      rows.push(newButtons);
    } else {
      rows[rows.length - 1] = [...rows[rows.length - 1], ...newButtons];
    }
    handleSettingsFieldChange("intakeQuickButtons", intakeRowsToFlat(rows));
    _setSelectedItems([]);
  }

  return (
    <div
      style={{
        width: "35%",
        minWidth: 280,
        maxWidth: 420,
        borderRightWidth: 1,
        borderRightStyle: "solid",
        borderRightColor: gray(0.15),
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}
    >
      {/* Search header */}
      <View style={{ padding: 12, paddingBottom: 8 }}>
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
            borderColor: C.buttonLightGreenOutline,
            borderWidth: 1,
            borderRadius: 6,
            width: "100%",
            fontSize: 13,
            color: C.text,
            paddingVertical: 6,
            paddingHorizontal: 8,
            outlineWidth: 0,
            outlineStyle: "none",
          }}
          value={sSearchString}
          onChangeText={handleSearch}
          placeholder="Search inventory..."
          placeholderTextColor={gray(0.35)}
        />
      </View>

      {/* Results list */}
      <ScrollView style={{ flex: 1, paddingHorizontal: 12 }}>
        {sSearchResults.slice(0, 50).map((item, idx) => {
          let isSelected = !!sSelectedItems.find((o) => o.id === item.id);
          return (
            <TouchableOpacity
              key={item.id || idx}
              onPress={() => toggleItem(item)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 6,
                paddingHorizontal: 6,
                borderBottomWidth: 1,
                borderBottomColor: gray(0.08),
                backgroundColor: isSelected ? "rgb(230, 245, 235)" : "transparent",
                borderRadius: 4,
              }}
            >
              <CheckBox_
                isChecked={isSelected}
                onCheck={() => toggleItem(item)}
                buttonStyle={{ marginRight: 8 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: C.text }}>
                  {item.informalName || item.formalName || "Unknown"}
                </Text>
                {!!item.brand && (
                  <Text style={{ fontSize: 10, color: gray(0.5) }}>
                    {item.brand}
                  </Text>
                )}
              </View>
              <Text style={{ fontSize: 12, color: C.text }}>
                ${formatCurrencyDisp(item.price || 0)}
              </Text>
            </TouchableOpacity>
          );
        })}
        {sSearchString.length >= 2 && sSearchResults.length === 0 && (
          <Text
            style={{
              fontSize: 12,
              color: gray(0.4),
              textAlign: "center",
              paddingVertical: 20,
            }}
          >
            No results found
          </Text>
        )}
      </ScrollView>

      {/* Add Selected button */}
      {sSelectedItems.length > 0 && (
        <View
          style={{
            padding: 12,
            borderTopWidth: 1,
            borderTopColor: gray(0.15),
            alignItems: "center",
          }}
        >
          <Button_
            text={`Add ${sSelectedItems.length} Item${sSelectedItems.length > 1 ? "s" : ""}`}
            colorGradientArr={COLOR_GRADIENTS.green}
            onPress={handleAddSelected}
            style={{ paddingHorizontal: 20, paddingVertical: 8, width: "100%" }}
          />
        </View>
      )}
    </div>
  );
};

////////////////////////////////////////////////////////////////////////////////
// Stand Buttons Editor Component
////////////////////////////////////////////////////////////////////////////////

const StandButtonsEditorComponent = ({
  zSettingsObj,
  handleSettingsFieldChange,
  _setStandEditButtonObj,
  _setShowStandButtonsModal,
}) => {
  const [sEditMode, _setEditMode] = useState(false);
  const [sDragSource, _setDragSource] = useState(null);
  const [sDragTarget, _setDragTarget] = useState(null);
  const [sNewRowDropTarget, _setNewRowDropTarget] = useState(null);
  const [sSelectedWorkorderID, _setSelectedWorkorderID] = useState(null);
  const [sShowWODropdown, _setShowWODropdown] = useState(false);
  const [sButtonHeight, _setButtonHeight] = useState(40);
  const [sContainerSize, _setContainerSize] = useState({ w: 0, h: 0 });
  const resizeObsRef = useRef(null);
  const containerRefCb = useCallback((node) => {
    if (resizeObsRef.current) resizeObsRef.current.disconnect();
    if (!node) return;
    let obs = new ResizeObserver((entries) => {
      let { width, height } = entries[0].contentRect;
      _setContainerSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    obs.observe(node);
    resizeObsRef.current = obs;
  }, []);

  const zWorkorders = useOpenWorkordersStore((state) => state.workorders);
  const zInventory = useInventoryStore((state) => state.inventoryArr);

  let selectedWorkorder = sSelectedWorkorderID
    ? zWorkorders.find((o) => o.id === sSelectedWorkorderID) || null
    : null;

  let salesTaxPercent = zSettingsObj?.salesTaxPercent || 0;
  let totals = selectedWorkorder?.workorderLines?.length > 0
    ? calculateRunningTotals(selectedWorkorder, salesTaxPercent, [], false, !!selectedWorkorder.taxFree)
    : { finalTotal: 0, runningSubtotal: 0, runningTax: 0, runningQty: 0 };

  let rows = intakeButtonsToRows(zSettingsObj?.intakeQuickButtons || []);
  let allButtons = rows.flat();
  let ROW_HEIGHT = sButtonHeight + 10; // button + 5px padding top + 5px padding bottom
  let btnMargin = 6; // 3px margin on each side of button
  let buttonsPerRow = sContainerSize.w > 0 ? Math.floor(sContainerSize.w / (100 + btnMargin)) : 1;
  let buttonVisualRows = allButtons.length > 0 ? Math.ceil(allButtons.length / buttonsPerRow) : 0;
  let totalRows = sContainerSize.h > 0 ? Math.floor(sContainerSize.h / ROW_HEIGHT) : 0;
  let emptyRowCount = Math.max(0, totalRows - buttonVisualRows);

  function saveRows(updatedRows) {
    let cleaned = updatedRows.filter((row) => row.length > 0);
    handleSettingsFieldChange("intakeQuickButtons", intakeRowsToFlat(cleaned));
  }

  function handleDeleteButton(btnId) {
    saveFlatButtons(allButtons.filter((b) => b.id !== btnId));
  }

  function handleLabelChange(btnId, val) {
    saveFlatButtons(allButtons.map((b) => b.id === btnId ? { ...b, label: val } : b));
  }

  function saveFlatButtons(flat) {
    handleSettingsFieldChange("intakeQuickButtons", flat.map((b) => ({ ...b, row: 0 })));
  }

  function handleReorder(fromRow, fromIdx, toRow, toIdx) {
    if (fromIdx === null || toIdx === null || fromIdx === toIdx) return;
    let flat = [...allButtons];
    let [dragged] = flat.splice(fromIdx, 1);
    flat.splice(toIdx, 0, dragged);
    saveFlatButtons(flat);
  }

  function handleDropToNewRow(slotIdx) {
    if (!sDragSource) return;
    let flat = [...allButtons];
    let [dragged] = flat.splice(sDragSource.btnIdx, 1);
    let insertAt = slotIdx * buttonsPerRow;
    if (insertAt > flat.length) insertAt = flat.length;
    flat.splice(insertAt, 0, dragged);
    saveFlatButtons(flat);
  }

  function handleNewWorkorder() {
    useLoginStore.getState().requireLogin(() => {
      useCurrentCustomerStore.getState().setCustomer(null, false);
      let store = useOpenWorkordersStore.getState();
      store.setWorkorderPreviewID(null);
      let wo = createNewWorkorder({
        startedByFirst: useLoginStore.getState().currentUser?.first,
        startedByLast: useLoginStore.getState().currentUser?.last,
      });
      store.setWorkorder(wo, false);
      _setSelectedWorkorderID(wo.id);
    });
  }

  async function handleQuickButtonPress(btn) {
    if (!selectedWorkorder || !btn.inventoryItemID) return;
    let invItem = (zInventory || []).find((o) => o.id === btn.inventoryItemID);
    if (!invItem) return;
    await dbSaveOpenWorkorder(selectedWorkorder);
    let lines = [...(selectedWorkorder.workorderLines || [])];
    let line = cloneDeep(WORKORDER_ITEM_PROTO);
    line.inventoryItem = invItem;
    line.id = crypto.randomUUID();
    lines.push(line);
    useOpenWorkordersStore.getState().setField("workorderLines", lines, selectedWorkorder.id, true);
  }

  function handleModQty(lineId, direction) {
    if (!selectedWorkorder) return;
    let lines = selectedWorkorder.workorderLines.map((line) => {
      if (line.id !== lineId) return line;
      let newQty = direction === "up" ? line.qty + 1 : Math.max(1, line.qty - 1);
      return { ...line, qty: newQty };
    });
    useOpenWorkordersStore.getState().setField("workorderLines", lines, selectedWorkorder.id, true);
  }

  function handleDropOnRow(targetRowIdx) {
    if (!sDragSource) return;
    if (sDragSource.rowIdx === targetRowIdx) return;
    let updated = rows.map((row) => [...row]);
    let [dragged] = updated[sDragSource.rowIdx].splice(sDragSource.btnIdx, 1);
    // Adjust target index if source row will be removed (empty after splice)
    let adjIdx = targetRowIdx;
    if (updated[sDragSource.rowIdx].length === 0 && targetRowIdx > sDragSource.rowIdx) {
      adjIdx = targetRowIdx - 1;
    }
    updated = updated.filter((row) => row.length > 0);
    updated[adjIdx] = [...updated[adjIdx], dragged];
    saveRows(updated);
  }

  let woLabel = selectedWorkorder
    ? `#${formatWorkorderNumber(selectedWorkorder.workorderNumber)} - ${selectedWorkorder.customerFirst || selectedWorkorder.brand || "(no name)"} ${selectedWorkorder.customerLast || ""}`.trim()
    : "Select Workorder...";

  return (
    <View style={{ flex: 1, width: "100%", padding: 10, alignItems: "center" }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8, width: "70%" }}>
        <Text style={{ flex: 1, fontSize: 12, color: gray(0.45) }}>
          {sEditMode ? "Drag buttons to reorder. Drop onto a row or the bottom slot." : "Tap a button to add items to the workorder."}
        </Text>
        <TouchableOpacity
          onPress={() => { _setEditMode(!sEditMode); _setDragSource(null); _setDragTarget(null); _setNewRowDropTarget(null); }}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 6,
            backgroundColor: sEditMode ? C.green : gray(0.12),
            marginLeft: 8,
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: "600", color: sEditMode ? "white" : C.text }}>
            {sEditMode ? "Done" : "Edit Layout"}
          </Text>
        </TouchableOpacity>
      </View>

      {sEditMode && (
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8, width: "70%" }}>
          <Text style={{ fontSize: 11, color: gray(0.45), marginRight: 8 }}>Button Height: {sButtonHeight}px</Text>
          <input
            type="range"
            min={30}
            max={80}
            value={sButtonHeight}
            onChange={(e) => _setButtonHeight(Number(e.target.value))}
            style={{ flex: 1 }}
          />
        </View>
      )}

      {/* Tablet mock frame */}
      <div
        style={{
          width: "70%",
          flex: 1,
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
        {/* Header row: workorder selector + new button + total */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 8,
            gap: 6,
            position: "relative",
          }}
        >
          {/* Workorder selector */}
          <TouchableOpacity
            onPress={() => _setShowWODropdown(!sShowWODropdown)}
            style={{
              flex: 1,
              height: 36,
              borderWidth: 1,
              borderColor: gray(0.15),
              borderRadius: 6,
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 10,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                color: selectedWorkorder ? C.text : gray(0.35),
                flex: 1,
              }}
              numberOfLines={1}
            >
              {woLabel}
            </Text>
            <Image_ icon={ICONS.downChevron} size={10} />
          </TouchableOpacity>

          {/* New workorder button (icon only) */}
          <TouchableOpacity
            onPress={handleNewWorkorder}
            style={{
              width: 36,
              height: 36,
              borderRadius: 6,
              backgroundColor: C.blue,
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Image_ icon={ICONS.add} size={16} />
          </TouchableOpacity>

          {/* Total price */}
          {selectedWorkorder && (
            <View
              style={{
                height: 36,
                borderRadius: 6,
                backgroundColor: C.green,
                paddingHorizontal: 10,
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Text style={{ fontSize: 13, color: "white", fontWeight: Fonts.weight.textHeavy }}>
                ${formatCurrencyDisp(totals.finalTotal)}
              </Text>
            </View>
          )}

          {/* Workorder dropdown */}
          {sShowWODropdown && (
            <div
              style={{
                position: "absolute",
                top: 40,
                left: 0,
                right: 70,
                maxHeight: 200,
                backgroundColor: "white",
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: gray(0.15),
                borderRadius: 6,
                zIndex: 100,
                overflowY: "auto",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              }}
            >
              {zWorkorders.map((wo) => (
                <TouchableOpacity
                  key={wo.id}
                  onPress={() => {
                    _setSelectedWorkorderID(wo.id);
                    _setShowWODropdown(false);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    padding: 8,
                    borderBottomWidth: 1,
                    borderBottomColor: gray(0.06),
                    backgroundColor: wo.id === sSelectedWorkorderID ? "rgb(230,240,252)" : "white",
                  }}
                >
                  <Text style={{ fontSize: 12, color: C.text }} numberOfLines={1}>
                    #{formatWorkorderNumber(wo.workorderNumber)} - {wo.customerFirst || wo.brand || "(no name)"} {wo.customerLast || ""}
                  </Text>
                </TouchableOpacity>
              ))}
              {zWorkorders.length === 0 && (
                <Text style={{ fontSize: 12, color: gray(0.4), textAlign: "center", padding: 12 }}>
                  No open workorders
                </Text>
              )}
            </div>
          )}
        </div>

        {/* Scrollable body: line items + quick buttons */}
        <div style={{ flex: 1, overflowY: sEditMode ? "hidden" : "auto", display: "flex", flexDirection: "column" }}>
          {/* Line items list */}
          {selectedWorkorder && selectedWorkorder.workorderLines?.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              {selectedWorkorder.workorderLines.map((line) => {
                let inv = line.inventoryItem || {};
                let name = inv.informalName || inv.formalName || "Unknown";
                let lineTotal = (inv.price || 0) * (line.qty || 1);
                return (
                  <div
                    key={line.id}
                    style={{
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 6,
                      paddingHorizontal: 8,
                      marginBottom: 3,
                      borderWidth: 1,
                      borderStyle: "solid",
                      borderColor: gray(0.1),
                      borderRadius: 6,
                      backgroundColor: "white",
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, color: C.text }} numberOfLines={1}>
                        {name}
                      </Text>
                      <Text style={{ fontSize: 10, color: gray(0.5) }}>
                        ${formatCurrencyDisp(lineTotal)}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <TouchableOpacity
                        onPress={() => handleModQty(line.id, "down")}
                        style={{
                          width: 24,
                          height: 24,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Image_ icon={ICONS.downArrowOrange} size={12} />
                      </TouchableOpacity>
                      <View
                        style={{
                          minWidth: 28,
                          height: 24,
                          borderRadius: 4,
                          backgroundColor: gray(0.08),
                          alignItems: "center",
                          justifyContent: "center",
                          marginHorizontal: 2,
                        }}
                      >
                        <Text style={{ fontSize: 12, color: C.text, fontWeight: "600" }}>
                          {line.qty || 1}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleModQty(line.id, "up")}
                        style={{
                          width: 24,
                          height: 24,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Image_ icon={ICONS.upArrowOrange} size={12} />
                      </TouchableOpacity>
                    </View>
                  </div>
                );
              })}
            </div>
          )}

          {/* Line items empty state */}
          {selectedWorkorder && (!selectedWorkorder.workorderLines || selectedWorkorder.workorderLines.length === 0) && (
            <div
              style={{
                borderWidth: 1,
                borderStyle: "dashed",
                borderColor: gray(0.15),
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 8,
                paddingVertical: 20,
              }}
            >
              <Text style={{ fontSize: 11, color: gray(0.3) }}>
                Press a button below to add items
              </Text>
            </div>
          )}

          {/* Quick Buttons area */}
          <div
            ref={containerRefCb}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              borderTopWidth: 1,
              borderTopStyle: "solid",
              borderTopColor: gray(0.15),
              overflowY: (buttonVisualRows * ROW_HEIGHT) > sContainerSize.h ? "auto" : "hidden",
            }}
          >
            {/* All buttons in a single flex-wrap container */}
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                flexWrap: "wrap",
                alignItems: "flex-start",
              }}
            >
              {rows.flat().map((btn, flatIdx) => (
                <StandButtonCard
                  key={btn.id}
                  btn={btn}
                  rowIdx={0}
                  btnIdx={flatIdx}
                  sEditMode={sEditMode}
                  sDragSource={sDragSource}
                  sDragTarget={sDragTarget}
                  _setDragSource={_setDragSource}
                  _setDragTarget={_setDragTarget}
                  handleReorder={handleReorder}
                  handleLabelChange={handleLabelChange}
                  handleDeleteButton={handleDeleteButton}
                  onQuickButtonPress={() => handleQuickButtonPress(btn)}
                  buttonHeight={sButtonHeight}
                />
              ))}
            </div>

            {/* Empty row drop targets - edit mode only */}
            {sEditMode && emptyRowCount > 0 && Array.from({ length: emptyRowCount }).map((_, i) => {
              let slotIdx = buttonVisualRows + i;
              let isSlotOver = sNewRowDropTarget === slotIdx && !!sDragSource;
              return (
                <div
                  key={"empty-" + slotIdx}
                  onDragOver={(e) => {
                    e.preventDefault();
                    _setNewRowDropTarget(slotIdx);
                  }}
                  onDragLeave={() => _setNewRowDropTarget(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDropToNewRow(slotIdx);
                    _setDragSource(null);
                    _setNewRowDropTarget(null);
                  }}
                  style={{
                    height: ROW_HEIGHT,
                    borderWidth: 2,
                    borderStyle: "dashed",
                    borderColor: isSlotOver ? C.green : gray(0.15),
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: isSlotOver ? "rgba(76, 175, 80, 0.1)" : "transparent",
                  }}
                >
                  <Text style={{ fontSize: 11, color: isSlotOver ? C.green : gray(0.25) }}>
                    {isSlotOver ? "Drop to create new row" : ""}
                  </Text>
                </div>
              );
            })}

            {rows.flat().length === 0 && !sEditMode && (
              <Text
                style={{
                  fontSize: 12,
                  color: gray(0.35),
                  textAlign: "center",
                  paddingVertical: 16,
                }}
              >
                Search and add items from the panel on the left.
              </Text>
            )}
          </div>
        </div>
      </div>
    </View>
  );
};

////////////////////////////////////////////////////////////////////////////////
// Stand Button Card (draggable)
////////////////////////////////////////////////////////////////////////////////

const StandButtonCard = ({
  btn,
  rowIdx,
  btnIdx,
  sEditMode,
  sDragSource,
  sDragTarget,
  _setDragSource,
  _setDragTarget,
  handleReorder,
  handleLabelChange,
  handleDeleteButton,
  onQuickButtonPress,
  buttonHeight,
}) => {
  const [sIsEditingLabel, _setIsEditingLabel] = useState(false);

  let isOver =
    sEditMode && sDragTarget &&
    sDragTarget.btnIdx === btnIdx;
  let isDragging =
    sEditMode && sDragSource &&
    sDragSource.btnIdx === btnIdx;

  return (
    <div
      draggable={sEditMode && !sIsEditingLabel}
      onClick={() => {
        if (sEditMode) { _setIsEditingLabel(true); }
        else if (onQuickButtonPress) { onQuickButtonPress(); }
      }}
      onDragStart={sEditMode ? () => _setDragSource({ rowIdx, btnIdx }) : undefined}
      onDragOver={sEditMode ? (e) => {
        e.preventDefault();
        e.stopPropagation();
        _setDragTarget({ rowIdx, btnIdx });
      } : undefined}
      onDrop={sEditMode ? (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (sDragSource) {
          handleReorder(sDragSource.rowIdx, sDragSource.btnIdx, rowIdx, btnIdx);
        }
        _setDragSource(null);
        _setDragTarget(null);
      } : undefined}
      onDragEnd={sEditMode ? () => {
        _setDragSource(null);
        _setDragTarget(null);
      } : undefined}
      style={{
        minWidth: 50,
        maxWidth: 100,
        height: buttonHeight || 40,
        margin: 3,
        paddingVertical: 5,
        paddingHorizontal: 6,
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
        cursor: sEditMode ? (sIsEditingLabel ? "text" : "grab") : "pointer",
        opacity: isDragging ? 0.5 : 1,
        boxSizing: "border-box",
      }}
    >
      {/* Delete button (top-right) - edit mode only */}
      {sEditMode && (
        <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", top: 2, right: 2, zIndex: 2 }}>
          <TouchableOpacity
            onPress={() => handleDeleteButton(btn.id)}
            style={{
              width: 16,
              height: 16,
              borderRadius: 8,
              backgroundColor: gray(0.12),
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Image_ icon={ICONS.trash} size={10} />
          </TouchableOpacity>
        </div>
      )}

      {/* Label - inline editable in edit mode */}
      {sEditMode && sIsEditingLabel ? (
        <div onClick={(e) => e.stopPropagation()}>
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
            onChangeText={(val) => handleLabelChange(btn.id, val)}
            onBlur={() => _setIsEditingLabel(false)}
            autoFocus
            placeholder="Label..."
            placeholderTextColor={gray(0.3)}
          />
        </div>
      ) : (
        <Text
          style={{
            fontSize: 11,
            color: btn.label ? C.text : (sEditMode ? gray(0.35) : gray(0.35)),
            textAlign: "center",
            fontWeight: "500",
          }}
          numberOfLines={2}
        >
          {btn.label || (sEditMode ? "(tap to name)" : "")}
        </Text>
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
    workerSearchInventory(val, (results) => _setSearchResults(results));
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
