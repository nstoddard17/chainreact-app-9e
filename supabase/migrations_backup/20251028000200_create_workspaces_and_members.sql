-- ============================================================================
-- Complete Workspaces Infrastructure Migration
-- ============================================================================
-- Build Order:
--   1. workspaces table (base table, no dependencies)
--   2. workspace_memberships (depends on workspaces)
--   3. workspace_members (depends on workspaces)
--   4. RLS policies (after all tables exist)
--
-- Dependencies:
--   - auth.users (must exist - provided by Supabase)
-- ============================================================================

-- ============================================================================
-- STEP 1: Create workspaces table (NO DEPENDENCIES)
-- ============================================================================

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  description text,
  owner_id uuid references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  avatar_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Indexes for workspaces
create unique index if not exists workspaces_slug_key
  on public.workspaces (slug);

create index if not exists workspaces_owner_id_idx
  on public.workspaces (owner_id);

create index if not exists workspaces_created_at_idx
  on public.workspaces (created_at desc);

-- Enable RLS (policies added later after all tables exist)
alter table public.workspaces enable row level security;

-- Auto-update trigger for workspaces
create or replace function public.update_workspaces_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists update_workspaces_updated_at_trigger on public.workspaces;
create trigger update_workspaces_updated_at_trigger
  before update on public.workspaces
  for each row
  execute function public.update_workspaces_updated_at();

-- ============================================================================
-- STEP 2: Create workspace_memberships table (Flow v2 RBAC)
-- ============================================================================
-- Composite primary key membership table
-- ============================================================================

create table if not exists public.workspace_memberships (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (workspace_id, user_id)
);

-- Indexes for workspace_memberships
create index if not exists workspace_memberships_user_idx
  on public.workspace_memberships (user_id);

create index if not exists workspace_memberships_workspace_idx
  on public.workspace_memberships (workspace_id, role);

-- Enable RLS (policies added later)
alter table public.workspace_memberships enable row level security;

-- ============================================================================
-- STEP 3: Create workspace_members table
-- ============================================================================
-- UUID primary key membership table (alternative structure)
-- ============================================================================

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, user_id)
);

-- Indexes for workspace_members
create index if not exists workspace_members_workspace_id_idx
  on public.workspace_members (workspace_id);

create index if not exists workspace_members_user_id_idx
  on public.workspace_members (user_id);

create index if not exists workspace_members_workspace_user_idx
  on public.workspace_members (workspace_id, user_id);

-- Enable RLS (policies added later)
alter table public.workspace_members enable row level security;

-- ============================================================================
-- STEP 4: Helper function for workspace role checking
-- ============================================================================

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

-- ============================================================================
-- STEP 5: RLS Policies for workspaces
-- ============================================================================
-- Now that all tables exist, we can safely reference them
-- ============================================================================

drop policy if exists "Users can view workspaces they belong to" on public.workspaces;
create policy "Users can view workspaces they belong to"
  on public.workspaces
  for select
  using (
    owner_id = auth.uid()
    or exists (
      select 1
      from public.workspace_memberships wm
      where wm.workspace_id = workspaces.id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "Users can create workspaces" on public.workspaces;
create policy "Users can create workspaces"
  on public.workspaces
  for insert
  with check (auth.uid() is not null and owner_id = auth.uid());

drop policy if exists "Workspace owners can update" on public.workspaces;
create policy "Workspace owners can update"
  on public.workspaces
  for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "Workspace owners can delete" on public.workspaces;
create policy "Workspace owners can delete"
  on public.workspaces
  for delete
  using (owner_id = auth.uid());

-- ============================================================================
-- STEP 6: RLS Policies for workspace_memberships
-- ============================================================================

drop policy if exists "Members can view their workspace memberships" on public.workspace_memberships;
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

drop policy if exists "Workspace owners manage memberships" on public.workspace_memberships;
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

-- ============================================================================
-- STEP 7: RLS Policies for workspace_members
-- ============================================================================

drop policy if exists "Users can view workspace members" on public.workspace_members;
create policy "Users can view workspace members"
  on public.workspace_members
  for select
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspace_members.workspace_id
        and wm.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.workspaces w
      where w.id = workspace_members.workspace_id
        and w.owner_id = auth.uid()
    )
  );

drop policy if exists "Workspace owners can manage members" on public.workspace_members;
create policy "Workspace owners can manage members"
  on public.workspace_members
  for all
  using (
    exists (
      select 1
      from public.workspaces w
      where w.id = workspace_members.workspace_id
        and w.owner_id = auth.uid()
    )
    or exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspace_members.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.workspaces w
      where w.id = workspace_members.workspace_id
        and w.owner_id = auth.uid()
    )
    or exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspace_members.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );

-- ============================================================================
-- STEP 8: Backfill workspace memberships from workspace owners
-- ============================================================================
-- Create membership records for workspace owners
-- ============================================================================

insert into public.workspace_memberships (workspace_id, user_id, role, invited_by)
select w.id, w.owner_id, 'owner', w.owner_id
from public.workspaces w
where w.owner_id is not null
on conflict (workspace_id, user_id)
do update set role = excluded.role;

-- ============================================================================
-- Comments for documentation
-- ============================================================================

comment on table public.workspaces is 'Personal workspaces for users. Each user gets a workspace for their flows, templates, and resources.';
comment on table public.workspace_memberships is 'Workspace memberships with composite key (workspace_id, user_id) for Flow v2 RBAC';
comment on table public.workspace_members is 'Workspace members with UUID primary key (alternative membership structure)';

comment on function public.workspace_role_at_least is 'Check if user has at least the specified role in a workspace (viewer < editor < owner)';
