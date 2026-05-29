# Phase 4 — AI Architecture / React Agent Product + Technical Plan

**Slice:** 4.AI-1
**Type:** Doc-only planning slice. **No runtime/source/test/metadata files modified.**
**Date:** 2026-05-25
**Branch:** `v2-ai-architecture-planning`
**HEAD at authoring:** `5486f1aff` (Merge PR #92 — Phase 2 provider + native-node completion)
**Base baseline:** `origin/v2-foundation`

> Terminology note: **"React Agent" = a ReAct-style (reason → act → observe) tool-using agent**, not a React.js UI component. It reasons about a goal, calls deterministic V2 tools to read state and validate proposals, observes the results, and iterates. The name is already anticipated in [`docs/rules/variable-resolver.md`](../../rules/variable-resolver.md) ("the future React Agent will parse them to reason about workflow variable usage").

---

## Implementation status (living section — updated as AI-* slices ship)

| Slice | Status | Notes |
|---|---|---|
| **AI-1** | shipped | This plan (doc-only). |
| **AI-2** | shipped | Read-only metadata/context tool layer (`services/ai/tools/*`). |
| **AI-3** | shipped | `WorkflowPatch` schema + deterministic validator. See note below. |
| **AI-4** | shipped | Read-only workflow/node explainer (`services/ai/explain/*`). See note below. |
| **AI-5** | shipped | Deterministic WorkflowPatch preview service (`services/ai/preview/*`). See note below. |
| **AI-6** | shipped | Confirmed WorkflowPatch apply service (`services/ai/apply/*`) — first mutating slice. See note below. |
| **AI-6B** | shipped | Apply concurrency hardening (write-time guarded update) + AI-5 `currentRevision` surfacing. See note below. |
| **AI-7** | shipped | Failed-run repair proposal service (`services/ai/repair/*`) — deterministic, proposes + previews, never applies. See note below. |
| **AI-8A** | shipped | Model boundary (`core/ai/*`) + planner prompt/result contract (`services/ai/planner/*`). First model-backed infra; NO live model calls, NO workflow creation yet. See note below. |
| **AI-8B** | shipped | Model-backed plan proposal + preview (`services/ai/planner/planWorkflowFromPrompt.ts`): prompt → injected model client → parse → AI-3/AI-5 preview. NO apply, NO mutation, NO UI. See note below. |
| **AI-8C** | shipped | First real model adapter + runtime config (`services/ai/modelClients/*`): env-driven Anthropic adapter (fetch), fail-safe factory, planner default-client wiring. NO live calls in tests, NO apply/UI/routes. See note below. |
| **AI-9A** | shipped | First app-facing AI route — `POST /api/workflows/[id]/ai/plan` (preview-only). Auth + body validation → `planWorkflowFromPromptForAI` → sanitized result. NO apply, NO mutation, NO UI, NO prompt/response persistence. See note below. |
| **AI-9B** | shipped | Confirmed apply route — `POST /api/workflows/[id]/ai/apply`. Auth + body validation → AI-6 `applyWorkflowPatchForAI` (re-validate + concurrency + confirmation gate inside the service). NO model call, NO auto-apply, NO mutation outside AI-6. See note below. |
| **AI-10** | shipped | AI observability EMISSION — wires the live plan/apply routes into the existing COST-6 `ai_cost_events` ledger (`services/ai/events/*`), fail-open. Reuses COST-6 recorder/sanitizer + COST-7 owner analytics; NO new table, NO UI. See note below. |
| **AI-11** | shipped | Minimal Builder AI panel — first user-facing AI surface (`features/workflow-builder/panels/BuilderAiPanel.tsx` + `hooks/useBuilderAi.ts` + `lib/api/ai.ts`). Prompt → preview → explicit confirm → apply, via the AI-9A/9B routes. NO chat, NO auto-apply, NO model-from-client, NO mutation outside AI-9B. See note below. |
| **AI-11B** | shipped | Builder AI panel UX hardening — clearer per-state copy, readable "What AI plans to change" preview (counts + risk reasons + warnings + cost), safer confirmation (resets per plan), stale-patch re-run (never auto-reapply), char counter, clear/plan-another. UI-only; no new behavior. See note below. |
| **AI-12** | shipped | AI analytics API surface — `GET /api/ai/usage` (CURRENT-USER scoped, read-only) over COST-6 `ai_cost_events` + COST-7 folds (`services/analytics/aiAnalyticsReport.ts`). Owner-wide route BLOCKED pending an admin gate. See note below. |
| **AI-12B** | shipped | Planner prompt/patch-shape hardening + useful needs-input failure. Real-world fix for a valid request reaching the model but failing strict parse (PARSE_FAILED/INVALID_PATCH) before preview: the prompt now specifies the exact WorkflowPatch envelope/op-vocabulary/node/edge shape (op list sourced from `SUPPORTED_OPERATION_KINDS`), steers a null-patch + `requiredUserInput` over a guessed patch, surfaces static-enum config options in the compact catalog, and clarifies the Builder parse-failure copy (value-free stage/code). Prompt/UI hardening only — schema NOT loosened, no apply/preview bypass. See note below. |
| **AI-12C** | shipped (with revert) | Planner JSON-only response hardening — prompt + UI. An initial attempt added an Anthropic assistant `{` prefill but Claude 4.x models (`claude-sonnet-4-6`, `claude-haiku-4-5`) **reject** it with HTTP 400 (`invalid_request_error: This model does not support assistant message prefill. The conversation must end with a user message.`) → reverted in the same slice. What remains: an explicit JSON-only rules block in the prompt (exactly one object, first `{`/last `}`, no fences/prose/comments/trailing commas, rendered last), strengthened constraint #3, and a NOT_JSON-specific safe Builder message. Parser unchanged (NO broad JSON extraction). If prompt-only proves insufficient, the supported next step is forced tool_choice (Anthropic tool-use), not prefill. See note below. |
| **AI-12D** | shipped | Planner config-field grounding fix. Closes the "model invents `message` instead of `text` / `field` instead of `input`" class of bugs. Catalog now surfaces a `configFields: { name, type, required }[]` per action / trigger (derived generically from `FieldMeta`, no per-provider logic); the prompt renders a per-node `config fields:` block with `required:` + `optional:` sub-lines; three new `PLANNER_CONSTRAINTS` forbid (a) keys from displayName/label/description/output, (b) required-field omission, (c) `native:manual.run` substitution for event-driven triggers the user actually asked for. Strict schema unchanged. See note below. |
| **AI-13** | shipped | Failed-run repair route + Builder entry point. `POST /api/workflows/[id]/runs/[runId]/ai/repair` — thin wrapper over the AI-7 deterministic service (`suggestWorkflowRepairForAI`) plus a `RepairBlock` rendered in `RunResultsPanel` only on `status === "failed"`. NO model call (AI-7 is deterministic), NO mutation, NO apply (apply REUSES `POST /api/workflows/[id]/ai/apply`), NO prompt/completion persistence. Observability via a new `recordAiRepairOutcome` helper that emits into the COST-6 ledger (`feature: "workflow_repair"`, scope includes `workflowRunId`) — no new event table. See note below. |
| **AI-14** | shipped | Shared AI result-rendering components. The Builder AI panel and the Repair block now consume `AiBulletList` + `AiRequiredInputList` from `features/workflow-builder/ai/`. Strictly UI-layer: no route changes, no backend changes, no behavior changes. Surface-specific structure (preview cards, apply state, confirmation UX) intentionally stays in each consumer — the extraction targets only the rendering pieces with real, repeated logic. See note below. |
| **AI-15** | shipped | AI E2E Smoke Test Plan — pure documentation slice. Coverage matrix mapping every realistic AI user flow (12 scenarios: model unavailable, parse failure, needs-input, unsupported, low-risk apply, high-risk confirmation, stale patch, repair no-safe / needs-input / repairable, analytics, no-leak) to its existing service/route/UI tests, plus a dev-server manual smoke checklist for what mocks can't catch (real env-var pickup, real fetch round-trips, real DB rows, real UI hydration). **Audit conclusion: no automation gaps require new tests** — every scenario is exercised at service + route + UI layers with type-checked contracts between them. Optional Playwright walkthrough deferred (would require an env-driven mock model adapter). See note below + [`ai-e2e-smoke-test-plan.md`](./ai-e2e-smoke-test-plan.md). |
| **AI-16** | shipped | Planner value-shape + output-reference grounding. Closes the post-STRIPE-TRIGGER-META-2 smoke gap: the AI saw `enabledEvents (combobox)` and `slack:send_direct_message` in the catalog but had no way to know `enabledEvents` was multi-select (produced scalar string → `INVALID_CONFIG`) and no list of declared upstream output names (invented `id` / `amount` / `currency` / `last_payment_error` → `MISSING_OUTPUT_PATH`). Fix: `CatalogConfigField` now forwards `multiple: true` from `FieldMeta` and renders as `(combobox, multi-select)`; catalog entries now expose top-level `outputs` (name + type + sensitive) from `OutputMeta` / `payloadShape` and render a per-node `outputs:` line; new `VALUE_SHAPE_RULES` prompt block documents per-type value shapes (text→string, combobox+multi-select→array, boolean→true/false, keyvalue→object, etc.); two new `PLANNER_CONSTRAINTS` cover shape-matching and "use only declared output names." Strict validator and schema unchanged. See note below. |
| **AI-17** | shipped | Connected-integration awareness + "me" resolution for AI planning. Closes the next smoke gap (user has only Slack connected; AI proposed a Stripe→Slack workflow without flagging that Stripe needed to be connected, and asked for a Slack `userId` even though OAuth already captured the installing user's Slack id). `ConnectedIntegrationView` now forwards optional `currentUserId` from per-provider OAuth metadata (Slack → `accountMetadata.authedUserId`, the public U-prefixed id, never the bot id, never a token). Prompt renders the integration line as `- slack (account: ..., scope: workspace, me=U01ABC23DEF)`, the connected-integrations header now explicitly states "any provider NOT listed below is DISCONNECTED — every action/trigger from a disconnected provider requires connecting it first," and two new `PLANNER_CONSTRAINTS` cover (a) emit `requiredUserInput` with `kind: "select_integration"` for every disconnected provider used, never substitute a connected one; (b) resolve "me" from `me=` when present, ask via `requiredUserInput` otherwise, NEVER guess a user id, use a bot id as a human recipient, or use a channel id where a user id is required. Strict schema + validator + Slack OAuth flow unchanged. See note below. |
| **AI-18** | shipped | React Agent live-smoke + builder-design integration verification (docs-only). Followed BUILDER-DESIGN-PARITY-1; ran 1634 tests across builder UI + AI services + AI routes against the restyled chrome; confirmed AI-11 / AI-11B / AI-13 contracts hold end-to-end, no leaks, no regressions. Identified one new live-smoke issue (PARSE_FAILED/NOT_JSON against Claude Sonnet 4.6 in production) which is addressed by AI-19. See note below + `builder-ui-v1-port-plan.md` §AI-18. |
| **AI-19** | shipped | Anthropic forced tool-use structured planner output. Replaces prompt-only JSON enforcement (insufficient against Sonnet 4.6 — produced PARSE_FAILED/NOT_JSON in production smoke) with a forced single tool call. Assistant prefill stays reverted (Claude 4.x rejects it — AI-12C history). `ModelGenerateInput.responseTool` (`core/ai/modelTypes.ts`) is the provider-agnostic seam; the Anthropic adapter (`services/ai/modelClients/anthropicClient.ts`) sends `tools: [{name, description, input_schema}]` + `tool_choice: { type: "tool", name }`, extracts the matching `tool_use` content block, and returns `JSON.stringify(tool_use.input)` as `ModelSuccess.text` so the existing `parseWorkflowPlanResponse` (and downstream `WorkflowPatchSchema`) remain the source of truth. The planner (`services/ai/planner/planWorkflowFromPrompt.ts`) injects `WORKFLOW_PLAN_TOOL` on every plan call. Missing/mismatched/empty tool_use → `INVALID_RESPONSE` (retryable). Builder UI / provider metadata / workflow execution / billing / chat persistence all unchanged. See note below. |
| **AI-20** | shipped | React Agent apply-readiness gate for unresolved required input. Live smoke after AI-19 surfaced a contract gap: the deterministic preview happily flagged a structurally-valid patch as `canApplyLater: true` even when the AI also returned non-empty `requiredUserInput` (e.g. "Which Slack channel?" / "What should the message say?"). The UI rendered both the required-input list AND an enabled Apply button — contradictory + risky. Fix is two-layer (defense in depth): **service** (`services/ai/planner/planWorkflowFromPrompt.ts`) overrides `canApplyLater → false` and sets `blockedReason: "More information is still needed — answer the questions above and run Plan with AI again."` whenever `requiredUserInput.length > 0`; **UI** (`features/workflow-builder/panels/BuilderAiPanel.tsx`) tightens `showApplyControls` to also require `requiredUserInput.length === 0`, hides Apply + risk-ack when blocked, and renders a new `builder-ai-required-input-block` callout. Preview still runs (cost / risk / validation projected); only the apply gate moves. Multi-turn inline required-input filling is explicitly deferred. See note below. |
| **AI-21** | shipped | React Agent session-local conversational follow-up. AI-20 closed the apply-readiness leak but still required the user to manually rewrite the original prompt + the missing details and run Plan again — single-turn UX. AI-21 lets the user reply inline: when the planner returns non-empty `requiredUserInput`, the composer flips into follow-up mode (`Send details` button + reworded `builder-ai-required-input-block` callout), and the next submit reconstructs the planner prompt from the original prompt + the asked labels + any prior follow-up answers + the new answer via a new pure helper `composeFollowUpPrompt`. The reconstructed prompt is sent through the same `POST /api/workflows/[id]/ai/plan` route — no service change, no DB persistence, no chat/thread storage. State lives only in `useBuilderAi` (`originalPrompt` + `priorFollowUpAnswers`), cleared on `reset()` / a fresh `plan()` / chain completion (response with empty `requiredUserInput`). Multi-turn naturally supported — each turn cites prior answers in a `Previous follow-up answers:` section. Strict patch schema unchanged, parser unchanged, apply route unchanged, no auto-apply, no raw patch / config / secrets in the reconstructed prompt. See note below. |
| **AI-21B** | shipped | React Agent chat layout + pinned composer. AI-21 added the right follow-up behavior but kept the panel form-shaped (prompt + result). Live observation: the React Agent rail did not feel like a chat — there was no transcript, the composer wasn't pinned, and follow-up answers replaced the prior response instead of stacking under it. AI-21B refactors `BuilderAiPanel` into a proper chat layout: a scrolling `builder-ai-message-list` (newest at the bottom, `role="log"` + `aria-live="polite"`) above a pinned `builder-ai-composer` footer; user prompts and follow-up answers render as right-aligned bubbles (`builder-ai-message-user` with `data-kind=prompt|followup`); plan results / apply outcomes / errors render as left-aligned assistant bubbles (`builder-ai-message-assistant`). The latest plan_result message owns the full AI-11B / AI-20 breakdown (assumptions / needs-input / preview / risk-ack / Apply controls — same testIds); older plan_results collapse to their `intentSummary`. The composer auto-clears on submit (chat-style); Clear is a full conversation reset (messages + composer + hook state). Subcomponents + chat message types extracted to a sibling `_BuilderAiPanelChat.tsx`. Rail wrapper (`BuilderLeftAgentRail`) hands scroll ownership down to the panel (`overflow-y-auto` → `overflow-hidden min-h-0`) so the message-list / pinned-composer split works. **`useBuilderAi`** `plan` / `submitFollowUp` / `apply` now return their result (or `null` on transport failure) so the panel can append assistant messages in lockstep with user messages — return-value extension only, no behavior change for prior callers. **Scope guardrail preserved** — workflow-builder React Agent only, NOT the general app help assistant; NO DB persistence (messages are component state); no AI route / model adapter / provider metadata / billing / workflow-execution changes; AI-20 apply-readiness gate + AI-21 session-local follow-up state + AI-11B no-leak + strict patch / parser / preview / AI-9B apply route all unchanged. See note below. |
| **AI-21C** | shipped | React Agent chat component split + live follow-up smoke. AI-21B landed the chat layout but pushed `BuilderAiPanel.tsx` to 406 effective lines — a new max-lines warning. AI-21C extracts the rendering into two more siblings (mirroring the existing AI-21B `_BuilderAiPanelChat.tsx` + AI-11B `_BuilderAiPanelPreview.tsx` pattern): **[`_BuilderAiPanelMessageList.tsx`](../../../features/workflow-builder/panels/_BuilderAiPanelMessageList.tsx)** owns the `role="log"` scroll container + per-message rendering + auto-scroll effect + the `latestPlanMessageId` derivation; **[`_BuilderAiPanelComposer.tsx`](../../../features/workflow-builder/panels/_BuilderAiPanelComposer.tsx)** owns the pinned-bottom footer (textarea + button + kbd hint + char counter + Clear button) and self-derives `tooLong` / `canSubmit` from the `prompt` prop. `BuilderAiPanel.tsx` is now a thin orchestration shell — state (prompt, riskAcknowledged, messages) + hook + handlers (`handleSubmit` / `handleApply` / `handleRerunPlan` / `handleClear`) + a 25-line return that mounts `<BuilderAiPanelMessageList>` + `<BuilderAiPanelComposer>`. Line counts: panel 488 → 216; lint warning resolved (5 warnings total now, down from 6). All testIds preserved verbatim; all 71 AI-21-area tests pass unchanged; full workflow-builder unit sweep (64 suites / 905 tests) passes with zero regressions. **No behavior changes** — pure refactor; AI-20 apply-readiness gate + AI-21 follow-up reconstruction + AI-21B chat layout + AI-11B no-leak invariants all preserved structurally. Live follow-up smoke is documented as PENDING (this environment has no `ANTHROPIC_API_KEY` + no running dev server attached; Marcus runs the manual smoke per the `ai-e2e-smoke-test-plan.md` §5.1 steps 6 → 7e). See note below. |
| **AI-22** | shipped | Required-field discipline + interactive required-input controls. The React Agent's missing-info path was still text-only: the user had to figure out what value the AI wanted, type it in the composer, and the AI then had to map the typed phrase back to a real id (channel ids, user ids, enum values). AI-22 makes the next step UI-driven. **Planner discipline:** two new `PLANNER_CONSTRAINTS` forbid silently defaulting / guessing required fields and forbid treating a display label as an opaque id (no fabricating Slack `C…` / `U…` / Airtable `rec…` ids; the React Agent's interactive control + the live resolver is the correct path). **Service enrichment:** new `enrichRequiredUserInputs` walks each entry's `nodeId` → patch operation → `provider:type` → `ActionMeta` / `TriggerMeta` → `FieldMeta` and attaches optional `provider` / `nodeType` / `nodeLabel` / `fieldLabel` / `fieldType` / `options` / `optionsSource` / `dependsOn` / `multiple` / `allowFreeText` / `placeholder` hints. Degrades gracefully for entries without a node-field reference (`select_integration` / `clarification`) and for unresolvable lookups. **Interactive control:** new `RequiredInputControl` renders a native `<select>` for static options, a typeable combobox backed by the existing `useOptionsSource` hook for `optionsSource` (with deps-missing / loading / error / disconnected / empty / option-list states), or a text input fallback. Always allows the user's typed value to win when `allowFreeText` is true. **Structured follow-up:** `composeFollowUpPrompt` accepts `structuredAnswers` and renders them under a new `User provided:` section as `- {label}: {display} (value: <value>)`; `useBuilderAi.submitFollowUp` accepts either a string (legacy) OR `{ freeText?, structuredAnswers? }`. The composer button enables when staged answers exist even without composer text, so the user can submit via controls alone. The chat user-message bubble shows the staged answers so the transcript reflects exactly what was sent. **Scope guardrails preserved** — workflow-builder React Agent only; AI-20 apply-readiness gate still enforced (Apply hidden while `requiredUserInput.length > 0`); no AI route / model adapter / provider metadata / billing / workflow-execution / DB persistence changes; the `requiredUserInput` shape extensions are optional + backward compatible so existing AI-11B / AI-20 / AI-21 / AI-21B / AI-21C consumers keep working. See note below. |
| **AI-33** | shipped | Ambiguous-provider clarification + complete required-field questions. Fixes two live bugs ("email"→silently Gmail; Slack message text never asked). 3 new PLANNER_CONSTRAINTS: R1 ambiguous-category clarification (generic "email"/"calendar"/"drive"/"chat" must ask which provider, never default), R3 content-field completeness (unspecified message body → ask, don't AI_FIELD), R7 null-patch completeness (list every missing required field even with a null patch). New service-side `deriveMissingRequiredFieldInputs` safety net derives a question for every required field the model forgot (empty config), merged + enriched + drives the apply-gate. No UI change (AI-22 control already renders channel combobox + text input). No narrowing/metadata/execution/billing change. 24 new tests. Packet version unchanged. See note below. |
| **AI-32** | shipped (audit-only) | AI cost telemetry validation + prompt-cache readiness audit. Doc-only: [`ai-cost-telemetry-validation-and-cache-audit.md`](./ai-cost-telemetry-validation-and-cache-audit.md). Verified the AI-28/30/31 telemetry path against the real `ai_cost_events` schema + recorder (`prompt_version` / `input_tokens` are top-level columns; AI-28/30/31 fields ride in sanitized `metadata`, none match the denylist). Ships runnable validation SQL (avg input tokens by promptVersion, narrowing effectiveness, fallback rate, tier-routing distribution, section-proportion estimation, failure-vs-confidence correlation, cost-per-apply), a 4-prompt manual live smoke plan, a prompt-caching feasibility audit (adapter sends `system` as a string → needs content-block array; current packet order strands the stable rules AFTER the variable CONTEXT PACKET → needs a `v4` reorder; AI-30 shifted the cache target from catalog→rules), and a model-classifier next-step audit (defer until §B.6 shows low-confidence correlates with failure). **Recommendation: live smoke + ship the AI-29→AI-31 arc first, then AI-32A prompt caching; AI-32B classifier decision-gated on telemetry.** No behavior change, no caching wired, no classifier wired, no migration. See note below. |
| **AI-31** | shipped | Model-tier routing audit + deterministic narrowing-classifier instrumentation. CONSERVATIVE — no patch-generation routing change. Audit doc at `planner-model-tier-routing-audit.md`. New helper `services/ai/planner/narrowingClassifier.ts` returns `{intentType, confidence, candidateProviders, triggerHints, actionHints, broadOrAmbiguous, source, modelTier}` derived purely from the AI-30 narrowing decision + input shape — pure, no model call. Sets up the typed interface a future model classifier (AI-31B) will plug into. 10 new tier-routing fields on `PlannerPromptAttribution` (`plannerModelTier`, `classifierUsed`, `classifierModelTier`, `classifierConfidence`, `classifierProviderCount`, `deterministicProviderCount`, `finalProviderCount`, `fallbackToDeterministic`, `fallbackToFullCatalog`, `tierRoutingReason`) — all folded into `ai_cost_events.metadata`. Classifier output is **advisory only** — `finalProviderCount === deterministicProviderCount` today; narrowing's `providerIds` is still authoritative. Rollback via `ENABLE_AI_NARROWING_CLASSIFIER=false`. 59 new tests. Packet version unchanged (`workflow-planner-v3`). See note below. |
| **AI-30** | shipped | Deterministic provider narrowing for the planner catalog (`services/ai/planner/narrowProvidersForPlan.ts`) — first major cost-reduction behavior change. Bumps `PLANNER_PACKET_VERSION` to `"workflow-planner-v3"`. R1 gains a narrowing-aware no-substitution clause; CONTEXT PACKET JSON + `PlannerPromptAttribution` gain narrowing fields surfaced into `ai_cost_events`. Measured ~85% catalogChars reduction / ~75% totalPacketChars reduction on typical specific requests (Slack-only, Stripe+Slack, ambiguous email); 0% reduction on broad/vague requests (correct full-catalog fallback). Independent rollback via `ENABLE_AI_PROVIDER_NARROWING=false`. 86 new tests + measured impact in `planner-prompt-packet-audit.md`. See note below. |
| **AI-34A** | shipped | Second real model adapter — OpenAI Responses-API (`services/ai/modelClients/openaiClient.ts`) + `OPENAI_MODELS` registry (`gpt-4.1` / `gpt-4.1-mini`) + provider-aware resolver (`getModelForProviderTier`) + factory routing (`createModelClientForModel` handles `provider==="openai"`) + `isOpenAiProviderEnabled()` flag (default off). NO behavior switch — default planner stays Anthropic/Sonnet 4.6; nothing routes to OpenAI. See [`openai-adapter-setup-and-audit.md`](./openai-adapter-setup-and-audit.md). See note below. |
| **AI-34B** | shipped (verification-only) | OpenAI adapter LIVE verification + model-selection audit. Ran the adapter against the real OpenAI API via a dev-only probe (`scripts/trash/verify-openai-adapter.ts`) — both `gpt-4.1` and `gpt-4.1-mini` round-trip forced function-tool structured output correctly; the assumed Responses-API request/response shape is CONFIRMED (no adapter fix needed); usage/latency/finish-reason map correctly; no key leak. Telemetry-ready (`getModelById`→`provider:"openai"`). **Recommends AI-34C = Option 1 (GPT fast-tier intent classifier via the AI-31 `source:"model"` seam), NOT planner/patch routing.** No model-id change, no default switch, no routing, no billing/execution/metadata change. See note below. |
| **AI-34C** | shipped | OpenAI fast-tier intent classifier — ADDITIVE ONLY. `gpt-4.1-mini` plugs into the AI-31 `NarrowingClassifierResult` seam (`services/ai/planner/modelNarrowingClassifier.ts`); its valid candidate providers are UNIONED into the deterministic narrowed catalog (`resolvePromptClassifier.ts` — never removes a deterministic/explicit/connected/canvas provider, never shrinks a full-catalog fallback, ignores unknown ids). Gated on `ENABLE_AI_MODEL_NARROWING_CLASSIFIER=true` + `ENABLE_OPENAI_PROVIDER=true` + `OPENAI_API_KEY` (default off). Any failure → deterministic fallback (`fallbackToDeterministic`/`tierRoutingReason` telemetry). **PLANNER stays Anthropic/Sonnet; NO patch generation on OpenAI; NO Apply change.** See note below. |
| **AI-35** | shipped | React Agent QA fixes from live testing. (1) Generic-category ambiguity ("email") now derives a STRUCTURED `provider_choice` required input (`deriveProviderChoiceInputs`) so the agent renders a Gmail/Outlook CHOICE control, not a static bullet. (2) **Apply vs Activate** — `select_integration` (connect a disconnected provider) NO LONGER blocks Apply (`isApplyBlockingRequiredInputKind`); applying creates a not-ready draft node, and connection gates Activation. `config_value` + `provider_choice` still block (AI-20 floor preserved). (3) Existing-node edits — `enrichRequiredUserInputs` resolves `updateNodeConfig` identity from the current canvas, and the follow-up closing instruction is edit-aware (UPDATE existing nodes, don't always create). UI renders controls for any options-bearing/provider_choice entry + a non-blocking "connect before activating" note. NO patch generation on OpenAI; planner stays Anthropic/Sonnet; no execution/activation-safety/metadata/billing change. See note + [`react-agent-live-qa-matrix.md`](./react-agent-live-qa-matrix.md). |
| **AI-35B** | shipped | Deterministic required-input completion + existing-node-edit fix. A pure structured-answer follow-up whose answers map 1:1 to already-identified config fields completes the pending patch (or an `updateNodeConfig` for an existing-canvas node) + previews **without a model call** (`completePlanWithRequiredInputs` + `POST /ai/complete`); `useBuilderAi` tries this before the model planner and falls back on a `NEEDS_REPLAN` signal. Fixes the existing-Slack-DM-recipient edit (was failing via a needless model re-plan) + cuts the AI-COST-INCIDENT-1 "every Send-details re-runs the planner" waste. `provider_choice` / free-text / multi-value still re-plan. Dev visibility via the AI-35D `aiCostDebug` hook (`requiredInputResolutionMode`). NO OpenAI patch generation; planner stays Anthropic/Sonnet; no narrowing/metadata/billing/execution change. See note + [`react-agent-live-qa-matrix.md`](./react-agent-live-qa-matrix.md). |
| **AI-35H** | shipped | OptionsSource reconciliation for FOLLOW-UP plans. Fixes the post-AI-35G case where a follow-up correction (DM→channel) asked "Which Slack channel?" but rendered plain text. Follow-ups already go through the same orchestrator (`/ai/plan` → `planWorkflowFromPromptForAI`), so AI-35G's `reconcileBareConfigValueEntries` ran — but it matched only bare `config_value` questions, while the model emitted the channel question as a **`clarification`**. Broadened `RECONCILABLE_BARE_KINDS` to `{config_value, clarification}` (normalizing the attached entry to `config_value`); still strictly guarded (exactly one bare reconcilable question + exactly one fillable required field). Once attached, enrichment surfaces the `optionsSource` so the channel renders its combobox; generic for any provider/native `optionsSource` field. Deterministic completion still writes the selected option **id** (AI-35G). Null-patch / multi-fillable remain documented limitations (safe text/re-plan fallback). NO planner routing / OpenAI-Anthropic routing / execution / billing / provider-metadata change. See note + [`react-agent-live-qa-matrix.md`](./react-agent-live-qa-matrix.md). |
| **AI-35G** | shipped | React Agent layout + optionsSource control parity. **(A) Vertical layout:** AI-applied simple linear workflows rendered side-by-side because the model's `addNode` positions were persisted verbatim. New deterministic [`normalizeLinearWorkflowLayout`](../../../services/ai/apply/normalizeLinearLayout.ts) (called in `applyWorkflowPatchForAI` before persist) re-stacks a simple linear chain into the builder's vertical column (trigger on top, 120px gaps, x-aligned); skips pure config edits, explicit `moveNode`, and branch/router/disconnected graphs. **(B) optionsSource control parity:** a BARE `config_value` question ("Which Slack channel?") with no node/field identity fell back to plain text instead of the channel combobox. New planner pass [`reconcileBareConfigValueEntries`](../../../services/ai/planner/enrichRequiredUserInputs.ts) attaches the unique missing required field's identity (empty or `{{AI_FIELD}}`) so `enrichRequiredUserInputs` attaches the field's FieldMeta → combobox/select/text renders. `evaluateDeterministicCompletion` now requires the selected option **value (id)** for picker fields (`options`/`optionsSource`), never the free-text display label → `picker_requires_option` re-plan otherwise. Generic/metadata-driven, not Slack-specific. NO planner routing / OpenAI-Anthropic routing / execution / billing / provider-metadata change. See note + [`react-agent-live-qa-matrix.md`](./react-agent-live-qa-matrix.md). |
| **AI-35F** | shipped | Deterministic completion for rendered required text controls. Fixes the post-AI-35E regression where a **bare `config_value`** text control (no `nodeId`/`field`) still triggered a model re-plan (OpenAI follow-up 502 → "AI assistant is unavailable") instead of `/ai/complete`. Client (`evaluateDeterministicCompletion`) no longer rejects bare answers — it forwards them UNTARGETED when a `proposedPatch` exists. Server (`completePlanWithRequiredInputs`) infers the UNIQUE fillable (`empty`/`AI_FIELD`) required `text`/`textarea` field from the patch's pending `addNode` nodes via ActionMeta/TriggerMeta/FieldMeta — fills only on a unique match, else `NEEDS_REPLAN` (`ambiguous_target` / `no_target_node`). Generic (Slack/email/HubSpot/Trello/HTTP/native text), not Slack-specific. Still runs WorkflowPatchSchema + AI-5 preview; no auto-apply. NO planner routing / OpenAI-Anthropic routing / execution / billing / provider-metadata change. See note + [`react-agent-live-qa-matrix.md`](./react-agent-live-qa-matrix.md). |
| **AI-35E** | shipped | React Agent required-input control parity. Fixes the live regression where a missing field ("What should the Slack DM say?") rendered as a STATIC bullet with no input control. One shared metadata-driven resolver (`resolveRequiredInputControl`) maps every `requiredUserInput` entry → the same class of control the config panel would render (select / multiselect / combobox / boolean / number / textarea / text), consumed by BOTH the control-vs-bullet gate (`isControlRenderable`) and the renderer (`RequiredInputControl`, now with boolean/number/textarea/multiselect branches). A bare `config_value` (null-patch plan, no node/field identity) now renders a text control; bullets are reserved for non-field clarifications. `evaluateDeterministicCompletion` guards `number`/`boolean`/array fields to the model (correct typing). NO provider-specific branches, NO planner/OpenAI/Anthropic routing change, NO execution/billing/metadata change, NO graph mutation before Apply. See note + [`react-agent-live-qa-matrix.md`](./react-agent-live-qa-matrix.md). |
| **AI-36** | shipped | **OpenAI-only planner routing; Anthropic disabled at runtime.** The React Agent planner routes to OpenAI `gpt-4.1-mini` via `createPlannerModelClient` (gated on `ENABLE_OPENAI_PLANNER` + `ENABLE_OPENAI_PROVIDER` + `OPENAI_API_KEY`). **Anthropic is NEVER called** unless the explicit emergency flag `ENABLE_ANTHROPIC_PLANNER_FALLBACK=true` is set; there is NO silent fallback. OpenAI parse/rate-limit/provider/network/not-configured failures surface the existing model-unavailable flow (no Anthropic). Anthropic code remains available but dormant. All safety gates unchanged (parser / WorkflowPatchSchema / AI-5 preview / apply-readiness / no-substitution / deterministic completion). Live-verified: 5 smoke prompts all `provider=openai, model=gpt-4.1-mini`. See note + [`openai-adapter-setup-and-audit.md`](./openai-adapter-setup-and-audit.md). |
| **4.BUILDER-NODE-IDENTITY-1** | shipped | **System-owned node IDs + user-facing node names + planner reference integrity.** Separates three identity concerns. (1) **System-owned ids:** [`materializeAiPatchNodeIds`](../../../services/ai/patch/materializeAiPatchNodeIds.ts) runs at the APPLY persistence boundary (`applyWorkflowPatchForAI`) and replaces every AI-created `addNode`/`replaceTrigger`/edge id with a fresh opaque id, rewriting edge `from`/`to`, op `nodeId`, and `{{patchLocalId.path}}` config tokens; references to ids neither on the canvas nor introduced earlier in the SAME patch reject `UNKNOWN_NODE`/`INVALID_EDGE`; persisted defs contain ONLY system ids (model ids are throwaway scratch). (2) **User-facing names:** optional `WorkflowNode.displayName` (user-only — the AI NEVER sets it; the materializer strips any AI-supplied `displayName` unconditionally), edited via a "Node name" field in the config panel Setup tab (`graphSlice.renameNode`, a pure state mutation — no planner call). Friendly labels resolve via pure [`getNodeDisplayName`](../../../core/workflows/nodeDisplayName.ts) (custom → metadata → formatted type key → kind) on the canvas card, validation copy, run-history steps, and AI preview change summaries — raw node ids no longer shown to users. (3) **Planner grounding:** `currentCanvas` renders `<id> ("<label>"): <kind> <provider>:<type>`; two new `PLANNER_CONSTRAINTS` (grouped into R2 in the V2 packet) state ids are opaque + copied exactly for existing-node ops + never invented (`action1`/`node1`), `displayName` is context-not-identity + never set by the planner, and edits are scoped (trigger-only / action-only). Packet version unchanged (`workflow-planner-v3`). Preview validates the model's proposed ids INTACT (materialization is apply-only, always gated behind a passing preview, so no throwaway uuids leak into preview copy). NO execution / billing / provider-metadata / general-help change; planner stays OpenAI per AI-36 (Anthropic not called). Tests: `core/workflows/nodeDisplayName`, `services/ai/patch/materializeAiPatchNodeIds`, `graphSlice.renameNode`, `ConfigModalShell` rename, planner node-id grounding, updated card/validation/apply/preview suites. See note + [`react-agent-live-qa-matrix.md`](./react-agent-live-qa-matrix.md). |
| **AI-35K** | shipped | **Combobox manual-entry fallback when `optionsSource` can't load.** A required-input picker (e.g. Slack channel) whose options fail to load — provider disconnected or resolver error — left the user stuck on "Couldn't load…" with no way to type a value. Root cause: [`RequiredInputOptionsSourceControl`](../../../features/workflow-builder/ai/RequiredInputOptionsSourceControl.tsx) only rendered the "Use '…' as-is" commit button when `input.allowFreeText` was true, so a picker with `allowFreeText:false` + a failed load discarded the typed text; and [`deterministicCompletion`](../../../features/workflow-builder/ai/deterministicCompletion.ts) bounced a display-only picker answer to the model (AI-35G `picker_requires_option`). **Fix (UI + client, no new architecture):** the commit affordance now also appears when `state.status` is `disconnected` or `error`; the typed value flows as the answer's `display` (no fabricated id). Deterministic completion now uses `answer.value ?? answer.display` for ALL fields — a SELECTED option's value/id still wins, but a typed fallback completes the field instead of re-planning. The typed string is written to config and the AI-5 preview / activation validation decides acceptability (a preview-rejected value still returns `NEEDS_REPLAN`; no silent corruption). **Apply vs Activate unchanged:** a disconnected provider's non-apply-blocking `select_integration` still gates Activation, so drafting (Apply) proceeds while Activation stays blocked until the provider is connected. NO unresolved/verified-value system, NO server/schema change (`/ai/complete` already writes `value` as-is), NO planner provider routing change (OpenAI stays the planner per AI-36; Anthropic not called), no execution / billing / provider-metadata / general-help change, no graph mutation before Apply. Generic for any `optionsSource` field (Slack/Gmail/Sheets/Airtable/Trello/Notion/…), not Slack-specific. Tests: `RequiredInputControl.test.tsx` (+disconnected/error → editable + commit without allowFreeText; +no-commit when loaded+!allowFreeText; +Slack regression) + `deterministicCompletion.test.ts` (typed picker value completes; selected id still wins; empty → missing) + `useBuilderAi.deterministic.test.tsx` (typed fallback → completePlan, no planWorkflow, no apply). See note + [`react-agent-live-qa-matrix.md`](./react-agent-live-qa-matrix.md). |
| **AI-35J** | shipped | **Preserve compatible follow-up answers across intent corrections.** After AI-35I correctly switches the action on a correction ("Send me a Slack DM…" → "this is to a channel" → channel message), it then **re-asked** for the message text the user already gave ("hey"). Root cause (audit Q2): the AI-35I `Correction:` directive + closing only told the planner to DISCARD inputs tied to the replaced choice and framed prior answers as "CONTEXT ONLY" — never to PRESERVE compatible ones; the prior message answer already rides in `priorFollowUpAnswers` (with its field label) but the model rebuilt from scratch. **Prompt-only fix** in [`composeFollowUpPrompt`](../../../features/workflow-builder/ai/composeFollowUpPrompt.ts): the `Correction:` directive now also says PRESERVE earlier user-provided values that still apply (message text/body/content, schedule times, filter terms) and do NOT re-ask for a value the user already supplied when compatible; the always-closing adds the same, with destination details preserved only "when the destination type is unchanged" (so a DM user id is never reused as a channel, nor a channel as a recipient). Generic/semantic, not Slack-specific (covers DM↔channel, Gmail↔Outlook, Slack↔email). No logic/state change — `priorFollowUpAnswers` already carries the labeled prior answers; deterministic completion unchanged (a plain "hey" still completes with no model call; a correction still re-plans). Known limitation: a prior answer that fully completed the plan deterministically (chain closed) is not carried into a later fresh-plan correction — deferred (no over-engineering). NO planner provider routing change (OpenAI stays the planner per AI-36; Anthropic not called) / no execution / billing / provider-metadata / general-help change / no graph mutation before Apply. Tests: `composeFollowUpPrompt.test.ts` (+preserve clause / destination-type guard / non-correction regression) + `useBuilderAi.test.tsx` (+DM→channel-preserves-message, +provider-correction-preserves-text, +deterministic-still-works, +correction-uses-planWorkflow-only). See note + [`react-agent-live-qa-matrix.md`](./react-agent-live-qa-matrix.md). |
| **AI-35I** | shipped | **Follow-up intent-correction reconciliation — an explicit user correction overrides stale inferred intent.** Fixes the live regression where "Send me a Slack DM…" → "This is to a channel" kept re-asking for a Slack DM `userId` instead of switching to a channel message (exposed once AI-36 made the OpenAI planner read `composeFollowUpPrompt`'s "for the original request" closing literally). New pure, generic, provider-agnostic detector [`detectIntentCorrection`](../../../features/workflow-builder/ai/detectIntentCorrection.ts) flags override/contrast markers ("this is to a channel", "no, use Outlook", "actually send an email instead", "make it manual", "I said channel", "instead", "change that to…") in the latest follow-up. `useBuilderAi.submitFollowUp` (a) skips deterministic completion on a detected correction so a stale `proposedPatch` is never completed, and (b) flags the re-plan so [`composeFollowUpPrompt`](../../../features/workflow-builder/ai/composeFollowUpPrompt.ts) makes the latest message AUTHORITATIVE (the original request / questions / current plan / prior answers become CONTEXT ONLY) and adds a `Correction:` directive telling the planner to REPLACE the obsolete provider/action/trigger and discard inputs that only applied to the replaced choice. Stale required inputs are replaced (not merged) because a re-plan fully replaces `planResult`. Deterministic completion stays for direct field-filling only (a plain "Hey" still completes without a model call). Detector tuned for recall (a false positive only adds harmless override emphasis to a re-plan free text already forces). NO planner provider routing change (OpenAI stays the planner per AI-36; Anthropic not called) / no execution / billing / provider-metadata / general-help change / no graph mutation before Apply. 23 new/updated tests. See note + [`react-agent-live-qa-matrix.md`](./react-agent-live-qa-matrix.md). |
| AI-23+ | future | Owner/admin analytics route (needs an admin/owner auth gate) + dashboard UI, persistent workflow-builder agent threads (DB-backed history across sessions), richer inline required-input forms (per-question structured inputs), general app help assistant (separate architecture from the workflow-builder agent), additional provider adapters, optimizer, templates, etc. (§13). |

> Cost dependency satisfied: AI-3's validator integrates the COST-2 deterministic estimator (`services/billing/workflowCostEstimator.ts`). The AI never guesses cost — `validateWorkflowPatch` calls `estimateWorkflowTaskCost` on the candidate definition. See [task-cost-billing-model-audit.md](./task-cost-billing-model-audit.md).

### AI-3 implementation note

Deterministic patch foundation under [`services/workflows/patch/`](../../../services/workflows/patch/). No model calls, no DB writes, no workflow mutation, no apply-to-database (that is a later slice). The model **proposes** a `WorkflowPatch`; this code **validates** it before any preview/apply is permitted.

- **[`types.ts`](../../../services/workflows/patch/types.ts)** — `WorkflowPatch` envelope (`patchId`, `workflowId|null`, `baseRevision`, `operations[]`, `summary`, `rationale`, advisory `riskLevel?`/`requiresConfirmation?`), the `PatchOperation` discriminated union, and `PatchValidationResult`.
- **[`workflowPatchSchema.ts`](../../../services/workflows/patch/workflowPatchSchema.ts)** — Zod envelope + `.strict()` discriminated op union (reuses the canonical `WorkflowNode`/`WorkflowEdge` contracts).
- **[`applyPatchToDefinition.ts`](../../../services/workflows/patch/applyPatchToDefinition.ts)** — pure, atomic, non-mutating apply onto a clone → candidate definition.
- **[`checks.ts`](../../../services/workflows/patch/checks.ts)** — structural, registry-grounding, FieldMeta config, variable-reference, branch-label, and deterministic risk checks.
- **[`validateWorkflowPatch.ts`](../../../services/workflows/patch/validateWorkflowPatch.ts)** — orchestrator: parse → baseRevision → apply → structure → registry/config → variable refs → branch labels → risk → COST-2 estimate.

**Supported ops:** `addNode`, `updateNodeConfig`, `removeNode`, `addEdge`, `removeEdge`, `replaceEdge`, `moveNode`, `repairVariableReference`, `replaceTrigger`. **Deferred:** `renameNode` (WorkflowNode has no `label` field — see §14 open decision #14) and all template ops.

**Deterministic guarantees:** the patch's proposed `riskLevel`/`requiresConfirmation` are advisory and recomputed (a model cannot downgrade risk — reuses `findConfirmationRequiredActions`); registry grounding rejects invented providers/actions/triggers; variable refs are checked for existence, upstream-only (`findUpstreamNodes`), and output-path existence (AI_FIELD is NOT treated as a missing variable); error/warning messages carry ids + field KEY names + registry metadata only — never config VALUES (no-leak tested).

**Documented gaps (follow-ups):** config validation is FieldMeta-guided, not full handler-Zod (V2 has no clean `provider:type → schema` registry; the handler's strict schema is authoritative at apply/dispatch — undeclared fields are warnings, not errors); branch-label **route-membership** validation is deferred (a labeled edge from a non-branching node is a warning); `repairVariableReference.fieldPath` targets a top-level config key (nested paths deferred).

**Tests:** [`tests/unit/services/workflows/patch/*`](../../../tests/unit/services/workflows/patch/) — schema, apply, registry grounding, config, variable refs, edges/triggers, risk, cost integration, no-leak.

### AI-4 implementation note

Read-only explainer under [`services/ai/explain/`](../../../services/ai/explain/). DETERMINISTIC — it composes the AI-2 context tools into grounded explanations. No model calls, no mutation, no DB writes, no UI. The eventual LLM narration layer is a later wrapper that consumes these structured facts.

- **[`explainWorkflow.ts`](../../../services/ai/explain/explainWorkflow.ts)** — `explainWorkflowForAI(userId, workflowId)`: trigger (description + activation), ordered action steps (description + risk + integration need), data-flow edges, providers used, high-risk + unknown nodes, a best-effort validation section, plain-English `notes`, and a deterministic `summaryText`.
- **[`explainNode.ts`](../../../services/ai/explain/explainNode.ts)** — `explainNodeForAI(userId, workflowId, nodeId)`: per-field config STATUS (`not_set` / `literal` / `variable_reference` / `ai_generated` / `redacted` / `list` / `structured`), risk, integration connectivity, and available upstream variables (schema only).

**No-leak:** config is described by field KEY + STATUS, never by raw VALUE — a literal (e.g. an email) is reported as `literal` without echoing it; secret-keyed values arrive already redacted from AI-2; `{{nodeId.path}}` reference tokens are safe and surfaced. Ownership/NOT_FOUND propagate from the AI-2 tools; unknown node types get an honest "unrecognized type" answer.

**Tests:** [`tests/unit/services/ai/explain/*`](../../../tests/unit/services/ai/explain/) (13) — composition, narration, no-leak, NOT_FOUND propagation, no-trigger, unknown-node, high-risk + disconnected-integration, degraded-validation.

### AI-5 implementation note

Deterministic patch **preview** service under [`services/ai/preview/`](../../../services/ai/preview/). It composes AI-2 (load current definition), AI-3 (`validateWorkflowPatch`), and AI-4 (`explainWorkflowDefinition`) into a safe "what would change" view BEFORE any apply/save exists. No model calls, no DB writes, **no patch apply**, no workflow mutation, no UI, no billing deduction.

- **[`previewWorkflowPatch.ts`](../../../services/ai/preview/previewWorkflowPatch.ts)** — `previewWorkflowPatchForAI({ userId, workflowId, patch })`. Loads the current definition via `getWorkflowGraphForAI` (ownership + NOT_FOUND + config redaction, no DB write), runs the AI-3 validator, builds the candidate in memory, and explains before/after.
- **Pure in-memory explainer** added at [`services/ai/explain/explainDefinition.ts`](../../../services/ai/explain/explainDefinition.ts) (`explainWorkflowDefinition`) so the candidate is explained **without** being written to the DB.

**Output:** `ok`, `workflowId`, `patchId`, `patchSummary`, `validation{ok,errors,warnings}`, `changes[]` (deterministic per-op descriptions), `affectedNodeIds`/`affectedEdgeIds`, `riskLevel`/`requiresConfirmation`/`riskReasons[]` (from AI-3 — model risk never trusted), `taskCostEstimate` (COST-2, no deduction), `beforeSummary`, `afterSummary?`/`candidateSummary?` (only when valid), `userFacingSummaryText`, `canApplyLater`, `blockedReason?`.

**No-leak:** change descriptions use registry display labels + non-secret field KEY names + edge ids only — never config VALUES; secret-shaped config keys are filtered out of change summaries AND scrubbed from any surfaced validator message. Registry-grounded: a provider/action/trigger absent from the live metadata registry is rejected via AI-3, never invented — pending providers are not previewable until their metadata lands.

**Future:** AI-6 adds the confirm + persist apply flow (which must load the UNREDACTED definition; this preview never persists its candidate).

**Tests:** [`tests/unit/services/ai/preview/*`](../../../tests/unit/services/ai/preview/) (20) — ownership/NOT_FOUND, every valid op's change summary, invalid-patch families, deterministic risk + confirmation (incl. model-can't-downgrade), COST-2 cost + no-deduction, no-leak (values + secret key names), and live-registry grounding.

### AI-6 implementation note

Confirmed apply service under [`services/ai/apply/`](../../../services/ai/apply/) — the FIRST AI slice that may mutate a saved workflow, so it is strict. No model calls, no agent loop, no UI, no auto-apply, no billing deduction.

- **[`applyWorkflowPatch.ts`](../../../services/ai/apply/applyWorkflowPatch.ts)** — `applyWorkflowPatchForAI({ userId, workflowId, patch, confirmation? })`. Flow: load via `repositories/workflows.getById` (**UNREDACTED** definition; ownership enforced — missing/not-owned → `NOT_FOUND`) → **re-run `validateWorkflowPatch` at apply time** (never trusts a client preview) → reject invalid (nothing persisted) → optimistic-concurrency check → confirmation gate → persist the validator's candidate via the existing `updateDraftDefinition`.
- **Confirmation:** when validation says `requiresConfirmation`, `confirmation.confirmed === true` is required; a supplied `acceptedRiskLevel` must match the recomputed risk (a stale low-risk confirmation can't authorize a high-risk patch). Confirmation never bypasses validation.
- **Result:** `ok`, `workflowId`, `appliedPatchId`, `appliedOperationCount`, `affectedNodeIds`/`affectedEdgeIds`, deterministic `riskLevel`/`requiresConfirmation`/`riskReasons`, `taskCostEstimate` (no deduction), a value-free `workflow` summary (name/state/counts — never the definition/config), new `updatedAt`, `summaryText`. Failures carry a typed `code` (`NOT_FOUND` | `PATCH_INVALID` | `UNSUPPORTED_OPERATION` | `VALIDATION_FAILED` | `CONFIRMATION_REQUIRED` | `STALE_PATCH` | `UPDATE_FAILED`) + sanitized validation errors.
- **No redacted candidate / secret preservation:** apply builds its candidate from the unredacted repo definition, so untouched secret config is preserved byte-for-byte (never persisted as `[REDACTED]`); the result output leaks neither values nor secret-shaped key names (validator messages scrubbed).
- **Concurrency:** the workflows repo has no content-revision and `updateDraftDefinition` has no write-time guard, so this is **read-time** optimistic concurrency — `patch.baseRevision` must equal the workflow's current revision token (`updatedAt`), else `STALE_PATCH`. **Follow-up:** a write-time guarded update (`.eq("updated_at", …)`, mirroring `applyTransition`) closes the residual read→write TOCTOU window. Callers must set `patch.baseRevision = workflow.updatedAt` (AI-5 should surface that token — follow-up).

**Tests:** [`tests/unit/services/ai/apply/*`](../../../tests/unit/services/ai/apply/) (27, incl. AI-6B) — ownership/NOT_FOUND, revalidation (nothing persisted on failure, no input mutation, all-or-nothing), confirmation (block/allow, accepted-risk match, can't-bypass-invalid), persistence (add/update/remove/replaceTrigger; update called exactly once on success, never on failure), stale-patch rejection, no-redacted-candidate + secret preservation, deterministic risk + COST-2 + no-deduction, and no-leak (result values + secret key names).

### AI-6B implementation note

Hardening of the two AI-6 handoff gaps — no model calls, no UI, no route, no provider/billing work.

- **Write-time concurrency guard.** New repo method [`updateDraftDefinitionIfRevisionMatches`](../../../repositories/workflows.ts) updates only when `(id, user_id, updated_at)` all match the caller's expectation (mirrors `applyTransition`'s `.eq(state)` guard); returns `null` when nothing matched. `updateDraftDefinition` is unchanged for other callers. AI-6 apply now persists through this guard with `expectedUpdatedAt = record.updatedAt`, so a workflow changed between read and write is **never overwritten** — apply returns `STALE_PATCH` (it does not pretend success or auto-rebase). Concurrency is now enforced at BOTH read time (`baseRevision` vs `updatedAt`) and write time.
- **Revision token surfaced from preview.** `PatchPreviewResult` now carries `currentRevision` (the workflow's `updatedAt`, safe metadata). Callers MUST set `patch.baseRevision = currentRevision` before applying via AI-6. Present whenever the workflow loads; a NOT_FOUND surfaces as an `AiToolError`, not a result. A future route/UI passes this token through preview → patch → apply.

**Tests:** [`tests/unit/repositories/workflows.test.ts`](../../../tests/unit/repositories/workflows.test.ts) (+3 — guarded update matches / returns-null / throws); AI-6 apply suite (+2 — guarded-update token wiring, write-time stale rejection); AI-5 preview suite (`currentRevision` asserted on valid + invalid paths).

### AI-7 implementation note

Failed-run repair proposal service under [`services/ai/repair/`](../../../services/ai/repair/) — DETERMINISTIC, READ-ONLY. Inspects a failed run, classifies the failure, and proposes a `WorkflowPatch` **only when safe**, running it through AI-5 preview. NO model calls, NO apply (does not import AI-6), NO mutation, NO provider API calls. Auth + billing failures become recommendations, not patches.

- **[`suggestWorkflowRepair.ts`](../../../services/ai/repair/suggestWorkflowRepair.ts)** — `suggestWorkflowRepairForAI({ userId, workflowId, workflowRunId })`. Reads the run (`repositories/workflowRuns.getById`, ownership + workflow-match → `NOT_FOUND`), composes AI-2 graph/validation/variables, classifies into one category, and — for patch-producing categories — builds a `WorkflowPatch` (`baseRevision = graph.updatedAt`) and runs `previewWorkflowPatchForAI`. A rejected preview downgrades the result to `noSafeRepair` / `FAILED_PREVIEW` and drops the patch.
- **[`repairStrategies.ts`](../../../services/ai/repair/repairStrategies.ts)** — per-category builders (grounded via the live registry's `getNodeSchema`).

**Categories (v1, conservative):** missing required field → `{{AI_FIELD:…}}` placeholder **only for text/textarea** fields, else `needsUserInput` (never invents a value); invalid variable reference → `repairVariableReference` only when exactly one broken ref has exactly one matching upstream variable, else `needsUserInput`; downstream reference → `needsUserInput`; dangling edge → `removeEdge`; disconnected integration → reconnect recommendation (no patch, credentials never touched); unknown node metadata → `noSafeRepair` (invents nothing — newly-covered providers work automatically); billing limit → upgrade recommendation (billing never touched); missing trigger → `needsUserInput`; otherwise `noSafeRepair` / `NO_DETERMINISTIC_REPAIR`.

**Output:** `ok`, `workflowId`, `workflowRunId`, `failureSummary` (value-free: status + failed nodeId + error code + the run's stored humanized classification), `repairability` (`repairable` | `needsUserInput` | `noSafeRepair`), `reasonCode`, `proposedPatch?` + `preview?` (only when valid), `requiredUserInput[]`, `recommendations[]`, `confidence`, `safetyNotes[]`, `noMutation: true`. A non-failed run returns `RUN_NOT_FAILED`; only an unreadable run/workflow returns `ok:false` (`NOT_FOUND` / `READ_FAILED`).

**No-leak:** never surfaces raw step output, raw error messages, `error.details`, or PII — only the safe humanized classification + error code + value-free patch ops. **No apply:** asserted structurally (the service never imports `services/ai/apply`).

**Tests:** [`tests/unit/services/ai/repair/*`](../../../tests/unit/services/ai/repair/) (17) — ownership/NOT_FOUND, not-failed, every category, preview-rejection downgrade, no-apply guarantee, no-leak, and live-registry grounding (real `getNodeSchema`).

### AI-8A implementation note

First model-backed AI infrastructure for V2 — but a **safe boundary only**. It adds centralized model config, a provider-agnostic model client abstraction, and a deterministic prompt/result contract for future ground-up workflow planning. It does **NOT** create workflows from a prompt, mutate/preview/apply anything, call live provider APIs, add chat UI or public routes, or make live model calls (including in tests). AI-8B connects a real model client and runs the parsed patch through the AI-3 validator + AI-5 preview before anything becomes usable.

**Model boundary — [`core/ai/`](../../../core/ai/)** (pure; `core/` may import only from `contracts/`, so no provider SDK and no I/O live here):
- **[`modelTypes.ts`](../../../core/ai/modelTypes.ts)** — `ModelTier` (`fast` | `strong`), `ModelProvider`, `AiFeature`, `ModelMessage`, `ModelGenerateInput`, the discriminated `ModelResult` (`ModelSuccess` | `ModelFailure` with a closed `ModelFailureCode` set), and the `ModelClient` interface (`generateStructuredJson`).
- **[`models.ts`](../../../core/ai/models.ts)** — `MODELS` per-tier config (ids, vendor, token caps), `DEFAULT_MODEL_TIER`, `DEFAULT_MODEL_BUDGET` (timeout/retry), `FEATURE_DEFAULT_TIER`, `MODEL_API_KEY_ENV` (env var NAMES only — never values/keys), and pure selectors `getModelForTier` / `getModelForFeature` (safe fallback to default) / `getModelById` (undefined for unknown).
- **[`modelClient.ts`](../../../core/ai/modelClient.ts)** — `createNotConfiguredModelClient()` (always resolves a `NOT_CONFIGURED` failure — the honest default until AI-8B wires a real adapter) and `createMockModelClient()` (deterministic in-memory client with a recorded `calls` log for tests). Neither performs network I/O; the real OpenAI/Anthropic adapter is deferred to AI-8B/AI-8C and lives OUTSIDE `core/`.

**Planner contract — [`services/ai/planner/`](../../../services/ai/planner/)** (composes AI-2 + AI-3; no model call):
- **[`buildWorkflowPlanPrompt.ts`](../../../services/ai/planner/buildWorkflowPlanPrompt.ts)** — PURE, deterministic. Given a user request + the AI-2 provider catalog + connected integrations, emits grounded system+user `ModelMessage[]`. Lists ONLY catalog providers/actions/triggers (pending providers with no metadata never appear; newly-covered providers appear automatically through the catalog), flags destructive/high-risk actions, includes the `PLANNER_CONSTRAINTS` (no invented providers/fields, JSON-only, AI_FIELD/requiredUserInput for missing values, never invent credentials, prefer low-risk, list unsupported), the `TEMPLATE_FUTURE_NOTE` (template-aware, zero template dependency), and an optional cost/risk-awareness section. Built from redacted AI-2 views → no secrets.
- **[`buildWorkflowPlanRequest.ts`](../../../services/ai/planner/buildWorkflowPlanRequest.ts)** — async grounding seam: pulls the LIVE `getProviderCatalog()` + `getConnectedIntegrationsForAI(userId)`, then returns a `ModelGenerateInput` (feature `creation` → strong tier). Best-effort: a lookup failure degrades to empty, never throws. Does NOT call a model.
- **[`parseWorkflowPlanResponse.ts`](../../../services/ai/planner/parseWorkflowPlanResponse.ts)** — strict parser that never trusts raw model text: `EMPTY_RESPONSE` → strip one markdown fence then strict JSON (surrounding prose → `NOT_JSON`) → refuse any literal secret-keyed value (`SECRET_IN_RESPONSE`; variable-reference tokens + numeric config allowed) → validate wrapper shape (`INVALID_SHAPE`; unknown top-level keys stripped) → validate `proposedPatch` (when present) against the AI-3 `WorkflowPatchSchema` (`INVALID_PATCH`). A null/absent patch is valid ("needs user input / nothing to apply").

**Structured response shape:** `intentSummary`, `assumptions[]`, `requiredUserInput[]`, `proposedPatch` (AI-3 `WorkflowPatch` | null — never auto-applied here), `confidence`, `safetyNotes[]`, `unsupportedRequests[]`.

**No-leak:** prompt + result are built from ids / display labels / field keys / capabilities only — no tokens, secrets, PII, message bodies, or file contents; the parser additionally refuses literal credentials and its error messages never echo the offending value.

**Tests:** [`tests/unit/core/ai/*`](../../../tests/unit/core/ai/) + [`tests/unit/services/ai/planner/*`](../../../tests/unit/services/ai/planner/) (63) — config defaults/fallbacks/no-secrets, mock + NOT_CONFIGURED clients (no network), prompt grounding (catalog-only, pending absent, new-provider auto, constraints, template language, connected summary, no-leak), live-registry request grounding, and the full parser matrix (valid/null/absent patch, empty, non-JSON, fences, prose, shape, AI-3 patch violations, secret refusal).

### AI-8B implementation note

First **model-backed** planning service — but still a READ-ONLY proposal pipeline. [`services/ai/planner/planWorkflowFromPrompt.ts`](../../../services/ai/planner/planWorkflowFromPrompt.ts) — `planWorkflowFromPromptForAI({ userId, workflowId, prompt, modelClient?, modelTier?, feature? })`. It does **NOT** apply (does not import AI-6 `services/ai/apply`), mutate/persist a workflow, persist model output, call provider APIs, add UI, or add public routes.

**Pipeline:** `buildWorkflowPlanRequest` (AI-8A; live `getProviderCatalog` + connected integrations grounding) → injected `modelClient.generateStructuredJson` → `parseWorkflowPlanResponse` (AI-8A; strict, refuses literal secrets) → reconcile patch (`workflowId` forced to the requested target; `baseRevision` set to the live `getWorkflowGraphForAI().updatedAt`) → `previewWorkflowPatchForAI` (AI-5 → AI-3 validate + COST-2 + AI-4 explain).

**Model client is dependency-injected** — default is `createNotConfiguredModelClient()`, so without a real adapter every call fails safe (`MODEL_FAILED` / `NOT_CONFIGURED`). No real OpenAI/Anthropic adapter ships here (deferred to AI-8C); tests use `createMockModelClient` — no live network calls.

**Result shape:** `ok`, `intentSummary`, `assumptions[]`, `requiredUserInput[]`, `unsupportedRequests[]`, `safetyNotes[]`, `proposedPatch?`, `preview?`, `canApplyLater`, `blockedReason?`, `model` (`modelId`/`tier`/`feature`/`finishReason`/`usage?`/`latencyMs?`), `noMutation: true`. Hard failures return `ok:false` with `code` (`MODEL_FAILED` | `PARSE_FAILED` | `PREVIEW_UNAVAILABLE`) + `errors[]`.

**`canApplyLater` semantics:** true ONLY when the model proposed a patch AND the deterministic preview validated it. A no-patch response (clarification / unsupported) is `ok:true, canApplyLater:false` with no preview. A structurally-valid-but-semantically-invalid patch (e.g. an invented provider) is `ok:true, canApplyLater:false` with `blockedReason` + the preview's validation errors surfaced — the plan is shown but is not apply-ready.

**Safety:** model-proposed risk / cost / confirmation are ignored — the deterministic preview's recomputed values win (AI-3). A hallucinated provider/action/field cannot pass: the parser rejects literal secrets and structural violations, and the AI-5/AI-3 validator rejects unknown registry keys. Newly-covered providers become available automatically via the live catalog; nothing is hardcoded.

**Tests:** [`tests/unit/services/ai/planner/planWorkflowFromPrompt.test.ts`](../../../tests/unit/services/ai/planner/planWorkflowFromPrompt.test.ts) (15) — happy path (model called once, preview, `canApplyLater` true), baseRevision/workflowId reconciliation, model metadata, no-patch + unsupported (no preview), model failure (NOT_CONFIGURED + provider error), parse failure (non-JSON + prose), preview rejection of an invented provider (real validator), preview-unavailable (workflow NOT_FOUND), live-catalog prompt grounding, no-apply/no-repo-import (source assertion) + `noMutation`, and result no-leak.

### AI-8C implementation note

First **real** model adapter + runtime configuration — still NO live calls in tests, NO workflow mutation/apply, NO UI, NO public routes. The runtime client layer lives in [`services/ai/modelClients/`](../../../services/ai/modelClients/) (NOT `core/ai/`, which stays pure: no env/network/provider shapes). `core/ai/` keeps the model CONFIG + the abstract `ModelClient`/`ModelResult` contract; this layer implements it for real.

- **Adapter strategy:** Anthropic first, via `fetch` (no provider SDK dependency added). Chosen because `core/ai/models.ts` already points both tiers at Anthropic Claude models — the default model must have a serving adapter. OpenAI remains reserved (no adapter yet → `CONFIGURATION_ERROR`).
- **[`anthropicClient.ts`](../../../services/ai/modelClients/anthropicClient.ts)** — `createAnthropicModelClient({ apiKey, baseUrl?, timeoutMs?, fetchImpl?, anthropicVersion? })`. Resolves the model from `core/ai/models`, splits the AI-8A prompt into Anthropic's `system` + `messages`, enforces a timeout via `AbortController`, and maps outcomes: 429 → `RATE_LIMITED`, other non-2xx → `PROVIDER_ERROR`, unparseable 2xx → `INVALID_RESPONSE`, empty content → `EMPTY_RESPONSE`, abort → `TIMEOUT`, other throw → `NETWORK_ERROR`; `retryable` set for 429/5xx/network/timeout. `fetchImpl` is injectable so tests never touch the network.
- **[`createModelClient.ts`](../../../services/ai/modelClients/createModelClient.ts)** — `createRuntimeModelClient({ feature, tier? })` reads the provider's API-key env var (names from `MODEL_API_KEY_ENV`) at call time and returns: the real adapter (Anthropic + key) / `createNotConfiguredModelClient()` (Anthropic, no key) / a `CONFIGURATION_ERROR` client (unsupported provider). Never throws on missing config. `createModelClientForModel(model, apiKey)` exposes the branch logic for direct testing; `createModelClientForFeature` is a convenience wrapper.
- **Failure-code extension:** [`core/ai/modelTypes.ts`](../../../core/ai/modelTypes.ts) `ModelFailureCode` gains `CONFIGURATION_ERROR`, `NETWORK_ERROR`, `INVALID_RESPONSE`; `ModelFailure` gains optional `retryable`.
- **Planner wiring:** [`planWorkflowFromPrompt.ts`](../../../services/ai/planner/planWorkflowFromPrompt.ts) default client is now `createRuntimeModelClient({ feature, tier })` instead of always-NOT_CONFIGURED. An injected `modelClient` still wins (no env required); with no key the planner still fails safe (`MODEL_FAILED` / `NOT_CONFIGURED`). The deterministic parse/preview safety flow is unchanged.
- **No-leak:** the API key lives only in the closure + the `x-api-key` request header — never returned, logged, or echoed; provider error bodies are sanitized to a short, capped, key-free summary.
- **Env:** `.env.example` documents `ANTHROPIC_API_KEY` (optional) as the runtime adapter key; `OPENAI_API_KEY` reserved.

**Tests:** [`tests/unit/services/ai/modelClients/*`](../../../tests/unit/services/ai/modelClients/) — adapter (success/usage/finishReason/latency, request shape + `x-api-key`, full error mapping, no-leak, injected-fetch-only) + factory (missing-env → NOT_CONFIGURED, unsupported provider → CONFIGURATION_ERROR, configured → real adapter via mocked fetch, no key leak, no-throw). Planner: default runtime wiring (missing key → MODEL_FAILED, configured + mocked fetch → reaches preview, injected client still wins). No test makes a live network call.

### AI-9A implementation note

First **app-facing** AI route — and it stays PREVIEW-ONLY. [`app/api/workflows/[id]/ai/plan/route.ts`](../../../app/api/workflows/[id]/ai/plan/route.ts) — `POST`. It NEVER applies a patch, mutates the workflow/DB, or persists the prompt / model output. Thin handler (per the route-layer convention): auth → validate → call `planWorkflowFromPromptForAI` → format response.

- **Auth:** `requireUser()` (shared) → 401 when unauthenticated; the planner is never called.
- **Validation:** Zod body — `prompt` (required, trimmed, 1..8000 chars) + optional `modelTier` (`"fast" | "strong"` allow-list). Unknown keys are stripped (forward-compatible, so a future `feature`/etc. doesn't 400). Invalid body / non-JSON → 400. `feature` is server-controlled (the planner's `creation` default) — not client-settable.
- **Wiring:** calls `planWorkflowFromPromptForAI({ userId, workflowId: id, prompt, modelTier? })`. The planner's default client is the env-configured runtime client (AI-8C), so with no `ANTHROPIC_API_KEY` the route safely returns the `MODEL_FAILED` / `NOT_CONFIGURED` structured result — never a 500.
- **Status mapping:** 200 for any successful plan (incl. needs-input + preview-rejected — `ok` + `canApplyLater` carry the distinction); 404 when the workflow is not found / not owned (`PREVIEW_UNAVAILABLE` + `NOT_FOUND`, no existence leak); 503 for `MODEL_FAILED` (model unconfigured/failed); 502 for `PARSE_FAILED` / other `PREVIEW_UNAVAILABLE`; 500 only for an unexpected thrown error (sanitized).
- **No-leak / no-persistence:** the response body is the already-sanitized `PlanWorkflowResult` (no secrets, no config values, no API key); nothing is written to the DB and no prompt/response is stored.
- **Deferred:** chat/builder UI consuming this route, an apply route, and `ai_events` observability wrapping (AI-9B+).

**Tests:** [`tests/unit/app/api/workflows/ai-plan-route.test.ts`](../../../tests/unit/app/api/workflows/ai-plan-route.test.ts) (18) — 401 unauth, 400 (missing/empty/too-long prompt, bad modelTier, non-JSON), unknown-key tolerance, planner wiring (userId/workflowId/prompt + modelTier + trim), 200 success + needs-input, 503 model-not-configured, 502 parse-failure, 404 NOT_FOUND, sanitized 500 on throw, no-apply/no-repo/no-adapter source assertion, and response no-leak. The planner service is mocked — no live model/network call.

### AI-9B implementation note

The mutation-capable companion to the preview route — strict by construction. [`app/api/workflows/[id]/ai/apply/route.ts`](../../../app/api/workflows/[id]/ai/apply/route.ts) — `POST`. It delegates entirely to the AI-6 apply service; it makes NO model/planner call, never auto-applies, and never mutates outside `applyWorkflowPatchForAI`. The plan→preview→confirm→apply loop is: `POST …/ai/plan` → user reviews preview → user confirms if needed → `POST …/ai/apply`.

- **Auth:** `requireUser()` → 401; the apply service is never called.
- **Validation:** Zod body — `patch` required (must be a JSON object; full structural + semantic validation is the service's job) + optional `confirmation` (`{confirmed, confirmationToken?, acceptedRiskLevel?, acceptedAt?}`). Invalid body / non-JSON → 400. Unknown keys stripped.
- **Wiring:** `applyWorkflowPatchForAI({ userId, workflowId: id, patch, confirmation? })`. The route never accepts a client preview as proof: the **service** re-loads the UNREDACTED definition, re-runs the AI-3 validator, checks `baseRevision` (read- and write-time), runs the confirmation gate, and performs the guarded persist. Client-supplied `riskLevel`/`requiresConfirmation` are ignored (recomputed).
- **Confirmation:** high-risk/destructive patches need `confirmation.confirmed === true`; a supplied `acceptedRiskLevel` must match the validator's recomputed level (a stale low-risk confirmation can't authorize a high-risk patch). Confirmation can never bypass validation.
- **Status mapping:** 200 success · 404 `NOT_FOUND` (no existence leak) · **428** `CONFIRMATION_REQUIRED` (precondition — distinct from stale) · **409** `STALE_PATCH` (incl. write-time concurrency miss) · 400 `PATCH_INVALID`/`UNSUPPORTED_OPERATION`/`VALIDATION_FAILED` · 500 `UPDATE_FAILED` (server-side persist/load error — the concurrency miss is already `STALE_PATCH`) and any unexpected throw (sanitized).
- **No-leak:** the body is the already-sanitized `ApplyWorkflowPatchResult` (no secrets/config values/raw definition; AI-6 scrubs secret-shaped field names from validation messages).

**Tests:** [`tests/unit/app/api/workflows/ai-apply-route.test.ts`](../../../tests/unit/app/api/workflows/ai-apply-route.test.ts) (18) — 401 unauth, 400 (missing/non-object patch, bad confirmation, non-JSON), apply wiring (userId/workflowId/patch + confirmation forwarding), 200 success, 404/428/409/400(×3)/500 status mapping, sanitized 500 on throw, no-model/no-planner/no-repo source assertion, and response no-leak. The apply service is mocked — no DB write, no model call.

### AI-10 implementation note

**Audit-first finding:** the AI observability FOUNDATION already shipped — **COST-6** built the `ai_cost_events` ledger ([migration](../../../supabase/migrations/20260525000001_ai_cost_events.sql) + RLS + GRANTs + indexes, [repository](../../../repositories/aiCostEvents.ts), and the [recorder + `sanitizeAiEventMetadata` + `recordAi*` helpers](../../../services/billing/aiCostEvents.ts)), and **COST-7** built [owner analytics](../../../services/analytics/ownerAiStats.ts) (usage / by-feature / by-model / patch funnel + acceptance / validation-failure / safety-block / feedback / template + custom-node signals). The ledger's `event_type` taxonomy already matches §16. So AI-10 adds **NO new table, NO new recorder/sanitizer, NO new analytics** — a parallel `ai_events` table would only duplicate this and muddy analytics. AI-10's net-new work is the **emission/wiring layer** that makes the live routes actually feed the ledger.

- **[`services/ai/events/recordAiRouteEvents.ts`](../../../services/ai/events/recordAiRouteEvents.ts)** — maps a `PlanWorkflowResult` / `ApplyWorkflowPatchResult` onto the existing recorder helpers. `recordAiPlanOutcome` (feature `workflow_creation`) emits `ai_interaction_started` → a model event (`ai_model_call_completed`, or `ai_model_call_failed` with `metadata.stage` = `model`/`parse`) → patch events (`ai_patch_proposed` → `ai_patch_previewed` | `ai_patch_validation_failed`). `recordAiApplyOutcome` (feature `workflow_editing`) emits `ai_patch_applied` on success, `ai_safety_block_triggered` (`confirmation_required`) for the confirmation gate, else `ai_patch_validation_failed` carrying the apply code.
- **FAIL-OPEN:** both functions swallow all errors — a ledger/insert failure NEVER breaks the AI flow. The plan + apply routes additionally wrap the call in their own try/catch (belt-and-suspenders) and still return the correct status/body.
- **No-leak:** emission forwards only ids / codes / counts / model name / token counts / latency / tier / finishReason — never the prompt (it isn't even in the result), the model completion text, or any patch CONFIG value (it reads `proposedPatch.operations.length`, never config). The COST-6 `sanitizeAiEventMetadata` re-scrubs `metadata` as defense in depth. No raw prompt/completion is persisted; no new event row stores content.
- **Route wiring:** the plan route ([plan/route.ts](../../../app/api/workflows/%5Bid%5D/ai/plan/route.ts)) and apply route ([apply/route.ts](../../../app/api/workflows/%5Bid%5D/ai/apply/route.ts)) call the recorder after producing the result; provider model id → provider is resolved via `core/ai/models.getModelById` for the by-model analytics dimension.
- **Owner analytics:** unchanged — the COST-7 folds (`ownerAiStats`) now have real rows to aggregate (patch funnel, acceptance rate, validation-failure/hallucination-catch counts, safety blocks, model latency/cost). The owner dashboard UI remains a future slice.

**Tests:** [`tests/unit/services/ai/events/recordAiRouteEvents.test.ts`](../../../tests/unit/services/ai/events/recordAiRouteEvents.test.ts) (12) — full plan/apply event mapping, fail-open (recorder throws → resolves), and no-raw-config-leak; plus the plan + apply route tests gain wiring + analytics-resilience cases (recorder rejects → route still 200). No live model/DB writes — the recorder is mocked.

### AI-11 implementation note

The first **user-facing** AI surface — a MINIMAL Builder panel, not a chat product. It consumes the AI-9A/9B routes and drives the plan → preview → confirm → apply loop. No conversation thread, no history, no prompt/response persistence; no model is ever called from the client; nothing auto-applies; the workflow is mutated ONLY through the AI-9B apply route.

- **[`lib/api/ai.ts`](../../../lib/api/ai.ts)** — typed client (`planWorkflow` / `applyWorkflowPatch`). CLIENT-OWNED view types (the client may not import `@/services/**`); `proposedPatch` is OPAQUE (forwarded to apply, never inspected/rendered). Returns the structured body for handled outcomes at any status (plan 503/502; apply 428/409/400-with-code); throws `AiApiError` only for transport failures whose body has no `ok` (401/404/500).
- **[`hooks/useBuilderAi.ts`](../../../features/workflow-builder/hooks/useBuilderAi.ts)** — plan→apply state machine (`idle`/`planning`/`planned`/`applying`/`applied`). `apply()` attaches a confirmation `{confirmed:true, acceptedRiskLevel, acceptedAt}` ONLY when the deterministic preview says `requiresConfirmation` (risk level from the preview, never client-invented), and is a guarded no-op unless the plan is apply-ready with a `proposedPatch`. Auth/transport errors map to friendly copy — never a raw provider error.
- **[`panels/BuilderAiPanel.tsx`](../../../features/workflow-builder/panels/BuilderAiPanel.tsx)** — prompt box + result panel mounted in [`WorkflowBuilder.tsx`](../../../features/workflow-builder/WorkflowBuilder.tsx) (least-invasive: a stacked `<section>` like RunNowPanel; reads `workflowId` from `graphSlice`). Renders intent/assumptions/required-input/unsupported/safety notes + the preview (risk, cost, affected counts, value-free change descriptions, validation errors). The **Apply button only appears when `canApplyLater` && `proposedPatch`**; for `requiresConfirmation` it is gated behind an explicit "I understand this is {risk}-risk" checkbox. On success it refreshes the Builder via the existing `graphSlice.hydrate` pattern (re-fetch `getWorkflow`); `STALE_PATCH` → "re-run Plan with AI"; model-not-configured (`MODEL_FAILED`) → a friendly "not available" message.
- **No-leak:** renders only ids/labels/codes/value-free preview text — never raw patch JSON, config values, secrets, the raw workflow definition, or raw model/provider errors; nothing is logged.

**Tests:** [`tests/unit/lib/api/ai.test.ts`](../../../tests/unit/lib/api/ai.test.ts) (13, fetch mocked) + [`tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx) (11, API mocked) — render/submit, loading, model-not-configured, needs-input/unsupported (no apply), preview-invalid (no apply), apply-ready, high-risk requires explicit confirm before apply, apply forwards patch + confirmation, success → refresh + success message, STALE_PATCH re-run message, **no-auto-apply**, and no-raw-config-leak.

### AI-11B implementation note

UI/UX hardening of the AI-11 Builder panel — NO new model behavior, NO chat thread, NO persistence, NO auto-apply, NO mutation outside the AI-9B route, NO hardcoded providers. Touches [`BuilderAiPanel.tsx`](../../../features/workflow-builder/panels/BuilderAiPanel.tsx) (rewrite) + [`lib/api/ai.ts`](../../../lib/api/ai.ts) (adds `AiRiskReason` to the `AiPreview` view type) only.

- **Clearer state copy:** distinct, plain-English messaging for idle / planning (a `role="status"` "Planning your change…" indicator) / plan-success / needs-input / unsupported / preview-invalid / confirmation-required / applying / applied / stale-patch / model-unavailable / generic error. The user always learns what happened and the next step.
- **Readable preview** ("What AI plans to change"): value-free change descriptions, affected node/edge counts, emphasized risk level, confirmation indicator, **risk reasons** (from AI-3, surfaced via the new `riskReasons` field), task-cost estimate, and validation **errors** ("Problems to fix") shown separately from **warnings** and from **required user input** (rendered in its own callout, never mixed with errors).
- **Safer confirmation:** an explicit "I understand this is {risk}-risk" checkbox gates the Apply button; the acknowledgement **resets on every new plan** (and on Clear), so a stale confirmation can't carry over.
- **Stale-patch recovery:** a clear "the workflow changed after the plan was created" message plus a one-click **Re-run plan** button that re-plans with the retained prompt — it NEVER auto-reapplies.
- **Model unavailable:** friendly "AI assistant isn't available right now…" copy, no apply button, no raw provider error.
- **Prompt usability:** a character counter that appears near the 8000-char limit (destructive styling + "too long" when exceeded), example placeholder, submit disabled while invalid/busy, the prompt is kept after planning so the user can revise, and a **Clear** / **Plan another change** control resets the result.
- **No-leak (unchanged guarantee):** still renders only ids/labels/codes/value-free text — no raw patch JSON, config values, secrets, raw model responses, raw provider errors, or raw workflow definition; nothing logged.

**Tests:** [`tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx) grows to 17 (+ 13 client) — planning indicator, clear-keeps-prompt, char-counter + too-long-disables-submit, confirmation-resets-on-new-plan, risk-reasons + warnings rendering, stale-patch re-run (no auto-reapply), plan-another-change after success, plus the retained AI-11 state/no-leak/no-auto-apply cases.

### AI-12 implementation note

AI analytics API surface — backend, READ-ONLY. It exposes the existing AI observability data (COST-6 `ai_cost_events` + COST-7 `ownerAiStats` folds) over a protected route. No new table, no model call, no ledger write, no UI.

**Auth/scope decision (honest):** V2 has **no admin/owner authorization convention** (confirmed by audit — the only "admin" reference is COST-7's own docstring deferring the gate; there is no `requireAdmin`, role/capability column, or `app/api/admin`). So AI-12 ships **only a current-user-scoped route** and does **NOT** expose owner-wide cross-user analytics behind `requireUser` (which would be unsafe). The owner/admin route (`GET /api/admin/ai/analytics` over the service-role `listEventsForAnalytics`) is **BLOCKED** until an admin gate exists; it is documented in the route file and here.

- **[`GET /api/ai/usage`](../../../app/api/ai/usage/route.ts)** — `requireUser` (the generic `@/app/api/providers/_shared`). Query params: `from`/`to` (ISO), `days` (1..365), `limit` (1..5000); default range last 30 days. Validation → 400 (bad date, `from`>`to`, non-integer/out-of-range days/limit). Returns `{ range, scope: "current_user", ...report }`. Service throw → sanitized 500.
- **[`repositories/aiCostEvents.ts` `listByUser`](../../../repositories/aiCostEvents.ts)** — RLS-gated SSR-client read (mirrors `listByWorkflow`); a user can only ever read their OWN events (explicit `user_id` filter is belt-and-suspenders on top of RLS). Cross-user reads still require the service-role `listEventsForAnalytics` + an admin gate.
- **[`services/analytics/aiAnalyticsReport.ts`](../../../services/analytics/aiAnalyticsReport.ts)** — `buildAiAnalyticsReport(events)` (pure) composes ALL COST-7 folds into one report (overview, byFeature, byModel, patchOutcomes, toolStats, validationFailures, safetyBlocks, feedback, template/custom-node signals); `getAiAnalyticsForUser` loads via `listByUser` + folds. COST-7 is reused, not modified.
- **No-leak:** the report carries only counts / enums / model+feature names / token+latency+cost numbers / ranges — the COST-7 folds read metadata KEY-presence only, never metadata VALUES, so no raw prompt / completion / config / secret can surface (tested: a secret in event metadata never appears in the report).

**Tests:** [`tests/unit/services/analytics/aiAnalyticsReport.test.ts`](../../../tests/unit/services/analytics/aiAnalyticsReport.test.ts) (5) — fold composition, empty-data zeros, user-scoped load wiring, metadata-value no-leak; [`tests/unit/app/api/ai/usage-route.test.ts`](../../../tests/unit/app/api/ai/usage-route.test.ts) (20) — 401, default/`days` range, all query-validation 400s, user-scoped service call, full shape, empty data, sanitized 500, read-only (no planner/apply/model/event-write import) + response no-leak. Service mocked — no DB read, no model call.

### AI-12B implementation note

Prompt/patch-shape hardening + useful needs-input failure. Diagnosed from a real failure: prompt `"when a stripe payment fails, i want it to send me a slack dm"` → `POST /api/workflows/[id]/ai/plan` returned **502** with `ai_interaction_started` + `ai_model_call_failed` (no `ai_model_call_completed`). That fingerprint is `PARSE_FAILED` at `stage=parse` ([recordAiRouteEvents.ts](../../../services/ai/events/recordAiRouteEvents.ts) emits `ai_model_call_failed` for `MODEL_FAILED`/`PARSE_FAILED`; the route maps `MODEL_FAILED→503`, `PARSE_FAILED→502`; `PREVIEW_UNAVAILABLE` would have logged `…_completed` first). So the model call SUCCEEDED and the strict AI-3 parse rejected the output. Root cause: the planner prompt described `proposedPatch` only as *"a WorkflowPatch (patchId, workflowId, baseRevision, operations[], summary, rationale)"* — it never described the operation union, the node shape (`WorkflowNodeSchema` requires `id` + `kind` + a SEPARATE `provider` + `type`), or the edge shape, while every operation/the envelope is `.strict()`. **The schema is correct; the prompt was under-specified.** No schema was loosened.

- **[`buildWorkflowPlanPrompt.ts`](../../../services/ai/planner/buildWorkflowPlanPrompt.ts)** — new exported `PATCH_SHAPE_GUIDE`: exact envelope keys, the operation vocabulary sourced from `SUPPORTED_OPERATION_KINDS` (so it can't drift from the schema), per-op key sets, the node shape with the explicit `provider:type` → split-into-(provider,type) instruction (the core fix), the edge shape (`from`/`to`, never `source`/`target`), and config rules (AI_FIELD / requiredUserInput / no invented fields / no secrets). Two new `PLANNER_CONSTRAINTS`: prefer a null patch + `requiredUserInput` over any partial/guessed patch, and follow the patch shape exactly. The planner already turns a null patch into a 200 needs-input result ([planWorkflowFromPrompt.ts](../../../services/ai/planner/planWorkflowFromPrompt.ts)) — no service change needed.
- **[`providerCatalog.ts`](../../../services/ai/tools/providerCatalog.ts)** — generic static-enum grounding: `CatalogActionEntry`/`CatalogTriggerEntry` gain an optional `configOptions` (field → allowed `options[]` VALUES, capped at 24; dynamic `optionsSource` fields excluded). Metadata-driven, no provider-specific logic; rendered under each provider in the prompt.
- **[`BuilderAiPanel.tsx`](../../../features/workflow-builder/panels/BuilderAiPanel.tsx)** — `PARSE_FAILED` copy changed to "the AI returned a plan in the wrong format…", plus a value-free `Planner error: {stage} / {code}` detail line (never the raw model output or the detailed parser message). `requiredUserInput` already renders in its own callout.
- **Stripe-specific honesty:** the catalog grounding does NOT close the Stripe failed-payment case, because `stripe:event_received` has **no registered `TriggerMeta`** (deliberately deferred — see the discovery-registry comment) and therefore isn't in the AI catalog at all; creating that meta is out of scope here (don't touch provider metadata). With AI-12B the model now degrades gracefully — no Stripe trigger in the catalog → null patch + `requiredUserInput`/`unsupportedRequests` (a 200), not a guessed patch (a 502). Slack DM is fully grounded (`slack:send_direct_message`).
- **No-leak / boundaries:** no raw prompt or completion is persisted or printed; no provider metadata, billing, or apply code touched; schema strictness unchanged; preview never bypassed.

**Tests:** [`buildWorkflowPlanPrompt.test.ts`](../../../tests/unit/services/ai/planner/buildWorkflowPlanPrompt.test.ts) (+7 — guide present, op vocabulary, node fields + split, edge from/to, null-patch steering, static-options rendered/omitted), [`parseWorkflowPlanResponse.test.ts`](../../../tests/unit/services/ai/planner/parseWorkflowPlanResponse.test.ts) (+2 — node missing kind/provider → INVALID_PATCH, op extra key → INVALID_PATCH), [`planWorkflowFromPrompt.test.ts`](../../../tests/unit/services/ai/planner/planWorkflowFromPrompt.test.ts) (+1 — Stripe-DM missing userId → requiredUserInput, not parse failure), [`providerCatalog.test.ts`](../../../tests/unit/services/ai/tools/providerCatalog.test.ts) (+1 — static options surfaced from real metadata), [`ai-plan-route.test.ts`](../../../tests/unit/app/api/workflows/ai-plan-route.test.ts) (parse-failure now asserts `errors[0].stage==="parse"`), [`BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx) (+1 — parse-failure copy + value-free detail + no raw-message leak), [`recordAiRouteEvents.test.ts`](../../../tests/unit/services/ai/events/recordAiRouteEvents.test.ts) (PARSE_FAILED now also asserts no `…_completed`/patch event — locks the fingerprint).

### AI-12C implementation note

After AI-12B fixed the patch *shape* (INVALID_PATCH), real testing still hit `parse/NOT_JSON` for the same prompt — the model was returning output that isn't a bare JSON object (a preamble like "Sure, here's the plan:", or a ```json fence), which `parseWorkflowPlanResponse` rejects at `JSON.parse` — *before* patch validation or preview. The raw completion is not logged (by design), so the exact offending text isn't directly observable; `NOT_JSON` means the model call succeeded but the output failed JSON parsing, and preamble/fence is the overwhelmingly common cause.

**Honest revert log.** The initial AI-12C revision tried to fix this at the adapter layer with an Anthropic **assistant `{` prefill** (the canonical "force a JSON-object start" technique). It produced a hard regression: Claude 4.x models reject it. Live failure from the running dev server:

```
HTTP 400 invalid_request_error: This model does not support assistant message
prefill. The conversation must end with a user message.
```

The prefill code (request append + `reattachJsonPrefill` + the prefill describe block in the adapter test) was **reverted in the same slice**. The adapter is back to its pre-AI-12C request shape; this is documented in the file's header comment as a regression log so future readers don't re-introduce it. Lesson: prefill is supported on Claude 3.x but is **not** supported on the 4.x models V2 ships with (`claude-sonnet-4-6`, `claude-haiku-4-5`). The supported next step if prompt-only is insufficient is **forced `tool_choice`** (Anthropic tool-use), not prefill.

What AI-12C actually ships (the prompt + UI hardening is preserved — it is independent of prefill and is itself a real improvement over AI-12B):

- **[`buildWorkflowPlanPrompt.ts`](../../../services/ai/planner/buildWorkflowPlanPrompt.ts) — JSON-only instruction.** Constraint #3 strengthened (exactly one JSON object, first `{` / last `}`, no fences/comments/trailing commas) and a dedicated `JSON_OUTPUT_RULES` block rendered **last** (recency) restating: one object only, first/last char, no markdown/```json fence, no prose before/after, no comments/trailing commas, and "if unsure, return `proposedPatch:null` + `requiredUserInput`". This is now the sole JSON-only enforcement in AI-12C.
- **[`BuilderAiPanel.tsx`](../../../features/workflow-builder/panels/BuilderAiPanel.tsx)** — `PARSE_FAILED` with code `NOT_JSON` shows a specific safe message ("The AI returned text instead of the required JSON plan…"); other parse failures keep the AI-12B "wrong format" copy. Still value-free (`stage / code` only) — never the raw model output or the detailed parser message.
- **Parser unchanged.** `parseWorkflowPlanResponse` keeps its existing behavior: trim, strip ONE fully-wrapping code fence, then strict `JSON.parse` (rejects prose before/after, comments, trailing commas). NO broad JSON-substring extractor (would mask secret-refusal / shape guarantees).
- **Stripe/Slack (unchanged, out of scope):** once JSON-only holds, the Stripe-DM prompt still degrades to needs-input/unsupported (a **200**) because `stripe:event_received` has no `TriggerMeta` in the catalog — the deferred provider-track item.
- **No-leak / boundaries:** no raw prompt or completion is persisted or printed; the API key never surfaces in any result; no provider metadata, billing, apply, preview, or schema-strictness touched.

**Tests:** [`anthropicClient.test.ts`](../../../tests/unit/services/ai/modelClients/anthropicClient.test.ts) (request-shape assertion documents the Claude 4.x "must end on user turn" constraint), [`buildWorkflowPlanPrompt.test.ts`](../../../tests/unit/services/ai/planner/buildWorkflowPlanPrompt.test.ts) (+5 — JSON-only rules present, exactly-one-object, no-fences, first-`{`/last-`}`, no prose/comments/trailing commas), [`parseWorkflowPlanResponse.test.ts`](../../../tests/unit/services/ai/planner/parseWorkflowPlanResponse.test.ts) (+4 — preamble-before, trailing-prose-after, `//` comment, trailing comma all → NOT_JSON), [`BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx) (+1 — NOT_JSON-specific copy + value-free detail + no raw-message leak). No live model/network calls — the adapter fetch is injected.

### AI-12D implementation note

Planner config-field grounding fix. Closes the "model invents `message` instead of `text` / `field` instead of `input`" class of bugs that AI-12B/C left on the table.

**Root cause.** The compact catalog [`getProviderCatalog`](../../../services/ai/tools/providerCatalog.ts) surfaced action/trigger KEYS and static-enum option VALUES, but never the actual config field NAMES. The prompt's "use field names exactly as they appear in the node metadata" rule had no field list to back it; the model guessed from `displayName` ("Send Direct **Message**"), from the field's UI `label`, and even from output names (Slack DM's sensitive `message` output).

**Fix — generic, metadata-driven.** Catalog entries now carry `configFields: { name, type, required }[]` derived directly from `FieldMeta` in registry order. The prompt renders a per-node `config fields:` block with `required:` + (when non-empty) `optional:` sub-lines, each entry tagged by renderer type. Three new `PLANNER_CONSTRAINTS`: (a) config keys MUST come from the per-node block — never from displayName / UI label / description / output name; (b) every `required:` field MUST appear in config (literal, `{{nodeId.field}}` ref, or `{{AI_FIELD:fieldName}}` placeholder); (c) do NOT substitute `native:manual.run` for an event-driven trigger the user actually asked for — return `proposedPatch:null` + `unsupportedRequests` + `requiredUserInput` when the requested trigger has no catalog metadata.

**Pinned via tests** (round-trips through the real validator, not mocked): `slack:send_direct_message` grounds as required `userId` + `text`, optional `threadTs` — `message` deliberately absent (it's a sensitive OUTPUT). `native:if_then_condition` grounds as required `input` + `operator` — `field` never a key. A patch with the wrong key (`message` / `field`) is rejected with `MISSING_REQUIRED_FIELD`; the correct keys preview as apply-ready.

**Boundaries.** Strict `WorkflowPatchSchema` unchanged. Parser unchanged. Preview validator unchanged. UI unchanged. No provider metadata touched (provider track owns Stripe `event_received` etc.). 14 new tests + fixture updates across [`providerCatalog.test.ts`](../../../tests/unit/services/ai/tools/providerCatalog.test.ts), [`buildWorkflowPlanPrompt.test.ts`](../../../tests/unit/services/ai/planner/buildWorkflowPlanPrompt.test.ts), [`planWorkflowFromPrompt.test.ts`](../../../tests/unit/services/ai/planner/planWorkflowFromPrompt.test.ts).

### AI-13 implementation note

Failed-run repair route + Builder/Run-Results entry point. The first user-facing surface for the AI-7 deterministic repair service — the user clicks a single button on a failed run and gets a humanized summary + (when safe) a previewed `WorkflowPatch` they can apply through the existing AI-9B apply route.

**Scope.** Two new files plus extensions to two existing modules:

- **[`app/api/workflows/[id]/runs/[runId]/ai/repair/route.ts`](../../../app/api/workflows/[id]/runs/[runId]/ai/repair/route.ts)** — thin `POST` that gates on `requireUser`, optionally validates a forward-compat body (all fields ignored at AI-13 — see below), calls AI-7's [`suggestWorkflowRepairForAI`](../../../services/ai/repair/suggestWorkflowRepair.ts), emits a fire-and-forget `recordAiRepairOutcome`, and returns the sanitized `RepairSuggestionResult` verbatim. Status mapping: `200` for every `ok:true` outcome (the body's `repairability` + `reasonCode` carry the distinction — repairable / needsUserInput / noSafeRepair); `404` for service `NOT_FOUND`; sanitized `500` for service `READ_FAILED` and any unexpected throw; `401` unauthenticated; `400` invalid body / missing ids. **No** model failure surface (AI-7 doesn't call a model). **No** parse failure surface (AI-7 returns a typed result, not text).
- **[`services/ai/events/recordAiRouteEvents.ts`](../../../services/ai/events/recordAiRouteEvents.ts)** — adds `recordAiRepairOutcome`. Emits into the EXISTING COST-6 `ai_cost_events` ledger with `feature: "workflow_repair"` and scope including `workflowRunId`. Sequence:
  - service-level failure (NOT_FOUND / READ_FAILED) → single `ai_patch_validation_failed` (no `ai_interaction_started` — the call never reached classification).
  - `ok:true` → `ai_interaction_started` always; then one of:
    - `repairable` with a preview-validated patch → `ai_patch_proposed` + `ai_patch_previewed` (metadata: `opCount`, `reasonCode`).
    - `reasonCode === "FAILED_PREVIEW"` (the strategy proposed operations but AI-5 preview rejected; service downgrades to `noSafeRepair`) → `ai_patch_validation_failed` with `validationErrorCode: "FAILED_PREVIEW"`.
    - `needsUserInput` → `ai_safety_block_triggered` with reason `needs_user_input` + the `reasonCode`.
    - `noSafeRepair` → `ai_safety_block_triggered` with reason `no_safe_repair` + the `reasonCode`.
  - Fail-open: a recorder throw never propagates. The module is a TYPE-only consumer of `@/services/ai/repair` (no runtime import → no model adapter pulled in).
- **[`lib/api/ai.ts`](../../../lib/api/ai.ts)** — adds `requestWorkflowRepair(workflowId, runId, request?)` + the client-facing `AiRepairResult` / `AiRepairSuccess` / `AiRepairFailure` / `AiRepairRequiredUserInput` views. The repair patch is OPAQUE to the client — the Builder forwards it verbatim to `applyWorkflowPatch` on confirm, never inspects or renders its config.
- **[`features/workflow-builder/panels/RunResultsPanel.tsx`](../../../features/workflow-builder/panels/RunResultsPanel.tsx)** — adds an inline `RepairBlock` rendered only when `detail.status === "failed"`. UX is one button, then a state-machine view: `idle → loading → ready → applying → applied` (or `error`). The block renders the repairability label, value-free `reasonCode`, recommendations, requiredUserInput, the preview's change-summary disclosure, and safety notes. An `Apply repair` button appears only when `proposedPatch && preview.validation.ok`. Click → calls the existing `applyWorkflowPatch` route (AI-9B); confirmation is passed through when `preview.requiresConfirmation` is true. **No** auto-apply, **no** chat, **no** thread persistence.

**Why no separate repair-apply route.** The user explicitly scoped this slice to reuse the existing AI-9B apply path. Apply re-validates the patch at apply time (AI-3), enforces optimistic concurrency at read AND write time (AI-6 + AI-6B), and requires explicit confirmation for high-risk patches — all behaviors that should be identical regardless of where the patch originated. Adding a parallel repair-apply path would mean either duplicating those gates (drift risk) or wrapping them (no benefit). The Builder simply forwards the opaque patch.

**Forward-compat body.** The route schema accepts an empty body (most common — the deterministic service needs no input beyond `userId/workflowId/workflowRunId`) AND three optional fields: `repairPrompt` (string, ≤4_000 chars), `modelTier` (`"fast" | "strong"`), `selectedNodeId` (string, ≤256 chars). At AI-13 these are validated for SHAPE but **NOT forwarded** to the service — AI-7 is deterministic and has no use for them today. They exist so a future model-backed repair slice (e.g. the React Agent v2) can extend behavior without an API-shape break, and so the typed client exposes them now.

**No-leak / boundaries (audited).** Route source contains no runtime import of `@/services/ai/apply`, `@/repositories/**`, or any model client; no `updateDraftDefinition` call; no provider-specific branching (no substring `stripe` / `slack` / `gmail` / `github` / `notion` / `airtable` / `shopify` / `hubspot`). Response body is the already-sanitized `RepairSuggestionResult` from AI-7 (which itself never echoes config VALUES — only ids, field KEY names, and registry metadata). Event metadata is the existing COST-6 `sanitizeAiEventMetadata` boundary (no raw classification text, no config values, no secret-shaped values).

**Tests:** [`tests/unit/app/api/workflows/ai-repair-route.test.ts`](../../../tests/unit/app/api/workflows/ai-repair-route.test.ts) (auth, path validation, empty/JSON body handling, forward-compat field stripping, status mapping, no-leak, no-apply / no-model-direct, metadata-driven — no hardcoded providers); [`tests/unit/services/ai/events/recordAiRouteEvents.test.ts`](../../../tests/unit/services/ai/events/recordAiRouteEvents.test.ts) (extended with 9 repair-mapping cases incl. fail-open + no-runtime-imports + no-leak); [`tests/unit/lib/api/ai.test.ts`](../../../tests/unit/lib/api/ai.test.ts) (URL encoding both segments, forward-compat field forwarding, 404/401/500 transport throws); [`tests/unit/features/workflow-builder/panels/RunResultsPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/RunResultsPanel.test.tsx) (button only on failed runs, no auto-call, requiredUserInput rendering, no-safe-repair rendering, Apply visibility, no auto-apply, confirmation forwarding, transport-error rendering, value-free reasonCode).

**Metadata-driven, provider-track-independent.** When Stripe's `event_received` `TriggerMeta` lands later, the existing failed-run repair flow picks it up automatically through the AI-2 catalog tools that AI-7 already consumes — no AI-13 code change required. The route, the UI, and the recorder never hardcode any provider name.

### AI-14 implementation note

Shared AI result-rendering components. With two AI surfaces shipped (Builder plan/apply panel + failed-run Repair block) and more on the roadmap, this slice consolidates the small rendering pieces both consumers actually duplicate, so future AI surfaces don't keep re-implementing the same `<p>` + `<ul>` patterns.

**Scope — evidence-based extraction.** Two components in a new [`features/workflow-builder/ai/`](../../../features/workflow-builder/ai/) module:

- **[`AiBulletList`](../../../features/workflow-builder/ai/AiBulletList.tsx)** — titled bullet list with severity tinting (`muted` / `warning` / `destructive`). Used by Builder for *Assumptions*, *Not supported yet*, *Please review*; used by Repair for *Recommendations* and *Safety notes* (the latter with severity `warning`, replacing Repair's prior amber styling). Title is optional (Repair recommendations/safety are headless). Returns `null` on empty items — callers don't gate. The Builder's local `BulletList` helper is deleted.
- **[`AiRequiredInputList`](../../../features/workflow-builder/ai/AiRequiredInputList.tsx)** — title + bulleted items with optional `field` hint. Variant prop (`"card"` for Builder's needs-input callout, `"plain"` for Repair) controls the wrapper className only. `showFieldHint` defaults to `false` so the Builder's existing behavior is byte-preserved (Builder's items never populate `field` today; if a future planner change ever did, Builder still won't render the hint until explicitly opted in).

**Intentionally NOT extracted.** Each AI surface still owns these because forcing parity would change UX, not just reduce duplication:

- **Preview summary card.** Builder's `PreviewSection` renders the full validation/risk/cost block. Repair shows a minimal `<details>` disclosure with just the change list. The user-facing scope is different per surface; consolidation would either bloat Repair or strip Builder.
- **Apply state messages.** Builder's success copy is "Plan another change"; Repair's is "Repair applied. Re-run the workflow to verify." Surface-specific.
- **Risk acknowledgement vs in-button confirmation.** Builder uses an explicit checkbox gate; Repair encodes confirmation in the Apply button label (`Apply repair (confirm <riskLevel>)`). Different mental models, different UX.
- **Validation errors/warnings.** Only Builder currently surfaces these; Repair relies on `preview.validation.ok` as a binary gate. Extracting now would be speculative.

**Behavior preserved.** Both consumers' existing test ids resolve to the same elements (the shared components render the `testId` on the wrapping `<div>`, matching the prior structure). Existing tests at [`BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx) and [`RunResultsPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/RunResultsPanel.test.tsx) all pass unchanged. The only visual harmonization is Repair's recommendations / safety-notes / required-input bullets now using the same `list-disc pl-4` indent as Builder (was `ml-4`) — a consistency-only change with no semantic difference.

**No-leak preserved.** Item contents pass through verbatim — shared components never inspect, rewrite, or sanitize labels. Leak surface is identical to the pre-extraction state (the caller, which already only passes pre-sanitized strings from the route response). Explicit tests pin "shared components render input verbatim."

**Tests.** [`tests/unit/features/workflow-builder/ai/AiBulletList.test.tsx`](../../../tests/unit/features/workflow-builder/ai/AiBulletList.test.tsx) (8 tests — empty/titled/headless/severity-tinting/testid/no-leak) and [`tests/unit/features/workflow-builder/ai/AiRequiredInputList.test.tsx`](../../../tests/unit/features/workflow-builder/ai/AiRequiredInputList.test.tsx) (9 tests — empty/items/field-hint-off-by-default/field-hint-opt-in/no-field-hint-without-field/card-variant/plain-variant/no-leak). Plus the existing 22 Builder panel + 23 RunResultsPanel tests continue to pass.

### AI-15 implementation note

Pure documentation slice. With the Builder AI panel, the failed-run repair route + UI, the current-user analytics route, planner hardening (AI-12B/C/D), and the shared rendering components (AI-14) all shipped, the next-highest-value step before adding chat / thread persistence / templates / more model surfaces is **proving the existing AI flows hang together in realistic scenarios** — i.e. catch wiring drift before adding more feature surface area.

**Deliverable** — [`ai-e2e-smoke-test-plan.md`](./ai-e2e-smoke-test-plan.md):

- **Scenario coverage matrix** — every one of the 12 AI-15 scenarios (model unavailable, parse failure / NOT_JSON, needs-input, unsupported, low-risk apply, high-risk confirmation, stale patch, repair no-safe-repair, repair needs-input, repair repairable, analytics, no-leak) mapped to the specific test files + `describe` / `it` text that prove the behavior, layered by service / route / UI / observability.
- **Coverage gaps & decisions** — three concerns explicitly considered and not addressed (recorder↔analytics DB round-trip, cross-panel coexistence test, Stripe failed-payment as happy-path) with rationale. The audit found **no automation gaps requiring new tests** at AI-15.
- **Build-time gates** — single canonical command list for the AI-touching suites.
- **Manual dev-server smoke checklist** — 34 numbered steps split across 5 sub-flows (plan, apply, repair, analytics, no-leak), explicitly covering what unit-test mocks cannot: real env-var pickup, real fetch round-trips, real DB rows, real UI hydration. Designed to be run by hand on a `npm run dev` instance before promoting an AI change.
- **Revisit triggers** — explicit list of when the plan needs updating (new AI surface, new failure mode, Stripe `event_received` TriggerMeta lands, Playwright e2e built).

**Why no new tests:** the audit traced every scenario through its service test → route test → UI test → observability mapping → no-leak guard. Each boundary is tested with mocks; the contract between layers is type-checked (same `AiCostFeature` union, same `RepairSuggestionResult`, same `WorkflowPatch` schema). Adding more unit tests would re-cover ground each side already proves.

**Optional Playwright deferral.** A real AI walkthrough (sign-in → plan → preview → apply → analytics-reflects-the-events) requires injecting a mock model adapter at the server boundary, which the existing Anthropic adapter at [`services/ai/modelClients/anthropicClient.ts`](../../../services/ai/modelClients/anthropicClient.ts) doesn't currently support without env-driven dispatch or a `fetch`-route intercept à la `mockGoogleServer.ts`. Deferred to a dedicated AI-FUTURE-E2E slice if the manual smoke catches drift.

**Boundaries honored.** No new chat / thread persistence; no new AI backend features; no provider metadata changes; no billing / tasks changes; no source code changed (only the doc + this plan-status row). Pre-existing dirty files untouched. Provider-track files untouched.

### AI-16 implementation note

Planner value-shape + output-reference grounding. Closes the post-`4.STRIPE-TRIGGER-META-2` smoke gap that the user surfaced for `"when a stripe payment fails, send me a slack dm"`:

1. The model saw `enabledEvents (combobox)` in the catalog with no indication it was multi-select, so it produced `enabledEvents: "payment_intent.payment_failed"` (scalar) — the activation reader expects `string[]` and AI-3's `INVALID_CONFIG` check rejected the patch.
2. The model invented Stripe-API-shaped outputs (`id`, `amount`, `currency`, `last_payment_error`) for the Slack DM text. None are in the declared `payloadShape`. AI-3's `MISSING_OUTPUT_PATH` check rejected the references.

Both failures are correct validator behavior; the fix is at the grounding layer so the model doesn't make the mistake in the first place.

**Generic, metadata-driven changes** (no per-provider hacks):

- **[`CatalogConfigField`](../../../services/ai/tools/providerCatalog.ts)** now forwards `multiple: true` from `FieldMeta` and renders inline with the type as `(combobox, multi-select)` or `(select, multi-select)`. Single-pick fields stay lean — `multiple` is omitted from the entry when not set. Drives the model to pick an ARRAY value for multi-select fields.
- **New `CatalogOutputField` and `outputs: readonly CatalogOutputField[]`** on `CatalogActionEntry` and `CatalogTriggerEntry`. Derived from `ActionMeta.outputs` / `TriggerMeta.payloadShape`. Forwards `name` + `type` + (when set) `sensitive`. Nested `fields[]` are NOT flattened — keeps the compact catalog lean and steers the model to declared top-level names. The prompt renders `outputs: name1 (type), name2 (type, sensitive), …` under each node.
- **New `VALUE_SHAPE_RULES`** prompt section in [`buildWorkflowPlanPrompt.ts`](../../../services/ai/planner/buildWorkflowPlanPrompt.ts) documents per-renderer-type value shapes (text→string, number→number, boolean→true/false, select→one option value, select+multi-select→array, combobox→one or `{{ref}}`, combobox+multi-select→array, keyvalue→object, string-array→array, file→string ref, file-array→array, router-routes→array, cron→string). Rendered between `PATCH_SHAPE_GUIDE` and `JSON_OUTPUT_RULES`. Anchored with the Stripe `enabledEvents: ["payment_intent.payment_failed"]` worked example.
- **Two new `PLANNER_CONSTRAINTS`:** (a) "Match each config value's SHAPE to the field's renderer type and `multi-select` flag … a `multi-select` field requires an ARRAY of allowed option values; a single-select takes ONE value." (b) "Variable references … MUST use ONLY the output names declared in that node's `outputs:` block. Do NOT invent output keys (e.g. `id`, `amount`, `currency`, `last_payment_error`) from a provider's public API documentation, the displayName, or general knowledge."

**Nested-path decision.** The variable validator at [`variableChecks.ts`](../../../services/workflows/patch/variableChecks.ts) accepts nested paths into `sensitive` / opaque object outputs (`{{trigger.data.X}}` passes because `data` is sensitive). Rather than tightening the validator, the AI-16 constraint steers the model to prefer top-level declared outputs (`{{trigger.stripeEventType}}`) for message bodies and to use `{{AI_FIELD:fieldName}}` or `requiredUserInput` when no declared output fits — values inside opaque containers are not metadata-validated, so a runtime miss yields `undefined` (the existing AI-7 repair flow can rescue that). This is a grounding choice, not a validator change.

**Pinned via round-trip tests** (against the real registry — not mocked):

- `stripe:event_received` catalog entry: `enabledEvents` is `combobox + multi-select + required`; outputs include `stripeEventType`, `data (object, sensitive)`, `previousAttributes (object, sensitive)`; outputs do NOT include the invented `id` / `amount` / `currency` / `last_payment_error`.
- Patch with scalar `enabledEvents: "..."` → validator returns `INVALID_CONFIG` (path `enabledEvents`); `canApplyLater: false`.
- Patch with array `enabledEvents: ["payment_intent.payment_failed"]` + Slack DM referencing only `{{n-stripe-trigger.stripeEventType}}` → `canApplyLater: true`.
- Patch referencing `{{n-stripe-trigger.amount}}` / `{{n-stripe-trigger.currency}}` (invented) → validator returns `MISSING_OUTPUT_PATH` errors with both paths; `canApplyLater: false`.

**Behavior after fix for the user's two prompts.**

- Prompt 1, "when a stripe payment fails, send me a slack dm": planner sees `enabledEvents` as multi-select and `stripeEventType`/`data`/... as declared outputs; produces `enabledEvents: ["payment_intent.payment_failed"]` (array); the missing Slack `userId` surfaces as `requiredUserInput`; Slack `text` either uses `{{trigger.stripeEventType}}` or `{{AI_FIELD:text}}` — no invented outputs.
- Prompt 2, "...to user ID U123456 saying Stripe payment failed. Event type: {{stripeEventType}}": the planner can build a fully-validated patch (low-risk preview, apply-ready) using `enabledEvents` as the correct array shape, `userId: "U123456"`, and `text` referencing only `{{trigger.stripeEventType}}`.

**Boundaries.** Strict `WorkflowPatchSchema` unchanged. Parser unchanged. Variable validator unchanged. Risk classifier unchanged. UI unchanged. No provider metadata changed (Stripe's existing meta is already correct — the gap was in the AI grounding, not the meta). No billing/tasks/migrations. ~22 new tests across `providerCatalog.test.ts`, `buildWorkflowPlanPrompt.test.ts`, `planWorkflowFromPrompt.test.ts`. Full suite 13,496 / 17 skipped / 0 failed.

### AI-17 implementation note

Connected-integration awareness + "me" resolution. Closes the smoke gap that arose after `4.STRIPE-TRIGGER-META-2` + AI-16: with Slack the only connected provider, the AI happily proposed a Stripe→Slack workflow without flagging that Stripe needed to be connected, and asked for a Slack `userId` it could have resolved from the OAuth payload.

**Two root causes**, both at the grounding layer:

1. **Disconnected-provider awareness wasn't surfaced strongly.** The planner saw both the full catalog (every provider with metadata, regardless of connection state) and the connected-integrations list. It had to *infer* "disconnected" from absence and pick the right `requiredUserInput` kind on its own. The smoke showed the inference was unreliable.
2. **Slack OAuth already captures `authed_user.id`** ([`integrations/slack/oauth.ts:120`](../../../integrations/slack/oauth.ts)) but the AI grounding tool never surfaced it. Every "send me a Slack DM" prompt had to fall through to `requiredUserInput`, even when the data was already on the integration row.

**Generic, additive, metadata-driven changes** (no provider OAuth flow changes, no provider metadata changes):

- **[`ConnectedIntegrationView`](../../../services/ai/tools/integrations.ts)** gains an optional `currentUserId?: string`. Populated by a small per-provider extractor (Slack reads `accountMetadata.authedUserId`); other providers leave it absent until their own OAuth captures a comparable "me" identity. The Slack mapping is a one-line allow-list — non-Slack rows can never leak metadata via this field (test pins this with a poison fixture: a non-Slack row with `authedUserId` set returns no `currentUserId`).
- **Prompt renders the line as** `- slack (account: Acme Workspace, scope: workspace, me=U01ABC23DEF)` when the identity is known, and omits the `me=` segment otherwise. The connected-integrations HEADER now states "any provider NOT listed below is DISCONNECTED — every action/trigger from a disconnected provider requires connecting it first."
- **Two new `PLANNER_CONSTRAINTS`:**
  - "Connected-integration awareness: every action/trigger you propose for a provider that does NOT appear in the connected list MUST be accompanied by a `requiredUserInput` entry with `kind: \"select_integration\"` naming that provider (e.g. `{ label: \"Connect Stripe\", kind: \"select_integration\" }`). Do NOT claim the workflow is ready, do NOT say a provider is connected when it isn't, and do NOT silently substitute a different connected provider's trigger/action for the user's requested one. You MAY still propose the patch as a draft so the user can review the shape; the missing-connection requirement is what the UI surfaces as the blocker. Conversely: when a provider IS in the connected list, do not add a `select_integration` entry for it."
  - "'Me' resolution: when the user refers to themselves ('me' / 'myself' / 'I' / 'send me') as a per-user recipient — typically the `userId` on a DM action — resolve it from the connected integration's `me=<id>` value when present. Example: for `slack:send_direct_message.userId`, if the connected slack entry shows `me=U01ABC23DEF`, set `userId: \"U01ABC23DEF\"`. If the connected provider has NO `me=` value, add a `requiredUserInput` entry (e.g. `{ label: \"Which Slack user should receive the DM?\", kind: \"config_value\", field: \"userId\" }`). NEVER guess a user id, NEVER use a bot user id as the human recipient, NEVER use a channel id where a user id is required."

**Currently stored data audit.** Slack OAuth `oauth.v2.access` response → `accountMetadata.authedUserId` (already shipped pre-AI-17). Verified at [`integrations/slack/oauth.ts:120`](../../../integrations/slack/oauth.ts). No other provider currently captures the in-provider installing-user identity — Gmail / Outlook stores the account email as `providerAccountId`, which is a different shape. Future provider work can extend `extractCurrentUserId` to map any OAuth-captured identity onto the same `currentUserId` field without changing the prompt.

**"Me" resolution today:** works for Slack out of the box (no OAuth or DB migration needed — the data was already there from Slice 1). For any other provider, the planner falls through to `requiredUserInput`, which is the right behavior until that provider's OAuth captures an analogous id.

**Behavior after fix for the user's smoke prompt** ("when a stripe payment fails, send me a slack dm", with only Slack connected):
1. Catalog still lists `stripe:event_received` (provider has metadata) and `slack:send_direct_message`.
2. Connected-integrations block lists only `slack (...me=U01ABC23DEF)`.
3. Header rule + new constraint tell the model: Stripe is disconnected → emit `requiredUserInput` with `kind: "select_integration"` for Stripe.
4. Me-resolution constraint tells the model: Slack `userId` resolves to `U01ABC23DEF` from `me=`.
5. Patch can still be a fully-validated draft (Stripe metadata is registered) — the missing connection is the blocker the UI surfaces, not a validator failure.

**No-leak (audited).** Tokens never reach the prompt (existing AI-2 boundary preserved). The Slack mapping is the only metadata field that crosses into AI grounding, and only the U-prefixed identity (a public, non-secret id — the same id a user would type into a DM picker). Bot id is explicitly NEVER mapped to `currentUserId`. Tests pin: a poison fixture with `botUserId: "B999POISONBOT"`, `accessTokenEncrypted: "ENC-POISON-ACCESS-TOKEN"`, `providerAccountId: "T-POISON-TEAM-ID"` produces a prompt with zero hits on any of those substrings — only `U01ABC23DEF` flows through.

**Boundaries honored.** Slack manifest unchanged. Slack action metadata unchanged. Slack OAuth flow unchanged (it was already capturing what we need). Strict `WorkflowPatchSchema` unchanged. Parser unchanged. Variable validator unchanged. Risk classifier unchanged. UI unchanged (existing `select_integration` and `config_value` kinds in `AiRequiredUserInput` already render correctly). No billing/tasks. No migrations.

**Tests.** Integration-tool tests: 5 new for `currentUserId` extraction (Slack happy path, missing `authedUserId`, empty string, non-Slack provider, secret-key absence). Prompt-builder tests: 9 new (me= rendered, omitted, disconnected-header rule, both constraints with worked examples, no-guessing/no-bot/no-channel rules). Round-trip tests against the real registry: 6 new (system prompt rendering of me=, omission, constraints text, no-leak through poison fixture, Stripe→Slack apply-ready when both connected + me= known, needs-input clean 200 when me= unknown). Full suite 13,515 / 17 skipped / 0 failed.

### AI-19 implementation note

**Anthropic forced tool-use structured planner output.** Live smoke against Claude Sonnet 4.6 (post BUILDER-DESIGN-PARITY-1) returned a hard PARSE_FAILED / NOT_JSON: HTTP 200 from the Anthropic API, ~7.4s latency, 36,590 input + 399 output tokens, `finishReason: "stop"`, content was text — not valid JSON — so the strict parser rejected it. The Builder UI rendered the AI-12C "wrong format" copy and refused to apply (correct), and `noMutation: true` held (correct). **This is the failure prompt-only JSON enforcement (AI-12C) and assistant prefill (AI-12C revert) were specifically intended to solve.** Prefill stays reverted (Claude 4.x rejects it with HTTP 400 — see AI-12C history). Forced tool-use is the documented Anthropic-supported alternative.

**Root cause.** The planner prompt's `JSON_OUTPUT_RULES` block tells the model "return exactly one JSON object, first `{` last `}`, no prose." Live 36K-token context against Sonnet 4.6 violated this rule despite the prompt's strengthened constraint #3. Prompt-only is structurally unreliable at scale.

**Fix (transport, not validation).** The fix is at the model-adapter layer:

- **`core/ai/modelTypes.ts`** — new `ModelResponseTool` interface (`name` + `description` + `inputSchema`) and a new optional `responseTool` field on `ModelGenerateInput`. Provider-agnostic seam; non-Anthropic adapters / NOT_CONFIGURED / mock client IGNORE it (backwards-compatible).
- **`services/ai/modelClients/anthropicClient.ts`** — when `responseTool` is set, the request body now includes `tools: [{ name, description, input_schema }]` + `tool_choice: { type: "tool", name }`. On 2xx, the adapter scans `content[]` for the first block where `type === "tool_use"` and `name === responseTool.name`, then returns `JSON.stringify(tool_use.input)` as `ModelSuccess.text`. **No fallback to text parsing when tool-use is forced** — that's the bug we're fixing. The plain-text path is preserved for callers that don't set `responseTool` (currently none in V2, but the boundary stays generic).
- **`services/ai/planner/workflowPlanTool.ts`** (new) — defines `WORKFLOW_PLAN_TOOL` with `name: "propose_workflow_plan"` and a permissive JSON Schema mirroring the parser's accepted shape (intentSummary / assumptions / requiredUserInput / unsupportedRequests / safetyNotes / proposedPatch / confidence). **`proposedPatch` is kept as `object | null` here** — the recursive `WorkflowPatchSchema` is the strict downstream gate; duplicating it in JSON Schema adds rejection surface area for patch-schema changes without buying real safety.
- **`services/ai/planner/planWorkflowFromPrompt.ts`** — passes `responseTool: WORKFLOW_PLAN_TOOL` on every plan call. `parseWorkflowPlanResponse` runs unchanged on the stringified tool input — `WorkflowPatchSchema` still gates `proposedPatch`, the secret-scan still runs, every existing failure code (`INVALID_SHAPE` / `INVALID_PATCH` / `SECRET_IN_RESPONSE`) still emits the same way.

**Failure mapping (adapter layer):**

| Anthropic response | Adapter outcome |
|---|---|
| `tool_use` block matching `responseTool.name` with `input` payload | `ModelSuccess { text: JSON.stringify(input) }` |
| No `tool_use` block (text-only response — the live regression mode) | `ModelFailure { failureCode: "INVALID_RESPONSE", retryable: true }` with message naming the forced tool |
| `tool_use` block with wrong `name` | `ModelFailure { failureCode: "INVALID_RESPONSE" }` |
| `tool_use` block with `input` undefined / null | `ModelFailure { failureCode: "INVALID_RESPONSE" }` with "no input payload" message |
| `tool_use.input` not serializable (circular ref / etc.) | `ModelFailure { failureCode: "INVALID_RESPONSE", retryable: false }` |
| HTTP 429 / 5xx / network / abort | Existing mappings preserved (`RATE_LIMITED` / `PROVIDER_ERROR` / `NETWORK_ERROR` / `TIMEOUT`) |

The planner sees adapter `INVALID_RESPONSE` as `MODEL_FAILED` (existing mapping). The route (AI-9A) maps `MODEL_FAILED → 503`. UI renders the friendly "isn't available" copy. Same end-to-end UX as a rate-limit — distinct from `PARSE_FAILED → 502` which it replaces.

**Boundaries honored.** Builder UI unchanged. Provider metadata unchanged. Workflow execution unchanged. Billing / tasks unchanged. Chat / thread persistence NOT introduced. Strict `WorkflowPatchSchema` unchanged. `parseWorkflowPlanResponse` unchanged (secret scan + shape + patch validation all unchanged). Assistant prefill remains reverted (AI-12C history comment expanded in the adapter). No new SDK dependency — still raw `fetch`. API key still scoped to the closure + `x-api-key` header; never returned, logged, or echoed in any result (new tool-use paths re-assert the no-leak invariant).

**No-leak (audited under structured mode).** New test `never leaks the API key under structured mode (success or failure)` asserts neither a successful `tool_use` response nor a `text`-only response (forced INVALID_RESPONSE) contains `API_KEY` or `sk-ant-` anywhere in the serialized result. Tool name / description / schema are part of the request body, NEVER part of the response surface back to the UI.

**Tests.** Adapter (`tests/unit/services/ai/modelClients/anthropicClient.test.ts`): +10 — body shape with `tools` + `tool_choice`, body shape without (backward compat), `tool_use` → `ModelSuccess`, text-only response under structured mode → `INVALID_RESPONSE` (the regression guard), mismatched tool name, missing input payload, missing content array, HTTP 429 preserved under structured mode, AbortError → TIMEOUT preserved, no-leak under structured mode. Planner (`tests/unit/services/ai/planner/planWorkflowFromPrompt.test.ts`): +4 — planner injects `WORKFLOW_PLAN_TOOL` on every call, parser still rejects malformed patches (`INVALID_PATCH` still fires), adapter `INVALID_RESPONSE` propagates as planner `MODEL_FAILED` with `noMutation: true` and no preview attempted, end-to-end against a mocked Anthropic returning `tool_use` reaches preview with `canApplyLater: true`. Plus the existing AI-8C "runtime client + mocked fetch" test updated to use `tool_use` shape — the planner's structured-mode contract is now the live path.

**Live verification.** Not run from this environment (no live Anthropic key + no running dev server attached to this assistant). The fix is exercised by 14 new tests + the existing 141 adapter + planner tests, including a regression-guard test that asserts text-only responses under structured mode return `INVALID_RESPONSE` (the exact failure mode the live smoke surfaced). User-side live smoke against the same prompt that triggered AI-18's PARSE_FAILED is the remaining confirmation step.

### AI-20 implementation note

**React Agent apply-readiness gate for unresolved required input.** AI-19's live smoke confirmed structured tool-use works (the model returned a structured plan, no PARSE_FAILED). The same smoke surfaced the next bug: the model returned a *valid plan with a structurally-valid patch AND non-empty `requiredUserInput`* — and the UI rendered an enabled Apply button next to "More information is needed before this can be built." Live trace:

- Prompt: `"Create a workflow that sends a Slack message when I manually run it."`
- AI returned a `proposedPatch` (Manual Trigger → Slack Send Channel Message, structurally valid with `AI_FIELD` placeholders for `channelId` + `text`).
- AI also returned `requiredUserInput: ["Which Slack channel should the message be sent to?", "What should the message say?"]`.
- Preview accepted the patch (it's schema-valid — `AI_FIELD` placeholders pass the AI-3 validator) → `canApplyLater: true`.
- UI: rendered the needs-input list, the medium-risk badge, **and** an enabled Apply button. Contradictory.

**Root cause.** The planner returned `canApplyLater: preview.canApplyLater` without considering whether the AI flagged outstanding user input. The deterministic preview's job is to validate the PATCH SHAPE — it doesn't know what the AI thought it didn't know. Two facts had to be unified at the planner boundary.

**Final apply-readiness rule** (locked in across service + UI):

> A plan is apply-ready when ALL of:
> 1. `result.ok === true`
> 2. `result.proposedPatch` is present
> 3. `result.preview.canApplyLater === true` (deterministic patch validator approved)
> 4. **`result.requiredUserInput.length === 0`** ← NEW

**Service fix.** [`services/ai/planner/planWorkflowFromPrompt.ts`](../../../services/ai/planner/planWorkflowFromPrompt.ts) — after running the preview, the planner now derives:

```ts
const requiredInputBlocking = response.requiredUserInput.length > 0;
const canApplyLater = preview.canApplyLater && !requiredInputBlocking;
const blockedReason = canApplyLater
  ? undefined
  : requiredInputBlocking
    ? "More information is still needed — answer the questions above and run Plan with AI again."
    : (preview.blockedReason ?? "Preview rejected the proposed plan.");
```

`canApplyLater` becomes the unified gate. The preview still runs (cost / risk level / validation errors / required-input shape all still flow through), so the UI keeps its rich preview block — only the apply gate is tightened. The `blockedReason` distinguishes "missing required input" from "preview rejected" so the UI can render the right callout.

**UI fix.** [`features/workflow-builder/panels/BuilderAiPanel.tsx`](../../../features/workflow-builder/panels/BuilderAiPanel.tsx):

- `showApplyControls` extended with `!hasUnresolvedRequiredInput`. Even if a future service-layer regression re-leaks `canApplyLater: true` while `requiredUserInput` is non-empty, the UI refuses to surface Apply. Defense in depth — the live smoke proved this was the failure mode worth doubly defending against.
- New `builder-ai-required-input-block` callout renders whenever `proposedPatch` exists AND `requiredUserInput.length > 0` AND apply hasn't succeeded: *"The agent drafted a plan, but {one detail is / some details are} still missing. Provide the missing details above, then run **Plan with AI** again — the agent won't apply an incomplete patch."* (Pluralization-aware.) Uses `--builder-warn` color so it reads alongside the BUILDER-DESIGN-PARITY-1 chrome.
- Existing `builder-ai-not-applyable` copy ("This plan can't be applied as-is — please adjust your request and try again.") still renders for preview-rejected patches **when `requiredUserInput` is empty**. The two callouts are now mutually exclusive — required-input blocking takes precedence.
- Risk acknowledgment checkbox is hidden alongside Apply when the plan is blocked on required input (it would be incongruous to ask the user to acknowledge risk for a plan that can't be applied yet).

**Boundaries honored.** No changes under `lib/billing/`, `services/billing/`, `workflow-engine/`, `integrations/`, `app/api/workflows/[id]/ai/`, `app/api/ai/`, `features/workflow-builder/canvas/*`, or any provider metadata. The AI-9B apply route is unchanged (its server-side validation already rejects malformed patches; AI-20 just prevents the client from sending a useless apply request). `WorkflowPatchSchema` unchanged. `parseWorkflowPlanResponse` unchanged. Multi-turn inline required-input answers are explicitly deferred (would be AI-21+).

**Tests.** Planner ([`planWorkflowFromPrompt.test.ts`](../../../tests/unit/services/ai/planner/planWorkflowFromPrompt.test.ts)): +3 — live regression case (patch + non-empty requiredUserInput → `canApplyLater: false` + AI-20 blockedReason), happy-path preserved (empty requiredUserInput + valid patch → `canApplyLater: true`), existing preview-rejected blockedReason preserved (invented provider patch → not the AI-20 copy). UI ([`BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx)): +5 — required-input callout renders + Apply hidden, `apply()` never called when blocked, defense-in-depth (UI gate holds even if service incorrectly reports `canApplyLater: true`), happy path preserved (Apply still renders when truly apply-ready), preview-rejected copy preserved (the existing "can't be applied as-is" message + no AI-20 callout). 1677 tests pass across the full AI + builder sweep (was 1669 → +8 new AI-20 tests).

### AI-21 implementation note

**React Agent session-local conversational follow-up.** AI-20 closed the dangerous apply-readiness leak by hiding Apply when the planner returned non-empty `requiredUserInput`. But the only path forward was for the user to manually rewrite the *full* prompt (original intent + the missing details) and run Plan again. Live observation: users either rewrote everything from scratch (slow, error-prone), or typed *just* the missing details (which the planner then read as a brand-new prompt missing all the original context). AI-21 lets the user reply inline within the React Agent rail — turn 1 establishes intent, turns 2+ fill in the missing details — without any DB persistence, chat/thread storage, or general app help assistant.

**Scope guardrails honored.** Workflow-builder React Agent only — NOT the future general app help assistant (an explicitly separate architecture). NO DB persistence (no `agent_threads` / `agent_messages` tables, no prompt or model-output storage). The AI-9A plan route's request body is unchanged (`prompt: string` + optional `modelTier`) — the reconstructed prompt is plain user-text. No service changes. No provider metadata, workflow execution, billing, or chat persistence touched.

**New helper — [`features/workflow-builder/ai/composeFollowUpPrompt.ts`](../../../features/workflow-builder/ai/composeFollowUpPrompt.ts)** (pure). Given `{ originalPrompt, requiredInputLabels, priorFollowUpAnswers, followUp }` returns a single planner-ready prompt string:

```
Original request:
{originalPrompt}

The agent asked for:
- {label 1}
- {label 2}

Previous follow-up answers:        ← only when priorFollowUpAnswers.length > 0
- {answer 1}
- {answer 2}

User follow-up:
{followUp}

Create the workflow using the original request and the follow-up details.
```

Trims surrounding whitespace on user-supplied text. Omits the `The agent asked for:` and `Previous follow-up answers:` sections when their inputs are empty. The helper never sees a patch, config, or secret — only user-supplied text + planner `requiredUserInput.label` strings (already value-free per the AI-9A/AI-3/AI-5 contract).

**Hook — [`features/workflow-builder/hooks/useBuilderAi.ts`](../../../features/workflow-builder/hooks/useBuilderAi.ts).** Two new pieces of session-local state: `originalPrompt: string | null` (the first prompt of the chain) and `priorFollowUpAnswers: readonly string[]` (cumulative answers from earlier follow-up turns in this same chain). A new method `submitFollowUp(answer, modelTier?)` reconstructs via `composeFollowUpPrompt` and routes through the existing `planWorkflow` client (same `POST /api/workflows/[id]/ai/plan` route). Public surface adds `followUpMode: boolean` (derived `originalPrompt !== null`) and `submitFollowUp`.

Chain lifecycle:
- A fresh `plan(prompt)` clears `originalPrompt` + `priorFollowUpAnswers` at entry (no cross-prompt leakage), then on a successful response with `requiredUserInput.length > 0 && ok === true` sets `originalPrompt = prompt`.
- `submitFollowUp(answer)` requires `originalPrompt !== null` + a successful prior `planResult` with outstanding questions + non-empty trimmed answer — otherwise it's a no-op (the panel should be calling `plan()` instead). On success with `requiredUserInput.length > 0`, the chain extends: the new answer is pushed into `priorFollowUpAnswers`. On success with `requiredUserInput.length === 0`, the chain completes: both fields are cleared.
- Transport failure during `submitFollowUp` leaves the chain intact so the user can retry without re-typing the original prompt — `error` is set, status returns to `idle`, `planResult` from the prior turn is preserved.
- `reset()` clears the chain.

**Panel — [`features/workflow-builder/panels/BuilderAiPanel.tsx`](../../../features/workflow-builder/panels/BuilderAiPanel.tsx).** The composer auto-detects follow-up mode via `ai.followUpMode`:

- Submit button copy: `Plan with AI` → `Send details` while the chain is active.
- Kbd hint: `plan` → `send`.
- Textarea `aria-label` + placeholder: switch to follow-up wording (`"Reply with the missing details — e.g. 'Use #general and say Test from ChainReact AI.'"`).
- `builder-ai-required-input-block` callout copy reworded to route the user through the new affordance: *"The agent drafted a plan, but {one detail is / some details are} still missing. Reply with the missing details below and hit **Send details** — the agent will re-plan and won't apply an incomplete patch."* (Replaces the AI-20 copy that asked the user to re-run Plan with AI.)
- Submit handler `handleSubmit` chooses between `ai.plan(trimmed)` (chain not active) and `ai.submitFollowUp(trimmed)` (chain active). Local `prompt` is retained after submit (consistent with the existing AI-11B normal-plan UX); user can revise via Clear.
- Clear / Plan-another-change reset the chain via `ai.reset()`.

**Safety path preserved.** Follow-ups go through the exact same `POST /api/workflows/[id]/ai/plan` route — model structured tool-use (AI-19) → `parseWorkflowPlanResponse` → `WorkflowPatchSchema` validation → `previewWorkflowPatchForAI` → AI-20 apply-readiness gate. No special apply path, no preview bypass, no auto-apply, no relaxed parser. The AI-20 gate continues to enforce empty `requiredUserInput` before Apply is rendered; if a follow-up answer doesn't fully resolve the questions, the chain simply extends.

**No-leak.** The reconstructed prompt contains *only* the user's typed text + planner-sanitized `requiredUserInput.label` strings. It never reads `proposedPatch`, config values, secrets, or model-internal text. Dedicated panel + hook tests assert that even when the planner response carries a `accessToken: "ya29.LEAKED-SECRET"` config field, the reconstructed prompt contains none of it.

**Boundaries honored.** No changes under `lib/billing/`, `services/billing/`, `workflow-engine/`, `integrations/`, `app/api/workflows/[id]/ai/`, `app/api/ai/`, `features/workflow-builder/canvas/*`, any provider metadata, or workflow execution. `WorkflowPatchSchema` unchanged. `parseWorkflowPlanResponse` unchanged. AI-9A plan-route request body schema unchanged. AI-9B apply route unchanged. No new DB tables, no migration. No general app help assistant introduced.

**Future work (explicitly deferred to AI-22+).** Persistent workflow-builder agent threads (DB-backed history across sessions). Richer inline required-input forms (per-question structured input widgets — e.g. a Slack channel picker — instead of a single free-text composer). General app help assistant as a separate architecture from the workflow-builder agent (different surface, different mounting, different scope).

**Tests.** Helper ([`composeFollowUpPrompt.test.ts`](../../../tests/unit/features/workflow-builder/ai/composeFollowUpPrompt.test.ts)): 8 cases — first-turn smoke (sections rendered), section omission (empty labels, empty prior answers), multi-turn (prior answers cited + order preserved + no de-dup), trimming, no-invented-sections. Hook ([`useBuilderAi.test.tsx`](../../../tests/unit/features/workflow-builder/hooks/useBuilderAi.test.tsx)): 9 cases — initial state, `followUpMode` flips on needs-input response, reconstructed prompt body, chain-completes on apply-ready response, multi-turn (chain extends + next turn cites prior answer), no-op when no chain in progress, no-op on empty answer, fresh `plan` clears prior chain (no leak), `reset` clears chain, transport-error preserves chain, no-leak (no patch / config / secrets in reconstructed prompt). Panel ([`BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx)): +7 AI-21 cases — composer copy + kbd hint flips in follow-up mode, submit sends reconstructed prompt to `planWorkflow`, Apply hidden during chain + appears after completion, multi-turn UI flow, Clear resets chain (next submit is fresh plan), Plan-another-change after apply resets chain, no-leak (no patch / config / secrets in reconstructed prompt via UI), transport-error keeps chain active. Plus 1 AI-20 callout-copy assertion updated to match the new "Reply with the missing details … Send details" copy. All 54 AI-21-area tests pass; broader workflow-builder unit sweep (`tests/unit/features/workflow-builder/{ai,hooks,panels}`) reports 24 suites / 291 tests pass.

### AI-21B implementation note

**React Agent chat layout + pinned composer.** AI-21 nailed the follow-up logic but left the panel form-shaped (single prompt + result). Marcus's live observation: the rail didn't feel like a chat. AI-21B refactors the panel into the chat shape the rail had always promised — transcript above, composer pinned below, newest at the bottom — while preserving every AI-11B / AI-20 / AI-21 invariant.

**Layout.** [`features/workflow-builder/panels/BuilderAiPanel.tsx`](../../../features/workflow-builder/panels/BuilderAiPanel.tsx) restructured as:

```
<section flex flex-col h-full min-h-0>
  <div data-testid="builder-ai-message-list"
       role="log" aria-live="polite"
       className="flex-1 overflow-y-auto min-h-0">
    {intro hint, only when no messages}
    {messages.map(...)}     ← user bubbles + assistant bubbles
    {planning indicator}    ← inside an assistant bubble
    {top-level ai.error}    ← AI-11B inline error (401/404 nuance)
    <bottomAnchorRef />
  </div>
  <footer data-testid="builder-ai-composer" shrink-0>
    {Clear conversation, when hasMessages && !busy}
    <Textarea> + kbd hint + submit button
    {char counter}
  </footer>
</section>
```

The rail wrapper ([`BuilderLeftAgentRail.tsx`](../../../features/workflow-builder/layout/BuilderLeftAgentRail.tsx)) previously owned the scroll (`overflow-y-auto`). That collapsed the chat layout because everything scrolled together. AI-21B hands scroll ownership down to the panel — the rail wrapper is now `flex min-h-0 flex-1 flex-col overflow-hidden` and the panel runs its own `flex-1 overflow-y-auto` message list + `shrink-0` pinned-bottom composer. Auto-scroll to a `bottomAnchorRef` fires on `messages.length` or `ai.status` changes (JSDOM-safe — `scrollIntoView?.` optional-chained).

**Session-local chat message model.** A small discriminated union ([`_BuilderAiPanelChat.tsx`](../../../features/workflow-builder/panels/_BuilderAiPanelChat.tsx)):

- `UserChatMessage` — `kind: "prompt" | "followup"`, right-aligned bubble.
- `AssistantPlanChatMessage` — wraps `AiPlanResult`, renders via `PlanResultBody`. LATEST plan_result message renders the full breakdown (assumptions / needs-input / preview / risk-ack / Apply controls — same testIds as AI-11B / AI-20); older plan_results collapse to their `intentSummary` (`builder-ai-plan-result-previous`). This collapse is what keeps the AI-11B / AI-20 testIds unique across a multi-turn transcript.
- `AssistantAppliedChatMessage` — wraps the apply summary text + "Plan another change" reset button.
- `AssistantApplyFailureChatMessage` — wraps `STALE_PATCH` / `CONFIRMATION_REQUIRED` copy; STALE_PATCH carries the re-run button.
- `AssistantErrorChatMessage` — wraps a friendly transport-failure copy.

Message ids are an in-process counter (no UUID dep). Nothing is persisted to disk / IndexedDB / a DB table — the session ends, the conversation ends.

**Hook return-value extension.** [`useBuilderAi.ts`](../../../features/workflow-builder/hooks/useBuilderAi.ts) `plan` / `submitFollowUp` / `apply` now return their result (`AiPlanResult | AiApplyResult`, or `null` on transport failure / guard refusal). Panel uses the return value to append the assistant message in lockstep with the user message (avoiding the React-state-reads-stale-after-await trap). The change is additive — every prior caller that discarded the return value is unchanged.

**Composer behavior.**
- Submit auto-clears the textarea (chat-style; replaces the AI-11B "keep prompt after planning" contract).
- Button copy: `Plan with AI` (fresh) / `Send details` (follow-up — AI-21 contract preserved); kbd hint flips `plan` / `send`.
- `Clear conversation` button: resets messages + composer + risk-ack + hook chain state — single affordance, single conversation.
- `Plan another change` (post-apply): same handler as Clear → starts a new conversation.
- STALE_PATCH `Re-run plan` button: pulls the most recent user `prompt` message from the chat history (no longer depends on the composer textarea, which is empty post-submit) and re-plans from that. No auto-reapply.

**Apply readiness preserved (AI-20).** The Apply button renders inside the LATEST plan_result message's body — `canApplyLater && proposedPatch && requiredUserInput.length === 0`. Once apply succeeds, an "applied" assistant message is appended; the message that was the latest plan_result becomes the second-to-last assistant message and its Apply button disappears (it's no longer "latest"). High-risk patches still require an explicit `builder-ai-risk-ack-checkbox` before Apply enables. Stale-patch / confirmation-required failures still render structured error copy and never auto-retry.

**No-leak (preserved).** User-message bubbles render only the text the user typed. Assistant plan_result bubbles render the same AI-11B / AI-20 sanitized view (`intentSummary` / `assumptions` / `requiredUserInput.label` / `unsupportedRequests` / `safetyNotes` / `preview` projections — registry display labels + non-secret field KEY names only). Applied-message bubbles render the route's `summaryText` (already sanitized server-side). No raw `proposedPatch` config / model output / secrets reach the chat at any layer. Dedicated tests assert that a patch with `accessToken: ya29.LEAKED-SECRET` never appears in `document.body.textContent` across any chat-rendered surface.

**Boundaries honored.** No changes under `lib/billing/`, `services/billing/`, `workflow-engine/`, `integrations/`, `app/api/workflows/[id]/ai/`, `app/api/ai/`, `features/workflow-builder/canvas/*`, any provider metadata, or `services/ai/**`. `WorkflowPatchSchema`, `parseWorkflowPlanResponse`, the AI-9A plan route's request shape, the AI-9B apply route, and the AI-19 forced tool-use adapter are all unchanged. No new DB tables, no migration, no DB chat / thread persistence introduced. The general app help assistant is explicitly NOT built (separate future architecture).

**Future work (still deferred to AI-22+).** Persistent workflow-builder agent threads (DB-backed history across sessions). Richer inline required-input forms (per-question structured input widgets — e.g. a Slack channel picker — instead of a single free-text composer). General app help assistant. Auto-scroll behavior tuning when the user has scrolled away from the bottom (don't yank them back).

**Tests.** Panel ([`BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx)): +13 AI-21B cases — message-list-above-composer DOM order, intro renders only before any messages, user-message bubble appended on submit, assistant plan_result follows in correct order, composer auto-clears after submit, required-input result renders as the assistant message body, follow-up answer renders as a `data-kind=followup` user message, older plan_result messages collapse to summary while the latest owns the apply UI, composer stays pinned after the response, apply-success renders as a chat-style assistant bubble (without leaking config), STALE_PATCH renders as an apply_failure bubble and Re-run pulls the prior user prompt (independent of composer text), transport-error appends an assistant error bubble while preserving the follow-up chain, 401 nuance still surfaces via the top-level `builder-ai-error`. Hook ([`useBuilderAi.test.tsx`](../../../tests/unit/features/workflow-builder/hooks/useBuilderAi.test.tsx)): +4 cases pinning the new return-value contract (`plan` returns `AiPlanResult` on success / `null` on transport failure; `submitFollowUp` same; `submitFollowUp` returns `null` when called with no chain in progress). Plus 3 AI-11B / AI-21 assertions updated to match the chat-style semantics (Clear is a full conversation reset; new-plan requires re-typing; the AI-21 follow-up Clear assertion verifies the composer is empty). 1306 tests pass across the full AI services + AI routes + lib api + workflow-builder sweep (85 suites). Targeted AI-21-area tests pass at 71 across panel + hook + helper.

### AI-21C implementation note

**React Agent chat component split + live follow-up smoke.** Pure refactor + verification slice — no new behavior, no new test cases (the AI-21B suite is the regression net), no service / route / model-adapter / provider / billing / execution touches. AI-21B left `BuilderAiPanel.tsx` at 406 effective lines (just over the project's 400-line warning threshold). AI-21C extracts the two largest blocks of JSX into siblings so the panel is a thin orchestration shell.

**Component split.**

- New file [`_BuilderAiPanelMessageList.tsx`](../../../features/workflow-builder/panels/_BuilderAiPanelMessageList.tsx) (241 lines) — owns the `role="log"` / `aria-live="polite"` scroll container, the intro hint, per-message rendering (delegating to the AI-21B `_BuilderAiPanelChat` subcomponents), the planning indicator bubble, the top-level `aiError` inline copy (401/404 nuance), the bottom anchor, and the auto-scroll `useEffect`. Derives `latestPlanMessageId` internally so only the latest plan_result message renders the full breakdown + Apply controls. Pure presentational; no hook / API-client imports.
- New file [`_BuilderAiPanelComposer.tsx`](../../../features/workflow-builder/panels/_BuilderAiPanelComposer.tsx) (161 lines) — owns the pinned-bottom footer (textarea + kbd hint + Submit button + Clear-conversation button + char counter). Owns `MAX_PROMPT_LENGTH` + `COUNTER_THRESHOLD` constants and self-derives `tooLong` / `canSubmit` from the `prompt` value-prop. Re-exports `BUILDER_AI_MAX_PROMPT_LENGTH` for any future shared use. Pure presentational.
- [`BuilderAiPanel.tsx`](../../../features/workflow-builder/panels/BuilderAiPanel.tsx) (216 lines, down from 488) — now a thin shell: state (`prompt`, `riskAcknowledged`, `messages`) + the hook + the four handlers (`handleSubmit` / `handleApply` / `handleRerunPlan` / `handleClear`) + a 25-line return that mounts `<BuilderAiPanelMessageList>` over `<BuilderAiPanelComposer>` inside the `flex h-full min-h-0 flex-col` panel section.

**Behavior preserved.** All testIds verbatim. All handler logic byte-equivalent to AI-21B (the auto-scroll effect just moved into the MessageList component; the constants moved into the Composer component; the per-message map moved into the MessageList component; nothing else changed). All 71 AI-21-area targeted tests pass unchanged. Full workflow-builder unit sweep (64 suites / 905 tests) passes with zero regressions.

**Lint.** The `max-lines` warning on `BuilderAiPanel.tsx` is resolved. Total lint warnings drop from 6 → 5 (all 5 remaining are pre-existing). 0 errors.

**Live follow-up smoke status.** PENDING — this environment has no `ANTHROPIC_API_KEY` and no running dev server attached to the assistant, so the planner round-trip cannot be exercised end-to-end from here. Marcus runs the manual smoke per the steps in [`ai-e2e-smoke-test-plan.md`](./ai-e2e-smoke-test-plan.md) §5.1 (steps 6 → 7e — ambiguous prompt → follow-up → multi-turn → Clear → chat-layout sanity). The expected behavior is documented exhaustively in the smoke plan; the AI-21B regression suite + this refactor's zero-regression verification (1306 tests across the AI + workflow-builder sweep) is the automated coverage backstop.

**Boundaries honored.** No changes under `lib/billing/`, `services/billing/`, `workflow-engine/`, `integrations/`, `services/ai/**`, `app/api/workflows/[id]/ai/`, `app/api/ai/`, `core/ai/`, or any provider metadata. `WorkflowPatchSchema`, `parseWorkflowPlanResponse`, the AI-9A plan request body, the AI-9B apply route, the Anthropic adapter, the planner service, and `useBuilderAi`'s public contract are all unchanged. No new DB tables, no migration, no DB chat / thread persistence introduced. The general app help assistant is explicitly NOT built.

**Tests.** No new tests needed for the refactor itself — the existing AI-21B suite (49 panel cases + 13 hook cases + 8 helper cases = 70 + 1 newer panel case = 71 total) provides the full regression net. Verified by running the panel + hook + helper tests after each extraction step and confirming zero changes.

### AI-22 implementation note

**Required-field discipline + interactive required-input controls.** AI-21C's live smoke proved the chat-style React Agent felt right end-to-end, but two follow-up gaps remained: (1) the planner could still be tempted to default a required field to a plausible-looking value (e.g. fabricating a Slack channel id) to make a patch apply-ready, and (2) the required-input list was bullet-text only — the user had to figure out what the AI wanted, type a phrase into the composer, and hope the AI mapped it back to a real id. AI-22 closes both with planner-rule additions, server-side metadata enrichment, and a new interactive `RequiredInputControl`.

**Planner-prompt discipline ([`buildWorkflowPlanPrompt.ts`](../../../services/ai/planner/buildWorkflowPlanPrompt.ts)).** Two new `PLANNER_CONSTRAINTS` added:

> Required-field discipline (Slice 4.AI-22): NEVER silently default, guess, or invent a required field's value to make the patch apply-ready. Required fields may be filled ONLY when: (a) the user explicitly supplied the value in the request, (b) it is safely derivable from an upstream node's declared `outputs`, (c) it is safely derivable from connected-integration context (e.g. Slack `me=<userId>` for a DM recipient), (d) the field has an existing safe `defaultValue` declared in its FieldMeta, OR (e) the field is a free-text content field where `{{AI_FIELD:fieldName}}` is appropriate per the AI_FIELD rule. For anything else — channel ids, user ids, record ids, enum picks the user hasn't named, attachments — emit a `requiredUserInput` entry and set proposedPatch to null. Do NOT pick a plausible-looking default value (e.g. "#general", "general", "announcements") for a required selection just to ship a patch.

> NEVER treat a display label as an opaque id. If the user said "send to #general" you may pass the literal "#general" ONLY when the field accepts free-text (renderer type `text`/`textarea`) OR the field's static `config options` list contains "#general" as a value. For an id-shaped field (Slack channelId, Discord channelId, Airtable recordId, etc.) WITHOUT a literal-id value in the catalog options AND without a connected resolver result in scope, set proposedPatch to null and add a requiredUserInput entry asking the user to pick the channel. NEVER fabricate ids like `C123456`, `U01ABC23DEF`, `rec12345`. The user picking the value via the React Agent's required-input control (which calls the live options resolver) is the correct path.

The existing AI-12B "no guessed required value" + AI-17 "no fabricated user ids" guidance is reinforced — these new rules name the specific id classes and route the model toward the new interactive control as the correct path.

**Service enrichment ([`enrichRequiredUserInputs.ts`](../../../services/ai/planner/enrichRequiredUserInputs.ts)).** New pure helper walks each `PlanRequiredUserInput` entry through the live registry:

```
{nodeId} → patch.operations (addNode / replaceTrigger) → {provider, type}
        → getActionMeta(provider:type) or getTriggerMeta(provider:type)
        → ActionMeta.fields.find(f => f.name === entry.field)
        → derive {provider, nodeType, nodeLabel, fieldLabel, fieldType,
                  options, optionsSource, dependsOn, multiple, allowFreeText, placeholder}
```

Wired into [`planWorkflowFromPromptForAI`](../../../services/ai/planner/planWorkflowFromPrompt.ts) at both the no-patch and patched paths. Degrades gracefully — entries without `nodeId`/`field` (`select_integration` / `clarification`), unresolvable node ids, or unknown field names pass through unchanged so the UI still gets the bare `label` + `kind` it had pre-AI-22. **No-leak audited:** the helper never reads patch `config` values; it only inspects `node.id` / `node.provider` / `node.type`. A patch carrying `config: { accessToken: "xoxb-LEAKED-SECRET" }` produces an enriched entry whose serialized JSON contains neither `accessToken` nor the secret.

**Client type extension ([`lib/api/ai.ts`](../../../lib/api/ai.ts)).** `AiRequiredUserInput` gains optional `provider` / `nodeType` / `nodeLabel` / `fieldLabel` / `fieldType` / `multiple` / `options` / `optionsSource` / `dependsOn` / `allowFreeText` / `placeholder` — every field optional, so AI-11B / AI-20 / AI-21 / AI-21B / AI-21C consumers that read only `label` + `kind` + `nodeId` + `field` work unchanged.

**Interactive control ([`features/workflow-builder/ai/RequiredInputControl.tsx`](../../../features/workflow-builder/ai/RequiredInputControl.tsx)).** Per missing field, the component branches on the shared [`resolveRequiredInputControl`](../../../features/workflow-builder/ai/resolveRequiredInputControl.ts) helper (AI-35E — the SAME mapping the panel's control-vs-bullet gate uses):

- `options[]` (static enum), single → native `<select>` with one `<option>` per enum value.
- `options[]` (static enum), `multiple` → checkbox group (multi-select); accumulates `RequiredInputAnswer.values`.
- `optionsSource` (dynamic resolver) → typeable combobox + auto-fetched option list via the existing [`useOptionsSource`](../../../features/workflow-builder/hooks/useOptionsSource.ts) hook (same hook the config-modal pickers use; same RLS-protected route; same loading / error / disconnected / empty state machine). Disabled with a deps-missing hint when a `dependsOn` parent isn't staged yet. The `allowFreeText` flag surfaces a "Use '<typed>' as-is" affordance so the user can commit a custom typed string when the resolver result isn't quite right.
- `fieldType: boolean` → checkbox/toggle; `number` → numeric `<input>`; `textarea` → multi-line `<textarea>`.
- `fieldType: text` / `cron` / other renderer-unknown types, OR a bare `config_value` with no renderer hint → single-line `<input>` (safe text fallback for any KNOWN config field). (AI-35E)

A non-field clarification (`clarification` / `choose_trigger` / `variable_reference` with no field identity, no options) resolves to `bullet` and is NOT rendered as a control. There are NO provider-id branches — the control is decided entirely from FieldMeta hints + `kind`.

Controls are fully controlled by the parent's staged-answers map. Selection NEVER auto-submits — the user clicks the composer's `Send details` button to fire the follow-up, then the AI-20 apply-readiness gate decides whether Apply appears on the new plan_result.

**Wired into the chat ([`_BuilderAiPanelChat.tsx`](../../../features/workflow-builder/panels/_BuilderAiPanelChat.tsx)).** A new `RequiredInputControlsBlock` replaces the AI-21B bullet-list view inside the LATEST plan_result message body. Older plan_results still collapse to `intentSummary`. Entries with no field reference (`select_integration` / `clarification`) still render as bullet items inside the same block — the controls and bullets coexist when both are present.

**Staged-answers state ([`BuilderAiPanel.tsx`](../../../features/workflow-builder/panels/BuilderAiPanel.tsx)).** New `stagedAnswers: Map<string, RequiredInputAnswer>` keyed by `requiredInputKey(input)` (`nodeId::field` or `label::<label>` fallback). Threaded through `MessageList` → `PlanResultBody` → `RequiredInputControlsBlock` → `RequiredInputControl`. `handleStagedAnswerChange` updates the map in O(1); `handleSubmit` drains the snapshot, calls `ai.submitFollowUp({ freeText, structuredAnswers })`, and clears the map synchronously before re-rendering. `handleClear` clears the map alongside messages / composer / risk-ack / hook chain. The composer's `Send details` button enables when `stagedAnswers.size > 0` even with an empty composer textarea — so the user can submit via controls alone.

**Structured follow-up ([`composeFollowUpPrompt.ts`](../../../features/workflow-builder/ai/composeFollowUpPrompt.ts)).** New optional `structuredAnswers: ComposeFollowUpStructuredAnswer[]` input renders under a new `User provided:` section:

```
User provided:
- Channel: #general (value: C123456)
- Message: Test from ChainReact AI
```

The `(value: <value>)` suffix is omitted when the display equals the value (no redundant echo). Both `User provided:` and `User follow-up:` render when both are present; either alone renders alone; pre-AI-22 callers that omit `structuredAnswers` see the identical AI-21 output.

[`useBuilderAi.submitFollowUp`](../../../features/workflow-builder/hooks/useBuilderAi.ts) accepts either a legacy `string` (AI-21) OR an `{ freeText?, structuredAnswers? }` object (AI-22). Both normalize to the same call; the chain summary stored under `priorFollowUpAnswers` for multi-turn chains is now `"<freeText> / <label>: <display> / …"` so subsequent turns can cite both forms succinctly.

**Apply-readiness preserved.** The AI-20 gate stays exactly as it was — `canApplyLater === true && proposedPatch && requiredUserInput.length === 0`. Selecting a dropdown does NOT auto-apply; it stages an answer. The user clicks `Send details`, the planner re-plans with the user's structured answers, and (if the new response carries empty `requiredUserInput`) the Apply button renders on the latest plan_result message.

**No-leak preserved.** The enriched required-input entries carry ONLY display labels + `FieldType` enums + static option `{label, value}` pairs declared in FieldMeta + the `optionsSource` registry key (e.g. `slack:channels`). Live resolver results flow through the existing `useOptionsSource` → `lib/api/options.ts` → `app/api/options/[...] /route.ts` stack, which the Slice 3.30 audit already pinned (no token / no raw provider body / no secret-shaped values). The new panel tests audit the controls block under a planner response carrying a fake `accessToken: "xoxb-LEAKED-SECRET"` config — the secret never appears in `document.body.textContent`.

**Boundaries honored.** No changes under `lib/billing/`, `services/billing/`, `workflow-engine/`, `integrations/`, `app/api/workflows/[id]/ai/`, `app/api/ai/`, `core/ai/`, or any provider metadata. The AI-9A plan route's response body shape gains optional fields — every existing consumer that doesn't know about them passes them through unchanged (the body is a typed JSON object; adding optional fields is non-breaking). `WorkflowPatchSchema`, `parseWorkflowPlanResponse` (parser strict on the model-emitted shape), `WORKFLOW_PLAN_TOOL_SCHEMA`, the Anthropic adapter, and the AI-9B apply route are unchanged. No new DB tables, no migration, no DB chat / thread persistence. General app help assistant explicitly NOT built.

**Tests added (49 new across 4 files).** Planner prompt ([`buildWorkflowPlanPrompt.test.ts`](../../../tests/unit/services/ai/planner/buildWorkflowPlanPrompt.test.ts)): +2 cases — required-field discipline rule present (with the (a)..(e) allowlist), label-as-id rule present (with example fake-id strings called out). Enricher ([`enrichRequiredUserInputs.test.ts`](../../../tests/unit/services/ai/planner/enrichRequiredUserInputs.test.ts)): 8 cases — Slack `combobox + optionsSource` enrichment, Slack `textarea` free-text enrichment, no-field/no-nodeId pass-through, unresolvable nodeId pass-through, unknown field pass-through, null patch pass-through, static-options shape sanity, no-leak. Planner service ([`planWorkflowFromPrompt.test.ts`](../../../tests/unit/services/ai/planner/planWorkflowFromPrompt.test.ts)): +2 cases — enrichment wired into the patched path (Slack channel + text fields), and no-field entries pass through unchanged. Compose helper ([`composeFollowUpPrompt.test.ts`](../../../tests/unit/features/workflow-builder/ai/composeFollowUpPrompt.test.ts)): +5 cases — structured-answers rendering, value=display suppression, structured-only mode, combined free-text + structured, pre-AI-22 backward compat. Control ([`RequiredInputControl.test.tsx`](../../../tests/unit/features/workflow-builder/ai/RequiredInputControl.test.tsx)): 20 cases — static-options branch (3 cases + no-hook-fire), optionsSource branch (8 cases: ready / loading / disconnected / error / empty / commit-typed / deps-missing / deps-pass-through), free-text branch (4 cases + no-hook-fire), pre-AI-22 backward compat, `requiredInputKey` helper (2 cases). Panel ([`BuilderAiPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.test.tsx)): +7 AI-22 cases — controls rendered per entry, staging without submit, structured submit produces `User provided:` reconstructed prompt, user-message bubble shows staged answers, Clear resets staged answers, AI-20 gate still holds, no-leak. Full AI + workflow-builder sweep reports **1330 tests across 86 suites passing** (was 1306 in AI-21C → +24 AI-22 cases; net is higher because some are inside files counted twice). 0 lint errors, 5 pre-existing lint warnings (no new warnings introduced).

**Live verification.** Not run from this environment. Covered by the 8 new tests + the existing 30 BuilderAiPanel tests + the 39 planner tests, which together pin every state transition. User-side live smoke against the same `"Create a workflow that sends a Slack message when I manually run it."` prompt is the remaining confirmation step — the expected behavior is now: required-input list renders, the new callout renders ("Provide the missing details above, then run Plan with AI again"), Apply does NOT render. Re-running the plan after revising the prompt (e.g. "...send the message 'Hi' to #alerts when I manually run it") should produce an apply-ready plan.

**Out of scope (deferred).** Inline answering of `requiredUserInput` items (multi-turn UX) — the design would replace the "re-plan" loop with a guided field-fill that feeds the answers back into the next `plan()` call. Worth doing once the React Agent grows beyond single-shot.

### AI-23 implementation note

**Persistent Builder Agent threads — workflow-scoped chat history.** Through AI-22 the React Agent rail was session-local: a refresh / navigation away / "Reopen workflow next week" all dropped the conversation. AI-23 makes the chat persistent per `(user_id, workflow_id)` so the prior conversation is visible when the user returns to a workflow. ONLY the workflow-builder React Agent gets persistence — the general app help assistant remains out of scope (it does not exist in V2 yet).

**Scope boundaries.** No changes under `lib/billing/`, `services/billing/`, `workflow-engine/`, `integrations/`, `core/ai/`, `app/api/workflows/[id]/ai/plan/`, `app/api/workflows/[id]/ai/apply/`, the planner / parser / preview / apply service contracts, or any provider metadata. `WorkflowPatchSchema`, `parseWorkflowPlanResponse`, `WORKFLOW_PLAN_TOOL_SCHEMA`, the Anthropic adapter, and the plan / apply / repair routes are unchanged. AI-23 adds a new persistence surface alongside them; the plan / apply routes never write to it.

**What is stored.**
- User-visible user message text (the literal `prompt` / `followup` content the bubble rendered).
- Sanitized assistant summary text + an allowlisted `safe_payload` projection of the AI-9A/AI-9B route response: `intentSummary`, `assumptions[]`, `unsupportedRequests[]`, `safetyNotes[]`, `canApplyLater`, `blockedReason`, `requiredUserInput[]` with display labels only (`label` / `kind` / `provider` / `nodeType` / `nodeLabel` / `fieldLabel` / `fieldType` / `multiple` / `placeholder`), `preview` with counts + risk shape only (`riskLevel`, `requiresConfirmation`, `changeCount`, `affectedNodeCount`, `affectedEdgeCount`, `userFacingSummaryText`, `taskCostEstimate`, `blockedReason`).
- Apply outcomes: `summaryText`, `appliedOperationCount`, `riskLevel`, `requiresConfirmation` (success); `code` only (failure).
- IDs + timestamps: `id`, `thread_id`, `user_id`, `workflow_id`, `role`, `kind`, `created_at`.

**What is NEVER stored.** Raw model completions / chain-of-thought, raw `proposedPatch` JSON / `operations` / `WorkflowPatch`, raw workflow `config` / `draftDefinition`, secrets / tokens (`accessToken`, `refreshToken`, `apiKey`, `clientSecret`, `webhookSecret`, `authorization`, `bearer`, `password`, `privateKey` at any depth), Authorization headers, raw integration metadata, raw execution payloads, the planner's `requiredUserInput[].field` / `nodeId` / `options[]` / `optionsSource` / `dependsOn` (live-resolver references — historical record doesn't need them and they could leak resolver internals if poisoned). The sanitizer drops these via allowlist + denylist + regex value-scan; secret-shaped string values are redacted to `"[redacted]"`. The migration also caps `content` length and the sanitizer caps payload depth, per-string length, and total serialized bytes as defense in depth.

**Schema** ([`supabase/migrations/20260526000000_builder_agent_threads.sql`](../../../supabase/migrations/20260526000000_builder_agent_threads.sql)).
- `builder_agent_threads (id uuid pk, user_id, workflow_id, title, created_at, updated_at, archived_at)` with `UNIQUE (user_id, workflow_id)` so get-or-create is race-safe, and indexes on `(user_id, updated_at DESC)` / `(workflow_id, updated_at DESC)`. RLS: select / insert / update / delete `WHERE auth.uid() = user_id`. `set_updated_at` trigger.
- `builder_agent_messages (id, thread_id, user_id, workflow_id, role, kind, content text, safe_payload jsonb, created_at)` with CHECK constraints on `role IN ('user','assistant')` + `kind IN ('prompt','followup','plan_result','needs_input','applied','apply_failure','error','system_notice')` + `length(content) <= 8000`. Indexes on `(thread_id, created_at ASC)` (UI history), `(workflow_id, created_at ASC)`, `(user_id, created_at DESC)`. RLS: select / insert / delete `WHERE auth.uid() = user_id` (no UPDATE policy — messages are immutable). `user_id` / `workflow_id` denormalized onto the message row so RLS stays JOIN-free.
- Explicit `GRANT SELECT, INSERT, UPDATE, DELETE` to `authenticated` + `service_role`. `lint:migrations` passes; no `system-table:` opt-out.

**Sanitizer** ([`services/ai/builderAgent/sanitizeAgentMessage.ts`](../../../services/ai/builderAgent/sanitizeAgentMessage.ts)). Pure module. Allowlist over the route response shape (no JOIN through planner internals); recursive secret-key denylist (`token`, `secret`, `apiKey`, `api_key`, `password`, `authorization`, `bearer`, `private_key`, `credentials`) + forbidden-internal-key denylist (`proposedPatch`, `patch`, `operations`, `config`, `workflowDefinition`, `draftDefinition`, `rawModelOutput`, `completion`, `rawPrompt`, etc.); regex value-scan for known secret SHAPES (Google `ya29.`, refresh `1//0`, Anthropic `sk-ant-`, OpenAI `sk-`, Slack `xox[bpsr]-` / `xapp-` / `xoxe.xoxp-`, GitHub `gh[pos]_`, AWS `AKIA…`, JWT `eyJ…`, `Bearer <token>` headers) — matched strings replace the entire string with `"[redacted]"`. Throws `SanitizeAgentMessageError` on role/kind mismatches or excessive depth. Caps content at the planner's 8 KB and serialized payload at 32 KB.

**Repository** ([`repositories/builderAgentThreads.ts`](../../../repositories/builderAgentThreads.ts)). All reads + writes through the SSR-cookie Supabase client (RLS-gated to `auth.uid() = user_id`); no service-role escape hatch. `getOrCreateThreadForWorkflow` is race-safe (re-reads on duplicate-key error). `listMessagesForWorkflow` defaults limit 500, caps at 1000, orders `created_at ASC` (UI rendering). `appendMessageForWorkflow` accepts ONLY `SanitizedAgentMessage` from the sanitizer, copies `(user_id, workflow_id)` onto the message row, and bumps the thread's `updated_at`. `clearThreadForWorkflow` DELETEs all messages for `(user_id, workflow_id)` — the thread row survives so the mapping is stable across clears.

**Routes** ([`app/api/workflows/[id]/ai/thread/route.ts`](../../../app/api/workflows/[id]/ai/thread/route.ts) and [`.../thread/messages/route.ts`](../../../app/api/workflows/[id]/ai/thread/messages/route.ts)). Thin: `requireUser` → verify workflow ownership via `workflows.getById` (404 on missing OR not-owned — same no-existence-leak wording as AI-9A/9B) → repository call → JSON. The messages POST runs through Zod (`role`/`kind` enums + nullable content + record-shape `safePayload`) THEN through `sanitizeAgentMessageForPersist` — even if the schema accepts a poisoned `safePayload` (forward-compat by design), the sanitizer drops every disallowed key + redacts every secret-shaped value before reaching the repository. The plan + apply routes are unchanged; they NEVER write to `builder_agent_messages` on their own — persistence is a separate client-driven surface.

**Client** ([`features/workflow-builder/panels/BuilderAiPanel.tsx`](../../../features/workflow-builder/panels/BuilderAiPanel.tsx)). On `workflowId` change: `getBuilderAgentThread(workflowId)` → rehydrate via `persistedMessageToChat` → render. Each new chat-rendered message (prompt, follow-up, plan_result, applied, apply_failure, error) is persisted via `appendBuilderAgentMessage` through the new helpers in [`_builderAgentPersistence.ts`](../../../features/workflow-builder/panels/_builderAgentPersistence.ts) (`buildPlanResultSafePayload` / `buildApplySuccessSafePayload` / `buildApplyFailureSafePayload` produce the allowlisted projections; the server sanitizer re-applies the same allowlist as defense in depth). Clear conversation calls `clearBuilderAgentThread(workflowId)` + resets local state.

**Historical messages are read-only.** Persisted messages rehydrate with `persisted: true`. `_BuilderAiPanelMessageList.tsx` EXCLUDES persisted plan_result messages from the latest-plan derivation — they always render via `PlanResultBody`'s `isLatest=false` branch (the existing AI-21B collapsed-summary path with the `builder-ai-plan-result-previous` testId), which never shows Apply controls. `proposedPatch` was never persisted, so it isn't reconstructable; the user re-plans (new prompt) to get an apply-ready turn.

**Fail-open everywhere.** Thread load failures (network / 401 / 5xx) log at `console.warn` and leave the chat empty so the UI renders normally. Append-message failures log at `console.warn` and do NOT block the plan / apply flow (the live response still renders in the chat — it just doesn't survive a refresh). Clear-thread failures log at `console.warn` and do NOT block the local reset. The persistence path is strictly an additive UX enhancement; the AI-21B chat is fully usable without it.

**Tests added (71 new across 4 files).**
- Sanitizer ([`sanitizeAgentMessage.test.ts`](../../../tests/unit/services/ai/builderAgent/sanitizeAgentMessage.test.ts)): 34 cases — role/kind validation (5), content secret-pattern redaction (8 token shapes — Google / Anthropic / OpenAI / Slack / GitHub / AWS / JWT / Bearer headers), benign content untouched, content length cap, payload secret-key denylist (4 cases at varying depths + snake_case + benign keys), payload forbidden-internal-key denylist (proposedPatch / patch / operations / config / workflowDefinition / rawModelOutput / completion / rawPrompt / forward-compat unknown keys), allowlist for plan_result (success + failure shapes, required-input field stripping, label-required pruning), allowlist for apply_failure / applied, size + depth caps (per-string + drop-order + depth-throw), nuanced refresh_token detection.
- Repository ([`builderAgentThreads.test.ts`](../../../tests/unit/repositories/builderAgentThreads.test.ts)): 12 cases — get-or-create existing / new / race recovery / read-error surfacing; list filters / limit cap / propagation; append insert payload shape + thread updated_at bump + insert-error propagation; clear DELETE filters + count + zero / error.
- API routes ([`ai-thread-route.test.ts`](../../../tests/unit/app/api/workflows/ai-thread-route.test.ts)): 18 cases — GET 401 / 404-missing / 404-other-user (with no-existence-leak wording check) / 400-empty-id / chronological order / no-user_id-leak; DELETE 401 / 404-other-user / clear-with-count; POST 401 / 404-other-user / 400-invalid-json / 400-unknown-role / 400-unknown-kind / append success / server-side proposedPatch+secret-key strip / content secret-value redaction / 500 on persistence failure (with sanitized error message).
- Panel ([`BuilderAiPanel.persistedThread.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.persistedThread.test.tsx)): 7 cases — load + rehydrate / no-Apply on persisted plan_result / fallback to fresh chat on load failure / user prompt + assistant plan_result both persist with no-leak payload / fail-open on persist failure / Clear DELETEs thread / fail-open on Clear failure / no-leak from persisted history.

Existing tests: the AI-20 / AI-21 / AI-21B / AI-21C / AI-22 panel + hook + helper + planner suites continue to pass unchanged (mock `@/lib/api/ai` extended with no-op `getBuilderAgentThread` / `appendBuilderAgentMessage` / `clearBuilderAgentThread` defaults so the existing flow assertions stay byte-equivalent). Pre-PR AI-22 sweep: 1330 tests across 86 suites. Post-PR AI-23: targeted Builder-Agent + AI-route + AI-services + workflow-builder sweep all pass; full suite still required (running in the verification step).

**Out of scope (deferred).** Per-message edits (chat history is append-only by design — UPDATE policy not added). Multi-session threads per workflow (the migration uses `UNIQUE (user_id, workflow_id)` so one active thread per pair; future multi-session lifts that constraint). Search across threads. Cross-workflow conversation memory. General app help assistant (not in V2). Server-side persistence inside the plan / apply routes themselves (kept out so the route contracts stay unchanged — persistence is strictly client-driven for now; revisit if the chat needs server-side write fanout).

### AI-25 implementation note

**Preserve React Agent follow-up chain on retryable model failures.** Marcus's 2026-05-27 live use surfaced a UX cliff: after the agent asked for missing details, he typed an answer, hit Send, and got `RATE_LIMITED`. The chain dropped — `originalPrompt` cleared, `priorFollowUpAnswers` cleared, `stagedAnswers` cleared, composer cleared. To retry he had to start over: re-prompt, wait for the question again, re-answer. The 429 was a transient model-provider error, not a user mistake, and shouldn't have cost him his context.

**Root cause.** `useBuilderAi.submitFollowUp` (pre-AI-25 lines 243–255) treated ANY `ok: false` planner response as terminal: it overwrote `planResult` with the failure shape AND dropped `originalPrompt` + `priorFollowUpAnswers` because `planNeedsMoreInput(result)` requires `result.ok === true`. The transport-throw `catch` branch already preserved chain state ("user can retry the same follow-up answer"); the ok:false branch did not, even though both modes are equally retryable. The panel's `handleSubmit` also cleared composer text + staged required-input answers synchronously at submit-time and never restored them — by design, since the pre-AI-25 flow had no "preserve on retryable failure" concept.

**Fix.** AI-25 makes retryable follow-up failures non-terminal end-to-end. The classification is deliberately broad — per the spec "Do not drop context just because ok:false" — so every structured ok:false response from `submitFollowUp` is treated as retryable, in addition to transport throws. RATE_LIMITED (model 429), PARSE_FAILED (model returned invalid JSON), PREVIEW_UNAVAILABLE (the deterministic preview couldn't run against the workflow), NETWORK_ERROR / TIMEOUT / PROVIDER_ERROR (all surface as `MODEL_FAILED` from the planner service), and any future ok:false codes — all preserve chain.

- **Hook** ([`useBuilderAi.ts`](../../../features/workflow-builder/hooks/useBuilderAi.ts)). `submitFollowUp` on `ok: false`: do NOT call `setPlanResult(result)` (the prior needs-input plan stays in state — its `requiredUserInput` survives, so the chat's latest plan_result bubble keeps rendering the interactive controls and `apply`'s readiness gate stays correct); do NOT clear `originalPrompt` / `priorFollowUpAnswers`; do NOT push this turn into `priorFollowUpAnswers` (a failed turn was never seen by the model and must not contaminate the next reconstructed prompt); set status `"planned"`; return `null`. The existing transport-throw `catch` branch already had the same chain-preservation contract — AI-25 just extends it to ok:false. On ok:true success, the existing logic is unchanged: `planNeedsMoreInput(result)` continues the chain; an empty `requiredUserInput` completes it and drops chain state.

- **Panel** ([`BuilderAiPanel.tsx`](../../../features/workflow-builder/panels/BuilderAiPanel.tsx)). `handleSubmit` snapshots both `prompt` (composer text) and a clone of `stagedAnswers` (the interactive required-input control values) BEFORE clearing them at submit-time. On `result === null` (transport throw OR retryable follow-up failure), it calls `setPrompt(composerForRetry)` and `setStagedAnswers(stagedAnswersForRetry)` before appending the error bubble. The user can click Send again immediately — same composer, same staged selections — and the planner is retried with an identical reconstructed prompt. The friendly error bubble ("The AI assistant is unavailable right now. Please try again in a moment.") still appears as a non-blocking marker that the failure happened.

**Trade-off — user bubble duplication on retry.** The chat is append-only and the user-message bubble is appended SYNCHRONOUSLY at submit-time (for the "immediate-feedback" UX). If the user retries with restored composer + staged answers, a SECOND identical user bubble appends — the chat will show `bubble1 → error1 → bubble2 → assistant-plan`. The spec calls duplication out: "Do not duplicate user follow-up bubbles on retry … unless current chat model makes duplication unavoidable." With the append-only design, suppressing the second bubble would require either (a) a "last attempted submission" tracker that introspects bubble content (brittle), or (b) deferring the user-bubble append until after the planner returns (breaks immediate-feedback). AI-25 accepts the duplication as the lesser cost; the planner retry sends the same reconstructed prompt and the conversation transcript stays transparent — the user sees that they tried twice.

**Initial-plan failure (the `ai.plan` path) is separate.** Initial plan failures return the structured `{ ok: false, code, errors[] }` shape (not null) so the panel can render `<PlanFailure>` inside a plan_result assistant bubble — the existing UX since AI-12. AI-25 does NOT change this path's chain semantics (there's no chain to preserve on an initial-prompt failure). The panel's composer-restore on `result === null` covers transport throws of `ai.plan` too, so `plan` transport failures restore composer text; structured `ok: false` initial responses do NOT restore composer (pinned by an explicit test so it can't drift accidentally). Justification: initial plan failures put the user in front of a structured failure bubble with the PlanFailure copy + "Planner error: <stage> / <code>" detail — the user can scroll up and edit + resend from their bubble.

**Graph immutability invariant unchanged.** AI-25 touches `submitFollowUp` chain state + panel local state only. No new hydrate call sites; only successful Apply mutates the graph. The AI-25 panel suite spot-checks this on the RATE_LIMITED follow-up path; the broader [`BuilderAiPanel.graphImmutability.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.graphImmutability.test.tsx) still owns the full immutability contract (mount / plan / RATE_LIMITED / PARSE_FAILED / transport / follow-up / Clear / apply-success-positive-control).

**Tests added (14 new across 2 files).**

- Hook ([`useBuilderAi.test.tsx`](../../../tests/unit/features/workflow-builder/hooks/useBuilderAi.test.tsx)) — 6 cases: submitFollowUp RATE_LIMITED returns null + preserves followUpMode; submitFollowUp RATE_LIMITED preserves planResult (the prior needs-input plan stays the active turn — assertion uses object identity `result.current.planResult === planBefore`); PARSE_FAILED also retryable + preserves chain + planResult; RATE_LIMITED does NOT push the failed turn into `priorFollowUpAnswers` (regression guard — the retry call's reconstructed prompt does NOT contain a stale "Previous follow-up answers" line citing the rate-limited turn); successful retry after RATE_LIMITED completes the chain when `requiredUserInput` resolves; `reset()` clears all preserved chain state.

- Panel ([`BuilderAiPanel.retryableFailure.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.retryableFailure.test.tsx)) — 8 cases: RATE_LIMITED with composer free-text → composer restored + chain stays active + button still reads "Send details"; RATE_LIMITED with staged required-input → required-input control still visible + staged value restored into the control; retry with same composer + staged answers → second planner call's reconstructed prompt is structurally identical to the first attempt; no graph mutation on RATE_LIMITED follow-up; Clear conversation after RATE_LIMITED → all preserved state wiped + composer back to "Plan with AI" mode; initial-plan RATE_LIMITED → composer NOT restored (current behavior, intentionally pinned); initial-plan transport throw → composer IS restored (transport-throw branch); successful follow-up regression guard — `ok:true && requiredUserInput.length === 0` still drops the chain + surfaces Apply.

**Existing tests untouched + still pass:** the pre-AI-25 useBuilderAi suite (no test pinned the buggy "drop chain on ok:false" behavior), the AI-21 transport-failure-preserves-chain test, the AI-22 Clear-resets-staged-answers test, the AI-22 staged-answers-in-bubble test, the AI-12 / AI-11B PlanFailure tests (initial-plan failure UX unchanged).

**Out of scope (deferred).** A dedicated "Retry" button on the error bubble (the spec mentioned it as a possibility — current UX is "click Send details again with restored state", which works without new UI surface). Different friendly-error copy per failure code (current copy says "unavailable right now", same as transport throw — adequate for RATE_LIMITED). Preserving composer on structured initial-plan failures (intentional trade-off documented above). General app help assistant (still not built; same scope guard as AI-23/AI-24).

### AI-25 follow-up — missing-migration dev visibility

**Live observation (Marcus, 2026-05-27).** The React Agent chat appeared to "clear on refresh" in local dev. Audit traced the cause to the AI-23 migration not being applied locally: `getOrCreateThreadForWorkflow` threw `Could not find the table 'public.builder_agent_threads' in the schema cache`, the route surfaced a generic 500 with no server log, and the client's fail-open `console.warn` showed only the raw error. A developer running the app for the first time after AI-23 had no obvious signal that the fix was `supabase db push`. The AI-23 fail-open behavior is correct for product UX (no crash, no toast), but the dev/debug path needed work.

**Diagnostic helper** ([`core/ai/builderAgentPersistenceDiagnostics.ts`](../../../core/ai/builderAgentPersistenceDiagnostics.ts)). Pure module, no DB / Next / Node deps. Lives in `core/` per the V2 module-boundary rule — `features/` may import VALUES from `core/` but not from `services/`, and the diagnostic helper is consumed by both server (route) and client (`features/workflow-builder/panels/_builderAgentPersistence.ts`). Owns:

- `isMissingTableError(message)` — pattern-matches PostgREST schema-cache messages (`Could not find the table … in the schema cache`, `PGRST205`), Postgres SQLSTATE `42P01`, and supabase-js `relation … does not exist`.
- `MIGRATION_HINT` — stable string naming both tables + recommending `supabase db push` / `supabase migration up` + the dev-server restart fallback.
- `formatPersistenceErrorForDev(err, { route, op })` — dev-friendly log line for server `console.error`. Includes the route + op prefix and (only on missing-table matches) the migration hint.
- `buildPersistenceErrorBody(err, fallbackMessage)` — structured 500 body: `{ error, code: "PERSISTENCE_UNAVAILABLE", migrationHint? }`. `migrationHint` is non-null ONLY when the error matches a missing-table pattern. The `error` field stays generic — raw Postgres / table names / SQLSTATE never reach the user-facing error string, only `migrationHint` (dev-time only).

**Route wiring** ([`/api/workflows/[id]/ai/thread/route.ts`](../../../app/api/workflows/%5Bid%5D/ai/thread/route.ts) + [`/api/workflows/[id]/ai/thread/messages/route.ts`](../../../app/api/workflows/%5Bid%5D/ai/thread/messages/route.ts)). All three repo paths (thread GET, thread DELETE, messages POST) now wrap their persistence calls in `try/catch`. On failure: log via `formatPersistenceErrorForDev` (server-side `console.error`), return `buildPersistenceErrorBody` as a structured 500. The user-facing `error` field stays the same generic copy as before — no info leak in the response.

**Client warn wiring** ([`features/workflow-builder/panels/_builderAgentPersistence.ts`](../../../features/workflow-builder/panels/_builderAgentPersistence.ts) + [`BuilderAiPanel.tsx`](../../../features/workflow-builder/panels/BuilderAiPanel.tsx)). New `warnPersistenceFailureForDev(context, err)` helper. Detection looks at: (a) the raw error message via `isMissingTableError`, (b) `err.cause.message` for wrapped errors, (c) `AiApiError.status === 500` for the route-side schema-cache 500 (the `fetchJson` helper throws an `AiApiError` carrying only the server's `error` field — not the raw `migrationHint` — so HTTP status is the most reliable signal client-side). When any matches, the `console.warn` gets the `MIGRATION_HINT` appended as a third arg. False-positive cost: a one-line extra log on legitimate 500s; zero user-facing UX impact since this is dev-console-only. Replaced all three existing `console.warn` sites (thread load, thread clear, message persist) to use the new helper.

**No product UX change.** Fail-open contract preserved — persistence failures still don't crash the panel, don't toast the user, don't block plan/apply. Only the dev console + server log get the new hint.

**Local dev setup runbook** (added here so future developers don't repeat Marcus's debug session):

1. Apply pending migrations: `supabase db push` (or `supabase migration up`).
2. Verify the tables exist in the local DB:
   ```sql
   SELECT relname FROM pg_class
   WHERE relname IN ('builder_agent_threads', 'builder_agent_messages');
   ```
3. If PostgREST's schema cache still reports the tables as missing after a successful migration apply, restart the local dev server (PostgREST caches the schema at process start). With the Supabase CLI: `supabase stop && supabase start`.
4. Re-open a workflow in the Builder. The React Agent rail should load `GET /api/workflows/[id]/ai/thread` with a 200, persist new messages on submit, restore them on refresh, and DELETE them on Clear conversation.

If you see the dev-console `MIGRATION_HINT` line ("Builder Agent persistence is unavailable — the public.builder_agent_threads / public.builder_agent_messages tables are missing. Run `supabase db push` …"), step 1 hasn't completed for this DB instance.

**Tests added (29 new across 3 files).**

- Diagnostic helper ([`builderAgentPersistenceDiagnostics.test.ts`](../../../tests/unit/core/ai/builderAgentPersistenceDiagnostics.test.ts)) — 15 cases: 7 detection cases (Marcus's exact PostgREST message, messages-table variant, bare "schema cache", PGRST205, SQLSTATE 42P01, supabase-js `relation does not exist`, unrelated-error false-cases incl. empty/undefined/null inputs); 4 format cases (with hint, without hint, non-Error throws, omits context prefix when no route/op); 3 body cases (includes hint, omits hint, never leaks Postgres detail into the user-facing `error` field); 1 MIGRATION_HINT content sanity (names both tables, recommends `supabase db push`, recommends restart).
- Routes ([`ai-thread-route.test.ts`](../../../tests/unit/app/api/workflows/ai-thread-route.test.ts)) — 5 cases under `AI-25 follow-up — schema-cache 500 carries migrationHint`: GET schema-cache miss → 500 + PERSISTENCE_UNAVAILABLE + migrationHint (with no schema-cache / SQLSTATE leak in the `error` field); GET schema-cache miss → console.error includes route + op + supabase-db-push; GET unrelated error → 500 + PERSISTENCE_UNAVAILABLE but NO migrationHint; DELETE schema-cache miss; POST schema-cache miss.
- Client helper ([`_builderAgentPersistence.test.ts`](../../../tests/unit/features/workflow-builder/panels/_builderAgentPersistence.test.ts)) — 9 cases: unrelated error → plain warn (no third hint arg); raw schema-cache pattern → hint appended; AiApiError(500) → hint appended (the route-side schema-cache 500 path); AiApiError(401/404) → no hint; err.cause inspection (wrapped errors); console-undefined no-op guard; `persistMessageBestEffort` success → no warn; persist 500 → warn-with-hint + returns null; persist generic error → plain warn + returns null.

Existing tests unchanged: AI-23 route + repository + panel persistence suites still pass; the existing `returns 500 when persistence fails` test from AI-23 was kept (asserts the generic 500 path) — the new AI-25 cases extend it with the structured-body assertions.

**Out of scope (deferred).** A dev-mode banner inside the panel itself surfacing the migration hint visually (current solution is console-only). A `lib/utils/logger`-style structured logger replacing the bare `console.error` in the routes (`logger` exists in `lib/utils/logger` for V2 but most routes still use `console`; refactor is its own slice). Detection of OTHER classes of dev-only errors (RLS-permission-denied for forgotten policies, encryption-key-missing, etc.) — easy to extend `persistenceDiagnostics` with more patterns when those surface in dev.

### AI-35K — Combobox manual-entry fallback when optionsSource can't load

**AI-35K (2026-05-29).** A React Agent required-input picker (e.g. "Which Slack channel?") rendered an `optionsSource` combobox. With the provider disconnected, options couldn't load and the UI showed a load error with no way to type a value and continue — drafting was blocked purely because the picker couldn't fetch.

**Root cause.** (1) [`RequiredInputOptionsSourceControl`](../../../features/workflow-builder/ai/RequiredInputOptionsSourceControl.tsx): the query `<input>` stays editable, but the "Use '…' as-is" commit button rendered **only when `input.allowFreeText === true`** — so a picker with `allowFreeText:false` + a failed load (`state.status` `disconnected`/`error`) had no way to commit the typed text. (2) [`deterministicCompletion`](../../../features/workflow-builder/ai/deterministicCompletion.ts): the AI-35G picker branch used `answer.value` only and returned `model_replan("picker_requires_option")` for a display-only answer, so even a committed typed value would bounce to the model.

**Fix (UI + client only; explicitly NO new unresolved/verified-value architecture per the slice scope).**
- UI: the commit affordance now also appears when `state.status === "disconnected" || "error"` (in addition to `allowFreeText`). The typed value flows as the answer's `display` (no fabricated option id). A selected option still calls `onChange` with `value` (the id).
- Deterministic completion: value resolution is now `answer.value ?? answer.display` for all fields (the AI-35G picker-only special case + `picker_requires_option` reason are removed). A SELECTED option's value/id still wins; a typed value completes the field. The typed string is written to config; the AI-5 preview / activation validation decides acceptability — a genuinely invalid value still returns `NEEDS_REPLAN` (existing model fallback, no silent corruption).
- Server unchanged: `/ai/complete` `AnswerSchema` already accepts `value: z.string()` and `completePlanWithRequiredInputs` writes it as-is.

**Apply vs Activate unchanged.** A disconnected provider still emits a non-apply-blocking `select_integration` required input (AI-17/AI-35) that gates Activation, so the user can Apply a draft with a typed channel while Activation stays blocked until the provider is connected. This is why no new readiness/validation layer was needed — the existing gate already enforces the safety boundary.

**Generic / metadata-driven** — works for any `optionsSource`-backed field (Slack channel/user, Gmail label, Sheets spreadsheet, Airtable/Trello/Notion pickers), no Slack-specific branches.

**Boundaries.** No unresolved-value system · no planner provider routing change · no Anthropic fallback · no workflow-execution-semantics change · no billing/tasks · no provider-metadata change · no general app-help · no graph mutation before Apply. **Tests:** `RequiredInputControl.test.tsx` (disconnected/error → editable + commit without allowFreeText; no commit when loaded + !allowFreeText; Slack regression), `deterministicCompletion.test.ts` (typed picker value completes; selected id wins; empty → missing), `useBuilderAi.deterministic.test.tsx` (typed fallback → `completePlan`, not `planWorkflow`, no apply).

### AI-35J — Preserve compatible follow-up answers across intent corrections

**AI-35J (2026-05-29).** Follow-on to AI-35I. The correction now switches the action correctly, but it **discarded compatible prior details**: "Send me a Slack DM…" → answer "hey" → "this is to a channel" → the agent switched to a channel message and then re-asked "What should the message say?" instead of reusing "hey".

**Root cause (audit Q2).** The prior message answer is NOT lost from state — it rides in `priorFollowUpAnswers` (rendered as `Previous follow-up answers:\n- What should the Slack direct message say?: hey`), because the message turn re-planned with the recipient still outstanding (chain stayed open). The bug is purely the AI-35I prompt wording: the `Correction:` directive + closing only instruct DISCARD (of inputs tied to the replaced choice) and frame prior answers as "CONTEXT ONLY", with no PRESERVE instruction — so the OpenAI planner rebuilds from scratch and re-asks.

**Fix (prompt-only, generic, semantic — no logic/state change).** [`composeFollowUpPrompt`](../../../features/workflow-builder/ai/composeFollowUpPrompt.ts):
- The `Correction:` directive (only when `isCorrection`) now also says: PRESERVE earlier user-provided values that still apply (message text/body/content, schedule times, filter terms) and do NOT re-ask for a value the user already supplied when it remains compatible; discard only values tied to the replaced field/action/provider.
- The always-rendered closing adds the same preserve clause, with the generic compatibility guard "destination details **when the destination type is unchanged**" — this is what stops a DM `userId` being reused as a channel id (or a channel as a recipient) on a destination-type change, while message/body/content, schedules, and filters transfer across compatible actions.

Latest correction stays authoritative for SHAPE (AI-35I); preservation applies to compatible VALUES only. No Slack-specific branches (covers DM↔channel, Gmail↔Outlook, Slack↔email). `priorFollowUpAnswers` already flowed from `useBuilderAi.submitFollowUp` (with field labels giving semantic signal), so no hook/state change was needed and no separate structured semantic-kind summary was added (deferred unless live QA shows the prompt-only fix is insufficient — don't over-engineer).

**Deterministic vs re-plan unchanged.** A plain field answer ("hey", no correction) still completes deterministically (no model call); a shape-changing correction still skips deterministic completion and re-plans (AI-35I). No new routing — the hook only calls `planWorkflow`/`completePlan`; OpenAI-vs-Anthropic selection lives behind `/ai/plan` (AI-36) and is untouched.

**Known limitation (documented).** If a prior answer fully completed the plan deterministically (chain closed, apply-ready) and the user then corrects, the correction starts a *fresh* plan and the prior answer is not carried (it lived only in the unapplied patch). Preserving across a closed chain would need persisted completed-answer state — deferred. The in-scope flow keeps the chain open, so `priorFollowUpAnswers` carries the value.

**Boundaries.** No planner provider routing change · no Anthropic fallback · no execution / billing / provider-metadata / general-help change · no graph mutation before Apply. **Tests:** `composeFollowUpPrompt.test.ts` (preserve clause present in correction directive + always-closing; destination-type guard; prior answer text present; non-correction follow-up regression) + `useBuilderAi.test.tsx` (DM→channel preserves "hey"; provider correction preserves downstream text; plain field fill still deterministic; correction uses `planWorkflow` only — no `completePlan`/apply).

### AI-35I — Follow-up intent-correction reconciliation

**AI-35I (2026-05-29).** Live regression in follow-up *correction* flows: "Send me a Slack DM when I manually run this workflow" → "This is to a channel" kept returning DM semantics ("Which Slack user should receive the DM?", then "Slack DMs require a userId, not a channel"). An explicit user correction was not overriding the earlier inferred provider/action/trigger — a **stale-intent** bug.

**Root cause.** Two parts. (1) **Primary:** [`composeFollowUpPrompt`](../../../features/workflow-builder/ai/composeFollowUpPrompt.ts) closed with *"Produce the workflow patch for **the original request** using the follow-up details above…"* — the original request ("Slack DM") read as binding and the correction as a subordinate detail, with NO directive that the latest message overrides prior inferred intent. (2) **No correction signal:** nothing flagged the correction, so the re-plan gave the planner no reason to abandon the prior action, and `priorFollowUpAnswers` (e.g. an earlier "DM me") reinforced it. **Exposed by AI-36** — the OpenAI planner reads the weak "original request" wording more literally than Sonnet did (AI-35G/H docs note the correction *used to* switch DM→channel; they only fixed channel-field rendering).

**Not the cause (audited):** `completePlanWithRequiredInputs` is never invoked for the correction — free text already forces re-plan (`deterministicCompletion` → `free_text_present`). And `planResult` is fully replaced on re-plan (`setPlanResult`), so stale `requiredUserInput` is replaced (not merged) automatically. The machinery was fine; the prompt misled the model.

**Fix (planner-agnostic, generic, no provider hardcoding).**
- New pure detector [`detectIntentCorrection`](../../../features/workflow-builder/ai/detectIntentCorrection.ts): scans the latest free-text follow-up for generic override/contrast markers (`not-a-dm`, `to-a-channel`, `i-said`, `instead`, `actually`, `rather-than`, `change-to`, `switch-to`, `no-contrast`, `make-it`). Provider corrections ("No, use Outlook", "Actually send an email, not Slack") are caught by the generic markers without enumerating providers. Tuned for **recall** — a false positive only adds harmless override emphasis to a re-plan free text already forces; a false negative re-introduces the bug.
- [`useBuilderAi.submitFollowUp`](../../../features/workflow-builder/hooks/useBuilderAi.ts): on a detected correction, (a) skips deterministic completion (`{ mode: "model_replan", reason: "intent_correction" }`) so a stale `proposedPatch` is never completed, and (b) passes `isCorrection` + the prior plan's value-free `intentSummary` (`priorPlanSummary`) into the prompt.
- `composeFollowUpPrompt`: ALWAYS closes with an authoritative-latest instruction (original request / questions / current plan / prior answers are CONTEXT ONLY; if the latest message conflicts, follow it and REPLACE the obsolete provider/action/trigger choice, discarding inputs that only applied to the replaced choice; AI-35 edit-vs-add guidance kept). When `isCorrection`, prepends a `Correction:` directive marking the latest message an explicit override. Renders `priorPlanSummary` under a clearly non-binding header.

**Deterministic vs re-plan.** Deterministic completion is for **direct field-filling only** (a plain "Hey" still completes with no model call). A **shape-changing correction** forces a model re-plan. Stale required inputs are **replaced, not merged**.

**Out of scope (audited).** A distinct `requiredInputResolutionReason: "intent_correction"` in the AI-35D dev `aiCostDebug` telemetry — that is emitted server-side in the plan/complete routes; the correction re-plan is already attributed as `interactionKind: "follow_up"`. Deferred dev-observability follow-up.

**Boundaries.** No planner provider routing change (OpenAI stays the planner per AI-36; Anthropic not called) · no workflow execution / billing / provider-metadata / general-help change · no graph mutation before Apply. **Tests:** `detectIntentCorrection.test.ts` (new — positives for every marker phrase + negatives for plain answers), `composeFollowUpPrompt.test.ts` (authoritative-latest closing always present; `Correction:` directive iff `isCorrection`; non-binding prior-plan summary), `useBuilderAi.test.tsx` (7 cases: DM→channel, "I said channel", config-fill-still-deterministic, provider correction, action correction, prior-answer-vs-latest, no-graph-mutation).

### AI-36 — OpenAI-only planner routing; Anthropic disabled at runtime

**AI-36 (2026-05-27).** Product decision: Anthropic/Sonnet runtime cost is not acceptable, so the React Agent planner now uses **OpenAI `gpt-4.1-mini`** and **Anthropic is not called at runtime**. Anthropic code stays in the repo (dormant) behind an explicit emergency flag.

**Routing** — [`createPlannerModelClient`](../../../services/ai/modelClients/createModelClient.ts) (no silent fallback):
1. `ENABLE_OPENAI_PLANNER=true` + `ENABLE_OPENAI_PROVIDER=true` + `OPENAI_API_KEY` → OpenAI `gpt-4.1-mini` (the `fast` tier). With the flag on but no key → NOT_CONFIGURED (still not Anthropic).
2. Else `ENABLE_ANTHROPIC_PLANNER_FALLBACK=true` (emergency/dev ONLY, default off) → Anthropic. This is the ONLY runtime path that calls Anthropic.
3. Else → NOT_CONFIGURED → the existing "model unavailable" flow (MODEL_FAILED → 503). NEVER Anthropic.

The planner ([`planWorkflowFromPrompt.ts`](../../../services/ai/planner/planWorkflowFromPrompt.ts)) uses the routed client when none is injected (tests still inject mocks). `OPENAI_MODELS.fast.maxOutputTokens` was bumped 4096→8192 (gpt-4.1-mini supports 32k) and the planner request overrides its output budget with the routed model's, so the OpenAI planner keeps the prior Sonnet-grade 8192 output budget. Request tier is `fast` → the OpenAI Responses-API adapter (AI-34A) serves `gpt-4.1-mini`; the AI-19 forced function-tool contract is identical to the Anthropic path.

**Env vars:** `ENABLE_OPENAI_PROVIDER=true`, `ENABLE_OPENAI_PLANNER=true`, `OPENAI_API_KEY=…`. The planner model is `gpt-4.1-mini` (hardcoded `OPENAI_MODELS.fast`); `OPENAI_PLANNER_MODEL` / `OPENAI_PLANNER_STRONG_MODEL` env overrides are **not yet wired** (the registry id is the source of truth) — deferred per Part B's "keep minimal" since the adapter resolves the model id by tier from the registry.

**Failure behavior (no Anthropic fallback):** NOT_CONFIGURED / RATE_LIMITED / PROVIDER_ERROR / NETWORK_ERROR → `MODEL_FAILED`; truncation/bad JSON → `PARSE_FAILED`; preview rejection → existing apply-readiness flow. All preserve retry state, mutate nothing, and **never** call Anthropic. The AI-35B deterministic completion still avoids the model entirely for direct field fills.

**Telemetry:** `result.model.modelId = "gpt-4.1-mini"` → `getModelById` → `model_provider: "openai"`; `recordAiPlanOutcome` records OpenAI planner calls (`workflow_creation`); the AI-34C classifier stays a separate `provider_discovery`-style event. `aiCostDebug` shows `provider=openai`. **Known cosmetic detail:** a *planner-disabled* (no flags) NOT_CONFIGURED failure carries a fast-tier placeholder model id (an Anthropic registry id) since no call is made — but the configured path (the only one that runs in the smoke) always reports OpenAI.

**Live smoke (2026-05-27):** `npx tsx scripts/trash/verify-openai-planner.ts` — all 5 prompts ("Send me a Slack DM", "When Stripe payment fails…", "When I get an email…", "When I get a Gmail email…", "Create an automation") returned `provider=openai`, `model=gpt-4.1-mini`, `finish=stop`, parse ok. Narrowed prompts ~8–10k input tokens; "Create an automation" full-catalog ~34k (OpenAI-billed, not Anthropic). No key printed.

**Boundaries.** Anthropic code NOT deleted; never called without the emergency flag. No parser/schema/preview/apply bypass; no workflow-execution / billing / provider-metadata change; no general app-help assistant. Tests: `createPlannerModelClient.test.ts` (routing + emergency-only + no-network NOT_CONFIGURED) + AI-36 describe in `planWorkflowFromPrompt.test.ts` (OpenAI success → `/v1/responses`; parse/rate-limit/provider/no-key failures never hit `/v1/messages`; emergency flag is the only `/v1/messages` path).

### AI-35H — OptionsSource reconciliation for follow-up plans

**AI-35H (2026-05-28).** Live regression after AI-35G: a follow-up correction ("Send me a Slack DM…" → "This is to a channel" + "Hey") switched the action to `slack:send_channel_message` and asked "Which Slack channel should receive the message?" — but the channel rendered as plain text, not the `slack:channels` combobox.

**Root cause.** Follow-up re-plans go through the SAME orchestrator as initial plans (`/ai/plan` → `planWorkflowFromPromptForAI`), so AI-35G's `reconcileBareConfigValueEntries` DID run on the follow-up. The narrowness: it matched only bare `kind: "config_value"` questions, and the model emitted "Which Slack channel?" as a **`clarification`** (a "which X?" question). So the bare clarification was never reconciled to the patch's missing `channel` field → `enrichRequiredUserInputs` had no field identity to attach the `optionsSource` to → plain-text fallback. (Confirmed via the validator/preview path: `checkNodeRegistryAndConfig` flags an empty required field as `MISSING_REQUIRED_FIELD`, but `previewWorkflowPatchForAI` returns `aiToolOk` with `canApplyLater: validation.ok` — so a patch with an *empty* channel still flows through `deriveMissingRequiredFieldInputs` and renders the combobox. The failure was specifically the bare, non-`config_value`-kind question that neither derivation nor AI-35G reconcile caught.)

**Fix (generic, pipeline-only — not Slack-specific).** [`reconcileBareConfigValueEntries`](../../../services/ai/planner/enrichRequiredUserInputs.ts) now reconciles bare questions of kind `config_value` OR `clarification` (`RECONCILABLE_BARE_KINDS`) and normalizes the attached entry's kind to `config_value`. Strictly guarded as before: fires only when exactly one bare reconcilable question AND exactly one fillable required field (empty / `{{AI_FIELD}}`, not already targeted) exist on the patch's `addNode`/`replaceTrigger` nodes. `provider_choice` / `select_integration` / `choose_trigger` / `variable_reference` are intentionally NOT reconciled. Once attached, enrichment surfaces the field's FieldMeta so the channel renders its `slack:channels` combobox; works identically for any provider/native field with `optionsSource`.

**Deterministic completion** unchanged (AI-35G): a picker field (`options`/`optionsSource`) completes only from the selected option **value (id)** — a free-text-only answer → `model_replan(picker_requires_option)`, never writing a display label where an id is required.

**Remaining limitation (documented).** A follow-up returning a **null patch** (no node to infer from) or a patch with **≥2 fillable required fields** for one bare question cannot have its field identity safely inferred → renders as a text fallback; deterministic completion safely re-plans rather than writing a label as an id. Closing the null-patch case would require the planner to always emit the action node (a prompt-behavior change, deliberately out of scope).

**Boundaries.** No planner provider routing change, no patch-generation routing change, no OpenAI/Anthropic routing change, no workflow-execution / billing / provider-metadata change, no general app-help assistant, no graph mutation before Apply. **Tests:** `enrichRequiredUserInputs.test.ts` (+clarification reconcile + normalize-to-config_value + clarification→combobox + choose_trigger/variable_reference NOT reconciled + wording-independent), `planWorkflowFromPrompt.test.ts` (+follow-up bare-clarification → channel combobox end-to-end through the orchestrator, canApplyLater false).

### AI-35G — React Agent layout + optionsSource control parity

**AI-35G (2026-05-28).** Two live QA findings from "When I manually run this, send a Slack message saying Hello".

**(A) AI-applied nodes rendered side-by-side.** The planner gets no positioning guidance, so its `addNode` positions are arbitrary (often same-`y`); `applyPatchToDefinition` copies `node.position` verbatim and `applyWorkflowPatchForAI` persists it; the builder re-hydrates the persisted definition after Apply (`BuilderAiPanel.onApplied` → `getWorkflow` → `hydrate`), so the side-by-side layout showed.
- Fix: new pure [`normalizeLinearWorkflowLayout(def, operations)`](../../../services/ai/apply/normalizeLinearLayout.ts), called in `applyWorkflowPatchForAI` on the validated candidate before persist. For a **simple linear chain** (one head/in-degree-0 node, every node in-/out-degree ≤ 1, no labeled branch edges, no cycle, single connected component) it re-stacks all nodes vertically anchored on the head's position — `{ x: head.x, y: head.y + i*VERTICAL_NODE_SPACING }`, `VERTICAL_NODE_SPACING = 120` (matches graphSlice). Returned UNCHANGED when: no `addNode`/`replaceTrigger` op (pure config edit never relayouts), any explicit `moveNode` op (respect chosen position), or the graph isn't a simple linear chain (branch/router/fan-in/disconnected preserved). The model is never trusted for positions. Placed in the apply path only — `applyPatchToDefinition` + `validateWorkflowPatch` stay pure (no test churn); preview is value-free so it needn't normalize.

**(B) Channel required-input rendered as plain text, not a combobox.** `slack:send_channel_message.channel` is a `combobox` + `optionsSource: "slack:channels"`, and `resolveRequiredInputControl` already maps `optionsSource` → combobox (AI-35E) — but the model's required-input entry was BARE (no `nodeId`/`field`), so `enrichRequiredUserInputs` had nothing to attach the `optionsSource` metadata to → plain text fallback; typing `channel1` then failed (a label isn't a channel id).
- Fix: new planner pass [`reconcileBareConfigValueEntries(inputs, patch)`](../../../services/ai/planner/enrichRequiredUserInputs.ts), wired into `planWorkflowFromPromptForAI` before `deriveMissingRequiredFieldInputs` + `enrichRequiredUserInputs`. When the patch has exactly ONE fillable required field (empty or `{{AI_FIELD:…}}`, any type, not already targeted) and there's exactly ONE bare `config_value` entry, it attaches that node/field identity to the bare entry. Enrichment then attaches the FieldMeta so the right control renders — combobox for `optionsSource`, select for static `options`, textarea/text otherwise. Generic over ActionMeta/TriggerMeta/FieldMeta — no provider branches; covers Slack channel/user, Gmail label, Sheets/Airtable/Trello/Notion pickers. Ambiguous (≥2 fillable fields or ≥2 bare entries) or null patch → left bare (documented limitation). Dedupes naturally with `deriveMissingRequiredFieldInputs` (a reconciled entry's now-attached field is in its `seen` set).
- Deterministic completion for picker fields: `evaluateDeterministicCompletion` requires the **selected option value** (`answer.value`, an id) for any field with `options`/`optionsSource`; a free-text-only answer → `model_replan(picker_requires_option)`. So a display label is never written where an id is required, and `completePlanWithRequiredInputs` writes the option id. The AI-35F bare-text server inference still targets only `text`/`textarea` fields, so a picker field is never filled from a bare text answer.

**Boundaries.** No planner provider routing change, no OpenAI/Anthropic routing change, no workflow-execution / billing / provider-metadata change, no general app-help assistant, no graph mutation before Apply (layout normalization happens at Apply-persist time). **Tests:** `normalizeLinearLayout.test.ts` (new — vertical stack, idempotent, anchor, all guards), `applyWorkflowPatch.test.ts` (+vertical layout on apply, +no-relayout on config edit), `enrichRequiredUserInputs.test.ts` (+reconcile attach/ambiguous/dedup/null-patch + reconciled→combobox), `deterministicCompletion.test.ts` (+picker requires option id, +free-text→picker_requires_option, +static-options).

### AI-35F — Deterministic completion for rendered required text controls

**AI-35F (2026-05-28).** Cost + UX. After AI-35E let a **bare `config_value`** (no `nodeId`/`field`) render as a text control, filling it and clicking Send details STILL re-planned through the model: live "Send me a Slack DM…" → answer "Hey" → `POST /ai/plan` → OpenAI follow-up **502** → "AI assistant is unavailable." It should have hit `/ai/complete` (no model).

**Root cause.** `evaluateDeterministicCompletion` rejected any blocking entry without `nodeId`/`field` (returned `model_replan: unmapped_required_input`). The bare control's answer carried no field identity, and nothing tried to map it to the pending patch's missing field — so every bare-control answer went to the model.

**Fix — try deterministic completion first; infer the target from the patch (generic, NOT Slack-specific).**
- **Client** ([`deterministicCompletion.ts`](../../../features/workflow-builder/ai/deterministicCompletion.ts)): a bare `config_value` answer is forwarded **untargeted** (`{ value }`) when the plan carries a `proposedPatch`; with no patch to infer against it re-plans (`no_target_node`). Indexing now keys staged answers by their stable control key so bare (`label::…`) and field-specific (`nodeId::field`) entries both resolve. `ResolvedRequiredInputAnswer.nodeId`/`field` made optional.
- **Server** ([`completePlanWithRequiredInputs.ts`](../../../services/ai/planner/completePlanWithRequiredInputs.ts)): new `collectFillableRequiredTextFields(ops)` walks the patch's pending `addNode`/`replaceTrigger` nodes and, via `ActionMeta`/`TriggerMeta`/`FieldMeta`, returns every **required `text`/`textarea` field** whose value is still fillable (empty / `[]` / `{{AI_FIELD:…}}`). A bare answer fills the field **only when exactly one candidate** uniquely matches; `applyAnswers` now returns a discriminated result so multiple bare answers or multiple candidates → `ambiguous_target`, and no candidate → `no_target_node` (unless a targeted answer already filled the sole candidate → redundant no-op, still succeeds). Inference runs BEFORE the workflow graph read, so an ambiguous/no-target bare answer short-circuits to re-plan without any I/O. `nodeId`/`field` on `CompletePlanRequiredInputAnswer` + the route `AnswerSchema` + the `lib/api/ai` request type all made optional.
- Still threads `WorkflowPatchSchema` + AI-5 preview + the apply-readiness gate; never auto-applies. The route already logs `requiredInputResolutionMode` via the AI-35D `aiCostDebug` hook, so the new `ambiguous_target` reason surfaces as `model_replan(ambiguous_target)`.

**Generic coverage.** Keyed off `FieldMeta.type ∈ {text, textarea}` + `required` — applies to Slack/Teams message text, email subject/body, HubSpot note text, Trello card title/description, HTTP URL/body, native text/string config. Id/enum/select/combobox/number/boolean fields are NOT inferred from a bare text answer (they render their own field-identified controls via AI-33 derivation + AI-22/AI-35E, or route to the model). AI-35B targeted answers (existing-node edit, derived empty fields) keep their explicit mapped path unchanged.

**Boundaries.** No planner provider routing change, no OpenAI/Anthropic routing change, no workflow-execution / billing / provider-metadata change, no general app-help assistant, no graph mutation before Apply. **Tests:** `deterministicCompletion.test.ts` (+bare-with-patch → deterministic untargeted, +bare-without-patch → no_target_node, +mixed targeted/bare), `completePlanWithRequiredInputs.test.ts` (+unique-text-field inference, +AI_FIELD placeholder, +ambiguous_target on ≥2 fields / ≥2 bare answers, +no_target_node), `useBuilderAi.deterministic.test.tsx` (+bare follow-up → completePlan not planWorkflow, +bare-no-patch → re-plan).

### AI-35E — React Agent required-input control parity

**AI-35E (2026-05-28).** Product-correctness + UX. Live regression: "Send me a Slack DM when I manually run this workflow" → the agent said *"What should the Slack DM say?"* but rendered it as a **static bullet with no input control**. Generalized: when a required input maps to ANY known field, the chat must render the same class of control the workflow builder config panel would — never a bullet.

**Root cause.** The panel's control-vs-bullet gate (`isControlRenderable` in `_BuilderAiPanelRequiredInputs.tsx`) admitted an entry as a control ONLY when it had node+field identity, static `options`, an `optionsSource`, or `kind === provider_choice`. A **bare `config_value`** — exactly what a null-patch plan emits for an unspecified message body (no `nodeId`/`field`, no options) — failed all four and dropped to the bullet branch. The `RequiredInputControl` renderer already had a text fallback for bare entries (its pre-existing backward-compat branch); the gate simply never routed them there. Separately, the renderer mapped only `select` / `optionsSource-combobox` / `text` — it had no `boolean` / `number` / `textarea` / `multi-select` branches, so a `textarea` message field rendered as a single-line input.

**Fix — one shared, metadata-driven control resolver (NO provider branches).**
- New pure helper [`resolveRequiredInputControl`](../../../features/workflow-builder/ai/resolveRequiredInputControl.ts) maps a `requiredUserInput` entry → a `RequiredInputControlKind` (`select` / `multiselect` / `combobox` / `boolean` / `number` / `textarea` / `text` / `bullet`) purely from the server-enriched FieldMeta hints (`options` / `optionsSource` / `fieldType` / `multiple`) + `kind`. `isRequiredInputControlRenderable` = `resolve(...) !== "bullet"`.
- `isControlRenderable` (gate) and `RequiredInputControl` (renderer) BOTH consume the resolver → they can't drift. The renderer gained `boolean` (checkbox), `number` (numeric input), `textarea` (multi-line), and `multiselect` (checkbox group, new optional `RequiredInputAnswer.values`) branches; static-options/`optionsSource`/text branches preserved.
- **Bullet is reserved for non-field clarifications** (`clarification` / `choose_trigger` / `variable_reference` with no field identity, no options). A `config_value` (or any node/field-identified entry) is a KNOWN config field → always a control; renderer-unknown types (`cron` / `string-array` / `file` / `keyvalue` / `router-routes` / options-less `select`) fall back to a safe text input.
- **No `date`/`datetime` FieldType exists** in `contracts/actionMeta.ts`, so date-shaped fields resolve to the closest available control (text) — documented; add a case when a date renderer lands.

**Deterministic-completion (AI-35B) guard.** The completion route writes the staged answer verbatim as a STRING, correct only for string-scalar renderers. `evaluateDeterministicCompletion` now routes `number` / `boolean` / array / object fields (multi-select already guarded) to the model planner, which builds the correctly-typed value; string-scalar + legacy/bare (`fieldType` absent) entries still complete with no model call.

**Boundaries.** No planner provider routing change, no OpenAI/Anthropic routing change, no patch-generation routing change, no workflow-execution / billing / provider-metadata change, no general app-help assistant, no graph mutation before Apply. Pure rendering + a client-side completion guard. **Tests:** `resolveRequiredInputControl.test.ts` (new — control mapping incl. cross-provider metadata-driven proof + bullet-only-for-clarification), `RequiredInputControl.test.tsx` (+text/textarea/boolean/number/multiselect branches + bare-config_value regression), `deterministicCompletion.test.ts` (+non-string-scalar bail), `BuilderAiPanel.test.tsx` (+AI-35E: bare-config_value renders a control, provider_choice select, clarification stays a bullet); textarea-field test ids updated across the BuilderAiPanel variants (`applyVsActivate` / `readOnly` / `retryableFailure`).

### AI-35B — Deterministic required-input completion + existing-node-edit fix

**AI-35B (2026-05-27).** Cost-control + correctness. After AI-35, the React Agent rendered the right required-input controls — but **every "Send details" re-ran the full Anthropic planner**, even when the user just filled fields the planner had already identified (the AI-COST-INCIDENT-1 class of waste). That same needless re-plan is what broke the existing-Slack-DM-recipient edit: the follow-up went to the model, the model call failed, and the user saw "AI assistant is unavailable."

**Root causes.** `useBuilderAi.submitFollowUp` always called `planWorkflow` (the model). There was no path to complete a pending patch from already-mapped answers; and `enrichRequiredUserInputs` (AI-35) made the existing DM node's `userId` field render a control, but submitting it still went through the model.

**Fix — a deterministic completion path (NO model call).**
- [`completePlanWithRequiredInputs`](../../../services/ai/planner/completePlanWithRequiredInputs.ts) (service): drops the staged answers into the pending patch's node config — or builds an `updateNodeConfig` for an existing-canvas node — then runs the SAME AI-5 preview + apply-readiness gate the planner uses. Returns an apply-ready `PlanWorkflowSuccess`, or `{ ok:false, reason }` (`no_target_node` / `preview_rejected` / `workflow_not_found` / `no_answers`) so the caller re-plans. Never invents a field (writes only the planner-identified `field` onto the identified `nodeId`), never bypasses `WorkflowPatchSchema` / preview, never auto-applies.
- [`POST /api/workflows/[id]/ai/complete`](../../../app/api/workflows/[id]/ai/complete/route.ts): thin route → service → returns the completed plan or `{ ok:false, code:"NEEDS_REPLAN", reason }`.
- Client [`completePlan`](../../../lib/api/ai.ts) + the pure [`evaluateDeterministicCompletion`](../../../features/workflow-builder/ai/deterministicCompletion.ts) eligibility helper.
- [`useBuilderAi.submitFollowUp`](../../../features/workflow-builder/hooks/useBuilderAi.ts): tries deterministic completion FIRST; on `NEEDS_REPLAN` (or transport error) falls through to the existing model planner unchanged (chain preserved).

**When the model still runs (re-plan):** free-text typed alongside the controls (may be a new instruction), a `provider_choice` (resolving it changes the trigger/action shape), a multi-select field, an unmapped/blocking field with no staged answer, or the server bouncing back `NEEDS_REPLAN` (e.g. the literal fill didn't preview-validate). Selecting a dropdown / filling a field never calls a model — only "Send details" does, and now only when interpretation is genuinely needed.

**Cost visibility:** reuses the AI-35D [`aiCostDebug`](../../../services/ai/events/aiCostDebug.ts) hook (extended with a safe `requiredInputResolutionMode` enum) — a deterministic completion logs `resolution=deterministic(config_values_applied)` (no model cost); a model re-plan shows as the existing `follow_up` planner cost line. No new debug/cost utility was created.

**Boundaries.** No OpenAI patch generation; default planner stays Anthropic/Sonnet; no provider-narrowing / provider-metadata / billing / workflow-execution change; deterministic completion is read-only (Apply is still an explicit user action). 33 new tests: `completePlanWithRequiredInputs.test.ts` (service incl. the Slack-DM-recipient `updateNodeConfig` + `preview_rejected` fallback), `deterministicCompletion.test.ts` (eligibility), `useBuilderAi.deterministic.test.tsx` (completePlan-not-planWorkflow + NEEDS_REPLAN fallback + provider_choice re-plan), `aiCostDebug.test.ts` (resolution field).

### AI-35 — React Agent QA fixes: provider-choice controls + Apply-not-ready drafts

**AI-35 (2026-05-27).** Four live-QA fixes Marcus found after AI-33/34C, all product-correctness + UX. The workflow PLANNER stays on Anthropic/Sonnet; nothing routes to OpenAI; no workflow-execution / activation-runtime-safety / provider-metadata / billing change.

**Root causes (audit).**
1. *Provider ambiguity rendered as static text.* The chat's `RequiredInputControlsBlock` only made interactive controls for entries with `nodeId+field`; an email-ambiguity question (kind `choose_trigger` / `clarification`, no node/field) fell into the bullet-list branch. AND those entries carried no `options`, so even a control would have had nothing to pick.
2. *Disconnected providers blocked Apply.* The planner's apply-readiness gate counted EVERY `requiredUserInput` entry (`requiredInputBlocking = merged.length > 0`), including `select_integration` ("Connect Stripe"). The AI-6 apply service itself never checked connection — so the block was purely this gate.
3. *Existing-node edit follow-up failed.* `enrichRequiredUserInputs` resolved node identity ONLY from the patch's `addNode`/`replaceTrigger` ops, so an `updateNodeConfig` edit on an existing canvas node produced un-enriched bullets; and the follow-up reconstruction's closing line ("Create the workflow…") biased the model toward ADDING a node instead of updating the existing one.
4. *Delete+plan controls static.* Same root cause as (1) for the provider choice; the channel/text questions in a fully-ambiguous null-patch turn remain bullets until a patch exists (see "Known limitation").

**Fixes.**
- **`provider_choice` required-input kind** (`types.ts`) + [`deriveProviderChoiceInputs`](../../../services/ai/planner/deriveProviderChoiceInputs.ts): deterministic, generic over a category table (email / calendar / drive / chat). Fires only on genuine ambiguity (≥2 catalog providers for the category, none named) and emits a structured entry with `category` + `options` (e.g. Gmail / Microsoft Outlook). `planWorkflowFromPromptForAI` merges it (de-duping the model's free-text version of the same question) into both the null-patch and patched paths.
- **Apply vs Activate** — [`isApplyBlockingRequiredInputKind`](../../../services/ai/planner/types.ts): `select_integration` is an ACTIVATION concern and no longer blocks Apply; `config_value` / `provider_choice` / `choose_trigger` / `variable_reference` / `clarification` still block (AI-20 safety floor). The planner gate + the UI gate (`_BuilderAiPanelChat.tsx`) both filter to blocking kinds; the UI renders disconnected-provider requirements as a non-blocking `builder-ai-setup-needed` note ("Connect these before activating — you can still apply the draft now").
- **Existing-node edits** — `enrichRequiredUserInputs` accepts the current canvas graph and resolves `updateNodeConfig` node identity from it (so an existing Slack-DM recipient field enriches to its real control); the planner threads `input.currentGraph` through. [`composeFollowUpPrompt`](../../../features/workflow-builder/ai/composeFollowUpPrompt.ts) closing is edit-aware (UPDATE existing canvas nodes for edits, only add when building from scratch) and cites a provider choice as "The email provider is Gmail."
- **UI control rendering** — `RequiredInputControlsBlock` now renders an interactive control for ANY entry that is field-enriched OR carries `options` / `optionsSource` OR is `provider_choice`.

**Apply = create/update the DRAFT graph. Activate = the readiness gate.** A disconnected-provider draft node applies cleanly and is marked not-ready; the builder's activation/readiness validation (unchanged) blocks running it until the integration is connected. This slice does NOT touch execution or activation-runtime safety.

**Known limitation (documented, not a regression).** In a FULLY-ambiguous turn the model returns a null patch (no nodes), so non-provider-choice config questions (Slack channel / message text) can't be enriched to controls until a patch exists — they render as bullets that turn into controls on the re-plan after the provider choice is resolved (or whenever the model proposes a patch). Closing this fully would require the planner to draft the action node even with an ambiguous trigger; deferred to avoid changing the R1/R7 prompt discipline this slice is told not to weaken.

**Tests.** 100 across 5 suites: `deriveProviderChoiceInputs.test.ts` (provider-choice derivation), `planWorkflowFromPrompt.test.ts` (+AI-35: select_integration non-blocking, config_value blocks, provider_choice surfaced/blocks), `enrichRequiredUserInputs.test.ts` (+updateNodeConfig via canvas), `composeFollowUpPrompt.test.ts` (+citation + edit-aware closing), `BuilderAiPanel.applyVsActivate.test.tsx` (provider-choice select control, setup-not-blocking, config_value still blocks). **Live UI flows (browser) are Marcus's to verify** — these are unit/RTL tests.

### AI-34C — OpenAI fast-tier intent classifier (additive only)

**AI-34C (2026-05-27).** Wires `gpt-4.1-mini` into the AI-31 narrowing-classifier seam as an OPTIONAL, ADVISORY, ADDITIVE intent classifier. The workflow PLANNER stays on Anthropic/Sonnet 4.6 — this slice never routes patch generation, planning, or Apply to OpenAI. It only changes which providers the Anthropic planner sees in its (narrowed) catalog, and only by ADDING.

**Why a classifier and not planner A/B (AI-34B Option 1).** The AI-31 seam (`NarrowingClassifierResult` with `source:"model"`/`modelTier`) was built for exactly this. A classifier is the lowest-risk first OpenAI experiment: add-only, can't remove a deterministically-narrowed provider, can't change the plan, fully reversible by a flag.

**Files.**
- [`modelNarrowingClassifier.ts`](../../../services/ai/planner/modelNarrowingClassifier.ts) — gating (`ENABLE_AI_MODEL_NARROWING_CLASSIFIER` + `ENABLE_OPENAI_PROVIDER` + `OPENAI_API_KEY`), a TINY no-secrets prompt (user request + provider ids + connected/canvas ids — NO full catalog, NO config fields, NO secrets, NO chat history), forced `classify_workflow_intent` tool, parse + unknown-id filtering, and `runModelNarrowingClassifier` which NEVER throws (any failure → `{result:null, outcome}`).
- [`resolvePromptClassifier.ts`](../../../services/ai/planner/resolvePromptClassifier.ts) — pure: `augmentNarrowingWithModelCandidates` unions valid candidates into the narrowed set (additive only); `resolvePromptClassifier` selects the model result (when it succeeded) or the AI-31 deterministic classifier, and computes the effective narrowing + counts.
- Grounding layer [`buildWorkflowPlanRequest.ts`](../../../services/ai/planner/buildWorkflowPlanRequest.ts) runs the (async) model classifier and threads its result + outcome onto the pure `WorkflowPlanPromptInput`. Both V1 + V2 builders consume it via `resolvePromptClassifier`.

**Additive-safety invariants (tested).** The union STARTS from the deterministic `providerIds` Set and only `.add`s ids present in the catalog: it can NEVER drop an explicit / connected / canvas / deterministic provider, NEVER shrink a `full-catalog` fallback, and a low-confidence or wrong model result can at worst add an extra valid provider. Live-confirmed safety case: for "send a Slack message when I get an email" the model returned only `gmail`, but the deterministic ambiguous-email layer still includes `microsoft-outlook` and the union can't remove it — so the AI-33 R1 "ask which email app" rule still fires.

**Telemetry (AI-31 fields, now real).** `classifierModelTier:"fast"` + `classifierConfidence` + `classifierProviderCount` (valid candidate count) when the model classifier ran; `finalProviderCount` = union size (> `deterministicProviderCount` when it added); `fallbackToDeterministic:true` on `model_failed`/`openai_not_configured`; `tierRoutingReason` ∈ {`classifier_model_succeeded`, `classifier_model_failed`, `openai_not_configured`} (else AI-31 vocabulary unchanged). `classifierUsed` keeps its AI-31 meaning (a classifier — deterministic OR model — produced a result). Telemetry stores COUNTS + ENUMS only — never raw classifier text / prompt / user request.

**Live verification.** `npx tsx scripts/trash/verify-model-classifier.ts` (with the two flags + key) returned `model_succeeded` for both sample prompts: "email→Slack" → candidates `gmail, slack`; "Stripe payment fails→Slack DM" → `stripe, slack`. No key printed.

**Boundaries.** Default planner stays Anthropic/Sonnet (`getModelForFeature("creation")`/`getModelForTier("strong")` → anthropic, unchanged). NO patch generation / Apply / preview on OpenAI. NO weakening of AI-30 narrowing, no-substitution (R1), or AI-22/AI-33 required-field discipline. No provider-metadata / billing / workflow-execution change. No general app-help assistant. `OPENAI_API_KEY` server-side only. `PLANNER_PACKET_VERSION` unchanged. 58 new tests (`modelNarrowingClassifier.test.ts`, `resolvePromptClassifier.test.ts`, `buildWorkflowPlanPrompt.modelClassifier.test.ts`); all 363 prior planner tests still green.

### Slice 4.BUILDER-NODE-IDENTITY-1 — System-owned node IDs + user-facing node names + planner reference integrity

**(2026-05-29).** Establishes the permanent V2 separation of node identity concerns:

- **IDs are owned by the system.** A persisted workflow definition contains only opaque, system-generated node/edge ids. Manual builder edits already used `crypto.randomUUID()` (`graphSlice`); the new piece is the AI path. AI-created ids (in `addNode` / `replaceTrigger` / `addEdge`) are PATCH-LOCAL scratch values the planner is free to choose (e.g. `trigger1`, `action1`) — they are remapped to fresh system ids at the apply boundary and never persisted.
- **Labels are owned by the user.** New optional `WorkflowNode.displayName` ([`contracts/workflowDefinition.ts`](../../../contracts/workflowDefinition.ts)) is a human label only — never identity (edges, patch refs, execution dispatch, persistence all key on `id`). **The AI never sets it** (no AI-suggested-names feature): [`materializeAiPatchNodeIds`](../../../services/ai/patch/materializeAiPatchNodeIds.ts) strips any `displayName` off AI-created nodes unconditionally.

**Materializer (`services/ai/patch/materializeAiPatchNodeIds.ts`).** Pure, deterministic (id generators injectable for tests). Single in-order walk mirroring `applyPatchToDefinition`'s sequential semantics: assigns a system id to every created node/edge, builds `nodeIdMap`/`edgeIdMap`, rewrites edge `from`/`to`, op `nodeId`s, and `{{patchLocalId.path}}` variable tokens inside config values (and `repairVariableReference.newReference`) to the assigned ids, strips AI `displayName`, and validates references: a node ref must be an EXISTING canvas id or a patch-local id introduced EARLIER in the same patch — else `UNKNOWN_NODE` (node-targeted ops) / `INVALID_EDGE` (edge endpoints); a within-patch duplicate patch-local id → `DUPLICATE_NODE_ID`. Wired into `applyWorkflowPatchForAI` BEFORE `validateWorkflowPatch` (the persistence boundary).

**Preview is NOT remapped (decision).** `previewWorkflowPatchForAI` validates the patch with the model's PROPOSED ids intact, so validation/reference error paths read back the ids the model reasoned about (no throwaway uuids leak into user/preview copy). The existing validator already rejects an invented update target (`UNKNOWN_NODE`), a missing edge endpoint (`INVALID_EDGE`), and duplicate ids — so Part C "preview rejects fake ids" holds without remap. Apply is always gated behind a passing preview, so the two never diverge in practice. Materialization is therefore apply-only.

**Friendly labels.** Pure [`getNodeDisplayName(node, meta?)`](../../../core/workflows/nodeDisplayName.ts) resolves custom → metadata `displayName` → title-cased type key (`send_channel_message` → "Send Channel Message") → kind fallback; never a raw id. Server callers use [`resolveNodeDisplayNameFromRegistry`](../../../services/ai/nodeLabel.ts) (synchronous registry lookup). Surfaced on the canvas card (title = node name, subtitle = provider), the validation drawer, run-history step rows (raw id only as a dev hover; unresolved → "a node that's no longer in this workflow"), and AI preview change summaries.

**Rename UI.** "Node name" input at the top of the config panel Setup tab → `graphSlice.renameNode(nodeId, value)` (trims; blank clears to default; no-op on unknown/unchanged; marks dirty). A pure state mutation — independent of the configSlice draft cycle and the AI planner (rename never calls a model). Persists with the draft and survives save → re-hydrate.

**Planner grounding.** `renderCurrentGraph` emits `- <id> ("<label>"): <kind> <provider>:<type>` (label resolved server-side); `CurrentGraphSnapshot`/`CurrentWorkflowGraphView` + the plan/complete route schemas carry optional `displayName` (read-only context the planner uses to refer to nodes by name). Two new `PLANNER_CONSTRAINTS` appended at the end of the array (indices preserved so the V2 `RULE_GROUPS` index map doesn't shift) and grouped into R2: (a) node ids are opaque, copy exact ids for existing-node ops, never invent `action1`/`trigger1`/`node1`, `displayName` is never a nodeId and never set by the planner; (b) edit-scope — trigger-only edits don't touch actions, action-only edits don't replace the trigger.

**Boundaries.** No execution-semantics change; no `WorkflowPatchSchema` / preview / apply bypass; planner stays OpenAI per AI-36 (Anthropic not called, no fallback); no billing/tasks change; no provider-metadata change; no general app-help assistant. `PLANNER_PACKET_VERSION` unchanged (`workflow-planner-v3`). Gates: tsc / eslint(`--max-warnings=0`) / lint:structure / lint:migrations clean; full sweep 14,605 passed / 17 skipped / 0 failed.

### AI-34A + AI-34B — OpenAI adapter (wired) + live verification

**AI-34A (2026-05-28).** Added OpenAI as a *supported, wired, tested* provider — the second real adapter — behind `ENABLE_OPENAI_PROVIDER` (default off). `OPENAI_MODELS` (`gpt-4.1` strong / `gpt-4.1-mini` fast) in [`core/ai/models.ts`](../../../core/ai/models.ts), provider-aware resolver `getModelForProviderTier`, cross-provider `getModelById` (telemetry), the Responses-API adapter [`openaiClient.ts`](../../../services/ai/modelClients/openaiClient.ts), and factory routing in [`createModelClient.ts`](../../../services/ai/modelClients/createModelClient.ts). **No behavior switch** — the default planner path uses `getModelForTier`/`getModelForFeature` (Anthropic) and never resolves an OpenAI model. Full setup + compatibility audit in [`openai-adapter-setup-and-audit.md`](./openai-adapter-setup-and-audit.md).

**AI-34B (2026-05-27, verification-only).** Confirmed the AI-34A adapter against the **real OpenAI API** before any routing slice — no source change to the adapter was needed.

- **Live probe.** [`scripts/trash/verify-openai-adapter.ts`](../../../scripts/trash/verify-openai-adapter.ts) drives the adapter through the NORMAL abstraction (`createModelClientForModel(getModelForProviderTier("openai", tier), apiKey)`) with a tiny forced-function-tool request, and prints ONLY safe fields (success/provider/modelId/tier/latency/usage/arg-shape — never the key). Gated on `ENABLE_OPENAI_PROVIDER=true` or `--force`. Run: `npx tsx scripts/trash/verify-openai-adapter.ts --tier=fast|strong`.
- **Result.** Both `gpt-4.1-mini` (fast) and `gpt-4.1` (strong) returned `function_call.arguments` as a valid JSON string that parsed to the expected shape; `status:"completed"` → `finishReason:"stop"`; `usage.input_tokens`/`output_tokens` mapped to `inputTokens`/`outputTokens`; no key leak (runtime guard + no-secrets test). The §D live-verification checklist in the setup doc is now satisfied.
- **Confirmed shape.** `instructions` + `input:[{role,content}]`, flat function tool `{type:"function",name,description,parameters}` + `tool_choice:{type:"function",name}`, response `output[].type==="function_call"` with `name`+`arguments`, `usage.input_tokens`/`output_tokens` — all as the adapter assumed. Pinned by a "live-confirmed shape" test in [`openaiClient.test.ts`](../../../tests/unit/services/ai/modelClients/openaiClient.test.ts).
- **Failure mapping.** missing key → `NOT_CONFIGURED` (factory); 401 invalid key → `PROVIDER_ERROR` not-retryable (the closed `ModelFailureCode` set has no `AUTHENTICATION_ERROR` — same as Anthropic); 429 → `RATE_LIMITED`; 5xx → `PROVIDER_ERROR` retryable; abort → `TIMEOUT`; fetch throw → `NETWORK_ERROR`. All unit-pinned; invalid-key NOT burned live.
- **Telemetry.** No new wiring needed — `getModelById("gpt-4.1*")` resolves `provider:"openai"`, so `recordAiPlanOutcome`'s `providerOf` will tag an OpenAI call as `model_provider:"openai"` + the OpenAI `model_name` + tier, comparable against Anthropic rows. The verification script does NOT write `ai_cost_events` — adapter verification is intentionally separate from planner telemetry.
- **Model ids.** `gpt-4.1` / `gpt-4.1-mini` are **hardcoded** in `OPENAI_MODELS` (not env-overridable). Both confirmed valid on the account. Recommendation: keep as-is for AI-34C; defer env overrides until a measured reason exists.
- **AI-34C recommendation — Option 1 (GPT fast-tier intent classifier).** Plug a real `gpt-4.1-mini` classifier into the existing AI-31 `safeRunNarrowingClassifier` seam ([`narrowingClassifier.ts`](../../../services/ai/planner/narrowingClassifier.ts) — `source:"model"`, `modelTier`), which already has the additive/advisory contract + deterministic fallback. Classifier is add-only and can never remove a deterministically-narrowed provider; the planner stays Anthropic/Sonnet. Lowest-risk first product experiment. Option 2 (GPT planner A/B for simple/narrowed prompts) is the more direct cost comparison but higher risk; Option 3 (keep dormant) only if verification had failed — it did not.

**Boundaries.** No default-planner switch, no patch-generation routing to OpenAI, no provider-narrowing change, no provider-metadata change, no workflow-execution / billing change, no general app-help assistant, no `OPENAI_API_KEY` exposure (server-side only, no `NEXT_PUBLIC_`), no migration.

### AI-33 — Ambiguous-provider clarification + complete required-field questions

**AI-33 (2026-05-28).** Planner-correctness slice fixing two live React Agent bugs Marcus hit with "When I get an email send a Slack message": (1) the agent silently assumed **Gmail** ("when a new email arrives in Gmail…") for the generic word "email"; (2) it asked which Slack **channel** but never asked what the **message text** should be. No provider-narrowing cost-logic change, no provider-metadata change, no UI change (AI-22's `RequiredInputControl` already renders the derived controls).

**Root cause A (Gmail assumption).** AI-30 narrowing correctly includes BOTH gmail + outlook as ambiguous-email candidates, so the catalog the model saw had both — but no prompt rule told the model to ASK which one. The model picked Gmail. Fix is a new R1 rule, not a narrowing change.

**Root cause B (missing text question).** Two layers failed: (i) `enrichRequiredUserInputs` only DECORATES questions the model already asked — it never DERIVES a question for a required field the model forgot; and (ii) the apply-gate keyed on `response.requiredUserInput.length` (model's list only). So if the model omitted `text` (or filled it with `{{AI_FIELD:text}}` without asking), no question reached the user. The deterministic `MISSING_REQUIRED_FIELD` check rejected the patch but gave no field-level control.

**Three new `PLANNER_CONSTRAINTS` (indexes 21–23), grouped in V2:**
- **R1 — ambiguous-category clarification (idx 21).** Generic capability words ("email", "calendar", "spreadsheet", "drive"/"file storage", "chat"/"message", "payment") are NOT a specific provider. When the user doesn't name the provider and >1 catalog provider satisfies the category, set `proposedPatch: null` + ask which provider (`choose_trigger`/`select_integration`/`clarification`). NEVER default "email"→Gmail, "calendar"→Google Calendar, "drive"→Google Drive, "chat"→Slack. Naming the provider ("a Gmail email", "send a Slack message") resolves it.
- **R3 — content-field completeness (idx 22).** Free-text content fields (chat/message body, email subject/body, doc body, comment) need user-specified content OR upstream-derivable content. "Send a Slack message" with no stated content → ask via `requiredUserInput`, don't invent. `{{AI_FIELD:...}}` is valid ONLY for asked-for generated/summarized content ("send a summary", "draft a reply") or content built from declared upstream outputs. Don't AI_FIELD to skip asking.
- **R7 — null-patch required-field completeness (idx 23).** When `proposedPatch` is null but specific nodes are intended, list EVERY missing required field of those nodes — not only the blocking item. (The observed bug: ambiguous email → null patch → only the Slack channel was asked.)

**Service-side safety net — `deriveMissingRequiredFieldInputs(patch, existing)`** in [`enrichRequiredUserInputs.ts`](../../../services/ai/planner/enrichRequiredUserInputs.ts). Walks the patch's `addNode`/`replaceTrigger` nodes; for every REQUIRED field that is empty in config (undefined/null/""/[], mirroring the validator's `isEmpty`) and not already asked, emits a bare `config_value` question. Conservative: a field filled with a literal, an upstream `{{ref}}`, OR an `{{AI_FIELD:...}}` is treated as the model's choice and NOT second-guessed (the R3 prompt rule governs AI_FIELD appropriateness). [`planWorkflowFromPrompt.ts`](../../../services/ai/planner/planWorkflowFromPrompt.ts) now merges `[...model.requiredUserInput, ...derived]`, enriches the union, and keys the apply-gate (`requiredInputBlocking`) on the MERGED list — so a forgotten required field both surfaces an actionable control AND blocks Apply.

**UI:** none. The derived `channel` entry enriches to a `slack:channels` combobox; the derived `text` entry enriches to a textarea free-text input — both already handled by AI-22's `RequiredInputControl`. A dedicated email-provider dropdown for the ambiguity clarification is a future UX nicety (today it renders as a bare bullet / composer answer).

**Tests added (24):** 9 derivation unit tests ([`enrichRequiredUserInputs.test.ts`](../../../tests/unit/services/ai/planner/enrichRequiredUserInputs.test.ts) — both-missing, literal/ref/AI_FIELD-as-filled, empty-string/array-as-missing, optional-not-derived, dedup, null-patch, unknown-meta, enrich-roundtrip); 8 prompt-rule tests ([`buildWorkflowPlanPrompt.test.ts`](../../../tests/unit/services/ai/planner/buildWorkflowPlanPrompt.test.ts) substance + [`buildWorkflowPlanPromptV2.test.ts`](../../../tests/unit/services/ai/planner/buildWorkflowPlanPromptV2.test.ts) R1/R3/R7 grouping + position); 6 orchestrator integration tests ([`planWorkflowFromPrompt.test.ts`](../../../tests/unit/services/ai/planner/planWorkflowFromPrompt.test.ts) — derive text, derive both, dedup, no-false-positive, ambiguity null-patch plumbing, no-regression apply-ready). Existing R1/R3/R7 title assertions updated for the renamed group headers.

**Boundaries.** No provider-narrowing cost change (narrowing still includes both email candidates — the planner just no longer picks one). No provider-metadata change. No no-substitution weakening (R1 strengthened). No full-catalog-fallback removal. No workflow-execution / billing change. No auto-apply (gate strengthened). No general app-help assistant. `PLANNER_PACKET_VERSION` unchanged (`workflow-planner-v3` — the rule additions don't change the packet's structural shape, only its rule content; the all-constraints test already covers presence).

### AI-32 — AI cost telemetry validation + prompt-cache readiness audit

**AI-32 (2026-05-28).** Audit / validation only — no source or behavior change. Doc at [`ai-cost-telemetry-validation-and-cache-audit.md`](./ai-cost-telemetry-validation-and-cache-audit.md).

**Telemetry path verified** against the real `ai_cost_events` schema (`20260525000001_ai_cost_events.sql`) + the recorder (`services/billing/aiCostEvents.ts`, `services/ai/events/recordAiRouteEvents.ts`): `prompt_version` + `input_tokens` are top-level columns; all AI-28 (per-section chars), AI-30 (narrowing), and AI-31 (tier-routing) fields ride in sanitized `metadata`. None of the ~30 attribution field names match the `sanitizeAiEventMetadata` denylist (confirmed including the `classifierConfidence` ≠ `/config/i` edge case). The path is sound; what's missing is a **live run** — this environment has no API key, so the §B queries + §C smoke are documented-but-not-executed.

**Validation queries (§B).** Runnable SQL for: avg input tokens by promptVersion (expect v3 ≪ pre-AI-30 38k baseline); narrowing effectiveness (included/total/omitted by mode+reason); narrowing enabled/fallback rates; tier-routing distribution (expect 100% strong); section-proportion estimation via chars × input_tokens; failure-vs-classifier-confidence correlation (the AI-32B decision query); cost-per-successful-apply.

**Manual smoke plan (§C).** 4 prompts (Slack-only → 2/26, Stripe+Slack → 3/26, ambiguous email → 4/26, broad → 26/26 fallback) with expected `metadata` per call + pass criteria (no raw prompt/arrays/secrets in metadata, plannerModelTier=strong, ~75% input-token reduction on narrowed calls).

**Prompt-caching feasibility (§D).** `cache_control` IS usable but the adapter sends `system` as a plain string — it must become a content-block array. The bigger blocker: the V2 packet puts the variable CONTEXT PACKET JSON at position 2 (right after the preamble), so there's no contiguous stable prefix today; the ~4.2k-token stable rules+guides are stranded after variable content. Making caching useful needs a packet reorder (`workflow-planner-v4`) that groups all stable content into a contiguous cached prefix — which trades against the AI-12C/AI-19 recency placement of JSON_OUTPUT_RULES and needs a live parse-failure A/B. **AI-30 didn't kill caching — it shifted the cache target from the catalog (now variable/small) to the rules+guides (still big/stable).** Warm-cache savings ≈ 40% further on cache-hit calls, but TTL is 5min so only bursty/multi-turn (AI-21 chains) benefit. Flags: `ENABLE_PROMPT_CACHING`, `ENABLE_CATALOG_CACHE` (the full-catalog-fallback case shares one cache key — an interesting sub-target).

**Model-classifier next-step (§E).** Defer to AI-32B, decision-gated on §B.6. Deterministic narrowing already covers common specific requests at zero cost. A Haiku classifier (~$0.002 + ~500ms/call) earns its keep ONLY if low-confidence fallbacks fail materially more than high-confidence requests. Safe design when it ships: run deterministic first, classifier only on `confidence: "low"`, UNION candidateProviders (add-only, never subtract — preserves every AI-30 safety invariant), fall back to deterministic on classifier failure.

**Recommendation (§F): live smoke + ship the AI-29→AI-31 arc first, THEN AI-32A prompt caching; AI-32B classifier decision-gated on telemetry.** Caching's payoff depends on a warm-cache hit rate we can't estimate without live multi-turn data, and the packet reorder carries a real recency-regression risk best A/B'd against live data — not guessed.

**Boundaries.** No behavior change. No caching wired. No classifier wired. No patch-generation routing change. No provider metadata / billing / workflow execution change. No general app-help assistant. No DB migration. `PLANNER_PACKET_VERSION` unchanged.

### AI-31 — Model-tier routing audit + deterministic classifier instrumentation

**AI-31 (2026-05-27).** Conservative slice — audit + observability seam, **no patch-generation routing change**. Documents the current strong-tier-only routing for `creation` / `editing` / `repair` features, ships a deterministic narrowing-classifier helper as the typed interface a future model classifier (AI-31B) will plug into, and adds 10 tier-routing fields to `PlannerPromptAttribution` so dashboards can decide whether shipping a Haiku classifier is worth it. **Patch generation stays on Sonnet 4.6.** `PLANNER_PACKET_VERSION` stays at `workflow-planner-v3` — packet shape unchanged.

**Audit doc.** [`planner-model-tier-routing-audit.md`](./planner-model-tier-routing-audit.md) captures: where tier is decided today (feature-default in `core/ai/models.ts`, per-call override in `planWorkflowFromPromptForAI`), what metadata is already recorded (`model.tier`, `modelName`, `tier` in event metadata), why we're NOT routing patch generation to Haiku in this slice (correctness rules R1 / AI-22 / AI-16 are the highest-leverage guarantees and AI-30 already cut 75% of the input bill at zero classifier cost), and what dashboards will need to decide AI-31B.

**Deterministic classifier helper.** [`services/ai/planner/narrowingClassifier.ts`](../../../services/ai/planner/narrowingClassifier.ts) returns `NarrowingClassifierResult` with `{intentType, confidence, candidateProviders, triggerHints, actionHints, broadOrAmbiguous, source, modelTier}`. Derivation rules (deterministic, pure):

- **intentType.** Repair keywords (`fix` / `broken` / `failing` / `stuck` / `crashed` / `error`) → `"repair"`; help keywords → `"help"`; canvas populated + provider mention → `"edit"`; empty canvas + provider mention → `"create"`; else → `"unknown"`. Repair beats create/edit when both could apply.
- **confidence.** Full-catalog fallback for broad/vague/no-mention/empty reasons → `"low"` (overrides connected/canvas — when narrowing CAN'T decide, classifier shouldn't claim it knows). Explicit canonical-id mention → `"high"`. Alias / ambiguous / connected / canvas / native-logic signals → `"medium"`. No signal → `"low"`.
- **candidateProviders.** Mirror of `narrowing.providerIds` — the deterministic helper NEVER drops a provider narrowing included. (A future AI-31B model classifier will return a SUPERSET; the wiring enforces "candidateProviders ⊇ narrowing.providerIds" before consuming.)
- **triggerHints / actionHints.** Empty arrays today; a future model classifier will populate.
- **broadOrAmbiguous.** `narrowing.mode === "full-catalog" && fallbackReason in {ambiguous_broad_request, complex_canvas_vague_edit, no_provider_mention, empty_user_request}`.
- **source / modelTier.** `"deterministic"` / `null`.

`safeRunNarrowingClassifier(input, narrowing)` is the seam — short-circuits on `ENABLE_AI_NARROWING_CLASSIFIER=false`, returns `null` on any thrown error (defense in depth for a future model classifier that CAN throw — network errors, JSON parse failures, timeouts).

**Attribution wiring.** `computePlannerAttribution` accepts optional `plannerTier` (defaults to `FEATURE_DEFAULT_TIER.creation` = `"strong"`), `classifier`, and `classifierAbsentReason`. Both V1 and V2 builders call `safeRunNarrowingClassifier` and pass the result through.

| Attribution field | Today's value |
|---|---|
| `plannerModelTier` | `"strong"` (workflow_creation default) |
| `classifierUsed` | `true` (deterministic helper runs by default) |
| `classifierModelTier` | `null` (deterministic) |
| `classifierConfidence` | from helper |
| `classifierProviderCount` | `candidateProviders.length` |
| `deterministicProviderCount` | `narrowing.providerIds.size` |
| `finalProviderCount` | equals `deterministicProviderCount` — classifier is ADVISORY only |
| `fallbackToDeterministic` | `false` (deterministic classifier never fails) |
| `fallbackToFullCatalog` | mirrors `providerNarrowingFallbackUsed` |
| `tierRoutingReason` | stable enum: `feature_default_strong` / `classifier_disabled` / `user_override_<tier>` / `narrowing_fallback_<reason>` |

`recordAiRouteEvents.ts` folds all 10 into `ai_cost_events.metadata` via the same channel AI-28/AI-30 use; field names pass the existing `sanitizeAiEventMetadata` denylist (pinned by test).

**Threading.** [`buildWorkflowPlanRequest.ts`](../../../services/ai/planner/buildWorkflowPlanRequest.ts) now resolves the model tier BEFORE building the prompt and threads `plannerTier: model.tier` into the prompt input — so a caller that passes `tier: "fast"` to `planWorkflowFromPromptForAI` would see `tierRoutingReason: "user_override_fast"` in attribution.

**Safety invariants pinned by tests.**
- Classifier output never removes a provider narrowing included.
- Explicit / connected / canvas providers always appear in the catalog regardless of classifier state.
- Low-confidence classifier does NOT narrow dangerously — broad request still falls back to full catalog.
- `finalProviderCount === deterministicProviderCount` (no narrowing-overlay drift).
- Disabled classifier doesn't change the catalog the planner sees.
- Classifier failure (synthetic) doesn't fail the plan — `safeRun` returns `null`.

**Rollback paths (all three flags independent).**
- `ENABLE_AI_NARROWING_CLASSIFIER=false` → no classifier; `classifierUsed: false`, `tierRoutingReason: "classifier_disabled"`. Behavior identical to AI-30.
- `ENABLE_AI_PROVIDER_NARROWING=false` → AI-30 full-catalog override.
- `ENABLE_STRUCTURED_PROMPT_PACKET=false` → AI-29 V1 prose packet (still gets AI-31 classifier wiring via shared `computePlannerAttribution`).

**Tests added.**
- 29 new in [`narrowingClassifier.test.ts`](../../../tests/unit/services/ai/planner/narrowingClassifier.test.ts) — source/modelTier, confidence derivation across all combinations, intentType derivation including repair-keyword precedence, candidateProviders safety invariants (never drops explicit/connected/canvas), broadOrAmbiguous, env-flag + safe-run + thrown-error fallback, determinism.
- 26 new in [`buildWorkflowPlanPrompt.tierRouting.test.ts`](../../../tests/unit/services/ai/planner/buildWorkflowPlanPrompt.tierRouting.test.ts) — plannerModelTier defaults + override, classifier wiring, advisory-only safety (finalProviderCount parity), tierRoutingReason vocabulary, fallback flags, no-leak (no raw prompt, no arrays, denylist guard), V1/V2 parity.
- 4 new in [`recordAiRouteEvents.test.ts`](../../../tests/unit/services/ai/events/recordAiRouteEvents.test.ts) — tier-routing fields fold into completed metadata, classifier_disabled reflected, fold into failed metadata, denylist guard.

**Boundaries preserved.** No DB migration. No patch-generation routing change. No prompt rule weakening. No catalog content change. No provider metadata change. No billing change. No workflow execution change. No forced-tool-use schema change. No parser / WorkflowPatchSchema / AI-5 preview / AI-9B apply / AI-20 gate / AI-22 enrichment / AI-30 narrowing semantics change. No general app-help assistant. No model classifier wired (interface only). `PLANNER_PACKET_VERSION` unchanged.

### AI-30 — Deterministic provider narrowing for the planner catalog

**AI-30 (2026-05-27).** The first major cost-reduction behavior change. AI-27 measured the planner catalog at 88% of the input bill (~33.6k tokens of ~38k); AI-30 sends only the SUBSET of providers a given request needs. No model classifier — fully deterministic, fully testable, no extra model call. `PLANNER_PACKET_VERSION` bumped to `"workflow-planner-v3"` so dashboards can A/B against v2 unconditionally. Behavior change is gated by `ENABLE_AI_PROVIDER_NARROWING` (independent of `ENABLE_STRUCTURED_PROMPT_PACKET`).

**Algorithm (`services/ai/planner/narrowProvidersForPlan.ts`).** Given `{userRequest, catalog, connectedIntegrations, currentGraph}`, the helper decides per request:

- **Always include**, never droppable: every provider whose canonical id or known alias appears in the request (`explicitlyMentionedProviderIds` / `aliasMatchedProviderIds`), every connected provider (`connectedProviderIds`), every provider on the current canvas (`canvasProviderIds`), and `native` (manual / schedule / delay / branch / filter / route / loop). The "always include native" rule is unconditional because the provider is tiny and its building blocks are useful in almost any plan.
- **Ambiguous capability tokens** add multi-candidate inclusions when the user didn't already name a specific provider: `"email"` → both `gmail` and `microsoft-outlook`; `"calendar"` → both `google-calendar` and `microsoft-outlook-calendar`. Suppressed when the user named one of them.
- **Full-catalog fallback** (helper returns `mode: "full-catalog"`) for the documented safety cases, each with a stable enum reason: `narrowing_disabled` (env flag off), `empty_user_request`, `empty_catalog` (registry failure), `ambiguous_broad_request` ("create an automation"-class phrasing with no provider mention), `complex_canvas_vague_edit` (≥4 canvas nodes + ≤4-word prompt with no mention), `no_provider_mention` (everything else with no provider signal).

**Alias table (per-provider, word-boundary-matched).** `gmail` / `google mail`; `outlook mail` / `microsoft outlook` / `ms outlook` / `office 365 mail`; `google calendar` / `gcal`; `outlook calendar` / `ms outlook calendar`; `google sheets` / `sheets` / `gsheet`; `google drive` / `gdrive`; `microsoft teams` / `ms teams` / `teams`; `microsoft excel` / `excel`; `onedrive` / `one drive`; `onenote` / `one note`; `slack`; `discord`; `stripe` / `stripe payment` / `stripe invoice`; `shopify`; `notion`; `trello`; `airtable`; `hubspot`; `mailchimp`; `monday.com` / `monday board` (bare "monday" deliberately excluded — too overloaded); `github`; `facebook` (bare brand only — `fb` / `meta` excluded for the same reason); `dropbox`. Logic-flow keywords (`manual`, `schedule`, `cron`, `delay`, `branch`, `route`, `loop`, etc.) count as a `native` mention so the helper doesn't fall through to the no-provider-mention catch-all when the user only asks for a native-side workflow.

**Wiring.** The helper is called from BOTH `buildWorkflowPlanPromptV1WithAttribution` (rollback path) and `buildWorkflowPlanPromptV2WithAttribution` (current default). A shared helper `computePlannerAttribution()` ensures both versions report narrowing metadata in the same shape.

**CONTEXT PACKET JSON (v3) gains three fields under `catalog`:**

```json
"catalog": {
  "providersIncluded": 2,
  "providersTotal": 26,
  "narrowingMode": "narrowed",
  "narrowingReason": null
}
```

`narrowingReason` is a stable enum from the helper's `NarrowingFallbackReason` (or `null` when narrowing succeeded).

**R1 narrowing-aware no-substitution clause.** A new entry appended at `PLANNER_CONSTRAINTS[20]` and grouped into R1 (top-of-prompt prominence): "The catalog above may have been narrowed to a subset of supported providers for cost reasons. The narrowing layer is best-effort: it tries to include every provider the user names, but a missed alias is always possible. If the user explicitly names a provider (or a capability that requires one) that is NOT in the catalog below, do NOT substitute another provider. Set proposedPatch to null, add an `unsupportedRequests` entry naming the requested provider, and add a `requiredUserInput` entry with `kind: \"select_integration\"` for that provider so the user can connect it. This is a defense-in-depth restatement of the top-of-list HARD RULE; the no-substitution prohibition ALWAYS overrides any cost-narrowing assumption. The CONTEXT PACKET JSON at the top of this prompt reports `catalog.providersIncluded` vs `catalog.providersTotal` so you can tell when narrowing was applied." The R1 title is updated to "R1 — SAFETY-CRITICAL (catalog-only use + no substitution, including under narrowing)".

**Attribution extensions (`PlannerPromptAttribution`).** Six new fields, all numeric / enum, none matching the `sanitizeAiEventMetadata` denylist:

- `catalogProvidersTotal: number` — full-catalog usable count BEFORE narrowing.
- `providerNarrowingEnabled: boolean` — false only when env-disabled.
- `providerNarrowingMode: "narrowed" | "full-catalog"`.
- `providerNarrowingFallbackUsed: boolean` — distinguishes "tried-and-bailed" from "disabled".
- `providerNarrowingReason?: string` — present when full-catalog; absent when narrowed.
- `providerNarrowingOmittedCount: number` — `total - included` in narrowed mode, `0` otherwise.

All six fields are folded into `ai_cost_events.metadata` via the same `promptAttributionMetadata` channel AI-28 introduced.

**Measured impact (live 26-provider catalog, char counts):**

| Scenario | Mode | Providers | catalogChars | Δ vs baseline | totalPacketChars |
|---|---|---:|---:|---:|---:|
| BASELINE — `"create an automation"` (full catalog) | full-catalog | 26/26 | 124,261 | — | 142,922 |
| `"Send me a Slack DM"` | narrowed | 2/26 | 16,809 | **−86.5%** | 35,464 (−75.1%) |
| `"Send a Slack DM when I get a Gmail email"` | narrowed | 3/26 | (slack+gmail+native) | ~−85% | ~35k |
| `"When Stripe payment fails send me a Slack DM"` | narrowed | 3/26 | 18,720 | **−84.9%** | 37,379 (−75.5%) |
| `"When I get an email send a Slack message"` | narrowed | 4/26 | 21,227 | **−82.9%** | 39,882 (−72.1%) |
| `"create an automation"` (broad) | full-catalog | 26/26 | 124,261 | 0% | 142,922 |
| `"add a step"` (vague, no canvas) | full-catalog | 26/26 | 124,261 | 0% | 142,908 |

For typical specific requests: **~85% reduction in catalog chars, ~75% reduction in total packet chars**. For the documented unsafe-to-narrow cases (broad generic, no provider mention): no reduction — correctly so.

**Rollback paths.** Two independent env flags:
- `ENABLE_AI_PROVIDER_NARROWING=false` → helper returns `mode: "full-catalog"` with `fallbackReason: "narrowing_disabled"`. V2/V3 packet shape unchanged. Reverts cost behavior only.
- `ENABLE_STRUCTURED_PROMPT_PACKET=false` → dispatcher routes to `buildWorkflowPlanPromptV1WithAttribution`. The V1 builder ALSO applies AI-30 narrowing (gated by the first flag), so combining both rolls back to the pre-AI-29 prose layout PLUS full-catalog.

**Tests added.**
- 58 new in [`narrowProvidersForPlan.test.ts`](../../../tests/unit/services/ai/planner/narrowProvidersForPlan.test.ts) — env flag, always-include invariants, alias coverage (25 aliases including word-boundary guards), ambiguous capability tokens, multi-provider scenarios from the spec, full-catalog fallback paths, decision metadata, determinism, `filterCatalogToNarrowed`.
- 24 new in [`buildWorkflowPlanPrompt.narrowing.test.ts`](../../../tests/unit/services/ai/planner/buildWorkflowPlanPrompt.narrowing.test.ts) — env-flag rollback (V1 + V2), CONTEXT PACKET narrowing fields, R1 clause prominence + position, attribution narrowing fields (omitted count, fallback-vs-disabled distinction), representative cost reductions (Slack-only / Stripe+Slack / canvas-edit / ambiguous broad), multi-provider no-substitution catalogs, determinism, no-leak (no raw prompt text in attribution, no arrays in attribution, dispatcher routes V2).
- 4 new in [`recordAiRouteEvents.test.ts`](../../../tests/unit/services/ai/events/recordAiRouteEvents.test.ts) — narrowing-attribution fields fold into completed + failed metadata, denylist passthrough, fallback reason forwarded only on full-catalog path.

**Pre-existing tests updated.** [`buildWorkflowPlanPromptV2.test.ts`](../../../tests/unit/services/ai/planner/buildWorkflowPlanPromptV2.test.ts): `workflow-planner-v2` literal assertions bumped to `workflow-planner-v3`; R1 group title assertion bumped to include ", including under narrowing". [`buildWorkflowPlanRequest.test.ts`](../../../tests/unit/services/ai/planner/buildWorkflowPlanRequest.test.ts): "grounds the prompt in the live AI-2 provider catalog" test request changed from a specific scenario to `"do something"` (forces full-catalog fallback so the "first usable provider's key appears in prompt" assertion holds independent of narrowing).

**Boundaries preserved.** No DB migration. No prompt rule weakening (R1's HARD no-substitution rule is unchanged; the new clause is additive defense-in-depth). No catalog content change (provider metadata in `integrations/_registry.ts` + `services/discovery/_registry.ts` untouched). No model selection change. No billing / task accounting change. No workflow execution change. No general app help assistant. No forced-tool-use schema change. No `parseWorkflowPlanResponse` / `WorkflowPatchSchema` change. No AI-5 preview / AI-9B apply / AI-20 gate / AI-22 enrichment change. No `sanitizeAiEventMetadata` denylist change. AI-26 persisted thread surface unchanged.

### AI-29 — Structured packet refactor, no behavior change

**AI-29 (2026-05-27).** Reorganized the v1 prose-heavy system message into a structured packet — same catalog, same safety semantics, same downstream validation, same forced tool-use. Bumps `PLANNER_PACKET_VERSION` from `"workflow-planner-v1"` to `"workflow-planner-v2"` so AI-28 cost dashboards can A/B by version. No provider narrowing (that lands in AI-30).

**Section layout (v2 system message):**

1. Preamble.
2. **CONTEXT PACKET (JSON, machine-readable)** — `{ task, promptVersion, mode, currentCanvas: {nodeCount,edgeCount}, connectedIntegrationCount, catalog: {providersIncluded, providersTotal}, constraints: {noSubstitution, noRequiredFieldGuessing, noMutationDuringPlan, nullPatchWhenBlocked, outputNamesMustBeDeclared, neverInventCredentials} }`. Counts only — no raw user request, no raw catalog payload, no integration account labels, no canvas node ids. Sanitizer-safe by construction.
3. **CRITICAL RULES (R1..R8 named groups)** — wraps every `PLANNER_CONSTRAINTS` string verbatim:
   - **R1** — SAFETY-CRITICAL (catalog-only + no-substitution; the no-substitution rule remains in the first group for prominence).
   - **R2** — CURRENT CANVAS GROUNDING.
   - **R3** — CONFIG GROUNDING (keys / value shapes / required-fill / display-label-vs-id).
   - **R4** — VARIABLE REFERENCES MUST USE DECLARED OUTPUTS.
   - **R5** — CONNECTED INTEGRATIONS (awareness + me-resolution).
   - **R6** — OUTPUT FORMAT (strict JSON via tool-use).
   - **R7** — UNKNOWN VALUES (`AI_FIELD` / `requiredUserInput` / null-over-partial).
   - **R8** — SAFETY HYGIENE (no secrets / low-risk bias / unsupported surfaced / no echo).
4. `TEMPLATE_FUTURE_NOTE` (unchanged from v1).
5. Provider catalog (`renderCatalog` — **byte-identical to v1**; all 26 providers).
6. Connected integrations (`renderConnectedIntegrations` — byte-identical to v1).
7. Current canvas (`renderCurrentGraph` — byte-identical to v1).
8. Optional cost awareness (unchanged).
9. Response schema description (same content as v1, kept locally in v2 file).
10. `PATCH_SHAPE_GUIDE` (unchanged).
11. `VALUE_SHAPE_RULES` (unchanged).
12. `JSON_OUTPUT_RULES` (unchanged).

**Files (new + modified):**
- [`services/ai/planner/buildWorkflowPlanPromptV2.ts`](../../../services/ai/planner/buildWorkflowPlanPromptV2.ts) — new file. Renders the CONTEXT PACKET JSON + grouped rules + reuses the v1 renderers verbatim. Returns the same `{ messages, attribution }` shape.
- [`services/ai/planner/buildWorkflowPlanPrompt.ts`](../../../services/ai/planner/buildWorkflowPlanPrompt.ts) — v1 implementation preserved + renamed entry point to `buildWorkflowPlanPromptV1WithAttribution`. New dispatcher `buildWorkflowPlanPromptWithAttribution` routes to v2 by default; falls back to v1 when `ENABLE_STRUCTURED_PROMPT_PACKET=false`. Internal renderers (`renderCatalog`, `renderConnectedIntegrations`, `renderCurrentGraph`, `renderCostAwareness`, `isUsableProvider`, `renderActionFlags`) promoted to `export` so v2 can reuse them — single source of truth for catalog/canvas/integration shape across both versions.
- [`services/ai/planner/types.ts`](../../../services/ai/planner/types.ts) — `PLANNER_PACKET_VERSION` bumped to `"workflow-planner-v2"`; new exported `PLANNER_PACKET_VERSION_V1 = "workflow-planner-v1"` for rollback identification.
- [`services/ai/planner/index.ts`](../../../services/ai/planner/index.ts) — re-exports the v2 entry point + the V1 constant.

**Safety preservation (the load-bearing claim):**
- `PLANNER_CONSTRAINTS` array is unchanged; v2 just renders it as 8 named groups instead of 19 flat bullets. Every constraint string appears verbatim inside its group.
- The no-substitution rule remains at array index 1 (within first 4) — the existing `PLANNER_CONSTRAINTS[i]` position assertion in `buildWorkflowPlanPrompt.test.ts` passes unchanged.
- Catalog content is byte-identical (`renderCatalog` is shared).
- Connected integrations: byte-identical render. Account labels + `me=<id>` still surface in the detailed section; CONTEXT PACKET JSON carries only the count.
- Current canvas: byte-identical render. Node ids + provider:type pairs still surface in the detailed section; CONTEXT PACKET JSON carries only `{nodeCount, edgeCount}`.
- `WorkflowPatchSchema`, `parseWorkflowPlanResponse`, AI-5 preview, AI-20 apply-readiness gate, AI-22 required-input enrichment — all unchanged.
- `propose_workflow_plan` forced tool-use schema unchanged.

**Cost / token impact (measured against live catalog with `scripts/trash/measure-planner-prompt.ts`):**

| Scenario | v1 chars | v2 chars | Δ chars | Δ ~tokens |
|---|---:|---:|---:|---:|
| S0 — no integrations, empty canvas | 140,729 | 141,904 | +1,175 | +317 (+0.83%) |
| S1 — Slack+Gmail, empty canvas | 140,767 | 141,942 | +1,175 | +317 |
| S2 — Slack+Gmail, 2-node canvas | 140,979 | 142,152 | +1,173 | +317 |
| S3 — 3 connected, 3-node canvas | 141,072 | 142,245 | +1,173 | +317 |

**~+0.83% delta** — the cost of the CONTEXT PACKET JSON (~10 lines), R1..R8 group titles, and the "user request follows" pointer. Expected; AI-29 trades a small token bump for machine scannability. **AI-30 remains the big cost-saving lever** (~70% reduction via provider narrowing).

**Attribution compatibility (AI-28 still works):**
- Same `PlannerPromptAttribution` shape (no fields added or removed).
- `packetVersion: "workflow-planner-v2"` on every v2 emission; `packetVersion: "workflow-planner-v1"` on rollback. `ai_cost_events.prompt_version` (top-level column) + `metadata.packetVersion` both populate.
- Catalog / canvas / connected counts identical to v1 for the same input (proven by an explicit cross-version assertion in `buildWorkflowPlanPromptV2.test.ts`).
- Per-section chars now reflect the v2 layout — `catalogChars` / `connectedIntegrationsChars` / `currentCanvasChars` unchanged (same renderers); `rulesChars` ~unchanged (same strings, different headers add ~600 chars); `totalPacketChars` bumped by ~1,175.

**Rollback path.** Single env flag: `ENABLE_STRUCTURED_PROMPT_PACKET=false` → routes through `buildWorkflowPlanPromptV1WithAttribution`. v1 implementation lives in the codebase through one slice (AI-30); AI-30 will delete it once v2 is observed in production. No DB migration to undo. No prompt content change to revert.

**Tests added (30 new in [`buildWorkflowPlanPromptV2.test.ts`](../../../tests/unit/services/ai/planner/buildWorkflowPlanPromptV2.test.ts)).** Packet version constants (2); CONTEXT PACKET JSON shape + counts + constraint flags + mode=create-vs-edit + providersIncluded==providersTotal (5); R1..R8 group titles + prominence of no-substitution + verbatim preservation of required-field discipline + display-label-vs-id + variable references + me-resolution (6); attribution.packetVersion + char-sum bound + catalog count parity vs v1 + canvas/connected count parity + determinism (5); env dispatch — default→v2, true→v2, false→v1, invalid→v2 (5); no-leak — CONTEXT PACKET never carries raw user text / account labels / canvas node ids + no secret-shaped substrings (4); v1 grounding sections preserved verbatim (3).

**Pre-existing tests all still pass.** 65/65 in `buildWorkflowPlanPrompt.test.ts` (the v1 substring assertions hold against v2 rendering because PLANNER_CONSTRAINTS strings are preserved); 20/20 in `buildWorkflowPlanPrompt.attribution.test.ts` (attribution shape unchanged; the version assertion uses the `PLANNER_PACKET_VERSION` constant which now resolves to v2); 28/28 in `recordAiRouteEvents.test.ts` (fixture-provided packetVersion strings round-trip cleanly).

**Boundaries preserved.** No DB migration. No prompt rule weakening. No catalog change. No model selection change. No billing / task accounting change. No workflow execution change. No general app help assistant. No provider narrowing — that's AI-30. AI-26 persisted-thread surface untouched. AI-AUDIT-1 contracts intact. `sanitizeAiEventMetadata` denylist unchanged. `WorkflowPatchSchema` + `parseWorkflowPlanResponse` + AI-5 preview + AI-20 gate + AI-22 enrichment + AI-25 retryable failures + AI-28 attribution + AI-9B apply — all unchanged.

### AI-27 + AI-28 — Planner prompt packet audit + cost attribution observability

**AI-27 (2026-05-27)** ([`docs/slices/phase-4/planner-prompt-packet-audit.md`](./planner-prompt-packet-audit.md)). Audit-only. Measured live planner prompt → **38,035 input tokens per plan call**, with the provider catalog accounting for **88.3%** of that (33,584 tokens across 26 providers / 286 actions / 62 triggers / 1,339 config fields / 2,250 outputs). Marcus's observed ~36k input tokens is confirmed within tokenizer variance. The single high-leverage cost lever is **provider narrowing** (deferred to AI-30); rule-compression savings are <3% and not worth touching the safety wording for. No reliability bugs, no contradictions in the no-substitution / required-field / disconnected-provider rule pairings. Recommended sequence: AI-28 (observability) → AI-29 (structured packet, no behavior change) → AI-30 (provider narrowing) → AI-31 (model-tier routing) → AI-32 (catalog cache + Anthropic prompt caching).

**AI-28 (2026-05-27).** Observability-only slice. Adds per-section attribution to every plan call's `ai_cost_events` row so AI-29 / AI-30 / AI-31 / AI-32 can be measured against a hard before/after baseline.

**New types** ([`services/ai/planner/types.ts`](../../../services/ai/planner/types.ts)):
- `PLANNER_PACKET_VERSION = "workflow-planner-v1"` — bumped on any planner packet refactor so dashboards can attribute cost / quality regressions to a specific version.
- `PlannerPromptAttribution` — `{ packetVersion, totalPacketChars, catalogChars, rulesChars, connectedIntegrationsChars, currentCanvasChars, userRequestChars, catalogProviderCount, catalogActionCount, catalogTriggerCount, catalogFieldCount, catalogOutputFieldCount, connectedIntegrationCount, currentCanvasNodeCount, currentCanvasEdgeCount }`. Char counts are exact (`String#length`); tokens are NOT stored — dashboards compute them as `inputTokens × (sectionChars / totalPacketChars)` against the authoritative top-level `inputTokens` column the model SDK already populates.
- `estimateTokensFromChars(chars)` — heuristic helper for situations where the model API hasn't returned `inputTokens` yet (range 3.5–4.2 chars/token for Anthropic English+JSON). Used for the audit script and dev tooling; production attribution uses real `inputTokens`.

**Why chars and not tokens.** The existing `sanitizeAiEventMetadata` denylist ([`services/billing/aiCostEvents.ts`](../../../services/billing/aiCostEvents.ts)) drops any metadata key matching `/token|secret|password|authorization|prompt|config|body|raw/i` as defense in depth against accidental access-token leakage. Naming a metadata field `catalogTokens` would silently drop it. Char counts have the same information content (linear in tokens, exact), avoid the denylist, and never tempt anyone to weaken the sanitizer to chase a label.

**Pipeline wiring.**
- [`buildWorkflowPlanPromptWithAttribution`](../../../services/ai/planner/buildWorkflowPlanPrompt.ts) — new sibling of `buildWorkflowPlanPrompt`; returns `{ messages, attribution }`. The original `buildWorkflowPlanPrompt` becomes a one-line wrapper for back-compat.
- [`buildWorkflowPlanRequestWithAttribution`](../../../services/ai/planner/buildWorkflowPlanRequest.ts) — new sibling of `buildWorkflowPlanRequest`; returns `{ request, attribution }`. Original stays as a wrapper.
- [`planWorkflowFromPromptForAI`](../../../services/ai/planner/planWorkflowFromPrompt.ts) — calls the WithAttribution variant; threads `attribution` into every result shape (`PlanWorkflowSuccess` + every `PlanWorkflowFailure` branch — `MODEL_FAILED`, `PARSE_FAILED`, `PREVIEW_UNAVAILABLE`, no-patch).
- [`recordAiPlanOutcome`](../../../services/ai/events/recordAiRouteEvents.ts) — reads `result.prompt`, forwards `packetVersion` as the top-level `promptVersion` column (already supported by `recordAiModelCallCompleted`) AND folds the full attribution shape into the metadata blob via `promptAttributionMetadata(prompt)`. Wired on the completed-call path AND on both failed-call paths (so MODEL_FAILED and PARSE_FAILED also carry the prompt size that produced them).

**No-leak guarantees.**
- Attribution carries only NUMBERS + the version string. Zero raw user text, zero raw catalog payload, zero secret-shaped values.
- Every attribution field name is verified against the sanitizer denylist by [`tests/unit/services/ai/planner/buildWorkflowPlanPrompt.attribution.test.ts`](../../../tests/unit/services/ai/planner/buildWorkflowPlanPrompt.attribution.test.ts) — a future rename that introduces a `token`/`secret`/`prompt`/`config` substring fails the test.
- `recordAiPlanOutcome` tests assert the dump never contains `ya29.` / `Bearer ` / `xox[bpsr]-` / `sk-ant-` / `accessToken` / `refreshToken` / `access_token` substrings even when attribution is present.

**No behavior change.** Same prompt content, same model selection, same provider catalog, same safety rules. Only the event ledger gets richer.

**Tests added (29 across 2 files).**
- `tests/unit/services/ai/planner/buildWorkflowPlanPrompt.attribution.test.ts` — 21 cases. Shape / determinism / sanitizer-safety / no-leak / estimator heuristic.
- `tests/unit/services/ai/events/recordAiRouteEvents.test.ts` — 8 cases under `AI-28 — prompt packet attribution`. promptVersion top-level column, metadata fold on completed + MODEL_FAILED + PARSE_FAILED, back-compat path (absent attribution), denylist guard.
- Pre-existing 173 planner tests + 27 recorder tests unchanged + still pass (back-compat verified).

**Dashboard queries (post-AI-28, ready to run).** Reproduced in [`planner-prompt-packet-audit.md`](./planner-prompt-packet-audit.md) §I — examples:
- Average input tokens per plan call by `promptVersion` (track refactor impact across AI-29 / AI-30 versions).
- Per-section token share: `metadata->>'catalogChars' / metadata->>'totalPacketChars'`.
- Catalog provider count distribution (sanity check after AI-30 narrowing lands).
- Cost per successful apply (funnel-aware: divide cumulative plan cost by apply count).

**Boundaries preserved.** No DB migration. No prompt content change. No provider catalog change. No model selection change. No billing / task accounting change. No workflow execution change. No general app help assistant. AI-26 persisted-thread surface unchanged. AI-AUDIT-1 contracts unchanged. `sanitizeAiEventMetadata` denylist unchanged.

### AI-AUDIT-1 + AI-26 — Strict Mode thread-load race + visibility

**AI-AUDIT-1 (2026-05-27)** ([`docs/slices/phase-4/react-agent-end-to-end-audit.md`](./react-agent-end-to-end-audit.md)). End-to-end audit of the React Agent triggered by Marcus's "chat clears on refresh" report. The audit traced the bug to one logic error in `BuilderAiPanel.tsx`'s thread-load `useEffect`: `loadedForWorkflowRef.current = workflowId` was assigned BEFORE the `getBuilderAgentThread` promise resolved. In React Strict Mode dev (`next.config.mjs` has `reactStrictMode: true`), the simulated unmount cleanup flipped `cancelled = true` on the first effect's in-flight fetch, and the simulated re-mount effect saw `ref === workflowId` and early-returned without re-fetching — the cancelled fetch eventually resolved but skipped `setMessages`. The audit verdict: persistence architecture is sound (planner doesn't see persisted history, persisted plan_results render read-only, sanitization is defense-in-depth, RLS is correct, no contradictions in the no-substitution / required-field / disconnected-provider rules); the only P0 was this one effect's ref ordering.

**AI-26 (2026-05-27).** Two-part fix in [`features/workflow-builder/panels/BuilderAiPanel.tsx`](../../../features/workflow-builder/panels/BuilderAiPanel.tsx) + [`_BuilderAiPanelMessageList.tsx`](../../../features/workflow-builder/panels/_BuilderAiPanelMessageList.tsx):

**Part A — Race fix.** `loadedForWorkflowRef.current = workflowId` is now assigned only AFTER `setMessages` has committed the rehydrated payload (success path) — never before the `await`. A cancelled or failed load therefore leaves the ref unchanged, and the re-mount effect's own fetch becomes the one that wins. A late dedup check (`if (loadedForWorkflowRef.current === workflowId) return` inside the async closure, after the await resolves) protects against the unlikely case where both StrictMode effects' fetches actually race to completion. The `cancelled` flag is preserved for the workflowId-change cleanup path.

**Part B — Visibility.** A new `historyLoadFailed` state on the panel drives a small `role="status"` notice (`data-testid="builder-ai-history-load-failed"`) rendered in `_BuilderAiPanelMessageList` in place of the intro hint when the chat is otherwise empty and the most recent load attempt threw. Copy: "Chat history couldn't be loaded. New messages will still work." The state resets to false on every workflowId transition so a previous workflow's failure doesn't shadow a new workflow's load. Planning / applying / clearing are unaffected — fail-open contract preserved.

**Visibility scope decision.** Persist-side failures (`appendBuilderAgentMessage` rejection) intentionally do NOT show a UI notice. Per the AI-23 fail-open contract: the dev console already carries the AI-25 migration-hint warn; a UI notice on every persisted message would be noisy (1-2 POSTs per plan turn, any of which could fail). Load-side failure is a single signal at panel mount and the user can act on it (refresh / report).

**Persisted-history semantics confirmed (Option A from the audit).** History remains display-only after refresh; no automatic resumed follow-up mode. A persisted needs-input plan_result renders as a read-only summary; the panel does not re-enable `followUpMode` from persisted state. Rationale: the persisted user prompt content is the rendered display text (may include staged-answer labels), reconstructing a clean `originalPrompt` is lossy; and the persisted `safePayload.requiredUserInput` items are display-only (no `field` / `nodeId` / `optionsSource` / `dependsOn`) by design. Going Option B (resumable follow-up) would require expanding the sanitizer allowlist (security surface) and the persistence schema. Option B is deferred and requires a separate slice + approval.

**Tests added (5 new in [`BuilderAiPanel.persistedThread.test.tsx`](../../../tests/unit/features/workflow-builder/panels/BuilderAiPanel.persistedThread.test.tsx))**. (1) StrictMode regression — `render(<StrictMode><BuilderAiPanel /></StrictMode>)` followed by `waitFor` for both the persisted user message and the read-only previous-turn summary. Pinned: prior to AI-26 this asserts FAILED; after AI-26 it passes. (2) No double-commit on the StrictMode cycle — `getAllByText` length === 1 after rehydration. (3) workflowId-change — switch the active workflow via `useGraphSlice.getState().hydrate("wf-2", ...)`, assert the new workflow's persisted thread loads and the old workflow's messages are gone; `mockGetThread` called once per workflow. (4) Load-failed notice replaces intro hint — and the composer + plan button remain operational. (5) Load-failed notice resets on workflowId transition. Also updated the existing "falls back to fresh chat on load failure" test to assert the new notice instead of the intro hint.

**Files NOT changed.** Sanitizer, persistence routes, repo, migration, planner, plan / apply route, hooks (`useBuilderAi`), `composeFollowUpPrompt`, all provider metadata, billing, workflow execution, general app help assistant. Persistence schema unchanged. Sanitizer allowlists / denylists unchanged. No DB migration. RLS unchanged.

---

## 0. Executive summary

**Recommendation: GO.** Build ChainReact's AI as a **grounded, tool-using ReAct agent that operates exclusively through a deterministic Workflow Patch layer** over the existing V2 metadata / graph / resolver / validation / execution systems. The model **proposes**; deterministic V2 code **validates and applies**. The agent never regenerates a whole-workflow JSON blob.

Three load-bearing decisions:

1. **One patch model for everything.** Create, edit, repair, template-instantiate, and template-customize all flow through the same `WorkflowPatch` → `validateWorkflowPatch` → `previewWorkflowPatch` → confirm → `applyWorkflowPatch` pipeline. There is exactly **one** way a workflow changes via AI, and it is small-diff, schema-validated, and reversible. No separate "AI-generated" vs "template-generated" unsafe path.

2. **Grounding, not generation.** Every capability of the model is bounded by real V2 sources of truth: the provider/action/trigger registries, FieldMeta schemas, OptionsSource resolvers, the live workflow graph, run logs, and the deterministic validators (`riskConfirmation`, `preconditions`, `testModeGate`, the billing gate). The model is **structurally unable** to invent a provider, action, field, or variable that V2 does not expose, because the apply path rejects anything the registries don't recognize.

3. **Template-aware from day one, template-dependent on no day.** Templates do not exist in V2 yet (confirmed: no table, no catalog, no contract). The architecture treats the future Template Catalog as one more first-class context source alongside manifests/ActionMeta/run-logs, and the patch model already has the operation slots for instantiation/customization — but AI v1 builds ground-up from metadata and ships with zero template dependency.

**What is strong and must not regress:** V2 already has the exact substrate an honest agent needs — frozen, validated metadata registries; a strict/soft variable resolver with an `AI_FIELD` construct reserved for exactly this; deterministic risk/test-mode/billing gates that fail closed; humanized error classification; and clean `core` / `services` / `repositories` / `integrations` boundaries. The AI layer is **additive** and must reuse these, not fork them.

**Real risks (addressed in this plan):** (a) cost blowup from dumping full catalogs/logs into context — mitigated by tiered models + progressive disclosure + caching; (b) silent side effects (sent messages, public links, deletes) — mitigated by reusing `testModeGate` + `riskConfirmation` + preview-before-apply; (c) hallucinated grounding — mitigated by registry-gated apply + deterministic validators outside the model; (d) template/AI architectural conflict later — mitigated by the single-patch-model rule.

---

## 0a. V2 grounding inventory (source-of-truth map)

Every AI claim about the system must trace to one of these real V2 artifacts. This table is the contract that keeps the agent honest. **Do not add a grounding source the agent can read that is not backed by a real file/table here.**

| AI grounding need | Real V2 source of truth | Access |
|---|---|---|
| Which providers exist + capabilities | `ProviderManifest`, `integrations/_registry.ts` (`getProvider`, `listProviders`, `providerSupports`) | `GET /api/providers` |
| Which actions exist + risk/fields/outputs | `ActionMeta` (`contracts/actionMeta.ts`), `services/discovery/_registry.ts` (`getActionMeta`, `listActionMetasForProvider`) | `GET /api/providers/[id]/actions` |
| Which triggers exist + payload shape | `TriggerMeta` (`contracts/triggerMeta.ts`) | `GET /api/providers/[id]/triggers` |
| Node config field definitions | `FieldMeta` (`contracts/actionMeta.ts`) — `type`, `required`, `dependsOn`, `optionsSource`, `options`, `numeric` | embedded in ActionMeta/TriggerMeta |
| Dynamic dropdown values (channels, labels, …) | `OptionsResolver` (`services/options/_registry.ts`, `getOptionsResolver`) | `GET /api/options/[source]?q&deps[parent]` |
| Connected integrations for a user | `repositories/integrations.ts` (`getActiveForExecution`, `listActiveByUser`) | repo |
| Live workflow graph | `WorkflowDefinition{nodes,edges}` (`contracts/workflowDefinition.ts`), `workflows.draft_definition` JSONB | `repositories/workflows.ts` |
| Variable references + availability | `workflow-engine/variables/resolveValue.ts` (`resolveSoft`/`resolveStrict`), `core/workflows/variableReferences.ts` (`parseReferences`) | core helpers |
| Upstream outputs a node can map | `ActionMeta.outputs` / `TriggerMeta.payloadShape` | metadata |
| Run history + per-step output/errors | `workflow_runs` (`steps` JSONB, `fatal_error`, `error_classification`), `repositories/workflowRuns.ts` | repo |
| Humanized failure explanation | `core/errors/humanizeActionError.ts` (`HumanizedError`) | core helper |
| Destructive/confirm-required detection | `services/workflows/riskConfirmation.ts` (`findConfirmationRequiredActions`) | service |
| Activation preconditions | `services/triggers/preconditions.ts` (`checkActivationPreconditions`) | service |
| Test-mode/dry-run safety | `services/execution/testModeGate.ts` (`decideTestModeBlock`) | service |
| Task budget / limits | `user_billing`, `deduct_tasks_if_available` RPC, `services/billing/executionBillingGate.ts` | service/RPC |
| Token scope (user vs workspace) | `ProviderManifest.tokenScope`, `core/encryption/tokens.ts` | manifest |
| **Template catalog (future)** | **does not exist yet** — `TemplateCatalog` contract to be defined in TEMPLATE-AI-1 | future |

**Hard rule:** if the model wants to assert a capability, it must be derivable from a row above. Anything else is a hallucination and the deterministic apply path must reject it.

---

## 1. Product goals

### 1.1 What the AI assistant should do
- **Create** workflows from natural language — ground-up from metadata, or (later) template-first when a strong match exists.
- **Edit** existing manually-built workflows via small validated patches ("add a step after this node", "change this Slack channel").
- **Inspect & explain** any existing workflow graph and any individual node in plain English.
- **Repair** invalid or failed workflows: bad edges, missing variables, disconnected integrations, schema-invalid configs, failed runs.
- **Answer questions** about workflow behavior and about run data/logs ("why did run X fail?", "what data does step 2 produce?").
- **Suggest improvements** (optimization engine): missing error handling, redundant steps, unmapped fields, cheaper structures.
- **Apply only validated, small patches** — never blind whole-JSON regeneration.
- **(Future) find/rank/instantiate/customize/explain/create reusable templates** through the same patch model.

### 1.2 What the AI must NOT do
- Must **not** invent providers, actions, fields, triggers, or variables that V2 does not expose (the grounding inventory is the boundary).
- Must **not** regenerate the whole workflow JSON to make a small change — it must preserve existing user work and emit a minimal diff.
- Must **not** cause external side effects (send a message, create a public link, delete data, publish social content, move money) without preview + the appropriate confirmation, reusing `riskConfirmation` + `testModeGate`.
- Must **not** silently apply destructive or high-risk changes.
- Must **not** store or surface raw hidden chain-of-thought.
- Must **not** depend on templates to function in v1.

### 1.3 Why AI should be central to ChainReactV2
ChainReact's defensible wedge is not "more integrations" — it is **a trustworthy automation architect that operates the real system**. Zapier/Make put the human in the role of node-by-node assembler and validator. ChainReact's AI should absorb the assembly, validation, repair, and explanation work while keeping the human in the role of *approver of intent*. The V2 substrate (frozen metadata registries, deterministic validators, strict resolver) is unusually well suited to a grounded agent: the model can be powerful precisely because it is fenced by code it cannot lie past.

### 1.4 Differentiation from Zapier / Make
- **Grounded, not guessy:** suggestions are constrained to real ActionMeta/FieldMeta/OptionsSource — competitors' AI features routinely hallucinate fields.
- **Repair, not just build:** the agent fixes *existing* workflows and *failed runs* using real run logs and `humanizeActionError`, not just greenfield generation.
- **Safe-by-construction edits:** every change is a small reviewable diff with a risk level and confirmation gate, reusing the same safety code that governs human edits.
- **Operator, not author-only:** the agent can explain run data, diagnose failures, and propose the minimal fix.

### 1.5 Quick (low-granularity) vs advanced (high-granularity) workflows
- **Quick/low-granularity:** "When I get a Stripe payment, post to Slack." The agent picks trigger + 1–2 actions, fills obvious fields, leaves uncertain text fields as `{{AI_FIELD:...}}` or asks one tight question, previews, applies. Optimize for **time-to-first-working-workflow**.
- **Advanced/high-granularity:** multi-branch flows with conditions (`native:if_then_condition`), routing (`native:router` + `router-routes`), data transforms (`native:format_transformer`), precise variable mappings, and per-field control. The agent works iteratively, one patch at a time, with the user steering each step.
- **How AI supports both:** the *same patch pipeline* serves both; granularity is a function of how many ops a patch contains and how aggressively the agent defaults vs asks. Low-granularity = larger first patch with sensible defaults + AI_FIELDs; high-granularity = many small surgical patches with explicit confirmations.

### 1.6 How templates fit the long-term vision (without being required day one)
Templates are reusable `WorkflowDefinition` blueprints. The AI is the intelligent layer that selects, customizes, explains, modifies, and generates from them. Long-term, a strong template match becomes a *faster, cheaper, safer* starting point than ground-up generation. But because templates don't exist yet and the `WorkflowDefinition` graph is already a fully portable unit, AI v1 ships ground-up and gains template-first creation later with **zero rework to the patch model** (template ops are reserved slots, §6/§7).

---

## 2. User experience model

### 2.1 Assistant surfaces
V2 has **no AI UI today** (confirmed). The natural plug-in points are the existing builder surfaces:

| Surface | Anchor in current V2 code | Role |
|---|---|---|
| **Chat-first assistant** (builder side panel) | sibling panel in `features/workflow-builder/WorkflowBuilder.tsx` | primary conversational create/edit/explain/repair |
| **Inline builder assistant** | `features/workflow-builder/panels/AddNodeMenu.tsx` | "add a step that…" → proposes a patch in-place |
| **Node-level assistant** | `features/workflow-builder/config-modal/ConfigModalShell.tsx` | "fill this field from the trigger", "what data is here?" |
| **Failed-run assistant** | `features/workflow-builder/panels/RunHistory.tsx` / `RunResultsPanel` | "explain this failure", "fix it" on a `workflow_runs` row |
| **Template recommendation assistant** (future) | AddNodeMenu / create flow | "find me a template for this" |

### 2.2 Intent → behavior matrix
| User says | Surface | Agent behavior |
|---|---|---|
| "Build this workflow for me." | chat | classify intent → (future: search templates) → ground-up build → preview patch → confirm |
| "Fix this failed workflow." | failed-run | read `workflow_runs.steps`/`error_classification` → `humanizeActionError` → propose repair patch → preview |
| "Why did this workflow fail?" | failed-run | read-only: explain from run logs; no patch unless asked |
| "Add a step after this node." | inline | one `addNode` + `addEdge` patch; ask only for fields it can't ground |
| "Change this Slack step to another channel." | node-level | `updateNodeConfig` patch; re-resolve `slack:channels` to validate the value |
| "What data is available from this previous step?" | node-level | read-only: `ActionMeta.outputs` / `TriggerMeta.payloadShape` of upstream nodes |
| "Can this workflow be improved?" | chat | optimization pass → ranked suggestions, each as a previewable patch |
| "Explain what this workflow does." | chat | read-only narration of the graph |
| "Find me a template for this." | chat (future) | `searchTemplates` → ranked list filtered by connected integrations |
| "Customize this template for my business." | chat (future) | `instantiateTemplate` → `customizeTemplate` patches |
| "Turn this workflow into a reusable template." | chat (future) | `saveWorkflowAsTemplate` |
| "Use this existing workflow as a starting point." | chat | clone → patch from the clone (hybrid path) |

### 2.3 When to ask vs propose vs refuse
- **Ask a follow-up** when: required field has no groundable value and no safe default; multiple plausible providers/actions match; a destructive/high-risk action is implied but underspecified; a required integration is disconnected.
- **Propose a patch immediately** when: intent is unambiguous and all required fields are groundable or safely defaultable (uncertain free-text → `{{AI_FIELD:...}}`, never empty per the no-empty-field rule).
- **Refuse / say unsupported** when: the requested provider/action/field does not exist in the registries; the request needs a capability V2 doesn't have. Refusal is explicit ("ChainReact doesn't currently support X") — **never** a fabricated node.

---

## 3. Agent capabilities

For each capability: **context needed → tools (§5) → risks → deterministic vs AI split.**

| Capability | Context needed | Key tools | Primary risk | Deterministic vs AI |
|---|---|---|---|---|
| **Workflow creation** | intent, provider catalog, connected integrations, (future) templates | `getProviderCatalog`, `getActionMeta`, `getTriggerMeta`, `resolveOptionsSource`, `validateWorkflowPatch` | over-complex / hallucinated nodes | AI: structure & field intent. Det: registry existence, schema, edges, billing. |
| **Workflow editing** | current graph, node schemas, available variables | `getWorkflowGraph`, `getNodeSchema`, `getAvailableVariables`, patch tools | clobbering user work | AI: which op. Det: minimal-diff apply, validation. |
| **Workflow repair** | current graph, validation state, run logs | `getWorkflowValidationState`, `getWorkflowRun`, `explainValidationErrors`, patch tools | masking root cause | AI: candidate fix. Det: validators confirm fix actually resolves. |
| **Workflow explanation** | current graph, metadata | `getWorkflowGraph`, `getWorkflowSummary`, `getActionMeta` | confident-but-wrong narration | AI: narration. Det: facts come from metadata, not the model. |
| **Run analysis** | run record, per-node logs, error classification | `getWorkflowRun`, `getNodeRunLogs`, `humanizeActionError` | leaking sensitive output | AI: summary. Det: redaction, error codes. |
| **Workflow data Q&A** | upstream outputs, run step outputs | `getAvailableVariables`, `getNodeRunLogs` | exposing PII | AI: answer. Det: `sensitive` flags drive redaction. |
| **Provider/action discovery** | full catalog | `getProviderCatalog`, `getActionMeta`, `checkRequiredIntegration` | recommending disconnected providers | AI: ranking. Det: existence + connection state. |
| **Template discovery** (future) | template catalog, intent | `searchTemplates`, `getTemplate` | suggesting templates needing unavailable providers | AI: relevance. Det: provider-fit check. |
| **Template ranking** (future) | intent, providers, connected integrations, complexity | `searchTemplates`, `getConnectedIntegrations` | ranking by hallucinated fit | AI: score. Det: provider/connection facts. |
| **Template instantiation** (future) | template, user inputs | `instantiateTemplate`, `validateTemplateAgainstUserContext` | applying with missing inputs | Det: input completeness + schema. |
| **Template customization** (future) | instantiated graph, intent | `customizeTemplate`, patch tools | drifting from a valid base | Same patch pipeline. |
| **Save as template** (future) | existing workflow | `saveWorkflowAsTemplate` | leaking secrets/PII into shared template | Det: strip credentials/values, parameterize. |
| **Validation & safety review** | candidate patch | `validateWorkflowPatch`, `classifyPatchRisk` | false sense of safety | **Fully deterministic.** |
| **Optimization / suggestion** | graph, run history | `getWorkflowSummary`, `getWorkflowRun`, patch tools | noisy/nagging suggestions | AI: ideas. Det: each idea is a real previewable patch. |

---

## 4. Architecture

### 4.1 Layering (respects [`project-structure-and-module-boundaries.md`](../../rules/project-structure-and-module-boundaries.md))
```
features/workflow-builder/ai/*          ← UI surfaces (chat panel, inline, node-level, run-analysis)
        │  (HTTP)
app/api/ai/*                            ← thin route layer (auth, streaming, request shaping)
        │
services/ai/agentOrchestrator.ts        ← ReAct loop: plan → call tools → observe → propose patch
services/ai/tools/*                      ← tool adapters (thin wrappers over existing services/repos)
        │
services/workflows/patch/*  (NEW)       ← validateWorkflowPatch / previewWorkflowPatch / applyWorkflowPatch
        │
EXISTING V2 (reused, not forked):
  services/discovery/_registry.ts        services/options/_registry.ts
  services/workflows/riskConfirmation.ts services/triggers/preconditions.ts
  services/execution/testModeGate.ts     services/billing/executionBillingGate.ts
  repositories/{workflows,workflowRuns,integrations,userBilling}.ts
  core/errors/humanizeActionError.ts     workflow-engine/variables/resolveValue.ts
  contracts/{actionMeta,triggerMeta,integration,workflowDefinition}.ts
core/ai/*                               ← pure AI helpers: model config, clients, prompt builders, token utils
```
- **`core/ai/` already exists** as the home for pure AI helpers (model config, clients, token-aware truncation) — mirror V1's centralization discipline (single shared client, centralized model IDs, never inline `new OpenAI()`).
- **`services/ai/`** owns the orchestrator + tool adapters (business logic, may call repos/services).
- **`services/workflows/patch/`** is the new deterministic patch engine — the single mutation path.
- **No provider-specific AI logic** anywhere; the agent is provider-agnostic because all provider facts come from the registries.

### 4.2 How the AI is grounded (mechanism, not aspiration)
- **Provider catalog** comes from `getProviderCatalog` → `listProviders` + discovery registry; the model receives a *compact* catalog (ids, displayNames, capabilities, action/trigger keys), not full schemas.
- **Node fields** come from real `FieldMeta` via `getNodeSchema`; the model never authors a field name — it picks from the schema.
- **Options** come from real `OptionsResolver` via `resolveOptionsSource`; a value for an options-backed field is validated by re-resolving, not trusted.
- **Variables** come from real upstream `ActionMeta.outputs` / `TriggerMeta.payloadShape` via `getAvailableVariables`, cross-checked with `parseReferences`/`resolveSoft`.
- **Run explanations** come from real `workflow_runs.steps` + `error_classification` + `humanizeActionError`.
- **Template recommendations** (future) come from real `TemplateCatalog` rows.
- **The apply path is the enforcement point:** `applyWorkflowPatch` re-validates against `WorkflowDefinitionSchema` + registries + handler Zod schemas. A hallucinated provider/action/field cannot survive apply.

### 4.3 AI_FIELD as the seam that already exists
The resolver already parses `{{AI_FIELD:fieldName}}` / `{{AI_FIELD:fieldName:innerExpr}}` (`workflow-engine/variables/resolveValue.ts`), strict-mode emits `{__aiField, fieldName, resolvedParam?}`, and `parseReferences` deliberately skips them as "an agent construct." This is the designed insertion point for agent-generated runtime values and **must remain the only mechanism** for AI-emitted dynamic field content. The patch model emits `AI_FIELD` for uncertain free-text rather than guessing literal values or leaving fields empty.

---

## 5. Agent tools / internal functions (conceptual — not implemented in this slice)

Each tool is a **thin deterministic adapter** over an existing V2 service/repo. The model calls tools; it does not reach into the DB. Tools return compact, redacted, model-shaped results.

**Workflow / context**
- `getWorkflowGraph(workflowId)` → `WorkflowDefinition` (from `repositories/workflows.ts` `draft_definition`).
- `getWorkflowSummary(workflowId)` → compact node/edge summary + validation flags (token-cheap).
- `getWorkflowRun(runId)` → `workflow_runs` row (status, steps summary, `fatal_error`, `error_classification`).
- `getNodeRunLogs(runId, nodeId)` → one step's output/error, **redacted** by `sensitive` output flags.
- `getAvailableVariables(nodeId)` → upstream outputs reachable at `nodeId`, from `ActionMeta.outputs`/`TriggerMeta.payloadShape` + graph topology.
- `getWorkflowValidationState(workflowId)` → deterministic validation result (schema + references + preconditions).

**Provider / catalog**
- `getProviderCatalog()` → compact list (`/api/providers` shape).
- `getActionMeta(providerOrKey)` → `ActionMeta` (from `getActionMeta`/`listActionMetasForProvider`).
- `getTriggerMeta(providerOrKey)` → `TriggerMeta`.
- `getNodeSchema(nodeType)` → `FieldMeta[]` + handler Zod constraints for one action/trigger.
- `resolveOptionsSource(provider, source, deps)` → `OptionItem[]` (from `getOptionsResolver` + resolver).
- `getConnectedIntegrations(userId/workspaceId)` → from `listActiveByUser`.
- `checkRequiredIntegration(provider)` → connected? (from `getActiveForExecution`).

**Validation / patch**
- `validateWorkflowPatch(patch)` → deterministic `PatchValidationResult` (§9).
- `previewWorkflowPatch(patch)` → candidate `WorkflowDefinition` + human-readable diff + risk.
- `applyWorkflowPatch(patch)` → writes `draft_definition` under optimistic concurrency; records audit.
- `explainValidationErrors(errors)` → maps validator/`humanizeActionError` codes to plain English.
- `estimateTaskCost(workflow)` → task estimate (today: 1/run flat via billing policy; structured for future per-node).
- `classifyPatchRisk(patch)` → `low|medium|high` + `requiresConfirmation` (driven by `riskConfirmation` + op kinds).

**Templates / future (stubs only until TEMPLATE-AI-*)**
- `getTemplateCatalog()`, `searchTemplates(intent, providers, category)`, `getTemplate(templateId)`, `validateTemplateAgainstUserContext(templateId, userId, workspaceId)`, `instantiateTemplate(templateId, inputs)`, `customizeTemplate(templateId, patch)`, `saveWorkflowAsTemplate(workflowId)`, `explainTemplate(templateId)`, `compareTemplateToWorkflow(templateId, workflowId)`.

**Tool design rules:** (1) tools are pure adapters — no model calls inside a tool; (2) every tool result is compact + redacted; (3) any tool that mutates state is in the patch family and goes through validation; (4) read tools are side-effect free and safe to call freely.

---

## 6. Workflow patch model

### 6.1 Why a patch model (not JSON regeneration)
The unit of change must be a **small, explicit, schema-validated diff over the existing `WorkflowDefinition`** so user work is preserved, changes are reviewable, risk is scoped, and rollback is trivial. Whole-JSON regeneration destroys node ids, breaks variable references, and erases manual tweaks — it is banned.

### 6.2 Envelope
```ts
interface WorkflowPatch {
  patchId: string;
  workflowId: string | null;        // null = applies to a freshly-created draft
  baseRevision: string;             // hash/revision the patch was computed against (optimistic concurrency)
  operations: PatchOperation[];     // ordered, applied atomically
  summary: string;                  // human-readable one-liner ("Add a Slack post after the Gmail trigger")
  rationale: string;                // user-visible reasoning summary — NOT raw chain-of-thought
  riskLevel: "low" | "medium" | "high";
  requiresConfirmation: boolean;    // derived deterministically, never by the model
}
```
- **Atomic:** all operations apply or none do.
- **References existing node ids:** ops name nodes; they never re-emit the whole graph.
- **Preserves untouched nodes:** anything not named by an op is byte-for-byte preserved.
- **Optimistic concurrency:** `baseRevision` mismatch → reject + re-plan (prevents clobbering concurrent edits, addressing the V1 "no save-failure reconciliation / no concurrency protection" gap noted in project memory).

### 6.3 Operations (discriminated union on `op`)
| Op | Shape (essentials) | Notes / grounding |
|---|---|---|
| `addNode` | `{ node: WorkflowNode }` (engine assigns id) | provider+type must exist in registry |
| `updateNodeConfig` | `{ nodeId, configPatch, replace? }` | merged into existing config; schema-validated |
| `removeNode` | `{ nodeId }` | cascades edge cleanup; never silent if it orphans downstream |
| `addEdge` | `{ edge: WorkflowEdge }` | endpoints must exist; respects label/branch rules |
| `removeEdge` | `{ edgeId }` | |
| `replaceEdge` | `{ edgeId, edge }` | repair invalid edges |
| `moveNode` | `{ nodeId, position }` | layout-only, always low risk |
| `renameNode` | `{ nodeId, label }` | **schema gap:** `WorkflowNode` has no `label` field today; requires adding `label?: string` (flagged §14) |
| `repairVariableReference` | `{ nodeId, fieldPath, newReference }` | validated via `parseReferences`/`resolveSoft` against candidate graph |
| `replaceTrigger` | `{ node: WorkflowNode(kind:"trigger") }` | enforces the ≤1-trigger invariant |
| `addCondition` / `updateCondition` | `{ ... }` | maps to `native:if_then_condition` + labeled edges |
| `addBranch` | `{ ... }` | maps to `native:router` + `router-routes` field + labeled edges |
| `addTemplateNode` (future) | `{ ... }` | |
| `instantiateTemplate` (future) | `{ templateId, inputs }` | expands into add* ops internally |
| `customizeTemplateInput` (future) | `{ ... }` | |
| `saveAsTemplate` (future) | `{ workflowId }` | parameterize + strip secrets |

### 6.4 Guarantees
- Schema-validated before apply (structure + per-node config + edges + variable references).
- Risk-classified + confirmation-gated.
- Preview + rollback supported (preview yields candidate definition; rollback = don't apply / restore prior revision).
- Human-readable `summary` + `rationale`.
- **Never silently deletes user work** — any op that removes/replaces user content surfaces in the preview and, if it orphans downstream nodes or touches a high-risk action, requires confirmation.
- Applies uniformly to: existing workflows, newly generated workflows, instantiated templates, template customizations. **One mechanism, no unsafe per-source path.**

---

## 7. Template-aware workflow creation model

Two creation paths, **one apply pipeline**.

### 7.1 Path A — Template-first (future, behind template availability)
1. User describes the workflow.
2. `searchTemplates(intent, providers, category)` → candidate templates.
3. AI ranks by intent fit, provider fit, complexity, and **connected integrations** (`getConnectedIntegrations`).
4. `validateTemplateAgainstUserContext` — flag templates needing disconnected/unavailable providers (ask the user to connect, never silently proceed).
5. Ask for missing template inputs.
6. `instantiateTemplate` → a candidate `WorkflowDefinition`.
7. Customize via `customizeTemplate` → ordinary patch ops.
8. `validateWorkflowPatch` → `previewWorkflowPatch` → confirm → `applyWorkflowPatch`.

### 7.2 Path B — Ground-up (AI v1 default)
1. User describes the workflow.
2. Retrieve provider/action/trigger metadata (`getProviderCatalog`, `getActionMeta`, `getTriggerMeta`).
3. Build the graph as `addNode`/`addEdge`/`updateNodeConfig` ops.
4. Validate fields/edges/variables; emit `AI_FIELD` for uncertain free-text.
5. `previewWorkflowPatch` → confirm → `applyWorkflowPatch`.

### 7.3 Path selection
- **Template-first** when a high-confidence match exists *and* its providers are connectable.
- **Ground-up** when the request is novel, highly customized, or unmatched.
- **Hybrid** when a template covers the base flow but needs patches — instantiate, then patch (same pipeline).
- Confidence threshold for preferring templates is an open decision (§14).

---

## 8. Safety and trust

The agent **reuses V2's existing safety machinery** — it does not invent a parallel one.

- **Confirmation requirements:** derived from `findConfirmationRequiredActions` (`riskConfirmation.ts`) — any node with `isDestructive` or `requiresConfirmation` forces typed `"CONFIRM"`. The patch's `requiresConfirmation`/`riskLevel` are computed from this + op kind, **never** by the model.
- **Destructive changes:** `removeNode`/`replaceTrigger`/removing edges that orphan work always surface in preview; destructive *actions* (per metadata) require typed confirmation.
- **Permission-sensitive & high-risk actions:** `riskLevel: "high"` (money-moving, irreversible, egress, `native:http_request`) always requires confirmation and is **blocked in test mode**.
- **External side effects:** sending messages, creating public links, deleting data, publishing social content, moving money — **never auto-applied**. Preview-then-confirm is mandatory; the metadata `riskLevel`/`isDestructive`/`requiresConfirmation` flags drive the gate.
- **Test mode / dry-run:** `decideTestModeBlock` (`testModeGate.ts`) blocks high-risk/external/destructive/confirmation-required/unknown actions in test runs and returns a mock output that intentionally omits fabricated ids so downstream resolution fails loudly. The agent offers a dry-run before any real run.
- **Preview before apply:** `previewWorkflowPatch` is mandatory for any mutation surfaced to the user.
- **Audit trail:** reuse the high-risk audit path (`buildHighRiskAuditPayload`, `notifyHighRiskWorkflowEvent` → `notifications` table) for AI-applied high-risk changes; add an AI patch audit log (§11).
- **"Why am I suggesting this?":** every patch carries a user-visible `rationale` (not raw CoT).
- **User override:** the user can edit or reject any patch; nothing applies without explicit action (auto-apply of low-risk is an open decision, §14).
- **No hallucinated capabilities:** registry-gated apply makes invented providers/actions/fields impossible to persist; the agent refuses unsupported requests explicitly.
- **Sensitive-data redaction:** `OutputMeta.sensitive` / `payloadShape` sensitive flags drive redaction in run-analysis and data-Q&A tools; tokens are never read by the agent (`core/encryption/tokens.ts` decryption stays inside handlers/resolvers).
- **Workspace/org boundaries:** `ProviderManifest.tokenScope` (`user` vs `workspace`) and RLS bound what the agent can see/act on; the agent operates within the caller's permission scope only.
- **Template safety (future):** never instantiate templates that require disconnected/unavailable providers without explicitly asking the user to connect them; `saveWorkflowAsTemplate` must strip credentials/PII and parameterize.

---

## 9. Validation pipeline

The model proposes; **deterministic code outside the model validates.** Sequence:

1. **Parse user intent** (AI) → structured goal.
2. **Inspect current workflow state** (`getWorkflowGraph`, `getWorkflowValidationState`).
3. **Retrieve provider/action/trigger metadata** (discovery registry).
4. **Retrieve template candidates** if useful (future).
5. **Select path** — template-first vs ground-up (§7).
6. **Build candidate patch** (AI emits ops).
7. **Structural validation** — apply ops → candidate `WorkflowDefinition` → `WorkflowDefinitionSchema` (≤1 trigger, edge endpoints exist, no self-loops, no dup edges, no dup ids).
8. **Node identity validation** — every `provider:type` exists in the discovery registry (rejects hallucinated nodes).
9. **Node config schema validation** — each node config against its handler Zod schema + `FieldMeta` (required/type/numeric/multiple).
10. **Options-backed field validation** — for fields with `optionsSource`, confirm the value via `resolveOptionsSource` (+ `dependsOn` deps present).
11. **Variable reference validation** — `parseReferences` + `resolveSoft` against candidate topology; references must point to upstream nodes whose `ActionMeta.outputs`/`TriggerMeta.payloadShape` actually expose the field.
12. **Required-integration validation** — `checkActivationPreconditions` / `checkRequiredIntegration`; disconnected → surface "connect X".
13. **Billing/task-limit validation** — `getUsage` + `estimateTaskCost`.
14. **Org/workspace permission validation** — `tokenScope` + RLS scope.
15. **Risk review** — `findConfirmationRequiredActions` + `classifyPatchRisk` → `riskLevel`, `requiresConfirmation`.
16. **Present preview** — `previewWorkflowPatch` (diff + candidate + risk + rationale).
17. **Apply only after confirmation when required** — `applyWorkflowPatch` under optimistic concurrency.
18. **Post-apply validation** — re-run structural validation on the persisted definition.
19. **Record audit trail** — AI patch audit + high-risk audit when applicable.

**Invariant:** steps 7–15 and 17–19 are **pure deterministic code**. The model contributes steps 1, 5, 6, and the prose in 16 only.

---

## 10. Cost-control model

- **Tiered models** (centralize IDs in `core/ai/models.ts`, single shared clients — never inline clients or hardcoded model strings):
  - *Small/fast* (e.g. Haiku class): intent classification, single-field fill suggestions, run-log summarization, template keyword pre-filter.
  - *Strong reasoning* (Opus/Sonnet class): multi-step workflow planning, repair, complex edits.
- **Cache frozen metadata:** provider catalog + ActionMeta + TriggerMeta are frozen at module load → serialize a compact catalog once and reuse; never re-dump full schemas per turn.
- **Cache template catalog summaries** (future) similarly.
- **Deterministic validators outside the model** — the agent calls `validateWorkflowPatch`; it does not "reason about validity" (cheaper *and* safer).
- **Summarize large workflows/logs:** `getWorkflowSummary` (compact) before `getWorkflowGraph` (full); cap run-log context to the failed step(s) + a bounded window.
- **Progressive disclosure:** fetch full ActionMeta/run detail only when a turn actually needs it (tool calls, not preloading).
- **Templates reduce cost:** a strong template match replaces multi-step generation with instantiate + small patches.
- **Billing/task metering hooks:** meter AI usage through the existing `user_billing` model with **distinct AI event types** (separate from workflow-execution tasks), so AI cost is attributable and capped. Reuse the atomic `deduct_tasks_if_available` pattern.
- **Token-aware truncation** in `core/ai/` for conversation history.

---

## 11. Data model / persistence

All new tables follow V2 conventions: `supabase/migrations/` (forward-only), **RLS enabled + explicit GRANTs** (enforced by `npm run lint:migrations` / `scripts/check-migration-rls.mjs`), snake_case columns mapped to camelCase in `repositories/`.

| Table (proposed) | Purpose | Notes |
|---|---|---|
| `ai_conversations` | conversation session (user/workspace/workflow scope) | RLS by `user_id`/workspace |
| `ai_messages` | user-visible messages only | **no raw chain-of-thought** |
| `ai_patch_proposals` | proposed patches | `patch jsonb`, `summary`, `risk_level`, `status: proposed\|previewed\|applied\|rejected`, `base_revision` |
| `ai_patch_audit` | applied-patch audit log | `proposal_id`, `workflow_id`, `applied_by`, `applied_at`, `result` |
| `ai_suggestion_feedback` | thumbs up/down on suggestions | trains ranking later |
| `ai_run_analysis` | cached run-failure summaries | keyed by `run_id` |
| `ai_cost_events` | AI task metering ledger | distinct from execution billing |
| `ai_events` | append-only observability / eval event ledger (§16) | event type + ids + timings + costs + statuses; **no raw chain-of-thought, no secrets/PII** |
| *(future)* template provenance | `created_from_template_id`, `saved_as_template_id` | columns on `workflows` |
| *(future)* `template_recommendations` | recommendations shown + chosen | ranking telemetry |

**Persistence rules:**
- **Store concise, user-visible reasoning summaries (`rationale`), never raw hidden chain-of-thought.**
- Store proposals, applied-patch audit, and explicit user confirmations.
- Run-analysis summaries are cached, not raw logs.
- Track template provenance (created-from / saved-as) when templates land.
- Track AI action cost / task metering.

---

## 12. Testing strategy

Follows [`docs/rules/testing-strategy.md`](../../rules/testing-strategy.md); tests live under `tests/unit/services/...` mirroring existing structure (e.g. `tests/unit/services/workflows/riskConfirmation.test.ts`).

**v1 (must-have):**
- **Patch validation** — structural, schema, edge, variable-reference (good + bad paths).
- **No hallucinated provider/action/field** — patches referencing unknown `provider:type`/fields are rejected at validate + apply.
- **Existing-workflow patching** — `updateNodeConfig`/`addNode`/`removeNode` preserve untouched nodes byte-for-byte; optimistic-concurrency rejection on `baseRevision` mismatch.
- **Failed-run repair** — given a `workflow_runs` failure, repair patch resolves the failing validator.
- **Variable-reference repair** — `repairVariableReference` produces a reference that `resolveSoft`/`resolveStrict` accept; regression tests for known resolver edge cases (AI_FIELD, array indexing, missing node/field).
- **High-risk confirmation** — destructive/confirmation/`high` actions force `requiresConfirmation`; typed `"CONFIRM"` enforced.
- **Destructive-action safeguards** — no removal/replace applies silently; orphaning surfaces in preview.
- **Provider-metadata grounding** — tool outputs match registry contents.
- **Run-log explanation** — `humanizeActionError` mapping correctness for engine + provider codes.
- **Data-flow correctness** — `getAvailableVariables` returns exactly the upstream outputs reachable per topology.
- **Permission boundaries** — agent cannot read/act outside the caller's RLS/tokenScope.
- **Cost-control/caching** — catalog cached, progressive disclosure honored, model tier selection.
- **Sensitive-data redaction** — `sensitive` outputs never appear in tool results.
- **Refusing unsupported requests** — explicit refusal, no fabricated node.

**Future (template slices):** template search/ranking, instantiation, customization via patches, user-template save/apply.

---

## 13. Phased implementation plan

Phase-4 production slices. Each is independently shippable, behind a feature flag, and reuses existing V2 services.

| Slice | Deliverable | Depends on |
|---|---|---|
| **4.AI-1** | This planning doc (doc-only). | — |
| **4.AI-2** | Metadata/context service + tool adapters (read-only): `getProviderCatalog`, `getActionMeta`, `getTriggerMeta`, `getNodeSchema`, `resolveOptionsSource`, `getConnectedIntegrations`, `getWorkflowGraph/Summary`, `getAvailableVariables`. Caching + compaction. | AI-1 |
| **4.AI-3** | `WorkflowPatch` schema + deterministic `validateWorkflowPatch` (steps 7–15) + `core/ai/` model config/clients. | AI-2 |
| **4.AI-4** | Read-only workflow explainer (chat surface, no mutations). | AI-2 |
| **4.AI-5** | `previewWorkflowPatch` + patch preview UI (diff render, risk, rationale). | AI-3 |
| **4.AI-6** | `applyWorkflowPatch` safe-apply flow (optimistic concurrency, confirmation gate, audit). | AI-5 |
| **4.AI-7** | Failed-run analysis + repair (run-log tools + `humanizeActionError` + repair patches). | AI-6 |
| **4.AI-8** | Ground-up workflow creation from prompt (Path B end-to-end). | AI-6 |
| **4.AI-9** | Template-aware architecture stubs + `TemplateCatalog` interface (no template runtime yet). | AI-8 |
| **4.AI-10** | Optimization/suggestion engine. | AI-8 |
| **4.AI-11** | AI cost/billing integration (distinct AI task events + metering UI). | AI-2 |
| **4.AI-12** | Owner AI observability — `ai_events` ledger + admin dashboards (§16). Event emission wired into the AI-4..AI-11 surfaces. | AI-4 |

**Future template-specific slices (do NOT implement in Phase 4 AI track):**

| Slice | Deliverable |
|---|---|
| **TEMPLATE-AI-1** | Template catalog contract + table + RLS/GRANTs. |
| **TEMPLATE-AI-2** | Template search/ranking (intent/provider/complexity/connected-integrations). |
| **TEMPLATE-AI-3** | Template instantiation (`instantiateTemplate`). |
| **TEMPLATE-AI-4** | Template customization via workflow patches. |
| **TEMPLATE-AI-5** | Save workflow as template (parameterize + strip secrets). |
| **TEMPLATE-AI-6** | User-created templates. |

**Sequencing guidance:** AI architecture begins before templates exist; it is template-aware from the start; AI v1 has zero template dependency; templates are not built inside AI-1; nothing in the AI design conflicts with templates later (single patch model is the guarantee).

---

## 14. Open decisions for Marcus

1. **Where the assistant appears first** — chat-first side panel, inline builder assistant, or both at launch?
2. **One global assistant vs multiple contextual assistants** — single agent with surface-aware context, or distinct create/edit/repair/run-analysis assistants?
3. **Confirmation threshold** — beyond the deterministic high-risk gate, what default risk threshold requires confirmation for *non*-high-risk edits?
4. **Auto-apply low-risk changes?** — may the agent auto-apply `low` risk, non-destructive patches (e.g. layout, field fill), or is every change preview-then-confirm?
5. **How much run data can AI inspect** — full step outputs (redacted) vs summaries only; retention window for run-log context.
6. **Org/workspace permission boundaries** — confirm the agent operates strictly within caller RLS + `tokenScope`; any workspace-admin "act on behalf" mode?
7. **AI pricing / task-metering model** — are AI interactions metered as tasks (and at what rate), separate from execution tasks?
8. **Storage retention** for AI conversations/proposals/audit.
9. **Templates: built-in only at first, or user-created from day one?**
10. **Template categories/tags** taxonomy.
11. **Can AI-created workflows be saved as templates?** (provenance + secret-stripping implications).
12. **How much template customization may AI do automatically** before requiring confirmation?
13. **Should AI prefer templates over ground-up** when confidence is high — and what is the confidence threshold?
14. **`renameNode` schema extension** — add `label?: string` to `WorkflowNode` (and surface in builder), or drop `renameNode` from v1? (Current `WorkflowNode` has no human label.)
15. **Cost-preview for AI/execution** — V2 has no pre-execution cost preview today (post-execution deduction only). Do we add one as part of AI-11, since the agent will want to show estimated task cost before apply/run?
16. **Observability access + retention** — who sees the AI dashboards (super_admin only vs all admins, via `core/admin/` capabilities), and what is the retention window for `ai_events` rows (§16)? Also: do we reuse a V1-style single `ai_events` table with typed event names, or split per concern?

---

## 15. Acceptance criteria

This planning doc is accepted only if it:

- [x] Makes AI **central** to ChainReactV2 (architect/operator, not side helper) — §0, §1.
- [x] Supports **existing workflow editing**, not just creation — §1, §3, §6.
- [x] **Avoids blind JSON regeneration** — patch model, §6.
- [x] Uses **metadata/schemas/logs/current graph state** as grounding — §0a, §4.
- [x] Has a **safe patch model** — §6.
- [x] Has **validation before apply** with deterministic validators outside the model — §9.
- [x] Includes **template-aware architecture** — §7, §0a.
- [x] Treats **templates as future first-class context** — §1.6, §0a, §7.
- [x] **Does not require templates for AI v1** — §1.6, §13.
- [x] Includes **cost-control** — §10.
- [x] Includes **tests** — §12.
- [x] Includes **phased implementation slices** — §13.
- [x] **Identifies open product decisions** — §14.
- [x] **Includes an owner/admin AI observability layer** (planned now, built later) — §16, slice 4.AI-12.

---

## 16. Owner AI observability & performance dashboard

Marcus must be able to answer, at any time: **Is the AI working? Where is it failing? What is it costing? Which features are used? Which suggestions are accepted? What should we improve next?** The architecture therefore includes an owner/admin observability layer. It is **planned now so AI-2..AI-11 emit the right events from the start**; the full dashboard ships as slice **4.AI-12**. Nothing here changes the v1 critical path — emission is fire-and-forget and append-only.

### 16.1 Principle — instrument the seams, not the model's mind
Every event is emitted at a **deterministic seam** the agent already passes through (tool call, patch proposal/validation/preview/apply, safety block, model call completion, user feedback). This mirrors V1's `agent_eval_events` discipline: a single append-only ledger + typed event names + a client/server emitter, never ad-hoc inserts.

**Redaction is mandatory and structural** (same rules as the AI tools in §0a/§8): events carry **event type, ids, timings, costs, statuses, enums, and aggregate counts only**. They MUST NOT contain raw hidden chain-of-thought, user secrets, tokens, PII, raw prompts, raw run-data values, or resolved node config. Where a free-text label is unavoidable (e.g. "most common unsupported request"), store a **redacted, length-capped summary**, never the raw user message.

### 16.2 Event taxonomy (`ai_events` ledger)
Append-only. Minimum columns: `id`, `user_id` (actor), `workspace_id?`, `workflow_id?`, `conversation_id?`, `event_type`, `feature` (creation | editing | repair | explanation | run_analysis | data_qa | discovery | template_*), `agent_version`, `model?`, `prompt_version?`, `status?`, `latency_ms?`, `tokens_in?`, `tokens_out?`, `cost_estimate?`, `cost_actual?`, `metadata jsonb` (redacted enums/ids/counts only), `created_at`.

| Event | Fires when | Key redacted fields |
|---|---|---|
| `ai_interaction_started` | user opens/sends to an AI surface | feature, surface, intent_class |
| `ai_tool_called` | agent invokes a §5 tool | tool_name, arg_shape (no values) |
| `ai_tool_failed` | a tool returns a typed error | tool_name, error_code |
| `ai_patch_proposed` | a `WorkflowPatch` is produced | op_types[], op_count, risk_level |
| `ai_patch_validation_failed` | `validateWorkflowPatch` rejects | failure_code (unknown_provider/action/field, invalid_config, missing_integration, invalid_variable_reference, resolver_failure, billing_limit) |
| `ai_patch_previewed` | preview rendered to user | risk_level, requires_confirmation |
| `ai_patch_applied` | patch persisted | op_count, risk_level |
| `ai_patch_rejected` | user rejects/abandons a proposal | reason_class (rejected/edited/abandoned) |
| `ai_user_feedback_submitted` | thumbs up/down / "fixed my issue" | rating, feature |
| `ai_safety_block_triggered` | confirmation required / destructive blocked / test-mode blocked / unsupported refused | block_type |
| `ai_model_call_completed` | an LLM call returns | model, latency_ms, tokens, cost |
| `ai_template_recommended` *(future)* | template suggested | template_id, match_score |
| `ai_template_instantiated` *(future)* | template instantiated | template_id |

**Hallucination catches** are derived, not a new event: a `ai_patch_validation_failed` with `failure_code ∈ {unknown_provider, unknown_action, unknown_field, invalid_variable_reference}` IS a hallucination catch by the deterministic validators (§9). The dashboard counts these directly — proof the grounding fence is holding.

### 16.3 Metrics the dashboard derives
Totals + by-feature usage; patch funnel (proposed → previewed → applied / rejected / edited / abandoned) and accept rate; validation failures by type; hallucination-catch rate; workflow-creation and repair success rates; failed-run-explanation usefulness (from feedback); feedback breakdown; model/prompt-version per request; tool-call volume + tool failure rates; token usage; estimated vs actual cost; latency by model/task; safety-block counts by type; most-common intents; most-common unsupported requests (product-gap signal); provider/action demand signals (what users ask for that doesn't exist yet); and, once templates land, template match rate, template-vs-ground-up ratio, and whether templates reduce cost / improve success.

### 16.4 Recommended owner/admin dashboard views (slice 4.AI-12)
Surfaced under `core/admin/` capability-gated admin UI (mirrors V1's `/admin` eval tab):
1. **AI usage overview** — volume, by feature, active users.
2. **Quality / success dashboard** — creation & repair success, accept rate, feedback.
3. **Cost dashboard** — estimated vs actual, per feature/model, task metering.
4. **Model performance dashboard** — latency, tokens, cost, success by model/prompt-version.
5. **Validation-failure dashboard** — failures by type + hallucination-catch rate (fence health).
6. **User-feedback dashboard** — thumbs, "fixed my issue", trend.
7. **Unsupported-request / product-gap dashboard** — what users ask for that doesn't exist (provider/action demand).
8. **Template effectiveness dashboard** *(future)* — match rate, template-vs-ground-up, cost/success delta.

### 16.5 Build sequencing
Define `ai_events` + the typed event-name union + a fire-and-forget emitter alongside the first agent surface (AI-4). Each later slice emits its events as it lands. The dashboards (4.AI-12) read aggregates only. The ledger is RLS-protected and admin-readable via `core/admin/` capabilities; retention window is an open decision (§14 #16).

---

## Appendix A — V2 constraints this plan respects (`docs/rules/`)
- [`provider-registry.md`](../../rules/provider-registry.md) — providers/actions/triggers come only from the registries; the agent never enumerates capabilities it didn't read.
- [`variable-resolver.md`](../../rules/variable-resolver.md) — single canonical resolver; `AI_FIELD` is the only AI-emitted dynamic-value mechanism.
- [`project-structure-and-module-boundaries.md`](../../rules/project-structure-and-module-boundaries.md) — `core/ai` (pure), `services/ai` (logic), `repositories` (data), no provider-specific AI logic.
- [`database-security.md`](../../rules/database-security.md) — new AI tables get RLS + encryption + tenant isolation; tokens never read by the agent.
- [`testing-strategy.md`](../../rules/testing-strategy.md) — good/bad paths, regression protection, deterministic-validator coverage.
- [`workflow-lifecycle.md`](../../rules/workflow-lifecycle.md) — patches respect activation preconditions; resources still created on activation, not on AI edit.
- [`workflow-builder-ui.md`](../../rules/workflow-builder-ui.md) / [`workflow-state-store.md`](../../rules/workflow-state-store.md) — AI surfaces compose into the existing builder + Zustand slices without forking layout.

---

## §16 addendum — AI-35D dev cost guard + per-request cost visibility (2026-05-28)

Following AI-COST-INCIDENT-1 (live QA cost ~$0.98 = 17 Sonnet planner calls,
fully explained, telemetry matched the Anthropic dashboard token-for-token),
AI-35D adds developer-facing cost visibility — observability only, no planner /
narrowing / OpenAI-routing / billing / execution / metadata change:

- **`core/ai/modelPricing.ts`** — pure cost estimator; Sonnet 4.6 priced ($3/$15),
  unknown models → `null` (never guessed).
- **`services/ai/events/aiCostDebug.ts`** — one safe, greppable `[ai-cost]` dev
  line per recorded React Agent model call. Gated by `ENABLE_AI_COST_DEBUG=true`
  AND `NODE_ENV !== "production"` (off by default). Full-catalog calls
  (fallback / ≥20k input tokens / ≥20 providers) escalate to `console.warn` with
  a "~3x a narrowed call" message — visibility only, no block.
- **`plannerInteractionKind`** (`initial_plan | follow_up | retry | unknown`) —
  threaded client→route→recorder, folded into `ai_cost_events.metadata` so
  follow-up full re-plans are attributable.
- **OpenAI classifier telemetry gap CLOSED** — the AI-34C classifier (gated off
  by default) now records a distinct `provider_discovery` `ai_model_call_*` row
  when it runs (counts/enums only).

Next cost reducers (separate slices): AI-35C prompt caching (P1), AI-35B
deterministic follow-up patch completion (P1), AI-35A OpenAI planner A/B (P2).
Full detail: `ai-cost-telemetry-validation-and-cache-audit.md` (AI-35D section).
