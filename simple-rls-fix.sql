-- Simple RLS fix - avoid any potential recursion
-- Disable RLS first
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

-- Re-enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- Create ONLY owner-based policies (no cross-table references)
-- Organizations: Only owners can access their organizations
CREATE POLICY "org_owner_only" ON organizations
  FOR ALL USING (owner_id = auth.uid());

-- Organization members: Only organization owners can manage members
CREATE POLICY "members_owner_only" ON organization_members
  FOR ALL USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

-- Organization invitations: Only organization owners can manage invitations
CREATE POLICY "invitations_owner_only" ON organization_invitations
  FOR ALL USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

-- Verify policies
SELECT tablename, policyname, cmd, permissive 
FROM pg_policies 
WHERE tablename IN ('organizations', 'organization_members', 'organization_invitations')
ORDER BY tablename, policyname; 
-- Disable RLS first
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

-- Re-enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- Create ONLY owner-based policies (no cross-table references)
-- Organizations: Only owners can access their organizations
CREATE POLICY "org_owner_only" ON organizations
  FOR ALL USING (owner_id = auth.uid());

-- Organization members: Only organization owners can manage members
CREATE POLICY "members_owner_only" ON organization_members
  FOR ALL USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

-- Organization invitations: Only organization owners can manage invitations
CREATE POLICY "invitations_owner_only" ON organization_invitations
  FOR ALL USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

-- Verify policies
SELECT tablename, policyname, cmd, permissive 
FROM pg_policies 
WHERE tablename IN ('organizations', 'organization_members', 'organization_invitations')
ORDER BY tablename, policyname; 
-- Disable RLS first
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

-- Re-enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- Create ONLY owner-based policies (no cross-table references)
-- Organizations: Only owners can access their organizations
CREATE POLICY "org_owner_only" ON organizations
  FOR ALL USING (owner_id = auth.uid());

-- Organization members: Only organization owners can manage members
CREATE POLICY "members_owner_only" ON organization_members
  FOR ALL USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

-- Organization invitations: Only organization owners can manage invitations
CREATE POLICY "invitations_owner_only" ON organization_invitations
  FOR ALL USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

-- Verify policies
SELECT tablename, policyname, cmd, permissive 
FROM pg_policies 
WHERE tablename IN ('organizations', 'organization_members', 'organization_invitations')
ORDER BY tablename, policyname; 
-- Disable RLS first
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

-- Re-enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- Create ONLY owner-based policies (no cross-table references)
-- Organizations: Only owners can access their organizations
CREATE POLICY "org_owner_only" ON organizations
  FOR ALL USING (owner_id = auth.uid());

-- Organization members: Only organization owners can manage members
CREATE POLICY "members_owner_only" ON organization_members
  FOR ALL USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

-- Organization invitations: Only organization owners can manage invitations
CREATE POLICY "invitations_owner_only" ON organization_invitations
  FOR ALL USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

-- Verify policies
SELECT tablename, policyname, cmd, permissive 
FROM pg_policies 
WHERE tablename IN ('organizations', 'organization_members', 'organization_invitations')
ORDER BY tablename, policyname; 
-- Disable RLS first
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

-- Re-enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- Create ONLY owner-based policies (no cross-table references)
-- Organizations: Only owners can access their organizations
CREATE POLICY "org_owner_only" ON organizations
  FOR ALL USING (owner_id = auth.uid());

-- Organization members: Only organization owners can manage members
CREATE POLICY "members_owner_only" ON organization_members
  FOR ALL USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

-- Organization invitations: Only organization owners can manage invitations
CREATE POLICY "invitations_owner_only" ON organization_invitations
  FOR ALL USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

-- Verify policies
SELECT tablename, policyname, cmd, permissive 
FROM pg_policies 
WHERE tablename IN ('organizations', 'organization_members', 'organization_invitations')
ORDER BY tablename, policyname; 
-- Disable RLS first
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

-- Re-enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- Create ONLY owner-based policies (no cross-table references)
-- Organizations: Only owners can access their organizations
CREATE POLICY "org_owner_only" ON organizations
  FOR ALL USING (owner_id = auth.uid());

-- Organization members: Only organization owners can manage members
CREATE POLICY "members_owner_only" ON organization_members
  FOR ALL USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

-- Organization invitations: Only organization owners can manage invitations
CREATE POLICY "invitations_owner_only" ON organization_invitations
  FOR ALL USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

-- Verify policies
SELECT tablename, policyname, cmd, permissive 
FROM pg_policies 
WHERE tablename IN ('organizations', 'organization_members', 'organization_invitations')
ORDER BY tablename, policyname; 