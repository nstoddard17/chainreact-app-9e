-- DIAGNOSTIC AND FIX for infinite recursion in workflow_permissions RLS
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/xzwsdwllmrnrgbltibxt/sql

-- ===========================
-- STEP 1: DIAGNOSE THE ISSUE
-- ===========================

-- Check if workflow_permissions table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name = 'workflow_permissions'
) as workflow_permissions_exists;

-- Check all RLS policies on workflow_permissions
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'workflow_permissions';

-- Check all RLS policies on workflows that might reference workflow_permissions
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'workflows'
  AND (qual LIKE '%workflow_permissions%' OR with_check LIKE '%workflow_permissions%');

-- ===========================
-- STEP 2: FIX THE ISSUE
-- ===========================

-- Option A: Drop workflow_permissions table if it's not needed
-- Uncomment the following line if you want to drop the table:
-- DROP TABLE IF EXISTS workflow_permissions CASCADE;

-- Option B: Disable RLS on workflow_permissions temporarily
-- Uncomment the following line to disable RLS:
-- ALTER TABLE workflow_permissions DISABLE ROW LEVEL SECURITY;

-- Option C: Drop specific problematic policies
-- First, let's drop ALL policies on workflow_permissions to break the recursion
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE tablename = 'workflow_permissions'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON workflow_permissions', pol.policyname);
  END LOOP;
END $$;

-- Now drop any policies on workflows that reference workflow_permissions
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE tablename = 'workflows'
      AND (qual LIKE '%workflow_permissions%' OR with_check LIKE '%workflow_permissions%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON workflows', pol.policyname);
  END LOOP;
END $$;

-- ===========================
-- STEP 3: RECREATE SIMPLE POLICIES
-- ===========================

-- Simple policy for workflows: users can only see their own workflows
DROP POLICY IF EXISTS "Users can view their own workflows" ON workflows;
CREATE POLICY "Users can view their own workflows"
  ON workflows
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert their own workflows" ON workflows;
CREATE POLICY "Users can insert their own workflows"
  ON workflows
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own workflows" ON workflows;
CREATE POLICY "Users can update their own workflows"
  ON workflows
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own workflows" ON workflows;
CREATE POLICY "Users can delete their own workflows"
  ON workflows
  FOR DELETE
  USING (user_id = auth.uid());

-- ===========================
-- STEP 4: VERIFY FIX
-- ===========================

-- Check that workflows table is accessible
SELECT COUNT(*) as workflow_count FROM workflows;

-- Check remaining policies
SELECT
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE tablename IN ('workflows', 'workflow_permissions')
ORDER BY tablename, policyname;
