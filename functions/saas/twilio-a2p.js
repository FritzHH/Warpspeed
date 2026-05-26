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

  const {
    tenantID,
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
  } = request.data || {};

  if (!tenantID) {
    throw new HttpsError("invalid-argument", "tenantID is required.");
  }
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

  // A2P registration ties to tenant identity (EIN, legal name, rep). Admin+
  // is the right gate — tenant owner / compliance lead. Not "User" level.
  await requireTenantMemberWithLevel(tenantID, request, 4);

  logger.info("submitTenantA2PBrand: starting", { tenantID, uid: auth.uid });

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
    logger.info("submitTenantA2PBrand: brand already submitted", {
      tenantID,
      brandSid: existing.data().brandSid,
    });
    return {
      alreadySubmitted: true,
      brandSid: existing.data().brandSid,
      brandStatus: existing.data().brandStatus,
    };
  }

  const client = masterTwilioClient();

  // ─── 1. End User (authorized representative) ───
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

  // ─── 2. End User (business info) ───
  const businessEndUser = await client.trusthub.v1.endUsers.create({
    type: "customer_profile_business_information",
    friendlyName: `${tenantID}-business-info`,
    attributes: {
      business_name: businessLegalName,
      business_registration_number: businessRegistrationID || businessEIN,
      business_registration_identifier: "EIN",
      business_identity:
        businessEntityType === "Limited Liability Corporation" ||
        businessEntityType === "Corporation"
          ? "direct_customer"
          : "direct_customer",
      business_industry: businessVertical,
      business_type: businessEntityType,
      website_url: businessWebsite,
      ...(stockSymbol ? { stock_ticker: stockSymbol } : {}),
      ...(stockExchange ? { stock_exchange: stockExchange } : {}),
    },
  });

  // ─── 3. Customer Profile ───
  // Twilio policy SID for secondary CP (per their docs, this is stable).
  const SECONDARY_CP_POLICY = "RNdfbf3fae0e1107f8aded0e7cead80bf5";
  const customerProfile = await client.trusthub.v1.customerProfiles.create({
    friendlyName: `${tenantID}-cp`,
    email: businessEmail,
    policySid: SECONDARY_CP_POLICY,
    statusCallback: null,
  });

  // Attach entities (business info + authorized rep) to the CP.
  await client.trusthub.v1
    .customerProfiles(customerProfile.sid)
    .customerProfilesEntityAssignments.create({ objectSid: businessEndUser.sid });
  await client.trusthub.v1
    .customerProfiles(customerProfile.sid)
    .customerProfilesEntityAssignments.create({ objectSid: repEndUser.sid });

  // Attach an address (Twilio Addresses resource).
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

  // Submit CP for review.
  await client.trusthub.v1
    .customerProfiles(customerProfile.sid)
    .update({ status: "pending-review" });

  // ─── 4. Trust Product (A2P Standard Brand bundle) ───
  // Twilio policy SID for A2P Standard Trust Product.
  const A2P_TRUST_POLICY = "RN670d5d2e282a6130ae063b234b6019c8";
  const trustProduct = await client.trusthub.v1.trustProducts.create({
    friendlyName: `${tenantID}-a2p-trust-product`,
    email: businessEmail,
    policySid: A2P_TRUST_POLICY,
  });

  // Attach CP as the entity to the trust product.
  await client.trusthub.v1
    .trustProducts(trustProduct.sid)
    .trustProductsEntityAssignments.create({ objectSid: customerProfile.sid });

  // The A2P trust product requires its own end-user with the brand-specific
  // attributes (use case, vertical, brand type).
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

  // Submit trust product for review.
  await client.trusthub.v1
    .trustProducts(trustProduct.sid)
    .update({ status: "pending-review" });

  // ─── 5. Brand Registration ───
  const brand = await client.messaging.v1.brandRegistrations.create({
    customerProfileBundleSid: customerProfile.sid,
    a2pProfileBundleSid: trustProduct.sid,
    brandType: "STANDARD",
    skipAutomaticSecVet: false,
  });

  // ─── 6. Persist all SIDs ───
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
      // Snapshot the submitted attributes for audit.
      submittedAt: FieldValue.serverTimestamp(),
      submittedByUID: auth.uid,
      businessLegalName,
      businessEIN,
      businessVertical,
      businessEmail,
    },
    { merge: true }
  );

  // Also mirror SIDs onto the subaccount doc for quick reference.
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
    actorUID: auth.uid,
  });

  logger.info("submitTenantA2PBrand: submitted", {
    tenantID,
    brandSid: brand.sid,
    customerProfileSid: customerProfile.sid,
    trustProductSid: trustProduct.sid,
  });

  return {
    brandSid: brand.sid,
    brandStatus: brand.status || "PENDING",
    customerProfileSid: customerProfile.sid,
    trustProductSid: trustProduct.sid,
  };
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

  const {
    tenantID,
    useCase,
    description,
    messageSamples,
    messageFlow,
    optInKeywords,
    optOutKeywords,
    helpKeywords,
    optInMessage,
    optOutMessage,
    helpMessage,
  } = request.data || {};

  if (
    !tenantID ||
    !useCase ||
    !description ||
    !messageSamples ||
    messageSamples.length < 2 ||
    !messageFlow
  ) {
    throw new HttpsError(
      "invalid-argument",
      "tenantID, useCase, description, messageFlow, and 2+ messageSamples are required."
    );
  }

  await requireTenantMemberWithLevel(tenantID, request, 4);

  logger.info("submitTenantA2PCampaign: starting", { tenantID, uid: auth.uid });

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
  const brandSid = request.data.brandSid || a2pData.brandSid;
  if (!brandSid) {
    throw new HttpsError("failed-precondition", "No brandSid available.");
  }
  if (a2pData.brandStatus !== "APPROVED" && a2pData.brandStatus !== "VERIFIED") {
    // Twilio rejects campaign submission if brand isn't approved. We let the
    // call through but warn — useful for sandbox testing where brands
    // auto-approve.
    logger.warn("submitTenantA2PCampaign: brand not approved yet", {
      tenantID,
      brandSid,
      brandStatus: a2pData.brandStatus,
    });
  }

  if (a2pData.campaignSid) {
    logger.info("submitTenantA2PCampaign: campaign already submitted", {
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

  // ─── 1. Messaging Service ───
  const messagingService = await client.messaging.v1.services.create({
    friendlyName: `${tenantID}-messaging`,
    usecase: useCase.toLowerCase().replace(/_/g, " "),
    useInboundWebhookOnNumber: true,
  });

  // ─── 2. US App To Person Campaign ───
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
      optOutKeywords: optOutKeywords || ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"],
      helpKeywords: helpKeywords || ["HELP", "INFO"],
      optInMessage: optInMessage || "You are opted in. Reply STOP to opt out.",
      optOutMessage: optOutMessage || "You are opted out. No further messages.",
      helpMessage: helpMessage || "Reply STOP to opt out. Msg & data rates may apply.",
    });

  // ─── 3. Persist ───
  await a2pRef.set(
    {
      messagingServiceSid: messagingService.sid,
      campaignSid: campaign.sid,
      campaignStatus: campaign.campaignStatus || "PENDING",
      campaignUseCase: useCase,
      campaignSubmittedAt: FieldValue.serverTimestamp(),
      campaignSubmittedByUID: auth.uid,
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
    actorUID: auth.uid,
  });

  logger.info("submitTenantA2PCampaign: submitted", {
    tenantID,
    messagingServiceSid: messagingService.sid,
    campaignSid: campaign.sid,
  });

  return {
    messagingServiceSid: messagingService.sid,
    campaignSid: campaign.sid,
    campaignStatus: campaign.campaignStatus || "PENDING",
  };
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

  const client = masterTwilioClient();

  await client.messaging.v1
    .services(messagingServiceSid)
    .phoneNumbers.create({ phoneNumberSid });

  await writeAuditEvent(db, tenantID, {
    type: "a2p-number-linked",
    messagingServiceSid,
    phoneNumberSid,
    actorUID: auth.uid,
  });

  logger.info("linkNumberToA2PCampaign: linked", {
    tenantID,
    messagingServiceSid,
    phoneNumberSid,
  });

  return { messagingServiceSid, phoneNumberSid, linked: true };
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

  // Read-only — any tenant member can view A2P status.
  await requireTenantMember(tenantID, request);

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
    logger.warn("getTenantA2PStatus: live refresh failed (returning cached)", {
      tenantID,
      error: err && err.message,
    });
  }

  return result;
});

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
