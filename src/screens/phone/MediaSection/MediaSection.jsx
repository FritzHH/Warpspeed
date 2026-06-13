import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOpenWorkordersStore, useUploadProgressStore } from "../../../stores";
import { dbDeleteWorkorderMedia } from "../../../db_calls_wrapper";
import { Image, PanelConfirm, SmallLoadingIndicator } from "../../../dom_components";
import { C, ICONS } from "../../../styles";
import styles from "./MediaSection.module.css";

export function MediaSection({ workorder }) {
  const navigate = useNavigate();
  const [sCarouselOpen, _setCarouselOpen] = useState(false);
  const [sCurrentIdx, _setCurrentIdx] = useState(0);
  const [sConfirmDelete, _setConfirmDelete] = useState(false);
  const initialIdxRef = useRef(0);
  const zUploadProgress = useUploadProgressStore((s) => s.progress);

  const media = workorder.media || [];

  function openCarousel(idx) {
    initialIdxRef.current = idx;
    _setCurrentIdx(idx);
    _setCarouselOpen(true);
  }

  const carouselScrollRef = useCallback((el) => {
    if (el) {
      el.scrollLeft = initialIdxRef.current * el.clientWidth;
    }
  }, []);

  function handleCarouselScroll(e) {
    const el = e.target;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx !== sCurrentIdx) _setCurrentIdx(idx);
  }

  function handleDeleteCurrent() {
    const item = media[sCurrentIdx];
    if (!item) return;
    const newMedia = media.filter((_, i) => i !== sCurrentIdx);
    useOpenWorkordersStore.getState().setField("media", newMedia, workorder.id);
    dbDeleteWorkorderMedia(item);
    _setConfirmDelete(false);
    if (newMedia.length === 0) {
      _setCarouselOpen(false);
    } else if (sCurrentIdx >= newMedia.length) {
      _setCurrentIdx(newMedia.length - 1);
    }
  }

  const progressPct = zUploadProgress
    ? (zUploadProgress.completed / zUploadProgress.total) * 100
    : 0;

  return (
    <>
      <div className={styles.card}>
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
              onClick={() => navigate(`/phone/workorder/${workorder.id}/video`)}
              className={styles.recordBtn}
            >
              <Image icon={ICONS.add} size={16} />
              <span className={styles.actionBtnText}>Video</span>
            </button>
            <button
              type="button"
              onClick={() => navigate(`/phone/workorder/${workorder.id}/photo`)}
              className={styles.addBtn}
            >
              <Image icon={ICONS.add} size={16} />
              <span className={styles.actionBtnText}>Picture</span>
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
            {media.map((item, idx) => {
              const isVideo = item.type === "video";
              return (
                <div
                  key={item.id}
                  className={styles.thumb}
                  onClick={() => openCarousel(idx)}
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

      {sCarouselOpen && media.length > 0 && (
        <div className={styles.carousel}>
          <div
            className={styles.carouselTrack}
            ref={carouselScrollRef}
            onScroll={handleCarouselScroll}
          >
            {media.map((item) => (
              <div key={item.id} className={styles.carouselSlide}>
                {item.type === "video" ? (
                  <video src={item.url} controls className={styles.carouselMedia} />
                ) : (
                  <img src={item.url} alt="" className={styles.carouselMedia} />
                )}
              </div>
            ))}
          </div>
          <div className={styles.bottomOverlay}>
            <button
              type="button"
              onClick={() => _setCarouselOpen(false)}
              className={styles.carouselCloseBtn}
              aria-label="Close"
            >
              <Image icon={ICONS.close1} size={42} />
            </button>
            {media.length > 1 && (
              <div className={styles.dotsRow}>
                {media.map((_, idx) => (
                  <div
                    key={idx}
                    className={`${styles.dot} ${idx === sCurrentIdx ? styles.dotActive : ""}`}
                  />
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => _setConfirmDelete(true)}
              className={styles.deleteBtn}
              aria-label="Delete"
            >
              <Image icon={ICONS.trash} size={42} />
            </button>
          </div>
          <PanelConfirm
            show={sConfirmDelete}
            centered
            title="Delete media?"
            message={
              media[sCurrentIdx]?.type === "video"
                ? "This video will be permanently removed."
                : "This picture will be permanently removed."
            }
            yesText="Delete"
            noText="Cancel"
            onYes={handleDeleteCurrent}
            onNo={() => _setConfirmDelete(false)}
          />
        </div>
      )}
    </>
  );
}
