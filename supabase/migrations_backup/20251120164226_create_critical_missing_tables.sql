-- =====================================================
-- CREATE CRITICAL MISSING TABLES
-- =====================================================
-- Based on database analysis, these tables are heavily
-- referenced in code but missing from migrations
-- =====================================================

BEGIN;

-- =====================================================
-- TRIGGER_RESOURCES TABLE (100+ references in code)
-- =====================================================
-- Stores external trigger resources (webhooks, subscriptions, etc.)

-- Drop table if exists to ensure clean slate
DROP TABLE IF EXISTS public.trigger_resources CASCADE;

CREATE TABLE public.trigger_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES public.workflows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  status TEXT DEFAULT 'active',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(provider, resource_type, resource_id)
);

CREATE INDEX idx_trigger_resources_workflow_id ON public.trigger_resources(workflow_id);
CREATE INDEX idx_trigger_resources_user_id ON public.trigger_resources(user_id);
CREATE INDEX idx_trigger_resources_provider ON public.trigger_resources(provider);
CREATE INDEX idx_trigger_resources_status ON public.trigger_resources(status);

ALTER TABLE public.trigger_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own trigger resources"
  ON public.trigger_resources FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- WEBHOOK_CONFIGS TABLE (54 references in code)
-- =====================================================

DROP TABLE IF EXISTS public.webhook_configs CASCADE;

CREATE TABLE public.webhook_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES public.workflows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  webhook_url TEXT NOT NULL,
  secret TEXT,
  events TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'active',
  metadata JSONB DEFAULT '{}',
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhook_configs_workflow_id ON public.webhook_configs(workflow_id);
CREATE INDEX idx_webhook_configs_user_id ON public.webhook_configs(user_id);
CREATE INDEX idx_webhook_configs_provider ON public.webhook_configs(provider);

ALTER TABLE public.webhook_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own webhook configs"
  ON public.webhook_configs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- GOOGLE_WATCH_SUBSCRIPTIONS TABLE (23 references)
-- =====================================================

DROP TABLE IF EXISTS public.google_watch_subscriptions CASCADE;

CREATE TABLE public.google_watch_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES public.workflows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_address TEXT NOT NULL,
  history_id TEXT NOT NULL,
  expiration TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'active',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_google_watch_workflow_id ON public.google_watch_subscriptions(workflow_id);
CREATE INDEX idx_google_watch_user_id ON public.google_watch_subscriptions(user_id);
CREATE INDEX idx_google_watch_expiration ON public.google_watch_subscriptions(expiration);

ALTER TABLE public.google_watch_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own google watch subscriptions"
  ON public.google_watch_subscriptions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- MICROSOFT_GRAPH_SUBSCRIPTIONS TABLE (11 references)
-- =====================================================

DROP TABLE IF EXISTS public.microsoft_graph_subscriptions CASCADE;

CREATE TABLE public.microsoft_graph_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES public.workflows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id TEXT NOT NULL,
  resource TEXT NOT NULL,
  change_type TEXT NOT NULL,
  expiration_datetime TIMESTAMPTZ NOT NULL,
  client_state TEXT,
  notification_url TEXT,
  status TEXT DEFAULT 'active',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(subscription_id)
);

CREATE INDEX idx_ms_graph_workflow_id ON public.microsoft_graph_subscriptions(workflow_id);
CREATE INDEX idx_ms_graph_user_id ON public.microsoft_graph_subscriptions(user_id);
CREATE INDEX idx_ms_graph_expiration ON public.microsoft_graph_subscriptions(expiration_datetime);

ALTER TABLE public.microsoft_graph_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own microsoft graph subscriptions"
  ON public.microsoft_graph_subscriptions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- WORKFLOW_VARIABLES TABLE
-- =====================================================

DROP TABLE IF EXISTS public.workflow_variables CASCADE;

CREATE TABLE public.workflow_variables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value TEXT,
  type TEXT DEFAULT 'string',
  is_secret BOOLEAN DEFAULT false,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workflow_id, name)
);

CREATE INDEX idx_workflow_variables_workflow_id ON public.workflow_variables(workflow_id);

ALTER TABLE public.workflow_variables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage workflow variables"
  ON public.workflow_variables FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workflows w
      WHERE w.id = workflow_variables.workflow_id
      AND w.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workflows w
      WHERE w.id = workflow_variables.workflow_id
      AND w.owner_id = auth.uid()
    )
  );

COMMIT;

-- =====================================================
-- POST-MIGRATION NOTES
-- =====================================================
-- These tables support critical workflow functionality:
--
-- 1. trigger_resources: Generic trigger resource tracking
-- 2. webhook_configs: Central webhook management
-- 3. google_watch_subscriptions: Gmail push notifications
-- 4. microsoft_graph_subscriptions: Outlook/Teams webhooks
-- 5. workflow_variables: User-defined workflow configuration
--
-- All tables use DROP TABLE IF EXISTS to ensure clean creation.
-- All tables have RLS enabled with simplified policies.
-- =====================================================
