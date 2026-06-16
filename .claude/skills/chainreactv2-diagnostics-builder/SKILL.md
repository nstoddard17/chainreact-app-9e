---
name: chainreactv2-diagnostics-builder
description: Use when building, reviewing, or extending ChainReactV2 diagnostic / doctor functionality — MCP diagnostic tools, /api/internal/diagnostics/* routes, services/diagnostics/* and services/ai/diagnostics/* brains, workflow-readiness checks, run failure / run visibility diagnosis, integration-connection or workflow-connection diagnosis, or AI diagnosis / explanation / repair-preview features. Enforces the three-layer architecture (route = gate/auth/validate/serialize only · service = the diagnostic brain · MCP = adapter/render only), safe summarized output (status/category/reason/next-step — never tokens, raw provider payloads, DB/Postgres errors, stack traces, config blobs, scopes, or PII), the diagnostics gate for privileged/live access (default-OFF, prod-locked), deterministic diagnostics staying free/ungated and LLM explanation/repair gated before the model call, allow-listed DTOs for any AI input, and tests for gate / authz / no-leak / status-mapping / next-steps / provenance. Local-only commit, no push.
---

# ChainReactV2 Diagnostics Builder

For any work on the diagnostic / doctor surface — the deterministic diagnosis services, the
internal MCP diagnostic suite, and the AI diagnosis/explanation/repair layer. The point of
this skill is that diagnostics give an **actionable answer without exposing sensitive
internals**, and that every new diagnostic follows the same layered, gated, no-leak shape
instead of growing a one-off fat route or an MCP-only brain.

> **Context first.** Before gathering ChainReactV2 repo/project context, follow the
> [`chainreactv2-mcp-context`](../chainreactv2-mcp-context/SKILL.md) skill — use the MCP for
> curated project memory, the diagnostics rule/runbook docs, and current slice status to
> orient, then inspect the actual services/routes/tests before changing anything.

**Authoritative architecture references (read before extending):**
[`docs/runbooks/internal-mcp-server.md`](../../../docs/runbooks/internal-mcp-server.md) ·
[`docs/slices/phase-4/mcp-diagnostic-suite-closeout.md`](../../../docs/slices/phase-4/mcp-diagnostic-suite-closeout.md) §2–§3 ·
AI layer: [`ai-diag-2-llm-explanation-plan.md`](../../../docs/slices/phase-4/ai-diag-2-llm-explanation-plan.md),
[`ai/ai-repair-1-safe-repair-proposal-closeout.md`](../../../docs/slices/phase-4/ai/ai-repair-1-safe-repair-proposal-closeout.md).
Cross-cutting rules: [`docs/rules/database-security.md`](../../../docs/rules/database-security.md),
[`docs/rules/account-ownership-model.md`](../../../docs/rules/account-ownership-model.md).
This skill is the **procedure**; those docs are the source of truth. If they conflict with this
skill, they win.

This skill inherits the no-leak defaults of
[`chainreactv2-security-review`](../chainreactv2-security-review/SKILL.md) and the local-only /
inspect-before-change / reuse-before-add rules of
[`chainreactv2-local-slice-executor`](../chainreactv2-local-slice-executor/SKILL.md). When
`CLAUDE.md` or an explicit Marcus instruction conflicts with this skill, they win.

## When to use this skill

- Adding or modifying an **MCP diagnostic tool** (`scripts/mcp/tools/*`).
- Adding or modifying an **`/api/internal/diagnostics/*` route**.
- Adding or modifying a **`services/diagnostics/*`** brain.
- Working on **workflow readiness** checks (`workflowReadiness.ts`).
- Working on **run failure / run visibility** diagnosis (`runReport.ts`).
- Working on **integration-connection or workflow-connection** diagnosis
  (`integrationConnection.ts`).
- Working on **AI diagnosis / explanation / repair-preview / doctor-style** features
  (`services/ai/diagnostics/*`, `/api/workflows/[id]/ai/diagnose|repair/*`).
- **Reviewing diagnostic output** for safety / no-leak behavior.

## Required architecture (three layers, no mixing)

This is the rule every diagnostic follows (closeout §2). Do not reintroduce fat routes or
MCP-only business logic.

| Layer | Owns | Must NOT |
|---|---|---|
| **Route** (`/api/internal/diagnostics/*`, `/api/workflows/[id]/ai/*`) | gate (`applyDiagnosticsGate` / `loadWorkflowForMember`), body parse, input validation, locator resolution, JSON serialization | hold diagnostic logic, read raw rows, or build verdicts |
| **Service** (`services/diagnostics/*`, `services/ai/diagnostics/*`) | the **brain** — raw read, account-membership authz, credential provenance, the pure derivation, and **sanitized DTO assembly**. In-process callable so a future in-app agent reuses the same wall without HTTP. | echo raw provider/DB data into the DTO |
| **MCP tool** (`scripts/mcp/tools/*`) | protocol adapter + rendering only — `fetch` the route, render the already-sanitized DTO into text; status→note mapping is MCP-side (`connectionStatusNotes.ts`) | import app code, add a brain, or put prose in the DTO |
| **Client / UI** | consume the safe **summarized** DTO (status / reason / next-steps / safe labels) | render raw provider/internal data, node ids, config, or error bodies |

Additional structural rules:

- **AI diagnosis/repair uses safe DTOs / allow-listed projections only.** Any LLM input goes
  through the explicit allow-list projector (`buildDiagnosisExplainContext`), which constructs
  the context field-by-field (never spreads the DTO). The route **re-derives the DTO
  server-side** and never trusts a client-posted diagnosis.
- **Deterministic diagnostics stay free / ungated** (0-credit, no model) unless an existing
  rule says otherwise — "Check workflow" / readiness / connection checks are deterministic.
- **LLM explanation / repair planning is gated before the model call** when billing rules
  require it: resolve the authz wall first, then the credit gate, then the model. Fail closed
  (OpenAI not configured / gate error → 503 **before** any charge or model call); keep
  telemetry fail-open.
- **Repositories stay database-only; `core/` pure helpers stay pure.** No service/repo imports
  into `core/`.

## Safety rules (no-leak — non-negotiable)

Diagnostic output is a **status report, not a data dump.** Prefer
`status / category / reason / next-step` shapes; return actionable diagnosis without exposing
internals.

- **Never in any diagnostic output** (DTO, MCP render, UI, AI prompt, or AI response): secrets,
  OAuth tokens / refresh tokens, env values, credentials, raw provider payloads, or private
  customer/user data.
- **Never surface raw internals to users/models:** raw DB / Postgres errors, stack traces,
  provider error bodies, config blobs / node `config` values, full granted scope lists, scope
  blobs, `providerAccountId` / `connectedByUserId` / display names / account metadata,
  service-role details, exact token-expiry instants, raw step outputs, or trigger payloads.
- **Allowed in DTOs:** enums / counts / booleans, node ids (internal only — **never** in
  user/model text; use safe display labels there), public required-scope **gap** names, missing
  **field NAMES**, and the stored humanized `errorClassification`.
- **Privileged / live access lives behind the existing diagnostics gate.** Internal live
  diagnosis routes use `applyDiagnosticsGate` (`DIAGNOSTICS_API_ENABLED` default-OFF → 404; in
  production also `DIAGNOSTICS_API_ALLOW_PROD` → else 404; constant-time bearer → 401, never
  echoed). Capability non-disclosure: a disabled or unauthorized env returns 404/401 and leaks
  nothing.
- **Authz before data.** Non-member → access wall with **no row fetched**. Personal-provider
  provenance → a non-creator gets the provenance wall with **no credential row fetched**;
  co-member personal credential existence/count/details are never revealed.
- **Production diagnostics stay default-off / prod-locked** unless the documented contract says
  otherwise.

## Implementation procedure

1. **Identify which diagnostic plane/type the work is**, and find the matching existing pattern
   before writing anything new:

   | Type | Existing pattern to extend |
   |---|---|
   | repo / static (docs, provider, smoke, option-source map) | Stage-2A MCP tools + static manifests |
   | live internal diagnostic | `/api/internal/diagnostics/*` route + `applyDiagnosticsGate` |
   | workflow readiness | `services/diagnostics/workflowReadiness.ts` |
   | run failure / visibility | `services/diagnostics/runReport.ts` |
   | integration / workflow connection | `services/diagnostics/integrationConnection.ts` |
   | AI diagnosis / explanation / repair | `services/ai/diagnostics/*` + `buildDiagnosisExplainContext` |

2. **Inspect the real code first** — open the existing service/route/test in that plane and
   trace the actual call chain. Don't assume from the closeout alone.
3. **Prefer extending an existing diagnostic service over route-resident logic.** If a route is
   starting to hold a brain, extract it into `services/diagnostics/*` (the integration-connection
   extraction is the precedent). New brains are in-process callable.
4. **Add or update tests** for:
   - gate behavior (enabled/disabled, prod-lock, bearer pass/fail);
   - auth / account / workflow-membership boundaries (non-member → wall, no fetch);
   - **no-leak** output (assert the forbidden fields never appear);
   - status mapping (each status/category → expected verdict);
   - expected next-steps;
   - provider / account / credential **provenance** where relevant (personal vs account-shared).
5. **Make output stable and structured** — enums/booleans/counts/safe-label shapes — so the same
   DTO is consumable by MCP, UI, and reports without reshaping. Build the DTO field-by-field;
   never spread a raw row or response.
6. **Verify + commit locally.** Run the smallest relevant gates for what you touched
   (`npm run lint:structure` for structure; the diagnostics/AI unit tests when services/routes
   changed; `npm run mcp:smoke` when an MCP tool changed). State exactly what ran. Local commit,
   **no push**.

## What this skill is NOT

- Not a roadmap. The unbuilt stages (graph / doctors / reports) live in the roadmap doc; this
  skill governs *how* any of them must be built, not *when*.
- Not a V1-parity frame. Build the V2 diagnostic on V2's boundaries; don't anchor it to V1.
- Not a license to add mutation. The suite is read-only end to end — no rerun/reconnect/refresh/
  edit/apply tool unless a new, separately-approved contract introduces one.
