# 4.PLATFORM-BILLING-PRO-VALUE-1 — Personal Pro Value / Launch Decision Plan

> **SUPERSEDED (2026-06-17, PRICING-LOCK-1):** the 1,000-task Pro cap discussed below was raised.
> Locked launch caps are Pro 2,000 / Team 7,500 / Business 25,000 monthly tasks (Pro folders also
> raised to 25). The canonical reference is now
> [docs/billing/pricing-and-tiers.md](../../../billing/pricing-and-tiers.md); this doc is kept as a
> historical planning record.

**Type:** Planning / design only. **No source, migrations, tests, UI, env, Stripe, or
behavior changes in this slice. Nothing pushed.**
**Date:** 2026-06-07
**Branch:** `builder-ui-v1-audit-1`

**Source of truth (verified current state — each file read this session):**
[core/billing/planPolicy.ts](../../../../core/billing/planPolicy.ts) (`PLAN_LIMITS`, `ALLOWED_PLANS_BY_TYPE`, `defaultPlanForAccountType`) ·
[core/billing/downgradeRules.ts](../../../../core/billing/downgradeRules.ts) (`evaluateDowngrade` — members + folders only) ·
[services/accounts/memberLimits.ts](../../../../services/accounts/memberLimits.ts) (`memberLimitFor` — type-default keyed) ·
[services/workflowFolders/folderLimits.ts](../../../../services/workflowFolders/folderLimits.ts) (`folderLimitFor` — type-default keyed) ·
[services/billing/platformStripePrices.ts](../../../../services/billing/platformStripePrices.ts) (`STRIPE_PRICE_PRO/TEAM/BUSINESS`) ·
[services/billing/stripeBillingWebhook.ts](../../../../services/billing/stripeBillingWebhook.ts) (`tasks_limit` writers) ·
[repositories/accountBilling.ts](../../../../repositories/accountBilling.ts) (`tasks_limit` patch + upgrade RPC) ·
[features/account/PersonalUpgradePanel.tsx](../../../../features/account/PersonalUpgradePanel.tsx) · [BillingSection.tsx](../../../../features/account/BillingSection.tsx) (Pro upgrade gate) ·
[app/api/accounts/[id]/billing/checkout/route.ts](../../../../app/api/accounts/[id]/billing/checkout/route.ts) (`plan: pro|team|business` accepted) ·
[services/billing/billingFeatureFlags.ts](../../../../services/billing/billingFeatureFlags.ts) (`ENABLE_PLATFORM_BILLING`; **no `ENABLE_PERSONAL_PRO` exists**) ·
[services/apiKeys/flags.ts](../../../../services/apiKeys/flags.ts) (`ENABLE_PUBLIC_API_KEYS`, default OFF) · [core/apiKeys/rateLimitPolicy.ts](../../../../core/apiKeys/rateLimitPolicy.ts) (API-key rate tiers, not plan-keyed) ·
parent audit: [platform-billing-remaining-work-audit.md](./platform-billing-remaining-work-audit.md) (§5.A).

**Arc commits referenced:** UI slice `853c26390` · remaining-work audit `84b287a58`.

> **Decision plan, not implementation.** Every "today it works like X" is verified against a
> file; every "we should do Y" is a labeled recommendation. This doc changes nothing.

> **Update (2026-06-07 — IMPLEMENTED):** the recommendation in this plan has shipped.
> **CS-PRO-1** (`03f4ef3b8`) added the `ENABLE_PERSONAL_PRO` dark-launch flag (default OFF),
> gating the `PersonalUpgradePanel` UI **and** the checkout route's acceptance of `plan="pro"`.
> **CS-PRO-2** (`8ebaa44d1`) gave Pro its first real benefit: `PLAN_LIMITS.pro.taskLimit` is now
> **1,000** (Free stays 100), applied to `account_billing.tasks_limit` by the verified billing
> webhook on personal Pro activation (reset to Free on `subscription.deleted`); the upgrade copy
> states the benefit, sourced from policy. The findings below (esp. **F1** "Pro == Free" and the
> §6 "task cap is the open number") describe the **planning-time** state and the decision that was
> made — they are NOT current state. Open decisions §15.1 (Option B) and §15.2 (task cap = 1,000)
> are **resolved**; §15.3 (Pro price point) and §15.5 (folders later) remain open. Pro stays dark
> behind `ENABLE_PERSONAL_PRO` until Marcus enables it.

---

## 1. Context

The remaining-work audit (`84b287a58`, §5.A) flagged that **`PLAN_LIMITS.pro === PLAN_LIMITS.free`**
— Personal Pro grants no extra capacity. The Personal Free → Pro upgrade UI shipped in
`853c26390` with deliberately honest *mechanics-only* copy (so the UI is not lying), but
**selling a paid Pro tier that does nothing is a production-launch blocker for the Pro tier
specifically**. This plan decides what to do about Pro *before* platform billing live testing,
without blocking a Team/Business launch and without building broad new enforcement systems.

---

## 2. Current codebase findings (verified)

**F1 — Pro caps equal Free caps.** [planPolicy.ts:49-50](../../../../core/billing/planPolicy.ts):
`free` and `pro` are both `{ memberLimit: 1, folderLimit: 10, taskLimit: 100 }`.

**F2 — Personal is single-member by design.** `ALLOWED_PLANS_BY_TYPE.personal = ["free","pro"]`
and personal `memberLimit` is 1. **Raising "members" for Pro is meaningless** — personal
accounts are single-user; Team/Business are the multi-member shapes.

**F3 — Folder + member caps are keyed off the account *type default*, NOT the stored plan.**
[folderLimits.ts](../../../../services/workflowFolders/folderLimits.ts) and
[memberLimits.ts](../../../../services/accounts/memberLimits.ts) both resolve via
`planLimitsFor(defaultPlanForAccountType(type))`. For a personal account that is *always*
`'free'` → 10 folders / 1 member, **regardless of `account_billing.plan`**. The memberLimits
comment says it explicitly: *"A later wiring slice can pass the account's ACTUAL plan once
Pro/paid tiers carry different caps."* → **Raising `PLAN_LIMITS.pro.folderLimit` has ZERO
effect until these helpers are rewired to read the stored plan.** Enforcement consumers:
[folderService.ts](../../../../services/workflowFolders/folderService.ts),
[invitations.ts](../../../../services/accounts/invitations.ts).

**F4 — Task cap is a stored per-account number, written only in two places.**
`account_billing.tasks_limit` (default 100). Writers verified: the webhook's **personal
`subscription.deleted`** branch resets it to Free policy ([stripeBillingWebhook.ts:200-202](../../../../services/billing/stripeBillingWebhook.ts)),
and the **Business-upgrade RPC** sets it from policy ([accountBilling.ts:36](../../../../repositories/accountBilling.ts)).
**No writer sets `tasks_limit` on a personal Free → Pro checkout/activation.** So raising
`PLAN_LIMITS.pro.taskLimit` alone would not bump a Pro user's stored cap — it needs webhook
wiring on the personal Pro activation path.

**F5 — No workflow-count cap exists.** The only `perWorkflow` reference is API-key *rate*
limiting ([rateLimitPolicy.ts:93](../../../../core/apiKeys/rateLimitPolicy.ts)), not a
workflow-count limit. There is nothing to differentiate Pro on here without building it.

**F6 — Public API + API keys are flag-gated, not plan-gated.** The public trigger endpoint is
behind `ENABLE_PUBLIC_API_KEYS` (default OFF — [flags.ts](../../../../services/apiKeys/flags.ts)),
and rate-limit tiers in `rateLimitPolicy.ts` are not keyed to billing plan. Tying Pro to public
API would couple two *unlaunched* features and add new plan-based enforcement.

**F7 — Checkout route accepts `plan: pro` for personal today.** [checkout/route.ts:47](../../../../app/api/accounts/[id]/billing/checkout/route.ts)
(`z.enum(["pro","team","business"])`) + `isPlanAllowedForType("personal","pro") === true`. So
Pro is purchasable whenever `ENABLE_PLATFORM_BILLING` is on **and** `STRIPE_PRICE_PRO` is set —
there is no separate Pro on/off switch.

**F8 — Downgrade validation only checks members + folders.** [downgradeRules.ts:42-47](../../../../core/billing/downgradeRules.ts)
compares `memberCount` + `folderCount` against the target plan's limits; **it does not check
tasks**. So a Pro that differs from Free *only in task cap* has **zero downgrade-validation
interaction**.

**F9 — No personal Pro accounts exist yet.** Billing is dark (`ENABLE_PLATFORM_BILLING` OFF),
so there are no live paid Pro subscriptions — any limit change ships with **no existing-data
backfill problem** for Pro.

---

## 3. Product problem

We must not charge real users for a Pro tier that grants nothing (trust + correctness). But we
also want to (a) start Stripe live testing soon and (b) launch Team/Business without waiting on
Pro. The constraints from the ask: **no fake value, minimize risk before Stripe testing, no
broad new enforcement systems, prefer existing `planPolicy` seams, don't change Team/Business,
don't break downgrade validation.**

The findings narrow the design space sharply:
- **Members**: N/A for personal Pro (F2).
- **Folders**: a real lever but requires **rewiring `folderLimitFor` to read the stored plan**
  (F3) — new enforcement surface touching folderService + invitations.
- **Tasks**: a real lever using the **existing stored `tasks_limit` seam** (F4), with **zero
  downgrade-validation impact** (F8) and **no existing-data risk** (F9) — the *smallest, safest*
  capacity benefit.
- **Workflows / API / AI / templates**: all require **new** enforcement (F5, F6) — defer.

---

## 4. Options considered

| Option | What it is | New enforcement? | Risk before Stripe test | Honest value? | Verdict |
|---|---|---|---|---|---|
| **A. Pro with real increased caps now** | Raise `PLAN_LIMITS.pro` (folders and/or tasks) + wire enforcement to read stored plan | **Yes** — folder helper rewire (F3) and/or webhook task-limit wiring (F4) | Higher — adds code right when we want to start testing | Yes | **Partial-accept (task-cap only) as a fast-follow, not pre-test** |
| **B. Keep Pro dark; launch Team/Business first** | New `ENABLE_PERSONAL_PRO` sub-flag (default OFF) hides the upgrade + rejects `plan=pro` at the route in prod; dev can flip it ON to test the plumbing | No (a flag + two gates) | Lowest | Yes — nothing is sold | **RECOMMENDED launch decision** |
| **C. Pro as "early-access/supporter" tier, no caps** | Explicit "no extra limits yet" copy, still charge | No | Low | Borderline — charging for nothing, even if disclosed | **Reject for launch** (weak; trust risk) |
| **D. Pro unlocks public API / API keys / AI** | Gate an unlaunched feature by plan | **Yes** — plan-gate public API (itself flag-gated/unlaunched) | High — couples two dark features | Yes, eventually | **Defer** |

---

## 5. Recommended launch decision

**Adopt Option B for the initial billing rollout, with Option A-minimal (task-cap) as the
bounded fast-follow that "lights up" Pro.**

1. **Initial rollout = Team/Business only. Keep Personal Pro dark** behind a new
   `ENABLE_PERSONAL_PRO` flag (default OFF), gating **both** the `PersonalUpgradePanel` UI
   **and** the checkout route's acceptance of `plan="pro"` (defense-in-depth, F7). In dev/test
   the flag can be flipped ON to exercise the Free → Pro checkout *mechanics* without committing
   to selling Pro to real users.
2. **Fast-follow (before flipping `ENABLE_PERSONAL_PRO` ON in prod): give Pro a real benefit via
   the task-cap seam** — raise `PLAN_LIMITS.pro.taskLimit` and wire the personal Pro activation
   path to set `account_billing.tasks_limit` from the stored plan's policy. This is the *only*
   capacity lever that (a) uses an existing stored seam, (b) has zero downgrade-validation
   impact (F8), and (c) has no existing-data backfill (F9).

Why B over A-now: A requires enforcement rewiring *before* we can start Stripe testing, enlarging
the surface at exactly the wrong moment. B unblocks Team/Business testing/launch immediately, lets
us still test the Pro plumbing in dev, and defers the (small) Pro-value work to a clean, isolated
fast-follow. Why not C/D: C sells empty Pro (trust); D couples unlaunched features + new
enforcement.

---

## 6. Recommended Pro benefits, if any

**At launch: none (Pro dark).** **Fast-follow: a higher monthly task cap** (the concrete number
is an open decision for Marcus — §15; e.g. Free 100 → Pro 1,000). Explicitly **not** at launch:
- folder-cap increase (needs F3 rewire — possible later, second-smallest lever),
- members (N/A for personal),
- workflow cap, public API, API keys, AI usage, templates (all new enforcement — F5/F6).

Once a real benefit exists, update `PersonalUpgradePanel` copy from mechanics-only to state the
concrete benefit (e.g. "Pro raises your monthly task limit to N").

---

## 7. Data / model impact

- **Option B:** none. No schema, no migration, no row changes — a flag + two gate conditions.
- **Fast-follow task-cap:** no schema change (`account_billing.tasks_limit` already exists).
  Raising `PLAN_LIMITS.pro.taskLimit` is a pure-data edit. The webhook must set
  `tasks_limit` from the activated plan's policy on personal Pro activation
  (`checkout.session.completed` / `customer.subscription.created|updated` personal+pro path);
  the existing personal `subscription.deleted` reset-to-Free already handles the down-path
  (F4). No existing-data backfill (F9).

---

## 8. Limit / enforcement impact

- **Option B:** zero — caps unchanged; Team/Business untouched.
- **Fast-follow task-cap:** touches only the **task** dimension via the stored
  `account_billing.tasks_limit` (read by the cost-preview / deduction paths already). It does
  **not** require the `folderLimitFor` / `memberLimitFor` stored-plan rewire (F3) — that rewire
  stays deferred and out of scope.
- **If folders are ever chosen as a Pro benefit (later, not recommended now):** `folderLimitFor`
  must take the account's stored plan instead of the type default, and every consumer
  (`folderService`, `invitations`) must pass it. Bigger surface — explicitly deferred.

---

## 9. UI impact

- **Option B:** `PersonalUpgradePanel` renders only when `ENABLE_PERSONAL_PRO` is on (added to
  the existing `showPersonalUpgrade` gate in [BillingSection.tsx](../../../../features/account/BillingSection.tsx)).
  Off → the personal account shows the existing honest "coming soon" plan rows (no Pro button).
  `PersonalPlanPanel` (cancel-at-period-end) is unaffected — with Pro dark, no personal account
  has a Pro subscription to cancel, so it naturally shows the Free state. `ManageBillingButton`
  is unaffected (it only shows with a synced subscription, which personal accounts won't have
  while Pro is dark).
- **Fast-follow:** `PersonalUpgradePanel` copy upgraded from mechanics-only to a concrete benefit
  line. No new controls.
- **No fake UI** in either step — every visible control maps to a real, flag-gated backend path.

---

## 10. Stripe price / config impact

- **Option B:** `STRIPE_PRICE_PRO` may be left **unset in prod** (Pro not sold) and **set in
  dev** to test the mechanics. The `ENABLE_PERSONAL_PRO` route gate is the authoritative
  dark-switch (don't rely on an unset price alone — an unset price yields an ugly 503 on a
  button that shouldn't exist; the flag removes the button + rejects the plan). `STRIPE_PRICE_TEAM`
  / `STRIPE_PRICE_BUSINESS` are unaffected and follow the go-live checklist.
- **Fast-follow:** still a single `STRIPE_PRICE_PRO` (one monthly price). No new price needed for
  a task-cap benefit — the cap is enforced in-app, not priced separately.

---

## 11. Downgrade impact

- **Option B:** none (caps unchanged).
- **Fast-follow task-cap:** **none** — `evaluateDowngrade` checks only members + folders (F8). A
  Pro→Free downgrade with a task-only Pro benefit never blocks on tasks; the stored `tasks_limit`
  simply resets to Free policy via the existing personal `subscription.deleted` branch (F4). This
  is a deliberate reason to choose tasks over folders as the first Pro lever.

---

## 12. Security / billing risks

- **R-PRO-1 — Dark-launch must gate the route, not just the UI.** Hiding the button alone leaves
  `plan=pro` purchasable (F7). The `ENABLE_PERSONAL_PRO` gate MUST also make the checkout route
  reject `plan="pro"` when off (mirror the `ENABLE_PLATFORM_BILLING` 404/validation pattern).
  *Mitigation: gate both surfaces; add a route test.*
- **R-PRO-2 — Mode/price drift.** If `STRIPE_PRICE_PRO` is set in prod while the flag is off, the
  flag still blocks purchase — but keep them consistent to avoid confusion. *Mitigation: env
  checklist note.*
- **R-PRO-3 — Charging for no value** (the whole reason for this plan). *Mitigation: Option B +
  task-cap fast-follow before prod-enabling Pro.*
- **R-PRO-4 — Task-cap wiring correctness.** Setting `tasks_limit` on activation must be
  idempotent and webhook-authoritative (no route writes it), consistent with the existing
  plan/status authority model. *Mitigation: write it only in the webhook sync path; cover with a
  webhook test.*
- No new credential/OAuth/RLS surface is introduced by either step (billing flag + a stored
  numeric cap). No Stripe id/secret exposure changes.

---

## 13. Implementation slice breakdown (future — not this slice)

- **CS-PRO-1 (Option B — dark-launch, smallest):** add `ENABLE_PERSONAL_PRO` to
  `billingFeatureFlags.ts` (default OFF). Gate (a) `showPersonalUpgrade` in `BillingSection`,
  (b) the checkout route to reject `plan="pro"` when off (typed validation failure). Tests:
  UI hidden when off / shown when on; route rejects pro when off, allows when on. No migration.
- **CS-PRO-2 (Pro value — task cap):** raise `PLAN_LIMITS.pro.taskLimit` to the chosen number;
  wire the webhook personal Pro activation path to set `account_billing.tasks_limit` from the
  activated plan's policy (mirror of the existing reset-on-cancel). Tests: webhook sets the Pro
  cap on activation; resets to Free on cancel; cost-preview/deduction read the new cap. No
  migration (column exists).
- **CS-PRO-3 (copy + enable):** update `PersonalUpgradePanel` copy to the concrete benefit; flip
  `ENABLE_PERSONAL_PRO` on in dev → staging → prod per the go-live sequence.
- **Deferred (only if folders chosen later):** CS-PRO-F — rewire `folderLimitFor` to read the
  stored plan + thread through `folderService` / `invitations`. Larger surface; not recommended
  as the first Pro lever.

---

## 14. Test plan (for the future slices)

- **CS-PRO-1:** `BillingSection` gating tests (Pro panel hidden/shown by `ENABLE_PERSONAL_PRO`);
  checkout route test (reject `plan=pro` when flag off → typed 400/404; allow when on). Existing
  `PersonalUpgradePanel` / `ManageBillingButton` / `PersonalPlanPanel` suites stay green.
- **CS-PRO-2:** webhook unit test — personal `checkout.session.completed` / `subscription.*`
  with `plan=pro` sets `account_billing.tasks_limit` to the Pro policy number; personal
  `subscription.deleted` resets it to Free; cost-preview reads the bumped cap. `downgradeRules`
  tests unchanged (tasks not a downgrade dimension — F8).
- **CS-PRO-3:** copy assertion in `PersonalUpgradePanel` (states the real benefit, no fake claim).
- **Manual (test mode):** Free → Pro checkout with the flag on → webhook → `plan=pro` +
  `tasks_limit` bumped; cancel → reverts to Free + cap reset.

---

## 15. Open decisions for Marcus

1. **Launch shape:** confirm **Option B** (Team/Business first, Pro dark) for the initial
   rollout. *(Recommended.)*
2. **Pro's concrete benefit:** confirm **task cap** as the first lever, and **the number**
   (e.g. Free 100 → Pro 1,000 / 2,000 / 5,000 monthly tasks). *(Recommendation: a clearly
   meaningful multiple of Free, e.g. 1,000.)*
3. **Pro price point:** the monthly Pro price (Stripe) — independent of this plan, needed before
   enabling Pro.
4. **Timing:** is the task-cap fast-follow (CS-PRO-2) required before *any* Pro sale, or is a
   short "early-access" window acceptable? *(Recommendation: require real value before charging —
   do CS-PRO-2 before enabling Pro in prod.)*
5. **Folders as a second Pro benefit later?** Yes/no (drives whether CS-PRO-F is ever scheduled).

---

## 16. Acceptance criteria

**For this planning slice (met now):**
- [x] Docs-only decision plan created; no source/migration/test/UI/env/Stripe change.
- [x] Every current-state claim cited to a file read this session (F1–F9).
- [x] ≥3 options evaluated with a clear recommendation; nothing pushed.

**For the implementation slices to later meet:**
- [ ] CS-PRO-1: `ENABLE_PERSONAL_PRO` (default OFF) gates UI **and** route; Team/Business
      unaffected; existing billing tests green.
- [ ] CS-PRO-2: Pro task cap enforced via webhook-set `tasks_limit`; reset-on-cancel works;
      downgrade validation unchanged.
- [ ] CS-PRO-3: honest benefit copy; flag enabled per go-live sequence only after CS-PRO-2.
- [ ] No fake value shipped at any point; no broad new enforcement system added for launch.

---

## 17. Hard boundaries (what this slice did NOT do)

- No source, migration, test, UI, schema, env, or Stripe change.
- No flag added or flipped (`ENABLE_PERSONAL_PRO` is a *recommendation*, not created here).
- `ENABLE_PLATFORM_BILLING` left default OFF.
- No git push. Docs-only local commit.

---

## 18. Verification performed for this audit

- `npm run lint:structure` → **OK** (run this session).
- Confirmed **no `ENABLE_PERSONAL_PRO` flag exists** today (grep — only `ENABLE_PLATFORM_BILLING`).
- **Full `npx jest` NOT run** — docs-only, zero source changes; inherited baseline from
  `853c26390` (focused billing-UI 75 / route 40 / broader 517 passed; typecheck clean; lint 0
  errors). Not re-measured here.

---

## 19. Recommended next step

Get Marcus's call on **§15.1 (Option B)** and **§15.2 (task-cap number)**, then implement
**CS-PRO-1** (the `ENABLE_PERSONAL_PRO` dark-launch flag) — the smallest slice that makes the
initial Team/Business rollout safe while keeping Pro out of real users' hands until it has real
value.

**Doc path:** `docs/slices/phase-4/account-settings/personal-pro-value-plan.md`.
**Docs-only. Nothing pushed.**
