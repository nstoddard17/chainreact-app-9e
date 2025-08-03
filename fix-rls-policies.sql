-- Drop existing RLS policies to fix infinite recursion
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

-- Recreate RLS policies with proper logic to avoid infinite recursion

-- Organizations policies
CREATE POLICY "Users can view organizations they are members of" ON organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organizations.id 
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create organizations" ON organizations
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Organization owners can update their organizations" ON organizations
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "Organization owners can delete their organizations" ON organizations
  FOR DELETE USING (owner_id = auth.uid());

-- Organization members policies (simplified to avoid recursion)
CREATE POLICY "Users can view members of organizations they belong to" ON organization_members
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Organization admins can manage members" ON organization_members
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users can join organizations they are invited to" ON organization_members
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_invitations 
      WHERE email = (
        SELECT email FROM auth.users WHERE id = auth.uid()
      )
      AND accepted_at IS NOT NULL
    )
  );

-- Organization invitations policies
CREATE POLICY "Organization admins can view invitations" ON organization_invitations
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Organization admins can create invitations" ON organization_invitations
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Organization admins can update invitations" ON organization_invitations
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Organization admins can delete invitations" ON organization_invitations
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  ); 
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

-- Recreate RLS policies with proper logic to avoid infinite recursion

-- Organizations policies
CREATE POLICY "Users can view organizations they are members of" ON organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organizations.id 
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create organizations" ON organizations
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Organization owners can update their organizations" ON organizations
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "Organization owners can delete their organizations" ON organizations
  FOR DELETE USING (owner_id = auth.uid());

-- Organization members policies (simplified to avoid recursion)
CREATE POLICY "Users can view members of organizations they belong to" ON organization_members
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Organization admins can manage members" ON organization_members
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users can join organizations they are invited to" ON organization_members
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_invitations 
      WHERE email = (
        SELECT email FROM auth.users WHERE id = auth.uid()
      )
      AND accepted_at IS NOT NULL
    )
  );

-- Organization invitations policies
CREATE POLICY "Organization admins can view invitations" ON organization_invitations
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Organization admins can create invitations" ON organization_invitations
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Organization admins can update invitations" ON organization_invitations
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Organization admins can delete invitations" ON organization_invitations
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  ); 
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

-- Recreate RLS policies with proper logic to avoid infinite recursion

-- Organizations policies
CREATE POLICY "Users can view organizations they are members of" ON organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organizations.id 
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create organizations" ON organizations
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Organization owners can update their organizations" ON organizations
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "Organization owners can delete their organizations" ON organizations
  FOR DELETE USING (owner_id = auth.uid());

-- Organization members policies (simplified to avoid recursion)
CREATE POLICY "Users can view members of organizations they belong to" ON organization_members
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Organization admins can manage members" ON organization_members
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users can join organizations they are invited to" ON organization_members
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_invitations 
      WHERE email = (
        SELECT email FROM auth.users WHERE id = auth.uid()
      )
      AND accepted_at IS NOT NULL
    )
  );

-- Organization invitations policies
CREATE POLICY "Organization admins can view invitations" ON organization_invitations
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Organization admins can create invitations" ON organization_invitations
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Organization admins can update invitations" ON organization_invitations
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Organization admins can delete invitations" ON organization_invitations
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  ); 
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

-- Recreate RLS policies with proper logic to avoid infinite recursion

-- Organizations policies
CREATE POLICY "Users can view organizations they are members of" ON organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organizations.id 
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create organizations" ON organizations
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Organization owners can update their organizations" ON organizations
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "Organization owners can delete their organizations" ON organizations
  FOR DELETE USING (owner_id = auth.uid());

-- Organization members policies (simplified to avoid recursion)
CREATE POLICY "Users can view members of organizations they belong to" ON organization_members
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Organization admins can manage members" ON organization_members
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users can join organizations they are invited to" ON organization_members
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_invitations 
      WHERE email = (
        SELECT email FROM auth.users WHERE id = auth.uid()
      )
      AND accepted_at IS NOT NULL
    )
  );

-- Organization invitations policies
CREATE POLICY "Organization admins can view invitations" ON organization_invitations
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Organization admins can create invitations" ON organization_invitations
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Organization admins can update invitations" ON organization_invitations
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Organization admins can delete invitations" ON organization_invitations
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  ); 
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

-- Recreate RLS policies with proper logic to avoid infinite recursion

-- Organizations policies
CREATE POLICY "Users can view organizations they are members of" ON organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organizations.id 
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create organizations" ON organizations
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Organization owners can update their organizations" ON organizations
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "Organization owners can delete their organizations" ON organizations
  FOR DELETE USING (owner_id = auth.uid());

-- Organization members policies (simplified to avoid recursion)
CREATE POLICY "Users can view members of organizations they belong to" ON organization_members
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Organization admins can manage members" ON organization_members
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users can join organizations they are invited to" ON organization_members
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_invitations 
      WHERE email = (
        SELECT email FROM auth.users WHERE id = auth.uid()
      )
      AND accepted_at IS NOT NULL
    )
  );

-- Organization invitations policies
CREATE POLICY "Organization admins can view invitations" ON organization_invitations
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Organization admins can create invitations" ON organization_invitations
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Organization admins can update invitations" ON organization_invitations
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Organization admins can delete invitations" ON organization_invitations
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  ); 
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

-- Recreate RLS policies with proper logic to avoid infinite recursion

-- Organizations policies
CREATE POLICY "Users can view organizations they are members of" ON organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organizations.id 
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create organizations" ON organizations
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Organization owners can update their organizations" ON organizations
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "Organization owners can delete their organizations" ON organizations
  FOR DELETE USING (owner_id = auth.uid());

-- Organization members policies (simplified to avoid recursion)
CREATE POLICY "Users can view members of organizations they belong to" ON organization_members
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Organization admins can manage members" ON organization_members
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users can join organizations they are invited to" ON organization_members
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_invitations 
      WHERE email = (
        SELECT email FROM auth.users WHERE id = auth.uid()
      )
      AND accepted_at IS NOT NULL
    )
  );

-- Organization invitations policies
CREATE POLICY "Organization admins can view invitations" ON organization_invitations
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Organization admins can create invitations" ON organization_invitations
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Organization admins can update invitations" ON organization_invitations
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Organization admins can delete invitations" ON organization_invitations
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  ); 