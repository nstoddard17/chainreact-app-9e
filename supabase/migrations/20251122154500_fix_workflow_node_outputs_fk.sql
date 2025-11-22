-- Remove foreign key constraint on workflow_node_outputs
-- The workflow_id may reference workflows that aren't in the main workflows table
-- (e.g., flow_v2 workflows or unsaved workflows being tested)

-- Drop the foreign key constraint
ALTER TABLE workflow_node_outputs
DROP CONSTRAINT IF EXISTS workflow_node_outputs_workflow_id_fkey;

-- Change workflow_id to be just a TEXT field that can hold any workflow identifier
-- This allows caching for workflows regardless of which table they're stored in
ALTER TABLE workflow_node_outputs
ALTER COLUMN workflow_id TYPE TEXT USING workflow_id::TEXT;

-- Add a comment explaining why there's no foreign key
COMMENT ON COLUMN workflow_node_outputs.workflow_id IS 'Workflow identifier (UUID as text). No foreign key constraint to support workflows from multiple sources (flow_v2, templates, etc.)';
