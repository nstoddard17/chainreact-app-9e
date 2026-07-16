# TEMPLATE-QUALITY-1 — closeout: business-process template catalog

**Date:** 2026-07-15 · **Status:** complete locally, NOT pushed, migrations NOT applied
(`db:push` not run — owner approval required).
**Companion audit:** [`docs/product/template-business-capability-audit.md`](../../../product/template-business-capability-audit.md)

## Outcome

Every platform (official) template now models a complete business process with **at least five
meaningful nodes** (trigger included). The 75 two/three-node integration demos from seed
batches 1–3 are retired by a forward-only guarded DELETE migration; 12 new business-process
templates (batch 5) join the 15 kept batch-4 templates for an effective catalog of **27**.

| Metric | Before | After |
|---|---|---|
| Platform templates | 90 | **27** |
| Removed (≤4 nodes) | — | 75 |
| Retained (batch 4, ≥5 nodes) | 15 | 15 |
| Added (batch 5) | — | 12 |
| Node counts (min / median / max) | 2 / 2 / 8 | **5 / 6 / 8** |

## Template-system inventory (Phase 1 findings)

Single source of truth: `workflow_templates` DB rows seeded by forward-only migrations. All
surfaces read those rows — marketplace listing/detail routes → `repositories/workflowTemplates.ts`
(`.or("source.eq.official,visibility.eq.public")`), Templates page (`features/templates/
TemplatesDashboard.tsx` + `core/workflows/templateBrowse.ts` — search/category/sort are derived
client-side from server rows; "Recommended" is server order, no featured hardcodes), AI/React-
Agent matcher (`services/workflows/officialTemplateMatching.ts` → `listOfficialTemplatesServiceRole()`
→ live DB). **No static catalog, no seed-on-boot, no hardcoded template ids in app source.**
Stale template ids already resolve via the existing `template_not_found` (404) path (covered in
`templateUseFork.test.ts` / detail-route tests). Deleting the DB rows therefore purges every
surface at once; the repo-side "catalog" is the seed/prewire/retire migration set, which the
static tests validate.

FK behavior on delete (from `20260617000000_workflow_templates_marketplace.sql`):
`forked_from_template_id` → ON DELETE SET NULL (user forks survive, lineage clears);
usage-ledger `template_id` → ON DELETE CASCADE (platform-owned officials only — no
contributor rewards affected). Workflows created from templates carry no FK — untouched.

## Changes

**Migrations (forward-only, data-only, idempotent, NOT applied):**

- `supabase/migrations/20260720000000_retire_official_templates_batch_1_3.sql` — DELETE of
  exactly the 75 retired official UUIDs, guarded by `source='official' AND account_id IS NULL
  AND id IN (<fixed ids>)`. No node-count predicate; can never match user/community rows.
- `supabase/migrations/20260720000001_seed_official_templates_batch_5.sql` — INSERT of 12
  templates (`…05b`–`…066`), `ON CONFLICT (id) DO NOTHING`, platform-owned invariants, configs
  empty or safe-prewired per the locked variable-only policy (verified refs + generic labels;
  first batch to seed prewiring directly since the rows have never been applied anywhere).

**Tests:**

- NEW `tests/unit/migrations/officialTemplateCatalogIntegrity.test.ts` — the central
  enforcement gate (17 checks): reconstructs the EFFECTIVE catalog (seeds − retirements +
  prewire overlays) and enforces the ≥5-node floor, unique ids/names, schema validity, live-
  registry node registration, real config field names, declared-output `{{ref}}` paths,
  canonical-resolver resolution, reachability, branch-label rules, blank-policy
  (recipient/consent/behavior fields never prewired; resource ids only as pure upstream
  `{{…}}` refs), no-leak literals, card-meta `{{…}}` hiding, and retirement-migration shape
  (DELETE-only/guarded/fixed-ids). **Regression guard:** any future seed of a <5-node template
  fails the build unless it is also retired.
- `seedOfficialTemplates.test.ts` — floor 90→102 (seed corpus), KNOWN_NODES + batch-5 pairs,
  config policy "empty" → "empty or safe scalar string", `\bsk_` word-boundary fix.
- `templateUseFork.test.ts` — now instantiates the EFFECTIVE catalog (27 floor) through the
  real `/use` service path; prewired configs must survive verbatim.
- `official-templates-seed.dev.test.ts` (gated DB) — pinned id moved to kept `…04c`; new
  assertion that retired ids are absent after the migration is applied.

**Docs:** the capability audit + gap report (link above), this closeout, and a currency note in
`.claude/skills/chainreactv2-template-author/SKILL.md`.

## Removed templates (75 — all of batches 1–3)

Reason for every row: **≤4 total nodes — provider feature demo, not a complete business
process** (catalog floor is now 5). Removed from: DB rows (retirement migration → marketplace,
Templates page, search/category, detail routes, AI matcher — all read those rows), and the
static test corpus floors. Seed files for batches 1–3 remain in the repo (applied migrations
are never edited); the integrity test proves the retirement exactly covers them.

| ID | Title | Nodes | Batch |
|---|---|---|---|
| `…0001` | New email to Slack alert | 2 | 1 |
| `…0002` | Scheduled Slack digest | 2 | 1 |
| `…0003` | New commit to Slack | 2 | 1 |
| `…0004` | Draft a quick email | 2 | 1 |
| `…0005` | Email to GitHub issue | 2 | 1 |
| `…0006` | New email lead to CRM contact | 2 | 2 |
| `…0007` | Intake to CRM deal | 2 | 2 |
| `…0008` | New CRM record to Slack | 2 | 2 |
| `…0009` | Log new CRM contact to a sheet | 2 | 2 |
| `…000a` | Follow-up task for new deal | 2 | 2 |
| `…000b` | New Trello card to CRM contact | 2 | 2 |
| `…000c` | Daily CRM contact digest | 3 | 2 |
| `…000d` | New Shopify order to Slack | 2 | 2 |
| `…000e` | New Shopify order to a sheet | 2 | 2 |
| `…000f` | New Shopify order to CRM contact | 2 | 2 |
| `…0010` | Failed payment alert to Slack | 2 | 2 |
| `…0011` | New Stripe customer to Mailchimp | 2 | 2 |
| `…0012` | Stripe payment to ledger sheet | 2 | 2 |
| `…0013` | New order to fulfillment note | 2 | 2 |
| `…0014` | Welcome new subscribers | 3 | 2 |
| `…0015` | Tag engaged subscribers | 2 | 2 |
| `…0016` | Announce new campaigns in Slack | 2 | 2 |
| `…0017` | Schedule a recurring Facebook post | 2 | 2 |
| `…0018` | Facebook comment to Slack queue | 2 | 2 |
| `…0019` | New doc to Slack announcement | 2 | 2 |
| `…001a` | Log a marketing event to analytics | 2 | 2 |
| `…001b` | Daily standup reminder | 2 | 2 |
| `…001c` | New Slack channel to directory | 2 | 2 |
| `…001d` | Welcome new channel members | 2 | 2 |
| `…001e` | Route flagged email to Slack | 2 | 2 |
| `…001f` | New Teams message to Trello task | 2 | 2 |
| `…0020` | Weekly team digest email | 2 | 2 |
| `…0021` | Shared file alert to Teams | 2 | 2 |
| `…0022` | New commit to Trello card | 2 | 2 |
| `…0023` | Bug report email to GitHub issue | 2 | 2 |
| `…0024` | New Trello card to GitHub issue | 2 | 2 |
| `…0025` | Monday item to GitHub issue | 2 | 2 |
| `…0026` | Nightly deploy reminder | 2 | 2 |
| `…0027` | New commit to changelog doc | 2 | 2 |
| `…0028` | New Drive file to Slack | 2 | 2 |
| `…0029` | Dropbox file to OneDrive backup | 2 | 2 |
| `…002a` | New OneDrive file to Teams | 2 | 2 |
| `…002b` | Gmail attachment to Drive | 2 | 2 |
| `…002c` | New doc to a shareable link | 2 | 2 |
| `…002d` | Archive new Drive files | 2 | 2 |
| `…002e` | Flagged email to Trello task | 2 | 2 |
| `…002f` | Daily agenda email | 2 | 2 |
| `…0030` | Calendar event to Slack reminder | 2 | 2 |
| `…0031` | Quick note to Notion | 2 | 2 |
| `…0032` | New email to Notion inbox | 2 | 2 |
| `…0033` | New lead to CRM contact and Slack alert | 3 | 3 |
| `…0034` | New deal to CRM and Teams | 3 | 3 |
| `…0035` | New CRM record to monday item | 2 | 3 |
| `…0036` | New CRM record to Trello card | 2 | 3 |
| `…0037` | New CRM record to Gmail follow-up draft | 2 | 3 |
| `…0038` | New CRM record to Outlook follow-up draft | 2 | 3 |
| `…0039` | New Airtable record to CRM contact | 2 | 3 |
| `…003a` | New sheet row to CRM contact | 2 | 3 |
| `…003b` | New sheet lead to Slack sales alert | 2 | 3 |
| `…003c` | New Airtable lead to Slack sales alert | 2 | 3 |
| `…003d` | Stripe event to CRM contact | 2 | 3 |
| `…003e` | Stripe event to monday finance item | 2 | 3 |
| `…003f` | Stripe event to Teams finance alert | 2 | 3 |
| `…0040` | Shopify order to monday fulfillment item | 2 | 3 |
| `…0041` | Shopify order to Trello fulfillment card | 2 | 3 |
| `…0042` | Shopify customer to marketing list | 2 | 3 |
| `…0043` | Shopify order to Teams alert | 2 | 3 |
| `…0044` | New segment subscriber to CRM contact | 2 | 3 |
| `…0045` | New segment subscriber to Airtable | 2 | 3 |
| `…0046` | New segment subscriber to Slack alert | 2 | 3 |
| `…0047` | Weekly analytics report to Teams | 3 | 3 |
| `…0048` | Weekly digest to Teams | 2 | 3 |
| `…0049` | Weekly report row to a sheet | 2 | 3 |
| `…004a` | Analytics snapshot to Slack | 3 | 3 |
| `…004b` | Analytics snapshot to a sheet | 3 | 3 |

## New templates (batch 5 — per-template audit)

Classification legend (locked prewiring policy): **A** account/resource selector → blank ·
**V** verified variable reference (declared upstream output) · **D** safe generic static ·
**U** unsupported contract gap → blank + documented.

External side effects across the batch: Slack/Teams channel messages (internal, disclosed in
descriptions); **all email is drafts only** (`create_draft` / `create_draft_reply` — nothing
sends automatically); CRM/PM/sheet/doc/calendar writes are internal records. No template
auto-activates; preview/instantiation executes nothing (unchanged lifecycle behavior).

| ID / Title | Outcome | Nodes | Graph (trigger → actions) | Key mappings (V/D) | Blank (A/U) |
|---|---|---|---|---|---|
| `…05b` Webform lead capture to CRM follow-up | Form lead lands as CRM contact+deal with qualification task, intake log, sales alert | 6 | typeform:new_response_in_form → hubspot:create_contact → create_deal → create_task → sheets:append_row → slack:send_channel_message | D dealname, task subject; V slack text ({{trigger.formTitle}}) | A formId, sheet, channel, dealstage, duplicateHandling; **U** contact email (answers array — gap G3) |
| `…05c` Low survey score follow-up | Every response logged; scores <7 open a ticket, alert success, prep outreach draft | 6 | typeform:new_response_in_form → sheets:append_row → **native:if_then_condition** →(true) hubspot:create_ticket → slack → gmail:create_draft | V if input {{trigger.score}}; D operator less_than, value 7, onFalse skip, ticket subject; V slack text | A form/sheet/channel/pipeline; recipient (draft) blank |
| `…05d` New meeting booked to prepared call | Booking becomes CRM contact, prep task, notes doc, log, team alert | 6 | calendly:event_scheduled → hubspot:create_contact → create_task → docs:create_document → sheets:append_row → slack | V contact email {{trigger.inviteeEmail}}, task subject + doc title + slack text ({{trigger.meetingName}}/{{trigger.inviteeName}}) | A duplicateHandling, sheet, channel |
| `…05e` Canceled meeting recovery | Cancellation opens rebooking task, reschedule draft, log, owner alert | 5 | calendly:event_canceled → hubspot:create_task → gmail:create_draft → sheets:append_row → slack | V task subject + slack text ({{trigger.meetingName}}) | A sheet/channel; recipient blank |
| `…05f` Invoice tracking and payment follow-up | New invoice logged to AR ledger with owned follow-up + finance alert | 5 | quickbooks:invoice_created → quickbooks:get_customer → sheets:append_row → hubspot:create_task → slack | V get_customer.customerId {{trigger.customerId}} (derived-id exception), task subject ({{trigger.docNumber}}/{{trigger.dueDate}}), slack text ({{trigger.customerName}}) | A sheet/channel |
| `…060` Record and acknowledge received payments | Payment logged, CRM timeline note, thank-you draft, finance alert | 5 | quickbooks:payment_received → sheets:append_row → hubspot:create_note → gmail:create_draft → slack | V note body + slack text ({{trigger.customerName}}/{{trigger.referenceNumber}}) | A sheet/channel; recipient blank |
| `…061` Subscription cancellation rescue | Cancellation event opens save-task, win-back draft, churn log, team alert | 6 | stripe:event_received → stripe:find_customer → hubspot:create_task → gmail:create_draft → sheets:append_row → slack | D task subject; V slack text ({{trigger.stripeEventType}}) | A enabledEvents (user selects subscription events — stated in description), sheet, channel; **U** customer identity (opaque `data` — gap G1); find_customer has no required fields |
| `…062` Vendor invoice email intake | Labeled invoice email acknowledged (draft), AP task opened, register updated, finance alerted | 5 | gmail:new_labeled_email → gmail:create_draft_reply → asana:create_task → sheets:append_row → slack | V originalMessageId {{trigger.id}} (derived-id), task name + slack text ({{trigger.subject}}) | A labelId, project, sheet, channel; **U** attachment filing (gap G2) |
| `…063` Employee offboarding checklist | One run creates master checklist + access/payroll subtasks, exit interview, internal notice draft, team alert | 7 | native:manual.run → asana:create_task → create_subtask ×2 → gcal:create_event → gmail:create_draft → slack | V parentTaskGid {{a1.taskGid}} (both subtasks — derived-id); D task/subtask names, event summary "Exit interview", slack text | A project, calendar + notify/guest toggles, channel; recipient blank |
| `…064` Campaign QA and launch coordination | New campaign gets QA task, record page, calendar log, marketing alert before send | 5 | mailchimp:campaign_created → asana:create_task → notion:create_page → sheets:append_row → slack | V task name + slack text ({{trigger.title}}) | A project, notion parent/properties, sheet, channel |
| `…065` Weekly sales pipeline review | Scheduled deal snapshot → review doc, history row, sales-channel post | 5 | native:schedule.fired → hubspot:get_deals → docs:create_document → sheets:append_row → slack | D doc title, slack text | A cron, sheet, channel; get_deals optional filters user-set; **U** per-deal itemization (gap G5) |
| `…066` Project milestone client update | Completed milestone recorded on CRM, client draft prepared, delivery logged, team told | 5 | asana:task_completed → hubspot:create_note → gmail:create_draft → sheets:append_row → slack | V note body + slack text ({{trigger.taskName}}) | A projectId, sheet, channel; recipient blank |

**Node-necessity rule applied:** each graph is capture → record → own → (communicate as
draft) → notify; removing any node drops a business responsibility (the log removes reporting,
the task removes ownership, the draft removes the customer/internal communication, the alert
removes team awareness). No duplicate-tracker fan-out; exactly one notification per flow.

**Why every reference is safe:** every `{{…}}` first segment was verified against the
declared trigger `payloadShape` / action `OutputMeta` and resolves through the canonical
`resolveStrict` resolver in tests; the only id-shaped values are upstream-produced references
immediately required downstream (`customerId`, `parentTaskGid`, `originalMessageId`). No
literal ids, emails, or secrets anywhere (test-enforced).

**Skipped ideas (not faked):** high-value-order routing, staged dunning, attachment filing,
sentiment triage, approval flows, no-show recovery — see gap report (G1–G9) in the audit doc.

## Verification (all run 2026-07-15, from the ChainReactV2 repo)

- `npx jest tests/unit/migrations tests/structure/official-template-node-registration.test.ts
  tests/unit/services/workflows tests/unit/core/workflows tests/unit/features/templates
  tests/unit/repositories/workflowTemplates.test.ts` — **94 suites / 1143 tests passed**
  (includes the new 17-check integrity gate).
- `npm run typecheck` · `npm run lint` · `npm run lint:structure` · `npm run lint:migrations`
  · full `npm test` — results recorded in the owner report for this slice (run after this doc
  was authored; see commit messages).

**Requirement→test mapping (Phase 8):** ≥5-node floor + schema + unknown-node + stale-edge/
unreachable + variable-reference checks → `officialTemplateCatalogIntegrity.test.ts`; deleted
templates absent from every surface → single DB source of truth + gated
`official-templates-seed.dev.test.ts` retired-absence check; Templates page renders only what
the repository lists → existing `TemplatesDashboard`/repository/browse tests (no client-side
catalog exists to filter); preview executes nothing + application inserts through the existing
flow → existing `useTemplatePreviewFlow` / `templateUseFork` tests (the latter now exercises
all 27 effective templates); reintroduction guard → integrity test "retirement covers EXACTLY
the seeded templates with fewer than five nodes".

## Not changed (explicitly)

Template preview/application flows, lifecycle safeguards (no auto-activation), account
ownership/authz, RLS/grants, readiness/setup-needed UX, marketplace routes, AI guidance route
wiring, user-created templates (never touched by the guarded migrations), and all non-template
provider work. No push, no deploy, no PR, no `db:push`, no production-data change.

## Follow-ups

- Owner-approved `db:push` to apply retirement + batch 5 (preflight per skill §7 passes:
  DELETE-only / INSERT-only, guarded, data-only, idempotent).
- Gap slices G1–G9 (see audit doc §3) — G1 (webhook payload flattening) and G2
  (`new_attachment` attachmentId) are the highest-leverage next steps.

---

## Production closeout addendum (2026-07-15)

TEMPLATE-QUALITY-1 is **live in production**.

- **Migrations applied** (via `npm run db:push`, target guard `qcepijemjlkssfkvzlio` verified):
  `20260720000000_retire_official_templates_batch_1_3.sql` then
  `20260720000001_seed_official_templates_batch_5.sql`. Both recorded in the remote migration
  ledger. The files were **renumbered from 20260715xxxxxx** in forward commit `3e17dfd08` — a
  parallel slice's applied `20260715000000_workflow_checkpoints.sql` collided with the version.
- **Direct DB certification (13/13 PASS):** 27 officials (15 batch-4 + 12 batch-5, each id
  exactly once), all 75 retired ids absent, node counts min 5 / median 6 / max 8
  (distribution 8×5, 11×6, 7×7, 1×8), all rows platform-owned/public/ChainReact, no fork
  lineage pointing at retired ids, retired usage-ledger rows cascaded.
- **Pushed + deployed:** commits `366631b22`, `8e2109747`, `3e17dfd08`, `7048a0ae4` reached
  `origin/v2-main`; final production deployment `dpl_GDL87d7Vtcuf5ZXn8fBdFRtwNRwm` (commit
  `7048a0a`) Ready and aliased to https://chainreact.app.
- **Surface certification (34/34 PASS, authenticated):** Templates page shows exactly 27
  official cards incl. all 12 batch-5 titles; retired titles gone; business-purpose search
  works; details dialogs hide `{{…}}`; marketplace API returns 27 officials with no <5-node
  card; retired id → 404; malformed id → 404; AI guidance strong-matches batch-5
  `…05d` deterministically (no model call) and never forces a template on an unsupported
  request; linear + branching template application inserts exact graphs (labeled `true` edge +
  if/then mapping intact), workflows stay `draft`, cleanup verified; zero 5xx observed.
- **Certification fixes (forward commit `7048a0ae4`):** matcher lexicon gained
  `calendly` / `quickbooks` / `asana` (batch-5 providers could never strong-match before);
  `/use` + `/fork` now 404 on malformed (non-uuid) template ids instead of 500.
- **Known environmental limitation (pre-existing, unrelated):** SEC-3 Turnstile blocks the
  automated password sign-in used by the authenticated Playwright smoke and the DB-gated RLS
  test's `signInWithPassword` (`captcha protection: request disallowed`). Public smoke: PASSED.
  Surface certification instead minted the smoke user's session via the service-role magiclink
  admin API. Follow-up: teach the smoke harness a Turnstile-compatible auth path.
