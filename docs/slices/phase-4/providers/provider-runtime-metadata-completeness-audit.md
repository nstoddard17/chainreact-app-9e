# Provider Runtime-vs-Metadata Completeness Audit (PROVIDER-AUDIT-1)

**Slice:** 4.PROVIDER-AUDIT-1 — first post-26/26 completeness pass.
**Type:** Doc-only audit. **No runtime/metadata/test files modified by this slice** (the launch-gap tracker hit 26/26 on 2026-05-25 via OUTLOOK-CAL-META-2; this slice walks the registry to find what "covered" actually missed).
**Date:** 2026-05-25
**Branch (verified at authoring):** `ai-12c-planner-json-only-hardening`
**Parent tracker:** [`provider-metadata-launch-gap-tracker.md`](../provider-metadata-launch-gap-tracker.md) — see §9 post-26/26 backlog.
**Authoritative inputs (verified against live code, not docs):**
- `services/execution/handlers/_registry.ts` (registered runtime action handlers)
- `grep -r "registerActivation(" integrations/**/triggers/**/index.ts` (registered runtime trigger activations)
- `find integrations/**/triggers/**/*.meta.ts` (TriggerMeta files)
- `tests/structure/discovery-meta-coverage.test.ts` (`COVERED_PROVIDERS` set + 1:1 handler↔meta invariant)
- `tests/structure/trigger-meta-activation-invariant.test.ts` (`SHARED_INFRA_EXEMPT_KEYS` exemption list)
- `services/options/_registry.ts` (registered options resolvers)
- `integrations/_registry.ts` (manifest list)

---

## TL;DR

26/26 launch-scope providers carry ActionMeta + are in `COVERED_PROVIDERS`. The 1:1 handler↔meta invariant passes; the activation-invariant passes. **The headline gap surfaced by this audit is real:**

🚨 **Stripe `event_received` — runtime activation registered + full trigger implementation shipped, but NO TriggerMeta file.** Builder UI cannot surface the trigger; AI catalog has no grounding for it. Specifically `stripe → Slack DM on failed payment` cannot be built in the Builder today despite full runtime support.

Beyond Stripe, **the launch-gap tracker's deferred items are real backlog** but none are *launch blockers* per se — each has either a documented deferral with a hand-typed fallback (resolver deferrals), a future runtime arc (FileRef, Outlook online-meeting toggle), or trigger work that was deliberately staged into its own arc (Discord / Docs / OneNote / Monday / Dropbox / Facebook triggers).

**Recommendation:** ship **STRIPE-TRIGGER-META-1** next (audit/plan), then **STRIPE-TRIGGER-META-2** (TriggerMeta + activation invariant exercise + tests). Everything else stays in the backlog with documented owners and product-decision points.

---

## 1. Runtime action registry vs ActionMeta (per provider)

**Source:** the handler registry has **286 runtime action handlers** registered across 26 providers. `COVERED_PROVIDERS` enforces 1:1 handler↔meta — if any handler lacked a meta or vice versa, `discovery-meta-coverage` would fail.

| Provider | Runtime actions | ActionMetas | 1:1? | Notes |
|---|---|---|---|---|
| `native` | 5 | 5 | ✅ | delay, format_transformer, http_request, if_then_condition, router |
| `airtable` | 11 | 11 | ✅ | AIRTABLE-META-3 |
| `discord` | 5 | 5 | ✅ | DISCORD-4 |
| `dropbox` | 11 | 11 | ✅ | DROPBOX-4 |
| `facebook` | 8 | 8 | ✅ | FACEBOOK-4 |
| `github` | 6 | 6 | ✅ | Slice 3.0b |
| `gmail` | 13 | 13 | ✅ | |
| `google-analytics` | 6 | 6 | ✅ | GOOGLE-ANALYTICS-4 |
| `google-calendar` | 5 | 5 | ✅ | GCAL-META-2 |
| `google-docs` | 5 | 5 | ✅ | GDOCS-4 |
| `google-drive` | 5 | 5 | ✅ | GDRIVE-META-2 |
| `google-sheets` | 12 | 12 | ✅ | GSHEETS-3+4 |
| `hubspot` | 26 | 26 | ✅ | HUBSPOT-3+4+5 |
| `mailchimp` | 14 | 14 | ✅ | MAILCHIMP-3 |
| `microsoft-excel` | 10 | 10 | ✅ | EXCEL-META-3 |
| `microsoft-onedrive` | 7 | 7 | ✅ | ONEDRIVE-META-3 |
| `microsoft-onenote` | 12 | 12 | ✅ | ONENOTE-4 |
| `microsoft-outlook` | 9 | 9 | ✅ | Slice 3.17 |
| `microsoft-outlook-calendar` | 5 | 5 | ✅ | OUTLOOK-CAL-META-2 |
| `microsoft-teams` | 5 | 5 | ✅ | TEAMS-META-3 |
| `monday` | 24 | 24 | ✅ | MONDAY-6 |
| `notion` | 16 | 16 | ✅ | Slice 3.41+42 |
| `shopify` | 11 | 11 | ✅ | SHOPIFY-META-2 |
| `slack` | 31 | 31 | ✅ | Slice 3.38 |
| `stripe` | 16 | 16 | ✅ | Slice 3.45+46 |
| `trello` | 8 | 8 | ✅ | TRELLO-META-3 |

**Action-meta coverage: 286/286 (100%). No gaps; no orphans. ✅**

---

## 2. Runtime trigger registry vs TriggerMeta (per provider) — THE AUDIT'S CRITICAL FINDING

**Source:** 50 unique `registerActivation("provider","type",…)` calls across `integrations/*/triggers/*/index.ts`, **plus** 10 Slack triggers exempted via `SHARED_INFRA_EXEMPT_KEYS` (Slack's Events API uses one global webhook URL + per-event filter routing — no per-workflow subscription to register). Total runtime trigger surfaces: **60**. TriggerMeta files: **59**.

**The 1-trigger discrepancy IS the Stripe gap.**

| Provider | Runtime triggers (registered/exempt) | TriggerMetas | 1:1? | Notes |
|---|---|---|---|---|
| `airtable` | 1 (`record_changed` webhook) | 1 | ✅ | |
| `discord` | 2 (`new_message`, `slash_command`) | 2 | ✅ | |
| `dropbox` | 1 (`new_file`) | 1 | ✅ | DROPBOX-5 shipped |
| `facebook` | 2 (`new_post`, `new_comment`) | 2 | ✅ | FACEBOOK-5 shipped |
| `github` | 1 (`new_commit`) | 1 | ✅ | |
| `gmail` | 3 (`new_email`, `new_attachment`, `new_labeled_email`) | 3 | ✅ | |
| `google-analytics` | 0 | 0 | ✅ | REJECTED per D-GA3 (no clean push/webhook) — not deferred |
| `google-calendar` | 1 (`event_changed` watch) | 1 | ✅ | GCAL-META-2 |
| `google-docs` | 2 (`new_document`, `document_updated`) | 2 | ✅ | GDOCS-5 shipped |
| `google-drive` | 1 (`file_changed` watch) | 1 | ✅ | GDRIVE-META-2 |
| `google-sheets` | 2 (`new_worksheet`, `row_changed`) | 2 | ✅ | |
| `hubspot` | 1 (`webhook_received` consolidated) | 1 | ✅ | Single trigger by design — filter routes events |
| `mailchimp` | 7 (audience_event, campaign_created, email_opened, link_clicked, new_audience, segment_updated, subscriber_added_to_segment) | 7 | ✅ | |
| `microsoft-excel` | 5 (new_row, new_table_row, new_worksheet, updated_row, updated_table_row) | 5 | ✅ | EXCEL-META-3 |
| `microsoft-onedrive` | 1 (`file_changed` whole-drive) | 1 | ✅ | ONEDRIVE-META-3 |
| `microsoft-onenote` | 2 (`new_note`, `updated_note` polling) | 2 | ✅ | ONENOTE-5 polling shipped |
| `microsoft-outlook` | 3 (`new_email`, `email_sent`, `email_flagged`) | 3 | ✅ | Slice 3.17 |
| `microsoft-outlook-calendar` | 1 (`event_changed` subscription) | 1 | ✅ | OUTLOOK-CAL-META-2 |
| `microsoft-teams` | 1 (`new_channel_message` per-(team,channel)) | 1 | ✅ | TEAMS-META-3 |
| `monday` | 5 (new_item, column_changed, item_moved, new_subitem, new_update) | 5 | ✅ | MONDAY-7 shipped |
| `native` | 0 (native triggers like `manual.run` / `schedule.fired` don't use the activationRegistry — dispatched via the runtime's native trigger evaluator) | 0 | ✅ | Out of audit scope |
| `notion` | 0 | 0 | ✅ | Actions-only provider; no `triggers/` directory exists |
| `shopify` | 1 (`webhook_received` consolidated) | 1 | ✅ | SHOPIFY-META-2 |
| `slack` | 10 (all `SHARED_INFRA_EXEMPT_KEYS`-exempt — global Events API webhook + filter routing) | 10 | ✅ | Slice 3.11 |
| **`stripe`** | **1 (`event_received` consolidated — registerActivation REGISTERED, full runtime in `integrations/stripe/triggers/eventReceived/`: activate.ts, allowedEventTypes.ts, deactivate.ts, index.ts, normalize.ts)** | **0** | **🚨 NO** | **MISSING TriggerMeta — `integrations/stripe/triggers/eventReceived/eventReceived.meta.ts` does not exist; Stripe is absent from `services/discovery/_registry.ts` `ALL_TRIGGER_META` spreads.** |
| `trello` | 6 (new_card, card_updated, card_moved, comment_added, member_changed, card_archived) | 6 | ✅ | TRELLO-META-3 |

**Trigger-meta coverage: 59/60 runtime triggers (98.3%). The 1 gap is `stripe:event_received`.** Why the structural tests don't catch it: `discovery-meta-coverage` enforces 1:1 only for ACTION metas (not triggers — see slice 3.46 precedent); `trigger-meta-activation-invariant` checks every META has an ACTIVATION, but there's no Stripe trigger meta to check, so the test passes vacuously.

### 2.1 Why this is real, not theoretical

- The runtime registers the activation: `registerActivation("stripe", "event_received", activate)` at `integrations/stripe/triggers/eventReceived/index.ts`.
- The activation creates a Stripe webhook endpoint and persists `subscriptionId`/`clientState`/`expiresAt`.
- The receive handler at `app/api/webhooks/stripe/...` (or equivalent) processes inbound events, normalizes via `normalize.ts`, dispatches `TriggerEvent { provider:"stripe", eventType:"event_received", ... }`.
- **The Builder cannot surface this trigger** — `/api/providers/stripe/triggers` returns `[]` because the discovery registry has nothing.
- **The AI catalog has no Stripe trigger grounding** — planner cannot wire `stripe:event_received` into a generated workflow.
- **A Workflow author who wants "Stripe failed-payment → Slack DM" CANNOT build it in the Builder today**, even though every runtime piece works. This is the canonical "builder-invisible despite runtime support" case the launch-gap tracker is supposed to prevent.

### 2.2 Why STRIPE-TRIGGER-META-2 should be the next implementation slice

- Single TriggerMeta file (one consolidated `event_received` with a Stripe-event-type select field, possibly `optionsSource:"stripe:event_types"` or static enum of `allowedEventTypes.ts`).
- Plus a new `services/discovery/providers/stripe.ts` sub-registry (the existing Stripe discovery wiring is direct, not via sub-registry — moving to the sub-registry pattern is a clean refactor).
- Plus an `ALL_TRIGGER_META` spread in `_registry.ts`.
- Plus tests (discovery + activation invariant + provider route).
- Net effort: ~1 day. Same shape as TEAMS-META-3 / GCAL-META-2's trigger-meta-only portion.

---

## 3. Builder / AI catalog visibility

**Per `/api/providers`:** all 26 providers report `hasMetadata:true` (verified by `providers-route.test.ts` — positive assertions exist for native / github / gmail / microsoft-outlook / slack / notion / stripe / google-sheets / hubspot / mailchimp / discord / google-docs / microsoft-onenote / microsoft-teams / trello / airtable / shopify / microsoft-excel / microsoft-onedrive / google-calendar / google-drive / microsoft-outlook-calendar — 22 explicit positives; the remaining 4 — facebook / google-analytics / monday / dropbox — are covered by the COVERED_PROVIDERS structural test, not by per-provider route assertions).

**Per `/api/providers/[id]/actions`:** every COVERED provider returns its full action surface in displayOrder. AI catalog can see required config field names, static enum options, and `optionsSource` references.

**Per `/api/providers/[id]/triggers`:** **24 of 26 providers return their full trigger surface.** The two exceptions:
- **`stripe`** — returns `[]` despite runtime registration (see §2.1 — the headline gap).
- **`notion`** — returns `[]` by design (actions-only provider; no `triggers/` directory).

**`hasMetadata:true` is honest for actions but slightly misleading for Stripe.** Stripe IS `hasMetadata:true` (because it has 16 ActionMeta) but `/triggers` returns `[]` even though a runtime trigger exists. A user looking at the Builder library panel will see Stripe actions but will not see any Stripe trigger to start a workflow with.

---

## 4. Sensitive-output audit

**Source:** `tests/structure/sensitive-output-coverage.test.ts` enforces the `SUSPICIOUS_NAMES` allowlist + a "no secret-shaped output names" guard across every COVERED meta. The test currently passes — meaning every suspicious-named output is either marked `sensitive:true` or explicitly allowlisted with a reason.

**Audit conclusion:** the structural test catches the broad-stroke gaps (`body`, `email`, `to`/`cc`/`bcc`, `from`, `messages`, `comments`, `users`, `payments`, `downloadUrl`, etc.). **Plan-marked sensitive outputs across the 26 providers (deliberate marks not forced by suspicious-name set):**
- Calendar `attendees` arrays + `meetLink`/`onlineMeetingUrl` (GCal/Outlook Cal).
- Outlook Cal `organizer` object.
- Bulk-read array outputs that may carry PII: `events` (GCal/Outlook Cal `list_events`), `files` (GDrive `list_files`).
- Caller-supplied email echoes: `addedAttendees`/`alreadyInvited`/`attendeesAdded`/`attendeesAlreadyPresent`.
- Pre-signed URLs: OneDrive `downloadUrl` (sensitive string).

**Borderline / sign-off worthy (NOT marked today):**
- Trigger payload `name` on GDrive `file_changed` and `subject` on calendars (file names / event titles can be PII in some workflows but are title-like by precedent across Teams subject / GCal summary). Marcus-signed-off in OUTLOOK-CAL-META-2 review as not-PII for v1.
- `webLink` / `webViewLink` deeplinks (auth-gated, not signed URLs) — consistent across OneDrive / Teams / GCal / Outlook Cal / Drive. NOT marked.

**No new under-marks found by manual scan.** The structural test continues to be the canonical enforcement.

---

## 5. Resolver / options audit

**Source:** `services/options/_registry.ts` registers **59 OptionsResolver entries** across 18 providers. Per-resolver inventory (counts cross-referenced against the audit-time grep):

| Provider | Resolvers | Notes |
|---|---|---|
| `airtable` | 5 (`bases`, `tables`, `fields`, `views`, `attachment_fields`) | `:records` REJECTED (no consumer — recordId is typed) |
| `discord` | 6 (`guilds`, `channels`, `members`, `roles`, `messages`, `bot_messages`) | |
| `dropbox` | 2 (`folders`, `files`) | |
| `facebook` | 4 (`pages`, `posts`, `albums`, `conversations`) | |
| `google-analytics` | 4 (`accounts`, `properties`, `data_streams`, `conversion_events`) | |
| `google-docs` | 1 (`documents`) | |
| `google-drive` | 1 (`folders`) | `:files` DEFERRED; `:items` / `:shared_drives` REJECTED |
| `google-sheets` | 2 (`spreadsheets`, `sheets`) | |
| `hubspot` | 6 (`deal_pipelines`, `deal_stages`, `ticket_pipelines`, `ticket_stages`, `owners`, `lists`) | |
| `mailchimp` | 3 (`audiences`, `campaigns`, `segments`) | |
| `microsoft-excel` | 3 (`workbooks`, `worksheets`, `tables`) | `:columns` DEFERRED |
| `microsoft-onedrive` | 2 (`folders`, `items`) | `:drives` REJECTED |
| `microsoft-onenote` | 3 (`notebooks`, `sections`, `pages`) | |
| `microsoft-teams` | 2 (`teams`, `channels`) | `:members` REJECTED (no input consumer); `:chats` / `:messages` DEFERRED |
| `monday` | 7 (`boards`, `groups`, `columns`, `users`, `items`, `file_columns`, `item_files`) | |
| `native` | 1 (`examples`) | |
| `slack` | 1 (`channels`) | |
| `trello` | 5 (`boards`, `lists`, `cards`, `members`, `labels`) | `:checklists` / `:check_items` REJECTED |

**Providers with ZERO resolvers (deliberate — every id field is typeable / trigger-fed):**
- `github`, `gmail`, `google-calendar`, `microsoft-outlook`, `microsoft-outlook-calendar`, `notion`, `shopify`, `stripe`

For each ZERO-resolver provider, the audit confirms there's a documented rationale:
- `github` — repos / issues / PRs are typeable / upstream-fed (no resolver shipped in Slice 3.0b).
- `gmail` — labels resolver exists implicitly via the label-management actions returning lists; per-action label pickers TBD.
- `google-calendar` — `:calendars` SCOPE-BLOCKED (needs `calendarList` scope + reconnect — GCAL-META-1 §3); `:events` deferred; calendarId defaults `"primary"`.
- `microsoft-outlook` — folders/labels — deferred to mail-side metadata work (not in scope).
- `microsoft-outlook-calendar` — `:calendars`/`:categories` REJECTED (no consumer — actions hardcoded to `/me/events`); `:events` deferred; OUTLOOK-CAL-META-1 §3.
- `notion` — Notion's database/page pickers are surfaced via the runtime's variable picker on trigger payloads; deliberate.
- `shopify` — optional resolvers deferred to SHOPIFY-META-3.
- `stripe` — Stripe's resource picker UX uses combobox + dynamic handlers (e.g. `find_customer`, `find_payment_intent`); deliberate.

**Resolver-coverage conclusion: no new gaps found beyond the documented deferrals.** Every dependsOn reference resolves to an existing resolver key (structural test would fail otherwise). No orphan resolvers.

---

## 6. Provider backlog (deferred ≠ deleted)

Consolidated from the launch-gap tracker §9 + every per-provider plan §10/§11 closeout reminder + this audit's findings. **Single source of truth going forward.**

| # | Provider | Item | Type | Launch impact | Recommendation |
|---|---|---|---|---|---|
| 1 | **stripe** | `event_received` TriggerMeta | Missing TriggerMeta (runtime SHIPPED) | **🚨 LAUNCH BLOCKER** — Builder cannot surface Stripe webhook trigger; AI cannot ground Stripe-failed-payment-style workflows | **Fix before launch (STRIPE-TRIGGER-META-2).** Single meta file + sub-registry + tests. ~1 day. |
| 2 | google-calendar | `:calendars` resolver | Deferred resolver | Low — calendarId defaults `"primary"` (covers 90%+ of real use); typeable for the long tail | Post-launch. Product decision needed: adding `calendarList` scope FORCES every connected user to reconnect (cost vs benefit). |
| 3 | google-drive | `:files` resolver | Deferred resolver | Low — fileId trigger-fed / upstream-fed in practice; large/ambiguous lists if shipped | Post-launch (optional GDRIVE-FILES-RESOLVER). |
| 4 | google-drive | FileRef on upload/download | Runtime arc | Medium — upload is textarea string today; binary content requires base64 pre-encode in upstream node | Post-launch (GDRIVE-FILEREF runtime arc). |
| 5 | google-drive | share / export actions | Runtime arc | Low — `permissionsCreate` / `filesExport` API helpers exist (tested) but no action wires them | Post-launch (GDRIVE-SHARE / GDRIVE-EXPORT). |
| 6 | microsoft-onedrive | FileRef on upload/download | Runtime arc | Medium — same shape as GDrive FileRef gap; OneDrive `downloadUrl` is already sensitive string output | Post-launch (ONEDRIVE-FILEREF). |
| 7 | microsoft-teams | `:chats` resolver | Deferred resolver | Medium UX gap — `send_chat_message.chatId` is typeable text; chat labeling is non-trivial (1:1 chats have no name) | Post-launch — Marcus decision documented in TEAMS-META-1 (basic resolver or accept typeable). |
| 8 | microsoft-teams | `:messages` resolver | Deferred resolver | Low — messageId trigger-fed / typeable | Post-launch. |
| 9 | microsoft-excel | `:columns` resolver | Deferred resolver | Low — column selector UX gap on row-level actions; typeable | Post-launch. |
| 10 | microsoft-outlook-calendar | online-meeting write toggle | Runtime arc | Low — runtime can READ `isOnlineMeeting`/`onlineMeetingUrl` but not WRITE-attach a Teams meeting on create_event (contrast GCal's `googleMeet` boolean) | Post-launch (OUTLOOK-CAL-MEETINGS runtime arc). |
| 11 | shopify | optional resolvers | Deferred resolver | Low | Post-launch (SHOPIFY-META-3 optional). |
| 12 | google-analytics | triggers | **Rejected** per D-GA3 | None — actions-only provider; no clean push/webhook + polling fragile | REJECTED — not a backlog item. |
| 13 | airtable | `:records` resolver | **Rejected** | None — recordId typed | REJECTED — not a backlog item. |
| 14 | microsoft-onedrive | `:drives` resolver | **Rejected** | None — single personal drive; no driveId in any schema | REJECTED — not a backlog item. |
| 15 | trello | `:checklists` / `:check_items` resolvers | **Rejected** | None — no runtime consumer | REJECTED — not a backlog item. |
| 16 | microsoft-teams | `:members` resolver | **Rejected** | None — no input consumer (`get_team_members` outputs members but no action takes a memberId input) | REJECTED — not a backlog item. |
| 17 | microsoft-outlook-calendar | `:calendars` / `:categories` resolvers | **Rejected** | None — no field consumer (actions hardcoded to `/me/events`) | REJECTED — not a backlog item. |
| 18 | microsoft-outlook-calendar | `:events` / `:timezones` resolvers | Deferred / Rejected | None — events deferred (trigger-fed), timezones rejected (cap blocker) | Post-launch (events) / REJECTED (timezones). |
| 19 | google-calendar | `:events` / `:timezones` / `:colors` resolvers | Deferred / Rejected | None — events deferred (trigger-fed), timezones rejected (cap blocker), colors deferred (niche) | Post-launch (events/colors) / REJECTED (timezones). |
| 20 | google-analytics | (no triggers) | Rejected per D-GA3 | None | Actions-only is the accepted final state. |

**Summary by category:**
- **Launch blockers: 1** (Stripe `event_received` TriggerMeta).
- **Post-launch backlog: 10** items (3 deferred resolvers + 4 runtime arcs + 3 deferred sub-items across calendars).
- **Rejected: 8** items (no runtime consumer / cap blocker / actions-only design).

---

## 7. Definition of "provider foundation launch-ready"

A provider foundation is **launch-ready** when ALL of the following hold:

- [x] **All launch-scope runtime actions have a matching ActionMeta or documented deferral/rejection.** ✅ (286/286 — `discovery-meta-coverage` enforces, 26/26 in COVERED).
- [ ] **All launch-scope runtime triggers have a matching TriggerMeta or documented deferral/rejection.** ❌ Stripe `event_received` is registered runtime but has no TriggerMeta and is not on any deferral list (it's the only gap).
- [x] **All required `optionsSource` keys exist in `services/options/_registry.ts`.** ✅ (every dependsOn reference resolves; no orphan resolvers).
- [x] **Static enum options are exposed via `options[]` where field types need them.** ✅ (verified per-provider in metas — select fields all have `options` or `optionsSource`, not both per the schema's superRefine).
- [x] **Sensitive outputs are marked.** ✅ (`sensitive-output-coverage` enforces; plan-marked + Marcus sign-offs captured in plans).
- [x] **Provider route metadata matches reality.** ✅ for actions on all 26; **partial** for triggers — Stripe `/triggers` returns `[]` despite runtime support.
- [x] **AI catalog can see all launch-intended nodes.** ✅ for actions on all 26; **partial** for triggers — Stripe trigger is invisible to the planner.
- [x] **Known deferred items have an owner and a recommendation.** ✅ (this audit's §6 table is the consolidated owner record).

**Net:** one ❌ blocks "launch-ready" — **Stripe `event_received` TriggerMeta.** After it ships, the foundation is launch-ready by every criterion above.

> **🎯 UPDATE (2026-05-25 — STRIPE-TRIGGER-META-2 shipped):** the lone ❌ is now ✅. Stripe `event_received` TriggerMeta + sub-registry refactor landed at commit (see `stripe-trigger-meta-plan.md` §9). `/api/providers/stripe/triggers` now returns the trigger with `enabledEvents` config + 18 static options including the 3 failed-payment events. **Provider foundation is launch-ready by every criterion in §7.** Subsequent provider work pulls from §6's post-launch backlog by product priority.

---

## 8. Recommended next implementation slice

**Slice 4.STRIPE-TRIGGER-META** — two-slice arc:
- **STRIPE-TRIGGER-META-1** (audit/plan) — short doc walking:
  - The existing runtime (activate / normalize / allowedEventTypes / index — already shipped).
  - The trigger config shape (what event types should be selectable? — `allowedEventTypes.ts` constrains the runtime; meta should expose a multiselect or string-array field for which Stripe event types to fire on).
  - The payload shape (from `normalize.ts`).
  - Sensitive-output decisions (Stripe events carry `customer`/`paymentIntent`/`subscription` — already in SUSPICIOUS_NAMES; map to sensitive object types).
  - Whether to ship a `services/discovery/providers/stripe.ts` sub-registry refactor at the same time (the existing Stripe discovery imports are direct in `_registry.ts` — moving to a sub-registry is clean and matches the OUTLOOK-CAL / GDRIVE / GCAL / TEAMS / ONEDRIVE / AIRTABLE / TRELLO / EXCEL / SHOPIFY pattern).
- **STRIPE-TRIGGER-META-2** (implementation) — TriggerMeta file + sub-registry + `_registry.ts` `ALL_TRIGGER_META` wire + 3 new tests + 1 updated `providers-route.test.ts` (Stripe positive trigger assertion).

After STRIPE-TRIGGER-META ships, the provider foundation reaches launch-ready by every criterion. Subsequent work pulls from §6's post-launch backlog by product priority.

---

## 9. Items deliberately out of scope for this audit slice

- **No implementation.** Audit-only — Stripe TriggerMeta is described in §8 but NOT shipped here.
- **No billing/tasks changes.**
- **No template / custom-node work.**
- **No AI-track touches.**
- **No runtime handler behavior changes.**
- **No new resolvers.** All gaps documented in §5 are deferred or rejected with rationale.
- **No structural-test changes.** The three structural tests (`discovery-meta-coverage`, `trigger-meta-activation-invariant`, `sensitive-output-coverage`) all pass at audit time and continue to define the canonical invariants. The fact that they don't catch Stripe's missing TriggerMeta is a design choice (trigger-meta coverage is deliberately not enforced 1:1 per the slice 3.46 precedent), not a test bug.

---

## Appendix — provider count reconciliation

The launch-gap tracker uses **286 handlers across 26 providers**. This audit's grouped per-provider counts (§1 table) sum to 286 — reconciled. The `services/execution/handlers/_registry.ts` file lists each entry with a `{provider, type, handler}` literal; a raw `grep` of `{provider:` returns 283 lines because some entries span multiple lines (e.g. Notion's create_database entry's complex literal) — the canonical count is 286 (test-validated).

**Total trigger surface (runtime): 60** — 50 via `registerActivation` + 10 Slack-exempt. **TriggerMeta files: 59.** Discrepancy = 1 = Stripe.

**Branch/worktree caution.** Authored on the shared `ai-12c-planner-json-only-hardening` branch with interleaved AI + provider commits; explicit-path staging only; verify branch topology before any push/PR.
