import { useCallback, useEffect, useRef, useState } from "react";
import { Image, SmallLoadingIndicator, Toast, TouchableOpacity } from "../../../dom_components";
import { ICONS } from "../../../styles";
import styles from "./VideoRecorder.module.css";

const MAX_DURATION = 30;

export function VideoRecorder({ onComplete, onCancel }) {
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const previewUrlRef = useRef(null);
  const initRef = useRef(false);

  const [sPhase, _setPhase] = useState("starting");
  const [sRecordedBlob, _setRecordedBlob] = useState(null);
  const [sPreviewUrl, _setPreviewUrl] = useState(null);
  const [sMimeType, _setMimeType] = useState("");
  const [sSeconds, _setSeconds] = useState(0);
  const [sError, _setError] = useState("");
  const [sHitLimit, _setHitLimit] = useState(false);
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
      if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      clearInterval(timerRef.current);
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
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      let mime = "";
      if (MediaRecorder.isTypeSupported("video/mp4;codecs=h264")) mime = "video/mp4;codecs=h264";
      else if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8")) mime = "video/webm;codecs=vp8";
      else if (MediaRecorder.isTypeSupported("video/webm")) mime = "video/webm";
      _setMimeType(mime);
      _setPhase("ready");
    } catch (e) {
      _setError("Camera access denied");
      _setPhase("error");
    }
  }

  function handleStartRecording() {
    try {
      chunksRef.current = [];
      _setSeconds(0);
      _setHitLimit(false);
      const options = { videoBitsPerSecond: 1500000 };
      if (sMimeType) options.mimeType = sMimeType;
      const recorder = new MediaRecorder(streamRef.current, options);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: sMimeType || "video/webm" });
        _setRecordedBlob(blob);
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        _setPreviewUrl(url);
        _setPhase("preview");
        clearInterval(timerRef.current);
      };
      recorder.start(1000);
      _setPhase("recording");
      timerRef.current = setInterval(() => {
        _setSeconds((prev) => {
          if (prev + 1 >= MAX_DURATION) {
            recorder.stop();
            _setHitLimit(true);
            return prev + 1;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (e) {
      _setError("Recording not supported on this device");
      _setPhase("error");
    }
  }

  function handleStopRecording() {
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    clearInterval(timerRef.current);
  }

  function handleReRecord() {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    _setPreviewUrl(null);
    _setRecordedBlob(null);
    _setSeconds(0);
    if (!streamRef.current?.active) {
      _setPhase("starting");
      initCamera();
    } else {
      _setPhase("ready");
    }
  }

  function handleUse() {
    const ext = sMimeType.includes("mp4") ? "mp4" : "webm";
    const fileType = sMimeType.split(";")[0] || "video/webm";
    const file = new File([sRecordedBlob], `recording.${ext}`, { type: fileType });
    cleanup();
    onComplete(file);
  }

  function handleCancel() {
    cleanup();
    onCancel();
  }

  function cleanup() {
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    clearInterval(timerRef.current);
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }

  const setVideoEl = useCallback((el) => {
    videoRef.current = el;
    if (el && streamRef.current && el.srcObject !== streamRef.current) {
      el.srcObject = streamRef.current;
    }
  }, []);

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }

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
      <div className={styles.topBar}>
        <div className={styles.topSpacer} />
        {sPhase === "recording" && (
          <div className={styles.timerRow}>
            <div className={styles.timerDot} />
            <span className={styles.timerText}>{formatTime(sSeconds)}</span>
          </div>
        )}
        {sPhase === "preview" && (
          <span className={styles.timerTextDim}>{formatTime(sSeconds)}</span>
        )}
        <div className={styles.topSpacer} />
      </div>

      {sPhase === "preview" && (
        <div className={styles.previewActions}>
          <TouchableOpacity
            onPress={handleReRecord}
            className={styles.reRecordBtn}
            aria-label="Re-record"
          >
            <Image icon={ICONS.camera} size={67} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleUse}
            className={styles.useBtn}
            aria-label="Use Video"
          >
            <Image icon={ICONS.check1} size={62} />
          </TouchableOpacity>
        </div>
      )}

      <div className={styles.body}>
        {sPhase === "error" ? (
          <div className={styles.errorBox}>
            <span className={styles.errorText}>{sError}</span>
          </div>
        ) : sPhase === "preview" && sPreviewUrl ? (
          <>
            {sHitLimit && (
              <div className={styles.limitBanner}>
                <span className={styles.limitBannerText}>
                  30 second limit reached
                </span>
              </div>
            )}
            <video
              src={sPreviewUrl}
              controls
              autoPlay
              playsInline
              className={styles.videoPreview}
              onLoadedData={(e) => {
                e.target.play().catch(() => {});
              }}
            />
          </>
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
          <TouchableOpacity onPress={handleStartRecording} aria-label="Start recording">
            <div className={styles.captureRing}>
              <div className={styles.captureDot} />
            </div>
          </TouchableOpacity>
        )}
        {sPhase === "recording" && (
          <TouchableOpacity onPress={handleStopRecording} aria-label="Stop recording">
            <div className={styles.captureRing}>
              <div className={styles.stopSquare} />
            </div>
          </TouchableOpacity>
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
