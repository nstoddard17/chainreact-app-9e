-- ChainReactV2 — official ChainReact template seed catalog (batch 4)
-- (Slice 4.WORKFLOW-TEMPLATES-MARKETPLACE-OFFICIAL-CATALOG-3).
--
-- DATA-ONLY seed (no schema change). Forward-only follow-up to batches 1-3 (5 + 45 + 25 = 75
-- templates). Adds 15 COMPLEX, multi-step official templates (5-8 nodes each) that each model a
-- recognizable end-to-end business process — capture, enrich, record, hand off, and notify —
-- rather than the 2-3 node integration examples in earlier batches. Total official rows after
-- this batch: 90.
--
-- Uses the EXISTING workflow_templates shape — no new infrastructure, no second catalog. Every
-- row mirrors batches 1-3 exactly:
--   source = 'official'      (platform-made; drives the isOfficial badge)
--   account_id = NULL        (platform-owned — required by the account<->source invariant)
--   visibility = 'public'    (listed in the marketplace; authenticated-readable)
--   creator_display_name_snapshot = 'ChainReact'  (SAFE attribution — never an email / user id)
--   created_by_user_id = NULL (no private author)
--   schema_version = 1        (mirrors EXPORT_SCHEMA_VERSION)
--
-- SAFE PARTIAL TEMPLATES: the graph shape (trigger + ordered actions + edges) is prebuilt; every
-- node `config` is empty `{}`. NOTHING is preconfigured and NO variable paths are baked in — all
-- account-specific fields (recipients, board/list/sheet/calendar/folder ids, HubSpot pipeline/
-- owner, the upstream->downstream variable wiring, etc.) stay BLANK for the builder/setup UI to
-- collect after use/fork. The chains are designed so each downstream action can reasonably consume
-- upstream context (trigger payload or an upstream-created record id) once the user wires it; the
-- template never claims that wiring is already done.
--
-- NO-LEAK: definitions are CREDENTIAL-FREE schema only. No tokens, secrets, provider account
-- labels, emails, user ids, integration ids, channel/board/list/sheet/calendar/file/folder ids, or
-- Stripe/Shopify/HubSpot ids appear anywhere. Only real registered (provider, type) node pairs are
-- used — validated against the live discovery registry by
-- tests/structure/official-template-node-registration.test.ts and
-- tests/unit/migrations/seedOfficialTemplates.test.ts.
--
-- IDEMPOTENT + FORWARD-ONLY: fixed ids (continuing the sequence ...04c..05a) +
-- ON CONFLICT (id) DO NOTHING, so re-running (or db:push replays) is safe and never modifies
-- batches 1-3. This migration is never edited after authoring; future batches add new files.
--
-- ROLLBACK (pre-launch): DELETE FROM public.workflow_templates
--   WHERE id BETWEEN 'c0ffee00-0000-4000-8000-00000000004c'
--                AND 'c0ffee00-0000-4000-8000-00000000005a' AND source = 'official';

INSERT INTO public.workflow_templates
  (id, account_id, created_by_user_id, name, description, source, visibility,
   definition, schema_version, creator_display_name_snapshot, published_at)
VALUES
  (
    'c0ffee00-0000-4000-8000-00000000004c', NULL, NULL,
    'Lead intake to sales handoff',
    'When HubSpot fires a webhook for a new lead, create the contact, add it to a list, open a follow-up task and a note, log it to a sheet, and alert sales in Slack.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"hubspot","type":"webhook_received","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"hubspot","type":"create_contact","position":{"x":400,"y":260},"config":{}},{"id":"a2","kind":"action","provider":"hubspot","type":"add_contact_to_list","position":{"x":400,"y":420},"config":{}},{"id":"a3","kind":"action","provider":"hubspot","type":"create_task","position":{"x":400,"y":580},"config":{}},{"id":"a4","kind":"action","provider":"hubspot","type":"create_note","position":{"x":400,"y":740},"config":{}},{"id":"a5","kind":"action","provider":"google-sheets","type":"append_row","position":{"x":400,"y":900},"config":{}},{"id":"a6","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":1060},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"},{"id":"e5","from":"a4","to":"a5"},{"id":"e6","from":"a5","to":"a6"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-00000000004d', NULL, NULL,
    'Lead qualification pipeline',
    'When a new lead row appears in Airtable, create a HubSpot contact and deal, open a follow-up task, add the contact to a list, create a monday.com handoff item, and notify sales in Slack.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"airtable","type":"record_changed","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"hubspot","type":"create_contact","position":{"x":400,"y":260},"config":{}},{"id":"a2","kind":"action","provider":"hubspot","type":"create_deal","position":{"x":400,"y":420},"config":{}},{"id":"a3","kind":"action","provider":"hubspot","type":"create_task","position":{"x":400,"y":580},"config":{}},{"id":"a4","kind":"action","provider":"hubspot","type":"add_contact_to_list","position":{"x":400,"y":740},"config":{}},{"id":"a5","kind":"action","provider":"monday","type":"create_item","position":{"x":400,"y":900},"config":{}},{"id":"a6","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":1060},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"},{"id":"e5","from":"a4","to":"a5"},{"id":"e6","from":"a5","to":"a6"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-00000000004e', NULL, NULL,
    'Support escalation from email',
    'When an email gets a support label in Gmail, open a HubSpot ticket, create a Trello work item, escalate in Slack, and draft an acknowledgment reply for an agent to review.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"gmail","type":"new_labeled_email","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"hubspot","type":"create_ticket","position":{"x":400,"y":260},"config":{}},{"id":"a2","kind":"action","provider":"trello","type":"create_card","position":{"x":400,"y":420},"config":{}},{"id":"a3","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":580},"config":{}},{"id":"a4","kind":"action","provider":"gmail","type":"create_draft_reply","position":{"x":400,"y":740},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-00000000004f', NULL, NULL,
    'Shopify order operations',
    'When a Shopify order webhook fires, log the order to a sheet, create a monday.com fulfillment item, add an internal order note, open a customer follow-up task, and notify operations in Slack.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"shopify","type":"webhook_received","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"google-sheets","type":"append_row","position":{"x":400,"y":260},"config":{}},{"id":"a2","kind":"action","provider":"monday","type":"create_item","position":{"x":400,"y":420},"config":{}},{"id":"a3","kind":"action","provider":"shopify","type":"add_order_note","position":{"x":400,"y":580},"config":{}},{"id":"a4","kind":"action","provider":"hubspot","type":"create_task","position":{"x":400,"y":740},"config":{}},{"id":"a5","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":900},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"},{"id":"e5","from":"a4","to":"a5"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000050', NULL, NULL,
    'Stripe payment operations',
    'When a Stripe event arrives, look up the related customer, create or update a HubSpot record, open a finance task, log the event to a sheet, add an audit note, and notify finance in Microsoft Teams.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"stripe","type":"event_received","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"stripe","type":"find_customer","position":{"x":400,"y":260},"config":{}},{"id":"a2","kind":"action","provider":"hubspot","type":"create_contact","position":{"x":400,"y":420},"config":{}},{"id":"a3","kind":"action","provider":"hubspot","type":"create_task","position":{"x":400,"y":580},"config":{}},{"id":"a4","kind":"action","provider":"google-sheets","type":"append_row","position":{"x":400,"y":740},"config":{}},{"id":"a5","kind":"action","provider":"hubspot","type":"create_note","position":{"x":400,"y":900},"config":{}},{"id":"a6","kind":"action","provider":"microsoft-teams","type":"send_channel_message","position":{"x":400,"y":1060},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"},{"id":"e5","from":"a4","to":"a5"},{"id":"e6","from":"a5","to":"a6"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000051', NULL, NULL,
    'Mailchimp engagement follow-up',
    'When a subscriber clicks a Mailchimp link, fetch their details, tag them, create or update a HubSpot contact, open a sales follow-up task, log the engagement to a sheet, and notify the team in Slack.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"mailchimp","type":"link_clicked","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"mailchimp","type":"get_subscriber","position":{"x":400,"y":260},"config":{}},{"id":"a2","kind":"action","provider":"mailchimp","type":"add_tag","position":{"x":400,"y":420},"config":{}},{"id":"a3","kind":"action","provider":"hubspot","type":"create_contact","position":{"x":400,"y":580},"config":{}},{"id":"a4","kind":"action","provider":"hubspot","type":"create_task","position":{"x":400,"y":740},"config":{}},{"id":"a5","kind":"action","provider":"google-sheets","type":"append_row","position":{"x":400,"y":900},"config":{}},{"id":"a6","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":1060},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"},{"id":"e5","from":"a4","to":"a5"},{"id":"e6","from":"a5","to":"a6"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000052', NULL, NULL,
    'Product feedback intake',
    'When a message is reacted to in Slack, pull the thread context, capture it as a Notion database entry, open a GitHub issue and a Trello tracking card, and acknowledge in Slack.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"slack","type":"reaction_added","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"slack","type":"get_thread_messages","position":{"x":400,"y":260},"config":{}},{"id":"a2","kind":"action","provider":"notion","type":"create_database_entry","position":{"x":400,"y":420},"config":{}},{"id":"a3","kind":"action","provider":"github","type":"create_issue","position":{"x":400,"y":580},"config":{}},{"id":"a4","kind":"action","provider":"trello","type":"create_card","position":{"x":400,"y":740},"config":{}},{"id":"a5","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":900},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"},{"id":"e5","from":"a4","to":"a5"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000053', NULL, NULL,
    'Engineering incident intake',
    'When an incident is posted in a Microsoft Teams channel, open a GitHub issue, create a monday.com incident item and a Notion incident page, schedule a follow-up event, and notify the incident channel.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"microsoft-teams","type":"new_channel_message","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"github","type":"create_issue","position":{"x":400,"y":260},"config":{}},{"id":"a2","kind":"action","provider":"monday","type":"create_item","position":{"x":400,"y":420},"config":{}},{"id":"a3","kind":"action","provider":"notion","type":"create_page","position":{"x":400,"y":580},"config":{}},{"id":"a4","kind":"action","provider":"google-calendar","type":"create_event","position":{"x":400,"y":740},"config":{}},{"id":"a5","kind":"action","provider":"microsoft-teams","type":"send_channel_message","position":{"x":400,"y":900},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"},{"id":"e5","from":"a4","to":"a5"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000054', NULL, NULL,
    'New file review pipeline',
    'When a file changes in Google Drive, fetch its metadata, create a Notion review record and a monday.com review item, notify the review channel in Slack, and draft a follow-up email.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"google-drive","type":"file_changed","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"google-drive","type":"get_file_metadata","position":{"x":400,"y":260},"config":{}},{"id":"a2","kind":"action","provider":"notion","type":"create_page","position":{"x":400,"y":420},"config":{}},{"id":"a3","kind":"action","provider":"monday","type":"create_item","position":{"x":400,"y":580},"config":{}},{"id":"a4","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":740},"config":{}},{"id":"a5","kind":"action","provider":"gmail","type":"create_draft","position":{"x":400,"y":900},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"},{"id":"e5","from":"a4","to":"a5"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000055', NULL, NULL,
    'Meeting prep and follow-up',
    'When a calendar event changes, create a meeting document, log a HubSpot meeting and a prep task, notify the team in Slack, and draft a follow-up email.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"google-calendar","type":"event_changed","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"google-docs","type":"create_document","position":{"x":400,"y":260},"config":{}},{"id":"a2","kind":"action","provider":"hubspot","type":"create_meeting","position":{"x":400,"y":420},"config":{}},{"id":"a3","kind":"action","provider":"hubspot","type":"create_task","position":{"x":400,"y":580},"config":{}},{"id":"a4","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":740},"config":{}},{"id":"a5","kind":"action","provider":"gmail","type":"create_draft","position":{"x":400,"y":900},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"},{"id":"e5","from":"a4","to":"a5"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000056', NULL, NULL,
    'Weekly executive report',
    'On a schedule, pull a Google Analytics report and recent Stripe payments, record the results in a sheet, compile a report document, and send a leadership summary to Microsoft Teams.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"native","type":"schedule.fired","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"google-analytics","type":"run_report","position":{"x":400,"y":260},"config":{}},{"id":"a2","kind":"action","provider":"stripe","type":"get_payments","position":{"x":400,"y":420},"config":{}},{"id":"a3","kind":"action","provider":"google-sheets","type":"append_row","position":{"x":400,"y":580},"config":{}},{"id":"a4","kind":"action","provider":"google-docs","type":"create_document","position":{"x":400,"y":740},"config":{}},{"id":"a5","kind":"action","provider":"microsoft-teams","type":"send_channel_message","position":{"x":400,"y":900},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"},{"id":"e5","from":"a4","to":"a5"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000057', NULL, NULL,
    'Customer onboarding',
    'When HubSpot fires a webhook for a new customer, create a monday.com onboarding item with a checklist subitem, make a customer folder in Drive, create a Notion onboarding page, schedule a kickoff, and notify the onboarding team in Slack.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"hubspot","type":"webhook_received","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"monday","type":"create_item","position":{"x":400,"y":260},"config":{}},{"id":"a2","kind":"action","provider":"monday","type":"create_subitem","position":{"x":400,"y":420},"config":{}},{"id":"a3","kind":"action","provider":"google-drive","type":"create_folder","position":{"x":400,"y":580},"config":{}},{"id":"a4","kind":"action","provider":"notion","type":"create_page","position":{"x":400,"y":740},"config":{}},{"id":"a5","kind":"action","provider":"google-calendar","type":"create_event","position":{"x":400,"y":900},"config":{}},{"id":"a6","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":1060},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"},{"id":"e5","from":"a4","to":"a5"},{"id":"e6","from":"a5","to":"a6"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000058', NULL, NULL,
    'Content production pipeline',
    'When a content item appears in Airtable, create a draft document, open a Trello review task, set a calendar deadline, notify the content channel in Slack, and record the item in a sheet.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"airtable","type":"record_changed","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"google-docs","type":"create_document","position":{"x":400,"y":260},"config":{}},{"id":"a2","kind":"action","provider":"trello","type":"create_card","position":{"x":400,"y":420},"config":{}},{"id":"a3","kind":"action","provider":"google-calendar","type":"create_event","position":{"x":400,"y":580},"config":{}},{"id":"a4","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":740},"config":{}},{"id":"a5","kind":"action","provider":"google-sheets","type":"append_row","position":{"x":400,"y":900},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"},{"id":"e5","from":"a4","to":"a5"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000059', NULL, NULL,
    'Ecommerce customer retention',
    'When a Shopify customer or order event fires, create or update a HubSpot contact, add them to a Mailchimp audience and tag them, open a follow-up task, log the details to a sheet, and notify the retention team in Slack.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"shopify","type":"webhook_received","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"hubspot","type":"create_contact","position":{"x":400,"y":260},"config":{}},{"id":"a2","kind":"action","provider":"mailchimp","type":"add_subscriber","position":{"x":400,"y":420},"config":{}},{"id":"a3","kind":"action","provider":"mailchimp","type":"add_tag","position":{"x":400,"y":580},"config":{}},{"id":"a4","kind":"action","provider":"hubspot","type":"create_task","position":{"x":400,"y":740},"config":{}},{"id":"a5","kind":"action","provider":"google-sheets","type":"append_row","position":{"x":400,"y":900},"config":{}},{"id":"a6","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":1060},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"},{"id":"e5","from":"a4","to":"a5"},{"id":"e6","from":"a5","to":"a6"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-00000000005a', NULL, NULL,
    'New team member onboarding',
    'Run on demand to spin up onboarding: create a Drive folder and an onboarding document, create a monday.com project item with a checklist subitem, schedule an orientation event, draft a welcome email, and notify the team in Slack.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"native","type":"manual.run","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"google-drive","type":"create_folder","position":{"x":400,"y":260},"config":{}},{"id":"a2","kind":"action","provider":"google-docs","type":"create_document","position":{"x":400,"y":420},"config":{}},{"id":"a3","kind":"action","provider":"monday","type":"create_item","position":{"x":400,"y":580},"config":{}},{"id":"a4","kind":"action","provider":"monday","type":"create_subitem","position":{"x":400,"y":740},"config":{}},{"id":"a5","kind":"action","provider":"google-calendar","type":"create_event","position":{"x":400,"y":900},"config":{}},{"id":"a6","kind":"action","provider":"gmail","type":"create_draft","position":{"x":400,"y":1060},"config":{}},{"id":"a7","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":1220},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"},{"id":"e5","from":"a4","to":"a5"},{"id":"e6","from":"a5","to":"a6"},{"id":"e7","from":"a6","to":"a7"}]}'::jsonb,
    1, 'ChainReact', '2026-06-07T00:00:00Z'
  )
ON CONFLICT (id) DO NOTHING;
