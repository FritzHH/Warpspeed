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
import { C, COLOR_GRADIENTS, Fonts, ICONS } from "../../../../styles";
import { useZ } from "../../../../hooks/useZ";
import defaultLogo from "../../../../resources/default_app_logo_large.png";
import { DISCOUNT_TYPES, PERMISSION_LEVELS, build_db_path } from "../../../../constants";
import { APP_USER, COLORS, INTAKE_QUICK_BUTTON_PROTO, NOTE_HELPER_PROTO, NOTE_HELPER_ITEM_PROTO, QUICK_CUSTOMER_NOTE_PROTO, QUICK_CUSTOMER_NOTE_ITEM_PROTO, WORKORDER_ITEM_PROTO, SETTINGS_OBJ, STATUS_AUTO_TEXT_PROTO, TIME_PUNCH_PROTO, TAB_NAMES as APP_TAB_NAMES, QB_DEFAULT_W, QB_DEFAULT_H, QB_SNAP_PCT, levelToPrivilegeName } from "../../../../data";
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
const AnalyticsModalScreen = lazy(() =>
  import("../../modal_screens/AnalyticsModalScreen/AnalyticsModalScreen").then((m) => ({
    default: m.AnalyticsModalScreen,
  }))
);
const InviteUserModal = lazy(() =>
  import("../../modal_screens/InviteUserModal").then((m) => ({
    default: m.InviteUserModal,
  }))
);
const DLQAdminModalScreen = lazy(() =>
  import("../../modal_screens/DLQAdminModalScreen/DLQAdminModalScreen").then((m) => ({
    default: m.DLQAdminModalScreen,
  }))
);
const BillingModalScreen = lazy(() =>
  import("../../modal_screens/BillingModalScreen/BillingModalScreen").then((m) => ({
    default: m.BillingModalScreen,
  }))
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
  analytics: "Analytics",
  dlqAdmin: "DLQ Admin",
  subscription: "Subscription",
};

const TAB_GATES = {
  [TAB_NAMES.sales]: 1,
  [TAB_NAMES.todaysHistory]: 1,
  [TAB_NAMES.payments]: 1,
  [TAB_NAMES.labelDesigner]: 2,
  [TAB_NAMES.ordering]: 2,
  [TAB_NAMES.quickItems]: 2,
  [TAB_NAMES.payroll]: 3,
  [TAB_NAMES.schedule]: 3,
  [TAB_NAMES.statuses]: 3,
  [TAB_NAMES.lists]: 3,
  [TAB_NAMES.analytics]: 4,
  [TAB_NAMES.users]: 4,
  [TAB_NAMES.storeInfo]: 4,
  [TAB_NAMES.textTemplates]: 4,
  [TAB_NAMES.emailTemplates]: 4,
  [TAB_NAMES.import]: 4,
  [TAB_NAMES.backup]: 4,
};

export function Dashboard_Admin({}) {
  // store getters ///////////////////////////////////////////////////////////
  const zSettingsObj = useSettingsStore((state) => state.settings);
  const zLiveReaders = useStripePaymentStore((state) => state.readersArr) || [];
  const zCurrentUserLevel = useLoginStore((state) => state.currentUser?.permissions?.level || 0);
  const zIsPlatformAdmin = useLoginStore((state) => state.getAuthClaims())?.platformAdmin === true;
  const zIsSaasOwner = useLoginStore((state) => state.getAuthClaims())?.privilege === "owner";
  const guardedMenuPress = (action, level = 3) => () =>
    useLoginStore.getState().execute(action, levelToPrivilegeName(level));
  // local state ///////////////////////////////////////////////////////////
  const [sFacialRecognitionModalUserObj, _setFacialRecognitionModalUserObj] =
    useState(false);
  const [sPunchClockUserObj, _setPunchClockUserObj] = useState(null);
  const [sShowSalesReportModal, _setShowSalesReportModal] = useState(false);
  const [sShowPayrollModal, _setShowPayrollModal] = useState(false);
  const [sPayrollPreselectUserObj, _setPayrollPreselectUserObj] = useState(null);
  const [sShowScheduleModal, _setShowScheduleModal] = useState(false);
  const sExpand = useTabNamesStore((state) => state.getDashboardExpand());
  const _setExpand = useTabNamesStore((state) => state.setDashboardExpand);
  const [sStandEditButtonObj, _setStandEditButtonObj] = useState(null);
  const [sShowLabelDesigner, _setShowLabelDesigner] = useState(false);
  const [sShowAnalyticsModal, _setShowAnalyticsModal] = useState(false);
  const [sShowDLQAdminModal, _setShowDLQAdminModal] = useState(false);
  const [sShowBillingModal, _setShowBillingModal] = useState(false);

  //////////////////////////////////////////////////////////////////////////

  function commitUserInfoChange(userObj, isNewUser) {
    const liveUsers = useSettingsStore.getState().settings.users;
    const prevUser = isNewUser ? null : liveUsers.find((o) => o.id === userObj.id);
    const prevLinkedID = prevUser?.linkedUserID || "";
    const newLinkedID = userObj.linkedUserID || "";

    let userArr;
    if (isNewUser) {
      userArr = [userObj, ...liveUsers];
    } else {
      userArr = liveUsers.map((o) => (o.id === userObj.id ? { ...userObj } : o));
    }

    if (prevLinkedID !== newLinkedID) {
      userArr = userArr.map((o) => {
        if (o.id === prevLinkedID && o.linkedUserID === userObj.id) {
          return { ...o, linkedUserID: "" };
        }
        if (o.id === newLinkedID) {
          return { ...o, linkedUserID: userObj.id };
        }
        return o;
      });
    }

    useSettingsStore.getState().setField("users", userArr);
    if (isNewUser) {
      useLoginStore.getState().setSendWelcomeMessageToUser(userObj);
    }
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
      {!!sShowSalesReportModal && zCurrentUserLevel >= TAB_GATES[TAB_NAMES.sales] && (
        <Suspense fallback={null}>
          <SalesReportsModal handleExit={() => _setShowSalesReportModal(false)} />
        </Suspense>
      )}
      {!!sShowPayrollModal && zCurrentUserLevel >= TAB_GATES[TAB_NAMES.payroll] && (
        <Suspense fallback={null}>
          <PayrollModal
            handleExit={() => {
              _setShowPayrollModal(false);
              _setPayrollPreselectUserObj(null);
            }}
            preselectedUser={sPayrollPreselectUserObj}
          />
        </Suspense>
      )}
      {!!sShowScheduleModal && zCurrentUserLevel >= TAB_GATES[TAB_NAMES.schedule] && (
        <Suspense fallback={null}>
          <ScheduleModal handleExit={() => _setShowScheduleModal(false)} />
        </Suspense>
      )}
      {!!sShowAnalyticsModal && zCurrentUserLevel >= TAB_GATES[TAB_NAMES.analytics] && (
        <Suspense fallback={null}>
          <AnalyticsModalScreen handleExit={() => _setShowAnalyticsModal(false)} />
        </Suspense>
      )}
      {!!sShowDLQAdminModal && zIsPlatformAdmin && (
        <Suspense fallback={null}>
          <DLQAdminModalScreen handleExit={() => _setShowDLQAdminModal(false)} />
        </Suspense>
      )}
      {!!sShowBillingModal && zIsSaasOwner && (
        <Suspense fallback={null}>
          <BillingModalScreen handleExit={() => _setShowBillingModal(false)} />
        </Suspense>
      )}
      {!!sShowLabelDesigner && zCurrentUserLevel >= TAB_GATES[TAB_NAMES.labelDesigner] && (
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
            {(() => {
              const menuItems = [
                { key: "sales", label: TAB_NAMES.sales, icon: ICONS.dollarYellow, iconSize: 25, gate: TAB_GATES[TAB_NAMES.sales], onClick: () => _setShowSalesReportModal(true) },
                { key: "labelDesigner", label: TAB_NAMES.labelDesigner, icon: ICONS.print, gate: TAB_GATES[TAB_NAMES.labelDesigner], onClick: () => _setShowLabelDesigner(true) },
                { key: "payroll", label: TAB_NAMES.payroll, icon: ICONS.greenDollar, iconSize: 25, gate: TAB_GATES[TAB_NAMES.payroll], onClick: () => _setShowPayrollModal(true) },
                { key: "schedule", label: TAB_NAMES.schedule, icon: ICONS.clock, iconSize: 22, gate: TAB_GATES[TAB_NAMES.schedule], onClick: () => _setShowScheduleModal(true) },
                { key: "analytics", label: TAB_NAMES.analytics, icon: ICONS.greenDollar, iconSize: 25, gate: TAB_GATES[TAB_NAMES.analytics], onClick: () => _setShowAnalyticsModal(true) },
                { key: "todaysHistory", label: TAB_NAMES.todaysHistory, icon: ICONS.clock, iconSize: 25, gate: TAB_GATES[TAB_NAMES.todaysHistory], tab: TAB_NAMES.todaysHistory },
                { key: "payments", label: TAB_NAMES.payments, icon: ICONS.paymentProcessing, gate: TAB_GATES[TAB_NAMES.payments], tab: TAB_NAMES.payments, onOpen: () => {
                  newCheckoutGetStripeReaders().then((result) => {
                    let arr = result?.data?.data || [];
                    useStripePaymentStore.getState().setReadersArr(arr);
                  }).catch(() => { });
                } },
                { key: "ordering", label: TAB_NAMES.ordering, icon: ICONS.ordering, gate: TAB_GATES[TAB_NAMES.ordering], tab: TAB_NAMES.ordering },
                { key: "users", label: TAB_NAMES.users, icon: ICONS.userControl, gate: TAB_GATES[TAB_NAMES.users], tab: TAB_NAMES.users },
                { key: "quickItems", label: TAB_NAMES.quickItems, icon: ICONS.quickItemButton, gate: TAB_GATES[TAB_NAMES.quickItems], tab: TAB_NAMES.quickItems },
                { key: "statuses", label: TAB_NAMES.statuses, icon: ICONS.workorderStatuses, gate: TAB_GATES[TAB_NAMES.statuses], tab: TAB_NAMES.statuses },
                { key: "lists", label: TAB_NAMES.lists, icon: ICONS.listsAndOptions, gate: TAB_GATES[TAB_NAMES.lists], tab: TAB_NAMES.lists },
                { key: "storeInfo", label: TAB_NAMES.storeInfo, icon: ICONS.storeInfo, gate: TAB_GATES[TAB_NAMES.storeInfo], tab: TAB_NAMES.storeInfo },
                { key: "textTemplates", label: TAB_NAMES.textTemplates, icon: ICONS.notes, gate: TAB_GATES[TAB_NAMES.textTemplates], tab: TAB_NAMES.textTemplates },
                { key: "emailTemplates", label: TAB_NAMES.emailTemplates, icon: ICONS.notes, gate: TAB_GATES[TAB_NAMES.emailTemplates], tab: TAB_NAMES.emailTemplates },
                { key: "import", label: TAB_NAMES.import, icon: ICONS.importIcon, gate: TAB_GATES[TAB_NAMES.import], tab: TAB_NAMES.import },
                { key: "backup", label: TAB_NAMES.backup, icon: ICONS.tools, gate: TAB_GATES[TAB_NAMES.backup], tab: TAB_NAMES.backup },
              ];
              if (zIsPlatformAdmin) {
                menuItems.push({
                  key: "dlqAdmin",
                  label: TAB_NAMES.dlqAdmin,
                  icon: ICONS.tools,
                  gate: 4,
                  onClick: () => _setShowDLQAdminModal(true),
                });
              }
              if (zIsSaasOwner) {
                menuItems.push({
                  key: "subscription",
                  label: TAB_NAMES.subscription,
                  icon: ICONS.greenDollar,
                  iconSize: 25,
                  gate: 4,
                  onClick: () => _setShowBillingModal(true),
                });
              }
              menuItems.sort((a, b) => (a.gate - b.gate) || a.label.localeCompare(b.label));
              return menuItems.map((item) => {
                const selected = item.tab ? sExpand === item.tab : false;
                const action = item.tab
                  ? () => {
                      const opening = sExpand !== item.tab;
                      _setExpand(opening ? item.tab : null);
                      if (opening && item.onOpen) item.onOpen();
                    }
                  : item.onClick;
                return (
                  <React.Fragment key={item.key}>
                    <MenuListLabelComponent
                      selected={selected}
                      handleExpandPress={guardedMenuPress(action, item.gate)}
                      text={item.label}
                      icon={item.icon}
                      iconSize={item.iconSize}
                      style={{
                        fontWeight: selected ? 500 : null,
                        color: selected ? C.green : C.textSecondary,
                      }}
                      locked={zCurrentUserLevel < item.gate}
                    />
                    <VerticalSpacer />
                  </React.Fragment>
                );
              });
            })()}
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
        {!!sExpand && (() => {
          const paneAuthorized = zCurrentUserLevel >= (TAB_GATES[sExpand] || 0);
          return (
            <div
              className={adminStyles.dashboardPane}
              style={{ "--pane-title-color": C.textSecondary }}
            >
              {paneAuthorized && (
                <>
                  <span className={adminStyles.dashboardPaneTitle}>
                    {sExpand === TAB_NAMES.payments ? "CARD READERS / RECEIPT PRINTERS" : sExpand?.toUpperCase()}
                  </span>
                  {sExpand === TAB_NAMES.payments && (
                    <>
                      <PaymentProcessingComponent
                        zSettingsObj={zSettingsObj}
                        handleSettingsFieldChange={handleSettingsFieldChange}
                        liveReaders={zLiveReaders}
                        currentUserLevel={zCurrentUserLevel}
                      />
                      <PrintersComponent
                        zSettingsObj={zSettingsObj}
                        handleSettingsFieldChange={handleSettingsFieldChange}
                        currentUserLevel={zCurrentUserLevel}
                      />
                    </>
                  )}
                  {sExpand === TAB_NAMES.users && (
                    <AppUserListComponent
                      handleRemoveUserPress={handleRemoveUserPress}
                      zSettingsObj={zSettingsObj}
                      commitUserInfoChange={commitUserInfoChange}
                      handleSettingsFieldChange={handleSettingsFieldChange}
                      onOpenPayrollForUser={(userObj) => {
                        _setPayrollPreselectUserObj(userObj);
                        _setShowPayrollModal(true);
                      }}
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
                </>
              )}
            </div>
          );
        })()}
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
  locked,
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
      aria-disabled={locked || undefined}
      style={locked ? { opacity: 0.4 } : undefined}
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
  handleRemoveUserPress,
  handleSettingsFieldChange,
  onOpenPayrollForUser,
}) => {
  const [sSelectedUserId, _setSelectedUserId] = useState(null);
  const [sDraftUser, _setDraftUser] = useState(null);
  const [sOriginalUser, _setOriginalUser] = useState(null);
  const [sIsNewUser, _setIsNewUser] = useState(false);
  const [sIsDirty, _setIsDirty] = useState(false);
  const [sShowPin, _setShowPin] = useState(false);
  const [sShowWage, _setShowWage] = useState(false);
  const [sPinError, _setPinError] = useState("");
  const [sFaceModalDraftActive, _setFaceModalDraftActive] = useState(false);
  const [sShowInviteSaasModal, _setShowInviteSaasModal] = useState(false);
  const [sLoginTimeout, _setLoginTimeout] = useState(zSettingsObj?.activeLoginTimeoutSeconds || "");
  const [sLockHours, _setLockHours] = useState(zSettingsObj?.idleLoginTimeoutHours ? String(Math.round(zSettingsObj.idleLoginTimeoutHours)) : "");
  const [sPinLength, _setPinLength] = useState(zSettingsObj?.userPinStrength || "");
  const [sClockTick, _setClockTick] = useState(0);
  const zCurrentUserLevel = useLoginStore((state) => state.currentUser?.permissions?.level || 0);
  const zPunchClock = useLoginStore((state) => state.punchClock);
  const zAuthClaims = useLoginStore((state) => state.authClaims);
  const zEmailAccountsAll = useEmailStore((state) => state.emailAccounts) || [];
  const zEmailAccounts = zEmailAccountsAll.filter(
    (a) => !a.assignedStoreID || a.assignedStoreID === zSettingsObj?.storeID
  );
  const canEditUsers = zCurrentUserLevel >= PERMISSION_LEVELS.superUser.level;
  const isSaasOwner = zAuthClaims?.privilege === "owner";

  useEffect(() => {
    const id = setInterval(() => _setClockTick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  function formatElapsedSince(startMillis) {
    let diff = Date.now() - startMillis;
    if (diff < 0) diff = 0;
    let totalMin = Math.floor(diff / 60000);
    let h = Math.floor(totalMin / 60);
    let m = totalMin % 60;
    if (h === 0) return m + "m";
    return h + "h " + m + "m";
  }

  function handleTogglePunch(userObj) {
    let isClockedIn = !!zPunchClock?.[userObj.id];
    useLoginStore.getState().setCreateUserClock(userObj.id, new Date().getTime(), isClockedIn ? "out" : "in");
  }

  const ROLE_BADGE_COLORS = {
    1: { bg: "#d4d4d4", fg: "#333333" }, // light gray (User)
    2: { bg: "#6b6b6b", fg: "#ffffff" }, // dark gray (Editor)
    3: { bg: "#2e8b57", fg: "#ffffff" }, // green (Admin)
    4: { bg: "#7b4ea3", fg: "#ffffff" }, // purple (Super-User)
    5: { bg: "#c0392b", fg: "#ffffff" }, // red (reserved)
  };
  function roleBadgeColors(level) {
    return ROLE_BADGE_COLORS[level] || ROLE_BADGE_COLORS[1];
  }

  function selectUser(userId) {
    let userObj = (zSettingsObj?.users || []).find((u) => u.id === userId);
    if (!userObj) return;
    _setSelectedUserId(userId);
    _setDraftUser(cloneDeep(userObj));
    _setOriginalUser(cloneDeep(userObj));
    _setIsNewUser(false);
    _setIsDirty(false);
    _setShowPin(false);
    _setShowWage(false);
    _setPinError("");
  }

  function tryChangeSelection(action) {
    if (sIsDirty) {
      useAlertScreenStore.getState().setValues({
        title: "UNSAVED CHANGES",
        message: "Discard your unsaved changes?",
        btn1Text: "DISCARD",
        btn2Text: "KEEP EDITING",
        handleBtn1Press: action,
        handleBtn2Press: () => null,
        showAlert: true,
      });
    } else {
      action();
    }
  }

  function handleNewUserPress() {
    tryChangeSelection(() => {
      let userObj = cloneDeep(APP_USER);
      userObj.id = crypto.randomUUID();
      userObj.permissions = cloneDeep(PERMISSION_LEVELS.user);
      _setSelectedUserId(userObj.id);
      _setDraftUser(cloneDeep(userObj));
      _setOriginalUser(cloneDeep(userObj));
      _setIsNewUser(true);
      _setIsDirty(false);
      _setShowPin(false);
      _setShowWage(false);
      _setPinError("");
    });
  }

  function handleSave() {
    if (!sDraftUser) return;

    const first = (sDraftUser.first || "").trim();
    const last = (sDraftUser.last || "").trim();
    const pin = (sDraftUser.pin || "").trim();
    const isHighPriv = (sDraftUser.permissions?.level || 0) >= PERMISSION_LEVELS.superUser.level;
    const configuredLen = Number(zSettingsObj?.userPinStrength) || 4;
    const requiredPinLen = isHighPriv ? 4 : configuredLen;

    let error = null;
    if (!first) error = "First name is required";
    else if (!last) error = "Last name is required";
    else if (!pin) error = "PIN is required";
    else if (pin.length !== requiredPinLen) {
      error = "PIN must be exactly " + requiredPinLen + " digit" + (requiredPinLen === 1 ? "" : "s");
    } else {
      const liveUsers = useSettingsStore.getState().settings?.users || [];
      const otherUsers = liveUsers.filter((u) => u.id !== sDraftUser.id);
      for (const u of otherUsers) {
        if (u.pin && u.pin === pin) { error = "PIN matches another user's PIN"; break; }
        if (u.alternatePin && u.alternatePin === pin) { error = "PIN matches another user's alternate PIN"; break; }
      }
      if (!error && sDraftUser.alternatePin && sDraftUser.alternatePin === pin) {
        error = "PIN cannot match this user's own alternate PIN";
      }
    }

    if (error) {
      useAlertScreenStore.getState().setValues({
        title: "INVALID USER",
        message: error,
        btn1Text: "OK",
        handleBtn1Press: () => null,
        showAlert: true,
      });
      return;
    }

    commitUserInfoChange(sDraftUser, sIsNewUser);
    _setOriginalUser(cloneDeep(sDraftUser));
    _setIsNewUser(false);
    _setIsDirty(false);
    _setPinError("");
  }

  function handleCancel() {
    if (sIsNewUser) {
      _setSelectedUserId(null);
      _setDraftUser(null);
      _setOriginalUser(null);
      _setIsNewUser(false);
    } else {
      _setDraftUser(cloneDeep(sOriginalUser));
    }
    _setIsDirty(false);
    _setShowPin(false);
    _setShowWage(false);
    _setPinError("");
  }

  function handleDelete() {
    if (!sDraftUser) return;

    if (!sIsNewUser) {
      const currentUserId = useLoginStore.getState().currentUser?.id;
      if (sDraftUser.id === currentUserId) {
        useAlertScreenStore.getState().setValues({
          title: "CANNOT DELETE",
          message: "You cannot delete the user you are currently logged in as.",
          btn1Text: "OK",
          handleBtn1Press: () => null,
          showAlert: true,
        });
        return;
      }
      const liveUsers = useSettingsStore.getState().settings?.users || [];
      const superUsers = liveUsers.filter((u) => (u.permissions?.level || 0) >= PERMISSION_LEVELS.superUser.level);
      if (superUsers.length === 1 && superUsers[0].id === sDraftUser.id) {
        useAlertScreenStore.getState().setValues({
          title: "CANNOT DELETE",
          message: "Cannot delete the only super-user. Promote another user to super-user first.",
          btn1Text: "OK",
          handleBtn1Press: () => null,
          showAlert: true,
        });
        return;
      }
    }

    useAlertScreenStore.getState().setValues({
      title: "DELETE USER",
      message: "Are you sure you want to delete " + capitalizeFirstLetterOfString(sDraftUser.first) + " " + capitalizeFirstLetterOfString(sDraftUser.last) + "?",
      btn1Text: "DELETE",
      btn2Text: "CANCEL",
      handleBtn1Press: () => {
        if (!sIsNewUser) handleRemoveUserPress(sDraftUser);
        _setSelectedUserId(null);
        _setDraftUser(null);
        _setOriginalUser(null);
        _setIsNewUser(false);
        _setIsDirty(false);
      },
      handleBtn2Press: () => null,
      showAlert: true,
    });
  }

  function updateDraft(patch) {
    _setDraftUser((prev) => (prev ? { ...prev, ...patch } : prev));
    _setIsDirty(true);
  }

  function handleFaceCaptureToDraft(desc) {
    updateDraft({ faceDescriptor: desc ? Array.from(desc) : "" });
  }

  const ucVars = {
    "--uc-text": C.text,
    "--uc-input-border": C.green,
  };

  return (
    <>
    <BoxContainerOuterComponent style={{}}>
      {/* User Control: settings, facial recognition */}
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
      </BoxContainerInnerComponent>
    </BoxContainerOuterComponent>

    {/* Clocked-in users list */}
    <BoxContainerOuterComponent style={{ marginTop: 10 }}>
      <BoxContainerInnerComponent
        style={{
          backgroundColor: C.backgroundListWhite,
          borderWidth: 0,
          alignItems: "stretch",
          ...ucVars,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: C.textMuted, marginBottom: 10 }}>
          Punch Clock
        </div>
        {(() => {
          let visibleUsers = (zSettingsObj?.users || [])
            .filter((u) => !u.hidden)
            .sort((a, b) => {
              let an = ((a.first || "") + " " + (a.last || "")).trim().toLowerCase();
              let bn = ((b.first || "") + " " + (b.last || "")).trim().toLowerCase();
              return an.localeCompare(bn);
            });
          if (visibleUsers.length === 0) {
            return (
              <div style={{ color: C.textMuted, fontSize: 13, padding: "8px 0" }}>
                No users to display.
              </div>
            );
          }
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
              {visibleUsers.map((u) => {
                let punch = zPunchClock?.[u.id];
                let isClockedIn = !!punch;
                let fullName = (capitalizeFirstLetterOfString(u.first || "") + " " + capitalizeFirstLetterOfString(u.last || "")).trim() || "(no name)";
                let elapsedText = isClockedIn ? formatElapsedSince(punch.millis) : "";
                return (
                  <div
                    key={u.id}
                    style={{
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "1px solid " + C.surfaceAlt,
                      backgroundColor: "transparent",
                      gap: 10,
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: isClockedIn ? C.green : C.surfaceAlt,
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ color: C.text, fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {fullName}
                      </span>
                    </div>
                    <span style={{ color: isClockedIn ? C.text : C.textMuted, fontSize: 12, minWidth: 60, textAlign: "right" }}>
                      {isClockedIn ? elapsedText : "Clocked out"}
                    </span>
                    <DomTooltip text="Edit punch history" position="top">
                      <DomTouchableOpacity
                        onPress={() => onOpenPayrollForUser && onOpenPayrollForUser(u)}
                        style={{
                          padding: 5,
                          borderRadius: 4,
                          border: "1px solid " + C.surfaceAlt,
                          backgroundColor: "transparent",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Image icon={ICONS.editPencil} size={14} />
                      </DomTouchableOpacity>
                    </DomTooltip>
                    <DomButton
                      text={isClockedIn ? "Clock Out" : "Clock In"}
                      onPress={() => handleTogglePunch(u)}
                      buttonStyle={{
                        paddingLeft: 10,
                        paddingRight: 10,
                        paddingTop: 4,
                        paddingBottom: 4,
                        borderWidth: 1,
                        borderStyle: "solid",
                        borderColor: isClockedIn ? C.buttonLightGreenOutline : C.surfaceAlt,
                        backgroundColor: isClockedIn ? C.buttonLightGreen : "transparent",
                        borderRadius: 5,
                        minWidth: 90,
                      }}
                      textStyle={{ fontSize: 12, color: C.text, fontWeight: 600 }}
                    />
                  </div>
                );
              })}
            </div>
          );
        })()}
      </BoxContainerInnerComponent>
    </BoxContainerOuterComponent>

    {/* User picker + editor */}
    <BoxContainerOuterComponent style={{ marginTop: 10 }}>
      <BoxContainerInnerComponent
        style={{
          backgroundColor: C.backgroundListWhite,
          borderWidth: 0,
          ...ucVars,
        }}
      >
        {(() => {
          let users = zSettingsObj?.users || [];
          let sortedUsers = [...users].sort((a, b) => {
            let an = ((a.first || "") + " " + (a.last || "")).trim().toLowerCase();
            let bn = ((b.first || "") + " " + (b.last || "")).trim().toLowerCase();
            return an.localeCompare(bn);
          });
          let pickerItems = sortedUsers.map((u) => {
            let level = u.permissions?.level || 1;
            let roleName = levelToPrivilegeName(level);
            let badge = roleBadgeColors(level);
            let fullName = (capitalizeFirstLetterOfString(u.first || "") + " " + capitalizeFirstLetterOfString(u.last || "")).trim() || "(no name)";
            return {
              id: u.id,
              value: u.id,
              label: (
                <div style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%", gap: 8 }}>
                  <span style={{ color: C.text, fontSize: 14 }}>{fullName}</span>
                  <span
                    style={{
                      backgroundColor: badge.bg,
                      color: badge.fg,
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: 4,
                    }}
                  >
                    {roleName}
                  </span>
                </div>
              ),
            };
          });

          let selectedRoleLevel = sDraftUser?.permissions?.level || 1;
          let selectedRoleBadge = roleBadgeColors(selectedRoleLevel);
          let pickerButtonText = (() => {
            if (!sDraftUser) return "Select a user...";
            let fn = capitalizeFirstLetterOfString(sDraftUser.first || "");
            let ln = capitalizeFirstLetterOfString(sDraftUser.last || "");
            let name = (fn + " " + ln).trim();
            if (sIsNewUser && !name) return "New User";
            return name || "(no name)";
          })();

          return (
            <>
              {/* Picker row: dropdown + New User button */}
              <div className={adminStyles.ucPickerRow}>
                <div className={adminStyles.ucPickerDropdownWrap}>
                  <DomDropdownMenu
                    enabled={canEditUsers}
                    dataArr={pickerItems}
                    onSelect={(item) => {
                      if (!item || !item.value) return;
                      if (item.value === sSelectedUserId && !sIsNewUser) return;
                      tryChangeSelection(() => selectUser(item.value));
                    }}
                    buttonText={pickerButtonText}
                    buttonStyle={{
                      paddingLeft: 8,
                      paddingRight: 8,
                      paddingTop: 4,
                      paddingBottom: 4,
                      borderColor: C.buttonLightGreenOutline,
                      borderStyle: "solid",
                      borderWidth: 1,
                      borderRadius: 5,
                      height: 32,
                      width: "100%",
                      alignItems: "center",
                      backgroundColor: C.buttonLightGreen,
                    }}
                    buttonTextStyle={{
                      color: C.text,
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  />
                </div>
                <DomButton
                  text="+ New User"
                  onPress={() => {
                    if (!canEditUsers) return;
                    handleNewUserPress();
                  }}
                  buttonStyle={{
                    borderWidth: 1,
                    borderStyle: "solid",
                    borderColor: C.buttonLightGreenOutline,
                    backgroundColor: C.buttonLightGreen,
                    paddingTop: 4,
                    paddingBottom: 4,
                    paddingLeft: 10,
                    paddingRight: 10,
                    borderRadius: 5,
                    opacity: canEditUsers ? 1 : 0.4,
                  }}
                  textStyle={{ fontSize: 13, color: C.text, fontWeight: 600 }}
                />
                {isSaasOwner && (
                  <DomButton
                    text="Invite SaaS User"
                    onPress={() => {
                      if (!canEditUsers) return;
                      _setShowInviteSaasModal(true);
                    }}
                    buttonStyle={{
                      borderWidth: 1,
                      borderStyle: "solid",
                      borderColor: C.buttonLightGreenOutline,
                      backgroundColor: C.buttonLightGreen,
                      paddingTop: 4,
                      paddingBottom: 4,
                      paddingLeft: 10,
                      paddingRight: 10,
                      borderRadius: 5,
                      opacity: canEditUsers ? 1 : 0.4,
                    }}
                    textStyle={{ fontSize: 13, color: C.text, fontWeight: 600 }}
                  />
                )}
              </div>

              {isSaasOwner && sShowInviteSaasModal && (
                <Suspense fallback={null}>
                  <InviteUserModal
                    visible={sShowInviteSaasModal}
                    onClose={() => _setShowInviteSaasModal(false)}
                  />
                </Suspense>
              )}

              {!sDraftUser && (
                <div className={adminStyles.ucEditorEmpty}>
                  <span style={{ color: C.textMuted, fontSize: 13 }}>
                    Select a user above or create a new one.
                  </span>
                </div>
              )}

              {sDraftUser && (() => {
                let editable = canEditUsers;
                let borderColor = editable ? C.buttonLightGreenOutline : "transparent";
                const canSave = sIsDirty && editable && !sPinError;
                const sectionSaveButton = (
                  <DomButton
                    text="Save"
                    onPress={() => canSave && handleSave()}
                    buttonStyle={{
                      borderWidth: 1,
                      borderStyle: "solid",
                      borderColor: canSave ? C.green : C.borderSubtle || C.buttonLightGreenOutline,
                      backgroundColor: canSave ? C.green : C.surfaceAlt,
                      paddingTop: 2,
                      paddingBottom: 2,
                      paddingLeft: 10,
                      paddingRight: 10,
                      borderRadius: 4,
                      opacity: canSave ? 1 : 0.5,
                      cursor: canSave ? "pointer" : "default",
                    }}
                    textStyle={{
                      fontSize: 11,
                      color: canSave ? C.textWhite : C.textMuted,
                      fontWeight: 700,
                      textTransform: "none",
                      letterSpacing: 0,
                    }}
                  />
                );
                return (
                  <div
                    className={adminStyles.ucEditor}
                    style={{ borderColor: C.buttonLightGreenOutline, backgroundColor: C.listItemWhite }}
                  >
                    {/* ACTIONS */}
                    <div className={adminStyles.ucActionsBar}>
                      <DomButton
                        text={sIsNewUser ? "Discard" : "Cancel"}
                        onPress={handleCancel}
                        buttonStyle={{
                          borderWidth: 1,
                          borderStyle: "solid",
                          borderColor: C.borderSubtle || C.buttonLightGreenOutline,
                          backgroundColor: "transparent",
                          paddingTop: 6,
                          paddingBottom: 6,
                          paddingLeft: 14,
                          paddingRight: 14,
                          borderRadius: 5,
                        }}
                        textStyle={{ fontSize: 13, color: C.text, fontWeight: 600 }}
                      />
                      <div style={{ flex: 1 }} />
                      {!sIsNewUser && editable && (
                        <DomButton
                          text="Delete"
                          onPress={handleDelete}
                          buttonStyle={{
                            borderWidth: 1,
                            borderStyle: "solid",
                            borderColor: C.lightred,
                            backgroundColor: "transparent",
                            paddingTop: 6,
                            paddingBottom: 6,
                            paddingLeft: 14,
                            paddingRight: 14,
                            borderRadius: 5,
                          }}
                          textStyle={{ fontSize: 13, color: C.lightred, fontWeight: 600 }}
                        />
                      )}
                    </div>

                    {/* IDENTITY */}
                    <div className={adminStyles.ucEditorSection}>
                      <div className={adminStyles.ucEditorSectionTitle} style={{ color: C.textMuted }}>
                        <span className={adminStyles.ucEditorSectionTitleText}>Identity</span>
                        {sectionSaveButton}
                      </div>
                      <div className={adminStyles.ucEditorRow}>
                        <DomTextInput
                          debounceMs={300}
                          value={sDraftUser.first || ""}
                          placeholder="First name"
                          placeholderTextColor={"lightgray"}
                          editable={editable}
                          style={{ paddingLeft: 5, paddingRight: 5, borderColor: borderColor, color: editable ? C.text : C.textMuted }}
                          className={adminStyles.ucEditorInput}
                          onChangeText={(value) => updateDraft({ first: value })}
                        />
                        <DomTextInput
                          debounceMs={300}
                          value={sDraftUser.last || ""}
                          placeholder="Last name"
                          placeholderTextColor={"lightgray"}
                          editable={editable}
                          style={{ paddingLeft: 5, paddingRight: 5, borderColor: borderColor, color: editable ? C.text : C.textMuted }}
                          className={adminStyles.ucEditorInput}
                          onChangeText={(value) => updateDraft({ last: value })}
                        />
                      </div>
                      <div className={adminStyles.ucEditorRow}>
                        <DomTextInput
                          debounceMs={300}
                          value={formatPhoneWithDashes(sDraftUser.phone || "")}
                          placeholder="Phone"
                          placeholderTextColor={"lightgray"}
                          editable={editable}
                          style={{ paddingLeft: 5, paddingRight: 5, borderColor: borderColor, color: editable ? C.text : C.textMuted }}
                          className={adminStyles.ucEditorInput}
                          onChangeText={(value) => updateDraft({ phone: removeDashesFromPhone(value) })}
                        />
                        <DomTextInput
                          debounceMs={300}
                          value={sDraftUser.email || ""}
                          placeholder="Email"
                          placeholderTextColor={"lightgray"}
                          editable={editable}
                          style={{ paddingLeft: 5, paddingRight: 5, borderColor: borderColor, color: editable ? C.text : C.textMuted }}
                          className={adminStyles.ucEditorInput}
                          onChangeText={(value) => updateDraft({ email: value })}
                        />
                      </div>
                      <div className={adminStyles.ucEditorRow}>
                        <DomTooltip text="Hides username from in-app lists" position="top">
                          <CheckBox
                            isChecked={!!sDraftUser.hidden}
                            text="Hidden"
                            textStyle={{ fontSize: 13, color: editable ? C.text : C.textMuted }}
                            buttonStyle={{ backgroundColor: "transparent", paddingLeft: 0 }}
                            onCheck={() => {
                              if (!editable) return;
                              updateDraft({ hidden: !sDraftUser.hidden });
                            }}
                          />
                        </DomTooltip>
                      </div>
                    </div>

                    {/* CREDENTIALS / ROLE */}
                    <div className={adminStyles.ucEditorSection}>
                      <div className={adminStyles.ucEditorSectionTitle} style={{ color: C.textMuted }}>
                        <span className={adminStyles.ucEditorSectionTitleText}>Credentials & Role</span>
                        {sectionSaveButton}
                      </div>
                      <div className={adminStyles.ucEditorRow}>
                        <div className={adminStyles.ucCredField} style={{ borderColor: borderColor }}>
                          {(() => {
                            const isHighPriv = (sDraftUser.permissions?.level || 0) >= PERMISSION_LEVELS.superUser.level;
                            const configuredLen = Number(zSettingsObj?.userPinStrength) || 4;
                            const maxPinLen = isHighPriv ? 4 : configuredLen;
                            return (
                              <DomTextInput
                                debounceMs={300}
                                caretHidden={!sShowPin}
                                focused={sShowPin}
                                value={sShowPin ? (sDraftUser.pin || "") : ""}
                                maxLength={maxPinLen}
                                onChangeText={(value) => {
                                  if (value && value.length > maxPinLen) value = value.slice(0, maxPinLen);
                                  const otherUsers = (zSettingsObj?.users || []).filter((u) => u.id !== sDraftUser.id);
                                  const conflictKeys = [];
                                  for (const u of otherUsers) {
                                    if (u.pin) conflictKeys.push(u.pin);
                                    if (u.alternatePin) conflictKeys.push(u.alternatePin);
                                  }
                                  if (sDraftUser.alternatePin) conflictKeys.push(sDraftUser.alternatePin);
                                  if (value && conflictKeys.includes(value)) {
                                    _setPinError("PIN already in use");
                                  } else {
                                    _setPinError("");
                                  }
                                  updateDraft({ pin: value });
                                }}
                                placeholder={sShowPin ? "pin..." : "PIN (hidden)"}
                                placeholderTextColor={"lightgray"}
                                editable={editable}
                                className={adminStyles.ucCredInput}
                                style={{ color: editable ? C.text : C.textMuted }}
                              />
                            );
                          })()}
                          <DomTouchableOpacity onPress={() => editable && _setShowPin(!sShowPin)}>
                            <Image icon={ICONS.editPencil} size={15} />
                          </DomTouchableOpacity>
                        </div>
                        <div className={adminStyles.ucCredField} style={{ borderColor: borderColor }}>
                          <DomTextInput
                            debounceMs={300}
                            caretHidden={!sShowWage}
                            value={sShowWage ? (sDraftUser.hourlyWage || "") : ""}
                            onChangeText={(value) => updateDraft({ hourlyWage: value })}
                            placeholder={sShowWage ? "wage..." : "Wage (hidden)"}
                            placeholderTextColor={"lightgray"}
                            editable={editable}
                            className={adminStyles.ucCredInput}
                            style={{ color: editable ? C.text : C.textMuted }}
                          />
                          <DomTouchableOpacity onPress={() => editable && _setShowWage(!sShowWage)}>
                            <Image icon={ICONS.editPencil} size={15} />
                          </DomTouchableOpacity>
                        </div>
                      </div>
                      {!!sPinError && (
                        <div className={adminStyles.ucEditorRow}>
                          <span style={{ fontSize: 12, color: C.lightred, fontWeight: 600 }}>
                            {sPinError}
                          </span>
                        </div>
                      )}
                      <div className={adminStyles.ucEditorRow}>
                        <div className={adminStyles.ucRoleBadgeWrap}>
                          <DomDropdownMenu
                            enabled={editable && selectedRoleLevel < PERMISSION_LEVELS.owner.level}
                            dataArr={Object.values(PERMISSION_LEVELS).map((o) => ({
                              id: o.id,
                              label: o.name,
                              disabled: o.level >= PERMISSION_LEVELS.superUser.level
                                ? zCurrentUserLevel < PERMISSION_LEVELS.owner.level
                                : zCurrentUserLevel < PERMISSION_LEVELS.superUser.level,
                            }))}
                            onSelect={(item) => {
                              if (!editable) return;
                              if (selectedRoleLevel >= PERMISSION_LEVELS.owner.level) return;
                              let perm = Object.values(PERMISSION_LEVELS).find((o) => o.id === item.id);
                              if (!perm) return;
                              let patch = { permissions: perm };
                              if (perm.level >= PERMISSION_LEVELS.superUser.level && (sDraftUser.pin || "").length > 4) {
                                patch.pin = (sDraftUser.pin || "").slice(0, 4);
                              }
                              if (perm.level < PERMISSION_LEVELS.superUser.level && sDraftUser.linkedUserID) {
                                patch.linkedUserID = "";
                              }
                              updateDraft(patch);
                            }}
                            buttonText={levelToPrivilegeName(sDraftUser.permissions?.level || 1)}
                            buttonStyle={{
                              paddingLeft: 10,
                              paddingRight: 10,
                              paddingTop: 4,
                              paddingBottom: 4,
                              borderColor: selectedRoleBadge.bg,
                              borderStyle: "solid",
                              borderWidth: 1,
                              borderRadius: 4,
                              minWidth: 120,
                              height: 28,
                              alignItems: "center",
                              backgroundColor: selectedRoleBadge.bg,
                            }}
                            buttonTextStyle={{
                              color: selectedRoleBadge.fg,
                              fontSize: 13,
                              fontWeight: 700,
                            }}
                          />
                        </div>
                      </div>
                      {selectedRoleLevel >= PERMISSION_LEVELS.superUser.level && (() => {
                        const otherUsers = (zSettingsObj?.users || []).filter((u) => u.id !== sDraftUser.id);
                        const linkItems = [
                          { id: "__none__", label: "None" },
                          ...otherUsers.map((u) => ({
                            id: u.id,
                            label: ((capitalizeFirstLetterOfString(u.first || "") + " " + capitalizeFirstLetterOfString(u.last || "")).trim() || "(no name)") + " — " + levelToPrivilegeName(u.permissions?.level || 1),
                          })),
                        ];
                        const linkedId = sDraftUser.linkedUserID || "";
                        const linkedUser = linkedId ? otherUsers.find((u) => u.id === linkedId) : null;
                        const buttonText = linkedUser
                          ? ((capitalizeFirstLetterOfString(linkedUser.first || "") + " " + capitalizeFirstLetterOfString(linkedUser.last || "")).trim() || "(no name)")
                          : "Link to user...";
                        return (
                          <div className={adminStyles.ucEditorRow}>
                            <DomDropdownMenu
                              enabled={editable}
                              dataArr={linkItems}
                              onSelect={(item) => {
                                if (!editable) return;
                                const newId = item.id === "__none__" ? "" : item.id;
                                updateDraft({ linkedUserID: newId });
                              }}
                              buttonText={buttonText}
                              buttonStyle={{
                                paddingLeft: 10,
                                paddingRight: 10,
                                paddingTop: 4,
                                paddingBottom: 4,
                                borderColor: C.borderDefault,
                                borderStyle: "solid",
                                borderWidth: 1,
                                borderRadius: 4,
                                minWidth: 200,
                                height: 28,
                                alignItems: "center",
                                backgroundColor: C.surfaceBase,
                              }}
                              buttonTextStyle={{
                                color: linkedUser ? C.text : C.textMuted,
                                fontSize: 13,
                                fontWeight: 600,
                              }}
                            />
                          </div>
                        );
                      })()}
                    </div>

                    {/* FACE ENROLLMENT */}
                    {zSettingsObj?.useFacialRecognition !== false && (
                      <div className={adminStyles.ucEditorSection}>
                        <div className={adminStyles.ucEditorSectionTitle} style={{ color: C.textMuted }}>
                          <span className={adminStyles.ucEditorSectionTitleText}>Face Enrollment</span>
                          {sectionSaveButton}
                        </div>
                        <div className={adminStyles.ucEditorRow}>
                          <div
                            className={adminStyles.ucEnrollBtn}
                            style={{
                              "--uc-enroll-border": C.buttonLightGreenOutline,
                              "--uc-enroll-bg": C.buttonLightGreen,
                              opacity: editable ? 1 : 0.5,
                              cursor: editable ? "pointer" : "default",
                              width: "auto",
                              padding: "4px 10px",
                            }}
                            onClick={() => {
                              if (!editable) return;
                              _setFaceModalDraftActive(true);
                            }}
                          >
                            <Image icon={sDraftUser.faceDescriptor ? ICONS.check1 : ICONS.redx} size={14} />
                            <span className={adminStyles.ucEnrollText} style={{ color: C.text }}>
                              {sDraftUser.faceDescriptor ? "Re-enroll Face" : "Enroll Face"}
                            </span>
                          </div>
                          {sDraftUser.faceDescriptor && editable && (
                            <DomButton
                              text="Remove Face"
                              onPress={() => handleFaceCaptureToDraft("")}
                              buttonStyle={{
                                borderWidth: 1,
                                borderStyle: "solid",
                                borderColor: C.lightred,
                                backgroundColor: C.lightred,
                                paddingTop: 4,
                                paddingBottom: 4,
                                paddingLeft: 10,
                                paddingRight: 10,
                                borderRadius: 5,
                              }}
                              textStyle={{ fontSize: 11, color: C.textWhite, fontWeight: 600 }}
                            />
                          )}
                        </div>
                      </div>
                    )}

                    {/* STATUSES */}
                    <div className={adminStyles.ucEditorSection}>
                      <div className={adminStyles.ucEditorSectionTitle} style={{ color: C.textMuted }}>
                        <span className={adminStyles.ucEditorSectionTitleText}>Connected Statuses</span>
                        {sectionSaveButton}
                      </div>
                      <div className={adminStyles.ucChipRow}>
                        {editable && (
                          <DomStatusPickerModal
                            statuses={zSettingsObj?.statuses || []}
                            onSelect={(item) => {
                              if (!item) return;
                              let currentStatuses = sDraftUser.statuses || [];
                              if (currentStatuses.includes(item.id)) return;
                              updateDraft({ statuses: [...currentStatuses, item.id] });
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
                            buttonTextStyle={{ color: C.text, fontSize: 12 }}
                          />
                        )}
                        {(sDraftUser.statuses || []).map((statusId) => {
                          let status = (zSettingsObj?.statuses || []).find((s) => s.id === statusId);
                          if (!status) return null;
                          return (
                            <div
                              key={statusId}
                              className={adminStyles.ucChip}
                              style={{ backgroundColor: editable ? status.backgroundColor : C.surfaceAlt }}
                            >
                              <span className={adminStyles.ucChipLabel} style={{ color: editable ? status.textColor : C.textMuted }}>
                                {status.label}
                              </span>
                              {editable && (
                                <button
                                  type="button"
                                  className={adminStyles.ucChipRemove}
                                  style={{ color: status.textColor }}
                                  onClick={() => {
                                    updateDraft({ statuses: (sDraftUser.statuses || []).filter((id) => id !== statusId) });
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

                    {/* EMAIL INBOXES */}
                    <div className={adminStyles.ucEditorSection}>
                      <div className={adminStyles.ucEditorSectionTitle} style={{ color: C.textMuted }}>
                        <span className={adminStyles.ucEditorSectionTitleText}>Visible Email Accounts</span>
                        {sectionSaveButton}
                      </div>
                      <div className={adminStyles.ucChipRow}>
                        {(() => {
                          let availableInboxes = zEmailAccounts
                            .filter((a) => !(sDraftUser.emailInboxes || []).includes(a.accountKey));
                          if (!editable || availableInboxes.length === 0) return null;
                          return (
                          <DomDropdownMenu
                            dataArr={availableInboxes.map((a) => ({ label: a.displayName, value: a.accountKey }))}
                            onSelect={(item) => {
                              if (!item) return;
                              let current = sDraftUser.emailInboxes || [];
                              if (current.includes(item.value)) return;
                              updateDraft({ emailInboxes: [...current, item.value] });
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
                            buttonTextStyle={{ color: C.text, fontSize: 12 }}
                          />
                          );
                        })()}
                        {(sDraftUser.emailInboxes || []).map((accountKey) => {
                          let acct = zEmailAccounts.find((a) => a.accountKey === accountKey);
                          if (!acct) return null;
                          return (
                            <div
                              key={accountKey}
                              className={adminStyles.ucChip}
                              style={{ backgroundColor: editable ? C.blue : C.surfaceAlt }}
                            >
                              <span className={adminStyles.ucChipLabel} style={{ color: editable ? C.textWhite : C.textMuted }}>
                                {acct.displayName}
                              </span>
                              {editable && (
                                <button
                                  type="button"
                                  className={adminStyles.ucChipRemove}
                                  style={{ color: C.textWhite }}
                                  onClick={() => {
                                    updateDraft({ emailInboxes: (sDraftUser.emailInboxes || []).filter((k) => k !== accountKey) });
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
                );
              })()}

              {sFaceModalDraftActive && sDraftUser && (
                <FaceEnrollModalScreen
                  userObj={sDraftUser}
                  handleDescriptorCapture={(_userObj, desc) => handleFaceCaptureToDraft(desc)}
                  handleExitPress={() => _setFaceModalDraftActive(false)}
                />
              )}
            </>
          );
        })()}
      </BoxContainerInnerComponent>
    </BoxContainerOuterComponent>
    </>
  );
};



const PaymentProcessingComponent = ({
  zSettingsObj,
  handleSettingsFieldChange,
  liveReaders: zLiveReaders = [],
  currentUserLevel = 0,
}) => {
  const canEdit = currentUserLevel >= 3;

  return (
    <BoxContainerOuterComponent>
      <BoxContainerInnerComponent>
        <div
          style={{
            width: "100%",
            pointerEvents: canEdit ? "auto" : "none",
            opacity: canEdit ? 1 : 0.4,
            userSelect: canEdit ? "auto" : "none",
          }}
          aria-disabled={!canEdit}
        >
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
            selectedReader={zSettingsObj?.selectedCardReaderObj || { id: "", label: "" }}
            onSelectReader={(obj) =>
              handleSettingsFieldChange(
                "selectedCardReaderObj",
                obj || { id: "", label: "" }
              )
            }
          />
        </div>
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
  const zColorModal = useZ("modal", !!sColorModalItem);

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
            zIndex: zColorModal,
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
  const z = useZ("modal");

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
        zIndex: z,
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
