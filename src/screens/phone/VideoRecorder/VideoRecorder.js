import { useRef, useState } from "react";
import { SmallLoadingIndicator, TouchableOpacity } from "../../../dom_components";
import styles from "./VideoRecorder.module.css";

const MAX_DURATION = 120;

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

  if (!initRef.current) {
    initRef.current = true;
    initCamera();
  }

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

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }

  return (
    <div className={styles.root}>
      <div className={styles.topBar}>
        <TouchableOpacity onPress={handleCancel} className={styles.closeBtn} aria-label="Cancel">
          <span className={styles.closeIcon}>{"\u2715"}</span>
        </TouchableOpacity>
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

      <div className={styles.body}>
        {sPhase === "error" ? (
          <div className={styles.errorBox}>
            <span className={styles.errorText}>{sError}</span>
          </div>
        ) : sPhase === "preview" && sPreviewUrl ? (
          <video
            src={sPreviewUrl}
            controls
            autoPlay
            playsInline
            className={styles.videoPreview}
          />
        ) : (
          <>
            <video
              ref={(el) => {
                videoRef.current = el;
                if (el && streamRef.current) el.srcObject = streamRef.current;
              }}
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
        {sPhase === "preview" && (
          <div className={styles.previewActions}>
            <TouchableOpacity onPress={handleReRecord} className={styles.reRecordBtn}>
              <span className={styles.btnText}>Re-record</span>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleUse} className={styles.useBtn}>
              <span className={styles.btnText}>Use Video</span>
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
