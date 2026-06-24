-- ChainReactV2 — official ChainReact template seed catalog (batch 2)
-- (Slice 4.WORKFLOW-TEMPLATES-MARKETPLACE-OFFICIAL-CATALOG-1).
--
-- DATA-ONLY seed (no schema change). Forward-only follow-up to
-- 20260618000000_seed_official_templates.sql (batch 1, 5 templates). Adds 45 MORE official
-- templates so the Templates marketplace ships with a substantial app-made catalog spanning
-- 7 categories: Sales/CRM, Ecommerce/Payments, Marketing/Growth, Team operations,
-- Project/Engineering, File/Document, and Personal productivity. Total official rows: 50.
--
-- Uses the EXISTING workflow_templates shape from CS-XT-4 / CS-XT-4B — no new infrastructure,
-- no second catalog. Every row mirrors batch 1 exactly:
--   source = 'official'      (platform-made; drives the isOfficial badge)
--   account_id = NULL        (platform-owned — required by the account<->source invariant)
--   visibility = 'public'    (listed in the marketplace; authenticated-readable)
--   creator_display_name_snapshot = 'ChainReact'  (SAFE attribution — never an email / user id)
--   created_by_user_id = NULL (no private author)
--   schema_version = 1        (mirrors EXPORT_SCHEMA_VERSION)
--
-- Being real DB rows (not a static catalog) means every existing path works unchanged: the
-- marketplace listing route lists them, POST /use creates a workflow from them, /fork copies
-- them (forked_from_template_id FK resolves), and the usage ledger records against them — no
-- application code changes, no FK violations.
--
-- SAFE PARTIAL TEMPLATES: the graph shape (trigger + actions + edges) is prebuilt; every node
-- `config` is empty `{}`. All account-specific fields (channel ids, recipients, board/list/sheet
-- ids, calendar ids, etc.) stay BLANK so the builder/setup UI collects them on /use. No hidden
-- defaults for recipient-visible or high-risk fields.
--
-- NO-LEAK: definitions are CREDENTIAL-FREE schema only. No tokens, secrets, provider account
-- labels, emails, user ids, integration ids, channel/board/list/sheet/calendar/file ids, or
-- Stripe ids appear anywhere. Only real registered (provider, type) node pairs are used —
-- validated against the live discovery registry by
-- tests/structure/official-template-node-registration.test.ts and
-- tests/unit/migrations/seedOfficialTemplates.test.ts.
--
-- IDEMPOTENT + FORWARD-ONLY: fixed ids (continuing the batch-1 sequence ...006..050) +
-- ON CONFLICT (id) DO NOTHING, so re-running (or db:push replays) is safe and never modifies
-- batch 1. This migration is never edited after authoring; future batches add new files.
--
-- ROLLBACK (pre-launch): DELETE FROM public.workflow_templates
--   WHERE id BETWEEN 'c0ffee00-0000-4000-8000-000000000006'
--                AND 'c0ffee00-0000-4000-8000-000000000032' AND source = 'official';

INSERT INTO public.workflow_templates
  (id, account_id, created_by_user_id, name, description, source, visibility,
   definition, schema_version, creator_display_name_snapshot, published_at)
VALUES
  -- ── 1. Sales / CRM ──────────────────────────────────────────────────────────
  (
    'c0ffee00-0000-4000-8000-000000000006', NULL, NULL,
    'New email lead to CRM contact',
    'When a new email arrives in Gmail, create a HubSpot contact so leads never slip away.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"gmail","type":"new_email","position":{"x":400,"y":100},"config":{}},{"id":"contact","kind":"action","provider":"hubspot","type":"create_contact","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"contact"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000007', NULL, NULL,
    'Intake to CRM deal',
    'Run on demand to open a new HubSpot deal from details you fill in.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"native","type":"manual.run","position":{"x":400,"y":100},"config":{}},{"id":"deal","kind":"action","provider":"hubspot","type":"create_deal","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"deal"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000008', NULL, NULL,
    'New CRM record to Slack',
    'When HubSpot fires a webhook, post a heads-up to your sales Slack channel.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"hubspot","type":"webhook_received","position":{"x":400,"y":100},"config":{}},{"id":"notify","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"notify"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000009', NULL, NULL,
    'Log new CRM contact to a sheet',
    'When HubSpot fires a webhook, append a row to a Google Sheet for reporting.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"hubspot","type":"webhook_received","position":{"x":400,"y":100},"config":{}},{"id":"row","kind":"action","provider":"google-sheets","type":"append_row","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"row"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-00000000000a', NULL, NULL,
    'Follow-up task for new deal',
    'When HubSpot fires a webhook, create a HubSpot task so a rep follows up.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"hubspot","type":"webhook_received","position":{"x":400,"y":100},"config":{}},{"id":"task","kind":"action","provider":"hubspot","type":"create_task","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"task"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-00000000000b', NULL, NULL,
    'New Trello card to CRM contact',
    'When a card is added to a Trello board, create a matching HubSpot contact.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"trello","type":"new_card","position":{"x":400,"y":100},"config":{}},{"id":"contact","kind":"action","provider":"hubspot","type":"create_contact","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"contact"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-00000000000c', NULL, NULL,
    'Daily CRM contact digest',
    'On a schedule, pull recent HubSpot contacts and email yourself a summary.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"native","type":"schedule.fired","position":{"x":400,"y":100},"config":{}},{"id":"contacts","kind":"action","provider":"hubspot","type":"get_contacts","position":{"x":400,"y":280},"config":{}},{"id":"email","kind":"action","provider":"gmail","type":"send_email","position":{"x":400,"y":460},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"contacts"},{"id":"e2","from":"contacts","to":"email"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  -- ── 2. Ecommerce / Payments ─────────────────────────────────────────────────
  (
    'c0ffee00-0000-4000-8000-00000000000d', NULL, NULL,
    'New Shopify order to Slack',
    'When a Shopify webhook fires for a new order, alert your team in Slack.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"shopify","type":"webhook_received","position":{"x":400,"y":100},"config":{}},{"id":"notify","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"notify"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-00000000000e', NULL, NULL,
    'New Shopify order to a sheet',
    'When a Shopify webhook fires, append the order to a Google Sheet for tracking.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"shopify","type":"webhook_received","position":{"x":400,"y":100},"config":{}},{"id":"row","kind":"action","provider":"google-sheets","type":"append_row","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"row"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-00000000000f', NULL, NULL,
    'New Shopify order to CRM contact',
    'When a Shopify webhook fires, create a HubSpot contact for the customer.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"shopify","type":"webhook_received","position":{"x":400,"y":100},"config":{}},{"id":"contact","kind":"action","provider":"hubspot","type":"create_contact","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"contact"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000010', NULL, NULL,
    'Failed payment alert to Slack',
    'When a Stripe event arrives, post a payment alert to your billing Slack channel.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"stripe","type":"event_received","position":{"x":400,"y":100},"config":{}},{"id":"notify","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"notify"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000011', NULL, NULL,
    'New Stripe customer to Mailchimp',
    'When a Stripe event arrives, add the customer to a Mailchimp audience.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"stripe","type":"event_received","position":{"x":400,"y":100},"config":{}},{"id":"subscribe","kind":"action","provider":"mailchimp","type":"add_subscriber","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"subscribe"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000012', NULL, NULL,
    'Stripe payment to ledger sheet',
    'When a Stripe event arrives, append it to a Google Sheet you use as a ledger.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"stripe","type":"event_received","position":{"x":400,"y":100},"config":{}},{"id":"row","kind":"action","provider":"google-sheets","type":"append_row","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"row"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000013', NULL, NULL,
    'New order to fulfillment note',
    'When a Shopify webhook fires, add an order note so fulfillment has context.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"shopify","type":"webhook_received","position":{"x":400,"y":100},"config":{}},{"id":"note","kind":"action","provider":"shopify","type":"add_order_note","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"note"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  -- ── 3. Marketing / Growth ───────────────────────────────────────────────────
  (
    'c0ffee00-0000-4000-8000-000000000014', NULL, NULL,
    'Welcome new subscribers',
    'Run on demand to add a subscriber to Mailchimp and send them a welcome email.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"native","type":"manual.run","position":{"x":400,"y":100},"config":{}},{"id":"subscribe","kind":"action","provider":"mailchimp","type":"add_subscriber","position":{"x":400,"y":280},"config":{}},{"id":"welcome","kind":"action","provider":"gmail","type":"send_email","position":{"x":400,"y":460},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"subscribe"},{"id":"e2","from":"subscribe","to":"welcome"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000015', NULL, NULL,
    'Tag engaged subscribers',
    'When a subscriber opens a Mailchimp email, add a tag so you can segment them later.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"mailchimp","type":"email_opened","position":{"x":400,"y":100},"config":{}},{"id":"tag","kind":"action","provider":"mailchimp","type":"add_tag","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"tag"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000016', NULL, NULL,
    'Announce new campaigns in Slack',
    'When a Mailchimp campaign is created, share the news in a Slack channel.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"mailchimp","type":"campaign_created","position":{"x":400,"y":100},"config":{}},{"id":"notify","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"notify"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000017', NULL, NULL,
    'Schedule a recurring Facebook post',
    'On a schedule you choose, publish a post to your Facebook Page.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"native","type":"schedule.fired","position":{"x":400,"y":100},"config":{}},{"id":"post","kind":"action","provider":"facebook","type":"create_post","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"post"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000018', NULL, NULL,
    'Facebook comment to Slack queue',
    'When someone comments on your Facebook Page, route it to a Slack channel to triage.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"facebook","type":"new_comment","position":{"x":400,"y":100},"config":{}},{"id":"notify","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"notify"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000019', NULL, NULL,
    'New doc to Slack announcement',
    'When a new Google Doc is created, share a link to it in a Slack channel.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"google-docs","type":"new_document","position":{"x":400,"y":100},"config":{}},{"id":"notify","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"notify"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-00000000001a', NULL, NULL,
    'Log a marketing event to analytics',
    'Run on demand to send a custom event to Google Analytics for campaign tracking.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"native","type":"manual.run","position":{"x":400,"y":100},"config":{}},{"id":"event","kind":"action","provider":"google-analytics","type":"send_event","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"event"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  -- ── 4. Team operations ──────────────────────────────────────────────────────
  (
    'c0ffee00-0000-4000-8000-00000000001b', NULL, NULL,
    'Daily standup reminder',
    'On a schedule, post a standup reminder to your team Slack channel.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"native","type":"schedule.fired","position":{"x":400,"y":100},"config":{}},{"id":"remind","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"remind"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-00000000001c', NULL, NULL,
    'New Slack channel to directory',
    'When a Slack channel is created, log it to a Google Sheet directory.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"slack","type":"channel_created","position":{"x":400,"y":100},"config":{}},{"id":"row","kind":"action","provider":"google-sheets","type":"append_row","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"row"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-00000000001d', NULL, NULL,
    'Welcome new channel members',
    'When someone joins a Slack channel, send them a direct message to get them oriented.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"slack","type":"member_joined_channel","position":{"x":400,"y":100},"config":{}},{"id":"dm","kind":"action","provider":"slack","type":"send_direct_message","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"dm"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-00000000001e', NULL, NULL,
    'Route flagged email to Slack',
    'When an email gets a label in Gmail, route a notice to a Slack channel.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"gmail","type":"new_labeled_email","position":{"x":400,"y":100},"config":{}},{"id":"notify","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"notify"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-00000000001f', NULL, NULL,
    'New Teams message to Trello task',
    'When a message is posted in a Microsoft Teams channel, create a Trello card to track it.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"microsoft-teams","type":"new_channel_message","position":{"x":400,"y":100},"config":{}},{"id":"card","kind":"action","provider":"trello","type":"create_card","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"card"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000020', NULL, NULL,
    'Weekly team digest email',
    'On a schedule, send a recurring digest email to your team via Outlook.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"native","type":"schedule.fired","position":{"x":400,"y":100},"config":{}},{"id":"email","kind":"action","provider":"microsoft-outlook","type":"send_email","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"email"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000021', NULL, NULL,
    'Shared file alert to Teams',
    'When a file is shared in Slack, post a notice to a Microsoft Teams channel.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"slack","type":"file_shared","position":{"x":400,"y":100},"config":{}},{"id":"notify","kind":"action","provider":"microsoft-teams","type":"send_channel_message","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"notify"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  -- ── 5. Project / Engineering ────────────────────────────────────────────────
  (
    'c0ffee00-0000-4000-8000-000000000022', NULL, NULL,
    'New commit to Trello card',
    'When a commit is pushed to GitHub, create a Trello card so the work is tracked.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"github","type":"new_commit","position":{"x":400,"y":100},"config":{}},{"id":"card","kind":"action","provider":"trello","type":"create_card","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"card"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000023', NULL, NULL,
    'Bug report email to GitHub issue',
    'When an email gets a label in Gmail, open a GitHub issue so bugs are captured.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"gmail","type":"new_labeled_email","position":{"x":400,"y":100},"config":{}},{"id":"issue","kind":"action","provider":"github","type":"create_issue","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"issue"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000024', NULL, NULL,
    'New Trello card to GitHub issue',
    'When a card is added to a Trello board, open a matching GitHub issue.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"trello","type":"new_card","position":{"x":400,"y":100},"config":{}},{"id":"issue","kind":"action","provider":"github","type":"create_issue","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"issue"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000025', NULL, NULL,
    'Monday item to GitHub issue',
    'When an item is created in monday.com, open a GitHub issue for the engineering team.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"monday","type":"new_item","position":{"x":400,"y":100},"config":{}},{"id":"issue","kind":"action","provider":"github","type":"create_issue","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"issue"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000026', NULL, NULL,
    'Nightly deploy reminder',
    'On a schedule, post a deploy-window reminder to your Discord server.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"native","type":"schedule.fired","position":{"x":400,"y":100},"config":{}},{"id":"remind","kind":"action","provider":"discord","type":"send_message","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"remind"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000027', NULL, NULL,
    'New commit to changelog doc',
    'When a commit is pushed to GitHub, create a Google Doc to capture release notes.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"github","type":"new_commit","position":{"x":400,"y":100},"config":{}},{"id":"doc","kind":"action","provider":"google-docs","type":"create_document","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"doc"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  -- ── 6. File / Document ──────────────────────────────────────────────────────
  (
    'c0ffee00-0000-4000-8000-000000000028', NULL, NULL,
    'New Drive file to Slack',
    'When a file changes in Google Drive, notify a Slack channel.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"google-drive","type":"file_changed","position":{"x":400,"y":100},"config":{}},{"id":"notify","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"notify"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000029', NULL, NULL,
    'Dropbox file to OneDrive backup',
    'When a new file lands in Dropbox, upload a copy to Microsoft OneDrive as a backup.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"dropbox","type":"new_file","position":{"x":400,"y":100},"config":{}},{"id":"backup","kind":"action","provider":"microsoft-onedrive","type":"upload_file","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"backup"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-00000000002a', NULL, NULL,
    'New OneDrive file to Teams',
    'When a file changes in OneDrive, post a notice to a Microsoft Teams channel.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"microsoft-onedrive","type":"file_changed","position":{"x":400,"y":100},"config":{}},{"id":"notify","kind":"action","provider":"microsoft-teams","type":"send_channel_message","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"notify"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-00000000002b', NULL, NULL,
    'Gmail attachment to Drive',
    'When an email with an attachment arrives in Gmail, upload the file to Google Drive.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"gmail","type":"new_attachment","position":{"x":400,"y":100},"config":{}},{"id":"upload","kind":"action","provider":"google-drive","type":"upload_file","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"upload"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-00000000002c', NULL, NULL,
    'New doc to a shareable link',
    'When a new Google Doc is created, generate a shareable link for it.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"google-docs","type":"new_document","position":{"x":400,"y":100},"config":{}},{"id":"share","kind":"action","provider":"google-docs","type":"share_document","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"share"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-00000000002d', NULL, NULL,
    'Archive new Drive files',
    'When a file changes in Google Drive, move it into an archive folder you choose.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"google-drive","type":"file_changed","position":{"x":400,"y":100},"config":{}},{"id":"move","kind":"action","provider":"google-drive","type":"move_file","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"move"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  -- ── 7. Personal productivity ────────────────────────────────────────────────
  (
    'c0ffee00-0000-4000-8000-00000000002e', NULL, NULL,
    'Flagged email to Trello task',
    'When an email gets a label in Gmail, create a Trello card so it becomes a task.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"gmail","type":"new_labeled_email","position":{"x":400,"y":100},"config":{}},{"id":"card","kind":"action","provider":"trello","type":"create_card","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"card"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-00000000002f', NULL, NULL,
    'Daily agenda email',
    'On a schedule, send yourself an agenda email to start the day.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"native","type":"schedule.fired","position":{"x":400,"y":100},"config":{}},{"id":"email","kind":"action","provider":"gmail","type":"send_email","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"email"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000030', NULL, NULL,
    'Calendar event to Slack reminder',
    'When a Google Calendar event changes, send yourself a Slack direct-message reminder.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"google-calendar","type":"event_changed","position":{"x":400,"y":100},"config":{}},{"id":"dm","kind":"action","provider":"slack","type":"send_direct_message","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"dm"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000031', NULL, NULL,
    'Quick note to Notion',
    'Run on demand to capture a quick note as a new Notion page.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"native","type":"manual.run","position":{"x":400,"y":100},"config":{}},{"id":"page","kind":"action","provider":"notion","type":"create_page","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"page"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000032', NULL, NULL,
    'New email to Notion inbox',
    'When a new email arrives in Gmail, add it as an entry to a Notion database inbox.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"gmail","type":"new_email","position":{"x":400,"y":100},"config":{}},{"id":"entry","kind":"action","provider":"notion","type":"create_database_entry","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"entry"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  )
ON CONFLICT (id) DO NOTHING;
