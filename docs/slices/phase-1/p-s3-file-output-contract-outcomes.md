# P-S3 — File output contract outcomes

**Status:** Shipped locally on `v2-provider-port-local`. **Retro.**
**Master plan:** [`docs/slices/phase-2-plan.md`](phase-2-plan.md).
**Plan source:** [`docs/slices/p-s3-file-output-contract-plan.md`](p-s3-file-output-contract-plan.md).
**V2 surface:** [`contracts/file.ts`](../../contracts/file.ts), [`core/files/`](../../core/files/), [`services/files/`](../../services/files/), [`repositories/workflowFiles.ts`](../../repositories/workflowFiles.ts), [`supabase/migrations/20260512000000_workflow_files.sql`](../../supabase/migrations/20260512000000_workflow_files.sql), [`app/api/cron/cleanup-workflow-files/`](../../app/api/cron/cleanup-workflow-files/).

This slice introduced the **FileRef contract** and the minimum Supabase
storage stack that downstream provider parity needs (Slack 2.4
download/upload, future Gmail / Drive / OneDrive attachment chains).
P-S3 is pure platform — no provider handlers changed.

---

## 1. Scope shipped

### Commit chain on `v2-provider-port-local`

| # | Commit | Hash |
|---|---|---|
| 1 | `docs: plan P-S3 file output contract` | `93e427709` |
| — | `docs(p-s3): mark plan accepted with §11 decisions locked` | `b61f1991a` |
| 2 | `feat(files): add FileRef contract and builders` | `c96c80b52` |
| 3 | `feat(files): add workflow file repository and metadata table` | `d53643b95` |
| 4 | `feat(files): add file staging fetch and cleanup services` | `2c4387d29` |
| 5 | `docs(files): document P-S3 file output contract outcomes` | (this commit) |

### Source surface

- **Contract:** [`contracts/file.ts`](../../contracts/file.ts) — `FileRefSchema` (Zod discriminated union over `kind`), `FileRef`, `FileRefKind`, per-arm types, `FILE_REF_NAME_MAX_LENGTH`.
- **Pure helpers:** [`core/files/createFileRef.ts`](../../core/files/createFileRef.ts) (3 builders), [`core/files/sanitizeFilename.ts`](../../core/files/sanitizeFilename.ts), [`core/files/limits.ts`](../../core/files/limits.ts) (`FILE_REF_SIZE_GUIDANCE`, `getFileRefSizeGuidance`), [`core/files/fetchFileBytes.ts`](../../core/files/fetchFileBytes.ts) (fetch dispatcher + `WORKFLOW_FILES_BUCKET` + `buildStoragePath`).
- **Repository:** [`repositories/workflowFiles.ts`](../../repositories/workflowFiles.ts) — service-role-only metadata CRUD over `public.workflow_files`. Zero `supabase.storage.*` access (verified by the `storage isolation invariant` test).
- **Services:** [`services/files/stageFileToStorage.ts`](../../services/files/stageFileToStorage.ts), [`services/files/cleanupExpiredFiles.ts`](../../services/files/cleanupExpiredFiles.ts) — Supabase storage I/O lives here.
- **Migration:** [`supabase/migrations/20260512000000_workflow_files.sql`](../../supabase/migrations/20260512000000_workflow_files.sql) — `workflow_files` table + RLS + indexes. **Bucket creation is out-of-band** (ops).
- **Cron route:** [`app/api/cron/cleanup-workflow-files/route.ts`](../../app/api/cron/cleanup-workflow-files/route.ts) — bearer-auth GET + POST → `cleanupExpiredFiles()`.

### Test surface (final)

| Suite | Tests |
|---|---|
| `tests/unit/contracts/file.test.ts` | 30 |
| `tests/unit/core/files/createFileRef.test.ts` | 16 |
| `tests/unit/core/files/sanitizeFilename.test.ts` | 13 |
| `tests/unit/core/files/limits.test.ts` | 6 |
| `tests/unit/core/files/fetchFileBytes.test.ts` | 11 |
| `tests/unit/repositories/workflowFiles.test.ts` | 20 |
| `tests/unit/services/files/stageFileToStorage.test.ts` | 8 |
| `tests/unit/services/files/cleanupExpiredFiles.test.ts` | 6 |
| `tests/unit/app/api/cron/cleanup-workflow-files.route.test.ts` | 6 |
| **Total new** | **116 tests across 9 suites** |

Repository baseline before P-S3 was 520 suites / 4505 tests. After
Commit 4: 529 suites / 4619 tests. P-S3 itself contributed +9 suites
and +114 net tests (two new suites overlap with pre-existing files in
the same folder, hence the 114-vs-116 difference in the test-count
delta).

---

## 2. Final P-S3 architecture

### 2.1 FileRef contract

```ts
// contracts/file.ts
type FileRefKind = "provider_url" | "v2_storage" | "signed_url";

// Strict Zod discriminated union — three .strict() arms, no overlap.
type FileRef =
  | { kind: "provider_url"; name; mimeType; url; provider; sizeBytes?; expiresAt?; providerFileId?; metadata? }
  | { kind: "v2_storage";   name; mimeType; storagePath; sizeBytes?; provider?; expiresAt?; providerFileId?; metadata? }
  | { kind: "signed_url";   name; mimeType; url; sizeBytes?; provider?; expiresAt?; providerFileId?; metadata? };
```

**Invariants enforced by the schema:**
- `name` is 1–512 chars, sanitized by `sanitizeFilename` at build time.
- `mimeType` is a non-empty string (no allow-list — providers police their own).
- `sizeBytes`, when present, is a nonnegative integer; `0` is valid (empty files).
- `provider` (when present) matches `/^[a-z][a-z0-9_-]*$/` (provider-id format).
- `expiresAt` (when present) is `z.string().datetime({ offset: true })` — accepts pure-Z and offset-bearing ISO timestamps; rejects "next tuesday".
- **No `content` / `bytes` / `base64` / `data` field** can be smuggled in. `.strict()` on each arm + closed discriminator enum rejects them at parse time.
- **No `kind: "inline_text" | "inline_bytes"` arm.** The omitted arm was deliberate (§11 #2).

### 2.2 No binary content lands in `workflow_runs.steps`

The runs table's `steps jsonb` column is the audit / debug surface that
the run-history UI reads on every fetch. P-S3's wall against bloat is
*structural*: a handler that wants to emit a file MUST construct a
FileRef. The shape can't represent inline bytes (`Buffer` /
`Uint8Array` / `Blob` / base64). The schema's `.strict()` arms reject
any extra key whose name might suggest bytes. There is no `kind` value
that opens the inline path.

### 2.3 Three transport arms (non-overlapping)

| Arm | Required fields | Consumer behavior |
|---|---|---|
| `provider_url` | `url`, `provider` | Consumer attaches the provider's bearer when fetching. **Generic fetch path NOT implemented in P-S3 — see §3.2.** |
| `v2_storage` | `storagePath` | Consumer fetches via the V2 storage helper (server-side auth). Bytes are durable across delays / retries. |
| `signed_url` | `url` | Consumer fetches directly, no auth headers. `expiresAt` SHOULD be set when the producer knows the lifetime. |

Optional diagnostic `provider` field on `v2_storage` and `signed_url`
records the original issuer — consumers don't need it to fetch, but
debug / observability surfaces benefit.

---

## 3. Storage model

### 3.1 Bucket + table + path scheme

| Aspect | Value |
|---|---|
| Bucket | `workflow-files` (pinned by `core/files/fetchFileBytes.ts::WORKFLOW_FILES_BUCKET`) |
| Path scheme | `<userId>/<workflowId>/<runId>/<nodeId>/<sanitized-filename>` (built via `buildStoragePath`) |
| Metadata table | `public.workflow_files` |
| Default retention | 24 hours (DB-side default `now() + interval '24 hours'`) |
| Per-`FileRef.expiresAt` override | yes — wins over the default at insert time |
| Bucket creation | **Out-of-band.** SQL migrations do not write to `storage.buckets` (the row layout has shifted between Supabase versions; fragile across local/remote). The migration header pins the bucket name. |

### 3.2 Table shape (key columns)

```
public.workflow_files
  id              uuid PK
  user_id         uuid NOT NULL  REFERENCES auth.users(id)        ON DELETE CASCADE
  workflow_id     uuid NOT NULL  REFERENCES public.workflows(id)  ON DELETE CASCADE
  run_id          uuid NOT NULL                                   -- NO FK (see below)
  node_id         text NOT NULL
  storage_path    text NOT NULL  UNIQUE
  file_name       text NOT NULL
  mime_type       text NOT NULL
  size_bytes      bigint                                          -- nullable; provider sometimes doesn't say
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb
  created_at      timestamptz NOT NULL DEFAULT now()
  updated_at      timestamptz NOT NULL DEFAULT now()
```

**Why no FK on `run_id`:** `workflow_runs` rows are written by the
engine at **run completion** (one row at the end). File staging
happens mid-execution, before the run row exists. A FK would block
the insert. End-of-run cleanup + nightly reconciler reclaim orphans by
`expires_at`.

**Why `storage_path` is UNIQUE, not just indexed:** the path is
deterministic per `(user, workflow, run, node, filename)`. A collision
means the engine ran the same node id twice in the same run with the
same filename — that's a bug, not a retry surface, and we surface it
loudly at insert time.

**Why `size_bytes` is `bigint`:** headroom for future large-file
support without a follow-up migration. No cost; `FILE_REF_SIZE_GUIDANCE`
caps remain ≤ 25 MB.

### 3.3 RLS

```sql
ALTER TABLE public.workflow_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY workflow_files_select_own ON public.workflow_files
  FOR SELECT USING (auth.uid() = user_id);
```

- One policy. SELECT-own only. No user-facing write / delete policies — every write goes through the service-role engine path.
- The SELECT-own policy is forward-looking; P-S3 ships no UI surface that reads `workflow_files`. A future "downloads for this run" view becomes additive against this policy.

### 3.4 Indexes

- `workflow_files_storage_path_unique` — UNIQUE on `storage_path`.
- `workflow_files_user_idx` — `(user_id, created_at DESC)` for future per-user UI.
- `workflow_files_workflow_idx` — `(workflow_id, created_at DESC)`.
- `workflow_files_run_idx` — `(run_id)` for end-of-run cleanup.
- `workflow_files_expires_idx` — `(expires_at)` for the nightly reconciler.

### 3.5 Repository purity

`repositories/workflowFiles.ts` is metadata-only. Zero
`supabase.storage.*` access. The Commit 3 test
`storage isolation invariant` exercises every read + delete path with
a mock client whose `.storage` field is `undefined` — if any
repository function reaches for storage, the test breaks. Storage
object lifecycle lives in `services/files/`.

---

## 4. Service model

### 4.1 `stageFileToStorage(input)` — producer side

```
Provider download bytes
  → sanitizeFilename(input.fileName)
  → buildStoragePath({...}) → <userId>/<workflowId>/<runId>/<nodeId>/<filename>
  → console.warn(...) if bytes > FILE_REF_SIZE_GUIDANCE[provider]   (advisory; never rejects)
  → supabase.storage.from("workflow-files").upload(path, bytes, { contentType, upsert: true })
     ├─ upload error → throw (no orphan to clean)
     └─ upload ok
        → insertWorkflowFile({...})
           ├─ insert error → best-effort storage.remove([path]); re-throw insert error
           └─ insert ok
              → fileRefFromStoragePath({...})
              → return { ref: FileRef(v2_storage), record: WorkflowFileRecord }
```

**Partial-failure contract:**
- Upload succeeds, metadata insert fails → best-effort `storage.remove([path])` then re-throw the metadata error. Orphan-cleanup failure is `console.warn`-logged and swallowed (the metadata error is what the caller needs).
- Upload fails → metadata insert never runs.
- Insert succeeds, caller's post-processing fails → no special cleanup; row + object survive and are reclaimed at `expires_at`.

**Never logs bytes** — verified by a `console.*` interceptor test that
checks every log call's stringified payload for a sentinel byte
pattern (`0xdeadbeef`).

### 4.2 `fetchFileBytes(ref, options?)` — consumer side

Pure dispatch on `ref.kind`. Lives in `core/files/`; allowed by the
`core-purity.test.ts` structure test because it imports only from
`@/contracts/*` and globals (`fetch`).

| Arm | Behavior |
|---|---|
| `v2_storage` | Caller passes `options.storage: WorkflowFilesStorageAdapter`. Adapter contract: `download(storagePath) → Promise<Uint8Array>`. Missing adapter → `FileFetchError`. |
| `signed_url` | `fetch(ref.url)` with no auth headers. Non-2xx or transport failure → `FileFetchError` whose message contains the status / error class but NOT the URL or any token-like substring. |
| `provider_url` | Throws **`UnsupportedProviderFetchError`** naming the provider. Intentional gap — see §3.2 of plan / §6 of this doc. |

Returns `{ bytes: Uint8Array, name, mimeType, sizeBytes }` where
`sizeBytes` is the **actual post-fetch byte length**, not whatever
`ref.sizeBytes` claimed.

### 4.3 `cleanupExpiredFiles({ now?, limit? })` — reconciler

```
listExpiredWorkflowFiles({ now, limit })
  → for each row (sequential):
      supabase.storage.from("workflow-files").remove([row.storagePath])
        ├─ storage error → failed++; continue (next tick retries)
        └─ ok or already-gone → storageDeleted++
           → deleteWorkflowFileById(row.id)
              ├─ metadata error → failed++; continue
              └─ ok → metadataDeleted++
  → return { scanned, storageDeleted, metadataDeleted, failed, startedAt }
```

**Continue-on-failure** (not fail-fast). Per-object 5xx is common
enough that a single failure should not block the rest of the batch.
The next cron tick reads the same rows and retries — failures are
self-healing.

**Storage-first / metadata-second.** Deleting the metadata row before
the storage object orphans the bucket; the nightly reconciler couldn't
find the path again.

**Missing storage object = success.** Supabase's `remove([path])`
returns `{ data: [], error: null }` for paths that don't exist. We
count that as a successful storage delete so the metadata row is
reclaimed.

### 4.4 Cleanup cron — `/api/cron/cleanup-workflow-files`

- `GET` + `POST` (Vercel cron sends GET; curl uses POST).
- `requireCronAuth(request)` → bearer-token gate. Misconfig (`CRON_SECRET` unset) → 500. Missing/wrong token → 401.
- Authorized → `cleanupExpiredFiles()` → JSON `{ ok: true, scanned, storageDeleted, metadataDeleted, failed, startedAt }`.
- Failure → `console.error` structured log + `{ error: "Cleanup cron failed." }` status 500.
- **Counts only** — response payload contains no row ids, no storage paths, no user ids. Verified by a route-test that diffs the JSON keys against the expected set.

Production schedule wiring (daily) is an ops follow-up.

---

## 5. Security rules

| # | Rule | Where it lives |
|---|---|---|
| 1 | No bytes in outputs or logs. Action handlers MUST NOT emit `{ content / bytes / base64 / data: <blob> }` in their `output`. | Enforced structurally by `FileRefSchema.strict()` on each arm; `stageFileToStorage` test verifies no `console.*` call serializes the bytes payload. |
| 2 | No tokens in `FileRef.metadata` or in the URL itself. | Contract guidance (no machine enforcement). `metadata` is `Record<string, unknown>`; producers MUST NOT put bearer tokens, signed-URL secrets, or session ids in it. |
| 3 | No token / URL leakage in `fetchFileBytes` errors. | `FileFetchError.message` carries only the kind + HTTP status / transport error class. `UnsupportedProviderFetchError.message` names the provider but never the URL or token. Three explicit tests assert this. |
| 4 | `provider_url` fetch is intentionally unsupported in the generic path until safe per-provider auth helpers land. | `fetchFileBytes` throws `UnsupportedProviderFetchError`. Consumers must either stage the bytes first (`stageFileToStorage`) or call a provider-specific helper. |
| 5 | `signed_url` MUST be treated as sensitive: it is a bearer-equivalent secret. `expiresAt` SHOULD be populated when the producer knows the lifetime. URL never appears in errors / logs. | Contract + service convention. The `signed_url` arm exists specifically to preserve providers' short-lived auth-free links (OneDrive `@microsoft.graph.downloadUrl`, ~1h) — it is not a public-link surface. |
| 6 | Filenames are sanitized before path / API use. | `sanitizeFilename` strips `/`, `\`, ASCII control chars `0x00..0x1F` and `0x7F`, trims whitespace, falls back to `"file"` on empty, truncates to 512 chars. Applied at every `FileRef` build site (3 builders) and at `stageFileToStorage` entry. |
| 7 | Per-provider size guidance is **advisory** until Phase 7 quota enforcement. | `FILE_REF_SIZE_GUIDANCE` is published; `getFileRefSizeGuidance(provider)` returns the cap. `stageFileToStorage` emits a `console.warn` when exceeded but does NOT reject. Hard caps land in Phase 7. |
| 8 | The cleanup cron response is counts-only — no row ids / paths / user ids. | Route test diffs JSON keys; PII leakage at the cron monitor is structurally prevented. |
| 9 | RLS on `workflow_files` is SELECT-own; writes / deletes are service-role only. | Migration + repository contract; mirrors `workflow_runs`. |
| 10 | `workflow_files` storage objects are NOT publicly addressable by URL. | The `workflow-files` bucket is private; only the service-role client and (future) Supabase signed URLs reach the object. |

---

## 6. Accepted deviations / follow-ups

### Deviations from the original plan, all accepted

| Topic | Deviation | Rationale |
|---|---|---|
| `expiresAt` Zod format | `.datetime({ offset: true })` (accepts `+00:00` / `-05:00` style) instead of `.datetime()` (Z-only) | Providers emit offset-bearing timestamps; pure-Z parsing would reject legitimate input. Pure-Z still parses. |
| Optional diagnostic `provider` on `v2_storage` + `signed_url` | Added | Lets producers record the original issuer for debug / observability; consumers don't need it to fetch. |
| `metadata` Zod shape | Omit-only (no `null`) | Cleaner serialized output; matches how the builders drop `undefined`. |
| `run_id` FK | Dropped | Run row is written at completion; staging fires mid-execution. Reconciler-by-time covers orphans. |
| `storage_path` index | UNIQUE (not just an index) | Deterministic-path scheme; duplicate is a bug, not a retry. Loud failure at insert time. |
| `size_bytes` type | `bigint` (not `integer`) | Cheap headroom; no follow-up migration for future large-file work. |
| `workflowFiles` repository scope | Service-role only | No UI surface yet. SSR-cookie read variants are additive when needed. |
| `WORKFLOW_FILES_BUCKET` + `buildStoragePath` location | Co-located in `core/files/fetchFileBytes.ts` (not a separate file) | Tight file inventory; both helpers are pure (no I/O). |
| Size guidance | Advisory (warn-only) | Matches §11 #4 — Phase 7 is the hard-quota line. |
| `provider_url` generic fetch | Unsupported (`UnsupportedProviderFetchError`) | V2 has no cross-provider bearer-fetch utility yet; building one would broaden the slice past stage / fetch / cleanup. |
| End-of-run inline cleanup hook | Not wired | Engine finalization touch is outside the approved scope; nightly cron covers reclamation at `expires_at`. |

### Follow-ups (not part of P-S3)

| Follow-up | Owner / trigger |
|---|---|
| Per-provider `provider_url` fetch helpers (Slack, Drive, Gmail) | Land alongside the consumer slice (Slack 2.4 first). Each provider's helper wraps the existing token-lookup + `refreshAndRetry` path; `fetchFileBytes` can then accept a `providerFetcherRegistry` and route through it. |
| Drive + OneDrive `upload_file` accepting `FileRef` | §11 #6 — one PR per provider after P-S3 stabilizes. |
| End-of-run cleanup wired into engine finalization | Phase 2 follow-up. Reads `listWorkflowFilesForRun(runId)` and calls the cleanup loop inline. Saves users 24h of object lifetime when the run completes cleanly. |
| `vercel.json` cron schedule for `/api/cron/cleanup-workflow-files` | Ops follow-up; daily. Same gate as the existing cron routes. |
| Quotas + virus scanning + streaming + per-plan caps | Phase 7. |
| Lint rule against bytes-in-outputs (`file-output-no-bytes`) | §11 #8 — deferred. Re-evaluate only if a regression appears; the schema + handler convention are sufficient at land. |

### Slack 2.4 unblock

P-S3 is the live contract Slack 2.4 depends on. With P-S3 Commit 5
accepted, Slack 2.4 planning may begin. The dependency map from
P-S3 §8 is honored:

- `slack:upload_file` accepts a `file: FileRef` input.
- `slack:download_file` stages bytes via `stageFileToStorage` and emits `FileRef(kind=v2_storage)`.
- `slack:get_file_info` emits `FileRef(kind=provider_url)` for metadata-only reads.
- Optional `slack:fileUploaded` trigger may carry `FileRef(kind=provider_url)` on the event payload.

---

## 7. Durable rules added to CLAUDE.md

A new "Deep Gotcha" section was added to `CLAUDE.md` summarizing the
six durable file-output rules:

1. Action outputs never carry raw file bytes / base64.
2. File-like outputs use `FileRef`.
3. Download actions stage durable bytes to `v2_storage` unless intentionally returning metadata-only (`provider_url`).
4. Repositories stay metadata-only; Supabase storage access belongs in `services/files/`.
5. `provider_url` fetching requires explicit provider-safe auth handling; the generic `fetchFileBytes` path throws `UnsupportedProviderFetchError` for it.
6. The P-S3 cleanup cron response is counts-only — no paths, no user ids.

See `CLAUDE.md` § "File output contract (P-S3)" for the canonical
wording.

---

## 8. Gates run

| Gate | Result on each commit |
|---|---|
| `npx tsc --noEmit` | clean on every commit |
| `npm run lint` | clean on every commit |
| `npm run lint:structure` | every leaf folder ≤ 50 files |
| `npm run lint:migrations` | clean (RLS + ≥ 1 policy on `workflow_files`) |
| `npm test` | 520 → 524 → 525 → 529 suites; 4505 → 4570 → 4590 → 4619 tests, all green |
| `tests/structure/core-purity.test.ts` | still passes — `core/files/*` imports only from `@/contracts/*` and globals |

---

## 9. Open questions

None. All §11 decisions of the plan doc remain valid; nothing
implementation surfaced re-opened a closed decision.
