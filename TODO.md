# TODO

Consolidated from `~/.claude/projects/.../memory/*.md` and in-repo `.md` files as of 2026-06-01.
Each item links back to its source for full context.

---

## My Personal TODOs

_Items the user adds with the phrase "my todo" / "add to my todos" / similar (keyword: **my**)._

---

## Known Bugs to Fix

- **Missing changelog entries for bulk line changes during active checkout** — `diffWorkorderLines` (or `handleWorkorderLineChange`) only captures the first change when multiple line items are modified in one operation. Confirmed in two cases:
  - Qty changes: WO1 had two qty changes (TUBE 26x2.75-3.00: 1→2, TIRE KWICK TRAX: 1→2) but only the TUBE change was logged.
  - Item removals: 6 items removed from WO2 in one operation but only 1 removal ("TUBE 700x35-43") was logged. Single `lastTransactionStamp` confirms all went through one `handleWorkorderLineChange` call.
  - Root cause likely `diffWorkorderLines` returning only the first difference. Investigate that function.
  - Source: `memory/MEMORY.md` § Known Bugs to Fix

---

## Pre-Deployment Hardening

- **Tighten `vendor_catalogs` RTDB read rule before wide deployment** — Temporarily set to `".read": true` (public) in `database.rules.json` (2026-06-02) so Bonita (warpspeed-bonitabikes) can cross-project read JBI catalog data hosted on cadence-pos RTDB without an auth shim. Before onboarding any other tenant or going live with multi-customer access, restore an auth-gated rule. Options to consider: (a) Firebase Anonymous Auth bootstrap on the catalog app instance + `".read": "auth != null"`, (b) callable proxy that reads the catalog server-side and returns scoped data, (c) public read but limited to non-pricing fields via per-path rules.
  - Source: in-conversation decision (Path A), 2026-06-02

---

## Paused Features (waiting on external blockers)

- **SMS staff-phone-reply** — Disabled 2026-05-25 via `STAFF_PHONE_REPLY_ENABLED=false`. Re-enable requires TTL + sender validation + opt-out prefix.
  - Source: `memory/project-sms-staff-phone-reply-paused.md`
- **SMS forward branded-domain link** — `rsstxt.com` registered + Firebase connected, but carrier still 30007s. Paused awaiting Twilio support ticket for A2P URL allowlist update.
  - Source: `memory/project-sms-forward-link-branded-domain.md`
- **Passwordless LoginScreen (Bonita)** — Reverted 2026-05-29. Phase 4 work preserved in `git stash@{0}`. Recover via `git stash pop` when cadence-pos has provisioned users with claims.
  - Source: `memory/project-saas-user-crud-passwordless.md`
- **Tenant provisioning refactor (Phases 2-6)** — Phase 1 deployed 2026-05-27 to cadence-pos. End-to-end test + Phases 2-6 pending. See "Pending Multi-Phase Plans" below.
  - Source: `memory/project-tenant-provisioning-refactor-wip.md`
- **Stage 2 Twilio end-to-end integration testing** — Blocked alongside production rollout pending RSS LLC Primary Profile approval. All SaaS Twilio Cloud Functions remain deployable with placeholder secrets.
  - Source: `memory/project-rss-llc-blocker.md`

---

## Planned Features (not yet implemented)

- **SMS auto-bounceback setting** — Per-store boolean to auto-reply/reject inbound texts from unknown senders; defaults to off (Bonita-style lax).
  - Source: `memory/project-sms-auto-bounceback-setting.md`
- **Tenant setup doc sweep system** — TTL/cleanup for stale `tenant_account_setup` docs; gates resume-wizard window. Deferred 2026-06-01; design TBD (scheduled function vs Firestore TTL field, retention duration, orphaned-artifact cleanup contract).
  - Source: `memory/project-tenant-setup-sweep.md`
- **SMS inbound spam flagging** — Filter/cap layer so tenants aren't billed for carpet-bomb inbound SMS under per-text billing. Hook into inbound stamp path when built. User decision deferred on which signals drive the flag.
  - Source: `memory/project-sms-inbound-spam-flagging.md`
- **`provisionTenantTwilio` callable** — Subaccount + secret + Firestore write. Skip until host site is further along.
  - Source: `memory/project-saas-provisioning-host-site.md`
- **A2P 10DLC brand/campaign approval handling in provisioning UI** — Must handle "pending approval" state, can't assume `subaccount.create OK` = ready to send.
  - Source: `memory/project-saas-provisioning-host-site.md`
- **QBP vendor catalog ingestion** — Chrome extension supports adding QBP items via the same UI as JBI (2026-06-02), but no QBP catalog feed exists yet. Backend `addJBIItemToVendorOrder` looks up `vendor_catalogs/qbp/items/<id>` on cadence-pos RTDB and gracefully falls back to "no match" / scraped page cost only. Until a catalog feed lands: QBP items show with `vendorItemID` as the name, the page-scraped cost (no inventory match), and `lookupStatus: "no_match"`. Need: (a) decide on feed source (QBP FTP feed parity with JBI inv_mast.txt, vs scraper, vs QBP API if available), (b) Cloud Run Job mirror of `jobs/vendor-catalog-jbi/` keyed to QBP's product taxonomy, (c) per-vendor `buildInventoryItemFromQbpCatalog` mapping in `functions/saas/chrome-extension-callables.js` to enable auto-create on add (currently JBI-only). Once those land, the extension Just Works — no extension-side changes needed.

---

## Pending Multi-Phase Plans

### Tenant Provisioning Refactor (6 phases, Phase 1 done)

- [ ] Phase 2 — Readers migration. Update `tenant.subscriptionTierID` / `tenant.stripeSubscriptionPriceID` readers to read from store doc. Locations:
  - `functions/saas/auth-claims.js` `buildTenantSummary` (~lines 810-820, 893)
  - `functions/saas/billing-helpers.js` line ~123 `readSubscriptionStatus`
  - `functions/saas/stripe-billing.js` lines 263, 330, 382 (sub-create / tier-change → SubscriptionItems per store; rename `changeTenantTier` → `changeStoreTier`)
  - `dashboard/src/screens/TenantDetailScreen.jsx` lines 721, 749, 2325, 2389 (per-store rendering)
  - `src/screens/screen_components/modal_screens/BillingModalScreen/BillingModalScreen.jsx` lines 162, 183 (owner read-only tier table)
- [ ] Phase 3 — Email button on `CreateTenantForm.jsx` success view, posts sign-in link via `noreply@` SMTP (callable).
- [ ] Phase 4 — `/welcome` onboarding route in `src/App.js` (cadence-pos). Stripped chrome; collects store ops fields + Stripe payment method + owner password. Single-page vs wizard TBD.
- [ ] Phase 5 — Owner-side callables: `ownerCompleteStoreSetupCallable`, `ownerSetPasswordCallable`. Payment method flow reuses existing `stripe-billing.js`.
- [ ] Phase 6 — App-entry gating. `isStoreSetupComplete(store)` selector in `src/stores.js`; force redirect to `/welcome` until setup + payment method present.
- [ ] Deferred until Phase 5 — slim `dashboard/src/screens/AddStoreForm.jsx` and `platformAdminCreateStoreCallable` (drop `useStoreAddressFields` phone/tax).
- Source: `memory/project-tenant-provisioning-refactor-wip.md`

### SaaS Stripe Connect + Pub/Sub (10 phases, Phases 0-9 backend complete)

- [ ] Phase 10 — Live mode flip. After Stripe Connect platform approval in live mode: create live webhook endpoint, update Cloud Function secrets, point production tenants at live mode.
- [ ] Application fee structure (per-sale %, flat, none) — deferred indefinitely; revisit when pricing decisions land.
- Source: `memory/refactor-plan-saas-stripe-connect-pubsub.md`

### SaaS Stripe Billing (Phase 3 backend)

- [ ] Manual Stripe Dashboard setup — webhook endpoint (Product + first Price already done).
- [ ] Set `STRIPE_BILLING_WEBHOOK_SECRET`.
- [ ] Code `billing-tiers.js` CRUD callables.
- [ ] Code `stripe-billing.js` (9 callables — customer, setup intent, sub create, change tier, PMs, invoices, cancel).
- [ ] Code `stripe-billing-webhook.js` (HTTP function + sync writes).
- [ ] Code `pubsub-billing-subscriber.js` (enrichment + DLQ).
- [ ] Extend `billing-helpers.js` with `getTierDoc` + `getSubscriptionStatus`.
- [ ] Extend `auth-claims.js` to require `subscriptionTierID` on monthly_sub tenant create.
- [ ] Export everything in `firebase-index.js`.
- [ ] Provision Pub/Sub topic `stripe-billing-events`.
- [ ] Deploy all new functions.
- [ ] Dashboard UI: `BillingTiersScreen`, update `CreateTenantForm`, update `TenantDetailScreen`.
- [ ] Seed first tier via UI ("Basic", `price_xxx`, monthlyAmount 5000, sortOrder 0).
- [ ] Smoke test (test tenant create → attach card → force-fail invoice → pay → change tier).
- [ ] No bulk tier-migration tool — bulk re-tiering deferred.
- Source: `memory/refactor-plan-saas-stripe-billing.md`

### SaaS Auth Claims

- [ ] Phase 5 — Bonita migration script. Gated on go-to-market.
- Source: `memory/project-auth-claims-design.md`

### cadence-dashboard Twilio UI

- [ ] (f) Port-in — deferred.
- [ ] (g) A2P brand/campaign link.
- Source: `memory/project-cadence-dashboard-twilio-ui.md`

---

## Pending Refactor Plans

- **Navigation + Preview + Multi-Tab refactor** — `navigateTo()` state machine, `selectResolvedWorkorder` selectors, BroadcastChannel multi-tab detection. Multi-tab issue can be deferred (independent).
  - Source: `memory/refactor-plan-navigation-preview-multitab.md`
- **Design Token System refactor — Phase 7b color migration** — 957 raw color refs remaining across 119 files. Conservative/opportunistic policy.
  - 30 not-yet-touched CSS modules (see "Remaining CSS modules" list in handoff doc).
  - 16 modules with residual intentional refs to verify.
  - ~93 JS files in long tail (only migrate raw hex/rgb, leave `gray()`).
  - Source: `memory/handoff-design-tokens-phase7b.md`
- **Design Tokens — Phase 1 audit follow-up**
  - [ ] Phase 2 — propose final token vocabulary using audit data.
  - [ ] Open questions list reviewed before Phase 2 kicks off.
  - [ ] `--overlay-scrim` token (currently inlined as `rgba(0,0,0,0.6)` etc.) — audit pending.
  - Source: `memory/audit-design-tokens-phase1.md`

---

## Pre-Launch Work

### Gmail Integration

- [ ] Signatures — storage path dropped storeID segment in refactor; old signature images are orphaned in Storage (user will re-upload later).
- [ ] Orphan cleanup — old per-store `email-auth`, `email-accounts`, `email-lookup` docs from pre-refactor paths.
- Source: `memory/project-gmail-integration.md`

### Twilio Support Ticket (filed 2026-05-31, 4 open items)

- [ ] RI Identity Document API.
- [ ] HostedNumberOrder transition graph.
- [ ] Cross-account A2P refs.
- [ ] Hosted Phone Numbers API status.
- Holds related build work until answered.
- Source: `memory/project-twilio-support-ticket-pending.md`

### JBI Specs Cron Rollout

- [ ] Create the Cloud Scheduler entry for `vendor-catalog-jbi-specs` on GCP — Cloud Run Job invocation with `JBI_MODE=specs`, cron `30 5 * * *`, TZ `America/New_York`. Mirror the master/inventory setup pattern (invoker SA already has `roles/run.invoker` on the namespace, no new IAM needed). Once created, the next 10-min sync picks it up — or hit `platformAdminSyncScheduledJobsCallable` to force.
- [ ] Verify the master + inventory basenames in `functions/saas/vendor-catalog-jobs.js`. Seeded as `vendor-catalog-jbi-master` and `vendor-catalog-jbi-inventory` based on the specs convention; if GCP uses different names, those entries won't enrich and the dashboard renders them bare. Check mirror after first sync and fix if so.


---

## Documentation / Decisions TBD

- **`--border-subtle` dark-mode value** — currently `var(--gray-700)` (TBD) in `docs/design-tokens.md:145`. Verify or finalize.
- **DOM_MIGRATION_PLAN — Phase 1 decisions needed**
  - [ ] `react-window` vs `react-virtuoso` for `VirtualList`.
  - [ ] Animation library — pure CSS transitions vs Framer Motion.
  - Source: `DOM_MIGRATION_PLAN.md:62-63`
- **Transactional email provider (Postmark/Resend/SendGrid)** — TBD; gated on LLC depending on provider.
  - Source: `memory/project-saas-email-architecture.md`, `memory/project-rss-llc-blocker.md`
- **SMS settings UI location** — auto-bounceback setting placement TBD.
  - Source: `memory/project-sms-auto-bounceback-setting.md`
- **Welcome route layout** — single-page vs wizard TBD for `/welcome` (Phase 4 of tenant provisioning refactor).
  - Source: `memory/project-tenant-provisioning-refactor-wip.md:55`
- **Live mode rollout cadence** — TBD; after test mode end-to-end is solid.
  - Source: `memory/refactor-plan-saas-stripe-connect-pubsub.md:540`
- **Tenant setup doc sweep design** — scheduled function vs Firestore TTL field, retention duration, orphaned-artifact cleanup contract.
  - Source: `memory/project-tenant-setup-sweep.md`
- **SMS inbound spam flagging signals** — which signal(s) drive the flag, and whether unflagged-but-suspicious messages are still recorded for analytics.
  - Source: `memory/project-sms-inbound-spam-flagging.md`

---

## Out-of-Scope Cleanups (not blocking, noted for future)

- Bonita string fallbacks in `src/shared/printBuilder.js`, `intakeReceiptPdf.js`, `saleReceiptPdf.js` — convert to neutral defaults in a future pass.
- Hardcoded Twilio default `+12393171234` referenced in code comments — needs separate audit of SMS callable.
- Source: `memory/project-tenant-bootstrap-wip.md:148-152`
