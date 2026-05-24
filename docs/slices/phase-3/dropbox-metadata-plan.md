# Dropbox — Audit + V2-Native Port Plan (DROPBOX-1)

**Status:** Doc-only audit. No source / runtime / resolver / metadata changes. No `COVERED_PROVIDERS` flip.
**Branch:** `v2-provider-port-local` (local-only). **Do not push.**
**V1 reference:** `c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e`.
**V2 baseline:** [`integrations/`](../../../integrations/), [`contracts/`](../../../contracts/), [`docs/slices/p-s3-file-output-contract-plan.md`](../p-s3-file-output-contract-plan.md).
**Queue position:** 5th in the provider-completion queue ([`missing-providers-status.md`](./missing-providers-status.md)) — Discord → Google Docs → OneNote → Monday → **Dropbox** → Facebook → Google Analytics.

---

## 1. Headline finding

**Current V2 Dropbox status: GREEN-FIELD.** There is no `integrations/dropbox/` directory, no Dropbox manifest in [`integrations/_registry.ts`](../../../integrations/_registry.ts) `ALL_MANIFESTS`, no handlers, schemas, resolvers, metas, tests, or migrations. The only V2 mentions of "dropbox" are doc references (this queue tracker, the P-S3 file-output plan listing Dropbox as a future FileRef consumer, and a security-audit doc). **Runtime must come before metadata** — DROPBOX-2 (runtime) precedes DROPBOX-4 (metas), same as every prior arc.

**V1 status: REAL but PARTIAL + carrying two rot points.** V1 Dropbox is genuinely functional — 3 working action handlers with real Dropbox GraphQL/REST calls and a fully-implemented webhook trigger handler (753 LoC). It is NOT a stub or scaffold. But:
- The single trigger (`dropbox_trigger_new_file`) is flagged `comingSoon: true` in the node manifest — backend complete, UI-hidden.
- **Webhook signature verification was never implemented** (V1's generic verifier has no Dropbox `X-Dropbox-Signature` arm; dev mode accepted unsigned webhooks).
- **Upload routes file bytes through V1's Supabase `workflow-files` bucket + base64**, and **download returns the entire file as base64 inline in the action output** — exactly the antipattern V2's P-S3 FileRef contract exists to prevent.

**Key product/architecture decision: SHIP Dropbox in V2, as a V2-native rewrite of the rotted bits — NOT a verbatim port.** The prior Phase-1 audit ([`phase-1-provider-completion-audit.md`](../phase-1-provider-completion-audit.md) §3) deferred Dropbox ("skip unless product changes") for exactly two reasons: (1) V1 incompleteness/comingSoon, and (2) the webhook-signature gap. It named the reopen conditions explicitly: *"Marcus decides Dropbox is product-critical AND a clean webhook-signature contract exists in V2 (it does — the GitHub HMAC pattern is reusable)."* **Both conditions are now met:** the product owner re-included Dropbox in the completion queue, and V2 now ships four reusable HMAC-hex verifiers (GitHub, Trello, Monday, plus the Microsoft validation-handshake pattern). The base64/Supabase rot is also already solved in V2 by the P-S3 FileRef contract (live, with Slack / Gmail / Airtable / Monday consumers + producers). So the historical blockers are all retired — Dropbox is now a clean V2-native port, not a rewrite-grade liability.

---

## 2. V1 surface

### 2.1 Action inventory (3)

Source: `lib/workflows/nodes/providers/dropbox/index.ts` (≈536 lines) + `lib/workflows/actions/dropbox/`.

| V1 node `type` | Title | comingSoon | Handler | Dropbox endpoints | Notes |
| --- | --- | --- | --- | --- | --- |
| `dropbox_action_upload_file` | Upload File | false | `actions/dropbox/uploadFile.ts` (277 LoC) | `content.dropboxapi.com/2/files/upload`; `api/2/files/get_metadata`; `api/2/files/create_folder_v2` | 4 source types (file / url / text / node-variable). Supabase `workflow-files` intermediary for `sourceType:file`. Inline `create_folder` if the parent is missing. ≤150 MB. |
| `dropbox_action_get_file` | Get File | false | `actions/dropbox/getFile.ts` (105 LoC) | `api/2/files/get_metadata`; `content/2/files/download`; `api/2/sharing/create_shared_link_with_settings` | Fetches metadata + optional content download; **base64-encodes the whole file into `output.content`**; optionally mints a shared link inline. |
| `dropbox_action_find_files` | Find Files | false | `actions/dropbox/findFiles.ts` (376 LoC) | `api/2/files/search_v2` (query) OR `api/2/files/list_folder` (no query); `content/2/files/download` (optional) | Conflates **list** (no query) and **search** (query) into one node. Optional bulk content download (≤20 files / ≤100 MB), each base64-encoded. |

**No `comingSoon` on the actions** — all 3 are user-visible and functional in V1.

### 2.2 Trigger inventory (1)

| V1 node `type` | Title | comingSoon | Handler | Model |
| --- | --- | --- | --- | --- |
| `dropbox_trigger_new_file` | New File | **true** | `lib/webhooks/dropboxTriggerHandler.ts` (753 LoC) | **App-level webhook + per-account cursor delta** |

**Critical architecture note:** Dropbox's webhook model is fundamentally unlike GitHub/Trello/Monday's per-resource `create_webhook`:
- The webhook URL is registered **once, in the Dropbox App Console** — there is **no per-folder / per-workflow webhook-creation API**. One URL serves the whole app.
- The POST notification body is only `{ list_folder: { accounts: ["dbid:..."] } }` — it says **which account changed, not which file or folder.**
- You reconcile by storing a **cursor** (`list_folder/get_latest_cursor` at setup, `list_folder/continue` on each notification) and diffing the delta, then filtering to the configured folder and to file-additions. Cursor resets on a 409.
- **Verification handshake:** GET `?challenge=<token>` → echo the token as `text/plain`.
- **Signature:** `X-Dropbox-Signature` = hex HMAC-SHA256 of the raw body, keyed with the **app secret** (`DROPBOX_CLIENT_SECRET`). **V1 never verified this** (generic verifier had no Dropbox arm; dev mode accepted unsigned).

### 2.3 Dynamic resolver inventory (2)

Source: `app/api/integrations/dropbox/data/handlers/`.

| V1 key (aliases) | Fetches | Deps | Endpoint |
| --- | --- | --- | --- |
| `dropbox-folders` (alias `folders`) | All folders | none | `api/2/files/list_folder` |
| `dropbox-files` | Files in a path | path | `api/2/files/list_folder` |

Client loader: `components/workflows/configuration/providers/dropbox/dropboxOptionsLoader.ts`.

### 2.4 OAuth / scopes

Source: `lib/integrations/oauthConfig.ts:211-226` + `lib/integrations/provider-registry.ts:892-936`.

- **Authorize:** `https://www.dropbox.com/oauth2/authorize` · **Token:** `https://api.dropboxapi.com/oauth2/token` · **Revoke:** `https://api.dropboxapi.com/2/auth/token/revoke`.
- **Refreshable:** yes — Dropbox issues refresh tokens only when the authorize URL carries `token_access_type=offline` (a Dropbox-specific param). `refreshTokenExpirationSupported: false` (refresh tokens are long-lived). `authMethod: "basic"`, `refreshRequiresClientAuth: true`, `sendRedirectUriWithRefresh: true`.
- **PKCE:** V1's two configs disagree — `oauthConfig.ts` omits PKCE; `provider-registry.ts` sets `requiresPkce: true`. Dropbox supports PKCE but does not require it for a confidential client with a secret.
- **Scopes (V1, 4):** `files.content.write files.content.read files.metadata.read account_info.read`.
- **Account identity:** `api/2/users/get_current_account` → `account_id` (`dbid:...`), `email`, `name`. (Load-bearing: the webhook routes on `account_id`.)
- **Env:** `DROPBOX_CLIENT_ID`, `DROPBOX_CLIENT_SECRET`.

### 2.5 File upload/download mechanism (the rot)

- **Upload:** binary body to `content/2/files/upload` with a `Dropbox-API-Arg` JSON header (`{path, mode, autorename, mute}`). For `sourceType:file`, bytes come from V1's Supabase `workflow-files` bucket; other source types decode base64 / fetch URL / encode text in-memory.
- **Download:** `content/2/files/download` → `output.content = Buffer.from(body).toString('base64')` — **the entire file inlined into the JSONB step output.** `find_files` does this for up to 20 files / 100 MB.

This is precisely the runs-table-bloat antipattern P-S3 §1 documents and bans.

### 2.6 API style

GraphQL-free REST split across two hosts: **`api.dropboxapi.com`** (metadata, list, search, sharing, account) and **`content.dropboxapi.com`** (upload/download bytes). RPC-style POSTs; args either in the JSON body or the `Dropbox-API-Arg` header (content endpoints). Plus the app-level **webhook** + **cursor** trigger model (§2.2).

### 2.7 V1 tests

- `__tests__/webhooks/dropbox-v2-dispatch.test.ts` — dispatcher contract only (routes through `executeWebhookWorkflow`; cursor→requestId dedup fallback). **No** unit tests for the upload/download/find handlers.

### 2.8 Verdict

**Real and functional, but PARTIAL (1 comingSoon trigger) + carrying two rot points (no webhook signature verification; base64/Supabase file handling).** Not a stub. Worth shipping in V2 — the rot points are exactly the things V2 already solved generically (HMAC verifiers + FileRef contract), so the V2 port is cleaner than V1.

---

## 3. V1 → V2 Decision Matrix

| Area | V1 behavior | V2 recommendation | Rationale | Implementation consequence |
| --- | --- | --- | --- | --- |
| **Auth model** | OAuth2 authorize-code, refreshable via `token_access_type=offline`, basic auth, refresh tokens long-lived | **ADAPT (COPY the shape)** | Refreshable OAuth is correct and matches V2's HubSpot/Monday confidential-client pattern. The one non-standard piece is the `token_access_type=offline` authorize param. | New `integrations/dropbox/{manifest,oauth}.ts`. The V2 OAuth dispatcher must support appending `token_access_type=offline` to the authorize URL (open decision §9.2). |
| **PKCE** | Inconsistent (registry yes, config no) | **REPLACE → no PKCE + body/basic auth** | Confidential client with a secret; matches HubSpot/Monday. Avoids carrying V1's contradiction forward. Revisit only if the V2 dispatcher does PKCE uniformly. | `manifest.oauthFlows: ["v2"]`, no PKCE helper. Open decision §9.2. |
| **Scopes** | 4 (`files.content.*`, `files.metadata.read`, `account_info.read`) | **ADAPT → 6** | Add `sharing.read` + `sharing.write` so the sharing actions (`create_shared_link`) work without an app-level grant assumption. V1 leaned on app-config defaults. | `manifest.scopes.required` = `["account_info.read","files.metadata.read","files.content.read","files.content.write","sharing.read","sharing.write"]`. |
| **Account identity** | `account_id` + email + name | **COPY (load-bearing)** | `providerAccountId` MUST be the Dropbox `account_id` (`dbid:`), because the webhook routes on `list_folder.accounts`. Email/name → displayName. | `accountIdField` resolves to `account_id`; OAuth callback fetches `get_current_account`. |
| **API transport** | Two-host REST (`api.` + `content.`); `Dropbox-API-Arg` header for content | **COPY** | This is Dropbox's only API. | New `integrations/_shared/dropbox/api/_request.ts` (JSON-RPC) + a content-endpoint variant for upload/download bytes. Per-operation wrapper files (one per call), same convention as Monday's `_shared/monday/api/`. |
| **Actions — upload** | `uploadFile` w/ 4 source types + Supabase intermediary + inline create-folder | **REPLACE source-handling; KEEP the action** | The 4-source `sourceType`/`fileFromNode` shape is the V1 antipattern. V2 upload **consumes a `FileRef`** via `core/files/fetchFileBytes` (exactly `monday:add_file` / `slack:upload_file`). | `dropbox:upload_file` consumes `{ file: FileRef, path, mode? }`; rejects `kind=provider_url` with the standard config-error hint; `≤150 MB` guidance. |
| **Actions — get_file** | One node that does metadata + base64 content + inline shared-link | **REPLACE → split into 3** | One node doing three things is the V1 conflation. Split into `download_file` (FileRef producer), `get_file_metadata` (read), `create_shared_link` (sharing). | 3 V2 actions. `download_file` stages bytes via `services/files/stageFileToStorage` → `FileRef(kind=v2_storage)` (mirrors `monday:download_file`). No base64 in output. |
| **Actions — find_files** | One node that does list (no query) + search (query) + bulk base64 download | **REPLACE → split into 2** | Same conflation. Split into `list_folder` (browse) and `search_files` (query). Drop bulk inline-download (chain `download_file` per result instead). | `dropbox:list_folder` + `dropbox:search_files`. Each returns metadata arrays only; no inline bytes. |
| **Actions — file management** | inline `create_folder_v2` only | **ADAPT → promote + add** | A V2 file provider that can't move/copy/delete/create-folder is a partial surface (violates the no-partial-surfaces standard). Dropbox's REST exposes all of these cleanly. | Add `create_folder`, `move_file`, `copy_file`, `delete_file` (destructive). |
| **Actions — sharing/links** | inline `create_shared_link_with_settings` | **ADAPT → promote + add temp link** | Shared link is a first-class workflow primitive; `get_temporary_link` is the auth-free short-lived download URL that maps perfectly onto `FileRef(kind=signed_url)`. | `create_shared_link` (permanent, sensitive) + `get_temporary_link` (`FileRef(signed_url)`). |
| **Triggers** | `new_file` app-webhook + cursor (comingSoon) | **ADAPT → ship as webhook (DROPBOX-5)** | The model is sound; the comingSoon flag + missing signature were the only blockers, both now fixable. But it is **shared-infra** (one app-level URL, account-scoped), NOT the per-workflow `?workflowId=&nodeId=` pattern. | `/api/webhooks/dropbox` global route; account→workflow fan-out; per-workflow cursor seeded at activation. See §4 triggers + §9. |
| **Webhook signature** | none (dev-mode accepted unsigned) | **REPLACE → fail-closed HMAC** | Reuse the GitHub/Monday hex-HMAC pattern. Dropbox signs with the **app secret**. Closes the exact gap that deferred Dropbox in Phase 1. | `integrations/_shared/dropbox/webhooks/signature.ts` verifying `X-Dropbox-Signature` (HMAC-SHA256-hex of raw body, key = `DROPBOX_CLIENT_SECRET`). 503 on missing secret, 401 on mismatch. |
| **Challenge handshake** | GET `?challenge` → text echo (V1 had it) | **COPY** | Required by Dropbox to register the URL. | Route GET handler echoes `challenge` as `text/plain` (not signature-gated — it's the verification step). |
| **Resolvers** | `dropbox-folders`, `dropbox-files` | **ADAPT → `dropbox:folders`, `dropbox:files`** | Same resolver-first machinery as every V2 provider; rename to the V2 `provider:resource` convention. | DROPBOX-3. Path-based (Dropbox uses paths, not ids). |
| **Field names / defaults** | `path`, `filePath`, `sourceType`, `fileFromNode`, … | **REPLACE freely** | **No load-bearing V2 field names exist** (green-field; no V2 workflows reference Dropbox config). The antipattern source-type fields are dropped. Pick V2-author field names that match the Dropbox API (`path`, `name`, `fromPath`, `toPath`, `query`, `file`). | No V1-field-preservation constraint. See §4 warning. |
| **Output shapes** | base64 `content`; bespoke metadata keys | **REPLACE → FileRef + normalized metadata** | Align to the FileRef contract + a consistent metadata shape (`id`, `name`, `path`, `sizeBytes`, `rev`, `clientModified`, `serverModified`). | Bytes never in output. §4 output proposal. |
| **Storage primitive** | Supabase `workflow-files` (V1's own infra) | **REPLACE → P-S3 storage** | V2's `services/files/stageFileToStorage` + `workflow-files` bucket already exist and are the canonical primitive. | `download_file` uses `stageFileToStorage`; `upload_file` uses `fetchFileBytes`. |
| **Rate limits** | unhandled | **DEFER** | Dropbox returns 429 + `Retry-After`; V2's pattern is to surface a typed rate error + log, no auto-backoff (matches Monday). | `_request.ts` throws a typed `RateLimitError`; backoff deferred to DROPBOX-N. |
| **External constraints** | app-console webhook URL; app review for production scopes | **NOTE / open decision** | Production needs the webhook URL set in the Dropbox App Console (one-time operator setup, like Discord's Interactions URL) + scope approval for production apps. Not a code blocker for DROPBOX-2..4. | Documented operator follow-up; gates the trigger (DROPBOX-5), not the actions. |

---

## 4. Proposed V2 surface

### Actions to SHIP (DROPBOX-2) — 11

Full file-management + sharing surface (no partial-surface shortcut):

| V2 key | Category | FileRef role | Dropbox endpoint(s) | Notes |
| --- | --- | --- | --- | --- |
| `dropbox:upload_file` | files | **consumer** | `content/2/files/upload` | `{ file: FileRef, path, mode?: add\|overwrite, autorename? }`. Reject `provider_url`. ≤150 MB (resumable deferred). |
| `dropbox:download_file` | files | **producer** | `content/2/files/download` | Stage → `FileRef(kind=v2_storage, provider="dropbox")`. Replaces V1 base64. |
| `dropbox:get_file_metadata` | files | — | `api/2/files/get_metadata` | Read only. |
| `dropbox:list_folder` | files | — | `api/2/files/list_folder` (+ `/continue`) | Browse a folder; `recursive?`, pagination via `cursor`. |
| `dropbox:search_files` | files | — | `api/2/files/search_v2` | Query + filters. |
| `dropbox:create_folder` | files | — | `api/2/files/create_folder_v2` | Promoted from V1's inline behavior. |
| `dropbox:move_file` | files | — | `api/2/files/move_v2` | Move/rename (`fromPath`, `toPath`). Recoverable. |
| `dropbox:copy_file` | files | — | `api/2/files/copy_v2` | Copy. |
| `dropbox:delete_file` | files | — | `api/2/files/delete_v2` | **Destructive** (Dropbox trash ~30d). High + confirmation. |
| `dropbox:create_shared_link` | files | producer (signed_url, optional) | `api/2/sharing/create_shared_link_with_settings` (handle "already exists" via `list_shared_links`) | Permanent public link → sensitive output. |
| `dropbox:get_temporary_link` | files | **producer (signed_url)** | `api/2/files/get_temporary_link` | Auth-free ~4h URL → `FileRef(kind=signed_url)`. |

### Actions to DEFER (DROPBOX-N, named blockers)

- **`upload_file` resumable >150 MB** (`upload_session/start|append_v2|finish`) — DEFER: streaming/large-file is explicitly out of P-S3 scope (§9 of that plan); single-shot 150 MB covers the common case. Revisit when P-S3 ships resumable upload support.
- **`list_revisions` / `restore_file`** (file version history) — DEFER: niche; revisit on user demand.

### Actions to REJECT

- **Dropbox Paper** APIs — REJECT: separate product surface, largely deprecated; not file storage.

### Triggers to SHIP (DROPBOX-5) — 1

- `dropbox:new_file` — **webhook (shared-infra) + per-account cursor**. Architecture:
  - **Route:** one global `/api/webhooks/dropbox` (the URL registered once in the Dropbox App Console). **No `?workflowId=&nodeId=`** — Dropbox can't carry them (fixed app URL).
  - **GET** `?challenge=` → echo `text/plain` (verification handshake; not signature-gated).
  - **POST** → verify `X-Dropbox-Signature` (fail-closed). Body `{ list_folder: { accounts: [account_id...] } }`.
  - **Fan-out:** for each `account_id`, find V2 integrations whose `providerAccountId === account_id` → find `trigger_resources` rows for `(dropbox, new_file)` owned by those users → for each row read its stored `cursor`, call `list_folder/continue`, filter the delta to file-additions under the configured `path`, normalize → `dispatchTriggerEvent`, persist the advanced cursor.
  - **Activation hook:** seed the per-workflow `cursor` via `list_folder/get_latest_cursor` for the configured folder (first-poll-miss protection, the same rule as polling triggers), and store `accountId` (for the fan-out lookup) + `path`. **No `create_webhook`** (none exists). **No renewal/subscription-watch marker** (the app webhook doesn't expire). The activation hook's cursor-seeding satisfies the `trigger-meta-activation-invariant` **without** a `SHARED_INFRA_EXEMPT_KEYS` entry.
  - **Dedup:** key off the advanced cursor + per-entry Dropbox file `id` + `rev` (a stable provider id), e.g. `new_file:{accountId}:{file_id}:{rev}`.

### Triggers to DEFER / REJECT

- `file_deleted` / `folder_changed` — DEFER to DROPBOX-N if requested; the cursor delta already carries deletes, so it's incremental once `new_file` ships.

### Exact field-name preservation warning

**There is NO V1-field-preservation requirement for Dropbox** — V2 is green-field, so no existing V2 workflow config references any Dropbox field. The only V1 field names worth deliberately **NOT** carrying forward are the antipattern upload fields (`sourceType`, `fileFromNode`, inline `content`/`contentEncoding`) — these are replaced by the FileRef contract. Field names are the V2 author's choice, picked to match the Dropbox API (`path`, `name`, `query`, `fromPath`, `toPath`, `file`, `mode`). Contrast with Monday/Slack where camelCase runtime field names had to be preserved 1:1 against existing V2 schemas — that constraint does not apply here.

### Resolver needs (DROPBOX-3)

- `dropbox:folders` — folder picker, **path-valued** (Dropbox identifies by path, not id); root + recursive list.
- `dropbox:files` — files-in-folder picker, `dependsOn: ["path"]`.
- (`dropbox:shared_links` — DEFER unless a sharing-management action needs it.)

### Output shape proposal

Normalized file descriptor across actions:
```
{ id, name, path, sizeBytes?, rev?, clientModified?, serverModified?, isFolder? }
```
- `download_file` / `get_temporary_link` add `{ file: FileRef }`.
- `create_shared_link` adds `{ sharedUrl }` (sensitive).
- Bytes / base64 **never** in output (contract-enforced by FileRef + P-S3 guidance).

### FileRef behavior proposal

| Action | FileRef behavior |
| --- | --- |
| `upload_file` | **Consumer.** `config.file: FileRef`. `fetchFileBytes` for `v2_storage` / `signed_url`; **reject `provider_url`** with the standard config-error + hint (mirrors `monday:add_file`). Output: metadata + optional `FileRef(provider_url, provider="dropbox")`. |
| `download_file` | **Producer.** `content/2/files/download` → bytes → `stageFileToStorage` → `FileRef(kind=v2_storage, provider="dropbox")`. Durable across delays + cross-provider chains. |
| `get_temporary_link` | **Producer.** Dropbox temp link is auth-free ~4h → `FileRef(kind=signed_url, expiresAt≈+4h)`. Uses the P-S3 `signed_url` arm to skip a stage round-trip. |
| size guidance | Add `dropbox: 150 * MB` to [`core/files/limits.ts`](../../../core/files/limits.ts) `FILE_REF_SIZE_GUIDANCE` (DROPBOX-2). |

---

## 5. Risk classification

| Action(s) | riskLevel | isDestructive | requiresConfirmation | Rationale |
| --- | --- | --- | --- | --- |
| `get_file_metadata`, `list_folder`, `search_files` | low | no | no | Pure reads. |
| `download_file`, `get_temporary_link` | medium | no | no | Reads file CONTENT — bytes/links may carry sensitive data. |
| `upload_file` (mode `add`/`autorename`), `create_folder`, `move_file`, `copy_file` | medium | no | no | Recoverable external writes. |
| `upload_file` (mode `overwrite`) | medium | no | no | Overwrite is recoverable via Dropbox file revisions; stays medium (not destructive). |
| `create_shared_link` | medium | no | no | Creates a **publicly-accessible** URL → output sensitive; medium (security-relevant egress, but reversible by unsharing). |
| `delete_file` | **high** | **yes** | **yes** | Destructive (Dropbox trash recoverable ~30d, but treated as the destructive trio — parity with `monday:delete_item`). |
| `new_file` trigger | low | — | — | Observational. |

---

## 6. Sensitive output proposal

Mark `sensitive: true`:
- `name`, `path` (file/folder names + folder structure reveal PII / org structure).
- `sharedUrl`, `temporaryLink`, any download URL (access-bearing — matches the structural guard's `signedUrl`/`downloadUrl` suspicious names).
- Account `email` / display name (PII — matches the `email` suspicious name).
- FileRef content handled by the contract (no bytes ever).
- Trigger `new_file` payload: `name`, `path` sensitive; `accountId` non-sensitive opaque id.

Non-sensitive: opaque ids (`id`, `rev`, `cursor`, `account_id`), `sizeBytes`, timestamps, `isFolder`.

**Banned from outputs entirely** (structural `sensitive-output-coverage` guard): no `token` / `secret` / `accessToken` / `refreshToken` / `apiKey` / `clientSecret` / `webhookSecret` field names. The Dropbox app secret + tokens never enter any output or error message (sanitize transport errors — never echo URLs/bytes; mirror `monday:download_file`'s `fetchAssetBytes` which logs status only).

---

## 7. Slice sequence

| Slice | Scope |
| --- | --- |
| **DROPBOX-1** (this doc) | Audit + V2-native port plan. Doc-only. |
| **DROPBOX-2** | Runtime port: `manifest.ts`, `oauth.ts`, `_shared/dropbox/api/` wrappers (JSON-RPC + content host), 11 action handlers + Zod schemas, `errors.ts`, handler-registry wiring, `FILE_REF_SIZE_GUIDANCE` entry, unit tests. |
| **DROPBOX-3** | OptionsSource resolvers: `dropbox:folders`, `dropbox:files` (resolver-first). |
| **DROPBOX-4** | 11 ActionMetas + **COVERED_PROVIDERS flip** (enforces 1:1 handler↔meta). |
| **DROPBOX-5** | `dropbox:new_file` webhook trigger: global `/api/webhooks/dropbox` route (challenge + HMAC), `_shared/dropbox/webhooks/signature.ts`, activation cursor-seed, account→workflow fan-out + cursor reconciliation, TriggerMeta, manifest `webhookTrigger: true`, tests. |
| **DROPBOX-N** | Deferred polish (named blockers): resumable >150 MB upload (blocked on P-S3 resumable support), file revisions/restore, additional change triggers. |

---

## 8. What to copy vs not copy

- **COPY:** the OAuth wire shape (endpoints, refreshable, basic auth, `token_access_type=offline`), the two-host REST transport, the GET `?challenge` echo, `account_id` as `providerAccountId`, the cursor-delta trigger model.
- **ADAPT:** V1's monolithic `get_file`/`find_files` → split into focused V2 actions; `dropbox-folders`/`dropbox-files` → `dropbox:folders`/`dropbox:files`; inline create-folder/shared-link → first-class actions; V1 handlers → V2 per-handler split under `integrations/dropbox/actions/`.
- **REPLACE:** the base64-inline outputs + Supabase-`workflow-files` source-type upload → P-S3 FileRef (`fetchFileBytes` / `stageFileToStorage`); the missing/dev-mode webhook verification → fail-closed `X-Dropbox-Signature` HMAC; V1's contradictory PKCE → no-PKCE confidential client.
- **DEFER:** resumable large upload (blocked on P-S3 resumable), file revisions, extra change triggers, rate-limit backoff — each with the revisit condition named in §4/§7.
- **REJECT:** Dropbox Paper (separate/deprecated product).

---

## 9. Open decisions before implementation

1. **Ship Dropbox at all?** → Recommended **YES** (product direction re-included it; both Phase-1 reopen conditions met). Confirm.
2. **Auth: PKCE + `token_access_type=offline`.** Recommend no-PKCE confidential client. The V2 OAuth dispatcher must support appending `token_access_type=offline` to the authorize URL — confirm the dispatcher can carry a provider-specific authorize param (or add the seam in DROPBOX-2).
3. **Action surface size: 11 (vs V1's 3).** Confirm the expanded surface (split + promote + add) is in scope for DROPBOX-2, or trim (e.g. drop `copy_file`/`get_temporary_link` to DROPBOX-N).
4. **Webhook signing key.** Recommend keying the HMAC on `DROPBOX_CLIENT_SECRET` (Dropbox's documented app-secret signing) rather than a separate `DROPBOX_WEBHOOK_SECRET`. Fail-closed if unset. Confirm.
5. **App-console webhook URL operator setup.** The `dropbox:new_file` trigger requires the webhook URL be registered once in the Dropbox App Console (one-time operator step, like Discord's Interactions Endpoint URL). Acceptable for DROPBOX-5? (Does not affect DROPBOX-2..4.)
6. **Folder picker UX.** Dropbox identifies by **path**, not id — `dropbox:folders` returns path strings as option values. Confirm path-as-value is acceptable (no id↔path translation layer).
7. **`delete_file` semantics.** Dropbox delete is soft (trash, ~30d recoverable). Recommend still high + destructive + confirmation (parity with `monday:delete_item`). Confirm.
8. **`create_shared_link` "already exists".** Dropbox 409s if a shared link already exists; recommend falling back to `list_shared_links` and returning the existing link. Confirm the silent-reuse behavior.

---

## 10. Acceptance criteria

- [x] Doc-only — no source / runtime / resolver / metadata changes.
- [x] No `integrations/dropbox/` runtime files added.
- [x] No metadata added; no resolvers added; no triggers added.
- [x] Dropbox NOT added to `COVERED_PROVIDERS`.
- [x] Gates run: `npx tsc --noEmit`, `npm run lint`, `npm run lint:structure`, `npm run lint:migrations`.
- [x] Doc staged with explicit path; unrelated dirty files untouched.
- [ ] Marcus accepts §9 open decisions before DROPBOX-2 begins.
