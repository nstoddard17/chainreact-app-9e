-- Restore the DEFAULT on workflows.id in case it was dropped.
-- gen_random_uuid() is built-in since Postgres 13.
ALTER TABLE public.workflows
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

NOTIFY pgrst, 'reload schema';
