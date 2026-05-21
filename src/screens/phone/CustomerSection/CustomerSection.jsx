import { useState, useRef } from "react";
import { ICONS } from "../../../styles";
import { useOpenWorkordersStore, useAlertScreenStore } from "../../../stores";
import {
  capitalizeFirstLetterOfString,
  formatPhoneWithDashes,
  removeDashesFromPhone,
  checkInputForNumbersOnly,
} from "../../../utils";
import { dbGetCustomer, dbSaveCustomer } from "../../../db_calls_wrapper";
import { Image, SmallLoadingIndicator, TouchableOpacity } from "../../../dom_components";
import styles from "./CustomerSection.module.css";

const CUSTOMER_TO_WORKORDER_FIELDS = {
  first: "customerFirst",
  last: "customerLast",
  customerCell: "customerCell",
  customerLandline: "customerLandline",
  email: "customerEmail",
};

export function CustomerSection({ workorder, zSettings, onShowMessages }) {
  const customerName = workorder.customerID
    ? `${capitalizeFirstLetterOfString(workorder.customerFirst || "")} ${capitalizeFirstLetterOfString(workorder.customerLast || "")}`.trim()
    : "Walk-in";

  const [sOpen, _setOpen] = useState(true);
  const [sEditing, _setEditing] = useState(false);
  const [sCustomer, _setCustomer] = useState(null);
  const [sLoading, _setLoading] = useState(!!workorder.customerID);
  const fetchedRef = useRef(false);

  if (!fetchedRef.current && workorder.customerID) {
    fetchedRef.current = true;
    dbGetCustomer(workorder.customerID)
      .then((c) => {
        _setCustomer(c);
        _setLoading(false);
      })
      .catch(() => _setLoading(false));
  }

  function handleToggle() {
    if (!workorder.customerID) return;
    const opening = !sOpen;
    _setOpen(opening);
    if (opening && !sCustomer) {
      _setLoading(true);
      dbGetCustomer(workorder.customerID)
        .then((c) => {
          _setCustomer(c);
          _setLoading(false);
        })
        .catch(() => _setLoading(false));
    }
  }

  function saveCustomerField(fieldName, val) {
    _setCustomer((prev) => {
      const updated = { ...prev, [fieldName]: val };
      dbSaveCustomer(updated);
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

  function handleCellPress(phone) {
    const formatted = formatPhoneWithDashes(phone);
    navigator.clipboard.writeText(phone).catch(() => {});
    useAlertScreenStore.getState().setValues({
      title: "Phone Number Copied",
      message: formatted + " has been copied to your clipboard.",
      btn1Text: "TEXT",
      btn2Text: "VONAGE",
      btn3Text: "PHONE DIALER",
      handleBtn1Press: () => {
        useAlertScreenStore.getState().resetAll();
        if (onShowMessages) onShowMessages();
      },
      handleBtn2Press: () => {
        window.open("https://app.vonage.com", "_blank");
      },
      handleBtn3Press: () => {
        window.open("tel:" + phone);
      },
      showAlert: true,
      canExitOnOuterClick: true,
    });
  }

  return (
    <div className={styles.root}>
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

      {sOpen && workorder.customerID ? (
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
                  <input
                    className={styles.input}
                    value={formatPhoneWithDashes(sCustomer.customerCell || "")}
                    onChange={(e) => {
                      const val = removeDashesFromPhone(e.target.value);
                      if (val.length > 10) return;
                      saveCustomerField("customerCell", val);
                    }}
                    placeholder="Cell phone"
                  />
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
                  {sCustomer.customerCell ? (
                    <TouchableOpacity
                      onPress={() => handleCellPress(sCustomer.customerCell)}
                      className={styles.cellRow}
                    >
                      <span className={styles.linkText}>
                        Cell: {formatPhoneWithDashes(sCustomer.customerCell)}
                      </span>
                    </TouchableOpacity>
                  ) : null}
                  {sCustomer.customerLandline ? (
                    <span className={styles.dimLine}>
                      Landline: {formatPhoneWithDashes(sCustomer.customerLandline)}
                    </span>
                  ) : null}
                  {sCustomer.email ? (
                    <span className={styles.dimLine}>{sCustomer.email}</span>
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
