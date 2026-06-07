/* eslint-disable */
// SaaS sendReceiptCallable — PDF + receipt-URL + optional SMS/email.
//
// Bonita has its own sendReceiptCallable (firebase-index.js, bonita branch)
// that uses the Bonita-only Twilio master account + nodemailer Gmail
// app-password. SaaS cannot reuse that flow because:
//   - Outbound SMS must hit the tenant's Twilio subaccount via
//     getTenantTwilioClient (twilio-send.js).
//   - Outbound email must hit the tenant's connected Gmail mailbox via
//     OAuth (gmail.js sendGmailEmailInternal).
//
// register() pattern mirrors gmail.js — firebase-index.js wires deps in
// the saas branch so the callable closes over the secrets, guards, and
// the gmail internal helper.
//
// v1 SCOPE (this file):
//   ✅ Phase 1: PDF generation + Cloud Storage upload + return receiptURL
//   ⏳ Phase 2: SMS branch  — gated on Decision 2 (see TODO)
//   ⏳ Phase 3: Email branch — gated on Decision 3 (see TODO)
//   ⏳ Phase 4: updateWorkorderField post-processing
//   ⏳ Phase 5: language-code translation (gated on GOOGLE_TRANSLATE_API_KEY
//              being set on cadence-pos)

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const {
  generateSaleReceiptPDF,
  generateRefundReceiptPDF,
  generateCreditReceiptPDF,
  generateGiftCardReceiptPDF,
  generateTransactionReceiptPDF,
  generateWorkorderTicketPDF,
} = require("../pdfGenerator");

function register(deps) {
  const {
    storageBucket,
    getDB,
    secrets,
    guards,
    withFeatureTracking,
    // From gmail.js register() return value — internal Gmail send that
    // skips the callable-side auth checks (we do them here instead).
    sendGmailEmailInternal,
  } = deps;

  const { assertTenantMatch } = guards;

  // Secrets the callable runtime will need access to. Phase 1 (PDF-only)
  // doesn't strictly require any of them — they're listed here so the
  // SMS/email TODOs can be filled in without a separate redeploy to add
  // the secret-binding.
  const _allSecrets = [
    ...(secrets.twilioMasterAccountSid ? [secrets.twilioMasterAccountSid] : []),
    ...(secrets.twilioMasterAuthToken ? [secrets.twilioMasterAuthToken] : []),
    ...(secrets.gmailOAuthClientId ? [secrets.gmailOAuthClientId] : []),
    ...(secrets.gmailOAuthClientSecret ? [secrets.gmailOAuthClientSecret] : []),
    ...(secrets.googleTranslateApiKey ? [secrets.googleTranslateApiKey] : []),
  ];

  function _requireAuth(request) {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }
    return request.auth;
  }

  function _generatePdfBase64(receiptType, receiptData, pdfLabels) {
    switch (receiptType) {
      case "sale":
        return generateSaleReceiptPDF(receiptData, pdfLabels || undefined);
      case "refund":
        return generateRefundReceiptPDF(receiptData);
      case "credit":
        return generateCreditReceiptPDF(receiptData);
      case "giftcard":
        return generateGiftCardReceiptPDF(receiptData);
      case "transaction":
        return generateTransactionReceiptPDF(receiptData);
      case "workorder":
      case "intake":
        return generateWorkorderTicketPDF(receiptData);
      default:
        throw new HttpsError(
          "invalid-argument",
          "Unknown receiptType: " + receiptType
        );
    }
  }

  const sendReceiptCallable = onCall(
    {
      region: "us-central1",
      secrets: _allSecrets,
      timeoutSeconds: 120,
      memory: "512MiB",
    },
    withFeatureTracking("receipt.send", async (request, tracker) => {
      logger.info("[saas/sendReceipt] incoming");
      const auth = _requireAuth(request);

      const {
        receiptType,
        receiptData,
        pdfLabels,
        storagePath,
        tenantID,
        storeID,
        sendSMS,
        sendEmail,
        customerEmail,
        customerCell,
        customerID,
        templateVars,
        smsMessageID,
        canRespond,
        forwardTo: forwardToParam,
        langCode,
        updateWorkorderField,
        senderID = "",
      } = request.data || {};

      if (!receiptData || typeof receiptData !== "object") {
        throw new HttpsError("invalid-argument", "receiptData is required");
      }
      if (!storagePath || typeof storagePath !== "string") {
        throw new HttpsError("invalid-argument", "storagePath is required");
      }
      if (!tenantID || typeof tenantID !== "string") {
        throw new HttpsError("invalid-argument", "tenantID is required");
      }
      if (!storeID || typeof storeID !== "string") {
        throw new HttpsError("invalid-argument", "storeID is required");
      }

      assertTenantMatch(auth, tenantID);
      tracker.setContext({
        tenantID,
        storeID,
        userID: auth.uid,
        customerID: customerID || null,
      });
      tracker.set("receiptType", receiptType);

      const db = await getDB();

      // ── Step 1: read settings (needed for templates + from-number + from-email) ──
      const settingsDoc = await db
        .collection("tenants").doc(tenantID)
        .collection("stores").doc(storeID)
        .collection("settings").doc("settings")
        .get();
      const settings = settingsDoc.exists ? settingsDoc.data() : {};
      tracker.bump("firestoreReads", 1);

      // ── Step 2: PDF generation ──
      const base64 = _generatePdfBase64(receiptType, receiptData, pdfLabels);

      // ── Step 3: upload to Cloud Storage + make public ──
      const bucket = admin.storage().bucket(storageBucket);
      const file = bucket.file(storagePath);
      await file.save(Buffer.from(base64, "base64"), {
        contentType: "application/pdf",
        metadata: { contentType: "application/pdf" },
      });
      await file.makePublic();
      const receiptURL = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
      tracker.bump("storageBytesAdded", Buffer.byteLength(base64, "base64"));

      logger.info("[saas/sendReceipt] PDF uploaded", { receiptType, storagePath });

      // ─────────────────────────────────────────────────────────────────────
      // TODO — Phase 2: SMS branch.
      //
      // Open decision (Decision 2): which "from" number should we use?
      //   Recommended: `settings.storeInfo.textingNumber` formatted as +1XXXXXXXXXX.
      //   The Twilio internal helper requires the from-number to be active in the
      //   tenant routing table (sms-routing/{e164}); this is enforced by
      //   sendTwilioMessageInternal itself.
      //
      // Once Decision 2 is locked, the branch should:
      //   1. Resolve fromPhoneNumber from settings.
      //   2. Build smsMessage from settings.smsTemplates / settings.textTemplates
      //      via getTemplateType + findTemplateByType (../helpers), substituting
      //      templateVars + storePhone/storeName/supportEmail + {link} = receiptURL.
      //   3. Optionally translate when langCode + receiptType==="sale" via
      //      googleTranslateApiKey (Phase 5 TODO).
      //   4. Call sendTwilioMessageInternal({ db, tenantID, storeID,
      //      fromPhoneNumber, to: "+1"+customerCell.replace(/\D/g,""), body,
      //      sentByName: senderID, customerID, authUid: auth.uid, tracker }).
      //   5. Conversation-tracking polish (Phase 6): mirror the message into
      //      `sms-messages/{phone}/messages/{messageID}` for the
      //      messageID-based UI — note Bonita writes to sms-messages but
      //      sendTwilioMessageInternal already writes to outgoing-messages.
      //      Need to reconcile UIs first before duplicating writes.
      //
      // ── const { sendTwilioMessageInternal } = require("./twilio-send"); ──
      if (sendSMS && customerCell) {
        logger.warn("[saas/sendReceipt] SMS requested but Phase 2 not yet implemented", {
          tenantID, storeID, customerCell,
        });
      }

      // ─────────────────────────────────────────────────────────────────────
      // TODO — Phase 3: Email branch.
      //
      // Open decision (Decision 3): which Gmail accountKey should we send from?
      //   Recommended: match `settings.storeInfo.supportEmail` (lowercased)
      //   against the per-tenant email-lookup index
      //     tenants/{tenantID}/email-lookup/{address}
      //   to resolve { accountKey, assignedStoreID }. If assignedStoreID is set
      //   it must equal storeID (or null = tenant-shared inbox).
      //   Fallback: if no match found, fall through silently (Phase 3 is opt-in
      //   per-tenant — they must connect Gmail before email-send works).
      //
      // Once Decision 3 is locked, the branch should:
      //   1. Resolve accountKey from settings.storeInfo.supportEmail via
      //      email-lookup doc; assert assignedStoreID matches storeID (or null).
      //   2. Build subject + html from settings.emailTemplates via
      //      getTemplateType + findTemplateByType + buildEmailFromTemplate.
      //   3. Optionally translate (Phase 5 TODO).
      //   4. Call sendGmailEmailInternal({ db, tenantID, accountKey,
      //      to: [customerEmail], subject, bodyHtml: html, tracker }).
      //
      // Note: this replaces the Bonita nodemailer+app-password flow with
      // tenant-owned OAuth Gmail sends. No tenant can email receipts without
      // first connecting a Gmail mailbox (Settings → Email Accounts).
      if (sendEmail && customerEmail && receiptType !== "workorder") {
        logger.warn("[saas/sendReceipt] Email requested but Phase 3 not yet implemented", {
          tenantID, storeID, customerEmail,
        });
      }

      // ─────────────────────────────────────────────────────────────────────
      // TODO — Phase 4: updateWorkorderField post-processing. Mirrors Bonita
      // behavior — write receiptURL onto the open-workorders doc field
      // (e.g. lastReceiptURL) for client display.
      if (updateWorkorderField?.workorderID && updateWorkorderField?.field) {
        try {
          await db
            .collection("tenants").doc(tenantID)
            .collection("stores").doc(storeID)
            .collection("open-workorders").doc(updateWorkorderField.workorderID)
            .set({ [updateWorkorderField.field]: receiptURL }, { merge: true });
          tracker.bump("firestoreWrites", 1);
        } catch (woError) {
          logger.error("[saas/sendReceipt] updateWorkorderField failed", {
            workorderID: updateWorkorderField.workorderID,
            field: updateWorkorderField.field,
            error: woError.message,
          });
        }
      }

      return { success: true, receiptURL };
    })
  );

  return { sendReceiptCallable };
}

module.exports = { register };
