-- ChainReactV2 — workflow templates foundation
-- (Slice 4.WORKFLOW-PORTABILITY-TEMPLATES-TIER-POLICY-4 / CS-XT-4).
--
-- Schema-only foundation per
-- docs/slices/phase-4/workflows/workflow-export-template-tier-policy-plan.md (§6).
-- STRUCTURE ONLY: no create/list/use routes, no UI, no import/instantiation, no
-- built-in catalog, no billing. No row is read, written, or backfilled.
-- CHANGES NO RUNTIME BEHAVIOR.
--
-- public.workflow_templates stores ACCOUNT-OWNED, USER-AUTHORED workflow templates.
-- Each `definition` is the CREDENTIAL-FREE, SANITIZED export graph (the same shape +
-- redaction the export sanitizer produces — services/workflows/exportWorkflow.ts):
-- tokens, secrets, provider account labels/emails, integration ids, credential-owner
-- ids, and per-node grants NEVER appear. Those live in sibling tables (integrations,
-- workflow_node_credentials) that this table NEVER references — so they are
-- structurally excluded. The enforcing create helper
-- (services/workflows/createTemplateFromWorkflow.ts) runs the sanitizer before insert;
-- the table only ever holds sanitized graphs.
--
-- Tier policy (enforced later in code, NOT in this table): custom-template caps live in
-- core/billing/planPolicy.ts (Free 0 / Pro 25 / Team 50 / Business 250 / Enterprise
-- config). Shared-account authoring becomes owner/admin-gated at the future create
-- route. This slice ships the data layer + service-role repo only.
--
-- Built-ins: deferred. `source` is constrained to 'user' for now and `account_id` is
-- NOT NULL — first-party built-in templates ship as a static code catalog (plan §6.1),
-- so no NULL-account/system rows exist yet. Widening `source` to add 'builtin' is a
-- future migration when built-ins are DB-modeled.
--
-- ROLLBACK (pre-launch, no prod data): DROP TABLE public.workflow_templates. Nothing
-- depends on it (this slice wires no caller), so this is a clean reverse.

CREATE TABLE public.workflow_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Owning account — the authority root, same as workflows. ON DELETE CASCADE: a
  -- template has no meaning without its account (deleting the account removes its
  -- templates).
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,

  -- Who authored the template. Provenance only — NOT authorization (any account member
  -- with sufficient role may use it; create/edit is role-gated in code). SET NULL if
  -- that user is later deleted; the template survives as an account asset.
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Human label, e.g. 'Lead intake → Slack'.
  name text NOT NULL,

  -- Optional human description.
  description text,

  -- Origin classification. 'user' = account-authored. Built-ins are deferred (static
  -- code catalog), so the only valid value today is 'user'. CHECK keeps the column
  -- forward-stable; adding 'builtin' later is a deliberate migration.
  source text NOT NULL DEFAULT 'user'
    CONSTRAINT workflow_templates_source_known CHECK (source IN ('user')),

  -- The SANITIZED, credential-free workflow graph (nodes/edges/config) — the export
  -- sanitizer's output shape. NEVER the raw workflows.draft_definition (which could
  -- carry a secret pasted into a free-text config field); the create helper sanitizes
  -- before insert.
  definition jsonb NOT NULL,

  -- Export schema version the definition was produced under (mirrors
  -- EXPORT_SCHEMA_VERSION) — so a future import/instantiation can migrate older shapes.
  schema_version integer NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- List / count an account's templates (the limit check counts by account; CS-XT-5).
CREATE INDEX workflow_templates_account_idx ON public.workflow_templates (account_id);

-- Newest-first listing within an account.
CREATE INDEX workflow_templates_account_created_idx
  ON public.workflow_templates (account_id, created_at DESC);

-- Author provenance lookups.
CREATE INDEX workflow_templates_created_by_idx
  ON public.workflow_templates (created_by_user_id);

CREATE TRIGGER workflow_templates_set_updated_at
  BEFORE UPDATE ON public.workflow_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS + GRANTs ─────────────────────────────────────────────────────────────
--
-- Reads: account MEMBERS may SELECT their account's templates (the definition is
-- credential-free and meant to be browsed/used by members) — gated by an active,
-- non-frozen membership; non-members + anon see nothing (no existence oracle).
--
-- Writes: SERVICE-ROLE ONLY. There is NO authenticated INSERT/UPDATE/DELETE policy and
-- NO authenticated write GRANT, so no client can write templates directly — the future
-- create route (CS-XT-5) goes through the service-role repo AFTER validating role +
-- tier limit + sanitizing. This prevents bypassing the tier/role/sanitizer gate.

ALTER TABLE public.workflow_templates ENABLE ROW LEVEL SECURITY;

-- Data API access (explicit GRANTs required after Supabase removes implicit grants on
-- public tables, Oct 30 2026). authenticated may READ (membership-gated by the policy);
-- service_role owns all access. authenticated gets NO write grant.
GRANT SELECT ON public.workflow_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_templates TO service_role;

CREATE POLICY workflow_templates_select_account_member
  ON public.workflow_templates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.account_memberships am
      JOIN public.accounts a ON a.id = am.account_id
      WHERE am.account_id = workflow_templates.account_id
        AND am.user_id = auth.uid()
        AND a.deletion_status = 'active'
    )
  );
