# MCP catalog drift detection & certification (CS-4)

**Status:** implemented (CS-4 MCP-DRIFT), local/unpushed. Governs how ChainReact
handles a vendor changing an MCP server that a catalog provider is compiled from.
Builds on CS-3's executor + pinned-schema guard.

## Core philosophy

> ChainReact owns the catalog. Vendors own their MCP servers. If a vendor changes
> something, ChainReact **detects** it, **blocks** unsafe execution, **reviews** it,
> and publishes an updated certification. Users never wonder whether their workflow
> broke — they see that ChainReact protected it.

Three rules the system never violates: **never silently retry, never silently remap,
never execute against an unknown schema.**

## The pieces

| Concern | Where | Notes |
|---|---|---|
| Certification state | `core/certification/certificationState.ts` | Provider-agnostic enum (`experimental · healthy · needs_review · certification_pending · deprecated · blocked`). `blocked` is the ONLY state that withholds execution. Reusable by native providers later. |
| Drift classification | `integrations/_shared/mcp/driftClassify.ts` | Pure. Classifies a certified tool vs live `tools/list`: `no_change · safe_addition · breaking_change · tool_removed · tool_renamed · schema_changed` (+ `output_changed`, informational). Maps each → a certification state → an execution decision. |
| Schema cache | `integrations/_shared/mcp/schemaCache.ts` | Short-TTL (5 min) in-process cache of a server's live `tools/list`, keyed by (provider, serverUrl). Single-flight. Removes the per-execution fetch; classification still runs every call. |
| Runtime gate | `integrations/_shared/mcp/executeTool.ts` | Reads live tools (cache) → classifies → allows / refuses per policy → fires a review observation on a non-breaking change. |
| First-class UX | `INTEGRATION_CHANGED` code (`engineTypes.ts`) → `humanizeActionError` → `review_pending` CTA | Plain-language "a connected app changed; we stopped it before sending; your workflow is safe; it's being reviewed." No protocol jargon, no reconnect/retry. |
| Internal review | `scripts/mcp-import check [--json]` → `buildDriftReport` | Changed/added/removed/renamed tools, field diffs, risk, affected actions, certification state, ready-for-certification. CLI/JSON for scheduled (cron) inspection; exit 1 on breaking drift. |

## Execution policy (the CS-3 → CS-4 change)

CS-3 refused on ANY hash change (fail-closed but coarse). CS-4 classifies:

| Classification | Meaning | Execution | Certification state |
|---|---|---|---|
| `no_change` | live schema == certified | runs | healthy |
| `safe_addition` | only new OPTIONAL fields; certified args stay valid | **runs** + review flag | needs_review |
| `breaking_change` | a field was removed / newly required | **refused** | blocked |
| `tool_removed` | certified tool gone from the server | **refused** | blocked |
| `tool_renamed` | same schema under a new name | **refused** | blocked |
| `schema_changed` | an existing field changed; not provably safe | **refused** (fail-closed) | blocked |

Policy is configurable (`DriftPolicy.allowNeedsReview`, default `true`). A stricter
deployment can pause even safe additions until a human re-certifies. The runtime never
regenerates, re-maps, or approves anything automatically — those are human decisions
(re-capture → re-review the catalog → regenerate → re-certify).

## Safety with caching

The cache removes the network `tools/list` fetch, **not** the safety check:
classification is pure and runs on every execution against the cached live schema. A
breaking change is refused on every call within the window; the TTL only bounds how
stale the live view can be (a fresh vendor break is caught within one TTL). Measured:
N executions within the TTL trigger exactly **one** `tools/list` fetch (vs one per
execution in CS-3) — see `executeTool.test.ts` "perf" case.

## Scheduled inspection

`scripts/mcp-import check <provider>` is cron/CI-invokable: `--json` emits the machine
report; exit code 1 signals breaking drift. It is **alert-only** — it never mutates
catalog state or user data (plan §4.8). On breaking drift, a human runs the
re-certification pipeline. A durable "needs review" store and an admin review UI are
future work; today the runtime signal is a structured ops log and the review artifact
is the CLI report.

## Reusing certification state for native providers (future)

`core/certification/` is deliberately MCP-free. A native provider can adopt the same
states (e.g. mark an endpoint `deprecated` or `blocked`) and reuse the same
`INTEGRATION_CHANGED` UX — no rename, no MCP assumptions. Wiring native providers to
certification state is explicitly NOT done in CS-4. See the CS-4 owner report's
implementation-review section for the unified-framework recommendation.
