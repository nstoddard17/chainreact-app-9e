# Native-nodes Slice 1 — Tier A handlers plan

**Status:** Plan / not yet implemented. **Doc-only commit.**
**Accepted audit:** [`docs/slices/parity/parity-native-nodes.md`](./parity-native-nodes.md) (commit `de0a87256`, audit accepted).
**Master plan:** [`docs/slices/phase-2-plan.md`](../phase-2-plan.md).
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`.
**V2 surface (to land):** [`integrations/native/`](../../../integrations/native/) (new dir; mirrors provider-integration layout).

This is the first native-node implementation slice. It ships **3 pure-handler actions**: `http_request`, `format_transformer`, `delay` (narrow ≤30s scope). Zero engine surgery, zero new trigger entry points, zero control-flow semantics. The slice closes the **Tier A** parity gap defined in the accepted audit §7 and proves that the V2 handler / variable-resolver / engine contract works for non-provider-scoped nodes without contract changes.

**Implementation does not begin until this plan is committed and gates are green.**

---

## 1. Accepted native-node audit summary

The accepted audit catalogued V1's native surface as **19 registered native actions + 2 registered native triggers + 6 orphan/dead handlers** against V2's current **zero native nodes**. Audit §7 sorted the gap into 4 tiers:

- **Tier A — pure-handler ports, no engine surgery:** `http_request`, `format_transformer`, `delay` (narrow ≤30s scope). **This slice.**
- **Tier B — needs new entry-point + native trigger registry:** `manual_trigger`, `scheduled_trigger`, run-now API. **Native-nodes Slice 2.**
- **Engine branching slice (prerequisite for Tier C):** edge labels + label-aware BFS + handler `branchTaken` + skip-rest. **Separate slice.**
- **Tier C after engine branching:** `if_then_condition`, `router`. **Native-nodes Slice 3.**
- **Deferred:** loop (Phase 6), wait_for_event (Phase 6), unbounded delay (Phase 6), AI cluster + tavily_search (Phase 5), hitl_conversation (Phase 8), parse_file / extract_website_data / generic webhook trigger (pending product signal), 6 V1 orphan handlers (permanent skip per NPD-N10).

Accepted decision summary, locked at audit acceptance:
- **NPD-N1**: manual_trigger ships behind `POST /api/workflows/[id]/run-now` (Slice 2).
- **NPD-N2**: scheduled_trigger ships in Phase 2 (Slice 2) even though V1 didn't have one.
- **NPD-N3**: generic webhook trigger deferred pending product signal.
- **NPD-N4**: engine branching uses edge labels + handler `branchTaken` return shape.
- **NPD-N5**: loop deferred to Phase 6.
- **NPD-N6**: delay narrow scope — in-process sleep, max 30 seconds, fail loud over cap.
- **NPD-N7**: all AI cluster + tavily_search deferred to Phase 5.
- **NPD-N8**: hitl_conversation deferred to Phase 8.
- **NPD-N9**: parse_file / extract_website_data deferred pending product signal.
- **NPD-N10**: all 6 V1 orphan/dead handlers permanent skip.

---

## 2. Exact Slice 1 scope

This slice ships **exactly 3 native actions**:

| # | V2 type | V1 reference | Audit tier | Engine surgery |
|---|---|---|---|---|
| 1 | `native:http_request` | [`lib/workflows/actions/logic/executeHttpRequest.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/logic/executeHttpRequest.ts) (255 LOC) | Tier A | None |
| 2 | `native:format_transformer` | [`lib/workflows/actions/utility/formatTransformer.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/utility/formatTransformer.ts) (326 LOC) | Tier A | None |
| 3 | `native:delay` (narrow ≤30s) | inline V1 registry entry; no separate handler file | Tier A | None |

All three register against a new `native` provider id in [`services/execution/handlers/_registry.ts`](../../../services/execution/handlers/_registry.ts) — the registry is hand-maintained and dispatches by `(provider, type)` string key, so a new provider id is sufficient. No `WorkflowNodeKindSchema` / `ActionHandler` contract changes.

**No triggers in this slice.** Native triggers (manual + scheduled) are Slice 2 work; Slice 1 nodes are dispatched downstream of any existing provider-scoped trigger or — for unit / e2e tests — a synthesized `manual` trigger event constructed directly in the test (no production manual trigger entry point exists yet).

---

## 3. Explicit out-of-scope list

The following are **NOT** in Slice 1 and must not appear in any of its commits:

| Item | Reason | Where it lands |
|---|---|---|
| `manual_trigger` | Tier B work; needs run-now API endpoint. | Native-nodes Slice 2 |
| `scheduled_trigger` | Tier B work; needs cron-expression validation + scheduled-trigger registry. | Native-nodes Slice 2 |
| Generic webhook trigger | NPD-N3 — deferred pending product signal. | Pending product signal |
| `if_then_condition` | Tier C; blocked on engine-branching slice. | Native-nodes Slice 3 (post engine-branching) |
| `router` | Tier C; same blocker. | Native-nodes Slice 3 |
| `loop` | NPD-N5 — deferred to Phase 6. Largest engine change. | Phase 6 |
| `wait_for_event` | NPD-N5 / NPD-N6 — needs durable queue + pause/resume. | Phase 6 |
| AI cluster (`ai_agent`, `ai_prompt`, `ai_summarize`, `ai_extract`, `ai_classify`, `ai_sentiment`, `ai_translate`, `ai_generate`) | NPD-N7 — deferred to Phase 5 (AI planner integration). | Phase 5 |
| `tavily_search` | NPD-N7 — deferred to Phase 5 with the AI cluster. | Phase 5 |
| `hitl_conversation` | NPD-N8 — deferred to Phase 8 (HITL UX). 5,000 LOC V1 subsystem. | Phase 8 |
| `parse_file` | NPD-N9 — pending product signal. | Deferred |
| `extract_website_data` | NPD-N9 — pending product signal. Legal / ToS surface. | Deferred |
| `executePath` / `executeFilter` V1 duplicate orphans | NPD-N10 — permanent skip. | Never ported |
| `fileUpload.ts` orphan | NPD-N10 — permanent skip. Superseded by P-S3 FileRef contract. | Never ported |
| `googleSearch.ts` orphan | NPD-N10 — permanent skip. V1 chose Tavily. | Never ported |
| `transformer.ts` orphan | NPD-N10 — permanent skip. Superseded by `formatTransformer.ts`. | Never ported |
| `emailClassifier.ts` orphan | NPD-N10 — permanent skip. Folded into generic `ai_classify`. | Never ported |
| Unbounded / durable `delay` | NPD-N6 — narrow ≤30s only. Unbounded delay needs pause/resume. | Phase 6 |

---

## 4. Schema / handler plan — `native:http_request`

### 4.1 File layout

```
integrations/native/actions/httpRequest.ts            # handler (ActionHandler conforming)
integrations/native/actions/httpRequest.schema.ts     # ResolvedConfigSchema (Zod strict)
tests/unit/integrations/native/actions/httpRequest.test.ts
```

Mirrors the Slack / Notion / etc. provider layout (handler + sibling `.schema.ts`). Native nodes are first-class providers with `providerId = "native"`.

### 4.2 Resolved-config schema (strict)

The engine has already pre-resolved every `{{...}}` template before dispatch (per [`docs/rules/variable-resolver.md`](../../rules/variable-resolver.md)). The schema receives concrete strings and validates defense-in-depth against engine bugs / stale workflows.

```typescript
// integrations/native/actions/httpRequest.schema.ts
export const HttpRequestMethodSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);

export const HttpRequestHeaderSchema = z.object({
  key: z.string().min(1).max(128),
  value: z.string().min(0).max(8192),
});

export const HttpRequestQueryParamSchema = z.object({
  key: z.string().min(1).max(256),
  value: z.string().min(0).max(8192),
});

export const HttpRequestAuthSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({ type: z.literal("bearer"), token: z.string().min(1).max(8192) }),
  z.object({
    type: z.literal("basic"),
    username: z.string().min(1).max(256),
    password: z.string().min(1).max(8192),
  }),
  z.object({
    type: z.literal("apiKey"),
    headerName: z.string().min(1).max(128),
    headerValue: z.string().min(1).max(8192),
  }),
]);

export const HttpRequestConfigSchema = z.object({
  method: HttpRequestMethodSchema, // REQUIRED — no silent default (Q11 contract)
  url: z.string().min(1).max(2048),  // validated as http/https URL inside handler
  headers: z.array(HttpRequestHeaderSchema).max(50).optional(),
  queryParams: z.array(HttpRequestQueryParamSchema).max(50).optional(),
  body: z.string().max(1_048_576).optional(),     // ≤1 MiB body
  auth: HttpRequestAuthSchema.optional(),
  timeoutMs: z.number().int().min(100).max(30_000).default(15_000),
});
```

### 4.3 Handler contract

```typescript
// integrations/native/actions/httpRequest.ts
export const httpRequest: ActionHandler = async (input) => {
  const config = HttpRequestConfigSchema.parse(input.config);
  assertSafeUrl(config.url); // http(s) only, reject file://, javascript:, etc.
  // Build URL with queryParams via URLSearchParams.
  // Build headers map; layer auth header LAST so caller-supplied headers
  // cannot accidentally override Authorization.
  // For GET: skip body even if present.
  // Use AbortController with timeoutMs; clear on response or error.
  // Read response.text() — never spread raw body into output.
  // Cap captured body at MAX_RESPONSE_BYTES (256 KiB); on overflow emit
  // { bodyTruncated: true, bytesCaptured }.
  return {
    output: {
      status,
      statusText,
      headers: bounded,
      body: capturedBody,        // string; bounded
      bodyJson,                  // typed unknown if content-type was JSON and parse succeeded; otherwise null
      bodyTruncated,             // boolean
      bytesCaptured,             // number
      durationMs,                // number
    },
  };
};
```

### 4.4 Safety rules (locked at plan time)

- **Strict schema** — no unknown keys silently accepted; Q11-style required `method` (no implicit GET).
- **URL allowlist** — protocol must be `http:` or `https:`. `file://`, `data:`, `javascript:`, `ftp://`, etc. rejected at handler entry. No outbound egress allowlist yet — call this out in the slice outcomes as a future hardening item; not a Slice 1 blocker.
- **Bounded output** — response body capped at 256 KiB; overflow signaled via `bodyTruncated: true`. Headers projection drops `set-cookie` and any header > 2 KiB.
- **Explicit method** — no silent GET fallback.
- **Auth header layering** — auth headers applied last so user-supplied `headers[].key === "Authorization"` cannot smuggle through after the auth scheme builds one.
- **Timeout behavior** — `AbortController` driven; default 15s, max 30s, min 100ms. `AbortError` becomes a typed `HttpRequestTimeoutError` thrown back to the engine — engine converts to `HANDLER_FAILED` step.
- **No secrets logged** — bearer tokens, basic-auth passwords, apiKey values are never emitted in logs. Log lines may include `method`, `urlHostname` (NOT full URL — query string may contain tokens), `status`, `durationMs`. The full resolved URL is intentionally excluded from logs.
- **No `success`/`error` shape** — V1 wrapped failures in `{success: false, error}`. V2 throws on failure and lets the engine convert to a `HANDLER_FAILED` step (matches every existing V2 handler).
- **Variable resolution stays at the engine layer** — V1's `resolveVariables` helpers inside the handler are DELETED, not ported. The engine has already substituted templates before the handler runs.

### 4.5 What is NOT ported from V1

| V1 surface | Why dropped |
|---|---|
| Inline `resolveVariables(text, previousOutputs)` | Engine pre-resolution owns this; handler must not re-resolve. |
| `getNestedValue` helper | Same — engine resolver. |
| `success: false` return shape on failure | V2 contract is throw → engine converts to step failure. |
| Default `Content-Type: application/json` when body present | Silent default; defer to explicit caller header. |
| Tolerant `authType?: ... = 'none'` default | V2 schema makes `auth` optional with explicit `{type:"none"}` discriminator if needed. |
| `KeyValuePair.isVariable` flag | Engine handles all template threading; no per-pair flag needed. |

---

## 5. Schema / handler plan — `native:format_transformer`

### 5.1 File layout

```
integrations/native/actions/formatTransformer.ts
integrations/native/actions/formatTransformer.schema.ts
tests/unit/integrations/native/actions/formatTransformer.test.ts
```

### 5.2 Resolved-config schema (strict)

```typescript
// integrations/native/actions/formatTransformer.schema.ts
export const FormatTransformerFormatSchema = z.enum([
  "html",
  "markdown",
  "plain",
  "slack_markdown",
]);

export const FormatTransformerSourceSchema = z.union([
  FormatTransformerFormatSchema,
  z.literal("auto"),
]);

export const FormatTransformerConfigSchema = z.object({
  content: z.string().min(0).max(1_048_576),       // ≤1 MiB input
  sourceFormat: FormatTransformerSourceSchema.default("auto"),
  targetFormat: FormatTransformerFormatSchema,     // REQUIRED — no silent default
});
```

### 5.3 Handler contract

```typescript
// integrations/native/actions/formatTransformer.ts
export const formatTransformer: ActionHandler = async (input) => {
  const config = FormatTransformerConfigSchema.parse(input.config);
  const detected = config.sourceFormat === "auto"
    ? detectFormat(config.content)
    : config.sourceFormat;
  const transformed = transform(config.content, detected, config.targetFormat);
  return {
    output: {
      transformedContent: transformed,    // string; bounded ≤2 MiB (max 2x input)
      sourceFormat: detected,             // resolved (never "auto")
      targetFormat: config.targetFormat,
      inputLength: config.content.length,
      outputLength: transformed.length,
    },
  };
};
```

### 5.4 Safety rules (locked at plan time)

- **Strict schema** — `.strict()` on the Zod object; unknown keys (e.g. V1's `preserveVariables` cosmetic flag) rejected at parse.
- **Deterministic transforms** — no LLM calls, no network, no filesystem. Pure string-in / string-out using:
  - Regex-based detector (mirrors V1's `looksLikeHTML` + `looksLikeMarkdown`).
  - `turndown` for HTML → Markdown (existing V1 dependency; verify or vendor a minimal subset).
  - In-tree converters for Markdown → HTML / Markdown → Plain / HTML → Plain / Plain → HTML / Markdown → Slack Markdown.
- **Bounded output** — input capped at 1 MiB at schema; transformed output capped at 2 MiB. Overflow throws (no silent truncation — caller surface is small enough that breakage is loud and obvious).
- **No `eval` / no arbitrary code execution** — explicit lint guard / code-review checklist item.
- **No upstream-attachment pass-through** — V1's `findUpstreamAttachments` walker is DELETED. Attachments are a P-S3 FileRef concern; format_transformer is text-only. Workflow authors compose attachment passing explicitly via separate config fields on downstream nodes.
- **No `success`/`error` shape** — same as `http_request`. Throw → engine HANDLER_FAILED.
- **No test-mode short-circuit** — V1 had a `testMode` branch that returned canned output. V2 has no testMode flag in `ActionHandlerInput`; the handler runs identically in unit tests and production. Tests mock `turndown` if needed.

### 5.5 What is NOT ported from V1

| V1 surface | Why dropped |
|---|---|
| `preserveVariables` flag | Cosmetic — engine has already resolved templates. |
| `testMode` branch returning fake transformation | No testMode flag in V2 ActionHandlerInput. |
| `findUpstreamAttachments` walker | P-S3 FileRef contract owns attachments; not this node. |
| `formatRichTextForTarget` Slack-specific helper coupling | Slack-target conversion stays in-tree but isolated; no cross-provider coupling. |
| `success: false, output: {}, message: "..."` return shape | V2 contract is throw → engine step failure. |
| `resolveValue` call inside handler | Engine pre-resolves; handler must not re-resolve. |

---

## 6. Schema / handler plan — `native:delay`

### 6.1 File layout

```
integrations/native/actions/delay.ts
integrations/native/actions/delay.schema.ts
tests/unit/integrations/native/actions/delay.test.ts
```

### 6.2 Resolved-config schema (strict)

```typescript
// integrations/native/actions/delay.schema.ts
export const DELAY_MAX_SECONDS = 30;

export const DelayConfigSchema = z.object({
  seconds: z.number().int().min(1).max(DELAY_MAX_SECONDS), // REQUIRED, no default
});
```

### 6.3 Handler contract

```typescript
// integrations/native/actions/delay.ts
export const delay: ActionHandler = async (input) => {
  const config = DelayConfigSchema.parse(input.config);
  // Defensive guard — fail loud if any caller bypasses the schema (e.g.
  // an out-of-band config save / older client) and hands us >30s.
  if (config.seconds > DELAY_MAX_SECONDS) {
    throw new DelayCapExceededError(config.seconds, DELAY_MAX_SECONDS);
  }
  const startedAt = Date.now();
  await new Promise((resolve) => setTimeout(resolve, config.seconds * 1000));
  return {
    output: {
      delayedSeconds: config.seconds,
      startedAt: new Date(startedAt).toISOString(),
      completedAt: new Date().toISOString(),
    },
  };
};
```

### 6.4 Safety rules (locked at plan time)

- **Strict schema** — `seconds` required, integer, range `[1, 30]`. No `minutes` / `hours` / `units` field (V1 had unit selection — DELETED to enforce narrow scope at the type level).
- **Fail loud over cap** — second guard inside the handler throws `DelayCapExceededError` if any value > 30s reaches it (defense-in-depth against schema bypass).
- **In-process only** — `setTimeout` inside the same Node process. No queueing, no persistence, no durable timer. If the process is restarted during the delay, the workflow run dies — this is the intentional cost of the narrow scope.
- **No durable delay surface** — durable / unbounded delay requires pause/resume infrastructure (BullMQ / Inngest / equivalent) and is **deferred to Phase 6** per NPD-N6.
- **Output is observable** — `delayedSeconds`, `startedAt`, `completedAt` so downstream nodes can reference timing if useful.
- **No node output corruption** — `variables[nodeId]` is set to the delay's output once and never re-set. Concurrent / interleaved execution is impossible because the engine is single-threaded BFS.

### 6.5 What is NOT ported from V1

| V1 surface | Why dropped |
|---|---|
| `minutes` / `hours` unit field | NPD-N6 narrow scope — only seconds, max 30. |
| Unbounded delay | NPD-N6 — deferred to Phase 6 with pause/resume infra. |
| Inline registry implementation (no separate file) | V2 ships dedicated handler + schema files for testability and consistency with other native actions. |

---

## 7. Native node registration plan

### 7.1 Provider id

The slice introduces `providerId = "native"`. This is a new top-level provider value used for all three actions. Native nodes are NOT integrations — they have no OAuth, no token storage, no manifest scope, no rate-limit owner. The provider id is purely a dispatch routing key in the handler registry.

**No `ProviderManifest` is created for `"native"`.** The provider manifest registry is for OAuth-backed integrations. Native nodes register directly into the handler registry without a manifest.

### 7.2 Handler registry entries

Add to [`services/execution/handlers/_registry.ts`](../../../services/execution/handlers/_registry.ts) in a dedicated block at the end of `ALL_HANDLERS`:

```typescript
import { httpRequest as nativeHttpRequest } from "@/integrations/native/actions/httpRequest";
import { formatTransformer as nativeFormatTransformer } from "@/integrations/native/actions/formatTransformer";
import { delay as nativeDelay } from "@/integrations/native/actions/delay";

// ... existing ALL_HANDLERS entries ...
// Native-nodes Slice 1 — Tier A pure-handler ports
// (parity-native-nodes.md §7 Tier A + native-nodes-1-tier-a-plan.md).
{ provider: "native", type: "http_request", handler: nativeHttpRequest },
{ provider: "native", type: "format_transformer", handler: nativeFormatTransformer },
{ provider: "native", type: "delay", handler: nativeDelay },
```

The existing `getActionHandler(provider, type)` lookup works as-is — string key `"native:http_request"` etc.

### 7.3 Workflow definition

`WorkflowNode.provider = "native"` + `WorkflowNode.type ∈ {"http_request", "format_transformer", "delay"}` + `WorkflowNode.kind = "action"`.

**No schema widening** to `WorkflowNodeKindSchema` (stays `"trigger" | "action"`). **No new field on `WorkflowEdge`** (no edge labels — that's the engine-branching slice). **No new fields on `WorkflowNode`** beyond what already exists.

### 7.4 What does NOT change

- `contracts/workflow.ts` — untouched.
- `contracts/workflowDefinition.ts` — untouched.
- `contracts/triggerEvent.ts` — untouched.
- `services/execution/engine.ts` — untouched.
- `services/execution/handlers/types.ts` (`ActionHandler` shape) — untouched.
- `workflow-engine/variables/resolveValue.ts` — untouched.
- `services/triggers/` — untouched. No native triggers in Slice 1.
- `integrations/_registry.ts` — untouched. Native nodes have no manifest; no side-effect trigger registration.
- Database schema — untouched. No new tables / columns / migrations.

### 7.5 Folder count check

[`scripts/check-leaf-folder-counts.mjs`](../../../scripts/check-leaf-folder-counts.mjs) caps any directory at 50 source files. `integrations/native/actions/` will hold 3 actions × 2 files = 6 files. `tests/unit/integrations/native/actions/` will hold 3 test files. Well under the limit.

---

## 8. Execution engine impact

**Zero changes to the engine for Tier A.** All three handlers are pure adapters that conform to the existing `ActionHandler` contract:

```typescript
(input: ActionHandlerInput) => Promise<ActionHandlerResult>
```

Specifically:

- **No branching** — handlers return a single `{output}` shape. Engine BFS continues to enqueue all downstream nodes regardless of handler output. (Branching arrives in the engine-branching slice; if/router action handlers consume it; Slice 1 handlers do not.)
- **No loop scope** — handlers execute exactly once per node visit. Iteration is Phase 6 work.
- **No pause/resume** — `delay` blocks the engine's single in-process BFS loop via `setTimeout` for ≤30s. Pause/resume infrastructure is Phase 6 work.
- **No new step states** — `RunStepResult.status` stays `"succeeded" | "failed" | "skipped"`. No `"paused"` or `"waiting"` states introduced.
- **No new `RunFailureCode`** — handler failures (timeout, cap exceeded, schema parse) throw through to the engine's existing `HANDLER_FAILED` path.

Slice 1 is the empirical confirmation that V2's existing contracts already accommodate non-provider-scoped nodes. If implementation surfaces a contract gap, that's a finding worth surfacing in the outcomes doc — but the audit's analysis says no gap exists.

---

## 9. Data-passing tests

Three data-passing properties must be proven by Slice 1 tests:

### 9.1 Native node output feeds downstream provider action config

Test: linear graph `trigger → native:http_request → slack:send_channel_message` where the Slack message text references `{{<http_request_node_id>.status}}` and `{{<http_request_node_id>.body}}`. The engine's pre-resolution must substitute these before the Slack handler runs.

Coverage: e2e walkthrough (Section 11) + engine-level integration test using the existing `bfsExecutionOrder` + injected `resolveStrict`.

### 9.2 Upstream provider output feeds native node config

Test: linear graph `gmail:new_email_trigger → native:format_transformer` where `format_transformer.config.content` references `{{<gmail_trigger_node_id>.payload.bodyHtml}}`. Confirms the engine treats native nodes' configs identically to provider node configs at resolution time.

Coverage: same engine-level integration test as 9.1; mirrors the existing Slack 2.x `trigger → action` data-passing assertions.

### 9.3 Delay does not corrupt node output state

Test: linear graph `trigger → action_a → native:delay → action_b` where `action_b.config` references `{{<action_a_node_id>.someField}}`. After the delay's `setTimeout` fires, the engine must still find `variables[action_a_node_id].someField` intact and resolve it. Specifically:

- `variables[<delay_node_id>]` is set ONCE (to the delay's `{delayedSeconds, startedAt, completedAt}` output) and never mutated.
- Pre-existing `variables[<action_a_node_id>]` is not touched.
- The engine's BFS does not re-enter the delay node (visited-set guarantees this; test asserts no double-execution).

Coverage: engine-level integration test with `jest.useFakeTimers()` to fast-forward the `setTimeout` without burning 30 wall-clock seconds.

---

## 10. Unit test plan

### 10.1 `httpRequest.test.ts` — target ~25-30 tests

| Group | Test |
|---|---|
| Schema | Required `method` enforced (omit → ZodError with field path). |
| Schema | Required `url` enforced. |
| Schema | `method` rejects unknown verb (e.g. `"OPTIONS"`). |
| Schema | `url` length cap (>2048 → rejected). |
| Schema | `headers[]` max length (>50 → rejected). |
| Schema | `body` size cap (>1 MiB → rejected). |
| Schema | `auth` discriminator: bearer / basic / apiKey / none — each happy + one missing required field. |
| Schema | `timeoutMs` range: < 100 rejected, > 30_000 rejected, default 15_000 when omitted. |
| URL | `http://` allowed, `https://` allowed. |
| URL | `file://` / `data:` / `javascript:` / `ftp://` rejected with `UnsupportedUrlSchemeError`. |
| Dispatch | GET request — querystring built from `queryParams`. |
| Dispatch | POST with JSON body — body forwarded verbatim (engine resolved). |
| Dispatch | GET with `body` present — body skipped (matches `fetch` semantics + V1 behavior). |
| Auth | Bearer header `Authorization: Bearer <token>` set. |
| Auth | Basic header `Authorization: Basic <base64(user:pass)>` set. |
| Auth | apiKey header named `headerName` set to `headerValue`. |
| Auth | User-supplied `Authorization` in `headers[]` does NOT override auth-scheme-built `Authorization`. |
| Output | Successful 200 — output shape `{status, statusText, headers, body, bodyJson, bodyTruncated, bytesCaptured, durationMs}`. |
| Output | 404 / 500 — handler resolves normally (HTTP errors are NOT thrown by the handler; status code is in output). |
| Output | JSON content-type — `bodyJson` populated; non-JSON — `bodyJson` is `null`. |
| Output | Response body > 256 KiB — captured body truncated; `bodyTruncated: true`; `bytesCaptured` reflects full size. |
| Output | `set-cookie` header dropped from output headers projection. |
| Output | Header value > 2 KiB dropped. |
| Timeout | Slow response > timeoutMs → `HttpRequestTimeoutError` thrown. |
| Network error | Connection refused → `Error` thrown; engine converts to HANDLER_FAILED. |
| Logging | Bearer token / basic password / apiKey value never in log lines (assert on captured `console.info` calls). |
| Logging | Full URL never in log lines — `urlHostname` only. |

### 10.2 `formatTransformer.test.ts` — target ~20-25 tests

| Group | Test |
|---|---|
| Schema | Required `targetFormat` enforced. |
| Schema | `sourceFormat` defaults to `"auto"` when omitted. |
| Schema | Unknown keys (e.g. `preserveVariables`) rejected with `.strict()`. |
| Schema | Input length cap (>1 MiB → rejected). |
| Detection | HTML detected when content contains tags. |
| Detection | Markdown detected when content contains `**bold**` / `# heading` / `[link](url)`. |
| Detection | Plain text fallback when neither HTML nor markdown patterns match. |
| Detection | Empty string → `"plain"`. |
| Transform | HTML → Plain — strips tags via turndown + post-processing. |
| Transform | HTML → Markdown — turndown output. |
| Transform | HTML → Slack Markdown — Slack-target conversion. |
| Transform | HTML → HTML — passthrough (no-op). |
| Transform | Markdown → HTML — in-tree converter. |
| Transform | Markdown → Plain — strips formatting. |
| Transform | Markdown → Slack Markdown — `**` → `*` substitution. |
| Transform | Markdown → Markdown — passthrough. |
| Transform | Plain → HTML — wraps in `<p>`, converts newlines to `<br>`. |
| Transform | Plain → Markdown / Plain → Slack — passthrough (plain is compatible). |
| Output | `{transformedContent, sourceFormat, targetFormat, inputLength, outputLength}` shape. |
| Output | `sourceFormat` is the resolved value, never `"auto"`. |
| Limits | Output > 2 MiB → throws (no silent truncation). |
| Safety | No `eval` / no `Function` constructor used (grep-test of the handler module). |

### 10.3 `delay.test.ts` — target ~10-12 tests

| Group | Test |
|---|---|
| Schema | Required `seconds`. |
| Schema | `seconds` integer (1.5 → rejected). |
| Schema | `seconds` range — 0 rejected, 31 rejected, 1 allowed, 30 allowed. |
| Schema | Unknown keys (e.g. `unit: "minutes"`) rejected. |
| Handler | Defensive cap guard — if a 31s value bypasses the schema (mock-patched), handler throws `DelayCapExceededError`. |
| Handler | Output shape `{delayedSeconds, startedAt, completedAt}`. |
| Handler | `completedAt - startedAt >= seconds * 1000` (with fake timers, exact). |
| Handler | Uses `setTimeout` — verified via `jest.useFakeTimers()` and a single `jest.advanceTimersByTime(seconds * 1000)`. |
| Handler | Returns ONLY after the timer elapses (no early resolution). |
| Handler | Output is observable via the standard `ActionHandlerResult.output` shape. |

---

## 11. E2E plan

One new Playwright walkthrough at `tests/e2e/native-nodes-slice-1-walkthrough.spec.ts` exercises the full Slice 1 surface end-to-end against the existing engine + handler registry. Patterned on the existing Mailchimp / Slack walkthroughs.

### 11.1 Scenario: linear chain `manual seed → http_request → format_transformer → slack.send_channel_message`

Since manual triggers don't ship until Slice 2, the e2e seeds a workflow run via a synthesized `TriggerEvent` (provider `"slack"`, `eventType: "test"`, the standard test pattern from Slack 2.x walkthroughs) and asserts:

1. **Engine dispatches `native:http_request`** with the resolved config (URL pulled from the trigger event payload via `{{trigger.payload.url}}`).
2. **HTTP mock server returns a JSON body** capturing the request shape.
3. **`format_transformer` receives `{{<http_request_node_id>.bodyJson.message}}`** as its `content` — proves native-output → native-input data passing.
4. **`slack.send_channel_message` receives `{{<format_transformer_node_id>.transformedContent}}`** — proves native-output → provider-input data passing.
5. **`workflow_runs` row records 4 step outputs** with the correct `status: "succeeded"` for all four nodes.

### 11.2 Scenario: `delay` does not corrupt downstream variable resolution

A second e2e (smaller, separate spec block):

1. **Linear chain** `trigger → http_request → delay (2s) → slack.send_channel_message`.
2. **Use fake timers** (Playwright supports `page.clock.fastForward` for in-browser; engine runs server-side so the e2e seeds with `seconds: 1` and tolerates wall-clock 1s).
3. **Slack message text references** `{{<http_request_node_id>.status}}` — assert it resolves to the recorded HTTP status code (e.g. `"200"`), not `undefined` and not the literal template.
4. **`workflow_runs.steps[]` records the delay step** with `output: {delayedSeconds, startedAt, completedAt}`.

### 11.3 Scenario: schema-fail / cap-exceeded paths

A third e2e block:

1. **`http_request` with `method` omitted** → engine returns `HANDLER_FAILED` (Zod parse error surfaces as the step error message).
2. **`delay` with `seconds: 60`** → engine returns `HANDLER_FAILED` with `DelayCapExceededError` message.
3. **`format_transformer` with unknown `preserveVariables` key** → engine returns `HANDLER_FAILED` (`.strict()` rejection).

Each schema-fail assertion proves that defense-in-depth catches malformed configs without crashing the engine.

---

## 12. Commit sequence

| # | Commit | Files touched | Approx LOC |
|---|---|---|---|
| 0 | **This plan** (`docs(native-nodes): plan tier a handlers`) | `docs/slices/parity/native-nodes-1-tier-a-plan.md` | — (doc-only) |
| 1 | `feat(native): add http_request action` — handler + schema + tests + registry entry | `integrations/native/actions/httpRequest.ts`, `integrations/native/actions/httpRequest.schema.ts`, `tests/unit/integrations/native/actions/httpRequest.test.ts`, `services/execution/handlers/_registry.ts` (1 line + 1 import) | ~280 src + ~400 test |
| 2 | `feat(native): add format_transformer action` — handler + schema + tests + registry entry | `integrations/native/actions/formatTransformer.ts`, `integrations/native/actions/formatTransformer.schema.ts`, `tests/unit/integrations/native/actions/formatTransformer.test.ts`, `services/execution/handlers/_registry.ts` (1 line + 1 import) | ~220 src + ~320 test |
| 3 | `feat(native): add delay action (narrow ≤30s)` — handler + schema + tests + registry entry | `integrations/native/actions/delay.ts`, `integrations/native/actions/delay.schema.ts`, `tests/unit/integrations/native/actions/delay.test.ts`, `services/execution/handlers/_registry.ts` (1 line + 1 import) | ~90 src + ~170 test |
| 4 | `test(e2e): native-nodes slice 1 walkthrough` — chained data passing + delay + schema-fail e2e | `tests/e2e/native-nodes-slice-1-walkthrough.spec.ts` + mock helpers if needed | ~350 e2e |
| 5 | `docs(native-nodes): slice 1 outcomes` — retro + any durable CLAUDE.md rule additions | `docs/slices/parity/native-nodes-1-tier-a-outcomes.md` | — (doc-only) |

**Each commit gates locally with:**

```
npx tsc --noEmit
npm run lint
npm run lint:structure
npm run lint:migrations
npm test
```

No commit lands until all five gates pass.

**Approx total:** ~590 src LOC + ~890 test LOC + ~350 e2e LOC = ~1,830 LOC. ~Airtable 2.1 / Sheets 2.2 scale.

---

## 13. Implementation expectations (locked at plan time)

These are the durable contracts that the implementation commits MUST honour. Deviation requires re-acceptance of this plan.

### `http_request`

- Strict resolved-config schema with required `method` (no silent default).
- Bounded output — body ≤ 256 KiB captured, overflow signaled via `bodyTruncated`.
- No raw unbounded body spread into output — output projection is explicit.
- Explicit method (Q11 — no hidden defaults).
- Safe headers behavior — auth-scheme header applied last; cannot be overridden by user `headers[]`.
- Timeout via `AbortController`, default 15s, max 30s.
- No secrets in logs — bearer / basic / apiKey values never emitted; full URL never emitted (query string may contain tokens).
- Handler throws on failure; engine converts to `HANDLER_FAILED` step.

### `format_transformer`

- Strict resolved-config schema with required `targetFormat` and `.strict()` unknown-key rejection.
- Deterministic transforms — no LLM, no network, no filesystem.
- Bounded output — input ≤ 1 MiB, output ≤ 2 MiB, overflow throws.
- No `eval` / no arbitrary code execution.
- Handler throws on failure; engine converts to `HANDLER_FAILED` step.
- No `testMode` branch; no `findUpstreamAttachments` walker; no inline `resolveValue` (engine pre-resolution owns variables).

### `delay`

- Strict resolved-config schema with required `seconds` integer in `[1, 30]`.
- Max 30 seconds — at both the schema level AND a defensive handler-level guard.
- In-process only — `setTimeout` inside the engine's BFS loop.
- Fail loud over cap — defense-in-depth `DelayCapExceededError` if schema is somehow bypassed.
- Durable / unbounded delay deferred to Phase 6 (NPD-N6).
- Output is observable: `{delayedSeconds, startedAt, completedAt}`.

---

## 14. Exit checklist — Slice 1 implementation complete when:

- [ ] All 3 handler files + 3 schema files + 3 unit-test files committed.
- [ ] Registry entries added in [`services/execution/handlers/_registry.ts`](../../../services/execution/handlers/_registry.ts).
- [ ] All 3 handlers conform to `ActionHandler` contract (no signature changes).
- [ ] Engine / contracts / migrations untouched.
- [ ] Unit test suite passes — ~55-65 new tests across the three modules.
- [ ] E2E walkthrough at `tests/e2e/native-nodes-slice-1-walkthrough.spec.ts` proves: native↔provider data passing, delay-doesn't-corrupt-state, schema-fail paths.
- [ ] Outcomes doc landed at `docs/slices/parity/native-nodes-1-tier-a-outcomes.md` capturing any divergence from this plan + durable CLAUDE.md rule additions.
- [ ] All gates green: `npx tsc --noEmit`, `npm run lint`, `npm run lint:structure`, `npm run lint:migrations`, `npm test`.
- [ ] No `git add .` — every commit uses explicit path staging on `v2-provider-port-local`.
- [ ] No push, no PR.
