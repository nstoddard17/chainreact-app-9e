# Builder AI Polish Batch — Closeout

**Type:** Post-implementation closeout (docs-only). Nothing pushed from this slice.
**Date:** 2026-06-19
**Branch:** `v2-main`
**Builds on:** [`ai-diag-qa-autoroute-closeout.md`](./ai-diag-qa-autoroute-closeout.md) (one-composer AUTOROUTE, live) · [`../ai-credits-enforcement-prod-enablement-closeout.md`](../ai-credits-enforcement-prod-enablement-closeout.md) (AI credit enforcement ON in prod).

> **STATUS: LOCAL / UNPUSHED.** All four commits below are local-only — verified this session:
> none is an ancestor of `origin/v2-main` (`merge-base --is-ancestor` → all LOCAL-ONLY).
> `origin/v2-main` is `cf0e43b97`. These are **UI/copy polish only** — no routing, billing-gate,
> env, provider, or migration changes. Production already runs the pre-polish AUTOROUTE UX with
> AI credit enforcement ON; these commits refine that UX and ship when Marcus approves a push.

---

## 1. Summary

A four-slice polish batch making the metered Builder AI experience clear and product-ready. No
new product behavior — copy, presentation, and one fill-only affordance.

- **e984d1dfb (CREDIT-UX)** — friendlier out-of-AI-credits copy + Account → Plan & billing AI
  credit visibility (used/limit/remaining/reset).
- **e5b959017 (COMPOSER)** — composer placeholder/aria/send copy reframed to "ask a question or
  describe a change"; example prompt chips; clarification copy polish.
- **d20d45567 (QA-PRESENTATION)** — read-only Q&A answer presentation (badge + structure) + an
  "Answering…" loading state.
- **5a641290f (PLAN-PREVIEW)** — planner result framed up front as a proposal that hasn't been
  applied.

## 2. Completed commit chain

- `e984d1dfb` — friendlier AI credit-exhaustion copy + AI credits in billing (BUILDER-AI-CREDIT-UX-POLISH-1) _(2026-06-19)_ — **local/unpushed**
- `e5b959017` — one-composer polish: ask-or-change copy, example chips, clarification (BUILDER-AI-COMPOSER-POLISH-1) _(2026-06-19)_ — **local/unpushed**
- `d20d45567` — polish Q&A answer presentation + Q&A loading state (BUILDER-AI-QA-PRESENTATION-POLISH-1) _(2026-06-19)_ — **local/unpushed**
- `5a641290f` — frame the plan card up front: proposal / nothing-applied-yet (BUILDER-AI-PLAN-PREVIEW-POLISH-1) _(2026-06-19)_ — **local/unpushed**

(All four verified against `git log`; `5a641290f` is current `HEAD`'s most recent Builder-AI commit.)

## 3. Current behavior (after the batch, local)

- **Out of AI credits:** the shared `AI_CREDITS_EXHAUSTED_MESSAGE` now says the account is out of
  AI credits, reassures that deterministic checks (e.g. Check workflow) stay free, and points to
  **Account settings → Plan & billing** — no raw `402`/code/gate internals, no CTA button.
- **AI credit visibility:** Account → Plan & billing shows the active account's **AI credits**
  (`used / limit`, remaining, reset date) beside Task usage — sourced from `account_billing` via
  the RLS/account-scoped `getAiCreditUsage`; `null` → "unavailable", never faked.
- **Composer:** placeholder/aria → *"Ask a question or describe a change — e.g. 'Why won't this
  run?' or 'Add a Slack step'"*; send button **"Send"** (was "Plan with AI"); kbd hint "send".
- **Example chips:** four chips in the empty intro (`Why won't this run?` / `Explain this error` /
  `Add a Slack step` / `What should I fix first?`). A chip **fills** the one composer — it does
  **not** submit or call any API — so the send still flows through `handleComposerSubmit → AUTOROUTE`.
- **Clarification:** copy polished ("This could go two ways — I can explain what's wrong, or plan
  changes to fix it. Which would you like?"); two actions + resolve-once unchanged; retained prompt
  still not rendered.
- **Q&A answer:** a **"Read-only" badge** up front, "You asked" / answer / **"What to check next"**
  (renamed from "Where to look"), and the unchanged "answer only — your workflow wasn't changed or
  run" footer. An **"Answering…"** transient bubble shows while a Q&A round-trip is in flight
  (consistent with Checking…/Explaining…).
- **Planner result:** a top-of-card line — *"Here's the proposed plan — nothing has changed yet.
  Review it below before anything is applied to your workflow."* The inline preview still shows
  "Preview only · not applied yet" + "Nothing is saved to your workflow until you click Apply
  change"; Apply stays gated and proposal-only.

## 4. Security / no-leak guarantees (unchanged invariants, re-affirmed)

- **No routing logic changed** — `classifyComposerIntent` precedence (chat-fill → follow-up →
  qa/plan/clarify) untouched; chips never bypass it.
- **No billing-gate logic changed** — `aiCreditGate` and the deduction path are untouched; only
  user-facing copy + a read-only usage display were added.
- **No env / provider / migration changes.**
- **Q&A stays read-only** — no patch, no Apply/Preview controls on a Q&A answer; renders only the
  safe fields (`question`/`answer`/`pointers`/`needsUserDecision`).
- **Planner stays proposal-only** — Apply is never auto-clicked (asserted in tests).
- **No raw node ids, config values, tokens, gate codes, or diagnosis DTO fields** rendered; the
  exhaustion/failure mappers still collapse model/gate/server text to safe copy.
- **Account-scoped** — the AI credits display reads the active account's `account_billing` row via
  the membership-RLS client; never cross-account, never user-global.

## 5. Data / RLS / model notes

- **No tables, RLS, GRANT, or migration changes.** The AI credit visibility reuses the existing
  `account_billing` columns (`ai_credits_used/limit/period_started_at`) and the existing
  `getAiCreditUsage` repository read. No schema or model-output change.

## 6. UI behavior

All changes are copy/presentation plus one fill-only chip affordance and a loading indicator. **No
fake or unsupported controls** — chips fill the real composer; the AI credits row reflects real
`account_billing` data or "unavailable"; no new buttons that the backend can't honor.

## 7. Deferred / known limitations

- **Clickable "View AI usage" CTA in the chat error bubble** — deferred; the error message kind has
  no structured CTA field, so the exhaustion copy uses a text path (names the route) instead.
- **Selected-node display label in Q&A** — left alone: the `diagnosis_qa` message carries no safe
  node label and the server never echoes `selectedNodeId`, so there is nothing safe to show.
- **One-click auto-submit chips** — intentionally NOT added: chips fill (not submit) so a single
  click can't spend an AI credit now that enforcement is ON.
- **`_BuilderAiPanelChat.tsx` soft `max-lines` warning** — the file is ~416 lines (soft limit 400);
  pre-existing (was ~402 before the planner-framing line). Splitting it is a separate refactor.

## 8. Verification baseline

**Measured during the four implementation slices earlier this session (NOT re-run in this docs
closeout).** This closeout re-verified only repo/push state (git): all four commits local/unpushed,
`origin/v2-main` = `cf0e43b97`.

| Slice | Focused tests run + result | typecheck | eslint (touched) | lint:structure |
|---|---|---|---|---|
| `e984d1dfb` | BillingSection + aiCreditExhaustedCopy → **71 passed** | 0 | 0 | docs warn (then) |
| `e5b959017` | 8 suites (classifier/autoRoute/intentClarification/diagnosisQa/chatFillHint/panel/retryable/useBuilderAi) → **220 passed** | 0 | 0 | docs warn (then) |
| `d20d45567` | 6 suites then 94 after the TransientIndicators refactor → **115 / 94 passed** | 0 | 0 (max-lines cleared via DRY refactor) | docs warn (then) |
| `5a641290f` | 5 suites (panel/autoRoute/retryable/creditDenial/diagnosisQa) → **106 passed** | 0 | 0 errors (1 pre-existing `max-lines` warning on `_BuilderAiPanelChat.tsx`, 416>400) | **OK** |

- **`lint:structure` is now OK** — the previously-known `docs/slices/phase-4` 51/50 warning no
  longer appears (the folder dropped to 46 files; this closeout adds to `phase-4/ai/`, 24→25, well
  under the cap).
- **Feature flags:** none added by this batch. `ENABLE_AI_CREDIT_ENFORCEMENT` (ON in prod) and
  `ENABLE_OPENAI_PROVIDER` (ON) are unchanged.
- **No unapplied migrations** — this batch touches no migrations.

## 9. Recommended next tracks

- **Ship batch** — when Marcus approves, push the four polish commits; prod already has the backend
  (AUTOROUTE + enforcement), so this is a UI-only deploy.
- **Clickable "View AI usage" CTA** in the chat exhaustion bubble (needs a CTA field on the error
  message kind).
- **Split `_BuilderAiPanelChat.tsx`** to clear the soft `max-lines` warning.
- **Credit-exhaustion product messaging review** before broad rollout (the 402 path is live but its
  user-facing story is still untested end to end).

## 10. Closeout confirmation

Docs-only. Nothing pushed. Doc: `docs/slices/phase-4/ai/builder-ai-polish-closeout.md`.
