/* eslint-disable */
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
import { formatCurrencyDisp, formatPhoneForDisplay, capitalizeFirstLetterOfString } from "../utils";
import { C, Fonts, ICONS } from "../styles";
import logo from "../resources/default_app_logo_large.png";
import styles from "./CustomerDisplayScreen.module.css";

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
const textColor = C.textSecondary;
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
    <div className={styles.lineItemWrap}>
      <div className={styles.lineRow}>
        <p className={styles.lineQty} style={{ color: textColor }}>{qty}</p>
        <div className={styles.lineMain}>
          <p className={styles.lineName} style={{ color: textColor }}>{name}</p>
          {hasDiscount && (
            <p className={styles.lineDiscountName} style={{ color: discountTextColor }}>
              {item.discountObj.name}
            </p>
          )}
        </div>
        <div className={styles.linePriceCol}>
          {hasDiscount ? (
            <>
              <p className={styles.priceStrike} style={{ color: textColor }}>
                ${formatCurrencyDisp(regularTotal)}
              </p>
              <p className={styles.priceSavings} style={{ color: discountTextColor }}>
                -${formatCurrencyDisp(savingsTotal)}
              </p>
              <p className={styles.priceFinal} style={{ color: textColor }}>
                ${formatCurrencyDisp(discountedTotal)}
              </p>
            </>
          ) : (
            <p className={styles.priceRegular} style={{ color: textColor }}>
              ${formatCurrencyDisp(regularTotal)}
            </p>
          )}
        </div>
      </div>
      <div className={styles.itemRowDivider} />
    </div>
  );
}

function OverlayTotalRow({ label, value, bold, color }) {
  let displayValue =
    typeof value === "number" ? "$" + formatCurrencyDisp(value) : value;
  let rowColor = color || textColor;
  let textClass = `${styles.totalLabel} ${bold ? styles.totalBold : styles.totalNormal}`;
  let valueClass = `${styles.totalValue} ${bold ? styles.totalBold : styles.totalNormal}`;

  return (
    <div className={styles.totalRow}>
      <p className={textClass} style={{ color: rowColor }}>{label}</p>
      <p className={valueClass} style={{ color: rowColor }}>{displayValue}</p>
    </div>
  );
}

////////////////////////////////////////////////////////////////////////////////
// Right-side overlay panel (content only — positioning handled by AnimatedOverlay)
////////////////////////////////////////////////////////////////////////////////

function OverlayPanel({ children, header }) {
  return (
    <div className={styles.overlayPanel}>
      {/* Header */}
      <div className={styles.overlayPanelHeader}>
        <div className={styles.overlayPanelHeaderInner}>
          <p className={styles.overlayPanelHeaderText} style={{ color: textColor }}>
            {header}
          </p>
        </div>
        <div className={styles.overlayPanelHeaderDivider} />
      </div>
      {children}
    </div>
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
    <div className={styles.customerInfoBox}>
      {!!name && (
        <p className={styles.customerNameText} style={{ color: textColor }}>{name}</p>
      )}
      {!!cell && (
        <p className={styles.customerLineText} style={{ color: textColor }}>{cell}</p>
      )}
      {!!landline && (
        <p className={styles.customerLineText} style={{ color: textColor }}>{landline}</p>
      )}
      {!!customer.email && (
        <p className={styles.customerLineText} style={{ color: textColor }}>{customer.email}</p>
      )}
      {addressParts.length > 0 && (
        <p className={styles.customerAddressText} style={{ color: textColor }}>
          {addressParts.join(" ")}
        </p>
      )}
    </div>
  );
}

function IconRow({ icon, children, iconSize = 20 }) {
  return (
    <div className={styles.iconRow}>
      <img
        src={icon}
        alt=""
        className={styles.iconRowImg}
        style={{ width: iconSize, height: iconSize }}
        draggable={false}
      />
      <div className={styles.iconRowBody}>{children}</div>
    </div>
  );
}

function SectionDivider() {
  return <div className={styles.sectionDivider} />;
}

function ColorPill({ colorObj }) {
  if (!colorObj || !colorObj.label) return null;
  return (
    <div
      className={styles.colorPill}
      style={{ backgroundColor: colorObj.backgroundColor || C.surfaceAlt }}
    >
      <p
        className={styles.colorPillText}
        style={{ color: colorObj.textColor || "#000" }}
      >
        {colorObj.label}
      </p>
    </div>
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
    <div className={styles.workorderRoot}>
      {/* LEFT PANEL - Bike Info & Customer */}
      <div className={`${styles.leftPanel} ${hasCustomer ? styles.leftPanelOpen : styles.leftPanelClosed}`}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {/* Greeting */}
          <div className={styles.greetingBox}>
            <p
              className={`${styles.greetingText} ${isTall ? styles.greetingTall : styles.greetingShort}`}
              style={{ color: C.text }}
            >
              {greetingName ? t(lang, "greeting") + " " + greetingName + "!" : t(lang, "greeting") + "!"}
            </p>
          </div>

          {/* Customer contact info */}
          {(customer.customerCell || customer.customerLandline || customer.email) && (
            <div className={styles.contactBox}>
              {!!customer.customerCell && (
                <div className={styles.contactRow}>
                  <img src={ICONS.cellPhone} alt="" className={styles.contactIcon} draggable={false} />
                  <p className={styles.contactText} style={{ color: C.text }}>
                    {formatPhoneForDisplay(customer.customerCell)}
                  </p>
                </div>
              )}
              {!!customer.customerLandline && (
                <div className={styles.contactRow}>
                  <img src={ICONS.cellPhone} alt="" className={styles.contactIcon} draggable={false} />
                  <p className={styles.contactText} style={{ color: C.text }}>
                    {formatPhoneForDisplay(customer.customerLandline)}
                  </p>
                </div>
              )}
              {!!customer.email && (
                <div className={styles.contactRowLast}>
                  <img src={ICONS.paperPlane} alt="" className={styles.contactIcon} draggable={false} />
                  <p className={styles.contactTextSm} style={{ color: C.text }}>{customer.email}</p>
                </div>
              )}
            </div>
          )}

          <SectionDivider />

          {/* Bike info */}
          {!!bikeDesc && (
            <IconRow icon={ICONS.bicycle} iconSize={22}>
              <p className={styles.bikeDesc} style={{ color: C.text }}>
                {bikeDesc}
              </p>
            </IconRow>
          )}

          {/* Color swatches */}
          {hasColors && (
            <IconRow icon={ICONS.colorWheel} iconSize={18}>
              <div className={styles.colorRow}>
                <ColorPill colorObj={data.color1} />
                <ColorPill colorObj={data.color2} />
              </div>
            </IconRow>
          )}

          {/* Customer notes */}
          {customerNotes.length > 0 && (
            <div className={styles.notesBlock}>
              <SectionDivider />
              <div className={styles.notesBody}>
                <div className={styles.notesHeader}>
                  <img src={ICONS.notes} alt="" className={styles.notesHeaderIcon} draggable={false} />
                  <p className={styles.notesHeaderText} style={{ color: C.textMuted }}>Notes</p>
                </div>
                <div className={styles.notesScroll}>
                  {customerNotes.map((note, i) => (
                    <div key={i} className={styles.noteCard}>
                      <p className={styles.noteText} style={{ color: C.text }}>{note.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Wait time + Date at bottom of left panel */}
        {(!!data?.waitTimeEstimateLabel || !!data?.startedOnMillis) && (
          <div className={styles.leftFooter}>
            <SectionDivider />
            {!!data.waitTimeEstimateLabel && (
              <IconRow icon={ICONS.clock} iconSize={18}>
                <p className={styles.waitTimeText} style={{ color: C.text }}>{data.waitTimeEstimateLabel}</p>
              </IconRow>
            )}
            {!!data.startedOnMillis && (
              <IconRow icon={ICONS.workorder} iconSize={16}>
                <p className={styles.checkedInText} style={{ color: C.textMuted }}>
                  {t(lang, "checkedIn") + " " + formatDateShort(data.startedOnMillis)}
                </p>
              </IconRow>
            )}
          </div>
        )}
      </div>

      {/* RIGHT PANEL - Workorder Lines & Totals */}
      <div className={styles.rightPanel}>
        {/* Items header */}
        <div className={styles.itemsHeader}>
          <img src={ICONS.tools1} alt="" className={styles.itemsHeaderIcon} draggable={false} />
          <p className={styles.itemsHeaderText} style={{ color: C.green }}>
            {t(lang, "items")}
          </p>
          <p className={styles.itemsCount} style={{ color: C.textMuted }}>
            {"(" + (totals.runningQty || lines.length) + ")"}
          </p>
        </div>

        {/* Scrollable items list */}
        <div className={styles.itemsScroll}>
          {lines.map((line, i) => (
            <div
              key={line.id || i}
              className={i % 2 === 0 ? styles.lineItemStripeEven : styles.lineItemStripeOdd}
            >
              <OverlayLineItemRow item={line} />
              {!!line.receiptNotes && (
                <div className={styles.receiptNotesBox}>
                  <p className={styles.receiptNotesText} style={{ color: C.textMuted }}>
                    {line.receiptNotes}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Totals section */}
        {lines.length > 0 && (
          <div className={styles.totalsSection}>
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
            <div className={styles.totalsThickDivider} />
            <OverlayTotalRow label={t(lang, "total")} value={totals.runningTotal || 0} bold />

            {amountPaid > 0 && !paymentComplete && (
              <>
                <OverlayTotalRow label={t(lang, "paid")} value={amountPaid} color={C.green} />
                <OverlayTotalRow label={t(lang, "balanceDue")} value={(totals.runningTotal || 0) - amountPaid} bold />
              </>
            )}

            {paymentComplete && (
              <div className={styles.paidBadgeBox} style={{ backgroundColor: C.green }}>
                <p className={styles.paidBadgeText}>{t(lang, "paidBadge")}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
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
      <div className={styles.itemsScroll}>
        {allLines.map((line, i) => (
          <OverlayLineItemRow key={line.id || i} item={line} />
        ))}
      </div>

      <div className={styles.saleTotalsBox}>
        <div className={styles.saleTotalsDivider} />
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

        <div className={styles.saleInnerDivider} />
        <div className={styles.saleDividerSpacer} />
        <OverlayTotalRow label={t(lang, "totalColon")} value={sale.total || 0} bold />

        {sale.amountCaptured > 0 && !sale.paymentComplete && (
          <div className={styles.salePaymentBlock}>
            <OverlayTotalRow label={t(lang, "paid")} value={sale.amountCaptured} />
            <OverlayTotalRow label={t(lang, "remaining")} value={amountRemaining} />
          </div>
        )}

        {sale.paymentComplete && (
          <div className={styles.salePaidBadge} style={{ backgroundColor: C.green }}>
            <p className={styles.salePaidBadgeText}>{t(lang, "paidBadge")}</p>
          </div>
        )}
      </div>
    </OverlayPanel>
  );
}

////////////////////////////////////////////////////////////////////////////////
// Translate display
////////////////////////////////////////////////////////////////////////////////

function TranslateDisplay({ text }) {
  return (
    <div className={styles.translateOverlay}>
      <p
        className={styles.translateText}
        style={{ color: C.textWhite, fontWeight: Fonts.weight.textHeavy }}
      >
        {text}
      </p>
    </div>
  );
}

////////////////////////////////////////////////////////////////////////////////
// Main display screen
////////////////////////////////////////////////////////////////////////////////

export function CustomerDisplayScreen() {
  document.title = "Customer Screen";
  const [sDisplayData, _setDisplayData] = useState(null);
  const [sType, _setType] = useState(null);
  const [sStoreName, _setStoreName] = useState("");
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
        if (msg.payload?.storeName) _setStoreName(msg.payload.storeName);
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
    // Customer display should always be in fullscreen (polished presentation
    // for customers). Two paths achieve and maintain that state:
    //
    //   1. Auto-fullscreen on mount — fires inside the user-gesture-active
    //      context immediately after window.open. Zero-touch when permission
    //      is granted.
    //   2. Persistent single-click/keydown listener — re-enters fullscreen
    //      after Esc or any glitch that leaves the window non-fullscreen.
    //      Does NOT self-remove; the customer screen faces away from the
    //      operator, so any gesture on it is intentional and means "be
    //      polished."
    //
    // The previous double-click toggle has been removed — auto + persistent
    // single-click covers entry, Esc handles exit.
    function ensureFullscreen() {
      if (document.fullscreenElement) return;
      document.documentElement.requestFullscreen().catch(() => {});
    }
    if (document.documentElement.requestFullscreen) {
      ensureFullscreen();
      document.addEventListener("click", ensureFullscreen, true);
      document.addEventListener("keydown", ensureFullscreen, true);
    }
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
      document.removeEventListener("click", ensureFullscreen, true);
      document.removeEventListener("keydown", ensureFullscreen, true);
    };
  }, []);

  let isMedia = sType === DISPLAY_MSG_TYPES.MEDIA && sDisplayData;
  let hasOverlayData =
    !sTranslateText &&
    !isMedia &&
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

  let overlayWrapClasses = [
    styles.overlayWrap,
    sIsTall ? styles.overlayWrapTall : styles.overlayWrapWide,
    sOverlayPhase === "visible" ? styles.slideIn : styles.slideOut,
  ].join(" ");

  return (
    <div className={styles.root}>
      {/* Logo background — hidden during translation mode */}
      {!sTranslateText && (
        <img src={logo} alt="" className={styles.bgLogo} draggable={false} />
      )}

      {/* Welcome header */}
      {!sTranslateText && !!sStoreName && (
        <div className={styles.welcomeHeader}>
          <p
            className={styles.welcomeText}
            style={{ color: C.textDisabled, fontWeight: Fonts.weight.textHeavy }}
          >
            {"Welcome to " + sStoreName}
          </p>
        </div>
      )}

      {/* Translation overlay */}
      {sTranslateText ? <TranslateDisplay text={sTranslateText} /> : null}

      {/* Line items / sale overlay — animated */}
      {sOverlayPhase !== "hidden" && (
        <div key={sOverlayKey} className={overlayWrapClasses}>
          {overlayContent}
        </div>
      )}

      {/* Media cast overlay */}
      {isMedia && !sTranslateText && (
        <div className={styles.mediaOverlay}>
          {sDisplayData.type === "video" ? (
            <video
              src={sDisplayData.url}
              controls
              autoPlay
              className={styles.mediaVideo}
            />
          ) : (
            <img
              src={sDisplayData.url}
              alt=""
              className={styles.mediaImage}
              draggable={false}
            />
          )}
        </div>
      )}

    </div>
  );
}
