-- Completely disable RLS temporarily to clear all policies
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations DISABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies
DROP POLICY IF EXISTS "Users can view organizations they are members of" ON organizations;
DROP POLICY IF EXISTS "Users can create organizations" ON organizations;
DROP POLICY IF EXISTS "Organization owners can update their organizations" ON organizations;
DROP POLICY IF EXISTS "Organization owners can delete their organizations" ON organizations;

DROP POLICY IF EXISTS "Users can view members of organizations they belong to" ON organization_members;
DROP POLICY IF EXISTS "Organization admins can manage members" ON organization_members;
DROP POLICY IF EXISTS "Users can join organizations they are invited to" ON organization_members;

DROP POLICY IF EXISTS "Organization admins can view invitations" ON organization_invitations;
DROP POLICY IF EXISTS "Organization admins can create invitations" ON organization_invitations;
DROP POLICY IF EXISTS "Organization admins can update invitations" ON organization_invitations;
DROP POLICY IF EXISTS "Organization admins can delete invitations" ON organization_invitations;

-- Re-enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- Create simple, non-recursive policies

-- Organizations: Allow users to see organizations they own or are members of
CREATE POLICY "organizations_select_policy" ON organizations
  FOR SELECT USING (
    owner_id = auth.uid() OR 
    id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- Organizations: Allow users to create organizations
CREATE POLICY "organizations_insert_policy" ON organizations
  FOR INSERT WITH CHECK (owner_id = auth.uid());

-- Organizations: Allow owners to update their organizations
CREATE POLICY "organizations_update_policy" ON organizations
  FOR UPDATE USING (owner_id = auth.uid());

-- Organizations: Allow owners to delete their organizations
CREATE POLICY "organizations_delete_policy" ON organizations
  FOR DELETE USING (owner_id = auth.uid());

-- Organization members: Allow users to see members of organizations they belong to
CREATE POLICY "organization_members_select_policy" ON organization_members
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- Organization members: Allow admins to manage members
CREATE POLICY "organization_members_all_policy" ON organization_members
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Organization invitations: Allow admins to manage invitations
CREATE POLICY "organization_invitations_all_policy" ON organization_invitations
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  ); 
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations DISABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies
DROP POLICY IF EXISTS "Users can view organizations they are members of" ON organizations;
DROP POLICY IF EXISTS "Users can create organizations" ON organizations;
DROP POLICY IF EXISTS "Organization owners can update their organizations" ON organizations;
DROP POLICY IF EXISTS "Organization owners can delete their organizations" ON organizations;

DROP POLICY IF EXISTS "Users can view members of organizations they belong to" ON organization_members;
DROP POLICY IF EXISTS "Organization admins can manage members" ON organization_members;
DROP POLICY IF EXISTS "Users can join organizations they are invited to" ON organization_members;

DROP POLICY IF EXISTS "Organization admins can view invitations" ON organization_invitations;
DROP POLICY IF EXISTS "Organization admins can create invitations" ON organization_invitations;
DROP POLICY IF EXISTS "Organization admins can update invitations" ON organization_invitations;
DROP POLICY IF EXISTS "Organization admins can delete invitations" ON organization_invitations;

-- Re-enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- Create simple, non-recursive policies

-- Organizations: Allow users to see organizations they own or are members of
CREATE POLICY "organizations_select_policy" ON organizations
  FOR SELECT USING (
    owner_id = auth.uid() OR 
    id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- Organizations: Allow users to create organizations
CREATE POLICY "organizations_insert_policy" ON organizations
  FOR INSERT WITH CHECK (owner_id = auth.uid());

-- Organizations: Allow owners to update their organizations
CREATE POLICY "organizations_update_policy" ON organizations
  FOR UPDATE USING (owner_id = auth.uid());

-- Organizations: Allow owners to delete their organizations
CREATE POLICY "organizations_delete_policy" ON organizations
  FOR DELETE USING (owner_id = auth.uid());

-- Organization members: Allow users to see members of organizations they belong to
CREATE POLICY "organization_members_select_policy" ON organization_members
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- Organization members: Allow admins to manage members
CREATE POLICY "organization_members_all_policy" ON organization_members
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Organization invitations: Allow admins to manage invitations
CREATE POLICY "organization_invitations_all_policy" ON organization_invitations
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  ); 
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations DISABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies
DROP POLICY IF EXISTS "Users can view organizations they are members of" ON organizations;
DROP POLICY IF EXISTS "Users can create organizations" ON organizations;
DROP POLICY IF EXISTS "Organization owners can update their organizations" ON organizations;
DROP POLICY IF EXISTS "Organization owners can delete their organizations" ON organizations;

DROP POLICY IF EXISTS "Users can view members of organizations they belong to" ON organization_members;
DROP POLICY IF EXISTS "Organization admins can manage members" ON organization_members;
DROP POLICY IF EXISTS "Users can join organizations they are invited to" ON organization_members;

DROP POLICY IF EXISTS "Organization admins can view invitations" ON organization_invitations;
DROP POLICY IF EXISTS "Organization admins can create invitations" ON organization_invitations;
DROP POLICY IF EXISTS "Organization admins can update invitations" ON organization_invitations;
DROP POLICY IF EXISTS "Organization admins can delete invitations" ON organization_invitations;

-- Re-enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- Create simple, non-recursive policies

-- Organizations: Allow users to see organizations they own or are members of
CREATE POLICY "organizations_select_policy" ON organizations
  FOR SELECT USING (
    owner_id = auth.uid() OR 
    id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- Organizations: Allow users to create organizations
CREATE POLICY "organizations_insert_policy" ON organizations
  FOR INSERT WITH CHECK (owner_id = auth.uid());

-- Organizations: Allow owners to update their organizations
CREATE POLICY "organizations_update_policy" ON organizations
  FOR UPDATE USING (owner_id = auth.uid());

-- Organizations: Allow owners to delete their organizations
CREATE POLICY "organizations_delete_policy" ON organizations
  FOR DELETE USING (owner_id = auth.uid());

-- Organization members: Allow users to see members of organizations they belong to
CREATE POLICY "organization_members_select_policy" ON organization_members
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- Organization members: Allow admins to manage members
CREATE POLICY "organization_members_all_policy" ON organization_members
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Organization invitations: Allow admins to manage invitations
CREATE POLICY "organization_invitations_all_policy" ON organization_invitations
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  ); 
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations DISABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies
DROP POLICY IF EXISTS "Users can view organizations they are members of" ON organizations;
DROP POLICY IF EXISTS "Users can create organizations" ON organizations;
DROP POLICY IF EXISTS "Organization owners can update their organizations" ON organizations;
DROP POLICY IF EXISTS "Organization owners can delete their organizations" ON organizations;

DROP POLICY IF EXISTS "Users can view members of organizations they belong to" ON organization_members;
DROP POLICY IF EXISTS "Organization admins can manage members" ON organization_members;
DROP POLICY IF EXISTS "Users can join organizations they are invited to" ON organization_members;

DROP POLICY IF EXISTS "Organization admins can view invitations" ON organization_invitations;
DROP POLICY IF EXISTS "Organization admins can create invitations" ON organization_invitations;
DROP POLICY IF EXISTS "Organization admins can update invitations" ON organization_invitations;
DROP POLICY IF EXISTS "Organization admins can delete invitations" ON organization_invitations;

-- Re-enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- Create simple, non-recursive policies

-- Organizations: Allow users to see organizations they own or are members of
CREATE POLICY "organizations_select_policy" ON organizations
  FOR SELECT USING (
    owner_id = auth.uid() OR 
    id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- Organizations: Allow users to create organizations
CREATE POLICY "organizations_insert_policy" ON organizations
  FOR INSERT WITH CHECK (owner_id = auth.uid());

-- Organizations: Allow owners to update their organizations
CREATE POLICY "organizations_update_policy" ON organizations
  FOR UPDATE USING (owner_id = auth.uid());

-- Organizations: Allow owners to delete their organizations
CREATE POLICY "organizations_delete_policy" ON organizations
  FOR DELETE USING (owner_id = auth.uid());

-- Organization members: Allow users to see members of organizations they belong to
CREATE POLICY "organization_members_select_policy" ON organization_members
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- Organization members: Allow admins to manage members
CREATE POLICY "organization_members_all_policy" ON organization_members
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Organization invitations: Allow admins to manage invitations
CREATE POLICY "organization_invitations_all_policy" ON organization_invitations
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  ); 
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations DISABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies
DROP POLICY IF EXISTS "Users can view organizations they are members of" ON organizations;
DROP POLICY IF EXISTS "Users can create organizations" ON organizations;
DROP POLICY IF EXISTS "Organization owners can update their organizations" ON organizations;
DROP POLICY IF EXISTS "Organization owners can delete their organizations" ON organizations;

DROP POLICY IF EXISTS "Users can view members of organizations they belong to" ON organization_members;
DROP POLICY IF EXISTS "Organization admins can manage members" ON organization_members;
DROP POLICY IF EXISTS "Users can join organizations they are invited to" ON organization_members;

DROP POLICY IF EXISTS "Organization admins can view invitations" ON organization_invitations;
DROP POLICY IF EXISTS "Organization admins can create invitations" ON organization_invitations;
DROP POLICY IF EXISTS "Organization admins can update invitations" ON organization_invitations;
DROP POLICY IF EXISTS "Organization admins can delete invitations" ON organization_invitations;

-- Re-enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- Create simple, non-recursive policies

-- Organizations: Allow users to see organizations they own or are members of
CREATE POLICY "organizations_select_policy" ON organizations
  FOR SELECT USING (
    owner_id = auth.uid() OR 
    id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- Organizations: Allow users to create organizations
CREATE POLICY "organizations_insert_policy" ON organizations
  FOR INSERT WITH CHECK (owner_id = auth.uid());

-- Organizations: Allow owners to update their organizations
CREATE POLICY "organizations_update_policy" ON organizations
  FOR UPDATE USING (owner_id = auth.uid());

-- Organizations: Allow owners to delete their organizations
CREATE POLICY "organizations_delete_policy" ON organizations
  FOR DELETE USING (owner_id = auth.uid());

-- Organization members: Allow users to see members of organizations they belong to
CREATE POLICY "organization_members_select_policy" ON organization_members
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- Organization members: Allow admins to manage members
CREATE POLICY "organization_members_all_policy" ON organization_members
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Organization invitations: Allow admins to manage invitations
CREATE POLICY "organization_invitations_all_policy" ON organization_invitations
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  ); 
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations DISABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies
DROP POLICY IF EXISTS "Users can view organizations they are members of" ON organizations;
DROP POLICY IF EXISTS "Users can create organizations" ON organizations;
DROP POLICY IF EXISTS "Organization owners can update their organizations" ON organizations;
DROP POLICY IF EXISTS "Organization owners can delete their organizations" ON organizations;

DROP POLICY IF EXISTS "Users can view members of organizations they belong to" ON organization_members;
DROP POLICY IF EXISTS "Organization admins can manage members" ON organization_members;
DROP POLICY IF EXISTS "Users can join organizations they are invited to" ON organization_members;

DROP POLICY IF EXISTS "Organization admins can view invitations" ON organization_invitations;
DROP POLICY IF EXISTS "Organization admins can create invitations" ON organization_invitations;
DROP POLICY IF EXISTS "Organization admins can update invitations" ON organization_invitations;
DROP POLICY IF EXISTS "Organization admins can delete invitations" ON organization_invitations;

-- Re-enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- Create simple, non-recursive policies

-- Organizations: Allow users to see organizations they own or are members of
CREATE POLICY "organizations_select_policy" ON organizations
  FOR SELECT USING (
    owner_id = auth.uid() OR 
    id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- Organizations: Allow users to create organizations
CREATE POLICY "organizations_insert_policy" ON organizations
  FOR INSERT WITH CHECK (owner_id = auth.uid());

-- Organizations: Allow owners to update their organizations
CREATE POLICY "organizations_update_policy" ON organizations
  FOR UPDATE USING (owner_id = auth.uid());

-- Organizations: Allow owners to delete their organizations
CREATE POLICY "organizations_delete_policy" ON organizations
  FOR DELETE USING (owner_id = auth.uid());

-- Organization members: Allow users to see members of organizations they belong to
CREATE POLICY "organization_members_select_policy" ON organization_members
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- Organization members: Allow admins to manage members
CREATE POLICY "organization_members_all_policy" ON organization_members
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Organization invitations: Allow admins to manage invitations
CREATE POLICY "organization_invitations_all_policy" ON organization_invitations
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  ); 