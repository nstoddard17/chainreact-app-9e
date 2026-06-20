# REACT-AGENT-CS-5B-AUDIT-STORAGE — Implementation note

**Type:** Implementation slice (storage only — migration + RLS + repository + tests).
Local commit, **nothing pushed**. **Migration NOT applied** (`db:push` deferred to Marcus's
approval). No runtime emission, no env/provider change.
**Date:** 2026-06-19
**Branch:** `v2-main`
**Parent:** [react-agent-cs-5-audit-seam-plan.md](./react-agent-cs-5-audit-seam-plan.md) → CS-5b.

## What was added

- **Migration** `supabase/migrations/20260705000000_react_agent_audit_events.sql` — the
  dedicated account-scoped governance/audit ledger for the React Agent (separate from the
  `ai_cost_events` cost ledger; links to it via `ai_cost_event_id`).
- **Repository** `repositories/reactAgentAuditEvents.ts` — `insertAuditEvent` (service-role
  write) + `listAuditEventsForAccount` (RLS member read) + safe field/record types.
- **Tests** — repository unit tests + a static migration-shape security guard.

## Table / columns

`react_agent_audit_events`: `id`, `account_id`, `actor_user_id`, `workflow_id`,
`conversation_id`, `capability_id`, `intent`, `mode`, `credit_feature`, `audit_kind`,
`outcome`, `reason`, `proposed_patch_ref`, `approval_id`, `ai_cost_event_id`, `metadata jsonb`,
`anonymized_at`, `ledger_purge_after`, `created_at`.

**CHECK constraints:** `outcome ∈ {success, denied, failed}`; `mode ∈ {read_only,
proposes_change, requires_approval}`; `jsonb_typeof(metadata) = 'object'`; reasonable
text-length caps on every id/enum/ref column. **No raw-payload columns** (no prompt / answer /
question / config / secret / token / payload).

**Indexes:** `(account_id, created_at DESC)`; `(workflow_id, created_at DESC) WHERE workflow_id
IS NOT NULL`; `(capability_id, created_at DESC)`; `(ai_cost_event_id) WHERE NOT NULL`; the
ledger purge index `(ledger_purge_after) WHERE anonymized_at IS NOT NULL`.

## Security model (RLS / GRANT)

- **RLS enabled.** Read policy `react_agent_audit_select_account_member`: members of the owning
  account only (`EXISTS … account_memberships … auth.uid()`) — mirrors `ai_cost_events`.
- **Service-role-write-only.** No user-facing INSERT/UPDATE/DELETE policy → default-deny, so an
  actor can never fabricate or erase their own audit trail.
- **GRANTs:** `authenticated` → SELECT only (RLS narrows to member accounts); `service_role` →
  full. (`lint:migrations` green.)

## Deletion / retention behavior (mirrors the ledger convention, NOT invented)

Follows the **anonymize → retain → purge** convention established for `ai_cost_events` /
`task_usage_events` / `billing_shadow_comparisons` (ACCOUNT-MODEL-10d, `20260531000008`): the
`account_id` / `actor_user_id` / `workflow_id` / `ai_cost_event_id` FKs are **`ON DELETE SET
NULL`** (and the columns nullable), so deleting an account/workflow/cost-event **retains** the
audit row with the correlation key nulled instead of cascade-deleting the governance trail. A
NULL `account_id` row matches no membership → automatically non-addressable by RLS. The
`anonymized_at` / `ledger_purge_after` columns + partial purge index match the other ledgers so
a future retention cron can adopt this table without another migration. **No `ON DELETE
CASCADE`** anywhere (asserted by the structure test).

## Repository API

- `insertAuditEvent(event: ReactAgentAuditEventInsert): Promise<void>` — service-role insert;
  maps to snake_case; **defaults `metadata` to a plain object** (so a scalar/array can't reach
  the `jsonb_typeof = object` CHECK); throws a **generic, detail-free** error on DB failure (no
  raw DB text). `ReactAgentAuditOutcome` / `ReactAgentAuditMode` typed unions.
- `listAuditEventsForAccount(accountId, opts?): Promise<readonly ReactAgentAuditEventRecord[]>` —
  RLS (SSR-cookie) client, `account_id`-filtered, newest-first, default cap 100. Never uses the
  service-role client (member-facing read).

## NOT wired to runtime yet

Nothing emits these events. `runAuthorizedCapability` is **unchanged** in this slice. CS-5c adds
the recorder service (sanitize + map → `insertAuditEvent`); CS-5d injects it into the seam to
emit on every read-only-capability outcome (fail-open) + has the route attach `ai_cost_event_id`.
Repair/proposes-change wiring stays held until the seam emits.

## Verification (this slice)

- `npx jest` on the repo + migration-shape tests → **2 suites, 12 passed** (service-role insert
  + field mapping; metadata-defaults-to-object; optional-ref nulling; detail-free DB error; RLS
  client + account-scoped/newest-first/limit list; row→record mapping; **static security shape**:
  RLS enabled, member-read via `account_memberships`, authenticated SELECT-only + no write
  policy/grant, all FKs SET NULL + no CASCADE, outcome/mode/metadata CHECKs, no raw-payload columns).
- `npm run lint:migrations` → **OK**; `npm run typecheck` → **clean**; `eslint` touched → **0**;
  `npm run lint:structure` → **OK**.
- **`db:push` NOT run** — the migration is committed for Marcus's review; live RLS/CHECK/set-null
  DB tests (member-only read, invalid outcome/mode rejection) run **after** approval + `db:push`.
