-- Create trigger_state table for storing conditional trigger state
-- This table stores the last checked value for each conditional trigger
-- to enable "value changes" detection

CREATE TABLE IF NOT EXISTS trigger_state (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL,
  last_checked_value JSONB,
  last_checked_at TIMESTAMPTZ,
  check_count BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workflow_id)
);

-- Index for fast lookups by workflow_id
CREATE INDEX IF NOT EXISTS idx_trigger_state_workflow ON trigger_state(workflow_id);

-- Index for monitoring and cleanup
CREATE INDEX IF NOT EXISTS idx_trigger_state_last_checked ON trigger_state(last_checked_at);

-- Enable RLS
ALTER TABLE trigger_state ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access trigger state for their own workflows
CREATE POLICY "Users can manage their own trigger state"
  ON trigger_state
  FOR ALL
  USING (
    workflow_id IN (
      SELECT id FROM workflows WHERE user_id = auth.uid()
    )
  );

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_trigger_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER trigger_state_updated_at
  BEFORE UPDATE ON trigger_state
  FOR EACH ROW
  EXECUTE FUNCTION update_trigger_state_updated_at();

-- Create workflow-files storage bucket for file uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('workflow-files', 'workflow-files', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for workflow-files bucket
CREATE POLICY "Users can upload files to their own folder"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'workflow-files' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can read their own files"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'workflow-files' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete their own files"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'workflow-files' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public read access for workflow files (if needed for sharing)
CREATE POLICY "Anyone can read workflow files"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'workflow-files');
