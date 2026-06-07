import { useMemo, useState } from "react";
import {
  useAlertScreenStore,
  useInventoryReconciliationModalStore,
  useOrderingModalStore,
  useSettingsStore,
} from "../../../../../stores";
import { VENDOR_CATALOGS } from "../../../../../data";
import { ICONS } from "../../../../../styles";
import { generate36CharUUID } from "../../../../../utils";
import { VendorGetStartedModal } from "./VendorGetStartedModal";
import styles from "./OrderingComponent.module.css";

// Credential schemas per vendor. Matches the ONBOARDING INPUTS blocks in
// functions/vendors/jbi.js and functions/vendors/qbp.js — these are the ONLY
// fields a dealer types. Everything else (HSTO/HSVT/HTRM for QBP, FTP login +
// integrator token for JBI) is derived server-side or platform-owned.
const VENDOR_CRED_SCHEMA = {
  jbi: {
    label: "JBI account credentials",
    fields: [
      {
        key: "accountNumber",
        label: "Account number",
        type: "text",
        placeholder: "e.g. 121080",
      },
      {
        key: "contactEmail",
        label: "Contact email",
        type: "email",
        placeholder: "orders@yourshop.com",
      },
    ],
  },
  qbp: {
    label: "QBP integrator credentials",
    fields: [
      {
        key: "accountNumber",
        label: "Account number",
        type: "text",
        placeholder: "e.g. 115882",
      },
      {
        key: "eftpPassword",
        label: "EFTP password",
        type: "password",
        placeholder: "QBP-issued EFTP password",
      },
      {
        key: "apiKey",
        label: "API1 key",
        type: "password",
        placeholder: "X-QBPAPI-KEY value",
      },
    ],
  },
};

// "Get Started" email templates. The dealer sends this to the vendor to
// request the credentials they'll paste into the card above. Email addresses
// are intentionally left blank — user will fill them in once confirmed.
const VENDOR_GETSTARTED = {
  jbi: {
    displayName: "J&B Importers",
    toEmail: "",
    subject: "Cadence POS integrator activation request",
    body:
      "Hello JBI Team,\n" +
      "\n" +
      "I am a JBI dealer using Cadence POS to manage my shop. I would like to enable order submission to JBI through Cadence's integrator integration.\n" +
      "\n" +
      "Please enable order submission via Cadence for my JBI dealer account so orders submitted through Cadence are accepted on my behalf.\n" +
      "\n" +
      "  JBI dealer account number: [your account number]\n" +
      "  Shop name: [your shop name]\n" +
      "\n" +
      "Thank you,\n" +
      "[Your name]\n",
  },
  qbp: {
    displayName: "QBP",
    toEmail: "",
    subject: "Cadence POS integration — EFTP and API1 credentials request",
    body:
      "Hello QBP Dealer Services,\n" +
      "\n" +
      "I am a QBP dealer using Cadence POS to manage my shop. I would like to enable Cadence to submit orders and sync inventory with my QBP account.\n" +
      "\n" +
      "Please send me the following so I can connect Cadence to QBP:\n" +
      "\n" +
      "  1. EFTP credentials (username and password for eftp.qbp.com)\n" +
      "  2. API1 key (X-QBPAPI-KEY header value)\n" +
      "\n" +
      "  QBP account number: [your account number]\n" +
      "  Shop name: [your shop name]\n" +
      "\n" +
      "Thank you,\n" +
      "[Your name]\n",
  },
};

// Client-side obfuscation, NOT cryptographic encryption. A Cloud Function
// will decrypt server-side with a Secret Manager key when submitting orders.
// This XOR layer just keeps cleartext credentials out of network panels and
// Firestore console. DB storage destination is TBD — the scrambled blob is
// currently only console-logged at save.
const SCRAMBLE_KEY = "cadence-vendor-creds-v1";

function scrambleCredsBlob(plaintext) {
  if (!plaintext) return "";
  const bytes = new TextEncoder().encode(plaintext);
  const keyBytes = new TextEncoder().encode(SCRAMBLE_KEY);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
  }
  let binary = "";
  for (let i = 0; i < out.length; i++) binary += String.fromCharCode(out[i]);
  return btoa(binary);
}

function emptyFormForSchema(schema) {
  const out = {};
  schema.fields.forEach((f) => {
    out[f.key] = "";
  });
  return out;
}

const INITIAL_CRED_FORM = Object.entries(VENDOR_CRED_SCHEMA).reduce(
  (acc, [id, schema]) => {
    acc[id] = emptyFormForSchema(schema);
    return acc;
  },
  {},
);

export function OrderingComponent() {
  const zVendors = useSettingsStore((s) => s.getSettings()?.vendors) || {};
  const [sNewName, _setNewName] = useState("");
  const [sCredForm, _setCredForm] = useState(INITIAL_CRED_FORM);
  const [sSavedAt, _setSavedAt] = useState({});
  const [sGetStartedVendorID, _setGetStartedVendorID] = useState(null);

  const lockedVendors = useMemo(
    () =>
      VENDOR_CATALOGS.filter((v) => v.id !== "other").map((v) => ({
        id: v.id,
        displayName: v.displayName,
      })),
    [],
  );

  const customVendors = useMemo(() => {
    const arr = [];
    Object.entries(zVendors).forEach(([id, cfg]) => {
      if (cfg && cfg.isCustom) {
        arr.push({ id, displayName: cfg.displayName || id });
      }
    });
    arr.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return arr;
  }, [zVendors]);

  function handleOpenOrdering() {
    useOrderingModalStore.getState().show();
  }

  function handleOpenReconciliation() {
    useInventoryReconciliationModalStore.getState().show();
  }

  function handleAddVendor() {
    const name = sNewName.trim();
    if (!name) return;
    const nameLower = name.toLowerCase();
    const duplicateLocked = lockedVendors.some(
      (v) => v.displayName.toLowerCase() === nameLower,
    );
    const duplicateCustom = customVendors.some(
      (v) => v.displayName.toLowerCase() === nameLower,
    );
    if (duplicateLocked || duplicateCustom) {
      useAlertScreenStore.getState().setValues({
        title: "DUPLICATE VENDOR",
        message: `A vendor named "${name}" already exists.`,
        btn1Text: "OK",
        handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
        showAlert: true,
        canExitOnOuterClick: true,
      });
      return;
    }
    const newID = generate36CharUUID();
    const updated = {
      ...zVendors,
      [newID]: { displayName: name, isCustom: true },
    };
    useSettingsStore.getState().setField("vendors", updated);
    _setNewName("");
  }

  function handleDeleteVendor(vendor) {
    useAlertScreenStore.getState().setValues({
      title: "DELETE VENDOR",
      message: `Are you sure you want to delete "${vendor.displayName}"?`,
      btn1Text: "DELETE",
      btn2Text: "CANCEL",
      handleBtn1Press: () => {
        const updated = { ...zVendors };
        delete updated[vendor.id];
        useSettingsStore.getState().setField("vendors", updated);
        useAlertScreenStore.getState().resetAll();
      },
      handleBtn2Press: () => useAlertScreenStore.getState().resetAll(),
      showAlert: true,
      canExitOnOuterClick: false,
    });
  }

  function handleAddKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddVendor();
    }
  }

  function handleCredFieldChange(vendorID, fieldKey, value) {
    _setCredForm((prev) => ({
      ...prev,
      [vendorID]: { ...(prev[vendorID] || {}), [fieldKey]: value },
    }));
  }

  function hasAllRequiredCredValues(vendorID) {
    const schema = VENDOR_CRED_SCHEMA[vendorID];
    if (!schema) return false;
    const values = sCredForm[vendorID] || {};
    return schema.fields.every((f) => (values[f.key] || "").trim().length > 0);
  }

  function handleSaveCreds(vendorID) {
    const schema = VENDOR_CRED_SCHEMA[vendorID];
    if (!schema) return;
    const values = sCredForm[vendorID] || {};
    const payload = schema.fields.reduce((acc, f) => {
      acc[f.key] = (values[f.key] || "").trim();
      return acc;
    }, {});
    const scrambled = scrambleCredsBlob(JSON.stringify(payload));
    console.log(
      JSON.stringify(
        {
          event: "vendor-creds-scrambled",
          vendorID,
          scrambled,
          bytes: scrambled.length,
          note: "DB storage destination TBD; placeholder console-log only",
        },
        null,
        2,
      ),
    );
    _setSavedAt((prev) => ({ ...prev, [vendorID]: Date.now() }));
    _setCredForm((prev) => ({
      ...prev,
      [vendorID]: emptyFormForSchema(schema),
    }));
  }

  function renderLockedVendor(v) {
    const schema = VENDOR_CRED_SCHEMA[v.id];
    if (!schema) {
      return (
        <div
          key={v.id}
          className={`${styles.vendorRow} ${styles.vendorRowLocked}`}
        >
          <div className={styles.vendorLeft}>
            <span className={styles.vendorName}>{v.displayName}</span>
          </div>
        </div>
      );
    }
    const values = sCredForm[v.id] || {};
    const saved = !!sSavedAt[v.id];
    return (
      <div key={v.id} className={styles.vendorCard}>
        <div className={styles.vendorCardHeader}>
          <span className={styles.vendorName}>{v.displayName}</span>
          {saved ? <span className={styles.savedBadge}>Saved</span> : null}
        </div>
        <div className={styles.credSection}>
          <span className={styles.credSectionTitle}>{schema.label}</span>
          <div className={styles.credFields}>
            {schema.fields.map((field) => {
              const inputID = `cred-${v.id}-${field.key}`;
              return (
                <div key={field.key} className={styles.credField}>
                  <label className={styles.credLabel} htmlFor={inputID}>
                    {field.label}
                  </label>
                  <input
                    id={inputID}
                    type={field.type}
                    className={styles.credInput}
                    value={values[field.key] || ""}
                    onChange={(e) =>
                      handleCredFieldChange(v.id, field.key, e.target.value)
                    }
                    placeholder={field.placeholder}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              );
            })}
          </div>
          <div className={styles.credActions}>
            <button
              type="button"
              className={styles.getStartedButton}
              onClick={() => _setGetStartedVendorID(v.id)}
            >
              Get Started
            </button>
            <button
              type="button"
              className={styles.credSaveButton}
              onClick={() => handleSaveCreds(v.id)}
              disabled={!hasAllRequiredCredValues(v.id)}
            >
              Save credentials
            </button>
          </div>
        </div>
      </div>
    );
  }

  const getStartedVendor = sGetStartedVendorID
    ? VENDOR_GETSTARTED[sGetStartedVendorID]
    : null;

  return (
    <div className={styles.outerBox}>
      <div className={styles.section}>
        <button
          type="button"
          className={styles.openOrderingButton}
          onClick={handleOpenOrdering}
        >
          Open Ordering
        </button>
        <button
          type="button"
          className={styles.reconcileButton}
          onClick={handleOpenReconciliation}
        >
          Reconcile Inventory
        </button>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionTitle}>Vendors</span>
        <div className={styles.vendorList}>
          {lockedVendors.map(renderLockedVendor)}
          {customVendors.length === 0 && (
            <span className={styles.emptyHint}>
              No custom vendors yet. Add one below.
            </span>
          )}
          {customVendors.map((v) => (
            <div key={v.id} className={styles.vendorRow}>
              <div className={styles.vendorLeft}>
                <span className={styles.vendorName}>{v.displayName}</span>
                <span className={styles.customBadge}>Custom</span>
              </div>
              <button
                type="button"
                className={styles.deleteBtn}
                aria-label="Delete vendor"
                onClick={() => handleDeleteVendor(v)}
              >
                <img
                  src={ICONS.trash}
                  alt=""
                  className={styles.deleteIcon}
                />
              </button>
            </div>
          ))}
        </div>

        <div className={styles.addRow}>
          <input
            type="text"
            className={styles.addInput}
            value={sNewName}
            onChange={(e) => _setNewName(e.target.value)}
            onKeyDown={handleAddKeyDown}
            placeholder="Vendor name (e.g. AliExpress, Amazon)"
          />
          <button
            type="button"
            className={styles.addButton}
            onClick={handleAddVendor}
            disabled={!sNewName.trim()}
          >
            Add
          </button>
        </div>
      </div>

      <VendorGetStartedModal
        vendor={getStartedVendor}
        onClose={() => _setGetStartedVendorID(null)}
      />
    </div>
  );
}
