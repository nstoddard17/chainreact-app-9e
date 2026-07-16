# PRO-TEAM-TRIAL-ENFORCEMENT-1 — One Pro/Team trial per account (owner report)

**Type:** Implementation (code + migration + tests + docs). **Local commit only — not pushed.**
**Date:** 2026-07-15
**Ships:** dark by config (trials granted only once `PLATFORM_TRIAL_PERIOD_DAYS` is set; default = off).

> Scope reminder: this is about ChainReact's **own platform billing** (`services/billing/`,
> `core/billing/`, `app/api/accounts/[id]/billing/`, `app/api/webhooks/stripe-billing/`,
> `account_billing`). It is unrelated to the **workflow Stripe provider** (`integrations/stripe/`),
> which lets end users manage their *own* Stripe subscriptions in workflows — that provider has its
> own `trial_period_days` / `trial_end` action fields and is out of scope here.

---

## 0. TL;DR

Before this slice, platform billing was **live with zero trials** — trials were explicitly out of
scope (go-live checklist §16/§17: "Do not add trials/coupons"). So "only Pro/Team get a trial" and
"one trial per account" were *vacuously* true (no account ever got a trial). This slice builds the
full one-trial-per-account system and its enforcement, keyed on the canonical `account_id`, and
ships it **dark**: nothing changes in production until the owner sets `PLATFORM_TRIAL_PERIOD_DAYS`
(recommended `14`). Only Pro and Team can ever receive a trial; Business, Enterprise, Free, and
unknown/malformed plans never do; an account gets exactly one trial total across Pro and Team,
enforced by an atomic DB claim that no cancellation, webhook, downgrade, interval change, or replay
can reset.

---

## 1. Did the previous implementation already limit trials to Pro and Team?

Trivially yes — because it granted **no trials at all**. There was no trial code anywhere in
platform billing: no `trial_period_days`/`trial_end` sent to Stripe, no `trial_consumed_at`, no
trial config or UI. `createCheckoutSession` created a plain `mode: subscription` session with no
`subscription_data.trial_*`. The webhook mapped Stripe's `trialing` status to our `trialing`
`plan_status` for display, but nothing ever *started* a trial.

## 2. Did it already enforce one trial per account?

Vacuously yes (zero trials ⇒ never more than one). There was no per-account trial state to enforce
against, and no claim mechanism.

## 3. Every path that previously could grant a trial

**None.** The single checkout entry (`createCheckoutSession`), the webhook, the personal
cancel/portal routes, and the business upgrade/downgrade RPCs never sent trial configuration to
Stripe. (Full re-trace of all entry points in §16's file list; each was read for this slice.)

## 4. Did Business or Enterprise previously have any accidental trial path?

No. Enterprise never reaches checkout (no price id → `plan_not_purchasable`). Business went through
checkout with no trial config. Neither had any trial path to close — the new code adds explicit
allowlist guards so they still never can.

## 5. Authoritative server-side list of trial-eligible plans

`core/billing/trialPolicy.ts` → `TRIAL_ELIGIBLE_PLANS = ['pro', 'team']` and
`isTrialEligiblePlan(plan)`. Pure, server-owned. Everything else — Free, Business, Enterprise,
unknown/retired/malformed identifiers, `null`, `undefined` — fails **closed** to `false`.
Eligibility is never inferred from plan ordering, "is it paid", pricing, Stripe state, or a
client-supplied flag.

```
Pro:        trial eligible
Team:       trial eligible
Free:       NOT eligible
Business:   NOT eligible
Enterprise: NOT eligible
Unknown:    NOT eligible (fail closed)
```

## 6. Authoritative DB field / record controlling account eligibility

`account_billing.trial_consumed_at` (nullable `timestamptz`), keyed on `account_id`. **Non-null ⇒
the account has consumed its one trial.** Supporting columns (observability / display only):
`trial_started_at`, `trial_ends_at`, `trial_origin_plan` (`'pro'|'team'`). `trial_origin_plan`
records which plan the trial began on but **does not** control whether another trial is allowed —
only `trial_consumed_at` does. Migration: `supabase/migrations/20260721000000_account_billing_trial.sql`.

## 7. How the atomic trial claim works

`claim_account_trial(p_account_id, p_origin_plan, p_trial_ends_at)` — a `SECURITY DEFINER`,
service-role-only Postgres RPC that performs a single **compare-and-set**:

```sql
UPDATE account_billing
   SET trial_consumed_at = now(), trial_started_at = now(),
       trial_ends_at = p_trial_ends_at, trial_origin_plan = p_origin_plan
 WHERE account_id = p_account_id AND trial_consumed_at IS NULL
RETURNING ...;   -- claimed = FOUND
```

The `WHERE ... IS NULL` guard + row lock make it race-safe: under concurrent requests / duplicate
checkout submissions / retries, exactly one caller observes `NULL` and wins (`claimed: true`); every
other caller re-evaluates the guard against the just-consumed row, matches 0 rows, and gets
`claimed: false` → it proceeds **without** a trial. It is **not** a read-then-write (no check/update
window). The RPC `RAISE`s on any origin plan other than `pro`/`team` (defense in depth). Wrapper:
`repositories/accountBilling.claimAccountTrialServiceRole`.

## 8. Exact point at which a trial is considered consumed

At **checkout session creation**, in `createCheckoutSession`, immediately before the Stripe Checkout
Session is created and **after** every validation + customer attach — i.e. the moment ChainReact
commits to starting the approved trial. The claim (`claimed: true`) is what consumes it; the trial
config (`subscription_data.trial_period_days`) is only added to the Stripe request when the claim
won. Consumption is recorded in ChainReact's DB, which is authoritative — never inferred from Stripe
status, Stripe customer history, the selected price, metadata, or client state.

## 9. How failed / abandoned checkout attempts are handled

Deliberate, documented, race-safe transition (no unsafe rollback):

- **Validation failure** (bad plan/type, price/stripe not configured, frozen, internal account): the
  claim runs *after* all validation, so a rejected checkout **never** consumes the trial.
- **Stripe session creation throws after a successful claim:** the trial **stays consumed** by
  design. We do **not** roll back `trial_consumed_at` — a rollback would reopen the duplicate-trial
  race. The user simply has no subscription; on retry they subscribe **without** a trial. This
  satisfies the requirement that beginning the approved trial process consumes the one opportunity,
  while never leaving a corrupted/ambiguous billing state (no plan/status is touched by checkout).
- **User abandons the Stripe page / cancels:** the checkout `success_url` is not proof of payment and
  the route never writes plan/status. `trial_consumed_at` reflects that the account *started* its
  trial opportunity; the actual subscription/trial only materializes if they complete checkout.
- **Business/Enterprise checkout failures never touch trial eligibility** — they never enter the
  claim path.

> Product note: this means a Stripe outage between claim and session creation can cost an account its
> one trial. That is the explicitly-chosen safe trade-off (no-rollback over race). It is rare
> (validation + customer attach already succeeded) and can be corrected manually via the Stripe
> dashboard + a one-off `account_billing` fix if ever needed.

## 10. How Pro↔Team and interval changes preserve the original trial end

**Architecture note:** in ChainReact, plans are bound to account *type* — Pro is a **personal**
account plan; Team is a **team** account plan; they are different `account_id`s. So a literal
in-place "switch from Pro to Team" is **not a ChainReact operation** — there is no code path that
converts a personal account into a team account. The trial is keyed on `account_id`, so a personal
account's one trial and a team account's one trial are simply different accounts' single trials.

The in-place plan/interval changes that DO exist, and how the trial end is preserved:

- **Interval change (monthly↔annual) on the same plan:** if done via a second checkout, the account
  has already consumed its trial → the atomic claim returns `claimed: false` → **no new trial**, and
  `trial_ends_at` is untouched (never advanced). If done in the Stripe Customer Portal on the same
  subscription, Stripe preserves the original `trial_end` natively; the webhook only mirrors it.
- **Team → Business upgrade** (see §11): Business is not trial-eligible → no claim, no trial config;
  the team's `trial_consumed_at` / `trial_ends_at` are left intact.

The one-trial rule therefore makes "changing plans/intervals cannot restart or extend the trial"
fall out automatically — there is no second-claim path. The webhook's trial-window sync only ever
**mirrors** Stripe's `trial_end` (Stripe preserves it on in-place updates) and only writes keys
Stripe actually reports, so a non-trial subscription can never null-wipe a prior trial end.

## 11. How Pro or Team upgrades to Business are handled

Business is never trial-eligible. A Team → Business upgrade goes through `createCheckoutSession`
with `requestedPlan: 'business'` → `isTrialEligiblePlan('business') === false` → **no claim, no
`trial_period_days`**. The account's one trial remains permanently consumed (its `trial_consumed_at`
is untouched). Billing timing follows the **existing** upgrade policy (the BU-1/BU-3
`apply_business_upgrade` RPC + webhook), which this slice does not change — Business bills per that
existing flow, no new/extended trial is created.

## 12. How Business-to-Pro / Business-to-Team transitions are handled

**Chosen policy (task default, documented):** an account that paid for Business but **never used a
Pro/Team trial** remains eligible for its one trial. Rationale: Business subscription history is not
trial usage — Business never had a trial under any implementation, so `trial_consumed_at` stays
`NULL` unless a real Pro/Team trial was claimed. If such an account later selects Pro or Team, the
atomic claim finds `NULL` and grants the one trial (when trials are configured on). If it *had*
previously consumed a Pro/Team trial, `trial_consumed_at` is set and the claim returns
`claimed: false` → no trial. (Business→Team is only reachable via the destructive, flag-gated
`ENABLE_BUSINESS_DOWNGRADE` downgrade, which does not touch trial columns; Business→Pro would be a
new personal subscription on a different account.)

## 13. How cancellation, Free downgrades, and resubscription are handled

`trial_consumed_at` is **permanent**. It is written only by the claim RPC (`NULL → now()`) and
**never cleared** by anything:

- **Cancel during trial / let it expire / delete the subscription:** webhook sets
  `plan_status='canceled'` (personal reverts plan to `free` + Free task cap, existing behavior);
  `trial_consumed_at` is untouched. There is no `trial_consumed_at = NULL` write anywhere in the
  codebase (asserted by test).
- **Return to Free:** no effect on the marker.
- **Resubscribe later to Pro/Team:** the atomic claim finds `trial_consumed_at` non-null → returns
  `claimed: false` → subscribe with **no** trial.

The marker survives subscription cancellation/deletion/replacement, webhook updates, failed-payment
states, trial expiration, downgrades, and return-to-Free.

## 14. How existing accounts are migrated / backfilled

**No destructive backfill.** All existing rows keep `trial_consumed_at = NULL` (every account
remains eligible for its one trial). This is the strongest **evidence-based** choice: trials never
existed before this slice, so **no account has ever consumed one** — marking any account "consumed"
would fabricate history, and leaving them `NULL` cannot grant a *repeat* trial (there are no prior
trials). Business/Enterprise history is explicitly **not** treated as trial usage. The migration is
purely additive (columns + RPC), so it is safe to apply to production with no data rewrite.

**Optional owner tightening (not baked in):** if, before enabling trials, you do NOT want
*currently-paying* Pro/Team accounts to be offered a trial, run this scoped one-off after the
migration is applied and before setting `PLATFORM_TRIAL_PERIOD_DAYS`:

```sql
-- Mark accounts already on a paid Pro/Team subscription as trial-consumed (they converted without
-- a trial and won't be offered one). Does NOT touch Business/Enterprise/Free.
UPDATE public.account_billing
   SET trial_consumed_at = now(), trial_origin_plan = plan
 WHERE plan IN ('pro','team')
   AND stripe_subscription_id IS NOT NULL
   AND trial_consumed_at IS NULL;
```

This is intentionally left as an explicit owner decision, not automatic.

## 15. Stripe responsibility vs ChainReact responsibility

```
ChainReact DB (account_billing.trial_consumed_at):
  Determines + permanently records whether an account is eligible for its ONE Pro/Team trial.

ChainReact server-owned plan classification (core/billing/trialPolicy + platformStripePrices):
  Determines whether the selected plan is Pro/Team (trial-capable) and resolves the Stripe price.

ChainReact config (PLATFORM_TRIAL_PERIOD_DAYS):
  The approved trial length; 0/unset = trials off (dark).

Stripe:
  Executes the trial + billing lifecycle ChainReact explicitly approved (collects a card during the
  trial, bills at trial end, handles proration on in-place changes).

Stripe webhooks:
  Synchronize subscription/billing state back into ChainReact and MIRROR the trial window
  (trial_start/trial_end) for display — WITHOUT granting or restoring eligibility. They never write
  trial_consumed_at/origin, never turn a trialing status into a new eligibility, and never advance
  the trial end.
```

## 16. Every file changed

**New (source):**
- `core/billing/trialPolicy.ts` — pure server-owned allowlist (Pro/Team) + recommended length.
- `services/billing/platformTrialConfig.ts` — env config (`resolveTrialPeriodDays`, dark default 0;
  `planTrialConfig`); DB-free so the public pricing page can use it.
- `services/billing/platformTrialPolicy.ts` — DB-backed `resolveTrialOffer` (allowlist ∧ config ∧
  `trial_consumed_at IS NULL`); re-exports config symbols.

**Changed (source):**
- `repositories/accountBilling.ts` — `claimAccountTrialServiceRole` (atomic claim wrapper),
  `getTrialStateServiceRole`, `syncTrialWindowServiceRole` (window-only, never consumed marker).
- `services/billing/platformBillingSessions.ts` — checkout claims the trial + adds
  `subscription_data.trial_period_days` only for an approved, atomically-claimed Pro/Team trial.
- `services/billing/stripeBillingWebhook.ts` — mirrors Stripe's trial window (started/ends) for
  reported keys only; never touches `trial_consumed_at`/origin; documented no-grant/no-restore.
- `app/account/page.tsx` — computes the sanitized Pro `trialOffer` (personal accounts) server-side.
- `features/account/BillingSection.tsx` — `trialOffer` on the billing view; passes it to the panel.
- `features/account/PersonalUpgradePanel.tsx` — "Start Pro free trial" + honest one-time trial copy
  when eligible; "Upgrade to Pro / Billing starts today" (no "free trial") otherwise.
- `features/account/BusinessUpgradePanel.tsx` — explicit "Business has no free trial — billing starts
  today".
- `features/marketing/PricingPage.tsx` — config-gated "N-day free trial" badge on Pro & Team cards
  only + a one-trial-per-account FAQ entry; nothing on Business/Enterprise/Free; dark by default.
- `.env.example` — documents `PLATFORM_TRIAL_PERIOD_DAYS` (dark default).

**Docs:**
- this report; `docs/billing/pricing-and-tiers.md` (Free-trials section);
  `docs/slices/phase-4/account-settings/platform-billing-go-live-checklist.md` (dated update note).

## 17. Every migration added

- `supabase/migrations/20260721000000_account_billing_trial.sql` — additive `trial_consumed_at /
  trial_started_at / trial_ends_at / trial_origin_plan` columns (origin-plan CHECK ∈ {pro,team}) +
  the `claim_account_trial` atomic RPC (SECURITY DEFINER, fixed search_path, service-role only).
  RLS/GRANTs unchanged (writes service-role only; members read their own row per the existing
  posture; non-members/anon get 0 rows → account isolation preserved). No destructive backfill.

**Applied?** Not yet applied to any DB by this slice (local-only, no `db:push`). The owner must apply
it to dev/staging/prod (§20) before setting the trial config.

## 18. Tests added / modified

New: `tests/unit/core/billing/trialPolicy.test.ts`,
`tests/unit/services/billing/platformTrialPolicy.test.ts`,
`tests/unit/repositories/accountBillingTrialClaim.test.ts`,
`tests/unit/services/billing/platformBillingSessions.trial.test.ts`,
`tests/unit/services/billing/stripeBillingWebhook.trial.test.ts`,
`tests/unit/migrations/accountBillingTrial.test.ts`.
Extended: `tests/unit/features/account/PersonalUpgradePanel.test.tsx`,
`tests/unit/features/account/BusinessUpgradePanel.test.tsx`,
`tests/unit/features/marketing/PricingPage.test.tsx`.

Coverage maps to the required 40 scenarios, including: eligible Pro/Team start a trial; a consumed
Pro trial blocks a later Team/Pro trial and vice-versa (one-trial-across-Pro+Team, enforced by the
claim on the shared `account_id`); interval/plan change never re-claims (no second-claim path);
cancel/expire/return-to-Free/resubscribe never restore eligibility (marker never cleared —
asserted); duplicate + concurrent checkouts can't both claim (atomic compare-and-set); ineligible
Pro/Team checkout has no trial config; eligible has exactly the approved config; Business & Enterprise
never carry trial config; Free/unknown never enter the claim path; forged `trialEligible` in the body
is rejected (the checkout route body schema is `.strict()` with no such field — server decides); a
forged Stripe price can't obtain a trial (price is resolved server-side, never client-supplied);
webhook retries/out-of-order don't clear/duplicate trial state; the UI advertises no trial for
Business/Enterprise and none to an ineligible/dark account, public pricing advertises trials only for
Pro/Team; account isolation (the claim is keyed per `account_id`).

## 19. Commands run and their results

- `npx tsc --noEmit` → **pass** (clean).
- `npx jest` (9 trial suites, 66 tests) → **pass** after tightening the days parser.
- `npx jest` (5 existing billing suites, 145 tests: sessions, webhook, subscription-sync,
  BillingSection, no-destructive-downgrade) → **pass** (no regressions).
- `npm run lint:structure` → **pass** (≤50 files/leaf).
- `npm run lint:migrations` → **pass** (RLS/GRANT invariants hold).
- `npx eslint <changed files>` → **0 errors**; 2 pre-existing-category `max-lines` warnings
  (PricingPage, accountBilling — both already large before this slice).
- `npm run lint` (whole repo) → 1 **pre-existing** error in `tests/unit/services/discovery/
  _registry.test.ts` (unmodified by this slice; confirmed present in HEAD) + pre-existing max-lines
  warnings. Not introduced here and left untouched to keep changes isolated.

## 20. Owner actions required (Stripe / env / deploy) before trials go live

1. **Apply the migration** `20260721000000_account_billing_trial.sql` to each target DB
   (`npm run db:push`), and confirm `claim_account_trial` is **not** EXECUTE-able by
   `authenticated`/`anon`.
2. **(Optional)** run the §14 tightening SQL if currently-paying Pro/Team accounts should not be
   offered a trial.
3. **Stripe dashboard:** confirm Checkout (subscription mode) collects a payment method during the
   trial (default behavior) so the card is on file when the trial ends. No coupon/trial object needs
   creating in Stripe — ChainReact passes `trial_period_days` per checkout. Ensure the four billing
   webhook events remain selected (unchanged).
4. **Set `PLATFORM_TRIAL_PERIOD_DAYS=14`** (the single go-live switch) in the target env — dev/
   staging first (test mode), then prod. Leaving it unset keeps trials fully off.
5. **Deploy** the code (the trial system is inert until step 4). Verify a test-mode Pro/Team checkout
   shows "no charge today", the subscription is `trialing`, and a second checkout on the same account
   gets no trial.

## 21. Commit hash and push status

Local commit only (hash recorded at commit time). **Not pushed** — per repo posture, a `v2-main`
push (which deploys to prod) requires explicit owner approval. This slice ships **dark**, so even
when deployed nothing changes until `PLATFORM_TRIAL_PERIOD_DAYS` is set.

## 22. Remaining risk / unresolved historical-data limitation

- **Stripe-outage-after-claim** consumes an account's one trial without a subscription (the
  documented no-rollback trade-off; §9). Rare; correctable via Stripe dashboard + a manual
  `account_billing` fix.
- **No literal in-place Pro↔Team switch exists** in the account model (different account types); the
  one-trial rule is enforced per `account_id`, and the interval/upgrade paths that DO exist preserve
  the trial end automatically (§10). If a cross-account "convert personal to team" ever ships, it must
  carry the trial state forward deliberately.
- **Historical evidence is complete for this decision:** because no trial ever existed, there is no
  ambiguity about who "already used" one — everyone is eligible until they claim. The only judgment
  call is the optional §14 tightening for currently-paying accounts, left to the owner.
- **Pre-existing repo lint error** in `tests/unit/services/discovery/_registry.test.ts` is unrelated
  and untouched; it should be fixed separately.
