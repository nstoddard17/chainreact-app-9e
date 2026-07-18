-- 5.ONBOARD-1 (Batch 1) — user_onboarding_states: PRESENTATION state for the
-- first-workflow onboarding checklist, keyed per (user, account).
--
-- WHY A NEW TABLE: no per-user-per-account preference/UI-state table exists
-- (user_profiles is user-only; notifications.read_at is the only dismissal-like
-- state). The checklist must persist dismissed/minimized/selected-workflow across
-- sessions and devices, so localStorage is not acceptable.
--
-- HONESTY CONTRACT (do not weaken): this table stores ONLY presentation state and
-- two server-latched timestamps (first_shown_at, completed_at). Substantive step
-- completion (workflow exists / apps connected / configured / tested / active) is
-- ALWAYS derived server-side from workflows, integrations, workflow_runs, and the
-- readiness services. NEVER add per-step completion booleans here — a stored
-- "connected/tested ✓" goes stale the moment the underlying state changes.
--
-- completed_at + completion_workflow_id are latched by the SERVER only (activation
-- success path / derivation-time evidence), never from client input, and are
-- immutable once set. completion_workflow_id is FK ON DELETE SET NULL so deleting
-- the workflow never erases the completion fact (completed_at survives).
--
-- ROLLBACK (pre-launch, feature flag ENABLE_ONBOARDING_CHECKLIST default OFF):
--   DROP TABLE public.user_onboarding_states;

CREATE TABLE public.user_onboarding_states (
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id           uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  -- The workflow the checklist currently guides (user-switchable; auto-repointed
  -- when deleted). Advisory pointer only — never authorization.
  selected_workflow_id uuid REFERENCES public.workflows(id) ON DELETE SET NULL,
  -- Completion provenance: the workflow whose successful activation latched
  -- completion. SET NULL on workflow deletion; completed_at is the durable fact.
  completion_workflow_id uuid REFERENCES public.workflows(id) ON DELETE SET NULL,
  first_shown_at       timestamptz,
  dismissed_at         timestamptz,
  minimized            boolean NOT NULL DEFAULT false,
  video_watched_at     timestamptz,
  -- Server-latched; immutable once set (repository enforces completed_at IS NULL).
  completed_at         timestamptz,
  celebrated_at        timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, account_id)
);

CREATE TRIGGER user_onboarding_states_set_updated_at
  BEFORE UPDATE ON public.user_onboarding_states
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS + GRANTs ─────────────────────────────────────────────────────────────
-- Reads: a user may SELECT only their OWN row, and only while they are still a
-- member of that account (membership predicate = defense-in-depth isolation; a
-- removed member loses access even though their row may persist).
-- Writes: service-role ONLY (no authenticated INSERT/UPDATE/DELETE grant or
-- policy) — all mutations flow through the onboarding repository behind the
-- authenticated routes, so a client can never write completed_at /
-- completion_workflow_id or forge presentation state for another user/account.

ALTER TABLE public.user_onboarding_states ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.user_onboarding_states TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_onboarding_states TO service_role;

CREATE POLICY user_onboarding_states_select_own_member
  ON public.user_onboarding_states
  FOR SELECT
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.account_memberships m
      WHERE m.account_id = user_onboarding_states.account_id
        AND m.user_id = auth.uid()
    )
  );
