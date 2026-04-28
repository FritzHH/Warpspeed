/* eslint-disable */
import { View, Text, ScrollView, TouchableOpacity, TextInput } from "react-native-web";
import { useState, useEffect, useRef } from "react";
import * as faceapi from "face-api.js";
import { C, ICONS } from "../styles";
import {
  useSettingsStore,
  useOpenWorkordersStore,
  useAlertScreenStore,
  useLoginStore,
  useUploadProgressStore,
} from "../stores";
import {
  resolveStatus,
  formatCurrencyDisp,
  gray,
  capitalizeFirstLetterOfString,
  formatMillisForDisplay,
  formatPhoneWithDashes,
  calculateRunningTotals,
  calculateWaitEstimateLabel,
  lightenRGBByPercent,
  compressImage,
  log,
} from "../utils";
import { dbUploadWorkorderMedia } from "../db_calls_wrapper";
import { Image_, AlertBox_, SmallLoadingIndicator, StatusPickerModal } from "../components";
import { StandKeypad } from "../shared/StandKeypad";
import { FACE_DESCRIPTOR_CONFIDENCE_DISTANCE } from "../constants";
import { openCacheDB, clearStaleCache, loadModelCached } from "../faceDetection";

const LOCAL_STORAGE_KEY = "warpspeed_phone_user_id";

////////////////////////////////////////////////////////////////////////////////
// Main Screen
////////////////////////////////////////////////////////////////////////////////

export function PhoneScreen() {
  const zWorkorders = useOpenWorkordersStore((state) => state.workorders);
  const zSettings = useSettingsStore((state) => state.settings);
  const zStatuses = zSettings?.statuses;
  const zShowAlert = useAlertScreenStore((state) => state.showAlert);

  const [sActiveModal, _setActiveModal] = useState(null);
  const [sSelectedWorkorderID, _setSelectedWorkorderID] = useState(null);
  const [sPin, _setPin] = useState("");
  const [sPinError, _setPinError] = useState("");
  const [sSearch, _setSearch] = useState("");
  const [sFaceCountdown, _setFaceCountdown] = useState(5);

  // "face" = scanning, "pin" = keypad, null = logged in
  const [sLoginPhase, _setLoginPhase] = useState(() => {
    let storedUserID = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!storedUserID) return "face";
    let users = useSettingsStore.getState().settings?.users || [];
    let user = users.find((u) => u.id === storedUserID);
    if (!user) return "face";
    useLoginStore.getState().setCurrentUser(user);
    useLoginStore.getState().setLastActionMillis();
    return null;
  });

  const faceVideoRef = useRef(null);
  const faceStreamRef = useRef(null);
  const faceIntervalRef = useRef(null);
  const countdownRef = useRef(null);

  // Face recognition login - runs when sLoginPhase is "face"
  useEffect(() => {
    if (sLoginPhase !== "face") return;
    let cancelled = false;

    async function runFaceLogin() {
      // Load models
      try {
        let db = null;
        try { db = await openCacheDB(); await clearStaleCache(db); } catch (e) {}
        await Promise.all([
          loadModelCached(faceapi.nets.tinyFaceDetector, "tiny_face_detector_model", db),
          loadModelCached(faceapi.nets.faceLandmark68Net, "face_landmark_68_model", db),
          loadModelCached(faceapi.nets.faceRecognitionNet, "face_recognition_model", db),
        ]);
        if (db) db.close();
      } catch (e) {
        log("Phone face model loading failed:", e);
        if (!cancelled) _setLoginPhase("pin");
        return;
      }

      // Get webcam
      try {
        let stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        faceStreamRef.current = stream;
        setTimeout(() => {
          if (faceVideoRef.current) faceVideoRef.current.srcObject = stream;
        }, 50);
      } catch (e) {
        if (!cancelled) _setLoginPhase("pin");
        return;
      }

      // Start countdown + detection
      let secondsLeft = 5;
      _setFaceCountdown(5);

      countdownRef.current = setInterval(() => {
        secondsLeft--;
        _setFaceCountdown(secondsLeft);
        if (secondsLeft <= 0) {
          cleanup();
          if (!cancelled) _setLoginPhase("pin");
        }
      }, 1000);

      faceIntervalRef.current = setInterval(async () => {
        if (!faceVideoRef.current || faceVideoRef.current.readyState < 2) return;
        let detection = await faceapi
          .detectSingleFace(faceVideoRef.current, new faceapi.TinyFaceDetectorOptions())
          .withFaceLandmarks()
          .withFaceDescriptor();
        if (!detection) return;
        let users = useSettingsStore.getState().settings?.users || [];
        for (let user of users) {
          if (!user.faceDescriptor) continue;
          try {
            let distance = faceapi.euclideanDistance(Object.values(user.faceDescriptor), detection.descriptor);
            if (distance < FACE_DESCRIPTOR_CONFIDENCE_DISTANCE) {
              cleanup();
              localStorage.setItem(LOCAL_STORAGE_KEY, user.id);
              useLoginStore.getState().setCurrentUser(user);
              useLoginStore.getState().setLastActionMillis();
              if (!cancelled) _setLoginPhase(null);
              return;
            }
          } catch (e) {}
        }
      }, 500);
    }

    function cleanup() {
      clearInterval(faceIntervalRef.current);
      clearInterval(countdownRef.current);
      if (faceStreamRef.current) {
        faceStreamRef.current.getTracks().forEach((t) => t.stop());
        faceStreamRef.current = null;
      }
    }

    runFaceLogin();
    return () => { cancelled = true; cleanup(); };
  }, [sLoginPhase]);

  const selectedWorkorder = zWorkorders.find((w) => w.id === sSelectedWorkorderID) || null;

  function openWorkorder(workorder) {
    _setSelectedWorkorderID(workorder.id);
    _setActiveModal("workorderDetail");
  }

  function closeModal() {
    _setActiveModal(null);
    _setSelectedWorkorderID(null);
  }

  function handlePinKeyPress(key) {
    if (key === "CLR") { _setPin(""); _setPinError(""); return; }
    if (key === "\u232B") { _setPin((prev) => prev.slice(0, -1)); _setPinError(""); return; }

    let newPin = sPin + key;
    _setPin(newPin);
    _setPinError("");

    let users = zSettings?.users || [];
    let userObj = users.find((u) => u.pin == newPin);
    if (!userObj) userObj = users.find((u) => u.alternatePin == newPin);
    if (!userObj) return;

    // Match found - store locally and log in
    localStorage.setItem(LOCAL_STORAGE_KEY, userObj.id);
    useLoginStore.getState().setCurrentUser(userObj);
    useLoginStore.getState().setLastActionMillis();
    _setLoginPhase(null);
    _setPin("");
  }

  // Face scanning screen
  if (sLoginPhase === "face") {
    return (
      <View style={{ width: "100%", height: "100%", backgroundColor: C.backgroundWhite }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingVertical: 12,
            backgroundColor: C.buttonLightGreen,
            borderBottomWidth: 1,
            borderBottomColor: C.buttonLightGreenOutline,
          }}
        >
          <Image_ icon={ICONS.gears1} size={24} style={{ marginRight: 8 }} />
          <Text style={{ fontSize: 20, fontWeight: "600", color: C.text }}>
            WARPSPEED
          </Text>
        </View>
        <AlertBox_ showAlert={zShowAlert} />
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 24 }}>
          <SmallLoadingIndicator />
          <Text style={{ fontSize: 18, fontWeight: "600", color: C.text, marginTop: 12 }}>
            Scanning face...
          </Text>
          <Text style={{ fontSize: 48, fontWeight: "700", color: C.green, marginTop: 16 }}>
            {sFaceCountdown}
          </Text>
        </View>
        <video
          ref={faceVideoRef}
          width={0}
          height={0}
          autoPlay
          muted
          onLoadedMetadata={(e) => e.target.play()}
          style={{ position: "absolute", opacity: 0 }}
        />
      </View>
    );
  }

  // Pin entry screen
  if (sLoginPhase === "pin") {
    return (
      <View style={{ width: "100%", height: "100%", backgroundColor: C.backgroundWhite }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingVertical: 12,
            backgroundColor: C.buttonLightGreen,
            borderBottomWidth: 1,
            borderBottomColor: C.buttonLightGreenOutline,
          }}
        >
          <Image_ icon={ICONS.gears1} size={24} style={{ marginRight: 8 }} />
          <Text style={{ fontSize: 20, fontWeight: "600", color: C.text }}>
            WARPSPEED
          </Text>
        </View>
        <AlertBox_ showAlert={zShowAlert} />
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 24 }}>
          <Text style={{ fontSize: 18, fontWeight: "600", color: C.text, marginBottom: 24 }}>
            Enter PIN
          </Text>
          <View style={{ flexDirection: "row", marginBottom: 24, height: 24, alignItems: "center" }}>
            {sPin.split("").map((_, i) => (
              <View
                key={i}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  backgroundColor: C.text,
                  marginHorizontal: 6,
                }}
              />
            ))}
            {sPin.length === 0 && (
              <Text style={{ fontSize: 14, color: gray(0.5) }}>-</Text>
            )}
          </View>
          {!!sPinError && (
            <Text style={{ fontSize: 14, color: C.red, marginBottom: 12 }}>{sPinError}</Text>
          )}
          <StandKeypad mode="phone" onKeyPress={handlePinKeyPress} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ width: "100%", height: "100%", backgroundColor: C.backgroundWhite }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: C.buttonLightGreen,
          borderBottomWidth: 1,
          borderBottomColor: C.buttonLightGreenOutline,
        }}
      >
        <Image_ icon={ICONS.gears1} size={24} style={{ marginRight: 8 }} />
        <Text style={{ fontSize: 20, fontWeight: "600", color: C.text }}>
          WARPSPEED
        </Text>
        <TouchableOpacity
          onPress={() => {
            if ("caches" in window) {
              caches.keys().then((names) => names.forEach((n) => caches.delete(n)));
            }
            window.location.reload(true);
          }}
          style={{
            marginLeft: "auto",
            backgroundColor: C.red,
            borderRadius: 6,
            paddingHorizontal: 8,
            paddingVertical: 4,
          }}
        >
          <Text style={{ color: "white", fontSize: 11, fontWeight: "700" }}>
            CLEAR CACHE
          </Text>
        </TouchableOpacity>
      </View>

      {/* Alert overlay */}
      <AlertBox_ showAlert={zShowAlert} />

      {/* Search Bar */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4 }}>
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            borderWidth: 1,
            borderColor: C.buttonLightGreenOutline,
            borderRadius: 8,
            backgroundColor: C.listItemWhite,
            paddingHorizontal: 8,
            height: 36,
          }}
        >
          <Image_ icon={ICONS.search} size={16} style={{ marginRight: 6, opacity: 0.4 }} />
          <TextInput
            value={sSearch}
            onChangeText={_setSearch}
            placeholder="Search name, brand, description..."
            placeholderTextColor={gray(0.6)}
            style={{ flex: 1, fontSize: 14, color: C.text, outlineStyle: "none" }}
          />
          {!!sSearch && (
            <TouchableOpacity onPress={() => _setSearch("")} style={{ padding: 4 }}>
              <Image_ icon={ICONS.close1} size={14} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Workorder List */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 8 }}
      >
        {sortWorkorders(zWorkorders.filter((wo) => {
          if (!wo.customerID) return false;
          if (!sSearch.trim()) return true;
          let q = sSearch.trim().toLowerCase();
          let fields = [wo.customerFirst, wo.customerLast, wo.brand, wo.description];
          return fields.some((f) => f && f.toLowerCase().includes(q));
        })).map((workorder) => (
          <WorkorderCard
            key={workorder.id}
            workorder={workorder}
            zStatuses={zStatuses}
            zSettings={zSettings}
            onPress={() => openWorkorder(workorder)}
          />
        ))}

        {zWorkorders.length === 0 && (
          <View style={{ alignItems: "center", paddingVertical: 40 }}>
            <Text style={{ fontSize: 16, color: gray(0.5) }}>No open workorders</Text>
          </View>
        )}
      </ScrollView>

      {/* Workorder Detail Modal */}
      {sActiveModal === "workorderDetail" && selectedWorkorder && (
        <WorkorderDetailModal
          workorder={selectedWorkorder}
          zSettings={zSettings}
          onClose={closeModal}
        />
      )}
    </View>
  );
}

////////////////////////////////////////////////////////////////////////////////
// Workorder Card (matches stand WorkorderListModal style)
////////////////////////////////////////////////////////////////////////////////

function WorkorderCard({ workorder, zStatuses, zSettings, onPress }) {
  let rs = resolveStatus(workorder.status, zStatuses);
  let waitInfo = computeWaitInfo(workorder, zSettings);

  // WIP user
  let wipUser = "";
  if (workorder.status === "work_in_progress" && workorder.changeLog?.length) {
    for (let i = workorder.changeLog.length - 1; i >= 0; i--) {
      let entry = workorder.changeLog[i];
      if (entry.field === "status" && entry.to === rs.label) { wipUser = entry.user || ""; break; }
    }
  }

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <View
        style={{
          marginBottom: 4,
          borderRadius: 7,
          borderWidth: 1,
          borderLeftWidth: 4,
          borderLeftColor: rs.backgroundColor || C.buttonLightGreenOutline,
          borderColor: C.buttonLightGreenOutline,
          backgroundColor: C.listItemWhite,
          paddingLeft: 5,
          paddingRight: 6,
          paddingVertical: 3,
        }}
      >
        {/* Top row: customer + brand | date + status */}
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {/* Left: customer + description */}
          <View style={{ flex: 1, marginVertical: 2 }}>
            {/* Customer name */}
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {workorder.hasNewSMS && (
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.green, marginRight: 5 }} />
              )}
              <Text numberOfLines={1} style={{ fontSize: 17, color: "dimgray" }}>
                {capitalizeFirstLetterOfString(workorder.customerFirst) + " " + capitalizeFirstLetterOfString(workorder.customerLast)}
              </Text>
            </View>

            {/* Brand + description + line count */}
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ fontSize: 13, fontWeight: "500", color: C.text }}>
                {capitalizeFirstLetterOfString(workorder.brand) || ""}
              </Text>
              {!!(workorder.brand && workorder.description) && (
                <View style={{ width: 6, height: 2, marginHorizontal: 4, backgroundColor: "lightgray" }} />
              )}
              {!!workorder.description && (
                <Text numberOfLines={1} style={{ fontSize: 13, color: C.text, flex: 1 }}>
                  {capitalizeFirstLetterOfString(workorder.description)}
                </Text>
              )}
              {workorder.workorderLines?.length > 0 && (
                <View style={{ backgroundColor: "gray", borderRadius: 10, paddingHorizontal: 5, paddingVertical: 1, marginLeft: 6 }}>
                  <Text style={{ color: "white", fontSize: 11, fontWeight: "600" }}>
                    {workorder.workorderLines.length}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Right: date + status */}
          <View style={{ alignItems: "flex-end", marginLeft: 6 }}>
            <Text style={{ color: "dimgray", fontSize: 12 }}>
              {(() => {
                let d = new Date(workorder.startedOnMillis);
                let h = d.getHours() % 12 || 12;
                let m = d.getMinutes();
                return h + ":" + (m < 10 ? "0" : "") + m + "  ";
              })()}
              {formatMillisForDisplay(
                workorder.startedOnMillis,
                new Date(workorder.startedOnMillis).getFullYear() !== new Date().getFullYear()
              )}
            </Text>
            <View
              style={{
                backgroundColor: rs.backgroundColor,
                flexDirection: "row",
                paddingHorizontal: 8,
                paddingVertical: 2,
                alignItems: "center",
                borderRadius: 10,
                marginTop: 2,
              }}
            >
              {!!wipUser && (
                <Text style={{ color: C.red, fontSize: 10, fontStyle: "italic", marginRight: 4 }}>{wipUser}</Text>
              )}
              <Text style={{ color: rs.textColor, fontSize: 12, fontWeight: "normal" }}>
                {rs.label}
              </Text>
            </View>
          </View>
        </View>

        {/* Wait time estimate row (bottom) */}
        {!waitInfo.isMissing && !!waitInfo.waitEndDay && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginTop: 2,
              paddingTop: 2,
              borderTopWidth: 1,
              borderTopColor: gray(0.92),
            }}
          >
            <Image_ icon={ICONS.clock} size={12} style={{ marginRight: 4 }} />
            <Text style={{ color: waitInfo.textColor, fontSize: 12 }}>
              {waitInfo.waitEndDay.replace("\n", " ")}
            </Text>
          </View>
        )}

        {/* Part ordered / source row */}
        {!!(workorder.partOrdered || workorder.partSource) && (
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2, paddingTop: 2, borderTopWidth: 1, borderTopColor: gray(0.92) }}>
            {!!workorder.partOrdered && (
              <Text numberOfLines={1} style={{ fontSize: 12, color: C.blue, fontWeight: "500" }}>
                {capitalizeFirstLetterOfString(workorder.partOrdered)}
              </Text>
            )}
            {!!(workorder.partOrdered && workorder.partSource) && (
              <View style={{ width: 5, height: 2, marginHorizontal: 4, backgroundColor: "lightgray" }} />
            )}
            {!!workorder.partSource && (
              <Text numberOfLines={1} style={{ fontSize: 12, color: C.orange }}>
                {capitalizeFirstLetterOfString(workorder.partSource)}
              </Text>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

////////////////////////////////////////////////////////////////////////////////
// Workorder Detail Modal
////////////////////////////////////////////////////////////////////////////////

function WorkorderDetailModal({ workorder, zSettings, onClose }) {
  let customerName = workorder.customerID
    ? `${capitalizeFirstLetterOfString(workorder.customerFirst || "")} ${capitalizeFirstLetterOfString(workorder.customerLast || "")}`.trim()
    : "Walk-in";
  let { runningTotal, runningQty } = calculateRunningTotals(workorder);
  let statusObj = resolveStatus(workorder.status, zSettings?.statuses);
  let statusColor = statusObj?.backgroundColor || C.green;

  const [sViewMedia, _setViewMedia] = useState(null);
  const [sUploading, _setUploading] = useState(false);
  const uploadInputRef = useRef(null);
  const zUploadProgress = useUploadProgressStore((s) => s.progress);

  function handleStatusSelect(val) {
    useOpenWorkordersStore.getState().setField("status", val.id, workorder.id);
  }

  function handleUploadPress() {
    if (uploadInputRef.current) uploadInputRef.current.click();
  }

  function handleFileChange(e) {
    let files = Array.from(e.target.files);
    if (!files.length) return;
    if (uploadInputRef.current) uploadInputRef.current.value = "";
    doUpload(files);
  }

  async function doUpload(files) {
    _setUploading(true);
    let total = files.length;
    let completed = 0;
    let failed = 0;
    useUploadProgressStore.getState().setProgress({ completed: 0, total, failed: 0, done: false });
    let newMedia = [...(workorder?.media || [])];
    let storeName = (zSettings?.storeInfo?.displayName || "photo").replace(/\s+/g, "_");
    for (let i = 0; i < files.length; i++) {
      let fileToUpload = files[i];
      let originalFilename = fileToUpload.name;
      let originalFileSize = fileToUpload.size;
      let ext = fileToUpload.name.split(".").pop() || "jpg";
      let rand = Math.floor(1000 + Math.random() * 9000);
      let typeLabel = fileToUpload.type.startsWith("video") ? "Video" : "Image";
      let cleanName = `${storeName}_${typeLabel}_${rand}.${ext}`;
      if (fileToUpload.type.startsWith("image")) {
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
      const result = await dbUploadWorkorderMedia(workorder.id, fileToUpload, { originalFilename, originalFileSize });
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
    _setUploading(false);
    setTimeout(() => useUploadProgressStore.getState().setProgress(null), failed > 0 ? 5000 : 3000);
  }

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: C.backgroundWhite,
      }}
    >
      {/* Header with back button */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: C.buttonLightGreen,
          borderBottomWidth: 1,
          borderBottomColor: C.buttonLightGreenOutline,
        }}
      >
        <TouchableOpacity
          onPress={onClose}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 8,
            paddingRight: 16,
          }}
        >
          <Image_ icon={ICONS.backRed} size={20} />
          <Text style={{ color: C.text, fontSize: 17, marginLeft: 8, fontWeight: "500" }}>
            Back
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16 }}
      >
        {/* Customer + Status */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 21, fontWeight: "700", color: C.text }}>{customerName}</Text>
            {workorder.cell ? (
              <Text style={{ fontSize: 15, color: gray(0.45), marginTop: 2 }}>
                {formatPhoneWithDashes(workorder.cell)}
              </Text>
            ) : null}
          </View>
          <StatusPickerModal
            statuses={(zSettings?.statuses || []).filter((s) => !s.systemOwned && !s.hidden)}
            enabled={true}
            onSelect={handleStatusSelect}
            buttonStyle={{
              backgroundColor: statusColor,
              paddingHorizontal: 10,
            }}
          />
        </View>

        {/* Media upload */}
        <View
          style={{
            backgroundColor: C.listItemWhite,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: C.buttonLightGreenOutline,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
          {/* Header: MEDIA label + count + Add button */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: gray(0.45) }}>MEDIA</Text>
              {(workorder.media?.length > 0) && (
                <View style={{ backgroundColor: C.blue, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1, marginLeft: 6 }}>
                  <Text style={{ color: "white", fontSize: 13, fontWeight: "600" }}>{workorder.media.length}</Text>
                </View>
              )}
            </View>
            <TouchableOpacity
              onPress={handleUploadPress}
              disabled={sUploading}
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: C.blue,
                borderRadius: 6,
                paddingHorizontal: 12,
                paddingVertical: 6,
                opacity: sUploading ? 0.5 : 1,
              }}
            >
              <Text style={{ color: "white", fontSize: 15, fontWeight: "600" }}>+ Add</Text>
            </TouchableOpacity>
          </View>

          {/* Upload progress */}
          {zUploadProgress && !zUploadProgress.done && (
            <View style={{ marginBottom: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                <SmallLoadingIndicator text="" color={C.blue} />
                <Text style={{ fontSize: 14, color: gray(0.45), marginLeft: 6 }}>
                  Uploading {zUploadProgress.completed}/{zUploadProgress.total}...
                </Text>
              </View>
              <View style={{ height: 4, borderRadius: 2, backgroundColor: gray(0.9) }}>
                <View
                  style={{
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: C.blue,
                    width: ((zUploadProgress.completed / zUploadProgress.total) * 100) + "%",
                  }}
                />
              </View>
            </View>
          )}

          {/* Upload complete message */}
          {zUploadProgress && zUploadProgress.done && (
            <View style={{ marginBottom: 8 }}>
              <Text style={{ fontSize: 14, color: zUploadProgress.failed > 0 ? C.red : C.green, fontWeight: "500" }}>
                {zUploadProgress.failed > 0
                  ? `Uploaded ${zUploadProgress.completed}/${zUploadProgress.total} (${zUploadProgress.failed} failed)`
                  : `${zUploadProgress.completed} file${zUploadProgress.completed > 1 ? "s" : ""} uploaded`}
              </Text>
            </View>
          )}

          {/* Thumbnail grid */}
          {workorder.media?.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {workorder.media.map((item) => {
                let isVideo = item.type === "video";
                return (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => _setViewMedia(item)}
                    style={{
                      width: "31%",
                      aspectRatio: 1,
                      borderRadius: 6,
                      overflow: "hidden",
                      backgroundColor: gray(0.95),
                    }}
                  >
                    <img
                      src={item.thumbnailUrl || item.url}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                    {isVideo && (
                      <View
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: "rgba(0,0,0,0.25)",
                        }}
                      >
                        <Text style={{ color: "white", fontSize: 26 }}>{"\u25B6"}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <Text style={{ fontSize: 15, color: gray(0.5) }}>No photos or videos yet</Text>
          )}
        </View>

        {/* Bike info */}
        {(workorder.brand || workorder.model) && (
          <View
            style={{
              backgroundColor: C.listItemWhite,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: C.buttonLightGreenOutline,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: gray(0.45), marginBottom: 4 }}>BIKE</Text>
            <Text style={{ fontSize: 16, color: C.text }}>
              {[workorder.brand, workorder.model].filter(Boolean).join(" ")}
            </Text>
          </View>
        )}

        {/* Line items */}
        <View
          style={{
            backgroundColor: C.listItemWhite,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: C.buttonLightGreenOutline,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "600", color: gray(0.45), marginBottom: 8 }}>
            ITEMS ({runningQty})
          </Text>
          {(workorder.workorderLines || []).map((line, idx) => {
            let name = line.inventoryItem?.formalName || line.inventoryItem?.informalName || "Item";
            let lineTotal = (line.inventoryItem?.price || 0) * (line.qty || 1);
            return (
              <View
                key={line.id || idx}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingVertical: 6,
                  borderBottomWidth: idx < workorder.workorderLines.length - 1 ? 1 : 0,
                  borderBottomColor: gray(0.9),
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, color: C.text }}>{name}</Text>
                  {line.qty > 1 && (
                    <Text style={{ fontSize: 13, color: gray(0.5) }}>Qty: {line.qty}</Text>
                  )}
                </View>
                <Text style={{ fontSize: 15, color: C.text, fontWeight: "500" }}>
                  {formatCurrencyDisp(lineTotal, true)}
                </Text>
              </View>
            );
          })}
          {(!workorder.workorderLines || workorder.workorderLines.length === 0) && (
            <Text style={{ fontSize: 15, color: gray(0.5) }}>No items</Text>
          )}
        </View>

        {/* Notes */}
        {workorder.notes ? (
          <View
            style={{
              backgroundColor: C.listItemWhite,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: C.buttonLightGreenOutline,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: gray(0.45), marginBottom: 4 }}>NOTES</Text>
            <Text style={{ fontSize: 15, color: C.text }}>{workorder.notes}</Text>
          </View>
        ) : null}

        {/* Total */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            paddingVertical: 12,
            paddingHorizontal: 4,
          }}
        >
          <Text style={{ fontSize: 17, fontWeight: "600", color: C.text }}>Total</Text>
          <Text style={{ fontSize: 17, fontWeight: "700", color: C.text }}>
            {formatCurrencyDisp(runningTotal, true)}
          </Text>
        </View>
      </ScrollView>

      {/* Full-size media viewer */}
      {sViewMedia && (
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => _setViewMedia(null)}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.9)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Close button */}
          <TouchableOpacity
            onPress={() => _setViewMedia(null)}
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              zIndex: 2,
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: "rgba(255,255,255,0.2)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "white", fontSize: 20, fontWeight: "700" }}>{"\u2715"}</Text>
          </TouchableOpacity>

          {sViewMedia.type === "video" ? (
            <video
              src={sViewMedia.url}
              controls
              autoPlay
              style={{ width: "95%", maxHeight: "85%", objectFit: "contain" }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <img
              src={sViewMedia.url}
              alt=""
              style={{ width: "95%", maxHeight: "85%", objectFit: "contain" }}
              onClick={(e) => e.stopPropagation()}
            />
          )}

          {/* Filename */}
          <Text style={{ color: gray(0.6), fontSize: 12, marginTop: 8 }}>
            {sViewMedia.originalFilename || sViewMedia.filename || ""}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

////////////////////////////////////////////////////////////////////////////////
// Helpers
////////////////////////////////////////////////////////////////////////////////

const NUM_MILLIS_IN_DAY = 86400000;

function sortWorkorders(inputArr) {
  let finalArr = [];
  const statuses = useSettingsStore.getState().settings?.statuses || [];
  statuses.forEach((status) => {
    let arr = [];
    inputArr.forEach((wo) => {
      if (wo.status === status.id) arr.push(wo);
    });
    arr.sort((a, b) => {
      let aHasWait = !!(a.waitTime?.maxWaitTimeDays != null && a.startedOnMillis);
      let bHasWait = !!(b.waitTime?.maxWaitTimeDays != null && b.startedOnMillis);
      if (!aHasWait && bHasWait) return -1;
      if (aHasWait && !bHasWait) return 1;
      if (!aHasWait && !bHasWait) return 0;
      let aDue = a.startedOnMillis + a.waitTime.maxWaitTimeDays * NUM_MILLIS_IN_DAY;
      let bDue = b.startedOnMillis + b.waitTime.maxWaitTimeDays * NUM_MILLIS_IN_DAY;
      return aDue - bDue;
    });
    finalArr = [...finalArr, ...arr];
  });

  const currentUser = useLoginStore.getState().getCurrentUser();
  const userStatusIDs = currentUser?.statuses || [];
  if (userStatusIDs.length > 0) {
    finalArr.sort((a, b) => {
      let aMatch = userStatusIDs.includes(a.status);
      let bMatch = userStatusIDs.includes(b.status);
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
      return 0;
    });
  }

  finalArr.sort((a, b) => {
    let aIsSender = a.lastSMSSenderUserID && a.lastSMSSenderUserID === currentUser?.id;
    let bIsSender = b.lastSMSSenderUserID && b.lastSMSSenderUserID === currentUser?.id;
    if (aIsSender && !bIsSender) return -1;
    if (!aIsSender && bIsSender) return 1;
    return 0;
  });

  const now = new Date();
  const todayMonth = now.getMonth() + 1;
  const todayDay = now.getDate();
  finalArr.sort((a, b) => {
    const aIsToday = (a.status === "pickup" || a.status === "delivery") &&
      Number(a.pickupDelivery?.month) === todayMonth &&
      Number(a.pickupDelivery?.day) === todayDay;
    const bIsToday = (b.status === "pickup" || b.status === "delivery") &&
      Number(b.pickupDelivery?.month) === todayMonth &&
      Number(b.pickupDelivery?.day) === todayDay;
    if (aIsToday && !bIsToday) return -1;
    if (!aIsToday && bIsToday) return 1;
    if (aIsToday && bIsToday) {
      if (a.status === "pickup" && b.status === "delivery") return -1;
      if (a.status === "delivery" && b.status === "pickup") return 1;
      return (a.pickupDelivery?.startTime || "").localeCompare(b.pickupDelivery?.startTime || "");
    }
    return 0;
  });

  return finalArr;
}

function computeWaitInfo(workorder, settings) {
  let label = calculateWaitEstimateLabel(workorder, settings);
  let result = { waitEndDay: "", textColor: C.text, isMissing: false };
  if (!label) return result;
  if (label === "Missing estimate") { result.isMissing = true; return result; }
  if (label === "No estimate") { result.waitEndDay = label; return result; }
  let lowerLabel = label.toLowerCase();
  if (lowerLabel.includes("today") || lowerLabel.includes("overdue")) result.textColor = "red";
  else if (lowerLabel.includes("tomorrow")) result.textColor = C.green;
  if (lowerLabel.startsWith("overdue ")) {
    let after = label.substring(8);
    if (after.toLowerCase() === "yesterday") after = "Yesterday";
    result.waitEndDay = "Overdue\n" + after;
    return result;
  }
  if (lowerLabel.includes("today")) {
    let parts = label.split(/\s+(today)/i);
    result.waitEndDay = parts[0]?.trim() ? parts[0].trim() + "\nToday" : "Today";
    return result;
  }
  if (lowerLabel.includes("tomorrow")) {
    let parts = label.split(/\s+(tomorrow)/i);
    result.waitEndDay = parts[0]?.trim() ? parts[0].trim() + "\nTomorrow" : "Tomorrow";
    return result;
  }
  let dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  for (let day of dayNames) {
    if (label.endsWith(day) && label.length > day.length) {
      result.waitEndDay = label.slice(0, label.length - day.length).trim() + "\n" + day;
      return result;
    }
  }
  result.waitEndDay = label;
  return result;
}

