-- ChainReactV2 — RETIRE the simple (<=4-node) official templates (TEMPLATE-QUALITY-1).
--
-- WHY: the official catalog standard is now COMPLETE BUSINESS PROCESSES — every platform
-- template must contain at least FIVE meaningful nodes (trigger included) and model a real
-- end-to-end business outcome. Seed batches 1-3 (20260618000000, 20260708000000,
-- 20260709000000) shipped 75 two/three-node integration demos that no longer meet that bar.
-- This migration retires ALL 75. The 15 batch-4 complex templates (...04c-...05a) remain.
--
-- DATA-ONLY, DELETE-ONLY, GUARDED, IDEMPOTENT, FORWARD-ONLY:
--   * The earlier seed migrations are APPLIED and are never edited (locked migration rule);
--     this is a NEW forward migration that deletes exactly the retired official rows.
--   * GUARD: source = 'official' AND account_id IS NULL AND id IN (<fixed official UUIDs>).
--     User/community templates (source='user', non-null account_id) can never match, and no
--     node-count predicate is used — only the exact retired platform ids.
--   * IDEMPOTENT: re-running (or a db:push replay) deletes zero rows and converges.
--   * No DDL, no RLS/GRANT/POLICY change, no INSERT/UPDATE.
--
-- USER DATA IS PRESERVED:
--   * Workflows previously created FROM these templates are untouched (workflows carry no FK
--     to workflow_templates; the definition was copied at /use time).
--   * Forked/copied templates survive: workflow_templates.forked_from_template_id is
--     ON DELETE SET NULL (lineage pointer clears; the fork itself remains).
--   * workflow_template_usage_events rows for these templates cascade away by schema design
--     (template_id ... ON DELETE CASCADE) — acceptable: officials are platform-owned, so no
--     contributor-reward ledger is affected.
--   * Stale links/ids resolve through the existing template_not_found (404) path.
--
-- The Templates page, marketplace search/category filters, template detail routes, and the
-- AI/React-Agent official-template matcher all read these same rows (single source of truth),
-- so this one deletion purges every surface.

DELETE FROM public.workflow_templates
WHERE source = 'official'
  AND account_id IS NULL
  AND id IN (
    'c0ffee00-0000-4000-8000-000000000001',
    'c0ffee00-0000-4000-8000-000000000002',
    'c0ffee00-0000-4000-8000-000000000003',
    'c0ffee00-0000-4000-8000-000000000004',
    'c0ffee00-0000-4000-8000-000000000005',
    'c0ffee00-0000-4000-8000-000000000006',
    'c0ffee00-0000-4000-8000-000000000007',
    'c0ffee00-0000-4000-8000-000000000008',
    'c0ffee00-0000-4000-8000-000000000009',
    'c0ffee00-0000-4000-8000-00000000000a',
    'c0ffee00-0000-4000-8000-00000000000b',
    'c0ffee00-0000-4000-8000-00000000000c',
    'c0ffee00-0000-4000-8000-00000000000d',
    'c0ffee00-0000-4000-8000-00000000000e',
    'c0ffee00-0000-4000-8000-00000000000f',
    'c0ffee00-0000-4000-8000-000000000010',
    'c0ffee00-0000-4000-8000-000000000011',
    'c0ffee00-0000-4000-8000-000000000012',
    'c0ffee00-0000-4000-8000-000000000013',
    'c0ffee00-0000-4000-8000-000000000014',
    'c0ffee00-0000-4000-8000-000000000015',
    'c0ffee00-0000-4000-8000-000000000016',
    'c0ffee00-0000-4000-8000-000000000017',
    'c0ffee00-0000-4000-8000-000000000018',
    'c0ffee00-0000-4000-8000-000000000019',
    'c0ffee00-0000-4000-8000-00000000001a',
    'c0ffee00-0000-4000-8000-00000000001b',
    'c0ffee00-0000-4000-8000-00000000001c',
    'c0ffee00-0000-4000-8000-00000000001d',
    'c0ffee00-0000-4000-8000-00000000001e',
    'c0ffee00-0000-4000-8000-00000000001f',
    'c0ffee00-0000-4000-8000-000000000020',
    'c0ffee00-0000-4000-8000-000000000021',
    'c0ffee00-0000-4000-8000-000000000022',
    'c0ffee00-0000-4000-8000-000000000023',
    'c0ffee00-0000-4000-8000-000000000024',
    'c0ffee00-0000-4000-8000-000000000025',
    'c0ffee00-0000-4000-8000-000000000026',
    'c0ffee00-0000-4000-8000-000000000027',
    'c0ffee00-0000-4000-8000-000000000028',
    'c0ffee00-0000-4000-8000-000000000029',
    'c0ffee00-0000-4000-8000-00000000002a',
    'c0ffee00-0000-4000-8000-00000000002b',
    'c0ffee00-0000-4000-8000-00000000002c',
    'c0ffee00-0000-4000-8000-00000000002d',
    'c0ffee00-0000-4000-8000-00000000002e',
    'c0ffee00-0000-4000-8000-00000000002f',
    'c0ffee00-0000-4000-8000-000000000030',
    'c0ffee00-0000-4000-8000-000000000031',
    'c0ffee00-0000-4000-8000-000000000032',
    'c0ffee00-0000-4000-8000-000000000033',
    'c0ffee00-0000-4000-8000-000000000034',
    'c0ffee00-0000-4000-8000-000000000035',
    'c0ffee00-0000-4000-8000-000000000036',
    'c0ffee00-0000-4000-8000-000000000037',
    'c0ffee00-0000-4000-8000-000000000038',
    'c0ffee00-0000-4000-8000-000000000039',
    'c0ffee00-0000-4000-8000-00000000003a',
    'c0ffee00-0000-4000-8000-00000000003b',
    'c0ffee00-0000-4000-8000-00000000003c',
    'c0ffee00-0000-4000-8000-00000000003d',
    'c0ffee00-0000-4000-8000-00000000003e',
    'c0ffee00-0000-4000-8000-00000000003f',
    'c0ffee00-0000-4000-8000-000000000040',
    'c0ffee00-0000-4000-8000-000000000041',
    'c0ffee00-0000-4000-8000-000000000042',
    'c0ffee00-0000-4000-8000-000000000043',
    'c0ffee00-0000-4000-8000-000000000044',
    'c0ffee00-0000-4000-8000-000000000045',
    'c0ffee00-0000-4000-8000-000000000046',
    'c0ffee00-0000-4000-8000-000000000047',
    'c0ffee00-0000-4000-8000-000000000048',
    'c0ffee00-0000-4000-8000-000000000049',
    'c0ffee00-0000-4000-8000-00000000004a',
    'c0ffee00-0000-4000-8000-00000000004b'
  );
