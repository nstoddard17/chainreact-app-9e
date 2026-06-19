# 4.AI-DIAG-QA-AUTOROUTE — One Builder AI composer with deterministic intent auto-routing — Closeout

**Type:** Post-ship closeout (docs-only). Nothing pushed from this slice.
**Date:** 2026-06-19
**Branch:** `v2-main`
**Plan:** [ai-diag-qa-autoroute-plan-1.md](./ai-diag-qa-autoroute-plan-1.md) (design + §4 routing policy; the §10 CS-1..CS-4 breakdown this arc implemented).
**Supersedes:** [ai-diag-qa-3-closeout.md](./ai-diag-qa-3-closeout.md) — the separate Q&A mini-input that arc shipped is **removed** here.
**Backend (unchanged):** [ai-diag-qa-2-closeout.md](./ai-diag-qa-2-closeout.md) — `POST /ai/diagnose/qa` + `askDiagnosisQuestion` are byte-for-byte the same and still read-only.

> **STATUS: LOCAL / UNPUSHED.** Verified this session (git): none of the four AUTOROUTE commits
> is an ancestor of `origin/v2-main` (`git branch -r --contains d117cd2af` → empty;
> per-commit `merge-base --is-ancestor` → all LOCAL-ONLY). `origin/v2-main` is `dd285099f`;
> local `v2-main` is **15 ahead / 0 behind** (the 15 include unrelated parallel-session
> analytics/marketing/billing commits, e.g. `af0f59c9b`, `6a1ea7cfa`, `9c750dfd0`). **UI/routing
> only — no backend, route, client-signature, migration, env, or feature-flag change.** No new
> flag was added by this arc.

---

## 1. Summary

The AUTOROUTE arc collapses the Builder AI panel to **one assistant experience** — one message
feed, one composer, one send action — with deterministic intent routing behind the scenes. It
removes the separate Q&A mini-input that AI-DIAG-QA-3 introduced (which Marcus rejected as
"chat inside chat").

- **CS-1 (`e0212b481`)** — adds the pure, deterministic `classifyComposerIntent(text)` router
  returning `qa | plan | clarify` (sibling of `shouldRouteChatFill`). No wiring.
- **CS-2 (`7fa13774a`)** — adds the session-local `intent_clarification` message kind + its
  renderer (`_BuilderAiPanelClarification.tsx`) with two resolve-once quick actions.
- **CS-3 (`1ff3c0b24`)** — wires the router into `handleComposerSubmit` (chat-fill → follow-up →
  classifier) and adds the clarification action handlers.
- **CS-4 (`d117cd2af`)** — deletes `_BuilderAiPanelQa.tsx`, strips the mini-box props/render from
  the composer/panel, reworks the two affected test files. One composer only.

## 2. Completed commit chain

- `e0212b481` — deterministic composer intent classifier (AUTOROUTE CS-1) _(2026-06-17)_ — **local/unpushed**
- `7fa13774a` — intent_clarification message kind + renderer (AUTOROUTE CS-2) _(2026-06-17)_ — **local/unpushed**
- `1ff3c0b24` — wire one-composer intent auto-routing + clarification actions (AUTOROUTE CS-3) _(2026-06-18)_ — **local/unpushed**
- `d117cd2af` — remove mini Q&A box — one composer only (AUTOROUTE CS-4) _(2026-06-19)_ — **local/unpushed**

(All four verified against `git log`. `d117cd2af` is current `HEAD`.)

## 3. Current behavior (product)

Builder AI is now a single assistant: **one message feed, one composer, one send action.** No
separate Q&A box, no "Ask" button, no chat-inside-chat. A user types one thing and the panel
routes it deterministically — no model call decides the route.

**Routing precedence in `handleComposerSubmit`** ([`BuilderAiPanel.tsx`](../../../../features/workflow-builder/panels/BuilderAiPanel.tsx) → [`useBuilderAiActions.ts`](../../../../features/workflow-builder/panels/useBuilderAiActions.ts)):

1. **chat-fill first (unchanged).** If a config field is highlighted (`shouldRouteChatFill`),
   the send fills that field — highest precedence, exactly as before.
2. **follow-up mode → planner (unchanged).** If a plan is awaiting required-input details
   (`followUpMode === true`), the reply always goes to the planner and is **never re-classified**
   (so "Use #general" can't be misread as a question).
3. **otherwise `classifyComposerIntent(text)`** ([`classifyComposerIntent.ts`](../../../../features/workflow-builder/ai/classifyComposerIntent.ts)):
   - `qa` → read-only diagnosis Q&A (`handleAskDiagnosisQuestion`) → answer renders as `diagnosis_qa`.
   - `plan` → the existing planner flow (`handleSubmit` → `ai.plan` / `ai.submitFollowUp`).
   - `clarify` → an in-feed `intent_clarification` bubble (no model call, no charge).

**Classification policy** (deterministic, case-insensitive, leading-token/phrase signals on the
trimmed string — `qa | plan | clarify`, never an LLM): clear questions ("Why won't this run?",
"What should I fix first?", "Explain this error.") route to **Q&A**; clear build/edit commands
("Add a Slack step.", "Connect Gmail to this.", "Remove this step.") route to the **planner**;
vague/mutation-capable prompts with no concrete object ("Fix this.", "Make this work.") and
**mixed explanation+action prompts** ("Why is this broken and fix it?") route to **clarify** so
the user chooses — a mixed/ambiguous mutation prompt never silently auto-triggers the planner.

## 4. Clarification behavior

- Session-local `intent_clarification` assistant bubble, rendered by
  [`_BuilderAiPanelClarification.tsx`](../../../../features/workflow-builder/panels/_BuilderAiPanelClarification.tsx)
  (added CS-2; fanned out via `_BuilderAiPanelChat.tsx` / `_BuilderAiPanelMessageItem.tsx` /
  `_BuilderAiPanelMessageList.tsx`).
- Copy: the assistant can either explain what's wrong or plan changes, and asks which the user
  wants. Two quick actions:
  - **"Explain the issue"** → Q&A route (read-only) with the retained text.
  - **"Plan a fix"** → planner route with the retained text.
- The **retained prompt is not rendered** in the bubble (it is carried for reuse only).
- **Resolve-once**: after a choice the actions disable, preventing double-submit (mirrors
  `chat_fill`). No model call is made until the user picks.
- Session-local — **not** added to `persistedMessageToChat`, so it never rehydrates on reopen.

## 5. Q&A behavior (unchanged contract)

Routing to `qa` calls the **same** AI-DIAG-QA-2 backend as before — read-only, single-shot,
session-local, no patch generation, no Apply/Preview controls from Q&A, no run/activate/
deactivate, no credential/integration mutation. Answers still render as `diagnosis_qa` in the
**same** message feed. `selectedNodeId` is still forwarded from the active config node
(`configSlice.activeNodeId`) as an API hint only — validated server-side, never echoed, never
rendered, omitted when no node is open. `askDiagnosisQuestion` and the route are byte-for-byte
unchanged.

## 6. Planner behavior (unchanged)

The existing planner flow is preserved. The planner **cannot auto-apply** — Apply remains an
explicit, separate user action (`PlanResultBody` apply controls). Routing only decides *whether*
a send reaches the planner; it changes nothing downstream of it.

## 7. UI cleanup

- **Deleted** [`_BuilderAiPanelQa.tsx`](../../../../features/workflow-builder/panels/_BuilderAiPanelQa.tsx)
  (the mini box, 104 lines removed in CS-4) — verified absent from the working tree.
- Removed the mini-box render and its prop threading (`onAskDiagnosisQuestion` / `asking` /
  `qaPanelBusy`) from `_BuilderAiPanelComposer.tsx` and `BuilderAiPanel.tsx`.
- Q&A answers still render as `diagnosis_qa`, and `intent_clarification` renders, in the same
  single message feed.

## 8. Security / no-leak guarantees

- **Backend untouched and read-only.** `/ai/diagnose/qa` still re-derives the diagnosis
  server-side and sends only the allow-listed projection + safe selected-node summary — the model
  never sees raw/ungrounded workflow JSON. The router only *calls* the Q&A route; it never
  invents a client-side answer.
- The router (`classifyComposerIntent`) reads **only the user's typed string** and returns an
  enum — it never reads or emits graph internals.
- Nothing in the new surfaces renders raw node ids, edge ids, DB ids, account ids, config values,
  provider response bodies, tokens, secrets, raw run logs, unbounded workflow JSON, or
  `{{nodeId.path}}` reference tokens.
- The clarification bubble renders **fixed copy only**; the **retained prompt is not rendered**.
- Q&A stays explanation-only — no patch, no Apply/Preview from Q&A, no run/activate/deactivate,
  no credential/integration mutation. Planner stays proposal-only — **Apply remains explicit.**

## 9. Data / RLS / model notes

- **No new tables, RLS, GRANT, or migration in this arc.** It is UI/routing only.
- The Q&A path it routes to still depends on the AI-DIAG-QA-2 telemetry migration
  `20260703000000_ai_cost_events_feature_add_workflow_qa.sql`, which remains **applied to the DEV
  DB only — NOT pushed, NOT prod** (carried over from AI-DIAG-QA-2/QA-3; the ship batch must run
  it through the normal deploy flow or `workflow_qa` telemetry inserts fail the CHECK in prod).
- **No new feature flag.** OpenAI remains live/ON in prod and AI credit enforcement is OFF unless
  Marcus changes the env — this arc does not touch that decision.

## 10. Deferred / known limitations

- **OpenAI live in prod, credit enforcement off** unless Marcus changes env (carried over; not
  changed here).
- **Production still shows the old mini Q&A box** until this refactor is pushed/deployed — all
  four AUTOROUTE commits are local-only.
- **Soft line-count warnings remain** on three touched files (above the soft limit, not failing):
  - [`_BuilderAiPanelChat.tsx`](../../../../features/workflow-builder/panels/_BuilderAiPanelChat.tsx) — 581 lines
  - [`_BuilderAiPanelMessageItem.tsx`](../../../../features/workflow-builder/panels/_BuilderAiPanelMessageItem.tsx) — 475 lines
  - [`useBuilderAiActions.ts`](../../../../features/workflow-builder/panels/useBuilderAiActions.ts) — 597 lines
- **`DIAGNOSIS_QA_MAX_QUESTION_LENGTH` is now unused client-side** but is intentionally
  retained/exported in [`lib/api/ai/diagnostics.ts`](../../../../lib/api/ai/diagnostics.ts) as
  backend-cap documentation (single definition, no client consumer) — remove later only if
  desired.
- No multi-turn memory; mixed-intent always defers to the user via clarify (by design).

## 11. Verification baseline

**All numbers below are INHERITED from the four implementation sessions — NOT re-run in this
docs-only closeout.** This session re-verified only **repo/push state** (git): the four commits
are local/unpushed, `origin/v2-main` is `dd285099f`, local is 15 ahead / 0 behind. **No
tests / typecheck / lint / lint:structure were run this session.**

- **CS-1 (`e0212b481`)** — `classifyComposerIntent` unit tests **51**, later hardened to **59**
  (the +12 added in CS-3).
- **CS-2 (`7fa13774a`)** — intentClarification **10**, diagnosisQa **17**, chatFill **5**,
  diagnose **8**.
- **CS-3 (`1ff3c0b24`)** — autoRoute **14**, classifier **59**, workflow-builder panels + ai
  suites **68 suites / 902 tests**.
- **CS-4 (`d117cd2af`)** — diagnosisQa **15**, chatFillHint **10**, autoRoute **14**,
  intentClarification **10**, workflow-builder panels + ai **68 suites / 900 tests**,
  `npm run typecheck` → **0 errors**, ESLint → **0 errors on touched files**,
  `npm run lint:structure` → **OK**.

- **Feature flags:** none added by this arc; OpenAI-enabled + AI-credit enforcement state
  unchanged (enforcement OFF in prod per Marcus).
- **Unapplied migration:** `20260703000000_ai_cost_events_feature_add_workflow_qa.sql` — dev DB
  only, **not prod** (inherited from AI-DIAG-QA-2; ship batch must apply it).

## 12. Push / deploy status

- `e0212b481`, `7fa13774a`, `1ff3c0b24`, `d117cd2af` all remain **LOCAL / UNPUSHED**. No push was
  performed this session.
- Production still runs the old mini Q&A box until this batch ships, and the `workflow_qa`
  telemetry migration must reach prod through the normal deploy flow with it.

## 13. Recommended next tracks

- **Ship batch** — when Marcus approves, push the AI-DIAG-QA-2 + QA-3 + AUTOROUTE commits as one
  verified batch, run the `workflow_qa` migration in prod, then prod-smoke a real round-trip:
  a question → `diagnosis_qa`, a build command → planner, a mixed/vague prompt → clarification.
- **Soft line-count cleanup** — split `_BuilderAiPanelChat.tsx` / `_BuilderAiPanelMessageItem.tsx`
  / `useBuilderAiActions.ts` to clear the warnings (mechanical, low risk).
- **Decide `DIAGNOSIS_QA_MAX_QUESTION_LENGTH`** — keep as backend-cap doc or remove the unused
  client export.
- **Durable rate limiting** for the AI Q&A / explain / repair surface before broad rollout
  (still deferred).

## 14. Closeout confirmation

Docs-only. Nothing pushed. Doc: `docs/slices/phase-4/ai/ai-diag-qa-autoroute-closeout.md`.
