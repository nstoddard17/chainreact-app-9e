-- ChainReactV2 — Slice 3.POSTSEC-8: high-risk workflow audit notification
-- types.
--
-- The existing `notifications` table (20260507000004) is the in-app feed
-- surface for user-facing events. POSTSEC-8 extends it with two audit
-- event types so workflow owners get an in-app record when one of their
-- high-risk workflows is activated or really-run after typing the
-- destructive-action confirmation phrase. These give the workflow owner
-- an audit trail without standing up a parallel audit table — the
-- spec's "use existing infra if present, don't fork a parallel system."
--
-- Cross-user / cross-tenant admin visibility is intentionally OUT of
-- scope: that needs a separate admin query / dashboard slice. The data
-- captured here is enough to feed that later.
--
-- Why ADD VALUE for an enum rather than swap to text + CHECK:
--   - The 'workflow_failed' enum value already exists and is referenced
--     by live notification rows (the workflow-failure orchestrator
--     writes it). Swapping to text would force a backfill + drop on
--     the existing rows.
--   - PostgreSQL 12+ allows ADD VALUE outside a transaction block when
--     the value is new, and IF NOT EXISTS makes the migration
--     idempotent if re-run.
--
-- No new policies / grants / table — the existing RLS on
-- `notifications` already covers reads + updates for owner-only access.

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'workflow_high_risk_activated';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'workflow_high_risk_run';
