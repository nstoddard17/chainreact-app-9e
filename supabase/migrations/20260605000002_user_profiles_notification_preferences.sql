-- 4.ACCOUNT-SETTINGS-4 — user-level notification preferences.
--
-- Three boolean toggles added ADDITIVELY to user_profiles. They inherit the
-- existing user_profiles RLS (user_profiles_select_own / user_profiles_update_own,
-- both gating on auth.uid() = id) and the set_updated_at trigger — so a user can
-- only ever read/write their OWN preferences. No new table, no policy change, no
-- grant change, no backfill beyond the column DEFAULT.
--
-- Defaults: operational signals ON; news OFF (opt-in).
--   notify_workflow_alerts  → TRUE  (run failures / attention — high value)
--   notify_team_activity    → TRUE  (invites, joins, role changes)
--   notify_product_updates  → FALSE (product news — opt-in, privacy-respecting)
--
-- These are PREFERENCE flags only — this slice adds no email/push/Slack delivery
-- and no per-account rules. Delivery surfaces will consult these later.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS notify_product_updates boolean NOT NULL DEFAULT false;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS notify_workflow_alerts boolean NOT NULL DEFAULT true;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS notify_team_activity boolean NOT NULL DEFAULT true;
