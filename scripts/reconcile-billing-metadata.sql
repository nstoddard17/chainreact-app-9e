-- Reconciliation query: find billing events with missing or incomplete metadata.
-- Run this before enabling Phase 2 (Task History UI).
-- Target: >99% completeness before shipping history surfaces.

-- 1. Count total vs complete metadata
SELECT
  COUNT(*) AS total_events,
  COUNT(*) FILTER (WHERE metadata IS NOT NULL AND metadata != '{}'::jsonb) AS has_metadata,
  COUNT(*) FILTER (WHERE metadata IS NULL OR metadata = '{}'::jsonb) AS missing_metadata,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE metadata IS NOT NULL AND metadata != '{}'::jsonb) / NULLIF(COUNT(*), 0),
    2
  ) AS completeness_pct
FROM public.task_billing_events
WHERE created_at > NOW() - INTERVAL '30 days';

-- 2. Break down missing metadata by event_type and source
SELECT
  event_type,
  source,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE metadata IS NULL OR metadata = '{}'::jsonb) AS missing
FROM public.task_billing_events
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY event_type, source
ORDER BY missing DESC;

-- 3. Validate required fields in metadata (for events that have metadata)
SELECT
  COUNT(*) AS events_with_metadata,
  COUNT(*) FILTER (WHERE metadata->>'flat_cost' IS NOT NULL) AS has_flat_cost,
  COUNT(*) FILTER (WHERE metadata->>'charged_cost' IS NOT NULL) AS has_charged_cost,
  COUNT(*) FILTER (WHERE metadata->>'is_retry' IS NOT NULL) AS has_is_retry,
  COUNT(*) FILTER (WHERE metadata->>'loop_expansion_enabled' IS NOT NULL) AS has_loop_flag,
  COUNT(*) FILTER (WHERE metadata->>'preview_version' IS NOT NULL) AS has_version
FROM public.task_billing_events
WHERE created_at > NOW() - INTERVAL '30 days'
  AND metadata IS NOT NULL
  AND metadata != '{}'::jsonb;

-- 4. Parity check: compare amount vs metadata.charged_cost
-- Any mismatch here indicates a bug in the metadata persistence path.
SELECT
  id,
  user_id,
  execution_id,
  amount,
  (metadata->>'charged_cost')::int AS metadata_charged_cost,
  amount - (metadata->>'charged_cost')::int AS drift
FROM public.task_billing_events
WHERE created_at > NOW() - INTERVAL '30 days'
  AND metadata->>'charged_cost' IS NOT NULL
  AND amount != (metadata->>'charged_cost')::int
ORDER BY created_at DESC
LIMIT 50;
