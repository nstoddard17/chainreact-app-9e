-- ChainReactV2 — per-node credential ownership foundation
-- (Slice 4.TEAM-WORKFLOWS-CREDENTIAL-SHARING-2 / CS-1).
--
-- Schema-only foundation per
-- docs/slices/phase-4/team-workflows-credential-sharing-plan.md (Option B, product
-- decisions in commit b9327d4ca). This slice adds STRUCTURE only; it never reads,
-- backfills, or rewrites an existing row, and it CHANGES NO RUNTIME BEHAVIOR.
--
-- It introduces public.workflow_node_credentials — a side table holding, per
-- (workflow, node), an OPTIONAL credential-owner override + its consent status.
-- Until a later slice wires resolution, the absence of an `accepted` row means
-- the current behavior is unchanged: personal-provider steps run under
-- workflow.created_by_user_id (the 22B creator pin). Only `accepted` rows will
-- ever become effective, and not in this slice.
--
-- OUT OF SCOPE (later slices, intentionally absent here):
--   - No execution resolution change (CS-2). The 22B engine seam is untouched.
--   - No builder/options change (CS-4). No AI/React Agent change (CS-5).
--   - No offboarding change (CS-6). No consent/reassignment routes (CS-3).
--   - No change to workflows, integrations, draft_definition, or workflow_revisions.
--   - NO workflow.created_by_user_id change — it stays provenance, never rewritten.
--
-- PROVIDER CLASSIFICATION IS NOT ENCODED IN SQL. Whether a provider is personal
-- (node-ownable) vs account/service (account-shared, never node-owned) lives in
-- code (core/integrations/credentialSharing.ts) and is enforced at the
-- repository/service boundary. We deliberately do NOT duplicate that provider map
-- in the migration — a stale SQL copy would diverge from the single source.
--
-- ROLLBACK (pre-launch, no prod data): DROP TABLE public.workflow_node_credentials.
-- Nothing depends on it (this slice wires no caller), so this is a clean reverse.

CREATE TABLE public.workflow_node_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The workflow whose node this grant belongs to. ON DELETE CASCADE: a grant has
  -- no meaning without its workflow, so deleting the workflow removes its grants.
  workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,

  -- Node id within workflows.draft_definition (the graph node). Stable across
  -- edits/republish (the override is keyed on it, NOT on definition contents).
  node_id text NOT NULL,

  -- Provider string for the node (e.g. 'gmail'). MUST be a personal-credential
  -- provider — enforced in code (see header note), not by a SQL provider list.
  provider text NOT NULL,

  -- The member whose connection this node should run under once accepted.
  -- ON DELETE CASCADE: if the user is deleted, the grant cannot resolve, so it
  -- disappears (the node deterministically falls back to the workflow creator).
  credential_owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Consent lifecycle. Only 'accepted' is ever effective (later slices); 'pending'
  -- awaits the owner's consent; 'declined' / 'revoked' are terminal history.
  status text NOT NULL DEFAULT 'pending'
    CONSTRAINT workflow_node_credentials_status_check
    CHECK (status IN ('pending', 'accepted', 'declined', 'revoked')),

  -- Who requested the reassignment (owner/admin or the workflow creator).
  -- Provenance only — SET NULL if that user is later deleted.
  requested_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One LIVE grant per node. A node can have at most one in-flight or effective
-- owner override, but 'declined' / 'revoked' rows are preserved for audit/history
-- (so the partial predicate excludes them). NULLS NOT DISTINCT is unnecessary here
-- (both keys are NOT NULL).
CREATE UNIQUE INDEX workflow_node_credentials_one_live_per_node
  ON public.workflow_node_credentials (workflow_id, node_id)
  WHERE status IN ('pending', 'accepted');

-- List a workflow's grants (builder/options/offboarding read path, later slices).
CREATE INDEX workflow_node_credentials_workflow_idx
  ON public.workflow_node_credentials (workflow_id);

-- Offboarding lookup (CS-6): "accepted grants owned by a leaving member".
CREATE INDEX workflow_node_credentials_owner_idx
  ON public.workflow_node_credentials (credential_owner_user_id)
  WHERE status = 'accepted';

CREATE TRIGGER workflow_node_credentials_set_updated_at
  BEFORE UPDATE ON public.workflow_node_credentials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS + GRANTs ─────────────────────────────────────────────────────────────
--
-- SELECT is membership-gated THROUGH the workflow's account (the table carries no
-- account_id — it derives the account via workflows). The join also requires the
-- account to be active (deletion_status = 'active'), so a frozen / pending-
-- deletion account never exposes its grants — mirroring the freeze-aware RLS on
-- workflows. There is NO client INSERT/UPDATE/DELETE policy: every write is
-- service-role (the consent/reassignment flow runs server-side, CS-3). Default-
-- deny means a member can never self-assign a credential by writing this table.

ALTER TABLE public.workflow_node_credentials ENABLE ROW LEVEL SECURITY;

-- Data API access (explicit GRANTs required after Supabase removes implicit grants
-- on public tables, Oct 30 2026). RLS still gates row visibility; authenticated
-- may only SELECT (narrowed to member rows), service_role owns all writes.
GRANT SELECT ON public.workflow_node_credentials TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_node_credentials TO service_role;

CREATE POLICY workflow_node_credentials_select_account_member
  ON public.workflow_node_credentials
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.workflows w
      JOIN public.account_memberships am ON am.account_id = w.account_id
      JOIN public.accounts a ON a.id = w.account_id
      WHERE w.id = workflow_node_credentials.workflow_id
        AND am.user_id = auth.uid()
        AND a.deletion_status = 'active'
    )
  );
