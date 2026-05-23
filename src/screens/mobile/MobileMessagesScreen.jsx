import { useEffect, useState, useRef, memo } from "react";
import { useParams } from "react-router-dom";
import { ICONS } from "../../styles";
import { AlertBox, CheckBox, Image, TouchableOpacity } from "../../dom_components";
import {
  formatPhoneWithDashes,
  formatDateTimeForReceipt,
  capitalizeFirstLetterOfString,
  calculateRunningTotals,
} from "../../utils";
import {
  useOpenWorkordersStore,
  useLoginStore,
  useAlertScreenStore,
  useSettingsStore,
  useActiveSalesStore,
} from "../../stores";
import {
  dbListenToCustomerMessages,
  dbUpdateMessageCanRespond,
  dbCreateTextToPayInvoice,
} from "../../db_calls_wrapper";
import { firestoreRead } from "../../db_calls";
import { smsService } from "../../data_service_modules";
import {
  ReplyOptionsBar,
  scheduleAutoSend,
  clearAutoSend,
  buildForwardToArray,
  initialSelectedForwardIDs,
} from "../screen_components/Options_Screen/ReplyOptionsBar";
import { WorkorderMediaModal } from "../screen_components/modal_screens/WorkorderMediaModal";
import { SMS_PROTO } from "../../data";
import styles from "./MobileMessagesScreen.module.css";

export function MobileMessagesScreen({ workorderID, onBack }) {
  const params = useParams();
  const woID = workorderID || params?.id;
  const zWorkorder = useOpenWorkordersStore(
    (state) => state.workorders.find((o) => o.id === woID) || null
  );

  const zShowAlert = useAlertScreenStore((s) => s.showAlert);

  const [sMessages, _setMessages] = useState([]);
  const [sNewMessage, _setNewMessage] = useState("");
  const [sSending, _setSending] = useState(false);
  const [sCanRespond, _setCanRespond] = useState(true);
  const [sNotifyMe, _setNotifyMe] = useState(false);
  const [sActionsOpen, _setActionsOpen] = useState(false);
  const [sShowMediaPicker, _setShowMediaPicker] = useState(false);
  const [sShowReplyModal, _setShowReplyModal] = useState(false);
  const [sSelectedForwardIDs, _setSelectedForwardIDs] = useState(() => initialSelectedForwardIDs(null));
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const pendingMediaRef = useRef(null);
  const pendingActionRef = useRef(null);

  const customerPhone = zWorkorder?.customerCell;
  const customerFirst = zWorkorder?.customerFirst || "";
  const customerLast = zWorkorder?.customerLast || "";
  const customerID = zWorkorder?.customerID || "";

  useEffect(() => {
    if (!customerPhone) return;
    const cleanPhone = customerPhone.replace(/\D/g, "");
    const unsubscribe = dbListenToCustomerMessages(customerPhone, (messages) => {
      if (messages) _setMessages(messages);
    });
    const zSettings = useSettingsStore.getState().getSettings();
    const tenantID = zSettings?.tenantID;
    const storeID = zSettings?.storeID;
    if (tenantID && storeID && cleanPhone.length === 10) {
      firestoreRead(`tenants/${tenantID}/stores/${storeID}/sms-messages/${cleanPhone}`)
        .then((data) => {
          if (data && data.canRespond !== undefined) _setCanRespond(!!data.canRespond);
        })
        .catch(() => {});
    }
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [customerPhone]);

  useEffect(() => {
    if (scrollRef.current) {
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 100);
    }
  }, [sMessages.length]);

  function autoResizeInput() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.max(36, el.scrollHeight) + "px";
  }

  async function handleSend() {
    if (!sNewMessage.trim() || sSending) return;
    _setSending(true);
    const currentUser = useLoginStore.getState().getCurrentUser();
    const msg = { ...SMS_PROTO };
    msg.message = sNewMessage.trim();
    msg.phoneNumber = customerPhone;
    if (customerFirst) msg.customerFirst = customerFirst;
    if (customerLast) msg.customerLast = customerLast;
    msg.canRespond = sCanRespond ? true : null;
    msg.millis = new Date().getTime();
    msg.customerID = customerID;
    msg.id = crypto.randomUUID();
    msg.type = "outgoing";
    msg.senderUserObj = currentUser;
    msg.sentByUser = currentUser?.id;
    if (sNotifyMe && currentUser?.id && currentUser?.phone) {
      msg.forwardTo = [{ userID: currentUser.id, phone: currentUser.phone, first: currentUser.first || "" }];
    }
    _setNewMessage("");
    if (inputRef.current) inputRef.current.style.height = "36px";
    const result = await smsService.send(msg);
    if (result.success) {
      const allWOs = useOpenWorkordersStore.getState().workorders;
      allWOs
        .filter((wo) => wo.customerID === customerID)
        .forEach((wo) => {
          useOpenWorkordersStore
            .getState()
            .setField("lastSMSSenderUserID", currentUser?.id, wo.id);
        });
    } else {
      useAlertScreenStore.getState().setValues({
        title: "Message Failed",
        message: result.error || "Failed to send message",
        btn1Text: "OK",
        handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
        showAlert: true,
        canExitOnOuterClick: true,
      });
    }
    _setSending(false);
  }

  async function handleToggleCanRespond() {
    const newVal = !sCanRespond;
    _setCanRespond(newVal);
    await dbUpdateMessageCanRespond(customerPhone, null, newVal);
  }

  function handleMediaPicked(mediaItem) {
    _setShowMediaPicker(false);
    if (!mediaItem || !mediaItem.url) return;
    pendingMediaRef.current = [mediaItem];
    pendingActionRef.current = "media";
    _setShowReplyModal(true);
    scheduleAutoSend(() => {
      _setShowReplyModal(false);
      sendMediaMessage(sCanRespond);
      pendingActionRef.current = null;
      pendingMediaRef.current = null;
    });
  }

  function handleMediaMultiSelect(mediaItems) {
    _setShowMediaPicker(false);
    if (!mediaItems || !mediaItems.length) return;
    pendingMediaRef.current = mediaItems;
    pendingActionRef.current = "media";
    _setShowReplyModal(true);
    scheduleAutoSend(() => {
      _setShowReplyModal(false);
      sendMediaMessage(sCanRespond);
      pendingActionRef.current = null;
      pendingMediaRef.current = null;
    });
  }

  async function sendMediaMessage(canRespondVal, forwardToArrayOrNull) {
    const mediaItems = pendingMediaRef.current;
    if (!mediaItems || !mediaItems.length) return;
    if (!customerPhone || customerPhone.replace(/\D/g, "").length !== 10) return;
    const currentUser = useLoginStore.getState().getCurrentUser();
    const useCanRespond = canRespondVal !== undefined ? canRespondVal : sCanRespond;
    let forwardTo = Array.isArray(forwardToArrayOrNull) ? forwardToArrayOrNull : null;
    if (!forwardTo && sNotifyMe && currentUser?.id && currentUser?.phone) {
      forwardTo = [{ userID: currentUser.id, phone: currentUser.phone, first: currentUser.first || "" }];
    }
    _setShowReplyModal(false);
    const zSettings = useSettingsStore.getState().getSettings();
    const storeName = zSettings?.storeInfo?.displayName || "Our store";
    const hasImages = mediaItems.some((m) => m.type === "image");
    const hasVideos = mediaItems.some((m) => m.type === "video");
    const imageCount = mediaItems.filter((m) => m.type === "image").length;
    const videoCount = mediaItems.filter((m) => m.type === "video").length;
    const parts = [];
    if (hasImages) parts.push(imageCount === 1 ? "a photo" : imageCount + " photos");
    if (hasVideos) parts.push(videoCount === 1 ? "a video" : videoCount + " videos");
    const mediaText = storeName + " has sent you " + parts.join(" and ");
    const msg = { ...SMS_PROTO };
    msg.message = mediaText;
    msg.mediaUrls = mediaItems.map((m) => ({
      url: m.url,
      thumbnailUrl: m.thumbnailUrl || "",
      contentType: m.type === "video" ? "video/mp4" : "image/jpeg",
    }));
    msg.phoneNumber = customerPhone;
    msg.canRespond = useCanRespond ? true : null;
    msg.millis = new Date().getTime();
    msg.customerID = customerID;
    if (customerFirst) msg.customerFirst = customerFirst;
    if (customerLast) msg.customerLast = customerLast;
    msg.id = crypto.randomUUID();
    msg.type = "outgoing";
    msg.senderUserObj = currentUser;
    msg.sentByUser = currentUser?.id;
    if (Array.isArray(forwardTo)) msg.forwardTo = forwardTo;
    const result = await smsService.send(msg);
    if (result.success) {
      const allWOs = useOpenWorkordersStore.getState().workorders;
      allWOs
        .filter((wo) => wo.customerID === customerID)
        .forEach((wo) => {
          useOpenWorkordersStore
            .getState()
            .setField("lastSMSSenderUserID", currentUser?.id, wo.id);
        });
    } else {
      useAlertScreenStore.getState().setValues({
        title: "Message Failed",
        message: result.error || "Failed to send media",
        btn1Text: "OK",
        handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
        showAlert: true,
        canExitOnOuterClick: true,
      });
    }
    pendingMediaRef.current = null;
    pendingActionRef.current = null;
  }

  function handleToggleForward() {
    const currentUser = useLoginStore.getState().getCurrentUser();
    if (!currentUser?.phone) {
      useAlertScreenStore.getState().setValues({
        title: "No Phone Number",
        message:
          "Your user profile does not have a phone number. Add one in settings to receive forwarded replies.",
        btn1Text: "OK",
        handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
        showAlert: true,
        canExitOnOuterClick: true,
      });
      return;
    }
    _setNotifyMe(!sNotifyMe);
  }

  function handleSendPaymentLink() {
    if (!zWorkorder.workorderLines || zWorkorder.workorderLines.length === 0) {
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
    if (zWorkorder.paymentComplete) {
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
    if (zWorkorder.activeSaleID) {
      useAlertScreenStore.getState().setValues({
        title: "Active Sale In Progress",
        message:
          "This workorder has an active sale. Complete or cancel the sale before sending a payment link.",
        btn1Text: "OK",
        handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
        showAlert: true,
        canExitOnOuterClick: true,
      });
      return;
    }
    const zSettings = useSettingsStore.getState().getSettings();
    let amountDue = 0;
    const activeSale = zWorkorder.activeSaleID
      ? useActiveSalesStore.getState().getActiveSale(zWorkorder.activeSaleID)
      : null;
    if (activeSale) {
      amountDue = (activeSale.total || 0) - (activeSale.amountCaptured || 0);
    } else {
      const totals = calculateRunningTotals(
        zWorkorder,
        zSettings?.salesTaxPercent,
        [],
        false,
        !!zWorkorder.taxFree
      );
      amountDue = totals.finalTotal;
    }
    const displayAmount =
      "$" +
      (amountDue / 100).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    useAlertScreenStore.getState().setValues({
      title: "Send SMS Payment",
      message:
        "Send a payment link for " +
        displayAmount +
        " to " +
        customerFirst +
        " at " +
        customerPhone +
        "?",
      btn1Text: "Send",
      btn2Text: "Cancel",
      handleBtn1Press: async () => {
        useAlertScreenStore.getState().resetAll();
        const result = await dbCreateTextToPayInvoice(zWorkorder.id, "sms");
        if (result && result.success) {
          useAlertScreenStore.getState().setValues({
            title: "Payment Link Sent",
            message: "Payment link sent to " + customerFirst + ".",
            btn1Text: "OK",
            handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
            showAlert: true,
            canExitOnOuterClick: true,
          });
        } else {
          useAlertScreenStore.getState().setValues({
            title: "Payment Link Failed",
            message: result?.error || "Failed to send payment link",
            btn1Text: "OK",
            handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
            showAlert: true,
            canExitOnOuterClick: true,
          });
        }
      },
      handleBtn2Press: () => useAlertScreenStore.getState().resetAll(),
      showAlert: true,
      canExitOnOuterClick: true,
    });
  }

  if (!zWorkorder) {
    return (
      <div className={styles.notFoundWrap}>
        <span className={styles.notFoundText}>Workorder not found</span>
      </div>
    );
  }

  if (!customerPhone) {
    return (
      <div className={styles.notFoundWrap}>
        <span className={styles.notFoundText}>No phone number on file</span>
      </div>
    );
  }

  const sendEnabled = !!sNewMessage.trim() && !sSending;

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <TouchableOpacity onPress={onBack} style={{ display: "flex", flexDirection: "row", alignItems: "center", flex: 1, padding: 4 }}>
          {onBack ? (
            <Image icon={ICONS.downChevron} size={16} style={{ transform: "rotate(90deg)", marginRight: 10 }} />
          ) : null}
          <div className={styles.headerTextWrap}>
            <span className={styles.headerName}>
              {capitalizeFirstLetterOfString(customerFirst) +
                " " +
                capitalizeFirstLetterOfString(customerLast)}
            </span>
            <span className={styles.headerPhone}>
              {formatPhoneWithDashes(customerPhone)}
            </span>
          </div>
        </TouchableOpacity>
      </div>

      <div className={styles.messagesWrap}>
        <div ref={scrollRef} className={styles.messagesScroll}>
          {sMessages.length === 0 && (
            <div className={styles.emptyState}>
              <span className={styles.emptyText}>No messages yet</span>
            </div>
          )}
          {sMessages.map((msg) => {
            if (msg.type === "incoming") {
              return <IncomingBubble key={msg.id} msgObj={msg} />;
            }
            return <OutgoingBubble key={msg.id} msgObj={msg} />;
          })}
          <div className={styles.bottomSpacer} />
        </div>
      </div>

      <div className={styles.inputArea}>
        <div className={styles.topBar}>
          <div className={styles.menuWrap}>
            <TouchableOpacity
              onPress={() => _setActionsOpen(!sActionsOpen)}
              style={{ padding: 6 }}
            >
              <Image icon={ICONS.menu2} size={22} />
            </TouchableOpacity>
            {sActionsOpen ? (
              <div className={styles.menuDropdown}>
                <div
                  className={styles.menuItem}
                  onClick={() => {
                    _setActionsOpen(false);
                    handleSendPaymentLink();
                  }}
                >
                  <span className={styles.menuItemText}>Send invoice</span>
                </div>
                <div className={styles.menuDivider} />
                <div
                  className={styles.menuItem}
                  onClick={() => {
                    _setActionsOpen(false);
                    _setShowMediaPicker(true);
                  }}
                >
                  <span className={styles.menuItemText}>Send media</span>
                </div>
              </div>
            ) : null}
          </div>
          <CheckBox
            isChecked={sNotifyMe}
            onCheck={() => {
              const currentUser = useLoginStore.getState().getCurrentUser();
              if (!currentUser?.phone) {
                useAlertScreenStore.getState().setValues({
                  title: "No Phone Number",
                  message:
                    "Your user profile does not have a phone number. Add one in settings to receive forwarded replies.",
                  btn1Text: "OK",
                  handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
                  showAlert: true,
                  canExitOnOuterClick: true,
                });
                return;
              }
              _setNotifyMe(!sNotifyMe);
            }}
            text="Notify me"
          />
          <CheckBox
            isChecked={sCanRespond}
            onCheck={handleToggleCanRespond}
            text="User can respond"
          />
        </div>
        <ReplyOptionsBar
          visible={sShowReplyModal}
          hasActivePhone={!!useLoginStore.getState().getCurrentUser()?.phone}
          onSelectCanRespond={(canRespond) => {
            clearAutoSend();
            _setCanRespond(canRespond);
            _setShowReplyModal(false);
            if (pendingActionRef.current === "media") {
              sendMediaMessage(canRespond);
            }
          }}
          selectedForwardIDs={sSelectedForwardIDs}
          onChangeSelectedForwardIDs={_setSelectedForwardIDs}
          onFire={() => {
            if (!sSelectedForwardIDs?.length) return;
            const users = useSettingsStore.getState().getSettings()?.users || [];
            const forwardToArray = buildForwardToArray(sSelectedForwardIDs, users);
            clearAutoSend();
            _setCanRespond(true);
            _setShowReplyModal(false);
            if (pendingActionRef.current === "media") {
              sendMediaMessage(true, forwardToArray);
              pendingActionRef.current = null;
            }
          }}
        />
        <div className={styles.inputRow}>
          <textarea
            ref={inputRef}
            value={sNewMessage}
            onChange={(e) => {
              let val = e.target.value;
              if (val.length === 1) val = val.toUpperCase();
              _setNewMessage(val);
              if (sShowReplyModal) {
                _setShowReplyModal(false);
                clearAutoSend();
              }
              autoResizeInput();
            }}
            placeholder="Type a message..."
            rows={1}
            className={styles.textInput}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!sendEnabled}
            className={`${styles.sendBtn} ${
              sendEnabled ? styles.sendBtnEnabled : styles.sendBtnDisabled
            }`}
          >
            <span className={styles.sendBtnIcon}>{"\u2191"}</span>
          </button>
        </div>
      </div>
      <AlertBox showAlert={zShowAlert} />
      {sShowMediaPicker && woID && (
        <WorkorderMediaModal
          visible={true}
          onClose={() => _setShowMediaPicker(false)}
          workorderID={woID}
          mode="view"
          onSelect={handleMediaPicked}
          onSendMedia={handleMediaMultiSelect}
        />
      )}
    </div>
  );
}

const IncomingBubble = memo(({ msgObj }) => {
  const dateObj = formatDateTimeForReceipt(null, msgObj.millis);
  return (
    <div className={styles.bubbleWrapIncoming}>
      <div className={styles.bubbleIncoming}>
        <span className={styles.bubbleTextIncoming}>{msgObj.message}</span>
      </div>
      <span className={styles.timestampIncoming}>
        {dateObj.dayOfWeek + ", " + dateObj.time}
      </span>
    </div>
  );
});

const OutgoingBubble = memo(({ msgObj }) => {
  const dateObj = formatDateTimeForReceipt(null, msgObj.millis);
  const bubbleClass =
    msgObj.status === "failed"
      ? styles.bubbleOutgoingFailed
      : styles.bubbleOutgoingNormal;
  return (
    <div className={styles.bubbleWrapOutgoing}>
      <div className={bubbleClass}>
        <span className={styles.bubbleTextOutgoing}>{msgObj.message}</span>
      </div>
      <span className={styles.timestampOutgoing}>
        {dateObj.dayOfWeek + ", " + dateObj.time}
      </span>
      {msgObj.status === "sending" && (
        <span className={styles.statusSending}>Sending...</span>
      )}
      {msgObj.status === "failed" && (
        <span className={styles.statusFailed}>
          Failed to send
          {msgObj.errorMessage ? ": " + msgObj.errorMessage : ""}
        </span>
      )}
    </div>
  );
});
