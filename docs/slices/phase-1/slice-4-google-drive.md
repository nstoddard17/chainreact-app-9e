# Slice 4 — Google Drive provider port

**Branch:** `slice-4-google-drive` (off `slice-3-google-calendar` @ `17293e5e8`).
**Reference codebase:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e` (V1).
**Goal:** Port Google Drive from V1 with five actions (`upload_file`, `create_folder`, `list_files`, `move_file`, `delete_file`) plus a watch-based push trigger (`file_changed`). Drive rides every piece of platform infrastructure Calendar built — no new platform machinery.

Batches:
- **Batch 1** (this slice) — provider port + unit tests + gates green.
- **Batch 2** — `slice-4b-google-drive-walkthrough` — Playwright e2e with mocked Drive boundary. Defer until Batch 1 is green.

---

## Why Drive after Calendar

Calendar landed:
- shared Google OAuth helper at `integrations/_shared/google/oauth.ts`
- subscription-watch lifecycle (`activationRegistry` / `deactivationRegistry` / `subscriptionRegistry` / `runRenewals` / `app/api/cron/renew-watch-subscriptions/route.ts`)
- per-provider webhook route convention (`app/api/webhooks/<provider>/route.ts`)
- HMAC channel-token pattern
- DB-backed dedup (`webhook_event_dedup`)
- Q-contract helpers (Q4 idempotency, Q7 recipient parsing, Q11 explicit-field, Q12 timezone)

Drive plugs into all of them. The only new code is Drive's own manifest, OAuth, action handlers, trigger lifecycle, and the per-provider webhook route. Zero new platform tables. Zero new cron jobs.

---

## Confirmed scope decisions

1. **Single trigger** — `file_changed`, with payload fields `changeKind: "created" | "updated" | "removed"`, `objectKind: "file" | "folder"`, plus file id, name, mimeType, parents, htmlLink, raw Drive metadata. Mirrors Calendar's `event_changed` + `changeKind` decision. No V1-style three-trigger split (`new_file_in_folder` / `new_folder_in_folder` / `file_updated`) — workflow authors filter downstream on payload fields.
2. **Scope** — `https://www.googleapis.com/auth/drive` (full read/write/watch) + `https://www.googleapis.com/auth/userinfo.email` (OIDC userinfo for accountId). `drive.file` (narrow) and `drive.readonly` are too narrow for the approved Batch 1 surface (folder watch + writes). Manifest matches Calendar's pattern.
3. **Channel-token helper** — extracted to `integrations/_shared/google/channelToken.ts` (Commit 1). Calendar imports updated to the shared path; old `integrations/google-calendar/utils/channelToken.ts` deleted.
4. **Action subset** — `upload_file`, `create_folder`, `list_files`, `move_file`, `delete_file`. `upload_file` ports the simplified V2 shape: direct content/body upload, filename, mimeType, optional parent folder. V1's multi-source-mode upload (URL / piped buffer / runtime resolver) is NOT ported.
5. **Cursor mechanic** — Drive's `pageToken` against `changes.list`, not Calendar's `syncToken` against `events.list`. `pull.ts` paginates `changes.list` until terminal `newStartPageToken` is reached. On expired/invalid page token, re-baseline via `changes.getStartPageToken`, emit zero events, log + return the recovery signal, continue next time.
6. **Root watch** — `fileId: "root"` stored explicitly in `trigger_resources.config` so renewal can re-watch the same target (V1's `fileId || 'root'` collapse loses information).

---

## V1 reference paths

OAuth + scopes:
- [lib/integrations/oauthConfig.ts](../../../nstoddard17/chainreact-app-9e/lib/integrations/oauthConfig.ts) — `"google-drive"` entry. V1 leaves scope blank; V2 sets it explicitly.

Node manifest:
- [lib/workflows/nodes/providers/google-drive/index.ts](../../../nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/google-drive/index.ts) — schemas, fields, output shapes, dynamic loaders.

Action handlers:
- [lib/workflows/actions/googleDrive/uploadFile.ts](../../../nstoddard17/chainreact-app-9e/lib/workflows/actions/googleDrive/uploadFile.ts)
- [lib/workflows/actions/googleDrive/createFolder.ts](../../../nstoddard17/chainreact-app-9e/lib/workflows/actions/googleDrive/createFolder.ts)
- [lib/workflows/actions/googleDrive/listFiles.ts](../../../nstoddard17/chainreact-app-9e/lib/workflows/actions/googleDrive/listFiles.ts)
- [lib/workflows/actions/googleDrive/moveFile.ts](../../../nstoddard17/chainreact-app-9e/lib/workflows/actions/googleDrive/moveFile.ts)
- [lib/workflows/actions/googleDrive/deleteFile.ts](../../../nstoddard17/chainreact-app-9e/lib/workflows/actions/googleDrive/deleteFile.ts)

Watch lifecycle (shared with Gmail/Calendar/Docs/Sheets in V1):
- [lib/triggers/providers/GoogleApisTriggerLifecycle.ts](../../../nstoddard17/chainreact-app-9e/lib/triggers/providers/GoogleApisTriggerLifecycle.ts) — Drive sections at lines 241–243, 414–441, 632–639. Drive watch: `drive.files.watch({fileId: fileId || 'root', supportsAllDrives: true, requestBody: { id, type: 'web_hook', address, token }})` paired with `drive.changes.getStartPageToken({ supportsAllDrives: true })` for the baseline cursor.

Webhook receiver:
- [app/api/webhooks/google/route.ts](../../../nstoddard17/chainreact-app-9e/app/api/webhooks/google/route.ts) — V1 multiplexer; V2 ports to a per-provider route at `app/api/webhooks/google-drive/route.ts`.

Renewal cron:
- [lib/webhooks/google-watch-renewal.ts](../../../nstoddard17/chainreact-app-9e/lib/webhooks/google-watch-renewal.ts) — provider-agnostic in V1; V2 uses the existing `services/triggers/runRenewals.ts` + `subscriptionRegistry`.

API wrapper:
- [lib/integrations/google-drive.ts](../../../nstoddard17/chainreact-app-9e/lib/integrations/google-drive.ts) — small (only `getGoogleDriveFiles`); V2 inlines per-action API wrappers in `integrations/google-drive/api/`.

Tests (style reference):
- `__tests__/nodes/google-drive-upload-file.test.ts` — V1 has only this one. V2 builds a richer test set per Calendar's example.

DEPRECATED — DO NOT COPY:
- [lib/webhooks/google-drive-watch-setup.ts](../../../nstoddard17/chainreact-app-9e/lib/webhooks/google-drive-watch-setup.ts) — old `setupGoogleDriveWatch()` writing to a `google_watch_subscriptions` table. Superseded in V1 by `GoogleApisTriggerLifecycle` + `trigger_resources`. V2 uses `trigger_resources` only.

---

## V2 target paths

**Created in Commit 1:**
- `integrations/_shared/google/channelToken.ts` (extracted from Calendar)
- `tests/unit/integrations/_shared/google/channelToken.test.ts`
- `docs/slices/slice-4-google-drive.md` (this file)

**Created in Commit 2:**
- `integrations/google-drive/manifest.ts`
- `integrations/google-drive/oauth.ts`
- `tests/unit/integrations/google-drive/manifest.test.ts`
- `tests/unit/integrations/google-drive/oauth.test.ts`

**Modified in Commit 2:**
- `integrations/_registry.ts` — add `googleDriveManifest`
- `services/oauth/dispatcher.ts` — add `"google-drive": googleDriveOAuth`

**Created in Commit 3:**
- `integrations/google-drive/api/_base.ts` (env-driven base URL with `GOOGLE_DRIVE_API_BASE` + `GOOGLE_DRIVE_UPLOAD_BASE` overrides)
- `integrations/google-drive/api/{filesCreate,filesCreateMultipart,filesList,filesUpdate,filesDelete}.ts`
- `integrations/google-drive/api/errors.ts` (NotFoundError mirroring Calendar)
- `integrations/google-drive/actions/{uploadFile,createFolder,listFiles,moveFile,deleteFile}.ts`
- `integrations/google-drive/actions/{uploadFile,createFolder,listFiles,moveFile,deleteFile}.schema.ts`
- `tests/unit/integrations/google-drive/actions/*.test.ts` (5 tests)

**Modified in Commit 3:**
- `services/execution/handlers/_registry.ts` — add 5 Drive handler entries
- `integrations/google-drive/manifest.ts` — flip `actions: true`

**Created in Commit 4:**
- `integrations/google-drive/api/{filesWatch,changesGetStartPageToken,changesList,channelsStop}.ts`
- `integrations/google-drive/triggers/fileChanged/{index,activate,deactivate,renew,pull,normalize}.ts`
- `integrations/google-drive/webhooks/receive.ts`
- `app/api/webhooks/google-drive/route.ts`
- `tests/unit/integrations/google-drive/triggers/fileChanged/{activate,deactivate,renew,pull,normalize}.test.ts`
- `tests/unit/integrations/google-drive/webhooks/receive.test.ts`

**Modified in Commit 4:**
- `integrations/_registry.ts` — add `import "./google-drive/triggers/fileChanged";`
- `integrations/google-drive/manifest.ts` — flip `webhookTrigger: true`

---

## Dedup key shape

`(provider, eventId)`:
- `provider` = `"google-drive"`.
- `eventId` = `${file.id}:${change.time}` (Drive's `change.time` is ISO 8601 and changes per change record). Keeps the duplicate-push case collapsed (same change record echoed twice → same key) while still emitting fresh keys for genuine subsequent edits. Mirrors Calendar's `${event.id}:${updated}` pattern.

---

## Risk callouts (from audit)

1. **Watch TTL undocumented** for `files.watch`. Confirm at activation by reading the response `expiration` field; alarm if <24h. Renewal cron runs every 10min and renews any watch expiring within 24h (existing Calendar behavior).
2. **Page-token expiration.** Google rotates page tokens after ~30 days. `pull.ts` catches a `PageTokenExpiredError` (HTTP 410 on `changes.list` with an expired token), re-baselines via `changes.getStartPageToken()`, persists, and returns `{events: [], resyncRequired: true}` for that notification.
3. **Folder-scoped triggers vs. user-wide change feed.** `changes.list` returns the user's WHOLE Drive. If trigger config has `folderId` set, `normalize.ts` filters by parent folder. Out of scope for Batch 1 unless trivial — defer aggressive folder filtering to a follow-up.
4. **`'root'` vs. specific folder.** When activating with `fileId='root'`, `trigger_resources.config.fileId` MUST be the literal string `"root"` so renewal can re-watch the same target.
5. **Quota.** `drive.files.watch` and `drive.changes.list` consume quota. Per-user 1000 watches/day default. Not a concern for early adopters.
6. **Upload size.** V2 buffers in memory; cap at 25MB (V1 cap). Streaming/resumable upload is a follow-up.

---

## V1 bugs / legacy patterns NOT carried into V2

1. **JSON-blob channel token** — V1 stores `JSON.stringify({userId, integrationId, provider})` as the watch token; V2 uses HMAC over channelId. Calendar already proved this; Drive uses the same shared helper.
2. **Webhook multiplexer** — V1's single `/api/webhooks/google` route with switch-on-resource. V2 uses `/api/webhooks/google-drive`.
3. **Deprecated `google_watch_subscriptions` table** — V2 does not add this table; uses `trigger_resources.config` only.
4. **Three-trigger split** — V1 has `new_file_in_folder` / `new_folder_in_folder` / `file_updated`. V2 has one `file_changed` with `changeKind` + `objectKind` payload fields.
5. **`fileId: fileId || 'root'`** — V2 stores the literal `"root"` string in config so renewal is unambiguous.
6. **Blank OAuth scope** — V1's `oauthConfig.ts` has empty scope for Drive. V2 sets explicit `drive` + `userinfo.email`.

---

## Out-of-scope (echoed from approved scope)

- Google Docs / Sheets / Forms
- Shared Drives edge cases
- `share_file` (auth-impact; deserves its own scope/security review)
- `copy_file`
- `get_file` binary download (Edge runtime / memory concerns)
- `get_file_metadata` (subset of listFiles output)
- `search_files` advanced query syntax
- Resumable upload
- E2e Batch 2 until Batch 1 is green
- Any push / PR / merge
- Unrelated cleanup
