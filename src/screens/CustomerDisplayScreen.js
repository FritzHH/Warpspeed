/* eslint-disable */
import { View, Text, ScrollView, Image } from "react-native-web";
import { useState, useEffect } from "react";
import {
  onDisplayMessage,
  DISPLAY_MSG_TYPES,
  onTranslateMessage,
  TRANSLATE_MSG_TYPES,
} from "../broadcastChannel";
import { formatCurrencyDisp, gray } from "../utils";
import { C, Fonts } from "../styles";

const logo = require("../resources/bblogo_trans_high.png");

////////////////////////////////////////////////////////////////////////////////
// Shared sub-components
////////////////////////////////////////////////////////////////////////////////

function DisplayTotalRow({ label, value, labelStyle, valueStyle }) {
  let displayValue =
    typeof value === "number" ? formatCurrencyDisp(value) : value;

  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
        paddingVertical: 4,
      }}
    >
      <Text style={{ fontSize: 20, color: gray(0.5), ...labelStyle }}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "baseline" }}>
        <Text style={{ fontSize: 18, color: C.green, marginRight: 6 }}>$</Text>
        <Text style={{ fontSize: 22, color: gray(0.4), ...valueStyle }}>
          {displayValue}
        </Text>
      </View>
    </View>
  );
}

function DisplayDivider() {
  return (
    <View
      style={{
        width: "100%",
        height: 1,
        marginVertical: 8,
        backgroundColor: C.buttonLightGreenOutline,
      }}
    />
  );
}

function LineItemRow({ item, index }) {
  let name = item.inventoryItem?.formalName || "Item";
  let qty = item.qty || 1;
  let unitPrice = item.inventoryItem?.price || 0;
  let hasDiscount = item.discountObj && item.discountObj.savings > 0;
  let lineTotal = hasDiscount
    ? (item.discountObj.newPrice || 0) * qty
    : unitPrice * qty;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: C.buttonLightGreenOutline,
      }}
    >
      <Text
        style={{
          fontSize: 18,
          color: gray(0.5),
          width: 30,
          textAlign: "center",
        }}
      >
        {index + 1}
      </Text>
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={{ fontSize: 20, color: C.text }}>{name}</Text>
        {qty > 1 && (
          <Text style={{ fontSize: 15, color: gray(0.5), marginTop: 2 }}>
            Qty: {qty} x ${formatCurrencyDisp(unitPrice)}
          </Text>
        )}
        {hasDiscount && (
          <Text style={{ fontSize: 15, color: C.green, marginTop: 2 }}>
            Discount: {item.discountObj.name}
          </Text>
        )}
      </View>
      <View style={{ flexDirection: "row", alignItems: "baseline" }}>
        <Text style={{ fontSize: 16, color: C.green, marginRight: 4 }}>$</Text>
        <Text style={{ fontSize: 20, color: C.text }}>
          {formatCurrencyDisp(lineTotal)}
        </Text>
      </View>
    </View>
  );
}

////////////////////////////////////////////////////////////////////////////////
// Idle screen
////////////////////////////////////////////////////////////////////////////////

function IdleScreen() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: C.backgroundWhite,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Image
        source={logo}
        style={{ width: 200, height: 200, resizeMode: "contain" }}
      />
      <Text
        style={{
          fontSize: 32,
          color: gray(0.4),
          marginTop: 30,
          fontWeight: "300",
        }}
      >
        Welcome
      </Text>
    </View>
  );
}

////////////////////////////////////////////////////////////////////////////////
// Workorder display
////////////////////////////////////////////////////////////////////////////////

function WorkorderDisplay({ data }) {
  let lines = data.workorderLines || [];
  let totals = data.totals || {};

  return (
    <View style={{ flex: 1, backgroundColor: C.backgroundWhite }}>
      {/* Header */}
      <View
        style={{
          paddingVertical: 20,
          paddingHorizontal: 30,
          borderBottomWidth: 2,
          borderBottomColor: C.buttonLightGreenOutline,
          backgroundColor: C.listItemWhite,
        }}
      >
        <Text style={{ fontSize: 28, color: C.text, fontWeight: "600" }}>
          {[data.customerFirst, data.customerLast].filter(Boolean).join(" ") ||
            "Workorder"}
        </Text>
        {(data.brand || data.model) && (
          <Text style={{ fontSize: 20, color: gray(0.5), marginTop: 4 }}>
            {[data.brand, data.model].filter(Boolean).join(" ")}
          </Text>
        )}
        {data.description && (
          <Text style={{ fontSize: 16, color: gray(0.6), marginTop: 2 }}>
            {data.description}
          </Text>
        )}
      </View>

      {/* Line items */}
      <ScrollView style={{ flex: 1 }}>
        {lines.map((line, i) => (
          <LineItemRow key={line.id || i} item={line} index={i} />
        ))}
        {lines.length === 0 && (
          <View
            style={{ alignItems: "center", justifyContent: "center", flex: 1, paddingTop: 60 }}
          >
            <Text style={{ fontSize: 20, color: gray(0.6) }}>
              No items yet
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Totals */}
      {lines.length > 0 && (
        <View
          style={{
            borderTopWidth: 2,
            borderTopColor: C.buttonLightGreenOutline,
            backgroundColor: C.listItemWhite,
            paddingHorizontal: 30,
            paddingVertical: 16,
          }}
        >
          <DisplayTotalRow
            label="SUBTOTAL"
            value={totals.runningSubtotal || 0}
          />
          {(totals.runningDiscount || 0) > 0 && (
            <DisplayTotalRow
              label="DISCOUNT"
              value={`- ${formatCurrencyDisp(totals.runningDiscount)}`}
            />
          )}
          <DisplayDivider />
          <DisplayTotalRow
            label="TOTAL"
            value={totals.runningTotal || 0}
            labelStyle={{ fontSize: 24, fontWeight: "600" }}
            valueStyle={{ fontSize: 28, fontWeight: "600" }}
          />
        </View>
      )}
    </View>
  );
}

////////////////////////////////////////////////////////////////////////////////
// Sale display
////////////////////////////////////////////////////////////////////////////////

function SaleDisplay({ data }) {
  let sale = data.sale || {};
  let allLines = [];

  // Collect lines from combined workorders
  (data.combinedWorkorders || []).forEach((wo) => {
    (wo.workorderLines || []).forEach((line) => {
      allLines.push(line);
    });
  });

  // Collect added items
  (data.addedItems || []).forEach((item) => {
    allLines.push(item);
  });

  let hasDiscount = (sale.discount || 0) > 0;
  let hasCardFee = (sale.cardFee || 0) > 0;
  let amountRemaining = (sale.total || 0) - (sale.amountCaptured || 0);
  if (amountRemaining < 0) amountRemaining = 0;

  return (
    <View style={{ flex: 1, backgroundColor: C.backgroundWhite }}>
      {/* Header */}
      <View
        style={{
          paddingVertical: 20,
          paddingHorizontal: 30,
          borderBottomWidth: 2,
          borderBottomColor: C.buttonLightGreenOutline,
          backgroundColor: C.listItemWhite,
        }}
      >
        <Text style={{ fontSize: 28, color: C.text, fontWeight: "600" }}>
          {[data.customerFirst, data.customerLast].filter(Boolean).join(" ") ||
            "Checkout"}
        </Text>
      </View>

      {/* Line items */}
      <ScrollView style={{ flex: 1 }}>
        {allLines.map((line, i) => (
          <LineItemRow key={line.id || i} item={line} index={i} />
        ))}
        {allLines.length === 0 && (
          <View
            style={{ alignItems: "center", justifyContent: "center", flex: 1, paddingTop: 60 }}
          >
            <Text style={{ fontSize: 20, color: gray(0.6) }}>
              No items yet
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Totals */}
      <View
        style={{
          borderTopWidth: 2,
          borderTopColor: C.buttonLightGreenOutline,
          backgroundColor: C.listItemWhite,
          paddingHorizontal: 30,
          paddingVertical: 16,
        }}
      >
        <DisplayTotalRow label="SUBTOTAL" value={sale.subtotal || 0} />

        {hasDiscount && <DisplayDivider />}
        {hasDiscount && (
          <DisplayTotalRow
            label="DISCOUNT"
            value={`- ${formatCurrencyDisp(sale.discount)}`}
          />
        )}

        <DisplayTotalRow label="SALES TAX" value={sale.tax || 0} />

        {hasCardFee && (
          <DisplayTotalRow
            label={`CARD FEE (${sale.cardFeePercent || 0}%)`}
            value={sale.cardFee}
          />
        )}

        <DisplayDivider />
        <DisplayTotalRow
          label="TOTAL"
          value={sale.total || 0}
          labelStyle={{ fontSize: 24, fontWeight: "600" }}
          valueStyle={{ fontSize: 28, fontWeight: "600" }}
        />

        {/* Payment status */}
        {sale.amountCaptured > 0 && !sale.paymentComplete && (
          <View style={{ marginTop: 12, alignItems: "flex-end" }}>
            <Text style={{ fontSize: 20, fontWeight: "500", color: gray(0.5) }}>
              AMOUNT PAID: ${formatCurrencyDisp(sale.amountCaptured)}
            </Text>
            <Text
              style={{ fontSize: 20, fontWeight: "500", color: gray(0.5), marginTop: 4 }}
            >
              REMAINING: ${formatCurrencyDisp(amountRemaining)}
            </Text>
          </View>
        )}

        {sale.paymentComplete && (
          <View
            style={{
              marginTop: 16,
              alignItems: "center",
              backgroundColor: C.green,
              borderRadius: 10,
              paddingVertical: 14,
            }}
          >
            <Text style={{ fontSize: 28, fontWeight: "600", color: "white" }}>
              PAID
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

////////////////////////////////////////////////////////////////////////////////
// Main display screen
////////////////////////////////////////////////////////////////////////////////

function TranslateDisplay({ text }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: C.backgroundWhite,
        justifyContent: "center",
        alignItems: "center",
        padding: 40,
      }}
    >
      <Text
        style={{
          fontSize: 48,
          color: C.text,
          fontWeight: Fonts.weight.textHeavy,
          textAlign: "center",
          lineHeight: 64,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

export function CustomerDisplayScreen() {
  const [sDisplayData, _setDisplayData] = useState(null);
  const [sType, _setType] = useState(null);
  const [sTranslateText, _setTranslateText] = useState("");

  useEffect(() => {
    const unsubDisplay = onDisplayMessage((msg) => {
      if (msg.type === DISPLAY_MSG_TYPES.CLEAR) {
        _setDisplayData(null);
        _setType(null);
      } else {
        _setDisplayData(msg.payload);
        _setType(msg.type);
      }
    });
    const unsubTranslate = onTranslateMessage((msg) => {
      if (msg.type === TRANSLATE_MSG_TYPES.CLEAR) {
        _setTranslateText("");
      } else if (msg.type === TRANSLATE_MSG_TYPES.TRANSLATE) {
        _setTranslateText(msg.payload.translatedText || "");
      }
    });
    return () => {
      unsubDisplay();
      unsubTranslate();
    };
  }, []);

  // Translation takes priority over regular display
  if (sTranslateText) {
    return <TranslateDisplay text={sTranslateText} />;
  }

  if (!sDisplayData || !sType) {
    return <IdleScreen />;
  }

  if (sType === DISPLAY_MSG_TYPES.WORKORDER) {
    return <WorkorderDisplay data={sDisplayData} />;
  }

  if (sType === DISPLAY_MSG_TYPES.SALE) {
    return <SaleDisplay data={sDisplayData} />;
  }

  return <IdleScreen />;
}
