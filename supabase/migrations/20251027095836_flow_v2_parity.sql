-- Flow v2 Parity Sprint migrations
alter table public.flow_v2_definitions
  add column if not exists workspace_id uuid,
  add column if not exists owner_id uuid,
  add column if not exists flow_v2_enabled boolean not null default true;

alter table public.flow_v2_revisions
  add column if not exists published boolean not null default false,
  add column if not exists published_at timestamptz,
  add column if not exists published_by uuid;

alter table public.flow_v2_runs
  add column if not exists estimated_cost numeric(18,6) not null default 0,
  add column if not exists actual_cost numeric(18,6) not null default 0;

alter table public.flow_v2_run_nodes
  add column if not exists estimated_cost numeric(18,6) not null default 0,
  add column if not exists token_count integer,
  add column if not exists error_type text;

create table if not exists public.flow_v2_templates (
  id uuid primary key,
  flow_id uuid not null references public.flow_v2_definitions(id) on delete cascade,
  revision_id uuid not null references public.flow_v2_revisions(id) on delete cascade,
  workspace_id uuid,
  name text not null,
  description text,
  tags text[] default '{}',
  thumbnail_url text,
  graph jsonb not null,
  metadata jsonb,
  created_by uuid,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.flow_v2_schedules (
  id uuid primary key,
  flow_id uuid not null references public.flow_v2_definitions(id) on delete cascade,
  revision_id uuid references public.flow_v2_revisions(id) on delete set null,
  workspace_id uuid,
  cron_expression text not null,
  timezone text not null default 'UTC',
  enabled boolean not null default true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.v2_secrets (
  id uuid primary key,
  workspace_id uuid not null,
  name text not null,
  value_encrypted text not null,
  created_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, name)
);

create table if not exists public.v2_oauth_tokens (
  id uuid primary key,
  workspace_id uuid not null,
  provider text not null,
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  expires_at timestamptz,
  metadata jsonb,
  created_by uuid,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.flow_v2_published_revisions (
  id uuid primary key,
  flow_id uuid not null references public.flow_v2_definitions(id) on delete cascade,
  revision_id uuid not null references public.flow_v2_revisions(id) on delete cascade,
  published_by uuid,
  published_at timestamptz not null default timezone('utc', now()),
  notes text
);

create table if not exists public.flow_v2_node_logs (
  id uuid primary key,
  run_id uuid not null references public.flow_v2_runs(id) on delete cascade,
  node_id text not null,
  status text not null,
  latency_ms integer,
  cost numeric(18,6),
  retries integer,
  created_at timestamptz not null default timezone('utc', now())
);

-- RLS enablement (policies to be defined separately)
alter table public.flow_v2_definitions enable row level security;
alter table public.flow_v2_revisions enable row level security;
alter table public.flow_v2_runs enable row level security;
alter table public.flow_v2_run_nodes enable row level security;
alter table public.flow_v2_templates enable row level security;
alter table public.flow_v2_schedules enable row level security;
alter table public.v2_secrets enable row level security;
alter table public.v2_oauth_tokens enable row level security;
alter table public.flow_v2_published_revisions enable row level security;
alter table public.flow_v2_node_logs enable row level security;
