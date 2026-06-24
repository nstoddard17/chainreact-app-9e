-- ChainReactV2 — official ChainReact template seed catalog (batch 3)
-- (Slice 4.WORKFLOW-TEMPLATES-MARKETPLACE-OFFICIAL-CATALOG-2).
--
-- DATA-ONLY seed (no schema change). Forward-only follow-up to batch 1
-- (20260618000000_seed_official_templates.sql, 5 templates) and batch 2
-- (20260708000000_seed_official_templates_batch_2.sql, 45 templates). Adds 25 MORE official
-- templates focused on Sales, Customer Success, Internal Ops, and Admin workflows:
-- sales follow-up, lead intake, CRM hygiene, customer-support/marketing triage, payment/order
-- operations, and weekly reporting. Total official rows after this batch: 75.
--
-- Uses the EXISTING workflow_templates shape — no new infrastructure, no second catalog. Every
-- row mirrors batches 1 and 2 exactly:
--   source = 'official'      (platform-made; drives the isOfficial badge)
--   account_id = NULL        (platform-owned — required by the account<->source invariant)
--   visibility = 'public'    (listed in the marketplace; authenticated-readable)
--   creator_display_name_snapshot = 'ChainReact'  (SAFE attribution — never an email / user id)
--   created_by_user_id = NULL (no private author)
--   schema_version = 1        (mirrors EXPORT_SCHEMA_VERSION)
--
-- SAFE PARTIAL TEMPLATES: the graph shape (trigger + actions + edges) is prebuilt; every node
-- `config` is empty `{}`. All account-specific fields (recipients, channel/board/list/sheet ids,
-- HubSpot pipeline/owner, Stripe/Shopify resource ids, etc.) stay BLANK so the builder/setup UI
-- collects them on /use. No hidden defaults for recipient-visible or high-risk fields.
--
-- METADATA NOTE: HubSpot, Airtable, and Google Sheets expose CONSOLIDATED triggers
-- (`hubspot:webhook_received`, `airtable:record_changed`, `google-sheets:row_changed`) rather
-- than per-object "new contact / new record" triggers, so "new HubSpot contact" style ideas are
-- modeled on those real consolidated triggers (workflows branch on the event payload).
--
-- NO-LEAK: definitions are CREDENTIAL-FREE schema only. No tokens, secrets, provider account
-- labels, emails, user ids, integration ids, channel/board/list/sheet/calendar/file ids, or
-- Stripe/Shopify/HubSpot ids appear anywhere. Only real registered (provider, type) node pairs
-- are used — validated against the live discovery registry by
-- tests/structure/official-template-node-registration.test.ts and
-- tests/unit/migrations/seedOfficialTemplates.test.ts.
--
-- IDEMPOTENT + FORWARD-ONLY: fixed ids (continuing the sequence ...033..04b) +
-- ON CONFLICT (id) DO NOTHING, so re-running (or db:push replays) is safe and never modifies
-- batches 1 or 2. This migration is never edited after authoring; future batches add new files.
--
-- ROLLBACK (pre-launch): DELETE FROM public.workflow_templates
--   WHERE id BETWEEN 'c0ffee00-0000-4000-8000-000000000033'
--                AND 'c0ffee00-0000-4000-8000-00000000004b' AND source = 'official';

INSERT INTO public.workflow_templates
  (id, account_id, created_by_user_id, name, description, source, visibility,
   definition, schema_version, creator_display_name_snapshot, published_at)
VALUES
  -- ── Sales follow-up / Lead intake ───────────────────────────────────────────
  (
    'c0ffee00-0000-4000-8000-000000000033', NULL, NULL,
    'New lead to CRM contact and Slack alert',
    'Run on demand to create a HubSpot contact and alert your sales team in Slack.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"native","type":"manual.run","position":{"x":400,"y":100},"config":{}},{"id":"contact","kind":"action","provider":"hubspot","type":"create_contact","position":{"x":400,"y":280},"config":{}},{"id":"alert","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":460},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"contact"},{"id":"e2","from":"contact","to":"alert"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000034', NULL, NULL,
    'New deal to CRM and Teams',
    'Run on demand to open a HubSpot deal and notify your team in Microsoft Teams.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"native","type":"manual.run","position":{"x":400,"y":100},"config":{}},{"id":"deal","kind":"action","provider":"hubspot","type":"create_deal","position":{"x":400,"y":280},"config":{}},{"id":"notify","kind":"action","provider":"microsoft-teams","type":"send_channel_message","position":{"x":400,"y":460},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"deal"},{"id":"e2","from":"deal","to":"notify"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000035', NULL, NULL,
    'New CRM record to monday item',
    'When HubSpot fires a webhook, create a monday.com item so the work is tracked.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"hubspot","type":"webhook_received","position":{"x":400,"y":100},"config":{}},{"id":"item","kind":"action","provider":"monday","type":"create_item","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"item"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000036', NULL, NULL,
    'New CRM record to Trello card',
    'When HubSpot fires a webhook, create a Trello card to follow up on the record.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"hubspot","type":"webhook_received","position":{"x":400,"y":100},"config":{}},{"id":"card","kind":"action","provider":"trello","type":"create_card","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"card"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000037', NULL, NULL,
    'New CRM record to Gmail follow-up draft',
    'When HubSpot fires a webhook, draft a Gmail follow-up so a rep can review and send.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"hubspot","type":"webhook_received","position":{"x":400,"y":100},"config":{}},{"id":"draft","kind":"action","provider":"gmail","type":"create_draft","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"draft"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000038', NULL, NULL,
    'New CRM record to Outlook follow-up draft',
    'When HubSpot fires a webhook, draft an Outlook follow-up for a rep to review and send.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"hubspot","type":"webhook_received","position":{"x":400,"y":100},"config":{}},{"id":"draft","kind":"action","provider":"microsoft-outlook","type":"create_draft_email","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"draft"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000039', NULL, NULL,
    'New Airtable record to CRM contact',
    'When a record changes in Airtable, create a matching HubSpot contact.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"airtable","type":"record_changed","position":{"x":400,"y":100},"config":{}},{"id":"contact","kind":"action","provider":"hubspot","type":"create_contact","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"contact"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-00000000003a', NULL, NULL,
    'New sheet row to CRM contact',
    'When a row changes in Google Sheets, create a HubSpot contact from it.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"google-sheets","type":"row_changed","position":{"x":400,"y":100},"config":{}},{"id":"contact","kind":"action","provider":"hubspot","type":"create_contact","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"contact"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-00000000003b', NULL, NULL,
    'New sheet lead to Slack sales alert',
    'When a row changes in a Google Sheet, post a sales alert to a Slack channel.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"google-sheets","type":"row_changed","position":{"x":400,"y":100},"config":{}},{"id":"alert","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"alert"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-00000000003c', NULL, NULL,
    'New Airtable lead to Slack sales alert',
    'When a record changes in Airtable, post a sales alert to a Slack channel.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"airtable","type":"record_changed","position":{"x":400,"y":100},"config":{}},{"id":"alert","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"alert"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  -- ── Payment / order operations + finance ────────────────────────────────────
  (
    'c0ffee00-0000-4000-8000-00000000003d', NULL, NULL,
    'Stripe event to CRM contact',
    'When a Stripe event arrives, create a HubSpot contact for the customer.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"stripe","type":"event_received","position":{"x":400,"y":100},"config":{}},{"id":"contact","kind":"action","provider":"hubspot","type":"create_contact","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"contact"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-00000000003e', NULL, NULL,
    'Stripe event to monday finance item',
    'When a Stripe event arrives, create a monday.com item to track it in finance.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"stripe","type":"event_received","position":{"x":400,"y":100},"config":{}},{"id":"item","kind":"action","provider":"monday","type":"create_item","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"item"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-00000000003f', NULL, NULL,
    'Stripe event to Teams finance alert',
    'When a Stripe event arrives, notify your finance channel in Microsoft Teams.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"stripe","type":"event_received","position":{"x":400,"y":100},"config":{}},{"id":"notify","kind":"action","provider":"microsoft-teams","type":"send_channel_message","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"notify"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000040', NULL, NULL,
    'Shopify order to monday fulfillment item',
    'When a Shopify webhook fires, create a monday.com item to track fulfillment.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"shopify","type":"webhook_received","position":{"x":400,"y":100},"config":{}},{"id":"item","kind":"action","provider":"monday","type":"create_item","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"item"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000041', NULL, NULL,
    'Shopify order to Trello fulfillment card',
    'When a Shopify webhook fires, create a Trello card to track fulfillment.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"shopify","type":"webhook_received","position":{"x":400,"y":100},"config":{}},{"id":"card","kind":"action","provider":"trello","type":"create_card","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"card"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000042', NULL, NULL,
    'Shopify customer to marketing list',
    'When a Shopify webhook fires, add the customer to a Mailchimp audience.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"shopify","type":"webhook_received","position":{"x":400,"y":100},"config":{}},{"id":"subscribe","kind":"action","provider":"mailchimp","type":"add_subscriber","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"subscribe"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000043', NULL, NULL,
    'Shopify order to Teams alert',
    'When a Shopify webhook fires, post an order alert to a Microsoft Teams channel.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"shopify","type":"webhook_received","position":{"x":400,"y":100},"config":{}},{"id":"notify","kind":"action","provider":"microsoft-teams","type":"send_channel_message","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"notify"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  -- ── Customer success / Marketing triage ─────────────────────────────────────
  (
    'c0ffee00-0000-4000-8000-000000000044', NULL, NULL,
    'New segment subscriber to CRM contact',
    'When a subscriber is added to a Mailchimp segment, create a HubSpot contact.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"mailchimp","type":"subscriber_added_to_segment","position":{"x":400,"y":100},"config":{}},{"id":"contact","kind":"action","provider":"hubspot","type":"create_contact","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"contact"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000045', NULL, NULL,
    'New segment subscriber to Airtable',
    'When a subscriber is added to a Mailchimp segment, log a record in Airtable.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"mailchimp","type":"subscriber_added_to_segment","position":{"x":400,"y":100},"config":{}},{"id":"record","kind":"action","provider":"airtable","type":"create_record","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"record"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000046', NULL, NULL,
    'New segment subscriber to Slack alert',
    'When a subscriber is added to a Mailchimp segment, post a marketing alert to Slack.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"mailchimp","type":"subscriber_added_to_segment","position":{"x":400,"y":100},"config":{}},{"id":"alert","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"alert"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  -- ── Weekly reporting / Internal ops ─────────────────────────────────────────
  (
    'c0ffee00-0000-4000-8000-000000000047', NULL, NULL,
    'Weekly analytics report to Teams',
    'On a schedule, run a Google Analytics report and post the summary to Microsoft Teams.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"native","type":"schedule.fired","position":{"x":400,"y":100},"config":{}},{"id":"report","kind":"action","provider":"google-analytics","type":"run_report","position":{"x":400,"y":280},"config":{}},{"id":"notify","kind":"action","provider":"microsoft-teams","type":"send_channel_message","position":{"x":400,"y":460},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"report"},{"id":"e2","from":"report","to":"notify"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000048', NULL, NULL,
    'Weekly digest to Teams',
    'On a schedule, post a recurring digest to a Microsoft Teams channel.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"native","type":"schedule.fired","position":{"x":400,"y":100},"config":{}},{"id":"notify","kind":"action","provider":"microsoft-teams","type":"send_channel_message","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"notify"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000049', NULL, NULL,
    'Weekly report row to a sheet',
    'On a schedule, append a row to a Google Sheet to build a recurring report log.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"native","type":"schedule.fired","position":{"x":400,"y":100},"config":{}},{"id":"row","kind":"action","provider":"google-sheets","type":"append_row","position":{"x":400,"y":280},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"row"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-00000000004a', NULL, NULL,
    'Analytics snapshot to Slack',
    'On a schedule, run a Google Analytics report and post the snapshot to a Slack channel.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"native","type":"schedule.fired","position":{"x":400,"y":100},"config":{}},{"id":"report","kind":"action","provider":"google-analytics","type":"run_report","position":{"x":400,"y":280},"config":{}},{"id":"post","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":460},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"report"},{"id":"e2","from":"report","to":"post"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-00000000004b', NULL, NULL,
    'Analytics snapshot to a sheet',
    'On a schedule, run a Google Analytics report and append the snapshot to a Google Sheet.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"native","type":"schedule.fired","position":{"x":400,"y":100},"config":{}},{"id":"report","kind":"action","provider":"google-analytics","type":"run_report","position":{"x":400,"y":280},"config":{}},{"id":"row","kind":"action","provider":"google-sheets","type":"append_row","position":{"x":400,"y":460},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"report"},{"id":"e2","from":"report","to":"row"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  )
ON CONFLICT (id) DO NOTHING;
