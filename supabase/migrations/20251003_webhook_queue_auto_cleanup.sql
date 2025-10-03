-- Migration: Automatic cleanup of old webhook queue items
-- Created: 2025-10-03
-- Purpose: Add automatic trigger to existing cleanup function

-- Note: Database already has clean_microsoft_webhook_queue() function
-- This migration enhances it and adds an automatic trigger

-- Enhanced cleanup function (updates existing clean_microsoft_webhook_queue)
CREATE OR REPLACE FUNCTION clean_microsoft_webhook_queue()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete items with status 'done' or 'error' that are older than 7 days
  DELETE FROM microsoft_webhook_queue
  WHERE status IN ('done', 'error')
    AND created_at < NOW() - INTERVAL '7 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  -- Log the cleanup action with count
  RAISE NOTICE 'Cleaned up % old webhook queue items older than 7 days', deleted_count;
END;
$$;

-- Also clean up deduplication entries older than 7 days
CREATE OR REPLACE FUNCTION clean_microsoft_webhook_dedup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Clean up old deduplication entries
  -- Adjust table name if dedup table is named differently
  DELETE FROM microsoft_webhook_dedup
  WHERE created_at < NOW() - INTERVAL '7 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RAISE NOTICE 'Cleaned up % old webhook deduplication entries', deleted_count;
EXCEPTION
  WHEN undefined_table THEN
    -- Table doesn't exist, skip silently
    NULL;
END;
$$;

-- Create a trigger function that runs cleanup after status updates
CREATE OR REPLACE FUNCTION trigger_cleanup_webhook_queue()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  last_cleanup TIMESTAMP;
  cleanup_interval INTERVAL := '1 hour'; -- Run cleanup at most once per hour
BEGIN
  -- Only run cleanup if status changed to 'done' or 'error'
  IF NEW.status IN ('done', 'error') AND (OLD.status IS NULL OR OLD.status != NEW.status) THEN

    -- Create tracking table if it doesn't exist
    CREATE TABLE IF NOT EXISTS webhook_queue_cleanup_tracker (
      id INTEGER PRIMARY KEY DEFAULT 1,
      last_cleanup_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CHECK (id = 1) -- Ensure only one row exists
    );

    -- Insert or get last cleanup time
    INSERT INTO webhook_queue_cleanup_tracker (id, last_cleanup_at)
    VALUES (1, NOW() - INTERVAL '2 hours') -- Initialize with old time
    ON CONFLICT (id) DO NOTHING;

    -- Get the last cleanup time
    SELECT last_cleanup_at INTO last_cleanup
    FROM webhook_queue_cleanup_tracker
    WHERE id = 1;

    -- Only run cleanup if more than cleanup_interval has passed
    IF last_cleanup IS NULL OR (NOW() - last_cleanup) > cleanup_interval THEN
      -- Update the tracker
      UPDATE webhook_queue_cleanup_tracker
      SET last_cleanup_at = NOW()
      WHERE id = 1;

      -- Run the cleanup (uses existing function)
      PERFORM clean_microsoft_webhook_queue();

      -- Also clean dedup entries
      PERFORM clean_microsoft_webhook_dedup();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS webhook_queue_cleanup_trigger ON microsoft_webhook_queue;

-- Create trigger that fires after each update
CREATE TRIGGER webhook_queue_cleanup_trigger
AFTER UPDATE ON microsoft_webhook_queue
FOR EACH ROW
EXECUTE FUNCTION trigger_cleanup_webhook_queue();

-- Create an index to speed up cleanup queries (if it doesn't exist)
CREATE INDEX IF NOT EXISTS idx_webhook_queue_status_created
ON microsoft_webhook_queue(status, created_at)
WHERE status IN ('done', 'error');

-- Optional: Run initial cleanup
SELECT clean_microsoft_webhook_queue();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION clean_microsoft_webhook_queue() TO service_role;
GRANT EXECUTE ON FUNCTION clean_microsoft_webhook_dedup() TO service_role;
GRANT EXECUTE ON FUNCTION trigger_cleanup_webhook_queue() TO service_role;

-- Add helpful comments
COMMENT ON FUNCTION clean_microsoft_webhook_queue() IS 'Deletes webhook queue items with status done/error older than 7 days (enhanced with row count logging)';
COMMENT ON FUNCTION clean_microsoft_webhook_dedup() IS 'Deletes webhook deduplication entries older than 7 days';
COMMENT ON FUNCTION trigger_cleanup_webhook_queue() IS 'Trigger function that runs cleanup at most once per hour when items are marked as done/error';
COMMENT ON TRIGGER webhook_queue_cleanup_trigger ON microsoft_webhook_queue IS 'Automatically triggers cleanup of old queue items';
