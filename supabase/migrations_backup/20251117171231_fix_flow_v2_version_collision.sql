-- Fix version collision race condition by creating atomic revision creation function
-- This function uses PostgreSQL advisory locks to prevent concurrent version conflicts
-- by combining version increment AND insert into a single atomic transaction

-- Create a function that BOTH gets version AND inserts the revision atomically
create or replace function public.flow_v2_create_revision(
  p_id uuid,
  p_flow_id uuid,
  p_graph jsonb,
  p_created_at timestamptz
)
returns table (
  id uuid,
  flow_id uuid,
  version int,
  graph jsonb,
  created_at timestamptz
)
language plpgsql
as $$
declare
  v_version int;
  v_lock_key bigint;
begin
  -- Convert UUID to bigint for advisory lock
  -- Remove dashes first, then take first 16 hex chars
  v_lock_key := ('x' || substr(replace(p_flow_id::text, '-', ''), 1, 16))::bit(64)::bigint;

  -- Acquire advisory lock for this flow_id
  -- This ensures only one transaction can execute this block at a time for a given flow
  -- The lock is automatically released at the end of the transaction
  perform pg_advisory_xact_lock(v_lock_key);

  -- Get next version atomically (within the locked transaction)
  select coalesce(max(r.version), -1) + 1
  into v_version
  from public.flow_v2_revisions r
  where r.flow_id = p_flow_id;

  -- Insert the new revision with the locked version
  -- This happens in the same transaction as the version lookup
  return query
  insert into public.flow_v2_revisions (id, flow_id, version, graph, created_at)
  values (p_id, p_flow_id, v_version, p_graph, p_created_at)
  returning
    flow_v2_revisions.id,
    flow_v2_revisions.flow_id,
    flow_v2_revisions.version,
    flow_v2_revisions.graph,
    flow_v2_revisions.created_at;

  -- Advisory lock automatically released at end of transaction
end;
$$;

-- Grant execute permission to authenticated users
grant execute on function public.flow_v2_create_revision(uuid, uuid, jsonb, timestamptz) to authenticated;

-- Add comment explaining the function
comment on function public.flow_v2_create_revision is 'Atomically creates a new flow revision with auto-incremented version number, preventing race conditions by combining version lookup and insert in a single transaction with advisory locking';
