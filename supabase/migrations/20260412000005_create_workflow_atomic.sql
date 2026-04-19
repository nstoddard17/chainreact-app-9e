-- Atomic workflow creation: workflow row + admin permission + revision 0
-- in a single transaction. Guarantees the invariant that every workflow
-- has at least one revision.

CREATE OR REPLACE FUNCTION public.create_workflow_with_revision(
  p_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_workspace_type TEXT DEFAULT 'personal',
  p_workspace_id UUID DEFAULT NULL,
  p_folder_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT 'draft',
  p_billing_scope_type TEXT DEFAULT 'user',
  p_billing_scope_id UUID DEFAULT NULL
)
RETURNS SETOF public.workflows
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workflow_id UUID;
BEGIN
  -- 1. Insert workflow
  INSERT INTO workflows (
    name, description, user_id, workspace_type, workspace_id,
    folder_id, created_by, last_modified_by, status,
    billing_scope_type, billing_scope_id
  ) VALUES (
    p_name, p_description, p_user_id, p_workspace_type, p_workspace_id,
    p_folder_id, p_user_id, p_user_id, p_status,
    p_billing_scope_type, p_billing_scope_id
  )
  RETURNING id INTO v_workflow_id;

  -- 2. Grant admin permission to creator
  INSERT INTO workflow_permissions (
    workflow_id, user_id, permission, granted_by
  ) VALUES (
    v_workflow_id, p_user_id, 'admin', p_user_id
  );

  -- 3. Create initial empty revision (version 0)
  INSERT INTO workflows_revisions (
    id, workflow_id, version, graph, created_at
  ) VALUES (
    gen_random_uuid(),
    v_workflow_id,
    0,
    jsonb_build_object(
      'id', v_workflow_id::TEXT,
      'name', p_name,
      'version', 0,
      'nodes', '[]'::jsonb,
      'edges', '[]'::jsonb
    ),
    NOW()
  );

  -- Return the full workflow row
  RETURN QUERY SELECT * FROM workflows WHERE id = v_workflow_id;
END;
$$;

-- Only service_role should call this (route handler uses serviceClient)
REVOKE EXECUTE ON FUNCTION public.create_workflow_with_revision FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_workflow_with_revision FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_workflow_with_revision TO service_role;

-- Backfill: create revision 0 for existing workflows that have no revisions.
-- For workflows with normalized nodes/edges but no revision snapshot, this
-- inserts an empty revision 0 as baseline. loadRevision() tries normalized
-- tables first, so the real graph is still loaded correctly.
INSERT INTO workflows_revisions (id, workflow_id, version, graph, created_at)
SELECT
  gen_random_uuid(),
  w.id,
  0,
  jsonb_build_object(
    'id', w.id::TEXT,
    'name', w.name,
    'version', 0,
    'nodes', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'id', wn.id::TEXT,
        'type', wn.node_type,
        'label', COALESCE(wn.label, wn.node_type)
      ))
      FROM workflow_nodes wn WHERE wn.workflow_id = w.id),
      '[]'::jsonb
    ),
    'edges', '[]'::jsonb
  ),
  w.created_at
FROM workflows w
WHERE NOT EXISTS (
  SELECT 1 FROM workflows_revisions wr WHERE wr.workflow_id = w.id
);

NOTIFY pgrst, 'reload schema';
