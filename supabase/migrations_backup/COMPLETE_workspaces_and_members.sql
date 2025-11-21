-- ============================================================================
-- Complete Workspaces Infrastructure Migration
-- ============================================================================
-- Build Order:
--   1. workspaces table (base table)
--   2. workspace_memberships (already exists in 20251028000100_flow_v2_rbac.sql)
--   3. workspace_members (new table)
--
-- Dependencies:
--   - auth.users (must exist - provided by Supabase)
-- ============================================================================

-- ============================================================================
-- STEP 1: Create workspaces table
-- ============================================================================
-- Base table for personal workspaces. Each user gets one workspace.
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

-- Enable RLS
alter table public.workspaces enable row level security;

-- RLS Policies for workspaces
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

-- Comments for workspaces
comment on table public.workspaces is 'Personal workspaces for users. Each user gets a workspace for their flows, templates, and resources.';
comment on column public.workspaces.id is 'Primary key UUID';
comment on column public.workspaces.name is 'Display name of the workspace (e.g., "username''s Workspace")';
comment on column public.workspaces.slug is 'Unique slug identifier (format: personal-{user_id})';
comment on column public.workspaces.description is 'Optional workspace description';
comment on column public.workspaces.owner_id is 'User who owns this workspace (references auth.users)';
comment on column public.workspaces.settings is 'Workspace settings stored as JSONB';
comment on column public.workspaces.avatar_url is 'Optional avatar/logo URL for the workspace';

-- ============================================================================
-- STEP 2: workspace_memberships table
-- ============================================================================
-- NOTE: This table is already created in migration 20251028000100_flow_v2_rbac.sql
-- Including here for completeness and documentation
-- ============================================================================

-- This table already exists - created in 20251028000100_flow_v2_rbac.sql
-- Structure for reference:
--
-- create table if not exists public.workspace_memberships (
--   workspace_id uuid not null references public.workspaces(id) on delete cascade,
--   user_id uuid not null references auth.users(id) on delete cascade,
--   role text not null check (role in ('owner', 'editor', 'viewer')),
--   invited_by uuid references auth.users(id) on delete set null,
--   created_at timestamptz not null default timezone('utc', now()),
--   primary key (workspace_id, user_id)
-- );

-- ============================================================================
-- STEP 3: Create workspace_members table
-- ============================================================================
-- Separate membership table with UUID primary key
-- (Different from workspace_memberships which uses composite key)
-- ============================================================================

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz not null default timezone('utc', now()),

  -- Ensure user can only be a member once per workspace
  unique (workspace_id, user_id)
);

-- Indexes for workspace_members
create index if not exists workspace_members_workspace_id_idx
  on public.workspace_members (workspace_id);

create index if not exists workspace_members_user_id_idx
  on public.workspace_members (user_id);

create index if not exists workspace_members_workspace_user_idx
  on public.workspace_members (workspace_id, user_id);

-- Enable RLS
alter table public.workspace_members enable row level security;

-- RLS Policies for workspace_members
drop policy if exists "Users can view workspace members" on public.workspace_members;
create policy "Users can view workspace members"
  on public.workspace_members
  for select
  using (
    -- User is a member of the workspace
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

-- Comments for workspace_members
comment on table public.workspace_members is 'Workspace membership with UUID primary key (alternative to workspace_memberships)';
comment on column public.workspace_members.id is 'Primary key UUID';
comment on column public.workspace_members.workspace_id is 'Reference to workspace';
comment on column public.workspace_members.user_id is 'Reference to user';
comment on column public.workspace_members.role is 'Member role: owner, admin, member, viewer';
comment on column public.workspace_members.created_at is 'Timestamp when membership was created';
