import { z } from "zod";

/**
 * Cross-layer file reference contract.
 *
 * Per docs/slices/p-s3-file-output-contract-plan.md §4:
 *   - Action / trigger outputs that reference a file MUST emit a `FileRef`
 *     and NEVER inline bytes / base64 / Buffer / stream content. The
 *     contract is the wall against `workflow_runs.steps` bloat.
 *   - One discriminator (`kind`) with three non-overlapping transport arms:
 *     `provider_url` (provider-issued, often token-protected URL — the
 *     consumer must attach the provider bearer when fetching), `v2_storage`
 *     (bytes staged in our Supabase `workflow-files` bucket; consumer
 *     fetches via the V2 storage helper), and `signed_url` (pre-signed
 *     URL usable without auth headers; expires at `expiresAt`).
 *   - Arms are mutually exclusive: each Zod arm is `.strict()` so a
 *     `provider_url` ref cannot smuggle a `storagePath`, and unknown
 *     fields (`content`, `bytes`, `base64`, `data`, …) are rejected at
 *     parse time.
 *
 * Construction:
 *   - Use the `fileRefFrom*` builders in `core/files/createFileRef.ts` —
 *     they sanitize file names and validate through this schema. Handlers
 *     SHOULD NOT construct `FileRef` object literals directly.
 *
 * Size guidance:
 *   - `core/files/limits.ts` publishes `FILE_REF_SIZE_GUIDANCE` per
 *     provider; not enforced at the contract level (providers enforce
 *     their own caps).
 */

const FILE_NAME_MAX = 512;

/**
 * Discriminator for how the file's bytes are retrievable.
 *
 *   - `provider_url`: provider-issued URL; consumer must attach the
 *                     provider's bearer token when fetching.
 *   - `v2_storage`  : bytes live in our Supabase `workflow-files` bucket
 *                     at `storagePath`; consumer fetches via the V2
 *                     storage helper (server-side auth).
 *   - `signed_url`  : pre-signed URL usable without auth headers
 *                     (Supabase signed URL OR provider public link).
 *                     `expiresAt` SHOULD be set when known.
 */
export const FileRefKindSchema = z.enum([
  "provider_url",
  "v2_storage",
  "signed_url",
]);
export type FileRefKind = z.infer<typeof FileRefKindSchema>;

const ProviderIdField = z
  .string()
  .regex(
    /^[a-z][a-z0-9_-]*$/,
    "Provider ids are lowercase, dash- or underscore-separated.",
  );

// Fields shared across all three arms. Inlined into each arm's
// .object() literal so the resulting schemas remain strict (any unknown
// key — `content`, `bytes`, `base64`, `data`, … — is rejected by Zod
// before the consumer ever sees the ref).
const sharedFields = {
  /** Stable display name (the file's own name). */
  name: z.string().min(1).max(FILE_NAME_MAX),
  /** RFC-1341 type; `application/octet-stream` if unknown. */
  mimeType: z.string().min(1),
  /** Byte length when known. Optional because providers don't always say. */
  sizeBytes: z.number().int().nonnegative().optional(),
  /** ISO-8601 expiry for time-limited refs. */
  expiresAt: z.string().datetime({ offset: true }).optional(),
  /**
   * Optional provider-side stable id (Slack `F123`, Drive `drive_file_id`,
   * …). Lets downstream actions on the same provider skip re-fetching
   * when they can pass the id directly.
   */
  providerFileId: z.string().min(1).optional(),
  /**
   * Free-form provider metadata. Producers MAY include extra fields
   * (createdTime, lastModified, webViewLink, …). Consumers MUST NOT
   * depend on any specific key — only the contract fields above are
   * guaranteed. Producers MUST NOT place tokens or secrets here.
   */
  metadata: z.record(z.string(), z.unknown()).optional(),
} as const;

const ProviderUrlFileRefSchema = z
  .object({
    kind: z.literal("provider_url"),
    ...sharedFields,
    /** URL issued by the provider. Consumer attaches the provider bearer. */
    url: z.string().url(),
    /** Issuer of `url` — determines which OAuth bearer to use. */
    provider: ProviderIdField,
  })
  .strict();

const V2StorageFileRefSchema = z
  .object({
    kind: z.literal("v2_storage"),
    ...sharedFields,
    /**
     * Path within the V2 `workflow-files` Supabase bucket. The
     * canonical scheme is `<userId>/<workflowId>/<runId>/<nodeId>/<filename>`
     * (enforced by the producer at stage time; not by this contract).
     */
    storagePath: z.string().min(1),
    /**
     * Optional: producer provider id (e.g. the action that staged the
     * bytes was Slack `download_file`). Diagnostic only — consumer
     * never needs a provider bearer for v2_storage refs.
     */
    provider: ProviderIdField.optional(),
  })
  .strict();

const SignedUrlFileRefSchema = z
  .object({
    kind: z.literal("signed_url"),
    ...sharedFields,
    /** Pre-signed URL. Fetchable without auth headers. */
    url: z.string().url(),
    /**
     * Optional: producer provider id (e.g. OneDrive's
     * `@microsoft.graph.downloadUrl`). Diagnostic only — consumer
     * never needs a provider bearer for signed_url refs.
     */
    provider: ProviderIdField.optional(),
  })
  .strict();

/**
 * Canonical FileRef shape. Discriminated by `kind`; each arm is
 * non-overlapping and strict (unknown fields rejected). Inline byte
 * representations (`content`, `bytes`, `base64`, `data`, Buffer-like
 * fields, stream-like fields) are rejected by construction.
 */
export const FileRefSchema = z.discriminatedUnion("kind", [
  ProviderUrlFileRefSchema,
  V2StorageFileRefSchema,
  SignedUrlFileRefSchema,
]);

export type FileRef = z.infer<typeof FileRefSchema>;
export type ProviderUrlFileRef = z.infer<typeof ProviderUrlFileRefSchema>;
export type V2StorageFileRef = z.infer<typeof V2StorageFileRefSchema>;
export type SignedUrlFileRef = z.infer<typeof SignedUrlFileRefSchema>;

/**
 * Public copy of the file-name length cap; consumers and tests reference
 * the same constant as the schema.
 */
export const FILE_REF_NAME_MAX_LENGTH = FILE_NAME_MAX;
