import React, { useMemo, useRef, useState } from "react";
import { useSettingsStore, usePhoneConfigStore } from "../../../../../stores";
import { storageUpload } from "../../../../../db_calls";
import { build_db_path } from "../../../../../constants";
import { PHONE_CONFIG_OBJ } from "../../../../../data";
import { log } from "../../../../../utils";
import { TextInput } from "../../../../../dom_components";
import styles from "./PhoneSettingsComponent.module.css";

const OVERRIDE_OPTIONS = [
  { value: "auto", label: "Auto (use store hours)" },
  { value: "open", label: "Force Open" },
  { value: "closed", label: "Force Closed" },
];

const GREETINGS = [
  {
    key: "greetingOpen",
    title: "Open Greeting",
    subtitle: "Played at the start of every call during open hours.",
  },
  {
    key: "greetingAfterHours",
    title: "After-Hours Greeting",
    subtitle: "Played when the store is closed. Caller is hung up after.",
  },
  {
    key: "greetingNoAnswer",
    title: "No-Answer Greeting",
    subtitle:
      "Played when no SIP endpoint picks up (timeout / busy). Caller is hung up after.",
  },
];

function getCurrentConfig(phoneConfigState) {
  // Merge defaults with live config so missing fields fall back gracefully.
  return { ...PHONE_CONFIG_OBJ, ...(phoneConfigState || {}) };
}

export const PhoneSettingsComponent = () => {
  const phoneConfig = usePhoneConfigStore((s) => s.phoneConfig);
  const setField = usePhoneConfigStore((s) => s.setField);
  const cfg = getCurrentConfig(phoneConfig);

  const sipEndpoints = Array.isArray(cfg.sipEndpoints) ? cfg.sipEndpoints : [];

  const handleOverrideChange = (val) => setField("manualOverride", val);

  const handleRingTimeoutChange = (val) => {
    const num = parseInt(val, 10);
    if (isNaN(num)) return;
    const clamped = Math.max(5, Math.min(60, num));
    setField("ringTimeoutSeconds", clamped);
  };

  const handleSipChange = (idx, val) => {
    const next = [...sipEndpoints];
    next[idx] = val;
    setField("sipEndpoints", next);
  };

  const handleSipRemove = (idx) => {
    const next = sipEndpoints.filter((_, i) => i !== idx);
    setField("sipEndpoints", next);
  };

  const handleSipAdd = () => {
    setField("sipEndpoints", [...sipEndpoints, ""]);
  };

  const handleGreetingFieldChange = (greetingKey, partial) => {
    const current = cfg[greetingKey] || {
      type: "text",
      text: "",
      audioURL: "",
      audioPath: "",
    };
    setField(greetingKey, { ...current, ...partial });
  };

  return (
    <div className={styles.cardOuter}>
      <CurrentStatusCard
        cfg={cfg}
        onOverrideChange={handleOverrideChange}
      />

      <SipEndpointsCard
        sipEndpoints={sipEndpoints}
        ringTimeoutSeconds={cfg.ringTimeoutSeconds}
        onSipChange={handleSipChange}
        onSipRemove={handleSipRemove}
        onSipAdd={handleSipAdd}
        onRingTimeoutChange={handleRingTimeoutChange}
      />

      <GreetingsCard
        cfg={cfg}
        onGreetingChange={handleGreetingFieldChange}
      />

      <TwilioWebhookCard />
    </div>
  );
};

// ─── Sub-cards ───────────────────────────────────────────────────────────

const CurrentStatusCard = ({ cfg, onOverrideChange }) => {
  const override = cfg.manualOverride || "auto";
  const settings = useSettingsStore((s) => s.settings);

  // Derive what status the system would currently report.
  const computed = useMemo(
    () => deriveCurrentStatus(cfg, settings),
    [cfg, settings]
  );

  return (
    <div className={`${styles.cardOuterTopGap}`} style={{ width: "100%" }}>
      <div className={styles.cardInner}>
        <div className={styles.sectionTitle}>Current Status</div>

        <div className={styles.statusBadgeRow}>
          <span className={styles.statusLabel}>Calls will be answered as:</span>
          <span
            className={`${styles.statusBadge} ${
              computed.open ? styles.statusBadgeOpen : styles.statusBadgeClosed
            }`}
          >
            {computed.open ? "OPEN" : "CLOSED"}
          </span>
          <span className={styles.statusDetail}>{computed.detail}</span>
        </div>

        <div style={{ marginTop: 14 }} className={styles.sectionTitle}>
          Manual Override
        </div>
        <div className={styles.overrideRow}>
          {OVERRIDE_OPTIONS.map((opt) => (
            <label className={styles.overrideOption} key={opt.value}>
              <input
                type="radio"
                name="phone-manual-override"
                value={opt.value}
                checked={override === opt.value}
                onChange={() => onOverrideChange(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>
        <div className={styles.helperText}>
          Auto mode uses Store Info hours and special-day overrides. Force
          modes hold the line until you switch back.
        </div>
      </div>
    </div>
  );
};

const SipEndpointsCard = ({
  sipEndpoints,
  ringTimeoutSeconds,
  onSipChange,
  onSipRemove,
  onSipAdd,
  onRingTimeoutChange,
}) => (
  <div style={{ width: "100%", marginTop: 16 }}>
    <div className={styles.cardInner}>
      <div className={styles.sectionTitle}>Desk Phones (SIP Endpoints)</div>
      <div className={styles.helperText}>
        All endpoints ring at the same time during open hours. Format:{" "}
        <code>sip:user@your-sip-domain.sip.twilio.com</code>
      </div>

      <div className={styles.sipList}>
        {sipEndpoints.length === 0 && (
          <div className={styles.helperText}>
            No endpoints configured. Add one below to start routing calls.
          </div>
        )}
        {sipEndpoints.map((sip, idx) => (
          <div className={styles.sipRow} key={idx}>
            <input
              className={styles.sipInput}
              type="text"
              value={sip}
              placeholder="sip:user@your-sip-domain.sip.twilio.com"
              onChange={(e) => onSipChange(idx, e.target.value)}
            />
            <button
              type="button"
              className={styles.sipRemoveBtn}
              title="Remove"
              onClick={() => onSipRemove(idx)}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button type="button" className={styles.sipAddBtn} onClick={onSipAdd}>
        + Add Endpoint
      </button>

      <div className={styles.divider} />

      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>Ring Timeout (sec)</span>
        <input
          type="number"
          min={5}
          max={60}
          step={1}
          className={styles.numberInput}
          value={ringTimeoutSeconds ?? 20}
          onChange={(e) => onRingTimeoutChange(e.target.value)}
        />
        <span className={styles.helperText}>
          How long endpoints ring before the no-answer greeting plays. 5–60.
        </span>
      </div>
    </div>
  </div>
);

const GreetingsCard = ({ cfg, onGreetingChange }) => (
  <div style={{ width: "100%", marginTop: 16 }}>
    <div className={styles.cardInner}>
      <div className={styles.sectionTitle}>Greetings</div>
      <div className={styles.helperText}>
        Each greeting can be a typed message (text-to-speech) or an uploaded
        audio file (mp3/wav). Audio overrides text when present.
      </div>

      {GREETINGS.map((g) => (
        <GreetingEditor
          key={g.key}
          greetingKey={g.key}
          title={g.title}
          subtitle={g.subtitle}
          greeting={cfg[g.key]}
          onChange={(partial) => onGreetingChange(g.key, partial)}
        />
      ))}
    </div>
  </div>
);

const GreetingEditor = ({
  greetingKey,
  title,
  subtitle,
  greeting,
  onChange,
}) => {
  const settings = useSettingsStore((s) => s.settings);
  const fileInputRef = useRef(null);
  const [sUploading, _sSetUploading] = useState(false);
  const [sDraftText, _sSetDraftText] = useState(null);

  const g = greeting || { type: "text", text: "", audioURL: "", audioPath: "" };
  const type = g.type || "text";
  const savedText = g.text || "";
  const displayText = sDraftText !== null ? sDraftText : savedText;
  const isDirty = sDraftText !== null && sDraftText !== savedText;

  const handleSaveText = () => {
    if (!isDirty) return;
    onChange({ text: sDraftText });
    _sSetDraftText(null);
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!settings?.tenantID || !settings?.storeID) {
      log("PhoneSettings: missing tenantID/storeID for audio upload");
      e.target.value = "";
      return;
    }
    _sSetUploading(true);
    try {
      const path = build_db_path.cloudStorage.phoneGreeting(
        settings.tenantID,
        settings.storeID,
        file.name
      );
      const url = await storageUpload(path, file, { contentType: file.type });
      onChange({ audioURL: url, audioPath: path });
    } catch (err) {
      log("PhoneSettings: audio upload error", err);
    }
    _sSetUploading(false);
    e.target.value = "";
  };

  const handleClearAudio = () => {
    onChange({ audioURL: "", audioPath: "" });
  };

  return (
    <div className={styles.greetingCard}>
      <div className={styles.greetingTitleRow}>
        <div className={styles.greetingTitle}>{title}</div>
        <button
          type="button"
          className={`${styles.saveBtn} ${
            isDirty ? styles.saveBtnEnabled : styles.saveBtnDisabled
          }`}
          onClick={handleSaveText}
          disabled={!isDirty}
        >
          Save
        </button>
      </div>
      <div className={styles.greetingSubtitle}>{subtitle}</div>

      <div className={styles.typeToggleRow}>
        <label className={styles.typeToggleOption}>
          <input
            type="radio"
            name={`type-${greetingKey}`}
            value="text"
            checked={type === "text"}
            onChange={() => onChange({ type: "text" })}
          />
          Text (read aloud)
        </label>
        <label className={styles.typeToggleOption}>
          <input
            type="radio"
            name={`type-${greetingKey}`}
            value="audio"
            checked={type === "audio"}
            onChange={() => onChange({ type: "audio" })}
          />
          Audio file
        </label>
      </div>

      {type === "text" && (
        <TextInput
          multiline={true}
          numberOfLines={4}
          debounceMs={0}
          className={styles.textArea}
          value={displayText}
          placeholder="Type the message that will be read to the caller…"
          onChangeText={(val) => _sSetDraftText(val)}
        />
      )}

      {type === "audio" && (
        <>
          <div className={styles.audioRow}>
            <span
              className={`${styles.audioStatus} ${
                g.audioURL ? styles.audioStatusHasFile : ""
              }`}
            >
              {sUploading
                ? "Uploading…"
                : g.audioURL
                ? g.audioPath || g.audioURL
                : "No audio uploaded yet"}
            </span>
            <button
              type="button"
              className={styles.audioBtn}
              onClick={() => fileInputRef.current?.click()}
              disabled={sUploading}
            >
              {g.audioURL ? "Replace" : "Upload"}
            </button>
            {g.audioURL && (
              <button
                type="button"
                className={`${styles.audioBtn} ${styles.audioBtnDanger}`}
                onClick={handleClearAudio}
                disabled={sUploading}
              >
                Remove
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/mpeg,audio/wav,audio/mp3,audio/x-wav"
              className={styles.hiddenFileInput}
              onChange={handleFile}
            />
          </div>
          {g.audioURL && (
            <audio
              className={styles.audioPlayer}
              controls
              src={g.audioURL}
              preload="none"
            />
          )}
        </>
      )}
    </div>
  );
};

const TwilioWebhookCard = () => {
  // Bonita-only for now; URL is fixed to warpspeed-bonitabikes project.
  const baseURL =
    "https://us-central1-warpspeed-bonitabikes.cloudfunctions.net";
  return (
    <div style={{ width: "100%", marginTop: 16 }} className={styles.cardOuterBottomGap}>
      <div className={styles.cardInner}>
        <div className={styles.sectionTitle}>Twilio Webhook</div>
        <div className={styles.helperText}>
          In the Twilio Console, set the phone number's <b>Voice Configuration →
          A Call Comes In</b> webhook to:
        </div>
        <div className={styles.webhookBlock}>
          {`${baseURL}/phoneVoiceInbound`}
        </div>
        <div className={styles.helperText}>
          Method: HTTP POST. The action callback URL (
          <code>/phoneVoiceDialAction</code>) is set automatically inside the
          TwiML response — don't set it in the Twilio Console.
        </div>
      </div>
    </div>
  );
};

// ─── Helpers ─────────────────────────────────────────────────────────────

function deriveCurrentStatus(cfg, settings) {
  const override = cfg.manualOverride || "auto";
  if (override === "open") return { open: true, detail: "Manual override" };
  if (override === "closed") return { open: false, detail: "Manual override" };

  const storeHours = (settings && settings.storeHours) || {};
  const standard = Array.isArray(storeHours.standard) ? storeHours.standard : [];
  const special = Array.isArray(storeHours.special) ? storeHours.special : [];

  // Best-effort browser-side tz check; the cloud function does the real check.
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now).reduce((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  const weekdayName = parts.weekday;
  const todayKey = `${parts.year}-${parts.month}-${parts.day}`;
  const currentMin =
    parseInt(parts.hour, 10) * 60 + parseInt(parts.minute, 10);

  for (const sp of special) {
    if (!sp || !sp.dateMillies) continue;
    const spParts = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date(sp.dateMillies))
      .reduce((acc, p) => {
        if (p.type !== "literal") acc[p.type] = p.value;
        return acc;
      }, {});
    if (
      `${spParts.year}-${spParts.month}-${spParts.day}` === todayKey
    ) {
      if (!sp.isOpen) {
        return { open: false, detail: `Special hours: ${sp.name || "today"} (closed)` };
      }
      const within = isWithinWindow(currentMin, sp.open, sp.close);
      return {
        open: within,
        detail: `Special hours: ${sp.name || "today"} (${sp.open} – ${sp.close})`,
      };
    }
  }

  const today = standard.find((d) => d && d.name === weekdayName);
  if (!today) {
    return { open: false, detail: `${weekdayName}: no hours configured` };
  }
  if (!today.isOpen) {
    return { open: false, detail: `${weekdayName}: closed all day` };
  }
  const within = isWithinWindow(currentMin, today.open, today.close);
  return {
    open: within,
    detail: `${weekdayName} ${today.open} – ${today.close}`,
  };
}

function isWithinWindow(currentMin, openLabel, closeLabel) {
  const o = parseTimeToMinutes(openLabel);
  const c = parseTimeToMinutes(closeLabel);
  if (o == null || c == null) return false;
  if (c <= o) return currentMin >= o || currentMin < c;
  return currentMin >= o && currentMin < c;
}

function parseTimeToMinutes(label) {
  if (!label || typeof label !== "string") return null;
  const m = label.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ampm = m[3] ? m[3].toUpperCase() : null;
  if (ampm === "AM" && h === 12) h = 0;
  else if (ampm === "PM" && h !== 12) h += 12;
  if (isNaN(h) || isNaN(min)) return null;
  return h * 60 + min;
}
