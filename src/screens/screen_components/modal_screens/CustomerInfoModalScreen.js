/*eslint-disable*/
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TextInput,
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
import { useState } from "react";
import {
  useCurrentCustomerStore,
  useOpenWorkordersStore,
  useSettingsStore,
} from "../../../stores";
import { CONTACT_RESTRICTIONS, CUSTOMER_PROTO } from "../../../data";
import { Button_, CheckBox_, SmallLoadingIndicator } from "../../../components";
import {
  dbSaveCustomer,
  dbGetCompletedWorkorder,
  dbGetCompletedSale,
} from "../../../db_calls_wrapper";

export const CustomerInfoScreenModalComponent = ({
  incomingCustomer = CUSTOMER_PROTO,
  isNewCustomer = false,
  isCurrentCustomer = true,
  button1Text,
  button2Text,
  handleButton1Press,
  handleButton2Press,
  focus,
  setFocus = () => {},
}) => {
  const [sCustomerInfo, _setCustomerInfo] = useState(incomingCustomer);
  const [sWorkorders, _sSetWorkorders] = useState([]);
  const [sSales, _sSetSales] = useState([]);
  const [sWoLoading, _sSetWoLoading] = useState(false);
  const [sSalesLoading, _sSetSalesLoading] = useState(false);
  const [sDetailView, _sSetDetailView] = useState(null);

  async function handleLoadWorkorders() {
    const woIDs = sCustomerInfo.workorders || [];
    if (woIDs.length === 0) {
      _sSetWorkorders([]);
      return;
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
      _sSetWorkorders(results.filter(Boolean));
    } catch (e) {
      console.log("Error loading workorders:", e);
      _sSetWorkorders([]);
    }
    _sSetWoLoading(false);
  }

  async function handleLoadSales() {
    const saleIDs = sCustomerInfo.sales || [];
    if (saleIDs.length === 0) {
      _sSetSales([]);
      return;
    }
    _sSetSalesLoading(true);
    try {
      const results = await Promise.all(
        saleIDs.map(async (id) => {
          try {
            return await dbGetCompletedSale(id);
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

      // Build a map from already-loaded workorders (via LOAD WORKORDERS button)
      const woMap = {};
      sWorkorders.forEach((wo) => { woMap[wo.id] = wo; });

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

      _sSetSales(salesWithWOs);
    } catch (e) {
      console.log("Error loading sales:", e);
      _sSetSales([]);
    }
    _sSetSalesLoading(false);
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

  const TEXT_INPUT_STYLE = {
    width: "100%",
    height: 40,
    borderColor: gray(0.08),
    borderWidth: 1,
    marginTop: 20,
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
                let val;
                if (
                  sCustomerInfo.contactRestriction === CONTACT_RESTRICTIONS.call
                ) {
                  val = "";
                } else {
                  val = CONTACT_RESTRICTIONS.call;
                }
                setCustomerField("contactRestriction", val);
                if (isNewCustomer) return;
                if (isCurrentCustomer) {
                  useCurrentCustomerStore
                    .getState()
                    .setCustomerField("contactRestriction", val);
                  return;
                }
                dbSaveCustomer({ ...sCustomerInfo, contactRestriction: val });
              }}
            />
            <CheckBox_
              text={"Email Only"}
              isChecked={
                sCustomerInfo?.contactRestriction === CONTACT_RESTRICTIONS.email
              }
              onCheck={() => {
                let val;
                if (
                  sCustomerInfo.contactRestriction ===
                  CONTACT_RESTRICTIONS.email
                ) {
                  val = "";
                } else {
                  val = CONTACT_RESTRICTIONS.email;
                }
                setCustomerField("contactRestriction", val);
                if (isNewCustomer) return;
                if (isCurrentCustomer) {
                  useCurrentCustomerStore
                    .getState()
                    .setCustomerField("contactRestriction", val);
                  return;
                }
                dbSaveCustomer({ ...sCustomerInfo, contactRestriction: val });
              }}
            />
          </View>
          <View>
            {!!sCustomerInfo?.cell && (
              <Text style={{ color: gray(0.3), fontSize: 11, marginLeft: 2 }}>
                Cell
              </Text>
            )}
            <TextInput
              onChangeText={(val) => {
                val = removeDashesFromPhone(val);
                if (val.length > 10) return;
                setCustomerField("cell", val);
                if (isNewCustomer) return;
                if (isCurrentCustomer) {
                  useCurrentCustomerStore
                    .getState()
                    .setCustomerField("cell", val, sCustomerInfo.id);
                }
                dbSaveCustomer({ ...sCustomerInfo, cell: val });
              }}
              onFocus={() => setFocus("cell")}
              autoFocus={focus === "cell"}
              placeholderTextColor="darkgray"
              placeholder="Cell phone"
              style={{
                ...TEXT_INPUT_STYLE,
                marginTop: sCustomerInfo.cell ? 1 : TEXT_INPUT_STYLE.marginTop,
              }}
              value={formatPhoneWithDashes(sCustomerInfo.cell)}
              autoComplete="none"
            />
          </View>

          <TextInput
            onChangeText={(val) => {
              val = removeDashesFromPhone(val);
              if (val.length > 10) return;
              setCustomerField("landline", val);
              if (isNewCustomer) return;
              if (isCurrentCustomer) {
                useCurrentCustomerStore
                  .getState()
                  .setCustomerField("landline", val);
                return;
              }
              dbSaveCustomer({
                ...sCustomerInfo,
                landline: val,
              });
            }}
            onFocus={() => setFocus("landline")}
            autoFocus={focus === "landline"}
            placeholderTextColor="darkgray"
            placeholder="Landline"
            style={{ ...TEXT_INPUT_STYLE }}
            value={formatPhoneWithDashes(sCustomerInfo.landline)}
            autoComplete="none"
          />
          <TextInput
            onChangeText={(val) => {
              setCustomerField("first", capitalizeFirstLetterOfString(val));
              if (isNewCustomer) return;
              if (isCurrentCustomer) {
                useCurrentCustomerStore
                  .getState()
                  .setCustomerField(
                    "first",
                    capitalizeFirstLetterOfString(val)
                  );
                return;
              }
              dbSaveCustomer({
                ...sCustomerInfo,
                first: capitalizeFirstLetterOfString(val),
              });
            }}
            onFocus={() => setFocus("first")}
            autoFocus={focus === "first"}
            placeholderTextColor="darkgray"
            placeholder="First name"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.first}
            autoComplete="none"
          />
          <TextInput
            onChangeText={(val) => {
              setCustomerField("last", capitalizeFirstLetterOfString(val));
              if (isNewCustomer) return;
              if (isCurrentCustomer) {
                useCurrentCustomerStore
                  .getState()
                  .setCustomerField("last", capitalizeFirstLetterOfString(val));
                return;
              }
              dbSaveCustomer({
                ...sCustomerInfo,
                last: capitalizeFirstLetterOfString(val),
              });
            }}
            onFocus={() => setFocus("last")}
            autoFocus={focus === "last"}
            placeholderTextColor="darkgray"
            placeholder="Last name"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.last}
            autoComplete="none"
          />
          <TextInput
            onChangeText={(val) => {
              setCustomerField("email", val);
              if (isNewCustomer) return;
              if (isCurrentCustomer) {
                useCurrentCustomerStore
                  .getState()
                  .setCustomerField("email", val);
                return;
              }
              dbSaveCustomer({ ...sCustomerInfo, email: val });
            }}
            onFocus={() => setFocus("email")}
            autoFocus={focus === "email"}
            placeholderTextColor="darkgray"
            placeholder="Email address"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.email}
            autoComplete="none"
          />
          <TextInput
            onChangeText={(val) => {
              setCustomerField("streetAddress", val);
              if (isNewCustomer) return;
              if (isCurrentCustomer) {
                useCurrentCustomerStore
                  .getState()
                  .setCustomerField("streetAddress", val);
                return;
              }
              dbSaveCustomer({ ...sCustomerInfo, streetAddress: val });
            }}
            onFocus={() => setFocus("streetAddress")}
            autoFocus={focus === "streetAddress"}
            placeholderTextColor="darkgray"
            placeholder="Street address"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.streetAddress}
            autoComplete="none"
          />
          <TextInput
            onChangeText={(val) => {
              setCustomerField("unit", val);
              if (isNewCustomer) return;
              if (isCurrentCustomer) {
                useCurrentCustomerStore
                  .getState()
                  .setCustomerField("unit", val);
                return;
              }
              dbSaveCustomer({ ...sCustomerInfo, unit: val });
            }}
            onFocus={() => setFocus("unit")}
            autoFocus={focus === "unit"}
            placeholderTextColor="darkgray"
            placeholder="Unit"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.unit}
            autoComplete="none"
          />
          <TextInput
            onChangeText={(val) => {
              setCustomerField("city", capitalizeFirstLetterOfString(val));
              if (isNewCustomer) return;
              if (isCurrentCustomer) {
                useCurrentCustomerStore
                  .getState()
                  .setCustomerField("city", capitalizeFirstLetterOfString(val));
                return;
              }
              dbSaveCustomer({
                ...sCustomerInfo,
                city: capitalizeFirstLetterOfString(val),
              });
            }}
            onFocus={() => setFocus("city")}
            autoFocus={focus === "city"}
            placeholderTextColor="darkgray"
            placeholder="City"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.city}
            autoComplete="none"
          />
          <TextInput
            onChangeText={(val) => {
              setCustomerField("state", val.toUpperCase());
              if (isNewCustomer) return;
              if (isCurrentCustomer) {
                useCurrentCustomerStore
                  .getState()
                  .setCustomerField("state", val.toUpperCase());
                return;
              }
              dbSaveCustomer({ ...sCustomerInfo, state: val.toUpperCase() });
            }}
            onFocus={() => setFocus("state")}
            autoFocus={focus === "state"}
            placeholderTextColor="darkgray"
            placeholder="State"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.state}
            autoComplete="none"
          />
          <TextInput
            onChangeText={(val) => {
              if (!checkInputForNumbersOnly) return;
              setCustomerField("zip", val);
              if (isCurrentCustomer) {
                if (isNewCustomer) return;
                useCurrentCustomerStore.getState().setCustomerField("zip", val);
                return;
              }
              dbSaveCustomer({ ...sCustomerInfo, zip: val });
            }}
            onFocus={() => setFocus("zip")}
            autoFocus={focus === "zip"}
            placeholderTextColor="darkgray"
            placeholder="Zip code"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.zip}
            autoComplete="none"
          />
          <TextInput
            onChangeText={(val) => {
              setCustomerField("notes", capitalizeFirstLetterOfString(val));
              if (isNewCustomer) return;
              if (isCurrentCustomer) {
                useCurrentCustomerStore
                  .getState()
                  .setCustomerField(
                    "notes",
                    capitalizeFirstLetterOfString(val)
                  );
                return;
              }
              dbSaveCustomer({ ...sCustomerInfo, notes: val });
            }}
            onFocus={() => setFocus("notes")}
            autoFocus={focus === "notes"}
            placeholderTextColor="darkgray"
            placeholder="Address notes"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.notes}
            autoComplete="none"
            numberOfLines={3}
          />

          <View style={{ flexDirection: "column" }}>
            {!!button1Text && (
              <Button_
                onPress={() => handleButton1Press(sCustomerInfo)}
                colorGradientArr={COLOR_GRADIENTS.blue}
                buttonStyle={{
                  marginTop: 30,
                  marginLeft: 20,
                  height: 40,
                  width: 200,
                  borderWidth: 1,
                  borderColor: gray(0.1),
                }}
                icon={ICONS.check}
                iconSize={19}
                textStyle={{ color: C.textWhite }}
                text={button1Text}
              />
            )}
            {!!button2Text && (
              <Button_
                icon={ICONS.close1}
                colorGradientArr={COLOR_GRADIENTS.blue}
                onPress={handleButton2Press}
                buttonStyle={{
                  marginTop: 30,
                  marginLeft: 20,
                  height: 40,
                  width: 200,
                }}
                iconSize={17}
                textStyle={{ marginLeft: 15, color: C.textWhite }}
                text={button2Text}
              />
            )}
          </View>
        </View>
        {!isNewCustomer && !sDetailView && (
          <View
            style={{
              width: 550,
              height: "100%",
              paddingHorizontal: 15,
              paddingVertical: 5,
            }}
          >
            <Button_
              icon={ICONS.workorder}
              iconSize={18}
              textStyle={{ color: gray(0.45), fontSize: 13 }}
              text={"LOAD WORKORDERS"}
              buttonStyle={{ paddingHorizontal: 20, marginBottom: 8 }}
              onPress={handleLoadWorkorders}
            />
            {sWoLoading && <LoadingOverlay text="Loading workorders..." />}
            {!sWoLoading && sWorkorders.length > 0 && (
              <WorkordersList
                workorders={sWorkorders}
                onSelect={(wo) => _sSetDetailView({ type: "workorder", data: wo })}
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
        {!isNewCustomer && !sDetailView && (
          <View
            style={{
              width: 400,
              height: "100%",
              paddingVertical: 5,
            }}
          >
            <Button_
              icon={ICONS.dollarYellow}
              iconSize={20}
              text={"LOAD SALES"}
              textStyle={{ color: gray(0.45), fontSize: 13 }}
              buttonStyle={{ paddingHorizontal: 20, marginBottom: 8 }}
              onPress={handleLoadSales}
            />
            {sSalesLoading && <LoadingOverlay text="Loading sales..." />}
            {!sSalesLoading && sSales.length > 0 && (
              <SalesList
                sales={sSales}
                onSelect={(sale) => _sSetDetailView({ type: "sale", data: sale })}
              />
            )}
            {!sSalesLoading &&
              sSales.length === 0 &&
              (sCustomerInfo.sales || []).length === 0 && (
                <Text style={{ color: gray(0.4), fontSize: 12, marginTop: 10, textAlign: "center" }}>
                  No sales on file
                </Text>
              )}
          </View>
        )}
        {!isNewCustomer && sDetailView && (
          <View style={{ flex: 1, height: "100%", paddingHorizontal: 15, paddingVertical: 5 }}>
            {sDetailView.type === "workorder" && (
              <WorkorderDetailView
                workorder={sDetailView.data}
                sales={sSales}
                onClose={() => _sSetDetailView(null)}
              />
            )}
            {sDetailView.type === "sale" && (
              <SaleDetailView
                sale={sDetailView.data}
                onClose={() => _sSetDetailView(null)}
              />
            )}
          </View>
        )}
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
          const totals = calculateRunningTotals(workorder, taxPercent);
          const itemCount = workorder.workorderLines?.length || 0;

          return (
            <TouchableOpacity
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
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
};

const SalesList = ({ sales, onSelect }) => {
  return (
    <View style={{ flex: 1, width: "100%" }}>
      <FlatList
        data={sales}
        keyExtractor={(item) => item.id}
        renderItem={(obj) => {
          const sale = obj.item;
          const paymentCount = sale.payments?.length || 0;
          const primaryPayment = sale.payments?.[0];
          const isCash = primaryPayment?.cash;
          const hasRefunds = (sale.amountRefunded || 0) > 0;

          return (
            <TouchableOpacity
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
              {/* Row 1: Date + payment complete badge */}
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

              {/* Row 2: Totals */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 4,
                }}
              >
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
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
};

// ─── Helper display components ──────────────────────────────────

const DetailRow = ({ label, value, valueColor }) => {
  if (!value) return null;
  return (
    <View style={{ flexDirection: "row", marginBottom: 6 }}>
      <Text style={{ fontSize: 11, color: gray(0.4), width: 95 }}>{label}</Text>
      <Text style={{ fontSize: 12, color: valueColor || C.text, flex: 1 }}>{value}</Text>
    </View>
  );
};

const TotalRow = ({ label, value, isNegative, bold }) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
    <Text style={{ fontSize: 12, color: gray(0.45), fontWeight: bold ? "600" : "400" }}>
      {label}
    </Text>
    <Text
      style={{
        fontSize: bold ? 14 : 12,
        fontWeight: bold ? "700" : "400",
        color: isNegative ? C.lightred : C.text,
      }}
    >
      {(isNegative ? "-" : "") + "$" + formatCurrencyDisp(Math.abs(value || 0))}
    </Text>
  </View>
);

// ─── Workorder Detail View ──────────────────────────────────────

const WorkorderDetailView = ({ workorder, sales, onClose }) => {
  const statuses = useSettingsStore((s) => s.settings?.statuses) || [];
  const taxPercent = useSettingsStore((s) => s.settings?.salesTaxPercent) || 0;
  const rs = resolveStatus(workorder.status, statuses);
  const totals = calculateRunningTotals(workorder, taxPercent);
  const lines = workorder.workorderLines || [];
  const mediaCount = workorder.media?.length || 0;

  // Find associated sale
  const associatedSale = (sales || []).find(
    (s) =>
      s.id === workorder.activeSaleID ||
      (s.workorderIDs || []).includes(workorder.id)
  );

  return (
    <View style={{ flex: 1, height: "100%" }}>
      {/* Top bar: Close + Refund */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
        <Button_
          text="Close"
          icon={ICONS.close1}
          iconSize={14}
          onPress={onClose}
          buttonStyle={{ paddingHorizontal: 16, height: 32 }}
          textStyle={{ color: gray(0.5), fontSize: 12 }}
        />
        {!!associatedSale && (
          <Button_
            text="Refund"
            colorGradientArr={COLOR_GRADIENTS.red}
            onPress={() => {}}
            buttonStyle={{ paddingHorizontal: 16, height: 32 }}
            textStyle={{ color: C.textWhite, fontSize: 12 }}
          />
        )}
      </View>

      {/* Two columns */}
      <View style={{ flex: 1, flexDirection: "row" }}>
        {/* Left column: bike info + sale summary */}
        <ScrollView style={{ width: 300, paddingRight: 15 }}>
          {/* Status badge */}
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
            <View
              style={{
                backgroundColor: rs.backgroundColor,
                paddingHorizontal: 12,
                paddingVertical: 3,
                borderRadius: 10,
              }}
            >
              <Text style={{ color: rs.textColor, fontSize: 12, fontWeight: "600" }}>
                {rs.label}
              </Text>
            </View>
            {!!workorder.id && (
              <Text style={{ fontSize: 10, color: gray(0.35), marginLeft: 10 }}>
                {"ID: " + workorder.id}
              </Text>
            )}
          </View>

          {/* Customer */}
          <DetailRow
            label="Customer"
            value={
              (capitalizeFirstLetterOfString(workorder.customerFirst || "") +
                " " +
                capitalizeFirstLetterOfString(workorder.customerLast || "")).trim() ||
              null
            }
          />
          {!!workorder.customerPhone && (
            <DetailRow label="Phone" value={formatPhoneWithDashes(workorder.customerPhone)} />
          )}

          {/* Bike info */}
          <DetailRow label="Brand" value={workorder.brand} />
          <DetailRow label="Model" value={workorder.description} />

          {/* Colors */}
          {(!!workorder.color1?.label || !!workorder.color2?.label) && (
            <View style={{ flexDirection: "row", marginBottom: 6, alignItems: "center" }}>
              <Text style={{ fontSize: 11, color: gray(0.4), width: 95 }}>Colors</Text>
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
          )}

          {/* Date, wait time */}
          <DetailRow
            label="Date"
            value={formatMillisForDisplay(
              workorder.startedOnMillis,
              new Date(workorder.startedOnMillis).getFullYear() !== new Date().getFullYear()
            )}
          />
          {!!workorder.waitTime?.label && (
            <DetailRow label="Wait Time" value={workorder.waitTime.label} />
          )}

          {/* Parts */}
          {!!workorder.partOrdered && (
            <DetailRow label="Part Ordered" value={workorder.partOrdered} />
          )}
          {!!workorder.partSource && (
            <DetailRow label="Part Source" value={workorder.partSource} />
          )}

          {/* Media count */}
          {mediaCount > 0 && (
            <DetailRow label="Media" value={mediaCount + " item" + (mediaCount > 1 ? "s" : "")} />
          )}

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: gray(0.1), marginVertical: 12 }} />

          {/* Associated Sale Summary */}
          {associatedSale ? (
            <View>
              <Text style={{ fontSize: 11, fontWeight: "600", color: gray(0.4), marginBottom: 6 }}>
                ASSOCIATED SALE
              </Text>
              <View
                style={{
                  borderRadius: 7,
                  borderWidth: 1,
                  borderColor: C.buttonLightGreenOutline,
                  backgroundColor: C.listItemWhite,
                  padding: 8,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <Text style={{ fontSize: 11, color: "dimgray" }}>
                    {formatMillisForDisplay(associatedSale.millis)}
                  </Text>
                  <View
                    style={{
                      backgroundColor: associatedSale.paymentComplete
                        ? lightenRGBByPercent(C.green, 70)
                        : lightenRGBByPercent(C.lightred, 60),
                      paddingHorizontal: 6,
                      paddingVertical: 1,
                      borderRadius: 8,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 9,
                        fontWeight: "600",
                        color: associatedSale.paymentComplete ? C.green : C.lightred,
                      }}
                    >
                      {associatedSale.paymentComplete ? "Paid" : "Partial"}
                    </Text>
                  </View>
                </View>
                <Text
                  style={{ fontSize: 13, fontWeight: "600", color: C.text, marginBottom: 4 }}
                >
                  {"$" + formatCurrencyDisp(associatedSale.total)}
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  {(associatedSale.payments || []).map((p, idx) => (
                    <Text
                      key={p.id || idx}
                      style={{ fontSize: 10, color: gray(0.4), marginRight: 8 }}
                    >
                      {p.cash
                        ? "Cash"
                        : p.check
                          ? "Check"
                          : (p.cardType || "Card") + (p.last4 ? " ..." + p.last4 : "")}
                      {" $" + formatCurrencyDisp(p.amountCaptured)}
                    </Text>
                  ))}
                </View>
                {(associatedSale.amountRefunded || 0) > 0 && (
                  <Text style={{ fontSize: 10, color: C.lightred, marginTop: 3 }}>
                    {"Refunded: $" + formatCurrencyDisp(associatedSale.amountRefunded)}
                  </Text>
                )}
              </View>
            </View>
          ) : (
            <Text style={{ fontSize: 11, color: gray(0.3), fontStyle: "italic" }}>
              No associated sale
            </Text>
          )}
        </ScrollView>

        {/* Right column: line items + totals */}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 11, fontWeight: "600", color: gray(0.4), marginBottom: 6 }}>
            {"ITEMS (" + lines.length + ")"}
          </Text>
          <FlatList
            data={lines}
            keyExtractor={(item, idx) => item.id || String(idx)}
            style={{ flex: 1 }}
            renderItem={({ item }) => {
              const inv = item.inventoryItem || {};
              const name = inv.formalName || inv.informalName || "Item";
              const price = item.useSalePrice ? (inv.salePrice || inv.price || 0) : (inv.price || 0);
              const hasDiscount = !!item.discountObj?.name;

              return (
                <View
                  style={{
                    marginBottom: 6,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: gray(0.1),
                    backgroundColor: C.listItemWhite,
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                  }}
                >
                  {/* Qty x Name + Price */}
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ fontSize: 13, color: C.text, flex: 1 }} numberOfLines={1}>
                      <Text style={{ fontWeight: "600" }}>{item.qty + "x  "}</Text>
                      {name}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        color: hasDiscount ? C.lightred : C.text,
                        textDecorationLine: hasDiscount ? "line-through" : "none",
                      }}
                    >
                      {"$" + formatCurrencyDisp(price * item.qty)}
                    </Text>
                  </View>

                  {/* Discount info */}
                  {hasDiscount && (
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        marginTop: 2,
                      }}
                    >
                      <Text style={{ fontSize: 10, color: C.lightred }}>
                        {item.discountObj.name}
                      </Text>
                      <Text style={{ fontSize: 12, color: C.green, fontWeight: "500" }}>
                        {"$" + formatCurrencyDisp(item.discountObj.newPrice * item.qty)}
                      </Text>
                    </View>
                  )}

                  {/* Intake notes */}
                  {!!item.intakeNotes && (
                    <Text style={{ fontSize: 11, color: C.orange, marginTop: 3 }}>
                      {"Intake: " + item.intakeNotes}
                    </Text>
                  )}

                  {/* Receipt notes */}
                  {!!item.receiptNotes && (
                    <Text style={{ fontSize: 11, color: C.green, marginTop: 2 }}>
                      {"Receipt: " + item.receiptNotes}
                    </Text>
                  )}
                </View>
              );
            }}
          />

          {/* Totals */}
          <View
            style={{
              marginTop: 8,
              borderTopWidth: 1,
              borderTopColor: gray(0.1),
              paddingTop: 8,
            }}
          >
            <TotalRow label="Subtotal" value={totals.runningSubtotal} />
            {totals.runningDiscount > 0 && (
              <TotalRow label="Discount" value={totals.runningDiscount} isNegative />
            )}
            {!!totals.runningTax && <TotalRow label="Tax" value={totals.runningTax} />}
            <View style={{ height: 1, backgroundColor: gray(0.15), marginVertical: 4 }} />
            <TotalRow label="Total" value={totals.finalTotal} bold />
            {workorder.paymentComplete && (
              <Text style={{ fontSize: 11, color: C.green, fontWeight: "600", marginTop: 4, textAlign: "right" }}>
                {"Paid: $" + formatCurrencyDisp(workorder.amountPaid)}
              </Text>
            )}
          </View>
        </View>
      </View>
    </View>
  );
};

// ─── Sale Detail View ───────────────────────────────────────────

const SaleDetailView = ({ sale, onClose }) => {
  const statuses = useSettingsStore((s) => s.settings?.statuses) || [];
  const payments = sale.payments || [];
  const refunds = sale.refunds || [];
  const linkedWOs = sale._workorders || [];
  const hasRefunds = (sale.amountRefunded || 0) > 0;

  return (
    <View style={{ flex: 1, height: "100%" }}>
      {/* Top bar: Close + Refund */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
        <Button_
          text="Close"
          icon={ICONS.close1}
          iconSize={14}
          onPress={onClose}
          buttonStyle={{ paddingHorizontal: 16, height: 32 }}
          textStyle={{ color: gray(0.5), fontSize: 12 }}
        />
        <Button_
          text="Refund"
          colorGradientArr={COLOR_GRADIENTS.red}
          onPress={() => {}}
          buttonStyle={{ paddingHorizontal: 16, height: 32 }}
          textStyle={{ color: C.textWhite, fontSize: 12 }}
        />
      </View>

      {/* Two columns */}
      <View style={{ flex: 1, flexDirection: "row" }}>
        {/* Left column: totals + amounts */}
        <ScrollView style={{ width: 300, paddingRight: 15 }}>
          {/* Date + status + ID */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <Text style={{ fontSize: 12, color: "dimgray" }}>
              {formatMillisForDisplay(sale.millis, true)}
            </Text>
            <View
              style={{
                backgroundColor: sale.paymentComplete
                  ? lightenRGBByPercent(C.green, 70)
                  : lightenRGBByPercent(C.lightred, 60),
                paddingHorizontal: 10,
                paddingVertical: 3,
                borderRadius: 10,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "600",
                  color: sale.paymentComplete ? C.green : C.lightred,
                }}
              >
                {sale.paymentComplete ? "Paid" : "Partial"}
              </Text>
            </View>
          </View>

          {!!sale.id && (
            <Text style={{ fontSize: 10, color: gray(0.35), marginBottom: 10 }}>
              {"Sale ID: " + sale.id}
            </Text>
          )}

          {/* Totals breakdown */}
          <View
            style={{
              borderRadius: 7,
              borderWidth: 1,
              borderColor: C.buttonLightGreenOutline,
              backgroundColor: C.listItemWhite,
              padding: 10,
              marginBottom: 12,
            }}
          >
            <TotalRow label="Subtotal" value={sale.subtotal} />
            {sale.discount > 0 && <TotalRow label="Discount" value={sale.discount} isNegative />}
            <TotalRow label="Tax" value={sale.tax} />
            {(sale.cardFee || 0) > 0 && <TotalRow label="Card Fee" value={sale.cardFee} />}
            <View style={{ height: 1, backgroundColor: gray(0.15), marginVertical: 6 }} />
            <TotalRow label="Total" value={sale.total} bold />
          </View>

          {/* Amount info */}
          <DetailRow label="Amount Paid" value={"$" + formatCurrencyDisp(sale.amountCaptured)} />
          {!sale.paymentComplete && (
            <DetailRow
              label="Remaining"
              value={"$" + formatCurrencyDisp((sale.total || 0) - (sale.amountCaptured || 0))}
              valueColor={C.lightred}
            />
          )}
          {hasRefunds && (
            <DetailRow
              label="Refunded"
              value={"$" + formatCurrencyDisp(sale.amountRefunded)}
              valueColor={C.lightred}
            />
          )}

          {/* Refund details */}
          {refunds.length > 0 && (
            <View style={{ marginTop: 8 }}>
              <Text
                style={{ fontSize: 11, fontWeight: "600", color: gray(0.4), marginBottom: 4 }}
              >
                REFUND HISTORY
              </Text>
              {refunds.map((r, idx) => (
                <View
                  key={r.id || idx}
                  style={{
                    marginBottom: 4,
                    borderRadius: 5,
                    borderWidth: 1,
                    borderColor: gray(0.1),
                    backgroundColor: C.listItemWhite,
                    padding: 6,
                  }}
                >
                  <Text style={{ fontSize: 11, color: C.lightred }}>
                    {"-$" + formatCurrencyDisp(r.amount)}
                  </Text>
                  {!!r.notes && (
                    <Text style={{ fontSize: 10, color: gray(0.4), marginTop: 2 }}>
                      {r.notes}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        {/* Right column: payments + linked workorders */}
        <ScrollView style={{ flex: 1 }}>
          {/* Payments */}
          <Text style={{ fontSize: 11, fontWeight: "600", color: gray(0.4), marginBottom: 6 }}>
            {"PAYMENTS (" + payments.length + ")"}
          </Text>
          {payments.map((p, idx) => (
            <View
              key={p.id || idx}
              style={{
                marginBottom: 6,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: gray(0.1),
                backgroundColor: C.listItemWhite,
                paddingVertical: 8,
                paddingHorizontal: 10,
              }}
            >
              {/* Type + Amount */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: C.text }}>
                  {p.cash ? "CASH" : p.check ? "CHECK" : "CARD"}
                </Text>
                <Text style={{ fontSize: 14, fontWeight: "600", color: C.text }}>
                  {"$" + formatCurrencyDisp(p.amountCaptured)}
                </Text>
              </View>

              {/* Card details */}
              {!p.cash && !p.check && (
                <View style={{ marginTop: 4 }}>
                  {(!!p.cardType || !!p.last4) && (
                    <Text style={{ fontSize: 11, color: gray(0.4) }}>
                      {(p.cardType || "Card") + (p.last4 ? "  ..." + p.last4 : "")}
                      {p.expMonth && p.expYear
                        ? "  Exp " + p.expMonth + "/" + p.expYear
                        : ""}
                    </Text>
                  )}
                  {!!p.authorizationCode && (
                    <Text style={{ fontSize: 10, color: gray(0.35) }}>
                      {"Auth: " + p.authorizationCode}
                    </Text>
                  )}
                  {!!p.chargeID && (
                    <Text style={{ fontSize: 10, color: gray(0.35) }}>
                      {"Charge: " + p.chargeID}
                    </Text>
                  )}
                </View>
              )}

              {/* Cash tendered */}
              {p.cash && !!p.amountTendered && (
                <Text style={{ fontSize: 11, color: gray(0.4), marginTop: 2 }}>
                  {"Tendered: $" + formatCurrencyDisp(p.amountTendered)}
                </Text>
              )}

              {/* Refund on this payment */}
              {(p.amountRefunded || 0) > 0 && (
                <Text style={{ fontSize: 11, color: C.lightred, marginTop: 2 }}>
                  {"Refunded: $" + formatCurrencyDisp(p.amountRefunded)}
                </Text>
              )}
            </View>
          ))}

          {/* Linked workorders */}
          {linkedWOs.length > 0 && (
            <View style={{ marginTop: 10 }}>
              <Text
                style={{ fontSize: 11, fontWeight: "600", color: gray(0.4), marginBottom: 6 }}
              >
                {"LINKED WORKORDERS (" + linkedWOs.length + ")"}
              </Text>
              {linkedWOs.map((wo) => {
                const woRs = resolveStatus(wo.status, statuses);
                return (
                  <View
                    key={wo.id}
                    style={{
                      marginBottom: 4,
                      borderRadius: 6,
                      borderWidth: 1,
                      borderLeftWidth: 3,
                      borderLeftColor: woRs.backgroundColor || gray(0.2),
                      borderColor: gray(0.1),
                      backgroundColor: C.listItemWhite,
                      paddingVertical: 5,
                      paddingHorizontal: 8,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ fontSize: 12, color: C.text, flex: 1 }} numberOfLines={1}>
                        {(wo.brand || "") + (wo.description ? " — " + wo.description : "")}
                      </Text>
                      <View
                        style={{
                          backgroundColor: woRs.backgroundColor,
                          paddingHorizontal: 8,
                          paddingVertical: 1,
                          borderRadius: 8,
                          marginLeft: 6,
                        }}
                      >
                        <Text style={{ color: woRs.textColor, fontSize: 9, fontWeight: "600" }}>
                          {woRs.label}
                        </Text>
                      </View>
                    </View>
                    {!!wo.customerFirst && (
                      <Text style={{ fontSize: 10, color: gray(0.4), marginTop: 2 }}>
                        {capitalizeFirstLetterOfString(wo.customerFirst) +
                          " " +
                          capitalizeFirstLetterOfString(wo.customerLast || "")}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
};
