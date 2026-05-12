# Parity audit — Gmail

**Status:** **ACCEPTED 2026-05-12.** Implementation cleared to begin at Gmail 2.1.
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`
**V2 baseline:** [`integrations/gmail/`](../../integrations/gmail/) (slice 2a–2e)
**Phase 1 surface shipped:** 1 action (`sendEmail`, minimal field set), 1 polling trigger (`new_email`, historyId cursor + client-side filters)
**Master plan:** [`docs/slices/phase-2-plan.md`](phase-2-plan.md). Audit follows the 14-section template defined there.

## Accepted decisions (2026-05-12)

Recorded verbatim from Marcus's acceptance. These resolve every NPD / open-question row in §6, §7, and §14:

1. **`advancedSearch`:** SKIP — FOLD into `searchEmails` as a query/filter mode (per §7 recommendation).
2. **`deleteEmail`:** Port with `requireExplicitField` on a `deleteMode: "trash" | "permanent"` enum. **No silent default.** Two-separate-actions split is acceptable alternative if it falls out cleaner during implementation.
3. **`newStarredEmail` trigger:** **DEFER.** Do not port in Gmail 2.1 or 2.2. When revisited later, drop the V1 hidden 2-day heuristic — make the window configurable or skip the trigger entirely.
4. **`new_email` AI content filter:** **DEFER to Phase 5 / AI-agent work.** Do not restore during Gmail parity.
5. **sendEmail dropped fields:** Drop `scheduleSend`, `trackOpens`, `trackClicks` at port time. No silent-no-op fields ship into V2 (G-R5 closed).
6. **Gmail scope expansion (P-G1):** Add `gmail.modify` + `gmail.compose` when Gmail 2.1 begins. Manifest is the single source of truth.
7. **P-G2 `parseRecipients`:** Verify the helper already exists in V2. Reuse if present; port from V1 if missing.
8. **Sequencing:** Start Gmail 2.1 immediately. No wait on Slack parity slices.

**Recommendation up front.** V1 registers **15 Gmail actions** (+ 2 implemented-but-unregistered orphans) and **4 trigger schemas**; V2 ships **1 action** (partial — missing attachments + 8 advanced send fields) and **1 polling trigger** (`new_email`). Audit recommends **9 actions PORT now** (createDraft / createDraftReply / replyToEmail / addLabel / removeLabel / createLabel / archiveEmail / deleteEmail / searchEmails), **3 actions PORT–EXPAND existing handler** (sendEmail attachments + advanced fields, markAsRead/markAsUnread as new handlers), **2 actions PORT after P-S3** (getAttachment / downloadAttachment), **1 action SKIP** (advancedSearch — fold into searchEmails query-builder), **2 orphans SKIP** (fetchMessage / updateSignature — never registered in V1). Triggers: **2 PORT** (newAttachment, newLabeledEmail) as additional polling handlers reusing the historyId cursor, **1 NEEDS PRODUCT DECISION** (newStarredEmail — V1's "2-day window" UX is a heuristic, not provider-native semantics), **1 FOLLOW-UP** (restore AI content filter on `new_email` — deferred per Slice 2e). Three required platform gaps: **P-S3** (file output contract — gates 2 actions + 1 trigger payload), **P-G1** (Gmail-specific scope expansion: `gmail.modify` / `gmail.labels` / `gmail.compose` — current manifest is `readonly + send` only), **P-G2** (multi-recipient parsing for V2 sendEmail's `to`/`cc`/`bcc` — V1 used `parseRecipients` per Q7; V2 currently passes raw strings verbatim into the RFC 5322 header). Recommended split: **3 parity slices** (compose + drafts / labels + lifecycle / triggers + attachments) totaling ~12 commits across the slices. Gmail is the highest-leverage parity port after Slack and the first to require attachment-flow design.

---

## 1. V1 source paths audited

### Manifest / node definitions

- [`lib/workflows/nodes/providers/gmail/index.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/gmail/index.ts) (174 lines) — 15 action exports + 4 trigger exports in `gmailNodes` array. All schemas imported individually; no `comingSoon` flags (R6 clean).
- [`lib/workflows/nodes/providers/gmail/actions/*.schema.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/gmail/actions/) — 15 schema files (one per registered action).
- [`lib/workflows/nodes/providers/gmail/triggers/*.schema.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/gmail/triggers/) — 4 schema files (`newEmail`, `newAttachment`, `newLabeledEmail`, `newStarredEmail`).

### Action handlers

- [`lib/workflows/actions/gmail/`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/gmail/) — 23 .ts files: 15 registered handlers + 4 internal helpers (`fetchTriggerEmail`, `fetchEmailsWithRateLimiting`, `resolveEmailMetaVariables`, `applyLabels`) + 2 orphan handlers (`fetchMessage`, `updateSignature` — implemented but NOT in the registry per `lib/workflows/actions/registry.ts:699-728`) + `index.ts` (5-line barrel exporting only 5 of the 15 handlers — divergent from the registry) + `schema.ts` (170-line ad-hoc field schema, looks unused at runtime).
- Spot-check sizes: **`sendEmail.ts` (585 lines) is the largest** — combines RFC 5322 build + attachment dispatch from 5 source types (file / url / node / uploadedFiles legacy / Google Drive cross-provider import) + Q3 refresh-and-retry + Q4 session-side-effects bracketing + Q7 parseRecipients + post-send labels.modify; `downloadAttachment.ts` (413 lines) — multi-storage-service dispatcher (Drive/OneDrive/Dropbox); `replyToEmail.ts` (374 lines); `advancedSearch.ts` (354 lines); `searchEmails.ts` (345 lines); `applyLabels.ts` (265 lines) — auxiliary helper for `addLabel` registry entry; `createDraftReply.ts` (200 lines); `createDraft.ts` (162 lines).
- **R1 finding:** V1 Gmail handlers are **per-action split** (not a monolith). `sendEmail.ts` itself is 585 lines but isn't a registry monolith.

### Action registry wiring (single source of truth)

- [`lib/workflows/actions/registry.ts:699-728`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/registry.ts#L699) — registers 15 Gmail action handlers + 1 trigger-data-fetch handler (`gmail_trigger_new_email` → `fetchGmailTriggerEmail`, internal use for test-mode email hydration).
- Registry uses **mixed signatures**: `sendGmailEmail` is the new params-object shape (`{ config, userId, input, meta }`); all 14 others are legacy positional `(config, userId, input)`. Comment on line 699 says "mixed signatures (sendGmailEmail already uses params)" — the rest is technical debt deferred during incremental Q-contract rollout.

### OAuth + lifecycle

- [`lib/integrations/gmail.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/gmail.ts) — `GmailService` class + helper functions for OAuth + token decrypt. Generic V1 callback at [`app/api/integrations/[id]/callback/route.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/integrations/[id]/callback/route.ts) routes Gmail to it via the dispatch switch. The scope-expand line for OAuth-URL generation lives at [`app/api/integrations/auth/generate-url/route.ts:391-392`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/integrations/auth/generate-url/route.ts#L391) and adds: `gmail.modify`, `gmail.compose`, `gmail.settings.basic`, `contacts.readonly`.
- Per-workflow Gmail trigger lifecycle was migrated late in V1's life — see [`lib/webhooks/gmail-watch-setup.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/webhooks/gmail-watch-setup.ts) (313 lines, **header tagged `⚠️ DEPRECATED FILE (2025-10-03)`**) — replaced by `lib/triggers/providers/GoogleApisTriggerLifecycle.ts` (per the deprecation header). V1 used Pub/Sub push notifications via `users.watch()`; V2 polls instead.

### Webhook receiver + verification + processor (V1 push-notification path)

- [`lib/webhooks/gmail-processor.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/webhooks/gmail-processor.ts) — 1140+ lines (`grep -c gmail` returns 0 in the generic normalizer.ts/verification.ts because Gmail has its own dedicated processor). Six event types dispatched: `gmail_new_email` / `message.new`, `message.modified`, `message.deleted`, `label.added`, `label.removed`, `attachment.added`. Includes Anthropic-SDK AI content filter (lines 1111-1126 referenced from V2 filters.ts comments).
- [`lib/webhooks/gmail-verification.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/webhooks/gmail-verification.ts) — Pub/Sub JWT verification.
- [`app/api/webhooks/gmail/route.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/gmail/route.ts) — Gmail-specific webhook endpoint (NOT the generic `[provider]` receiver).

### Scope definitions (R3 — divergent, 5+ locations)

V1 has Gmail scope lists in **5+ different files** with no shared subset:

| File | Scopes |
|---|---|
| [`lib/integrations/availableIntegrations.ts:33-43`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/availableIntegrations.ts#L33) | 4 (`gmail.send`, `gmail.modify`, `gmail.compose`, `gmail.settings.basic`) |
| [`lib/integrations/scope-validator.ts:28-41`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/scope-validator.ts#L28) | 4 split required/optional (required: `gmail.modify`, `gmail.labels`; optional: `gmail.compose`, `gmail.send`) |
| [`lib/integrations/scope-validator.ts:371-374`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/scope-validator.ts#L371) | scope-to-operation map (read→`gmail.readonly`; write/delete→`gmail.modify`) |
| [`app/api/integrations/auth/generate-url/route.ts:391-392`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/integrations/auth/generate-url/route.ts#L391) | mega-list: `gmail.modify`, `gmail.compose`, `gmail.settings.basic`, `contacts.readonly` (no `gmail.send`, no `gmail.labels`) |
| `lib/integrations/integrationScopes.ts` | separate Gmail entry (not enumerated here; structurally similar to V1 Slack R3 case) |

V2 manifest collapses these to one source of truth (`gmail.readonly` + `gmail.send`) — but the V2 list does NOT include `gmail.modify` / `gmail.labels` / `gmail.compose`, so label / draft / settings ports require scope expansion (see P-G1 in §10).

### Tests

- [`__tests__/nodes/gmail-send-email.test.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/__tests__/nodes/gmail-send-email.test.ts) — **the only Gmail-dedicated unit test** in V1. Single file covers send-email handler contracts. Test density signal: low — same shape as Slack (high-traffic provider with one historical test file).

### Walkthroughs / docs density (proxy signal)

- [`learning/walkthroughs/GmailLabelManagement.md`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/learning/walkthroughs/GmailLabelManagement.md)
- [`learning/walkthroughs/EmailAutocomplete.md`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/learning/walkthroughs/EmailAutocomplete.md) — Gmail recent-senders autocomplete
- [`learning/walkthroughs/WebhookSystem.md`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/learning/walkthroughs/WebhookSystem.md) — references Gmail Pub/Sub
- 5 other walkthroughs mention Gmail in passing
- **Doc density signal:** medium. Gmail had two dedicated walkthroughs (labels + autocomplete) plus cross-referenced in the webhook system overview.

---

## 2. V1 actions inventory

Source: `gmailNodes` export array in [`lib/workflows/nodes/providers/gmail/index.ts:125-148`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/gmail/index.ts#L125) + registry truth at [`lib/workflows/actions/registry.ts:699-728`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/registry.ts#L699). Numbered in registry order.

| # | Registry key | Handler | Status | Notes |
|---|---|---|---|---|
| 1 | `gmail_action_send_email` | `sendGmailEmail` | live | Q3 + Q4 + Q7 + Q8d ported; 585 lines; attachments from 5 source types; post-send labels.modify; auto-HTML body detection |
| 2 | `gmail_action_add_label` | `applyGmailLabels` | live | Auxiliary helper backing `addLabel` — combines add/remove flow; `createIfNotExists` flag; thread vs message scope |
| 3 | `gmail_action_search_email` | `searchGmailEmails` | live | 345 lines; uses `fetchEmailsWithRateLimiting` helper |
| 4 | `gmail_action_advanced_search` | `advancedGmailSearch` | live | 354 lines; query-builder mode + raw-query mode; date/size/attachment filters |
| 5 | `gmail_action_mark_as_read` | `markGmailAsRead` | live | 233 lines; `users.messages.modify` removing `UNREAD` label |
| 6 | `gmail_action_mark_as_unread` | `markGmailAsUnread` | live | 233 lines; `users.messages.modify` adding `UNREAD` label |
| 7 | `gmail_action_archive_email` | `archiveGmailEmail` | live | `users.messages.modify` removing `INBOX` label |
| 8 | `gmail_action_delete_email` | `deleteGmailEmail` | live | `users.messages.delete` (permanent) OR move-to-trash via `users.messages.trash`; option-switched in schema |
| 9 | `gmail_action_remove_label` | `removeGmailLabel` | live | `users.messages.modify` removing label ids |
| 10 | `gmail_action_create_draft` | `createGmailDraft` | live | 162 lines; `users.drafts.create` with multipart MIME |
| 11 | `gmail_action_create_draft_reply` | `createGmailDraftReply` | live | 200 lines; references original message thread |
| 12 | `gmail_action_create_label` | `createGmailLabel` | live | `users.labels.create` with color settings |
| 13 | `gmail_action_reply_to_email` | `replyToGmailEmail` | live | 374 lines; reply-all support; attachment flow same as send |
| 14 | `gmail_action_get_attachment` | `getGmailAttachment` | live | 174 lines; metadata + optional content download |
| 15 | `gmail_action_download_attachment` | `downloadGmailAttachment` | live | 413 lines; routes to Drive/OneDrive/Dropbox storage |
| — | (n/a — dead handler) | `fetchGmailMessage` | **orphan** | [`fetchMessage.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/gmail/fetchMessage.ts) 243 lines, not in registry, not in `gmailNodes` |
| — | (n/a — dead handler) | `updateGmailSignature` | **orphan** | [`updateSignature.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/gmail/updateSignature.ts) 96 lines, not in registry, not in `gmailNodes` |

**Total V1 Gmail actions: 15 live + 2 orphans.**

### Out-of-scope V1 helpers (internal — not registry surface)

- `fetchTriggerEmail.ts` (219 lines) — used by `gmail_trigger_new_email` registry key to hydrate real email data for test-mode runs. Not a user-facing action.
- `fetchEmailsWithRateLimiting.ts` (88 lines) — internal helper used by `searchEmails` / `advancedSearch`.
- `resolveEmailMetaVariables.ts` (240 lines) — meta-variable resolver (`{{recipient_name}}` etc.) called by `sendEmail`.
- `applyLabels.ts` (265 lines) — internal helper backing the `addLabel` registry entry.

---

## 3. V1 triggers inventory

Source: trigger schemas + V1 trigger lifecycle (`lib/triggers/providers/GoogleApisTriggerLifecycle.ts` per the deprecated `gmail-watch-setup.ts` header). Trigger model: **Pub/Sub push notifications via `users.watch()`** for V1 (per-workflow lifecycle through `trigger_resources`). V2 polls instead.

| # | Trigger schema type | V1 model | Filter / config | Lifecycle notes |
|---|---|---|---|---|
| 1 | `gmail_trigger_new_email` | Pub/Sub push | from / subject (exact toggle) / hasAttachment / labelIds (multi) / AI content filter + confidence + fail-closed + embedding-prefilter | `users.watch()` per integration with `labelIds` filter at provider boundary |
| 2 | `gmail_trigger_new_attachment` | Pub/Sub push | fileType (preset 9 categories) / from / minSize MB | Same Pub/Sub channel; client-side mimeType + size filter post-history-walk |
| 3 | `gmail_trigger_new_labeled_email` | Pub/Sub push | labelId (single, required) / from / includeReplies (default true) | Detects via Gmail history `labelsAdded` records; includeReplies expands to all-messages-in-thread |
| 4 | `gmail_trigger_new_starred_email` | Pub/Sub push | from / subject (substring) | V1 description: "Triggers when you star an email **(within 2 days of receiving it)**" — heuristic enforced at post-history-walk filter time |

**Total V1 Gmail triggers: 4 schemas.**

V1 normalizer-side artifact at `gmail-processor.ts` also emits canonical event types for `label.removed`, `attachment.added`, `message.modified`, `message.deleted` — but **no trigger schemas exist** for those. Same dead-emit pattern as Slack's `slack_trigger_message_deleted` (R8 / cited as S-R8 in parity-slack.md).

---

## 4. V2 current surface

Source: [`integrations/gmail/`](c:/Users/marcu/source/repos/ChainReactV2/integrations/gmail/).

### Actions (1, partial)

| # | V2 Action | File | Notes |
|---|---|---|---|
| 1 | `send_email` | [`actions/sendEmail.ts`](c:/Users/marcu/source/repos/ChainReactV2/integrations/gmail/actions/sendEmail.ts) (61 lines) + [`sendEmail.schema.ts`](c:/Users/marcu/source/repos/ChainReactV2/integrations/gmail/actions/sendEmail.schema.ts) (38 lines) | Bot-account; `to` / `subject` / `textBody` / `htmlBody` / `cc` / `bcc` only. **NO attachments**, **NO replyTo**, **NO priority**, **NO signature**, **NO scheduleSend**, **NO trackOpens/trackClicks**, **NO labels-on-send**, **NO from-override**, **NO meta-variable resolution** (`{{recipient_name}}`). Multi-recipient strings are passed through verbatim into RFC 5322 `To:` header (no Q7 normalization) |

### Triggers (1 polling — historyId cursor)

| # | V2 Trigger | Files | Notes |
|---|---|---|---|
| 1 | `new_email` (polling) | [`triggers/newEmail/`](c:/Users/marcu/source/repos/ChainReactV2/integrations/gmail/triggers/newEmail/) (7 files, ~470 lines total) | Activation hook (`activate.ts`) fetches initial historyId snapshot; poll handler walks `users.history.list` from cursor, dedups via `webhook_event_dedup`, applies client-side filters (`filters.ts`), hydrates each message via `users.messages.get?format=metadata`, builds canonical `TriggerEvent`, calls `enqueueRun`. **`from` is `string[]`** (V1's 4-shape input was normalized at port time per [`schema.ts:14`](c:/Users/marcu/source/repos/ChainReactV2/integrations/gmail/triggers/newEmail/schema.ts#L14)). **AI content filter intentionally omitted** per slice 2e plan ([`schema.ts:8`](c:/Users/marcu/source/repos/ChainReactV2/integrations/gmail/triggers/newEmail/schema.ts#L8)) |

### OAuth + Pub/Sub status

- [`oauth.ts`](c:/Users/marcu/source/repos/ChainReactV2/integrations/gmail/oauth.ts) (134 lines) — PKCE S256 via shared `_shared/google/oauth.ts`, `access_type=offline + prompt=consent`, account lookup via `users.getProfile`, revoke stubbed (matches Slack pattern). **First V2 consumer of refresh-token rotation.**
- No Gmail Pub/Sub / `users.watch()` wiring in V2 — by design. The slice 2 plan substituted polling for push.
- No webhook receiver / verifier for Gmail in V2 (manifest declares `webhookTrigger: false`).

### Scopes (manifest)

```ts
required: ["https://www.googleapis.com/auth/gmail.readonly",
           "https://www.googleapis.com/auth/gmail.send"]
optional: []
```

Narrow baseline — covers `users.getProfile`, `users.history.list`, `users.messages.get` (readonly) + `users.messages.send`. **Excludes** `gmail.modify` / `gmail.labels` / `gmail.compose` / `gmail.settings.basic` — every action that mutates labels, archives/deletes mail, manages drafts, or edits signatures needs additional scope (P-G1, §10).

### Tests (13)

[`tests/unit/integrations/gmail/`](c:/Users/marcu/source/repos/ChainReactV2/tests/unit/integrations/gmail/) — 13 files: manifest / oauth / api/{usersGetProfile,usersHistoryList,usersMessagesGet,usersMessagesSend} / utils/rfc5322 / actions/sendEmail{,.schema} / triggers/newEmail/{dedup,filters,historyState,messageHydration}. Test density: **far higher than V1's single test file** despite smaller surface, consistent with V2 conventions.

---

## 5. Missing actions

V2 ships 1 of V1's 15 live actions (and that one is partial — see §4 caveats). Missing 14 + 1 expand-existing. Grouped by domain (port-batch boundaries):

### Compose + drafts (4)

1. `createDraft` — `users.drafts.create` with multipart MIME. Schema fields: `to` / `subject` / `body` / `cc` / `bcc` / `attachments`. Requires `gmail.compose` scope.
2. `createDraftReply` — `users.drafts.create` referencing existing thread (sets `threadId` + `In-Reply-To` + `References` headers). Requires `gmail.compose`.
3. `replyToEmail` — `users.messages.send` with `threadId` + thread headers; `replyAll` flag; attachment flow shared with `sendEmail`. Requires `gmail.send`.
4. **(expand existing)** `sendEmail` attachments + advanced fields — V2 handler needs: `attachments[]` field, `replyTo`, `priority` (defaults removed per Q11), `signature`, `labels-on-send` (post-send `users.messages.modify`), and (decision needed) `scheduleSend` / `trackOpens` / `trackClicks`. From the V1 source: `scheduleSend` silently no-ops (V1 logs a warning and sends immediately because Gmail API has no native scheduling). `trackOpens` requires a tracking-pixel endpoint V1 never finished — V1 logs "tracking endpoint is not configured — skipping". **Both are Q11 silent-default violations** and should be either dropped at port time OR ported as throw-on-truthy explicit-failure fields.

### Labels (4)

5. `addLabel` (V1's `gmail_action_add_label`, handler `applyGmailLabels`) — `users.messages.modify` adding label ids; supports `createIfNotExists` flag + apply-to-thread vs message scope.
6. `removeLabel` — `users.messages.modify` removing label ids.
7. `createLabel` — `users.labels.create` with `labelListVisibility` / `messageListVisibility` / optional color (foreground+background pair).
8. (n/a — no V1 `deleteLabel` action exists; out of scope for parity)

### Email lifecycle (4)

9. `markAsRead` — `users.messages.modify` removing `UNREAD` label.
10. `markAsUnread` — `users.messages.modify` adding `UNREAD` label.
11. `archiveEmail` — `users.messages.modify` removing `INBOX` label.
12. `deleteEmail` — schema-switched between `users.messages.delete` (permanent) and `users.messages.trash` (move to trash). Q11-sensitive default decision required (see §8 G-R1).

### Search / read (2)

13. `searchEmails` — `users.messages.list` + per-message hydration via `users.messages.get` with rate-limiting helper. Returns array of metadata.
14. `advancedSearch` — query-builder mode (filter fields → Gmail q-syntax) OR raw-query mode. V1 has 354 lines of field-to-q-syntax mapping (`from`, `to`, `subject[]` OR-joined, `hasAttachment` yes/no, `dateAfter`/`dateBefore`, `largerThan`/`smallerThan` size, `labelIds`, `hasWords`, `doesntHaveWords`, custom `q`).

### Attachments (2 — gated by P-S3)

15. `getAttachment` — `users.messages.attachments.get`; returns metadata + optional inline base64 content; selection modes (all / first / by id / by filename / by pattern).
16. `downloadAttachment` — same fetch but writes to a target storage service (Drive / OneDrive / Dropbox per V1; in V2 should target the P-S3 file-output contract, dropping the cross-provider dispatch).

**Total missing/expand: 14 missing + 1 expand-existing.**

### Orphans NOT to port

- `fetchMessage.ts` — 243-line handler implemented but never registered in V1. R5 (dead handler graph). Skip.
- `updateSignature.ts` — 96-line handler implemented but never registered. R5. Skip. Note: this would have needed `gmail.settings.basic` scope which neither V1's main scope list nor V2's manifest carries — confirms it was never wired through.

---

## 6. Missing triggers

V2 ships 1 of V1's 4 triggers. Missing 3, plus a deferred follow-up on the one V2 has.

| # | V1 Trigger | Polling model needed | Per-trigger filter | Notes |
|---|---|---|---|---|
| 1 | `newAttachment` | Same historyId cursor as `new_email`; extra hydration step (need `format=full` or follow-up `attachments.get` to get filenames + sizes) | `fileType` (preset 9 categories) / `from` / `minSize` MB | V2's `new_email` poll uses `format=metadata` which omits `payload.parts` — attachment-aware trigger requires either `format=full` per message OR a two-call pattern (metadata first, parts pull only when attachments suspected via top-level `multipart/mixed`). Plus the trigger event payload must carry attachment metadata — gates on P-S3 if the trigger consumer needs the file content downstream, but the trigger itself can ship without P-S3 carrying just metadata + attachmentId references. |
| 2 | `newLabeledEmail` | Same historyId cursor; consume `labelsAdded` records from `users.history.list` (already emitted alongside `messagesAdded` — V2's `extractMessageIds` flattens both into a single id list, which collapses the per-event distinction needed for "label was just added") | `labelId` (single, required) / `from` / `includeReplies` (default true) | V2 poll currently treats `messageAdded` and `labelAdded` identically — it can't distinguish "new email" from "label added to existing email". Per-trigger requires extracting the label-add event separately and matching against the configured `labelId`. **Requires changes to `extractMessageIds` + history-walk to keep event-type tags through the pipeline.** |
| 3 | `newStarredEmail` | Same historyId cursor; consume `labelsAdded` records where `labelIds` contains `STARRED` | `from` / `subject` (substring) | **DEFERRED (decision 3).** Not in Gmail 2.1 / 2.2. When revisited: drop V1's hidden 2-day heuristic — either make the window a configurable field or skip the trigger entirely. |
| — | (follow-up) | `new_email` AI content filter | (none — restore V1's `aiContentFilter` + `aiFilterConfidence` + `aiFailClosed` + `aiUseEmbeddingPrefilter`) | **DEFERRED to Phase 5 / AI-agent work (decision 4).** Not part of Gmail parity. |

**Plus dead-code emit to NOT port:** V1's `gmail-processor.ts` emits canonical event types for `label.removed`, `attachment.added`, `message.modified`, `message.deleted` — no schemas in V1 for those. Skip.

---

## 7. Port / skip / defer table

Decisions per item from §5 + §6. Reasoning cites master-plan rot IDs (R1..R14) and Gmail-specific findings (G-R1..G-R6 in §8) where applicable.

### Actions

| V1 item | Type | Recommendation | Reasoning |
|---|---|---|---|
| `createDraft` | action | **port** | Standard `gmail.compose`-scope action; multipart MIME builder shared with `sendEmail`. Q11: V1 silently falls back subject to `'(No Subject)'` — drop the fallback at port time and treat empty subject as explicit-empty (allowed). |
| `createDraftReply` | action | **port** | `gmail.compose` scope; reuses thread headers from a `messageId` lookup. |
| `replyToEmail` | action | **port** | Core lifecycle; attachment flow shares whatever sendEmail ships with (i.e. gated on the attachment design — ports in batch 1 without attachments, attachments added in batch 3 alongside getAttachment / downloadAttachment). |
| `sendEmail` (expand) | action | **port–redesign** | Existing V2 handler expands to add: `attachments[]` (P-S3 gated), `replyTo`, `priority` (default-removed per Q11), `signature`, `labels[]`-on-send (post-send modify, scope-gated on `gmail.modify`). **Drop `scheduleSend` / `trackOpens` / `trackClicks`** — Q11 violations: V1 silently no-ops both. Also add Q7 multi-recipient parsing via `parseRecipients` (P-G2) for `to` / `cc` / `bcc`. Also add the meta-variable resolver (`{{recipient_name}}` etc.) — V1's [`resolveEmailMetaVariables.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/gmail/resolveEmailMetaVariables.ts) ports as a V2 utility. |
| `addLabel` | action | **port** | `users.messages.modify` add-only path; **drop V1's combined add+remove flow** — split into `addLabel` and `removeLabel`. Drop `createIfNotExists` — make label-creation explicit via `createLabel`. Apply-to-thread vs message becomes an enum field with no silent default (Q11). |
| `removeLabel` | action | **port** | Pairs with `addLabel`. |
| `createLabel` | action | **port** | Requires `gmail.labels` scope (or `gmail.modify`). Color settings ported as-is. |
| `markAsRead` | action | **port** | `users.messages.modify` removing `UNREAD`. Bot-account scope is fine (`gmail.modify`). |
| `markAsUnread` | action | **port** | Pairs with `markAsRead`. |
| `archiveEmail` | action | **port** | `users.messages.modify` removing `INBOX`. |
| `deleteEmail` | action | **port — `requireExplicitField` (decision 2)** | Port with a required `deleteMode: "trash" \| "permanent"` enum routed through `requireExplicitField` per Q11. No silent default. Two-separate-actions split (`trashEmail` + `permanentlyDeleteEmail`) is an acceptable alternative if it falls out cleaner at implementation time. |
| `searchEmails` | action | **port** | `users.messages.list` + per-message hydration; lift V1's rate-limiting helper as a V2 utility. |
| `advancedSearch` | action | **skip — fold into searchEmails** | V1's `advancedSearch` is **a query-builder UI overlay** on top of the same `users.messages.list` endpoint. The 354-line handler does field-to-q-syntax mapping in TypeScript; this belongs in the V2 schema (Zod `transform` or a small helper in `searchEmails`) — not as a separate action. Fold the query-builder fields into `searchEmails`'s schema with a `searchMode: "filters" | "query"` discriminator. **Saves one action surface; same provider call.** |
| `getAttachment` | action | **port (gated by P-S3)** | Returns attachment metadata + optional inline base64 content. The "optional inline content" path needs the V2 file-output contract — `saveToVariable: true` produces an `output.file` carrying the attachment. Port lands when P-S3 is consumable; metadata-only port can ship first. |
| `downloadAttachment` | action | **port–redesign (gated by P-S3)** | V1's "route to Drive / OneDrive / Dropbox storage" is a cross-provider write step that doesn't belong in a single-provider action handler. **Drop the storage-service field at port time.** V2 version: produces a P-S3 `file` output that downstream actions (Drive Upload, S3 Upload, etc.) consume. Same redesign rationale as parity-slack.md S-R6 (drop V1's Supabase round-trip in `uploadFile`). |
| `fetchMessage` | orphan | **skip** | R5 — orphan handler in V1 (implemented, not registered). If "get email by id" is needed, build V2-native using the existing `usersMessagesGet` API wrapper. |
| `updateSignature` | orphan | **skip** | R5 — orphan handler. Needs `gmail.settings.basic` scope which neither V1's main scope list nor V2's manifest carries — confirms the feature was never end-to-end. |

**Action totals: 10 PORT (incl. deleteEmail w/ `requireExplicitField`), 1 PORT–EXPAND (sendEmail), 1 SKIP–FOLD (advancedSearch → searchEmails query mode), 2 PORT (gated by P-S3), 2 SKIP (orphans).**

### Triggers

| V1 item | Type | Recommendation | Reasoning |
|---|---|---|---|
| `newAttachment` | trigger | **port (metadata only first; payload-with-content gated by P-S3)** | Reuses historyId cursor + dedup + filters infra from `new_email`. Adds a `mimeType + size` heuristic step; the attachment array in the trigger payload carries `{attachmentId, filename, mimeType, size}` references. Downstream actions use `getAttachment` to actually pull bytes. Independent of P-S3 for the trigger itself. |
| `newLabeledEmail` | trigger | **port** | Requires extending V2's `extractMessageIds` to keep `labelsAdded` events distinct from `messagesAdded` (currently flattened together). Each `labelsAdded` record from `users.history.list` already carries the `labelIds` array — match against the configured `labelId`. **No new platform gap** — just a localized poll-handler change. |
| `newStarredEmail` | trigger | **defer (decision 3)** | Not in Gmail 2.1 / 2.2. When revisited: drop V1's hidden 2-day heuristic — either make the window configurable or skip the trigger. |
| `new_email` AI filter | follow-up | **defer to Phase 5 (decision 4)** | Not part of Gmail parity. Restoration owned by Phase 5 / AI-agent work. |

**Trigger totals: 2 PORT (newAttachment, newLabeledEmail), 1 DEFER (newStarredEmail — decision 3), 1 DEFER to Phase 5 (new_email AI filter — decision 4).**

### Summary counts (per master plan §1)

- **Port:** 10 actions + 2 triggers = **12**
- **Port — expand existing:** 1 action (`sendEmail`)
- **Port — gated by P-S3:** 2 actions (`getAttachment`, `downloadAttachment`)
- **Port — redesign:** 1 action (`downloadAttachment` — drop multi-storage dispatch)
- **Skip — fold:** 1 action (`advancedSearch` → `searchEmails` query mode)
- **Skip — orphan:** 2 actions (`fetchMessage`, `updateSignature`)
- **Defer:** 1 trigger (`newStarredEmail` — decision 3) + 1 trigger feature (`new_email` AI content filter — decision 4, Phase 5).

---

## 8. V1 rot / bugs / dead code inventory

Provider-specific rot beyond the master-plan §5 catalog. Each row tagged with the master-plan rot ID where the pattern matches.

| ID | Finding | V1 location | V2 mitigation |
|---|---|---|---|
| **G-R1** (cites R5) | Two orphan handlers (`fetchMessage`, `updateSignature`) exist in `lib/workflows/actions/gmail/` but neither is in `registry.ts` AND neither is in `gmailNodes`. `index.ts` exports a 3rd subset (5 handlers) divergent from the 15 registered. **Three different "sources of truth"** for the Gmail handler set (handlers/, registry.ts, gmailNodes, actions/gmail/index.ts barrel). | `lib/workflows/actions/gmail/{fetchMessage,updateSignature,index}.ts` | V2 doesn't carry orphans; manifest's `actions: true` flag is honest-state per V2 rules. |
| **G-R2** (cites R3) | **5+ divergent Gmail scope lists** (see §1 "Scope definitions" table). `availableIntegrations.ts` requests `gmail.send`/`gmail.modify`/`gmail.compose`/`gmail.settings.basic`; `scope-validator.ts` requires `gmail.modify`/`gmail.labels`; `generate-url/route.ts` (production OAuth URL) actually adds `gmail.modify`/`gmail.compose`/`gmail.settings.basic`/`contacts.readonly` BUT NOT `gmail.send` (which is added separately upstream of line 391). Result: live OAuth grants depend on which scope list got loaded into the URL builder; not deterministic from a single read of the codebase. | `lib/integrations/availableIntegrations.ts:33`; `lib/integrations/scope-validator.ts:28,371`; `app/api/integrations/auth/generate-url/route.ts:391` | V2 manifest is the sole source; current scope set is `readonly + send`. Expanding to support label / draft / settings ports = single manifest edit (P-G1). |
| **G-R3** (cites R8) | V1's Gmail webhook receiver at [`app/api/webhooks/gmail/route.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/gmail/route.ts) and Pub/Sub JWT verifier at [`lib/webhooks/gmail-verification.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/webhooks/gmail-verification.ts) — verify-or-bypass status unaudited in this pass. Same shape risk as Slack's R8. | `lib/webhooks/gmail-verification.ts` | V2 polling model **fully sidesteps the entire webhook verification surface for Gmail**. No regression possible because there is no V2 verifier. |
| **G-R4** (cites R2) | `gmail-watch-setup.ts` header tagged `⚠️ DEPRECATED FILE (2025-10-03)` — V1 ran with two concurrent Gmail trigger registration paths (legacy `gmail-watch-setup.ts` writing `google_watch_subscriptions` + new `GoogleApisTriggerLifecycle.ts` writing `trigger_resources`). Per the header: "Will be removed after all existing subscriptions migrated." | `lib/webhooks/gmail-watch-setup.ts` | V2 has one trigger lifecycle (per-workflow polling registered at module load via `integrations/_registry.ts:28`). No second source. |
| **G-R5** (cites R11 + R8) | V1 `sendEmail.ts:455-457` accepts a `scheduleSend` field, then **silently sends immediately** with `logger.warn(...)` — the Gmail API has no native scheduling, but the user sees a "schedule field accepted" experience. Same shape: `trackOpens` (line 167-170) and `trackClicks` accept config that's silently dropped. Comment at line 167: "tracking endpoint requires a dedicated tracking endpoint — not yet available". | `lib/workflows/actions/gmail/sendEmail.ts:167-170,455-457` | V2 port-expand should DROP these fields. Q11 rule: no hidden no-op defaults. If scheduling is desired later, port `users.drafts.create` + a separate "publish draft on schedule" workflow. |
| **G-R6** | `sendEmail.ts:101-103` auto-detects HTML based on body string content (`includes('<div')` etc.). Q11-adjacent — silent content-type switch driven by ad-hoc string matching. **V2 already does this correctly** via separate `textBody` / `htmlBody` schema fields (Decision 2d-1 Option C) — but the V2 expand must NOT regress to V1's auto-detect when adding the `body` field for compatibility. | `lib/workflows/actions/gmail/sendEmail.ts:101-103` | V2 keeps separate `textBody` / `htmlBody`. Reject "single body field with auto-detect" pattern in the port-expand. |
| **G-R7** | V1 `sendEmail.ts:241-249` and `:250-289` handle the case where attachments arrive from a previous workflow node — **including cross-provider import of Google Drive files** via dynamic `import('../googleDrive/getFile')` at handler runtime. This couples Gmail to GoogleDrive at the action-handler layer. | `lib/workflows/actions/gmail/sendEmail.ts:341-369` | V2's attachment design via P-S3 unifies the source-of-bytes contract — the Gmail handler consumes a `FileRef` regardless of upstream provider. No cross-provider import path. |
| **G-R8** | The internal helper `fetchTriggerEmail.ts` is registered under the trigger-shaped key `gmail_trigger_new_email` in `registry.ts:731-732` — but the registry's handler invocation pattern is "action with this id was registered to fetch real email data for testing". Confusing dual use: it looks like a trigger handler but is actually a test-mode hydration helper. | `lib/workflows/actions/registry.ts:731`; `lib/workflows/actions/gmail/fetchTriggerEmail.ts` | V2 separates the polling handler (`triggers/newEmail/poll.ts`) from any test-mode hydration. No dual-purpose registry key. |
| **G-R9** (cites R10) | Action handler signatures are inconsistent: `sendGmailEmail` uses the new params-object shape `{ config, userId, input, meta }`; the other 14 Gmail handlers use legacy positional `(config, userId, input)`. Comment in registry: "Gmail actions — mixed signatures (sendGmailEmail already uses params)" — debt from incremental Q-contract rollout. | `lib/workflows/actions/registry.ts:699-728` | V2 handlers all use the `ActionHandler` shape from `services/execution/handlers/types.ts` — single signature. |

---

## 9. V2 dependency map

Every ported action depends on (existing V2 contracts):

- [`contracts/integration.ts`](c:/Users/marcu/source/repos/ChainReactV2/contracts/integration.ts) — `ProviderManifest`, `ProviderOAuth`, `ActionResult`, `RefreshNotSupportedError`.
- [`contracts/triggerEvent.ts`](c:/Users/marcu/source/repos/ChainReactV2/contracts/triggerEvent.ts) — `TriggerEvent`, `TriggerEventSchema`.
- [`services/execution/handlers/types.ts`](c:/Users/marcu/source/repos/ChainReactV2/services/execution/handlers/types.ts) — `ActionHandler` shape.
- [`services/oauth/refreshAndRetry.ts`](c:/Users/marcu/source/repos/ChainReactV2/services/oauth/refreshAndRetry.ts) — every handler's principal outbound call wraps here.
- [`services/oauth/dispatcher.ts`](c:/Users/marcu/source/repos/ChainReactV2/services/oauth/dispatcher.ts) — refresh path; already exercised by V2's `sendEmail`.
- [`integrations/_shared/google/oauth.ts`](c:/Users/marcu/source/repos/ChainReactV2/integrations/_shared/google/oauth.ts) (246 lines) — Google PKCE + auth-URL build + token exchange + refresh helpers. Shared across Gmail / Google Calendar / Drive / Sheets.
- [`repositories/integrations.ts`](c:/Users/marcu/source/repos/ChainReactV2/repositories/integrations.ts) — `getActiveForExecution(userId, provider, accountId)`.
- [`core/encryption/tokens.ts`](c:/Users/marcu/source/repos/ChainReactV2/core/encryption/tokens.ts) — `decryptToken`.

### Per-handler-batch additional dependencies

- **Compose + drafts batch:** scope expansion (P-G1 — `gmail.compose`) + Q7 multi-recipient parsing utility (P-G2). Reuses V2's existing `buildRfc5322Message` / `encodeBase64Url` from `utils/rfc5322.ts`.
- **Labels batch:** scope expansion (P-G1 — `gmail.modify` OR `gmail.labels`). No new V2 dependencies; pure `users.messages.modify` + `users.labels.create` API calls.
- **Email lifecycle batch (mark/archive/delete):** scope expansion (P-G1 — `gmail.modify`). Same as above.
- **Search batch:** no new V2 dependencies; `users.messages.list` + `users.messages.get` rate-limited helper ported as `integrations/gmail/api/usersMessagesList.ts`.
- **Attachments batch:** **P-S3 file output contract** required for downstream-consumable file references. New API helper: `integrations/gmail/api/usersMessagesAttachmentsGet.ts`.

### Trigger dependencies

- `newAttachment` trigger: reuses `triggers/newEmail` activation + dedup + filter infrastructure; adds a `format=full` (or part-walking) hydration variant. Payload carries `{filename, mimeType, size, attachmentId}` for each attachment — no P-S3 needed at trigger boundary.
- `newLabeledEmail` trigger: requires localized change to `triggers/newEmail/poll.ts:extractMessageIds` to keep `labelsAdded` events distinct from `messagesAdded`. No platform gap.
- `newStarredEmail` trigger (if ported): same pattern as `newLabeledEmail` but filtered to `STARRED` label. The "look-back window" question is config-shape only; no platform gap.

---

## 10. Required platform gaps

Three gaps surfaced by this audit. Each is a separate slice candidate, NOT bundled into the parity port.

### P-S3 — File output contract (shared with Slack 2.3)

**What:** V1's `getAttachment` produces `{attachmentId, filename, mimeType, size, data?: base64string}` and V1's `downloadAttachment` routes the data into Drive/OneDrive/Dropbox storage. V2 needs a generic file-output contract so a Gmail trigger / action emits a `FileRef` that downstream actions (Drive upload, S3 upload, future cloud storage actions) consume uniformly.

**This is the SAME gap parity-slack.md §10 P-S3 surfaces** for Slack's `downloadFile`. **Already in flight in another chat** (per the task brief). Audit confirms Gmail is a second consumer that drives the same contract — design should account for both providers at design time.

**Slice:** Independent design slice already in flight. Gmail attachment work waits for it to land.

### P-G1 — Gmail scope expansion (manifest-only)

**What:** V2's Gmail manifest declares `gmail.readonly + gmail.send` as required scopes. Every action this audit recommends porting beyond send-only requires additional scope:

| Scope | Actions enabled |
|---|---|
| `gmail.modify` | `addLabel`, `removeLabel`, `markAsRead`, `markAsUnread`, `archiveEmail`, `deleteEmail` (trash variant), `sendEmail` labels-on-send |
| `gmail.labels` | `createLabel` (also covered by `gmail.modify` per Google docs, but `gmail.labels` is the narrower scope) |
| `gmail.compose` | `createDraft`, `createDraftReply`, `replyToEmail` (subset overlap with `gmail.send` for the actual send step) |
| `gmail.settings.basic` | (not needed — `updateSignature` orphan skipped) |

**Decision needed:** request the union of (`modify` + `compose`) and document the trade-off in the manifest comment, OR request scopes on-demand per workflow. V2's current model is "all scopes requested at OAuth time" (no per-action scope deferral) — recommendation is to expand the manifest to the union once and require re-consent from existing users at the next connect. The same trade-off Slack faced with `chat:write.public` (parity-slack.md S-R10) but lower-stakes because Gmail's broad scopes are already user-expected.

**Slice:** Manifest edit + re-consent UX note. Could bundle into the first parity batch that needs it (Gmail 2.1 — drafts). No standalone design slice required.

### P-G2 — Multi-recipient parsing helper (Q7 contract surface)

**What:** V1's `sendEmail` routes `to` / `cc` / `bcc` through `parseRecipients` from `lib/workflows/actions/core/parseRecipients.ts` per Q7. V2's current `sendEmail` passes the raw strings verbatim into the RFC 5322 `To:` line (per [`sendEmail.schema.ts:18-22`](c:/Users/marcu/source/repos/ChainReactV2/integrations/gmail/actions/sendEmail.schema.ts#L18) comment — Decision 2d-3 Option A: "CSV-style multi-recipient input preserved verbatim").

That decision was acceptable for the slice 2d minimum surface — Gmail's RFC 5322 parser tolerates `"alice@x.com, bob@x.com"` as a single header value. **But:** mixed shapes (array of strings, array of CSV strings, single CSV string) from upstream nodes can't be expressed in `to: string` without parser-side handling. V1's `parseRecipients` already handles all four shapes.

**Slice:** Port `parseRecipients` to `core/integrations/parseRecipients.ts` (already cited as existing in parity-slack.md §9 — verify before porting; if Slack already ported it, this is a zero-cost reuse). Update `sendEmail.schema.ts` to accept `string | string[]`. **Bundle into Gmail 2.1 — compose batch** (which expands sendEmail anyway).

---

## 11. Effort estimate

Per master plan §6 sizing matrix. Gmail is **smaller than Slack-sized** but larger than Excel-sized — V1 has 15 actions vs Slack's 34, 4 triggers vs Slack's 10. Recommend split into **3 parity slices**:

### Phase 2.1 — Gmail compose + drafts

**Scope:** 1 expand + 3 ports (sendEmail-expand, createDraft, createDraftReply, replyToEmail). Closes the "Gmail as outbound mail" use case.

| Commits | Content |
|---|---|
| 1 (audit) | This doc. |
| 2 | feat(gmail): P-G1 manifest scope expansion (gmail.modify + gmail.compose) + P-G2 parseRecipients consumption |
| 3 | feat(gmail): expand sendEmail with attachments(stub) + replyTo + signature + labels-on-send (Q11-clean — no scheduleSend/trackOpens/trackClicks) |
| 4 | feat(gmail): port createDraft + createDraftReply + replyToEmail |

**Estimate: 4 commits (incl. audit).**

### Phase 2.2 — Gmail labels + lifecycle

**Scope:** 7 actions (addLabel, removeLabel, createLabel, markAsRead, markAsUnread, archiveEmail, deleteEmail) + searchEmails (with advancedSearch folded in).

| Commits | Content |
|---|---|
| 1 | feat(gmail): port label actions (addLabel, removeLabel, createLabel) |
| 2 | feat(gmail): port email lifecycle actions (markAsRead, markAsUnread, archiveEmail, deleteEmail) — deleteEmail default decision lands here |
| 3 | feat(gmail): port searchEmails with advancedSearch fields folded into discriminated mode |

**Estimate: 3 commits.**

### Phase 2.3 — Gmail triggers + attachments

**Scope:** 2 trigger ports + 2 attachment actions (gated by P-S3) + 1 product decision.

| Commits | Content |
|---|---|
| 1 | feat(gmail): port newLabeledEmail trigger (extracts labelsAdded events from history walk) |
| 2 | feat(gmail): port newAttachment trigger (metadata-only payload; full content via getAttachment action) |
| 3 | feat(gmail): port getAttachment + downloadAttachment (P-S3 consumers — lands after P-S3 contract slice) |
| 4 | feat(gmail): port newStarredEmail trigger (after product decision on 2-day-window) — optional |
| 5 | test(e2e): extend gmail walkthrough with 2.1+2.2+2.3 surface |

**Estimate: 4–5 commits, several gated.**

### Cross-slice totals

- **Total commits across 3 parity slices: ~11** (4 + 3 + 4).
- **Total ports: 11 actions + 2 triggers + 1 sendEmail expansion = 14 surface changes.**
- **Approximate calendar effort:** Phase 2.1 + 2.2 = "Sheets-sized" pair; Phase 2.3 = "Excel-sized" with P-S3 dependency. **Substantially smaller than Slack's parity envelope.**

---

## 12. Risk estimate

Top 3 risks with likelihood × impact × mitigation:

### R-1 — P-S3 design choices change Gmail attachment port shape

- **Likelihood:** medium. P-S3 is in flight in a parallel chat (per the task brief); the contract shape will influence whether the Gmail trigger payload carries `FileRef[]` or stays metadata-only-with-fetch-back-via-getAttachment.
- **Impact:** medium. Affects 2 actions (`getAttachment`, `downloadAttachment`) + the `newAttachment` trigger payload shape. Audit can recommend the metadata-only trigger payload (no P-S3 dependency) but the attachment-content actions MUST consume P-S3.
- **Mitigation:** Sequence Gmail 2.3 after P-S3 acceptance. If P-S3 lands materially different from "ActionResult.output carries a `file: FileRef`" shape, the 2 attachment-content actions re-design at port time. The 2 triggers + 7 non-attachment actions are unaffected.

### R-2 — Q11 audit-time decisions on send-email fields produce a less-functional port

- **Likelihood:** high. V1 has `scheduleSend`, `trackOpens`, `trackClicks` fields that silently no-op. Audit recommends dropping all three at port time (Q11). Users who built workflows expecting these to work will lose the (illusory) feature.
- **Impact:** low. None of these features were actually working in V1 — V1 logged warnings and proceeded as if they weren't set. Dropping = honest behavior. Documented removal in the V2 sendEmail port-expand commit.
- **Mitigation:** Add a one-line note in the V2 sendEmail Decision comments stating the three fields were removed per Q11. If scheduling becomes a real ask, ship `users.drafts.create + cron-publish-draft` as a separate provider-agnostic primitive — much cleaner than a Gmail-specific scheduling shim.

### R-3 — V2's `extractMessageIds` flattening blocks `newLabeledEmail` and `newStarredEmail` triggers

- **Likelihood:** medium-high. V2's [`poll.ts:230-248`](c:/Users/marcu/source/repos/ChainReactV2/integrations/gmail/triggers/newEmail/poll.ts#L230) deliberately flattens `messagesAdded` + `labelsAdded` + `messages` into one id list for the `new_email` trigger. The labeled-email and starred-email triggers require keeping the event-type tag through the pipeline (so we know "this id surfaced because a label was added, not because the message arrived").
- **Impact:** medium. The fix is localized — change `extractMessageIds` to return `Array<{id, eventType}>` and route to the right trigger downstream. But it touches the file every Gmail polling trigger reads.
- **Mitigation:** Implement before porting either label-event trigger. Land as a small refactor commit at the head of Gmail 2.3 batch with regression tests on the existing `new_email` trigger.

---

## 13. Recommended parity batch plan

Sequence of slices and the order they ship in. Each slice is its own audit-accepted unit; this plan is the recommendation, not the commitment.

1. **Gmail 2.1 — Compose + drafts** (4 commits incl. audit) — closes the highest-leverage gap (Gmail outbound mail is the main use case the audit's "11 ports" set serves). Lands P-G1 (scope expansion) and P-G2 (parseRecipients) in commit 1; everything after reuses both. **No external dependencies.**
2. **Gmail 2.2 — Labels + lifecycle** (3 commits) — natural continuation; reuses P-G1 scope expansion. Resolves `deleteEmail` default Q11 product decision in commit 2. **No external dependencies.**
3. **Gmail 2.3 — Triggers + attachments** (4–5 commits, partially gated) — landed in priority order: extractMessageIds refactor first (R-3); then `newLabeledEmail` trigger (cheapest port); then `newAttachment` trigger (metadata-only payload); then `getAttachment` + `downloadAttachment` (gated by **P-S3 acceptance**); then `newStarredEmail` trigger (gated by product decision); end with e2e walkthrough extension.

**Across all 3 slices:**

- Update master plan §3 priority table: Gmail drops out as priority 2 once 2.1 lands; Notion (priority 3) proceeds.
- Append to master plan §5 rot catalog: G-R5 (silent no-op send-time fields — `scheduleSend` / `trackOpens` / `trackClicks`) is a new instance worth adding to the cross-provider catalog. **Outlook is the next likely consumer of this pattern** (audit parity-microsoft-outlook.md should check the same fields).
- Append G-R8 (dual-purpose registry key — trigger-shaped id used for test-mode hydration) as a one-line note in the rot catalog under R5.

**Cross-cutting:**

- Confirm V2 already has `core/integrations/parseRecipients.ts` (parity-slack.md §9 cites it as existing — verify before porting in 2.1 commit 1).
- Decide `deleteEmail` default (permanent vs trash) before 2.2 commit 2 — recommend trash-as-default with explicit `permanent: true` opt-in field.
- Verify P-S3 acceptance status before scheduling 2.3 commit 3.

---

## 14. Exit checklist

This audit is complete when Marcus has:

- [x] Read sections 1–13.
- [x] Confirmed the action port/skip/defer table (§7) — `advancedSearch` SKIP–FOLD accepted (decision 1); `deleteEmail` port with `requireExplicitField` on `deleteMode` enum (decision 2).
- [x] Confirmed the trigger port/skip/defer table (§7) — `newStarredEmail` DEFERRED (decision 3); `new_email` AI content filter DEFERRED to Phase 5 (decision 4).
- [x] Confirmed the 3 platform gaps (§10) are filed as separate slice candidates: **P-S3** file output contract (already in flight; shared with Slack 2.3), **P-G1** Gmail scope expansion (manifest-only — bundles into 2.1 commit 1; decision 6 accepted), **P-G2** multi-recipient parsing (decision 7: verify, reuse if present, port if missing).
- [x] Confirmed the recommended split into **3 parity slices** (§11) with an estimated **~11 commits total**.
- [x] Sequencing decided (decision 8): **start Gmail 2.1 immediately** — option (a). No wait on Slack parity slices.
- [x] `deleteEmail` decided (decision 2): port with `requireExplicitField` + `deleteMode: "trash" | "permanent"`. No silent default. Two-separate-actions split acceptable if it falls out cleaner at port time.
- [x] `newStarredEmail` decided (decision 3): DEFER. When revisited later, drop the V1 hidden 2-day heuristic — configurable window OR skip trigger.
- [x] Dropped send-email fields confirmed (decision 5): `scheduleSend`, `trackOpens`, `trackClicks` removed at port time. Rationale documented in the V2 sendEmail expand commit.
- [x] `gmail.modify` + `gmail.compose` scope expansion confirmed (decision 6): manifest is the single source of truth.

**Audit accepted 2026-05-12. Implementation begins at Gmail 2.1.**
