-- ChainReactV2 — workflow checkpoints (CHECKPOINTS-1).
--
-- Durable, account-scoped "restore points" for a workflow's DRAFT graph. A
-- checkpoint captures the draft definition AS IT WAS just before a notable
-- change (launch scope: a React Agent apply) plus the prompt + a plain-English
-- change summary, so the user can answer "can I go back?" and restore that
-- prior draft state.
--
-- This is DELIBERATELY distinct from:
--   - public.workflow_revisions — immutable PUBLISHED snapshots that back the
--     active-revision / publish model. Checkpoints are DRAFT restore points, not
--     published versions, and carry name + prompt + summary + source.
--   - the in-memory builder undo/redo stack — session-only, never persisted.
--
-- Account scope mirrors workflow_revisions (membership join through workflows)
-- AND carries an explicit account_id (the newer pattern, e.g. account_mcp_tokens)
-- so the service can scope without an extra join. created_by_user_id is
-- provenance only (the actor who created the checkpoint), never authorization.
--
-- ROLLBACK (pre-launch, no prod data): DROP TABLE public.workflow_checkpoints.

CREATE TABLE public.workflow_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The workflow this checkpoint restores. CASCADE: a checkpoint has no meaning
  -- without its workflow (matches workflow_revisions).
  workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,

  -- Owning account (denormalized for cheap scoping). CASCADE with the account.
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,

  -- The user who created the checkpoint. Provenance only — NOT authorization
  -- (any account member may list/restore). SET NULL on user deletion.
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- What produced this checkpoint. Launch scope writes 'react_agent'; 'manual'
  -- and 'system' are reserved for explicit user / system-initiated restore points.
  source text NOT NULL
    CONSTRAINT workflow_checkpoints_source_known
    CHECK (source IN ('react_agent', 'manual', 'system')),

  -- Human label shown in the rail, e.g. 'Before React Agent change'.
  name text NOT NULL,

  -- The agent prompt that triggered the change (null for manual/system).
  prompt text,

  -- Plain-English change summary already shown to the user (null when absent).
  summary text,

  -- The restoreable DRAFT snapshot — the graph AS IT WAS before the change.
  -- Same shape + sensitivity class as workflows.draft_definition.
  definition jsonb NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now()
);

-- Recent-checkpoints-for-a-workflow — the list + prune query.
CREATE INDEX workflow_checkpoints_workflow_id_idx
  ON public.workflow_checkpoints (workflow_id, created_at DESC);

-- ── RLS + GRANTs ─────────────────────────────────────────────────────────────
--
-- Account members may read/create/delete checkpoints for their account's
-- workflows. The draft `definition` is the same sensitivity class as
-- workflows.draft_definition (which authenticated members already read), so an
-- `authenticated` GRANT is appropriate — RLS gates row visibility by membership.

ALTER TABLE public.workflow_checkpoints ENABLE ROW LEVEL SECURITY;

-- Data API access (explicit GRANTs required after Supabase removes implicit
-- grants on public tables, Oct 30 2026).
GRANT SELECT, INSERT, DELETE ON public.workflow_checkpoints TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_checkpoints TO service_role;

CREATE POLICY workflow_checkpoints_select_account_member
  ON public.workflow_checkpoints
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.workflows w
        JOIN public.account_memberships am ON am.account_id = w.account_id
       WHERE w.id = workflow_checkpoints.workflow_id
         AND am.user_id = auth.uid()
    )
  );

CREATE POLICY workflow_checkpoints_insert_account_member
  ON public.workflow_checkpoints
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.workflows w
        JOIN public.account_memberships am ON am.account_id = w.account_id
       WHERE w.id = workflow_checkpoints.workflow_id
         AND am.user_id = auth.uid()
    )
  );

CREATE POLICY workflow_checkpoints_delete_account_member
  ON public.workflow_checkpoints
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
        FROM public.workflows w
        JOIN public.account_memberships am ON am.account_id = w.account_id
       WHERE w.id = workflow_checkpoints.workflow_id
         AND am.user_id = auth.uid()
    )
  );
