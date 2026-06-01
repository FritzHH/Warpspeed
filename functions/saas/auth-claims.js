/* eslint-disable */
// Auth claims provisioning callables (Phase 1 of auth-claims rollout)
// plus the platform-admin tenant-list callable used by cadence-dashboard.
//
//   - platformAdminCreateTenantCallable
//       Platform-admin only. Creates a brand-new tenant + provisions its
//       first owner. Writes tenants/{tenantID}, stamps {tenantID, privilege:
//       "owner"} claims on the owner's Auth user, returns a sign-in link
//       the caller can hand to the owner via any channel (email, SMS, copy
//       in person). The platformAdmin claim itself is set manually for fritz
//       via a one-off admin-SDK script — never via a callable.
//
//   - platformAdminCreateStoreCallable
//       Platform-admin only. Adds a second-or-later store under an existing
//       tenant. Two modes:
//         "fresh"  — clone SETTINGS_OBJ, regenerate generated-IDs
//         "copy"   — clone an existing store's settings doc, keep its IDs
//       Appends the new storeID to the owner's claims.stores (best-effort —
//       isOwner rule short-circuits store access anyway).
//
//   - listTenantsCallable
//       Platform-admin only. Returns the tenant roster with provisioning-
//       status flags inline (Twilio subaccount + A2P, Stripe Connect, store
//       count) so the dashboard list view can render "needs X" badges
//       without N follow-up reads.
//
//   - tenantAdminInviteUserCallable
//       Owner-only. Creates an invite doc keyed by random token, returns a
//       Firebase email-link sign-in URL for the invited address. Invite
//       carries the intended {tenantID, privilege, stores} — redemption
//       reads it back and stamps the claims.
//
//   - redeemInviteCallable
//       Any signed-in user. Reads invites/{token}, verifies the invited
//       email matches the signed-in email, stamps claims, marks the invite
//       redeemed. Client must force getIdToken(true) on return to pick up
//       the new claims without waiting for the 1-hour token refresh.
//
// Invite docs live at the top level (not under tenants/{tenantID}/) so
// redemption doesn't need a tenantID at lookup time — only the token.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const Stripe = require("stripe");
const {
  PRIVILEGES,
  PRIVILEGE_RANK,
  assertPrivilege,
  assertPlatformAdmin,
  setUserClaims,
} = require("./auth-guards");
const { SETTINGS_OBJ } = require("../shared/data");
const { generateEAN13Barcode } = require("../shared/idGen");
const {
  numberWebhooksAreCurrent,
  tenantTwilioDocRef,
  getSetupTwilioClient,
  loadSetupSubaccountAuthToken,
  storeSubaccountAuthToken,
  destroySetupSubaccountSecret,
  secretManagerRef,
  routingDocRef,
  storeNumberDocRef,
  CURRENT_WEBHOOK_CONFIG,
} = require("./twilio-common");
const { getTierDoc } = require("./billing-helpers");
const {
  _internals: stripeConnectInternals,
} = require("./stripe-connect-callables");
const {
  _internals: twilioSubaccountInternals,
} = require("./twilio-subaccounts");
const stripeConnect = require("./stripe-connect");
const { provisionOwnersWithPins } = require("./owner-pin-provisioning");

if (!admin.apps.length) admin.initializeApp();

const PLATFORM_NOREPLY_EMAIL = defineSecret("PLATFORM_NOREPLY_EMAIL");
const PLATFORM_NOREPLY_SMTP_USER = defineSecret("PLATFORM_NOREPLY_SMTP_USER");
const PLATFORM_NOREPLY_APP_PASSWORD = defineSecret("PLATFORM_NOREPLY_APP_PASSWORD");

const INVITE_LANDING_URL = "https://cadence-pos.web.app/invite-accept";
const INVITE_TTL_DAYS = 7;
const TENANT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

// Tenant portal lives on the cadence-dashboard hosting site. After finalize,
// the owner is emailed a Firebase email-link that lands on /portal so they
// can sign in and (if applicable) initiate a number port-in for their
// permanent number.
const PORTAL_LANDING_URL = "https://cadence-dashboard.web.app/portal";

function requireAuth(request) {
  const auth = request.auth;
  if (!auth || !auth.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  return auth;
}

function normalizeEmail(email) {
  if (!email || typeof email !== "string") return null;
  return email.trim().toLowerCase();
}

function normalizeName(name) {
  if (!name || typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 100) return null;
  return trimmed;
}

// Returns E.164 (e.g. "+15551234567") or null. Strips formatting; assumes US
// (+1) for bare 10-digit numbers, accepts already-prefixed international.
function normalizePhone(phone) {
  if (!phone || typeof phone !== "string") return null;
  const raw = phone.trim();
  if (!raw) return null;
  if (raw.startsWith("+")) {
    const digits = raw.slice(1).replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

function generateInviteToken() {
  return crypto.randomBytes(24).toString("base64url");
}

// Action-code settings for Firebase email-link sign-in. The invite token is
// appended as a query param so the landing page can read it client-side and
// call redeemInviteCallable. handleCodeInApp must be true so the link routes
// to the SaaS web app instead of Firebase's hosted page.
function buildActionCodeSettings(inviteToken) {
  return {
    url: `${INVITE_LANDING_URL}?token=${encodeURIComponent(inviteToken)}`,
    handleCodeInApp: true,
  };
}

// Self-serve "send me a new sign-in link" URL embedded in every welcome
// email so an owner whose primary link expired (or was consumed before they
// were ready to finish bootstrap) can request a fresh one without contacting
// support. Lands on InviteAcceptScreen which auto-fires
// requestOwnerWelcomeResendCallable. The callable is public + per-tenant
// throttled, so the URL is safe to embed in plaintext email.
function buildResendLinkUrl(email) {
  return `${INVITE_LANDING_URL}?resend=1&email=${encodeURIComponent(email)}`;
}

function renderResendLinkFooterHtml(email) {
  const url = buildResendLinkUrl(email);
  return `<p style="margin-top:24px;color:#666;font-size:13px">Need a fresh link? <a href="${url}">Click here to email yourself a new one</a>. (Limited to one new link per minute.)</p>`;
}

// Builds a Firebase email-link sign-in URL that lands on the tenant portal.
// `nextPath` is appended as a query so the portal can route to a specific
// page after sign-in (e.g. /portal/port-number for pool tenants).
function buildPortalActionCodeSettings(nextPath) {
  const safePath = typeof nextPath === "string" && nextPath.startsWith("/")
    ? nextPath
    : "/portal";
  return {
    url: `${PORTAL_LANDING_URL}?next=${encodeURIComponent(safePath)}`,
    handleCodeInApp: true,
  };
}

// Inline-branded HTML for the post-onboarding portal welcome email. Reused
// for opt-out / purchase / pool variants by passing different bodyHtml.
function renderPortalWelcomeEmailHtml({ headerLine, bodyHtml, signInLink }) {
  const accent = "#2563eb";
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;max-width:560px;margin:0 auto">
  <div style="border-top:4px solid ${accent};padding:24px 0 8px 0">
    <div style="font-size:11px;letter-spacing:0.18em;color:${accent};font-weight:700;text-transform:uppercase">Cadence POS</div>
    <h1 style="margin:6px 0 4px 0;font-size:22px;letter-spacing:-0.01em">${headerLine}</h1>
  </div>
  ${bodyHtml}
  <div style="margin-top:28px;padding:18px 0;border-top:1px solid #e5e7eb">
    <p style="margin:0 0 10px 0;font-size:14px">Click below to sign in to your portal:</p>
    <p style="margin:0 0 14px 0"><a href="${signInLink}" style="display:inline-block;padding:10px 18px;background:${accent};color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Open Cadence Portal</a></p>
    <p style="margin:0;color:#666;font-size:12px;word-break:break-all">Or copy this link: ${signInLink}</p>
    <p style="margin:14px 0 0 0;color:#666;font-size:12px">This link is single-use and expires after a short time.</p>
  </div>
</div>`;
}

// Sends the post-onboarding portal welcome email. Non-fatal: if the email
// send fails, the tenant is still live and can request a new link from
// support (we log the failure). Branches body copy on smsChoice.
async function sendPortalWelcomeEmail({
  ownerEmail,
  tenantName,
  smsChoice,
  poolExpiresAtMs,
}) {
  const fromEmail = PLATFORM_NOREPLY_EMAIL.value();
  const smtpUser = PLATFORM_NOREPLY_SMTP_USER.value();
  const fromPassword = PLATFORM_NOREPLY_APP_PASSWORD.value();
  if (!fromEmail || !smtpUser || !fromPassword) {
    throw new Error("Portal welcome email secrets are not configured.");
  }

  const nextPath = smsChoice === "pool" ? "/portal/port-number" : "/portal";
  const signInLink = await admin
    .auth()
    .generateSignInWithEmailLink(
      ownerEmail,
      buildPortalActionCodeSettings(nextPath)
    );

  let headerLine;
  let bodyHtml;
  if (smsChoice === "pool") {
    const expiryStr = poolExpiresAtMs
      ? new Date(poolExpiresAtMs).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : "in 30 days";
    headerLine = `${tenantName} is live`;
    bodyHtml = `<p style="margin:8px 0 14px 0;line-height:1.55">Welcome to Cadence. Your account is up and running.</p>
<div style="margin:18px 0;padding:14px 16px;border:1px solid #fcd34d;background:#fffbeb;border-radius:6px">
  <p style="margin:0 0 6px 0;font-weight:700;color:#92400e">Temporary number — expires ${expiryStr}</p>
  <p style="margin:0;color:#7c2d12;font-size:14px;line-height:1.5">You're currently using a temporary phone number from our pool. To keep your real business number long-term, start the port-in process from the portal before this number expires.</p>
</div>
<p style="margin:8px 0 0 0;line-height:1.55">From the portal you can: initiate a port-in for your real number, manage your team, and review billing.</p>`;
  } else if (smsChoice === "opt_out") {
    headerLine = `${tenantName} is live`;
    bodyHtml = `<p style="margin:8px 0 14px 0;line-height:1.55">Welcome to Cadence. Your account is up and running.</p>
<p style="margin:8px 0 14px 0;line-height:1.55">You opted out of text messaging during signup. If you change your mind, you can enable it any time from your in-app Subscription settings.</p>
<p style="margin:8px 0 0 0;line-height:1.55">From the portal you can manage your team, review billing, and update your account info.</p>`;
  } else {
    headerLine = `${tenantName} is live`;
    bodyHtml = `<p style="margin:8px 0 14px 0;line-height:1.55">Welcome to Cadence. Your account is up and running.</p>
<p style="margin:8px 0 0 0;line-height:1.55">From the portal you can manage your team, review billing, and update your account info.</p>`;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: smtpUser, pass: fromPassword },
  });

  const subject = `Your Cadence portal is ready — ${tenantName}`;
  const html = renderPortalWelcomeEmailHtml({
    headerLine,
    bodyHtml,
    signInLink,
  });

  const info = await transporter.sendMail({
    from: `"Cadence POS" <${fromEmail}>`,
    to: ownerEmail,
    subject,
    html,
  });
  return { messageId: info.messageId };
}

function normalizeStoreString(value, maxLen) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLen) return null;
  return trimmed;
}

function normalizeOptionalStoreString(value, maxLen) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length > maxLen) return null;
  return trimmed;
}

function normalizeZip(zip, country = "US") {
  if (!zip || typeof zip !== "string") return null;
  const trimmed = zip.trim();
  if ((country || "US").toUpperCase() === "CA") {
    // Canadian postal codes: A1A 1A1 (with or without space). Normalize to
    // upper-case, single-space, no double spaces. ANSI rule: alternating
    // letter/digit, never D O F I Q U as the first letter, never W or Z as
    // the first letter — we keep the regex permissive (full alphabet) since
    // Canada Post accepts more than spec for some private codes.
    const compact = trimmed.replace(/\s+/g, "").toUpperCase();
    if (!/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(compact)) return null;
    return `${compact.slice(0, 3)} ${compact.slice(3)}`;
  }
  if (!/^\d{5}(-\d{4})?$/.test(trimmed)) return null;
  return trimmed;
}

// Country/currency support. One country per tenant (Stripe Connect = one
// account = one country = one currency). Currency is derived server-side
// from country so it's a single source of truth.
const SUPPORTED_COUNTRIES = ["US", "CA"];
const COUNTRY_CURRENCY = {
  US: "USD",
  CA: "CAD",
};

function normalizeCountry(value) {
  if (!value || typeof value !== "string") return null;
  const upper = value.trim().toUpperCase();
  return SUPPORTED_COUNTRIES.includes(upper) ? upper : null;
}

function currencyForCountry(country) {
  return COUNTRY_CURRENCY[country] || "USD";
}

function normalizeSalesTaxPercent(value) {
  if (value === undefined || value === null || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0 || num > 100) return null;
  return num;
}

const BILLING_MODELS = ["per_sale", "monthly_sub"];
const DEFAULT_PLATFORM_FEE_PERCENT = 0.5;
const PLATFORM_FEE_PERCENT_MAX = 10;

function normalizeBillingModel(value) {
  if (typeof value !== "string") return null;
  return BILLING_MODELS.includes(value) ? value : null;
}

// platformFeePercent is stored as a percent (0.5 = 0.5%), not a fraction.
// Only meaningful when billingModel === "per_sale". Capped at 10% as a sanity
// guard — anything higher would be a typo, not a real fee.
function normalizePlatformFeePercent(value) {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_PLATFORM_FEE_PERCENT;
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0 || num > PLATFORM_FEE_PERCENT_MAX) {
    return null;
  }
  return num;
}

function formatUSPhoneForDisplay(e164) {
  const m = (e164 || "").match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  if (!m) return e164 || "";
  return `(${m[1]}) ${m[2]}-${m[3]}`;
}

// Fields the owner will be asked for on the bootstrap form. Listed in the
// welcome email so they can gather the info before clicking the link, since
// the magic link is single-use and time-limited.
const OWNER_BOOTSTRAP_FIELDS = [
  "Store legal name",
  "Store display name",
  "Street address (and unit/suite, if any)",
  "City, state, ZIP",
  "Store phone number",
  "Support email",
  "Office email",
  "Sales tax %",
  "A 4-digit PIN for in-app login",
];

// Stripe-required KYC + payout fields. Called out separately in the welcome
// email in a bordered block so owners don't gloss over them — without these,
// the connected account stays in "Restricted" status and can't accept payments.
const STRIPE_PAYMENTS_INFO_FIELDS = [
  "Business website URL",
  "Bank routing number (9 digits)",
  "Bank account number",
  "Owner / representative date of birth",
  "Last 4 digits of owner / representative SSN",
];

function renderBootstrapFieldsListHtml() {
  return (
    "<ul>" +
    OWNER_BOOTSTRAP_FIELDS.map((f) => `<li>${f}</li>`).join("") +
    "</ul>"
  );
}

function renderStripePaymentsInfoBlockHtml() {
  const items = STRIPE_PAYMENTS_INFO_FIELDS.map((f) => `<li>${f}</li>`).join("");
  return (
    `<div style="margin:24px 0;padding:16px 20px;border:2px solid #c75100;` +
    `background:#fff7ed;border-radius:6px;">` +
    `<p style="margin:0 0 8px 0;font-weight:700;color:#7a2e00;">` +
    `Payment Setup (Required by Stripe)</p>` +
    `<p style="margin:0 0 8px 0;">` +
    `These are required so your store can accept card payments. ` +
    `Have them ready before you click the link below:</p>` +
    `<ul style="margin:0;">${items}</ul>` +
    `</div>`
  );
}

// Confirmation email body sent to the owner after they finish bootstrap.
// Recaps everything they entered (including the PIN) so they have a record
// for safekeeping. Bank account and SSN are partially masked.
function renderOwnerSetupSummaryHtml({
  tenantData,
  normalizedLegalName,
  normalizedDisplayName,
  storeAddress,
  normalizedTax,
  userPin,
  businessUrlRaw,
  bankRoutingRaw,
  bankAccountRaw,
  dobMonthNum,
  dobDayNum,
  dobYearNum,
  ssnLast4Raw,
}) {
  const ownerName =
    [tenantData.ownerFirstName || "", tenantData.ownerLastName || ""]
      .filter(Boolean)
      .join(" ") || "Owner";
  const addrLine1 = storeAddress.unit
    ? `${storeAddress.street}, ${storeAddress.unit}`
    : storeAddress.street;
  const addrLine2 = `${storeAddress.city}, ${storeAddress.state} ${storeAddress.zip}`;
  const dobStr = `${String(dobMonthNum).padStart(2, "0")}/${String(
    dobDayNum
  ).padStart(2, "0")}/${dobYearNum}`;
  const maskedAccount =
    bankAccountRaw.length > 4
      ? `${"•".repeat(bankAccountRaw.length - 4)}${bankAccountRaw.slice(-4)}`
      : bankAccountRaw;

  const row = (label, value) =>
    `<tr><td style="padding:6px 12px 6px 0;color:#555;vertical-align:top;` +
    `white-space:nowrap;">${label}</td>` +
    `<td style="padding:6px 0;color:#111;">${value}</td></tr>`;

  const storeTable =
    `<table style="border-collapse:collapse;width:100%;font-size:14px;">` +
    row("Legal name", normalizedLegalName) +
    row("Display name", normalizedDisplayName) +
    row("Address", `${addrLine1}<br>${addrLine2}`) +
    row("Phone", storeAddress.phone) +
    row("Support email", storeAddress.supportEmail) +
    row("Office email", storeAddress.officeEmail) +
    row("Sales tax", `${normalizedTax}%`) +
    `</table>`;

  const stripeTable =
    `<table style="border-collapse:collapse;width:100%;font-size:14px;">` +
    row("Business website", businessUrlRaw) +
    row("Bank routing", bankRoutingRaw) +
    row("Bank account", maskedAccount) +
    row("Date of birth", dobStr) +
    row("SSN (last 4)", ssnLast4Raw) +
    `</table>`;

  const pinBlock =
    `<div style="margin:24px 0;padding:16px 20px;border:2px solid #7c3aed;` +
    `background:#f5f3ff;border-radius:6px;">` +
    `<p style="margin:0 0 8px 0;font-weight:700;color:#5b21b6;">` +
    `Your Owner PIN</p>` +
    `<p style="margin:0 0 8px 0;color:#5b21b6;">` +
    `Use this PIN to log in to the Cadence POS app. Keep this email safe.` +
    `</p>` +
    `<div style="font-family:ui-monospace,Menlo,monospace;font-size:32px;` +
    `font-weight:700;letter-spacing:8px;color:#5b21b6;text-align:center;` +
    `padding:12px 0;background:#ede9fe;border-radius:4px;">${userPin}</div>` +
    `</div>`;

  const storeBlock =
    `<div style="margin:24px 0;padding:16px 20px;border:2px solid #1d4ed8;` +
    `background:#eff6ff;border-radius:6px;">` +
    `<p style="margin:0 0 8px 0;font-weight:700;color:#1e3a8a;">` +
    `Store Info</p>${storeTable}</div>`;

  const stripeBlock =
    `<div style="margin:24px 0;padding:16px 20px;border:2px solid #c75100;` +
    `background:#fff7ed;border-radius:6px;">` +
    `<p style="margin:0 0 8px 0;font-weight:700;color:#7a2e00;">` +
    `Stripe Payments Info</p>${stripeTable}</div>`;

  return (
    `<p>Hi ${ownerName},</p>` +
    `<p>Your <strong>${normalizedDisplayName}</strong> setup is complete. ` +
    `Below is a copy of everything you submitted — keep this email for your ` +
    `records.</p>` +
    pinBlock +
    storeBlock +
    stripeBlock +
    `<p style="color:#666;font-size:12px;">Bank account and SSN are partially ` +
    `masked for safety. If anything looks wrong, contact your platform admin.</p>`
  );
}

function buildShopContactBlurb({ street, unit, city, state, zip, phone }) {
  const line1 = unit ? `${street}, ${unit}` : street;
  const line2 = `${city}, ${state} ${zip}`;
  const line3 = formatUSPhoneForDisplay(phone);
  return `${line1}\n${line2}\n${line3}`;
}

function regenIDsForArr(arr) {
  return (arr || []).map((item) => ({ ...item, id: generateEAN13Barcode() }));
}

// NONREMOVABLE_STATUSES keep their fixed string IDs (tenant code branches on
// them by ID); only `removable: true` entries get fresh IDs.
function regenStatusIDs(statuses) {
  return (statuses || []).map((s) =>
    s.removable === true ? { ...s, id: generateEAN13Barcode() } : s
  );
}

function regenNestedCategoryIDs(categories) {
  return (categories || []).map((cat) => ({
    ...cat,
    id: generateEAN13Barcode(),
    items: (cat.items || []).map((i) => ({ ...i, id: generateEAN13Barcode() })),
  }));
}

// Mutates `settings` in place with the per-store substitutions that apply to
// both fresh-bootstrap and copy-from-source paths. Returns the same object for
// chaining.
//
// `storeAddress`, `storeDisplayName`, and `salesTaxPercent` may all be null
// for stub-mode bootstraps (tenant created before the owner completes
// onboarding). In that case storeInfo gets empty strings + shopContactBlurb
// is cleared, and salesTaxPercent stays at whatever SETTINGS_OBJ defaults to.
function applyStoreOverrides(settings, {
  tenantID,
  storeID,
  storeDisplayName,
  storeLegalName,
  storeAddress,
  salesTaxPercent,
}) {
  settings.tenantID = tenantID;
  settings.storeID = storeID;
  if (settings.amazonExtension) {
    settings.amazonExtension.storeId = storeID;
  }
  if (storeAddress) {
    settings.storeInfo = {
      ...settings.storeInfo,
      legalName: storeLegalName || "",
      displayName: storeDisplayName || "",
      street: storeAddress.street,
      unit: storeAddress.unit,
      city: storeAddress.city,
      state: storeAddress.state,
      zip: storeAddress.zip,
      phone: storeAddress.phone,
      supportEmail: storeAddress.supportEmail || "",
      officeEmail: storeAddress.officeEmail || "",
    };
    settings.shopContactBlurb = buildShopContactBlurb(storeAddress);
  } else {
    settings.storeInfo = {
      ...settings.storeInfo,
      legalName: "",
      displayName: "",
      street: "",
      unit: "",
      city: "",
      state: "",
      zip: "",
      phone: "",
      supportEmail: "",
      officeEmail: "",
    };
    settings.shopContactBlurb = "";
  }
  if (typeof salesTaxPercent === "number") {
    settings.salesTaxPercent = salesTaxPercent;
  }
  return settings;
}

// Fresh-store settings — clone of SETTINGS_OBJ with per-store overrides AND
// regenerated generated-IDs (statuses, discounts, etc.). Used when creating a
// new tenant's first store and when adding a store in "fresh" mode.
function buildBootstrapSettings({
  tenantID,
  storeID,
  storeDisplayName,
  storeAddress,
  salesTaxPercent,
  country,
  currency,
}) {
  // Deep clone — SETTINGS_OBJ is pure data (no functions/Dates/Maps).
  const settings = JSON.parse(JSON.stringify(SETTINGS_OBJ));

  applyStoreOverrides(settings, {
    tenantID,
    storeID,
    storeDisplayName,
    storeAddress,
    salesTaxPercent,
  });

  if (country) settings.country = country;
  if (currency) settings.currency = currency;

  settings.thankYouBlurb = "Thank you for your business!";
  settings.quickItemButtons = [];

  settings.statuses = regenStatusIDs(settings.statuses);
  settings.discounts = regenIDsForArr(settings.discounts);
  settings.waitTimeLabelCategories = regenIDsForArr(settings.waitTimeLabelCategories);
  settings.waitTimes = regenIDsForArr(settings.waitTimes);
  if (settings.storeHours) {
    settings.storeHours.standard = regenIDsForArr(settings.storeHours.standard);
    settings.storeHours.special = regenIDsForArr(settings.storeHours.special);
  }
  settings.noteHelpers = regenNestedCategoryIDs(settings.noteHelpers);
  settings.customerQuickNotes = regenNestedCategoryIDs(settings.customerQuickNotes);

  return settings;
}

// Copied-store settings — clone of an existing store's settings doc with
// per-store overrides applied but generated-IDs left intact. Used in
// platformAdminCreateStoreCallable's "copy" mode so the new store keeps the
// source's curated statuses, discounts, quickItemButtons, templates, etc.
function buildCopiedSettings({
  sourceSettings,
  tenantID,
  storeID,
  storeDisplayName,
  storeAddress,
  salesTaxPercent,
}) {
  const settings = JSON.parse(JSON.stringify(sourceSettings));
  applyStoreOverrides(settings, {
    tenantID,
    storeID,
    storeDisplayName,
    storeAddress,
    salesTaxPercent,
  });
  return settings;
}

exports.platformAdminCreateTenantCallable = onCall(
  {
    region: "us-central1",
    secrets: [
      stripeConnectInternals.STRIPE_PLATFORM_SECRET_KEY,
      twilioSubaccountInternals.TWILIO_MASTER_ACCOUNT_SID,
      twilioSubaccountInternals.TWILIO_MASTER_AUTH_TOKEN,
    ],
  },
  async (request) => {
    const auth = requireAuth(request);
    assertPlatformAdmin(auth);

    const {
      tenantID,
      tenantName,
      ownerEmail,
      ownerFirstName,
      ownerLastName,
      ownerPhone,
      tenantCountry,
      tenantStreet,
      tenantUnit,
      tenantCity,
      tenantState,
      tenantZip,
      billingModel,
      platformFeePercent,
      subscriptionTierID,
      fullBakeForTest,
    } = request.data || {};

    if (!tenantID || !TENANT_ID_PATTERN.test(tenantID)) {
      throw new HttpsError(
        "invalid-argument",
        "tenantID must be lowercase alphanumeric with optional dashes, 3-64 chars."
      );
    }
    if (!tenantName || typeof tenantName !== "string") {
      throw new HttpsError("invalid-argument", "tenantName is required.");
    }
    const normalizedEmail = normalizeEmail(ownerEmail);
    if (!normalizedEmail) {
      throw new HttpsError("invalid-argument", "ownerEmail is required.");
    }
    const normalizedFirstName = normalizeName(ownerFirstName);
    if (!normalizedFirstName) {
      throw new HttpsError("invalid-argument", "ownerFirstName is required.");
    }
    const normalizedLastName = normalizeName(ownerLastName);
    if (!normalizedLastName) {
      throw new HttpsError("invalid-argument", "ownerLastName is required.");
    }
    const normalizedPhone = normalizePhone(ownerPhone);
    if (!normalizedPhone) {
      throw new HttpsError(
        "invalid-argument",
        "ownerPhone is required and must be a valid 10-digit US number or E.164 international format."
      );
    }

    const normalizedCountry = normalizeCountry(tenantCountry) || "US";
    const normalizedCurrency = currencyForCountry(normalizedCountry);

    // Tenant address: the supervising-authority address. Per-store operational
    // address is collected later from the owner via the cadence-pos onboarding
    // flow. Tenant phone is the ownerPhone; tax % is per-store.
    const normalizedStreet = normalizeStoreString(tenantStreet, 200);
    if (!normalizedStreet) {
      throw new HttpsError("invalid-argument", "tenantStreet is required (≤200 chars).");
    }
    const normalizedUnit = normalizeOptionalStoreString(tenantUnit, 50);
    if (normalizedUnit === null) {
      throw new HttpsError("invalid-argument", "tenantUnit must be a string ≤50 chars.");
    }
    const normalizedCity = normalizeStoreString(tenantCity, 100);
    if (!normalizedCity) {
      throw new HttpsError("invalid-argument", "tenantCity is required (≤100 chars).");
    }
    const normalizedState = normalizeStoreString(tenantState, 2);
    if (!normalizedState || !/^[A-Za-z]{2}$/.test(normalizedState)) {
      throw new HttpsError("invalid-argument", "tenantState must be a 2-letter code.");
    }
    const normalizedZip = normalizeZip(tenantZip, normalizedCountry);
    if (!normalizedZip) {
      throw new HttpsError(
        "invalid-argument",
        normalizedCountry === "CA"
          ? "tenantZip must be a Canadian postal code (e.g. A1A 1A1)."
          : "tenantZip must be 5 digits or ZIP+4."
      );
    }

    const normalizedBillingModel = normalizeBillingModel(billingModel);
    if (!normalizedBillingModel) {
      throw new HttpsError(
        "invalid-argument",
        `billingModel is required and must be one of: ${BILLING_MODELS.join(", ")}.`
      );
    }
    const normalizedFeePercent =
      normalizedBillingModel === "per_sale"
        ? normalizePlatformFeePercent(platformFeePercent)
        : null;
    if (normalizedBillingModel === "per_sale" && normalizedFeePercent === null) {
      throw new HttpsError(
        "invalid-argument",
        `platformFeePercent must be a number between 0 and ${PLATFORM_FEE_PERCENT_MAX}.`
      );
    }

    const db = getFirestore();

    // monthly_sub tenants must be created against a specific tier from the
    // catalog. We validate the tier exists + is active here so a tenant
    // can't land in a "monthly_sub but no tier" state. per_sale tenants
    // ignore subscriptionTierID entirely.
    let normalizedTierID = null;
    if (normalizedBillingModel === "monthly_sub") {
      if (!subscriptionTierID || typeof subscriptionTierID !== "string") {
        throw new HttpsError(
          "invalid-argument",
          "subscriptionTierID is required for monthly_sub tenants."
        );
      }
      const tier = await getTierDoc(db, subscriptionTierID, { allowArchived: false });
      normalizedTierID = tier.tierID;
    }

    const tenantRef = db.collection("tenants").doc(tenantID);
    const existing = await tenantRef.get();
    if (existing.exists) {
      throw new HttpsError(
        "already-exists",
        `Tenant ${tenantID} already exists.`
      );
    }

    // Get or create the owner's Auth user. If a user with this email exists,
    // we reuse it — claims will be added (or overwritten). If not, we create
    // a passwordless user; the email-link sign-in establishes the session.
    // On a NEW user we stamp displayName from the provided first/last; on an
    // existing user we don't overwrite their current displayName.
    const displayName = `${normalizedFirstName} ${normalizedLastName}`;
    let ownerUser;
    try {
      ownerUser = await admin.auth().getUserByEmail(normalizedEmail);
    } catch (err) {
      if (err && err.code === "auth/user-not-found") {
        ownerUser = await admin.auth().createUser({
          email: normalizedEmail,
          emailVerified: false,
          displayName,
        });
      } else {
        throw err;
      }
    }

    // Reject if the user is already a member of any tenant — claim collision
    // means they'd need a separate Auth account (per the one-user-one-tenant
    // design). The platform-admin must use a different email.
    // Exception: if the referenced tenant doc no longer exists, the claim is
    // orphaned (e.g., tenant deleted during dev iteration or prod recovery) —
    // clear it and proceed with the new association.
    const existingClaims = ownerUser.customClaims || {};
    if (existingClaims.tenantID) {
      const orphanedTenant = await db
        .collection("tenants")
        .doc(existingClaims.tenantID)
        .get();
      if (orphanedTenant.exists) {
        throw new HttpsError(
          "already-exists",
          `User ${normalizedEmail} is already a member of tenant ${existingClaims.tenantID}.`
        );
      }
      logger.info("platformAdminCreateTenantCallable: clearing orphaned claims", {
        email: normalizedEmail,
        orphanedTenantID: existingClaims.tenantID,
      });
    }

    const storeID = generateEAN13Barcode();

    await setUserClaims(ownerUser.uid, {
      tenantID,
      privilege: "owner",
      stores: [storeID],
    });

    // Tenant doc: supervising authority. Holds owner identity, tenant address
    // (the legal/billing address), and billing-model state. Tier is per-store
    // — moved to the store doc below so each store under a multi-store tenant
    // can sit on its own tier (one Stripe Subscription, N Subscription Items).
    await tenantRef.set({
      name: tenantName,
      ownerUID: ownerUser.uid,
      ownerEmail: normalizedEmail,
      ownerFirstName: normalizedFirstName,
      ownerLastName: normalizedLastName,
      ownerPhone: normalizedPhone,
      country: normalizedCountry,
      currency: normalizedCurrency,
      street: normalizedStreet,
      unit: normalizedUnit,
      city: normalizedCity,
      state: normalizedState.toUpperCase(),
      zip: normalizedZip,
      billingModel: normalizedBillingModel,
      platformFeePercent: normalizedFeePercent,
      subscriptionStatus: null,
      stripeBillingCustomerID: null,
      stripeSubscriptionID: null,
      subscriptionGraceUntil: null,
      createdAt: FieldValue.serverTimestamp(),
      createdByUID: auth.uid,
    });

    // Store doc: billing wiring + setup gating + audit only. All operational
    // store info (legalName, displayName, address, contact emails, sales tax)
    // lives in settings.storeInfo — read from there. Tier is set by the
    // platform admin at create time and is the one thing the tenant owner
    // cannot self-serve. `isSetupComplete: false` gates the rest of the app
    // until onboarding finishes.
    const storeRef = tenantRef.collection("stores").doc(storeID);
    await storeRef.set({
      subscriptionTierID: normalizedTierID,
      stripeSubscriptionItemID: null,
      stripeSubscriptionPriceID: null,
      isSetupComplete: false,
      createdAt: FieldValue.serverTimestamp(),
      createdByUID: auth.uid,
    });

    // Settings doc: SETTINGS_OBJ clone with regenerated IDs but null/empty
    // store-specific overrides. Owner-completion will populate storeInfo +
    // shopContactBlurb + salesTaxPercent.
    const settingsDoc = buildBootstrapSettings({
      tenantID,
      storeID,
      storeDisplayName: null,
      storeAddress: null,
      salesTaxPercent: null,
      country: normalizedCountry,
      currency: normalizedCurrency,
    });
    await storeRef.collection("settings").doc("settings").set(settingsDoc);

    const signInLink = await admin
      .auth()
      .generateSignInWithEmailLink(normalizedEmail, {
        url: `${INVITE_LANDING_URL}?bootstrap=1`,
        handleCodeInApp: true,
      });

    // Best-effort Connect Account provisioning. If Stripe fails (outage, rate
    // limit, etc.) we leave the tenant fully created and let the admin retry
    // via the existing "Create Connect Account" button on TenantDetailScreen.
    //
    // Prefill: business_type=company (POS tenants are registered businesses;
    // owner can flip in Stripe onboarding if sole prop), MCC 5940 (Bicycle
    // Shops), and the representative person from tenant form data. DOB / SSN
    // / bank account / TOS / business URL are left to the owner.
    const stripeAddress = {
      line1: normalizedStreet,
      line2: normalizedUnit || undefined,
      city: normalizedCity,
      state: normalizedState,
      postal_code: normalizedZip,
      country: normalizedCountry,
    };
    let stripeAccountID = null;
    let connectAccountError = null;
    let representativeError = null;
    try {
      const result = await stripeConnectInternals.createAccountInternal({
        secret: stripeConnectInternals.STRIPE_PLATFORM_SECRET_KEY,
        db,
        tenantID,
        email: normalizedEmail,
        businessName: tenantName,
        byUID: auth.uid,
        businessType: "company",
        mcc: "5940",
        companyPhone: normalizedPhone,
        companyAddress: stripeAddress,
        country: normalizedCountry,
        representative: {
          firstName: normalizedFirstName,
          lastName: normalizedLastName,
          email: normalizedEmail,
          phone: normalizedPhone,
          address: stripeAddress,
        },
        fullBakeForTest: fullBakeForTest === true,
      });
      stripeAccountID = result.stripeAccountID;
      representativeError = result.representativeError || null;
    } catch (err) {
      connectAccountError = err && err.message ? err.message : String(err);
      logger.error("platformAdminCreateTenantCallable: Connect create failed", {
        tenantID,
        error: connectAccountError,
      });
    }

    // Best-effort Twilio subaccount provisioning. Until LLC clears + TWILIO_
    // MASTER_* secrets are set, this will fail and surface twilioError — the
    // admin can retry via the existing "Provision Twilio" button.
    let twilioSubaccountSid = null;
    let twilioError = null;
    try {
      const result = await twilioSubaccountInternals.provisionSubaccountInternal({
        tenantID,
        actorUID: auth.uid,
        actorKind: "platform-admin",
      });
      twilioSubaccountSid = result.subaccountSid;
    } catch (err) {
      twilioError = err && err.message ? err.message : String(err);
      logger.error("platformAdminCreateTenantCallable: Twilio provision failed", {
        tenantID,
        error: twilioError,
      });
    }

    logger.info("platformAdminCreateTenantCallable: tenant created", {
      tenantID,
      storeID,
      ownerUID: ownerUser.uid,
      createdByUID: auth.uid,
      stripeAccountID,
      connectAccountError,
      representativeError,
      twilioSubaccountSid,
      twilioError,
    });

    return {
      success: true,
      tenantID,
      storeID,
      ownerUID: ownerUser.uid,
      ownerEmail: normalizedEmail,
      signInLink,
      stripeAccountID,
      connectAccountError,
      representativeError,
      twilioSubaccountSid,
      twilioError,
    };
  }
);

exports.platformAdminCreateStoreCallable = onCall(
  { region: "us-central1" },
  async (request) => {
    const auth = requireAuth(request);
    assertPlatformAdmin(auth);

    const {
      tenantID,
      mode,
      sourceStoreID,
      storeDisplayName,
      storeStreet,
      storeUnit,
      storeCity,
      storeState,
      storeZip,
      storePhone,
      salesTaxPercent,
    } = request.data || {};

    if (!tenantID || typeof tenantID !== "string") {
      throw new HttpsError("invalid-argument", "tenantID is required.");
    }
    if (mode !== "fresh" && mode !== "copy") {
      throw new HttpsError(
        "invalid-argument",
        "mode must be 'fresh' or 'copy'."
      );
    }
    if (mode === "copy") {
      if (!sourceStoreID || typeof sourceStoreID !== "string") {
        throw new HttpsError(
          "invalid-argument",
          "sourceStoreID is required when mode is 'copy'."
        );
      }
    }

    const normalizedDisplayName = normalizeStoreString(storeDisplayName, 100);
    if (!normalizedDisplayName) {
      throw new HttpsError(
        "invalid-argument",
        "storeDisplayName is required (≤100 chars)."
      );
    }
    const normalizedStreet = normalizeStoreString(storeStreet, 200);
    if (!normalizedStreet) {
      throw new HttpsError("invalid-argument", "storeStreet is required (≤200 chars).");
    }
    const normalizedUnit = normalizeOptionalStoreString(storeUnit, 50);
    if (normalizedUnit === null) {
      throw new HttpsError("invalid-argument", "storeUnit must be a string ≤50 chars.");
    }
    const normalizedCity = normalizeStoreString(storeCity, 100);
    if (!normalizedCity) {
      throw new HttpsError("invalid-argument", "storeCity is required (≤100 chars).");
    }
    const normalizedState = normalizeStoreString(storeState, 2);
    if (!normalizedState || !/^[A-Za-z]{2}$/.test(normalizedState)) {
      throw new HttpsError("invalid-argument", "storeState must be a 2-letter code.");
    }
    const normalizedStorePhone = normalizePhone(storePhone);
    if (!normalizedStorePhone) {
      throw new HttpsError(
        "invalid-argument",
        "storePhone is required and must be a valid 10-digit US number or E.164 international format."
      );
    }
    const normalizedTax = normalizeSalesTaxPercent(salesTaxPercent);
    if (normalizedTax === null) {
      throw new HttpsError(
        "invalid-argument",
        "salesTaxPercent is required and must be a number between 0 and 100."
      );
    }

    const db = getFirestore();
    const tenantRef = db.collection("tenants").doc(tenantID);
    const tenantSnap = await tenantRef.get();
    if (!tenantSnap.exists) {
      throw new HttpsError("not-found", `Tenant ${tenantID} not found.`);
    }
    const tenantData = tenantSnap.data() || {};
    const tenantCountryForStore = tenantData.country || "US";
    const normalizedZip = normalizeZip(storeZip, tenantCountryForStore);
    if (!normalizedZip) {
      throw new HttpsError(
        "invalid-argument",
        tenantCountryForStore === "CA"
          ? "storeZip must be a Canadian postal code (e.g. A1A 1A1)."
          : "storeZip must be 5 digits or ZIP+4."
      );
    }

    let sourceSettings = null;
    if (mode === "copy") {
      const sourceSettingsRef = tenantRef
        .collection("stores")
        .doc(sourceStoreID)
        .collection("settings")
        .doc("settings");
      const sourceSnap = await sourceSettingsRef.get();
      if (!sourceSnap.exists) {
        throw new HttpsError(
          "not-found",
          `Source store ${sourceStoreID} has no settings doc under tenant ${tenantID}.`
        );
      }
      sourceSettings = sourceSnap.data();
    }

    const storeID = generateEAN13Barcode();
    const storeAddress = {
      street: normalizedStreet,
      unit: normalizedUnit,
      city: normalizedCity,
      state: normalizedState.toUpperCase(),
      zip: normalizedZip,
      phone: normalizedStorePhone,
    };

    const overrideParams = {
      tenantID,
      storeID,
      storeDisplayName: normalizedDisplayName,
      storeAddress,
      salesTaxPercent: normalizedTax,
    };
    const settingsDoc =
      mode === "copy"
        ? buildCopiedSettings({ sourceSettings, ...overrideParams })
        : buildBootstrapSettings(overrideParams);

    // Batch the two Firestore writes so a partial store can't exist if the
    // settings write fails. The owner-claims update below is best-effort and
    // not part of this batch (Auth ≠ Firestore).
    //
    // Store doc holds only audit fields here. All operational fields
    // (displayName, address, sales tax, etc.) are written into the settings
    // doc by buildBootstrapSettings/buildCopiedSettings — single source of
    // truth.
    const storeRef = tenantRef.collection("stores").doc(storeID);
    const storeMeta = {
      createdAt: FieldValue.serverTimestamp(),
      createdByUID: auth.uid,
    };
    if (mode === "copy") {
      storeMeta.copiedFromStoreID = sourceStoreID;
    }
    const settingsRef = storeRef.collection("settings").doc("settings");
    const batch = db.batch();
    batch.set(storeRef, storeMeta);
    batch.set(settingsRef, settingsDoc);
    await batch.commit();

    // Append the new storeID to the owner's claims.stores. Best-effort —
    // isOwner short-circuits store access in rules, so a flubbed claim
    // update doesn't lock the owner out of the new store.
    let ownerClaimsUpdated = false;
    if (tenantData.ownerUID) {
      try {
        const ownerUser = await admin.auth().getUser(tenantData.ownerUID);
        const existingClaims = ownerUser.customClaims || {};
        const existingStores = Array.isArray(existingClaims.stores)
          ? existingClaims.stores
          : [];
        if (!existingStores.includes(storeID)) {
          await setUserClaims(ownerUser.uid, {
            ...existingClaims,
            stores: [...existingStores, storeID],
          });
          ownerClaimsUpdated = true;
        }
      } catch (err) {
        logger.error(
          "platformAdminCreateStoreCallable: owner claims update failed",
          { tenantID, storeID, ownerUID: tenantData.ownerUID, err }
        );
      }
    }

    logger.info("platformAdminCreateStoreCallable: store created", {
      tenantID,
      storeID,
      mode,
      sourceStoreID: mode === "copy" ? sourceStoreID : null,
      createdByUID: auth.uid,
      ownerClaimsUpdated,
    });

    return {
      success: true,
      tenantID,
      storeID,
      mode,
      ownerClaimsUpdated,
    };
  }
);

// Platform-admin: edit a tenant's billing settings. Phase 1 only supports
// editing platformFeePercent on per_sale tenants — switching billingModel
// mid-flight is not allowed here (proration, payment-method state, sub teardown
// are out of scope for this callable). Add a separate flow when that need
// surfaces.
exports.platformAdminUpdateTenantBillingCallable = onCall(
  { region: "us-central1" },
  async (request) => {
    const auth = requireAuth(request);
    assertPlatformAdmin(auth);

    const { tenantID, platformFeePercent } = request.data || {};
    if (!tenantID || typeof tenantID !== "string") {
      throw new HttpsError("invalid-argument", "tenantID is required.");
    }

    const db = getFirestore();
    const tenantRef = db.collection("tenants").doc(tenantID);
    const snap = await tenantRef.get();
    if (!snap.exists) {
      throw new HttpsError("not-found", `Tenant ${tenantID} not found.`);
    }
    const tenantData = snap.data() || {};
    if (tenantData.billingModel !== "per_sale") {
      throw new HttpsError(
        "failed-precondition",
        `Tenant ${tenantID} is on ${tenantData.billingModel || "no"} billing — platformFeePercent only applies to per_sale tenants.`
      );
    }

    const normalized = normalizePlatformFeePercent(platformFeePercent);
    if (normalized === null) {
      throw new HttpsError(
        "invalid-argument",
        `platformFeePercent must be a number between 0 and ${PLATFORM_FEE_PERCENT_MAX}.`
      );
    }

    await tenantRef.update({ platformFeePercent: normalized });

    logger.info("platformAdminUpdateTenantBillingCallable: updated", {
      tenantID,
      platformFeePercent: normalized,
      uid: auth.uid,
    });

    return { success: true, tenantID, platformFeePercent: normalized };
  }
);

// Platform-admin tenant list for the cadence-dashboard host site. Returns up
// to `limit` tenants (default 100, max 500), ordered by createdAt desc, with
// per-tenant provisioning-status flags pulled from the private/* docs and the
// connect-accounts subcollection. The fan-out is small-N parallel reads —
// acceptable while the tenant count is double-digit; revisit if it grows.
const TENANT_LIST_MAX_FETCH = 500;
const TENANT_LIST_DEFAULT_LIMIT = 100;
const TENANT_LIST_SEARCH_MAX = 100;

// Shared builder so list + detail callables return the same shape. The
// dashboard relies on this — list view paints badges from the same fields the
// detail view drives the provisioning controls off of.
async function buildTenantSummary(db, tenantDoc) {
  const tid = tenantDoc.id;
  const tdata = tenantDoc.data() || {};
  const tenantRef = db.collection("tenants").doc(tid);

  // Tier read is conditional — only fan out the extra read when the tenant
  // is actually on a monthly_sub plan with a recorded tierID. Use a direct
  // doc read (not getTierDoc) so archived/deleted tiers don't throw; the
  // dashboard list view needs to render historical state gracefully.
  const [twilioSnap, a2pSnap, connectSnap, storesCountSnap, emailAuthSnap, tierSnap] =
    await Promise.all([
      tenantRef.collection("private").doc("twilio").get(),
      tenantRef.collection("private").doc("twilio-a2p").get(),
      tenantRef.collection("connect-accounts").limit(1).get(),
      tenantRef.collection("stores").count().get(),
      tenantRef.collection("email-auth").get(),
      tdata.subscriptionTierID
        ? db.collection("platform-billing-tiers").doc(tdata.subscriptionTierID).get()
        : Promise.resolve(null),
    ]);

  const twilioData = twilioSnap.exists ? twilioSnap.data() || {} : {};
  const a2pData = a2pSnap.exists ? a2pSnap.data() || {} : {};
  const connectData = connectSnap.empty
    ? null
    : connectSnap.docs[0].data() || {};
  const tierData = tierSnap && tierSnap.exists ? tierSnap.data() || {} : null;

  // Per-account email summary. Status derives from the cached values written
  // by the OAuth callback / sync / renew-watch handlers in gmail.js. We
  // don't live-ping Google here — too expensive for the list view, and the
  // detail-only platformAdminGetTenantEmailStatus does a deeper check.
  const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const emailAccounts = emailAuthSnap.docs.map((d) => {
    const data = d.data() || {};
    const watchExp = Number(data.watchExpiration) || 0;
    let derivedStatus = "ok";
    if (data.status === "error") {
      derivedStatus = "error";
    } else if (data.status !== "connected") {
      derivedStatus = "disconnected";
    } else if (!watchExp || watchExp < now) {
      derivedStatus = "watchExpired";
    } else if (watchExp - now < TWO_DAYS_MS) {
      derivedStatus = "watchStale";
    }
    return {
      accountKey: d.id,
      email: data.email || "",
      assignedStoreID: data.assignedStoreID || null,
      status: data.status || null,
      derivedStatus,
      watchExpiration: watchExp || null,
      lastSyncedAt: data.lastSyncedAt || null,
      unreadCount: Number(data.unreadCount) || 0,
      connectedAt: data.connectedAt || null,
    };
  });
  const emailHealthyCount = emailAccounts.filter(
    (a) => a.derivedStatus === "ok"
  ).length;
  const emailIssuesCount = emailAccounts.length - emailHealthyCount;

  const createdAt =
    tdata.createdAt && typeof tdata.createdAt.toMillis === "function"
      ? tdata.createdAt.toMillis()
      : null;

  const subscriptionGraceUntil =
    tdata.subscriptionGraceUntil &&
    typeof tdata.subscriptionGraceUntil.toMillis === "function"
      ? tdata.subscriptionGraceUntil.toMillis()
      : null;

  return {
    tenantID: tid,
    name: tdata.name || "",
    ownerEmail: tdata.ownerEmail || "",
    ownerUID: tdata.ownerUID || "",
    ownerFirstName: tdata.ownerFirstName || "",
    ownerLastName: tdata.ownerLastName || "",
    ownerPhone: tdata.ownerPhone || "",
    createdAt,
    storeCount: storesCountSnap.data().count,
    billing: {
      model: tdata.billingModel || null,
      platformFeePercent:
        typeof tdata.platformFeePercent === "number"
          ? tdata.platformFeePercent
          : null,
      subscriptionStatus: tdata.subscriptionStatus || null,
      subscriptionTierID: tdata.subscriptionTierID || null,
      subscriptionTierLabel: tierData ? tierData.label || null : null,
      subscriptionTierMonthlyAmount:
        tierData && typeof tierData.monthlyAmount === "number"
          ? tierData.monthlyAmount
          : null,
      subscriptionTierArchived: tierData ? tierData.archived === true : false,
      stripeBillingCustomerID: tdata.stripeBillingCustomerID || null,
      stripeSubscriptionID: tdata.stripeSubscriptionID || null,
      stripeSubscriptionPriceID: tdata.stripeSubscriptionPriceID || null,
      subscriptionGraceUntil,
    },
    twilio: {
      hasSubaccount: Boolean(twilioData.subaccountSid),
      subaccountSid: twilioData.subaccountSid || null,
      subaccountStatus: twilioData.status || null,
      a2pBrandStatus: a2pData.brandStatus || null,
      a2pCampaignStatus: a2pData.campaignStatus || null,
    },
    stripe: {
      hasConnect: Boolean(connectData),
      stripeAccountID: connectData ? connectData.stripeAccountID || null : null,
      chargesEnabled: connectData
        ? connectData.chargesEnabled === true
        : false,
      payoutsEnabled: connectData
        ? connectData.payoutsEnabled === true
        : false,
      detailsSubmitted: connectData
        ? connectData.detailsSubmitted === true
        : false,
      requirementsCount: connectData
        ? Array.isArray(connectData.requirementsCurrentlyDue)
          ? connectData.requirementsCurrentlyDue.length
          : 0
        : 0,
      requirementsCurrentlyDue: connectData
        ? Array.isArray(connectData.requirementsCurrentlyDue)
          ? connectData.requirementsCurrentlyDue
          : []
        : [],
    },
    email: {
      accountCount: emailAccounts.length,
      healthyCount: emailHealthyCount,
      issuesCount: emailIssuesCount,
      accounts: emailAccounts,
    },
  };
}

exports.listTenantsCallable = onCall(
  { region: "us-central1" },
  async (request) => {
    const auth = requireAuth(request);
    assertPlatformAdmin(auth);

    const { search, limit } = request.data || {};

    if (search != null) {
      if (typeof search !== "string" || search.length > TENANT_LIST_SEARCH_MAX) {
        throw new HttpsError(
          "invalid-argument",
          `search must be a string ≤${TENANT_LIST_SEARCH_MAX} chars.`
        );
      }
    }
    const searchLower = search ? search.trim().toLowerCase() : "";

    let cappedLimit = TENANT_LIST_DEFAULT_LIMIT;
    if (limit != null) {
      if (typeof limit !== "number" || !Number.isFinite(limit)) {
        throw new HttpsError("invalid-argument", "limit must be a number.");
      }
      cappedLimit = Math.min(Math.max(Math.floor(limit), 1), TENANT_LIST_MAX_FETCH);
    }

    const db = getFirestore();

    // Always cap the initial scan at TENANT_LIST_MAX_FETCH. If search is set,
    // we filter in-memory afterward and slice to cappedLimit.
    const tenantsSnap = await db
      .collection("tenants")
      .orderBy("createdAt", "desc")
      .limit(TENANT_LIST_MAX_FETCH)
      .get();

    let docs = tenantsSnap.docs;
    if (searchLower) {
      docs = docs.filter((d) => {
        const id = d.id.toLowerCase();
        const name = ((d.data() || {}).name || "").toLowerCase();
        return id.includes(searchLower) || name.includes(searchLower);
      });
    }
    docs = docs.slice(0, cappedLimit);

    const tenants = await Promise.all(
      docs.map((tenantDoc) => buildTenantSummary(db, tenantDoc))
    );

    logger.info("listTenantsCallable: returned tenants", {
      count: tenants.length,
      uid: auth.uid,
    });

    return { success: true, tenants };
  }
);

// Detail variant of listTenantsCallable. Same TenantSummary shape, single
// tenant by ID. Used by cadence-dashboard's tenant detail screen to fetch
// fresh state after a provisioning action (provision/deactivate/close)
// without re-pulling the whole roster. Throws not-found rather than
// returning an empty payload so the dashboard can distinguish a typo'd URL
// from a tenant that just hasn't been provisioned.
exports.getTenantCallable = onCall(
  { region: "us-central1" },
  async (request) => {
    const auth = requireAuth(request);
    assertPlatformAdmin(auth);

    const { tenantID } = request.data || {};
    if (!tenantID || typeof tenantID !== "string") {
      throw new HttpsError("invalid-argument", "tenantID is required.");
    }

    const db = getFirestore();
    const tenantDoc = await db.collection("tenants").doc(tenantID).get();
    if (!tenantDoc.exists) {
      throw new HttpsError("not-found", `Tenant ${tenantID} not found.`);
    }

    const tenant = await buildTenantSummary(db, tenantDoc);

    // Detail view also needs per-store rows for the Twilio number UI. Kept
    // OFF the list summary to keep that callable cheap — list view only needs
    // the storeCount, detail view needs the per-store roster.
    const storesSnap = await db
      .collection("tenants")
      .doc(tenantID)
      .collection("stores")
      .get();
    const stores = await Promise.all(
      storesSnap.docs.map(async (sDoc) => {
        const sData = sDoc.data() || {};
        // Read per-number docs (not just count) so we can compute webhook
        // drift inline. Settings is read in parallel so displayName/city/state
        // come from settings.storeInfo — store doc no longer mirrors them.
        const [numbersSnap, settingsSnap] = await Promise.all([
          sDoc.ref.collection("twilio").get(),
          sDoc.ref.collection("settings").doc("settings").get(),
        ]);
        let webhooksDriftedCount = 0;
        numbersSnap.docs.forEach((n) => {
          const data = n.data() || {};
          // Skip port-in placeholders — no real Twilio number to configure yet.
          if (n.id.startsWith("port-") || !data.phoneNumberSid) return;
          if (!numberWebhooksAreCurrent(data.webhooks)) {
            webhooksDriftedCount += 1;
          }
        });
        const sCreatedAt =
          sData.createdAt && typeof sData.createdAt.toMillis === "function"
            ? sData.createdAt.toMillis()
            : null;
        const storeInfo =
          (settingsSnap.exists ? settingsSnap.data() : null)?.storeInfo || {};
        return {
          storeID: sDoc.id,
          name: storeInfo.displayName || "",
          city: storeInfo.city || "",
          state: storeInfo.state || "",
          createdAt: sCreatedAt,
          numberCount: numbersSnap.size,
          webhooksDriftedCount,
        };
      })
    );
    stores.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    tenant.stores = stores;

    logger.info("getTenantCallable: returned tenant", {
      tenantID,
      storeCount: stores.length,
      uid: auth.uid,
    });

    return { success: true, tenant };
  }
);

exports.tenantAdminInviteUserCallable = onCall(
  { region: "us-central1" },
  async (request) => {
    const auth = requireAuth(request);
    assertPrivilege(auth, "owner");

    const { email, privilege, stores } = request.data || {};

    const tenantID = auth.token.tenantID;
    if (!tenantID) {
      throw new HttpsError(
        "failed-precondition",
        "Caller's token is missing tenantID."
      );
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      throw new HttpsError("invalid-argument", "email is required.");
    }
    if (!PRIVILEGE_RANK[privilege]) {
      throw new HttpsError(
        "invalid-argument",
        `privilege must be one of: ${PRIVILEGES.join(", ")}.`
      );
    }
    if (privilege !== "owner") {
      if (!Array.isArray(stores) || stores.length === 0) {
        throw new HttpsError(
          "invalid-argument",
          "Non-owner invites must specify at least one storeID."
        );
      }
    }

    const db = getFirestore();
    const token = generateInviteToken();
    const expiresAt = Timestamp.fromMillis(
      Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000
    );

    await db
      .collection("invites")
      .doc(token)
      .set({
        tenantID,
        email: normalizedEmail,
        privilege,
        stores: privilege === "owner" ? [] : stores,
        token,
        createdAt: FieldValue.serverTimestamp(),
        createdByUID: auth.uid,
        expiresAt,
        redeemed: false,
      });

    const signInLink = await admin
      .auth()
      .generateSignInWithEmailLink(
        normalizedEmail,
        buildActionCodeSettings(token)
      );

    logger.info("tenantAdminInviteUserCallable: invite created", {
      tenantID,
      email: normalizedEmail,
      privilege,
      createdByUID: auth.uid,
    });

    return {
      success: true,
      inviteToken: token,
      signInLink,
      expiresAt: expiresAt.toMillis(),
    };
  }
);

exports.redeemInviteCallable = onCall(
  { region: "us-central1" },
  async (request) => {
    const auth = requireAuth(request);

    const { token } = request.data || {};
    if (!token || typeof token !== "string") {
      throw new HttpsError("invalid-argument", "token is required.");
    }

    const callerEmail = normalizeEmail(auth.token && auth.token.email);
    if (!callerEmail) {
      throw new HttpsError(
        "failed-precondition",
        "Signed-in user has no email; redemption requires email-link sign-in."
      );
    }
    if (auth.token && auth.token.email_verified !== true) {
      throw new HttpsError(
        "failed-precondition",
        "Email must be verified before redeeming an invite."
      );
    }

    const db = getFirestore();
    const inviteRef = db.collection("invites").doc(token);
    const snap = await inviteRef.get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "Invite not found or already consumed.");
    }
    const invite = snap.data() || {};

    if (invite.redeemed === true) {
      throw new HttpsError("failed-precondition", "Invite already redeemed.");
    }
    if (invite.expiresAt && invite.expiresAt.toMillis() < Date.now()) {
      throw new HttpsError("failed-precondition", "Invite has expired.");
    }
    if (invite.email !== callerEmail) {
      throw new HttpsError(
        "permission-denied",
        "Invite email does not match the signed-in user."
      );
    }

    // Reject if the user already has a tenant claim — one-user-one-tenant
    // means switching tenants requires a separate Auth account.
    const existing = (await admin.auth().getUser(auth.uid)).customClaims || {};
    if (existing.tenantID && existing.tenantID !== invite.tenantID) {
      throw new HttpsError(
        "failed-precondition",
        `User is already a member of tenant ${existing.tenantID}. Use a different email.`
      );
    }

    await setUserClaims(auth.uid, {
      tenantID: invite.tenantID,
      privilege: invite.privilege,
      stores: invite.stores || [],
    });

    await inviteRef.update({
      redeemed: true,
      redeemedAt: FieldValue.serverTimestamp(),
      redeemedByUID: auth.uid,
    });

    logger.info("redeemInviteCallable: invite redeemed", {
      tenantID: invite.tenantID,
      privilege: invite.privilege,
      uid: auth.uid,
    });

    return {
      success: true,
      tenantID: invite.tenantID,
      privilege: invite.privilege,
      stores: invite.stores || [],
    };
  }
);

// Maps the client-side PERMISSION_LEVELS shape (name + numeric level + id) to
// the server-side custom-claim privilege string. Levels are stable across
// client + server: 1=user, 2=editor, 3=manager, 4=admin (superUser on the
// client), 5=owner. Anything else is rejected so a corrupt or spoofed
// permissions object can't escalate via the level field.
const PERMISSION_LEVEL_TO_PRIVILEGE = {
  1: "user",
  2: "editor",
  3: "manager",
  4: "admin",
  5: "owner",
};

function privilegeFromPermissions(permissions) {
  if (!permissions || typeof permissions !== "object") return null;
  const lvl = Number(permissions.level);
  if (!Number.isInteger(lvl)) return null;
  return PERMISSION_LEVEL_TO_PRIVILEGE[lvl] || null;
}

function normalizePin(pin) {
  if (typeof pin !== "string") return null;
  const trimmed = pin.trim();
  if (!/^\d{1,12}$/.test(trimmed)) return null;
  return trimmed;
}

function normalizeOptionalPin(pin) {
  if (pin === undefined || pin === null || pin === "") return "";
  return normalizePin(pin);
}

// Reads the per-store settings doc and appends or replaces the user's
// per-store entry inside a transaction. Idempotent — calling with the same
// userID twice produces the same array (one entry). Skipped silently if the
// settings doc doesn't exist yet (store is mid-bootstrap; the bootstrap
// callable seeds it).
async function upsertPerStoreUserEntry(db, tenantID, storeID, perStoreEntry) {
  const settingsRef = db
    .collection("tenants")
    .doc(tenantID)
    .collection("stores")
    .doc(storeID)
    .collection("settings")
    .doc("settings");
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(settingsRef);
    if (!snap.exists) return;
    const data = snap.data() || {};
    const existing = Array.isArray(data.users) ? data.users : [];
    const idx = existing.findIndex((u) => u && u.id === perStoreEntry.id);
    let next;
    if (idx === -1) {
      next = [...existing, perStoreEntry];
    } else {
      next = existing.map((u, i) => (i === idx ? { ...u, ...perStoreEntry } : u));
    }
    tx.update(settingsRef, { users: next });
  });
}

async function removePerStoreUserEntry(db, tenantID, storeID, userID) {
  const settingsRef = db
    .collection("tenants")
    .doc(tenantID)
    .collection("stores")
    .doc(storeID)
    .collection("settings")
    .doc("settings");
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(settingsRef);
    if (!snap.exists) return;
    const data = snap.data() || {};
    const existing = Array.isArray(data.users) ? data.users : [];
    const next = existing.filter((u) => !u || u.id !== userID);
    if (next.length === existing.length) return;
    tx.update(settingsRef, { users: next });
  });
}

// Admin creates a new POS user directly (Dashboard_Admin "Add New User"
// flow). Provisions an Auth record with email + phone (no password), stamps
// {tenantID, privilege, stores[]} claims, writes the canonical identity to
// tenants/{tenantID}/users/{userID}, and appends a per-store entry to each
// store's settings.users[]. Caller must be manager or higher; cannot grant a
// privilege above their own; non-owners cannot assign users to stores they
// themselves don't have access to. Idempotent on the per-store array (same
// userID won't be appended twice) but the Auth user lookup is by email — if
// the email is already linked to a different tenant, the call is refused.
exports.tenantCreateUserCallable = onCall(
  { region: "us-central1" },
  async (request) => {
    const auth = requireAuth(request);
    assertPrivilege(auth, "manager");

    const tenantID = auth.token && auth.token.tenantID;
    if (!tenantID) {
      throw new HttpsError(
        "failed-precondition",
        "Caller's token is missing tenantID."
      );
    }

    const {
      first,
      last,
      email,
      phone,
      pin,
      alternatePin,
      permissions,
      stores,
      hourlyWage,
      faceDescriptor,
      linkedUserID,
      forwardSMS,
      hidden,
      preview,
    } = request.data || {};

    const normalizedFirst = normalizeName(first);
    if (!normalizedFirst) {
      throw new HttpsError("invalid-argument", "first is required (≤100 chars).");
    }
    const normalizedLast = normalizeName(last);
    if (!normalizedLast) {
      throw new HttpsError("invalid-argument", "last is required (≤100 chars).");
    }
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      throw new HttpsError("invalid-argument", "email is required.");
    }
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      throw new HttpsError(
        "invalid-argument",
        "phone is required (10-digit US or E.164)."
      );
    }
    const normalizedPin = normalizePin(pin);
    if (!normalizedPin) {
      throw new HttpsError(
        "invalid-argument",
        "pin is required and must be 1-12 digits."
      );
    }
    const normalizedAltPin = normalizeOptionalPin(alternatePin);
    if (normalizedAltPin === null) {
      throw new HttpsError(
        "invalid-argument",
        "alternatePin must be 1-12 digits or empty."
      );
    }
    const privilege = privilegeFromPermissions(permissions);
    if (!privilege) {
      throw new HttpsError(
        "invalid-argument",
        "permissions must include a valid level (1-5)."
      );
    }
    if (!Array.isArray(stores) || stores.length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "stores[] must include at least one storeID."
      );
    }
    const dedupedStores = Array.from(new Set(stores.filter(Boolean)));
    if (dedupedStores.length === 0) {
      throw new HttpsError("invalid-argument", "stores[] is empty after filtering.");
    }

    const callerPrivilege = auth.token.privilege;
    if (PRIVILEGE_RANK[privilege] > PRIVILEGE_RANK[callerPrivilege]) {
      throw new HttpsError(
        "permission-denied",
        "Cannot grant a privilege higher than your own."
      );
    }
    if (callerPrivilege !== "owner") {
      const callerStores = Array.isArray(auth.token.stores)
        ? auth.token.stores
        : [];
      for (const sid of dedupedStores) {
        if (!callerStores.includes(sid)) {
          throw new HttpsError(
            "permission-denied",
            `You cannot assign users to store ${sid}.`
          );
        }
      }
    }

    const displayName = `${normalizedFirst} ${normalizedLast}`;
    let user;
    try {
      user = await admin.auth().getUserByEmail(normalizedEmail);
    } catch (err) {
      if (err && err.code === "auth/user-not-found") {
        try {
          user = await admin.auth().createUser({
            email: normalizedEmail,
            phoneNumber: normalizedPhone,
            displayName,
            emailVerified: false,
          });
        } catch (createErr) {
          if (createErr && createErr.code === "auth/phone-number-already-exists") {
            throw new HttpsError(
              "already-exists",
              "That phone number is already linked to another account. Use a different number or update the existing user."
            );
          }
          throw createErr;
        }
      } else {
        throw err;
      }
    }

    const existingClaims = user.customClaims || {};
    if (existingClaims.tenantID && existingClaims.tenantID !== tenantID) {
      throw new HttpsError(
        "already-exists",
        "That email is already linked to a different tenant. Use a different email."
      );
    }

    const authUpdates = {};
    if (!user.email) authUpdates.email = normalizedEmail;
    if (!user.phoneNumber) authUpdates.phoneNumber = normalizedPhone;
    if (!user.displayName) authUpdates.displayName = displayName;
    if (Object.keys(authUpdates).length > 0) {
      try {
        await admin.auth().updateUser(user.uid, authUpdates);
      } catch (err) {
        logger.warn("tenantCreateUserCallable: Auth update partial", {
          uid: user.uid,
          error: err.message,
        });
      }
    }

    await setUserClaims(user.uid, {
      tenantID,
      privilege,
      stores: dedupedStores,
    });

    const userID = user.uid;
    const db = getFirestore();
    const tenantRef = db.collection("tenants").doc(tenantID);

    const tenantUserDoc = {
      first: normalizedFirst,
      last: normalizedLast,
      id: userID,
      permissions: {
        name: permissions.name || "",
        level: Number(permissions.level),
        id: permissions.id || "",
      },
      phone: normalizedPhone,
      email: normalizedEmail,
      pin: normalizedPin,
      alternatePin: normalizedAltPin,
      faceDescriptor: Array.isArray(faceDescriptor) ? faceDescriptor : "",
      linkedUserID:
        typeof linkedUserID === "string" && linkedUserID
          ? linkedUserID
          : userID,
      hourlyWage: typeof hourlyWage === "string" ? hourlyWage : "",
      stores: dedupedStores,
    };
    await tenantRef.collection("users").doc(userID).set(tenantUserDoc);

    const perStoreUserEntry = {
      id: userID,
      disabled: false,
      preview: typeof preview === "boolean" ? preview : true,
      forwardSMS: typeof forwardSMS === "boolean" ? forwardSMS : false,
      hidden: typeof hidden === "boolean" ? hidden : false,
      statuses: [],
      emailInboxes: [],
      pendingWorkorderIDs: [],
      loginMessageSuppressUntil: 0,
      personalNotes: [],
      showNewUserHelp: true,
    };
    for (const storeID of dedupedStores) {
      await upsertPerStoreUserEntry(db, tenantID, storeID, perStoreUserEntry);
    }

    logger.info("tenantCreateUserCallable: user created", {
      tenantID,
      userID,
      privilege,
      stores: dedupedStores,
      callerUID: auth.uid,
    });

    return { success: true, userID, tenantID, stores: dedupedStores };
  }
);

// Admin updates identity fields on an existing user. Writes to the tenant
// user doc (canonical); per-store ephemera (disabled, preview, forwardSMS,
// hidden, etc.) stays untouched. If privilege or stores[] changes, claims are
// re-stamped and per-store entries are added/removed to keep settings.users[]
// in sync with the new store assignment. Caller must be manager or higher;
// same privilege-cap rule as create.
exports.tenantUpdateUserCallable = onCall(
  { region: "us-central1" },
  async (request) => {
    const auth = requireAuth(request);
    assertPrivilege(auth, "manager");

    const tenantID = auth.token && auth.token.tenantID;
    if (!tenantID) {
      throw new HttpsError(
        "failed-precondition",
        "Caller's token is missing tenantID."
      );
    }

    const {
      userID,
      first,
      last,
      email,
      phone,
      pin,
      alternatePin,
      permissions,
      stores,
      hourlyWage,
      faceDescriptor,
      linkedUserID,
    } = request.data || {};

    if (!userID || typeof userID !== "string") {
      throw new HttpsError("invalid-argument", "userID is required.");
    }

    const db = getFirestore();
    const tenantRef = db.collection("tenants").doc(tenantID);
    const userRef = tenantRef.collection("users").doc(userID);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      throw new HttpsError("not-found", `User ${userID} not found in this tenant.`);
    }
    const existing = userSnap.data() || {};

    const normalizedFirst = normalizeName(first);
    if (!normalizedFirst) {
      throw new HttpsError("invalid-argument", "first is required.");
    }
    const normalizedLast = normalizeName(last);
    if (!normalizedLast) {
      throw new HttpsError("invalid-argument", "last is required.");
    }
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      throw new HttpsError("invalid-argument", "email is required.");
    }
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      throw new HttpsError("invalid-argument", "phone is required.");
    }
    const normalizedPin = normalizePin(pin);
    if (!normalizedPin) {
      throw new HttpsError(
        "invalid-argument",
        "pin is required and must be 1-12 digits."
      );
    }
    const normalizedAltPin = normalizeOptionalPin(alternatePin);
    if (normalizedAltPin === null) {
      throw new HttpsError(
        "invalid-argument",
        "alternatePin must be 1-12 digits or empty."
      );
    }
    const privilege = privilegeFromPermissions(permissions);
    if (!privilege) {
      throw new HttpsError(
        "invalid-argument",
        "permissions must include a valid level (1-5)."
      );
    }
    if (!Array.isArray(stores) || stores.length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "stores[] must include at least one storeID."
      );
    }
    const dedupedStores = Array.from(new Set(stores.filter(Boolean)));
    if (dedupedStores.length === 0) {
      throw new HttpsError("invalid-argument", "stores[] is empty after filtering.");
    }

    const callerPrivilege = auth.token.privilege;
    if (PRIVILEGE_RANK[privilege] > PRIVILEGE_RANK[callerPrivilege]) {
      throw new HttpsError(
        "permission-denied",
        "Cannot grant a privilege higher than your own."
      );
    }
    if (callerPrivilege !== "owner") {
      const callerStores = Array.isArray(auth.token.stores)
        ? auth.token.stores
        : [];
      for (const sid of dedupedStores) {
        if (!callerStores.includes(sid)) {
          throw new HttpsError(
            "permission-denied",
            `You cannot assign users to store ${sid}.`
          );
        }
      }
    }

    const authUpdates = {};
    try {
      const authUser = await admin.auth().getUser(userID);
      if (authUser.email !== normalizedEmail) authUpdates.email = normalizedEmail;
      if (authUser.phoneNumber !== normalizedPhone) {
        authUpdates.phoneNumber = normalizedPhone;
      }
      const displayName = `${normalizedFirst} ${normalizedLast}`;
      if (authUser.displayName !== displayName) {
        authUpdates.displayName = displayName;
      }
      if (Object.keys(authUpdates).length > 0) {
        await admin.auth().updateUser(userID, authUpdates);
      }
    } catch (err) {
      logger.warn("tenantUpdateUserCallable: Auth sync skipped", {
        uid: userID,
        error: err.message,
      });
    }

    await setUserClaims(userID, {
      tenantID,
      privilege,
      stores: dedupedStores,
    });

    const updatedDoc = {
      ...existing,
      first: normalizedFirst,
      last: normalizedLast,
      id: userID,
      permissions: {
        name: permissions.name || "",
        level: Number(permissions.level),
        id: permissions.id || "",
      },
      phone: normalizedPhone,
      email: normalizedEmail,
      pin: normalizedPin,
      alternatePin: normalizedAltPin,
      faceDescriptor:
        faceDescriptor === undefined
          ? existing.faceDescriptor || ""
          : Array.isArray(faceDescriptor)
          ? faceDescriptor
          : "",
      linkedUserID:
        typeof linkedUserID === "string" && linkedUserID
          ? linkedUserID
          : userID,
      hourlyWage: typeof hourlyWage === "string" ? hourlyWage : existing.hourlyWage || "",
      stores: dedupedStores,
    };
    await userRef.set(updatedDoc);

    // Sync per-store membership: add to newly-assigned stores, remove from
    // dropped stores. Existing per-store entries in retained stores keep
    // their ephemera (disabled, statuses, etc.).
    const previousStores = Array.isArray(existing.stores) ? existing.stores : [];
    const toAdd = dedupedStores.filter((s) => !previousStores.includes(s));
    const toRemove = previousStores.filter((s) => !dedupedStores.includes(s));

    const newEntryTemplate = {
      id: userID,
      disabled: false,
      preview: true,
      forwardSMS: false,
      hidden: false,
      statuses: [],
      emailInboxes: [],
      pendingWorkorderIDs: [],
      loginMessageSuppressUntil: 0,
      personalNotes: [],
      showNewUserHelp: true,
    };
    for (const storeID of toAdd) {
      await upsertPerStoreUserEntry(db, tenantID, storeID, newEntryTemplate);
    }
    for (const storeID of toRemove) {
      await removePerStoreUserEntry(db, tenantID, storeID, userID);
    }

    logger.info("tenantUpdateUserCallable: user updated", {
      tenantID,
      userID,
      privilege,
      stores: dedupedStores,
      callerUID: auth.uid,
    });

    return { success: true, userID, tenantID, stores: dedupedStores };
  }
);

// Admin removes a user from the tenant. Deletes the tenant user doc, strips
// per-store entries from every store's settings.users[], and clears the
// custom claims on the Auth record. The Auth record itself is NOT deleted
// (it may be tied to other services or the user may rejoin later); revoking
// claims is sufficient to lock them out of this tenant. Caller must be
// manager or higher and cannot delete a user with higher privilege than
// their own.
exports.tenantDeleteUserCallable = onCall(
  { region: "us-central1" },
  async (request) => {
    const auth = requireAuth(request);
    assertPrivilege(auth, "manager");

    const tenantID = auth.token && auth.token.tenantID;
    if (!tenantID) {
      throw new HttpsError(
        "failed-precondition",
        "Caller's token is missing tenantID."
      );
    }

    const { userID } = request.data || {};
    if (!userID || typeof userID !== "string") {
      throw new HttpsError("invalid-argument", "userID is required.");
    }
    if (userID === auth.uid) {
      throw new HttpsError(
        "failed-precondition",
        "You cannot delete your own user."
      );
    }

    const db = getFirestore();
    const tenantRef = db.collection("tenants").doc(tenantID);
    const userRef = tenantRef.collection("users").doc(userID);
    const userSnap = await userRef.get();

    let targetStores = [];
    if (userSnap.exists) {
      const targetUser = userSnap.data() || {};
      const targetPriv = privilegeFromPermissions(targetUser.permissions);
      const callerPrivilege = auth.token.privilege;
      if (
        targetPriv &&
        PRIVILEGE_RANK[targetPriv] > PRIVILEGE_RANK[callerPrivilege]
      ) {
        throw new HttpsError(
          "permission-denied",
          "Cannot delete a user with higher privilege than your own."
        );
      }
      targetStores = Array.isArray(targetUser.stores) ? targetUser.stores : [];
    }

    for (const storeID of targetStores) {
      await removePerStoreUserEntry(db, tenantID, storeID, userID);
    }

    if (userSnap.exists) {
      await userRef.delete();
    }

    try {
      await admin.auth().setCustomUserClaims(userID, {});
    } catch (err) {
      logger.warn("tenantDeleteUserCallable: claim clear skipped", {
        uid: userID,
        error: err.message,
      });
    }

    logger.info("tenantDeleteUserCallable: user removed", {
      tenantID,
      userID,
      callerUID: auth.uid,
    });

    return { success: true, userID, tenantID };
  }
);

// ===========================================================================
// Passwordless sign-in (Phase 3): request a 6-digit code via email, verify
// it back to mint a custom-token sign-in. Persistent claims (set by tenant
// create/update/bootstrap) carry {tenantID, privilege, stores[]} and flow
// through the resulting ID token automatically, so the client doesn't need
// developer claims on the custom token.
//
// SMS delivery is not yet wired — platform Twilio isn't configured. Phone
// identifiers are accepted at lookup time (the Auth record may be indexed by
// phone), but the code itself is delivered to the user's email on file.
// ===========================================================================

const SIGN_IN_CODE_TTL_MS = 10 * 60 * 1000;
const SIGN_IN_CODE_MAX_ATTEMPTS = 5;

async function lookupAuthUserByIdentifier(identifier) {
  if (!identifier || typeof identifier !== "string") {
    throw new HttpsError("invalid-argument", "identifier is required.");
  }
  const trimmed = identifier.trim();
  if (trimmed.includes("@")) {
    const normalized = normalizeEmail(trimmed);
    if (!normalized) {
      throw new HttpsError("invalid-argument", "Invalid email address.");
    }
    try {
      return await admin.auth().getUserByEmail(normalized);
    } catch (err) {
      if (err && err.code === "auth/user-not-found") {
        throw new HttpsError("not-found", "No account matches that email.");
      }
      throw err;
    }
  }
  const normalized = normalizePhone(trimmed);
  if (!normalized) {
    throw new HttpsError("invalid-argument", "Invalid phone number.");
  }
  try {
    return await admin.auth().getUserByPhoneNumber(normalized);
  } catch (err) {
    if (err && err.code === "auth/user-not-found") {
      throw new HttpsError("not-found", "No account matches that phone number.");
    }
    throw err;
  }
}

// 6-digit numeric code (100000-999999). crypto-random, no leading-zero
// truncation when rendered as a decimal string.
function generateSignInCode() {
  const buf = crypto.randomBytes(4);
  const n = (buf.readUInt32BE(0) % 900000) + 100000;
  return String(n);
}

function maskEmail(email) {
  if (!email || typeof email !== "string") return "";
  const at = email.indexOf("@");
  if (at < 2) return email;
  return `${email.slice(0, 2)}***${email.slice(at)}`;
}

// Anyone can call (no auth required) — this IS the pre-sign-in step. Looks
// up the Auth user by email or phone, generates a code, stores it at
// tenants/{tenantID}/sign_in_codes/{uid} with a 10-minute TTL, and emails
// the code to the user's address on file. Returning a not-found error here
// leaks identifier existence; a future hardening pass should return a
// generic "if it matches, we sent a code" response.
exports.requestSignInCodeCallable = onCall(
  {
    region: "us-central1",
    secrets: [
      PLATFORM_NOREPLY_EMAIL,
      PLATFORM_NOREPLY_SMTP_USER,
      PLATFORM_NOREPLY_APP_PASSWORD,
    ],
  },
  async (request) => {
    const { identifier } = request.data || {};
    const authUser = await lookupAuthUserByIdentifier(identifier);
    const claims = authUser.customClaims || {};
    const tenantID = claims.tenantID;
    if (!tenantID) {
      throw new HttpsError(
        "failed-precondition",
        "This account is not assigned to a tenant."
      );
    }
    const targetEmail = authUser.email;
    if (!targetEmail) {
      throw new HttpsError(
        "failed-precondition",
        "Account has no email on file. Contact your admin."
      );
    }

    const code = generateSignInCode();
    const db = getFirestore();
    const codeRef = db
      .collection("tenants")
      .doc(tenantID)
      .collection("sign_in_codes")
      .doc(authUser.uid);
    await codeRef.set({
      code,
      createdAt: Date.now(),
      attempts: 0,
      method: "email",
    });

    const fromEmail = PLATFORM_NOREPLY_EMAIL.value();
    const smtpUser = PLATFORM_NOREPLY_SMTP_USER.value();
    const fromPassword = PLATFORM_NOREPLY_APP_PASSWORD.value();
    if (!fromEmail || !smtpUser || !fromPassword) {
      throw new HttpsError(
        "failed-precondition",
        "Platform email is not configured."
      );
    }
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: smtpUser, pass: fromPassword },
    });
    const subject = "Your Cadence sign-in code";
    const html = `<p>Your Cadence sign-in code is:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:4px;">${code}</p>
<p>This code expires in 10 minutes.</p>
<p>If you didn't request this, you can ignore this email.</p>`;

    try {
      await transporter.sendMail({
        from: `"Cadence POS" <${fromEmail}>`,
        to: targetEmail,
        subject,
        html,
      });
    } catch (err) {
      logger.error("requestSignInCodeCallable: email send failed", {
        uid: authUser.uid,
        tenantID,
        error: err.message,
      });
      throw new HttpsError("internal", "Failed to send sign-in code.");
    }

    logger.info("requestSignInCodeCallable: code sent", {
      tenantID,
      uid: authUser.uid,
    });

    return {
      success: true,
      delivery: "email",
      to: maskEmail(targetEmail),
    };
  }
);

// Anyone can call. Validates the code, confirms the user still has at least
// one non-disabled store, and mints a custom token the client uses with
// signInWithCustomToken(). Returns the user's stores plus a filtered
// enabledStores list so the client store-picker can grey out disabled
// options without an extra round trip.
exports.verifySignInCodeCallable = onCall(
  { region: "us-central1" },
  async (request) => {
    const { identifier, code } = request.data || {};
    if (!code || typeof code !== "string") {
      throw new HttpsError("invalid-argument", "code is required.");
    }
    const authUser = await lookupAuthUserByIdentifier(identifier);
    const claims = authUser.customClaims || {};
    const tenantID = claims.tenantID;
    if (!tenantID) {
      throw new HttpsError(
        "failed-precondition",
        "This account is not assigned to a tenant."
      );
    }

    const db = getFirestore();
    const codeRef = db
      .collection("tenants")
      .doc(tenantID)
      .collection("sign_in_codes")
      .doc(authUser.uid);
    const codeSnap = await codeRef.get();
    if (!codeSnap.exists) {
      throw new HttpsError(
        "not-found",
        "No pending sign-in code. Request a new one."
      );
    }
    const codeDoc = codeSnap.data() || {};
    const now = Date.now();
    if (now - (codeDoc.createdAt || 0) > SIGN_IN_CODE_TTL_MS) {
      await codeRef.delete();
      throw new HttpsError(
        "deadline-exceeded",
        "Sign-in code expired. Request a new one."
      );
    }
    const attempts = Number(codeDoc.attempts) || 0;
    if (attempts >= SIGN_IN_CODE_MAX_ATTEMPTS) {
      await codeRef.delete();
      throw new HttpsError(
        "resource-exhausted",
        "Too many attempts. Request a new code."
      );
    }
    if (String(codeDoc.code) !== String(code).trim()) {
      await codeRef.update({ attempts: attempts + 1 });
      throw new HttpsError("permission-denied", "Incorrect code. Try again.");
    }

    const userDocSnap = await db
      .collection("tenants")
      .doc(tenantID)
      .collection("users")
      .doc(authUser.uid)
      .get();
    if (!userDocSnap.exists) {
      throw new HttpsError(
        "failed-precondition",
        "User has no tenant identity record. Contact your admin."
      );
    }

    const userStores = Array.isArray(claims.stores) ? claims.stores : [];
    const storeResults = await Promise.all(
      userStores.map(async (storeID) => {
        try {
          const settingsSnap = await db
            .collection("tenants")
            .doc(tenantID)
            .collection("stores")
            .doc(storeID)
            .collection("settings")
            .doc("settings")
            .get();
          if (!settingsSnap.exists) return { storeID, enabled: false, displayName: "" };
          const data = settingsSnap.data() || {};
          const displayName =
            (data.storeInfo && typeof data.storeInfo.displayName === "string"
              ? data.storeInfo.displayName
              : "") || "";
          const usersArr = Array.isArray(data.users) ? data.users : [];
          const entry = usersArr.find((u) => u && u.id === authUser.uid);
          if (!entry) return { storeID, enabled: false, displayName };
          return {
            storeID,
            enabled: entry.disabled !== true,
            displayName,
          };
        } catch (err) {
          logger.warn("verifySignInCodeCallable: store check failed", {
            tenantID,
            storeID,
            uid: authUser.uid,
            error: err.message,
          });
          return { storeID, enabled: false, displayName: "" };
        }
      })
    );
    const enabledStores = storeResults
      .filter((r) => r.enabled)
      .map((r) => ({ storeID: r.storeID, displayName: r.displayName || "" }));
    const disabledStores = storeResults
      .filter((r) => !r.enabled)
      .map((r) => ({ storeID: r.storeID, displayName: r.displayName || "" }));

    if (enabledStores.length === 0) {
      throw new HttpsError(
        "permission-denied",
        "Your account is disabled in all stores. Contact your admin."
      );
    }

    await codeRef.delete();

    const token = await admin.auth().createCustomToken(authUser.uid);
    logger.info("verifySignInCodeCallable: token minted", {
      tenantID,
      uid: authUser.uid,
      enabledStores,
    });

    return {
      success: true,
      token,
      tenantID,
      stores: userStores,
      enabledStores,
      disabledStores,
    };
  }
);

// Sends the owner a fresh sign-in link via the platform's noreply@ Gmail
// account. Each call regenerates the magic link (Firebase links are single-
// use), so re-clicking "Email link" mid-flow is safe.
//
// Gmail SMTP auth must use the PARENT Workspace account; noreply@ is a
// free Workspace alias and has no password of its own. PLATFORM_NOREPLY_SMTP_USER
// is the parent address used for AUTH; PLATFORM_NOREPLY_EMAIL is the alias used
// in the From header. The alias must be registered in the parent account's
// Gmail → Settings → Accounts → "Send mail as" list (Workspace aliases are
// usually auto-added).
exports.platformAdminSendOwnerWelcomeEmailCallable = onCall(
  {
    region: "us-central1",
    secrets: [
      PLATFORM_NOREPLY_EMAIL,
      PLATFORM_NOREPLY_SMTP_USER,
      PLATFORM_NOREPLY_APP_PASSWORD,
    ],
  },
  async (request) => {
    const auth = requireAuth(request);
    assertPlatformAdmin(auth);

    const { tenantID } = request.data || {};
    if (!tenantID || typeof tenantID !== "string") {
      throw new HttpsError("invalid-argument", "tenantID is required.");
    }

    const db = getFirestore();
    const tenantSnap = await db.collection("tenants").doc(tenantID).get();
    if (!tenantSnap.exists) {
      throw new HttpsError("not-found", `Tenant ${tenantID} not found.`);
    }
    const tenant = tenantSnap.data() || {};
    const ownerEmail = tenant.ownerEmail;
    const tenantName = tenant.name || tenantID;
    if (!ownerEmail) {
      throw new HttpsError(
        "failed-precondition",
        `Tenant ${tenantID} has no ownerEmail.`
      );
    }

    const signInLink = await admin
      .auth()
      .generateSignInWithEmailLink(ownerEmail, {
        url: `${INVITE_LANDING_URL}?bootstrap=1`,
        handleCodeInApp: true,
      });

    const fromEmail = PLATFORM_NOREPLY_EMAIL.value();
    const smtpUser = PLATFORM_NOREPLY_SMTP_USER.value();
    const fromPassword = PLATFORM_NOREPLY_APP_PASSWORD.value();
    if (!fromEmail || !smtpUser || !fromPassword) {
      throw new HttpsError(
        "failed-precondition",
        "PLATFORM_NOREPLY_EMAIL, PLATFORM_NOREPLY_SMTP_USER, and PLATFORM_NOREPLY_APP_PASSWORD must be set."
      );
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: smtpUser, pass: fromPassword },
    });

    const subject = `Welcome to Cadence — set up ${tenantName}`;
    const html = `<p>Welcome to Cadence.</p>
<p>When you click the link below you'll be asked to fill in your store's setup details, so please have the following ready:</p>
${renderBootstrapFieldsListHtml()}
${renderStripePaymentsInfoBlockHtml()}
<p>Click the link to set up your store:</p>
<p><a href="${signInLink}">${signInLink}</a></p>
<p>This link is single-use and expires after a short time.</p>
${renderResendLinkFooterHtml(ownerEmail)}`;

    try {
      const info = await transporter.sendMail({
        from: `"Cadence POS" <${fromEmail}>`,
        to: ownerEmail,
        subject,
        html,
      });
      logger.info("platformAdminSendOwnerWelcomeEmailCallable: sent", {
        tenantID,
        ownerEmail,
        messageId: info.messageId,
        byUID: auth.uid,
      });
      return {
        success: true,
        ownerEmail,
        messageId: info.messageId,
      };
    } catch (err) {
      logger.error("platformAdminSendOwnerWelcomeEmailCallable: send failed", {
        tenantID,
        ownerEmail,
        error: err.message,
        byUID: auth.uid,
      });
      throw new HttpsError(
        "internal",
        `Failed to send welcome email: ${err.message}`
      );
    }
  }
);

// Public callable invoked from InviteAcceptScreen's error stage when the
// owner clicks an expired (or already-consumed) welcome magic link. Takes
// just an email, looks up the matching tenant, regenerates the sign-in link,
// and re-sends the welcome email. Returns success regardless of whether the
// email matches a tenant (no enumeration leak). Includes a 60-second
// per-tenant throttle so the endpoint can't be hammered.
const WELCOME_RESEND_THROTTLE_MS = 60 * 1000;

exports.requestOwnerWelcomeResendCallable = onCall(
  {
    region: "us-central1",
    secrets: [
      PLATFORM_NOREPLY_EMAIL,
      PLATFORM_NOREPLY_SMTP_USER,
      PLATFORM_NOREPLY_APP_PASSWORD,
    ],
  },
  async (request) => {
    const { email } = request.data || {};
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      throw new HttpsError("invalid-argument", "email is required.");
    }

    const db = getFirestore();
    const tenantsSnap = await db
      .collection("tenants")
      .where("ownerEmail", "==", normalizedEmail)
      .limit(1)
      .get();

    if (tenantsSnap.empty) {
      logger.info("requestOwnerWelcomeResendCallable: no tenant for email", {
        email: normalizedEmail,
      });
      return { success: true };
    }

    const tenantDoc = tenantsSnap.docs[0];
    const tenantID = tenantDoc.id;
    const tenant = tenantDoc.data() || {};

    const lastSent = tenant.lastWelcomeEmailSentAt;
    if (lastSent && typeof lastSent.toMillis === "function") {
      const elapsed = Date.now() - lastSent.toMillis();
      if (elapsed < WELCOME_RESEND_THROTTLE_MS) {
        logger.info("requestOwnerWelcomeResendCallable: throttled", {
          tenantID,
          elapsedMs: elapsed,
        });
        return { success: true };
      }
    }

    const fromEmail = PLATFORM_NOREPLY_EMAIL.value();
    const smtpUser = PLATFORM_NOREPLY_SMTP_USER.value();
    const fromPassword = PLATFORM_NOREPLY_APP_PASSWORD.value();
    if (!fromEmail || !smtpUser || !fromPassword) {
      throw new HttpsError(
        "failed-precondition",
        "Welcome-email secrets are not configured."
      );
    }

    const signInLink = await admin
      .auth()
      .generateSignInWithEmailLink(normalizedEmail, {
        url: `${INVITE_LANDING_URL}?bootstrap=1`,
        handleCodeInApp: true,
      });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: smtpUser, pass: fromPassword },
    });

    const tenantName = tenant.name || tenantID;
    const subject = `Your new sign-in link for ${tenantName}`;
    const html = `<p>Here's a fresh sign-in link for Cadence.</p>
<p>When you click the link you'll be asked to fill in your store's setup details, so please have the following ready:</p>
${renderBootstrapFieldsListHtml()}
<p><a href="${signInLink}">${signInLink}</a></p>
<p>This link is single-use and expires after a short time.</p>
${renderResendLinkFooterHtml(normalizedEmail)}`;

    try {
      const info = await transporter.sendMail({
        from: `"Cadence POS" <${fromEmail}>`,
        to: normalizedEmail,
        subject,
        html,
      });
      await tenantDoc.ref.update({
        lastWelcomeEmailSentAt: FieldValue.serverTimestamp(),
      });
      logger.info("requestOwnerWelcomeResendCallable: sent", {
        tenantID,
        ownerEmail: normalizedEmail,
        messageId: info.messageId,
      });
    } catch (err) {
      logger.error("requestOwnerWelcomeResendCallable: send failed", {
        tenantID,
        ownerEmail: normalizedEmail,
        error: err.message,
      });
      // Don't surface send failures to the caller (no enumeration leak); the
      // logs are enough to debug.
    }

    return { success: true };
  }
);

// Owner-side bootstrap completion. Called from InviteAcceptScreen after the
// owner clicks the welcome magic link and confirms their email. Takes the
// store form (display name + address + phone + sales tax) and the chosen
// 4-digit PIN, populates the stub store created at tenant time, and marks
// isSetupComplete=true. The owner's Firebase Auth record stays passwordless;
// future sign-ins go through the passwordless email/SMS code flow.
// Also accepts the Stripe Payments Info collected on the same form
// (business URL, bank account, DOB, SSN last 4) and pushes those to the
// tenant's existing Connect account via applyOwnerKYCInternal. Each Stripe
// step is best-effort — the store gets created either way; KYC errors are
// surfaced in the return value so the UI can prompt for retry.
// Idempotency: refuses to run if the store is already marked setup-complete.
exports.ownerCompleteBootstrapCallable = onCall(
  {
    region: "us-central1",
    secrets: [
      stripeConnectInternals.STRIPE_PLATFORM_SECRET_KEY,
      PLATFORM_NOREPLY_EMAIL,
      PLATFORM_NOREPLY_SMTP_USER,
      PLATFORM_NOREPLY_APP_PASSWORD,
    ],
  },
  async (request) => {
    const auth = requireAuth(request);
    const claims = auth.token || {};
    const tenantID = claims.tenantID;
    const privilege = claims.privilege;
    const storeIDs = Array.isArray(claims.stores) ? claims.stores : [];

    if (!tenantID || privilege !== "owner" || storeIDs.length === 0) {
      throw new HttpsError(
        "permission-denied",
        "Caller is not a tenant owner with a provisioned store."
      );
    }
    const storeID = storeIDs[0];

    const {
      storeLegalName,
      storeDisplayName,
      storeStreet,
      storeUnit,
      storeCity,
      storeState,
      storeZip,
      storePhone,
      storeSupportEmail,
      storeOfficeEmail,
      salesTaxPercent,
      userPin,
      stripePaymentsInfo,
    } = request.data || {};

    const normalizedLegalName = normalizeStoreString(storeLegalName, 200);
    if (!normalizedLegalName) {
      throw new HttpsError(
        "invalid-argument",
        "storeLegalName is required (≤200 chars)."
      );
    }
    const normalizedDisplayName = normalizeStoreString(storeDisplayName, 100);
    if (!normalizedDisplayName) {
      throw new HttpsError(
        "invalid-argument",
        "storeDisplayName is required (≤100 chars)."
      );
    }
    const normalizedStreet = normalizeStoreString(storeStreet, 200);
    if (!normalizedStreet) {
      throw new HttpsError("invalid-argument", "storeStreet is required (≤200 chars).");
    }
    const normalizedUnit = normalizeOptionalStoreString(storeUnit, 50);
    if (normalizedUnit === null) {
      throw new HttpsError("invalid-argument", "storeUnit must be a string ≤50 chars.");
    }
    const normalizedCity = normalizeStoreString(storeCity, 100);
    if (!normalizedCity) {
      throw new HttpsError("invalid-argument", "storeCity is required (≤100 chars).");
    }
    const normalizedState = normalizeStoreString(storeState, 2);
    if (!normalizedState || !/^[A-Za-z]{2}$/.test(normalizedState)) {
      throw new HttpsError("invalid-argument", "storeState must be a 2-letter code.");
    }
    // Postal code validated against tenant.country after tenant doc fetched
    // below — see `normalizedZip` assignment near tenant lookup.
    const normalizedStorePhone = normalizePhone(storePhone);
    if (!normalizedStorePhone) {
      throw new HttpsError(
        "invalid-argument",
        "storePhone is required and must be a valid 10-digit US number or E.164 international format."
      );
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const normalizedSupportEmail = normalizeEmail(storeSupportEmail);
    if (!normalizedSupportEmail || !emailRegex.test(normalizedSupportEmail)) {
      throw new HttpsError(
        "invalid-argument",
        "storeSupportEmail is required and must be a valid email."
      );
    }
    const normalizedOfficeEmail = normalizeEmail(storeOfficeEmail);
    if (!normalizedOfficeEmail || !emailRegex.test(normalizedOfficeEmail)) {
      throw new HttpsError(
        "invalid-argument",
        "storeOfficeEmail is required and must be a valid email."
      );
    }
    const normalizedTax = normalizeSalesTaxPercent(salesTaxPercent);
    if (normalizedTax === null) {
      throw new HttpsError(
        "invalid-argument",
        "salesTaxPercent is required and must be a number between 0 and 100."
      );
    }
    if (typeof userPin !== "string" || !/^\d{4}$/.test(userPin)) {
      throw new HttpsError(
        "invalid-argument",
        "userPin must be exactly 4 digits."
      );
    }

    // Stripe Payments Info validation. All fields required — owner can't
    // bypass card payments setup at bootstrap; this is the only flow that
    // collects them before Stripe's hosted onboarding kicks in.
    if (!stripePaymentsInfo || typeof stripePaymentsInfo !== "object") {
      throw new HttpsError(
        "invalid-argument",
        "stripePaymentsInfo is required."
      );
    }
    const businessUrlRaw =
      typeof stripePaymentsInfo.businessUrl === "string"
        ? stripePaymentsInfo.businessUrl.trim()
        : "";
    if (!/^https?:\/\/\S+\.\S+/.test(businessUrlRaw)) {
      throw new HttpsError(
        "invalid-argument",
        "stripePaymentsInfo.businessUrl must be a full http(s) URL."
      );
    }
    const bankRoutingRaw =
      typeof stripePaymentsInfo.bankRouting === "string"
        ? stripePaymentsInfo.bankRouting.replace(/\D/g, "")
        : "";
    if (!/^\d{9}$/.test(bankRoutingRaw)) {
      throw new HttpsError(
        "invalid-argument",
        "stripePaymentsInfo.bankRouting must be exactly 9 digits."
      );
    }
    const bankAccountRaw =
      typeof stripePaymentsInfo.bankAccount === "string"
        ? stripePaymentsInfo.bankAccount.replace(/\D/g, "")
        : "";
    if (!/^\d{4,17}$/.test(bankAccountRaw)) {
      throw new HttpsError(
        "invalid-argument",
        "stripePaymentsInfo.bankAccount must be 4-17 digits."
      );
    }
    const dobRaw = stripePaymentsInfo.dob || {};
    const dobMonthNum = Number(dobRaw.month);
    const dobDayNum = Number(dobRaw.day);
    const dobYearNum = Number(dobRaw.year);
    const currentYear = new Date().getFullYear();
    if (
      !Number.isInteger(dobMonthNum) ||
      dobMonthNum < 1 ||
      dobMonthNum > 12 ||
      !Number.isInteger(dobDayNum) ||
      dobDayNum < 1 ||
      dobDayNum > 31 ||
      !Number.isInteger(dobYearNum) ||
      dobYearNum < 1900 ||
      dobYearNum > currentYear - 13
    ) {
      throw new HttpsError(
        "invalid-argument",
        "stripePaymentsInfo.dob must be a valid date (owner at least 13 years old)."
      );
    }
    const ssnLast4Raw =
      typeof stripePaymentsInfo.ssnLast4 === "string"
        ? stripePaymentsInfo.ssnLast4
        : "";
    if (!/^\d{4}$/.test(ssnLast4Raw)) {
      throw new HttpsError(
        "invalid-argument",
        "stripePaymentsInfo.ssnLast4 must be exactly 4 digits."
      );
    }

    const db = getFirestore();
    const tenantRef = db.collection("tenants").doc(tenantID);
    const tenantSnap = await tenantRef.get();
    if (!tenantSnap.exists) {
      throw new HttpsError("not-found", `Tenant ${tenantID} not found.`);
    }
    const tenantData = tenantSnap.data() || {};
    if (tenantData.ownerUID !== auth.uid) {
      throw new HttpsError(
        "permission-denied",
        "Caller is not the owner of this tenant."
      );
    }
    const tenantCountryForStore = tenantData.country || "US";
    const normalizedZip = normalizeZip(storeZip, tenantCountryForStore);
    if (!normalizedZip) {
      throw new HttpsError(
        "invalid-argument",
        tenantCountryForStore === "CA"
          ? "storeZip must be a Canadian postal code (e.g. A1A 1A1)."
          : "storeZip must be 5 digits or ZIP+4."
      );
    }

    const storeRef = tenantRef.collection("stores").doc(storeID);
    const storeSnap = await storeRef.get();
    if (!storeSnap.exists) {
      throw new HttpsError("not-found", `Store ${storeID} not found.`);
    }
    if (storeSnap.data()?.isSetupComplete === true) {
      throw new HttpsError(
        "failed-precondition",
        "Store setup is already complete."
      );
    }

    const storeAddress = {
      street: normalizedStreet,
      unit: normalizedUnit,
      city: normalizedCity,
      state: normalizedState.toUpperCase(),
      zip: normalizedZip,
      phone: normalizedStorePhone,
      supportEmail: normalizedSupportEmail,
      officeEmail: normalizedOfficeEmail,
    };

    // Flip the setup-complete gate on the store doc. All operational fields
    // (legalName, displayName, address, emails, sales tax) are written into
    // the settings doc below — store doc holds only billing wiring + gating
    // + audit.
    await storeRef.update({
      isSetupComplete: true,
      setupCompletedAt: FieldValue.serverTimestamp(),
    });

    // Settings doc was created at tenant time with null/empty storeInfo. Now
    // we apply the real overrides so the running app reads the right values.
    // We also seed the users array with an Owner-privilege APP_USER record
    // built from the tenant signup data + the PIN the owner just chose, so
    // they can immediately log into the in-app POS from the login screen.
    const settingsRef = storeRef.collection("settings").doc("settings");
    const settingsSnap = await settingsRef.get();
    if (settingsSnap.exists) {
      const existingSettings = settingsSnap.data();
      const updatedSettings = applyStoreOverrides(existingSettings, {
        tenantID,
        storeID,
        storeDisplayName: normalizedDisplayName,
        storeLegalName: normalizedLegalName,
        storeAddress,
        salesTaxPercent: normalizedTax,
      });

      // Storage split: identity lives on tenants/{tenantID}/users/{userID}
      // (canonical). Per-store presence + ephemera + the disabled flag live
      // on settings.users[i]. The in-app settings listener hydrates per-store
      // entries with identity from the tenant-level docs so readers see the
      // merged APP_USER shape via useSettingsStore.settings.users[]. Keyed by
      // Firebase Auth UID so the passwordless sign-in flow can address the
      // tenant user doc directly.
      const userID = auth.uid;

      const tenantUserDoc = {
        first: tenantData.ownerFirstName || "",
        last: tenantData.ownerLastName || "",
        id: userID,
        permissions: { name: "Owner", level: 5, id: "ownr_lvl" },
        phone: tenantData.ownerPhone || "",
        email: tenantData.ownerEmail || "",
        pin: userPin,
        faceDescriptor: "",
        linkedUserID: userID,
        hourlyWage: "",
        stores: [storeID],
      };

      const perStoreUserEntry = {
        id: userID,
        disabled: false,
        preview: true,
        forwardSMS: false,
        hidden: false,
        statuses: [],
        emailInboxes: [],
        pendingWorkorderIDs: [],
        loginMessageSuppressUntil: 0,
        personalNotes: [],
        showNewUserHelp: true,
      };

      const tenantUserRef = tenantRef.collection("users").doc(userID);
      await tenantUserRef.set(tenantUserDoc);

      updatedSettings.users = Array.isArray(updatedSettings.users)
        ? [...updatedSettings.users, perStoreUserEntry]
        : [perStoreUserEntry];

      await settingsRef.set(updatedSettings);
    }

    // Push Stripe Payments Info to the existing Connect account. Each step
    // is best-effort inside applyOwnerKYCInternal — failures don't abort
    // bootstrap, they're surfaced in the return value so the dashboard /
    // owner UI can prompt for retry against Stripe's hosted onboarding.
    let stripeKYCResult = {
      businessUrlError: null,
      bankAccountError: null,
      representativeKYCError: null,
      noConnectAccount: false,
    };
    try {
      const stripeAccountID =
        await stripeConnectInternals.findTenantConnectAccountID(db, tenantID);
      if (!stripeAccountID) {
        stripeKYCResult.noConnectAccount = true;
        logger.warn("ownerCompleteBootstrapCallable: no Connect account for tenant", {
          tenantID,
          storeID,
        });
      } else {
        const accountHolderName =
          [tenantData.ownerFirstName || "", tenantData.ownerLastName || ""]
            .filter(Boolean)
            .join(" ") || tenantData.name || "";
        const tosIp =
          (request.rawRequest &&
            (request.rawRequest.ip ||
              (request.rawRequest.headers &&
                request.rawRequest.headers["x-forwarded-for"]))) ||
          "127.0.0.1";
        const applyErrs = await stripeConnectInternals.applyOwnerKYCInternal({
          secret: stripeConnectInternals.STRIPE_PLATFORM_SECRET_KEY,
          stripeAccountID,
          businessUrl: businessUrlRaw,
          bankRouting: bankRoutingRaw,
          bankAccount: bankAccountRaw,
          accountHolderName,
          accountHolderType: "individual",
          dob: { day: dobDayNum, month: dobMonthNum, year: dobYearNum },
          ssnLast4: ssnLast4Raw,
          tosIp:
            typeof tosIp === "string" ? tosIp.split(",")[0].trim() : "127.0.0.1",
        });
        stripeKYCResult = { ...stripeKYCResult, ...applyErrs };
      }
    } catch (err) {
      // Should be unreachable — applyOwnerKYCInternal catches internally.
      logger.error("ownerCompleteBootstrapCallable: Stripe KYC push unexpected failure", {
        tenantID,
        storeID,
        error: err && err.message,
      });
      stripeKYCResult.representativeKYCError =
        err && err.message ? err.message : String(err);
    }

    // Mark the owner's Auth record as email-verified so subsequent flows
    // don't treat them as unverified. The account stays passwordless; future
    // sign-ins go through the passwordless email/SMS code flow.
    try {
      await admin.auth().updateUser(auth.uid, { emailVerified: true });
    } catch (err) {
      logger.error("ownerCompleteBootstrapCallable: emailVerified set failed", {
        tenantID,
        storeID,
        uid: auth.uid,
        error: err.message,
      });
      throw new HttpsError(
        "internal",
        `Failed to mark email verified: ${err.message}`
      );
    }

    logger.info("ownerCompleteBootstrapCallable: bootstrap complete", {
      tenantID,
      storeID,
      uid: auth.uid,
      stripeKYCResult,
    });

    // Owner setup summary email — sends a recap of everything they just
    // entered (including the PIN) to the owner's email for safekeeping.
    // Best-effort: a failed send doesn't abort the bootstrap since all data
    // is already persisted; the failure is logged for follow-up.
    let setupSummaryEmailSent = false;
    let setupSummaryEmailError = null;
    try {
      const fromEmail = PLATFORM_NOREPLY_EMAIL.value();
      const smtpUser = PLATFORM_NOREPLY_SMTP_USER.value();
      const fromPassword = PLATFORM_NOREPLY_APP_PASSWORD.value();
      if (!fromEmail || !smtpUser || !fromPassword) {
        throw new Error(
          "PLATFORM_NOREPLY_EMAIL, PLATFORM_NOREPLY_SMTP_USER, and PLATFORM_NOREPLY_APP_PASSWORD must be set."
        );
      }
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: smtpUser, pass: fromPassword },
      });
      const summaryHtml = renderOwnerSetupSummaryHtml({
        tenantData,
        normalizedLegalName,
        normalizedDisplayName,
        storeAddress,
        normalizedTax,
        userPin,
        businessUrlRaw,
        bankRoutingRaw,
        bankAccountRaw,
        dobMonthNum,
        dobDayNum,
        dobYearNum,
        ssnLast4Raw,
      });
      const subject = `Your ${normalizedDisplayName} setup details — keep this for your records`;
      const info = await transporter.sendMail({
        from: `"Cadence POS" <${fromEmail}>`,
        to: tenantData.ownerEmail,
        subject,
        html: summaryHtml,
      });
      setupSummaryEmailSent = true;
      logger.info("ownerCompleteBootstrapCallable: setup summary email sent", {
        tenantID,
        storeID,
        ownerEmail: tenantData.ownerEmail,
        messageId: info.messageId,
      });
    } catch (err) {
      setupSummaryEmailError = err && err.message ? err.message : String(err);
      logger.error("ownerCompleteBootstrapCallable: setup summary email failed", {
        tenantID,
        storeID,
        ownerEmail: tenantData.ownerEmail,
        error: setupSummaryEmailError,
      });
    }

    return {
      success: true,
      tenantID,
      storeID,
      stripeKYCResult,
      setupSummaryEmailSent,
      setupSummaryEmailError,
    };
  }
);

// Permanently deletes a tenant's Firestore footprint (tenant doc + all
// subcollections) and clears the owner's auth claims so the email can be
// reused. Requires the caller to send `confirmTenantName` matching the
// tenant's `name` field — guards against fat-finger deletes from the
// dashboard. External resources (Stripe Connect account, Twilio subaccount,
// Stripe subscription) are NOT torn down here; the dashboard surfaces those
// as separate lifecycle actions per-vendor.
exports.platformAdminDeleteTenantCallable = onCall(
  {
    region: "us-central1",
    secrets: [
      stripeConnectInternals.STRIPE_PLATFORM_SECRET_KEY,
      twilioSubaccountInternals.TWILIO_MASTER_ACCOUNT_SID,
      twilioSubaccountInternals.TWILIO_MASTER_AUTH_TOKEN,
    ],
  },
  async (request) => {
    const auth = requireAuth(request);
    assertPlatformAdmin(auth);

    const {
      tenantID,
      confirmTenantName,
      nukeExternal = false,
      skipConfirmation = false,
    } = request.data || {};
    if (!tenantID || typeof tenantID !== "string") {
      throw new HttpsError("invalid-argument", "tenantID is required.");
    }

    const db = getFirestore();
    const tenantRef = db.collection("tenants").doc(tenantID);
    const tenantSnap = await tenantRef.get();
    if (!tenantSnap.exists) {
      throw new HttpsError("not-found", `Tenant ${tenantID} not found.`);
    }
    const tenant = tenantSnap.data() || {};

    if (!skipConfirmation) {
      const expected = tenant.name || tenantID;
      if (!confirmTenantName || confirmTenantName.trim() !== expected) {
        throw new HttpsError(
          "failed-precondition",
          "Confirmation text does not match tenant name."
        );
      }
    }

    const externalResults = {
      stripeConnect: { attempted: false, success: false, error: null, accountID: null },
      twilio: { attempted: false, success: false, error: null, subaccountSid: null },
      authUser: { attempted: false, success: false, error: null, ownerUID: null },
    };

    if (nukeExternal) {
      // Stripe Connect account teardown.
      try {
        const accountID =
          await stripeConnectInternals.findTenantConnectAccountID(db, tenantID);
        if (accountID) {
          externalResults.stripeConnect.attempted = true;
          externalResults.stripeConnect.accountID = accountID;
          await stripeConnect.deleteConnectedAccount(
            stripeConnectInternals.STRIPE_PLATFORM_SECRET_KEY,
            accountID
          );
          // Top-level index entry isn't under the tenant doc, recursiveDelete
          // won't catch it. Clean it explicitly so reuse of the accountID
          // (impossible in practice) wouldn't hit a stale row.
          try {
            await db
              .collection("connect-accounts-index")
              .doc(accountID)
              .delete();
          } catch (idxErr) {
            logger.warn(
              "platformAdminDeleteTenantCallable: connect-accounts-index delete failed",
              { tenantID, accountID, error: idxErr.message }
            );
          }
          externalResults.stripeConnect.success = true;
        }
      } catch (err) {
        externalResults.stripeConnect.error =
          err && err.message ? err.message : String(err);
        logger.error("platformAdminDeleteTenantCallable: Stripe teardown failed", {
          tenantID,
          error: externalResults.stripeConnect.error,
        });
      }

      // Twilio subaccount teardown (force=true so the suspended-precondition
      // is skipped — dev cleanup is allowed to nuke active subaccounts).
      logger.info("platformAdminDeleteTenantCallable: Twilio teardown START", {
        tenantID,
      });
      try {
        const twilioRef = tenantTwilioDocRef(db, tenantID);
        const twilioSnap = await twilioRef.get();
        logger.info("platformAdminDeleteTenantCallable: Twilio subdoc read", {
          tenantID,
          subdocExists: twilioSnap.exists,
          subdocPath: twilioRef.path,
        });
        if (twilioSnap.exists) {
          const twilioData = twilioSnap.data() || {};
          logger.info("platformAdminDeleteTenantCallable: Twilio subdoc data", {
            tenantID,
            subaccountSid: twilioData.subaccountSid || null,
            status: twilioData.status || null,
            hasSecretRef: Boolean(twilioData.secretManagerRef),
          });
          if (twilioData.status !== "closed") {
            externalResults.twilio.attempted = true;
            externalResults.twilio.subaccountSid = twilioData.subaccountSid || null;
            logger.info(
              "platformAdminDeleteTenantCallable: invoking closeSubaccountInternal",
              { tenantID, subaccountSid: twilioData.subaccountSid }
            );
            await twilioSubaccountInternals.closeSubaccountInternal({
              tenantID,
              actorUID: auth.uid,
              actorKind: "platform-admin",
              force: true,
            });
            externalResults.twilio.success = true;
            logger.info(
              "platformAdminDeleteTenantCallable: closeSubaccountInternal returned OK",
              { tenantID, subaccountSid: twilioData.subaccountSid }
            );
          } else {
            logger.info(
              "platformAdminDeleteTenantCallable: skipping close (already closed)",
              { tenantID, subaccountSid: twilioData.subaccountSid }
            );
          }
        } else {
          logger.warn(
            "platformAdminDeleteTenantCallable: Twilio subdoc MISSING - cannot close",
            { tenantID, expectedPath: twilioRef.path }
          );
        }
      } catch (err) {
        externalResults.twilio.error =
          err && err.message ? err.message : String(err);
        logger.error("platformAdminDeleteTenantCallable: Twilio teardown failed", {
          tenantID,
          error: externalResults.twilio.error,
          errorCode: err && err.code,
          errorStatus: err && err.status,
          errorMoreInfo: err && err.moreInfo,
          errorDetails: err && err.details ? JSON.stringify(err.details) : null,
          errorStack: err && err.stack,
        });
      }
      logger.info("platformAdminDeleteTenantCallable: Twilio teardown END", {
        tenantID,
        attempted: externalResults.twilio.attempted,
        success: externalResults.twilio.success,
        error: externalResults.twilio.error,
        subaccountSid: externalResults.twilio.subaccountSid,
      });

      // Auth user teardown so the email is reusable.
      if (tenant.ownerUID) {
        externalResults.authUser.attempted = true;
        externalResults.authUser.ownerUID = tenant.ownerUID;
        try {
          await admin.auth().deleteUser(tenant.ownerUID);
          externalResults.authUser.success = true;
        } catch (err) {
          externalResults.authUser.error =
            err && err.message ? err.message : String(err);
          logger.error(
            "platformAdminDeleteTenantCallable: Auth user delete failed",
            { tenantID, ownerUID: tenant.ownerUID, error: externalResults.authUser.error }
          );
        }
      }
    }

    // recursiveDelete walks all subcollections under the tenant doc and
    // deletes them along with the tenant doc itself.
    await db.recursiveDelete(tenantRef);

    // If we didn't nuke the Auth user, at minimum clear its claims so the
    // email can be reused under a fresh tenant.
    if (!nukeExternal && tenant.ownerUID) {
      try {
        await admin.auth().setCustomUserClaims(tenant.ownerUID, null);
      } catch (err) {
        logger.warn("platformAdminDeleteTenantCallable: clear claims failed", {
          tenantID,
          ownerUID: tenant.ownerUID,
          error: err.message,
        });
      }
    }

    logger.info("platformAdminDeleteTenantCallable: tenant deleted", {
      tenantID,
      ownerUID: tenant.ownerUID || null,
      byUID: auth.uid,
      nukeExternal,
      externalResults,
    });

    return { success: true, tenantID, externalResults };
  }
);

// =============================================================================
// Tenant self-serve signup auth (sales-gated, Firebase email-link).
//
// Flow:
//   1. Prospect emails tech support asking to become a tenant.
//   2. Tech support enters their email in the dashboard's "Send Authorization"
//      container and clicks Send.
//   3. platformAdminSendTenantSetupAuthCallable creates (or refreshes) a doc
//      at /tenant_account_setup/{lowercased-email} with a 30-day expiry, and
//      emails the prospect a Firebase Auth email-link pointing at the
//      dashboard's /welcome route.
//   4. Prospect clicks the link, lands on TenantSetupLandingScreen, which
//      uses signInWithEmailLink to sign them into Firebase Auth (auto-
//      creating the Auth user if needed). They're now authenticated as the
//      prospect email with NO custom claims (not a tenant yet).
//   5. Once signed in the page calls getTenantAccountSetupCallable to load
//      whatever formData has been accumulated, and re-saves on each step so
//      they can resume across sessions for the full 30 days.
//
// Same email-link pattern as the existing platformAdminSendOwnerWelcomeEmail
// flow, so prospects and owners get the same UX. Re-sends mint a fresh email-
// link (Firebase links are single-use); the doc on the server is the source
// of truth for the 30-day window.
// =============================================================================

const TENANT_SETUP_LANDING_URL = "https://cadence-dashboard.web.app/welcome";
const TENANT_SETUP_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function tenantAccountSetupDocRef(db, normalizedEmail) {
  return db.collection("tenant_account_setup").doc(normalizedEmail);
}

exports.platformAdminSendTenantSetupAuthCallable = onCall(
  {
    region: "us-central1",
    secrets: [
      PLATFORM_NOREPLY_EMAIL,
      PLATFORM_NOREPLY_SMTP_USER,
      PLATFORM_NOREPLY_APP_PASSWORD,
    ],
  },
  async (request) => {
    const auth = requireAuth(request);
    assertPlatformAdmin(auth);

    const { email, billingTier } = request.data || {};
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      throw new HttpsError("invalid-argument", "A valid email is required.");
    }

    const fromEmail = PLATFORM_NOREPLY_EMAIL.value();
    const smtpUser = PLATFORM_NOREPLY_SMTP_USER.value();
    const fromPassword = PLATFORM_NOREPLY_APP_PASSWORD.value();
    if (!fromEmail || !smtpUser || !fromPassword) {
      throw new HttpsError(
        "failed-precondition",
        "PLATFORM_NOREPLY_EMAIL, PLATFORM_NOREPLY_SMTP_USER, and PLATFORM_NOREPLY_APP_PASSWORD must be set."
      );
    }

    const db = getFirestore();
    const docRef = tenantAccountSetupDocRef(db, normalizedEmail);
    const expiresAt = Timestamp.fromMillis(
      Date.now() + TENANT_SETUP_TOKEN_TTL_MS
    );

    const snap = await docRef.get();
    const isFirstTime = !snap.exists;

    // Tier is admin-selected at email-send time and locked on first creation.
    // Prospect never picks it. Resends ignore the field so a typo on a later
    // send can't change a tenant's plan mid-signup; tier changes require
    // letting the doc expire and starting over.
    if (isFirstTime) {
      if (billingTier !== "per_sale" && billingTier !== "monthly_sub") {
        throw new HttpsError(
          "invalid-argument",
          "billingTier must be 'per_sale' or 'monthly_sub'."
        );
      }
      await docRef.set({
        email: normalizedEmail,
        expiresAt,
        status: "pending",
        billingTier,
        formData: {},
        createdAt: FieldValue.serverTimestamp(),
        createdBy: auth.uid,
        lastEmailSentAt: FieldValue.serverTimestamp(),
        emailSendCount: 1,
      });
    } else {
      await docRef.update({
        expiresAt,
        lastEmailSentAt: FieldValue.serverTimestamp(),
        emailSendCount: FieldValue.increment(1),
      });
    }

    const signInLink = await admin
      .auth()
      .generateSignInWithEmailLink(normalizedEmail, {
        url: TENANT_SETUP_LANDING_URL,
        handleCodeInApp: true,
      });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: smtpUser, pass: fromPassword },
    });

    const subject = isFirstTime
      ? "Your Cadence POS signup link"
      : "Your Cadence POS signup link (refreshed)";
    const html = `<p>Hi,</p>
<p>Click the link below to ${
      isFirstTime ? "start" : "continue"
    } your Cadence POS account setup. The link is single-use; once you click it you'll stay signed in and can return to finish later. Your progress is saved for 30 days.</p>
<p><a href="${signInLink}">${signInLink}</a></p>
<p>If you didn't request this, you can ignore the email.</p>
<p>— The Cadence POS team</p>`;

    try {
      const info = await transporter.sendMail({
        from: `"Cadence POS" <${fromEmail}>`,
        to: normalizedEmail,
        subject,
        html,
      });
      logger.info("platformAdminSendTenantSetupAuthCallable: sent", {
        email: normalizedEmail,
        isFirstTime,
        messageId: info.messageId,
        byUID: auth.uid,
      });
      return {
        success: true,
        email: normalizedEmail,
        isFirstTime,
        messageId: info.messageId,
      };
    } catch (err) {
      logger.error("platformAdminSendTenantSetupAuthCallable: send failed", {
        email: normalizedEmail,
        error: err.message,
        byUID: auth.uid,
      });
      throw new HttpsError(
        "internal",
        `Failed to send authorization email: ${err.message}`
      );
    }
  }
);

// Self-serve "send me a fresh sign-in link" path. PUBLIC (no auth) because
// the whole point is the caller can't sign in — their original email-link
// was single-use and is now spent (new machine, refresh-token expired, or
// they just clicked it twice). The page calls this with whatever email
// the prospect types.
//
// Anti-enumeration shape: returns { success: true } silently when no setup
// doc exists for the email. Throttles to 1 resend per minute per email
// when a doc does exist — this leaks one bit per email per minute, which
// is an acceptable tradeoff for giving honest users feedback during normal
// "I clicked too fast" interactions. We don't expose whether the doc
// expired or was adopted — both are silent-ok like the no-doc case.
exports.requestTenantSetupResendCallable = onCall(
  {
    region: "us-central1",
    secrets: [
      PLATFORM_NOREPLY_EMAIL,
      PLATFORM_NOREPLY_SMTP_USER,
      PLATFORM_NOREPLY_APP_PASSWORD,
    ],
  },
  async (request) => {
    const { email } = request.data || {};
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      throw new HttpsError("invalid-argument", "A valid email is required.");
    }

    const db = getFirestore();
    const docRef = tenantAccountSetupDocRef(db, normalizedEmail);
    const snap = await docRef.get();

    if (!snap.exists) {
      logger.info("requestTenantSetupResendCallable: no doc; silent ok", {
        email: normalizedEmail,
      });
      return { success: true };
    }

    const docData = snap.data() || {};

    // Already adopted: setup doc was kept around past finalize for some
    // reason (e.g., cleanup trigger hadn't run yet). Silent ok — the
    // owner should be using the portal welcome link, not the setup one.
    if (docData.adoptedAt || docData.status === "adopted") {
      logger.info(
        "requestTenantSetupResendCallable: already adopted; silent ok",
        { email: normalizedEmail }
      );
      return { success: true };
    }

    // Expired: silent ok. We treat expired identical to "no doc" so a
    // prospect can't probe the 30-day window. They need to talk to
    // support to get re-issued.
    const now = Date.now();
    if (
      docData.expiresAt &&
      typeof docData.expiresAt.toMillis === "function" &&
      docData.expiresAt.toMillis() < now
    ) {
      logger.info("requestTenantSetupResendCallable: expired; silent ok", {
        email: normalizedEmail,
      });
      return { success: true };
    }

    const lastSentMs =
      docData.lastEmailSentAt &&
      typeof docData.lastEmailSentAt.toMillis === "function"
        ? docData.lastEmailSentAt.toMillis()
        : 0;
    if (now - lastSentMs < 60_000) {
      throw new HttpsError(
        "resource-exhausted",
        "Please wait a moment before requesting another link."
      );
    }

    const fromEmail = PLATFORM_NOREPLY_EMAIL.value();
    const smtpUser = PLATFORM_NOREPLY_SMTP_USER.value();
    const fromPassword = PLATFORM_NOREPLY_APP_PASSWORD.value();
    if (!fromEmail || !smtpUser || !fromPassword) {
      throw new HttpsError(
        "failed-precondition",
        "Email secrets are not configured."
      );
    }

    const signInLink = await admin
      .auth()
      .generateSignInWithEmailLink(normalizedEmail, {
        url: TENANT_SETUP_LANDING_URL,
        handleCodeInApp: true,
      });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: smtpUser, pass: fromPassword },
    });

    const subject = "Your Cadence POS signup link (refreshed)";
    const html = `<p>Hi,</p>
<p>Click the link below to continue your Cadence POS account setup. The link is single-use; once you click it you'll stay signed in and can return to finish later.</p>
<p><a href="${signInLink}">${signInLink}</a></p>
<p>If you didn't request this, you can ignore the email.</p>
<p>— The Cadence POS team</p>`;

    try {
      const info = await transporter.sendMail({
        from: `"Cadence POS" <${fromEmail}>`,
        to: normalizedEmail,
        subject,
        html,
      });
      await docRef.update({
        lastEmailSentAt: FieldValue.serverTimestamp(),
        emailSendCount: FieldValue.increment(1),
      });
      logger.info("requestTenantSetupResendCallable: sent", {
        email: normalizedEmail,
        messageId: info.messageId,
      });
      return { success: true };
    } catch (err) {
      logger.error("requestTenantSetupResendCallable: send failed", {
        email: normalizedEmail,
        error: err.message,
      });
      throw new HttpsError("internal", "Failed to send link.");
    }
  }
);

// Invoked from the tenant setup landing page after the prospect has been
// signed in via email-link. Caller is authenticated as the prospect email but
// has no custom claims (not a tenant yet). Looks up the setup doc, verifies
// the caller's email matches the doc ID, checks the 30-day expiry, and
// returns whatever formData the prospect has saved so far.
exports.getTenantAccountSetupCallable = onCall(
  { region: "us-central1" },
  async (request) => {
    const auth = requireAuth(request);
    const callerEmail = normalizeEmail(auth.token && auth.token.email);
    if (!callerEmail) {
      throw new HttpsError(
        "permission-denied",
        "Signed-in user has no email."
      );
    }

    const db = getFirestore();
    const docRef = tenantAccountSetupDocRef(db, callerEmail);
    const snap = await docRef.get();
    if (!snap.exists) {
      throw new HttpsError(
        "permission-denied",
        "No tenant signup is open for this email. Ask support for a link."
      );
    }
    const data = snap.data() || {};
    const expiresAt = data.expiresAt;
    if (
      expiresAt &&
      typeof expiresAt.toMillis === "function" &&
      expiresAt.toMillis() < Date.now()
    ) {
      throw new HttpsError(
        "permission-denied",
        "This setup link has expired. Ask support to send a new one."
      );
    }

    return {
      success: true,
      email: callerEmail,
      formData: data.formData || {},
      status: data.status || "pending",
      signupType: data.signupType || null,
      billingTier: data.billingTier || null,
      paymentMethodCollected: !!data.paymentMethodCollected,
      stripeBillingCustomerID: data.stripeBillingCustomerID || null,
      purchasedPhoneNumber: data.purchasedPhoneNumber || null,
      poolNumberInfo: data.poolNumberInfo || null,
      twilioSubaccountSid: data.twilioSubaccountSid || null,
      twilioSubaccountStatus: data.twilioSubaccountStatus || null,
    };
  }
);

// Invoked from the tenant setup landing page as the prospect makes choices
// (single vs multi shop) and fills in wizard fields. Caller is authenticated
// as the prospect email; we use that as the doc key. Accepts a partial
// payload {signupType?, formData?}; formData is shallow-merged into the
// existing doc so wizard steps can save just the fields they own.
exports.updateTenantAccountSetupCallable = onCall(
  { region: "us-central1" },
  async (request) => {
    const auth = requireAuth(request);
    const callerEmail = normalizeEmail(auth.token && auth.token.email);
    if (!callerEmail) {
      throw new HttpsError(
        "permission-denied",
        "Signed-in user has no email."
      );
    }

    const db = getFirestore();
    const docRef = tenantAccountSetupDocRef(db, callerEmail);
    const snap = await docRef.get();
    if (!snap.exists) {
      throw new HttpsError(
        "permission-denied",
        "No tenant signup is open for this email. Ask support for a link."
      );
    }
    const data = snap.data() || {};
    const expiresAt = data.expiresAt;
    if (
      expiresAt &&
      typeof expiresAt.toMillis === "function" &&
      expiresAt.toMillis() < Date.now()
    ) {
      throw new HttpsError(
        "permission-denied",
        "This setup link has expired. Ask support to send a new one."
      );
    }

    const payload = request.data || {};
    const updates = { lastUpdatedAt: FieldValue.serverTimestamp() };

    if (payload.signupType !== undefined) {
      if (payload.signupType !== "single" && payload.signupType !== "multi") {
        throw new HttpsError(
          "invalid-argument",
          "signupType must be 'single' or 'multi'."
        );
      }
      updates.signupType = payload.signupType;
    }

    if (payload.formData !== undefined) {
      if (
        payload.formData === null ||
        typeof payload.formData !== "object" ||
        Array.isArray(payload.formData)
      ) {
        throw new HttpsError(
          "invalid-argument",
          "formData must be a plain object."
        );
      }
      const existing = data.formData || {};
      updates.formData = { ...existing, ...payload.formData };
    }

    // Billing tier is prospect-selectable in the Payment step. Admin-set
    // value (from email-send time) acts as the initial default; the wizard
    // radio overwrites it freely until finalize.
    if (payload.billingTier !== undefined) {
      if (
        payload.billingTier !== "per_sale" &&
        payload.billingTier !== "monthly_sub"
      ) {
        throw new HttpsError(
          "invalid-argument",
          "billingTier must be 'per_sale' or 'monthly_sub'."
        );
      }
      updates.billingTier = payload.billingTier;
    }

    await docRef.update(updates);

    return {
      success: true,
      email: callerEmail,
      formData: updates.formData || data.formData || {},
      signupType: updates.signupType || data.signupType || null,
      billingTier: updates.billingTier || data.billingTier || null,
    };
  }
);

// Prospect-side SetupIntent creation for the tenant signup wizard. Distinct
// from stripeBillingCreateSetupIntentCallable in stripe-billing.js — that one
// auths against an existing tenant doc (owner-only); this one auths against
// the tenant_account_setup doc keyed by the prospect's email, because no
// tenant exists yet. Idempotently creates a platform Stripe Customer for the
// prospect, then a SetupIntent (usage: "off_session") so the saved card can
// be charged by the subscription invoice when the tenant is provisioned.
//
// monthly_sub only. per_sale prospects don't collect a card at signup — that
// flow is deferred until the period-billed accumulation invoicing is built.
exports.tenantSetupCreateSetupIntentCallable = onCall(
  {
    region: "us-central1",
    secrets: [stripeConnectInternals.STRIPE_PLATFORM_SECRET_KEY],
  },
  async (request) => {
    const auth = requireAuth(request);
    const callerEmail = normalizeEmail(auth.token && auth.token.email);
    if (!callerEmail) {
      throw new HttpsError(
        "permission-denied",
        "Signed-in user has no email."
      );
    }

    const db = getFirestore();
    const docRef = tenantAccountSetupDocRef(db, callerEmail);
    const snap = await docRef.get();
    if (!snap.exists) {
      throw new HttpsError(
        "permission-denied",
        "No tenant signup is open for this email. Ask support for a link."
      );
    }
    const data = snap.data() || {};
    const expiresAt = data.expiresAt;
    if (
      expiresAt &&
      typeof expiresAt.toMillis === "function" &&
      expiresAt.toMillis() < Date.now()
    ) {
      throw new HttpsError(
        "permission-denied",
        "This setup link has expired. Ask support to send a new one."
      );
    }
    if (data.billingTier !== "monthly_sub" && data.billingTier !== "per_sale") {
      throw new HttpsError(
        "failed-precondition",
        "Billing tier missing from setup doc — contact support."
      );
    }

    const stripe = new Stripe(
      stripeConnectInternals.STRIPE_PLATFORM_SECRET_KEY.value()
    );

    // Idempotent customer creation. Re-using a stored customer ID across
    // SetupIntent retries avoids dangling Stripe Customers if the user
    // refreshes mid-flow.
    let customerID = data.stripeBillingCustomerID;
    if (!customerID) {
      const customer = await stripe.customers.create({
        email: callerEmail,
        metadata: {
          source: "tenant_account_setup",
          setupDocEmail: callerEmail,
        },
      });
      customerID = customer.id;
      await docRef.update({
        stripeBillingCustomerID: customerID,
        stripeBillingCustomerCreatedAt: FieldValue.serverTimestamp(),
      });
      logger.info("tenantSetupCreateSetupIntentCallable: created customer", {
        email: callerEmail,
        stripeBillingCustomerID: customerID,
      });
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerID,
      payment_method_types: ["card"],
      usage: "off_session",
      metadata: {
        source: "tenant_account_setup",
        setupDocEmail: callerEmail,
      },
    });

    await docRef.update({
      stripeSetupIntentID: setupIntent.id,
      stripeSetupIntentCreatedAt: FieldValue.serverTimestamp(),
    });

    logger.info("tenantSetupCreateSetupIntentCallable: created SI", {
      email: callerEmail,
      setupIntentID: setupIntent.id,
    });

    return {
      success: true,
      clientSecret: setupIntent.client_secret,
      setupIntentID: setupIntent.id,
      stripeBillingCustomerID: customerID,
    };
  }
);

// After Elements confirms the SetupIntent client-side, the resulting
// paymentMethodID comes back here. Attach to the customer, set default, mark
// the setup doc as collected so the wizard can advance and so the eventual
// tenant provisioner has a default PM to point the Subscription at.
exports.tenantSetupConfirmPaymentMethodCallable = onCall(
  {
    region: "us-central1",
    secrets: [
      stripeConnectInternals.STRIPE_PLATFORM_SECRET_KEY,
      twilioSubaccountInternals.TWILIO_MASTER_ACCOUNT_SID,
      twilioSubaccountInternals.TWILIO_MASTER_AUTH_TOKEN,
    ],
  },
  async (request) => {
    const auth = requireAuth(request);
    const callerEmail = normalizeEmail(auth.token && auth.token.email);
    if (!callerEmail) {
      throw new HttpsError(
        "permission-denied",
        "Signed-in user has no email."
      );
    }

    const { paymentMethodID } = request.data || {};
    if (!paymentMethodID || typeof paymentMethodID !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "paymentMethodID is required."
      );
    }

    const db = getFirestore();
    const docRef = tenantAccountSetupDocRef(db, callerEmail);
    const snap = await docRef.get();
    if (!snap.exists) {
      throw new HttpsError(
        "permission-denied",
        "No tenant signup is open for this email. Ask support for a link."
      );
    }
    const data = snap.data() || {};
    const expiresAt = data.expiresAt;
    if (
      expiresAt &&
      typeof expiresAt.toMillis === "function" &&
      expiresAt.toMillis() < Date.now()
    ) {
      throw new HttpsError(
        "permission-denied",
        "This setup link has expired. Ask support to send a new one."
      );
    }
    if (data.billingTier !== "monthly_sub" && data.billingTier !== "per_sale") {
      throw new HttpsError(
        "failed-precondition",
        "Billing tier missing from setup doc — contact support."
      );
    }
    if (!data.stripeBillingCustomerID) {
      throw new HttpsError(
        "failed-precondition",
        "No Stripe customer is associated with this signup. Reload and try again."
      );
    }

    const stripe = new Stripe(
      stripeConnectInternals.STRIPE_PLATFORM_SECRET_KEY.value()
    );

    // Attach is idempotent for the same customer; rejects if the PM is
    // already attached to a different customer (would imply a cross-prospect
    // copy/paste, which shouldn't happen here).
    try {
      await stripe.paymentMethods.attach(paymentMethodID, {
        customer: data.stripeBillingCustomerID,
      });
    } catch (err) {
      if (!err || err.code !== "resource_already_exists") {
        logger.error(
          "tenantSetupConfirmPaymentMethodCallable: PM attach failed",
          {
            email: callerEmail,
            paymentMethodID,
            error: err && err.message,
          }
        );
        throw new HttpsError(
          "failed-precondition",
          (err && err.message) || "Payment method attach failed."
        );
      }
    }

    await stripe.customers.update(data.stripeBillingCustomerID, {
      invoice_settings: { default_payment_method: paymentMethodID },
    });

    await docRef.update({
      stripeDefaultPaymentMethodID: paymentMethodID,
      paymentMethodCollected: true,
      paymentMethodCollectedAt: FieldValue.serverTimestamp(),
    });

    logger.info("tenantSetupConfirmPaymentMethodCallable: PM attached", {
      email: callerEmail,
      paymentMethodID,
    });

    // Best-effort: provision the prospect's Twilio subaccount now that
    // payment is on file. Idempotent — re-runs (refresh during retry) are
    // no-ops. Failure here doesn't roll back the card-save; the phone-step
    // search callable provisions on demand as a retry path.
    try {
      await twilioSubaccountInternals.provisionPreTenantSubaccountInternal({
        normalizedEmail: callerEmail,
        setupDocRef: docRef,
        actorUID: auth.uid,
        actorKind: "tenant-setup",
      });
    } catch (err) {
      logger.warn(
        "tenantSetupConfirmPaymentMethodCallable: subaccount provision failed (will retry on phone step)",
        {
          email: callerEmail,
          error: (err && err.message) || String(err),
        }
      );
    }

    return {
      success: true,
      paymentMethodID,
      paymentMethodCollected: true,
    };
  }
);

// ─────────────────────────────────────────────────────────────────────────
// Pre-tenant Twilio number lifecycle. Mirrors the platform-admin variants in
// twilio-numbers.js, but auth'd against the setup doc + pre-tenant
// subaccount instead of a tenant + tenant subaccount. Number is purchased
// WITHOUT webhook configuration — webhooks are applied at tenant
// provisioning time when the number is adopted into the real tenant. During
// signup the number sits dormant; inbound texts hit Twilio's default 404.
// ─────────────────────────────────────────────────────────────────────────

const SETUP_NUMBER_SEARCH_DEFAULT_LIMIT = 20;
const SETUP_NUMBER_SEARCH_MAX_LIMIT = 30;

// Shared loader for the setup doc inside the setup-flow callables. Returns
// {docRef, data, callerEmail} on success; throws HttpsError on auth/expiry
// failure. All setup-flow callables hit this first.
async function loadSetupDocForCaller(request) {
  const auth = requireAuth(request);
  const callerEmail = normalizeEmail(auth.token && auth.token.email);
  if (!callerEmail) {
    throw new HttpsError("permission-denied", "Signed-in user has no email.");
  }
  const db = getFirestore();
  const docRef = tenantAccountSetupDocRef(db, callerEmail);
  const snap = await docRef.get();
  if (!snap.exists) {
    throw new HttpsError(
      "permission-denied",
      "No tenant signup is open for this email. Ask support for a link."
    );
  }
  const data = snap.data() || {};
  const expiresAt = data.expiresAt;
  if (
    expiresAt &&
    typeof expiresAt.toMillis === "function" &&
    expiresAt.toMillis() < Date.now()
  ) {
    throw new HttpsError(
      "permission-denied",
      "This setup link has expired. Ask support to send a new one."
    );
  }
  return { auth, callerEmail, docRef, data };
}

// Idempotently ensure the prospect has a Twilio subaccount provisioned.
// Mirrors the inline call in confirm-PM but as a recovery path for search
// when the inline provision failed silently. Returns the subaccountSid.
async function ensureSetupSubaccount({ callerEmail, docRef, data, auth }) {
  if (data.twilioSubaccountSid && data.twilioSubaccountStatus === "active") {
    return data.twilioSubaccountSid;
  }
  const res = await twilioSubaccountInternals.provisionPreTenantSubaccountInternal(
    {
      normalizedEmail: callerEmail,
      setupDocRef: docRef,
      actorUID: auth.uid,
      actorKind: "tenant-setup",
    }
  );
  return res.subaccountSid;
}

exports.tenantSetupSearchTwilioNumbersCallable = onCall(
  {
    region: "us-central1",
    secrets: [
      twilioSubaccountInternals.TWILIO_MASTER_ACCOUNT_SID,
      twilioSubaccountInternals.TWILIO_MASTER_AUTH_TOKEN,
    ],
  },
  async (request) => {
    const { auth, callerEmail, docRef, data } = await loadSetupDocForCaller(
      request
    );

    const { state, locality, areaCode, contains, limit } = request.data || {};
    if (!state && !locality && !areaCode && !contains) {
      throw new HttpsError(
        "invalid-argument",
        "At least one of state, locality, areaCode, or contains is required."
      );
    }

    const subaccountSid = await ensureSetupSubaccount({
      callerEmail,
      docRef,
      data,
      auth,
    });

    const cappedLimit = Math.min(
      Math.max(
        parseInt(limit, 10) || SETUP_NUMBER_SEARCH_DEFAULT_LIMIT,
        1
      ),
      SETUP_NUMBER_SEARCH_MAX_LIMIT
    );

    const client = await getSetupTwilioClient(callerEmail, { subaccountSid });

    const searchOpts = {
      smsEnabled: true,
      mmsEnabled: true,
      limit: cappedLimit,
    };
    if (state) searchOpts.inRegion = state;
    if (locality) searchOpts.inLocality = locality;
    if (areaCode) searchOpts.areaCode = parseInt(areaCode, 10);
    if (contains) searchOpts.contains = contains;

    logger.info("tenantSetupSearchTwilioNumbersCallable: searching", {
      email: callerEmail,
      state,
      locality,
      areaCode,
      contains,
      limit: cappedLimit,
    });

    const available = await client
      .availablePhoneNumbers("US")
      .local.list(searchOpts);

    const candidates = available.map((n) => ({
      phoneNumber: n.phoneNumber,
      friendlyName: n.friendlyName,
      locality: n.locality || null,
      region: n.region || null,
      rateCenter: n.rateCenter || null,
      postalCode: n.postalCode || null,
      lata: n.lata || null,
      capabilities: {
        sms: n.capabilities && n.capabilities.SMS === true,
        mms: n.capabilities && n.capabilities.MMS === true,
        voice: n.capabilities && n.capabilities.voice === true,
      },
    }));

    logger.info("tenantSetupSearchTwilioNumbersCallable: results", {
      email: callerEmail,
      count: candidates.length,
    });

    return { success: true, candidates };
  }
);

exports.tenantSetupPurchaseTwilioNumberCallable = onCall(
  {
    region: "us-central1",
    secrets: [
      twilioSubaccountInternals.TWILIO_MASTER_ACCOUNT_SID,
      twilioSubaccountInternals.TWILIO_MASTER_AUTH_TOKEN,
    ],
  },
  async (request) => {
    const { auth, callerEmail, docRef, data } = await loadSetupDocForCaller(
      request
    );

    const { phoneNumber } = request.data || {};
    if (!phoneNumber || typeof phoneNumber !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "phoneNumber is required."
      );
    }

    // One purchased number per setup doc. If they already have one and want
    // a different one, they release first.
    if (data.purchasedPhoneNumber && data.purchasedPhoneNumber.phoneNumber) {
      throw new HttpsError(
        "failed-precondition",
        "A phone number is already on this signup. Release it first to pick a different one."
      );
    }

    const subaccountSid = await ensureSetupSubaccount({
      callerEmail,
      docRef,
      data,
      auth,
    });

    const client = await getSetupTwilioClient(callerEmail, { subaccountSid });

    logger.info("tenantSetupPurchaseTwilioNumberCallable: purchasing", {
      email: callerEmail,
      phoneNumber,
    });

    // No webhook config at purchase time. The number sits dormant during
    // signup; webhooks are applied at tenant provisioning when the number is
    // adopted into the real tenant + store.
    const purchase = await client.incomingPhoneNumbers.create({
      phoneNumber,
      friendlyName: `setup-${callerEmail}`.slice(0, 64),
    });

    const purchased = {
      phoneNumber: purchase.phoneNumber,
      phoneNumberSid: purchase.sid,
      capabilities: {
        sms: purchase.capabilities && purchase.capabilities.sms === true,
        mms: purchase.capabilities && purchase.capabilities.mms === true,
        voice: purchase.capabilities && purchase.capabilities.voice === true,
      },
      friendlyName: purchase.friendlyName,
      source: "purchased",
      purchasedAt: FieldValue.serverTimestamp(),
    };

    await docRef.update({
      purchasedPhoneNumber: purchased,
    });

    logger.info("tenantSetupPurchaseTwilioNumberCallable: purchased", {
      email: callerEmail,
      phoneNumber: purchase.phoneNumber,
      phoneNumberSid: purchase.sid,
    });

    return {
      success: true,
      phoneNumber: purchase.phoneNumber,
      phoneNumberSid: purchase.sid,
      capabilities: purchased.capabilities,
    };
  }
);

exports.tenantSetupReleaseTwilioNumberCallable = onCall(
  {
    region: "us-central1",
    secrets: [
      twilioSubaccountInternals.TWILIO_MASTER_ACCOUNT_SID,
      twilioSubaccountInternals.TWILIO_MASTER_AUTH_TOKEN,
    ],
  },
  async (request) => {
    const { callerEmail, docRef, data } = await loadSetupDocForCaller(request);

    const purchased = data.purchasedPhoneNumber;
    if (!purchased || !purchased.phoneNumberSid) {
      // Nothing to release — treat as success so the UI can clear local state.
      return { success: true, released: false };
    }
    if (!data.twilioSubaccountSid) {
      throw new HttpsError(
        "failed-precondition",
        "Subaccount is missing for this signup; cannot release."
      );
    }

    const client = await getSetupTwilioClient(callerEmail, {
      subaccountSid: data.twilioSubaccountSid,
    });

    try {
      await client.incomingPhoneNumbers(purchased.phoneNumberSid).remove();
    } catch (err) {
      // 20404 = number not found on subaccount (already released externally).
      // Treat as success and proceed to clean up the setup doc.
      if (err && err.status !== 404 && err.code !== 20404) {
        logger.error("tenantSetupReleaseTwilioNumberCallable: remove failed", {
          email: callerEmail,
          phoneNumberSid: purchased.phoneNumberSid,
          error: (err && err.message) || String(err),
        });
        throw new HttpsError(
          "internal",
          (err && err.message) || "Failed to release phone number."
        );
      }
      logger.warn(
        "tenantSetupReleaseTwilioNumberCallable: number not found on Twilio, clearing setup doc anyway",
        {
          email: callerEmail,
          phoneNumberSid: purchased.phoneNumberSid,
        }
      );
    }

    await docRef.update({
      purchasedPhoneNumber: FieldValue.delete(),
    });

    logger.info("tenantSetupReleaseTwilioNumberCallable: released", {
      email: callerEmail,
      phoneNumber: purchased.phoneNumber,
      phoneNumberSid: purchased.phoneNumberSid,
    });

    return {
      success: true,
      released: true,
      phoneNumber: purchased.phoneNumber,
    };
  }
);

// ─────────────────────────────────────────────────────────────────────────
// tenantSetupAssignPoolNumberCallable — STUB-backed temp pool assignment.
//
// Called from the phone-form step when the prospect picks "temporary pool
// number" instead of "buy permanent". Hands back a 30-day pool number from
// twilio-pool.js (currently a stub that returns mock data). Stamps the
// setup doc with `poolNumberInfo` so the finalize callable knows to wire
// the tenant as `numberSource: "pool"` rather than "purchase".
//
// Idempotent — calling twice replaces the previous assignment without
// double-charging the pool (in stub mode there's nothing to undo; the real
// implementation will need to return the previous pool number first).
// ─────────────────────────────────────────────────────────────────────────
exports.tenantSetupAssignPoolNumberCallable = onCall(
  { region: "us-central1" },
  async (request) => {
    const { callerEmail, docRef } = await loadSetupDocForCaller(request);

    const { areaCode } = request.data || {};
    if (!areaCode || typeof areaCode !== "string" || !/^\d{3}$/.test(areaCode)) {
      throw new HttpsError(
        "invalid-argument",
        "areaCode is required (3 digits)."
      );
    }

    const { assignTempNumberToTenant } = require("./twilio-pool");
    const assigned = await assignTempNumberToTenant(callerEmail, areaCode);

    const poolNumberInfo = {
      phoneNumber: assigned.phoneNumber,
      twilioSID: assigned.twilioSID,
      capabilities: assigned.capabilities,
      areaCode,
      expiresAt: Timestamp.fromMillis(assigned.expiresAt),
      assignedAt: FieldValue.serverTimestamp(),
      isStub: !!assigned._stub,
    };

    await docRef.update({
      poolNumberInfo,
      lastUpdatedAt: FieldValue.serverTimestamp(),
    });

    logger.info("tenantSetupAssignPoolNumberCallable: assigned", {
      email: callerEmail,
      areaCode,
      phoneNumber: assigned.phoneNumber,
      isStub: !!assigned._stub,
    });

    return {
      success: true,
      poolNumberInfo: {
        ...poolNumberInfo,
        expiresAt: assigned.expiresAt,
        assignedAt: Date.now(),
      },
    };
  }
);

// ─────────────────────────────────────────────────────────────────────────
// tenantSetupReleasePoolNumberCallable — symmetric release for pool numbers.
// Lets the prospect change their mind and pick a different area code or
// switch to purchase/opt-out.
// ─────────────────────────────────────────────────────────────────────────
exports.tenantSetupReleasePoolNumberCallable = onCall(
  { region: "us-central1" },
  async (request) => {
    const { callerEmail, docRef, data } = await loadSetupDocForCaller(request);

    const pool = data.poolNumberInfo;
    if (!pool || !pool.phoneNumber) {
      return { success: true, released: false };
    }

    const { releaseTempNumber } = require("./twilio-pool");
    try {
      await releaseTempNumber(callerEmail, pool.phoneNumber);
    } catch (err) {
      logger.warn("tenantSetupReleasePoolNumberCallable: pool release failed", {
        email: callerEmail,
        phoneNumber: pool.phoneNumber,
        error: (err && err.message) || String(err),
      });
    }

    await docRef.update({
      poolNumberInfo: FieldValue.delete(),
      lastUpdatedAt: FieldValue.serverTimestamp(),
    });

    return { success: true, released: true };
  }
);

// ─────────────────────────────────────────────────────────────────────────
// Tenant adoption (signup → live tenant).
//
// Final step of the self-serve setup wizard. Caller is the prospect, signed
// in via email-link, with NO custom claims yet. Validates the setup doc has
// every field the wizard collects, then promotes it into a real tenant:
//
//   1. Generate a unique tenantID slug from businessName.
//   2. setCustomUserClaims({tenantID, privilege: "owner", stores: [storeID]}).
//   3. Write tenants/{tenantID}, stores/{storeID}, and settings doc.
//   4. Adopt the pre-tenant Twilio subaccount: migrate auth token from the
//      setup-keyed secret to the tenant-keyed secret, reconfigure the
//      purchased number's webhooks, write tenant Twilio + per-store number +
//      routing docs, destroy the setup-keyed secret.
//   5. Persist A2P brand/campaign answers to tenants/{tenantID}/private/a2p
//      for the (currently deferred) submission step.
//   6. Best-effort Stripe Connect Account create.
//   7. CRITICAL — stamp `twilioSubaccountStatus: "adopted"` on the setup doc
//      BEFORE deleting it. The setup-cleanup trigger short-circuits on that
//      exact string; without the stamp, the trigger fires unconditionally
//      and closes the live, tenant-owned subaccount.
//   8. Delete the setup doc.
//
// monthly_sub tenants get auto-assigned to the cheapest active tier — the
// signup flow doesn't ask the prospect to pick. Tier swap happens later via
// the in-app billing UI.
// ─────────────────────────────────────────────────────────────────────────

function slugifyTenantID(businessName) {
  if (!businessName || typeof businessName !== "string") return "";
  const slug = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length < 3) return "";
  return slug.length > 50 ? slug.slice(0, 50).replace(/-+$/g, "") : slug;
}

async function generateUniqueTenantID(db, businessName) {
  const base = slugifyTenantID(businessName);
  if (!base) {
    throw new HttpsError(
      "failed-precondition",
      "Business name does not yield a valid tenant ID slug."
    );
  }
  if (!TENANT_ID_PATTERN.test(base)) {
    throw new HttpsError(
      "failed-precondition",
      `Generated slug "${base}" does not match TENANT_ID_PATTERN.`
    );
  }
  for (let i = 0; i < 10; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    if (!TENANT_ID_PATTERN.test(candidate)) continue;
    const snap = await db.collection("tenants").doc(candidate).get();
    if (!snap.exists) return candidate;
  }
  const suffix = crypto.randomBytes(3).toString("hex");
  const fallback = `${base}-${suffix}`;
  if (!TENANT_ID_PATTERN.test(fallback)) {
    throw new HttpsError(
      "internal",
      "Could not generate a unique tenant ID."
    );
  }
  return fallback;
}

async function findCheapestActiveTier(db) {
  const snap = await db.collection("platform-billing-tiers").get();
  let best = null;
  snap.forEach((doc) => {
    const t = doc.data() || {};
    if (t.active !== true) return;
    if (t.archived === true) return;
    if (!t.stripePriceID) return;
    const amount =
      typeof t.monthlyAmount === "number" ? t.monthlyAmount : Infinity;
    if (best === null || amount < best.monthlyAmount) {
      best = { tierID: doc.id, monthlyAmount: amount };
    }
  });
  if (!best) {
    throw new HttpsError(
      "failed-precondition",
      "No active billing tiers configured. Contact support."
    );
  }
  return best.tierID;
}

exports.tenantSetupFinalizeCallable = onCall(
  {
    region: "us-central1",
    secrets: [
      stripeConnectInternals.STRIPE_PLATFORM_SECRET_KEY,
      twilioSubaccountInternals.TWILIO_MASTER_ACCOUNT_SID,
      twilioSubaccountInternals.TWILIO_MASTER_AUTH_TOKEN,
      PLATFORM_NOREPLY_EMAIL,
      PLATFORM_NOREPLY_SMTP_USER,
      PLATFORM_NOREPLY_APP_PASSWORD,
    ],
  },
  async (request) => {
    const { auth, callerEmail, docRef, data } = await loadSetupDocForCaller(
      request
    );

    // Re-entry guard: if the caller already has tenant claims, they've
    // already been adopted (or were a member of another tenant before this
    // signup). Either way, bail out — the cleanup trigger / TTL will sweep
    // the lingering setup doc later.
    if (auth.token && auth.token.tenantID) {
      throw new HttpsError(
        "already-exists",
        `You are already a member of tenant ${auth.token.tenantID}. Contact support if this is a mistake.`
      );
    }

    const formData = data.formData || {};
    const signupType = data.signupType;
    if (signupType !== "single" && signupType !== "multi") {
      throw new HttpsError(
        "failed-precondition",
        "Signup type must be chosen before finalizing."
      );
    }
    const billingTier = data.billingTier;
    if (billingTier !== "per_sale" && billingTier !== "monthly_sub") {
      throw new HttpsError(
        "failed-precondition",
        "Billing tier missing from setup doc."
      );
    }

    // Primary owner (required for both signup types).
    const ownerFirstName = normalizeName(formData.ownerFirstName);
    const ownerLastName = normalizeName(formData.ownerLastName);
    if (!ownerFirstName || !ownerLastName) {
      throw new HttpsError(
        "failed-precondition",
        "Owner first and last name are required."
      );
    }
    const ownerPhone = normalizePhone(formData.ownerPhone);
    if (!ownerPhone) {
      throw new HttpsError(
        "failed-precondition",
        "Owner phone is required and must be a valid US/E.164 number."
      );
    }

    const tenantCountry = normalizeCountry(formData.country) || "US";
    const tenantCurrency = currencyForCountry(tenantCountry);

    // Shop/store fields (required for both signup types — single-shop's
    // shop section writes these directly; multi-shop's store-details form
    // writes them).
    const storeName = normalizeStoreString(formData.storeName, 200);
    const storeStreet = normalizeStoreString(formData.storeStreet, 200);
    const storeCity = normalizeStoreString(formData.storeCity, 100);
    const storeStateRaw = normalizeStoreString(formData.storeState, 2);
    const storeZip = normalizeZip(formData.storeZip, tenantCountry);
    if (
      !storeName ||
      !storeStreet ||
      !storeCity ||
      !storeStateRaw ||
      !/^[A-Za-z]{2}$/.test(storeStateRaw) ||
      !storeZip
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Store details are incomplete or malformed."
      );
    }
    const storeState = storeStateRaw.toUpperCase();

    // Store-owner fields. For single-shop the primary owner IS the store
    // owner — the wizard collects owner info once and we copy it here.
    // For multi-shop the per-store form supplies separate values.
    let storeOwnerFirstName;
    let storeOwnerLastName;
    let storeOwnerPhone;
    if (signupType === "single") {
      storeOwnerFirstName = ownerFirstName;
      storeOwnerLastName = ownerLastName;
      storeOwnerPhone = ownerPhone;
    } else {
      storeOwnerFirstName = normalizeName(formData.storeOwnerFirstName);
      storeOwnerLastName = normalizeName(formData.storeOwnerLastName);
      storeOwnerPhone = normalizePhone(formData.storeOwnerPhone);
      if (
        !storeOwnerFirstName ||
        !storeOwnerLastName ||
        !storeOwnerPhone
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Store owner details are incomplete or malformed."
        );
      }
    }

    // Holding-company name. For single-shop, empty businessName means
    // "same as shop name" — copy from storeName.
    let businessName = normalizeStoreString(formData.businessName, 200);
    if (!businessName) {
      if (signupType === "single") {
        businessName = storeName;
      } else {
        throw new HttpsError(
          "failed-precondition",
          "Business name is required (≤200 chars)."
        );
      }
    }

    // Holding-company address. For single-shop, empty tenant address means
    // "same as shop address" — copy from store address.
    const tenantUnit = normalizeOptionalStoreString(formData.tenantUnit, 50);
    if (tenantUnit === null) {
      throw new HttpsError(
        "failed-precondition",
        "Tenant unit is malformed."
      );
    }
    let tenantStreet = normalizeStoreString(formData.tenantStreet, 200);
    let tenantCity = normalizeStoreString(formData.tenantCity, 100);
    let tenantStateRaw = normalizeStoreString(formData.tenantState, 2);
    let tenantZip = normalizeZip(formData.tenantZip, tenantCountry);
    if (signupType === "single") {
      if (!tenantStreet) tenantStreet = storeStreet;
      if (!tenantCity) tenantCity = storeCity;
      if (!tenantStateRaw) tenantStateRaw = storeStateRaw;
      if (!tenantZip) tenantZip = storeZip;
    }
    if (
      !tenantStreet ||
      !tenantCity ||
      !tenantStateRaw ||
      !/^[A-Za-z]{2}$/.test(tenantStateRaw) ||
      !tenantZip
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Tenant address is incomplete or malformed."
      );
    }
    const tenantState = tenantStateRaw.toUpperCase();

    // Additional owners (optional). Each entry needs all four fields and
    // a unique email vs. caller and other entries. PINs are generated
    // server-side at finalize and emailed — no client-supplied PINs.
    const rawAdditionalOwners = Array.isArray(formData.additionalOwners)
      ? formData.additionalOwners
      : [];
    const additionalOwners = [];
    const seenOwnerEmails = new Set([normalizeEmail(callerEmail)]);
    for (let i = 0; i < rawAdditionalOwners.length; i++) {
      const raw = rawAdditionalOwners[i] || {};
      const aoFirstName = normalizeName(raw.firstName);
      const aoLastName = normalizeName(raw.lastName);
      const aoEmail = normalizeEmail(raw.email);
      const aoPhone = normalizePhone(raw.phone);
      if (!aoFirstName || !aoLastName || !aoEmail || !aoPhone) {
        throw new HttpsError(
          "failed-precondition",
          `Additional owner #${i + 1} has missing or invalid fields.`
        );
      }
      if (seenOwnerEmails.has(aoEmail)) {
        throw new HttpsError(
          "failed-precondition",
          `Additional owner #${i + 1} email "${aoEmail}" duplicates another owner.`
        );
      }
      seenOwnerEmails.add(aoEmail);
      additionalOwners.push({
        firstName: aoFirstName,
        lastName: aoLastName,
        email: aoEmail,
        phone: aoPhone,
      });
    }

    // SMS choice: "opt_out" | "purchase" | "pool". Determines whether
    // we need a Twilio subaccount/number at all and which adoption path to
    // run downstream. CA tenants are forced to opt_out — Twilio A2P 10DLC is
    // a US-carrier regulatory regime; CA uses CASL and a separate compliance
    // path we don't run during signup. CA owners can wire SMS later.
    const rawSmsChoice =
      typeof formData.smsChoice === "string" ? formData.smsChoice : null;
    const smsChoice =
      tenantCountry === "CA"
        ? "opt_out"
        : rawSmsChoice === "opt_out" || rawSmsChoice === "pool"
          ? rawSmsChoice
          : "purchase";
    const smsOptOut = smsChoice === "opt_out";

    // A2P registration applies to BOTH purchase and pool paths (carriers
    // require a registered brand for any SMS-sending number, including
    // temp pool ones). Opt-out skips it entirely.
    let a2pLegalName = null;
    let a2pEIN = null;
    let a2pWebsite = null;
    let a2pSupportEmail = null;
    let a2pSupportPhone = null;
    let a2pUseCase = null;
    if (!smsOptOut) {
      const a2p = (formData && formData.a2p) || {};
      a2pLegalName = normalizeStoreString(a2p.legalName, 200);
      a2pEIN = normalizeStoreString(a2p.ein, 20);
      a2pWebsite = normalizeStoreString(a2p.website, 500);
      a2pSupportEmail = normalizeEmail(a2p.supportEmail);
      a2pSupportPhone = normalizePhone(a2p.supportPhone);
      a2pUseCase = normalizeStoreString(a2p.useCase, 2000);
      if (
        !a2pLegalName ||
        !a2pEIN ||
        !a2pWebsite ||
        !a2pSupportEmail ||
        !a2pSupportPhone ||
        !a2pUseCase
      ) {
        throw new HttpsError(
          "failed-precondition",
          "A2P registration fields are incomplete."
        );
      }
    }

    if (!data.paymentMethodCollected) {
      throw new HttpsError(
        "failed-precondition",
        "A payment method on file is required before finalizing."
      );
    }

    // Validate the source-specific phone-number prerequisite. Opt-out
    // tenants finalize with no number at all.
    const purchased = data.purchasedPhoneNumber;
    const poolInfo = data.poolNumberInfo;
    if (smsChoice === "purchase") {
      if (!purchased || !purchased.phoneNumberSid || !purchased.phoneNumber) {
        throw new HttpsError(
          "failed-precondition",
          "A phone number must be purchased before finalizing."
        );
      }
      if (
        !data.twilioSubaccountSid ||
        data.twilioSubaccountStatus !== "active"
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Twilio subaccount is missing or not active for this signup."
        );
      }
    } else if (smsChoice === "pool") {
      if (!poolInfo || !poolInfo.phoneNumber || !poolInfo.twilioSID) {
        throw new HttpsError(
          "failed-precondition",
          "A pool number must be assigned before finalizing."
        );
      }
    }

    const db = getFirestore();

    // Resolve tier for monthly_sub: pick the cheapest active tier from the
    // catalog. Tier swap (if any) happens later via the in-app billing UI.
    let subscriptionTierID = null;
    if (billingTier === "monthly_sub") {
      subscriptionTierID = await findCheapestActiveTier(db);
    }

    const tenantID = await generateUniqueTenantID(db, businessName);
    const storeID = generateEAN13Barcode();

    // Stamp claims FIRST. This is the irreversible step that ties the user
    // to this tenantID. Everything downstream (tenant docs, Twilio adoption,
    // Stripe Connect) is recoverable from the claims+tenantID anchor.
    await setUserClaims(auth.uid, {
      tenantID,
      privilege: "owner",
      stores: [storeID],
    });

    // numberSource on the tenant doc lets the rest of the app and the
    // post-onboarding port-in portal know which lane the tenant is on:
    //   "purchase" — owns a permanent number (no port-in needed)
    //   "pool"     — has a 30-day temp number, expected to port in
    //   "none"     — opted out of SMS entirely, can enable later
    const numberSource = smsOptOut ? "none" : smsChoice; // "purchase" | "pool" | "none"
    const poolExpiresAt =
      smsChoice === "pool" && poolInfo && poolInfo.expiresAt
        ? poolInfo.expiresAt
        : null;

    const tenantRef = db.collection("tenants").doc(tenantID);
    await tenantRef.set({
      name: businessName,
      ownerUID: auth.uid,
      ownerEmail: callerEmail,
      ownerFirstName,
      ownerLastName,
      ownerPhone,
      country: tenantCountry,
      currency: tenantCurrency,
      street: tenantStreet,
      unit: tenantUnit,
      city: tenantCity,
      state: tenantState,
      zip: tenantZip,
      billingModel: billingTier,
      platformFeePercent:
        billingTier === "per_sale" ? DEFAULT_PLATFORM_FEE_PERCENT : null,
      subscriptionStatus: null,
      stripeBillingCustomerID: data.stripeBillingCustomerID || null,
      stripeSubscriptionID: null,
      subscriptionGraceUntil: null,
      signupType,
      smsOptOut,
      numberSource,
      poolNumberExpiresAt: poolExpiresAt,
      adoptedFromSetupEmail: callerEmail,
      createdAt: FieldValue.serverTimestamp(),
      createdByUID: auth.uid,
      createdByKind: "tenant-self-serve",
    });

    const storeRef = tenantRef.collection("stores").doc(storeID);
    await storeRef.set({
      subscriptionTierID,
      stripeSubscriptionItemID: null,
      stripeSubscriptionPriceID: null,
      isSetupComplete: true,
      createdAt: FieldValue.serverTimestamp(),
      createdByUID: auth.uid,
    });

    const storeAddress = {
      street: storeStreet,
      unit: "",
      city: storeCity,
      state: storeState,
      zip: storeZip,
      phone: storeOwnerPhone,
      supportEmail: a2pSupportEmail,
      officeEmail: "",
    };
    const settingsDoc = buildBootstrapSettings({
      tenantID,
      storeID,
      storeDisplayName: storeName,
      storeAddress,
      salesTaxPercent: null,
      country: tenantCountry,
      currency: tenantCurrency,
    });
    await storeRef.collection("settings").doc("settings").set(settingsDoc);

    // Owner provisioning: stamp owner claims, write email_users docs, and
    // email each owner (primary + additional) an auto-generated 4-digit PIN.
    // Non-fatal: per-owner failures are captured in the returned results
    // array — the tenant is already live by this point, so a missed PIN
    // email is recoverable via the in-app team-management UI.
    let ownerProvisioningResults = null;
    let ownerProvisioningError = null;
    try {
      ownerProvisioningResults = await provisionOwnersWithPins({
        db,
        tenantID,
        storeID,
        tenantName: businessName,
        primaryOwner: {
          uid: auth.uid,
          email: callerEmail,
          firstName: ownerFirstName,
          lastName: ownerLastName,
          phone: ownerPhone,
        },
        additionalOwners,
        createdByUID: auth.uid,
        buildPortalSignInLink: async (ownerEmail) =>
          admin
            .auth()
            .generateSignInWithEmailLink(
              ownerEmail,
              buildPortalActionCodeSettings("/portal")
            ),
        smtpConfig: {
          fromEmail: PLATFORM_NOREPLY_EMAIL.value(),
          smtpUser: PLATFORM_NOREPLY_SMTP_USER.value(),
          fromPassword: PLATFORM_NOREPLY_APP_PASSWORD.value(),
        },
      });
    } catch (err) {
      ownerProvisioningError = (err && err.message) || String(err);
      logger.error(
        "tenantSetupFinalizeCallable: owner provisioning batch failed",
        { tenantID, storeID, error: ownerProvisioningError }
      );
    }

    // Twilio adoption — branches on smsChoice:
    //   "purchase": migrate auth token from setup-keyed secret to tenant-
    //               keyed secret, reconfigure webhooks on the bought number,
    //               write tenant Twilio + per-store number + routing docs,
    //               destroy the setup-keyed secret.
    //   "pool":     similar shape but the subaccount + number came from the
    //               platform pool. STUB-MODE: we only stamp the per-store
    //               doc with `source: "pool"` and `expiresAt`; the real
    //               subaccount-transfer step is deferred (see twilio-pool.js).
    //   "opt_out":  skip entirely. Tenant has no number; they can enable
    //               SMS later from the in-app Subscription page.
    let twilioAdoptionError = null;
    if (smsChoice === "purchase") {
      try {
        const authToken = await loadSetupSubaccountAuthToken(callerEmail);
        await storeSubaccountAuthToken(tenantID, authToken);

        const setupClient = await getSetupTwilioClient(callerEmail, {
          subaccountSid: data.twilioSubaccountSid,
        });
        await setupClient
          .incomingPhoneNumbers(purchased.phoneNumberSid)
          .update({
            ...CURRENT_WEBHOOK_CONFIG,
            friendlyName: `tenant-${tenantID}-store-${storeID}`,
          });

        const batch = db.batch();
        batch.set(tenantTwilioDocRef(db, tenantID), {
          subaccountSid: data.twilioSubaccountSid,
          secretManagerRef: secretManagerRef(tenantID),
          status: "active",
          a2pBrandSid: null,
          a2pCampaignSid: null,
          createdAt: FieldValue.serverTimestamp(),
          createdByUID: auth.uid,
          createdByKind: "tenant-adoption",
          updatedAt: FieldValue.serverTimestamp(),
        });
        batch.set(
          storeNumberDocRef(db, tenantID, storeID, purchased.phoneNumberSid),
          {
            phoneNumber: purchased.phoneNumber,
            phoneNumberSid: purchased.phoneNumberSid,
            capabilities: purchased.capabilities || {
              sms: true,
              mms: true,
              voice: true,
            },
            friendlyName: `tenant-${tenantID}-store-${storeID}`,
            source: "purchased",
            portStatus: null,
            assignedAt: FieldValue.serverTimestamp(),
            assignedByUID: auth.uid,
            webhooks: {
              smsUrl: CURRENT_WEBHOOK_CONFIG.smsUrl,
              statusCallback: CURRENT_WEBHOOK_CONFIG.statusCallback,
              voiceUrl: CURRENT_WEBHOOK_CONFIG.voiceUrl,
              configuredAt: FieldValue.serverTimestamp(),
            },
          }
        );
        batch.set(routingDocRef(db, purchased.phoneNumber), {
          tenantID,
          storeID,
          subaccountSid: data.twilioSubaccountSid,
          phoneNumberSid: purchased.phoneNumberSid,
          status: "active",
          assignedAt: FieldValue.serverTimestamp(),
        });
        await batch.commit();

        await destroySetupSubaccountSecret(callerEmail);
      } catch (err) {
        twilioAdoptionError = (err && err.message) || String(err);
        logger.error("tenantSetupFinalizeCallable: Twilio adoption failed", {
          tenantID,
          email: callerEmail,
          error: twilioAdoptionError,
        });
      }
    } else if (smsChoice === "pool") {
      // STUB-mode pool adoption. The real implementation will:
      //   1. Transfer the pool number from the pool subaccount to the
      //      tenant's subaccount via Twilio API.
      //   2. Migrate the pool subaccount auth-token secret over to the
      //      tenant-keyed secret slot.
      //   3. Reconfigure webhooks on the transferred number.
      // For now we only stamp the per-store doc + routing entry so that
      // the rest of the codebase can read it as "this tenant has a number,
      // it just expires in 30 days".
      try {
        const expiresAtTs =
          poolInfo.expiresAt && typeof poolInfo.expiresAt.toMillis === "function"
            ? poolInfo.expiresAt
            : null;
        const batch = db.batch();
        batch.set(tenantTwilioDocRef(db, tenantID), {
          subaccountSid: null,
          secretManagerRef: null,
          status: "pool-stub",
          a2pBrandSid: null,
          a2pCampaignSid: null,
          createdAt: FieldValue.serverTimestamp(),
          createdByUID: auth.uid,
          createdByKind: "tenant-adoption-pool-stub",
          updatedAt: FieldValue.serverTimestamp(),
        });
        batch.set(
          storeNumberDocRef(db, tenantID, storeID, poolInfo.twilioSID),
          {
            phoneNumber: poolInfo.phoneNumber,
            phoneNumberSid: poolInfo.twilioSID,
            capabilities: poolInfo.capabilities || {
              sms: true,
              mms: true,
              voice: true,
            },
            friendlyName: `tenant-${tenantID}-store-${storeID}-pool`,
            source: "pool",
            portStatus: null,
            expiresAt: expiresAtTs,
            assignedAt: FieldValue.serverTimestamp(),
            assignedByUID: auth.uid,
            isStub: !!poolInfo.isStub,
          }
        );
        batch.set(routingDocRef(db, poolInfo.phoneNumber), {
          tenantID,
          storeID,
          subaccountSid: null,
          phoneNumberSid: poolInfo.twilioSID,
          status: "active-pool-stub",
          assignedAt: FieldValue.serverTimestamp(),
        });
        await batch.commit();
      } catch (err) {
        twilioAdoptionError = (err && err.message) || String(err);
        logger.error("tenantSetupFinalizeCallable: pool adoption failed", {
          tenantID,
          email: callerEmail,
          error: twilioAdoptionError,
        });
      }
    }

    // Persist A2P answers for the (deferred) brand/campaign submission step.
    // Stored under tenants/{tenantID}/private/a2p so the future submitter
    // function reads it directly without going through the setup doc.
    // Skipped entirely for opt-out tenants since they have no number to
    // register a brand for.
    if (!smsOptOut) {
      await tenantRef.collection("private").doc("a2p").set({
        legalName: a2pLegalName,
        ein: a2pEIN,
        website: a2pWebsite,
        supportEmail: a2pSupportEmail,
        supportPhone: a2pSupportPhone,
        useCase: a2pUseCase,
        numberSource,
        brandSubmissionStatus: "pending",
        capturedAt: FieldValue.serverTimestamp(),
      });
    }

    // Best-effort Stripe Billing subscription. The Payment step already
    // attached a PM and stored stripeBillingCustomerID + stripeDefaultPaymentMethodID
    // on the setup doc; here we re-tag that customer with the new tenantID and
    // kick off the live $X/mo subscription so the owner walks straight into a
    // funded account. Failure is non-fatal — the owner can enroll from the
    // in-app BillingModalScreen instead.
    let billingSubscriptionError = null;
    let stripeSubscriptionID = null;
    if (
      billingTier === "monthly_sub" &&
      subscriptionTierID &&
      data.stripeBillingCustomerID &&
      data.stripeDefaultPaymentMethodID
    ) {
      try {
        const stripe = new Stripe(
          stripeConnectInternals.STRIPE_PLATFORM_SECRET_KEY.value()
        );

        // Re-parent the platform-account customer with tenant metadata. It
        // was created during the Payment step with only setupDocEmail; now
        // that the tenant exists, tag it for downstream lookups.
        await stripe.customers.update(data.stripeBillingCustomerID, {
          name: businessName,
          metadata: {
            tenantID,
            ownerUID: auth.uid,
            source: "tenant_setup_finalize",
          },
        });

        const tierSnap = await db
          .collection("platform-billing-tiers")
          .doc(subscriptionTierID)
          .get();
        const tier = tierSnap.exists ? tierSnap.data() || {} : {};
        if (!tier.stripePriceID) {
          throw new Error(
            `Billing tier ${subscriptionTierID} has no stripePriceID.`
          );
        }

        const subscription = await stripe.subscriptions.create({
          customer: data.stripeBillingCustomerID,
          items: [{ price: tier.stripePriceID }],
          default_payment_method: data.stripeDefaultPaymentMethodID,
          payment_behavior: "default_incomplete",
          payment_settings: {
            save_default_payment_method: "on_subscription",
          },
          expand: ["latest_invoice.payment_intent"],
          metadata: {
            tenantID,
            tierID: subscriptionTierID,
            createdByUID: auth.uid,
            source: "tenant_setup_finalize",
          },
        });
        stripeSubscriptionID = subscription.id;

        await tenantRef.update({
          subscriptionTierID,
          stripeSubscriptionID: subscription.id,
          stripeSubscriptionPriceID: tier.stripePriceID,
          subscriptionStatus: subscription.status,
          subscriptionStartedAt: FieldValue.serverTimestamp(),
        });
      } catch (err) {
        billingSubscriptionError = (err && err.message) || String(err);
        logger.error(
          "tenantSetupFinalizeCallable: Billing subscription create failed",
          {
            tenantID,
            subscriptionTierID,
            error: billingSubscriptionError,
          }
        );
      }
    }

    // Best-effort Stripe Connect account. Failure here doesn't block the
    // adoption — the owner can retry via the in-app Connect onboarding flow.
    const stripeAddress = {
      line1: tenantStreet,
      line2: tenantUnit || undefined,
      city: tenantCity,
      state: tenantState,
      postal_code: tenantZip,
      country: tenantCountry,
    };
    let stripeAccountID = null;
    let connectAccountError = null;
    let representativeError = null;
    try {
      const result = await stripeConnectInternals.createAccountInternal({
        secret: stripeConnectInternals.STRIPE_PLATFORM_SECRET_KEY,
        db,
        tenantID,
        email: callerEmail,
        businessName,
        byUID: auth.uid,
        businessType: "company",
        mcc: "5940",
        companyPhone: ownerPhone,
        companyAddress: stripeAddress,
        country: tenantCountry,
        representative: {
          firstName: ownerFirstName,
          lastName: ownerLastName,
          email: callerEmail,
          phone: ownerPhone,
          address: stripeAddress,
        },
        fullBakeForTest: false,
      });
      stripeAccountID = result.stripeAccountID;
      representativeError = result.representativeError || null;
    } catch (err) {
      connectAccountError = (err && err.message) || String(err);
      logger.error("tenantSetupFinalizeCallable: Connect create failed", {
        tenantID,
        error: connectAccountError,
      });
    }

    // CRITICAL adoption contract: stamp the setup doc with the literal string
    // "adopted" BEFORE deleting it ONLY when the purchase path actually
    // adopted a subaccount. For pool/opt-out the prospect may have created
    // a setup subaccount earlier in the flow (started "buy", switched mid-
    // way) — we want the cleanup trigger to close it on delete, not skip it.
    const adoptionStamp = {
      adoptedAt: FieldValue.serverTimestamp(),
      adoptedTenantID: tenantID,
      adoptedStoreID: storeID,
      adoptedByUID: auth.uid,
      adoptedSmsChoice: smsChoice,
    };
    if (smsChoice === "purchase" && !twilioAdoptionError) {
      adoptionStamp.twilioSubaccountStatus = "adopted";
    }
    await docRef.update(adoptionStamp);

    await docRef.delete();

    // Post-adoption portal welcome email. Body branches on smsChoice
    // (purchase / pool-with-expiry banner / opt-out). Non-fatal: a failure
    // here doesn't roll back the live tenant — the owner can request a
    // fresh link from support. Logged loudly so alerting catches a bad
    // SMTP config.
    let portalWelcomeEmailError = null;
    try {
      const poolExpiresAtMs =
        smsChoice === "pool" &&
        poolInfo &&
        poolInfo.expiresAt &&
        typeof poolInfo.expiresAt.toMillis === "function"
          ? poolInfo.expiresAt.toMillis()
          : null;
      const result = await sendPortalWelcomeEmail({
        ownerEmail: callerEmail,
        tenantName: businessName,
        smsChoice,
        poolExpiresAtMs,
      });
      logger.info("tenantSetupFinalizeCallable: portal welcome email sent", {
        tenantID,
        ownerEmail: callerEmail,
        messageId: result.messageId,
      });
    } catch (err) {
      portalWelcomeEmailError = (err && err.message) || String(err);
      logger.error(
        "tenantSetupFinalizeCallable: portal welcome email failed",
        {
          tenantID,
          ownerEmail: callerEmail,
          error: portalWelcomeEmailError,
        }
      );
    }

    const ownerProvisioningSummary = ownerProvisioningResults
      ? ownerProvisioningResults.map((r) => ({
          email: r.email,
          role: r.role,
          authCreated: r.authCreated,
          claimsSet: r.claimsSet,
          emailUserDocWritten: r.emailUserDocWritten,
          emailSent: r.emailSent,
          error: r.error,
        }))
      : null;

    logger.info("tenantSetupFinalizeCallable: tenant adopted", {
      tenantID,
      storeID,
      ownerUID: auth.uid,
      ownerEmail: callerEmail,
      billingTier,
      subscriptionTierID,
      smsChoice,
      numberSource,
      stripeAccountID,
      stripeSubscriptionID,
      connectAccountError,
      representativeError,
      twilioAdoptionError,
      billingSubscriptionError,
      portalWelcomeEmailError,
      ownerProvisioningError,
      ownerProvisioningSummary,
      additionalOwnersCount: additionalOwners.length,
    });

    return {
      success: true,
      tenantID,
      storeID,
      smsChoice,
      numberSource,
      stripeAccountID,
      stripeSubscriptionID,
      connectAccountError,
      representativeError,
      twilioAdoptionError,
      billingSubscriptionError,
      portalWelcomeEmailError,
      ownerProvisioningError,
      ownerProvisioningSummary,
    };
  }
);
