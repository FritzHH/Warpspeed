/* eslint-disable */
import React, { useEffect, useState, useRef } from "react";
import { View, Text, ScrollView, Image, TouchableOpacity } from "react-native-web";
import { useParams, useNavigate } from "react-router-dom";
import {
  useOpenWorkordersStore,
  useSettingsStore,
} from "../../stores";
import { TextInput_, DropdownMenu, Image_, Button_ } from "../../components";
import { C, COLOR_GRADIENTS, ICONS } from "../../styles";
import { COLORS } from "../../data";
import {
  capitalizeFirstLetterOfString,
  formatPhoneWithDashes,
  formatMillisForDisplay,
  resolveStatus,
  formatCurrencyDisp,
  gray,
  log,
} from "../../utils";
import {
  dbUploadWorkorderMedia,
  dbListenToSingleWorkorder,
} from "../../db_calls_wrapper";
import { WorkorderMediaModal } from "../screen_components/modal_screens/WorkorderMediaModal";
import { cloneDeep } from "lodash";

export function MobileWorkorderDetailScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const zWorkorder = useOpenWorkordersStore((state) =>
    state.workorders.find((o) => o.id === id) || null
  );
  const zSettings = useSettingsStore((state) => state.settings);

  const [sShowMediaModal, _setShowMediaModal] = useState(null);
  const [sUploading, _setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Listen to this specific workorder for real-time updates
  useEffect(() => {
    if (!id) return;
    const unsubscribe = dbListenToSingleWorkorder(id, (data) => {
      if (data) {
        useOpenWorkordersStore.getState().setWorkorder(data, false);
      }
    });
    return () => { if (unsubscribe) unsubscribe(); };
  }, [id]);

  if (!zWorkorder) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Text style={{ color: C.lightText, fontSize: 16 }}>
          Workorder not found
        </Text>
      </View>
    );
  }

  function setBikeColor(incomingColorVal, fieldName) {
    let foundColor = false;
    let newColorObj = {};
    COLORS.forEach((bikeColorObj) => {
      if (bikeColorObj.label.toLowerCase() === incomingColorVal.toLowerCase()) {
        foundColor = true;
        newColorObj = cloneDeep(bikeColorObj);
      }
    });
    if (!foundColor) {
      newColorObj.label = incomingColorVal;
      newColorObj.backgroundColor = null;
      newColorObj.textColor = null;
    }
    useOpenWorkordersStore
      .getState()
      .setField(fieldName, newColorObj, zWorkorder.id);
  }

  function setField(fieldName, value) {
    useOpenWorkordersStore
      .getState()
      .setField(fieldName, value, zWorkorder.id);
  }

  const FIELD_STYLE = {
    borderWidth: 1,
    borderColor: C.buttonLightGreenOutline,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: C.text,
    backgroundColor: C.listItemWhite,
    outlineWidth: 0,
  };

  const LABEL_STYLE = {
    fontSize: 13,
    color: C.lightText,
    marginBottom: 4,
    marginLeft: 2,
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.backgroundWhite }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
    >
      {/* Customer Info Header */}
      <View
        style={{
          backgroundColor: C.buttonLightGreen,
          borderColor: C.buttonLightGreenOutline,
          borderWidth: 1,
          borderRadius: 10,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <Text
          style={{
            fontSize: 20,
            fontWeight: "600",
            color: C.text,
          }}
        >
          {capitalizeFirstLetterOfString(zWorkorder.customerFirst) +
            " " +
            capitalizeFirstLetterOfString(zWorkorder.customerLast)}
        </Text>
        {!!zWorkorder.customerCell && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginTop: 8,
            }}
          >
            <Image_
              icon={ICONS.cellPhone}
              size={18}
              style={{ marginRight: 6 }}
            />
            <Text style={{ color: C.text, fontSize: 14 }}>
              {formatPhoneWithDashes(zWorkorder.customerCell)}
            </Text>
          </View>
        )}
        <Text
          style={{
            color: C.lightText,
            fontSize: 13,
            marginTop: 4,
          }}
        >
          Opened: {formatMillisForDisplay(zWorkorder.startedOnMillis)}
        </Text>
      </View>

      {/* Photos & Videos Section — PRIORITY: at top */}
      <View
        style={{
          backgroundColor: C.backgroundListWhite,
          borderWidth: 1,
          borderColor: gray(0.9),
          borderRadius: 10,
          padding: 14,
          marginBottom: 16,
        }}
      >
        <Text
          style={{
            fontSize: 14,
            fontWeight: "600",
            color: C.text,
            marginBottom: 10,
          }}
        >
          Photos & Videos
          {zWorkorder.media?.length > 0
            ? ` (${zWorkorder.media.length})`
            : ""}
        </Text>

        {/* Thumbnail preview grid */}
        {zWorkorder.media?.length > 0 && (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 6,
              marginBottom: 12,
            }}
          >
            {zWorkorder.media.slice(0, 6).map((item) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => _setShowMediaModal("view")}
                style={{
                  width: "31%",
                  aspectRatio: 1,
                  borderRadius: 6,
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
                    <Text style={{ color: "white", fontSize: 24 }}>▶</Text>
                  </View>
                ) : (
                  <Image
                    source={{ uri: item.url }}
                    style={{ width: "100%", height: "100%" }}
                    resizeMode="cover"
                  />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Hidden file input for camera capture */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          capture="environment"
          multiple
          onChange={async (e) => {
            const files = Array.from(e.target.files);
            if (!files.length) return;
            _setUploading(true);
            let newMedia = [...(zWorkorder.media || [])];
            for (let i = 0; i < files.length; i++) {
              const result = await dbUploadWorkorderMedia(zWorkorder.id, files[i]);
              if (result.success) {
                newMedia.push(result.mediaItem);
              } else {
                log("Media upload failed:", result.error);
              }
            }
            useOpenWorkordersStore
              .getState()
              .setField("media", newMedia, zWorkorder.id);
            _setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
          style={{ display: "none" }}
        />

        <Button_
          text={sUploading ? "Uploading..." : "Take Photo / Video"}
          icon={ICONS.camera}
          iconSize={20}
          colorGradientArr={COLOR_GRADIENTS.green}
          onPress={() => !sUploading && fileInputRef.current?.click()}
          buttonStyle={{
            paddingVertical: 14,
            borderRadius: 8,
            marginBottom: 8,
            opacity: sUploading ? 0.6 : 1,
          }}
          textStyle={{ fontSize: 16, fontWeight: "500" }}
        />
        {zWorkorder.media?.length > 0 && (
          <Button_
            text={`View All Media (${zWorkorder.media.length})`}
            icon={ICONS.eyeballs}
            iconSize={18}
            colorGradientArr={COLOR_GRADIENTS.blue}
            onPress={() => _setShowMediaModal("view")}
            buttonStyle={{
              paddingVertical: 12,
              borderRadius: 8,
            }}
            textStyle={{ fontSize: 15, fontWeight: "500" }}
          />
        )}
      </View>

      {/* Navigation Buttons — Items + Messages */}
      <View style={{ flexDirection: "row", marginBottom: 16 }}>
        <TouchableOpacity
          onPress={() => navigate(`/workorder/${id}/items`)}
          style={{
            flex: 1,
            backgroundColor: C.buttonLightGreen,
            borderColor: C.buttonLightGreenOutline,
            borderWidth: 1,
            borderRadius: 10,
            paddingVertical: 14,
            alignItems: "center",
            marginRight: 8,
          }}
        >
          <Image_ icon={ICONS.shoppingCart} size={22} />
          <Text
            style={{
              color: C.text,
              fontSize: 14,
              fontWeight: "500",
              marginTop: 4,
            }}
          >
            Items ({zWorkorder.workorderLines?.length || 0})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigate(`/workorder/${id}/messages`)}
          style={{
            flex: 1,
            backgroundColor: C.buttonLightGreen,
            borderColor: C.buttonLightGreenOutline,
            borderWidth: 1,
            borderRadius: 10,
            paddingVertical: 14,
            alignItems: "center",
          }}
        >
          <Image_ icon={ICONS.cellPhone} size={22} />
          <Text
            style={{
              color: C.text,
              fontSize: 14,
              fontWeight: "500",
              marginTop: 4,
            }}
          >
            Messages
          </Text>
        </TouchableOpacity>
      </View>

      {/* Status */}
      {(() => {
        const rs = resolveStatus(zWorkorder?.status, zSettings?.statuses);
        return (
          <View style={{ marginBottom: 16 }}>
            <Text style={LABEL_STYLE}>Status</Text>
            <DropdownMenu
              dataArr={zSettings?.statuses || []}
              onSelect={(val) => setField("status", val.id)}
              buttonStyle={{
                width: "100%",
                backgroundColor: rs.backgroundColor,
                paddingVertical: 14,
                borderRadius: 8,
              }}
              buttonTextStyle={{
                color: rs.textColor,
                fontWeight: "500",
                fontSize: 16,
              }}
              buttonText={rs.label || "Select Status"}
            />
          </View>
        );
      })()}

      {/* Bike Info Section */}
      <View
        style={{
          backgroundColor: C.backgroundListWhite,
          borderWidth: 1,
          borderColor: gray(0.9),
          borderRadius: 10,
          padding: 14,
          marginBottom: 16,
        }}
      >
        {/* Brand */}
        <Text style={LABEL_STYLE}>Brand</Text>
        <TextInput_
          placeholder="Brand"
          style={{
            ...FIELD_STYLE,
            fontWeight: zWorkorder.brand ? "500" : "400",
            marginBottom: 8,
          }}
          value={zWorkorder.brand || ""}
          onChangeText={(val) => setField("brand", val)}
        />
        <View
          style={{
            flexDirection: "row",
            marginBottom: 12,
          }}
        >
          <View style={{ flex: 1, marginRight: 4 }}>
            <DropdownMenu
              dataArr={zSettings?.bikeBrands || []}
              onSelect={(item) => setField("brand", item)}
              buttonText={zSettings?.bikeBrandsName || "Bikes"}
            />
          </View>
          <View style={{ flex: 1, marginLeft: 4 }}>
            <DropdownMenu
              dataArr={zSettings?.bikeOptionalBrands || []}
              onSelect={(item) => setField("brand", item)}
              buttonText={zSettings?.bikeOptionalBrandsName || "E-bikes"}
            />
          </View>
        </View>

        {/* Model/Description */}
        <Text style={LABEL_STYLE}>Model / Description</Text>
        <TextInput_
          placeholder="Model/Description"
          style={{
            ...FIELD_STYLE,
            fontWeight: zWorkorder.description ? "500" : "400",
            marginBottom: 8,
          }}
          value={zWorkorder.description || ""}
          onChangeText={(val) => setField("description", val)}
        />
        <View style={{ marginBottom: 12 }}>
          <DropdownMenu
            dataArr={zSettings?.bikeDescriptions || []}
            onSelect={(item) => setField("description", item)}
            buttonText="Descriptions"
          />
        </View>

        {/* Colors */}
        <View style={{ flexDirection: "row", marginBottom: 12 }}>
          <View style={{ flex: 1, marginRight: 4 }}>
            <Text style={LABEL_STYLE}>Color 1</Text>
            <TextInput_
              placeholder="Color 1"
              value={zWorkorder.color1?.label || ""}
              style={{
                ...FIELD_STYLE,
                backgroundColor:
                  zWorkorder.color1?.backgroundColor || C.listItemWhite,
                color: zWorkorder.color1?.textColor || C.text,
                fontWeight: zWorkorder.color1?.label ? "500" : "400",
              }}
              onChangeText={(val) => setBikeColor(val, "color1")}
            />
          </View>
          <View style={{ flex: 1, marginLeft: 4 }}>
            <Text style={LABEL_STYLE}>Color 2</Text>
            <TextInput_
              placeholder="Color 2"
              value={zWorkorder.color2?.label || ""}
              style={{
                ...FIELD_STYLE,
                backgroundColor:
                  zWorkorder.color2?.backgroundColor || C.listItemWhite,
                color: zWorkorder.color2?.textColor || C.text,
                fontWeight: zWorkorder.color2?.label ? "500" : "400",
              }}
              onChangeText={(val) => setBikeColor(val, "color2")}
            />
          </View>
        </View>

        {/* Wait Time */}
        <Text style={LABEL_STYLE}>Estimated Wait</Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <View style={{ flex: 1, marginRight: 4 }}>
            <View
              style={{
                ...FIELD_STYLE,
                paddingVertical: 14,
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  color: zWorkorder.waitTime?.label ? C.text : C.lightText,
                }}
              >
                {zWorkorder.waitTime?.label || "Not set"}
              </Text>
            </View>
          </View>
          <View style={{ flex: 1, marginLeft: 4 }}>
            <DropdownMenu
              dataArr={zSettings?.waitTimes || []}
              onSelect={(item) => setField("waitTime", item)}
              buttonText="Wait Times"
            />
          </View>
        </View>
      </View>

      {/* Part Info Section */}
      <View
        style={{
          backgroundColor: C.backgroundListWhite,
          borderWidth: 1,
          borderColor: gray(0.9),
          borderRadius: 10,
          padding: 14,
          marginBottom: 16,
        }}
      >
        <Text style={LABEL_STYLE}>Part Ordered</Text>
        <TextInput_
          placeholder="Part Ordered"
          style={{
            ...FIELD_STYLE,
            fontWeight: zWorkorder.partOrdered ? "500" : "400",
            marginBottom: 12,
          }}
          value={zWorkorder.partOrdered || ""}
          onChangeText={(val) => setField("partOrdered", val)}
        />

        <Text style={LABEL_STYLE}>Part Source</Text>
        <TextInput_
          placeholder="Part Source"
          style={{
            ...FIELD_STYLE,
            fontWeight: zWorkorder.partSource ? "500" : "400",
            marginBottom: 8,
          }}
          value={zWorkorder.partSource || ""}
          onChangeText={(val) => setField("partSource", val)}
        />
        <DropdownMenu
          dataArr={zSettings?.partSources || []}
          onSelect={(item) => setField("partSource", item)}
          buttonText="Part Sources"
        />
      </View>

      {/* Workorder Items Section — tap to edit */}
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => navigate(`/workorder/${id}/items`)}
        style={{
          backgroundColor: C.backgroundListWhite,
          borderWidth: 1,
          borderColor: gray(0.9),
          borderRadius: 10,
          padding: 14,
          marginBottom: 16,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: zWorkorder.workorderLines?.length > 0 ? 10 : 0,
          }}
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: "600",
              color: C.text,
            }}
          >
            Items ({zWorkorder.workorderLines?.length || 0})
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: C.blue,
              fontWeight: "500",
            }}
          >
            Tap to edit
          </Text>
        </View>
        {zWorkorder.workorderLines?.map((line, idx) => {
          const item = line.inventoryItem;
          const unitPrice = line.useSalePrice
            ? item?.salePrice
            : item?.price;
          const lineTotal = line.discountObj?.newPrice
            ? line.discountObj.newPrice
            : (unitPrice || 0) * (line.qty || 1);
          return (
            <View
              key={line.id || idx}
              style={{
                paddingVertical: 10,
                borderTopWidth: idx > 0 ? 1 : 0,
                borderTopColor: gray(0.9),
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "500",
                      color: C.text,
                    }}
                    numberOfLines={2}
                  >
                    {item?.formalName || "Unknown Item"}
                  </Text>
                  {line.qty > 1 && (
                    <Text
                      style={{
                        fontSize: 13,
                        color: C.lightText,
                        marginTop: 2,
                      }}
                    >
                      Qty: {line.qty} x ${formatCurrencyDisp(unitPrice)}
                    </Text>
                  )}
                  {!!line.discountObj?.name && (
                    <Text
                      style={{
                        fontSize: 13,
                        color: C.lightred,
                        marginTop: 2,
                      }}
                    >
                      {line.discountObj.name}
                      {line.discountObj.savings
                        ? " (-$" + formatCurrencyDisp(line.discountObj.savings) + ")"
                        : ""}
                    </Text>
                  )}
                </View>
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "500",
                    color: C.text,
                  }}
                >
                  ${formatCurrencyDisp(lineTotal)}
                </Text>
              </View>
              {!!line.intakeNotes && (
                <Text
                  style={{
                    fontSize: 13,
                    color: "orange",
                    marginTop: 4,
                  }}
                >
                  {line.intakeNotes}
                </Text>
              )}
              {!!line.receiptNotes && (
                <Text
                  style={{
                    fontSize: 13,
                    color: C.green,
                    marginTop: 2,
                  }}
                >
                  {line.receiptNotes}
                </Text>
              )}
            </View>
          );
        })}
      </TouchableOpacity>

      {/* Media Modal */}
      {sShowMediaModal && (
        <WorkorderMediaModal
          visible={!!sShowMediaModal}
          onClose={() => _setShowMediaModal(null)}
          workorderID={zWorkorder.id}
          mode={sShowMediaModal}
        />
      )}

      {/* Bottom spacer */}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}
