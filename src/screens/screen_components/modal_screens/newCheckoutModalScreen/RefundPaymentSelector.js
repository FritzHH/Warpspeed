/* eslint-disable */
import { memo, useState } from "react";
import { View, Text, ScrollView, TextInput } from "react-native-web";
import { TouchableOpacity } from "react-native";
import { C, Fonts } from "../../../../styles";
import { formatCurrencyDisp, gray, usdTypeMask } from "../../../../utils";
import dayjs from "dayjs";
import { dlog, DCAT } from "./checkoutDebugLog";

function formatTransactionDate(millis) {
  let d = dayjs(millis);
  let day = d.date();
  let suffix = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  let fmt = d.year() === dayjs().year() ? "ddd, MMM " : "ddd, MMM ";
  return d.format(fmt) + day + suffix + (d.year() !== dayjs().year() ? ", " + d.year() : "");
}

const BADGE_COLORS = {
  credit: "rgb(103, 124, 231)",
  deposit: C.green,
  giftcard: C.blue,
};

const BADGE_LABELS = {
  credit: "CREDIT",
  deposit: "DEPOSIT",
  giftcard: "GIFT CARD",
};

const CreditDepositRow = memo(function CreditDepositRow({
  item,
  isSelected,
  onSelect,
  isDisabled,
  returnMode,
  onReturnModeChange,
  customAmountDisp,
  onCustomAmountChange,
}) {
  let [sShowCustom, _setShowCustom] = useState(false);
  let amountRefunded = (item.refunds || []).reduce((s, r) => s + (r.amount || 0), 0);
  let available = item.amount - amountRefunded;
  let fullyRefunded = available <= 0;
  let isCredit = item.type === "credit";
  let badgeColor = BADGE_COLORS[item.type] || "rgb(103, 124, 231)";
  let badgeLabel = BADGE_LABELS[item.type] || "CREDIT";

  return (
    <TouchableOpacity
      onPress={() => {
        if (!isDisabled && !fullyRefunded) {
          dlog(DCAT.BUTTON, "selectCreditDeposit", "RefundPaymentSelector", { id: item.id, type: item.type, amount: item.amount });
          onSelect(item);
        }
      }}
      activeOpacity={fullyRefunded || isDisabled ? 1 : 0.7}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 8,
        borderBottomWidth: 1,
        borderBottomColor: gray(0.05),
        backgroundColor: isSelected ? "rgb(237, 232, 252)" : fullyRefunded ? gray(0.04) : "transparent",
        borderRadius: 4,
        opacity: fullyRefunded || isDisabled ? 0.4 : 1,
      }}
    >
      {/* Return mode toggle - deposits and gift cards only, only when selected */}
      {!isCredit && isSelected && (
        <View style={{ flexDirection: "row", marginBottom: 6, gap: 4 }}>
          <TouchableOpacity
            onPress={(e) => { e.stopPropagation(); onReturnModeChange("account"); }}
            style={{
              flex: 1,
              paddingVertical: 4,
              borderRadius: 4,
              backgroundColor: returnMode === "account" ? "rgb(103, 124, 231)" : gray(0.08),
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 9, fontWeight: Fonts.weight.textHeavy, color: returnMode === "account" ? "white" : C.lightText }}>
              RETURN TO ACCOUNT
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={(e) => { e.stopPropagation(); onReturnModeChange("customer"); }}
            style={{
              flex: 1,
              paddingVertical: 4,
              borderRadius: 4,
              backgroundColor: returnMode === "customer" ? C.green : gray(0.08),
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 9, fontWeight: Fonts.weight.textHeavy, color: returnMode === "customer" ? "white" : C.lightText }}>
              RETURN TO CUSTOMER
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {/* Checkbox */}
        <View
          style={{
            width: 16,
            height: 16,
            borderRadius: 3,
            borderWidth: 2,
            borderColor: isSelected ? badgeColor : gray(0.2),
            backgroundColor: isSelected ? badgeColor : "transparent",
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
            <View style={{ backgroundColor: badgeColor, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1 }}>
              <Text style={{ fontSize: 9, fontWeight: Fonts.weight.textHeavy, color: "white" }}>
                {badgeLabel}
              </Text>
            </View>
            <Text style={{ fontSize: 13, fontWeight: Fonts.weight.textHeavy, color: C.text }}>
              {formatCurrencyDisp(item.amount)}
            </Text>
          </View>

          {(item._note || item._method) && (
            <Text style={{ fontSize: 11, color: C.lightText, marginTop: 2 }}>
              {item._note || ""}{item._last4 ? ` ****${item._last4}` : ""}
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
      </View>

      {/* Custom Amount - only when selected and in "account" mode (or credit which is always account) */}
      {isSelected && (isCredit || returnMode === "account") && !fullyRefunded && (
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, gap: 6 }}>
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              let next = !sShowCustom;
              _setShowCustom(next);
              if (!next) onCustomAmountChange(0, "");
            }}
            style={{
              paddingVertical: 4,
              paddingHorizontal: 8,
              borderRadius: 4,
              backgroundColor: sShowCustom ? "rgb(103, 124, 231)" : gray(0.08),
            }}
          >
            <Text style={{ fontSize: 9, fontWeight: Fonts.weight.textHeavy, color: sShowCustom ? "white" : C.lightText }}>
              CUSTOM AMOUNT
            </Text>
          </TouchableOpacity>
          {sShowCustom && (
            <View style={{
              flex: 1,
              borderWidth: 1,
              borderColor: gray(0.15),
              borderRadius: 4,
              paddingHorizontal: 6,
              paddingVertical: 3,
              backgroundColor: "white",
            }}>
              <TextInput
                style={{
                  fontSize: 13,
                  color: C.text,
                  outlineWidth: 0,
                  outlineStyle: "none",
                  textAlign: "right",
                }}
                value={customAmountDisp}
                onChangeText={(val) => {
                  let result = usdTypeMask(val, { withDollar: false });
                  let maxCents = available;
                  if (result.cents > maxCents) {
                    onCustomAmountChange(maxCents, formatCurrencyDisp(maxCents));
                  } else {
                    onCustomAmountChange(result.cents, result.display);
                  }
                }}
                placeholder="0.00"
                placeholderTextColor={gray(0.3)}
                keyboardType="numeric"
              />
            </View>
          )}
        </View>
      )}
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
  depositsApplied = [],
  selectedItem = null,
  onSelectItem,
  returnMode = "account",
  onReturnModeChange,
  customAmountDisp = "",
  onCustomAmountChange,
  disabled = false,
}) {
  let hasItemSelected = !!selectedItem;
  let isReturnToCustomer = hasItemSelected && returnMode === "customer" && selectedItem.type !== "credit";
  let hasPaymentsSelected = selectedPayments.length > 0;
  let allCreditsAndDeposits = [...creditsApplied, ...depositsApplied];

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
          let rowDisabled = disabled || (hasItemSelected && !isReturnToCustomer);
          if (!rowDisabled && selectedPayments.length > 0 && !isSelected) {
            let selFirst = selectedPayments[0];
            let selIsCashLike = selFirst.method === "cash" || selFirst.method === "check" || (selFirst._importSource === "lightspeed");
            let thisCashLike = paymentIsCash || isLsCard;
            if (thisCashLike !== selIsCashLike) {
              rowDisabled = true;
            } else if (!thisCashLike) {
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

        {/* Credits & Deposits */}
        {allCreditsAndDeposits.length > 0 && (
          <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: gray(0.1), paddingTop: 6 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: Fonts.weight.textHeavy,
                color: C.lightText,
                marginBottom: 4,
              }}
            >
              CREDITS & DEPOSITS
            </Text>
            {allCreditsAndDeposits.map((item, idx) => {
              let isSelected = selectedItem?.id === item.id;
              let rowDisabled = disabled || hasPaymentsSelected || (hasItemSelected && !isSelected);
              return (
                <CreditDepositRow
                  key={item.id || "cd" + idx}
                  item={item}
                  isSelected={isSelected}
                  onSelect={onSelectItem}
                  isDisabled={rowDisabled}
                  returnMode={isSelected ? returnMode : "account"}
                  onReturnModeChange={onReturnModeChange}
                  customAmountDisp={isSelected ? customAmountDisp : ""}
                  onCustomAmountChange={onCustomAmountChange}
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
