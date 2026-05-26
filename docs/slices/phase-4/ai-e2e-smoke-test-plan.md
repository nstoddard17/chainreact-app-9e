# AI E2E Smoke Test Plan (Slice 4.AI-15)

**Goal:** before adding the next major AI feature (chat / thread persistence / templates / further model surfaces), pin a single document that maps **every realistic AI user flow** to the test(s) that already cover it — plus a short manual smoke checklist for the live dev server, since unit-test mocks can't catch real wiring (route file paths, env-var pickup, real model-response shape, real URL encoding, real DB row shape).

This is a **coverage map**, not a build plan. It is the source of truth for "is the AI demo-ready?" until the next AI feature lands.

---

## Non-goals

- No full chat / thread persistence.
- No new AI backend features.
- No provider metadata changes.
- No billing/tasks changes.
- No new Playwright walkthrough at AI-15 (noted as an optional follow-up).
- No new tests **unless an audit gap is obvious** (this audit found none — see §3).

---

## 1. Surfaces in scope

| Surface | File | Tests |
|---|---|---|
| Builder AI panel (plan → preview → apply) | [`features/workflow-builder/panels/BuilderAiPanel.tsx`](../../../features/workflow-builder/panels/BuilderAiPanel.tsx) | [`tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx) |
| Failed-run repair block | [`features/workflow-builder/panels/RunResultsRepairBlock.tsx`](../../../features/workflow-builder/panels/RunResultsRepairBlock.tsx) | [`tests/unit/features/workflow-builder/panels/RunResultsPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/RunResultsPanel.test.tsx) |
| Shared AI result views | [`features/workflow-builder/ai/`](../../../features/workflow-builder/ai/) | [`tests/unit/features/workflow-builder/ai/`](../../../tests/unit/features/workflow-builder/ai/) |
| Plan route | [`app/api/workflows/[id]/ai/plan/route.ts`](../../../app/api/workflows/[id]/ai/plan/route.ts) | [`tests/unit/app/api/workflows/ai-plan-route.test.ts`](../../../tests/unit/app/api/workflows/ai-plan-route.test.ts) |
| Apply route | [`app/api/workflows/[id]/ai/apply/route.ts`](../../../app/api/workflows/[id]/ai/apply/route.ts) | [`tests/unit/app/api/workflows/ai-apply-route.test.ts`](../../../tests/unit/app/api/workflows/ai-apply-route.test.ts) |
| Repair route | [`app/api/workflows/[id]/runs/[runId]/ai/repair/route.ts`](../../../app/api/workflows/[id]/runs/[runId]/ai/repair/route.ts) | [`tests/unit/app/api/workflows/ai-repair-route.test.ts`](../../../tests/unit/app/api/workflows/ai-repair-route.test.ts) |
| Analytics route (current-user) | [`app/api/ai/usage/route.ts`](../../../app/api/ai/usage/route.ts) | [`tests/unit/app/api/ai/usage-route.test.ts`](../../../tests/unit/app/api/ai/usage-route.test.ts) |
| Planner service | [`services/ai/planner/planWorkflowFromPrompt.ts`](../../../services/ai/planner/planWorkflowFromPrompt.ts) | [`tests/unit/services/ai/planner/planWorkflowFromPrompt.test.ts`](../../../tests/unit/services/ai/planner/planWorkflowFromPrompt.test.ts) |
| Repair service | [`services/ai/repair/suggestWorkflowRepair.ts`](../../../services/ai/repair/suggestWorkflowRepair.ts) | [`tests/unit/services/ai/repair/suggestWorkflowRepair.test.ts`](../../../tests/unit/services/ai/repair/suggestWorkflowRepair.test.ts) |
| Apply service | [`services/ai/apply/applyWorkflowPatch.ts`](../../../services/ai/apply/applyWorkflowPatch.ts) | [`tests/unit/services/ai/apply/applyWorkflowPatch.test.ts`](../../../tests/unit/services/ai/apply/applyWorkflowPatch.test.ts) |
| Patch validator + preview | [`services/workflows/patch/`](../../../services/workflows/patch/), [`services/ai/preview/`](../../../services/ai/preview/) | [`tests/unit/services/workflows/patch/`](../../../tests/unit/services/workflows/patch/), [`tests/unit/services/ai/preview/previewWorkflowPatch.test.ts`](../../../tests/unit/services/ai/preview/previewWorkflowPatch.test.ts) |
| Observability emitter | [`services/ai/events/recordAiRouteEvents.ts`](../../../services/ai/events/recordAiRouteEvents.ts) | [`tests/unit/services/ai/events/recordAiRouteEvents.test.ts`](../../../tests/unit/services/ai/events/recordAiRouteEvents.test.ts) |
| Analytics composer | [`services/analytics/aiAnalyticsReport.ts`](../../../services/analytics/aiAnalyticsReport.ts) | [`tests/unit/services/analytics/aiAnalyticsReport.test.ts`](../../../tests/unit/services/analytics/aiAnalyticsReport.test.ts) |
| Typed client | [`lib/api/ai.ts`](../../../lib/api/ai.ts) | [`tests/unit/lib/api/ai.test.ts`](../../../tests/unit/lib/api/ai.test.ts) |

---

## 2. Scenario coverage matrix

The 12 scenarios from the AI-15 brief, each mapped to the test(s) that prove the behavior. Line numbers are points-in-time and may drift — search by `describe` / `it` text if they don't match.

### S1 — Model unavailable / NOT_CONFIGURED

| Layer | Test | Evidence |
|---|---|---|
| Service | [`planWorkflowFromPrompt.test.ts`](../../../tests/unit/services/ai/planner/planWorkflowFromPrompt.test.ts) `describe("model failure")` | NOT_CONFIGURED default client → `MODEL_FAILED` (no preview, no mutation) |
| Route | [`ai-plan-route.test.ts`](../../../tests/unit/app/api/workflows/ai-plan-route.test.ts) `it("returns 503 (not 500) when the model is not configured")` | 503 status + structured `code: "MODEL_FAILED"` body |
| UI | [`BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx) `it("shows a friendly message when the model is not configured (MODEL_FAILED)")` | Friendly copy, no apply button, no leak of env-var name |

### S2 — Parse failure / NOT_JSON safe UI

> **Slice 4.AI-19 update.** Live smoke against Claude Sonnet 4.6 produced this exact failure (PARSE_FAILED / NOT_JSON, 36K input + 399 output tokens, `finishReason: "stop"`, content was prose). The fix is **forced Anthropic tool-use** (`responseTool` on `ModelGenerateInput` + `tools` / `tool_choice` in the request body + `tool_use` extraction in the response). Prompt-only enforcement (AI-12C) is no longer the live path; **the parser-layer tests below still guard the parse contract** for any case where a model somehow returns text instead of a tool_use block (the adapter now flags that case as `INVALID_RESPONSE` → `MODEL_FAILED` before parse is even attempted).

| Layer | Test | Evidence |
|---|---|---|
| Adapter (transport-layer guard) | [`anthropicClient.test.ts`](../../../tests/unit/services/ai/modelClients/anthropicClient.test.ts) `it("ignores text-only responses when responseTool was forced ...")` | Text-only response under structured mode → `INVALID_RESPONSE` (retryable). Adapter never falls back to text parsing — the bug forced tool-use solves. |
| Adapter (happy path) | [`anthropicClient.test.ts`](../../../tests/unit/services/ai/modelClients/anthropicClient.test.ts) `it("returns ModelSuccess with JSON.stringify(tool_use.input) ...")` | `tool_use` block extracted, stringified, returned as `text` for the existing parser to validate |
| Parser | [`parseWorkflowPlanResponse.test.ts`](../../../tests/unit/services/ai/planner/parseWorkflowPlanResponse.test.ts) (4 AI-12C cases: preamble, trailing prose, `//` comment, trailing comma) | All → `NOT_JSON`. Still a defense layer for any future provider / path that doesn't go through forced tool-use. |
| Service | [`planWorkflowFromPrompt.test.ts`](../../../tests/unit/services/ai/planner/planWorkflowFromPrompt.test.ts) `describe("parse failure")` + AI-19 wiring tests | `PARSE_FAILED` no preview, no mutation. AI-19: planner injects `WORKFLOW_PLAN_TOOL` on every call; downstream parser still rejects malformed patches via `INVALID_PATCH`. |
| Route | [`ai-plan-route.test.ts`](../../../tests/unit/app/api/workflows/ai-plan-route.test.ts) `it("returns 502 for a parse failure ...")` | 502 status. Live-path failures now route through `MODEL_FAILED → 503` instead, but the parse-failure layer remains defended. |
| UI (generic parse) | [`BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx) `it("shows a format-error message + value-free detail on PARSE_FAILED")` | Generic "wrong format" copy + value-free detail |
| UI (NOT_JSON specific) | [`BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx) `it("shows a JSON-specific message + value-free detail on PARSE_FAILED / NOT_JSON (AI-12C)")` | "returned text instead of JSON" copy (still relevant for the parser-layer fallback) |

### S3 — Needs-input response (planner)

> **Slice 4.AI-20 update.** Live smoke surfaced a second variant of "needs input": the AI returns a *valid patch* AND non-empty `requiredUserInput`. Pre-AI-20 the preview's `canApplyLater: true` leaked through and the UI showed Apply alongside "More information is needed." AI-20 closes that — `canApplyLater` is now gated on `requiredUserInput.length === 0` at both the service layer and the UI layer. The two variants below are now both covered.

**Variant A — null patch (existing).** The model returns `proposedPatch: null` + `requiredUserInput`. Preview never runs.

| Layer | Test | Evidence |
|---|---|---|
| Service | [`planWorkflowFromPrompt.test.ts`](../../../tests/unit/services/ai/planner/planWorkflowFromPrompt.test.ts) `describe("no patch — needs input / unsupported")` + the Stripe-DM degradation case | `proposedPatch: undefined`, `canApplyLater: false`, preview never reached |
| Route | [`ai-plan-route.test.ts`](../../../tests/unit/app/api/workflows/ai-plan-route.test.ts) `it("returns 200 for a no-patch (needs-input) result")` | 200 status (NOT 4xx) |
| UI | [`BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx) `it("shows needs-input and no apply button when the plan needs more info")` | Needs-input list rendered, apply button absent |

**Variant B — valid patch + non-empty requiredUserInput (AI-20 live-regression fix).** The model returns a structurally-valid patch with `AI_FIELD` placeholders AND lists outstanding questions. Preview runs (cost / risk / validation projected), but apply is blocked.

| Layer | Test | Evidence |
|---|---|---|
| Service | [`planWorkflowFromPrompt.test.ts`](../../../tests/unit/services/ai/planner/planWorkflowFromPrompt.test.ts) `describe("apply-readiness gate (AI-20)")` | Patch + `requiredUserInput` → `canApplyLater: false` + AI-20 `blockedReason` ("More information is still needed — answer the questions above and run Plan with AI again."). Preview still runs (cost / risk projected). |
| UI (callout) | [`BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx) `it("hides the Apply button + renders the required-input block ...")` | `builder-ai-required-input-block` renders the guidance copy (AI-21 reworded to "Reply with the missing details below and hit Send details"); Apply + risk-ack hidden. |
| UI (defense in depth) | [`BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx) `it("hides the Apply button even if canApplyLater is (incorrectly) true ...")` | UI gate holds even if a future service regression re-leaks `canApplyLater: true`. |
| UI (apply guard) | [`BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx) `it("apply() is never called when a plan has unresolved requiredUserInput ...")` | `mockApply` never invoked under the blocked state. |

**Variant C — session-local conversational follow-up (AI-21 inline replies).** Same starting state as Variant B (patch + outstanding questions), but the user now replies to the missing details inline in the React Agent rail instead of rewriting the whole prompt. The composer flips into follow-up mode and the next submit reconstructs the planner prompt session-locally (original + asked labels + prior answers + new answer) — same plan route, same preview, same apply gate.

> **Slice 4.AI-21B update.** The follow-up *behavior* shipped in AI-21, but the panel was still form-shaped. AI-21B re-renders the rail as a proper chat — transcript above, composer pinned below, user prompts + follow-up answers as right-aligned bubbles, plan / applied / error results as left-aligned assistant bubbles. The apply-readiness rule + follow-up state machine + no-leak invariants are all preserved; what moved is the layout.

> **Slice 4.AI-21C update.** Refactor-only. The chat rendering is now split across three siblings (`_BuilderAiPanelChat.tsx`, `_BuilderAiPanelComposer.tsx`, `_BuilderAiPanelMessageList.tsx`) for maintainability — `BuilderAiPanel.tsx` is now a 216-line orchestration shell. All testIds + behavior preserved. **Live follow-up smoke status:** PENDING — to be run by Marcus per §5.1 steps 6 → 7e below. The automated regression net (71 AI-21-area tests + the 1306-test full sweep) is the coverage backstop.

> **Scope guardrail.** Workflow-builder React Agent only. The reconstructed prompt lives only in `useBuilderAi` state — no DB persistence, no chat / thread storage, no general app help assistant introduced.

| Layer | Test | Evidence |
|---|---|---|
| Helper (pure) | [`composeFollowUpPrompt.test.ts`](../../../tests/unit/features/workflow-builder/ai/composeFollowUpPrompt.test.ts) — 8 cases (first-turn smoke, section omission, multi-turn priors, ordering, trimming, no-invented-sections) | `Original request:` + asked labels + `Previous follow-up answers:` (only when non-empty) + `User follow-up:` rendered in stable order. Never invents sections. |
| Hook | [`useBuilderAi.test.tsx`](../../../tests/unit/features/workflow-builder/hooks/useBuilderAi.test.tsx) — 9 cases (`followUpMode` derivation, `submitFollowUp` body, chain extends / completes, no-op guards, fresh `plan()` clears prior chain, `reset()` clears chain, transport-error preserves chain, no-leak) | `submitFollowUp` routes the reconstructed prompt through the standard `planWorkflow` client; chain state lives only in the hook and is cleared on `reset` / fresh `plan` / chain completion. |
| UI (composer mode) | [`BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx) `describe("follow-up composer (AI-21)")` `it("switches the composer button copy + hint to follow-up mode ...")` | `Send details` button + `send` kbd hint render when the chain is active. |
| UI (submit) | [`BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx) `describe("follow-up composer (AI-21)")` `it("submitting in follow-up mode sends a reconstructed prompt ...")` | The second `planWorkflow` call body contains `Original request:` + the asked labels + `User follow-up:` + the answer. |
| UI (apply-readiness preserved) | [`BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx) `describe("follow-up composer (AI-21)")` `it("Apply remains hidden during the follow-up chain and only appears after the chain completes")` | AI-20 gate continues to hold across follow-up turns. |
| UI (multi-turn) | [`BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx) `describe("follow-up composer (AI-21)")` `it("supports multi-turn chains ...")` | Turn-3 reconstructed prompt cites turn-2's answer in `Previous follow-up answers:`. |
| UI (reset) | [`BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx) `describe("follow-up composer (AI-21)")` `it("Clear resets the follow-up chain ...")` + `it("Plan-another-change after a successful apply resets the follow-up chain")` | Chain is cleared; next submit is a fresh plan call (no `Original request:` prefix). |
| UI (transport error) | [`BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx) `describe("follow-up composer (AI-21)")` `it("preserves the chain when the follow-up plan call returns an unhandled transport error ...")` | After a failed follow-up call, composer stays in follow-up mode; user can retry without re-typing the original prompt. |
| No-leak | [`BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx) `describe("follow-up composer (AI-21)")` `it("does NOT include raw patch / config / secrets ...")` + [`useBuilderAi.test.tsx`](../../../tests/unit/features/workflow-builder/hooks/useBuilderAi.test.tsx) `it("does not include raw patch / config in the reconstructed prompt")` | Even when the planner response carries a secret-shaped config (`accessToken: ya29.…`), the reconstructed prompt body contains no `accessToken` / `operations` / `patchId` substrings. |

**Variant D — chat layout + pinned composer (AI-21B).** Same flows as Variants A–C, but rendered as a proper chat: message list scrolls above a pinned composer footer; user prompts + follow-up answers stack as right-aligned bubbles; plan results / apply outcomes / errors stack as left-aligned bubbles; the latest plan_result owns the AI-11B / AI-20 breakdown + Apply button; older plan_results collapse to `intentSummary`.

| Layer | Test | Evidence |
|---|---|---|
| Layout — DOM order | [`BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx) `describe("chat layout (AI-21B)")` `it("renders a message list above a pinned composer ...")` | `builder-ai-message-list` precedes `builder-ai-composer` in DOM order. |
| Layout — intro | [`BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx) `it("renders the intro hint before any messages and removes it once the conversation starts")` | `builder-ai-intro` renders only when there are no messages. |
| Layout — user bubble | [`BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx) `it("appends a user message bubble on submit ...")` | Each submit appends a `builder-ai-message-user` bubble with the typed text. |
| Layout — order | [`BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx) `it("appends an assistant plan_result message after the planner returns ...")` | User → assistant ordering preserved in the DOM. |
| Composer — auto-clear | [`BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx) `it("clears the composer textarea immediately after submit ...")` | The textarea empties on submit (chat-style); user bubble is the single live view of the typed text. |
| Required-input — chat body | [`BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx) `it("renders required-input results as the body of the latest assistant plan_result message")` | `builder-ai-needs-input` + `builder-ai-required-input-block` are contained inside the assistant bubble. |
| Multi-turn — kinds | [`BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx) `it("follow-up answer renders as a 'followup' user message ...")` | The first user bubble has `data-kind=prompt`; subsequent follow-ups have `data-kind=followup`. |
| Multi-turn — collapse | [`BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx) `it("collapses older plan_result messages to their intent summary ...")` | Older plan_results render as `builder-ai-plan-result-previous` summary lines; only the latest is `builder-ai-plan-result` with the full breakdown + Apply button. |
| Composer — pinned | [`BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx) `it("composer stays rendered after the assistant responds (pinned bottom)")` | `builder-ai-composer` is present before / during / after the planner round-trip. |
| Apply — chat-rendered | [`BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx) `it("apply success renders as a new assistant message ...")` | `builder-ai-apply-success` is nested inside a `builder-ai-message-assistant` bubble; no raw `accessToken` / `ya29.` leaks through the chat. |
| Stale patch — chat-rendered | [`BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx) `it("STALE_PATCH renders as an assistant apply_failure bubble with a Re-run button ...")` | `builder-ai-rerun-button` works without depending on the (empty) composer textarea — it pulls the most recent user prompt from chat history and re-plans. |
| Transport error | [`BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx) `it("appends an assistant error bubble when a follow-up call fails ...")` + `it("does NOT render the AI-11B inline error twice with the chat-bubble error ...")` | A rejected follow-up call appends a `builder-ai-error-message` chat bubble; the chain stays active so the composer remains in "Send details" mode; the top-level `builder-ai-error` still surfaces the 401 / 404 nuance message. |
| Hook return-value contract | [`useBuilderAi.test.tsx`](../../../tests/unit/features/workflow-builder/hooks/useBuilderAi.test.tsx) `it("plan() returns the AiPlanResult on success ...")` + `it("plan() returns null on a transport-layer rejection ...")` + `it("submitFollowUp() returns the AiPlanResult on success and null on transport failure")` + `it("submitFollowUp() returns null when called with no chain in progress ...")` | The hook's new return-value contract — used by the panel to append assistant messages in lockstep with user messages — is pinned. |

### S4 — Unsupported provider/trigger response

| Layer | Test | Evidence |
|---|---|---|
| Planner grounding | [`buildWorkflowPlanPrompt.test.ts`](../../../tests/unit/services/ai/planner/buildWorkflowPlanPrompt.test.ts) — multiple cases: pending providers omitted, AI-12D no-substitute-trigger rule | Catalog never surfaces a metadata-less provider; planner rule forbids `native:manual.run` as a stand-in |
| Service | [`planWorkflowFromPrompt.test.ts`](../../../tests/unit/services/ai/planner/planWorkflowFromPrompt.test.ts) `it("surfaces unsupportedRequests without fabricating a patch")` | `unsupportedRequests` surfaced, no patch |
| UI | [`BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx) `it("shows unsupported requests safely")` | Rendered in dedicated section, no apply button |

### S5 — Valid low-risk patch apply

| Layer | Test | Evidence |
|---|---|---|
| Apply service | [`applyWorkflowPatch.test.ts`](../../../tests/unit/services/ai/apply/applyWorkflowPatch.test.ts) — happy path | Re-validates, persists via guarded update, returns `appliedPatchId` |
| Route | [`ai-apply-route.test.ts`](../../../tests/unit/app/api/workflows/ai-apply-route.test.ts) — 200 success | 200 status with `appliedPatchId`, `riskLevel`, `summaryText` |
| UI | [`BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx) `it("applies a low-risk plan without confirmation and forwards the patch")` + `it("refreshes the builder and shows success after a successful apply")` | One-click apply, success indicator, builder hydration |

### S6 — High-risk patch confirmation

| Layer | Test | Evidence |
|---|---|---|
| Risk classification | [`services/workflows/patch/riskClassification.ts`](../../../services/workflows/patch/) tests | Deterministic risk from `isDestructive` / `requiresConfirmation` flags — model cannot downgrade |
| Apply service | [`applyWorkflowPatch.test.ts`](../../../tests/unit/services/ai/apply/applyWorkflowPatch.test.ts) — `CONFIRMATION_REQUIRED` path | Service refuses to apply without `confirmed: true` + matching `acceptedRiskLevel` |
| Route | [`ai-apply-route.test.ts`](../../../tests/unit/app/api/workflows/ai-apply-route.test.ts) — 428 path | 428 `CONFIRMATION_REQUIRED` status, structured body |
| UI (Builder) | [`BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx) `it("requires explicit confirmation ...")` + `it("applies a high-risk plan with confirmation ...")` | Checkbox gate, resets per new plan |
| UI (Repair) | [`RunResultsPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/RunResultsPanel.test.tsx) `it("passes confirmation through the existing apply route when the preview marks the patch high-risk")` | Apply button label includes "(confirm \<riskLevel\>)"; confirmation forwarded |

### S7 — Stale patch handling

| Layer | Test | Evidence |
|---|---|---|
| Read-time concurrency | [`planWorkflowFromPrompt.test.ts`](../../../tests/unit/services/ai/planner/planWorkflowFromPrompt.test.ts) — baseRevision reconciliation | Plan service forces `baseRevision = current` so the model's stale token can't drift |
| Write-time concurrency (AI-6B) | [`applyWorkflowPatch.test.ts`](../../../tests/unit/services/ai/apply/applyWorkflowPatch.test.ts) `STALE_PATCH` path | Guarded `updateDraftDefinitionIfRevisionMatches` returns null → `STALE_PATCH` |
| Route | [`ai-apply-route.test.ts`](../../../tests/unit/app/api/workflows/ai-apply-route.test.ts) — 409 path | 409 `STALE_PATCH` status |
| UI | [`BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx) `it("shows a re-run message and a Re-run plan button on STALE_PATCH (no auto-reapply)")` | Explicit re-plan required, no silent retry |

### S8 — Failed-run repair: no-safe-repair

| Layer | Test | Evidence |
|---|---|---|
| Service | [`suggestWorkflowRepair.test.ts`](../../../tests/unit/services/ai/repair/suggestWorkflowRepair.test.ts) — `disconnected integration`, `unknown node metadata`, `no recognizable category`, `FAILED_PREVIEW` (preview-rejected proposal) | Each → `noSafeRepair` with a `reasonCode`, no patch |
| Route | [`ai-repair-route.test.ts`](../../../tests/unit/app/api/workflows/ai-repair-route.test.ts) `it("returns 200 for a no-safe-repair result (recommendations only)")` | 200, structured body, no patch |
| UI | [`RunResultsPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/RunResultsPanel.test.tsx) `it("renders unsupported / no-safe-repair as recommendations only (no Apply button)")` | Recommendations rendered, no apply button |
| Observability | [`recordAiRouteEvents.test.ts`](../../../tests/unit/services/ai/events/recordAiRouteEvents.test.ts) `no_safe_repair` safety block | Distinct `safety_block_reason` so the funnel can count separately from `needs_user_input` |

### S9 — Failed-run repair with required input

| Layer | Test | Evidence |
|---|---|---|
| Service | [`suggestWorkflowRepair.test.ts`](../../../tests/unit/services/ai/repair/suggestWorkflowRepair.test.ts) — `missing required non-text field`, `invalid variable reference with no clear replacement`, `downstream variable reference`, `missing trigger` | Each → `needsUserInput` with labeled `requiredUserInput[]`, no patch |
| Route | [`ai-repair-route.test.ts`](../../../tests/unit/app/api/workflows/ai-repair-route.test.ts) `it("returns 200 for a needs-user-input result")` | 200, `requiredUserInput` populated |
| UI | [`RunResultsPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/RunResultsPanel.test.tsx) `it("renders requiredUserInput labels when the service asks for input (no proposedPatch)")` | Labels rendered, `(field: x)` hint shown when present, no apply button |
| Observability | [`recordAiRouteEvents.test.ts`](../../../tests/unit/services/ai/events/recordAiRouteEvents.test.ts) `needs_user_input` safety block | Funnel counts as a needs-input outcome, not a hard fail |

### S10 — Failed-run repair with previewable patch

| Layer | Test | Evidence |
|---|---|---|
| Service | [`suggestWorkflowRepair.test.ts`](../../../tests/unit/services/ai/repair/suggestWorkflowRepair.test.ts) — `missing required TEXT field → AI_FIELD placeholder patch`, `invalid variable reference with one clear upstream replacement`, `dangling edge → removeEdge` | Each produces a previewable patch via AI-5 |
| Route | [`ai-repair-route.test.ts`](../../../tests/unit/app/api/workflows/ai-repair-route.test.ts) `it("returns 200 with the structured body for repairable + previewed")` | 200 with `proposedPatch` + `preview` |
| UI render | [`RunResultsPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/RunResultsPanel.test.tsx) `it("renders an Apply button when a previewed patch is available")` | Apply button visible, preview changes disclosed |
| UI apply | [`RunResultsPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/RunResultsPanel.test.tsx) `it("does not auto-apply — Apply is a separate explicit click that calls the existing apply route")` | Apply requires user click; reuses the AI-9B apply route |
| Observability | [`recordAiRouteEvents.test.ts`](../../../tests/unit/services/ai/events/recordAiRouteEvents.test.ts) — `repairable` → `ai_patch_proposed` + `ai_patch_previewed` | Two-step funnel event |

### S11 — AI analytics shows events after plan / apply / repair

| Layer | Test | Evidence |
|---|---|---|
| Plan event emission | [`recordAiRouteEvents.test.ts`](../../../tests/unit/services/ai/events/recordAiRouteEvents.test.ts) `recordAiPlanOutcome — mapping` — interaction_started + model_completed + proposed + previewed; failure-stage variants | Feature `workflow_creation` |
| Apply event emission | [`recordAiRouteEvents.test.ts`](../../../tests/unit/services/ai/events/recordAiRouteEvents.test.ts) `recordAiApplyOutcome — mapping` — applied / confirmation_required / validation_failed | Feature `workflow_editing` |
| Repair event emission | [`recordAiRouteEvents.test.ts`](../../../tests/unit/services/ai/events/recordAiRouteEvents.test.ts) `recordAiRepairOutcome (AI-13) — mapping` (9 cases) | Feature `workflow_repair`, scope includes `workflowRunId` |
| Analytics fold | [`aiAnalyticsReport.test.ts`](../../../tests/unit/services/analytics/aiAnalyticsReport.test.ts) `it("composes the COST-7 folds into the combined report shape")` | `byFeature` groups events by the same `feature` strings the recorder writes; `byEventType`, `byModel`, `byTool` |
| Analytics route | [`usage-route.test.ts`](../../../tests/unit/app/api/ai/usage-route.test.ts) — default range, scope, query validation, shape, no-leak | RLS-scoped via `repositories/aiCostEvents:listByUser` |
| Fail-open | [`recordAiRouteEvents.test.ts`](../../../tests/unit/services/ai/events/recordAiRouteEvents.test.ts) `describe("fail-open")` — recorder throw never propagates | Plan/apply/repair routes still return their normal status even if the ledger insert fails |

> **Seam coverage:** the recorder writes the exact `feature` strings (`workflow_creation`, `workflow_editing`, `workflow_repair`) that `groupAiByFeature` in [`services/analytics/ownerAiStats.ts`](../../../services/analytics/ownerAiStats.ts) reads. Each end is tested with the same enum set, so a mismatch would fail the type-checker before any test ran. A full DB round-trip would require a live ledger and is out of scope for unit tests — the manual smoke checklist below covers it.

### S12 — No raw patch / config / secrets shown in UI

| Layer | Test | Evidence |
|---|---|---|
| Patch validator | [`services/workflows/patch/checks.ts`](../../../services/workflows/patch/checks.ts) error/warning messages carry KEY names + registry metadata only; tested in [`tests/unit/services/workflows/patch/`](../../../tests/unit/services/workflows/patch/) | Never echoes config VALUES |
| Preview composer | [`previewWorkflowPatch.test.ts`](../../../tests/unit/services/ai/preview/previewWorkflowPatch.test.ts) — no-leak | Scrubs secret keys + validator messages |
| Repair service | [`suggestWorkflowRepair.test.ts`](../../../tests/unit/services/ai/repair/suggestWorkflowRepair.test.ts) — value-free failure summary | Carries `errorCode` + classification text only |
| Plan route | [`ai-plan-route.test.ts`](../../../tests/unit/app/api/workflows/ai-plan-route.test.ts) `describe("no-leak")` | Response stripped of secret-identifier substrings |
| Apply route | [`ai-apply-route.test.ts`](../../../tests/unit/app/api/workflows/ai-apply-route.test.ts) `describe("no-leak")` | Same guarantee on apply path |
| Repair route | [`ai-repair-route.test.ts`](../../../tests/unit/app/api/workflows/ai-repair-route.test.ts) `describe("no-leak")` + `metadata-driven — no hardcoded provider behavior` | Response sanitized; no provider substring in route source |
| Analytics route | [`usage-route.test.ts`](../../../tests/unit/app/api/ai/usage-route.test.ts) `describe("read-only / no-leak")` | Report has no secret-shaped values |
| Observability | [`recordAiRouteEvents.test.ts`](../../../tests/unit/services/ai/events/recordAiRouteEvents.test.ts) `describe("no-leak")` (plan + repair) | Patch config NEVER forwarded to the recorder — only `opCount` / `reasonCode` / ids |
| Builder UI | [`BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx) `describe("no-leak")` — `it("never renders raw patch config values")` | The opaque-patch contract holds end-to-end |
| Repair UI | [`RunResultsPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/RunResultsPanel.test.tsx) `it("renders the value-free reason code, NOT the raw error details")` | UI never renders raw `error.details` |
| Shared views | [`AiBulletList.test.tsx`](../../../tests/unit/features/workflow-builder/ai/AiBulletList.test.tsx), [`AiRequiredInputList.test.tsx`](../../../tests/unit/features/workflow-builder/ai/AiRequiredInputList.test.tsx) — verbatim-rendering pin | Shared components introduce no new leak surface |

---

## 3. Coverage gaps and decisions

Audit conclusion: **no obvious automation gaps require new tests in this slice.** Every AI-15 scenario is exercised at the service + route + UI layers. The boundaries are tested with mocks; the contract between layers is type-checked (same `AiCostFeature` union, same `RepairSuggestionResult`, same `WorkflowPatch` schema). Adding more unit tests would re-cover ground each side already proves.

Three concerns I considered and **deliberately did not add**:

- **Seam round-trip (recorder writes → analytics reads).** Both sides agree on the same `feature` enum and the same row schema. A DB round-trip needs a live ledger, which is a manual-smoke concern (see §5 step 7), not a unit-test gap.
- **Cross-panel coexistence (Builder + Repair mounted together).** No existing test asserts both shared-component-using panels coexist without test-id collision. Since the shared components only carry the `testId` prop verbatim and each call site passes a distinct id (`builder-ai-*` vs `repair-*`), a collision would require both sides to pass identical ids — which is structurally impossible without a copy-paste regression that would also break every existing consumer test. Low value to add.
- **Stripe failed-payment as a happy-path apply scenario.** Out of scope until the provider track ships [`stripe:event_received` TriggerMeta](./stripe-trigger-meta-plan.md). Stripe failed-payment remains a S3 / S4 (needs-input / unsupported) scenario until then. Do NOT use it as a happy-path smoke target.

The optional Playwright walkthrough (full UI sign-in → plan → preview → apply → analytics-reflects-the-events) would have to inject a mock model adapter at the server boundary — the existing Anthropic adapter at [`services/ai/modelClients/anthropicClient.ts`](../../../services/ai/modelClients/anthropicClient.ts) only reads `ANTHROPIC_API_KEY`. Mocking that requires either (a) an env-driven dispatch (e.g. `AI_MODEL_CLIENT=mock`) or (b) a `fetch`-route intercept like `mockGoogleServer.ts`. Decision: defer to a dedicated `AI-FUTURE-E2E` slice if the manual smoke catches drift. Until then, automated coverage is at the service + route + UI-component layer, which the unit tests above cover thoroughly.

---

## 4. Build-time gates (CI / pre-merge)

Run every gate before declaring an AI-touching change ready:

```bash
npx tsc --noEmit                       # types — model/service/route/UI agree
npm run lint                            # ESLint
npm run lint:structure                  # leaf-folder cap
npm run lint:migrations                 # RLS + policy enforcement on new tables
npx jest tests/unit/services/ai \
         tests/unit/services/analytics \
         tests/unit/services/workflows/patch \
         tests/unit/app/api/workflows/ai-plan-route.test.ts \
         tests/unit/app/api/workflows/ai-apply-route.test.ts \
         tests/unit/app/api/workflows/ai-repair-route.test.ts \
         tests/unit/app/api/ai \
         tests/unit/lib/api/ai.test.ts \
         tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx \
         tests/unit/features/workflow-builder/panels/RunResultsPanel.test.tsx \
         tests/unit/features/workflow-builder/ai
npx jest                                # full suite (also runs the same)
```

Expected baseline at AI-15: full suite reports `~13,450+ passed / 17 skipped / 0 failed`. The exact pass count moves with provider work; the failing/skipped counts are the load-bearing assertion.

---

## 5. Manual dev-server smoke checklist

Run the full unit suite first — if it's red, the dev smoke can't help. This checklist catches what mocks can't: real env-var pickup, real fetch round-trips, real DB rows, real UI hydration.

**Prerequisites.** `npm run dev` running locally with `ANTHROPIC_API_KEY` set in `.env.local`, a logged-in test account, and at least one workflow (a Slack DM + Manual Trigger fallback works — Slack metadata is shipped). Skip Stripe-trigger paths until that provider lands.

### 5.1 — Plan (S1 / S2 / S3 / S4 / S5)

1. Open a workflow in the Builder.
2. In the AI panel: type a clear, supported request — e.g. `Send me a Slack DM when manually run` (Manual Trigger + Slack `send_direct_message`).
3. Click **Plan with AI**.
4. **Expected:** within ~3 s the panel renders an `intentSummary`, optional assumptions, a `preview` block listing the changes (`addNode` × 2, `addEdge` × 1), risk badge `low`, **apply button enabled**.
5. **No raw patch JSON visible. No config values visible. No model API key visible. No `accessToken` substring anywhere.**
6. Type a **deliberately ambiguous** request — e.g. `Send me a DM` (no recipient). Click Plan.
7. **Expected:** "More information is needed before this can be built:" + the missing Slack recipient under needs-input. **No apply button.** No malformed patch preview. The composer button now reads **"Send details"** (AI-21 follow-up mode), and the callout instructs the user to reply with the missing details below.
7b. Now type **just the missing details** (e.g. `Use #general`) into the same composer and click **Send details**.
7c. **Expected (AI-21):** within ~3 s the plan re-renders with the channel resolved. If the model also asked for the message text, the composer stays in follow-up mode and the callout updates to show only the remaining question — reply again and submit. When the final answer completes the chain, the Apply button appears.
7d. Click **Clear conversation** at any point during a follow-up chain. **Expected:** the entire transcript disappears, the composer textarea empties, the chain resets, the button reverts to "Plan with AI", and the next submit is treated as a brand-new prompt (not a follow-up).
7e. **Chat-layout sanity (AI-21B).** Across the steps above, the rail should feel like a chat: the message list scrolls independently above the composer; the composer stays pinned at the bottom of the rail at all times; each submit clears the textarea and appends a right-aligned user bubble; the agent's response appears as a left-aligned assistant bubble below; older plan results (after a follow-up turn) collapse to their intent summary; auto-scroll keeps the newest message in view.
8. Type a **deliberately unsupported** request — e.g. `Send a fax when something happens`. Click Plan.
9. **Expected:** "Not supported yet:" line + the unsupported request. No apply button.
10. (If you have an unset `ANTHROPIC_API_KEY` you can test this; otherwise skip.) **Expected:** "The AI assistant isn't available right now…" — value-free.

### 5.2 — Apply (S5 / S6 / S7)

11. From step 4 (apply-ready low-risk plan), click **Apply change**.
12. **Expected:** within ~1 s success message, builder canvas hydrates with the new nodes/edges, "Plan another change" button appears. The route emitted an `ai_patch_applied` row to the ledger.
13. Plan a **high-risk** change — e.g. `Delete every Slack message in the channel` (if the action is in your catalog).
14. **Expected:** apply button shows "Confirm & apply" + checkbox gate visible. Without checking the box, apply is disabled. Check the box → apply enables → click → success.
15. **Stale patch.** With a plan visible, open the same workflow in another browser tab, edit any node, save. Return to the first tab and click apply.
16. **Expected:** apply rejected with "This workflow changed after the plan was created" + "Re-run plan" button. No auto-retry.

### 5.3 — Failed-run repair (S8 / S9 / S10)

17. Activate a workflow that will fail — e.g. a Slack DM with a deliberately-blank `userId` field. Run it.
18. Wait for the run to complete (failed) and the `RunResultsPanel` to display the error.
19. **Expected:** below the steps, an `AI repair suggestion` block with "Ask AI to suggest a fix" button.
20. Click **Ask**.
21. **Expected (S10 — repairable):** within ~1 s the block renders "Repair available — missing required field" plus a preview of the proposed `updateNodeConfig` placeholder + apply button. Optionally apply; verify the draft definition was updated in the canvas after refresh.
22. Now test **S9 (needs input)**: deliberately break a Slack DM with an invalid `{{nodeId.field}}` variable reference where no clear upstream candidate exists. Re-run → ask AI to fix.
23. **Expected:** "Needs your input — invalid variable reference" + `requiredUserInput` list, **no apply button**.
24. Test **S8 (no safe repair)**: disconnect Slack from your integrations page; re-run a workflow that uses it. Ask AI to fix.
25. **Expected:** "No safe repair — disconnected integration" + a reconnect recommendation, no apply button.

### 5.4 — Analytics (S11)

26. Hit `GET /api/ai/usage` from the same logged-in browser session (e.g. open the URL directly, or curl with the auth cookie).
27. **Expected:** 200 response with non-zero `totalEvents`, `byFeature` showing `workflow_creation` (from your plans) + `workflow_editing` (from your applies) + `workflow_repair` (from your repair clicks). `byEventType` includes `ai_interaction_started`, `ai_patch_proposed`, `ai_patch_previewed`, `ai_patch_applied`, `ai_safety_block_triggered`. No `metadata` values surfaced — only counts / ids / enum names.
28. Try `GET /api/ai/usage?from=2099-01-01&to=2098-01-01`.
29. **Expected:** 400 validation error (sanitized).
30. Sign out and hit `GET /api/ai/usage` without a session.
31. **Expected:** 401.

### 5.5 — No-leak final check (S12)

32. Open the browser dev-tools Network tab while running steps 5.1 / 5.2 / 5.3.
33. For every `/api/workflows/*/ai/*` response and every `/api/ai/usage` response, search the body text for:
    - `sk-ant-`, `Bearer `, `accessToken`, `refreshToken`, `apiSecret`, `clientSecret`, `webhookSecret`, `botToken`, `ya29.`.
34. **Expected:** zero hits. (The unit tests pin this, but a manual dev check catches a careless mid-PR change.)

---

## 6. Bugs found during this audit

**None.** Existing coverage holds. The doc itself is the deliverable — no source code changed under AI-15 except this file and the AI architecture plan's status row.

If a future regression breaks any S1–S12 row, fix the regression in its own slice and update the matching test in the same PR.

---

## 7. When to revisit this plan

- A new AI surface ships (chat panel, template recommendation, optimizer). Add a Surface row to §1, scenario rows as needed.
- ~~A new failure mode appears (e.g. forced tool_choice landing as the JSON enforcement, per the AI-12C revert note). Add a scenario row.~~ **Done in AI-19** — forced tool_choice is now the live JSON enforcement; S2 updated to reflect the transport-layer guard.
- The Stripe `event_received` TriggerMeta lands. Promote Stripe-failed-payment from S3/S4 to a S5/S6 happy-path smoke target in §5.
- Playwright e2e for an AI flow is built. Add a top-level §8 covering it; remove the deferred decision in §3.

[Omitted long context line]
