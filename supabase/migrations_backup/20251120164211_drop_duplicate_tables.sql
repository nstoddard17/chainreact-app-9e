-- =====================================================
-- DROP DUPLICATE TABLES - CLEANUP MIGRATION
-- =====================================================
-- This migration removes old singular table names that
-- are now duplicates after the workflows_* rename
-- =====================================================

BEGIN;

-- Drop old singular versions (keeping workflows_* plural versions)
DROP TABLE IF EXISTS public.workflow_schedules CASCADE;
DROP TABLE IF EXISTS public.workflow_templates CASCADE;

-- Verify the correct tables still exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'workflows_schedules') THEN
    RAISE EXCEPTION 'workflows_schedules table does not exist!';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'workflows_templates') THEN
    RAISE EXCEPTION 'workflows_templates table does not exist!';
  END IF;
END $$;

COMMIT;

-- =====================================================
-- POST-MIGRATION NOTES
-- =====================================================
-- This cleanup removes duplicate table names created before
-- the standardization to workflows_* naming convention.
--
-- Code has been updated to use:
-- - workflows_schedules (was workflow_schedules)
-- - workflows_templates (was workflow_templates)
-- =====================================================
