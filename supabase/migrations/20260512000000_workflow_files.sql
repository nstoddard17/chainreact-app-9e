-- ChainReactV2 — workflow_files table (P-S3 Commit 3).
--
-- Per docs/slices/p-s3-file-output-contract-plan.md §5 ("Storage strategy"):
--   - File bytes for `kind=v2_storage` FileRefs live in the Supabase
--     `workflow-files` bucket at the canonical path
--         <userId>/<workflowId>/<runId>/<nodeId>/<filename>
--   - This table is the *metadata index* — one row per staged file, lets
--     us list/delete by run + reconcile expired rows nightly. The bytes
--     in storage are the source of truth for content; this row is the
--     source of truth for "did we stage this, when does it expire, who
--     owns it."
--   - Default retention: 24h. The end-of-run cleanup service (P-S3
--     Commit 4) deletes rows + storage objects at run finalization.
--   - The nightly reconciler (P-S3 Commit 4 cron, NOT this commit)
--     sweeps `expires_at < now()` to guard against engine crashes that
--     leave the end-of-run cleanup unwritten.
--
-- Bucket creation is out-of-band:
--   The `workflow-files` Supabase storage bucket is created via the
--   Supabase dashboard / CLI (one-time operations setup), NOT via this
--   migration. Project policy: SQL migrations do not poke at the
--   `storage.buckets` table because the row layout has shifted between
--   Supabase versions and remote/local environments. The bucket name +
--   path scheme are versioned in this migration's comment header — any
--   change to either is a coordinated migration + ops update.
--
-- FK choices:
--   - `user_id` → `auth.users(id) ON DELETE CASCADE`: user-deletion
--     cleanup, mirrors trigger_resources / workflow_runs.
--   - `workflow_id` → `public.workflows(id) ON DELETE CASCADE`: deleting
--     a workflow nukes its staged files. Workflow rows exist before
--     staging fires.
--   - `run_id`: NO FK. workflow_runs rows are written by the engine at
--     run completion (see workflow_runs.recordRun), while staging
--     happens mid-execution — the run row doesn't yet exist when the
--     file is staged. We keep run_id as a `uuid` column without a FK
--     and rely on the end-of-run cleanup / nightly reconciler to
--     reclaim orphans.

CREATE TABLE public.workflow_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  run_id uuid NOT NULL,
  node_id text NOT NULL,

  -- Canonical path within the workflow-files bucket:
  --   <userId>/<workflowId>/<runId>/<nodeId>/<filename>
  -- Unique across all rows — the engine constructs deterministic paths
  -- and a duplicate insert is an engineering bug, not a retry surface.
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,

  -- Nullable because providers do not always report a length at stage
  -- time. Stored as bigint to leave headroom for future large-file
  -- support without a schema change.
  size_bytes bigint,

  -- Default 24h matches P-S3 §11 decision #3. Per-FileRef.expiresAt
  -- overrides at insert time.
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX workflow_files_storage_path_unique
  ON public.workflow_files (storage_path);

CREATE INDEX workflow_files_user_idx
  ON public.workflow_files (user_id, created_at DESC);

CREATE INDEX workflow_files_workflow_idx
  ON public.workflow_files (workflow_id, created_at DESC);

-- "List/delete every file produced by this run" — the dominant cleanup
-- access pattern from the end-of-run service.
CREATE INDEX workflow_files_run_idx
  ON public.workflow_files (run_id);

-- Nightly reconciler sweep: WHERE expires_at < now().
CREATE INDEX workflow_files_expires_idx
  ON public.workflow_files (expires_at);

ALTER TABLE public.workflow_files ENABLE ROW LEVEL SECURITY;

-- Reads: users see their own files only (future UI surface like
-- "downloads for this run" — not exposed in Commit 3). Writes / deletes
-- come from the engine + cleanup services via the service-role client
-- (background paths, no user session). No user-facing write policies —
-- default-deny.
CREATE POLICY workflow_files_select_own ON public.workflow_files
  FOR SELECT USING (auth.uid() = user_id);

CREATE TRIGGER workflow_files_set_updated_at
  BEFORE UPDATE ON public.workflow_files
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
