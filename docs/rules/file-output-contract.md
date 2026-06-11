# File Output Contract (P-S3)

Durable cross-cutting platform rule. Every provider / handler / repository / service
that moves files MUST follow this. Promoted to `docs/rules/` from the CLAUDE.md
"Deep Gotchas" summary on 2026-06-10 (curation Phase 2c) because it is a standing
contract, not a historical outcome.

**Full design + the 10 numbered security rules:** [`../slices/phase-1/p-s3-file-output-contract-outcomes.md`](../slices/phase-1/p-s3-file-output-contract-outcomes.md).

## Six durable rules

1. **Action outputs never carry raw file bytes or base64.** No `content`, `bytes`, `base64`, or `data` keys for file content. The Zod `FileRefSchema` is `.strict()` per arm — those keys are rejected at parse time. The runs table is the audit/debug surface; it MUST stay free of binary blobs.
2. **File-like outputs use `FileRef`.** Constructed via the builders in [`core/files/createFileRef.ts`](../../core/files/createFileRef.ts) (`fileRefFromProviderUrl`, `fileRefFromStoragePath`, `fileRefFromSignedUrl`), never as object literals. `FileRefKind` is closed: `"provider_url"`, `"v2_storage"`, `"signed_url"`. No inline arm — there is no `kind` value that legitimizes inline bytes.
3. **Download actions stage durable bytes to `v2_storage`** via [`services/files/stageFileToStorage.ts`](../../services/files/stageFileToStorage.ts) unless they are intentionally returning metadata-only (`provider_url` for unchanged provider URLs, `signed_url` for auth-free links). Staging is the default because the runs table outlives provider URL TTLs and cross-provider chains need durable bytes.
4. **Repositories stay metadata-only; Supabase storage access lives in `services/files/`.** [`repositories/workflowFiles.ts`](../../repositories/workflowFiles.ts) does CRUD over `public.workflow_files` rows and nothing else — zero `supabase.storage.*` access. The Commit 3 `storage isolation invariant` test enforces this with a mock client whose `.storage` field is `undefined`. New file flows put their object I/O in `services/files/`.
5. **`provider_url` fetching requires explicit provider-safe auth handling.** [`core/files/fetchFileBytes.ts`](../../core/files/fetchFileBytes.ts) deliberately throws `UnsupportedProviderFetchError` for `kind=provider_url`. Per-provider helpers land alongside the consumer slice (Slack 2.4 download is the first). Do NOT implement a generic "fetch any provider URL with whatever token I can find" path — token lookup, scope checking, and refresh handling are provider-specific.
6. **The cleanup cron response is counts-only.** [`/api/cron/cleanup-workflow-files`](../../app/api/cron/cleanup-workflow-files/route.ts) MUST NOT expose row ids, storage paths, or user ids — cron monitors are operational surfaces that would otherwise leak workflow / user metadata. The response shape is `{ ok, scanned, storageDeleted, metadataDeleted, failed, startedAt }`; the route test diffs JSON keys against this set.

## Companion rules

- The `workflow-files` Supabase storage bucket is created **out-of-band** (ops); SQL migrations do not poke at `storage.buckets`. The bucket name + path scheme `<userId>/<workflowId>/<runId>/<nodeId>/<filename>` are pinned in [`core/files/fetchFileBytes.ts::WORKFLOW_FILES_BUCKET`](../../core/files/fetchFileBytes.ts) and the migration header.
- `signed_url` refs are bearer-equivalent secrets. Producers MUST set `expiresAt` when the lifetime is known. The URL never appears in logs or error messages — `fetchFileBytes` strips it from `FileFetchError`.
- Filenames are sanitized via [`core/files/sanitizeFilename.ts`](../../core/files/sanitizeFilename.ts) before any storage path or provider API use. Always.
- Per-provider size guidance ([`core/files/limits.ts`](../../core/files/limits.ts)) is **advisory** — Phase 7 will add hard quotas. Stage warns when exceeded but does not reject.
