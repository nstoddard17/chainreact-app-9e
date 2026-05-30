-- ChainReactV2 — integrations account_id cutover (Slice 4.ACCOUNT-MODEL-6).
--
-- Phase B per the cutover plan at
-- docs/slices/phase-4/account-id-cutover-plan.md §"Slice 4.ACCOUNT-MODEL-6".
-- Flips integrations from user_id ownership to account_id ownership at
-- the schema + RLS layer. Application-code cutover (repository, OAuth
-- dispatcher, OAuth callback/ingest, refreshAndRetry, action handlers,
-- list pages) lands in the same commit.
--
-- Order in this migration:
--   1. Drop the legacy user_id RLS policies on `integrations`.
--   2. Drop the foundation slice's compat trigger (handlers now supply
--      account_id + connected_by_user_id directly).
--   3. Drop the legacy user-scoped unique index.
--   4. Drop the legacy `integrations.user_id` column.
--
-- Post-migration state:
--   - `integrations.account_id` is the authoritative owner (NOT NULL,
--     FK to accounts(id) ON DELETE RESTRICT — set by the foundation
--     slice).
--   - `integrations.connected_by_user_id` carries provenance (the human
--     who connected the integration; ON DELETE SET NULL).
--   - RLS reads + writes scoped by account membership only.
--   - `integrations.user_id` column does NOT exist.
--
-- Hard scope fences:
--   - No change to `workflows`, `workflow_runs`, `workflow_revisions`,
--     `trigger_resources`, `user_billing`. Those tables retain their
--     user_id-only RLS and their existing schemas. The per-table
--     cutover slices (-7, -8) flip them.
--   - `trigger_resources.account_id` (text, provider account) is NOT
--     touched.

-- ── 1. Drop legacy user_id RLS policies ────────────────────────────────

DROP POLICY IF EXISTS integrations_select_own ON public.integrations;
DROP POLICY IF EXISTS integrations_insert_own ON public.integrations;
DROP POLICY IF EXISTS integrations_update_own ON public.integrations;
DROP POLICY IF EXISTS integrations_delete_own ON public.integrations;

-- The account-membership policies from the foundation slice
-- (integrations_select_account_member, _insert_, _update_, _delete_) remain
-- and now serve as the only RLS predicates on the table. INSERT/UPDATE
-- still happen via service-role through the OAuth dispatcher, but the
-- session-client policies are now in place for future direct-write paths.

-- ── 2. Drop the foundation compat trigger ──────────────────────────────
--
-- The repository's upsertActive now supplies account_id + connected_by_user_id
-- directly. The trigger has become a no-op; dropping it removes the
-- per-INSERT lookup overhead and prevents future writers from accidentally
-- relying on auto-population.

DROP TRIGGER IF EXISTS integrations_compat_set_account ON public.integrations;
DROP FUNCTION IF EXISTS public.integrations_compat_set_account();

-- ── 3. Drop the legacy user-scoped unique index ────────────────────────
--
-- The account-scoped equivalent `integrations_active_unique` (on
-- (account_id, provider, provider_account_id) WHERE disconnected_at IS NULL)
-- was added in the foundation slice and stays in place. The user-scoped
-- version is no longer the source of uniqueness.

DROP INDEX IF EXISTS public.integrations_active_unique;

-- Also drop the now-irrelevant user_id-only secondary index. The
-- integrations_provider_idx (provider WHERE disconnected_at IS NULL) is
-- unchanged.

-- ── 4. Drop integrations.user_id ───────────────────────────────────────
--
-- After this column drop, application code that read or wrote
-- integrations.user_id will fail at compile/query time. Every consumer
-- (repository, OAuth dispatcher, action handlers, list pages, tests) is
-- updated in the same commit. ON DELETE CASCADE behavior for auth.users
-- deletion now falls through to account_memberships.user_id → account
-- (which is ON DELETE RESTRICT — explicit deletion flow required).

ALTER TABLE public.integrations DROP COLUMN user_id;
