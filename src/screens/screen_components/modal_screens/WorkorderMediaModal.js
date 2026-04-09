/* eslint-disable */
import React, { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { View, Text, Image, TouchableOpacity, ScrollView } from "react-native-web";
import { C, COLOR_GRADIENTS, ICONS } from "../../../styles";
import { Button_, Image_, CheckBox_, Tooltip } from "../../../components";
import { gray, log, compressImage } from "../../../utils";
import {
  useOpenWorkordersStore,
  useAlertScreenStore,
  useLayoutStore,
  useSettingsStore,
  useUploadProgressStore,
} from "../../../stores";
import {
  dbUploadWorkorderMedia,
  dbDeleteWorkorderMedia,
  dbSendEmail,
} from "../../../db_calls_wrapper";

export const WorkorderMediaModal = ({
  visible,
  onClose,
  workorderID,
  mode, // "upload" or "view"
  isDonePaid,
  onSelect, // (mediaItem) => void — when provided, tapping a thumbnail picks it instead of full-view
  onSendMedia, // (mediaItems[]) => void — multi-select: pass selected items back to caller for SMS send
}) => {
  const isMobile = useLayoutStore((s) => s.isMobile);
  const zMedia =
    useOpenWorkordersStore(
      (s) => s.workorders.find((w) => w.id === workorderID)?.media
    ) || [];

  const [sUploading, _setUploading] = useState(false);
  const [sUploadMsg, _setUploadMsg] = useState("");
  const [sFullView, _setFullView] = useState(null); // media item for full-size overlay
  const [sSelectedIds, _setSelectedIds] = useState(new Set());
  const [sSending, _setSending] = useState(false);
  const [sSendEmail, _setSendEmail] = useState(false);
  const [sSendText, _setSendText] = useState(!!onSendMedia);
  const [sPendingFiles, _setPendingFiles] = useState(null);
  const [sCompressConfirm, _setCompressConfirm] = useState(true);
  const fileInputRef = useRef(null);

  if (!visible) return null;

  const zWorkorder = useOpenWorkordersStore.getState().workorders.find((w) => w.id === workorderID) || {};
  const zSettings = useSettingsStore.getState().settings;
  const storeName = zSettings?.storeInfo?.displayName || "Our store";
  const hasCell = !!zWorkorder.customerCell?.length;
  const hasEmail = !!zWorkorder.customerEmail?.length;

  function toggleSelection(itemId) {
    _setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  // Upload handlers
  function handleDirectUpload(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    _setPendingFiles(files);
    _setCompressConfirm(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleCancelUpload() {
    _setPendingFiles(null);
  }

  async function handleConfirmUpload() {
    let files = sPendingFiles;
    let shouldCompress = sCompressConfirm;
    _setPendingFiles(null);
    if (!files?.length) return;
    let total = files.length;
    let completed = 0;
    let failed = 0;
    useUploadProgressStore.getState().setProgress({ completed: 0, total, failed: 0, done: false });
    let newMedia = [...zMedia];
    let storeNameClean = (zSettings?.storeInfo?.displayName || "photo").replace(/\s+/g, "_");
    for (let i = 0; i < files.length; i++) {
      let fileToUpload = files[i];
      let originalFilename = fileToUpload.name;
      let originalFileSize = fileToUpload.size;
      let ext = fileToUpload.name.split(".").pop() || "jpg";
      let rand = Math.floor(1000 + Math.random() * 9000);
      let typeLabel = fileToUpload.type.startsWith("video") ? "Video" : "Image";
      let cleanName = `${storeNameClean}_${typeLabel}_${rand}.${ext}`;
      if (shouldCompress && fileToUpload.type.startsWith("image")) {
        let compressed = await compressImage(fileToUpload, 1024, 0.65);
        if (compressed) {
          compressed.name = cleanName;
          fileToUpload = compressed;
        } else {
          fileToUpload = new File([fileToUpload], cleanName, { type: fileToUpload.type });
        }
      } else {
        fileToUpload = new File([fileToUpload], cleanName, { type: fileToUpload.type });
      }
      const result = await dbUploadWorkorderMedia(workorderID, fileToUpload, { originalFilename, originalFileSize });
      if (result.success) {
        newMedia.push(result.mediaItem);
        completed++;
      } else {
        failed++;
      }
      useUploadProgressStore.getState().setProgress({ completed, total, failed, done: false });
    }
    useOpenWorkordersStore.getState().setField("media", newMedia, workorderID);
    useUploadProgressStore.getState().setProgress({ completed, total, failed, done: true });
    setTimeout(() => useUploadProgressStore.getState().setProgress(null), failed > 0 ? 5000 : 3000);
  }

  function handleSendMedia() {
    const selectedItems = zMedia.filter((m) => sSelectedIds.has(m.id));
    if (!selectedItems.length) return;
    let sendEmail = sSendEmail && hasEmail;
    if (!sendEmail) return;

    // Update local store immediately — mark as sent
    const updatedMedia = zMedia.map((m) => {
      if (!sSelectedIds.has(m.id)) return m;
      return {
        ...m,
        sentToCustomer: {
          sms: !!(m.sentToCustomer?.sms),
          email: true,
          sentAt: Date.now(),
        },
      };
    });
    useOpenWorkordersStore.getState().setField("media", updatedMedia, workorderID);
    onClose();

    // Fire off sends in background
    const hasImages = selectedItems.some((m) => m.type === "image");
    const hasVideos = selectedItems.some((m) => m.type === "video");
    let noun = hasImages && hasVideos
      ? "photo(s) and video(s)"
      : hasImages
        ? selectedItems.filter((m) => m.type === "image").length === 1 ? "photo" : "photos"
        : selectedItems.filter((m) => m.type === "video").length === 1 ? "video" : "videos";

    const linksHtml = selectedItems
      .map((m) => {
        const label = m.type === "video" ? "View Video" : "View Photo";
        return `<p><a href="${m.url}">${label}: ${m.filename}</a></p>`;
      })
      .join("");
    const htmlBody = `<p>${storeName} has sent you ${selectedItems.length} ${noun} for your viewing:</p>${linksHtml}`;
    const subject = `Media from ${storeName}`;
    dbSendEmail(zWorkorder.customerEmail, subject, htmlBody);
  }

  function handleSendAll() {
    const selectedItems = zMedia.filter((m) => sSelectedIds.has(m.id));
    if (!selectedItems.length) return;
    let willSendEmail = sSendEmail && hasEmail;
    let willSendText = sSendText && !!onSendMedia;
    if (!willSendEmail && !willSendText) return;

    // Optimistic update: mark media as sent
    const updatedMedia = zMedia.map((m) => {
      if (!sSelectedIds.has(m.id)) return m;
      return {
        ...m,
        sentToCustomer: {
          sms: willSendText || !!(m.sentToCustomer?.sms),
          email: willSendEmail || !!(m.sentToCustomer?.email),
          sentAt: Date.now(),
        },
      };
    });
    useOpenWorkordersStore.getState().setField("media", updatedMedia, workorderID);

    // Send email if checked
    if (willSendEmail) {
      const hasImages = selectedItems.some((m) => m.type === "image");
      const hasVideos = selectedItems.some((m) => m.type === "video");
      let noun = hasImages && hasVideos
        ? "photo(s) and video(s)"
        : hasImages
          ? selectedItems.filter((m) => m.type === "image").length === 1 ? "photo" : "photos"
          : selectedItems.filter((m) => m.type === "video").length === 1 ? "video" : "videos";
      const linksHtml = selectedItems
        .map((m) => {
          const label = m.type === "video" ? "View Video" : "View Photo";
          return `<p><a href="${m.url}">${label}: ${m.filename}</a></p>`;
        })
        .join("");
      const htmlBody = `<p>${storeName} has sent you ${selectedItems.length} ${noun} for your viewing:</p>${linksHtml}`;
      const subject = `Media from ${storeName}`;
      dbSendEmail(zWorkorder.customerEmail, subject, htmlBody);
    }

    // Send text if checked - pass to parent for can respond flow
    if (willSendText) {
      onSendMedia(selectedItems);
      return;
    }

    // Only email - close modal
    onClose();
  }

  const [sDeleting, _setDeleting] = useState(false);

  function handleDeleteSelected() {
    const selectedItems = zMedia.filter((m) => sSelectedIds.has(m.id));
    if (!selectedItems.length) return;

    // Update local store immediately and close
    const remaining = zMedia.filter((m) => !sSelectedIds.has(m.id));
    useOpenWorkordersStore.getState().setField("media", remaining, workorderID);
    _setSelectedIds(new Set());

    // Fire off storage deletes in background
    for (let i = 0; i < selectedItems.length; i++) {
      dbDeleteWorkorderMedia(selectedItems[i]);
    }
  }

  function handleDeleteSingle(mediaItem) {
    const remaining = zMedia.filter((m) => m.id !== mediaItem.id);
    useOpenWorkordersStore.getState().setField("media", remaining, workorderID);
    _setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(mediaItem.id);
      return next;
    });
    dbDeleteWorkorderMedia(mediaItem);
  }

  const MODAL_WIDTH = isMobile ? "95%" : 600;
  const selectedCount = sSelectedIds.size;

  // Full-size overlay
  if (sFullView) {
    return createPortal(
      <div
        onClick={() => _setFullView(null)}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0,0,0,0.85)",
          zIndex: 9999,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "90%",
            maxWidth: 800,
            maxHeight: "90%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {sFullView.type === "video" ? (
            <video
              src={sFullView.url}
              controls
              autoPlay
              style={{
                maxWidth: "100%",
                maxHeight: "70vh",
                borderRadius: 8,
              }}
            />
          ) : (
            <Image
              source={{ uri: sFullView.url }}
              style={{
                width: "100%",
                height: 500,
                borderRadius: 8,
              }}
              resizeMode="contain"
            />
          )}
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        zIndex: 9998,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: MODAL_WIDTH,
          maxHeight: "80%",
          backgroundColor: C.backgroundWhite,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: C.buttonLightGreenOutline,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            padding: 16,
            borderBottomWidth: 1,
            borderBottomColor: gray(0.25),
          }}
        >
          <Text
            style={{
              fontSize: 18,
              fontWeight: "600",
              color: C.text,
            }}
          >
            Workorder Media
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {/* Upload button in header */}
            {!isDonePaid && (
              <Button_
                text="UPLOAD"
                icon={ICONS.uploadCamera}
                iconSize={18}
                onPress={() => fileInputRef.current?.click()}
                buttonStyle={{
                  backgroundColor: C.orange,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 5,
                }}
                textStyle={{ color: "white", fontSize: 14, fontWeight: "700" }}
              />
            )}
            <Button_
              text="X"
              onPress={onClose}
              buttonStyle={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 6,
              }}
              textStyle={{ fontSize: 16, fontWeight: "600", color: C.lightText }}
            />
          </View>
        </View>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          {...(isMobile ? { capture: "environment" } : {})}
          onChange={handleDirectUpload}
          style={{ display: "none" }}
        />

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16 }}
        >
          {/* Media grid */}
          {zMedia.length > 0 ? (
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              {zMedia.map((item) => {
                const isSelected = sSelectedIds.has(item.id);
                const wasSent = !!(item.sentToCustomer?.sms || item.sentToCustomer?.email);
                let displayName = item.originalFilename || item.filename;
                let displaySize = item.originalFileSize || item.fileSize;
                let sizeStr = displaySize
                  ? (displaySize < 1048576 ? (displaySize / 1024).toFixed(0) + " KB" : (displaySize / 1048576).toFixed(1) + " MB")
                  : "";
                return (
                  <View key={item.id} style={{ width: isMobile ? "31%" : 120, alignItems: "center" }}>
                  <View
                    style={{
                      width: "100%",
                      height: isMobile ? 100 : 120,
                      borderRadius: 8,
                      borderWidth: isSelected ? 2 : 1,
                      borderColor: isSelected ? C.green : gray(0.85),
                      overflow: "hidden",
                      backgroundColor: gray(0.95),
                    }}
                  >
                    <TouchableOpacity
                      onPress={() => onSelect ? onSelect(item) : _setFullView(item)}
                      style={{ flex: 1 }}
                    >
                      {item.type === "video" ? (
                        <View
                          style={{
                            flex: 1,
                            justifyContent: "center",
                            alignItems: "center",
                            backgroundColor: gray(0.2),
                          }}
                        >
                          <Text style={{ color: "white", fontSize: 28 }}>
                            ▶
                          </Text>
                          <Text
                            style={{ color: "white", fontSize: 10, marginTop: 2 }}
                            numberOfLines={1}
                          >
                            {item.filename}
                          </Text>
                        </View>
                      ) : (
                        <Image
                          source={{ uri: item.thumbnailUrl || item.url }}
                          style={{ width: "100%", height: "100%" }}
                          resizeMode="cover"
                        />
                      )}
                    </TouchableOpacity>

                    {/* Selection checkbox — top-left */}
                    <TouchableOpacity
                      onPress={() => toggleSelection(item.id)}
                      style={{
                        position: "absolute",
                        top: 4,
                        left: 4,
                        width: 24,
                        height: 24,
                        borderRadius: 4,
                        backgroundColor: "rgba(255,255,255,0.85)",
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <Image_
                        icon={isSelected ? ICONS.checkbox : ICONS.checkoxEmpty}
                        size={16}
                      />
                    </TouchableOpacity>

                    {/* Delete X — top-right */}
                    <TouchableOpacity
                      onPress={() => handleDeleteSingle(item)}
                      style={{
                        position: "absolute",
                        top: 4,
                        right: 4,
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        backgroundColor: C.red,
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ color: "white", fontSize: 13, fontWeight: "700", lineHeight: 14, marginTop: -1 }}>X</Text>
                    </TouchableOpacity>

                    {/* Sent badge — bottom-right */}
                    {wasSent && (
                      <View
                        style={{
                          position: "absolute",
                          bottom: 4,
                          right: 4,
                          backgroundColor: C.green,
                          borderRadius: 4,
                          paddingHorizontal: 5,
                          paddingVertical: 2,
                        }}
                      >
                        <Text style={{ color: "white", fontSize: 9, fontWeight: "600" }}>
                          {item.sentToCustomer?.sms && item.sentToCustomer?.email
                            ? "Texted + Emailed"
                            : item.sentToCustomer?.sms
                              ? "Texted"
                              : "Emailed"}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Tooltip text={`${displayName}${sizeStr ? ` — ${sizeStr}` : ""}`} position="bottom">
                    <Text style={{ fontSize: 9, color: gray(0.5), marginTop: 2, width: isMobile ? undefined : 120 }}>
                      {displayName}{sizeStr ? ` — ${sizeStr}` : ""}
                    </Text>
                  </Tooltip>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text
              style={{
                color: C.lightText,
                fontSize: 14,
                textAlign: "center",
                paddingVertical: 20,
              }}
            >
              No media on this workorder
            </Text>
          )}
        </ScrollView>

        {/* Info — send media via text through Messages (only when NOT opened from Messages) */}
        {zMedia.length > 0 && hasCell && !onSendMedia && !onSelect && (
          <View style={{ paddingHorizontal: 12, paddingTop: 6, paddingBottom: 2 }}>
            <Text style={{ fontSize: 13, color: gray(0.5), fontStyle: "italic", textAlign: "center" }}>
              To send media via text, use the Messages tab
            </Text>
          </View>
        )}
        {/* Footer — Send / Delete Media buttons */}
        {zMedia.length > 0 && (selectedCount > 0 || hasEmail || onSendMedia) && (
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingHorizontal: 12,
              paddingBottom: 12,
              paddingTop: 4,
              borderTopWidth: 1,
              borderTopColor: gray(0.25),
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              {selectedCount > 0 && (
                <Text style={{ color: C.lightText, fontSize: 13 }}>
                  {selectedCount} selected
                </Text>
              )}
              {onSendMedia && hasCell && (
                <CheckBox_
                  text="Text"
                  isChecked={sSendText}
                  onCheck={() => _setSendText(!sSendText)}
                />
              )}
              {hasEmail && (
                <CheckBox_
                  text="Email"
                  isChecked={sSendEmail}
                  onCheck={() => _setSendEmail(!sSendEmail)}
                />
              )}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {selectedCount > 0 && (
              <Button_
                text={sDeleting ? "Deleting..." : "Delete Media"}
                colorGradientArr={COLOR_GRADIENTS.red}
                icon={ICONS.close1}
                iconSize={14}
                onPress={handleDeleteSelected}
                enabled={!sDeleting && !sSending}
                buttonStyle={{
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                  borderRadius: 5,
                  opacity: !sDeleting && !sSending ? 1 : 0.4,
                }}
                textStyle={{ fontSize: 14, fontWeight: "500" }}
              />
            )}
            {onSendMedia ? (
              <Button_
                text="Send Media"
                colorGradientArr={COLOR_GRADIENTS.green}
                icon={ICONS.paperPlane}
                iconSize={16}
                onPress={handleSendAll}
                enabled={selectedCount > 0 && (sSendText || sSendEmail)}
                buttonStyle={{
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                  borderRadius: 5,
                  opacity: selectedCount > 0 && (sSendText || sSendEmail) ? 1 : 0.4,
                }}
                textStyle={{ fontSize: 14, fontWeight: "500" }}
              />
            ) : hasEmail ? (
              <Button_
                text={sSending ? "Sending..." : "Email Media"}
                colorGradientArr={COLOR_GRADIENTS.green}
                icon={ICONS.paperPlane}
                iconSize={16}
                onPress={handleSendMedia}
                enabled={selectedCount > 0 && !sSending}
                buttonStyle={{
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                  borderRadius: 5,
                  opacity: selectedCount > 0 && !sSending ? 1 : 0.4,
                }}
                textStyle={{ fontSize: 14, fontWeight: "500" }}
              />
            ) : null}
            </View>
          </View>
        )}
      </div>

      {/* Upload compression confirmation overlay */}
      {sPendingFiles && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            zIndex: 10000,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <div
            onClick={handleCancelUpload}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, cursor: "default" }}
          />
          <View
            style={{
              width: 624,
              backgroundColor: C.backgroundWhite,
              borderRadius: 12,
              borderWidth: 2,
              borderColor: C.buttonLightGreenOutline,
              padding: 20,
            }}
          >
            <Text style={{ fontSize: 14, color: C.text, marginBottom: 10, lineHeight: 20, textAlign: "center" }}>
              Compression is set to medium. Only uncheck the box if you need high zoom capability, as the process takes drastically longer. Recommendation: first try the compressed image to see if it's good enough before using the uncompressed option.
            </Text>
            {sPendingFiles.map((f, idx) => (
              <Text key={idx} style={{ fontSize: 12, color: gray(0.45), textAlign: "center" }}>
                {f.name} - {f.size < 1048576 ? (f.size / 1024).toFixed(0) + " KB" : (f.size / 1048576).toFixed(1) + " MB"}
              </Text>
            ))}
            <View style={{ height: 14 }} />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <CheckBox_
                text="Medium compression"
                isChecked={sCompressConfirm}
                onCheck={() => _setCompressConfirm(!sCompressConfirm)}
              />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Button_
                  text="Upload"
                  colorGradientArr={COLOR_GRADIENTS.green}
                  onPress={handleConfirmUpload}
                  buttonStyle={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 5 }}
                  textStyle={{ fontSize: 14 }}
                />
                <Button_
                  text="Cancel"
                  colorGradientArr={COLOR_GRADIENTS.grey}
                  onPress={handleCancelUpload}
                  buttonStyle={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 5 }}
                  textStyle={{ fontSize: 14 }}
                />
              </View>
            </View>
          </View>
        </div>
      )}
    </div>,
    document.body
  );
};
