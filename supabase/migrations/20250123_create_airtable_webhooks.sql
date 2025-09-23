-- Create airtable_webhooks table
CREATE TABLE IF NOT EXISTS public.airtable_webhooks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  base_id TEXT NOT NULL,
  webhook_id TEXT NOT NULL,
  mac_secret_base64 TEXT,
  expiration_time TIMESTAMPTZ,
  status TEXT DEFAULT 'active',
  last_cursor INTEGER,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique webhook per user and base
  UNIQUE(user_id, base_id, webhook_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_airtable_webhooks_user_base ON public.airtable_webhooks(user_id, base_id);
CREATE INDEX IF NOT EXISTS idx_airtable_webhooks_webhook_id ON public.airtable_webhooks(webhook_id);
CREATE INDEX IF NOT EXISTS idx_airtable_webhooks_status ON public.airtable_webhooks(status);

-- Enable RLS
ALTER TABLE public.airtable_webhooks ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can only see their own webhooks
CREATE POLICY "Users can view own airtable webhooks" ON public.airtable_webhooks
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own webhooks
CREATE POLICY "Users can create own airtable webhooks" ON public.airtable_webhooks
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own webhooks
CREATE POLICY "Users can update own airtable webhooks" ON public.airtable_webhooks
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own webhooks
CREATE POLICY "Users can delete own airtable webhooks" ON public.airtable_webhooks
  FOR DELETE
  USING (auth.uid() = user_id);

-- Service role bypass
CREATE POLICY "Service role bypass" ON public.airtable_webhooks
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');