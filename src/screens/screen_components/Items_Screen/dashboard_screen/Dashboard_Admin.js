/*eslint-disable*/
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
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
  generate36CharUUID,
  lightenRGBByPercent,
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
  useEmailStore,
} from "../../../../stores";
import {
  Button_,
  DropdownMenu,
  Image_,
  NumberSpinner_,
  ScreenModal,
  TextInput_,
  TimePicker_,
  TimeSpinner,
  Tooltip,
  TouchableOpacity_,
  Pressable_,
  StatusPickerModal,
  Dialog_,
} from "../../../../components";
import {
  CheckBox,
  Image,
  Tooltip as DomTooltip,
  Pressable as DomPressable,
  TouchableOpacity as DomTouchableOpacity,
  TextInput as DomTextInput,
  Button as DomButton,
  DropdownMenu as DomDropdownMenu,
  StatusPickerModal as DomStatusPickerModal,
} from "../../../../dom_components";
import adminStyles from "./Dashboard_Admin.module.css";
import cloneDeep from "lodash/cloneDeep";
import React, { Children, useEffect, useRef, useState, Suspense, lazy } from "react";
import { createPortal } from "react-dom";
import { FaceEnrollModalScreen } from "../../modal_screens/FaceEnrollModalScreen";
import { C, COLOR_GRADIENTS, Fonts, ICONS, Z } from "../../../../styles";
import defaultLogo from "../../../../resources/default_app_logo_large.png";
import { DISCOUNT_TYPES, PERMISSION_LEVELS, build_db_path } from "../../../../constants";
import { APP_USER, COLORS, INTAKE_QUICK_BUTTON_PROTO, NOTE_HELPER_PROTO, NOTE_HELPER_ITEM_PROTO, QUICK_CUSTOMER_NOTE_PROTO, QUICK_CUSTOMER_NOTE_ITEM_PROTO, WORKORDER_ITEM_PROTO, SETTINGS_OBJ, STATUS_AUTO_TEXT_PROTO, TIME_PUNCH_PROTO, TAB_NAMES as APP_TAB_NAMES, QB_DEFAULT_W, QB_DEFAULT_H, QB_SNAP_PCT } from "../../../../data";
import { UserClockHistoryModal } from "../../modal_screens/UserClockHistoryModalScreen";
import { useCallback } from "react";
import { ColorWheel } from "../../../../ColorWheel";
const SalesReportsModal = lazy(() =>
  import("../../modal_screens/SalesReports").then((m) => ({
    default: m.SalesReportsModal,
  }))
);
const PayrollModal = lazy(() =>
  import("../../modal_screens/PayrollModal").then((m) => ({
    default: m.PayrollModal,
  }))
);
import { ScheduleModal } from "../../modal_screens/ScheduleModal";
import { dbSaveSettingsField, dbSaveSettings, dbListenToDevLogs, dbSaveOpenWorkorder, dbSaveCompletedWorkorder, dbSaveCompletedSale, dbSaveActiveSale, dbSaveCustomer, dbRehydrateFromArchive, dbManualArchiveAndCleanup, dbSavePunchObject, dbSavePrintObj, dbBatchWrite, dbClearCollection, dbSaveInventoryItem, dbGmailDisconnect, dbGmailInitiateAuth } from "../../../../db_calls_wrapper";
import { mapCustomers, mapWorkorders, mapSales, mapStatuses, mapEmployees, mapPunchHistory, parseCSV } from "../../../../lightspeed_import";
import { lightspeedInitiateAuthCallable, lightspeedImportDataCallable, firestoreRead, firestoreQuery, firestoreDelete, firestoreWrite, firestoreBatchWrite } from "../../../../db_calls";
import { DB_NODES } from "../../../../constants";
import { newCheckoutGetStripeReaders } from "../../modal_screens/newCheckoutModalScreen/newCheckoutFirebaseCalls";
import { StandButtonsCanvasEditor } from "./StandButtonsCanvas";
import { ListOptionsComponent } from "./ListsOptions";
import { StoreInfoComponent } from "./StoreInfo/StoreInfo";
import { LabelDesignerModalV2 as LabelDesignerModal } from "../../modal_screens/LabelDesignerModalV2";
import { labelPrintBuilder } from "../../../../shared/labelPrintBuilder";
import { EmailOptionsComponent } from "./EmailOptions";
import { TextTemplatesComponent } from "./TextTemplates/TextTemplatesComponent";
import { TEMPLATE_EMOJIS, TEXT_TEMPLATE_VARIABLES, TEXT_TEMPLATE_TYPE_VARIABLES } from "./TextTemplates/templateConstants";
import { BackupRecoveryComponent } from "./BackupRecoveryComponent";
import { ImportComponent } from "./ImportComponent/ImportComponent";
import { CardReaderManager } from "./readers_printers/CardReaderManager";
import { PrintersComponent } from "./readers_printers/PrintersComponent";


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
  emailTemplates: "Email Options",
  import: "Import",
  backup: "Backup & Recovery",
  labelDesigner: "Label Designer",
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
  const [sStandEditButtonObj, _setStandEditButtonObj] = useState(null);
  const [sShowStandButtonsModal, _setShowStandButtonsModal] = useState(false);
  const [sShowLabelDesigner, _setShowLabelDesigner] = useState(false);

  //////////////////////////////////////////////////////////////////////////

  function commitUserInfoChange(userObj, isNewUser) {
    const liveUsers = useSettingsStore.getState().settings.users;
    let userArr;
    if (isNewUser) {
      userArr = [userObj, ...liveUsers];
    } else {
      userArr = liveUsers.map((o) => {
        if (o.id === userObj.id) {
          return { ...userObj, faceDescriptor: o.faceDescriptor };
        }
        return o;
      });
    }
    useSettingsStore.getState().setField("users", userArr);
  }

  function handleRemoveUserPress(userObj) {
    const liveUsers = useSettingsStore.getState().settings.users;
    let userArr = liveUsers.filter((o) => o.id != userObj.id);
    useSettingsStore.getState().setField("users", userArr);
  }

  function handleDescriptorCapture(userObj, desc) {
    const liveUsers = useSettingsStore.getState().settings.users;
    const plainDesc = desc ? Array.from(desc) : "";
    let userArr = liveUsers.map((o) => {
      if (o.id === userObj.id) {
        return { ...o, faceDescriptor: plainDesc };
      }
      return o;
    });
    useSettingsStore.getState().setField("users", userArr);
  }

  function handleSettingsFieldChange(fieldName, fieldValue) {
    useSettingsStore.getState().setField(fieldName, fieldValue);
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
        <Suspense fallback={null}>
          <SalesReportsModal handleExit={() => _setShowSalesReportModal(false)} />
        </Suspense>
      )}
      {!!sShowPayrollModal && (
        <Suspense fallback={null}>
          <PayrollModal handleExit={() => _setShowPayrollModal(false)} />
        </Suspense>
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
              zIndex: Z.modal,
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
        <div
          className={adminStyles.tabBarScroll}
          style={{
            "--tab-bar-bg": C.backgroundListWhite,
            "--tab-bar-border": C.buttonLightGreenOutline,
            "--tab-bar-spacer": gray(0.1),
            "--tab-bar-row-selected-bg": C.orange,
          }}
        >
          <div className={adminStyles.tabBarInner}>
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
          </div>
        </div>

        {/*********************right-side column container****************** */}

        {!sExpand && (
          <View style={{ width: "70%", height: "100%", justifyContent: "center", alignItems: "center" }}>
            <Image_
              icon={defaultLogo}
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
              handleDescriptorCapture={handleDescriptorCapture}
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
            <OrderingComponent />
          )}
          {sExpand === TAB_NAMES.textTemplates && (
            <TextTemplatesComponent
              zSettingsObj={zSettingsObj}
              handleSettingsFieldChange={handleSettingsFieldChange}
            />
          )}
          {sExpand === TAB_NAMES.emailTemplates && (
            <EmailOptionsComponent
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

function VerticalSpacer() {
  return <div className={adminStyles.tabBarSpacer} />;
}

// Translate residual RN-web style keys to their DOM CSS equivalents so that
// callers can keep passing paddingHorizontal/paddingVertical/borderWidth
// during the incremental migration.
function rnStyleToDom(style) {
  if (!style) return {};
  const out = { ...style };
  if (style.paddingHorizontal != null) {
    out.paddingLeft = out.paddingLeft ?? style.paddingHorizontal;
    out.paddingRight = out.paddingRight ?? style.paddingHorizontal;
    delete out.paddingHorizontal;
  }
  if (style.paddingVertical != null) {
    out.paddingTop = out.paddingTop ?? style.paddingVertical;
    out.paddingBottom = out.paddingBottom ?? style.paddingVertical;
    delete out.paddingVertical;
  }
  if (style.marginHorizontal != null) {
    out.marginLeft = out.marginLeft ?? style.marginHorizontal;
    out.marginRight = out.marginRight ?? style.marginHorizontal;
    delete out.marginHorizontal;
  }
  if (style.marginVertical != null) {
    out.marginTop = out.marginTop ?? style.marginVertical;
    out.marginBottom = out.marginBottom ?? style.marginVertical;
    delete out.marginVertical;
  }
  if (style.borderWidth != null && out.borderStyle == null) {
    out.borderStyle = "solid";
  }
  return out;
}

export function BoxContainerOuterComponent({ style = {}, children }) {
  return (
    <div className={adminStyles.boxContainerOuter} style={rnStyleToDom(style)}>
      {children}
    </div>
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
  const ICON_SIZE = 18;
  const rowClassName = selected
    ? `${adminStyles.tabBarRow} ${adminStyles.tabBarRowSelected}`
    : adminStyles.tabBarRow;
  return (
    <button
      type="button"
      className={rowClassName}
      disabled={disabled}
      onClick={disabled ? undefined : handleExpandPress}
    >
      {!dropdownDataArr && (
        <span
          className={adminStyles.tabBarRowText}
          style={{ color: selected ? C.textWhite : gray(0.5) }}
        >
          {text.toUpperCase()}
        </span>
      )}
      {!!dropdownDataArr && (
        <DropdownMenu
          buttonStyle={{
            backgroundColor: "transparent",
            paddingHorizontal: 0,
            paddingVertical: 0,
          }}
          itemStyle={{ width: null }}
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
      <Image size={iconSize || ICON_SIZE} icon={icon || ICONS.expandGreen} />
    </button>
  );
}

export function BoxContainerInnerComponent({ style = {}, children }) {
  return (
    <div
      className={adminStyles.boxContainerInner}
      style={{
        "--box-inner-border": C.buttonLightGreenOutline,
        "--box-inner-bg": C.listItemWhite,
        ...rnStyleToDom(style),
      }}
    >
      {children}
    </div>
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
    <DomButton
      colorGradientArr={colorGradientArr}
      text={label}
      icon={icon || ICONS.add}
      iconSize={iconSize || 30}
      textStyle={{ fontSize: 14, color: gray(0.6), ...textStyle }}
      buttonStyle={{
        paddingLeft: 0,
        paddingRight: 0,
        paddingTop: 0,
        paddingBottom: 0,
        borderRadius: 5,
        backgroundColor: gray(0.2),
        marginBottom: 0,
        ...style,
      }}
      onPress={onPress}
    />
  );
}

function MoveArrows({ index, listLength, onMove }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginLeft: 5 }}>
      <TouchableOpacity
        disabled={index === 0}
        onPress={() => onMove(index, "up")}
        style={{ padding: 4, opacity: index === 0 ? 0.25 : 1 }}
      >
        <Image_ icon={ICONS.upChevron} size={13} />
      </TouchableOpacity>
      <TouchableOpacity
        disabled={index === listLength - 1}
        onPress={() => onMove(index, "down")}
        style={{ padding: 4, opacity: index === listLength - 1 ? 0.25 : 1 }}
      >
        <Image_ icon={ICONS.downChevron} size={13} />
      </TouchableOpacity>
    </View>
  );
}

////////////////////////////////////////////////////////////////////////////////////

const AppUserListComponent = ({
  zSettingsObj,
  commitUserInfoChange,
  handleDescriptorCapture,
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

  const ucVars = {
    "--uc-text": C.text,
    "--uc-input-border": C.green,
  };

  return (
    <BoxContainerOuterComponent style={{}}>
      {/* User Control: settings, facial recognition, user list */}
      <BoxContainerInnerComponent
        style={{
          backgroundColor: C.backgroundListWhite,
          borderWidth: 0,
          ...ucVars,
        }}
      >
        <div className={`${adminStyles.ucSettingRow} ${adminStyles.ucSettingRowFirst}`}>
          <span className={adminStyles.ucSettingLabel}>Seconds to log user out: </span>
          <DomTextInput
            debounceMs={500}
            onChangeText={(val) => {
              _setLoginTimeout(val);
              handleSettingsFieldChange("activeLoginTimeoutSeconds", val);
            }}
            style={{ width: 50, marginLeft: 10, border: "1px solid " + C.green, borderRadius: 5, paddingLeft: 3, outline: "none", color: C.text, boxSizing: "border-box" }}
            value={String(sLoginTimeout)}
          />
        </div>
        <div className={adminStyles.ucSettingRow}>
          <span className={adminStyles.ucSettingLabel}>Hours to lock app: </span>
          <DomTextInput
            debounceMs={500}
            onChangeText={(val) => {
              _setLockHours(val);
              handleSettingsFieldChange("idleLoginTimeoutHours", val);
            }}
            style={{ width: 50, marginLeft: 10, border: "1px solid " + C.green, borderRadius: 5, paddingLeft: 3, outline: "none", color: C.text, boxSizing: "border-box" }}
            value={String(sLockHours)}
          />
        </div>
        <div className={adminStyles.ucSettingRow}>
          <span className={adminStyles.ucSettingLabel}>User login PIN length: </span>
          <DomTextInput
            debounceMs={500}
            onChangeText={(val) => {
              _setPinLength(val);
              handleSettingsFieldChange("userPinStrength", val);
            }}
            style={{ width: 50, marginLeft: 10, border: "1px solid " + C.green, borderRadius: 5, paddingLeft: 3, outline: "none", color: C.text, boxSizing: "border-box" }}
            value={String(sPinLength)}
          />
        </div>
        <div className={adminStyles.ucCheckRow}>
          <CheckBox
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
        </div>
        <div className={adminStyles.ucCheckRow}>
          <CheckBox
            buttonStyle={{ justifyContent: "flex-end" }}
            isChecked={zSettingsObj?.useFacialRecognition !== false}
            text={"Enable facial recognition"}
            onCheck={() => {
              handleSettingsFieldChange(
                "useFacialRecognition",
                !zSettingsObj?.useFacialRecognition
              );
            }}
          />
        </div>
        {zSettingsObj?.useFacialRecognition !== false && (
          <div className={adminStyles.ucSensitivityBlock}>
            <div className={adminStyles.ucSensitivityHeader}>
              <span style={{ fontSize: 13, color: C.text, fontWeight: Fonts.weight.textRegular }}>
                Match Sensitivity
              </span>
              <span style={{ fontSize: 13, color: C.text, fontWeight: Fonts.weight.textHeavy }}>
                {(zSettingsObj?.faceRecognitionThreshold ?? 0.55).toFixed(2)}
              </span>
            </div>
            <div className={adminStyles.ucSensitivityRow}>
              <span style={{ fontSize: 11, color: gray(0.5), marginRight: 8 }}>Strict</span>
              <input
                type="range"
                min="0.35"
                max="0.65"
                step="0.05"
                value={zSettingsObj?.faceRecognitionThreshold ?? 0.55}
                onChange={(e) => {
                  handleSettingsFieldChange("faceRecognitionThreshold", parseFloat(e.target.value));
                }}
                style={{ flex: 1, cursor: "pointer" }}
              />
              <span style={{ fontSize: 11, color: gray(0.5), marginLeft: 8 }}>Loose</span>
            </div>
          </div>
        )}
        <div className={adminStyles.ucDivider} style={{ backgroundColor: gray(0.2) }} />
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

        <div className={adminStyles.ucAddUserWrap}>
          <BoxButton1
            iconSize={35}
            icon={ICONS.add}
            onPress={handleNewUserPress}
            style={{}}
          />
        </div>
        <div className={adminStyles.ucUserList}>
          {(() => {
            let data = zSettingsObj
              ? sNewUserObj
                ? [sNewUserObj, ...zSettingsObj.users]
                : zSettingsObj.users
              : [];
            return data.map((userObj, idx) => {
              userObj = cloneDeep(userObj);
              let editable = sEditUserIndex === idx;
              let borderColor = editable ? C.buttonLightGreenOutline : "transparent";
              return (
                <React.Fragment key={userObj.id || idx}>
                  {idx > 0 && <div className={adminStyles.ucUserListItem} />}
                  <div
                    ref={(element) => (userListItemRefs.current[idx] = element)}
                    className={adminStyles.ucUserRow}
                    style={{
                      backgroundColor: C.listItemWhite,
                      borderColor: C.buttonLightGreenOutline,
                      opacity: !editable && sEditUserIndex ? 0.3 : 1,
                    }}
                  >
                    <div className={adminStyles.ucUserLeftCol}>
                      {/* Row 1 - aligns with name row */}
                      <div className={adminStyles.ucIconCell}>
                        <DomTouchableOpacity
                          onPress={() => {
                            if (!canEditUsers) return;
                            if (sEditUserIndex == null) {
                              console.log(JSON.stringify(userObj, null, 2));
                            }
                            _setEditUserIndex(sEditUserIndex != null ? null : idx);
                            _setShowPinIndex(null);
                            _setShowWageIndex(null);
                          }}
                          style={{ opacity: canEditUsers ? 1 : 0.3 }}
                        >
                          <Image icon={editable ? ICONS.check1 : ICONS.editPencil} size={20} />
                        </DomTouchableOpacity>
                      </div>
                      {/* Row 2 - Clock In/Out (aligns with phone/email row) */}
                      <div className={adminStyles.ucActionCell}>
                        <DomButton
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
                            borderStyle: "solid",
                            borderColor: zPunchClock[userObj.id] ? C.lightred : C.buttonLightGreenOutline,
                            backgroundColor: zPunchClock[userObj.id] ? C.lightred : C.buttonLightGreen,
                            paddingTop: 2,
                            paddingBottom: 2,
                            paddingLeft: 4,
                            paddingRight: 4,
                            borderRadius: 5,
                            width: "100%",
                          }}
                          mouseOverOptions={{ opacity: 0.7 }}
                          textStyle={{ fontSize: 11, color: zPunchClock[userObj.id] ? C.textWhite : C.text, fontWeight: "600", width: '100%', textAlign: "center" }}
                        />
                      </div>
                      {/* Row 3 - Enroll (aligns with PIN/wage/role row) */}
                      {zSettingsObj?.useFacialRecognition !== false && (
                        <div className={adminStyles.ucActionCell}>
                          <DomTooltip text="Click to enroll user, right-click to remove" position="right">
                            <div
                              className={adminStyles.ucEnrollBtn}
                              style={{
                                "--uc-enroll-border": C.buttonLightGreenOutline,
                                "--uc-enroll-bg": C.buttonLightGreen,
                                opacity: editable ? 1 : 0.5,
                                cursor: editable ? "pointer" : "default",
                              }}
                              onClick={() => {
                                if (!editable) return;
                                _setFacialRecognitionModalUserObj(userObj);
                              }}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                if (!editable) return;
                                handleDescriptorCapture(userObj, "");
                              }}
                            >
                              <Image icon={userObj.faceDescriptor ? ICONS.check1 : ICONS.redx} size={12} />
                              <span className={adminStyles.ucEnrollText} style={{ color: C.text }}>Enroll</span>
                            </div>
                          </DomTooltip>
                        </div>
                      )}
                      {/* Row 4 - aligns with statuses row */}
                      <div className={adminStyles.ucRowSpacer} />
                    </div>
                    <div className={adminStyles.ucUserRightCol}>
                      <div className={adminStyles.ucNameRow}>
                        <DomTextInput
                          debounceMs={500}
                          value={userObj.first}
                          placeholder="First name"
                          placeholderTextColor={"lightgray"}
                          editable={editable}
                          style={{
                            paddingLeft: 5,
                            paddingRight: 5,
                            paddingTop: 1,
                            paddingBottom: 1,
                            borderColor: borderColor,
                            color: editable ? C.text : gray(0.5),
                          }}
                          className={adminStyles.ucNameInput}
                          onChangeText={(value) => {
                            userObj.first = value;
                            commitUserInfoChange(userObj);
                          }}
                        />
                        <DomTextInput
                          debounceMs={500}
                          value={userObj.last}
                          onChangeText={(value) => {
                            userObj.last = value;
                            commitUserInfoChange(userObj);
                          }}
                          placeholder="Last name"
                          placeholderTextColor={"lightgray"}
                          editable={editable}
                          style={{
                            paddingLeft: 5,
                            paddingRight: 5,
                            borderColor: borderColor,
                            color: editable ? C.text : gray(0.5),
                          }}
                          className={adminStyles.ucNameInput}
                        />
                      </div>
                      <div className={adminStyles.ucContactRow}>
                        <DomTextInput
                          debounceMs={500}
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
                            paddingLeft: 5,
                            paddingRight: 5,
                            paddingTop: 1,
                            paddingBottom: 1,
                            borderColor: borderColor,
                            color: editable ? C.text : gray(0.5),
                          }}
                          className={adminStyles.ucPhoneInput}
                        />
                        <DomTextInput
                          debounceMs={500}
                          value={userObj.email || ""}
                          onChangeText={(value) => {
                            userObj.email = value;
                            commitUserInfoChange(userObj);
                          }}
                          placeholder="Email"
                          placeholderTextColor={"lightgray"}
                          editable={editable}
                          style={{
                            paddingLeft: 5,
                            paddingRight: 5,
                            paddingTop: 1,
                            paddingBottom: 1,
                            borderColor: borderColor,
                            color: editable ? C.text : gray(0.5),
                          }}
                          className={adminStyles.ucEmailInput}
                        />
                      </div>
                      <div className={adminStyles.ucCredsRow}>
                        <div className={adminStyles.ucCredBox} style={{ borderColor: borderColor }}>
                          <DomTextInput
                            debounceMs={500}
                            caretHidden={sShowPinIndex != idx}
                            focused={sShowPinIndex === idx}
                            value={sShowPinIndex === idx ? userObj.pin : ""}
                            onChangeText={(value) => {
                              let otherPins = (zSettingsObj?.users || []).filter((u) => u.id !== userObj.id).map((u) => u.pin);
                              if (value && otherPins.includes(value)) {
                                value = value.slice(0, -1);
                              }
                              userObj.pin = value;
                              commitUserInfoChange(userObj);
                            }}
                            placeholder={sShowPinIndex === idx ? "pin..." : "PIN"}
                            placeholderTextColor={"lightgray"}
                            editable={editable}
                            className={adminStyles.ucCredInput}
                            style={{ color: editable ? C.text : gray(0.5) }}
                          />
                          {editable ? (
                            <DomTouchableOpacity
                              onPress={() =>
                                _setShowPinIndex(sShowPinIndex != null ? null : idx)
                              }
                            >
                              <Image icon={ICONS.editPencil} size={15} />
                            </DomTouchableOpacity>
                          ) : (
                            <div className={adminStyles.ucCredPlaceholder} />
                          )}
                        </div>
                        <div className={adminStyles.ucCredBox} style={{ borderColor: borderColor }}>
                          <DomTextInput
                            debounceMs={500}
                            caretHidden={sShowWageIndex != idx}
                            value={sShowWageIndex === idx ? userObj.hourlyWage : ""}
                            onChangeText={(value) => {
                              userObj.hourlyWage = value;
                              commitUserInfoChange(userObj);
                            }}
                            placeholder={sShowWageIndex === idx ? "wage..." : "Wage"}
                            placeholderTextColor={"lightgray"}
                            editable={editable}
                            className={adminStyles.ucCredInput}
                            style={{ color: editable ? C.text : gray(0.5) }}
                          />
                          {editable ? (
                            <DomTouchableOpacity
                              onPress={() =>
                                _setShowWageIndex(sShowWageIndex != null ? null : idx)
                              }
                            >
                              <Image icon={ICONS.editPencil} size={15} />
                            </DomTouchableOpacity>
                          ) : (
                            <div className={adminStyles.ucCredPlaceholder} />
                          )}
                        </div>
                        <div className={adminStyles.ucRoleWrap}>
                          <DomDropdownMenu
                            enabled={editable}
                            ref={userListItemRefs.current[idx]}
                            dataArr={Object.values(PERMISSION_LEVELS).map((o) => o.name)}
                            onSelect={(item) => {
                              if (!editable) return;
                              let perm = Object.values(PERMISSION_LEVELS).find(
                                (o) => o.name === item
                              );
                              userObj.permissions = perm;
                              commitUserInfoChange(userObj);
                            }}
                            buttonStyle={{
                              paddingLeft: 5,
                              paddingRight: 5,
                              paddingTop: 2,
                              paddingBottom: 2,
                              borderColor: C.buttonLightGreenOutline,
                              borderStyle: "solid",
                              borderWidth: 1,
                              outline: "none",
                              borderRadius: 5,
                              minWidth: 100,
                              height: 25,
                              alignItems: "flex-start",
                              backgroundColor: editable ? C.buttonLightGreen : "transparent",
                            }}
                            buttonText={userObj.permissions.name}
                            buttonTextStyle={{
                              color: editable ? C.text : gray(0.5),
                              fontSize: 14,
                            }}
                          />
                        </div>
                        {editable && (
                          <DomTouchableOpacity
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
                            <Image icon={ICONS.trash} size={18} />
                          </DomTouchableOpacity>
                        )}
                      </div>
                      {/* ROW 4: Statuses */}
                      <div className={adminStyles.ucChipRow}>
                        {editable && (
                          <DomStatusPickerModal
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
                              paddingLeft: 8,
                              paddingRight: 8,
                              paddingTop: 2,
                              paddingBottom: 2,
                              borderColor: C.buttonLightGreenOutline,
                              borderStyle: "solid",
                              borderWidth: 1,
                              borderRadius: 5,
                              height: 25,
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
                          let status = zSettingsObj.statuses.find((s) => s.id === statusId);
                          if (!status) return null;
                          return (
                            <div
                              key={statusId}
                              className={adminStyles.ucChip}
                              style={{ backgroundColor: editable ? status.backgroundColor : gray(0.85) }}
                            >
                              <span
                                className={adminStyles.ucChipLabel}
                                style={{ color: editable ? status.textColor : gray(0.5) }}
                              >
                                {status.label}
                              </span>
                              {editable && (
                                <button
                                  type="button"
                                  className={adminStyles.ucChipRemove}
                                  style={{ color: status.textColor }}
                                  onClick={() => {
                                    userObj.statuses = (userObj.statuses || []).filter((id) => id !== statusId);
                                    commitUserInfoChange(userObj);
                                  }}
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* ROW 5: Email Inboxes */}
                      <div className={adminStyles.ucChipRow}>
                        {editable && (zSettingsObj?.emailAccounts || []).length > 0 && (
                          <DomDropdownMenu
                            dataArr={(zSettingsObj.emailAccounts || [])
                              .filter((a) => !(userObj.emailInboxes || []).includes(a.accountKey))
                              .map((a) => ({ label: a.displayName, value: a.accountKey }))}
                            onSelect={(item) => {
                              if (!item) return;
                              let current = userObj.emailInboxes || [];
                              if (current.includes(item.value)) return;
                              userObj.emailInboxes = [...current, item.value];
                              commitUserInfoChange(userObj);
                            }}
                            buttonText="+ Inbox"
                            buttonStyle={{
                              paddingLeft: 8,
                              paddingRight: 8,
                              paddingTop: 2,
                              paddingBottom: 2,
                              borderColor: C.buttonLightGreenOutline,
                              borderStyle: "solid",
                              borderWidth: 1,
                              borderRadius: 5,
                              height: 25,
                              alignItems: "center",
                              backgroundColor: C.buttonLightGreen,
                            }}
                            buttonTextStyle={{
                              color: C.text,
                              fontSize: 12,
                            }}
                          />
                        )}
                        {(userObj.emailInboxes || []).map((accountKey) => {
                          let acct = (zSettingsObj.emailAccounts || []).find((a) => a.accountKey === accountKey);
                          if (!acct) return null;
                          return (
                            <div
                              key={accountKey}
                              className={adminStyles.ucChip}
                              style={{ backgroundColor: editable ? C.blue : gray(0.85) }}
                            >
                              <span
                                className={adminStyles.ucChipLabel}
                                style={{ color: editable ? C.textWhite : gray(0.5) }}
                              >
                                {acct.displayName}
                              </span>
                              {editable && (
                                <button
                                  type="button"
                                  className={adminStyles.ucChipRemove}
                                  style={{ color: C.textWhite }}
                                  onClick={() => {
                                    userObj.emailInboxes = (userObj.emailInboxes || []).filter((k) => k !== accountKey);
                                    commitUserInfoChange(userObj);
                                  }}
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </React.Fragment>
              );
            });
          })()}
        </div>
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
        <CheckBox
          isChecked={zSettingsObj?.autoConnectToCardReader}
          textStyle={{ fontSize: 15 }}
          buttonStyle={{
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
      </BoxContainerInnerComponent>
    </BoxContainerOuterComponent>
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
    let filtered = (zSettingsObj?.statuses || []).filter((s) => !s.systemOwned);
    let draggedItem = filtered[fromIdx];
    let targetItem = filtered[toIdx];
    if (!draggedItem || !targetItem) return;
    let full = [...(zSettingsObj?.statuses || [])];
    let actualFrom = full.findIndex((s) => s.id === draggedItem.id);
    let actualTo = full.findIndex((s) => s.id === targetItem.id);
    if (actualFrom < 0 || actualTo < 0) return;
    let [dragged] = full.splice(actualFrom, 1);
    full.splice(actualTo, 0, dragged);
    handleSettingsFieldChange("statuses", full);
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
                    reorderStatuses(sDragIdx, sDragOverIdx);
                    _setDragIdx(null);
                    _setDragOverIdx(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
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
                        debounceMs={500}
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
                      <CheckBox
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
                      <CheckBox
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
            zIndex: Z.modal,
          }}
        >
          <View
            style={{
              backgroundColor: C.backgroundListWhite,
              borderRadius: 10,
              padding: 30,
              maxWidth: 900,
              width: "90%",
              maxHeight: "85%",
              borderWidth: 2,
              borderColor: C.buttonLightGreenOutline,
              flexDirection: "row",
              alignItems: "stretch",
            }}
          >
            {/* Status list sidebar */}
            <View style={{ width: 180, marginRight: 0, paddingRight: 15 }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: gray(0.45), marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Copy From
              </Text>
              <ScrollView style={{ flex: 1 }}>
                {(zSettingsObj.statuses || []).filter((s) => !s.hidden && s.id !== sColorModalItem.id).map((status) => (
                  <TouchableOpacity
                    key={status.id}
                    onPress={() => {
                      _setModalBgColor(status.backgroundColor);
                      _setModalTextColor(status.textColor);
                    }}
                    style={{
                      backgroundColor: status.backgroundColor,
                      borderRadius: 6,
                      paddingVertical: 8,
                      paddingHorizontal: 10,
                      marginBottom: 6,
                      borderWidth: 1,
                      borderColor: gray(0.15),
                    }}
                  >
                    <Text style={{ color: status.textColor, fontSize: 12, fontWeight: "500" }} numberOfLines={1}>
                      {status.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <View style={{ width: 1, backgroundColor: gray(0.15), marginHorizontal: 15 }} />

            {/* Main color picker area */}
            <View style={{ flex: 1, alignItems: "center" }}>
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
                    key={"bg-" + sModalBgColor}
                    initialColor={sModalBgColor}
                    onColorChange={(val) => {
                      _setModalBgColor(val.hex);
                    }}
                  />
                </View>
                <View style={{ alignItems: "center" }}>
                  <Text style={{ fontSize: 13, color: C.text, marginBottom: 8, fontWeight: "500" }}>
                    Text Color
                  </Text>
                  <ColorWheel
                    key={"text-" + sModalTextColor}
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
                debounceMs={500}
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
                debounceMs={500}
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

const QBInventorySearchModal = ({ parentName, onClose, onAddItems, existingItemIDs = [] }) => {
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
        zIndex: Z.modal,
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
            let alreadyAdded = existingItemIDs.includes(item.id);
            return (
              <div
                onMouseEnter={(e) => { if (!alreadyAdded) e.currentTarget.style.opacity = "0.7"; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = alreadyAdded ? "0.4" : "1"; }}
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
                  cursor: alreadyAdded ? "default" : "pointer",
                  opacity: alreadyAdded ? 0.4 : 1,
                }}
              >
                <CheckBox
                  isChecked={isChecked}
                  onCheck={alreadyAdded ? undefined : () => toggleSelected(item.id)}
                  buttonStyle={{ marginRight: 4 }}
                />
                <TouchableOpacity
                  onPress={alreadyAdded ? undefined : () => handleSingleSelect(item.id)}
                  style={{ flex: 1, flexDirection: "row", alignItems: "center" }}
                  disabled={alreadyAdded}
                >
                  <View style={{ flex: 1, paddingLeft: 4 }}>
                    <Text style={{ fontSize: 14, color: alreadyAdded ? gray(0.4) : C.text }} numberOfLines={1}>
                      {item.informalName || item.formalName}
                    </Text>
                    {!!item.informalName && (
                      <Text style={{ fontSize: 11, color: gray(0.4) }} numberOfLines={1}>
                        {item.formalName}
                      </Text>
                    )}
                  </View>
                  <Text style={{ fontSize: 13, color: alreadyAdded ? gray(0.4) : C.text, marginLeft: 8 }}>
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
    console.log("[Dashboard QB] drillIn button:", JSON.stringify(btn, null, 2));
    console.log("[Dashboard QB] drillIn button.items count:", btn.items?.length, "items:", JSON.stringify(btn.items, null, 2));
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
    // console.log("[Dashboard QB] handleAddItemsToButton itemIDs:", JSON.stringify(itemIDs));
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
    // console.log("[Dashboard QB] handleAddItemsToButton updated button:", JSON.stringify(updated.find(b => b.id === sCurrentParentID), null, 2));
    useSettingsStore.getState().setField("quickItemButtons", updated);
  }

  // Render the extracted component, passing needed props
  function renderInvSearchModal() {
    if (!sShowInvSearchModal) return null;
    const parentBtn = (zSettingsObj?.quickItemButtons || []).find((b) => b.id === sCurrentParentID);
    const parentName = parentBtn?.name || "(unnamed)";
    const existingItemIDs = (parentBtn?.items || []).map((e) => typeof e === "string" ? e : e.inventoryItemID);
    return (
      <QBInventorySearchModal
        parentName={parentName}
        onClose={() => _setShowInvSearchModal(false)}
        onAddItems={handleAddItemsToButton}
        existingItemIDs={existingItemIDs}
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

  function handleAddToTargetQB(inventoryItemID, targetBtnID) {
    let targetBtn = quickItemButtons.find((b) => b.id === targetBtnID);
    if (!targetBtn) return;
    let existingIDs = (targetBtn.items || []).map((e) => typeof e === "string" ? e : e.inventoryItemID);
    if (existingIDs.includes(inventoryItemID)) return;
    let sourceEntry = (parentButton?.items || []).find((e) => {
      let id = typeof e === "string" ? e : e.inventoryItemID;
      return id === inventoryItemID;
    });
    let w = (sourceEntry && typeof sourceEntry !== "string") ? sourceEntry.w || QB_DEFAULT_W : QB_DEFAULT_W;
    let h = (sourceEntry && typeof sourceEntry !== "string") ? sourceEntry.h || QB_DEFAULT_H : QB_DEFAULT_H;
    let fontSize = (sourceEntry && typeof sourceEntry !== "string") ? sourceEntry.fontSize || 10 : 10;
    let newEntry = { inventoryItemID, x: (existingIDs.length % 6) * (QB_DEFAULT_W + QB_SNAP_PCT), y: Math.floor(existingIDs.length / 6) * (QB_DEFAULT_H + QB_SNAP_PCT), w, h, fontSize };
    if (sourceEntry && typeof sourceEntry !== "string" && sourceEntry.color) newEntry.color = sourceEntry.color;
    let updated = quickItemButtons.map((b) =>
      b.id === targetBtnID ? { ...b, items: [...(b.items || []), newEntry] } : b
    );
    useSettingsStore.getState().setField("quickItemButtons", updated);
  }

  if (parentItems.length === 0) return null;

  let dropdownTargets = quickItemButtons
    .filter((b) => b.id !== "labor" && b.id !== "item" && b.id !== sCurrentParentID)
    .map((b) => ({ id: b.id, label: b.name || "(unnamed)" }));

  return (
    <View style={{ marginTop: 10, width: "100%" }}>
      <Text style={{ fontSize: 12, fontWeight: "bold", color: gray(0.5), marginBottom: 6 }}>
        ITEMS ({parentItems.length})
      </Text>
      {parentItems.map((inv, idx) => {
        let dividerObj = (parentButton?.dividers || []).find((d) => d.itemID === inv.id);
        let hasDivider = !!dividerObj;
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
              {dropdownTargets.length > 0 && (
                <View style={{ marginRight: 10 }}>
                  <DropdownMenu
                    dataArr={dropdownTargets}
                    onSelect={(item) => handleAddToTargetQB(inv.id, item.id)}
                    buttonIcon={ICONS.add}
                    buttonIconSize={17}
                    buttonStyle={{ backgroundColor: "transparent", borderWidth: 0, paddingVertical: 0, paddingHorizontal: 0 }}
                    centerMenuVertically
                    menuMaxHeight={window.innerHeight - 20}
                  />
                </View>
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

const OrderingComponent = () => {
  return (
    <BoxContainerOuterComponent>
      <BoxContainerInnerComponent style={{ width: "100%", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
        <span style={{ color: gray(0.15), fontSize: 28, fontWeight: "600" }}>Ordering system not ready</span>
      </BoxContainerInnerComponent>
    </BoxContainerOuterComponent>
  );
};


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
              <CheckBox
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
            debounceMs={500}
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
        zIndex: Z.modal,
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
