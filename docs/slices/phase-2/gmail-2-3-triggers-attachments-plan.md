# Gmail 2.3 — triggers + attachments plan

**Status:** Plan / not yet accepted. **Doc-only commit.**
**Predecessor:** Gmail 2.1 + Gmail 2.2 complete (12 actions shipped; final commit `fa121f14c feat(gmail): add search emails action`).
**Audit reference:** [`docs/slices/parity-gmail.md`](parity-gmail.md) §6, §7, §11 (Phase 2.3).
**P-S3 reference:** P-S3 FileRef contract shipped via Slack 2.4. Gmail 2.3 attachment actions consume the contract — they do NOT recreate V1's base64 / Drive / OneDrive / Dropbox dispatch.

**Recommendation up front.** Five implementation commits cover the Gmail 2.3 surface. The first (`extractMessageIds` refactor) is the precondition for the labeled-email trigger and is engineered to produce **zero behavior change** for the shipped `new_email` trigger. Two attachment actions in V1 collapse to **one** in V2 (`get_attachment`), since V1's `downloadAttachment` exists only to upload to Drive/OneDrive/Dropbox — semantics replaced entirely by the P-S3 FileRef pattern. The plan defers `newStarredEmail` (decision 3) and the `new_email` AI content filter (decision 4 / Phase 5) verbatim.

---

## 1. Scope

### Include

1. **`extractMessageIds` refactor** — return tagged events `{id, source, addedLabelIds?}` so `new_email` and `new_labeled_email` can pick the events they care about without re-walking the history pages.
2. **`new_labeled_email` trigger** — fires on Gmail `labelsAdded` events that include a workflow-configured `labelId`.
3. **`new_attachment` trigger** — fires on `messagesAdded` events for messages that actually carry attachments. Metadata-only payload.
4. **`get_attachment` action** — fetch a single Gmail attachment by `messageId` + `attachmentId`, stage via `stageFileToStorage`, return `FileRef(kind=v2_storage, provider="gmail")`.
5. **`download_attachment` decision** — recommend FOLD into `get_attachment`. Marcus decision required (see §13.1).

### Defer

- **`newStarredEmail` trigger** — per parity-gmail.md decision 3. When revisited, drop V1's hidden 2-day heuristic.
- **`new_email` AI content filter** — per decision 4. Lands in Phase 5 (AI-agent work), not Gmail parity.
- **Gmail settings actions** (V1 `updateSignature` orphan) — already skipped in audit §7.
- **Drive / OneDrive / Dropbox attachment dispatch** — V1's `downloadAttachment` cross-provider routing. Replaced by P-S3 FileRef composition: `get_attachment → drive_upload_file` (or any provider's upload).
- **Base64 attachment output** — V1's `getAttachment` exposed raw base64 in `data` field. P-S3 § contract: no inline bytes / base64 in action outputs. The Gmail wire format (base64url) is decoded inside the API wrapper; never surfaces in workflow data.

---

## 2. V1 source audit

### V1 trigger schemas

| File | Lines | Notes |
|---|---|---|
| `lib/workflows/nodes/providers/gmail/triggers/newEmail.schema.ts` | 183 | Already ported in Slice 2e. Reference for filter-field naming conventions only. |
| `lib/workflows/nodes/providers/gmail/triggers/newAttachment.schema.ts` | 114 | Schema fields: `fileType` (enum any/pdf/image/document/spreadsheet/presentation/video/audio/archive), `from` (email-autocomplete), `minSize` (MB, 0..25). Output: `messageId, subject, from, fromName, bodyPlain, bodyHtml, attachments[], attachmentCount, receivedAt, labels`. |
| `lib/workflows/nodes/providers/gmail/triggers/newLabeledEmail.schema.ts` | 116 | Schema fields: `labelId` (required, dynamic gmail_labels), `from` (optional, dynamic gmail_recent_senders), `includeReplies` (boolean, defaults true). Output: `messageId, threadId, subject, from, fromName, bodyPlain, bodyHtml, receivedAt, labeledAt, labels[], isReply, hasAttachments`. |
| `lib/workflows/nodes/providers/gmail/triggers/newStarredEmail.schema.ts` | 93 | DEFERRED — not in scope. |

### V1 attachment actions

| File | Lines | Notes |
|---|---|---|
| `lib/workflows/actions/gmail/getAttachment.ts` | 174 | Selection modes: `all` / `first` / `id` / `filename` / `pattern`. `saveToVariable: true` (default) → fetches attachment data and stuffs **base64** into output `data` field. Returns `{messageId, attachments[], attachmentCount, ...singleton fields if 1 attachment, data: <base64>}`. **G-R*** violation: inline base64 in workflow output — replaced wholesale by P-S3 FileRef. |
| `lib/workflows/actions/gmail/downloadAttachment.ts` | 413 | Cross-provider dispatch monster. Config requires `storageService` ∈ {Google Drive, OneDrive, Dropbox} and routes attachment bytes via that provider's upload API. ~90% of the file is provider-routing branches. **Entire behavior replaced** by P-S3 FileRef pattern: V2 `get_attachment` stages once; downstream `<provider>_upload_file` composes the FileRef. |
| `lib/workflows/actions/gmail/fetchMessage.ts` | 243 | V1 orphan per audit §7 (not registered). Skipped — `usersMessagesGet` already exists in V2. |

### V1 Gmail trigger processor / poller files

| File | Status | Notes |
|---|---|---|
| `lib/webhooks/gmail-processor.ts` | LEGACY (push-based) | V1 used Pub/Sub push for Gmail; V2 polls instead. Reference for the `messagesAdded`/`labelsAdded`/`messages` history-event taxonomy. Not directly ported. |
| `lib/webhooks/gmail-watch-setup.ts` | **DEPRECATED** | File self-marks as deprecated (line 1-26 banner). Replaced by `GoogleApisTriggerLifecycle.ts` in V1; V2 replaces with cron-driven polling at [`integrations/gmail/triggers/newEmail/poll.ts`](../../integrations/gmail/triggers/newEmail/poll.ts). Not ported. |
| `lib/triggers/providers/GoogleApisTriggerLifecycle.ts` | V1's per-workflow trigger lifecycle | V2 uses the polling registry pattern instead; no lifecycle needed. Not ported. |

**V1 rot summary:** V1 ran Gmail via a push-Pub/Sub server processor with an in-process Map for dedup (5-minute TTL). V2's polling architecture (Slice 2e) replaced both with a serverless-safe loop + DB-backed dedup. Gmail 2.3 builds on V2's polling, not on V1's processor.

### V1 Gmail tests / docs related to attachments / triggers

- `__tests__/nodes/gmail-send-email.test.ts` — single Gmail unit test in V1 (send-email only). No attachment or trigger unit tests in V1 to port-by-reference.
- `learning/walkthroughs/GmailLabelManagement.md` — covers label CRUD (Gmail 2.2 territory); no attachment / trigger guidance.
- No V1 attachment- or trigger-specific docs.

---

## 3. V2 current audit

### V2 Gmail polling

[`integrations/gmail/triggers/newEmail/poll.ts`](../../integrations/gmail/triggers/newEmail/poll.ts) — orchestrator. Per-tick flow:

1. Parse `trigger_resources.config` through `GmailNewEmailConfigSchema`.
2. Walk `users.history.list` from `snapshot.historyId`. On stale cursor (404/410) → re-snapshot via `getProfile`, log gap, continue.
3. **`extractMessageIds(history)`** (lines 230-248) → returns flat `string[]` of message ids drawn from `messagesAdded` + `labelsAdded` + `messages` fields.
4. For each id: dedup via `checkAndMarkSeen` → hydrate via `usersMessagesGet({ format=metadata })` → filter via `matchesFilters` → enqueue.
5. Advance `snapshot.historyId` checkpoint.

### V2 historyId cursor behavior

- Cursor in `trigger_resources.config.snapshot.historyId`.
- Advanced via `advanceCheckpoint({ startHistoryId, apiHistoryId })` (takes the larger of the two — see [`historyState.ts`](../../integrations/gmail/triggers/newEmail/historyState.ts)).
- Single-cursor-per-trigger-row design: the polling registry hands one `trigger_resources` row to one polling handler. Multiple Gmail triggers on the same Gmail account ⇒ multiple `trigger_resources` rows ⇒ multiple independent cursors. **No cross-trigger cursor sharing required for Gmail 2.3.**

### V2 `usersMessagesGet` wrapper

[`integrations/gmail/api/usersMessagesGet.ts`](../../integrations/gmail/api/usersMessagesGet.ts) — `GET /users/me/messages/{id}?format=metadata&metadataHeaders=...`. Default headers: From / To / Cc / Bcc / Subject / Date / Delivered-To / Message-ID. **Format=metadata does NOT include `payload.parts`** — see code comment lines 10-17. New `new_attachment` trigger needs `payload.parts` to enumerate attachments; the wrapper must gain a `format` option (or a new sibling wrapper) for Gmail 2.3 (see §5).

### V2 dedup behavior

[`dedup.ts`](../../integrations/gmail/triggers/newEmail/dedup.ts) keys via `markSeen("gmail", gmailMessageId)`. If two triggers (e.g. `new_email` + `new_labeled_email`) both want to fire on the same message id, the second is silently deduped as "already seen". **Gmail 2.3 fix:** per-trigger dedup-key prefix at the call site (see §4 below) — no schema change to the dedup repo.

### V2 existing Gmail attachment surface

**None.** No `usersMessagesAttachmentsGet` wrapper today. No Gmail attachment actions today.

### P-S3 contract surface

| File | Role |
|---|---|
| [`contracts/file.ts`](../../contracts/file.ts) | `FileRef` discriminated union (`provider_url` / `v2_storage` / `signed_url`). Strict on every arm — `content` / `bytes` / `base64` / `data` rejected at parse time. |
| [`core/files/createFileRef.ts`](../../core/files/createFileRef.ts) | `fileRefFromProviderUrl` / `fileRefFromStoragePath` / `fileRefFromSignedUrl` builders. **Handlers SHOULD NOT construct FileRef literals directly.** |
| [`core/files/sanitizeFilename.ts`](../../core/files/sanitizeFilename.ts) | Filename hygiene before storage-path construction. |
| [`core/files/limits.ts`](../../core/files/limits.ts) | Per-provider size guidance (warn-only at stage time). |
| [`core/files/fetchFileBytes.ts`](../../core/files/fetchFileBytes.ts) | Consumer-side helper (for `v2_storage` refs only). |
| [`services/files/stageFileToStorage.ts`](../../services/files/stageFileToStorage.ts) | The producer-side primitive Gmail 2.3 `get_attachment` will use. Takes `{userId, workflowId, runId, nodeId, fileName, mimeType, bytes, provider, metadata}`, uploads to Supabase `workflow-files`, inserts metadata row, returns `{ref, record}`. |

### Slack 2.4 reference impls

| File | Pattern |
|---|---|
| [`integrations/slack/actions/files/downloadFile.ts`](../../integrations/slack/actions/files/downloadFile.ts) | **Closest analog for Gmail `get_attachment`.** Pattern: lookup integration → decrypt token → metadata round-trip → resolve download URL → fetch bytes with Bearer → `stageFileToStorage({provider:"slack", metadata: …})` → return `{file: FileRef, fileId, fileName, mimeType, sizeBytes}`. Gmail 2.3 mirrors this end-to-end with Gmail-specific API calls. |
| [`integrations/slack/actions/files/getFileInfo.ts`](../../integrations/slack/actions/files/getFileInfo.ts) | Metadata-only FileRef path (`provider_url` kind). Not directly applicable to Gmail attachments — Gmail attachment URLs aren't directly fetchable; the bytes come through a Gmail API endpoint. Gmail 2.3 stages bytes once and emits `v2_storage` ref. |
| [`integrations/slack/actions/files/uploadFile.ts`](../../integrations/slack/actions/files/uploadFile.ts) | Consumer-side: takes `FileRef(v2_storage)` or `FileRef(signed_url)`, fetches bytes via `fetchFileBytes`, uploads to provider. Reference for the downstream pattern workflow authors will compose with `gmail/get_attachment → drive/upload_file`. |

---

## 4. `extractMessageIds` refactor design

### Current behavior

[`poll.ts:230-248`](../../integrations/gmail/triggers/newEmail/poll.ts#L230) — returns a flat `string[]` of message ids built from three sources merged together:

```ts
function extractMessageIds(history): string[] {
  const ids: string[] = [];
  for (const entry of history) {
    if (entry.messagesAdded) for (const m of entry.messagesAdded) ids.push(m.message.id);
    if (entry.labelsAdded)   for (const m of entry.labelsAdded)   ids.push(m.message.id);
    if (entry.messages)      for (const m of entry.messages)      ids.push(m.id);  // defensive
  }
  return ids;
}
```

The `new_email` trigger consumes all three sources because V1 considered a `labelsAdded` event (label applied to an old message post-receipt) as "new email from the user's perspective when an inbox label fires from a filter rule" — see [`usersHistoryList.ts:10-17`](../../integrations/gmail/api/usersHistoryList.ts#L10) historyTypes comment.

### Why labelsAdded vs messagesAdded must stay distinct

For `new_email`: **all sources** flow in (current behavior — semantic = "anything that surfaces a message").

For `new_labeled_email`: **only labelsAdded** events, **and** only those whose `addedLabelIds` include the workflow's configured `labelId`. The added-label-ids list lives ONLY in the labelsAdded history entry — once `extractMessageIds` flattens to bare ids it's lost.

### Refactor design

Replace `extractMessageIds(history): string[]` with `extractMessageEvents(history): MessageEvent[]`:

```ts
interface MessageEvent {
  id: string;
  source: "messagesAdded" | "labelsAdded" | "messages";
  /** Set when source === "labelsAdded"; the label-ids that were added in this history entry. */
  addedLabelIds?: readonly string[];
}

function extractMessageEvents(history): MessageEvent[] {
  const events: MessageEvent[] = [];
  for (const entry of history) {
    if (entry.messagesAdded) {
      for (const m of entry.messagesAdded) {
        events.push({ id: m.message.id, source: "messagesAdded" });
      }
    }
    if (entry.labelsAdded) {
      for (const m of entry.labelsAdded) {
        events.push({
          id: m.message.id,
          source: "labelsAdded",
          addedLabelIds: m.labelIds,
        });
      }
    }
    if (entry.messages) {
      for (const m of entry.messages) {
        events.push({ id: m.id, source: "messages" });
      }
    }
  }
  return events;
}
```

The `new_email` polling handler converts events back to its current shape:

```ts
const ids = Array.from(new Set(events.map(e => e.id))); // preserves current "all sources" behavior + existing dedup-within-tick
```

The `new_labeled_email` polling handler (Gmail 2.3 Commit 3) consumes the tagged events directly:

```ts
const labeledIds = events
  .filter(e => e.source === "labelsAdded" && e.addedLabelIds?.includes(config.labelId))
  .map(e => e.id);
const ids = Array.from(new Set(labeledIds));
```

### Regression-prevention tests (Commit 2)

- **`extractMessageEvents` unit:** for every history-record permutation (messagesAdded only / labelsAdded only / messages only / all three / empty), the function returns the right event tags + addedLabelIds.
- **`new_email` regression:** the existing `poll.ts` tests for `messageIds` flow are updated to assert against the **set-equality** of ids (no behavior change vs. today's `extractMessageIds` output). Existing tests for new-message handling, hydration, filtering, and dedup remain green.
- **In-tick dedup parity:** today's `Array.from(new Set(collectedMessageIds))` collapses duplicates within a tick; the refactor preserves that via the same set construction post-event-extraction.

---

## 5. `new_labeled_email` trigger design

### Identity

- **Trigger key:** `gmail:new_labeled_email`
- **Provider:** `gmail`
- **Source model:** polling (consumes Gmail `users.history.list` `labelsAdded` events).
- **EventType (TriggerEvent contract):** `new_labeled_email`.

### Config schema

Recommended minimal (decision 13.3 — Marcus override possible):

```ts
{
  labelId: z.string().min(1),                                  // REQUIRED
  pollingEnabled: z.boolean().default(false),                  // set by activation hook
  snapshot: { historyId: string, capturedAt: string }.optional(),
  polling:  { lastPolledAt: string }.optional(),
}
```

**Optional from / subject filters are explicitly NOT included in V2 Commit 1** per brief — "Recommended minimal labelId first." V1's `from` filter is easily added in a follow-up if real demand surfaces. V1's `includeReplies` toggle is dropped — replies in Gmail are messages that carry the label of the originating thread; if the configured label is applied to a reply, the labelsAdded event fires, and we'd want to deliver it. `includeReplies: false` would require thread-membership tracking that V1 implemented inconsistently. Skip until product asks.

### Event source

Gmail `users.history.list` `historyTypes=labelAdded` (V2's wrapper already requests this — [`usersHistoryList.ts:82-84`](../../integrations/gmail/api/usersHistoryList.ts#L82)). Per-tick:

1. Walk history pages from `snapshot.historyId`.
2. `extractMessageEvents` → filter `source === "labelsAdded" AND addedLabelIds.includes(config.labelId)`.
3. Dedup, hydrate, build TriggerEvent.

### Dedup key

Per-trigger prefix to avoid collision with `new_email`:

```ts
checkAndMarkSeen(`labeled:${gmailMessageId}`)
```

vs. `new_email`'s existing `checkAndMarkSeen(gmailMessageId)`. Same dedup table, scoped key. **No `webhook_event_dedup` repo change.** Document the convention in the new poller's comment.

### Payload shape

```ts
{
  provider: "gmail",
  eventType: "new_labeled_email",
  eventId: <gmailMessageId>,
  occurredAt: <internalDate as ISO>,
  accountId: <Gmail email address>,
  payload: {
    id, threadId, labelIds, snippet, sizeEstimate, mimeType,
    hasAttachments,            // multipart/mixed heuristic (same as new_email)
    from, to, cc, bcc, subject, date, messageId, deliveredTo,
    receivedAt,
    labelAppliedId: <configured labelId>,
    labelsAdded: <addedLabelIds from this history entry>,
  }
}
```

Reuses `buildTriggerEvent` from `newEmail/messageHydration.ts` with two extra payload fields (`labelAppliedId`, `labelsAdded`). Recommend extracting the shared builder to a sibling helper (`triggers/_shared/buildTriggerEvent.ts`) in the implementation commit, OR adding a second exported builder colocated with the new trigger.

### Polling / state behavior

- Activation hook (mirrors `new_email`): fetch profile → capture initial `historyId` as `snapshot.historyId`. Trigger fires only for label events AFTER activation.
- Cursor advancement: same `advanceCheckpoint` semantics — take `max(stored, apiHistoryId)`.
- Stale-cursor recovery: same as `new_email` (re-snapshot via `getProfile`, log gap, continue).

### Tests

- **Schema unit:** required labelId, strict (rejects from/subject/includeReplies for now), empty-string rejection.
- **Poller unit:** history walk + labelsAdded-only filtering + dedup-prefix isolation + label-id matching across history entries with mixed labelsAdded payloads.
- **Hydration unit:** payload shape verification — `labelAppliedId` echoes config, `labelsAdded` reflects the history entry's added labels.
- **Cross-trigger dedup isolation:** synthetic test where `new_email` AND `new_labeled_email` both see the same message id; both fire independently (different dedup keys).

### E2E (later commit)

- Configure new_labeled_email with labelId="Label_X" on a workflow.
- Mock Gmail history with one labelsAdded event matching Label_X and one not.
- Assert: workflow run enqueued exactly once, for the matching event.

---

## 6. `new_attachment` trigger design

### Identity

- **Trigger key:** `gmail:new_attachment`
- **Provider:** `gmail`
- **Source model:** polling (`messagesAdded` events, then hydrate to inspect attachments).
- **EventType:** `new_attachment`.

### Config schema

Recommended minimal (decision 13.2 — metadata-only):

```ts
{
  pollingEnabled: z.boolean().default(false),
  snapshot: { historyId, capturedAt }.optional(),
  polling:  { lastPolledAt }.optional(),
  // No filter fields in Commit 1 — see below.
}
```

V1's optional filters (`fileType`, `from`, `minSize`) are **deferred to a follow-up slice** unless Marcus directs otherwise (decision 13.5):
- `fileType`: V1 mapped a UX enum (pdf/image/document/…) to mime-type wildcard checks. Trickier than Gmail q-syntax filter; defer.
- `from`: V1 had it as `email-autocomplete`. Can be added later via simple header check.
- `minSize`: requires inspecting attachment `body.size`. Trivial to add later.

The fastest path to a working trigger is fire-on-any-attachment; downstream filter actions compose for refinement.

### Event source

Gmail `users.history.list` `messagesAdded` events (NOT labelsAdded — a label change isn't a "new attachment"). Per-tick:

1. Walk history pages.
2. `extractMessageEvents` → filter `source === "messagesAdded"`.
3. Dedup, hydrate, inspect attachments, build event if any present.

### Format=full requirement

To enumerate attachment metadata at the trigger boundary, we need `payload.parts` — which `format=metadata` omits. Options:

- **(a)** Extend [`usersMessagesGet`](../../integrations/gmail/api/usersMessagesGet.ts) to accept a `format` option (default `"metadata"`, support `"full"`). Backwards-compatible.
- **(b)** Add a sibling wrapper `usersMessagesGetFull` with parts included.

Recommend **(a)** — single source of truth, minimal duplication, additive change. The existing `metadataHeaders` arg only meaningful with `format=metadata`; document the interaction.

### Payload shape

Metadata-only — **no FileRef at trigger boundary** per brief:

```ts
{
  provider: "gmail",
  eventType: "new_attachment",
  eventId: <gmailMessageId>,
  occurredAt: <internalDate ISO>,
  accountId: <Gmail email>,
  payload: {
    id, threadId, labelIds, snippet, sizeEstimate, mimeType,
    from, to, cc, bcc, subject, date, messageId, deliveredTo,
    receivedAt,
    attachments: Array<{
      attachmentId: string,
      filename: string,
      mimeType: string,
      sizeBytes: number,
    }>,
    attachmentCount: number,
  }
}
```

Workflow authors who need the bytes chain `gmail/get_attachment(messageId, attachmentId)` downstream — get_attachment returns the FileRef.

### Walk function for attachments

```ts
function extractAttachmentMetadata(payload): AttachmentMeta[] {
  const out: AttachmentMeta[] = [];
  const walk = (parts) => {
    for (const part of parts || []) {
      if (part.filename && part.body?.attachmentId) {
        out.push({
          attachmentId: part.body.attachmentId,
          filename: part.filename,
          mimeType: part.mimeType,
          sizeBytes: Number(part.body.size ?? 0),
        });
      }
      if (part.parts) walk(part.parts);
    }
  };
  walk(payload.parts);
  return out;
}
```

If `attachments.length === 0`, the message had no real attachments (inline images don't count — the filename check filters them out). Skip the enqueue — trigger doesn't fire for attachment-less messages.

### Dedup key

Per-trigger prefix: `checkAndMarkSeen(\`attachment:${messageId}\`)`. Same isolation rationale as `new_labeled_email`.

### Tests

- **Schema unit:** strict mode rejects all V1 filter fields for now.
- **Walk unit:** `extractAttachmentMetadata` — empty/single/nested-multipart/inline-image-ignored.
- **Poller unit:** messagesAdded-only filtering, hydration with format=full, attachment-present check, dedup isolation from `new_email` + `new_labeled_email`.
- **Hydration unit:** payload shape.

### E2E (later commit)

- Mock Gmail history with `messagesAdded` event → mock `users.messages.get?format=full` → assert workflow enqueued exactly once with correct attachment metadata.

---

## 7. `get_attachment` action design

### Identity

- **Action key:** `gmail:get_attachment`
- **Provider:** `gmail`
- **Scope requirement:** `gmail.readonly` (already shipped in Slice 2).

### Config schema

```ts
{
  messageId: z.string().min(1),     // REQUIRED — from new_attachment trigger or upstream
  attachmentId: z.string().min(1),  // REQUIRED — from new_attachment trigger output
  // filename / mimeType NOT in config — derived from Gmail message metadata
}
```

Strict mode rejects:
- V1's `attachmentSelection` enum — V2 takes one attachment per action; chain steps for multi.
- V1's `saveToVariable: boolean` — V2 always returns a FileRef.
- V1's `storageService` + `folderId` — provider routing is the workflow's job, not the action's.
- V1's `data` / `content` / `base64` keys.

### Behavior

```
1. Lookup integration + decrypt access token (via refreshAndRetry).
2. Fetch message metadata via usersMessagesGet({format:"full"}) to locate the
   target attachment's filename + mimeType + sizeBytes (and confirm it exists).
3. Fetch attachment bytes via NEW wrapper usersMessagesAttachmentsGet({messageId, attachmentId}) → returns {data: base64url, size}.
4. Decode base64url internally → Uint8Array.
5. stageFileToStorage({userId, workflowId, runId, nodeId, fileName, mimeType, bytes, sizeBytes, provider:"gmail", metadata:{messageId, attachmentId}}).
6. Return { file: FileRef(v2_storage), messageId, attachmentId, fileName, mimeType, sizeBytes }.
```

Both API calls (metadata fetch + attachment fetch) wrapped in `refreshAndRetry`. Attachment-not-found in metadata → handler throws a clear error before the (more expensive) byte fetch.

### New API wrapper

**`integrations/gmail/api/usersMessagesAttachmentsGet.ts`** — `GET /users/me/messages/{messageId}/attachments/{attachmentId}`. Mirrors `usersMessagesSend.ts` / `usersMessagesModify.ts` / etc.:

- Bearer auth.
- 401 → `Unauthorized401Error`.
- Gmail error `message` / `status` / HTTP-status fallback.
- `GMAIL_API_BASE` override.
- Returns `{ data: string /* base64url */, size: number }` — same shape as Gmail's response.

The base64url → Uint8Array conversion stays in the handler (or a small helper at `integrations/gmail/utils/decodeBase64Url.ts`), NOT in the wrapper. Wrapper returns wire shape; handler is the only place bytes materialize as `Uint8Array` before staging.

### Output shape

```ts
{
  output: {
    file: FileRef(kind="v2_storage", provider="gmail"),
    messageId: string,
    attachmentId: string,
    fileName: string,
    mimeType: string,
    sizeBytes: number,
  }
}
```

**No base64. No `data` field. No raw `content`.** P-S3 contract is wall-enforced — strict FileRef schema rejects byte fields at parse time.

### Tests

- **`usersMessagesAttachmentsGet` wrapper:** same 8-case template as other Gmail wrappers (request shape, URL-encoded messageId/attachmentId, response passthrough, GMAIL_API_BASE override, 401, error.message/status/HTTP fallbacks).
- **`get_attachment` schema:** required messageId+attachmentId, strict-mode rejection of all V1 fields.
- **`get_attachment` handler:**
  - happy path: metadata fetch → byte fetch → stage → FileRef(v2_storage) output.
  - attachment-not-found-in-metadata: throws before byte fetch.
  - base64url decode correctness (sentinel bytes round-trip).
  - **no bytes/base64/data/content in output** — explicit defense-in-depth assertion.
  - refreshAndRetry routing (Gmail trigger → accountId; non-Gmail → null).
  - error propagation from metadata fetch, byte fetch, and stage.

### E2E (later commit)

- Trigger `new_attachment` → chain `get_attachment(messageId, attachmentId)`.
- Assert: workflow_files row created; FileRef.storagePath points at it; output JSON has no `data`/`content`/`base64`/`bytes` keys.

---

## 8. `download_attachment` action design — FOLD recommendation

### V1 split

- **V1 `getAttachment`:** "fetch attachment metadata + optionally base64-encode bytes into output."
- **V1 `downloadAttachment`:** "fetch attachment bytes + upload them to Google Drive / OneDrive / Dropbox" (config field `storageService`).

### V2 post-P-S3 semantics

- V2 `get_attachment` (§7): fetch + stage to V2 storage + return FileRef. **This is the complete "I want the bytes" surface.**
- V1's downloadAttachment cross-provider routing is replaced by composition: `gmail/get_attachment → drive/upload_file` (or `onedrive/upload_file`, or `dropbox/upload_file`). The FileRef flows through `workflow-files` and downstream `upload_file` actions consume it.

### Recommendation: **FOLD download_attachment into get_attachment.**

**Reasoning:**
1. Once `get_attachment` returns a FileRef, the V1 `downloadAttachment` action has no remaining responsibility — its only purpose was the cross-provider upload step, which P-S3 deliberately separates into downstream `upload_file` actions.
2. Shipping `download_attachment` as a pure alias adds two registry entries with identical handlers — workflow authors get a misleading choice with no semantic difference.
3. Workflow authors who used V1's `downloadAttachment(storageService=Drive)` now compose `get_attachment → drive/upload_file({file: <ref>, folder: …})`. Two steps, but each does one thing.
4. parity-gmail.md §7 marked `downloadAttachment` as "port — redesign — drop multi-storage dispatch." The redesign **is** P-S3 + composition — there's nothing left in `download_attachment` that `get_attachment` doesn't already deliver.

### Alternative if Marcus prefers parity

Ship `download_attachment` as a thin alias that re-exports `get_attachment`'s handler under a second registry key. Identical schema, identical behavior, identical output. Single source of truth at the handler level. Documented as "alias of get_attachment for V1 workflow-import compatibility." Marcus decision in §13.1.

---

## 9. P-S3 dependency map

### FileRef usage

- **`get_attachment` produces** `FileRef(kind="v2_storage", provider="gmail")` via `stageFileToStorage`. Builder is `fileRefFromStoragePath` (called by `stageFileToStorage`, not by the handler directly).
- **`new_attachment` trigger does NOT produce a FileRef.** Trigger payload is metadata-only; downstream `get_attachment` materializes the bytes when needed.

### Storage placement

- Bucket: `workflow-files` (P-S3 default).
- Path scheme: `<userId>/<workflowId>/<runId>/<nodeId>/<sanitizedFilename>` (built by `stageFileToStorage`).
- Retention: 24h default (per `workflow_files` table; `expires_at` set automatically).
- Cleanup: nightly reconciler via `services/files/cleanupExpiredFiles.ts`.

### No raw bytes in workflow outputs

- Handler output's `file` field is the FileRef shape (validated by `FileRefSchema.strict()` on consume).
- **No `data` / `content` / `base64` / `bytes` keys.** P-S3 contract rejects these at parse time across the action-handler boundary.
- Defense-in-depth test: `get_attachment` handler test asserts the output object does NOT contain any of these keys, even when wired with sentinel bytes.

### Provider tag

- `stageFileToStorage` is called with `provider: "gmail"` — diagnostic only (P-S3 plan §5). Helps oncall correlate workflow_files rows back to the originating provider.
- FileRef.provider field is `"gmail"` on the produced ref.

### Metadata field policy

- `stageFileToStorage({ metadata })` is the freeform `Record<string, unknown>` field on the workflow_files row.
- Gmail 2.3 records `{ messageId, attachmentId }` in metadata. These are stable identifiers — useful for an oncall "what message did this come from" lookup.
- **NEVER include tokens, secrets, or PII beyond the messageId/attachmentId pair.** No headers, no email addresses, no subjects in metadata.

### Workflow-files retention

Inherited from P-S3 default (24h). Gmail 2.3 does NOT override. Workflow runs that consume the FileRef beyond the retention window MUST be re-fetching via `get_attachment` upstream — Gmail attachments remain available at the provider as long as the source message exists.

---

## 10. Required scopes

### Current Gmail manifest scopes (Gmail 2.1 Commit 1 / P-G1)

```
gmail.readonly  — list/history/get message + ATTACHMENTS GET endpoint
gmail.send      — send_email, reply_to_email
gmail.modify    — add/remove labels, archive, trash, labels-on-send
gmail.compose   — drafts (create_draft, create_draft_reply)
```

### Gmail 2.3 scope analysis

| Surface | Scope | Already shipped? |
|---|---|---|
| `users.history.list` (new_labeled_email + new_attachment polling) | `gmail.readonly` | ✓ |
| `users.messages.get?format=full` (attachment metadata) | `gmail.readonly` | ✓ |
| `users.messages.attachments.get` (attachment bytes) | `gmail.readonly` | ✓ |

**Conclusion: NO new scopes required for Gmail 2.3.** No manifest change. No re-consent flow.

### Scopes explicitly NOT requested

- `gmail.settings.basic` — V1 had `updateSignature` action (V2 audit §7 skipped as orphan). No need.
- `contacts.readonly` — never on the Gmail surface. V1's "recent senders" was a separate config-time UX helper; not a runtime requirement.
- `openid` / `email` / `profile` — already redundant; userinfo lookup uses `gmail.googleapis.com/v1/users/me/profile` via `gmail.readonly`.

---

## 11. V1 rot to avoid

Cite each by parity-gmail.md rot-catalog ID where applicable:

| ID | V1 pattern | Why avoided in V2 |
|---|---|---|
| **R8 / G-R5** | **Base64 attachment output in `getAttachment`** (`output.data = base64`) | Replaced by P-S3 FileRef. Strict FileRef schema rejects `data` / `content` / `bytes` / `base64` keys at parse. |
| **R1** | **Cross-provider Drive/OneDrive/Dropbox dispatch in `downloadAttachment`** (413-line monolith) | Replaced by P-S3 composition. Gmail 2.3 ships ONLY the stage-to-V2-storage path; routing is downstream `upload_file` actions per provider. |
| **R8** | **Hidden defaults in V1 attachment schemas** (`saveToVariable: true` default; silent `attachmentSelection: 'all'`) | V2 schemas require explicit `messageId` + `attachmentId` (single attachment per action). No bulk modes. No silent defaults. |
| **G-R4** | **Bulk partial-success loops** in V1 `downloadAttachment` (loop over multiple attachments, swallow errors, return partial results) | V2 single-attachment per action; fail-fast on errors. |
| **R5 / DEPRECATED** | **V1 `gmail-watch-setup.ts` push-Pub/Sub model** | V2 polling-only architecture (Slice 2e). Not ported. |
| (decision 4) | **V1 `new_email` AI content filter** (`aiContentFilter` / `aiFilterConfidence` / `aiFailClosed`) | Deferred to Phase 5 per parity-gmail.md decision 4. Not in Gmail 2.3. |
| (decision 3) | **V1 `newStarredEmail` 2-day window** (hidden heuristic) | Trigger deferred per decision 3. When revisited, drop the hidden heuristic or make the window configurable. |
| **R1** | **V1 `searchQuery` bulk lifecycle compound action** (carried over from earlier audit; mention for trigger surface) | V2 single-message triggers + downstream filter actions compose for any "match many messages" workflow. |
| **R10** | **Inconsistent ActionResult shapes in V1 attachment actions** (`success: false`, `error.message`, varying output keys) | V2 uses the canonical `{success, output, error}` shape inherited from V2's handler infrastructure. No ad-hoc shapes. |
| **R11** | **V1 `applyToThread` silent thread-level switch** (carried over from Gmail 2.2 plan) | Same posture for attachments — message-level only; thread-level deferred. |

---

## 12. Implementation batch plan

| # | Commit | Scope | Gates | Dependencies |
|---|---|---|---|---|
| 1 | `docs(gmail): plan Gmail 2.3 triggers and attachments` | This plan doc only. | All 5 (doc-only). | — |
| 2 | `refactor(gmail): extractMessageEvents tagged events` | `extractMessageIds` → `extractMessageEvents` with `{id, source, addedLabelIds?}`. Updates `new_email` poll handler to convert events back to its current id list (zero behavior change). Adds extractMessageEvents unit tests + regression assertions on new_email poll tests. | All 5 + new tests green. | — |
| 3 | `feat(gmail): add new_labeled_email trigger` | New trigger schema, activate hook, poll handler. Reuses extractMessageEvents (Commit 2). Per-trigger dedup prefix `labeled:`. Registers in `integrations/_registry.ts`. | All 5 + new tests. | Commit 2. |
| 4 | `feat(gmail): add new_attachment trigger` | Extends `usersMessagesGet` to accept `format` option. New trigger schema, activate hook, poll handler with `extractAttachmentMetadata` walk. Per-trigger dedup prefix `attachment:`. Registers in `integrations/_registry.ts`. | All 5 + new tests. | Commit 2. |
| 5 | `feat(gmail): add get_attachment action` | New `usersMessagesAttachmentsGet` API wrapper. New `get_attachment` schema + handler. Stages bytes via `stageFileToStorage`. Registers in `services/execution/handlers/_registry.ts`. Includes the FOLD-or-port decision implementation for `download_attachment` (alias if Marcus picks port, omit if fold). | All 5 + new tests. | None (P-S3 already shipped). |
| 6 | `test(e2e): extend gmail walkthrough with triggers + get_attachment` | E2E for new_labeled_email + new_attachment + get_attachment full chain. | All 5 + e2e. | Commits 2-5. |
| 7 *(optional)* | `docs(gmail): Gmail 2.3 outcomes + CLAUDE.md durable notes` | Outcomes doc summarizing 2.1 + 2.2 + 2.3. CLAUDE.md updates if any new durable pattern was introduced (e.g. per-trigger dedup-prefix convention). | All 5 (doc-only). | Commits 2-6. |

**Estimated total: 5 implementation commits + 1 e2e commit + 1 optional docs commit = 6-7 commits post-plan.**

Per parity-gmail.md §11 (Phase 2.3 estimated 7 commits incl. plan), this fits the master-plan envelope.

---

## 13. Open decisions for Marcus

### 13.1 — `get_attachment` vs `download_attachment` (fold vs port both)

**Recommendation:** **FOLD.** Ship `get_attachment` only. Skip `download_attachment` permanently. Workflow authors compose `get_attachment → <provider>/upload_file` for the V1 downloadAttachment outcome.

**Rationale:** P-S3's design intent is to separate "fetch bytes" from "where they go." Aliasing the same handler under two names adds workflow-builder UI ambiguity without semantic difference. The redesigned-port mandate from parity-gmail.md §7 ("port — redesign — drop multi-storage dispatch") **is** the FileRef pattern itself; there's nothing left for `download_attachment` to do.

**Alternative (if accepted):** Ship `download_attachment` as a registry alias pointing at `get_attachment`'s handler. Single handler implementation; two registry keys. Documented as a V1-import compatibility shim.

### 13.2 — `new_attachment` trigger metadata-only?

**Recommendation:** **YES, metadata-only.** Trigger payload carries attachment metadata (`{attachmentId, filename, mimeType, sizeBytes}[]`); downstream `get_attachment` action materializes the FileRef when bytes are actually needed.

**Rationale:** Trigger fires on every attachment-bearing message; not every workflow needs the bytes. Staging at trigger time wastes storage. Workflow author writes `new_attachment → get_attachment(attachmentId)` if they need bytes; otherwise the trigger output's metadata is enough for routing decisions.

### 13.3 — `new_labeled_email` filter scope

**Recommendation:** **Minimal labelId-only for Commit 3.** V1's `from` / `includeReplies` filters add ~20% extra schema + handler complexity for fields whose demand we haven't observed. Easy to add via a follow-up slice once real workflows ask for them.

**Rationale:** Smallest credible surface that fulfills the V1 use case ("notify me when a label is applied"). V1's `from` filter is a substring check; V1's `includeReplies` toggle was implemented inconsistently and may not match user intent.

### 13.4 — `newStarredEmail` deferred?

**Recommendation:** **YES, remains deferred** per parity-gmail.md decision 3.

**Rationale:** V1's hidden 2-day window remains unresolved at audit time. Implementation requires a product decision on whether to (a) configurable window, (b) drop window entirely, or (c) skip trigger permanently. Decision 3 already deferred this; no signal to revisit now.

### 13.5 — AI content filter in `new_email`

**Recommendation:** **YES, remains in Phase 5** per parity-gmail.md decision 4.

**Rationale:** Cleanly belongs to AI-agent / Phase 5 territory. Restoring V1's `aiContentFilter` / `aiFilterConfidence` / `aiFailClosed` requires (i) `@anthropic-ai/sdk` dep wiring, (ii) explicit `aiFailClosed` default decision (V1 was fail-open by default — wrong default per Q11), (iii) per-message AI cost accounting. None of those is a Gmail-parity concern.

---

## 14. E2E plan

### Coverage post-Gmail-2.3

| Scenario | New / extended | Existing? |
|---|---|---|
| `new_email` polling fires on `messagesAdded`-only events | covered by existing Slice 2e tests | yes |
| `new_email` polling fires on `labelsAdded` events (current behavior preservation) | regression-guarded by Commit 2 extractMessageEvents refactor + new_email poll handler unit tests | yes |
| `new_labeled_email` fires ONLY for configured labelId | new (Commit 3 + Commit 6 e2e) | no |
| `new_labeled_email` does NOT fire on labelsAdded events for other label IDs | new (Commit 3 + Commit 6 e2e) | no |
| `new_labeled_email` dedup-key isolation from `new_email` (both can fire on same messageId) | new (Commit 3 unit + Commit 6 e2e) | no |
| `new_attachment` fires on messagesAdded events whose hydrated message has attachments | new (Commit 4 + Commit 6 e2e) | no |
| `new_attachment` does NOT fire on attachment-less messages | new (Commit 4 + Commit 6 e2e) | no |
| `new_attachment` payload carries attachment metadata array | new (Commit 4 unit + Commit 6 e2e) | no |
| `get_attachment` stages bytes to workflow-files bucket | new (Commit 5 + Commit 6 e2e) | no |
| `get_attachment` returns FileRef(v2_storage, provider="gmail") | new (Commit 5 unit + Commit 6 e2e) | no |
| `get_attachment` output contains NO data/content/base64/bytes keys | new (Commit 5 unit defense-in-depth) | no |
| `get_attachment` 401 triggers refreshAndRetry | new (Commit 5 unit) | no |
| Composed flow: `new_attachment` → `get_attachment` → `drive/upload_file` end-to-end | new (Commit 6 e2e) | no |

### Existing test surfaces preserved (regression guards)

- `tests/unit/integrations/gmail/triggers/newEmail/*` — every existing test continues to pass after Commit 2 refactor.
- `tests/unit/integrations/gmail/triggers/newEmail/historyState.test.ts` — cursor advancement semantics untouched.
- `tests/unit/integrations/gmail/triggers/newEmail/dedup.test.ts` — dedup key unchanged for `new_email`; new triggers prefix.
- `tests/unit/integrations/gmail/api/usersMessagesGet.test.ts` — `format` parameter addition is backwards compatible (defaults to `"metadata"`); existing tests stay green.

---

## 15. Acceptance gate

This plan is complete when Marcus has:

- [ ] Confirmed the §1 scope split (include / defer).
- [ ] Picked the §13.1 outcome — FOLD `download_attachment` into `get_attachment`, OR ship the alias, OR ship a distinct second handler.
- [ ] Confirmed §13.2 — metadata-only `new_attachment` trigger.
- [ ] Confirmed §13.3 — minimal labelId-only filter set for `new_labeled_email` Commit 3.
- [ ] Confirmed §13.4 — `newStarredEmail` remains deferred.
- [ ] Confirmed §13.5 — AI content filter remains Phase 5.
- [ ] Confirmed the §12 batch plan (5 implementation commits + e2e + optional docs).

**Implementation does NOT begin before Marcus checks every box above.**
