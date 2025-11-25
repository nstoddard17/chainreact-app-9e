-- Task quota enforcement: ensure finite limits and usage tracking

-- Profiles: add/normalize task limits and usage
alter table if exists public.profiles
  add column if not exists tasks_limit integer not null default 100,
  add column if not exists tasks_used integer not null default 0;

-- Normalize existing data (remove any "unlimited" or invalid values)
update public.profiles
  set tasks_limit = 100
  where tasks_limit is null or tasks_limit <= 0;

update public.profiles
  set tasks_used = greatest(coalesce(tasks_used, 0), 0);

-- Recreate constraints
alter table if exists public.profiles
  drop constraint if exists tasks_limit_positive,
  drop constraint if exists tasks_used_non_negative;

alter table if exists public.profiles
  add constraint tasks_limit_positive check (tasks_limit > 0),
  add constraint tasks_used_non_negative check (tasks_used >= 0);

create index if not exists idx_profiles_tasks_quota on public.profiles(tasks_used, tasks_limit);


-- Teams: add/normalize task limits and usage (guarded if table exists)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'teams') then
    execute $sql$
      alter table public.teams
        add column if not exists tasks_limit integer not null default 10000,
        add column if not exists tasks_used integer not null default 0;

      update public.teams
        set tasks_limit = 10000
        where tasks_limit is null or tasks_limit <= 0;

      update public.teams
        set tasks_used = greatest(coalesce(tasks_used, 0), 0);

      alter table public.teams
        drop constraint if exists tasks_limit_positive,
        drop constraint if exists tasks_used_non_negative;

      alter table public.teams
        add constraint tasks_limit_positive check (tasks_limit > 0),
        add constraint tasks_used_non_negative check (tasks_used >= 0);

      create index if not exists idx_teams_tasks_quota on public.teams(tasks_used, tasks_limit);
    $sql$;
  end if;
end
$$;


-- Workflow executions: store tasks used per run for analytics (only if it is a TABLE, not a VIEW)
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'workflow_executions'
      and table_type = 'BASE TABLE'
  ) then
    alter table public.workflow_executions
      add column if not exists tasks_used integer;
  end if;
end
$$;
