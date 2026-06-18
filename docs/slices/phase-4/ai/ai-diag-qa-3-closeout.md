# 4.AI-DIAG-QA-3 — Builder AI workflow diagnosis Q&A UI — Closeout

**Type:** Post-ship closeout (docs-only). Nothing pushed from this slice.
**Date:** 2026-06-17
**Branch:** `v2-main`
**Backend:** [ai-diag-qa-2-closeout.md](./ai-diag-qa-2-closeout.md) (route/service/client + telemetry).
**Plan:** [ai-diag-qa-plan-1.md](./ai-diag-qa-plan-1.md) (CS-3 UI; Marcus decision — **no feature flag**, live behind the existing backend gates).

> **STATUS: LOCAL / UNPUSHED.** Verified this session: `facc05666` is **not** an ancestor of
> `origin/v2-main` (`git merge-base --is-ancestor facc05666 origin/v2-main` → false; `git branch -r
> --contains facc05666` → empty). `origin/v2-main` is `ba0af6616`; local `v2-main` is **13 ahead /
> 0 behind** (includes unrelated parallel-session analytics/marketing/privacy/security commits, e.g.
> `4463b921e`). **No new feature flag.** The Q&A UI calls the AI-DIAG-QA-2 backend, whose one DB
> migration (`20260703000000_ai_cost_events_feature_add_workflow_qa.sql`) is **applied to the DEV DB
> only — not pushed, not prod.**

---

## 1. Summary

- **AI-DIAG-QA-3 (`facc05666`)** — exposes the single-shot workflow diagnosis Q&A backend
  (AI-DIAG-QA-2) in the Builder AI panel. A small question box next to the deterministic
  "Check workflow" action; an explicit submit calls `askDiagnosisQuestion` and renders the safe
  answer as a new **session-local** `diagnosis_qa` message. Explanation-only: no patch, no
  Preview/Apply control, no run/activate/credential/integration mutation, **no new feature flag**.

## 2. Completed commit chain

- `facc05666` — Builder AI workflow Q&A UI (AI-DIAG-QA-3) _(2026-06-17)_ — **local/unpushed**

(Backend it depends on, also local/unpushed: `893f44001` route/service/client + `9ddd74df6`
telemetry alignment — see [ai-diag-qa-2-closeout.md](./ai-diag-qa-2-closeout.md).)

## 3. Current behavior (product)

The Builder AI panel now answers free-text questions about *this* workflow's diagnosis:

- **Explicit submit only — no auto-call.** The Q&A round-trip fires only when the user clicks
  **Ask** (or presses Enter). Nothing is pre-fetched.
- **Single-shot.** Each submit is an independent question (no multi-turn thread, no memory of a
  prior answer feeding the next).
- **Session-local.** The question + answer render as a `diagnosis_qa` bubble in the live chat and
  are **never persisted** — `persistedMessageToChat` has no `diagnosis_qa` case, so a reopened
  workflow never rehydrates model prose.
- **No mutation.** The answer is text-only guidance: no patch generation, no Preview/Apply control
  anywhere in the Q&A flow, and no run / activate / deactivate / credential / integration change.
- **No new feature flag.** Live behind the same operational gates as the backend (OpenAI configured
  + the existing `aiCreditGate` enforcement). With OpenAI not enabled the route returns a safe 503
  and the UI shows generic retry copy.

## 4. UI placement and interaction

- **Placement:** a small, self-contained question box
  ([`_BuilderAiPanelQa.tsx`](../../../../features/workflow-builder/panels/_BuilderAiPanelQa.tsx))
  rendered in the composer next to the deterministic **Check workflow** action (the diagnosis/check
  area). It owns its own question text, so the plan/follow-up composer state is untouched.
- **Placeholder:** *"Ask why this workflow won't run…"*. The submit button reads **Ask**, changing
  to **Asking…** while in flight.
- **Keyboard:** Enter submits; Shift+Enter inserts a newline (IME composition respected).
- **Clears on success:** the input empties after a submit.
- **Submit disabled** when: the question is empty/whitespace, exceeds the backend max length
  (client mirror `DIAGNOSIS_QA_MAX_QUESTION_LENGTH = 500`; an over-length line shows), a Q&A
  round-trip is in flight (`asking`), or any other guarded panel op is running
  (plan / apply / check / explain / suggest / preview — `qaPanelBusy`). The in-flight `asking`
  flag is also threaded into every diagnosis-action guard + the composer's Check/plan disables, so
  ops can't overlap in either direction.

## 5. Message rendering

- New session-local message kind **`diagnosis_qa`**
  ([`_BuilderAiPanelChat.tsx`](../../../../features/workflow-builder/panels/_BuilderAiPanelChat.tsx)),
  rendered by `DiagnosisQaBody`
  ([`_BuilderAiPanelDiagnosis.tsx`](../../../../features/workflow-builder/panels/_BuilderAiPanelDiagnosis.tsx)).
- It shows: the **user's question** (kept locally for context), the **answer**, optional **pointers**
  ("Where to look"), an optional **needsUserDecision** note ("needs a decision only you can make"),
  and an **"answer only — your workflow wasn't changed or run"** boundary line.
- **Not added to `persistedMessageToChat`** — session-local only, never rehydrated.

## 6. Selected-node behavior

- Uses the **existing** builder selection `configSlice.activeNodeId` (the currently-open config
  node) as the optional `selectedNodeId`. **No new selection system was introduced.**
- It is sent **only as an API hint** (the server validates it against the graph, ignores bogus ids,
  and never echoes it back). It is **never rendered** in the UI.
- It is **omitted (`undefined`)** when no node's config rail is open.

## 7. Error behavior

Safe, code/status-mapped copy only — the raw server/model/gate text and codes never reach the UI:

| Outcome | Source | User-facing copy |
|---|---|---|
| 402 `AI_CREDITS_EXHAUSTED` | handled `ok:false` | shared credit-exhausted message |
| 403 `ACCOUNT_PENDING_DELETION` (frozen/access) | handled `ok:false` | "This account is pending deletion." |
| 503 `MODEL_FAILED` / `AI_GATE_ERROR` (provider/gate) | handled `ok:false` | generic "Couldn't answer that right now. Please try again." |
| Transport throw (401 / 404 / 400 too-long-or-empty / 500) | `AiApiError` catch | 401→sign-in, 404→not-found, else generic |

Mapping lives in `diagnosisQaFailureMessage`
([`_BuilderAiPanelDiagnosisMessages.ts`](../../../../features/workflow-builder/panels/_BuilderAiPanelDiagnosisMessages.ts))
+ the shared `aiAssistantTransportErrorMessage`. The handler does not mark anything "answered", so the
user can retry.

## 8. Security / no-leak guarantees

- The answer bubble renders **only the API-safe fields** — `answer`, `pointers`,
  `needsUserDecision` — plus the **local question** the user typed.
- It surfaces **no** raw node ids, edge ids, DB ids, account ids, config values, provider response
  bodies, tokens, secrets, raw run logs, unbounded workflow JSON, or `{{nodeId.path}}` reference
  tokens. A **hostile-mock test** smuggles `nodeId` / `accountId` / `token` / `rawConfig` / `{{`
  outside the allow-listed fields and asserts none reach the DOM.
- `selectedNodeId` is a request hint only — never rendered (test asserts the id does not appear in
  the answer bubble).
- The Q&A UI imports **no `@/services` and no `scripts/mcp` modules** — it talks to the backend
  solely through `lib/api/ai` (import-boundary test over `_BuilderAiPanelQa.tsx`,
  `_BuilderAiPanelDiagnosis.tsx`, `_BuilderAiPanelDiagnosisMessages.ts`).

## 9. Data / RLS / model notes

- **No new tables, RLS, or GRANT changes** in this UI slice.
- The dependency backend adds **no schema** beyond the AI-DIAG-QA-2 telemetry migration
  `20260703000000_ai_cost_events_feature_add_workflow_qa.sql` (widens `ai_cost_events_feature_chk`
  to allow `workflow_qa`). **Applied to the DEV DB only via `db:push` — NOT pushed, NOT prod.** The
  ship batch that carries this work to production must run that migration through the normal deploy
  flow, or Q&A telemetry inserts will fail the CHECK in prod.

## 10. Deferred / known limitations

- **No multi-turn Q&A** — each submit is single-shot; there is no conversational follow-up.
- **No durable rate limiting** — gating is the existing per-request `aiCreditGate` only.
- **No persisted Q&A history** — answers are session-local by design (no `builder_agent_messages`
  row, no rehydrate).
- **Selected-node context is a hint only** — it forwards the existing `activeNodeId`; richer
  per-node context (e.g. a fuller safe node summary tied to a dedicated selection) is polish for
  later.
- **Live UI depends on the deployed batch** — the Q&A UI only works in an environment where the
  AI-DIAG-QA-2 backend route **and** the `workflow_qa` telemetry migration are present, and OpenAI
  is configured. Today all of that is local/dev-only.

## 11. Verification baseline

**Inherited from the implementation session at `facc05666` (NOT re-run in this docs-only closeout):**

- Focused: `tests/unit/features/workflow-builder/panels/BuilderAiPanel.diagnosisQa.test.tsx` — **17 passed**.
- Regression (all green): composer chatFillHint **10**, explainDiagnosis **14**, diagnose **8**,
  suggestFix **13**, previewFix **15**, repairApply **10**, client `tests/unit/lib/api/ai.test.ts` **38**.
- `npm run typecheck` → **exit 0**.
- ESLint over the **12 touched files** → clean.
- `npm run lint:structure` → **OK** (every leaf folder ≤ 50 files).

This session re-verified only **repo/push state** (git): `facc05666` is local/unpushed; `origin/v2-main`
is `ba0af6616`; local is 13 ahead / 0 behind. **No tests/typecheck/lint were re-run this session.**

- **Feature flags:** none added by this arc. The backend gates (`aiCreditGate` enforcement +
  OpenAI-enabled) are unchanged.
- **Unapplied migration:** `20260703000000_ai_cost_events_feature_add_workflow_qa.sql` — dev DB only,
  **not prod** (ship batch must apply it).

## 12. Push / deploy status

- `facc05666` (and the backend `893f44001` + `9ddd74df6`) remain **LOCAL / UNPUSHED**. No push was
  performed this session.
- The migration must reach prod through the **normal deploy flow** when this batch ships.

## 13. Recommended next tracks

- **Ship batch** — when Marcus approves, push the AI-DIAG-QA-2 + QA-3 commits and run the
  `workflow_qa` migration in prod as one verified batch; then prod-smoke a real Q&A round-trip with
  OpenAI enabled.
- **Hermes / multi-turn** stays deferred until single-shot Q&A + repair are validated in prod (per
  the AI-credits decision sequencing).
- **Durable rate limiting** for the AI Q&A/explain/repair surface before broad user rollout.

## 14. Closeout confirmation

Docs-only. Nothing pushed. Doc: `docs/slices/phase-4/ai/ai-diag-qa-3-closeout.md`.
