/* eslint-disable */
// Phase 5 — A2P 10DLC registration (ISV / partner model).
//
// US carriers require every brand sending application-to-person SMS to be
// registered through The Campaign Registry (TCR), brokered by Twilio's
// Trust Hub. Without an approved brand + campaign, US carriers filter
// our messages even though Twilio accepts them.
//
// ISV/partner model: we (RSS LLC, once formed) register brands ON BEHALF OF
// each tenant. All Trust Hub resources live under the MASTER account
// (RSS LLC's). Each brand references a specific subaccount via a
// `customer_profile` that holds the tenant's business info.
//
// Stage 1 (code-only) — these callables shape the Trust Hub workflow but
// can't be exercised end-to-end until:
//   - RSS LLC is registered AND approved as an ISV by Twilio (Stage 3)
//   - We have a real subaccount with verifiable EIN data (Stage 2 uses
//     Twilio's sandbox EIN values)
//
// Lifecycle:
//   submitTenantA2PBrand   →  CP + Trust Product + Brand (sequential)
//   submitTenantA2PCampaign →  Messaging Service + US App To Person
//   linkNumberToA2PCampaign →  attach number to messaging service
//   getTenantA2PStatus      →  read-back for admin UI
//   scheduledA2PStatusPoll  →  advances pending CPs / brands / campaigns
//
// State persists in tenants/{tid}/private/twilio-a2p so the subaccount doc
// (tenants/{tid}/private/twilio) stays focused on subaccount lifecycle.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const common = require("./twilio-common");
const { assertPlatformAdmin } = require("./auth-guards");

if (!admin.apps.length) admin.initializeApp();

const {
  TWILIO_MASTER_ACCOUNT_SID,
  TWILIO_MASTER_AUTH_TOKEN,
  requireAuth,
  requireTenantMember,
  requireTenantMemberWithLevel,
  tenantTwilioDocRef,
  writeAuditEvent,
  masterTwilioClient,
} = common;

const A2P_FUNCTION_OPTS = {
  region: "us-central1",
  secrets: [TWILIO_MASTER_ACCOUNT_SID, TWILIO_MASTER_AUTH_TOKEN],
  timeoutSeconds: 120,
};

function tenantA2PDocRef(db, tenantID) {
  return db
    .collection("tenants").doc(tenantID)
    .collection("private").doc("twilio-a2p");
}

// ─────────────────────────────────────────────────────────────────────────
// Internal helpers — shared body for tenant-admin + platform-admin callables.
// Caller is responsible for auth gating (requireTenantMemberWithLevel for
// tenant-admin, assertPlatformAdmin + tenant-doc-exists for platform-admin).
// ─────────────────────────────────────────────────────────────────────────

function validateBrandInputs(input) {
  const {
    businessLegalName,
    businessEIN,
    businessEntityType,
    businessVertical,
    businessAddress,
    businessWebsite,
    businessEmail,
    authorizedRep,
  } = input || {};
  if (
    !businessLegalName ||
    !businessEIN ||
    !businessEntityType ||
    !businessVertical ||
    !businessAddress ||
    !businessWebsite ||
    !businessEmail ||
    !authorizedRep
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Missing one or more required brand registration fields."
    );
  }
}

async function submitBrandInternal({ tenantID, businessInfo, actorUID, actorKind }) {
  validateBrandInputs(businessInfo);
  const {
    businessLegalName,
    businessEIN,
    businessRegistrationID,
    businessEntityType,
    businessVertical,
    businessAddress,
    businessWebsite,
    businessEmail,
    businessPhone,
    stockSymbol,
    stockExchange,
    authorizedRep,
  } = businessInfo;

  const db = getFirestore();
  const subaccountSnap = await tenantTwilioDocRef(db, tenantID).get();
  if (!subaccountSnap.exists) {
    throw new HttpsError(
      "failed-precondition",
      `Tenant ${tenantID} has no Twilio subaccount.`
    );
  }
  const { subaccountSid, status: subaccountStatus } = subaccountSnap.data() || {};
  if (subaccountStatus !== "active") {
    throw new HttpsError(
      "failed-precondition",
      `Subaccount for ${tenantID} is ${subaccountStatus}.`
    );
  }

  const a2pRef = tenantA2PDocRef(db, tenantID);
  const existing = await a2pRef.get();
  if (existing.exists && existing.data().brandSid) {
    logger.info("submitBrandInternal: brand already submitted", {
      tenantID,
      brandSid: existing.data().brandSid,
      actorKind,
    });
    return {
      alreadySubmitted: true,
      brandSid: existing.data().brandSid,
      brandStatus: existing.data().brandStatus,
    };
  }

  const client = masterTwilioClient();

  const repEndUser = await client.trusthub.v1.endUsers.create({
    type: "authorized_representative_1",
    friendlyName: `${tenantID}-rep`,
    attributes: {
      first_name: authorizedRep.firstName,
      last_name: authorizedRep.lastName,
      email: authorizedRep.email,
      phone_number: authorizedRep.phone,
      job_title: authorizedRep.jobTitle,
      job_position: authorizedRep.jobPosition,
      business_title: authorizedRep.jobTitle,
    },
  });

  const businessEndUser = await client.trusthub.v1.endUsers.create({
    type: "customer_profile_business_information",
    friendlyName: `${tenantID}-business-info`,
    attributes: {
      business_name: businessLegalName,
      business_registration_number: businessRegistrationID || businessEIN,
      business_registration_identifier: "EIN",
      business_identity: "direct_customer",
      business_industry: businessVertical,
      business_type: businessEntityType,
      website_url: businessWebsite,
      ...(stockSymbol ? { stock_ticker: stockSymbol } : {}),
      ...(stockExchange ? { stock_exchange: stockExchange } : {}),
    },
  });

  const SECONDARY_CP_POLICY = "RNdfbf3fae0e1107f8aded0e7cead80bf5";
  const customerProfile = await client.trusthub.v1.customerProfiles.create({
    friendlyName: `${tenantID}-cp`,
    email: businessEmail,
    policySid: SECONDARY_CP_POLICY,
    statusCallback: null,
  });

  await client.trusthub.v1
    .customerProfiles(customerProfile.sid)
    .customerProfilesEntityAssignments.create({ objectSid: businessEndUser.sid });
  await client.trusthub.v1
    .customerProfiles(customerProfile.sid)
    .customerProfilesEntityAssignments.create({ objectSid: repEndUser.sid });

  const address = await client.addresses.create({
    customerName: businessLegalName,
    street: businessAddress.street,
    city: businessAddress.city,
    region: businessAddress.region,
    postalCode: businessAddress.postalCode,
    isoCountry: businessAddress.country || "US",
    friendlyName: `${tenantID}-address`,
  });
  await client.trusthub.v1
    .customerProfiles(customerProfile.sid)
    .customerProfilesEntityAssignments.create({ objectSid: address.sid });

  await client.trusthub.v1
    .customerProfiles(customerProfile.sid)
    .update({ status: "pending-review" });

  const A2P_TRUST_POLICY = "RN670d5d2e282a6130ae063b234b6019c8";
  const trustProduct = await client.trusthub.v1.trustProducts.create({
    friendlyName: `${tenantID}-a2p-trust-product`,
    email: businessEmail,
    policySid: A2P_TRUST_POLICY,
  });

  await client.trusthub.v1
    .trustProducts(trustProduct.sid)
    .trustProductsEntityAssignments.create({ objectSid: customerProfile.sid });

  const brandEndUser = await client.trusthub.v1.endUsers.create({
    type: "us_a2p_messaging_profile_information",
    friendlyName: `${tenantID}-a2p-info`,
    attributes: {
      company_type:
        businessEntityType === "Non-profit Corporation" ? "non-profit" : "private",
      ...(stockSymbol ? { stock_ticker: stockSymbol } : {}),
      ...(stockExchange ? { stock_exchange: stockExchange } : {}),
    },
  });
  await client.trusthub.v1
    .trustProducts(trustProduct.sid)
    .trustProductsEntityAssignments.create({ objectSid: brandEndUser.sid });

  await client.trusthub.v1
    .trustProducts(trustProduct.sid)
    .update({ status: "pending-review" });

  const brand = await client.messaging.v1.brandRegistrations.create({
    customerProfileBundleSid: customerProfile.sid,
    a2pProfileBundleSid: trustProduct.sid,
    brandType: "STANDARD",
    skipAutomaticSecVet: false,
  });

  await a2pRef.set(
    {
      subaccountSid: subaccountSid || null,
      customerProfileSid: customerProfile.sid,
      customerProfileStatus: "pending-review",
      trustProductSid: trustProduct.sid,
      trustProductStatus: "pending-review",
      brandSid: brand.sid,
      brandStatus: brand.status || "PENDING",
      brandType: brand.brandType || "STANDARD",
      businessEndUserSid: businessEndUser.sid,
      repEndUserSid: repEndUser.sid,
      brandEndUserSid: brandEndUser.sid,
      addressSid: address.sid,
      submittedAt: FieldValue.serverTimestamp(),
      submittedByUID: actorUID,
      businessLegalName,
      businessEIN,
      businessVertical,
      businessEmail,
    },
    { merge: true }
  );

  await tenantTwilioDocRef(db, tenantID).set(
    {
      a2pBrandSid: brand.sid,
      a2pCustomerProfileSid: customerProfile.sid,
      a2pTrustProductSid: trustProduct.sid,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await writeAuditEvent(db, tenantID, {
    type: "a2p-brand-submitted",
    brandSid: brand.sid,
    customerProfileSid: customerProfile.sid,
    trustProductSid: trustProduct.sid,
    actorUID,
    actorKind,
  });

  logger.info("submitBrandInternal: submitted", {
    tenantID,
    brandSid: brand.sid,
    customerProfileSid: customerProfile.sid,
    trustProductSid: trustProduct.sid,
    actorKind,
  });

  return {
    brandSid: brand.sid,
    brandStatus: brand.status || "PENDING",
    customerProfileSid: customerProfile.sid,
    trustProductSid: trustProduct.sid,
  };
}

function validateCampaignInputs(input) {
  const { useCase, description, messageSamples, messageFlow } = input || {};
  if (
    !useCase ||
    !description ||
    !messageSamples ||
    messageSamples.length < 2 ||
    !messageFlow
  ) {
    throw new HttpsError(
      "invalid-argument",
      "useCase, description, messageFlow, and 2+ messageSamples are required."
    );
  }
}

async function submitCampaignInternal({
  tenantID,
  campaignInfo,
  actorUID,
  actorKind,
}) {
  validateCampaignInputs(campaignInfo);
  const {
    useCase,
    brandSid: brandSidOverride,
    description,
    messageSamples,
    messageFlow,
    optInKeywords,
    optOutKeywords,
    helpKeywords,
    optInMessage,
    optOutMessage,
    helpMessage,
  } = campaignInfo;

  const db = getFirestore();
  const a2pRef = tenantA2PDocRef(db, tenantID);
  const a2pSnap = await a2pRef.get();
  if (!a2pSnap.exists) {
    throw new HttpsError(
      "failed-precondition",
      `Tenant ${tenantID} has not submitted an A2P brand yet.`
    );
  }
  const a2pData = a2pSnap.data() || {};
  const brandSid = brandSidOverride || a2pData.brandSid;
  if (!brandSid) {
    throw new HttpsError("failed-precondition", "No brandSid available.");
  }
  if (a2pData.brandStatus !== "APPROVED" && a2pData.brandStatus !== "VERIFIED") {
    logger.warn("submitCampaignInternal: brand not approved yet", {
      tenantID,
      brandSid,
      brandStatus: a2pData.brandStatus,
    });
  }

  if (a2pData.campaignSid) {
    logger.info("submitCampaignInternal: campaign already submitted", {
      tenantID,
      campaignSid: a2pData.campaignSid,
    });
    return {
      alreadySubmitted: true,
      messagingServiceSid: a2pData.messagingServiceSid,
      campaignSid: a2pData.campaignSid,
      campaignStatus: a2pData.campaignStatus,
    };
  }

  const client = masterTwilioClient();

  const messagingService = await client.messaging.v1.services.create({
    friendlyName: `${tenantID}-messaging`,
    usecase: useCase.toLowerCase().replace(/_/g, " "),
    useInboundWebhookOnNumber: true,
    mmsConverter: true,
  });

  const campaign = await client.messaging.v1
    .services(messagingService.sid)
    .usAppToPerson.create({
      brandRegistrationSid: brandSid,
      description,
      messageFlow,
      messageSamples,
      usAppToPersonUsecase: useCase,
      hasEmbeddedLinks: true,
      hasEmbeddedPhone: true,
      optInKeywords: optInKeywords || [],
      optOutKeywords:
        optOutKeywords || ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"],
      helpKeywords: helpKeywords || ["HELP", "INFO"],
      optInMessage: optInMessage || "You are opted in. Reply STOP to opt out.",
      optOutMessage:
        optOutMessage || "You are opted out. No further messages.",
      helpMessage:
        helpMessage || "Reply STOP to opt out. Msg & data rates may apply.",
    });

  await a2pRef.set(
    {
      messagingServiceSid: messagingService.sid,
      campaignSid: campaign.sid,
      campaignStatus: campaign.campaignStatus || "PENDING",
      campaignUseCase: useCase,
      campaignSubmittedAt: FieldValue.serverTimestamp(),
      campaignSubmittedByUID: actorUID,
    },
    { merge: true }
  );

  await tenantTwilioDocRef(db, tenantID).set(
    {
      a2pCampaignSid: campaign.sid,
      messagingServiceSid: messagingService.sid,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await writeAuditEvent(db, tenantID, {
    type: "a2p-campaign-submitted",
    messagingServiceSid: messagingService.sid,
    campaignSid: campaign.sid,
    useCase,
    actorUID,
    actorKind,
  });

  logger.info("submitCampaignInternal: submitted", {
    tenantID,
    messagingServiceSid: messagingService.sid,
    campaignSid: campaign.sid,
    actorKind,
  });

  return {
    messagingServiceSid: messagingService.sid,
    campaignSid: campaign.sid,
    campaignStatus: campaign.campaignStatus || "PENDING",
  };
}

// Links a single number into the messaging service. Writes a2pLinkedAt onto
// the per-number store doc so bulk-link can skip idempotently and the UI can
// derive "all linked" without scanning Twilio. Returns one of:
//   { ok: true, alreadyLinked?: true, phoneNumber }
//   throws on hard failure
async function linkNumberInternal({
  tenantID,
  phoneNumberSid,
  actorUID,
  actorKind,
}) {
  const db = getFirestore();
  const a2pSnap = await tenantA2PDocRef(db, tenantID).get();
  if (!a2pSnap.exists) {
    throw new HttpsError(
      "failed-precondition",
      `Tenant ${tenantID} has no A2P state.`
    );
  }
  const { messagingServiceSid } = a2pSnap.data() || {};
  if (!messagingServiceSid) {
    throw new HttpsError(
      "failed-precondition",
      `Tenant ${tenantID} has no messaging service.`
    );
  }

  // Find the per-store twilio doc for this SID so we can stamp link state.
  // Collection-group query keyed by phoneNumberSid — the per-store docs use
  // the SID as the doc ID, but a fan-out across stores is still required.
  const tenantStoresSnap = await db
    .collection("tenants").doc(tenantID).collection("stores").get();
  let perNumberRef = null;
  let perNumberPhoneNumber = null;
  for (const storeDoc of tenantStoresSnap.docs) {
    const ref = storeDoc.ref.collection("twilio").doc(phoneNumberSid);
    const snap = await ref.get();
    if (snap.exists) {
      perNumberRef = ref;
      perNumberPhoneNumber = (snap.data() || {}).phoneNumber || null;
      if (snap.data() && snap.data().a2pLinkedAt) {
        logger.info("linkNumberInternal: already linked", {
          tenantID,
          phoneNumberSid,
        });
        return {
          ok: true,
          alreadyLinked: true,
          phoneNumber: perNumberPhoneNumber,
        };
      }
      break;
    }
  }

  const client = masterTwilioClient();
  try {
    await client.messaging.v1
      .services(messagingServiceSid)
      .phoneNumbers.create({ phoneNumberSid });
  } catch (err) {
    // 21712 = "Phone Number already in another Messaging Service"
    if (err && (err.code === 21712 || err.status === 409)) {
      if (perNumberRef) {
        await perNumberRef.set(
          {
            a2pLinkedAt: FieldValue.serverTimestamp(),
            a2pMessagingServiceSid: messagingServiceSid,
          },
          { merge: true }
        );
      }
      return {
        ok: true,
        alreadyLinked: true,
        phoneNumber: perNumberPhoneNumber,
      };
    }
    throw err;
  }

  if (perNumberRef) {
    await perNumberRef.set(
      {
        a2pLinkedAt: FieldValue.serverTimestamp(),
        a2pMessagingServiceSid: messagingServiceSid,
      },
      { merge: true }
    );
  }

  await writeAuditEvent(db, tenantID, {
    type: "a2p-number-linked",
    messagingServiceSid,
    phoneNumberSid,
    actorUID,
    actorKind,
  });

  logger.info("linkNumberInternal: linked", {
    tenantID,
    messagingServiceSid,
    phoneNumberSid,
    actorKind,
  });

  return { ok: true, phoneNumber: perNumberPhoneNumber };
}

async function getA2PStatusInternal({ tenantID }) {
  const db = getFirestore();
  const a2pSnap = await tenantA2PDocRef(db, tenantID).get();
  if (!a2pSnap.exists) {
    return { tenantID, hasA2P: false };
  }
  const data = a2pSnap.data() || {};
  const {
    brandSid,
    campaignSid,
    messagingServiceSid,
    customerProfileSid,
    trustProductSid,
  } = data;

  const result = {
    tenantID,
    hasA2P: true,
    customerProfileSid: customerProfileSid || null,
    customerProfileStatus: data.customerProfileStatus || null,
    trustProductSid: trustProductSid || null,
    trustProductStatus: data.trustProductStatus || null,
    brandSid: brandSid || null,
    brandStatus: data.brandStatus || null,
    brandFailureReason: data.brandFailureReason || null,
    messagingServiceSid: messagingServiceSid || null,
    campaignSid: campaignSid || null,
    campaignStatus: data.campaignStatus || null,
  };

  // Best-effort live refresh — don't fail the call if Twilio is slow.
  try {
    const client = masterTwilioClient();
    if (brandSid) {
      const brand = await client.messaging.v1.brandRegistrations(brandSid).fetch();
      result.brandStatus = brand.status;
      result.brandFailureReason = brand.failureReason || null;
    }
    if (messagingServiceSid && campaignSid) {
      const campaign = await client.messaging.v1
        .services(messagingServiceSid)
        .usAppToPerson(campaignSid)
        .fetch();
      result.campaignStatus = campaign.campaignStatus;
    }
  } catch (err) {
    logger.warn("getA2PStatusInternal: live refresh failed (returning cached)", {
      tenantID,
      error: err && err.message,
    });
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────
// submitTenantA2PBrand
//
// Three-step Twilio Trust Hub flow run as one callable:
//   1. Customer Profile (CP) — the tenant's business info; assigns the
//      subaccount as the entity, evaluates against the secondary-customer-
//      profile policy, submits for review.
//   2. Trust Product (TP) — A2P-Standard Brand bundle; references CP,
//      evaluates against the A2P policy, submits.
//   3. Brand Registration — created from TP. Twilio assigns BNxxx SID.
//
// Inputs (request.data):
//   tenantID                — string, required
//   businessLegalName       — string, EIN-registered legal name
//   businessEIN             — string, US EIN (xx-xxxxxxx)
//   businessRegistrationID  — string, often the EIN; required by Trust Hub
//   businessEntityType      — "Sole Proprietorship" | "Partnership" |
//                             "Corporation" | "Limited Liability Corporation" |
//                             "Co-operative" | "Non-profit Corporation"
//   businessVertical        — TECHNOLOGY | RETAIL | etc. (see Twilio docs)
//   businessAddress         — { street, city, region, postalCode, country }
//   businessWebsite         — string
//   businessEmail           — string
//   businessPhone           — E.164 string
//   stockSymbol             — string, public-co only (optional)
//   stockExchange           — string, public-co only (optional)
//   authorizedRep           — { firstName, lastName, email, phone, jobTitle,
//                              jobPosition }
//
// Persists to tenants/{tid}/private/twilio-a2p with all SIDs and statuses.
// ─────────────────────────────────────────────────────────────────────────
exports.submitTenantA2PBrand = onCall(A2P_FUNCTION_OPTS, async (request) => {
  const auth = requireAuth(request);
  const { tenantID, ...businessInfo } = request.data || {};
  if (!tenantID) {
    throw new HttpsError("invalid-argument", "tenantID is required.");
  }
  // A2P registration ties to tenant identity (EIN, legal name, rep). Admin+
  // is the right gate — tenant owner / compliance lead. Not "User" level.
  await requireTenantMemberWithLevel(tenantID, request, 4);
  return submitBrandInternal({
    tenantID,
    businessInfo,
    actorUID: auth.uid,
    actorKind: "tenant-admin",
  });
});


// ─────────────────────────────────────────────────────────────────────────
// submitTenantA2PCampaign
//
// Creates the Messaging Service + US App To Person campaign that all of a
// tenant's numbers send through. One messaging service per tenant for v1
// (a future multi-use-case tenant could need multiple — that's a v2 split).
//
// Inputs (request.data):
//   tenantID
//   useCase           — "CUSTOMER_CARE" | "MARKETING" | "MIXED" | etc.
//   brandSid          — optional; if omitted, looked up from twilio-a2p doc
//   description       — campaign description (what kind of messages)
//   messageSamples    — array of 2-5 sample messages
//   messageFlow       — how users opt in (free-form text)
//   optInKeywords     — array of opt-in keyword strings
//   optOutKeywords    — array of opt-out keyword strings (STOP, etc.)
//   helpKeywords      — array of help keyword strings (HELP, INFO)
//   optInMessage      — confirmation message sent after opt-in
//   optOutMessage     — confirmation message sent after opt-out
//   helpMessage       — help message text
// ─────────────────────────────────────────────────────────────────────────
exports.submitTenantA2PCampaign = onCall(A2P_FUNCTION_OPTS, async (request) => {
  const auth = requireAuth(request);
  const { tenantID, ...campaignInfo } = request.data || {};
  if (!tenantID) {
    throw new HttpsError("invalid-argument", "tenantID is required.");
  }
  await requireTenantMemberWithLevel(tenantID, request, 4);
  return submitCampaignInternal({
    tenantID,
    campaignInfo,
    actorUID: auth.uid,
    actorKind: "tenant-admin",
  });
});

// ─────────────────────────────────────────────────────────────────────────
// linkNumberToA2PCampaign
//
// Attaches a phone number to the tenant's messaging service, which binds it
// to the A2P campaign. After linking, outbound sends from this number flow
// through the campaign for carrier delivery.
//
// Numbers can only be in ONE messaging service at a time. For tenants with
// multiple use cases (future v2), this becomes one-of-N selection.
// ─────────────────────────────────────────────────────────────────────────
exports.linkNumberToA2PCampaign = onCall(A2P_FUNCTION_OPTS, async (request) => {
  const auth = requireAuth(request);
  const { tenantID, phoneNumberSid } = request.data || {};
  if (!tenantID || !phoneNumberSid) {
    throw new HttpsError(
      "invalid-argument",
      "tenantID and phoneNumberSid are required."
    );
  }
  await requireTenantMemberWithLevel(tenantID, request, 4);
  return linkNumberInternal({
    tenantID,
    phoneNumberSid,
    actorUID: auth.uid,
    actorKind: "tenant-admin",
  });
});

// ─────────────────────────────────────────────────────────────────────────
// unlinkNumberFromA2PCampaign — removes a number from the messaging service.
// Used during number release (Phase 7 churn flow) and number transfers.
// ─────────────────────────────────────────────────────────────────────────
exports.unlinkNumberFromA2PCampaign = onCall(A2P_FUNCTION_OPTS, async (request) => {
  const auth = requireAuth(request);

  const { tenantID, phoneNumberSid } = request.data || {};
  if (!tenantID || !phoneNumberSid) {
    throw new HttpsError(
      "invalid-argument",
      "tenantID and phoneNumberSid are required."
    );
  }

  await requireTenantMemberWithLevel(tenantID, request, 4);

  const db = getFirestore();
  const a2pSnap = await tenantA2PDocRef(db, tenantID).get();
  if (!a2pSnap.exists) {
    throw new HttpsError("not-found", `Tenant ${tenantID} has no A2P state.`);
  }
  const { messagingServiceSid } = a2pSnap.data() || {};
  if (!messagingServiceSid) {
    throw new HttpsError(
      "failed-precondition",
      `Tenant ${tenantID} has no messaging service.`
    );
  }

  const client = masterTwilioClient();
  try {
    await client.messaging.v1
      .services(messagingServiceSid)
      .phoneNumbers(phoneNumberSid)
      .remove();
  } catch (err) {
    if (err.status !== 404 && err.code !== 20404) throw err;
    // Already removed — fall through.
    logger.warn("unlinkNumberFromA2PCampaign: number not on service", {
      tenantID,
      messagingServiceSid,
      phoneNumberSid,
    });
  }

  await writeAuditEvent(db, tenantID, {
    type: "a2p-number-unlinked",
    messagingServiceSid,
    phoneNumberSid,
    actorUID: auth.uid,
  });

  return { messagingServiceSid, phoneNumberSid, unlinked: true };
});

// ─────────────────────────────────────────────────────────────────────────
// getTenantA2PStatus — read-back for admin UI. Returns the persisted state
// plus a freshly-fetched brand + campaign status from Twilio so the UI
// shows current values even if the poll hasn't run yet.
// ─────────────────────────────────────────────────────────────────────────
exports.getTenantA2PStatus = onCall(A2P_FUNCTION_OPTS, async (request) => {
  requireAuth(request);
  const { tenantID } = request.data || {};
  if (!tenantID) {
    throw new HttpsError("invalid-argument", "tenantID is required.");
  }
  await requireTenantMember(tenantID, request);
  return getA2PStatusInternal({ tenantID });
});

// ─────────────────────────────────────────────────────────────────────────
// Platform-admin variants — same flows, but gated on `platformAdmin === true`
// instead of tenant membership. Used by the cadence-dashboard host site
// where RSS punches in tenant business info on the tenant's behalf.
//
// All variants verify the tenants/{tenantID} doc exists (clearer error than
// the helpers' `failed-precondition` on private/twilio-a2p when caller
// typo's the tenantID).
// ─────────────────────────────────────────────────────────────────────────

async function assertTenantDocExists(tenantID) {
  const db = getFirestore();
  const tenantSnap = await db.collection("tenants").doc(tenantID).get();
  if (!tenantSnap.exists) {
    throw new HttpsError("not-found", `Tenant ${tenantID} does not exist.`);
  }
}

exports.platformAdminSubmitTenantA2PBrand = onCall(
  A2P_FUNCTION_OPTS,
  async (request) => {
    const auth = requireAuth(request);
    assertPlatformAdmin(auth);
    const { tenantID, ...businessInfo } = request.data || {};
    if (!tenantID) {
      throw new HttpsError("invalid-argument", "tenantID is required.");
    }
    await assertTenantDocExists(tenantID);
    return submitBrandInternal({
      tenantID,
      businessInfo,
      actorUID: auth.uid,
      actorKind: "platform-admin",
    });
  }
);

exports.platformAdminSubmitTenantA2PCampaign = onCall(
  A2P_FUNCTION_OPTS,
  async (request) => {
    const auth = requireAuth(request);
    assertPlatformAdmin(auth);
    const { tenantID, ...campaignInfo } = request.data || {};
    if (!tenantID) {
      throw new HttpsError("invalid-argument", "tenantID is required.");
    }
    await assertTenantDocExists(tenantID);
    return submitCampaignInternal({
      tenantID,
      campaignInfo,
      actorUID: auth.uid,
      actorKind: "platform-admin",
    });
  }
);

// Bulk-link every number owned by the tenant into the messaging service.
// Idempotent: per-number docs with a2pLinkedAt are skipped without hitting
// Twilio; 21712 (already in service) is treated as "alreadyLinked".
// Returns:
//   { linked: [...e164s], alreadyLinked: [...e164s], failed: [{ phoneNumber, error }] }
exports.platformAdminLinkAllNumbersToA2PCampaign = onCall(
  A2P_FUNCTION_OPTS,
  async (request) => {
    const auth = await assertPlatformAdmin(request);
    const { tenantID } = request.data || {};
    if (!tenantID) {
      throw new HttpsError("invalid-argument", "tenantID is required.");
    }
    await assertTenantDocExists(tenantID);

    const db = getFirestore();
    const a2pSnap = await tenantA2PDocRef(db, tenantID).get();
    if (!a2pSnap.exists || !(a2pSnap.data() || {}).messagingServiceSid) {
      throw new HttpsError(
        "failed-precondition",
        `Tenant ${tenantID} has no messaging service yet.`
      );
    }

    const linked = [];
    const alreadyLinked = [];
    const failed = [];

    const storesSnap = await db
      .collection("tenants").doc(tenantID).collection("stores").get();
    for (const storeDoc of storesSnap.docs) {
      const numbersSnap = await storeDoc.ref.collection("twilio").get();
      for (const numDoc of numbersSnap.docs) {
        const phoneNumberSid = numDoc.id;
        const { phoneNumber } = numDoc.data() || {};
        try {
          const result = await linkNumberInternal({
            tenantID,
            phoneNumberSid,
            actorUID: auth.uid,
            actorKind: "platform-admin",
          });
          if (result.alreadyLinked) {
            alreadyLinked.push(phoneNumber || phoneNumberSid);
          } else {
            linked.push(phoneNumber || phoneNumberSid);
          }
        } catch (err) {
          failed.push({
            phoneNumber: phoneNumber || phoneNumberSid,
            error: (err && err.message) || "unknown error",
          });
        }
      }
    }

    logger.info("platformAdminLinkAllNumbersToA2PCampaign: complete", {
      tenantID,
      linkedCount: linked.length,
      alreadyLinkedCount: alreadyLinked.length,
      failedCount: failed.length,
    });

    return { linked, alreadyLinked, failed };
  }
);

exports.platformAdminGetTenantA2PStatus = onCall(
  A2P_FUNCTION_OPTS,
  async (request) => {
    await assertPlatformAdmin(request);
    const { tenantID } = request.data || {};
    if (!tenantID) {
      throw new HttpsError("invalid-argument", "tenantID is required.");
    }
    await assertTenantDocExists(tenantID);
    return getA2PStatusInternal({ tenantID });
  }
);

// ─────────────────────────────────────────────────────────────────────────
// scheduledA2PStatusPoll
//
// Every 6 hours, advances all pending A2P registrations. Twilio takes hours
// to days to approve customer profiles, trust products, brands, and
// campaigns. Polling decouples our state from webhooks (Trust Hub doesn't
// emit webhooks for these transitions in all cases).
//
// Targets: any tenant with a twilio-a2p doc whose brand/campaign status is
// non-terminal.
// ─────────────────────────────────────────────────────────────────────────
exports.scheduledA2PStatusPoll = onSchedule(
  {
    schedule: "every 6 hours",
    region: "us-central1",
    timeoutSeconds: 540,
    secrets: [TWILIO_MASTER_ACCOUNT_SID, TWILIO_MASTER_AUTH_TOKEN],
  },
  async () => {
    const db = getFirestore();
    // Collection-group on `private` then filter for twilio-a2p docs in
    // non-terminal state. Cheaper than scanning all tenants.
    const a2pSnaps = await db
      .collectionGroup("private")
      .where("brandSid", "!=", null)
      .get();

    let count = 0;
    for (const docSnap of a2pSnaps.docs) {
      if (docSnap.id !== "twilio-a2p") continue;
      const data = docSnap.data() || {};
      const brandTerminal =
        data.brandStatus === "APPROVED" ||
        data.brandStatus === "VERIFIED" ||
        data.brandStatus === "FAILED";
      const campaignTerminal =
        data.campaignStatus === "VERIFIED" ||
        data.campaignStatus === "APPROVED" ||
        data.campaignStatus === "FAILED";
      if (brandTerminal && (!data.campaignSid || campaignTerminal)) continue;

      const tenantID = docSnap.ref.parent.parent.id;
      try {
        await pollTenantA2P(db, tenantID, data);
        count++;
      } catch (err) {
        logger.error("scheduledA2PStatusPoll: poll failed for tenant", {
          tenantID,
          error: err && err.message,
        });
      }
    }
    logger.info("scheduledA2PStatusPoll: complete", { tenantsPolled: count });
  }
);

async function pollTenantA2P(db, tenantID, prev) {
  const client = masterTwilioClient();
  const updates = {};

  if (prev.brandSid) {
    try {
      const brand = await client.messaging.v1
        .brandRegistrations(prev.brandSid)
        .fetch();
      if (brand.status !== prev.brandStatus) {
        updates.brandStatus = brand.status;
        updates.brandFailureReason = brand.failureReason || null;
        updates.brandLastPolledAt = FieldValue.serverTimestamp();
      }
    } catch (err) {
      logger.warn("pollTenantA2P: brand fetch failed", {
        tenantID,
        brandSid: prev.brandSid,
        error: err && err.message,
      });
    }
  }

  if (prev.campaignSid && prev.messagingServiceSid) {
    try {
      const campaign = await client.messaging.v1
        .services(prev.messagingServiceSid)
        .usAppToPerson(prev.campaignSid)
        .fetch();
      if (campaign.campaignStatus !== prev.campaignStatus) {
        updates.campaignStatus = campaign.campaignStatus;
        updates.campaignLastPolledAt = FieldValue.serverTimestamp();
      }
    } catch (err) {
      logger.warn("pollTenantA2P: campaign fetch failed", {
        tenantID,
        campaignSid: prev.campaignSid,
        error: err && err.message,
      });
    }
  }

  if (Object.keys(updates).length === 0) return;

  await tenantA2PDocRef(db, tenantID).set(updates, { merge: true });

  if (updates.brandStatus || updates.campaignStatus) {
    await writeAuditEvent(db, tenantID, {
      type: "a2p-status-advanced",
      brandStatus: updates.brandStatus || prev.brandStatus,
      campaignStatus: updates.campaignStatus || prev.campaignStatus,
    });
  }
}
