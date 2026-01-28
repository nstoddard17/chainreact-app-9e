-- Add missing columns to webhook_configs for custom webhook support
-- These columns are expected by code but were never added to the schema

-- Add trigger_type column for identifying the type of trigger
ALTER TABLE public.webhook_configs ADD COLUMN IF NOT EXISTS trigger_type TEXT;

-- Add provider_id column for identifying the provider (e.g., 'webhook', 'custom')
ALTER TABLE public.webhook_configs ADD COLUMN IF NOT EXISTS provider_id TEXT;

-- Add config column for storing webhook configuration as JSONB
ALTER TABLE public.webhook_configs ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}';

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_webhook_configs_provider_id ON public.webhook_configs(provider_id);
CREATE INDEX IF NOT EXISTS idx_webhook_configs_trigger_type ON public.webhook_configs(trigger_type);

-- Add comment explaining the table's purpose
COMMENT ON TABLE public.webhook_configs IS 'Stores custom user-created webhook configurations. Provider-managed triggers should use trigger_resources table instead.';
