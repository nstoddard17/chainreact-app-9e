-- ============================================================================
-- Workspaces Table - Accurate Recreation Script
-- ============================================================================
-- Based on actual table export from Supabase
-- Columns: id, name, slug, description, owner_id, settings, avatar_url,
--          created_at, updated_at
-- ============================================================================

-- Create workspaces table with exact column structure
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

-- Create unique index on slug (based on pattern: personal-{user_id})
create unique index if not exists workspaces_slug_key
  on public.workspaces (slug);

-- Create index on owner_id for fast lookups
create index if not exists workspaces_owner_id_idx
  on public.workspaces (owner_id);

-- Create index on created_at for sorting
create index if not exists workspaces_created_at_idx
  on public.workspaces (created_at desc);

-- Enable Row Level Security
alter table public.workspaces enable row level security;

-- RLS Policy: Users can view workspaces they own or are members of
drop policy if exists "Users can view workspaces they belong to" on public.workspaces;
create policy "Users can view workspaces they belong to"
  on public.workspaces
  for select
  using (
    -- User is the owner
    owner_id = auth.uid()
    or
    -- User is a member via workspace_memberships table
    exists (
      select 1
      from public.workspace_memberships wm
      where wm.workspace_id = workspaces.id
        and wm.user_id = auth.uid()
    )
  );

-- RLS Policy: Users can create their own workspaces
drop policy if exists "Users can create workspaces" on public.workspaces;
create policy "Users can create workspaces"
  on public.workspaces
  for insert
  with check (auth.uid() is not null and owner_id = auth.uid());

-- RLS Policy: Workspace owners can update their workspaces
drop policy if exists "Workspace owners can update" on public.workspaces;
create policy "Workspace owners can update"
  on public.workspaces
  for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- RLS Policy: Workspace owners can delete their workspaces
drop policy if exists "Workspace owners can delete" on public.workspaces;
create policy "Workspace owners can delete"
  on public.workspaces
  for delete
  using (owner_id = auth.uid());

-- Function to automatically update updated_at timestamp
create or replace function public.update_workspaces_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- Trigger to auto-update updated_at on UPDATE
drop trigger if exists update_workspaces_updated_at_trigger on public.workspaces;
create trigger update_workspaces_updated_at_trigger
  before update on public.workspaces
  for each row
  execute function public.update_workspaces_updated_at();

-- Add helpful comments
comment on table public.workspaces is 'Personal workspaces for users. Each user gets a workspace for their flows, templates, and resources.';
comment on column public.workspaces.id is 'Primary key UUID';
comment on column public.workspaces.name is 'Display name of the workspace (e.g., "username''s Workspace")';
comment on column public.workspaces.slug is 'Unique slug identifier (format: personal-{user_id})';
comment on column public.workspaces.description is 'Optional workspace description';
comment on column public.workspaces.owner_id is 'User who owns this workspace (references auth.users)';
comment on column public.workspaces.settings is 'Workspace settings stored as JSONB';
comment on column public.workspaces.avatar_url is 'Optional avatar/logo URL for the workspace';
comment on column public.workspaces.created_at is 'Timestamp when workspace was created';
comment on column public.workspaces.updated_at is 'Timestamp when workspace was last updated (auto-updated by trigger)';
