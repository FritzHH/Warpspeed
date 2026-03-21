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
import { formatCurrencyDisp, formatPhoneForDisplay, gray } from "../utils";
import { C, Fonts } from "../styles";

const logo = require("../resources/bblogo_trans_high.png");

const DEV_SHOW_OVERLAY = false;

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
  let cell = formatPhoneForDisplay(customer.cell);
  let landline = formatPhoneForDisplay(customer.landline);
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

function WorkorderOverlay({ data }) {
  let lines = data?.workorderLines || [];
  let totals = data?.totals || {};
  let customer = data?.customer || null;
  let isStandalone = !customer || (!customer.first && !customer.last);

  let header = data
    ? [data.customerFirst, data.customerLast].filter(Boolean).join(" ") || "Workorder"
    : "Workorder";

  return (
    <OverlayPanel header={header}>
      {!isStandalone && (
        <>
          <CustomerInfoSection customer={customer} />
          <View style={{ height: 1, backgroundColor: "rgba(0,0,0,0.08)", marginHorizontal: 20 }} />
        </>
      )}
      <ScrollView style={{ flex: 1 }}>
        {lines.map((line, i) => (
          <OverlayLineItemRow key={line.id || i} item={line} />
        ))}
      </ScrollView>

      {lines.length > 0 && (
        <View style={{ paddingVertical: 12 }}>
          <View style={{ height: 1, backgroundColor: "rgba(0,0,0,0.12)", marginHorizontal: 20, marginBottom: 12 }} />
          <OverlayTotalRow label="Subtotal" value={totals.runningSubtotal || 0} />
          {(totals.runningDiscount || 0) > 0 && (
            <OverlayTotalRow
              label="Total Discounts"
              value={`-$${formatCurrencyDisp(totals.runningDiscount)}`}
              color={discountTextColor}
            />
          )}
          <OverlayTotalRow
            label={`Sales Tax (${totals.salesTaxPercent || 0}%)`}
            value={totals.runningTax || 0}
          />
          <View style={{ height: 8, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.12)", marginHorizontal: 20 }} />
          <View style={{ height: 8 }} />
          <OverlayTotalRow label="Total:" value={totals.runningTotal || 0} bold />
        </View>
      )}
    </OverlayPanel>
  );
}

////////////////////////////////////////////////////////////////////////////////
// Sale display (overlay)
////////////////////////////////////////////////////////////////////////////////

function SaleOverlay({ data }) {
  let sale = data?.sale || {};
  let allLines = [];

  (data?.combinedWorkorders || []).forEach((wo) => {
    (wo.workorderLines || []).forEach((line) => {
      allLines.push(line);
    });
  });

  (data?.addedItems || []).forEach((item) => {
    allLines.push(item);
  });

  let hasDiscount = (sale.discount || 0) > 0;
  let hasCardFee = (sale.cardFee || 0) > 0;
  let amountRemaining = (sale.total || 0) - (sale.amountCaptured || 0);
  if (amountRemaining < 0) amountRemaining = 0;

  return (
    <OverlayPanel header="Checkout">
      <ScrollView style={{ flex: 1 }}>
        {allLines.map((line, i) => (
          <OverlayLineItemRow key={line.id || i} item={line} />
        ))}
      </ScrollView>

      <View style={{ paddingVertical: 12 }}>
        <View style={{ height: 1, backgroundColor: "rgba(0,0,0,0.12)", marginHorizontal: 20, marginBottom: 12 }} />
        <OverlayTotalRow label="Subtotal" value={sale.subtotal || 0} />

        {hasDiscount && (
          <OverlayTotalRow
            label="Total Discounts"
            value={`-$${formatCurrencyDisp(sale.discount)}`}
            color={discountTextColor}
          />
        )}

        <OverlayTotalRow label={`Sales Tax (${sale.taxRate || ""}%)`} value={sale.tax || 0} />

        {hasCardFee && (
          <OverlayTotalRow
            label={`Card Fee (${sale.cardFeePercent || 0}%)`}
            value={sale.cardFee}
          />
        )}

        <View style={{ height: 8, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.12)", marginHorizontal: 20 }} />
        <View style={{ height: 8 }} />
        <OverlayTotalRow label="Total:" value={sale.total || 0} bold />

        {sale.amountCaptured > 0 && !sale.paymentComplete && (
          <View style={{ marginTop: 8, paddingHorizontal: 20 }}>
            <OverlayTotalRow
              label="Paid"
              value={sale.amountCaptured}
            />
            <OverlayTotalRow
              label="Remaining"
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
              PAID
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
        backgroundColor: "rgba(0,0,0,0.7)",
        justifyContent: "center",
        alignItems: "center",
        padding: 40,
      }}
    >
      <Text
        style={{
          fontSize: 48,
          color: "white",
          fontWeight: Fonts.weight.textHeavy,
          textAlign: "center",
          lineHeight: 64,
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
    function handleFullscreenChange() {
      let isFs = !!document.fullscreenElement;
      _setIsFullscreen(isFs);
      broadcastDisplayStatus(isFs ? DISPLAY_STATUS.FULLSCREEN : DISPLAY_STATUS.WINDOWED);
    }
    function handleVisibilityChange() {
      broadcastDisplayStatus(
        document.visibilityState === "visible" ? DISPLAY_STATUS.VISIBLE : DISPLAY_STATUS.HIDDEN
      );
    }
    function handleBeforeUnload() {
      broadcastDisplayStatus(DISPLAY_STATUS.CLOSED);
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
    broadcastDisplayStatus(DISPLAY_STATUS.OPEN);
    window.addEventListener("resize", handleResize);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      unsubDisplay();
      unsubTranslate();
      unsubStatus();
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
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

  let overlayContent = null;
  if (sType === DISPLAY_MSG_TYPES.SALE) {
    overlayContent = <SaleOverlay data={sDisplayData} />;
  } else if (sType === DISPLAY_MSG_TYPES.WORKORDER) {
    overlayContent = <WorkorderOverlay data={sDisplayData} />;
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

      {/* Logo background — always visible */}
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

      {/* Fullscreen button — hidden when already fullscreen */}
      {!sIsFullscreen && (
        <TouchableOpacity
          onPress={() => document.documentElement.requestFullscreen().catch(() => { })}
          style={{
            position: "absolute",
            bottom: 12,
            left: 12,
            backgroundColor: "rgba(255, 255, 255, 0.25)",
            paddingVertical: 6,
            paddingHorizontal: 14,
            borderRadius: 6,
          }}
        >
          <Text style={{ color: "rgba(255, 255, 255, 0.7)", fontSize: 12 }}>
            Full-Screen
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
