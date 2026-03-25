/* eslint-disable */
import { View, Text, Animated } from "react-native-web";
import { useRef } from "react";
import { C, Fonts } from "../../../../styles";
import { formatCurrencyDisp, gray } from "../../../../utils";

function TotalRow({ label, value, labelStyle, valueStyle }) {
  let displayValue =
    typeof value === "number" ? formatCurrencyDisp(value) : value;

  return (
    <View
      style={{
        alignItems: "center",
        flexDirection: "row",
        justifyContent: "space-between",
        width: "100%",
      }}
    >
      <Text
        style={{
          fontSize: 13,
          color: gray(0.5),
          ...labelStyle,
        }}
      >
        {label}
      </Text>
      <View style={{ flexDirection: "row" }}>
        <Text
          style={{
            fontSize: 13,
            color: C.green,
            marginRight: 10,
          }}
        >
          $
        </Text>
        <Text
          style={{
            fontSize: 17,
            color: gray(0.5),
            ...valueStyle,
          }}
        >
          {displayValue}
        </Text>
      </View>
    </View>
  );
}

function Divider() {
  return (
    <View
      style={{
        width: "100%",
        height: 1,
        marginVertical: 10,
        backgroundColor: C.buttonLightGreenOutline,
      }}
    />
  );
}

export function SaleTotals({
  sale,
  cashChangeNeeded,
  settings,
}) {
  const successScale = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;
  const successPulse = useRef(new Animated.Value(1)).current;
  const successAnimStarted = useRef(false);

  if (!sale) return null;

  if (sale.paymentComplete && !successAnimStarted.current) {
    successAnimStarted.current = true;
    Animated.parallel([
      Animated.spring(successScale, { toValue: 1, friction: 4, tension: 80, useNativeDriver: false }),
      Animated.timing(successOpacity, { toValue: 1, duration: 300, useNativeDriver: false }),
    ]).start(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(successPulse, { toValue: 1.06, duration: 800, useNativeDriver: false }),
          Animated.timing(successPulse, { toValue: 1, duration: 800, useNativeDriver: false }),
        ])
      ).start();
    });
  }

  let hasDiscount = (sale.discount || 0) > 0;
  let hasCardFee = (sale.cardFee || 0) > 0;
  let amountRemaining = (sale.total || 0) - (sale.amountCaptured || 0);
  if (amountRemaining < 0) amountRemaining = 0;

  return (
    <View style={{ marginTop: 5 }}>
      {/* Totals Box */}
      <View
        style={{
          backgroundColor: C.listItemWhite,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: C.buttonLightGreenOutline,
          paddingHorizontal: 10,
          paddingVertical: 7,
        }}
      >
        {/* Subtotal */}
        <TotalRow label="SUBTOTAL" value={sale.subtotal || 0} />

        {/* Discount */}
        {hasDiscount && <Divider />}
        {hasDiscount && (
          <TotalRow
            label="DISCOUNT"
            labelStyle={{ marginLeft: 15 }}
            value={`- ${formatCurrencyDisp(sale.discount)}`}
          />
        )}

        {/* Discounted Total */}
        {hasDiscount && (
          <TotalRow
            label="DISCOUNTED TOTAL"
            labelStyle={{ marginLeft: 15 }}
            value={(sale.subtotal || 0) - (sale.discount || 0)}
          />
        )}
        {hasDiscount && <Divider />}

        {/* Sales Tax */}
        <TotalRow
          label="SALES TAX"
          value={sale.tax || 0}
        />

        {/* Card Fee */}
        {hasCardFee && (
          <TotalRow
            label={`CARD FEE (${sale.cardFeePercent || 0}%)`}
            value={sale.cardFee}
          />
        )}

        <Divider />

        {/* Total Sale */}
        <TotalRow
          label="TOTAL SALE"
          value={sale.total || 0}
          labelStyle={{ fontSize: 16 }}
          valueStyle={{ fontWeight: 500, fontSize: 18, color: gray(0.6) }}
        />
      </View>

      {/* Status Info (outside the box, right-aligned) */}
      <View
        style={{
          width: "100%",
          alignItems: "flex-end",
          marginTop: 15,
        }}
      >
        {/* Amount Paid */}
        {sale.amountCaptured > 0 && !sale.paymentComplete && (
          <Text
            style={{
              fontSize: 18,
              fontWeight: 500,
              color: gray(0.6),
            }}
          >
            {"AMOUNT PAID:   $" + formatCurrencyDisp(sale.amountCaptured)}
          </Text>
        )}

        {/* Amount Remaining */}
        {amountRemaining > 0 && (
          <Text
            style={{
              fontSize: 18,
              fontWeight: 500,
              color: gray(0.6),
            }}
          >
            {"AMOUNT LEFT TO PAY:   $" + formatCurrencyDisp(amountRemaining)}
          </Text>
        )}

        {/* Sale Complete */}
        {sale.paymentComplete && (
          <Animated.View
            style={{
              backgroundColor: C.green,
              borderRadius: 10,
              paddingVertical: 8,
              paddingHorizontal: 20,
              opacity: successOpacity,
              transform: [{ scale: Animated.multiply(successScale, successPulse) }],
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: "700",
                color: C.textWhite,
                textAlign: "center",
              }}
            >
              PAYMENT COMPLETE
            </Text>
          </Animated.View>
        )}
      </View>

      {/* Cash Change */}
      {cashChangeNeeded > 0 && (
        <View
          style={{
            borderColor: C.buttonLightGreenOutline,
            borderRadius: 10,
            borderWidth: 2,
            backgroundColor: C.listItemWhite,
            paddingVertical: 10,
            paddingHorizontal: 10,
            flexDirection: "column",
            marginTop: 10,
            width: "60%",
            alignSelf: "center",
          }}
        >
          <Text
            style={{
              fontSize: 11,
              color: gray(0.3),
              width: "100%",
              textAlign: "left",
              paddingBottom: 3,
            }}
          >
            CHANGE
          </Text>
          <Text
            style={{
              textAlign: "right",
              fontSize: 25,
              color: C.green,
            }}
          >
            <Text
              style={{
                fontSize: 15,
                paddingRight: 7,
              }}
            >
              $
            </Text>
            {formatCurrencyDisp(cashChangeNeeded)}
          </Text>
        </View>
      )}
    </View>
  );
}
