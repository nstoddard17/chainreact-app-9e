# Parity audit — Native / non-provider workflow nodes

**Status:** Audit / not yet accepted. **Doc-only commit.**
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`
**V2 baseline:** [`services/execution/`](../../../services/execution/), [`services/triggers/`](../../../services/triggers/), [`workflow-engine/`](../../../workflow-engine/), [`contracts/workflow.ts`](../../../contracts/workflow.ts).
**Phase 1 surface shipped:** **Zero native nodes.** V2 ships only provider-scoped triggers + actions. Engine traversal is pure BFS with a visited-set (no control-flow semantics). Variable resolver pre-resolves `{{nodeId.field}}` references into config before each handler call — that's the entire native-node-adjacent platform surface today.

**Recommendation up front.** V1 ships ~16 registered native actions + 2 native triggers across `logic` / `automation` / `utility` / `ai` / `hitl` providers; V2 ships **0** of those. This is the largest single Phase 2 parity gap by surface area but ALSO the most platform-coupled — large chunks require engine-layer changes V2 doesn't have today (no edge-labeled branching, no loop iteration scope, no pause/resume, no manual-run entry point). The audit decomposes the gap into **four tiers**:

- **Tier A — straightforward port (1 platform slice, no engine surgery):** `http_request`, `format_transformer` (basic text/JSON manipulation), `delay` if scoped narrowly to "skip the next N seconds". ~3 actions.
- **Tier B — needs new entry-point + native trigger registry (1 platform slice):** `manual_trigger` (test-run / run-now API), `scheduled_trigger` (cron entry point — V1 didn't ship one but V2's cron infra makes this cheap). 2 triggers. **NPD-N1 + NPD-N2 product decisions block.**
- **Tier C — needs new engine semantics (multi-slice platform tier):** `loop`, `router` (multi-path branching), `if_then_condition` (single-branch with skip-rest semantics), `wait_for_event` (pause/resume). ~3 control-flow actions + 1 pause action. **NPD-N4 + NPD-N6 are large platform-tier decisions.**
- **Tier D — defer to Phase 5 / later phases (post-Phase-2):** `ai_agent` + 7 AI sub-actions, `hitl_conversation` (full HITL stack including Discord/Slack interactions + memory service), `tavily_search`, `extract_website_data`, `parse_file`. These are Phase 5 (AI planner integration) or Phase 8 (HITL UX) work. **NPD-N7 + NPD-N8 defer the entire AI/HITL surface from Phase 2.**

**Phase 2 native-nodes minimum recommendation: Tier A + Tier B + a subset of Tier C** (`if_then_condition` first, then `router`; `loop` and `wait_for_event` deferred unless Marcus signs off on the engine work). Tier D entirely deferred. Total estimated platform work: **2-4 slices** (depending on Tier C scope acceptance) before Phase 2 can be called "native-nodes complete".

**No native-node implementation begins until Marcus accepts the audit AND each open product/architecture decision (NPD-N1..NPD-N10).**

---

## 1. V1 source paths audited

**Native-ish provider directories** (under [`lib/workflows/nodes/providers/`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers)):

| Dir | LOC | Purpose |
|---|---:|---|
| `logic/` | 626 | Manifest for `router`, `http_request`, `if_then_condition`, `delay`, `loop` (5 native actions). |
| `automation/` | 683 | Manifests for `webhook` trigger, `manual_trigger` trigger, `hitl_conversation` action, `wait_for_event` action. Split into 4 files. |
| `generic/triggers.ts` | 5 | **Empty array.** Backwards-compat stub — "All trigger nodes (webhook, schedule, manual) are now in providers/automation/" (comment). |
| `utility/index.ts` | 538 | Manifest for `format_transformer`, `parse_file`, `extract_website_data`, `tavily_search` (4 native actions). |
| `ai/index.ts` | 49 | Manifest header (composes from `aiAgentNode.ts`). |
| `ai/aiAgentNode.ts` | 656 | Manifest for the `ai_agent` action (single big node — fan-out to 7 sub-action types via schema aliases). |
| `misc/index.ts` | 3,793 | **NOT native** — third-party provider catch-all (ManyChat, Gumroad, etc.). Out of scope. |

**Native handler directories** (under [`lib/workflows/actions/`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions)):

| Dir | Files | Total LOC |
|---|---:|---:|
| `logic/` | `executeFilter.ts` (194) + `executeHttpRequest.ts` (255) + `executePath.ts` (193) + `executeRouter.ts` (269) + `loop.ts` (339) + `__tests__/` | 1,250 |
| `automation/` | `waitForEvent.ts` (126) | 126 |
| `utility/` | `extractWebsiteData.ts` (651) + `fileUpload.ts` (292) + `formatTransformer.ts` (326) + `googleSearch.ts` (130) + `index.ts` (10) + `parseFile.ts` (426) + `tavilySearch.ts` (209) + `transformer.ts` (222) | 2,266 |
| `ai/` | `emailClassifier.ts` (127) | 127 |
| `hitl/` | `conversation.ts` (302) + `discord-interactions.ts` (208) + `discord.ts` (139) + `downstreamVariables.ts` (624) + `enhancedConversation.ts` (922) + `externalProviders.ts` (665) + `index.ts` (848) + `memoryService.ts` (546) + `nodeContext.ts` (276) + `types.ts` (85) | 4,615 |

**Total native handler LOC across V1: ~8,400.**

**Registry wiring** ([`lib/workflows/actions/registry.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/registry.ts) — ~1,640 LOC total):
- Native entries at lines 679–697 (8 AI variants), 1577–1605 (utility + logic + loop), 1608 (`hitl_conversation`).
- `wait_for_event` is "specially handled" — registered separately because it needs workflow + execution context (line ~1621).

**Execution engine support** ([`lib/execution/advancedExecutionEngine.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/execution/advancedExecutionEngine.ts)) + [`lib/services/executionHandlers/actionHandlers.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/services/executionHandlers/actionHandlers.ts):
- Loop iteration scope (`loop_executions` table backs progress tracking).
- Router multi-path dispatch (paths visited conditionally based on `executeRouter` output).
- Filter / if-then skip-rest semantics.
- HITL pause/resume (waits for external interaction).

**Tests:** sparse. Only `lib/workflows/actions/logic/__tests__/` directory exists for native-handler unit tests; coverage density is much lower than provider tests.

---

## 2. V1 native actions inventory

**16 registered native actions** + ~5 orphan handler files (NOT registered):

### 2a. Logic provider (5 registered)

| # | V1 action type | One-line description | Handler | Status |
|---|---|---|---|---|
| 1 | `router` | Multi-path conditional routing — fan-out to N paths based on per-path conditions (any/all matched). | `executeRouter.ts` (269 LOC) | live |
| 2 | `http_request` | Make HTTP request (GET/POST/PUT/PATCH/DELETE) with headers, body, query, basic-auth. Output: status / body / headers. | `executeHttpRequest.ts` (255 LOC) | live |
| 3 | `if_then_condition` | Single-branch conditional — proceed only if the configured expression evaluates true; otherwise skip rest of workflow. | `executePath.ts` (193 LOC) OR `executeFilter.ts` (194 LOC) — **NEEDS CONFIRMATION** which is the wired handler | live |
| 4 | `delay` | Pause workflow for a configurable duration (seconds / minutes / hours). | inline in registry; no separate handler file | live |
| 5 | `loop` | Iterate over an array (items mode) OR repeat N times (count mode). Per-iteration nested workflow execution. Progress tracked in `loop_executions` table. | `loop.ts` (339 LOC) | live |

### 2b. Automation provider (1 registered)

| # | V1 action type | One-line description | Handler | Status |
|---|---|---|---|---|
| 6 | `wait_for_event` | Pause workflow until an external event arrives (e.g. webhook receives matching payload). Specially-handled — needs workflow + execution context for resume. | `waitForEvent.ts` (126 LOC) | live (special) |

### 2c. Utility provider (4 registered)

| # | V1 action type | One-line description | Handler | Status |
|---|---|---|---|---|
| 7 | `format_transformer` | Transform text / JSON between formats (camelCase ↔ snake_case, JSON / YAML / XML conversion, regex replace, etc.). | `formatTransformer.ts` (326 LOC) | live |
| 8 | `parse_file` | Parse uploaded file content into structured data (CSV / JSON / XML / etc.). Overlaps with P-S3 file output contract. | `parseFile.ts` (426 LOC) | live |
| 9 | `extract_website_data` | Scrape a URL and extract structured data via CSS selectors / regex. | `extractWebsiteData.ts` (651 LOC) | live |
| 10 | `tavily_search` | LLM-search via Tavily API. Returns ranked results + extracted content. | `tavilySearch.ts` (209 LOC) | live |

### 2d. AI provider (8 registered as schema aliases routing to 2 generic handlers)

| # | V1 action type | One-line description | Handler | Status |
|---|---|---|---|---|
| 11 | `ai_agent` | Full AI agent node — model selection, system/user prompts, tool use, memory. 656-LOC manifest. | `executeAIAgentWrapper` | live |
| 12 | `ai_prompt` | Generic content generation (alias → `generateContent`). | inline | live |
| 13 | `ai_summarize` | Summarization (alias → `summarizeContent`). | inline | live |
| 14 | `ai_extract` | Information extraction (alias → `extractInformation`). | inline | live |
| 15 | `ai_classify` | Classification (alias → `classifyContent`). | inline | live |
| 16 | `ai_sentiment` | Sentiment analysis (alias → `analyzeSentiment`). | inline | live |
| 17 | `ai_translate` | Translation (alias → `translateText`). | inline | live |
| 18 | `ai_generate` | Alias of `ai_prompt` → `generateContent`. | inline | live |

### 2e. HITL provider (1 registered)

| # | V1 action type | One-line description | Handler | Status |
|---|---|---|---|---|
| 19 | `hitl_conversation` | Human-in-the-loop conversation. Sends messages to Discord/Slack/email, waits for human reply, optionally persists conversation memory. ~5,000 LOC tree across `hitl/`. | `lib/workflows/actions/hitl/index.ts` | live |

### 2f. Orphan / dead native handlers (NOT registered)

| Handler file | LOC | Suspected purpose | Decision |
|---|---:|---|---|
| `lib/workflows/actions/logic/executeFilter.ts` | 194 | One of `executeFilter` / `executePath` is unwired (both look like single-branch conditionals — duplicate implementations). | **PERMANENT SKIP** — V1 rot R5 (dead handler graph). |
| `lib/workflows/actions/logic/executePath.ts` | 193 | Same duplicate-implementation pattern. | **PERMANENT SKIP** — same. |
| `lib/workflows/actions/utility/fileUpload.ts` | 292 | Pre-P-S3 file-upload action; obsoleted by V2's file-output contract. | **PERMANENT SKIP** — superseded by P-S3. |
| `lib/workflows/actions/utility/googleSearch.ts` | 130 | Google search action. V1 registers Tavily search instead. | **PERMANENT SKIP** — V1 chose Tavily. |
| `lib/workflows/actions/utility/transformer.ts` | 222 | Earlier transformer implementation; obsoleted by `formatTransformer.ts`. | **PERMANENT SKIP** — superseded. |
| `lib/workflows/actions/ai/emailClassifier.ts` | 127 | Email-specific AI classifier; folded into generic `ai_classify`. | **PERMANENT SKIP** — superseded. |

---

## 3. V1 native triggers inventory

**2 registered native triggers:**

| # | V1 trigger type | Model | Lifecycle | Notes |
|---|---|---|---|---|
| 1 | `manual_trigger` | manual | none — fires when user clicks "Test" / API POST | Empty configSchema. Outputs `triggeredAt` (ISO timestamp) + `triggeredBy` (user id). |
| 2 | `webhook` | webhook | webhook URL exposed at a configurable `path`; method allowlist (POST/GET/PUT); optional auth token | Provider id is `"webhook"` (NOT `"automation"`) — only native trigger with a non-automation provider tag. Receives arbitrary HTTP, exposes parsed body/headers/query to downstream nodes. |

**Notably absent in V1:**
- **No scheduled / cron trigger.** [`lib/workflows/nodes/providers/generic/triggers.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/generic/triggers.ts) is a 5-line empty-array stub with a comment that mentions "schedule" alongside "webhook" + "manual" — suggesting it was planned but never shipped. No `schedule_trigger` / `cron_trigger` reference anywhere in V1's manifest or registry.

---

## 4. V2 current native-node surface

**Zero native nodes.** V2 ships only provider-scoped triggers + actions across the 18 currently-registered providers (Slack, Gmail, Microsoft suite, Notion, Airtable, Stripe, Shopify, HubSpot, Mailchimp, GitHub, Trello, etc. — see [`services/execution/handlers/_registry.ts`](../../../services/execution/handlers/_registry.ts) for the complete list).

### 4a. Engine traversal (no control-flow semantics)

[`services/execution/engine.ts:bfsExecutionOrder`](../../../services/execution/engine.ts) is the entire execution model:

```typescript
function bfsExecutionOrder(triggerNodeId, def) {
  const adjacency = buildAdjacency(def.edges);
  const visited = new Set<string>();
  // BFS from triggerNodeId; visit each node id at most once.
}
```

There is **no concept of**:
- Branch labels on edges (edges are unweighted / unlabeled).
- Per-iteration scope (loops would just execute downstream nodes once each).
- Skip-rest semantics for failed conditions (a false-condition node still has its successors visited unless the handler returns an error).
- Pause/resume / suspend (every reachable node executes within one in-process run).
- Multi-path output (an action can't say "follow edge A vs edge B").

### 4b. Variable resolution (works — supports data passing)

[`workflow-engine/variables/resolveValue.ts:resolveStrict`](../../../workflow-engine/variables/resolveValue.ts) (374 LOC) substitutes `{{nodeId.field}}` references in config values BEFORE the engine dispatches each handler. Tests at [`tests/unit/workflow-engine/variables/`](../../../tests/unit/workflow-engine/variables/) prove the contract. Multi-node data passing within a single linear chain works in V2 today — exercised by every existing slice's e2e walkthrough (Shopify 2.1's `create_product_variant → update_product_variant`, Slack 2.x message chains, etc.).

### 4c. Trigger model (no native-trigger primitives)

[`contracts/triggerEvent.ts`](../../../contracts/triggerEvent.ts) requires `{provider, eventType, eventId, occurredAt, accountId, payload}`. Every existing trigger flows through provider-scoped dispatch:

- **Webhook triggers**: `app/api/webhooks/{provider}/route.ts` receives, normalizes, dispatches via `services/triggers/dispatch.ts:dispatchTriggerEvent`.
- **Polling triggers**: `services/triggers/pollingRegistry.ts` + 5-min cron at `app/api/cron/poll-triggers/route.ts`.

There is **no native-trigger registry**. No manual-run API endpoint (POST /workflows/[id]/run-now doesn't exist). No scheduled-trigger cron route. No generic-webhook endpoint (every webhook URL is provider-scoped).

### 4d. Workflow node kind contract

[`contracts/workflow.ts:WorkflowNodeKindSchema`](../../../contracts/workflow.ts) — `z.enum(["trigger", "action"])`. Only 2 kinds. No `"logic"` / `"control-flow"` / `"native"` kind. Adding native control-flow nodes either reuses `"action"` (with the engine special-casing certain types) OR widens the enum.

### 4e. Handler contract

[`services/execution/handlers/types.ts:ActionHandler`](../../../services/execution/handlers/types.ts) — `(input) => Promise<{output}>`. Pure adapter — config in, output out. No engine-context hook (no way for a handler to say "execute subgraph X N times" or "skip remaining nodes" or "pause here until external event").

### 4f. Engine test coverage (proves linear data-passing only)

[`tests/unit/services/execution/engine.test.ts`](../../../tests/unit/services/execution/engine.test.ts) (678 LOC, ~25 tests):
- ✅ Linear chain BFS order with variable threading (`trigger → action1 → action2`).
- ✅ Variable resolution into config before dispatch.
- ✅ MissingVariableError → MISSING_VARIABLE step.
- ✅ MISSING_HANDLER / HANDLER_FAILED step results.
- ✅ Stops on first failure (downstream skipped only on actual error).
- ✅ Visited-set prevents cycles.
- ✅ Run persistence (succeeded / failed / fatal).
- ✅ Billing gate (BILLING_EXHAUSTED before any handler).
- ✅ Failure notification (workflow_failed on failed runs).

**No tests for** (because the engine doesn't support them):
- Branch-by-condition routing.
- Loop iteration.
- Pause/resume.
- Multi-output edge selection.

### 4g. Trigger test coverage

[`tests/unit/services/triggers/`](../../../tests/unit/services/triggers/) — 8 files covering provider-trigger lifecycle. **Zero tests for manual / scheduled / native-webhook triggers** because none exist.

---

## 5. Missing actions

Set difference: V1 registered native actions (~19 across triggers + 6 logic-ish + 4 utility + 8 AI + 1 HITL) minus V2 native (0) = **19 candidates** (excluding 6 orphan / dead V1 handlers).

| V1 action | Category | One-line gap |
|---|---|---|
| `http_request` | logic | Pure HTTP-request action. Workflow-author tool for hitting arbitrary APIs without a per-provider integration. No engine surgery; pure handler. |
| `delay` | logic | Pause workflow for N seconds/minutes/hours. **Needs pause/resume in engine** OR a "block in-process for ≤30s" narrow scope (V1's likely model). |
| `if_then_condition` | logic | Single-branch conditional — skip rest of workflow if condition false. **Needs skip-rest engine semantics.** |
| `router` | logic | Multi-path branching — fan out to N paths based on condition match (any/all). **Needs edge-labeled branching engine semantics.** |
| `loop` | logic | Iterate over items / repeat N times. Per-iteration nested execution + progress tracking. **Needs major engine surgery** (loop scope, per-iteration variable rebinding, `loop_executions` parallel state). |
| `wait_for_event` | automation | Pause workflow until external event arrives. **Needs pause/resume in engine** + an event-matching dispatcher. |
| `format_transformer` | utility | Text / JSON manipulation (camelCase ↔ snake_case, JSON / YAML / XML / regex replace). Pure handler; no engine work. |
| `parse_file` | utility | Parse uploaded file content (CSV / JSON / XML / etc.). Couples with P-S3 file-output contract. |
| `extract_website_data` | utility | Scrape URL via CSS selectors / regex. Pure handler. |
| `tavily_search` | utility | LLM-search via Tavily API. Pure handler; requires API key env. |
| `ai_agent` | ai | Full AI agent node — model, prompts, tool use, memory. 656-LOC manifest. **Phase 5 AI-planner territory.** |
| `ai_prompt` / `ai_summarize` / `ai_extract` / `ai_classify` / `ai_sentiment` / `ai_translate` / `ai_generate` | ai | 7 AI sub-actions — generic LLM-call wrappers with task-specific prompts. **Phase 5 territory.** |
| `hitl_conversation` | hitl | Human-in-the-loop conversation. ~5,000 LOC across Discord/Slack/email integrations + memory service. **Phase 8 (HITL UX) territory.** |

---

## 6. Missing triggers

Set difference: V1 registered native triggers (2) minus V2 native triggers (0) = **2 candidates** + 1 not-in-either candidate.

| V1 trigger | Model | One-line gap |
|---|---|---|
| `manual_trigger` | manual | Workflow author clicks "Test" / hits an API endpoint to start the workflow. V2 has no run-now API + no manual trigger node. |
| `webhook` (V1's generic) | webhook | Generic HTTP-receive endpoint at a configurable path. V2 has only provider-scoped webhook routes. |
| `scheduled_trigger` / `cron_trigger` | cron | **NOT in V1 either.** V2 cron infra (5-min polling cadence) makes adding this cheap; V2's `services/cron/` already runs. Worth shipping in Phase 2 as a non-parity addition. |

---

## 7. Port / skip / defer table

Every row from §5 + §6 gets a decision. Tier headers per the up-front recommendation.

### Tier A — Pure-handler ports (no engine surgery)

| V1 item | Type | Recommendation | One-line reasoning |
|---|---|---|---|
| `http_request` | action | **PORT (Phase 2 native-nodes 1)** | Pure handler. Workflow-author tool for hitting arbitrary APIs. No engine work; output `{status, body, headers, durationMs}`. Q11 safety: require `method` explicit (no silent default); validate URL allowlist or surface egress-risk in CLAUDE.md durable rule. |
| `format_transformer` | action | **PORT (Phase 2 native-nodes 1)** | Pure handler. Text / JSON / regex manipulation. Bounded output. |
| `delay` (narrow scope only) | action | **PORT IF SCOPED to in-process sleep ≤30s (Phase 2 native-nodes 1)** | If `delay` is "sleep N seconds and continue" with a hard cap of e.g. 30s (Vercel function timeout), no engine work. If unbounded delay required → engine pause/resume (Tier C). **NPD-N6 decides scope.** |

### Tier B — Native trigger + run-now entry point

| V1 item | Type | Recommendation | One-line reasoning |
|---|---|---|---|
| `manual_trigger` | trigger | **PORT (Phase 2 native-nodes 2)** | Needs a new `POST /api/workflows/[id]/run-now` (or similar) entry point + a "manual" trigger row in `trigger_resources` (or none if always-implicit). Variable resolution still works because the engine pre-resolves config — the manual trigger's payload is `{triggeredAt, triggeredBy, inputs?}` accessible via `{{<triggerNodeId>.field}}`. **NPD-N1 decides API shape.** |
| `webhook` (generic) | trigger | **DEFER pending product signal** | Real value depends on whether V2's target users want arbitrary webhook URLs vs always-provider-scoped. If yes: needs `POST /api/webhooks/native/{token}` + a `native_webhook` trigger row. **NPD-N3 decides.** |
| `scheduled_trigger` (NEW — not in V1) | trigger | **PORT IF Marcus signs off (Phase 2 native-nodes 2)** | V2 cron infra runs 5-min polling cadence; scheduled trigger reuses it with a per-trigger cron expression. Output `{firedAt}`. Cheap. **NPD-N2 decides whether Phase 2 includes this non-parity addition.** |

### Tier C — Control-flow engine surgery

| V1 item | Type | Recommendation | One-line reasoning |
|---|---|---|---|
| `if_then_condition` | action | **PORT (Phase 2 native-nodes 3) — needs engine work** | Single-branch — proceed only if condition true; skip rest of workflow otherwise. Engine work: edge-labeled outputs OR a "skip-rest" signal handlers can emit. Smallest control-flow primitive; gateway to the rest of Tier C. **NPD-N4 sub-decision: edge-labeled edges vs handler-signal model.** |
| `router` | action | **PORT (Phase 2 native-nodes 4 OR fold into Tier-C slice)** | Multi-path branching. Same engine work as if-then but generalized to N labeled edges. Could ship in the same slice as `if_then_condition` if the engine work supports N labels from day one. |
| `loop` | action | **DEFER (Phase 2 native-nodes 5 OR defer to Phase 6 engine hardening)** | Per-iteration nested execution. Largest engine work — needs loop scope, per-iteration variable rebinding, parallel-state `loop_executions` table, progress tracking. V1 has 339 LOC of handler + engine support. **NPD-N5 decides whether to attempt in Phase 2 or defer to Phase 6.** |
| `wait_for_event` | action | **DEFER** | Pause/resume across in-process runs requires durable queue (BullMQ / Inngest) — V2's engine is currently fire-and-forget in-process. Pause/resume is a Phase 6/8 platform concern, NOT a Phase 2 parity slice. |
| `delay` (unbounded) | action | **DEFER (if NPD-N6 picks unbounded)** | Same pause/resume infrastructure as `wait_for_event`. If `delay` is restricted to ≤30s in-process sleep, see Tier A. |

### Tier D — Phase 5 / Phase 8 deferrals

| V1 item | Type | Recommendation | One-line reasoning |
|---|---|---|---|
| `ai_agent` | action | **DEFER pending Phase 5** | Full AI agent node — model, prompts, tool use, memory. Phase 5 (AI planner integration) territory. NOT a Phase 2 parity slice. |
| `ai_prompt` / `ai_summarize` / `ai_extract` / `ai_classify` / `ai_sentiment` / `ai_translate` / `ai_generate` | action | **DEFER pending Phase 5** | 7 AI sub-actions. Same Phase 5 territory. |
| `hitl_conversation` | action | **DEFER pending Phase 8 (HITL UX)** | ~5,000 LOC across Discord/Slack/email + memory service. Largest single V1 native subsystem. Phase 8 + UI work required. |
| `tavily_search` | action | **DEFER pending Phase 5** | LLM-search tool. AI-adjacent; bundle with AI work in Phase 5. |
| `extract_website_data` | action | **DEFER pending product signal** | URL scraping. Legal / ToS surface depending on target site. Defer until a workflow template / customer asks. |
| `parse_file` | action | **DEFER pending P-S3 evolution** | Couples with file-output contract (P-S3 already shipped). Could bundle as a P-S3 successor slice when file-input parsing becomes a real need. |

### Permanent skips (V1 rot)

| V1 item | Reason |
|---|---|
| `executePath.ts` | One-half of a duplicate-implementation pair with `executeFilter.ts`; both look like single-branch conditionals. V2 ships exactly one implementation under `if_then_condition`. |
| `executeFilter.ts` | Other half of the duplicate. |
| `fileUpload.ts` | Superseded by P-S3 file-output contract. |
| `googleSearch.ts` | V1 chose Tavily as its search provider; Google Search is unused. |
| `transformer.ts` | Superseded by `formatTransformer.ts`. |
| `emailClassifier.ts` | Folded into the generic `ai_classify` schema alias. |

---

## 8. V1 rot / bugs / dead code inventory

Provider-specific rot beyond the master-plan §5 categories. Native-specific patterns:

| ID | Pattern | Citation | V2 status |
|---|---|---|---|
| N-R1 | **Duplicate logic implementations** | `executeFilter.ts` (194 LOC) + `executePath.ts` (193 LOC) both unwired-or-half-wired single-branch conditionals. | **NOT PORTED.** V2 ships exactly one `if_then_condition` implementation (Phase 2 native-nodes Tier C). |
| N-R2 | **Schema-alias fan-out without separate handlers** | 8 AI action types (`ai_prompt`, `ai_summarize`, etc.) registered as schema aliases routing to 2 generic handlers (`generateContent`, `summarizeContent`). The action-type proliferation is UX, not semantic. | **NOT PORTED.** V2's AI work in Phase 5 should consolidate this — one `ai_action` type with a `task` discriminator, not 8 schema aliases. |
| N-R3 | **`emailClassifier.ts` is dead-code orphan** | 127 LOC handler with no registry wiring — folded into `ai_classify` schema alias. | **NOT PORTED** (already dead in V1). |
| N-R4 | **`fileUpload.ts` is dead-code orphan** | 292 LOC handler with no registry wiring — pre-P-S3 file-upload action. | **NOT PORTED** (superseded by P-S3). |
| N-R5 | **`googleSearch.ts` is dead-code orphan** | 130 LOC handler with no registry wiring — V1 chose Tavily as search provider. | **NOT PORTED** (V1 product choice). |
| N-R6 | **`transformer.ts` vs `formatTransformer.ts`** | 222 LOC `transformer.ts` is unwired; `formatTransformer.ts` (326 LOC) is the live implementation. | **NOT PORTED** (superseded). |
| N-R7 | **No scheduled trigger anywhere in V1** | [`generic/triggers.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/generic/triggers.ts) is an empty-array stub with a "schedule" comment hinting it was planned but never shipped. | **OPPORTUNITY in V2** — cron infra already exists; ship in Phase 2 native-nodes 2 if NPD-N2 accepts. |
| N-R8 | **`hitl_conversation` is provider-coupled** | HITL stack hardcodes Discord + Slack + email transports inside a single action handler. Tight coupling means HITL can't reuse provider-tier OAuth contracts. | **NOT PORTED** (Phase 8). When ported, HITL should consume the provider-tier OAuth + action handlers, not duplicate them. |
| N-R9 | **`loop_executions` table backs V1 loop progress** | V1's loop tracks per-iteration progress in a parallel table. V2 has no equivalent. | **NOT PORTED** in Phase 2 unless NPD-N5 accepts loop work. |
| N-R10 | **V1 sparse native test coverage** | Only `lib/workflows/actions/logic/__tests__/` directory exists for native-handler tests. Coverage density is much lower than V1's provider-action coverage (which itself was sparse). | **NOT A PROBLEM in V2** — when native nodes port, V2 ships test coverage at the same density as provider Slices (e.g. Mailchimp 2.1's 49 read-tier tests). |
| N-R11 | **Webhook trigger's provider id is `"webhook"`, NOT `"automation"`** | Inconsistent — other automation nodes use `providerId: "automation"`; webhook uses its own. Probably historical. | **REDESIGN on port** — V2's `webhook` trigger (if NPD-N3 accepts) should use `providerId: "native"` or `"automation"` consistently. |
| N-R12 | **AI provider's `ai_agent` is a 656-LOC manifest** | Largest single V1 node manifest. Mostly configSchema for model selection, prompts, tools, etc. | **REDESIGN on Phase 5 port** — V2's AI agent should split the configSchema into multiple files (per the Slice 14 split-schema convention). |

---

## 9. V2 dependency map

Which V2 contracts each Tier item depends on. Identifies contract gaps that block implementation.

### Tier A dependencies

| Item | Existing dependencies | NEW contract gap? |
|---|---|---|
| `http_request` | `services/execution/handlers/_registry.ts` (handler registration), `WorkflowNode` contract, `ActionHandler` shape | None — pure handler. Possibly an env var for egress allowlist (Q11 surface). |
| `format_transformer` | Same as above | None. |
| `delay` (≤30s narrow scope) | Same as above + Node's `setTimeout` | None. Caps at function timeout. |

### Tier B dependencies

| Item | Existing dependencies | NEW contract gap? |
|---|---|---|
| `manual_trigger` | `TriggerEvent` contract (`provider: "native"` or similar), `services/triggers/dispatch.ts`, `services/execution/enqueue.ts` | **NEW**: `POST /api/workflows/[id]/run-now` API endpoint. **NEW**: native-trigger registry (parallel to provider triggers). **NEW**: `TriggerEvent.provider` allows `"native"` value (currently any string, so backward-compat). |
| `scheduled_trigger` | `services/cron/` (existing), `services/triggers/pollingRegistry.ts` (pattern reuse), cron-expression parser library | **NEW**: scheduled-trigger registry. **NEW**: per-trigger cron expression validation. Probably a new dependency (e.g. `cron-parser` npm package). |
| `webhook` (generic) | `app/api/webhooks/native/{token}/route.ts` (NEW), `services/triggers/dispatch.ts` (extend for native provider) | **NEW**: generic webhook receive endpoint + auth model (per-trigger token). |

### Tier C dependencies

| Item | Existing dependencies | NEW contract gap? |
|---|---|---|
| `if_then_condition` | Engine traversal, `WorkflowEdge` contract | **NEW PLATFORM**: edge labels in `WorkflowEdge` (e.g. `label: "true" \| "false" \| string`). **NEW PLATFORM**: engine BFS becomes label-aware. **NEW**: handler return shape includes `branch: "true" \| "false"` OR equivalent. **NEW**: skip-rest semantics in engine. |
| `router` | Same as `if_then_condition` | Same — generalizes to N-label edges. If `if_then_condition`'s engine work supports N labels from day one, `router` ships in the same slice. |
| `loop` | Engine traversal, per-iteration variable scope | **MAJOR NEW PLATFORM**: loop scope in `WorkflowEdge` (which edges are "inside" the loop). Per-iteration variable rebinding. `loop_executions` parallel state. Progress tracking API. |
| `wait_for_event` | Pause/resume infra (does not exist) | **MAJOR NEW PLATFORM**: durable queue (BullMQ / Inngest), suspended-run state, event-matching dispatcher. Phase 6 platform tier. |
| `delay` (unbounded) | Same as `wait_for_event` | Same. |

### Tier D dependencies

All Phase 5 / Phase 8. Not enumerating here — covered by their respective phase plans.

---

## 10. Required platform gaps (if any)

**Tier A: 0 platform gaps.** Pure handlers; ship in 1 slice (~3-4 commits).

**Tier B: 3 platform gaps**, all small:
- **NEW** `POST /api/workflows/[id]/run-now` API endpoint with input-payload validation.
- **NEW** native-trigger registry (mirrors `services/triggers/pollingRegistry.ts` pattern).
- **NEW** cron-expression validation + scheduled-trigger cron route (if NPD-N2 accepts scheduled).

**Tier C: 1 LARGE platform gap + 1 MAJOR platform gap.**

- **LARGE**: edge-labeled branching in the engine.
  - `WorkflowEdge` contract widens with `label?: string`.
  - `ActionHandler` result widens with `branchTaken?: string` (handler emits the label it took).
  - Engine BFS becomes label-aware: when a node has multiple outgoing edges with distinct labels, only the edge matching the handler's `branchTaken` is followed.
  - Engine "skip-rest" semantics: when a conditional handler returns `branchTaken: null`, downstream nodes ARE NOT enqueued.
  - **3-4 commits** in a dedicated engine slice, before `if_then_condition` and `router` can ship.

- **MAJOR**: loop scope + iteration.
  - Edges can be marked as "inside loop X".
  - Engine maintains a per-iteration variable namespace.
  - Per-iteration progress tracking (parallel `loop_executions` table).
  - Concurrency: serial vs parallel loop modes.
  - **6-10 commits** in a dedicated engine slice, before `loop` can ship. **Recommend deferring to Phase 6** unless Marcus signs off explicitly.

- **MAJOR**: pause/resume + durable queue.
  - In-process fire-and-forget engine → durable queue (BullMQ / Inngest / equivalent).
  - Suspended-run state in `workflow_runs`.
  - Event-matching dispatcher routes incoming events to suspended runs.
  - **8-12 commits** in a dedicated platform slice. **Phase 6 platform tier**; do NOT pre-commit in Phase 2.

**Tier D: 0 Phase 2 platform gaps** (covered by Phase 5 + Phase 8 plans).

---

## 11. Required data-passing tests

Marcus's brief explicitly calls out "test coverage that proves multi-node data passes correctly". Current state vs. gap:

| Coverage area | Current state | Phase 2 gap |
|---|---|---|
| Linear chain `trigger → action1 → action2` with `{{nodeId.field}}` resolution | ✅ Asserted in [`engine.test.ts:131-198`](../../../tests/unit/services/execution/engine.test.ts) | None. |
| Per-provider e2e walkthroughs that chain provider actions with variable references | ✅ Shopify 2.1's `create_product_variant.variantId → update_product_variant.variant_id`. Mailchimp 2.1 e2e chains 4 actions off one trigger. | None. |
| Trigger-payload data passing into action config (`{{trigger-node.payload.field}}`) | ✅ Asserted directly in Mailchimp 2.1 polling e2e via `workflow_runs.trigger_event.payload`. | None. |
| MissingVariableError propagation | ✅ Asserted in `engine.test.ts:200`. | None. |
| **Branch-conditional data passing** (action A → conditional → action B-true vs action B-false) | ❌ **No coverage** — engine doesn't support it. | **NEW: requires Tier C engine work first.** |
| **Loop iteration variable rebinding** (per-iteration item / index / counter) | ❌ No coverage. | **NEW: requires loop engine work.** |
| **Manual-trigger input-payload data passing** | ❌ No coverage — no manual trigger entry point. | **NEW: Tier B native-nodes 2 slice.** |
| **Scheduled-trigger `firedAt` propagation** | ❌ No coverage. | **NEW: Tier B native-nodes 2 slice if NPD-N2 accepts.** |
| **HTTP-request response (`status` / `body` / `headers`) as downstream variables** | ❌ No coverage — no `http_request` action. | **NEW: Tier A native-nodes 1 slice. Easy.** |

Phase 2 native-nodes Tier A + Tier B slices each ship a chained-workflow e2e test proving the new action / trigger's output is addressable in downstream config via the engine's strict resolver. Tier C slices each ship an engine-level branch + loop test in `engine.test.ts` plus an e2e walkthrough that exercises the control flow end-to-end.

---

## 12. Effort estimate

Compared to Phase 1 reference slices:

### Tier A — Phase 2 native-nodes slice 1 (~4-5 commits)

| Commit | Scope | Est. LOC |
|---|---|---|
| 0 | docs(native): add parity audit (this doc) | — |
| 1 | feat(native): add http_request action — handler + schema + tests + registry entry + Q11 method-required guard | ~250 src + ~350 test |
| 2 | feat(native): add format_transformer action — handler + schema + tests | ~200 src + ~280 test |
| 3 | feat(native): add delay action (narrow ≤30s scope per NPD-N6) — handler + schema + tests | ~80 src + ~150 test |
| 4 | test(e2e): native-nodes slice 1 walkthrough — chain http_request → format_transformer → delay, asserting variable threading through all 3 | ~300 e2e + ~80 helpers |
| 5 | docs(native): native-nodes slice 1 outcomes + CLAUDE.md durable rules | — |

≈ **~530 src + ~780 test + ~300 e2e LOC.** ~Sheets 2.2 / Airtable 2.1 scale.

### Tier B — Phase 2 native-nodes slice 2 (~4-6 commits, blocked on NPD-N1 + NPD-N2)

| Commit | Scope | Est. LOC |
|---|---|---|
| 1 | feat(native): add manual_trigger + POST /api/workflows/[id]/run-now endpoint + native-trigger registry | ~400 src + ~500 test |
| 2 | feat(native): add scheduled_trigger + cron-expression validation + cron route (if NPD-N2 accepts) | ~300 src + ~400 test |
| 3 | feat(native): add webhook generic trigger + /api/webhooks/native/{token}/route (if NPD-N3 accepts) | ~250 src + ~350 test |
| 4 | test(e2e): native-nodes slice 2 walkthrough — manual trigger → http_request, scheduled trigger → format_transformer | ~400 e2e |
| 5 | docs(native): native-nodes slice 2 outcomes | — |

≈ **~950 src + ~1,250 test + ~400 e2e LOC.** ~Slack 2.1 scale.

### Tier C — Phase 2 native-nodes slice 3 (engine surgery, ~6-8 commits, blocked on NPD-N4)

| Commit | Scope | Est. LOC |
|---|---|---|
| 1 | feat(engine): edge labels in WorkflowEdge + label-aware BFS + handler `branchTaken` return shape | ~400 src + ~600 test |
| 2 | feat(engine): skip-rest semantics when `branchTaken: null` | ~150 src + ~250 test |
| 3 | feat(native): add if_then_condition action (consumes engine branching) | ~200 src + ~300 test |
| 4 | feat(native): add router action (N-label generalization) | ~250 src + ~350 test |
| 5 | test(e2e): native-nodes slice 3 walkthrough — branch by condition, then by router | ~400 e2e |
| 6 | docs(native): native-nodes slice 3 outcomes + engine-branching durable rule | — |

≈ **~1,000 src + ~1,500 test + ~400 e2e LOC.** ~Slack 2.3 scale.

### Tier C continued — loop (~6-10 commits, BLOCKED on NPD-N5)

Not enumerated commit-by-commit. ~Stripe 2.1 scale at minimum. **Recommend deferring to Phase 6 unless Marcus signs off explicitly.**

### Tier D — Phase 5 / Phase 8

Not Phase 2 scope.

### Total Phase 2 minimum (Tier A + Tier B + Tier C if-then/router only)

- 3 platform slices.
- ~14-19 commits across all three.
- ~2,480 src + ~3,530 test + ~1,100 e2e LOC.
- ~2-3 weeks of focused work.

### Phase 2 maximum (add loop to Tier C)

- 4 platform slices.
- ~21-29 commits.
- ~3,500+ src + ~5,000+ test LOC.
- ~4-6 weeks.

---

## 13. Recommended parity batch plan

**Conditional on accepted NPDs.** Plan assumes Marcus accepts the audit's tier minimums:
- NPD-N1: manual_trigger via `POST /api/workflows/[id]/run-now`.
- NPD-N2: ship scheduled_trigger in Phase 2 (cheap given existing cron infra).
- NPD-N4: edge-labeled branching engine model.
- NPD-N5: defer loop to Phase 6.
- NPD-N6: delay scoped to ≤30s in-process sleep.
- NPD-N7: defer ALL AI cluster to Phase 5.
- NPD-N8: defer HITL to Phase 8.
- NPD-N9: defer all utility actions (parse_file / extract_website_data / tavily_search) to later phases.
- NPD-N10: 6 V1 orphans permanent skip.

### Slice ordering

| Order | Slice | Blocked on |
|---|---|---|
| 0 | **This audit** (`docs(native-nodes): add parity audit`) | NONE (current commit) |
| 1 | **Native-nodes slice 1** — Tier A (http_request, format_transformer, delay) | Marcus accepts audit |
| 2 | **Native-nodes slice 2** — Tier B (manual_trigger + run-now API; scheduled_trigger if NPD-N2 accepted; webhook generic if NPD-N3 accepted) | Marcus accepts NPD-N1 (+ NPD-N2, NPD-N3) |
| 3 | **Engine-branching slice** — edge labels + label-aware BFS + skip-rest (engine-only; no native nodes) | Marcus accepts NPD-N4 |
| 4 | **Native-nodes slice 3** — Tier C if-then + router | Engine-branching slice green |
| (deferred) | **Loop engine slice + native-nodes slice 4** — Tier C loop | NPD-N5 (recommend defer to Phase 6) |
| (deferred) | **Pause/resume platform slice + wait_for_event + unbounded delay** | NPD-N6 (recommend defer to Phase 6) |

Native-nodes slice 1 + 2 + 3 (with engine-branching prerequisite) is the **minimum to close the Phase 2 native-nodes parity gap**.

---

## 14. Exit checklist

This audit is complete when:

- [ ] Marcus has read §1-§4 (V1 paths + V1 actions + V1 triggers + V2 current surface) and agrees the inventory is accurate.
- [ ] §5 + §6 (missing items) match Marcus's understanding of the gap — specifically:
  - **19 V1 native actions** missing in V2 (6 in Tier C control-flow, 5 in Tier A pure-handler, 8 in Tier D AI/HITL, with some overlap).
  - **2 V1 native triggers** missing (manual + generic webhook) + 1 not-in-either candidate (scheduled).
  - **0 V2 native nodes exist today** — the entire surface is greenfield.
- [ ] §7 (port / skip / defer) decisions accepted, especially:
  - **Tier A in Phase 2** = http_request, format_transformer, delay (narrow scope per NPD-N6).
  - **Tier B in Phase 2** = manual_trigger + scheduled_trigger (if NPD-N2 accepts); webhook generic deferred unless NPD-N3 accepts.
  - **Tier C minimum** = if_then_condition + router via new engine-branching platform slice; loop deferred.
  - **Tier D entirely deferred** = ai_agent + 7 AI sub-actions (Phase 5); hitl_conversation (Phase 8); tavily_search / extract_website_data / parse_file (later phases).
  - **PERMANENT SKIP** = 6 V1 orphan handlers (executePath + executeFilter / fileUpload / googleSearch / transformer / emailClassifier).
- [ ] §8 (V1 rot N-R1..N-R12) accepted — confirms duplicate-implementation, dead-orphan, schema-alias-fan-out, provider-coupled-HITL patterns are all flagged as NOT ported.
- [ ] §10 (platform gaps) accepted — specifically:
  - Tier A has zero platform gaps.
  - Tier B has 3 small gaps (run-now API, native-trigger registry, cron-expression validation).
  - Tier C requires a dedicated **engine-branching slice** (edge labels + label-aware BFS + skip-rest) BEFORE if_then_condition / router ship.
  - Loop / pause-resume are major platform tier work — **deferred to Phase 6** unless Marcus signs off.
- [ ] §11 (data-passing tests) accepted — existing linear-chain coverage is sufficient for Tier A + Tier B; Tier C requires new branch-conditional test coverage in `engine.test.ts`.
- [ ] §12 (effort) accepted — Phase 2 minimum ≈ 14-19 commits across 3 slices; maximum (add loop) ≈ 21-29 commits across 4 slices.
- [ ] §13 (batch plan) commit ordering accepted.
- [ ] **Open decisions resolved:**
  - **NPD-N1: Manual-trigger API shape.** Recommendation: `POST /api/workflows/[id]/run-now` with optional JSON body forwarded as `{{<triggerNodeId>.inputs}}`. UI exposes a "Test" button; CLI / external scripts hit the same endpoint. Accept/reject.
  - **NPD-N2: Ship scheduled_trigger in Phase 2 despite NOT being a V1 parity gap.** Recommendation: **YES — ship it.** V2 cron infra is already running; adding a scheduled trigger is ~1 commit of effort and closes a customer-visible gap relative to every other workflow tool (Zapier, Make, n8n all have schedule triggers). Accept/reject.
  - **NPD-N3: Generic webhook trigger.** Recommendation: **DEFER pending product signal.** Provider-scoped webhooks cover the common case; generic webhook adds attack surface (open HTTP endpoints) and a new auth model (per-trigger tokens). Revisit if a customer explicitly asks. Accept/reject.
  - **NPD-N4: Engine branching model.** Recommendation: **edge-labeled edges + handler `branchTaken` return shape.** Add `WorkflowEdge.label?: string` field; widen `ActionHandlerResult` with `branchTaken?: string`. Engine BFS honors label matching. Skip-rest is signaled by `branchTaken: null`. Smaller surface than full per-handler engine-context API. Accept/reject.
  - **NPD-N5: Loop in Phase 2 or Phase 6.** Recommendation: **DEFER to Phase 6.** Loop is the largest single engine change (per-iteration scope, parallel state, progress tracking, serial vs parallel modes). Phase 2 can be called "native-nodes complete" without loop — workflow authors compose multiple workflows or use external orchestration in the interim. Accept/reject.
  - **NPD-N6: Delay scope.** Recommendation: **narrow scope to ≤30s in-process sleep** (caps at Vercel function timeout). Pure handler; no engine work. Unbounded delay = pause/resume infra = Phase 6. Accept/reject.
  - **NPD-N7: AI cluster (ai_agent + 7 sub-actions + tavily_search) defer.** Recommendation: **DEFER ALL to Phase 5 (AI planner).** None ship in Phase 2 native-nodes. Phase 5 also consolidates V1's 8 schema-alias proliferation into one `ai_action` type with a discriminator. Accept/reject.
  - **NPD-N8: HITL defer.** Recommendation: **DEFER to Phase 8 (HITL UX).** V1's 5,000-LOC HITL stack needs UI + memory + provider-OAuth-reuse + Discord/Slack interactions. Not Phase 2 scope. Accept/reject.
  - **NPD-N9: Utility actions (parse_file / extract_website_data) defer.** Recommendation: **DEFER pending product signal.** Both have legal / ToS / format-coverage considerations. Revisit if a customer or AI-planner workflow requires them. Accept/reject.
  - **NPD-N10: Permanent skip list.** Recommendation: **PERMANENT SKIP** all 6 V1 orphan handlers (executePath + executeFilter duplicate, fileUpload, googleSearch, transformer, emailClassifier). Accept/reject.
- [ ] Implementation does not start until all checkboxes are ticked.
