-- Flow v2 core tables
create table if not exists public.flow_v2_definitions (
  id uuid primary key,
  name text not null,
  description text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.flow_v2_revisions (
  id uuid primary key,
  flow_id uuid not null references public.flow_v2_definitions(id) on delete cascade,
  version int not null,
  graph jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint flow_v2_revisions_unique_version unique (flow_id, version)
);

create index if not exists flow_v2_revisions_flow_id_idx on public.flow_v2_revisions(flow_id);
create index if not exists flow_v2_revisions_flow_id_version_idx on public.flow_v2_revisions(flow_id, version desc);

create table if not exists public.flow_v2_runs (
  id uuid primary key,
  flow_id uuid not null references public.flow_v2_definitions(id) on delete cascade,
  revision_id uuid not null references public.flow_v2_revisions(id) on delete restrict,
  status text not null,
  inputs jsonb,
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz,
  metadata jsonb,
  constraint flow_v2_runs_status_check check (status in ('pending','running','success','error','cancelled'))
);

create index if not exists flow_v2_runs_flow_id_idx on public.flow_v2_runs(flow_id);
create index if not exists flow_v2_runs_revision_id_idx on public.flow_v2_runs(revision_id);
create index if not exists flow_v2_runs_status_idx on public.flow_v2_runs(status);

create table if not exists public.flow_v2_run_nodes (
  id uuid primary key,
  run_id uuid not null references public.flow_v2_runs(id) on delete cascade,
  node_id text not null,
  status text not null,
  input jsonb,
  output jsonb,
  error jsonb,
  attempts int not null default 0,
  duration_ms int,
  cost numeric(18,6),
  created_at timestamptz not null default timezone('utc', now()),
  constraint flow_v2_run_nodes_status_check check (status in ('pending','running','success','error','skipped'))
);

create index if not exists flow_v2_run_nodes_run_id_idx on public.flow_v2_run_nodes(run_id);
create index if not exists flow_v2_run_nodes_run_id_node_id_idx on public.flow_v2_run_nodes(run_id, node_id);

create table if not exists public.flow_v2_lineage (
  id uuid primary key,
  run_id uuid not null references public.flow_v2_runs(id) on delete cascade,
  to_node_id text not null,
  edge_id text not null,
  target_path text not null,
  from_node_id text not null,
  expr text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists flow_v2_lineage_run_id_idx on public.flow_v2_lineage(run_id);
create index if not exists flow_v2_lineage_target_idx on public.flow_v2_lineage(run_id, to_node_id, target_path);
