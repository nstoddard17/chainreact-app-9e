-- ChainReactV2 — AI-PROVIDER-3 (CS-3): allow the ChainReact AI provider's three
-- capability features in ai_cost_events.feature.
--
-- The AI provider's shared execution pipeline (services/ai/processor/executeAiAction)
-- gates + charges AI credits under `document_analysis`, `data_transform`, and
-- `schema_suggestion` (priced in core/billing/aiCreditPolicy) and records ONE
-- ai_cost_events row per model call for per-run cost attribution. The feature CHECK
-- predates those features, so this widens it — aligning the credit feature with the
-- telemetry feature before any UI exposure (same reasoning as
-- 20260703000000_ai_cost_events_feature_add_workflow_qa.sql).
--
-- Non-destructive: drops + recreates the CHECK with the SAME allowed set plus the
-- three new values. No rows change; no existing value is removed. Forward-only
-- (this repo's migration style — see 20260523000000_workflow_runs_test_mode.sql:
-- "adding a new value is a migration that drops + recreates this constraint with
-- the expanded set").
--
-- No RLS/GRANT changes: this only alters a CHECK constraint on an existing table
-- (ai_cost_events already has its RLS + service-role grants from
-- 20260525000001_ai_cost_events.sql and the later account rescope).

ALTER TABLE public.ai_cost_events
  DROP CONSTRAINT IF EXISTS ai_cost_events_feature_chk;

ALTER TABLE public.ai_cost_events
  ADD CONSTRAINT ai_cost_events_feature_chk CHECK (feature IN (
    'workflow_creation',
    'workflow_editing',
    'workflow_repair',
    'workflow_explanation',
    'workflow_qa',
    'failed_run_analysis',
    'provider_discovery',
    'template_recommendation',
    'template_customization',
    'cost_preview',
    'document_analysis',
    'data_transform',
    'schema_suggestion',
    'other'
  ));
