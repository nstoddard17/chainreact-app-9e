-- ChainReactV2 — live-test capture storage + atomic execution authorization
-- (WORKFLOW-LIVE-TEST-3 §10/§12).
-- system-table: workflow_live_test_sessions — already service-role only (20260811000000/1);
--   this migration only ALTERs it and adds a service-role-only function.
--
-- 1) CAPTURED EVENT COLUMNS. §10 requires the captured trigger to be durable BEFORE run
--    creation: if the capture worker crashes between "trigger_received" and authorization, the
--    payload must survive so a retry can resume the SAME authorization instead of losing the
--    event (or worse, re-capturing a second one). `captured_event` holds the canonical
--    TriggerEvent (same shape `workflow_runs.trigger_event` stores at enqueue — this table is
--    equally service-role-locked, so the payload is no more exposed here than there).
--    `trigger_preview` holds ONLY the safe preview (sender/subject/received time) the status
--    endpoint may return to the session owner; the status DTO never reads `captured_event`.
--
-- 2) ATOMIC AUTHORIZATION FUNCTION. §12 requires that one captured session yields EXACTLY one
--    canonical run under concurrency and crashes. supabase-js cannot express a multi-statement
--    transaction, and the two-phase app-level protocol has an unfixable window: the queued run
--    row would exist before the session records it, so the queue cron could claim the run
--    before the session is marked consumed — and the processor would then execute it as a SAFE
--    test (fail-closed, but a broken live test). The function does claim + insert + consume in
--    ONE transaction:
--      * SELECT ... FOR UPDATE serializes concurrent authorization attempts;
--      * a consumed session returns its existing run id (retries converge, never duplicate);
--      * the queued workflow_runs row is inserted with EXACTLY the column set
--        repositories/workflowRunsQueue.ts#createQueuedWorkflowRun writes (kept in sync by
--        tests/unit/migrations/liveTestAuthorizeRpc.test.ts) — the run then flows through the
--        UNCHANGED canonical queue processor + engine;
--      * the session is marked consumed_at + workflow_run_id + status='running' in the same
--        transaction, satisfying the consumed⇒run CHECK from 20260811000000.
--    The run row is inserted `is_test = true` (a live test IS recorded as a test run) with
--    `triggered_by = 'test'`; the queue processor recognizes the consumed session by run id and
--    elevates execution (real handlers, draft definition) WITHOUT trusting any client input.
--
-- SECURITY: EXECUTE is revoked from PUBLIC/anon/authenticated and granted to service_role only.
-- A browser can never reach this function; only the server-side authorization service calls it.
--
-- ROLLBACK (additive):
--   DROP FUNCTION public.authorize_live_test_run(uuid, uuid, timestamptz);
--   ALTER TABLE public.workflow_live_test_sessions
--     DROP COLUMN captured_event, DROP COLUMN trigger_preview;

ALTER TABLE public.workflow_live_test_sessions
  ADD COLUMN IF NOT EXISTS captured_event jsonb,
  ADD COLUMN IF NOT EXISTS trigger_preview jsonb;

CREATE OR REPLACE FUNCTION public.authorize_live_test_run(
  p_session_id uuid,
  p_run_id uuid,
  p_enqueued_at timestamptz
) RETURNS TABLE (outcome text, run_id uuid)
LANGUAGE plpgsql
AS $$
DECLARE
  s public.workflow_live_test_sessions%ROWTYPE;
BEGIN
  SELECT * INTO s
    FROM public.workflow_live_test_sessions
   WHERE id = p_session_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid; RETURN;
  END IF;

  -- Retry / duplicate-capture / concurrent-authorization convergence: a consumed session
  -- ALWAYS answers with the one run it already authorized. Never a second run.
  IF s.consumed_at IS NOT NULL THEN
    RETURN QUERY SELECT 'already_authorized'::text, s.workflow_run_id; RETURN;
  END IF;

  IF s.cancelled_at IS NOT NULL OR s.status IN ('cancelled') THEN
    RETURN QUERY SELECT 'cancelled'::text, NULL::uuid; RETURN;
  END IF;

  IF s.status = 'expired' OR s.expires_at <= now() THEN
    RETURN QUERY SELECT 'expired'::text, NULL::uuid; RETURN;
  END IF;

  -- Only a session holding a durable captured trigger may authorize execution.
  IF s.status <> 'trigger_received' THEN
    RETURN QUERY SELECT 'not_eligible'::text, NULL::uuid; RETURN;
  END IF;

  IF s.captured_event IS NULL THEN
    RETURN QUERY SELECT 'missing_captured_event'::text, NULL::uuid; RETURN;
  END IF;

  -- Canonical queued run row — the EXACT column set createQueuedWorkflowRun writes
  -- (repositories/workflowRunsQueue.ts). The unchanged processor + engine execute it.
  INSERT INTO public.workflow_runs (
    id, workflow_id, account_id, triggered_by_user_id, status,
    trigger_node_id, trigger_event, steps, started_at, finished_at,
    is_test, triggered_by, triggered_by_api_key_id, triggered_by_api_key_prefix,
    estimated_task_cost, actual_task_cost, task_cost_policy_version, revision_id
  ) VALUES (
    p_run_id, s.workflow_id, s.account_id, s.user_id, 'queued',
    s.trigger_node_id, s.captured_event, '[]'::jsonb, p_enqueued_at, NULL,
    true, 'test', NULL, NULL,
    NULL, NULL, NULL, NULL
  );

  UPDATE public.workflow_live_test_sessions
     SET status = 'running',
         execution_authorized_at = now(),
         consumed_at = now(),
         workflow_run_id = p_run_id
   WHERE id = p_session_id;

  RETURN QUERY SELECT 'authorized'::text, p_run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.authorize_live_test_run(uuid, uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.authorize_live_test_run(uuid, uuid, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.authorize_live_test_run(uuid, uuid, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_live_test_run(uuid, uuid, timestamptz) TO service_role;
