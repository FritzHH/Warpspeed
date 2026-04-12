/*eslint-disable*/
import {
  View,
  Text,
  TextInput,
  FlatList,
  ScrollView,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from "react-native-web";
import {
  calculateRunningTotals,
  capitalizeFirstLetterOfString,
  checkInputForNumbersOnly,
  formatCurrencyDisp,
  formatMillisForDisplay,
  formatPhoneWithDashes,
  generateEAN13Barcode,
  gray,
  lightenRGBByPercent,
  formatWorkorderNumber,
  removeDashesFromPhone,
  resolveStatus,
  usdTypeMask,
} from "../../../utils";
import { C, COLOR_GRADIENTS, ICONS } from "../../../styles";
import { useState, useEffect, useRef } from "react";
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
} from "../../../stores";
import { CONTACT_RESTRICTIONS, CUSTOMER_CREDIT_PROTO, CUSTOMER_LANGUAGES, CUSTOMER_PROTO, SMS_PROTO, TAB_NAMES } from "../../../data";
import { Button_, CheckBox_, DepositModal, DepositsList, DropdownMenu, Image_, SmallLoadingIndicator, TextInput_, TouchableOpacity_ } from "../../../components";
import {
  dbSaveCustomer,
  dbGetCustomer,
  dbGetCompletedWorkorder,
  dbGetCompletedSale,
  dbGetCustomerMessages,
  dbListenToNewMessages,
  dbCheckCellPhoneExists,
} from "../../../db_calls_wrapper";
import { smsService } from "../../../data_service_modules";
import { readActiveSale, readTransactions } from "./newCheckoutModalScreen/newCheckoutFirebaseCalls";
import { ClosedWorkorderModal } from "./ClosedWorkorderModal";
import { DepositRefundModal } from "./newCheckoutModalScreen/DepositRefundModal";

export const CustomerInfoScreenModalComponent = ({
  incomingCustomer = null,
  customerID = null,
  isNewCustomer = false,
  isCurrentCustomer = true,
  button1Text,
  button2Text,
  handleButton1Press,
  handleButton2Press,
}) => {
  // Use cached customer from store if available and matching, otherwise fall back to proto
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
  const [sCellDuplicateStatus, _sCellDuplicateStatus] = useState(null); // null | "checking" | "duplicate" | "unique" | "error"
  const mountedRef = useRef(true);
  const initialCellRef = useRef(initialCustomer?.customerCell || "");

  // Fetch fresh customer on mount (background refresh even if we have cached data)
  useEffect(() => {
    mountedRef.current = true;
    if (incomingCustomer || !customerID || isNewCustomer) return;

    // Only show loading if we don't have cached data
    if (!hasCachedCustomer) _setCustomerLoading(true);

    dbGetCustomer(customerID).then((customer) => {
      if (!mountedRef.current) return;
      if (customer) {
        _setCustomerInfo(customer);
        useCurrentCustomerStore.getState().setCustomer(customer, false);
        _setCustomerLoading(false);
        // Auto-load workorders and sales once fresh customer arrives
        autoLoadWorkordersAndSales(customer);
      } else {
        _setCustomerLoadError(true);
        _setCustomerLoading(false);
      }
    }).catch(() => {
      if (!mountedRef.current) return;
      _setCustomerLoadError(true);
      _setCustomerLoading(false);
    });

    // If we have cached data, start loading workorders/sales immediately
    if (hasCachedCustomer) autoLoadWorkordersAndSales(initialCustomer);

    return () => { mountedRef.current = false; };
  }, []);

  async function loadWorkorders(customer) {
    const woIDs = (customer || sCustomerInfo).workorders || [];
    if (woIDs.length === 0) {
      _sSetWorkorders([]);
      return [];
    }
    const openWOs = useOpenWorkordersStore.getState().getWorkorders() || [];
    // Show local workorders immediately
    const localWOs = [];
    const dbIDs = [];
    woIDs.forEach((id) => {
      const local = openWOs.find((wo) => wo.id === id);
      if (local) localWOs.push(local);
      else dbIDs.push(id);
    });
    if (localWOs.length > 0 && mountedRef.current) _sSetWorkorders(localWOs);
    // Fetch completed workorders from DB in background
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
    // Show active sales from store immediately
    const activeSales = useActiveSalesStore.getState().getActiveSales() || [];
    const localSales = [];
    const dbIDs = [];
    saleIDs.forEach((id) => {
      const local = activeSales.find((s) => s.id === id);
      if (local) localSales.push({ ...local, _isActiveSale: true });
      else dbIDs.push(id);
    });
    if (localSales.length > 0 && mountedRef.current) _sSetSales(localSales);
    // Fetch completed sales from DB in background
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

        // Collect all unique workorder IDs referenced by fetched sales
        const allWoIDs = new Set();
        fetchedSales.forEach((sale) => {
          (sale.workorderIDs || []).forEach((id) => allWoIDs.add(id));
        });

        // Build a map from already-loaded workorders
        const woMap = {};
        (loadedWorkorders || sWorkorders).forEach((wo) => { woMap[wo.id] = wo; });

        // Fetch any workorder IDs not already loaded
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

        // Attach resolved workorder objects to each sale as _workorders
        const dbSalesWithWOs = fetchedSales.map((sale) => ({
          ...sale,
          _workorders: (sale.workorderIDs || [])
            .map((id) => woMap[id])
            .filter(Boolean),
        }));

        // Load transactions for each sale and attach as _transactions
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

  function navigateToWorkorder(wo) {
    const store = useOpenWorkordersStore.getState();
    const openWOs = store.getWorkorders() || [];
    const isOpen = openWOs.some((o) => o.id === wo.id);

    if (isOpen) {
      // Open workorder — navigate to it
      store.setOpenWorkorderID(wo.id);
      useTabNamesStore.getState().setItems({
        infoTabName: TAB_NAMES.infoTab.workorder,
        itemsTabName: TAB_NAMES.itemsTab.workorderItems,
        optionsTabName: TAB_NAMES.optionsTab.inventory,
      });
      useWorkorderPreviewStore.getState().setPreviewObj(null);
      if (handleButton2Press) handleButton2Press();
    } else {
      // Completed workorder — open in closed workorder modal
      _sSetClosedWorkorder(wo);
    }
  }

  function setCustomerInfo(customerInfo) {
    if (isNewCustomer) {
      // this is a new customer, it is only held locally until the create customer button is pressed
      _setCustomerInfo(customerInfo);
    } else {
      // old customer, saving updates as we go
      useCurrentCustomerStore.getState().setCustomer(customerInfo);
    }
  }

  function setCustomerField(fieldName, fieldVal) {
    _setCustomerInfo({ ...sCustomerInfo, [fieldName]: fieldVal });
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

          // Sync duplicated fields to open workorders
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

  const TEXT_INPUT_STYLE = {
    width: "100%",
    height: 40,
    borderColor: gray(0.08),
    borderWidth: 1,
    marginTop: 15,
    paddingHorizontal: 8,
    outlineWidth: 0,
    borderRadius: 7,
    color: C.text,
    backgroundColor: C.listItemWhite,
  };

  return (
    <TouchableWithoutFeedback>
      <View
        style={{
          padding: 20,
          backgroundColor: C.backgroundWhite,
          width: "95%",
          height: "90%",
          flexDirection: "row",
          borderRadius: 15,
          shadowProps: {
            shadowColor: "black",
            shadowOffset: { width: 2, height: 2 },
            shadowOpacity: 0.3,
            shadowRadius: 5,
          },
        }}
      >
        <View style={{ width: "15%", padding: 10 }}>
          <View
            style={{
              width: "100%",
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <CheckBox_
              text={"Call Only"}
              isChecked={
                sCustomerInfo?.contactRestriction === CONTACT_RESTRICTIONS.call
              }
              onCheck={() => {
                let val = sCustomerInfo.contactRestriction === CONTACT_RESTRICTIONS.call ? "" : CONTACT_RESTRICTIONS.call;
                saveField("contactRestriction", val);
              }}
            />
            <CheckBox_
              text={"Email Only"}
              isChecked={
                sCustomerInfo?.contactRestriction === CONTACT_RESTRICTIONS.email
              }
              onCheck={() => {
                let val = sCustomerInfo.contactRestriction === CONTACT_RESTRICTIONS.email ? "" : CONTACT_RESTRICTIONS.email;
                saveField("contactRestriction", val);
              }}
            />
          </View>
          <View>
            {!!sCustomerInfo?.customerCell && (
              <View style={{ flexDirection: "row", alignItems: "center", marginLeft: 2 }}>
                {sCellDuplicateStatus === "duplicate" ? (
                  <Text style={{ color: C.red, fontSize: 11, fontWeight: "600" }}>Phone number duplicate</Text>
                ) : sCellDuplicateStatus === "error" ? (
                  <Text style={{ color: C.red, fontSize: 11, fontWeight: "600" }}>Network error - cannot verify</Text>
                ) : sCellDuplicateStatus === "checking" ? (
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={{ color: gray(0.3), fontSize: 11 }}>Cell</Text>
                    <SmallLoadingIndicator style={{ marginLeft: 5 }} />
                  </View>
                ) : (
                  <Text style={{ color: gray(0.3), fontSize: 11 }}>Cell</Text>
                )}
              </View>
            )}
            <TextInput_
              onChangeText={(val) => {
                val = removeDashesFromPhone(val);
                if (val.length > 10) return;
                saveField("customerCell", val);
                checkCellPhoneUnique(val);
              }}
              placeholder="Cell phone"
              style={{
                ...TEXT_INPUT_STYLE,
                marginTop: sCustomerInfo.customerCell ? 1 : TEXT_INPUT_STYLE.marginTop,
                ...(sCellDuplicateStatus === "duplicate" || sCellDuplicateStatus === "error"
                  ? { borderColor: C.red, borderWidth: 2 }
                  : {}),
              }}
              value={formatPhoneWithDashes(sCustomerInfo.customerCell)}
            />
          </View>

          <TextInput_
            onChangeText={(val) => {
              val = removeDashesFromPhone(val);
              if (val.length > 10) return;
              saveField("customerLandline", val);
            }}
            placeholder="Landline"
            style={{ ...TEXT_INPUT_STYLE }}
            value={formatPhoneWithDashes(sCustomerInfo.customerLandline)}
          />
          <TextInput_
            onChangeText={(val) => saveField("first", capitalizeFirstLetterOfString(val))}
            placeholder="First name"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.first}
          />
          <TextInput_
            onChangeText={(val) => saveField("last", capitalizeFirstLetterOfString(val))}
            placeholder="Last name"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.last}
          />
          <TextInput_
            onChangeText={(val) => saveField("email", val)}
            placeholder="Email address"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.email}
          />
          <TextInput_
            onChangeText={(val) => saveField("streetAddress", val)}
            placeholder="Street address"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.streetAddress}
          />
          <TextInput_
            onChangeText={(val) => saveField("unit", val)}
            placeholder="Unit"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.unit}
          />
          <TextInput_
            onChangeText={(val) => saveField("city", capitalizeFirstLetterOfString(val))}
            placeholder="City"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.city}
          />
          <TextInput_
            onChangeText={(val) => saveField("state", val.toUpperCase())}
            placeholder="State"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.state}
          />
          <TextInput_
            onChangeText={(val) => {
              if (!checkInputForNumbersOnly(val)) return;
              saveField("zip", val);
            }}
            placeholder="Zip code"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.zip}
          />
          <TextInput_
            onChangeText={(val) => saveField("notes", capitalizeFirstLetterOfString(val))}
            placeholder="Address notes"
            multiline={true}
            numberOfLines={6}
            style={{ ...TEXT_INPUT_STYLE, height: undefined, minHeight: 40, paddingVertical: 8 }}
            value={sCustomerInfo.notes}
          />
          <CheckBox_
            isChecked={!!sCustomerInfo.gatedCommunity}
            text="Gated community"
            textStyle={{ fontSize: 13 }}
            buttonStyle={{ backgroundColor: "transparent", marginTop: TEXT_INPUT_STYLE.marginTop }}
            onCheck={() => saveField("gatedCommunity", !sCustomerInfo.gatedCommunity)}
          />
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: TEXT_INPUT_STYLE.marginTop }}>
            <Text style={{ fontSize: 13, color: gray(0.5), marginRight: 8 }}>Language</Text>
            <DropdownMenu
              dataArr={Object.values(CUSTOMER_LANGUAGES).map((lang) => ({ label: lang, value: lang }))}
              buttonText={sCustomerInfo.language || CUSTOMER_LANGUAGES.english}
              buttonStyle={{ ...TEXT_INPUT_STYLE, marginTop: 0, flex: 1 }}
              buttonTextStyle={{ fontSize: 14, color: C.text }}
              onSelect={(item) => saveField("language", item.value)}
              useSelectedAsButtonTitle={false}
            />
          </View>

          <View style={{ flexDirection: "column" }}>
            {!!button1Text && (
              <Button_
                onPress={() => handleButton1Press(sCustomerInfo)}
                enabled={sCellDuplicateStatus !== "duplicate" && sCellDuplicateStatus !== "error" && sCellDuplicateStatus !== "checking"}
                colorGradientArr={COLOR_GRADIENTS.blue}
                buttonStyle={{
                  marginTop: 20,
                  height: 40,
                  width: "90%",
                  borderWidth: 1,
                  borderColor: gray(0.1),
                }}
                icon={ICONS.gears1}
                iconSize={19}
                textStyle={{ color: C.textWhite }}
                text={button1Text}
              />
            )}
            {!isNewCustomer && (
              <Button_
                onPress={() => _sSetShowDepositModal(true)}
                colorGradientArr={COLOR_GRADIENTS.green}
                icon={ICONS.greenDollar}
                buttonStyle={{
                  marginTop: 20,
                  height: 36,
                  width: "90%",
                }}
                iconSize={16}
                textStyle={{ color: C.textWhite, fontSize: 13 }}
                text={"Deposits / Credits / Gift Cards"}
              />
            )}
          </View>
          <View style={{}} />
          {!!button2Text && (
            <Button_
              icon={ICONS.close1}
              colorGradientArr={COLOR_GRADIENTS.blue}
              onPress={handleButton2Press}
              buttonStyle={{
                marginTop: 20,
                marginBottom: 10,
                height: 40,
                width: "90%",
              }}
              iconSize={17}
              textStyle={{ marginLeft: 15, color: C.textWhite }}
              text={button2Text}
            />
          )}
        </View>
        {!isNewCustomer && (
          <View
            style={{
              width: "30%",
              height: "100%",
              paddingHorizontal: 15,
              paddingVertical: 5,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
              <Button_
                icon={ICONS.workorder}
                iconSize={18}
                textStyle={{ color: gray(0.45), fontSize: 13 }}
                text={"REFRESH WORKORDERS"}
                buttonStyle={{ paddingHorizontal: 20 }}
                onPress={() => loadWorkorders()}
                enabled={!sWoLoading}
              />
              {sWoLoading && <View style={{ marginLeft: 8 }}><SmallLoadingIndicator /></View>}
            </View>
            {sWorkorders.length > 0 && (
              <WorkordersList
                workorders={sWorkorders}
                onSelect={(wo) => {
                  _sSetClosedWorkorder(wo);
                }}
              />
            )}
            {sWorkorders.length === 0 &&
              !sWoLoading &&
              (sCustomerInfo.workorders || []).length === 0 && (
                <Text style={{ color: gray(0.4), fontSize: 12, marginTop: 10, textAlign: "center" }}>
                  No workorders on file
                </Text>
              )}
          </View>
        )}
        {!isNewCustomer && (
          <View
            style={{
              width: "30%",
              height: "100%",
              paddingHorizontal: 15,
              paddingVertical: 5,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
              <Button_
                icon={ICONS.dollarYellow}
                iconSize={20}
                text={"REFRESH SALES"}
                textStyle={{ color: gray(0.45), fontSize: 13 }}
                buttonStyle={{ paddingHorizontal: 20 }}
                onPress={() => loadSales()}
                enabled={!sSalesLoading}
              />
              {sSalesLoading && <View style={{ marginLeft: 8 }}><SmallLoadingIndicator /></View>}
            </View>
            {sSales.length > 0 ? (
              <ScrollView style={{ flexShrink: 1 }}>
                <SalesList
                  sales={sSales}
                  transactionsMap={sSaleTransactionsMap}
                  onSelect={(sale) => {
                    if (sale._isActiveSale) {
                      if (handleButton2Press) handleButton2Press();
                      useCheckoutStore.getState().setViewOnlySale(sale);
                      useCheckoutStore.getState().setIsCheckingOut(true);
                    } else {
                      useOpenWorkordersStore.getState().setSaleModalObj(sale);
                    }
                  }}
                />
              </ScrollView>
            ) : !sSalesLoading && (sCustomerInfo.sales || []).length === 0 ? (
              <Text style={{ color: gray(0.4), fontSize: 12, marginTop: 10, textAlign: "center" }}>
                No sales on file
              </Text>
            ) : null}
            {/* Deposits section — directly below sales, pushes down until bottom */}
            <DepositsList
              deposits={sCustomerInfo.deposits || []}
              credits={sCustomerInfo.credits || []}
              onDepositPress={(deposit) => {
                if (!deposit.id || !deposit.transactionId) return;
                _sSetRefundDeposit(deposit);
              }}
              onCreditPress={(credit) => _sSetEditingCredit(credit)}
            />
          </View>
        )}
        {!isNewCustomer && !!sCustomerInfo?.customerCell && (
          <View style={{ width: "25%", height: "100%" }}>
            <CustomerMessagesPanel
              customerPhone={sCustomerInfo.customerCell}
              customerID={sCustomerInfo.id}
              customerFirst={sCustomerInfo.first}
              customerLast={sCustomerInfo.last}
            />
          </View>
        )}
        <DepositModal
          visible={sShowDepositModal}
          onClose={() => _sSetShowDepositModal(false)}
          onPay={(depositInfo) => {
            _sSetShowDepositModal(false);
            if (handleButton2Press) handleButton2Press();
            useCheckoutStore.getState().setDepositInfo(depositInfo);
            useCheckoutStore.getState().setIsCheckingOut(true);
          }}
          onCredit={({ amountCents, text }) => {
            let credit = { ...CUSTOMER_CREDIT_PROTO };
            credit.id = generateEAN13Barcode();
            credit.text = text;
            credit.amountCents = amountCents;
            credit.millis = Date.now();
            let updated = { ...sCustomerInfo, credits: [...(sCustomerInfo.credits || []), credit] };
            _setCustomerInfo(updated);
            useCurrentCustomerStore.getState().setCustomer(updated);
            dbSaveCustomer(updated);
          }}
        />
        <DepositRefundModal
          visible={!!sRefundDeposit}
          deposit={sRefundDeposit}
          customer={sCustomerInfo}
          onClose={() => _sSetRefundDeposit(null)}
          onCustomerUpdated={(updatedCustomer) => {
            _setCustomerInfo(updatedCustomer);
          }}
        />
        <ClosedWorkorderModal
          workorder={sClosedWorkorder}
          onClose={() => _sSetClosedWorkorder(null)}
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
            if (handleButton2Press) handleButton2Press();
          }}
        />
        <CreditEditModal
          credit={sEditingCredit}
          onClose={() => _sSetEditingCredit(null)}
          onSave={(credit, newAmountCents) => {
            if (newAmountCents <= 0) {
              // 0 or negative = delete
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
      </View>
    </TouchableWithoutFeedback>
  );
};

const LoadingOverlay = ({ text }) => (
  <View
    style={{
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(255,255,255,0.85)",
      justifyContent: "center",
      alignItems: "center",
      zIndex: 10,
      borderRadius: 10,
    }}
  >
    <SmallLoadingIndicator />
    <Text style={{ color: gray(0.4), fontSize: 13, marginTop: 10 }}>
      {text}
    </Text>
  </View>
);

const WorkorderCard = ({ workorder, statuses, taxPercent, zActiveSales, onSelect }) => {
  const [sShowItems, _sSetShowItems] = useState(false);
  const rs = resolveStatus(workorder.status, statuses);
  const totals = calculateRunningTotals(workorder, taxPercent, [], false, !!workorder.taxFree);
  const itemCount = workorder.workorderLines?.length || 0;

  return (
    <View
      style={{
        marginBottom: 6,
        borderRadius: 7,
        borderLeftWidth: 4,
        borderLeftColor: rs.backgroundColor || C.buttonLightGreenOutline,
        borderColor: C.buttonLightGreenOutline,
        borderWidth: 1,
        backgroundColor: C.listItemWhite,
      }}
    >
    <TouchableOpacity_
      onPress={() => onSelect(workorder)}
      style={{
        paddingVertical: 6,
        paddingHorizontal: 10,
      }}
    >
      {/* Row 1: Customer name + item count + workorder number + status badge */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 3,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
          <Text numberOfLines={1} style={{ fontSize: 13, color: "dimgray" }}>
            {capitalizeFirstLetterOfString(workorder.customerFirst) +
              " " +
              capitalizeFirstLetterOfString(workorder.customerLast)}
          </Text>
          {itemCount > 0 && (
            <View
              style={{
                backgroundColor: "gray",
                borderRadius: 10,
                paddingHorizontal: 6,
                paddingVertical: 1,
                marginLeft: 6,
              }}
            >
              <Text style={{ color: "white", fontSize: 10, fontWeight: "600" }}>
                {itemCount}
              </Text>
            </View>
          )}
          {!!workorder.workorderNumber && (
            <Text style={{ fontSize: 12, color: C.blue, marginLeft: 6, fontWeight: "500" }}>
              {"#" + formatWorkorderNumber(workorder.workorderNumber)}
            </Text>
          )}
        </View>
        <View
          style={{
            backgroundColor: rs.backgroundColor,
            paddingHorizontal: 10,
            paddingVertical: 2,
            borderRadius: 10,
          }}
        >
          <Text style={{ color: rs.textColor, fontSize: 11, fontWeight: "600" }}>
            {rs.label}
          </Text>
        </View>
      </View>

      {/* Row 2: Brand / description + color badges */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 4,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
          <Text style={{ fontWeight: "500", color: C.text, fontSize: 14 }}>
            {workorder.brand || ""}
          </Text>
          {!!workorder.description && (
            <View
              style={{
                width: 7,
                height: 2,
                marginHorizontal: 5,
                backgroundColor: "lightgray",
              }}
            />
          )}
          <Text numberOfLines={1} style={{ color: C.text, fontSize: 14 }}>
            {workorder.description || ""}
          </Text>
        </View>
        <View style={{ flexDirection: "row", marginLeft: 8 }}>
          {!!workorder.color1?.label && (
            <Text
              style={{
                fontSize: 10,
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 100,
                backgroundColor: workorder.color1.backgroundColor,
                color: workorder.color1.textColor,
              }}
            >
              {workorder.color1.label}
            </Text>
          )}
          {!!workorder.color2?.label && (
            <Text
              style={{
                fontSize: 10,
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 100,
                backgroundColor: workorder.color2.backgroundColor,
                color: workorder.color2.textColor,
                marginLeft: 4,
              }}
            >
              {workorder.color2.label}
            </Text>
          )}
        </View>
      </View>

      {/* Row 3: Date + wait time + total */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text style={{ color: "dimgray", fontSize: 12 }}>
          {formatMillisForDisplay(
            workorder.startedOnMillis,
            new Date(workorder.startedOnMillis).getFullYear() !== new Date().getFullYear()
          )}
        </Text>
        {!!workorder.waitTime?.label && (
          <Text style={{ color: gray(0.4), fontSize: 11, fontStyle: "italic" }}>
            {"est: " + workorder.waitTime.label}
          </Text>
        )}
        {(() => {
          let sale = workorder.activeSaleID ? zActiveSales.find((s) => s.id === workorder.activeSaleID) : null;
          let paid = sale ? (sale.amountCaptured || 0) - (sale.amountRefunded || 0) : 0;
          if (workorder.paymentComplete) {
            return (
              <Text style={{ fontSize: 13, fontWeight: "600", color: C.green }}>
                {"$" + formatCurrencyDisp(totals.finalTotal)}
              </Text>
            );
          }
          if (paid > 0) {
            return (
              <Text style={{ fontSize: 13, fontWeight: "600", color: C.orange }}>
                {"$" + formatCurrencyDisp(paid) + " paid"}
              </Text>
            );
          }
          return (
            <Text style={{ fontSize: 13, fontWeight: "600", color: C.text }}>
              {"$" + formatCurrencyDisp(totals.finalTotal)}
            </Text>
          );
        })()}
      </View>

    </TouchableOpacity_>

      {/* Show/hide items toggle */}
      {itemCount > 0 && (
        <View style={{ paddingHorizontal: 10, paddingBottom: 6 }}>
          <TouchableOpacity_
            onPress={() => _sSetShowItems(!sShowItems)}
            style={{ alignSelf: "flex-start" }}
          >
            <Text style={{ fontSize: 11, color: C.blue }}>
              {sShowItems ? "Hide items" : "Show items"}
            </Text>
          </TouchableOpacity_>
          {sShowItems && (
            <View style={{ marginTop: 4, paddingLeft: 4 }}>
              {workorder.workorderLines.map((line) => (
                <View key={line.id} style={{ flexDirection: "row", alignItems: "center", marginBottom: 2 }}>
                  <Text numberOfLines={1} style={{ fontSize: 12, color: C.text, flex: 1 }}>
                    {line.inventoryItem?.formalName || "Unnamed item"}
                  </Text>
                  <Text style={{ fontSize: 12, color: C.blue, fontWeight: "500", width: 36, textAlign: "right" }}>
                    {line.qty}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const WorkordersList = ({ workorders, onSelect }) => {
  const statuses = useSettingsStore((s) => s.settings?.statuses) || [];
  const taxPercent = useSettingsStore((s) => s.settings?.salesTaxPercent) || 0;
  const zActiveSales = useActiveSalesStore((state) => state.activeSales);

  return (
    <View style={{ flex: 1, width: "100%" }}>
      <FlatList
        data={workorders}
        keyExtractor={(item) => item.id}
        renderItem={(obj) => (
          <WorkorderCard
            workorder={obj.item}
            statuses={statuses}
            taxPercent={taxPercent}
            zActiveSales={zActiveSales}
            onSelect={onSelect}
          />
        )}
      />
    </View>
  );
};

const CreditEditModal = ({ credit, onClose, onSave, onDelete }) => {
  const [sDisplay, _sSetDisplay] = useState("");
  const [sCents, _sSetCents] = useState(0);

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
    // 0 < val < 1 dollar (i.e. < 100 cents but > 0) -> auto-change to $1.00
    if (finalCents > 0 && finalCents < 100) finalCents = 100;
    if (finalCents > credit.amountCents) finalCents = credit.amountCents;
    onSave(credit, finalCents);
  }

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.4)",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 100,
        borderRadius: 15,
      }}
    >
      <TouchableOpacity
        activeOpacity={1}
        onPress={onClose}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <View
        style={{
          width: 320,
          backgroundColor: C.backgroundWhite,
          borderRadius: 12,
          borderWidth: 2,
          borderColor: C.buttonLightGreenOutline,
          padding: 20,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "600", color: C.text, marginBottom: 6 }}>
          Edit Credit
        </Text>
        {!!(credit.text || credit.note) && (
          <Text style={{ fontSize: 12, color: gray(0.5), marginBottom: 12 }}>
            {credit.text || credit.note}
          </Text>
        )}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            borderColor: C.buttonLightGreenOutline,
            borderWidth: 1,
            borderRadius: 7,
            backgroundColor: C.listItemWhite,
            marginBottom: 16,
            paddingHorizontal: 10,
            height: 40,
          }}
        >
          <Text style={{ fontSize: 16, color: gray(0.4), marginRight: 4 }}>$</Text>
          <TextInput_
            placeholder={formatCurrencyDisp(credit.amountCents)}
            placeholderTextColor={gray(0.35)}
            value={sDisplay}
            onChangeText={handleChange}
            debounceMs={0}
            onFocus={() => { _sSetDisplay(""); _sSetCents(0); }}
            style={{
              flex: 1,
              fontSize: 16,
              outlineWidth: 0,
              outlineStyle: "none",
              borderWidth: 0,
              height: 38,
              color: C.text,
            }}
          />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Button_
            text="Delete Credit"
            colorGradientArr={COLOR_GRADIENTS.red}
            textStyle={{ color: C.textWhite, fontSize: 13 }}
            buttonStyle={{ height: 34, borderRadius: 5, paddingHorizontal: 14 }}
            onPress={() => onDelete(credit)}
          />
          <View style={{ flexDirection: "row" }}>
            <Button_
              text="Cancel"
              buttonStyle={{ height: 34, borderRadius: 5, paddingHorizontal: 14, marginRight: 8 }}
              textStyle={{ color: gray(0.5), fontSize: 13 }}
              onPress={onClose}
            />
            <Button_
              text="Save"
              colorGradientArr={COLOR_GRADIENTS.green}
              textStyle={{ color: C.textWhite, fontSize: 13 }}
              buttonStyle={{ height: 34, borderRadius: 5, paddingHorizontal: 20 }}
              onPress={handleConfirm}
            />
          </View>
        </View>
      </View>
    </View>
  );
};

const CustomerMessagesPanel = ({ customerPhone, customerID, customerFirst, customerLast }) => {
  const [sMessages, _sSetMessages] = useState([]);
  const [sNewMessage, _sSetNewMessage] = useState("");
  const [sLoading, _sSetLoading] = useState(true);
  const [sSending, _sSending] = useState(false);
  const flatListRef = useRef(null);
  const unsubRef = useRef(null);

  // Load messages and set up real-time listener
  // (useEffect required: this is a new self-contained component that needs to fetch/subscribe on mount)
  useEffect(() => {
    if (!customerPhone || customerPhone.length !== 10) {
      _sSetMessages([]);
      _sSetLoading(false);
      return;
    }
    let cancelled = false;
    _sSetLoading(true);
    dbGetCustomerMessages(customerPhone, null, 20).then((result) => {
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
    }).catch(() => { _sSetLoading(false); });
    return () => {
      cancelled = true;
      if (unsubRef.current) unsubRef.current();
    };
  }, [customerPhone]);

  // Auto-scroll to bottom when new messages arrive
  // (useEffect required: auto-scroll on messages change)
  useEffect(() => {
    if (sMessages.length > 0 && flatListRef.current) {
      setTimeout(() => {
        try { flatListRef.current.scrollToEnd({ animated: true }); } catch (e) { }
      }, 100);
    }
  }, [sMessages.length]);

  async function handleSend() {
    let text = sNewMessage.trim();
    if (!text || !customerPhone || customerPhone.length !== 10) return;
    _sSetNewMessage("");
    _sSending(true);
    let zCurrentUserObj = useLoginStore.getState().getCurrentUser();
    let msg = { ...SMS_PROTO };
    msg.message = text;
    msg.phoneNumber = customerPhone;
    if (customerFirst) msg.customerFirst = customerFirst;
    if (customerLast) msg.customerLast = customerLast;
    msg.canRespond = true;
    msg.millis = Date.now();
    msg.customerID = customerID || "";
    msg.id = crypto.randomUUID();
    msg.type = "outgoing";
    msg.senderUserObj = zCurrentUserObj;
    msg.sentByUser = zCurrentUserObj.id;
    _sSetMessages((prev) => [...prev, { ...msg, status: "sending" }]);
    let result = await smsService.send(msg);
    _sSending(false);
    if (!result.success) {
      _sSetMessages((prev) =>
        prev.map((m) => m.id === msg.id ? { ...m, status: "failed" } : m)
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
        prev.map((m) => m.id === msg.id ? { ...m, status: "sent" } : m)
      );
    }
  }

  const renderMessage = ({ item }) => {
    let isOutgoing = item.type === "outgoing";
    return (
      <View
        style={{
          alignSelf: isOutgoing ? "flex-end" : "flex-start",
          maxWidth: "80%",
          marginBottom: 6,
          backgroundColor: isOutgoing ? C.blue : C.listItemWhite,
          borderRadius: 10,
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderWidth: isOutgoing ? 0 : 1,
          borderColor: C.buttonLightGreenOutline,
        }}
      >
        <Text style={{ color: isOutgoing ? C.textWhite : C.text, fontSize: 13 }}>
          {item.message}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 3 }}>
          <Text style={{ color: isOutgoing ? "rgba(255,255,255,0.6)" : gray(0.4), fontSize: 10 }}>
            {formatMillisForDisplay(item.millis)}
          </Text>
          {item.status === "sending" && (
            <Text style={{ color: isOutgoing ? "rgba(255,255,255,0.6)" : gray(0.4), fontSize: 10, marginLeft: 6 }}>
              Sending...
            </Text>
          )}
          {item.status === "failed" && (
            <Text style={{ color: C.lightred, fontSize: 10, marginLeft: 6 }}>
              Failed
            </Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <View
      style={{
        width: "35%",
        height: "100%",
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderLeftWidth: 1,
        borderLeftColor: C.buttonLightGreenOutline,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
        <Image_ source={ICONS.cellPhone} style={{ width: 16, height: 16, marginRight: 6 }} />
        <Text style={{ fontSize: 13, fontWeight: "600", color: C.text }}>
          Messages
        </Text>
        <Text style={{ fontSize: 11, color: gray(0.4), marginLeft: 8 }}>
          {formatPhoneWithDashes(customerPhone)}
        </Text>
      </View>
      {sLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <SmallLoadingIndicator />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={sMessages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingVertical: 5 }}
          ListEmptyComponent={
            <Text style={{ color: gray(0.4), fontSize: 12, textAlign: "center", marginTop: 20 }}>
              No messages yet
            </Text>
          }
        />
      )}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginTop: 8,
          borderWidth: 1,
          borderColor: C.buttonLightGreenOutline,
          borderRadius: 8,
          backgroundColor: C.listItemWhite,
          paddingHorizontal: 8,
        }}
      >
        <TextInput
          value={sNewMessage}
          onChangeText={_sSetNewMessage}
          placeholder="Type a message..."
          placeholderTextColor={gray(0.4)}
          onSubmitEditing={handleSend}
          style={{
            flex: 1,
            height: 36,
            fontSize: 13,
            color: C.text,
            outlineWidth: 0,
            outlineStyle: "none",
            borderWidth: 0,
          }}
        />
        <Button_
          text="Send"
          colorGradientArr={COLOR_GRADIENTS.blue}
          textStyle={{ color: C.textWhite, fontSize: 12 }}
          buttonStyle={{ height: 28, paddingHorizontal: 12, borderRadius: 6 }}
          onPress={handleSend}
          enabled={!sSending && !!sNewMessage.trim()}
        />
      </View>
    </View>
  );
};

const SalesList = ({ sales, transactionsMap = {}, onSelect }) => {
  return (
    <View style={{ width: "100%" }}>
      {sales.map((sale) => {
        const txns = transactionsMap[sale.id] || [];
        const totalRefunded = txns.reduce((s, t) => s + (t.refunds || []).reduce((rs, r) => rs + (r.amount || 0), 0), 0);
        const hasRefunds = totalRefunded > 0;

        return (
          <TouchableOpacity_
            key={sale.id}
            onPress={() => onSelect(sale)}
            style={{
              marginBottom: 6,
              borderRadius: 7,
              borderLeftWidth: 4,
              borderLeftColor: sale._isActiveSale
                ? C.orange
                : sale.paymentComplete
                  ? C.green
                  : C.lightred,
              borderColor: C.buttonLightGreenOutline,
              borderWidth: 1,
              backgroundColor: C.listItemWhite,
              paddingVertical: 8,
              paddingHorizontal: 10,
            }}
          >
            {/* Row 1: Date + badges */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 4,
              }}
            >
              <Text style={{ color: "dimgray", fontSize: 12 }}>
                {formatMillisForDisplay(sale.millis)}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                {sale._isActiveSale && (
                  <View
                    style={{
                      backgroundColor: lightenRGBByPercent(C.orange, 65),
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: 10,
                      marginRight: 6,
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: "600", color: C.orange }}>
                      Active
                    </Text>
                  </View>
                )}
                {sale.isDepositSale && (
                  <View
                    style={{
                      backgroundColor: sale.depositType === "credit"
                        ? lightenRGBByPercent(C.blue, 70)
                        : lightenRGBByPercent(C.orange, 70),
                      paddingHorizontal: 6,
                      paddingVertical: 1,
                      borderRadius: 8,
                      marginRight: 6,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: "600",
                        color: sale.depositType === "credit" ? C.blue : C.orange,
                      }}
                    >
                      {sale.depositType === "credit" ? "Credit" : "Deposit"}
                    </Text>
                  </View>
                )}
                <View
                  style={{
                    backgroundColor: sale._isActiveSale
                      ? lightenRGBByPercent(C.orange, 65)
                      : sale.paymentComplete
                        ? lightenRGBByPercent(C.green, 70)
                        : lightenRGBByPercent(C.lightred, 60),
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 10,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "600",
                      color: sale._isActiveSale ? C.orange : sale.paymentComplete ? C.green : C.lightred,
                    }}
                  >
                    {sale._isActiveSale ? "In Progress" : sale.paymentComplete ? "Paid" : "Partial"}
                  </Text>
                </View>
              </View>
            </View>

            {/* Row 2: Totals */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 4,
              }}
            >
              {!sale.isDepositSale && (
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={{ fontSize: 11, color: gray(0.5) }}>{"Sub: "}</Text>
                  <Text style={{ fontSize: 12, color: C.text }}>
                    {"$" + formatCurrencyDisp(sale.subtotal)}
                  </Text>
                  {sale.discount > 0 && (
                    <Text style={{ fontSize: 11, color: C.lightred, marginLeft: 8 }}>
                      {"-$" + formatCurrencyDisp(sale.discount)}
                    </Text>
                  )}
                  <Text style={{ fontSize: 11, color: gray(0.5), marginLeft: 8 }}>{"Tax: "}</Text>
                  <Text style={{ fontSize: 12, color: C.text }}>
                    {"$" + formatCurrencyDisp(sale.salesTax || sale.tax || 0)}
                  </Text>
                </View>
              )}
              <Text style={{ fontSize: 14, fontWeight: "600", color: C.text }}>
                {"$" + formatCurrencyDisp(sale.total)}
              </Text>
            </View>

            {/* Row 3: Payment method(s) */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center" }}>
              {txns.map((p, idx) => (
                <View
                  key={p.id || idx}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: gray(0.04),
                    borderRadius: 5,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    marginRight: 6,
                    marginBottom: 2,
                    borderWidth: 1,
                    borderColor: gray(0.1),
                  }}
                >
                  <Text style={{ fontSize: 11, color: C.text }}>
                    {p.method === "cash"
                      ? "Cash"
                      : p.method === "check"
                        ? "Check"
                        : (p.cardType || "Card") + (p.last4 ? " ..." + p.last4 : "")}
                  </Text>
                  <Text style={{ fontSize: 11, color: gray(0.4), marginLeft: 4 }}>
                    {"$" + formatCurrencyDisp(p.amountCaptured)}
                  </Text>
                </View>
              ))}
              {hasRefunds && (
                <Text style={{ fontSize: 11, color: C.lightred, marginLeft: 4 }}>
                  {"Refunded: $" + formatCurrencyDisp(totalRefunded)}
                </Text>
              )}
            </View>

            {/* Row 4: Linked workorders */}
            {sale.workorderIDs?.length > 0 && (
              <Text style={{ fontSize: 10, color: gray(0.4), marginTop: 4 }}>
                {"WO: " + sale.workorderIDs.join(", ")}
              </Text>
            )}
          </TouchableOpacity_>
        );
      })}
    </View>
  );
};
