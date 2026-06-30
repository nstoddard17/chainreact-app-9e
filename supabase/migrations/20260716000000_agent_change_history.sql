-- ChainReactV2 — agent_change_history (AGENT-CHANGE-HISTORY-1).
--
-- A user-visible ACTIVITY/AUDIT TIMELINE of what the React Agent did to a
-- workflow: each notable agent interaction (preview shown, applied, discarded,
-- undone, restored) becomes one row carrying the prompt, a value-free change
-- summary + counts, a typed status, and OPTIONAL links to the checkpoint / run
-- it produced. It answers "what did the agent do?" — distinct from:
--   - public.workflow_checkpoints — restore points ("can I go back?"). A history
--     row LINKS to its checkpoint via checkpoint_id (SET NULL when the checkpoint
--     is pruned), but the snapshot lives there, never here.
--   - public.react_agent_audit_events — the value-free GOVERNANCE ledger (who ran
--     which capability, with what outcome). That table is intentionally prompt-
--     free + service-role-write-only; THIS table is the user-facing timeline the
--     member legitimately creates from their own builder session.
--   - the in-memory builder undo/redo stack — session-only, never persisted.
--
-- Account scope mirrors workflow_checkpoints: an explicit account_id (cheap
-- scoping, CASCADE with the account) PLUS membership-join RLS through workflows.
-- created_by_user_id is provenance only (the actor), never authorization.
--
-- HARD redaction rule: NEVER store config VALUES, before/after values, raw
-- patches, provider payloads, tokens, secrets, or signed URLs. Only the user's
-- own prompt text (capped, sanitized by the service), value-free title/summary
-- (the same secret-scrubbed change descriptions already shown in the preview),
-- non-negative counts, opaque refs, and aggregate-safe metadata. The metadata
-- object CHECK + the service-layer sanitizer enforce this.
--
-- ROLLBACK (pre-launch, no prod data): DROP TABLE public.agent_change_history.

CREATE TABLE public.agent_change_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Client-minted correlation id. One agent change (a preview and its later
  -- apply/discard/undo) shares ONE agent_change_id so transitions update the
  -- SAME row. A restore is its own fresh change id. UNIQUE per workflow below.
  agent_change_id uuid NOT NULL,

  -- The workflow this change belongs to. CASCADE: a change has no meaning
  -- without its workflow (matches workflow_checkpoints).
  workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,

  -- Owning account (denormalized for cheap scoping). CASCADE with the account.
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,

  -- The user who drove the change. Provenance only — NOT authorization (any
  -- account member may list). SET NULL on user deletion.
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- What produced this row. Launch scope writes 'react_agent' only.
  source text NOT NULL DEFAULT 'react_agent'
    CONSTRAINT agent_change_history_source_known
    CHECK (source IN ('react_agent')),

  -- Typed lifecycle status. 'tested' / 'test_failed' are reserved for a later
  -- test-run hook (no emission yet) so wiring them needs no migration.
  status text NOT NULL
    CONSTRAINT agent_change_history_status_known
    CHECK (status IN (
      'preview_created',
      'preview_applied',
      'preview_discarded',
      'apply_failed',
      'undone',
      'tested',
      'test_failed',
      'restored_checkpoint'
    )),

  -- The user's own request text that drove the change (sanitized + capped by the
  -- service). Null for system-initiated rows (e.g. a restore).
  prompt text,
  -- A short, value-free structural label (e.g. "1 node added, 1 removed").
  title text,
  -- The plain-English, secret-scrubbed change summary already shown in preview.
  summary text,

  -- Value-free counts (display only). Non-negative (CHECK below).
  changed_node_count integer NOT NULL DEFAULT 0,
  added_node_count integer NOT NULL DEFAULT 0,
  removed_node_count integer NOT NULL DEFAULT 0,
  changed_config_count integer NOT NULL DEFAULT 0,
  setup_issue_count integer NOT NULL DEFAULT 0,

  -- Opaque reference to the preview patch this change came from (never the body).
  preview_patch_ref text,
  -- LINK to the restore point captured for this change. SET NULL when the
  -- checkpoint is pruned (history row survives; its "Restore" action disappears).
  checkpoint_id uuid REFERENCES public.workflow_checkpoints(id) ON DELETE SET NULL,
  -- LINK to a run (future "tested"/"test_failed"). SET NULL when the run is gone.
  run_id uuid REFERENCES public.workflow_runs(id) ON DELETE SET NULL,
  -- User-safe, humanized failure reason for apply_failed/test_failed. NEVER a raw
  -- provider/DB error (the service passes only humanized, identifier-free text).
  failure_reason text,

  -- AGENT-CHANGE-HISTORY-1 (View diff) — the REDACTED value-level config diff for
  -- this change (the exact secret-scrubbed shape the live "Review changes" rail
  -- renders: ConfigDiff). Secret-shaped fields are stored as { kind: 'redacted' }
  -- with NO value (the service re-scrubs defensively + size-caps before write).
  -- Null when no diff was computed (e.g. the additive new-workflow path before
  -- apply) or it exceeded the size cap. Must be a JSON object when present.
  diff jsonb,

  -- AGENT-CHANGE-HISTORY-1 (eval linkage) — link to the ai_cost_events row written
  -- for this change, WHERE ONE EXISTS (the server apply / failed-run repair path).
  -- Null for the local builder overlay apply (no cost event is written there).
  -- SET NULL if the cost event is purged so the history row survives.
  ai_cost_event_id uuid REFERENCES public.ai_cost_events(id) ON DELETE SET NULL,

  -- Aggregate-safe metadata only (sanitized by the service). Must be an object.
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- One row per (workflow, agent change) — transitions update it in place.
  CONSTRAINT agent_change_history_workflow_change_uniq
    UNIQUE (workflow_id, agent_change_id),
  -- Metadata must be a JSON object (never a scalar/array that could smuggle a blob).
  CONSTRAINT agent_change_history_metadata_object_chk
    CHECK (jsonb_typeof(metadata) = 'object'),
  -- The stored diff, when present, must be a JSON object (the ConfigDiff shape).
  CONSTRAINT agent_change_history_diff_object_chk
    CHECK (diff IS NULL OR jsonb_typeof(diff) = 'object'),
  -- Counts can never be negative.
  CONSTRAINT agent_change_history_counts_nonneg_chk CHECK (
    changed_node_count >= 0
    AND added_node_count >= 0
    AND removed_node_count >= 0
    AND changed_config_count >= 0
    AND setup_issue_count >= 0
  ),
  -- Length caps (defense-in-depth alongside the service's clamps).
  CONSTRAINT agent_change_history_text_len_chk CHECK (
    (prompt IS NULL OR char_length(prompt) <= 2000)
    AND (title IS NULL OR char_length(title) <= 200)
    AND (summary IS NULL OR char_length(summary) <= 2000)
    AND (preview_patch_ref IS NULL OR char_length(preview_patch_ref) <= 256)
    AND (failure_reason IS NULL OR char_length(failure_reason) <= 2000)
  )
);

-- Recent-changes-for-a-workflow — the list + prune query.
CREATE INDEX agent_change_history_workflow_id_idx
  ON public.agent_change_history (workflow_id, created_at DESC);

-- ── RLS + GRANTs ─────────────────────────────────────────────────────────────
--
-- Account members may read/create/update/delete the change history for their
-- account's workflows. The stored fields are value-free (prompt is the member's
-- own text; no config values/secrets), the same sensitivity class as the
-- checkpoint metadata members already read — so an `authenticated` GRANT is
-- appropriate and RLS gates row visibility by membership. UPDATE is granted (the
-- checkpoints table did not need it) because a status TRANSITION updates the row
-- in place.

ALTER TABLE public.agent_change_history ENABLE ROW LEVEL SECURITY;

-- Data API access (explicit GRANTs required after Supabase removes implicit
-- grants on public tables, Oct 30 2026).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_change_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_change_history TO service_role;

CREATE POLICY agent_change_history_select_account_member
  ON public.agent_change_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.workflows w
        JOIN public.account_memberships am ON am.account_id = w.account_id
       WHERE w.id = agent_change_history.workflow_id
         AND am.user_id = auth.uid()
    )
  );

CREATE POLICY agent_change_history_insert_account_member
  ON public.agent_change_history
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.workflows w
        JOIN public.account_memberships am ON am.account_id = w.account_id
       WHERE w.id = agent_change_history.workflow_id
         AND am.user_id = auth.uid()
    )
  );

CREATE POLICY agent_change_history_update_account_member
  ON public.agent_change_history
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
        FROM public.workflows w
        JOIN public.account_memberships am ON am.account_id = w.account_id
       WHERE w.id = agent_change_history.workflow_id
         AND am.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.workflows w
        JOIN public.account_memberships am ON am.account_id = w.account_id
       WHERE w.id = agent_change_history.workflow_id
         AND am.user_id = auth.uid()
    )
  );

CREATE POLICY agent_change_history_delete_account_member
  ON public.agent_change_history
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
        FROM public.workflows w
        JOIN public.account_memberships am ON am.account_id = w.account_id
       WHERE w.id = agent_change_history.workflow_id
         AND am.user_id = auth.uid()
    )
  );
