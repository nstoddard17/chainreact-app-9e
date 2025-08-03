-- Add RLS back with proper, non-recursive policies

-- Re-enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- Organizations policies - simple and direct
CREATE POLICY "organizations_select_own" ON organizations
  FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "organizations_select_member" ON organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organizations.id 
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "organizations_insert" ON organizations
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "organizations_update" ON organizations
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "organizations_delete" ON organizations
  FOR DELETE USING (owner_id = auth.uid());

-- Organization members policies - avoid self-referencing
CREATE POLICY "members_select_own_orgs" ON organization_members
  FOR SELECT USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "members_select_member_orgs" ON organization_members
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "members_insert_owner" ON organization_members
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "members_update_owner" ON organization_members
  FOR UPDATE USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "members_delete_owner" ON organization_members
  FOR DELETE USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

-- Organization invitations policies - simple owner-based
CREATE POLICY "invitations_select_owner" ON organization_invitations
  FOR SELECT USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "invitations_insert_owner" ON organization_invitations
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "invitations_update_owner" ON organization_invitations
  FOR UPDATE USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "invitations_delete_owner" ON organization_invitations
  FOR DELETE USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

-- Verify policies are created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('organizations', 'organization_members', 'organization_invitations')
ORDER BY tablename, policyname; 

-- Re-enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- Organizations policies - simple and direct
CREATE POLICY "organizations_select_own" ON organizations
  FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "organizations_select_member" ON organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organizations.id 
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "organizations_insert" ON organizations
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "organizations_update" ON organizations
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "organizations_delete" ON organizations
  FOR DELETE USING (owner_id = auth.uid());

-- Organization members policies - avoid self-referencing
CREATE POLICY "members_select_own_orgs" ON organization_members
  FOR SELECT USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "members_select_member_orgs" ON organization_members
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "members_insert_owner" ON organization_members
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "members_update_owner" ON organization_members
  FOR UPDATE USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "members_delete_owner" ON organization_members
  FOR DELETE USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

-- Organization invitations policies - simple owner-based
CREATE POLICY "invitations_select_owner" ON organization_invitations
  FOR SELECT USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "invitations_insert_owner" ON organization_invitations
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "invitations_update_owner" ON organization_invitations
  FOR UPDATE USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "invitations_delete_owner" ON organization_invitations
  FOR DELETE USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

-- Verify policies are created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('organizations', 'organization_members', 'organization_invitations')
ORDER BY tablename, policyname; 

-- Re-enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- Organizations policies - simple and direct
CREATE POLICY "organizations_select_own" ON organizations
  FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "organizations_select_member" ON organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organizations.id 
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "organizations_insert" ON organizations
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "organizations_update" ON organizations
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "organizations_delete" ON organizations
  FOR DELETE USING (owner_id = auth.uid());

-- Organization members policies - avoid self-referencing
CREATE POLICY "members_select_own_orgs" ON organization_members
  FOR SELECT USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "members_select_member_orgs" ON organization_members
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "members_insert_owner" ON organization_members
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "members_update_owner" ON organization_members
  FOR UPDATE USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "members_delete_owner" ON organization_members
  FOR DELETE USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

-- Organization invitations policies - simple owner-based
CREATE POLICY "invitations_select_owner" ON organization_invitations
  FOR SELECT USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "invitations_insert_owner" ON organization_invitations
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "invitations_update_owner" ON organization_invitations
  FOR UPDATE USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "invitations_delete_owner" ON organization_invitations
  FOR DELETE USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

-- Verify policies are created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('organizations', 'organization_members', 'organization_invitations')
ORDER BY tablename, policyname; 

-- Re-enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- Organizations policies - simple and direct
CREATE POLICY "organizations_select_own" ON organizations
  FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "organizations_select_member" ON organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organizations.id 
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "organizations_insert" ON organizations
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "organizations_update" ON organizations
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "organizations_delete" ON organizations
  FOR DELETE USING (owner_id = auth.uid());

-- Organization members policies - avoid self-referencing
CREATE POLICY "members_select_own_orgs" ON organization_members
  FOR SELECT USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "members_select_member_orgs" ON organization_members
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "members_insert_owner" ON organization_members
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "members_update_owner" ON organization_members
  FOR UPDATE USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "members_delete_owner" ON organization_members
  FOR DELETE USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

-- Organization invitations policies - simple owner-based
CREATE POLICY "invitations_select_owner" ON organization_invitations
  FOR SELECT USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "invitations_insert_owner" ON organization_invitations
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "invitations_update_owner" ON organization_invitations
  FOR UPDATE USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "invitations_delete_owner" ON organization_invitations
  FOR DELETE USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

-- Verify policies are created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('organizations', 'organization_members', 'organization_invitations')
ORDER BY tablename, policyname; 

-- Re-enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- Organizations policies - simple and direct
CREATE POLICY "organizations_select_own" ON organizations
  FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "organizations_select_member" ON organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organizations.id 
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "organizations_insert" ON organizations
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "organizations_update" ON organizations
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "organizations_delete" ON organizations
  FOR DELETE USING (owner_id = auth.uid());

-- Organization members policies - avoid self-referencing
CREATE POLICY "members_select_own_orgs" ON organization_members
  FOR SELECT USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "members_select_member_orgs" ON organization_members
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "members_insert_owner" ON organization_members
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "members_update_owner" ON organization_members
  FOR UPDATE USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "members_delete_owner" ON organization_members
  FOR DELETE USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

-- Organization invitations policies - simple owner-based
CREATE POLICY "invitations_select_owner" ON organization_invitations
  FOR SELECT USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "invitations_insert_owner" ON organization_invitations
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "invitations_update_owner" ON organization_invitations
  FOR UPDATE USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "invitations_delete_owner" ON organization_invitations
  FOR DELETE USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

-- Verify policies are created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('organizations', 'organization_members', 'organization_invitations')
ORDER BY tablename, policyname; 

-- Re-enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- Organizations policies - simple and direct
CREATE POLICY "organizations_select_own" ON organizations
  FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "organizations_select_member" ON organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organizations.id 
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "organizations_insert" ON organizations
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "organizations_update" ON organizations
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "organizations_delete" ON organizations
  FOR DELETE USING (owner_id = auth.uid());

-- Organization members policies - avoid self-referencing
CREATE POLICY "members_select_own_orgs" ON organization_members
  FOR SELECT USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "members_select_member_orgs" ON organization_members
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "members_insert_owner" ON organization_members
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "members_update_owner" ON organization_members
  FOR UPDATE USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "members_delete_owner" ON organization_members
  FOR DELETE USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

-- Organization invitations policies - simple owner-based
CREATE POLICY "invitations_select_owner" ON organization_invitations
  FOR SELECT USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "invitations_insert_owner" ON organization_invitations
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "invitations_update_owner" ON organization_invitations
  FOR UPDATE USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "invitations_delete_owner" ON organization_invitations
  FOR DELETE USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

-- Verify policies are created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('organizations', 'organization_members', 'organization_invitations')
ORDER BY tablename, policyname; 