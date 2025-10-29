# Flow v2 State Summary

## Top-Level Structure
- `app/workflows/v2/page.tsx` – Flow list + create action (workspace-aware).
- `app/workflows/v2/[flowId]/page.tsx` – Builder entry point (server-rendered, loads current revision).
- `app/workflows/v2/templates/page.tsx` – Template gallery / instantiation screen.
- `src/components/workflowsV2/FlowBuilderClient.tsx` – Primary client bundle for graph editing, inspector, run controls, logs, and alerts.

## Core Libraries
- `src/lib/workflows/v2/schema.ts` – Zod schemas shared across runtime and APIs.
- `src/lib/workflows/v2/repo.ts` – Revision repository for CRUD against Supabase.
- `src/lib/workflows/v2/runner/execute.ts` – DAG executor, run store integration, node retry logic.
- `src/lib/workflows/v2/logging.ts` – Structured per-node log writer used by the run store.
- `src/lib/workflows/v2/workspace.ts` – Helpers for role resolution (`viewer`/`editor`/`owner`) + default workspace discovery.
- `src/lib/workflows/v2/secrets.ts` – Encryption, resolution, and CRUD helpers for `v2_secrets`.
- `src/lib/workflows/v2/schedules/index.ts` – Schedule helpers (validation, CRUD, next run calculations).
- `src/lib/workflows/v2/templates/index.ts` – Template persistence + cloning utilities.
- `src/lib/workflows/v2/alerts.ts` – Consecutive failure tracker used by the builder UI.

## API Routes
- `/workflows/v2/api/flows/*` – Flow editing, runs, revisions, publish, prereqs, costing.
- `/workflows/v2/api/runs/*` – Run inspection + node snapshots, now returning per-node logs and summary metrics.
- `/workflows/v2/api/schedules/*` – Workspace-scoped schedule CRUD + tick worker.
- `/workflows/v2/api/templates/*` – Template listing, creation, and instantiation.
- `/workflows/v2/api/secrets` – Workspace-level secret CRUD.
- `/workflows/v2/api/health` – Aggregated health endpoint (`db` status, pending runs, last run).

## Migrations & Database
- `supabase/migrations/20251027072859_create_flow_v2_tables.sql` – Core table definitions for Flow v2.
- `supabase/migrations/20251027095836_flow_v2_parity.sql` – Additional parity tables (templates, schedules, secrets, node logs) + RLS enablement.
- `supabase/migrations/20251028000100_flow_v2_rbac.sql` – Workspace memberships, helper function `workspace_role_at_least`, and table-level policies across Flow v2.

## Tests
- `__tests__/workflows/v2/api/accessControl.test.ts` – Guards for feature flag + workspace access.
- `__tests__/workflows/v2/api/health.test.ts` – Health endpoint contract.
- `tests/flow-v2-builder.spec.ts` – Playwright smoke; validates inspector tabs (including Logs).

## Observability & Alerts
- Node logs are persisted via `createNodeLogger` and surfaced in the builder inspector.
- Run summary banner shows duration, cost, success/error counts.
- Consecutive failures trigger a toast alert using `recordRunFailure`.

## Remaining Gaps
- Planner tooling (`listNodes`, `getNodeSchema`, etc.) under the ReAct-lite milestone remains TODO.
- Error taxonomy UX improvements are tracked but not yet implemented.
