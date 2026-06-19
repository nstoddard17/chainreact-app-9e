# 4.MCP-SUITE — Internal MCP Diagnostic Suite Closeout

**Type:** Closeout / status. Docs-only. Local on `builder-ui-v1-audit-1`; not pushed.
**Date:** 2026-06-12
**Supersedes the "shipped vs planned" status in** the planning roadmap
([mcp-internal-diagnostic-suite-roadmap.md](./mcp-internal-diagnostic-suite-roadmap.md)) —
that doc is the original map; this is what actually landed.

---

## 1. What shipped

The internal MCP diagnostic suite now has a **complete live (Plane-B) layer** for
option-source, integration-connection, workflow/run, and workflow-wide connection
diagnosis. Every live answer is a sanitized DTO from an
`applyDiagnosticsGate`-protected `/api/internal/diagnostics/*` route; the MCP
process stays a `fetch` client (import-fenced to `node:*` + local modules).

### Live tools (Plane-B)

| MCP tool | Backing route | Capability service |
|---|---|---|
| `diagnose_option_source_live` | `/api/internal/diagnostics/option-source` | (route-resident; resolver run) |
| `diagnose_integration_connection` | `/api/internal/diagnostics/integration-connection` | `services/diagnostics/integrationConnection.ts` (`diagnoseProviderConnection`) |
| `diagnose_run_failure` | `/api/internal/diagnostics/run-failure` | `services/diagnostics/runReport.ts` (`diagnoseRunReport`) |
| `explain_run_visibility` | `/api/internal/diagnostics/run-failure` (`mode:"visibility"`) | `services/diagnostics/runReport.ts` |
| `diagnose_workflow_readiness` | `/api/internal/diagnostics/workflow-readiness` | `services/diagnostics/workflowReadiness.ts` (`diagnoseWorkflowReadiness`) |
| `diagnose_workflow_connections` | `/api/internal/diagnostics/workflow-connections` | `services/diagnostics/integrationConnection.ts` (`diagnoseWorkflowConnections`) |

`diagnose_option_source` and the Stage-2A docs/provider/smoke tools remain
static/artifact-only. Full registry today: **21 tools** (`npm run mcp:smoke`).

### Capability services (the diagnostic "brains")

- `services/diagnostics/runReport.ts` — run failure + visibility.
- `services/diagnostics/workflowReadiness.ts` — graph/required-field verdict + static provider inventory.
- `services/diagnostics/integrationConnection.ts` — single-provider connection (`diagnoseProviderConnection`) **and** workflow-wide connection readiness (`diagnoseWorkflowConnections`).

### Internal routes (all behind `applyDiagnosticsGate`)

`/api/internal/diagnostics/`: `option-source`, `integration-connection`,
`run-failure`, `workflow-readiness`, `workflow-connections`.

---

## 2. The architecture rule (every future diagnostic follows this)

Three layers, no mixing:

- **Route = adapter boundary only** — `applyDiagnosticsGate`, body parse, input
  validation, locator resolution, JSON serialization. **No diagnostic logic.**
- **Service (`services/diagnostics/*`) = the brain** — raw read, account-membership
  authz (`isMemberServiceRole`), credential provenance (`decideOptionsCredential`),
  integration/run/workflow reads, the pure derivation (`deriveConnectionDiagnosis`
  etc.), and sanitized DTO assembly. Callable in-process, so a future agent reuses
  the same wall without HTTP.
- **MCP tool = protocol adapter + rendering only** — a `fetch` client that POSTs
  JSON and renders the already-sanitized DTO into text. No app imports; status
  codes map to human notes **MCP-side** (`scripts/mcp/tools/connectionStatusNotes.ts`),
  never as prose in the DTO.

Consolidation done in this arc: the integration-connection route's inline brain was
extracted into `integrationConnection.ts` (CS-2a, `aaccd237e`) so no live route
carries diagnostic logic. **Do not reintroduce fat routes or MCP-only business
logic.** Repositories stay database-only; pure helpers stay pure.

---

## 3. Security / no-leak guarantees

- **Gate (`app/api/internal/diagnostics/_shared.ts`):** `DIAGNOSTICS_API_ENABLED`
  default-OFF → 404; in production additionally `DIAGNOSTICS_API_ALLOW_PROD` →
  else 404; `DIAGNOSTICS_API_TOKEN` bearer constant-time → 401, never echoed. Not a
  browser route — no `requireUser`; the subject is the explicit `userId`.
- **Authz is sessionless + per-account:** non-member → access wall with **no data
  fetch**. Personal-provider provenance → a non-creator gets `NOT_WORKFLOW_OWNER`
  with **no credential row fetched**; co-member personal credential
  existence/count/details are never revealed (personal active-count scoped to 1/0;
  account-wide count only for account-shared providers).
- **Never returned:** token blobs / refresh tokens, `connectedByUserId`,
  `providerAccountId`, `displayName`, raw `accountMetadata`, the full granted scope
  list, exact token-expiry instant, raw step outputs / provider error bodies /
  trigger payloads, workflow node `config` values, env. DTOs are
  enums/counts/booleans + node ids + public required-scope **gap** names + the
  stored humanized `errorClassification` only.
- Enforced by the MCP import-boundary guard
  (`tests/unit/mcp/security-hardening.test.ts`) and the structural-auth guard
  (`tests/structure/api-route-authorization.test.ts`, recognizes
  `applyDiagnosticsGate`), plus per-capability no-leak tests.

---

## 4. Open questions / follow-ups

- **OQ-C (logged, not fixed):** the single-provider `integration-connection` route
  resolves the workflow's creator via the **RLS-scoped** `workflows.getById`, so a
  sessionless workflow-scoped call there can degrade to `NO_ACCOUNT_ACCESS`. The
  workflow-wide capability deliberately avoids this by reading
  `workflows.getByIdServiceRole`. Documented in the route comment.
- **Diagnostics stay OFF by default and prod-locked** unless explicitly enabled.
- **MCP is an external adapter.** A future in-app React Agent should consume
  `services/diagnostics/*` **directly** (same authz wall), not call the MCP server.
- **No public UI wiring** for diagnostics yet.
- **No mutation / apply-patch tools** — the suite is read-only end to end; no
  rerun/reconnect/refresh/edit.
- **Roadmap stage 2B-5 (graph) SHIPPED** (Phase C-1) — `diagnose_workflow_graph` via the gated
  `/api/internal/diagnostics/workflow-graph` route + `services/diagnostics/workflowGraph.ts` brain,
  following the §2 three-layer pattern (structural findings only; no config values).
- **Roadmap stage 2C (doctors) SHIPPED** (Phase C-2) — `doctor_workflow` / `doctor_provider` /
  `doctor_account_integration` (`scripts/mcp/tools/doctors.ts` + `doctorsProviders.ts`). They
  **compose** the existing gated routes (via `postDiagnostic`) + the static `providerStatics` brain
  — **no new route, no new brain, no DB access**. `doctor_account_integration` is provider-scoped;
  account-wide enumeration is deferred (would need a new gated route).
- **Roadmap stage 2D (reports) SHIPPED** (Phase 2D) — `generate_diagnostic_report` /
  `generate_deploy_readiness_report` (`scripts/mcp/tools/reports.ts` + `lib/reportShared.ts`).
  `generate_diagnostic_report` **composes** the doctors by calling their shared `compute*`
  functions (extracted into `DoctorOutcome`-returning helpers so the report reuses the exact
  diagnosis instead of re-deriving it) and renders Markdown + a structured-metadata JSON block.
  `generate_deploy_readiness_report` **composes** the existing safe local check tools
  (typecheck / structure-lint / migration-lint / route- & provider-structure tests /
  smoke-artifact summary; broad lint opt-in) — `advisory` runs nothing, `runSafeChecks` runs only
  the allow-listed read-only tools, and it **never** pushes/deploys/applies-migrations/runs
  db:push/triggers prod smoke. Both add **no new route, no new brain, and no DB access**. Output is
  enums/counts/ids/field-names + already-redacted check tails only. With 2D shipped the
  **MCP internal diagnostic + reporting roadmap (stages 2A→2D) is complete**; smoke runners and any
  mutating/deploy tools remain Phase D / do-not-build.

---

## 5. Verification (this slice)

Docs-only. No source/test/migration/UI changed. The shipped facts above were read
from the live files; the suite baseline measured during the CS-2 arc that precedes
this closeout: `tests/unit/mcp` 17 suites / 186 tests green, capability/route tests
green, `mcp:build` + `mcp:smoke` green (21 tools), global `typecheck` + `build`
green at `e5573fc6a`. No push, no deploy, no `db:push`, no migration.
