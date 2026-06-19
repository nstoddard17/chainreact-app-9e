# 4.AI-DIAG-QA-AUTOROUTE-1 — One Builder AI composer with deterministic intent auto-routing — Plan

**Type:** Planning / design only. **No source, migrations, tests, UI, or behavior changes in this slice. Nothing pushed.**
**Date:** 2026-06-17
**Branch:** `v2-main`

**Source of truth (verified current state — files read for this plan):**
[`_BuilderAiPanelQa.tsx`](../../../../features/workflow-builder/panels/_BuilderAiPanelQa.tsx) (the separate Q&A mini-input to remove) ·
[`_BuilderAiPanelComposer.tsx`](../../../../features/workflow-builder/panels/_BuilderAiPanelComposer.tsx) (the one real composer; today also renders the mini box + Check/Clear actions) ·
[`BuilderAiPanel.tsx`](../../../../features/workflow-builder/panels/BuilderAiPanel.tsx) (`handleComposerSubmit`: chat-fill vs plan routing + qa props wiring) ·
[`useBuilderAiActions.ts`](../../../../features/workflow-builder/panels/useBuilderAiActions.ts) (`handleSubmit` → planner `ai.plan`/`ai.submitFollowUp`; exposes `asking`, `followUpMode`, `selectedNodeId` from `configSlice.activeNodeId`) ·
[`useBuilderDiagnosisActions.ts`](../../../../features/workflow-builder/panels/useBuilderDiagnosisActions.ts) (`handleAskDiagnosisQuestion`, `handleCheckWorkflow`, `handleExplainDiagnosis`, in-flight guards) ·
[`_BuilderAiPanelChat.tsx`](../../../../features/workflow-builder/panels/_BuilderAiPanelChat.tsx) (`ChatMessage` union + `diagnosis_qa` kind) ·
[`_BuilderAiPanelMessageItem.tsx`](../../../../features/workflow-builder/panels/_BuilderAiPanelMessageItem.tsx) (per-message render fan-out) ·
[`_BuilderAiPanelDiagnosis.tsx`](../../../../features/workflow-builder/panels/_BuilderAiPanelDiagnosis.tsx) (`DiagnosisQaBody`) ·
[`lib/api/ai/diagnostics.ts`](../../../../lib/api/ai/diagnostics.ts) (`askDiagnosisQuestion`, `DIAGNOSIS_QA_MAX_QUESTION_LENGTH`) ·
[`shouldRouteChatFill.ts`](../../../../features/workflow-builder/ai/shouldRouteChatFill.ts) (existing deterministic composer-routing precedent).

---

## 1. Context

AI-DIAG-QA-3 (`facc05666`) shipped the Builder AI Q&A UI by adding a **second input** —
`_BuilderAiPanelQa.tsx`, a mini Q&A box inside the AI panel — on top of the existing plan
composer. Result: two inputs in one assistant = "chat inside chat." Marcus's decision:
**one composer, one send action, deterministic auto-routing behind the scenes, no second
button.** OpenAI stays ON in prod for now (no launched users; temporary free/unmetered AI
is acceptable). This plan designs that refactor. It changes **UI/routing only** — the Q&A
backend (`/api/workflows/[id]/ai/diagnose/qa`) and `askDiagnosisQuestion` client stay
byte-for-byte the same and read-only.

Parent: [`ai-diag-qa-3-closeout.md`](./ai-diag-qa-3-closeout.md) ·
[`ai-diag-qa-2-closeout.md`](./ai-diag-qa-2-closeout.md).

## 2. Current codebase findings (verified)

- **The panel already has one feed + one composer.** `BuilderAiPanel` renders
  `BuilderAiPanelMessageList` (the single feed) + `BuilderAiPanelComposer` (the textarea +
  "Plan with AI" send + Check/Clear actions). Q&A answers already render **in that same
  feed** as the `diagnosis_qa` message kind. So "one feed" already exists; the only stray
  surface is the mini box.
- **`handleComposerSubmit` (BuilderAiPanel.tsx) is the single routing seam.** Today it does:
  if a config field is highlighted (`shouldRouteChatFill`) → chat-fill; else
  `a.handleSubmit()` → planner. This is exactly where intent routing slots in.
- **There is already a deterministic, pure, unit-tested composer router** —
  `shouldRouteChatFill(target, followUpMode)`. The intent router should mirror that shape
  (pure module, no panel imports).
- **The planner submit** (`useBuilderAiActions.handleSubmit`) calls `ai.plan(...)` for a new
  request or `ai.submitFollowUp(...)` in `followUpMode` (a plan awaiting required-input
  details). The planner **never auto-applies** — Apply is always a separate explicit click
  (`PlanResultBody` apply controls). Verified.
- **The Q&A handler** (`useBuilderDiagnosisActions.handleAskDiagnosisQuestion`) calls
  `askDiagnosisQuestion(wfId, question, currentDraft, selectedNodeId?)`. The route re-derives
  the diagnosis server-side (`diagnoseWorkflowForAgent`) and only sends an allow-listed
  projection + a safe selected-node summary to the model — **the model never sees raw
  workflow JSON**. `selectedNodeId` comes from `configSlice.activeNodeId` (hint only, never
  rendered). Read-only; no patch/Apply/run/mutation.
- **The mini box** (`_BuilderAiPanelQa.tsx`) owns its own question text + `asking`/`panelBusy`
  disabled logic and is rendered inside `BuilderAiPanelComposer`. It is the only thing to
  delete.
- **Message kinds today** (`ChatMessage` union): `plan_result`, `applied`, `apply_failure`,
  `error`, `diagnosis`, `diagnosis_explanation`, `repair_proposal`, `repair_preview`,
  `diagnosis_qa`, `chat_fill`, plus `user`. **No clarification kind exists.**

## 3. Product / model decision

**What this is:** a deterministic intent router on the one composer that sends a typed
message to either **Q&A** (read-only diagnosis answer) or the **planner** (build/edit
proposal), and on genuine ambiguity renders an in-feed **clarification** with two quick
actions. **What it is deliberately NOT:** no second persistent input, no "Ask" button, no
LLM-based intent classifier (cost/latency/nondeterminism), no multi-turn memory, no change to
the Q&A backend contract, no new feature flag. Routing is the only new logic; everything
downstream (planner, Q&A, Check, Explain, Preview/Apply) is unchanged.

## 4. Recommended approach

A pure module `classifyComposerIntent(text): IntentRoute` returning one of
**`qa` | `plan` | `clarify`**, wired into `handleComposerSubmit` with this **precedence**:

1. **chat-fill** — if a config field is highlighted (`shouldRouteChatFill`), keep today's
   behavior (unchanged). Highest precedence.
2. **followUpMode** — if a plan is awaiting required-input details (`followUpMode === true`),
   the reply **always goes to the planner** (`handleSubmit`). A follow-up answer is never
   re-classified. (Prevents "Use #general" being misread as a question.)
3. **intent router** — otherwise `classifyComposerIntent(text)`:
   - `qa` → `handleAskDiagnosisQuestion(text)` → answer renders as `diagnosis_qa`.
   - `plan` → `handleSubmit()` (unchanged planner path).
   - `clarify` → append an `intent_clarification` assistant message with two quick actions
     (no model call, no charge); the composer text is **retained** so the chosen action
     reuses it.

### Routing policy (deterministic, case-insensitive, on the trimmed message)

The classifier works on **leading-token / phrase signals**, not bag-of-words, so a verb at
the start dominates. Order of checks: **both-intent → plan → qa → clarify (default for
unmatched/ambiguous)**.

**(2) Q&A signals — route to `qa`:**
- Leading interrogatives: `why`, `what`, `what's`, `how`, `which`, `can i`, `should i`,
  `do i`, `is this`, `are there`, `where`.
- Ends with `?` AND contains no leading build verb.
- Diagnostic phrasings: `explain …`, `what's wrong`, `what should i fix`, `can i ignore`,
  `what data is available`, `which step …`, `why won't this run`.
- Examples that must route Q&A: "Why won't this run?", "What should I fix first?",
  "Can I ignore this?", "What data is available here?", "Explain this error.", "Which step
  is causing the issue?"

**(3) Planner signals — route to `plan`:**
- Leading imperative build verbs: `add`, `create`, `build`, `make`, `change`, `update`,
  `remove`, `delete`, `connect`, `rename`, `set`, `move`, `insert`, `replace`, `send`,
  `wire`, `hook up`, `turn … into`.
- Examples that must route plan: "Add a Slack step.", "Connect Gmail to this.", "Remove this
  step.", "Build a workflow that…", "Make it send an email after this."
- **Note on `fix`:** bare "Fix this." is **ambiguous** (see clarify); but "fix the URL field"
  / "add a fix that…" with a concrete object lean plan — keep `fix` OUT of the plain plan
  verb list and let the both-intent / clarify rules handle it (safer).

**(4) Clarification triggers — route to `clarify`:**
- Vague, mutation-capable, no concrete object: "Fix this.", "Help me.", "Make this work.",
  "What now?", "Can you handle this?", "Sort this out.", "Do something."
- Anything that matches **neither** a Q&A nor a plan signal and is short/imperative-ish →
  default `clarify` (never silently guess when mutation might be involved).
- Pure-question unmatched text (e.g. starts interrogative but odd) → prefer `qa` (read-only,
  safe) over clarify, since Q&A can't mutate.

**(5) Both explanation + action ("Why is this broken and fix it?") → `clarify`.**
When the text contains **both** a Q&A signal and a plan signal, do **not** silently do one
(or both). Render the clarification so the user picks. Rationale: doing both would either
surprise-mutate-plan after answering, or bury the build request under an answer. This is the
single most important safety rule — a mixed intent must never auto-trigger the planner.

### Why deterministic (not an LLM classifier)
Mirrors `shouldRouteChatFill`: pure, free, instant, unit-testable, no nondeterminism, no
extra AI spend. Misroute cost is low anyway (planner never auto-applies; Q&A is read-only),
but determinism keeps behavior predictable — Marcus's explicit requirement.

## 5. Alternatives considered

| Option | Predictable | Mutation-safe | UX | AI cost | Verdict |
|---|---|---|---|---|---|
| **A. Deterministic router + clarify (recommended)** | High (pure rules) | High (clarify on ambiguity; planner never auto-applies) | One composer, no extra button | $0 | **Chosen** |
| B. LLM intent classifier | Medium (nondeterministic) | High | One composer | adds a model call per send | Rejected — cost + nondeterminism; violates "predictable" |
| C. Mode toggle (Build/Ask segmented) | Highest | High | Adds a visible control | $0 | Rejected — Marcus said no second control / "behind the scenes" |
| D. Keep mini box | n/a | High | "chat in chat" | $0 | Rejected — the problem being fixed |

## 6. Security / no-leak (unchanged contract)

- **Backend untouched.** `/ai/diagnose/qa` keeps re-deriving the diagnosis server-side and
  sending only the allow-listed projection + safe selected-node summary — **the model never
  sees raw/ungrounded workflow JSON** (policy point 4 is already satisfied by the existing
  backend; the router just must call the Q&A route, not invent a client-side answer).
- **No diagnosis yet + Q&A route:** nothing special needed — the Q&A route already re-derives
  the deterministic diagnosis itself, so a Q&A with no prior "Check" still gets grounded
  context. The router never passes raw JSON to the model.
- Q&A stays read-only: **no patch, no Apply/Preview from Q&A, no run/activate/deactivate, no
  credential/integration mutation.** The `diagnosis_qa` renderer (safe fields only) is
  unchanged.
- Planner unchanged: still proposal-only; **Apply remains explicit.**
- No secrets / raw node-edge-DB-account ids / config values / `{{nodeId.path}}` tokens
  surfaced — `classifyComposerIntent` reads only the user's typed string and returns an enum;
  it never reads or emits graph internals. The clarification message renders fixed copy only.
- **No new feature flag, no multi-turn memory, no env change.**

## 7. UI / service / message-kind expectations

- **Composer:** unchanged primary send ("Plan with AI" label may become a neutral "Send" —
  open question Q3). Remove the mini Q&A box. No second button.
- **Clarification UI shape:** an in-feed assistant bubble (new kind `intent_clarification`),
  body copy *"I can explain what's wrong, or I can plan changes to fix it. Which do you
  want?"* + two quick-action buttons:
  - **"Explain the issue"** → Q&A route with the retained text.
  - **"Plan a fix"** → planner route with the retained text.
  Resolved-once (like `chat_fill`): after a choice, the buttons disable. No model call is made
  until the user picks.
- **New message kind:** `intent_clarification` (session-local, never persisted — like
  `diagnosis_qa`/`chat_fill`; not added to `persistedMessageToChat`). Carries the retained
  prompt + a `resolved` flag.
- **No backend/route/client signature changes.** `askDiagnosisQuestion` is called exactly as
  today.

## 8. Which current Q&A files to remove vs retain

| File | Action |
|---|---|
| `_BuilderAiPanelQa.tsx` | **DELETE** (the mini box) |
| `_BuilderAiPanelComposer.tsx` | **Edit** — drop the mini box + its `onAskDiagnosisQuestion`/`asking`/`qaPanelBusy` props |
| `BuilderAiPanel.tsx` | **Edit** — route `handleComposerSubmit` through the new classifier; render clarification quick-action handlers |
| `useBuilderAiActions.ts` | **Edit** — add `handleComposerIntentSubmit` (classify → qa/plan/clarify); keep `asking`/`selectedNodeId` wiring |
| `useBuilderDiagnosisActions.ts` | **Retain** — `handleAskDiagnosisQuestion` reused as-is |
| `_BuilderAiPanelChat.tsx` | **Edit** — add `intent_clarification` kind to the union (+ keep `diagnosis_qa`) |
| `_BuilderAiPanelMessageItem.tsx` | **Edit** — render the `intent_clarification` bubble (keep `diagnosis_qa`) |
| `_BuilderAiPanelDiagnosis.tsx` / `DiagnosisQaBody` | **Retain** — unchanged |
| `lib/api/ai/diagnostics.ts` | **Retain** — unchanged |
| **NEW** `features/workflow-builder/ai/classifyComposerIntent.ts` | **Add** — the pure router (sibling of `shouldRouteChatFill.ts`) |

## 9. Tests required (what the implementation must prove)

- **`classifyComposerIntent` unit tests (the core):** each Q&A example → `qa`; each plan
  example → `plan`; each vague example → `clarify`; **mixed "explain + fix" → `clarify`**;
  `?`-terminated non-build → `qa`; unmatched short imperative → `clarify`; case/whitespace
  insensitivity.
- **Routing integration (panel):** chat-fill precedence preserved; `followUpMode` reply
  always → planner (never Q&A); `qa` classification calls `askDiagnosisQuestion` (not the
  planner) and renders `diagnosis_qa`; `plan` calls the planner; `clarify` renders
  `intent_clarification` with two actions and **no model call** until a choice.
- **Clarification actions:** "Explain the issue" → Q&A with retained text; "Plan a fix" →
  planner with retained text; buttons resolve-once.
- **Safety regressions:** Q&A still renders no Apply/Preview; no-leak hostile-mock test;
  Explain / Check / Preview-fix / Apply flows still pass; **no `builder-ai-qa-input` mini box
  remains**; composer renders exactly one input.
- **Disabled/guards:** empty/whitespace/over-500/in-flight/panel-busy still gate the send;
  `asking` interplay unchanged.
- Update `BuilderAiPanelComposer.chatFillHint.test.tsx` (drop mini-box props) and rework
  `BuilderAiPanel.diagnosisQa.test.tsx` to the single-composer flow.

## 10. Implementation slice breakdown (later slices — not this doc)

- **CS-1 — `classifyComposerIntent` pure module + exhaustive unit tests.** No wiring yet. The
  policy table in §4 is the test fixture.
- **CS-2 — `intent_clarification` message kind + renderer** (`_BuilderAiPanelChat.tsx`,
  `_BuilderAiPanelMessageItem.tsx`), session-local, two quick actions, resolve-once.
- **CS-3 — wire the router into `handleComposerSubmit`** (precedence: chat-fill → followUp →
  classifier), add `handleComposerIntentSubmit` + clarification action handlers.
- **CS-4 — delete `_BuilderAiPanelQa.tsx`, strip mini-box props from the composer/panel,**
  update the two affected test files; full regression + typecheck/eslint/lint:structure.

No new flag; the refactor ships as the default composer behavior once CS-4 lands and is
verified. (OpenAI stays ON in prod per Marcus; this is UI-only and does not touch that.)

## 11. Risks / open questions

- **Q1 — Misroute tolerance.** A "build" phrased as a question (e.g. "Can you add Slack?")
  starts with `can you` (Q&A signal) but is a build request. Recommendation: treat
  `can you <build-verb>` / `could you <build-verb>` as a **plan** signal (build verb after a
  polite lead-in wins); add to the policy + tests. Low harm either way (planner never
  auto-applies).
- **Q2 — Default for total non-match.** Recommendation: short/imperative non-match →
  `clarify`; clearly-interrogative non-match → `qa` (read-only safe). Confirm with Marcus.
- **Q3 — Composer button label.** "Plan with AI" implies build-only, but the one composer now
  also asks. Recommendation: relabel to neutral **"Send"** (or "Ask / Plan"). Cosmetic; flag
  for Marcus.
- **Q4 — Clarification persistence.** Keep session-local (not persisted), consistent with
  `diagnosis_qa`/`chat_fill`. No multi-turn memory introduced.
- **Q5 — `followUpMode` + a genuine question mid-plan.** If a user asks an unrelated question
  while a plan awaits details, it routes to planner (followUp precedence) and may not parse.
  Acceptable for v1 (rare); revisit if it bites. Not a mutation risk.

## 12. Acceptance criteria

- **This planning slice:** the doc exists under `docs/slices/phase-4/ai/`, every current-state
  claim is tied to a read file, **no source/test/UI/migration changed, nothing pushed.**
- **Implementation (later):** one composer, one send, no mini box; deterministic routing per
  §4; mixed-intent → clarify; Q&A backend untouched/read-only; planner still explicit-apply;
  no-leak preserved; no new flag; tests in §9 green; typecheck/eslint/lint:structure clean.

## 13. Hard boundaries (unchanged by this slice)

No code, tests, migrations, or env changed. Q&A backend contract untouched. No push. No flag.
No multi-turn memory. OpenAI prod flag untouched (Marcus owns that decision).

## 14. Recommended next step

Pick up **CS-1** — author `features/workflow-builder/ai/classifyComposerIntent.ts` (pure,
no panel imports, mirrors `shouldRouteChatFill.ts`) with the §4 policy table encoded as its
unit-test fixture. It's the lowest-risk, highest-leverage piece and unblocks CS-2–CS-4.
