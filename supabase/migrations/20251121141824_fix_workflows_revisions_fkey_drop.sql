-- Drop the FK constraint that was incorrectly set to only reference flow_v2_definitions
-- The application handles checking both workflows and flow_v2_definitions tables
-- so we don't need a database-level FK constraint

ALTER TABLE workflows_revisions
DROP CONSTRAINT IF EXISTS workflows_revisions_workflow_id_fkey;

-- Note: We're intentionally NOT adding a new FK because:
-- 1. workflow_id can reference EITHER workflows.id OR flow_v2_definitions.id
-- 2. PostgreSQL doesn't support "OR" foreign keys natively
-- 3. The application layer handles this dual-table lookup
