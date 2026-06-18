-- ChainReactV2 — Slice 4.AI-DIAG-QA-2-TELEMETRY-CHECK: allow `workflow_qa` in
-- ai_cost_events.feature.
--
-- The diagnosis Q&A backend (AI-DIAG-QA-2) charges credits under feature
-- `workflow_qa` but had to record its `ai_cost_events` telemetry row under the
-- DB-valid fallback `other` (+ metadata.kind 'workflow_diagnosis_qa') because the
-- feature CHECK predated the feature. This widens the CHECK so Q&A telemetry can
-- record `feature = 'workflow_qa'` directly — aligning the credit feature with the
-- telemetry feature for clean billing / audit / reporting before any UI exposure.
--
-- Non-destructive: drops + recreates the CHECK with the SAME allowed set plus
-- `workflow_qa`. No rows change; no existing value is removed; existing `other` Q&A
-- rows stay valid. Forward-only (this repo's migration style — see
-- 20260523000000_workflow_runs_test_mode.sql: "adding a new value is a migration
-- that drops + recreates this constraint with the expanded set").

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
    'other'
  ));
