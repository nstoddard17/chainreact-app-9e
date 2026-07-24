# AI-PROVIDER-2 — CS-2 Outcome: AI Processor Client & Shared AI Action Infrastructure

**Type:** Implementation outcome (CS-2 of
[ai-provider-platform-plan.md](./ai-provider-platform-plan.md)). Local commit only;
nothing pushed, nothing enabled. `AI_PROCESSOR_ENABLED` remains **OFF** everywhere.
**Date:** 2026-07-24 · **Branch:** `v2-main` (on top of CS-1 `923fcdd99`)

## What shipped

The reusable platform layer every current and future ChainReact AI action executes
through. No workflow action is discoverable or executable; no billing prices changed.

```
services/ai/processor/
├── types.ts                  # AiProcessorClient, AiProcessRequest (task-discriminated),
│                             # AiProcessResult, failure codes, ModelRoute
├── config.ts                 # env reader (mirrors gatewayConfig.ts; default OFF; fail-closed
│                             # on unknown provider values; token never logged)
├── requestShapes.ts          # versioned gateway body builder + first-party message/tool render
├── responseSchemas.ts        # per-task strict Zod validators + JSON Schema compilation
├── gatewayClient.ts          # POST /api/hermes-agent/process; strict envelope; typed failures
├── firstPartyClient.ts       # rides services/ai/modelClients (no SDKs here); same validators
├── createAiProcessorClient.ts# route → concrete client
├── resolveModelRoute.ts      # the routing seam (phase 1: honors AI_PROCESSOR_PROVIDER)
├── aiActionRegistry.ts       # frozen fail-closed declaration home (3 entries)
├── executeAiAction.ts        # the standard pipeline (registry→flag→tier→estimate→gate→
│                             # route→client→validate→ledger)
└── index.ts
```

Canonical contract fixtures for the Render side: `tests/fixtures/ai-processor/`
(3 request bodies generated from the live builder + 14 responses: per-task successes,
all 7 failure codes, malformed success, strict-envelope violation, non-JSON). The
gateway client test asserts fixture ↔ builder parity, so drift fails the build here
before it can bite the Render repo.

## Client interface (frozen)

`process(request: AiProcessRequest): Promise<AiProcessResult>` — one method,
discriminated by `task` (`analyze_document` with mode inside · `transform_data` ·
`suggest_schema`). Adding tasks never changes the interface. The client never throws
for expected failures; results normalize to
`{ok:true, payload:unknown, usage?, modelTag, source}` or
`{ok:false, code, retryable, message}` with codes
`DISABLED | NOT_CONFIGURED | TIMEOUT | RATE_LIMITED | PROVIDER_ERROR |
INVALID_RESPONSE | INPUT_TOO_LARGE | CONTENT_REFUSED`. `payload` stays `unknown`
until the caller's strict validation (delivery contract, not a trust boundary).

## Gateway wire contract (build spec for Render — CS-0)

- `POST ${CHAINREACT_AI_GATEWAY_URL}/api/hermes-agent/process`, bearer token
  header-only, body ≤ 2 MB (client-refused as INPUT_TOO_LARGE above that).
- Request: `{schemaVersion:1, task, mode?, instructions?, question?, document?,
  input?{json}, schema?, labels?, allowOtherLabel?, destinationContext?, outputShape?,
  outputSchema, limits, requestId}` — structured fields, never a prebuilt prompt;
  `requestId` opaque (`aip-<uuid>`); **no account/user/workflow/membership/billing
  identifiers** (test-asserted).
- `outputSchema` is compiled from the committed contracts + the user's declared
  fields; the gateway must force the vendor reply to satisfy it.
- Response: `{ok:true, result:<object matching outputSchema>, usage?, modelTag?}`
  (STRICT — unknown top-level keys fail closed) or `{ok:false, error:CODE}` with
  `INPUT_TOO_LARGE | RATE_LIMITED | MODEL_ERROR | SCHEMA_UNSATISFIABLE |
  CONTENT_REFUSED | UNSUPPORTED_TASK | INTERNAL`. `UNSUPPORTED_TASK` is the
  forward-compat lever. Gateway `usage` is telemetry only, never billing-authoritative.

Error mapping (client-side): 429→RATE_LIMITED(retryable) · 5xx→PROVIDER_ERROR(retryable) ·
other non-2xx→PROVIDER_ERROR(non-retryable) · abort→TIMEOUT(retryable) · non-JSON /
malformed envelope / wrong-task result / SCHEMA_UNSATISFIABLE→INVALID_RESPONSE ·
CONTENT_REFUSED→CONTENT_REFUSED · UNSUPPORTED_TASK→PROVIDER_ERROR(non-retryable).

## executeAiAction — ordering and failure behavior

Ordered, each stage fail-closed before any spend:
1. **Registry lookup** — unknown key → `preflight_refused/unknown_action` (no gate, no call).
2. **Enabled flag** (registry-declared, `AI_PROCESSOR_ENABLED`) → `disabled`.
3. **Tier resolution** vs `supportedTiers` → `tier_unsupported`.
4. **Credit estimate** — an UNPRICED feature → `feature_not_priced` (never the 5-credit
   unmapped fallback). This is the CS-3 seam: pricing the features flips it.
5. **aiCreditGate** — atomic deduct, fail-closed, existing testMode-skip policy →
   `credits_refused` (gate detail attached).
6. **resolveModelRoute → client.process** — failures → `provider_failed{code,retryable}`.
7. **Caller strict validation** — failures → `invalid_output{issues: names only}`.
8. **Ledger write** — `ai_cost_events` via the existing recorder, FAIL-OPEN at the
   pipeline level (a throwing ledger never changes the outcome; test-asserted).
   Metadata: task/mode/tier/routeProvider/source/modelTag/usageSource/counts only.

## Registry + lockstep status

Three frozen entries: `ai:analyze_document`→`document_analysis`(fast|strong) ·
`ai:transform_data`→`data_transform`(fast|strong) · `ai:suggest_schema`→
`schema_suggestion`(fast only; capability/route key, not a canvas action). All declare
structuredOutput:true, streaming:false, testModeAllowed:true, costPreview:true,
enabledFlag:AI_PROCESSOR_ENABLED. Credit AMOUNTS deliberately absent (CS-3 owns
pricing). Lookup is own-property fail-closed (prototype names refused — caught by test).
A registry test pins today's honest state: all three features are unpriced
(`mapped:false`), and CS-3 extends that test into the full
registry ↔ FEATURE_BASE_CREDITS ↔ AiCostFeature ↔ CHECK lockstep.

## Model routing

`resolveModelRoute({feature, tier, task}) → {provider, tier}` — phase 1 honors
`AI_PROCESSOR_PROVIDER`. The seam already receives the future routing dimensions;
per-feature vendor routing lands here as policy with zero changes to actions/registry/
wire contract. Workflow-facing code never sees vendor or model names; the executed
model reports back via `modelTag` for ledger attribution.

## Privacy / no-leak (test-asserted)

Token only in the Authorization header, never in a serialized body, error, or status
(tests assert absence). No account/user/workflow ids in gateway bodies. Failure
messages carry no prompts/document text/values/raw bodies. Ledger metadata excludes
input/output content (pipeline discipline + the existing aiCostEvents key-denylist
sanitizer behind it). Config module is server-only
(`tests/structure/ai-processor-server-only.test.ts` blocks client-layer imports).

## Exact CS-3 follow-ups

1. Widen `core/ai/modelTypes.AiFeature` + `FEATURE_DEFAULT_TIER` with
   `document_analysis` / `data_transform` / `schema_suggestion`; replace
   `firstPartyClient.ts` `PLACEHOLDER_MODEL_FEATURE` ("data_qa") with real keys.
2. Price the three features in `FEATURE_BASE_CREDITS` (plan: 3 / 2 / 1) — flips
   `feature_not_priced` refusals into normal flow (update the registry test's
   pre-CS-3 pin into the full lockstep test).
3. Widen `repositories/aiCostEvents.AiCostFeature` + the `ai_cost_events_feature_chk`
   migration; remove the two documented casts in `executeAiAction.ts` defaultLedger.
4. Add `.env.example` entries for the four `AI_PROCESSOR_*` vars (deferred here —
   the file carries unrelated staged WIP that a docs edit would drag into the commit).

## Deviations from the CS-2 brief

- `errors.ts` not created — failures are typed RESULTS (client contract) and typed
  OUTCOMES (pipeline contract); no throwable error classes were needed.
- The strict success envelope REJECTS unknown top-level keys (the guidance-path
  normalizer tolerates them) — deliberate for a new, versioned contract.
- `suggest_schema` supports `fast` tier only (cheapest capability; widen later if needed).

## Verification (exactly what ran)

`npm run typecheck` 0 errors · `npm run lint:structure` OK · eslint on all new files
clean · CS-2 focused: **49/49 tests pass** (config, gateway client incl. all fixture
mappings, first-party parity, registry, routing, pipeline) · CS-1 regression:
**79/79 pass** (contracts incl. new transform envelopes, core/documents, parsers,
both structure guards, core-purity). Full `npm test` deliberately not re-run
(per-brief; no shared-infra change beyond additive files).
