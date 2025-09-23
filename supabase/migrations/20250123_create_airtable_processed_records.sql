-- Create table to track processed Airtable records
-- This prevents duplicate workflow executions
CREATE TABLE IF NOT EXISTS public.airtable_processed_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  base_id TEXT NOT NULL,
  table_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  field_count INTEGER NOT NULL, -- Number of fields when processed
  field_hash TEXT, -- Hash of field values to detect changes
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure we only process each record once per workflow
  UNIQUE(workflow_id, base_id, table_id, record_id)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_airtable_processed_workflow ON public.airtable_processed_records(workflow_id);
CREATE INDEX IF NOT EXISTS idx_airtable_processed_record ON public.airtable_processed_records(base_id, table_id, record_id);
CREATE INDEX IF NOT EXISTS idx_airtable_processed_at ON public.airtable_processed_records(processed_at);

-- Clean up old records after 30 days
CREATE OR REPLACE FUNCTION cleanup_old_airtable_records() RETURNS void AS $$
BEGIN
  DELETE FROM public.airtable_processed_records
  WHERE processed_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- No RLS needed - this table is only accessed via service role