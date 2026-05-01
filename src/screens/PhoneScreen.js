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
  removeDashesFromPhone,
  checkInputForNumbersOnly,
  calculateRunningTotals,
  calculateWaitEstimateLabel,
  lightenRGBByPercent,
  compressImage,
  log,
} from "../utils";
import { dbUploadWorkorderMedia, dbGetCustomer, dbSaveCustomer, dbListenToOpenWorkorders } from "../db_calls_wrapper";
import { Image_, AlertBox_, SmallLoadingIndicator, TextInput_, CheckBox_, DropdownMenu, StatusPickerModal } from "../components";
import { StandKeypad } from "../shared/StandKeypad";
import { FACE_DESCRIPTOR_CONFIDENCE_DISTANCE, MILLIS_IN_DAY } from "../constants";
import { COLORS, NONREMOVABLE_WAIT_TIMES } from "../data";
import { cloneDeep } from "lodash";
import { openCacheDB, clearStaleCache, loadModelCached } from "../faceDetection";

const LOCAL_STORAGE_KEY = "warpspeed_phone_user_id";

const PHONE_CUSTOMER_INPUT_STYLE = {
  width: "100%",
  height: 38,
  borderColor: gray(0.08),
  borderWidth: 1,
  marginTop: 10,
  paddingHorizontal: 8,
  outlineWidth: 0,
  borderRadius: 7,
  fontSize: 14,
};

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

  useEffect(() => {
    let unsub = dbListenToOpenWorkorders((data) => {
      useOpenWorkordersStore.getState().setOpenWorkorders(data);
    });
    return () => { if (typeof unsub === "function") unsub(); };
  }, []);

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
                <Text numberOfLines={1} style={{ fontSize: 13, color: C.text, flexShrink: 1 }}>
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

        {/* Bike not here badge + wait time estimate row */}
        {(workorder.itemNotHere || (!waitInfo.isMissing && !!waitInfo.waitEndDay)) && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 2,
              paddingTop: 2,
            }}
          >
            {!!workorder.itemNotHere ? (
              <View style={{ backgroundColor: "rgb(255, 243, 176)", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 1 }}>
                <Text style={{ color: "rgb(90, 75, 0)", fontSize: 11, fontWeight: "600" }}>Item not here</Text>
              </View>
            ) : <View />}
            {!waitInfo.isMissing && !!waitInfo.waitEndDay && (
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Image_ icon={ICONS.clock} size={12} style={{ marginRight: 4 }} />
                <Text style={{ color: waitInfo.textColor, fontSize: 12 }}>
                  {waitInfo.waitEndDay.replace("\n", " ")}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Part ordered / source row */}
        {!!(workorder.partOrdered || workorder.partSource) && (
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2, paddingTop: 2, borderTopWidth: 1, borderTopColor: "lightgray" }}>
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
  let rs = resolveStatus(workorder.status, zSettings?.statuses);

  const [sViewMedia, _setViewMedia] = useState(null);
  const [sUploading, _setUploading] = useState(false);
  const uploadInputRef = useRef(null);
  const zUploadProgress = useUploadProgressStore((s) => s.progress);
  const zShowAlert = useAlertScreenStore((s) => s.showAlert);

  const [sCustomerOpen, _setCustomerOpen] = useState(false);
  const [sCustomerEditing, _setCustomerEditing] = useState(false);
  const [sCustomer, _setCustomer] = useState(null);
  const [sCustomerLoading, _setCustomerLoading] = useState(false);
  const [sBikeEditing, _setBikeEditing] = useState(false);
  const [sOrderingOpen, _setOrderingOpen] = useState(
    !!(workorder.partOrdered || workorder.partSource || workorder.trackingNumber || workorder.partOrderEstimateMillis)
  );
  const [sWaitDays, _setWaitDays] = useState(() => {
    if (!workorder.partOrderEstimateMillis || !workorder.partOrderedMillis) return 0;
    return Math.max(0, Math.round((workorder.partOrderEstimateMillis - workorder.partOrderedMillis) / MILLIS_IN_DAY));
  });
  const waitDaysTimerRef = useRef(null);

  function setField(fieldName, val) {
    useOpenWorkordersStore.getState().setField(fieldName, val, workorder.id);
  }

  function handleStatusSelect(val) {
    setField("status", val.id);
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
    setField(fieldName, newColorObj);
  }

  function updateWaitDays(newDays) {
    _setWaitDays(newDays);
    clearTimeout(waitDaysTimerRef.current);
    waitDaysTimerRef.current = setTimeout(() => {
      let now = Date.now();
      useOpenWorkordersStore.getState().setField("partOrderedMillis", now, workorder.id, false);
      setField("partOrderEstimateMillis", now + (newDays * MILLIS_IN_DAY));
    }, 700);
  }

  function handleToggleCustomer() {
    if (!workorder.customerID) return;
    const opening = !sCustomerOpen;
    _setCustomerOpen(opening);
    if (opening && !sCustomer) {
      _setCustomerLoading(true);
      dbGetCustomer(workorder.customerID).then((c) => {
        _setCustomer(c);
        _setCustomerLoading(false);
      }).catch(() => _setCustomerLoading(false));
    }
  }

  const CUSTOMER_TO_WORKORDER_FIELDS = {
    first: "customerFirst",
    last: "customerLast",
    customerCell: "customerCell",
    customerLandline: "customerLandline",
    email: "customerEmail",
  };

  function saveCustomerField(fieldName, val) {
    _setCustomer((prev) => {
      const updated = { ...prev, [fieldName]: val };
      dbSaveCustomer(updated);
      const woField = CUSTOMER_TO_WORKORDER_FIELDS[fieldName];
      if (woField) {
        const allWOs = useOpenWorkordersStore.getState().getWorkorders() || [];
        allWOs
          .filter((wo) => wo.customerID === prev.id)
          .forEach((wo) => {
            useOpenWorkordersStore.getState().setField(woField, val, wo.id);
          });
      }
      return updated;
    });
  }

  function buildFullAddress(customer) {
    let parts = [];
    if (customer.streetAddress) parts.push(customer.streetAddress);
    if (customer.unit) parts.push(customer.unit);
    if (customer.city) parts.push(customer.city);
    if (customer.state) parts.push(customer.state);
    if (customer.zip) parts.push(customer.zip);
    return parts.join(", ");
  }

  function handleAddressPress() {
    if (!sCustomer) return;
    const dest = buildFullAddress(sCustomer);
    if (!dest) return;
    const storeInfo = zSettings?.storeInfo || {};
    let originParts = [];
    if (storeInfo.street) originParts.push(storeInfo.street);
    if (storeInfo.city) originParts.push(storeInfo.city);
    if (storeInfo.state) originParts.push(storeInfo.state);
    if (storeInfo.zip) originParts.push(storeInfo.zip);
    const origin = originParts.join(", ");
    const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}`;
    window.open(url, "_blank");
  }

  function handleCellPress(phone) {
    const formatted = formatPhoneWithDashes(phone);
    navigator.clipboard.writeText(phone).catch(() => {});
    useAlertScreenStore.getState().setValues({
      title: "Phone Number Copied",
      message: formatted + " has been copied to your clipboard. Select a dialer to open:",
      btn1Text: "VONAGE",
      btn2Text: "PHONE DIALER",
      handleBtn1Press: () => {
        window.open("https://app.vonage.com", "_blank");
      },
      handleBtn2Press: () => {
        window.open("tel:" + phone);
      },
      showAlert: true,
      canExitOnOuterClick: true,
    });
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
        {/* Customer name + accordion */}
        <View style={{ marginBottom: 16 }}>
          <TouchableOpacity
            onPress={handleToggleCustomer}
            activeOpacity={workorder.customerID ? 0.6 : 1}
            style={{ flexDirection: "row", alignItems: "center" }}
          >
            <Text style={{ fontSize: 21, fontWeight: "700", color: C.text, flex: 1 }}>{customerName}</Text>
            {workorder.customerID ? (
              <Image_
                icon={ICONS.downChevron}
                size={14}
                style={{ transform: [{ rotate: sCustomerOpen ? "-90deg" : "0deg" }], marginLeft: 8 }}
              />
            ) : null}
          </TouchableOpacity>

          {sCustomerOpen && workorder.customerID ? (
            <View style={{ marginTop: 12, backgroundColor: C.listItemWhite, borderRadius: 10, borderWidth: 1, borderColor: C.buttonLightGreenOutline, padding: 12 }}>
              {sCustomerLoading ? (
                <SmallLoadingIndicator />
              ) : sCustomer ? (
                <View>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: gray(0.45) }}>CUSTOMER INFO</Text>
                    <TouchableOpacity onPress={() => _setCustomerEditing(!sCustomerEditing)} style={{ padding: 4 }}>
                      <Image_ icon={ICONS.editPencil} size={18} />
                    </TouchableOpacity>
                  </View>

                  {sCustomerEditing ? (
                    <View>
                      <TextInput_
                        value={capitalizeFirstLetterOfString(sCustomer.first || "")}
                        onChangeText={(val) => saveCustomerField("first", capitalizeFirstLetterOfString(val))}
                        placeholder="First name"
                        capitalize={true}
                        style={PHONE_CUSTOMER_INPUT_STYLE}
                      />
                      <TextInput_
                        value={capitalizeFirstLetterOfString(sCustomer.last || "")}
                        onChangeText={(val) => saveCustomerField("last", capitalizeFirstLetterOfString(val))}
                        placeholder="Last name"
                        capitalize={true}
                        style={PHONE_CUSTOMER_INPUT_STYLE}
                      />
                      <TextInput_
                        value={formatPhoneWithDashes(sCustomer.customerCell || "")}
                        onChangeText={(val) => {
                          val = removeDashesFromPhone(val);
                          if (val.length > 10) return;
                          saveCustomerField("customerCell", val);
                        }}
                        placeholder="Cell phone"
                        style={PHONE_CUSTOMER_INPUT_STYLE}
                      />
                      <TextInput_
                        value={formatPhoneWithDashes(sCustomer.customerLandline || "")}
                        onChangeText={(val) => {
                          val = removeDashesFromPhone(val);
                          if (val.length > 10) return;
                          saveCustomerField("customerLandline", val);
                        }}
                        placeholder="Landline"
                        style={PHONE_CUSTOMER_INPUT_STYLE}
                      />
                      <TextInput_
                        value={sCustomer.email || ""}
                        onChangeText={(val) => saveCustomerField("email", val)}
                        placeholder="Email"
                        style={PHONE_CUSTOMER_INPUT_STYLE}
                      />
                      <TextInput_
                        value={capitalizeFirstLetterOfString(sCustomer.streetAddress || "")}
                        onChangeText={(val) => saveCustomerField("streetAddress", capitalizeFirstLetterOfString(val))}
                        placeholder="Street address"
                        capitalize={true}
                        style={PHONE_CUSTOMER_INPUT_STYLE}
                      />
                      <TextInput_
                        value={capitalizeFirstLetterOfString(sCustomer.city || "")}
                        onChangeText={(val) => saveCustomerField("city", capitalizeFirstLetterOfString(val))}
                        placeholder="City"
                        capitalize={true}
                        style={PHONE_CUSTOMER_INPUT_STYLE}
                      />
                      <TextInput_
                        value={(sCustomer.state || "").toUpperCase()}
                        onChangeText={(val) => saveCustomerField("state", val.toUpperCase())}
                        placeholder="State"
                        style={PHONE_CUSTOMER_INPUT_STYLE}
                      />
                      <TextInput_
                        value={sCustomer.zip || ""}
                        onChangeText={(val) => {
                          if (!checkInputForNumbersOnly(val)) return;
                          saveCustomerField("zip", val);
                        }}
                        placeholder="Zip code"
                        style={PHONE_CUSTOMER_INPUT_STYLE}
                      />
                      <TextInput_
                        value={capitalizeFirstLetterOfString(sCustomer.addressNotes || "")}
                        onChangeText={(val) => saveCustomerField("addressNotes", capitalizeFirstLetterOfString(val))}
                        placeholder="Address notes"
                        multiline={true}
                        numberOfLines={3}
                        capitalize={true}
                        style={{ ...PHONE_CUSTOMER_INPUT_STYLE, height: undefined, minHeight: 40, paddingVertical: 8 }}
                      />
                    </View>
                  ) : (
                    <View>
                      {sCustomer.first || sCustomer.last ? (
                        <Text style={{ fontSize: 15, color: C.text, marginBottom: 4 }}>
                          {capitalizeFirstLetterOfString(sCustomer.first || "")} {capitalizeFirstLetterOfString(sCustomer.last || "")}
                        </Text>
                      ) : null}
                      {sCustomer.customerCell ? (
                        <TouchableOpacity onPress={() => handleCellPress(sCustomer.customerCell)} style={{ marginBottom: 3 }}>
                          <Text style={{ fontSize: 14, color: C.blue, textDecorationLine: "underline" }}>
                            Cell: {formatPhoneWithDashes(sCustomer.customerCell)}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                      {sCustomer.customerLandline ? (
                        <Text style={{ fontSize: 14, color: gray(0.4), marginBottom: 3 }}>
                          Landline: {formatPhoneWithDashes(sCustomer.customerLandline)}
                        </Text>
                      ) : null}
                      {sCustomer.email ? (
                        <Text style={{ fontSize: 14, color: gray(0.4), marginBottom: 3 }}>
                          {sCustomer.email}
                        </Text>
                      ) : null}
                      {buildFullAddress(sCustomer) ? (
                        <TouchableOpacity onPress={handleAddressPress} style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                          <Image_ icon={ICONS.map} size={16} style={{ marginRight: 6 }} />
                          <Text style={{ fontSize: 14, color: C.blue, textDecorationLine: "underline" }}>
                            {buildFullAddress(sCustomer)}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                      {sCustomer.addressNotes ? (
                        <Text style={{ fontSize: 13, color: gray(0.5), marginTop: 4, fontStyle: "italic" }}>
                          {sCustomer.addressNotes}
                        </Text>
                      ) : null}
                    </View>
                  )}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* Status picker */}
        <View style={{ marginBottom: 12, alignItems: "center" }}>
          <StatusPickerModal
            statuses={(zSettings?.statuses || []).filter((s) => !s.systemOwned && !s.hidden)}
            enabled={true}
            onSelect={handleStatusSelect}
            menuWidth={Math.round(window.innerWidth * 0.6)}
            centered={true}
            buttonStyle={{
              alignSelf: "flex-start",
              backgroundColor: rs.backgroundColor,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 8,
            }}
            buttonTextStyle={{
              color: rs.textColor,
              fontWeight: "500",
              fontSize: 14,
            }}
            buttonText={rs.label}
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
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: C.blue,
                borderRadius: 6,
                paddingHorizontal: 12,
                paddingVertical: 6,
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

        {/* Bike + workorder info */}
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
          {/* Edit toggle */}
          <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: 4 }}>
            <TouchableOpacity onPress={() => _setBikeEditing(!sBikeEditing)} style={{ padding: 4 }}>
              <Image_ icon={ICONS.editPencil} size={18} />
            </TouchableOpacity>
          </View>

          {sBikeEditing ? (
            <View>
              {/* Brand */}
              <Text style={{ fontSize: 11, color: gray(0.45), marginBottom: 2 }}>Brand</Text>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                <TextInput_
                  value={capitalizeFirstLetterOfString(workorder.brand || "")}
                  onChangeText={(val) => setField("brand", capitalizeFirstLetterOfString(val))}
                  placeholder="Brand"
                  capitalize={true}
                  style={{ ...PHONE_CUSTOMER_INPUT_STYLE, flex: 1, marginTop: 0 }}
                />
                <DropdownMenu
                  dataArr={zSettings.bikeBrands}
                  onSelect={(item) => setField("brand", item)}
                  buttonText={zSettings.bikeBrandsName || "Bikes"}
                  buttonStyle={{ marginLeft: 6, paddingHorizontal: 8 }}
                />
                {zSettings.bikeOptionalBrands?.length > 0 && (
                  <DropdownMenu
                    dataArr={zSettings.bikeOptionalBrands}
                    onSelect={(item) => setField("brand", item)}
                    buttonText={zSettings.bikeOptionalBrandsName || "Other"}
                    buttonStyle={{ marginLeft: 4, paddingHorizontal: 8 }}
                  />
                )}
              </View>

              {/* Description */}
              <Text style={{ fontSize: 11, color: gray(0.45), marginBottom: 2 }}>Description</Text>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                <TextInput_
                  value={capitalizeFirstLetterOfString(workorder.description || "")}
                  onChangeText={(val) => setField("description", capitalizeFirstLetterOfString(val))}
                  placeholder="Description"
                  capitalize={true}
                  style={{ ...PHONE_CUSTOMER_INPUT_STYLE, flex: 1, marginTop: 0 }}
                />
                <DropdownMenu
                  dataArr={zSettings.bikeDescriptions}
                  onSelect={(item) => setField("description", item)}
                  buttonText="Descriptions"
                  buttonStyle={{ marginLeft: 6, paddingHorizontal: 8 }}
                />
              </View>

              {/* Colors */}
              <Text style={{ fontSize: 11, color: gray(0.45), marginBottom: 2 }}>Colors</Text>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
                  <TextInput_
                    value={workorder.color1?.label || ""}
                    onChangeText={(val) => setBikeColor(val, "color1")}
                    placeholder="Color 1"
                    style={{
                      ...PHONE_CUSTOMER_INPUT_STYLE,
                      flex: 1,
                      marginTop: 0,
                      backgroundColor: workorder.color1?.backgroundColor || undefined,
                      color: workorder.color1?.textColor || C.text,
                    }}
                  />
                  <DropdownMenu
                    dataArr={COLORS}
                    itemSeparatorStyle={{ height: 0 }}
                    menuBorderColor="transparent"
                    centerMenuVertically={true}
                    centerMenuHorizontally={true}
                    menuMaxHeight={Math.round(window.innerHeight * 0.9)}
                    onSelect={(item) => setField("color1", item)}
                    buttonText="1"
                    buttonStyle={{ marginLeft: 4, paddingHorizontal: 8 }}
                  />
                </View>
                <View style={{ width: 8 }} />
                <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
                  <TextInput_
                    value={workorder.color2?.label || ""}
                    onChangeText={(val) => setBikeColor(val, "color2")}
                    placeholder="Color 2"
                    style={{
                      ...PHONE_CUSTOMER_INPUT_STYLE,
                      flex: 1,
                      marginTop: 0,
                      backgroundColor: workorder.color2?.backgroundColor || undefined,
                      color: workorder.color2?.textColor || C.text,
                    }}
                  />
                  <DropdownMenu
                    dataArr={COLORS}
                    itemSeparatorStyle={{ height: 0 }}
                    menuBorderColor="transparent"
                    centerMenuVertically={true}
                    centerMenuHorizontally={true}
                    menuMaxHeight={Math.round(window.innerHeight * 0.9)}
                    onSelect={(item) => setField("color2", item)}
                    buttonText="2"
                    buttonStyle={{ marginLeft: 4, paddingHorizontal: 8 }}
                  />
                </View>
              </View>

              {/* Max wait */}
              <Text style={{ fontSize: 11, color: gray(0.45), marginBottom: 2 }}>Max wait (days)</Text>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                <TextInput_
                  value={String(workorder.waitTime?.maxWaitTimeDays ?? "")}
                  onChangeText={(val) => {
                    if (val && !checkInputForNumbersOnly(val, false)) return;
                    let waitObj = { ...(workorder.waitTime || {}), maxWaitTimeDays: val ? parseInt(val) : "" };
                    setField("waitTime", waitObj);
                  }}
                  placeholder="Days"
                  style={{ ...PHONE_CUSTOMER_INPUT_STYLE, width: 60, marginTop: 0 }}
                />
                <DropdownMenu
                  dataArr={zSettings.waitTimes}
                  onSelect={(item) => {
                    let isNonRemovable = NONREMOVABLE_WAIT_TIMES.some((nr) => nr.id === item.id);
                    let waitObj = { ...item, removable: !isNonRemovable };
                    setField("waitTime", waitObj);
                  }}
                  buttonText="Wait Times"
                  buttonStyle={{ marginLeft: 6, paddingHorizontal: 8 }}
                />
              </View>

              {/* Wait estimate display */}
              {(() => {
                let estimateLabel = calculateWaitEstimateLabel(workorder, zSettings);
                let isMissing = estimateLabel === "Missing estimate" || estimateLabel === "No estimate";
                return estimateLabel ? (
                  <Text style={{ fontSize: 13, fontStyle: "italic", color: isMissing ? C.red : gray(0.5), marginBottom: 6 }}>
                    {estimateLabel}
                  </Text>
                ) : null;
              })()}

              {/* Item not here */}
              <CheckBox_
                isChecked={!!workorder.itemNotHere}
                text="Item not here"
                textStyle={{ fontSize: 13 }}
                buttonStyle={{ backgroundColor: "transparent", marginBottom: 8 }}
                onCheck={() => setField("itemNotHere", !workorder.itemNotHere)}
              />

              {/* Ordering section */}
              <TouchableOpacity
                onPress={() => _setOrderingOpen(!sOrderingOpen)}
                style={{ flexDirection: "row", alignItems: "center", paddingVertical: 4, marginBottom: 4 }}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: gray(0.45) }}>ORDERING</Text>
                <Image_
                  icon={ICONS.downChevron}
                  size={10}
                  style={{ transform: [{ rotate: sOrderingOpen ? "0deg" : "-90deg" }], marginLeft: 6 }}
                />
              </TouchableOpacity>

              {sOrderingOpen && (
                <View>
                  {/* Part ordered */}
                  <Text style={{ fontSize: 11, color: gray(0.45), marginBottom: 2 }}>Item ordered</Text>
                  <TextInput_
                    value={capitalizeFirstLetterOfString(workorder.partOrdered || "")}
                    onChangeText={(val) => {
                      setField("partOrdered", val);
                      if (!workorder.partOrderedMillis) setField("partOrderedMillis", Date.now());
                    }}
                    placeholder="Item names/descriptions"
                    capitalize={true}
                    style={{ ...PHONE_CUSTOMER_INPUT_STYLE, marginTop: 0, marginBottom: 8 }}
                  />

                  {/* Part source */}
                  <Text style={{ fontSize: 11, color: gray(0.45), marginBottom: 2 }}>Source</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                    <TextInput_
                      value={capitalizeFirstLetterOfString(workorder.partSource || "")}
                      onChangeText={(val) => {
                        setField("partSource", val);
                        if (!workorder.partOrderedMillis) setField("partOrderedMillis", Date.now());
                      }}
                      placeholder="Item sources"
                      capitalize={true}
                      style={{ ...PHONE_CUSTOMER_INPUT_STYLE, flex: 1, marginTop: 0 }}
                    />
                    <DropdownMenu
                      dataArr={zSettings.partSources}
                      onSelect={(item) => {
                        setField("partSource", item);
                        setField("partOrderedMillis", Date.now());
                      }}
                      buttonText="Sources"
                      buttonStyle={{ marginLeft: 6, paddingHorizontal: 8 }}
                    />
                  </View>

                  {/* Delivery estimate */}
                  <Text style={{ fontSize: 11, color: gray(0.45), marginBottom: 4 }}>Est. delivery</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                    <TouchableOpacity
                      onPress={() => updateWaitDays(Math.max(0, sWaitDays - 1))}
                      style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: C.buttonLightGreen, justifyContent: "center", alignItems: "center" }}
                    >
                      <Text style={{ color: gray(0.55), fontSize: 16, fontWeight: "700", marginTop: -1 }}>{"\u2212"}</Text>
                    </TouchableOpacity>
                    <Text style={{ fontSize: 14, color: C.text, minWidth: 60, textAlign: "center" }}>
                      {sWaitDays + " days"}
                    </Text>
                    <TouchableOpacity
                      onPress={() => updateWaitDays(sWaitDays + 1)}
                      style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: C.buttonLightGreen, justifyContent: "center", alignItems: "center" }}
                    >
                      <Text style={{ color: gray(0.55), fontSize: 16, fontWeight: "700", marginTop: -1 }}>+</Text>
                    </TouchableOpacity>
                    {!!workorder.partOrderEstimateMillis && (
                      <Text style={{ fontSize: 13, color: gray(0.45), marginLeft: 8 }}>
                        {formatMillisForDisplay(workorder.partOrderEstimateMillis)}
                      </Text>
                    )}
                  </View>

                  {/* Ordered / Not ordered toggle */}
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => {
                      const newVal = !workorder.partToBeOrdered;
                      setField("partToBeOrdered", newVal);
                      setField("status", newVal ? "open" : "part_ordered");
                    }}
                    style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}
                  >
                    <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: workorder.partToBeOrdered ? C.red : C.green, justifyContent: "center", alignItems: "center", marginRight: 5 }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: workorder.partToBeOrdered ? C.red : C.green }} />
                    </View>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: workorder.partToBeOrdered ? C.red : C.green }}>
                      {workorder.partToBeOrdered ? "Not ordered" : "Ordered"}
                    </Text>
                  </TouchableOpacity>

                  {/* Tracking */}
                  <Text style={{ fontSize: 11, color: gray(0.45), marginBottom: 2 }}>Tracking</Text>
                  <TextInput_
                    value={workorder.trackingNumber || ""}
                    onChangeText={(val) => setField("trackingNumber", val)}
                    placeholder="Tracking num or website"
                    style={{ ...PHONE_CUSTOMER_INPUT_STYLE, marginTop: 0, marginBottom: 4 }}
                  />
                  {!!workorder.trackingNumber && (() => {
                    const val = workorder.trackingNumber.trim();
                    const isURL = /^https?:\/\/|^www\./i.test(val);
                    const openUrl = isURL && val.startsWith("www.") ? "https://" + val : val;
                    return (
                      <TouchableOpacity
                        onPress={() => window.open(isURL ? openUrl : "https://parcelsapp.com/en/tracking/" + val, "_blank")}
                        style={{ marginBottom: 4 }}
                      >
                        <Text style={{ fontSize: 13, color: C.blue, textDecorationLine: "underline" }}>
                          {isURL ? "Open link" : "Track package"}
                        </Text>
                      </TouchableOpacity>
                    );
                  })()}
                </View>
              )}
            </View>
          ) : (
            <View>
              {/* Read-only view */}
              {/* Brand + description */}
              {(workorder.brand || workorder.description) ? (
                <View style={{ marginBottom: 6 }}>
                  {!!workorder.brand && (
                    <Text style={{ fontSize: 16, fontWeight: "600", color: C.text }}>
                      {capitalizeFirstLetterOfString(workorder.brand)}
                    </Text>
                  )}
                  {!!workorder.description && (
                    <Text style={{ fontSize: 14, color: gray(0.4), marginTop: 1 }}>
                      {capitalizeFirstLetterOfString(workorder.description)}
                    </Text>
                  )}
                </View>
              ) : null}

              {/* Colors */}
              {(workorder.color1?.label || workorder.color2?.label) ? (
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                  {!!workorder.color1?.label && (
                    <View style={{ flexDirection: "row", alignItems: "center", marginRight: 12 }}>
                      <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: workorder.color1.backgroundColor || gray(0.5), borderWidth: 1, borderColor: gray(0.8), marginRight: 5 }} />
                      <Text style={{ fontSize: 13, color: C.text }}>{workorder.color1.label}</Text>
                    </View>
                  )}
                  {!!workorder.color2?.label && (
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: workorder.color2.backgroundColor || gray(0.5), borderWidth: 1, borderColor: gray(0.8), marginRight: 5 }} />
                      <Text style={{ fontSize: 13, color: C.text }}>{workorder.color2.label}</Text>
                    </View>
                  )}
                </View>
              ) : null}

              {/* Wait estimate + item not here */}
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                {(() => {
                  let estimateLabel = calculateWaitEstimateLabel(workorder, zSettings);
                  let isMissing = estimateLabel === "Missing estimate" || estimateLabel === "No estimate";
                  return estimateLabel ? (
                    <Text style={{ fontSize: 13, fontStyle: "italic", color: isMissing ? C.red : gray(0.5) }}>
                      {estimateLabel}
                    </Text>
                  ) : <View />;
                })()}
                {!!workorder.itemNotHere && (
                  <View style={{ backgroundColor: "rgb(255, 243, 176)", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 1 }}>
                    <Text style={{ color: "rgb(90, 75, 0)", fontSize: 11, fontWeight: "600" }}>Item not here</Text>
                  </View>
                )}
              </View>

              {/* Max wait */}
              {!!workorder.waitTime?.maxWaitTimeDays && (
                <Text style={{ fontSize: 13, color: gray(0.45), marginBottom: 4 }}>
                  Max wait: {workorder.waitTime.maxWaitTimeDays} days
                </Text>
              )}

              {/* Ordering section - show/hide */}
              <TouchableOpacity
                onPress={() => _setOrderingOpen(!sOrderingOpen)}
                style={{ flexDirection: "row", alignItems: "center", marginTop: 6, paddingVertical: 4 }}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: gray(0.45) }}>ORDERING</Text>
                <Image_
                  icon={ICONS.downChevron}
                  size={10}
                  style={{ transform: [{ rotate: sOrderingOpen ? "0deg" : "-90deg" }], marginLeft: 6 }}
                />
              </TouchableOpacity>

              {sOrderingOpen && (
                <View style={{ marginTop: 6 }}>
                  {!!workorder.partOrdered && (
                    <View style={{ marginBottom: 6 }}>
                      <Text style={{ fontSize: 11, color: gray(0.45), marginBottom: 2 }}>Item ordered</Text>
                      <Text style={{ fontSize: 14, color: C.text }}>{capitalizeFirstLetterOfString(workorder.partOrdered)}</Text>
                    </View>
                  )}
                  {!!workorder.partSource && (
                    <View style={{ marginBottom: 6 }}>
                      <Text style={{ fontSize: 11, color: gray(0.45), marginBottom: 2 }}>Source</Text>
                      <Text style={{ fontSize: 14, color: C.text }}>{capitalizeFirstLetterOfString(workorder.partSource)}</Text>
                    </View>
                  )}
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    {!!workorder.partOrderEstimateMillis && (
                      <Text style={{ fontSize: 13, color: gray(0.45) }}>
                        Est. delivery: {formatMillisForDisplay(workorder.partOrderEstimateMillis)}
                      </Text>
                    )}
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: workorder.partToBeOrdered ? C.red : C.green, justifyContent: "center", alignItems: "center", marginRight: 4 }}>
                        <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: workorder.partToBeOrdered ? C.red : C.green }} />
                      </View>
                      <Text style={{ fontSize: 12, fontWeight: "600", color: workorder.partToBeOrdered ? C.red : C.green }}>
                        {workorder.partToBeOrdered ? "Not ordered" : "Ordered"}
                      </Text>
                    </View>
                  </View>
                  {!!workorder.trackingNumber && (
                    <View style={{ marginBottom: 4 }}>
                      <Text style={{ fontSize: 11, color: gray(0.45), marginBottom: 2 }}>Tracking</Text>
                      {(() => {
                        const val = workorder.trackingNumber.trim();
                        const isURL = /^https?:\/\/|^www\./i.test(val);
                        const openUrl = isURL && val.startsWith("www.") ? "https://" + val : val;
                        return (
                          <TouchableOpacity onPress={() => window.open(isURL ? openUrl : "https://parcelsapp.com/en/tracking/" + val, "_blank")}>
                            <Text style={{ fontSize: 14, color: C.blue, textDecorationLine: "underline" }} numberOfLines={2}>
                              {val}
                            </Text>
                          </TouchableOpacity>
                        );
                      })()}
                    </View>
                  )}
                </View>
              )}
            </View>
          )}
        </View>

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

      <AlertBox_ showAlert={zShowAlert} />
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

