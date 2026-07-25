-- ChainReactV2 — analytics_runs_aggregate RPC (Slice ANALYTICS-FLEXIBILITY-CS-1).
--
-- SQL-side aggregation for the typed analytics query path
-- (POST /api/analytics/query → services/analytics/insightQuery.ts →
-- repositories/analyticsQueries.ts → THIS function). Replaces "fetch 5000 raw
-- rows and reduce in JS" with one bounded GROUP BY, so results stay exact and
-- small regardless of how many run rows an account has.
--
-- Design (docs/slices/phase-5/analytics-flexibility-audit-1.md §15/§18 + the
-- CS-1 outcome doc):
--   - READ-ONLY (STABLE). No table, index, or RLS change in this migration.
--   - Returns BASE aggregates only (runs / succeeded / failed / duration sum +
--     count) grouped by an allow-listed dimension. Measure math (success rate,
--     averages) is derived in ONE TypeScript home
--     (services/analytics/metricDefinitions.ts) shared with the legacy
--     overview, so metric definitions cannot drift between SQL and JS.
--   - Terminal-only (status IN succeeded/failed — running/queued never counted),
--     test runs excluded unless p_include_tests, window is [p_from, p_to)
--     (inclusive start, exclusive end), buckets are UTC calendar truncations.
--   - NEVER selects payload columns (trigger_event / steps / fatal_error /
--     error_classification) — aggregates only.
--   - Every dimension/grain value is validated against a closed allow-list
--     inside the function; all inputs are typed parameters (no dynamic SQL).
--   - Bounded: p_limit caps categorical groups (callers pass limit+1 to detect
--     truncation); series-by-workflow REQUIRES an explicit id list (≤ 20) so a
--     grouped time series can never fan out per-workflow unbounded.
--
-- SECURITY:
--   - SECURITY INVOKER (not DEFINER — the function needs no elevation; the sole
--     legitimate caller is the server-side service-role client, which already
--     reads workflow_runs). This intentionally diverges from the billing RPCs'
--     SECURITY DEFINER: those must mutate across RLS; this one only reads.
--   - EXECUTE is REVOKED from public/anon/authenticated and GRANTED to
--     service_role ONLY. `authenticated` also holds no SELECT on workflow_runs
--     (revoked in 20260701000000), so even EXECUTE-in-hand would return nothing.
--   - p_account_id comes exclusively from the trusted server repository call —
--     the HTTP layer resolves it from the caller's session membership
--     (requireAccount → resolveActiveAccount); clients never supply it.

CREATE OR REPLACE FUNCTION public.analytics_runs_aggregate(
  p_account_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_dimension text DEFAULT NULL,      -- NULL (KPI) | 'time' | 'workflow' | 'status' | 'trigger_source'
  p_grain text DEFAULT NULL,          -- with p_dimension='time': 'day' | 'week' | 'month'
  p_series_by text DEFAULT NULL,      -- with p_dimension='time': NULL | 'workflow' | 'status'
  p_workflow_ids uuid[] DEFAULT NULL, -- filter / series id set (≤ 20)
  p_statuses text[] DEFAULT NULL,     -- subset of {'succeeded','failed'}
  p_trigger_sources text[] DEFAULT NULL,
  p_include_tests boolean DEFAULT false,
  p_limit int DEFAULT NULL            -- categorical dims only; caller passes limit+1
)
RETURNS TABLE (
  bucket_start timestamptz,
  group_key text,
  runs bigint,
  succeeded bigint,
  failed bigint,
  dur_sum_ms double precision,
  dur_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_account_id IS NULL THEN
    RAISE EXCEPTION 'analytics_runs_aggregate: p_account_id is required';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_from >= p_to THEN
    RAISE EXCEPTION 'analytics_runs_aggregate: invalid range';
  END IF;
  IF p_dimension IS NOT NULL
     AND p_dimension NOT IN ('time', 'workflow', 'status', 'trigger_source') THEN
    RAISE EXCEPTION 'analytics_runs_aggregate: invalid dimension %', p_dimension;
  END IF;
  IF p_dimension = 'time'
     AND (p_grain IS NULL OR p_grain NOT IN ('day', 'week', 'month')) THEN
    RAISE EXCEPTION 'analytics_runs_aggregate: invalid grain %', p_grain;
  END IF;
  IF p_grain IS NOT NULL AND p_dimension IS DISTINCT FROM 'time' THEN
    RAISE EXCEPTION 'analytics_runs_aggregate: grain requires the time dimension';
  END IF;
  IF p_series_by IS NOT NULL THEN
    IF p_dimension IS DISTINCT FROM 'time'
       OR p_series_by NOT IN ('workflow', 'status') THEN
      RAISE EXCEPTION 'analytics_runs_aggregate: invalid series_by %', p_series_by;
    END IF;
    -- A per-workflow grouped series without an explicit id set would fan out
    -- one series per workflow in the account — unbounded. Callers must resolve
    -- Top-N (or an explicit selection) to ids FIRST.
    IF p_series_by = 'workflow' AND p_workflow_ids IS NULL THEN
      RAISE EXCEPTION 'analytics_runs_aggregate: series by workflow requires p_workflow_ids';
    END IF;
  END IF;
  IF p_workflow_ids IS NOT NULL AND array_length(p_workflow_ids, 1) > 20 THEN
    RAISE EXCEPTION 'analytics_runs_aggregate: too many workflow ids';
  END IF;
  IF p_limit IS NOT NULL THEN
    IF p_limit < 1 OR p_limit > 100 THEN
      RAISE EXCEPTION 'analytics_runs_aggregate: invalid limit %', p_limit;
    END IF;
    IF p_dimension IS NULL OR p_dimension = 'time' THEN
      RAISE EXCEPTION 'analytics_runs_aggregate: limit applies to categorical dimensions only';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    CASE WHEN p_dimension = 'time'
      THEN (date_trunc(p_grain, r.started_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
    END AS bucket_start,
    CASE
      WHEN p_dimension = 'time' AND p_series_by = 'workflow' THEN r.workflow_id::text
      WHEN p_dimension = 'time' AND p_series_by = 'status' THEN r.status::text
      WHEN p_dimension = 'workflow' THEN r.workflow_id::text
      WHEN p_dimension = 'status' THEN r.status::text
      WHEN p_dimension = 'trigger_source' THEN r.triggered_by
    END AS group_key,
    COUNT(*)::bigint AS runs,
    (COUNT(*) FILTER (WHERE r.status = 'succeeded'))::bigint AS succeeded,
    (COUNT(*) FILTER (WHERE r.status = 'failed'))::bigint AS failed,
    COALESCE(SUM(
      CASE WHEN r.finished_at IS NOT NULL
        THEN GREATEST(0, EXTRACT(EPOCH FROM (r.finished_at - r.started_at)) * 1000.0)
      END), 0)::double precision AS dur_sum_ms,
    COUNT(r.finished_at)::bigint AS dur_count
  FROM public.workflow_runs r
  WHERE r.account_id = p_account_id
    AND r.status IN ('succeeded', 'failed')
    AND r.started_at >= p_from
    AND r.started_at < p_to
    AND (p_include_tests OR r.is_test = false)
    AND (p_workflow_ids IS NULL OR r.workflow_id = ANY (p_workflow_ids))
    AND (p_statuses IS NULL OR r.status::text = ANY (p_statuses))
    AND (p_trigger_sources IS NULL OR r.triggered_by = ANY (p_trigger_sources))
  GROUP BY 1, 2
  ORDER BY 3 DESC
  LIMIT p_limit;
END;
$$;

-- Function EXECUTE defaults to PUBLIC — lock it to the server-side caller only.
REVOKE ALL ON FUNCTION public.analytics_runs_aggregate(uuid, timestamptz, timestamptz, text, text, text, uuid[], text[], text[], boolean, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_runs_aggregate(uuid, timestamptz, timestamptz, text, text, text, uuid[], text[], text[], boolean, int) TO service_role;
