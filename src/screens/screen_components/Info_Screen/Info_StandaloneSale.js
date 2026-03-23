/* eslint-disable */
import { FlatList, View, Text, TextInput } from "react-native-web";
import { TAB_NAMES, RECEIPT_TYPES } from "../../../data";
import {
  useOpenWorkordersStore,
  useTabNamesStore,
  useCurrentCustomerStore,
} from "../../../stores";

import {
  Button,
  CheckBox_,
  ScreenModal,
  SHADOW_RADIUS_PROTO,
  Button_,
  SmallLoadingIndicator,
  Tooltip,
} from "../../../components";
import {
  calculateRunningTotals,
  generateUPCBarcode,
  gray,
  log,
  printBuilder,
  showAlert,
  trimToTwoDecimals,
} from "../../../utils";
import { useRef, useState } from "react";
import { C, COLOR_GRADIENTS, Colors, Fonts, ICONS } from "../../../styles";
import {
  dbSavePrintObj,
  dbGetCompletedWorkorder,
  dbGetCompletedSale,
  dbGetCustomer,
} from "../../../db_calls_wrapper";
import { newCheckoutGetActiveSale } from "../modal_screens/newCheckoutModalScreen/newCheckoutFirebaseCalls";

export const StandaloneSaleComponent = ({}) => {
  // store getters
  const [sScanValue, _setScanValue] = useState("");
  const [sSearching, _setSearching] = useState(false);
  const [sResult, _setResult] = useState(null);
  const [sError, _setError] = useState("");
  const scanInputRef = useRef(null);

  //////////////////////////////////////////////////////////////////////

  async function handleScan(value) {
    let digits = value.replace(/\D/g, "");
    if (digits.length < 12) return;
    digits = digits.substring(0, 12);
    _setScanValue(digits);
    _setSearching(true);
    _setError("");
    _setResult(null);

    try {
      let prefix = digits[0];

      if (prefix === "1") {
        // Workorder — check local store first, then completed
        let wo = useOpenWorkordersStore.getState().workorders.find(
          (o) => o.id === digits
        );
        if (!wo) wo = await dbGetCompletedWorkorder(digits);
        if (wo) {
          _setResult({ type: "workorder", data: wo });
        } else {
          _setError("No workorder found for this ticket.");
        }
      } else if (prefix === "2") {
        // Sale — derive sale ID, check active then completed
        let saleID = "s" + digits.substring(1);
        let sale = await newCheckoutGetActiveSale(saleID);
        if (!sale) sale = await dbGetCompletedSale(saleID);
        if (sale) {
          _setResult({ type: "sale", data: sale });
        } else {
          _setError("No sale found for this ticket.");
        }
      } else {
        _setError("Unrecognized ticket prefix.");
      }
    } catch (e) {
      log("Scan search error:", e);
      _setError("Error searching. Try again.");
    }

    _setSearching(false);
  }

  function handleSelectWorkorder(wo) {
    if (wo.customerID) {
      dbGetCustomer(wo.customerID).then((customer) => {
        if (customer) useCurrentCustomerStore.getState().setCustomer(customer);
      });
    }
    useOpenWorkordersStore.getState().setOpenWorkorderID(wo.id);
    useTabNamesStore.getState().setItems({
      infoTabName: TAB_NAMES.infoTab.workorder,
      itemsTabName: TAB_NAMES.itemsTab.workorderItems,
      optionsTabName: TAB_NAMES.optionsTab.inventory,
    });
  }

  return (
    <View
      style={{
        width: "100%",
        height: "100%",
        alignItems: "center",
      }}
    >
      {/* Scan input */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          width: "100%",
          paddingHorizontal: 15,
          paddingTop: 10,
        }}
      >
        <TextInput
          ref={scanInputRef}
          value={sScanValue}
          onChangeText={(val) => {
            _setScanValue(val);
            _setError("");
            _setResult(null);
            let digits = val.replace(/\D/g, "");
            if (digits.length >= 12) handleScan(val);
          }}
          placeholder="Scan ticket here..."
          placeholderTextColor="lightgray"
          style={{
            flex: 1,
            borderColor: C.buttonLightGreenOutline,
            borderWidth: 2,
            borderRadius: 10,
            backgroundColor: C.listItemWhite,
            paddingVertical: 10,
            paddingHorizontal: 10,
            fontSize: 16,
            outlineWidth: 0,
          }}
        />
        {sSearching && (
          <View style={{ marginLeft: 10 }}>
            <SmallLoadingIndicator />
          </View>
        )}
      </View>

      {/* Error message */}
      {sError ? (
        <Text style={{ color: C.red, marginTop: 10, fontSize: 14 }}>
          {sError}
        </Text>
      ) : null}

      {/* Result display */}
      {sResult ? (
        <View
          style={{
            marginTop: 10,
            width: "100%",
            paddingHorizontal: 15,
          }}
        >
          {sResult.type === "workorder" && (
            <Button_
              text={
                "Open Workorder — " +
                (sResult.data.customerFirst || "") +
                " " +
                (sResult.data.customerLast || "") +
                " (#" +
                (sResult.data.workorderNumber || "") +
                ")"
              }
              onPress={() => handleSelectWorkorder(sResult.data)}
              colorGradientArr={COLOR_GRADIENTS.green}
              buttonStyle={{
                paddingVertical: 10,
                paddingHorizontal: 15,
                borderRadius: 8,
              }}
              textStyle={{ fontSize: 14, color: "white", fontWeight: "600" }}
            />
          )}
          {sResult.type === "sale" && (
            <View
              style={{
                backgroundColor: C.listItemWhite,
                borderColor: C.buttonLightGreenOutline,
                borderWidth: 2,
                borderRadius: 10,
                padding: 12,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "600", color: C.text }}>
                {"Sale: " + sResult.data.id}
              </Text>
              <Text style={{ fontSize: 13, color: C.lightText, marginTop: 4 }}>
                {"Total: $" +
                  ((sResult.data.total || 0) / 100).toFixed(2) +
                  "  |  Status: " +
                  (sResult.data.status || (sResult.data.paymentComplete ? "completed" : "unknown"))}
              </Text>
            </View>
          )}
        </View>
      ) : null}

      {/* Existing content */}
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          width: "100%",
          alignItems: "center",
        }}
      >
        <Text style={{ fontSize: 72, color: gray(0.08) }}>{"SALE"}</Text>
      </View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          width: "100%",
          height: "15%",
          alignItems: "center",
        }}
      >
        <Tooltip text="Back to Customer" position="top">
          <Button_
            onPress={() => {
              useTabNamesStore.getState().setItems({
                infoTabName: TAB_NAMES.infoTab.customer,
                itemsTabName: TAB_NAMES.itemsTab.empty,
                optionsTabName: TAB_NAMES.optionsTab.workorders,
              });
            }}
            icon={ICONS.bicycle}
            iconSize={55}
            buttonStyle={{ marginBottom: 0, paddingLeft: 15 }}
          />
        </Tooltip>
        <Tooltip text="Pop register" position="top">
          <Button_
            icon={ICONS.cashRegister}
            iconSize={40}
            onPress={() =>
              dbSavePrintObj(
                { id: generateUPCBarcode(), receiptType: RECEIPT_TYPES.register },
                "8C:77:3B:60:33:22_Star MCP31"
              )
            }
          />
        </Tooltip>
        <Tooltip text="Test Print" position="top">
          <Button_
            icon={ICONS.receipt}
            iconSize={40}
            onPress={() =>
              dbSavePrintObj(printBuilder.test(), "8C:77:3B:60:33:22_Star MCP31")
            }
          />
        </Tooltip>
      </View>
    </View>
  );
};
