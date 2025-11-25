-- Keep revisions lean: retain newest 50 per workflow and anything newer than 45 days.
-- Published revisions are preserved regardless of age.

begin;

-- Ensure pg_cron is available for scheduling
create extension if not exists pg_cron with schema cron;

create or replace function public.cleanup_workflow_revisions(retention_days integer default 45, keep_latest integer default 50)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.workflows_revisions wr
  using (
    select
      id,
      row_number() over (partition by workflow_id order by version desc, created_at desc) as rn
    from public.workflows_revisions
  ) ranked
  where wr.id = ranked.id
    and ranked.rn > keep_latest
    and coalesce(wr.published, false) = false
    and wr.created_at < now() - make_interval(days => retention_days);
end;
$$;

-- Schedule daily cleanup at 06:00 UTC
do $$
declare
  existing_id integer;
begin
  select jobid into existing_id from cron.job where jobname = 'cleanup-workflow-revisions' limit 1;
  if existing_id is not null then
    perform cron.unschedule(existing_id);
  end if;

  perform cron.schedule(
    job_name := 'cleanup-workflow-revisions',
    schedule := '0 6 * * *',
    command := 'select public.cleanup_workflow_revisions();'
  );
end;
$$;

commit;
