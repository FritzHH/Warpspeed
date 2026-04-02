/*eslint-disable*/
import { View, Text, ScrollView, Modal, TouchableOpacity, Linking } from "react-native-web";
import {
  formatCurrencyDisp,
  formatMillisForDisplay,
  gray,
  lightenRGBByPercent,
} from "../../../utils";
import { C, ICONS, COLOR_GRADIENTS } from "../../../styles";
import { Button_, SHADOW_RADIUS_PROTO } from "../../../components";
import { useSettingsStore, useLoginStore } from "../../../stores";
import { printBuilder, log } from "../../../utils";
import { dbSavePrintObj } from "../../../db_calls_wrapper";

// ─── Helper components ──────────────────────────────────

const DetailRow = ({ label, value, valueColor, valueStyle, onPress }) => {
  if (!value) return null;
  const content = (
    <View style={{ flexDirection: "row", marginBottom: 6 }}>
      <Text style={{ fontSize: 12, color: gray(0.4), width: 140 }}>{label}</Text>
      <Text style={{ fontSize: 13, color: valueColor || C.text, flex: 1, ...valueStyle }}>{value}</Text>
    </View>
  );
  if (onPress) {
    return <TouchableOpacity onPress={onPress}>{content}</TouchableOpacity>;
  }
  return content;
};

const SectionHeader = ({ text }) => (
  <Text style={{ fontSize: 11, fontWeight: "600", color: gray(0.4), marginBottom: 6, marginTop: 14, letterSpacing: 0.5 }}>
    {text}
  </Text>
);

// ─── Refund Infographic ─────────────────────────────────

const RefundInfoGraphic = ({ amountCaptured, totalRefunded }) => {
  let remaining = Math.max(0, amountCaptured - totalRefunded);
  let refundedPercent = amountCaptured > 0 ? Math.round((totalRefunded / amountCaptured) * 100) : 0;
  let fullyRefunded = remaining === 0;

  return (
    <View
      style={{
        borderRadius: 7,
        borderWidth: 1,
        borderColor: lightenRGBByPercent(C.lightred, 40),
        backgroundColor: C.listItemWhite,
        padding: 12,
        marginBottom: 12,
      }}
    >
      {/* Labels row */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
        <View style={{ alignItems: "flex-start" }}>
          <Text style={{ fontSize: 10, color: gray(0.45), marginBottom: 2 }}>REFUNDED</Text>
          <Text style={{ fontSize: 15, fontWeight: "700", color: C.lightred }}>
            {"$" + formatCurrencyDisp(totalRefunded)}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: 10, color: gray(0.45), marginBottom: 2 }}>REMAINING</Text>
          <Text style={{ fontSize: 15, fontWeight: "700", color: fullyRefunded ? gray(0.3) : C.green }}>
            {"$" + formatCurrencyDisp(remaining)}
          </Text>
        </View>
      </View>
      {/* Progress bar */}
      <View
        style={{
          height: 8,
          borderRadius: 4,
          backgroundColor: lightenRGBByPercent(C.green, 55),
          overflow: "hidden",
        }}
      >
        <View
          style={{
            height: 8,
            borderRadius: 4,
            width: refundedPercent + "%",
            backgroundColor: C.lightred,
          }}
        />
      </View>
      {/* Percent label */}
      <Text style={{ fontSize: 10, color: gray(0.4), marginTop: 4, textAlign: "center" }}>
        {refundedPercent + "% of $" + formatCurrencyDisp(amountCaptured) + " refunded"}
      </Text>
    </View>
  );
};

// ─── Refund Card ────────────────────────────────────────

const RefundCard = ({ refund, index }) => {
  let r = refund;
  return (
    <View
      style={{
        marginBottom: 6,
        borderRadius: 7,
        borderWidth: 1,
        borderColor: lightenRGBByPercent(C.lightred, 45),
        backgroundColor: C.listItemWhite,
        padding: 10,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View
            style={{
              backgroundColor: lightenRGBByPercent(C.lightred, 55),
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 4,
              marginRight: 8,
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: "600", color: C.lightred }}>
              {(r.method || "card").toUpperCase()}
            </Text>
          </View>
          <Text style={{ fontSize: 12, color: gray(0.45) }}>
            {"Refund #" + (index + 1)}
          </Text>
        </View>
        <Text style={{ fontSize: 14, fontWeight: "700", color: C.lightred }}>
          {"-$" + formatCurrencyDisp(r.amount)}
        </Text>
      </View>
      {!!r.notes && (
        <Text style={{ fontSize: 11, color: gray(0.45), marginTop: 4 }}>{r.notes}</Text>
      )}
      {!!r.millis && (
        <Text style={{ fontSize: 10, color: gray(0.35), marginTop: 3 }}>
          {formatMillisForDisplay(r.millis, true)}
        </Text>
      )}
    </View>
  );
};

// ─── Main Modal ─────────────────────────────────────────

export const TransactionModal = ({ transaction, onClose, onRefund }) => {
  if (!transaction) return null;

  const txn = transaction;
  const isCard = txn.method === "card";
  const isCash = txn.method === "cash";
  const refunds = txn.refunds || [];
  const totalRefunded = refunds.reduce((s, r) => s + (r.amount || 0), 0);
  const hasRefunds = totalRefunded > 0;
  const changeGiven = isCash && txn.amountTendered > txn.amountCaptured
    ? txn.amountTendered - txn.amountCaptured
    : 0;

  function handleClose() {
    onClose && onClose();
  }

  function handlePrintTransaction() {
    const _settings = useSettingsStore.getState().getSettings();
    const _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings: _settings };
    let toPrint = printBuilder.transaction(txn, _ctx);
    log("DEV — transaction receipt:", toPrint);
    dbSavePrintObj(toPrint, _settings?.selectedPrinterID || "");
  }

  function handleRefund() {
    onRefund && onRefund(txn);
  }

  return (
    <Modal visible={true} transparent={true} animationType="fade">
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(50,50,50,.65)",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <View
          style={{
            width: "45%",
            maxWidth: 600,
            height: "70%",
            backgroundColor: lightenRGBByPercent(C.backgroundWhite, 35),
            borderRadius: 8,
            ...SHADOW_RADIUS_PROTO,
            shadowColor: C.green,
            overflow: "hidden",
            flexDirection: "column",
          }}
        >
          {/* ── Header ── */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingHorizontal: 20,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: gray(0.1),
              backgroundColor: C.backgroundWhite,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {/* Method badge */}
              <View
                style={{
                  backgroundColor: isCard
                    ? lightenRGBByPercent(C.blue, 60)
                    : lightenRGBByPercent(C.green, 60),
                  paddingHorizontal: 14,
                  paddingVertical: 4,
                  borderRadius: 10,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: isCard ? C.blue : C.green,
                  }}
                >
                  {(txn.method || "unknown").toUpperCase()}
                </Text>
              </View>
              <Text style={{ fontSize: 10, color: gray(0.35), marginLeft: 12 }}>
                {"Txn ID: " + txn.id}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Button_
                text="Refund"
                colorGradientArr={COLOR_GRADIENTS.red}
                onPress={handleRefund}
                buttonStyle={{ paddingHorizontal: 16, height: 32, marginRight: 8 }}
                textStyle={{ fontSize: 12, color: "#fff" }}
              />
              <Button_
                text="Print Transaction"
                icon={ICONS.receipt}
                iconSize={16}
                onPress={handlePrintTransaction}
                buttonStyle={{ paddingHorizontal: 14, height: 32, marginRight: 8, borderWidth: 1, borderColor: C.buttonLightGreenOutline }}
                textStyle={{ fontSize: 12, color: C.text }}
              />
              <Button_
                text="Close"
                icon={ICONS.close1}
                iconSize={14}
                onPress={handleClose}
                buttonStyle={{ paddingHorizontal: 16, height: 32 }}
                textStyle={{ color: gray(0.5), fontSize: 12 }}
              />
            </View>
          </View>

          {/* ── Date Banner ── */}
          {!!txn.millis && (
            <View style={{ paddingHorizontal: 20, paddingVertical: 8, backgroundColor: gray(0.03) }}>
              <Text style={{ fontSize: 13, color: gray(0.4) }}>
                {formatMillisForDisplay(txn.millis, true)}
              </Text>
            </View>
          )}

          {/* ── Body ── */}
          <ScrollView style={{ flex: 1, padding: 20 }}>
            {/* Amount section */}
            <SectionHeader text="AMOUNT" />
            <View
              style={{
                borderRadius: 7,
                borderWidth: 1,
                borderColor: C.buttonLightGreenOutline,
                backgroundColor: C.listItemWhite,
                padding: 12,
                marginBottom: 12,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                <Text style={{ fontSize: 15, color: gray(0.45), fontWeight: "600" }}>Amount Captured</Text>
                <Text style={{ fontSize: 17, fontWeight: "700", color: C.text }}>
                  {"$" + formatCurrencyDisp(txn.amountCaptured || 0)}
                </Text>
              </View>
              {(txn.salesTax || 0) > 0 && (
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                  <Text style={{ fontSize: 13, color: gray(0.45) }}>Sales Tax</Text>
                  <Text style={{ fontSize: 14, color: C.text }}>
                    {"$" + formatCurrencyDisp(txn.salesTax)}
                  </Text>
                </View>
              )}
              {isCash && !!txn.amountTendered && (
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                  <Text style={{ fontSize: 13, color: gray(0.45) }}>Amount Tendered</Text>
                  <Text style={{ fontSize: 14, color: C.text }}>
                    {"$" + formatCurrencyDisp(txn.amountTendered)}
                  </Text>
                </View>
              )}
              {changeGiven > 0 && (
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 13, color: gray(0.45) }}>Change Given</Text>
                  <Text style={{ fontSize: 14, color: C.green }}>
                    {"$" + formatCurrencyDisp(changeGiven)}
                  </Text>
                </View>
              )}
            </View>

            {/* Refund infographic + card list (only if refunds exist) */}
            {hasRefunds && (
              <View>
                <SectionHeader text={"REFUNDS (" + refunds.length + ")"} />
                <RefundInfoGraphic
                  amountCaptured={txn.amountCaptured || 0}
                  totalRefunded={totalRefunded}
                />
                {refunds.map((r, idx) => (
                  <RefundCard key={r.id || idx} refund={r} index={idx} />
                ))}
              </View>
            )}

            {/* Card details */}
            {isCard && (
              <View>
                <SectionHeader text="CARD DETAILS" />
                <DetailRow label="Card Type" value={txn.cardType} />
                <DetailRow label="Last 4" value={txn.last4 ? "..." + txn.last4 : null} />
                <DetailRow
                  label="Expiration"
                  value={txn.expMonth && txn.expYear ? txn.expMonth + "/" + txn.expYear : null}
                />
                <DetailRow label="Card Issuer" value={txn.cardIssuer} />
                <DetailRow label="Auth Code" value={txn.authorizationCode} />
                <DetailRow label="Processor" value={txn.paymentProcessor} />

                <SectionHeader text="STRIPE" />
                <DetailRow label="Charge ID" value={txn.chargeID} valueStyle={{ fontSize: 11 }} />
                <DetailRow label="Payment Intent" value={txn.paymentIntentID} valueStyle={{ fontSize: 11 }} />
                <DetailRow label="Network Txn ID" value={txn.networkTransactionID} valueStyle={{ fontSize: 11 }} />
                {!!txn.receiptURL && (
                  <DetailRow
                    label="Receipt URL"
                    value="View Receipt"
                    valueColor={C.blue}
                    valueStyle={{ textDecorationLine: "underline" }}
                    onPress={() => {
                      try { window.open(txn.receiptURL, "_blank"); } catch (e) {}
                    }}
                  />
                )}
              </View>
            )}

            {/* Cash details */}
            {isCash && (
              <View>
                <SectionHeader text="CASH DETAILS" />
                <DetailRow label="Processor" value={txn.paymentProcessor || "cash"} />
              </View>
            )}

            {/* Bottom spacer */}
            <View style={{ height: 20 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};
