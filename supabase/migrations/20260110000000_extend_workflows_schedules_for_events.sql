alter table public.workflows_schedules
  add column if not exists trigger_type text,
  add column if not exists provider_id text,
  add column if not exists node_id uuid,
  add column if not exists event_id text,
  add column if not exists scheduled_for timestamptz,
  add column if not exists status text not null default 'pending',
  add column if not exists payload jsonb,
  add column if not exists updated_at timestamptz not null default timezone('utc'::text, now());

create index if not exists workflows_schedules_due_idx
  on public.workflows_schedules (scheduled_for, status);

create unique index if not exists workflows_schedules_event_idx
  on public.workflows_schedules (workflow_id, node_id, trigger_type, event_id);
