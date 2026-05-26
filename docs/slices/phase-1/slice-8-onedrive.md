# Slice 8 — Microsoft **OneDrive** provider port

**Branch:** `slice-8-onedrive` (off `slice-7-outlook-calendar` @ `abfe93bc0`).
**Reference codebase:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e` (V1).
**Goal:** Port Microsoft OneDrive from V1 with seven actions (`upload_file`, `get_file`, `create_folder`, `delete_item`, `move_item`, `copy_item`, `list_items`) plus one webhook trigger (`file_changed` covering Graph's `updated` change type) on `/me/drive/root`. OneDrive is the **third** consumer of `_shared/microsoft/` — the abstraction extracted in Slice 7. This slice validates that the shared layer generalizes to a non-Outlook surface without modification.

This slice has no separate Batch 2. Commits 1–5 ship together when each commit's gates are green.

---

## Why OneDrive after Outlook Mail + Calendar

1. **Highest reuse of the Microsoft foundation.** `_shared/microsoft/oauth.ts`, `_shared/microsoft/api/{me,subscriptions,_base,errors}.ts`, and `_shared/microsoft/webhooks/validation.ts` were built in Slice 7 with explicit forward-comments naming OneDrive / Teams / Excel as the next consumers. OneDrive ships without modifying any shared file. The actions and trigger drop in alongside the existing pattern.
2. **High product value.** "Trigger when a file or folder changes in OneDrive" + "create folder / upload file / move / copy / delete" cover the dominant business-workflow file scenarios. OneDrive is broadly used across personal and SharePoint-backed enterprise drives.
3. **Minimal external setup.** One redirect URI + one delegated permission added to the existing Azure AD app from Slice 6. Same `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` env vars. No new client app.
4. **Validates a new V2 trigger pattern under shared Microsoft infra.** Slice 6 (mail) and Slice 7 (calendar) both subscribe to resources whose notifications carry the changed item's id — receive path is "id → fetch resource → normalize." OneDrive subscriptions on `/me/drive/root` notify with `changeType: updated` and the notification *usually* carries a `resourceData.id` for the changed item, but on parent-folder-level updates the id may point at the folder, not the actual changed child. To recover the actual change, the receive path needs a **delta fallback** (`/me/drive/root/delta`) — same shape as V2's existing Google Drive trigger (`integrations/google-drive/triggers/fileChanged/pull.ts`). Slice 8 adapts that pattern to Microsoft Graph.
5. **Hardens `_shared/microsoft/` for follow-on slices.** After OneDrive ships, Teams / Excel / OneNote each become near-mechanical follow-ups: the OAuth + subscription + validation primitives are proven on three providers, and the receive-path branching (`id → fetch` vs. `delta fallback`) is now in V2's pattern library.

---

## Confirmed scope decisions

1. **New provider id — `microsoft-onedrive`.** Sibling to `microsoft-outlook` (Slice 6 mail) and `microsoft-outlook-calendar` (Slice 7). Same Azure AD identity, distinct integration row per surface. Naming matches the established V2 pattern (`microsoft-teams`, `microsoft-excel`, `microsoft-onenote` slot in cleanly later).
2. **Seven actions — `upload_file`, `get_file`, `create_folder`, `delete_item`, `move_item`, `copy_item`, `list_items`.** Defer: `create_sharing_link`, `send_sharing_invitation`, `find_item_by_id`, `list_drives`, `search_files`, `rename_item` (covered by `move_item` + new name parameter in a follow-up if needed). Per-action V1 audit + classification in §"V1 audit" below.
3. **One trigger — `file_changed`** with Graph `changeType: "updated"`. Trigger payload includes a `kind: "file" | "folder"` discriminator and a `changeType` field surfaced from the notification envelope so workflow authors can branch (`{{trigger.kind}}` and `{{trigger.changeType}}`). Graph only supports `"updated"` for `/me/drive/root` subscriptions — `created` and `deleted` are not separately delivered, but newly-created items still surface as a child added to the parent folder. The dedup key includes both the item id and the change discriminator so the same physical change doesn't double-fire.
4. **`new_file` vs `file_modified` — collapsed into one trigger.** V1 has two separate triggers (`onedrive_trigger_new_file`, `onedrive_trigger_file_modified`) — both subscribe to the same Graph resource with the same change type. V2 collapses to one consolidated `file_changed` trigger with payload fields workflow authors can branch on (`createdDateTime` ≈ `lastModifiedDateTime` → newly-created; otherwise → modified). Mirrors Slice 7's consolidation of three calendar triggers into one.
5. **Scopes — exactly two:** `offline_access`, `Files.ReadWrite`. Microsoft Graph permissions are hierarchical: `Files.ReadWrite` includes `Files.Read`, so we don't request both. Approved scope per the Slice 8 brief — explicitly NOT `Files.ReadWrite.All` (V1's choice; broader, grants access to ALL files including SharePoint shared drives — Slice 8 stays scoped to the user's personal drive). No `User.Read` (Graph `/me` accepts any delegated permission). No `Sites.*` scopes — SharePoint deferred.
6. **Subscription resource — `/me/drive/root`.** Watches the user's personal drive. SharePoint sites and shared drives deferred to a follow-up slice.
7. **Subscription change type — `"updated"`.** The only changeType Graph supports for drive subscriptions. Newly-created items surface as updates to the parent folder; the receive path's delta fallback recovers the actual new/modified child.
8. **OAuth endpoint — `/common/`.** Multi-tenant: `https://login.microsoftonline.com/common/oauth2/v2.0/{authorize,token}`. Same as Slice 6 + 7. Reuses `_shared/microsoft/oauth.ts` verbatim.
9. **`accountIdField` — `email`.** Same as Slice 6 + 7. Resolved via `_shared/microsoft/api/me.ts:getMe()`.
10. **`tokenScope` — `user`.** One OneDrive integration per (user, email).
11. **`refreshable` — `true`.** Microsoft refresh-token preserve-old policy via `_shared/microsoft/oauth.ts`.
12. **Health check interval — 6h.** Matches every Microsoft + Google provider.
13. **Subscription expiration — 4230 minutes.** Microsoft's `/me/drive/root` subscription max, identical to `/me/messages` and `/me/events`. Renewal threshold: 1h. Same constants as Slice 6 + 7.
14. **Q11 — explicit fields with no hidden defaults:**
    - `upload_file` requires explicit `filename`, `mimeType`, `content`, `contentEncoding` (`utf8` or `base64`). No multi-source heuristics from V1 (Supabase storage / FileStorageService / direct content) — Slice 8 ports the simpler V2 Google Drive shape (one content source: a string + encoding).
    - `create_folder` requires `name`. `parentItemId` optional (defaults to the drive root).
    - `delete_item` / `move_item` / `copy_item` / `get_file` / `list_items` require an explicit `itemId` (or `parentItemId` for `list_items` / `create_folder` when listing root). NO V1 fallback that interprets "blank" as "the root" — workflow authors who want root pass an explicit sentinel or omit the optional field; the schema documents the policy per action.
    - `move_item` requires explicit `targetParentItemId` (and optional `newName`).
    - `copy_item` requires explicit `targetParentItemId` (and optional `newName`). Graph's copy is asynchronous — Slice 8 returns `{ status: "pending", monitorUrl }` and does NOT poll to completion (V1 does poll in a long-running loop; V2 surfaces the monitor URL and lets a follow-up workflow node handle waiting if needed — keeps the action handler synchronous and within timeout budgets).
15. **Trigger dedup key shape — `${subscriptionId}:${itemId}:${itemLastModifiedDateTime}`.** Includes `lastModifiedDateTime` (not `changeType` — Graph only sends `updated`) so a series of edits on the same file each fire as distinct events. Without a per-version discriminator we'd dedup all updates to one event for the lifetime of the dedup TTL. Falls back to `${subscriptionId}:${itemId}:${notificationOccurredAt}` when the item can't be fetched (delta path).
16. **No new DB migration.** All state fits existing `trigger_resources.config` JSONB and `webhook_event_dedup` table. The trigger config additionally stores a `deltaToken` cursor for the delta fallback path — same JSONB pattern as Google Drive's `pageToken` / Calendar's `syncToken`. **STOP-AND-REPORT** if a new table is needed.

---

## V1 audit + port classification

V1 paths inspected (`chainreact-app-9e`):

| V1 path | What's there | Slice 8 classification |
|---|---|---|
| `lib/workflows/nodes/providers/onedrive/index.ts` (1755 LOC) | Node manifest: 2 trigger types (`onedrive_trigger_new_file`, `onedrive_trigger_file_modified`), 11 action types | Reference for action surface + field names. **Port with V2 adaptation** (consolidate 2 triggers → 1, reduce filter fields, drop V1 sourceType heuristics). |
| `lib/workflows/actions/onedrive/copyItem.ts` (261 LOC) | Source-id GET → POST `/me/drive/items/{id}/copy` → polls monitor URL until `succeeded` or `failed`, then GETs final item | **Port with V2 adaptation.** Drop the polling loop — return `{ status: "pending", monitorUrl }` per Q11 decision #14. Conflict-name check is a UX nicety V2 can defer. |
| `lib/workflows/actions/onedrive/createFolder.ts` (83 LOC) | POST `/me/drive/items/{parent}/children` (or `/me/drive/root/children`) | **Port mostly as-is.** |
| `lib/workflows/actions/onedrive/deleteItem.ts` (101 LOC) | GET `/me/drive/items/{id}` for confirmation → DELETE | **Port with V2 adaptation.** Drop the pre-fetch (Graph DELETE is idempotent on 404 — already a Slice 7 pattern). |
| `lib/workflows/actions/onedrive/getFile.ts` (73 LOC) | GET `/me/drive/items/{id}` for metadata + optional content download | **Port with V2 adaptation.** Slice 8 returns metadata + `@microsoft.graph.downloadUrl` (a short-lived signed URL Graph emits on the metadata response). NOT downloading the content body in the action — workflow authors who need bytes can fetch the URL in a follow-up node. Avoids dragging large file content through the engine's run record. |
| `lib/workflows/actions/onedrive/moveItem.ts` (105 LOC) | PATCH `/me/drive/items/{id}` with `{ parentReference: { id }, name? }` | **Port mostly as-is.** Slice 8 supports both move (parent change) and rename (name change) via the same handler — V1 has a separate `renameItem` action, but Graph treats both as a PATCH on the item with different field combos. We collapse rename into `move_item` (omitting `targetParentItemId` = rename in place; that's documented in the schema). |
| `lib/workflows/actions/onedrive/renameItem.ts` (109 LOC) | PATCH `/me/drive/items/{id}` with `{ name }` | **Skip** — collapsed into `move_item`. |
| `lib/workflows/actions/onedrive/searchFiles.ts` (132 LOC) | GET `/me/drive/items/{id}/search(q='...')` or `/me/drive/root/search(q='...')` | **Skip for Slice 8** — useful but not core. Add in a follow-up. |
| `lib/workflows/actions/onedrive/createSharingLink.ts` (126 LOC) | POST `/me/drive/items/{id}/createLink` | **Skip per scope.** |
| `lib/workflows/actions/onedrive/sendSharingInvitation.ts` (154 LOC) | POST `/me/drive/items/{id}/invite` | **Skip per scope.** |
| `lib/workflows/actions/onedrive/findItemById.ts` (86 LOC) | GET `/me/drive/items/{id}` (essentially `get_file` rebadged) | **Skip** — `get_file` covers it. |
| `lib/workflows/actions/onedrive/listDrives.ts` (98 LOC) | GET `/me/drives` or `/sites/{id}/drives` | **Skip per scope** — multi-drive is a SharePoint-tier concern. |
| `lib/workflows/actions/onedrive.ts` (326 LOC) | Standalone `uploadFileToOneDrive` mega-function: 4 source-content paths (Supabase storage / FileStorageService / direct content / URL fetch); PUT to `/me/drive/items/{parent}:/{filename}:/content` or `/me/drive/root:/{filename}:/content` | **Port with V2 adaptation.** Slice 8 ships a clean handler with one content source: `{ filename, mimeType, content, contentEncoding }`. Mirrors V2's Google Drive `upload_file` shape. The 4-MB Graph "simple upload" limit is enforced at the wrapper layer; resumable upload (for files > 4 MB) is **deferred** per scope. |
| `lib/triggers/providers/MicrosoftGraphTriggerLifecycle.ts` (838 LOC, multi-provider) | One class covers Outlook + Teams + OneDrive + Excel: subscription create/renew/delete, OneDrive permission preflight via `/me/drive`, resource-string builder, change-type mapping | **Rewrite per V2 boundary.** V2's pattern is one trigger module per provider. OneDrive's lifecycle is `~150 LOC` of logic that follows Slice 7's `event_changed` shape exactly: activate→createSubscription, deactivate→deleteSubscription, renew via subscriptionRegistry. The 838-LOC V1 monolith is exactly the rot CLAUDE.md says to fix — V2 owns one focused module, not a multi-provider switch. |
| `app/api/webhooks/microsoft/route.ts` (multiplexer; OneDrive branches at lines 925–966 and 2068–2115; `fetchOneDriveItemData` at lines 2163–2240) | One mega-route handles all Microsoft Graph webhooks; OneDrive branch fetches `/me/drive/items/{id}` when notification carries an id, falls back to `/me/drive/root/delta?$top=10` when it doesn't | **Rewrite per V2 boundary.** V2 has a per-provider webhook route (`/api/webhooks/microsoft-onedrive/{route,lifecycle/route}.ts`) — same pattern as Slice 6 + 7. Slice 8 ports the `id-or-delta` branching logic into a clean `pull.ts` (Calendar's `eventsGet` plus a delta fallback). |
| `app/api/integrations/oauth/onedrive/` (V1 callback) | V1 OAuth dispatcher per provider | **Skip** — V2 has a unified dispatcher (`services/oauth/dispatcher.ts`) with per-provider OAuth modules. Slice 8 registers the calendar-shaped OAuth module and the dispatcher routes by provider id. |
| V1 OneDrive tests | Sparse / inline integration tests | **Skip** — V2 has its own unit-test conventions. Each V2 module ships with focused unit tests + the e2e walkthrough. |

---

## In-scope action list (final)

1. **`upload_file`** — `{ filename, mimeType, content, contentEncoding, parentItemId? }` → PUT `/me/drive/items/{parent}:/{filename}:/content` or `/me/drive/root:/{filename}:/content`. ≤ 4 MB content (resumable deferred). Returns `{ id, name, size, webUrl, parentReference }`.
2. **`get_file`** — `{ itemId }` → GET `/me/drive/items/{id}`. Returns full DriveItem metadata including `@microsoft.graph.downloadUrl` (short-lived).
3. **`create_folder`** — `{ name, parentItemId? }` → POST `/me/drive/items/{parent}/children` or `/me/drive/root/children` with `{ name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }` (Q11: no silent overwrite). Returns the new folder DriveItem.
4. **`delete_item`** — `{ itemId }` → DELETE `/me/drive/items/{id}`. Idempotent on 404 (matches Slice 7's `delete_event` pattern).
5. **`move_item`** — `{ itemId, targetParentItemId?, newName? }` → PATCH `/me/drive/items/{id}` with `{ parentReference: { id: targetParentItemId }?, name: newName? }`. At least one of `targetParentItemId` / `newName` required (cross-field refine). Subsumes V1's separate `rename_item`.
6. **`copy_item`** — `{ itemId, targetParentItemId, newName? }` → POST `/me/drive/items/{id}/copy`. Returns `{ status: "pending", monitorUrl }` from Graph's `Location` header. Does NOT poll for completion (per Q11).
7. **`list_items`** — `{ parentItemId?, top?, orderBy? }` → GET `/me/drive/items/{parent}/children` or `/me/drive/root/children` with optional `$top` and `$orderby`. Returns `{ items: DriveItem[], nextLink? }`. Slice 8 surfaces `nextLink` for paginated callers but does not auto-paginate (matches Slice 7 `list_events` shape).

---

## `file_changed` trigger algorithm

**Subscription resource:** `/me/drive/root`. **changeType:** `"updated"`. **expirationMinutes:** 4230. **Renewal threshold:** 1h.

**activate (lifecycle hook):**
1. No required config fields beyond standard plumbing — Slice 8 emits one event per detected change. Optional config (deferred — Slice 8 ships with no per-trigger filters): `parentItemId` to scope to a folder; `kind: "file" | "folder" | "any"` to filter.
2. Generate `clientState` (32-byte hex, persisted before the API call — V1 rot fix #2 from Slice 7).
3. Capture initial delta cursor: GET `/me/drive/root/delta?$top=1` and walk to the terminal `@odata.deltaLink`. Persist as `deltaToken` so the receive path's delta fallback has a baseline. **Critical:** without an initial cursor the first delta-fallback notification would re-emit every file in the drive.
4. POST `/v1.0/subscriptions` via `_shared/microsoft/api/subscriptions.ts:createSubscription({resource: "/me/drive/root", changeType: "updated", notificationUrl, lifecycleNotificationUrl, expirationDateTime, clientState})` wrapped in `refreshAndRetry`.
5. Persist `trigger_resources` row with `config: { type: "subscription-watch", resource: "/me/drive/root", changeType: "updated", subscriptionId, clientState, deltaToken, expiresAt }`.

**deactivate:**
1. DELETE `/v1.0/subscriptions/{subscriptionId}` via `_shared/microsoft/api/subscriptions.ts:deleteSubscription`. 404 / 403 swallowed (best-effort, matches Slice 6 + 7).

**renew:**
1. Registered with `services/triggers/subscriptionRegistry` via `onedriveFileChangedSubscriptionHandler` (same handler shape as `outlookCalendarEventChangedSubscriptionHandler`).
2. Threshold 1h, max expiration 4230 min.
3. PATCH the subscription's `expirationDateTime` via `_shared/microsoft/api/subscriptions.ts:renewSubscription`.
4. Persist Graph's authoritative new `expiresAt` back to config (preserve `subscriptionId`, `clientState`, `resource`, `changeType`, `deltaToken`).

**Webhook receive (`app/api/webhooks/microsoft-onedrive/route.ts`):**
1. **Validation handshake.** `?validationToken=…` query OR `Content-Type: text/plain` body → echo as `text/plain` 200. Uses `_shared/microsoft/webhooks/validation.ts:checkValidationHandshake()` (no DB I/O — Microsoft's 10s budget).
2. **Notification.** Body `{ value: [{ subscriptionId, clientState, changeType, resource, resourceData: { id, "@odata.type" }, … }, …] }`. For each:
   - Look up `trigger_resources` by JSONB containment `{ subscriptionId }`. Skip if missing (deactivated workflow).
   - Verify `clientState` matches stored. Mismatch → log + skip (never throw).
   - Filter to drive-item resources only via `resourceData["@odata.type"]` (`#Microsoft.Graph.DriveItem`). Calendar/event-shaped notifications shouldn't appear on this subscription, but the filter is defense-in-depth (Slice 7 pattern).
   - **id-bearing branch:** if `resourceData.id` is present and non-empty, fetch the item via `driveItemsGet({ accessToken, itemId })` wrapped in `refreshAndRetry`. 404 → emit a minimal "deleted" payload (`{ itemId, kind: null, name: null, … }`) so workflows can react to deletions even though Graph technically delivered an `updated` change type. Mirrors Slice 7's `normalizeDeleted` shape.
   - **delta-fallback branch:** if `resourceData.id` is missing or refers to the drive root, call `driveRootDelta({ accessToken, deltaToken })` to fetch the changes since the last cursor. Each returned item normalizes to a separate TriggerEvent. Persist the new `@odata.deltaLink` back to `trigger_resources.config.deltaToken` so the next fallback call is incremental.
   - Normalize → `TriggerEvent` (see "Output shape" below).
   - Dispatch via `services/triggers/dispatch.ts` (handles dedup automatically).
3. **Lifecycle path** (`/lifecycle/route.ts`) — stub, 200 + log. Slice 8 keeps the same Slice 6/7 stub treatment.

**Output shape** (the `file_changed` trigger event payload):
- `itemId: string`
- `kind: "file" | "folder" | null` (null only on deleted-item minimal payload)
- `name: string | null`
- `size: number | null`
- `mimeType: string | null` (folders → null)
- `parentReference: { id, path } | null`
- `webUrl: string | null`
- `downloadUrl: string | null` (`@microsoft.graph.downloadUrl` — short-lived; null for folders and deletes)
- `createdDateTime: string | null`
- `lastModifiedDateTime: string | null`
- `changeType: "updated"` (Graph constant for drive subscriptions; included for forward-compat with future change types)
- `source: "id-fetch" | "delta-fallback"` — debugging aid; surfaces which branch produced the event.

**Deleted-item minimal payload:** when the id-bearing branch's `driveItemsGet` returns 404 (file was deleted between notification and fetch — common for short-lived files), emit a stable shape with `kind: null`, `name: null`, all other fields `null`, but `itemId` populated. Mirrors Slice 7's `normalizeDeleted` semantic.

---

## Dedup key shape

`webhook_event_dedup`:
- `provider = "microsoft-onedrive"`
- **id-fetch path:** `eventId = "${subscriptionId}:${itemId}:${lastModifiedDateTime}"`. Including `lastModifiedDateTime` (instead of just `changeType` — which would always be `"updated"` — or just `notificationOccurredAt` — which would never repeat) means edits to the same file each fire as distinct events without re-firing on duplicate notifications.
- **delta-fallback path:** `eventId = "${subscriptionId}:${itemId}:${lastModifiedDateTime}"` per item returned by delta. Same key shape — guarantees that the id-fetch and delta-fallback paths collapse to the same dedup row when both deliveries describe the same change.
- **deleted-item path** (id-fetch 404): `eventId = "${subscriptionId}:${itemId}:deleted:${notificationOccurredAt}"`. The `:deleted:` infix prevents collision with a prior live event for the same itemId.

---

## V2 file map (proposed)

**Created in Commit 2 (manifest + OAuth):**
- `integrations/microsoft-onedrive/manifest.ts`
- `integrations/microsoft-onedrive/oauth.ts`

**Modified in Commit 2:**
- `integrations/_registry.ts` — append `microsoftOneDriveManifest` to `ALL_MANIFESTS`.
- `services/oauth/dispatcher.ts` — register `microsoftOneDriveOAuth` under `"microsoft-onedrive"`.

**Created in Commit 3 (actions + API wrappers):**
- `integrations/microsoft-onedrive/api/driveItemsGet.ts`
- `integrations/microsoft-onedrive/api/driveItemsList.ts`
- `integrations/microsoft-onedrive/api/driveItemsCreateFolder.ts`
- `integrations/microsoft-onedrive/api/driveItemsContentUpload.ts`
- `integrations/microsoft-onedrive/api/driveItemsUpdate.ts`  *(used by `move_item`)*
- `integrations/microsoft-onedrive/api/driveItemsCopy.ts`
- `integrations/microsoft-onedrive/api/driveItemsDelete.ts`
- `integrations/microsoft-onedrive/actions/{uploadFile,getFile,createFolder,deleteItem,moveItem,copyItem,listItems}.{schema,}.ts`  (7 actions × 2 files each = 14)

**Modified in Commit 3:**
- `services/execution/handlers/_registry.ts` — register the 7 OneDrive action handlers under `microsoft-onedrive`.
- `integrations/microsoft-onedrive/manifest.ts` — flip `actions: true`.

**Created in Commit 4 (`file_changed` trigger + webhook receiver):**
- `integrations/microsoft-onedrive/api/driveRootDelta.ts`  *(GET `/me/drive/root/delta`, paginated, returns items + `@odata.deltaLink`)*
- `integrations/microsoft-onedrive/triggers/fileChanged/{index,activate,deactivate,renew,normalize}.ts`
- `integrations/microsoft-onedrive/triggers/fileChanged/pull.ts`  *(receive-side helper: id-fetch vs. delta-fallback dispatcher; mirrors `integrations/google-drive/triggers/fileChanged/pull.ts` shape)*
- `integrations/microsoft-onedrive/webhooks/receive.ts`
- `app/api/webhooks/microsoft-onedrive/{route.ts,lifecycle/route.ts}`

**Modified in Commit 4:**
- `integrations/_registry.ts` — add `import "./microsoft-onedrive/triggers/fileChanged";`.
- `integrations/microsoft-onedrive/manifest.ts` — flip `webhookTrigger: true`.

**Created in Commit 5 (e2e walkthrough):**
- `tests/e2e/slice-8-onedrive-walkthrough.spec.ts`

**Modified in Commit 5:**
- `tests/e2e/helpers/mockMicrosoftServer.ts` — extend with drive routes (`POST /v1.0/me/drive/root:/{filename}:/content`, `GET /v1.0/me/drive/items/{id}`, `GET /v1.0/me/drive/items/{id}/children`, `POST /v1.0/me/drive/items/{id}/children`, `DELETE /v1.0/me/drive/items/{id}`, `PATCH /v1.0/me/drive/items/{id}`, `POST /v1.0/me/drive/items/{id}/copy`, `GET /v1.0/me/drive/root/delta`) + `__injectDriveItem` control plane + `__sendNotification` `kind: "driveItem"` extension. Outlook mail/calendar routes untouched.

**Tests created** (one per module, mirroring Slice 7 structure):
- `tests/unit/integrations/microsoft-onedrive/manifest.test.ts`
- `tests/unit/integrations/microsoft-onedrive/oauth.test.ts`
- `tests/unit/integrations/microsoft-onedrive/api/{driveItemsGet,driveItemsList,driveItemsCreateFolder,driveItemsContentUpload,driveItemsUpdate,driveItemsCopy,driveItemsDelete,driveRootDelta}.test.ts` (8 files)
- `tests/unit/integrations/microsoft-onedrive/actions/{uploadFile,getFile,createFolder,deleteItem,moveItem,copyItem,listItems}.test.ts` (7 files)
- `tests/unit/integrations/microsoft-onedrive/triggers/fileChanged/{activate,deactivate,renew,normalize,index}.test.ts` (5 files)
- `tests/unit/integrations/microsoft-onedrive/webhooks/receive.test.ts`
- `tests/unit/app/api/webhooks/microsoft-onedrive.route.test.ts`

---

## Azure AD setup checklist (for production deployment)

This slice ships entirely with mocks for tests. For real deployment, the user adds to the existing Azure AD app from Slice 6:

1. **Add redirect URI:** `${NEXT_PUBLIC_APP_URL}/api/integrations/oauth/microsoft-onedrive/callback`. Azure → Microsoft Entra ID → App registrations → (existing app) → Authentication → Add a platform → Web → Redirect URIs.
2. **Add API permission:** Microsoft Graph → Delegated permissions → `Files.ReadWrite`. No admin consent required.
3. **Env vars unchanged from Slice 6 + 7:** `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`. Same Azure AD app id + secret cover Mail + Calendar + OneDrive.
4. **Public HTTPS webhook URL.** Same `MICROSOFT_GRAPH_WEBHOOK_URL` env var works (or per-provider variants if the user wants to route them to different tunnels). The activation hook for OneDrive appends `/api/webhooks/microsoft-onedrive` to the configured base.
5. **Verify validation handshake test:** `POST /api/webhooks/microsoft-onedrive?validationToken=foo` returns `foo` as `text/plain` 200 within 10s. Same handshake Microsoft does on subscription create.

None required for Slice 8's e2e — `mockMicrosoftServer` simulates the full wire-format. Real Azure setup is on the user's runway when they're ready to enable OneDrive in production.

---

## V1 rot fixes carried into V2

1. **Per-provider Microsoft token lookup** (V1's `MicrosoftGraphAuth.getValidAccessToken(userId, "onedrive")` actually shares state across Microsoft providers when not careful — see V1's `MicrosoftGraphTriggerLifecycle.ts:101-112` which does a permission-preflight against `/me/drive` because it can't trust that the user's token has Files scopes). V2 fetches the per-provider integration row via `repositories/integrations.ts` so the token is always the OneDrive-specific one.
2. **No 838-line shared lifecycle class.** V2 owns one focused trigger module per provider. The Microsoft Graph subscription primitive is shared; the per-provider activate/deactivate/renew lives next to the trigger.
3. **No multiplexer route.** V1's `/api/webhooks/microsoft/route.ts` is a 2300+ LOC switch on trigger type. V2 has per-provider routes (`/api/webhooks/microsoft-outlook`, `/api/webhooks/microsoft-outlook-calendar`, and now `/api/webhooks/microsoft-onedrive`). Each route is < 100 LOC.
4. **DB-backed dedup.** V1 has no Microsoft webhook dedup — duplicate Graph notifications could double-fire workflows. V2 uses `webhook_event_dedup` keyed `(provider, eventId)`.
5. **Honest manifest capabilities.** Flags flip true only when handlers/triggers are actually registered. Same Slice 6 + 7 convention.
6. **Per-provider env vars.** V1 uses `ONEDRIVE_CLIENT_ID/SECRET` (separate from Outlook). V2 reuses `MICROSOFT_CLIENT_ID/SECRET` across all Microsoft providers — they're all the same Azure AD app.
7. **No scope bloat.** V1 requests `Files.ReadWrite.All` (broader than needed for personal-drive workflows). V2 requests `Files.ReadWrite` (personal drive only) per the Slice 8 brief. SharePoint / shared drives deferred.
8. **No multi-source upload heuristics.** V1's `uploadFileToOneDrive` has 4 distinct content-source branches (Supabase storage / FileStorageService / direct base64 / URL fetch). V2 ships one explicit content-source contract: `{ content, contentEncoding }`. Workflow authors who need bytes from another node use upstream nodes to produce the encoded string. Mirrors V2 Google Drive `upload_file` shape.
9. **No silent overwrite on `create_folder`.** V1 omits `@microsoft.graph.conflictBehavior`, which Graph defaults to `fail`. V2 sets it explicitly so the contract is documented in the wrapper, not implicit.
10. **No synchronous polling on `copy_item`.** V1 polls Graph's monitor URL until completion in a long-running loop — easily exceeds Vercel's serverless function timeout for big copies. V2 returns the monitor URL and lets a follow-up workflow node poll if needed.

---

## Risk callouts

1. **10-second validation timeout.** Same as Slice 6 + 7 — the OneDrive webhook route MUST respond to validation within 10s. The validation extraction is shared (`_shared/microsoft/webhooks/validation.ts`) and short-circuits before any DB I/O.
2. **Drive subscriptions deliver `updated` only.** Graph does NOT separately notify on `created` or `deleted` for `/me/drive/root` subscriptions. Workflow authors expecting "fire on file create" branch on the trigger payload's `createdDateTime ≈ lastModifiedDateTime` heuristic. Documented in the trigger description.
3. **Notification id may point at the parent folder, not the changed child.** Graph's notification carries `resourceData.id` which can be the actual child item id (typical) OR the parent folder id (for some bulk-change scenarios). The receive path's id-fetch branch handles both: when the id resolves to a folder, the handler walks the delta to find the actual changed children. **Slice 8 simplification:** the Slice 8 receive path does NOT distinguish "folder-id-with-children-changed" from "folder-itself-was-renamed" — both surface as a folder-typed event. The delta-fallback branch is reserved for notifications whose `resourceData.id` is empty or unparseable. A follow-up slice can refine this if needed.
4. **Delta cursor maintenance.** The delta-fallback path persists `@odata.deltaLink` back to `trigger_resources.config`. If the cursor expires (Graph rotates after extended inactivity), the delta call returns 410 — Slice 8 catches that, re-baselines via a fresh `/me/drive/root/delta?$top=1` walk, persists the new cursor, emits zero events for the failed call, and lets the next notification surface real changes. Mirrors V2 Google Drive's `PageTokenExpiredError` recovery.
5. **4 MB upload cap.** Graph's "simple upload" tops out at 4 MB. Files > 4 MB require the resumable upload session (`POST /me/drive/items/{parent}:/{filename}:/createUploadSession` then chunked PUTs). Slice 8 enforces the 4 MB cap at the wrapper layer with a clear error; resumable upload is **deferred** to a follow-up slice.
6. **`@microsoft.graph.downloadUrl` is short-lived.** Graph's metadata response includes a pre-signed download URL valid for ~1 hour. Slice 8 surfaces it in the trigger payload + `get_file` action output. Workflow authors who need the bytes consume the URL promptly. We don't proxy the download or extend the URL.
7. **Refresh-token rotation can omit a new token.** Same as Slice 6 + 7 — preserve-old policy in `_shared/microsoft/oauth.ts`.

---

## Out-of-scope (echoed from approved scope)

- SharePoint sites, document libraries, shared drives.
- Resumable upload (files > 4 MB).
- `create_sharing_link`, `send_sharing_invitation`, `find_item_by_id`, `list_drives`, `search_files`, standalone `rename_item` (covered by `move_item`).
- Per-trigger filter fields (folder scoping, kind filter, file-type filter) — Slice 8 emits one event per detected change.
- Excel-on-OneDrive workbook actions — separate Slice 9+ for Microsoft Excel.
- Teams files (the Teams files surface uses different Graph endpoints) — separate Microsoft Teams slice.

---

## Acceptance gates per commit

After each commit:
- `npx tsc --noEmit`
- `npm run lint`
- `npm run lint:structure`
- `npm run lint:migrations`
- `npm test`

For the e2e commit (Commit 5), additionally run all seven prior Playwright walkthroughs sequentially plus Slice 8 twice for stability:
- slice-1-slack, slice-2f-gmail, slice-3b-google-calendar, slice-4b-google-drive, slice-5b-google-sheets, slice-6-outlook-mail, slice-7-outlook-calendar, slice-8-onedrive (×2).

No push. No PR. Local-only per CLAUDE.md.
