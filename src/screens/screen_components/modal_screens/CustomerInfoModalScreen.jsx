/*eslint-disable*/
import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { calculateRunningTotals, capitalizeFirstLetterOfString, checkInputForNumbersOnly, formatCurrencyDisp, formatMillisForDisplay, formatPhoneForDisplay, formatPhoneWithDashes, generateEAN13Barcode, lightenRGBByPercent, formatWorkorderNumber, localStorageWrapper, printBuilder, removeDashesFromPhone, resolveStatus, usdTypeMask } from "../../../utils";
import { C, COLOR_GRADIENTS, ICONS } from "../../../styles";
import {
  useCheckoutStore,
  useCurrentCustomerStore,
  useLoginStore,
  useOpenWorkordersStore,
  useSettingsStore,
  useTabNamesStore,
  useWorkorderPreviewStore,
  useActiveSalesStore,
  useAlertScreenStore,
  useCustMessagesStore,
} from "../../../stores";
import {
  CONTACT_RESTRICTIONS,
  CUSTOMER_CREDIT_PROTO,
  CUSTOMER_LANGUAGES,
  CUSTOMER_PROTO,
  SMS_PROTO,
  TAB_NAMES,
} from "../../../data";
import {
  Button,
  CheckBox,
  DepositModal,
  DepositsList,
  DropdownMenu,
  Image,
  ModalFooter,
  ModalFooterButton,
  SmallLoadingIndicator,
  TextInput,
  Tooltip,
} from "../../../dom_components";
import {
  dbSaveCustomer,
  dbGetCustomer,
  dbGetCompletedWorkorder,
  dbGetCompletedSale,
  dbGetCustomerMessages,
  dbListenToNewMessages,
  dbCheckCellPhoneExists,
  dbMigrateCustomerPhone,
  dbSavePrintObj,
  dbUpdateMessageCanRespond,
  dbToggleSMSForwarding,
} from "../../../db_calls_wrapper";
import { smsService } from "../../../data_service_modules";
import {
  scheduleAutoSend,
  clearAutoSend,
  buildForwardToArray,
  initialSelectedForwardIDs,
} from "../Options_Screen/ReplyOptionsBar";
import {
  IncomingMessageComponent,
  OutgoingMessageComponent,
} from "../Options_Screen/MessageBubble";
import { ComposeArea } from "../Options_Screen/ComposeArea";
import {
  readActiveSale,
  readTransactions,
} from "./newCheckoutModalScreen/newCheckoutFirebaseCalls";
import { sendCreditReceipt } from "./newCheckoutModalScreen/newCheckoutUtils";
const ClosedWorkorderModal = lazy(() =>
  import("./ClosedWorkorderModal").then((m) => ({ default: m.ClosedWorkorderModal }))
);
const DepositRefundModal = lazy(() =>
  import("./newCheckoutModalScreen/DepositRefundModal").then((m) => ({ default: m.DepositRefundModal }))
);
const FullSaleModal = lazy(() =>
  import("../../../dom_components/FullSaleModal/FullSaleModal").then((m) => ({ default: m.FullSaleModal }))
);
const GoogleMapsModal = lazy(() =>
  import("./GoogleMapsModal").then((m) => ({ default: m.GoogleMapsModal }))
);
import styles from "./CustomerInfoModalScreen.module.css";

const INPUT_BASE_STYLE = {
  borderColor: C.borderSubtle,
  color: C.text,
  backgroundColor: C.listItemWhite,
};

export const CustomerInfoScreenModalComponent = ({
  incomingCustomer = null,
  customerID = null,
  isNewCustomer = false,
  isCurrentCustomer = true,
  onCreateCustomer,
  onNewWorkorder,
  onClose,
}) => {
  const primaryHandler = isNewCustomer ? onCreateCustomer : onNewWorkorder;
  const primaryText = isNewCustomer ? "Create Customer" : "New Workorder";
  const dismissText = isNewCustomer ? "Cancel" : "Close";
  const getInitialCustomer = () => {
    if (incomingCustomer) return incomingCustomer;
    if (customerID) {
      let storeCustomer = useCurrentCustomerStore.getState().getCustomer();
      if (storeCustomer?.id === customerID) return storeCustomer;
    }
    return CUSTOMER_PROTO;
  };
  const initialCustomer = getInitialCustomer();
  const hasCachedCustomer = initialCustomer !== CUSTOMER_PROTO;

  const [sCustomerInfo, _setCustomerInfo] = useState(initialCustomer);
  const [sCustomerLoading, _setCustomerLoading] = useState(false);
  const [sCustomerLoadError, _setCustomerLoadError] = useState(false);
  const [sWorkorders, _sSetWorkorders] = useState([]);
  const [sSales, _sSetSales] = useState([]);
  const [sSaleTransactionsMap, _sSetSaleTransactionsMap] = useState({});
  const [sWoLoading, _sSetWoLoading] = useState(false);
  const [sSalesLoading, _sSetSalesLoading] = useState(false);
  const [sShowDepositModal, _sSetShowDepositModal] = useState(false);
  const [sClosedWorkorder, _sSetClosedWorkorder] = useState(null);
  const [sEditingCredit, _sSetEditingCredit] = useState(null);
  const [sRefundDeposit, _sSetRefundDeposit] = useState(null);
  const [sSaleModalItem, _sSetSaleModalItem] = useState(null);
  const [sCellDuplicateStatus, _sCellDuplicateStatus] = useState(null);
  const [sShowMapsModal, _sSetShowMapsModal] = useState(false);
  const [sCellEditing, _sCellEditing] = useState(false);
  const [sCellEditValue, _sCellEditValue] = useState("");
  const [sCellMigrating, _sCellMigrating] = useState(false);
  const mountedRef = useRef(true);
  const initialCellRef = useRef(initialCustomer?.customerCell || "");

  useEffect(() => {
    mountedRef.current = true;

    if (hasCachedCustomer) autoLoadWorkordersAndSales(initialCustomer);

    if (incomingCustomer || !customerID || isNewCustomer) return;

    if (!hasCachedCustomer) _setCustomerLoading(true);

    dbGetCustomer(customerID).then((customer) => {
      if (!mountedRef.current) return;
      if (customer) {
        _setCustomerInfo(customer);
        useCurrentCustomerStore.getState().setCustomer(customer, false);
        _setCustomerLoading(false);
        if (!hasCachedCustomer) autoLoadWorkordersAndSales(customer);
      } else {
        _setCustomerLoadError(true);
        _setCustomerLoading(false);
      }
    }).catch(() => {
      if (!mountedRef.current) return;
      _setCustomerLoadError(true);
      _setCustomerLoading(false);
    });

    return () => { mountedRef.current = false; };
  }, []);

  async function loadWorkorders(customer) {
    const woIDs = (customer || sCustomerInfo).workorders || [];
    if (woIDs.length === 0) {
      _sSetWorkorders([]);
      return [];
    }
    const openWOs = useOpenWorkordersStore.getState().getWorkorders() || [];
    const localWOs = [];
    const dbIDs = [];
    woIDs.forEach((id) => {
      const local = openWOs.find((wo) => wo.id === id);
      if (local) localWOs.push(local);
      else dbIDs.push(id);
    });
    if (localWOs.length > 0 && mountedRef.current) _sSetWorkorders(localWOs);
    if (dbIDs.length > 0) {
      _sSetWoLoading(true);
      try {
        const dbResults = await Promise.all(
          dbIDs.map(async (id) => {
            try { return await dbGetCompletedWorkorder(id); }
            catch (e) { return null; }
          })
        );
        const dbWOs = dbResults.filter(Boolean);
        if (mountedRef.current) _sSetWorkorders([...localWOs, ...dbWOs]);
        return [...localWOs, ...dbWOs];
      } catch (e) {
        console.log("Error loading workorders:", e);
        return localWOs;
      } finally {
        if (mountedRef.current) _sSetWoLoading(false);
      }
    }
    return localWOs;
  }

  async function loadSales(customer, loadedWorkorders) {
    const saleIDs = (customer || sCustomerInfo).sales || [];
    if (saleIDs.length === 0) {
      _sSetSales([]);
      return;
    }
    const activeSales = useActiveSalesStore.getState().getActiveSales() || [];
    const localSales = [];
    const dbIDs = [];
    saleIDs.forEach((id) => {
      const local = activeSales.find((s) => s.id === id);
      if (local) localSales.push({ ...local, _isActiveSale: true });
      else dbIDs.push(id);
    });
    if (localSales.length > 0 && mountedRef.current) _sSetSales(localSales);
    if (dbIDs.length > 0) {
      _sSetSalesLoading(true);
      try {
        const results = await Promise.all(
          dbIDs.map(async (id) => {
            try {
              let sale = await dbGetCompletedSale(id);
              if (!sale) sale = await readActiveSale(id);
              return sale;
            } catch (e) {
              return null;
            }
          })
        );
        const fetchedSales = results.filter(Boolean);

        const allWoIDs = new Set();
        fetchedSales.forEach((sale) => {
          (sale.workorderIDs || []).forEach((id) => allWoIDs.add(id));
        });

        const woMap = {};
        (loadedWorkorders || sWorkorders).forEach((wo) => { woMap[wo.id] = wo; });

        const missingIDs = [...allWoIDs].filter((id) => !woMap[id]);
        if (missingIDs.length > 0) {
          const openWOs = useOpenWorkordersStore.getState().getWorkorders() || [];
          const fetched = await Promise.all(
            missingIDs.map(async (id) => {
              try {
                const local = openWOs.find((wo) => wo.id === id);
                if (local) return local;
                return await dbGetCompletedWorkorder(id);
              } catch (e) {
                return null;
              }
            })
          );
          fetched.filter(Boolean).forEach((wo) => { woMap[wo.id] = wo; });
        }

        const dbSalesWithWOs = fetchedSales.map((sale) => ({
          ...sale,
          _workorders: (sale.workorderIDs || [])
            .map((id) => woMap[id])
            .filter(Boolean),
        }));

        let txnMap = {};
        await Promise.all(dbSalesWithWOs.map(async (sale) => {
          if (sale.transactionIDs?.length > 0) {
            let txns = (await readTransactions(sale.transactionIDs)).filter(Boolean);
            sale._transactions = txns;
            txnMap[sale.id] = txns;
          } else {
            sale._transactions = [];
            txnMap[sale.id] = [];
          }
        }));

        if (mountedRef.current) {
          _sSetSales([...localSales, ...dbSalesWithWOs]);
          _sSetSaleTransactionsMap(txnMap);
        }
      } catch (e) {
        console.log("Error loading sales:", e);
      } finally {
        if (mountedRef.current) _sSetSalesLoading(false);
      }
    }
  }

  async function autoLoadWorkordersAndSales(customer) {
    let loadedWOs = await loadWorkorders(customer);
    await loadSales(customer, loadedWOs);
  }

  const CUSTOMER_TO_WORKORDER_FIELDS = {
    first: "customerFirst",
    last: "customerLast",
    customerCell: "customerCell",
    customerLandline: "customerLandline",
    email: "customerEmail",
    contactRestriction: "customerContactRestriction",
    language: "customerLanguage",
  };

  function saveField(fieldName, val) {
    useLoginStore.getState().requireLogin(() => {
      _setCustomerInfo((prev) => {
        const updated = { ...prev, [fieldName]: val };
        if (!isNewCustomer) {
          if (isCurrentCustomer) {
            useCurrentCustomerStore.getState().setCustomerField(fieldName, val, prev.id);
          }
          dbSaveCustomer(updated);

          const woField = CUSTOMER_TO_WORKORDER_FIELDS[fieldName];
          if (woField) {
            const allWOs = useOpenWorkordersStore.getState().getWorkorders() || [];
            allWOs
              .filter((wo) => wo.customerID === prev.id)
              .forEach((wo) => {
                useOpenWorkordersStore.getState().setField(woField, val, wo.id);
              });
          }
        }
        return updated;
      });
    });
  }

  async function checkCellPhoneUnique(phone) {
    const clean = (phone || "").replace(/\D/g, "");
    if (clean.length < 10) { _sCellDuplicateStatus(null); return; }
    if (clean === initialCellRef.current) { _sCellDuplicateStatus(null); return; }
    _sCellDuplicateStatus("checking");
    try {
      const { exists } = await dbCheckCellPhoneExists(clean, sCustomerInfo?.id);
      if (!mountedRef.current) return;
      _sCellDuplicateStatus(exists ? "duplicate" : "unique");
    } catch (e) {
      if (!mountedRef.current) return;
      _sCellDuplicateStatus("error");
    }
  }

  function handleCellEditStart() {
    _sCellEditValue(sCustomerInfo.customerCell || "");
    _sCellEditing(true);
    _sCellDuplicateStatus(null);
  }

  function handleCellEditCancel() {
    _sCellEditing(false);
    _sCellEditValue("");
    _sCellDuplicateStatus(null);
  }

  function handleCellSavePress() {
    const oldPhone = sCustomerInfo.customerCell;
    const newPhone = sCellEditValue.replace(/\D/g, "");
    if (newPhone === oldPhone) {
      handleCellEditCancel();
      return;
    }
    if (sCellDuplicateStatus === "duplicate") return;
    useAlertScreenStore.getState().setValues({
      title: "Change Phone Number",
      message: `Change cell from ${formatPhoneWithDashes(oldPhone)} to ${formatPhoneWithDashes(newPhone)}?\n\nA system copy of recent messages will take place. It may be a few minutes before the customer can send a message.`,
      btn1Text: "CONFIRM",
      btn2Text: "CANCEL",
      handleBtn1Press: () => executeCellMigration(oldPhone, newPhone),
      handleBtn2Press: () => useAlertScreenStore.getState().resetAll(),
      showAlert: true,
      canExitOnOuterClick: false,
    });
  }

  async function executeCellMigration(oldPhone, newPhone) {
    useAlertScreenStore.getState().resetAll();
    _sCellMigrating(true);
    try {
      const result = await dbMigrateCustomerPhone(
        oldPhone, newPhone,
        sCustomerInfo.id, sCustomerInfo.first, sCustomerInfo.last
      );
      if (!mountedRef.current) return;
      if (result.success) {
        saveField("customerCell", newPhone);
        initialCellRef.current = newPhone;
        _sCellEditing(false);
        _sCellEditValue("");
        _sCellDuplicateStatus(null);
      } else {
        useAlertScreenStore.getState().setValues({
          title: "Migration Failed",
          message: result.error || "Failed to migrate phone number.",
          btn1Text: "OK",
          handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
          showAlert: true,
          canExitOnOuterClick: true,
        });
      }
    } catch (e) {
      if (!mountedRef.current) return;
      useAlertScreenStore.getState().setValues({
        title: "Migration Error",
        message: e.message || "An unexpected error occurred.",
        btn1Text: "OK",
        handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
        showAlert: true,
        canExitOnOuterClick: true,
      });
    } finally {
      if (mountedRef.current) _sCellMigrating(false);
    }
  }

  const cellHasError = sCellDuplicateStatus === "duplicate" || sCellDuplicateStatus === "error";
  const primaryEnabled =
    sCellDuplicateStatus !== "duplicate" &&
    sCellDuplicateStatus !== "error" &&
    sCellDuplicateStatus !== "checking";

  return (
    <div className={styles.shell} onClick={(e) => e.stopPropagation()}>
      <div className={styles.body}>
      <div className={styles.formCol}>
        <div className={styles.fieldGroup}>
          <div className={styles.fieldGroupTitle}>Contact</div>
          <div className={styles.contactRow}>
            <CheckBox
              text={"Call Only"}
              textStyle={{ fontSize: 12 }}
              isChecked={sCustomerInfo?.contactRestriction === CONTACT_RESTRICTIONS.call}
              onCheck={() => {
                let val = sCustomerInfo.contactRestriction === CONTACT_RESTRICTIONS.call ? "" : CONTACT_RESTRICTIONS.call;
                saveField("contactRestriction", val);
              }}
            />
            <CheckBox
              text={"Email Only"}
              textStyle={{ fontSize: 12 }}
              isChecked={sCustomerInfo?.contactRestriction === CONTACT_RESTRICTIONS.email}
              onCheck={() => {
                let val = sCustomerInfo.contactRestriction === CONTACT_RESTRICTIONS.email ? "" : CONTACT_RESTRICTIONS.email;
                saveField("contactRestriction", val);
              }}
            />
          </div>

          <div>
            {(!!sCustomerInfo?.customerCell || sCellEditing) && (
              <div className={styles.cellHeader}>
                {sCellDuplicateStatus === "duplicate" ? (
                  <span className={styles.cellLabelError} style={{ color: C.red }}>Phone number duplicate</span>
                ) : sCellDuplicateStatus === "error" ? (
                  <span className={styles.cellLabelError} style={{ color: C.red }}>Network error - cannot verify</span>
                ) : sCellDuplicateStatus === "checking" ? (
                  <>
                    <span className={styles.cellLabel} style={{ color: C.textDisabled }}>Cell</span>
                    <span style={{ marginLeft: 5, display: "flex", alignItems: "center" }}>
                      <SmallLoadingIndicator />
                    </span>
                  </>
                ) : (
                  <span className={styles.cellLabel} style={{ color: C.textDisabled }}>Cell</span>
                )}
              </div>
            )}

            {(!isNewCustomer && !sCellEditing) ? (
              <div className={styles.cellInlineRow}>
                <TextInput
                  editable={false}
                  placeholder="Cell phone"
                  className={styles.input}
                  style={{
                    ...INPUT_BASE_STYLE,
                    flex: 1,
                    marginTop: sCustomerInfo.customerCell ? 1 : 15,
                    backgroundColor: C.surfaceAlt,
                  }}
                  value={formatPhoneWithDashes(sCustomerInfo.customerCell)}
                />
                {sCellMigrating ? (
                  <span style={{ marginLeft: 8, display: "flex", alignItems: "center" }}>
                    <SmallLoadingIndicator />
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={(sCustomerInfo.customerCell || "").replace(/\D/g, "").length !== 10}
                    onClick={handleCellEditStart}
                    className={
                      styles.cellIconBtn +
                      ((sCustomerInfo.customerCell || "").replace(/\D/g, "").length !== 10
                        ? " " + styles.cellIconBtnDisabled
                        : "")
                    }
                    title="Edit customer cell phone number"
                  >
                    <Image icon={ICONS.editPencil} style={{ width: 18, height: 18 }} />
                  </button>
                )}
              </div>
            ) : sCellEditing ? (
              <div className={styles.cellInlineRow}>
                <TextInput
                  onChangeText={(val) => {
                    val = removeDashesFromPhone(val);
                    if (val.length > 10) return;
                    _sCellEditValue(val);
                    checkCellPhoneUnique(val);
                  }}
                  placeholder="Cell phone"
                  className={styles.input}
                  style={{
                    ...INPUT_BASE_STYLE,
                    flex: 1,
                    marginTop: 1,
                    ...(cellHasError ? { borderColor: C.red, borderWidth: 2 } : {}),
                  }}
                  value={formatPhoneWithDashes(sCellEditValue)}
                />
                {sCellEditValue.replace(/\D/g, "").length === 10 && sCellDuplicateStatus !== "duplicate" ? (
                  <button
                    type="button"
                    onClick={handleCellSavePress}
                    className={styles.cellIconBtn}
                    title="Save new phone number"
                  >
                    <Image icon={ICONS.check1} style={{ width: 18, height: 18 }} />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={handleCellEditCancel}
                  className={styles.cellIconBtn}
                  style={{ marginLeft: 6 }}
                  title="Cancel"
                >
                  <Image icon={ICONS.close1} style={{ width: 16, height: 16 }} />
                </button>
              </div>
            ) : (
              <TextInput
                onChangeText={(val) => {
                  val = removeDashesFromPhone(val);
                  if (val.length > 10) return;
                  saveField("customerCell", val);
                  checkCellPhoneUnique(val);
                }}
                placeholder="Cell phone"
                className={styles.input}
                style={{
                  ...INPUT_BASE_STYLE,
                  marginTop: sCustomerInfo.customerCell ? 1 : 15,
                  ...(cellHasError ? { borderColor: C.red, borderWidth: 2 } : {}),
                }}
                value={formatPhoneWithDashes(sCustomerInfo.customerCell)}
              />
            )}
          </div>

          <TextInput
            onChangeText={(val) => {
              val = removeDashesFromPhone(val);
              if (val.length > 10) return;
              saveField("customerLandline", val);
            }}
            placeholder="Landline"
            className={styles.input}
            style={INPUT_BASE_STYLE}
            value={formatPhoneWithDashes(sCustomerInfo.customerLandline)}
          />
          <TextInput
            onChangeText={(val) => saveField("email", val)}
            placeholder="Email address"
            className={styles.input}
            style={INPUT_BASE_STYLE}
            value={sCustomerInfo.email}
          />
        </div>

        <div className={styles.fieldGroup}>
          <div className={styles.fieldGroupTitle}>Info</div>
          <TextInput
            onChangeText={(val) => saveField("first", capitalizeFirstLetterOfString(val))}
            placeholder="First name"
            className={styles.input}
            style={INPUT_BASE_STYLE}
            value={capitalizeFirstLetterOfString(sCustomerInfo.first)}
            capitalize={true}
          />
          <TextInput
            onChangeText={(val) => saveField("last", capitalizeFirstLetterOfString(val))}
            placeholder="Last name"
            className={styles.input}
            style={INPUT_BASE_STYLE}
            value={capitalizeFirstLetterOfString(sCustomerInfo.last)}
            capitalize={true}
          />
          <div className={styles.langRow}>
            <span className={styles.langLabel} style={{ color: C.textMuted }}>Language</span>
            <DropdownMenu
              dataArr={Object.values(CUSTOMER_LANGUAGES).map((lang) => ({ label: lang, value: lang }))}
              buttonText={sCustomerInfo.language || CUSTOMER_LANGUAGES.english}
              onSelect={(item) => saveField("language", item.value)}
              useSelectedAsButtonTitle={false}
            />
          </div>
        </div>

        <div className={styles.fieldGroup}>
          <div className={styles.fieldGroupTitle}>Address</div>
          <TextInput
            onChangeText={(val) => saveField("streetAddress", capitalizeFirstLetterOfString(val))}
            placeholder="Street address"
            className={styles.input}
            style={INPUT_BASE_STYLE}
            value={capitalizeFirstLetterOfString(sCustomerInfo.streetAddress)}
            capitalize={true}
          />
          <div className={styles.unitCityRow}>
            <TextInput
              onChangeText={(val) => saveField("unit", val)}
              placeholder="Unit"
              className={styles.input}
              style={{ ...INPUT_BASE_STYLE, marginTop: 0, width: "24%", height: "100%" }}
              value={sCustomerInfo.unit}
            />
            <TextInput
              onChangeText={(val) => saveField("city", capitalizeFirstLetterOfString(val))}
              placeholder="City"
              className={styles.input}
              style={{ ...INPUT_BASE_STYLE, marginTop: 0, width: "70%", height: "100%" }}
              value={capitalizeFirstLetterOfString(sCustomerInfo.city)}
              capitalize={true}
            />
          </div>
          <TextInput
            onChangeText={(val) => saveField("state", val.toUpperCase())}
            placeholder="State"
            className={styles.input}
            style={INPUT_BASE_STYLE}
            value={(sCustomerInfo.state || "").toUpperCase()}
          />

          <div className={styles.zipMapsRow}>
            <TextInput
              onChangeText={(val) => {
                if (!checkInputForNumbersOnly(val)) return;
                saveField("zip", val);
              }}
              placeholder="Zip code"
              className={styles.input}
              style={{ ...INPUT_BASE_STYLE, marginTop: 0, flex: 1, height: "100%" }}
              value={sCustomerInfo.zip}
            />
            {!!sCustomerInfo.streetAddress && !!sCustomerInfo.city && !!sCustomerInfo.state && (
              <Button
                text="Maps"
                icon={ICONS.map}
                iconSize={16}
                onPress={() => _sSetShowMapsModal(true)}
                colorGradientArr={COLOR_GRADIENTS.blue}
                buttonStyle={{
                  paddingTop: 2,
                  paddingBottom: 2,
                  height: "100%",
                  borderRadius: 7,
                  marginLeft: 10,
                  justifyContent: "center",
                }}
                textStyle={{ color: C.textWhite, fontSize: 13, fontWeight: "600" }}
              />
            )}
          </div>

          <TextInput
            onChangeText={(val) => saveField("notes", capitalizeFirstLetterOfString(val))}
            placeholder="Address notes"
            multiline={true}
            numberOfLines={3}
            className={styles.notes}
            style={{ ...INPUT_BASE_STYLE, minHeight: 70, maxHeight: 70 }}
            value={capitalizeFirstLetterOfString(sCustomerInfo.notes)}
            capitalize={true}
          />

          <CheckBox
            isChecked={!!sCustomerInfo.gatedCommunity}
            text="Gated community"
            textStyle={{ fontSize: 13 }}
            buttonStyle={{ backgroundColor: "transparent", marginTop: 15 }}
            onCheck={() => saveField("gatedCommunity", !sCustomerInfo.gatedCommunity)}
          />
        </div>
      </div>

      {!isNewCustomer && (
        <div className={styles.workordersCol}>
          <div className={styles.colHeader}>
            <Button
              icon={ICONS.workorder}
              iconSize={18}
              textStyle={{ color: C.textMuted, fontSize: 13 }}
              text={"REFRESH WORKORDERS"}
              buttonStyle={{ paddingLeft: 20, paddingRight: 20 }}
              onPress={() => loadWorkorders()}
              enabled={!sWoLoading}
            />
            {sWoLoading && (
              <span style={{ marginLeft: 8, display: "flex", alignItems: "center" }}>
                <SmallLoadingIndicator />
              </span>
            )}
          </div>
          {sWorkorders.length > 0 && (
            <WorkordersList
              workorders={sWorkorders}
              onSelect={(wo) => { _sSetClosedWorkorder(wo); }}
            />
          )}
          {sWorkorders.length === 0 &&
            !sWoLoading &&
            (sCustomerInfo.workorders || []).length === 0 && (
              <span className={styles.emptyText} style={{ color: C.textMuted }}>
                No workorders on file
              </span>
            )}
        </div>
      )}

      {!isNewCustomer && (
        <div className={styles.salesCol}>
          <DepositsList
            deposits={sCustomerInfo.deposits || []}
            credits={sCustomerInfo.credits || []}
            onDepositPress={(deposit) => {
              if (!deposit.id) return;
              _sSetRefundDeposit(deposit);
            }}
            onCreditPress={(credit) => _sSetEditingCredit(credit)}
          />
          <div className={styles.salesHeader}>
            <Button
              icon={ICONS.dollarYellow}
              iconSize={20}
              text={"REFRESH SALES"}
              textStyle={{ color: C.textMuted, fontSize: 13 }}
              buttonStyle={{ paddingLeft: 20, paddingRight: 20 }}
              onPress={() => loadSales()}
              enabled={!sSalesLoading}
            />
            {sSalesLoading && (
              <span style={{ marginLeft: 8, display: "flex", alignItems: "center" }}>
                <SmallLoadingIndicator />
              </span>
            )}
          </div>
          {sSales.length > 0 ? (
            <div className={styles.scrollArea}>
              <SalesList
                sales={sSales}
                transactionsMap={sSaleTransactionsMap}
                onSelect={(sale) => {
                  if (sale._isActiveSale) {
                    if (onClose) onClose();
                    useCheckoutStore.getState().setViewOnlySale(sale);
                    useCheckoutStore.getState().setIsCheckingOut(true);
                  } else {
                    _sSetSaleModalItem({ saleID: sale.id });
                  }
                }}
              />
            </div>
          ) : !sSalesLoading && (sCustomerInfo.sales || []).length === 0 ? (
            <span className={styles.emptyText} style={{ color: C.textMuted }}>
              No sales on file
            </span>
          ) : null}
        </div>
      )}

      {!isNewCustomer && !!sCustomerInfo?.customerCell && (
        <div className={styles.messagesCol}>
          <CustomerMessagesPanel
            customerPhone={sCustomerInfo.customerCell}
            customerID={sCustomerInfo.id}
            customerFirst={sCustomerInfo.first}
            customerLast={sCustomerInfo.last}
          />
        </div>
      )}
      </div>

      <ModalFooter>
        <ModalFooterButton tooltip="All edits auto-saved" onClick={onClose}>
          {dismissText}
        </ModalFooterButton>
        {!!primaryHandler && (
          <ModalFooterButton
            variant="primary"
            icon={ICONS.gears1}
            disabled={!primaryEnabled}
            onClick={() => primaryHandler(sCustomerInfo)}
          >
            {primaryText}
          </ModalFooterButton>
        )}
        {!isNewCustomer && (
          <ModalFooterButton
            variant="accent"
            icon={ICONS.greenDollar}
            tooltip="Deposits, gift cards and credits"
            onClick={() => _sSetShowDepositModal(true)}
          >
            Add Money
          </ModalFooterButton>
        )}
      </ModalFooter>

      <DepositModal
        visible={sShowDepositModal}
        onClose={() => _sSetShowDepositModal(false)}
        customer={sCustomerInfo}
        onPay={(depositInfo) => {
          _sSetShowDepositModal(false);
          if (onClose) onClose();
          useCheckoutStore.getState().setDepositInfo(depositInfo);
          useCheckoutStore.getState().setIsCheckingOut(true);
        }}
        onCredit={({ amountCents, text, sendSMS, sendEmail }) => {
          let credit = { ...CUSTOMER_CREDIT_PROTO };
          credit.id = generateEAN13Barcode();
          credit.text = text;
          credit.amountCents = amountCents;
          credit.millis = Date.now();
          let updated = { ...sCustomerInfo, credits: [...(sCustomerInfo.credits || []), credit] };
          _setCustomerInfo(updated);
          useCurrentCustomerStore.getState().setCustomer(updated);
          dbSaveCustomer(updated);
          if (sendSMS || sendEmail) {
            let settings = useSettingsStore.getState().getSettings();
            let customerForReceipt = {
              first: sCustomerInfo.first || "",
              last: sCustomerInfo.last || "",
              customerCell: sCustomerInfo.customerCell || "",
              email: sCustomerInfo.email || "",
              id: sCustomerInfo.id || "",
            };
            sendCreditReceipt(credit, customerForReceipt, settings, sendSMS, sendEmail);
          }
        }}
      />
      {!!sRefundDeposit && (
        <Suspense fallback={<SmallLoadingIndicator />}>
          <DepositRefundModal
            visible={!!sRefundDeposit}
            deposit={sRefundDeposit}
            customer={sCustomerInfo}
            onClose={() => _sSetRefundDeposit(null)}
            onCustomerUpdated={(updatedCustomer) => { _setCustomerInfo(updatedCustomer); }}
          />
        </Suspense>
      )}
      {!!sClosedWorkorder && (
        <Suspense fallback={<SmallLoadingIndicator />}>
          <ClosedWorkorderModal
            workorder={sClosedWorkorder}
            onClose={() => _sSetClosedWorkorder(null)}
            onRefund={(saleID) => {
              _sSetClosedWorkorder(null);
              if (onClose) onClose();
              useCheckoutStore.getState().setPendingRefundSaleID(saleID);
            }}
            onGoToWorkorder={(wo) => {
              const store = useOpenWorkordersStore.getState();
              const lockedID = store.lockedWorkorderID;
              if (lockedID && lockedID !== wo.id) {
                store.setLockedWorkorderID(null);
                store.removeWorkorder(lockedID, false);
              }
              store.setOpenWorkorderID(wo.id);
              useTabNamesStore.getState().setItems({
                infoTabName: TAB_NAMES.infoTab.workorder,
                itemsTabName: TAB_NAMES.itemsTab.workorderItems,
                optionsTabName: TAB_NAMES.optionsTab.inventory,
              });
              useWorkorderPreviewStore.getState().setPreviewObj(null);
              if (wo.customerID) {
                dbGetCustomer(wo.customerID).then((customer) => {
                  if (customer) useCurrentCustomerStore.getState().setCustomer(customer, false);
                });
              }
              _sSetClosedWorkorder(null);
              if (onClose) onClose();
            }}
          />
        </Suspense>
      )}
      <CreditEditModal
        credit={sEditingCredit}
        customer={sCustomerInfo}
        onClose={() => _sSetEditingCredit(null)}
        onSave={(credit, newAmountCents) => {
          if (newAmountCents <= 0) {
            let updatedCredits = (sCustomerInfo.credits || []).filter((c) => c.id !== credit.id);
            let updated = { ...sCustomerInfo, credits: updatedCredits };
            _setCustomerInfo(updated);
            useCurrentCustomerStore.getState().setCustomer(updated);
            dbSaveCustomer(updated);
            _sSetEditingCredit(null);
          } else {
            let updatedCredits = (sCustomerInfo.credits || []).map((c) =>
              c.id === credit.id ? { ...c, amountCents: newAmountCents } : c
            );
            let updated = { ...sCustomerInfo, credits: updatedCredits };
            _setCustomerInfo(updated);
            useCurrentCustomerStore.getState().setCustomer(updated);
            dbSaveCustomer(updated);
            _sSetEditingCredit(null);
          }
        }}
        onDelete={(credit) => {
          let updatedCredits = (sCustomerInfo.credits || []).filter((c) => c.id !== credit.id);
          let updated = { ...sCustomerInfo, credits: updatedCredits };
          _setCustomerInfo(updated);
          useCurrentCustomerStore.getState().setCustomer(updated);
          dbSaveCustomer(updated);
          _sSetEditingCredit(null);
        }}
      />
      {!!sSaleModalItem && (
        <Suspense fallback={<SmallLoadingIndicator />}>
          <FullSaleModal
            item={sSaleModalItem}
            onClose={() => _sSetSaleModalItem(null)}
            onRefund={(saleID) => {
              _sSetSaleModalItem(null);
              if (onClose) onClose();
              useCheckoutStore.getState().setPendingRefundSaleID(saleID);
            }}
          />
        </Suspense>
      )}
      {sShowMapsModal && (
        <Suspense fallback={<SmallLoadingIndicator />}>
          <GoogleMapsModal
            visible={sShowMapsModal}
            onClose={() => _sSetShowMapsModal(false)}
            startAddress={(() => {
              const si = useSettingsStore.getState().getSettings()?.storeInfo;
              if (!si) return "";
              return [si.street, si.unit, si.city, si.state, si.zip].filter(Boolean).join(", ");
            })()}
            endAddress={[sCustomerInfo.streetAddress, sCustomerInfo.unit, sCustomerInfo.city, sCustomerInfo.state, sCustomerInfo.zip].filter(Boolean).join(", ")}
          />
        </Suspense>
      )}
    </div>
  );
};

const LoadingOverlay = ({ text }) => (
  <div className={styles.loadingOverlay}>
    <SmallLoadingIndicator />
    <span className={styles.loadingText} style={{ color: C.textMuted }}>{text}</span>
  </div>
);

const WorkorderCard = ({ workorder, statuses, taxPercent, zActiveSales, onSelect }) => {
  const [sShowItems, _sSetShowItems] = useState(false);
  const rs = resolveStatus(workorder.status, statuses);
  const totals = calculateRunningTotals(workorder, taxPercent, [], false, !!workorder.taxFree);
  const itemCount = workorder.workorderLines?.length || 0;

  let totalNode;
  let sale = workorder.activeSaleID ? zActiveSales.find((s) => s.id === workorder.activeSaleID) : null;
  let paid = sale ? (sale.amountCaptured || 0) - (sale.amountRefunded || 0) : 0;
  if (workorder.paymentComplete) {
    totalNode = (
      <span className={styles.woFooterTotal} style={{ color: C.green }}>
        {"$" + formatCurrencyDisp(totals.finalTotal)}
      </span>
    );
  } else if (paid > 0) {
    totalNode = (
      <span className={styles.woFooterTotal} style={{ color: C.orange }}>
        {"$" + formatCurrencyDisp(paid) + " paid"}
      </span>
    );
  } else {
    totalNode = (
      <span className={styles.woFooterTotal} style={{ color: C.text }}>
        {"$" + formatCurrencyDisp(totals.finalTotal)}
      </span>
    );
  }

  return (
    <div
      className={styles.woCard}
      style={{
        borderLeftColor: rs.backgroundColor || C.buttonLightGreenOutline,
        borderColor: C.buttonLightGreenOutline,
        backgroundColor: C.listItemWhite,
      }}
    >
      <button
        type="button"
        className={styles.woClickable}
        onClick={() => onSelect(workorder)}
      >
        <div className={styles.woRow}>
          <div className={styles.woNameWrap}>
            <span className={styles.woName}>
              {capitalizeFirstLetterOfString(workorder.customerFirst) +
                " " +
                capitalizeFirstLetterOfString(workorder.customerLast)}
            </span>
            {itemCount > 0 && (
              <span className={styles.woItemBadge}>{itemCount}</span>
            )}
            {!!workorder.workorderNumber && (
              <span className={styles.woNumber} style={{ color: C.blue }}>
                {"#" + formatWorkorderNumber(workorder.workorderNumber)}
              </span>
            )}
          </div>
          <span
            className={styles.woStatusBadge}
            style={{ backgroundColor: rs.backgroundColor, color: rs.textColor }}
          >
            {rs.label}
          </span>
        </div>

        <div className={styles.woDescRow}>
          <div className={styles.woNameWrap}>
            <span className={styles.woBrand} style={{ color: C.text }}>
              {workorder.brand || ""}
            </span>
            {!!workorder.description && <span className={styles.woDescDot} />}
            <span className={styles.woDesc} style={{ color: C.text }}>
              {workorder.description || ""}
            </span>
          </div>
          <div className={styles.woColorRow}>
            {!!workorder.color1?.label && (
              <span
                className={styles.woColorBadge}
                style={{
                  backgroundColor: workorder.color1.backgroundColor,
                  color: workorder.color1.textColor,
                }}
              >
                {workorder.color1.label}
              </span>
            )}
            {!!workorder.color2?.label && (
              <span
                className={styles.woColorBadge + " " + styles.woColorBadgeSecond}
                style={{
                  backgroundColor: workorder.color2.backgroundColor,
                  color: workorder.color2.textColor,
                }}
              >
                {workorder.color2.label}
              </span>
            )}
          </div>
        </div>

        <div className={styles.woFooter}>
          <span className={styles.woFooterDate}>
            {formatMillisForDisplay(workorder.startedOnMillis, true)}
          </span>
          {!!workorder.waitTime?.label && (
            <span className={styles.woFooterWait} style={{ color: C.textMuted }}>
              {"est: " + workorder.waitTime.label}
            </span>
          )}
          {totalNode}
        </div>
      </button>

      {itemCount > 0 && (
        <div className={styles.woItemsToggleWrap}>
          <button
            type="button"
            onClick={() => _sSetShowItems(!sShowItems)}
            className={styles.woItemsToggleBtn}
            style={{ color: C.blue }}
          >
            {sShowItems ? "Hide items" : "Show items"}
          </button>
          {sShowItems && (
            <div className={styles.woItemsList}>
              {workorder.workorderLines.map((line) => (
                <div key={line.id} className={styles.woItemRow}>
                  <span className={styles.woItemName} style={{ color: C.text }}>
                    {line.inventoryItem?.formalName || "Unnamed item"}
                  </span>
                  <span className={styles.woItemQty} style={{ color: C.blue }}>
                    {line.qty}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const WorkordersList = ({ workorders, onSelect }) => {
  const statuses = useSettingsStore((s) => s.settings?.statuses) || [];
  const taxPercent = useSettingsStore((s) => s.settings?.salesTaxPercent) || 0;
  const zActiveSales = useActiveSalesStore((state) => state.activeSales);

  const sorted = [...workorders].sort((a, b) => (b.startedOnMillis || 0) - (a.startedOnMillis || 0));

  return (
    <div className={styles.scrollArea}>
      {sorted.map((wo) => (
        <WorkorderCard
          key={wo.id}
          workorder={wo}
          statuses={statuses}
          taxPercent={taxPercent}
          zActiveSales={zActiveSales}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
};

const CreditEditModal = ({ credit, customer, onClose, onSave, onDelete }) => {
  const [sDisplay, _sSetDisplay] = useState("");
  const [sCents, _sSetCents] = useState(0);
  const [sSendSMS, _sSetSendSMS] = useState(false);
  const [sSendEmail, _sSetSendEmail] = useState(false);
  const [sPrint, _sSetPrint] = useState(false);

  let hasPhone = !!(customer?.customerCell);
  let hasEmail = !!(customer?.email);

  useEffect(() => {
    if (credit) {
      let result = usdTypeMask((credit.amountCents / 100).toFixed(2));
      _sSetDisplay(result.display);
      _sSetCents(credit.amountCents);
    }
  }, [credit?.id]);

  if (!credit) return null;

  function handleChange(val) {
    let result = usdTypeMask(val);
    if (result.cents > credit.amountCents) {
      let capped = usdTypeMask((credit.amountCents / 100).toFixed(2));
      _sSetDisplay(capped.display);
      _sSetCents(credit.amountCents);
    } else {
      _sSetDisplay(result.display);
      _sSetCents(result.cents);
    }
  }

  function handleConfirm() {
    let finalCents = sCents;
    if (finalCents > 0 && finalCents < 100) finalCents = 100;
    if (finalCents > credit.amountCents) finalCents = credit.amountCents;
    if (sSendSMS || sSendEmail || sPrint) {
      let settings = useSettingsStore.getState().getSettings();
      let _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings };
      if (sSendSMS || sSendEmail) {
        let customerForReceipt = {
          first: customer?.first || "",
          last: customer?.last || "",
          customerCell: customer?.customerCell || "",
          email: customer?.email || "",
          id: customer?.id || "",
        };
        sendCreditReceipt(credit, customerForReceipt, settings, sSendSMS, sSendEmail);
      }
      if (sPrint) {
        let toPrint = printBuilder.credit(credit, customer, _ctx);
        dbSavePrintObj(toPrint, localStorageWrapper.getItem("selectedPrinterID") || "");
      }
    }
    onSave(credit, finalCents);
  }

  return (
    <div className={styles.creditBackdrop}>
      <button type="button" className={styles.creditBackdropBtn} onClick={onClose} />
      <div
        className={styles.creditCard}
        style={{
          backgroundColor: C.backgroundWhite,
          borderColor: C.buttonLightGreenOutline,
        }}
      >
        <div className={styles.creditTitle} style={{ color: C.text }}>
          Edit Credit
        </div>
        {!!(credit.text || credit.note) && (
          <div className={styles.creditNote} style={{ color: C.textMuted }}>
            {credit.text || credit.note}
          </div>
        )}
        <div
          className={styles.creditAmountRow}
          style={{
            borderColor: C.buttonLightGreenOutline,
            backgroundColor: C.listItemWhite,
          }}
        >
          <span className={styles.creditDollarSign} style={{ color: C.textMuted }}>$</span>
          <TextInput
            placeholder={formatCurrencyDisp(credit.amountCents)}
            placeholderTextColor={C.textDisabled}
            value={sDisplay}
            onChangeText={handleChange}
            debounceMs={0}
            onFocus={() => { _sSetDisplay(""); _sSetCents(0); }}
            className={styles.creditAmountInput}
            style={{ color: C.text }}
          />
        </div>
        <div className={styles.creditReceiptWrap}>
          <div className={styles.creditReceiptLabel} style={{ color: C.textMuted }}>
            Send Receipt
          </div>
          <div className={styles.creditCheckRow}>
            <CheckBox
              text="SMS"
              isChecked={sSendSMS}
              onCheck={() => _sSetSendSMS(!sSendSMS)}
              enabled={hasPhone}
              textStyle={{ fontSize: 13, color: hasPhone ? C.text : C.textDisabled }}
              buttonStyle={{ marginRight: 18 }}
            />
            <CheckBox
              text="Email"
              isChecked={sSendEmail}
              onCheck={() => _sSetSendEmail(!sSendEmail)}
              enabled={hasEmail}
              textStyle={{ fontSize: 13, color: hasEmail ? C.text : C.textDisabled }}
              buttonStyle={{ marginRight: 18 }}
            />
            <CheckBox
              text="Print"
              isChecked={sPrint}
              onCheck={() => _sSetPrint(!sPrint)}
              textStyle={{ fontSize: 13 }}
            />
          </div>
        </div>
        <div className={styles.creditActions}>
          <Button
            text="Delete"
            icon={ICONS.trash}
            iconSize={14}
            colorGradientArr={COLOR_GRADIENTS.red}
            textStyle={{ color: C.textWhite, fontSize: 13 }}
            buttonStyle={{ height: 34, borderRadius: 5, paddingLeft: 14, paddingRight: 14 }}
            onPress={() => onDelete(credit)}
          />
          <div className={styles.creditActionGroup}>
            <Button
              text="Cancel"
              buttonStyle={{ height: 34, borderRadius: 5, paddingLeft: 14, paddingRight: 14, marginRight: 8 }}
              textStyle={{ color: C.textMuted, fontSize: 13 }}
              onPress={onClose}
            />
            <Button
              text="Save & Print"
              colorGradientArr={COLOR_GRADIENTS.green}
              textStyle={{ color: C.textWhite, fontSize: 13 }}
              buttonStyle={{ height: 34, borderRadius: 5, paddingLeft: 20, paddingRight: 20 }}
              onPress={handleConfirm}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

function autoCapitalize(val) {
  if (!val) return val;
  if (val.length > 10000) val = val.slice(0, 10000);
  val = val.replace(/(^|[.!?]\s+)([a-z])/g, (m, before, letter) => before + letter.toUpperCase());
  val = val.replace(/(^|\s)i(?=$|\s|[.,!?;:'])/g, (m, before) => before + "I");
  val = val.replace(/(\S?)(\s+)I([a-z])/g, (m, prev, space, after) => {
    if (/[.!?]/.test(prev)) return m;
    return prev + space + "i" + after;
  });
  return val;
}

const CustomerMessagesPanel = ({ customerPhone, customerID, customerFirst, customerLast }) => {
  const [sMessages, _sSetMessages] = useState([]);
  const [sNewMessage, _sSetNewMessage] = useState("");
  const [sLoading, _sSetLoading] = useState(true);
  const [sSending, _sSending] = useState(false);
  const [sShowReplyModal, _sSetShowReplyModal] = useState(false);
  const [sSelectedForwardIDs, _sSetSelectedForwardIDs] = useState(() => initialSelectedForwardIDs(null));
  const zSmsThreads = useCustMessagesStore((state) => state.getSmsThreads());
  let thread = zSmsThreads.find((t) => t.phone === customerPhone);
  const [sCanRespond, _sSetCanRespond] = useState(
    thread?.canRespond !== undefined ? !!thread.canRespond : true
  );
  const lastThreadCanRespondRef = useRef(thread?.canRespond);
  if (thread?.canRespond !== lastThreadCanRespondRef.current) {
    lastThreadCanRespondRef.current = thread?.canRespond;
    _sSetCanRespond(thread?.canRespond !== undefined ? !!thread.canRespond : true);
  }
  const scrollRef = useRef(null);
  const unsubRef = useRef(null);

  let outgoing = sMessages.filter((m) => m.type === "outgoing");
  let lastOutgoingID =
    outgoing.length > 0
      ? [...outgoing].sort((a, b) => (b.millis || 0) - (a.millis || 0))[0]?.id
      : null;

  let currentUser = useLoginStore.getState().getCurrentUser();
  let hasActivePhone = !!currentUser?.phone;

  // (useEffect required: this self-contained component fetches/subscribes on mount)
  useEffect(() => {
    if (!customerPhone || customerPhone.length !== 10) {
      _sSetMessages([]);
      _sSetLoading(false);
      return;
    }
    let cancelled = false;
    _sSetLoading(true);
    dbGetCustomerMessages(customerPhone, null, 20)
      .then((result) => {
        if (cancelled) return;
        _sSetLoading(false);
        if (!result.success) return;
        let sorted = result.messages.sort((a, b) => (a.millis || 0) - (b.millis || 0));
        _sSetMessages(sorted);
        let lastMillis = 0;
        sorted.forEach((m) => { if (m.millis > lastMillis) lastMillis = m.millis; });
        if (!lastMillis) lastMillis = Date.now();
        unsubRef.current = dbListenToNewMessages(customerPhone, lastMillis, (newMessages) => {
          if (cancelled) return;
          _sSetMessages((prev) => {
            let existingIDs = new Set(prev.map((m) => m.id));
            let fresh = newMessages.filter((m) => !existingIDs.has(m.id));
            if (!fresh.length) return prev;
            return [...prev, ...fresh].sort((a, b) => (a.millis || 0) - (b.millis || 0));
          });
        });
      })
      .catch(() => { _sSetLoading(false); });
    return () => {
      cancelled = true;
      if (unsubRef.current) unsubRef.current();
    };
  }, [customerPhone]);

  // (useEffect required: auto-scroll on messages change)
  useEffect(() => {
    if (sMessages.length > 0 && scrollRef.current) {
      setTimeout(() => {
        try {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        } catch (e) {}
      }, 100);
    }
  }, [sMessages.length]);

  function handlePressSend() {
    let text = sNewMessage.trim();
    if (!text || !customerPhone || customerPhone.length !== 10) return;
    _sSetShowReplyModal(true);
    scheduleAutoSend(() => {
      _sSetShowReplyModal(false);
      sendMessage(sCanRespond);
    });
  }

  async function sendMessage(canRespondVal, forwardToArrayOrNull) {
    let text = sNewMessage.trim();
    if (!text || !customerPhone || customerPhone.length !== 10) return;
    _sSetNewMessage("");
    _sSending(true);
    let zCurrentUserObj = useLoginStore.getState().getCurrentUser();
    let useCanRespond = canRespondVal !== undefined ? canRespondVal : sCanRespond;
    let forwardTo = Array.isArray(forwardToArrayOrNull) ? forwardToArrayOrNull : null;
    let msg = { ...SMS_PROTO };
    msg.message = text;
    msg.phoneNumber = customerPhone;
    if (customerFirst) msg.customerFirst = customerFirst;
    if (customerLast) msg.customerLast = customerLast;
    msg.canRespond = useCanRespond ? true : null;
    msg.millis = Date.now();
    msg.customerID = customerID || "";
    msg.id = crypto.randomUUID();
    msg.type = "outgoing";
    msg.senderUserObj = zCurrentUserObj;
    msg.sentByUser = zCurrentUserObj.id;
    if (Array.isArray(forwardTo)) msg.forwardTo = forwardTo;
    _sSetMessages((prev) => [...prev, { ...msg, status: "sending" }]);
    let result = await smsService.send(msg);
    _sSending(false);
    if (!result.success) {
      _sSetMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, status: "failed" } : m))
      );
      useAlertScreenStore.getState().setValues({
        title: "Message Failed",
        message: result.error || "Failed to send message",
        btn1Text: "OK",
        handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
        showAlert: true,
        canExitOnOuterClick: true,
      });
    } else {
      _sSetMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, status: "sent" } : m))
      );
    }
  }

  async function handleToggleBlock() {
    if (!customerPhone || customerPhone.length !== 10) return;
    let newCanRespond = sCanRespond ? null : true;
    _sSetCanRespond(!sCanRespond);
    await dbUpdateMessageCanRespond(customerPhone, null, newCanRespond);
    if (!newCanRespond) {
      let user = useLoginStore.getState().getCurrentUser();
      let arr = Array.isArray(thread?.forwardTo) ? thread.forwardTo : [];
      if (user?.id && arr.some((f) => f.userID === user.id)) {
        await dbToggleSMSForwarding(customerPhone, user.id, false, user.phone, user.first);
      }
    }
  }

  async function handleToggleForward() {
    if (!customerPhone || customerPhone.length !== 10) return;
    let user = useLoginStore.getState().getCurrentUser();
    if (!user?.id) return;
    let arr = Array.isArray(thread?.forwardTo) ? thread.forwardTo : [];
    let isCurrentlyForwarding = arr.some((f) => f.userID === user.id);
    if (!isCurrentlyForwarding && !sCanRespond) {
      _sSetCanRespond(true);
      await dbUpdateMessageCanRespond(customerPhone, null, true);
    }
    await dbToggleSMSForwarding(
      customerPhone,
      user.id,
      !isCurrentlyForwarding,
      user.phone,
      user.first
    );
  }

  function handleFire() {
    if (!sSelectedForwardIDs?.length) return;
    const users = useSettingsStore.getState().getSettings()?.users || [];
    const forwardToArray = buildForwardToArray(sSelectedForwardIDs, users);
    clearAutoSend();
    _sSetCanRespond(true);
    _sSetShowReplyModal(false);
    sendMessage(true, forwardToArray);
  }

  return (
    <div
      className={styles.msgPanel}
      style={{
        borderLeftColor: C.buttonLightGreenOutline,
        backgroundColor: C.backgroundWhite,
      }}
    >
      <div
        className={styles.msgHeader}
        style={{ borderBottomColor: lightenRGBByPercent(C.buttonLightGreenOutline, 30) }}
      >
        <Image icon={ICONS.paperPlane} className={styles.msgHeaderIcon} />
        <span className={styles.msgHeaderTitle} style={{ color: C.text }}>Messages</span>
        <span className={styles.msgHeaderPhone} style={{ color: C.textMuted }}>
          {formatPhoneForDisplay(customerPhone)}
        </span>
      </div>

      {sLoading ? (
        <div className={styles.msgLoadingWrap}>
          <SmallLoadingIndicator />
        </div>
      ) : sMessages.length === 0 ? (
        <div className={styles.msgListEmpty}>
          <Image icon={ICONS.paperPlane} className={styles.msgEmptyIcon} />
          <span className={styles.msgEmptyText} style={{ color: C.textMuted }}>
            No messages yet
          </span>
        </div>
      ) : (
        <div ref={scrollRef} className={styles.msgListWrap}>
          {sMessages.map((msg) =>
            msg.type === "outgoing" ? (
              <OutgoingMessageComponent
                key={msg.id}
                msgObj={msg}
                isLastOutgoing={msg.id === lastOutgoingID}
                thread={thread}
                onToggleBlock={handleToggleBlock}
                onToggleForward={handleToggleForward}
              />
            ) : (
              <IncomingMessageComponent
                key={msg.id}
                msgObj={msg}
                onScrollToBottom={() => {
                  if (scrollRef.current) {
                    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                  }
                }}
              />
            )
          )}
        </div>
      )}

      <ComposeArea
        mode="customer"
        value={sNewMessage}
        onChange={(val) => _sSetNewMessage(autoCapitalize(val))}
        onSend={handlePressSend}
        sendDisabled={sSending || !sNewMessage.trim()}
        placeholder="Type a message..."
        showReplyOptions={sShowReplyModal}
        hasActivePhone={hasActivePhone}
        onSelectCanRespond={(canRespond) => {
          clearAutoSend();
          _sSetCanRespond(canRespond);
          _sSetShowReplyModal(false);
          sendMessage(canRespond);
        }}
        selectedForwardIDs={sSelectedForwardIDs}
        onChangeSelectedForwardIDs={_sSetSelectedForwardIDs}
        onFire={handleFire}
      />
    </div>
  );
};

const SalesList = ({ sales, transactionsMap = {}, onSelect }) => {
  const sorted = [...sales].sort((a, b) => (b.millis || 0) - (a.millis || 0));
  return (
    <div style={{ width: "100%" }}>
      {sorted.map((sale) => {
        const txns = transactionsMap[sale.id] || [];
        const totalRefunded = txns.reduce(
          (s, t) => s + (t.refunds || []).reduce((rs, r) => rs + (r.amount || 0), 0),
          0
        );
        const hasRefunds = totalRefunded > 0;

        return (
          <button
            type="button"
            key={sale.id}
            onClick={() => onSelect(sale)}
            className={styles.saleCard}
            style={{
              borderLeftColor: sale._isActiveSale
                ? C.orange
                : sale.paymentComplete
                  ? C.green
                  : C.lightred,
              borderColor: C.buttonLightGreenOutline,
              backgroundColor: C.listItemWhite,
            }}
          >
            <div className={styles.saleRow1}>
              <span className={styles.saleDate} style={{ color: "dimgray" }}>
                {formatMillisForDisplay(sale.millis, true)}
              </span>
              <div className={styles.saleBadgesWrap}>
                {sale._isActiveSale && (
                  <span
                    className={styles.saleBadge}
                    style={{
                      backgroundColor: lightenRGBByPercent(C.orange, 65),
                      color: C.orange,
                    }}
                  >
                    Active
                  </span>
                )}
                {sale.isDepositSale && (
                  <span
                    className={styles.saleBadgeSmall}
                    style={{
                      backgroundColor: sale.depositType === "credit"
                        ? lightenRGBByPercent(C.blue, 70)
                        : lightenRGBByPercent(C.orange, 70),
                      color: sale.depositType === "credit" ? C.blue : C.orange,
                    }}
                  >
                    {sale.depositType === "credit" ? "Credit" : "Deposit"}
                  </span>
                )}
                {sale._isActiveSale && (
                  <span
                    className={styles.saleBadge}
                    style={{
                      backgroundColor: lightenRGBByPercent(C.orange, 65),
                      color: C.orange,
                      marginRight: 0,
                    }}
                  >
                    In Progress
                  </span>
                )}
              </div>
            </div>

            <div className={styles.saleTotalsRow}>
              {!sale.isDepositSale && (
                <div className={styles.saleTotalsLeft}>
                  <span className={styles.saleLabel} style={{ color: C.textMuted }}>Sub: </span>
                  <span className={styles.saleValue} style={{ color: C.text }}>
                    {"$" + formatCurrencyDisp(sale.subtotal)}
                  </span>
                  {sale.discount > 0 && (
                    <span className={styles.saleDiscount} style={{ color: C.lightred }}>
                      {"-$" + formatCurrencyDisp(sale.discount)}
                    </span>
                  )}
                  <span className={styles.saleLabelInline} style={{ color: C.textMuted }}>Tax: </span>
                  <span className={styles.saleValue} style={{ color: C.text }}>
                    {"$" + formatCurrencyDisp(sale.salesTax || sale.tax || 0)}
                  </span>
                </div>
              )}
              <span className={styles.saleGrandTotal} style={{ color: C.text }}>
                {"$" + formatCurrencyDisp(sale.total)}
              </span>
            </div>

            <div className={styles.salePaymentRow}>
              {txns.map((p, idx) => (
                <div
                  key={p.id || idx}
                  className={styles.salePaymentChip}
                  style={{
                    backgroundColor: C.surfaceAlt,
                    borderColor: C.borderSubtle,
                  }}
                >
                  <span className={styles.salePaymentText} style={{ color: C.text }}>
                    {p.method === "cash"
                      ? "Cash"
                      : p.method === "check"
                        ? "Check"
                        : (p.cardType || "Card") + (p.last4 ? " ..." + p.last4 : "")}
                  </span>
                  <span className={styles.salePaymentAmount} style={{ color: C.textMuted }}>
                    {"$" + formatCurrencyDisp(p.amountCaptured)}
                  </span>
                </div>
              ))}
              {hasRefunds && (
                <span className={styles.saleRefunded} style={{ color: C.lightred }}>
                  {"Refunded: $" + formatCurrencyDisp(totalRefunded)}
                </span>
              )}
            </div>

            {sale.workorderIDs?.length > 0 && (
              <span className={styles.saleLinkedWO} style={{ color: C.textMuted }}>
                {"WO: " + sale.workorderIDs.join(", ")}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
