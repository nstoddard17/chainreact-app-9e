-- ChainReactV2 — ops signal events (Phase 8b launch alerts, slice C).
--
-- Append-only, safe signal log for operational signals that have NO existing
-- durable home, so the cron-driven ops-alert evaluator can read them:
--   - kind='cron_run'                : one row per cron tick (source = cron name,
--     outcome ok|failed). Enables explicit-failure AND missing-run detection
--     (MAX(created_at) per source vs the cron's expected cadence).
--   - kind='billing_webhook_failure' : one row per Stripe billing webhook
--     processing failure (source='stripe_billing', detail_code = the safe reason
--     e.g. invalid_signature | bad_request | processing_error | not_configured).
--
-- NO-LEAK INVARIANT: identifiers + coarse outcomes ONLY. NEVER tokens, webhook
-- bodies, raw provider/Stripe payloads, error message strings, stack traces,
-- emails, or row content. The recorder services pass only the bounded fields below.
--
-- system-table: ops_signal_events — service-role-only ops signal log; no end-user
--   access. Written by cron routes + the billing webhook handler (service-role),
--   read by the ops-alert evaluator (service-role). RLS is defense-in-depth.
--
-- ROLLBACK (pre-launch, no prod data): DROP TABLE public.ops_signal_events;

CREATE TABLE public.ops_signal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Signal family. CHECK keeps the set stable + greppable.
  kind text NOT NULL CONSTRAINT ops_signal_events_kind_known CHECK (
    kind IN ('cron_run', 'billing_webhook_failure')
  ),

  -- Emitter: a cron name (e.g. 'poll-triggers') or 'stripe_billing'. Safe label.
  source text NOT NULL,

  -- Coarse outcome.
  outcome text NOT NULL CONSTRAINT ops_signal_events_outcome_known CHECK (
    outcome IN ('ok', 'failed')
  ),

  -- Short, non-secret machine reason (e.g. 'invalid_signature', 'fatal').
  -- NEVER a raw provider error, stack trace, token, or row content.
  detail_code text,

  created_at timestamptz NOT NULL DEFAULT now()
);

-- Latest-per-source scan (cron last-run / last-success).
CREATE INDEX ops_signal_events_source_idx
  ON public.ops_signal_events (source, created_at DESC);

-- Windowed scans by family (billing-failure counts in a time window).
CREATE INDEX ops_signal_events_kind_created_idx
  ON public.ops_signal_events (kind, created_at);

-- System-only table; no user-facing access. RLS enabled defense-in-depth with a
-- deny-all policy so any Data API query is empty even with a stolen anon/
-- authenticated key; the service role bypasses RLS for the recorders/evaluator.
ALTER TABLE public.ops_signal_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ops_signal_events TO service_role;

CREATE POLICY ops_signal_events_no_client_access ON public.ops_signal_events
  FOR ALL USING (false) WITH CHECK (false);
