/* eslint-disable */
import { memo } from "react";
import { View, Text, ScrollView } from "react-native-web";
import { TouchableOpacity } from "react-native";
import { C, Fonts } from "../../../../styles";
import { formatCurrencyDisp, gray } from "../../../../utils";
import dayjs from "dayjs";
import { dlog, DCAT } from "./checkoutDebugLog";

function formatTransactionDate(millis) {
  let d = dayjs(millis);
  let day = d.date();
  let suffix = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  let fmt = d.year() === dayjs().year() ? "ddd, MMM " : "ddd, MMM ";
  return d.format(fmt) + day + suffix + (d.year() !== dayjs().year() ? ", " + d.year() : "");
}

const CreditSelectRow = memo(function CreditSelectRow({ credit, isSelected, onSelect, isDisabled }) {
  let amountRefunded = (credit.refunds || []).reduce((s, r) => s + (r.amount || 0), 0);
  let available = credit.amount - amountRefunded;
  let fullyRefunded = available <= 0;

  return (
    <TouchableOpacity
      onPress={() => {
        if (!isDisabled && !fullyRefunded) {
          dlog(DCAT.BUTTON, "selectCredit", "RefundPaymentSelector", { creditId: credit.id, amount: credit.amount });
          onSelect(credit);
        }
      }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 8,
        paddingHorizontal: 8,
        borderBottomWidth: 1,
        borderBottomColor: gray(0.05),
        backgroundColor: isSelected ? "rgb(237, 232, 252)" : fullyRefunded ? gray(0.04) : "transparent",
        borderRadius: 4,
        opacity: fullyRefunded || isDisabled ? 0.4 : 1,
      }}
    >
      <View
        style={{
          width: 16,
          height: 16,
          borderRadius: 3,
          borderWidth: 2,
          borderColor: isSelected ? "rgb(103, 124, 231)" : gray(0.2),
          backgroundColor: isSelected ? "rgb(103, 124, 231)" : "transparent",
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
              backgroundColor: "rgb(103, 124, 231)",
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
              CREDIT
            </Text>
          </View>
          <Text
            style={{
              fontSize: 13,
              fontWeight: Fonts.weight.textHeavy,
              color: C.text,
            }}
          >
            {formatCurrencyDisp(credit.amount)}
          </Text>
        </View>

        {credit._note && (
          <Text style={{ fontSize: 11, color: C.lightText, marginTop: 2 }}>
            {credit._note}
          </Text>
        )}

        {amountRefunded > 0 && !fullyRefunded && (
          <Text style={{ fontSize: 10, color: C.lightred, marginTop: 2 }}>
            Previously refunded: {formatCurrencyDisp(amountRefunded)}
          </Text>
        )}

        {!fullyRefunded && (
          <Text style={{ fontSize: 10, color: C.green, marginTop: 1 }}>
            Available: {formatCurrencyDisp(available)}
          </Text>
        )}

        {fullyRefunded && (
          <Text style={{ fontSize: 10, color: C.lightred, fontStyle: "italic", marginTop: 2 }}>
            Fully refunded
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
});

const PaymentSelectRow = memo(function PaymentSelectRow({ payment, isSelected, onSelect, isDisabled }) {
  let isCash = payment.method === "cash";
  let isCheck = payment.method === "check";
  let isLightspeedCard = !isCash && !isCheck && payment._importSource === "lightspeed";
  let typeLabel = isCheck ? "CHECK" : isCash ? "CASH" : "CARD";
  let amountRefunded = (payment.refunds || []).reduce((s, r) => s + (r.amount || 0), 0);
  let available = payment.amountCaptured - amountRefunded;
  let fullyRefunded = available <= 0;

  return (
    <TouchableOpacity
      onPress={() => {
        if (!isDisabled && !fullyRefunded) {
          dlog(DCAT.BUTTON, "selectPayment", "RefundPaymentSelector", { paymentId: payment.id, method: payment.method });
          onSelect(payment);
        }
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
          : isLightspeedCard
          ? "rgb(255, 248, 230)"
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

        {/* Lightspeed import indicator */}
        {isLightspeedCard && (
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 3, backgroundColor: "rgb(255, 237, 180)", borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2, alignSelf: "flex-start" }}>
            <Text style={{ fontSize: 9, fontWeight: Fonts.weight.textHeavy, color: "rgb(140, 100, 0)" }}>
              LIGHTSPEED - CASH REFUND ONLY
            </Text>
          </View>
        )}

        {/* Refund history */}
        {amountRefunded > 0 && (
          <Text style={{ fontSize: 10, color: C.lightred, marginTop: 2 }}>
            Previously refunded: {formatCurrencyDisp(amountRefunded)}
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
            {formatTransactionDate(payment.millis)}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
});

export const RefundPaymentSelector = memo(function RefundPaymentSelector({
  payments = [],
  selectedPayments = [],
  onSelectPayment,
  creditsApplied = [],
  selectedCredits = [],
  onSelectCredit,
  disabled = false,
}) {
  let hasCreditsSelected = selectedCredits.length > 0;
  let hasPaymentsSelected = selectedPayments.length > 0;
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

      <ScrollView>
        {payments.map((payment, idx) => {
          let isSelected = selectedPayments.some((p) => p.id === payment.id);
          let paymentIsCash = payment.method === "cash" || payment.method === "check";
          let isLsCard = !paymentIsCash && payment._importSource === "lightspeed";

          // Disable logic
          let rowDisabled = disabled || hasCreditsSelected;
          if (!rowDisabled && selectedPayments.length > 0 && !isSelected) {
            let selFirst = selectedPayments[0];
            let selIsCashLike = selFirst.method === "cash" || selFirst.method === "check" || (selFirst._importSource === "lightspeed");
            let thisCashLike = paymentIsCash || isLsCard;
            if (thisCashLike !== selIsCashLike) {
              rowDisabled = true;
            } else if (!thisCashLike) {
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

        {/* Store Credits */}
        {creditsApplied.length > 0 && (
          <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: gray(0.1), paddingTop: 6 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: Fonts.weight.textHeavy,
                color: C.lightText,
                marginBottom: 4,
              }}
            >
              STORE CREDITS
            </Text>
            {creditsApplied.map((credit, idx) => {
              let isSelected = selectedCredits.some((c) => c.id === credit.id);
              let rowDisabled = disabled || hasPaymentsSelected;
              return (
                <CreditSelectRow
                  key={credit.id || "cr" + idx}
                  credit={credit}
                  isSelected={isSelected}
                  onSelect={onSelectCredit}
                  isDisabled={rowDisabled}
                />
              );
            })}
          </View>
        )}

        {/* Show previous refunds summary from transaction refunds arrays */}
        {(() => {
          let allRefunds = [];
          payments.forEach((t) => {
            (t.refunds || []).forEach((r) => {
              allRefunds.push({ ...r, _parentMethod: t.method, _parentLast4: t.last4, _parentCardIssuer: t.cardIssuer });
            });
          });
          if (allRefunds.length === 0) return null;
          return (
            <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: gray(0.1), paddingTop: 6 }}>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: Fonts.weight.textHeavy,
                  color: C.lightText,
                  marginBottom: 4,
                }}
              >
                PREVIOUS REFUNDS
              </Text>
              {allRefunds.map((refund, idx) => {
                let methodLabel = refund.method === "cash" ? "CASH" : refund.method === "check" ? "CHECK" : "CARD";
                return (
                  <View
                    key={refund.id || "r" + idx}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 6,
                      paddingHorizontal: 8,
                      borderBottomWidth: 1,
                      borderBottomColor: gray(0.05),
                      borderRadius: 4,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <View
                          style={{
                            backgroundColor: C.lightred,
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
                            {methodLabel} REFUND
                          </Text>
                        </View>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: Fonts.weight.textHeavy,
                            color: C.lightred,
                          }}
                        >
                          -{formatCurrencyDisp(refund.amount)}
                        </Text>
                      </View>
                      {refund._parentLast4 && (
                        <Text style={{ fontSize: 11, color: C.lightText, marginTop: 2 }}>
                          {refund._parentCardIssuer} ****{refund._parentLast4}
                        </Text>
                      )}
                      {!!refund.millis && (
                        <Text style={{ fontSize: 10, color: C.lightText, fontStyle: "italic", marginTop: 2 }}>
                          {formatTransactionDate(refund.millis)}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })()}
      </ScrollView>
    </View>
  );
});
