-- Check if the function exists and create it if not
-- Run this in Supabase SQL Editor

-- First check if it exists
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'flow_v2_create_revision';

-- If the above returns no rows, run this to create it:

CREATE OR REPLACE FUNCTION public.flow_v2_create_revision(
  p_id uuid,
  p_flow_id uuid,
  p_graph jsonb,
  p_created_at timestamptz
)
RETURNS TABLE (
  id uuid,
  flow_id uuid,
  version int,
  graph jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_version int;
  v_lock_key bigint;
BEGIN
  -- Convert UUID to bigint for advisory lock
  v_lock_key := ('x' || substr(replace(p_flow_id::text, '-', ''), 1, 16))::bit(64)::bigint;

  -- Acquire advisory lock for this flow_id
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Get next version atomically
  SELECT coalesce(max(r.version), -1) + 1
  INTO v_version
  FROM public.flow_v2_revisions r
  WHERE r.flow_id = p_flow_id;

  -- Insert the new revision
  RETURN QUERY
  INSERT INTO public.flow_v2_revisions (id, flow_id, version, graph, created_at)
  VALUES (p_id, p_flow_id, v_version, p_graph, p_created_at)
  RETURNING
    flow_v2_revisions.id,
    flow_v2_revisions.flow_id,
    flow_v2_revisions.version,
    flow_v2_revisions.graph,
    flow_v2_revisions.created_at;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.flow_v2_create_revision(uuid, uuid, jsonb, timestamptz) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.flow_v2_create_revision IS 'Atomically creates a new flow revision with auto-incremented version number, preventing race conditions';
