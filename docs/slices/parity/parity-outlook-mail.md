# Parity audit — Microsoft Outlook (mail)

**Status:** Audit / not yet accepted. **Doc-only commit.**
**Master plan:** [`docs/slices/phase-2-plan.md`](../phase-2-plan.md). Priority rank §3: **12** (after GitHub).
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`.
**V2 baseline:** [`integrations/microsoft-outlook/`](../../../integrations/microsoft-outlook/) (Slice 6).
**Phase 1 surface shipped:** 1 action (`send_email`) + 1 webhook trigger (`new_email`).
**Recommendation up front:** Outlook mail is the **largest single parity port left** after Slack/Gmail/Sheets/Excel were closed — V1 ships **9 mail actions + 3 mail triggers**; V2 ships **1 + 1**. Audit recommends **6 actions PORT** (`reply_to_email`, `forward_email`, `create_draft_email`, `move_email`, `delete_email`, `add_categories`) + **1 action PORT-EXPAND existing handler** (`send_email` + attachments) + **1 action PORT after P-S3 carry-through** (`get_attachment`) + **1 action NEEDS PRODUCT DECISION** (`fetch_emails` — read/search action overlapping with Gmail's `searchEmails` audit). Triggers: **2 PORT** (`email_sent`, `email_flagged`) reusing Slice 6 subscription-watch lifecycle, **1 follow-up** (extend `new_email` trigger config — currently no per-trigger filters; V1 supports `from / subject / hasAttachment / folder / importance`). **1 V1 dead-orphan SKIP** (`searchOutlookEmail` — exported, never registered). Three required platform gaps: **P-O1** (Outlook scope expansion: `Mail.ReadWrite` + categories implies `Mail.ReadWrite`; current Slice 6 manifest is `Mail.Send + Mail.Read` only), **P-O2** (Microsoft Graph attachment payload model — `fileAttachment` vs `itemAttachment`; gates `get_attachment` action and `hasAttachments` filter on `new_email`), **P-O3** (delete semantics — `permanentDelete: true | false` mirrors Gmail's `deleteMode` Q11 explicit-field pattern; no silent default). Recommended split: **3 parity slices** (compose+drafts / lifecycle+search / triggers+attachments) totaling ~10 commits. Single most important decision: whether `fetch_emails` is folded into a future `search_emails` (the Gmail-parity-accepted pattern) or shipped as V1-shape `fetch_emails` (D-OM1).

The V2 baseline already absorbed the only platform-tier work Slice 6 explicitly deferred: **(a)** Microsoft Graph subscription manager via [`_shared/microsoft/api/subscriptions.ts`](../../../integrations/_shared/microsoft/api/subscriptions.ts) with renewal at 1h-before-expiration (V1 used 3-day max with rotational refresh-token bug); **(b)** `clientState` HMAC-like verification with mismatch-log-but-never-throw to avoid probing surface; **(c)** validation-token handshake echoed in 10s without DB I/O; **(d)** Azure AD OAuth via [`_shared/microsoft/oauth.ts`](../../../integrations/_shared/microsoft/oauth.ts) with refresh-token-rotation preserve-old-if-omitted semantics; **(e)** scope-collapsed manifest (3 mail-only scopes vs V1's 9-scope mega-list). This audit's parity expansion builds on that foundation — no platform-tier work required for the PORT set except scope expansion (P-O1).

---

## 1. V1 source paths audited

### Actions

| File | Lines | Notes |
|---|---|---|
| `lib/workflows/actions/microsoft-outlook/sendEmail.ts` | 496 | Most modern V1 Outlook handler — Q3 (`refreshAndRetry`), Q4 (`checkReplay` / `recordFired` / `buildIdempotencyKey`), Q7 (`parseRecipients` for CSV-or-array), Q8d (`meta?.testMode` interception), Q12 (`applyEmailMetaVariables`). Attachments from 5 source types (file / url / node / uploadedFiles / Drive cross-provider). |
| `lib/workflows/actions/microsoft-outlook/emailActions.ts` | 741 | **Monolithic file** holding 8 handlers — `replyToOutlookEmail`, `forwardOutlookEmail`, `createOutlookDraftEmail`, `moveOutlookEmail`, `deleteOutlookEmail`, `addOutlookCategories`, `getOutlookEmails`, **plus `searchOutlookEmail`** (exported but NOT registered — R5 orphan / dead-handler). None use Q3/Q4/Q7 contracts; all use the legacy `getDecryptedAccessToken` + inline `refreshMicrosoftToken` on 401 pattern. |
| `lib/workflows/actions/microsoft-outlook/attachmentActions.ts` | 162 | `downloadOutlookAttachment` (registered as `microsoft-outlook_action_get_attachment`). Lists attachments via `/me/messages/{id}/attachments`, applies filters (`all` / `by_extension` / `by_name`), downloads each via second GET. **Returns `contentBytes: base64` inline** (no FileRef contract). Skips `itemAttachment` content but emits metadata. |
| `lib/workflows/actions/microsoft-outlook/index.ts` | 36 | Re-exports. **Confirms the orphan:** `searchOutlookEmail` exported here but registry.ts has no entry for it. |
| `lib/workflows/actions/outlook.ts` | 120 | Older delegation shim — predates the `microsoft-outlook/` subfolder. Re-exports `sendOutlookEmail` from the new location. Mostly dead but referenced in old AI templates. |

Other Outlook actions in `microsoft-outlook/` (out of scope — calendar / contacts):
- `calendarActions.ts` (477), `contactActions.ts` (380), `createCalendarEvent.ts` (396) — covered by V2's separate `microsoft-outlook-calendar` provider (Slice 7) + future contacts work.

### Manifest

| File | Lines | Notes |
|---|---|---|
| `lib/workflows/nodes/providers/outlook/index.ts` | 1813 | **Combined manifest** for mail + calendar + contacts. Mail surface is interleaved with calendar/contact entries. Mail subset: 3 triggers + 9 actions (8 email + 1 attachment). Calendar/contacts subset (out of scope): 6 triggers + 10 actions. |

### Trigger lifecycle + OAuth + webhook utils

| File | Lines | Notes |
|---|---|---|
| `lib/triggers/providers/MicrosoftGraphTriggerLifecycle.ts` | 838 | **Shared lifecycle** for all Microsoft Graph triggers (Outlook mail + Outlook calendar + Outlook contacts + Teams + OneDrive + Excel). One class, one `onActivate` switching on `triggerType.startsWith()`. Resource mapping at lines 525–665. Email events: `trigger_new_email` → `/me/messages` or `/me/mailFolders/{folder}/messages`; `trigger_email_sent` → `/me/mailFolders/SentItems/messages`; `trigger_email_flagged` → `/me/messages` with `changeType: "updated"`. Inline `/me` + `/me/messages` permission test at activate time. |
| `lib/microsoft-graph/subscriptionManager.ts` | ~330 | Creates/renews Microsoft Graph subscriptions. **V1 rot:** renewal cron passed `subscription.accessToken` which is empty per `subscriptionManager.ts:303` — only renewed when the in-flight token happened to coincide with a fresh one. V2 closed this by making token-fetch part of the renewal contract via `refreshAndRetry`. |
| `lib/microsoft-graph/auth.ts` | — | `MicrosoftGraphAuth` class with `getValidAccessToken`. Requests **8 scopes** for any Microsoft surface (V1 rot — V2 closed by manifest-collapsed 3 scopes). |
| `lib/integrations/oauthConfig.ts` (entries 354–367) | 14 | microsoft-outlook OAuth entry — `authEndpoint: login.microsoftonline.com/common/oauth2/v2.0/authorize`, `tokenEndpoint: …/token`. Uses `OUTLOOK_CLIENT_ID` / `OUTLOOK_CLIENT_SECRET` env names. V1 has separate Microsoft entries per surface (R4 — per-provider env silos). |
| `lib/integrations/authSchemes.ts:53` | 1 | `'microsoft-outlook': 'oauth_with_refresh'`. |
| `lib/integrations/integrationScopes.ts` (entries 112–125) | 13 | `required: ['offline_access', 'User.Read', 'Mail.Read', 'Mail.ReadWrite', 'Mail.Send', 'Calendars.Read', 'Calendars.ReadWrite', 'Contacts.Read', 'Contacts.ReadWrite']`. **9 scopes for what V2 split into 3 providers.** Scope-bloat per R3. |
| `app/api/webhooks/microsoft/route.ts` | 2475 | **Mega-route** handling ALL Microsoft Graph notifications (Outlook mail + calendar + contacts + Teams + OneDrive + Excel). Validation-token handshake; clientState check; per-trigger-type fan-out. R1 (monolithic). |
| `app/api/webhooks/microsoft/lifecycle/route.ts` | 220 | Microsoft subscription lifecycle events (subscription expiring, reauthRequired). Separate route. |
| `__tests__/nodes/outlook-send-email.test.ts` | 558 | V1's only Outlook-dedicated test file. Covers send-email handler contracts. **No tests** for reply / forward / draft / move / delete / categories / fetch / search / attachment handlers, no tests for triggers or webhook receive. Bug-discovery-by-test density: low. |
| `lib/workflows/testing/fixtures/webhooks/` | — | No `outlook/` subfolder. Webhook integration tests use inline fixtures only. |

---

## 2. V1 actions inventory

V1 ships **9 mail action node types** in the manifest. `comingSoon: false` count: 9. Dead-code count: 1 (`searchOutlookEmail` — exported from index.ts, mentioned in `lib/ai/workflowAI.ts:216` as `microsoft-outlook_action_search_email`, but NOT registered in `lib/workflows/actions/registry.ts` and NOT declared as a manifest node type).

| # | Action key | Endpoint | Handler | Notes |
|---|---|---|---|---|
| 1 | `microsoft-outlook_action_send_email` | POST `/me/sendMail` | `sendOutlookEmail` | Already in V2. Most modern V1 handler — Q3/Q4/Q7/Q8d/Q12 compliant. Attachments from 5 source types. |
| 2 | `microsoft-outlook_action_reply_to_email` | POST `/me/messages/{id}/reply` OR `/replyAll` | `replyToOutlookEmail` | Endpoint switch on `replyAll: boolean`. `comment` body only (no rich body). Attachments declared but not implemented in handler. |
| 3 | `microsoft-outlook_action_forward_email` | POST `/me/messages/{id}/forward` | `forwardOutlookEmail` | `to` required; `cc` optional; `comment` optional. **Hidden default:** comment defaults to empty string. No Q7 multi-recipient parsing — passes raw `to` field. |
| 4 | `microsoft-outlook_action_create_draft_email` | POST `/me/messages` (no `/send`) | `createOutlookDraftEmail` | Standard draft creation. Importance defaults `"normal"` (R8 — Q11 violation). |
| 5 | `microsoft-outlook_action_move_email` | POST `/me/messages/{id}/move` | `moveOutlookEmail` | Body `{ destinationId }`. ErrorItemNotFound → "Email not found" friendly message. |
| 6 | `microsoft-outlook_action_delete_email` | DELETE `/me/messages/{id}` OR POST `/move {destinationId: 'deleteditems'}` | `deleteOutlookEmail` | **Two-mode action.** `permanentDelete: true` → DELETE; `false` (default) → move to Deleted Items. Q11 violation: hidden destructive default. |
| 7 | `microsoft-outlook_action_add_categories` | PATCH `/me/messages/{id}` | `addOutlookCategories` | Replaces `categories[]` on the message. Parses categories from comma-separated string OR array. Q7-shaped but ad-hoc impl (not via `parseRecipients`). |
| 8 | `microsoft-outlook_action_fetch_emails` | GET `/me/messages` OR `/me/mailFolders/{id}/messages` | `getOutlookEmails` | Microsoft Graph `$search` + `$filter` are mutually exclusive — handler routes around it. `$search` mode fetches 3× requested and client-side-filters by date. `$select` whitelist bounded — doesn't return full body. |
| 9 | `microsoft-outlook_action_get_attachment` | GET `/me/messages/{id}/attachments` then per-id GET | `downloadOutlookAttachment` | Lists attachments, filter by extension/name, download each. Returns `contentBytes: base64` inline. No FileRef contract integration. |

**ORPHAN:** `searchOutlookEmail` — exported from `microsoft-outlook/index.ts`, schema-less, no manifest entry, no registry entry. Only referenced in `lib/ai/workflowAI.ts:216` (AI planner prompt template). If the planner ever recommended this action, runtime would fail with "no handler for microsoft-outlook_action_search_email." Same shape as V1 Gmail's two orphans (`fetchMessage` / `updateSignature`). See §8 finding O-R1.

---

## 3. V1 triggers inventory

V1 ships **3 mail trigger node types**. All webhook-based via Microsoft Graph subscriptions (`POST /v1.0/subscriptions`). **Lifecycle: per-workflow per-resource** — each (workflow, node) pair creates one subscription on the matching resource (`/me/messages`, `/me/mailFolders/{folder}/messages`, or `/me/mailFolders/SentItems/messages`). Renewal at the shared lifecycle's deferred hook.

| # | Trigger key | Graph resource | changeType | Notes |
|---|---|---|---|---|
| 1 | `microsoft-outlook_trigger_new_email` | `/me/messages` (or `/me/mailFolders/{folderId}/messages` when folder configured) | `created` | Config: `from` (sender filter), `subject` + `subjectExactMatch`, `hasAttachment` (`any` / `yes` / `no`), `folder` (folder filter), `importance` (`any` / `high` / `normal` / `low`). 6 per-trigger filters. |
| 2 | `microsoft-outlook_trigger_email_sent` | `/me/mailFolders/SentItems/messages` | `created` | Config: `to` (required), `subject` + `subjectExactMatch`. 3 per-trigger filters. |
| 3 | `microsoft-outlook_trigger_email_flagged` | `/me/messages` | `updated` (flag changes are update events) | Config: `folder`. Filters at notification time on `flag.flagStatus === 'flagged'`. |

**Per-trigger config filtering happens at notification-receive time in V1's mega-route** (`app/api/webhooks/microsoft/route.ts`) — V1 fetches the full message from Graph and applies sender/subject/importance/folder/flag-status filters before dispatching the workflow. V2's Slice 6 trigger ships with **NO per-trigger filter config** — every notification dispatches. P-O2 / D-OM3 capture the decision.

---

## 4. V2 current surface

V2 ships **1 action + 1 trigger** + the shared Microsoft Graph platform infrastructure.

### Actions (1)

Registered in [`services/execution/handlers/_registry.ts:318`](../../../services/execution/handlers/_registry.ts):

`send_email` — at [`integrations/microsoft-outlook/actions/sendEmail.ts`](../../../integrations/microsoft-outlook/actions/sendEmail.ts).

Per-file `ActionHandler` with sibling [`sendEmail.schema.ts`](../../../integrations/microsoft-outlook/actions/sendEmail.schema.ts). Uses shared [`api/sendMail.ts`](../../../integrations/microsoft-outlook/api/sendMail.ts) wrapper (which delegates HTTP semantics via `_shared/microsoft/api/`). Q3 (`refreshAndRetry`), Q7 (`parseRecipients` at-least-one-recipient post-parse check), Q11 (`isHtml` + `importance` required in schema). **No attachments yet** — Slice 6 explicitly deferred attachment support to keep scope tight (Slice 6 §"Confirmed scope decisions" #2). Output: `{ sent: true, to, cc, bcc, subject, isHtml, importance }`.

### Trigger (1)

`new_email` — [`integrations/microsoft-outlook/triggers/newEmail/`](../../../integrations/microsoft-outlook/triggers/newEmail/). Per-workflow per-account subscription lifecycle:
- **Activate** ([`activate.ts`](../../../integrations/microsoft-outlook/triggers/newEmail/activate.ts)) creates a Graph subscription on `/me/messages` with `changeType: created`. Persists `subscriptionId` + `clientState` + `resource` + `notificationUrl` + `expiresAt` + `type: "subscription-watch"` in `trigger_resources.config`.
- **Deactivate** ([`deactivate.ts`](../../../integrations/microsoft-outlook/triggers/newEmail/deactivate.ts)) DELETEs the subscription. Best-effort 404 / 401 → swallow.
- **Renew** ([`renew.ts`](../../../integrations/microsoft-outlook/triggers/newEmail/renew.ts)) — registered subscription handler via `services/triggers/subscriptionRegistry.ts`. 1h threshold (well within 3-day max). PATCH `/subscriptions/{id}` with `expirationDateTime: now + ~70.5h`. Closes V1 renewal-token rot via `refreshAndRetry`-wrapped token fetch.

**NO per-trigger filters** in Slice 6 baseline. Every Graph notification fans out to the workflow. Per-trigger filtering (sender / subject / importance / folder / hasAttachment) is parity expansion (D-OM3 below).

### Webhook receive + signature verification

- [`app/api/webhooks/microsoft-outlook/route.ts`](../../../app/api/webhooks/microsoft-outlook/route.ts) — per-provider receive route (NOT a shared `[provider]` mega-route).
- [`integrations/microsoft-outlook/webhooks/receive.ts`](../../../integrations/microsoft-outlook/webhooks/receive.ts) — handles validation-handshake (echoes `?validationToken=...` as text/plain 200), parses notification envelope, looks up trigger row by `config.subscriptionId`, verifies `clientState` (mismatch logged but not raised — avoids probing surface), fetches full message via [`getMessage.ts`](../../../integrations/microsoft-outlook/api/getMessage.ts) (wrapped in `refreshAndRetry`), normalizes via [`normalize.ts`](../../../integrations/microsoft-outlook/triggers/newEmail/normalize.ts), dispatches.
- [`integrations/_shared/microsoft/webhooks/validation.ts`](../../../integrations/_shared/microsoft/webhooks/validation.ts) — single-pass body read + validation-token detection (query-param or text/plain body).

### Manifest

[`integrations/microsoft-outlook/manifest.ts`](../../../integrations/microsoft-outlook/manifest.ts) — `oauth: true`, `actions: true`, `webhookTrigger: true`, `pollingTrigger: false`. **3 required scopes** (`offline_access`, `Mail.Send`, `Mail.Read`) — V1's 9-scope mega-list collapsed mail-only. 6-hour health-check interval (matches Google/Microsoft tier per CLAUDE.md). `refreshable: true` with rotational-refresh preserve-old semantics. `accountIdField: "email"`.

### Shared Microsoft Graph infrastructure

- [`integrations/_shared/microsoft/oauth.ts`](../../../integrations/_shared/microsoft/oauth.ts) (265 LOC) — Azure AD OAuth shared across `microsoft-outlook` + `microsoft-outlook-calendar` + future Microsoft surfaces.
- [`integrations/_shared/microsoft/api/subscriptions.ts`](../../../integrations/_shared/microsoft/api/subscriptions.ts) (252 LOC) — `createSubscription`, `renewSubscription`, `deleteSubscription` with clientState generation + bounded expiration ceiling.
- [`integrations/_shared/microsoft/api/me.ts`](../../../integrations/_shared/microsoft/api/me.ts) (56 LOC) — `/me` resolution.
- [`integrations/_shared/microsoft/api/errors.ts`](../../../integrations/_shared/microsoft/api/errors.ts) (59 LOC) — `NotFoundError`, `ValidationError`, Graph error envelope unpacking.
- [`integrations/_shared/microsoft/api/_base.ts`](../../../integrations/_shared/microsoft/api/_base.ts) (22 LOC) — `graphApiBase()`, version pin.

### Tests

V2 ships **17 Microsoft Outlook + 7 shared Microsoft test suites** at [`tests/unit/integrations/microsoft-outlook/`](../../../tests/unit/integrations/microsoft-outlook/) + [`tests/unit/integrations/_shared/microsoft/`](../../../tests/unit/integrations/_shared/microsoft/) covering action + trigger lifecycle + webhook receive + manifest + OAuth + each shared API wrapper + validation helper. V1 ships **1** test (`__tests__/nodes/outlook-send-email.test.ts`, 558 LOC, covers send-email only).

E2e: [`tests/e2e/slice-6-outlook-mail-walkthrough.spec.ts`](../../../tests/e2e/slice-6-outlook-mail-walkthrough.spec.ts) — runs against mocked Microsoft Graph boundary.

---

## 5. Missing actions

Set difference: V1 mail actions (9) minus V2 mail actions (1) = **8 missing actions**.

| # | V1 action key | V1 endpoint | Why not in V2 today |
|---|---|---|---|
| 1 | `microsoft-outlook_action_reply_to_email` | POST `/me/messages/{id}/reply` OR `/replyAll` | Slice 6 explicitly deferred — "one action, send_email only" (Slice 6 §"Confirmed scope decisions" #2). |
| 2 | `microsoft-outlook_action_forward_email` | POST `/me/messages/{id}/forward` | Same as reply — deferred. |
| 3 | `microsoft-outlook_action_create_draft_email` | POST `/me/messages` | Same as reply — deferred. |
| 4 | `microsoft-outlook_action_move_email` | POST `/me/messages/{id}/move` | Same as reply — deferred. Requires `Mail.ReadWrite` scope (P-O1). |
| 5 | `microsoft-outlook_action_delete_email` | DELETE `/me/messages/{id}` OR POST `/move` to `deleteditems` | Same as reply — deferred. Requires `Mail.ReadWrite` scope (P-O1). Q11 explicit-field pattern for `permanentDelete` (D-OM2). |
| 6 | `microsoft-outlook_action_add_categories` | PATCH `/me/messages/{id}` | Same as reply — deferred. Requires `Mail.ReadWrite` scope (P-O1). |
| 7 | `microsoft-outlook_action_fetch_emails` | GET `/me/messages` (+ optional folder) | Same as reply — deferred. Read action — `Mail.Read` scope already in manifest. Decision shape ambiguous: ship as `fetch_emails` (V1 shape) OR fold into a future `search_emails` (Gmail parity decision pattern) — D-OM1. |
| 8 | `microsoft-outlook_action_get_attachment` | GET `/me/messages/{id}/attachments` + per-id download | Same as reply — deferred. Attachment payload model is the platform gap (P-O2). |

Plus **`send_email` PORT-EXPAND**: V2's `sendEmail` doesn't ship attachment support. V1's `sendEmail` supports 5 attachment source types — needs P-O2 (attachment model) and P-S3 carry-through to ship. Counted separately because the action exists; the gap is feature-level.

---

## 6. Missing triggers

Set difference: V1 mail triggers (3) minus V2 mail triggers (1) = **2 missing triggers**.

| # | V1 trigger key | Graph resource | changeType | Why not in V2 today |
|---|---|---|---|---|
| 1 | `microsoft-outlook_trigger_email_sent` | `/me/mailFolders/SentItems/messages` | `created` | Slice 6 deferred — "one trigger, new_email only" (Slice 6 §"Confirmed scope decisions" #3). Mechanically a sibling resource — same subscription lifecycle, different resource string. |
| 2 | `microsoft-outlook_trigger_email_flagged` | `/me/messages` | `updated` | Same as email_sent — deferred. Distinct because `changeType: updated` fires for ANY message update, not just flag changes — receive route must filter on `flag.flagStatus === 'flagged'` AND on prior state diff. Slightly more complex than email_sent. |

Plus **`new_email` PORT-EXPAND with per-trigger filters**: V2's `new_email` ships with no config filters. V1 supports 6 filters (`from`, `subject` + `subjectExactMatch`, `hasAttachment`, `folder`, `importance`). Filters apply at notification-receive time. D-OM3 captures the design decision.

---

## 7. Port / skip / defer table

Every row from §§5+6 + the orphan finding gets a decision.

### Actions

| V1 item | Type | Recommendation | Reasoning |
|---|---|---|---|
| `reply_to_email` | Action | **PORT** | High-leverage workflow primitive ("when email arrives → AI summarize → reply"). V1 handler is 70 LOC; V2 port adds Q3/Q4/Q7 wrap. Endpoint switch `/reply` vs `/replyAll` should be `replyAll: boolean` required (Q11 — destructive default avoided). Schema: `emailId` + `replyAll` + `body` + optional `attachments` (after P-S3 carry-through). |
| `forward_email` | Action | **PORT** | Symmetric to reply. V1 hard-defaults `comment` to empty string — V2 should require `comment` (or not — Q11 explicit-field for `comment` is borderline; recommendation: optional, default truly absent). `to` MUST route through `parseRecipients` (Q7) — V1 passes raw CSV which becomes one Graph address. |
| `create_draft_email` | Action | **PORT** | Standard draft creation. Same shape as `send_email` minus the `/sendMail` POST — just `POST /me/messages` without /send. Requires `Mail.ReadWrite` scope (P-O1). Q11: `importance` already required by Slice 6's `sendEmail.schema.ts` shape; carry forward. |
| `move_email` | Action | **PORT** | Two-field action (`emailId` + `destinationFolderId`). Requires `Mail.ReadWrite` (P-O1). Low complexity. |
| `delete_email` | Action | **PORT with Q11 deleteMode** | Mirror Gmail's accepted `deleteMode: "trash" \| "permanent"` pattern (Gmail parity audit §"Accepted decisions" #2). V1's `permanentDelete: boolean` defaults `false` — Q11 violation. V2 port MUST require explicit `deleteMode` enum. Two-separate-actions split (`delete_email` + `permanently_delete_email`) is acceptable alternative — D-OM2. |
| `add_categories` | Action | **PORT** | PATCH-replace semantics on `categories[]`. Requires `Mail.ReadWrite` (P-O1). Q7-shape input parsing via `parseRecipients`-style helper (categories ≠ recipients but the CSV-string-or-array shape is identical). V1's ad-hoc impl can be replaced with a shared helper. |
| `fetch_emails` | Action | **NEEDS PRODUCT DECISION (D-OM1)** | Shape ambiguous. Gmail-parity-accepted pattern folds `searchEmails` and `advancedSearch` into one query-builder action. Should `fetch_emails` ship as V1-shape (`folderId` + `query` + date filters + maxResults) OR be folded into a future `search_emails` mirroring Gmail's accepted shape? Recommendation: ship V1-shape now, schedule unification with Gmail's `searchEmails` when both providers ship full search later. |
| `get_attachment` | Action | **PORT after P-O2 + P-S3 carry-through** | V1 returns `contentBytes: base64` inline — incompatible with V2's FileRef contract. P-O2 captures the attachment model decision (`fileAttachment` vs `itemAttachment` payload split). P-S3 (file output contract) already shipped in V2 — Outlook's port stages bytes to `workflow_files` storage and returns a FileRef. Slack 2.4 download pattern is the precedent. |

### Triggers

| V1 item | Type | Recommendation | Reasoning |
|---|---|---|---|
| `email_sent` | Trigger | **PORT** | Mechanical — clone Slice 6's `newEmail` lifecycle with `resource: "/me/mailFolders/SentItems/messages"`. Activate / deactivate / renew / normalize all reuse current shape. ~150 LOC + tests. |
| `email_flagged` | Trigger | **PORT** | Activate uses `changeType: updated` on `/me/messages`. Receive route needs an additional filter: `flag.flagStatus === 'flagged'` AND (optionally) on prior-state diff to avoid firing on every message update. V1 doesn't do the prior-state diff — fires on any update if flag is set, which is noisy. V2 should fire only on the transition (R8 / Q11 — silent over-trigger is a usability bug). |
| `new_email` filters | PORT-EXPAND existing trigger | **PORT (with D-OM3)** | Add per-trigger filters (`from`, `subject` + `subjectExactMatch`, `hasAttachment`, `folder`, `importance`). Two design choices: **(a)** filter at notification-receive time in V2 (same as V1) — simple, doesn't restrict subscription resource; **(b)** push folder filter into the subscription `resource` (`/me/mailFolders/{folderId}/messages`) — V1 already does this for folder, others at receive. Recommendation: route folder via subscription resource (matches V1), all others at receive. D-OM3 captures whether `subjectExactMatch` default stays `true` (V1 default — likely fine) and how `hasAttachment: "any" \| "yes" \| "no"` is shaped at config time. |

### Dead handler / orphan

| V1 item | Type | Recommendation | Reasoning |
|---|---|---|---|
| `searchOutlookEmail` | Orphan handler | **SKIP** | Exported, never registered, never declared in manifest. Only referenced in `lib/ai/workflowAI.ts:216` (AI planner prompt). If the V1 planner ever recommended this action, runtime would fail. Same pattern as V1 Gmail's `fetchMessage`/`updateSignature` orphans (V2 Gmail audit recommended SKIP for both). If `fetch_emails` ships per D-OM1, the search use-case is covered through its query mode. |

### Decision counts

- **PORT:** 6 actions (`reply_to_email`, `forward_email`, `create_draft_email`, `move_email`, `delete_email`, `add_categories`) + 2 triggers (`email_sent`, `email_flagged`) = **8 items**.
- **PORT-EXPAND existing handler:** 2 items (`send_email` + attachments via P-O2/P-S3; `new_email` + filters via D-OM3).
- **PORT after platform-gap carry-through:** 1 item (`get_attachment` — depends on P-O2 + P-S3).
- **NEEDS PRODUCT DECISION:** 1 item (`fetch_emails` shape — D-OM1).
- **SKIP:** 1 orphan (`searchOutlookEmail`).

---

## 8. V1 rot / bugs / dead code inventory

V1 rot beyond the master-plan §5 categories. Citations include file paths + LOC.

| ID | Pattern | Status |
|---|---|---|
| **R1** (master) | **Monolithic action file** — `emailActions.ts` 741 LOC holds 8 handlers in one file (`replyToOutlookEmail`, `forwardOutlookEmail`, `createOutlookDraftEmail`, `moveOutlookEmail`, `deleteOutlookEmail`, `addOutlookCategories`, `getOutlookEmails`, `searchOutlookEmail`). | **TO CLOSE on port** — V2 port lands per-action-split (one handler file per action + sibling schema). |
| **R1** (master) | **Mega-route webhook receive** — `app/api/webhooks/microsoft/route.ts` 2475 LOC handles ALL Microsoft Graph notifications for mail + calendar + contacts + Teams + OneDrive + Excel. | **CLOSED in V2** — per-provider routes at [`/api/webhooks/microsoft-outlook/route.ts`](../../../app/api/webhooks/microsoft-outlook/route.ts), [`/api/webhooks/microsoft-outlook-calendar/route.ts`](../../../app/api/webhooks/microsoft-outlook-calendar/route.ts), etc. Each route delegates to its provider's `webhooks/receive.ts`. |
| **R3** (master) | **9-scope mega-list** — `integrationScopes.ts:112-125` requires 9 scopes for any Microsoft Outlook OAuth (User.Read, Mail.Read, Mail.ReadWrite, Mail.Send, Calendars.Read, Calendars.ReadWrite, Contacts.Read, Contacts.ReadWrite, offline_access). Bundles calendar + contacts even when user only wants mail. | **CLOSED in V2** — manifest is mail-only 3 scopes (`offline_access`, `Mail.Send`, `Mail.Read`). Calendar is a sibling provider with its own scopes. |
| **R4** (master) | **Per-provider Microsoft env silos** — `OUTLOOK_CLIENT_ID` / `OUTLOOK_CLIENT_SECRET` distinct from `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET`. Two separate Azure AD app registrations possible. | **CLOSED in V2** — single shared Microsoft Azure AD app via [`_shared/microsoft/oauth.ts`](../../../integrations/_shared/microsoft/oauth.ts). Same env naming as Calendar. |
| **R5** (master) | **Dead handler `searchOutlookEmail`** — exported, never registered. AI planner prompt references it. | **NOT PORTED in V2** — confirmed orphan, recommended SKIP. See §7. |
| **R9** (master) | **Inline `getDecryptedAccessToken` + `refreshMicrosoftToken` on 401** in every V1 handler (8 copies of the same pattern across `emailActions.ts` + `attachmentActions.ts`). | **CLOSED in V2** — handlers use `refreshAndRetry` from `services/oauth/refreshAndRetry.ts` which sources the token centrally. |
| **R10** (master) | **Inconsistent ActionResult shape** — V1 handlers return `{success, output}` with varying field projections. `sendOutlookEmail` returns `{success, output}`; `replyToOutlookEmail` returns `{success, output: { sent, replyAll, originalEmailId, sentAt }}`; `addOutlookCategories` returns `{success, output: { id, categories }}`. Shape drift across the same provider. | **TO CLOSE on port** — V2 port adopts bounded `output: { ... }` per-handler with named fields per the V2 ActionResult contract. |
| **O-R1** | **`searchOutlookEmail` orphan** — exported from `microsoft-outlook/index.ts:13`; AI planner prompt at `lib/ai/workflowAI.ts:216` references `microsoft-outlook_action_search_email`. **Neither manifest nor registry has this action.** If the planner ever recommended it, runtime would fail with "no handler." | Same pattern as V1 Gmail's `fetchMessage` / `updateSignature` orphans. **Recommend SKIP — not ported.** Same logic as Gmail audit. |
| **O-R2** | **Subscription renewal token rot** — `subscriptionManager.ts:303` passes an empty `subscription.accessToken` to the renewal PATCH call. Renewal only succeeded when the in-flight token happened to be fresh; expired-mid-cycle subscriptions silently lapsed. | **CLOSED in V2** — [`renew.ts`](../../../integrations/microsoft-outlook/triggers/newEmail/renew.ts) wraps the renewal call in `refreshAndRetry` so the token is fetched fresh each renewal. Slice 6 plan §"Trigger algorithm" item 3 / "Risk callouts" #3 documents the V1 fix. |
| **O-R3** | **Reply / Forward — no Q7 multi-recipient parsing.** V1's `forwardOutlookEmail:90-105` reads `to` and `cc` from `resolvedConfig` and passes them verbatim to Graph as `toRecipients` / `ccRecipients`. CSV strings become ONE Graph address. Same shape as V1 Gmail's pre-PR-C2 bug. | **TO CLOSE on port** — V2 port routes `to` / `cc` through `parseRecipients` (already in core helpers). |
| **O-R4** | **Q11 hidden defaults** in several handlers: `replyToOutlookEmail.replyAll = false` (destructive default — reply-only is a different UX than reply-all); `forwardOutlookEmail.comment = ''` (UX-only, low-risk); `createOutlookDraftEmail.importance = 'normal'` (Q11 violation — UX-default is acceptable but should be required schema field per V2 convention); `deleteOutlookEmail.permanentDelete = false` (Q11 violation — destructive default; mirror Gmail's `deleteMode` accepted pattern). | **TO CLOSE on port** — V2 port follows Gmail-parity-accepted Q11 explicit-field pattern. `replyAll` required. `importance` required (already true in V2's `sendEmail.schema.ts` — extend pattern to draft). `permanentDelete` becomes Q11 explicit `deleteMode` enum (D-OM2). |
| **O-R5** | **Inline normalization in mega-route.** V1's `app/api/webhooks/microsoft/route.ts` (2475 LOC) inlines payload normalization for all Microsoft Graph triggers — no separate `normalizer.ts` per trigger. Cross-trigger drift risk. | **CLOSED in V2** — per-trigger [`normalize.ts`](../../../integrations/microsoft-outlook/triggers/newEmail/normalize.ts) modules. Each trigger normalizes its own payload independently. |
| **O-R6** | **No per-trigger filter logic** in V1's subscription model — every notification dispatches to ALL workflows matching the (subscription, trigger_type) pair. V1 filters at receive-time inside the mega-route (`route.ts:1180-1250` for new_email filter logic). | **NOT YET REPLICATED in V2** — Slice 6 ships without filters; D-OM3 captures the design decision. |
| **O-R7** | **Email-flagged trigger fires on EVERY message update** with `flag.flagStatus === 'flagged'` — not only on the transition `unflagged → flagged`. Users get spurious fires when they edit the email body or change subject on a flagged email. | **NEW finding** — recommend V2 port implements prior-state-aware filtering (compare incoming notification to last-seen state). Could re-use Slice 5 Google Sheets' snapshot pattern; more likely a per-message-id state cache. Bundle with `email_flagged` PORT decision. |
| **O-R8** | **Single test file.** `__tests__/nodes/outlook-send-email.test.ts` (558 LOC) covers send-email only. No tests for reply/forward/draft/move/delete/categories/fetch/attachment handlers; no tests for any trigger; no tests for webhook receive. Bug-discovery-by-test density: low. | **NOT PORTED** — V2 already ships 17 Outlook + 7 shared Microsoft test suites for the existing surface. Each ported action / trigger will land with full handler + schema + integration test coverage matching V2's pattern. |

No new master-catalog entries surface from this audit — every rot finding fits an existing master row or stays Outlook-specific (O-R1..O-R8).

---

## 9. V2 dependency map

Each parity item's V2 dependencies. Mapped explicitly because Outlook mail has the largest set since Slack.

| Item | API wrapper | Handler shape | Schema shape | Other deps |
|---|---|---|---|---|
| `reply_to_email` | New `integrations/microsoft-outlook/api/replyMessage.ts` (~30 LOC) — POST `/me/messages/{id}/reply` OR `/replyAll`. | New `actions/replyToEmail.ts` (~70 LOC) + sibling schema. `replyAll: boolean` required (Q11). | New Zod schema — `emailId` + `replyAll` + `body` + (after P-S3) optional `attachments` | None new |
| `forward_email` | New `integrations/microsoft-outlook/api/forwardMessage.ts` (~30 LOC) — POST `/me/messages/{id}/forward`. | New `actions/forwardEmail.ts` (~80 LOC). `to` routed through `parseRecipients` (Q7). | New Zod schema — `emailId` + `to` + optional `cc` + `comment` | `parseRecipients` already exists in V2 core (used by `sendEmail`) |
| `create_draft_email` | New `integrations/microsoft-outlook/api/createMessage.ts` (~30 LOC) — POST `/me/messages` (no /send). | New `actions/createDraftEmail.ts` (~80 LOC). | New Zod schema — same shape as `sendEmail` minus the send action | Requires `Mail.ReadWrite` scope (P-O1) |
| `move_email` | New `integrations/microsoft-outlook/api/moveMessage.ts` (~25 LOC) — POST `/me/messages/{id}/move`. | New `actions/moveEmail.ts` (~50 LOC). | New Zod schema — `emailId` + `destinationFolderId` | Requires `Mail.ReadWrite` (P-O1) |
| `delete_email` | New `integrations/microsoft-outlook/api/deleteMessage.ts` (~30 LOC) — DELETE OR POST /move. | New `actions/deleteEmail.ts` (~70 LOC). **Q11 `deleteMode` enum required.** | New Zod schema — `emailId` + `deleteMode: "trash" \| "permanent"` (no default) | Requires `Mail.ReadWrite` (P-O1) |
| `add_categories` | New `integrations/microsoft-outlook/api/patchMessage.ts` (~30 LOC) — PATCH `/me/messages/{id}` with `{ categories }`. | New `actions/addCategories.ts` (~60 LOC). CSV-string-or-array parse via shared helper. | New Zod schema — `emailId` + `categories: string \| string[]` | Requires `Mail.ReadWrite` (P-O1) |
| `fetch_emails` | New `integrations/microsoft-outlook/api/listMessages.ts` (~50 LOC) — GET `/me/messages` or `/me/mailFolders/{id}/messages` with `$select` / `$top` / `$filter` / `$search` semantics. | New `actions/fetchEmails.ts` (~100 LOC). Routes `$search` vs `$filter` mutual-exclusion. | New Zod schema — `folderId?` + `query?` + `maxResults?` + `startDate?` + `endDate?` | None new (Mail.Read in manifest) — **D-OM1 shape decision** |
| `send_email` + attachments | Extend [`api/sendMail.ts`](../../../integrations/microsoft-outlook/api/sendMail.ts) — add `attachments[]` field on the message body | Extend [`actions/sendEmail.ts`](../../../integrations/microsoft-outlook/actions/sendEmail.ts) — accept FileRef[] input | Extend schema with attachments field | P-S3 already shipped; needs P-O2 attachment-model decision |
| `get_attachment` | New `integrations/microsoft-outlook/api/listAttachments.ts` (~25 LOC) + `getAttachment.ts` (~25 LOC) | New `actions/getAttachment.ts` (~120 LOC). Stages each downloaded attachment to `workflow_files` storage via `stageFileToStorage`. Returns `FileRef[]`. | New Zod schema — `emailId` + `downloadMode` + filters | P-S3 carry-through (shipped); P-O2 (`fileAttachment` vs `itemAttachment` payload model) |
| `email_sent` trigger | Reuse Slice 6 lifecycle — only `resource: "/me/mailFolders/SentItems/messages"` differs | Clone of `newEmail/` directory shape — `triggers/emailSent/{activate,deactivate,renew,normalize,index}.ts` (~250 LOC total) | Standard subscription-watch schema | None new |
| `email_flagged` trigger | Same shape as `email_sent` but with `changeType: "updated"` on `/me/messages` + prior-state-aware filter at receive | Clone + extension. Receive-route filter — `flag.flagStatus === 'flagged'` AND prior-state-diff (state cache or notification-time check) | Standard subscription-watch schema | New per-message state cache (D-OM4 captures whether to ship this as flag-only or a generalized prior-state pattern) |
| `new_email` filters | Receive-route extension — filter at receive time (`from`, `subject`, `hasAttachment`, `importance`) + subscription-resource extension for `folder` (push to `/me/mailFolders/{folderId}/messages`) | Extension of existing `newEmail/receive.ts` + `activate.ts` | Extend trigger's config schema | None new — D-OM3 captures the shape choices |

**Required platform gaps** (P-O1, P-O2): scope expansion at manifest level + attachment model design. See §10.

---

## 10. Required platform gaps

### P-O1 — Outlook scope expansion (`Mail.ReadWrite`)

Slice 6 manifest declares `required: ["offline_access", "Mail.Send", "Mail.Read"]`. Five of the eight PORT actions require `Mail.ReadWrite`: `create_draft_email`, `move_email`, `delete_email`, `add_categories`, `get_attachment` (the read-side attachment list is `Mail.Read` but the implementation may need ReadWrite if the workflow stages attachments back).

**Decision needed:** Add `Mail.ReadWrite` to the manifest's `scopes.required` array (single source of truth per Slice 6's honest-state convention) when the lifecycle parity slice ships. Re-auth flow required — existing connected accounts need to grant the new scope.

Mirrors Gmail-parity-accepted P-G1 (Gmail scope expansion `gmail.modify` + `gmail.compose`). Same pattern, smaller surface (Outlook ships one new scope vs. Gmail's two).

**Status:** Open. Lands as the first commit of the lifecycle parity slice (before any handler).

### P-O2 — Microsoft Graph attachment payload model

Microsoft Graph attachments come in three subtypes:
- `#microsoft.graph.fileAttachment` — has `contentBytes: base64` and `contentType`. Standard file.
- `#microsoft.graph.itemAttachment` — embedded message or calendar event. Has `item: { @odata.type, ... }` instead of `contentBytes`.
- `#microsoft.graph.referenceAttachment` — link to OneDrive / SharePoint file. Has `sourceUrl`.

V1's `downloadOutlookAttachment` handles `fileAttachment` (downloads bytes) and `itemAttachment` (metadata only); ignores `referenceAttachment`. V2's port must decide:

- **Decision 1:** Which subtypes to support. Recommendation: `fileAttachment` (port-now) + `itemAttachment` (metadata only, no body fetch — same as V1) + `referenceAttachment` (stretch — fetches the OneDrive/SharePoint file via separate provider call; skip unless concrete demand).
- **Decision 2:** How to express `itemAttachment` as a FileRef. The FileRef contract has 3 kinds (workflow-file, external-url, raw-bytes per Slice 5 P-S3). Embedded messages have no clean fit — either: **(a)** synthesize a FileRef of kind `raw-bytes` with the JSON-serialized item as the body (rough); **(b)** return a non-FileRef metadata object alongside the FileRef array (clean shape, requires output schema extension); **(c)** SKIP `itemAttachment` in V2 — Outlook port only ports `fileAttachment`. Recommendation: **(c)** for the first port, revisit if a workflow needs nested-mail content.

**Status:** Open. Lands as a design doc commit before the attachments / triggers parity slice.

### P-O3 — `delete_email` Q11 explicit-field pattern

V1's `deleteOutlookEmail` defaults `permanentDelete = false` (move to Deleted Items). This is a destructive hidden default — V2 must require an explicit `deleteMode` enum per Gmail-parity-accepted decision #2.

**Decision needed:** Confirm `deleteMode: "trash" | "permanent"` enum shape (D-OM2). Alternative: two separate actions (`delete_email` always trash-or-permanent-by-name + `permanently_delete_email`).

**Status:** Open. Captured as D-OM2 in §15. No platform-level shipping needed — the decision lands at handler-implementation time.

---

## 11. Effort estimate

Comparable to Gmail 2.1 — the closest analog given the shape of the parity gap (8 missing actions + 2 missing triggers + 1 PORT-EXPAND).

| Reference | Approx commit count |
|---|---|
| **Outlook Mail parity** (8 actions + 2 triggers + send_email-expand + get_attachment + new_email-filters) | **~10 commits** total across 3 parity slices |

Slice breakdown:

| Sub-slice | Scope | Commits |
|---|---|---|
| **Outlook Mail 2.1 — Compose & Drafts** | `reply_to_email` + `forward_email` + `create_draft_email` + Mail.ReadWrite scope expansion (P-O1) + `send_email` attachment carry-through (P-O2 + P-S3) | 4 commits |
| **Outlook Mail 2.2 — Lifecycle & Search** | `move_email` + `delete_email` (D-OM2 deleteMode) + `add_categories` + `fetch_emails` (D-OM1 shape) | 3 commits |
| **Outlook Mail 2.3 — Triggers & Attachments** | `email_sent` + `email_flagged` (with prior-state guard) + `new_email` filters (D-OM3) + `get_attachment` (D-OM4 itemAttachment scope) | 3 commits |
| **Outcomes doc** | Standard parity-arc closer | +1 commit |

**Total at the high end if all D-OM* decisions = PORT:** ~11 commits. **Total at the low end if Marcus accepts only core lifecycle actions:** ~6 commits (compose + 3 lifecycle + outcomes).

Per-commit gates run on every commit:
- `npx tsc --noEmit`
- `npm run lint`
- `npm run lint:structure`
- `npm run lint:migrations`
- `npx jest tests/unit/integrations/microsoft-outlook/`
- `npm test`
- (Implementation commits) `CI=1 npx playwright test tests/e2e/slice-6-outlook-mail-walkthrough.spec.ts --workers=1` — extend with new scenarios per commit.

Explicit path staging only — no `git add .`. Unrelated parallel-work files untouched.

---

## 12. Risk estimate

Top 3 risks for the PORT set.

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **R-OM-1** — `email_flagged` trigger fires on every message update with flag-status flagged (O-R7). Without prior-state filtering, workflows trigger spuriously when a flagged email gets its subject edited, body updated, or any other PATCH. | High | Medium | Implement prior-state-aware filter at receive time. Options: **(a)** read-and-cache the prior `flag.flagStatus` for the message-id (requires per-trigger state cache — new table or extend `trigger_resources.config`); **(b)** skip prior-state — fire on any `flag.flagStatus === 'flagged'` update (matches V1 — easier but spurious); **(c)** require the workflow author to filter downstream (handler dispatches every notification; user handles). Recommendation: **(b)** for parity now, **(a)** as a follow-up if user feedback surfaces noise. D-OM4 captures the design decision. |
| **R-OM-2** — `Mail.ReadWrite` scope expansion (P-O1) requires reconnect for every existing connected Outlook account. Users see "permissions changed" prompt. | Medium | Medium | Standard re-auth flow (per Gmail-parity-accepted P-G1). V2 already supports per-provider scope deltas via the manifest change. Communicate via the proactive-health UX (already in V2). Bundle scope expansion as the first commit of the Outlook Mail 2.1 slice so the full surface is available when handlers ship. |
| **R-OM-3** — V2's `send_email` attachments port (P-O2 carry-through) is the first cross-provider use of the P-S3 FileRef contract for an outbound email. Slack 2.4 download proved the read-side flow; this is the first send-side proof. Bugs in `fetchFileBytes` dispatch (workflow-file kind / external-url kind) surface as send-email failures with no clear error class. | Medium | High | Mirror Gmail-parity-design pattern: `sendEmail` accepts `FileRef[]` input, dispatches via `fetchFileBytes` to retrieve bytes per attachment, encodes as base64 in Graph's `fileAttachment` payload. End-to-end test against mocked Graph boundary in `tests/e2e/slice-6-outlook-mail-walkthrough.spec.ts`. Audit-doc covers the failure modes; handler implementation includes per-source-type error mapping. |

No risk warrants splitting the slice further than the 3-batch shape above. No risk warrants a feature flag.

---

## 13. Recommended parity batch plan

A 3-slice / ~10-commit parity arc.

### Outlook Mail 2.1 — Compose & Drafts

| # | Commit | What lands |
|---|---|---|
| 1 | docs | `docs(outlook-mail): plan 2.1 compose and drafts parity` — slice-13-hubspot-style plan doc |
| 2 | feat | `feat(outlook-mail): expand manifest with Mail.ReadWrite scope` — P-O1 scope expansion. Re-auth flag surfaces via proactive-health. |
| 3 | feat | `feat(outlook-mail): add reply, forward, and create_draft actions` — 3 handlers + schemas + tests. `replyAll` Q11-required. `forward.to` via `parseRecipients` Q7. |
| 4 | feat | `feat(outlook-mail): add attachments support to send_email` — FileRef[] input via P-S3 fetch dispatch + base64 encode to Graph `fileAttachment`. P-O2 design-decision applied (fileAttachment-only for first port). |

### Outlook Mail 2.2 — Lifecycle & Search

| # | Commit | What lands |
|---|---|---|
| 5 | docs | `docs(outlook-mail): plan 2.2 lifecycle and search parity` — captures D-OM1 (fetch_emails shape) + D-OM2 (deleteMode) |
| 6 | feat | `feat(outlook-mail): add move, delete, and add_categories actions` — 3 handlers. `delete_email` requires explicit `deleteMode: "trash" \| "permanent"` (Q11). |
| 7 | feat | `feat(outlook-mail): add fetch_emails action` — V1-shape `folder` + `query` + date filters + maxResults. Q4 idempotency NOT required (read-only). |

### Outlook Mail 2.3 — Triggers & Attachments

| # | Commit | What lands |
|---|---|---|
| 8 | docs | `docs(outlook-mail): plan 2.3 triggers and attachments parity` — captures D-OM3 (new_email filters) + D-OM4 (email_flagged prior-state) |
| 9 | feat | `feat(outlook-mail): add email_sent and email_flagged triggers` — 2 new subscription-watch trigger directories. `email_flagged` ships with V1-parity filtering (D-OM4 recommendation b). |
| 10 | feat | `feat(outlook-mail): add per-trigger filters to new_email` — receive-route filter (`from`, `subject`, `subjectExactMatch`, `hasAttachment`, `importance`) + subscription-resource extension for `folder`. |
| 11 | feat | `feat(outlook-mail): add get_attachment action` — `fileAttachment` download with FileRef[] output. `itemAttachment` SKIPped per P-O2 recommendation. |

### Outcomes doc

| # | Commit | What lands |
|---|---|---|
| 12 | docs | `docs(outlook-mail): document parity outcomes` — standard parity-arc closer per the Sheets 2.3 / Stripe 2.1 / HubSpot 2.1 template. |

---

## 14. Exit checklist

This audit is complete when Marcus has confirmed:

- [ ] The 8-item PORT set (6 actions + 2 triggers) is correct.
- [ ] The 3-item PORT-EXPAND set (`send_email` + attachments; `new_email` + filters; `get_attachment` after P-O2) is correct.
- [ ] D-OM1 (`fetch_emails` shape — V1-shape vs. fold-into-future-search_emails) has a direction.
- [ ] D-OM2 (`delete_email` shape — Q11 `deleteMode` enum vs. two separate actions) has a direction.
- [ ] D-OM3 (`new_email` filter design — receive-time vs. subscription-resource for folder, plus `hasAttachment` shape) has a direction.
- [ ] D-OM4 (`email_flagged` prior-state — V1-parity over-fire vs. prior-state cache) has a direction.
- [ ] P-O1 (Outlook scope expansion to `Mail.ReadWrite`) lands at the start of Outlook Mail 2.1.
- [ ] P-O2 (attachment subtype scope — `fileAttachment` first, `itemAttachment` / `referenceAttachment` deferred) is correct.
- [ ] O-R1..O-R8 rot findings are accurate.
- [ ] The 3-slice / ~10-commit batch plan matches Marcus's sizing preference.
- [ ] `searchOutlookEmail` orphan SKIP is correct.

**Implementation does NOT begin before Marcus accepts this audit and resolves D-OM1 through D-OM4.**

---

## 15. Open decisions for Marcus

Outlook mail's audit produces 4 open decisions.

### D-OM1 — `fetch_emails` shape

V1 ships `microsoft-outlook_action_fetch_emails` with config `folderId?` + `query?` + `startDate?` + `endDate?` + `maxResults?`. The Gmail-parity-accepted pattern folds `searchEmails` + `advancedSearch` into one query-builder action with `searchEmails` as the entry. Outlook has the same parity question.

Three options:

- **(a) Ship V1-shape `fetch_emails`.** Mirrors V1 exactly. Simplest port. Can be unified later with a future `search_emails` if both providers ship full search.
- **(b) Fold into a future `search_emails`.** Defer `fetch_emails` until a Gmail-style `search_emails` action is designed cross-provider. Longest wait but cleanest end-state.
- **(c) Ship as `search_emails` from day one** with query-builder shape. Different from V1; matches Gmail's accepted shape.

**Recommendation: (a) SHIP V1-SHAPE.** Outlook users already know `fetch_emails`; renaming would surprise them. Cross-provider unification can happen later as a Phase 5 / Phase 7 cleanup if needed.

### D-OM2 — `delete_email` shape

V1's `deleteOutlookEmail` defaults `permanentDelete = false`. Q11 violation — V2 must require explicit. Gmail-parity-accepted: `deleteMode: "trash" | "permanent"` enum or two-separate-actions split.

Three options:

- **(a) Single action with required `deleteMode` enum.** `deleteMode: "trash" | "permanent"` — no default. Two-mode action in one handler.
- **(b) Two separate actions.** `delete_email` (always trash) + `permanently_delete_email`. Cleaner UX in builder (action title states intent). Slightly more registry surface.
- **(c) Keep V1 boolean shape.** Reject — Q11 violation; not on the table.

**Recommendation: (a) ENUM** for parity with Gmail's accepted shape (Gmail audit §"Accepted decisions" #2 explicitly accepts both (a) and (b); Outlook should match whichever Gmail 2.1 lands).

### D-OM3 — `new_email` filter design

V1 supports 6 per-trigger filters: `from`, `subject` + `subjectExactMatch`, `hasAttachment` (`any` / `yes` / `no`), `folder`, `importance` (`any` / `high` / `normal` / `low`).

Design choices:

- **Where to filter `folder`.** V1 routes folder into the subscription resource path (`/me/mailFolders/{folderId}/messages`). This narrows what Graph notifies. Alternative: leave subscription resource at `/me/messages` and filter at receive. Recommendation: **route folder via subscription resource** (matches V1; lower bandwidth; same semantics).
- **Where to filter the others.** All at notification-receive time. Receive route fetches the full message (already does this for body inclusion) and applies filters before dispatch. Recommendation: **receive-time filtering**.
- **`subjectExactMatch` default.** V1 defaults `true`. Recommendation: **keep `true`** (matches V1 user expectation; case-insensitive exact match is the safe default).
- **`hasAttachment` shape.** V1 is enum-of-3 (`any` / `yes` / `no`). Alternative: `boolean | "any"`. Recommendation: **enum** (clearer semantics).
- **`importance` shape.** V1 is enum-of-4 (`any` / `high` / `normal` / `low`). Recommendation: keep.

**Recommendation:** SHIP all 5 filters at notification-receive time except `folder` which routes via subscription resource. V1 shape for `subjectExactMatch` / `hasAttachment` / `importance` defaults preserved.

### D-OM4 — `email_flagged` prior-state

V1 fires `email_flagged` on every message update where `flag.flagStatus === 'flagged'` — including when the email is edited, subject changed, etc. Over-fires.

Three options:

- **(a) V1-parity over-fire.** Ship as V1 does — every update with flag-status flagged dispatches. Simplest. Workflow author handles downstream if noise is a problem.
- **(b) Per-message state cache.** Track each message's last-seen `flag.flagStatus` in a cache (new table or extend `trigger_resources.config` with a bounded LRU). Fire only on transition from non-flagged to flagged. Correct; non-trivial.
- **(c) Time-window heuristic.** Fire if the email's `flag.completedDateTime` is within N minutes of `now` AND `flag.flagStatus === 'flagged'`. Cheaper than state cache; heuristic.

**Recommendation: (a) V1-PARITY for the first port.** If workflow authors report noise, revisit with (b) as a follow-up slice. The fix is contained — receive-route extension; no schema change.

---

## 16. What happens after this audit is accepted

This audit is doc-only. After Marcus accepts:

1. **Outlook Mail 2.1 slice opens.** Per the batch plan in §13, the first slice ships Compose & Drafts (4 commits).
2. **D-OM1..D-OM4 decisions are resolved** before the corresponding slice begins. Each slice's plan doc captures its decisions.
3. **P-O1 scope expansion lands** as the first commit of Outlook Mail 2.1, before any handler.
4. **CLAUDE.md gains a "Outlook Mail parity" entry** when 2.1 lands, with subsequent entries when 2.2 and 2.3 ship.

The next provider audit in priority order is **Google Calendar / Drive / OneDrive** (rank-not-yet-set per phase-2-plan §3 — audit on demand). With Outlook Mail closed, every Phase 1 priority-ranked provider has an accepted parity audit. **Mailchimp remains active in another chat — do not start.**
