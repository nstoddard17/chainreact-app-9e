-- Stores a snapshot of the workflow state at activation time.
-- Used to compute diffs when an active workflow is edited.
CREATE TABLE IF NOT EXISTS workflow_activation_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  snapshot_json JSONB NOT NULL,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_activation_snapshots_workflow
  ON workflow_activation_snapshots (workflow_id, activated_at DESC);

COMMENT ON TABLE workflow_activation_snapshots IS 'Stores workflow state at activation time for diff comparison on edits.';
