-- Fix RLS policy for workflow_execution_history to allow service role insertions

-- Drop existing service role policy if it exists
DROP POLICY IF EXISTS "Service role full access" ON public.workflow_execution_history;

-- Create a more permissive service role policy
CREATE POLICY "Service role bypass all"
  ON public.workflow_execution_history
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- This allows the service role (used by webhooks) to insert execution history
-- for any user_id, which is needed for webhook-triggered workflows
