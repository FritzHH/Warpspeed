import { useState, useRef, useEffect } from "react";
import { ICONS } from "../../../styles";
import {
  useOpenWorkordersStore,
  useAlertScreenStore,
  useRoadCallStore,
  useCurrentCustomerStore,
} from "../../../stores";
import {
  capitalizeFirstLetterOfString,
  formatPhoneWithDashes,
  formatPhoneWithParens,
  removeDashesFromPhone,
  checkInputForNumbersOnly,
} from "../../../utils";
import {
  dbGetCustomer,
  dbSaveCustomer,
  dbInitiateRoadCall,
  dbCancelRoadCall,
  dbSetCallExpectation,
  dbClearCallExpectation,
  dbCheckCellPhoneExists,
  dbMigrateCustomerPhone,
} from "../../../db_calls_wrapper";
import { Image, SmallLoadingIndicator, TouchableOpacity, DropdownMenu, Button } from "../../../dom_components";
import styles from "./CustomerSection.module.css";

const CUSTOMER_TO_WORKORDER_FIELDS = {
  first: "customerFirst",
  last: "customerLast",
  customerCell: "customerCell",
  customerLandline: "customerLandline",
  email: "customerEmail",
};

function formatCallbackRemaining(ms) {
  if (!ms || ms <= 0) return "expired";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function CustomerSection({ workorder, zSettings, onShowMessages, headless = false }) {
  const customerName = workorder.customerID
    ? `${capitalizeFirstLetterOfString(workorder.customerFirst || "")} ${capitalizeFirstLetterOfString(workorder.customerLast || "")}`.trim()
    : "Walk-in";

  const initialCachedCustomer = (() => {
    if (!workorder.customerID) return null;
    const cached = useCurrentCustomerStore.getState().getCustomer?.();
    if (cached?.id && cached.id === workorder.customerID) return cached;
    return null;
  })();

  const [sOpen, _setOpen] = useState(true);
  const [sEditing, _setEditing] = useState(false);
  const [sCustomer, _setCustomer] = useState(initialCachedCustomer);
  const [sLoading, _setLoading] = useState(!!workorder.customerID && !initialCachedCustomer);
  const [sCellEditing, _setCellEditing] = useState(false);
  const [sCellEditValue, _setCellEditValue] = useState("");
  const [sCellDuplicateStatus, _setCellDuplicateStatus] = useState(null);
  const [sCellMigrating, _setCellMigrating] = useState(false);
  const fetchedRef = useRef(!!initialCachedCustomer);
  const mountedRef = useRef(true);
  const initialCellRef = useRef(initialCachedCustomer?.customerCell || "");

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const zExpectations = useRoadCallStore((s) => s.expectations);
  const customerE164 = (() => {
    const raw = String(sCustomer?.customerCell || "").replace(/\D/g, "");
    if (raw.length === 10) return `+1${raw}`;
    if (raw.length === 11 && raw.startsWith("1")) return `+${raw}`;
    return "";
  })();
  const activeExpectationForThisCustomer = customerE164
    ? zExpectations.find((e) => e.id === customerE164 || e.customerPhone === customerE164)
    : null;

  const hasActiveExpectation = !!activeExpectationForThisCustomer;
  const [, _setCallbackTick] = useState(0);
  useEffect(() => {
    if (!hasActiveExpectation) return;
    const id = setInterval(() => _setCallbackTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [hasActiveExpectation]);
  const callbackRemainingMs = activeExpectationForThisCustomer
    ? (activeExpectationForThisCustomer.expiresAt || 0) - Date.now()
    : 0;

  if (!fetchedRef.current && workorder.customerID) {
    fetchedRef.current = true;
    dbGetCustomer(workorder.customerID)
      .then((c) => {
        _setCustomer(c);
        _setLoading(false);
        if (c?.id) useCurrentCustomerStore.getState().setCustomer(c, false);
      })
      .catch(() => _setLoading(false));
  }

  function handleToggle() {
    if (!workorder.customerID) return;
    const opening = !sOpen;
    _setOpen(opening);
    if (opening && !sCustomer) {
      const cached = useCurrentCustomerStore.getState().getCustomer?.();
      if (cached?.id === workorder.customerID) {
        _setCustomer(cached);
        return;
      }
      _setLoading(true);
      dbGetCustomer(workorder.customerID)
        .then((c) => {
          _setCustomer(c);
          _setLoading(false);
          if (c?.id) useCurrentCustomerStore.getState().setCustomer(c, false);
        })
        .catch(() => _setLoading(false));
    }
  }

  async function checkCellPhoneUnique(phone) {
    const clean = (phone || "").replace(/\D/g, "");
    if (clean.length < 10) { _setCellDuplicateStatus(null); return; }
    const cleanedOriginal = (sCustomer?.customerCell || "").replace(/\D/g, "");
    if (clean === cleanedOriginal) { _setCellDuplicateStatus(null); return; }
    _setCellDuplicateStatus("checking");
    try {
      const { exists } = await dbCheckCellPhoneExists(clean, sCustomer?.id);
      if (!mountedRef.current) return;
      _setCellDuplicateStatus(exists ? "duplicate" : "unique");
    } catch (e) {
      if (!mountedRef.current) return;
      _setCellDuplicateStatus("error");
    }
  }

  function handleCellEditStart() {
    _setCellEditValue(sCustomer?.customerCell || "");
    initialCellRef.current = sCustomer?.customerCell || "";
    _setCellEditing(true);
    _setCellDuplicateStatus(null);
  }

  function handleCellEditCancel() {
    _setCellEditing(false);
    _setCellEditValue("");
    _setCellDuplicateStatus(null);
  }

  function handleCellSavePress() {
    const oldPhone = sCustomer?.customerCell || "";
    const newPhone = sCellEditValue.replace(/\D/g, "");
    if (newPhone === oldPhone) {
      handleCellEditCancel();
      return;
    }
    if (sCellDuplicateStatus === "duplicate") return;
    useAlertScreenStore.getState().setValues({
      title: "Change Phone Number",
      message: `Change cell from ${formatPhoneWithDashes(oldPhone)} to ${formatPhoneWithDashes(newPhone)}?\n\nA system copy of recent messages will take place. It may be a few minutes before the customer can send a message.`,
      btn1Text: "CONFIRM",
      btn2Text: "CANCEL",
      handleBtn1Press: () => executeCellMigration(oldPhone, newPhone),
      handleBtn2Press: () => useAlertScreenStore.getState().resetAll(),
      showAlert: true,
      canExitOnOuterClick: false,
    });
  }

  async function executeCellMigration(oldPhone, newPhone) {
    useAlertScreenStore.getState().resetAll();
    _setCellMigrating(true);
    try {
      const result = await dbMigrateCustomerPhone(
        oldPhone, newPhone,
        sCustomer.id, sCustomer.first, sCustomer.last
      );
      if (!mountedRef.current) return;
      if (result.success) {
        saveCustomerField("customerCell", newPhone);
        initialCellRef.current = newPhone;
        _setCellEditing(false);
        _setCellEditValue("");
        _setCellDuplicateStatus(null);
      } else {
        useAlertScreenStore.getState().setValues({
          title: "Migration Failed",
          message: result.error || "Failed to migrate phone number.",
          btn1Text: "OK",
          handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
          showAlert: true,
          canExitOnOuterClick: true,
        });
      }
    } catch (e) {
      if (!mountedRef.current) return;
      useAlertScreenStore.getState().setValues({
        title: "Migration Error",
        message: e.message || "An unexpected error occurred.",
        btn1Text: "OK",
        handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
        showAlert: true,
        canExitOnOuterClick: true,
      });
    } finally {
      if (mountedRef.current) _setCellMigrating(false);
    }
  }

  function saveCustomerField(fieldName, val) {
    _setCustomer((prev) => {
      const updated = { ...prev, [fieldName]: val };
      dbSaveCustomer(updated);
      const cached = useCurrentCustomerStore.getState().getCustomer?.();
      if (cached?.id === updated.id) {
        useCurrentCustomerStore.getState().setCustomer(updated, false);
      }
      const woField = CUSTOMER_TO_WORKORDER_FIELDS[fieldName];
      if (woField) {
        const allWOs = useOpenWorkordersStore.getState().getWorkorders() || [];
        allWOs
          .filter((wo) => wo.customerID === prev.id)
          .forEach((wo) => {
            useOpenWorkordersStore.getState().setField(woField, val, wo.id);
          });
      }
      return updated;
    });
  }

  function buildFullAddress(customer) {
    const parts = [];
    if (customer.streetAddress) parts.push(customer.streetAddress);
    if (customer.unit) parts.push(customer.unit);
    if (customer.city) parts.push(customer.city);
    if (customer.state) parts.push(customer.state);
    if (customer.zip) parts.push(customer.zip);
    return parts.join(", ");
  }

  function handleAddressPress() {
    if (!sCustomer) return;
    const dest = buildFullAddress(sCustomer);
    if (!dest) return;
    const storeInfo = zSettings?.storeInfo || {};
    const originParts = [];
    if (storeInfo.street) originParts.push(storeInfo.street);
    if (storeInfo.city) originParts.push(storeInfo.city);
    if (storeInfo.state) originParts.push(storeInfo.state);
    if (storeInfo.zip) originParts.push(storeInfo.zip);
    const origin = originParts.join(", ");
    const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}`;
    window.open(url, "_blank");
  }

  function handleCallPress(phone) {
    const formatted = formatPhoneWithParens(phone);
    const first = capitalizeFirstLetterOfString(sCustomer?.first || "");
    const lastInitial = (sCustomer?.last || "").charAt(0).toUpperCase();
    const nameStr = lastInitial ? `${first} ${lastInitial}` : first;
    useAlertScreenStore.getState().setValues({
      title: "Place Call?",
      message: `This will ring ${nameStr}.\n${formatted}`,
      btn1Text: "CALL",
      handleBtn1Press: () => {
        useAlertScreenStore.getState().resetAll();
        doInitiateCall(phone);
      },
      btn2Text: "CANCEL",
      handleBtn2Press: () => useAlertScreenStore.getState().resetAll(),
      showAlert: true,
      canExitOnOuterClick: true,
    });
  }

  function handleAllowCallbacksPress() {
    const first = capitalizeFirstLetterOfString(sCustomer?.first || "");
    const lastInitial = (sCustomer?.last || "").charAt(0).toUpperCase();
    const nameStr = lastInitial ? `${first} ${lastInitial}` : first || "this customer";
    useAlertScreenStore.getState().setValues({
      title: "Allow Callbacks?",
      message: `For the next 30 minutes, any incoming call from ${nameStr} will ring your phone directly instead of the store line.`,
      subMessage: "You may turn off callbacks at any time",
      btn1Text: "CONFIRM",
      handleBtn1Press: () => {
        useAlertScreenStore.getState().resetAll();
        handleExpectCallback();
      },
      btn2Text: "Cancel",
      handleBtn2Press: () => useAlertScreenStore.getState().resetAll(),
      showAlert: true,
      canExitOnOuterClick: true,
    });
  }

  function handleDisallowCallbacksPress() {
    const first = capitalizeFirstLetterOfString(sCustomer?.first || "");
    const lastInitial = (sCustomer?.last || "").charAt(0).toUpperCase();
    const nameStr = lastInitial ? `${first} ${lastInitial}` : first || "this customer";
    useAlertScreenStore.getState().setValues({
      title: "Disallow Callbacks?",
      message: `Incoming calls from ${nameStr} will no longer ring your phone. They will route to the store line as normal.`,
      subMessage: "You may re-enable callbacks at any time",
      btn1Text: "CONFIRM",
      handleBtn1Press: () => {
        useAlertScreenStore.getState().resetAll();
        handleClearCallback();
      },
      btn2Text: "Cancel",
      handleBtn2Press: () => useAlertScreenStore.getState().resetAll(),
      showAlert: true,
      canExitOnOuterClick: true,
    });
  }

  async function doInitiateCall(phone) {
    const first = capitalizeFirstLetterOfString(sCustomer?.first || "");
    const lastInitial = (sCustomer?.last || "").charAt(0).toUpperCase();
    const nameStr = lastInitial ? `${first} ${lastInitial}` : first || "customer";
    const ticket = { cancelled: false };
    useAlertScreenStore.getState().setValues({
      title: "Calling...",
      message: `Connecting to ${nameStr}. Your phone will ring shortly.`,
      btn1Text: "CANCEL",
      handleBtn1Press: () => {
        ticket.cancelled = true;
        useAlertScreenStore.getState().resetAll();
      },
      showAlert: true,
      canExitOnOuterClick: false,
    });
    const result = await dbInitiateRoadCall({
      customerPhone: phone,
      customerName: `${sCustomer?.first || ""} ${sCustomer?.last || ""}`.trim(),
      customerID: sCustomer?.id || workorder.customerID || "",
    });
    const callSid = result?.data?.callSid;
    if (ticket.cancelled) {
      if (callSid) {
        dbCancelRoadCall({ callSid, customerPhone: phone }).catch(() => {});
      }
      return;
    }
    if (!result?.success) {
      useAlertScreenStore.getState().setValues({
        title: "Call Failed",
        message: result?.error || "Could not start the call.",
        btn1Text: "OK",
        handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
        showAlert: true,
        canExitOnOuterClick: true,
      });
      return;
    }
    useAlertScreenStore.getState().resetAll();
  }

  async function handleExpectCallback() {
    if (!sCustomer?.customerCell) return;
    const result = await dbSetCallExpectation({
      customerPhone: sCustomer.customerCell,
      customerName: `${sCustomer?.first || ""} ${sCustomer?.last || ""}`.trim(),
      customerID: sCustomer?.id || workorder.customerID || "",
    });
    if (!result?.success) {
      useAlertScreenStore.getState().setValues({
        title: "Couldn't Arm Callback",
        message: result?.error || "Failed to set callback window.",
        btn1Text: "OK",
        handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
        showAlert: true,
        canExitOnOuterClick: true,
      });
    }
  }

  async function handleClearCallback() {
    if (!sCustomer?.customerCell) return;
    await dbClearCallExpectation(sCustomer.customerCell);
  }

  return (
    <div className={styles.root}>
      {!headless && (
        <TouchableOpacity
          onPress={handleToggle}
          className={styles.header}
          activeOpacity={workorder.customerID ? 0.6 : 1}
        >
          <span className={styles.customerName}>{customerName}</span>
          {workorder.customerID ? (
            <Image
              icon={ICONS.downChevron}
              size={14}
              className={`${styles.chevron} ${sOpen ? styles.chevronOpen : ""}`}
            />
          ) : null}
        </TouchableOpacity>
      )}

      {(headless || sOpen) && workorder.customerID ? (
        <div className={styles.card}>
          {sLoading ? (
            <SmallLoadingIndicator />
          ) : sCustomer ? (
            <div>
              <div className={styles.cardHeader}>
                <span className={styles.cardHeaderLabel}>CUSTOMER INFO</span>
                <TouchableOpacity
                  onPress={() => _setEditing(!sEditing)}
                  className={styles.editBtn}
                >
                  <Image icon={ICONS.editPencil} size={18} />
                </TouchableOpacity>
              </div>

              {sEditing ? (
                <div>
                  <input
                    className={styles.input}
                    value={capitalizeFirstLetterOfString(sCustomer.first || "")}
                    onChange={(e) =>
                      saveCustomerField("first", capitalizeFirstLetterOfString(e.target.value))
                    }
                    placeholder="First name"
                  />
                  <input
                    className={styles.input}
                    value={capitalizeFirstLetterOfString(sCustomer.last || "")}
                    onChange={(e) =>
                      saveCustomerField("last", capitalizeFirstLetterOfString(e.target.value))
                    }
                    placeholder="Last name"
                  />
                  {sCellMigrating ? (
                    <div className={styles.cellInlineRow}>
                      <input
                        className={styles.cellInlineInput}
                        value={formatPhoneWithDashes(sCustomer.customerCell || "")}
                        disabled
                        placeholder="Cell phone"
                      />
                      <SmallLoadingIndicator />
                    </div>
                  ) : sCellEditing ? (
                    (() => {
                      const cleaned = sCellEditValue.replace(/\D/g, "");
                      const cleanedOriginal = (sCustomer?.customerCell || "").replace(/\D/g, "");
                      const saveEnabled =
                        cleaned.length === 10 &&
                        cleaned !== cleanedOriginal &&
                        sCellDuplicateStatus !== "duplicate" &&
                        sCellDuplicateStatus !== "error" &&
                        sCellDuplicateStatus !== "checking";
                      return (
                        <div>
                          <div className={styles.cellInlineRow}>
                            <input
                              className={styles.cellInlineInput}
                              value={formatPhoneWithDashes(sCellEditValue)}
                              onChange={(e) => {
                                const val = removeDashesFromPhone(e.target.value);
                                if (val.length > 10) return;
                                _setCellEditValue(val);
                                checkCellPhoneUnique(val);
                              }}
                              placeholder="Cell phone"
                              autoFocus
                            />
                            <Button
                              icon={ICONS.greenCheck}
                              iconSize={18}
                              enabled={saveEnabled}
                              onPress={handleCellSavePress}
                              buttonStyle={{ padding: 4, backgroundColor: "transparent" }}
                              iconStyle={{ marginRight: 0 }}
                            />
                            <Button
                              icon={ICONS.redx}
                              iconSize={18}
                              onPress={handleCellEditCancel}
                              buttonStyle={{ padding: 4, backgroundColor: "transparent" }}
                              iconStyle={{ marginRight: 0 }}
                            />
                          </div>
                          {sCellDuplicateStatus === "duplicate" ? (
                            <div className={styles.cellDuplicateMsg}>
                              This number is already in use by another customer.
                            </div>
                          ) : null}
                        </div>
                      );
                    })()
                  ) : (
                    <div className={styles.cellInlineRow}>
                      <input
                        className={styles.cellInlineInput}
                        value={formatPhoneWithDashes(sCustomer.customerCell || "")}
                        readOnly
                        placeholder="Cell phone"
                      />
                      <Button
                        icon={ICONS.editPencil}
                        iconSize={18}
                        onPress={handleCellEditStart}
                        buttonStyle={{ padding: 4, backgroundColor: "transparent" }}
                        iconStyle={{ marginRight: 0 }}
                      />
                    </div>
                  )}
                  <input
                    className={styles.input}
                    value={formatPhoneWithDashes(sCustomer.customerLandline || "")}
                    onChange={(e) => {
                      const val = removeDashesFromPhone(e.target.value);
                      if (val.length > 10) return;
                      saveCustomerField("customerLandline", val);
                    }}
                    placeholder="Landline"
                  />
                  <input
                    className={styles.input}
                    value={sCustomer.email || ""}
                    onChange={(e) => saveCustomerField("email", e.target.value)}
                    placeholder="Email"
                  />
                  <input
                    className={styles.input}
                    value={capitalizeFirstLetterOfString(sCustomer.streetAddress || "")}
                    onChange={(e) =>
                      saveCustomerField("streetAddress", capitalizeFirstLetterOfString(e.target.value))
                    }
                    placeholder="Street address"
                  />
                  <input
                    className={styles.input}
                    value={capitalizeFirstLetterOfString(sCustomer.city || "")}
                    onChange={(e) =>
                      saveCustomerField("city", capitalizeFirstLetterOfString(e.target.value))
                    }
                    placeholder="City"
                  />
                  <input
                    className={styles.input}
                    value={(sCustomer.state || "").toUpperCase()}
                    onChange={(e) => saveCustomerField("state", e.target.value.toUpperCase())}
                    placeholder="State"
                  />
                  <input
                    className={styles.input}
                    value={sCustomer.zip || ""}
                    onChange={(e) => {
                      if (!checkInputForNumbersOnly(e.target.value)) return;
                      saveCustomerField("zip", e.target.value);
                    }}
                    placeholder="Zip code"
                  />
                  <textarea
                    className={styles.textarea}
                    value={capitalizeFirstLetterOfString(sCustomer.addressNotes || "")}
                    onChange={(e) =>
                      saveCustomerField("addressNotes", capitalizeFirstLetterOfString(e.target.value))
                    }
                    placeholder="Address notes"
                    rows={3}
                  />
                </div>
              ) : (
                <div>
                  {sCustomer.first || sCustomer.last ? (
                    <span className={styles.nameLine}>
                      {capitalizeFirstLetterOfString(sCustomer.first || "")}{" "}
                      {capitalizeFirstLetterOfString(sCustomer.last || "")}
                    </span>
                  ) : null}
                  {sCustomer.customerCell || sCustomer.customerLandline ? (
                    <div className={styles.phoneRow}>
                      {sCustomer.customerCell ? (
                        <span className={styles.phoneItem}>
                          Cell: {formatPhoneWithDashes(sCustomer.customerCell)}
                        </span>
                      ) : null}
                      {sCustomer.customerLandline ? (
                        <span className={styles.phoneItem}>
                          Land: {formatPhoneWithDashes(sCustomer.customerLandline)}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  {sCustomer.customerCell ? (
                    <div className={styles.contactBtnRow}>
                      <TouchableOpacity
                        onPress={() => {
                          if (onShowMessages) onShowMessages();
                        }}
                        className={styles.contactBtn}
                      >
                        <span className={styles.contactBtnText}>TEXT</span>
                      </TouchableOpacity>
                      <DropdownMenu
                        buttonIcon={null}
                        buttonText="CALL"
                        buttonStyle={{
                          backgroundColor: "var(--surface-accent-muted)",
                          borderColor: "var(--border-default)",
                          borderRadius: "var(--radius-control)",
                          height: 44,
                        }}
                        buttonTextStyle={{
                          fontSize: 15,
                          fontWeight: 700,
                          letterSpacing: 1,
                          color: "var(--text-default)",
                        }}
                        itemTextStyle={{ fontSize: 20 }}
                        dataArr={[
                          sCustomer.customerCell
                            ? { id: "call_cell", label: "Call Cell" }
                            : null,
                          sCustomer.customerLandline
                            ? { id: "call_landline", label: "Call Landline" }
                            : null,
                          activeExpectationForThisCustomer
                            ? { id: "disallow_callback", label: "Disallow Callbacks" }
                            : { id: "callback", label: "Allow Callbacks" },
                        ].filter(Boolean)}
                        onSelect={(item) => {
                          if (item.id === "call_cell") {
                            handleCallPress(sCustomer.customerCell);
                          } else if (item.id === "call_landline") {
                            handleCallPress(sCustomer.customerLandline);
                          } else if (item.id === "callback") {
                            handleAllowCallbacksPress();
                          } else if (item.id === "disallow_callback") {
                            handleDisallowCallbacksPress();
                          }
                        }}
                      />
                    </div>
                  ) : null}
                  {activeExpectationForThisCustomer && callbackRemainingMs > 0 ? (
                    <TouchableOpacity
                      onPress={handleDisallowCallbacksPress}
                      className={styles.callbackPill}
                    >
                      <span className={styles.callbackPillText}>
                        CALLBACKS ALLOWED · {formatCallbackRemaining(callbackRemainingMs)}
                      </span>
                    </TouchableOpacity>
                  ) : null}
                  {buildFullAddress(sCustomer) ? (
                    <TouchableOpacity onPress={handleAddressPress} className={styles.addressRow}>
                      <Image icon={ICONS.map} size={16} className={styles.addressIcon} />
                      <span className={styles.linkText}>{buildFullAddress(sCustomer)}</span>
                    </TouchableOpacity>
                  ) : null}
                  {sCustomer.addressNotes ? (
                    <span className={styles.notesLine}>{sCustomer.addressNotes}</span>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
