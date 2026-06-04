-- ChainReactV2 — workflow folders + workflow trash foundation
-- (Slice 4.WORKFLOW-FOLDERS-2 / WF-1).
--
-- Schema-only foundation per docs/slices/phase-4/workflow-folders-trash-plan.md
-- (product decisions locked in commit b6d517bc7). This slice adds STRUCTURE only;
-- it never reads, backfills, or rewrites an existing row. It introduces:
--   1. public.workflow_folders — account-scoped, adjacency-list folder tree
--      carrying the SAME trash columns the account-deletion lifecycle uses.
--   2. Nullable folder + trash columns on public.workflows.
--   3. Indexes: live listing, purge sweep, batch-restore, sibling-name uniqueness.
--   4. Account-membership RLS on workflow_folders (mirrors workflows) + GRANTs.
--   5. Same-account safety triggers: a folder's parent_folder_id and a
--      workflow's folder_id must reference a folder in the SAME account.
--
-- OUT OF SCOPE (later slices, intentionally absent here):
--   - No folder CRUD service/routes (WF-2).
--   - No restore / undo / delete-mode behavior (WF-3).
--   - No purge cron (WF-4). No UI (WF-5).
--   - No tier-limit enforcement (limits live as code constants in WF-2/WF-6, not in SQL).
--   - NO change to the workflow delete lifecycle or the `deleted` state — it stays
--     terminal until WF-3 adds the restore transition. `workflows.deleted_at` and
--     the `deleted` enum value are reused as-is, never altered here.

-- ── 1. workflow_folders ──────────────────────────────────────────────────────

CREATE TABLE public.workflow_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership root — mirrors workflows.account_id (NOT NULL, ON DELETE RESTRICT).
  -- The account is the authorization anchor; RLS scopes by membership of it.
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,

  -- Adjacency-list parent. NULL = top-level folder. ON DELETE RESTRICT so a
  -- parent can never be hard-deleted out from under its children — folder
  -- removal goes through the soft-delete service (WF-3), which reparents or
  -- batch-trashes first. The same-account trigger below asserts
  -- parent.account_id = account_id.
  parent_folder_id uuid REFERENCES public.workflow_folders(id) ON DELETE RESTRICT,

  name text NOT NULL,

  -- Manual sibling ordering within (account_id, parent_folder_id). Last-write-
  -- wins reorder for launch (locked decision) — no optimistic-lock column.
  position integer NOT NULL DEFAULT 0,

  -- Provenance only — NOT authorization (any account member may manage folders).
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- ── Trash columns (mirror the account-deletion lifecycle shape) ──
  deleted_at timestamptz,
  deleted_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  purge_after timestamptz,
  -- Snapshot of parent_folder_id at delete time. NO FK — the original parent may
  -- itself be purged before this row is restored (restore degrades to root).
  deleted_from_parent_folder_id uuid,
  -- Trash batch id — shared across a folder+contents delete so the subtree
  -- restores together (WF-3). NULL when not trashed.
  delete_operation_id uuid
);

-- Live folder listing within a parent (ordered by position).
CREATE INDEX workflow_folders_account_parent_position_idx
  ON public.workflow_folders (account_id, parent_folder_id, position)
  WHERE deleted_at IS NULL;

-- Purge sweep (WF-4) — partial, mirrors accounts_pending_deletion_purge_after_idx.
CREATE INDEX workflow_folders_purge_after_idx
  ON public.workflow_folders (purge_after)
  WHERE deleted_at IS NOT NULL;

-- Batch-restore lookups (WF-3).
CREATE INDEX workflow_folders_delete_operation_id_idx
  ON public.workflow_folders (delete_operation_id)
  WHERE delete_operation_id IS NOT NULL;

-- Sibling name uniqueness among LIVE folders. NULLS NOT DISTINCT (PG15+) so two
-- top-level folders (parent_folder_id IS NULL) with the same name still collide;
-- trashed rows (deleted_at IS NOT NULL) are excluded so a name can be re-created
-- after its prior holder is trashed.
CREATE UNIQUE INDEX workflow_folders_unique_sibling_name_live
  ON public.workflow_folders (account_id, parent_folder_id, lower(name))
  NULLS NOT DISTINCT
  WHERE deleted_at IS NULL;

CREATE TRIGGER workflow_folders_set_updated_at
  BEFORE UPDATE ON public.workflow_folders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 2. workflows folder + trash columns ───────────────────────────────────────
--
-- All nullable / no default beyond NULL — every existing workflow row stays
-- uncategorized (folder_id IS NULL) and un-trashed. No backfill, no rewrite.

ALTER TABLE public.workflows
  -- Optional single folder membership. NULL = uncategorized. ON DELETE RESTRICT
  -- so a live folder is never hard-deleted out from under a workflow (removal
  -- goes through the WF-3 soft-delete service). Same-account trigger enforced below.
  ADD COLUMN folder_id uuid REFERENCES public.workflow_folders(id) ON DELETE RESTRICT,
  ADD COLUMN deleted_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN purge_after timestamptz,
  -- Snapshot of folder_id at delete time (no FK — target may be purged).
  ADD COLUMN deleted_from_folder_id uuid,
  ADD COLUMN delete_operation_id uuid;

-- Live workflow listing within a folder.
CREATE INDEX workflows_account_folder_idx
  ON public.workflows (account_id, folder_id)
  WHERE state <> 'deleted';

-- Purge sweep (WF-4).
CREATE INDEX workflows_purge_after_idx
  ON public.workflows (purge_after)
  WHERE deleted_at IS NOT NULL;

-- Batch-restore lookups (WF-3).
CREATE INDEX workflows_delete_operation_id_idx
  ON public.workflows (delete_operation_id)
  WHERE delete_operation_id IS NOT NULL;

-- ── 3. RLS + GRANTs on workflow_folders ──────────────────────────────────────
--
-- Mirrors the workflows account-membership policy set exactly
-- (workflows_*_account_member from 20260530000001 / cutover). Folder management
-- is membership-based; roles gate people management only (locked decision §10).

ALTER TABLE public.workflow_folders ENABLE ROW LEVEL SECURITY;

-- Data API access (explicit GRANTs required after Supabase removes implicit
-- grants on public tables, Oct 30 2026). RLS still gates row visibility.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_folders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_folders TO service_role;

CREATE POLICY workflow_folders_select_account_member ON public.workflow_folders
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      WHERE am.user_id = auth.uid()
        AND am.account_id = workflow_folders.account_id
    )
  );

CREATE POLICY workflow_folders_insert_account_member ON public.workflow_folders
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      WHERE am.user_id = auth.uid()
        AND am.account_id = workflow_folders.account_id
    )
  );

CREATE POLICY workflow_folders_update_account_member ON public.workflow_folders
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      WHERE am.user_id = auth.uid()
        AND am.account_id = workflow_folders.account_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      WHERE am.user_id = auth.uid()
        AND am.account_id = workflow_folders.account_id
    )
  );

CREATE POLICY workflow_folders_delete_account_member ON public.workflow_folders
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      WHERE am.user_id = auth.uid()
        AND am.account_id = workflow_folders.account_id
    )
  );

-- ── 4. Same-account safety triggers ──────────────────────────────────────────
--
-- Both functions are SECURITY DEFINER on purpose. A member inserting a row in
-- THEIR account that points (parent_folder_id / folder_id) at ANOTHER account's
-- folder passes both RLS (they own the row's account) and the FK check (FK
-- validation bypasses RLS). An RLS-subject SELECT inside the trigger would see
-- NULL for the cross-account folder and wrongly allow the link. SECURITY DEFINER
-- makes the internal lookup read the folder's TRUE account_id regardless of RLS,
-- so the cross-account link is reliably rejected. Stable error prefixes mirror
-- account_memberships_personal_invariant_violation for testability.

CREATE OR REPLACE FUNCTION public.workflow_folders_enforce_same_account_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_account uuid;
BEGIN
  IF NEW.parent_folder_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT f.account_id INTO v_parent_account
    FROM public.workflow_folders f
   WHERE f.id = NEW.parent_folder_id;

  -- Missing parent: let the FK violation surface from the row write itself.
  IF v_parent_account IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_parent_account <> NEW.account_id THEN
    RAISE EXCEPTION
      'workflow_folders_same_account_violation: parent_folder_id must belong to the same account (folder account=%, parent account=%)',
      NEW.account_id, v_parent_account;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER workflow_folders_enforce_same_account_parent
  BEFORE INSERT OR UPDATE ON public.workflow_folders
  FOR EACH ROW EXECUTE FUNCTION public.workflow_folders_enforce_same_account_parent();

CREATE OR REPLACE FUNCTION public.workflows_enforce_same_account_folder()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_folder_account uuid;
BEGIN
  -- Fast path: the overwhelming majority of workflow writes (every write until
  -- WF-2/WF-3 ship) leave folder_id NULL — short-circuit before any lookup.
  IF NEW.folder_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT f.account_id INTO v_folder_account
    FROM public.workflow_folders f
   WHERE f.id = NEW.folder_id;

  -- Missing folder: let the FK violation surface from the row write itself.
  IF v_folder_account IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_folder_account <> NEW.account_id THEN
    RAISE EXCEPTION
      'workflows_same_account_violation: folder_id must belong to the workflow''s account (workflow account=%, folder account=%)',
      NEW.account_id, v_folder_account;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER workflows_enforce_same_account_folder
  BEFORE INSERT OR UPDATE ON public.workflows
  FOR EACH ROW EXECUTE FUNCTION public.workflows_enforce_same_account_folder();
