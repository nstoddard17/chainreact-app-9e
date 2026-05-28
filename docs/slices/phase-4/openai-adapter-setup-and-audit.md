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

## D. ✅ Live-verification checklist — CONFIRMED in AI-34B (2026-05-27)

The Responses-API request/response field shapes were implemented against the documented API and have now been **confirmed against a live `gpt-4.1` / `gpt-4.1-mini` call** via [`scripts/trash/verify-openai-adapter.ts`](../../../scripts/trash/verify-openai-adapter.ts). The adapter required **no source change** — every assumed field matched. Details in §I below.

- [x] `instructions` + `input: [{role, content}]` is accepted.
- [x] Function tool shape: flat `{type:"function", name, description, parameters}` + `tool_choice:{type:"function", name}`.
- [x] Response `output[]` contains a `function_call` item with `name` + `arguments` (JSON string).
- [~] Plain-text response exposes `output[].content[].type === "output_text"` (and/or top-level `output_text`) — not exercised by the forced-tool probe; covered by unit tests and unchanged from the documented shape.
- [x] `usage.input_tokens` / `usage.output_tokens` field names.
- [~] `status: "incomplete"` + `incomplete_details.reason: "max_output_tokens"` for truncation — not triggered by the small probe (returned `status:"completed"`); the mapping is unit-pinned.
- [x] The chosen model ids (`gpt-4.1` / `gpt-4.1-mini`) exist on the account.

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

## K. AI-36 — OpenAI is now the React Agent PLANNER (Anthropic disabled at runtime)

The OpenAI adapter is no longer just classifier/A-B — as of AI-36 it serves the **React Agent planner**. Anthropic is **not called at runtime** (cost decision); its code stays dormant behind an emergency flag.

**Required env (planner ON):**
```
OPENAI_API_KEY=sk-...
ENABLE_OPENAI_PROVIDER=true
ENABLE_OPENAI_PLANNER=true
```
Optional emergency/dev override (default OFF — the ONLY runtime path that calls Anthropic):
```
ENABLE_ANTHROPIC_PLANNER_FALLBACK=true
```

**Planner model:** `gpt-4.1-mini` (`OPENAI_MODELS.fast`, output budget bumped to 8192 for planner use). `OPENAI_PLANNER_MODEL` / `OPENAI_PLANNER_STRONG_MODEL` env overrides are NOT yet wired — the adapter resolves the model id by tier from the registry; the planner uses the fast-tier id. Documented as a future override.

**No fallback:** if OpenAI is disabled / not-configured / rate-limited / errors / parse-fails / preview-rejects, the planner returns the existing model-unavailable or parse/preview failure flow — it does NOT fall back to Anthropic.

**Confirm Anthropic calls are zero:** run with the env above + `ENABLE_AI_COST_DEBUG=true`; every `[ai-cost]` planner line shows `provider=openai`, and no request hits `/v1/messages`. Live verify: `npx tsx scripts/trash/verify-openai-planner.ts` (all rows `provider=openai`, `model=gpt-4.1-mini`).

Routing: [`createPlannerModelClient`](../../../services/ai/modelClients/createModelClient.ts). Full note: [`ai-architecture-react-agent-plan.md`](./ai-architecture-react-agent-plan.md) "AI-36".

## H. AI-34C — SHIPPED (Option 1: GPT fast-tier intent classifier)

AI-34C took §J's recommended **Option 1**. `gpt-4.1-mini` plugs into the AI-31 narrowing-classifier seam as an OPTIONAL, ADVISORY, ADDITIVE classifier ([`services/ai/planner/modelNarrowingClassifier.ts`](../../../services/ai/planner/modelNarrowingClassifier.ts) + [`resolvePromptClassifier.ts`](../../../services/ai/planner/resolvePromptClassifier.ts)). It only ADDS valid candidate providers to the deterministic narrowed catalog (never removes / shrinks / pollutes), gated on `ENABLE_AI_MODEL_NARROWING_CLASSIFIER=true` + `ENABLE_OPENAI_PROVIDER=true` + `OPENAI_API_KEY` (default off). The PLANNER stays Anthropic/Sonnet — NO patch generation / Apply on OpenAI. Full details in [`ai-architecture-react-agent-plan.md`](./ai-architecture-react-agent-plan.md) "AI-34C" note + [`planner-model-tier-routing-audit.md`](./planner-model-tier-routing-audit.md). Verify live: `npx tsx scripts/trash/verify-model-classifier.ts`.

---

## I. AI-34B — live verification results (2026-05-27)

The adapter was driven against the **real OpenAI API** through the NORMAL model-client abstraction (`createModelClientForModel(getModelForProviderTier("openai", tier), apiKey)` — the factory, not a direct `createOpenAiModelClient`) by the dev-only probe [`scripts/trash/verify-openai-adapter.ts`](../../../scripts/trash/verify-openai-adapter.ts).

### Env vars (server-side only)

| Var | Purpose | AI-34B state |
|---|---|---|
| `OPENAI_API_KEY` | adapter key (read at call time, header only, never logged) | present |
| `ENABLE_OPENAI_PROVIDER` | gates the probe + a future routing layer | `true` |

### How to verify (repeatable)

```
# fast tier (gpt-4.1-mini, cheapest)
npx tsx scripts/trash/verify-openai-adapter.ts --tier=fast
# strong tier (gpt-4.1)
npx tsx scripts/trash/verify-openai-adapter.ts --tier=strong --force
```

The probe sends one forced `verify_adapter` function tool (`{ ok: boolean, message: string }`), prints only safe fields, and aborts if the key ever appears in the result.

### Results

| Tier | Model | Result | input/output tokens | finishReason | arg shape |
|---|---|---|---|---|---|
| fast | `gpt-4.1-mini` | SUCCESS | 98 / 11 | stop | `{ ok: boolean, message: string }` |
| strong | `gpt-4.1` | SUCCESS | 98 / 11 | stop | `{ ok: boolean, message: string }` |

- **Response shape:** exactly as assumed — `output[].type==="function_call"` with `name` + `arguments` (JSON string). `arguments` parsed to the expected object. **No adapter change required.**
- **Usage/token mapping:** `usage.input_tokens`/`output_tokens` → `ModelSuccess.usage.{inputTokens,outputTokens}` correct.
- **Finish reason:** `status:"completed"` → `"stop"`.
- **No leak:** runtime guard passed; the no-secrets test ([`verify-openai-adapter.test.ts`](../../../tests/unit/scripts/verify-openai-adapter.test.ts)) scans every console line for `apiKey`/`Bearer`/`authorization`/`OPENAI_API_KEY`.
- **Failure mapping (unit-pinned, invalid key NOT burned live):** missing key → `NOT_CONFIGURED`; 401 → `PROVIDER_ERROR` (not retryable); 429 → `RATE_LIMITED`; 5xx → `PROVIDER_ERROR` (retryable); abort → `TIMEOUT`; fetch throw → `NETWORK_ERROR`.

### Telemetry readiness

`getModelById("gpt-4.1" | "gpt-4.1-mini")` resolves `provider:"openai"`, so `recordAiPlanOutcome`'s `providerOf` tags an OpenAI call as `model_provider:"openai"` + the OpenAI `model_name` + tier with no recorder change. The probe deliberately does NOT write `ai_cost_events` — adapter verification is separate from planner telemetry.

### Model ids

`gpt-4.1` (strong) / `gpt-4.1-mini` (fast) are **hardcoded** in `OPENAI_MODELS` (not env-overridable). Both confirmed valid on the account. **Recommendation:** keep them for AI-34C; add env overrides only when there's a measured reason. Classifier vs planner can share the registry (`fast` for the classifier, `strong` for any planner A/B) — no separate env names needed yet.

## J. AI-34C routing recommendation

**Option 1 — GPT fast-tier intent classifier (RECOMMENDED).** Plug a real `gpt-4.1-mini` classifier into the existing AI-31 seam `safeRunNarrowingClassifier` ([`narrowingClassifier.ts`](../../../services/ai/planner/narrowingClassifier.ts)) which already returns `source:"model"` / `modelTier` and has the additive/advisory contract + deterministic fallback baked in. The classifier is add-only — it can NEVER remove a deterministically-narrowed provider — and the planner stays Anthropic/Sonnet 4.6. Safest first product experiment.

**Option 2 — GPT planner A/B for simple/narrowed prompts.** Route only low-risk/narrowed plans to `gpt-4.1`, fall back to Anthropic on parse failure / preview failure / unsupported schema / high-risk action. More direct cost comparison, higher risk.

**Option 3 — keep dormant.** Only if verification had failed. It did not, so this is not recommended.
