/*eslint-disable*/
import { useState } from "react";
import { Button, CheckBox, TouchableOpacity } from "../../../../dom_components";
import { useSettingsStore } from "../../../../stores";
import { C } from "../../../../styles";
import { copyToClipboard } from "../../../../utils";
import { dbSaveSettingsField } from "../../../../db_calls_wrapper";
import styles from "./ExtensionSettings.module.css";

export function ExtensionSettingsComponent({ zSettingsObj, handleSettingsFieldChange }) {
  const [isLoading, _setIsLoading] = useState(false);
  const [message, _setMessage] = useState({ text: "", type: "" });

  const extension = zSettingsObj.amazonExtension || {};
  const address = extension.shippingAddress || {};

  const generatedStoreId = `${zSettingsObj.tenantID}_${zSettingsObj.storeID}`;

  const handleAddressChange = (field, value) => {
    const newExtension = {
      ...extension,
      shippingAddress: {
        ...address,
        [field]: value,
      },
    };
    handleSettingsFieldChange("amazonExtension", newExtension);
  };

  const handleFeatureToggle = (feature) => {
    const newExtension = {
      ...extension,
      features: {
        ...extension.features,
        [feature]: !extension.features?.[feature],
      },
    };
    handleSettingsFieldChange("amazonExtension", newExtension);
  };

  const handleSaveExtensionSettings = async () => {
    _setIsLoading(true);
    _setMessage({ text: "", type: "" });

    try {
      const updatedExtension = {
        ...extension,
        storeId: generatedStoreId,
        lastSync: new Date().toISOString(),
      };

      const result = await dbSaveSettingsField("amazonExtension", updatedExtension);

      if (result.success) {
        _setMessage({ text: "✓ Extension settings saved successfully!", type: "success" });
        setTimeout(() => _setMessage({ text: "", type: "" }), 5000);
      } else {
        _setMessage({ text: "Failed to save settings", type: "error" });
      }
    } catch (error) {
      _setMessage({ text: `Error: ${error.message}`, type: "error" });
    } finally {
      _setIsLoading(false);
    }
  };

  const handleDownloadExtension = () => {
    const extensionPath = "/amazon-simplifier-extension.zip";
    window.open(extensionPath, "_blank");
  };

  const handleCopyStoreId = () => {
    copyToClipboard(generatedStoreId);
    _setMessage({ text: "✓ Store ID copied to clipboard!", type: "success" });
    setTimeout(() => _setMessage({ text: "", type: "" }), 3000);
  };

  return (
    <div className={styles.scrollRoot}>
      {/* Header */}
      <div className={styles.headerSection}>
        <span
          className={styles.headerTitle}
          style={{ color: C.buttonLightGreenOutline, display: "block" }}
        >
          🚀 Amazon Extension Settings
        </span>
        <span className={styles.headerSubtitle} style={{ color: C.textSecondary }}>
          Configure the browser extension for streamlined Amazon ordering
        </span>
      </div>

      {/* Message Banner */}
      {message.text && (
        <div
          className={`${styles.messageBanner} ${
            message.type === "success" ? styles.messageBannerSuccess : styles.messageBannerError
          }`}
        >
          <span
            className={styles.messageText}
            style={{ color: message.type === "success" ? "#155724" : "#721c24" }}
          >
            {message.text}
          </span>
        </div>
      )}

      {/* Store ID */}
      <div className={styles.section}>
        <span className={styles.sectionTitleSmall}>Store ID (Auto-Generated)</span>
        <div className={styles.storeIdRow}>
          <div
            className={styles.storeIdBox}
            style={{ backgroundColor: C.surfaceAlt, border: `1px solid ${C.borderStrong}` }}
          >
            <span className={styles.storeIdText}>{generatedStoreId}</span>
          </div>
          <button
            type="button"
            className={styles.copyButton}
            onClick={handleCopyStoreId}
            style={{ backgroundColor: C.buttonLightGreenOutline }}
          >
            <span className={styles.copyButtonText}>Copy</span>
          </button>
        </div>
        <span className={styles.helperText} style={{ color: C.textSecondary }}>
          Use this Store ID when configuring the browser extension
        </span>
      </div>

      {/* Shipping Address */}
      <div className={styles.section}>
        <span className={styles.sectionTitle}>Shipping Address (Auto-Fill)</span>

        <InputField
          label="Full Name *"
          value={address.fullName || ""}
          onChange={(val) => handleAddressChange("fullName", val)}
          placeholder="John Doe"
        />

        <InputField
          label="Address Line 1 *"
          value={address.addressLine1 || ""}
          onChange={(val) => handleAddressChange("addressLine1", val)}
          placeholder="123 Main Street"
        />

        <InputField
          label="Address Line 2"
          value={address.addressLine2 || ""}
          onChange={(val) => handleAddressChange("addressLine2", val)}
          placeholder="Suite 100 (optional)"
        />

        <div className={styles.row}>
          <div className={styles.col2}>
            <InputField
              label="City *"
              value={address.city || ""}
              onChange={(val) => handleAddressChange("city", val)}
              placeholder="Miami"
            />
          </div>
          <div className={styles.col1}>
            <InputField
              label="State *"
              value={address.state || ""}
              onChange={(val) => handleAddressChange("state", val.toUpperCase())}
              placeholder="FL"
              maxLength={2}
            />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.col1}>
            <InputField
              label="ZIP Code *"
              value={address.zipCode || ""}
              onChange={(val) => handleAddressChange("zipCode", val)}
              placeholder="33101"
            />
          </div>
          <div className={styles.col1}>
            <InputField
              label="Phone Number *"
              value={address.phoneNumber || ""}
              onChange={(val) => handleAddressChange("phoneNumber", val)}
              placeholder="(555) 123-4567"
            />
          </div>
        </div>
      </div>

      {/* Feature Toggles */}
      <div className={styles.section}>
        <span className={styles.sectionTitle}>Extension Features</span>

        <FeatureToggle
          label="Auto-Fill Forms"
          description="Automatically fill checkout forms with shipping address"
          checked={extension.features?.autoFill ?? true}
          onToggle={() => handleFeatureToggle("autoFill")}
        />

        <FeatureToggle
          label="Simplify UI"
          description="Clean up Amazon's interface by hiding clutter"
          checked={extension.features?.simplifyUI ?? true}
          onToggle={() => handleFeatureToggle("simplifyUI")}
        />

        <FeatureToggle
          label="Hide Ads"
          description="Remove sponsored content and advertisements"
          checked={extension.features?.hideAds ?? true}
          onToggle={() => handleFeatureToggle("hideAds")}
        />

        <FeatureToggle
          label="Quick Search (Ctrl+K)"
          description="Enable keyboard shortcut for instant search"
          checked={extension.features?.quickSearch ?? true}
          onToggle={() => handleFeatureToggle("quickSearch")}
        />
      </div>

      {/* Action Buttons */}
      <div className={styles.actionRow}>
        <div className={styles.actionButton}>
          <Button
            text={isLoading ? "Saving..." : "Save Settings"}
            onPress={handleSaveExtensionSettings}
            enabled={!isLoading}
            buttonStyle={{
              backgroundColor: isLoading ? C.borderStrong : C.buttonLightGreenOutline,
              opacity: isLoading ? 0.6 : 1,
              width: "100%",
            }}
          />
        </div>
        <div className={styles.actionButton}>
          <Button
            text="Download Extension"
            onPress={handleDownloadExtension}
            buttonStyle={{ backgroundColor: "#ff9900", width: "100%" }}
          />
        </div>
      </div>

      {/* Instructions */}
      <div className={styles.instructionsBox}>
        <span className={styles.instructionsTitle}>📖 Installation Instructions</span>
        <div className={styles.instructionsList} style={{ color: C.textDisabled }}>
          <span className={styles.instructionsItem}>
            1. Click "Download Extension" above
          </span>
          <span className={styles.instructionsItem}>2. Extract the ZIP file</span>
          <span className={styles.instructionsItem}>
            3. Open Chrome and go to chrome://extensions/
          </span>
          <span className={styles.instructionsItem}>
            4. Enable "Developer mode" (top right)
          </span>
          <span className={styles.instructionsItem}>
            5. Click "Load unpacked" and select the extracted folder
          </span>
          <span className={styles.instructionsItem}>
            6. Enter your Store ID:{" "}
            <span style={{ fontWeight: "bold", fontFamily: "monospace" }}>
              {generatedStoreId}
            </span>
          </span>
          <span className={styles.instructionsItemLast}>
            7. Click "Sync Now" in the extension popup
          </span>
        </div>
      </div>

      {/* Status Info */}
      {extension.lastSync && (
        <div className={styles.statusBox}>
          <span className={styles.statusText} style={{ color: C.textMuted }}>
            Last synced: {new Date(extension.lastSync).toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
}

function InputField({ label, value, onChange, placeholder, maxLength }) {
  return (
    <div className={styles.fieldWrapper}>
      <span className={styles.fieldLabel} style={{ color: C.textDisabled }}>
        {label}
      </span>
      <input
        type="text"
        className={styles.fieldInput}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        style={{ border: `1px solid ${C.borderStrong}` }}
      />
    </div>
  );
}

function FeatureToggle({ label, description, checked, onToggle }) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      className={styles.featureRow}
      style={{ border: `1px solid ${C.borderStrong}` }}
    >
      <div className={styles.featureCheckboxWrap}>
        <CheckBox isChecked={checked} onPress={onToggle} />
      </div>
      <div className={styles.featureContent}>
        <span className={styles.featureLabel} style={{ color: C.textDisabled }}>
          {label}
        </span>
        <span className={styles.featureDescription} style={{ color: C.textSecondary }}>
          {description}
        </span>
      </div>
    </TouchableOpacity>
  );
}
