-- ChainReactV2 — harden Data API privileges on workflow_live_test_sessions
-- (WORKFLOW-LIVE-TEST-2 §5).
--
-- WHY THIS EXISTS (found by post-apply schema verification, not by review — the same way the
-- 20260725000000 revoke series was found): this Supabase project carries
-- `ALTER DEFAULT PRIVILEGES … GRANT ALL ON TABLES TO anon, authenticated, service_role`
-- (pg_default_acl). Every new table in `public` is therefore created with FULL privileges for
-- `anon` and `authenticated` — SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER —
-- regardless of the creating migration's own narrow GRANT. Verified immediately after applying
-- 20260811000000: both roles held ALL on the new table.
--
-- NOT A POLICY CHANGE — this restores the documented intent of 20260811000000: "service_role
-- (which bypasses RLS) is the only accessor". The deny-all RLS policy already made the table
-- unreadable and unwritable through the Data API, so this is defense-in-depth: it removes the
-- surplus privilege so the table is closed at BOTH layers rather than resting on the policy alone.
-- That matters here because a live-test session IS an execution authorization — a row that could
-- authorize one real, side-effecting run of an otherwise inactive workflow.
--
-- ROLLBACK: re-GRANT the specific privileges; no data is touched.

REVOKE ALL ON public.workflow_live_test_sessions FROM anon;
REVOKE ALL ON public.workflow_live_test_sessions FROM authenticated;

-- Service role keeps the full set it was granted explicitly (it bypasses RLS and is the only
-- accessor); restated here so the intended end state is readable in one place.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.workflow_live_test_sessions TO service_role;
