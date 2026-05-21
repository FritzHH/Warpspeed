/* eslint-disable */
/**
 * TokensScreen - admin-only design-token visualizer.
 *
 * Renders every semantic token from src/styles/tokens.css as a labeled
 * swatch with its computed CSS value. Toggles for light/dark mode and
 * tenant brand let you preview the entire palette in context.
 *
 * Source of truth: docs/design-tokens.md
 * Route: /tokens (gated by PERMISSION_LEVELS.admin)
 */
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLoginStore } from "../stores";
import { PERMISSION_LEVELS } from "../constants";
import { resolveToken } from "../styles";
import { getTheme, setTheme, subscribeTheme } from "../styles/theme";
import styles from "./TokensScreen.module.css";

// Mirror of the semantic layer in src/styles/tokens.css, grouped for display.
// Each entry: { name: token name without "--", kind: how to visualize it }
//   kind = "fill"  -> solid color block
//   kind = "border" -> ring around inner surface
//   kind = "text"  -> "Aa" sample on surface
//   kind = "shadow" -> raised tile with a shadow using the token color
const TOKEN_GROUPS = [
  {
    title: "Surfaces",
    blurb: "Backgrounds for cards, panels, modals, and scrims.",
    tokens: [
      { name: "surface-base",          kind: "fill" },
      { name: "surface-alt",           kind: "fill" },
      { name: "surface-raised",        kind: "fill" },
      { name: "surface-accent-muted",  kind: "fill" },
      { name: "surface-success-muted", kind: "fill" },
      { name: "surface-overlay",       kind: "fill" },
      { name: "surface-overlay-light", kind: "fill" },
      { name: "surface-overlay-heavy", kind: "fill" },
    ],
  },
  {
    title: "Borders",
    blurb: "Dividers, outlines, and focus rings.",
    tokens: [
      { name: "border-subtle",  kind: "border" },
      { name: "border-default", kind: "border" },
      { name: "border-strong",  kind: "border" },
      { name: "border-focus",   kind: "border" },
    ],
  },
  {
    title: "Text",
    blurb: "Foreground roles for typography.",
    tokens: [
      { name: "text-strong",    kind: "text" },
      { name: "text-default",   kind: "text" },
      { name: "text-secondary", kind: "text" },
      { name: "text-muted",     kind: "text" },
      { name: "text-disabled",  kind: "text" },
      { name: "text-inverse",   kind: "text", onInverse: true },
      { name: "text-on-accent", kind: "text", onAccent: true },
    ],
  },
  {
    title: "Accent & status",
    blurb: "Brand, success, info, warning, and danger hues.",
    tokens: [
      { name: "accent",         kind: "fill" },
      { name: "accent-hover",   kind: "fill" },
      { name: "success",        kind: "fill" },
      { name: "info",           kind: "fill" },
      { name: "info-strong",    kind: "fill" },
      { name: "warning",        kind: "fill" },
      { name: "danger",         kind: "fill" },
      { name: "danger-muted",   kind: "fill" },
      { name: "danger-strong",  kind: "fill" },
    ],
  },
  {
    title: "Shadow colors",
    blurb: "Color portion of shadow recipes (recipes stay inline).",
    tokens: [
      { name: "shadow-color-subtle",  kind: "shadow" },
      { name: "shadow-color-default", kind: "shadow" },
      { name: "shadow-color-accent",  kind: "shadow" },
    ],
  },
];

// Tenants available for live preview. Mirrors src/styles/themes/tenants.css.
const TENANT_OPTIONS = [
  { id: "",       label: "Default (root)" },
  { id: "bonita", label: "Bonita" },
];

function Swatch({ token, computedValue }) {
  if (token.kind === "fill") {
    return (
      <div className={styles.swatch}>
        <div
          className={styles.swatchFill}
          style={{ backgroundColor: `var(--${token.name})` }}
        />
      </div>
    );
  }

  if (token.kind === "border") {
    return (
      <div className={styles.swatch}>
        <div
          className={styles.swatchBorder}
          style={{ borderColor: `var(--${token.name})` }}
        />
      </div>
    );
  }

  if (token.kind === "text") {
    const bg = token.onAccent
      ? "var(--accent)"
      : token.onInverse
        ? "var(--gray-800)"
        : "var(--surface-base)";
    return (
      <div className={styles.swatch}>
        <div
          className={styles.swatchText}
          style={{ color: `var(--${token.name})`, backgroundColor: bg }}
        >
          Aa
        </div>
      </div>
    );
  }

  if (token.kind === "shadow") {
    return (
      <div className={styles.swatch}>
        <div
          className={styles.swatchShadow}
          style={{ boxShadow: `0 6px 16px var(--${token.name})` }}
        />
      </div>
    );
  }

  return null;
}

export function TokensScreen() {
  const navigate = useNavigate();
  const currentUserLevel = useLoginStore(
    (state) => state.currentUser?.permissions?.level || 0
  );
  const isAdmin = currentUserLevel >= PERMISSION_LEVELS.admin.level;

  const [theme, setLocalTheme] = useState(() => getTheme());
  const [tenant, setTenant] = useState(
    () => document.documentElement.dataset.tenant || ""
  );
  // Bump to force recompute of CSS values when theme/tenant flips.
  const [tick, setTick] = useState(0);

  // Subscribe to global theme changes so this page stays in sync if a
  // toggle elsewhere flips it.
  useEffect(() => {
    return subscribeTheme((next) => {
      setLocalTheme(next);
      setTick((n) => n + 1);
    });
  }, []);

  const applyTheme = (next) => {
    setTheme(next); // persists + applies + notifies subscribers (incl. this one)
  };

  useEffect(() => {
    if (tenant) {
      document.documentElement.dataset.tenant = tenant;
    } else {
      delete document.documentElement.dataset.tenant;
    }
    setTick((n) => n + 1);
  }, [tenant]);

  // Snapshot computed values for the meta panel. Re-runs whenever theme or
  // tenant changes via tick.
  const computed = useMemo(() => {
    const map = {};
    TOKEN_GROUPS.forEach((g) =>
      g.tokens.forEach((t) => {
        map[t.name] = resolveToken(t.name);
      })
    );
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  if (!isAdmin) {
    return (
      <div className={styles.deniedRoot}>
        <div className={styles.deniedBox}>
          <h2 className={styles.deniedTitle}>Admin access required</h2>
          <p className={styles.deniedMsg}>
            The design-token viewer is restricted to admin users.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>Design Tokens</h1>
          <span className={styles.subtitle}>
            Semantic layer from <code>src/styles/tokens.css</code>. Live values
            below reflect the current theme and tenant.
          </span>
        </div>
        <div className={styles.controls}>
          <button
            type="button"
            className={`${styles.controlBtn} ${theme === "light" ? styles.controlBtnActive : ""}`}
            onClick={() => applyTheme("light")}
          >
            Light
          </button>
          <button
            type="button"
            className={`${styles.controlBtn} ${theme === "dark" ? styles.controlBtnActive : ""}`}
            onClick={() => applyTheme("dark")}
          >
            Dark
          </button>
          <select
            className={styles.tenantSelect}
            value={tenant}
            onChange={(e) => setTenant(e.target.value)}
          >
            {TENANT_OPTIONS.map((o) => (
              <option key={o.id || "default"} value={o.id}>
                Tenant: {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={styles.controlBtn}
            onClick={() => navigate(-1)}
          >
            Back
          </button>
        </div>
      </div>

      {TOKEN_GROUPS.map((group) => (
        <section className={styles.section} key={group.title}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>{group.title}</h2>
            <span className={styles.sectionCount}>
              {group.tokens.length} tokens — {group.blurb}
            </span>
          </div>
          <div className={styles.grid}>
            {group.tokens.map((token) => (
              <div className={styles.card} key={token.name}>
                <Swatch token={token} computedValue={computed[token.name]} />
                <div className={styles.meta}>
                  <span className={styles.metaName}>--{token.name}</span>
                  <span className={styles.metaValue}>
                    {computed[token.name] || "(unresolved)"}
                  </span>
                  <span className={styles.metaCss}>
                    var(--{token.name})
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default TokensScreen;
