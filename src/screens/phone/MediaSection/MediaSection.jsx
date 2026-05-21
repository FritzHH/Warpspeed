import { useState, useRef } from "react";
import { useOpenWorkordersStore, useUploadProgressStore } from "../../../stores";
import { compressImage } from "../../../utils";
import { dbUploadWorkorderMedia } from "../../../db_calls_wrapper";
import { SmallLoadingIndicator } from "../../../dom_components";
import { VideoRecorder } from "../VideoRecorder/VideoRecorder";
import { C } from "../../../styles";
import styles from "./MediaSection.module.css";

export function MediaSection({ workorder, zSettings }) {
  const [sViewMedia, _setViewMedia] = useState(null);
  const [sShowRecorder, _setShowRecorder] = useState(false);
  const uploadInputRef = useRef(null);
  const zUploadProgress = useUploadProgressStore((s) => s.progress);

  const media = workorder.media || [];

  function handleUploadPress() {
    if (uploadInputRef.current) uploadInputRef.current.click();
  }

  function handleFileChange(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    if (uploadInputRef.current) uploadInputRef.current.value = "";
    doUpload(files);
  }

  async function doUpload(files) {
    const total = files.length;
    let completed = 0;
    let failed = 0;
    useUploadProgressStore.getState().setProgress({ completed: 0, total, failed: 0, done: false });
    const newMedia = [...(workorder?.media || [])];
    const storeName = (zSettings?.storeInfo?.displayName || "photo").replace(/\s+/g, "_");
    for (let i = 0; i < files.length; i++) {
      let fileToUpload = files[i];
      const originalFilename = fileToUpload.name;
      const originalFileSize = fileToUpload.size;
      const ext = fileToUpload.name.split(".").pop() || "jpg";
      const rand = Math.floor(1000 + Math.random() * 9000);
      const typeLabel = fileToUpload.type.startsWith("video") ? "Video" : "Image";
      const cleanName = `${storeName}_${typeLabel}_${rand}.${ext}`;
      if (fileToUpload.type.startsWith("image")) {
        const compressed = await compressImage(fileToUpload, 1024, 0.65);
        if (compressed) {
          compressed.name = cleanName;
          fileToUpload = compressed;
        } else {
          fileToUpload = new File([fileToUpload], cleanName, { type: fileToUpload.type });
        }
      } else {
        fileToUpload = new File([fileToUpload], cleanName, { type: fileToUpload.type });
      }
      const result = await dbUploadWorkorderMedia(workorder.id, fileToUpload, {
        originalFilename,
        originalFileSize,
      });
      if (result.success) {
        newMedia.push(result.mediaItem);
        completed++;
      } else {
        failed++;
      }
      useUploadProgressStore.getState().setProgress({ completed, total, failed, done: false });
    }
    useOpenWorkordersStore.getState().setField("media", newMedia, workorder.id);
    useUploadProgressStore.getState().setProgress({ completed, total, failed, done: true });
    setTimeout(
      () => useUploadProgressStore.getState().setProgress(null),
      failed > 0 ? 5000 : 3000
    );
  }

  function handleRecordingComplete(file) {
    _setShowRecorder(false);
    doUpload([file]);
  }

  const progressPct = zUploadProgress
    ? (zUploadProgress.completed / zUploadProgress.total) * 100
    : 0;

  return (
    <>
      <div className={styles.card}>
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={handleFileChange}
          className={styles.hiddenInput}
        />

        <div className={styles.headerRow}>
          <div className={styles.headerLeft}>
            <span className={styles.label}>MEDIA</span>
            {media.length > 0 && (
              <span className={styles.countBadge}>
                <span className={styles.countBadgeText}>{media.length}</span>
              </span>
            )}
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              onClick={() => _setShowRecorder(true)}
              className={styles.recordBtn}
            >
              <span className={styles.actionBtnText}>Record</span>
            </button>
            <button type="button" onClick={handleUploadPress} className={styles.addBtn}>
              <span className={styles.actionBtnText}>+ Add</span>
            </button>
          </div>
        </div>

        {zUploadProgress && !zUploadProgress.done && (
          <div className={styles.progressWrap}>
            <div className={styles.progressTopRow}>
              <SmallLoadingIndicator text="" color={C.blue} />
              <span className={styles.progressLabel}>
                Uploading {zUploadProgress.completed}/{zUploadProgress.total} - don't leave this page
              </span>
            </div>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: progressPct + "%" }} />
            </div>
          </div>
        )}

        {zUploadProgress && zUploadProgress.done && (
          <span
            className={`${styles.completeText} ${
              zUploadProgress.failed > 0
                ? styles.completeTextError
                : styles.completeTextSuccess
            }`}
          >
            {zUploadProgress.failed > 0
              ? `Uploaded ${zUploadProgress.completed}/${zUploadProgress.total} (${zUploadProgress.failed} failed)`
              : `${zUploadProgress.completed} file${zUploadProgress.completed > 1 ? "s" : ""} uploaded`}
          </span>
        )}

        {media.length > 0 ? (
          <div className={styles.thumbGrid}>
            {media.map((item) => {
              const isVideo = item.type === "video";
              return (
                <div
                  key={item.id}
                  className={styles.thumb}
                  onClick={() => _setViewMedia(item)}
                >
                  <img
                    src={item.thumbnailUrl || item.url}
                    alt=""
                    className={styles.thumbImg}
                  />
                  {isVideo && (
                    <div className={styles.videoOverlay}>
                      <span className={styles.videoOverlayIcon}>{"\u25B6"}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <span className={styles.emptyText}>No photos or videos yet</span>
        )}
      </div>

      {sViewMedia && (
        <div className={styles.viewer} onClick={() => _setViewMedia(null)}>
          <button
            type="button"
            onClick={() => _setViewMedia(null)}
            className={styles.viewerCloseBtn}
          >
            <span className={styles.viewerCloseBtnText}>{"\u2715"}</span>
          </button>
          {sViewMedia.type === "video" ? (
            <video
              src={sViewMedia.url}
              controls
              autoPlay
              className={styles.viewerMedia}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <img
              src={sViewMedia.url}
              alt=""
              className={styles.viewerMedia}
              onClick={(e) => e.stopPropagation()}
            />
          )}
          <span className={styles.viewerFilename}>
            {sViewMedia.originalFilename || sViewMedia.filename || ""}
          </span>
        </div>
      )}

      {sShowRecorder && (
        <div className={styles.recorderWrap}>
          <VideoRecorder
            onComplete={handleRecordingComplete}
            onCancel={() => _setShowRecorder(false)}
          />
        </div>
      )}
    </>
  );
}
