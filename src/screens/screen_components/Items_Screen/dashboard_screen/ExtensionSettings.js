/*eslint-disable*/
import { View, Text, TextInput, TouchableOpacity, ScrollView } from "react-native-web";
import { useState } from "react";
import { Button_, CheckBox_ } from "../../../../components";
import { useSettingsStore } from "../../../../stores";
import { C, gray } from "../../../../styles";
import { copyToClipboard } from "../../../../utils";
import { dbSaveSettingsField } from "../../../../db_calls_wrapper";

export function ExtensionSettingsComponent({ zSettingsObj, handleSettingsFieldChange }) {
  const [isLoading, _setIsLoading] = useState(false);
  const [message, _setMessage] = useState({ text: "", type: "" });
  
  const extension = zSettingsObj.amazonExtension || {};
  const address = extension.shippingAddress || {};
  
  // Auto-generate Store ID from tenantID + storeID
  const generatedStoreId = `${zSettingsObj.tenantID}_${zSettingsObj.storeID}`;

  const handleAddressChange = (field, value) => {
    const newExtension = {
      ...extension,
      shippingAddress: {
        ...address,
        [field]: value
      }
    };
    handleSettingsFieldChange("amazonExtension", newExtension);
  };

  const handleFeatureToggle = (feature) => {
    const newExtension = {
      ...extension,
      features: {
        ...extension.features,
        [feature]: !extension.features?.[feature]
      }
    };
    handleSettingsFieldChange("amazonExtension", newExtension);
  };

  const handleSaveExtensionSettings = async () => {
    _setIsLoading(true);
    _setMessage({ text: "", type: "" });

    try {
      // Add store ID to extension settings
      const updatedExtension = {
        ...extension,
        storeId: generatedStoreId,
        lastSync: new Date().toISOString()
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
    // Trigger download of extension files
    const extensionPath = "/amazon-simplifier-extension.zip";
    window.open(extensionPath, '_blank');
  };

  const handleCopyStoreId = () => {
    copyToClipboard(generatedStoreId);
    _setMessage({ text: "✓ Store ID copied to clipboard!", type: "success" });
    setTimeout(() => _setMessage({ text: "", type: "" }), 3000);
  };

  return (
    <ScrollView style={{ width: "100%", padding: 20 }}>
      {/* Header */}
      <View style={{ marginBottom: 30 }}>
        <Text style={{ fontSize: 24, fontWeight: "bold", color: C.buttonLightGreenOutline, marginBottom: 10 }}>
          🚀 Amazon Extension Settings
        </Text>
        <Text style={{ fontSize: 14, color: gray(0.6) }}>
          Configure the browser extension for streamlined Amazon ordering
        </Text>
      </View>

      {/* Message Banner */}
      {message.text && (
        <View style={{
          padding: 15,
          borderRadius: 5,
          backgroundColor: message.type === "success" ? "#d4edda" : "#f8d7da",
          borderLeft: `4px solid ${message.type === "success" ? "#28a745" : "#dc3545"}`,
          marginBottom: 20
        }}>
          <Text style={{ color: message.type === "success" ? "#155724" : "#721c24" }}>
            {message.text}
          </Text>
        </View>
      )}

      {/* Store ID (Read-only) */}
      <View style={{ marginBottom: 25 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 10 }}>
          Store ID (Auto-Generated)
        </Text>
        <View style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10
        }}>
          <View style={{
            flex: 1,
            padding: 12,
            backgroundColor: gray(0.95),
            borderRadius: 5,
            border: `1px solid ${gray(0.8)}`
          }}>
            <Text style={{ fontFamily: "monospace", fontSize: 14 }}>
              {generatedStoreId}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleCopyStoreId}
            style={{
              padding: 12,
              backgroundColor: C.buttonLightGreenOutline,
              borderRadius: 5,
              cursor: "pointer"
            }}
          >
            <Text style={{ color: "white", fontWeight: "600" }}>Copy</Text>
          </TouchableOpacity>
        </View>
        <Text style={{ fontSize: 12, color: gray(0.6), marginTop: 5 }}>
          Use this Store ID when configuring the browser extension
        </Text>
      </View>

      {/* Shipping Address Section */}
      <View style={{ marginBottom: 25 }}>
        <Text style={{ fontSize: 18, fontWeight: "600", marginBottom: 15 }}>
          Shipping Address (Auto-Fill)
        </Text>

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

        <View style={{ flexDirection: "row", gap: 15 }}>
          <View style={{ flex: 2 }}>
            <InputField
              label="City *"
              value={address.city || ""}
              onChange={(val) => handleAddressChange("city", val)}
              placeholder="Miami"
            />
          </View>
          <View style={{ flex: 1 }}>
            <InputField
              label="State *"
              value={address.state || ""}
              onChange={(val) => handleAddressChange("state", val.toUpperCase())}
              placeholder="FL"
              maxLength={2}
            />
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 15 }}>
          <View style={{ flex: 1 }}>
            <InputField
              label="ZIP Code *"
              value={address.zipCode || ""}
              onChange={(val) => handleAddressChange("zipCode", val)}
              placeholder="33101"
            />
          </View>
          <View style={{ flex: 1 }}>
            <InputField
              label="Phone Number *"
              value={address.phoneNumber || ""}
              onChange={(val) => handleAddressChange("phoneNumber", val)}
              placeholder="(555) 123-4567"
            />
          </View>
        </View>
      </View>

      {/* Feature Toggles */}
      <View style={{ marginBottom: 25 }}>
        <Text style={{ fontSize: 18, fontWeight: "600", marginBottom: 15 }}>
          Extension Features
        </Text>

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
      </View>

      {/* Action Buttons */}
      <View style={{ flexDirection: "row", gap: 15, marginTop: 30 }}>
        <Button_
          text={isLoading ? "Saving..." : "Save Settings"}
          onPress={handleSaveExtensionSettings}
          disabled={isLoading}
          style={{ 
            flex: 1, 
            backgroundColor: isLoading ? gray(0.7) : C.buttonLightGreenOutline,
            opacity: isLoading ? 0.6 : 1
          }}
        />
        
        <Button_
          text="Download Extension"
          onPress={handleDownloadExtension}
          style={{ flex: 1, backgroundColor: "#ff9900" }}
        />
      </View>

      {/* Instructions */}
      <View style={{
        marginTop: 30,
        padding: 20,
        backgroundColor: "#fffbea",
        borderRadius: 8,
        border: "1px solid #ffd700"
      }}>
        <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 10 }}>
          📖 Installation Instructions
        </Text>
        <View style={{ fontSize: 14, lineHeight: 1.6, color: gray(0.3) }}>
          <Text style={{ marginBottom: 5 }}>1. Click "Download Extension" above</Text>
          <Text style={{ marginBottom: 5 }}>2. Extract the ZIP file</Text>
          <Text style={{ marginBottom: 5 }}>3. Open Chrome and go to chrome://extensions/</Text>
          <Text style={{ marginBottom: 5 }}>4. Enable "Developer mode" (top right)</Text>
          <Text style={{ marginBottom: 5 }}>5. Click "Load unpacked" and select the extracted folder</Text>
          <Text style={{ marginBottom: 5 }}>6. Enter your Store ID: <Text style={{ fontWeight: "bold", fontFamily: "monospace" }}>{generatedStoreId}</Text></Text>
          <Text>7. Click "Sync Now" in the extension popup</Text>
        </View>
      </View>

      {/* Status Info */}
      {extension.lastSync && (
        <View style={{
          marginTop: 20,
          padding: 15,
          backgroundColor: "#e7f3ff",
          borderRadius: 8,
          border: "1px solid #2196f3"
        }}>
          <Text style={{ fontSize: 14, color: gray(0.4) }}>
            Last synced: {new Date(extension.lastSync).toLocaleString()}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

// Helper Components
function InputField({ label, value, onChange, placeholder, maxLength }) {
  return (
    <View style={{ marginBottom: 15 }}>
      <Text style={{ fontSize: 14, fontWeight: "500", marginBottom: 5, color: gray(0.3) }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        maxLength={maxLength}
        style={{
          padding: 10,
          borderRadius: 5,
          border: `1px solid ${gray(0.8)}`,
          fontSize: 14,
          width: "100%",
          backgroundColor: "white"
        }}
      />
    </View>
  );
}

function FeatureToggle({ label, description, checked, onToggle }) {
  return (
    <TouchableOpacity 
      onPress={onToggle}
      style={{
        flexDirection: "row",
        alignItems: "center",
        padding: 15,
        marginBottom: 10,
        backgroundColor: "white",
        borderRadius: 8,
        border: `1px solid ${gray(0.9)}`,
        cursor: "pointer"
      }}
    >
      <CheckBox_
        isChecked={checked}
        onPress={onToggle}
        style={{ marginRight: 15 }}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: "500", marginBottom: 3, color: gray(0.2) }}>
          {label}
        </Text>
        <Text style={{ fontSize: 13, color: gray(0.6) }}>
          {description}
        </Text>
      </View>
    </TouchableOpacity>
  );
}



