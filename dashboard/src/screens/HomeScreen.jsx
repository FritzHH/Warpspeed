import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import { signOut } from "../auth";

const listTenantsCallable = httpsCallable(functions, "listTenantsCallable");

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

export function HomeScreen({ user, claims }) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [tenants, setTenants] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showClaims, setShowClaims] = useState(false);
  const fetchID = useRef(0);

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
      <div className="card cardList">
        <div className="listHeader">
          <div>
            <h1 className="cardTitle">Cadence Dashboard</h1>
            <p className="cardSubtitle">Signed in as {user?.email}</p>
          </div>
          <div className="buttonRow">
            <Link to="/billing/tiers" className="secondaryButton">
              Billing tiers
            </Link>
            <Link to="/tenants/new" className="primaryButton primaryButtonInline">
              + New tenant
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

        {loading && !tenants && (
          <div className="placeholderText">Loading tenants...</div>
        )}

        {!loading && tenants && tenants.length === 0 && (
          <div className="emptyState">
            {debouncedSearch
              ? `No tenants match "${debouncedSearch}".`
              : "No tenants yet. Create the first one to get started."}
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
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <div className="cardFooter">
          <button
            type="button"
            className="linkButton"
            onClick={() => setShowClaims((v) => !v)}
          >
            {showClaims ? "Hide" : "Show"} custom claims
          </button>
          {showClaims && (
            <div className="claimsBlock">
              <pre className="claimsCode">
                {JSON.stringify(claims, null, 2)}
              </pre>
            </div>
          )}
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
  );
}
