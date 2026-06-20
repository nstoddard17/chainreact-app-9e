-- ChainReactV2 — react_agent_audit_events: React Agent governance/audit ledger
-- (REACT-AGENT-CS-5B-AUDIT-STORAGE).
--
-- A SEPARATE ledger from ai_cost_events. ai_cost_events is the COST/observability
-- ledger (tokens, $, model, latency). THIS table is the GOVERNANCE/AUDIT ledger:
-- who ran which React Agent capability, in which account/workflow/conversation
-- scope, with what outcome — and, for future proposes-change capabilities, which
-- proposed patch + which approval. It LINKS to a cost event (ai_cost_event_id)
-- rather than duplicating cost data.
--
-- STORAGE ONLY (this slice). Nothing emits these events yet — runtime emission at
-- the `runAuthorizedCapability` seam (via an injected recorder) lands in CS-5c/5d.
--
-- HARD redaction rule (mirrors ai_cost_events): NEVER store raw prompts, the user
-- question, the model answer/explanation, workflow config, `{{...}}` references,
-- secrets, tokens, provider response bodies, or raw DB error text. Only ids,
-- registry enums (capability_id / intent / mode / audit_kind), a SAFE outcome +
-- reason enum, opaque refs (proposed_patch_ref / approval_id), the cost-event
-- link, and redacted aggregate-safe metadata (sanitized by the recorder in 5c).
--
-- DELETION / RETENTION — mirrors the ledger anonymize→retain→purge convention
-- (4.ACCOUNT-MODEL-10d, 20260531000008): account_id / actor_user_id / workflow_id /
-- ai_cost_event_id FKs are ON DELETE SET NULL and NULLABLE, so deleting an account
-- (or workflow / cost event) RETAINS the audit row with the correlation key nulled
-- rather than cascade-deleting the governance trail. RLS reads gate on account_id,
-- so a NULL account_id row is automatically non-addressable by any member. The
-- anonymized_at / ledger_purge_after columns + partial purge index match the other
-- ledgers so a future retention cron can purge anonymized rows WITHOUT another
-- migration. (Active anonymization-service + purge-cron wiring is a later slice;
-- the DB-level SET NULL already handles account/workflow/cost-event deletion.)

CREATE TABLE public.react_agent_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Owner spine. Nullable + SET NULL: the audit trail outlives a deleted account
  -- (anonymize-retain). RLS gates on this, so NULL → non-addressable.
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  -- The acting user. SET NULL on user deletion (actor reference nulled).
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Optional workflow context; audit outlives a deleted workflow.
  workflow_id uuid REFERENCES public.workflows(id) ON DELETE SET NULL,
  -- Session-local placeholder (no conversations table yet) — free text, no FK.
  conversation_id text,

  -- Registry-sourced governance fields (closed sets owned by the capability registry).
  capability_id text NOT NULL,
  intent text NOT NULL,
  mode text NOT NULL,
  -- The ai_cost_events.feature the route charges (nullable for 0-credit). Doc/audit.
  credit_feature text,
  audit_kind text NOT NULL,

  -- Outcome of the capability run.
  outcome text NOT NULL,
  -- SAFE reason enum only (e.g. invalid_scope / unknown_capability / intent_mismatch
  -- / credits_exhausted / frozen / model_failed). NEVER a raw error message.
  reason text,

  -- Future proposes-change / approval governance (opaque refs, never bodies).
  proposed_patch_ref text,
  approval_id text,

  -- Link to the cost/observability event for this run (no cost duplication here).
  ai_cost_event_id uuid REFERENCES public.ai_cost_events(id) ON DELETE SET NULL,

  -- Redacted, aggregate-safe summary only (sanitized by the recorder). Must be an object.
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Retention (anonymize→retain→purge), mirrors the other ledgers.
  anonymized_at timestamptz,
  ledger_purge_after timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT react_agent_audit_outcome_chk CHECK (outcome IN (
    'success',
    'denied',
    'failed'
  )),
  CONSTRAINT react_agent_audit_mode_chk CHECK (mode IN (
    'read_only',
    'proposes_change',
    'requires_approval'
  )),
  -- Metadata must be a JSON object (never a scalar/array that could smuggle a blob).
  CONSTRAINT react_agent_audit_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
  -- Reasonable length caps — these are ids/enums/opaque refs, never free-form blobs.
  CONSTRAINT react_agent_audit_text_len_chk CHECK (
    char_length(capability_id) <= 128
    AND char_length(intent) <= 128
    AND char_length(mode) <= 64
    AND (credit_feature IS NULL OR char_length(credit_feature) <= 128)
    AND char_length(audit_kind) <= 128
    AND char_length(outcome) <= 32
    AND (reason IS NULL OR char_length(reason) <= 128)
    AND (proposed_patch_ref IS NULL OR char_length(proposed_patch_ref) <= 256)
    AND (approval_id IS NULL OR char_length(approval_id) <= 256)
    AND (conversation_id IS NULL OR char_length(conversation_id) <= 256)
  )
);

-- "Audit events for this account over time" — the dominant governance axis.
CREATE INDEX react_agent_audit_account_idx
  ON public.react_agent_audit_events (account_id, created_at DESC);

-- "Audit events for this workflow."
CREATE INDEX react_agent_audit_workflow_idx
  ON public.react_agent_audit_events (workflow_id, created_at DESC)
  WHERE workflow_id IS NOT NULL;

-- "Audit events by capability."
CREATE INDEX react_agent_audit_capability_idx
  ON public.react_agent_audit_events (capability_id, created_at DESC);

-- Join to the linked cost event.
CREATE INDEX react_agent_audit_cost_event_idx
  ON public.react_agent_audit_events (ai_cost_event_id)
  WHERE ai_cost_event_id IS NOT NULL;

-- Retention purge scan (mirrors the other ledgers).
CREATE INDEX react_agent_audit_ledger_purge_idx
  ON public.react_agent_audit_events (ledger_purge_after)
  WHERE anonymized_at IS NOT NULL;

ALTER TABLE public.react_agent_audit_events ENABLE ROW LEVEL SECURITY;

-- Reads: members of the owning account only (mirrors ai_cost_events'
-- account-membership read policy). A NULL account_id (anonymized) row matches no
-- membership and is therefore non-addressable. ALL writes go through the
-- service-role client (audit is logged server-side at the agent seam) — there is
-- NO user-facing INSERT/UPDATE/DELETE policy, so an actor can never fabricate or
-- erase their own audit trail (default-deny).
CREATE POLICY react_agent_audit_select_account_member ON public.react_agent_audit_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      WHERE am.user_id = auth.uid()
        AND am.account_id = react_agent_audit_events.account_id
    )
  );

-- Explicit Data API grants (least privilege; required after Oct 30, 2026).
-- authenticated may only SELECT (RLS narrows to member accounts); the service-role
-- owns all writes + retention.
GRANT SELECT ON public.react_agent_audit_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.react_agent_audit_events TO service_role;
