/* eslint-disable */
import React, { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, ScrollView, Image } from "react-native-web";
import { useParams } from "react-router-dom";
import { compressImage, formatWorkorderNumber } from "../utils";

const CLOUD_FN_BASE = "https://us-central1-warpspeed-bonitabikes.cloudfunctions.net";

// ── Helpers ──

function t(translations, key, fallback) {
  return translations?.[key] || fallback;
}

function formatDate(millis) {
  if (!millis) return "";
  const d = new Date(millis);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Styles ──

const S = {
  page: {
    minHeight: "100vh",
    backgroundColor: "#f7f8fc",
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 12,
  },
  card: {
    width: "100%",
    maxWidth: 560,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 24,
    marginBottom: 16,
  },
  storeName: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1a202c",
    textAlign: "center",
    marginBottom: 4,
  },
  greeting: {
    fontSize: 15,
    color: "#718096",
    textAlign: "center",
    marginBottom: 20,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: "700",
    color: "#a0aec0",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 16,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 5,
  },
  label: {
    fontSize: 14,
    color: "#718096",
    fontWeight: "500",
  },
  value: {
    fontSize: 14,
    color: "#2d3748",
    fontWeight: "600",
    flexShrink: 1,
    textAlign: "right",
  },
  statusBadge: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: "center",
    marginBottom: 6,
  },
  statusText: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  estimateText: {
    fontSize: 13,
    color: "#718096",
    textAlign: "center",
    marginTop: 4,
  },
  colorSwatch: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginLeft: 6,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  bullet: {
    fontSize: 14,
    color: "#a0aec0",
    marginRight: 8,
  },
  itemName: {
    fontSize: 14,
    color: "#2d3748",
    flex: 1,
  },
  itemQty: {
    fontSize: 13,
    color: "#a0aec0",
    marginLeft: 8,
  },
  noteCard: {
    backgroundColor: "#f7fafc",
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
  },
  noteText: {
    fontSize: 13,
    color: "#4a5568",
    fontStyle: "italic",
  },
  divider: {
    height: 1,
    backgroundColor: "#edf2f7",
    marginVertical: 12,
  },
  thumbGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  thumb: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: "#edf2f7",
  },
  uploadBtn: {
    backgroundColor: "#ebf8ff",
    borderWidth: 1,
    borderColor: "#90cdf4",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignSelf: "center",
    marginTop: 12,
  },
  uploadBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#3182ce",
  },
  // Full-screen overlay
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
  },
  fullImg: {
    maxWidth: "90vw",
    maxHeight: "90vh",
    borderRadius: 4,
  },
  // Loading & error
  centerMsg: {
    flex: 1,
    minHeight: "100vh",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f7f8fc",
  },
  errorText: {
    fontSize: 16,
    color: "#e53e3e",
    textAlign: "center",
    maxWidth: 300,
  },
  loadingText: {
    fontSize: 16,
    color: "#718096",
  },
  // Progress
  progressBar: {
    height: 3,
    backgroundColor: "#90cdf4",
    borderRadius: 2,
    marginTop: 8,
  },
  progressText: {
    fontSize: 12,
    color: "#718096",
    textAlign: "center",
    marginTop: 4,
  },
};

// ── Component ──

export function CustomerWorkorderScreen() {
  const { pin } = useParams();
  const [sData, _setData] = useState(null);
  const [sLoading, _setLoading] = useState(true);
  const [sError, _setError] = useState("");
  const [sFullScreenMedia, _setFullScreenMedia] = useState(null);
  const [sUploading, _setUploading] = useState(false);
  const [sUploadProgress, _setUploadProgress] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!pin) {
      _setError("No PIN provided.");
      _setLoading(false);
      return;
    }
    fetchWorkorder(pin);
  }, [pin]);

  async function fetchWorkorder(pinCode) {
    _setLoading(true);
    _setError("");
    try {
      const res = await fetch(`${CLOUD_FN_BASE}/getCustomerWorkorder?pin=${encodeURIComponent(pinCode)}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        _setError(json.error || "Unable to load workorder.");
        _setLoading(false);
        return;
      }
      _setData(json.data);
    } catch (e) {
      _setError("Network error. Please try again.");
    }
    _setLoading(false);
  }

  async function handleUpload(files) {
    if (!files?.length || !sData?.pin) return;
    _setUploading(true);
    let total = files.length;
    let completed = 0;
    _setUploadProgress({ completed: 0, total });

    let newMedia = [...(sData.media || [])];

    for (let i = 0; i < files.length; i++) {
      let file = files[i];

      // Compress images client-side
      if (file.type.startsWith("image")) {
        let compressed = await compressImage(file, 1024, 0.65);
        if (compressed) file = new File([compressed], file.name, { type: "image/jpeg" });
      }

      // Convert to base64
      const base64 = await fileToBase64(file);

      try {
        const res = await fetch(`${CLOUD_FN_BASE}/customerUploadWorkorderMedia`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pin: sData.pin,
            fileBase64: base64,
            fileName: file.name,
            contentType: file.type,
          }),
        });
        const json = await res.json();
        if (json.success && json.data?.mediaItem) {
          newMedia.push(json.data.mediaItem);
        }
      } catch (e) {
        // Skip failed upload
      }
      completed++;
      _setUploadProgress({ completed, total });
    }

    _setData((prev) => ({ ...prev, media: newMedia }));
    _setUploading(false);
    _setUploadProgress(null);
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        // Strip the data:...;base64, prefix
        const base64 = result.split(",")[1] || result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ── Loading state ──
  if (sLoading) {
    return (
      <View style={S.centerMsg}>
        <Text style={S.loadingText}>Loading...</Text>
      </View>
    );
  }

  // ── Error state ──
  if (sError || !sData) {
    return (
      <View style={S.centerMsg}>
        <Text style={S.errorText}>{sError || "Workorder not found."}</Text>
      </View>
    );
  }

  const tr = sData.translations;
  const d = sData;

  return (
    <ScrollView contentContainerStyle={S.page}>
      {/* Store branding + greeting */}
      <View style={S.card}>
        {!!d.storeName && <Text style={S.storeName}>{d.storeName}</Text>}
        {!!d.storePhone && (
          <Text style={{ fontSize: 13, color: "#a0aec0", textAlign: "center", marginBottom: 12 }}>
            {d.storePhone}
          </Text>
        )}
        <Text style={S.greeting}>
          {d.customerFirst
            ? `${t(tr, "greeting", "Here's your workorder")}, ${d.customerFirst}!`
            : t(tr, "greeting", "Here's your workorder") + "!"}
        </Text>

        {/* Status badge */}
        <View
          style={[
            S.statusBadge,
            { backgroundColor: d.status?.backgroundColor || "#edf2f7" },
          ]}
        >
          <Text
            style={[
              S.statusText,
              { color: d.status?.textColor || "#2d3748" },
            ]}
          >
            {tr?.statusLabel || d.status?.label || ""}
          </Text>
        </View>

        {/* Wait time estimate */}
        {(!!d.waitTimeEstimateLabel || !!d.waitTime) && (
          <Text style={S.estimateText}>
            {t(tr, "estimatedReady", "Estimated ready")}: {d.waitTimeEstimateLabel || d.waitTime}
          </Text>
        )}
      </View>

      {/* Details card */}
      <View style={S.card}>
        {!!d.brand && (
          <View style={S.row}>
            <Text style={S.label}>{t(tr, "brand", "Brand")}</Text>
            <Text style={S.value}>{d.brand}</Text>
          </View>
        )}
        {!!d.description && (
          <View style={S.row}>
            <Text style={S.label}>{t(tr, "description", "Description")}</Text>
            <Text style={[S.value, { maxWidth: "60%" }]}>{d.description}</Text>
          </View>
        )}

        {/* Colors */}
        {(d.color1?.label || d.color2?.label) && (
          <View style={S.row}>
            <Text style={S.label}>{t(tr, "colors", "Colors")}</Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {!!d.color1?.backgroundColor && (
                <View style={[S.colorSwatch, { backgroundColor: d.color1.backgroundColor }]} />
              )}
              {!!d.color2?.backgroundColor && (
                <View style={[S.colorSwatch, { backgroundColor: d.color2.backgroundColor }]} />
              )}
            </View>
          </View>
        )}

        {/* Parts on order */}
        {!!d.partOrdered && (
          <>
            <View style={S.divider} />
            <View style={S.row}>
              <Text style={S.label}>{t(tr, "partsOnOrder", "Parts on Order")}</Text>
              <Text style={S.value}>{d.partOrdered}</Text>
            </View>
            {!!d.partEstimatedDelivery && (
              <View style={S.row}>
                <Text style={S.label}>{t(tr, "estDelivery", "Est. Delivery")}</Text>
                <Text style={S.value}>{d.partEstimatedDelivery}</Text>
              </View>
            )}
          </>
        )}
      </View>

      {/* Items */}
      {d.items?.length > 0 && (
        <View style={S.card}>
          <Text style={S.sectionHeader}>{t(tr, "items", "Items")}</Text>
          {d.items.map((item, i) => (
            <View key={i} style={S.itemRow}>
              <Text style={S.bullet}>•</Text>
              <Text style={S.itemName}>{item.name}</Text>
              {item.qty > 1 && <Text style={S.itemQty}>x{item.qty}</Text>}
            </View>
          ))}
        </View>
      )}

      {/* Customer notes */}
      {d.customerNotes?.length > 0 && (
        <View style={S.card}>
          <Text style={S.sectionHeader}>{t(tr, "notes", "Notes")}</Text>
          {d.customerNotes.map((note, i) => {
            const noteText = typeof note === "string" ? note : note?.text || note?.note || "";
            if (!noteText) return null;
            return (
              <View key={i} style={S.noteCard}>
                <Text style={S.noteText}>"{noteText}"</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Pricing */}
      {d.showPricing && (
        <View style={S.card}>
          <Text style={S.sectionHeader}>{t(tr, "total", "Total")}</Text>
          <View style={S.row}>
            <Text style={S.label}>{t(tr, "subtotal", "Subtotal")}</Text>
            <Text style={S.value}>{d.subtotal}</Text>
          </View>
          {d.discount && d.discount !== "$0.00" && (
            <View style={S.row}>
              <Text style={S.label}>{t(tr, "discount", "Discount")}</Text>
              <Text style={[S.value, { color: "#e53e3e" }]}>-{d.discount}</Text>
            </View>
          )}
          <View style={S.row}>
            <Text style={S.label}>{t(tr, "tax", "Tax")}</Text>
            <Text style={S.value}>{d.salesTax || d.tax}</Text>
          </View>
          <View style={S.divider} />
          <View style={S.row}>
            <Text style={[S.label, { fontWeight: "700", color: "#2d3748" }]}>{t(tr, "total", "Total")}</Text>
            <Text style={[S.value, { fontWeight: "700" }]}>{d.total}</Text>
          </View>
          {d.amountPaid && d.amountPaid !== "$0.00" && (
            <View style={S.row}>
              <Text style={S.label}>{t(tr, "amountPaid", "Amount Paid")}</Text>
              <Text style={[S.value, { color: "#38a169" }]}>{d.amountPaid}</Text>
            </View>
          )}
          {d.balanceDue && d.balanceDue !== "$0.00" && (
            <View style={S.row}>
              <Text style={[S.label, { fontWeight: "700" }]}>{t(tr, "balanceDue", "Balance Due")}</Text>
              <Text style={[S.value, { fontWeight: "700", color: "#e53e3e" }]}>{d.balanceDue}</Text>
            </View>
          )}
        </View>
      )}

      {/* Media */}
      {(d.media?.length > 0 || true) && (
        <View style={S.card}>
          <Text style={S.sectionHeader}>{t(tr, "media", "Photos & Videos")}</Text>

          {d.media?.length > 0 && (
            <View style={S.thumbGrid}>
              {d.media.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  onPress={() => _setFullScreenMedia(m)}
                  activeOpacity={0.8}
                >
                  {m.type === "video" ? (
                    <View style={[S.thumb, { justifyContent: "center", alignItems: "center" }]}>
                      <Text style={{ fontSize: 28 }}>▶</Text>
                    </View>
                  ) : (
                    <Image
                      source={{ uri: m.thumbnailUrl || m.url }}
                      style={S.thumb}
                      resizeMode="cover"
                    />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Upload button */}
          <TouchableOpacity
            style={[S.uploadBtn, sUploading && { opacity: 0.5 }]}
            onPress={() => !sUploading && fileInputRef.current?.click()}
            activeOpacity={0.7}
            disabled={sUploading}
          >
            <Text style={S.uploadBtnText}>
              {sUploading
                ? `${sUploadProgress?.completed || 0}/${sUploadProgress?.total || 0}`
                : t(tr, "uploadPhotos", "Upload Photos")}
            </Text>
          </TouchableOpacity>

          {/* Upload progress bar */}
          {sUploading && sUploadProgress && (
            <View style={{ marginTop: 8 }}>
              <View style={{ height: 3, backgroundColor: "#edf2f7", borderRadius: 2 }}>
                <View
                  style={{
                    height: 3,
                    backgroundColor: "#3182ce",
                    borderRadius: 2,
                    width: `${((sUploadProgress.completed / sUploadProgress.total) * 100).toFixed(0)}%`,
                  }}
                />
              </View>
            </View>
          )}

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length) handleUpload(files);
              e.target.value = "";
            }}
          />
        </View>
      )}

      {/* Started date */}
      {!!d.startedOnMillis && (
        <Text style={{ fontSize: 12, color: "#a0aec0", textAlign: "center", marginTop: 4 }}>
          WO #{formatWorkorderNumber(d.workorderNumber)} — {formatDate(d.startedOnMillis)}
        </Text>
      )}

      {/* Full-screen media viewer */}
      {sFullScreenMedia && (
        <TouchableOpacity
          style={S.overlay}
          activeOpacity={1}
          onPress={() => _setFullScreenMedia(null)}
        >
          {sFullScreenMedia.type === "video" ? (
            <video
              src={sFullScreenMedia.url}
              controls
              autoPlay
              style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: 4 }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <Image
              source={{ uri: sFullScreenMedia.url }}
              style={S.fullImg}
              resizeMode="contain"
            />
          )}
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}
