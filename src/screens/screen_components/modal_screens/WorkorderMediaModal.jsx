/* eslint-disable */
import React, { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { C, COLOR_GRADIENTS, ICONS, Radius } from "../../../styles";
import { useZ } from "../../../hooks/useZ";
import { Button, Image, Tooltip, CheckBox, LargeModalHeader, LargeModalHeaderButton } from "../../../dom_components";
import { log, compressImage } from "../../../utils";
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
import { broadcastToDisplay, DISPLAY_MSG_TYPES } from "../../../broadcastChannel";
import styles from "./WorkorderMediaModal.module.css";

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
  const sUploadProgress = useUploadProgressStore((s) => s.progress);

  const [sUploading, _setUploading] = useState(false);
  const [sUploadMsg, _setUploadMsg] = useState("");
  const [sFullView, _setFullView] = useState(null); // media item for full-size overlay
  const [sSelectedIds, _setSelectedIds] = useState(new Set());
  const [sSending, _setSending] = useState(false);
  const [sSendEmail, _setSendEmail] = useState(false);
  const [sSendText, _setSendText] = useState(!!onSendMedia);
  const [sPendingFiles, _setPendingFiles] = useState(null);
  const [sCompressConfirm, _setCompressConfirm] = useState(true);
  const [sCastToDisplay, _setCastToDisplay] = useState(false);
  const fileInputRef = useRef(null);
  const [sDeleting, _setDeleting] = useState(false);
  const z = useZ("modal", visible);

  if (!visible) return null;

  const zWorkorder = useOpenWorkordersStore.getState().workorders.find((w) => w.id === workorderID) || {};
  const zSettings = useSettingsStore.getState().settings;
  const storeName = zSettings?.storeInfo?.displayName || "Our store";
  const hasCell = !!zWorkorder.customerCell?.length;
  const hasEmail = !!zWorkorder.customerEmail?.length;
  const hasSecondaryDisplay = localStorage.getItem("warpspeed_has_secondary_display") === "true";

  function toggleSelection(itemId) {
    _setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

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
    dbSendEmail(zWorkorder.customerEmail, subject, htmlBody, undefined, {
      workorderID: workorderID || "",
      customerID: zWorkorder?.customerID || "",
    });
  }

  function handleSendAll() {
    const selectedItems = zMedia.filter((m) => sSelectedIds.has(m.id));
    if (!selectedItems.length) return;
    let willSendEmail = sSendEmail && hasEmail;
    let willSendText = sSendText && !!onSendMedia;
    if (!willSendEmail && !willSendText) return;

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
      dbSendEmail(zWorkorder.customerEmail, subject, htmlBody, undefined, {
        workorderID: workorderID || "",
        customerID: zWorkorder?.customerID || "",
      });
    }

    if (willSendText) {
      onSendMedia(selectedItems);
      return;
    }

    onClose();
  }

  function handleDeleteSelected() {
    const selectedItems = zMedia.filter((m) => sSelectedIds.has(m.id));
    if (!selectedItems.length) return;

    const remaining = zMedia.filter((m) => !sSelectedIds.has(m.id));
    useOpenWorkordersStore.getState().setField("media", remaining, workorderID);
    _setSelectedIds(new Set());

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

  function handleOpenFullView(item) {
    _setFullView(item);
    if (sCastToDisplay) {
      broadcastToDisplay(DISPLAY_MSG_TYPES.MEDIA, { url: item.url, type: item.type });
    }
  }

  function handleCloseFullView() {
    _setFullView(null);
    if (sCastToDisplay) {
      broadcastToDisplay(DISPLAY_MSG_TYPES.CLEAR, null);
    }
  }

  function handleFullViewNav(direction) {
    let currentIndex = zMedia.findIndex((m) => m.id === sFullView.id);
    let nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= zMedia.length) return;
    let nextItem = zMedia[nextIndex];
    _setFullView(nextItem);
    if (sCastToDisplay) {
      broadcastToDisplay(DISPLAY_MSG_TYPES.MEDIA, { url: nextItem.url, type: nextItem.type });
    }
  }

  // Full-size overlay
  if (sFullView) {
    let currentIndex = zMedia.findIndex((m) => m.id === sFullView.id);
    let hasPrev = currentIndex > 0;
    let hasNext = currentIndex < zMedia.length - 1;

    return createPortal(
      <div
        className={styles.fullOverlay}
        onClick={handleCloseFullView}
        style={{ zIndex: z }}
      >
        <div className={styles.fullContent} onClick={(e) => e.stopPropagation()}>
          {hasPrev && (
            <div className={`${styles.navButton} ${styles.navPrev}`}>
              <Button
                icon={ICONS.caretLeft}
                iconSize={44}
                onPress={() => handleFullViewNav(-1)}
                buttonStyle={{
                  paddingLeft: 0,
                  paddingRight: 0,
                  paddingTop: 0,
                  paddingBottom: 0,
                  backgroundColor: "transparent",
                }}
                iconStyle={{ marginRight: 0 }}
              />
            </div>
          )}
          {sFullView.type === "video" ? (
            <video
              src={sFullView.url}
              controls
              autoPlay
              className={styles.fullVideo}
            />
          ) : (
            <img src={sFullView.url} alt="" className={styles.fullImage} draggable={false} />
          )}
          {hasNext && (
            <div className={`${styles.navButton} ${styles.navNext}`}>
              <Button
                icon={ICONS.caretRight}
                iconSize={44}
                onPress={() => handleFullViewNav(1)}
                buttonStyle={{
                  paddingLeft: 0,
                  paddingRight: 0,
                  paddingTop: 0,
                  paddingBottom: 0,
                  backgroundColor: "transparent",
                }}
                iconStyle={{ marginRight: 0 }}
              />
            </div>
          )}
        </div>
      </div>,
      document.body
    );
  }

  const tileWidth = isMobile ? "31%" : 120;
  const tileHeight = isMobile ? 100 : 120;

  return createPortal(
    <div
      className={styles.overlay}
      onClick={onClose}
      style={{ zIndex: z }}
    >
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: MODAL_WIDTH,
          backgroundColor: C.backgroundWhite,
          borderColor: C.buttonLightGreenOutline,
        }}
      >
        <LargeModalHeader
          title="Workorder Media"
          actions={[
            !isDonePaid && (
              <LargeModalHeaderButton
                key="upload"
                variant="default"
                icon={ICONS.uploadCamera}
                onClick={() => fileInputRef.current?.click()}
              >
                Upload
              </LargeModalHeaderButton>
            ),
            selectedCount > 0 && (
              <LargeModalHeaderButton
                key="delete"
                variant="danger"
                icon={ICONS.trash}
                iconSize={14}
                disabled={sDeleting || sSending}
                onClick={handleDeleteSelected}
              >
                {sDeleting ? "Deleting..." : "Delete Media"}
              </LargeModalHeaderButton>
            ),
            onSendMedia ? (
              <LargeModalHeaderButton
                key="send"
                variant="accent"
                icon={ICONS.paperPlane}
                iconSize={16}
                disabled={!(selectedCount > 0 && (sSendText || sSendEmail))}
                onClick={handleSendAll}
              >
                Send Media
              </LargeModalHeaderButton>
            ) : hasEmail ? (
              <LargeModalHeaderButton
                key="email"
                variant="accent"
                icon={ICONS.paperPlane}
                iconSize={16}
                disabled={!(selectedCount > 0 && !sSending)}
                onClick={handleSendMedia}
              >
                {sSending ? "Sending..." : "Send"}
              </LargeModalHeaderButton>
            ) : null,
            <LargeModalHeaderButton
              key="close"
              variant="default"
              icon={ICONS.close1}
              iconPosition="only"
              tooltip="Close"
              onClick={onClose}
            />,
          ]}
        />

        {/* Toolbar */}
        <div className={styles.header} style={{ borderBottomColor: C.borderSubtle }}>
          <div className={styles.headerRight}>
            <CheckBox
              text="Cast images to customer screen"
              isChecked={hasSecondaryDisplay && sCastToDisplay}
              onCheck={() => _setCastToDisplay(!sCastToDisplay)}
              enabled={hasSecondaryDisplay}
            />
          </div>
        </div>

        {/* Upload progress banner */}
        {sUploadProgress && !sUploadProgress.done && (
          <div className={styles.progressBanner} style={{ backgroundColor: C.surfaceAlt, borderBottomColor: C.borderSubtle }}>
            <div className={styles.progressRow}>
              <div className={styles.spinner} style={{ borderColor: C.borderSubtle, borderTopColor: C.orange }} />
              <span className={styles.progressText} style={{ color: C.text }}>
                Uploading {sUploadProgress.completed + (sUploadProgress.failed || 0) + 1} of {sUploadProgress.total}...
              </span>
            </div>
            <div className={styles.progressTrack} style={{ backgroundColor: C.backgroundWhite }}>
              <div
                className={styles.progressFill}
                style={{
                  width: `${((sUploadProgress.completed + (sUploadProgress.failed || 0)) / sUploadProgress.total) * 100}%`,
                  backgroundColor: C.orange,
                }}
              />
            </div>
          </div>
        )}
        {sUploadProgress && sUploadProgress.done && (
          <div className={styles.progressBanner} style={{ backgroundColor: C.surfaceAlt, borderBottomColor: C.borderSubtle }}>
            <span className={styles.progressText} style={{ color: sUploadProgress.failed > 0 ? C.red : C.green }}>
              {sUploadProgress.failed > 0
                ? `Uploaded ${sUploadProgress.completed} of ${sUploadProgress.total} — ${sUploadProgress.failed} failed`
                : `Uploaded ${sUploadProgress.completed} of ${sUploadProgress.total}`}
            </span>
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          {...(isMobile ? { capture: "environment" } : {})}
          onChange={handleDirectUpload}
          className={styles.hiddenFileInput}
        />

        <div className={styles.scrollArea}>
          {zMedia.length > 0 ? (
            <div className={styles.grid}>
              {zMedia.map((item) => {
                const isSelected = sSelectedIds.has(item.id);
                const wasSent = !!(item.sentToCustomer?.sms || item.sentToCustomer?.email);
                let displayName = item.originalFilename || item.filename;
                let displaySize = item.originalFileSize || item.fileSize;
                let sizeStr = displaySize
                  ? (displaySize < 1048576 ? (displaySize / 1024).toFixed(0) + " KB" : (displaySize / 1048576).toFixed(1) + " MB")
                  : "";
                return (
                  <div key={item.id} className={styles.tile} style={{ width: tileWidth }}>
                    <div
                      className={styles.tileThumb}
                      style={{
                        height: tileHeight,
                        borderWidth: isSelected ? 2 : 1,
                        borderColor: isSelected ? C.green : C.borderStrong,
                        backgroundColor: C.surfaceAlt,
                      }}
                    >
                      <button
                        type="button"
                        className={styles.tileSurface}
                        onClick={() => onSelect ? onSelect(item) : handleOpenFullView(item)}
                      >
                        {item.type === "video" ? (
                          <div className={styles.videoTile} style={{ backgroundColor: C.surfaceAlt }}>
                            <span className={styles.videoIcon}>▶</span>
                            <span className={styles.videoLabel}>{item.filename}</span>
                          </div>
                        ) : (
                          <img
                            src={item.thumbnailUrl || item.url}
                            alt=""
                            className={styles.thumbImg}
                            draggable={false}
                          />
                        )}
                      </button>

                      {/* Selection checkbox */}
                      <div className={`${styles.iconBtn} ${styles.selectBox}`}>
                        <Button
                          icon={isSelected ? ICONS.checkbox : ICONS.checkoxEmpty}
                          iconSize={16}
                          onPress={(e) => { e.stopPropagation(); toggleSelection(item.id); }}
                          buttonStyle={{
                            paddingLeft: 0,
                            paddingRight: 0,
                            paddingTop: 0,
                            paddingBottom: 0,
                            backgroundColor: "transparent",
                          }}
                          iconStyle={{ marginRight: 0 }}
                        />
                      </div>

                      {/* Delete */}
                      <div
                        className={`${styles.iconBtn} ${styles.deleteBtn}`}
                        style={{ backgroundColor: C.purple }}
                      >
                        <Button
                          icon={ICONS.trash}
                          iconSize={13}
                          onPress={(e) => { e.stopPropagation(); handleDeleteSingle(item); }}
                          buttonStyle={{
                            paddingLeft: 0,
                            paddingRight: 0,
                            paddingTop: 0,
                            paddingBottom: 0,
                            backgroundColor: "transparent",
                          }}
                          iconStyle={{ marginRight: 0 }}
                        />
                      </div>

                      {/* Sent badge */}
                      {wasSent && (
                        <div className={styles.sentBadge} style={{ backgroundColor: C.green }}>
                          <span className={styles.sentBadgeText}>
                            {item.sentToCustomer?.sms && item.sentToCustomer?.email
                              ? "Texted + Emailed"
                              : item.sentToCustomer?.sms
                                ? "Texted"
                                : "Emailed"}
                          </span>
                        </div>
                      )}
                    </div>
                    <Tooltip text={`${displayName}${sizeStr ? ` — ${sizeStr}` : ""}`} position="bottom">
                      <span
                        className={styles.tileLabel}
                        style={{ color: C.textMuted, width: isMobile ? undefined : 120 }}
                      >
                        {displayName}{sizeStr ? ` — ${sizeStr}` : ""}
                      </span>
                    </Tooltip>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={styles.emptyText} style={{ color: C.lightText }}>
              No media on this workorder
            </div>
          )}
        </div>

        {/* Info banner */}
        {zMedia.length > 0 && hasCell && !onSendMedia && !onSelect && (
          <div className={styles.infoBanner}>
            <div className={styles.infoBannerText} style={{ color: C.textMuted }}>
              To send media via text, use the Messages tab
            </div>
          </div>
        )}

        {/* Selection controls row */}
        {zMedia.length > 0 && (selectedCount > 0 || hasEmail || onSendMedia) && (
          <div className={styles.selectionRow} style={{ borderTopColor: C.borderSubtle }}>
            {selectedCount > 0 && (
              <span className={styles.selectedCount} style={{ color: C.lightText }}>
                {selectedCount} selected
              </span>
            )}
            {onSendMedia && hasCell && (
              <CheckBox
                text="Text"
                isChecked={sSendText}
                onCheck={() => _setSendText(!sSendText)}
              />
            )}
            {hasEmail && (
              <CheckBox
                text="Email"
                isChecked={sSendEmail}
                onCheck={() => _setSendEmail(!sSendEmail)}
              />
            )}
          </div>
        )}

      </div>

      {/* Upload compression confirmation overlay */}
      {sPendingFiles && (
        <div
          className={styles.confirmOverlay}
          onClick={(e) => e.stopPropagation()}
          style={{ zIndex: z + 5 }}
        >
          <div className={styles.confirmBackdrop} onClick={handleCancelUpload} />
          <div
            className={styles.confirmCard}
            style={{
              backgroundColor: C.backgroundWhite,
              borderColor: C.buttonLightGreenOutline,
            }}
          >
            <div className={styles.confirmMessage} style={{ color: C.text }}>
              Compression is set to medium. Only uncheck the box if you need high zoom capability, as the process takes drastically longer. Recommendation: first try the compressed image to see if it's good enough before using the uncompressed option.
            </div>
            {sPendingFiles.map((f, idx) => (
              <div key={idx} className={styles.confirmFileRow} style={{ color: C.textMuted }}>
                {f.name} - {f.size < 1048576 ? (f.size / 1024).toFixed(0) + " KB" : (f.size / 1048576).toFixed(1) + " MB"}
              </div>
            ))}
            <div className={styles.confirmSpacer} />
            <div className={styles.confirmActions}>
              <CheckBox
                text="Medium compression"
                isChecked={sCompressConfirm}
                onCheck={() => _setCompressConfirm(!sCompressConfirm)}
              />
              <div className={styles.confirmActionGroup}>
                <Button
                  text="Upload"
                  colorGradientArr={COLOR_GRADIENTS.green}
                  onPress={handleConfirmUpload}
                  buttonStyle={{ paddingLeft: 20, paddingRight: 20, paddingTop: 10, paddingBottom: 10, borderRadius: Radius.control }}
                  textStyle={{ fontSize: 14 }}
                />
                <Button
                  text="Cancel"
                  colorGradientArr={COLOR_GRADIENTS.grey}
                  onPress={handleCancelUpload}
                  buttonStyle={{ paddingLeft: 20, paddingRight: 20, paddingTop: 10, paddingBottom: 10, borderRadius: Radius.control }}
                  textStyle={{ fontSize: 14 }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
};
