-- Create integration_metadata table for Phase 2: Database-backed provider cache
-- This table stores provider-level data (bases, tables, fields) for instant loading

CREATE TABLE IF NOT EXISTS public.integration_metadata (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL, -- 'airtable', 'notion', etc.
  data_type TEXT NOT NULL, -- 'bases', 'tables', 'fields'
  parent_id TEXT, -- e.g., baseId for tables, tableId for fields
  data JSONB NOT NULL, -- The actual cached data
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- When this cache expires

  -- Constraints
  CONSTRAINT integration_metadata_data_type_check
    CHECK (data_type IN ('bases', 'tables', 'fields'))
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_integration_metadata_user_provider
  ON public.integration_metadata(user_id, provider_id);

CREATE INDEX IF NOT EXISTS idx_integration_metadata_lookup
  ON public.integration_metadata(user_id, provider_id, data_type, parent_id);

CREATE INDEX IF NOT EXISTS idx_integration_metadata_expires
  ON public.integration_metadata(expires_at)
  WHERE expires_at IS NOT NULL;

-- RLS Policies
ALTER TABLE public.integration_metadata ENABLE ROW LEVEL SECURITY;

-- Users can only see their own integration metadata
CREATE POLICY "Users can view own integration metadata"
  ON public.integration_metadata
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own integration metadata
CREATE POLICY "Users can insert own integration metadata"
  ON public.integration_metadata
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own integration metadata
CREATE POLICY "Users can update own integration metadata"
  ON public.integration_metadata
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own integration metadata
CREATE POLICY "Users can delete own integration metadata"
  ON public.integration_metadata
  FOR DELETE
  USING (auth.uid() = user_id);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_integration_metadata_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER trigger_update_integration_metadata_updated_at
  BEFORE UPDATE ON public.integration_metadata
  FOR EACH ROW
  EXECUTE FUNCTION public.update_integration_metadata_updated_at();

-- Function to clean up expired cache entries
CREATE OR REPLACE FUNCTION public.clean_expired_integration_metadata()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.integration_metadata
  WHERE expires_at IS NOT NULL AND expires_at < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.clean_expired_integration_metadata() TO authenticated;

-- Comment on table
COMMENT ON TABLE public.integration_metadata IS
  'Stores provider-level cached data (bases, tables, fields) for instant modal loading. Part of Phase 2 performance optimization.';
