/* eslint-disable */
import { View, Text, ScrollView, TouchableOpacity } from "react-native-web";
import { C, Fonts } from "../../../../styles";
import { formatCurrencyDisp, gray } from "../../../../utils";

function PaymentRow({ payment, onRefund }) {
  let isCash = payment.cash;
  let isCheck = payment.check;

  return (
    <View
      style={{
        padding: 5,
        backgroundColor: C.listItemWhite,
        width: "100%",
        borderRadius: 8,
        marginBottom: 5,
      }}
    >
      {/* Type label + Refund button */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text style={{ color: C.green }}>
          {isCheck ? "CHECK SALE" : isCash ? "CASH SALE" : "CARD SALE"}
        </Text>
        {onRefund && (
          <TouchableOpacity
            onPress={onRefund}
            style={{
              backgroundColor: C.red,
              borderRadius: 5,
              paddingVertical: 2,
              paddingHorizontal: 8,
            }}
          >
            <Text style={{ color: C.textWhite, fontSize: 10, fontWeight: "600" }}>
              REFUND
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Amount received */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ color: C.text }}>Amount received</Text>
        <Text>{formatCurrencyDisp(payment.amountCaptured, true)}</Text>
      </View>

      {/* Previous refunds */}
      {!!payment.amountRefunded && (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <Text style={{ color: C.red, fontSize: 13 }}>
            Previous Refund amount
          </Text>
          <Text style={{ color: C.red, fontSize: 13 }}>
            {formatCurrencyDisp(payment.amountRefunded, true)}
          </Text>
        </View>
      )}

      {/* Card details */}
      {!isCash && !isCheck && payment.last4 && (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <Text style={{ color: gray(0.4), fontSize: 13 }}>
            {(payment.cardType || payment.cardIssuer || "").split(" ")[0]}
          </Text>
          <Text style={{ color: gray(0.4), fontSize: 13 }}>
            {"***" + payment.last4}
          </Text>
          {payment.expMonth && (
            <Text style={{ color: gray(0.4), fontSize: 13 }}>
              {payment.expMonth + "/" + payment.expYear}
            </Text>
          )}
        </View>
      )}

      {/* Cash tender */}
      {!!isCash && (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <Text>Amount Tendered </Text>
          <Text>{formatCurrencyDisp(payment.amountTendered, true)}</Text>
        </View>
      )}
    </View>
  );
}

export function PaymentsList({ payments = [], onRefund }) {
  if (!payments || payments.length === 0) return null;

  return (
    <View
      style={{
        marginTop: 15,
        alignItems: "center",
        width: "100%",
      }}
    >
      <Text style={{ color: C.green }}>PAYMENTS</Text>
      <View style={{ width: "100%" }}>
        {payments.map((payment, idx) => (
          <PaymentRow
            key={payment.id || idx}
            payment={payment}
            onRefund={onRefund ? () => onRefund() : null}
          />
        ))}
      </View>
    </View>
  );
}
