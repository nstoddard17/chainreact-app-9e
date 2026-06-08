-- ChainReactV2 — official ChainReact template seed catalog
-- (Slice 4.WORKFLOW-TEMPLATES-MARKETPLACE-6 / CS-XT-8A).
--
-- DATA-ONLY seed (no schema change). Inserts the first 5 OFFICIAL templates so the Templates
-- marketplace has app-made cards to display with the ChainReact badge. Uses the existing
-- workflow_templates shape from CS-XT-4 / CS-XT-4B:
--   source = 'official'      (platform-made; drives isOfficial badge)
--   account_id = NULL        (platform-owned — required by the account↔source invariant)
--   visibility = 'public'    (listed in the marketplace; authenticated-readable)
--   creator_display_name_snapshot = 'ChainReact'  (SAFE attribution — never an email / user id)
--   created_by_user_id = NULL (no private author)
--   schema_version = 1        (mirrors EXPORT_SCHEMA_VERSION)
--
-- Being real DB rows (not a static catalog) means every existing path works unchanged: the
-- marketplace listing route lists them, POST /use creates a workflow from them, /fork copies
-- them (forked_from_template_id FK resolves), and the usage ledger (usage_events.template_id FK)
-- records against them — no application code changes, no FK violations.
--
-- NO-LEAK: definitions are CREDENTIAL-FREE schema only. Every node `config` is empty `{}` — the
-- user reconnects/reselects on use. No tokens, secrets, provider account labels, emails, user
-- ids, or Stripe ids appear. Only real registered (provider, type) node pairs are used:
--   triggers: gmail/new_email, native/schedule.fired, github/new_commit, native/manual.run
--   actions:  slack/send_channel_message, gmail/create_draft, github/create_issue
--
-- IDEMPOTENT: fixed ids + ON CONFLICT (id) DO NOTHING, so re-running (or db:push replays) is safe.
--
-- ROLLBACK (pre-launch): DELETE FROM public.workflow_templates WHERE source = 'official';

INSERT INTO public.workflow_templates
  (id, account_id, created_by_user_id, name, description, source, visibility,
   definition, schema_version, creator_display_name_snapshot, published_at)
VALUES
  (
    'c0ffee00-0000-4000-8000-000000000001', NULL, NULL,
    'New email to Slack alert',
    'When a new email lands in Gmail, post a heads-up in your team Slack channel.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"gmail","type":"new_email","position":{"x":400,"y":100},"config":{}},{"id":"notify","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"notify"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000002', NULL, NULL,
    'Scheduled Slack digest',
    'On a schedule you choose, post a recurring update to a Slack channel.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"native","type":"schedule.fired","position":{"x":400,"y":100},"config":{}},{"id":"post","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"post"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000003', NULL, NULL,
    'New commit to Slack',
    'When a new commit is pushed to GitHub, notify your team in Slack.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"github","type":"new_commit","position":{"x":400,"y":100},"config":{}},{"id":"notify","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"notify"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000004', NULL, NULL,
    'Draft a quick email',
    'Run on demand to draft a Gmail message from a template you fill in.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"native","type":"manual.run","position":{"x":400,"y":100},"config":{}},{"id":"draft","kind":"action","provider":"gmail","type":"create_draft","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"draft"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000005', NULL, NULL,
    'Email to GitHub issue',
    'Turn an incoming Gmail message into a GitHub issue so nothing slips through.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"gmail","type":"new_email","position":{"x":400,"y":100},"config":{}},{"id":"issue","kind":"action","provider":"github","type":"create_issue","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"issue"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  )
ON CONFLICT (id) DO NOTHING;
