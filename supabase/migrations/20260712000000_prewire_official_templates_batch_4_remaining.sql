-- ChainReactV2 — portable variable-only PREWIRING for the remaining 12 batch-4 official
-- templates (Slice 4.WORKFLOW-TEMPLATES-OFFICIAL-PREWIRE-2).
--
-- DATA-ONLY, UPDATE-ONLY, GUARDED, IDEMPOTENT, FORWARD-ONLY. Continues the narrow
-- "variable-only prewiring" policy established by 20260711000000 (which prewired 04c/04e/05a).
-- A node config value may carry ONLY: (a) a PORTABLE credential-free `{{nodeId.path}}` /
-- `{{trigger.path}}` variable reference whose first path segment is a DECLARED output of the
-- referenced upstream node (verified against the live discovery metadata — trigger payloadShape
-- + action OutputMeta), or (b) a safe, generic, NON-account-specific static label (internal
-- artifact titles / note bodies / channel text). EVERY account-specific field stays blank for
-- the builder/setup UI to collect after use/fork.
--
-- WHY UPDATE, NOT a new seed: batch 4 (20260710...) already inserted these rows (applied live).
-- The locked rule forbids editing an applied migration, so this is a NEW forward migration that
-- UPDATEs only the `definition` jsonb of exactly TWELVE official rows, by fixed UUID.
--
-- GUARD (cannot touch user/community templates): every statement filters
--   id = '<one of the 12 official UUIDs>' AND source = 'official' AND account_id IS NULL.
-- User/community templates have source='user' + a non-null account_id, so are never matched.
--
-- IDEMPOTENT: each statement SETs the definition to a FIXED value, so re-running (or a db:push
-- replay) converges to the same state. No INSERT/DELETE, no DDL, no RLS/GRANT/POLICY change.
--
-- SAFETY (no-leak): NO token, secret, email, account id, user id, integration id, or provider-
-- resource id (channel / list / board / group / sheet / range / calendar / folder / file id /
-- repo / database / audience / property / team / order / customer / pipeline / recipient)
-- appears as a LITERAL. Account-resource selectors, recipients, and notify/visibility/consent
-- toggles are LEFT BLANK on purpose. The ONLY provider-object-id reference seeded is a derived
-- VARIABLE expression that the immediate downstream provider action requires and consumes:
--   * monday create_subitem boardId/parentItemId ← parent create_item outputs (057);
--   * google-drive get_file_metadata fileId ← the file_changed trigger's declared fileId (054).
-- These resolve only at the USER's runtime in the USER's account — the seed holds the reference
-- STRING, never the data. tests/unit/migrations/prewireOfficialTemplatesBatch4Remaining.test.ts
-- proves: every config key is a real meta field, every reference path is a declared upstream
-- output, the canonical resolver resolves every expression, no literal leaks appear, and the
-- account-specific fields remain blank (with only the two derived-id exceptions above).
--
-- Templates prewired (batch 4, remaining 12 of 15):
--   ...04d Lead qualification pipeline      ...04f Shopify order operations
--   ...050 Stripe payment operations        ...051 Mailchimp engagement follow-up
--   ...052 Product feedback intake          ...053 Engineering incident intake
--   ...054 New file review pipeline         ...055 Meeting prep and follow-up
--   ...056 Weekly executive report          ...057 Customer onboarding
--   ...058 Content production pipeline      ...059 Ecommerce customer retention
--
-- DOCUMENTED CONTRACT GAPS (U — left blank, cannot be safely variable-derived):
--   * shopify webhook_received / stripe event_received declare only an opaque `body` / `data`
--     output (no flat order/customer/email scalars), so HubSpot/Mailchimp identity fields and
--     shopify add_order_note order_id stay blank (04f, 050, 059).
--   * mailchimp add_subscriber `status` is a consent/compliance field — never defaulted (059).
--   * airtable record_changed exposes account-schema `fields` maps (no flat title), so content/
--     lead titles use safe static labels rather than guessed field paths (04d, 058).
--   * slack reaction_added declares no flat parent-thread ts, so get_thread_messages threadTs
--     stays blank (052).
--   * google-analytics run_report dateRange/metrics are required enums whose values are not
--     seeded without verification; native schedule.fired carries only timing scalars (056).
--   * gmail create_draft is recipient-visible content — left fully blank per established policy
--     (054, 055).
--
-- ROLLBACK (pre-launch): re-run the empty-config form, or DELETE+reseed batch 4. The batch-4
-- INSERT migration (20260710...) remains the credential-free, empty-config source of record.

-- ── Lead qualification pipeline (04d) ────────────────────────────────────────
-- a2 deal name + a3 task subject + a5 monday item name: safe internal labels. a4 list-add email
-- ← created contact email; a6 Slack text references the created contact email. Blank: contact
-- email/duplicateHandling, deal stage/pipeline, list, monday board/group, Slack channel.
UPDATE public.workflow_templates SET definition =
  '{"nodes":[{"id":"trigger","kind":"trigger","provider":"airtable","type":"record_changed","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"hubspot","type":"create_contact","position":{"x":400,"y":260},"config":{}},{"id":"a2","kind":"action","provider":"hubspot","type":"create_deal","position":{"x":400,"y":420},"config":{"dealname":"New qualified lead deal"}},{"id":"a3","kind":"action","provider":"hubspot","type":"create_task","position":{"x":400,"y":580},"config":{"hs_task_subject":"Follow up with new lead"}},{"id":"a4","kind":"action","provider":"hubspot","type":"add_contact_to_list","position":{"x":400,"y":740},"config":{"email":"{{a1.email}}"}},{"id":"a5","kind":"action","provider":"monday","type":"create_item","position":{"x":400,"y":900},"config":{"itemName":"New lead handoff"}},{"id":"a6","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":1060},"config":{"text":"New lead added to the pipeline: {{a1.email}}"}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"},{"id":"e5","from":"a4","to":"a5"},{"id":"e6","from":"a5","to":"a6"}]}'::jsonb
WHERE id = 'c0ffee00-0000-4000-8000-00000000004d' AND source = 'official' AND account_id IS NULL;

-- ── Shopify order operations (04f) ───────────────────────────────────────────
-- a2 monday item name + a3 internal order note + a4 task subject: safe labels. a5 Slack text
-- references the store domain (trigger.shopDomain). Blank: sheet, monday board/group, order_id
-- + append (opaque body — see gaps), task other, Slack channel.
UPDATE public.workflow_templates SET definition =
  '{"nodes":[{"id":"trigger","kind":"trigger","provider":"shopify","type":"webhook_received","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"google-sheets","type":"append_row","position":{"x":400,"y":260},"config":{}},{"id":"a2","kind":"action","provider":"monday","type":"create_item","position":{"x":400,"y":420},"config":{"itemName":"New Shopify order"}},{"id":"a3","kind":"action","provider":"shopify","type":"add_order_note","position":{"x":400,"y":580},"config":{"note":"Order received and logged automatically by ChainReact."}},{"id":"a4","kind":"action","provider":"hubspot","type":"create_task","position":{"x":400,"y":740},"config":{"hs_task_subject":"Follow up on new order"}},{"id":"a5","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":900},"config":{"text":"A new Shopify order was received from {{trigger.shopDomain}}."}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"},{"id":"e5","from":"a4","to":"a5"}]}'::jsonb
WHERE id = 'c0ffee00-0000-4000-8000-00000000004f' AND source = 'official' AND account_id IS NULL;

-- ── Stripe payment operations (050) ──────────────────────────────────────────
-- a3 finance task subject + a5 internal audit note + a6 Teams text reference the event type
-- (trigger.stripeEventType). Blank: find_customer (id/email), create_contact, sheet, Teams
-- team/channel (opaque data — see gaps).
UPDATE public.workflow_templates SET definition =
  '{"nodes":[{"id":"trigger","kind":"trigger","provider":"stripe","type":"event_received","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"stripe","type":"find_customer","position":{"x":400,"y":260},"config":{}},{"id":"a2","kind":"action","provider":"hubspot","type":"create_contact","position":{"x":400,"y":420},"config":{}},{"id":"a3","kind":"action","provider":"hubspot","type":"create_task","position":{"x":400,"y":580},"config":{"hs_task_subject":"Review Stripe payment event"}},{"id":"a4","kind":"action","provider":"google-sheets","type":"append_row","position":{"x":400,"y":740},"config":{}},{"id":"a5","kind":"action","provider":"hubspot","type":"create_note","position":{"x":400,"y":900},"config":{"hs_note_body":"Stripe event recorded automatically by ChainReact: {{trigger.stripeEventType}}."}},{"id":"a6","kind":"action","provider":"microsoft-teams","type":"send_channel_message","position":{"x":400,"y":1060},"config":{"content":"A Stripe payment event was received: {{trigger.stripeEventType}}."}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"},{"id":"e5","from":"a4","to":"a5"},{"id":"e6","from":"a5","to":"a6"}]}'::jsonb
WHERE id = 'c0ffee00-0000-4000-8000-000000000050' AND source = 'official' AND account_id IS NULL;

-- ── Mailchimp engagement follow-up (051) ─────────────────────────────────────
-- a1 subscriber lookup, a2 tag target, a3 contact identity all ← the subscriber email the trigger
-- declares (trigger.email — required + immediately consumed). a4 task subject + a6 Slack text
-- (campaign title) are safe labels. Blank: audience ids, tags, contact duplicateHandling, sheet,
-- Slack channel.
UPDATE public.workflow_templates SET definition =
  '{"nodes":[{"id":"trigger","kind":"trigger","provider":"mailchimp","type":"link_clicked","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"mailchimp","type":"get_subscriber","position":{"x":400,"y":260},"config":{"email":"{{trigger.email}}"}},{"id":"a2","kind":"action","provider":"mailchimp","type":"add_tag","position":{"x":400,"y":420},"config":{"email":"{{trigger.email}}"}},{"id":"a3","kind":"action","provider":"hubspot","type":"create_contact","position":{"x":400,"y":580},"config":{"email":"{{trigger.email}}"}},{"id":"a4","kind":"action","provider":"hubspot","type":"create_task","position":{"x":400,"y":740},"config":{"hs_task_subject":"Follow up on email engagement"}},{"id":"a5","kind":"action","provider":"google-sheets","type":"append_row","position":{"x":400,"y":900},"config":{}},{"id":"a6","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":1060},"config":{"text":"A subscriber engaged with the Mailchimp campaign: {{trigger.campaignTitle}}."}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"},{"id":"e5","from":"a4","to":"a5"},{"id":"e6","from":"a5","to":"a6"}]}'::jsonb
WHERE id = 'c0ffee00-0000-4000-8000-000000000051' AND source = 'official' AND account_id IS NULL;

-- ── Product feedback intake (052) ────────────────────────────────────────────
-- a3 issue title/body + a4 card name + a5 Slack text: safe internal labels. Blank: thread channel
-- + threadTs (no flat ts — see gaps), Notion db/properties, GitHub repo, Trello list/board,
-- Slack channel.
UPDATE public.workflow_templates SET definition =
  '{"nodes":[{"id":"trigger","kind":"trigger","provider":"slack","type":"reaction_added","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"slack","type":"get_thread_messages","position":{"x":400,"y":260},"config":{}},{"id":"a2","kind":"action","provider":"notion","type":"create_database_entry","position":{"x":400,"y":420},"config":{}},{"id":"a3","kind":"action","provider":"github","type":"create_issue","position":{"x":400,"y":580},"config":{"title":"Product feedback from Slack","body":"Captured automatically by ChainReact from a Slack reaction."}},{"id":"a4","kind":"action","provider":"trello","type":"create_card","position":{"x":400,"y":740},"config":{"name":"Product feedback"}},{"id":"a5","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":900},"config":{"text":"New product feedback was captured and logged."}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"},{"id":"e5","from":"a4","to":"a5"}]}'::jsonb
WHERE id = 'c0ffee00-0000-4000-8000-000000000052' AND source = 'official' AND account_id IS NULL;

-- ── Engineering incident intake (053) ────────────────────────────────────────
-- a1 issue title ← incident message subject; a1 body references the message preview; a2 monday
-- item name ← subject; a4 follow-up event title is a safe label; a5 Teams text ← subject. Blank:
-- GitHub repo, Notion parent/properties, calendar id + notify/visibility toggles, Teams
-- team/channel.
UPDATE public.workflow_templates SET definition =
  '{"nodes":[{"id":"trigger","kind":"trigger","provider":"microsoft-teams","type":"new_channel_message","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"github","type":"create_issue","position":{"x":400,"y":260},"config":{"title":"{{trigger.subject}}","body":"Incident reported via Microsoft Teams: {{trigger.bodyPreview}}"}},{"id":"a2","kind":"action","provider":"monday","type":"create_item","position":{"x":400,"y":420},"config":{"itemName":"{{trigger.subject}}"}},{"id":"a3","kind":"action","provider":"notion","type":"create_page","position":{"x":400,"y":580},"config":{}},{"id":"a4","kind":"action","provider":"google-calendar","type":"create_event","position":{"x":400,"y":740},"config":{"summary":"Incident follow-up review"}},{"id":"a5","kind":"action","provider":"microsoft-teams","type":"send_channel_message","position":{"x":400,"y":900},"config":{"content":"An incident was reported and is being tracked: {{trigger.subject}}"}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"},{"id":"e5","from":"a4","to":"a5"}]}'::jsonb
WHERE id = 'c0ffee00-0000-4000-8000-000000000053' AND source = 'official' AND account_id IS NULL;

-- ── New file review pipeline (054) ───────────────────────────────────────────
-- a1 metadata lookup fileId ← the file_changed trigger's declared fileId (required + immediately
-- consumed by the same-file lookup — the allowed derived-id exception). a3 monday item name + a4
-- Slack text reference the file name. Blank: Notion parent/properties, monday board/group, Slack
-- channel, gmail draft (recipient-visible — see gaps).
UPDATE public.workflow_templates SET definition =
  '{"nodes":[{"id":"trigger","kind":"trigger","provider":"google-drive","type":"file_changed","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"google-drive","type":"get_file_metadata","position":{"x":400,"y":260},"config":{"fileId":"{{trigger.fileId}}"}},{"id":"a2","kind":"action","provider":"notion","type":"create_page","position":{"x":400,"y":420},"config":{}},{"id":"a3","kind":"action","provider":"monday","type":"create_item","position":{"x":400,"y":580},"config":{"itemName":"Review {{trigger.name}}"}},{"id":"a4","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":740},"config":{"text":"A file was updated and needs review: {{trigger.name}}"}},{"id":"a5","kind":"action","provider":"gmail","type":"create_draft","position":{"x":400,"y":900},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"},{"id":"e5","from":"a4","to":"a5"}]}'::jsonb
WHERE id = 'c0ffee00-0000-4000-8000-000000000054' AND source = 'official' AND account_id IS NULL;

-- ── Meeting prep and follow-up (055) ─────────────────────────────────────────
-- a1 doc title + a2 meeting title ← the calendar event summary; a1 content, a3 task subject, a4
-- Slack text are safe labels. Blank: doc folder, meeting times/location, task other, Slack
-- channel, gmail draft (recipient-visible — see gaps).
UPDATE public.workflow_templates SET definition =
  '{"nodes":[{"id":"trigger","kind":"trigger","provider":"google-calendar","type":"event_changed","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"google-docs","type":"create_document","position":{"x":400,"y":260},"config":{"title":"Meeting notes: {{trigger.summary}}","content":"Meeting prep notes prepared automatically by ChainReact."}},{"id":"a2","kind":"action","provider":"hubspot","type":"create_meeting","position":{"x":400,"y":420},"config":{"hs_meeting_title":"{{trigger.summary}}"}},{"id":"a3","kind":"action","provider":"hubspot","type":"create_task","position":{"x":400,"y":580},"config":{"hs_task_subject":"Prepare for upcoming meeting"}},{"id":"a4","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":740},"config":{"text":"Meeting prep is ready for: {{trigger.summary}}"}},{"id":"a5","kind":"action","provider":"gmail","type":"create_draft","position":{"x":400,"y":900},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"},{"id":"e5","from":"a4","to":"a5"}]}'::jsonb
WHERE id = 'c0ffee00-0000-4000-8000-000000000055' AND source = 'official' AND account_id IS NULL;

-- ── Weekly executive report (056) ────────────────────────────────────────────
-- a4 report doc title/content + a5 Teams summary text: safe static labels. Blank: analytics
-- property/dateRange/metrics, stripe get_payments (all optional), sheet, doc folder, Teams
-- team/channel (schedule trigger carries no business data — see gaps).
UPDATE public.workflow_templates SET definition =
  '{"nodes":[{"id":"trigger","kind":"trigger","provider":"native","type":"schedule.fired","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"google-analytics","type":"run_report","position":{"x":400,"y":260},"config":{}},{"id":"a2","kind":"action","provider":"stripe","type":"get_payments","position":{"x":400,"y":420},"config":{}},{"id":"a3","kind":"action","provider":"google-sheets","type":"append_row","position":{"x":400,"y":580},"config":{}},{"id":"a4","kind":"action","provider":"google-docs","type":"create_document","position":{"x":400,"y":740},"config":{"title":"Weekly executive report","content":"Compiled automatically by ChainReact."}},{"id":"a5","kind":"action","provider":"microsoft-teams","type":"send_channel_message","position":{"x":400,"y":900},"config":{"content":"The weekly executive report has been compiled and is ready for review."}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"},{"id":"e5","from":"a4","to":"a5"}]}'::jsonb
WHERE id = 'c0ffee00-0000-4000-8000-000000000056' AND source = 'official' AND account_id IS NULL;

-- ── Customer onboarding (057) ────────────────────────────────────────────────
-- a1 onboarding item name + a2 subitem name + a3 folder name + a5 kickoff event title + a6 Slack
-- text: safe labels. a2 subitem boardId/parentItemId ← the parent monday item outputs (derived-id
-- exception). Blank: monday board/group, Notion parent/properties, calendar id + notify/visibility
-- toggles, Slack channel.
UPDATE public.workflow_templates SET definition =
  '{"nodes":[{"id":"trigger","kind":"trigger","provider":"hubspot","type":"webhook_received","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"monday","type":"create_item","position":{"x":400,"y":260},"config":{"itemName":"New customer onboarding"}},{"id":"a2","kind":"action","provider":"monday","type":"create_subitem","position":{"x":400,"y":420},"config":{"boardId":"{{a1.boardId}}","parentItemId":"{{a1.itemId}}","subitemName":"Onboarding checklist"}},{"id":"a3","kind":"action","provider":"google-drive","type":"create_folder","position":{"x":400,"y":580},"config":{"name":"Customer onboarding"}},{"id":"a4","kind":"action","provider":"notion","type":"create_page","position":{"x":400,"y":740},"config":{}},{"id":"a5","kind":"action","provider":"google-calendar","type":"create_event","position":{"x":400,"y":900},"config":{"summary":"Customer kickoff"}},{"id":"a6","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":1060},"config":{"text":"A new customer is being onboarded. See the onboarding folder, board item, and page."}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"},{"id":"e5","from":"a4","to":"a5"},{"id":"e6","from":"a5","to":"a6"}]}'::jsonb
WHERE id = 'c0ffee00-0000-4000-8000-000000000057' AND source = 'official' AND account_id IS NULL;

-- ── Content production pipeline (058) ────────────────────────────────────────
-- a1 draft doc title/content + a2 review card name + a3 deadline event title + a4 Slack text:
-- safe static labels (airtable record fields are account-schema maps — see gaps). Blank: doc
-- folder, Trello list/board, calendar id + notify/visibility toggles, Slack channel, sheet.
UPDATE public.workflow_templates SET definition =
  '{"nodes":[{"id":"trigger","kind":"trigger","provider":"airtable","type":"record_changed","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"google-docs","type":"create_document","position":{"x":400,"y":260},"config":{"title":"Content draft","content":"Draft created automatically by ChainReact."}},{"id":"a2","kind":"action","provider":"trello","type":"create_card","position":{"x":400,"y":420},"config":{"name":"Content review"}},{"id":"a3","kind":"action","provider":"google-calendar","type":"create_event","position":{"x":400,"y":580},"config":{"summary":"Content deadline"}},{"id":"a4","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":740},"config":{"text":"A new content item has entered the production pipeline."}},{"id":"a5","kind":"action","provider":"google-sheets","type":"append_row","position":{"x":400,"y":900},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"},{"id":"e5","from":"a4","to":"a5"}]}'::jsonb
WHERE id = 'c0ffee00-0000-4000-8000-000000000058' AND source = 'official' AND account_id IS NULL;

-- ── Ecommerce customer retention (059) ───────────────────────────────────────
-- a4 retention task subject + a6 Slack text (store domain) are safe labels. Blank: create_contact
-- (customer email/duplicateHandling), mailchimp add_subscriber (audience/email + consent status —
-- see gaps), mailchimp add_tag (no flat email from opaque shopify body), sheet, Slack channel.
UPDATE public.workflow_templates SET definition =
  '{"nodes":[{"id":"trigger","kind":"trigger","provider":"shopify","type":"webhook_received","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"hubspot","type":"create_contact","position":{"x":400,"y":260},"config":{}},{"id":"a2","kind":"action","provider":"mailchimp","type":"add_subscriber","position":{"x":400,"y":420},"config":{}},{"id":"a3","kind":"action","provider":"mailchimp","type":"add_tag","position":{"x":400,"y":580},"config":{}},{"id":"a4","kind":"action","provider":"hubspot","type":"create_task","position":{"x":400,"y":740},"config":{"hs_task_subject":"Follow up with customer for retention"}},{"id":"a5","kind":"action","provider":"google-sheets","type":"append_row","position":{"x":400,"y":900},"config":{}},{"id":"a6","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":1060},"config":{"text":"A customer event was received from {{trigger.shopDomain}} for retention follow-up."}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"},{"id":"e5","from":"a4","to":"a5"},{"id":"e6","from":"a5","to":"a6"}]}'::jsonb
WHERE id = 'c0ffee00-0000-4000-8000-000000000059' AND source = 'official' AND account_id IS NULL;
