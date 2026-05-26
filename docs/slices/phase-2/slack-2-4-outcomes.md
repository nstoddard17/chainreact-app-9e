# Slack 2.4 — File actions outcomes

**Status:** Shipped locally on `v2-provider-port-local`. **Retro.**
**Master plan:** [`docs/slices/phase-2-plan.md`](phase-2-plan.md).
**Provider audit:** [`docs/slices/parity-slack.md`](parity-slack.md).
**Predecessors:**
- [`docs/slices/slack-2-1-messaging-reactions-plan.md`](slack-2-1-messaging-reactions-plan.md) (shipped)
- [`docs/slices/slack-2-2-private-channels-and-lifecycle.md`](slack-2-2-private-channels-and-lifecycle.md) (shipped)
- [`docs/slices/slack-2-3-channels-users-plan.md`](slack-2-3-channels-users-plan.md) → [`slack-2-3-outcomes.md`](slack-2-3-outcomes.md) (shipped)

**Plan source:** [`docs/slices/slack-2-4-files-plan.md`](slack-2-4-files-plan.md).
**Direct platform dependency:** P-S3 file output contract — shipped. Plan: [`docs/slices/p-s3-file-output-contract-plan.md`](p-s3-file-output-contract-plan.md). Outcomes: [`docs/slices/p-s3-file-output-contract-outcomes.md`](p-s3-file-output-contract-outcomes.md).
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`.
**V2 surface:** [`integrations/slack/`](../../integrations/slack/).

Slack 2.4 is the first V2 consumer that proves the P-S3 contract end to
end. Three file-aware Slack actions (`upload_file`, `download_file`,
`get_file_info`) ship on top of `FileRef` + the `workflow-files` storage
stack. No new platform infrastructure introduced; every behavior fits the
P-S3 shape exactly. The `file_uploaded` trigger is deferred to Slack 2.5
per plan §10 decision #2.

---

## 1. Scope shipped

### Actions (3)

| Action | Slack endpoints | What it does | V1 reference |
|---|---|---|---|
| `upload_file` | `files.getUploadURLExternal` + raw POST to returned URL + `files.completeUploadExternal` | Upload a file (sourced from a FileRef) to a channel. | `lib/workflows/actions/slack/uploadFile.ts` |
| `download_file` | `files.info` + bot-token GET of `url_private_download` + `stageFileToStorage` | Download a Slack file by id, stage bytes into `workflow-files`, return `FileRef(kind=v2_storage)`. | `lib/workflows/actions/slack/downloadFile.ts` |
| `get_file_info` | `files.info` | Metadata-only lookup; returns `FileRef(kind=provider_url)` + structured metadata. | `lib/workflows/actions/slack/getFileInfo.ts` |

Registered in [`services/execution/handlers/_registry.ts`](../../services/execution/handlers/_registry.ts) as
`{ provider: "slack", type: "upload_file" | "download_file" | "get_file_info" }`.

### API wrappers (3)

`files.getUploadURLExternal`, `files.completeUploadExternal`, `files.info`
under [`integrations/slack/api/`](../../integrations/slack/api/). The raw
upload POST is intentionally NOT wrapped — the URL returned by
`files.getUploadURLExternal` is single-use, short-lived, and not part of
the Slack API surface; it's a plain `application/octet-stream` POST with
no Slack auth attached. Each wrapper follows the established Slack 2.1
pattern: snake_case body fields, `SlackApiError` on logical failure,
`http_<status>` on non-2xx, `SLACK_API_BASE` override-aware, ok-but-empty
defense where the response shape guarantees a field.

### Trigger (0)

No file trigger in Slack 2.4. `slack_trigger_file_uploaded` is deferred
to Slack 2.5 per plan §10 decision #2.

### Manifest scope changes

| Scope | Status before 2.4 | Status after 2.4 |
|---|---|---|
| `files:read` | absent | NEW required (Commit 2) |
| `files:write` | absent | NEW required (Commit 2) |

No user-token (`xoxp-…`) file scopes added. No unrelated `chat:*` /
`channels:*` / `users:*` additions. Workspaces with the pre-2.4 grant set
are prompted to re-OAuth before any Slack 2.4 action resolves — same UX
as Slack 2.3's `users:read` promotion.

### File system reshape

Action files added under a new
[`integrations/slack/actions/files/`](../../integrations/slack/actions/files/)
subfolder. Three handlers + three Zod schemas = six files. Parent
`integrations/slack/actions/` stays well under the 50-file leaf-folder
limit. Follows the domain-grouping precedent set in Slack 2.3
(`channels/`, `users/`).

---

## 2. Durable decisions worth preserving

### 2.1 FileRef is the only file contract — no inline content paths

Every Slack 2.4 action consumes or produces `FileRef` (P-S3 contract).
There is no `fileSource` discriminator, no inline `content` textarea, no
`base64Data` field, no `url` config arm. The 10 V1 rot patterns enumerated
in plan §7 are all rejected structurally:

- `upload_file` config schema has exactly one file input: `file: FileRefSchema`.
- `download_file` output is `{ file: FileRef(v2_storage), fileId }`. No `content`. No base64.
- `get_file_info` output is `{ file: FileRef(provider_url), ...flat metadata }`. No bytes.

The runs table stays free of binary blobs by construction — `FileRefSchema`
is `.strict()` per arm, so a `content` / `bytes` / `base64` / `data` key
on a file output would fail Zod validation.

### 2.2 `upload_file` rejects `provider_url` FileRefs at handler entry

Per plan §5 + §10 decision #1, `upload_file` accepts only `v2_storage`
and `signed_url` FileRefs. Inbound `provider_url` is rejected at handler
entry with a clear error/hint pointing to `download_file` as the unblock.

**Rationale (durable):** P-S3 `fetchFileBytes` deliberately throws
`UnsupportedProviderFetchError` for `provider_url` because cross-provider
URL fetch requires per-provider auth / scope handling. Slack 2.4 does
NOT introduce a Slack-specific `providerFetcher` adapter, does NOT extend
`fetchFileBytes`'s signature, and does NOT auto-stage on upload. Workflow
authors that have a `provider_url` ref compose
`<source>:download_file → slack:upload_file` to materialize durable
bytes. A generic provider-URL fetch adapter is future platform work, not
Slack 2.4 scope.

### 2.3 Bot-token only; no `asUser` toggle; no workspace selector

V1 supported an `asUser: true` toggle on all three actions that flipped
bot ↔ user token at runtime, and a per-action `workspace` selector. V2
ports neither. Bot-token resolution flows through `refreshAndRetry` +
`getActiveForExecution` from the integration row scoped by
`triggerEvent.accountId`. Matches the Slack 2.3 §6 #6 outcome.

`url_private_download` GETs in `download_file` attach `Authorization:
Bearer ${botToken}` and nothing else. User-token (`xoxp-…`) file scopes
are explicitly omitted from the manifest.

### 2.4 No silent name resolution for channels

`upload_file` accepts a single channel id matching `^[CG][A-Z0-9]+$`. No
`conversations.list` round-trip to translate names. Same rule as Slack
2.3 channel-targeted actions; reaffirmed by Slack 2.4. Workflow authors
with a name compose `list_channels` upstream and select the id.

### 2.5 Slack-side response logging discipline

Handlers do NOT log `url_private_download`, `url_private`, or any byte
fragment. `SlackApiError.message` carries the Slack `error` code only.
Fixes the V1 anti-pattern of `logger.error('[Slack Download File] Error:',
error)` which could surface token-bearing URL fragments to production
logs.

### 2.6 P-S3 builders, not literals

Output `FileRef`s are constructed exclusively via the builders in
[`core/files/createFileRef.ts`](../../core/files/createFileRef.ts):
- `download_file` → `stageFileToStorage` (which calls `fileRefFromStoragePath` internally).
- `get_file_info` → `fileRefFromProviderUrl`.
- `upload_file` → `fileRefFromProviderUrl` (for the post-upload Slack URL).

No `FileRef` object literals anywhere in Slack 2.4. Filename sanitization
is handled inside the builders / `stageFileToStorage`; handlers don't call
`sanitizeFilename` directly.

---

## 3. V1 rot fixed (consolidated)

All 10 patterns from plan §7 are NOT ported. Concretely:

1. No `content: "data:${mimetype};base64,${base64}"` in `download_file` output.
2. No `fileSource` discriminator with `"content"` / `"base64"` arms on `upload_file` schema.
3. No MIME inference from `data:` URL headers (FileRef.mimeType is contractual).
4. No size discipline at config time (FileRef bytes are bounded by `fetchFileBytes`; `getFileRefSizeGuidance("slack")` is advisory).
5. No `asUser: true` toggle.
6. No `workspace` per-action selector.
7. No `fileSource: "url"` arm.
8. No raw `urlPrivate` / `urlPrivateDownload` flat fields in `get_file_info` output — wrapped in `FileRef(provider_url).url`.
9. No `url_private_download` / bytes in handler logs.
10. `completeUploadExternal` title fallback to FileRef name is documented, not hidden.

---

## 4. Files shipped

### Source (Commits 2-4)
- `integrations/slack/api/filesGetUploadURLExternal.ts`
- `integrations/slack/api/filesCompleteUploadExternal.ts`
- `integrations/slack/api/filesInfo.ts`
- `integrations/slack/actions/files/uploadFile.ts` + `.schema.ts`
- `integrations/slack/actions/files/downloadFile.ts` + `.schema.ts`
- `integrations/slack/actions/files/getFileInfo.ts` + `.schema.ts`
- `integrations/slack/manifest.ts` — `files:read` + `files:write` added to required scopes
- `services/execution/handlers/_registry.ts` — 3 new entries

### Tests (Commits 2-5)
- 3 wrapper tests at `tests/unit/integrations/slack/api/`
- 3 handler tests at `tests/unit/integrations/slack/actions/files/`
- Manifest test updated for the new scopes
- 4 new e2e cases in `tests/e2e/slice-1-slack-walkthrough.spec.ts`
- New MockSlackServer endpoints: `files.getUploadURLExternal`, raw upload URL receiver, `files.completeUploadExternal`, `files.info`, `url_private_download` GET (plus `__inspect` / reset support for the new endpoints)

### Docs
- [`docs/slices/slack-2-4-files-plan.md`](slack-2-4-files-plan.md) (Commit 1)
- This file (Commit 6)
- CLAUDE.md updates (Commit 6)

---

## 5. Commit breakdown (6)

| # | Commit hash | What landed |
|---|---|---|
| 1 | `eaaa3e257` | `docs(slack): plan Slack 2.4 file actions` |
| 2 | `fe8e7529e` | `feat(slack): add file API wrappers` (3 wrappers + manifest scope add) |
| 3 | `86a853bb6` | `feat(slack): add upload file action` |
| 4 | `b84b3c4ca` | `feat(slack): add download and file info actions` |
| 5 | `3a38c565e` | `test(slack): extend walkthrough with file actions` |
| 6 | (this commit) | `docs(slack): document Slack 2.4 outcomes` |

Each implementation commit individually passed:
- `npx tsc --noEmit`
- `npm run lint`
- `npm run lint:structure`
- `npm run lint:migrations`
- `npm test`

Final unit-test totals after Commit 5: **556 suites / 4954 tests** (+43
suites, +534 tests since Slack 2.3 baseline; net includes Slack 2.4 +
parallel Gmail 2.1 work).

Slack-focused unit subset after Commit 5: **83 suites / 614 tests
passing.**

Playwright Slack walkthrough after Commit 5: **8 / 8 tests passing with
`--workers=1`** (4 pre-existing Slack 2.3 scenarios + 4 new Slack 2.4
scenarios).

---

## 6. E2E coverage shipped

| # | Scenario | What it asserts |
|---|---|---|
| 1 | Upload from `FileRef(v2_storage)` | Three-step Slack upload (`files.getUploadURLExternal` → raw bytes POST → `files.completeUploadExternal`) exercised. Raw bytes POST verified. No `Authorization` header on the pre-signed upload URL (Slack's URL is single-use; auth would be wrong). Output is `FileRef(kind=provider_url, provider="slack")`. No `content` / `bytes` / `base64` / `data` keys anywhere in the run output. |
| 2 | `download_file` stages to `workflow-files` | `files.info` called once. `url_private_download` fetched with `Bearer <botToken>`. `stageFileToStorage` exercised end-to-end. `workflow_files` metadata row exists. Storage object exists and matches sentinel bytes. Output is `FileRef(kind=v2_storage, provider="slack")`. No byte/base64 keys in output. |
| 3 | `get_file_info` metadata-only | `files.info` called once. NO byte download endpoint touched. Output is `FileRef(kind=provider_url, provider="slack")` plus flat metadata fields. No byte/base64 keys in output. |
| 4 | `upload_file` rejects `provider_url` | Workflow run fails clearly. Error mentions `provider_url`. NO Slack file API endpoints called. |

### E2E scenarios deferred (not blocking 2.4)

- **`cleanupExpiredFiles` cron path.** P-S3 unit tests at
  `tests/unit/services/cleanupExpiredFiles.*` already cover the cleanup
  behavior; running it through the Slack e2e harness adds no incremental
  signal. Skipped intentionally.
- **`file_shared` → workflow dispatch.** Deferred to Slack 2.5 with the
  trigger.

### Run discipline

Slack walkthrough specs share the mock-Slack `__inspect` counter; the
spec is structurally tied to `workers: 1`. Local developers running
`npx playwright test tests/e2e/slice-1-slack-walkthrough.spec.ts` MUST
pass `--workers=1`. CI is fine — `playwright.config.ts` already pins
workers to 1 under `process.env.CI`. Documented in Slack 2.2 retro §6,
Slack 2.3 outcomes §2.7, and reaffirmed here.

---

## 7. E2E-found issues (no production code changes required)

E2E uncovered four operational issues during Commit 5; none required
runtime code changes.

1. **`workflow_files` migration had not been applied to the dev Supabase
   project.** `npm run db:push` applied it cleanly. Durable rule:
   anyone running Slack 2.4 e2e against a fresh Supabase project MUST
   run `npm run db:push` first.
2. **Test channel ids needed Slack-format ids without hyphens** (i.e.
   `^[CG][A-Z0-9]+$`, no `C-abc` style). Fixture conformance fix.
3. **Test file ids needed Slack-format ids without hyphens** (`^F[A-Z0-9]+$`,
   no `F-abc` style). Fixture conformance fix.
4. **`workflow_files.run_id` requires UUID-shaped values.** Test
   harness now generates UUIDs for `runId` rather than synthetic strings.

---

## 8. P-S3 usage rules proven by Slack 2.4

Slack 2.4 is the first concrete consumer of every P-S3 surface. The
following rules are now exercised in production-shape e2e:

- Provider actions consume `FileRef` as their file input contract; no
  inline alternatives.
- Downloaded provider bytes are staged through `stageFileToStorage`,
  yielding a `FileRef(v2_storage)`. Bytes never reach the action output
  shape.
- `provider_url` is a metadata/reference kind, not a generic-fetchable
  source. Consumer handlers either accept it as-is (`get_file_info`
  emits it) or reject it (`upload_file`'s `provider_url` arm).
- No generic provider-URL fetcher was introduced by Slack 2.4. Future
  cross-provider chains (e.g. `gmail:get_attachment → slack:upload_file`
  for `provider_url` inputs) need a platform-level provider fetcher;
  out of scope here.
- `workflow_files` migration must be applied before e2e (`npm run db:push`).

---

## 9. Acceptance criteria (post-merge)

- [x] 3 actions registered in `services/execution/handlers/_registry.ts` as `{slack, upload_file/download_file/get_file_info}`.
- [x] 3 API wrappers landed under `integrations/slack/api/`.
- [x] Manifest: `files:read` + `files:write` required; nothing else.
- [x] `actions/files/` subfolder created; parent `actions/` stays under the 50-file leaf-folder limit.
- [x] Every handler consumes / produces `FileRef` exclusively. No inline content / base64 / url arms.
- [x] `upload_file` rejects `provider_url` at handler entry with a hint pointing to `download_file`.
- [x] `download_file` stages bytes via `stageFileToStorage`; output is `FileRef(v2_storage)`.
- [x] `get_file_info` emits `FileRef(provider_url)` + structured metadata; no bytes.
- [x] No `asUser` toggle, no `workspace` selector, no user-token scopes.
- [x] No `url_private_download` / bytes in logs.
- [x] All Slack walkthrough e2e tests pass with `--workers=1` (8/8).
- [x] Slack-focused unit subset green (83 suites / 614 tests).
- [x] Full project unit test suite green (556 suites / 4954 tests).
- [x] Each commit's gates green locally.

---

## 10. What's deferred

| Item | Where it lands |
|---|---|
| `slack_trigger_file_uploaded` | Slack 2.5 (next Slack slice; not yet planned). |
| Cross-provider `provider_url` fetch adapter | Future platform slice (P-S4 or later). Unblocks `<any>:get_file_info → slack:upload_file` chains directly. |
| `fileRefFromInlineText(name, "hello")` helper | Future platform convenience. Out of Slack 2.4 per plan §10 decision #3. |
| `cleanupExpiredFiles` cron e2e | Not needed — P-S3 unit tests cover the cron path. |

---

## 11. What's next (Slack roadmap)

- **Slack 2.5** — `file_uploaded` trigger (`file_shared` event → canonical `slack.file_shared`). Filter scope minimal (`channel?: string`). Payload exposes the raw Slack `event` object verbatim; downstream consumers compose `slack:get_file_info` for metadata. No new manifest scope (`files:read` already granted in 2.4). Plan doc not yet written.
- **P-S1** — user token storage (`xoxp-…`) — unblocks `update_user_status` and `set_user_presence`.
- **`userJoinedWorkspace`** — per-trigger scope-request design (open audit question; carried from Slack 2.3 outcomes §6).
- **`add_reminder`** — pending Slack API status check (parity audit §13).

None are committed for follow-up timing in this slice; tracking lives in
[`docs/slices/parity-slack.md`](parity-slack.md) §§5–6.
