-- ChainReactV2 — durable live-test sessions (WORKFLOW-LIVE-TEST-2 §1/§5).
-- system-table: workflow_live_test_sessions — server-issued single-use authorization for ONE
--   consented live test run; service-role only, never readable or writable by a client.
--
-- WHY A DEDICATED TABLE (the §1 audit conclusion, evidence in the migration history)
-- A live-test session exists BEFORE any execution: the user reviews the side effects, consents,
-- and then ChainReact waits — possibly for minutes — for a real Gmail message. "Waiting for an
-- email" is not a workflow run, and `public.workflow_runs` cannot represent it without breaking
-- its own invariants:
--   * `trigger_event jsonb NOT NULL` (20260507000001) — a session that is still waiting has no
--     trigger event at all. Representing it as a run would mean fabricating one.
--   * `started_at` / `finished_at` are both NOT NULL — a listening session has neither, so the
--     row could only be created by writing timestamps that are untrue.
--   * Abandoned/expired listening sessions would land in the Runs list as real runs.
--   * The durable queue (20260713000000) is a STATUS on the run row, claimed by a status-guarded
--     UPDATE. Overloading it with consent state would put authorization inside the record that
--     represents executable work — two different lifetimes, two different owners.
-- So the separation is: SESSION = consent + listening + single-use authorization; RUN = created
-- only once canonical execution is actually authorized; QUEUE = executable work only; production
-- trigger state (trigger_resources / webhook_event_dedup) is never touched by a session at all.
--
-- SHAPE follows public.sensitive_action_challenges (20260806000000): a server-minted, expiring,
-- purpose-bound authorization whose single-use property is enforced by an atomic compare-and-set,
-- readable by nobody but the service role.
--
-- WHAT IS NOT STORED
--   * No OAuth access or refresh tokens, no credentials of any kind — only the integration row
--     IDs the consent was bound to, so a later connection swap invalidates that consent.
--   * No Gmail message bodies. The capture baseline is a timestamp plus the ids already seen, and
--     the captured payload travels to the engine in memory and is persisted by the RUN, under the
--     existing run-data policy — not duplicated here.
--   * No client-supplied workflow definition. `definition_hash` binds the consent to the SAVED
--     workflow; execution re-reads that workflow and recomputes the hash.
--
-- ROLLBACK (additive; nothing reads it until the app deploys):
--   DROP TABLE public.workflow_live_test_sessions; DROP TYPE public.workflow_live_test_status;

CREATE TYPE public.workflow_live_test_status AS ENUM (
  'awaiting_consent',
  'waiting_for_trigger',
  'trigger_received',
  'authorizing_execution',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'expired'
);

CREATE TABLE public.workflow_live_test_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership. Account is the authorization boundary (matching workflows/runs); user is the
  -- consenting ACTOR — a session consented by one member cannot be spent by another.
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,

  -- Binds the consent to the EXACT saved definition the disclosure was generated from. Re-derived
  -- at authorization time; a mismatch means the workflow was edited after the user reviewed its
  -- side effects, so the consent is stale and must be refused.
  definition_hash text NOT NULL,

  -- The trigger this session listens on, denormalized so the capture worker never has to trust a
  -- client-supplied node reference.
  trigger_node_id text NOT NULL,
  trigger_provider text NOT NULL,
  trigger_event_type text NOT NULL,

  -- Integration rows the disclosure was computed against. A changed connection selection
  -- invalidates the consent for the same reason an edited definition does.
  connection_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],

  status public.workflow_live_test_status NOT NULL DEFAULT 'awaiting_consent',

  -- Provider-agnostic listening baseline, established when listening STARTS so mail that was
  -- already eligible beforehand can never be captured as newly received. Never a production
  -- cursor: the Gmail adapter stores its own timestamp + seen-id set here and
  -- `trigger_resources.snapshot` is left completely alone.
  capture_baseline jsonb,

  -- Unpredictable server-issued value the client must echo to act on the session. Prevents a
  -- guessed session id from cancelling or driving someone else's live test.
  nonce text NOT NULL,

  expires_at timestamptz NOT NULL,
  consented_at timestamptz,
  trigger_captured_at timestamptz,
  execution_authorized_at timestamptz,
  cancelled_at timestamptz,

  -- Set by the atomic compare-and-set (`UPDATE … WHERE consumed_at IS NULL`) that makes the
  -- session single-use. This is what makes a duplicate poll or a retried request return the SAME
  -- run instead of enqueueing a second real execution.
  consumed_at timestamptz,

  -- The one run this session authorized. SET NULL rather than CASCADE: losing the run must not
  -- silently delete the audit trail of the consent that authorized it.
  workflow_run_id uuid REFERENCES public.workflow_runs(id) ON DELETE SET NULL,

  -- Typed, SAFE failure surface for the UI. Never a provider payload or a stack trace.
  failure_code text,
  failure_message text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- A consumed session must name the run it authorized, and a run reference without consumption
  -- would mean a run escaped the single-use gate.
  CONSTRAINT workflow_live_test_sessions_consumed_pairs_run CHECK (
    (consumed_at IS NULL AND workflow_run_id IS NULL)
    OR (consumed_at IS NOT NULL AND workflow_run_id IS NOT NULL)
  )
);

-- Hot lookup: the newest session for a workflow (status polling + "is one already active").
CREATE INDEX workflow_live_test_sessions_workflow_idx
  ON public.workflow_live_test_sessions (workflow_id, created_at DESC);

-- Account-scoped listing.
CREATE INDEX workflow_live_test_sessions_account_idx
  ON public.workflow_live_test_sessions (account_id, created_at DESC);

-- Expiration sweep: find live sessions past their TTL.
CREATE INDEX workflow_live_test_sessions_expiry_idx
  ON public.workflow_live_test_sessions (status, expires_at);

-- Resulting-run lookup (run detail → the session that authorized it).
CREATE INDEX workflow_live_test_sessions_run_idx
  ON public.workflow_live_test_sessions (workflow_run_id)
  WHERE workflow_run_id IS NOT NULL;

-- At most ONE pre-terminal session per workflow. Without this, two browser tabs could each hold a
-- consented session and capture the same message twice. Partial unique over the live states only,
-- so terminal history accumulates freely.
CREATE UNIQUE INDEX workflow_live_test_sessions_one_active_idx
  ON public.workflow_live_test_sessions (workflow_id)
  WHERE status IN (
    'awaiting_consent',
    'waiting_for_trigger',
    'trigger_received',
    'authorizing_execution',
    'running'
  );

CREATE TRIGGER workflow_live_test_sessions_set_updated_at
  BEFORE UPDATE ON public.workflow_live_test_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS + GRANTs ─────────────────────────────────────────────────────────────
-- Deny-all for every Data API role; service_role (which bypasses RLS) is the only accessor, so a
-- client can never mint a consented or consumed row directly, read another account's session, or
-- observe that a live test is in flight. Every read/write goes through
-- repositories/workflowLiveTestSessions.ts, which enforces account + actor ownership.

ALTER TABLE public.workflow_live_test_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY workflow_live_test_sessions_no_client_access
  ON public.workflow_live_test_sessions
  FOR ALL USING (false) WITH CHECK (false);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.workflow_live_test_sessions TO service_role;
