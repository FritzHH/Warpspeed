import React, { useRef, useState } from "react";
import styles from "./SettingsCSVComponent.module.css";
import { Button } from "../../../../dom_components";
import { useSettingsStore } from "../../../../stores";
import { C, COLOR_GRADIENTS } from "../../../../styles";


export function SettingsCSVComponent() {
  const zSettingsObj = useSettingsStore((state) => state.settings);
  const [sUploading, _setUploading] = useState(false);
  const [sUploadResult, _setUploadResult] = useState(null);
  const fileInputRef = useRef(null);

  function handleDownloadCSV() {
    if (!zSettingsObj) return;
    const rows = [["field", "value"]];
    Object.keys(zSettingsObj).forEach((key) => {
      const val = zSettingsObj[key];
      const serialized = typeof val === "string" ? val : JSON.stringify(val);
      const escaped = serialized.replace(/"/g, '""');
      rows.push([key, '"' + escaped + '"']);
    });
    const csvContent = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "settings.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleRehydrateCSV(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    _setUploading(true);
    _setUploadResult(null);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target.result;
        const parsed = parseSettingsCSV(text);
        for (const [key, rawVal] of Object.entries(parsed)) {
          let val;
          try {
            val = JSON.parse(rawVal);
          } catch {
            val = rawVal;
          }
          useSettingsStore.getState().setField(key, val);
        }
        _setUploadResult({
          success: true,
          fieldCount: Object.keys(parsed).length,
        });
      } catch (err) {
        _setUploadResult({ success: false, error: err.message });
      }
      _setUploading(false);
    };
    reader.onerror = () => {
      _setUploadResult({ success: false, error: "Failed to read file" });
      _setUploading(false);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className={styles.innerBox}>
      <span className={styles.sectionTitle} style={{ color: C.text }}>
        SETTINGS CSV
      </span>
      <span
        className={styles.sectionDescription}
        style={{ color: C.textMuted }}
      >
        Download the current settings as a CSV file, or restore settings from a
        previously downloaded CSV.
      </span>

      <div className={styles.buttonRow}>
        <Button
          text="Download Settings CSV"
          onPress={handleDownloadCSV}
          colorGradientArr={COLOR_GRADIENTS.blue}
          buttonStyle={{ borderRadius: 5, paddingHorizontal: 20 }}
        />
        <Button
          text={sUploading ? "Importing..." : "Rehydrate from CSV"}
          onPress={() => fileInputRef.current?.click()}
          colorGradientArr={COLOR_GRADIENTS.green}
          buttonStyle={{ borderRadius: 5, paddingHorizontal: 20 }}
          disabled={sUploading}
          loading={sUploading}
        />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className={styles.hiddenFileInput}
        onChange={handleRehydrateCSV}
      />

      {!!sUploadResult && (
        <div
          className={`${styles.resultBox} ${
            sUploadResult.success
              ? styles.resultBoxSuccess
              : styles.resultBoxFailure
          }`}
        >
          <span
            className={styles.resultTitle}
            style={{ color: sUploadResult.success ? C.green : C.red }}
          >
            {sUploadResult.success
              ? "Settings restored — " +
                sUploadResult.fieldCount +
                " fields updated"
              : "Import Failed — " + sUploadResult.error}
          </span>
        </div>
      )}
    </div>
  );
}

function parseSettingsCSV(text) {
  const lines = text.split("\n");
  const result = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const commaIdx = line.indexOf(",");
    if (commaIdx === -1) continue;
    const key = line.substring(0, commaIdx);
    let val = line.substring(commaIdx + 1);
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1).replace(/""/g, '"');
    }
    result[key] = val;
  }
  return result;
}
