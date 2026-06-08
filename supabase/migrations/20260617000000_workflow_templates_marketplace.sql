-- ChainReactV2 — workflow templates marketplace expansion + usage ledger
-- (Slice 4.WORKFLOW-TEMPLATES-MARKETPLACE-2 / CS-XT-4B).
--
-- Expands the CS-XT-4 workflow_templates foundation (20260616000000) to support the
-- Templates page + marketplace model BEFORE any routes/UI exist. STRUCTURE ONLY: no
-- create/list/use routes, no Templates UI, no import/instantiation, no reward system,
-- no billing. No row is read, written, or backfilled (existing rows just default to
-- private/user). CHANGES NO RUNTIME BEHAVIOR.
--
-- Model:
--   • visibility: 'private' (members only — default), 'public' (in marketplace),
--     'unlisted' (link-accessible, not listed). Private by default.
--   • source: 'user' (account-authored) | 'official' (platform/ChainReact-made,
--     "official" badge). Official templates are PLATFORM-owned, so account_id IS NULL
--     for them — enforced by workflow_templates_account_source_invariant. User
--     templates keep account_id NOT NULL.
--   • Lineage: forked_from_template_id points at the template a fork/copy came from
--     (ON DELETE SET NULL so a fork survives its parent being deleted). Only the
--     original creator edits the original; others fork/copy into their own account.
--   • Creator attribution: creator_display_name_snapshot is a SAFE display-name snapshot
--     (taken from user_profiles.display_name at publish time by a future route) — NEVER
--     an email or raw user id, so marketplace viewers (non-co-members) get attribution
--     without identity leakage. created_by_user_id stays internal (never in the
--     marketplace DTO).
--   • Counters: usage_count / fork_count are DENORMALIZED caches maintained by the
--     usage-ledger trigger below; the ledger (workflow_template_usage_events) is the
--     SOURCE OF TRUTH for future contributor rewards/ranking.
--
-- Marketplace read access at launch is AUTHENTICATED-only (anon has no GRANT) — there
-- is no anonymous public web browsing of templates yet.
--
-- ROLLBACK (pre-launch, no prod data): drop the trigger + function + usage table, then
-- the added columns/constraints/policy on workflow_templates.

-- ── 1. workflow_templates expansion ──────────────────────────────────────────

-- Official templates are platform-owned (no tenant account), so account_id must be
-- nullable; the invariant below keeps user templates account-owned.
ALTER TABLE public.workflow_templates ALTER COLUMN account_id DROP NOT NULL;

-- Widen source to include 'official' (built-ins are now modeled as official rows).
ALTER TABLE public.workflow_templates DROP CONSTRAINT workflow_templates_source_known;
ALTER TABLE public.workflow_templates
  ADD CONSTRAINT workflow_templates_source_known CHECK (source IN ('user', 'official'));

-- account_id ↔ source invariant: user ⇒ account-owned; official ⇒ platform-owned.
ALTER TABLE public.workflow_templates
  ADD CONSTRAINT workflow_templates_account_source_invariant CHECK (
    (source = 'user' AND account_id IS NOT NULL)
    OR (source = 'official' AND account_id IS NULL)
  );

ALTER TABLE public.workflow_templates
  ADD COLUMN visibility text NOT NULL DEFAULT 'private'
    CONSTRAINT workflow_templates_visibility_known
    CHECK (visibility IN ('private', 'public', 'unlisted')),
  ADD COLUMN published_at timestamptz,
  ADD COLUMN unpublished_at timestamptz,
  ADD COLUMN forked_from_template_id uuid
    REFERENCES public.workflow_templates(id) ON DELETE SET NULL,
  ADD COLUMN creator_display_name_snapshot text,
  ADD COLUMN usage_count integer NOT NULL DEFAULT 0,
  ADD COLUMN fork_count integer NOT NULL DEFAULT 0;

-- Marketplace listing filter (public/unlisted rows only).
CREATE INDEX workflow_templates_visibility_idx
  ON public.workflow_templates (visibility)
  WHERE visibility IN ('public', 'unlisted');

-- Official-catalog filter.
CREATE INDEX workflow_templates_official_idx
  ON public.workflow_templates (source)
  WHERE source = 'official';

-- Fork-lineage lookups.
CREATE INDEX workflow_templates_forked_from_idx
  ON public.workflow_templates (forked_from_template_id);

-- Marketplace SELECT policy (ADDITIVE — the CS-XT-4 member-only policy stays; RLS ORs
-- permissive policies). Authenticated users may read OFFICIAL templates and any
-- PUBLIC/UNLISTED template; anon gets nothing (no anon GRANT). Private user templates
-- remain reachable ONLY through the existing membership policy.
CREATE POLICY workflow_templates_select_marketplace
  ON public.workflow_templates
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (source = 'official' OR visibility IN ('public', 'unlisted'))
  );

-- ── 2. workflow_template_usage_events ledger ─────────────────────────────────
-- system-table: workflow_template_usage_events — service-role-only contributor-reward ledger; no tenant read path at launch (RLS on, no authenticated GRANT, so the Data API denies it).
--
-- The SOURCE OF TRUTH for future rewards/ranking. Service-role writes only; no tenant
-- read path (the public-safe aggregate is the denormalized usage_count/fork_count on the
-- template, exposed via the marketplace SELECT policy — the raw ledger, which carries
-- actor/account/created-workflow ids, never reaches a client).

CREATE TABLE public.workflow_template_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The template that was used/forked/copied. CASCADE: events are meaningless without it.
  template_id uuid NOT NULL REFERENCES public.workflow_templates(id) ON DELETE CASCADE,

  -- Who performed the action. SET NULL on user delete — the reward-relevant fact (a use
  -- happened) survives the actor being deleted.
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- The account the template was used INTO. SET NULL (not CASCADE) so the ledger row
  -- survives that account's deletion — reward history must outlive a tenant account.
  target_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,

  event_type text NOT NULL
    CONSTRAINT workflow_template_usage_events_type_known
    CHECK (event_type IN ('used_to_create_workflow', 'forked', 'saved_copy')),

  -- The workflow created from the template (used_to_create_workflow), if any. SET NULL.
  created_workflow_id uuid REFERENCES public.workflows(id) ON DELETE SET NULL,

  -- The new template produced by a fork/saved_copy, if any. SET NULL.
  created_template_id uuid REFERENCES public.workflow_templates(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX workflow_template_usage_events_template_idx
  ON public.workflow_template_usage_events (template_id);
CREATE INDEX workflow_template_usage_events_actor_idx
  ON public.workflow_template_usage_events (actor_user_id);
CREATE INDEX workflow_template_usage_events_target_account_idx
  ON public.workflow_template_usage_events (target_account_id);
CREATE INDEX workflow_template_usage_events_event_type_idx
  ON public.workflow_template_usage_events (event_type);
CREATE INDEX workflow_template_usage_events_created_at_idx
  ON public.workflow_template_usage_events (created_at);

ALTER TABLE public.workflow_template_usage_events ENABLE ROW LEVEL SECURITY;

-- service_role owns all access. NO authenticated/anon GRANT — the ledger is never
-- client-reachable (a SELECT/INSERT as authenticated returns 42501).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_template_usage_events TO service_role;

-- ── 3. denormalized counter maintenance (ledger = source of truth) ───────────
-- On each ledger insert, bump the parent template's cache: 'forked' → fork_count,
-- everything else → usage_count. Runs in the service-role insert context (RLS-bypassed),
-- so the counters stay consistent without a read-modify-write race in app code.

CREATE FUNCTION public.bump_template_usage_counters()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.event_type = 'forked' THEN
    UPDATE public.workflow_templates
      SET fork_count = fork_count + 1
      WHERE id = NEW.template_id;
  ELSE
    UPDATE public.workflow_templates
      SET usage_count = usage_count + 1
      WHERE id = NEW.template_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER workflow_template_usage_events_bump_counters
  AFTER INSERT ON public.workflow_template_usage_events
  FOR EACH ROW EXECUTE FUNCTION public.bump_template_usage_counters();
