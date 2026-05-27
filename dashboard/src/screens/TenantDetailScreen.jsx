import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

const getTenantCallable = httpsCallable(functions, "getTenantCallable");
const provisionTwilioCallable = httpsCallable(
  functions,
  "platformAdminProvisionTwilioSubaccount"
);
const deactivateTwilioCallable = httpsCallable(
  functions,
  "platformAdminDeactivateTwilioSubaccount"
);
const reactivateTwilioCallable = httpsCallable(
  functions,
  "platformAdminReactivateTwilioSubaccount"
);
const closeTwilioCallable = httpsCallable(
  functions,
  "platformAdminCloseTwilioSubaccount"
);
const searchNumbersCallable = httpsCallable(
  functions,
  "platformAdminSearchTwilioAvailableNumbers"
);
const purchaseNumberCallable = httpsCallable(
  functions,
  "platformAdminPurchaseTwilioNumber"
);
const submitA2PBrandCallable = httpsCallable(
  functions,
  "platformAdminSubmitTenantA2PBrand"
);
const submitA2PCampaignCallable = httpsCallable(
  functions,
  "platformAdminSubmitTenantA2PCampaign"
);
const linkAllA2PNumbersCallable = httpsCallable(
  functions,
  "platformAdminLinkAllNumbersToA2PCampaign"
);
const getA2PStatusCallable = httpsCallable(
  functions,
  "platformAdminGetTenantA2PStatus"
);
const configureWebhooksCallable = httpsCallable(
  functions,
  "platformAdminConfigureTenantWebhooks"
);
const createConnectAccountCallable = httpsCallable(
  functions,
  "platformAdminStripeConnectAccountCreate"
);
const createConnectLinkCallable = httpsCallable(
  functions,
  "platformAdminStripeConnectAccountLinkCreate"
);
const refreshConnectStatusCallable = httpsCallable(
  functions,
  "platformAdminStripeConnectAccountStatus"
);
const getEmailStatusCallable = httpsCallable(
  functions,
  "platformAdminGetTenantEmailStatus"
);
const reconnectEmailWatchCallable = httpsCallable(
  functions,
  "platformAdminReconnectEmailWatch"
);
const forceEmailSyncCallable = httpsCallable(
  functions,
  "platformAdminForceEmailSync"
);

const ENTITY_TYPES = [
  "Sole Proprietorship",
  "Partnership",
  "Corporation",
  "Limited Liability Corporation",
  "Co-operative",
  "Non-profit Corporation",
];

// Twilio's accepted business verticals (subset of the full TCR list — common ones).
const VERTICALS = [
  "AGRICULTURE",
  "AUTOMOTIVE",
  "BANKING",
  "CONSTRUCTION",
  "CONSUMER",
  "EDUCATION",
  "ENERGY",
  "ENGINEERING",
  "FAST_MOVING_CONSUMER_GOODS",
  "FINANCIAL",
  "GOVERNMENT",
  "HEALTHCARE",
  "HOSPITALITY",
  "INSURANCE",
  "JEWELRY",
  "LEGAL",
  "MANUFACTURING",
  "MEDIA",
  "NOT_FOR_PROFIT",
  "OIL_AND_GAS",
  "ONLINE",
  "POLITICAL",
  "PROFESSIONAL_SERVICES",
  "RAW_MATERIALS",
  "REAL_ESTATE",
  "RELIGION",
  "RETAIL",
  "TECHNOLOGY",
  "TELECOMMUNICATIONS",
  "TRANSPORTATION",
  "TRAVEL",
];

// Force EIN to xx-xxxxxxx as the user types — pad/trim digits and inject the dash.
function formatEIN(raw) {
  const digits = (raw || "").replace(/\D/g, "").slice(0, 9);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

const EIN_RE = /^\d{2}-\d{7}$/;

const A2P_BRAND_INIT = {
  businessLegalName: "",
  businessEIN: "",
  businessEntityType: "Limited Liability Corporation",
  businessVertical: "RETAIL",
  street: "",
  city: "",
  region: "",
  postalCode: "",
  country: "US",
  businessWebsite: "",
  businessEmail: "",
  businessPhone: "",
  stockSymbol: "",
  stockExchange: "",
  repFirstName: "",
  repLastName: "",
  repEmail: "",
  repPhone: "",
  repJobTitle: "",
  repJobPosition: "CEO",
};

const A2P_REP_POSITIONS = [
  "Director",
  "GM",
  "VP",
  "CEO",
  "CFO",
  "General Counsel",
  "Other",
];

const A2P_CAMPAIGN_INIT = {
  useCase: "CUSTOMER_CARE",
  description:
    "Transactional and customer-care messages from a local retail business to its customers (appointment reminders, order/repair status updates, replies to inbound questions). Recipients opt in at point of sale or via the business website.",
  messageFlow:
    "Customers opt in either in-store at point of sale (verbal consent captured in our POS) or by submitting a contact form on the business website that includes an SMS-consent checkbox. Opt-out via STOP keyword.",
  sample1:
    "Hi Sarah, your bike is ready for pickup at Bonita Bikes. We're open until 6pm today. Reply STOP to opt out.",
  sample2:
    "Reminder: your tune-up appointment is tomorrow at 10am. Reply C to confirm or R to reschedule. STOP to opt out.",
  sample3:
    "Your repair estimate is $85 (parts $45, labor $40). Reply Y to approve. STOP to opt out.",
};

const REASON_MAX = 200;

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

function formatE164ForDisplay(e164) {
  const m = (e164 || "").match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  if (!m) return e164 || "";
  return `(${m[1]}) ${m[2]}-${m[3]}`;
}

function formatDate(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function twilioStatusTone(status) {
  if (status === "active") return "accent";
  if (status === "suspended") return "warn";
  if (status === "closed") return "danger";
  return "info";
}

function a2pTone(status) {
  if (status === "APPROVED" || status === "VERIFIED") return "accent";
  if (status === "FAILED" || status === "REJECTED") return "danger";
  if (!status) return "info";
  return "info";
}

function boolTone(v) {
  return v ? "accent" : "info";
}

function truncateAcctID(id) {
  if (!id) return "—";
  if (id.length <= 16) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function formatExpiresAt(epochSeconds) {
  if (!epochSeconds) return "";
  const d = new Date(epochSeconds * 1000);
  return d.toLocaleString();
}

function formatEpochMs(ms) {
  if (!ms) return "never";
  return new Date(Number(ms)).toLocaleString();
}

// Coarse "X minutes/hours/days ago" — good enough for ops diagnostics; the
// dashboard never needs second-precision relative times.
function relativeTime(ms) {
  if (!ms) return "never";
  const delta = Date.now() - Number(ms);
  if (delta < 0) {
    // Future timestamp (watchExpiration) — invert sign of the result.
    const inFuture = -delta;
    if (inFuture < 60 * 1000) return "in <1m";
    if (inFuture < 60 * 60 * 1000) return `in ${Math.round(inFuture / 60000)}m`;
    if (inFuture < 24 * 60 * 60 * 1000)
      return `in ${Math.round(inFuture / (60 * 60 * 1000))}h`;
    return `in ${Math.round(inFuture / (24 * 60 * 60 * 1000))}d`;
  }
  if (delta < 60 * 1000) return "<1m ago";
  if (delta < 60 * 60 * 1000) return `${Math.round(delta / 60000)}m ago`;
  if (delta < 24 * 60 * 60 * 1000)
    return `${Math.round(delta / (60 * 60 * 1000))}h ago`;
  return `${Math.round(delta / (24 * 60 * 60 * 1000))}d ago`;
}

const EMAIL_STATUS_LABELS = {
  ok: { label: "Healthy", tone: "accent" },
  watchStale: { label: "Watch stale", tone: "warn" },
  watchExpired: { label: "Watch expired", tone: "danger" },
  error: { label: "Error", tone: "danger" },
  disconnected: { label: "Disconnected", tone: "danger" },
  neverConnected: { label: "Never connected", tone: "info" },
};

export function TenantDetailScreen() {
  const { tenantID } = useParams();
  const [tenant, setTenant] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [provisioning, setProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState("");
  // Lifecycle = deactivate / reactivate / close. One action open at a time;
  // switching action resets reason + error so the form starts clean.
  const [lifecycleAction, setLifecycleAction] = useState(null);
  const [lifecycleReason, setLifecycleReason] = useState("");
  const [lifecycleError, setLifecycleError] = useState("");
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  // Number search/buy state. Scoped by activeStoreID so only one store has its
  // search form open at a time — keeps the screen scannable when a tenant has
  // many stores.
  const [activeStoreID, setActiveStoreID] = useState(null);
  const [searchForm, setSearchForm] = useState({
    state: "",
    locality: "",
    areaCode: "",
    contains: "",
  });
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [purchaseBusyNumber, setPurchaseBusyNumber] = useState("");
  const [purchaseError, setPurchaseError] = useState("");

  // A2P state. `a2pStatus` is the live read from getTenantA2PStatus (refreshed
  // on demand). `brandForm` / `campaignForm` are local edit state shown when
  // the corresponding stage isn't submitted yet.
  const [a2pStatus, setA2pStatus] = useState(null);
  const [a2pStatusBusy, setA2pStatusBusy] = useState(false);
  const [a2pStatusError, setA2pStatusError] = useState("");
  const [brandForm, setBrandForm] = useState(A2P_BRAND_INIT);
  const [brandBusy, setBrandBusy] = useState(false);
  const [brandError, setBrandError] = useState("");
  const [campaignForm, setCampaignForm] = useState(A2P_CAMPAIGN_INIT);
  const [campaignBusy, setCampaignBusy] = useState(false);
  const [campaignError, setCampaignError] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [linkResult, setLinkResult] = useState(null);
  const [showLinkFailures, setShowLinkFailures] = useState(false);

  // Webhook reconfig state. Drift comes from the per-store `webhooksDriftedCount`
  // sum (computed server-side). The bulk-only flow mirrors the A2P link pattern.
  const [webhooksBusy, setWebhooksBusy] = useState(false);
  const [webhooksError, setWebhooksError] = useState("");
  const [webhooksResult, setWebhooksResult] = useState(null);
  const [showWebhooksFailures, setShowWebhooksFailures] = useState(false);

  // Stripe Connect state. One in-flight bool covers all three actions —
  // they're mutually exclusive (create→link→refresh chain).
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [connectLink, setConnectLink] = useState(null);
  const [showRequirements, setShowRequirements] = useState(false);
  const [connectLinkCopied, setConnectLinkCopied] = useState(false);

  // Email state. emailAccounts is the deep status roster from
  // platformAdminGetTenantEmailStatus (richer than tenant.email.accounts
  // from getTenantCallable). Per-account busy flags keyed by accountKey so
  // a slow reconnect doesn't block other rows.
  const [emailAccounts, setEmailAccounts] = useState(null);
  const [emailStatusBusy, setEmailStatusBusy] = useState(false);
  const [emailStatusError, setEmailStatusError] = useState("");
  const [emailRowBusy, setEmailRowBusy] = useState({});
  const [emailRowResult, setEmailRowResult] = useState({});

  const fetchID = useRef(0);

  const loadTenant = useCallback(() => {
    const reqID = ++fetchID.current;
    setLoading(true);
    setLoadError("");
    return getTenantCallable({ tenantID })
      .then((res) => {
        if (reqID !== fetchID.current) return;
        setTenant(res.data?.tenant || null);
        setLoading(false);
      })
      .catch((err) => {
        if (reqID !== fetchID.current) return;
        const code = err?.code || "";
        const msg = err?.message || "Failed to load tenant.";
        setLoadError(code ? `${code}: ${msg}` : msg);
        setLoading(false);
      });
  }, [tenantID]);

  useEffect(() => {
    loadTenant();
    refreshA2PStatus();
    loadEmailStatus();
  }, [loadTenant, refreshA2PStatus, loadEmailStatus]);

  const openLifecycle = (action) => {
    setLifecycleAction(action);
    setLifecycleReason("");
    setLifecycleError("");
  };

  const cancelLifecycle = () => {
    if (lifecycleBusy) return;
    setLifecycleAction(null);
    setLifecycleReason("");
    setLifecycleError("");
  };

  const onProvisionTwilio = async () => {
    setProvisioning(true);
    setProvisionError("");
    try {
      await provisionTwilioCallable({ tenantID });
      await loadTenant();
    } catch (err) {
      const code = err?.code || "";
      const msg = err?.message || "Provisioning failed.";
      setProvisionError(code ? `${code}: ${msg}` : msg);
    } finally {
      setProvisioning(false);
    }
  };

  const openSearch = (storeID) => {
    setActiveStoreID(storeID);
    setSearchForm({ state: "", locality: "", areaCode: "", contains: "" });
    setSearchResults([]);
    setSearchError("");
    setPurchaseError("");
  };

  const closeSearch = () => {
    if (searchBusy || purchaseBusyNumber) return;
    setActiveStoreID(null);
    setSearchResults([]);
    setSearchError("");
    setPurchaseError("");
  };

  const updateSearchForm = (patch) =>
    setSearchForm((prev) => ({ ...prev, ...patch }));

  const runSearch = async () => {
    setSearchBusy(true);
    setSearchError("");
    setPurchaseError("");
    setSearchResults([]);
    try {
      const payload = { tenantID };
      const { state, locality, areaCode, contains } = searchForm;
      if (state) payload.state = state;
      if (locality.trim()) payload.locality = locality.trim();
      if (areaCode.trim()) payload.areaCode = areaCode.trim();
      if (contains.trim()) payload.contains = contains.trim();
      if (!payload.state && !payload.locality && !payload.areaCode && !payload.contains) {
        setSearchError("Provide at least one filter: state, city, area code, or pattern.");
        return;
      }
      const res = await searchNumbersCallable(payload);
      setSearchResults(res.data?.candidates || []);
    } catch (err) {
      const code = err?.code || "";
      const msg = err?.message || "Search failed.";
      setSearchError(code ? `${code}: ${msg}` : msg);
    } finally {
      setSearchBusy(false);
    }
  };

  const buyNumber = async (phoneNumber) => {
    if (!activeStoreID) return;
    setPurchaseBusyNumber(phoneNumber);
    setPurchaseError("");
    try {
      await purchaseNumberCallable({
        tenantID,
        storeID: activeStoreID,
        phoneNumber,
      });
      await loadTenant();
      setActiveStoreID(null);
      setSearchResults([]);
    } catch (err) {
      const code = err?.code || "";
      const msg = err?.message || "Purchase failed.";
      setPurchaseError(code ? `${code}: ${msg}` : msg);
    } finally {
      setPurchaseBusyNumber("");
    }
  };

  const refreshA2PStatus = useCallback(async () => {
    setA2pStatusBusy(true);
    setA2pStatusError("");
    try {
      const res = await getA2PStatusCallable({ tenantID });
      setA2pStatus(res.data || null);
    } catch (err) {
      const code = err?.code || "";
      const msg = err?.message || "Failed to load A2P status.";
      setA2pStatusError(code ? `${code}: ${msg}` : msg);
    } finally {
      setA2pStatusBusy(false);
    }
  }, [tenantID]);

  const submitBrand = async () => {
    if (!EIN_RE.test(brandForm.businessEIN)) {
      setBrandError("EIN must be in xx-xxxxxxx format.");
      return;
    }
    setBrandBusy(true);
    setBrandError("");
    try {
      const payload = {
        tenantID,
        businessLegalName: brandForm.businessLegalName.trim(),
        businessEIN: brandForm.businessEIN.trim(),
        businessRegistrationID: brandForm.businessEIN.trim(),
        businessEntityType: brandForm.businessEntityType,
        businessVertical: brandForm.businessVertical,
        businessAddress: {
          street: brandForm.street.trim(),
          city: brandForm.city.trim(),
          region: brandForm.region.trim(),
          postalCode: brandForm.postalCode.trim(),
          country: brandForm.country.trim() || "US",
        },
        businessWebsite: brandForm.businessWebsite.trim(),
        businessEmail: brandForm.businessEmail.trim(),
        businessPhone: brandForm.businessPhone.trim() || undefined,
        stockSymbol: brandForm.stockSymbol.trim() || undefined,
        stockExchange: brandForm.stockExchange.trim() || undefined,
        authorizedRep: {
          firstName: brandForm.repFirstName.trim(),
          lastName: brandForm.repLastName.trim(),
          email: brandForm.repEmail.trim(),
          phone: brandForm.repPhone.trim(),
          jobTitle: brandForm.repJobTitle.trim(),
          jobPosition: brandForm.repJobPosition,
        },
      };
      await submitA2PBrandCallable(payload);
      await refreshA2PStatus();
      await loadTenant();
    } catch (err) {
      const code = err?.code || "";
      const msg = err?.message || "Brand submission failed.";
      setBrandError(code ? `${code}: ${msg}` : msg);
    } finally {
      setBrandBusy(false);
    }
  };

  const submitCampaign = async () => {
    setCampaignBusy(true);
    setCampaignError("");
    try {
      const samples = [
        campaignForm.sample1.trim(),
        campaignForm.sample2.trim(),
        campaignForm.sample3.trim(),
      ].filter(Boolean);
      if (samples.length < 2) {
        setCampaignError("Provide at least two sample messages.");
        setCampaignBusy(false);
        return;
      }
      await submitA2PCampaignCallable({
        tenantID,
        useCase: campaignForm.useCase,
        description: campaignForm.description.trim(),
        messageFlow: campaignForm.messageFlow.trim(),
        messageSamples: samples,
      });
      await refreshA2PStatus();
      await loadTenant();
    } catch (err) {
      const code = err?.code || "";
      const msg = err?.message || "Campaign submission failed.";
      setCampaignError(code ? `${code}: ${msg}` : msg);
    } finally {
      setCampaignBusy(false);
    }
  };

  const linkAllNumbers = async () => {
    setLinkBusy(true);
    setLinkError("");
    setLinkResult(null);
    setShowLinkFailures(false);
    try {
      const res = await linkAllA2PNumbersCallable({ tenantID });
      setLinkResult(res.data || null);
    } catch (err) {
      const code = err?.code || "";
      const msg = err?.message || "Bulk link failed.";
      setLinkError(code ? `${code}: ${msg}` : msg);
    } finally {
      setLinkBusy(false);
    }
  };

  const configureAllWebhooks = async () => {
    setWebhooksBusy(true);
    setWebhooksError("");
    setWebhooksResult(null);
    setShowWebhooksFailures(false);
    try {
      const res = await configureWebhooksCallable({ tenantID });
      setWebhooksResult(res.data || null);
      await loadTenant();
    } catch (err) {
      const code = err?.code || "";
      const msg = err?.message || "Webhook reconfig failed.";
      setWebhooksError(code ? `${code}: ${msg}` : msg);
    } finally {
      setWebhooksBusy(false);
    }
  };

  const createConnectAccount = async () => {
    setConnectBusy(true);
    setConnectError("");
    setConnectLink(null);
    try {
      await createConnectAccountCallable({ tenantID });
      await loadTenant();
    } catch (err) {
      const code = err?.code || "";
      const msg = err?.message || "Connect account create failed.";
      setConnectError(code ? `${code}: ${msg}` : msg);
    } finally {
      setConnectBusy(false);
    }
  };

  const generateConnectLink = async () => {
    setConnectBusy(true);
    setConnectError("");
    setConnectLinkCopied(false);
    try {
      const res = await createConnectLinkCallable({ tenantID });
      setConnectLink(res.data || null);
    } catch (err) {
      const code = err?.code || "";
      const msg = err?.message || "Onboarding link create failed.";
      setConnectError(code ? `${code}: ${msg}` : msg);
    } finally {
      setConnectBusy(false);
    }
  };

  const refreshConnectStatus = async () => {
    setConnectBusy(true);
    setConnectError("");
    try {
      await refreshConnectStatusCallable({ tenantID });
      await loadTenant();
    } catch (err) {
      const code = err?.code || "";
      const msg = err?.message || "Status refresh failed.";
      setConnectError(code ? `${code}: ${msg}` : msg);
    } finally {
      setConnectBusy(false);
    }
  };

  const copyConnectLink = async () => {
    if (!connectLink?.url) return;
    try {
      await navigator.clipboard.writeText(connectLink.url);
      setConnectLinkCopied(true);
    } catch {
      // clipboard API blocked — leave the URL visible for manual copy
    }
  };

  const loadEmailStatus = useCallback(async () => {
    setEmailStatusBusy(true);
    setEmailStatusError("");
    try {
      const res = await getEmailStatusCallable({ tenantID });
      setEmailAccounts(res.data?.accounts || []);
    } catch (err) {
      const code = err?.code || "";
      const msg = err?.message || "Failed to load email status.";
      setEmailStatusError(code ? `${code}: ${msg}` : msg);
    } finally {
      setEmailStatusBusy(false);
    }
  }, [tenantID]);

  const reconnectEmailWatch = async (accountKey) => {
    setEmailRowBusy((b) => ({ ...b, [accountKey]: "reconnect" }));
    setEmailRowResult((r) => ({ ...r, [accountKey]: null }));
    try {
      const res = await reconnectEmailWatchCallable({ tenantID, accountKey });
      setEmailRowResult((r) => ({
        ...r,
        [accountKey]: {
          kind: "reconnect",
          watchExpiration: res.data?.watchExpiration || 0,
        },
      }));
      await loadEmailStatus();
    } catch (err) {
      const code = err?.code || "";
      const msg = err?.message || "Reconnect failed.";
      setEmailRowResult((r) => ({
        ...r,
        [accountKey]: { kind: "error", error: code ? `${code}: ${msg}` : msg },
      }));
    } finally {
      setEmailRowBusy((b) => ({ ...b, [accountKey]: null }));
    }
  };

  const forceEmailSync = async (accountKey) => {
    setEmailRowBusy((b) => ({ ...b, [accountKey]: "sync" }));
    setEmailRowResult((r) => ({ ...r, [accountKey]: null }));
    try {
      const res = await forceEmailSyncCallable({ tenantID, accountKey });
      setEmailRowResult((r) => ({
        ...r,
        [accountKey]: { kind: "sync", synced: res.data?.synced || 0 },
      }));
      await loadEmailStatus();
    } catch (err) {
      const code = err?.code || "";
      const msg = err?.message || "Sync failed.";
      setEmailRowResult((r) => ({
        ...r,
        [accountKey]: { kind: "error", error: code ? `${code}: ${msg}` : msg },
      }));
    } finally {
      setEmailRowBusy((b) => ({ ...b, [accountKey]: null }));
    }
  };

  const runLifecycle = async () => {
    setLifecycleBusy(true);
    setLifecycleError("");
    try {
      if (lifecycleAction === "deactivate") {
        const reason = lifecycleReason.trim().slice(0, REASON_MAX);
        await deactivateTwilioCallable({
          tenantID,
          reason: reason || undefined,
        });
      } else if (lifecycleAction === "reactivate") {
        await reactivateTwilioCallable({ tenantID });
      } else if (lifecycleAction === "close") {
        await closeTwilioCallable({ tenantID });
      } else {
        return;
      }
      await loadTenant();
      setLifecycleAction(null);
      setLifecycleReason("");
      setLifecycleError("");
    } catch (err) {
      const code = err?.code || "";
      const msg = err?.message || "Action failed.";
      setLifecycleError(code ? `${code}: ${msg}` : msg);
    } finally {
      setLifecycleBusy(false);
    }
  };

  if (loading && !tenant) {
    return (
      <div className="centerScreen">
        <div className="card cardWide">
          <Link to="/" className="linkButton">
            ← Back to tenants
          </Link>
          <p className="placeholderText">Loading tenant…</p>
        </div>
      </div>
    );
  }

  if (loadError && !tenant) {
    return (
      <div className="centerScreen">
        <div className="card cardWide">
          <Link to="/" className="linkButton">
            ← Back to tenants
          </Link>
          <h1 className="cardTitle">{tenantID}</h1>
          <div className="errorText">{loadError}</div>
        </div>
      </div>
    );
  }

  const tw = tenant?.twilio || {};
  const ownerName = [tenant?.ownerFirstName, tenant?.ownerLastName]
    .filter(Boolean)
    .join(" ");
  const webhookDriftCount = (tenant?.stores || []).reduce(
    (sum, s) => sum + (s.webhooksDriftedCount || 0),
    0
  );
  const totalNumberCount = (tenant?.stores || []).reduce(
    (sum, s) => sum + (s.numberCount || 0),
    0
  );

  const confirmLabel =
    lifecycleAction === "deactivate"
      ? lifecycleBusy
        ? "Deactivating…"
        : "Confirm deactivate"
      : lifecycleAction === "reactivate"
      ? lifecycleBusy
        ? "Reactivating…"
        : "Confirm reactivate"
      : lifecycleAction === "close"
      ? lifecycleBusy
        ? "Closing…"
        : "Confirm close"
      : "";

  const confirmTone =
    lifecycleAction === "reactivate" ? "primaryButton" : "dangerButton";

  return (
    <div className="pageScreen">
      <div className="card cardWide">
        <Link to="/" className="linkButton">
          ← Back to tenants
        </Link>

        <h1 className="cardTitle">{tenant?.name || tenantID}</h1>
        <p className="cardSubtitle">
          <span className="tenantRowID">{tenantID}</span>
        </p>

        <div className="detailGrid">
          <div className="resultRow">
            <span className="resultLabel">Owner</span>
            <span className="resultValue">
              {ownerName || "—"}
              {tenant?.ownerEmail ? ` · ${tenant.ownerEmail}` : ""}
            </span>
          </div>
          {tenant?.ownerPhone && (
            <div className="resultRow">
              <span className="resultLabel">Phone</span>
              <span className="resultValue">{tenant.ownerPhone}</span>
            </div>
          )}
          <div className="resultRow">
            <span className="resultLabel">Created</span>
            <span className="resultValue">{formatDate(tenant?.createdAt)}</span>
          </div>
          <div className="resultRow">
            <span className="resultLabel">Stores</span>
            <span className="resultValue">{tenant?.storeCount ?? 0}</span>
          </div>
        </div>

        <div className="sectionTitle">Stores</div>
        <div className="buttonRow">
          <Link
            to={`/tenants/${tenantID}/stores/new`}
            className="secondaryButton"
          >
            + Add store
          </Link>
        </div>

        <div className="sectionTitle">Twilio</div>

        {!tw.hasSubaccount && (
          <>
            <p className="placeholderText">
              No Twilio subaccount yet. Provisioning creates a subaccount
              under the RSS master and stores its auth token in Secret
              Manager. Numbers, A2P brand/campaign, and webhooks land in
              later steps.
            </p>
            <button
              type="button"
              className="primaryButton"
              onClick={onProvisionTwilio}
              disabled={provisioning}
            >
              {provisioning
                ? "Provisioning…"
                : "Provision Twilio subaccount"}
            </button>
            {provisionError && (
              <div className="errorText">{provisionError}</div>
            )}
          </>
        )}

        {tw.hasSubaccount && (
          <>
            <div className="resultRow">
              <span className="resultLabel">Subaccount status</span>
              <span className={`badge badge-${twilioStatusTone(tw.subaccountStatus)}`}>
                {tw.subaccountStatus || "unknown"}
              </span>
            </div>
            <div className="resultRow">
              <span className="resultLabel">Subaccount SID</span>
              <span className="resultValue">{tw.subaccountSid || "—"}</span>
            </div>
            <div className="resultRow">
              <span className="resultLabel">A2P brand</span>
              <span className={`badge badge-${a2pTone(tw.a2pBrandStatus)}`}>
                {tw.a2pBrandStatus || "not started"}
              </span>
            </div>
            <div className="resultRow">
              <span className="resultLabel">A2P campaign</span>
              <span className={`badge badge-${a2pTone(tw.a2pCampaignStatus)}`}>
                {tw.a2pCampaignStatus || "not started"}
              </span>
            </div>

            {tw.subaccountStatus === "active" && (
              <div className="buttonRow">
                <button
                  type="button"
                  className="dangerButton"
                  onClick={() => openLifecycle("deactivate")}
                  disabled={lifecycleBusy}
                >
                  Deactivate subaccount
                </button>
              </div>
            )}

            {tw.subaccountStatus === "suspended" && (
              <div className="buttonRow">
                <button
                  type="button"
                  className="primaryButton"
                  onClick={() => openLifecycle("reactivate")}
                  disabled={lifecycleBusy}
                >
                  Reactivate subaccount
                </button>
                <button
                  type="button"
                  className="dangerButton"
                  onClick={() => openLifecycle("close")}
                  disabled={lifecycleBusy}
                >
                  Close subaccount
                </button>
              </div>
            )}

            {lifecycleAction === "deactivate" && (
              <div className="inlineConfirm">
                <p className="helperText">
                  Suspends sending. Numbers keep receiving inbound (TCPA
                  grace window, 30 days). You can reactivate during that
                  window.
                </p>
                <label className="fieldLabel">Reason (optional)</label>
                <textarea
                  className="textInput"
                  rows={2}
                  maxLength={REASON_MAX}
                  value={lifecycleReason}
                  onChange={(e) => setLifecycleReason(e.target.value)}
                  placeholder="e.g. non-payment, customer request"
                  disabled={lifecycleBusy}
                />
                <div className="buttonRow">
                  <button
                    type="button"
                    className="secondaryButton"
                    onClick={cancelLifecycle}
                    disabled={lifecycleBusy}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={confirmTone}
                    onClick={runLifecycle}
                    disabled={lifecycleBusy}
                  >
                    {confirmLabel}
                  </button>
                </div>
                {lifecycleError && (
                  <div className="errorText">{lifecycleError}</div>
                )}
              </div>
            )}

            {lifecycleAction === "reactivate" && (
              <div className="inlineConfirm">
                <p className="helperText">
                  Restores sending and switches numbers back to active
                  routing.
                </p>
                <div className="buttonRow">
                  <button
                    type="button"
                    className="secondaryButton"
                    onClick={cancelLifecycle}
                    disabled={lifecycleBusy}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={confirmTone}
                    onClick={runLifecycle}
                    disabled={lifecycleBusy}
                  >
                    {confirmLabel}
                  </button>
                </div>
                {lifecycleError && (
                  <div className="errorText">{lifecycleError}</div>
                )}
              </div>
            )}

            {lifecycleAction === "close" && (
              <div className="inlineConfirm">
                <div className="warnCallout">
                  <strong>Final closure.</strong> Releases all numbers
                  (must already be released — Twilio rejects close
                  otherwise). Auth token destroyed. Cannot be undone.
                </div>
                <div className="buttonRow">
                  <button
                    type="button"
                    className="secondaryButton"
                    onClick={cancelLifecycle}
                    disabled={lifecycleBusy}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={confirmTone}
                    onClick={runLifecycle}
                    disabled={lifecycleBusy}
                  >
                    {confirmLabel}
                  </button>
                </div>
                {lifecycleError && (
                  <div className="errorText">{lifecycleError}</div>
                )}
              </div>
            )}

            {tw.subaccountStatus === "active" && (
              <>
                <div className="sectionTitle">Stores &amp; numbers</div>
                {(tenant?.stores || []).length === 0 && (
                  <p className="placeholderText">No stores under this tenant.</p>
                )}
                {(tenant?.stores || []).map((store) => {
                  const isActive = activeStoreID === store.storeID;
                  return (
                    <div key={store.storeID} className="storeCard">
                      <div className="storeCardHeader">
                        <div className="storeCardHeaderMain">
                          <div className="storeCardName">
                            {store.name || store.storeID}
                          </div>
                          <div className="storeCardMeta">
                            <span className="tenantRowID">{store.storeID}</span>
                            {(store.city || store.state) && (
                              <>
                                <span className="tenantRowDot">·</span>
                                <span>
                                  {[store.city, store.state]
                                    .filter(Boolean)
                                    .join(", ")}
                                </span>
                              </>
                            )}
                            <span className="tenantRowDot">·</span>
                            <span>
                              {store.numberCount} number
                              {store.numberCount === 1 ? "" : "s"}
                            </span>
                          </div>
                        </div>
                        {!isActive && (
                          <button
                            type="button"
                            className="secondaryButton"
                            onClick={() => openSearch(store.storeID)}
                          >
                            + Add number
                          </button>
                        )}
                      </div>

                      {isActive && (
                        <div className="searchForm">
                          <div className="searchFormRow">
                            <div className="searchFormField">
                              <label className="fieldLabel">State</label>
                              <select
                                className="textInput"
                                value={searchForm.state}
                                onChange={(e) =>
                                  updateSearchForm({ state: e.target.value })
                                }
                                disabled={searchBusy}
                              >
                                <option value="">Any</option>
                                {US_STATES.map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="searchFormField searchFormFieldWide">
                              <label className="fieldLabel">City</label>
                              <input
                                type="text"
                                className="textInput"
                                placeholder="e.g. Bonita Springs"
                                value={searchForm.locality}
                                onChange={(e) =>
                                  updateSearchForm({ locality: e.target.value })
                                }
                                disabled={searchBusy}
                                maxLength={60}
                              />
                            </div>
                            <div className="searchFormField">
                              <label className="fieldLabel">Area code</label>
                              <input
                                type="text"
                                className="textInput"
                                placeholder="239"
                                value={searchForm.areaCode}
                                onChange={(e) =>
                                  updateSearchForm({
                                    areaCode: e.target.value
                                      .replace(/\D/g, "")
                                      .slice(0, 3),
                                  })
                                }
                                disabled={searchBusy}
                                inputMode="numeric"
                              />
                            </div>
                            <div className="searchFormField">
                              <label className="fieldLabel">Vanity</label>
                              <input
                                type="text"
                                className="textInput"
                                placeholder="e.g. BIKE"
                                value={searchForm.contains}
                                onChange={(e) =>
                                  updateSearchForm({
                                    contains: e.target.value.slice(0, 10),
                                  })
                                }
                                disabled={searchBusy}
                              />
                            </div>
                          </div>
                          <div className="buttonRow">
                            <button
                              type="button"
                              className="secondaryButton"
                              onClick={closeSearch}
                              disabled={searchBusy || !!purchaseBusyNumber}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="primaryButton"
                              onClick={runSearch}
                              disabled={searchBusy}
                            >
                              {searchBusy ? "Searching…" : "Search"}
                            </button>
                          </div>
                          {searchError && (
                            <div className="errorText">{searchError}</div>
                          )}

                          {searchResults.length > 0 && (
                            <div className="numberTable">
                              <div className="numberTableHeader">
                                <span className="numberTableNumber">Number</span>
                                <span className="numberTableCity">
                                  City / State
                                </span>
                                <span className="numberTableCaps">SMS</span>
                                <span className="numberTableAction" />
                              </div>
                              {searchResults.map((cand) => (
                                <div
                                  key={cand.phoneNumber}
                                  className="numberTableRow"
                                >
                                  <span className="numberTableNumber">
                                    {formatE164ForDisplay(cand.phoneNumber)}
                                  </span>
                                  <span className="numberTableCity">
                                    {cand.locality || "—"}
                                    {cand.region ? `, ${cand.region}` : ""}
                                  </span>
                                  <span className="numberTableCaps">
                                    <span
                                      className={`capPill ${
                                        cand.capabilities?.sms
                                          ? "capPillOn"
                                          : "capPillOff"
                                      }`}
                                    >
                                      SMS
                                    </span>
                                    <span
                                      className={`capPill ${
                                        cand.capabilities?.mms
                                          ? "capPillOn"
                                          : "capPillOff"
                                      }`}
                                    >
                                      MMS
                                    </span>
                                  </span>
                                  <span className="numberTableAction">
                                    <button
                                      type="button"
                                      className="primaryButton primaryButtonSmall"
                                      onClick={() => buyNumber(cand.phoneNumber)}
                                      disabled={
                                        !!purchaseBusyNumber ||
                                        !cand.capabilities?.sms
                                      }
                                    >
                                      {purchaseBusyNumber === cand.phoneNumber
                                        ? "Buying…"
                                        : "Buy"}
                                    </button>
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                          {purchaseError && (
                            <div className="errorText">{purchaseError}</div>
                          )}
                          {searchResults.length === 0 &&
                            !searchBusy &&
                            !searchError && (
                              <p className="helperText">
                                Run a search to see available numbers. City is
                                the caller-ID label (Bonita Springs vs Fort
                                Myers), so filter on it when it matters.
                              </p>
                            )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}

            <div className="sectionTitle">A2P 10DLC</div>
            <div className="warnCallout">
              <strong>Stage 1 limitation.</strong> These callables shape the
              Trust Hub workflow but cannot be exercised end-to-end until RSS
              LLC is registered and approved as an ISV by Twilio. Submissions
              will fail until then — that is expected.
            </div>
            <div className="resultRow">
              <span className="resultLabel">Brand</span>
              <span className={`badge badge-${a2pTone(a2pStatus?.brandStatus)}`}>
                {a2pStatus?.brandStatus || "not started"}
              </span>
            </div>
            <div className="resultRow">
              <span className="resultLabel">Campaign</span>
              <span
                className={`badge badge-${a2pTone(a2pStatus?.campaignStatus)}`}
              >
                {a2pStatus?.campaignStatus || "not started"}
              </span>
            </div>
            {a2pStatus?.brandFailureReason && (
              <div className="resultRow">
                <span className="resultLabel">Brand failure reason</span>
                <span className="resultValue">
                  {a2pStatus.brandFailureReason}
                </span>
              </div>
            )}
            <div className="buttonRow">
              <button
                type="button"
                className="secondaryButton"
                onClick={refreshA2PStatus}
                disabled={a2pStatusBusy}
              >
                {a2pStatusBusy ? "Refreshing…" : "Refresh status"}
              </button>
            </div>
            {a2pStatusError && (
              <div className="errorText">{a2pStatusError}</div>
            )}

            {/* Stage 1: Brand. Show form until brand is submitted. */}
            {!a2pStatus?.brandSid && (
              <div className="a2pStage">
                <p className="helperText">
                  Submit the brand registration. Creates a Customer Profile +
                  Trust Product + Brand under the RSS master account.
                </p>
                <div className="a2pFormRow">
                  <div className="a2pFormField">
                    <label className="fieldLabel">Legal business name</label>
                    <input
                      type="text"
                      className="textInput"
                      value={brandForm.businessLegalName}
                      onChange={(e) =>
                        setBrandForm((p) => ({
                          ...p,
                          businessLegalName: e.target.value,
                        }))
                      }
                      disabled={brandBusy}
                    />
                  </div>
                  <div className="a2pFormField">
                    <label className="fieldLabel">EIN (xx-xxxxxxx)</label>
                    <input
                      type="text"
                      className="textInput"
                      placeholder="12-3456789"
                      value={brandForm.businessEIN}
                      onChange={(e) =>
                        setBrandForm((p) => ({
                          ...p,
                          businessEIN: formatEIN(e.target.value),
                        }))
                      }
                      disabled={brandBusy}
                      maxLength={10}
                    />
                  </div>
                </div>
                <div className="a2pFormRow">
                  <div className="a2pFormField">
                    <label className="fieldLabel">Entity type</label>
                    <select
                      className="textInput"
                      value={brandForm.businessEntityType}
                      onChange={(e) =>
                        setBrandForm((p) => ({
                          ...p,
                          businessEntityType: e.target.value,
                        }))
                      }
                      disabled={brandBusy}
                    >
                      {ENTITY_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="a2pFormField">
                    <label className="fieldLabel">Vertical</label>
                    <select
                      className="textInput"
                      value={brandForm.businessVertical}
                      onChange={(e) =>
                        setBrandForm((p) => ({
                          ...p,
                          businessVertical: e.target.value,
                        }))
                      }
                      disabled={brandBusy}
                    >
                      {VERTICALS.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="a2pFormRow">
                  <div className="a2pFormField a2pFormFieldWide">
                    <label className="fieldLabel">Street address</label>
                    <input
                      type="text"
                      className="textInput"
                      value={brandForm.street}
                      onChange={(e) =>
                        setBrandForm((p) => ({ ...p, street: e.target.value }))
                      }
                      disabled={brandBusy}
                    />
                  </div>
                </div>
                <div className="a2pFormRow">
                  <div className="a2pFormField">
                    <label className="fieldLabel">City</label>
                    <input
                      type="text"
                      className="textInput"
                      value={brandForm.city}
                      onChange={(e) =>
                        setBrandForm((p) => ({ ...p, city: e.target.value }))
                      }
                      disabled={brandBusy}
                    />
                  </div>
                  <div className="a2pFormField">
                    <label className="fieldLabel">State</label>
                    <select
                      className="textInput"
                      value={brandForm.region}
                      onChange={(e) =>
                        setBrandForm((p) => ({ ...p, region: e.target.value }))
                      }
                      disabled={brandBusy}
                    >
                      <option value="">—</option>
                      {US_STATES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="a2pFormField">
                    <label className="fieldLabel">Postal code</label>
                    <input
                      type="text"
                      className="textInput"
                      value={brandForm.postalCode}
                      onChange={(e) =>
                        setBrandForm((p) => ({
                          ...p,
                          postalCode: e.target.value,
                        }))
                      }
                      disabled={brandBusy}
                      maxLength={10}
                    />
                  </div>
                </div>
                <div className="a2pFormRow">
                  <div className="a2pFormField">
                    <label className="fieldLabel">Website</label>
                    <input
                      type="text"
                      className="textInput"
                      placeholder="https://example.com"
                      value={brandForm.businessWebsite}
                      onChange={(e) =>
                        setBrandForm((p) => ({
                          ...p,
                          businessWebsite: e.target.value,
                        }))
                      }
                      disabled={brandBusy}
                    />
                  </div>
                  <div className="a2pFormField">
                    <label className="fieldLabel">Business email</label>
                    <input
                      type="email"
                      className="textInput"
                      value={brandForm.businessEmail}
                      onChange={(e) =>
                        setBrandForm((p) => ({
                          ...p,
                          businessEmail: e.target.value,
                        }))
                      }
                      disabled={brandBusy}
                    />
                  </div>
                  <div className="a2pFormField">
                    <label className="fieldLabel">Business phone (E.164)</label>
                    <input
                      type="text"
                      className="textInput"
                      placeholder="+12395551234"
                      value={brandForm.businessPhone}
                      onChange={(e) =>
                        setBrandForm((p) => ({
                          ...p,
                          businessPhone: e.target.value,
                        }))
                      }
                      disabled={brandBusy}
                    />
                  </div>
                </div>
                <div className="a2pFormSubhead">Authorized representative</div>
                <div className="a2pFormRow">
                  <div className="a2pFormField">
                    <label className="fieldLabel">First name</label>
                    <input
                      type="text"
                      className="textInput"
                      value={brandForm.repFirstName}
                      onChange={(e) =>
                        setBrandForm((p) => ({
                          ...p,
                          repFirstName: e.target.value,
                        }))
                      }
                      disabled={brandBusy}
                    />
                  </div>
                  <div className="a2pFormField">
                    <label className="fieldLabel">Last name</label>
                    <input
                      type="text"
                      className="textInput"
                      value={brandForm.repLastName}
                      onChange={(e) =>
                        setBrandForm((p) => ({
                          ...p,
                          repLastName: e.target.value,
                        }))
                      }
                      disabled={brandBusy}
                    />
                  </div>
                  <div className="a2pFormField">
                    <label className="fieldLabel">Job title</label>
                    <input
                      type="text"
                      className="textInput"
                      value={brandForm.repJobTitle}
                      onChange={(e) =>
                        setBrandForm((p) => ({
                          ...p,
                          repJobTitle: e.target.value,
                        }))
                      }
                      disabled={brandBusy}
                    />
                  </div>
                  <div className="a2pFormField">
                    <label className="fieldLabel">Position</label>
                    <select
                      className="textInput"
                      value={brandForm.repJobPosition}
                      onChange={(e) =>
                        setBrandForm((p) => ({
                          ...p,
                          repJobPosition: e.target.value,
                        }))
                      }
                      disabled={brandBusy}
                    >
                      {A2P_REP_POSITIONS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="a2pFormRow">
                  <div className="a2pFormField">
                    <label className="fieldLabel">Rep email</label>
                    <input
                      type="email"
                      className="textInput"
                      value={brandForm.repEmail}
                      onChange={(e) =>
                        setBrandForm((p) => ({
                          ...p,
                          repEmail: e.target.value,
                        }))
                      }
                      disabled={brandBusy}
                    />
                  </div>
                  <div className="a2pFormField">
                    <label className="fieldLabel">Rep phone (E.164)</label>
                    <input
                      type="text"
                      className="textInput"
                      placeholder="+12395551234"
                      value={brandForm.repPhone}
                      onChange={(e) =>
                        setBrandForm((p) => ({
                          ...p,
                          repPhone: e.target.value,
                        }))
                      }
                      disabled={brandBusy}
                    />
                  </div>
                </div>
                <div className="buttonRow">
                  <button
                    type="button"
                    className="primaryButton"
                    onClick={submitBrand}
                    disabled={brandBusy}
                  >
                    {brandBusy ? "Submitting…" : "Submit brand"}
                  </button>
                </div>
                {brandError && <div className="errorText">{brandError}</div>}
              </div>
            )}

            {/* Stage 2: Campaign. Show form once brand exists and no campaign. */}
            {a2pStatus?.brandSid && !a2pStatus?.campaignSid && (
              <div className="a2pStage">
                <p className="helperText">
                  Submit the A2P campaign. Best to wait for the brand to reach
                  APPROVED before submitting, but Twilio accepts both in
                  sequence either way. Pre-filled with retail customer-care
                  defaults — edit as needed.
                </p>
                <div className="a2pFormRow">
                  <div className="a2pFormField a2pFormFieldWide">
                    <label className="fieldLabel">Use case</label>
                    <input
                      type="text"
                      className="textInput"
                      value={campaignForm.useCase}
                      onChange={(e) =>
                        setCampaignForm((p) => ({
                          ...p,
                          useCase: e.target.value,
                        }))
                      }
                      disabled={campaignBusy}
                    />
                  </div>
                </div>
                <div className="a2pFormRow">
                  <div className="a2pFormField a2pFormFieldWide">
                    <label className="fieldLabel">Description</label>
                    <textarea
                      className="textInput"
                      rows={3}
                      value={campaignForm.description}
                      onChange={(e) =>
                        setCampaignForm((p) => ({
                          ...p,
                          description: e.target.value,
                        }))
                      }
                      disabled={campaignBusy}
                    />
                  </div>
                </div>
                <div className="a2pFormRow">
                  <div className="a2pFormField a2pFormFieldWide">
                    <label className="fieldLabel">Opt-in / message flow</label>
                    <textarea
                      className="textInput"
                      rows={3}
                      value={campaignForm.messageFlow}
                      onChange={(e) =>
                        setCampaignForm((p) => ({
                          ...p,
                          messageFlow: e.target.value,
                        }))
                      }
                      disabled={campaignBusy}
                    />
                  </div>
                </div>
                <div className="a2pFormRow">
                  <div className="a2pFormField a2pFormFieldWide">
                    <label className="fieldLabel">Sample message 1</label>
                    <textarea
                      className="textInput"
                      rows={2}
                      value={campaignForm.sample1}
                      onChange={(e) =>
                        setCampaignForm((p) => ({
                          ...p,
                          sample1: e.target.value,
                        }))
                      }
                      disabled={campaignBusy}
                    />
                  </div>
                </div>
                <div className="a2pFormRow">
                  <div className="a2pFormField a2pFormFieldWide">
                    <label className="fieldLabel">Sample message 2</label>
                    <textarea
                      className="textInput"
                      rows={2}
                      value={campaignForm.sample2}
                      onChange={(e) =>
                        setCampaignForm((p) => ({
                          ...p,
                          sample2: e.target.value,
                        }))
                      }
                      disabled={campaignBusy}
                    />
                  </div>
                </div>
                <div className="a2pFormRow">
                  <div className="a2pFormField a2pFormFieldWide">
                    <label className="fieldLabel">Sample message 3</label>
                    <textarea
                      className="textInput"
                      rows={2}
                      value={campaignForm.sample3}
                      onChange={(e) =>
                        setCampaignForm((p) => ({
                          ...p,
                          sample3: e.target.value,
                        }))
                      }
                      disabled={campaignBusy}
                    />
                  </div>
                </div>
                <div className="buttonRow">
                  <button
                    type="button"
                    className="primaryButton"
                    onClick={submitCampaign}
                    disabled={campaignBusy}
                  >
                    {campaignBusy ? "Submitting…" : "Submit campaign"}
                  </button>
                </div>
                {campaignError && (
                  <div className="errorText">{campaignError}</div>
                )}
              </div>
            )}

            {/* Stage 3: Link numbers. Show once campaign exists. */}
            {a2pStatus?.campaignSid && (
              <div className="a2pStage">
                <p className="helperText">
                  Link every number owned by this tenant to the messaging
                  service. Already-linked numbers are skipped. Best to wait
                  for campaign APPROVED before linking, but the call is
                  idempotent — safe to retry.
                </p>
                <div className="buttonRow">
                  <button
                    type="button"
                    className="primaryButton"
                    onClick={linkAllNumbers}
                    disabled={linkBusy}
                  >
                    {linkBusy ? "Linking…" : "Link all numbers"}
                  </button>
                </div>
                {linkError && <div className="errorText">{linkError}</div>}
                {linkResult && (
                  <div className="linkResult">
                    <div className="resultRow">
                      <span className="resultLabel">Linked</span>
                      <span className="resultValue">
                        {linkResult.linked?.length || 0}
                      </span>
                    </div>
                    <div className="resultRow">
                      <span className="resultLabel">Already linked</span>
                      <span className="resultValue">
                        {linkResult.alreadyLinked?.length || 0}
                      </span>
                    </div>
                    <div className="resultRow">
                      <span className="resultLabel">Failed</span>
                      <span className="resultValue">
                        {linkResult.failed?.length || 0}
                        {linkResult.failed?.length > 0 && (
                          <>
                            {" "}
                            <button
                              type="button"
                              className="linkButton"
                              onClick={() =>
                                setShowLinkFailures((v) => !v)
                              }
                            >
                              {showLinkFailures ? "hide" : "see failures"}
                            </button>
                          </>
                        )}
                      </span>
                    </div>
                    {showLinkFailures &&
                      linkResult.failed?.map((f) => (
                        <div
                          key={f.phoneNumber}
                          className="linkFailureRow"
                        >
                          <span className="linkFailureNumber">
                            {formatE164ForDisplay(f.phoneNumber)}
                          </span>
                          <span className="linkFailureError">{f.error}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}

            <div className="sectionTitle">Webhooks</div>
            <p className="helperText">
              Every purchased number has its inbound SMS, status callback, and
              voice fallback URLs set automatically. If the function names
              ever change, run this to reconfigure all numbers under the
              tenant. Idempotent — numbers already on the current URLs are
              skipped.
            </p>
            {webhookDriftCount > 0 ? (
              <div className="warnCallout">
                <strong>{webhookDriftCount}</strong> of{" "}
                <strong>{totalNumberCount}</strong> number
                {totalNumberCount === 1 ? "" : "s"} need webhook reconfig.
              </div>
            ) : (
              totalNumberCount > 0 && (
                <p className="helperText">
                  All {totalNumberCount} number
                  {totalNumberCount === 1 ? "" : "s"} on current webhook
                  config.
                </p>
              )
            )}
            <div className="buttonRow">
              <button
                type="button"
                className="primaryButton"
                onClick={configureAllWebhooks}
                disabled={webhooksBusy || totalNumberCount === 0}
              >
                {webhooksBusy ? "Reconfiguring…" : "Reconfigure webhooks"}
              </button>
            </div>
            {webhooksError && (
              <div className="errorText">{webhooksError}</div>
            )}
            {webhooksResult && (
              <div className="linkResult">
                <div className="resultRow">
                  <span className="resultLabel">Configured</span>
                  <span className="resultValue">
                    {webhooksResult.configured?.length || 0}
                  </span>
                </div>
                <div className="resultRow">
                  <span className="resultLabel">Already current</span>
                  <span className="resultValue">
                    {webhooksResult.alreadyCurrent?.length || 0}
                  </span>
                </div>
                <div className="resultRow">
                  <span className="resultLabel">Failed</span>
                  <span className="resultValue">
                    {webhooksResult.failed?.length || 0}
                    {webhooksResult.failed?.length > 0 && (
                      <>
                        {" "}
                        <button
                          type="button"
                          className="linkButton"
                          onClick={() =>
                            setShowWebhooksFailures((v) => !v)
                          }
                        >
                          {showWebhooksFailures ? "hide" : "see failures"}
                        </button>
                      </>
                    )}
                  </span>
                </div>
                {showWebhooksFailures &&
                  webhooksResult.failed?.map((f) => (
                    <div
                      key={f.phoneNumber}
                      className="linkFailureRow"
                    >
                      <span className="linkFailureNumber">
                        {formatE164ForDisplay(f.phoneNumber)}
                      </span>
                      <span className="linkFailureError">{f.error}</span>
                    </div>
                  ))}
              </div>
            )}
          </>
        )}

        <div className="sectionTitle">Stripe Connect</div>
        {!tenant?.stripe?.hasConnect ? (
          <>
            <p className="helperText">
              No Connect account yet. Creating one uses the tenant's owner
              email (
              <strong>{tenant?.ownerEmail || "—"}</strong>) and tenant name
              (<strong>{tenant?.name || tenantID}</strong>) as the business
              name. After creating, generate an onboarding link to hand to
              the tenant.
            </p>
            <div className="buttonRow">
              <button
                type="button"
                className="primaryButton"
                onClick={createConnectAccount}
                disabled={connectBusy || !tenant?.ownerEmail}
              >
                {connectBusy ? "Creating…" : "Create Connect account"}
              </button>
            </div>
            {connectError && <div className="errorText">{connectError}</div>}
          </>
        ) : (
          <>
            <div className="resultRow">
              <span className="resultLabel">Account ID</span>
              <span className="resultValue">
                {truncateAcctID(tenant.stripe.stripeAccountID)}
              </span>
            </div>
            <div className="resultRow">
              <span className="resultLabel">Charges enabled</span>
              <span
                className={`badge badge-${boolTone(
                  tenant.stripe.chargesEnabled
                )}`}
              >
                {tenant.stripe.chargesEnabled ? "yes" : "no"}
              </span>
            </div>
            <div className="resultRow">
              <span className="resultLabel">Payouts enabled</span>
              <span
                className={`badge badge-${boolTone(
                  tenant.stripe.payoutsEnabled
                )}`}
              >
                {tenant.stripe.payoutsEnabled ? "yes" : "no"}
              </span>
            </div>
            <div className="resultRow">
              <span className="resultLabel">Details submitted</span>
              <span
                className={`badge badge-${boolTone(
                  tenant.stripe.detailsSubmitted
                )}`}
              >
                {tenant.stripe.detailsSubmitted ? "yes" : "no"}
              </span>
            </div>
            <div className="resultRow">
              <span className="resultLabel">Requirements outstanding</span>
              <span className="resultValue">
                {tenant.stripe.requirementsCount || 0}
                {tenant.stripe.requirementsCount > 0 && (
                  <>
                    {" "}
                    <button
                      type="button"
                      className="linkButton"
                      onClick={() => setShowRequirements((v) => !v)}
                    >
                      {showRequirements ? "hide" : "see details"}
                    </button>
                  </>
                )}
              </span>
            </div>
            {showRequirements &&
              (tenant.stripe.requirementsCurrentlyDue || []).map((req) => (
                <div key={req} className="linkFailureRow">
                  <span className="linkFailureError">{req}</span>
                </div>
              ))}
            <div className="buttonRow">
              <button
                type="button"
                className="primaryButton"
                onClick={generateConnectLink}
                disabled={connectBusy}
              >
                {connectBusy ? "Working…" : "Generate onboarding link"}
              </button>
              <button
                type="button"
                className="secondaryButton"
                onClick={refreshConnectStatus}
                disabled={connectBusy}
              >
                {connectBusy ? "Working…" : "Refresh status"}
              </button>
            </div>
            {connectError && <div className="errorText">{connectError}</div>}
            {connectLink && (
              <div className="linkResult">
                <p className="helperText">
                  One-time onboarding URL. Hand to the tenant — they finish
                  onboarding on Stripe's hosted page.
                </p>
                <div className="resultRow">
                  <span className="resultLabel">URL</span>
                  <span className="resultValue">
                    <input
                      type="text"
                      readOnly
                      className="textInput"
                      value={connectLink.url}
                      onFocus={(e) => e.target.select()}
                    />
                  </span>
                </div>
                <div className="resultRow">
                  <span className="resultLabel">Expires</span>
                  <span className="resultValue">
                    {formatExpiresAt(connectLink.expiresAt)}
                  </span>
                </div>
                <div className="buttonRow">
                  <button
                    type="button"
                    className="secondaryButton"
                    onClick={copyConnectLink}
                  >
                    {connectLinkCopied ? "Copied" : "Copy link"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        <div className="sectionTitle">Email</div>
        {emailStatusBusy && !emailAccounts && (
          <p className="placeholderText">Loading email status…</p>
        )}
        {emailStatusError && (
          <div className="errorText">{emailStatusError}</div>
        )}
        {emailAccounts && emailAccounts.length === 0 && (
          <p className="placeholderText">
            No email accounts. Tenant adds inboxes from the Cadence app's Email
            settings; they appear here once connected.
          </p>
        )}
        {emailAccounts && emailAccounts.length > 0 && (
          <>
            <div className="buttonRow">
              <button
                type="button"
                className="secondaryButton"
                onClick={loadEmailStatus}
                disabled={emailStatusBusy}
              >
                {emailStatusBusy ? "Refreshing…" : "Refresh status"}
              </button>
            </div>
            <div className="emailAccountList">
              {emailAccounts.map((acct) => {
                const meta =
                  EMAIL_STATUS_LABELS[acct.derivedStatus] ||
                  EMAIL_STATUS_LABELS.disconnected;
                const rowBusy = emailRowBusy[acct.accountKey] || null;
                const rowResult = emailRowResult[acct.accountKey] || null;
                const canReconnect = acct.hasRefreshToken;
                return (
                  <div key={acct.accountKey} className="emailAccountCard">
                    <div className="emailAccountHeader">
                      <div className="emailAccountIdentity">
                        <div className="emailAccountEmail">
                          {acct.email || "(no email)"}
                        </div>
                        {acct.displayName && (
                          <div className="emailAccountDisplayName">
                            {acct.displayName}
                          </div>
                        )}
                      </div>
                      <span className={`badge badge-${meta.tone}`}>
                        {meta.label}
                      </span>
                    </div>
                    <div className="emailAccountMeta">
                      <div>
                        <span className="metaLabel">Scope</span>
                        <span className="metaValue">
                          {acct.assignedStoreID
                            ? `Store ${acct.assignedStoreID}`
                            : "Shared (all stores)"}
                        </span>
                      </div>
                      <div>
                        <span className="metaLabel">Watch expires</span>
                        <span className="metaValue">
                          {acct.watchExpiration
                            ? `${formatEpochMs(acct.watchExpiration)} (${relativeTime(
                                acct.watchExpiration
                              )})`
                            : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="metaLabel">Last sync</span>
                        <span className="metaValue">
                          {acct.lastSyncedAt
                            ? `${formatEpochMs(acct.lastSyncedAt)} (${relativeTime(
                                acct.lastSyncedAt
                              )})`
                            : "never"}
                        </span>
                      </div>
                      <div>
                        <span className="metaLabel">Unread</span>
                        <span className="metaValue">{acct.unreadCount}</span>
                      </div>
                    </div>
                    {acct.lastError && (
                      <div className="errorText">{acct.lastError}</div>
                    )}
                    {!canReconnect &&
                      acct.derivedStatus !== "neverConnected" && (
                        <div className="placeholderText">
                          No refresh token on file. Tenant must re-authorize
                          Gmail from the Cadence app — platform admin can't
                          trigger consent.
                        </div>
                      )}
                    <div className="buttonRow">
                      <button
                        type="button"
                        className="secondaryButton"
                        onClick={() => reconnectEmailWatch(acct.accountKey)}
                        disabled={!canReconnect || Boolean(rowBusy)}
                      >
                        {rowBusy === "reconnect"
                          ? "Reconnecting…"
                          : "Reconnect watch"}
                      </button>
                      <button
                        type="button"
                        className="secondaryButton"
                        onClick={() => forceEmailSync(acct.accountKey)}
                        disabled={!canReconnect || Boolean(rowBusy)}
                      >
                        {rowBusy === "sync" ? "Syncing…" : "Force sync"}
                      </button>
                    </div>
                    {rowResult && rowResult.kind === "reconnect" && (
                      <div className="successText">
                        Watch renewed — expires{" "}
                        {relativeTime(rowResult.watchExpiration)}.
                      </div>
                    )}
                    {rowResult && rowResult.kind === "sync" && (
                      <div className="successText">
                        Synced {rowResult.synced} message
                        {rowResult.synced === 1 ? "" : "s"}.
                      </div>
                    )}
                    {rowResult && rowResult.kind === "error" && (
                      <div className="errorText">{rowResult.error}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
