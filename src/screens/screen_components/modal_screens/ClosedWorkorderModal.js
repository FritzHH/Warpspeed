/*eslint-disable*/
import { View, Text, FlatList, ScrollView, Modal, TouchableOpacity } from "react-native-web";
import { useState, useEffect } from "react";
import {
  calculateRunningTotals,
  capitalizeFirstLetterOfString,
  formatCurrencyDisp,
  formatMillisForDisplay,
  formatPhoneWithDashes,
  gray,
  lightenRGBByPercent,
  resolveStatus,
} from "../../../utils";
import { C, COLOR_GRADIENTS, ICONS } from "../../../styles";
import { useCheckoutStore, useSettingsStore } from "../../../stores";
import { Button_, SHADOW_RADIUS_PROTO } from "../../../components";
import { dbGetCompletedSale } from "../../../db_calls_wrapper";

// ─── Helper display components ──────────────────────────────────

const DetailRow = ({ label, value, valueColor, valueStyle, labelSize = 11, valueSize = 12 }) => {
  if (!value) return null;
  return (
    <View style={{ flexDirection: "row", marginBottom: 6 }}>
      <Text style={{ fontSize: labelSize, color: gray(0.4), width: 110 }}>{label}</Text>
      <Text style={{ fontSize: valueSize, color: valueColor || C.text, flex: 1, ...valueStyle }}>{value}</Text>
    </View>
  );
};

const TotalRow = ({ label, value, isNegative, bold }) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
    <Text style={{ fontSize: 14, color: gray(0.45), fontWeight: bold ? "600" : "400" }}>
      {label}
    </Text>
    <Text
      style={{
        fontSize: bold ? 16 : 14,
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

// ─── Sale Card ──────────────────────────────────────────────────

const SaleCard = ({ sale, onRefund }) => {
  const payments = sale.transactions || [];
  const refunds = sale.refunds || [];
  const hasRefunds = (sale.amountRefunded || 0) > 0;

  return (
    <View
      style={{
        borderRadius: 7,
        borderWidth: 1,
        borderColor: C.buttonLightGreenOutline,
        backgroundColor: C.listItemWhite,
        padding: 10,
        marginBottom: 8,
      }}
    >
      {/* Header: date + payment status + refund button */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <Text style={{ fontSize: 12, color: gray(0.35) }}>
          {"Sale ID: " + sale.id}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View
            style={{
              backgroundColor: sale.paymentComplete
                ? lightenRGBByPercent(C.green, 70)
                : lightenRGBByPercent(C.lightred, 60),
              paddingHorizontal: 6,
              paddingVertical: 1,
              borderRadius: 8,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: "600",
                color: sale.paymentComplete ? C.green : C.lightred,
              }}
            >
              {sale.paymentComplete ? "Paid" : "Partial"}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => onRefund && onRefund(sale.id)}
            style={{
              marginLeft: 8,
              borderWidth: 1,
              borderColor: C.lightred,
              borderRadius: 6,
              paddingHorizontal: 8,
              paddingVertical: 2,
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: "600", color: C.lightred }}>Refund</Text>
          </TouchableOpacity>
        </View>
      </View>

      {!!sale.millis && (
        <Text style={{ fontSize: 13, color: gray(0.45), marginBottom: 4 }}>
          {formatMillisForDisplay(sale.millis)}
        </Text>
      )}

      {/* Totals */}
      <View style={{ marginBottom: 4 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 2 }}>
          <Text style={{ fontSize: 13, color: gray(0.45) }}>Subtotal</Text>
          <Text style={{ fontSize: 13, color: C.text }}>{"$" + formatCurrencyDisp(sale.subtotal)}</Text>
        </View>
        {(sale.discount || 0) > 0 && (
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 2 }}>
            <Text style={{ fontSize: 13, color: gray(0.45) }}>Discount</Text>
            <Text style={{ fontSize: 13, color: C.lightred }}>{"-$" + formatCurrencyDisp(sale.discount)}</Text>
          </View>
        )}
        {(sale.salesTax || sale.tax || 0) > 0 && (
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 2 }}>
            <Text style={{ fontSize: 13, color: gray(0.45) }}>Tax</Text>
            <Text style={{ fontSize: 13, color: C.text }}>{"$" + formatCurrencyDisp(sale.salesTax || sale.tax)}</Text>
          </View>
        )}
        <View style={{ height: 1, backgroundColor: gray(0.1), marginVertical: 3 }} />
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: gray(0.4) }}>Total</Text>
          <Text style={{ fontSize: 15, fontWeight: "700", color: C.text }}>{"$" + formatCurrencyDisp(sale.total)}</Text>
        </View>
      </View>

      {/* Payments */}
      {payments.length > 0 && (
        <View style={{ marginTop: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: gray(0.4), marginBottom: 3 }}>PAYMENTS</Text>
          {payments.map((p, idx) => (
            <View key={p.id || idx} style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 2 }}>
              <Text style={{ fontSize: 13, color: gray(0.5) }}>
                {p.method === "cash" ? "Cash" : p.method === "check" ? "Check" : (p.cardType || "Card") + (p.last4 ? " ..." + p.last4 : "")}
              </Text>
              <Text style={{ fontSize: 13, color: C.text }}>{"$" + formatCurrencyDisp(p.amountCaptured)}</Text>
            </View>
          ))}
          {(sale.amountCaptured || 0) > 0 && (
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 2 }}>
              <Text style={{ fontSize: 13, fontWeight: "500", color: gray(0.4) }}>Amount Captured</Text>
              <Text style={{ fontSize: 13, fontWeight: "500", color: C.text }}>{"$" + formatCurrencyDisp(sale.amountCaptured)}</Text>
            </View>
          )}
        </View>
      )}

      {/* Refunds */}
      {hasRefunds && (
        <View style={{ marginTop: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: C.lightred, marginBottom: 3 }}>REFUNDS</Text>
          {refunds.map((r, idx) => (
            <View key={r.id || idx} style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 2 }}>
              <Text style={{ fontSize: 13, color: C.lightred }}>
                {r.notes ? r.notes : "Refund #" + (idx + 1)}
              </Text>
              <Text style={{ fontSize: 13, color: C.lightred }}>{"-$" + formatCurrencyDisp(r.amountRefunded || r.amount)}</Text>
            </View>
          ))}
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 2 }}>
            <Text style={{ fontSize: 13, fontWeight: "500", color: C.lightred }}>Total Refunded</Text>
            <Text style={{ fontSize: 13, fontWeight: "500", color: C.lightred }}>{"-$" + formatCurrencyDisp(sale.amountRefunded)}</Text>
          </View>
        </View>
      )}
    </View>
  );
};

// ─── Note Item ──────────────────────────────────────────────────

const NoteItem = ({ note, color }) => {
  if (!note) return null;
  const text = typeof note === "string" ? note : note.text || note.note || "";
  const millis = note.millis || note.timestamp || null;
  const user = note.user || note.userName || "";
  if (!text) return null;
  return (
    <View style={{ marginBottom: 5, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: color }}>
      <Text style={{ fontSize: 11, color: C.text }}>{text}</Text>
      {(!!millis || !!user) && (
        <Text style={{ fontSize: 9, color: gray(0.4), marginTop: 1 }}>
          {[user, millis ? formatMillisForDisplay(millis) : ""].filter(Boolean).join(" - ")}
        </Text>
      )}
    </View>
  );
};

// ─── Change Log Entry ───────────────────────────────────────────

function formatShortDate(millis) {
  const d = new Date(millis);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = d.getDate();
  const suffix = day === 1 || day === 21 || day === 31 ? "st" : day === 2 || day === 22 ? "nd" : day === 3 || day === 23 ? "rd" : "th";
  let hours = d.getHours();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  const mins = d.getMinutes().toString().padStart(2, "0");
  return days[d.getDay()] + ", " + months[d.getMonth()] + " " + day + suffix + ", '" + String(d.getFullYear()).slice(2) + " -- " + hours + ":" + mins + " " + ampm;
}

const ChangeLogEntry = ({ entry, index }) => {
  if (!entry) return null;
  const message = entry.message || entry.text || JSON.stringify(entry);
  const millis = entry.millis || entry.timestamp || null;
  const user = entry.user || entry.userName || "";
  const isAlt = index % 2 === 1;
  return (
    <View style={{ marginBottom: 4, paddingLeft: 8, paddingVertical: 4, paddingRight: 6, borderLeftWidth: 2, borderLeftColor: gray(0.15), backgroundColor: isAlt ? gray(0.06) : "transparent", borderRadius: isAlt ? 4 : 0 }}>
      <Text style={{ fontSize: 10, color: isAlt ? gray(0.45) : gray(0.5) }}>{message}</Text>
      {(!!millis || !!user) && (
        <Text style={{ fontSize: 9, color: isAlt ? gray(0.3) : gray(0.35), marginTop: 1 }}>
          {[user, millis ? formatShortDate(millis) : ""].filter(Boolean).join(" - ")}
        </Text>
      )}
    </View>
  );
};

// ─── Main Modal ─────────────────────────────────────────────────

export const ClosedWorkorderModal = ({ workorder, onClose }) => {
  const statuses = useSettingsStore((s) => s.settings?.statuses) || [];
  const taxPercent = useSettingsStore((s) => s.settings?.salesTaxPercent) || 0;

  const [sSales, _sSetSales] = useState([]);
  const [sLoadingSales, _sSetLoadingSales] = useState(false);
  const [sShowChangeLog, _sSetShowChangeLog] = useState(false);

  // Fetch associated sales when workorder opens
  useEffect(() => {
    if (!workorder) { _sSetSales([]); return; }
    const saleIDs = [];
    if (workorder.activeSaleID) saleIDs.push(workorder.activeSaleID);
    if (workorder.saleID && !saleIDs.includes(workorder.saleID)) saleIDs.push(workorder.saleID);
    if (saleIDs.length === 0) { _sSetSales([]); return; }

    _sSetLoadingSales(true);
    Promise.all(saleIDs.map((id) => dbGetCompletedSale(id)))
      .then((results) => _sSetSales(results.filter(Boolean)))
      .finally(() => _sSetLoadingSales(false));
  }, [workorder?.id]);

  if (!workorder) return null;

  const isClosed = !!workorder.paymentComplete;
  const rs = resolveStatus(workorder.status, statuses);
  const totals = calculateRunningTotals(workorder, taxPercent, [], false, !!workorder.taxFree);
  const lines = workorder.workorderLines || [];
  const internalNotes = workorder.internalNotes || [];
  const customerNotes = workorder.customerNotes || [];
  const changeLog = workorder.changeLog || [];
  const mediaCount = workorder.media?.length || 0;

  const customerName = (
    capitalizeFirstLetterOfString(workorder.customerFirst || "") +
    " " +
    capitalizeFirstLetterOfString(workorder.customerLast || "")
  ).trim();

  function handleClose() {
    onClose && onClose();
  }

  function handleRefund(saleID) {
    handleClose();
    useCheckoutStore.getState().setStringOnly(saleID);
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
            width: "70%",
            height: "90%",
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
              {/* Status badge */}
              <View
                style={{
                  backgroundColor: rs.backgroundColor,
                  paddingHorizontal: 14,
                  paddingVertical: 4,
                  borderRadius: 10,
                }}
              >
                <Text style={{ color: rs.textColor, fontSize: 12, fontWeight: "600" }}>
                  {rs.label}
                </Text>
              </View>
              {!!workorder.workorderNumber && (
                <Text style={{ fontSize: 13, fontWeight: "600", color: C.text, marginLeft: 12 }}>
                  {"#" + workorder.workorderNumber}
                </Text>
              )}
              <Text style={{ fontSize: 10, color: gray(0.35), marginLeft: 12 }}>
                {"ID: " + workorder.id}
              </Text>
              {!!workorder._importSource && (
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
                    {workorder._importSource}
                  </Text>
                </View>
              )}
              {!!workorder.taxFree && (
                <View
                  style={{
                    backgroundColor: lightenRGBByPercent(C.orange, 60),
                    paddingHorizontal: 6,
                    paddingVertical: 1,
                    borderRadius: 8,
                    marginLeft: 8,
                  }}
                >
                  <Text style={{ fontSize: 9, fontWeight: "600", color: C.orange }}>TAX FREE</Text>
                </View>
              )}
            </View>
            <Button_
              text="Close"
              colorGradientArr={COLOR_GRADIENTS.red}
              onPress={handleClose}
              buttonStyle={{ paddingHorizontal: 16, height: 32 }}
              textStyle={{ color: C.textWhite, fontSize: 12 }}
            />
          </View>

          {/* ── Active / Closed Banner ── */}
          <View
            style={{
              backgroundColor: isClosed ? lightenRGBByPercent(C.lightred, 55) : lightenRGBByPercent(C.green, 55),
              paddingVertical: 8,
              paddingHorizontal: 20,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <View
              style={{
                backgroundColor: rs.backgroundColor,
                paddingHorizontal: 14,
                paddingVertical: 5,
                borderRadius: 8,
                marginRight: 12,
              }}
            >
              <Text style={{ color: rs.textColor, fontSize: 13, fontWeight: "600" }}>
                {rs.label}
              </Text>
            </View>
            <Text
              style={{
                fontSize: 16,
                fontWeight: "700",
                color: isClosed ? C.lightred : C.green,
                letterSpacing: 1,
              }}
            >
              {isClosed ? "CLOSED WORKORDER" : "ACTIVE WORKORDER"}
            </Text>
          </View>

          {/* ── Body: two columns ── */}
          <View style={{ flex: 1, flexDirection: "row", padding: 20 }}>
            {/* ── Left column: workorder details ── */}
            <ScrollView style={{ flex: 1, paddingRight: 20 }}>
              {/* Customer */}
              <SectionHeader text="CUSTOMER" />
              <DetailRow label="Name" value={customerName || null} labelSize={13} valueSize={14} />
              {!!workorder.customerCell && (
                <DetailRow label="Phone" value={formatPhoneWithDashes(workorder.customerCell)} labelSize={13} valueSize={14} />
              )}
              {!!workorder.customerLandline && (
                <DetailRow label="Landline" value={formatPhoneWithDashes(workorder.customerLandline)} labelSize={13} valueSize={14} />
              )}
              {!!workorder.customerEmail && (
                <DetailRow label="Email" value={workorder.customerEmail} labelSize={13} valueSize={14} />
              )}
              {!!workorder.customerContactRestriction && (
                <DetailRow label="Contact Pref" value={workorder.customerContactRestriction} labelSize={13} valueSize={14} />
              )}

              {/* Bike */}
              <SectionHeader text="BIKE" />
              <DetailRow label="Brand" value={workorder.brand} labelSize={13} valueSize={14} />
              <DetailRow label="Model" value={workorder.description || workorder.model} labelSize={13} valueSize={14} />

              {/* Colors */}
              {(!!workorder.color1?.label || !!workorder.color2?.label) && (
                <View style={{ flexDirection: "row", marginBottom: 6, alignItems: "center" }}>
                  <Text style={{ fontSize: 13, color: gray(0.4), width: 110 }}>Colors</Text>
                  {!!workorder.color1?.label && (
                    <Text
                      style={{
                        fontSize: 12,
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 100,
                        backgroundColor: workorder.color1.backgroundColor,
                        color: workorder.color1.textColor,
                      }}
                    >
                      {workorder.color1.label}
                    </Text>
                  )}
                  {!!workorder.color2?.label && (
                    <Text
                      style={{
                        fontSize: 12,
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 100,
                        backgroundColor: workorder.color2.backgroundColor,
                        color: workorder.color2.textColor,
                        marginLeft: 4,
                      }}
                    >
                      {workorder.color2.label}
                    </Text>
                  )}
                </View>
              )}

              {/* Dates */}
              <SectionHeader text="DATES" />
              <DetailRow
                label="Started"
                labelSize={13}
                valueSize={14}
                value={
                  workorder.startedOnMillis
                    ? formatMillisForDisplay(workorder.startedOnMillis, true)
                    : null
                }
              />
              <DetailRow
                label="Finished"
                labelSize={13}
                valueSize={14}
                value={
                  workorder.finishedOnMillis
                    ? formatMillisForDisplay(workorder.finishedOnMillis, true)
                    : null
                }
              />
              <DetailRow
                label="Ended"
                labelSize={13}
                valueSize={14}
                value={
                  workorder.endedOnMillis
                    ? formatMillisForDisplay(workorder.endedOnMillis, true)
                    : null
                }
              />
              <DetailRow label="Started By" value={workorder.startedBy} labelSize={13} valueSize={14} />

              {/* Service */}
              <SectionHeader text="SERVICE" />
              {!!workorder.waitTime?.label && (
                <DetailRow label="Wait Time" value={workorder.waitTime.label} />
              )}
              {!!workorder.waitTimeEstimateLabel && (
                <DetailRow label="Estimate" value={workorder.waitTimeEstimateLabel} />
              )}
              {!!workorder.partOrdered && (
                <DetailRow label="Part Ordered" value={workorder.partOrdered} />
              )}
              {!!workorder.partSource && (
                <DetailRow label="Part Source" value={workorder.partSource} />
              )}
              {!!workorder.partOrderedMillis && (
                <DetailRow
                  label="Part Order Date"
                  value={formatMillisForDisplay(workorder.partOrderedMillis, true)}
                />
              )}
              {!!workorder.partOrderEstimateMillis && (
                <DetailRow
                  label="Part ETA"
                  value={formatMillisForDisplay(workorder.partOrderEstimateMillis, true)}
                />
              )}

              {/* Payment status */}
              {workorder.paymentComplete && (
                <DetailRow
                  label="Payment"
                  value={"Paid - $" + formatCurrencyDisp(workorder.amountPaid)}
                  valueColor={C.green}
                  valueStyle={{ fontWeight: "600" }}
                />
              )}
              {!workorder.paymentComplete && (workorder.amountPaid || 0) > 0 && (
                <DetailRow
                  label="Partial Paid"
                  value={"$" + formatCurrencyDisp(workorder.amountPaid)}
                  valueColor={C.orange}
                  valueStyle={{ fontWeight: "600" }}
                />
              )}

              {/* Media */}
              {mediaCount > 0 && (
                <DetailRow label="Media" value={mediaCount + " item" + (mediaCount > 1 ? "s" : "")} />
              )}

              {/* Tax free note */}
              {!!workorder.taxFree && !!workorder.taxFreeReceiptNote && (
                <DetailRow label="Tax Free Note" value={workorder.taxFreeReceiptNote} valueColor={C.orange} />
              )}

              {/* Internal Notes */}
              {internalNotes.length > 0 && (
                <View>
                  <SectionHeader text={"INTERNAL NOTES (" + internalNotes.length + ")"} />
                  {internalNotes.map((note, idx) => (
                    <NoteItem key={idx} note={note} color={C.blue} />
                  ))}
                </View>
              )}

              {/* Customer Notes */}
              {customerNotes.length > 0 && (
                <View>
                  <SectionHeader text={"CUSTOMER NOTES (" + customerNotes.length + ")"} />
                  {customerNotes.map((note, idx) => (
                    <NoteItem key={idx} note={note} color={C.green} />
                  ))}
                </View>
              )}

              {/* Change Log */}
              {changeLog.length > 0 && (
                <View>
                  <TouchableOpacity
                    onPress={() => _sSetShowChangeLog(!sShowChangeLog)}
                    style={{ flexDirection: "row", alignItems: "center", marginTop: 14, marginBottom: 6 }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: "600", color: gray(0.4), letterSpacing: 0.5 }}>
                      {"CHANGE LOG (" + changeLog.length + ")"}
                    </Text>
                    <Text style={{ fontSize: 10, color: gray(0.35), marginLeft: 6 }}>
                      {sShowChangeLog ? "Hide" : "Show"}
                    </Text>
                  </TouchableOpacity>
                  {sShowChangeLog && changeLog.map((entry, idx) => (
                    <ChangeLogEntry key={idx} entry={entry} index={idx} />
                  ))}
                </View>
              )}

              {/* Bottom spacer */}
              <View style={{ height: 20 }} />
            </ScrollView>

            {/* ── Vertical divider ── */}
            <View style={{ width: 1, backgroundColor: gray(0.1), marginHorizontal: 5 }} />

            {/* ── Right column: line items + totals + sales ── */}
            <View style={{ flex: 1, paddingLeft: 15 }}>
              {/* Line items */}
              <SectionHeader text={"ITEMS (" + lines.length + ")"} />
              <FlatList
                data={lines}
                keyExtractor={(item, idx) => item.id || String(idx)}
                style={{ flex: 1 }}
                renderItem={({ item }) => {
                  const inv = item.inventoryItem || {};
                  const name = inv.formalName || inv.informalName || "Item";
                  const price = item.useSalePrice ? (inv.salePrice || inv.price || 0) : (inv.price || 0);
                  const hasDiscount = !!item.discountObj?.name;

                  return (
                    <View
                      style={{
                        marginBottom: 6,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: gray(0.1),
                        backgroundColor: C.listItemWhite,
                        paddingVertical: 6,
                        paddingHorizontal: 10,
                      }}
                    >
                      {/* Qty x Name + Price */}
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <Text style={{ fontSize: 14, color: C.text, flex: 1 }} numberOfLines={1}>
                          <Text style={{ fontWeight: "600" }}>{item.qty + "x  "}</Text>
                          {name}
                        </Text>
                        <Text
                          style={{
                            fontSize: 13,
                            color: hasDiscount ? C.lightred : C.text,
                            textDecorationLine: hasDiscount ? "line-through" : "none",
                          }}
                        >
                          {"$" + formatCurrencyDisp(price * item.qty)}
                        </Text>
                      </View>

                      {/* Discount info */}
                      {hasDiscount && (
                        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 2 }}>
                          <Text style={{ fontSize: 11, color: C.lightred }}>
                            {item.discountObj.name}
                          </Text>
                          <Text style={{ fontSize: 13, color: C.green, fontWeight: "500" }}>
                            {"$" + formatCurrencyDisp(item.discountObj.newPrice * item.qty)}
                          </Text>
                        </View>
                      )}

                      {/* Warranty */}
                      {!!item.warranty && (
                        <Text style={{ fontSize: 11, color: C.blue, marginTop: 2 }}>Warranty</Text>
                      )}

                      {/* Intake notes */}
                      {!!item.intakeNotes && (
                        <Text style={{ fontSize: 12, color: C.orange, marginTop: 3 }}>
                          {"Intake: " + item.intakeNotes}
                        </Text>
                      )}

                      {/* Receipt notes */}
                      {!!item.receiptNotes && (
                        <Text style={{ fontSize: 12, color: C.green, marginTop: 2 }}>
                          {"Receipt: " + item.receiptNotes}
                        </Text>
                      )}
                    </View>
                  );
                }}
              />

              {/* Totals */}
              <View
                style={{
                  marginTop: 8,
                  borderTopWidth: 1,
                  borderTopColor: gray(0.1),
                  paddingTop: 8,
                }}
              >
                <TotalRow label="Subtotal" value={totals.runningSubtotal} />
                {totals.runningDiscount > 0 && (
                  <TotalRow label="Discount" value={totals.runningDiscount} isNegative />
                )}
                {!!totals.runningTax && <TotalRow label="Tax" value={totals.runningTax} />}
                <View style={{ height: 1, backgroundColor: gray(0.15), marginVertical: 4 }} />
                <TotalRow label="Total" value={totals.finalTotal} bold />
              </View>

              {/* ── Sales Summary ── */}
              <SectionHeader text={"SALES (" + sSales.length + ")"} />
              {sLoadingSales ? (
                <Text style={{ fontSize: 11, color: gray(0.4), fontStyle: "italic" }}>Loading sales...</Text>
              ) : sSales.length > 0 ? (
                <ScrollView style={{ flex: 1, maxHeight: 300 }}>
                  {sSales.map((sale) => (
                    <SaleCard key={sale.id} sale={sale} onRefund={handleRefund} />
                  ))}
                </ScrollView>
              ) : (
                <Text style={{ fontSize: 11, color: gray(0.3), fontStyle: "italic" }}>
                  No associated sales
                </Text>
              )}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};
