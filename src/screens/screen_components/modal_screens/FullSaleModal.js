/*eslint-disable*/
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from "react-native-web";
import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { C, COLOR_GRADIENTS, ICONS } from "../../../styles";
import { Button_, SmallLoadingIndicator, SHADOW_RADIUS_PROTO } from "../../../components";
import { useSettingsStore } from "../../../stores";
import {
  formatCurrencyDisp,
  formatMillisForDisplay,
  capitalizeFirstLetterOfString,
  formatPhoneWithDashes,
  gray,
  lightenRGBByPercent,
  calculateRunningTotals,
  resolveStatus,
  log,
} from "../../../utils";
import {
  readActiveSale,
  readCompletedSale,
  readTransactions,
  newCheckoutFetchWorkordersForSale,
} from "./newCheckoutModalScreen/newCheckoutFirebaseCalls";

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

const DetailRow = ({ label, value }) => {
  if (!value) return null;
  return (
    <View style={{ flexDirection: "row", marginBottom: 5 }}>
      <Text style={{ fontSize: 11, color: gray(0.4), width: 70 }}>{label}</Text>
      <Text style={{ fontSize: 12, color: C.text, flex: 1 }}>{value}</Text>
    </View>
  );
};

// ─── Main Modal ─────────────────────────────────────────

export const FullSaleModal = ({ item, onClose }) => {
  const statuses = useSettingsStore((s) => s.settings?.statuses) || [];
  const salesTaxPercent = useSettingsStore((s) => s.settings?.salesTaxPercent) || 0;

  const [sSale, _setSale] = useState(null);
  const [sTransactions, _setTransactions] = useState([]);
  const [sLoadingSale, _setLoadingSale] = useState(true);
  const [sWorkorders, _setWorkorders] = useState([]);
  const [sLoadingWorkorders, _setLoadingWorkorders] = useState(false);
  const [sError, _setError] = useState("");

  // Fetch sale on mount — required because sale data is not in any local store
  useEffect(() => {
    if (!item?.saleID) {
      _setLoadingSale(false);
      _setError("No sale ID");
      return;
    }
    let cancelled = false;
    async function load() {
      _setLoadingSale(true);
      _setError("");
      try {
        // Try active-sales first, then completed-sales
        let sale = await readActiveSale(item.saleID);
        if (!sale) sale = await readCompletedSale(item.saleID);
        if (cancelled) return;
        if (!sale) {
          _setError("Sale not found");
          _setLoadingSale(false);
          return;
        }
        _setSale(sale);

        // Fetch transactions from collection
        if (sale.transactionIDs?.length > 0) {
          let txns = (await readTransactions(sale.transactionIDs)).filter(Boolean);
          if (!cancelled) _setTransactions(txns);
        }

        _setLoadingSale(false);

        // Fetch linked workorders if any
        if (sale.workorderIDs && sale.workorderIDs.length > 0) {
          _setLoadingWorkorders(true);
          let workorders = await newCheckoutFetchWorkordersForSale(sale.workorderIDs);
          if (!cancelled) {
            _setWorkorders(workorders || []);
            _setLoadingWorkorders(false);
          }
        }
      } catch (err) {
        if (!cancelled) {
          log("FullSaleModal load error:", err);
          _setError("Failed to load sale");
          _setLoadingSale(false);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [item?.saleID]);

  // Derived
  const payments = sTransactions;
  const credits = [...(sSale?.creditsApplied || []), ...(sSale?.depositsApplied || [])];
  const allRefunds = sTransactions.flatMap((t) => (t.refunds || []).map((r) => ({ ...r, _parentMethod: t.method, _parentLast4: t.last4 })));
  const totalRefunded = allRefunds.reduce((s, r) => s + (r.amount || 0), 0);
  const hasRefunds = totalRefunded > 0;
  const isVoided = !!sSale?.voidedByRefund;

  function handleRefund() {
    // TODO: Link to NewRefundModalScreen
    log("Refund button pressed — TODO: link to refund modal");
  }

  // ── Loading / Error state ──
  if (sLoadingSale || sError) {
    return ReactDOM.createPortal(
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 1002 }}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={{ width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" }}>
            <TouchableWithoutFeedback>
              <View
                style={{
                  width: 300,
                  backgroundColor: C.backgroundWhite,
                  borderRadius: 15,
                  padding: 30,
                  alignItems: "center",
                  ...SHADOW_RADIUS_PROTO,
                  shadowColor: C.green,
                }}
              >
                {sLoadingSale ? (
                  <>
                    <SmallLoadingIndicator />
                    <Text style={{ fontSize: 14, color: gray(0.4), marginTop: 12 }}>Loading sale...</Text>
                  </>
                ) : (
                  <>
                    <Text style={{ fontSize: 15, fontWeight: "600", color: C.lightred, marginBottom: 15 }}>
                      {sError}
                    </Text>
                    <Button_
                      text="Close"
                      colorGradientArr={COLOR_GRADIENTS.grey}
                      onPress={onClose}
                      buttonStyle={{ paddingHorizontal: 30, paddingVertical: 8 }}
                      textStyle={{ fontSize: 13 }}
                    />
                  </>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </View>,
      document.body
    );
  }

  // ── Full modal ──
  return ReactDOM.createPortal(
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 1002 }}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={{ width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" }}>
          <TouchableWithoutFeedback>
            <View
              style={{
                width: "60%",
                maxWidth: 800,
                height: "85%",
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
                      backgroundColor: sSale.paymentComplete
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
                        color: sSale.paymentComplete ? C.green : C.lightred,
                      }}
                    >
                      {isVoided ? "Voided" : sSale.paymentComplete ? "Paid" : "Partial"}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 10, color: gray(0.35), marginLeft: 12 }}>
                    {"Sale ID: " + sSale.id}
                  </Text>
                  {!!sSale._importSource && (
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
                        {sSale._importSource}
                      </Text>
                    </View>
                  )}
                </View>
                <Button_
                  text="Close"
                  icon={ICONS.close1}
                  iconSize={14}
                  onPress={onClose}
                  buttonStyle={{ paddingHorizontal: 16, height: 32 }}
                  textStyle={{ color: gray(0.5), fontSize: 12 }}
                />
              </View>

              {/* ── Date Banner ── */}
              {!!sSale.millis && (
                <View style={{ paddingHorizontal: 20, paddingVertical: 8, backgroundColor: gray(0.03) }}>
                  <Text style={{ fontSize: 13, color: gray(0.4) }}>
                    {formatMillisForDisplay(sSale.millis, true)}
                  </Text>
                </View>
              )}

              {/* ── Body: two columns ── */}
              <View style={{ flex: 1, flexDirection: "row", padding: 20 }}>
                {/* ── Left column ── */}
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
                    <TotalRow label="Subtotal" value={sSale.subtotal} />
                    {(sSale.discount || 0) > 0 && <TotalRow label="Discount" value={sSale.discount} isNegative />}
                    <TotalRow label="Tax" value={sSale.salesTax || sSale.tax || 0} />
                    {(sSale.cardFee || 0) > 0 && <TotalRow label="Card Fee" value={sSale.cardFee} />}
                    <View style={{ height: 1, backgroundColor: gray(0.15), marginVertical: 6 }} />
                    <TotalRow label="Total" value={sSale.total} bold />
                  </View>

                  {/* Amount info */}
                  <View style={{ marginBottom: 8 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                      <Text style={{ fontSize: 13, color: gray(0.45) }}>Amount Paid</Text>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: C.green }}>
                        {"$" + formatCurrencyDisp(sSale.amountCaptured)}
                      </Text>
                    </View>
                    {!sSale.paymentComplete && (
                      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                        <Text style={{ fontSize: 13, color: gray(0.45) }}>Remaining</Text>
                        <Text style={{ fontSize: 14, fontWeight: "600", color: C.lightred }}>
                          {"$" + formatCurrencyDisp((sSale.total || 0) - (sSale.amountCaptured || 0))}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Customer info */}
                  {(item.customerFirst || item.customerLast) && (
                    <View>
                      <SectionHeader text="CUSTOMER" />
                      <DetailRow
                        label="Name"
                        value={
                          (capitalizeFirstLetterOfString(item.customerFirst || "") +
                            " " +
                            capitalizeFirstLetterOfString(item.customerLast || "")).trim()
                        }
                      />
                      <DetailRow label="Phone" value={item.customerCell ? formatPhoneWithDashes(item.customerCell) : ""} />
                      <DetailRow label="Email" value={item.customerEmail || ""} />
                    </View>
                  )}

                  {/* Workorders */}
                  {(
                    <View>
                      <SectionHeader text={"WORKORDERS" + (sWorkorders.length > 0 ? " (" + sWorkorders.length + ")" : "")} />
                      {sLoadingWorkorders ? (
                        <View style={{ paddingVertical: 15, alignItems: "center" }}>
                          <SmallLoadingIndicator />
                          <Text style={{ fontSize: 11, color: gray(0.4), marginTop: 6 }}>Loading workorders...</Text>
                        </View>
                      ) : sWorkorders.length > 0 ? (
                        sWorkorders.map((wo) => (
                          <WorkorderCard key={wo.id} workorder={wo} statuses={statuses} salesTaxPercent={salesTaxPercent} />
                        ))
                      ) : (
                        <Text style={{ fontSize: 12, color: gray(0.3), fontStyle: "italic" }}>
                          No workorders found
                        </Text>
                      )}
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
                          {(p.method || "card").toUpperCase()}
                        </Text>
                        <Text style={{ fontSize: 15, fontWeight: "600", color: C.text }}>
                          {"$" + formatCurrencyDisp(p.amountCaptured)}
                        </Text>
                      </View>

                      {/* Timestamp */}
                      {!!p.millis && (
                        <Text style={{ fontSize: 10, color: gray(0.35), marginTop: 2 }}>
                          {formatMillisForDisplay(p.millis, true)}
                        </Text>
                      )}

                      {/* Card details */}
                      {p.method === "card" && (
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
                      {p.method === "cash" && !!p.amountTendered && (
                        <Text style={{ fontSize: 11, color: gray(0.4), marginTop: 2 }}>
                          {"Tendered: $" + formatCurrencyDisp(p.amountTendered)}
                        </Text>
                      )}

                      {/* Refunds on this transaction */}
                      {(p.refunds || []).length > 0 && (
                        <Text style={{ fontSize: 11, color: C.lightred, marginTop: 2 }}>
                          {"Refunded: $" + formatCurrencyDisp((p.refunds || []).reduce((s, r) => s + (r.amount || 0), 0))}
                        </Text>
                      )}
                    </View>
                  ))}

                  {payments.length === 0 && (
                    <Text style={{ fontSize: 12, color: gray(0.3), fontStyle: "italic", marginTop: 8 }}>
                      No payments recorded
                    </Text>
                  )}

                  {/* Credits / Deposits */}
                  {credits.length > 0 && (
                    <View>
                      <SectionHeader text={"CREDITS / DEPOSITS (" + credits.length + ")"} />
                      {credits.map((c, idx) => (
                        <View
                          key={c.id || idx}
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
                            <Text style={{ fontSize: 12, color: C.orange }}>
                              {capitalizeFirstLetterOfString(c.type || "deposit")}
                            </Text>
                            <Text style={{ fontSize: 12, color: C.text }}>
                              {"$" + formatCurrencyDisp(c.amount)}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Refund history */}
                  {hasRefunds && (
                    <View>
                      <SectionHeader text="REFUNDS" />
                      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                        <Text style={{ fontSize: 13, color: C.lightred, fontWeight: "600" }}>Total Refunded</Text>
                        <Text style={{ fontSize: 14, fontWeight: "600", color: C.lightred }}>
                          {"-$" + formatCurrencyDisp(totalRefunded)}
                        </Text>
                      </View>
                      {allRefunds.map((r, idx) => (
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
                              {(r.method || "card").toUpperCase() + " Refund"}
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
                </ScrollView>
              </View>

              {/* ── Footer: Refund button ── */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "flex-end",
                  alignItems: "center",
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                  borderTopWidth: 1,
                  borderTopColor: gray(0.1),
                  backgroundColor: C.backgroundWhite,
                }}
              >
                <Button_
                  text="Refund"
                  colorGradientArr={COLOR_GRADIENTS.red}
                  onPress={handleRefund}
                  buttonStyle={{ paddingHorizontal: 20, height: 34 }}
                  textStyle={{ color: C.textWhite, fontSize: 13 }}
                />
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </View>,
    document.body
  );
};

// ─── Workorder Card ─────────────────────────────────────

const WorkorderCard = ({ workorder, statuses, salesTaxPercent }) => {
  const wo = workorder;
  const woRs = resolveStatus(wo.status, statuses);
  const lines = wo.workorderLines || [];
  const totals = lines.length > 0 ? calculateRunningTotals(wo, salesTaxPercent) : null;

  return (
    <View
      style={{
        marginBottom: 10,
        borderRadius: 7,
        borderWidth: 1,
        borderLeftWidth: 3,
        borderLeftColor: woRs.backgroundColor || gray(0.2),
        borderColor: gray(0.1),
        backgroundColor: C.listItemWhite,
        padding: 10,
      }}
    >
      {/* Header: brand/description + status badge */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <Text style={{ fontSize: 13, color: C.text, fontWeight: "600", flex: 1 }} numberOfLines={1}>
          {(wo.brand || "") + (wo.description ? " — " + wo.description : "")}
        </Text>
        <View
          style={{
            backgroundColor: woRs.backgroundColor,
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 8,
            marginLeft: 6,
          }}
        >
          <Text style={{ color: woRs.textColor, fontSize: 9, fontWeight: "600" }}>
            {woRs.label}
          </Text>
        </View>
      </View>

      {/* Colors */}
      {(wo.color1?.label || wo.color2?.label) && (
        <View style={{ flexDirection: "row", marginBottom: 6 }}>
          {!!wo.color1?.label && (
            <View
              style={{
                backgroundColor: wo.color1.backgroundColor || gray(0.2),
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 8,
                marginRight: 4,
              }}
            >
              <Text style={{ fontSize: 9, color: wo.color1.textColor || C.text }}>{wo.color1.label}</Text>
            </View>
          )}
          {!!wo.color2?.label && (
            <View
              style={{
                backgroundColor: wo.color2.backgroundColor || gray(0.2),
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 8,
              }}
            >
              <Text style={{ fontSize: 9, color: wo.color2.textColor || C.text }}>{wo.color2.label}</Text>
            </View>
          )}
        </View>
      )}

      {/* Dates */}
      {!!wo.startedOnMillis && (
        <Text style={{ fontSize: 10, color: gray(0.4), marginBottom: 2 }}>
          {"Started: " + formatMillisForDisplay(wo.startedOnMillis, true)}
        </Text>
      )}
      {!!wo.finishedOnMillis && (
        <Text style={{ fontSize: 10, color: gray(0.4), marginBottom: 2 }}>
          {"Finished: " + formatMillisForDisplay(wo.finishedOnMillis, true)}
        </Text>
      )}

      {/* Tax-free badge */}
      {!!wo.taxFree && (
        <View style={{ backgroundColor: lightenRGBByPercent(C.orange, 60), paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: "flex-start", marginBottom: 4 }}>
          <Text style={{ fontSize: 9, fontWeight: "600", color: C.orange }}>Tax-Free</Text>
        </View>
      )}

      {/* Line items */}
      {lines.length > 0 && (
        <View style={{ marginTop: 6, borderTopWidth: 1, borderTopColor: gray(0.1), paddingTop: 6 }}>
          {lines.map((line, idx) => (
            <LineItemRow key={line.id || idx} line={line} index={idx} />
          ))}
          {/* Subtotal */}
          {totals && (
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: gray(0.08) }}>
              <Text style={{ fontSize: 11, fontWeight: "600", color: gray(0.4) }}>Subtotal</Text>
              <Text style={{ fontSize: 12, fontWeight: "600", color: C.text }}>
                {"$" + formatCurrencyDisp(totals.runningTotal)}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

// ─── Line Item Row ──────────────────────────────────────

const LineItemRow = ({ line, index }) => {
  const inv = line.inventoryItem || {};
  const name = inv.formalName || inv.informalName || "Item";
  const qty = line.qty || 1;
  const hasDiscount = !!line.discountObj?.name;
  const price = hasDiscount ? (line.discountObj.newPrice || 0) : (inv.price || 0) * qty;

  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
      <Text style={{ fontSize: 11, color: C.text, flex: 1 }} numberOfLines={1}>
        {qty > 1 ? qty + "x " : ""}{name}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {hasDiscount && (
          <Text style={{ fontSize: 10, color: C.green, marginRight: 6 }}>
            {line.discountObj.name}
          </Text>
        )}
        <Text style={{ fontSize: 11, color: C.text, fontWeight: "500" }}>
          {"$" + formatCurrencyDisp(price)}
        </Text>
      </View>
    </View>
  );
};
