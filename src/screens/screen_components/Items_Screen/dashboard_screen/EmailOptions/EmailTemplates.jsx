import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Button,
  Image as DomImage,
  TextInput,
  Tooltip,
  TouchableOpacity,
} from "../../../../../dom_components";
import { C, COLOR_GRADIENTS, ICONS, Z } from "../../../../../styles";

import { COLORS, SETTINGS_OBJ } from "../../../../../data";
import {
  BoxButton1,
  BoxContainerInner,
  BoxContainerOuter,
  FOOTER_VARIABLES,
  MESSAGE_VARIABLES,
  TEMPLATE_EMOJIS,
} from "./_helpers";

export const EmailTemplates = ({ zSettingsObj, handleSettingsFieldChange }) => {
  const [sSelectedTemplateId, _setSelectedTemplateId] = useState(null);
  const [sLocalEdits, _setLocalEdits] = useState({});
  const [sNewTemplateIds, _setNewTemplateIds] = useState([]);
  const [sUnsavedTemplates, _setUnsavedTemplates] = useState([]);
  const [sEmojiModalRefKey, _setEmojiModalRefKey] = useState(null);
  const cursorRefs = useRef({});
  const inputRefs = useRef({});

  let savedTemplates = zSettingsObj?.emailTemplates || [];
  let hasMergedEmail = useRef(false);
  if (!hasMergedEmail.current && savedTemplates.length > 0) {
    let defaultTyped = (SETTINGS_OBJ.emailTemplates || []).filter((t) => t.type);
    let missing = defaultTyped.filter((d) => !savedTemplates.find((s) => s.type === d.type));
    let defaultNonRemovable = (SETTINGS_OBJ.emailTemplates || []).filter((t) => t.removable === false && !t.type);
    let missingByID = defaultNonRemovable.filter((d) => !savedTemplates.find((s) => s.id === d.id));
    let allMissing = [...missing, ...missingByID];
    if (allMissing.length > 0) {
      let merged = [...savedTemplates, ...allMissing];
      handleSettingsFieldChange("emailTemplates", merged);
      savedTemplates = merged;
    }
    hasMergedEmail.current = true;
  }
  let templates = [...sUnsavedTemplates, ...savedTemplates].sort((a, b) => (b.type ? 1 : 0) - (a.type ? 1 : 0));
  let greeting = zSettingsObj?.emailGreeting ?? "";
  let footer = zSettingsObj?.emailFooter ?? "";
  let greetingAlign = zSettingsObj?.emailGreetingAlign || "center";
  let footerAlign = zSettingsObj?.emailFooterAlign || "center";

  function getLabel(t) { return t.label || t.name || ""; }
  function getMessage(t) { return t.message || t.content || t.body || ""; }

  function getLocalValue(templateId, field) {
    let key = templateId + "_" + field;
    return key in sLocalEdits ? sLocalEdits[key] : null;
  }

  function isNewTemplate(templateId) {
    return sNewTemplateIds.indexOf(templateId) !== -1;
  }

  function insertVarAtCursor(refKey, currentVal, varStr, onUpdate) {
    let pos = cursorRefs.current[refKey] ?? (currentVal || "").length;
    let before = (currentVal || "").slice(0, pos);
    let after = (currentVal || "").slice(pos);
    onUpdate(before + varStr + after);
    cursorRefs.current[refKey] = pos + varStr.length;
    inputRefs.current[refKey]?.focus();
  }

  function handleAddTemplate() {
    let newTemplate = {
      id: crypto.randomUUID(),
      label: "",
      subject: "",
      message: "",
      action: "",
      actionColorObj: { textColor: "white", backgroundColor: "green", label: "Green" },
      type: "",
    };
    _setUnsavedTemplates([newTemplate, ...sUnsavedTemplates]);
    _setNewTemplateIds([...sNewTemplateIds, newTemplate.id]);
    _setSelectedTemplateId(newTemplate.id);
  }

  function handleSaveNewTemplate(templateObj) {
    let finalTemplate = {
      id: templateObj.id,
      label: getLocalValue(templateObj.id, "label") ?? getLabel(templateObj),
      subject: getLocalValue(templateObj.id, "subject") ?? templateObj.subject,
      message: getLocalValue(templateObj.id, "message") ?? getMessage(templateObj),
      action: getLocalValue(templateObj.id, "action") ?? (templateObj.action || ""),
      actionColorObj: templateObj.actionColorObj || { textColor: "white", backgroundColor: "green", label: "Green" },
      type: templateObj.type || "",
    };
    let arr = [finalTemplate, ...savedTemplates];
    handleSettingsFieldChange("emailTemplates", arr);
    _setUnsavedTemplates(sUnsavedTemplates.filter((t) => t.id !== templateObj.id));
    _setNewTemplateIds(sNewTemplateIds.filter((id) => id !== templateObj.id));
    let newEdits = { ...sLocalEdits };
    delete newEdits[templateObj.id + "_label"];
    delete newEdits[templateObj.id + "_subject"];
    delete newEdits[templateObj.id + "_message"];
    delete newEdits[templateObj.id + "_action"];
    _setLocalEdits(newEdits);
  }

  function handleDeleteTemplate(templateObj) {
    if (isNewTemplate(templateObj.id)) {
      _setUnsavedTemplates(sUnsavedTemplates.filter((t) => t.id !== templateObj.id));
      _setNewTemplateIds(sNewTemplateIds.filter((id) => id !== templateObj.id));
    } else {
      let arr = savedTemplates.filter((t) => t.id !== templateObj.id);
      handleSettingsFieldChange("emailTemplates", arr);
    }
    if (sSelectedTemplateId === templateObj.id) _setSelectedTemplateId(null);
    let newEdits = { ...sLocalEdits };
    delete newEdits[templateObj.id + "_label"];
    delete newEdits[templateObj.id + "_subject"];
    delete newEdits[templateObj.id + "_message"];
    delete newEdits[templateObj.id + "_action"];
    _setLocalEdits(newEdits);
  }

  function handleFieldChange(templateObj, field, val) {
    if (isNewTemplate(templateObj.id)) {
      _setLocalEdits({ ...sLocalEdits, [templateObj.id + "_" + field]: val });
    } else {
      let arr = savedTemplates.map((t) => {
        if (t.id === templateObj.id) {
          let updated = { ...t, [field]: val };
          if (field === "message") { delete updated.content; delete updated.body; }
          return updated;
        }
        return t;
      });
      handleSettingsFieldChange("emailTemplates", arr);
    }
  }

  function handleInsertMessageVar(templateObj, varStr) {
    let refKey = templateObj.id + "_message";
    let currentVal = isNewTemplate(templateObj.id)
      ? (getLocalValue(templateObj.id, "message") ?? getMessage(templateObj))
      : getMessage(templateObj);
    insertVarAtCursor(refKey, currentVal, varStr, (newVal) => {
      if (isNewTemplate(templateObj.id)) {
        _setLocalEdits({ ...sLocalEdits, [refKey]: newVal });
      } else {
        let arr = savedTemplates.map((t) => {
          if (t.id === templateObj.id) { let u = { ...t, message: newVal }; delete u.content; delete u.body; return u; }
          return t;
        });
        handleSettingsFieldChange("emailTemplates", arr);
      }
    });
  }

  const setInputRef = (key) => (node) => {
    if (node) inputRefs.current[key] = node;
    else delete inputRefs.current[key];
  };

  let varBtnStyle = {
    backgroundColor: C.buttonLightGreen,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: C.buttonLightGreenOutline,
    borderRadius: 5,
    paddingTop: 4,
    paddingBottom: 4,
    paddingLeft: 8,
    paddingRight: 8,
    marginRight: 5,
    marginBottom: 5,
  };

  let inputStyle = {
    borderColor: C.buttonLightGreenOutline,
    borderWidth: 1,
    borderStyle: "solid",
    borderRadius: 5,
    padding: 5,
    color: C.text,
    outlineWidth: 0,
    fontSize: 14,
  };

  function renderAlignToggle(currentAlign, onAlignChange) {
    let btnBase = {
      paddingTop: 5,
      paddingBottom: 5,
      paddingLeft: 12,
      paddingRight: 12,
      borderRadius: 5,
      borderWidth: 1,
      borderStyle: "solid",
    };
    return (
      <div style={{ display: "flex", flexDirection: "row", alignItems: "center", marginTop: 8 }}>
        <span style={{ fontSize: 12, color: C.textMuted, marginRight: 8 }}>Align:</span>
        <TouchableOpacity
          onPress={() => onAlignChange("center")}
          style={{ ...btnBase, backgroundColor: currentAlign === "center" ? C.green : "transparent", borderColor: currentAlign === "center" ? C.green : C.borderStrong, marginRight: 6 }}
        >
          <span style={{ fontSize: 12, color: currentAlign === "center" ? "white" : C.text }}>Center</span>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onAlignChange("left")}
          style={{ ...btnBase, backgroundColor: currentAlign === "left" ? C.green : "transparent", borderColor: currentAlign === "left" ? C.green : C.borderStrong }}
        >
          <span style={{ fontSize: 12, color: currentAlign === "left" ? "white" : C.text }}>Left</span>
        </TouchableOpacity>
      </div>
    );
  }

  let logoUrl = zSettingsObj?.storeInfo?.storeLogo || "";
  let logoWidth = zSettingsObj?.emailLogoWidth || 180;

  function renderColorPicker(selectedColorObj, onColorSelect) {
    return (
      <div style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
        <span style={{ fontSize: 12, color: C.textMuted, marginRight: 8 }}>Button Color:</span>
        {COLORS.map((c) => {
          let isActive = selectedColorObj?.label === c.label;
          return (
            <TouchableOpacity
              key={c.label}
              onPress={() => onColorSelect(c)}
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                backgroundColor: c.backgroundColor,
                borderWidth: isActive ? 3 : 1,
                borderStyle: "solid",
                borderColor: isActive ? C.green : C.borderStrong,
                marginRight: 4,
                marginBottom: 4,
              }}
            />
          );
        })}
      </div>
    );
  }

  let greetingColorObj = zSettingsObj?.emailGreetingColorObj || { textColor: "white", backgroundColor: "#2E7D32", label: "Green" };
  let greetingBg = greetingColorObj.backgroundColor;
  let greetingTextColor = greetingColorObj.textColor;
  let greetingHasLogo = (greeting || "").includes("{storeLogo}");
  let greetingDisplayText = (greeting || "").replace(/\{storeLogo\}\n?/g, "").replace(/\n?\{storeLogo\}/g, "");
  let footerHasLogo = (footer || "").includes("{storeLogo}");
  let footerDisplayText = (footer || "").replace(/\{storeLogo\}\n?/g, "").replace(/\n?\{storeLogo\}/g, "");

  return (
    <BoxContainerOuter>
      <BoxContainerInner style={{ width: "100%", alignItems: "center" }}>

        {/* ===== SHARED GREETING ===== */}
        <div style={{ width: "100%", marginBottom: 20, flexShrink: 0 }}>
          <span style={{ fontSize: 12, fontWeight: "600", color: "#2E7D32", marginBottom: 6, display: "block" }}>GREETING (shared)</span>
          <div style={{ backgroundColor: greetingBg, borderRadius: 8, overflow: "hidden" }}>
            {greetingHasLogo && logoUrl ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 20, paddingBottom: 6 }}>
                <DomImage src={logoUrl} resizeMode="contain" style={{ width: logoWidth, height: logoWidth * 0.5 }} />
                <div style={{ display: "flex", flexDirection: "row", alignItems: "center", marginTop: 6 }}>
                  <TouchableOpacity
                    onPress={() => handleSettingsFieldChange("emailLogoWidth", Math.max(60, logoWidth - 20))}
                    style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.25)", justifyContent: "center", alignItems: "center", marginRight: 6 }}
                  >
                    <span style={{ fontSize: 14, fontWeight: "700", color: greetingTextColor, lineHeight: "16px" }}>-</span>
                  </TouchableOpacity>
                  <span style={{ fontSize: 11, color: greetingTextColor, opacity: 0.7 }}>{logoWidth}px</span>
                  <TouchableOpacity
                    onPress={() => handleSettingsFieldChange("emailLogoWidth", Math.min(400, logoWidth + 20))}
                    style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.25)", justifyContent: "center", alignItems: "center", marginLeft: 6 }}
                  >
                    <span style={{ fontSize: 14, fontWeight: "700", color: greetingTextColor, lineHeight: "16px" }}>+</span>
                  </TouchableOpacity>
                </div>
              </div>
            ) : null}
            <TextInput
              ref={setInputRef("greeting")}
              debounceMs={500}
              multiline={true}
              onChangeText={(val) => handleSettingsFieldChange("emailGreeting", greetingHasLogo ? "{storeLogo}\n" + val : val)}
              onSelect={(e) => { cursorRefs.current["greeting"] = e.target.selectionStart; }}
              placeholder="Email greeting..."
              placeholderTextColor={greetingTextColor === "white" ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.3)"}
              value={greetingDisplayText}
              style={{ backgroundColor: greetingBg, color: greetingTextColor, fontSize: 20, fontWeight: "700", padding: 20, paddingTop: greetingHasLogo && logoUrl ? 10 : 20, minHeight: 60, overflow: "hidden", outline: "none", border: "none", borderRadius: 0, textAlign: greetingAlign === "left" ? "left" : "center", width: "100%", boxSizing: "border-box" }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "row", alignItems: "center", marginTop: 6, justifyContent: "space-between", flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", alignItems: "center", flex: 1 }}>
              <TouchableOpacity
                onPress={() => {
                  if (greetingHasLogo) {
                    handleSettingsFieldChange("emailGreeting", (greeting || "").replace(/\{storeLogo\}\n?/g, "").replace(/\n?\{storeLogo\}/g, ""));
                  } else {
                    handleSettingsFieldChange("emailGreeting", "{storeLogo}\n" + (greeting || ""));
                  }
                }}
                style={{ ...varBtnStyle, backgroundColor: greetingHasLogo ? "#d4edda" : varBtnStyle.backgroundColor, borderColor: greetingHasLogo ? C.green : varBtnStyle.borderColor }}
              >
                <span style={{ fontSize: 12, color: greetingHasLogo ? C.green : C.text, fontWeight: greetingHasLogo ? "600" : "400" }}>{greetingHasLogo ? "Store Logo \u2713" : "Store Logo"}</span>
              </TouchableOpacity>
              {COLORS.map((c) => {
                let isActive = greetingColorObj?.label === c.label;
                return (
                  <TouchableOpacity
                    key={c.label}
                    onPress={() => handleSettingsFieldChange("emailGreetingColorObj", c)}
                    style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c.backgroundColor, borderWidth: isActive ? 3 : 1, borderStyle: "solid", borderColor: isActive ? C.green : C.borderStrong, marginRight: 4, marginBottom: 4 }}
                  />
                );
              })}
            </div>
            {renderAlignToggle(greetingAlign, (val) => handleSettingsFieldChange("emailGreetingAlign", val))}
          </div>
        </div>

        {/* ===== SHARED FOOTER ===== */}
        <div style={{ width: "100%", marginBottom: 20, flexShrink: 0 }}>
          <span style={{ fontSize: 12, fontWeight: "600", color: C.textMuted, marginBottom: 6, display: "block" }}>FOOTER (shared)</span>
          <div style={{ backgroundColor: "#F5F5F5", borderRadius: 8, overflow: "hidden", borderWidth: 1, borderStyle: "solid", borderColor: "#E0E0E0" }}>
            {footerHasLogo && logoUrl ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 16, paddingBottom: 4 }}>
                <DomImage src={logoUrl} resizeMode="contain" style={{ width: logoWidth, height: logoWidth * 0.5 }} />
              </div>
            ) : null}
            <TextInput
              ref={setInputRef("footer")}
              debounceMs={500}
              multiline={true}
              onChangeText={(val) => handleSettingsFieldChange("emailFooter", footerHasLogo ? "{storeLogo}\n" + val : val)}
              onSelect={(e) => { cursorRefs.current["footer"] = e.target.selectionStart; }}
              placeholder="Email footer..."
              placeholderTextColor={C.textMuted}
              value={footerDisplayText}
              style={{ backgroundColor: "#F5F5F5", color: "#888888", fontSize: 13, lineHeight: "21px", padding: 20, paddingTop: footerHasLogo && logoUrl ? 8 : 20, minHeight: 60, overflow: "hidden", outline: "none", border: "none", borderRadius: 0, textAlign: footerAlign === "left" ? "left" : "center", width: "100%", boxSizing: "border-box" }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "row", alignItems: "center", marginTop: 6, justifyContent: "space-between", flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", alignItems: "center", flex: 1 }}>
              <TouchableOpacity
                onPress={() => {
                  if (footerHasLogo) {
                    handleSettingsFieldChange("emailFooter", (footer || "").replace(/\{storeLogo\}\n?/g, "").replace(/\n?\{storeLogo\}/g, ""));
                  } else {
                    handleSettingsFieldChange("emailFooter", "{storeLogo}\n" + (footer || ""));
                  }
                }}
                style={{ ...varBtnStyle, backgroundColor: footerHasLogo ? "#d4edda" : varBtnStyle.backgroundColor, borderColor: footerHasLogo ? C.green : varBtnStyle.borderColor }}
              >
                <span style={{ fontSize: 12, color: footerHasLogo ? C.green : C.text, fontWeight: footerHasLogo ? "600" : "400" }}>{footerHasLogo ? "Store Logo \u2713" : "Store Logo"}</span>
              </TouchableOpacity>
              {FOOTER_VARIABLES.filter((v) => v.variable !== "{storeLogo}").map((v) => (
                <TouchableOpacity
                  key={v.variable}
                  onPress={() => insertVarAtCursor("footer", footerDisplayText, v.variable, (val) => handleSettingsFieldChange("emailFooter", footerHasLogo ? "{storeLogo}\n" + val : val))}
                  style={varBtnStyle}
                >
                  <span style={{ fontSize: 12, color: C.text }}>{v.label}</span>
                </TouchableOpacity>
              ))}
            </div>
            {renderAlignToggle(footerAlign, (val) => handleSettingsFieldChange("emailFooterAlign", val))}
          </div>
        </div>

        {/* ===== ADD TEMPLATE BUTTON ===== */}
        <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 10, flexShrink: 0 }}>
          <BoxButton1
            onPress={handleAddTemplate}
            label="Add Template"
            colorGradientArr={COLOR_GRADIENTS.blue}
            textStyle={{ color: "white" }}
            style={{ paddingLeft: 12, paddingRight: 12, paddingTop: 6, paddingBottom: 6 }}
          />
        </div>

        {/* ===== TEMPLATES LIST ===== */}
        <div style={{ width: "100%" }}>
          {templates.map((templateObj) => {
            let isSelected = sSelectedTemplateId === templateObj.id;
            let actionColorObj = templateObj.actionColorObj || { textColor: "white", backgroundColor: "green", label: "Green" };
            let messageVal = isNewTemplate(templateObj.id) ? (getLocalValue(templateObj.id, "message") ?? getMessage(templateObj)) : getMessage(templateObj);
            let actionVal = isNewTemplate(templateObj.id) ? (getLocalValue(templateObj.id, "action") ?? (templateObj.action || "")) : (templateObj.action || "");
            let ticketLabel = templateObj.type === "saleReceipt" ? "Sale Receipt" : templateObj.type === "intakeReceipt" ? "Intake / Estimate" : templateObj.type === "creditReceipt" ? "Credit Receipt" : templateObj.type === "giftCardReceipt" ? "Gift Card Receipt" : "";

            return (
              <div
                key={templateObj.id}
                style={{
                  width: "100%",
                  marginBottom: 20,
                  borderWidth: 1,
                  borderStyle: "solid",
                  borderColor: isSelected ? C.green : C.buttonLightGreenOutline,
                  borderRadius: 10,
                  overflow: "hidden",
                  backgroundColor: C.backgroundListWhite,
                  boxSizing: "border-box",
                }}
              >

                {/* Header row: template name + delete */}
                <div style={{ display: "flex", flexDirection: "row", alignItems: "center", padding: 10, paddingBottom: 8 }}>
                  <TextInput
                    debounceMs={500}
                    onChangeText={(val) => handleFieldChange(templateObj, "label", val)}
                    onFocus={() => _setSelectedTemplateId(templateObj.id)}
                    placeholder="Template name..."
                    placeholderTextColor={C.textDisabled}
                    style={{ ...inputStyle, flex: 1, fontWeight: "500" }}
                    value={isNewTemplate(templateObj.id) ? (getLocalValue(templateObj.id, "label") ?? getLabel(templateObj)) : getLabel(templateObj)}
                  />
                  {!templateObj.type && templateObj.removable !== false && (
                    <Tooltip text="Delete template" position="top">
                      <BoxButton1
                        onPress={() => handleDeleteTemplate(templateObj)}
                        style={{ marginLeft: 8 }}
                        iconSize={15}
                        icon={ICONS.trash}
                      />
                    </Tooltip>
                  )}
                </div>

                {/* Subject */}
                <div style={{ paddingLeft: 10, paddingRight: 10, paddingBottom: 8 }}>
                  <TextInput
                    debounceMs={500}
                    onChangeText={(val) => handleFieldChange(templateObj, "subject", val)}
                    onFocus={() => _setSelectedTemplateId(templateObj.id)}
                    placeholder="Email subject..."
                    placeholderTextColor={C.textDisabled}
                    style={{ ...inputStyle }}
                    value={isNewTemplate(templateObj.id) ? (getLocalValue(templateObj.id, "subject") ?? templateObj.subject) : templateObj.subject}
                  />
                </div>

                {/* Message - styled like email body */}
                <TextInput
                  ref={setInputRef(templateObj.id + "_message")}
                  debounceMs={500}
                  multiline={true}
                  onChangeText={(val) => handleFieldChange(templateObj, "message", val)}
                  onFocus={() => _setSelectedTemplateId(templateObj.id)}
                  onSelect={(e) => { cursorRefs.current[templateObj.id + "_message"] = e.target.selectionStart; }}
                  placeholder="Email message..."
                  placeholderTextColor={C.textDisabled}
                  style={{
                    backgroundColor: "#ffffff",
                    color: "#333333",
                    fontSize: 15,
                    lineHeight: "25px",
                    padding: 20,
                    minHeight: 100,
                    overflow: "hidden",
                    outline: "none",
                    border: "none",
                    borderTop: "1px solid #E0E0E0",
                    borderBottom: "1px solid #E0E0E0",
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                  value={messageVal}
                />

                {/* Variable buttons + emoji */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    flexWrap: "wrap",
                    marginTop: 6,
                    alignItems: "center",
                    paddingLeft: 10,
                    paddingRight: 10,
                    opacity: isSelected ? 1 : 0,
                    pointerEvents: isSelected ? "auto" : "none",
                  }}
                >
                  <TouchableOpacity onPress={() => _setEmojiModalRefKey(templateObj.id + "_message")} style={varBtnStyle}>
                    <span style={{ fontSize: 14 }}>{"\uD83D\uDE0A"}</span>
                  </TouchableOpacity>
                  {MESSAGE_VARIABLES.map((v) => (
                    <TouchableOpacity key={v.variable} onPress={() => handleInsertMessageVar(templateObj, v.variable)} style={varBtnStyle}>
                      <span style={{ fontSize: 12, color: C.text }}>{v.label}</span>
                    </TouchableOpacity>
                  ))}
                </div>

                {/* Action button section - styled like email CTA area */}
                <div style={{ backgroundColor: "#E8F5E9", padding: 16, marginTop: 8, display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: "600", color: C.textMuted, marginBottom: 6, alignSelf: "flex-start" }}>
                    ACTION BUTTON {ticketLabel ? " - links to " + ticketLabel : " (optional)"}
                  </span>
                  <TextInput
                    debounceMs={500}
                    onChangeText={(val) => handleFieldChange(templateObj, "action", val)}
                    onFocus={() => _setSelectedTemplateId(templateObj.id)}
                    placeholder='Button label (e.g. "View Receipt")...'
                    placeholderTextColor={C.textMuted}
                    style={{ ...inputStyle, borderColor: "#C8E6C9", backgroundColor: "#ffffff", width: "100%", textAlign: "center" }}
                    value={actionVal}
                  />
                  {!!actionVal.trim() && (
                    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
                      <div style={{ backgroundColor: actionColorObj.backgroundColor, borderRadius: 6, paddingTop: 14, paddingBottom: 14, paddingLeft: 36, paddingRight: 36 }}>
                        <span style={{ color: actionColorObj.textColor, fontSize: 15, fontWeight: "600", letterSpacing: 0.3 }}>{actionVal}</span>
                      </div>
                      {renderColorPicker(actionColorObj, (c) => handleFieldChange(templateObj, "actionColorObj", c))}
                    </div>
                  )}
                </div>

                {/* Save button for new templates */}
                {isNewTemplate(templateObj.id) && (
                  <div style={{ padding: 10 }}>
                    <Button
                      colorGradientArr={COLOR_GRADIENTS.greenblue}
                      text="SAVE"
                      onPress={() => handleSaveNewTemplate(templateObj)}
                      textStyle={{ color: C.textWhite, fontSize: 13 }}
                      buttonStyle={{ alignSelf: "flex-end", width: 100 }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Emoji picker modal */}
        {!!sEmojiModalRefKey && createPortal(
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, display: "flex", justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.4)", zIndex: Z.modal }}>
            <div
              onClick={() => _setEmojiModalRefKey(null)}
              style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
            />
            <div style={{ backgroundColor: C.backgroundWhite, borderRadius: 12, padding: 15, width: 320, zIndex: 1 }}>
              <span style={{ fontSize: 14, fontWeight: "600", color: C.text, marginBottom: 10, textAlign: "center", display: "block" }}>{"Insert Emoji"}</span>
              <div style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", justifyContent: "center" }}>
                {TEMPLATE_EMOJIS.map((e) => (
                  <TouchableOpacity
                    key={e.id}
                    onPress={() => {
                      let refKey = sEmojiModalRefKey;
                      let parts = refKey.split("_message");
                      if (parts.length === 2) {
                        let tObj = templates.find((t) => t.id === parts[0]);
                        if (tObj) handleInsertMessageVar(tObj, e.id);
                      }
                      _setEmojiModalRefKey(null);
                    }}
                    style={{ width: 48, height: 48, display: "flex", justifyContent: "center", alignItems: "center", borderRadius: 8 }}
                  >
                    <span style={{ fontSize: 24 }}>{e.id}</span>
                  </TouchableOpacity>
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}

      </BoxContainerInner>
    </BoxContainerOuter>
  );
};
