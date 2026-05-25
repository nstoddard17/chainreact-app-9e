# Outlook Mail 2.3 — Triggers & Attachments plan

**Status:** Plan. **Doc-only commit (Commit 1 of 5).**
**Slice:** Outlook Mail 2.3 — Triggers & Attachments.
**Parent audit:** [`docs/slices/parity/parity-outlook-mail.md`](parity-outlook-mail.md) — commit `c4c779973`, accepted 2026-05-15.
**Prior slices:** [`outlook-mail-2-1-outcomes.md`](outlook-mail-2-1-outcomes.md) + [`outlook-mail-2-2-outcomes.md`](outlook-mail-2-2-outcomes.md).
**Branch:** `v2-provider-port-local` (local-only).
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`.
**V2 baseline:** [`integrations/microsoft-outlook/`](../../../integrations/microsoft-outlook/) (Slice 6 + Outlook Mail 2.1 + 2.2).

This is the third and final parity slice for Outlook Mail. 2.3 ships:

1. **`email_sent` trigger** — subscription-watch on `/me/mailFolders/SentItems/messages` with `changeType: created`.
2. **`email_flagged` trigger** — subscription-watch on `/me/messages` with `changeType: updated`, receive-time filter on `flag.flagStatus`.
3. **`new_email` per-trigger filter expansion** — all 5 V1 filters (`from`, `subject` + `subjectExactMatch`, `hasAttachment`, `folder`, `importance`). Folder via subscription resource; the rest at receive-time.
4. **`get_attachment` action** — `fileAttachment`-only download with `FileRef[]` output via `stageFileToStorage` (P-S3).

After 2.3 lands, V2's Outlook Mail surface is **9 actions + 3 triggers** vs. V1's 9+3. The V1 `searchOutlookEmail` orphan stays permanent SKIP (audit §7 confirmed in 2.2 outcomes); Phase 1 parity for Outlook Mail closes here.

---

## 1. Accepted Outlook Mail 2.1 + 2.2 summary

### 2.1 — Compose & Drafts (shipped)

| Surface | Notes |
|---|---|
| `reply_to_email` | `replyAll` REQUIRED (Q11); `/reply` vs `/replyAll` switch in wrapper. |
| `forward_email` | `parseRecipients` on `to`/`cc` (Q7); `comment` optional, omitted when absent. |
| `create_draft_email` | `isHtml` + `importance` REQUIRED (Q11). Output exposes `draftId` + `webLink`. |
| `send_email` attachments | `FileRef[]` only; `fileAttachment` shape; 3 MB/25 MB caps; signed_url + v2_storage kinds supported; `provider_url` rejected. |
| P-O1 — `Mail.ReadWrite` scope | Added to the 4-scope mail-only manifest. Existing accounts reconnect via proactive-health. |
| `createWorkflowFilesStorageAdapter` | New reusable FileRef-consumer helper at `services/files/`. Reused by 2.3 `get_attachment`. |

### 2.2 — Lifecycle & Search (shipped)

| Surface | Notes |
|---|---|
| `move_email` | POST `/me/messages/{id}/move`. Output exposes Graph-re-keyed `newId`. |
| `delete_email` | REQUIRED `deleteMode: "trash" \| "permanent"`. trash → move to `deleteditems`. permanent → DELETE. Boolean / boolean-string V1 inputs rejected. |
| `add_categories` | PATCH `/me/messages/{id}` with PATCH-replace semantics (V1-parity). CSV-or-array input via shared `parseCsvList`. |
| `fetch_emails` | V1-shape (`folderId? + query? + startDate? + endDate? + maxResults?`). Single-page (1..50). `$filter` vs `$search` mutual-exclusion routed inside the wrapper. `ConsistencyLevel: eventual` unconditional. Bounded output with `| null` on Graph-optional fields. |
| `parseCsvList` | New shape-agnostic CSV helper at `core/integrations/`. `parseRecipients` delegates. |

State entering 2.3:
- V2 Outlook Mail actions: **8** (send_email + reply_to_email + forward_email + create_draft_email + move_email + delete_email + add_categories + fetch_emails).
- V2 Outlook Mail triggers: **1** (new_email — Slice 6 baseline; no filter config).
- Required scopes: **4** (`offline_access`, `Mail.Send`, `Mail.Read`, `Mail.ReadWrite`).
- E2E: `slice-6-outlook-mail-walkthrough.spec.ts` — 12/12 passing twice consecutively.
- Full jest: 695 suites / 7084 tests passing.

2.3 adds neither scope nor manifest changes — every endpoint exercises scopes already declared.

---

## 2. Outlook Mail 2.3 scope

Four V1 surfaces close:

| # | V1 key | V2 type | Endpoint / dispatch |
|---|---|---|---|
| 1 | `microsoft-outlook_trigger_email_sent` | `email_sent` trigger | Graph subscription on `/me/mailFolders/SentItems/messages`, `changeType: created` |
| 2 | `microsoft-outlook_trigger_email_flagged` | `email_flagged` trigger | Graph subscription on `/me/messages`, `changeType: updated`; receive-time `flag.flagStatus` filter |
| 3 | `microsoft-outlook_trigger_new_email` (filter expansion) | `new_email` trigger | Existing Slice 6 lifecycle; activate accepts `folder` config (routes into subscription resource); receive-route applies `from` / `subject` + `subjectExactMatch` / `hasAttachment` / `importance` filters |
| 4 | `microsoft-outlook_action_get_attachment` | `get_attachment` action | GET `/me/messages/{id}/attachments` + per-attachment GET, returns `FileRef[]` via `stageFileToStorage` |

V1 surface explicitly NOT closed by 2.3 (deferred indefinitely or permanently skipped — see §13):

- `searchOutlookEmail` orphan — permanent SKIP.
- Upload-session flow for >3 MB single / >25 MB total (carry-forward from 2.1).
- `itemAttachment` + `referenceAttachment` body materialization (P-O2 SKIP).
- `email_flagged` prior-state cache (D-OM4: revisit only if users report noise).
- Cross-provider `search_emails` unification with Gmail.
- Outlook Calendar / Contacts surface (separate provider in V2; out of scope).

After 2.3 lands, V2 Outlook Mail = **9 actions + 3 triggers** (parity with V1's 9+3 modulo the permanent orphan SKIP).

---

## 3. `email_sent` trigger plan

### Subscription resource + change type

- **Resource:** `/me/mailFolders/SentItems/messages` (well-known folder name; Graph accepts the path verbatim).
- **Change type:** `created`. Graph emits a `created` event for each message moved into the SentItems folder, which is how it represents "an email was sent" (Outlook copies the outgoing message into SentItems immediately after sendMail succeeds).
- **clientState + lifecycle notification URL:** identical to new_email's Slice 6 lifecycle — 32 random bytes hex; `MICROSOFT_GRAPH_WEBHOOK_URL`/`NEXT_PUBLIC_APP_URL` env routing.
- **Expiration:** 4230 minutes (Outlook /me/messages max — same as new_email). 1h renewal threshold.
- **Required scope:** `Mail.Read` (already in manifest). V1 declared `Mail.Send` as the required scope, but Graph subscriptions on a Mail folder only need `Mail.Read` for *receiving* notifications — the workflow author doesn't send mail from this trigger. V2 corrects the V1 mistake.

### Directory layout (mirrors `newEmail/`)

```
integrations/microsoft-outlook/triggers/emailSent/
  ├── activate.ts          # POST /v1.0/subscriptions on SentItems
  ├── deactivate.ts        # DELETE /v1.0/subscriptions/{id}
  ├── renew.ts             # PATCH /v1.0/subscriptions/{id} on 1h threshold
  ├── normalize.ts         # GraphMessage → TriggerEvent ("email_sent" type)
  └── index.ts             # module-init registrations
```

### Receive-route dispatch

The existing `integrations/microsoft-outlook/webhooks/receive.ts` is **extended, not duplicated**:

- Loop over `notifications` (unchanged).
- Look up the trigger row by `subscriptionId` (unchanged).
- Verify clientState (unchanged).
- Fetch the message via `getMessage` (unchanged).
- **NEW:** Determine the trigger's eventType (`new_email`, `email_sent`, or `email_flagged`) from the trigger row's `eventType` column — NOT from the notification envelope.
- **NEW:** Apply per-trigger receive-time filters (see §5 for `new_email`, see §4 for `email_flagged`). `email_sent` has 3 V1 filters too — see "Filter logic" below.
- Normalize via the per-trigger `normalize.ts`. Each trigger ships its own normalize because the output schema differs (e.g. `email_sent` has `sentDateTime`, not `receivedDateTime`).

### `email_sent` config + filter logic

V1 config (`outlookTriggerEmailSent.configSchema`):

| Field | Type | Required | V1 default | Notes |
|---|---|---|---|---|
| `to` | string (email or CSV) | **YES** in V1 | — | Filter sent emails by recipient address. Receive-time match against `email.toRecipients[].emailAddress.address`. |
| `subjectExactMatch` | boolean | no | `true` | When true, case-insensitive exact match; when false, substring match. |
| `subject` | string | no | — | Subject filter (substring or exact per `subjectExactMatch`). |

V2 schema decision: **`to` is OPTIONAL** in V2 (V1 marked it required, but V1's mega-route only filters when `triggerConfig.to` is set). Treating `to` as optional matches the actual V1 dispatch behavior; making it required would be a tightening that breaks V1 workflows missing the field. CSV-or-array shape via `parseCsvList` post-parse.

`subjectExactMatch` defaults to `true` (D-OM3 accepted — preserve V1 default).

### `normalize.ts` payload shape

```ts
{
  provider: "microsoft-outlook",
  eventType: "email_sent",
  eventId: `${subscriptionId}:${messageId}:${changeType}`,
  occurredAt: <message.sentDateTime ?? message.lastModifiedDateTime ?? notificationOccurredAt>,
  accountId: <integration.providerAccountId>,
  payload: {
    messageId,
    conversationId,
    subject,
    bodyPreview,
    body: { contentType: "html"|"text", content },
    from,
    to: [...],
    cc: [...],
    bcc: [...],
    sentDateTime,     // not receivedDateTime — load-bearing distinction vs new_email
    hasAttachments,
    importance,
    webLink,
  },
}
```

### Dedup / eventId

Same shape as `new_email` (Slice 6 plan §"Dedup key shape"): `${subscriptionId}:${messageId}:${changeType}`. The change type for `email_sent` is always `"created"`, so the dedup key collapses to `${subId}:${msgId}:created` per fire. `webhook_event_dedup` keys on `(provider, eventId)` — `email_sent` and `new_email` cannot collide because the subscriptionId differs (each lifecycle creates a distinct Graph subscription per workflow).

---

## 4. `email_flagged` trigger plan

### Subscription resource + change type

- **Resource:** `/me/messages` (folder filter optional — when set, routes to `/me/mailFolders/{folderId}/messages`; same V1 behavior).
- **Change type:** `updated`. Flag changes are message updates; Graph does not have a dedicated "flagged" event type.
- **Expiration:** 4230 minutes; 1h renewal threshold.
- **Required scope:** `Mail.Read`.

### D-OM4 — V1-parity over-fire, no prior-state cache

The trigger fires on ANY update where `flag.flagStatus === "flagged"`. V1 does NOT distinguish "newly flagged" from "already flagged but had subject edited" — both fire. V2 ships the SAME over-fire behavior:

- **No per-message state cache.** No new database table. No JSONB-stored last-seen-state.
- **Receive-time check:** after fetching the full message, the receive route applies `flag.flagStatus !== "flagged"` → skip. Workflow authors who hit noise downstream can apply their own dedup.
- **Re-visit trigger:** if real workflow authors report noise, revisit with state cache as a follow-up slice. Not 2.3.

This trades correctness for simplicity. The trade is explicit (audit §15 D-OM4 accepted (a)).

### Directory layout

```
integrations/microsoft-outlook/triggers/emailFlagged/
  ├── activate.ts
  ├── deactivate.ts
  ├── renew.ts
  ├── normalize.ts
  └── index.ts
```

### `email_flagged` config

V1 config has ONE field — `folder` (optional). V2 matches:

| Field | Type | Required | V1 default | Notes |
|---|---|---|---|---|
| `folder` | string | no | — | When set, routes subscription resource to `/me/mailFolders/{folderId}/messages`. When absent, watches all folders. |

### Receive-time detection logic

Inside the existing receive route's per-notification loop:

```ts
// (after getMessage)
const triggerEventType = trigger.eventType; // "email_flagged"
if (triggerEventType === "email_flagged") {
  const flagStatus = message.flag?.flagStatus ?? "notFlagged";
  if (flagStatus !== "flagged") {
    // Skip — message update was unrelated to flag state.
    continue;
  }
  // else: fire, knowing this might be a re-flag or an unrelated update
  // to an already-flagged message. D-OM4 accepted over-fire.
}
```

`message.flag` is on the Graph envelope; we need to extend `GraphMessage` in [`integrations/microsoft-outlook/api/getMessage.ts`](../../../integrations/microsoft-outlook/api/getMessage.ts) to include the optional `flag: { flagStatus?, completedDateTime?, dueDateTime?, startDateTime? }` shape.

### `normalize.ts` payload shape

```ts
{
  provider: "microsoft-outlook",
  eventType: "email_flagged",
  eventId: `${subscriptionId}:${messageId}:${changeType}`,
  occurredAt: <message.lastModifiedDateTime ?? message.receivedDateTime ?? notificationOccurredAt>,
  accountId: <integration.providerAccountId>,
  payload: {
    messageId,
    conversationId,
    subject,
    bodyPreview,
    body: { contentType, content },
    from,
    to: [...],
    cc: [...],
    receivedDateTime,
    hasAttachments,
    importance,
    webLink,
    flag: {
      flagStatus: "flagged",  // load-bearing — guaranteed after receive-time filter
      completedDateTime: string | null,
      dueDateTime: string | null,
      startDateTime: string | null,
    },
  },
}
```

### Dedup / eventId

Same shape: `${subscriptionId}:${messageId}:${changeType}`. The change type for `email_flagged` is always `"updated"`. **Multiple flagged-status updates on the same message DO produce distinct events** — they share `messageId` but Graph generates separate notifications, each carrying its own envelope with its own `eventId` value through `webhook_event_dedup`'s `(provider, eventId)` UNIQUE — and the eventId itself doesn't change, so the dedup table SUPPRESSES the second fire.

This is the over-fire edge case D-OM4 names: V2 dedup PROTECTS against re-fires of the exact same notification but does NOT distinguish "flagged then unflagged then re-flagged" from "flagged with no state change." The dedup row is keyed off the eventId we construct, which is identical for repeated updates to the same message — so retries / duplicate notification deliveries collapse correctly, but workflow authors who actively un-flag-and-re-flag a message see one trigger fire only.

Documented trade-off: this is slightly LESS noisy than V1's behavior (V1 fires on every update). Workflow authors who want every flag transition need to either (a) wait for the post-2.3 prior-state-cache slice OR (b) include a no-op nonce in the dedup key. Both out of scope.

---

## 5. `new_email` filter expansion plan

### D-OM3 — 5 V1 filters, mixed routing

All 5 V1 filters port:

| Field | Type | Where applied | V1 default |
|---|---|---|---|
| `folder` | string | **Subscription resource** — `/me/mailFolders/{folderId}/messages` (V1 parity; lower bandwidth than receive-time filter) | — |
| `from` | string (single email) | Receive-time: `email.from?.emailAddress?.address?.toLowerCase().trim() === config.from.toLowerCase().trim()` | — |
| `subject` | string | Receive-time: substring (case-insensitive) when `subjectExactMatch === false`, exact-match (case-insensitive) when `subjectExactMatch === true` | — |
| `subjectExactMatch` | boolean | Receive-time: gates `subject` behavior | `true` |
| `hasAttachment` | enum `"any" \| "yes" \| "no"` | Receive-time: skip on mismatch when set to `yes` or `no`; `any` means no filter | `"any"` |
| `importance` | enum `"any" \| "high" \| "normal" \| "low"` | Receive-time: skip on mismatch when set to non-`any`; `any` means no filter | `"any"` |

V1 defaults preserved per D-OM3.

### Strict schema

`integrations/microsoft-outlook/triggers/newEmail/configSchema.ts` (new file — currently Slice 6 ships no schema for new_email config because the trigger had no filters):

```ts
export const NewEmailTriggerConfigSchema = z
  .object({
    folder: z.string().min(1).optional(),
    from: z.string().min(1).optional(),
    subject: z.string().optional(),  // may be empty string + nonexistent are equivalent
    subjectExactMatch: z.boolean().default(true),
    hasAttachment: z.enum(["any", "yes", "no"]).default("any"),
    importance: z.enum(["any", "high", "normal", "low"]).default("any"),
  })
  .strict();
```

**Strict mode** rejects unknown fields. Default-having fields apply Zod defaults; missing-value handling: `subjectExactMatch`/`hasAttachment`/`importance` always resolve to their defaults, `folder`/`from`/`subject` stay `undefined`.

### Activation: `folder` config routes into subscription resource

`integrations/microsoft-outlook/triggers/newEmail/activate.ts` gains a `config` param read (the `ActivationFn` already receives `config` via the lifecycle service). When `config.folder` is set, the subscription resource becomes `/me/mailFolders/{folder}/messages`; otherwise `/me/messages` (current Slice 6 default).

This is V1-parity (V1's MicrosoftGraphTriggerLifecycle line 531-537 does the same routing). The `folder` ends up in the persisted `trigger_resources.config.resource` (the activate result) so the receive route can verify per-notification that the message's `parentFolderId` matches (defense in depth — Graph should only push notifications for the subscribed resource, but the receive-time check guards against subscription-resource-drift bugs and against legitimate moves into a different folder mid-flight).

### Receive-time filter logic

Inside `receive.ts`'s per-notification loop, after `getMessage` succeeds and BEFORE `normalize`:

```ts
// (new) parse trigger config through the schema:
const triggerConfig = NewEmailTriggerConfigSchema.parse(trigger.config);

// `from` filter
if (triggerConfig.from) {
  const expected = triggerConfig.from.toLowerCase().trim();
  const actual = message.from?.emailAddress?.address?.toLowerCase().trim() ?? "";
  if (actual !== expected) continue;
}

// `subject` filter
if (triggerConfig.subject) {
  const expected = triggerConfig.subject.toLowerCase().trim();
  const actual = (message.subject ?? "").toLowerCase().trim();
  if (triggerConfig.subjectExactMatch) {
    if (actual !== expected) continue;
  } else {
    if (!actual.includes(expected)) continue;
  }
}

// `hasAttachment` filter (any | yes | no)
if (triggerConfig.hasAttachment !== "any") {
  const expectsAttachment = triggerConfig.hasAttachment === "yes";
  const has = message.hasAttachments === true;
  if (expectsAttachment !== has) continue;
}

// `importance` filter (any | high | normal | low)
if (triggerConfig.importance !== "any") {
  const actual = (message.importance ?? "normal").toLowerCase();
  if (actual !== triggerConfig.importance) continue;
}
```

### Backward compatibility — Slice 6 zero-filter workflows still work

The schema's defaults handle the empty-config case verbatim. A Slice 6 workflow with `trigger.config = { type: "subscription-watch", subscriptionId: "...", clientState: "...", resource: "/me/messages", changeType: "created", expiresAt: "..." }` (which contains NO filter fields) parses cleanly — the trigger-level filter schema operates over a SUBSET of the config keys via `strict: false` schema OR by extracting only the filter keys before parsing.

**Decision:** parse a separate `filterFields` object extracted from the trigger row's config:

```ts
const triggerConfig = NewEmailTriggerConfigSchema.parse({
  folder: config.folder,
  from: config.from,
  subject: config.subject,
  subjectExactMatch: config.subjectExactMatch,
  hasAttachment: config.hasAttachment,
  importance: config.importance,
});
```

This avoids `.strict()` rejecting the non-filter subscription state (`subscriptionId`, `clientState`, etc.). Filter-only schema; subscription-state plumbing stays as it is today.

---

## 6. `get_attachment` action plan

### Accepted scope (per audit + Marcus acceptance)

P-O2 disposition stands:

| Graph subtype | 2.3 disposition |
|---|---|
| `#microsoft.graph.fileAttachment` | **PORT** — download bytes, stage to P-S3 storage, return `FileRef(kind=v2_storage)`. |
| `#microsoft.graph.itemAttachment` | **SKIP** — log-and-continue. Returns metadata-only entry with `skipped: true` flag + reason. |
| `#microsoft.graph.referenceAttachment` | **SKIP** — log-and-continue. Same shape as itemAttachment. |

### No inline bytes / base64 in output

The CLAUDE.md rule #1 enforced end-to-end:

- Output's `attachments[]` field carries `FileRef[]` for ported `fileAttachment` subtypes (FileRef points at `workflow_files` storage; no `content` / `contentBytes` field on the FileRef shape).
- Skipped subtypes carry a tiny metadata stub (no content, just `id`/`name`/`contentType`/`size`/`subtype`/`skipped: true`/`reason: string`).
- Handler unit test pins NO `contentBytes` / `content` / `data` / `bytes` / `base64` key anywhere in `attachments[]` entries.

### Two-call Graph protocol

V1 protocol preserved:

1. **List attachments:** `GET /me/messages/{id}/attachments` → returns `{ value: AttachmentMetadata[] }` where each item has `id` + `name` + `contentType` + `size` + `@odata.type` + (for fileAttachment) `contentBytes`. **The list call typically returns enough metadata to skip the per-id download for fileAttachments smaller than 4 MB.** V1 STILL issues per-id GETs even when metadata is present — the per-id endpoint guarantees consistent `contentBytes` regardless of payload size. V2 follows the same pattern for safety.
2. **Per-attachment download:** for each attachment in the filtered list, `GET /me/messages/{id}/attachments/{attId}` → returns full envelope with `contentBytes` (base64 string).

For SKIP subtypes, the per-id GET is **NOT** issued — only metadata from the list call is preserved on the output stub.

### Schema

| Field | Type | Required | Notes |
|---|---|---|---|
| `emailId` | string (non-empty) | yes | Graph message id. |
| `downloadMode` | enum `"all" \| "by_extension" \| "by_name"` | no, default `"all"` | Filter mode. Non-high-risk schema default per Q11. |
| `fileExtensions` | string (CSV) OR array | only required when `downloadMode === "by_extension"` | Comma-separated extensions (e.g. `"pdf,docx"`); leading dots stripped. CSV-or-array via `parseCsvList`. |
| `fileNameFilter` | string | only required when `downloadMode === "by_name"` | Case-insensitive substring match against attachment `name`. |
| `excludeInline` | boolean | no, default `true` | Skip attachments where `isInline === true` (matches V1 default). |

Conditional-required fields enforced via Zod `.superRefine` or `.refine` against the discriminated union of `downloadMode`. The shipping shape will use a strict object + post-parse handler validation rather than discriminated union to keep the schema small and tests focused on the runtime behavior.

### Bounded output

```ts
{
  attachments: Array<
    | {
        // fileAttachment — bytes staged to storage
        kind: "v2_storage";
        file: V2StorageFileRef;
        id: string;
        name: string;
        contentType: string;
        size: number;
        subtype: "fileAttachment";
        skipped: false;
      }
    | {
        // itemAttachment / referenceAttachment — metadata only
        id: string;
        name: string;
        contentType: string;
        size: number;
        subtype: "itemAttachment" | "referenceAttachment";
        skipped: true;
        reason: string;  // e.g. "itemAttachment subtype not supported"
      }
  >;
  count: number;            // total entries returned (ported + skipped)
  downloadedCount: number;  // ported only — convenient for downstream branching
  totalSize: number;        // sum of `size` across all entries (ported + skipped)
}
```

Handler unit test pins no `contentBytes` / `content` / `bytes` / `base64` key anywhere in the output.

### `excludeInline` default + V1-parity behavior

V1 defaults `excludeInline = true` — inline attachments (embedded images in HTML email bodies) are typically not what the workflow author wants. V2 preserves the default. Q11 says "no high-risk hidden defaults"; `excludeInline` is non-high-risk (bounds output, doesn't drive a side effect) so a schema default is acceptable.

### Per-attachment failure policy

V1: failed downloads (4xx/5xx on the per-id GET) `continue` — logged + skipped. The overall action SUCCEEDS even when some attachments fail.

V2: matches V1. Per-attachment errors are logged via `console.warn` (sterile — never echo URL or token). The handler does NOT throw on individual failures unless EVERY attachment failed (in which case the handler throws `Error("get_attachment: all attachments failed to download")`).

Token decrypt + integration lookup happens ONCE at handler entry (same pattern as Slack `download_file`). Per-attachment fetches reuse the same decrypted token via `refreshAndRetry`; the principal call is the LIST call (it's the one that drives the 401-refresh-retry cycle). Per-attachment downloads also wrap in `refreshAndRetry` for individual auth recovery.

### Q-contracts applied

- **Q3** — both the LIST call and each per-attachment GET wrap in `refreshAndRetry`. A 401 on any individual call refreshes the token and retries that call once.
- **Q4** — N/A (read-only action; no side effect to dedupe).
- **Q11** — `downloadMode` defaults to `"all"` (non-high-risk; bounds output); `excludeInline` defaults to `true` (non-high-risk; matches V1 user expectation).

### Scope: `Mail.Read` (already in manifest)

`get_attachment` only reads. `Mail.ReadWrite` is a superset and works too; either grant suffices.

---

## 7. API wrapper plan

Three new wrapper files + 1 extension.

### 7.1 New: `integrations/microsoft-outlook/api/listAttachments.ts`

```ts
export interface AttachmentMetadata {
  id: string;
  name?: string;
  contentType?: string;
  size?: number;
  isInline?: boolean;
  "@odata.type": string;
  // fileAttachment may include contentBytes here too, but the wrapper
  // doesn't depend on it — the handler always issues the per-id GET
  // for consistency.
}

export interface ListAttachmentsInput {
  accessToken: string;
  messageId: string;
}

export interface ListAttachmentsResult {
  value: AttachmentMetadata[];
}

export async function listAttachments(
  input: ListAttachmentsInput,
): Promise<ListAttachmentsResult>;
```

~50 LOC. Standard `Unauthorized401Error` / `surfaceGraphError` shape.

### 7.2 New: `integrations/microsoft-outlook/api/getAttachment.ts`

```ts
export interface GraphFileAttachmentEnvelope {
  "@odata.type": "#microsoft.graph.fileAttachment";
  id: string;
  name: string;
  contentType: string;
  size: number;
  contentBytes: string;  // base64
  isInline?: boolean;
  lastModifiedDateTime?: string;
}

export interface GraphItemAttachmentEnvelope {
  "@odata.type": "#microsoft.graph.itemAttachment";
  id: string;
  name?: string;
  contentType?: string;
  size?: number;
  item?: { "@odata.type"?: string };
}

export interface GraphReferenceAttachmentEnvelope {
  "@odata.type": "#microsoft.graph.referenceAttachment";
  id: string;
  name?: string;
  contentType?: string;
  size?: number;
  sourceUrl?: string;
}

export type GraphAttachmentEnvelope =
  | GraphFileAttachmentEnvelope
  | GraphItemAttachmentEnvelope
  | GraphReferenceAttachmentEnvelope;

export interface GetAttachmentInput {
  accessToken: string;
  messageId: string;
  attachmentId: string;
}

export async function getAttachment(
  input: GetAttachmentInput,
): Promise<GraphAttachmentEnvelope>;
```

~70 LOC. Returns the full Graph envelope (discriminated union on `@odata.type`); handler dispatches on subtype.

### 7.3 New: `integrations/microsoft-outlook/api/subscriptions.ts` — EXTEND only

The existing shared `_shared/microsoft/api/subscriptions.ts` already supports any `resource` + `changeType` string. No new wrapper needed for the email_sent / email_flagged subscriptions; they reuse `createSubscription` / `renewSubscription` / `deleteSubscription`.

### 7.4 Extend: `integrations/microsoft-outlook/api/getMessage.ts`

Extend `GraphMessage` interface with the optional `flag` field for `email_flagged`'s receive-time filter + normalize:

```ts
export interface GraphMessageFlag {
  flagStatus?: "notFlagged" | "flagged" | "complete";
  completedDateTime?: { dateTime: string; timeZone?: string };
  dueDateTime?: { dateTime: string; timeZone?: string };
  startDateTime?: { dateTime: string; timeZone?: string };
}

export interface GraphMessage {
  // ...existing fields...
  flag?: GraphMessageFlag;
  parentFolderId?: string;
  lastModifiedDateTime?: string;
  sentDateTime?: string;  // already present
}
```

Type-only change. No new fetch / no new endpoint. ~15 LOC delta.

---

## 8. Schema/handler plan

### 8.1 New trigger directories (2 net-new)

| File | LOC est. | Purpose |
|---|---|---|
| [`integrations/microsoft-outlook/triggers/emailSent/{activate,deactivate,renew,normalize,index}.ts`](../../../integrations/microsoft-outlook/triggers/) | ~250 total | Clone of `newEmail/` with: `RESOURCE = "/me/mailFolders/SentItems/messages"`; `eventType = "email_sent"`; normalize emits `sentDateTime` + `bcc` + dropped `receivedDateTime`. |
| [`integrations/microsoft-outlook/triggers/emailFlagged/{activate,deactivate,renew,normalize,index}.ts`](../../../integrations/microsoft-outlook/triggers/) | ~280 total | Clone with: `RESOURCE = "/me/messages"` (or folder-scoped); `CHANGE_TYPE = "updated"`; activate accepts `config.folder` like new_email; normalize emits `flag: {flagStatus, ...}` payload; receive-time `flag.flagStatus === "flagged"` filter applied in the receive route, not the trigger code. |

### 8.2 Trigger config schema (1 net-new)

| File | LOC est. | Purpose |
|---|---|---|
| [`integrations/microsoft-outlook/triggers/newEmail/configSchema.ts`](../../../integrations/microsoft-outlook/triggers/newEmail/) | ~40 | Zod schema for the 6 V1 filter fields (`folder` / `from` / `subject` / `subjectExactMatch` / `hasAttachment` / `importance`). Defaults preserved per D-OM3. |
| [`integrations/microsoft-outlook/triggers/emailSent/configSchema.ts`](../../../integrations/microsoft-outlook/triggers/emailSent/) | ~35 | Zod schema for `to` / `subject` / `subjectExactMatch` filters. |
| [`integrations/microsoft-outlook/triggers/emailFlagged/configSchema.ts`](../../../integrations/microsoft-outlook/triggers/emailFlagged/) | ~20 | Zod schema for `folder` field only. |

### 8.3 Existing files to extend

| File | Delta |
|---|---|
| [`integrations/microsoft-outlook/triggers/newEmail/activate.ts`](../../../integrations/microsoft-outlook/triggers/newEmail/activate.ts) | Read `config.folder` if present; route resource to `/me/mailFolders/{folder}/messages`. Persist the resolved `resource` in the activation result (V2 already does this from Slice 6). |
| [`integrations/microsoft-outlook/webhooks/receive.ts`](../../../integrations/microsoft-outlook/webhooks/receive.ts) | Per-trigger receive-time filter dispatch: read trigger's eventType (`new_email` / `email_sent` / `email_flagged`); apply the per-eventType filter schema + logic; route to the per-eventType normalize function. ~80 LOC delta. |
| [`integrations/microsoft-outlook/api/getMessage.ts`](../../../integrations/microsoft-outlook/api/getMessage.ts) | Add `flag` + `parentFolderId` + `lastModifiedDateTime` to `GraphMessage`. Type-only. |
| [`integrations/_registry.ts`](../../../integrations/_registry.ts) | Add side-effect imports for `triggers/emailSent` + `triggers/emailFlagged` so their `registerActivation` / `registerDeactivation` / `registerSubscriptionHandler` calls fire at module load. |

### 8.4 `get_attachment` action (1 net-new action)

| File | LOC est. | Purpose |
|---|---|---|
| [`integrations/microsoft-outlook/actions/getAttachment.schema.ts`](../../../integrations/microsoft-outlook/actions/) | ~50 | Zod schema with `emailId` + `downloadMode` (enum, default `"all"`) + `fileExtensions?` (CSV-or-array) + `fileNameFilter?` + `excludeInline?` (boolean, default `true`). Strict mode. |
| [`integrations/microsoft-outlook/actions/getAttachment.ts`](../../../integrations/microsoft-outlook/actions/) | ~160 | Handler: schema parse → resolve accountId → wrap LIST call in refreshAndRetry → filter by `excludeInline` + `downloadMode`/extensions/name → for each remaining attachment, dispatch on `@odata.type`: `fileAttachment` → per-id GET via refreshAndRetry → stage bytes to P-S3 → push FileRef into output; `itemAttachment`/`referenceAttachment` → emit metadata-only stub with `skipped: true`. Bounded output. Per-attachment errors logged-and-continued. |
| [`services/execution/handlers/_registry.ts`](../../../services/execution/handlers/_registry.ts) | +2 | Add `import` + entry for `microsoft-outlook:get_attachment`. |

### 8.5 V2's `WorkflowFilesStorageAdapter` reuse

`createWorkflowFilesStorageAdapter` from 2.1 is NOT needed for `get_attachment` — that helper is for the FILE-CONSUMER side (handlers that READ from `workflow_files`, e.g. `send_email` attachments). `get_attachment` is a FILE-PRODUCER (writes to `workflow_files` via `stageFileToStorage`), same pattern as Slack `download_file`. No new helper needed.

---

## 9. Trigger registration / lifecycle plan

### 9.1 Module-init side-effect imports

`integrations/_registry.ts` already imports `integrations/microsoft-outlook/triggers/newEmail` for its side-effects (Slice 6). Add two new imports:

```ts
import "@/integrations/microsoft-outlook/triggers/emailSent";
import "@/integrations/microsoft-outlook/triggers/emailFlagged";
```

Each trigger's `index.ts` calls:
- `registerActivation("microsoft-outlook", "<eventType>", activate)`
- `registerDeactivation("microsoft-outlook", "<eventType>", deactivate)`
- `registerSubscriptionHandler(<handler>)`

Same pattern as Slice 6.

### 9.2 Lifecycle hooks reused

- **Activation:** lifecycle service calls the per-trigger `activate(integration, config)` which calls `createSubscription` with the trigger-specific `resource` + `changeType` and persists the config patch into `trigger_resources`.
- **Deactivation:** per-trigger `deactivate(trigger)` calls `deleteSubscription`. Best-effort 404 / 403 → swallow.
- **Renewal:** per-trigger `SubscriptionHandler` registered via `registerSubscriptionHandler`. Each handler's `canHandle(trigger)` returns true when `provider === "microsoft-outlook"` AND `eventType === "<this trigger's type>"` AND `config.type === "subscription-watch"`. The 1h-before-expiry threshold pattern from Slice 6 carries through unchanged.

### 9.3 Webhook receive route shared across the 3 triggers

The Microsoft Graph webhook is one URL; the receive handler in [`webhooks/receive.ts`](../../../integrations/microsoft-outlook/webhooks/receive.ts) routes per-trigger by reading the trigger row's `eventType` column. The route:

1. Validation handshake — unchanged.
2. Parse envelope — unchanged.
3. Loop over notifications — unchanged.
4. Look up trigger by subscriptionId — unchanged.
5. Verify clientState — unchanged.
6. Fetch full message via getMessage — unchanged.
7. **NEW:** branch on `trigger.eventType`:
   - `new_email` → parse `NewEmailTriggerConfigSchema` → apply 5 receive-time filters → normalize via `triggers/newEmail/normalize`.
   - `email_sent` → parse `EmailSentTriggerConfigSchema` → apply 3 receive-time filters (to / subject / subjectExactMatch) → normalize via `triggers/emailSent/normalize`.
   - `email_flagged` → parse `EmailFlaggedTriggerConfigSchema` → apply `flag.flagStatus === "flagged"` check → normalize via `triggers/emailFlagged/normalize`.
   - default → throw `InvalidSignatureError` (unknown eventType — same shape as Slice 6's malformed-notification log).
8. Append events.

Per-eventType normalize keeps each trigger's output shape independent. Filter logic is consolidated in the receive route (not duplicated across 3 normalize files) — receive route is the single dispatch site.

---

## 10. Unit test plan

Mirrors 2.1 / 2.2's per-handler density.

### 10.1 New test files

| File | ~Test count |
|---|---|
| `tests/unit/integrations/microsoft-outlook/triggers/emailSent/activate.test.ts` | ~10 (resource path, changeType, expiration, clientState entropy, persistence shape) |
| `tests/unit/integrations/microsoft-outlook/triggers/emailSent/deactivate.test.ts` | ~6 |
| `tests/unit/integrations/microsoft-outlook/triggers/emailSent/renew.test.ts` | ~10 |
| `tests/unit/integrations/microsoft-outlook/triggers/emailSent/normalize.test.ts` | ~12 (sentDateTime fallback chain, eventId shape, bcc plumbing, contentType normalization) |
| `tests/unit/integrations/microsoft-outlook/triggers/emailSent/configSchema.test.ts` | ~10 |
| `tests/unit/integrations/microsoft-outlook/triggers/emailFlagged/activate.test.ts` | ~12 (resource path, folder-scoped vs all-folders, changeType "updated") |
| `tests/unit/integrations/microsoft-outlook/triggers/emailFlagged/deactivate.test.ts` | ~6 |
| `tests/unit/integrations/microsoft-outlook/triggers/emailFlagged/renew.test.ts` | ~10 |
| `tests/unit/integrations/microsoft-outlook/triggers/emailFlagged/normalize.test.ts` | ~14 (flag payload shape, completed/due/start nullability) |
| `tests/unit/integrations/microsoft-outlook/triggers/emailFlagged/configSchema.test.ts` | ~6 |
| `tests/unit/integrations/microsoft-outlook/triggers/newEmail/configSchema.test.ts` | ~14 (all 6 fields; defaults; enum rejections; strict mode) |
| `tests/unit/integrations/microsoft-outlook/api/listAttachments.test.ts` | ~10 |
| `tests/unit/integrations/microsoft-outlook/api/getAttachment.test.ts` | ~12 (fileAttachment / itemAttachment / referenceAttachment envelope shapes, 401, 404, base64 passthrough) |
| `tests/unit/integrations/microsoft-outlook/actions/getAttachment.schema.test.ts` | ~14 (downloadMode default, fileExtensions CSV-or-array, conditional-required, strict mode) |
| `tests/unit/integrations/microsoft-outlook/actions/getAttachment.test.ts` | ~22 (excludeInline default, all/by_extension/by_name filtering, fileAttachment → stageFileToStorage call, itemAttachment skip stub, referenceAttachment skip stub, per-attachment 4xx continues, all-fail throws, bounded output, no-byte-leakage assert, accountId routing) |

### 10.2 Updated test files

| File | Changes |
|---|---|
| `tests/unit/integrations/microsoft-outlook/triggers/newEmail/activate.test.ts` | Add tests for `folder` config routing to `/me/mailFolders/{folder}/messages`. |
| `tests/unit/integrations/microsoft-outlook/webhooks/receive.test.ts` | Add tests for: per-eventType dispatch, new_email filter combinations, email_sent filter combinations, email_flagged `flag.flagStatus !== "flagged"` skip, schema-rejection-on-bad-config behavior. ~40 net-new tests. |
| `tests/unit/integrations/microsoft-outlook/api/getMessage.test.ts` | Confirm `flag` / `parentFolderId` / `lastModifiedDateTime` fields are accepted in the envelope shape. |
| `tests/unit/integrations/microsoft-outlook/manifest.test.ts` | Registry-contains assert extended to 9 actions (add `get_attachment`). |

Total net-new + updated: ~170 unit tests across ~15 new files + ~4 updated files. Per-action / per-trigger density matches 2.2 (~12-16 per action; ~10-12 per trigger sub-module).

### 10.3 Test patterns to reuse

- Mock for `refreshAndRetry`: per Slice 6 + 2.1 + 2.2.
- Mock for Graph endpoints: `jest.spyOn(global, "fetch")` returning crafted `Response` objects.
- For `stageFileToStorage`: `jest.mock("@/services/files/stageFileToStorage", () => ({ stageFileToStorage: jest.fn() }))` — pattern from Slack `download_file` tests.
- Trigger normalize tests: feed Graph envelopes + context, assert output `TriggerEvent` shape verbatim.

---

## 11. E2E plan

### 11.1 Mock surface extensions

[`tests/e2e/helpers/mockMicrosoftServer.ts`](../../../tests/e2e/helpers/mockMicrosoftServer.ts) needs:

| Endpoint | Method | Response | Notes |
|---|---|---|---|
| `GET /v1.0/me/messages/{id}/attachments` | GET | 200 OK + `{value: [...]}` | List attachments. Mock returns from a new `state.messageAttachments: Map<string, AttachmentMetadata[]>` keyed by messageId. Control plane `__injectAttachment` accepts `{messageId, attachment}`. |
| `GET /v1.0/me/messages/{id}/attachments/{attId}` | GET | 200 OK + envelope (fileAttachment with `contentBytes` OR itemAttachment / referenceAttachment) | Per-id download. Same state map. |
| `POST /v1.0/subscriptions` for `/me/mailFolders/SentItems/messages` | POST | 201 + validation handshake | Existing handler already accepts arbitrary `resource` strings — should already work; add a control-plane assertion that the SentItems path was used. |
| `POST /v1.0/subscriptions` for `/me/messages` with `changeType: updated` | POST | 201 + validation handshake | Same — existing handler routes both. |

State extensions:
- `state.calls.listAttachments: RecordedListAttachments[]` (auth, messageId, returnedCount).
- `state.calls.getAttachment: RecordedGetAttachment[]` (auth, messageId, attachmentId, subtype).
- `state.messageAttachments: Map<string, AttachmentMetadata[]>` (control-plane seeded).

Estimated mock delta: ~150 LOC.

### 11.2 E2E spec extensions

[`tests/e2e/slice-6-outlook-mail-walkthrough.spec.ts`](../../../tests/e2e/slice-6-outlook-mail-walkthrough.spec.ts) gains **5 new `test()` blocks**:

| Block | What it asserts |
|---|---|
| **`new_email` with filters happy path** | Build a workflow with `new_email` trigger + filter config (`from: "alice@example.test"`, `subject: "report"`, `subjectExactMatch: false`, `hasAttachment: "yes"`, `importance: "high"`). Inject a matching message + a non-matching message. Trigger both notifications. Assert: matching message dispatches workflow; non-matching is dropped at receive-time. |
| **`new_email` folder-scoped subscription** | Build workflow with `folder: "AAMkAGI2-folder-id"`. Assert: `createSubscription` call's `resource` path is `/me/mailFolders/AAMkAGI2-folder-id/messages` (not `/me/messages`). |
| **`email_sent` happy path** | Build workflow with `email_sent` trigger. Inject a message + send a notification. Assert: workflow fires; trigger event payload includes `sentDateTime`; subscription resource is `/me/mailFolders/SentItems/messages`. |
| **`email_flagged` happy path** | Build workflow with `email_flagged` trigger. Inject a message with `flag: { flagStatus: "flagged" }`; send a notification. Assert: workflow fires; payload includes `flag` block. Second test path: inject `flag: { flagStatus: "notFlagged" }`; send notification; assert workflow does NOT fire (dropped at receive-time per D-OM4 contract). |
| **`get_attachment` happy path** | Build workflow with `new_email` trigger → `get_attachment` action (downloadMode `"all"`, excludeInline `true`). Inject a message + attach 3 attachments (1 fileAttachment, 1 itemAttachment, 1 inline fileAttachment). Trigger notification. Assert: list call recorded; per-id GET issued ONLY for the non-inline fileAttachment; action output exposes 1 FileRef (kind=v2_storage, points at workflow_files) + 1 itemAttachment stub with `skipped: true`; NO `contentBytes` / `base64` / `bytes` in `workflow_runs.steps[*].output`. |

Spec total: 12 → 17 (12 existing + 5 new). Run `--workers=1`, twice for cross-run stability.

### 11.3 E2E commits

E2E mock + spec extensions ride alongside the implementation commits:

- **Commit 2** (`new_email` filters) — `new_email` filter assertions + folder-scoped subscription block.
- **Commit 3** (`email_sent` + `email_flagged`) — both happy-path blocks.
- **Commit 4** (`get_attachment`) — get_attachment block + new mock endpoints + control-plane attachment injection.

Mirrors 2.1 / 2.2 cadence.

---

## 12. Commit sequence

| # | Commit | Files changed | Gates |
|---|---|---|---|
| **1** (this) | `docs(outlook-mail): plan 2.3 triggers and attachments` | `docs/slices/parity/outlook-mail-2-3-triggers-attachments-plan.md` (new). Doc-only. | Full unit + structure + migration. |
| **2** | `feat(outlook-mail): add new_email filter expansion` | New: `triggers/newEmail/configSchema.ts`; corresponding tests. Mod: `triggers/newEmail/activate.ts` (folder routing); `webhooks/receive.ts` (per-eventType dispatch skeleton + new_email filter logic); `api/getMessage.ts` (extend GraphMessage with `flag` / `parentFolderId` / `lastModifiedDateTime`); `webhooks/receive.test.ts` (per-eventType dispatch + new_email filter combinations). E2E mock unchanged; spec gets 2 new blocks. | Full unit gates + e2e. |
| **3** | `feat(outlook-mail): add email_sent and email_flagged triggers` | New: `triggers/emailSent/{activate,deactivate,renew,normalize,index,configSchema}.ts`; `triggers/emailFlagged/{activate,deactivate,renew,normalize,index,configSchema}.ts`; corresponding tests. Mod: `webhooks/receive.ts` (per-eventType dispatch + email_sent / email_flagged filter logic + normalize routing); `integrations/_registry.ts` (2 side-effect imports). E2E mock subscriptionsCreate / subscriptionsRenew already supports arbitrary resources; spec gets 2 new blocks. | Full unit gates + e2e. |
| **4** | `feat(outlook-mail): add get_attachment action` | New: `api/listAttachments.ts`, `api/getAttachment.ts`; `actions/getAttachment.{ts,schema.ts}`; corresponding tests. Mod: `services/execution/handlers/_registry.ts` (1 import + 1 entry); `manifest.test.ts` (9-action registered set). E2E mock gains LIST + per-id GET endpoints + `messageAttachments` map + control-plane `__injectAttachment`; spec gets 1 new block. | Full unit gates + e2e. |
| **5** | `docs(outlook-mail): document 2.3 outcomes` | New: `docs/slices/parity/outlook-mail-2-3-outcomes.md`. Doc-only. Optionally `CLAUDE.md` parity-changelog entry. | Full unit gates. |

### Per-commit gates

```bash
npx tsc --noEmit
npm run lint
npm run lint:structure
npm run lint:migrations
npm test
```

E2E gate on Commits 2 + 3 + 4 (any change that touches receive route, trigger directories, or actions):
```bash
CI=1 npx playwright test tests/e2e/slice-6-outlook-mail-walkthrough.spec.ts --workers=1
```

Run e2e twice on each implementation commit for cross-run stability.

### Explicit-path staging

Every commit uses `git add <specific files>` — never `git add .`. Pre-existing dirty files left untouched:
- `docs/rules/database-security.md`
- `PACKAGES.md`
- Native-node WIP from another chat (`integrations/native/*` files + `services/triggers/preconditions.{ts,test.ts}` + `tests/e2e/native-nodes-slice-1-walkthrough.spec.ts`)
- Any CLAUDE.md changes from another chat

If a 2.3 commit overlaps `_registry.ts` or other shared files with WIP from another chat, the diff MUST be inspected to ensure only Outlook-specific lines change. Cancel + re-stage manually if unrelated lines drift in (same lesson learned from the 2.2 inter-chat interleave).

### Not pushed

Every commit lands locally on `v2-provider-port-local`. Marcus reviews + pushes once all 5 commits land.

---

## 13. Explicit deferred / out-of-scope

These surfaces are NOT touched in 2.3. Each has a defined home (or "indefinite").

| Surface | Status | Where it ships |
|---|---|---|
| Upload-session flow for attachments > 3 MB / > 25 MB (outbound — `send_email`) | Deferred indefinitely | Phase 7 or a dedicated follow-up. Carry-forward from 2.1. |
| Graph attachment upload-session flow on the receive side (inbound — for `get_attachment` payloads > 4 MB requires special handling per Graph docs) | Deferred indefinitely | Today fileAttachment downloads pass through the standard `/attachments/{id}` endpoint — Graph internally streams larger payloads as base64; the wrapper's bytes go through `stageFileToStorage` which has no hard cap (P-S3 §"Size guidance" is soft). Real failures would surface as Graph 4xx with a clear message. |
| `itemAttachment` / `referenceAttachment` body materialization | Permanent SKIP (P-O2) | Skipped via metadata stubs in `get_attachment`'s output. Re-revisit if a workflow needs to forward an embedded message or download a OneDrive-linked attachment. |
| `email_flagged` prior-state cache (D-OM4 fallback option b) | Deferred indefinitely | Revisit only if users report noise. Would be a separate slice with a new database table or `trigger_resources.config` extension. |
| Cross-provider `search_emails` unification with Gmail's accepted shape | Deferred indefinitely | Phase 5 / 7 candidate. Carry-forward. |
| Outlook Calendar / Contacts surface (creates, updates, RSVPs, contact CRUD) | Out of scope | Separate `microsoft-outlook-calendar` provider (Slice 7) for calendar; contacts not yet planned. Outlook Mail 2.3 owns mail-only. |
| V1's `searchOutlookEmail` orphan | **Permanent SKIP** | Audit §7 + parent acceptance. Never registered in V1. `fetch_emails` with `query` covers the use case. |
| V1's `trigger_new_attachment` trigger (subscription on `/me/messages` with `hasAttachments=true` filter) | NOT PORTED | V1 has this as a separate trigger; V2's `new_email` trigger filter expansion (`hasAttachment: "yes"`) covers the same use case via the regular new_email trigger + receive-time filter. |
| V1's per-trigger output schema differences (e.g. `email_sent` exposed `bcc` but V1 new_email didn't) | RECONCILED via per-trigger normalize | Each V2 trigger ships its own normalize with its own output payload shape; differences preserved where meaningful (e.g. `email_sent.sentDateTime` vs `new_email.receivedDateTime`). |

---

## 14. Risk callouts

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **R-OM23-1** — Graph delivers an `email_flagged` notification before the receive-time filter has the chance to read the `flag` field, OR Graph occasionally omits `flag` on the message envelope for messages that ARE in fact flagged. The receive-time filter would incorrectly drop a legitimate flagged event. | Low | Medium | Defensive code path: if `flag` is missing from the Graph envelope after `getMessage`, fall back to firing the trigger (over-fire). Logged-and-continued. Same defensive approach as `flag.flagStatus === "notFlagged"` returning false-positive. |
| **R-OM23-2** — `email_sent` over-fires when a user moves an existing email INTO SentItems via a workflow / rule. The trigger sees a `created` event on the SentItems folder even though the email wasn't actually sent right then. | Medium | Low | V1-parity behavior. V1 has the same risk; documented as accepted. Workflow authors who need strict "send" semantics can filter on `sentDateTime` being recent. |
| **R-OM23-3** — `get_attachment` per-attachment GET dispatches one fetch per attachment; an email with 30 attachments incurs 30 sequential Graph round-trips. Token refresh in the middle could cause partial-result confusion. | Low | Low | Sequential dispatch matches V1. Concurrency would help but introduces refresh-race complexity. `refreshAndRetry` is per-call so a single token refresh covers each retry. If workflow authors report timeouts on 20+ attachment emails, parallelize in a follow-up. |
| **R-OM23-4** — `new_email` filter `from` field is single-email-string (per V1). Workflow authors might expect CSV support like the actions. | Low | Low | V1-parity choice — single email. CSV support would diverge from V1 user expectations. If real demand emerges, add `parseCsvList` later (additive change). |
| **R-OM23-5** — Per-trigger schema parse can throw on legacy Slice 6 workflows where `trigger.config` predates the schema. | Medium | High (every Slice 6 workflow stops firing) | Schema parse only on the FILTER subset of config (extracted explicitly). Slice 6 baseline workflows have NO filter fields → schema applies defaults → schema parse succeeds. Tested explicitly in commit 2 receive-route tests. |

No risk warrants splitting the slice further. No risk warrants a feature flag.

---

## 15. Acceptance gates (per implementation commit)

Each commit individually:
- ✅ `npx tsc --noEmit` green.
- ✅ `npm run lint` green (pre-existing `_registry.ts` lines warning permitted).
- ✅ `npm run lint:structure` green.
- ✅ `npm run lint:migrations` green.
- ✅ `npm test` — full suite passes. Commit 2 adds ~80 net-new tests; Commit 3 adds ~110; Commit 4 adds ~70.
- ✅ E2E (Commits 2 + 3 + 4 only) — slice-6 walkthrough green twice consecutively.

---

## 16. Exit checklist

Outlook Mail 2.3 is complete when:

- [ ] Commit 2 lands — `new_email` filter expansion + 2 e2e blocks.
- [ ] Commit 3 lands — `email_sent` + `email_flagged` triggers + 2 e2e blocks.
- [ ] Commit 4 lands — `get_attachment` + 1 e2e block + 9-action registry.
- [ ] Commit 5 lands — outcomes doc captures the final 2.3 surface + accepted decisions + gate results.
- [ ] No regression in Outlook 2.1 / 2.2 tests (8 actions + 1 trigger baseline preserved + 12 e2e baseline preserved).
- [ ] Total Outlook 2.3 e2e: 5 new tests, 17 total (twice consecutively).
- [ ] V2 Outlook Mail surface count: 9 actions + 3 triggers.
- [ ] No `contentBytes` / `base64` / `bytes` / `content` in `get_attachment` output (asserted via handler unit + e2e step output reads).
- [ ] CLAUDE.md gains an "Outlook Mail 2.3" entry under the parity-changelog list (optional — Marcus's call; might wait for full arc closure).
- [ ] Marcus reviews and acknowledges 2.3 complete.

---

## 17. What's next after 2.3

After 2.3's 5 commits land, the Outlook Mail parity arc closes:

1. **Outlook Mail parity outcomes** — the 2.1/2.2/2.3 chain captures every accepted decision. Cross-cutting summary lives in this slice's outcomes doc (Commit 5) + the audit's `parity-outlook-mail.md` §14 exit checklist gets all boxes checked.
2. **No remote push.** All Outlook Mail 2.3 work stays local until Marcus pushes.
3. **The next provider audit is on demand** — per the master plan, every Phase 1 priority-ranked provider has an accepted parity audit once Outlook Mail closes. The next provider work (Outlook Calendar parity, OneDrive, etc.) opens only when Marcus signals.

**Mailchimp is complete; do not touch. Native-node audit may be active in another chat; do not touch native files.**
