/* eslint-disable */
import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  useOpenWorkordersStore,
  useSettingsStore,
} from "../../stores";
import { TextInput, DropdownMenu, Image, Button } from "../../dom_components";
import { C, COLOR_GRADIENTS, ICONS, Radius } from "../../styles";
import { COLORS } from "../../data";
import { capitalizeFirstLetterOfString, formatPhoneWithDashes, formatMillisForDisplay, resolveStatus, formatCurrencyDisp, log, scheduleAutoText } from "../../utils";
import {
  dbUploadWorkorderMedia,
  dbListenToSingleWorkorder,
} from "../../db_calls_wrapper";
import { WorkorderMediaModal } from "../screen_components/modal_screens/WorkorderMediaModal";
import cloneDeep from "lodash/cloneDeep";
import styles from "./MobileWorkorderDetailScreen.module.css";

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
      <div className={styles.notFound}>
        <span className={styles.notFoundText} style={{ color: C.lightText }}>
          Workorder not found
        </span>
      </div>
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
    borderRadius: Radius.row,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: C.text,
    backgroundColor: C.listItemWhite,
    outlineWidth: 0,
  };

  return (
    <div className={styles.scroll} style={{ backgroundColor: C.backgroundWhite }}>
      {/* Customer Info Header */}
      <div
        className={styles.customerCard}
        style={{
          backgroundColor: C.buttonLightGreen,
          borderColor: C.buttonLightGreenOutline,
        }}
      >
        <span className={styles.customerName} style={{ color: C.text }}>
          {capitalizeFirstLetterOfString(zWorkorder.customerFirst) +
            " " +
            capitalizeFirstLetterOfString(zWorkorder.customerLast)}
        </span>
        {!!zWorkorder.customerCell && (
          <div className={styles.customerCellRow}>
            <Image icon={ICONS.cellPhone} size={18} style={{ marginRight: 6 }} />
            <span className={styles.customerCellText} style={{ color: C.text }}>
              {formatPhoneWithDashes(zWorkorder.customerCell)}
            </span>
          </div>
        )}
        <span className={styles.customerOpened} style={{ color: C.lightText }}>
          Opened: {formatMillisForDisplay(zWorkorder.startedOnMillis)}
        </span>
      </div>

      {/* Photos & Videos Section */}
      <div
        className={styles.section}
        style={{ backgroundColor: C.backgroundListWhite, borderColor: C.borderStrong }}
      >
        <span className={styles.sectionTitle} style={{ color: C.text }}>
          Photos & Videos
          {zWorkorder.media?.length > 0 ? ` (${zWorkorder.media.length})` : ""}
        </span>

        {zWorkorder.media?.length > 0 && (
          <div className={styles.thumbGrid}>
            {zWorkorder.media.slice(0, 6).map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => _setShowMediaModal("view")}
                className={styles.thumb}
                style={{ borderColor: C.borderStrong, backgroundColor: C.surfaceAlt }}
              >
                {item.type === "video" ? (
                  <div className={styles.thumbVideo} style={{ backgroundColor: C.surfaceAlt }}>
                    <span className={styles.thumbVideoPlay}>▶</span>
                  </div>
                ) : (
                  <img
                    src={item.url}
                    alt=""
                    className={styles.thumbImg}
                  />
                )}
              </button>
            ))}
          </div>
        )}

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
          className={styles.hiddenFileInput}
        />

        <Button
          text={sUploading ? "Uploading..." : "Take Photo / Video"}
          icon={ICONS.camera}
          iconSize={20}
          colorGradientArr={COLOR_GRADIENTS.green}
          onPress={() => !sUploading && fileInputRef.current?.click()}
          buttonStyle={{
            paddingVertical: 14,
            borderRadius: Radius.control,
            marginBottom: 8,
            opacity: sUploading ? 0.6 : 1,
          }}
          textStyle={{ fontSize: 16, fontWeight: "500" }}
        />
        {zWorkorder.media?.length > 0 && (
          <Button
            text={`View All Media (${zWorkorder.media.length})`}
            icon={ICONS.eyeballs}
            iconSize={18}
            colorGradientArr={COLOR_GRADIENTS.blue}
            onPress={() => _setShowMediaModal("view")}
            buttonStyle={{ paddingVertical: 12, borderRadius: Radius.control }}
            textStyle={{ fontSize: 15, fontWeight: "500" }}
          />
        )}
      </div>

      {/* Navigation Buttons — Items + Messages */}
      <div className={styles.navRow}>
        <button
          type="button"
          onClick={() => navigate(`/workorder/${id}/items`)}
          className={`${styles.navBtn} ${styles.navBtnFirst}`}
          style={{
            backgroundColor: C.buttonLightGreen,
            borderColor: C.buttonLightGreenOutline,
          }}
        >
          <Image icon={ICONS.shoppingCart} size={22} />
          <span className={styles.navBtnLabel} style={{ color: C.text }}>
            Items ({zWorkorder.workorderLines?.length || 0})
          </span>
        </button>

        <button
          type="button"
          onClick={() => navigate(`/workorder/${id}/messages`)}
          className={styles.navBtn}
          style={{
            backgroundColor: C.buttonLightGreen,
            borderColor: C.buttonLightGreenOutline,
          }}
        >
          <Image icon={ICONS.cellPhone} size={22} />
          <span className={styles.navBtnLabel} style={{ color: C.text }}>
            Messages
          </span>
        </button>
      </div>

      {/* Status */}
      {(() => {
        const rs = resolveStatus(zWorkorder?.status, zSettings?.statuses);
        return (
          <div className={styles.statusBlock}>
            <span className={styles.label} style={{ color: C.lightText }}>Status</span>
            <DropdownMenu
              dataArr={zSettings?.statuses || []}
              onSelect={(val) => {
                setField("status", val.id);
                const autoTextRules = zSettings?.statusAutoText || [];
                const rule = autoTextRules.find((r) => r.statusID === val.id);
                if (rule) {
                  const wo = useOpenWorkordersStore.getState().getWorkorders().find((w) => w.id === zWorkorder.id) || zWorkorder;
                  scheduleAutoText(rule, wo, zSettings);
                }
              }}
              buttonStyle={{
                width: "100%",
                backgroundColor: rs.backgroundColor,
                paddingVertical: 14,
                borderRadius: Radius.control,
              }}
              buttonTextStyle={{
                color: rs.textColor,
                fontWeight: "500",
                fontSize: 16,
              }}
              buttonText={rs.label || "Select Status"}
            />
          </div>
        );
      })()}

      {/* Bike Info Section */}
      <div
        className={styles.section}
        style={{ backgroundColor: C.backgroundListWhite, borderColor: C.borderStrong }}
      >
        <span className={styles.label} style={{ color: C.lightText }}>Brand</span>
        <TextInput
          placeholder="Brand"
          style={{
            ...FIELD_STYLE,
            fontWeight: zWorkorder.brand ? "500" : "400",
            marginBottom: 8,
          }}
          value={zWorkorder.brand || ""}
          onChangeText={(val) => setField("brand", val)}
        />
        <div className={styles.row}>
          <div className={styles.colLeft}>
            <DropdownMenu
              dataArr={zSettings?.bikeBrands || []}
              onSelect={(item) => setField("brand", item)}
              buttonText={zSettings?.bikeBrandsName || "Bikes"}
            />
          </div>
          <div className={styles.colRight}>
            <DropdownMenu
              dataArr={zSettings?.bikeOptionalBrands || []}
              onSelect={(item) => setField("brand", item)}
              buttonText={zSettings?.bikeOptionalBrandsName || "E-bikes"}
            />
          </div>
        </div>

        <span className={styles.label} style={{ color: C.lightText }}>Model / Description</span>
        <TextInput
          placeholder="Model/Description"
          style={{
            ...FIELD_STYLE,
            fontWeight: zWorkorder.description ? "500" : "400",
            marginBottom: 8,
          }}
          value={zWorkorder.description || ""}
          onChangeText={(val) => setField("description", val)}
        />
        <div className={styles.singleDropdownWrap}>
          <DropdownMenu
            dataArr={zSettings?.bikeDescriptions || []}
            onSelect={(item) => setField("description", item)}
            buttonText="Descriptions"
          />
        </div>

        <div className={styles.row}>
          <div className={styles.colLeft}>
            <span className={styles.label} style={{ color: C.lightText }}>Color 1</span>
            <TextInput
              placeholder="Color 1"
              value={zWorkorder.color1?.label || ""}
              style={{
                ...FIELD_STYLE,
                backgroundColor: zWorkorder.color1?.backgroundColor || C.listItemWhite,
                color: zWorkorder.color1?.textColor || C.text,
                fontWeight: zWorkorder.color1?.label ? "500" : "400",
              }}
              onChangeText={(val) => setBikeColor(val, "color1")}
            />
          </div>
          <div className={styles.colRight}>
            <span className={styles.label} style={{ color: C.lightText }}>Color 2</span>
            <TextInput
              placeholder="Color 2"
              value={zWorkorder.color2?.label || ""}
              style={{
                ...FIELD_STYLE,
                backgroundColor: zWorkorder.color2?.backgroundColor || C.listItemWhite,
                color: zWorkorder.color2?.textColor || C.text,
                fontWeight: zWorkorder.color2?.label ? "500" : "400",
              }}
              onChangeText={(val) => setBikeColor(val, "color2")}
            />
          </div>
        </div>

        <span className={styles.label} style={{ color: C.lightText }}>Estimated Wait</span>
        <div className={styles.waitRow}>
          <div className={styles.colLeft}>
            <div
              className={styles.waitDisplay}
              style={{
                borderColor: C.buttonLightGreenOutline,
                backgroundColor: C.listItemWhite,
              }}
            >
              <span
                className={styles.waitDisplayText}
                style={{ color: zWorkorder.waitTime?.label ? C.text : C.lightText }}
              >
                {zWorkorder.waitTime?.label || "Not set"}
              </span>
            </div>
          </div>
          <div className={styles.colRight}>
            <DropdownMenu
              dataArr={zSettings?.waitTimes || []}
              onSelect={(item) => setField("waitTime", item)}
              buttonText="Wait Times"
            />
          </div>
        </div>
      </div>

      {/* Part Info Section */}
      <div
        className={styles.section}
        style={{ backgroundColor: C.backgroundListWhite, borderColor: C.borderStrong }}
      >
        <span className={styles.label} style={{ color: C.lightText }}>Part Ordered</span>
        <TextInput
          placeholder="Part Ordered"
          style={{
            ...FIELD_STYLE,
            fontWeight: zWorkorder.partOrdered ? "500" : "400",
            marginBottom: 12,
          }}
          value={zWorkorder.partOrdered || ""}
          onChangeText={(val) => setField("partOrdered", val)}
        />

        <span className={styles.label} style={{ color: C.lightText }}>Part Source</span>
        <TextInput
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
      </div>

      {/* Workorder Items Section — tap to edit */}
      <button
        type="button"
        onClick={() => navigate(`/workorder/${id}/items`)}
        className={styles.itemsCard}
        style={{ backgroundColor: C.backgroundListWhite, borderColor: C.borderStrong }}
      >
        <div
          className={styles.itemsHeader}
          style={{ marginBottom: zWorkorder.workorderLines?.length > 0 ? 10 : 0 }}
        >
          <span className={styles.itemsHeaderTitle} style={{ color: C.text }}>
            Items ({zWorkorder.workorderLines?.length || 0})
          </span>
          <span className={styles.itemsTapToEdit} style={{ color: C.blue }}>
            Tap to edit
          </span>
        </div>
        {zWorkorder.workorderLines?.map((line, idx) => {
          const item = line.inventoryItem;
          const unitPrice = line.useSalePrice ? item?.salePrice : item?.price;
          const lineTotal = line.discountObj?.newPrice
            ? line.discountObj.newPrice
            : (unitPrice || 0) * (line.qty || 1);
          return (
            <div
              key={line.id || idx}
              className={styles.lineRow}
              style={{
                borderTop: idx > 0 ? `1px solid ${C.borderStrong}` : "none",
              }}
            >
              <div className={styles.lineMain}>
                <div className={styles.lineNameCol}>
                  <span className={styles.lineName} style={{ color: C.text }}>
                    {item?.catalogName || item?.formalName || "Unknown Item"}
                  </span>
                  {line.qty > 1 && (
                    <span className={styles.lineQty} style={{ color: C.lightText }}>
                      Qty: {line.qty} x ${formatCurrencyDisp(unitPrice)}
                    </span>
                  )}
                  {!!line.discountObj?.name && (
                    <span className={styles.lineDiscount} style={{ color: C.lightred }}>
                      {line.discountObj.name}
                      {line.discountObj.savings
                        ? " (-$" + formatCurrencyDisp(line.discountObj.savings) + ")"
                        : ""}
                    </span>
                  )}
                </div>
                <span className={styles.linePrice} style={{ color: C.text }}>
                  ${formatCurrencyDisp(lineTotal)}
                </span>
              </div>
              {!!line.intakeNotes && (
                <span className={styles.lineIntake} style={{ color: "orange" }}>
                  {line.intakeNotes}
                </span>
              )}
              {!!line.receiptNotes && (
                <span className={styles.lineReceipt} style={{ color: C.green }}>
                  {line.receiptNotes}
                </span>
              )}
            </div>
          );
        })}
      </button>

      {sShowMediaModal && (
        <WorkorderMediaModal
          visible={!!sShowMediaModal}
          onClose={() => _setShowMediaModal(null)}
          workorderID={zWorkorder.id}
          mode={sShowMediaModal}
        />
      )}

      <div className={styles.bottomSpacer} />
    </div>
  );
}
