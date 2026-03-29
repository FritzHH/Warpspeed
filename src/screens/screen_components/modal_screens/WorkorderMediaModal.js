/* eslint-disable */
import React, { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { View, Text, Image, TouchableOpacity, ScrollView } from "react-native-web";
import { C, COLOR_GRADIENTS, ICONS } from "../../../styles";
import { Button_, Image_, CheckBox_, Tooltip } from "../../../components";
import { gray, log } from "../../../utils";
import {
  useOpenWorkordersStore,
  useAlertScreenStore,
  useLayoutStore,
  useSettingsStore,
  useLoginStore,
} from "../../../stores";
import {
  dbUploadWorkorderMedia,
  dbDeleteWorkorderMedia,
  dbSendEmail,
} from "../../../db_calls_wrapper";
import { smsService } from "../../../data_service_modules";
import { SMS_PROTO } from "../../../data";
import { cloneDeep } from "lodash";

export const WorkorderMediaModal = ({
  visible,
  onClose,
  workorderID,
  mode, // "upload" or "view"
  onSelect, // (mediaItem) => void — when provided, tapping a thumbnail picks it instead of full-view
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
  const [sSendText, _setSendText] = useState(true);
  const [sSendEmail, _setSendEmail] = useState(false);
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

  function handleSendMedia() {
    const selectedItems = zMedia.filter((m) => sSelectedIds.has(m.id));
    if (!selectedItems.length) return;
    let sendSms = sSendText && hasCell;
    let sendEmail = sSendEmail && hasEmail;
    if (!sendSms && !sendEmail) return;

    // Update local store immediately — mark as sent
    const updatedMedia = zMedia.map((m) => {
      if (!sSelectedIds.has(m.id)) return m;
      return {
        ...m,
        sentToCustomer: {
          sms: sendSms || !!(m.sentToCustomer?.sms),
          email: sendEmail || !!(m.sentToCustomer?.email),
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

    const links = selectedItems.map((m) => m.url).join("\n");
    const messageText = `${storeName} has sent you ${selectedItems.length} ${noun} for your viewing:\n\n${links}`;

    if (sendSms) {
      let msg = cloneDeep(SMS_PROTO);
      msg.message = messageText;
      msg.phoneNumber = zWorkorder.customerCell;
      msg.firstName = zWorkorder.customerFirst || "";
      msg.lastName = zWorkorder.customerLast || "";
      msg.canRespond = new Date().getTime();
      msg.millis = new Date().getTime();
      msg.customerID = zWorkorder.customerID || "";
      msg.id = crypto.randomUUID();
      msg.type = "outgoing";
      msg.senderUserObj = useLoginStore.getState().currentUser || "";
      smsService.send(msg).then((result) => {
        if (result.success) {
          let senderUser = useLoginStore.getState().currentUser;
          let allWOs = useOpenWorkordersStore.getState().workorders;
          allWOs.filter((wo) => wo.customerID === zWorkorder.customerID).forEach((wo) => {
            useOpenWorkordersStore.getState().setField("lastSMSSenderUserID", senderUser?.id || "", wo.id);
          });
        }
      });
    }

    if (sendEmail) {
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
  }

  async function handleFilesSelected(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    _setUploading(true);
    _setUploadMsg(`Uploading ${files.length} file(s)...`);

    let newMedia = [...zMedia];

    for (let i = 0; i < files.length; i++) {
      _setUploadMsg(`Uploading ${i + 1} of ${files.length}...`);
      const result = await dbUploadWorkorderMedia(workorderID, files[i]);
      if (result.success) {
        newMedia.push(result.mediaItem);
      } else {
        log("Media upload failed:", result.error);
      }
    }

    useOpenWorkordersStore
      .getState()
      .setField("media", newMedia, workorderID);

    _setUploading(false);
    _setUploadMsg("");
    // Reset file input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const [sDeleting, _setDeleting] = useState(false);

  function handleDeleteSelected() {
    const selectedItems = zMedia.filter((m) => sSelectedIds.has(m.id));
    if (!selectedItems.length) return;

    // Update local store immediately and close
    const remaining = zMedia.filter((m) => !sSelectedIds.has(m.id));
    useOpenWorkordersStore.getState().setField("media", remaining, workorderID);
    onClose();

    // Fire off storage deletes in background
    for (let i = 0; i < selectedItems.length; i++) {
      dbDeleteWorkorderMedia(selectedItems[i]);
    }
  }

  function handleDeleteMedia(mediaItem) {
    useAlertScreenStore.getState().setValues({
      title: "Delete Media",
      message: `Delete "${mediaItem.filename}"?`,
      btn1Text: "Delete",
      btn2Text: "Cancel",
      handleBtn1Press: async () => {
        useAlertScreenStore.getState().setValues({ showAlert: false });
        await dbDeleteWorkorderMedia(mediaItem);
        const updated = zMedia.filter((m) => m.id !== mediaItem.id);
        useOpenWorkordersStore
          .getState()
          .setField("media", updated, workorderID);
        if (sFullView?.id === mediaItem.id) _setFullView(null);
      },
      handleBtn2Press: () => {
        useAlertScreenStore.getState().setValues({ showAlert: false });
      },
    });
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
            borderBottomColor: gray(0.9),
          }}
        >
          <Text
            style={{
              fontSize: 18,
              fontWeight: "600",
              color: C.text,
            }}
          >
            {mode === "upload" ? "Upload Media" : "Workorder Media"}
          </Text>
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

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16 }}
        >
          {/* Upload area (shown in upload mode) */}
          {mode === "upload" && (
            <View style={{ marginBottom: 16 }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                {...(isMobile ? { capture: "environment" } : {})}
                onChange={handleFilesSelected}
                style={{ display: "none" }}
              />
              <Button_
                text={sUploading ? sUploadMsg : "Select Files"}
                icon={ICONS.camera}
                iconSize={20}
                colorGradientArr={COLOR_GRADIENTS.green}
                onPress={() => !sUploading && fileInputRef.current?.click()}
                buttonStyle={{
                  paddingVertical: 14,
                  borderRadius: 5,
                  opacity: sUploading ? 0.6 : 1,
                }}
                textStyle={{ fontSize: 16, fontWeight: "500" }}
              />
              {sUploading && (
                <Text
                  style={{
                    color: C.lightText,
                    fontSize: 13,
                    marginTop: 6,
                    textAlign: "center",
                  }}
                >
                  {sUploadMsg}
                </Text>
              )}
            </View>
          )}

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
                            ? "Text + Email"
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

        {/* Footer — Send / Delete Media buttons */}
        {zMedia.length > 0 && (selectedCount > 0 || (hasCell || hasEmail)) && (
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingHorizontal: 12,
              paddingBottom: 12,
              paddingTop: 4,
              borderTopWidth: 1,
              borderTopColor: gray(0.9),
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              {selectedCount > 0 && (
                <Text style={{ color: C.lightText, fontSize: 13 }}>
                  {selectedCount} selected
                </Text>
              )}
              {hasCell && (
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
            {(hasCell || hasEmail) && (
              <Button_
                text={sSending ? "Sending..." : "Send Media"}
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
            )}
            </View>
          </View>
        )}
      </div>
    </div>,
    document.body
  );
};
