#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# setup-alerts.sh — Cloud Logging metrics + Cloud Monitoring alert policies
# for the SaaS Twilio subsystem.
#
# Usage:
#   ./setup-alerts.sh PROJECT_ID NOTIFICATION_CHANNEL_ID
#
# Prerequisites:
#   1. gcloud CLI installed and authenticated as a user with roles/
#      logging.configWriter and roles/monitoring.editor on the project.
#   2. A notification channel already created in the GCP project. Create one
#      via Console → Monitoring → Alerting → Notification Channels (email or
#      SMS, your choice). Copy its ID — looks like "1234567890123456789".
#
# Idempotency:
#   - Log-based metrics: create on first run, update on subsequent runs.
#   - Alert policies: looked up by display name. Update if found, create if
#     not. Safe to re-run after editing this script.
#
# The 5 alert categories (matched to the Phase 7 audit):
#   A. Webhook spoofing      — inbound Twilio signature verification failed
#   B. DLQ depth + ingest    — Pub/Sub envelopes dead-lettered (rate + depth)
#   C. Subaccount auth       — Secret Manager lookup or auth token failures
#   D. A2P registration      — campaign rejections / brand status poll errors
#   E. Port-in failure       — number purchase or hosted-order fetch failed
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Args ────────────────────────────────────────────────────────────────────
PROJECT_ID="${1:-}"
CHANNEL_ID="${2:-}"

if [[ -z "${PROJECT_ID}" || -z "${CHANNEL_ID}" ]]; then
  cat >&2 <<USAGE
Usage: $0 PROJECT_ID NOTIFICATION_CHANNEL_ID

  PROJECT_ID              GCP project (e.g., cadence-pos)
  NOTIFICATION_CHANNEL_ID Numeric channel ID from
                          Console → Monitoring → Notification Channels
USAGE
  exit 1
fi

CHANNEL_REF="projects/${PROJECT_ID}/notificationChannels/${CHANNEL_ID}"
TMPDIR="$(mktemp -d)"
trap 'rm -rf "${TMPDIR}"' EXIT

echo "→ Project:              ${PROJECT_ID}"
echo "→ Notification channel: ${CHANNEL_REF}"
echo ""

# ── Validate channel exists ─────────────────────────────────────────────────
if ! gcloud --project="${PROJECT_ID}" beta monitoring channels describe \
      "${CHANNEL_REF}" >/dev/null 2>&1; then
  echo "ERROR: Notification channel ${CHANNEL_REF} not found." >&2
  echo "List existing channels with:" >&2
  echo "  gcloud --project=${PROJECT_ID} beta monitoring channels list" >&2
  exit 1
fi

# ── Helper: upsert a log-based metric ───────────────────────────────────────
# Args: NAME DESCRIPTION FILTER [EXTRACTOR]
# If EXTRACTOR is provided, creates a DISTRIBUTION metric extracting the
# given field. Otherwise a simple COUNTER metric counting matching entries.
upsert_log_metric() {
  local name=$1
  local description=$2
  local filter=$3
  local extractor=${4:-}

  local config="${TMPDIR}/metric-${name}.yaml"
  if [[ -n "${extractor}" ]]; then
    cat > "${config}" <<YAML
filter: |
  ${filter}
description: ${description}
valueExtractor: ${extractor}
metricDescriptor:
  metricKind: DELTA
  valueType: DISTRIBUTION
  unit: "1"
YAML
  else
    cat > "${config}" <<YAML
filter: |
  ${filter}
description: ${description}
YAML
  fi

  if gcloud --project="${PROJECT_ID}" logging metrics describe "${name}" \
        >/dev/null 2>&1; then
    echo "  ↻ updating metric: ${name}"
    gcloud --project="${PROJECT_ID}" logging metrics update "${name}" \
      --config-from-file="${config}" --quiet
  else
    echo "  + creating metric: ${name}"
    gcloud --project="${PROJECT_ID}" logging metrics create "${name}" \
      --config-from-file="${config}" --quiet
  fi
}

# ── Helper: upsert an alert policy ──────────────────────────────────────────
# Args: POLICY_JSON_FILE
# Match by displayName. If found, update; otherwise create.
upsert_alert_policy() {
  local policy_file=$1
  local display_name
  display_name=$(python -c "import json,sys; print(json.load(open('${policy_file}'))['displayName'])")

  local existing
  existing=$(gcloud --project="${PROJECT_ID}" alpha monitoring policies list \
    --filter="displayName=\"${display_name}\"" \
    --format="value(name)" 2>/dev/null | head -n 1)

  if [[ -n "${existing}" ]]; then
    echo "  ↻ updating policy: ${display_name}"
    gcloud --project="${PROJECT_ID}" alpha monitoring policies update \
      "${existing}" --policy-from-file="${policy_file}" --quiet
  else
    echo "  + creating policy: ${display_name}"
    gcloud --project="${PROJECT_ID}" alpha monitoring policies create \
      --policy-from-file="${policy_file}" --quiet
  fi
}

# ────────────────────────────────────────────────────────────────────────────
# 1. Log-based metrics
# ────────────────────────────────────────────────────────────────────────────
echo "── Creating log-based metrics ──"

upsert_log_metric \
  "twilio_webhook_spoofing" \
  "Inbound Twilio webhook failed signature verification or AccountSid match" \
  'resource.type="cloud_run_revision"
severity>=WARNING
(jsonPayload.message=~"signature verification failed" OR jsonPayload.message=~"AccountSid mismatch")'

upsert_log_metric \
  "twilio_dlq_entries" \
  "Twilio Pub/Sub envelope dead-lettered (rate)" \
  'resource.type="cloud_run_revision"
severity>=ERROR
(jsonPayload.message="Twilio DLQ entry received" OR jsonPayload.message=~"max delivery attempts")'

upsert_log_metric \
  "twilio_dlq_depth" \
  "Twilio DLQ unresolved entry count (daily emission)" \
  'resource.type="cloud_run_revision"
jsonPayload.message="twilioDlqDepth"' \
  'EXTRACT(jsonPayload.count)'

upsert_log_metric \
  "twilio_auth_errors" \
  "Subaccount auth token or Secret Manager failure" \
  'resource.type="cloud_run_revision"
severity>=ERROR
(jsonPayload.message=~"failed to load.*auth token" OR jsonPayload.message=~"secret destroy failed")'

upsert_log_metric \
  "twilio_a2p_failures" \
  "A2P brand or campaign registration polling/rejection" \
  'resource.type="cloud_run_revision"
severity>=WARNING
(jsonPayload.message=~"brand not approved yet" OR jsonPayload.message=~"poll failed for tenant")'

upsert_log_metric \
  "twilio_port_failures" \
  "Port-in or hosted-number-order failure" \
  'resource.type="cloud_run_revision"
severity>=ERROR
(jsonPayload.message=~"cannot load tenant client" OR jsonPayload.message=~"fetch failed.*hostedNumberOrderSid")'

echo ""

# ────────────────────────────────────────────────────────────────────────────
# 2. Alert policies
# ────────────────────────────────────────────────────────────────────────────
echo "── Creating alert policies ──"

# Helper to render a threshold-based policy JSON for a metric.
# Args: NAME DOC METRIC THRESHOLD DURATION ALIGNER
render_policy() {
  local name=$1
  local doc=$2
  local metric=$3
  local threshold=$4
  local duration=$5
  local aligner=$6
  local out="${TMPDIR}/policy-${metric}.json"

  cat > "${out}" <<JSON
{
  "displayName": "${name}",
  "documentation": {
    "content": "${doc}",
    "mimeType": "text/markdown"
  },
  "combiner": "OR",
  "enabled": true,
  "notificationChannels": ["${CHANNEL_REF}"],
  "alertStrategy": { "autoClose": "604800s" },
  "conditions": [
    {
      "displayName": "${name} threshold",
      "conditionThreshold": {
        "filter": "metric.type=\"logging.googleapis.com/user/${metric}\"",
        "comparison": "COMPARISON_GT",
        "thresholdValue": ${threshold},
        "duration": "${duration}",
        "aggregations": [
          {
            "alignmentPeriod": "${duration}",
            "perSeriesAligner": "${aligner}"
          }
        ]
      }
    }
  ]
}
JSON
  echo "${out}"
}

# A. Webhook spoofing — ANY occurrence pages immediately.
upsert_alert_policy \
  "$(render_policy \
      "Twilio: Webhook spoofing attempt" \
      "An inbound Twilio webhook failed HMAC signature verification or had a foreign AccountSid. Could be a probing attempt or a Twilio config drift. Investigate the function logs for the originating IP and AccountSid." \
      "twilio_webhook_spoofing" \
      0 \
      "300s" \
      "ALIGN_SUM")"

# B1. DLQ entries — rate alert.
upsert_alert_policy \
  "$(render_policy \
      "Twilio: DLQ entries (rate)" \
      "Twilio Pub/Sub envelopes are dead-lettering. Check the saas-twilio-dlq Firestore collection and the function logs for the failure reason. Common causes: subaccount suspended, secret rotation, transient Twilio API failures." \
      "twilio_dlq_entries" \
      0 \
      "300s" \
      "ALIGN_SUM")"

# B2. DLQ depth — sustained backlog.
upsert_alert_policy \
  "$(render_policy \
      "Twilio: DLQ depth high" \
      "Unresolved Twilio DLQ entries are accumulating. Open the SaaS admin DLQ tab and triage. Depth metric updates daily via scheduledTwilioDLQDepthEmitter." \
      "twilio_dlq_depth" \
      5 \
      "3600s" \
      "ALIGN_MAX")"

# C. Auth errors — pages immediately. Means the subaccount can't send/receive.
upsert_alert_policy \
  "$(render_policy \
      "Twilio: Subaccount auth failure" \
      "A tenant's Twilio subaccount cannot load its auth token (Secret Manager error, rotated/destroyed secret, or expired credentials). Outbound sends will fail until resolved. Check the tenant's private/twilio doc and Secret Manager." \
      "twilio_auth_errors" \
      0 \
      "300s" \
      "ALIGN_SUM")"

# D. A2P failures — slower alert (rejection is operational, not paging).
upsert_alert_policy \
  "$(render_policy \
      "Twilio: A2P registration issue" \
      "A2P brand or campaign polling encountered a failure (rejection, suspended brand, or polling error). Check the tenant's a2p doc and Twilio Console for brand/campaign status." \
      "twilio_a2p_failures" \
      0 \
      "3600s" \
      "ALIGN_SUM")"

# E. Port-in failure — operational alert.
upsert_alert_policy \
  "$(render_policy \
      "Twilio: Port-in or hosted-number failure" \
      "A port-in poll or hosted-number-order lookup failed. The tenant's number provisioning may be stalled. Check twilio-number-routing for entries in status=\"pending\" and the function logs." \
      "twilio_port_failures" \
      0 \
      "3600s" \
      "ALIGN_SUM")"

echo ""
echo "✓ Done. Verify in Console → Monitoring → Alerting → Policies."
