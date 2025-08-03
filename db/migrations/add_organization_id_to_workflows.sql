-- Add organization_id to workflows table
-- This allows workflows to be associated with organizations

-- Add organization_id column to workflows table
ALTER TABLE workflows 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

-- Add index for better performance on organization lookups
CREATE INDEX IF NOT EXISTS idx_workflows_organization_id ON workflows(organization_id);

-- Update RLS policy to allow organization members to see organization workflows
DROP POLICY IF EXISTS "Users can only see their own workflows" ON workflows;

-- New RLS policy that allows users to see:
-- 1. Their own personal workflows (organization_id IS NULL)
-- 2. Organization workflows where they are a member
CREATE POLICY "Users can see their own and organization workflows" ON workflows
  FOR ALL USING (
    user_id = auth.uid() OR 
    (organization_id IS NOT NULL AND 
     EXISTS (
       SELECT 1 FROM organization_members 
       WHERE organization_id = workflows.organization_id 
       AND user_id = auth.uid()
     ))
  );

-- Add a check constraint to ensure workflows are either personal or organization-specific
ALTER TABLE workflows 
ADD CONSTRAINT check_workflow_ownership 
CHECK (
  (organization_id IS NULL AND user_id IS NOT NULL) OR 
  (organization_id IS NOT NULL AND user_id IS NOT NULL)
);

-- Add a unique constraint to prevent duplicate workflow names within the same organization
-- (but allow same names across different organizations or personal workflows)
CREATE UNIQUE INDEX IF NOT EXISTS idx_workflows_org_name_unique 
ON workflows(organization_id, name) 
WHERE organization_id IS NOT NULL;

-- Add a unique constraint for personal workflows (organization_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_workflows_personal_name_unique 
ON workflows(user_id, name) 
WHERE organization_id IS NULL; 