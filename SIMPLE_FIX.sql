-- ============================================================================
-- SIMPLE FIX: Drop the problem constraint and don't recreate it yet
-- ============================================================================

-- The error shows: Key (user_id)=(xxx) already exists
-- This means there's a unique constraint on JUST user_id (not user_id + is_default)
-- This is wrong and blocks team folder creation

-- Step 1: Drop the problematic constraint
DROP INDEX IF EXISTS idx_workflow_folders_user_default CASCADE;

-- Step 2: Don't recreate it yet - let's get team folders created first
-- We'll add it back later with the proper WHERE clause

-- Step 3: Verify it's gone
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'workflow_folders'
  AND indexname = 'idx_workflow_folders_user_default';

-- Expected: 0 rows (constraint is gone)

\echo ''
\echo '========================================='
\echo 'Constraint Dropped'
\echo '========================================='
\echo ''
\echo 'Now run Migration 2 to create team folders.'
\echo 'After that succeeds, we can add back the constraint with proper WHERE clause.'
