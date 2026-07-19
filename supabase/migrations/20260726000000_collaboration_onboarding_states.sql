-- 5.ONBOARD-4 (Batch 1) — collaboration_onboarding_states: PRESENTATION state for
-- the ROLE-SPECIFIC collaboration onboarding checklist on shared (Team / Business /
-- Enterprise) accounts, keyed per (user, account, TRACK).
--
-- WHY A NEW TABLE RATHER THAN A `track` COLUMN ON user_onboarding_states:
--   1. That table is PK (user_id, account_id) and carries workflow-checklist-only
--      provenance (completion_workflow_id / completion_workflow_name). Widening its
--      PK would leave those columns permanently NULL for every collaboration row and
--      entangle two checklists whose completion means different things.
--   2. The collaboration checklist must keep progress ISOLATED PER ROLE. A user who
--      completes the owner track and is later demoted to member must start the member
--      track fresh WITHOUT corrupting the historical owner completion. A per-track PK
--      is what makes "do not store all role variants under one ambiguous completion
--      record" structurally true instead of a convention.
--
-- TRACKS. `track` is the checklist identity, not the user's current role: rows are
-- immutable history for the track they name. Business/Enterprise deliberately reuse
-- the `team_*` tracks — their collaboration STEPS are identical because no
-- plan-specific collaboration feature exists to differ on. When one ships, add a
-- `business_*` / `enterprise_*` track here and the historical team_* rows stay valid.
--
-- HONESTY CONTRACT (do not weaken): this table stores ONLY presentation state and two
-- server-latched timestamps (first_shown_at, completed_at). Substantive step
-- completion is ALWAYS derived server-side from account_memberships,
-- account_invitations, integrations, workflows, workflow_runs, and the server-recorded
-- onboarding_events learning ledger. NEVER add per-step completion booleans here — a
-- stored "invited ✓" goes stale the moment the underlying state changes, and a stored
-- "visited ✓" would become a client-forgeable completion.
--
-- completed_at is latched by the SERVER only (derivation-time evidence), never from
-- client input, and is immutable once set. A silent historical latch (all setup
-- already done before this checklist existed) also stamps celebrated_at so no
-- celebration is shown for work the user did not just do.
--
-- ROLLBACK (pre-launch, feature flag ENABLE_COLLABORATION_ONBOARDING default OFF):
--   DROP TABLE public.collaboration_onboarding_states;

CREATE TABLE public.collaboration_onboarding_states (
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id   uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  -- Checklist identity. Immutable per row; a role change selects a DIFFERENT row.
  track        text NOT NULL CHECK (track IN ('team_owner', 'team_admin', 'team_member')),
  first_shown_at timestamptz,
  dismissed_at   timestamptz,
  minimized      boolean NOT NULL DEFAULT false,
  -- Server-latched; immutable once set (repository enforces completed_at IS NULL).
  completed_at   timestamptz,
  celebrated_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, account_id, track)
);

CREATE TRIGGER collaboration_onboarding_states_set_updated_at
  BEFORE UPDATE ON public.collaboration_onboarding_states
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS + GRANTs ─────────────────────────────────────────────────────────────
-- Mirrors user_onboarding_states exactly.
-- Reads: a user may SELECT only their OWN rows, and only while they are still a
-- member of that account (membership predicate = defense-in-depth isolation; a
-- removed member loses access even though their rows persist as history).
-- Writes: service-role ONLY — all mutations flow through the collaboration
-- onboarding repository behind authenticated routes, so a client can never forge
-- completed_at or write presentation state for another user, account, or track.

ALTER TABLE public.collaboration_onboarding_states ENABLE ROW LEVEL SECURITY;

-- MANDATORY REVOKE FIRST (see 20260725000000): this project carries
-- `ALTER DEFAULT PRIVILEGES … GRANT ALL ON TABLES TO anon, authenticated,
-- service_role`, so a newly created table in `public` arrives with FULL
-- privileges for anon + authenticated no matter what this migration grants.
-- Granting narrowly does NOT end up narrow — the surplus must be revoked
-- explicitly, or `authenticated` keeps INSERT/UPDATE/DELETE on this table and
-- the service-role-only write contract above is fiction.
REVOKE ALL ON public.collaboration_onboarding_states FROM anon;
REVOKE ALL ON public.collaboration_onboarding_states FROM authenticated;

GRANT SELECT ON public.collaboration_onboarding_states TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.collaboration_onboarding_states TO service_role;

CREATE POLICY collaboration_onboarding_states_select_own_member
  ON public.collaboration_onboarding_states
  FOR SELECT
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.account_memberships m
      WHERE m.account_id = collaboration_onboarding_states.account_id
        AND m.user_id = auth.uid()
    )
  );
