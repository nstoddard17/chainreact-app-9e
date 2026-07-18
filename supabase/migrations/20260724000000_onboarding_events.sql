-- 5.ONBOARD-1 (Batch 4) — onboarding_events: fail-open, content-free analytics
-- ledger for the first-workflow onboarding checklist funnel.
--
-- PATTERN: same posture as ai_cost_events / task_usage_events — service-role
-- recorded, typed event taxonomy, ids/keys/integers only. NEVER stores workflow
-- definitions, node config, provider payloads, tokens, scopes, emails, message
-- bodies, file contents, or user-entered prompts. Recording is best-effort at
-- every call site (an insert failure never interrupts onboarding, activation,
-- navigation, or video playback).
--
-- No client read path in v1 — funnel questions are answered by owner SQL over
-- this table joined with server-truth tables (workflows / integrations /
-- workflow_runs / user_onboarding_states). See the slice outcomes doc.
--
-- ROLLBACK (pre-launch, flag default OFF): DROP TABLE public.onboarding_events;

CREATE TABLE public.onboarding_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  account_id  uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  event_type  text NOT NULL CHECK (event_type IN (
    'onboarding_shown',
    'onboarding_step_completed',
    'onboarding_cta_clicked',
    'onboarding_dismissed',
    'onboarding_reopened',
    'onboarding_minimized',
    'onboarding_workflow_switched',
    'onboarding_video_opened',
    'onboarding_video_watched',
    'onboarding_completed'
  )),
  step_key    text CHECK (step_key IN ('create','connect','configure','test','activate')),
  workflow_id uuid,
  -- Provider KEY only (e.g. 'slack') — never a provider account id/label.
  provider    text,
  -- Sanitized, allow-listed extras (account_type, user_role, creation_path,
  -- integer minutes_to_complete, silent boolean). Enforced by the recorder.
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX onboarding_events_account_created_idx
  ON public.onboarding_events (account_id, created_at);
CREATE INDEX onboarding_events_type_created_idx
  ON public.onboarding_events (event_type, created_at);

-- ── RLS + GRANTs ─────────────────────────────────────────────────────────────
-- Service-role only, in BOTH directions: no authenticated grant at all (writes
-- go through the server recorder behind authenticated routes; reads are owner
-- SQL / future internal reporting). RLS enabled with a deny-shaped policy* so
-- the table is never accidentally exposed by a future grant.
-- (*Postgres has no explicit DENY; a `false` USING predicate documents intent
-- and satisfies the same-file policy rule while granting nothing.)

ALTER TABLE public.onboarding_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.onboarding_events TO service_role;

CREATE POLICY onboarding_events_no_client_access
  ON public.onboarding_events
  FOR SELECT
  USING (false);
