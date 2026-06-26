-- ChainReactV2 — portable variable-only PREWIRING for 3 complex official templates
-- (Slice 4.WORKFLOW-TEMPLATES-OFFICIAL-PREWIRE-1).
--
-- DATA-ONLY, UPDATE-ONLY, GUARDED, IDEMPOTENT, FORWARD-ONLY. Establishes the narrow
-- "variable-only prewiring" policy for official templates: a few node config values may carry
-- PORTABLE expressions (credential-free `{{nodeId.path}}` variable references against verified
-- upstream outputs, plus safe non-account-specific static labels), while EVERY account-specific
-- field stays blank for the builder to collect. This makes the complex batch-4 templates
-- substantially prewired without storing any account data.
--
-- WHY UPDATE, NOT a new seed: batch 4 already inserted these rows (applied to the live project).
-- The locked rule forbids editing an applied migration, so this is a NEW forward migration that
-- UPDATEs only the `definition` jsonb of exactly THREE official rows, by fixed UUID.
--
-- GUARD (cannot touch user/community templates): every statement filters
--   id = '<one of the 3 official UUIDs>' AND source = 'official' AND account_id IS NULL.
-- User/community templates have source='user' + a non-null account_id, so they are never matched.
--
-- IDEMPOTENT: each statement SETs the definition to a FIXED value, so re-running (or a db:push
-- replay) converges to the same state. No INSERT/DELETE, no DDL, no RLS/GRANT/POLICY change.
--
-- SAFETY (no-leak): the ONLY values added are (a) `{{trigger.<field>}}` / `{{<nodeId>.<field>}}`
-- variable references whose paths are DECLARED outputs of the upstream node (verified against the
-- live discovery metadata: trigger payloadShape + action OutputMeta), and (b) safe, generic,
-- non-account-specific static labels (internal artifact titles / note bodies / channel text). NO
-- token, secret, email, account id, user id, integration id, or provider-resource id (channel /
-- list / board / sheet / calendar / folder / pipeline / recipient) appears. Account-resource
-- selectors, recipients, and notify/visibility toggles are LEFT BLANK on purpose. The variable
-- references resolve only at the USER's runtime in the USER's account — the seed holds the
-- reference STRING, never the data. The dedicated test
-- tests/unit/migrations/prewireOfficialTemplates.test.ts proves: every config key is a real meta
-- field, every reference path is a declared upstream output, the canonical resolver resolves every
-- expression, no literal leaks appear, and the account-specific fields remain blank.
--
-- Templates prewired (batch 4):
--   c0ffee00-...-04e  Support escalation from email
--   c0ffee00-...-04c  Lead intake to sales handoff
--   c0ffee00-...-05a  New team member onboarding
--
-- ROLLBACK (pre-launch): re-run the empty-config form, or DELETE+reseed batch 4. The batch-4
-- INSERT migration (20260710...) remains the credential-free, empty-config source of record.

-- ── Support escalation from email (04e) ──────────────────────────────────────
-- a1 ticket subject ← email subject; a2 card name ← email subject; a3 escalation text ← subject
-- + sender; a4 draft reply targets the originating Gmail message id (trigger.id). Blank: ticket
-- pipeline/stage, Trello list, Slack channel.
UPDATE public.workflow_templates SET definition =
  '{"nodes":[{"id":"trigger","kind":"trigger","provider":"gmail","type":"new_labeled_email","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"hubspot","type":"create_ticket","position":{"x":400,"y":260},"config":{"subject":"{{trigger.subject}}"}},{"id":"a2","kind":"action","provider":"trello","type":"create_card","position":{"x":400,"y":420},"config":{"name":"{{trigger.subject}}"}},{"id":"a3","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":580},"config":{"text":"New support request: {{trigger.subject}} (from {{trigger.from}})"}},{"id":"a4","kind":"action","provider":"gmail","type":"create_draft_reply","position":{"x":400,"y":740},"config":{"originalMessageId":"{{trigger.id}}"}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"}]}'::jsonb
WHERE id = 'c0ffee00-0000-4000-8000-00000000004e' AND source = 'official' AND account_id IS NULL;

-- ── Lead intake to sales handoff (04c) ───────────────────────────────────────
-- a2 list-add email ← created contact's email output; a3/a4 safe internal task/note labels; a6
-- Slack text references the created contact email. Blank: contact email (webhook carries no
-- email — see contract gap), duplicate-handling, list, sheet (resource/format), Slack channel.
UPDATE public.workflow_templates SET definition =
  '{"nodes":[{"id":"trigger","kind":"trigger","provider":"hubspot","type":"webhook_received","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"hubspot","type":"create_contact","position":{"x":400,"y":260},"config":{}},{"id":"a2","kind":"action","provider":"hubspot","type":"add_contact_to_list","position":{"x":400,"y":420},"config":{"email":"{{a1.email}}"}},{"id":"a3","kind":"action","provider":"hubspot","type":"create_task","position":{"x":400,"y":580},"config":{"hs_task_subject":"Follow up with new lead"}},{"id":"a4","kind":"action","provider":"hubspot","type":"create_note","position":{"x":400,"y":740},"config":{"hs_note_body":"Lead captured automatically by ChainReact from a new CRM record."}},{"id":"a5","kind":"action","provider":"google-sheets","type":"append_row","position":{"x":400,"y":900},"config":{}},{"id":"a6","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":1060},"config":{"text":"New lead added to the pipeline: {{a1.email}}"}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"},{"id":"e5","from":"a4","to":"a5"},{"id":"e6","from":"a5","to":"a6"}]}'::jsonb
WHERE id = 'c0ffee00-0000-4000-8000-00000000004c' AND source = 'official' AND account_id IS NULL;

-- ── New team member onboarding (05a) ─────────────────────────────────────────
-- a4 subitem chains to the created monday item (boardId/parentItemId ← a3 outputs); a1/a2/a3/a5/a7
-- safe internal titles + text. Blank: monday board/group, calendar notify + guest-visibility
-- toggles, the welcome-email recipient + body, Slack channel. (manual.run inputs are opaque, so
-- no trigger mapping is possible — see contract gap.)
UPDATE public.workflow_templates SET definition =
  '{"nodes":[{"id":"trigger","kind":"trigger","provider":"native","type":"manual.run","position":{"x":400,"y":100},"config":{}},{"id":"a1","kind":"action","provider":"google-drive","type":"create_folder","position":{"x":400,"y":260},"config":{"name":"New team member onboarding"}},{"id":"a2","kind":"action","provider":"google-docs","type":"create_document","position":{"x":400,"y":420},"config":{"title":"Onboarding checklist"}},{"id":"a3","kind":"action","provider":"monday","type":"create_item","position":{"x":400,"y":580},"config":{"itemName":"New hire onboarding"}},{"id":"a4","kind":"action","provider":"monday","type":"create_subitem","position":{"x":400,"y":740},"config":{"boardId":"{{a3.boardId}}","parentItemId":"{{a3.itemId}}","subitemName":"Onboarding checklist item"}},{"id":"a5","kind":"action","provider":"google-calendar","type":"create_event","position":{"x":400,"y":900},"config":{"summary":"New hire orientation"}},{"id":"a6","kind":"action","provider":"gmail","type":"create_draft","position":{"x":400,"y":1060},"config":{}},{"id":"a7","kind":"action","provider":"slack","type":"send_channel_message","position":{"x":400,"y":1220},"config":{"text":"A new team member is being onboarded. See the onboarding folder, document, and board item."}}],"edges":[{"id":"e1","from":"trigger","to":"a1"},{"id":"e2","from":"a1","to":"a2"},{"id":"e3","from":"a2","to":"a3"},{"id":"e4","from":"a3","to":"a4"},{"id":"e5","from":"a4","to":"a5"},{"id":"e6","from":"a5","to":"a6"},{"id":"e7","from":"a6","to":"a7"}]}'::jsonb
WHERE id = 'c0ffee00-0000-4000-8000-00000000005a' AND source = 'official' AND account_id IS NULL;
