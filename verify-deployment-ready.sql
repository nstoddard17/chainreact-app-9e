-- ============================================================================
-- PRE-DEPLOYMENT VERIFICATION SCRIPT
-- Run this in Supabase Studio SQL Editor BEFORE applying migrations
-- ============================================================================

-- This script checks:
-- 1. Which columns already exist
-- 2. Which functions/triggers exist
-- 3. What needs to be created
-- 4. If there are any existing teams without folders

\echo '========================================='
\echo 'STEP 1: Check workflow_folders columns'
\echo '========================================='

SELECT
  'workflow_folders' as table_name,
  column_name,
  data_type,
  is_nullable,
  column_default,
  CASE
    WHEN column_name IN ('is_trash', 'team_id') THEN '✅ ALREADY EXISTS'
    ELSE '❌ MISSING'
  END as status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'workflow_folders'
  AND column_name IN ('is_trash', 'team_id', 'user_id', 'organization_id', 'parent_folder_id', 'is_default')
ORDER BY
  CASE column_name
    WHEN 'user_id' THEN 1
    WHEN 'team_id' THEN 2
    WHEN 'organization_id' THEN 3
    WHEN 'is_default' THEN 4
    WHEN 'is_trash' THEN 5
    WHEN 'parent_folder_id' THEN 6
  END;

\echo ''
\echo '========================================='
\echo 'STEP 2: Check teams columns'
\echo '========================================='

SELECT
  'teams' as table_name,
  column_name,
  data_type,
  is_nullable,
  CASE
    WHEN column_name IN ('suspended_at', 'suspension_reason', 'grace_period_ends_at', 'suspension_notified_at') THEN '✅ ALREADY EXISTS'
    ELSE '❌ MISSING'
  END as status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'teams'
  AND column_name IN ('id', 'name', 'created_by', 'suspended_at', 'suspension_reason', 'grace_period_ends_at', 'suspension_notified_at')
ORDER BY
  CASE column_name
    WHEN 'id' THEN 1
    WHEN 'name' THEN 2
    WHEN 'created_by' THEN 3
    WHEN 'suspended_at' THEN 4
    WHEN 'suspension_reason' THEN 5
    WHEN 'grace_period_ends_at' THEN 6
    WHEN 'suspension_notified_at' THEN 7
  END;

\echo ''
\echo '========================================='
\echo 'STEP 3: Check workflows columns'
\echo '========================================='

SELECT
  'workflows' as table_name,
  column_name,
  data_type,
  is_nullable,
  CASE
    WHEN column_name = 'team_id' THEN '✅ ALREADY EXISTS'
    ELSE '❌ MISSING'
  END as status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'workflows'
  AND column_name IN ('id', 'name', 'user_id', 'team_id', 'folder_id')
ORDER BY
  CASE column_name
    WHEN 'id' THEN 1
    WHEN 'name' THEN 2
    WHEN 'user_id' THEN 3
    WHEN 'team_id' THEN 4
    WHEN 'folder_id' THEN 5
  END;

\echo ''
\echo '========================================='
\echo 'STEP 4: Check existing functions'
\echo '========================================='

SELECT
  routine_name as function_name,
  routine_type,
  '✅ ALREADY EXISTS' as status
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'initialize_team_folders',
    'migrate_team_workflows_to_creator',
    'get_or_create_user_default_folder',
    'create_suspension_notification',
    'notify_team_owner_of_grace_period',
    'handle_team_suspension'
  )
ORDER BY routine_name;

-- Show count
SELECT
  COUNT(*) as existing_functions_count,
  6 as total_needed,
  CASE
    WHEN COUNT(*) = 6 THEN '✅ ALL EXIST'
    WHEN COUNT(*) > 0 THEN '⚠️ PARTIAL - Some exist'
    ELSE '❌ NONE EXIST - Need to create'
  END as status
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'initialize_team_folders',
    'migrate_team_workflows_to_creator',
    'get_or_create_user_default_folder',
    'create_suspension_notification',
    'notify_team_owner_of_grace_period',
    'handle_team_suspension'
  );

\echo ''
\echo '========================================='
\echo 'STEP 5: Check existing triggers'
\echo '========================================='

SELECT
  trigger_name,
  event_object_table as table_name,
  action_timing || ' ' || event_manipulation as trigger_timing,
  '✅ ALREADY EXISTS' as status
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name IN (
    'initialize_team_folders_trigger',
    'migrate_workflows_before_team_delete',
    'notify_grace_period_trigger',
    'handle_team_suspension_trigger'
  )
ORDER BY trigger_name;

-- Show count
SELECT
  COUNT(*) as existing_triggers_count,
  4 as total_needed,
  CASE
    WHEN COUNT(*) = 4 THEN '✅ ALL EXIST'
    WHEN COUNT(*) > 0 THEN '⚠️ PARTIAL - Some exist'
    ELSE '❌ NONE EXIST - Need to create'
  END as status
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name IN (
    'initialize_team_folders_trigger',
    'migrate_workflows_before_team_delete',
    'notify_grace_period_trigger',
    'handle_team_suspension_trigger'
  );

\echo ''
\echo '========================================='
\echo 'STEP 6: Check notification table'
\echo '========================================='

SELECT
  table_name,
  CASE
    WHEN table_name = 'team_suspension_notifications' THEN '✅ ALREADY EXISTS'
    ELSE '❌ MISSING'
  END as status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'team_suspension_notifications';

-- If table doesn't exist, show empty result
SELECT
  'team_suspension_notifications' as table_name,
  '❌ DOES NOT EXIST - Need to create' as status
WHERE NOT EXISTS (
  SELECT 1
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'team_suspension_notifications'
);

\echo ''
\echo '========================================='
\echo 'STEP 7: Check existing teams without folders'
\echo '========================================='

SELECT
  t.id as team_id,
  t.name as team_name,
  t.created_by as creator_user_id,
  t.created_at,
  COUNT(DISTINCT CASE WHEN wf.is_default = TRUE THEN wf.id END) as has_root_folder,
  COUNT(DISTINCT CASE WHEN wf.is_trash = TRUE THEN wf.id END) as has_trash_folder,
  CASE
    WHEN COUNT(DISTINCT CASE WHEN wf.is_default = TRUE THEN wf.id END) = 0
      THEN '⚠️ MISSING ROOT FOLDER - Will be created by migration'
    WHEN COUNT(DISTINCT CASE WHEN wf.is_trash = TRUE THEN wf.id END) = 0
      THEN '⚠️ MISSING TRASH FOLDER - Will be created by migration'
    ELSE '✅ Has both folders'
  END as status
FROM teams t
LEFT JOIN workflow_folders wf ON wf.team_id = t.id
GROUP BY t.id, t.name, t.created_by, t.created_at
ORDER BY
  CASE
    WHEN COUNT(DISTINCT CASE WHEN wf.is_default = TRUE THEN wf.id END) = 0 THEN 1
    WHEN COUNT(DISTINCT CASE WHEN wf.is_trash = TRUE THEN wf.id END) = 0 THEN 2
    ELSE 3
  END,
  t.created_at DESC;

\echo ''
\echo '========================================='
\echo 'STEP 8: Summary and Recommendations'
\echo '========================================='

-- Final summary
SELECT
  'DEPLOYMENT READINESS CHECK' as check_type,
  (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workflow_folders'
      AND column_name IN ('is_trash', 'team_id')
  ) as wf_columns_exist,
  (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'teams'
      AND column_name IN ('suspended_at', 'suspension_reason', 'grace_period_ends_at', 'suspension_notified_at')
  ) as teams_columns_exist,
  (
    SELECT COUNT(*)
    FROM information_schema.routines
    WHERE routine_schema = 'public'
      AND routine_name IN (
        'initialize_team_folders',
        'migrate_team_workflows_to_creator',
        'get_or_create_user_default_folder',
        'create_suspension_notification'
      )
  ) as functions_exist,
  (
    SELECT COUNT(*)
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
      AND trigger_name IN (
        'initialize_team_folders_trigger',
        'migrate_workflows_before_team_delete',
        'notify_grace_period_trigger',
        'handle_team_suspension_trigger'
      )
  ) as triggers_exist,
  (
    SELECT COUNT(*)
    FROM teams t
    WHERE NOT EXISTS (
      SELECT 1
      FROM workflow_folders wf
      WHERE wf.team_id = t.id
        AND wf.is_default = TRUE
    )
  ) as teams_without_folders;

\echo ''
\echo '✅ = Already exists (safe to run migrations, they will skip)'
\echo '❌ = Missing (migrations will create)'
\echo '⚠️ = Partial (migrations will complete)'
\echo ''
\echo 'NEXT STEPS:'
\echo '1. If most things exist: Migrations are SAFE to run (they use IF NOT EXISTS)'
\echo '2. If nothing exists: Run all 4 migrations in order'
\echo '3. If partial: Run migrations, they will only create what is missing'
\echo ''
\echo 'Ready to deploy!'
