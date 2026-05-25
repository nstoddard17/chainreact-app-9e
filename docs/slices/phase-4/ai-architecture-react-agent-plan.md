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
| AI-9B+ | future | Chat/builder UI consuming the plan route, ground-up apply (confirm → AI-6 apply), AI observability (`ai_events`), additional provider adapters, optimizer, templates, etc. (§13). |

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
