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
| AI-14+ | future | Owner/admin analytics route (needs an admin/owner auth gate) + dashboard UI, conversational/multi-turn UX, additional provider adapters, optimizer, templates, etc. (§13). |

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
