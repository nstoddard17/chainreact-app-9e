# Slack 2.4 — File actions plan

**Status:** Plan / not yet accepted. **Doc-only commit.** No implementation begins until Marcus accepts.
**Branch:** `v2-provider-port-local` (local-only).
**Master plan:** [`docs/slices/phase-2-plan.md`](phase-2-plan.md).
**Direct platform dependency:** P-S3 file output contract — shipped. Plan: [`docs/slices/p-s3-file-output-contract-plan.md`](p-s3-file-output-contract-plan.md). Outcomes: [`docs/slices/p-s3-file-output-contract-outcomes.md`](p-s3-file-output-contract-outcomes.md).
**Predecessors:**
- [`docs/slices/slack-2-1-messaging-reactions-plan.md`](slack-2-1-messaging-reactions-plan.md) (shipped)
- [`docs/slices/slack-2-2-private-channels-and-lifecycle.md`](slack-2-2-private-channels-and-lifecycle.md) (shipped)
- [`docs/slices/slack-2-3-channels-users-plan.md`](slack-2-3-channels-users-plan.md) → [`slack-2-3-outcomes.md`](slack-2-3-outcomes.md) (shipped)
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`
**V2 surface:** [`integrations/slack/`](../../integrations/slack/)

Slack 2.4 is the consumer that proves the P-S3 contract. It introduces V2's
first file-aware provider actions on top of the FileRef contract +
`workflow-files` storage stack. No new platform infrastructure — every
behavior fits the P-S3 shape exactly.

---

## 1. Slack 2.4 scope

### Proposed actions (3) — RECOMMENDED

| Action key | Slack endpoints | What it does | V1 reference |
|---|---|---|---|
| `slack_action_upload_file` | `files.getUploadURLExternal` + (raw POST to returned URL) + `files.completeUploadExternal` | Upload a file (sourced from a FileRef) to one or more channels. | `lib/workflows/actions/slack/uploadFile.ts` |
| `slack_action_download_file` | `files.info` + bot-token fetch of `url_private_download` + `stageFileToStorage` | Download a Slack file by id, stage bytes into `workflow-files`, return `FileRef(kind=v2_storage)`. | `lib/workflows/actions/slack/downloadFile.ts` |
| `slack_action_get_file_info` | `files.info` | Metadata-only lookup; returns `FileRef(kind=provider_url)` + structured metadata. | `lib/workflows/actions/slack/getFileInfo.ts` |

### Proposed trigger (1) — DEFERRED RECOMMENDATION

| Trigger key | Slack event | What it does | V1 reference |
|---|---|---|---|
| `slack_trigger_file_uploaded` | `file_shared` | Fire when a file is uploaded; payload carries `FileRef(kind=provider_url)` + uploader / channel context. | `lib/workflows/nodes/providers/slack/triggers/fileUploaded.schema.ts` |

**Recommendation:** ship the **3 actions in Slack 2.4** and **defer the file-uploaded trigger to Slack 2.5** unless Marcus elects to bundle it. Rationale in §4 + §10.

### Out of scope (Slack 2.4)

- Editing or deleting Slack files (`files.delete` / `files.remoteRemove` / Slack snippet edits) — V1 does not implement these. Bundle into a later slice if needed.
- User-token (`xoxp-…`) file flows. V1 supports an `asUser: true` toggle on download / get_file_info / upload. **V2 does not port this.** Bot-token only — keeps the OAuth surface tight (matches Slack 2.3 §5 #6 outcome). Documented in §6.
- Slack's "remote files" / external storage federation (`files.remote.*`) — separate Slack capability; out of scope.
- Inline-text shortcut helpers (`fileRefFromInlineText(name, "hello")` from the P-S3 plan §8 stretch goal). Defer; see §10 decision #3.

---

## 2. V1 source audit

### V1 file-related action files

| V1 file | Status | Notes |
|---|---|---|
| `lib/workflows/actions/slack/uploadFile.ts` | **Port with V2 adaptation.** | Uses correct two-step `files.getUploadURLExternal` + `files.completeUploadExternal` flow. V1 accepts inline `content` (text), base64 data URLs (`data:mime;base64,...`), and a `fileSource = "url" \| "content" \| "base64"` discriminator on the config schema. **All three are V1 rot** — V2 replaces every source path with FileRef. See §7. |
| `lib/workflows/actions/slack/downloadFile.ts` | **Port with V2 adaptation.** | Worst V1 offender: returns `content: "data:${mimetype};base64,${base64}"` in the action output. V2 replaces with FileRef-only output that points at staged bytes. See §7. |
| `lib/workflows/actions/slack/getFileInfo.ts` | **Port with V2 adaptation.** | Cleanest of the three. No bytes; returns flat field map of Slack `files.info` response. V2 keeps the metadata fields and wraps them in `{ file: FileRef(provider_url), ... }`. |
| `lib/workflows/nodes/providers/slack/actions/uploadFile.schema.ts` | **Discard contents; structure as reference.** | The `fileSource` enum + `content` textarea + `base64Data` textarea fields are the schema-level encoding of the V1 antipattern. V2 schema has a single `file: FileRef` input + channel + title + initialComment + threadTs. |
| `lib/workflows/nodes/providers/slack/actions/downloadFile.schema.ts` | **Discard contents.** | V1's schema documents `content: data:URL` as an output field — that's the antipattern. V2 output is `{ file: FileRef(v2_storage), fileId, fileName, mimeType, sizeBytes }`. |
| `lib/workflows/nodes/providers/slack/actions/getFileInfo.schema.ts` | **Port flat metadata fields as nested FileRef + sibling fields.** | Workspace selector + `asUser` are V1-only; V2 drops both. |
| `lib/workflows/nodes/providers/slack/triggers/fileUploaded.schema.ts` | **Reference only.** | V1 trigger maps to `file_shared` event. V2 equivalent (if shipped) registers `slack.file_shared` per the V2 normalizer convention; payload exposes `FileRef(provider_url)` instead of raw `fileUrl` / `fileUrlPrivate` fields. `fileTypes` filter (images / documents / spreadsheets / videos / audio / code / archives) is V1 product polish; V2 can start without it. |
| `lib/webhooks/normalizer.ts:127` (`file_shared` branch) | **Reference for the V2 normalizer extension.** | V1 emits `{ file, user, channel, eventTs, team }` on the normalized trigger. V2 emits canonical `slack.file_shared` with the inner Slack `event` object passed through verbatim as `payload`; trigger consumers index `payload.file_id`, `payload.channel_id`, etc. — same convention as every other V2 Slack trigger. |
| `lib/triggers/providers/SlackTriggerLifecycle.ts:224` (`'slack_trigger_file_uploaded': 'file_shared'`) | **Reference.** | V2 lifecycle subscribes to `file_shared` at activate time via `registerActivation("slack", "slack.file_shared", …)` — same shape as every other Slack trigger. |
| `lib/workflows/testing/fixtures/webhooks/slack/file-shared.json` | **Port to V2 fixture if trigger ships.** | Confirms Slack's `file_shared` payload carries only `{ file_id, user_id, channel_id }` — no metadata. V2 trigger payload would similarly carry FileRef(provider_url) with just `providerFileId` populated; consumers needing more detail compose `slack:get_file_info` downstream. |

### V1 rot consolidated (full inventory in §7)

- Inline content as a config arm (`fileSource = "content"` + `content: textarea`).
- Inline base64 as a config arm (`fileSource = "base64"` + `base64Data: textarea`).
- Base64 data URLs as a config value (`content: "data:image/png;base64,..."`).
- Base64 data URLs as an action **output** (downloadFile's `content` field).
- `asUser: true` toggle that flips bot ↔ user token at runtime.
- `workspace` config field as a per-action workspace discriminator (V2 resolves this via `triggerEvent.accountId` / OAuth row scoping; no per-action picker).
- Missing size + mime discipline — V1 accepts arbitrary content with no length check or content-type validation.

---

## 3. V2 / P-S3 dependency map

Slack 2.4 consumes the P-S3 surface; it adds **zero new platform primitives**.

| V2 module | How Slack 2.4 uses it |
|---|---|
| [`contracts/file.ts`](../../contracts/file.ts) | `FileRef` types (`ProviderUrlFileRef`, `V2StorageFileRef`, `SignedUrlFileRef`) consumed by every action's schema + handler. |
| [`core/files/createFileRef.ts`](../../core/files/createFileRef.ts) | Output construction: `download_file` calls `fileRefFromStoragePath` (via `stageFileToStorage` which calls it for us); `get_file_info` calls `fileRefFromProviderUrl`; `upload_file` constructs `fileRefFromProviderUrl` for the post-upload Slack URL. Handlers MUST use the builders, never object literals. |
| [`core/files/fetchFileBytes.ts`](../../core/files/fetchFileBytes.ts) | `upload_file` calls this to resolve the input `FileRef` to bytes. `v2_storage` + `signed_url` arms work today; `provider_url` arm is the open decision (§5 + §10). |
| [`core/files/sanitizeFilename.ts`](../../core/files/sanitizeFilename.ts) | Already applied inside builders and `stageFileToStorage`; Slack 2.4 doesn't call it directly. |
| [`core/files/limits.ts`](../../core/files/limits.ts) | `getFileRefSizeGuidance("slack")` returns 25 MB. Upload pre-checks size against this guidance and warns (does not reject — Slack enforces the hard cap at the API). |
| [`services/files/stageFileToStorage.ts`](../../services/files/stageFileToStorage.ts) | `download_file` calls this with bytes + provider context to produce a `FileRef(v2_storage)`. |
| [`repositories/workflowFiles.ts`](../../repositories/workflowFiles.ts) | Slack 2.4 does NOT call the repository directly. Stage / cleanup own all metadata I/O. (Repository discipline rule from CLAUDE.md.) |
| [`integrations/slack/api/_request.ts`](../../integrations/slack/api/_request.ts) | Existing Slack API helper — Slack 2.4 wraps `files.getUploadURLExternal`, `files.completeUploadExternal`, and `files.info` as four new files under `integrations/slack/api/`. |
| [`integrations/slack/api/errors.ts`](../../integrations/slack/api/errors.ts) | Reuses `SlackApiError`. New file-specific error codes (`file_not_found`, `file_deleted`, `not_in_channel` for files, `over_quota`) flow through the existing class. |
| [`services/cron/auth.ts`](../../services/cron/auth.ts) | Not touched. P-S3 cleanup cron handles staged-file expiry. |
| [`app/api/cron/cleanup-workflow-files/route.ts`](../../app/api/cron/cleanup-workflow-files/route.ts) | Reclaims Slack-staged files at `expires_at` (24h default). No Slack 2.4 wiring needed. |

### Test infrastructure

- Slack mock test boundary: existing `tests/e2e/helpers/mockSlackServer.ts` (if present from earlier slices) extends to cover `files.getUploadURLExternal`, the bytes POST, `files.completeUploadExternal`, `files.info`, and `url_private_download` GET. If V2 doesn't have a Slack mock server yet, the e2e walkthrough builds one (mirrors the Trello mockTrelloServer pattern that landed in `d7629ddda`).
- Unit tests follow the existing V2 Slack pattern: one test per API wrapper, one per action handler, plus filter / trigger tests if the trigger ships.

---

## 4. Action design

### 4.1 `slack_action_upload_file`

**Config schema (Zod)**

```ts
{
  channel: z.string().regex(/^[CG][A-Z0-9]+$/),   // single id, no name resolution (Slack 2.3 rule)
  file: FileRefSchema,                             // P-S3 contract — strict discriminated union
  title: z.string().min(1).max(255).optional(),
  initialComment: z.string().min(1).max(40000).optional(),
  threadTs: z.string().optional(),
  // No workspace selector. No asUser toggle. No content / base64 / url arms.
}
```

**Output**

```ts
{
  file: FileRef,                  // kind=provider_url, provider="slack",
                                  //   providerFileId=F…, url=url_private,
                                  //   name, mimeType, sizeBytes
  fileId: string,                 // duplicate of file.providerFileId for ergonomics
  permalink: string | null,       // Slack-rendered share link (sibling field, not in FileRef)
  channelIds: readonly string[],  // channels Slack actually shared into
}
```

**Handler flow**

1. Parse + validate config; validate `file` against `FileRefSchema` (defense-in-depth — engine pre-resolves variables, but file shape may have been built by an upstream node).
2. Resolve bytes:
   - `kind=v2_storage` → `fetchFileBytes(file, { storage: workflowFilesStorageAdapter })`.
   - `kind=signed_url` → `fetchFileBytes(file)`.
   - `kind=provider_url` → see §5 (open decision).
3. Pre-check size against `getFileRefSizeGuidance("slack")` (25 MB). Soft warn if exceeded; don't reject (Slack enforces hard cap; users on Slack Enterprise Grid may have higher).
4. Call `files.getUploadURLExternal` with `filename` (from `file.name`) + `length` (from `bytes.byteLength`).
5. POST bytes to the returned `upload_url` with `Content-Type: application/octet-stream`. Use `refreshAndRetry` wrapper for the Slack-API calls; the raw byte POST is a single attempt (Slack's URL is single-use and short-lived; retry → re-issue URL).
6. Call `files.completeUploadExternal` with `[{ id: file_id, title: title ?? file.name }]` + `channel_id: channel` + optional `initial_comment` + `thread_ts`.
7. Construct output `FileRef` via `fileRefFromProviderUrl({ name, mimeType, sizeBytes, url: uploadedFile.url_private, provider: "slack", providerFileId: uploadedFile.id, metadata: { permalink: uploadedFile.permalink } })`.

**Required scopes:** `files:write` (added in this slice).

**Failure surface:**
- Slack API logical errors → `SlackApiError` with code (`channel_not_found`, `not_in_channel`, `over_quota`, `file_uploads_disabled`, `invalid_filetype`, `file_too_large`, etc.).
- Bytes-fetch failure → propagates `FileFetchError` / `UnsupportedProviderFetchError` from P-S3.
- HTTP error on Slack non-2xx → `http_<status>` (existing convention).

### 4.2 `slack_action_download_file`

**Config schema (Zod)**

```ts
{
  fileId: z.string().regex(/^F[A-Z0-9]+$/),   // strict Slack file id
  // No workspace selector. No asUser. No fileSource discriminator.
}
```

**Output**

```ts
{
  file: FileRef,        // kind=v2_storage, storagePath=<userId>/<workflowId>/<runId>/<nodeId>/<name>,
                        //   provider="slack" (diagnostic), providerFileId=F…,
                        //   name, mimeType, sizeBytes
  fileId: string,
}
```

**Handler flow**

1. Parse + validate config.
2. `files.info({ file: fileId })` → metadata. Throw on `file_not_found` / `file_deleted` / etc.
3. Determine `downloadUrl = file.url_private_download ?? file.url_private`. Throw with `file_no_download_url` if absent.
4. Fetch bytes with `Authorization: Bearer ${botToken}`. Bot-token only; never user-token.
5. `stageFileToStorage({ userId, workflowId, runId, nodeId, fileName: file.name, mimeType: file.mimetype, bytes, sizeBytes: file.size, provider: "slack", metadata: { permalink: file.permalink, slackUser: file.user } })`.
6. Return `{ file: result.ref, fileId: file.id }`.

**Required scopes:** `files:read` (added in this slice).

**Failure surface:**
- `files.info` errors → `SlackApiError`.
- Slack bytes-fetch non-2xx → `http_<status>`.
- `stageFileToStorage` errors → propagate; orphan cleanup is its responsibility.

### 4.3 `slack_action_get_file_info`

**Config schema (Zod)**

```ts
{
  fileId: z.string().regex(/^F[A-Z0-9]+$/),
  includeComments: z.boolean().optional(),   // forwards count=100 to files.info if true
  // No workspace selector. No asUser. No fileSource discriminator.
}
```

**Output**

```ts
{
  file: FileRef,                   // kind=provider_url, provider="slack",
                                   //   providerFileId, url=url_private, name, mimeType, sizeBytes
  fileId: string,
  title: string | null,
  fileType: string | null,         // Slack `filetype`
  permalink: string | null,
  permalinkPublic: string | null,
  uploaderId: string | null,       // Slack user id
  channels: readonly string[],     // ids file is shared in
  isPublic: boolean,
  isExternal: boolean,
  createdAt: string | null,        // ISO from Slack's epoch
  commentsCount: number,
  comments: readonly Record<string, unknown>[],   // raw Slack comments when includeComments=true
}
```

**Handler flow**

1. Parse + validate config.
2. `files.info({ file: fileId, count: includeComments ? 100 : undefined })`.
3. Construct `FileRef(provider_url)` via `fileRefFromProviderUrl({ name: file.name, mimeType: file.mimetype, sizeBytes: file.size, url: file.url_private, provider: "slack", providerFileId: file.id, metadata: { permalink: file.permalink } })`.
4. Project Slack's flat metadata into the structured output above.

**Required scopes:** `files:read`.

### 4.4 `slack_trigger_file_uploaded` (deferred recommendation)

**Canonical eventType:** `slack.file_shared` (V2 normalizer produces `slack.<event.type>`, so file_shared events emit `slack.file_shared` — same convention as the rest of the V2 Slack triggers).

**Config schema (Zod)**

```ts
{
  channel: z.string().regex(/^[CG][A-Z0-9]+$/).optional(),    // filter to a single channel
  // No fileTypes filter in v1 — defer the file-type discriminator. Workflow
  // authors can branch downstream on payload.file.filetype.
}
```

**Filter behavior**

- If `channel` is set: match only when `payload.channel_id === channel`.
- Otherwise: match every `slack.file_shared` event in the workspace.

**Payload exposed to downstream nodes**

The V2 normalizer passes Slack's inner `event` object through verbatim
as `payload`. Workflow authors index `{{nodeId.payload.file_id}}`,
`{{nodeId.payload.channel_id}}`, `{{nodeId.payload.user_id}}`,
`{{nodeId.payload.event_ts}}`.

**FileRef on the trigger payload:** Slack's `file_shared` event carries ONLY a file id (and channel + user ids). The metadata Workflow authors normally want (name, mimeType, size) requires a `files.info` round-trip. Two options:

- **(A)** Emit a minimal `FileRef(provider_url)` on the trigger payload with just `providerFileId` + `url` left null until the downstream `get_file_info` action populates them. **Rejected** — would violate `FileRefSchema` (the `provider_url` arm requires `url`).
- **(B)** Don't emit a FileRef on the trigger payload at all. Downstream workflows that need metadata add a `slack:get_file_info` node, which emits the proper `FileRef(provider_url)`. **Recommended.**

This is the principled reading of the P-S3 contract: a trigger that only knows an id cannot honestly emit a FileRef. Workflows compose `file_shared trigger → get_file_info → upload_file` to cross to another provider.

**Lifecycle:** `registerActivation("slack", "slack.file_shared", { …workflow scoping })` at activate; `registerDeactivation` at disable. Mirrors the existing Slack trigger lifecycle pattern. The Slack workspace event subscription already includes `file_shared` if `files:read` is granted — adding `files:read` to the manifest's required scopes (for the actions) auto-enables the event delivery; the trigger needs no extra Slack-app config beyond that.

**Required scopes:** `files:read` (already added in this slice for actions).

---

## 5. Provider URL handling decision

P-S3's `fetchFileBytes` throws `UnsupportedProviderFetchError` for `kind=provider_url`. Slack 2.4's `upload_file` needs to decide what happens when an upstream node (e.g. an earlier Slack `download_file` that emitted `v2_storage`, or a `get_file_info` that emitted `provider_url`, or a future Drive `get_file` that emitted `provider_url`) is wired into the `upload_file` `file` input.

### Three options

| Option | Behavior |
|---|---|
| **A.** Reject `provider_url` at handler entry — surface as a config error pointing to `download_file` or `stageFileToStorage` as the unblock. | Strict; no risk; matches today's `fetchFileBytes` behavior. |
| **B.** Implement a Slack-only `provider_url` fetcher in Slack 2.4 (look up the bot token, attach as Bearer, GET the URL, return bytes). Pass it into `fetchFileBytes` via a new `options.providerFetcher` arg. | Unblocks `slack:get_file_info → slack:upload_file` chains directly. Requires extending `fetchFileBytes`'s adapter signature. |
| **C.** Auto-stage `provider_url` at upload time: if `file.kind === "provider_url"` AND `file.provider === "slack"`, fetch + stage via `stageFileToStorage` (using Slack auth) before continuing the normal `v2_storage` path. | Most convenient for workflow authors. Slight blast-radius increase: a transient Slack file becomes a durable 24h file in the bucket. |

### Recommendation: **A** for Slack 2.4 — minimal-blast-radius unblock

Ship `upload_file` accepting only `v2_storage` + `signed_url` initially. Document the error message clearly: when handler sees `provider_url`, throw a `slack_upload_unsupported_provider_url` error with `hint: "Pipe the FileRef through slack:download_file first to stage durable bytes."`

**Rationale:**
- Keeps Slack 2.4 tight on platform behavior. No extension of `fetchFileBytes` signature, no Slack-specific code paths inside `core/files/`.
- The workflow author can compose `slack:get_file_info → slack:download_file → slack:upload_file` to copy a file between channels. One extra node; common case is rare.
- Option B (provider-specific fetch helper) lands as a P-S3 follow-up that unlocks ALL providers, not just Slack — bundling it into Slack 2.4 would prejudge the API shape of the cross-provider helper. Better to ship 2.4 first, then design the helper in a P-S4 / Phase 7 slice.
- Option C couples upload_file to staging, which is observable side-effect (storage write + metadata row) that the author didn't ask for. Skip.

**Per CLAUDE.md durable rule #5:** "`provider_url` fetching requires explicit provider-safe auth handling; the generic `fetchFileBytes` path throws `UnsupportedProviderFetchError` for it." Option A preserves this. Options B and C move toward changing it — both are valid future work, but neither belongs inside the Slack 2.4 commit chain.

**Open for Marcus.** If Marcus prefers B or C, the plan adjusts; see §10 decision #1.

---

## 6. Scopes

| Scope | Status before 2.4 | Status after 2.4 | Reason |
|---|---|---|---|
| `files:read` | absent | **NEW required** | `files.info` for `get_file_info` + `download_file`; URL-private GET for `download_file`; enables Slack to deliver `file_shared` events if the trigger ships. |
| `files:write` | absent | **NEW required** | `files.getUploadURLExternal` + `files.completeUploadExternal` for `upload_file`. |

**No other scope changes.** Confirmed against Slack docs:
- `files.getUploadURLExternal` requires `files:write`.
- `files.completeUploadExternal` requires `files:write`.
- `files.info` requires `files:read`.
- `url_private_download` and `url_private` require an authenticated GET — bot scope `files:read` is sufficient when the bot is a member of (or has visibility into) the channel the file lives in.

### Scopes intentionally NOT added

- `files:write.user` / any user-token (`xoxp-…`) scope — V2 has no user-token flow (Slack 2.3 §6 #6); `asUser: true` is not ported.
- `files:read.email` (does not exist; Slack doesn't expose file-uploader email through a separate scope — the uploader user id is in the file metadata; PII enrichment is a downstream concern).
- Any `chat:*` or `channels:*` additions — the file-upload `initial_comment` is delivered by `files.completeUploadExternal` and does not need `chat:write` (Slack 2.4 surfaces the file with the comment via the same endpoint).
- `chat:write.public` — already optional from Slack 2.1; no change.

**Existing workspaces with the current grant set will be prompted to re-OAuth before any Slack 2.4 action resolves.** Same UX as Slack 2.3's `users:read` promotion. Documented in the outcomes commit.

---

## 7. V1 rot to fix (explicit list)

V2 must NOT port these patterns. Each entry shows the V1 location and the V2 replacement.

| # | V1 rot | V1 location | V2 replacement |
|---|---|---|---|
| 1 | `downloadFile` returns `content: "data:${mimetype};base64,${base64}"` — base64 inline in the action output, persisted to `workflow_runs.steps`. | `lib/workflows/actions/slack/downloadFile.ts:52` | `download_file` output is `{ file: FileRef(v2_storage), fileId }` — bytes are in the bucket, never in the runs row. Enforced structurally by `FileRefSchema.strict()`. |
| 2 | `uploadFile` accepts a `fileSource` discriminator with `"content"` and `"base64"` arms; `content` is a `textarea` taking arbitrary text or a `data:…` URL. | `lib/workflows/actions/slack/uploadFile.ts:17–42` + `uploadFile.schema.ts:117–193` | V2 `upload_file` schema has a single `file: FileRefSchema` input. No `content` / `base64Data` fields. No discriminator. |
| 3 | `uploadFile` infers MIME type from `data:` URL headers when sourcing from base64. | `lib/workflows/actions/slack/uploadFile.ts:30–31` | `FileRef.mimeType` is the contract field. Producers (the upstream node that built the FileRef) set the MIME; consumer trusts the contract. |
| 4 | No size discipline — V1 accepts arbitrary text/base64 with no length check; relies entirely on Slack rejecting at the API. | `lib/workflows/actions/slack/uploadFile.ts` | Pre-flight `getFileRefSizeGuidance("slack")` warn. Bytes are bounded by what `fetchFileBytes` returns (real over the wire). |
| 5 | `asUser: true` toggle on `downloadFile` / `getFileInfo` / `uploadFile` flips bot ↔ user token at runtime. | `lib/workflows/actions/slack/downloadFile.ts:15,21–22`, `getFileInfo.ts:15,22–23` | Not ported. Bot-token only. V2 has no user-token flow; consistent with Slack 2.3 §6 #6. |
| 6 | `workspace` per-action select field with `dynamic: "slack_workspaces"`. V1 lets each action pick a workspace at config time. | All three schemas | Not ported. V2 OAuth rows are scoped per-workspace already; trigger-event `accountId` plus the user id resolves the right token via `getActiveForExecution`. (Matches Slack 2.3 + Slack 2.1 §6 outcomes.) |
| 7 | `fileSource: "url"` arm — V1 lets the user paste a public URL; Slack downloads from it server-side. | `uploadFile.schema.ts:117–153` | Not ported. URL inputs become `signed_url` FileRefs constructed upstream by `fileRefFromSignedUrl`. The workflow author who wants "upload from this public URL" composes a `manual` / future helper node that builds the FileRef. |
| 8 | `getFileInfo` returns flat fields including `urlPrivate`, `urlPrivateDownload` directly in the action output. | `lib/workflows/actions/slack/getFileInfo.ts:46–48` | V2 emits `{ file: FileRef(provider_url) }` carrying the URL inside `file.url`. Sibling metadata fields (permalink, channels, uploader id) stay flat for ergonomics, but the URL has structured handling. |
| 9 | V1 logs file content / errors with raw stack traces via `logger.error('[Slack Download File] Error:', error)` — could surface URLs / token-bearing fragments in production logs. | `lib/workflows/actions/slack/downloadFile.ts:58`, etc. | V2 handlers use structured logging that never includes the bytes or the `url_private_download`. `SlackApiError.message` carries the Slack code only. |
| 10 | `completeUploadExternal` request body in V1 sets `title: title \|\| finalFilename` — silently coerces. | `lib/workflows/actions/slack/uploadFile.ts:77` | V2 keeps the same default behavior but documents it: title falls back to the FileRef's `name` when caller omits it (no hidden Slack-specific default beyond that). |

---

## 8. Implementation batch plan

Five commits proposed. Each commit lands behind a green full-gate baseline; no commit is intermediate / WIP.

| # | Commit | Files added/touched | Tests |
|---|---|---|---|
| 1 | `docs(slack): plan Slack 2.4 file actions` | This doc. | n/a (doc-only). |
| 2 | `feat(slack): add file API wrappers` | `integrations/slack/api/filesGetUploadURLExternal.ts`, `integrations/slack/api/filesCompleteUploadExternal.ts`, `integrations/slack/api/filesInfo.ts`, `integrations/slack/api/_uploadBytesToSlack.ts` (raw POST helper). Updates `integrations/slack/manifest.ts` to add `files:read` + `files:write` to required scopes. | One unit test per wrapper. ~12 tests. Confirms `SLACK_API_BASE` override + error shaping + ok-but-empty defense. |
| 3 | `feat(slack): add upload_file action` | `integrations/slack/actions/files/uploadFile.ts` + `.schema.ts`. Possibly a leaf-folder reshape — see §11. Action registered in [`services/execution/handlers/_registry.ts`](../../services/execution/handlers/_registry.ts). | Schema parse + 4–5 handler cases (v2_storage happy path, signed_url happy path, provider_url rejection per §5, size-guidance warn, Slack API error surface). ~7 tests. |
| 4 | `feat(slack): add download_file + get_file_info actions` | `integrations/slack/actions/files/downloadFile.ts` + `.schema.ts`, `integrations/slack/actions/files/getFileInfo.ts` + `.schema.ts`. Registry update. | Schema parse + 4–5 cases each (happy path, file_not_found / file_deleted, stage failure propagation for download). ~10 tests. |
| 5 | `test(slack): extend Slack walkthrough with Slack 2.4 surface` | New e2e cases in the Slack walkthrough harness (`tests/e2e/slice-1-slack-walkthrough.spec.ts` or the Slack 2.3-extended file). MockSlackServer additions: `files.getUploadURLExternal`, the bytes POST, `files.completeUploadExternal`, `files.info`, `url_private_download` GET. | ~3–5 e2e scenarios — see §9. |
| (6) | `feat(slack): add file_uploaded trigger` | If Marcus elects to include the trigger in 2.4: `integrations/slack/triggers/fileShared/filter.ts` + registration in `integrations/slack/triggers/index.ts`. Optional Slack fixture under `tests/unit/integrations/slack/triggers/fileShared/`. | ~3 filter tests; e2e dispatch test if walkthrough covers it. |
| (7) | `docs(slack): document Slack 2.4 outcomes + CLAUDE.md updates` | Outcomes doc; CLAUDE.md durable Slack-file gotcha if a non-obvious pattern lands (e.g. the chosen `provider_url` policy from §5). | n/a (doc-only). |

Commit 6 is conditional on §10 decision #2; commit 7 lands regardless once 2.4 is feature-complete.

**Total LoC estimate:** ~700 source (4 API wrappers + 3 actions + manifest scope add + possibly trigger filter) + ~1200 tests (unit + e2e). Slightly tighter than Slack 2.3 because there are 3 actions instead of 14.

---

## 9. E2E plan

Extend the Slack walkthrough harness (existing pattern in [`tests/e2e/`](../../tests/e2e/) — see Slack 2.3 outcomes for the convention). One spec file; multiple scenarios. The MockSlackServer addition is shared infrastructure.

### MockSlackServer additions

- `GET /api/files.getUploadURLExternal` → returns `{ ok: true, upload_url: "https://mock-slack.test/upload/<token>", file_id: "F0001" }`.
- `POST /upload/<token>` (the redirect target) → captures the bytes; asserts byte length on receive; returns 200.
- `POST /api/files.completeUploadExternal` → returns `{ ok: true, files: [{ id, name, mimetype, url_private, permalink, channels }] }`.
- `POST /api/files.info` → returns the staged file metadata.
- `GET <url_private_download>` → returns the staged bytes when the request has the bot bearer.

### Scenarios

1. **Upload from `v2_storage` FileRef.**
   - Seed: workflow has an upstream node that produces a `FileRef(v2_storage)` (use a synthetic trigger or a pre-staged metadata row + bucket object via a test helper that calls `stageFileToStorage` directly).
   - Run: `slack:upload_file` consumes the FileRef.
   - Assertions: MockSlackServer received the bytes (length matches); `files.completeUploadExternal` was called with the right channel + title; action output has `{ file: FileRef(provider_url), fileId, permalink, channelIds }`; `workflow_runs.steps[<uploadNode>].output.file.kind === "provider_url"`; **no base64 or `content` field anywhere in `workflow_runs.steps`**.

2. **Download stages to `workflow-files`.**
   - Seed: MockSlackServer returns a known file with id `F-abc` and a URL that serves N bytes when called with the bot bearer.
   - Run: `slack:download_file` with `{ fileId: "F-abc" }`.
   - Assertions: a `workflow_files` row exists with `storage_path = <userId>/<workflowId>/<runId>/<nodeId>/<name>`; storage object exists at that path (use mocked Supabase storage adapter or test bucket); action output is `{ file: FileRef(v2_storage), fileId }`; output `file.sizeBytes === N`; output `file.metadata.permalink` matches Slack's permalink; **no `content` / base64 field in the output**.

3. **`get_file_info` returns `provider_url` FileRef + metadata fields.**
   - Run: `slack:get_file_info` with `{ fileId: "F-abc", includeComments: true }`.
   - Assertions: output has `file.kind === "provider_url"`, `file.provider === "slack"`, `file.url` matches Slack's `url_private`; flat metadata (title, permalink, channels, uploaderId, commentsCount, comments[]) populated; **no bytes anywhere**.

4. **Storage cleanup after expiry (if practical).**
   - Seed: stage a file with `expiresAt = now - 1h` (override the default via the `expiresAt` field on `download_file`'s schema input — not implemented; for the e2e, use the repository's `insertWorkflowFile` test seam directly).
   - Run: hit `/api/cron/cleanup-workflow-files` with a valid bearer.
   - Assertions: response `{ ok: true, scanned: 1, storageDeleted: 1, metadataDeleted: 1, failed: 0 }`; storage object gone; `workflow_files` row gone.

5. **`provider_url` rejection.** (Conditional on §10 decision #1 → Option A.)
   - Seed: synthetic FileRef with `kind=provider_url, provider="slack"`.
   - Run: `slack:upload_file` with that ref.
   - Assertions: handler returns a `success: false` / failed step with code `slack_upload_unsupported_provider_url`; hint message points to `download_file`; no bytes fetched; no Slack API call made.

6. **(Conditional on trigger.)** `file_shared` → workflow dispatch.
   - Seed: an activated workflow whose trigger is `slack_trigger_file_uploaded` with `channel: "C-abc"`.
   - Run: POST a Slack `file_shared` payload to `/api/webhooks/slack`.
   - Assertions: `workflow_runs` row appears (`status: "succeeded"`); trigger payload includes the raw Slack `event` object with `file_id`; downstream actions resolve `{{trigger.payload.file_id}}` correctly.

### Run discipline

- Slack walkthrough specs run sequentially per the Slack 2.1 / 2.3 e2e convention (Playwright serial mode).
- Real V2 internals: auth, OAuth dispatcher, integration rows, workflow create/activate, trigger registration, dispatcher, action handlers, FileRefSchema validation, `stageFileToStorage`, `cleanupExpiredFiles`. Mock only the Slack network boundary.

---

## 10. Open decisions for Marcus

Three real decisions. Two have recommendations; the third is informational.

| # | Decision | Recommendation | Alternative |
|---|---|---|---|
| 1 | Should `upload_file` accept `provider_url` FileRefs in Slack 2.4, or only `v2_storage` + `signed_url`? | **`v2_storage` + `signed_url` only.** `provider_url` rejected at handler entry with a clear hint pointing to `download_file`. Matches CLAUDE.md durable rule #5; keeps Slack 2.4 from prejudging the cross-provider fetcher API. See §5. | Option B in §5 — implement a Slack-specific `providerFetcher` adapter and extend `fetchFileBytes`. Unblocks `slack:get_file_info → slack:upload_file` in a single chain. Risks settling the cross-provider helper API inside a provider slice instead of a platform slice. |
| 2 | Should `slack_trigger_file_uploaded` ship in Slack 2.4, or defer to 2.5? | **Defer to 2.5.** Trigger requires a separate filter file, registration plumbing, and an extra e2e scenario; deferring keeps Slack 2.4 to the three actions + their tests + one e2e. The trigger has no dependency on the action surface (independent slice). | Bundle into 2.4 — adds commit 6 (trigger filter) + e2e scenario 6. Adds ~3 days of work; reduces Slack 2.4 churn count if Marcus prefers fewer slices. |
| 3 | Should `upload_file` accept inline text via a `fileRefFromInlineText` helper, or defer that convenience? | **Defer.** The P-S3 plan §8 listed this as a stretch goal; it requires a new builder that does a one-step storage write (because no inline arm exists by design). Not blocking Slack 2.4; can land as a P-S4 / future-Phase-7 convenience commit if a workflow pattern actually demands it. | Bundle `fileRefFromInlineText` into Slack 2.4 commit 2 alongside the API wrappers. Adds a builder + a few tests; keeps the convenience local to the Slack chain. Risk: ships a builder that may need to move to `core/files/createFileRef.ts` once Gmail / Drive want it, which is fine but more churn. |

### Non-blockers (informational, no decision needed)

- **Leaf-folder reshape under `integrations/slack/api/`.** The folder currently has 27 wrappers. Slack 2.4 adds 4 more, bringing it to ~31 — still well under the 50 limit. No reshape required.
- **Leaf-folder reshape under `integrations/slack/actions/`.** Currently 32 files in the parent (with `channels/` and `users/` subfolders). Adding `files/` subfolder for the 3 new actions (×2 = 6 files) keeps the parent flat. No reshape required.

---

## 11. Exit checklist

This plan is accepted (and Slack 2.4 implementation can begin) when Marcus has:

- [ ] Read sections 1–10.
- [ ] Confirmed the **action surface** (§1 / §4) — three actions, no inline content arms, no `asUser`, no workspace selector.
- [ ] Confirmed the **trigger decision** (§10 #2) — defer to 2.5 or bundle now.
- [ ] Confirmed the **provider_url decision** (§5 / §10 #1) — reject at upload, or implement Slack-specific fetcher.
- [ ] Confirmed the **inline-text decision** (§10 #3) — defer the convenience helper, or bundle now.
- [ ] Confirmed the **scopes** (§6) — `files:read` + `files:write` added; nothing else.
- [ ] Confirmed the **V1 rot list** (§7) — 10 patterns explicitly not ported.
- [ ] Confirmed the **batch plan** (§8) — 5 commits (or 6 if trigger included, 7 if outcomes commit lands).
- [ ] Confirmed the **e2e scope** (§9) — 5 scenarios (6 with trigger).

**Implementation does NOT begin before Marcus checks every applicable box above.**
