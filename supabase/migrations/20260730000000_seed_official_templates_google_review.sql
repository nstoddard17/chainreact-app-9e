-- ChainReactV2 — official template seed: GOOGLE REVIEW TEST (GOOGLE-REVIEW-TEMPLATE-1).
--
-- ONE reviewer-facing official template built for the Google OAuth verification team. It
-- demonstrates, in a single coherent five-node workflow, one legitimate user-facing feature per
-- Google product whose scopes ChainReact requests for Gmail, Drive, Sheets, and Calendar:
--   gmail.readonly           -> gmail:new_email trigger (reads the arriving message)
--   drive                    -> google-drive:upload_file (creates a file in a user-chosen folder)
--   spreadsheets             -> google-sheets:append_row (logs the activity to a user-chosen sheet)
--   calendar.events          -> google-calendar:create_event (creates a follow-up event)
--   gmail.send / gmail.modify-> gmail:send_email (sends the confirmation)
-- Google Docs (documents) and Google Analytics (analytics.readonly / analytics.edit) scopes are
-- requested by their own providers and are NOT demonstrated here; that gap is recorded in the
-- slice Owner Report rather than papered over with an unrelated node.
--
-- Same platform-owned invariants as batches 1-5:
--   source='official', account_id NULL, created_by_user_id NULL, visibility='public',
--   creator_display_name_snapshot='ChainReact', schema_version=1.
--
-- CONFIG POLICY (unchanged from 20260711000000 / 20260712000000 / 20260720000001): a config value
-- is ONLY (a) a portable credential-free {{trigger.path}} / {{nodeId.path}} reference whose first
-- path segment is a DECLARED output of the referenced node (verified against the live discovery
-- registry: gmail:new_email payloadShape; google-drive:upload_file OutputMeta), or (b) a safe,
-- generic, non-account-specific static label. EVERYTHING account-specific stays blank so the
-- reviewer selects it during setup and sees normal Setup Needed states:
--   * Drive parentFolderId, Sheets spreadsheetId + range, Calendar calendarId  (account resources)
--   * Gmail send to/cc/bcc                                                     (recipients)
--   * Calendar sendNotifications / guestsCanInviteOthers / guestsCanSeeOtherGuests (consent)
--   * Calendar startDateTime / endDateTime                                     (no safe default)
--   * Sheets valueInputOption / insertDataOption                               (behavior switches)
-- Node displayName carries the reviewer-facing step names (1..5); it is display-only metadata on
-- the whitelisted template node shape and survives /use verbatim.
--
-- NO-LEAK: no token, secret, email address, account/user/integration/credential id, or literal
-- provider-resource id appears anywhere. Names/descriptions are apostrophe-free plain text.
--
-- IDEMPOTENT + FORWARD-ONLY: fixed id continuing the sequence (...067) + ON CONFLICT DO NOTHING.
--
-- ROLLBACK (pre-launch): DELETE FROM public.workflow_templates
--   WHERE id = 'c0ffee00-0000-4000-8000-000000000067' AND source = 'official';

INSERT INTO public.workflow_templates
  (id, account_id, created_by_user_id, name, description, source, visibility,
   definition, schema_version, creator_display_name_snapshot, published_at)
VALUES
  (
    'c0ffee00-0000-4000-8000-000000000067', NULL, NULL,
    'Google Review Test',
    'This workflow is provided for Google OAuth verification. It reads a newly received Gmail message, saves selected message information to Google Drive, logs the activity in Google Sheets, creates a Google Calendar follow-up, and sends a Gmail confirmation. The user selects the Google accounts, files, folders, spreadsheets, calendars, and recipients used during setup. Step 1 (Gmail - Read a new email) detects a newly received Gmail message and reads the message information needed by the remaining workflow steps; it is pre-filtered to subjects containing ChainReact Google Review. Step 2 (Google Drive - Save the email information) creates a file in the Google Drive folder selected by the user; ChainReact only uses the Gmail information mapped into this step. Step 3 (Google Sheets - Log the workflow activity) adds a row to the spreadsheet selected by the user so the email-processing activity can be tracked; the row columns are sender, subject, received at, Gmail message id, and the Drive file name. Step 4 (Google Calendar - Create a follow-up event) creates a follow-up event on the Google Calendar selected by the user; pick the start and end time during setup. Step 5 (Gmail - Send a confirmation) sends an email using the connected Gmail account to demonstrate the Gmail sending permission; choose the recipient during setup.',
    'official', 'public',
    '{"nodes":[{"id":"trigger","kind":"trigger","provider":"gmail","type":"new_email","displayName":"1. Gmail — Read a new email","position":{"x":400,"y":100},"config":{"subject":"ChainReact Google Review","subjectExactMatch":false}},{"id":"a1","kind":"action","provider":"google-drive","type":"upload_file","displayName":"2. Google Drive — Save the email information","position":{"x":400,"y":260},"config":{"filename":"Google Review - {{trigger.subject}}.txt","mimeType":"text/plain","content":"Sender: {{trigger.from}}\nSubject: {{trigger.subject}}\nReceived: {{trigger.receivedAt}}\nGmail message ID: {{trigger.id}}\n\nMessage: {{trigger.snippet}}"}},{"id":"a2","kind":"action","provider":"google-sheets","type":"append_row","displayName":"3. Google Sheets — Log the workflow activity","position":{"x":400,"y":420},"config":{"values":["{{trigger.from}}","{{trigger.subject}}","{{trigger.receivedAt}}","{{trigger.id}}","{{a1.name}}"]}},{"id":"a3","kind":"action","provider":"google-calendar","type":"create_event","displayName":"4. Google Calendar — Create a follow-up event","position":{"x":400,"y":580},"config":{"summary":"Follow up: {{trigger.subject}}","description":"Sender: {{trigger.from}}\nSubject: {{trigger.subject}}\nGmail message ID: {{trigger.id}}\nSaved to Drive: {{a1.webViewLink}}"}},{"id":"a4","kind":"action","provider":"gmail","type":"send_email","displayName":"5. Gmail — Send a confirmation","position":{"x":400,"y":740},"config":{"subject":"Re: {{trigger.subject}}","textBody":"ChainReact received your message and completed the Google Review Test workflow."}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"}]}'::jsonb,
    1, 'ChainReact', '2026-07-30T00:00:00Z'
  )
ON CONFLICT (id) DO NOTHING;
