-- Remove the unique constraint on workflow names to allow duplicate names
-- This allows users to have multiple workflows with the same name (e.g., "New Workflow")
DROP INDEX IF EXISTS idx_workflows_personal_name_unique;
