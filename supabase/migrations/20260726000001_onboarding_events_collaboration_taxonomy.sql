-- 5.ONBOARD-4 (Batch 1) — widen the onboarding_events taxonomy to carry the
-- COLLABORATION checklist funnel plus the member LEARNING-EVIDENCE ledger.
--
-- WHY THE LEARNING EVENTS LIVE HERE. Three member steps ("explore your team
-- workspace", "open a shared workflow", "explore shared apps / team members") are
-- genuinely about VISITING or OPENING a feature. There is no other durable server
-- fact that proves a visit happened — nothing in workflows/integrations/runs changes
-- when a member merely reads a page. So the visit itself has to be recorded, and this
-- ledger is the existing, service-role-only, content-free place to record it.
--
-- UNFORGEABLE BY CONSTRUCTION. These rows are written ONLY by server code that has
-- already authorized the read it is recording (the workflow page's own server
-- component after its authz check, the /team and /apps page loads, and the
-- active-account switch service). They are NOT postable from
-- /api/onboarding/events — that route keeps its own narrow client schema
-- (cta_clicked | video_opened) and never widens to these. A member therefore cannot
-- curl a learning step to green; the event exists only because the server served
-- them the authorized resource.
--
-- The fourth member step ("use a team workflow") deliberately takes NO event: a real
-- workflow_runs row with account_id = the shared account, triggered_by_user_id = the
-- member, and status = 'succeeded' is stronger evidence than any recorded visit.
--
-- CONTENT-FREE CONTRACT UNCHANGED: still ids/keys/booleans/integers only. No emails,
-- no member identities, no invitation addresses, no provider account labels, no
-- billing values. The metadata allow-list in services/onboarding/onboardingEvents.ts
-- remains the enforcement point.
--
-- ROLLBACK: restore the two prior CHECK constraints from 20260724000000.

-- ── event_type: add the collaboration funnel + learning evidence ─────────────
ALTER TABLE public.onboarding_events
  DROP CONSTRAINT onboarding_events_event_type_check;

ALTER TABLE public.onboarding_events
  ADD CONSTRAINT onboarding_events_event_type_check CHECK (event_type IN (
    -- ── existing first-workflow checklist funnel (unchanged) ──
    'onboarding_shown',
    'onboarding_step_completed',
    'onboarding_cta_clicked',
    'onboarding_dismissed',
    'onboarding_reopened',
    'onboarding_minimized',
    'onboarding_workflow_switched',
    'onboarding_video_opened',
    'onboarding_video_watched',
    'onboarding_completed',
    -- ── collaboration checklist funnel (mirrors the above, per track) ──
    'collab_onboarding_shown',
    'collab_onboarding_cta_clicked',
    'collab_onboarding_dismissed',
    'collab_onboarding_reopened',
    'collab_onboarding_minimized',
    'collab_onboarding_completed',
    -- ── member LEARNING EVIDENCE — server-recorded at authorized seams only ──
    -- Written by the active-account switch service when a user switches INTO a
    -- shared account they are a member of.
    'collab_workspace_explored',
    -- Written by the workflow detail server component after its authz check, when
    -- the opened workflow belongs to a shared account.
    'collab_shared_workflow_opened',
    -- Written by the /apps and /team page loads respectively.
    'collab_apps_viewed',
    'collab_team_viewed'
  ));

-- ── step_key: add the collaboration step keys ────────────────────────────────
-- The collaboration tracks use their own step vocabulary; the five first-workflow
-- keys stay valid so existing rows and the workflow checklist are unaffected.
ALTER TABLE public.onboarding_events
  DROP CONSTRAINT onboarding_events_step_key_check;

ALTER TABLE public.onboarding_events
  ADD CONSTRAINT onboarding_events_step_key_check CHECK (step_key IN (
    -- first-workflow checklist
    'create', 'connect', 'configure', 'test', 'activate',
    -- collaboration: owner + admin
    'invite_teammate',
    'teammate_joined',
    'connect_shared_app',
    'create_shared_workflow',
    'review_team',
    -- collaboration: member
    'explore_workspace',
    'open_shared_workflow',
    'use_shared_workflow',
    'explore_directory'
  ));
