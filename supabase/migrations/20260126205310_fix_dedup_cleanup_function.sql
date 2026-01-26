-- Fix microsoft_webhook_dedup cleanup function
-- The previous migration may have failed, so this ensures proper setup

-- Add created_at column if it doesn't exist (safe to run again)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'microsoft_webhook_dedup' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE microsoft_webhook_dedup
    ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL;
  END IF;
END
$$;

-- Create index if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_microsoft_webhook_dedup_created_at
  ON microsoft_webhook_dedup(created_at);

-- Drop and recreate the cleanup function with correct signature
DROP FUNCTION IF EXISTS clean_microsoft_webhook_dedup();

CREATE FUNCTION clean_microsoft_webhook_dedup()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM microsoft_webhook_dedup
  WHERE created_at < NOW() - INTERVAL '24 hours';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
