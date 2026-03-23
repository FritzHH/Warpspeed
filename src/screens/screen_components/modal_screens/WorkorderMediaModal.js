/* eslint-disable */
import React, { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { View, Text, Image, TouchableOpacity, ScrollView } from "react-native-web";
import { C, COLOR_GRADIENTS, ICONS } from "../../../styles";
import { Button_, Image_, CheckBox_ } from "../../../components";
import { gray, generateRandomID, log } from "../../../utils";
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
  const fileInputRef = useRef(null);

  if (!visible) return null;

  const zWorkorder = useOpenWorkordersStore.getState().workorders.find((w) => w.id === workorderID) || {};
  const zSettings = useSettingsStore.getState().settings;
  const storeName = zSettings?.storeInfo?.displayName || "Our store";
  const hasCell = !!zWorkorder.customerPhone?.length;
  const hasEmail = !!zWorkorder.customerEmail?.length;

  function toggleSelection(itemId) {
    _setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  async function handleSendMedia() {
    const selectedItems = zMedia.filter((m) => sSelectedIds.has(m.id));
    if (!selectedItems.length) return;
    if (!hasCell && !hasEmail) return;

    _setSending(true);

    const hasImages = selectedItems.some((m) => m.type === "image");
    const hasVideos = selectedItems.some((m) => m.type === "video");
    let noun = hasImages && hasVideos
      ? "photo(s) and video(s)"
      : hasImages
        ? selectedItems.filter((m) => m.type === "image").length === 1 ? "photo" : "photos"
        : selectedItems.filter((m) => m.type === "video").length === 1 ? "video" : "videos";

    const links = selectedItems.map((m) => m.url).join("\n");
    const messageText = `${storeName} has sent you ${selectedItems.length} ${noun} for your viewing:\n\n${links}`;

    let smsSuccess = false;
    let emailSuccess = false;

    // Send SMS
    if (hasCell) {
      let msg = cloneDeep(SMS_PROTO);
      msg.message = messageText;
      msg.phoneNumber = zWorkorder.customerPhone;
      msg.firstName = zWorkorder.customerFirst || "";
      msg.lastName = zWorkorder.customerLast || "";
      msg.canRespond = new Date().getTime();
      msg.millis = new Date().getTime();
      msg.customerID = zWorkorder.customerID || "";
      msg.id = generateRandomID();
      msg.type = "outgoing";
      msg.senderUserObj = useLoginStore.getState().currentUser || "";

      let result = await smsService.send(msg);
      smsSuccess = result.success;
      if (smsSuccess) {
        // Flag all customer workorders so the sender's list prioritizes them
        let senderUser = useLoginStore.getState().currentUser;
        let allWOs = useOpenWorkordersStore.getState().workorders;
        allWOs.filter((wo) => wo.customerID === zWorkorder.customerID).forEach((wo) => {
          useOpenWorkordersStore.getState().setField("lastSMSSenderUserID", senderUser?.id || "", wo.id);
        });
      }
    }

    // Send Email
    if (hasEmail) {
      const linksHtml = selectedItems
        .map((m) => {
          const label = m.type === "video" ? "View Video" : "View Photo";
          return `<p><a href="${m.url}">${label}: ${m.filename}</a></p>`;
        })
        .join("");
      const htmlBody = `<p>${storeName} has sent you ${selectedItems.length} ${noun} for your viewing:</p>${linksHtml}`;
      const subject = `Media from ${storeName}`;

      let result = await dbSendEmail(zWorkorder.customerEmail, subject, htmlBody);
      emailSuccess = result.success;
    }

    // Update sentToCustomer metadata on each selected media item
    if (smsSuccess || emailSuccess) {
      const updatedMedia = zMedia.map((m) => {
        if (!sSelectedIds.has(m.id)) return m;
        return {
          ...m,
          sentToCustomer: {
            sms: smsSuccess || !!(m.sentToCustomer?.sms),
            email: emailSuccess || !!(m.sentToCustomer?.email),
            sentAt: Date.now(),
          },
        };
      });
      useOpenWorkordersStore
        .getState()
        .setField("media", updatedMedia, workorderID);
      _setSelectedIds(new Set());
    }

    _setSending(false);

    // Show result alert
    let resultParts = [];
    if (smsSuccess) resultParts.push("SMS");
    if (emailSuccess) resultParts.push("Email");
    let failParts = [];
    if (hasCell && !smsSuccess) failParts.push("SMS");
    if (hasEmail && !emailSuccess) failParts.push("Email");

    let alertMsg = "";
    if (resultParts.length) alertMsg += `Sent via ${resultParts.join(" & ")}.`;
    if (failParts.length) alertMsg += `${alertMsg ? " " : ""}Failed to send via ${failParts.join(" & ")}.`;

    useAlertScreenStore.getState().setValues({
      title: "Send Media",
      message: alertMsg,
      btn1Text: "OK",
      handleBtn1Press: () => {
        useAlertScreenStore.getState().setValues({ showAlert: false });
      },
    });
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
          <View
            style={{
              flexDirection: "row",
              marginTop: 16,
              gap: 12,
            }}
          >
            <Button_
              text="Close"
              colorGradientArr={COLOR_GRADIENTS.grey}
              onPress={() => _setFullView(null)}
              buttonStyle={{ paddingHorizontal: 24, paddingVertical: 10 }}
            />
            <Button_
              text="Delete"
              colorGradientArr={COLOR_GRADIENTS.red}
              icon={ICONS.trash}
              iconSize={16}
              onPress={() => handleDeleteMedia(sFullView)}
              buttonStyle={{ paddingHorizontal: 24, paddingVertical: 10 }}
            />
          </View>
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
                  borderRadius: 8,
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
                return (
                  <View
                    key={item.id}
                    style={{
                      width: isMobile ? "31%" : 120,
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
                          Sent
                        </Text>
                      </View>
                    )}
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

        {/* Footer — Send Media button */}
        {zMedia.length > 0 && (hasCell || hasEmail) && (
          <View
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
              alignItems: "center",
              padding: 12,
              borderTopWidth: 1,
              borderTopColor: gray(0.9),
              gap: 10,
            }}
          >
            {selectedCount > 0 && (
              <Text style={{ color: C.lightText, fontSize: 13 }}>
                {selectedCount} selected
              </Text>
            )}
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
                borderRadius: 8,
                opacity: selectedCount > 0 && !sSending ? 1 : 0.4,
              }}
              textStyle={{ fontSize: 14, fontWeight: "500" }}
            />
          </View>
        )}
      </div>
    </div>,
    document.body
  );
};
