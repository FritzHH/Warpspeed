/* eslint-disable */
import React, { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { View, Text, Image, TouchableOpacity, ScrollView } from "react-native-web";
import { C, COLOR_GRADIENTS, ICONS } from "../../../styles";
import { Button_, Image_ } from "../../../components";
import { gray, generateRandomID, log } from "../../../utils";
import {
  useOpenWorkordersStore,
  useAlertScreenStore,
  useLayoutStore,
} from "../../../stores";
import {
  dbUploadWorkorderMedia,
  dbDeleteWorkorderMedia,
} from "../../../db_calls_wrapper";

export const WorkorderMediaModal = ({
  visible,
  onClose,
  workorderID,
  mode, // "upload" or "view"
}) => {
  const isMobile = useLayoutStore((s) => s.isMobile);
  const zMedia =
    useOpenWorkordersStore(
      (s) => s.workorders.find((w) => w.id === workorderID)?.media
    ) || [];

  const [sUploading, _setUploading] = useState(false);
  const [sUploadMsg, _setUploadMsg] = useState("");
  const [sFullView, _setFullView] = useState(null); // media item for full-size overlay
  const fileInputRef = useRef(null);

  if (!visible) return null;

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
              {zMedia.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => _setFullView(item)}
                  style={{
                    width: isMobile ? "31%" : 120,
                    height: isMobile ? 100 : 120,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: gray(0.85),
                    overflow: "hidden",
                    backgroundColor: gray(0.95),
                  }}
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
                      <Text
                        style={{
                          color: "white",
                          fontSize: 28,
                        }}
                      >
                        ▶
                      </Text>
                      <Text
                        style={{
                          color: "white",
                          fontSize: 10,
                          marginTop: 2,
                        }}
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
              ))}
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
      </div>
    </div>,
    document.body
  );
};
