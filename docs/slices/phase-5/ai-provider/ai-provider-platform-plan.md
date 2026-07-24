# AI-PROVIDER-PLAN-1 — ChainReact AI Provider: Platform AI Processing Capability Plan

**Type:** Planning / design only. **No source, migrations, tests, UI, or behavior changes in
this slice. Nothing pushed.**
**Date:** 2026-07-23
**Branch:** `v2-main`
**Author track:** AI-PROVIDER-PLAN-1 (owner-directed; four design-review rounds with Marcus
resolved 14 locked decisions, listed in §3)

**Source of truth (verified current state):**
[hermesAgentGatewayClient.ts](../../../../services/ai-guidance/gateway/hermesAgentGatewayClient.ts) (only outbound Hermes path; typed failures, never throws) ·
[gatewayConfig.ts](../../../../services/ai-guidance/gateway/gatewayConfig.ts) (env gating pattern, default OFF) ·
[gatewayResponseContract.ts](../../../../services/ai-guidance/gateway/gatewayResponseContract.ts) (strict fail-closed Zod normalizer) ·
[capabilities.ts](../../../../services/ai/reactAgent/capabilities.ts) (frozen capability allow-list registry) ·
[createModelClient.ts](../../../../services/ai/modelClients/createModelClient.ts) (first-party model clients, flag-gated) ·
[modelTypes.ts](../../../../core/ai/modelTypes.ts) (`ModelClient.generateStructuredJson`, `AiFeature`, `ModelResponseTool`) ·
[models.ts](../../../../core/ai/models.ts) (tier map fast/strong) ·
[aiCreditPolicy.ts](../../../../core/billing/aiCreditPolicy.ts) (`FEATURE_BASE_CREDITS`, unmapped→5-credit fallback) ·
[aiCreditGate.ts](../../../../services/billing/aiCreditGate.ts) (fail-closed pre-call gate, testMode skip) ·
[aiCostEvents.ts](../../../../services/billing/aiCostEvents.ts) (`ai_cost_events` ledger + metadata denylist sanitizer) ·
[file.ts](../../../../contracts/file.ts) (strict FileRef union, no bytes) ·
[fetchFileBytes.ts](../../../../core/files/fetchFileBytes.ts) (FileRef→bytes; provider_url throws) ·
[createWorkflowFilesStorageAdapter.ts](../../../../services/files/createWorkflowFilesStorageAdapter.ts) (canonical storage adapter) ·
[limits.ts](../../../../core/files/limits.ts) (advisory size guidance) ·
[actionMeta.ts](../../../../contracts/actionMeta.ts) (`ActionMetaSchema`, `FieldMeta`, `OutputMeta`, category enum) ·
[_handlerInventory.ts](../../../../services/execution/handlers/_handlerInventory.ts) + [_metaInventory.ts](../../../../services/discovery/_metaInventory.ts) (registration points) ·
[route.ts (native actions)](../../../../app/api/native/actions/route.ts) (connectionless catalog route) ·
[useUpstreamVariables.ts](../../../../features/workflow-builder/hooks/useUpstreamVariables.ts) (static-outputs variable source; `provider === "native"` branch) ·
[useNativeActions.ts](../../../../features/workflow-builder/hooks/useNativeActions.ts) + [useNodeMeta.ts](../../../../features/workflow-builder/hooks/useNodeMeta.ts) (native-only special-casing) ·
[_registry.ts (field renderers)](../../../../features/workflow-builder/config-modal/fields/_registry.ts) (exhaustive `FIELD_RENDERERS`) ·
[RouterRoutesField.tsx](../../../../features/workflow-builder/config-modal/fields/RouterRoutesField.tsx) (bespoke composite editor precedent) ·
[connectionInput.ts](../../../../features/workflow-builder/config-modal/readiness/connectionInput.ts) (`requiresIntegration:false` short-circuit) ·
[resolveValue.ts](../../../../workflow-engine/variables/resolveValue.ts) (arbitrary-path runtime resolution; single-template returns raw value) ·
[testModeGate.ts](../../../../services/execution/testModeGate.ts) (blocks only `requiresIntegration` or `riskLevel:"high"`) ·
[engineTypes.ts](../../../../services/execution/engineTypes.ts) (failure-code taxonomy) ·
[workflow-guidance route](../../../../app/api/accounts/[id]/ai/workflow-guidance/route.ts) (ordered-gate route template) ·
[workflowCostPreview.ts](../../../../services/billing/workflowCostPreview.ts) (cost-preview precedent, unsurfaced) ·
[sensitiveLiterals.ts](../../../../core/security/sensitiveLiterals.ts) (tokenize/rebind scrubber) ·
[importFuelPurchasesCsv.ts](../../../../integrations/motive/actions/importFuelPurchasesCsv.ts) (FileRef-consumer + TextDecoder pattern) ·
[formatTransformer.meta.ts](../../../../integrations/native/actions/formatTransformer.meta.ts) + [router.meta.ts](../../../../integrations/native/actions/router.meta.ts) (native meta templates) ·
[20260703000000_ai_cost_events_feature_add_workflow_qa.sql](../../../../supabase/migrations/20260703000000_ai_cost_events_feature_add_workflow_qa.sql) (feature-CHECK widening pattern) ·
[core-purity.test.ts](../../../../tests/structure/core-purity.test.ts) (core import fence)

---

## 1. Context

ChainReact V2 is live in production with ~40 native providers, a builder-assist AI (React
Agent / Hermes guidance), and a complete but **runtime-dormant** first-party model layer.
What it does NOT have is any AI that executes *inside a workflow run*. That gap blocks the
single largest class of automation our launch market asks for: systems with poor APIs, no
APIs, or manual exports — ADP payroll PDFs, bills of lading, invoices, settlement sheets,
fleet spreadsheets.

This plan designs the **ChainReact AI provider**: a first-class, connectionless provider
family (`ai:*`) whose launch actions are **Analyze Document** and **Transform Data**, built
on a generic **AI processing platform layer** (`AiProcessorClient`, a standard AI action
pipeline, an AI action registry, and a model-routing seam). Document intelligence is the
launch use case; the platform layer is the durable asset. The capability is comparable in
importance to the React Agent arc and is explicitly designed to grow (more input kinds,
more AI actions) without re-architecture.

Parent context: Hermes production topology
([hermes-agent-production-topology.md](../hermes-agent-production-topology.md)), the hosted
guidance brain plan
([hosted-hermes-workflow-guidance-brain-plan.md](../hosted-hermes-workflow-guidance-brain-plan.md)),
and the Setup/Advanced config UX tracker
([builder-config-setup-advanced-tracker.md](../builder-config-setup-advanced-tracker.md)).

---

## 2. Current codebase findings (verified)

Every claim below traces to a file inspected during this planning session.

### 2.1 AI stack — two subsystems, no runtime AI action

- **Hermes gateway path (production-active, advisory only).**
  [hermesAgentGatewayClient.ts](../../../../services/ai-guidance/gateway/hermesAgentGatewayClient.ts)
  is the only outbound path: `POST ${CHAINREACT_AI_GATEWAY_URL}/api/hermes-agent/guidance`
  with `Authorization: Bearer ${CHAINREACT_AI_GATEWAY_TOKEN}`, body `{ prompt }`. It never
  throws; every transport/parse failure maps to a typed code.
  [gatewayResponseContract.ts](../../../../services/ai-guidance/gateway/gatewayResponseContract.ts)
  normalizes with strict Zod and fails closed; gateway-reported `usage` is captured but
  explicitly **not trusted for billing**.
  [gatewayConfig.ts](../../../../services/ai-guidance/gateway/gatewayConfig.ts) reads
  `HERMES_AGENT_ENABLED` (default OFF) + URL/token/timeout; returns `null` when
  disabled/unconfigured; token never logged.
- **First-party model layer (dormant at runtime).**
  [modelTypes.ts](../../../../core/ai/modelTypes.ts) defines
  `ModelClient.generateStructuredJson(input): Promise<ModelResult>` with
  `ModelResponseTool` (JSON-Schema forced tool use) and a typed `ModelFailureCode` set;
  [models.ts](../../../../core/ai/models.ts) pins tiers (`fast` = claude-haiku-4-5, `strong` =
  claude-sonnet-4-6) and `MODEL_API_KEY_ENV`;
  [createModelClient.ts](../../../../services/ai/modelClients/createModelClient.ts) returns
  fail-safe clients (`NOT_CONFIGURED` without keys) behind default-off routing flags
  (`ENABLE_OPENAI_PROVIDER`/`ENABLE_OPENAI_PLANNER`; Anthropic disabled at runtime for
  cost). Callers always re-validate model text with Zod.
- **Governance + billing seams exist and are battle-tested.**
  [capabilities.ts](../../../../services/ai/reactAgent/capabilities.ts) is a frozen allow-list
  registry (capability id → allowedIntent/mode/creditFeature/auditKind) executed through
  `runAuthorizedCapability` with a persistent audit trail.
  [aiCreditGate.ts](../../../../services/billing/aiCreditGate.ts) is called **before** any
  paid model call, is fail-closed, skips charging when `testMode: true`, and is enforced
  only when `ENABLE_AI_CREDIT_ENFORCEMENT` is on (default OFF).
  [aiCreditPolicy.ts](../../../../core/billing/aiCreditPolicy.ts) maps features to base
  credits (`FEATURE_BASE_CREDITS`) with a conservative 5-credit fallback for unmapped paid
  calls and a strong-tier ×2 multiplier.
  [aiCostEvents.ts](../../../../services/billing/aiCostEvents.ts) records the `ai_cost_events`
  ledger with a metadata key-denylist sanitizer (`token`, `prompt`, `body`, `raw`, …).
- **No AI executes in workflow runs today.** There is no `ai` provider, no AI action
  handler, and no AI entry in
  [_handlerInventory.ts](../../../../services/execution/handlers/_handlerInventory.ts) /
  [_metaInventory.ts](../../../../services/discovery/_metaInventory.ts). All existing AI is
  builder-time assistance behind gated routes (template:
  [workflow-guidance route](../../../../app/api/accounts/[id]/ai/workflow-guidance/route.ts) —
  auth+membership → strict body → no-leak workflow check → availability check → credit gate
  → audited capability call).

### 2.2 File pipeline

- [contracts/file.ts](../../../../contracts/file.ts): FileRef is a strict Zod union —
  `provider_url` | `v2_storage` | `signed_url` — that structurally rejects
  bytes/base64/content keys. Outputs never carry blobs.
- [fetchFileBytes.ts](../../../../core/files/fetchFileBytes.ts) resolves a FileRef to
  `{bytes, name, mimeType, sizeBytes}`: `v2_storage` via an injected storage adapter
  ([createWorkflowFilesStorageAdapter.ts](../../../../services/files/createWorkflowFilesStorageAdapter.ts)),
  `signed_url` via plain fetch, and `provider_url` **intentionally throws**
  (`UnsupportedProviderFetchError`) — consumers surface a structured "add the provider's
  download step first" config error (pattern:
  [importFuelPurchasesCsv.ts](../../../../integrations/motive/actions/importFuelPurchasesCsv.ts),
  Slack `uploadFile`).
- Storage: Supabase bucket `workflow-files`, path
  `<userId>/<workflowId>/<runId>/<nodeId>/<file>`, metadata rows in `workflow_files`,
  default 24 h TTL with end-of-run + nightly cleanup; size limits are **advisory**
  ([limits.ts](../../../../core/files/limits.ts), default 25 MB guidance).
- **No parsing libraries are installed.** `package.json` has no PDF/DOCX/XLSX/CSV parser;
  the only bytes→text path is `TextDecoder`
  ([importFuelPurchasesCsv.ts](../../../../integrations/motive/actions/importFuelPurchasesCsv.ts)).
  Text extraction for documents is greenfield.

### 2.3 Action architecture & builder

- Node anatomy = 4 co-located files (handler, `.schema.ts` strict Zod, `.meta.ts`) + 2
  registry edits ([_handlerInventory.ts](../../../../services/execution/handlers/_handlerInventory.ts),
  [_metaInventory.ts](../../../../services/discovery/_metaInventory.ts)). Handlers throw;
  the engine classifies ([engineTypes.ts](../../../../services/execution/engineTypes.ts):
  `HANDLER_FAILED`, `TRANSIENT_PROVIDER_ERROR` on `TimeoutError`/`AbortError` names,
  `PLAN_FEATURE_REQUIRED`, …). The engine pre-resolves all `{{…}}` templates before
  dispatch.
- **Connectionless plumbing is hardcoded to the `"native"` provider string**:
  [app/api/native/actions/route.ts](../../../../app/api/native/actions/route.ts) serves
  `listActionMetasForProvider("native")`;
  [useNativeActions.ts](../../../../features/workflow-builder/hooks/useNativeActions.ts),
  [useNodeMeta.ts](../../../../features/workflow-builder/hooks/useNodeMeta.ts) and
  [useUpstreamVariables.ts](../../../../features/workflow-builder/hooks/useUpstreamVariables.ts)
  branch on `provider === "native"`; the ActionPicker renders a flat native section.
  [connectionInput.ts](../../../../features/workflow-builder/config-modal/readiness/connectionInput.ts)
  short-circuits on `requiresIntegration: false` and is provider-agnostic (that part is
  free for a new connectionless provider).
- **Outputs are static.** `OutputMeta` is hand-declared in `.meta.ts`;
  [useUpstreamVariables.ts](../../../../features/workflow-builder/hooks/useUpstreamVariables.ts)
  reads only `meta.outputs`/`payloadShape`. There is **no config-derived output mechanism**.
  However, at runtime
  [resolveValue.ts](../../../../workflow-engine/variables/resolveValue.ts) walks arbitrary
  paths against live variables (a single-reference template like `{{node.rows}}` returns
  the **raw value**, not a string), and the builder's variable validator short-circuits OK
  on `object` outputs without declared children — so hand-typed deep refs work today; the
  picker just can't offer them.
- Bespoke composite editors have precedent: `native:router` ships a dedicated FieldType
  (`router-routes`) + [RouterRoutesField.tsx](../../../../features/workflow-builder/config-modal/fields/RouterRoutesField.tsx)
  + a Save-gating validator, registered in the exhaustive
  [FIELD_RENDERERS](../../../../features/workflow-builder/config-modal/fields/_registry.ts) map.
- The category enum in [actionMeta.ts](../../../../contracts/actionMeta.ts) has **no `ai`
  value** today (messaging…transform, scheduling, other). Adding one is additive.
- [testModeGate.ts](../../../../services/execution/testModeGate.ts) blocks only
  `requiresIntegration: true` or `riskLevel: "high"` — connectionless low-risk actions run
  in Test/Run-Now.
- **No loop node exists.** The engine executes each node at most once per run; labeled
  edges + `branchTaken` are branch-select, not fan-out. Array iteration is a net-new
  engine capability.
- **Every registered action already declares a typed, rich input surface** (FieldMeta:
  label/type/required/helpText/options/defaults + strict config schema), enumerable via the
  discovery layer — the foundation for "transform into another action".
- Cost-preview precedent exists but is unsurfaced in the builder:
  [workflowCostPreview.ts](../../../../services/billing/workflowCostPreview.ts) +
  `GET /api/workflows/[id]/cost-preview`.

---

## 3. Product / model decision

**What this is:** ChainReact's own AI, shipped as a first-class **provider family** in the
builder — connectionless (no OAuth, no credential), branded "ChainReact AI", executing
inside workflow runs, always billed through the existing AI-credit system. Launch actions:

- **`ai:analyze_document`** — FileRef/text in; modes **summarize · extract_fields ·
  extract_rows · classify · answer_questions**; structured validated output.
- **`ai:transform_data`** — structured data in; **primary path: transform into another
  ChainReact action's input shape** (destination schema derived from that action's typed
  metadata); secondary path: user-defined destination schema.

**What this is deliberately NOT:**

- Not a document feature. The abstraction (`AiProcessorClient`, tasks, registry, routing)
  is input-kind-agnostic; documents are the first input kind, with JSON/XML/HTML/images/
  API responses/SQL results as future kinds that add parsers, not architecture.
- Not trucking/payroll/document-type-specific. No hardcoded document types anywhere;
  everything is FileRef/data + instructions + structured schema.
- Not a parallel execution system. Both actions are ordinary registered handlers inside
  the existing engine, registries, readiness, and run-history surfaces.
- Not per-action billing. **No AI action ever implements its own billing/gating/ledger
  logic** — that lives once in the standard pipeline (§4.2).
- Not model-aware workflows. Actions request a *task*; the processor decides
  gateway/first-party/model. Workflows never know which LLM ran.

**Fourteen owner-locked decisions** (four review rounds): (1) gateway now, abstract for
both; (2) parse-to-text in ChainReact; (3) loop node as sibling slice; (4) real AI call in
test mode, uncharged; (5) generic `AiProcessorClient` naming everywhere; (6) builder-time
Suggest Fields; (7) answer_questions mode; (8) no artificial field cap (200 sanity bound);
(9) dedicated `ai` provider identity; (10) transform-into-action is the PRIMARY transform
workflow; (11) full destination-action metadata crosses to the model; (12) one standard AI
action pipeline for every current and future AI action; (13) an AI action registry as the
single declaration home; (14) model routing is a processor concern behind a
`resolveModelRoute` seam.

**Account-scoped model:** both actions run under the account that owns the workflow; the
credit gate and ledger are account-keyed exactly as existing AI features are. No
credential-sharing surface exists (connectionless), so no sharing-classification work is
needed.

---

## 4. Recommended approach

### 4.1 The `ai` provider identity

- Provider id **`ai`**, display name **"ChainReact AI"**, connectionless: every meta sets
  `requiresIntegration: false`, `riskLevel: "low"`. Registration is manifest-less like
  native, **or** a minimal manifest entry if structure tests demand one — resolved at
  implementation and documented (open question O2, §10).
- New **`"ai"` category** added to the category enum in
  [actionMeta.ts](../../../../contracts/actionMeta.ts) (additive).
- Builder plumbing to extend (the honest cost of a first-class identity):
  - Introduce a shared `CONNECTIONLESS_PROVIDERS = ["native", "ai"] as const` predicate and
    replace the `=== "native"` checks in
    [useNativeActions.ts](../../../../features/workflow-builder/hooks/useNativeActions.ts),
    [useNodeMeta.ts](../../../../features/workflow-builder/hooks/useNodeMeta.ts),
    [useUpstreamVariables.ts](../../../../features/workflow-builder/hooks/useUpstreamVariables.ts).
  - Catalog route `app/api/ai/actions/route.ts` mirroring
    [the native route](../../../../app/api/native/actions/route.ts) (or one generalized
    connectionless route — implementation choice).
  - ActionPicker: a first-class **"ChainReact AI"** section (sparkle branding, own icon
    asset) rendered as a family header, never as a "connect" card.
  - Readiness: free — the
    [connectionInput.ts](../../../../features/workflow-builder/config-modal/readiness/connectionInput.ts)
    short-circuit is already provider-agnostic.
- Rationale: a durable home for future AI actions (generate text, summarize thread, image
  understanding, SQL generation…) and a product surface that makes AI feel core to
  ChainReact — worth the bounded plumbing cost over hiding two rows inside native actions.

### 4.2 First-class AI platform infrastructure

**Standard AI Action Pipeline** — new `services/ai/processor/executeAiAction.ts`, the
single runner every AI action handler delegates to:

```
executeAiAction({ actionKey, accountId, testMode, request, validate })
  → registry lookup (feature, tiers, flags)          # fail-closed on unregistered key
  → resolve model tier (config modelQuality ∩ registry supportedTiers)
  → compute estimated credits (computeAiCreditCharge)
  → aiCreditGate (atomic deduct; testMode skip)      # fail-closed
  → resolveModelRoute + AiProcessorClient.process    # routing seam
  → validate payload (strict Zod + user-schema validator)
  → write ai_cost_events ledger row (sanitized, fail-open)
  → return validated payload + usage/confidence envelope
```

Handlers do only: parse config → resolve inputs (FileRef/parse/budget) →
`executeAiAction` → map to a bounded output. Billing, gating, routing, auditing, and
ledger writes become structurally impossible to forget or fork per-action. The Suggest
Fields route uses the same runner (wrapped in `runAuthorizedCapability`, as AI routes are
today).

**AI Action Registry** — new `services/ai/processor/aiActionRegistry.ts`, precedent
[capabilities.ts](../../../../services/ai/reactAgent/capabilities.ts) (frozen allow-list).
One entry per AI action/capability:

```
{ actionKey: "ai:analyze_document", feature: "document_analysis",
  supportedTiers: ["standard", "advanced"], structuredOutput: true,
  streaming: false, testModeAllowed: true, costPreview: true,
  enabledFlag: "AI_PROCESSOR_ENABLED" }
```

Credit **amounts** stay in `FEATURE_BASE_CREDITS`
([aiCreditPolicy.ts](../../../../core/billing/aiCreditPolicy.ts)); a lockstep structure test
proves every registry feature is mapped in `FEATURE_BASE_CREDITS`, the `AiFeature` union,
and the `ai_cost_events` CHECK constraint (the 5-credit unmapped fallback must be
unreachable), and every `ai:*` ActionMeta key has a registry entry. `streaming: false`
everywhere phase 1 — the field exists so future streaming actions declare it rather than
improvise.

**Model routing seam** — new `services/ai/processor/resolveModelRoute.ts`:
`resolveModelRoute({ feature, tier, task }) → { provider: "gateway" | "first_party",
modelHint? }`. Phase 1 is trivially env-driven (`AI_PROCESSOR_PROVIDER`); later,
per-feature routing (document_analysis→Claude, sql_generation→GPT, image_understanding→
Gemini) lands here as config/policy with zero changes to actions, registry entries, or the
wire contract (`modelTag` in responses already reports what ran, for the ledger).

### 4.3 AiProcessorClient (task-generic)

- One method: `process(req: AiProcessRequest): Promise<AiProcessResult>`, discriminated by
  `task`. Phase-1 tasks: `analyze_document` (mode inside), `transform_data`,
  `suggest_schema`. New tasks never change the interface.
- `AiProcessResult` = `{ ok: true, payload: unknown, usage?, modelTag,
  source: "gateway" | "first_party" }` | `{ ok: false, code, retryable, message }`.
  Never throws (precedent:
  [hermesAgentGatewayClient.ts](../../../../services/ai-guidance/gateway/hermesAgentGatewayClient.ts));
  `message` is caller-safe (no document text, no token material). Orchestrators re-validate
  `payload` with strict Zod — shared `requestShapes.ts` + `responseSchemas.ts` (per-mode
  JSON-Schema builders) keep the gateway and first-party implementations behaviorally
  symmetric.
- Failure codes: `DISABLED | NOT_CONFIGURED | TIMEOUT | RATE_LIMITED | PROVIDER_ERROR |
  INVALID_RESPONSE | INPUT_TOO_LARGE | CONTENT_REFUSED`.
- Env (all new; deliberately independent of `HERMES_AGENT_ENABLED`):

| Var | Default | Meaning |
|---|---|---|
| `AI_PROCESSOR_ENABLED` | unset (OFF) | master flag; OFF → `DISABLED`, no network |
| `AI_PROCESSOR_PROVIDER` | `gateway` | `gateway` \| `first_party` |
| `AI_PROCESSOR_TIMEOUT_MS` | 60000 | clamped 5000–120000 |
| `AI_PROCESSOR_MAX_INPUT_CHARS` | 150000 | text budget ceiling |
| (reused) `CHAINREACT_AI_GATEWAY_URL` / `_TOKEN` | — | same Render service |

### 4.4 Folder structure

```
contracts/aiProcessing.ts               # UserDefinedSchema, task/mode enums, destination-context DTO,
                                        # output envelopes (strict Zod)
core/documents/                         # PURE: parsedDocument model, pageRange parser, textBudget
services/documents/parsing/             # npm-dep parsers + mime/ext/magic-byte dispatch + typed errors
services/ai/processor/                  # PLATFORM LAYER: AiProcessorClient types/config/factory,
                                        # requestShapes, responseSchemas, gateway + first-party clients,
                                        # gateway response normalizer, buildExtractionValidator,
                                        # executeAiAction, aiActionRegistry, resolveModelRoute,
                                        # runDocumentAnalysis / runDataTransform / runSchemaSuggestion, errors
integrations/ai/                        # the AI provider: actions/analyzeDocument + transformData
app/api/ai/actions/route.ts             # catalog route (or generalized connectionless route)
app/api/accounts/[id]/ai/suggest-schema/route.ts   # builder-time Suggest Fields (gated)
```

Parsers live in `services/`, not `core/` — the core import fence
([core-purity.test.ts](../../../../tests/structure/core-purity.test.ts)) does not admit npm
packages. `core/documents/` keeps only dependency-free pieces (normalized model,
page-range math, budgeting).

### 4.5 Gateway wire contract (build spec for the Render side — external dependency)

- **Endpoint:** `POST ${CHAINREACT_AI_GATEWAY_URL}/api/hermes-agent/process` ·
  `Authorization: Bearer ${CHAINREACT_AI_GATEWAY_TOKEN}` · body ≤ 2 MB · client-side abort
  at `AI_PROCESSOR_TIMEOUT_MS`.
- **Request (versioned; structured fields, not a prebuilt prompt):**

```jsonc
{
  "schemaVersion": 1,
  "task": "transform_data",              // analyze_document | transform_data | suggest_schema
  "mode": "extract_rows",                // analyze_document only
  "instructions": "…≤4000 chars…",
  "question": "…",                       // answer_questions mode only
  "document": {                          // analyze/suggest tasks
    "name": "payroll-june.xlsx", "mimeType": "…", "truncated": false,
    "segments": [ { "label": "Sheet: June", "text": "…" } ]
  },
  "input": { "json": "…" },              // transform only, ≤1 MiB serialized
  "destinationContext": { /* rich destination-action metadata, see below */ },
  "outputSchema": { /* JSON Schema the reply MUST satisfy (embeds the destination fields) */ },
  "limits": { "maxRows": 500, "maxOutputTokens": 8000 },
  "requestId": "aip-…"                   // opaque; NO account/user/workflow ids
}
```

- **`destinationContext`** (decision 11): when transforming into an action, a sanitized
  DTO of the destination action — displayName/description + per-field
  `{ name, label, type, required, helpText?, description?, staticOptions? (value+label),
  defaultValue?, format hints }`. Product metadata only (never user data or secrets); it
  gives the model maximal mapping context (e.g. "importance must be one of
  low|normal|high"). `outputSchema` remains the machine-enforced contract;
  `destinationContext` is advisory richness.
- **Response:** `{ ok: true, result: <object matching outputSchema>, usage, modelTag }` or
  `{ ok: false, error: CODE }` with codes `INPUT_TOO_LARGE | RATE_LIMITED | MODEL_ERROR |
  SCHEMA_UNSATISFIABLE | CONTENT_REFUSED | UNSUPPORTED_TASK | INTERNAL`.
  `UNSUPPORTED_TASK` is the forward-compat lever for gateway-first task rollout. The
  ChainReact-side normalizer mirrors
  [gatewayResponseContract.ts](../../../../services/ai-guidance/gateway/gatewayResponseContract.ts):
  strict Zod, fails closed, gateway usage recorded as telemetry only.
- Canonical request/response JSON fixtures ship with the implementation and double as the
  Render repo's contract tests.

### 4.6 Parsing layer (recommendation — libraries unverified until installed)

| Format | Library | Note |
|---|---|---|
| PDF (text-based) | `unpdf` | serverless-first pdfjs wrapper; per-page extraction |
| DOCX | `mammoth` (`extractRawText`) | mature, pure JS |
| XLSX | `exceljs` | pure JS; **rejecting SheetJS `xlsx`** (frozen npm release + known CVEs) |
| CSV | `papaparse` | battle-tested quoting/delimiters |
| TXT / email body | `TextDecoder` | existing in-repo pattern |

These picks are recommendations based on ecosystem knowledge; bundle behavior on
Next 15/Vercel is **unverified** until installed (risk R1 — may need
`serverExternalPackages`; parsers must be server-only, enforced by a structure test).

- Dispatch: mimeType → extension → magic bytes (`%PDF-`, `PK\x03\x04`) →
  `UnsupportedDocumentTypeError`. Hard 20 MB pre-parse cap (below the 25 MB advisory
  guidance); 5,000-row/256-column scan caps per sheet.
- Normalized model `ParsedDocument { kind, segments[{label, text}], totalSegments,
  truncated, charCount, warnings }` in `core/documents/`.
- Page range (`"1-5,8"`) applies to PDFs; XLSX uses a separate `sheetName` field; DOCX/CSV
  ignore it **with an explicit warning** (`page_range_not_supported_…`) — never silently.
- Text budget: `AI_PROCESSOR_MAX_INPUT_CHARS` (150k chars ≈ 37k tokens). Overflow policy:
  summarize/classify/answer_questions → truncate at a segment boundary with
  `truncated: true`; **extract modes → fail** ("narrow with Page range / Sheet") —
  silent truncation during extraction means silently missing payroll rows.

### 4.7 Validation

- `UserDefinedSchema` = 1–**200** fields of `{ name (^[a-zA-Z][a-zA-Z0-9_]{0,63}$),
  type: string|number|boolean|date|currency, required?, description? }`. 200 is a sanity
  bound only; the effective limit is the token budget (decision 8).
- Runtime Zod builder (`buildExtractionValidator`) with coercion: currency-symbol/comma
  stripping, yes/no booleans, dates normalized to `YYYY-MM-DD`.
- **Hallucinated/extra keys are stripped, never surfaced.** Required-missing → step
  failure; optional-missing → explicit `null` (every declared key always present — stable
  variable surface, bounded-output rule).
- Per-field/per-row confidence + `overallConfidence` + `lowConfidenceFields`. Low
  confidence **never fails the step by default**; an Advanced
  `onLowConfidence: fail | null_fields` knob opts into strictness. (Human review queue is
  future work.)
- One internal corrective re-ask on schema violation, then fail
  (`ExtractionValidationError` — field NAMES only, never values).

### 4.8 `ai:analyze_document` (fields Rule-17 classified)

- **Setup:** `file` (file, required), `mode` (select, required, default `summarize`),
  `instructions` (textarea, optional).
- **Conditional Setup (`visibleWhen: mode`; required-when-visible):**
  `expectedFields` (new FieldType **`schema-fields`**, extract_fields) ·
  `rowSchema` (schema-fields, extract_rows) ·
  `labels` (string-array, classify) + `allowOtherLabel` (boolean, classify, default true) ·
  `question` (textarea, answer_questions).
- **Advanced:** `pageRange`, `sheetName`, `confidenceThreshold` (0–1, default 0.7),
  `onLowConfidence`, `strictValidation` (default true), `maxRows` (default 100, cap 500),
  `modelQuality` (`standard` | `advanced` → fast/strong tier, ×2 credits).
- **Outputs (fixed key set, nullable per mode):** `mode, sourceName, detectedType,
  summary, keyPoints, fields, rows, rowCount, label, answer, overallConfidence,
  lowConfidenceFields, truncated, pageRangeApplied, segmentsAnalyzed, warnings`.
  `rows` is a flat-object array — **the frozen interface the sibling loop node iterates**.

### 4.9 `ai:transform_data` — destination-action PRIMARY

- **Setup (in order):** `input` (textarea holding a single `{{node.rows}}` token — the
  resolver returns the raw array;
  [resolveValue.ts](../../../../workflow-engine/variables/resolveValue.ts) single-template
  behavior, formatTransformer precedent) · `destinationMode` (select, **default
  `action`**: "Match another action's fields" | "Define fields manually") ·
  `destinationAction` (combobox, required when `action`; `optionsSource` over the
  registered action catalog — provider-grouped, searchable) · `destinationSchema`
  (schema-fields, required when `custom`; hosts Suggest Fields) · `outputShape`
  (select rows|object) · `instructions` (optional refinements).
- **Advanced:** `examples` (json, few-shot pairs), `strictValidation`, `maxRows`,
  `modelQuality`.
- **Destination derivation** — new pure helper `core/workflows/deriveDestinationContext.ts`
  produces BOTH (1) the validation `UserDefinedSchema` (Setup-tab, non-advanced,
  scalar-typed fields; required preserved; file/object-list/internal fields excluded phase
  1 with documented gaps) and (2) the rich `destinationContext` DTO for the model
  (decision 11). The server **re-derives both at runtime from the registry** — it never
  trusts a client-side copy. Output `record`/`rows` keys match the destination action's
  field names 1:1; auto-prefill of the downstream action's config is the documented
  phase-2 enhancement.
- **Outputs:** `rows, rowCount, record, inputCount, overallConfidence, warnings`.

### 4.10 Suggest Fields (builder-time)

- A "Suggest fields" button inside the `schema-fields` editor (extract_fields /
  extract_rows / custom-destination).
- Sample source at config time (the `file` value is usually a runtime token): (a) the
  latest test-run value of the referenced upstream FileRef via the builder's latest-run
  preview plumbing (primary); (b) a one-off sample upload staged to `workflow-files`
  (24 h TTL, fallback).
- New gated route `POST /api/accounts/[id]/ai/suggest-schema` following the
  [workflow-guidance route](../../../../app/api/accounts/[id]/ai/workflow-guidance/route.ts)
  ordered-gate template; new capability id `schema_suggestion` (read_only) in
  [capabilities.ts](../../../../services/ai/reactAgent/capabilities.ts); orchestrator
  `runSchemaSuggestion` → processor task `suggest_schema`. Response is a
  `UserDefinedSchema` proposal merged as editable rows — nothing auto-commits. 1 credit.

### 4.11 New contract surface (two deliberate additions)

1. **`schema-fields` FieldType** + `SchemaFieldsField.tsx` + `_schemaFieldsValidator.ts`
   (Save-gating; unique, normalized snake_case names so `{{node.fields.x}}` stays a clean
   path segment). Precedent: `router-routes`
   ([RouterRoutesField.tsx](../../../../features/workflow-builder/config-modal/fields/RouterRoutesField.tsx)).
2. **`dynamicOutputs` on ActionMeta** (optional, additive):
   `[{ configField, attachUnder, whenField?, whenValueIn? }]` with superRefine referential
   integrity. Pure helper `core/workflows/dynamicOutputs.ts`
   (`applyDynamicOutputs(meta, config)`) synthesizes child `OutputMeta` under
   `fields`/`rows`/`record` from config (schema-fields rows, or the derived
   destination-action schema). Single builder touchpoint:
   [useUpstreamVariables.ts](../../../../features/workflow-builder/hooks/useUpstreamVariables.ts)
   meta resolution in the connectionless branch. The variable picker and soft validator
   inherit automatically; schema-row renames produce soft `missing_field` warnings
   downstream. Phase 1 ships static generic outputs first (blind deep refs already resolve
   at runtime — §2.3); synthesis is a fast-follow slice.

### 4.12 Loop node (sibling arc — contract sketch only)

`native:for_each` — fields `items` / `maxIterations` (default 100, hard cap) /
`onItemError` (stop|continue); labeled edges `loop` (body) and `done` (after), reusing the
existing labeled-edge + branch-wiring vocabulary; engine executes the body subgraph per
item with a reserved `{{loop.item}}` / `{{loop.index}}` variable overlay (like the
`trigger` alias); no nesting phase 1. Known risks to resolve in that arc: per-iteration
run persistence (engine stores one output per node id today), cost multiplication for
per-iteration billing, reserving the `loop` alias against node ids, and canvas/document
rendering of body containment. The engine subgraph execution is the long pole — it stays
**off the AI-actions critical path**; the only dependency is the frozen `rows` output
shape (§4.8).

---

## 5. Alternatives considered

| Decision | Chosen | Rejected | Why |
|---|---|---|---|
| Model call location | Hermes gateway first, behind `AiProcessorClient` | (a) first-party only; (b) gateway only, no abstraction | (a) puts vendor keys + routing flags on Vercel now and diverges from production posture; (b) locks out per-feature routing (decision 14). Abstraction costs one interface. |
| Document ingestion | Parse-to-text in ChainReact | Raw multimodal file to model; gateway-side parsing | Deterministic, cheap, page-range + token budgeting before spend; keeps gateway body small. Multimodal PDF input is a future mode, not phase 1. |
| Provider identity | Dedicated `ai` provider id | Fold into `native` actions | Owner decision 9: first-class product surface + durable home for future AI actions. Native was the lower-friction default; the plumbing cost (§4.1) is bounded and enumerated. |
| Schema editor | New `schema-fields` FieldType | `object-list` + `itemFields` | object-list can render the rows but cannot express unique-name validation, snake_case normalization, reserved-name rejection, or Save gating; `router-routes` proves the bespoke-FieldType pattern. |
| Dynamic outputs | Additive `dynamicOutputs` meta declaration + client-side synthesis | (a) static-only forever; (b) server-evaluated per-node output contracts | (a) leaves the variable picker blind to user-defined fields; (b) drags discovery/persistence/readiness surfaces into phase 1 for no user-visible gain. The declaration lives in the contract from day one, so (b) remains a compatible evolution. |
| Transform destination | Destination-action primary + derived context | Custom-schema-only | Owner decision 10: every action already declares a typed input surface; making users re-type it forfeits ChainReact's structural advantage. |
| Billing | One `executeAiAction` pipeline + registry | Per-handler gate/ledger calls | Owner decision 12/13: per-handler billing is exactly how drift and unmetered paths happen; the pipeline makes divergence structurally impossible. |
| XLSX library | `exceljs` | SheetJS `xlsx` | npm release frozen with known CVEs; current SheetJS releases are CDN-only. |
| Extract-mode overflow | Fail with guidance | Truncate silently | Silently missing extraction rows are a correctness failure (payroll rows). Summaries may truncate with a flag; extractions may not. |

---

## 6. Security / data model

- **Privacy posture (explicit).** Document text — including PII such as payroll names and
  salaries — **does cross** to the ChainReact-owned gateway and its model vendor. This is
  inherent to extraction: the model must transcribe literal values, so
  [tokenizeSensitiveLiterals](../../../../core/security/sensitiveLiterals.ts) is deliberately
  **not** applied to document text or extraction outputs (placeholder round-tripping cannot
  restore values the model must read and return; partial scrubbing corrupts extractions).
  What IS enforced instead:
  - No document text or extracted values in logs, thrown error messages, or
    `ai_cost_events` (the existing metadata key-denylist in
    [aiCostEvents.ts](../../../../services/billing/aiCostEvents.ts) plus counts/enums-only
    caller discipline).
  - Gateway requests carry an opaque `requestId` and **no account/user/workflow ids**.
  - The gateway token lives only in the `Authorization` header (no-leak test asserts it
    never appears in a serialized body).
  - `destinationContext` is product metadata only — never user data, tokens, or account
    state (dedicated no-leak test).
  - Outputs land in `workflow_runs` step outputs under the same protections as every
    existing action that already handles email/DB content.
  - Owner action items (outside this repo): vendor zero-data-retention terms on the
    gateway path; data-processor documentation; a disclosure sentence in both action
    descriptions ("Document content is processed by ChainReact's AI service").
- **Schema/migration surface:** one data-shape migration only — widening the
  `ai_cost_events` feature CHECK constraint for the three new features (pattern:
  [20260703000000_ai_cost_events_feature_add_workflow_qa.sql](../../../../supabase/migrations/20260703000000_ai_cost_events_feature_add_workflow_qa.sql)).
  No new tables, no RLS changes. File staging reuses the existing `workflow_files` +
  `workflow-files` bucket (24 h TTL, service-role-only access) unchanged.
- **Abuse/cost controls:** `aiCreditGate` before every call (fail-closed);
  `executeAiAction` refuses unregistered action keys; **GA gate:
  `ENABLE_AI_CREDIT_ENFORCEMENT` must be ON before `AI_PROCESSOR_ENABLED` in production**
  — scheduled workflows run unattended, so an unenforced flag means unmetered spend (risk
  R2). Gateway-side rate limiting is the backstop.
- **Suggest Fields route** follows the gated-route template exactly (auth + membership →
  strict `.strict()` body → availability → credit gate → `runAuthorizedCapability` with
  audit) — no new authorization pattern is invented.

---

## 7. API / service / UI expectations (described, not built)

- **New routes:** `app/api/ai/actions` (catalog, mirrors native) ·
  `app/api/accounts/[id]/ai/suggest-schema` (gated, POST).
- **New services:** `services/ai/processor/*` (client, pipeline, registry, routing,
  orchestrators, validator) · `services/documents/parsing/*`.
- **New contracts:** `contracts/aiProcessing.ts`; additive changes to
  [actionMeta.ts](../../../../contracts/actionMeta.ts) (`ai` category, `schema-fields`
  FieldType, optional `dynamicOutputs`).
- **Engine:** recommend one additive failure code `AI_CREDITS_EXHAUSTED` in
  [engineTypes.ts](../../../../services/execution/engineTypes.ts) (distinct from
  `PLAN_FEATURE_REQUIRED`, which means plan-gating) — better run-history UX than generic
  `HANDLER_FAILED`.
- **Builder UI:** "ChainReact AI" picker section; `SchemaFieldsField` editor with Suggest
  Fields; mode-driven conditional Setup fields; readiness copy ("Add at least one field to
  extract"); at-a-glance summaries ("Analyze Document · Extract fields · 5 fields");
  config-panel caption disclosing that Test runs execute real AI (uncharged — decision 4);
  cost copy in descriptions ("Uses N AI credits per run"); phase-2: per-node credit chip
  fed by the existing cost-preview route.
- **Error taxonomy (user-visible, engine classification):** unsupported type / corrupt
  file / no extractable text (scanned PDF) / too large / bad config → `HANDLER_FAILED`
  with specific safe messages; `provider_url` FileRef → structured "add the provider's
  download step first" hint; gateway timeout/429/5xx → thrown as `TimeoutError` →
  `TRANSIENT_PROVIDER_ERROR`; credits exhausted → `AI_CREDITS_EXHAUSTED` (or
  `HANDLER_FAILED` fallback); validation failure after one corrective re-ask →
  `ExtractionValidationError` naming fields only; low confidence → **not an error**
  (output flags).
- **No fake UI:** every control listed maps to a real backend behavior specified in §4.

---

## 8. Tests required (for the implementation slices)

- **Parsers:** fixture files under `tests/fixtures/documents/` (multi-page PDF, DOCX,
  multi-sheet XLSX, quoting-hell CSV, BOM TXT; negatives: corrupt PDF, encrypted PDF,
  image-only PDF, `.xls`, oversized). Zero network.
- **Pure core:** pageRange parse matrix; textBudget per-mode overflow behavior.
- **Validator:** full coercion matrix (dates, `$1,234.56`, yes/no, required-missing,
  optional→null, extra-key stripping, 200-field schema, name-pattern rejection).
- **Clients:** gateway client with injected fetch — success, every `ok:false` code
  mapping, non-JSON, non-2xx, abort→TIMEOUT, disabled→no fetch, **token-never-in-body
  no-leak**; first-party client parity (same `responseSchemas` output).
- **Pipeline:** `executeAiAction` — gate-before-call ordering, testMode skip, ledger write
  on success/failure, routing-seam injection, unregistered-key refusal.
- **Registry lockstep (structure):** registry ↔ `FEATURE_BASE_CREDITS` ↔ `AiFeature` ↔
  CHECK constraint; every `ai:*` meta has a registry entry.
- **Handlers:** fixed-output-key snapshot; every error-taxonomy row; `provider_url` hint;
  answer_questions mode; test-mode real-call posture.
- **deriveDestinationContext:** representative real metas — scalar inclusion,
  advanced/file exclusion, static-options passthrough, no-user-data leakage.
- **Routes:** suggest-schema auth/gate-order/no-leak; catalog route.
- **Builder:** SchemaForm integration (mode switching incl. answer_questions and
  destinationMode default=action; hidden-required is not a readiness gap; Save gating on
  empty schema rows; Suggest Fields merge flow); variable-picker dynamic outputs (both
  destination modes); `dynamicOutputs` referential-integrity structure test.
- **E2E (per repo E2E philosophy — mock only the external boundary):** real engine run
  over a staged fixture CSV with the gateway fetch stubbed to the canonical success
  fixture; asserts run success, output shape, and the `ai_cost_events` row. Fixtures
  double as the Render-side contract tests.

---

## 9. Implementation slice breakdown

| # | Slice | Contents | Depends on |
|---|---|---|---|
| CS-0 | **EXTERNAL: Render gateway `/api/hermes-agent/process`** | Implements §4.5 (three tasks, destinationContext-aware prompting, forced-JSON output). Parallel track; ChainReact slices are fully testable against mocks | contract frozen in CS-2 |
| CS-1 | Contracts + parsing foundation | `contracts/aiProcessing.ts`, `core/documents/*`, `services/documents/parsing/*`, 4 npm deps, fixtures + tests | — |
| CS-2 | AiProcessorClient + platform infrastructure | client types/config/impls/normalizer/factory, **`executeAiAction`, `aiActionRegistry`, `resolveModelRoute`**, contract tests; freezes the wire contract; flag OFF | CS-1 |
| CS-3 | Billing plumbing | `AiFeature` + `FEATURE_BASE_CREDITS` (`document_analysis: 3`, `data_transform: 2`, `schema_suggestion: 1`) + repo union + CHECK migration + lockstep tests | — (parallel with CS-2) |
| CS-4 | `ai` provider identity + builder contract surface | `CONNECTIONLESS_PROVIDERS` generalization, catalog route, picker section, `ai` category, `schema-fields` FieldType + renderer + validator, `dynamicOutputs` contract declaration | CS-1 |
| CS-5 | Analyze Document action | schema/meta/handler + `runDocumentAnalysis` + validator; all five modes; registrations; **freezes the `rows` shape** | CS-1..4 |
| CS-6 | Transform Data action | destination-action PRIMARY (`deriveDestinationContext`, action-catalog optionsSource, server re-derivation) + custom secondary; `AI_CREDITS_EXHAUSTED` engine code | CS-5 |
| CS-7 | Suggest Fields | route + `schema_suggestion` capability + editor button + sample-source plumbing | CS-4, CS-2 |
| CS-8 | Dynamic-output synthesis | `applyDynamicOutputs` wiring in `useUpstreamVariables` + picker/validator tests | CS-5, CS-6 |
| CS-9 | E2E + rollout | mock-gateway engine E2E, privacy note, Render setup runbook, GA checklist (enforcement flag first) | CS-5..7, CS-0 for live |
| CS-10 | **SIBLING ARC:** `native:for_each` | loop node per §4.12; own plan/slices | CS-5 (`rows` shape only) |

Everything ships behind `AI_PROCESSOR_ENABLED` (default OFF); recommend hiding the AI
provider from the palette while the flag is off (R3).

**Deferred (recorded, not planned):** OCR/scanned PDFs and images, human review queue,
supporting references for answers, dynamic cost preview, `provider_url` auto-staging,
`.xls`, document compare/chat, prompt templates, auto-prefill of downstream action config
from transform output, JSON/XML/HTML/API-response/SQL input kinds (architecture-ready:
new parse services feed the same `ParsedDocument` → processor pipeline), future AI
actions (generate text, image understanding, SQL generation).

---

## 10. Risks / open questions

| # | Item | Recommendation |
|---|---|---|
| O1 | Whether the core purity fence admits zod for `buildExtractionValidator` placement in `core/` | Keep it in `services/ai/processor/` (chosen); recheck [core-purity.test.ts](../../../../tests/structure/core-purity.test.ts) at implementation |
| O2 | `ai` provider registration mechanics — manifest-less like native vs a minimal manifest entry | Resolve against structure tests in CS-4; document the choice in the slice outcome |
| R1 | Next 15/Vercel bundling of `unpdf`/`exceljs` (**unverified**) | Budget a spike in CS-1; expect `serverExternalPackages` entries; server-only structure test |
| R2 | `ENABLE_AI_CREDIT_ENFORCEMENT` default OFF + unattended scheduled runs = unmetered spend | GA checklist hard-requires enforcement ON before `AI_PROCESSOR_ENABLED` in prod |
| R3 | Palette visibility while the flag is off | Hide the AI provider section until `AI_PROCESSOR_ENABLED` |
| R4 | Page-range impossibility on DOCX/CSV confusing users | Field helpText states scope; runtime warning + `pageRangeApplied: false` output |
| R5 | `deriveDestinationContext` edge cases (object-list/keyvalue destination fields) | Excluded phase 1; per-action gaps documented honestly in the CS-6 outcome |
| R6 | Loop-node engine semantics (once-per-node invariant) | Sibling arc with its own plan; never blocks the AI actions |
| D1 | Writing `ai_cost_events` rows for gateway calls diverges from the guidance-route precedent (which writes none) | **Do write them** (`usageSource: "gateway_reported"`, `estimated_cost_micros: null`) — per-run cost attribution is the point of a runtime action. Owner-ratified direction |
| — | Render gateway work is outside this repo | §4.5 + fixtures are its build spec; coordinate deploy before live certification |

---

## 11. Acceptance criteria

**This planning slice:**
- [x] Plan doc exists at `docs/slices/phase-5/ai-provider-platform-plan.md`, grounded in
  files actually inspected (Source of truth block), current state separated from
  recommendations, unverified items flagged (§4.6, R1).
- [x] No source, test, migration, schema, or UI changes; nothing pushed.

**The implementation (later) must meet:**
- Every AI action executes through `executeAiAction` — no handler-local billing/gating.
- Registry lockstep tests green; the 5-credit unmapped fallback is unreachable.
- Both actions configurable by an ordinary business user per CLAUDE.md rule 17 (no wire
  formats, no raw JSON on the Setup path; schema editor + destination-action picker).
- Bounded outputs (fixed key sets), no bytes/base64, errors propagate, single-page-list
  doctrine respected.
- All §8 test areas green; E2E passes with the gateway mocked at the network boundary.
- GA checklist satisfied (enforcement flag ON before processor flag in prod; privacy
  disclosure copy in place).

---

## 12. Hard boundaries (what this slice did NOT change)

- No source code, tests, migrations, contracts, UI, env, or registry changes.
- No npm dependencies added.
- No gateway/Render-side changes; §4.5 is a specification only.
- No push; docs-only local commit.

---

## 13. Recommended next step

**CS-1 (contracts + parsing foundation)** via the local-slice-executor skill — it is
dependency-free, de-risks R1 (bundling spike) earliest, and produces the fixtures every
later slice tests against. CS-3 (billing plumbing) can run in the same batch if capacity
allows; CS-0 (Render gateway) should be scheduled in parallel once CS-2 freezes the wire
contract.
