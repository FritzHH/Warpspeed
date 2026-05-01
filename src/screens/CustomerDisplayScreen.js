/* eslint-disable */
import { View, Text, ScrollView, Image, TouchableOpacity } from "react-native-web";
import { useState, useEffect } from "react";
import {
  onDisplayMessage,
  DISPLAY_MSG_TYPES,
  onTranslateMessage,
  TRANSLATE_MSG_TYPES,
  broadcastDisplayStatus,
  onDisplayStatusMessage,
  DISPLAY_STATUS,
} from "../broadcastChannel";
import { formatCurrencyDisp, formatPhoneForDisplay, gray, capitalizeFirstLetterOfString } from "../utils";
import { C, Fonts, ICONS } from "../styles";

const logo = require("../resources/default_app_logo_large.png");

const DEV_SHOW_OVERLAY = false;

////////////////////////////////////////////////////////////////////////////////
// Translation dictionary
////////////////////////////////////////////////////////////////////////////////
const TRANSLATIONS = {
  English: {
    greeting: "Hi",
    inProgress: "In Progress",
    checkedIn: "Checked in",
    items: "Items",
    subtotal: "Subtotal",
    discounts: "Discounts",
    tax: "Tax",
    total: "Total",
    paid: "Paid",
    balanceDue: "Balance Due",
    paidBadge: "PAID",
    checkout: "Checkout",
    totalDiscounts: "Total Discounts",
    salesTax: "Sales Tax",
    cardFee: "Card Fee",
    totalColon: "Total:",
    remaining: "Remaining",
    fullScreen: "Full-Screen",
  },
  Spanish: {
    greeting: "Hola",
    inProgress: "En Progreso",
    checkedIn: "Registrado",
    items: "Artículos",
    subtotal: "Subtotal",
    discounts: "Descuentos",
    tax: "Impuesto",
    total: "Total",
    paid: "Pagado",
    balanceDue: "Saldo Pendiente",
    paidBadge: "PAGADO",
    checkout: "Pago",
    totalDiscounts: "Descuentos Totales",
    salesTax: "Impuesto de Venta",
    cardFee: "Cargo por Tarjeta",
    totalColon: "Total:",
    remaining: "Restante",
    fullScreen: "Pantalla Completa",
  },
  French: {
    greeting: "Bonjour",
    inProgress: "En Cours",
    checkedIn: "Enregistré",
    items: "Articles",
    subtotal: "Sous-total",
    discounts: "Remises",
    tax: "Taxe",
    total: "Total",
    paid: "Payé",
    balanceDue: "Solde Dû",
    paidBadge: "PAYÉ",
    checkout: "Paiement",
    totalDiscounts: "Remises Totales",
    salesTax: "Taxe de Vente",
    cardFee: "Frais de Carte",
    totalColon: "Total :",
    remaining: "Restant",
    fullScreen: "Plein Écran",
  },
  Creole: {
    greeting: "Bonjou",
    inProgress: "An Pwogre",
    checkedIn: "Anrejistre",
    items: "Atik",
    subtotal: "Sou-total",
    discounts: "Rabè",
    tax: "Taks",
    total: "Total",
    paid: "Peye",
    balanceDue: "Balans Dwe",
    paidBadge: "PEYE",
    checkout: "Peman",
    totalDiscounts: "Total Rabè",
    salesTax: "Taks sou Lavant",
    cardFee: "Frè Kat",
    totalColon: "Total:",
    remaining: "Rès",
    fullScreen: "Plen Ekran",
  },
};

function t(lang, key) {
  return (TRANSLATIONS[lang] || TRANSLATIONS.English)[key] || TRANSLATIONS.English[key];
}

////////////////////////////////////////////////////////////////////////////////
// Shared sub-components
////////////////////////////////////////////////////////////////////////////////
const textColor = gray(0.7);
const discountTextColor = C.red;

function OverlayLineItemRow({ item }) {
  let name = item.inventoryItem?.formalName || "Item";
  let qty = item.qty || 1;
  let unitPrice = item.inventoryItem?.price || 0;
  let hasDiscount = item.discountObj && item.discountObj.savings > 0;
  let regularTotal = unitPrice * qty;
  let discountedTotal = hasDiscount ? (item.discountObj.newPrice || 0) * qty : regularTotal;
  let savingsTotal = hasDiscount ? (item.discountObj.savings || 0) * qty : 0;


  return (
    <View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 12,
          paddingHorizontal: 20,
        }}
      >
      <Text
        style={{
          fontSize: 18,
          color: textColor,
          width: 30,
        }}
      >
        {qty}
      </Text>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 18,
            color: textColor,
          }}
          numberOfLines={1}
        >
          {name}
        </Text>
        {hasDiscount && (
          <Text style={{ fontSize: 13, color: discountTextColor }}>
            {item.discountObj.name}
          </Text>
        )}
      </View>
      <View style={{ alignItems: "flex-end", marginLeft: 12 }}>
        {hasDiscount ? (
          <>
            <Text
              style={{
                fontSize: 14,
                color: textColor,
                textDecorationLine: "line-through",
              }}
            >
              ${formatCurrencyDisp(regularTotal)}
            </Text>
            <Text style={{ fontSize: 13, color: discountTextColor }}>
              -${formatCurrencyDisp(savingsTotal)}
            </Text>
            <Text style={{ fontSize: 18, color: textColor }}>
              ${formatCurrencyDisp(discountedTotal)}
            </Text>
          </>
        ) : (
          <Text style={{ fontSize: 18, color: textColor }}>
            ${formatCurrencyDisp(regularTotal)}
          </Text>
        )}
      </View>
      </View>
      <View style={{ height: 1, backgroundColor: "rgba(0,0,0,0.08)", marginHorizontal: 20 }} />
    </View>
  );
}

function OverlayTotalRow({ label, value, bold, color }) {
  let displayValue =
    typeof value === "number" ? "$" + formatCurrencyDisp(value) : value;
  let rowColor = color || textColor;

  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 4,
        paddingHorizontal: 20,
      }}
    >
      <Text
        style={{
          fontSize: bold ? 28 : 18,
          color: rowColor,
          fontWeight: bold ? "700" : "400",
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: bold ? 28 : 18,
          color: rowColor,
          fontWeight: bold ? "700" : "400",
        }}
      >
        {displayValue}
      </Text>
    </View>
  );
}

////////////////////////////////////////////////////////////////////////////////
// Right-side overlay panel (content only — positioning handled by AnimatedOverlay)
////////////////////////////////////////////////////////////////////////////////

function OverlayPanel({ children, header }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "rgba(255,255,255,0.88)",
        justifyContent: "space-between",
      }}
    >
      {/* Header */}
      <View>
        <View
          style={{
            paddingVertical: 14,
            alignItems: "center",
          }}
        >
        <Text
          style={{
            fontSize: 20,
            color: textColor,
            fontWeight: "400",
          }}
        >
          {header}
        </Text>
        </View>
        <View style={{ height: 1, backgroundColor: "rgba(0,0,0,0.08)", marginHorizontal: 20 }} />
      </View>
      {children}
    </View>
  );
}

////////////////////////////////////////////////////////////////////////////////
// Workorder display (overlay)
////////////////////////////////////////////////////////////////////////////////

function CustomerInfoSection({ customer }) {
  if (!customer) return null;
  let name = [customer.first, customer.last].filter(Boolean).join(" ");
  let cell = formatPhoneForDisplay(customer.customerCell);
  let landline = formatPhoneForDisplay(customer.customerLandline);
  let addressParts = [
    [customer.streetAddress, customer.unit].filter(Boolean).join(" "),
    [customer.city, customer.state].filter(Boolean).join(", "),
    customer.zip,
  ].filter(Boolean);

  if (!name && !cell && !landline && !customer.email && !addressParts.length) return null;

  return (
    <View style={{ paddingHorizontal: 20, paddingVertical: 10 }}>
      {!!name && (
        <Text style={{ fontSize: 16, color: textColor, fontWeight: "600", marginBottom: 4 }}>
          {name}
        </Text>
      )}
      {!!cell && (
        <Text style={{ fontSize: 14, color: textColor }}>{cell}</Text>
      )}
      {!!landline && (
        <Text style={{ fontSize: 14, color: textColor }}>{landline}</Text>
      )}
      {!!customer.email && (
        <Text style={{ fontSize: 14, color: textColor }}>{customer.email}</Text>
      )}
      {addressParts.length > 0 && (
        <Text style={{ fontSize: 14, color: textColor, marginTop: 2 }}>
          {addressParts.join(" ")}
        </Text>
      )}
    </View>
  );
}

function IconRow({ icon, children, iconSize = 20 }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 5 }}>
      <Image source={icon} style={{ width: iconSize, height: iconSize, marginRight: 10, opacity: 0.8 }} />
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

function SectionDivider() {
  return <View style={{ height: 1, backgroundColor: C.buttonLightGreenOutline, marginHorizontal: 16, marginVertical: 8 }} />;
}

function ColorPill({ colorObj }) {
  if (!colorObj || !colorObj.label) return null;
  return (
    <View style={{
      backgroundColor: colorObj.backgroundColor || gray(0.15),
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 4,
      marginRight: 8,
    }}>
      <Text style={{ fontSize: 13, fontWeight: "600", color: colorObj.textColor || "#000" }}>
        {colorObj.label}
      </Text>
    </View>
  );
}

function formatDateShort(millis) {
  if (!millis) return "";
  let d = new Date(Number(millis));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function WorkorderOverlay({ data, isTall, lang }) {
  let lines = data?.workorderLines || [];
  let totals = data?.totals || {};
  let status = data?.status || {};
  let customer = data?.customer || {};
  let customerFirst = data?.customerFirst || "";
  let amountPaid = data?.amountPaid || 0;
  let paymentComplete = data?.paymentComplete || false;
  let hasColors = (data?.color1 && data.color1.label) || (data?.color2 && data.color2.label);
  let bikeDesc = [data?.brand, data?.description].filter(Boolean).join(" - ");
  let customerNotes = data?.customerNotes || [];
  let hasCustomer = !!customerFirst || customer.customerCell || customer.customerLandline || customer.email;
  let greetingName = customerFirst ? capitalizeFirstLetterOfString(customerFirst) : "";

  return (
    <View style={{ flex: 1, flexDirection: "row" }}>
      {/* LEFT PANEL - Bike Info & Customer */}
      <View style={{
        width: hasCustomer ? "38%" : "0%",
        backgroundColor: "rgba(240, 248, 255, 0.95)",
        borderRightWidth: hasCustomer ? 1 : 0,
        borderRightColor: "rgba(0,0,0,0.08)",
        justifyContent: "space-between",
        overflow: "hidden",
      }}>
        <View>
          {/* Greeting */}
          <View style={{
            paddingHorizontal: 16,
            paddingTop: 18,
            paddingBottom: 10,
            backgroundColor: "rgba(64, 174, 113, 0.12)",
          }}>
            <Text style={{ fontSize: isTall ? 26 : 22, fontWeight: "700", color: C.text }}>
              {greetingName ? t(lang, "greeting") + " " + greetingName + "!" : t(lang, "greeting") + "!"}
            </Text>
          </View>

          {/* Customer contact info */}
          {(customer.customerCell || customer.customerLandline || customer.email) && (
            <View style={{ paddingHorizontal: 16, paddingVertical: 6 }}>
              {!!customer.customerCell && (
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                  <Image source={ICONS.cellPhone} style={{ width: 14, height: 14, marginRight: 8, opacity: 0.5 }} />
                  <Text style={{ fontSize: 15, color: C.text }}>{formatPhoneForDisplay(customer.customerCell)}</Text>
                </View>
              )}
              {!!customer.customerLandline && (
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                  <Image source={ICONS.cellPhone} style={{ width: 14, height: 14, marginRight: 8, opacity: 0.5 }} />
                  <Text style={{ fontSize: 15, color: C.text }}>{formatPhoneForDisplay(customer.customerLandline)}</Text>
                </View>
              )}
              {!!customer.email && (
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Image source={ICONS.paperPlane} style={{ width: 14, height: 14, marginRight: 8, opacity: 0.5 }} />
                  <Text style={{ fontSize: 14, color: C.text }}>{customer.email}</Text>
                </View>
              )}
            </View>
          )}

          <SectionDivider />

          {/* Bike info */}
          {!!bikeDesc && (
            <IconRow icon={ICONS.bicycle} iconSize={22}>
              <Text style={{ fontSize: 17, color: C.text, fontWeight: "500" }} numberOfLines={2}>
                {bikeDesc}
              </Text>
            </IconRow>
          )}

          {/* Color swatches */}
          {hasColors && (
            <IconRow icon={ICONS.colorWheel} iconSize={18}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <ColorPill colorObj={data.color1} />
                <ColorPill colorObj={data.color2} />
              </View>
            </IconRow>
          )}

          {/* Customer notes */}
          {customerNotes.length > 0 && (
            <View>
              <SectionDivider />
              <View style={{ paddingHorizontal: 16, paddingVertical: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                  <Image source={ICONS.notes} style={{ width: 18, height: 18, marginRight: 8, opacity: 0.6 }} />
                  <Text style={{ fontSize: 14, fontWeight: "600", color: gray(0.5) }}>Notes</Text>
                </View>
                <ScrollView style={{ maxHeight: 140 }}>
                  {customerNotes.map((note, i) => (
                    <View key={i} style={{
                      backgroundColor: "rgba(255, 243, 176, 0.5)",
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      marginBottom: 4,
                    }}>
                      <Text style={{ fontSize: 13, color: C.text }}>{note.value}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            </View>
          )}
        </View>

        {/* Wait time + Date at bottom of left panel */}
        {(!!data?.waitTimeEstimateLabel || !!data?.startedOnMillis) && (
          <View style={{ paddingBottom: 12 }}>
            <SectionDivider />
            {!!data.waitTimeEstimateLabel && (
              <IconRow icon={ICONS.clock} iconSize={18}>
                <Text style={{ fontSize: 15, color: C.text }}>{data.waitTimeEstimateLabel}</Text>
              </IconRow>
            )}
            {!!data.startedOnMillis && (
              <IconRow icon={ICONS.workorder} iconSize={16}>
                <Text style={{ fontSize: 13, color: gray(0.5) }}>
                  {t(lang, "checkedIn") + " " + formatDateShort(data.startedOnMillis)}
                </Text>
              </IconRow>
            )}
          </View>
        )}
      </View>

      {/* RIGHT PANEL - Workorder Lines & Totals */}
      <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.95)", justifyContent: "space-between" }}>
        {/* Items header */}
        <View style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 20,
          paddingVertical: 10,
          backgroundColor: "rgba(64, 174, 113, 0.08)",
        }}>
          <Image source={ICONS.tools1} style={{ width: 22, height: 22, marginRight: 10, opacity: 0.8 }} />
          <Text style={{ fontSize: 18, fontWeight: "700", color: C.green }}>
            {t(lang, "items")}
          </Text>
          <Text style={{ fontSize: 15, color: gray(0.4), marginLeft: 8 }}>
            {"(" + (totals.runningQty || lines.length) + ")"}
          </Text>
        </View>

        {/* Scrollable items list */}
        <ScrollView style={{ flex: 1 }}>
          {lines.map((line, i) => (
            <View key={line.id || i} style={{ backgroundColor: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.02)" }}>
              <OverlayLineItemRow item={line} />
              {!!line.receiptNotes && (
                <View style={{ paddingHorizontal: 50, paddingBottom: 8 }}>
                  <Text style={{ fontSize: 13, color: gray(0.45), fontStyle: "italic" }}>
                    {line.receiptNotes}
                  </Text>
                </View>
              )}
            </View>
          ))}
        </ScrollView>

        {/* Totals section */}
        {lines.length > 0 && (
          <View style={{ paddingVertical: 10, borderTopWidth: 2, borderTopColor: C.buttonLightGreenOutline }}>
            <OverlayTotalRow label={t(lang, "subtotal")} value={totals.runningSubtotal || 0} />
            {(totals.runningDiscount || 0) > 0 && (
              <OverlayTotalRow
                label={t(lang, "discounts")}
                value={"-$" + formatCurrencyDisp(totals.runningDiscount)}
                color={discountTextColor}
              />
            )}
            <OverlayTotalRow
              label={t(lang, "tax") + " (" + (totals.salesTaxPercent || 0) + "%)"}
              value={totals.runningTax || 0}
            />
            <View style={{ height: 2, backgroundColor: "rgba(0,0,0,0.12)", marginHorizontal: 20, marginVertical: 6 }} />
            <OverlayTotalRow label={t(lang, "total")} value={totals.runningTotal || 0} bold />

            {amountPaid > 0 && !paymentComplete && (
              <>
                <OverlayTotalRow label={t(lang, "paid")} value={amountPaid} color={C.green} />
                <OverlayTotalRow label={t(lang, "balanceDue")} value={(totals.runningTotal || 0) - amountPaid} bold />
              </>
            )}

            {paymentComplete && (
              <View style={{
                backgroundColor: C.green,
                borderRadius: 8,
                paddingVertical: 10,
                marginHorizontal: 20,
                marginTop: 8,
                alignItems: "center",
              }}>
                <Text style={{ fontSize: 22, fontWeight: "800", color: "#fff", letterSpacing: 2 }}>
                  {t(lang, "paidBadge")}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

////////////////////////////////////////////////////////////////////////////////
// Sale display (overlay)
////////////////////////////////////////////////////////////////////////////////

function SaleOverlay({ data, lang }) {
  let sale = data?.sale || {};
  let allLines = [];

  (data?.combinedWorkorders || []).forEach((wo) => {
    (wo.workorderLines || []).forEach((line) => {
      allLines.push(line);
    });
  });

  let hasDiscount = (sale.discount || 0) > 0;
  let hasCardFee = (sale.cardFee || 0) > 0;
  let amountRemaining = (sale.total || 0) - (sale.amountCaptured || 0);
  if (amountRemaining < 0) amountRemaining = 0;

  return (
    <OverlayPanel header={t(lang, "checkout")}>
      <ScrollView style={{ flex: 1 }}>
        {allLines.map((line, i) => (
          <OverlayLineItemRow key={line.id || i} item={line} />
        ))}
      </ScrollView>

      <View style={{ paddingVertical: 12 }}>
        <View style={{ height: 1, backgroundColor: "rgba(0,0,0,0.12)", marginHorizontal: 20, marginBottom: 12 }} />
        <OverlayTotalRow label={t(lang, "subtotal")} value={sale.subtotal || 0} />

        {hasDiscount && (
          <OverlayTotalRow
            label={t(lang, "totalDiscounts")}
            value={`-$${formatCurrencyDisp(sale.discount)}`}
            color={discountTextColor}
          />
        )}

        <OverlayTotalRow label={t(lang, "salesTax") + " (" + (sale.taxRate || "") + "%)"} value={sale.salesTax || sale.tax || 0} />

        {hasCardFee && (
          <OverlayTotalRow
            label={t(lang, "cardFee") + " (" + (sale.cardFeePercent || 0) + "%)"}
            value={sale.cardFee}
          />
        )}

        <View style={{ height: 8, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.12)", marginHorizontal: 20 }} />
        <View style={{ height: 8 }} />
        <OverlayTotalRow label={t(lang, "totalColon")} value={sale.total || 0} bold />

        {sale.amountCaptured > 0 && !sale.paymentComplete && (
          <View style={{ marginTop: 8, paddingHorizontal: 20 }}>
            <OverlayTotalRow
              label={t(lang, "paid")}
              value={sale.amountCaptured}
            />
            <OverlayTotalRow
              label={t(lang, "remaining")}
              value={amountRemaining}
            />
          </View>
        )}

        {sale.paymentComplete && (
          <View
            style={{
              marginTop: 12,
              marginHorizontal: 20,
              alignItems: "center",
              backgroundColor: C.green,
              borderRadius: 8,
              paddingVertical: 12,
            }}
          >
            <Text style={{ fontSize: 24, fontWeight: "600", color: "white" }}>
              {t(lang, "paidBadge")}
            </Text>
          </View>
        )}
      </View>
    </OverlayPanel>
  );
}

////////////////////////////////////////////////////////////////////////////////
// Translate display
////////////////////////////////////////////////////////////////////////////////

function TranslateDisplay({ text }) {
  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgb(30,30,30)",
        justifyContent: "center",
        alignItems: "center",
        padding: 40,
      }}
    >
      <Text
        style={{
          fontSize: 48,
          color: C.textWhite,
          fontWeight: Fonts.weight.textHeavy,
          textAlign: "center",
          lineHeight: 64,
          width: "80%",
          textTransform: "capitalize",
        }}
      >
        {text}
      </Text>
    </View>
  );
}

////////////////////////////////////////////////////////////////////////////////
// Main display screen
////////////////////////////////////////////////////////////////////////////////

export function CustomerDisplayScreen() {
  document.title = "Customer Screen";
  const [sDisplayData, _setDisplayData] = useState(null);
  const [sType, _setType] = useState(null);
  const [sTranslateText, _setTranslateText] = useState("");
  // "hidden" | "visible" | "exiting" — controls slide animation lifecycle
  const [sOverlayPhase, _setOverlayPhase] = useState("hidden");
  const [sOverlayKey, _setOverlayKey] = useState(0);
  // Aspect ratio detection — tall/skinny vs wide layout
  const [sIsTall, _setIsTall] = useState(window.innerHeight > window.innerWidth);
  const [sIsFullscreen, _setIsFullscreen] = useState(!!document.fullscreenElement);

  useEffect(() => {
    const unsubDisplay = onDisplayMessage((msg) => {
      if (msg.type === DISPLAY_MSG_TYPES.CLEAR) {
        _setDisplayData(null);
        _setType(null);
      } else {
        _setDisplayData(msg.payload);
        _setType(msg.type);
      }
    });
    const unsubTranslate = onTranslateMessage((msg) => {
      if (msg.type === TRANSLATE_MSG_TYPES.CLEAR) {
        _setTranslateText("");
      } else if (msg.type === TRANSLATE_MSG_TYPES.TRANSLATE) {
        _setTranslateText(msg.payload.translatedText || "");
      }
    });
    function handleResize() {
      _setIsTall(window.innerHeight > window.innerWidth);
    }
    function writeDisplayHeartbeat() {
      localStorage.setItem("warpspeed_display_heartbeat", JSON.stringify({
        open: true,
        fullscreen: !!document.fullscreenElement,
        timestamp: Date.now(),
      }));
    }
    function handleFullscreenChange() {
      let isFs = !!document.fullscreenElement;
      _setIsFullscreen(isFs);
      writeDisplayHeartbeat();
      broadcastDisplayStatus(isFs ? DISPLAY_STATUS.FULLSCREEN : DISPLAY_STATUS.WINDOWED);
    }
    function handleVisibilityChange() {
      broadcastDisplayStatus(
        document.visibilityState === "visible" ? DISPLAY_STATUS.VISIBLE : DISPLAY_STATUS.HIDDEN
      );
    }
    function handleBeforeUnload() {
      localStorage.removeItem("warpspeed_display_heartbeat");
      broadcastDisplayStatus(DISPLAY_STATUS.CLOSED);
    }
    function handleWindowBlur() {
      let isFs = !!document.fullscreenElement;
      console.log("[CustomerDisplay] window lost focus — possibly obscured by another window | fullscreen:", isFs);
      if (!isFs) {
        console.log("[CustomerDisplay] WARNING: display is NOT in full-screen mode");
      }
    }
    function handleWindowFocus() {
      let isFs = !!document.fullscreenElement;
      console.log("[CustomerDisplay] window regained focus | fullscreen:", isFs);
    }
    // Respond to PING from main screen
    let unsubStatus = onDisplayStatusMessage((msg) => {
      if (msg.status === DISPLAY_STATUS.PING) {
        broadcastDisplayStatus(
          document.visibilityState === "visible" ? DISPLAY_STATUS.VISIBLE : DISPLAY_STATUS.HIDDEN
        );
      }
    });
    // Broadcast that display window is open
    writeDisplayHeartbeat();
    let heartbeatInterval = setInterval(writeDisplayHeartbeat, 2000);
    broadcastDisplayStatus(DISPLAY_STATUS.OPEN);
    window.addEventListener("resize", handleResize);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("focus", handleWindowFocus);
    let lastClickTime = 0;
    function handleClick(e) {
      let now = Date.now();
      let gap = now - lastClickTime;
      console.log("[CustomerDisplay] click captured on:", e.target.tagName, "| gap:", gap, "ms | fullscreen:", !!document.fullscreenElement);
      if (gap > 0 && gap < 750) {
        lastClickTime = 0;
        if (document.fullscreenElement) {
          console.log("[CustomerDisplay] double-click detected, exiting fullscreen...");
          document.exitFullscreen()
            .then(() => console.log("[CustomerDisplay] exit fullscreen SUCCESS"))
            .catch((err) => console.log("[CustomerDisplay] exit fullscreen FAILED:", err.message));
        } else {
          console.log("[CustomerDisplay] double-click detected, requesting fullscreen...");
          document.documentElement.requestFullscreen()
            .then(() => console.log("[CustomerDisplay] fullscreen SUCCESS"))
            .catch((err) => console.log("[CustomerDisplay] fullscreen FAILED:", err.message));
        }
      } else {
        lastClickTime = now;
      }
    }
    console.log("[CustomerDisplay] attaching click listener for double-click fullscreen");
    document.addEventListener("click", handleClick, true);
    return () => {
      clearInterval(heartbeatInterval);
      unsubDisplay();
      unsubTranslate();
      unsubStatus();
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("click", handleClick, true);
    };
  }, []);

  let hasOverlayData =
    !sTranslateText &&
    sDisplayData &&
    (sType === DISPLAY_MSG_TYPES.WORKORDER || sType === DISPLAY_MSG_TYPES.SALE);
  let shouldShowOverlay = hasOverlayData;

  // Slide animation lifecycle — needed for exit animation before unmount
  useEffect(() => {
    if (shouldShowOverlay && sOverlayPhase === "hidden") {
      _setOverlayPhase("visible");
      _setOverlayKey((k) => k + 1);
    } else if (shouldShowOverlay && sOverlayPhase === "exiting") {
      _setOverlayPhase("visible");
      _setOverlayKey((k) => k + 1);
    } else if (!shouldShowOverlay && sOverlayPhase === "visible") {
      _setOverlayPhase("exiting");
      let timer = setTimeout(() => _setOverlayPhase("hidden"), 450);
      return () => clearTimeout(timer);
    }
  }, [shouldShowOverlay, sOverlayPhase]);

  let lang = sDisplayData?.customerLanguage || "English";

  let overlayContent = null;
  if (sType === DISPLAY_MSG_TYPES.SALE) {
    overlayContent = <SaleOverlay data={sDisplayData} lang={lang} />;
  } else if (sType === DISPLAY_MSG_TYPES.WORKORDER) {
    overlayContent = <WorkorderOverlay data={sDisplayData} isTall={sIsTall} lang={lang} />;
  }

  return (
    <View style={{ width: "100vw", height: "100vh", backgroundColor: "black", overflow: "hidden" }}>
      {/* Keyframe animations for overlay slide */}
      <style>{`
        @keyframes displaySlideIn {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
        @keyframes displaySlideOut {
          from { transform: translateX(0); }
          to { transform: translateX(100%); }
        }
      `}</style>

      {/* Logo background — hidden during translation mode */}
      {!sTranslateText && (
        <Image
          source={logo}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            resizeMode: "contain",
          }}
        />
      )}

      {/* Translation overlay */}
      {sTranslateText ? <TranslateDisplay text={sTranslateText} /> : null}

      {/* Line items / sale overlay — animated */}
      {sOverlayPhase !== "hidden" && (
        <div
          key={sOverlayKey}
          style={{
            position: "absolute",
            top: 15,
            right: 15,
            bottom: 15,
            left: sIsTall ? "10%" : undefined,
            width: sIsTall ? undefined : "40%",
            minWidth: sIsTall ? undefined : 380,
            display: "flex",
            animation:
              sOverlayPhase === "visible"
                ? "displaySlideIn 0.4s ease forwards"
                : "displaySlideOut 0.4s ease forwards",
          }}
        >
          {overlayContent}
        </div>
      )}


    </View>
  );
}
