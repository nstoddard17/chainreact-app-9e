-- Create google_watch_subscriptions table for managing Google API watch registrations
-- This is separate from webhook_subscriptions which is for general webhook management
CREATE TABLE IF NOT EXISTS public.google_watch_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('gmail', 'google-drive', 'google-calendar', 'google-sheets')),
  channel_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  expiration TIMESTAMPTZ NOT NULL,
  page_token TEXT, -- For Google Drive pagination
  sync_token TEXT, -- For Google Calendar incremental sync
  metadata JSONB DEFAULT '{}', -- Store provider-specific data (folderId, calendarId, spreadsheetId, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(channel_id, user_id)
);

-- Create index for querying by user and provider
CREATE INDEX IF NOT EXISTS idx_google_watch_subscriptions_user_provider ON public.google_watch_subscriptions(user_id, provider);

-- Create index for querying by expiration (for renewal jobs)
CREATE INDEX IF NOT EXISTS idx_google_watch_subscriptions_expiration ON public.google_watch_subscriptions(expiration);

-- Create index for querying by integration
CREATE INDEX IF NOT EXISTS idx_google_watch_subscriptions_integration ON public.google_watch_subscriptions(integration_id);

-- Add RLS policies
ALTER TABLE public.google_watch_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own Google watch subscriptions
CREATE POLICY "Users can view own Google watch subscriptions" ON public.google_watch_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Users can create their own Google watch subscriptions
CREATE POLICY "Users can create own Google watch subscriptions" ON public.google_watch_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own Google watch subscriptions
CREATE POLICY "Users can update own Google watch subscriptions" ON public.google_watch_subscriptions
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own Google watch subscriptions
CREATE POLICY "Users can delete own Google watch subscriptions" ON public.google_watch_subscriptions
  FOR DELETE USING (auth.uid() = user_id);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_google_watch_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_google_watch_subscriptions_updated_at
  BEFORE UPDATE ON public.google_watch_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_google_watch_subscriptions_updated_at();

-- Create table for tracking renewal failures
CREATE TABLE IF NOT EXISTS public.google_watch_renewal_failures (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subscription_id UUID REFERENCES public.google_watch_subscriptions(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  error_message TEXT,
  failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying failures
CREATE INDEX IF NOT EXISTS idx_google_watch_renewal_failures_user ON public.google_watch_renewal_failures(user_id);
CREATE INDEX IF NOT EXISTS idx_google_watch_renewal_failures_failed_at ON public.google_watch_renewal_failures(failed_at);