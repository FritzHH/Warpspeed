/* eslint-disable */
import { useState, useRef } from "react";
import { useNavigate, useParams, Navigate } from "react-router-dom";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { ICONS, Radius } from "../../styles";
import { ROUTES } from "../../routes";
import {
  useOpenWorkordersStore,
  useSettingsStore,
  useAlertScreenStore,
  useActiveSalesStore,
  useCustMessagesStore,
  useLoginStore,
} from "../../stores";
import {
  resolveStatus,
  formatCurrencyDisp,
  calculateRunningTotals,
  applyDiscountToWorkorderItem,
  replaceOrAddToArr,
  capitalizeFirstLetterOfString,
  getWorkorderPaymentState,
  usdTypeMask,
  formatPhoneWithDashes,
} from "../../utils";
import { dbCreateTextToPayInvoice } from "../../db_calls_wrapper";
import { SMS_PROTO } from "../../data";
import {
  AlertBox,
  Image,
  StatusPickerModal,
  SwipeBackHint,
  TouchableOpacity,
  DatePicker as DatePicker_,
  TimePicker as TimePicker_,
} from "../../dom_components";
import { useZ } from "../../hooks/useZ";
import cloneDeep from "lodash/cloneDeep";
import { CustomerSection } from "./CustomerSection/CustomerSection";
import { BikeOrderingSection } from "./BikeOrderingSection/BikeOrderingSection";
import { LineItemsSection } from "./LineItemsSection/LineItemsSection";
import { NotesSection } from "./NotesSection/NotesSection";
import { MediaSection } from "./MediaSection/MediaSection";
import styles from "./WorkorderDetailModal.module.css";

const STATUS_BUTTON_BASE_STYLE = {
  paddingTop: 8,
  paddingBottom: 8,
  paddingLeft: 14,
  paddingRight: 14,
  height: "auto",
  borderRadius: Radius.row,
};
const STATUS_BUTTON_TEXT_BASE_STYLE = {
  fontWeight: "600",
  fontSize: 14,
};
const STATUS_ITEM_TEXT_STYLE = { fontSize: 17 };

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatTime12(t24) {
  if (!t24) return "--:--";
  const [hStr, mStr] = t24.split(":");
  let h = Number(hStr);
  const period = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return h + ":" + mStr + " " + period;
}

function parse12To24Parts(t24) {
  if (!t24) return { hour: 11, minute: 0, period: "AM" };
  const [hStr, mStr] = t24.split(":");
  let h = Number(hStr);
  const period = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return { hour: h, minute: Number(mStr), period };
}

function to24(hour, minute, period) {
  let h24 = period === "PM" ? (hour === 12 ? 12 : hour + 12) : (hour === 12 ? 0 : hour);
  return String(h24).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
}

function PickupDeliveryRow({ pd, updatePickupFields }) {
  const [sShowDatePicker, _setShowDatePicker] = useState(false);
  const [sShowStartPicker, _setShowStartPicker] = useState(false);
  const [sShowEndPicker, _setShowEndPicker] = useState(false);
  const zDate = useZ("dropdown", sShowDatePicker);
  const zStart = useZ("dropdown", sShowStartPicker);
  const zEnd = useZ("dropdown", sShowEndPicker);

  const dateLabel = pd.month && pd.day
    ? (MONTH_LABELS[Number(pd.month) - 1] || pd.month) + " " + pd.day
    : "Date";

  const startParts = parse12To24Parts(pd.startTime);
  const endParts = parse12To24Parts(pd.endTime);

  return (
    <div className={styles.pickupRow}>
      <PopoverPrimitive.Root open={sShowDatePicker} onOpenChange={_setShowDatePicker}>
        <PopoverPrimitive.Anchor asChild>
          <button
            type="button"
            onClick={() => _setShowDatePicker((v) => !v)}
            className={`${styles.pdPill} ${styles.pdPillDate}`}
          >
            {dateLabel}
          </button>
        </PopoverPrimitive.Anchor>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content sideOffset={4} collisionPadding={10} style={{ zIndex: zDate }}>
            <DatePicker_
              initialMonth={Number(pd.month) || new Date().getMonth() + 1}
              initialDay={Number(pd.day) || new Date().getDate()}
              onConfirm={({ month, day }) => {
                updatePickupFields({ month: String(month), day: String(day) });
                _setShowDatePicker(false);
              }}
              onCancel={() => _setShowDatePicker(false)}
            />
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>

      <div className={styles.pdTimeGroup}>
        <PopoverPrimitive.Root open={sShowStartPicker} onOpenChange={_setShowStartPicker}>
          <PopoverPrimitive.Anchor asChild>
            <button
              type="button"
              onClick={() => _setShowStartPicker((v) => !v)}
              className={styles.pdPill}
            >
              {formatTime12(pd.startTime)}
            </button>
          </PopoverPrimitive.Anchor>
          <PopoverPrimitive.Portal>
            <PopoverPrimitive.Content sideOffset={4} collisionPadding={10} style={{ zIndex: zStart }}>
              <TimePicker_
                initialHour={startParts.hour}
                initialMinute={startParts.minute}
                initialPeriod={startParts.period}
                onConfirm={({ hour, minute, period }) => {
                  updatePickupFields({ startTime: to24(hour, minute, period) });
                  _setShowStartPicker(false);
                }}
                onCancel={() => _setShowStartPicker(false)}
              />
            </PopoverPrimitive.Content>
          </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>

        <span className={styles.pdTo}>to</span>

        <PopoverPrimitive.Root open={sShowEndPicker} onOpenChange={_setShowEndPicker}>
          <PopoverPrimitive.Anchor asChild>
            <button
              type="button"
              onClick={() => _setShowEndPicker((v) => !v)}
              className={styles.pdPill}
            >
              {formatTime12(pd.endTime)}
            </button>
          </PopoverPrimitive.Anchor>
          <PopoverPrimitive.Portal>
            <PopoverPrimitive.Content sideOffset={4} collisionPadding={10} style={{ zIndex: zEnd }}>
              <TimePicker_
                initialHour={endParts.hour}
                initialMinute={endParts.minute}
                initialPeriod={endParts.period}
                onConfirm={({ hour, minute, period }) => {
                  updatePickupFields({ endTime: to24(hour, minute, period) });
                  _setShowEndPicker(false);
                }}
                onCancel={() => _setShowEndPicker(false)}
              />
            </PopoverPrimitive.Content>
          </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
      </div>
    </div>
  );
}

function SectionPanel({ title, subtitle, accent, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const accentClass = accent === "customer" ? styles.panelAccentCustomer : styles.panelAccentWorkorder;
  return (
    <div className={`${styles.panel} ${accentClass}`}>
      <TouchableOpacity
        onPress={() => setOpen(!open)}
        className={styles.panelHeader}
        activeOpacity={0.7}
      >
        <div className={styles.panelTitleCol}>
          <span className={styles.panelTitle}>{title}</span>
          {subtitle ? <span className={styles.panelSubtitle}>{subtitle}</span> : null}
        </div>
        <Image
          icon={ICONS.downChevron}
          size={22}
          className={`${styles.panelChevron} ${open ? styles.panelChevronOpen : ""}`}
        />
      </TouchableOpacity>
      {open ? <div className={styles.panelBody}>{children}</div> : null}
    </div>
  );
}

export function WorkorderDetailScreen() {
  const navigate = useNavigate();
  const { woID } = useParams();
  const workorder = useOpenWorkordersStore((s) =>
    s.workorders.find((w) => w.id === woID) || null
  );
  const zSettings = useSettingsStore((s) => s.settings);
  const zShowAlert = useAlertScreenStore((s) => s.showAlert);

  // Workorder mutation handlers and PayLink modal hooks must run on every
  // render before any early return — must be declared before any branch.
  const [sPayLinkModal, _setPayLinkModal] = useState(null);
  const [sPayLinkAmountCents, _setPayLinkAmountCents] = useState(0);
  const [sPayLinkAmountDisp, _setPayLinkAmountDisp] = useState("");
  const [sPayLinkError, _setPayLinkError] = useState("");
  const zPayLink = useZ("modal", !!sPayLinkModal);

  const [sSwipeX, _setSwipeX] = useState(0);
  const [sSwiping, _setSwiping] = useState(false);
  const swipeStartRef = useRef(null);

  // Workorder may have been completed/deleted while this screen is open
  // (e.g. checkout success). Redirect to the list rather than render stale.
  if (!workorder) {
    return <Navigate to={ROUTES.phone} replace />;
  }

  const salesTaxPercent = zSettings?.salesTaxPercent || 0;
  const taxFree = !!workorder.taxFree;
  const { runningQty, runningSubtotal, runningDiscount, runningTax, finalTotal } =
    calculateRunningTotals(workorder, salesTaxPercent, [], false, taxFree);
  const runningTotal = finalTotal;
  let rs = resolveStatus(workorder.status, zSettings?.statuses);

  const swipeHandlers = {
    onTouchStart: (e) => {
      const t = e.touches[0];
      if (t.clientX > 30) return;
      swipeStartRef.current = { x: t.clientX, time: Date.now() };
      _setSwiping(true);
    },
    onTouchMove: (e) => {
      if (!swipeStartRef.current) return;
      const t = e.touches[0];
      const dx = t.clientX - swipeStartRef.current.x;
      if (dx > 0) _setSwipeX(dx);
    },
    onTouchEnd: () => {
      if (!swipeStartRef.current) return;
      const elapsed = Date.now() - swipeStartRef.current.time;
      const velocity = sSwipeX / Math.max(elapsed, 1);
      const commitThreshold = window.innerWidth * 0.3;
      const isCommit = sSwipeX > commitThreshold || velocity > 0.5;
      swipeStartRef.current = null;
      _setSwiping(false);
      if (isCommit) {
        _setSwipeX(window.innerWidth);
        setTimeout(() => { navigate(-1); _setSwipeX(0); }, 200);
      } else {
        _setSwipeX(0);
      }
    },
  };

  const swipeStyle = {
    transform: `translateX(${sSwipeX}px)`,
    transition: sSwiping ? "none" : "transform 200ms ease",
  };

  const customerName = workorder.customerID
    ? `${capitalizeFirstLetterOfString(workorder.customerFirst || "")} ${capitalizeFirstLetterOfString(workorder.customerLast || "")}`.trim() || "Customer"
    : "Walk-in";

  const workorderSubtitle = `${runningQty} ${runningQty === 1 ? "item" : "items"} \u00B7 ${formatCurrencyDisp(runningTotal, true)}`;

  function setField(fieldName, val) {
    useOpenWorkordersStore.getState().setField(fieldName, val, workorder.id);
  }

  function deleteLineItem(index) {
    let workorderLines = workorder.workorderLines.filter((o, idx) => idx !== index);
    useOpenWorkordersStore.getState().setField("workorderLines", workorderLines, workorder.id);
  }

  function modifyLineQty(line, option) {
    let newLine = cloneDeep(line);
    if (option === "up") {
      newLine.qty = newLine.qty + 1;
    } else {
      if (newLine.qty <= 1) return;
      newLine.qty = newLine.qty - 1;
    }
    if (newLine.discountObj?.name) {
      let discounted = applyDiscountToWorkorderItem(newLine);
      if (discounted.discountObj?.newPrice > 0) newLine = discounted;
    }
    useOpenWorkordersStore.getState().setField("workorderLines", replaceOrAddToArr(workorder.workorderLines, newLine), workorder.id);
  }

  function applyLineDiscount(line, discountObj) {
    let workorderLines = workorder.workorderLines.map((o) => {
      if (o.id === line.id) {
        return applyDiscountToWorkorderItem({ ...line, discountObj });
      }
      return o;
    });
    useOpenWorkordersStore.getState().setField("workorderLines", workorderLines, workorder.id);
  }

  function clearLineDiscount(line) {
    let workorderLines = workorder.workorderLines.map((o) => {
      if (o.id === line.id) return { ...line, discountObj: null };
      return o;
    });
    useOpenWorkordersStore.getState().setField("workorderLines", workorderLines, workorder.id);
  }

  function splitLineItem(line, index) {
    let num = line.qty;
    let workorderLines = cloneDeep(workorder.workorderLines);
    for (let i = 0; i <= num - 1; i++) {
      let newLine = cloneDeep(line);
      newLine.qty = 1;
      newLine.id = crypto.randomUUID();
      newLine.discountObj = null;
      if (i === 0) { workorderLines[index] = newLine; continue; }
      workorderLines.splice(index + 1, 0, newLine);
    }
    useOpenWorkordersStore.getState().setField("workorderLines", workorderLines, workorder.id);
  }

  function _openPayLink() {
    if (!workorder.workorderLines || workorder.workorderLines.length === 0) {
      useAlertScreenStore.getState().setValues({
        title: "No Line Items",
        message: "This workorder has no line items to charge for.",
        btn1Text: "OK",
        handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
        showAlert: true,
        canExitOnOuterClick: true,
      });
      return;
    }
    if (workorder.paymentComplete) {
      useAlertScreenStore.getState().setValues({
        title: "Already Paid",
        message: "This workorder is already paid.",
        btn1Text: "OK",
        handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
        showAlert: true,
        canExitOnOuterClick: true,
      });
      return;
    }
    const activeSale = workorder.activeSaleID
      ? useActiveSalesStore.getState().getActiveSale(workorder.activeSaleID)
      : null;
    const paymentState = getWorkorderPaymentState(workorder, activeSale, zSettings);
    const amountDue = paymentState.remainingForThisWO;
    if (amountDue <= 0) {
      useAlertScreenStore.getState().setValues({
        title: "Nothing Due",
        message: "This workorder has no balance to charge.",
        btn1Text: "OK",
        handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
        showAlert: true,
        canExitOnOuterClick: true,
      });
      return;
    }
    const sendPhone = workorder.customerCell || "";
    const custEmail = workorder.customerEmail || workorder.email || "";
    const phoneDigits = sendPhone.replace(/\D/g, "");
    const hasPhone = phoneDigits.length >= 10;
    const hasEmail = custEmail && custEmail.includes("@");
    if (!hasPhone && !hasEmail) {
      useAlertScreenStore.getState().setValues({
        title: "No Contact Info",
        message: "This customer has no phone or email on file to send a payment link.",
        btn1Text: "OK",
        handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
        showAlert: true,
        canExitOnOuterClick: true,
      });
      return;
    }
    const channel = hasPhone && hasEmail ? "both" : (hasPhone ? "sms" : "email");
    const sendTo = [];
    if (hasPhone) sendTo.push(formatPhoneWithDashes(sendPhone));
    if (hasEmail) sendTo.push(custEmail);
    const recipientName = capitalizeFirstLetterOfString(workorder.customerFirst || "") || "customer";

    _setPayLinkAmountCents(amountDue);
    _setPayLinkAmountDisp(formatCurrencyDisp(amountDue));
    _setPayLinkError("");
    _setPayLinkModal({
      remainingCents: amountDue,
      channel,
      sendTo,
      recipientName,
      sendPhone,
      hasPhone,
      hasEmail,
      custEmail,
    });
  }

  function _closePayLinkModal() {
    _setPayLinkModal(null);
    _setPayLinkAmountCents(0);
    _setPayLinkAmountDisp("");
    _setPayLinkError("");
  }

  function _handlePayLinkAmountChange(val) {
    const result = usdTypeMask(val, { withDollar: false });
    const max = sPayLinkModal?.remainingCents || 0;
    if (result.cents > max) {
      _setPayLinkAmountDisp(formatCurrencyDisp(max));
      _setPayLinkAmountCents(max);
    } else {
      _setPayLinkAmountDisp(result.display);
      _setPayLinkAmountCents(result.cents);
    }
    if (sPayLinkError) _setPayLinkError("");
  }

  function _handleSendPayLink() {
    if (!sPayLinkModal) return;
    const amountCents = sPayLinkAmountCents;
    const remaining = sPayLinkModal.remainingCents;
    if (amountCents < 50) {
      _setPayLinkError("Amount must be at least $0.50");
      return;
    }
    if (amountCents > remaining) {
      _setPayLinkError("Amount exceeds balance due");
      return;
    }
    const { channel, sendPhone, hasEmail, custEmail } = sPayLinkModal;
    const displayAmount = "$" + formatCurrencyDisp(amountCents);
    const opts = { amountCents };
    if (!workorder.customerID) opts.phone = sendPhone;
    if (hasEmail && !workorder.customerID) opts.email = custEmail;

    const messageID = crypto.randomUUID();
    useCustMessagesStore.getState().setOutgoingMessage({
      ...SMS_PROTO,
      id: messageID,
      message: "Sending payment link for " + displayAmount + "...",
      phoneNumber: sendPhone,
      customerID: workorder?.customerID || "",
      type: "outgoing",
      millis: Date.now(),
      status: "sending",
      senderUserObj: useLoginStore.getState().getCurrentUser(),
      sentByUser: useLoginStore.getState().getCurrentUser()?.id || "",
    });

    dbCreateTextToPayInvoice(workorder.id, channel, opts).then((result) => {
      if (result && result.success) {
        useCustMessagesStore.getState().updateMessageStatus(messageID, "sent", "");
        useAlertScreenStore.getState().setValues({
          title: "Payment Link Sent",
          message: "Payment link sent to " + sPayLinkModal.recipientName + ".",
          btn1Text: "OK",
          handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
          showAlert: true,
          canExitOnOuterClick: true,
        });
      } else {
        useCustMessagesStore.getState().updateMessageStatus(messageID, "failed", result?.error || "Failed to send payment link");
        useAlertScreenStore.getState().setValues({
          title: "Payment Link Failed",
          message: result?.error || "Failed to send payment link",
          btn1Text: "OK",
          handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
          showAlert: true,
          canExitOnOuterClick: true,
        });
      }
    }).catch(() => {
      useCustMessagesStore.getState().updateMessageStatus(messageID, "failed", "Failed to send payment link");
    });
    _closePayLinkModal();
  }

  function handleStatusSelect(val) {
    const store = useOpenWorkordersStore.getState();
    store.setField("status", val.id, workorder.id);
    if (val.id === "pickup" || val.id === "delivery") {
      const existing = workorder?.pickupDelivery;
      if (!existing?.month && !existing?.day) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        store.setField(
          "pickupDelivery",
          {
            month: String(tomorrow.getMonth() + 1),
            day: String(tomorrow.getDate()),
            startTime: "11:00",
            endTime: "15:00",
          },
          workorder.id
        );
      }
    }
  }

  function updatePickupFields(fields) {
    const store = useOpenWorkordersStore.getState();
    const current = workorder?.pickupDelivery || {};
    store.setField("pickupDelivery", { ...current, ...fields }, workorder.id);
  }

  const isPickupDelivery = workorder.status === "pickup" || workorder.status === "delivery";

  return (
    <div className={styles.root} {...swipeHandlers} style={swipeStyle}>
      <SwipeBackHint label="Workorders" swipeX={sSwipeX} />
      <div className={styles.scroll}>
        <SectionPanel
          title="CUSTOMER"
          subtitle={customerName}
          accent="customer"
          defaultOpen={false}
        >
          {workorder.customerID ? (
            <CustomerSection
              workorder={workorder}
              zSettings={zSettings}
              onShowMessages={() =>
                navigate(`/phone/workorder/${workorder.id}/messages`)
              }
              headless={true}
            />
          ) : (
            <span className={styles.walkInLabel}>Walk-in customer</span>
          )}
        </SectionPanel>

        <SectionPanel
          title="WORKORDER"
          subtitle={workorderSubtitle}
          accent="workorder"
          defaultOpen={true}
        >
          <MediaSection workorder={workorder} />

          <BikeOrderingSection
            workorder={workorder}
            zSettings={zSettings}
            setField={setField}
            statusPill={
              <StatusPickerModal
                statuses={(zSettings?.statuses || []).filter((s) => !s.systemOwned && !s.hidden)}
                enabled={true}
                onSelect={handleStatusSelect}
                menuWidth={Math.round(window.innerWidth * 0.6)}
                centered={true}
                itemHeight={48}
                itemTextStyle={STATUS_ITEM_TEXT_STYLE}
                buttonStyle={{ ...STATUS_BUTTON_BASE_STYLE, backgroundColor: rs.backgroundColor }}
                buttonTextStyle={{ ...STATUS_BUTTON_TEXT_BASE_STYLE, color: rs.textColor }}
                buttonText={rs.label}
              />
            }
            pickupDeliveryRow={
              isPickupDelivery ? (
                <PickupDeliveryRow
                  pd={workorder.pickupDelivery || {}}
                  updatePickupFields={updatePickupFields}
                />
              ) : null
            }
          />

          <LineItemsSection
            workorder={workorder}
            zSettings={zSettings}
            runningQty={runningQty}
            onOpenItemSearch={() =>
              navigate(`/phone/workorder/${workorder.id}/items`)
            }
            modifyLineQty={modifyLineQty}
            splitLineItem={splitLineItem}
            applyLineDiscount={applyLineDiscount}
            clearLineDiscount={clearLineDiscount}
            deleteLineItem={deleteLineItem}
          />

          <NotesSection notes={workorder.notes} />

          <div className={styles.totalsGroup}>
            <div className={styles.subRow}>
              <span className={styles.subLabel}>Subtotal</span>
              <span className={styles.subValue}>{formatCurrencyDisp(runningSubtotal, true)}</span>
            </div>
            {runningDiscount > 0 && (
              <div className={styles.subRow}>
                <span className={styles.subLabelDiscount}>Discount</span>
                <span className={styles.subValueDiscount}>-{formatCurrencyDisp(runningDiscount, true)}</span>
              </div>
            )}
            <div className={styles.subRow}>
              <span className={styles.subLabel}>Sales tax</span>
              <span className={styles.subValue}>{formatCurrencyDisp(runningTax, true)}</span>
            </div>
            <div className={styles.totalRow}>
              <span className={styles.totalLabel}>Total</span>
              <span className={styles.totalValue}>
                {formatCurrencyDisp(runningTotal, true)}
              </span>
            </div>
          </div>

          <TouchableOpacity
            onPress={() => navigate(`/phone/workorder/${workorder.id}/charge`)}
            className={styles.checkoutBtn}
            activeOpacity={0.85}
          >
            <Image icon={ICONS.shoppingCart} size={26} />
            <span className={styles.checkoutBtnText}>Checkout</span>
          </TouchableOpacity>

          <TouchableOpacity onPress={_openPayLink} className={styles.payLinkBtn} activeOpacity={0.85}>
            <Image icon={ICONS.paperPlane} size={24} />
            <span className={styles.payLinkBtnText}>Send Payment Link</span>
          </TouchableOpacity>
        </SectionPanel>
      </div>

      {sPayLinkModal && (
        <div className={styles.payLinkBackdrop} style={{ zIndex: zPayLink }} onClick={_closePayLinkModal}>
          <div className={styles.payLinkCard} onClick={(e) => e.stopPropagation()}>
            <span className={styles.payLinkTitle}>Send Payment Link</span>
            <div className={styles.payLinkRecipient}>
              <span>{"To " + sPayLinkModal.recipientName + ":"}</span>
              {sPayLinkModal.hasPhone && (
                <span>{formatPhoneWithDashes(sPayLinkModal.sendPhone)}</span>
              )}
              {sPayLinkModal.hasEmail && (
                <span>{sPayLinkModal.custEmail}</span>
              )}
            </div>

            <div className={styles.payLinkBalanceRow}>
              <span className={styles.payLinkBalanceLabel}>Balance</span>
              <span className={styles.payLinkBalanceValue}>
                {"$" + formatCurrencyDisp(sPayLinkModal.remainingCents)}
              </span>
            </div>

            <div className={styles.payLinkAmountGroup}>
              <span className={styles.payLinkAmountLabel}>Amount to charge</span>
              <div className={styles.payLinkAmountWrap}>
                <span className={styles.payLinkAmountPrefix}>$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={sPayLinkAmountDisp}
                  onChange={(e) => _handlePayLinkAmountChange(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  className={styles.payLinkAmountInput}
                />
              </div>
            </div>

            {sPayLinkError ? (
              <span className={styles.payLinkError}>{sPayLinkError}</span>
            ) : null}

            <div className={styles.payLinkActions}>
              <TouchableOpacity onPress={_closePayLinkModal} className={styles.payLinkCancelBtn}>
                <span className={styles.payLinkCancelText}>Cancel</span>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={_handleSendPayLink}
                disabled={sPayLinkAmountCents < 50 || sPayLinkAmountCents > sPayLinkModal.remainingCents}
                className={
                  sPayLinkAmountCents < 50 || sPayLinkAmountCents > sPayLinkModal.remainingCents
                    ? styles.payLinkSendBtnDisabled
                    : styles.payLinkSendBtn
                }
              >
                <span className={styles.payLinkSendText}>Send</span>
              </TouchableOpacity>
            </div>
          </div>
        </div>
      )}

      <AlertBox showAlert={zShowAlert} />
    </div>
  );
}
