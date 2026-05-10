-- ChainReactV2 — hubspot_subscription_refs table.
--
-- system-table: hubspot_subscription_refs — internal HubSpot subscription
--   reference table; no end-user access. Service-role is the only
--   writer.
--
-- Slice 13 Commit 2 — Option A (shared subscriptions with portal-scoped
-- reference counting).
--
-- Each row represents one V2 workflow's interest in one HubSpot
-- app-level subscription. The lifecycle service inserts a row on
-- activate, removes it on deactivate, and only deletes the parent
-- `hubspot_app_subscriptions` row + calls HubSpot's DELETE endpoint
-- when the row count for that app_subscription_id drops to zero.
--
-- The receive-route uses this table to route incoming events:
--   1. Verify the V3 signature (Slice 13 Commit 5 helper).
--   2. For each event in the payload array, look up the
--      `hubspot_app_subscriptions` row by (app_id, event_type,
--      property_name).
--   3. Find this table's rows by `app_subscription_id` AND
--      `hub_id = event.portalId` to get the workflows that should fire.
--   4. Dispatch each match.
--
-- Why a denormalized `hub_id` column on each ref row:
--   The receive-route's hot path is "given a portal id, find the
--   workflows for this user that asked for this event type." Joining
--   through `integrations` on every webhook delivery would cost an
--   extra query per event. Storing `hub_id` directly on the ref
--   (populated at activate time from the user's integration row's
--   providerAccountId) keeps the lookup to a single indexed query.
--
-- RLS: deny-all client access; service-role bypasses by design. Mirrors
-- webhook_event_dedup's pattern.

CREATE TABLE public.hubspot_subscription_refs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The shared HubSpot app-level subscription this row references.
  -- ON DELETE CASCADE: the lifecycle service deletes the parent row
  -- when the last ref is removed; if for any reason the parent is
  -- removed first, all refs are cleaned up too.
  app_subscription_id uuid NOT NULL
    REFERENCES public.hubspot_app_subscriptions(id) ON DELETE CASCADE,

  -- The V2 workflow this ref belongs to.
  workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,

  -- The user who owns the workflow. Denormalized from workflows.user_id
  -- so receive-route routing doesn't need to join. ON DELETE CASCADE
  -- keeps the table clean on user deletion.
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- The trigger node id in the workflow definition. A workflow's
  -- single `webhook_received` trigger may subscribe to multiple event
  -- types (multi-select in trigger config) — each maps to its own ref
  -- row pointing at a different app_subscription_id.
  node_id text NOT NULL,

  -- The user's HubSpot portal id (= integrations.providerAccountId for
  -- the user's HubSpot integration row). Denormalized for fast
  -- portal->workflow routing in the receive-route. String form (V1's
  -- portal ids are numeric, but the OAuth callback string-casts them
  -- before storage to keep the column type stable).
  hub_id text NOT NULL,

  -- Trigger config snapshot — currently just an empty object placeholder
  -- since per-event-type filters (e.g. property_name) live on the
  -- parent app_subscription. Kept jsonb for future flexibility (e.g.
  -- per-ref additional filters that don't warrant a new app-level
  -- subscription).
  config jsonb NOT NULL DEFAULT '{}'::jsonb,

  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Prevent duplicate refs for the same (subscription, workflow node)
-- triple. Re-running activate for the same workflow node is idempotent
-- (`ON CONFLICT DO NOTHING`).
CREATE UNIQUE INDEX hubspot_subscription_refs_unique
  ON public.hubspot_subscription_refs (app_subscription_id, workflow_id, node_id);

-- Receive-route hot-path index: portal -> active refs for a given
-- subscription.
CREATE INDEX hubspot_subscription_refs_dispatch_idx
  ON public.hubspot_subscription_refs (app_subscription_id, hub_id, status);

-- Deactivation hot-path index: find all refs for a workflow.
CREATE INDEX hubspot_subscription_refs_workflow_idx
  ON public.hubspot_subscription_refs (workflow_id);

-- Refcount hot-path index: count remaining refs for a subscription.
CREATE INDEX hubspot_subscription_refs_app_sub_idx
  ON public.hubspot_subscription_refs (app_subscription_id);

ALTER TABLE public.hubspot_subscription_refs ENABLE ROW LEVEL SECURITY;

CREATE POLICY hubspot_subscription_refs_no_client_access
  ON public.hubspot_subscription_refs
  FOR ALL USING (false) WITH CHECK (false);

CREATE TRIGGER hubspot_subscription_refs_set_updated_at
  BEFORE UPDATE ON public.hubspot_subscription_refs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
