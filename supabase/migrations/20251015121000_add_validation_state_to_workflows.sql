-- Ensure workflows table has validationState JSONB column used by app state
ALTER TABLE public.workflows
ADD COLUMN IF NOT EXISTS "validationState" JSONB DEFAULT '{}'::jsonb;

-- Backfill any existing rows where the column may be null
UPDATE public.workflows
SET "validationState" = '{}'::jsonb
WHERE "validationState" IS NULL;
