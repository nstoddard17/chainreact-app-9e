-- ChainReactV2 — node connector binding foundation (Slice 4.CONN-SHARE / CS-4a).
--
-- Schema-only foundation per docs/slices/phase-4/explicit-private-connection-sharing-plan.md
-- §15. Adds STRUCTURE only; it never reads, backfills, or rewrites an existing
-- row, and it CHANGES NO RUNTIME BEHAVIOR.
--
-- public.workflow_node_connector_bindings — a side table holding, per
-- (workflow, node), the specific CONNECTOR USER whose explicitly-shared personal
-- connection that node should run under once row-level sharing resolves (the
-- §14.3 multi-sharer disambiguation). It is DISTINCT from workflow_node_credentials:
--   - workflow_node_credentials = CONSENT-grant (requester-pull, pending→accepted).
--   - this table              = direct CONNECTOR-PUSH binding (connector already
--                               consented by sharing; no status machine).
-- The locked model (§0.3) keeps the two concepts separate — do NOT merge them.
--
-- Binds by connector_user_id (STABLE across reconnect — connected_by_user_id
-- survives, the integration ROW id does not). NO status column: a binding is a
-- direct pointer whose VALIDITY is recomputed at resolve time against the live
-- shared set (CS-4b), never trusted from storage.
--
-- OUT OF SCOPE (later slices, intentionally absent here):
--   - No execution resolution change (CS-4b extends effectiveCredentialOwner).
--   - No run/edit gate change (CS-3b / CS-4b, in lockstep).
--   - No builder/Apps UI (CS-5). No Disconnect/Reconnect change.
--   - No change to workflows, integrations, draft_definition, or
--     workflow_node_credentials. NO workflow.created_by_user_id change.
--
-- PROVIDER CLASSIFICATION IS NOT ENCODED IN SQL. personal (bindable) vs
-- account/service (never bindable) lives in core/integrations/credentialSharing.ts
-- and is enforced at the repository/service boundary — never duplicated here.
--
-- ROLLBACK (pre-launch, no prod data): DROP TABLE public.workflow_node_connector_bindings.

CREATE TABLE public.workflow_node_connector_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The workflow whose node this binding belongs to. ON DELETE CASCADE: a binding
  -- has no meaning without its workflow.
  workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,

  -- Node id within workflows.draft_definition (the graph node). Stable across
  -- edits/republish (the binding keys on it, NOT on definition contents).
  node_id text NOT NULL,

  -- Provider string for the node (e.g. 'gmail'). MUST be a personal-credential
  -- provider — enforced in code (see header), not by a SQL provider list.
  provider text NOT NULL,

  -- The connector whose explicitly-shared personal connection this node runs
  -- under. ON DELETE CASCADE: if the user is deleted the binding cannot resolve.
  connector_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Who set the binding (the workflow editor). Provenance only — SET NULL if that
  -- user is later deleted. Never used for authorization.
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One binding per node (full unique — no status, so no partial predicate).
CREATE UNIQUE INDEX workflow_node_connector_bindings_one_per_node
  ON public.workflow_node_connector_bindings (workflow_id, node_id);

-- Per-workflow read (builder/resolution read path, later slices).
CREATE INDEX workflow_node_connector_bindings_workflow_idx
  ON public.workflow_node_connector_bindings (workflow_id);

-- Offboarding cleanup (CS-4b): "bindings pointing at a leaving connector".
CREATE INDEX workflow_node_connector_bindings_connector_idx
  ON public.workflow_node_connector_bindings (connector_user_id);

CREATE TRIGGER workflow_node_connector_bindings_set_updated_at
  BEFORE UPDATE ON public.workflow_node_connector_bindings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS + GRANTs ─────────────────────────────────────────────────────────────
--
-- SELECT is membership-gated THROUGH the workflow's account (the table carries no
-- account_id — it derives the account via workflows). The join also requires the
-- account to be active (deletion_status = 'active'), so a frozen account never
-- exposes its bindings. There is NO client INSERT/UPDATE/DELETE policy: every
-- write is service-role (the binding service authorizes). Default-deny means a
-- member can never self-bind a node by writing this table directly.

ALTER TABLE public.workflow_node_connector_bindings ENABLE ROW LEVEL SECURITY;

-- Data API access (explicit GRANTs required after Supabase removes implicit grants
-- on public tables, Oct 30 2026). RLS still gates row visibility; authenticated
-- may only SELECT (narrowed to member rows), service_role owns all writes.
GRANT SELECT ON public.workflow_node_connector_bindings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_node_connector_bindings TO service_role;

CREATE POLICY workflow_node_connector_bindings_select_account_member
  ON public.workflow_node_connector_bindings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.workflows w
      JOIN public.account_memberships am ON am.account_id = w.account_id
      JOIN public.accounts a ON a.id = w.account_id
      WHERE w.id = workflow_node_connector_bindings.workflow_id
        AND am.user_id = auth.uid()
        AND a.deletion_status = 'active'
    )
  );
