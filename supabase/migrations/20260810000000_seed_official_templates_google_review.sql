-- ChainReactV2 — official reviewer templates for GOOGLE OAUTH VERIFICATION
-- (GOOGLE-REVIEW-TEMPLATE-1 + GOOGLE-REVIEW-CERTIFICATION-2).
--
-- All six Google providers share ONE OAuth client (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET via
-- integrations/_shared/google/oauth.ts), so ONE Google Cloud project and ONE consent screen carry
-- the union of every requested scope. These three templates give the reviewer a real, user-facing
-- test for each of them. Scope -> demonstrating node (each traced to a live API call):
--
--   gmail.readonly            -> gmail:new_email                 (users.history/messages/labels)
--   gmail.send                -> gmail:send_email                (users.messages.send)
--   gmail.modify              -> gmail:add_label                 (users.messages.modify)
--   gmail.compose             -> gmail:create_draft_reply        (users.drafts.create)
--   drive                     -> google-drive:upload_file        (upload/drive/v3/files)
--                             -> google-docs:share_document      (drive/v3/files/{id}/permissions)
--   drive.metadata.readonly   -> google-sheets:append_row picker  (drive/v3/files list)
--   spreadsheets              -> google-sheets:append_row        (v4/spreadsheets values.append)
--   documents                 -> google-docs:create_document / update_document / get_document
--   calendar.events           -> google-calendar:create_event    (calendar/v3 events.insert)
--   calendar.readonly         -> google-calendar:create_event picker (users/me/calendarList)
--   analytics.readonly        -> google-analytics:run_report / get_realtime_data / find_conversion
--   analytics.edit            -> google-analytics:create_conversion_event (Admin conversionEvents.create)
--   userinfo.email            -> every non-Gmail Google connect callback (account identification)
--
-- google-analytics:send_event is deliberately NOT used: it authenticates with a Measurement
-- Protocol measurementId + apiSecret, NOT the OAuth bearer, so it proves nothing about
-- analytics.edit. create_conversion_event is the action that actually carries that scope.
--
-- Same platform-owned invariants as batches 1-5:
--   source='official', account_id NULL, created_by_user_id NULL, visibility='public',
--   creator_display_name_snapshot='ChainReact', schema_version=1.
--
-- CONFIG POLICY (unchanged from 20260711000000 / 20260712000000 / 20260720000001): a config value
-- is ONLY (a) a portable credential-free {{trigger.path}} / {{nodeId.path}} reference whose first
-- path segment is a DECLARED output of the referenced node (verified against the live discovery
-- registry), or (b) a safe, generic, non-account-specific static label. Everything the reviewer
-- must choose stays blank and surfaces as Setup Needed: Drive folder, Sheets file + range +
-- value-input choice, Calendar + start/end + the guest-consent toggles, the Gmail label, the Gmail
-- recipient, the Docs share recipients + notification toggle + insert location, and every
-- Analytics property / metric / date-range selection.
--
-- Node displayName carries the reviewer-facing step names; it is display-only metadata on the
-- whitelisted template node shape and survives /use verbatim.
--
-- NO-LEAK: no token, secret, email address, account/user/integration/credential id, or literal
-- provider-resource id appears anywhere. Names/descriptions are apostrophe-free plain text.
--
-- VERSION: 20260810000000 deliberately follows the highest applied version (20260809000000).
-- The first draft used 20260730000000, which COLLIDES with the applied
-- 20260730000000_revoke_default_privileges_api_keys_and_mcp_tokens.sql — supabase keys migration
-- history on the version prefix, so that file would have been silently skipped and no template
-- would ever have been inserted. scripts/check-migration-rls.mjs now fails on duplicate versions.
--
-- IDEMPOTENT + FORWARD-ONLY: fixed ids continuing the sequence (...067-...069) +
-- ON CONFLICT (id) DO NOTHING.
--
-- ROLLBACK (pre-launch): DELETE FROM public.workflow_templates
--   WHERE id IN ('c0ffee00-0000-4000-8000-000000000067','c0ffee00-0000-4000-8000-000000000068',
--                'c0ffee00-0000-4000-8000-000000000069') AND source = 'official';

INSERT INTO public.workflow_templates
  (id, account_id, created_by_user_id, name, description, source, visibility,
   definition, schema_version, creator_display_name_snapshot, published_at)
VALUES
  (
    'c0ffee00-0000-4000-8000-000000000067', NULL, NULL,
    'Google Review Test',
    'Provided for Google OAuth verification. Requires one connection each to Gmail, Google Drive, Google Sheets, and Google Calendar. It reads a newly received Gmail message and then uses only the message information explicitly mapped into the later steps - ChainReact never reads Google data that a step is not wired to. Step 1 (Gmail - Read a new email) READS the sender, subject, received time, Gmail message id, and Gmail message snippet of a new inbox message whose subject contains ChainReact Google Review. You select nothing here. Step 2 (Google Drive - Save the email information) CREATES one new plain-text file containing those five values; you select the destination folder. Step 3 (Google Sheets - Log the workflow activity) ADDS one row of sender, subject, received time, Gmail message id, and the Drive file name; you select the spreadsheet, the range, and how values are entered. Step 4 (Google Calendar - Create a follow-up event) CREATES one event titled after the subject, described with the sender, subject, message id, and the Drive file link; you select the calendar, the start and end date-time, and the three guest options. Step 5 (Gmail - Apply a review label) CHANGES the labels on the triggering message only; you select which label is applied. Step 6 (Gmail - Prepare a reply draft) CREATES an unsent draft reply to the triggering message in your own mailbox; nothing is sent by this step. Step 7 (Gmail - Send a confirmation) SENDS one email from the connected Gmail account; you select the recipient. Nothing runs until you finish setup and turn the workflow on.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"gmail","type":"new_email","displayName":"1. Gmail — Read a new email","position":{"x":400,"y":100},"config":{"subject":"ChainReact Google Review","subjectExactMatch":false}},{"id":"a1","kind":"action","provider":"google-drive","type":"upload_file","displayName":"2. Google Drive — Save the email information","position":{"x":400,"y":260},"config":{"filename":"Google Review - {{trigger.subject}}.txt","mimeType":"text/plain","content":"Sender: {{trigger.from}}\nSubject: {{trigger.subject}}\nReceived: {{trigger.receivedAt}}\nGmail message ID: {{trigger.id}}\n\nMessage: {{trigger.snippet}}"}},{"id":"a2","kind":"action","provider":"google-sheets","type":"append_row","displayName":"3. Google Sheets — Log the workflow activity","position":{"x":400,"y":420},"config":{"values":["{{trigger.from}}","{{trigger.subject}}","{{trigger.receivedAt}}","{{trigger.id}}","{{a1.name}}"]}},{"id":"a3","kind":"action","provider":"google-calendar","type":"create_event","displayName":"4. Google Calendar — Create a follow-up event","position":{"x":400,"y":580},"config":{"summary":"Follow up: {{trigger.subject}}","description":"Sender: {{trigger.from}}\nSubject: {{trigger.subject}}\nGmail message ID: {{trigger.id}}\nSaved to Drive: {{a1.webViewLink}}"}},{"id":"a4","kind":"action","provider":"gmail","type":"add_label","displayName":"5. Gmail — Apply a review label","position":{"x":400,"y":740},"config":{"messageId":"{{trigger.id}}"}},{"id":"a5","kind":"action","provider":"gmail","type":"create_draft_reply","displayName":"6. Gmail — Prepare a reply draft","position":{"x":400,"y":900},"config":{"originalMessageId":"{{trigger.id}}","textBody":"ChainReact prepared this reply draft for your review. It has not been sent."}},{"id":"a6","kind":"action","provider":"gmail","type":"send_email","displayName":"7. Gmail — Send a confirmation","position":{"x":400,"y":1060},"config":{"subject":"Re: {{trigger.subject}}","textBody":"ChainReact received your message and completed the Google Review Test workflow."}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"},{"id":"e5","from":"a4","to":"a5"},{"id":"e6","from":"a5","to":"a6"}]}'::jsonb,
    1, 'ChainReact', '2026-07-30T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000068', NULL, NULL,
    'Google Docs Review Test',
    'Provided for Google OAuth verification. Requires one connection to Google Docs, which requests the Google Docs documents permission plus Google Drive access. Run it on demand - it has no trigger that watches your account. Step 1 (Start) runs the test when you press Run. Step 2 (Google Docs - Create a review document) CREATES one new Google Docs document with a fixed title and a fixed paragraph of text; you may optionally select a destination folder, which is the Drive permission in use. Step 3 (Google Docs - Add a line to the document) CHANGES that same document by inserting one more line of fixed text; you select where the text is inserted. Step 4 (Google Docs - Read the document back) READS only the document this run created, to show the read half of the documents permission. Step 5 (Google Docs - Share the document) CHANGES the sharing of that same document; you select who it is shared with, the access level, and whether Google sends a notification. That sharing call is the reason Google Docs requests Drive access. ChainReact reads no other document in your Drive. Nothing runs until you finish setup and press Run.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"native","type":"manual.run","displayName":"1. Start — Run the review test on demand","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"google-docs","type":"create_document","displayName":"2. Google Docs — Create a review document","position":{"x":400,"y":260},"config":{"title":"ChainReact Google Review - document test","content":"Created by the ChainReact Google Review Test workflow to demonstrate the Google Docs create permission."}},{"id":"a2","kind":"action","provider":"google-docs","type":"update_document","displayName":"3. Google Docs — Add a line to the document","position":{"x":400,"y":420},"config":{"documentId":"{{a1.documentId}}","content":"This line was added by the ChainReact update step to demonstrate the Google Docs write permission."}},{"id":"a3","kind":"action","provider":"google-docs","type":"get_document","displayName":"4. Google Docs — Read the document back","position":{"x":400,"y":580},"config":{"documentId":"{{a1.documentId}}"}},{"id":"a4","kind":"action","provider":"google-docs","type":"share_document","displayName":"5. Google Docs — Share the document","position":{"x":400,"y":740},"config":{"documentId":"{{a1.documentId}}"}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"}]}'::jsonb,
    1, 'ChainReact', '2026-07-30T00:00:00Z'
  ),
  (
    'c0ffee00-0000-4000-8000-000000000069', NULL, NULL,
    'Google Analytics Review Test',
    'Provided for Google OAuth verification. Requires one connection to Google Analytics, which requests the Analytics read permission and the Analytics edit permission. Run it on demand - it has no trigger that watches your account. You select your Analytics account and property on every step; ChainReact reads no property you have not selected. Step 1 (Start) runs the test when you press Run. Step 2 (Google Analytics - Run a report) READS aggregated report rows for the property, date range, and metrics you select. Step 3 (Google Analytics - Read realtime activity) READS current activity for the property you select. Step 4 (Google Analytics - Look up a conversion event) READS the list of conversion events on the property so you can pick one. Steps 2 to 4 use only the Analytics read permission. Step 5 (Google Analytics - Create a conversion event) CHANGES the property by marking one named event as a conversion; this single step is the only reason the Analytics edit permission is requested, and it is reversible from the Google Analytics console. The separate Send Event action is not used here because it authenticates with a measurement id and API secret rather than this Google connection. Nothing runs until you finish setup and press Run.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"native","type":"manual.run","displayName":"1. Start — Run the review test on demand","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"google-analytics","type":"run_report","displayName":"2. Google Analytics — Run a report","position":{"x":400,"y":260},"config":{}},{"id":"a2","kind":"action","provider":"google-analytics","type":"get_realtime_data","displayName":"3. Google Analytics — Read realtime activity","position":{"x":400,"y":420},"config":{}},{"id":"a3","kind":"action","provider":"google-analytics","type":"find_conversion","displayName":"4. Google Analytics — Look up a conversion event","position":{"x":400,"y":580},"config":{}},{"id":"a4","kind":"action","provider":"google-analytics","type":"create_conversion_event","displayName":"5. Google Analytics — Create a conversion event","position":{"x":400,"y":740},"config":{"eventName":"chainreact_google_review_test"}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"}]}'::jsonb,
    1, 'ChainReact', '2026-07-30T00:00:00Z'
  )
ON CONFLICT (id) DO NOTHING;
