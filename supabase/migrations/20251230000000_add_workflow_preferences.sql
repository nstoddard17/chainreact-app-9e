-- Add workflow_preferences table for storing user's default provider and configuration choices
-- Used by the AI agent workflow builder to remember user preferences

CREATE TABLE IF NOT EXISTS public.workflow_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Provider defaults by category
  default_email_provider TEXT,
  default_calendar_provider TEXT,
  default_storage_provider TEXT,
  default_notification_provider TEXT,
  default_crm_provider TEXT,
  default_spreadsheet_provider TEXT,
  default_database_provider TEXT,

  -- Channel/resource defaults (JSONB for flexibility)
  -- e.g., { "slack": "C123456", "discord": "789012", "notion": "db-id-123" }
  default_channels JSONB DEFAULT '{}',

  -- Node configuration defaults (JSONB)
  -- e.g., { "gmail_trigger": { "filter": "all" }, "slack_action": { "format": "detailed" } }
  node_config_defaults JSONB DEFAULT '{}',

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Each user has one preferences record
  CONSTRAINT unique_user_workflow_preferences UNIQUE (user_id)
);

-- Performance index
CREATE INDEX IF NOT EXISTS idx_workflow_preferences_user_id ON public.workflow_preferences(user_id);

-- Enable RLS
ALTER TABLE public.workflow_preferences ENABLE ROW LEVEL SECURITY;

-- RLS policies - users can only manage their own preferences
DO $$ BEGIN
  CREATE POLICY "workflow_preferences_select_policy" ON public.workflow_preferences
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "workflow_preferences_insert_policy" ON public.workflow_preferences
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "workflow_preferences_update_policy" ON public.workflow_preferences
    FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "workflow_preferences_delete_policy" ON public.workflow_preferences
    FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_workflow_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS workflow_preferences_updated_at ON public.workflow_preferences;
CREATE TRIGGER workflow_preferences_updated_at
  BEFORE UPDATE ON public.workflow_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_workflow_preferences_updated_at();
