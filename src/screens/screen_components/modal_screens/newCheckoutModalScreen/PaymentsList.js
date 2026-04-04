/* eslint-disable */
import { memo } from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native-web";
import { C, Fonts } from "../../../../styles";
import { Tooltip, Pressable_ } from "../../../../components";
import { formatCurrencyDisp, gray } from "../../../../utils";

const PaymentRow = memo(function PaymentRow({ payment, onRefund, onPress }) {
  let isCash = payment.method === "cash";
  let isCheck = payment.method === "check";
  let isCard = !isCash && !isCheck;

  let amountRefunded = (payment.refunds || []).reduce((sum, r) => sum + (r.amount || 0), 0);
  let fullyRefunded = amountRefunded > 0 && payment.amountCaptured <= amountRefunded;

  function getPaymentLabel() {
    if (isCheck) return "CHECK SALE";
    if (isCash) return "CASH SALE";
    return "CARD SALE";
  }

  function getAmountLabel() {
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
        <Text style={{ color: C.green }}>
          {getPaymentLabel()}
        </Text>
        {fullyRefunded && (
          <View style={{ backgroundColor: C.red, borderRadius: 5, paddingVertical: 2, paddingHorizontal: 8 }}>
            <Text style={{ color: C.textWhite, fontSize: 10, fontWeight: "600" }}>Fully Refunded</Text>
          </View>
        )}
        {onRefund && !fullyRefunded && (
          <Tooltip text="Refund this payment" position="top">
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation(); onRefund(); }}
              style={{
                backgroundColor: isCash ? C.green : C.blue,
                borderRadius: 5,
                paddingVertical: 2,
                paddingHorizontal: 8,
              }}
            >
              <Text style={{ color: C.textWhite, fontSize: 10, fontWeight: "600" }}>
                REFUND
              </Text>
            </TouchableOpacity>
          </Tooltip>
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

      {/* Card details */}
      {(isCard && payment.last4) ? (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <Text style={{ color: gray(0.4), fontSize: 13 }}>
            {(payment.cardType || payment.cardIssuer || "").split(" ")[0].toUpperCase() + "  ***" + payment.last4}
          </Text>
          {payment.expMonth && (
            <Text style={{ color: gray(0.4), fontSize: 13 }}>
              {payment.expMonth + "/" + payment.expYear}
            </Text>
          )}
        </View>
      ) : null}

      {/* Previous refunds */}
      {amountRefunded > 0 && (
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
            {formatCurrencyDisp(amountRefunded, true)}
          </Text>
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
          <Text style={{ color: C.text }}>Amount Tendered</Text>
          <Text style={{ color: C.text }}>{formatCurrencyDisp(payment.amountTendered, true)}</Text>
        </View>
      )}
    </View>
  );

  return (
    <Tooltip text="Click to print paper receipt" position="top">
      <Pressable_
        onPress={onPress || undefined}
        activeOpacity={onPress ? 0.6 : 1}
      >
        {content}
      </Pressable_>
    </Tooltip>
  );
});

const CreditRow = memo(function CreditRow({ credit, onPrintDepositReceipt, onRemoveDeposit }) {
  let isGiftCard = credit.type === "giftcard";
  let isCredit = credit.type === "credit";
  let method = credit._method || "cash";
  let paidByCash = method === "cash";
  let paidByCard = method !== "cash";

  function getCreditLabel() {
    if (isCredit) return "ACCOUNT CREDIT";
    if (isGiftCard) return "GIFT CARD";
    if (paidByCard && credit._last4) return "CARD DEPOSIT";
    return "DEPOSIT";
  }

  let labelColor = isGiftCard ? C.orange : (paidByCash ? C.orange : C.blue);

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
      {/* Type label */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text style={{ color: labelColor }}>
          {getCreditLabel()}
        </Text>
      </View>

      {/* Amount line */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ color: C.text }}>Amount applied</Text>
        <Text style={{ color: C.text }}>{formatCurrencyDisp(credit.amount, true)}</Text>
      </View>

      {/* Partial application indicator */}
      {credit._originalAmount && credit.amount < credit._originalAmount && (
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: gray(0.4), fontSize: 11 }}>
            {"of " + formatCurrencyDisp(credit._originalAmount, true) + " total"}
          </Text>
          <Text style={{ color: C.blue, fontSize: 11, fontWeight: "500" }}>PARTIAL</Text>
        </View>
      )}

      {/* Card details for deposits paid by card */}
      {(paidByCard && credit._last4) ? (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <Text style={{ color: gray(0.4), fontSize: 13 }}>
            {"***" + credit._last4}
          </Text>
        </View>
      ) : null}

      {/* Note */}
      {!!credit._note && (
        <Text numberOfLines={2} style={{ color: gray(0.4), fontSize: 13 }}>
          {credit._note}
        </Text>
      )}
    </View>
  );

  let tooltipText = onRemoveDeposit
    ? "- Click to print paper receipt\n- Right-click to adjust or remove deposit"
    : "Click to print paper receipt";

  let handlePress = onPrintDepositReceipt && credit._depositSaleID ? onPrintDepositReceipt : undefined;

  return (
    <Tooltip text={tooltipText} position="top">
      <Pressable_
        onPress={handlePress}
        onRightPress={onRemoveDeposit || undefined}
        activeOpacity={handlePress ? 0.6 : 1}
      >
        {content}
      </Pressable_>
    </Tooltip>
  );
});

export const PaymentsList = memo(function PaymentsList({ payments = [], credits = [], onRefund, onPrintReceipt, onPrintDepositReceipt, onRemoveDeposit }) {
  if ((!payments || payments.length === 0) && (!credits || credits.length === 0)) return null;
  return (
    <View
      style={{
        marginTop: 10,
        alignItems: "center",
        width: "100%",
      }}
    >
      <View style={{ width: "100%" }}>
        {/* Credit rows first */}
        {credits.map((credit, idx) => (
          <CreditRow
            key={credit.id || idx}
            credit={credit}
            onPrintDepositReceipt={onPrintDepositReceipt ? () => onPrintDepositReceipt(credit) : null}
            onRemoveDeposit={onRemoveDeposit ? () => onRemoveDeposit(credit) : null}
          />
        ))}
        {/* Transaction rows, sorted: fully-refunded last */}
        {payments.sort((a, b) => {
          let aRefunded = (a.refunds || []).reduce((s, r) => s + (r.amount || 0), 0);
          let bRefunded = (b.refunds || []).reduce((s, r) => s + (r.amount || 0), 0);
          let aFull = a.amountCaptured <= aRefunded ? 1 : 0;
          let bFull = b.amountCaptured <= bRefunded ? 1 : 0;
          return aFull - bFull;
        }).map((payment, idx) => (
          <PaymentRow
            key={payment.id || idx}
            payment={payment}
            onRefund={onRefund ? () => onRefund(payment) : null}
            onPress={onPrintReceipt ? () => onPrintReceipt(payment) : null}
          />
        ))}
      </View>
    </View>
  );
});
