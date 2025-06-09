-- Combine all necessary schema changes into a single file

-- Fix integrations table
ALTER TABLE IF EXISTS integrations 
ALTER COLUMN access_token TYPE TEXT;

ALTER TABLE IF EXISTS integrations 
ALTER COLUMN refresh_token TYPE TEXT;

-- Add unique constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'integrations_user_id_provider_key'
  ) THEN
    ALTER TABLE integrations 
    ADD CONSTRAINT integrations_user_id_provider_key 
    UNIQUE (user_id, provider);
  END IF;
END
$$;

-- Add status column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'integrations' AND column_name = 'status'
  ) THEN
    ALTER TABLE integrations 
    ADD COLUMN status TEXT NOT NULL DEFAULT 'connected';
  END IF;
END
$$;

-- Add scopes column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'integrations' AND column_name = 'scopes'
  ) THEN
    ALTER TABLE integrations 
    ADD COLUMN scopes TEXT[] NULL;
  END IF;
END
$$;

-- Add metadata column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'integrations' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE integrations 
    ADD COLUMN metadata JSONB NOT NULL DEFAULT '{}';
  END IF;
END
$$;

-- Add index on user_id and provider
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_integrations_user_id_provider'
  ) THEN
    CREATE INDEX idx_integrations_user_id_provider 
    ON integrations(user_id, provider);
  END IF;
END
$$;

-- Fix any duplicate entries
WITH duplicates AS (
  SELECT 
    user_id, 
    provider, 
    MAX(updated_at) as latest_updated_at,
    array_agg(id ORDER BY updated_at DESC) as ids
  FROM integrations
  GROUP BY user_id, provider
  HAVING COUNT(*) > 1
)
DELETE FROM integrations
WHERE id IN (
  SELECT unnest(ids[2:array_length(ids, 1)])
  FROM duplicates
);

-- Add an index for better performance on token lookups
CREATE INDEX IF NOT EXISTS idx_integrations_provider_user 
ON integrations(provider, user_id) 
WHERE status = 'connected';

-- Enable RLS on workflows table
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for workflows - users can only see their own workflows
CREATE POLICY "Users can only see their own workflows" ON workflows
  FOR ALL USING (auth.uid() = user_id);

-- Create templates table
CREATE TABLE IF NOT EXISTS templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  workflow_json JSONB NOT NULL,
  category VARCHAR(100),
  tags TEXT[],
  created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on templates table
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

-- RLS policies for templates
CREATE POLICY "Users can see public templates and their own" ON templates
  FOR SELECT USING (is_public = true OR auth.uid() = created_by);

CREATE POLICY "Users can create their own templates" ON templates
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own templates" ON templates
  FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own templates" ON templates
  FOR DELETE USING (auth.uid() = created_by);

-- Create workflow sharing table for collaboration
CREATE TABLE IF NOT EXISTS workflow_shares (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  shared_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_with UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  permission VARCHAR(20) DEFAULT 'view' CHECK (permission IN ('view', 'edit')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(workflow_id, shared_with)
);

-- Enable RLS on workflow_shares
ALTER TABLE workflow_shares ENABLE ROW LEVEL SECURITY;

-- RLS policies for workflow sharing
CREATE POLICY "Users can see shares involving them" ON workflow_shares
  FOR SELECT USING (auth.uid() = shared_by OR auth.uid() = shared_with);

CREATE POLICY "Users can create shares for their workflows" ON workflow_shares
  FOR INSERT WITH CHECK (
    auth.uid() = shared_by AND 
    EXISTS (SELECT 1 FROM workflows WHERE id = workflow_id AND user_id = auth.uid())
  );

-- Create AI chat history table
CREATE TABLE IF NOT EXISTS ai_chat_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  response TEXT NOT NULL,
  context JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on AI chat history
ALTER TABLE ai_chat_history ENABLE ROW LEVEL SECURITY;

-- RLS policy for AI chat history
CREATE POLICY "Users can only see their own chat history" ON ai_chat_history
  FOR ALL USING (auth.uid() = user_id);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_workflows_user_id ON workflows(user_id);
CREATE INDEX IF NOT EXISTS idx_templates_public ON templates(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);
CREATE INDEX IF NOT EXISTS idx_workflow_shares_shared_with ON workflow_shares(shared_with);
CREATE INDEX IF NOT EXISTS idx_ai_chat_user_id ON ai_chat_history(user_id);

-- Create token_audit_log table for security tracking
CREATE TABLE IF NOT EXISTS token_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  provider VARCHAR(100) NOT NULL,
  action VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on token_audit_log
ALTER TABLE token_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS policy for token_audit_log
CREATE POLICY "Users can only see their own token audit logs" ON token_audit_log
  FOR SELECT USING (auth.uid() = user_id);

-- Add index for token audit logs
CREATE INDEX IF NOT EXISTS idx_token_audit_user_provider ON token_audit_log(user_id, provider);
