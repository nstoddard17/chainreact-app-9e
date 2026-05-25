-- ChainReactV2 — ai_cost_events: AI cost / observability event ledger (Slice 4.COST-6).
--
-- A SEPARATE append-only ledger from task_usage_events (COST-3). AI usage is
-- NOT a workflow task — it gets its own ledger + its own "AI credits" unit so
-- AI cost stays attributable and capped independently, even if plans later
-- bundle the two.
--
-- This slice adds the FOUNDATION only — no AI behavior, no model calls. Future
-- AI slices (when AI implementation resumes) emit these events; future owner/
-- admin analytics read them (via service_role); future templates + custom
-- providers/nodes reuse the same observability model (templateId / customNodeId
-- ride in `metadata` until first-class columns are justified).
--
-- HARD redaction rule: NEVER store raw prompts, raw completions, hidden
-- chain-of-thought, secrets, tokens, message bodies, file contents, provider
-- response bodies, or full workflow configs. Only ids, event/feature types,
-- statuses, counts, timings, model names, token counts, cost amounts,
-- validation codes, and redacted aggregate-safe metadata. The recorder service
-- sanitizes `metadata` (key denylist + length caps) as defense in depth.
--
-- No workspace_id column: V2 has no workspace/org model yet (confirmed). When
-- one lands, add it in a follow-up migration; until then workspace scoping can
-- ride in `metadata`.
--
-- See docs/slices/phase-4/task-cost-billing-model-audit.md (COST-6 note).

CREATE TABLE public.ai_cost_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Nullable + SET NULL: AI cost history outlives a deleted workflow / run.
  workflow_id uuid REFERENCES public.workflows(id) ON DELETE SET NULL,
  workflow_run_id uuid REFERENCES public.workflow_runs(id) ON DELETE SET NULL,

  -- No FK — patches + conversations are not persisted tables yet (AI paused).
  patch_id text,
  conversation_id text,

  feature text NOT NULL,
  event_type text NOT NULL,

  model_name text,
  model_provider text,
  prompt_version text,

  input_tokens integer,
  output_tokens integer,
  total_tokens integer,

  -- USD millionths (micro-dollars) — integer, no float drift. Sub-cent token
  -- costs (e.g. $0.0021 → 2100) would truncate to 0 in whole cents, so we
  -- store micros instead of the audit's earlier "cents" sketch.
  estimated_cost_micros integer,
  -- User-facing AI credits charged (distinct unit from workflow tasks).
  ai_credits_charged integer,

  latency_ms integer,

  tool_name text,
  tool_status text,
  validation_error_code text,
  safety_block_reason text,

  -- Tri-state: accepted/success may be unknown for a given event type → NULL.
  accepted boolean,
  success boolean,

  -- Redacted, aggregate-safe summary only (sanitized by the recorder).
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ai_cost_events_feature_chk CHECK (feature IN (
    'workflow_creation',
    'workflow_editing',
    'workflow_repair',
    'workflow_explanation',
    'failed_run_analysis',
    'provider_discovery',
    'template_recommendation',
    'template_customization',
    'cost_preview',
    'other'
  )),
  CONSTRAINT ai_cost_events_event_type_chk CHECK (event_type IN (
    'ai_interaction_started',
    'ai_model_call_completed',
    'ai_model_call_failed',
    'ai_tool_called',
    'ai_tool_failed',
    'ai_patch_proposed',
    'ai_patch_validation_failed',
    'ai_patch_previewed',
    'ai_patch_applied',
    'ai_patch_rejected',
    'ai_safety_block_triggered',
    'ai_user_feedback_submitted',
    'ai_template_recommended',
    'ai_template_instantiated',
    'ai_cost_recorded'
  ))
);

-- "AI events for this user over time" — the dominant owner-analytics axis.
CREATE INDEX ai_cost_events_user_idx
  ON public.ai_cost_events (user_id, created_at DESC);

-- "AI events for this workflow" — per-workflow AI cost/quality.
CREATE INDEX ai_cost_events_workflow_idx
  ON public.ai_cost_events (workflow_id, created_at DESC);

-- "Cost/quality by feature" — feature-level rollups.
CREATE INDEX ai_cost_events_feature_idx
  ON public.ai_cost_events (feature, created_at DESC);

ALTER TABLE public.ai_cost_events ENABLE ROW LEVEL SECURITY;

-- Reads: users may see their OWN AI events only (redacted). Owner/admin
-- analytics + all writes go through the service-role client (server-side AI
-- logging has no user session). No user-facing write policies — default-deny
-- so a user cannot fabricate / erase their own AI usage ledger.
CREATE POLICY ai_cost_events_select_own ON public.ai_cost_events
  FOR SELECT USING (auth.uid() = user_id);

-- Explicit Data API grants (least privilege). authenticated may only SELECT
-- (RLS narrows to own rows); the service-role owns all writes + cross-user
-- (owner) reads.
GRANT SELECT ON public.ai_cost_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_cost_events TO service_role;
