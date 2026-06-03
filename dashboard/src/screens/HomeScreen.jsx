import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import { signOut } from "../auth";

const listTenantsCallable = httpsCallable(functions, "listTenantsCallable");
const sendTenantSetupAuthCallable = httpsCallable(
  functions,
  "platformAdminSendTenantSetupAuthCallable"
);
const deleteTenantCallable = httpsCallable(
  functions,
  "platformAdminDeleteTenantCallable"
);

function isValidEmailShape(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || "").trim());
}

function formatDate(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function badgesFor(tenant) {
  const out = [];
  const tw = tenant.twilio || {};
  const sp = tenant.stripe || {};
  const em = tenant.email || {};

  if (!tw.hasSubaccount) {
    out.push({ label: "Needs Twilio", tone: "warn" });
  } else {
    const camp = tw.a2pCampaignStatus;
    if (camp === "APPROVED" || camp === "VERIFIED") {
      out.push({ label: "A2P approved", tone: "accent" });
    } else if (camp === "FAILED" || camp === "REJECTED") {
      out.push({ label: "A2P failed", tone: "danger" });
    } else {
      out.push({ label: "A2P pending", tone: "info" });
    }
  }

  if (!sp.hasConnect) {
    out.push({ label: "Needs Stripe", tone: "warn" });
  } else if (!sp.chargesEnabled) {
    out.push({ label: "Stripe not charging", tone: "info" });
  } else {
    out.push({ label: "Stripe live", tone: "accent" });
  }

  if (em.accountCount > 0) {
    if (em.issuesCount > 0) {
      const label =
        em.accountCount === 1
          ? "Email issue"
          : `Email ${em.healthyCount}/${em.accountCount}`;
      out.push({ label, tone: "warn" });
    } else {
      out.push({ label: "Email live", tone: "accent" });
    }
  }

  return out;
}

export function HomeScreen({ user }) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [tenants, setTenants] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [deletingTenantID, setDeletingTenantID] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupSending, setSignupSending] = useState(false);
  const [signupResult, setSignupResult] = useState(null);
  const [signupError, setSignupError] = useState("");
  const fetchID = useRef(0);

  async function refreshTenants() {
    const reqID = ++fetchID.current;
    setLoading(true);
    setError("");
    try {
      const res = await listTenantsCallable({
        search: debouncedSearch || undefined,
        limit: 100,
      });
      if (reqID !== fetchID.current) return;
      setTenants(res.data?.tenants || []);
    } catch (err) {
      if (reqID !== fetchID.current) return;
      const code = err?.code || "";
      const msg = err?.message || "Failed to load tenants.";
      setError(code ? `${code}: ${msg}` : msg);
    } finally {
      if (reqID === fetchID.current) setLoading(false);
    }
  }

  async function handleDeleteTenant(e, tenant) {
    e.preventDefault();
    e.stopPropagation();
    const label = tenant.name || tenant.tenantID;
    const ok = window.confirm(
      `Delete tenant "${label}" and nuke Stripe Connect + Twilio + Firebase Auth user? This cannot be undone.`
    );
    if (!ok) return;
    setDeletingTenantID(tenant.tenantID);
    setDeleteError("");
    try {
      await deleteTenantCallable({
        tenantID: tenant.tenantID,
        nukeExternal: true,
        skipConfirmation: true,
      });
      await refreshTenants();
    } catch (err) {
      const code = err?.code || "";
      const msg = err?.message || "Delete failed.";
      const full = code ? `${code}: ${msg}` : msg;
      setDeleteError(`${tenant.tenantID}: ${full}`);
    } finally {
      setDeletingTenantID("");
    }
  }

  async function handleSendSignupAuth() {
    const normalized = signupEmail.trim().toLowerCase();
    if (!isValidEmailShape(normalized)) {
      setSignupError("Enter a valid email.");
      return;
    }
    setSignupSending(true);
    setSignupResult(null);
    setSignupError("");
    try {
      const res = await sendTenantSetupAuthCallable({
        email: normalized,
        // Tier is picked per-store at /welcome onboarding; this satisfies the
        // callable's required-param validator until it's dropped server-side.
        billingTier: "per_sale",
      });
      setSignupResult(res.data);
      setSignupEmail("");
    } catch (err) {
      const code = err?.code || "";
      const msg = err?.message || "Send failed.";
      const full = code ? `${code}: ${msg}` : msg;
      setSignupError(full);
    } finally {
      setSignupSending(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const reqID = ++fetchID.current;
    setLoading(true);
    setError("");
    listTenantsCallable({
      search: debouncedSearch || undefined,
      limit: 100,
    })
      .then((res) => {
        if (reqID !== fetchID.current) return;
        setTenants(res.data?.tenants || []);
        setLoading(false);
      })
      .catch((err) => {
        if (reqID !== fetchID.current) return;
        const code = err?.code || "";
        const msg = err?.message || "Failed to load tenants.";
        setError(code ? `${code}: ${msg}` : msg);
        setLoading(false);
      });
  }, [debouncedSearch]);

  return (
    <div className="pageScreen">
      <div className="pageStack">
        <div className="card">
          <h2 className="cardTitle">Authorize new tenant</h2>
          <p className="cardSubtitle">
            Sales-gated signup. Prospect gets a setup link valid for 30 days
            that resumes their progress across sessions.
          </p>
          <input
            type="email"
            className="textInput"
            placeholder="prospect@bikeshop.com"
            value={signupEmail}
            onChange={(e) => setSignupEmail(e.target.value)}
            disabled={signupSending}
            autoComplete="off"
          />
          <button
            type="button"
            className="primaryButton"
            onClick={handleSendSignupAuth}
            disabled={signupSending || !isValidEmailShape(signupEmail)}
          >
            {signupSending ? "Sending…" : "Send Authorization"}
          </button>
          {signupError && <div className="errorText">{signupError}</div>}
          {signupResult && (
            <div className="successText">
              ✓ Authorization sent to {signupResult.email}
              {signupResult.isFirstTime ? "" : " (re-sent, new token)"}
            </div>
          )}
        </div>

        <div className="card cardList">
          <div className="listHeader">
            <div>
              <h1 className="cardTitle">Cadence Dashboard</h1>
              <p className="cardSubtitle">Signed in as {user?.email}</p>
            </div>
            <div className="buttonRow">
              <Link to="/billing/config" className="secondaryButton">
                Platform billing
              </Link>
              <Link to="/billing/tiers" className="secondaryButton">
                Billing tiers
              </Link>
              <Link to="/admin" className="secondaryButton">
                Cadence admin
              </Link>
            </div>
          </div>

          <input
            type="text"
            className="textInput searchInput"
            placeholder="Search by tenant ID or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
          />

          {error && <div className="errorText">{error}</div>}
          {deleteError && <div className="errorText">{deleteError}</div>}

          {loading && !tenants && (
            <div className="placeholderText">Loading tenants...</div>
          )}

          {!loading && tenants && tenants.length === 0 && (
            <div className="emptyState">
              {debouncedSearch
                ? `No tenants match "${debouncedSearch}".`
                : "No tenants yet. Send your first authorization to get started."}
            </div>
          )}

          {tenants && tenants.length > 0 && (
            <div className="tenantList">
              {tenants.map((t) => {
                const badges = badgesFor(t);
                return (
                  <Link
                    key={t.tenantID}
                    to={`/tenants/${t.tenantID}`}
                    className="tenantRow linkReset"
                  >
                    <div className="tenantRowMain">
                      <div className="tenantRowName">{t.name || t.tenantID}</div>
                      <div className="tenantRowMeta">
                        <span className="tenantRowID">{t.tenantID}</span>
                        <span className="tenantRowDot">•</span>
                        <span>{t.ownerEmail}</span>
                        {t.storeCount > 0 && (
                          <>
                            <span className="tenantRowDot">•</span>
                            <span>
                              {t.storeCount} store
                              {t.storeCount === 1 ? "" : "s"}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="tenantRowSide">
                      <div className="badgeRow">
                        {badges.map((b, i) => (
                          <span
                            key={i}
                            className={`badge badge-${b.tone}`}
                          >
                            {b.label}
                          </span>
                        ))}
                      </div>
                      <div className="tenantRowDate">
                        {formatDate(t.createdAt)}
                      </div>
                      <button
                        type="button"
                        className="dangerButton"
                        onClick={(e) => handleDeleteTenant(e, t)}
                        disabled={deletingTenantID === t.tenantID}
                        title="Delete tenant + Stripe + Twilio + Auth user"
                        style={{
                          marginTop: 0,
                          padding: "4px 10px",
                          fontSize: 12,
                        }}
                      >
                        {deletingTenantID === t.tenantID ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          <div className="cardFooter">
            <button
              type="button"
              className="secondaryButton"
              onClick={() => signOut()}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
