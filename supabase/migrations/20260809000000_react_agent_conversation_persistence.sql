-- ChainReactV2 — REACT-AGENT-CONVERSATION-PERSISTENCE-1.
--
-- Repairs and REUSES the legacy Slice 4.AI-23 tables
-- (public.builder_agent_threads / public.builder_agent_messages) so the CURRENT
-- React Agent conversation — the one `features/workflows/useGuidanceConversation`
-- drives through POST /api/accounts/[id]/ai/workflow-guidance — survives leaving
-- and reloading the builder. No parallel conversation system is created: the two
-- existing tables keep their identity, their one-thread-per-(user, workflow)
-- shape, and their append-only message model.
--
-- Three changes, all forward-only:
--
--   1. ACCOUNT SCOPING (security). The AI-23 policies gated on `auth.uid() =
--      user_id` alone. That is user-scoped, not account-scoped: it was correct
--      only because a workflow's owner was its only reader. V2 workflows are
--      account-owned with membership, so the policies now require BOTH the row's
--      own user AND membership in the workflow's account (the same membership
--      join `agent_change_history` uses). This is strictly STRONGER than before —
--      no row that was previously invisible becomes visible — and it closes the
--      case where a user keeps a thread on a workflow after leaving the account.
--
--   2. THE CURRENT MESSAGE SHAPE. The React Agent transcript has a deterministic
--      `review` turn (no LLM, no credits) that AI-23 never had, and a restored
--      transcript must be able to say honestly what happened to each proposal.
--      So: `review` joins the kind whitelist, and a message may now carry a
--      client-minted idempotency key, the turn's request id, the
--      `agent_change_history.agent_change_id` that OWNS the proposal's lifecycle,
--      the base draft version the proposal was pinned to, and the sanitized
--      structured proposal itself.
--
--      Proposal-state ownership is NOT duplicated here: the message stores a
--      REFERENCE (`agent_change_id`) and the canonical status stays in
--      public.agent_change_history. Nothing in this schema stores a guided stage —
--      the stage is always derived from the saved workflow + current readiness.
--
--   3. `applied_saved` — the one lifecycle fact `agent_change_history` could not
--      express. "Applied to the draft" and "applied AND saved to the workflow"
--      are different states, and telling them apart is exactly what stops a
--      restored transcript from resurrecting an abandoned, never-saved change.
--
-- HARD redaction rule (unchanged, enforced in
-- services/ai/builderAgent/sanitizeAgentMessage.ts before any write): NEVER
-- persist OAuth tokens, credentials, secret field values, raw provider payloads,
-- full private model prompts, popup/session UI state, or a guided stage. The
-- `proposal` column carries the SAME class of data the user's own
-- public.workflows.draft_definition and public.workflow_checkpoints.definition
-- already hold — the member's own graph — with secret-shaped field values
-- scrubbed defensively by the sanitizer and a hard size cap.
--
-- ROLLBACK (pre-launch): re-run the AI-23 policy bodies, drop the added columns,
-- and drop 'applied_saved'/'review' from the CHECK lists.

-- ── 1. builder_agent_threads — account-scoped RLS ────────────────────────────

DROP POLICY IF EXISTS builder_agent_threads_select_own ON public.builder_agent_threads;
DROP POLICY IF EXISTS builder_agent_threads_insert_own ON public.builder_agent_threads;
DROP POLICY IF EXISTS builder_agent_threads_update_own ON public.builder_agent_threads;
DROP POLICY IF EXISTS builder_agent_threads_delete_own ON public.builder_agent_threads;

CREATE POLICY builder_agent_threads_select_own ON public.builder_agent_threads
  FOR SELECT USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
        FROM public.workflows w
        JOIN public.account_memberships am ON am.account_id = w.account_id
       WHERE w.id = builder_agent_threads.workflow_id
         AND am.user_id = auth.uid()
    )
  );

CREATE POLICY builder_agent_threads_insert_own ON public.builder_agent_threads
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
        FROM public.workflows w
        JOIN public.account_memberships am ON am.account_id = w.account_id
       WHERE w.id = builder_agent_threads.workflow_id
         AND am.user_id = auth.uid()
    )
  );

CREATE POLICY builder_agent_threads_update_own ON public.builder_agent_threads
  FOR UPDATE USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
        FROM public.workflows w
        JOIN public.account_memberships am ON am.account_id = w.account_id
       WHERE w.id = builder_agent_threads.workflow_id
         AND am.user_id = auth.uid()
    )
  ) WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
        FROM public.workflows w
        JOIN public.account_memberships am ON am.account_id = w.account_id
       WHERE w.id = builder_agent_threads.workflow_id
         AND am.user_id = auth.uid()
    )
  );

CREATE POLICY builder_agent_threads_delete_own ON public.builder_agent_threads
  FOR DELETE USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
        FROM public.workflows w
        JOIN public.account_memberships am ON am.account_id = w.account_id
       WHERE w.id = builder_agent_threads.workflow_id
         AND am.user_id = auth.uid()
    )
  );

-- ── 2. builder_agent_messages — current React Agent message shape ────────────

ALTER TABLE public.builder_agent_messages
  DROP CONSTRAINT IF EXISTS builder_agent_messages_kind_chk;

ALTER TABLE public.builder_agent_messages
  ADD CONSTRAINT builder_agent_messages_kind_chk CHECK (kind IN (
    'prompt',
    'followup',
    'plan_result',
    'needs_input',
    'applied',
    'apply_failure',
    'error',
    'system_notice',
    -- REACT-AGENT-CONVERSATION-PERSISTENCE-1 — the deterministic "Check workflow"
    -- review turn. Machine-produced (role 'assistant'), never an LLM call.
    'review'
  ));

ALTER TABLE public.builder_agent_messages
  -- Client-minted per-message idempotency key. A retried/duplicated POST for the
  -- same logical turn must not create a second transcript entry.
  ADD COLUMN IF NOT EXISTS client_message_id text,
  -- The request that produced this turn (one id shared by the user turn and the
  -- assistant turn it produced). Correlation only — never a billing token.
  ADD COLUMN IF NOT EXISTS request_id text,
  -- REFERENCE to the canonical proposal-lifecycle record
  -- (public.agent_change_history.agent_change_id). Deliberately NOT an FK: the
  -- history row is fail-open telemetry that may never be written, and the
  -- message must survive its absence. Status is READ from there, never copied.
  ADD COLUMN IF NOT EXISTS agent_change_id uuid,
  -- The saved-draft revision the proposal was validated against, so a restored
  -- proposal can be reconciled against the workflow as it stands NOW.
  ADD COLUMN IF NOT EXISTS base_graph_version text,
  -- Sanitized structured proposal/preview data (see the sanitizer). Object or NULL.
  ADD COLUMN IF NOT EXISTS proposal jsonb;

ALTER TABLE public.builder_agent_messages
  DROP CONSTRAINT IF EXISTS builder_agent_messages_proposal_object_chk;
ALTER TABLE public.builder_agent_messages
  ADD CONSTRAINT builder_agent_messages_proposal_object_chk
  CHECK (proposal IS NULL OR jsonb_typeof(proposal) = 'object');

ALTER TABLE public.builder_agent_messages
  DROP CONSTRAINT IF EXISTS builder_agent_messages_ref_len_chk;
ALTER TABLE public.builder_agent_messages
  ADD CONSTRAINT builder_agent_messages_ref_len_chk CHECK (
    (client_message_id IS NULL OR char_length(client_message_id) <= 128)
    AND (request_id IS NULL OR char_length(request_id) <= 128)
    AND (base_graph_version IS NULL OR char_length(base_graph_version) <= 128)
  );

-- Idempotency: at most one message per (thread, client_message_id). Partial so
-- legacy rows (and any future write that omits the key) stay unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS builder_agent_messages_client_id_uniq
  ON public.builder_agent_messages (thread_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

-- Account-scoped RLS, mirroring the thread policies above.
DROP POLICY IF EXISTS builder_agent_messages_select_own ON public.builder_agent_messages;
DROP POLICY IF EXISTS builder_agent_messages_insert_own ON public.builder_agent_messages;
DROP POLICY IF EXISTS builder_agent_messages_delete_own ON public.builder_agent_messages;

CREATE POLICY builder_agent_messages_select_own ON public.builder_agent_messages
  FOR SELECT USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
        FROM public.workflows w
        JOIN public.account_memberships am ON am.account_id = w.account_id
       WHERE w.id = builder_agent_messages.workflow_id
         AND am.user_id = auth.uid()
    )
  );

CREATE POLICY builder_agent_messages_insert_own ON public.builder_agent_messages
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
        FROM public.workflows w
        JOIN public.account_memberships am ON am.account_id = w.account_id
       WHERE w.id = builder_agent_messages.workflow_id
         AND am.user_id = auth.uid()
    )
  );

-- Still no UPDATE policy — persisted messages remain immutable.
CREATE POLICY builder_agent_messages_delete_own ON public.builder_agent_messages
  FOR DELETE USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
        FROM public.workflows w
        JOIN public.account_memberships am ON am.account_id = w.account_id
       WHERE w.id = builder_agent_messages.workflow_id
         AND am.user_id = auth.uid()
    )
  );

-- ── 3. agent_change_history — the applied-AND-SAVED lifecycle fact ───────────
--
-- 'preview_applied' means the change reached the LOCAL draft. Whether the user
-- then SAVED it is the difference between "resume the guided journey" and
-- "that change never existed" — so it gets its own status rather than being
-- inferred. The transition is emitted when a save completes while an applied
-- agent change is still the workflow's newest.

ALTER TABLE public.agent_change_history
  DROP CONSTRAINT IF EXISTS agent_change_history_status_known;

ALTER TABLE public.agent_change_history
  ADD CONSTRAINT agent_change_history_status_known
  CHECK (status IN (
    'preview_created',
    'preview_applied',
    'applied_saved',
    'preview_discarded',
    'apply_failed',
    'undone',
    'tested',
    'test_failed',
    'restored_checkpoint',
    'kept_as_preview'
  ));
