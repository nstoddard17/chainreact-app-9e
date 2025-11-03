-- ============================================================================
-- FIX SCRIPT: Clean up ALL existing constraints before running migrations
-- Run this in Supabase Studio BEFORE running the migrations
-- ============================================================================

-- Step 1: Check what constraints currently exist
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'workflow_folders'
  AND (indexname LIKE '%default%' OR indexname LIKE '%trash%')
ORDER BY indexname;

-- Step 2: Drop ALL existing default/trash constraints (regardless of name)
DO $$
DECLARE
  idx_record RECORD;
BEGIN
  -- Find and drop all indexes related to default/trash folders
  FOR idx_record IN
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'workflow_folders'
      AND (indexname LIKE '%default%' OR indexname LIKE '%trash%')
  LOOP
    EXECUTE 'DROP INDEX IF EXISTS public.' || quote_ident(idx_record.indexname);
    RAISE NOTICE 'Dropped index: %', idx_record.indexname;
  END LOOP;
END $$;

-- Step 3: Drop any table constraints as well
ALTER TABLE public.workflow_folders
  DROP CONSTRAINT IF EXISTS unique_default_folder_per_team;

ALTER TABLE public.workflow_folders
  DROP CONSTRAINT IF EXISTS unique_trash_folder_per_team;

ALTER TABLE public.workflow_folders
  DROP CONSTRAINT IF EXISTS idx_workflow_folders_user_default;

-- Step 4: Verify all are gone
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'workflow_folders'
  AND (indexname LIKE '%default%' OR indexname LIKE '%trash%')
ORDER BY indexname;

-- Expected result: 0 rows (all constraints removed)

-- ============================================================================
-- NOW CREATE THE CORRECT CONSTRAINTS
-- ============================================================================

-- User folders: one default per user (only for personal folders)
CREATE UNIQUE INDEX idx_workflow_folders_user_default
  ON public.workflow_folders(user_id, is_default)
  WHERE team_id IS NULL AND is_default = TRUE;

-- Team folders: one default per team
CREATE UNIQUE INDEX unique_default_folder_per_team
  ON public.workflow_folders(team_id, is_default)
  WHERE team_id IS NOT NULL AND is_default = TRUE;

-- Team folders: one trash per team
CREATE UNIQUE INDEX unique_trash_folder_per_team
  ON public.workflow_folders(team_id, is_trash)
  WHERE team_id IS NOT NULL AND is_trash = TRUE;

-- ============================================================================
-- VERIFY CONSTRAINTS ARE CORRECT
-- ============================================================================

SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'workflow_folders'
  AND (indexname LIKE '%default%' OR indexname LIKE '%trash%')
ORDER BY indexname;

-- Expected result: 3 rows with correct WHERE clauses

\echo ''
\echo '========================================='
\echo 'Constraint Fix Complete!'
\echo '========================================='
\echo ''
\echo 'You should now see 3 indexes:'
\echo '1. idx_workflow_folders_user_default - WHERE team_id IS NULL'
\echo '2. unique_default_folder_per_team - WHERE team_id IS NOT NULL'
\echo '3. unique_trash_folder_per_team - WHERE team_id IS NOT NULL'
\echo ''
\echo 'Next steps:'
\echo '1. Skip Migration 1 (constraints are now fixed)'
\echo '2. Run Migration 2 (team folder initialization)'
\echo '3. Run Migrations 3 and 4'
