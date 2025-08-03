-- Temporarily disable RLS completely to get basic functionality working
-- We'll handle security in the API routes instead

-- Disable RLS on all organization tables
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies to clean up
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

-- Verify RLS is disabled
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('organizations', 'organization_members', 'organization_invitations')
ORDER BY tablename; 
-- We'll handle security in the API routes instead

-- Disable RLS on all organization tables
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies to clean up
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

-- Verify RLS is disabled
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('organizations', 'organization_members', 'organization_invitations')
ORDER BY tablename; 
-- We'll handle security in the API routes instead

-- Disable RLS on all organization tables
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies to clean up
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

-- Verify RLS is disabled
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('organizations', 'organization_members', 'organization_invitations')
ORDER BY tablename; 
-- We'll handle security in the API routes instead

-- Disable RLS on all organization tables
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies to clean up
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

-- Verify RLS is disabled
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('organizations', 'organization_members', 'organization_invitations')
ORDER BY tablename; 
-- We'll handle security in the API routes instead

-- Disable RLS on all organization tables
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies to clean up
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

-- Verify RLS is disabled
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('organizations', 'organization_members', 'organization_invitations')
ORDER BY tablename; 
-- We'll handle security in the API routes instead

-- Disable RLS on all organization tables
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies to clean up
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

-- Verify RLS is disabled
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('organizations', 'organization_members', 'organization_invitations')
ORDER BY tablename; 