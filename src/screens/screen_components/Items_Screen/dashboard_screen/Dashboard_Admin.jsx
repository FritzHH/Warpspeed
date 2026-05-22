/*eslint-disable*/
import { formatPhoneWithDashes, bestForegroundHex, checkInputForNumbersOnly, clog, formatCurrencyDisp, formatMillisForDisplay, // searchInventory moved to Web Worker
  generateTimesForListDisplay, generateEAN13Barcode, normalizeBarcode, getDayOfWeekFrom0To7Input, log, moveItemInArr, NUMS, removeDashesFromPhone, dollarsToCents, capitalizeFirstLetterOfString, printBuilder, calculateRunningTotals, localStorageWrapper, createNewWorkorder, formatWorkorderNumber, intakeButtonsToRows, intakeRowsToFlat, generate36CharUUID, lightenRGBByPercent } from "../../../../utils";
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
import { QuickItemButtonsComponent } from "./QuickItemButtons";
import adminStyles from "./Dashboard_Admin.module.css";
import cloneDeep from "lodash/cloneDeep";
import React, { Children, useEffect, useRef, useState, Suspense, lazy } from "react";
import { createPortal } from "react-dom";
import { FaceEnrollModalScreen } from "../../modal_screens/FaceEnrollModalScreen";
import { C, COLOR_GRADIENTS, Fonts, ICONS, Z } from "../../../../styles";
import defaultLogo from "../../../../resources/default_app_logo_large.png";
import { DISCOUNT_TYPES, PERMISSION_LEVELS, build_db_path } from "../../../../constants";
import { APP_USER, COLORS, INTAKE_QUICK_BUTTON_PROTO, NOTE_HELPER_PROTO, NOTE_HELPER_ITEM_PROTO, QUICK_CUSTOMER_NOTE_PROTO, QUICK_CUSTOMER_NOTE_ITEM_PROTO, WORKORDER_ITEM_PROTO, SETTINGS_OBJ, STATUS_AUTO_TEXT_PROTO, TIME_PUNCH_PROTO, TAB_NAMES as APP_TAB_NAMES, QB_DEFAULT_W, QB_DEFAULT_H, QB_SNAP_PCT } from "../../../../data";
import { useCallback } from "react";
import { ColorWheel } from "../../../../ColorWheel";
const UserClockHistoryModal = lazy(() =>
  import("../../modal_screens/UserClockHistoryModalScreen").then((m) => ({
    default: m.UserClockHistoryModal,
  }))
);
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
const ScheduleModal = lazy(() =>
  import("../../modal_screens/ScheduleModal").then((m) => ({ default: m.ScheduleModal }))
);
import { TodaysHistoryComponent } from "./TodaysHistoryComponent";
import { dbSaveSettingsField, dbSaveSettings, dbListenToDevLogs, dbSaveOpenWorkorder, dbSaveCompletedWorkorder, dbSaveCompletedSale, dbSaveActiveSale, dbSaveCustomer, dbRehydrateFromArchive, dbManualArchiveAndCleanup, dbSavePunchObject, dbSavePrintObj, dbBatchWrite, dbClearCollection, dbSaveInventoryItem, dbGmailDisconnect, dbGmailInitiateAuth } from "../../../../db_calls_wrapper";
import { mapCustomers, mapWorkorders, mapSales, mapStatuses, mapEmployees, mapPunchHistory, parseCSV } from "../../../../lightspeed_import";
import { lightspeedInitiateAuthCallable, lightspeedImportDataCallable, firestoreRead, firestoreQuery, firestoreDelete, firestoreWrite, firestoreBatchWrite } from "../../../../db_calls";
import { DB_NODES } from "../../../../constants";
import { newCheckoutGetStripeReaders } from "../../modal_screens/newCheckoutModalScreen/newCheckoutFirebaseCalls";
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
  todaysHistory: "Today's History",
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
    <div className={adminStyles.dashboardRoot}>
      {/**Modals that will appear when user takes an action */}
      {!!sFacialRecognitionModalUserObj && (
        <FaceEnrollModalScreen
          userObj={sFacialRecognitionModalUserObj}
          handleDescriptorCapture={handleDescriptorCapture}
          handleExitPress={() => _setFacialRecognitionModalUserObj(null)}
        />
      )}
      {!!sPunchClockUserObj && (
        <Suspense fallback={null}>
          <UserClockHistoryModal
            handleExit={() => _setPunchClockUserObj()}
            userObj={sPunchClockUserObj}
          />
        </Suspense>
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
        <Suspense fallback={null}>
          <ScheduleModal handleExit={() => _setShowScheduleModal(false)} />
        </Suspense>
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
      <div className={adminStyles.dashboardRow}>
        {/*********************left-side column container *****************/}
        <div
          className={adminStyles.tabBarScroll}
          style={{
            "--tab-bar-bg": C.backgroundListWhite,
            "--tab-bar-border": C.buttonLightGreenOutline,
            "--tab-bar-spacer": C.borderSubtle,
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
                color: sExpand === TAB_NAMES.sales ? C.green : C.textSecondary,
              }}
              text={TAB_NAMES.sales}
              icon={ICONS.dollarYellow}
              iconSize={25}
            />
            <VerticalSpacer />
            {/****************** today's history tab *****************************/}
            <MenuListLabelComponent
              selected={sExpand === TAB_NAMES.todaysHistory}
              handleExpandPress={() =>
                _setExpand(sExpand === TAB_NAMES.todaysHistory ? null : TAB_NAMES.todaysHistory)
              }
              style={{
                fontWeight: sExpand === TAB_NAMES.todaysHistory ? 500 : null,
                color: sExpand === TAB_NAMES.todaysHistory ? C.green : C.textSecondary,
              }}
              text={TAB_NAMES.todaysHistory}
              icon={ICONS.clock}
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

                color: sExpand === TAB_NAMES.payments ? C.green : C.textSecondary,
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
                color: sExpand === TAB_NAMES.ordering ? C.green : C.textSecondary,
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
                color: sExpand === TAB_NAMES.users ? C.green : C.textSecondary,
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
                color: sExpand === TAB_NAMES.payroll ? C.green : C.textSecondary,
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
                color: sExpand === TAB_NAMES.schedule ? C.green : C.textSecondary,
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
                color: sExpand === TAB_NAMES.quickItems ? C.green : C.textSecondary,
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

                color: sExpand === TAB_NAMES.statuses ? C.green : C.textSecondary,
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

                color: sExpand === TAB_NAMES.lists ? C.green : C.textSecondary,
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
                color: sExpand === TAB_NAMES.storeInfo ? C.green : C.textSecondary,
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
                  sExpand === TAB_NAMES.textTemplates ? C.green : C.textSecondary,
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
                  sExpand === TAB_NAMES.emailTemplates ? C.green : C.textSecondary,
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
                color: sExpand === TAB_NAMES.import ? C.green : C.textSecondary,
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
                color: sExpand === TAB_NAMES.backup ? C.green : C.textSecondary,
              }}
              text={TAB_NAMES.backup}
              icon={ICONS.tools}
              disabled={sMenuLocked}
            />
          </div>
        </div>

        {/*********************right-side column container****************** */}

        {!sExpand && (
          <div className={adminStyles.dashboardEmpty}>
            <Image
              icon={defaultLogo}
              width="60%"
              height="60%"
              className={adminStyles.dashboardEmptyLogo}
            />
          </div>
        )}
        {!!sExpand && <div
          className={adminStyles.dashboardPane}
          style={{ "--pane-title-color": C.textSecondary }}
        >
          <span className={adminStyles.dashboardPaneTitle}>
            {sExpand === TAB_NAMES.payments ? "CARD READERS / RECEIPT PRINTERS" : sExpand?.toUpperCase()}
          </span>
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
          {sExpand === TAB_NAMES.todaysHistory && <TodaysHistoryComponent />}
          {sExpand === TAB_NAMES.import && <ImportComponent />}
          {sExpand === TAB_NAMES.backup && <BackupRecoveryComponent />}
        </div>}
      </div>
    </div>
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
          style={{ color: selected ? C.textWhite : C.textMuted }}
        >
          {text.toUpperCase()}
        </span>
      )}
      {!!dropdownDataArr && (
        <DomDropdownMenu
          buttonStyle={{
            backgroundColor: "transparent",
            padding: 0,
          }}
          buttonText={dropdownLabel}
          dataArr={dropdownDataArr}
          onSelect={onDropdownSelect}
          buttonTextStyle={{
            fontSize: 15,
            color: C.textMuted,
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
      textStyle={{ fontSize: 14, color: C.textSecondary, ...textStyle }}
      buttonStyle={{
        paddingLeft: 0,
        paddingRight: 0,
        paddingTop: 0,
        paddingBottom: 0,
        borderRadius: 5,
        backgroundColor: C.surfaceAlt,
        marginBottom: 0,
        ...style,
      }}
      onPress={onPress}
    />
  );
}

function MoveArrows({ index, listLength, onMove }) {
  const atTop = index === 0;
  const atBottom = index === listLength - 1;
  const btnStyle = (dimmed) => ({
    padding: 4,
    opacity: dimmed ? 0.25 : 1,
    background: "none",
    border: "none",
    cursor: dimmed ? "not-allowed" : "pointer",
  });
  return (
    <div style={{ display: "flex", flexDirection: "row", alignItems: "center", marginLeft: 5, flexShrink: 0 }}>
      <button
        type="button"
        disabled={atTop}
        onClick={() => onMove(index, "up")}
        style={btnStyle(atTop)}
      >
        <Image icon={ICONS.upChevron} size={13} />
      </button>
      <button
        type="button"
        disabled={atBottom}
        onClick={() => onMove(index, "down")}
        style={btnStyle(atBottom)}
      >
        <Image icon={ICONS.downChevron} size={13} />
      </button>
    </div>
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
              <span style={{ fontSize: 11, color: C.textMuted, marginRight: 8 }}>Strict</span>
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
              <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 8 }}>Loose</span>
            </div>
          </div>
        )}
        <div className={adminStyles.ucDivider} style={{ backgroundColor: C.surfaceAlt }} />
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
                            color: editable ? C.text : C.textMuted,
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
                            color: editable ? C.text : C.textMuted,
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
                            color: editable ? C.text : C.textMuted,
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
                            color: editable ? C.text : C.textMuted,
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
                            style={{ color: editable ? C.text : C.textMuted }}
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
                            style={{ color: editable ? C.text : C.textMuted }}
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
                              color: editable ? C.text : C.textMuted,
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
                              style={{ backgroundColor: editable ? status.backgroundColor : C.surfaceAlt }}
                            >
                              <span
                                className={adminStyles.ucChipLabel}
                                style={{ color: editable ? status.textColor : C.textMuted }}
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
                              style={{ backgroundColor: editable ? C.blue : C.surfaceAlt }}
                            >
                              <span
                                className={adminStyles.ucChipLabel}
                                style={{ color: editable ? C.textWhite : C.textMuted }}
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
          padding: 0,
          width: "100%",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            alignItems: "center",
            borderWidth: 1,
            borderStyle: "solid",
            paddingBottom: 30,
            paddingTop: 13,
            paddingLeft: 10,
            paddingRight: 10,
            borderColor: C.buttonLightGreenOutline,
            backgroundColor: C.backgroundListWhite,
            borderRadius: 10,
            boxSizing: "border-box",
          }}
        >
          {/* Status Auto-Text show/hide */}
          <div style={{ display: "flex", flexDirection: "column", width: "100%", marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => _setShowAutoText(!sShowAutoText)}
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                marginBottom: sShowAutoText ? 8 : 0,
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                alignSelf: "flex-start",
              }}
            >
              <span style={{ fontSize: 13, color: C.textMuted, fontWeight: "600" }}>
                {sShowAutoText ? "Status Auto-Text  \u25B2" : "Status Auto-Text  \u25BC"}
              </span>
            </button>
            {sShowAutoText && (
              <StatusAutoTextSection
                zSettingsObj={zSettingsObj}
                handleSettingsFieldChange={handleSettingsFieldChange}
              />
            )}
          </div>

          <div style={{ display: "flex", width: "100%", alignItems: "flex-start" }}>
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
                proto.backgroundColor = C.borderStrong;
                proto.textColor = C.text;
                proto.removable = true;
                proto.requireWaitTime = false;
                proto.hidden = false;
                let newStatuses = [proto, ...zSettingsObj.statuses];
                handleSettingsFieldChange("statuses", newStatuses);
              }}
            />
          </div>
          {statuses.map((item, idx) => {
            let isEditing = sEditableInputIdx === idx;
            return (
              <div
                key={item.id}
                style={{
                  display: "flex",
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
                  <div
                    style={{
                      display: "flex",
                      backgroundColor: item.backgroundColor,
                      alignItems: "center",
                      flexDirection: "row",
                      flex: 1,
                      minHeight: 35,
                      borderRadius: 5,
                    }}
                  >
                    {!item.removable && (
                      <div style={{ width: "10%", flexShrink: 0 }} />
                    )}
                    <div style={{ display: "flex", flexDirection: "column", flex: 1, alignItems: "center", justifyContent: "center" }}>
                      <DomTextInput
                        debounceMs={500}
                        style={{
                          width: "100%",
                          textAlign: "center",
                          color: item.textColor,
                          outline: "none",
                          paddingTop: 4,
                          paddingBottom: 4,
                          fontSize: 13,
                          borderWidth: 1,
                          borderStyle: "solid",
                          borderColor:
                            isEditing && item.removable
                              ? C.borderStrong
                              : "transparent",
                          backgroundColor: "transparent",
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
                        <span style={{ color: item.textColor, fontSize: 10, textAlign: "center", marginTop: -2 }}>
                          <span style={{ fontStyle: "italic" }}>{"Wait time: "}</span>
                          {zSettingsObj.waitTimeLinkedStatus[item.id].label}
                        </span>
                      )}
                    </div>
                    {!item.removable && (
                      <div
                        style={{
                          display: "flex",
                          width: "10%",
                          flexShrink: 0,
                          height: "100%",
                          alignItems: "flex-end",
                          justifyContent: "flex-start",
                          padding: 3,
                        }}
                      >
                        <Image icon={ICONS.blocked} size={15} />
                      </div>
                    )}
                  </div>
                  {/* Controls: edit, delete, color pickers */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "center",
                      marginLeft: 10,
                    }}
                  >
                    <DomTooltip text="Edit label" position="top">
                      <BoxButton1
                        style={{ paddingLeft: 5, paddingRight: 5 }}
                        iconSize={17}
                        icon={isEditing ? ICONS.clickHere : ICONS.editPencil}
                        onPress={() =>
                          _setEditableInputIdx(
                            isEditing ? null : idx
                          )
                        }
                      />
                    </DomTooltip>
                    {item.removable ? (
                      <DomTooltip text="Delete status" position="top">
                        <BoxButton1
                          style={{ paddingLeft: 5, paddingRight: 5 }}
                          iconSize={15}
                          icon={ICONS.trash}
                          onPress={() => {
                            let newStatuses = zSettingsObj.statuses.filter(
                              (o) => o.id != item.id
                            );
                            handleSettingsFieldChange("statuses", newStatuses);
                          }}
                        />
                      </DomTooltip>
                    ) : (
                      <div style={{ display: "flex", paddingLeft: 5, paddingRight: 5, opacity: 0.3, cursor: "not-allowed" }}>
                        <Image icon={ICONS.trash} size={15} />
                      </div>
                    )}
                    <DomTooltip text="Edit colors" position="top">
                      <BoxButton1
                        style={{ paddingLeft: 5, paddingRight: 5 }}
                        iconSize={23}
                        icon={ICONS.colorWheel}
                        onPress={() => {
                          _setColorModalItem(item);
                          _setModalBgColor(item.backgroundColor);
                          _setModalTextColor(item.textColor);
                        }}
                      />
                    </DomTooltip>
                    <DomTooltip text="Require wait time before status change" position="top">
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
                    </DomTooltip>
                    <DomTooltip text="Auto-add this wait time" position="top">
                      <DomDropdownMenu
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
                          paddingLeft: 5,
                          paddingRight: 5,
                          paddingTop: 0,
                          paddingBottom: 0,
                        }}
                        buttonText={""}
                        menuMaxHeight={300}
                      />
                    </DomTooltip>
                    <DomTooltip text="Hidden from status picker" position="top">
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
                    </DomTooltip>
                  </div>
                  {/* Drag direction indicators */}
                  {sDragOverIdx === idx && sDragIdx !== null && sDragIdx !== idx && sDragIdx > idx && (
                    <Image
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
                    <Image
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
        </div>
      </BoxContainerInnerComponent>

      {/* Color picker modal */}
      {!!sColorModalItem && createPortal(
        <div
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
            style={{
              display: "flex",
              backgroundColor: C.backgroundListWhite,
              borderRadius: 10,
              padding: 30,
              maxWidth: 900,
              width: "90%",
              maxHeight: "85%",
              borderWidth: 2,
              borderStyle: "solid",
              borderColor: C.buttonLightGreenOutline,
              flexDirection: "row",
              alignItems: "stretch",
              boxSizing: "border-box",
            }}
          >
            {/* Status list sidebar */}
            <div style={{ display: "flex", flexDirection: "column", width: 180, flexShrink: 0, paddingRight: 15 }}>
              <span style={{ fontSize: 13, fontWeight: "600", color: C.textMuted, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Copy From
              </span>
              <div style={{ flex: 1, overflowY: "auto" }}>
                {(zSettingsObj.statuses || []).filter((s) => !s.hidden && s.id !== sColorModalItem.id).map((status) => (
                  <button
                    key={status.id}
                    type="button"
                    onClick={() => {
                      _setModalBgColor(status.backgroundColor);
                      _setModalTextColor(status.textColor);
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      backgroundColor: status.backgroundColor,
                      borderRadius: 6,
                      paddingTop: 8,
                      paddingBottom: 8,
                      paddingLeft: 10,
                      paddingRight: 10,
                      marginBottom: 6,
                      borderWidth: 1,
                      borderStyle: "solid",
                      borderColor: C.borderSubtle,
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ color: status.textColor, fontSize: 12, fontWeight: "500", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>
                      {status.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div style={{ width: 1, flexShrink: 0, backgroundColor: C.surfaceAlt, marginLeft: 15, marginRight: 15 }} />

            {/* Main color picker area */}
            <div style={{ display: "flex", flexDirection: "column", flex: 1, alignItems: "center" }}>
              <span style={{ fontSize: 16, fontWeight: "600", color: C.text, marginBottom: 20 }}>
                Edit Status Colors
              </span>

              {/* Live preview */}
              <div
                style={{
                  display: "flex",
                  backgroundColor: sModalBgColor,
                  borderRadius: 5,
                  paddingTop: 10,
                  paddingBottom: 10,
                  paddingLeft: 30,
                  paddingRight: 30,
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 200,
                  marginBottom: 25,
                }}
              >
                <span style={{ color: sModalTextColor, fontSize: 14, fontWeight: "500" }}>
                  {sColorModalItem.label}
                </span>
              </div>

              {/* Two color wheels side by side */}
              <div style={{ display: "flex", flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: 30 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: C.text, marginBottom: 8, fontWeight: "500" }}>
                    Background Color
                  </span>
                  <ColorWheel
                    key={"bg-" + sModalBgColor}
                    initialColor={sModalBgColor}
                    onColorChange={(val) => {
                      _setModalBgColor(val.hex);
                    }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: C.text, marginBottom: 8, fontWeight: "500" }}>
                    Text Color
                  </span>
                  <ColorWheel
                    key={"text-" + sModalTextColor}
                    initialColor={sModalTextColor}
                    onColorChange={(val) => {
                      _setModalTextColor(val.hex);
                    }}
                  />
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", flexDirection: "row", justifyContent: "center", marginTop: 25, gap: 15 }}>
                <DomButton
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
                <DomButton
                  text="Exit (discard any changes)"
                  colorGradientArr={COLOR_GRADIENTS.grey}
                  onPress={() => _setColorModalItem(null)}
                />
              </div>
            </div>
          </div>
        </div>,
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

  const numInputStyle = {
    width: 50,
    height: 30,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: C.borderSubtle,
    borderRadius: 6,
    paddingLeft: 6,
    paddingRight: 6,
    textAlign: "center",
    fontSize: 12,
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", paddingLeft: 4, paddingRight: 4 }}>
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
          <div
            key={rule.id}
            style={{
              display: "flex",
              flexDirection: "column",
              width: "100%",
              borderWidth: 1,
              borderStyle: "solid",
              borderColor: C.buttonLightGreenOutline,
              borderRadius: 8,
              backgroundColor: C.listItemWhite,
              padding: 10,
              marginBottom: 8,
              boxSizing: "border-box",
            }}
          >
            {/* Status selector */}
            <div style={{ display: "flex", flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: C.textMuted, width: 70, flexShrink: 0 }}>Status</span>
              <DomDropdownMenu
                dataArr={availableStatuses.map((s) => ({ label: s.label, id: s.id }))}
                onSelect={(val) => updateRule(rule.id, "statusID", val.id)}
                buttonText={getStatusLabel(rule.statusID)}
                buttonStyle={{
                  flex: 1,
                  backgroundColor: statusObj?.backgroundColor || C.surfaceAlt,
                  paddingTop: 6,
                  paddingBottom: 6,
                  borderRadius: 6,
                }}
                buttonTextStyle={{
                  color: statusObj?.textColor || C.text,
                  fontSize: 12,
                  fontWeight: "500",
                }}
              />
            </div>

            {/* SMS template selector */}
            <div style={{ display: "flex", flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: C.textMuted, width: 70, flexShrink: 0 }}>SMS</span>
              <DomDropdownMenu
                dataArr={[{ label: "None", id: "" }, ...smsTemplates.map((t) => ({ label: t.label, id: t.id }))]}
                onSelect={(val) => updateRule(rule.id, "smsTemplateID", val.id)}
                buttonText={getTemplateLabel(rule.smsTemplateID, smsTemplates)}
                buttonStyle={{
                  flex: 1,
                  paddingTop: 6,
                  paddingBottom: 6,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: C.borderSubtle,
                }}
                buttonTextStyle={{ fontSize: 12, color: C.text }}
              />
            </div>

            {/* Email template selector */}
            <div style={{ display: "flex", flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: C.textMuted, width: 70, flexShrink: 0 }}>Email</span>
              <DomDropdownMenu
                dataArr={[{ label: "None", id: "" }, ...emailTemplates.map((t) => ({ label: t.label, id: t.id }))]}
                onSelect={(val) => updateRule(rule.id, "emailTemplateID", val.id)}
                buttonText={getTemplateLabel(rule.emailTemplateID, emailTemplates)}
                buttonStyle={{
                  flex: 1,
                  paddingTop: 6,
                  paddingBottom: 6,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: C.borderSubtle,
                }}
                buttonTextStyle={{ fontSize: 12, color: C.text }}
              />
            </div>

            {/* Delay inputs */}
            <div style={{ display: "flex", flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: C.textMuted, width: 70, flexShrink: 0 }}>Delay</span>
              <DomTextInput
                debounceMs={500}
                value={String(rule.delayMinutes || 0)}
                onChangeText={(val) => {
                  let num = parseInt(val, 10);
                  if (isNaN(num) || num < 0) num = 0;
                  updateRule(rule.id, "delayMinutes", num);
                }}
                style={numInputStyle}
              />
              <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 4, marginRight: 4 }}>min</span>
              <DomTextInput
                debounceMs={500}
                value={String(rule.delaySeconds || 0)}
                onChangeText={(val) => {
                  let num = parseInt(val, 10);
                  if (isNaN(num) || num < 0) num = 0;
                  if (num > 59) num = 59;
                  updateRule(rule.id, "delaySeconds", num);
                }}
                style={numInputStyle}
              />
              <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 4, marginRight: 4 }}>sec</span>
            </div>

            {/* Delete button */}
            <button
              type="button"
              onClick={() => deleteRule(rule.id)}
              style={{
                alignSelf: "flex-end",
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
              }}
            >
              <span style={{ fontSize: 11, color: C.lightred, fontWeight: "500" }}>Delete</span>
            </button>
          </div>
        );
      })}
      {rules.length === 0 && (
        <span style={{ fontSize: 11, color: C.textMuted, fontStyle: "italic" }}>
          No auto-text rules configured. Tap + to add one.
        </span>
      )}
    </div>
  );
};


const OrderingComponent = () => {
  return (
    <BoxContainerOuterComponent>
      <BoxContainerInnerComponent style={{ width: "100%", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
        <span style={{ color: C.textDisabled, fontSize: 28, fontWeight: "600" }}>Ordering system not ready</span>
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
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            padding: 16,
            borderBottom: "1px solid " + C.borderSubtle,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 16,
              fontWeight: Fonts.weight.textHeavy,
              color: C.text,
            }}
          >
            Stand Button — Select Item
          </span>
          <DomTouchableOpacity onPress={onClose}>
            <Image icon={ICONS.close1} size={18} />
          </DomTouchableOpacity>
        </div>

        {/* Label input */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            paddingTop: 16,
            paddingBottom: 8,
            paddingLeft: 16,
            paddingRight: 16,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: Fonts.weight.textHeavy,
              color: C.blue,
              marginBottom: 4,
            }}
          >
            BUTTON LABEL
          </span>
          <DomTextInput
            style={{
              borderBottom: "1px solid " + C.borderStrong,
              width: "100%",
              fontSize: 14,
              color: C.text,
              paddingTop: 6,
              paddingBottom: 6,
              outline: "none",
              boxSizing: "border-box",
            }}
            value={sLabel}
            onChangeText={_setLabel}
            placeholder="Button label..."
            placeholderTextColor={C.textDisabled}
          />
        </div>

        {/* Currently selected item */}
        {resolvedItem && (
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              marginLeft: 16,
              marginRight: 16,
              marginBottom: 8,
              paddingTop: 8,
              paddingBottom: 8,
              paddingLeft: 10,
              paddingRight: 10,
              backgroundColor: "rgb(230, 240, 252)",
              borderRadius: 4,
              borderLeft: "3px solid " + C.blue,
              boxSizing: "border-box",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <span style={{ fontSize: 13, color: C.text }}>
                {resolvedItem.informalName ||
                  resolvedItem.formalName ||
                  "Unknown"}
              </span>
              <span style={{ fontSize: 11, color: C.lightText }}>
                ${formatCurrencyDisp(resolvedItem.price || 0)}
              </span>
            </div>
            <DomTouchableOpacity
              onPress={() => {
                _setSelectedItemID("");
                _setLabel("");
              }}
              style={{
                paddingLeft: 8,
                paddingRight: 8,
                paddingTop: 4,
                paddingBottom: 4,
                backgroundColor: C.surfaceAlt,
                borderRadius: 4,
              }}
            >
              <span style={{ fontSize: 10, color: C.lightred }}>Remove</span>
            </DomTouchableOpacity>
          </div>
        )}

        {/* Search input */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            paddingTop: 8,
            paddingBottom: 8,
            paddingLeft: 16,
            paddingRight: 16,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: Fonts.weight.textHeavy,
              color: C.blue,
              marginBottom: 4,
            }}
          >
            SEARCH INVENTORY
          </span>
          <DomTextInput
            style={{
              borderBottom: "1px solid " + C.borderStrong,
              width: "100%",
              fontSize: 14,
              color: C.text,
              paddingTop: 6,
              paddingBottom: 6,
              outline: "none",
              boxSizing: "border-box",
            }}
            value={sSearchString}
            onChangeText={handleSearch}
            placeholder="Search inventory (min 3 chars)..."
            placeholderTextColor={C.textDisabled}
            autoFocus
          />
        </div>

        {/* Search results */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            marginLeft: 16,
            marginRight: 16,
            marginBottom: 8,
            border: sSearchResults.length > 0 ? "1px solid " + C.borderSubtle : "none",
            borderRadius: 4,
            backgroundColor: "white",
            boxSizing: "border-box",
          }}
        >
          {sSearchResults.map((item, idx) => (
            <DomTouchableOpacity
              key={item.id || idx}
              onPress={() => handleSelectItem(item)}
              style={{
                display: "flex",
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                padding: 8,
                borderBottom: "1px solid " + C.borderSubtle,
                boxSizing: "border-box",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                <span style={{ fontSize: 13, color: C.text }}>
                  {item.informalName || item.formalName || "Unknown"}
                </span>
                {!!item.brand && (
                  <span style={{ fontSize: 11, color: C.textMuted }}>
                    {item.brand}
                  </span>
                )}
              </div>
              <span style={{ fontSize: 13, color: C.text }}>
                ${formatCurrencyDisp(item.price || 0)}
              </span>
            </DomTouchableOpacity>
          ))}
        </div>

        {/* Footer with Save/Cancel */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "flex-end",
            padding: 16,
            borderTop: "1px solid " + C.borderSubtle,
            flexShrink: 0,
            boxSizing: "border-box",
          }}
        >
          <DomButton
            text="Cancel"
            onPress={onClose}
            buttonStyle={{
              paddingLeft: 16,
              paddingRight: 16,
              paddingTop: 8,
              paddingBottom: 8,
              marginRight: 10,
              backgroundColor: C.surfaceAlt,
            }}
            textStyle={{ color: C.text }}
          />
          <DomButton
            text="Save"
            colorGradientArr={COLOR_GRADIENTS.green}
            onPress={() =>
              onSave({
                ...buttonObj,
                label: sLabel,
                inventoryItemID: sSelectedItemID,
              })
            }
            buttonStyle={{
              paddingLeft: 16,
              paddingRight: 16,
              paddingTop: 8,
              paddingBottom: 8,
            }}
          />
        </div>
      </div>
    </div>,
    document.body
  );
};
