-- Safe teams migration - handles existing objects gracefully
-- This creates a hierarchical structure: Organization -> Teams -> Members -> Workflows

-- Teams table
CREATE TABLE IF NOT EXISTS teams (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    slug VARCHAR(255) NOT NULL,
    color VARCHAR(7) DEFAULT '#3B82F6', -- Hex color for team identification
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, slug)
);

-- Team members table (many-to-many relationship)
CREATE TABLE IF NOT EXISTS team_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'editor', 'member', 'viewer')),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(team_id, user_id)
);

-- Team workflows table (workflows created by teams)
CREATE TABLE IF NOT EXISTS team_workflows (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    workflow_data JSONB NOT NULL,
    is_public BOOLEAN DEFAULT FALSE, -- Whether other teams can see this workflow
    shared_with_teams UUID[] DEFAULT '{}', -- Array of team IDs this workflow is shared with
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Team templates table (templates created by teams)
CREATE TABLE IF NOT EXISTS team_templates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    template_data JSONB NOT NULL,
    is_public BOOLEAN DEFAULT FALSE, -- Whether other teams can see this template
    shared_with_teams UUID[] DEFAULT '{}', -- Array of team IDs this template is shared with
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance (IF NOT EXISTS not supported for indexes, so we'll handle errors)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_teams_organization_id') THEN
        CREATE INDEX idx_teams_organization_id ON teams(organization_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_teams_slug') THEN
        CREATE INDEX idx_teams_slug ON teams(slug);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_team_members_team_id') THEN
        CREATE INDEX idx_team_members_team_id ON team_members(team_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_team_members_user_id') THEN
        CREATE INDEX idx_team_members_user_id ON team_members(user_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_team_workflows_team_id') THEN
        CREATE INDEX idx_team_workflows_team_id ON team_workflows(team_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_team_workflows_created_by') THEN
        CREATE INDEX idx_team_workflows_created_by ON team_workflows(created_by);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_team_templates_team_id') THEN
        CREATE INDEX idx_team_templates_team_id ON team_templates(team_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_team_templates_created_by') THEN
        CREATE INDEX idx_team_templates_created_by ON team_templates(created_by);
    END IF;
END $$;

-- Create updated_at function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers safely
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_teams_updated_at') THEN
        CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON teams
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_team_workflows_updated_at') THEN
        CREATE TRIGGER update_team_workflows_updated_at BEFORE UPDATE ON team_workflows
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_team_templates_updated_at') THEN
        CREATE TRIGGER update_team_templates_updated_at BEFORE UPDATE ON team_templates
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- Enable RLS
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_templates ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "teams_select_organization_member" ON teams;
DROP POLICY IF EXISTS "teams_insert_organization_admin" ON teams;
DROP POLICY IF EXISTS "teams_update_organization_admin" ON teams;
DROP POLICY IF EXISTS "teams_delete_organization_admin" ON teams;

DROP POLICY IF EXISTS "team_members_select_team_member" ON team_members;
DROP POLICY IF EXISTS "team_members_insert_team_admin" ON team_members;
DROP POLICY IF EXISTS "team_members_update_team_admin" ON team_members;
DROP POLICY IF EXISTS "team_members_delete_team_admin" ON team_members;

DROP POLICY IF EXISTS "team_workflows_select_team_member" ON team_workflows;
DROP POLICY IF EXISTS "team_workflows_insert_team_member" ON team_workflows;
DROP POLICY IF EXISTS "team_workflows_update_team_member" ON team_workflows;
DROP POLICY IF EXISTS "team_workflows_delete_team_admin" ON team_workflows;

DROP POLICY IF EXISTS "team_templates_select_team_member" ON team_templates;
DROP POLICY IF EXISTS "team_templates_insert_team_member" ON team_templates;
DROP POLICY IF EXISTS "team_templates_update_team_member" ON team_templates;
DROP POLICY IF EXISTS "team_templates_delete_team_admin" ON team_templates;

-- RLS Policies for teams
CREATE POLICY "teams_select_organization_member" ON teams
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "teams_insert_organization_admin" ON teams
    FOR INSERT WITH CHECK (
        organization_id IN (
            SELECT id FROM organizations WHERE owner_id = auth.uid()
        )
    );

CREATE POLICY "teams_update_organization_admin" ON teams
    FOR UPDATE USING (
        organization_id IN (
            SELECT id FROM organizations WHERE owner_id = auth.uid()
        )
    );

CREATE POLICY "teams_delete_organization_admin" ON teams
    FOR DELETE USING (
        organization_id IN (
            SELECT id FROM organizations WHERE owner_id = auth.uid()
        )
    );

-- RLS Policies for team_members
CREATE POLICY "team_members_select_team_member" ON team_members
    FOR SELECT USING (
        team_id IN (
            SELECT id FROM teams WHERE organization_id IN (
                SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
            )
        )
    );

CREATE POLICY "team_members_insert_team_admin" ON team_members
    FOR INSERT WITH CHECK (
        team_id IN (
            SELECT id FROM teams WHERE organization_id IN (
                SELECT id FROM organizations WHERE owner_id = auth.uid()
            )
        )
    );

CREATE POLICY "team_members_update_team_admin" ON team_members
    FOR UPDATE USING (
        team_id IN (
            SELECT id FROM teams WHERE organization_id IN (
                SELECT id FROM organizations WHERE owner_id = auth.uid()
            )
        )
    );

CREATE POLICY "team_members_delete_team_admin" ON team_members
    FOR DELETE USING (
        team_id IN (
            SELECT id FROM teams WHERE organization_id IN (
                SELECT id FROM organizations WHERE owner_id = auth.uid()
            )
        )
    );

-- RLS Policies for team_workflows
CREATE POLICY "team_workflows_select_team_member" ON team_workflows
    FOR SELECT USING (
        team_id IN (
            SELECT team_id FROM team_members WHERE user_id = auth.uid()
        ) OR
        is_public = TRUE OR
        auth.uid() = ANY(shared_with_teams)
    );

CREATE POLICY "team_workflows_insert_team_member" ON team_workflows
    FOR INSERT WITH CHECK (
        team_id IN (
            SELECT team_id FROM team_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "team_workflows_update_team_member" ON team_workflows
    FOR UPDATE USING (
        team_id IN (
            SELECT team_id FROM team_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "team_workflows_delete_team_admin" ON team_workflows
    FOR DELETE USING (
        team_id IN (
            SELECT team_id FROM team_members WHERE user_id = auth.uid() AND role IN ('admin', 'editor')
        )
    );

-- RLS Policies for team_templates
CREATE POLICY "team_templates_select_team_member" ON team_templates
    FOR SELECT USING (
        team_id IN (
            SELECT team_id FROM team_members WHERE user_id = auth.uid()
        ) OR
        is_public = TRUE OR
        auth.uid() = ANY(shared_with_teams)
    );

CREATE POLICY "team_templates_insert_team_member" ON team_templates
    FOR INSERT WITH CHECK (
        team_id IN (
            SELECT team_id FROM team_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "team_templates_update_team_member" ON team_templates
    FOR UPDATE USING (
        team_id IN (
            SELECT team_id FROM team_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "team_templates_delete_team_admin" ON team_templates
    FOR DELETE USING (
        team_id IN (
            SELECT team_id FROM team_members WHERE user_id = auth.uid() AND role IN ('admin', 'editor')
        )
    );

-- Verify tables and policies
SELECT tablename, policyname, cmd, permissive 
FROM pg_policies 
WHERE tablename IN ('teams', 'team_members', 'team_workflows', 'team_templates')
ORDER BY tablename, policyname; 