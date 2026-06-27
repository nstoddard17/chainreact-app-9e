-- ChainReactV2 — ops alert events (Phase 8b launch alerts, slice C).
--
-- The durable internal/owner alert ledger AND the dedupe/cooldown state machine.
-- One OPEN row per active alert condition (dedupe_key). The cron evaluator:
--   - fires a new OPEN row + delivers when a condition first breaches;
--   - bumps occurrence_count / last_seen_at while it keeps breaching;
--   - re-delivers only after the cooldown window (or on severity escalation);
--   - marks status='resolved' when the condition clears.
-- This is what prevents alert spam (one delivery per cooldown per key).
--
-- NO-LEAK INVARIANT: `context` carries SAFE fields only — counts, thresholds,
-- provider keys, cron names, workflow/run/account ids. NEVER tokens, webhook
-- bodies, raw provider/Stripe payloads, email/message contents, signed URLs,
-- scopes, stack traces, or provider error message strings. The evaluator builds
-- context from an allow-list (core/observability rules) and a no-leak test guards it.
--
-- system-table: ops_alert_events — service-role-only ops alert ledger; no end-user
--   access. Written + read by the ops-alert evaluator (service-role). RLS is
--   defense-in-depth. (A future read-only internal ops view is a later slice.)
--
-- ROLLBACK (pre-launch, no prod data): DROP TABLE public.ops_alert_events;

CREATE TABLE public.ops_alert_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  category text NOT NULL CONSTRAINT ops_alert_events_category_known CHECK (
    category IN (
      'stuck_runs',
      'queue_backlog',
      'provider_failure_rate',
      'oauth_refresh_failures',
      'billing_webhook_failures',
      'cron_failures'
    )
  ),

  severity text NOT NULL CONSTRAINT ops_alert_events_severity_known CHECK (
    severity IN ('warning', 'critical')
  ),

  -- Stable per-condition key: category + scope, e.g. 'provider_failure_rate:slack'.
  dedupe_key text NOT NULL,

  status text NOT NULL DEFAULT 'open' CONSTRAINT ops_alert_events_status_known CHECK (
    status IN ('open', 'resolved')
  ),

  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  occurrence_count integer NOT NULL DEFAULT 1,
  window_label text NOT NULL,

  -- Safe, allow-listed context only (see no-leak invariant above).
  context jsonb NOT NULL DEFAULT '{}'::jsonb,

  last_delivered_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- At most ONE open alert per dedupe_key — the single-winner claim for fire/dedupe.
CREATE UNIQUE INDEX ops_alert_events_open_key_idx
  ON public.ops_alert_events (dedupe_key)
  WHERE status = 'open';

-- Newest-first scans (retention cleanup + a future ops view).
CREATE INDEX ops_alert_events_status_created_idx
  ON public.ops_alert_events (status, created_at DESC);

-- System-only table; no user-facing access. RLS enabled defense-in-depth with a
-- deny-all policy; the service role bypasses RLS for the evaluator.
ALTER TABLE public.ops_alert_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ops_alert_events TO service_role;

CREATE POLICY ops_alert_events_no_client_access ON public.ops_alert_events
  FOR ALL USING (false) WITH CHECK (false);
