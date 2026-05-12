/**
 * Pure file-fetch helper for FileRef consumers.
 *
 * Per docs/slices/p-s3-file-output-contract-plan.md §4 / §7:
 *   - Action handlers that take a `FileRef` as input call this helper to
 *     turn the ref back into bytes. The handler streams the result into
 *     the provider upload API of its choice.
 *   - `v2_storage` and `signed_url` arms are fully supported in P-S3.
 *   - `provider_url` is *intentionally* unsupported in P-S3 Commit 4 —
 *     V2 has no cross-provider bearer-fetch utility yet, and inventing
 *     one here would broaden the slice past stage/fetch/cleanup. Callers
 *     that hit a `provider_url` ref must either:
 *       (a) stage the bytes through `stageFileToStorage` first (turn the
 *           ref into `v2_storage` and call this helper again), or
 *       (b) catch `UnsupportedProviderFetchError` and route through a
 *           provider-specific download path.
 *     Per-provider helpers land as follow-up Phase 2 work (Drive /
 *     OneDrive / Slack download).
 *
 * Living in `core/` because the dispatch logic is pure (a switch on
 * `ref.kind`) and the Supabase storage call is injected through a small
 * adapter interface. Tests never touch the network. Per
 * `tests/structure/core-purity.test.ts`: this module imports only from
 * `@/contracts/*` and third-party globals (`fetch`).
 */

import type { FileRef } from "@/contracts/file";

/**
 * Canonical Supabase storage bucket name. Pinned by P-S3 §11 decision
 * #5. The migration header pins this same value; any change is a
 * coordinated ops + migration update.
 */
export const WORKFLOW_FILES_BUCKET = "workflow-files";

/**
 * Build the canonical storage path for a staged file:
 *   `<userId>/<workflowId>/<runId>/<nodeId>/<filename>`
 *
 * Pure — does not touch the network. Used by the stage service to put
 * an object in the bucket and by the metadata row insert. The caller
 * MUST sanitize `fileName` before passing it in (the stage service
 * does this via `sanitizeFilename`).
 */
export function buildStoragePath(input: {
  userId: string;
  workflowId: string;
  runId: string;
  nodeId: string;
  fileName: string;
}): string {
  return `${input.userId}/${input.workflowId}/${input.runId}/${input.nodeId}/${input.fileName}`;
}

/**
 * Bucket-scoped storage adapter for `v2_storage` fetches. Stays narrow
 * — `download(path)` is the only operation `fetchFileBytes` performs.
 * The stage / cleanup services use the full Supabase storage SDK
 * directly because they live in `services/` and can. Keeping the
 * adapter narrow here means tests don't need to stub the entire
 * `supabase.storage` surface.
 */
export interface WorkflowFilesStorageAdapter {
  /**
   * Download the object at `storagePath` from the workflow-files
   * bucket. Implementations throw on transport errors and on
   * permission denials — they MUST NOT include any token or signed
   * URL in the thrown error message.
   */
  download(storagePath: string): Promise<Uint8Array>;
}

export interface FetchFileBytesOptions {
  /**
   * Required for `v2_storage` refs; ignored for the other arms. Callers
   * in `services/` build this from the service-role Supabase client.
   */
  storage?: WorkflowFilesStorageAdapter;
}

export interface FetchFileBytesResult {
  bytes: Uint8Array;
  name: string;
  mimeType: string;
  /** Actual fetched byte length. Always populated post-fetch. */
  sizeBytes: number;
}

/**
 * Thrown when a `provider_url` ref names a provider that has no
 * configured download helper yet. Distinct error class so callers can
 * react (e.g. stage the bytes through a per-provider helper, then
 * call `fetchFileBytes` again).
 */
export class UnsupportedProviderFetchError extends Error {
  readonly provider: string;
  constructor(provider: string) {
    super(
      `fetchFileBytes: 'provider_url' for provider '${provider}' is not supported yet. Stage the bytes through services/files/stageFileToStorage or use a 'signed_url' ref.`,
    );
    this.name = "UnsupportedProviderFetchError";
    this.provider = provider;
  }
}

/**
 * Generic transport / decoding failure. Never carries the source URL,
 * a Supabase signed URL, or any token material in its message — the
 * `kind` discriminator is enough for callers to know which arm failed.
 */
export class FileFetchError extends Error {
  readonly kind: FileRef["kind"];
  constructor(kind: FileRef["kind"], detail: string) {
    super(`fetchFileBytes (kind=${kind}) failed: ${detail}`);
    this.name = "FileFetchError";
    this.kind = kind;
  }
}

/**
 * Resolve a `FileRef` into raw bytes plus the canonical name + MIME
 * type. Pure dispatch on `ref.kind`; never inspects `metadata` or
 * `providerFileId`.
 */
export async function fetchFileBytes(
  ref: FileRef,
  options: FetchFileBytesOptions = {},
): Promise<FetchFileBytesResult> {
  const bytes = await fetchBytesByKind(ref, options);
  return {
    bytes,
    name: ref.name,
    mimeType: ref.mimeType,
    sizeBytes: bytes.byteLength,
  };
}

async function fetchBytesByKind(
  ref: FileRef,
  options: FetchFileBytesOptions,
): Promise<Uint8Array> {
  switch (ref.kind) {
    case "v2_storage": {
      const storage = options.storage;
      if (!storage) {
        throw new FileFetchError(
          "v2_storage",
          "no storage adapter supplied — caller must pass `options.storage`.",
        );
      }
      try {
        return await storage.download(ref.storagePath);
      } catch (err) {
        // The adapter contract forbids including signed URLs / tokens
        // in error messages; we forward the message as-is.
        throw new FileFetchError("v2_storage", (err as Error).message);
      }
    }
    case "signed_url": {
      return fetchFromUrl(ref.url, "signed_url");
    }
    case "provider_url": {
      // Intentional gap — see file header.
      throw new UnsupportedProviderFetchError(ref.provider);
    }
  }
}

async function fetchFromUrl(
  url: string,
  kind: FileRef["kind"],
): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    // Network-level failure — never include the URL in the message
    // (signed URLs are secret-equivalent).
    throw new FileFetchError(kind, `network error: ${(err as Error).message}`);
  }
  if (!response.ok) {
    throw new FileFetchError(kind, `HTTP ${response.status}`);
  }
  const buf = await response.arrayBuffer();
  return new Uint8Array(buf);
}
