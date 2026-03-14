/* eslint-disable */
import { View, Text, ScrollView } from "react-native-web";
import { C, Fonts } from "../../../../styles";
import { formatCurrencyDisp, gray } from "../../../../utils";

function PaymentRow({ payment }) {
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
      {/* Type label */}
      <Text style={{ color: C.green }}>
        {isCheck ? "CHECK SALE" : isCash ? "CASH SALE" : "CARD SALE"}
      </Text>

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

export function PaymentsList({ payments = [] }) {
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
      <View style={{ maxHeight: "40%", width: "100%" }}>
        <ScrollView contentContainerStyle={{ alignItems: "center" }}>
          {payments.map((payment, idx) => (
            <PaymentRow key={payment.id || idx} payment={payment} />
          ))}
        </ScrollView>
      </View>
    </View>
  );
}
