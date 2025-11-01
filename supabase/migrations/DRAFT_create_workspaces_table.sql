-- ============================================================================
-- Workspaces Table Recreation Script
-- ============================================================================
-- Generated from analysis of existing foreign key references and usage patterns
--
-- This table is referenced by:
-- - workspace_memberships (workspace_id FK)
-- - flow_v2_definitions (workspace_id)
-- - flow_v2_templates (workspace_id)
-- - flow_v2_schedules (workspace_id)
-- - v2_secrets (workspace_id)
-- - v2_oauth_tokens (workspace_id)
-- ============================================================================

-- Create workspaces table
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  description text,

  -- Owner reference (user who created the workspace)
  owner_id uuid references auth.users(id) on delete set null,

  -- Timestamps
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),

  -- Optional: Workspace settings/metadata
  settings jsonb default '{}'::jsonb,
  metadata jsonb default '{}'::jsonb
);

-- Indexes for performance
create index if not exists workspaces_owner_id_idx
  on public.workspaces (owner_id);

create index if not exists workspaces_slug_idx
  on public.workspaces (slug)
  where slug is not null;

create index if not exists workspaces_created_at_idx
  on public.workspaces (created_at desc);

-- Enable RLS
alter table public.workspaces enable row level security;

-- RLS Policies
-- Users can view workspaces they are members of or own
drop policy if exists "Users can view workspaces they belong to" on public.workspaces;
create policy "Users can view workspaces they belong to"
  on public.workspaces
  for select
  using (
    -- User is the owner
    workspaces.owner_id = auth.uid()
    or
    -- User is a member
    exists (
      select 1
      from public.workspace_memberships wm
      where wm.workspace_id = workspaces.id
        and wm.user_id = auth.uid()
    )
  );

-- Workspace owners can update their workspaces
drop policy if exists "Workspace owners can update" on public.workspaces;
create policy "Workspace owners can update"
  on public.workspaces
  for update
  using (workspaces.owner_id = auth.uid())
  with check (workspaces.owner_id = auth.uid());

-- Users can create workspaces
drop policy if exists "Users can create workspaces" on public.workspaces;
create policy "Users can create workspaces"
  on public.workspaces
  for insert
  with check (auth.uid() is not null);

-- Workspace owners can delete their workspaces
drop policy if exists "Workspace owners can delete" on public.workspaces;
create policy "Workspace owners can delete"
  on public.workspaces
  for delete
  using (workspaces.owner_id = auth.uid());

-- Function to update updated_at timestamp
create or replace function public.update_workspaces_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- Trigger to auto-update updated_at
drop trigger if exists update_workspaces_updated_at_trigger on public.workspaces;
create trigger update_workspaces_updated_at_trigger
  before update on public.workspaces
  for each row
  execute function public.update_workspaces_updated_at();

-- Comments for documentation
comment on table public.workspaces is 'Workspaces contain flows, templates, schedules, and other resources. Users can be members of multiple workspaces.';
comment on column public.workspaces.id is 'Primary key UUID';
comment on column public.workspaces.name is 'Display name of the workspace';
comment on column public.workspaces.slug is 'URL-friendly unique identifier';
comment on column public.workspaces.description is 'Optional description of the workspace';
comment on column public.workspaces.owner_id is 'User who created and owns the workspace';
comment on column public.workspaces.settings is 'Workspace-level settings (JSON)';
comment on column public.workspaces.metadata is 'Additional workspace metadata (JSON)';
