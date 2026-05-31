-- ChainReactV2 — make backfill_account_billing scopeable (Slice 4.ACCOUNT-MODEL-9b).
--
-- The foundation migration (20260531000001) shipped backfill_account_billing()
-- as a no-arg function that backfills EVERY personal account, and ran it once.
-- That global form is test-hostile: an opt-in DB test that calls it to verify
-- backfill correctness/idempotency also materializes account_billing rows for
-- every OTHER concurrent test's throwaway accounts, and account_billing's
-- ON DELETE RESTRICT FK then blocks those tests' account/user teardown.
--
-- Replace it with a SCOPEABLE version: backfill_account_billing(p_account_id
-- uuid DEFAULT NULL) — NULL backfills all personal accounts (the migration /
-- ops use), a specific id backfills just that account (test use, no
-- cross-test contamination). Forward-only refinement; no live caller depends on
-- the backfill (it is a one-time/ops helper). The foundation's global backfill
-- already ran in -001, so no re-run is needed here.
--
-- ROLLBACK: DROP the (uuid) overload and re-create the no-arg version from -001.

-- Drop the no-arg version so a no-arg call is unambiguous (the new function's
-- DEFAULT NULL covers the no-arg call site).
DROP FUNCTION IF EXISTS public.backfill_account_billing();

CREATE OR REPLACE FUNCTION public.backfill_account_billing(
  p_account_id uuid DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted int;
BEGIN
  INSERT INTO public.account_billing
    (account_id, tasks_limit, tasks_used, tasks_reserved, period_started_at)
  SELECT a.id, ub.tasks_limit, ub.tasks_used, ub.tasks_reserved, ub.period_started_at
    FROM public.accounts a
    JOIN public.user_billing ub ON ub.user_id = a.owner_user_id
   WHERE a.type = 'personal'
     AND (p_account_id IS NULL OR a.id = p_account_id)
  ON CONFLICT (account_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_account_billing(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_account_billing(uuid) TO service_role;
