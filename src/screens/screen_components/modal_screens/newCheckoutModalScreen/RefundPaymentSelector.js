/* eslint-disable */
import { View, Text, ScrollView } from "react-native-web";
import { TouchableOpacity } from "react-native";
import { C, Fonts } from "../../../../styles";
import { formatCurrencyDisp, gray } from "../../../../utils";
import dayjs from "dayjs";

function PaymentSelectRow({ payment, isSelected, onSelect, isDisabled }) {
  let isCash = payment.cash;
  let isCheck = payment.check;
  let isDeposit = payment.isDeposit;
  let typeLabel = isDeposit
    ? (payment.depositType === "credit" ? "CREDIT" : "DEPOSIT")
    : isCheck ? "CHECK" : isCash ? "CASH" : "CARD";
  let available = payment.amountCaptured - (payment.amountRefunded || 0);
  let fullyRefunded = available <= 0;

  return (
    <TouchableOpacity
      onPress={() => {
        if (!isDisabled && !fullyRefunded) onSelect(payment);
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
        opacity: fullyRefunded || isDisabled ? 0.4 : 1,
      }}
    >
      {/* Selection indicator */}
      <View
        style={{
          width: 16,
          height: 16,
          borderRadius: 3,
          borderWidth: 2,
          borderColor: isSelected ? C.blue : gray(0.2),
          backgroundColor: isSelected ? C.blue : "transparent",
          marginRight: 10,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {isSelected && (
          <Text style={{ color: "white", fontSize: 11, fontWeight: "700", marginTop: -1 }}>
            ✓
          </Text>
        )}
      </View>

      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View
            style={{
              backgroundColor: isDeposit ? C.purple : (isCash || isCheck ? C.green : C.blue),
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
        {!isCash && !isCheck && !isDeposit && payment.last4 && (
          <Text style={{ fontSize: 11, color: C.lightText, marginTop: 2 }}>
            {payment.cardIssuer} ****{payment.last4} {payment.expMonth}/{payment.expYear}
          </Text>
        )}

        {/* Deposit details */}
        {isDeposit && !!payment.depositNote && (
          <Text numberOfLines={1} style={{ fontSize: 11, color: C.lightText, marginTop: 2 }}>
            {payment.depositNote}
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

        {!!payment.millis && (
          <Text
            style={{
              fontSize: 10,
              color: C.lightText,
              fontStyle: "italic",
              marginTop: 2,
            }}
          >
            {(() => {
              let d = dayjs(payment.millis);
              let day = d.date();
              let suffix = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
              let fmt = d.year() === dayjs().year() ? "ddd, MMM " : "ddd, MMM ";
              return d.format(fmt) + day + suffix + (d.year() !== dayjs().year() ? ", " + d.year() : "");
            })()}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

export function RefundPaymentSelector({
  payments = [],
  selectedPayments = [],
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
        Select payments to refund
      </Text>

      <ScrollView style={{ maxHeight: 200 }}>
        {payments.map((payment, idx) => {
          let isSelected = selectedPayments.some((p) => p.id === payment.id);
          let paymentIsCash = payment.cash || payment.check || payment.isDeposit;

          // Disable logic
          let rowDisabled = disabled;
          if (!rowDisabled && selectedPayments.length > 0 && !isSelected) {
            let selIsCash = selectedPayments[0].cash || selectedPayments[0].check || selectedPayments[0].isDeposit;
            if (paymentIsCash !== selIsCash) {
              // Different type than current selection
              rowDisabled = true;
            } else if (!paymentIsCash) {
              // Card: only one card at a time
              rowDisabled = true;
            }
          }

          return (
            <PaymentSelectRow
              key={payment.id || idx}
              payment={payment}
              isSelected={isSelected}
              onSelect={onSelectPayment}
              isDisabled={rowDisabled}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}
