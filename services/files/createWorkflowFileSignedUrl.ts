/**
 * Create a Supabase signed URL for an object in the `workflow-files`
 * bucket.
 *
 * Used by action handlers that need to hand a `FileRef(kind=v2_storage)`
 * to an external service that fetches files by URL (Airtable's
 * attachment-field write, future Notion `external` file blocks,
 * Stripe receipt sharing). The signed URL is fetchable without auth
 * headers and expires at `expiresIn` seconds — bearer-equivalent secret
 * per the P-S3 contract (`contracts/file.ts` SignedUrlFileRef
 * documentation).
 *
 * Service-role: every Supabase call runs with no user session.
 *
 * Security:
 *   - Callers MUST NOT log the returned URL or include it in action
 *     outputs / `workflow_runs.steps`.
 *   - The signed URL grants read access to the file's bytes; treat it
 *     like a bearer token.
 *   - `expiresIn` should be short enough to limit replay if the URL
 *     leaks (default 600s = 10 min, which Airtable / Notion finish
 *     ingesting well within).
 *
 * Failure mode:
 *   - Supabase storage `createSignedUrl` failure throws `Error` with a
 *     message that does NOT include the storage path / signed URL.
 */

import { getServiceRoleClient } from "@/repositories/supabase/serviceRoleClient";
import { WORKFLOW_FILES_BUCKET } from "@/core/files/fetchFileBytes";

export interface CreateWorkflowFileSignedUrlInput {
  /** Path within the `workflow-files` bucket. */
  storagePath: string;
  /**
   * Signed URL TTL in seconds. Default 600 (10 min). Should be short
   * enough to limit replay if the URL leaks but long enough that the
   * downstream provider finishes ingesting the file before expiry.
   */
  expiresIn?: number;
  /**
   * Audit reason — surfaces in the service-role client's debug logs.
   * Pass `"<provider>:<action> run=<runId> node=<nodeId>"` shape.
   */
  reason: string;
}

export interface CreateWorkflowFileSignedUrlResult {
  /** Pre-signed URL fetchable without auth headers. Bearer-equivalent. */
  signedUrl: string;
  /** Wall-clock ISO-8601 expiry, derived from `Date.now() + expiresIn`. */
  expiresAt: string;
}

const DEFAULT_EXPIRES_IN_SECONDS = 600;

export async function createWorkflowFileSignedUrl(
  input: CreateWorkflowFileSignedUrlInput,
): Promise<CreateWorkflowFileSignedUrlResult> {
  const expiresIn = input.expiresIn ?? DEFAULT_EXPIRES_IN_SECONDS;
  const supabase = getServiceRoleClient(input.reason);
  const { data, error } = await supabase.storage
    .from(WORKFLOW_FILES_BUCKET)
    .createSignedUrl(input.storagePath, expiresIn);
  if (error || !data?.signedUrl) {
    // Generic message — never include storagePath or any partial URL.
    throw new Error(
      `workflow-files signed URL creation failed: ${error?.message ?? "no signed URL"}`,
    );
  }
  return {
    signedUrl: data.signedUrl,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}
