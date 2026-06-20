# REACT-AGENT-CS-5C-AUDIT-RECORDER — Implementation note

**Type:** Implementation slice (recorder layer only — no runtime wiring). Local commit,
**nothing pushed**. No migration, no env/provider change.
**Date:** 2026-06-19
**Branch:** `v2-main`
**Parent:** [react-agent-cs-5-audit-seam-plan.md](./react-agent-cs-5-audit-seam-plan.md) →
[react-agent-cs-5b-audit-storage.md](./react-agent-cs-5b-audit-storage.md) → CS-5c.

## What was added

An injectable **audit recorder** that maps a safe React Agent capability outcome onto the
`react_agent_audit_events` ledger (CS-5b) via `insertAuditEvent`. New `audit/` submodule under
`services/ai/reactAgent/`:

- `audit/types.ts` — `ReactAgentAuditRecorderInput` (the safe seam input) and the
  `ReactAgentAuditRecorder` interface (`record(input): Promise<void>`, fail-open).
- `audit/recordReactAgentAuditEvent.ts` — `createReactAgentAuditRecorder(deps?)` factory +
  `reactAgentAuditRecorder` (the default live recorder). Maps input → repo insert shape,
  sanitizes `metadata`, caps `reason`/opaque refs, **fails open**.
- `audit/noopReactAgentAuditRecorder.ts` — `noopReactAgentAuditRecorder`, the default
  injection (and test default) that does nothing, successfully.
- `audit/index.ts` — the public surface (the only place callers import the recorder from).

## Not wired into runtime yet

`runAuthorizedCapability` (and `services/ai/reactAgent/index.ts`) are **unchanged**. Nothing
emits audit events at runtime. CS-5d injects a recorder into the seam from the gated route and
emits for the read-only Q&A / Explain outcomes (attaching `ai_cost_event_id`).

## Import-safety (core stays DB-free)

The recorder depends on the DB repository, so it lives in the `audit/` **submodule** — not in
the React Agent core. The boundary import guard
([`boundary-imports.test.ts`](../../../../tests/unit/services/ai/reactAgent/boundary-imports.test.ts))
scans only the **top-level** boundary files (`index.ts` / `types.ts` / `capabilities.ts`) and
now additionally asserts those core files import **no** `audit/` submodule and **no** DB
repository. CS-5d must inject the recorder from the route, not import it into the core.

## Metadata / no-leak rules

- Reuses the **shared** `sanitizeAiEventMetadata` from `services/billing/aiCostEvents` (the same
  denylist `ai_cost_events` uses) — **no second sanitizer**. Drops keys matching
  token/secret/password/authorization/api-key/credential/prompt/completion/chain-of-thought/
  body/file-content/config/raw; caps strings (512), depth (3), array size (50).
- Non-object `metadata` (null / array / scalar) is coerced to `{}` before sanitizing, so a
  scalar/array can never reach the `jsonb_typeof(metadata) = 'object'` CHECK.
- `reason` is treated as a SAFE enum/string only and truncated to 128 chars; opaque refs
  (`proposed_patch_ref` / `approval_id` / `conversation_id`) truncated to 256 — matching the
  ledger's `react_agent_audit_text_len_chk` so a slightly-oversized value is persisted rather
  than lost. The recorder never derives `reason` from a raw DB/model error.

## Fail-open

`record()` wraps the repository insert in `try/catch` and swallows any error — an audit-write
failure (RLS / missing service-role env / DB down) must **never** break the agent/user path.
The repository itself still throws a generic, detail-free error (CS-5b); the recorder is the
fail-open boundary above it. (Lower-level repository tests still assert the repo throws.)

## Default-grant finding — intentionally deferred

The CS-5b live verification confirmed `authenticated` carries schema-default grant-level
INSERT/UPDATE/DELETE on this table (identical to `ai_cost_events`); effective writes are still
denied by RLS (no write policy). A grant-layer least-privilege cleanup is **out of scope** here
— it belongs to a broader DB-hardening slice across all ledgers.

## Tests / verification

- `tests/unit/services/ai/reactAgent/audit/recordReactAgentAuditEvent.test.ts` — mapping →
  insert shape; metadata defaults to `{}`; non-object metadata coerced; unsafe keys dropped +
  no leaked value survives; oversized string capped; reason/ref caps; fail-open on insert
  throw/reject; no-op recorder; default live recorder shape.
- Extended `boundary-imports.test.ts` with the core-must-not-import-audit/repo guard.
- Ran: focused React Agent suite + repository + migration-shape tests (**57 passed**),
  `npm run typecheck` (clean), `eslint` on touched files (0), `npm run lint:structure` (OK).

## Next slice (CS-5d)

Inject a recorder into `runAuthorizedCapability` (default `noopReactAgentAuditRecorder`); the
gated route injects `reactAgentAuditRecorder` and emits `success`/`denied`/`failed` for the
read-only Q&A / Explain capabilities, attaching the `ai_cost_event_id` it already records.
