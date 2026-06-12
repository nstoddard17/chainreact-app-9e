-- ChainReactV2 — explicit private-connection sharing scope on integrations
-- (Slice 4.CONN-SHARE / CS-1).
--
-- Additive, null-safe SCHEMA ONLY. BEHAVIOR-INERT: NO runtime path reads this
-- column yet — the run/edit gate, execution resolver, Apps DTO/UI, Disconnect,
-- Reconnect, and workflow_node_credentials are all untouched. Wiring lands in
-- later slices (CS-2+) behind the ENABLE_CONNECTION_SHARING dev guard.
--
-- Model (locked — see docs/slices/phase-4/explicit-private-connection-sharing-plan.md §0):
--   - Sharing controls USAGE, not ownership. `account_id` still owns the row;
--     `connected_by_user_id` stays provenance.
--   - `integration_sharing_scope` is meaningful ONLY for PERSONAL-credential
--     providers. Account/service providers (slack/notion/stripe/…) are shared by
--     classification and IGNORE this column.
--   - NULL = derive the default from classification (personal → private_to_connector).
--     No backfill: existing rows stay NULL and read as private_to_connector.
--
-- Changes:
--   1. Add nullable `integration_sharing_scope text`.
--   2. Add CHECK: NULL allowed (the unset / derive-default state), else exactly
--      one of the two known values.
--
-- No RLS change — `integrations` already enforces account-membership RLS and the
-- additive column inherits it; it adds no new row visibility. No new GRANT —
-- `integrations` is an existing (grandfathered) table.
--
-- ROLLBACK:
--   ALTER TABLE public.integrations DROP CONSTRAINT integrations_sharing_scope_chk;
--   ALTER TABLE public.integrations DROP COLUMN integration_sharing_scope;

ALTER TABLE public.integrations
  ADD COLUMN integration_sharing_scope text;

ALTER TABLE public.integrations
  ADD CONSTRAINT integrations_sharing_scope_chk
  CHECK (
    integration_sharing_scope IS NULL
    OR integration_sharing_scope IN ('private_to_connector', 'shared_with_account')
  );
