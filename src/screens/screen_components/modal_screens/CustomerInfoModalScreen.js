/*eslint-disable*/
import {
  View,
  Text,
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
  gray,
  lightenRGBByPercent,
  removeDashesFromPhone,
  resolveStatus,
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
} from "../../../stores";
import { CONTACT_RESTRICTIONS, CUSTOMER_LANGUAGES, CUSTOMER_PROTO, TAB_NAMES } from "../../../data";
import { Button_, CheckBox_, DepositModal, DepositsList, DropdownMenu, SmallLoadingIndicator, TextInput_, TouchableOpacity_ } from "../../../components";
import {
  dbSaveCustomer,
  dbGetCustomer,
  dbGetCompletedWorkorder,
  dbGetCompletedSale,
} from "../../../db_calls_wrapper";
import { newCheckoutGetActiveSale } from "./newCheckoutModalScreen/newCheckoutFirebaseCalls";
import { ClosedWorkorderModal } from "./ClosedWorkorderModal";

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
  const [sWoLoading, _sSetWoLoading] = useState(false);
  const [sSalesLoading, _sSetSalesLoading] = useState(false);
  const [sShowDepositModal, _sSetShowDepositModal] = useState(false);
  const [sClosedWorkorder, _sSetClosedWorkorder] = useState(null);
  const mountedRef = useRef(true);

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
    _sSetWoLoading(true);
    try {
      const openWOs = useOpenWorkordersStore.getState().getWorkorders() || [];
      const results = await Promise.all(
        woIDs.map(async (id) => {
          try {
            const local = openWOs.find((wo) => wo.id === id);
            if (local) return local;
            return await dbGetCompletedWorkorder(id);
          } catch (e) {
            return null;
          }
        })
      );
      let loaded = results.filter(Boolean);
      if (mountedRef.current) _sSetWorkorders(loaded);
      return loaded;
    } catch (e) {
      console.log("Error loading workorders:", e);
      if (mountedRef.current) _sSetWorkorders([]);
      return [];
    } finally {
      if (mountedRef.current) _sSetWoLoading(false);
    }
  }

  async function loadSales(customer, loadedWorkorders) {
    const saleIDs = (customer || sCustomerInfo).sales || [];
    if (saleIDs.length === 0) {
      _sSetSales([]);
      return;
    }
    _sSetSalesLoading(true);
    try {
      const results = await Promise.all(
        saleIDs.map(async (id) => {
          try {
            let sale = await dbGetCompletedSale(id);
            if (!sale) sale = await newCheckoutGetActiveSale(id);
            return sale;
          } catch (e) {
            return null;
          }
        })
      );
      const fetchedSales = results.filter(Boolean);

      // Collect all unique workorder IDs referenced by these sales
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
      const salesWithWOs = fetchedSales.map((sale) => ({
        ...sale,
        _workorders: (sale.workorderIDs || [])
          .map((id) => woMap[id])
          .filter(Boolean),
      }));

      if (mountedRef.current) _sSetSales(salesWithWOs);
    } catch (e) {
      console.log("Error loading sales:", e);
      if (mountedRef.current) _sSetSales([]);
    }
    if (mountedRef.current) _sSetSalesLoading(false);
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
        <View style={{ width: 250, padding: 10 }}>
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
              <Text style={{ color: gray(0.3), fontSize: 11, marginLeft: 2 }}>
                Cell
              </Text>
            )}
            <TextInput_
              onChangeText={(val) => {
                val = removeDashesFromPhone(val);
                if (val.length > 10) return;
                saveField("customerCell", val);
              }}
              placeholder="Cell phone"
              style={{
                ...TEXT_INPUT_STYLE,
                marginTop: sCustomerInfo.customerCell ? 1 : TEXT_INPUT_STYLE.marginTop,
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
                colorGradientArr={COLOR_GRADIENTS.blue}
                buttonStyle={{
                  marginTop: 20,
                  marginLeft: 20,
                  height: 40,
                  width: 200,
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
                  marginLeft: 20,
                  height: 36,
                  width: 200,
                }}
                iconSize={16}
                textStyle={{ color: C.textWhite, fontSize: 13 }}
                text={"Add Deposit / Credit"}
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
                marginLeft: 20,
                marginBottom: 10,
                height: 40,
                width: 200,
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
              width: 550,
              height: "100%",
              paddingHorizontal: 15,
              paddingVertical: 5,
            }}
          >
            <Button_
              icon={sWoLoading ? null : ICONS.workorder}
              iconSize={18}
              textStyle={{ color: gray(0.45), fontSize: 13 }}
              text={sWoLoading ? "" : "REFRESH WORKORDERS"}
              TextComponent={sWoLoading ? SmallLoadingIndicator : undefined}
              buttonStyle={{ paddingHorizontal: 20, marginBottom: 8 }}
              onPress={() => loadWorkorders()}
              enabled={!sWoLoading}
            />
            {sWoLoading && <LoadingOverlay text="Loading workorders..." />}
            {!sWoLoading && sWorkorders.length > 0 && (
              <WorkordersList
                workorders={sWorkorders}
                onSelect={(wo) => {
                  // TESTING: open closed workorder viewer for all cards
                  // PRODUCTION: only open for cards without paymentComplete
                  _sSetClosedWorkorder(wo);
                }}
              />
            )}
            {!sWoLoading &&
              sWorkorders.length === 0 &&
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
              width: 550,
              height: "100%",
              paddingHorizontal: 15,
              paddingVertical: 5,
            }}
          >
            <Button_
              icon={sSalesLoading ? null : ICONS.dollarYellow}
              iconSize={20}
              text={sSalesLoading ? "" : "REFRESH SALES"}
              TextComponent={sSalesLoading ? SmallLoadingIndicator : undefined}
              textStyle={{ color: gray(0.45), fontSize: 13 }}
              buttonStyle={{ paddingHorizontal: 20, marginBottom: 8 }}
              onPress={() => loadSales()}
              enabled={!sSalesLoading}
            />
            {sSalesLoading && <LoadingOverlay text="Loading sales..." />}
            {!sSalesLoading && sSales.length > 0 && (
              <ScrollView style={{ flexShrink: 1 }}>
                <SalesList
                  sales={sSales}
                  onSelect={(sale) => useOpenWorkordersStore.getState().setSaleModalObj(sale)}
                />
              </ScrollView>
            )}
            {!sSalesLoading &&
              sSales.length === 0 &&
              (sCustomerInfo.sales || []).length === 0 && (
                <Text style={{ color: gray(0.4), fontSize: 12, marginTop: 10, textAlign: "center" }}>
                  No sales on file
                </Text>
              )}
            {/* Deposits section — directly below sales, pushes down until bottom */}
            <DepositsList
              deposits={sCustomerInfo.deposits || []}
              onPress={async (deposit) => {
                if (!deposit.saleID) return;
                let sale = await dbGetCompletedSale(deposit.saleID);
                if (sale) useOpenWorkordersStore.getState().setSaleModalObj(sale);
              }}
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
        />
        <ClosedWorkorderModal
          workorder={sClosedWorkorder}
          onClose={() => _sSetClosedWorkorder(null)}
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

const WorkordersList = ({ workorders, onSelect }) => {
  const statuses = useSettingsStore((s) => s.settings?.statuses) || [];
  const taxPercent = useSettingsStore((s) => s.settings?.salesTaxPercent) || 0;

  return (
    <View style={{ flex: 1, width: "100%" }}>
      <FlatList
        data={workorders}
        keyExtractor={(item) => item.id}
        renderItem={(obj) => {
          const workorder = obj.item;
          const rs = resolveStatus(workorder.status, statuses);
          const totals = calculateRunningTotals(workorder, taxPercent, [], false, !!workorder.taxFree);
          const itemCount = workorder.workorderLines?.length || 0;

          return (
            <TouchableOpacity_
              onPress={() => onSelect(workorder)}
              style={{
                marginBottom: 6,
                borderRadius: 7,
                borderLeftWidth: 4,
                borderLeftColor: rs.backgroundColor || C.buttonLightGreenOutline,
                borderColor: C.buttonLightGreenOutline,
                borderWidth: 1,
                backgroundColor: C.listItemWhite,
                paddingVertical: 6,
                paddingHorizontal: 10,
              }}
            >
              {/* Row 1: Customer name + status badge */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 3,
                }}
              >
                <Text numberOfLines={1} style={{ fontSize: 13, color: "dimgray" }}>
                  {capitalizeFirstLetterOfString(workorder.customerFirst) +
                    " " +
                    capitalizeFirstLetterOfString(workorder.customerLast)}
                </Text>
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

              {/* Row 2: Brand / description + color badges + item count */}
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
                  {itemCount > 0 && (
                    <View
                      style={{
                        backgroundColor: "gray",
                        borderRadius: 10,
                        paddingHorizontal: 6,
                        paddingVertical: 1,
                        marginLeft: 8,
                      }}
                    >
                      <Text style={{ color: "white", fontSize: 10, fontWeight: "600" }}>
                        {itemCount}
                      </Text>
                    </View>
                  )}
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
                {workorder.paymentComplete ? (
                  <Text style={{ fontSize: 13, fontWeight: "600", color: C.green }}>
                    {"$" + formatCurrencyDisp(workorder.amountPaid)}
                  </Text>
                ) : (
                  <Text style={{ fontSize: 13, fontWeight: "600", color: C.text }}>
                    {"$" + formatCurrencyDisp(totals.finalTotal)}
                  </Text>
                )}
              </View>
            </TouchableOpacity_>
          );
        }}
      />
    </View>
  );
};

const SalesList = ({ sales, onSelect }) => {
  return (
    <View style={{ width: "100%" }}>
      {sales.map((sale) => {
        const hasRefunds = (sale.amountRefunded || 0) > 0;

        return (
          <TouchableOpacity_
            key={sale.id}
            onPress={() => onSelect(sale)}
            style={{
              marginBottom: 6,
              borderRadius: 7,
              borderLeftWidth: 4,
              borderLeftColor: sale.paymentComplete
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
                    backgroundColor: sale.paymentComplete
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
                      color: sale.paymentComplete ? C.green : C.lightred,
                    }}
                  >
                    {sale.paymentComplete ? "Paid" : "Partial"}
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
                    {"$" + formatCurrencyDisp(sale.tax)}
                  </Text>
                </View>
              )}
              <Text style={{ fontSize: 14, fontWeight: "600", color: C.text }}>
                {"$" + formatCurrencyDisp(sale.total)}
              </Text>
            </View>

            {/* Row 3: Payment method(s) */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center" }}>
              {(sale.payments || []).map((p, idx) => (
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
                    {p.cash
                      ? "Cash"
                      : p.check
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
                  {"Refunded: $" + formatCurrencyDisp(sale.amountRefunded)}
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
