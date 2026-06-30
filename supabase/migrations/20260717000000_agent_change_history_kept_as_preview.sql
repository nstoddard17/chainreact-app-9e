-- ChainReactV2 — agent_change_history: add the 'kept_as_preview' status
-- (REACT-AGENT-APPLY-MODES-1).
--
-- Apply modes give the user three explicit choices on an active React Agent edit
-- preview: keep-as-preview, apply-to-draft, or apply-and-test. The chosen mode is
-- recorded so the audit timeline knows the user's decision even if the rail/history
-- UI is later removed:
--   - apply-to-draft / apply-and-test transition the existing change row to the
--     EXISTING 'preview_applied' status and record which variant in `metadata`
--     ({ "applyMode": "apply_to_draft" | "apply_and_test" }) — no new status needed
--     (the generic metadata jsonb column already exists, object-CHECK enforced).
--   - keep-as-preview is a NON-apply decision (the row stays an un-applied preview),
--     so it gets its own terminal-ish status here. metadata carries
--     { "applyMode": "preview_only" }.
--
-- Forward-only ALTER of the existing CHECK constraint. Pre-launch, no prod data.
-- ROLLBACK: restore the prior CHECK list (drop + re-add without 'kept_as_preview').

ALTER TABLE public.agent_change_history
  DROP CONSTRAINT agent_change_history_status_known;

ALTER TABLE public.agent_change_history
  ADD CONSTRAINT agent_change_history_status_known
  CHECK (status IN (
    'preview_created',
    'preview_applied',
    'preview_discarded',
    'apply_failed',
    'undone',
    'tested',
    'test_failed',
    'restored_checkpoint',
    'kept_as_preview'
  ));
