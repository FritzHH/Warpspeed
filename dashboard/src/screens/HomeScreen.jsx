import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import { signOut } from "../auth";

const listTenantsCallable = httpsCallable(functions, "listTenantsCallable");
const createTenantCallable = httpsCallable(
  functions,
  "platformAdminCreateTenantCallable"
);
const sendOwnerWelcomeEmailCallable = httpsCallable(
  functions,
  "platformAdminSendOwnerWelcomeEmailCallable"
);
const deleteTenantCallable = httpsCallable(
  functions,
  "platformAdminDeleteTenantCallable"
);

function formatDateForTenantID(date) {
  const months = [
    "jan", "feb", "mar", "apr", "may", "jun",
    "jul", "aug", "sep", "oct", "nov", "dec",
  ];
  const month = months[date.getMonth()];
  const day = date.getDate();
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "pm" : "am";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${month}-${day}-${hours}-${minutes}-${ampm}`;
}

function buildTestTenantPayload() {
  const dateStr = formatDateForTenantID(new Date());
  return {
    tenantID: `test-connect-${dateStr}`,
    tenantName: `Test Connect ${dateStr}`,
    ownerEmail: "hieb.fritz@gmail.com",
    ownerFirstName: "Test",
    ownerLastName: "Connect",
    ownerPhone: "2393369177",
    tenantStreet: "123 Test St",
    tenantUnit: "",
    tenantCity: "Testville",
    tenantState: "CA",
    tenantZip: "94016",
    billingModel: "per_sale",
    platformFeePercent: 0.5,
    fullBakeForTest: true,
  };
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

export function HomeScreen({ user, claims }) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [tenants, setTenants] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showClaims, setShowClaims] = useState(false);
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testError, setTestError] = useState("");
  const [emailResult, setEmailResult] = useState(null);
  const [emailError, setEmailError] = useState("");
  const [deletingTenantID, setDeletingTenantID] = useState("");
  const [deleteError, setDeleteError] = useState("");
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
    console.log(
      "DeleteTenant: firing platformAdminDeleteTenantCallable",
      JSON.stringify({ tenantID: tenant.tenantID, nukeExternal: true }, null, 2)
    );
    try {
      const res = await deleteTenantCallable({
        tenantID: tenant.tenantID,
        nukeExternal: true,
        skipConfirmation: true,
      });
      console.log(
        "DeleteTenant: result",
        JSON.stringify(res.data, null, 2)
      );
      await refreshTenants();
    } catch (err) {
      const code = err?.code || "";
      const msg = err?.message || "Delete failed.";
      const full = code ? `${code}: ${msg}` : msg;
      console.error("DeleteTenant: error", full, err);
      setDeleteError(`${tenant.tenantID}: ${full}`);
    } finally {
      setDeletingTenantID("");
    }
  }

  async function handleCreateTestAccount() {
    setTestRunning(true);
    setTestResult(null);
    setTestError("");
    setEmailResult(null);
    setEmailError("");
    const payload = buildTestTenantPayload();
    console.log(
      "CreateTestAccount: firing platformAdminCreateTenantCallable with payload",
      JSON.stringify(payload, null, 2)
    );
    try {
      const res = await createTenantCallable(payload);
      console.log(
        "CreateTestAccount: result",
        JSON.stringify(res.data, null, 2)
      );
      setTestResult(res.data);

      const newTenantID = res.data?.tenantID || payload.tenantID;
      console.log(
        "CreateTestAccount: firing platformAdminSendOwnerWelcomeEmailCallable",
        JSON.stringify({ tenantID: newTenantID }, null, 2)
      );
      try {
        const emailRes = await sendOwnerWelcomeEmailCallable({
          tenantID: newTenantID,
        });
        console.log(
          "CreateTestAccount: welcome email result",
          JSON.stringify(emailRes.data, null, 2)
        );
        setEmailResult(emailRes.data);
      } catch (emailErr) {
        const code = emailErr?.code || "";
        const msg = emailErr?.message || "Welcome email failed.";
        const full = code ? `${code}: ${msg}` : msg;
        console.error("CreateTestAccount: welcome email error", full, emailErr);
        setEmailError(full);
      }
    } catch (err) {
      const code = err?.code || "";
      const msg = err?.message || "Test create failed.";
      const full = code ? `${code}: ${msg}` : msg;
      console.error("CreateTestAccount: error", full, err);
      setTestError(full);
    } finally {
      setTestRunning(false);
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
        {deleteError && <div className="errorText">{deleteError}</div>}

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
                    <button
                      type="button"
                      className="dangerButton"
                      onClick={(e) => handleDeleteTenant(e, t)}
                      disabled={deletingTenantID === t.tenantID}
                      title="Delete tenant + Stripe + Twilio + Auth user (dev)"
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
            onClick={handleCreateTestAccount}
            disabled={testRunning}
          >
            {testRunning ? "Creating Test Account…" : "Create Test Account"}
          </button>
          {testError && <div className="errorText">{testError}</div>}
          {testResult && (
            <div className="claimsBlock">
              <pre className="claimsCode">
                {JSON.stringify(testResult, null, 2)}
              </pre>
            </div>
          )}
          {emailError && <div className="errorText">{emailError}</div>}
          {emailResult && (
            <div className="claimsBlock">
              <pre className="claimsCode">
                {JSON.stringify(emailResult, null, 2)}
              </pre>
            </div>
          )}
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
