-- ChainReactV2 — remove STRAY, non-catalog official templates (GOOGLE-REVIEW-TEMPLATE-1).
--
-- WHY: the marketplace can show an official-badged card named "Official Starter" with an empty
-- definition (rendered as "0 steps", nothing to use). It is NOT part of the seeded catalog — no
-- seed migration has ever inserted that name, and no application code path mints an official
-- template. Its only producer in this repo is the opt-in DB security suite
-- tests/integration/security/workflow-templates-rls.test.ts, which inserts
--   { account_id: NULL, created_by_user_id: <test user>, name: 'Official Starter',
--     definition: { nodes: [], edges: [] }, source: 'official', visibility: 'public' }
-- and deletes it again in afterAll. An interrupted / crashed run leaves the row behind, where the
-- marketplace listing filter (source = 'official') picks it up like any real official template.
--
-- This migration removes exactly that class of row, forward-only and idempotent.
--
-- GUARD 1 — platform-invariant violation. Every LEGITIMATE official template is inserted by a
-- seed migration with created_by_user_id NULL (batches 1-5 and the Google Review seed all do),
-- and no runtime code path creates source='official' at all. So an official, account-less row
-- WITH an author is definitionally a test artifact. The guard can never match a user/community
-- template (those have source='user' and a non-null account_id).
--
-- GUARD 2 — the exact broken card shape: an official, account-less, author-less row literally
-- named 'Official Starter' whose definition has no nodes. No seeded template carries that name
-- and every seeded template has at least five nodes, so this can never match the real catalog.
--
-- DATA-ONLY, DELETE-ONLY, IDEMPOTENT, FORWARD-ONLY: no DDL, no RLS / GRANT / POLICY change, no
-- INSERT / UPDATE. Re-running (or a db:push replay) deletes zero rows and converges.
--
-- Deliberately NOT named *_retire_official_templates*.sql: the retirement guard in
-- tests/unit/migrations/officialTemplateCatalogIntegrity.test.ts models catalog retirement of
-- FIXED seeded ids, which does not apply here — a stray test row has a random uuid that no
-- migration can name. The dedicated guard for this file lives in
-- tests/unit/migrations/googleReviewTemplate.test.ts.

DELETE FROM public.workflow_templates
WHERE source = 'official'
  AND account_id IS NULL
  AND created_by_user_id IS NOT NULL;

DELETE FROM public.workflow_templates
WHERE source = 'official'
  AND account_id IS NULL
  AND created_by_user_id IS NULL
  AND name = 'Official Starter'
  AND COALESCE(jsonb_array_length(definition -> 'nodes'), 0) = 0;
