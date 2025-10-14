-- Extend templates table for admin authoring workflow
ALTER TABLE public.templates
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';

ALTER TABLE public.templates
ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

ALTER TABLE public.templates
ADD COLUMN IF NOT EXISTS primary_setup_target TEXT;

ALTER TABLE public.templates
ADD COLUMN IF NOT EXISTS setup_overview JSONB;

ALTER TABLE public.templates
ADD COLUMN IF NOT EXISTS default_field_values JSONB;

ALTER TABLE public.templates
ADD COLUMN IF NOT EXISTS creator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.templates
ADD COLUMN IF NOT EXISTS draft_nodes JSONB;

ALTER TABLE public.templates
ADD COLUMN IF NOT EXISTS draft_connections JSONB;

ALTER TABLE public.templates
ADD COLUMN IF NOT EXISTS draft_default_field_values JSONB;

ALTER TABLE public.templates
ADD COLUMN IF NOT EXISTS draft_integration_setup JSONB;

ALTER TABLE public.templates
ADD COLUMN IF NOT EXISTS draft_setup_overview JSONB;

-- Backfill status for existing templates
UPDATE public.templates
SET status = CASE
  WHEN status IS NULL AND is_public = true THEN 'published'
  WHEN status IS NULL THEN 'draft'
  ELSE status
END
WHERE status IS NULL;

-- Ensure consistent default
ALTER TABLE public.templates
ALTER COLUMN status SET DEFAULT 'draft';

CREATE INDEX IF NOT EXISTS templates_status_idx ON public.templates(status);

-- Template assets table for setup resources (CSV, docs, etc.)
CREATE TABLE IF NOT EXISTS public.template_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES public.templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  metadata JSONB,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS template_assets_template_id_idx ON public.template_assets(template_id);
CREATE INDEX IF NOT EXISTS template_assets_type_idx ON public.template_assets(asset_type);

ALTER TABLE public.template_assets ENABLE ROW LEVEL SECURITY;

-- Admins can manage all template assets; template owners can manage their own assets
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'template_assets'
      AND policyname = 'Template assets selectable when template is public'
  ) THEN
    CREATE POLICY "Template assets selectable when template is public"
      ON public.template_assets
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.templates t
          WHERE t.id = template_assets.template_id
            AND (t.is_public = true OR auth.uid() = COALESCE(t.creator_id, t.created_by))
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'template_assets'
      AND policyname = 'Template asset owners can insert'
  ) THEN
    CREATE POLICY "Template asset owners can insert"
      ON public.template_assets
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.templates t
          WHERE t.id = template_assets.template_id
            AND auth.uid() = COALESCE(t.creator_id, t.created_by)
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'template_assets'
      AND policyname = 'Template asset owners can update'
  ) THEN
    CREATE POLICY "Template asset owners can update"
      ON public.template_assets
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.templates t
          WHERE t.id = template_assets.template_id
            AND auth.uid() = COALESCE(t.creator_id, t.created_by)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.templates t
          WHERE t.id = template_assets.template_id
            AND auth.uid() = COALESCE(t.creator_id, t.created_by)
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'template_assets'
      AND policyname = 'Template asset owners can delete'
  ) THEN
    CREATE POLICY "Template asset owners can delete"
      ON public.template_assets
      FOR DELETE
      USING (
        EXISTS (
          SELECT 1 FROM public.templates t
          WHERE t.id = template_assets.template_id
            AND auth.uid() = COALESCE(t.creator_id, t.created_by)
        )
      );
  END IF;
END
$$;
