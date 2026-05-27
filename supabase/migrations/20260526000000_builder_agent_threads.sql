-- ChainReactV2 — builder_agent_threads + builder_agent_messages.
--
-- Slice 4.AI-23 — Persistent Builder Agent Threads / workflow-scoped React
-- Agent chat history. ONE persistent thread per (user_id, workflow_id) holds
-- the sanitized chat transcript the Builder rail re-renders when a user
-- reopens a workflow. The general app help assistant is OUT OF SCOPE and
-- gets its own surface if/when it lands.
--
-- HARD redaction rule (enforced server-side in
-- services/ai/builderAgent/sanitizeAgentMessage.ts and the repository
-- layer; this migration only stores what callers pass):
--   NEVER persist raw model completions, raw proposedPatch / WorkflowPatch,
--   raw workflow configs, raw config values, secrets, tokens, OAuth access /
--   refresh tokens, webhook secrets, Authorization headers, API keys, raw
--   integration metadata, or raw execution payloads.
--   Persisted:
--     - user-visible user message text (prompt / followup)
--     - sanitized assistant summary text + an allowlisted safe_payload
--       projection of the AI-9A/AI-9B route response (intentSummary, counts,
--       riskLevel, change descriptions, requiredUserInput display metadata)
--     - safe status / code fields, createdAt timestamps, ids
--
-- Per docs/rules/database-security.md: RLS enabled + explicit policies + GRANT
-- declared in this same migration. user_id ON DELETE CASCADE (account
-- deletion); workflow_id ON DELETE CASCADE (workflow deletion).

CREATE TABLE public.builder_agent_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,

  -- One active thread per (user, workflow). When AI-23 ships, multiple
  -- sessions per workflow is not in scope; the unique constraint is the
  -- cheapest way to make "get-or-create" deterministic. Future multi-thread
  -- support drops the constraint and adds a presented/at column.
  CONSTRAINT builder_agent_threads_user_workflow_unique
    UNIQUE (user_id, workflow_id)
);

CREATE INDEX builder_agent_threads_user_idx
  ON public.builder_agent_threads (user_id, updated_at DESC);

CREATE INDEX builder_agent_threads_workflow_idx
  ON public.builder_agent_threads (workflow_id, updated_at DESC);

ALTER TABLE public.builder_agent_threads ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.builder_agent_threads
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.builder_agent_threads
  TO service_role;

CREATE POLICY builder_agent_threads_select_own ON public.builder_agent_threads
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY builder_agent_threads_insert_own ON public.builder_agent_threads
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY builder_agent_threads_update_own ON public.builder_agent_threads
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY builder_agent_threads_delete_own ON public.builder_agent_threads
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER builder_agent_threads_set_updated_at
  BEFORE UPDATE ON public.builder_agent_threads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── builder_agent_messages ──────────────────────────────────────────────────
-- Append-only-ish — the UI never edits a stored message. Clear-thread DELETEs
-- the whole row set for the thread; the thread row itself survives so the
-- (user, workflow) → thread mapping is stable across clears.

CREATE TABLE public.builder_agent_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.builder_agent_threads(id)
    ON DELETE CASCADE,
  -- Denormalized for RLS scoping + cheaper per-user/per-workflow reads. Kept
  -- in lock-step with the thread on insert (the repository layer copies them
  -- from the thread row).
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,

  role text NOT NULL,
  kind text NOT NULL,
  content text,
  -- Sanitized JSON projection of the AI route response shape. Allowlist-only;
  -- denylist of secret patterns; depth/size caps. See
  -- services/ai/builderAgent/sanitizeAgentMessage.ts.
  safe_payload jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),

  -- Role / kind whitelist. Mirrors UseBuilderAi + chat-bubble subcomponent
  -- types (UserChatMessage.kind | AssistantPlanChatMessage.kind | …) so the
  -- repository can re-render the persisted history through the same code
  -- path that drives the session-local chat in AI-21B/AI-21C.
  CONSTRAINT builder_agent_messages_role_chk CHECK (role IN ('user', 'assistant')),
  CONSTRAINT builder_agent_messages_kind_chk CHECK (kind IN (
    'prompt',
    'followup',
    'plan_result',
    'needs_input',
    'applied',
    'apply_failure',
    'error',
    'system_notice'
  )),
  -- Cap content at the planner's MAX_PROMPT_LENGTH (8 KB) to bound storage.
  -- The sanitizer further caps content + safe_payload as defense in depth.
  CONSTRAINT builder_agent_messages_content_len_chk CHECK (
    content IS NULL OR length(content) <= 8000
  )
);

CREATE INDEX builder_agent_messages_thread_idx
  ON public.builder_agent_messages (thread_id, created_at ASC);

CREATE INDEX builder_agent_messages_workflow_idx
  ON public.builder_agent_messages (workflow_id, created_at ASC);

CREATE INDEX builder_agent_messages_user_idx
  ON public.builder_agent_messages (user_id, created_at DESC);

ALTER TABLE public.builder_agent_messages ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.builder_agent_messages
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.builder_agent_messages
  TO service_role;

CREATE POLICY builder_agent_messages_select_own ON public.builder_agent_messages
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY builder_agent_messages_insert_own ON public.builder_agent_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- No UPDATE policy — messages are immutable.
CREATE POLICY builder_agent_messages_delete_own ON public.builder_agent_messages
  FOR DELETE USING (auth.uid() = user_id);
