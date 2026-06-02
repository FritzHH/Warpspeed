const crypto = require("crypto");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { logger } = require("firebase-functions");
const nodemailer = require("nodemailer");

// Owner PIN provisioning for the tenant setup wizard.
//
// At finalize time we provision each owner (primary + any additional owners
// the prospect listed) with:
//   1. A Firebase Auth user (created if missing) + custom claims
//      { tenantID, privilege: "owner", stores: [storeID] }. Primary owner's
//      Auth user already exists (the caller); we only stamp claims for them.
//   2. An email_users doc under tenants/{tenantID}/stores/{storeID}/email_users
//      with permissions: "Owner" and a hashed 4-digit PIN.
//   3. A welcome email containing their PIN + a portal sign-in link.
//
// PIN hashing mirrors src/utils.js#hashPin so that PINs set here verify
// against the client's POS login flow:
//   - 16-byte hex salt (32 chars)
//   - SHA-256 over `salt + ":" + pin`, returned as 64-char hex.
//
// Collision avoidance: PINs must be unique within the tenant's email_users.
// We generate-and-retry up to 50 times against the running set; with a 10k
// keyspace and small N this converges in 1-2 tries.

const PIN_GENERATION_MAX_ATTEMPTS = 50;

function generatePin() {
  const n = crypto.randomInt(0, 10000);
  return String(n).padStart(4, "0");
}

function generatePinSalt() {
  return crypto.randomBytes(16).toString("hex");
}

function hashPin(pin, salt) {
  if (!pin || !salt) return "";
  return crypto.createHash("sha256").update(`${salt}:${pin}`).digest("hex");
}

function generateUniquePin(usedPins) {
  for (let i = 0; i < PIN_GENERATION_MAX_ATTEMPTS; i++) {
    const candidate = generatePin();
    if (!usedPins.has(candidate)) {
      usedPins.add(candidate);
      return candidate;
    }
  }
  throw new Error(
    `Could not allocate a unique PIN after ${PIN_GENERATION_MAX_ATTEMPTS} attempts.`
  );
}

// Looks up an existing Firebase Auth user by email, or creates one with no
// password. Returns the uid. Used for additional-owner provisioning where
// the prospect supplies an email but the owner hasn't signed up themselves.
async function getOrCreateAuthUser({ email, firstName, lastName }) {
  try {
    const existing = await admin.auth().getUserByEmail(email);
    return { uid: existing.uid, created: false };
  } catch (err) {
    if (err && err.code === "auth/user-not-found") {
      const displayName = [firstName, lastName].filter(Boolean).join(" ").trim();
      const created = await admin.auth().createUser({
        email,
        emailVerified: false,
        displayName: displayName || undefined,
        disabled: false,
      });
      return { uid: created.uid, created: true };
    }
    throw err;
  }
}

// Stamps the canonical owner claims on a uid: { tenantID, privilege: "owner",
// stores: [storeID] }. Mirrors setUserClaims in auth-claims.js — duplicated
// here to avoid a circular require (this module gets imported from
// auth-claims.js itself).
async function setOwnerClaims(uid, { tenantID, storeID }) {
  await admin.auth().setCustomUserClaims(uid, {
    tenantID,
    privilege: "owner",
    stores: [storeID],
  });
}

// Builds the APP_USER-shaped email_users doc for an owner. Mirrors the
// client-side APP_USER prototype from src/data.js with the fields a fresh
// owner needs:
//   - permissions "Owner" → level 5 via permissionToLevel
//   - pinHash + pinSalt (no plaintext pin stored)
//   - empty face descriptor, stores assignment, etc.
function buildOwnerEmailUserDoc({
  uid,
  email,
  firstName,
  lastName,
  phone,
  pinHash,
  pinSalt,
  storeID,
  isPrimary,
  createdByUID,
}) {
  return {
    id: uid,
    first: firstName,
    last: lastName,
    email,
    phone: phone || "",
    permissions: "Owner",
    pin: "",
    pinHash,
    pinSalt,
    faceDescriptor: "",
    linkedUserID: "",
    hourlyWage: "",
    preview: true,
    forwardSMS: false,
    hidden: false,
    disabled: false,
    stores: [storeID],
    statuses: [],
    emailInboxes: [],
    pendingWorkorderIDs: [],
    loginMessageSuppressUntil: 0,
    personalNotes: [],
    showNewUserHelp: true,
    isPrimaryOwner: !!isPrimary,
    createdAt: FieldValue.serverTimestamp(),
    createdByUID,
    createdByKind: "tenant-setup-owner-provisioning",
  };
}

// Sends the per-owner welcome email containing the plaintext PIN. The PIN
// is delivered ONLY at provisioning time and never persisted — the owner
// rotates it via the in-app Settings UI after their first login. signInLink
// is the same email-link mechanism we use for the portal welcome.
function renderOwnerPinEmailHtml({
  firstName,
  tenantName,
  pin,
  signInLink,
  isPrimary,
}) {
  const accent = "#2563eb";
  const role = isPrimary ? "owner" : "co-owner";
  const intro = isPrimary
    ? `Welcome to Cadence. ${tenantName} is live and your owner account is ready.`
    : `You've been added as a co-owner of ${tenantName} on Cadence POS.`;
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;max-width:560px;margin:0 auto">
  <div style="border-top:4px solid ${accent};padding:24px 0 8px 0">
    <div style="font-size:11px;letter-spacing:0.18em;color:${accent};font-weight:700;text-transform:uppercase">Cadence POS</div>
    <h1 style="margin:6px 0 4px 0;font-size:22px;letter-spacing:-0.01em">Hi ${firstName} — your ${role} PIN</h1>
  </div>
  <p style="margin:8px 0 14px 0;line-height:1.55">${intro}</p>
  <div style="margin:18px 0;padding:16px 18px;border:1px solid #d1d5db;background:#f9fafb;border-radius:6px;text-align:center">
    <div style="font-size:11px;letter-spacing:0.18em;color:#6b7280;font-weight:700;text-transform:uppercase">Your PIN</div>
    <div style="margin:6px 0 0 0;font-size:32px;letter-spacing:0.3em;font-weight:700;font-family:'SF Mono',Menlo,Consolas,monospace">${pin}</div>
  </div>
  <p style="margin:8px 0 14px 0;line-height:1.55">Use this PIN at the POS terminal to sign in. You can change it any time from the in-app Settings page.</p>
  <div style="margin-top:28px;padding:18px 0;border-top:1px solid #e5e7eb">
    <p style="margin:0 0 10px 0;font-size:14px">Need to open the portal (billing, team, account settings)?</p>
    <p style="margin:0 0 14px 0"><a href="${signInLink}" style="display:inline-block;padding:10px 18px;background:${accent};color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Open Cadence Portal</a></p>
    <p style="margin:0;color:#666;font-size:12px;word-break:break-all">Or copy this link: ${signInLink}</p>
    <p style="margin:14px 0 0 0;color:#666;font-size:12px">This sign-in link is single-use and expires after a short time. Your PIN does not expire — keep this email safe.</p>
  </div>
</div>`;
}

async function sendOwnerPinEmail({
  ownerEmail,
  firstName,
  tenantName,
  pin,
  signInLink,
  isPrimary,
  fromEmail,
  smtpUser,
  fromPassword,
}) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: smtpUser, pass: fromPassword },
  });
  const subject = isPrimary
    ? `Your Cadence POS PIN — ${tenantName}`
    : `You're a co-owner of ${tenantName} on Cadence — your PIN inside`;
  const html = renderOwnerPinEmailHtml({
    firstName,
    tenantName,
    pin,
    signInLink,
    isPrimary,
  });
  const info = await transporter.sendMail({
    from: `"Cadence POS" <${fromEmail}>`,
    to: ownerEmail,
    subject,
    html,
  });
  return { messageId: info.messageId };
}

// Provisions ALL owners (primary + additional) for a fresh tenant. Returns
// a per-owner result list so the caller can log/report partial failures
// without aborting the whole finalize (the tenant is already live by the
// time we're called).
//
// Inputs:
//   db                  - getFirestore() instance
//   tenantID, storeID   - just-created tenant + first store
//   tenantName          - display name for emails
//   primaryOwner        - { uid, email, firstName, lastName, phone }
//   additionalOwners    - [{ email, firstName, lastName, phone }, ...]
//   createdByUID        - caller's uid (for audit fields)
//   buildPortalSignInLink(ownerEmail) - async, returns single-use portal link
//   smtpConfig          - { fromEmail, smtpUser, fromPassword }
//
// Returns:
//   [{ email, role: "primary"|"additional", uid, authCreated, claimsSet,
//      emailUserDocWritten, pin, emailSent, error?: string }, ...]
async function provisionOwnersWithPins({
  db,
  tenantID,
  storeID,
  tenantName,
  primaryOwner,
  additionalOwners,
  createdByUID,
  buildPortalSignInLink,
  smtpConfig,
}) {
  const usedPins = new Set();
  const results = [];

  const storeRef = db
    .collection("tenants")
    .doc(tenantID)
    .collection("stores")
    .doc(storeID);
  const emailUsersRef = storeRef.collection("email_users");

  const allOwners = [
    {
      role: "primary",
      uid: primaryOwner.uid,
      email: primaryOwner.email,
      firstName: primaryOwner.firstName,
      lastName: primaryOwner.lastName,
      phone: primaryOwner.phone,
      authCreated: false,
    },
    ...additionalOwners.map((o) => ({
      role: "additional",
      uid: null,
      email: o.email,
      firstName: o.firstName,
      lastName: o.lastName,
      phone: o.phone,
      authCreated: false,
    })),
  ];

  for (const owner of allOwners) {
    const result = {
      email: owner.email,
      role: owner.role,
      uid: owner.uid,
      authCreated: false,
      claimsSet: false,
      emailUserDocWritten: false,
      pin: null,
      emailSent: false,
      error: null,
    };
    try {
      if (owner.role === "additional") {
        const { uid, created } = await getOrCreateAuthUser({
          email: owner.email,
          firstName: owner.firstName,
          lastName: owner.lastName,
        });
        owner.uid = uid;
        result.uid = uid;
        result.authCreated = created;

        const existingClaims =
          (await admin.auth().getUser(uid)).customClaims || {};
        if (
          existingClaims.tenantID &&
          existingClaims.tenantID !== tenantID
        ) {
          throw new Error(
            `Additional owner ${owner.email} is already a member of tenant ${existingClaims.tenantID}.`
          );
        }
      }

      await setOwnerClaims(owner.uid, { tenantID, storeID });
      result.claimsSet = true;

      const pin = generateUniquePin(usedPins);
      const salt = generatePinSalt();
      const hashed = hashPin(pin, salt);
      result.pin = pin;

      const doc = buildOwnerEmailUserDoc({
        uid: owner.uid,
        email: owner.email,
        firstName: owner.firstName,
        lastName: owner.lastName,
        phone: owner.phone,
        pinHash: hashed,
        pinSalt: salt,
        storeID,
        isPrimary: owner.role === "primary",
        createdByUID,
      });
      await emailUsersRef.doc(owner.uid).set(doc);
      result.emailUserDocWritten = true;

      const signInLink = await buildPortalSignInLink(owner.email);
      await sendOwnerPinEmail({
        ownerEmail: owner.email,
        firstName: owner.firstName,
        tenantName,
        pin,
        signInLink,
        isPrimary: owner.role === "primary",
        fromEmail: smtpConfig.fromEmail,
        smtpUser: smtpConfig.smtpUser,
        fromPassword: smtpConfig.fromPassword,
      });
      result.emailSent = true;
    } catch (err) {
      result.error = (err && err.message) || String(err);
      logger.error("provisionOwnersWithPins: owner provisioning failed", {
        tenantID,
        storeID,
        ownerEmail: owner.email,
        role: owner.role,
        error: result.error,
      });
    }
    results.push(result);
  }

  return results;
}

module.exports = {
  generatePin,
  generatePinSalt,
  hashPin,
  generateUniquePin,
  provisionOwnersWithPins,
};
