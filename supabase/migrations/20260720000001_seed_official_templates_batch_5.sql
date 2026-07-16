-- ChainReactV2 — official template seed catalog, BATCH 5 (TEMPLATE-QUALITY-1).
--
-- Twelve complete BUSINESS-PROCESS templates (5-7 nodes each) built from the REGISTERED
-- capability surface audited in docs/product/template-business-capability-audit.md. This batch
-- accompanies 20260720000000_retire_official_templates_batch_1_3.sql (which retires the 75
-- two/three-node integration demos): together they enforce the new catalog standard — every
-- platform template has at least FIVE meaningful nodes and models a recognizable end-to-end
-- business outcome. Providers newly covered: typeform, calendly, quickbooks, asana, plus the
-- first use of the native if_then_condition logic node (engine-branching contract: labeled
-- 'true' edge + onFalse:'skip').
--
-- Same platform-owned invariants as batches 1-4:
--   source='official', account_id NULL, created_by_user_id NULL, visibility='public',
--   creator_display_name_snapshot='ChainReact', schema_version=1.
--
-- CONFIG POLICY (variable-only prewiring, per the locked policy of 20260711000000 /
-- 20260712000000): a node config value carries ONLY (a) a portable credential-free
-- {{trigger.path}} / {{nodeId.path}} reference whose first path segment is a DECLARED output
-- of the referenced node (trigger payloadShape / action OutputMeta — verified against the live
-- discovery registry), or (b) a safe, generic, non-account-specific static label (internal task
-- subjects, note bodies, channel text, if/then operator + threshold). EVERYTHING else stays
-- blank for the builder setup UI: account-resource selectors (form/board/label/sheet/channel/
-- pipeline ids), recipients (gmail create_draft stays fully blank), consent/notify/visibility
-- toggles, and behavior-switching enums (duplicateHandling, valueInputOption). The ONLY
-- id-shaped references seeded are upstream-produced values immediately required downstream:
--   * quickbooks get_customer.customerId  <- invoice_created declares customerId;
--   * asana create_subtask.parentTaskGid  <- the parent create_task outputs taskGid;
--   * gmail create_draft_reply.originalMessageId <- new_labeled_email declares id.
--
-- NO-LEAK: no token, secret, email, account/user/integration/credential id, or literal
-- provider-resource id appears anywhere. Names/descriptions are apostrophe-free plain text.
--
-- IDEMPOTENT + FORWARD-ONLY: fixed ids continuing the sequence (...05b-...066) +
-- ON CONFLICT (id) DO NOTHING. This file is never edited after authoring.
--
-- ROLLBACK (pre-launch): DELETE FROM public.workflow_templates
--   WHERE id BETWEEN 'c0ffee00-0000-4000-8000-00000000005b'
--                AND 'c0ffee00-0000-4000-8000-000000000066' AND source = 'official';

INSERT INTO public.workflow_templates
  (id, account_id, created_by_user_id, name, description, source, visibility,
   definition, schema_version, creator_display_name_snapshot, published_at)
VALUES
  (
    'c0ffee00-0000-4000-8000-00000000005b', NULL, NULL,
    'Webform lead capture to CRM follow-up',
    'When someone submits your Typeform lead form, create a CRM contact and deal in HubSpot, open a qualification task for sales, log the submission to your intake sheet, and announce the new lead in Slack.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"typeform","type":"new_response_in_form","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"hubspot","type":"create_contact","position":{"x":400,"y":260},"config":{}},{"id":"a2","kind":"action","provider":"hubspot","type":"create_deal","position":{"x":400,"y":420},"config":{"dealname":"New webform lead"}},{"id":"a3","kind":"action","provider":"hubspot","type":"create_task","position":{"x":400,"y":580},"config":{"hs_task_subject":"Qualify new webform lead"}},{"id":"a4","kind":"action","provider":"google-sheets","type":"append_row","position":{"x":400,"y":740},"config":{}},{"id":"a5","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":900},"config":{"text":"A new lead form response was submitted: {{trigger.formTitle}}"}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"},{"id":"e5","from":"a4","to":"a5"}]}'::jsonb,
    1, 'ChainReact', '2026-07-15T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-00000000005c', NULL, NULL,
    'Low survey score follow-up',
    'When a scored survey response (such as NPS) arrives from Typeform, log every response to a sheet, and when the score is below 7 open a HubSpot follow-up ticket, alert the success team in Slack, and prepare a personal outreach draft in Gmail. Nothing is sent automatically.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"typeform","type":"new_response_in_form","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"google-sheets","type":"append_row","position":{"x":400,"y":260},"config":{}},{"id":"a2","kind":"action","provider":"native","type":"if_then_condition","position":{"x":400,"y":420},"config":{"input":"{{trigger.score}}","operator":"less_than","value":"7","onFalse":"skip"}},{"id":"a3","kind":"action","provider":"hubspot","type":"create_ticket","position":{"x":400,"y":580},"config":{"subject":"Follow up on a low survey score"}},{"id":"a4","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":740},"config":{"text":"A low survey score came in on {{trigger.formTitle}} - a follow-up ticket was created."}},{"id":"a5","kind":"action","provider":"gmail","type":"create_draft","position":{"x":400,"y":900},"config":{}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3","label":"true"},{"id":"e4","from":"a3","to":"a4"},{"id":"e5","from":"a4","to":"a5"}]}'::jsonb,
    1, 'ChainReact', '2026-07-15T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-00000000005d', NULL, NULL,
    'New meeting booked to prepared call',
    'When an invitee books a meeting through Calendly, create or update the HubSpot contact from the invitee email, open a preparation task, start a meeting-notes document in Google Docs, log the booking to a sheet, and tell the team in Slack.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"calendly","type":"event_scheduled","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"hubspot","type":"create_contact","position":{"x":400,"y":260},"config":{"email":"{{trigger.inviteeEmail}}"}},{"id":"a2","kind":"action","provider":"hubspot","type":"create_task","position":{"x":400,"y":420},"config":{"hs_task_subject":"Prepare for meeting: {{trigger.meetingName}}"}},{"id":"a3","kind":"action","provider":"google-docs","type":"create_document","position":{"x":400,"y":580},"config":{"title":"Meeting notes - {{trigger.meetingName}}"}},{"id":"a4","kind":"action","provider":"google-sheets","type":"append_row","position":{"x":400,"y":740},"config":{}},{"id":"a5","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":900},"config":{"text":"New meeting booked: {{trigger.meetingName}} with {{trigger.inviteeName}}"}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"},{"id":"e5","from":"a4","to":"a5"}]}'::jsonb,
    1, 'ChainReact', '2026-07-15T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-00000000005e', NULL, NULL,
    'Canceled meeting recovery',
    'When a Calendly meeting is canceled, open a rebooking task in HubSpot, prepare a reschedule email draft in Gmail for your review, log the cancellation to a sheet, and alert the owner in Slack so the meeting is not silently lost.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"calendly","type":"event_canceled","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"hubspot","type":"create_task","position":{"x":400,"y":260},"config":{"hs_task_subject":"Rebook canceled meeting: {{trigger.meetingName}}"}},{"id":"a2","kind":"action","provider":"gmail","type":"create_draft","position":{"x":400,"y":420},"config":{}},{"id":"a3","kind":"action","provider":"google-sheets","type":"append_row","position":{"x":400,"y":580},"config":{}},{"id":"a4","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":740},"config":{"text":"A meeting was canceled: {{trigger.meetingName}} - a rebooking task was created."}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"}]}'::jsonb,
    1, 'ChainReact', '2026-07-15T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-00000000005f', NULL, NULL,
    'Invoice tracking and payment follow-up',
    'When a new invoice is created in QuickBooks, look up the customer record, log the invoice to your accounts-receivable sheet, open a payment follow-up task in HubSpot tied to the due date, and notify the finance channel in Slack.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"quickbooks","type":"invoice_created","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"quickbooks","type":"get_customer","position":{"x":400,"y":260},"config":{"customerId":"{{trigger.customerId}}"}},{"id":"a2","kind":"action","provider":"google-sheets","type":"append_row","position":{"x":400,"y":420},"config":{}},{"id":"a3","kind":"action","provider":"hubspot","type":"create_task","position":{"x":400,"y":580},"config":{"hs_task_subject":"Follow up on invoice {{trigger.docNumber}} due {{trigger.dueDate}}"}},{"id":"a4","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":740},"config":{"text":"Invoice {{trigger.docNumber}} for {{trigger.customerName}} was issued and logged."}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"}]}'::jsonb,
    1, 'ChainReact', '2026-07-15T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000060', NULL, NULL,
    'Record and acknowledge received payments',
    'When a customer payment lands in QuickBooks, log the receipt to your cash sheet, record the payment on the CRM timeline in HubSpot, prepare a thank-you acknowledgment draft in Gmail for your review, and notify finance in Slack.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"quickbooks","type":"payment_received","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"google-sheets","type":"append_row","position":{"x":400,"y":260},"config":{}},{"id":"a2","kind":"action","provider":"hubspot","type":"create_note","position":{"x":400,"y":420},"config":{"hs_note_body":"Payment received from {{trigger.customerName}} (reference {{trigger.referenceNumber}}). Recorded automatically by ChainReact."}},{"id":"a3","kind":"action","provider":"gmail","type":"create_draft","position":{"x":400,"y":580},"config":{}},{"id":"a4","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":740},"config":{"text":"A payment from {{trigger.customerName}} was received and recorded."}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"}]}'::jsonb,
    1, 'ChainReact', '2026-07-15T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000061', NULL, NULL,
    'Subscription cancellation rescue',
    'When Stripe reports a subscription cancellation event (select the subscription events during setup), look up the customer, open a save-the-account task in HubSpot, prepare a win-back email draft in Gmail for your review, log the churn event to a sheet, and alert the team in Slack.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"stripe","type":"event_received","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"stripe","type":"find_customer","position":{"x":400,"y":260},"config":{}},{"id":"a2","kind":"action","provider":"hubspot","type":"create_task","position":{"x":400,"y":420},"config":{"hs_task_subject":"Reach out about a canceled subscription"}},{"id":"a3","kind":"action","provider":"gmail","type":"create_draft","position":{"x":400,"y":580},"config":{}},{"id":"a4","kind":"action","provider":"google-sheets","type":"append_row","position":{"x":400,"y":740},"config":{}},{"id":"a5","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":900},"config":{"text":"A Stripe subscription event needs attention: {{trigger.stripeEventType}}"}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"},{"id":"e5","from":"a4","to":"a5"}]}'::jsonb,
    1, 'ChainReact', '2026-07-15T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000062', NULL, NULL,
    'Vendor invoice email intake',
    'When an email with your invoices label arrives in Gmail, prepare a received-acknowledgment reply draft for your review, open an accounts-payable processing task in Asana, log the invoice to your register sheet, and notify finance in Slack.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"gmail","type":"new_labeled_email","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"gmail","type":"create_draft_reply","position":{"x":400,"y":260},"config":{"originalMessageId":"{{trigger.id}}"}},{"id":"a2","kind":"action","provider":"asana","type":"create_task","position":{"x":400,"y":420},"config":{"name":"Process vendor invoice: {{trigger.subject}}"}},{"id":"a3","kind":"action","provider":"google-sheets","type":"append_row","position":{"x":400,"y":580},"config":{}},{"id":"a4","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":740},"config":{"text":"A vendor invoice email arrived: {{trigger.subject}}"}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"}]}'::jsonb,
    1, 'ChainReact', '2026-07-15T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000063', NULL, NULL,
    'Employee offboarding checklist',
    'Run on demand when someone is leaving: create the master offboarding task in Asana with access-revocation and payroll subtasks, schedule the exit interview on Google Calendar, prepare the internal notification email draft in Gmail, and tell the team channel in Slack.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"native","type":"manual.run","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"asana","type":"create_task","position":{"x":400,"y":260},"config":{"name":"Employee offboarding checklist"}},{"id":"a2","kind":"action","provider":"asana","type":"create_subtask","position":{"x":400,"y":420},"config":{"parentTaskGid":"{{a1.taskGid}}","name":"Revoke system access and collect equipment"}},{"id":"a3","kind":"action","provider":"asana","type":"create_subtask","position":{"x":400,"y":580},"config":{"parentTaskGid":"{{a1.taskGid}}","name":"Process final payroll and benefits"}},{"id":"a4","kind":"action","provider":"google-calendar","type":"create_event","position":{"x":400,"y":740},"config":{"summary":"Exit interview"}},{"id":"a5","kind":"action","provider":"gmail","type":"create_draft","position":{"x":400,"y":900},"config":{}},{"id":"a6","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":1060},"config":{"text":"An employee offboarding checklist was started."}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"},{"id":"e5","from":"a4","to":"a5"},{"id":"e6","from":"a5","to":"a6"}]}'::jsonb,
    1, 'ChainReact', '2026-07-15T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000064', NULL, NULL,
    'Campaign QA and launch coordination',
    'When a new campaign is created in Mailchimp, open a QA review task in Asana, create a campaign record page in Notion, log the campaign to your marketing calendar sheet, and notify the marketing channel in Slack before anything goes out.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"mailchimp","type":"campaign_created","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"asana","type":"create_task","position":{"x":400,"y":260},"config":{"name":"QA review: {{trigger.title}}"}},{"id":"a2","kind":"action","provider":"notion","type":"create_page","position":{"x":400,"y":420},"config":{}},{"id":"a3","kind":"action","provider":"google-sheets","type":"append_row","position":{"x":400,"y":580},"config":{}},{"id":"a4","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":740},"config":{"text":"A new email campaign is queued for review: {{trigger.title}}"}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"}]}'::jsonb,
    1, 'ChainReact', '2026-07-15T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000065', NULL, NULL,
    'Weekly sales pipeline review',
    'On a schedule you choose, pull the current deals from HubSpot, create the weekly pipeline review document in Google Docs, append a snapshot row to your pipeline history sheet, and post the review to the sales channel in Slack.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"native","type":"schedule.fired","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"hubspot","type":"get_deals","position":{"x":400,"y":260},"config":{}},{"id":"a2","kind":"action","provider":"google-docs","type":"create_document","position":{"x":400,"y":420},"config":{"title":"Weekly pipeline review"}},{"id":"a3","kind":"action","provider":"google-sheets","type":"append_row","position":{"x":400,"y":580},"config":{}},{"id":"a4","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":740},"config":{"text":"The weekly sales pipeline review is ready."}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"}]}'::jsonb,
    1, 'ChainReact', '2026-07-15T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000066', NULL, NULL,
    'Project milestone client update',
    'When a milestone task is completed in Asana, record the milestone on the CRM timeline in HubSpot, prepare a client update email draft in Gmail for your review, log the delivery to a sheet, and announce it in Slack.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"asana","type":"task_completed","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"hubspot","type":"create_note","position":{"x":400,"y":260},"config":{"hs_note_body":"Milestone completed: {{trigger.taskName}}. Recorded automatically by ChainReact."}},{"id":"a2","kind":"action","provider":"gmail","type":"create_draft","position":{"x":400,"y":420},"config":{}},{"id":"a3","kind":"action","provider":"google-sheets","type":"append_row","position":{"x":400,"y":580},"config":{}},{"id":"a4","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":740},"config":{"text":"Milestone completed: {{trigger.taskName}} - a client update draft is ready."}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"}]}'::jsonb,
    1, 'ChainReact', '2026-07-15T00:00:00Z'
  )
ON CONFLICT (id) DO NOTHING;
