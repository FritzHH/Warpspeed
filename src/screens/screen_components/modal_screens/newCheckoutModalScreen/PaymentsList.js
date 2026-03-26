/* eslint-disable */
import { View, Text, ScrollView, TouchableOpacity } from "react-native-web";
import { C, Fonts } from "../../../../styles";
import { Tooltip } from "../../../../components";
import { formatCurrencyDisp, gray } from "../../../../utils";

function PaymentRow({ payment, onRefund, onPress, onPrintDepositReceipt, onRemoveDeposit }) {
  let isCash = payment.cash;
  let isCheck = payment.check;
  let isDeposit = payment.isDeposit;
  let isCard = !isCash && !isCheck && !isDeposit;
  let depositPaidByCash = isDeposit && payment.depositCash;
  let depositPaidByCard = isDeposit && !payment.depositCash;

  function getPaymentLabel() {
    if (isDeposit) {
      let typeLabel = payment.depositType === "credit" ? "CREDIT" : "DEPOSIT";
      if (depositPaidByCash) return "CASH " + typeLabel;
      if (payment.last4) return "CARD " + typeLabel;
      return typeLabel + " APPLIED";
    }
    if (isCheck) return "CHECK SALE";
    if (isCash) return "CASH SALE";
    return "CARD SALE";
  }

  function getAmountLabel() {
    if (isDeposit) return "Amount applied";
    if (isCheck) return "Check received";
    if (isCash) return "Cash received";
    return "Card payment received";
  }

  let content = (
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
        <Text style={{ color: isDeposit ? C.blue : C.green }}>
          {getPaymentLabel()}
        </Text>
        {onRefund && (
          <TouchableOpacity
            onPress={(e) => { e.stopPropagation(); onRefund(); }}
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

      {/* Amount line */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ color: C.text }}>{getAmountLabel()}</Text>
        <Text style={{ color: C.text }}>{formatCurrencyDisp(payment.amountCaptured, true)}</Text>
      </View>

      {/* Card details — for card payments and deposit-applied payments that were paid by card */}
      {((isCard || depositPaidByCard) && payment.last4) ? (
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
      ) : null}

      {/* Deposit note */}
      {!!isDeposit && !!payment.depositNote && (
        <Text numberOfLines={2} style={{ color: gray(0.4), fontSize: 13 }}>
          {payment.depositNote}
        </Text>
      )}

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

      {/* Cash tender */}
      {!!isCash && !isDeposit && (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <Text style={{ color: C.text }}>Amount Tendered</Text>
          <Text style={{ color: C.text }}>{formatCurrencyDisp(payment.amountTendered, true)}</Text>
        </View>
      )}
    </View>
  );

  // Build tooltip text
  let tooltipText = "Click to print paper receipt";
  if (isDeposit && onRemoveDeposit) {
    tooltipText += "\nRight-click to remove deposit from sale";
  }

  let handlePress = isDeposit
    ? (onPrintDepositReceipt && payment.depositSaleID ? onPrintDepositReceipt : undefined)
    : onPress || undefined;

  return (
    <Tooltip text={tooltipText} position="top">
      <TouchableOpacity
        onPress={handlePress}
        onContextMenu={isDeposit && onRemoveDeposit ? (e) => { e.preventDefault(); onRemoveDeposit(); } : undefined}
        activeOpacity={handlePress ? 0.6 : 1}
      >
        {content}
      </TouchableOpacity>
    </Tooltip>
  );
}

export function PaymentsList({ payments = [], onRefund, onPrintReceipt, onPrintDepositReceipt, onRemoveDeposit }) {
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
            onRefund={onRefund ? () => onRefund(payment) : null}
            onPress={onPrintReceipt ? () => onPrintReceipt(payment) : null}
            onPrintDepositReceipt={onPrintDepositReceipt ? () => onPrintDepositReceipt(payment) : null}
            onRemoveDeposit={onRemoveDeposit ? () => onRemoveDeposit(payment) : null}
          />
        ))}
      </View>
    </View>
  );
}
