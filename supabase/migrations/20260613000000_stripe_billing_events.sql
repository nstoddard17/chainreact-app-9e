-- ChainReactV2 — platform billing Stripe webhook dedup ledger
-- (Slice 4.BILLING-PLAN-METADATA-5 / CS-4).
--
-- Durable, cross-instance dedup for the platform billing webhook
-- (POST /api/webhooks/stripe-billing). Stripe delivers each event at-least-once and
-- retries for ~3 days on non-2xx; this table makes processing idempotent by the
-- natural Stripe event id. Separate from the WORKFLOW Stripe provider's per-trigger
-- dedup (trigger_resources / workflow_runs) — this is platform billing only.
--
-- public.stripe_billing_events is a SERVICE-ROLE-ONLY system table: written only by the
-- webhook handler (service-role) after a VERIFIED signature. It is not user-facing and
-- holds only safe identifiers — the Stripe event id, the event type, and (when present
-- in the verified event metadata) the resolved account id. NO card data, customer email,
-- amounts, secrets, or raw event payload is stored here.
--
--   - event_id     : Stripe event id (evt_...) — PRIMARY KEY = the dedup key.
--   - event_type   : e.g. customer.subscription.updated (safe, for observability).
--   - account_id   : resolved from trusted event metadata when available; nullable.
--                    Denormalized/informational — intentionally NO foreign key so an
--                    event naming an unknown/stale account still records (and is ignored
--                    by the handler) rather than failing the idempotency insert.
--   - processed_at : when the handler finished processing the event.
--
-- ROLLBACK (pre-launch, no prod data):
--   DROP TABLE public.stripe_billing_events;

-- system-table: stripe_billing_events — service-role-only webhook dedup ledger; no end-user access.

CREATE TABLE public.stripe_billing_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  account_id uuid,
  processed_at timestamptz NOT NULL DEFAULT now()
);

-- System-only table; no user-facing access. RLS enabled defense-in-depth with a
-- deny-all policy so any Data API query is empty even with a stolen anon/authenticated
-- key; the service role bypasses RLS for the webhook handler. authenticated/anon are
-- granted NOTHING.
ALTER TABLE public.stripe_billing_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stripe_billing_events TO service_role;

CREATE POLICY stripe_billing_events_no_client_access ON public.stripe_billing_events
  FOR ALL USING (false) WITH CHECK (false);
