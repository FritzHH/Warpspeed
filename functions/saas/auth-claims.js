/* eslint-disable */
// Auth claims provisioning callables (Phase 1 of auth-claims rollout).
//
// Three callables, plus internal helpers for sign-in link generation:
//
//   - platformAdminCreateTenantCallable
//       Platform-admin only. Creates a brand-new tenant + provisions its
//       first owner. Writes tenants/{tenantID}, stamps {tenantID, privilege:
//       "owner"} claims on the owner's Auth user, returns a sign-in link
//       the caller can hand to the owner via any channel (email, SMS, copy
//       in person). The platformAdmin claim itself is set manually for fritz
//       via a one-off admin-SDK script — never via a callable.
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
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const crypto = require("crypto");
const {
  PRIVILEGES,
  PRIVILEGE_RANK,
  assertPrivilege,
  assertPlatformAdmin,
  setUserClaims,
} = require("./auth-guards");

if (!admin.apps.length) admin.initializeApp();

const INVITE_LANDING_URL = "https://cadence-pos.web.app/invite-accept";
const INVITE_TTL_DAYS = 7;
const TENANT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

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

exports.platformAdminCreateTenantCallable = onCall(
  { region: "us-central1" },
  async (request) => {
    const auth = requireAuth(request);
    assertPlatformAdmin(auth);

    const { tenantID, tenantName, ownerEmail } = request.data || {};

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

    const db = getFirestore();

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
    let ownerUser;
    try {
      ownerUser = await admin.auth().getUserByEmail(normalizedEmail);
    } catch (err) {
      if (err && err.code === "auth/user-not-found") {
        ownerUser = await admin.auth().createUser({
          email: normalizedEmail,
          emailVerified: false,
        });
      } else {
        throw err;
      }
    }

    // Reject if the user is already a member of any tenant — claim collision
    // means they'd need a separate Auth account (per the one-user-one-tenant
    // design). The platform-admin must use a different email.
    const existingClaims = ownerUser.customClaims || {};
    if (existingClaims.tenantID) {
      throw new HttpsError(
        "already-exists",
        `User ${normalizedEmail} is already a member of tenant ${existingClaims.tenantID}.`
      );
    }

    await setUserClaims(ownerUser.uid, {
      tenantID,
      privilege: "owner",
      stores: [],
    });

    await tenantRef.set({
      name: tenantName,
      ownerUID: ownerUser.uid,
      ownerEmail: normalizedEmail,
      createdAt: FieldValue.serverTimestamp(),
      createdByUID: auth.uid,
    });

    const signInLink = await admin
      .auth()
      .generateSignInWithEmailLink(normalizedEmail, {
        url: `${INVITE_LANDING_URL}?bootstrap=1`,
        handleCodeInApp: true,
      });

    logger.info("platformAdminCreateTenantCallable: tenant created", {
      tenantID,
      ownerUID: ownerUser.uid,
      createdByUID: auth.uid,
    });

    return {
      success: true,
      tenantID,
      ownerUID: ownerUser.uid,
      ownerEmail: normalizedEmail,
      signInLink,
    };
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
