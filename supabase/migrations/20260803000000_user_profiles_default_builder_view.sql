-- BUILDER-VIEW-DEFAULT-1 — per-user default builder view.
--
-- Additive, idempotent column on user_profiles: the user's chosen default
-- workspace view for the workflow builder. NULL means "no default chosen yet"
-- — the builder asks on a newly created workflow until the user opts into a
-- default (or sets one in Settings). Values match the client BuilderViewMode
-- union ('visual' | 'document'), CHECK-constrained so a bad write can never
-- persist an unknown view.
--
-- Inherits the existing row-scoped RLS (user_profiles_select_own /
-- user_profiles_update_own gate on auth.uid() = id — policies cover the whole
-- row, so new columns are automatically protected) and the set_updated_at
-- trigger. No new table, policy, grant, or backfill. Same shape as
-- 20260531000009 (active_account_id) and 20260605000002 (notify_* columns).
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS default_builder_view text
  CHECK (default_builder_view IN ('visual', 'document'));
