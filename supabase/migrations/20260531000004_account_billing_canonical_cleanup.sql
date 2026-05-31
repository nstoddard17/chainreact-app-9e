-- ChainReactV2 — account billing canonical cleanup (Slice 4.ACCOUNT-MODEL-9c2).
--
-- 9c moved LIVE billing onto account_billing + the account-keyed `_v2` RPCs,
-- retaining the user-scoped path (user_billing + user-keyed RPCs) only as a
-- deprecated parity reference. This slice removes that dead path so there is ONE
-- canonical billing path: account_billing.
--
-- Steps (single transaction):
--   1. handle_new_user stops seeding user_billing (account_billing only).
--   2. Drop the user-keyed billing RPCs (no production caller after 9c).
--   3. Promote the account-keyed `_v2` RPCs to the canonical names via
--      ALTER FUNCTION RENAME (preserves the body + service_role grants; not a
--      CREATE OR REPLACE, so the 9a/9b migration-guard "last definer" checks
--      stay valid). The user-keyed names are dropped first, freeing the names.
--   4. Drop backfill_account_billing() — a one-time/ops helper that JOINs
--      user_billing; the backfill already ran (9b) and new signups now get
--      account_billing from handle_new_user.
--   5. Drop the user_billing table.
--
-- Live behavior is UNCHANGED: the canonical RPCs ARE the former `_v2` bodies
-- (same atomic row-lock check-and-write, exhaustion boundary, concurrency
-- protection, reserve/reconcile/refund semantics — proven in 9b/9c). Only the
-- function NAMES change and the dead user-scoped objects are removed.
--
-- OUT OF SCOPE: the ledgers (task_usage_events / ai_cost_events /
-- billing_shadow_comparisons) remain user_id-keyed — rescoped in 9d.
--
-- ROLLBACK (pre-launch): rename the canonical RPCs back to `_v2`, re-create the
-- user-keyed RPCs + backfill helper + user_billing table from
-- 20260507000002 / 20260525000002 / 20260531000001, and re-add the user_billing
-- insert to handle_new_user. (No data migration needed — user_billing carried no
-- authoritative state after 9c; account_billing is the source of truth.)

-- ── 1. handle_new_user — account_billing only (stop seeding user_billing) ─────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id uuid;
BEGIN
  INSERT INTO public.user_profiles (id) VALUES (NEW.id);

  INSERT INTO public.accounts (type, name, owner_user_id)
    VALUES ('personal', 'Personal', NEW.id)
    RETURNING id INTO v_account_id;

  INSERT INTO public.account_memberships (account_id, user_id, role)
    VALUES (v_account_id, NEW.id, 'owner');

  -- The canonical billing root (defaults: 100 tasks). user_billing is gone.
  INSERT INTO public.account_billing (account_id) VALUES (v_account_id);

  RETURN NEW;
END;
$$;

-- ── 2. Drop the dead user-keyed billing RPCs ──────────────────────────────────

DROP FUNCTION IF EXISTS public.deduct_tasks_if_available(uuid, int);
DROP FUNCTION IF EXISTS public.reserve_tasks_if_available(uuid, int, uuid, timestamptz);
DROP FUNCTION IF EXISTS public.reconcile_task_reservation(uuid, uuid, int);
DROP FUNCTION IF EXISTS public.release_task_reservation(uuid, uuid);
DROP FUNCTION IF EXISTS public.release_expired_reservations(timestamptz);

-- ── 3. Promote the account-keyed `_v2` RPCs to the canonical names ────────────
--
-- RENAME (not CREATE OR REPLACE) keeps the existing bodies + grants; the
-- user-keyed names were just dropped, so the targets are free.

ALTER FUNCTION public.deduct_tasks_if_available_v2(uuid, int)
  RENAME TO deduct_tasks_if_available;
ALTER FUNCTION public.reserve_tasks_if_available_v2(uuid, int, uuid, timestamptz)
  RENAME TO reserve_tasks_if_available;
ALTER FUNCTION public.reconcile_task_reservation_v2(uuid, uuid, int)
  RENAME TO reconcile_task_reservation;
ALTER FUNCTION public.release_task_reservation_v2(uuid, uuid)
  RENAME TO release_task_reservation;
ALTER FUNCTION public.release_expired_reservations_v2(timestamptz)
  RENAME TO release_expired_reservations;

-- ── 4. Drop the obsolete backfill helper (JOINs user_billing) ─────────────────

DROP FUNCTION IF EXISTS public.backfill_account_billing(uuid);

-- ── 5. Drop the user_billing table ────────────────────────────────────────────
--
-- No production or test caller references it after this slice. account_billing
-- is the sole billing root.

DROP TABLE IF EXISTS public.user_billing;
