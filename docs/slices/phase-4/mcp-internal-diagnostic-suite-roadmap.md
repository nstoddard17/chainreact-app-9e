# 4.MCP-SUITE — Internal MCP Diagnostic Suite Roadmap

**Type:** Planning / design only. **No source, migrations, tests, UI, or behavior
changes in this slice. Nothing pushed.**
**Date:** 2026-06-12
**Branch:** `builder-ui-v1-audit-1`

> **STATUS (2026-06-12) — partly shipped.** This is the original planning map. The
> live workflow/run + connection layer landed (run-failure, run-visibility,
> workflow-readiness, single-provider + workflow-wide connection diagnostics), with
> the diagnostic brains consolidated into `services/diagnostics/*` and routes
> reduced to thin gated shells. For the as-built tool/route/service inventory, the
> three-layer architecture rule, the no-leak guarantees, and remaining stages
> (2B-5 graph, 2C doctors, 2D reports), see the closeout:
> [mcp-diagnostic-suite-closeout.md](./mcp-diagnostic-suite-closeout.md). The stage
> labels below predate the implementation split and are kept as design history.

**Source of truth (verified current state — every file below was read for this roadmap):**
[scripts/mcp/tools/index.ts](../../../scripts/mcp/tools/index.ts) (the explicit registry — 17 tools today) ·
[scripts/mcp/tools/diagnoseLive.ts](../../../scripts/mcp/tools/diagnoseLive.ts) (the two shipped Plane-B tools + shared `postDiagnostic` fetch transport; import-fenced) ·
[scripts/mcp/tools/diagnose.ts](../../../scripts/mcp/tools/diagnose.ts) (static `diagnose_option_source` + closed `OPTION_SOURCE_DIAGNOSES`) ·
[app/api/internal/diagnostics/_shared.ts](../../../app/api/internal/diagnostics/_shared.ts) (`applyDiagnosticsGate` — bearer / default-OFF / prod-lock) ·
[app/api/internal/diagnostics/option-source/route.ts](../../../app/api/internal/diagnostics/option-source/route.ts) (2B-1 route shape) ·
[app/api/internal/diagnostics/integration-connection/route.ts](../../../app/api/internal/diagnostics/integration-connection/route.ts) (2B-2 route: sessionless authz + provenance + sanitized DTO) ·
[services/integrations/connectionDiagnosis.ts](../../../services/integrations/connectionDiagnosis.ts) (pure `deriveConnectionDiagnosis` — the reuse pattern) ·
[repositories/workflowRuns.ts](../../../repositories/workflowRuns.ts) (`WorkflowRunRecord`, `WorkflowRunStep`, `errorClassification`; `getById`/`listByWorkflow` are **session/RLS** + exclude `running`) ·
[repositories/workflows.ts](../../../repositories/workflows.ts) (`WorkflowRecord` w/ `draftDefinition`; `getByIdServiceRole` — **sessionless** read) ·
[contracts/workflowDefinition.ts](../../../contracts/workflowDefinition.ts) (`WorkflowNode` {id, provider, type, config: opaque}, `WorkflowEdge`) ·
[services/discovery/_registry.ts](../../../services/discovery/_registry.ts) (`getActionMeta`, `getTriggerMeta`, `listProvidersWithMetadata`) ·
[integrations/_registry.ts](../../../integrations/_registry.ts) (`getProvider`) ·
[repositories/accountMemberships.ts](../../../repositories/accountMemberships.ts) (`isMemberServiceRole`) ·
[services/options/credentialPolicy.ts](../../../services/options/credentialPolicy.ts) (`decideOptionsCredential`)

**Completed stages (shipped):**

| Stage | What shipped | Plane |
|---|---|---|
| **1 / 1.5** | Internal MCP server + stdio/**HTTP transport** (`MCP_HTTP_TOKEN`-gated), the `ToolRegistry`, docs + command-wrapper tools | local / static |
| **2A** | Static + artifact diagnostics: provider-manifest tools, `list_builder_metadata_gaps`, smoke-artifact tools, static `diagnose_option_source` (closed `OPTION_SOURCE_DIAGNOSES`) | repo-static / artifact |
| **2B-1** (`93a2d5484`) | `diagnose_option_source_live` + the first `/api/internal/diagnostics/*` route + `applyDiagnosticsGate` | live (Plane-B) |
| **2B-2** (`2274e73e4` derive, `ccb8fcd95` route/tool) | `diagnose_integration_connection` — pure `deriveConnectionDiagnosis` + sessionless authz/provenance route | live (Plane-B) |
| **(guard)** `e3d76a00b` | structural-auth guard recognizes `applyDiagnosticsGate` so gated routes pass without per-route allow-listing | — |

Result: **17 tools** across two planes behind one gate (enumerated in §2.1).

---

## 1. Context

The internal MCP server is a curated, read-only developer tool. It has reached a
stable architecture across five shipped stages, and the last two (2B-1, 2B-2)
established the **Plane-B pattern**: an import-fenced MCP `fetch` tool → an
app-owned `/api/internal/diagnostics/*` route gated by `applyDiagnosticsGate` → a
sanitized DTO. This roadmap plans the **remaining suite** — workflow/run, provider,
builder-graph, composite "doctor", and report-generator tools — so the whole
trajectory is visible and each future slice slots into one consistent model.

It implements nothing. It is the map; each stage gets its own planning + CS slices.

---

## 2. Current codebase findings (verified)

### 2.1 The shipped suite — 17 tools, two planes, one gate

[tools/index.ts](../../../scripts/mcp/tools/index.ts) registers exactly: 5 docs
tools, 3 provider-static tools (`list_provider_manifests`,
`get_provider_manifest_summary`, `explain_provider_connection_requirements`),
`list_builder_metadata_gaps`, 3 command wrappers (`run_typecheck` / `run_lint` /
`run_structure_lint`), 2 smoke-artifact tools, `diagnose_option_source` (static),
and the 2 live tools (`diagnose_option_source_live`, `diagnose_integration_connection`).
All live data flows through `applyDiagnosticsGate`
([_shared.ts](../../../app/api/internal/diagnostics/_shared.ts)): bearer
`DIAGNOSTICS_API_TOKEN`, `DIAGNOSTICS_API_ENABLED` default-OFF → 404,
`DIAGNOSTICS_API_ALLOW_PROD` prod-lock → 404. The MCP side
([diagnoseLive.ts](../../../scripts/mcp/tools/diagnoseLive.ts)) is a `fetch` client
with a shared `postDiagnostic` transport and imports only `./diagnose` + `../registry`
— the import-boundary test enforces this.

### 2.2 Workflows are readable sessionlessly; runs are NOT (the key 2B-3 constraint)

[repositories/workflows.ts](../../../repositories/workflows.ts) `getByIdServiceRole`
(line 408) reads a workflow — including the full `draftDefinition` — via service-role,
**no session required**. This is exactly what a machine-gated diagnostics route needs.

[repositories/workflowRuns.ts](../../../repositories/workflowRuns.ts) is the opposite:
`getById` (250), `listByWorkflow` (269), `listByAccountForDisplay` (356) all use the
**session/RLS** client (`createClient()`), and `getById`/`listByWorkflow`
**exclude `status='running'`** (lines 259, ~279). Only the engine writer (`recordRun`,
`claimNotificationFanout`) uses service-role.

**Consequence:** the sessionless diagnostics route cannot read runs today, and cannot
even *see* a running row to explain "why is my run still running / missing from /runs."
**2B-3 needs one new thin service-role reader** (e.g. `getByIdServiceRole` /
`listByWorkflowServiceRole(includeRunning)` on `workflowRuns`). It reads the existing
`workflow_runs` table → **no migration, no schema change.**

### 2.3 Run + workflow records carry secret-bearing fields (the no-leak constraint)

`WorkflowRunRecord` ([workflowRuns.ts](../../../repositories/workflowRuns.ts) 56-90)
carries `steps[].output` (raw provider/handler output), `steps[].error.message/details`
(raw provider error bodies), `fatalError.message`, and `triggerEvent` (the raw trigger
payload). All can hold PII / provider data / secrets. The **safe** surface already
exists on the row: `errorClassification` (33-39) is the *humanized* `{title,
description, hint, action, severity}` the UI shows, plus `status`, per-step `{nodeId,
status, error.code}` (a code, not a body), counts, `triggeredBy`, `isTest`. The DTO must
project to those and NEVER echo `output` / `error.message` / `error.details` /
`fatalError.message` / `triggerEvent`.

`WorkflowNode.config` ([workflowDefinition.ts](../../../contracts/workflowDefinition.ts)
40) is an **opaque `z.record(string, unknown)`** — it holds field values, which can be
secrets or PII. **2B-5 graph diagnostics return structural facts only** — node IDs,
`provider`/`type`, missing-required-field **names**, unsupported-id flags, unresolved
`{{...}}` reference **locations** — never config **values**.

### 2.4 The "supported ids + required fields" oracle already exists

[services/discovery/_registry.ts](../../../services/discovery/_registry.ts)
(`getActionMeta(key)`, `getTriggerMeta(key)`, `listProvidersWithMetadata`) +
[integrations/_registry.ts](../../../integrations/_registry.ts) (`getProvider`) are the
authoritative, repo-static source for "is `<provider>:<type>` a real node," "what are
its required fields," and "is `<provider>` enabled." 2B-5 (graph) and 2B-4 (provider)
compose these — no new metadata source.

### 2.5 The reuse spine for "is each node's provider connected"

2B-2 already shipped the pure `deriveConnectionDiagnosis`
([connectionDiagnosis.ts](../../../services/integrations/connectionDiagnosis.ts)) +
the `isMemberServiceRole` authz + `decideOptionsCredential` provenance. **2B-3
readiness and the 2C doctors reuse these directly** — workflow readiness is, in part,
"run `deriveConnectionDiagnosis` for every distinct provider the graph uses." No
duplicate connection logic.

---

## 3. Product / model decision — what the suite is, and is NOT

**Is:** a composable, read-only **diagnostic lens** over ChainReactV2 — five concern
areas (option-source, integration-connection, workflow/run, provider/app, builder
graph) plus thin **composite "doctor"** tools and **report generators** that *compose*
the primitives into an owner-friendly answer. Every live answer is a sanitized DTO from
an `applyDiagnosticsGate`-protected route; the MCP process stays a caller.

**Is NOT:** a mutation/repair surface (no rerun, reconnect, disconnect, refresh, edit);
a production data browser; a log/payload viewer; an architecture bypass (it composes
the app's own services through routes, never re-implements them); or a place to grow
`scripts/mcp` into a DB client. The **doctors compose, never duplicate** — a doctor
calls the smaller tools/routes and merges their sanitized DTOs.

Anchored to the V2 account model: every live answer is account-membership-gated
(`isMemberServiceRole`) and respects personal-provider provenance
(`decideOptionsCredential`) — diagnosis sees exactly the wall execution sees.

---

## 4. Recommended approach — the full target suite

### 4.1 Final tool list (target end state)

| Tool | Plane | New? | Composes |
|---|---|---|---|
| docs ×5, command wrappers ×3 | static/local | shipped | — |
| `list_provider_manifests`, `get_provider_manifest_summary`, `explain_provider_connection_requirements` | repo-static | shipped | — |
| `list_builder_metadata_gaps` | repo-static | shipped | — |
| `list_recent_smoke_failures`, `read_smoke_failure_context` | artifact | shipped | — |
| `diagnose_option_source` | repo-static | shipped | — |
| `diagnose_option_source_live` | live | shipped | — |
| `diagnose_integration_connection` | live | shipped | — |
| **`diagnose_workflow_readiness`** | live | 2B-3 | graph (static meta) + `deriveConnectionDiagnosis` |
| **`diagnose_run_failure`** | live | 2B-3 | run record → humanized classification |
| **`explain_run_visibility`** | live | 2B-3 | run lifecycle state (running/absent/test/failed) |
| **`diagnose_workflow_graph`** | live | 2B-5 | draftDefinition × discovery/provider registries |
| **`diagnose_provider_app`** | live (compose) | 2B-4 | static manifest tools + `diagnose_integration_connection` |
| **`doctor_workflow`** | live (compose) | 2C | readiness + graph + run-failure + per-provider connection |
| **`doctor_provider`** | live (compose) | 2C | provider-app + connection + option-sources |
| **`doctor_option_source`** | live (compose) | 2C | `diagnose_option_source` (static) + `_live` + connection |
| **`generate_diagnostic_report`** | compose/format | 2D | any of the above → sanitized runbook text |

### 4.2 Plane classification (Q2)

- **Static / artifact-only** (no route, no live data): all docs/command/smoke/static
  provider/`diagnose_option_source`/`list_builder_metadata_gaps`. Unchanged.
- **Live read-only** (route + gate): `diagnose_option_source_live`,
  `diagnose_integration_connection`, and all 2B-3/2B-5 tools.
- **Live, composition-only** (no NEW route — call existing tools/routes): 2B-4
  `diagnose_provider_app`, all 2C doctors, 2D reports. They issue multiple gated
  requests (or call the sibling tool handlers locally) and merge DTOs. This is how
  "compose, not duplicate" is enforced structurally.

### 4.3 Needed internal diagnostics routes (Q3)

Reuse `applyDiagnosticsGate` on every one. **Only three new routes** across the whole
remaining suite — composition happens MCP-side:

| Route | Stage | Backs |
|---|---|---|
| `/api/internal/diagnostics/option-source` | shipped | `diagnose_option_source_live` |
| `/api/internal/diagnostics/integration-connection` | shipped | `diagnose_integration_connection` |
| **`/api/internal/diagnostics/workflow-readiness`** | 2B-3 | readiness (graph + per-provider connection, server-joined) |
| **`/api/internal/diagnostics/run-failure`** | 2B-3 | `diagnose_run_failure` + `explain_run_visibility` (one route, mode param) |
| **`/api/internal/diagnostics/workflow-graph`** | 2B-5 | `diagnose_workflow_graph` |

2B-4/2C/2D add **no routes** — `diagnose_provider_app` composes the manifest tools +
`/integration-connection`; the doctors compose the five live routes; reports format the
merged DTOs. (Open question OQ-1: a single optional `/workflow-overview` bundle route
could cut MCP→app round-trips for `doctor_workflow`; default recommendation is compose
client-side first, add a bundle route only if latency demands it.)

### 4.4 Reusable services/repositories (through the routes only) (Q4)

| Need | Reuse (server-side, inside the route) |
|---|---|
| Read a workflow + draft graph (sessionless) | `workflows.getByIdServiceRole` |
| Read a run / detect running (sessionless) | **new** `workflowRuns.getByIdServiceRole` / `listByWorkflowServiceRole` (reads existing table; no migration) |
| Account-access authz (sessionless) | `accountMemberships.isMemberServiceRole` |
| Personal-provider provenance | `services/options/credentialPolicy.decideOptionsCredential` + `core/integrations/credentialSharing` |
| Per-provider connection state | `deriveConnectionDiagnosis` + `repositories/integrations` (already wired in 2B-2) |
| Supported node ids + required fields | `services/discovery/_registry` (`getActionMeta`/`getTriggerMeta`/`listProvidersWithMetadata`) |
| Provider manifest facts | `integrations/_registry.getProvider` |
| Humanized run error | the stored `errorClassification` on `WorkflowRunRecord` (pass through; do not recompute) |

The only **new repository** code in the whole roadmap is the sessionless `workflowRuns`
reader (2B-3). Everything else already exists.

---

## 5. Security / no-leak model (Q5, Q6, Q7)

**Gate (Q7) — identical on every live route:** `applyDiagnosticsGate` first
(`DIAGNOSTICS_API_ENABLED` default-OFF → 404; `DIAGNOSTICS_API_ALLOW_PROD` prod-lock →
404; `DIAGNOSTICS_API_TOKEN` bearer constant-time → 401, never echoed). Then **sessionless
account-membership authz** (`isMemberServiceRole` on the resolved account → `NO_ACCOUNT_ACCESS`
with no data fetch). Then **provenance** for any personal-credential surface
(`decideOptionsCredential` → `NOT_WORKFLOW_OWNER`, no fetch). The subject is the explicit
`userId`; the bearer is the machine trust boundary. No `requireUser` (no cookie).

**The five diagnostics gates (two sides of the same boundary):**

| Env var | Side | Role |
|---|---|---|
| `DIAGNOSTICS_API_ENABLED` | app route | Master switch. Unset/false ⇒ every diagnostics route is a generic **404** (capability non-disclosure). |
| `DIAGNOSTICS_API_ALLOW_PROD` | app route | Production lock. In prod the route stays **404** unless this is also explicitly truthy. |
| `DIAGNOSTICS_API_TOKEN` | app route | Bearer the route requires (constant-time compare → **401**; never logged/echoed). |
| `MCP_DIAGNOSTICS_URL` | MCP client | Base origin the tools POST to ([diagnoseLive.ts](../../../scripts/mcp/tools/diagnoseLive.ts) `baseUrl()`); default `http://127.0.0.1:3000`. |
| `MCP_DIAGNOSTICS_TOKEN` | MCP client | Bearer the tools present; **must match the app's `DIAGNOSTICS_API_TOKEN`**, and is **distinct from `MCP_HTTP_TOKEN`** (the transport-layer token). Unset ⇒ the live tools return a help message, never a request. |

Both client-side vars live only in the developer's environment; the MCP process holds no
other app secret and is import-fenced from app code (§Q6). Every new live stage reuses
this exact five-var model — no new gate is introduced.

**Must never leave the app route (Q5):**

| Forbidden | Why / where it lives |
|---|---|
| token blobs / plaintext / refresh tokens | `IntegrationRecord.access/refreshTokenEncrypted` — never spread into a DTO |
| `connectedByUserId`, `providerAccountId`, `displayName`, `accountMetadata` | identity / external-label / metadata on the integration row |
| raw provider responses | `WorkflowRunStep.output`, `error.message/details`, `fatalError.message` |
| raw trigger payloads | `WorkflowRunRecord.triggerEvent` |
| workflow secrets / field values | `WorkflowNode.config` (opaque record) — return field **names** only |
| env values | never echo `process.env` |
| raw logs | no log artifact is exposed; only the humanized `errorClassification` |

**Safe-to-return surface:** enums (status / classification codes), counts, booleans, node
IDs, field **names**, error **codes**, scope **gap** names, and the stored humanized
`errorClassification` (`title/description/hint/action/severity` — built for UI display).

**Stays out of `scripts/mcp` (Q6):** all of the above — Supabase clients, repositories,
services, contracts, env. The import-boundary test
([tests/unit/mcp/security-hardening.test.ts](../../../tests/unit/mcp/security-hardening.test.ts))
already enforces "node:* + local only." MCP tools may import **local static data**
(e.g. the closed `OPTION_SOURCE_DIAGNOSES`, status→plain-English maps) but never app
modules. Composite doctors compose by calling sibling **tool handlers locally** and/or
issuing multiple gated `fetch`es — never by importing app code.

---

## 6. Per-stage design sketch

### 6.1 Stage 2B-3 — workflow/run diagnostics

- **`diagnose_workflow_readiness`** — route loads `getByIdServiceRole`, walks
  `draftDefinition` for distinct `(provider, type)`, and for each provider runs the 2B-2
  derivation. DTO: per-provider `{provider, status, missingScopeCount}` + per-node
  `{nodeId, provider, type, isSupported, missingRequiredFields: string[] (names)}` +
  overall `runnable: boolean`. **Never** config values.
- **`diagnose_run_failure`** — route reads one run (new service-role reader), returns
  `{status, isTest, triggeredBy, firstFailedNodeId, errorClassification, steps:[{nodeId,
  status, errorCode}]}`. **Never** `output`/`error.message`/`triggerEvent`.
- **`explain_run_visibility`** — classifies why a run is "absent from /runs": `RUNNING`
  (the row exists but `status='running'`, hidden by the UI's terminal-only filter —
  §2.2), `NOT_FOUND`, `TEST_RUN` (hidden by test filter), `FAILED_VISIBLE`,
  `WRONG_ACCOUNT`. A pure classifier like `deriveConnectionDiagnosis`.

### 6.2 Stage 2B-4 — provider/app diagnostics

- **`diagnose_provider_app`** — composition tool. MCP-side: calls
  `get_provider_manifest_summary` + `explain_provider_connection_requirements` (static)
  and `diagnose_integration_connection` (live) for a `(provider, account)` and merges
  into one owner-friendly view (enabled? scopes required? connected? gap?). Optionally
  folds `list_builder_metadata_gaps` for that provider. **No new route.**

### 6.3 Stage 2B-5 — builder graph/config diagnostics

- **`diagnose_workflow_graph`** — route loads `draftDefinition` and emits **structural**
  findings: unsupported `provider`/`type` (vs discovery/provider registries), missing
  required fields (**names** from `getActionMeta`/`getTriggerMeta`), broken edges
  (endpoint id not in node set / duplicate / self-loop — the contract already forbids
  these), unresolved `{{...}}` references (source node/field absent — **locations**, not
  values), and provider/account mismatch (a node's provider not connected on the
  workflow's account, via the 2B-2 derivation). DTO is a list of typed findings with
  node IDs + field names only. (OQ-2: confirm the canonical variable-reference format —
  reuse the runtime resolver's parser rather than re-inventing it.)

### 6.4 Stage 2C — composite doctors

- **`doctor_workflow`** = readiness + graph + latest-run-failure + per-provider
  connection, merged into "what's wrong + next steps." **`doctor_provider`** =
  provider-app + connection + dependent option-sources. **`doctor_option_source`** =
  static `diagnose_option_source` + `_live` + the provider's connection. All three
  **compose** sibling tools; none re-implements a route.

### 6.5 Stage 2D — report/runbook generators

- **`generate_diagnostic_report`** — runs a doctor, formats the merged sanitized DTOs
  into a copyable Markdown runbook ("symptom → finding → next step"). Pure local
  formatting over already-sanitized DTOs; the egress `redactSecrets` net is the backstop.
  **No new data access.**

---

## 7. Test matrix (Q8)

| Stage | Gate | Authz no-fetch | Mapping / structural | No-leak | Compose | MCP tool |
|---|---|---|---|---|---|---|
| 2B-3 readiness | ✓ | NO_ACCOUNT_ACCESS / NOT_WORKFLOW_OWNER | per-node supported + missing-field names; per-provider status | no config values / tokens | reuses derive (assert no dup) | render/401/404/net/redact/import-boundary |
| 2B-3 run-failure | ✓ | ✓ | status + classification + step codes | no output/error.message/triggerEvent | — | ✓ |
| 2B-3 visibility | ✓ | ✓ | RUNNING/NOT_FOUND/TEST/FAILED/WRONG_ACCOUNT | — | — | ✓ |
| 2B-5 graph | ✓ | ✓ | unsupported id / broken edge / missing field / unresolved var — names only | no config values | — | ✓ |
| 2B-4 provider-app | ✓ (via children) | inherited | merged view correct | no token/scope-grant leak | **composes, no route dup** | ✓ |
| 2C doctors | inherited | inherited | merged next-steps correct | aggregate no-leak | **calls sub-tools, no logic dup** | ✓ |
| 2D reports | — | — | runbook formatting | redaction over merged DTO | — | render/redact |

Every stage also re-asserts the **import-boundary** guard
([security-hardening.test.ts](../../../tests/unit/mcp/security-hardening.test.ts)) and,
for new routes, the **structural-auth guard**
([api-route-authorization.test.ts](../../../tests/structure/api-route-authorization.test.ts))
— now that it recognizes `applyDiagnosticsGate` (`e3d76a00b`), new gated routes pass
without further edits.

---

## 8. Implementation order (Q9)

1. **2B-3** — highest debugging value (a red run is the most common "why?"). Split like
   2B-2: CS-1 pure `summarizeRunFailure` + `classifyRunVisibility` + the new sessionless
   `workflowRuns` reader (tested in isolation); CS-2 routes + tools.
2. **2B-5** — graph/config; reuses discovery/provider registries; pure
   `analyzeWorkflowGraph` first, then route + tool.
3. **2B-4** — provider-app composition (no route; lowest risk, pure MCP-side merge).
4. **2C** — doctors (compose the above).
5. **2D** — report generators (format).

Each stage gets its own planning + CS slices; each ships behind the existing gate,
default-OFF, never auto-enabled in prod.

---

## 9. Non-goals (Q10 — exact)

- No mutation of any kind: no rerun/retry, reconnect, disconnect, token refresh, pause/
  resume, or workflow/config edit.
- No write-capable MCP tools — the suite is read-only end to end.
- No production enablement by default; prod requires the explicit `DIAGNOSTICS_API_ALLOW_PROD`.
- No raw logs, step outputs, provider response bodies, trigger payloads, or node config
  values in any output.
- No migration / `db:push` (the one new repo reader reads an existing table).
- No new MCP transport; no admin role invented; no DB/service/Supabase import in `scripts/mcp`.
- No giant monolith tool — doctors compose small tools.
- No live provider calls in 2B-3/2B-4/2B-5 (stored-state + registries only). The single
  existing live-provider-call tool stays `diagnose_option_source_live` (2B-1).

---

## 10. Risks / open questions (each with a recommendation)

- **OQ-1 — bundle route vs MCP-side compose for the doctors.** *Recommendation:* compose
  client-side first (fewer routes, less server surface); add a single `/workflow-overview`
  bundle route only if round-trip latency proves painful.
- **OQ-2 — canonical `{{...}}` variable-reference format for 2B-5.** *Recommendation:*
  reuse the runtime resolver's parser (do not re-invent); if it isn't cleanly importable
  into a route without dragging the engine, extract a small pure parser. Mark unverified
  until the resolver is inspected in the 2B-5 planning slice.
- **OQ-3 — new `workflowRuns` service-role reader surface.** It can read across accounts
  (service-role). *Recommendation:* the route must still gate by `isMemberServiceRole` on
  the run's `accountId` before returning anything — the reader is raw; the route is the
  authz chokepoint (mirrors the integrations service-role readers in 2B-2).
- **OQ-4 — `errorClassification` may be null on older runs.** *Recommendation:* the run-
  failure DTO returns a `classificationAvailable: boolean`; never fall back to raw
  `error.message`.
- **OQ-5 — doctor token cost.** Composing N tools fans out N gated requests.
  *Recommendation:* fine for a manual dev tool; cap fan-out and document it; no caching.

---

## 11. Acceptance criteria

**For this planning slice:** this roadmap exists under `docs/slices/phase-4/`, every
current-state claim ties to a file that was read, no source/test/migration/UI changed,
nothing pushed.

**For the suite to later meet (per stage):** new routes reuse `applyDiagnosticsGate`,
authorize via `isMemberServiceRole`, and return only the safe surface (§5); the MCP
process still imports only `node:*` + local modules; the doctors compose rather than
duplicate; no mutation, no live provider calls (except 2B-1), no migration; the
import-boundary + structural-auth guards stay green; `typecheck` / `lint` /
`lint:structure` / `mcp:build` / `mcp:smoke` / `http-smoke` green.

---

## 12. Hard boundaries (what this slice did NOT change)

No source, tests, migrations, schema, UI, or config changed. No route or MCP tool was
added. The shipped server, routes, gate, and the run/workflow repositories are
untouched. Nothing was pushed. The tool list, route list, plane classification, and
ordering are **proposals** for the named future stages.

---

## 13. Recommended next step

Pick up **Stage 2B-3, CS-1** — the pure run layer: add the sessionless
`workflowRuns.getByIdServiceRole` (+ a running-aware list), plus pure
`summarizeRunFailure(run)` and `classifyRunVisibility(run | null, requesterContext)`
functions with full table-tests (mirror the 2B-2 CS-1 split: pure + tested before any
HTTP). Then 2B-3 CS-2 wires the `/run-failure` route + `diagnose_run_failure` /
`explain_run_visibility` tools. Do **not** start 2B-4/2B-5/2C/2D until 2B-3 lands and is
accepted.
