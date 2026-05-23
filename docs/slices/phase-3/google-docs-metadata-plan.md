# Google Docs — Audit + V2-Native Port Plan — Slice 3.GDOCS-1

**Status:** Audit + planning slice. Doc-only. **No metadata, no resolvers, no runtime, no manifest, no triggers, no COVERED_PROVIDERS flip ship in this commit.**
**Branch:** `v2-provider-port-local` (local-only; do not push).
**Predecessor:** Discord arc closed at commit `04926c81a` (`docs/slices/phase-3/discord-trigger-architecture-plan.md` is the structural template for this audit).
**Companion docs:** [`./missing-providers-status.md`](./missing-providers-status.md), [`./builder-metadata-coverage-checkpoint.md`](./builder-metadata-coverage-checkpoint.md).

Every claim below was verified against live files. V1 references resolve to `c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/**`. V2 paths are relative to this repo.

---

## 1. Headline finding — V2 has NO Google Docs runtime; this is a green-field port

A directory listing of `integrations/` confirms:

```
integrations/airtable/      integrations/discord/      integrations/github/
integrations/gmail/         integrations/google-calendar/
integrations/google-drive/  integrations/google-sheets/
integrations/hubspot/       integrations/mailchimp/    integrations/microsoft-excel/
integrations/microsoft-onedrive/  integrations/microsoft-outlook/
integrations/microsoft-outlook-calendar/  integrations/microsoft-teams/
integrations/native/        integrations/notion/       integrations/shopify/
integrations/slack/         integrations/stripe/       integrations/trello/
```

**No `integrations/google-docs/` exists.** A repo-wide grep for `google-docs` / `googleDocs` / `google_docs` / `"docs"` in `integrations/`, `services/`, `contracts/`, `core/`, `app/` returns ZERO hits. No manifest in `integrations/_registry.ts`, no entry in `services/options/_registry.ts`, no handler in `services/execution/handlers/_registry.ts`, no provider sub-registry under `services/discovery/providers/`, no webhook route, no tests.

This puts Google Docs in the same green-field starting position Discord was at after `DISCORD-1`. The arc therefore looks like Discord's: audit → runtime port (actions only) → options resolvers (only those needed for the action surface) → action metas + COVERED flip → trigger arc (separate, gated on the architecture decision).

**Reuse opportunities (more than Discord had).** Google Docs sits on top of Google Drive + Google Docs APIs. V2 already has:
- [`integrations/_shared/google/oauth.ts`](../../../integrations/_shared/google/oauth.ts) — token refresh helper (same shape every Google product uses).
- [`integrations/_shared/google/channelToken.ts`](../../../integrations/_shared/google/channelToken.ts) — HMAC channel-token helper for Drive `files.watch`.
- [`integrations/google-drive/api/filesWatch.ts`](../../../integrations/google-drive/api/filesWatch.ts), [`changesGetStartPageToken.ts`](../../../integrations/google-drive/api/changesGetStartPageToken.ts) — the Drive watch primitives already powering google-sheets `new_worksheet` + `row_changed` + google-drive `file_changed`.
- [`integrations/google-sheets/options/spreadsheets.ts`](../../../integrations/google-sheets/options/spreadsheets.ts) — the canonical "Drive files.list filtered by mimeType → options" resolver. Templates straight-line into `google-docs:documents`.
- [`integrations/google-sheets/triggers/newWorksheet/`](../../../integrations/google-sheets/triggers/newWorksheet/) — Drive `files.watch` + meta + activation/deactivation/renew/normalize/pull split. The full template for any Google Docs trigger.
- The `refreshAndRetry` wrapper at [`services/oauth/refreshAndRetry.ts`](../../../services/oauth/refreshAndRetry.ts) — already used by every Google product action handler.

This is meaningfully more leverage than Discord had. Discord required a from-scratch `_shared/discord/` API layer; Google Docs reuses ~80% of Drive's existing shared infrastructure.

---

## 2. V1 surface — actions, triggers, resolvers, scopes, field types

### 2.1 V1 manifest counts

Per [V1 `lib/workflows/nodes/providers/google-docs/index.ts`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/google-docs/index.ts) (884 lines, one file):

| Surface | Count | V1 keys |
| --- | --- | --- |
| **Actions** | **5** | `google_docs_action_create_document`, `google_docs_action_update_document`, `google_docs_action_share_document`, `google_docs_action_get_document`, `google_docs_action_export_document` |
| **Triggers** | **2** | `google_docs_trigger_new_document`, `google_docs_trigger_document_updated` |

### 2.2 V1 action handler file is monolithic but extraction has begun

[V1 `lib/workflows/actions/googleDocs.ts`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/googleDocs.ts) is **1042 lines** with **5 exported handler functions**:

- `createGoogleDocument` (line 33)
- `updateGoogleDocument` (line 334) — supports insert at end/beginning/replace/after_text/before_text with wildcard search
- `shareGoogleDocument` (line 581) — has Q11 `requireExplicitField('sendNotification')` already applied
- `getGoogleDocument` (line 763)
- `exportGoogleDocument` (line 825) — multi-destination (drive / email / webhook / workflow base64)

V1's own refactor has started: `lib/workflows/actions/googleDocs/createDocument.ts` exists as a partial extraction (`createGoogleDocument` body has been moved to its own file already). The other four handlers remain in the monolith. V2's "one file per action" rule renders this irrelevant — V2 starts clean per-handler regardless.

### 2.3 V1 dynamic resolvers

[V1 `app/api/integrations/google/data/handlers/index.ts`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/integrations/google/data/handlers/index.ts):

| V1 dynamic key | V1 handler | Used by V1 action/trigger | V2 reuse / new resolver |
| --- | --- | --- | --- |
| `google-docs-documents` | `drive.ts:getGoogleDocsDocuments` | update / share / get / export actions + document_updated trigger | **NEW `google-docs:documents`** — Drive `files.list?q=mimeType='application/vnd.google-apps.document'`. Template: [`google-sheets/options/spreadsheets.ts`](../../../integrations/google-sheets/options/spreadsheets.ts). Account-scoped; no `requiredDeps`. |
| `google-docs-content` | `drive.ts:getGoogleDocsContent` | update action preview field (`google_docs_preview` type) | **DEFER** — preview field is a builder UX polish, not a runtime requirement. V2 ships without and a follow-up adds it. |
| `google-drive-folders` | (existing google-drive handler) | create/export actions + both triggers | **NEW `google-drive:folders`** — V2 doesn't have a google-drive options resolver yet. Need to add this one regardless (would also benefit a future google-drive metas slice). Account-scoped. |
| `google-contacts` | `contacts.ts:getGoogleContacts` | share action + create action email autocomplete + export-email-to | **DEFER + REPLACE** — V2 has no contacts resolver yet, and V1's "email autocomplete" field type isn't in the V2 `FieldType` enum (`text` / `textarea` / `select` / `combobox` / `keyvalue` / `number` / `boolean` / `file` / `cron` / `router-routes` / `string-array` / `file-array`). V2 ships email fields as `string-array` (matching Gmail's `to`/`cc`/`bcc` pattern); the contacts resolver lands in a separate cross-product slice. |

**Three resolvers in scope for the action arc:** `google-docs:documents` (new), `google-drive:folders` (new, cross-product reuse), and continue without contacts autocomplete (`string-array` for email fields).

### 2.4 V1 OAuth scopes

| Action | V1 scopes |
| --- | --- |
| `create_document` | `documents`, `drive` |
| `update_document` | `documents`, `drive` |
| `share_document` | `drive` (Drive permissions API owns sharing) |
| `get_document` | `documents.readonly` |
| `export_document` | `documents.readonly`, `drive` |
| `new_document` trigger | `documents`, `drive` |
| `document_updated` trigger | `documents`, `drive` |

**Consolidated V2 scope set:**
- `https://www.googleapis.com/auth/documents` — read+write Google Docs.
- `https://www.googleapis.com/auth/drive` — Drive watch + folder placement + permission management + export.
- `https://www.googleapis.com/auth/userinfo.email` — OIDC identification for the integration row (mirrors gmail / calendar / drive / sheets).

V2 won't ship a read-only-scope variant — every Google product manifest ships one scope set today, and the action surface needs `documents` (write) + `drive` (watch). Same Q11 product call Drive made.

### 2.5 V1 specialized field types

V1 uses three FieldTypes that don't exist in V2's `FieldType` enum:

| V1 type | V1 usage | V2 fallback |
| --- | --- | --- |
| `email-autocomplete` | share / create-share-with / export-email-to | `string-array` (Gmail to/cc/bcc pattern). Documented limitation: no contacts autocomplete — workflow authors paste email addresses directly. |
| `file` | create-from-file-upload | V2 has `file` and `file-array`. Single-file `file` is in scope; `file-array` is not needed for Docs. |
| `google_docs_preview` | update action — read-only document preview | **DEFER** — UX polish, not a runtime requirement. The field shows the first 2 paragraphs of the picked document so the author can verify they picked the right one. Skipping it means slightly worse builder UX, not a broken trigger. |
| `date` | create-share-expirationDate | V2 has no `date` FieldType. Map to `text` with `placeholder: "YYYY-MM-DD"` until a `date` FieldType lands as a cross-cutting builder polish slice (same Q11 stance as Discord's `keywordMatchType` / Sheets's range pickers). |

V1 also uses `visibilityCondition` + `showIf` + `tabGroup` on fields. V2's `FieldMeta` supports `dependsOn` but not arbitrary conditional visibility (same gap that Discord's `delete_message` ran into). The conditional fields will surface as always-visible until the FieldMeta conditional-visibility slice ships (tracked in `missing-providers-status.md` under "Discord production follow-ups" — same polish gap applies here).

### 2.6 V1 triggers are Drive-poll style — no gateway-class infrastructure

V1's two Google Docs triggers (`new_document_in_folder`, `document_updated`) are powered by a Drive-poll cron under [V1 `lib/services/`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/services/). Polling cadence is ~5 minutes per V1 CLAUDE.md polling-intervals (free/pro/business). There is NO websocket / gateway / persistent-connection infrastructure for V1 Google Docs triggers.

This means **the V1 trigger architecture for Google Docs is already polling-shape** — unlike Discord, there's no "V1 used a gateway, V2 must replace it" architecture decision. V2 can ship the same product behavior via either Drive `files.watch` (push, mirrors `google-sheets:row_changed` / `new_worksheet` / `google-drive:file_changed`) OR polling (mirrors Gmail `new_email`). Both are V2-native — the decision is purely about latency vs implementation cost. **§3.5 D-GD2 resolves this.**

---

## 3. V1 → V2 Decision Matrix

For every meaningful Google Docs behavior, the decision per the global standard (COPY / ADAPT / REPLACE / DEFER / REJECT):

### 3.1 Actions

| V1 Action | Decision | Rationale | Implementation consequence |
| --- | --- | --- | --- |
| `create_document` (manual content) | **ADAPT** | Right product behavior. V1 mixes create + share in one action — split into two (`create_document` + `share_document` already exists). | V2 `create_document` ships with `title` / `content` / `folderId` only. Share fields (`enableSharing`, `shareType`, `emails`, `permission`, `sendNotification`, `emailMessage`, `allowDownload`, `expirationDate`) move out — workflow authors who need create-then-share chain two actions. Cleaner contract, separates the destructive (`share_document` emails real people) action from the safe one. |
| `create_document` (file upload) | **DEFER** | Right product behavior but cross-cutting. V1 supports `.txt` / `.docx` / `.pdf` / `.html` / `.md` upload. V2's `file` FieldType single-file isn't blocked but the conversion path (Drive `files.create` + `convertedTo: google-docs`) adds a destination-format edge case. Skip in GDOCS-2 to keep the slice scoped; revisit when V2 has a clearer FileRef-as-action-input story (this is the Slack `upload_file` consumer pattern that Slice 3.25 introduced). | V2 `create_document` ships with manual content only (`contentSource` field DROPPED entirely; `content` is the only body source). File-upload variant lands as a follow-up `create_document_from_file` action OR by extending the existing one once FileRef-as-input is clean. |
| `update_document` | **ADAPT** | Right product behavior with five `insertLocation` modes (end / beginning / replace / after_text / before_text). Wildcard search (`*`) is non-trivial — V1 maps it to a regex `.*`. V2 ports the five modes verbatim. | V2 `update_document` ships with `documentId` / `insertLocation` (5-value enum) / `searchText` (conditional on after_text/before_text) / `content`. Wildcard semantics preserved. No `google_docs_preview` field. |
| `share_document` | **ADAPT** | Right product behavior. Q11 `sendNotification` already required-explicit in V1 (no silent default). V2 mirrors. `transferOwnership` is destructive + irreversible — needs destructive-trio classification. | V2 `share_document` keeps the V1 field set EXCEPT `shareWith` flips from `email-autocomplete` → `string-array` (paste emails). Adds `isDestructive: true` + `requiresConfirmation: true` + `riskLevel: "high"` **only when `transferOwnership: true` is set** — V2's meta layer doesn't conditionally classify, so the safer call is `riskLevel: "high"` with `isDestructive: true` UNCONDITIONALLY because the action mutates external permissions and `makePublic` is also destructive (makes the doc world-readable). |
| `get_document` | **COPY** | Pure read. Output shape is exactly right. | V2 `get_document` is a 1-field action: `documentId`. Output: `documentId / title / content / revisionId / documentUrl`. Risk: low; not destructive. Outputs `content` + `title` marked sensitive. |
| `export_document` (Drive destination) | **COPY** | Right product behavior, well-scoped. | V2 `export_document` ships with `destination: "drive"` baked in for v1. Fields: `documentId / exportFormat (7-value enum) / fileName? / driveFolder?`. Output: `fileId / fileUrl / fileName / fileSize / format / mimeType`. |
| `export_document` (email / webhook / workflow base64 destinations) | **REJECT — defer to workflow composition** | V1 fanned the export action across four destinations for UX convenience. V2's composability story makes this anti-pattern: email destination needs a Gmail integration anyway → chain `export_document` + `gmail:send_email` with attachment. Webhook destination is what V2's `native:http_request` action exists for. Workflow base64 is the default — `export_document` returns the file ref and downstream nodes consume it. | V2 `export_document` returns a `producesFileRef: true` output. The base64 / webhook / email destinations DROP from the schema. Trade: V2 author writes a 2-node workflow instead of 1-node for "export and email"; gains cleanly-typed action chains. |

**Net V2 action surface: 5 actions** (matches V1 count) but with the share/create split tightened and export destinations consolidated.

### 3.2 Triggers

| V1 Trigger | Decision | Rationale | Implementation consequence |
| --- | --- | --- | --- |
| `new_document_in_folder` | **REPLACE** with Drive `files.watch` | V1's polling approach works but Drive `files.watch` is the V2-native shape — same transport `google-sheets:new_worksheet` / `google-drive:file_changed` already use. Lower latency (push), same operator cost. | V2 `new_document` (rename — drop "in_folder" suffix since `folderId` is now optional config) registers a Drive watch on the configured folder (or `'root'` if unset) at activation; receive route dispatches when a `files.create` change event arrives for a Google-Docs-mimeType file in the watched scope. Activation hook seeds a Drive `startPageToken` baseline (CLAUDE.md first-poll-miss rule, push variant). |
| `document_updated` | **REPLACE** with Drive `files.watch` | Same architecture decision as `new_document`. V1 polled per-file or per-folder; V2 watches the same scope and dispatches on modify events. | V2 `document_updated` registers a Drive watch identical in shape to `new_document` but filters incoming change events for `modifiedTime` advancement (not just `createdTime` presence). Same activation/deactivation/renew/pull split as `google-sheets:row_changed`. |

**Net V2 trigger surface: 2 triggers** (matches V1) — both via Drive `files.watch` push, no polling fallback needed.

### 3.3 OAuth / scopes

| V1 scope | Decision | Rationale | Consequence |
| --- | --- | --- | --- |
| `documents` | **COPY** | Required for create / update — Docs API write access. | V2 manifest required scope. |
| `documents.readonly` | **REJECT — narrow then merge** | V1 separately scoped `get_document` / `export_document` to readonly. V2's single-scope-set-per-manifest convention means we ship `documents` (write) for the whole surface. Read-only mode is a future split if customers request narrower consent. | V2 manifest ships `documents` only. |
| `drive` | **COPY** | Required for Drive folder placement, sharing (permissions API), export (`files.export`), watch. | V2 manifest required scope. |
| `userinfo.email` | **ADD** (V2-native) | V2 convention — every Google product manifest carries this for OIDC identification at OAuth callback. V1 doesn't list it because V1 didn't have V2's manifest contract. | V2 manifest required scope. |

### 3.4 Options resolvers

| V1 dynamic | Decision | V2 resolver key | requiredDeps |
| --- | --- | --- | --- |
| `google-docs-documents` | **NEW V2-native** | `google-docs:documents` | (none) — account-scoped |
| `google-drive-folders` | **NEW V2-native (cross-product)** | `google-drive:folders` | (none) — account-scoped |
| `google-docs-content` (preview) | **DEFER** | — | — |
| `google-contacts` (email autocomplete) | **DEFER + REJECT for action arc** | — | Use `string-array` for email fields. |

The `google-drive:folders` resolver lives under `integrations/google-drive/options/` even though Google Docs is its first consumer. Reason: any future `google-drive:upload_file` / `google-drive:create_folder` action meta will need the same picker, and locating it under `google-docs/options/` would force cross-provider imports.

### 3.5 Trigger architecture (D-GD2 decision)

| Path | Latency | Implementation cost | Fit |
| --- | --- | --- | --- |
| **A. Drive `files.watch` push** | Real-time (Drive pushes immediately) | LOW — `_shared/google/channelToken.ts`, `google-drive/api/filesWatch.ts`, `changesGetStartPageToken.ts` already exist. Activation/deactivation/renew/normalize/pull pattern is the `google-sheets:newWorksheet` template (~6 files). | **Perfect fit.** Same transport every other V2 Google trigger uses. |
| **B. Drive REST polling** | 3-5 minutes | LOW — `pollingRegistry` template (Gmail `new_email`). | OK fit but inferior latency for the same cost. |
| **C. Drive Changes API polling** | 3-5 minutes | MEDIUM — needs pagetoken cursor advancement (Drive's analog of Gmail's historyId). | No advantage over A; cursor logic is more complex than watch. |

**Decision: Option A — Drive `files.watch` push for both triggers.** Lower latency, lower implementation cost (more reuse), matches every other V2 Google trigger's architecture. No polling fallback ships.

### 3.6 Field names / defaults

| V1 field | V2 decision | Why |
| --- | --- | --- |
| `documentId`, `title`, `content`, `folderId`, `permission`, `sendNotification`, `message`, `makePublic`, `publicPermission`, `allowDiscovery`, `transferOwnership`, `insertLocation`, `searchText`, `exportFormat`, `fileName` | **COPY VERBATIM** | V1's camelCase + naming is sensible; preservation matches Discord/Mailchimp no-normalization rule. |
| `shareWith` | **COPY VERBATIM** | V1 surface field name on `share_document`. |
| `emails` | **REJECT — rename to `shareWith` for parity** | V1 used `emails` on `create_document.enableSharing.emails` and `shareWith` on `share_document.shareWith`. V2 unifies. Note: this only matters if the create-share fields stay (they're dropping — see §3.1). Moot post-decision. |
| `contentSource` | **REJECT** | File-upload mode is deferred (§3.1 D-GD1.A); `contentSource` becomes meaningless when `manual` is the only mode. Drop the field entirely. |
| `uploadedFile` | **REJECT** | Same reason. |
| `enableSharing` / `shareType` / `permission` / `sendNotification` / `emailMessage` / `allowDownload` / `expirationDate` on `create_document` | **REJECT — move to `share_document`** | These belong on the share action. Splitting tightens the contract per §3.1 D-GD1.B. |
| `keywordMatchType` (Discord parallel) | **N/A** | Docs has no equivalent surface. |

### 3.7 Runtime handler structure

| V1 | Decision | V2 implementation |
| --- | --- | --- |
| 1042-line `googleDocs.ts` monolith + partial `googleDocs/createDocument.ts` extraction | **REPLACE — V2 standard per-handler split** | One file per action under `integrations/google-docs/actions/`: `createDocument.ts` / `updateDocument.ts` / `shareDocument.ts` / `getDocument.ts` / `exportDocument.ts` plus per-action `*.schema.ts` files. |
| V1 uses `google.docs(...)` + `google.drive(...)` from `googleapis` SDK | **REPLACE with V2 thin REST wrappers** | New per-resource wrappers under `integrations/_shared/google/api/docs/` (e.g. `documentsCreate.ts`, `documentsGet.ts`, `documentsBatchUpdate.ts`) following the same shape as `integrations/google-sheets/api/` and `integrations/google-drive/api/`. Avoids the `googleapis` SDK dependency on the per-action layer; matches V2's no-googleapis-SDK convention. |
| V1 wraps principal calls in `refreshAndRetry` (Q3) | **COPY** | V2 already has `services/oauth/refreshAndRetry.ts`; per-handler wraps same as Drive/Sheets. |

### 3.8 Output shapes

| V1 output field | V2 decision | Notes |
| --- | --- | --- |
| `documentId / documentUrl / title / createdAt / updatedAt / revisionId` | **COPY** | Right shape. |
| `content` (on `get_document`) | **COPY** + mark sensitive | Document body — PII risk obvious. |
| `folderId` (echoed) | **COPY** | Useful for downstream conditional branching. |
| `sharedWith` (array of emails) | **COPY** + mark sensitive | Emails are PII. |
| `permissionLevel` / `isPublic` / `permissionIds` | **COPY** | Structural. |
| `contentLength` (insert size on `update_document`) | **COPY** | Useful for verification. |
| `insertionLocation` (echo) | **COPY** | Useful for downstream. |
| `fileName / fileSize / format / mimeType` (export) | **COPY** | Structural. |
| `fileId / fileUrl` (export to Drive) | **COPY** | Drive ids — useful for chaining. |
| `data` (Base64 export to "workflow" destination) | **REJECT — replace with FileRef** | V2's FileRef pattern returns a typed file handle, not inline base64. The `export_document` output flips to `producesFileRef: true`. |
| `destination` (echo) | **REJECT** | Only Drive destination ships (§3.1 D-GD1.D); echoing a single-value enum is noise. |
| `sharedWith` on `create_document` | **REJECT** | Moves to `share_document` (§3.1). |

### 3.9 Metadata / risk / sensitive output

Per §4 + §5 below. Headline:
- `get_document` low risk; `content` + `title` sensitive.
- `create_document` medium risk; `content` (echoed) sensitive.
- `update_document` medium risk; `content` (echoed) sensitive.
- `share_document` **HIGH + isDestructive + requiresConfirmation** (`transferOwnership` + `makePublic` both irreversible at the destructive sense V2 uses); `sharedWith` sensitive.
- `export_document` low risk; output is a file handle.

### 3.10 External constraints

| Constraint | Impact | Decision |
| --- | --- | --- |
| Drive `files.watch` channels expire (1 week default, 7-day max) | Triggers need renewal | **COPY existing infra** — `services/triggers/runRenewals.ts` already handles `subscription-watch` rows for google-sheets / google-drive. Activate hook tags the row with `type: "subscription-watch"`. |
| Google's OAuth verification requirement for `drive` scope (sensitive scope post-Oct-2020) | Production launch needs Google's app-review for sensitive-scope use | **NOT a slice-level concern** — same constraint already applies to Gmail / Drive / Sheets in V2. Tracked at the deployment level. |
| Drive `files.list` 100-item page cap | Large-account pickers truncate | **COPY existing pattern** — `google-sheets:spreadsheets` resolver fetches one 200-item page (Drive's max for `files.list`) and surfaces `hasMore` when capped. Same pattern for `google-docs:documents`. |
| Drive watch fires for EVERY change in the watched scope, then we filter client-side | High-traffic root watches may generate noise | **DOCUMENT** — same trade as `google-drive:file_changed`. Description in the trigger meta surfaces the recommendation to scope the watch to a specific folder when high-traffic accounts. |
| Docs API `documents.batchUpdate` supports text replacement; wildcard `*` is regex `.*` in V1 | Update action's `after_text` / `before_text` modes need a wildcard primitive | **COPY** — V2 port preserves V1's wildcard semantic verbatim. |
| Update action's "replace all content" mode (`insertLocation: "replace"`) is destructive | Inflight document content gets wiped | Borderline destructive. Documented in description; classified as **medium risk** (not high, not destructive trio) — recoverable via Google Docs' own version history. **D-GD-OPEN-2** below surfaces this for product confirmation. |

---

## 4. Proposed V2 surface (recommended scope for GDOCS-2..4)

Pure **V1 manifest port with action splits + destination consolidation** per the decision matrix.

### 4.1 Actions (5)

| Action | Required fields | Optional fields | Output | Resolver needs |
| --- | --- | --- | --- | --- |
| `google-docs:create_document` | `title`, `content` | `folderId` (combobox → `google-drive:folders`) | `documentId / documentUrl / title / folderId / createdAt` | `google-drive:folders` |
| `google-docs:update_document` | `documentId`, `insertLocation` (5-value enum), `content` | `searchText` (conditional on after_text / before_text) | `documentId / documentUrl / title / updatedAt / revisionId / contentLength / insertionLocation` | `google-docs:documents` |
| `google-docs:share_document` | `documentId`, `sendNotification` (Q11 — explicit) | `shareWith` (string-array), `permission` (4-value enum), `message`, `makePublic`, `publicPermission`, `allowDiscovery`, `transferOwnership` | `documentId / documentUrl / sharedWith / isPublic / permissionIds` | `google-docs:documents` |
| `google-docs:get_document` | `documentId` | (none) | `documentId / title / content / revisionId / documentUrl` | `google-docs:documents` |
| `google-docs:export_document` | `documentId`, `exportFormat` (7-value enum) | `fileName`, `driveFolder` (combobox → `google-drive:folders`) | `fileId / fileUrl / fileName / fileSize / format / mimeType` (producesFileRef: true) | `google-docs:documents`, `google-drive:folders` |

**Field-name preservation warnings** (no normalization, per the Discord/Mailchimp rule):
- All 5 actions keep `documentId` (camelCase) verbatim.
- `share_document.sendNotification` is Q11-required without a default value (V1 already enforces this; V2 ports same constraint).
- `update_document.insertLocation` keeps the 5-value enum verbatim: `"end" / "beginning" / "replace" / "after_text" / "before_text"`.
- `export_document.exportFormat` keeps the 7-value enum verbatim: `"pdf" / "docx" / "txt" / "html" / "rtf" / "epub" / "odt"`.
- `share_document.permission` keeps the 4-value V1 enum verbatim: `"reader" / "commenter" / "writer" / "owner"` (note: V1's `create_document` had `"viewer" / "commenter" / "editor"` — the V2 share action consolidates on the Drive permissions API canonical names: `reader/commenter/writer/owner`).

### 4.2 Triggers (2)

| Trigger | Activation | Required config | Optional config | Payload (echoes V1) |
| --- | --- | --- | --- | --- |
| `google-docs:new_document` | `webhook` (Drive `files.watch`) | (none — defaults to `'root'`) | `folderId` (combobox → `google-drive:folders`), `mimeType` (4-value enum — same V1 set) | `documentId / title / createdAt / createdBy / url / folderId` |
| `google-docs:document_updated` | `webhook` (Drive `files.watch`) | (none — defaults to `'root'`) | `folderId`, `mimeType`, `documentId` (specific-document filter) | `documentId / title / updatedAt / updatedBy / revisionId / changeType / url` |

Both triggers reuse [`integrations/_shared/google/channelToken.ts`](../../../integrations/_shared/google/channelToken.ts) + [`integrations/google-drive/api/filesWatch.ts`](../../../integrations/google-drive/api/filesWatch.ts) + the existing `services/triggers/runRenewals.ts` cron.

**Shared Drive-watch receive route — DECISION D-GD3.** Drive's push notifications post to a single global webhook URL per app. V2 already has `/api/webhooks/google-drive` (drives `google-drive:file_changed`) and `/api/webhooks/google-sheets` (drives `google-sheets:row_changed` + `new_worksheet`). Question: does Google Docs get `/api/webhooks/google-docs` or share `/api/webhooks/google-drive`?

- **Recommended: `/api/webhooks/google-docs`** — a separate route per Google product (parity with how Drive and Sheets already split). Activation embeds `?workflowId=&nodeId=` query params in the channel address, so the dispatcher does strict-direct-lookup. Sharing the Drive route would mean rewriting `google-drive:file_changed`'s dispatcher to fan out by mime type, which is a scope creep.

### 4.3 Required OptionsSource resolvers

Two new resolvers, sequenced before any action meta lands (resolver-first pattern):

| Resolver key | `requiredDeps` | Endpoint | Notes |
| --- | --- | --- | --- |
| `google-docs:documents` | (none) | Drive `GET /drive/v3/files?q=mimeType='application/vnd.google-apps.document' and trashed=false&pageSize=100&fields=files(id,name,modifiedTime,owners)&orderBy=modifiedTime desc` | Account-scoped picker for Google Docs files the connected user owns or has access to. Sorted modified-desc. |
| `google-drive:folders` | (none) | Drive `GET /drive/v3/files?q=mimeType='application/vnd.google-apps.folder' and trashed=false&pageSize=100&fields=files(id,name,parents,modifiedTime)` | Cross-product resolver — first consumer is Google Docs `create_document.folderId` + `export_document.driveFolder`. Future google-drive action metas will also consume. Lives at `integrations/google-drive/options/folders.ts`. |

Both resolvers use the existing `refreshAndRetry` wrapper + sanitize errors the same way `google-sheets:spreadsheets` does.

---

## 5. Risk classification proposal

V2's destructive-trio convention (`isDestructive` + `requiresConfirmation` + `riskLevel: "high"`) is reserved for actions that:
1. Are irreversible at the application layer (Discord's `delete_message`), OR
2. Affect external permission state visible to other users (HubSpot `remove_line_item`).

| Action | Risk | `isDestructive` | `requiresConfirmation` | Reason |
| --- | --- | --- | --- | --- |
| `google-docs:get_document` | **low** | false | false | Pure read. Output marks `content` + `title` sensitive. |
| `google-docs:create_document` | **medium** | false | false | Creates a new document — recoverable via Trash. `content` (echoed) marked sensitive (workflow-author-supplied PII via `{{variables}}`). |
| `google-docs:update_document` | **medium** | false | false | Modifies document content. Google Docs maintains version history, so even `insertLocation: "replace"` is recoverable. `content` (echoed) marked sensitive. **D-GD-OPEN-2** asks product whether to flip this to `high + destructive` when `replace` mode is the active path. |
| `google-docs:export_document` | **low** | false | false | Pure read + write to Drive. Recoverable via Drive Trash on the resulting file. Output is a file ref; no inline content surfaced. |
| `google-docs:share_document` | **HIGH** + `isDestructive: true` + `requiresConfirmation: true` | **true** | **true** | Modifies external permission state — visible to other Google users. `transferOwnership` is irreversible (the original owner loses ownership permanently). `makePublic` is reversible but high-blast-radius (anyone-with-link). Even base-case sharing emails real people. Classification unconditional — same rule HubSpot's `remove_line_item` uses. |

`update_document.insertLocation: "replace"` (V1 supports this) wipes the document body. Google Docs maintains version history so it's recoverable via the user's Docs UI, but workflow-driven mass-replace is the kind of mistake users only realize 30 minutes later. **D-GD-OPEN-2** below surfaces this.

### 5.1 Trigger risk (when triggers ship)

| Trigger | Risk |
| --- | --- |
| `google-docs:new_document` | **low** — pure observation. Payload carries `title` (sensitive), `createdBy` (sensitive). |
| `google-docs:document_updated` | **low** — same. Payload carries `title` (sensitive), `updatedBy` (sensitive). |

---

## 6. Sensitive output proposal

Per the suspicious-name structural guard at [`tests/structure/sensitive-output-coverage.test.ts`](../../../tests/structure/sensitive-output-coverage.test.ts), V2's heuristic flags `body` / `content` / `text` / `message` / `messages` / `users` / `email` / `to` / `from` etc. as suspicious-by-default. Google Docs outputs hit this set.

### 6.1 Action outputs

| Action | Sensitive (must be marked) | Non-sensitive |
| --- | --- | --- |
| `create_document` | `title` (workflow-author-supplied), `content` (echoed from input) | `documentId`, `documentUrl`, `folderId`, `createdAt` |
| `update_document` | `title`, `content` (echoed insert) | `documentId`, `documentUrl`, `updatedAt`, `revisionId`, `contentLength`, `insertionLocation` |
| `share_document` | `sharedWith` (array of emails — PII) | `documentId`, `documentUrl`, `isPublic`, `permissionIds` |
| `get_document` | `title`, `content` (full document body — strongest PII risk in the Google Docs surface), `documentUrl` (treat as moderately-sensitive — opens the document to anyone who can render the URL via the user's Google session) | `documentId`, `revisionId` |
| `export_document` | (none — file ref is opaque) | `fileId`, `fileUrl`, `fileName`, `fileSize`, `format`, `mimeType` |

Recommendation flag: `documentUrl` on `get_document` is borderline. The URL itself is a `docs.google.com/document/d/<id>/edit` link that doesn't grant access — access is gated by Google's session — so it's not a secret. Mark non-sensitive for now; raise back to product if a customer reports a sensitive workflow leaks via Drive-link rendering.

### 6.2 Trigger payloads

| Trigger | Sensitive | Non-sensitive |
| --- | --- | --- |
| `new_document` | `title`, `createdBy` (email of creator) | `documentId`, `createdAt`, `url`, `folderId` |
| `document_updated` | `title`, `updatedBy` (email of updater) | `documentId`, `updatedAt`, `revisionId`, `changeType`, `url` |

### 6.3 Defense-in-depth — no secret-shaped names

The OAuth access token / refresh token / Drive channel token / `channel-token` HMAC MUST NEVER appear as output fields. The secret-name regression guard enforces `clientSecret` / `client_secret` / `secret` / `token` / `apiKey` / `accessToken` / `refreshToken` / `webhookSecret` are absent from every meta — V2 port preserves that.

---

## 7. Slice sequence

The Google Docs arc looks like Discord's actions arc (no gateway equivalent to design around) — **4 slices**, ~25-30 files total:

| Slice | Scope | Estimated commits | Coverage gain |
| --- | --- | --- | --- |
| **GDOCS-1** (this slice) | Audit + plan doc only. | 1. | None — doc-only. |
| **GDOCS-2** (runtime port) | Port 5 V1 actions: per-handler files + schemas + shared API wrappers under `integrations/_shared/google/api/docs/` + `integrations/google-docs/manifest.ts` + OAuth wiring + handler registration. **NO triggers, NO metas, NO resolvers**. ~15-18 files. | ~6 commits if broken into sub-slices per action, or 1 squash. | +5 action handlers in the execution registry. Google Docs NOT in `COVERED_PROVIDERS` (no metas). |
| **GDOCS-3** (options resolvers) | Add `google-docs:documents` + `google-drive:folders` + tests. ~6 files. | 1 commit. | 2 resolvers; no provider-coverage flip. |
| **GDOCS-4** (action metas + COVERED flip) | 5 ActionMeta files + sub-registry at `services/discovery/providers/google-docs.ts` + provider-route tests + targeted integration tests. Flip Google Docs into `COVERED_PROVIDERS`. ~10 files. | 1 commit. | 5 actions covered; provider in COVERED. |
| **GDOCS-5** (triggers) | Per the §3.5 D-GD2 decision: ship both `new_document` + `document_updated` as Drive `files.watch` push triggers. New webhook route at `/api/webhooks/google-docs`. Reuses existing renewal cron. ~12-15 files (mirrors `google-sheets:newWorksheet` 6-file count × 2 triggers + 1 receive route). | 1 commit. | 2 trigger metas; manifest `webhookTrigger: true`. |

**After GDOCS-5:** Google Docs is complete to the V2 standard — 5 actions + 2 triggers + 2 resolvers, no deferrals, no architectural blockers. Cleaner finish state than Discord (no `member_join`-equivalent dead end on the Docs API surface).

**Recommendation for the FIRST implementation slice:** `GDOCS-2` (runtime port — actions only). Same sequencing rule as DISCORD-2 — without runtime handlers the meta files would describe code that doesn't exist; the structural coverage test forbids that.

---

## 8. V1 behavior — what to copy, what NOT to copy

### 8.1 Copy as-is

- **Field names** (`documentId`, `title`, `content`, `folderId`, `permission`, `sendNotification`, `message`, `makePublic`, `publicPermission`, `allowDiscovery`, `transferOwnership`, `insertLocation`, `searchText`, `exportFormat`, `fileName`). Preserve 1:1 per the no-normalization rule.
- **Enum values** verbatim — `insertLocation: "end" / "beginning" / "replace" / "after_text" / "before_text"` (5-value), `exportFormat: "pdf" / "docx" / "txt" / "html" / "rtf" / "epub" / "odt"` (7-value), `mimeType` on triggers (4-value).
- **Wildcard `*` semantic** on `searchText` (V1 maps to regex `.*`).
- **Q11 — `sendNotification` is required-explicit** on `share_document`. V1's `requireExplicitField` ports straight to V2's `requireExplicitField` from [`lib/workflows/actions/core/requireExplicitField.ts`](../../../../nstoddard17/chainreact-app-9e/lib/workflows/actions/core/requireExplicitField.ts) → V2's equivalent.
- **Output shapes** for the 5 actions (with the file-ref + sensitive-flag deltas above).
- **Drive `files.watch` mimeType filtering** for both triggers — filter incoming change events for Google-Docs mime-type matches client-side.

### 8.2 Do NOT copy

- **Monolithic action handler file.** V2 ports always split per-handler (one file per action).
- **`googleapis` npm SDK usage** in handlers. V2 uses thin REST wrappers under `integrations/_shared/google/api/docs/` (matches `google-drive` / `google-sheets` convention).
- **V1's `create_document` sharing fields** (`enableSharing`, `shareType`, `emails`, `permission`, `sendNotification`, `emailMessage`, `allowDownload`, `expirationDate`). They move to `share_document`. Workflow authors chain create → share.
- **V1's file-upload mode** on `create_document` (`contentSource: "file_upload"` + `uploadedFile`). Deferred to a follow-up — V2 v1 ships manual content only.
- **V1's `export_document` non-Drive destinations** (`email` / `webhook` / `workflow` base64). Replaced by workflow composition — V2 `export_document` returns a FileRef and downstream nodes (`gmail:send_email` with attachment, `native:http_request`, etc.) consume it.
- **V1's `google-contacts` autocomplete** on email fields. V2 ships `string-array` for email lists; contacts resolver lands in a separate cross-product slice if/when product confirms.
- **V1's `google_docs_preview` custom FieldType.** V2 has no equivalent; the picker description handles the same UX role. Polish slice may add it later.
- **V1's `date` FieldType** on `expirationDate`. V2 maps to `text` with `YYYY-MM-DD` placeholder; same Q11 stance as Discord's similar gaps.
- **V1's `visibilityCondition` / `showIf` conditional field visibility.** V2's `FieldMeta` doesn't yet support arbitrary conditional visibility (same gap that hit Discord's `delete_message` keywordMatchType). Conditional fields surface as always-visible with description copy explaining when they apply. Tracked as a cross-cutting builder polish slice.

---

## 9. Open product decisions before GDOCS-2 starts

### D-GD1 — file-upload mode on `create_document`

V1's `create_document` accepts `contentSource: "file_upload"` to upload a `.txt` / `.docx` / `.pdf` / `.html` / `.md` file and have Drive auto-convert it to a Google Doc. Two options:

1. **DEFER** to a follow-up slice. GDOCS-2 ships `create_document` with manual-content-only. Workflow authors who want create-from-file chain `google-drive:upload_file` (when it ships an action meta) + a future `convert_to_google_doc` action.
2. **SHIP** as part of GDOCS-2 with a `contentSource` field and the V1 multi-format conversion path.

**Recommendation: (1) DEFER.** The file-upload path adds material complexity (Drive `files.create` with `convertedTo` source-MIME → target-MIME), and V2's FileRef-as-input contract is still maturing (Slack `upload_file` is the most recent precedent). Ship the simpler create_document first; revisit when the FileRef-as-input pattern is clean across all V2 file-consuming actions.

### D-GD2 — Trigger architecture (recommended decided here, surfaced for confirmation)

§3.5 already locks this as Drive `files.watch` push for both triggers. Confirmed against:
- V2 already has the full Drive watch infrastructure (channel tokens, watch primitives, renewal cron).
- Both V1 triggers want exactly the same set of events Drive Changes provides.
- Lower latency than polling at same implementation cost.

**Recommendation: confirm Drive `files.watch` push for both triggers in GDOCS-5.** Track polling as a "if app verification denies sensitive Drive scope" emergency-fallback, not a default. Realistically this contingency never fires.

### D-GD3 — Webhook route — `/api/webhooks/google-docs` vs reuse `/api/webhooks/google-drive`

§4.2 recommendation is **separate route** (`/api/webhooks/google-docs`). Rationale:
- Parity with how `google-drive` and `google-sheets` each have their own routes.
- Activation embeds workflow/node query params in the channel address; the receive route does strict-direct-lookup against trigger_resources rows.
- Sharing the Drive route would force the Drive dispatcher to fan out by mime-type — scope creep into the Drive surface.

**Recommendation: confirm separate route.**

### D-GD4 — `update_document.insertLocation: "replace"` risk classification

§3.10 + §5 surface this. The `replace` mode wipes existing document content (Google Docs' version history makes it recoverable, but the workflow doesn't see that). Two options:

1. **Keep `update_document` at `riskLevel: "medium"`** uniformly across all 5 insertLocation modes. Description copy warns about `replace` mode.
2. **Split `update_document` into two actions** — `update_document` (insert modes only) + `replace_document_content` (the destructive mode with `isDestructive: true` + `requiresConfirmation: true`).

**Recommendation: (1).** Keep one action with strong description copy. Splitting buys clearer UX but doubles the action count and adds the "which action do I use?" cognitive load. Google Docs' version history is meaningful recovery insurance.

### D-GD5 — Contacts autocomplete (`google-contacts` resolver) — defer or ship in GDOCS-3?

V1 uses the People API (`google-contacts`) to autocomplete email addresses on every share/email field. Three options:

1. **DEFER** — V2 ships `string-array` for email fields; contacts autocomplete is a future cross-product slice.
2. **SHIP in GDOCS-3** alongside `google-docs:documents` + `google-drive:folders`.
3. **SHIP separately** as a `GOOGLE-CONTACTS-1` slice (own provider arc — People API is a separate Google product with its own OAuth scope `contacts.readonly`).

**Recommendation: (1) DEFER.** Adding the People API scope to the Docs manifest is awkward (Docs doesn't need contacts); cross-product slice is cleaner. `string-array` is acceptable UX for v1.

---

## 10. Out of scope for this slice

- Writing any Google Docs ActionMeta / TriggerMeta file.
- Writing any Google Docs OptionsSource resolver file.
- Writing any Google Docs runtime handler / schema / manifest.
- Writing any Google Docs OAuth flow / callback.
- Creating `integrations/google-docs/` directory at all (doc-only slice — no source-tree touches).
- Adding `google-docs` to `COVERED_PROVIDERS`.
- Touching any registry (`integrations/_registry.ts`, `services/options/_registry.ts`, `services/discovery/_registry.ts`, `services/execution/handlers/_registry.ts`).
- Resolving D-GD1, D-GD4, or D-GD5 (decisions, not code).
- Adding `/api/webhooks/google-docs` route.

---

## 11. Acceptance for this slice

Doc-only slice. Acceptance criteria:

- This file (`docs/slices/phase-3/google-docs-metadata-plan.md`) committed.
- No other source / test / config files modified.
- Gates green: `tsc --noEmit`, `npm run lint`, `npm run lint:structure`, `npm run lint:migrations`. No new jest assertions; structural tests untouched.
- Dirty parallel-work files (`app/page.tsx`, `docs/rules/database-security.md`, `features/workflows/WorkflowsList.tsx`, `PACKAGES.md`, `scripts/list-users.mjs`, `scripts/reset-user-password.mjs`) remain unstaged.

## 12. Recommended next slice

**GDOCS-2 — Google Docs Runtime Port (Actions Only).** Per §7 + §8. Ports the 5 V1-manifest-declared action handlers + Zod schemas + shared Docs API wrappers (`documentsCreate`, `documentsGet`, `documentsBatchUpdate`, `filesExport` etc. as needed) + manifest + OAuth wiring. Does NOT touch metas, resolvers, triggers, or the `COVERED_PROVIDERS` flip. Expected scope: ~15-18 files; ~6 commits if broken into sub-slices per action, or 1 squash commit.
