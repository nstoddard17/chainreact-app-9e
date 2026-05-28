# OpenAI Model Adapter — Setup + Structured-Output Compatibility Audit

**Slice:** 4.AI-34A
**Branch:** `builder-ui-v1-audit-1`
**Date:** 2026-05-28
**No behavior switch.** Anthropic / Sonnet 4.6 stays the default React Agent planner. This slice adds OpenAI as a *supported, wired, tested* provider behind a flag — nothing routes to it by default.

---

## A. What landed

| Piece | File |
|---|---|
| OpenAI model definitions (per tier) | [`core/ai/models.ts`](../../../core/ai/models.ts) — `OPENAI_MODELS` |
| Provider-aware resolver | `getModelForProviderTier(provider, tier)` |
| Cross-provider id→def lookup (telemetry) | `getModelById` now searches Anthropic + OpenAI |
| OpenAI Responses-API adapter | [`services/ai/modelClients/openaiClient.ts`](../../../services/ai/modelClients/openaiClient.ts) — `createOpenAiModelClient` |
| Adapter options | [`services/ai/modelClients/types.ts`](../../../services/ai/modelClients/types.ts) — `OpenAiModelClientOptions` |
| Factory routing + flag | [`services/ai/modelClients/createModelClient.ts`](../../../services/ai/modelClients/createModelClient.ts) — `createModelClientForModel` routes `provider==="openai"`; `isOpenAiProviderEnabled()` |
| Public exports | [`services/ai/modelClients/index.ts`](../../../services/ai/modelClients/index.ts) |

The adapter implements the same provider-agnostic `core/ai` `ModelClient` contract as the Anthropic adapter — `generateStructuredJson(input): Promise<ModelResult>` — so any future routing layer swaps providers with zero changes to the planner, parser, preview, or apply paths.

---

## B. Setup for Marcus (local + deploy)

1. **API key — server-side only.** Add to `.env.local` (and the deploy env), NEVER with a `NEXT_PUBLIC_` prefix:

   ```
   OPENAI_API_KEY=sk-...
   ```

   The key is read at call time inside `createRuntimeModelClient` via `MODEL_API_KEY_ENV.openai` and lives only in the adapter's closure + the outbound `Authorization: Bearer …` header. It is never returned, logged, echoed, or placed in any `ModelResult` (pinned by no-leak tests). Because it has no `NEXT_PUBLIC_` prefix, Next.js will not inline it into the browser bundle — it is structurally unreachable from the client.

2. **Enable the provider (when you're ready to A/B — NOT required for this slice):**

   ```
   ENABLE_OPENAI_PROVIDER=true
   ```

   Default is unset/false. Today this flag is exported (`isOpenAiProviderEnabled()`) but the default planner path never consults it — OpenAI is unreachable until AI-34B wires a routing decision behind this flag. Setting it now changes nothing.

3. **Model ids.** `OPENAI_MODELS` defaults to `gpt-4.1` (strong) / `gpt-4.1-mini` (fast). The adapter sends whatever `id` is there — change them in one place (`core/ai/models.ts`) if you want different OpenAI models. **Confirm these ids against your OpenAI account's available models before AI-34B routes real traffic.**

4. **Fail-safe behavior.** If `OPENAI_API_KEY` is missing, resolving an OpenAI client returns the `NOT_CONFIGURED` client — every call fails cleanly with `failureCode: "NOT_CONFIGURED"`, never throws, never blocks the app. (Same discipline as the Anthropic adapter.)

---

## C. Structured-output / tool-call compatibility audit

The planner's structured-output contract (`ModelGenerateInput.responseTool` → forced single JSON object) is provider-agnostic. How each provider satisfies it:

| Concern | Anthropic (current default) | OpenAI (this slice) |
|---|---|---|
| Endpoint | `POST /v1/messages` | `POST /v1/responses` (Responses API) |
| Auth header | `x-api-key` + `anthropic-version` | `Authorization: Bearer` (+ optional `openai-organization`) |
| System prompt | `system` field (string) | `instructions` field (string) |
| Turns | `messages: [{role, content}]` | `input: [{role, content}]` |
| Forced structured output | `tools:[{name,description,input_schema}]` + `tool_choice:{type:"tool",name}` → read `tool_use.input` | `tools:[{type:"function",name,description,parameters}]` + `tool_choice:{type:"function",name}` → read `function_call.arguments` |
| Structured payload returned as | `JSON.stringify(tool_use.input)` | `function_call.arguments` (already a JSON string) |
| Usage | `usage.input_tokens/output_tokens` | `usage.input_tokens/output_tokens` |
| Finish reason | `stop_reason` | `status` + `incomplete_details.reason` |

**Key compatibility finding:** OpenAI's Responses-API function-calling maps cleanly onto the existing `responseTool` abstraction. The downstream strict parser (`parseWorkflowPlanResponse`) + `WorkflowPatchSchema` stay the single source of truth for both providers — the adapter returns the structured payload as `ModelSuccess.text` exactly as the Anthropic adapter does, so **no planner/parser/preview/apply change is needed to switch providers.** The forced-tool path deliberately does NOT fall back to freeform-text parsing on a missing tool call (returns `INVALID_RESPONSE`, retryable) — identical to the Anthropic adapter's AI-19 behavior.

**One difference worth noting for AI-34B:** OpenAI function-tools support a `strict: true` JSON-schema-adherence mode. This slice sends the tool WITHOUT `strict` (matching Anthropic's non-strict behavior, so parser semantics are identical across providers). If AI-34B finds OpenAI drifts from the schema, enabling `strict` is a one-line adapter change — but it requires the `inputSchema` to satisfy OpenAI's strict-mode constraints (all fields required / `additionalProperties:false`), which the current `WORKFLOW_PLAN_TOOL` schema may not. Verify before enabling.

---

## D. ⚠️ Live-verification checklist (before AI-34B routes real traffic)

The Responses-API request/response field shapes were implemented against the documented API. This environment cannot make a live OpenAI call, so the following MUST be confirmed against a real response first (the adapter is structured so only the parse/serialize helpers change if a field differs):

- [ ] `instructions` + `input: [{role, content}]` is accepted (vs requiring a single `input` string or a different message shape).
- [ ] Function tool shape: flat `{type:"function", name, description, parameters}` + `tool_choice:{type:"function", name}`.
- [ ] Response `output[]` contains a `function_call` item with `name` + `arguments` (JSON string).
- [ ] Plain-text response exposes `output[].content[].type === "output_text"` (and/or top-level `output_text`).
- [ ] `usage.input_tokens` / `usage.output_tokens` field names.
- [ ] `status: "incomplete"` + `incomplete_details.reason: "max_output_tokens"` for truncation.
- [ ] The chosen model ids (`gpt-4.1` / `gpt-4.1-mini`) exist on the account.

---

## E. Telemetry

`getModelById` now resolves OpenAI ids, so the existing cost-event recorder (`recordAiRouteEvents.ts` → `providerOf`) maps an OpenAI call's `model_name` to `model_provider: "openai"` automatically. The existing `metadata.tier` / `model.modelId` / `plannerModelTier` (AI-31) fields carry the provider/model/tier dimensions with no recorder change. When AI-34B routes a call to OpenAI, its `ai_cost_events` row will show `model_provider: openai` + the OpenAI `model_name` + the resolved tier — directly comparable against Anthropic rows in the AI-32 dashboards.

---

## F. Boundaries

| | |
|---|---|
| Default planner stays Anthropic / Sonnet 4.6 | ✅ unchanged |
| Patch generation routed to OpenAI | ❌ not in this slice |
| Provider narrowing | ❌ untouched |
| Planner prompt semantics | ❌ untouched |
| Deterministic preview / apply | ❌ untouched |
| Workflow execution | ❌ untouched |
| Billing / tasks | ❌ untouched |
| General app help assistant | ❌ untouched |
| Browser exposure of the key | ❌ none — server-side `OPENAI_API_KEY`, no `NEXT_PUBLIC_` |
| DB migration | ❌ none |

---

## G. Tests

- [`openaiClient.test.ts`](../../../tests/unit/services/ai/modelClients/openaiClient.test.ts) — success (text + forced-tool), request-shape (instructions/input split, Bearer auth, flat function tool + tool_choice, `/v1/responses` URL), full error mapping (429/500/400/invalid-json/empty/timeout/network), forced-tool extraction + INVALID_RESPONSE on missing/mismatched call, no-leak (key absent from success result, error result, and request body).
- [`createModelClient.test.ts`](../../../tests/unit/services/ai/modelClients/createModelClient.test.ts) — OpenAI + key → real adapter (hits `/v1/responses`); OpenAI + no key → NOT_CONFIGURED; unknown provider → CONFIGURATION_ERROR; no-leak; `isOpenAiProviderEnabled` flag (default off, only literal "true").
- [`models.test.ts`](../../../tests/unit/core/ai/models.test.ts) — `OPENAI_MODELS` shape, id non-collision, `getModelForProviderTier` (anthropic vs openai), default resolver still Anthropic, `getModelById` cross-provider.

## H. Next slice (AI-34B candidate, NOT this slice)

A/B or switch routing: a routing layer that, gated on `ENABLE_OPENAI_PROVIDER`, resolves `getModelForProviderTier("openai", tier)` for some/all plan calls — after the §D live-verification checklist passes and a quality comparison (parse-failure rate, no-substitution adherence, INVALID_PATCH rate) against Anthropic is run on real prompts.
