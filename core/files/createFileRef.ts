/**
 * FileRef builder helpers — the recommended construction path.
 *
 * Per docs/slices/p-s3-file-output-contract-plan.md §4:
 *   Handlers SHOULD construct `FileRef` values through these builders
 *   instead of object literals. The builders sanitize the file name and
 *   validate through `FileRefSchema`, which enforces the no-inline-bytes
 *   invariant (strict arms reject `content`, `bytes`, `base64`, …) and
 *   per-arm required fields.
 *
 * Three constructors map 1:1 to the FileRef arms:
 *   - `fileRefFromProviderUrl`  → `kind: "provider_url"`
 *   - `fileRefFromStoragePath`  → `kind: "v2_storage"`
 *   - `fileRefFromSignedUrl`    → `kind: "signed_url"`
 *
 * Throws `z.ZodError` on invalid input (e.g. empty file name after
 * sanitization is impossible because the sanitizer guarantees ≥ 1 char;
 * but invalid URLs, malformed provider ids, negative sizes, etc. all
 * surface as validation errors).
 *
 * Producers MUST NOT place tokens or secrets in `metadata`. The contract
 * accepts a free-form record, but the runtime treats `metadata` as
 * serialized into `workflow_runs.steps` and visible to anyone with read
 * access to the run.
 */

import {
  FileRefSchema,
  type FileRef,
  type ProviderUrlFileRef,
  type V2StorageFileRef,
  type SignedUrlFileRef,
} from "@/contracts/file";
import { sanitizeFilename } from "@/core/files/sanitizeFilename";

interface SharedInput {
  name: string;
  mimeType: string;
  sizeBytes?: number;
  expiresAt?: string;
  providerFileId?: string;
  metadata?: Record<string, unknown>;
}

interface ProviderUrlInput extends SharedInput {
  url: string;
  provider: string;
}

interface StoragePathInput extends SharedInput {
  storagePath: string;
  /**
   * Optional diagnostic — the provider whose download was staged into
   * V2 storage. Consumers don't need this to fetch (v2_storage refs are
   * resolved server-side via the V2 storage helper).
   */
  provider?: string;
}

interface SignedUrlInput extends SharedInput {
  url: string;
  /**
   * Optional diagnostic — the issuer of the signed URL (e.g.
   * `"microsoft-onedrive"` for Graph's `@microsoft.graph.downloadUrl`).
   * Consumers don't need this to fetch.
   */
  provider?: string;
}

/**
 * Drop keys whose value is `undefined`. `FileRefSchema.strict()` accepts
 * absent keys but rejects unknown keys; spreading raw input would
 * surface `undefined` as a present-but-undefined property, which Zod
 * treats as `undefined` (fine) — this normalization just keeps the
 * resulting object minimal and identical regardless of caller style.
 */
function omitUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(obj) as Array<keyof T>) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
}

export function fileRefFromProviderUrl(
  input: ProviderUrlInput,
): ProviderUrlFileRef {
  const candidate = omitUndefined({
    kind: "provider_url" as const,
    name: sanitizeFilename(input.name),
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    url: input.url,
    provider: input.provider,
    expiresAt: input.expiresAt,
    providerFileId: input.providerFileId,
    metadata: input.metadata,
  });
  const parsed = FileRefSchema.parse(candidate) as FileRef;
  // Discriminated parse narrows by `kind`; the cast is exact because we
  // set the literal above.
  return parsed as ProviderUrlFileRef;
}

export function fileRefFromStoragePath(
  input: StoragePathInput,
): V2StorageFileRef {
  const candidate = omitUndefined({
    kind: "v2_storage" as const,
    name: sanitizeFilename(input.name),
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    storagePath: input.storagePath,
    provider: input.provider,
    expiresAt: input.expiresAt,
    providerFileId: input.providerFileId,
    metadata: input.metadata,
  });
  const parsed = FileRefSchema.parse(candidate) as FileRef;
  return parsed as V2StorageFileRef;
}

export function fileRefFromSignedUrl(
  input: SignedUrlInput,
): SignedUrlFileRef {
  const candidate = omitUndefined({
    kind: "signed_url" as const,
    name: sanitizeFilename(input.name),
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    url: input.url,
    provider: input.provider,
    expiresAt: input.expiresAt,
    providerFileId: input.providerFileId,
    metadata: input.metadata,
  });
  const parsed = FileRefSchema.parse(candidate) as FileRef;
  return parsed as SignedUrlFileRef;
}
