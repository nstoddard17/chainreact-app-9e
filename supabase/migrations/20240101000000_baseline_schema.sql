-- ================================================================
-- BASELINE SCHEMA - Core Tables
-- Created: 2025-01-20
-- This migration creates the foundational tables for ChainReact
-- ================================================================

-- Note: gen_random_uuid() is available by default in Supabase

-- ================================================================
-- PROFILES TABLE
-- ================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  provider TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  ai_api_key TEXT,
  openai_api_key TEXT
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ================================================================
-- INTEGRATIONS TABLE
-- ================================================================
CREATE TABLE IF NOT EXISTS public.integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected',
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  scopes TEXT[],
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  disconnected_at TIMESTAMPTZ,
  disconnect_reason TEXT,
  UNIQUE(user_id, provider)
);

-- Enable RLS
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for integrations
CREATE POLICY "Users can view own integrations"
  ON public.integrations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own integrations"
  ON public.integrations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own integrations"
  ON public.integrations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own integrations"
  ON public.integrations FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_integrations_user_id ON public.integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_integrations_provider ON public.integrations(provider);
CREATE INDEX IF NOT EXISTS idx_integrations_status ON public.integrations(status);

-- ================================================================
-- WORKFLOWS TABLE
-- ================================================================
CREATE TABLE IF NOT EXISTS public.workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID,
  nodes JSONB NOT NULL DEFAULT '[]',
  connections JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',
  visibility TEXT DEFAULT 'private',
  executions_count INTEGER DEFAULT 0,
  created_by TEXT,
  source_template_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (status IN ('draft', 'active', 'inactive'))
);

-- Enable RLS
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;

-- RLS Policies for workflows
CREATE POLICY "Users can view own workflows"
  ON public.workflows FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own workflows"
  ON public.workflows FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own workflows"
  ON public.workflows FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own workflows"
  ON public.workflows FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workflows_user_id ON public.workflows(user_id);
CREATE INDEX IF NOT EXISTS idx_workflows_status ON public.workflows(status);
CREATE INDEX IF NOT EXISTS idx_workflows_organization_id ON public.workflows(organization_id);

-- ================================================================
-- WORKFLOW EXECUTIONS TABLE
-- ================================================================
CREATE TABLE IF NOT EXISTS public.workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error TEXT,
  trigger_data JSONB,
  execution_log JSONB DEFAULT '[]',
  result JSONB,
  is_test_mode BOOLEAN DEFAULT FALSE,
  test_session_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (status IN ('running', 'completed', 'failed', 'cancelled'))
);

-- Enable RLS
ALTER TABLE public.workflow_executions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for workflow_executions
CREATE POLICY "Users can view own workflow executions"
  ON public.workflow_executions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own workflow executions"
  ON public.workflow_executions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own workflow executions"
  ON public.workflow_executions FOR UPDATE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_id ON public.workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_user_id ON public.workflow_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON public.workflow_executions(status);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_created_at ON public.workflow_executions(created_at DESC);

-- ================================================================
-- WEBHOOK SUBSCRIPTIONS TABLE
-- ================================================================
CREATE TABLE IF NOT EXISTS public.webhook_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  webhook_url TEXT NOT NULL,
  secret TEXT,
  external_id TEXT,
  events TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB DEFAULT '{}',
  last_event_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (status IN ('active', 'inactive', 'failed'))
);

-- Enable RLS
ALTER TABLE public.webhook_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own webhook subscriptions"
  ON public.webhook_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own webhook subscriptions"
  ON public.webhook_subscriptions FOR ALL
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_workflow_id ON public.webhook_subscriptions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_user_id ON public.webhook_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_provider ON public.webhook_subscriptions(provider);

-- ================================================================
-- WEBHOOK QUEUE TABLE
-- ================================================================
CREATE TABLE IF NOT EXISTS public.webhook_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  error TEXT,
  scheduled_for TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

-- Enable RLS
ALTER TABLE public.webhook_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own webhook queue items"
  ON public.webhook_queue FOR SELECT
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_webhook_queue_status ON public.webhook_queue(status);
CREATE INDEX IF NOT EXISTS idx_webhook_queue_scheduled_for ON public.webhook_queue(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_webhook_queue_workflow_id ON public.webhook_queue(workflow_id);

-- ================================================================
-- PKCE FLOW TABLE (for OAuth)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.pkce_flow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  state TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '10 minutes')
);

-- Enable RLS
ALTER TABLE public.pkce_flow ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can manage own PKCE flows"
  ON public.pkce_flow FOR ALL
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pkce_flow_state ON public.pkce_flow(state);
CREATE INDEX IF NOT EXISTS idx_pkce_flow_expires_at ON public.pkce_flow(expires_at);

-- Auto-delete expired PKCE flows
CREATE OR REPLACE FUNCTION delete_expired_pkce_flows()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.pkce_flow WHERE expires_at < NOW();
END;
$$;

-- ================================================================
-- SUCCESS!
-- ================================================================
-- Baseline schema created successfully
-- Next migrations will build on top of this foundation
