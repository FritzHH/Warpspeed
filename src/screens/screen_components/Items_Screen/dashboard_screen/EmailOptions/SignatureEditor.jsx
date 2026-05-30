import React, { useEffect, useRef, useState } from "react";
import {
  DropdownMenu,
  Image as DomImage,
  Tooltip,
  TouchableOpacity,
} from "../../../../../dom_components";
import { C, ICONS, Radius } from "../../../../../styles";
import { log } from "../../../../../utils";
import {
  useAlertScreenStore,
  useEmailStore,
  useLoginStore,
  useSettingsStore,
} from "../../../../../stores";
import { dbUpdateEmailAccount } from "../../../../../db_calls_wrapper";
import {
  FONT_FAMILIES,
  FONT_WEIGHTS,
  MAX_SIG_IMAGE_HEIGHT,
  MAX_SIG_IMAGE_WIDTH,
} from "./_helpers";

export const SignatureEditor = ({ accountKey }) => {
  const [sUploading, _sSetUploading] = useState(false);
  const imageInputRef = useRef(null);
  const editorRef = useRef(null);
  const saveTimerRef = useRef(null);
  const cursorPosRef = useRef(null);

  const emailAccounts = useEmailStore((state) => state.emailAccounts) || [];
  let selectedAccount = emailAccounts.find(
    (a) => (a.accountKey || a.id) === accountKey
  );
  let sig = selectedAccount?.signature || {};
  let sigImageUrl = sig.imageUrl || "";

  function saveSigField(updatedSig) {
    if (!accountKey) return;
    dbUpdateEmailAccount(accountKey, { signature: updatedSig });
  }

  const initSegments = () => {
    return sig.segments || [];
  };

  const [sSegments, _sSetSegments] = useState(initSegments);
  const [sActiveFontFamily, _sSetActiveFontFamily] = useState(sig.fontFamily || "Arial");
  const [sActiveFontSize, _sSetActiveFontSize] = useState(sig.fontSize || 14);
  const [sActiveFontWeight, _sSetActiveFontWeight] = useState(sig.fontWeight || "400");
  const [sActiveItalic, _sSetActiveItalic] = useState(false);

  const segmentsRef = useRef(sSegments);
  segmentsRef.current = sSegments;
  const savedRangeRef = useRef(null);

  function saveSegments(newSegments) {
    _sSetSegments(newSegments);
    segmentsRef.current = newSegments;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveSigField({ ...sig, segments: newSegments });
    }, 500);
  }

  function mergeAdjacentSegments(segs) {
    if (segs.length <= 1) return segs;
    let merged = [segs[0]];
    for (let i = 1; i < segs.length; i++) {
      let prev = merged[merged.length - 1];
      let cur = segs[i];
      if (prev.fontFamily === cur.fontFamily && prev.fontSize === cur.fontSize && prev.fontWeight === cur.fontWeight && (prev.fontStyle || "normal") === (cur.fontStyle || "normal")) {
        merged[merged.length - 1] = { ...prev, text: prev.text + cur.text };
      } else {
        merged.push(cur);
      }
    }
    return merged;
  }

  function getCursorOffset() {
    let sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    let range = sel.getRangeAt(0);
    let editor = editorRef.current;
    if (!editor || !editor.contains(range.startContainer)) return null;
    let offset = 0;
    let spans = editor.querySelectorAll("span[data-seg]");
    for (let span of spans) {
      if (span.contains(range.startContainer)) {
        offset += range.startOffset;
        return offset;
      }
      offset += span.textContent.length;
    }
    if (range.startContainer === editor) {
      let childIdx = range.startOffset;
      for (let i = 0; i < childIdx && i < spans.length; i++) {
        offset += spans[i].textContent.length;
      }
      return offset;
    }
    return offset;
  }

  function setCursorOffset(offset) {
    let editor = editorRef.current;
    if (!editor) return;
    let spans = editor.querySelectorAll("span[data-seg]");
    let remaining = offset;
    for (let span of spans) {
      let len = span.textContent.length;
      if (remaining <= len) {
        let textNode = span.firstChild;
        if (!textNode) {
          textNode = document.createTextNode("");
          span.appendChild(textNode);
        }
        let sel = window.getSelection();
        let range = document.createRange();
        range.setStart(textNode, Math.min(remaining, textNode.length));
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
      remaining -= len;
    }
    let sel = window.getSelection();
    let range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function globalOffsetToSegment(globalOffset) {
    let segs = segmentsRef.current;
    let offset = 0;
    for (let i = 0; i < segs.length; i++) {
      if (globalOffset <= offset + segs[i].text.length) {
        return { segIdx: i, localOffset: globalOffset - offset };
      }
      offset += segs[i].text.length;
    }
    return { segIdx: segs.length - 1, localOffset: segs.length > 0 ? segs[segs.length - 1].text.length : 0 };
  }

  function insertTextAt(globalOffset, str) {
    let segs = [...segmentsRef.current];
    let activeStyle = { fontFamily: sActiveFontFamily, fontSize: sActiveFontSize, fontWeight: sActiveFontWeight, fontStyle: sActiveItalic ? "italic" : "normal" };

    if (segs.length === 0) {
      saveSegments([{ text: str, ...activeStyle }]);
      return;
    }

    let { segIdx, localOffset } = globalOffsetToSegment(globalOffset);
    let seg = segs[segIdx];

    if (seg.fontFamily === activeStyle.fontFamily && seg.fontSize === activeStyle.fontSize && seg.fontWeight === activeStyle.fontWeight && (seg.fontStyle || "normal") === activeStyle.fontStyle) {
      segs[segIdx] = { ...seg, text: seg.text.slice(0, localOffset) + str + seg.text.slice(localOffset) };
      saveSegments(mergeAdjacentSegments(segs));
    } else {
      let before = { ...seg, text: seg.text.slice(0, localOffset) };
      let inserted = { text: str, ...activeStyle };
      let after = { ...seg, text: seg.text.slice(localOffset) };
      let replacement = [];
      if (before.text) replacement.push(before);
      replacement.push(inserted);
      if (after.text) replacement.push(after);
      segs.splice(segIdx, 1, ...replacement);
      saveSegments(mergeAdjacentSegments(segs));
    }
  }

  function deleteRange(startOffset, endOffset) {
    let segs = [...segmentsRef.current];
    if (segs.length === 0) return;
    let totalLen = segs.reduce((sum, s) => sum + s.text.length, 0);
    startOffset = Math.max(0, startOffset);
    endOffset = Math.min(totalLen, endOffset);
    if (startOffset >= endOffset) return;

    let newSegs = [];
    let offset = 0;
    for (let seg of segs) {
      let segStart = offset;
      let segEnd = offset + seg.text.length;
      if (segEnd <= startOffset || segStart >= endOffset) {
        newSegs.push(seg);
      } else {
        let keepBefore = seg.text.slice(0, Math.max(0, startOffset - segStart));
        let keepAfter = seg.text.slice(Math.max(0, endOffset - segStart));
        let kept = keepBefore + keepAfter;
        if (kept) newSegs.push({ ...seg, text: kept });
      }
      offset += seg.text.length;
    }
    saveSegments(mergeAdjacentSegments(newSegs));
  }

  function getSelectionRange() {
    let sel = window.getSelection();
    let editor = editorRef.current;
    if (!sel || sel.isCollapsed || !editor || !editor.contains(sel.anchorNode)) return null;
    let range = sel.getRangeAt(0);
    let preStart = document.createRange();
    preStart.selectNodeContents(editor);
    preStart.setEnd(range.startContainer, range.startOffset);
    let start = preStart.toString().length;
    let preEnd = document.createRange();
    preEnd.selectNodeContents(editor);
    preEnd.setEnd(range.endContainer, range.endOffset);
    let end = preEnd.toString().length;
    if (start === end) return null;
    return { start: Math.min(start, end), end: Math.max(start, end) };
  }

  function applyStyleToSelection(styleField, styleValue, providedRange) {
    let range = providedRange || getSelectionRange();
    if (!range) return false;
    let { start, end } = range;
    let segs = [...segmentsRef.current];
    let newSegs = [];
    let offset = 0;
    for (let seg of segs) {
      let segStart = offset;
      let segEnd = offset + seg.text.length;
      if (segEnd <= start || segStart >= end) {
        newSegs.push(seg);
      } else {
        let overlapStart = Math.max(start, segStart) - segStart;
        let overlapEnd = Math.min(end, segEnd) - segStart;
        let before = seg.text.slice(0, overlapStart);
        let middle = seg.text.slice(overlapStart, overlapEnd);
        let after = seg.text.slice(overlapEnd);
        if (before) newSegs.push({ ...seg, text: before });
        if (middle) newSegs.push({ ...seg, text: middle, [styleField]: styleValue });
        if (after) newSegs.push({ ...seg, text: after });
      }
      offset += seg.text.length;
    }
    saveSegments(mergeAdjacentSegments(newSegs));
    return true;
  }

  function handleBeforeInput(e) {
    e.preventDefault();
    let cursorOffset = getCursorOffset();
    if (cursorOffset === null) cursorOffset = segmentsRef.current.reduce((s, seg) => s + seg.text.length, 0);

    let sel = window.getSelection();
    let selStart = cursorOffset;
    let selEnd = cursorOffset;
    if (sel && !sel.isCollapsed) {
      let range = sel.getRangeAt(0);
      let preRange = document.createRange();
      preRange.selectNodeContents(editorRef.current);
      preRange.setEnd(range.startContainer, range.startOffset);
      selStart = preRange.toString().length;
      preRange.setEnd(range.endContainer, range.endOffset);
      selEnd = preRange.toString().length;
      selStart = Math.min(selStart, selEnd);
      selEnd = Math.max(cursorOffset, selEnd);
      if (selEnd === selStart) {
        selEnd = selStart + sel.toString().length;
      }
    }

    if (e.inputType === "insertText" || e.inputType === "insertFromPaste" || e.inputType === "insertFromDrop") {
      let data = e.data || (e.dataTransfer && e.dataTransfer.getData("text/plain")) || "";
      if (!data) return;
      if (selStart !== selEnd) deleteRange(selStart, selEnd);
      let insertAt = selStart;
      insertTextAt(insertAt, data);
      cursorPosRef.current = insertAt + data.length;
    } else if (e.inputType === "deleteContentBackward") {
      if (selStart !== selEnd) {
        deleteRange(selStart, selEnd);
        cursorPosRef.current = selStart;
      } else if (selStart > 0) {
        deleteRange(selStart - 1, selStart);
        cursorPosRef.current = selStart - 1;
      }
    } else if (e.inputType === "deleteContentForward") {
      let totalLen = segmentsRef.current.reduce((s, seg) => s + seg.text.length, 0);
      if (selStart !== selEnd) {
        deleteRange(selStart, selEnd);
        cursorPosRef.current = selStart;
      } else if (selStart < totalLen) {
        deleteRange(selStart, selStart + 1);
        cursorPosRef.current = selStart;
      }
    } else if (e.inputType === "insertLineBreak" || e.inputType === "insertParagraph") {
      if (selStart !== selEnd) deleteRange(selStart, selEnd);
      insertTextAt(selStart, "\n");
      cursorPosRef.current = selStart + 1;
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      let cursorOffset = getCursorOffset() || 0;
      let sel = window.getSelection();
      let selStart = cursorOffset;
      let selEnd = cursorOffset;
      if (sel && !sel.isCollapsed) {
        selEnd = selStart + sel.toString().length;
      }
      if (selStart !== selEnd) deleteRange(selStart, selEnd);
      insertTextAt(selStart, "\n");
      cursorPosRef.current = selStart + 1;
    }
  }

  useEffect(() => {
    if (cursorPosRef.current !== null) {
      setCursorOffset(cursorPosRef.current);
      cursorPosRef.current = null;
    }
  });

  useEffect(() => {
    let el = editorRef.current;
    if (!el) return;
    el.addEventListener("beforeinput", handleBeforeInput);
    return () => { el.removeEventListener("beforeinput", handleBeforeInput); };
  });

  useEffect(() => {
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, []);

  function updateSignature(field, value) {
    saveSigField({ ...sig, [field]: value });
  }

  async function handleImageUpload(e) {
    let file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      useAlertScreenStore.getState().setValues({
        title: "Invalid File",
        message: "Please select an image file.",
        btn1Text: "OK",
        handleBtn1Press: () => useAlertScreenStore.getState().setShowAlert(false),
        canExitOnOuterClick: true,
      });
      e.target.value = "";
      return;
    }
    _sSetUploading(true);
    useAlertScreenStore.getState().setValues({
      title: "Processing Image",
      message: "Resizing and uploading...",
      canExitOnOuterClick: false,
    });
    try {
      let shrunk = await shrinkImage(file, MAX_SIG_IMAGE_WIDTH, MAX_SIG_IMAGE_HEIGHT);
      let { storageUpload } = await import("../../../../../db_calls");
      let settings = useSettingsStore.getState().getSettings();
      let url = await storageUpload(
        `${settings.tenantID}/email-signature-${accountKey}`,
        shrunk,
        { contentType: shrunk.type }
      );
      updateSignature("imageUrl", url);
    } catch (err) {
      log("Signature image upload error:", err);
    }
    useAlertScreenStore.getState().setShowAlert(false);
    _sSetUploading(false);
    e.target.value = "";
  }

  function handleRemoveImage() {
    updateSignature("imageUrl", "");
  }

  let fontWeightLabel = FONT_WEIGHTS.find((w) => w.value === sActiveFontWeight)?.label || "Regular";
  let hasSegmentText = sSegments.some((s) => s.text.length > 0);

  let currentUser = useLoginStore((state) => state.currentUser);
  let previewUserName = (() => {
    let firstName = currentUser?.first || "";
    let lastInitial = currentUser?.last ? currentUser.last.charAt(0) + "." : "";
    return (firstName + " " + lastInitial).trim();
  })();

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
      {/* Font controls row */}
      <div style={{ display: "flex", flexDirection: "row", width: "100%", marginBottom: 10, alignItems: "center", gap: 10, flexWrap: "wrap", flexShrink: 0 }}>

        {/* Font Family */}
        <div
          style={{ display: "flex", flexDirection: "row", alignItems: "center" }}
          onMouseDown={() => { savedRangeRef.current = getSelectionRange(); }}
        >
          <span style={{ fontSize: 11, color: C.textMuted, fontWeight: "500", marginRight: 5 }}>{"Font"}</span>
          <DropdownMenu
            dataArr={FONT_FAMILIES.map((f) => ({ label: f, value: f }))}
            onSelect={(item) => {
              let applied = applyStyleToSelection("fontFamily", item.value, savedRangeRef.current);
              savedRangeRef.current = null;
              if (!applied) _sSetActiveFontFamily(item.value);
            }}
            buttonText={sActiveFontFamily}
            matchValue={sActiveFontFamily}
            buttonStyle={{
              borderColor: C.buttonLightGreenOutline,
              borderRadius: Radius.control,
              borderWidth: 1,
              backgroundColor: C.listItemWhite,
              paddingTop: 4,
              paddingBottom: 4,
              paddingLeft: 8,
              paddingRight: 8,
            }}
            buttonTextStyle={{ fontSize: 11, color: C.text, fontWeight: "500" }}
            menuMaxHeight={200}
          />
        </div>

        {/* Font Size */}
        <div style={{ display: "flex", flexDirection: "row", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: C.textMuted, fontWeight: "500", marginRight: 5 }}>{"Size"}</span>
          <div style={{ display: "flex", flexDirection: "row", alignItems: "center", borderColor: C.buttonLightGreenOutline, borderRadius: Radius.control, borderWidth: 1, borderStyle: "solid", backgroundColor: C.listItemWhite, overflow: "hidden" }}>
            <TouchableOpacity
              onPress={() => { let newSize = sActiveFontSize - 1; if (newSize < 10) return; if (!applyStyleToSelection("fontSize", newSize)) _sSetActiveFontSize(newSize); }}
              style={{ paddingTop: 3, paddingBottom: 3, paddingLeft: 7, paddingRight: 7, justifyContent: "center", alignItems: "center" }}
            >
              <span style={{ fontSize: 13, color: C.text, fontWeight: "600" }}>{"-"}</span>
            </TouchableOpacity>
            <span style={{ fontSize: 11, color: C.text, fontWeight: "500", paddingLeft: 4, paddingRight: 4, minWidth: 20, textAlign: "center" }}>{sActiveFontSize}</span>
            <TouchableOpacity
              onPress={() => { let newSize = sActiveFontSize + 1; if (newSize > 24) return; if (!applyStyleToSelection("fontSize", newSize)) _sSetActiveFontSize(newSize); }}
              style={{ paddingTop: 3, paddingBottom: 3, paddingLeft: 7, paddingRight: 7, justifyContent: "center", alignItems: "center" }}
            >
              <span style={{ fontSize: 13, color: C.text, fontWeight: "600" }}>{"+"}</span>
            </TouchableOpacity>
          </div>
        </div>

        {/* Font Weight */}
        <div
          style={{ display: "flex", flexDirection: "row", alignItems: "center" }}
          onMouseDown={() => { savedRangeRef.current = getSelectionRange(); }}
        >
          <span style={{ fontSize: 11, color: C.textMuted, fontWeight: "500", marginRight: 5 }}>{"Weight"}</span>
          <DropdownMenu
            dataArr={FONT_WEIGHTS.map((w) => ({ label: w.label, value: w.value }))}
            onSelect={(item) => {
              let applied = applyStyleToSelection("fontWeight", item.value, savedRangeRef.current);
              savedRangeRef.current = null;
              if (!applied) _sSetActiveFontWeight(item.value);
            }}
            buttonText={fontWeightLabel}
            matchValue={sActiveFontWeight}
            buttonStyle={{
              borderColor: C.buttonLightGreenOutline,
              borderRadius: Radius.control,
              borderWidth: 1,
              backgroundColor: C.listItemWhite,
              paddingTop: 4,
              paddingBottom: 4,
              paddingLeft: 8,
              paddingRight: 8,
            }}
            buttonTextStyle={{ fontSize: 11, color: C.text, fontWeight: "500" }}
            menuMaxHeight={200}
          />
        </div>

        {/* Italic */}
        <TouchableOpacity
          onPress={() => {
            let newVal = sActiveItalic ? "normal" : "italic";
            if (!applyStyleToSelection("fontStyle", newVal)) _sSetActiveItalic(!sActiveItalic);
          }}
          style={{
            paddingTop: 4,
            paddingBottom: 4,
            paddingLeft: 8,
            paddingRight: 8,
            borderRadius: Radius.control,
            borderWidth: 1,
            borderStyle: "solid",
            borderColor: sActiveItalic ? C.green : C.buttonLightGreenOutline,
            backgroundColor: sActiveItalic ? C.green : C.listItemWhite,
          }}
        >
          <span style={{ fontSize: 11, fontStyle: "italic", fontWeight: "500", color: sActiveItalic ? "white" : C.text }}>{"Italic"}</span>
        </TouchableOpacity>
      </div>

      {/* Signature text editor */}
      <span style={{ fontSize: 13, color: C.textMuted, marginBottom: 5, fontWeight: "500" }}>{"Signature Text"}</span>
      <div style={{ width: "100%", marginBottom: 15, position: "relative" }}>
        {sSegments.length === 0 && (
          <div style={{
            position: "absolute",
            top: 10,
            left: 10,
            color: "gray",
            pointerEvents: "none",
            userSelect: "none",
            fontSize: 14,
          }}>
            {"Enter your email signature..."}
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable={true}
          suppressContentEditableWarning={true}
          onKeyDown={handleKeyDown}
          style={{
            width: "100%",
            minHeight: 80,
            borderColor: C.buttonLightGreenOutline,
            borderRadius: Radius.row,
            borderWidth: 2,
            borderStyle: "solid",
            backgroundColor: C.listItemWhite,
            paddingTop: 10,
            paddingBottom: 10,
            paddingLeft: 10,
            paddingRight: 10,
            color: C.text,
            outline: "none",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            cursor: "text",
            boxSizing: "border-box",
          }}
        >
          {sSegments.map((seg, i) => (
            <span
              key={i}
              data-seg={i}
              style={{
                fontFamily: seg.fontFamily,
                fontSize: seg.fontSize,
                fontWeight: seg.fontWeight,
                fontStyle: seg.fontStyle || "normal",
                whiteSpace: "pre-wrap",
              }}
            >
              {seg.text}
            </span>
          ))}
        </div>
      </div>

      {/* Image upload */}
      <span style={{ fontSize: 13, color: C.textMuted, marginBottom: 5, fontWeight: "500" }}>{"Signature Image"}</span>
      <div style={{ display: "flex", flexDirection: "row", alignItems: "center", marginBottom: 15, gap: 10 }}>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          style={{ display: "none" }}
        />
        <TouchableOpacity
          onPress={() => imageInputRef.current?.click()}
          disabled={sUploading}
          style={{ padding: 6, opacity: sUploading ? 0.4 : 1 }}
        >
          <DomImage icon={ICONS.uploadCamera} size={24} />
        </TouchableOpacity>
        {!!sigImageUrl && (
          <Tooltip text="Remove image">
            <TouchableOpacity onPress={handleRemoveImage} style={{ padding: 6 }}>
              <DomImage icon={ICONS.trash} size={20} />
            </TouchableOpacity>
          </Tooltip>
        )}
        {!!sigImageUrl && (
          <Tooltip darkMode text={"Insert here to drop a {logo} placeholder at your\ncursor position in the signature.\n\nWhen an email is sent, {logo} is replaced with your\nuploaded signature image inline at that exact spot,\nso you can place the logo between text, beside a\nphone number, or anywhere else it fits in your\nsignature layout."}>
            <TouchableOpacity
              onPress={() => {
                let cursorOffset = getCursorOffset();
                if (cursorOffset === null) cursorOffset = segmentsRef.current.reduce((s, seg) => s + seg.text.length, 0);
                insertTextAt(cursorOffset, "{logo}");
                cursorPosRef.current = cursorOffset + 6;
              }}
              style={{ paddingTop: 4, paddingBottom: 4, paddingLeft: 8, paddingRight: 8, borderRadius: Radius.control, borderWidth: 1, borderStyle: "solid", borderColor: C.buttonLightGreenOutline, backgroundColor: C.listItemWhite }}
            >
              <span style={{ fontSize: 11, color: C.green, fontWeight: "500" }}>{"{logo}"}</span>
            </TouchableOpacity>
          </Tooltip>
        )}
        <Tooltip darkMode text={"Insert here to drop a {username} placeholder at your\ncursor position in the signature.\n\nWhen an email is sent, {username} is replaced with\nthe signed-in user's name (first name + last\ninitial, e.g. 'Fritz H.'), so the same signature\nworks for every user on this inbox without anyone\nediting it per-account."}>
          <TouchableOpacity
            onPress={() => {
              let cursorOffset = getCursorOffset();
              if (cursorOffset === null) cursorOffset = segmentsRef.current.reduce((s, seg) => s + seg.text.length, 0);
              insertTextAt(cursorOffset, "{username}");
              cursorPosRef.current = cursorOffset + 10;
            }}
            style={{ paddingTop: 4, paddingBottom: 4, paddingLeft: 8, paddingRight: 8, borderRadius: Radius.control, borderWidth: 1, borderStyle: "solid", borderColor: C.buttonLightGreenOutline, backgroundColor: C.listItemWhite }}
          >
            <span style={{ fontSize: 11, color: C.green, fontWeight: "500" }}>{"{username}"}</span>
          </TouchableOpacity>
        </Tooltip>
      </div>

      {/* Image preview with scale controls */}
      {!!sigImageUrl && (
        <div style={{ marginBottom: 15, display: "flex", flexDirection: "row", alignItems: "center", gap: 10 }}>
          <img
            src={sigImageUrl}
            alt="Signature"
            style={{ maxWidth: MAX_SIG_IMAGE_WIDTH * ((sig.imageScale || 100) / 100), maxHeight: MAX_SIG_IMAGE_HEIGHT * ((sig.imageScale || 100) / 100), objectFit: "contain", borderRadius: Radius.control }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {(sig.imageScale || 100) < 100 && (
              <TouchableOpacity
                onPress={() => updateSignature("imageScale", Math.min(100, (sig.imageScale || 100) + 10))}
                style={{ paddingTop: 4, paddingBottom: 4, paddingLeft: 8, paddingRight: 8, borderRadius: Radius.control, borderWidth: 1, borderStyle: "solid", borderColor: C.buttonLightGreenOutline, backgroundColor: C.listItemWhite, alignItems: "center", justifyContent: "center" }}
              >
                <span style={{ fontSize: 14, color: C.text, fontWeight: "600" }}>{"+"}</span>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => updateSignature("imageScale", Math.max(10, (sig.imageScale || 100) - 10))}
              disabled={(sig.imageScale || 100) <= 10}
              style={{ paddingTop: 4, paddingBottom: 4, paddingLeft: 8, paddingRight: 8, borderRadius: Radius.control, borderWidth: 1, borderStyle: "solid", borderColor: C.buttonLightGreenOutline, backgroundColor: C.listItemWhite, alignItems: "center", justifyContent: "center", opacity: (sig.imageScale || 100) <= 10 ? 0.3 : 1 }}
            >
              <span style={{ fontSize: 14, color: C.text, fontWeight: "600" }}>{"-"}</span>
            </TouchableOpacity>
            <span style={{ fontSize: 11, color: C.textMuted, textAlign: "center" }}>{(sig.imageScale || 100) + "%"}</span>
          </div>
        </div>
      )}

      {/* Live preview */}
      <span style={{ fontSize: 13, color: C.textMuted, marginBottom: 8, fontWeight: "500" }}>{"Preview"}</span>
      <div style={{
        width: "100%",
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: C.buttonLightGreenOutline,
        borderRadius: Radius.row,
        backgroundColor: C.backgroundWhite,
        padding: 15,
        boxSizing: "border-box",
      }}>
        <div style={{ borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: C.borderSubtle, paddingTop: 10 }}>
          {hasSegmentText ? (
            <div style={{ whiteSpace: "pre-wrap" }}>
              {sSegments.map((seg, i) => {
                let displayText = seg.text.replace(/\{username\}/g, previewUserName);
                let parts = displayText.split("{logo}");
                if (parts.length === 1) {
                  return (
                    <span key={i} style={{ fontFamily: seg.fontFamily, fontSize: seg.fontSize, fontWeight: seg.fontWeight, fontStyle: seg.fontStyle || "normal", color: C.text }}>
                      {displayText}
                    </span>
                  );
                }
                return parts.map((part, j) => (
                  <React.Fragment key={i + "-" + j}>
                    {part && <span style={{ fontFamily: seg.fontFamily, fontSize: seg.fontSize, fontWeight: seg.fontWeight, fontStyle: seg.fontStyle || "normal", color: C.text }}>{part}</span>}
                    {j < parts.length - 1 && sigImageUrl && (
                      <img
                        src={sigImageUrl}
                        alt="Logo"
                        style={{ maxWidth: MAX_SIG_IMAGE_WIDTH * ((sig.imageScale || 100) / 100), maxHeight: MAX_SIG_IMAGE_HEIGHT * ((sig.imageScale || 100) / 100), objectFit: "contain", verticalAlign: "middle" }}
                      />
                    )}
                  </React.Fragment>
                ));
              })}
            </div>
          ) : (
            !sigImageUrl && <span style={{ fontSize: 13, color: C.textDisabled, fontStyle: "italic" }}>{"No signature configured"}</span>
          )}
        </div>
      </div>

    </div>
  );
};

function shrinkImage(file, maxW, maxH) {
  return new Promise((resolve, reject) => {
    let img = new window.Image();
    img.onload = () => {
      let w = img.width;
      let h = img.height;
      if (w > maxW || h > maxH) {
        let ratio = Math.min(maxW / w, maxH / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      let canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      let ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("Canvas toBlob failed"));
          let shrunkFile = new File([blob], file.name, { type: "image/png" });
          resolve(shrunkFile);
        },
        "image/png",
        0.9
      );
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = URL.createObjectURL(file);
  });
}
