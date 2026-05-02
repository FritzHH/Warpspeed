/* eslint-disable */
import React, { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { View, Text, ScrollView, TouchableOpacity } from "react-native-web";
import { C, COLOR_GRADIENTS } from "../../../styles";
import { Button_ } from "../../../components";
import { ColorWheel } from "../../../ColorWheel";
import { bestForegroundHex, gray } from "../../../utils";

export const ColorPickerModal = ({
  onClose,
  onSave,
  title,
  previewText,
  initialBgColor,
  initialTextColor,
  saveButtonText,
  exitButtonText,
  anchorPosition,
  colorSchemes,
}) => {
  const [sBgColor, _setBgColor] = useState(initialBgColor || "#ffffff");
  const [sTextColor, _setTextColor] = useState(initialTextColor || "#000000");
  const [sLayout, _setLayout] = useState(null);

  let hasSchemes = colorSchemes && colorSchemes.length > 0;
  let modalMaxWidth = hasSchemes ? 900 : 650;

  const measureRef = useCallback((node) => {
    if (!node) return;
    let rect = node.getBoundingClientRect();
    let top = anchorPosition?.y ?? 100;
    let left = (window.innerWidth - rect.width) / 2;
    if (top + rect.height > window.innerHeight - 10) {
      top = Math.max(10, window.innerHeight - rect.height - 10);
    }
    if (top < 10) top = 10;
    if (left + rect.width > window.innerWidth - 10) {
      left = Math.max(10, window.innerWidth - rect.width - 10);
    }
    if (left < 10) left = 10;
    _setLayout({ top, left });
  }, []);

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
        zIndex: 9999,
      }}
    >
      <div
        ref={measureRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          top: sLayout?.top ?? (anchorPosition?.y ?? 100),
          left: sLayout?.left ?? Math.max(10, (window.innerWidth - modalMaxWidth) / 2),
          opacity: sLayout ? 1 : 0,
        }}
      >
        <View
          style={{
            backgroundColor: C.backgroundListWhite,
            borderRadius: 10,
            padding: 30,
            maxWidth: modalMaxWidth,
            borderWidth: 2,
            borderColor: C.buttonLightGreenOutline,
            flexDirection: hasSchemes ? "row" : "column",
            alignItems: hasSchemes ? "stretch" : "center",
          }}
        >
          {/* Color schemes sidebar */}
          {hasSchemes && (<>
            <View
              style={{
                width: 200,
                marginRight: 0,
                paddingRight: 15,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: gray(0.45), marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Existing Schemes
              </Text>
              <ScrollView style={{ flex: 1, maxHeight: 460 }}>
                {colorSchemes.map((scheme, idx) => (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => {
                      _setBgColor(scheme.backgroundColor);
                      _setTextColor(scheme.textColor);
                    }}
                    style={{
                      backgroundColor: scheme.backgroundColor,
                      borderRadius: 6,
                      paddingVertical: 8,
                      paddingHorizontal: 10,
                      marginBottom: 6,
                      borderWidth: 1,
                      borderColor: gray(0.15),
                    }}
                  >
                    <Text
                      style={{
                        color: scheme.textColor,
                        fontSize: 12,
                        fontWeight: "500",
                      }}
                      numberOfLines={2}
                    >
                      {scheme.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <View style={{ width: 1, backgroundColor: gray(0.15), marginHorizontal: 15 }} />
          </>)}

          {/* Main color picker area */}
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: C.text, marginBottom: 20 }}>
              {title || "Edit Colors"}
            </Text>

            <View
              style={{
                backgroundColor: sBgColor,
                borderRadius: 5,
                paddingVertical: 10,
                paddingHorizontal: 30,
                alignItems: "center",
                justifyContent: "center",
                minWidth: 200,
                marginBottom: 25,
              }}
            >
              <Text style={{ color: sTextColor, fontSize: 14, fontWeight: "500" }}>
                {previewText || "Preview"}
              </Text>
            </View>

            <View style={{ flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: 30 }}>
              <View style={{ alignItems: "center" }}>
                <Text style={{ fontSize: 13, color: C.text, marginBottom: 8, fontWeight: "500" }}>
                  Background Color
                </Text>
                <ColorWheel
                  key="bg"
                  initialColor={sBgColor}
                  onColorChange={(val) => {
                    _setBgColor(val.hex);
                    _setTextColor(bestForegroundHex(val.hex));
                  }}
                />
              </View>
              <View style={{ alignItems: "center" }}>
                <Text style={{ fontSize: 13, color: C.text, marginBottom: 8, fontWeight: "500" }}>
                  Text Color
                </Text>
                <ColorWheel
                  key="text"
                  initialColor={sTextColor}
                  onColorChange={(val) => {
                    _setTextColor(val.hex);
                  }}
                />
              </View>
            </View>

            <View style={{ flexDirection: "row", justifyContent: "center", marginTop: 25, gap: 15 }}>
              <Button_
                text={saveButtonText || "Save Changes"}
                colorGradientArr={COLOR_GRADIENTS.green}
                onPress={() => {
                  onSave(sBgColor, sTextColor);
                  onClose();
                }}
              />
              <Button_
                text={exitButtonText || "Exit (discard any changes)"}
                colorGradientArr={COLOR_GRADIENTS.grey}
                onPress={onClose}
              />
            </View>
          </View>
        </View>
      </div>
    </div>,
    document.body
  );
};
