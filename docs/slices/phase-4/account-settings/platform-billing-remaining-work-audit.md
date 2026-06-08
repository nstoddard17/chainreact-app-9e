# 4.PLATFORM-BILLING-REMAINING-WORK-AUDIT-1 — Pre-Live-Test Remaining Work Audit

**Type:** Planning / audit only. **No source, migrations, tests, UI, env files, Stripe
dashboard, or behavior changed in this slice. Nothing pushed.**
**Date:** 2026-06-07
**Branch:** `builder-ui-v1-audit-1`

**Source of truth (verified current state — each file/doc was read for this audit):**
[services/billing/billingFeatureFlags.ts](../../../../services/billing/billingFeatureFlags.ts) (`ENABLE_PLATFORM_BILLING`, default OFF) ·
[services/billing/platformStripeClient.ts](../../../../services/billing/platformStripeClient.ts) (`STRIPE_SECRET_KEY`, lazy server-only) ·
[services/billing/platformStripePrices.ts](../../../../services/billing/platformStripePrices.ts) (`STRIPE_PRICE_PRO/TEAM/BUSINESS`) ·
[services/billing/platformBillingSessions.ts](../../../../services/billing/platformBillingSessions.ts) (checkout + portal, `NEXT_PUBLIC_APP_URL`) ·
[services/billing/stripeBillingWebhook.ts](../../../../services/billing/stripeBillingWebhook.ts) (verify → dedup → sync; `STRIPE_BILLING_WEBHOOK_SECRET`) ·
[services/billing/personalPlan.ts](../../../../services/billing/personalPlan.ts) ·
[integrations/_shared/stripe/webhooks/signature.ts](../../../../integrations/_shared/stripe/webhooks/signature.ts) (300s replay tolerance) ·
[app/api/accounts/[id]/billing/checkout/route.ts](../../../../app/api/accounts/[id]/billing/checkout/route.ts) · [portal/route.ts](../../../../app/api/accounts/[id]/billing/portal/route.ts) · [personal/route.ts](../../../../app/api/accounts/[id]/billing/personal/route.ts) ·
[app/api/webhooks/stripe-billing/route.ts](../../../../app/api/webhooks/stripe-billing/route.ts) ·
[core/billing/planPolicy.ts](../../../../core/billing/planPolicy.ts) (tiers + limits; Pro task cap 1,000 vs Free 100 since CS-PRO-2) ·
[features/account/BillingSection.tsx](../../../../features/account/BillingSection.tsx) · [PersonalUpgradePanel.tsx](../../../../features/account/PersonalUpgradePanel.tsx) · [ManageBillingButton.tsx](../../../../features/account/ManageBillingButton.tsx) · [PersonalPlanPanel.tsx](../../../../features/account/PersonalPlanPanel.tsx) · [BusinessUpgradePanel.tsx](../../../../features/account/BusinessUpgradePanel.tsx) · [CheckoutChoiceButton.tsx](../../../../features/account/CheckoutChoiceButton.tsx) ·
[lib/api/billingCheckout.ts](../../../../lib/api/billingCheckout.ts) (`startCheckout` / `startBillingPortal`) ·
`.env.example` (lines 14–26 Stripe vars; line 126 `NEXT_PUBLIC_APP_URL=http://localhost:3000`) ·
docs: [billing-plan-metadata-closeout.md](./billing-plan-metadata-closeout.md) · [platform-billing-go-live-checklist.md](./platform-billing-go-live-checklist.md) · [plan-metadata-stripe-billing-plan.md](./plan-metadata-stripe-billing-plan.md) · [personal-pro-team-choice-plan.md](./personal-pro-team-choice-plan.md) · [business-upgrade-plan.md](./business-upgrade-plan.md).

**Arc commits referenced:** closeout `dd0c616c7` · go-live checklist `c540eedb1` · Personal Free → Pro + Manage Billing UI `853c26390` · go-live docs update `87c16f40d`.

> **Audit, not a runbook.** Every "shipped" claim is verified against a file read this
> session; every "remaining" item is classified by the rules below. This doc implements
> nothing.

> **Update (2026-06-07, docs-only):** §5.A ("Personal Pro grants no extra capacity") is now
> **RESOLVED**. Two slices shipped after this audit: `03f4ef3b8` (CS-PRO-1 — `ENABLE_PERSONAL_PRO`
> dark-launch gate, default OFF, gating the UI **and** the checkout route's acceptance of
> `plan="pro"`) and `8ebaa44d1` (CS-PRO-2 — Pro now grants **1,000 monthly tasks** vs Free's
> **100**, applied to `account_billing.tasks_limit` by the verified billing webhook on personal
> Pro activation; personal `subscription.deleted` resets it to Free). **Personal Pro is no longer
> a no-value tier**, but it **remains dark** behind `ENABLE_PERSONAL_PRO` (default OFF) until
> Marcus deliberately enables it. Team/Business unaffected; folder/member differentiation for Pro
> stays deferred. The §4 production-launch decision on Pro value is satisfied; the remaining
> blockers are now env/config/manual-test (see §3, §8, §9) plus the deliberate flag flip(s).

**Classification rules (as given):**
- **Pre-live-test blocker** — manual Stripe testing cannot be *meaningfully run* without it.
- **Production-launch blocker** — test mode can proceed, but real users should not get billing yet.
- **Product-completeness** — important, not necessarily launch-blocking.
- **UX polish** — improves clarity, does not block correctness.
- **Deferred** — intentionally not part of this launch path.

---

## 1. Summary

The platform billing foundation **and** its Account Settings UI are now code-complete and
fully dark behind `ENABLE_PLATFORM_BILLING` (default OFF). **No code work is required to
begin dev/test-mode Stripe testing** — what remains before a live test is purely
**environment / Stripe-dashboard configuration** (keys, prices, webhook endpoint) plus the
deliberate flag flip *in a test environment*. Before **production launch**, the gates are:
live-mode config, a clean pass of the manual test-mode scenarios, a per-environment
migration confirmation, and an explicit product decision on the remaining gap — **no
Business→Team downgrade / revert-on-cancel** (the former "Personal Pro grants no extra
capacity" gap is now **resolved** — Pro grants 1,000 monthly tasks via CS-PRO-2, still dark
behind `ENABLE_PERSONAL_PRO`). Everything else (Enterprise, per-seat, metered overage, annual/trials, full
pricing table, support tooling, billing audit notifications) is correctly deferred.

**Bottom line:** *Ready to dev-test after config.* *Not ready for real-user launch* until
the two product decisions are made and test-mode scenarios pass.

---

## 2. Current shipped billing capabilities (verified)

| Capability | Where | State |
|---|---|---|
| Plan metadata (`free/pro/team/business/enterprise` + status) | `account_billing` (CS-1) | Shipped |
| Central plan policy (caps per tier) | [planPolicy.ts:48-54](../../../../core/billing/planPolicy.ts) | Shipped — **Pro task cap 1,000** vs Free 100 (CS-PRO-2); member/folder still match Free |
| Stripe attachment columns + lazy server-only client | CS-2 / [platformStripeClient.ts](../../../../services/billing/platformStripeClient.ts) | Shipped |
| Price config resolver (env-driven, no hardcoded ids) | [platformStripePrices.ts](../../../../services/billing/platformStripePrices.ts) | Shipped |
| Checkout + Customer Portal routes (owner/admin, flag-gated, freeze-rejecting, `{url}`-only) | CS-3 / checkout+portal routes | Shipped |
| Signature-verified, deduped billing webhook (sole plan/status authority) | CS-4 / [stripeBillingWebhook.ts](../../../../services/billing/stripeBillingWebhook.ts) | Shipped |
| Warn-first lifecycle (past_due/canceled warn, never block) + downgrade-validation rule | CS-5 | Shipped |
| Personal Pro cancel-at-period-end (backend + `PersonalPlanPanel` UI) | PPT-1/PPT-3 | Shipped |
| Pre-checkout Personal-Pro choice dialog | PPT-4 / `CheckoutChoiceButton` | Shipped |
| **Personal Free → Pro upgrade UI** | `853c26390` / `PersonalUpgradePanel` | Shipped |
| **Manage Billing portal UI** | `853c26390` / `ManageBillingButton` | Shipped |
| Team → Business upgrade end-to-end (UI button → checkout metadata → verified webhook → atomic type+plan RPC) | BU-1..BU-4 | Shipped |
| Personal `subscription.deleted` → revert to Free + reset cap | CS-4 webhook personal branch | Shipped |

**Automated test coverage exists** for all of the above (route, service, repository,
migration, gated-DB, and UI suites under `tests/unit/**/billing*`, `tests/unit/features/account/*`,
`tests/integration/billing/*`). What is *not* yet done is **manual live/test-mode validation
against a real Stripe account** — that is the gap this audit is about.

---

## 3. Pre-live-test blockers

These must be in place or **manual Stripe testing cannot meaningfully run**. All are config,
not code. (Failure modes verified from the route/service files.)

1. **`STRIPE_SECRET_KEY` (test mode) set** — else every Stripe call throws
   `PlatformStripeConfigError` → routes **503**; no checkout, portal, or cancel can run.
2. **`STRIPE_BILLING_WEBHOOK_SECRET` (test mode) set** — else the webhook fails closed (**500
   `not_configured`**) and **plan/status never sync**, so a "successful" checkout never
   becomes Pro. For local, `stripe listen --forward-to localhost:3000/api/webhooks/stripe-billing`
   prints the secret to use.
3. **`STRIPE_PRICE_PRO` / `STRIPE_PRICE_TEAM` / `STRIPE_PRICE_BUSINESS` (test mode) set** —
   else checkout for that tier returns **503 `PRICE_NOT_CONFIGURED`** (verified
   `resolvePlanPrice().missing`).
4. **Stripe test-mode products/prices exist** in the platform account, and the price ids above
   point at them (same mode as the secret key).
5. **Customer Portal activated** in the Stripe dashboard (Settings → Billing → Customer portal)
   — else `POST /v1/billing_portal/sessions` fails and "Manage billing" 500s even when
   everything else is correct.
6. **Webhook endpoint reachable** — registered endpoint (or `stripe listen`) so
   `checkout.session.completed` + `customer.subscription.*` actually reach the route.
7. **`ENABLE_PLATFORM_BILLING=true` in the dev/test env only** — else all three billing
   routes 404 and the UI controls are hidden (verified `if (!isPlatformBillingEnabled()) return notFound()`
   in all three routes; UI gates in `BillingSection`). This is the *test-enabling* flip, not
   the production flip.

> **`NEXT_PUBLIC_APP_URL`** is **not** a hard pre-live-test blocker for *local* dev (it
> defaults to `http://localhost:3000`, which works for a local round-trip) but **is** required
> (real URL) for staging/prod redirect correctness — see §8.

---

## 4. Production-launch blockers

Test mode can proceed without these, but **real users must not get billing** until:

1. **Live-mode config, mode-matched:** live `STRIPE_SECRET_KEY`, live `STRIPE_BILLING_WEBHOOK_SECRET`,
   live `STRIPE_PRICE_*`, all from the same (live) Stripe mode. A live key with a test price id
   fails silently at Stripe.
2. **Live webhook endpoint registered** at `{prod}/api/webhooks/stripe-billing` with the four
   events (§9) and the live signing secret.
3. **Real `NEXT_PUBLIC_APP_URL`** = the production domain (redirect/return URLs).
4. **Migrations confirmed applied to the prod DB** — the four arc migrations are *doc-asserted*
   applied (closeout §5); that claim is **not verifiable from code** and must be re-confirmed per
   environment (see Risk R9).
5. **A clean pass of the §10 manual test-mode scenarios** on dev **and** staging.
6. **~~Product decision on Personal Pro value (see §5.A).~~ RESOLVED (CS-PRO-2, `8ebaa44d1`).**
   Pro now grants a real benefit — **1,000 monthly tasks** vs Free's 100. It also stays dark
   behind `ENABLE_PERSONAL_PRO` (CS-PRO-1) until deliberately enabled, so the launch can ship
   Team/Business first and turn Pro on only after its test-mode validation. No longer a blocker.
7. **Product decision on Business→Team downgrade / revert-on-cancel (see §5.B).** Acceptable to
   launch *with manual handling*, but must be a conscious decision, not a surprise.
8. **The deliberate `ENABLE_PLATFORM_BILLING=true` flip in production** — the final switch,
   after 1–7.

---

## 5. Product-completeness gaps

### A. ~~Personal Pro grants no extra capacity~~ — RESOLVED (CS-PRO-2, `8ebaa44d1`)
**Status at audit time:** `PLAN_LIMITS.pro === PLAN_LIMITS.free` (100 tasks) — Pro granted nothing.
**Now:** `PLAN_LIMITS.pro.taskLimit` is **1,000** (Free stays 100); member/folder caps still match
Free ([planPolicy.ts:48-54](../../../../core/billing/planPolicy.ts)). The billing webhook sets
`account_billing.tasks_limit` from policy on a verified personal Pro activation, and resets it to
Free on `subscription.deleted` ([stripeBillingWebhook.ts](../../../../services/billing/stripeBillingWebhook.ts)).
The `PersonalUpgradePanel` copy now states the real benefit (sourced from policy). Pro **remains
dark** behind `ENABLE_PERSONAL_PRO` (CS-PRO-1, default OFF) until deliberately enabled. Folder/member
differentiation for Pro stays deferred (would need the `folderLimitFor`/`memberLimitFor` stored-plan
rewire — F3).

### B. No Business→Team downgrade / no team-org revert-on-cancel (elevated)
The webhook's `customer.subscription.deleted` reverts **only personal** accounts to Free;
**team/organization keep their plan + type** (verified [stripeBillingWebhook.ts:192-204](../../../../services/billing/stripeBillingWebhook.ts)
— the personal-only branch). `evaluateDowngrade('team')` exists as a *gate* but no downgrade
*flow* is built. Consequence: a churned Business customer keeps Business caps (25/250)
indefinitely without paying (Risk R3). *Recommendation:* product-completeness — launchable
**with explicit manual-via-dashboard handling** at launch; build the flow (Track B) soon after.

### C. Payment-failure enforcement (acceptable as-is)
`past_due` warns and keeps workflows running, by decision. Product-completeness, not a blocker.

---

## 6. UX polish gaps

- **No full pricing / plan-comparison table** — the upgrade is a single honest button, not a
  grid. Fine for launch.
- ~~**Personal upgrade copy is benefit-free**~~ — RESOLVED (CS-PRO-2): the copy now states
  "1,000 monthly tasks (up from 100 on Free)", sourced from policy.
- **Manage billing edge:** a personal account reverted to Free that still has a stale
  `currentPeriodEnd` would still show "Manage billing" — benign (the Stripe customer persists,
  the portal genuinely works), but slightly surprising. Polish only.

---

## 7. Deferred / non-blocking items (intentional)

- **Enterprise / contact-sales** — no price id; not online-purchasable by design.
- **Per-seat billing** — account-level billing only at launch.
- **Metered usage / overage** — fixed per-tier task caps (Free 100 / Pro 1,000 / Team/Business
  100), no pay-as-you-go; the separate reserve/reconcile track (`ENABLE_RESERVE_RECONCILE_BILLING`)
  is unrelated and not wired.
- **Annual pricing / trials** — single monthly price per tier (resolver is single-price-per-tier).
- **Customer-support / admin billing tools** — corrections via Stripe dashboard.
- **Billing-specific audit notifications** — not in this arc.

---

## 8. Env / config checklist

| Var | Mode | Pre-live-test | Prod-launch | Missing behavior (verified) |
|---|---|---|---|---|
| `STRIPE_SECRET_KEY` | test → live | ✅ (test) | ✅ (live) | 503 on all Stripe calls |
| `STRIPE_BILLING_WEBHOOK_SECRET` | test → live | ✅ (test/`stripe listen`) | ✅ (live) | 500 fail-closed; plan never syncs |
| `STRIPE_PRICE_PRO` | test → live | ✅ (if testing Pro) | ✅ (if launching Pro) | 503 `PRICE_NOT_CONFIGURED` |
| `STRIPE_PRICE_TEAM` | test → live | ✅ (if testing Team) | ✅ (if launching Team) | 503 `PRICE_NOT_CONFIGURED` |
| `STRIPE_PRICE_BUSINESS` | test → live | ✅ (if testing Business) | ✅ (if launching Business) | 503 `PRICE_NOT_CONFIGURED` |
| `NEXT_PUBLIC_APP_URL` | — | ⚠ localhost OK local | ✅ real prod domain | wrong redirect/return URLs |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | test → live | optional | optional | unused by inspected server paths (redirect flow) |
| `ENABLE_PLATFORM_BILLING` | per-env | ✅ ON in dev/test only | ✅ ON in prod = final flip | routes 404, UI hidden |

**Mode-match invariant:** secret key, webhook secret, and all price ids must be from the
**same** Stripe mode. All Stripe vars are present-but-blank in `.env.example` today.

---

## 9. Stripe dashboard checklist

- [ ] Acting in the **platform** Stripe account (NOT the workflow-provider Connect app
      `STRIPE_CLIENT_ID`/`STRIPE_CLIENT_SECRET` — they must never be conflated; verified
      [platformStripeClient.ts:8-17](../../../../services/billing/platformStripeClient.ts)).
- [ ] One Product per paid tier (Pro / Team / Business); one recurring monthly Price each;
      copy ids into `STRIPE_PRICE_*` for the matching mode. **No** Enterprise price.
- [ ] **Customer Portal activated** (enable cancel + update-payment-method).
- [ ] Webhook endpoint registered at `{NEXT_PUBLIC_APP_URL}/api/webhooks/stripe-billing`
      (NOT `/api/webhooks/stripe`), one endpoint per mode, with the four events (below) and the
      matching `whsec_…` copied into `STRIPE_BILLING_WEBHOOK_SECRET`.

**Required webhook events** (verified `resolveEvent` switch — anything else is recorded +
`ignored`): `checkout.session.completed`, `customer.subscription.created`,
`customer.subscription.updated`, `customer.subscription.deleted`.

---

## 10. Manual test scenarios still needed

Run in **test mode** (test card `4242 4242 4242 4242`). None are automated — these are the
human round-trips that the unit/integration suites cannot cover.

1. **Personal Free → Pro** via the "Upgrade to Pro" button → Stripe → pay → redirect →
   webhook sets `plan=pro`, `plan_status=active`.
2. **Team paid checkout** (if launching paid Team) → `plan=team`, `active`.
3. **Team → Business upgrade** via "Upgrade to Business" → webhook flips `accounts.type`→
   organization + `plan`→business atomically; caps rise to 25/250; labeled "Business".
4. **Manage Billing portal** → opens portal; cancel / update-card render; reflects back via
   `subscription.updated`. With no subscription the button is hidden / route 409.
5. **Personal Pro cancel-at-period-end** (set + undo) → only the Stripe flag changes; synced
   back via `subscription.updated`; at period end personal reverts to Free + cap reset.
6. **Webhook integrity:** valid → 200 `processed`; bad/absent signature → 400; >300s stale →
   400 `expired`; resend same event id → 200 `deduped` with one state change; unknown
   account/metadata → 200 `ignored`, no write.
7. **Forged upgrade metadata** (`stripe trigger` with mismatched `targetAccountType`) → no type
   escalation (RPC re-validates).
8. **Flag-off oracle:** with the flag off, all three routes 404 and UI controls hidden.

---

## 11. Risk register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | **Mode mismatch** (live key + test price, or cross-mode webhook secret) | Med | High (silent Stripe failure) | Same-mode invariant (§8); verify in dashboard |
| R2 | **Wrong/cross-mode webhook secret** → events 400/500 → user pays, never gets Pro | Med | High | Watch endpoint delivery + 400/500 rate during test (§10.6) |
| R3 | **Business cancel never reverts plan/type** → churned customer keeps Business caps free | Med | Med (revenue leak) | Manual dashboard handling at launch; build Track B (§5.B) |
| R4 | Forged upgrade metadata escalates account type | Low | High | **Already mitigated** — `apply_business_upgrade` RPC re-validates team + not-frozen |
| R5 | ~~**Charging for Personal Pro that grants nothing**~~ — RESOLVED (CS-PRO-2) | — | — | Pro grants 1,000 monthly tasks (vs Free 100); still dark behind `ENABLE_PERSONAL_PRO` until enabled |
| R6 | `currentPeriodEnd` not cleared on personal delete → Manage billing shows for reverted-free personal | Low | Low (benign) | Polish only (§6) |
| R7 | Retry replays session-scoped side effects (foundation Q4) | Low | Low/Med | Out of UI scope; covered by foundation idempotency design |
| R8 | `NEXT_PUBLIC_APP_URL` left at localhost in prod → broken redirects | Med | High | Env checklist (§8); part of prod-launch gate |
| R9 | **Migrations "applied" is doc-asserted, not code-verifiable** | Med | High (if prod missed one) | Re-confirm the four migrations exist in the target DB before flip (§4.4) |
| R10 | Customer Portal not activated in dashboard → "Manage billing" 500s | Med | Med | Dashboard checklist (§9) |

---

## 12. Recommended next implementation slices

**No code slice is required before live testing.** Ordered by what's most valuable after the
dev dry-run:

1. **(No-code) Dev test-mode dry run** — execute §3 + §9 + §10 in dev. *This is the actual next
   action.* Surfaces real bugs that no unit test can.
2. ~~**`4.PLATFORM-BILLING-PRO-VALUE-1`**~~ — **DONE**: CS-PRO-1 (`03f4ef3b8`, dark-launch flag)
   + CS-PRO-2 (`8ebaa44d1`, 1,000-task Pro benefit). §5.A resolved; Pro dark until enabled.
3. **`4.PLATFORM-BILLING-BUSINESS-DOWNGRADE-1`** (Track B) — Business→Team downgrade flow +
   team/org revert-on-cancel, reusing `evaluateDowngrade('team')`. Closes R3.
4. **Bug-fix micro-slices** for anything the dev dry-run finds (smallest possible).
5. Later/deferred: pricing table (UX), payment-failure policy, Enterprise, overage, annual.

---

## 13. Recommended order of operations

1. Set **test-mode** env vars + create test products/prices + **activate Customer Portal** +
   register webhook (or `stripe listen`).
2. Flip `ENABLE_PLATFORM_BILLING=true` **in dev only**.
3. Run the §10 manual scenarios in dev.
4. Fix any bugs found (small slices).
5. **Decide §5.A (Pro value) and §5.B (Business downgrade policy).**
6. Repeat §10 on **staging** (test mode, staging `NEXT_PUBLIC_APP_URL`).
7. Set **live-mode** env vars + live webhook endpoint; **confirm the four migrations on the prod
   DB** (R9).
8. Flip `ENABLE_PLATFORM_BILLING=true` **in production** — the final gate.

---

## 14. Acceptance criteria — "ready to live test"

- [ ] Test-mode `STRIPE_SECRET_KEY`, `STRIPE_BILLING_WEBHOOK_SECRET`, and the relevant
      `STRIPE_PRICE_*` set and mode-matched.
- [ ] Test-mode products/prices created; Customer Portal activated.
- [ ] Webhook endpoint reachable (registered or `stripe listen`) with the four events.
- [ ] `ENABLE_PLATFORM_BILLING=true` in the dev/test env only — **and `ENABLE_PERSONAL_PRO=true`
      too if exercising the Free → Pro flow** (both default OFF; Pro is gated by the second flag).
- [ ] (Local) `NEXT_PUBLIC_APP_URL` default OK, or set for staging.
- [ ] No code changes needed — the UI + routes + webhook are already in place (incl. the Pro
      task-cap benefit + dark-launch gate, CS-PRO-1/2).

## 15. Acceptance criteria — "ready to launch"

- [ ] All §14 satisfied in **live** mode (mode-matched), real `NEXT_PUBLIC_APP_URL`.
- [ ] §10 manual scenarios pass on dev **and** staging (test mode).
- [ ] The four migrations confirmed applied to the **prod** DB (R9).
- [x] §5.A resolved — Pro grants a real benefit (1,000 monthly tasks, CS-PRO-2) **and** stays
      dark behind `ENABLE_PERSONAL_PRO` until deliberately enabled.
- [ ] §5.B decided — Business downgrade handled (manually accepted or flow built).
- [ ] Risk register R1/R2/R8/R10 mitigations verified in prod config.
- [ ] A **final full local baseline** (`npx jest`, typecheck, lint, lint:structure,
      lint:migrations) run green at the launch commit — **not run in this audit** (docs-only).
- [ ] Deliberate `ENABLE_PLATFORM_BILLING=true` flip in production performed last.

---

## 16. Hard boundaries (what this slice did NOT do)

- No source, migration, test, UI, or schema change.
- No env file edited; no Stripe dashboard action taken.
- `ENABLE_PLATFORM_BILLING` left default OFF; no flag flipped.
- No git push. Docs-only local commit.

---

## 17. Verification performed for this audit

- `npm run lint:structure` → **OK** (run this session — no files added/moved, run for hygiene).
- Doc grep for stale "not wired / not mounted / no UI mount" billing caveats → **clean** on the
  go-live path (the only matches are the resolved/strikethrough items in the closeout + the
  go-live update banner; other "coming soon" hits are historical planning docs or the unrelated
  reserve/reconcile track).
- **Full `npx jest` NOT run** — this is a docs-only audit with zero source changes; the inherited
  automated baseline is the UI slice's (`853c26390`: focused billing-UI 75 / route 40 / broader
  account+lib+billing 517 passed; typecheck clean; lint 0 errors) and the foundation closeout's
  BU-4 numbers. Not re-measured here.

**Migrations:** four arc migrations doc-asserted applied (R9 — confirm per environment).
**Flag:** `ENABLE_PLATFORM_BILLING` default **OFF**.

---

## 18. Recommended next step

**Execute the dev test-mode dry run (§13 steps 1–3)** — no code required. It is the highest-
leverage next action and will tell us whether any micro-fix slices are needed before the §5.A
(Pro value) and §5.B (Business downgrade) decisions gate a production launch.

**Doc path:** `docs/slices/phase-4/account-settings/platform-billing-remaining-work-audit.md`.
**Docs-only. Nothing pushed.**
