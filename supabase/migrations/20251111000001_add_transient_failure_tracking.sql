-- ================================================================
-- TRANSIENT FAILURE TRACKING
-- Created: 2025-11-11
-- Purpose: Add column to track transient failures (rate limits, network issues)
--          separately from permanent auth failures
-- ================================================================

-- Add consecutive_transient_failures column
ALTER TABLE public.integrations
ADD COLUMN IF NOT EXISTS consecutive_transient_failures INTEGER DEFAULT 0;

-- Add comment explaining the difference
COMMENT ON COLUMN public.integrations.consecutive_transient_failures IS
'Tracks consecutive transient failures (rate limits, network errors, 5xx) separately from auth failures. Resets to 0 on successful refresh.';

COMMENT ON COLUMN public.integrations.consecutive_failures IS
'Tracks consecutive permanent auth failures (401, 403, invalid_grant). Resets to 0 on successful refresh. Integration marked as needs_reauthorization after 3 failures.';

-- Add index for querying integrations with high transient failures
CREATE INDEX IF NOT EXISTS idx_integrations_transient_failures
ON public.integrations(consecutive_transient_failures)
WHERE consecutive_transient_failures > 0;
