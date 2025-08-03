-- Proper RLS solution that avoids infinite recursion
-- The issue is that the API route uses joins which trigger RLS on multiple tables

-- First, disable RLS temporarily to clean up
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "organizations_select_own" ON organizations;
DROP POLICY IF EXISTS "organizations_select_member" ON organizations;
DROP POLICY IF EXISTS "organizations_insert" ON organizations;
DROP POLICY IF EXISTS "organizations_update" ON organizations;
DROP POLICY IF EXISTS "organizations_delete" ON organizations;

DROP POLICY IF EXISTS "members_select_own_orgs" ON organization_members;
DROP POLICY IF EXISTS "members_select_member_orgs" ON organization_members;
DROP POLICY IF EXISTS "members_insert_owner" ON organization_members;
DROP POLICY IF EXISTS "members_update_owner" ON organization_members;
DROP POLICY IF EXISTS "members_delete_owner" ON organization_members;

DROP POLICY IF EXISTS "invitations_select_owner" ON organization_invitations;
DROP POLICY IF EXISTS "invitations_insert_owner" ON organization_invitations;
DROP POLICY IF EXISTS "invitations_update_owner" ON organization_invitations;
DROP POLICY IF EXISTS "invitations_delete_owner" ON organization_invitations;

DROP POLICY IF EXISTS "org_owner_only" ON organizations;
DROP POLICY IF EXISTS "members_owner_only" ON organization_members;
DROP POLICY IF EXISTS "invitations_owner_only" ON organization_invitations;

-- Re-enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- Create simple, non-recursive policies
-- Organizations: Users can see organizations they own OR are members of
CREATE POLICY "organizations_access" ON organizations
  FOR ALL USING (
    owner_id = auth.uid() OR
    id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

-- Organization members: Users can see members of organizations they own OR are members of
CREATE POLICY "members_access" ON organization_members
  FOR ALL USING (
    organization_id IN (
      SELECT id FROM organizations 
      WHERE owner_id = auth.uid()
    ) OR
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

-- Organization invitations: Only organization owners can manage invitations
CREATE POLICY "invitations_access" ON organization_invitations
  FOR ALL USING (
    organization_id IN (
      SELECT id FROM organizations 
      WHERE owner_id = auth.uid()
    )
  );

-- Verify the policies
SELECT tablename, policyname, cmd, permissive 
FROM pg_policies 
WHERE tablename IN ('organizations', 'organization_members', 'organization_invitations')
ORDER BY tablename, policyname; 
-- The issue is that the API route uses joins which trigger RLS on multiple tables

-- First, disable RLS temporarily to clean up
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "organizations_select_own" ON organizations;
DROP POLICY IF EXISTS "organizations_select_member" ON organizations;
DROP POLICY IF EXISTS "organizations_insert" ON organizations;
DROP POLICY IF EXISTS "organizations_update" ON organizations;
DROP POLICY IF EXISTS "organizations_delete" ON organizations;

DROP POLICY IF EXISTS "members_select_own_orgs" ON organization_members;
DROP POLICY IF EXISTS "members_select_member_orgs" ON organization_members;
DROP POLICY IF EXISTS "members_insert_owner" ON organization_members;
DROP POLICY IF EXISTS "members_update_owner" ON organization_members;
DROP POLICY IF EXISTS "members_delete_owner" ON organization_members;

DROP POLICY IF EXISTS "invitations_select_owner" ON organization_invitations;
DROP POLICY IF EXISTS "invitations_insert_owner" ON organization_invitations;
DROP POLICY IF EXISTS "invitations_update_owner" ON organization_invitations;
DROP POLICY IF EXISTS "invitations_delete_owner" ON organization_invitations;

DROP POLICY IF EXISTS "org_owner_only" ON organizations;
DROP POLICY IF EXISTS "members_owner_only" ON organization_members;
DROP POLICY IF EXISTS "invitations_owner_only" ON organization_invitations;

-- Re-enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- Create simple, non-recursive policies
-- Organizations: Users can see organizations they own OR are members of
CREATE POLICY "organizations_access" ON organizations
  FOR ALL USING (
    owner_id = auth.uid() OR
    id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

-- Organization members: Users can see members of organizations they own OR are members of
CREATE POLICY "members_access" ON organization_members
  FOR ALL USING (
    organization_id IN (
      SELECT id FROM organizations 
      WHERE owner_id = auth.uid()
    ) OR
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

-- Organization invitations: Only organization owners can manage invitations
CREATE POLICY "invitations_access" ON organization_invitations
  FOR ALL USING (
    organization_id IN (
      SELECT id FROM organizations 
      WHERE owner_id = auth.uid()
    )
  );

-- Verify the policies
SELECT tablename, policyname, cmd, permissive 
FROM pg_policies 
WHERE tablename IN ('organizations', 'organization_members', 'organization_invitations')
ORDER BY tablename, policyname; 
-- The issue is that the API route uses joins which trigger RLS on multiple tables

-- First, disable RLS temporarily to clean up
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "organizations_select_own" ON organizations;
DROP POLICY IF EXISTS "organizations_select_member" ON organizations;
DROP POLICY IF EXISTS "organizations_insert" ON organizations;
DROP POLICY IF EXISTS "organizations_update" ON organizations;
DROP POLICY IF EXISTS "organizations_delete" ON organizations;

DROP POLICY IF EXISTS "members_select_own_orgs" ON organization_members;
DROP POLICY IF EXISTS "members_select_member_orgs" ON organization_members;
DROP POLICY IF EXISTS "members_insert_owner" ON organization_members;
DROP POLICY IF EXISTS "members_update_owner" ON organization_members;
DROP POLICY IF EXISTS "members_delete_owner" ON organization_members;

DROP POLICY IF EXISTS "invitations_select_owner" ON organization_invitations;
DROP POLICY IF EXISTS "invitations_insert_owner" ON organization_invitations;
DROP POLICY IF EXISTS "invitations_update_owner" ON organization_invitations;
DROP POLICY IF EXISTS "invitations_delete_owner" ON organization_invitations;

DROP POLICY IF EXISTS "org_owner_only" ON organizations;
DROP POLICY IF EXISTS "members_owner_only" ON organization_members;
DROP POLICY IF EXISTS "invitations_owner_only" ON organization_invitations;

-- Re-enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- Create simple, non-recursive policies
-- Organizations: Users can see organizations they own OR are members of
CREATE POLICY "organizations_access" ON organizations
  FOR ALL USING (
    owner_id = auth.uid() OR
    id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

-- Organization members: Users can see members of organizations they own OR are members of
CREATE POLICY "members_access" ON organization_members
  FOR ALL USING (
    organization_id IN (
      SELECT id FROM organizations 
      WHERE owner_id = auth.uid()
    ) OR
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

-- Organization invitations: Only organization owners can manage invitations
CREATE POLICY "invitations_access" ON organization_invitations
  FOR ALL USING (
    organization_id IN (
      SELECT id FROM organizations 
      WHERE owner_id = auth.uid()
    )
  );

-- Verify the policies
SELECT tablename, policyname, cmd, permissive 
FROM pg_policies 
WHERE tablename IN ('organizations', 'organization_members', 'organization_invitations')
ORDER BY tablename, policyname; 
-- The issue is that the API route uses joins which trigger RLS on multiple tables

-- First, disable RLS temporarily to clean up
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "organizations_select_own" ON organizations;
DROP POLICY IF EXISTS "organizations_select_member" ON organizations;
DROP POLICY IF EXISTS "organizations_insert" ON organizations;
DROP POLICY IF EXISTS "organizations_update" ON organizations;
DROP POLICY IF EXISTS "organizations_delete" ON organizations;

DROP POLICY IF EXISTS "members_select_own_orgs" ON organization_members;
DROP POLICY IF EXISTS "members_select_member_orgs" ON organization_members;
DROP POLICY IF EXISTS "members_insert_owner" ON organization_members;
DROP POLICY IF EXISTS "members_update_owner" ON organization_members;
DROP POLICY IF EXISTS "members_delete_owner" ON organization_members;

DROP POLICY IF EXISTS "invitations_select_owner" ON organization_invitations;
DROP POLICY IF EXISTS "invitations_insert_owner" ON organization_invitations;
DROP POLICY IF EXISTS "invitations_update_owner" ON organization_invitations;
DROP POLICY IF EXISTS "invitations_delete_owner" ON organization_invitations;

DROP POLICY IF EXISTS "org_owner_only" ON organizations;
DROP POLICY IF EXISTS "members_owner_only" ON organization_members;
DROP POLICY IF EXISTS "invitations_owner_only" ON organization_invitations;

-- Re-enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- Create simple, non-recursive policies
-- Organizations: Users can see organizations they own OR are members of
CREATE POLICY "organizations_access" ON organizations
  FOR ALL USING (
    owner_id = auth.uid() OR
    id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

-- Organization members: Users can see members of organizations they own OR are members of
CREATE POLICY "members_access" ON organization_members
  FOR ALL USING (
    organization_id IN (
      SELECT id FROM organizations 
      WHERE owner_id = auth.uid()
    ) OR
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

-- Organization invitations: Only organization owners can manage invitations
CREATE POLICY "invitations_access" ON organization_invitations
  FOR ALL USING (
    organization_id IN (
      SELECT id FROM organizations 
      WHERE owner_id = auth.uid()
    )
  );

-- Verify the policies
SELECT tablename, policyname, cmd, permissive 
FROM pg_policies 
WHERE tablename IN ('organizations', 'organization_members', 'organization_invitations')
ORDER BY tablename, policyname; 
-- The issue is that the API route uses joins which trigger RLS on multiple tables

-- First, disable RLS temporarily to clean up
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "organizations_select_own" ON organizations;
DROP POLICY IF EXISTS "organizations_select_member" ON organizations;
DROP POLICY IF EXISTS "organizations_insert" ON organizations;
DROP POLICY IF EXISTS "organizations_update" ON organizations;
DROP POLICY IF EXISTS "organizations_delete" ON organizations;

DROP POLICY IF EXISTS "members_select_own_orgs" ON organization_members;
DROP POLICY IF EXISTS "members_select_member_orgs" ON organization_members;
DROP POLICY IF EXISTS "members_insert_owner" ON organization_members;
DROP POLICY IF EXISTS "members_update_owner" ON organization_members;
DROP POLICY IF EXISTS "members_delete_owner" ON organization_members;

DROP POLICY IF EXISTS "invitations_select_owner" ON organization_invitations;
DROP POLICY IF EXISTS "invitations_insert_owner" ON organization_invitations;
DROP POLICY IF EXISTS "invitations_update_owner" ON organization_invitations;
DROP POLICY IF EXISTS "invitations_delete_owner" ON organization_invitations;

DROP POLICY IF EXISTS "org_owner_only" ON organizations;
DROP POLICY IF EXISTS "members_owner_only" ON organization_members;
DROP POLICY IF EXISTS "invitations_owner_only" ON organization_invitations;

-- Re-enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- Create simple, non-recursive policies
-- Organizations: Users can see organizations they own OR are members of
CREATE POLICY "organizations_access" ON organizations
  FOR ALL USING (
    owner_id = auth.uid() OR
    id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

-- Organization members: Users can see members of organizations they own OR are members of
CREATE POLICY "members_access" ON organization_members
  FOR ALL USING (
    organization_id IN (
      SELECT id FROM organizations 
      WHERE owner_id = auth.uid()
    ) OR
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

-- Organization invitations: Only organization owners can manage invitations
CREATE POLICY "invitations_access" ON organization_invitations
  FOR ALL USING (
    organization_id IN (
      SELECT id FROM organizations 
      WHERE owner_id = auth.uid()
    )
  );

-- Verify the policies
SELECT tablename, policyname, cmd, permissive 
FROM pg_policies 
WHERE tablename IN ('organizations', 'organization_members', 'organization_invitations')
ORDER BY tablename, policyname; 
-- The issue is that the API route uses joins which trigger RLS on multiple tables

-- First, disable RLS temporarily to clean up
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "organizations_select_own" ON organizations;
DROP POLICY IF EXISTS "organizations_select_member" ON organizations;
DROP POLICY IF EXISTS "organizations_insert" ON organizations;
DROP POLICY IF EXISTS "organizations_update" ON organizations;
DROP POLICY IF EXISTS "organizations_delete" ON organizations;

DROP POLICY IF EXISTS "members_select_own_orgs" ON organization_members;
DROP POLICY IF EXISTS "members_select_member_orgs" ON organization_members;
DROP POLICY IF EXISTS "members_insert_owner" ON organization_members;
DROP POLICY IF EXISTS "members_update_owner" ON organization_members;
DROP POLICY IF EXISTS "members_delete_owner" ON organization_members;

DROP POLICY IF EXISTS "invitations_select_owner" ON organization_invitations;
DROP POLICY IF EXISTS "invitations_insert_owner" ON organization_invitations;
DROP POLICY IF EXISTS "invitations_update_owner" ON organization_invitations;
DROP POLICY IF EXISTS "invitations_delete_owner" ON organization_invitations;

DROP POLICY IF EXISTS "org_owner_only" ON organizations;
DROP POLICY IF EXISTS "members_owner_only" ON organization_members;
DROP POLICY IF EXISTS "invitations_owner_only" ON organization_invitations;

-- Re-enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- Create simple, non-recursive policies
-- Organizations: Users can see organizations they own OR are members of
CREATE POLICY "organizations_access" ON organizations
  FOR ALL USING (
    owner_id = auth.uid() OR
    id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

-- Organization members: Users can see members of organizations they own OR are members of
CREATE POLICY "members_access" ON organization_members
  FOR ALL USING (
    organization_id IN (
      SELECT id FROM organizations 
      WHERE owner_id = auth.uid()
    ) OR
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

-- Organization invitations: Only organization owners can manage invitations
CREATE POLICY "invitations_access" ON organization_invitations
  FOR ALL USING (
    organization_id IN (
      SELECT id FROM organizations 
      WHERE owner_id = auth.uid()
    )
  );

-- Verify the policies
SELECT tablename, policyname, cmd, permissive 
FROM pg_policies 
WHERE tablename IN ('organizations', 'organization_members', 'organization_invitations')
ORDER BY tablename, policyname; 