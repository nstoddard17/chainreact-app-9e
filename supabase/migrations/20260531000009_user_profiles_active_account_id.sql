-- ChainReactV2 — user_profiles.active_account_id (Slice 4.ACCOUNT-MODEL-11a).
--
-- Adds the durable, server-side "active account" pointer planned in
-- docs/slices/phase-4/account-switcher-plan.md. This slice is MIGRATION ONLY:
-- no resolver, no route change, no setActiveAccount, no switcher UI. The column
-- is UNUSED by application code until 4.ACCOUNT-MODEL-11b reads it.
--
-- Semantics:
--   - NULL = "no explicit active account chosen" → the resolver (11b) falls back
--     to the user's personal account. NULL is the correct default for every
--     existing user, so NO backfill is performed.
--   - FK REFERENCES accounts(id) ON DELETE SET NULL: when the referenced account
--     is purged/deleted, the pointer self-heals to NULL (→ personal fallback)
--     instead of dangling. Matches the plan's Q7 decision; complements the
--     account-deletion purge flow (10c) which deletes the accounts row.
--
-- RLS: user_profiles already carries row-level self-access policies
-- (user_profiles_select_own / user_profiles_update_own gate on `auth.uid() = id`,
-- NOT on any specific column), so the new column is automatically covered for
-- reads and self-writes. No policy change is needed or made here — setting the
-- active account is a self-scoped UPDATE on the user's own profile row; the
-- target account's membership is verified in the service layer (11b/11d), not by
-- this column's RLS.
--
-- No new table → the CREATE TABLE migration-RLS lint does not apply. Additive +
-- idempotent. Touches ONLY user_profiles (no hot tables, no FK loosening, no
-- team/org schema).

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS active_account_id uuid
    REFERENCES public.accounts(id) ON DELETE SET NULL;
