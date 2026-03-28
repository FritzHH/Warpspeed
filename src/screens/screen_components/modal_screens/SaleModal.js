/*eslint-disable*/
import { View, Text, ScrollView, Modal, TouchableOpacity } from "react-native-web";
import {
  formatCurrencyDisp,
  formatMillisForDisplay,
  gray,
  lightenRGBByPercent,
  capitalizeFirstLetterOfString,
  resolveStatus,
} from "../../../utils";
import { C, COLOR_GRADIENTS, ICONS } from "../../../styles";
import { useCheckoutStore, useOpenWorkordersStore, useSettingsStore } from "../../../stores";
import { Button_, SHADOW_RADIUS_PROTO } from "../../../components";

// ─── Helper components ──────────────────────────────────

const TotalRow = ({ label, value, isNegative, bold }) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
    <Text style={{ fontSize: bold ? 15 : 13, color: gray(0.45), fontWeight: bold ? "600" : "400" }}>
      {label}
    </Text>
    <Text
      style={{
        fontSize: bold ? 17 : 14,
        fontWeight: bold ? "700" : "400",
        color: isNegative ? C.lightred : C.text,
      }}
    >
      {(isNegative ? "-" : "") + "$" + formatCurrencyDisp(Math.abs(value || 0))}
    </Text>
  </View>
);

const SectionHeader = ({ text }) => (
  <Text style={{ fontSize: 11, fontWeight: "600", color: gray(0.4), marginBottom: 6, marginTop: 14, letterSpacing: 0.5 }}>
    {text}
  </Text>
);

// ─── Main Modal ─────────────────────────────────────────

export const SaleModal = () => {
  const sale = useOpenWorkordersStore((s) => s.saleModalObj);
  const statuses = useSettingsStore((s) => s.settings?.statuses) || [];

  const payments = sale?.payments || [];
  const refunds = sale?.refunds || [];
  const linkedWOs = sale?._workorders || [];
  const hasRefunds = (sale?.amountRefunded || 0) > 0;
  const isVoided = !!sale?.voidedByRefund;

  function handleClose() {
    useOpenWorkordersStore.getState().setSaleModalObj(null);
  }

  function handleRefund() {
    handleClose();
    useCheckoutStore.getState().setStringOnly(sale.id);
  }

  return (
    <Modal visible={!!sale} transparent={true} animationType="fade">
      {sale && <View
        style={{
          flex: 1,
          backgroundColor: "rgba(50,50,50,.65)",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <View
          style={{
            width: "55%",
            maxWidth: 750,
            height: "80%",
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
              {/* Payment status badge */}
              <View
                style={{
                  backgroundColor: sale.paymentComplete
                    ? lightenRGBByPercent(C.green, 60)
                    : lightenRGBByPercent(C.lightred, 50),
                  paddingHorizontal: 14,
                  paddingVertical: 4,
                  borderRadius: 10,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: sale.paymentComplete ? C.green : C.lightred,
                  }}
                >
                  {isVoided ? "Voided" : sale.paymentComplete ? "Paid" : "Partial"}
                </Text>
              </View>
              <Text style={{ fontSize: 10, color: gray(0.35), marginLeft: 12 }}>
                {"Sale ID: " + sale.id}
              </Text>
              {!!sale._importSource && (
                <View
                  style={{
                    backgroundColor: lightenRGBByPercent(C.blue, 60),
                    paddingHorizontal: 6,
                    paddingVertical: 1,
                    borderRadius: 8,
                    marginLeft: 8,
                  }}
                >
                  <Text style={{ fontSize: 9, fontWeight: "600", color: C.blue }}>
                    {sale._importSource}
                  </Text>
                </View>
              )}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Button_
                text="Refund"
                colorGradientArr={COLOR_GRADIENTS.red}
                onPress={handleRefund}
                buttonStyle={{ paddingHorizontal: 16, height: 32, marginRight: 8 }}
                textStyle={{ color: C.textWhite, fontSize: 12 }}
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

          {/* ── Deposit/Credit Banner ── */}
          {sale.isDepositSale && (() => {
            const isCredit = sale.depositType === "credit";
            const bannerColor = isCredit ? C.blue : C.orange;
            return (
              <View
                style={{
                  backgroundColor: lightenRGBByPercent(bannerColor, 55),
                  paddingVertical: 8,
                  paddingHorizontal: 20,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <View
                  style={{
                    backgroundColor: lightenRGBByPercent(bannerColor, 70),
                    paddingHorizontal: 14,
                    paddingVertical: 4,
                    borderRadius: 8,
                    marginRight: 10,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "600", color: bannerColor }}>
                    {isCredit ? "Credit" : "Deposit"}
                  </Text>
                </View>
                <Text style={{ fontSize: 15, fontWeight: "700", color: bannerColor, letterSpacing: 0.5 }}>
                  {isCredit ? "STORE CREDIT SALE" : "DEPOSIT SALE"}
                </Text>
                {!!sale.depositNote && (
                  <Text style={{ fontSize: 12, color: bannerColor, marginLeft: 12, opacity: 0.7 }}>
                    {sale.depositNote}
                  </Text>
                )}
              </View>
            );
          })()}

          {/* ── Date Banner ── */}
          {!!sale.millis && (
            <View style={{ paddingHorizontal: 20, paddingVertical: 8, backgroundColor: gray(0.03) }}>
              <Text style={{ fontSize: 13, color: gray(0.4) }}>
                {formatMillisForDisplay(sale.millis, true)}
              </Text>
            </View>
          )}

          {/* ── Body: two columns ── */}
          <View style={{ flex: 1, flexDirection: "row", padding: 20 }}>
            {/* ── Left column: totals + amounts ── */}
            <ScrollView style={{ flex: 1, paddingRight: 20 }}>
              {/* Totals breakdown */}
              <SectionHeader text="TOTALS" />
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
                <TotalRow label="Subtotal" value={sale.subtotal} />
                {(sale.discount || 0) > 0 && <TotalRow label="Discount" value={sale.discount} isNegative />}
                <TotalRow label="Tax" value={sale.tax} />
                {(sale.cardFee || 0) > 0 && <TotalRow label="Card Fee" value={sale.cardFee} />}
                <View style={{ height: 1, backgroundColor: gray(0.15), marginVertical: 6 }} />
                <TotalRow label="Total" value={sale.total} bold />
              </View>

              {/* Amount info */}
              <View style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                  <Text style={{ fontSize: 13, color: gray(0.45) }}>Amount Paid</Text>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: C.green }}>
                    {"$" + formatCurrencyDisp(sale.amountCaptured)}
                  </Text>
                </View>
                {!sale.paymentComplete && (
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                    <Text style={{ fontSize: 13, color: gray(0.45) }}>Remaining</Text>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: C.lightred }}>
                      {"$" + formatCurrencyDisp((sale.total || 0) - (sale.amountCaptured || 0))}
                    </Text>
                  </View>
                )}
              </View>

              {/* Refund history */}
              {hasRefunds && (
                <View>
                  <SectionHeader text="REFUNDS" />
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                    <Text style={{ fontSize: 13, color: C.lightred, fontWeight: "600" }}>Total Refunded</Text>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: C.lightred }}>
                      {"-$" + formatCurrencyDisp(sale.amountRefunded)}
                    </Text>
                  </View>
                  {refunds.map((r, idx) => (
                    <View
                      key={r.id || idx}
                      style={{
                        marginBottom: 4,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: gray(0.1),
                        backgroundColor: C.listItemWhite,
                        padding: 8,
                      }}
                    >
                      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Text style={{ fontSize: 12, color: C.lightred }}>
                          {"Refund #" + (idx + 1)}
                        </Text>
                        <Text style={{ fontSize: 12, color: C.lightred }}>
                          {"-$" + formatCurrencyDisp(r.amount)}
                        </Text>
                      </View>
                      {!!r.notes && (
                        <Text style={{ fontSize: 10, color: gray(0.4), marginTop: 2 }}>{r.notes}</Text>
                      )}
                    </View>
                  ))}
                </View>
              )}

              {/* Linked workorders */}
              {linkedWOs.length > 0 && (
                <View>
                  <SectionHeader text={"LINKED WORKORDERS (" + linkedWOs.length + ")"} />
                  {linkedWOs.map((wo) => {
                    const woRs = resolveStatus(wo.status, statuses);
                    return (
                      <TouchableOpacity
                        key={wo.id}
                        onPress={() => {
                          handleClose();
                          useOpenWorkordersStore.getState().setClosedWorkorderModalObj(wo);
                        }}
                        style={{
                          marginBottom: 4,
                          borderRadius: 6,
                          borderWidth: 1,
                          borderLeftWidth: 3,
                          borderLeftColor: woRs.backgroundColor || gray(0.2),
                          borderColor: gray(0.1),
                          backgroundColor: C.listItemWhite,
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                        }}
                      >
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                          <Text style={{ fontSize: 12, color: C.text, flex: 1 }} numberOfLines={1}>
                            {(wo.brand || "") + (wo.description ? " — " + wo.description : "")}
                          </Text>
                          <View
                            style={{
                              backgroundColor: woRs.backgroundColor,
                              paddingHorizontal: 8,
                              paddingVertical: 1,
                              borderRadius: 8,
                              marginLeft: 6,
                            }}
                          >
                            <Text style={{ color: woRs.textColor, fontSize: 9, fontWeight: "600" }}>
                              {woRs.label}
                            </Text>
                          </View>
                        </View>
                        {!!wo.customerFirst && (
                          <Text style={{ fontSize: 10, color: gray(0.4), marginTop: 2 }}>
                            {capitalizeFirstLetterOfString(wo.customerFirst) +
                              " " +
                              capitalizeFirstLetterOfString(wo.customerLast || "")}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </ScrollView>

            {/* ── Vertical divider ── */}
            <View style={{ width: 1, backgroundColor: gray(0.1), marginHorizontal: 5 }} />

            {/* ── Right column: payments ── */}
            <ScrollView style={{ flex: 1, paddingLeft: 15 }}>
              <SectionHeader text={"PAYMENTS (" + payments.length + ")"} />
              {payments.map((p, idx) => (
                <View
                  key={p.id || idx}
                  style={{
                    marginBottom: 8,
                    borderRadius: 7,
                    borderWidth: 1,
                    borderColor: gray(0.1),
                    backgroundColor: C.listItemWhite,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                  }}
                >
                  {/* Type + Amount */}
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: C.text }}>
                      {p.cash ? "CASH" : p.check ? "CHECK" : "CARD"}
                    </Text>
                    <Text style={{ fontSize: 15, fontWeight: "600", color: C.text }}>
                      {"$" + formatCurrencyDisp(p.amountCaptured)}
                    </Text>
                  </View>

                  {/* Card details */}
                  {!p.cash && !p.check && (
                    <View style={{ marginTop: 4 }}>
                      {(!!p.cardType || !!p.last4) && (
                        <Text style={{ fontSize: 11, color: gray(0.4) }}>
                          {(p.cardType || "Card") + (p.last4 ? "  ..." + p.last4 : "")}
                          {p.expMonth && p.expYear ? "  Exp " + p.expMonth + "/" + p.expYear : ""}
                        </Text>
                      )}
                      {!!p.authorizationCode && (
                        <Text style={{ fontSize: 10, color: gray(0.35) }}>
                          {"Auth: " + p.authorizationCode}
                        </Text>
                      )}
                      {!!p.chargeID && (
                        <Text style={{ fontSize: 10, color: gray(0.35) }}>
                          {"Charge: " + p.chargeID}
                        </Text>
                      )}
                    </View>
                  )}

                  {/* Cash tendered */}
                  {p.cash && !!p.amountTendered && (
                    <Text style={{ fontSize: 11, color: gray(0.4), marginTop: 2 }}>
                      {"Tendered: $" + formatCurrencyDisp(p.amountTendered)}
                    </Text>
                  )}

                  {/* Refund on this payment */}
                  {(p.amountRefunded || 0) > 0 && (
                    <Text style={{ fontSize: 11, color: C.lightred, marginTop: 2 }}>
                      {"Refunded: $" + formatCurrencyDisp(p.amountRefunded)}
                    </Text>
                  )}
                </View>
              ))}

              {payments.length === 0 && (
                <Text style={{ fontSize: 12, color: gray(0.3), fontStyle: "italic", marginTop: 8 }}>
                  No payments recorded
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      </View>}
    </Modal>
  );
};
