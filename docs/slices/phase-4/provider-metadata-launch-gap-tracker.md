# Provider Metadata / Builder Launch-Gap Tracker

**Slice:** 4.PROVIDER-DOCS-1
**Type:** Doc-only tracker. **No runtime/source/test/metadata files modified.**
**Date:** 2026-05-25
**Branch:** `v2-provider-docs-1`
**Authoritative inputs (verified against live code, not docs):**
- `services/execution/handlers/_registry.ts` (registered runtime handlers)
- `tests/structure/discovery-meta-coverage.test.ts` (`COVERED_PROVIDERS` set)
- `services/discovery/_registry.ts` + `services/discovery/providers/*` (builder-visible metas)
- `services/options/_registry.ts` (options resolvers)
- `integrations/<provider>/**` filesystem counts
- Full Jest run `npx jest`: **1,113 passed / 1 skipped suites; 12,382 passed / 7 skipped tests; 0 failures.**

---

## 1. Accepted correction summary

The corrected provider-foundation status, accepted by Marcus on 2026-05-25:

> **Provider runtime is essentially complete across the 26 current V2 providers — but provider metadata/builder launch readiness still has a 9-provider gap.**

What this means precisely:

- **Runtime is real and complete.** All 26 providers (25 OAuth/token providers + `native`) have their full accepted action surface registered in the handler registry — **286 handlers**. Handler bodies are **real, not stubs** (verified: 0 stub/not-implemented markers across all `integrations/*/actions/`; representative bodies read in full — e.g. `integrations/shopify/actions/createOrder.ts`, `integrations/microsoft-excel/actions/updateRow.ts` — both make real provider API calls with `refreshAndRetry` OAuth + Zod-validated config).
- **Builder/metadata is NOT complete.** Only **17 of 26 providers** carry the ActionMeta/TriggerMeta + discovery-registry wiring that makes them usable in the Workflow Builder. The other **9 providers are runtime-present but builder-invisible** — they appear in `/api/providers` with `hasMetadata: false`, which the UI renders as **"coming soon"** with zero selectable actions/triggers.
- **The revived-7 provider closeout was accurate within its own scope.** `provider-completion-closeout.md` and `phase-2-final-closeout.md` declared completion for **the revived completion queue** (Discord, Google Docs, OneNote, Monday, Dropbox, Facebook, Google Analytics) + native nodes. They are correct for that scope. They did **not** assert that the 9 original Phase-1 providers were builder-metadata-complete — and there is no doc that does. The misread risk is treating "Phase 2 complete" as "all 26 providers are builder-ready."

**Framing rule going forward:** do not call the provider foundation "fully complete" or "launch-ready" until the 9 providers below are either metadata-covered or explicitly deferred out of launch scope by product decision.

---

## 2. The 26 metadata/builder-COVERED providers (tracker closed)

> **Update (Slice 4.SHOPIFY-META-2):** `shopify` flipped pending → COVERED (17 → 18).
> **Update (Slice 4.EXCEL-META-3, 2026-05-25):** `microsoft-excel` flipped pending → COVERED — 10 ActionMeta + 5 polling TriggerMeta (resolvers shipped in EXCEL-META-2). Count 18 → 19.
> **Update (Slice 4.AIRTABLE-META-3, 2026-05-25):** `airtable` flipped pending → COVERED — 11 ActionMeta + 1 webhook TriggerMeta (resolvers shipped in AIRTABLE-META-2). Count 19 → 20.
> **Update (Slice 4.TRELLO-META-3, 2026-05-25):** `trello` flipped pending → COVERED — 8 ActionMeta + 6 per-board webhook TriggerMeta + 6 UI-scope `boardId` schema additions (resolvers shipped in TRELLO-META-2). Count 20 → 21.
> **Update (Slice 4.ONEDRIVE-META-3, 2026-05-25):** `microsoft-onedrive` flipped pending → COVERED — 7 ActionMeta + 1 whole-drive webhook TriggerMeta (`file_changed`, empty fields) + 4 UI-scope `parentItemId` schema additions (resolvers shipped in ONEDRIVE-META-2). FileRef deferred; `delete_item` high/destructive/confirm. Count 21 → 22.
> **Update (Slice 4.TEAMS-META-3, 2026-05-25):** `microsoft-teams` flipped pending → COVERED — 5 ActionMeta + 1 per-(team,channel) webhook TriggerMeta (`new_channel_message`) (resolvers shipped in TEAMS-META-2). NO UI-scope additions (teamId/channelId already real fields); no destructive action; chats/messages/members deferred-or-rejected. Count 22 → 23.
> **Update (Slice 4.GCAL-META-2, 2026-05-25):** `google-calendar` flipped pending → COVERED — 5 ActionMeta + 1 watch-based webhook TriggerMeta (`event_changed`, single calendarId field). **ZERO resolvers** (calendarId=typeable text default "primary" — the `calendars` picker is scope-blocked, no `calendarList` scope/reconnect; eventId trigger/upstream-fed; timezones/colors deferred-or-rejected). NO UI-scope additions (calendarId/eventId already real fields). `delete_event` = high/destructive/requiresConfirmation. Single implementation slice (no resolver slice). Count 23 → 24.
> **Update (Slice 4.GDRIVE-META-2, 2026-05-25):** `google-drive` flipped pending → COVERED — 5 ActionMeta + 1 watch-based webhook TriggerMeta (`file_changed`, fileId watch-target + folderId post-fetch filter — both → `google-drive:folders`). **ZERO new resolvers** (the existing `google-drive:folders` resolver is REUSED; `:files` deferred — fileId typeable/trigger-fed; `:items`/`:shared_drives` rejected — no consumers). NO UI-scope additions (every picker parent already real). `delete_file` = high/destructive/requiresConfirmation in BOTH `permanent` modes. FileRef deferred (mirror OneDrive: content=textarea string; producesFileRef/consumesFileRef=false on all 5). Single implementation slice (no resolver slice). Count 24 → 25.
> **Update (Slice 4.OUTLOOK-CAL-META-2, 2026-05-25 — FINAL launch-gap provider; tracker CLOSES at 26/26):** `microsoft-outlook-calendar` flipped pending → COVERED — 5 ActionMeta + 1 Graph-subscription webhook TriggerMeta (`event_changed`, `fields:[]` — no per-workflow filtering). **ZERO resolvers** (no `calendarId` field anywhere — actions pinned to `/me/events`; `calendars`/`categories` REJECTED — no consumers; `events` DEFERRED — trigger/upstream-fed; `timezones` REJECTED — cap blocker). NO UI-scope schema additions. **Approach-A flat-time-fields shim** on `create_event` + `update_event` schemas (additive Zod preprocess accepts both nested + flat shape — narrow, behavior-preserving; nested shape callers unchanged). `delete_event` = high/destructive/requiresConfirmation (Graph auto-notifies attendees per tenant — no caller suppress knob). Sensitive (deliberate plan-marks + `body` FORCED by SUSPICIOUS_NAMES): attendees / organizer / events / attendeesAdded / attendeesAlreadyPresent / `onlineMeetingUrl` + trigger payload `body`. `providers-route.test.ts` "still-pending example" block RETIRED (positive Outlook Calendar hasMetadata=true assertion replaces it). Single implementation slice (no resolver slice). Count 25 → 26. **🎯 26/26 — launch-gap tracker closes; 9-provider arc complete.**

Enforced 1:1 (every registered handler has a meta) by `COVERED_PROVIDERS` in `tests/structure/discovery-meta-coverage.test.ts`:

`native, github, gmail, microsoft-outlook, slack, notion, stripe, google-sheets, hubspot, mailchimp, discord, google-docs, microsoft-onenote, monday, dropbox, facebook, google-analytics, shopify, microsoft-excel, airtable, trello, microsoft-onedrive, microsoft-teams, google-calendar, google-drive, microsoft-outlook-calendar`

These are builder-usable today. Drift (adding a handler without a meta, or vice-versa) fails the structural test.

## 3. Pending-metadata providers (launch-scope gap) — NONE 🎯

**The 9-provider launch-gap arc is complete. There are 0 pending launch-scope providers.** Every original Phase-1 mainstream provider with a runtime handler is now metadata/builder-covered. (`shopify` SHOPIFY-META-2 → `microsoft-excel` EXCEL-META-3 → `airtable` AIRTABLE-META-3 → `trello` TRELLO-META-3 → `microsoft-onedrive` ONEDRIVE-META-3 → `microsoft-teams` TEAMS-META-3 → `google-calendar` GCAL-META-2 → `google-drive` GDRIVE-META-2 → `microsoft-outlook-calendar` OUTLOOK-CAL-META-2.)

**⚠️ 26/26 covered ≠ provider foundation fully complete.** See §9 for the post-26/26 closeout reminder — there is a real backlog of deferred items (Stripe `event_received` TriggerMeta, deferred trigger arcs for Discord / Docs / OneNote / Monday / Dropbox / Facebook, deferred resolvers across GCal / GDrive / Teams / OneDrive, FileRef runtime work, Outlook online-meeting write toggle, etc.). Those items still own their definition-of-done. **Deferred ≠ deleted.**

---

## 4. What "covered" means (definition of done per provider)

A provider is metadata/builder-complete only when ALL of the following hold:

1. **ActionMeta** — every registered runtime action handler has a co-located `<action>.meta.ts` exporting a contract-valid `ActionMeta` (`contracts/actionMeta.ts`). Key invariant: `key === "${provider}:${type}"`.
2. **TriggerMeta** — every trigger that should ship has a `<trigger>.meta.ts` exporting a contract-valid `TriggerMeta` (`contracts/triggerMeta.ts`), and its activation hook is registered so `trigger-meta-activation-invariant.test.ts` passes. (Trigger coverage is not gated by the meta-coverage test — precedent set by Stripe — so actions-only or trigger-deferred providers are an explicit documented choice, never a silenced failure.)
3. **Discovery registry** — metas wired into `services/discovery/_registry.ts` (directly, or via a `services/discovery/providers/<provider>.ts` sub-registry to keep the central registry under the 400-line lint cap). Module-load validation (`ActionMetaSchema.parse` + duplicate-key rejection) runs centrally.
4. **Builder-visible** — `/api/providers` reports `hasMetadata: true`; `/api/providers/[id]/{actions,triggers}` return the provider's surface; the builder library panel renders the actions/triggers, not "coming soon".
5. **Options resolvers** — present for ID-bearing fields that need a picker, OR explicitly deferred with rationale (hand-typed IDs acceptable for a first pass). Resolvers live colocated under `integrations/<provider>/options/` and register in `services/options/_registry.ts`.
6. **COVERED_PROVIDERS / invariants** — provider added to `COVERED_PROVIDERS`; `discovery-meta-coverage`, `trigger-meta-activation-invariant`, and `sensitive-output-coverage` all pass, locking 1:1 handler↔meta drift protection in going forward.

---

## 5. Pending-provider table

Runtime counts from the handler registry + trigger tree. "Runtime triggers" counts trigger implementations present in `integrations/<provider>/triggers/**`; activation wiring is confirmed per-provider during its arc.

| # | Provider | Runtime actions | Runtime triggers | Current builder status | Missing metadata / resolver work | Recommended arc | Priority |
|---|---|---|---|---|---|---|---|
| ~~1~~ | ~~**shopify**~~ | 11 | 1 | ✅ **COVERED (SHOPIFY-META-2)** — `hasMetadata:true` | DONE: 11 ActionMeta + 1 TriggerMeta + `services/discovery/providers/shopify.ts` + COVERED flip. Resolvers deferred to optional SHOPIFY-META-3. | — | done |
| ~~1~~ | ~~**microsoft-excel**~~ | 10 | 5 | ✅ **COVERED (EXCEL-META-3)** — `hasMetadata:true` | DONE: EXCEL-META-2 resolvers (`workbooks`/`worksheets`/`tables` + `tablesList` helper) + EXCEL-META-3 (10 ActionMeta + 5 TriggerMeta + sub-registry + COVERED flip). `delete_row`/`delete_worksheet` = high/destructive/confirm. `columns` resolver deferred. | — | done |
| ~~3~~ | ~~**google-calendar**~~ | 5 | 1 | ✅ **COVERED (GCAL-META-2)** — `hasMetadata:true` | DONE: GCAL-META-2 (5 ActionMeta + 1 `event_changed` watch webhook TriggerMeta (single calendarId field) + `services/discovery/providers/google-calendar.ts` + COVERED flip). **ZERO resolvers** — `calendars` picker scope-blocked (no `calendarList` scope/reconnect; calendarId=typeable text default "primary"); eventId trigger/upstream-fed; timezones/colors deferred-or-rejected. **NO UI-scope schema fields** (calendarId/eventId already real). `delete_event` = high/destructive/requiresConfirmation. Single implementation slice (no resolver slice). | — | done |
| ~~4~~ | ~~**microsoft-outlook-calendar**~~ | 5 | 1 | ✅ **COVERED (OUTLOOK-CAL-META-2)** — `hasMetadata:true` | **DONE — final launch-gap provider; tracker CLOSES at 26/26.** OUTLOOK-CAL-META-2 (5 ActionMeta + 1 `event_changed` Graph-subscription webhook TriggerMeta (`fields:[]` — no per-workflow filtering) + `services/discovery/providers/microsoft-outlook-calendar.ts` + COVERED flip). **ZERO resolvers** (no `calendarId` field anywhere — actions pinned to `/me/events`; `calendars`/`categories` REJECTED — no consumers; `events` DEFERRED — typeable/trigger-fed; `timezones` REJECTED — cap blocker). **NO UI-scope schema additions.** **Approach-A flat-time-fields shim** on create_event + update_event schemas (additive Zod preprocess; nested shape preserved — existing direct-handler tests pass). `delete_event` = high/destructive/requiresConfirmation (Graph auto-notifies attendees per tenant; no caller suppress knob). Sensitive: attendees / organizer / events / attendeesAdded / attendeesAlreadyPresent / `onlineMeetingUrl` + trigger `body` (FORCED). `providers-route.test.ts` "still-pending" block RETIRED. Single implementation slice (no resolver slice). | — | done |
| ~~5~~ | ~~**google-drive**~~ | 5 | 1 | ✅ **COVERED (GDRIVE-META-2)** — `hasMetadata:true` | DONE: GDRIVE-META-2 (5 ActionMeta + 1 `file_changed` watch webhook TriggerMeta — fileId watch-target + folderId post-fetch filter, both → `google-drive:folders` + `services/discovery/providers/google-drive.ts` + COVERED flip). **ZERO new resolvers** (existing `google-drive:folders` REUSED). `:files` deferred (fileId typeable/trigger-fed); `:items`/`:shared_drives` rejected (no consumers). **NO UI-scope schema fields** (parentFolderId/folderId/newParentFolderId/fileId already real). `delete_file` = high/destructive/requiresConfirmation in BOTH `permanent` modes. **FileRef DEFERRED** (mirror OneDrive: content=textarea string; producesFileRef/consumesFileRef=false on all 5). Single implementation slice (no resolver slice). | — | done |
| ~~6~~ | ~~**microsoft-onedrive**~~ | 7 | 1 | ✅ **COVERED (ONEDRIVE-META-3)** — `hasMetadata:true` | DONE: ONEDRIVE-META-2 resolvers (`folders`/`items`, reuse `driveItemsList`, no new helper) + ONEDRIVE-META-3 (7 ActionMeta + 1 `file_changed` webhook TriggerMeta (`fields:[]`) + 4 UI-scope `parentItemId` schema fields + `services/discovery/providers/microsoft-onedrive.ts` + COVERED flip). `delete_item`=high/destructive/confirm. **FileRef deferred** (content=textarea, downloadUrl=sensitive string; producesFileRef/consumesFileRef=false) — future ONEDRIVE-FILEREF runtime slice. `:drives` rejected. | — | done |
| ~~7~~ | ~~**microsoft-teams**~~ | 5 | 1 | ✅ **COVERED (TEAMS-META-3)** — `hasMetadata:true` | DONE: TEAMS-META-2 resolvers (`teams`/`channels` + 2 NEW read helpers `teamsList`/`channelsList`) + TEAMS-META-3 (5 ActionMeta + 1 `new_channel_message` webhook TriggerMeta (team+channel pickers) + `services/discovery/providers/microsoft-teams.ts` + COVERED flip). **NO UI-scope schema fields** (teamId/channelId already real); **no destructive action** (message writes recoverable). `members` rejected; `chats`/`messages` deferred (chatId/messageId typeable). | — | done |
| ~~8~~ | ~~**airtable**~~ | 11 | 1 (webhook `record_changed`) | ✅ **COVERED (AIRTABLE-META-3)** — `hasMetadata:true` | DONE: AIRTABLE-META-2 resolvers (`bases`/`tables`/`fields`/`views`/`attachment_fields` + `basesList` helper) + AIRTABLE-META-3 (11 ActionMeta + 1 TriggerMeta + `services/discovery/providers/airtable.ts` + COVERED flip). `delete_record` = high/destructive/requiresConfirmation. `recordId` typed; field maps paste-JSON; `airtable:records` rejected. | — | done |
| ~~9~~ | ~~**trello**~~ | 8 | 6 | ✅ **COVERED (TRELLO-META-3)** — `hasMetadata:true` | DONE: TRELLO-META-2 resolvers (`boards`/`lists`/`cards`/`members`/`labels` + 5 read helpers) + TRELLO-META-3 (8 ActionMeta + 6 webhook TriggerMeta + 6 UI-scope `boardId` schema fields + `services/discovery/providers/trello.ts` + COVERED flip). NO destructive action (archive_card reversible; no deletes). `create_board` medium + explicit visibility w/ public warning. `checklists`/`check_items` rejected. | — | done |

Total pending: **0 runtime action handlers across 0 providers** (286 total − 286 covered = 0). _(67/9 → 56/8 after SHOPIFY-META-2 → 46/7 after EXCEL-META-3 → 35/6 after AIRTABLE-META-3 → 27/5 after TRELLO-META-3 → 20/4 after ONEDRIVE-META-3 → 15/3 after TEAMS-META-3 → 10/2 after GCAL-META-2 → 5/1 after GDRIVE-META-2 → **0/0 after OUTLOOK-CAL-META-2 — tracker closed.**)_

---

## 6. Standing clarifications

- **Runtime handlers are real and non-stubbed.** This track is purely about the builder-metadata facet; it does not reopen runtime/parity, which the parity closeouts correctly cover.
- **Users cannot use these 9 providers in the Builder until their metadata exists.** A connected Shopify/Excel/Airtable integration is non-actionable in the builder today (no selectable actions/triggers; "coming soon" chip).
- **Cross-effect with billing (no billing change in this track):** per `task-cost-billing-foundation-closeout.md`, a provider action is billable (1 task on success) **only when the discovery registry supplied its meta** (grounding). Today these 9 providers' actions are `unknown_node` (0 + warning) because they have no meta. Adding their metas makes them billable at the default 1-task category cost automatically — via grounding, not via any billing code edit.
- **No manifest dishonesty.** Manifests already declare `actions: true` truthfully (handlers ARE registered). `hasMetadata:false` is computed from the discovery registry, so the "coming soon" state is honest, not a hidden gap.

---

## 7. Closeout criteria for the 9-provider metadata track — ✅ MET

The track was complete when, for **all 9 providers** in the original launch-gap arc (shopify, microsoft-excel, google-calendar, microsoft-outlook-calendar, google-drive, microsoft-onedrive, microsoft-teams, airtable, trello):

- [x] every registered runtime action has an `ActionMeta` (1:1, enforced by `COVERED_PROVIDERS`);
- [x] every trigger that should ship has a `TriggerMeta` with a registered activation hook (or is explicitly deferred/rejected with rationale recorded in the provider's plan);
- [x] required options resolvers exist, or are explicitly deferred with rationale (hand-typed IDs acceptable);
- [x] `/api/providers` reports `hasMetadata: true` for the provider (no longer "coming soon");
- [x] the provider is in `COVERED_PROVIDERS`;
- [x] `discovery-meta-coverage` + `trigger-meta-activation-invariant` + `sensitive-output-coverage` pass;
- [x] per-provider targeted tests pass; **no runtime handler behavior changed** unless explicitly required and documented (OUTLOOK-CAL-META-2 ships a narrow additive Zod preprocess on create_event / update_event schemas — the Approach-A flat-time-fields shim — which is behavior-preserving for existing nested-input callers).

**This tracker is CLOSED as of OUTLOOK-CAL-META-2 (2026-05-25).** ⚠️ Closing the tracker does NOT make the provider foundation "launch-ready" — see §9 for the post-26/26 backlog that still owes work. **The post-26/26 completeness audit (PROVIDER-AUDIT-1) ran 2026-05-25 and identifies exactly ONE launch blocker:** Stripe `event_received` TriggerMeta is missing (runtime registered + full implementation shipped; no meta file → Builder cannot surface the trigger; AI cannot ground Stripe-failed-payment-style workflows). Full audit findings at [`provider-runtime-metadata-completeness-audit.md`](./providers/provider-runtime-metadata-completeness-audit.md).

---

## 8. Status snapshot

```text
RUNTIME:            26/26 providers, 286 handlers, real (non-stubbed), full suite green.
BUILDER METADATA:   26/26 providers covered (286/286 handlers). 0 providers / 0 handlers pending. 🎯
                    (Shopify → SHOPIFY-META-2; Microsoft Excel → EXCEL-META-3; Airtable → AIRTABLE-META-3;
                     Trello → TRELLO-META-3; Microsoft OneDrive → ONEDRIVE-META-3; Microsoft Teams →
                     TEAMS-META-3; Google Calendar → GCAL-META-2; Google Drive → GDRIVE-META-2;
                     Microsoft Outlook Calendar → OUTLOOK-CAL-META-2, 2026-05-25.)
POST-AUDIT:         PROVIDER-AUDIT-1 ran 2026-05-25 (provider-runtime-metadata-completeness-audit.md).
                    Confirmed: 286/286 actions covered (1:1); 59/60 runtime triggers covered. ONE GAP —
                    Stripe event_received TriggerMeta missing (runtime SHIPPED, meta absent).
STRIPE-TRIGGER:     STRIPE-TRIGGER-META-2 shipped 2026-05-25 (stripe-trigger-meta-plan.md §9). Stripe
                    event_received TriggerMeta + Stripe sub-registry refactor landed. 60/60 runtime
                    triggers now covered. /api/providers/stripe/triggers returns the trigger with 18
                    static event options (incl. payment_intent.payment_failed, charge.failed,
                    invoice.payment_failed). All 26 providers now use the per-provider sub-registry
                    pattern — _registry.ts dropped back under 400 lines.
LAUNCH STATUS:      🎯 PROVIDER FOUNDATION IS LAUNCH-READY by every criterion in audit §7.
NEXT ARC:           Post-launch backlog (audit §6 / tracker §9) — product-prioritized work. No
                    launch-blocking provider metadata gaps remain.
DO NOT CALL:        "all provider work done" — the §9 backlog (Stripe-trigger now done; remaining items
                    are resolvers / FileRef / Outlook meeting toggle / deferred trigger arcs for Discord/
                    Docs/OneNote/Monday/Dropbox/Facebook) still own their definition-of-done. DEFERRED ≠
                    DELETED. But none of them block launch.
```

---

## 9. Post-26/26 backlog (deferred ≠ deleted)

The launch-gap tracker closed at 26/26 on 2026-05-25 (OUTLOOK-CAL-META-2). The known follow-ups below are deliberately out of the closed tracker's scope but **still own their definition-of-done**. Subsequent post-launch work should pull from this list rather than treating the closed tracker as the finish line.

### Trigger metas still owed (action surfaces COVERED; triggers deferred)

| Provider | Trigger work | Tracking arc | Notes |
|---|---|---|---|
| ~~`stripe`~~ | ~~`event_received` TriggerMeta~~ | ✅ **STRIPE-TRIGGER-META-2 (shipped 2026-05-25)** | Closed. Sub-registry refactor at the same time — all 26 providers now use the same per-provider sub-registry pattern. |
| `discord` | trigger metas | DISCORD-5 | Actions COVERED, triggers deferred per D-DC1. |
| `google-docs` | trigger metas | GDOCS-5 | Actions COVERED, no triggers shipped (deliberate staged arc). |
| `microsoft-onenote` | polling trigger metas | ONENOTE-5 | Graph deprecated OneNote subscriptions May 2023; polling via shared Excel-style infra. |
| `monday` | 5 webhook triggers | MONDAY-7 | `new_item`, `column_changed`, `item_moved`, `new_subitem`, `new_update` via `create_webhook` lifecycle. |
| `dropbox` | `new_file` trigger | DROPBOX-5 | App-level webhook + per-account cursor reconciliation. |
| `facebook` | `new_post` + `new_comment` triggers | FACEBOOK-5 | App-level webhook + per-page `subscribed_apps`. |
| `google-analytics` | (REJECTED, not deferred) | — per D-GA3 | No clean push/webhook; polling fragile. Actions-only is the accepted final state — distinct from deferred. |

### Resolver follow-ups (optional, product-gated)

| Provider | Resolver / picker | Tracking arc |
|---|---|---|
| `shopify` | optional resolvers | SHOPIFY-META-3 |
| `microsoft-excel` | `columns` resolver | future |
| `google-calendar` | `calendars` resolver (scope-blocked — needs `calendarList` scope + forced reconnect) | GCAL-CALENDARS-RESOLVER |
| `google-drive` | `files` resolver (typeable/trigger-fed today) | GDRIVE-FILES-RESOLVER |
| `microsoft-teams` | `chats` / `messages` resolvers (chatId / messageId typeable / trigger-fed today) | future |

### Runtime arcs (not pure metadata)

| Provider | Runtime work | Tracking arc |
|---|---|---|
| `google-drive` | FileRef on upload/download/get | GDRIVE-FILEREF |
| `google-drive` | share action (wire `permissionsCreate`) | GDRIVE-SHARE |
| `google-drive` | export action (wire `filesExport`) | GDRIVE-EXPORT |
| `microsoft-onedrive` | FileRef on upload/download | ONEDRIVE-FILEREF |
| `microsoft-outlook-calendar` | `isOnlineMeeting` write toggle on create_event | OUTLOOK-CAL-MEETINGS |

### Definition of "provider foundation launch-ready"

Closing this launch-gap tracker is a **milestone**, not a finish line. "Provider foundation launch-ready" requires:

1. The full runtime handler registry has been walked and each handler has a matching meta (`discovery-meta-coverage` already enforces this for COVERED providers — 26/26 today).
2. Every trigger that *should* ship has a TriggerMeta with a registered activation hook (NOT enforced by `discovery-meta-coverage` — see the Stripe / Discord / Docs / OneNote / Monday / Dropbox / Facebook gaps above).
3. Every required options resolver exists or has a documented deferral rationale (the deferral table above).
4. The FileRef / share / export / online-meeting runtime arcs have shipped (or are explicitly out of launch scope by product decision).

When all four hold, the provider foundation may be called launch-ready. Until then, **26/26 covered ≠ done**.
