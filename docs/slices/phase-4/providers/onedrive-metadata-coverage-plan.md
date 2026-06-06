# Microsoft OneDrive — Builder Metadata Coverage Plan (ONEDRIVE-META-1)

**Slice:** 4.ONEDRIVE-META-1 (this plan) → ONEDRIVE-META-2 (resolvers) → ONEDRIVE-META-3 (metas + UI-scope schema fields + trigger + COVERED flip)
**Type:** Doc-only audit + plan. **No runtime/metadata/test files modified by this slice.**
**Date:** 2026-05-25
**Branch:** `v2-provider-docs-1`
**Parent tracker:** [`provider-metadata-launch-gap-tracker.md`](../provider-metadata-launch-gap-tracker.md)
**Sibling precedents:** [`trello-metadata-coverage-plan.md`](./trello-metadata-coverage-plan.md) (UI-scope parent field + resolver-first, opaque ids), [`airtable-metadata-coverage-plan.md`](./airtable-metadata-coverage-plan.md), [`excel-metadata-coverage-plan.md`](./excel-metadata-coverage-plan.md) (Microsoft Graph resolver patterns).
**Standard:** V2-native COPY / ADAPT / REPLACE / DEFER / REJECT — never raw V1 handler-count parity, never blind V1 copy.

Microsoft OneDrive is the **5th** of the (now) 5 pending-metadata providers (after Shopify, Excel, Airtable, Trello). **Current state (code-verified):** **7 runtime actions + 1 webhook trigger** registered and real; **0 ActionMeta, 0 TriggerMeta, 0 options resolvers**; absent from the discovery registry; `/api/providers` reports `hasMetadata:false` → OneDrive renders as **"coming soon"**.

**Four facts drive the slice plan:**

1. **Every item reference is an opaque Graph DriveItem id** (`itemId`, `parentItemId`, `targetParentItemId` are ids like `01ABCD…`/`b!Lz9…`) → OneDrive is **resolvers-first** (like Excel/Airtable/Trello). Hand-typing them is not reasonable; a folder/item picker is required for a usable builder.
2. **There is exactly one drive.** The manifest scopes are `Files.ReadWrite` (personal drive only — `/me/drive`); SharePoint/shared drives are deferred per the manifest. **No schema carries a `driveId`** — so **no `microsoft-onedrive:drives` resolver is needed** (the drive is implicit `/me/drive`).
3. **The existing `api/driveItemsList` read helper is reusable for resolvers.** Unlike Trello/Airtable (whose `api/` was mutation-only), OneDrive already has `driveItemsList({accessToken, parentItemId?, top?, orderBy?}) → {items, nextLink}` (it backs `list_items`). The folder/item resolvers reuse it + client-side filter — **likely zero new read helpers**.
4. **The runtime does NOT use the V2 FileRef system.** `upload_file` takes a raw `content` string (`utf8`/`base64`); `get_file`/`list_items`/the trigger emit Graph's `downloadUrl` as a **string** (the short-lived `@microsoft.graph.downloadUrl`). So all metas are `producesFileRef:false` / `consumesFileRef:false`, and **`downloadUrl` outputs are sensitive** (`downloadUrl` ∈ the sensitive-output suspicious-name set). FileRef integration is a **runtime** change → deferred out of the metadata arc (§5).

---

## 1. Current OneDrive runtime inventory

**Manifest** ([`integrations/microsoft-onedrive/manifest.ts`](../../../../integrations/microsoft-onedrive/manifest.ts)): id `microsoft-onedrive`, displayName "Microsoft OneDrive". OAuth v2 (`oauthFlows:["v2"]`), `tokenScope:"user"`, `apiVersion:"v1.0"`, `refreshable:true`, scopes `offline_access` + `Files.ReadWrite` (personal drive only — NOT `.All`). Capabilities `oauth/webhookTrigger/actions:true`, `pollingTrigger:false`. `healthCheckIntervalMs:6h`. Account id = email (`/me`).

**Shared transport** ([`integrations/_shared/microsoft/api/`](../../../../integrations/_shared/microsoft/api/)): `_base.graphApiBase()` (`https://graph.microsoft.com`, env override), `errors.NotFoundError` + `surfaceGraphError()`. OneDrive's `api/*.ts` wrappers call Graph via direct `fetch` with `Authorization: Bearer`, throw `Unauthorized401Error` (from `@/services/oauth/refreshAndRetry`) on 401 + `NotFoundError` on 404; **handlers wrap the principal call in `refreshAndRetry({provider:"microsoft-onedrive", accountId})`** (OneDrive is refreshable — contrast Trello's non-refreshable decrypt-direct). `api/types.ts` defines the `DriveItem` shape (`id, name, size, webUrl, @microsoft.graph.downloadUrl, file{mimeType,hashes}, folder{childCount}, parentReference{driveId,driveType,id,path,name}, createdDateTime, lastModifiedDateTime`).

**API helpers** ([`api/`](../../../../integrations/microsoft-onedrive/api/)): `driveItemsContentUpload`, `driveItemsGet`, `driveItemsCreateFolder`, `driveItemsDelete`, `driveItemsUpdate` (move/rename), `driveItemsCopy`, `driveItemsList` (**reusable read helper**), `driveRootDelta` (trigger delta), `types`. **`driveItemsList` is the read helper the resolvers reuse** — no mutation-only gap (contrast Trello).

### 1.1 Registered action handlers (7)

Source of truth: [`services/execution/handlers/_registry.ts`](../../../../services/execution/handlers/_registry.ts) (microsoft-onedrive block). `*` = required at the schema layer. "Picker" = field wanting an options resolver. **`+parentItemId`** = needs a UI-scope source-folder field added (§3) for the `itemId` cascade.

| # | Action key | File | Key config fields | Output keys | Risk | Sensitive outputs | Pickers |
|---|---|---|---|---|---|---|---|
| 1 | `upload_file` | uploadFile.ts | filename*, mimeType*, content*, contentEncoding(utf8\|base64, default utf8), parentItemId? | `{itemId, name, size, mimeType, webUrl, downloadUrl, parentReference, createdDateTime, lastModifiedDateTime}` | create → **medium** | `downloadUrl` | parentItemId→folders |
| 2 | `get_file` | getFile.ts | itemId* | `{itemId, name, kind(file\|folder), size, mimeType, webUrl, downloadUrl, parentReference, createdDateTime, lastModifiedDateTime}` | read → **low** | `downloadUrl` | **+parentItemId**; itemId→items |
| 3 | `create_folder` | createFolder.ts | name*, parentItemId? | `{itemId, name, webUrl, parentReference, childCount, createdDateTime, lastModifiedDateTime}` | create → **medium** | — | parentItemId→folders |
| 4 | `delete_item` | deleteItem.ts | itemId* | `{itemId, deleted, alreadyMissing}` | **high — destructive (see §2)** | — | **+parentItemId**; itemId→items |
| 5 | `move_item` | moveItem.ts | itemId*, targetParentItemId?, newName? (**≥1 of the two**) | `{itemId, name, parentReference, webUrl, lastModifiedDateTime}` | update → **medium** | — | **+parentItemId**; itemId→items; targetParentItemId→folders |
| 6 | `copy_item` | copyItem.ts | itemId*, targetParentItemId*, newName? | `{status("pending"), monitorUrl, sourceItemId, targetParentItemId, newName}` | create → **medium** | — | **+parentItemId**; itemId→items; targetParentItemId→folders |
| 7 | `list_items` | listItems.ts | parentItemId?, top?(1–1000), orderBy? | `{items:[{itemId,name,kind,size,mimeType,webUrl,downloadUrl,createdDateTime,lastModifiedDateTime}], count, hasMore, nextLink}` | read → **low** | nested `downloadUrl` | parentItemId→folders |

**Notable V2-native runtime decisions already shipped (Slice 8 — not re-litigated):** `move_item` subsumes V1's separate `rename_item` (pass `newName` only). `copy_item` is async-by-design (`{status:"pending", monitorUrl}`; V1's polling loop removed — exceeds serverless timeout). `upload_file` is content/body-only (V1's multi-source Supabase/URL upload removed). `delete_item` is idempotent on 404 (`alreadyMissing:true`). `create_folder` sets `conflictBehavior:"fail"` (Q11; no silent rename). Scope is `/me/drive` only.

### 1.2 Registered trigger (1 — webhook subscription-watch)

[`triggers/fileChanged/`](../../../../integrations/microsoft-onedrive/triggers/fileChanged/) — `index.ts` does `registerActivation("microsoft-onedrive","file_changed",activate)` + `registerDeactivation(...)` + `registerSubscriptionHandler(...)` (renewal). Imported at `integrations/_registry.ts` → activations load at module init (the `trigger-meta-activation-invariant` will pass with no `_registry` change + no exemption).

| Trigger key | Normalized type | Model | Lifecycle | User config | Ship now? |
|---|---|---|---|---|---|
| `file_changed` | microsoft-onedrive.file_changed | **webhook** (Graph subscription on `/me/drive/root`, `changeType:"updated"`) | `activate` → capture delta cursor + `POST /subscriptions` (clientState, deltaToken, expiresAt persisted); **renewal** before the ~70.5h expiry (renew at 1h-before, via `subscriptionRegistry`); `deactivate` deletes the subscription | **none** (watches the whole drive root — no folder filter) | ✅ yes |

**Critical:** `file_changed` has **no user config** — it subscribes to the entire `/me/drive/root` (no folder scoping). So its `TriggerMeta.fields` is **`[]`**. Webhook receive resolves the changed item via id-fetch, falling back to the persisted delta cursor; `normalize.ts` / `normalizeDeleted` produce one stable payload shape. **Ships TriggerMeta** — no blockers.

---

## 2. Builder metadata requirements (ActionMeta per action)

Pattern: co-located `<action>.meta.ts` mirroring each `.schema.ts`. **Field names camelCase**, verbatim to the runtime schemas: `filename`, `mimeType`, `content`, `contentEncoding`, `parentItemId`, `itemId`, `targetParentItemId`, `newName`, `name`, `top`, `orderBy` — plus the new UI-scope `parentItemId` on the item-targeted actions (§3).

**Common defaults:** `requiresIntegration:true`; **`category:"files"`** (matches Dropbox / Google Drive — OneDrive is a file store); sequential `displayOrder` (10..70); `producesFileRef:false`, `consumesFileRef:false` for **all 7** (the runtime does not touch the FileRef system — §5). _(Reminder: every `: ActionMeta` literal must set `producesFileRef`/`consumesFileRef`/`isDestructive`/`requiresConfirmation` explicitly — Zod `.default()` applies only at `.parse()`, per the AIRTABLE-META-3 learning.)_

**Risk classification:**
- **low** — `get_file`, `list_items` (pure reads).
- **medium** — `upload_file`, `create_folder` (create, recoverable), `move_item` (move/rename, reversible), `copy_item` (creates a copy; async pending).
- **high + `isDestructive` + `requiresConfirmation`** — **`delete_item`** (recommended). Graph `DELETE /me/drive/items/{id}` removes the item from the active drive; **deleting a folder cascades to all its children** (high blast radius). OneDrive's recycle bin makes it *recoverable for a limited window* (~30d personal / business-retention-dependent), and the V2 action exposes no restore path. Mirrors the Airtable `delete_record` / Excel `delete_worksheet` destructive-trio treatment. **Open Marcus decision** (same sign-off shape as Airtable/Excel deletes): keep `requiresConfirmation:true` (recommended — folder cascade), or downgrade to `high + isDestructive` without confirmation given the recycle bin. Recommendation: **keep confirmation.**

**Field-type mapping** (every type from [`contracts/actionMeta.ts`](../../../../contracts/actionMeta.ts) `FieldTypeSchema`):
- `parentItemId` (upload/create/list — real optional dest) + `targetParentItemId` (move/copy — real dest) → **combobox + `optionsSource:"microsoft-onedrive:folders"`** (no dep; root-folder picker, §3). Optional except `copy_item.targetParentItemId` (required).
- `itemId` (get/delete/move/copy) → **combobox + `optionsSource:"microsoft-onedrive:items"`, `dependsOn:"parentItemId"`** (the UI-scope source-folder field, §3). `required:true`. _Commonly flows from the `file_changed` trigger's `itemId` — the picker is a convenience, so the UI-scope `parentItemId` stays `required:false` (Trello/Dropbox precedent: a trigger-fed id must still validate without picking a folder)._
- `content` (upload_file) → **textarea**, required. **NOT a `file` field** — the handler takes a raw string, not a FileRef (§5).
- `contentEncoding` → **select** (`utf8` / `base64`), `defaultValue:"utf8"` (UI hint; the schema owns the authoritative default).
- `filename` / `mimeType` / `name` / `newName` → **text**. `filename`/`mimeType`/`name` required where the schema requires.
- `top` → **number** (`numeric:{min:1,max:1000,integer:true}`), optional.
- `orderBy` → **text** (Graph `$orderby` clause, e.g. `"name asc"`; placeholder documents the form). A future `select` of common sorts is optional polish.

**Sensitive outputs:** **`downloadUrl`** on `upload_file`, `get_file`, the nested `list_items.items[].downloadUrl`, and the trigger payload → **sensitive** (it is the `@microsoft.graph.downloadUrl` pre-signed URL **and** `downloadUrl` ∈ the sensitive-output suspicious-name set — forced). `webUrl` is a shareable item URL but **not** signed/secret → not marked (consistent with Trello `url`/`shortUrl`). Ids / names / sizes / mimeTypes / `parentReference` / dates / `kind` / `count` / `hasMore` / `nextLink` / `deleted` / `monitorUrl` / `status` / `childCount` / `alreadyMissing` → **not** marked. No secret-shaped output names exist.

**Task cost:** per the central policy ([`lib/workflows/cost-calculator.ts`](../../../../lib/workflows/cost-calculator.ts) — `provider_action = 1`), each OneDrive action bills **1 task on success** (reads included; no read carve-out). No per-meta override.

---

## 3. Options resolver audit

OneDrive **needs resolvers** (all item references are opaque Graph ids). **Auth: refreshable** → resolvers use `refreshAndRetry({provider:"microsoft-onedrive", accountId: ctx.integration.providerAccountId})` (Excel/OneNote pattern), **NOT** decrypt-direct (contrast Trello). All read-only against the existing `Files.ReadWrite` scope → **no scope change, no reconnect.**

| Resolver | Serves | Endpoint / helper | requiredDeps | Ship in arc? | Hand-type fallback? |
|---|---|---|---|---|---|
| `microsoft-onedrive:folders` | parentItemId (upload/create/list) + targetParentItemId (move/copy) | **reuse `driveItemsList`** (`GET /me/drive/root/children`) + client-filter `item.folder != null` | none (root) | **REQUIRED (META-2)** | No — opaque id |
| `microsoft-onedrive:items` | itemId (get/delete/move/copy) | **reuse `driveItemsList`** (`GET /me/drive/items/{parentItemId}/children`) — files + folders | `["parentItemId"]` | **RECOMMENDED (META-2)** — itemId often flows from the trigger; typeable as fallback | itemId typeable |
| `microsoft-onedrive:drives` | — | — | — | **REJECT** — single personal drive (`Files.ReadWrite` / `/me/drive`); no `driveId` in any schema; SharePoint/shared drives out of manifest scope | n/a |

**The UI-scope `parentItemId` schema change (META-3, required for the `itemId` cascade):** add `parentItemId: z.string().optional()` to the 4 item-targeted `.strict()` schemas — `getFile`, `deleteItem`, `moveItem`, `copyItem`. Handler-ignored; `.strict()` still rejects genuinely-unknown fields. This is the **established Trello `boardId` / Monday `boardId` / OneNote `notebookId` / Dropbox `folderPath` UI-scope pattern**: it lets the `itemId` picker cascade off a chosen source folder while leaving the runtime untouched. `upload_file`/`create_folder`/`list_items` already have a real `parentItemId`; `move_item`/`copy_item` already have a real `targetParentItemId` (the *destination*, distinct from the *source* `parentItemId` the `itemId` picker needs). The additive `parentItemId` is the only runtime touch this arc (covered by the "tiny unavoidable schema fix" clause).

**Resolver mechanics** (per [`services/options/types.ts`](../../../../services/options/types.ts); mirror Excel/OneNote): each `OptionsResolver { source, provider:"microsoft-onedrive", requiresIntegration:true, requiredDeps?, resolve(ctx) }`; `resolve` calls `driveItemsList` via `refreshAndRetry`, reads `ctx.deps.parentItemId` (items) or none (folders) + optional `ctx.q` (client-side name filter), maps `{value:item.id, label:item.name ?? item.id, description?}`, returns `{items, hasMore}`. **value = the opaque DriveItem id**; label = name. `hasMore = result.nextLink !== null` (Graph paging). Classify auth failures → `INTEGRATION_DISCONNECTED`; `NotFoundError` (parent folder gone) → empty items (cascade fallback); other → `PROVIDER_ERROR` (static message — never leak token / raw Graph body / `downloadUrl` / `webUrl`).

**Tree-navigation limitation (accepted first pass; do not overbuild):** Graph lists children **one level at a time** (no cheap "all folders" query like Google Drive's `files.list`). The first-pass `:folders` picker therefore lists **root-level** folders; the `:items` picker lists **one chosen folder's** children. Deeper destinations/items are typeable, and `itemId` commonly arrives from the trigger. A recursive/bounded folder cascade is a possible META-2+ enhancement, explicitly **not** built now (the task's "don't overbuild expensive full-drive pickers" guidance). **Decision to finalize in META-2:** root-only `:folders` vs. a bounded recursive walk vs. a self-parent drill.

**Recommendation:** build **2 resolvers** in META-2 (`folders` REQUIRED, `items` RECOMMENDED), reusing `driveItemsList` (likely **no new read helper**; add a thin `foldersList`/`itemsList` wrapper only if a cleaner filter/typing is wanted). Reject `drives`. If the team prefers a minimal first cut, `items` may be deferred (itemId typeable + trigger-fed) and shipped folders-only — call it in META-2.

---

## 4. Trigger metadata audit

The single `file_changed` trigger is runtime-real, webhook (Graph subscription-watch with renewal), activation-registered + loaded → **ships TriggerMeta in this arc.** No blockers.

`TriggerMeta` (`activation:"webhook"`, `category:"files"`, `requiresIntegration:true`):
- **Fields: `[]`** — the trigger watches the entire `/me/drive/root`; `activate` reads no per-trigger config (no folder filter exists). _(If a future runtime slice adds folder scoping, a `folderId` field → `microsoft-onedrive:folders` lands then.)_
- **payloadShape** (one shape, from [`normalize.ts`](../../../../integrations/microsoft-onedrive/triggers/fileChanged/normalize.ts) + `normalizeDeleted`): `itemId`, `kind`(file\|folder\|null), `changeType`("updated"), `source`(id-fetch\|delta-fallback), `name`, `size`(number), `mimeType`, `parentReference`(object), `webUrl`, `downloadUrl`(**sensitive**), `createdDateTime`, `lastModifiedDateTime`, `deleted`(boolean — present on the deleted path). Ids / names / sizes / dates / `kind` / `changeType` / `source` / `parentReference` not sensitive.
- **Activation invariant:** satisfied — `registerActivation("microsoft-onedrive","file_changed",…)` loaded via `integrations/_registry.ts`. No `SHARED_INFRA_EXEMPT_KEYS` entry (real per-subscription webhook).
- Trigger coverage is **not** enforced by `discovery-meta-coverage` (precedent: all Phase-4 providers) — `trigger-meta-activation-invariant` is the gate, and it passes.

---

## 5. V2-native decisions (COPY / ADAPT / REPLACE / DEFER / REJECT)

Runtime parity is already settled (Slice 8 shipped 7 actions + 1 trigger; V1's `rename_item`, copy-polling, multi-source upload, `Files.ReadWrite.All`, SharePoint were intentionally not ported). Metadata-only decisions:

- **All 7 actions + the trigger → COPY (surface as-is).** Real handlers, authoritative schemas, accepted V2 surface. No runtime behavior change.
- **`itemId` (get/delete/move/copy) → ADAPT: add a UI-scope optional `parentItemId` to the 4 item-targeted strict schemas.** Trello/Monday/OneNote/Dropbox precedent; the only schema touch; handler-ignored. Enables the source-folder → item cascade.
- **`parentItemId`/`targetParentItemId` → ADAPT to resolver-backed comboboxes** (`microsoft-onedrive:folders`, no dep). `itemId` → `microsoft-onedrive:items` (dep `parentItemId`).
- **2 resolvers → ADD (META-2)** reusing `driveItemsList`. **`drives` → REJECT** (single personal drive).
- **FileRef → DEFER (runtime, not metadata).** The runtime models `upload_file.content` as a string and `downloadUrl` as a string; it does not produce/consume V2 FileRef objects. Modeling FileRef (e.g. `get_file` → `signed_url` FileRef producer; `upload_file` ← `v2_storage`/`signed_url` FileRef consumer) is **handler work**, out of the metadata arc. META-3 models the runtime honestly: `content` = textarea, `downloadUrl` = sensitive string, `producesFileRef/consumesFileRef = false`. Flag a future **ONEDRIVE-FILEREF** runtime slice. _(This corrects the launch-gap-tracker's forward-looking "FileRef provider_url arm cross-refs here" note — provider_url FileRefs are a consumer concern elsewhere; OneDrive's current actions don't emit/consume them.)_
- **`content` → textarea, `contentEncoding` → select, `top` → number, `orderBy` → text.** No FieldType mismatch; documented in help text.
- **`delete_item` → high + destructive + requiresConfirmation (recommended).** Folder delete cascades; recycle-bin recovery is time-limited. Open Marcus sign-off (recycle bin could justify dropping confirmation).
- **`file_changed` trigger → COPY with empty `fields`.** Whole-drive watch; no config. **REJECT inventing a folder filter** (the runtime doesn't support it; don't fabricate a field with no backing).

---

## 6. Implementation slices

| Slice | Scope | Files (implementation slices — NOT this slice) |
|---|---|---|
| **ONEDRIVE-META-1** (this) | Audit + plan (doc-only) | this doc |
| **ONEDRIVE-META-2** | 2 resolvers + (optional thin wrappers) + resolver tests | `integrations/microsoft-onedrive/options/{folders,items}.ts` + shared `_shared.ts`; reuse `api/driveItemsList` (add `foldersList`/`itemsList` only if useful); register in `services/options/_registry.ts`; resolver unit tests (mock the Graph boundary) |
| **ONEDRIVE-META-3** | 7 ActionMeta + 4 UI-scope `parentItemId` schema additions + 1 TriggerMeta + discovery sub-registry + COVERED flip + tests | `integrations/microsoft-onedrive/actions/*.meta.ts` (7); add `parentItemId?` to 4 `.strict()` schemas (getFile/deleteItem/moveItem/copyItem); `integrations/microsoft-onedrive/triggers/fileChanged/fileChanged.meta.ts` (1); new `services/discovery/providers/microsoft-onedrive.ts`; wire into `services/discovery/_registry.ts`; add `"microsoft-onedrive"` to `COVERED_PROVIDERS`; tests (§7) |

**Why 3 slices (same shape as Excel/Airtable/Trello):** OneDrive has a single-parent cascade (no multi-parent), so META-2 is a clean resolver slice. With resolvers in place, META-3 combines 7 ActionMeta + 4 small schema additions + 1 TriggerMeta + sub-registry + COVERED flip in one slice (7+1 = 8 metas, comparable to Trello's 8+6). **Possible 2-slice compression:** because only 2 resolvers are needed (both reusing `driveItemsList`), META-2 + META-3 could merge into one implementation slice if Marcus prefers; the default here is the standard resolver-first 3-slice cadence for reviewability.

---

## 7. Tests required

- **Resolver tests (META-2):** `microsoft-onedrive:folders` lists root folders (folder-filtered) mapped `{value:id,label:name}`; `microsoft-onedrive:items` `requiredDeps:["parentItemId"]` short-circuits `MISSING_DEPENDENCY` (no API call) when absent, lists a folder's children otherwise; `q` filter; `hasMore` from `nextLink`; parent gone (`NotFoundError`) → empty items; auth → `INTEGRATION_DISCONNECTED`; other → `PROVIDER_ERROR`; **no token / raw-Graph-body / downloadUrl leakage**; **Graph boundary mocked — no real API calls**. Registry block: both keys registered; `microsoft-onedrive:drives` absent.
- **Schema tests (META-3):** the 4 item-targeted schemas accept + ignore an extra `parentItemId`; existing action handler tests still pass (parentItemId ignored at runtime; handler never forwards it).
- **ActionMeta shape (META-3):** 7 metas parse; `key==="microsoft-onedrive:<type>"`; `category:"files"`; outputs mirror handler returns; `downloadUrl` sensitive (incl. nested `list_items.items[].downloadUrl`); folder fields → `microsoft-onedrive:folders` (no dep); `itemId` → `microsoft-onedrive:items` + `dependsOn:"parentItemId"`; `content` textarea + no FileRef; `contentEncoding` select; `delete_item` high/destructive/requiresConfirmation; reads low / writes medium; all `producesFileRef/consumesFileRef:false`.
- **TriggerMeta shape (META-3):** 1 meta parses; `activation:"webhook"`; `fields:[]`; payload `downloadUrl` sensitive; `deleted` present.
- **Discovery + provider route:** `listActionMetasForProvider("microsoft-onedrive")`→7, `listTriggerMetasForProvider("microsoft-onedrive")`→1, `listProvidersWithMetadata()` includes it; `/api/providers`→`hasMetadata:true`; `/actions`→7; `/triggers`→1 (new `microsoft-onedrive-provider-route.test.ts` + `microsoft-onedrive-discovery.test.ts` + `microsoft-onedrive-triggers-discovery.test.ts`).
- **Structural invariants:** `discovery-meta-coverage` passes with `microsoft-onedrive` in `COVERED_PROVIDERS` (1:1 handler↔meta, all 7); `trigger-meta-activation-invariant` passes (no exemption); `sensitive-output-coverage` passes (`downloadUrl` covered everywhere). _(Note: `providers-route.test.ts`'s "still-pending example" stays a genuinely-pending provider — e.g. `microsoft-teams` — no change needed there since OneDrive's own hasMetadata=true assertion lives in its provider-route test.)_
- **Guards:** no secret-shaped output names; no provider API calls in metadata tests; `microsoft-onedrive:drives` never referenced.

---

## 8. Acceptance criteria

OneDrive is metadata/builder-complete only when:

- [ ] all 7 runtime actions have `ActionMeta` (1:1 with the handler registry);
- [ ] the `file_changed` webhook trigger has `TriggerMeta` (empty `fields`) with a passing activation invariant;
- [ ] `microsoft-onedrive:folders` resolver exists (`:items` shipped or explicitly deferred with rationale); `:drives` rejected; reused `driveItemsList` (or thin wrappers) — no scope change / reconnect;
- [ ] the 4 UI-scope `parentItemId` schema additions are in place (additive, handler-ignored) and existing handler tests still pass;
- [ ] `/api/providers` reports OneDrive `hasMetadata:true` (no longer "coming soon"); actions render with working folder/item pickers; `downloadUrl` outputs flagged sensitive;
- [ ] `microsoft-onedrive` is in `COVERED_PROVIDERS`;
- [ ] `discovery-meta-coverage` + `trigger-meta-activation-invariant` + `sensitive-output-coverage` pass;
- [ ] targeted OneDrive tests (§7) pass;
- [ ] **no OneDrive runtime handler behavior changed** (metadata + handler-ignored UI-scope fields only; FileRef deferred);
- [ ] the `delete_item` confirmation decision (§2) is signed off.

On completion, update [`provider-metadata-launch-gap-tracker.md`](../provider-metadata-launch-gap-tracker.md) (OneDrive → covered; **22/26 covered, 4 pending**).

---

## Appendix — risks / blockers summary

1. **2 resolvers required, both reuse `driveItemsList`** (likely no new read helper). META-2; read-only against the existing `Files.ReadWrite` scope → no scope change / reconnect.
2. **4 UI-scope `parentItemId` schema additions** (META-3) — small additive runtime-schema change (Trello/Monday/OneNote/Dropbox precedent); handler-ignored; the only runtime touch. Enables the `itemId` source-folder cascade.
3. **Tree navigation** — Graph lists children one level at a time (no cheap all-folders query). First pass = root folders + one drill level; deeper is typeable; `itemId` commonly trigger-fed. Recursive folder cascade explicitly deferred (don't overbuild). META-2 finalizes the `:folders` shape.
4. **FileRef deferred** — the runtime uses content-strings + `downloadUrl`-strings, not the FileRef system. `producesFileRef/consumesFileRef:false`; `downloadUrl` sensitive. A future **ONEDRIVE-FILEREF** runtime slice can add producer/consumer FileRef support (out of metadata scope).
5. **`delete_item` = high/destructive** — folder delete cascades to children; recycle-bin recovery is time-limited. Recommend high + isDestructive + requiresConfirmation. Open Marcus sign-off.
6. **Single drive** — no `driveId` anywhere; `:drives` resolver rejected; SharePoint/shared drives out of `Files.ReadWrite` scope (V1's `.All` deliberately not ported).
7. **Trigger has no config** — `file_changed` watches the whole drive root; `TriggerMeta.fields:[]`. Don't fabricate a folder filter the runtime can't honor.
8. **`downloadUrl` is sensitive everywhere** (upload/get/list-nested/trigger) — `@microsoft.graph.downloadUrl` pre-signed URL + suspicious-name set. Must be marked or `sensitive-output-coverage` fails.
9. **Auth = refreshable** — resolvers use `refreshAndRetry({provider:"microsoft-onedrive", accountId})` (Excel/OneNote pattern), NOT Trello's decrypt-direct.

---

## 9. ONEDRIVE-META-2 outcomes (shipped 2026-05-25)

**Scope delivered:** 2 options resolvers + shared helpers + tests. **No** ActionMeta/TriggerMeta, **no** UI-scope `parentItemId` schema fields, **no** `COVERED_PROVIDERS` flip — those remain ONEDRIVE-META-3. OneDrive is still `hasMetadata:false` ("coming soon") after this slice; resolver-first, matching the Excel/Airtable/Trello order.

### 9.1 Resolvers added (`integrations/microsoft-onedrive/options/`)

| Source | requiredDeps | helper | value | label | description | order | hasMore |
|---|---|---|---|---|---|---|---|
| `microsoft-onedrive:folders` | — | **reuse `driveItemsList`** (root) + client folder-filter | DriveItem id | name → id | `Modified YYYY-MM-DD` | **alpha sort** (root picker) | `nextLink !== null` |
| `microsoft-onedrive:items` | `["parentItemId"]` | **reuse `driveItemsList`** (parent's children) | DriveItem id | name → id | `"Folder"` / file `mimeType` / `"File"` | preserve Graph order | `nextLink !== null` |

Shared helpers in `options/_shared.ts`: `PAGE_SIZE` (100), `requireOneDriveIntegration`, `requireDep`, `mapOneDriveOptionsError`, `filterByLabel`, `formatModified`.

### 9.2 Helper reuse confirmed (no new read helper)

Both resolvers reuse the **existing `api/driveItemsList`** wrapper (`GET /me/drive/root/children` for folders; `GET /me/drive/items/{parentItemId}/children` for items). **No new read helper was added** — OneDrive's `api/` already had a list helper (contrast Trello/Airtable, whose `api/` was mutation-only and needed new `*List` helpers). No transport / error-mapping duplicated. **No runtime handler behavior changed.**

### 9.3 Dependency name + auth

`microsoft-onedrive:items` depends on **`parentItemId`** (verbatim — the UI-scope field ONEDRIVE-META-3 adds to `getFile`/`deleteItem`/`moveItem`/`copyItem`). Single-parent cascade (no multi-parent). **Auth = refreshable** → both resolvers wrap the Graph read in `refreshAndRetry({provider:"microsoft-onedrive", accountId: providerAccountId})` (Excel/OneNote pattern), NOT decrypt-direct.

### 9.4 Cascade fallback + error sanitization

`microsoft-onedrive:items`: missing/empty `parentItemId` → `MISSING_DEPENDENCY` (no API call); deleted/no-access parent folder (`NotFoundError`) → **empty items** (not an error). `folders` (root) has no parent, so no NotFound cascade. Both: `IntegrationActionRequiredError`/`Unauthorized401Error` → `INTEGRATION_DISCONNECTED`; any other error → `PROVIDER_ERROR` with a static message. Sanitized strings never carry the token, raw Graph bodies, file contents, or `@microsoft.graph.downloadUrl` URLs (regression test: a downloadUrl in the payload never reaches resolver output).

### 9.5 First-pass scope + rejected resolver (unchanged)

`folders` lists **root-level** folders only (Graph lists one level at a time; a recursive/full-tree folder crawl is **deferred** — not built here). Deeper destinations typeable; `itemId` commonly trigger-fed. **`microsoft-onedrive:drives` remains REJECTED** (single personal drive; no `driveId` in any schema) — registry test asserts it stays absent.

### 9.6 Tests

- `tests/unit/integrations/microsoft-onedrive/options/folders.test.ts` — shape, refreshAndRetry-pinned-to-accountId, `driveItemsList(root, PAGE_SIZE)` call, folders-only filter, value/label/Modified-description mapping, alpha sort, q filter, hasMore from nextLink, integration-null/auth → `INTEGRATION_DISCONNECTED`, other → `PROVIDER_ERROR` no-leak.
- `tests/unit/integrations/microsoft-onedrive/options/items.test.ts` — shape (dep `parentItemId`), call with parentItemId, files+folders mapping (Folder/mimeType/File), **no downloadUrl/content leak**, `MISSING_DEPENDENCY`, `NotFoundError` → empty items, q filter, hasMore, auth/provider-error sanitization.
- Registry block in `tests/unit/services/options/_registry.test.ts` — both keys registered, deps verbatim, `microsoft-onedrive:drives` absent.

### 9.7 Carried to ONEDRIVE-META-3

7 ActionMeta + 4 UI-scope `parentItemId` schema additions (get/delete/move/copy) + 1 TriggerMeta (`fields:[]`) + discovery sub-registry + `COVERED_PROVIDERS` flip. (Marcus decisions locked: FileRef deferred — `content` textarea, `downloadUrl` sensitive string; `delete_item` = high/destructive/requiresConfirmation.)

---

## 10. ONEDRIVE-META-3 outcomes (shipped 2026-05-25)

**Scope delivered:** 7 ActionMeta + 1 TriggerMeta + 4 UI-scope `parentItemId` schema additions + discovery sub-registry + `COVERED_PROVIDERS` flip + tests. **OneDrive is now builder-visible — `/api/providers` reports `hasMetadata:true`.** Covered providers **21/26 → 22/26**; pending **5 → 4**.

### 10.1 ActionMeta (7, displayOrder 10..70) — `integrations/microsoft-onedrive/actions/<action>.meta.ts`

`list_items` (10), `get_file` (20), `upload_file` (30), `create_folder` (40), `move_item` (50), `copy_item` (60), `delete_item` (70). All `category:"files"`, `requiresIntegration:true`, **all `producesFileRef:false` / `consumesFileRef:false`** (every literal sets the 4 risk/FileRef flags explicitly).

- **Risk:** `get_file` / `list_items` **low** (reads); `upload_file` / `create_folder` / `move_item` / `copy_item` **medium**; **`delete_item` high + isDestructive + requiresConfirmation** (Marcus decision — folder delete cascades to children; recycle-bin recovery time-limited; `riskDescription` says so).
- **FileRef deferred (Marcus decision):** `upload_file.content` is a **textarea** (raw utf8/base64 string), NOT a `file` field; `consumesFileRef:false`. `downloadUrl` outputs (`upload_file`, `get_file`, nested `list_items.items[].downloadUrl`) are **sensitive**. A future ONEDRIVE-FILEREF runtime slice can add FileRef producer/consumer support.

### 10.2 UI-scope `parentItemId` schema additions (4 item-targeted schemas)

Added optional `parentItemId: z.string().optional()` to `getFile` / `deleteItem` / `moveItem` / `copyItem`. **Handler-ignored** (Trello `boardId` / Monday / OneNote / Dropbox precedent); `.strict()` still rejects unknowns. In `moveItem` it is NOT counted by the cross-field refine, so a `parentItemId`-only config still fails the "at least one of `targetParentItemId`/`newName`" rule. It is the SOURCE folder (distinct from `targetParentItemId`, the destination on move/copy). `upload_file`/`create_folder`/`list_items` already have a real `parentItemId`. **No runtime handler behavior changed** (test-verified: `get_file` never forwards `parentItemId`).

### 10.3 optionsSource / dependsOn wiring (resolvers from META-2)

`parentItemId` (real on upload/create/list; UI-scope on get/delete/move/copy) + `targetParentItemId` (move/copy) → `microsoft-onedrive:folders` (no dep). `itemId` → `microsoft-onedrive:items` (dep `parentItemId`). **All single-parent on `parentItemId` — no multi-parent.** No field references `microsoft-onedrive:drives`.

### 10.4 TriggerMeta (1 webhook) — `triggers/fileChanged/fileChanged.meta.ts`

`file_changed`: `activation:"webhook"`, `requiresIntegration:true`, `category:"files"`, **`fields:[]`** (whole-drive watch; no per-trigger config). Payload `downloadUrl` sensitive; ids/names/dates/kind/changeType/source/parentReference/deleted structural. Activation already registered → `trigger-meta-activation-invariant` passes with no exemption.

### 10.5 Discovery + COVERED

New `services/discovery/providers/microsoft-onedrive.ts` (`MICROSOFT_ONEDRIVE_ACTION_METAS` ×7 + `MICROSOFT_ONEDRIVE_TRIGGER_METAS` ×1), spread into `services/discovery/_registry.ts`. `microsoft-onedrive` added to `COVERED_PROVIDERS` in `tests/structure/discovery-meta-coverage.test.ts` (1:1 handler↔meta now enforced).

### 10.6 Tests

`microsoft-onedrive-discovery.test.ts` (action surface), `microsoft-onedrive-triggers-discovery.test.ts` (trigger surface), `microsoft-onedrive-provider-route.test.ts` (route `hasMetadata`/actions/triggers wire shape), `uiScopeParentItemId.test.ts` (4 schemas accept+preserve `parentItemId`, reject unknowns, move_item refine unaffected, handler ignores `parentItemId`). Structure invariants pass: `discovery-meta-coverage`, `trigger-meta-activation-invariant`, `sensitive-output-coverage`.

### 10.7 Acceptance criteria (§8) — met

All 7 actions have ActionMeta; `file_changed` has TriggerMeta + passing activation invariant; `folders`/`items` resolvers exist (META-2); `:drives` rejected; reused `driveItemsList`; 4 UI-scope `parentItemId` additions in place + handler tests still pass; `/api/providers` OneDrive `hasMetadata:true`; `microsoft-onedrive` in `COVERED_PROVIDERS`; structure invariants pass; targeted tests pass; **no runtime handler behavior changed** (FileRef deferred); `delete_item` confirmation signed off.
