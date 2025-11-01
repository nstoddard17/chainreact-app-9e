-- Fix created_by for existing workflows
-- Set created_by to user_id for all workflows where it's null

UPDATE public.workflows
SET created_by = user_id
WHERE created_by IS NULL;

-- Verify the fix
SELECT
  'Workflows with created_by' as metric,
  COUNT(*) as count
FROM workflows
WHERE created_by IS NOT NULL;

SELECT
  'Workflows missing created_by' as metric,
  COUNT(*) as count
FROM workflows
WHERE created_by IS NULL;
