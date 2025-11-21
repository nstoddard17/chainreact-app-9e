-- Create flow_v2_definitions table if it doesn't exist
-- This table stores the workflow definitions for the V2 flow builder
CREATE TABLE IF NOT EXISTS flow_v2_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Untitled Flow',
  workspace_id UUID,
  owner_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_flow_v2_definitions_owner_id ON flow_v2_definitions(owner_id);
CREATE INDEX IF NOT EXISTS idx_flow_v2_definitions_workspace_id ON flow_v2_definitions(workspace_id);

-- Drop the existing foreign key constraint if it exists
ALTER TABLE workflows_revisions
DROP CONSTRAINT IF EXISTS workflows_revisions_workflow_id_fkey;

-- Clean up orphaned revisions that don't have a matching definition
-- First, delete revisions that reference non-existent flow_v2_definitions
DELETE FROM workflows_revisions
WHERE workflow_id NOT IN (SELECT id FROM flow_v2_definitions)
  AND workflow_id NOT IN (SELECT id FROM workflows);

-- Add the correct foreign key constraint to flow_v2_definitions
-- Using NOT VALID to skip validation of existing rows, then validate separately
ALTER TABLE workflows_revisions
ADD CONSTRAINT workflows_revisions_workflow_id_fkey
FOREIGN KEY (workflow_id) REFERENCES flow_v2_definitions(id) ON DELETE CASCADE
NOT VALID;

-- Enable RLS on flow_v2_definitions
ALTER TABLE flow_v2_definitions ENABLE ROW LEVEL SECURITY;

-- Create basic RLS policies for flow_v2_definitions
CREATE POLICY "Users can view their own flow definitions"
ON flow_v2_definitions FOR SELECT
TO authenticated
USING (owner_id = auth.uid());

CREATE POLICY "Users can create their own flow definitions"
ON flow_v2_definitions FOR INSERT
TO authenticated
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update their own flow definitions"
ON flow_v2_definitions FOR UPDATE
TO authenticated
USING (owner_id = auth.uid());

CREATE POLICY "Users can delete their own flow definitions"
ON flow_v2_definitions FOR DELETE
TO authenticated
USING (owner_id = auth.uid());
