-- Flow v2 RBAC & RLS hardening

-- Workspace memberships -----------------------------------------------------
create table if not exists public.workspace_memberships (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (workspace_id, user_id)
);

create index if not exists workspace_memberships_user_idx
  on public.workspace_memberships (user_id);

create index if not exists workspace_memberships_workspace_idx
  on public.workspace_memberships (workspace_id, role);

alter table public.workspace_memberships enable row level security;

insert into public.workspace_memberships (workspace_id, user_id, role, invited_by)
select w.id, w.owner_id, 'owner', w.owner_id
from public.workspaces w
where w.owner_id is not null
on conflict (workspace_id, user_id)
do update set role = excluded.role;

drop policy if exists "Members can view their workspace memberships" on public.workspace_memberships;
drop policy if exists "Workspace owners manage memberships" on public.workspace_memberships;
drop policy if exists "Workspace owners can remove memberships" on public.workspace_memberships;

create policy "Members can view their workspace memberships"
  on public.workspace_memberships
  for select
  using (
    workspace_memberships.user_id = auth.uid()
    or exists (
      select 1
      from public.workspaces w
      where w.id = workspace_memberships.workspace_id
        and w.owner_id = auth.uid()
    )
  );

create policy "Workspace owners manage memberships"
  on public.workspace_memberships
  for all
  using (
    exists (
      select 1
      from public.workspaces w
      where w.id = workspace_memberships.workspace_id
        and w.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.workspaces w
      where w.id = workspace_memberships.workspace_id
        and w.owner_id = auth.uid()
    )
  );

-- Helper functions ----------------------------------------------------------
create or replace function public.workspace_role_at_least(
  target_workspace uuid,
  required_role text,
  target_user uuid default auth.uid()
) returns boolean
language plpgsql
stable
as $$
declare
  required_weight int;
  user_role text;
  user_weight int;
begin
  if required_role not in ('viewer', 'editor', 'owner') then
    return false;
  end if;

  select case required_role
    when 'viewer' then 1
    when 'editor' then 2
    when 'owner' then 3
  end
  into required_weight;

  select wm.role
  into user_role
  from public.workspace_memberships wm
  where wm.workspace_id = target_workspace
    and wm.user_id = coalesce(target_user, auth.uid())
  limit 1;

  if user_role is null then
    select case when w.owner_id = coalesce(target_user, auth.uid()) then 'owner' end
    into user_role
    from public.workspaces w
    where w.id = target_workspace
    limit 1;
  end if;

  if user_role is null then
    return false;
  end if;

  select case user_role
    when 'viewer' then 1
    when 'editor' then 2
    when 'owner' then 3
    else 0
  end
  into user_weight;

  return user_weight >= required_weight;
end;
$$;

-- Data backfill -------------------------------------------------------------
update public.flow_v2_definitions d
set workspace_id = w.id
from public.workspaces w
where d.workspace_id is null
  and d.owner_id = w.owner_id;

update public.flow_v2_templates t
set workspace_id = d.workspace_id
from public.flow_v2_definitions d
where t.workspace_id is null
  and t.flow_id = d.id;

update public.flow_v2_schedules s
set workspace_id = d.workspace_id
from public.flow_v2_definitions d
where s.workspace_id is null
  and s.flow_id = d.id;

-- Ensure RLS enabled on all flow tables ------------------------------------
alter table public.flow_v2_lineage enable row level security;

-- flow_v2_definitions policies
drop policy if exists "flow_v2_definitions_select" on public.flow_v2_definitions;
drop policy if exists "flow_v2_definitions_insert" on public.flow_v2_definitions;
drop policy if exists "flow_v2_definitions_update" on public.flow_v2_definitions;
drop policy if exists "flow_v2_definitions_delete" on public.flow_v2_definitions;

create policy "flow_v2_definitions_select"
  on public.flow_v2_definitions
  for select
  using (
    public.workspace_role_at_least(flow_v2_definitions.workspace_id, 'viewer')
  );

create policy "flow_v2_definitions_insert"
  on public.flow_v2_definitions
  for insert
  with check (
    public.workspace_role_at_least(flow_v2_definitions.workspace_id, 'editor')
  );

create policy "flow_v2_definitions_update"
  on public.flow_v2_definitions
  for update
  using (
    public.workspace_role_at_least(flow_v2_definitions.workspace_id, 'editor')
  )
  with check (
    public.workspace_role_at_least(flow_v2_definitions.workspace_id, 'editor')
  );

create policy "flow_v2_definitions_delete"
  on public.flow_v2_definitions
  for delete
  using (
    public.workspace_role_at_least(flow_v2_definitions.workspace_id, 'owner')
  );

-- flow_v2_revisions policies
drop policy if exists "flow_v2_revisions_select" on public.flow_v2_revisions;
drop policy if exists "flow_v2_revisions_mutate" on public.flow_v2_revisions;

create policy "flow_v2_revisions_select"
  on public.flow_v2_revisions
  for select
  using (
    exists (
      select 1
      from public.flow_v2_definitions d
      where d.id = flow_v2_revisions.flow_id
        and public.workspace_role_at_least(d.workspace_id, 'viewer')
    )
  );

create policy "flow_v2_revisions_mutate"
  on public.flow_v2_revisions
  for all
  using (
    exists (
      select 1
      from public.flow_v2_definitions d
      where d.id = flow_v2_revisions.flow_id
        and public.workspace_role_at_least(d.workspace_id, 'editor')
    )
  )
  with check (
    exists (
      select 1
      from public.flow_v2_definitions d
      where d.id = flow_v2_revisions.flow_id
        and public.workspace_role_at_least(d.workspace_id, 'editor')
    )
  );

-- flow_v2_runs policies
drop policy if exists "flow_v2_runs_select" on public.flow_v2_runs;
drop policy if exists "flow_v2_runs_mutate" on public.flow_v2_runs;

create policy "flow_v2_runs_select"
  on public.flow_v2_runs
  for select
  using (
    exists (
      select 1
      from public.flow_v2_definitions d
      where d.id = flow_v2_runs.flow_id
        and public.workspace_role_at_least(d.workspace_id, 'viewer')
    )
  );

create policy "flow_v2_runs_mutate"
  on public.flow_v2_runs
  for all
  using (
    exists (
      select 1
      from public.flow_v2_definitions d
      where d.id = flow_v2_runs.flow_id
        and public.workspace_role_at_least(d.workspace_id, 'editor')
    )
  )
  with check (
    exists (
      select 1
      from public.flow_v2_definitions d
      where d.id = flow_v2_runs.flow_id
        and public.workspace_role_at_least(d.workspace_id, 'editor')
    )
  );

-- flow_v2_run_nodes policies
drop policy if exists "flow_v2_run_nodes_select" on public.flow_v2_run_nodes;
drop policy if exists "flow_v2_run_nodes_mutate" on public.flow_v2_run_nodes;

create policy "flow_v2_run_nodes_select"
  on public.flow_v2_run_nodes
  for select
  using (
    exists (
      select 1
      from public.flow_v2_runs r
      join public.flow_v2_definitions d on d.id = r.flow_id
      where r.id = flow_v2_run_nodes.run_id
        and public.workspace_role_at_least(d.workspace_id, 'viewer')
    )
  );

create policy "flow_v2_run_nodes_mutate"
  on public.flow_v2_run_nodes
  for all
  using (
    exists (
      select 1
      from public.flow_v2_runs r
      join public.flow_v2_definitions d on d.id = r.flow_id
      where r.id = flow_v2_run_nodes.run_id
        and public.workspace_role_at_least(d.workspace_id, 'editor')
    )
  )
  with check (
    exists (
      select 1
      from public.flow_v2_runs r
      join public.flow_v2_definitions d on d.id = r.flow_id
      where r.id = flow_v2_run_nodes.run_id
        and public.workspace_role_at_least(d.workspace_id, 'editor')
    )
  );

-- flow_v2_lineage policies
drop policy if exists "flow_v2_lineage_select" on public.flow_v2_lineage;
drop policy if exists "flow_v2_lineage_insert" on public.flow_v2_lineage;

create policy "flow_v2_lineage_select"
  on public.flow_v2_lineage
  for select
  using (
    exists (
      select 1
      from public.flow_v2_runs r
      join public.flow_v2_definitions d on d.id = r.flow_id
      where r.id = flow_v2_lineage.run_id
        and public.workspace_role_at_least(d.workspace_id, 'viewer')
    )
  );

create policy "flow_v2_lineage_insert"
  on public.flow_v2_lineage
  for insert
  with check (
    exists (
      select 1
      from public.flow_v2_runs r
      join public.flow_v2_definitions d on d.id = r.flow_id
      where r.id = flow_v2_lineage.run_id
        and public.workspace_role_at_least(d.workspace_id, 'editor')
    )
  );

-- flow_v2_templates policies
drop policy if exists "flow_v2_templates_select" on public.flow_v2_templates;
drop policy if exists "flow_v2_templates_mutate" on public.flow_v2_templates;

create policy "flow_v2_templates_select"
  on public.flow_v2_templates
  for select
  using (
    public.workspace_role_at_least(flow_v2_templates.workspace_id, 'viewer')
  );

create policy "flow_v2_templates_mutate"
  on public.flow_v2_templates
  for all
  using (
    public.workspace_role_at_least(flow_v2_templates.workspace_id, 'editor')
  )
  with check (
    public.workspace_role_at_least(flow_v2_templates.workspace_id, 'editor')
  );

-- flow_v2_schedules policies
drop policy if exists "flow_v2_schedules_select" on public.flow_v2_schedules;
drop policy if exists "flow_v2_schedules_mutate" on public.flow_v2_schedules;

create policy "flow_v2_schedules_select"
  on public.flow_v2_schedules
  for select
  using (
    public.workspace_role_at_least(flow_v2_schedules.workspace_id, 'viewer')
  );

create policy "flow_v2_schedules_mutate"
  on public.flow_v2_schedules
  for all
  using (
    public.workspace_role_at_least(flow_v2_schedules.workspace_id, 'editor')
  )
  with check (
    public.workspace_role_at_least(flow_v2_schedules.workspace_id, 'editor')
  );

-- flow_v2_published_revisions policies
drop policy if exists "flow_v2_published_revisions_select" on public.flow_v2_published_revisions;
drop policy if exists "flow_v2_published_revisions_mutate" on public.flow_v2_published_revisions;

create policy "flow_v2_published_revisions_select"
  on public.flow_v2_published_revisions
  for select
  using (
    exists (
      select 1
      from public.flow_v2_definitions d
      where d.id = flow_v2_published_revisions.flow_id
        and public.workspace_role_at_least(d.workspace_id, 'viewer')
    )
  );

create policy "flow_v2_published_revisions_mutate"
  on public.flow_v2_published_revisions
  for all
  using (
    exists (
      select 1
      from public.flow_v2_definitions d
      where d.id = flow_v2_published_revisions.flow_id
        and public.workspace_role_at_least(d.workspace_id, 'editor')
    )
  )
  with check (
    exists (
      select 1
      from public.flow_v2_definitions d
      where d.id = flow_v2_published_revisions.flow_id
        and public.workspace_role_at_least(d.workspace_id, 'editor')
    )
  );

-- flow_v2_node_logs policies
drop policy if exists "flow_v2_node_logs_select" on public.flow_v2_node_logs;

create policy "flow_v2_node_logs_select"
  on public.flow_v2_node_logs
  for select
  using (
    exists (
      select 1
      from public.flow_v2_runs r
      join public.flow_v2_definitions d on d.id = r.flow_id
      where r.id = flow_v2_node_logs.run_id
        and public.workspace_role_at_least(d.workspace_id, 'viewer')
    )
  );
