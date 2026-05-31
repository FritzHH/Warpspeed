import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Button,
  DropdownMenu,
  Image as DomImage,
  TextInput,
  Tooltip,
  TouchableOpacity,
} from "../../../../../dom_components";
import { C, COLOR_GRADIENTS, ICONS, Radius } from "../../../../../styles";
import { useZ } from "../../../../../hooks/useZ";
import { formatStoreHours } from "../../../../../utils";

import { COLORS, SETTINGS_OBJ } from "../../../../../data";
import {
  BoxButton1,
  BoxContainerInner,
  BoxContainerOuter,
  FOOTER_VARIABLES,
  MESSAGE_VARIABLES,
  MESSAGE_TYPE_VARIABLES,
  TEMPLATE_EMOJIS,
} from "./_helpers";

export const EmailTemplates = ({ zSettingsObj, handleSettingsFieldChange }) => {
  const [sSelectedTemplateId, _setSelectedTemplateId] = useState(null);
  const [sLocalEdits, _setLocalEdits] = useState({});
  const [sNewTemplateIds, _setNewTemplateIds] = useState([]);
  const [sUnsavedTemplates, _setUnsavedTemplates] = useState([]);
  const [sEmojiModalRefKey, _setEmojiModalRefKey] = useState(null);
  const [sPreviewTemplateId, _setPreviewTemplateId] = useState(null);
  const [sExpandedIds, _setExpandedIds] = useState([]);
  const cursorRefs = useRef({});
  const inputRefs = useRef({});
  const zEmoji = useZ("modal", !!sEmojiModalRefKey);
  const zPreview = useZ("modal", !!sPreviewTemplateId);

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
  let templates = [...sUnsavedTemplates, ...savedTemplates];
  const PAYMENT_TYPES = ["saleReceipt", "refundReceipt", "creditReceipt", "giftCardReceipt"];
  let paymentTemplates = templates.filter((t) => PAYMENT_TYPES.indexOf(t.type) !== -1);
  let workorderTemplates = templates.filter((t) => PAYMENT_TYPES.indexOf(t.type) === -1);
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

  function isExpanded(templateId) {
    return sExpandedIds.indexOf(templateId) !== -1;
  }

  function toggleExpanded(templateId) {
    _setExpandedIds(isExpanded(templateId) ? sExpandedIds.filter((x) => x !== templateId) : [...sExpandedIds, templateId]);
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

  function renderPreviewText(str) {
    if (!str) return null;
    let storePhone = zSettingsObj?.storeInfo?.phone || "";
    let formattedPhone = storePhone.length === 10
      ? "(" + storePhone.slice(0, 3) + ") " + storePhone.slice(3, 6) + "-" + storePhone.slice(6)
      : storePhone;
    let storeHoursText = "";
    try { storeHoursText = formatStoreHours(zSettingsObj?.storeHours); } catch (e) {}
    let resolved = String(str)
      .replace(/\{supportEmail\}/g, zSettingsObj?.storeInfo?.supportEmail || "")
      .replace(/\{storePhone\}/g, formattedPhone)
      .replace(/\{storeHours\}/g, storeHoursText)
      .replace(/\{storeName\}/g, zSettingsObj?.storeInfo?.displayName || zSettingsObj?.storeInfo?.name || "")
      .replace(/\{storeAddress\}/g, zSettingsObj?.storeInfo?.address || "");
    let parts = [];
    let lastIndex = 0;
    let regex = /\{([a-zA-Z]+)\}/g;
    let match;
    let key = 0;
    while ((match = regex.exec(resolved)) !== null) {
      if (match.index > lastIndex) parts.push(resolved.slice(lastIndex, match.index));
      parts.push(
        <span key={"v" + key++} style={{ backgroundColor: "#FFF59D", color: "#5D4037", padding: "1px 5px", borderRadius: 3, fontWeight: 600 }}>
          {match[0]}
        </span>
      );
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < resolved.length) parts.push(resolved.slice(lastIndex));
    return parts;
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
    borderRadius: Radius.control,
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
    borderRadius: Radius.control,
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
      borderRadius: Radius.control,
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

  function renderTemplateCard(templateObj) {
    let actionColorObj = templateObj.actionColorObj || { textColor: "white", backgroundColor: "green", label: "Green" };
    let messageVal = isNewTemplate(templateObj.id) ? (getLocalValue(templateObj.id, "message") ?? getMessage(templateObj)) : getMessage(templateObj);
    let actionVal = isNewTemplate(templateObj.id) ? (getLocalValue(templateObj.id, "action") ?? (templateObj.action || "")) : (templateObj.action || "");
    let ticketLabel = templateObj.type === "saleReceipt" ? "Sale Receipt" : templateObj.type === "refundReceipt" ? "Refund Receipt" : templateObj.type === "intakeReceipt" ? "Intake / Estimate" : templateObj.type === "creditReceipt" ? "Credit Receipt" : templateObj.type === "giftCardReceipt" ? "Gift Card Receipt" : "";
    let subjectVal = isNewTemplate(templateObj.id) ? (getLocalValue(templateObj.id, "subject") ?? templateObj.subject) : templateObj.subject;
    let labelVal = isNewTemplate(templateObj.id) ? (getLocalValue(templateObj.id, "label") ?? getLabel(templateObj)) : getLabel(templateObj);
    let defaultForId = (SETTINGS_OBJ.emailTemplates || []).find((d) => d.id === templateObj.id);
    let canDelete = !templateObj.type && templateObj.removable !== false && defaultForId?.removable !== false;
    let expanded = isExpanded(templateObj.id);

    return (
      <div key={templateObj.id} style={{ width: "100%", marginBottom: 12, padding: 14, borderWidth: 1, borderStyle: "solid", borderColor: C.buttonLightGreenOutline, borderRadius: Radius.row, backgroundColor: C.backgroundWhite, boxSizing: "border-box", flexShrink: 0 }}>
        {/* Header: chevron + centered title + buttons slammed right (click to expand/collapse) */}
        <div
          onClick={() => toggleExpanded(templateObj.id)}
          style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: expanded ? 16 : 0, minHeight: 32, cursor: "pointer", userSelect: "none" }}
        >
          <div style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: C.textMuted }}>{expanded ? "\u25BC" : "\u25B6"}</span>
          </div>
          {ticketLabel ? (
            <span style={{ fontSize: 18, fontWeight: "700", color: C.text }}>{ticketLabel}</span>
          ) : (
            <div onClick={(e) => e.stopPropagation()}>
              <TextInput
                debounceMs={500}
                onChangeText={(val) => handleFieldChange(templateObj, "label", val)}
                onFocus={() => _setSelectedTemplateId(templateObj.id)}
                placeholder="Template name..."
                placeholderTextColor={C.textDisabled}
                style={{ ...inputStyle, borderWidth: 0, borderStyle: "none", borderColor: "transparent", fontSize: 18, fontWeight: "700", textAlign: "center", padding: 6, width: 280, backgroundColor: "transparent" }}
                value={labelVal}
              />
            </div>
          )}
          <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", display: "flex", flexDirection: "row", alignItems: "center", gap: 8 }}>
            {canDelete && (
              <Tooltip text="Delete template" position="top">
                <BoxButton1
                  onPress={() => handleDeleteTemplate(templateObj)}
                  iconSize={15}
                  icon={ICONS.trash}
                />
              </Tooltip>
            )}
            <TouchableOpacity onPress={() => _setPreviewTemplateId(templateObj.id)} style={{ backgroundColor: C.green, borderRadius: Radius.control, paddingTop: 6, paddingBottom: 6, paddingLeft: 14, paddingRight: 14 }}>
              <span style={{ color: C.textWhite, fontSize: 13, fontWeight: "600" }}>View It!</span>
            </TouchableOpacity>
          </div>
        </div>

        {expanded && (
          <>
            {/* Subject */}
            <div style={{ width: "100%", marginBottom: 14 }}>
              <span style={{ fontSize: 12, fontWeight: "600", color: "#2E7D32", marginBottom: 6, display: "block" }}>SUBJECT</span>
              <TextInput
                debounceMs={500}
                onChangeText={(val) => handleFieldChange(templateObj, "subject", val)}
                onFocus={() => _setSelectedTemplateId(templateObj.id)}
                placeholder="Email subject..."
                placeholderTextColor={C.textDisabled}
                style={{ ...inputStyle, padding: 10, width: "100%", boxSizing: "border-box" }}
                value={subjectVal}
              />
            </div>

            {/* Body */}
            <div style={{ width: "100%" }}>
              <span style={{ fontSize: 12, fontWeight: "600", color: "#2E7D32", marginBottom: 6, display: "block" }}>BODY</span>
              <TextInput
                ref={setInputRef(templateObj.id + "_message")}
                debounceMs={500}
                multiline={true}
                onChangeText={(val) => handleFieldChange(templateObj, "message", val)}
                onFocus={() => _setSelectedTemplateId(templateObj.id)}
                onSelect={(e) => { cursorRefs.current[templateObj.id + "_message"] = e.target.selectionStart; }}
                placeholder="Email message..."
                placeholderTextColor={C.textDisabled}
                style={{ backgroundColor: "#ffffff", color: "#333333", fontSize: 15, lineHeight: "25px", padding: 20, minHeight: 100, overflow: "hidden", outline: "none", borderWidth: 1, borderStyle: "solid", borderColor: C.buttonLightGreenOutline, borderRadius: Radius.control, width: "100%", boxSizing: "border-box" }}
                value={messageVal}
              />
            </div>

            {/* Action button section */}
            <div style={{ backgroundColor: "#E8F5E9", padding: 16, marginTop: 12, display: "flex", flexDirection: "column", alignItems: "stretch", borderRadius: Radius.control }}>
              <span style={{ fontSize: 11, fontWeight: "600", color: C.textMuted, marginBottom: 6 }}>
                ACTION BUTTON {ticketLabel ? " - links to " + ticketLabel : " (optional)"}
              </span>
              <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-start", width: "100%", gap: 8 }}>
                <div style={{ width: 160, flexShrink: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                  <DropdownMenu
                    dataArr={COLORS}
                    itemSeparatorStyle={{ height: 0 }}
                    menuBorderColor={"transparent"}
                    onSelect={(item) => handleFieldChange(templateObj, "actionColorObj", item)}
                    buttonText={"Button Color"}
                    modalCoordX={0}
                    itemStyle={{ paddingLeft: 35, paddingRight: 35, paddingTop: 15, paddingBottom: 15 }}
                    matchValue={actionColorObj?.label}
                    preserveItemBackground={true}
                  />
                  <DropdownMenu
                    dataArr={[...MESSAGE_VARIABLES, ...(MESSAGE_TYPE_VARIABLES[templateObj.type] || [])]}
                    onSelect={(item) => handleInsertMessageVar(templateObj, item.variable)}
                    buttonText={"Email Insertions"}
                    modalCoordX={0}
                  />
                </div>
                <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
                  <TextInput
                    debounceMs={500}
                    onChangeText={(val) => handleFieldChange(templateObj, "action", val)}
                    onFocus={() => _setSelectedTemplateId(templateObj.id)}
                    placeholder='Button label (e.g. "View Receipt")...'
                    placeholderTextColor={actionColorObj.textColor === "white" ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.4)"}
                    style={{ backgroundColor: actionColorObj.backgroundColor, color: actionColorObj.textColor, borderWidth: 0, borderStyle: "none", borderRadius: Radius.control, paddingTop: 12, paddingBottom: 12, paddingLeft: 24, paddingRight: 24, fontSize: 14, fontWeight: "600", letterSpacing: 0.3, textAlign: "center", outlineWidth: 0, minWidth: 220 }}
                    value={actionVal}
                  />
                </div>
                <TouchableOpacity onPress={() => _setEmojiModalRefKey(templateObj.id + "_message")} style={{ ...varBtnStyle, marginRight: 0, marginBottom: 0 }}>
                  <span style={{ fontSize: 14 }}>{"\uD83D\uDE0A"}</span>
                </TouchableOpacity>
              </div>
            </div>

            {/* Save button for new templates */}
            {isNewTemplate(templateObj.id) && (
              <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                <Button
                  colorGradientArr={COLOR_GRADIENTS.greenblue}
                  text="SAVE"
                  onPress={() => handleSaveNewTemplate(templateObj)}
                  textStyle={{ color: C.textWhite, fontSize: 13 }}
                  buttonStyle={{ width: 100 }}
                />
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  let logoUrl = zSettingsObj?.storeInfo?.storeLogo || "";
  let logoWidth = zSettingsObj?.emailLogoWidth || 180;

  let greetingColorObj = zSettingsObj?.emailGreetingColorObj || { textColor: "white", backgroundColor: "#2E7D32", label: "Green" };
  let greetingTextColorObj = zSettingsObj?.emailGreetingTextColorObj;
  let greetingBg = greetingColorObj.backgroundColor;
  let greetingTextColor = greetingTextColorObj?.backgroundColor || greetingColorObj.textColor;
  let greetingHasLogo = (greeting || "").includes("{storeLogo}");
  let greetingDisplayText = (greeting || "").replace(/\{storeLogo\}\n?/g, "").replace(/\n?\{storeLogo\}/g, "");
  let footerHasLogo = (footer || "").includes("{storeLogo}");
  let footerDisplayText = (footer || "").replace(/\{storeLogo\}\n?/g, "").replace(/\n?\{storeLogo\}/g, "");

  return (
    <BoxContainerOuter>
      <BoxContainerInner style={{ width: "100%", alignItems: "center" }}>

        {/* ===== HEADER & FOOTER CONTAINER ===== */}
        <div style={{ width: "100%", marginBottom: 24, padding: 18, borderWidth: 1, borderStyle: "solid", borderColor: C.buttonLightGreenOutline, borderRadius: Radius.row, backgroundColor: C.surfaceAlt, boxSizing: "border-box", flexShrink: 0 }}>
          <div style={{ width: "100%", marginBottom: 16, padding: "10px 16px", background: `linear-gradient(135deg, ${C.darkBlue} 0%, ${C.blue} 100%)`, borderRadius: Radius.control, boxSizing: "border-box", boxShadow: "0 2px 4px rgba(0,0,0,0.15)" }}>
            <span style={{ fontSize: 18, fontWeight: "700", color: "white", textAlign: "center", display: "block", letterSpacing: 0.5, textShadow: "0 1px 2px rgba(0,0,0,0.2)" }}>Email Header & Footer</span>
          </div>

        {/* ===== SHARED GREETING ===== */}
        <div style={{ width: "100%", marginBottom: 20, flexShrink: 0 }}>
          <span style={{ fontSize: 12, fontWeight: "600", color: "#2E7D32", marginBottom: 6, display: "block" }}>HEADER</span>
          <div style={{ backgroundColor: greetingBg, borderRadius: Radius.row, overflow: "hidden" }}>
            {greetingHasLogo && logoUrl ? (
              <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 14, paddingBottom: 6 }}>
                <DomImage src={logoUrl} resizeMode="contain" style={{ width: logoWidth, height: logoWidth * 0.5 }} />
                <div style={{ position: "absolute", bottom: -10, left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.18)", borderRadius: Radius.container, paddingLeft: 6, paddingRight: 6, paddingTop: 4, paddingBottom: 4, backdropFilter: "blur(2px)" }}>
                  <TouchableOpacity
                    onPress={() => handleSettingsFieldChange("emailLogoWidth", Math.max(60, logoWidth - 20))}
                    style={{ width: 22, height: 22, borderRadius: Radius.container, backgroundColor: "rgba(255,255,255,0.15)", justifyContent: "center", alignItems: "center", marginRight: 6 }}
                  >
                    <span style={{ fontSize: 14, fontWeight: "700", color: "#ffffff", lineHeight: "16px" }}>-</span>
                  </TouchableOpacity>
                  <span style={{ fontSize: 11, color: "#ffffff", opacity: 0.85 }}>{logoWidth}px</span>
                  <TouchableOpacity
                    onPress={() => handleSettingsFieldChange("emailLogoWidth", Math.min(400, logoWidth + 20))}
                    style={{ width: 22, height: 22, borderRadius: Radius.container, backgroundColor: "rgba(255,255,255,0.15)", justifyContent: "center", alignItems: "center", marginLeft: 6 }}
                  >
                    <span style={{ fontSize: 14, fontWeight: "700", color: "#ffffff", lineHeight: "16px" }}>+</span>
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
              style={{ backgroundColor: greetingBg, color: greetingTextColor, fontSize: 20, fontWeight: "700", lineHeight: "24px", padding: 20, paddingTop: greetingHasLogo && logoUrl ? 16 : 20, paddingBottom: greetingHasLogo && logoUrl ? 14 : 20, minHeight: greetingHasLogo && logoUrl ? 0 : 60, margin: 0, overflow: "hidden", outline: "none", border: "none", borderRadius: 0, textAlign: greetingAlign === "left" ? "left" : "center", width: "100%", boxSizing: "border-box" }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-start", marginTop: 6, gap: 8, width: "100%" }}>
            <div style={{ width: 150, flexShrink: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              <DropdownMenu
                dataArr={COLORS}
                itemSeparatorStyle={{ height: 0 }}
                menuBorderColor={"transparent"}
                onSelect={(item) => handleSettingsFieldChange("emailGreetingTextColorObj", item)}
                buttonText={"Greeting Color"}
                modalCoordX={0}
                itemStyle={{ paddingLeft: 35, paddingRight: 35, paddingTop: 15, paddingBottom: 15 }}
                matchValue={greetingTextColorObj?.label}
                preserveItemBackground={true}
              />
              <DropdownMenu
                dataArr={COLORS}
                itemSeparatorStyle={{ height: 0 }}
                menuBorderColor={"transparent"}
                onSelect={(item) => handleSettingsFieldChange("emailGreetingColorObj", item)}
                buttonText={"Background Color"}
                modalCoordX={0}
                itemStyle={{ paddingLeft: 35, paddingRight: 35, paddingTop: 15, paddingBottom: 15 }}
                matchValue={greetingColorObj?.label}
                preserveItemBackground={true}
              />
            </div>
            <div style={{ flex: 1 }} />
            {renderAlignToggle(greetingAlign, (val) => handleSettingsFieldChange("emailGreetingAlign", val))}
          </div>
        </div>

        {/* ===== EMAIL CONTENT PLACEHOLDER (between header & footer) ===== */}
        <div style={{ width: "100%", marginBottom: 20, flexShrink: 0 }}>
          <div style={{ width: "100%", borderTop: `2px double ${C.blue}`, borderBottom: `2px double ${C.blue}`, paddingTop: 10, paddingBottom: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <span style={{ color: C.blue, fontSize: 16, lineHeight: "16px", fontWeight: "700" }}>.</span>
            <span style={{ color: C.blue, fontSize: 16, lineHeight: "16px", fontWeight: "700" }}>.</span>
            <span style={{ color: C.textMuted, fontSize: 12, fontStyle: "italic", lineHeight: "16px" }}>email content.....</span>
            <span style={{ color: C.blue, fontSize: 16, lineHeight: "16px", fontWeight: "700" }}>.</span>
            <span style={{ color: C.blue, fontSize: 16, lineHeight: "16px", fontWeight: "700" }}>.</span>
          </div>
        </div>

        {/* ===== SHARED FOOTER ===== */}
        <div style={{ width: "100%", marginBottom: 20, flexShrink: 0 }}>
          <span style={{ fontSize: 12, fontWeight: "600", color: "#2E7D32", marginBottom: 6, display: "block" }}>FOOTER</span>
          <div style={{ backgroundColor: "#F5F5F5", borderRadius: Radius.row, overflow: "hidden", borderWidth: 1, borderStyle: "solid", borderColor: "#E0E0E0" }}>
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
          <div style={{ display: "flex", flexDirection: "row", alignItems: "center", marginTop: 6, gap: 8, width: "100%" }}>
            <div style={{ width: 160, flexShrink: 0 }}>
              <DropdownMenu
                dataArr={FOOTER_VARIABLES}
                onSelect={(item) => {
                  if (item.variable === "{storeLogo}") {
                    if (footerHasLogo) {
                      handleSettingsFieldChange("emailFooter", (footer || "").replace(/\{storeLogo\}\n?/g, "").replace(/\n?\{storeLogo\}/g, ""));
                    } else {
                      handleSettingsFieldChange("emailFooter", "{storeLogo}\n" + (footer || ""));
                    }
                  } else {
                    insertVarAtCursor("footer", footerDisplayText, item.variable, (val) => handleSettingsFieldChange("emailFooter", footerHasLogo ? "{storeLogo}\n" + val : val));
                  }
                }}
                buttonText={"Email Insertions"}
                modalCoordX={0}
                matchValue={footerHasLogo ? "Store Logo  \u2192  {storeLogo}" : null}
              />
            </div>
            <div style={{ flex: 1 }} />
            {renderAlignToggle(footerAlign, (val) => handleSettingsFieldChange("emailFooterAlign", val))}
          </div>
        </div>
        </div>

        {/* ===== EMAIL PAYMENT TEMPLATES ===== */}
        <div style={{ width: "100%", marginBottom: 24, padding: 18, borderWidth: 1, borderStyle: "solid", borderColor: C.buttonLightGreenOutline, borderRadius: Radius.row, backgroundColor: C.surfaceAlt, boxSizing: "border-box", flexShrink: 0 }}>
          <div style={{ width: "100%", marginBottom: 16, padding: "10px 16px", background: `linear-gradient(135deg, ${C.darkBlue} 0%, ${C.blue} 100%)`, borderRadius: Radius.control, boxSizing: "border-box", boxShadow: "0 2px 4px rgba(0,0,0,0.15)" }}>
            <span style={{ fontSize: 18, fontWeight: "700", color: "white", textAlign: "center", display: "block", letterSpacing: 0.5, textShadow: "0 1px 2px rgba(0,0,0,0.2)" }}>Email Payment Templates</span>
          </div>
          {paymentTemplates.map(renderTemplateCard)}
        </div>

        {/* ===== EMAIL WORKORDER TEMPLATES ===== */}
        <div style={{ width: "100%", marginBottom: 24, padding: 18, borderWidth: 1, borderStyle: "solid", borderColor: C.buttonLightGreenOutline, borderRadius: Radius.row, backgroundColor: C.surfaceAlt, boxSizing: "border-box", flexShrink: 0 }}>
          <div style={{ width: "100%", marginBottom: 16, padding: "10px 16px", background: `linear-gradient(135deg, ${C.darkBlue} 0%, ${C.blue} 100%)`, borderRadius: Radius.control, boxSizing: "border-box", boxShadow: "0 2px 4px rgba(0,0,0,0.15)" }}>
            <span style={{ fontSize: 18, fontWeight: "700", color: "white", textAlign: "center", display: "block", letterSpacing: 0.5, textShadow: "0 1px 2px rgba(0,0,0,0.2)" }}>Email Workorder Templates</span>
          </div>
          {workorderTemplates.map(renderTemplateCard)}
        </div>

        {/* Emoji picker modal */}
        {!!sEmojiModalRefKey && createPortal(
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, display: "flex", justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.4)", zIndex: zEmoji }}>
            <div
              onClick={() => _setEmojiModalRefKey(null)}
              style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
            />
            <div style={{ backgroundColor: C.backgroundWhite, borderRadius: Radius.container, padding: 15, width: 320, zIndex: 1 }}>
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
                    style={{ width: 48, height: 48, display: "flex", justifyContent: "center", alignItems: "center", borderRadius: Radius.row }}
                  >
                    <span style={{ fontSize: 24 }}>{e.id}</span>
                  </TouchableOpacity>
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Email preview modal */}
        {!!sPreviewTemplateId && (() => {
          let pt = templates.find((t) => t.id === sPreviewTemplateId);
          if (!pt) return null;
          let pSubject = isNewTemplate(pt.id) ? (getLocalValue(pt.id, "subject") ?? pt.subject) : pt.subject;
          let pMessage = isNewTemplate(pt.id) ? (getLocalValue(pt.id, "message") ?? getMessage(pt)) : getMessage(pt);
          let pAction = isNewTemplate(pt.id) ? (getLocalValue(pt.id, "action") ?? (pt.action || "")) : (pt.action || "");
          let pActionColor = pt.actionColorObj || { textColor: "white", backgroundColor: "green", label: "Green" };
          return createPortal(
            <div onClick={() => _setPreviewTemplateId(null)} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, display: "flex", justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)", zIndex: zPreview }}>
              <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: "#ffffff", borderRadius: Radius.row, width: 620, maxWidth: "92vw", maxHeight: "92vh", overflow: "auto", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
                {/* Modal header */}
                <div style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderBottom: "1px solid #E0E0E0" }}>
                  <span style={{ fontSize: 14, fontWeight: "600", color: C.textMuted }}>EMAIL PREVIEW</span>
                  <TouchableOpacity onPress={() => _setPreviewTemplateId(null)} style={{ paddingTop: 4, paddingBottom: 4, paddingLeft: 10, paddingRight: 10 }}>
                    <span style={{ fontSize: 18, color: C.textMuted, lineHeight: "18px" }}>{"\u00D7"}</span>
                  </TouchableOpacity>
                </div>

                {/* Subject row */}
                <div style={{ padding: "10px 20px", borderBottom: "1px solid #EEEEEE", backgroundColor: "#FAFAFA" }}>
                  <span style={{ fontSize: 12, fontWeight: "600", color: C.textMuted, marginRight: 8 }}>Subject:</span>
                  <span style={{ fontSize: 14, fontWeight: "600", color: C.text }}>{pSubject ? renderPreviewText(pSubject) : "(no subject)"}</span>
                </div>

                {/* Greeting/Header */}
                <div style={{ backgroundColor: greetingBg, overflow: "hidden" }}>
                  {greetingHasLogo && logoUrl ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 20, paddingBottom: 0 }}>
                      <DomImage src={logoUrl} resizeMode="contain" style={{ width: logoWidth, height: logoWidth * 0.5 }} />
                    </div>
                  ) : null}
                  {greetingDisplayText ? (
                    <div style={{ color: greetingTextColor, fontSize: 20, fontWeight: "700", lineHeight: "24px", paddingTop: greetingHasLogo && logoUrl ? 8 : 20, paddingBottom: 20, paddingLeft: 20, paddingRight: 20, textAlign: greetingAlign === "left" ? "left" : "center", whiteSpace: "pre-wrap" }}>
                      {renderPreviewText(greetingDisplayText)}
                    </div>
                  ) : null}
                </div>

                {/* Body */}
                <div style={{ padding: 24, fontSize: 15, lineHeight: "25px", color: "#333", whiteSpace: "pre-wrap" }}>
                  {pMessage ? renderPreviewText(pMessage) : <span style={{ color: C.textDisabled }}>(empty body)</span>}
                </div>

                {/* Action button */}
                {!!pAction.trim() && (
                  <div style={{ paddingLeft: 24, paddingRight: 24, paddingBottom: 24, textAlign: "center" }}>
                    <div style={{ display: "inline-block", backgroundColor: pActionColor.backgroundColor, borderRadius: Radius.control, paddingTop: 12, paddingBottom: 12, paddingLeft: 28, paddingRight: 28 }}>
                      <span style={{ color: pActionColor.textColor, fontSize: 15, fontWeight: "600", letterSpacing: 0.3 }}>{pAction}</span>
                    </div>
                  </div>
                )}

                {/* Footer */}
                {(footerDisplayText || (footerHasLogo && logoUrl)) && (
                  <div style={{ backgroundColor: "#F5F5F5", borderTop: "1px solid #E0E0E0" }}>
                    {footerHasLogo && logoUrl ? (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 16, paddingBottom: 4 }}>
                        <DomImage src={logoUrl} resizeMode="contain" style={{ width: logoWidth, height: logoWidth * 0.5 }} />
                      </div>
                    ) : null}
                    {footerDisplayText ? (
                      <div style={{ color: "#888888", fontSize: 13, lineHeight: "21px", paddingTop: footerHasLogo && logoUrl ? 8 : 20, paddingBottom: 20, paddingLeft: 20, paddingRight: 20, textAlign: footerAlign === "left" ? "left" : "center", whiteSpace: "pre-wrap" }}>
                        {renderPreviewText(footerDisplayText)}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>,
            document.body
          );
        })()}

      </BoxContainerInner>
    </BoxContainerOuter>
  );
};
