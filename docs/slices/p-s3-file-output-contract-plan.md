# P-S3 — File output contract plan

**Status:** Plan / not yet accepted. **Doc-only commit.** No implementation begins until Marcus accepts.
**Branch:** `v2-provider-port-local` (local-only).
**Master plan:** [`docs/slices/phase-2-plan.md`](phase-2-plan.md).
**Direct consumer:** Slack 2.4 (file actions) — blocked on this contract.
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`.
**V2 baseline:** [`integrations/`](../../integrations/), [`contracts/`](../../contracts/).

This is a **platform contract** slice. P-S3 designs the shared file-reference shape that all V2 providers will use when an action's output represents a file (Slack upload/download, Gmail attachments, Outlook attachments, Drive downloads, OneDrive downloads, future AI/document actions). It does NOT implement any provider's file actions — those follow once the contract is accepted.

---

## 1. Problem statement

### What's missing in V2 today

- **No common file output shape.** Every V2 file-touching action invents its own output keys. Drive `upload_file` returns `{ fileId, name, mimeType, parents, webViewLink, size, createdTime }`. OneDrive `get_file` returns `{ itemId, name, kind, size, mimeType, webUrl, downloadUrl, parentReference, ... }`. Different field names, different conventions, no schema. Any downstream action that wants to consume "the file the previous action produced" has to know each provider's bespoke shape.
- **No download infrastructure.** Drive's `filesGet` wrapper is metadata-only by its own comment; OneDrive's `get_file` returns Graph's short-lived `@microsoft.graph.downloadUrl` (~1h) and stops there. No V2 action reads bytes today.
- **No storage primitive.** V2 has zero references to `supabase.storage` across `integrations/`, `services/`, `repositories/`, or `core/`. V1 has a full `FileStorageService` (Supabase `workflow-files` bucket + `workflow_files` table + 24h expiry + 25 MB cap); V2 has none of it.
- **Workflow-runs blob risk.** Per-action outputs persist to `workflow_runs.steps` as JSONB. V1's Slack `downloadFile` returned the entire file as a base64 data URL inside the output — a single download could write a 10 MB+ row into the runs table. V2 needs to prevent this by contract, not by hoping handler authors don't do it.

### Why Slack file actions need a shared contract

V1 Slack `uploadFile` accepts inline `content` (data URL or plain text) and `filename`. V1 Slack `downloadFile` returns the bytes as a base64 data URL inline in the action output. Both surfaces leak into shared concerns:

- **Inline upload only accepts text + base64**, no way to chain "the file Gmail just attached" → "Slack upload" without round-tripping through string encoding in user-visible config.
- **Inline download embeds bytes in `workflow_runs.steps`**, blowing up persistence + audit logs + downstream variable resolution costs.
- **No provider-agnostic way to say "this output is a file you can read later"** — every consumer has to grok every producer's shape.

Without a shared contract, Slack 2.4 would either (a) re-invent V1's antipattern, (b) build its own private storage helper that no other provider can use, or (c) be artificially limited to text uploads / URL-only downloads. None of those serve future Gmail attachment / Outlook attachment / Drive download work.

### Why this should NOT be solved only inside Slack

Reused by every provider that produces or consumes a file:

| Provider | Produces files | Consumes files |
|---|---|---|
| Slack | `download_file`, `get_file_info` | `upload_file` |
| Gmail | `download_attachment` (V1) / `getAttachment` (V1) | `send_email` (V1 attached attachments) |
| Outlook | future `download_attachment` | future `send_email` with attachments |
| Google Drive | future `download_file` (Slice 4 Batch 2) | existing `upload_file` (today accepts inline base64 only) |
| OneDrive | future `download_file` (Slice 8 Batch 2; `downloadUrl` exists, no bytes-fetch action yet) | existing `upload_file` (today accepts inline base64 only) |
| Dropbox | V1 `uploadFile`/`downloadFile` (not yet ported) | same |
| HubSpot / Notion / Airtable | attachment fields on records (lower priority) | same |
| Trello | attachment uploads (later, lower priority) | same |
| Future AI/document parser | n/a | needs to read files produced by Drive / Gmail / Slack |

Putting the contract in `core/files/` lets every provider opt in by accepting / returning `FileRef` objects with no per-provider re-invention.

### Forward compat

Same shape can extend to:
- AI image / video inputs (Anthropic Vision / OpenAI Vision)
- LLM-attached files (Claude Files API)
- Document parsers (PDF → text)
- Workflow inputs (UI file picker)

---

## 2. V1 source audit

### Slack file handlers ([`lib/workflows/actions/slack/`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/slack/))

- **`uploadFile.ts`** (114 LoC) — accepts `content` (`data:` URL or plain text) + `filename`. Decodes base64 server-side; builds a `Blob`; calls Slack's two-step `files.getUploadURLExternal` → `files.completeUploadExternal` flow. Output: `{ fileId, fileName, fileUrl, permalink }`. No size validation; no MIME validation; relies on Slack to reject.
- **`downloadFile.ts`** (62 LoC) — calls `files.info` to get `url_private_download`, fetches with the bot token, **base64-encodes the entire response body into `output.content`** as a `data:<mime>;base64,...` URL. This is the V2 antipattern P-S3 must prevent.
- **`getFileInfo.ts`** (65 LoC) — metadata-only `files.info` wrapper.

### Gmail attachment handlers ([`lib/workflows/actions/gmail/`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/gmail/))

- **`downloadAttachment.ts`** (414 LoC) — multi-step: pulls the message, walks `payload.parts` recursively, applies one of four selection modes (`all` / `id` / `filename` / `pattern`), downloads each attachment as base64, then **calls `uploadToStorage`** which dynamically imports `googleDrive/uploadFile`, `onedrive`, or `dropbox/uploadFile` and chains. The "storage service" config is the *destination provider*, not V2's own storage. Each chained call is a base64 in-memory transfer.
- **`getAttachment.ts`** — similar fetch + base64 output pattern.
- Attachment-on-send (V1 sendEmail) — accepts a stored-file id (`FileStorageService.getFile(nodeId, userId, workflowId)`) plus base64 inline.

### Outlook (V1)

- No standalone `downloadAttachment` action in V1's structure (`microsoftOutlook` dir doesn't exist as a V1 actions namespace per `ls` of V1's actions tree). Attachments are out-of-scope for V1 Outlook. **Net effect:** V2 Outlook attachment work is fresh territory; P-S3 will define how it lands.

### Google Drive / OneDrive (V1)

- **`googleDrive/uploadFile.ts`** — multi-source upload: `sourceType: 'file' | 'node' | 'url'`. Accepts inline `fileFromNode: { data: base64, fileName, mimeType }`, OR a URL it fetches, OR a `FileStorageService.getFile(nodeId, …)` retrieve from the `workflow-files` bucket. Output: `{ fileId, name, webViewLink, webContentLink, ... }`.
- **`googleDrive/getFile.ts`** — exists; behavior similar to V2's existing `get_file` (metadata + Drive's download URL).
- **`onedrive/getFile.ts`** — same pattern; returns the OneDrive item + `@microsoft.graph.downloadUrl`.
- No V1 OneDrive `downloadFile` action handler — V1 stops at metadata.

### Supabase storage round-trip ([`lib/storage/fileStorage.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/storage/fileStorage.ts), 364 LoC)

V1's file storage primitive:
- Supabase storage bucket `workflow-files`.
- Path scheme: `temp-attachments/<userId>/<timestamp>_<randomId>.<ext>`.
- DB table `workflow_files` tracking `file_path`, `file_size`, `file_type`, `node_id`, `user_id`, `workflow_id`, `expires_at`.
- 24h default expiry.
- 25 MB max file size.
- `FileStorageService.{storeFile, getFile, deleteFileByNode, deleteFile, ...}`.
- `workflowFileCleanup.deleteWorkflowTempFiles(paths: Set<string>)` for end-of-execution cleanup.

This is the V1 storage primitive V2 P-S3 will either inherit (port the bucket + table + helper) or replace (different storage model).

### File-related tests in V1

- V1 has unit tests for `FileStorageService.storeFile` size/expiry/cleanup paths.
- No e2e coverage of the full Gmail → Drive attachment chain (the multi-provider chain was effectively untested in V1).

### Key V1 lessons for V2

1. **Inline base64 in outputs is unsafe.** V1's Slack `downloadFile` is the clearest example — anywhere a file is "passed via output" today goes into a JSONB blob.
2. **Provider-to-provider chains via base64 work but are fragile.** V1 Gmail → Drive chain is 414 LoC of glue per integration pair; doesn't scale.
3. **A shared storage bucket + expiring file table is the right primitive.** V1's `workflow-files` bucket + `workflow_files` table is a reasonable starting point.
4. **Size cap is mandatory.** V1 settled on 25 MB; V2 should adopt the same or higher with explicit per-provider override.
5. **Cleanup is a real concern.** V1 has explicit `deleteWorkflowTempFiles` at end-of-execution + a 24h expiry safety net. V2 needs both.

---

## 3. V2 current state audit

### Existing V2 file outputs (per-provider, ad hoc)

| Provider | Action | Output keys | Source |
|---|---|---|---|
| Google Drive | `upload_file` | `fileId, name, mimeType, parents, webViewLink, size, createdTime` | [`integrations/google-drive/actions/uploadFile.ts:55-64`](../../integrations/google-drive/actions/uploadFile.ts#L55) |
| Google Drive | `list_files` | `files, nextPageToken, incompleteSearch` (each entry: Drive resource verbatim) | [`integrations/google-drive/actions/listFiles.ts:42-46`](../../integrations/google-drive/actions/listFiles.ts#L42) |
| Google Drive | `filesGet` (wrapper) | metadata-only (no bytes); explicit "alt=media is OUT OF SCOPE" comment | [`integrations/google-drive/api/filesGet.ts:13`](../../integrations/google-drive/api/filesGet.ts#L13) |
| OneDrive | `upload_file` | not inspected in this audit, but follows Drive's pattern per same Slice convention | [`integrations/microsoft-onedrive/actions/uploadFile.schema.ts`](../../integrations/microsoft-onedrive/actions/uploadFile.schema.ts) |
| OneDrive | `get_file` | `itemId, name, kind, size, mimeType, webUrl, downloadUrl, parentReference, createdDateTime, lastModifiedDateTime` | [`integrations/microsoft-onedrive/actions/getFile.ts:42-52`](../../integrations/microsoft-onedrive/actions/getFile.ts#L42) |
| OneDrive | `list_items` | similar shape; doesn't define a "file" unit | [`integrations/microsoft-onedrive/actions/listItems.schema.ts`](../../integrations/microsoft-onedrive/actions/listItems.schema.ts) |
| Slack | (file actions deferred) | n/a — Slack 2.4 is blocked on P-S3 | — |
| Gmail | (no attachment actions yet) | n/a — Slice 2 is send-only | — |
| Outlook | (no attachment actions yet) | n/a — Slice 6 is send-only | — |

**Key observations:**
- `fileId` vs `itemId` already diverged.
- `webViewLink` vs `webUrl` — same concept, different names.
- `mimeType` is the only field that's consistent.
- OneDrive's `downloadUrl` (provider pre-signed, ~1h expiry) is the closest thing to a shared download primitive, but it's nested + bespoke.
- No `kind`/`mimeType`/`sizeBytes` convention; no provider exposes a normalized file shape.

### Upload-side current state

Both Drive and OneDrive `upload_file` accept inline `content: string` + `contentEncoding: "utf8" | "base64"`. Both wrappers enforce size caps (25 MB on Drive, 4 MB on OneDrive). Neither accepts a "file reference from a previous node" — the schemas explicitly note "V1's multi-source upload deliberately NOT ported."

This means today's V2 cannot chain `Gmail download attachment → Drive upload file` without manually pasting base64 through the workflow variables — exactly the antipattern P-S3 must replace.

### Storage helpers

**None.** Grep across `integrations/`, `services/`, `repositories/`, `core/` for `supabase.storage` or `storage.from` returns zero hits. The single hit is a comment inside an HubSpot subscription-refs migration unrelated to file storage. V2 has never written to or read from Supabase storage.

### File download / upload helpers

**None outside per-provider wrappers.** No shared `fetchAuthedFile(url, token)`, no shared `streamToBuffer`, no shared `storeFileForWorkflow(ref)`. Each provider's wrapper is self-contained.

### Workflow variable / data passing

Per [`services/execution/handlers/types.ts`](../../services/execution/handlers/types.ts):
- Handler output is `Readonly<Record<string, unknown>>` and becomes `context.variables[nodeId]` for downstream nodes.
- The engine pre-resolves `{{nodeId.field}}` references before dispatching the next handler.
- Variables persist into `workflow_runs.steps` (JSONB).

**Implication:** Any "file ref" we put in an output IS persisted and IS resolvable as a variable. We can't put a `Buffer` or a stream there — it has to serialize to JSON. The file output contract must be a plain-object shape, NOT a binary handle.

### Security constraints

Looking at V2's existing patterns:
- All provider tokens decrypted via `core/encryption/tokens.decryptToken` at handler boundary; tokens never enter `output`.
- No PII / no tokens / no signing-secrets logged at non-debug levels (CLAUDE.md `users:read.email` Deep Gotcha cited this).
- Strict Zod schemas at every handler entry; no unknown-key flow-through.
- File operations would inherit these conventions.

### Runs table size

`workflow_runs.steps` is JSONB. Postgres TOAST handles individual row up to 1 GB, but practical query performance + audit / debug surface argues for keeping individual outputs well under 1 MB. A 25 MB base64 blob inside a step is 33 MB of JSONB; it's persisted, indexed alongside other steps, transferred to the UI on every run-history fetch. **P-S3 must keep file bytes out of `workflow_runs.steps`.**

---

## 4. File output contract design

### Recommended shape: `FileRef`

A plain-object descriptor that points to file content stored elsewhere (provider URL, V2 Supabase storage, or pre-signed download URL). **Never carries inline bytes.**

```ts
// contracts/file.ts

import { z } from "zod";

/**
 * Discriminator for how the file's bytes are retrievable.
 *
 *   - `provider_url`  : provider issued a (short-lived, often token-
 *                       protected) URL. The producer also exposes the
 *                       provider id so downstream code knows which
 *                       provider's auth header is needed for fetch.
 *   - `v2_storage`    : bytes live in V2's Supabase storage at
 *                       `storagePath`. Re-fetch via the V2 storage
 *                       helper; no per-provider auth needed.
 *   - `signed_url`    : pre-signed URL usable without auth headers
 *                       (Supabase signed URL OR provider public link).
 *                       Expires at `expiresAt`.
 */
export const FileRefKindSchema = z.enum([
  "provider_url",
  "v2_storage",
  "signed_url",
]);
export type FileRefKind = z.infer<typeof FileRefKindSchema>;

export const FileRefSchema = z.object({
  kind: FileRefKindSchema,
  /** Stable display name (the file's own name). */
  name: z.string().min(1).max(512),
  /** RFC-1341 type; "application/octet-stream" if unknown. */
  mimeType: z.string().min(1),
  /** Byte length when known. Optional because providers don't always say. */
  sizeBytes: z.number().int().nonnegative().optional(),

  /**
   * One of three is set, per `kind`.
   * - kind=provider_url → `url` + `provider` populated; consumer must
   *   attach the provider's bearer token when fetching.
   * - kind=v2_storage   → `storagePath` populated; consumer fetches via
   *   the V2 storage helper (which authenticates server-side).
   * - kind=signed_url   → `url` populated; consumer fetches with no
   *   auth header. `expiresAt` SHOULD be set when known.
   */
  url: z.string().url().optional(),
  storagePath: z.string().min(1).optional(),

  /** Issuer of `url` when kind=provider_url (auth header negotiation). */
  provider: z.string().regex(/^[a-z][a-z0-9_-]*$/).optional(),

  /** ISO-8601 expiry for time-limited refs. */
  expiresAt: z.string().datetime().optional(),

  /**
   * Optional provider-side stable id (e.g., Slack `F123`, Drive
   * `drive_file_id`). Lets downstream actions on the same provider
   * skip re-fetching when they can pass the id directly.
   */
  providerFileId: z.string().optional(),

  /**
   * Free-form provider metadata. Producers MAY include extra fields
   * (createdTime, lastModified, webViewLink, etc.). Consumers MUST
   * NOT depend on any specific key — only the contract fields above
   * are guaranteed.
   */
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type FileRef = z.infer<typeof FileRefSchema>;
```

**Why this shape:**
- One required discriminator (`kind`) — keeps consumer code clean (`switch (ref.kind)`).
- Three transport options with non-overlapping fields — avoids the "which URL do I trust?" ambiguity V1 had with `url_private` vs `url_private_download` vs `permalink`.
- `provider` field lets `kind=provider_url` consumers find the right OAuth bearer without provider sniffing on the URL host.
- No inline bytes — by construction this shape can never persist a 10 MB blob to `workflow_runs.steps`.
- `metadata` escape hatch — keeps provider-specific richness available without polluting the contract.

### Why not the user's suggested fields verbatim

The user's example had `source: "url" | "bytes" | "storage" | "provider_reference"`. Dropped `"bytes"` because that's the antipattern P-S3 explicitly prevents — keeping it as a valid value invites regression. Renamed `source` → `kind` for parity with V2's existing `TriggerEvent.eventType` / `FilterResult.kind` discriminator conventions. `provider_reference` collapsed into `provider_url + providerFileId` — every "reference" is also a URL in practice (Slack `files.info` URL, Drive `webContentLink`, OneDrive `@microsoft.graph.downloadUrl`).

### What producers emit

Slack `download_file` emits `{ file: FileRef }` with `kind: "v2_storage"` (after V2 stages the bytes into Supabase). Slack `get_file_info` emits `{ file: FileRef }` with `kind: "provider_url"` (metadata only; consumer pulls bytes lazily if needed).

Drive `download_file` (future) emits `{ file: FileRef }` with `kind: "provider_url"` (Drive's `webContentLink` requires a Drive bearer).

OneDrive `get_file` (today, post-2.4) updates to emit `{ file: FileRef }` with `kind: "signed_url"` (Graph's pre-signed `downloadUrl` is auth-free for ~1h) — preserves the current convenience output as a backward-compat shim.

Gmail `download_attachment` (future) emits `{ file: FileRef }` with `kind: "v2_storage"` (attachments are stable enough to stage; saves re-fetch on cross-provider chains).

### What consumers accept

Slack `upload_file` (2.4) accepts `file: FileRef`. Inside the handler:
- `kind=v2_storage` → fetch via V2 storage helper, stream into Slack upload.
- `kind=provider_url` → look up the producer's provider, attach bearer, fetch, stream.
- `kind=signed_url` → fetch directly, stream.

Drive `upload_file` (extended) gains a `file: FileRef` alternative to its existing `content` + `contentEncoding`. Same three-arm fetch.

### Convenience builders + type guards

```ts
// core/files/createFileRef.ts
export function fileRefFromProviderUrl(opts: {
  name: string; mimeType: string; sizeBytes?: number;
  url: string; provider: string; providerFileId?: string;
  expiresAt?: string; metadata?: Record<string, unknown>;
}): FileRef { /* … */ }

export function fileRefFromStoragePath(opts: {
  name: string; mimeType: string; sizeBytes?: number;
  storagePath: string; providerFileId?: string;
  expiresAt?: string; metadata?: Record<string, unknown>;
}): FileRef { /* … */ }

export function fileRefFromSignedUrl(opts: {
  name: string; mimeType: string; sizeBytes?: number;
  url: string; expiresAt?: string;
  providerFileId?: string; metadata?: Record<string, unknown>;
}): FileRef { /* … */ }
```

Builders compose the schema-validated shape and are the recommended construction path; the schema is the validation path. Handlers call the builder, never the raw object literal.

---

## 5. Storage strategy

### Recommendation

**Adopt V1's `workflow-files` bucket pattern but tighten the contract.**

| Aspect | V1 | V2 P-S3 recommendation |
|---|---|---|
| Bucket | `workflow-files` | `workflow-files` (port the bucket; reuse the path scheme) |
| Path | `temp-attachments/<userId>/<ts>_<rnd>.<ext>` | `workflow-files/<userId>/<workflowId>/<runId>/<nodeId>/<filename>` (deterministic per-run; cleanup keys off prefix) |
| Index | `workflow_files` table | `workflow_files` table — see migration §5.3 |
| Expiry | 24h | 24h default; per-`file_ref` `expiresAt` overrides |
| Max size | 25 MB | 25 MB default; per-provider can lower (Slack/Drive 25 MB; OneDrive 4 MB; Outlook 3 MB) |
| Inline base64 | yes (in V1 Slack download) | **never** — contract rejects |
| Cleanup | end-of-run via `deleteWorkflowTempFiles` | end-of-run callback wired into execution-finalization service + nightly reconciler |

### Should small files be passed inline?

**No.** Marcus's plan asked the question explicitly; the answer is no for two reasons:

1. **The contract is the wall against runs-table bloat.** Adding an inline arm immediately re-opens the V1 antipattern surface — even a 1 MB threshold means a 50-step workflow producing 1 MB files each step puts 50 MB into one runs row.
2. **The cost of always staging tiny files is small.** Supabase storage round-trip for a sub-100KB file is ~10ms. A 100KB file is below the noise floor of provider API latency.

If a future use case proves the staging round-trip is too expensive (e.g., AI inline image preview where the next node is in the same handler call), we add `kind: "inline_text"` for text payloads only, capped at 64 KB. **Not in P-S3.**

### Should V2 only pass references?

Yes — that's exactly the contract.

### How do we handle expiring provider URLs?

- `kind=provider_url` carries `expiresAt`. Consumer fetches the bytes as part of action execution (i.e., promptly within seconds of receiving the ref); doesn't try to persist the URL itself for later.
- If a workflow has a long delay node between producer and consumer (e.g., 24h sleep), the contract recommends `kind=v2_storage` for the producer — the bytes are durable, the URL isn't.
- Producer's choice of `kind` is a per-action decision documented in the handler.

### How to avoid binary blobs in `workflow_runs.steps`

Hard rule: **handlers MUST emit only `FileRef` (a small JSON object) in their output**. The Zod schema enforces no `content`/`bytes`/`base64` fields. Lint rule `file-output-no-bytes` can audit `output` literals for forbidden keys (deferred to P-S3 Commit 6 if needed).

### Size limits

| Provider | Cap | Source |
|---|---|---|
| Default | 25 MB | matches V1 baseline |
| Slack | 25 MB | Slack's own limit on `files.uploadV2` is 1 GB but rate-limit risk; 25 MB practical cap |
| Google Drive | 25 MB | existing wrapper cap |
| OneDrive | 4 MB | Graph's simple-upload threshold; resumable uploads are out of scope |
| Outlook | 3 MB | Graph attachment cap |
| Gmail | 25 MB | Google's MIME message cap |

The `FileRef` itself doesn't carry a cap — caps are enforced by the producer / consumer per their API. P-S3 publishes a `FILE_REF_SIZE_GUIDANCE` constant in `core/files/limits.ts` documenting the recommended per-provider cap; not a hard enforcement.

### Cleanup / reconciler

Two layers:

1. **End-of-run inline cleanup** — at the engine finalization layer (where `workflow_runs.steps` is persisted), iterate the run's `FileRef`s and delete any `kind=v2_storage` entries whose `expiresAt` is unset or < `now() + retention_window`. Retention window default = 0 (delete immediately); per-workflow opt-out for "keep files".
2. **Nightly reconciler** — cron job (`/api/cron/cleanup-workflow-files`) deletes `workflow_files` rows whose `expires_at < now() - grace_period`, alongside their bucket objects. Catches abandoned uploads from crashed runs.

Both implemented in a single helper file `services/files/cleanupExpiredFiles.ts`.

---

## 6. Security model

### URL exposure

- **No public URLs by default.** `kind=signed_url` MUST carry `expiresAt`. `kind=provider_url` is, by definition, only useful with the provider's bearer — so leaking the URL alone doesn't grant access (defense in depth via Slack/Drive/Graph's own auth).
- **Supabase signed URLs** (when V2 generates them downstream) use short expiry (default 1h, override per call) + path-restricted scope.
- **V2 storage paths** include `<userId>` segment + RLS on `workflow_files` keyed on `user_id` — cross-tenant retrieval blocked at DB layer.

### Token leakage

- `FileRef.url` MUST NOT embed tokens in the URL itself. Slack's `url_private_download` is unsigned (auth comes from the bearer header) — safe. Drive's `webContentLink` is similar. If a future provider returns a URL with a query-param token, the producer wraps it in `kind=signed_url` and treats the URL as a secret in logs (next bullet).
- `metadata` MUST NOT contain bearer tokens, OAuth credentials, or signing secrets. Schema doesn't enforce this (free-form); code review + a small grep-based test in `core/files/__tests__/no-secrets-in-metadata.test.ts` checks well-known patterns.

### Binary content in logs

- **Never log file bytes.** Handlers fetching content for upload do not log the body. The shared fetch helper (Commit 3) logs only `{ provider, sizeBytes, mimeType }`.
- **Never log signed/provider URLs in user-facing surfaces** (`workflow_runs.steps` is OK — that's part of the contract; admin debug panel + server logs are NOT).

### MIME validation

- `FileRef.mimeType` validated as a non-empty string (Zod). No allow-list at the contract level — providers enforce their own (Slack accepts most; Gmail blocks executables; Drive accepts all).
- Consumer-side: each provider's `upload_file` may reject specific mime types per its own policy. Documented per-provider.

### File-name traversal

- `FileRef.name` enforced as `min(1) max(512)`. Provider-side handlers MUST sanitize before passing to storage paths or shell-like APIs. The storage path scheme uses a fixed segment structure that doesn't interpolate the file name into the path directly — `<userId>/<workflowId>/<runId>/<nodeId>/<filename>` where filename is the last segment; `..` / `/` in the filename get URL-encoded by Supabase but should be sanitized upstream too.
- Lint: `core/files/sanitizeFilename.ts` helper that strips path separators + null bytes; producers call it before constructing the storage path.

### Retention

- Default 24h matches V1. Per-`FileRef` `expiresAt` is the source of truth.
- No PII-specific retention; if a file contains PII, the workflow is responsible for marking the file or not staging it. Out of scope for the contract.

### Virus scanning

**Out of scope for P-S3.** Documented as future security work (§9). Recommended Phase 7 (hardening) item: pre-staging virus scan via an external service before any `kind=v2_storage` write. Today, V2 trusts provider content + assumes a sealed multi-tenant environment.

---

## 7. Contract location

### Recommended file map

```
contracts/
  file.ts                         # FileRef + FileRefSchema + FileRefKind exports
core/
  files/
    createFileRef.ts              # 3 builder helpers (provider_url, v2_storage, signed_url)
    sanitizeFilename.ts           # path-traversal + control-char strip
    limits.ts                     # FILE_REF_SIZE_GUIDANCE constants
    fetchFileBytes.ts             # consumer-side fetch helper: ref → Buffer
                                  # Routes per kind; attaches provider bearer
                                  # for provider_url; uses storage helper for
                                  # v2_storage; direct fetch for signed_url.
    __tests__/                    # contract + builder + fetch tests
services/
  files/
    stageFileToStorage.ts         # producer-side helper: bytes+meta → FileRef
                                  # (kind=v2_storage). Uploads to bucket,
                                  # inserts workflow_files row, returns ref.
    cleanupExpiredFiles.ts        # end-of-run + nightly cron entry point.
repositories/
  workflowFiles.ts                # workflow_files table CRUD (insert, list,
                                  # delete by id / by prefix / by expiry).
supabase/migrations/
  YYYYMMDDHHMMSS_workflow_files_storage.sql
                                  # Creates `workflow_files` table + RLS +
                                  # bucket setup (if doable in SQL; otherwise
                                  # bucket is created out-of-band per Supabase
                                  # storage convention).
tests/unit/
  contracts/file.test.ts          # FileRefSchema parse/reject cases.
  core/files/                     # builder + sanitize + limits + fetch tests.
  services/files/                 # stage + cleanup tests.
  repositories/workflowFiles.test.ts
```

**Why this split:**
- `contracts/file.ts` — pure schema, no IO. Matches the convention of `contracts/integration.ts`.
- `core/files/` — pure helpers (builders, fetch, sanitize, limits). No DB writes from here. Mirrors `core/integrations/`, `core/triggers/`.
- `services/files/` — coordination + side effects. Stages to storage; cleans up. Matches `services/oauth/`, `services/triggers/`.
- `repositories/workflowFiles.ts` — single-table CRUD. Matches `repositories/integrations.ts`.
- No "shared adapter" layer — providers consume `core/files/fetchFileBytes` directly (one shared function, three branches per `kind`).

### Tests location

Standard V2 convention: `tests/unit/<source-path>` mirror. E2e additions to `tests/e2e/slice-1-slack-walkthrough.spec.ts` for Slack 2.4 — out of scope here.

---

## 8. Slack 2.4 dependency map

Once P-S3 is accepted, Slack 2.4 lands the following:

### `slack:upload_file`

**Schema:**
```ts
{
  channel: string,                  // single channel id (CSV via Q7 if multi)
  file: FileRef,                    // P-S3 contract
  title?: string,
  initialComment?: string,
  filetype?: string,                // optional Slack snippet_type
}
```

**Handler flow:**
1. Validate config.
2. `core/files/fetchFileBytes(config.file)` → `Buffer`. Routes per kind.
3. Slack's two-step upload: `files.getUploadURLExternal` → POST bytes → `files.completeUploadExternal`.
4. Output: `{ file: FileRef }` — the Slack-side result projected as a new `FileRef` with `kind=provider_url`, `provider="slack"`, `providerFileId=<F…>`, `url=<url_private>`.

### `slack:download_file`

**Schema:**
```ts
{ fileId: string }                  // Slack file id (F-prefix)
```

**Handler flow:**
1. `files.info` for metadata + `url_private_download`.
2. Fetch bytes with the bot token.
3. `services/files/stageFileToStorage` → `FileRef(kind=v2_storage)`. Default 24h expiry.
4. Output: `{ file: FileRef }`.

This is the key contract: V1's antipattern ("download returns base64 inline") is replaced with "download stages bytes; output is a FileRef".

### `slack:get_file_info`

**Schema:**
```ts
{ fileId: string }
```

**Handler flow:**
1. `files.info` only — no bytes fetch.
2. Output: `{ file: FileRef }` with `kind=provider_url`, `providerFileId`, `url`, `provider="slack"`. Consumer chooses whether to fetch lazily.

### `fileUploaded` trigger (optional)

If Slack 2.4 includes the trigger:
- Slack `file_shared` event → normalize → trigger payload includes a `FileRef(kind=provider_url)` for the uploaded file.
- Downstream workflows can chain to `slack:download_file` (stages to storage) or pass the ref to any other provider's upload.

### Slack upload should accept

- ✅ `FileRef` (the contract).
- ✅ Inline text via a trivial helper builder: `fileRefFromInlineText("hello.txt", "hello world")` returns a `kind=v2_storage` ref after a 1-step storage write. Convenience for "send a text snippet" workflows; not a separate config arm. **Stretch goal:** add `fileRefFromInlineText` to the builders module.
- ❌ Raw URL string (consumers compose the builder).
- ❌ Plain `content` + `contentEncoding` (V1 antipattern; no longer supported).

### Slack download should return

- ✅ `FileRef` with `kind=v2_storage`. Default — bytes are durable across delays.
- ❌ Base64 inline (V1 antipattern).
- ❌ Short-lived Slack URL only (caller would need to know to re-fetch within the hour).

---

## 9. What is NOT in P-S3

Explicit exclusions to keep the slice tight:

- ❌ Slack file action implementation (Slack 2.4).
- ❌ Gmail attachment action implementation.
- ❌ Outlook attachment action implementation.
- ❌ Drive `download_file` action.
- ❌ OneDrive `download_file` action.
- ❌ Updating existing Drive/OneDrive `upload_file` to accept `FileRef` (follow-up after P-S3 ships).
- ❌ UI file picker / workflow input file upload.
- ❌ Long-term file manager (browse / share / re-use across workflows).
- ❌ AI document parsing (PDF→text, OCR).
- ❌ Virus scanning (Phase 7 hardening).
- ❌ Per-workflow / per-workspace storage quota enforcement (Phase 7 billing).
- ❌ Resumable upload support (Graph large-file flow; deferred).
- ❌ Streaming download / streaming upload (everything in Phase 2 is buffered; reconsider in Phase 7).
- ❌ Lint rule auto-enforcement that handler outputs never contain `content` / `bytes` / `base64` keys — soft guidance now, lint enforcement deferred to a follow-up commit if needed.

---

## 10. Implementation batch plan

Recommended 6 commits after this plan is accepted.

| # | Commit | What lands |
|---|---|---|
| 1 | (this doc) | `docs: plan P-S3 file output contract` |
| 2 | `feat(files): add FileRef contract + builders + size guidance + tests` | `contracts/file.ts`, `core/files/createFileRef.ts`, `core/files/sanitizeFilename.ts`, `core/files/limits.ts`. Pure helpers; no DB; no storage. ~40 tests across contracts + core/files. |
| 3 | `feat(files): add workflow_files repository + storage migration` | `supabase/migrations/YYYY_workflow_files_storage.sql` (table + RLS; bucket created out-of-band per ops). `repositories/workflowFiles.ts`. ~10 tests covering insert / list-by-prefix / delete-by-expiry. |
| 4 | `feat(files): add stage + fetch + cleanup services` | `services/files/stageFileToStorage.ts`, `core/files/fetchFileBytes.ts`, `services/files/cleanupExpiredFiles.ts`, `/api/cron/cleanup-workflow-files/route.ts`. ~20 tests. |
| 5 | `docs(files): P-S3 outcomes + CLAUDE.md durable patterns` | Retro doc + CLAUDE.md "Deep Gotcha" entry: "Action outputs never carry file bytes — use FileRef + storage." |
| 6 | (handoff to Slack 2.4) | Slack 2.4 plan update referencing the live contract. Implementation begins under the Slack 2.4 commit chain, not here. |

**Estimate sanity check.** 5 implementation commits (1 doc + 2 contracts/repo + 1 services + 1 docs) is tighter than Slack 2.3's 6 because there's no e2e walkthrough — P-S3 is infrastructure that downstream providers exercise. Total LoC estimate: ~600 source + ~800 tests.

### Gates per commit

Same five gates as every other V2 slice:
```
npx tsc --noEmit
npm run lint
npm run lint:structure
npm run lint:migrations
npm test
```

Migration commit (#3) is the only one touching `supabase/migrations/`; the `check-migration-rls.mjs` gate verifies RLS + at least one policy on the new `workflow_files` table.

### Rollback safety

- Commits #1, #5 — doc-only — trivial rollback.
- Commit #2 — pure additions, no consumers — trivial rollback.
- Commit #3 — migration adds new objects only (no existing-table alterations) — `down` is a `DROP TABLE workflow_files`. Storage bucket creation is idempotent.
- Commit #4 — adds services + cron route. No consumers yet — rollback removes the new files.
- Commit #6 — Slack 2.4 hand-off doc.

No commit in this slice modifies an existing handler. All P-S3 surface is additive.

---

## 11. Open decisions for Marcus

Real decisions, not rhetorical questions:

| # | Decision | Recommendation | Alternative |
|---|---|---|---|
| 1 | Should V2 stage downloaded provider files in Supabase storage by default (`kind=v2_storage`)? | **Yes — for download actions.** Durability across workflow delays + cross-provider chains is the main value of staging. | Default to `kind=provider_url` and let the consumer stage. Costs the consumer a fetch + a stage; risks expiry between producer and consumer. |
| 2 | Allow inline file content (`kind=inline_text` / `kind=inline_bytes`)? | **No — out of P-S3.** The contract is the wall against runs-table bloat. If a use case proves staging round-trip is too expensive, add `kind=inline_text` (text only, ≤ 64 KB) in a follow-up. | Add `inline_text` now for ergonomics; risks the same V1 antipattern surface. |
| 3 | Default retention for staged files? | **24h** — matches V1; reasonable for "use a file in the next workflow step that runs within minutes/hours". | 7 days — more lenient; bigger storage footprint; needs quota work earlier. |
| 4 | Phase classification of file actions: parity (Phase 2) or hardening (Phase 7)? | **Phase 2.** P-S3 contract + minimal storage stack ships in Phase 2 to unblock Slack 2.4; per-provider quota / virus scan / streaming move to Phase 7. | Defer all file work to Phase 7. Costs the rest of Phase 2 the "Gmail → Drive chain" use case + Slack 2.4 indefinitely. |
| 5 | Bucket name + path scheme? | **`workflow-files` bucket + `<userId>/<workflowId>/<runId>/<nodeId>/<filename>`.** Same bucket name as V1 (familiarity), but per-run scoping for cleanup-by-prefix. | V1's flat `temp-attachments/<userId>/<filename>` — simpler but harder to clean up partial runs. |
| 6 | Update existing Drive + OneDrive `upload_file` to also accept `FileRef`? | **Follow-up after P-S3 ships** — not in P-S3 scope, but worth doing in the same Phase 2 stretch so cross-provider chains work uniformly. Could be one PR per provider after P-S3 lands. | Bundle into P-S3 itself — broadens the slice and delays Slack 2.4. |
| 7 | Whether to introduce a `kind=signed_url` arm at all in P-S3? | **Yes** — OneDrive's `@microsoft.graph.downloadUrl` is auth-free for ~1h and is the simplest path for OneDrive `get_file` to expose what it already returns. Removing the arm forces an extra stage round-trip every OneDrive read. | Drop it; everything routes through `provider_url` or `v2_storage`. Slightly cleaner spec; loses an existing capability. |
| 8 | Where does the lint rule against bytes-in-outputs live (or do we even need one)? | **Defer to a follow-up commit.** Soft guidance + handler convention is enough at P-S3 land; a lint rule only matters once we have a regression. | Add the lint rule in Commit 2 alongside the contract — wider scope; risk of false positives on unrelated keys. |

---

## 12. Exit checklist

This plan is accepted (and P-S3 implementation can begin) when Marcus has:

- [ ] Read sections 1–11.
- [ ] Confirmed the **FileRef shape** (§4) — `kind` discriminator with three arms; no inline bytes.
- [ ] Confirmed the **storage strategy** (§5) — Supabase `workflow-files` bucket + `workflow_files` table + 24h default; no inline path.
- [ ] Confirmed the **security model** (§6) — no public URLs by default; provider URLs not logged at user-facing levels; virus scan deferred to Phase 7.
- [ ] Confirmed the **file map** (§7) — `contracts/file.ts`, `core/files/`, `services/files/`, `repositories/workflowFiles.ts`, single migration.
- [ ] Confirmed the **Slack 2.4 dependency map** (§8) — `upload_file` accepts FileRef; `download_file` returns `kind=v2_storage`; `get_file_info` returns `kind=provider_url`.
- [ ] Confirmed the **exclusions** (§9) — no Gmail/Outlook attachments, no UI work, no virus scan, no streaming.
- [ ] Confirmed the **6-commit batch plan** (§10).
- [ ] Made the **8 open decisions** (§11) — at minimum #1, #2, #3, #5, #7.

**Implementation does NOT begin before Marcus checks every box above.**
