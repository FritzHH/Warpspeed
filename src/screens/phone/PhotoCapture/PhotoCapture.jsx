import { useCallback, useEffect, useRef, useState } from "react";
import { Image, SmallLoadingIndicator, Toast, TouchableOpacity } from "../../../dom_components";
import { ICONS } from "../../../styles";
import styles from "./PhotoCapture.module.css";

export function PhotoCapture({ onComplete, onCancel }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const previewUrlRef = useRef(null);
  const initRef = useRef(false);

  const [sPhase, _setPhase] = useState("starting");
  const [sCapturedBlob, _setCapturedBlob] = useState(null);
  const [sPreviewUrl, _setPreviewUrl] = useState(null);
  const [sError, _setError] = useState("");
  const [sSwipeX, _setSwipeX] = useState(0);
  const [sSwiping, _setSwiping] = useState(false);
  const [sShowHintToast, _setShowHintToast] = useState(true);
  const swipeStartRef = useRef(null);

  if (!initRef.current) {
    initRef.current = true;
    initCamera();
  }

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  async function initCamera() {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        _setError("Camera not supported on this device");
        _setPhase("error");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      _setPhase("ready");
    } catch (e) {
      _setError("Camera access denied");
      _setPhase("error");
    }
  }

  function handleCapture() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        _setCapturedBlob(blob);
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        _setPreviewUrl(url);
        _setPhase("preview");
      },
      "image/jpeg",
      0.92
    );
  }

  function handleReCapture() {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    _setPreviewUrl(null);
    _setCapturedBlob(null);
    if (!streamRef.current?.active) {
      _setPhase("starting");
      initCamera();
    } else {
      _setPhase("ready");
    }
  }

  function handleUse() {
    const file = new File([sCapturedBlob], "photo.jpg", { type: "image/jpeg" });
    onComplete(file);
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    _setPreviewUrl(null);
    _setCapturedBlob(null);
    _setPhase("ready");
  }

  function handleCancel() {
    cleanup();
    onCancel();
  }

  function cleanup() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }

  const setVideoEl = useCallback((el) => {
    videoRef.current = el;
    if (el && streamRef.current && el.srcObject !== streamRef.current) {
      el.srcObject = streamRef.current;
    }
  }, []);

  const swipeHandlers = {
    onTouchStart: (e) => {
      const t = e.touches[0];
      if (t.clientX > 30) return;
      e.stopPropagation();
      swipeStartRef.current = { x: t.clientX, time: Date.now() };
      _setSwiping(true);
    },
    onTouchMove: (e) => {
      if (!swipeStartRef.current) return;
      e.stopPropagation();
      const t = e.touches[0];
      const dx = t.clientX - swipeStartRef.current.x;
      if (dx > 0) _setSwipeX(dx);
    },
    onTouchEnd: (e) => {
      if (!swipeStartRef.current) return;
      e.stopPropagation();
      const elapsed = Date.now() - swipeStartRef.current.time;
      const velocity = sSwipeX / Math.max(elapsed, 1);
      const commitThreshold = window.innerWidth * 0.3;
      const isCommit = sSwipeX > commitThreshold || velocity > 0.5;
      swipeStartRef.current = null;
      _setSwiping(false);
      if (isCommit) {
        _setSwipeX(window.innerWidth);
        setTimeout(() => { handleCancel(); _setSwipeX(0); }, 200);
      } else {
        _setSwipeX(0);
      }
    },
  };

  const swipeStyle = {
    transform: `translateX(${sSwipeX}px)`,
    transition: sSwiping ? "none" : "transform 200ms ease",
  };

  return (
    <div className={styles.root} {...swipeHandlers} style={swipeStyle}>
      <Toast
        text="Swipe left to close"
        visible={sShowHintToast}
        duration={1500}
        position="middle"
        onHide={() => _setShowHintToast(false)}
      />
      <div className={styles.body}>
        {sPhase === "error" ? (
          <div className={styles.errorBox}>
            <span className={styles.errorText}>{sError}</span>
          </div>
        ) : sPhase === "preview" && sPreviewUrl ? (
          <img src={sPreviewUrl} alt="" className={styles.imagePreview} />
        ) : (
          <>
            <video
              ref={setVideoEl}
              autoPlay
              playsInline
              muted
              className={styles.video}
            />
            {sPhase === "starting" && (
              <div className={styles.startingOverlay}>
                <SmallLoadingIndicator text="" color="white" />
                <span className={styles.startingText}>Starting camera...</span>
              </div>
            )}
          </>
        )}
      </div>

      <div className={styles.bottomBar}>
        {sPhase === "ready" && (
          <TouchableOpacity onPress={handleCapture} aria-label="Take photo">
            <div className={styles.captureRing}>
              <div className={styles.captureDot} />
            </div>
          </TouchableOpacity>
        )}
        {sPhase === "preview" && (
          <div className={styles.previewActions}>
            <TouchableOpacity
              onPress={handleReCapture}
              className={styles.reTakeBtn}
              aria-label="Retake"
            >
              <Image icon={ICONS.camera} size={67} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleUse}
              className={styles.useCheckBtn}
              aria-label="Use Photo"
            >
              <Image icon={ICONS.check1} size={62} />
            </TouchableOpacity>
          </div>
        )}
        {sPhase === "error" && (
          <TouchableOpacity onPress={handleCancel} className={styles.errorBtn}>
            <span className={styles.btnText}>Go Back</span>
          </TouchableOpacity>
        )}
      </div>
    </div>
  );
}
