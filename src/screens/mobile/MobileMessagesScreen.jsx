import { useEffect, useState, useRef, memo } from "react";
import { useParams } from "react-router-dom";
import { ICONS } from "../../styles";
import { AlertBox, CheckBox, Image, SwipeBackHint, TouchableOpacity } from "../../dom_components";
import {
  formatPhoneWithDashes,
  formatDateTimeForReceipt,
  capitalizeFirstLetterOfString,
  calculateRunningTotals,
  getWorkorderPaymentState,
} from "../../utils";
import {
  useOpenWorkordersStore,
  useLoginStore,
  useAlertScreenStore,
  useSettingsStore,
  useActiveSalesStore,
  useCustMessagesStore,
} from "../../stores";
import {
  dbListenToCustomerMessages,
  dbUpdateMessageCanRespond,
  dbToggleSMSForwarding,
  dbCreateTextToPayInvoice,
} from "../../db_calls_wrapper";
import { smsService } from "../../data_service_modules";
import {
  ReplyOptionsBar,
  scheduleAutoSend,
  clearAutoSend,
  buildForwardToArray,
  initialSelectedForwardIDs,
} from "../screen_components/Options_Screen/ReplyOptionsBar";
import { applyOptimisticThreadPatch } from "../screen_components/Options_Screen/MessageBubble";
import { WorkorderMediaModal } from "../screen_components/modal_screens/WorkorderMediaModal";
import { SMS_PROTO } from "../../data";
import styles from "./MobileMessagesScreen.module.css";

export function MobileMessagesScreen({ workorderID, onBack, backLabel = "Back" }) {
  const params = useParams();
  const woID = workorderID || params?.id;
  const zWorkorder = useOpenWorkordersStore(
    (state) => state.workorders.find((o) => o.id === woID) || null
  );

  const zShowAlert = useAlertScreenStore((s) => s.showAlert);
  const zSmsThreads = useCustMessagesStore((state) => state.getSmsThreads());

  const [sMessages, _setMessages] = useState([]);
  const [sNewMessage, _setNewMessage] = useState("");
  const [sSending, _setSending] = useState(false);
  const [sActionsOpen, _setActionsOpen] = useState(false);
  const [sShowMediaPicker, _setShowMediaPicker] = useState(false);
  const [sShowReplyModal, _setShowReplyModal] = useState(false);
  const [sSelectedForwardIDs, _setSelectedForwardIDs] = useState(() => initialSelectedForwardIDs(null));
  const [sSwipeX, _setSwipeX] = useState(0);
  const [sSwiping, _setSwiping] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const pendingMediaRef = useRef(null);
  const pendingActionRef = useRef(null);
  const swipeStartRef = useRef(null);

  const customerPhone = zWorkorder?.customerCell;
  const customerFirst = zWorkorder?.customerFirst || "";
  const customerLast = zWorkorder?.customerLast || "";
  const customerID = zWorkorder?.customerID || "";

  const cleanCustomerPhone = (customerPhone || "").replace(/\D/g, "");
  const thread = zSmsThreads.find((t) => t.phone === cleanCustomerPhone);
  const canRespond = thread?.canRespond !== false && thread?.canRespond !== null;
  const currentUserID = useLoginStore.getState().getCurrentUser()?.id;
  const forwardArr = Array.isArray(thread?.forwardTo) ? thread.forwardTo : [];
  const isForwarding = !!currentUserID && forwardArr.some((f) => f.userID === currentUserID);

  useEffect(() => {
    if (!customerPhone) return;
    const cleanPhone = (customerPhone || "").replace(/\D/g, "");

    // Phone-route defaults: both checkboxes default checked. Optimistic patch
    // first (instant UI), fire-and-forget DB writes. Only push on fresh threads
    // (no prior outgoing activity) so we don't override explicit user choices.
    if (cleanPhone.length === 10) {
      const currentUser = useLoginStore.getState().getCurrentUser();
      const existingThread = useCustMessagesStore
        .getState()
        .getSmsThreads()
        .find((t) => t.phone === cleanPhone);

      if (!existingThread?.lastOutgoingMillis) {
        applyOptimisticThreadPatch(cleanPhone, true, null);
        dbUpdateMessageCanRespond(cleanPhone, null, true);

        if (currentUser?.id && currentUser?.phone) {
          const existingForward = Array.isArray(existingThread?.forwardTo)
            ? existingThread.forwardTo
            : [];
          const alreadyForwarding = existingForward.some(
            (f) => f.userID === currentUser.id
          );
          if (!alreadyForwarding) {
            const nextForward = [
              ...existingForward,
              {
                userID: currentUser.id,
                phone: currentUser.phone,
                first: currentUser.first || "",
              },
            ];
            applyOptimisticThreadPatch(cleanPhone, undefined, nextForward);
            dbToggleSMSForwarding(
              cleanPhone,
              currentUser.id,
              true,
              currentUser.phone,
              currentUser.first
            );
          }
        }
      }
    }

    const unsubscribe = dbListenToCustomerMessages(customerPhone, (messages) => {
      if (messages) _setMessages(messages);
    });
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
    if (sNewMessage.trim().length < 2 || sSending) return;
    _setSending(true);
    const currentUser = useLoginStore.getState().getCurrentUser();
    const msg = { ...SMS_PROTO };
    msg.message = sNewMessage.trim();
    msg.phoneNumber = customerPhone;
    if (customerFirst) msg.customerFirst = customerFirst;
    if (customerLast) msg.customerLast = customerLast;
    msg.canRespond = canRespond ? true : null;
    msg.millis = new Date().getTime();
    msg.customerID = customerID;
    msg.id = crypto.randomUUID();
    msg.type = "outgoing";
    msg.senderUserObj = currentUser;
    msg.sentByUser = currentUser?.id;
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
    if (!cleanCustomerPhone || cleanCustomerPhone.length !== 10) return;
    const newVal = !canRespond;
    applyOptimisticThreadPatch(cleanCustomerPhone, newVal, null);
    const currentUser = useLoginStore.getState().getCurrentUser();
    const alsoUnforward =
      !newVal && currentUser?.id && forwardArr.some((f) => f.userID === currentUser.id);
    if (alsoUnforward) {
      const nextForward = forwardArr.filter((f) => f.userID !== currentUser.id);
      applyOptimisticThreadPatch(cleanCustomerPhone, undefined, nextForward);
    }
    await dbUpdateMessageCanRespond(cleanCustomerPhone, null, newVal);
    if (alsoUnforward) {
      await dbToggleSMSForwarding(cleanCustomerPhone, currentUser.id, false, currentUser.phone, currentUser.first);
    }
  }

  async function handleToggleForward() {
    if (!cleanCustomerPhone || cleanCustomerPhone.length !== 10) return;
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
    const isCurrentlyForwarding = forwardArr.some((f) => f.userID === currentUser.id);
    const nextForward = isCurrentlyForwarding
      ? forwardArr.filter((f) => f.userID !== currentUser.id)
      : [...forwardArr, { userID: currentUser.id, phone: currentUser.phone || "", first: currentUser.first || "" }];
    const nextCanRespond = (!isCurrentlyForwarding && !canRespond) ? true : undefined;
    applyOptimisticThreadPatch(cleanCustomerPhone, nextCanRespond, nextForward);
    if (!isCurrentlyForwarding && !canRespond) {
      await dbUpdateMessageCanRespond(cleanCustomerPhone, null, true);
    }
    await dbToggleSMSForwarding(cleanCustomerPhone, currentUser.id, !isCurrentlyForwarding, currentUser.phone, currentUser.first);
  }

  function handleMediaPicked(mediaItem) {
    _setShowMediaPicker(false);
    if (!mediaItem || !mediaItem.url) return;
    pendingMediaRef.current = [mediaItem];
    pendingActionRef.current = "media";
    _setShowReplyModal(true);
    scheduleAutoSend(() => {
      _setShowReplyModal(false);
      sendMediaMessage(canRespond);
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
      sendMediaMessage(canRespond);
      pendingActionRef.current = null;
      pendingMediaRef.current = null;
    });
  }

  async function sendMediaMessage(canRespondVal, forwardToArrayOrNull) {
    const mediaItems = pendingMediaRef.current;
    if (!mediaItems || !mediaItems.length) return;
    if (!customerPhone || customerPhone.replace(/\D/g, "").length !== 10) return;
    const currentUser = useLoginStore.getState().getCurrentUser();
    const useCanRespond = canRespondVal !== undefined ? canRespondVal : canRespond;
    const forwardTo = Array.isArray(forwardToArrayOrNull) ? forwardToArrayOrNull : null;
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
    const zSettings = useSettingsStore.getState().getSettings();
    const activeSale = zWorkorder.activeSaleID
      ? useActiveSalesStore.getState().getActiveSale(zWorkorder.activeSaleID)
      : null;
    const paymentState = getWorkorderPaymentState(zWorkorder, activeSale, zSettings);
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

  const sendEnabled = sNewMessage.trim().length >= 2 && !sSending;

  function handleTouchStart(e) {
    if (!onBack) return;
    const t = e.touches[0];
    if (t.clientX > 30) return;
    swipeStartRef.current = { x: t.clientX, time: Date.now() };
    _setSwiping(true);
  }

  function handleTouchMove(e) {
    if (!swipeStartRef.current) return;
    const t = e.touches[0];
    const dx = t.clientX - swipeStartRef.current.x;
    if (dx > 0) _setSwipeX(dx);
  }

  function handleTouchEnd() {
    if (!swipeStartRef.current) return;
    const elapsed = Date.now() - swipeStartRef.current.time;
    const velocity = sSwipeX / Math.max(elapsed, 1);
    const commitThreshold = window.innerWidth * 0.3;
    const isCommit = sSwipeX > commitThreshold || velocity > 0.5;
    swipeStartRef.current = null;
    _setSwiping(false);
    if (isCommit && onBack) {
      _setSwipeX(window.innerWidth);
      setTimeout(() => {
        onBack();
        _setSwipeX(0);
      }, 200);
    } else {
      _setSwipeX(0);
    }
  }

  return (
    <div
      className={styles.root}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        transform: `translateX(${sSwipeX}px)`,
        transition: sSwiping ? "none" : "transform 200ms ease",
      }}
    >
      <SwipeBackHint label="Workorder" swipeX={sSwipeX} />
      <div className={styles.header}>
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
              <Image icon={ICONS.menu2} size={24} />
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
            isChecked={isForwarding}
            onCheck={handleToggleForward}
            text="Notify me"
            iconSize={17}
            textStyle={{ fontSize: 17 }}
          />
          <CheckBox
            isChecked={canRespond}
            onCheck={handleToggleCanRespond}
            text="User can respond"
            iconSize={17}
            textStyle={{ fontSize: 17 }}
          />
        </div>
        <ReplyOptionsBar
          visible={sShowReplyModal}
          hasActivePhone={!!useLoginStore.getState().getCurrentUser()?.phone}
          onSelectCanRespond={(nextCanRespond) => {
            clearAutoSend();
            if (cleanCustomerPhone && cleanCustomerPhone.length === 10) {
              applyOptimisticThreadPatch(cleanCustomerPhone, nextCanRespond, null);
              dbUpdateMessageCanRespond(cleanCustomerPhone, null, nextCanRespond);
            }
            _setShowReplyModal(false);
            if (pendingActionRef.current === "media") {
              sendMediaMessage(nextCanRespond);
            }
          }}
          selectedForwardIDs={sSelectedForwardIDs}
          onChangeSelectedForwardIDs={_setSelectedForwardIDs}
          onFire={() => {
            if (!sSelectedForwardIDs?.length) return;
            const users = useSettingsStore.getState().getSettings()?.users || [];
            const forwardToArray = buildForwardToArray(sSelectedForwardIDs, users);
            clearAutoSend();
            if (cleanCustomerPhone && cleanCustomerPhone.length === 10) {
              applyOptimisticThreadPatch(cleanCustomerPhone, true, null);
              dbUpdateMessageCanRespond(cleanCustomerPhone, null, true);
            }
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
            placeholder="Message..."
            rows={1}
            className={styles.textInput}
          />
          <div className={styles.sendColumn}>
            <TouchableOpacity
              onPress={() => {
                if (sendEnabled) handleSend();
              }}
              className={styles.sendButton}
              style={{ opacity: sendEnabled ? 1 : 0.3 }}
            >
              <Image icon={ICONS.airplane} size={41} />
            </TouchableOpacity>
          </div>
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
