# Google Drive — Builder Metadata Coverage Plan (GDRIVE-META-1)

**Slice:** 4.GDRIVE-META-1 (this plan) → GDRIVE-META-2 (metas + trigger + COVERED flip — single implementation slice; **no resolver slice needed** — see §2/§7).
**Type:** Doc-only audit + plan. **No runtime/metadata/test files modified by this slice.**
**Date:** 2026-05-25
**Branch (verified at authoring):** `ai-12c-planner-json-only-hardening` (shared worktree — provider + AI commits interleaved; verify topology before push).
**Parent tracker:** [`provider-metadata-launch-gap-tracker.md`](../provider-metadata-launch-gap-tracker.md)
**Sibling precedents:** [`google-calendar-metadata-coverage-plan.md`](../google-calendar-metadata-coverage-plan.md) (Google-stack twin — no-resolver / no-UI-scope, destructive delete), [`onedrive-metadata-coverage-plan.md`](./onedrive-metadata-coverage-plan.md) (Graph file/folder pickers, destructive delete + FileRef deferred), [`teams-metadata-coverage-plan.md`](./teams-metadata-coverage-plan.md) (no-UI-scope-additions; parents already real fields).
**Standard:** V2-native COPY / ADAPT / REPLACE / DEFER / REJECT — never raw V1 handler-count parity, never blind V1 copy.

Google Drive is the **8th** provider in the pending-metadata launch-gap arc (after Shopify, Excel, Airtable, Trello, OneDrive, Teams, GCal) and the **1st of the final 2 remaining** launch-scope providers (`google-drive`, `microsoft-outlook-calendar`). **Current state (code-verified):** **5 runtime actions + 1 webhook (watch-based push) trigger** registered and real; **0 ActionMeta, 0 TriggerMeta**; **`google-drive:folders` options resolver already shipped and tested** (Slice 3.GDOCS-3); absent from the discovery registry; `/api/providers` reports `hasMetadata:false` → Drive renders as **"coming soon"**. It is the current canonical "still-pending" example in `providers-route.test.ts` after the GCAL-META-2 swap.

**Five facts drive the slice plan:**

1. **The `google-drive:folders` resolver is ALREADY shipped, tested, and reusable as-is** — account-scoped, no deps, alphabetical, 200/page, used today by Google Docs. Every `parentFolderId` / `folderId` / `newParentFolderId` / trigger-watch field can wire to it with zero new resolver work.
2. **NO UI-scope schema additions.** `parentFolderId` (upload/create), `folderId` (list, trigger filter), `newParentFolderId` (move), `fileId` (move/delete/trigger watch-target) are ALL already real fields on the runtime schemas. Like Teams/GCal, GDRIVE-META-2 touches no runtime schema.
3. **`delete_file` is destructive in BOTH modes.** The schema's Q11-required `permanent` toggles `permanent=true` (irreversible DELETE) vs `permanent=false` (trashed — recoverable from Drive UI, but auto-purged after ~30 days). Meta-level risk has to pick ONE value; safety + sibling precedent (OneDrive `delete_item`, Airtable `delete_record`) → **high / isDestructive / requiresConfirmation** regardless of mode.
4. **The trigger has TWO folder-shaped config fields** — `fileId` (the WATCH TARGET; default `"root"` = whole Drive; what Drive subscribes to) AND `folderId` (an OPTIONAL POST-FETCH FILTER; emit only changes for files whose `parents` includes this folder). They are runtime-real and persist into `trigger_resources.config`. The meta exposes both with clear distinct help text — runtime owns the names; we don't rename.
5. **FileRef is deferred (mirror OneDrive).** `upload_file.content` is a `string` (utf8 / base64) — V1's multi-source upload (URL fetch / piped buffer) is intentionally NOT ported. `producesFileRef:false` / `consumesFileRef:false` for all 5; `content` renders as `textarea`. A future GDRIVE-FILEREF slice can promote uploads to consume FileRef and downloads to produce one.

---

## 1. Current Google Drive runtime inventory

**Manifest** ([`integrations/google-drive/manifest.ts`](../../../../integrations/google-drive/manifest.ts)): id `google-drive`, displayName "Google Drive". `apiVersion:"v3"`, `tokenScope:"user"` (one integration per (user, email), mirrors Gmail/Calendar), `oauthFlows:["v2"]`, `accountIdField:"email"`, `refreshable:true`, `healthCheckIntervalMs:6h`. Capabilities `oauth/webhookTrigger/actions:true`, `pollingTrigger:false`. **Scopes (verified):** **full `drive`** + `userinfo.email`. The full scope grants every read/write/watch the Batch 1 surface needs and incidentally satisfies any future `files`/`shared_drives` resolver — there is **no scope gap** to negotiate (contrast Calendar, which was scope-blocked on `calendarList`).

**OAuth** ([`oauth.ts`](../../../../integrations/google-drive/oauth.ts)): shared Google PKCE flow (`integrations/_shared/google/oauth.ts`); accountId resolved via OIDC userinfo. **Auth is refreshable** → all reads/writes go through `refreshAndRetry({provider:"google-drive", accountId})`.

**API helpers** ([`api/`](../../../../integrations/google-drive/api/)): `filesCreate`, `filesCreateMultipart`, `filesGet`, `filesList`, `filesUpdate`, `filesDelete`, `filesExport`, `filesWatch`, `permissionsCreate`, `changesGetStartPageToken`, `changesList`, `channelsStop`, `_base` (`driveApiBase()`), `errors` (`NotFoundError`, `PageTokenExpiredError`). **`filesList` already accepts `mimeType` + `orderBy` + `fields` + `pageSize` + `pageToken`** (extended for the folders resolver — and ready for a future `files` resolver if one ships). **`filesExport` + `permissionsCreate` have wrappers + tests but NO action wires them** — future export / share action hooks (out of scope for v1; documented).

### 1.1 Registered action handlers (5)

Source of truth: [`services/execution/handlers/_registry.ts:389-393`](../../../../services/execution/handlers/_registry.ts). Keys verified verbatim. `*` = required at the schema layer.

| # | Action key | Handler / schema | Key config fields | Output keys | Risk | Sensitive outputs | Pickers |
|---|---|---|---|---|---|---|---|
| 1 | `upload_file` | uploadFile.ts / `UploadFileConfigSchema` | filename*, mimeType*, content*, contentEncoding(utf8\|base64, def utf8), parentFolderId? | `{fileId, name, mimeType, parents, webViewLink, size, createdTime}` | create → **medium** | none | parentFolderId→folders |
| 2 | `create_folder` | createFolder.ts / `CreateFolderConfigSchema` | name*, parentFolderId? | `{folderId, name, parents, webViewLink, createdTime}` | create → **medium** | none | parentFolderId→folders |
| 3 | `list_files` | listFiles.ts / `ListFilesConfigSchema` | folderId?, pageSize(1–1000, def 100), pageToken?, includeTrashed(def false) | `{files, nextPageToken, incompleteSearch}` | read → **low** | `files` (bulk metadata — may carry owner emails) | folderId→folders |
| 4 | `move_file` | moveFile.ts / `MoveFileConfigSchema` | fileId*, newParentFolderId* | `{fileId, name, parents, previousParents, modifiedTime}` | update → **medium** | none | fileId→text (defer); newParentFolderId→folders |
| 5 | `delete_file` | deleteFile.ts / `DeleteFileConfigSchema` | fileId*, **permanent*** (Q11, no default) | `{fileId, mode("permanent"\|"trash"), alreadyDeleted, [trashed]}` | delete → **high / DESTRUCTIVE / confirm** | none | fileId→text (defer) |

**Notable runtime facts (V2 design decisions, schema JSDocs):**
- **Q11 (no hidden defaults):** `delete_file.permanent` is REQUIRED — V1's silent "trash" default that surprised authors expecting a hard delete is fixed.
- **V1 narrowings deliberately NOT ported:** `upload_file`'s multi-source upload (URL fetch / piped buffer / runtime resolver) — author pre-encodes to base64 upstream; `list_files`'s full Drive `q` syntax (mimeType/starred/sharedWithMe filters) — author filters post-list. Shared Drives (`supportsAllDrives`) not in any schema.
- **`move_file`** does a GET-then-PATCH (`filesGet` for current parents → `filesUpdate?addParents=&removeParents=`). Already-in-parent is idempotent (Drive accepts re-add).
- **`delete_file` is idempotent at the API layer** in both modes (`NotFoundError` → `alreadyDeleted:true`) — but the action is still destructive (irreversible permanent OR ~30-day trash auto-purge).
- **25 MB upload cap** enforced inside `filesCreateMultipart` (server-side decoded-size check) — surfaced as a clear error, not retried.

### 1.2 Registered trigger (1 — webhook watch-based push)

[`triggers/fileChanged/`](../../../../integrations/google-drive/triggers/fileChanged/). **Registered key = `file_changed`** (directory `fileChanged`, runtime key snake_case `file_changed`). `index.ts` does `registerActivation("google-drive","file_changed",activate)` + `registerDeactivation(...)` + `registerSubscriptionHandler(driveFileChangedSubscriptionHandler)`. Imported at `integrations/_registry.ts` (verified earlier — sibling line to gcal) → loads at module init, so the **trigger-meta-activation-invariant will pass with no `_registry` change and no exemption** once TriggerMeta lands.

| Trigger key | Normalized type | Model | Lifecycle | User config | Ship now? |
|---|---|---|---|---|---|
| `file_changed` | google-drive.file_changed | **webhook** (Google `files.watch` push channel + Drive Changes API → `/api/webhooks/google-drive`) | `activate`: (1) capture baseline cursor via `changes.getStartPageToken` (the "first-poll-miss" guard); (2) `files.watch` registers a signed channel on `fileId` (or `"root"`), persists `{channelId, resourceId, fileId, pageToken, expiresAt, type:"subscription-watch"}`. `pull` fetches the delta via `changes.list?pageToken=…` (410 Gone → re-baseline via `changes.getStartPageToken`, dispatch 0). **renewal** via `subscriptionRegistry` before the ~24-hour expiry. `deactivate` stops the channel. | `fileId?` (watch target — folder id; default `"root"` = whole Drive) + `folderId?` (POST-FETCH FILTER — emit only changes whose file is a direct child of this folder) | ✅ yes |

Payload (from [`normalize.ts`](../../../../integrations/google-drive/triggers/fileChanged/normalize.ts)): `changeKind` (`created`\|`updated`\|`removed` — heuristic on `removed` / `trashed` / `createdTime===modifiedTime`), `objectKind` (`file`\|`folder`), `fileId`, `name`, `mimeType`, `parents`, `webViewLink`, `modifiedTime`, `trashed`, `removed` — **10 fields**. (Drive-level changes — `changeType==="drive"` — are dropped; Batch 1 is file/folder-only.) Ships TriggerMeta; config = `fileId` (watch target) + `folderId` (optional filter).

---

## 2. Existing resolver / helper audit

**Headline: `google-drive:folders` already exists, is tested, and is fully reusable.** No new resolver work is required for GDRIVE-META-2's accepted surface.

| Resolver | Status | requiredDeps | Source / endpoint | Ready for metadata consumption? |
|---|---|---|---|---|
| `google-drive:folders` | ✅ **SHIPPED** ([`integrations/google-drive/options/folders.ts`](../../../../integrations/google-drive/options/folders.ts), registered at [`services/options/_registry.ts:434`](../../../../services/options/_registry.ts), tested at [`tests/unit/integrations/google-drive/options/folders.test.ts`](../../../../tests/unit/integrations/google-drive/options/folders.test.ts)) | — (account-scoped) | `filesList` with `mimeType="application/vnd.google-apps.folder"`, `orderBy:"name"`, `pageSize:200`, `fields:"files(id,name),nextPageToken"`. `value=id`, `label=name`, no description. Client-side substring `q` filter. `hasMore=true` when page hits 200. `refreshAndRetry({provider:"google-drive", accountId:null})`. Error sanitization: `IntegrationActionRequiredError`/`Unauthorized401Error` → `INTEGRATION_DISCONNECTED` (with reconnect prompt); else → `PROVIDER_ERROR`. No token / raw-body / owner-email leakage. | ✅ Yes — wire as-is on every folder-picker field (`parentFolderId`, `folderId`, `newParentFolderId`, trigger `fileId`, trigger `folderId`). No code changes, no scope changes, no test changes. |
| `google-drive:files` | ❌ Not built | — / `["folderId"]` (multi-parent possible) | (would reuse `filesList` w/o folder-mimeType filter; would need ordering + pagination decisions) | n/a — DEFER (§4) |
| `google-drive:items` | ❌ Not built | — | (would unify folders + files) | n/a — REJECT (§4) |
| `google-drive:shared_drives` | ❌ Not built | — | (would need new `drivesList` helper + `supportsAllDrives` cascade across all reads/writes) | n/a — REJECT (§4) |

**Shared helper extension already shipped (Slice 3.GDOCS-3):** `filesList` accepts `mimeType` / `orderBy` / `fields` for the folders resolver — the same wrapper is ready for a future files resolver without further extension. **`changesList` / `changesGetStartPageToken` / `filesWatch` / `channelsStop` / `permissionsCreate` / `filesExport`** all exist with tests but are unused outside the trigger (permissionsCreate + filesExport have NO action consumer — future share/export action hooks, out of scope for v1).

---

## 3. Builder metadata requirements (ActionMeta per action)

Pattern: co-located `<action>.meta.ts`. **Field names camelCase**, verbatim to the runtime schemas: `filename`, `mimeType`, `content`, `contentEncoding`, `parentFolderId`, `name`, `folderId`, `pageSize`, `pageToken`, `includeTrashed`, `fileId`, `newParentFolderId`, `permanent`.

**Common defaults:** `requiresIntegration:true`; **`category:"files"`** (Drive is a file-management tool — same call as OneDrive / Dropbox); sequential `displayOrder` (10..50); `producesFileRef:false`, `consumesFileRef:false` for all (FileRef deferred — mirror OneDrive). _(Reminder: every `: ActionMeta` literal must set `producesFileRef`/`consumesFileRef`/`isDestructive`/`requiresConfirmation`/`riskLevel` explicitly — Zod `.default()` applies only at `.parse()`, per the AIRTABLE-META-3 learning.)_

**Risk classification:**
- **low** — `list_files` (pure read).
- **medium** — `upload_file`, `create_folder`, `move_file` (recoverable external mutations).
- **high / `isDestructive:true` / `requiresConfirmation:true`** — `delete_file` (irreversible in permanent mode; recoverable but auto-purged after ~30 days in trash mode — safety-first single-tier risk, sibling precedent OneDrive `delete_item`). Must pair `riskLevel:"high"` (contract `superRefine` requires it). `riskDescription`: "Deletes a file. With Permanent on, the file cannot be recovered. With Permanent off, the file is trashed (restorable from the Google Drive UI, but auto-purged after about 30 days)."

**Field-type mapping** (every type from [`contracts/actionMeta.ts`](../../../../contracts/actionMeta.ts) `FieldTypeSchema`):
- `parentFolderId` (upload/create) / `folderId` (list) / `newParentFolderId` (move) → **combobox + `optionsSource:"google-drive:folders"`** (no dep). Required only on `move_file.newParentFolderId`; optional elsewhere.
- `fileId` (move/delete) → **text**, required. Picker DEFERRED (§4 — files resolver large/ambiguous; commonly trigger/upstream-fed). Placeholder `"{{trigger.fileId}} or from List Files"`.
- `filename` (upload) → **text**, required.
- `mimeType` (upload) → **text**, required. Placeholder `"application/pdf"`. (Static select with the 256-option cap can't enumerate the long-tail; text is honest.)
- `content` (upload) → **textarea**, required. Help text mentions the 25 MB cap and base64 for binary. FileRef integration DEFERRED (mirror OneDrive `content=textarea` precedent).
- `contentEncoding` (upload) → **select** (`utf8`/`base64`), `defaultValue:"utf8"` (UI hint; schema owns authoritative default).
- `name` (create) → **text**, required.
- `pageSize` (list) → **number**, optional, `numeric:{min:1,max:1000,integer:true}`, `defaultValue:100`.
- `pageToken` (list) → **text**, optional.
- `includeTrashed` (list) → **boolean**, optional, `defaultValue:false`.
- `permanent` (delete) → **boolean**, **required** (Q11 — author MUST choose). Help text spells out the difference.

**Sensitive outputs:**
- `list_files.files` → **mark sensitive** (bulk array of full Drive file resources; Drive's default `files.list` field set includes owners with email addresses — same "bulk read carries PII" precedent as Notion `results` / Gmail `messages` / GCal `events`).
- **NOT marked** (consistent with the "ids / titles / urls / dates not over-marked" precedent across Teams/OneDrive/GCal): `fileId`, `folderId`, `name`, `mimeType`, `parents`, `webViewLink` (Drive UI deeplink — requires auth, not a signed URL; mirrors OneDrive `webUrl` / Teams `webUrl` / GCal `htmlLink`), `size`, `createdTime`, `modifiedTime`, `nextPageToken`, `incompleteSearch`, `previousParents`, `mode`, `alreadyDeleted`, `trashed`.
  - **Secret-name guard:** Drive outputs use `nextPageToken` (not exact `token`) → safe.
  - **No nested `email` exposed:** keep `files` as plain `type:"array"` without nested `fields[]` in v1 — the structural test won't force anything, and the sensitive mark covers the bulk content.
  - **No `downloadUrl` exposed** (unlike OneDrive). Drive's `webContentLink` / `webViewLink` are auth-gated, not pre-signed; we surface only `webViewLink`. No future `downloadUrl` should be added without `sensitive:true` (it's in the suspicious set).

**Task cost:** per the central policy ([`lib/workflows/cost-calculator.ts`](../../../../lib/workflows/cost-calculator.ts) — `provider_action = 1`), each Drive action bills **1 task on success** (the read included). No per-meta override. Today these 5 are `unknown_node` (0 + warning) because they have no meta; adding metas makes them billable at the default 1-task category cost **automatically via grounding** — no billing code edit. **This track changes no billing code.**

---

## 4. Options resolver audit

**Headline: only the existing `google-drive:folders` resolver is needed for v1.** Three other candidates are deferred or rejected.

| Resolver | Serves | Endpoint / helper | requiredDeps | Ship in arc? | Hand-type fallback? |
|---|---|---|---|---|---|
| `google-drive:folders` | parentFolderId, folderId, newParentFolderId (actions) + fileId, folderId (trigger) | (existing — `filesList` w/ folder mimeType) | none | **REUSE — already shipped (§2)** | n/a |
| `google-drive:files` | fileId on move/delete | (would reuse `filesList` w/o folder filter) | `["folderId"]` (multi-parent possible — BUILDER-OPTIONS-1) | **DEFER (v1)** — file lists are large/ambiguous, ordering/dedup non-trivial; `fileId` overwhelmingly flows from the `file_changed` trigger or `list_files.files`. Don't overbuild (explicit task guidance). | Yes — typeable / `{{trigger.fileId}}` |
| `google-drive:items` | (hypothetical — folders + files combined) | (would unify the two) | — | **REJECT (v1)** — folders are picker-friendly and small; files are large and ambiguous. The split is cleaner and matches how runtime fields actually distinguish them (parentFolderId ≠ fileId). No runtime consumer needs a unified picker. | n/a |
| `google-drive:shared_drives` | (hypothetical — driveId on supportsAllDrives flows) | (would need new `drivesList` helper + cascade across all reads/writes) | — | **REJECT (v1)** — no action accepts a driveId; manifest scope grants access but the runtime surface is My-Drive-scoped per Batch 1 design. Shared Drives is a runtime expansion, not a metadata one. No runtime consumer. | n/a |

**No UI-scope schema additions:** every picker's parent is already a real field — `parentFolderId` / `folderId` / `newParentFolderId` / `fileId` already exist on the runtime schemas (Drive's case mirrors Teams `teamId`/`channelId`, contrast Trello `boardId` / OneDrive `parentItemId`). META-2 touches **no runtime schema**.

**The `files` deferral (the one minor UX gap):** `move_file.fileId` + `delete_file.fileId` ship as typeable text. The realistic UX is: workflow author either pastes a file id, or wires `{{trigger.fileId}}`, or chains off `list_files.files[0].id`. A future `google-drive:files` resolver (multi-parent `dependsOn:["folderId"]`) is feasible reusing `filesList` — but it's expensive (a folder's file list can be huge), ordering-ambiguous, and the upstream-fed pattern works. **Recommendation:** typeable for v1; revisit if real workflow authors ask for a picker.

**Resolver mechanics for `folders` (already implemented):** `OptionsResolver { source:"google-drive:folders", provider:"google-drive", requiresIntegration:true, no requiredDeps }`; mocks the Drive boundary in tests; no token / raw-body / owner-email leakage.

**Recommendation:** **REUSE the shipped folders resolver across all 5 ActionMeta + the TriggerMeta.** No new resolver, no new helper, no resolver-slice — combine metas + trigger + COVERED into one implementation slice (GDRIVE-META-2). Defer files; reject items + shared_drives.

---

## 5. Trigger metadata audit

The single `file_changed` trigger is runtime-real, webhook (Google Drive Changes API + watch+push with renewal), activation-registered + loaded → **ships TriggerMeta in this arc.**

`TriggerMeta` (`activation:"webhook"`, `category:"files"`, `requiresIntegration:true`):
- **Fields (two folder-shaped knobs — runtime owns the names):**
  - `fileId` (**combobox → `google-drive:folders`, optional, default `"root"`**) — the WATCH TARGET. Drive subscribes to changes on this folder. Default `"root"` = the user's entire Drive. Picker shows folders only (runtime stores the literal `"root"` if unset; the picker can leave it empty for the default).
  - `folderId` (**combobox → `google-drive:folders`, optional**) — POST-FETCH FILTER. When set, the trigger only emits changes whose file is a DIRECT child of this folder. Independent of `fileId`. Help text spells out the distinction.
- **payloadShape (10 fields):** `changeKind`, `objectKind`, `fileId`, `name`, `mimeType`, `parents`, `webViewLink`, `modifiedTime`, `trashed`, `removed`. **Sensitive:** none plan-marked — file `name` is a title-like field (mirror Teams `subject`, GCal `summary` — not in the suspicious set, not marked); `webViewLink` is auth-gated, not signed (mirror OneDrive `webUrl` / GCal `htmlLink` — not marked); ids / mimeType / parents / dates / `trashed` / `removed` / `changeKind` / `objectKind` are structural. _Marcus decision opportunity:_ if file names should be considered PII in this product context, mark `name` sensitive — but the precedent across all sibling triggers (Teams subject, GCal summary, OneDrive file_changed empty payload) is title-like fields stay unmarked. Recommended: leave unmarked.
- **Activation invariant:** satisfied — `registerActivation("google-drive","file_changed",…)` loaded via `integrations/_registry.ts`. No `SHARED_INFRA_EXEMPT_KEYS` entry (real per-(target) push channel).
- Trigger coverage is **not** gated by `discovery-meta-coverage` (precedent: all Phase-4 providers) — `trigger-meta-activation-invariant` is the gate, and it passes.

**Single-trigger model note:** `changeKind` + `objectKind` distinguish created/updated/removed × file/folder in one trigger (per the runtime design). Workflow authors branch on `payload.changeKind` / `payload.objectKind` downstream. Drive-level changes (`changeType==="drive"`) are dropped at normalize.

---

## 6. V2-native decisions (COPY / ADAPT / REPLACE / DEFER / REJECT)

Runtime parity is settled (Slice 4 shipped 5 actions + 1 trigger; V1's multi-source upload, full Drive `q` syntax, `supportsAllDrives`, silent trash default were deliberately not ported). Metadata-only decisions:

- **All 5 actions + the `file_changed` trigger → COPY (surface as-is).** Real handlers, authoritative schemas, accepted V2 surface. No runtime behavior change. **No UI-scope schema additions** (parents are real fields). Metadata documents the **V2** surface, not V1.
- **`parentFolderId` / `folderId` / `newParentFolderId` / trigger `fileId` / trigger `folderId` → ADAPT to `combobox + optionsSource:"google-drive:folders"`** (existing resolver — no new code).
- **`fileId` on `move_file` / `delete_file` → text** (events resolver DEFERRED — trigger/upstream-fed).
- **`google-drive:folders` → REUSE (already shipped).**
- **`google-drive:files` → DEFER (v1):** large/ambiguous; fileId upstream-fed.
- **`google-drive:items` → REJECT (v1):** no runtime consumer; folders/files split is cleaner.
- **`google-drive:shared_drives` → REJECT (v1):** no runtime consumer; runtime expansion, not metadata.
- **`upload_file.content` → textarea**, FileRef DEFERRED (mirror OneDrive: `producesFileRef:false` / `consumesFileRef:false` for all 5). Future `GDRIVE-FILEREF` slice can flip uploads/downloads.
- **`delete_file` → high / isDestructive / requiresConfirmation** regardless of `permanent` mode (safety-first; mirrors OneDrive `delete_item`). Even trash mode auto-purges after ~30 days.
- **`list_files.files` → sensitive** (bulk metadata may carry owner emails by Drive's default field set).
- **`mimeType` / `pageToken` / time fields → text; `pageSize` → number; `permanent`/`includeTrashed`/`contentEncoding` defaults wired.** No FieldType mismatch.
- **REJECT (runtime, already decided — not re-litigated):** V1 multi-source upload, full Drive `q` passthrough, Shared Drives `supportsAllDrives`, share/permissions action (the `permissionsCreate` API helper exists for a future GDRIVE-SHARE arc — not v1), export to format action (`filesExport` helper exists for a future GDRIVE-EXPORT arc — not v1).

---

## 7. Implementation slices

**Recommended: a 2-slice arc (audit + ONE implementation slice).** Google Drive is the **second** pending provider that needs no resolver slice (after GCal) — the folders resolver is already shipped, and the deferred files resolver is upstream-fed. Same 2-slice compression as GCAL-META.

| Slice | Scope | Files (implementation slice — NOT this slice) |
|---|---|---|
| **GDRIVE-META-1** (this) | Audit + plan (doc-only) | this doc |
| **GDRIVE-META-2** | 5 ActionMeta + 1 TriggerMeta + discovery sub-registry + COVERED flip + tests | new `integrations/google-drive/actions/*.meta.ts` (5); new `integrations/google-drive/triggers/fileChanged/fileChanged.meta.ts` (1); new `services/discovery/providers/google-drive.ts`; wire into `services/discovery/_registry.ts`; add `"google-drive"` to `COVERED_PROVIDERS` (`tests/structure/discovery-meta-coverage.test.ts`); update [`providers-route.test.ts`](../../../../tests/unit/app/api/providers/providers-route.test.ts) (move the "still-pending" example off `google-drive` → `microsoft-outlook-calendar`); tests (§8). **No schema files, no new resolver files, no billing files touched.** |
| **GDRIVE-FILES-RESOLVER** (OPTIONAL, future) | `files` picker — only if product wants one | new `integrations/google-drive/options/files.ts` resolver + register + flip `fileId` fields to `combobox`. Out of launch-critical path. |
| **GDRIVE-FILEREF** (OPTIONAL, future) | FileRef on upload/download/get | runtime + meta promotion. Out of v1 metadata scope. |
| **GDRIVE-SHARE / GDRIVE-EXPORT** (OPTIONAL, future) | Wire the existing `permissionsCreate` / `filesExport` helpers into real action handlers. | Runtime additions; metadata follows. Out of v1. |

**Why one implementation slice (not the sibling resolver-first 3):** the only resolver needed (`google-drive:folders`) is already shipped + tested + cross-product (Google Docs already uses it). There are no new resolvers, no UI-scope schema additions (every picker parent is already real), and no runtime touch. GDRIVE-META-2 is therefore a self-contained metadata-only slice: 5 ActionMeta + 1 TriggerMeta + sub-registry + COVERED flip. Matches the GCAL-META-2 cadence.

---

## 8. Tests required

- **ActionMeta shape (GDRIVE-META-2):** 5 metas parse; `key==="google-drive:<type>"`; `category:"files"`; outputs mirror handler returns (verbatim key set per §1.1); `parentFolderId`/`folderId`/`newParentFolderId` combobox + `optionsSource:"google-drive:folders"` (no dep); `fileId` text + no `optionsSource`; `pageSize` number(1–1000); `permanent` boolean **required** (Q11); `contentEncoding` static select(utf8/base64) default utf8; `delete_file` `riskLevel:"high"` + `isDestructive:true` + `requiresConfirmation:true`; `upload_file`/`create_folder`/`move_file` medium; `list_files` low; `list_files.files` sensitive; all `producesFileRef`/`consumesFileRef:false`.
- **TriggerMeta shape (GDRIVE-META-2):** 1 meta parses; `activation:"webhook"`; `category:"files"`; two fields — `fileId` (combobox→folders, optional, default `"root"`) + `folderId` (combobox→folders, optional); payloadShape = the 10 fields; no payload field marked sensitive (with explicit-comment rationale per the precedent).
- **Discovery + provider route:** `listActionMetasForProvider("google-drive")`→5, `listTriggerMetasForProvider("google-drive")`→1, `listProvidersWithMetadata()` includes it; `/api/providers`→`hasMetadata:true`; `/api/providers/google-drive/actions`→5; `/triggers`→1 (new `google-drive-provider-route.test.ts` + `google-drive-discovery.test.ts` + `google-drive-triggers-discovery.test.ts`).
- **Update existing test:** `providers-route.test.ts` (after GCAL-META-2 it cites `google-drive` as the "still-pending" example) — move pending example off `google-drive` (→ `microsoft-outlook-calendar`), add a positive "Google Drive hasMetadata=true" assertion.
- **Existing resolver test stays unchanged:** [`tests/unit/integrations/google-drive/options/folders.test.ts`](../../../../tests/unit/integrations/google-drive/options/folders.test.ts) — no changes needed; the resolver is reused untouched.
- **Structural invariants:** `discovery-meta-coverage` passes with `google-drive` in `COVERED_PROVIDERS` (1:1 handler↔meta, all 5); `trigger-meta-activation-invariant` passes (no exemption — already wired); `sensitive-output-coverage` passes (no nested `email` exposed; `files` marked sensitive; no `downloadUrl` regression).
- **Guards:** no secret-shaped output names (`nextPageToken` ≠ exact `token` — safe); no provider API calls in metadata tests; `google-drive:files`/`:items`/`:shared_drives` never referenced by any shipped field.
- **No new resolver tests** — no resolvers ship in this arc (would appear only in the optional `GDRIVE-FILES-RESOLVER` follow-up).

---

## 9. Acceptance criteria

Google Drive is metadata/builder-complete only when:

- [ ] all 5 runtime actions have `ActionMeta` (1:1 with the handler registry; `delete_file` = high/destructive/confirm);
- [ ] the `file_changed` webhook trigger has `TriggerMeta` (fileId watch-target + folderId filter, both → folders resolver) with a passing activation invariant;
- [ ] required options resolvers exist OR are explicitly deferred with rationale — here `folders` is REUSED (already shipped); `files` deferred (upstream-fed); `items`/`shared_drives` rejected (no consumer); FileRef deferred (mirror OneDrive); permissions/export deferred (no runtime action consumer);
- [ ] `/api/providers` reports Drive `hasMetadata:true` (no longer "coming soon"); actions render with working folder pickers;
- [ ] `google-drive` is in `COVERED_PROVIDERS`; the `providers-route.test.ts` pending example is moved off it;
- [ ] `discovery-meta-coverage` + `trigger-meta-activation-invariant` + `sensitive-output-coverage` pass;
- [ ] targeted Drive tests (§8) pass;
- [ ] **no Drive runtime handler behavior changed** (metadata-only — no schema additions, no new resolver, no billing);
- [ ] the `files`-resolver decision (§4) and the `name`-sensitive decision (§5) are signed off.

On completion, update [`provider-metadata-launch-gap-tracker.md`](../provider-metadata-launch-gap-tracker.md) (Drive → covered; **25/26 covered, 1 pending**).

---

## Appendix — risks / blockers summary

1. **`delete_file` destructive in BOTH modes — high/destructive/confirm regardless of `permanent`** (Marcus decision implicit in OneDrive precedent). Trash mode is recoverable from the Drive UI but auto-purges after ~30 days; permanent mode is irreversible. Safety-first single-tier risk + clear riskDescription.
2. **Trigger has two folder-shaped fields** — `fileId` (WATCH TARGET, default `"root"`) + `folderId` (POST-FETCH FILTER). Both runtime-real, both meaningful, both expose distinct UX. Help text must make the distinction clear; we don't rename either (runtime owns the names).
3. **`files` resolver deferred** — fileId on move/delete is trigger/upstream-fed; full file lists are large/ambiguous. Typeable for v1.
4. **`items` / `shared_drives` rejected** — no runtime consumers; rejecting is honest, not a gap.
5. **FileRef deferred (mirror OneDrive)** — `upload_file.content` is a textarea string (utf8/base64); `producesFileRef:false` / `consumesFileRef:false` on all 5. Future GDRIVE-FILEREF slice.
6. **`permissionsCreate` + `filesExport` API helpers exist with tests but NO action wires them** — future GDRIVE-SHARE / GDRIVE-EXPORT runtime arcs; out of v1 metadata scope. The unused helpers are correctly not referenced by any meta.
7. **`list_files.files` sensitive (plan-marked)** — bulk array may carry owner emails by Drive's default field set; mirror Notion `results` / Gmail `messages` / GCal `events` precedent. Other outputs are structural.
8. **No `downloadUrl` exposed** (unlike OneDrive's `@microsoft.graph.downloadUrl`) — Drive's `webViewLink` is auth-gated, not pre-signed. If a future action surfaces a signed `downloadUrl`, it MUST be marked sensitive (the name is in the suspicious set).
9. **Trigger payload `name` not marked sensitive** (lean — title-like, mirror Teams `subject` / GCal `summary`). Flag for Marcus sign-off if product wants file names redacted in run-details.
10. **No scope blocker** (contrast Calendar) — manifest already grants `drive` (full) which covers every resolver and every action we'd plausibly add. No reconnect prompt looming.
11. **Branch/worktree caution.** Authored on the shared `ai-12c-planner-json-only-hardening` branch with interleaved AI + provider commits; explicit-path staging only; verify branch topology before any push/PR.

---

## 9. GDRIVE-META-2 outcomes (shipped 2026-05-25)

**Scope delivered:** 5 ActionMeta + 1 TriggerMeta + discovery sub-registry + `COVERED_PROVIDERS` flip + tests. **Google Drive is now builder-visible — `/api/providers` reports `hasMetadata:true`.** Covered providers **24/26 → 25/26**; pending **2 → 1** (only `microsoft-outlook-calendar` remains). **No runtime/schema files touched** (parentFolderId/folderId/newParentFolderId/fileId are already real fields — pure additive metadata). **No new resolvers, no scope change, no reconnect, no billing change, no FileRef runtime.** Single implementation slice (no resolver slice), as planned in §7 — same 2-slice compression as GCAL-META.

### 9.1 ActionMeta (5, displayOrder 10..50) — `integrations/google-drive/actions/<action>.meta.ts`

`upload_file` (10), `create_folder` (20), `list_files` (30), `move_file` (40), `delete_file` (50). All `category:"files"`, `requiresIntegration:true`, all `producesFileRef:false`/`consumesFileRef:false` (FileRef deferred — mirror OneDrive).

- **Risk:** `upload_file` / `create_folder` / `move_file` **medium**; `list_files` **low**; **`delete_file` high + `isDestructive:true` + `requiresConfirmation:true`** in BOTH `permanent` modes (irreversible perm OR auto-purged-after-~30-days trash — Marcus decision; mirrors OneDrive/Airtable/GCal deletes). `riskDescription` explicitly covers both modes.
- **Q11 required wired:** `delete_file.permanent` is a required boolean (no default — author makes the choice).
- **Field types:** `parentFolderId`/`folderId`/`newParentFolderId` → combobox + `optionsSource:"google-drive:folders"`; `fileId` → text; `content` → textarea; `contentEncoding` → static select(utf8/base64, default utf8); `pageSize` → number(1–1000, default 100); `permanent`/`includeTrashed` → boolean.

### 9.2 Resolver wiring (REUSE the already-shipped `google-drive:folders` — no new code)

All 5 folder-shaped picker fields wire to the existing resolver:
- `upload_file.parentFolderId`, `create_folder.parentFolderId` (no dep, optional)
- `list_files.folderId` (no dep, optional)
- `move_file.newParentFolderId` (no dep, REQUIRED)
- Trigger `fileId` (watch target, default `"root"`) + trigger `folderId` (post-fetch filter)

`fileId` on `move_file`/`delete_file` → typeable text (no `google-drive:files` resolver referenced). No field references `google-drive:files` / `:items` / `:shared_drives` (asserted by tests). **NO UI-scope schema additions** — every picker parent is already a real field. The existing resolver test ([`tests/unit/integrations/google-drive/options/folders.test.ts`](../../../../tests/unit/integrations/google-drive/options/folders.test.ts)) stays untouched.

### 9.3 TriggerMeta (1 webhook) — `triggers/fileChanged/fileChanged.meta.ts`

`file_changed`: `activation:"webhook"`, `requiresIntegration:true`, `category:"files"`. **Two folder-shaped config fields with distinct help text** (runtime owns the names — both runtime-real, both meaningful):
- `fileId` (combobox → `google-drive:folders`, optional, `defaultValue:"root"`) — the WATCH TARGET. Drive subscribes to changes on this folder. Default `"root"` = entire Drive.
- `folderId` (combobox → `google-drive:folders`, optional) — POST-FETCH FILTER. Only emit changes whose file is a direct child of this folder. Independent of `fileId`.

Payload = the 10 normalized fields. **No payload field is marked sensitive in v1** (Marcus decision — file `name` is title-like, mirror Teams `subject` / GCal `summary`). Test asserts the all-non-sensitive invariant explicitly. Activation already registered at `integrations/_registry.ts` → `trigger-meta-activation-invariant` passes with no exemption.

### 9.4 Discovery + COVERED

New `services/discovery/providers/google-drive.ts` (`GOOGLE_DRIVE_ACTION_METAS` ×5 + `GOOGLE_DRIVE_TRIGGER_METAS` ×1), spread into `services/discovery/_registry.ts`. `google-drive` added to `COVERED_PROVIDERS`. `providers-route.test.ts` "still-pending" example moved `google-drive` → `microsoft-outlook-calendar` (+ added a positive Google Drive `hasMetadata:true` assertion alongside the Google Calendar one).

### 9.5 Sensitive-output handling

**Deliberate plan-marks (Marcus-aligned, not blanket):**
- `list_files.files` sensitive — bulk Drive metadata may carry owner emails (mirrors Notion `results` / Gmail `messages` / GCal `events` precedent).
- Nothing else marked. `fileId` / `folderId` / `name` / `mimeType` / `parents` / `webViewLink` (auth-gated deeplink, not signed) / `size` / `createdTime` / `modifiedTime` / `nextPageToken` / `incompleteSearch` / `previousParents` / `mode` / `alreadyDeleted` / `trashed` are structural.
- **No `downloadUrl` exposed** (unlike OneDrive's Graph signed URL). Test asserts `downloadUrl` is in the banned-name set across both action outputs and trigger payload (regression guard if a future slice adds it without `sensitive:true`).
- Trigger `name` deliberately NOT marked (title-like; sign-off documented).

### 9.6 Tests

`google-drive-discovery.test.ts` (action surface), `google-drive-triggers-discovery.test.ts` (trigger surface — includes the "fileId vs folderId have distinct descriptions" + "no payload sensitive in v1" assertions), `google-drive-provider-route.test.ts` (route `hasMetadata`/actions/triggers wire shape, FileRef-deferred, sensitive `files`, destructive delete). Structure invariants pass: `discovery-meta-coverage` (google-drive in COVERED, 1:1 handler↔meta), `trigger-meta-activation-invariant` (no exemption), `sensitive-output-coverage`. `providers-route.test.ts` updated. **Targeted+broad regression: 1549/1549 across 68 suites** (drive/discovery/providers/contracts/structure). Existing `google-drive:folders` resolver test stays untouched + passing.

### 9.7 Acceptance criteria (§9) — met

All 5 actions have ActionMeta; `file_changed` has TriggerMeta (fileId + folderId, both → folders) + passing activation invariant; the existing `folders` resolver is REUSED (no new code); `files`/`items`/`shared_drives` deferred-or-rejected (none referenced); FileRef deferred (mirror OneDrive); `/api/providers` Drive `hasMetadata:true`; `google-drive` in `COVERED_PROVIDERS`; providers-route pending example moved to `microsoft-outlook-calendar`; structure invariants pass; targeted tests pass; **no runtime handler behavior changed** (no schema/resolver/billing/FileRef touch); `delete_file`-destructive-in-both-modes + `name`-not-sensitive + `files`-sensitive decisions all signed off by Marcus.

### 9.8 Follow-ups

- **`_registry.ts` is at 456 lines** (max-lines warning, pre-existing — was 450 after GCAL-META-2, 444 before that). Every provider addition bumps it by ~6 lines via the import+spread; the metas themselves live in the sub-registry. A future refactor could group the sub-registry imports/spreads into an array-of-arrays to drop back under 400.
- **`GDRIVE-FILES-RESOLVER`** (optional, product-gated) — `google-drive:files` picker if real workflow authors ask for one. Reuses `filesList` w/o folder-mimeType filter; potentially multi-parent `dependsOn:["folderId"]`.
- **`GDRIVE-FILEREF`** (optional, future) — promote `upload_file` to consume FileRef and add a `download_file` / `get_file` action that produces FileRef. Runtime + meta both update.
- **`GDRIVE-SHARE` / `GDRIVE-EXPORT`** (optional, future) — wire the existing `permissionsCreate` / `filesExport` API helpers (tested but unused today) into real action handlers.
- **One pending provider remains** — `microsoft-outlook-calendar` (the Graph mirror of GCal). After OUTLOOK-CAL-META the launch-gap tracker closes (26/26 covered).
