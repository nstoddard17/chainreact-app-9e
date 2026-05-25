import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { driveApiBase } from "./_base";
import { NotFoundError } from "./errors";
import type { DriveFileResource } from "./filesCreate";

/**
 * Wrapper for Google Drive `files.get` (metadata only).
 *
 * Endpoint: GET {base}/drive/v3/files/{fileId}
 * Used by:  moveFile (to read existing parents before PATCHing
 *           addParents+removeParents — Drive's move semantics require
 *           knowing both ends).
 *
 * Binary download (`alt=media`) is OUT OF SCOPE for Slice 4 Batch 1.
 * This wrapper is metadata-only; callers must NOT pass alt=media here.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404.
 *   - generic `Error` on other failures.
 */
export interface FilesGetInput {
  accessToken: string;
  fileId: string;
  /** Defaults to `id,name,mimeType,parents`. */
  fields?: string;
  supportsAllDrives?: boolean;
}

interface DriveErrorPayload {
  error?: { code?: number; message?: string; status?: string };
}

function surfaceErrorDetail(text: string, status: number): string {
  let detail = `HTTP ${status}`;
  try {
    const parsed = JSON.parse(text) as DriveErrorPayload;
    if (parsed?.error?.message) detail = parsed.error.message;
    else if (parsed?.error?.status) detail = parsed.error.status;
  } catch {
    // not JSON
  }
  return detail;
}

export async function filesGet(
  input: FilesGetInput,
): Promise<DriveFileResource> {
  const url = new URL(
    `${driveApiBase()}/drive/v3/files/${encodeURIComponent(input.fileId)}`,
  );
  url.searchParams.set("fields", input.fields ?? "id,name,mimeType,parents");
  url.searchParams.set(
    "supportsAllDrives",
    String(input.supportsAllDrives ?? true),
  );

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Google Drive files.get returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError(`file ${input.fileId}`, surfaceErrorDetail(text, 404));
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Google Drive files.get failed: ${surfaceErrorDetail(text, res.status)}`,
    );
  }

  return (await res.json()) as DriveFileResource;
}
