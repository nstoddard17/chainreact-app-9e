-- Backfill explicit Data API GRANTs on early tables created before the
-- "explicit GRANT" convention landed (docs/rules/database-security.md).
--
-- After Supabase removes implicit Data API grants on public-schema tables
-- (Oct 30 2026), any table WITHOUT explicit GRANTs returns `42501` to
-- PostgREST / supabase-js / GraphQL. RLS still gates ROWS; these GRANTs only let
-- the role TOUCH the table. This migration changes NO RLS policy.
--
-- Conventions enforced here (and checked by scripts/check-migration-rls.mjs):
--   * `authenticated` is granted ONLY the operations each table's existing RLS
--     policies already allow (a missing op has no policy, so RLS would deny it
--     anyway — granting it would be misleading, not unsafe).
--   * `service_role` gets full DML on every table (server-side, RLS-bypassing).
--   * NO `anon` / public grants.
--   * GRANT is idempotent — re-applying this migration is a no-op.
--
-- These tables were flagged by the V2 replacement-readiness audit
-- (docs/slices/phase-4/v2-replacement-readiness-audit.md §D-1).

-- ── User-data tables: authenticated (RLS-constrained) + service_role ─────────

-- user_profiles — SELECT/UPDATE own. No client INSERT/DELETE policy (signup +
-- account deletion are service-role paths), so authenticated gets neither.
GRANT SELECT, UPDATE ON public.user_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_profiles TO service_role;

-- integrations — full own-row CRUD (RLS: auth.uid() = user_id). Token columns
-- remain application-encrypted regardless of table access.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integrations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integrations TO service_role;

-- workflows — full own / account-member CRUD.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflows TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflows TO service_role;

-- workflow_revisions — SELECT + INSERT only (revisions are immutable; no client
-- UPDATE/DELETE policy).
GRANT SELECT, INSERT ON public.workflow_revisions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_revisions TO service_role;

-- trigger_resources — own-row CRUD (user writes via the SSR client; the
-- dispatcher reads via service_role).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trigger_resources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trigger_resources TO service_role;

-- (user_billing intentionally omitted — the early per-user billing table was
--  superseded by account_billing and DROPPED in 20260531000004; it no longer
--  exists. account_billing already carries its own GRANTs.)

-- notifications — SELECT + UPDATE own (mark-as-read); inserts are service-role.
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO service_role;

-- workflow_files — SELECT own only (uploads/writes go through service-role routes).
GRANT SELECT ON public.workflow_files TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_files TO service_role;

-- workflow_runs — SELECT own / account-member (the runs list); the execution
-- engine writes run rows via service_role. (A later ALTER migration carries a
-- `system-table:` marker for the RLS lint, but the table IS user-readable, so it
-- needs an authenticated SELECT grant.)
GRANT SELECT ON public.workflow_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_runs TO service_role;

-- ── Service-role-only tables: NO authenticated grant ─────────────────────────
-- (RLS policies are `USING (false)` / no client access; access is server-side
--  only. Explicit service_role grants future-proof them against the cutover.)

-- oauth_states — ephemeral OAuth state nonces; service-role only.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oauth_states TO service_role;

-- webhook_event_dedup — internal idempotency store; no end-user access.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhook_event_dedup TO service_role;

-- hubspot_app_subscriptions — internal HubSpot subscription tracking; service-role only.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hubspot_app_subscriptions TO service_role;

-- hubspot_subscription_refs — internal HubSpot subscription tracking; service-role only.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hubspot_subscription_refs TO service_role;
