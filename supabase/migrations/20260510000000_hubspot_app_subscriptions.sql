-- ChainReactV2 — hubspot_app_subscriptions table.
--
-- system-table: hubspot_app_subscriptions — internal HubSpot subscription
--   registry; no end-user access. Service-role is the only writer.
--
-- Slice 13 Commit 2 — Option A (shared subscriptions with portal-scoped
-- reference counting).
--
-- HubSpot's webhook subscriptions are app-level: every Public App has a
-- single global webhook target URL (configured in the developer-portal
-- app-settings UI), and `POST /webhooks/v3/{appId}/subscriptions` is
-- keyed UNIQUE on (appId, eventType, propertyName). A second create with
-- the same key returns `409 SubscriptionAlreadyExistsException`.
--
-- This table is the V2 mirror of HubSpot's app-level subscription list.
-- One row per (app_id, event_type, property_name) tuple. The
-- `hubspot_subscription_id` column stores the id returned by HubSpot at
-- create time so the deactivate path can `DELETE
-- /webhooks/v3/{appId}/subscriptions/{id}` when the last workflow ref
-- goes away.
--
-- The `hubspot_subscription_refs` table (separate migration) joins this
-- table to the V2 workflows that depend on each subscription. Reference
-- counting lives in the application-layer repositories, not in a SQL
-- trigger — the lifecycle service is the only writer to these tables and
-- it owns the create-on-first-ref / delete-on-last-ref logic.
--
-- RLS: deny-all client access; service-role bypasses by design. Mirrors
-- webhook_event_dedup's pattern. The table holds no user-identifying
-- data (no user_id, no email, no portal id) — it represents the shared
-- HubSpot-app-side state, not per-user data.

CREATE TABLE public.hubspot_app_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- HubSpot's numeric app id, stored as text (matches V1's
  -- HUBSPOT_APP_ID env var shape and the URL path segment in
  -- /webhooks/v3/{appId}/subscriptions).
  app_id text NOT NULL,

  -- HubSpot subscription type / event type, e.g. 'contact.creation',
  -- 'contact.propertyChange', 'deal.deletion'. Slice 13 Batch 1 supports
  -- 10 distinct values (see integrations/hubspot/triggers/...).
  event_type text NOT NULL,

  -- Only populated for `*.propertyChange` event types — narrows the
  -- subscription to a single property's mutations. NULL for creation
  -- and deletion events. The unique index below uses COALESCE so two
  -- rows with the same (app_id, event_type) and NULL property_name
  -- collapse to the same key (PostgreSQL would otherwise treat NULLs
  -- as distinct in a multi-column unique index).
  property_name text,

  -- The id HubSpot returned from POST /webhooks/v3/{appId}/subscriptions.
  -- Used for the eventual DELETE call when the last ref is removed.
  hubspot_subscription_id text NOT NULL,

  -- 'active' (subscription exists in HubSpot) or 'inactive' (deletion
  -- attempted but HubSpot delete failed; left as a tombstone for the
  -- reconciler). Slice 13 only writes 'active'; 'inactive' is reserved
  -- for the future reconciler cron.
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique key on (app_id, event_type, property_name). COALESCE collapses
-- NULL property_name into a sentinel so creation/deletion events (which
-- carry no propertyName) deduplicate correctly. Without COALESCE, every
-- (app_id, 'contact.creation', NULL) row would be treated as distinct.
CREATE UNIQUE INDEX hubspot_app_subscriptions_unique
  ON public.hubspot_app_subscriptions (app_id, event_type, COALESCE(property_name, ''));

-- Lookup index for the activate/deactivate fast path: find the row by
-- (app_id, event_type, property_name) without scanning.
CREATE INDEX hubspot_app_subscriptions_event_idx
  ON public.hubspot_app_subscriptions (app_id, event_type);

ALTER TABLE public.hubspot_app_subscriptions ENABLE ROW LEVEL SECURITY;

-- Deny-all client access; service-role bypasses by design. Same shape as
-- webhook_event_dedup. The table holds no user-identifying data — it's
-- the shared-with-HubSpot subscription registry.
CREATE POLICY hubspot_app_subscriptions_no_client_access
  ON public.hubspot_app_subscriptions
  FOR ALL USING (false) WITH CHECK (false);

CREATE TRIGGER hubspot_app_subscriptions_set_updated_at
  BEFORE UPDATE ON public.hubspot_app_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
