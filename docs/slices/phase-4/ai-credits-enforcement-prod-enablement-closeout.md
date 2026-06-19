# AI Credit Enforcement — Production Enablement — Closeout

**Type:** Production ops/config enablement closeout (docs-only). **No code change.** Nothing pushed from this slice.
**Date:** 2026-06-19
**Branch:** `v2-main` (no branch work — this was an env + redeploy task)
**Builds on:** [`ai-credits-enforcement-plan.md`](./ai-credits-enforcement-plan.md) · [`ai-credits-enforcement-3b-plan.md`](./ai-credits-enforcement-3b-plan.md) (the gate/policy/ledger that shipped flag-OFF) · [`ai/ai-diag-qa-2-closeout.md`](./ai/ai-diag-qa-2-closeout.md) (Q&A backend + `aiCreditGate` wiring) · [`ai/ai-diag-qa-autoroute-closeout.md`](./ai/ai-diag-qa-autoroute-closeout.md) (one-composer UX, live).

> **STATUS: LIVE IN PRODUCTION.** This was an **environment + redeploy** change, not a code change.
> `ENABLE_AI_CREDIT_ENFORCEMENT=true` is set for the **Production** environment in Vercel; production
> was redeployed from the existing commit `6a14173f6` (no new code, no local WIP). Verified this
> session: Q&A and Explain now **deduct AI credits** (account `ai_credits_used` moved **0/20 → 2/20**
> after one Q&A + one Explain). **No code commits, pushes, migrations, or source changes** were made
> during the enablement.

---

## 1. Summary

Flipped AI credit enforcement **ON in Production**. The `aiCreditGate` (shipped flag-OFF in
`AI-CREDITS-3b`, wired into the Q&A and Explain routes via `AI-DIAG-QA-2`) now actively meters: it
runs **before** the model call and deducts from the workflow-owning account's AI credit pool. No code
changed — only the Vercel Production env var `ENABLE_AI_CREDIT_ENFORCEMENT` (read in
[`services/billing/billingFeatureFlags.ts`](../../../services/billing/billingFeatureFlags.ts) as
`=== "true"`) and a redeploy of the existing commit.

## 2. Change set (no commit chain — env + redeploy only)

This arc produced **no git commits** (it is an ops/config change). The live behavior depends on
already-shipped, already-in-prod commits:

- `893f44001` — AI-DIAG-QA-2 Q&A backend + `aiCreditGate` wiring _(in `origin/v2-main`)_
- `facc05666` — AI-DIAG-QA-3 Q&A UI _(in `origin/v2-main`)_
- `d117cd2af` — AUTOROUTE CS-4 one-composer _(in `origin/v2-main`)_
- `6a14173f6` — current `origin/v2-main` HEAD = the redeployed production source

(Earlier AI-CREDITS gate/policy/ledger commits are referenced in the enforcement plans above.)

### Environment change (Vercel)
- **`ENABLE_AI_CREDIT_ENFORCEMENT` → `true` for Production.** (Was effectively OFF — verified by
  behavior: identical Q&A/Explain calls earlier the same day deducted 0 credits.)
- **`ENABLE_OPENAI_PROVIDER` left ON** (Preview + Production). **OpenAI key untouched.**
- **No other env vars changed.**
- **Preview enforcement intentionally left unset/off.** The value-update (rm + re-add) narrowed the
  var's footprint to Production-only; the Preview assignment is currently **unset → effectively OFF**,
  which matches its prior behavior. Leave it off until a real preview/staging workflow is defined.

### Deployment
- Existing production commit **`6a14173f6`** redeployed via `vercel redeploy … --target production`
  (same source — **no local WIP deployed**, no code change required).
- New production deployment **`chainreact-bnokc2bad`** — **✓ Ready (3m)**, aliased to `chainreact.app`.

## 3. Billing behavior (current)

- **Q&A** uses feature `workflow_qa`; **Explain** uses feature `workflow_explanation`.
- Each deducts **1 AI credit** under the current **fast-tier** policy (observed: 0/20 → 2/20 over one
  call of each).
- The gate runs **before** the model call ([`services/billing/aiCreditGate.ts`](../../../services/billing/aiCreditGate.ts)):
  frozen-account check → test-mode skip → 0-credit/deterministic skip → atomic
  `deduct_ai_credits_if_available`. It is **fail-closed** — an RPC error returns a typed denial, so a
  paid call can never proceed unmetered.
- Deductions hit the **workflow-owning account** (personal → personal pool; team/business → shared
  pool), resolved server-side (never client-supplied).
- **Denial paths remain safe**: `insufficient_ai_credits` → **402 `AI_CREDITS_EXHAUSTED`**,
  `account_frozen` → **403**, `gate_error` / OpenAI-not-configured → **503**, all rendered as safe
  copy (no raw model/server/gate text) per the AI-DIAG-QA-3 error table.
- **Deterministic "Check workflow" stays 0-credit / ungated / no model** — unaffected.

## 4. Verification (run THIS session against production)

**Newly measured this session (not inherited):**

- **Standard prod smoke** (`npm run smoke:prod`, creds from `.env.local`): **24 passed / 8 skipped / 0 failed**
  (8 skips are the opt-in manual-run + Slack gates). Re-ran post-deploy: still green.
- **Targeted Q&A/Explain credit-enforcement smoke** (disposable workflow, auto-cleanup): **4 passed**.
  - **Q&A** → HTTP **200, `ok=true`**, answer rendered in the same feed (`builder-ai-diagnosis-qa-answer`), no UI error.
  - **Explain with AI** → HTTP **200, `ok=true`**, explanation rendered (`builder-ai-diagnosis-explanation-text`), no UI error.
  - **Check workflow** → deterministic diagnosis rendered, no model call, free.
- **Before/after credit deduction (the smoke test workflow-owning account):** `ai_credits_used`
  **0/20 → 2/20** (+1 Q&A, +1 Explain). The same call types earlier in the day (enforcement OFF)
  deducted **0** — clean A/B proof enforcement is now metering.
- **Telemetry:** `ai_cost_events` `workflow_qa` **4 → 5**, `workflow_explanation` **7 → 8**.
- **Cleanup:** disposable smoke workflow soft-deleted to trash; **0 active smoke workflows remain**.

**Migration / flag state:**
- `workflow_qa` telemetry migration `20260703000000` is **applied in production** (confirmed:
  `ai_cost_events_feature_chk` allows `workflow_qa`; `deduct_ai_credits_if_available` RPC present;
  telemetry inserts succeeding). **No unapplied migrations** for this work.
- Feature flags: **`ENABLE_AI_CREDIT_ENFORCEMENT` = true (Production)** / unset-off (Preview);
  **`ENABLE_OPENAI_PROVIDER` = on**.

## 5. Caveats / known limitations

- **No live insufficient-credit test was performed** — the test account had ample headroom (now 18/20
  remaining), so only the deduction (happy) path ran live. The 402 `AI_CREDITS_EXHAUSTED` path is
  verified by code (fail-closed gate → typed denial → 402 → safe UI), not force-exercised in prod.
- **Preview enforcement not restored** — currently unset (effectively OFF). Leave off until a real
  preview/staging workflow is defined.
- **Single live Supabase project** — there is still only one Supabase project (the production DB; see
  [`v2-go-live-status.md`](./v2-go-live-status.md)). Treat `db:push` as **production-impacting** until a staging DB exists.
- **Blast radius at flip time was safe** — 9 total `account_billing` rows, **0** with any AI usage,
  **0** at/over limit (pre-launch), so the flip could not suddenly 402 anyone.

## 6. Recommended next tracks

- **Builder AI UX polish** (continue from the AUTOROUTE one-composer baseline).
- **Credit-exhaustion / product messaging review** — copy + upgrade path for the 402 `AI_CREDITS_EXHAUSTED`
  state before broad rollout (the gate is live but the user-facing exhaustion story is untested).
- **AI usage visibility in billing/account UI** — surface `ai_credits_used` / limit / remaining to users.

## 7. Closeout confirmation

Docs-only. **No code commits, pushes, migrations, or source changes** were made during the enablement
(only one Vercel Production env value + a redeploy of the existing commit). Working tree was clean
afterward. Doc: `docs/slices/phase-4/ai-credits-enforcement-prod-enablement-closeout.md`.
