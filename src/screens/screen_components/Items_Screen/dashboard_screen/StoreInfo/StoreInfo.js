import React, { useRef, useState } from "react";
import {
  Button,
  CheckBox,
  Dialog,
  Image,
  TextInput,
  TimePicker,
} from "../../../../../dom_components";
import { COLOR_GRADIENTS, ICONS, C } from "../../../../../styles";
import {
  checkInputForNumbersOnly,
  formatPhoneWithDashes,
  getDayOfWeekFrom0To7Input,
  log,
} from "../../../../../utils";
import { useSettingsStore } from "../../../../../stores";
import styles from "./StoreInfo.module.css";

export const StoreInfoComponent = ({
  zSettingsObj,
  handleSettingsFieldChange,
}) => {
  const [sPickerDay, _sSetPickerDay] = useState(null);
  const [sPickerType, _sSetPickerType] = useState(null);
  const [sLogoUploading, _sSetLogoUploading] = useState(false);
  const logoInputRef = useRef(null);

  function toggleReceiptField(fieldName) {
    let arr = [...(zSettingsObj?.receiptSetup?.includeFieldsInReceipt || [])];
    let idx = arr.indexOf(fieldName);
    if (idx !== -1) arr.splice(idx, 1);
    else arr.push(fieldName);
    handleSettingsFieldChange("receiptSetup", {
      ...zSettingsObj.receiptSetup,
      includeFieldsInReceipt: arr,
    });
  }

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    _sSetLogoUploading(true);
    try {
      const { storageUpload } = await import("../../../../../db_calls");
      const settings = useSettingsStore.getState().getSettings();
      const url = await storageUpload(
        `${settings.tenantID}/${settings.storeID}/store-logo`,
        file,
        { contentType: file.type }
      );
      handleSettingsFieldChange("storeInfo", {
        ...zSettingsObj.storeInfo,
        storeLogo: url,
      });
    } catch (err) {
      log("Logo upload error:", err);
    }
    _sSetLogoUploading(false);
    e.target.value = "";
  };

  if (!zSettingsObj) return null;

  const updateStoreInfo = (field, value) =>
    handleSettingsFieldChange("storeInfo", {
      ...zSettingsObj.storeInfo,
      [field]: value,
    });

  const isReceiptFieldChecked = (name) =>
    !!zSettingsObj?.receiptSetup?.includeFieldsInReceipt?.find((o) => o === name);

  const renderTextRow = ({
    label,
    field,
    value,
    onChange,
    receiptToggleField,
    showReceipt = true,
    topGap = true,
  }) => (
    <div
      className={`${styles.fieldRow} ${topGap ? styles.fieldRowGap : ""}`}
    >
      <span className={styles.fieldLabel}>{label}</span>
      <TextInput
        debounceMs={500}
        style={{
          width: "50%",
          marginLeft: 10,
          border: `1px solid ${C.borderDefault}`,
          padding: "3px 7px 3px 3px",
          textAlign: "right",
          outline: "none",
          flexShrink: 0,
        }}
        value={value}
        onChangeText={onChange}
      />
      {showReceipt ? (
        <CheckBox
          onCheck={() => toggleReceiptField(receiptToggleField || field)}
          buttonStyle={{ marginLeft: 7 }}
          text="Receipt"
          textStyle={{ fontSize: 12 }}
          isChecked={isReceiptFieldChecked(receiptToggleField || field)}
        />
      ) : (
        <div className={styles.receiptCheckSpacer} />
      )}
    </div>
  );

  return (
    <>
      <div className={`${styles.cardOuter} ${styles.cardOuterBottomGap}`}>
        <div className={`${styles.cardInner} ${styles.cardInnerPaddingY}`}>
          {/* store logo upload */}
          <div className={styles.logoBlock}>
            <span className={styles.logoBlockTitle}>Store Logo</span>
            {zSettingsObj?.storeInfo?.storeLogo ? (
              <Image
                src={zSettingsObj.storeInfo.storeLogo}
                style={{
                  width: 150,
                  height: 150,
                  marginBottom: 10,
                  borderRadius: 10,
                  objectFit: "contain",
                }}
              />
            ) : (
              <div className={styles.logoPlaceholder}>
                <span>No logo</span>
              </div>
            )}
            <div className={styles.logoButtonRow}>
              <Button
                text={sLogoUploading ? "Uploading..." : "Upload Logo"}
                enabled={!sLogoUploading}
                colorGradientArr={COLOR_GRADIENTS.green}
                buttonStyle={{ paddingHorizontal: 15, paddingVertical: 8 }}
                onPress={() => logoInputRef.current?.click()}
              />
              {!!zSettingsObj?.storeInfo?.storeLogo && (
                <Button
                  text="Remove"
                  icon={ICONS.trash}
                  iconSize={14}
                  colorGradientArr={COLOR_GRADIENTS.red}
                  buttonStyle={{
                    marginLeft: 10,
                    paddingHorizontal: 15,
                    paddingVertical: 8,
                  }}
                  onPress={() => updateStoreInfo("storeLogo", "")}
                />
              )}
            </div>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className={styles.hiddenFileInput}
              onChange={handleLogoUpload}
            />
          </div>

          {renderTextRow({
            label: "Display Name:",
            field: "displayName",
            value: zSettingsObj?.storeInfo.displayName,
            onChange: (v) => updateStoreInfo("displayName", v),
            topGap: false,
          })}

          {renderTextRow({
            label: "Phone Number:",
            field: "phone",
            value: formatPhoneWithDashes(zSettingsObj?.storeInfo.phone),
            onChange: (v) => updateStoreInfo("phone", v),
          })}

          {renderTextRow({
            label: "Support Email:",
            field: "supportEmail",
            value: zSettingsObj?.storeInfo.supportEmail || "",
            onChange: (v) => updateStoreInfo("supportEmail", v),
          })}

          {renderTextRow({
            label: "Office Email:",
            field: "officeEmail",
            value: zSettingsObj?.storeInfo.officeEmail || "",
            onChange: (v) => updateStoreInfo("officeEmail", v),
            showReceipt: false,
          })}

          {renderTextRow({
            label: "Texting Number:",
            field: "textingNumber",
            value: formatPhoneWithDashes(
              zSettingsObj?.storeInfo.textingNumber || ""
            ),
            onChange: (v) => updateStoreInfo("textingNumber", v),
            showReceipt: false,
          })}

          {renderTextRow({
            label: "Street:",
            field: "street",
            value: zSettingsObj?.storeInfo.street,
            onChange: (v) => updateStoreInfo("street", v),
          })}

          {renderTextRow({
            label: "Unit:",
            field: "unit",
            value: zSettingsObj?.storeInfo.unit,
            onChange: (v) => updateStoreInfo("unit", v),
          })}

          {renderTextRow({
            label: "City:",
            field: "city",
            value: zSettingsObj?.storeInfo.city,
            onChange: (v) => updateStoreInfo("city", v),
          })}

          {renderTextRow({
            label: "State or Abbrev.",
            field: "state",
            value: zSettingsObj?.storeInfo.state,
            onChange: (v) => updateStoreInfo("state", v),
          })}

          {renderTextRow({
            label: "Zip Code:",
            field: "zip",
            value: zSettingsObj?.storeInfo.zip,
            onChange: (v) => updateStoreInfo("zip", v),
          })}

          {/* open and closing hours */}
          <div className={styles.hoursWrapper}>
            {zSettingsObj?.storeHours.standard.map((item, idx) => {
              const openParts = item.open.split(" ");
              const [openH, openM] = openParts[0].split(":").map(Number);
              const openP = openParts[1] || "AM";
              const closeParts = item.close.split(" ");
              const [closeH, closeM] = closeParts[0].split(":").map(Number);
              const closeP = closeParts[1] || "PM";
              const isOpenPicker =
                sPickerDay === item.id && sPickerType === "open";
              const isClosePicker =
                sPickerDay === item.id && sPickerType === "close";

              const closePicker = () => {
                _sSetPickerDay(null);
                _sSetPickerType(null);
              };

              const saveTime = (field, hour, minute, period) => {
                const timeStr =
                  hour + ":" + String(minute).padStart(2, "0") + " " + period;
                let standardStoreHours = zSettingsObj.storeHours.standard.map(
                  (o) => {
                    if (o.id === item.id) return { ...o, [field]: timeStr };
                    return o;
                  }
                );
                handleSettingsFieldChange("storeHours", {
                  standard: standardStoreHours,
                  special: zSettingsObj.storeHours.special,
                });
                closePicker();
              };

              return (
                <div key={item.id}>
                  <div className={styles.dayRow}>
                    <span className={styles.dayLabel}>
                      {getDayOfWeekFrom0To7Input(idx)}
                    </span>
                    <div className={styles.dayTimes}>
                      <button
                        type="button"
                        className={`${styles.timeChip} ${
                          isOpenPicker ? styles.timeChipActive : ""
                        }`}
                        onClick={() => {
                          if (isOpenPicker) closePicker();
                          else {
                            _sSetPickerDay(item.id);
                            _sSetPickerType("open");
                          }
                        }}
                      >
                        {item.open}
                      </button>
                      <Image
                        className={styles.dayArrow}
                        src={ICONS.rightArrowBlue}
                        style={{ width: 22, height: 12 }}
                      />
                      <button
                        type="button"
                        className={`${styles.timeChip} ${
                          isClosePicker ? styles.timeChipActive : ""
                        }`}
                        onClick={() => {
                          if (isClosePicker) closePicker();
                          else {
                            _sSetPickerDay(item.id);
                            _sSetPickerType("close");
                          }
                        }}
                      >
                        {item.close}
                      </button>
                    </div>
                    <div className={styles.dayOpenCol}>
                      <CheckBox
                        buttonStyle={{ marginLeft: 20 }}
                        text="Open"
                        isChecked={item.isOpen}
                        onCheck={() => {
                          let standardStoreHours =
                            zSettingsObj.storeHours.standard.map((o) => {
                              if (o.id === item.id) {
                                return { ...o, isOpen: !o.isOpen };
                              }
                              return o;
                            });
                          handleSettingsFieldChange("storeHours", {
                            standard: standardStoreHours,
                            special: zSettingsObj.storeHours.special,
                          });
                        }}
                      />
                    </div>
                  </div>
                  <Dialog
                    visible={isOpenPicker}
                    onClose={closePicker}
                    overlayColor={C.surfaceOverlay}
                  >
                    <TimePicker
                      initialHour={openH}
                      initialMinute={openM}
                      initialPeriod={openP}
                      onConfirm={({ hour, minute, period }) =>
                        saveTime("open", hour, minute, period)
                      }
                      onCancel={closePicker}
                    />
                  </Dialog>
                  <Dialog
                    visible={isClosePicker}
                    onClose={closePicker}
                    overlayColor={C.surfaceOverlay}
                  >
                    <TimePicker
                      initialHour={closeH}
                      initialMinute={closeM}
                      initialPeriod={closeP}
                      onConfirm={({ hour, minute, period }) =>
                        saveTime("close", hour, minute, period)
                      }
                      onCancel={closePicker}
                    />
                  </Dialog>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className={`${styles.cardOuter} ${styles.cardOuterTopGap}`}>
        <div className={styles.cardInner}>
          <div className={styles.paymentHeader}>PAYMENT &amp; TAX</div>
          <CheckBox
            isChecked={zSettingsObj?.acceptChecks}
            textStyle={{ fontSize: 15 }}
            buttonStyle={{ backgroundColor: "transparent" }}
            text="Accepts checks"
            onCheck={() =>
              handleSettingsFieldChange(
                "acceptChecks",
                !zSettingsObj?.acceptChecks
              )
            }
          />
          <div className={styles.taxRow}>
            <span className={styles.taxLabel}>State Sales Tax:</span>
            <TextInput
              debounceMs={500}
              style={{
                outline: "none",
                borderRadius: 5,
                textAlign: "right",
                border: `1px solid ${C.borderDefault}`,
                padding: "3px 5px",
                marginRight: 3,
                width: 75,
                flexShrink: 0,
              }}
              value={zSettingsObj?.salesTaxPercent || ""}
              onChangeText={(val) => {
                let containsDecimalAlready = val.split(".").length > 2;
                if (checkInputForNumbersOnly(val) && !containsDecimalAlready) {
                  handleSettingsFieldChange("salesTaxPercent", val);
                }
              }}
            />
            <span>%</span>
          </div>
        </div>
      </div>
    </>
  );
};
