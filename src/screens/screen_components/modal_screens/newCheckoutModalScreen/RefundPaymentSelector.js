/* eslint-disable */
import { View, Text, ScrollView } from "react-native-web";
import { TouchableOpacity } from "react-native";
import { C, Fonts } from "../../../../styles";
import { formatCurrencyDisp, gray } from "../../../../utils";

function PaymentSelectRow({ payment, isSelected, onSelect, isDisabled }) {
  let isCash = payment.cash;
  let isCheck = payment.check;
  let typeLabel = isCheck ? "CHECK" : isCash ? "CASH" : "CARD";
  let available = payment.amountCaptured - (payment.amountRefunded || 0);
  let fullyRefunded = available <= 0;

  return (
    <TouchableOpacity
      onPress={() => {
        if (!isDisabled && !fullyRefunded && !isCash && !isCheck) onSelect(payment);
      }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 8,
        paddingHorizontal: 8,
        borderBottomWidth: 1,
        borderBottomColor: gray(0.05),
        backgroundColor: isSelected
          ? "rgb(230, 240, 252)"
          : fullyRefunded
          ? gray(0.04)
          : "transparent",
        borderRadius: 4,
        opacity: fullyRefunded ? 0.5 : 1,
      }}
    >
      {/* Selection indicator */}
      <View
        style={{
          width: 16,
          height: 16,
          borderRadius: 8,
          borderWidth: 2,
          borderColor: isSelected ? C.blue : gray(0.2),
          marginRight: 10,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {isSelected && (
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: C.blue,
            }}
          />
        )}
      </View>

      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View
            style={{
              backgroundColor: isCash || isCheck ? C.green : C.blue,
              borderRadius: 3,
              paddingHorizontal: 5,
              paddingVertical: 1,
            }}
          >
            <Text
              style={{
                fontSize: 9,
                fontWeight: Fonts.weight.textHeavy,
                color: "white",
              }}
            >
              {typeLabel}
            </Text>
          </View>
          <Text
            style={{
              fontSize: 13,
              fontWeight: Fonts.weight.textHeavy,
              color: C.text,
            }}
          >
            {formatCurrencyDisp(payment.amountCaptured)}
          </Text>
        </View>

        {/* Card details */}
        {!isCash && !isCheck && payment.last4 && (
          <Text style={{ fontSize: 11, color: C.lightText, marginTop: 2 }}>
            {payment.cardIssuer} ****{payment.last4} {payment.expMonth}/{payment.expYear}
          </Text>
        )}

        {/* Refund history */}
        {payment.amountRefunded > 0 && (
          <Text style={{ fontSize: 10, color: C.lightred, marginTop: 2 }}>
            Previously refunded: {formatCurrencyDisp(payment.amountRefunded)}
          </Text>
        )}

        {/* Available to refund */}
        {!fullyRefunded && !isCash && !isCheck && (
          <Text style={{ fontSize: 10, color: C.green, marginTop: 1 }}>
            Available: {formatCurrencyDisp(available)}
          </Text>
        )}

        {fullyRefunded && (
          <Text
            style={{
              fontSize: 10,
              color: C.lightred,
              fontStyle: "italic",
              marginTop: 2,
            }}
          >
            Fully refunded
          </Text>
        )}

        {(isCash || isCheck) && !fullyRefunded && (
          <Text
            style={{
              fontSize: 10,
              color: C.lightText,
              fontStyle: "italic",
              marginTop: 2,
            }}
          >
            Cash/check — use cash refund
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

export function RefundPaymentSelector({
  payments = [],
  selectedPayment,
  onSelectPayment,
  disabled = false,
}) {
  return (
    <View style={{ padding: 10 }}>
      <Text
        style={{
          fontSize: 13,
          fontWeight: Fonts.weight.textHeavy,
          color: C.text,
          marginBottom: 6,
          borderBottomWidth: 1,
          borderBottomColor: gray(0.1),
          paddingBottom: 4,
        }}
      >
        ORIGINAL PAYMENTS
      </Text>
      <Text
        style={{
          fontSize: 10,
          color: C.lightText,
          fontStyle: "italic",
          marginBottom: 6,
        }}
      >
        Select a card payment to refund against
      </Text>

      <ScrollView style={{ maxHeight: 200 }}>
        {payments.map((payment, idx) => (
          <PaymentSelectRow
            key={payment.id || idx}
            payment={payment}
            isSelected={selectedPayment?.id === payment.id}
            onSelect={onSelectPayment}
            isDisabled={disabled}
          />
        ))}
      </ScrollView>
    </View>
  );
}
