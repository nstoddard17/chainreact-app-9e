import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { driveApiBase } from "./_base";
import { NotFoundError } from "./errors";

/**
 * Wrapper for Google Drive `files.delete` (permanent).
 *
 * Endpoint: DELETE {base}/drive/v3/files/{fileId}?supportsAllDrives=true
 * Used by:  deleteFile action handler when `permanent: true`.
 *
 * For trash (soft delete), the action uses `filesUpdate` with body
 * `{ trashed: true }` instead — Drive v3 has no `/trash` endpoint.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (caller may treat as already-deleted).
 *   - generic `Error` on other failures.
 */
export interface FilesDeleteInput {
  accessToken: string;
  fileId: string;
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

export async function filesDelete(input: FilesDeleteInput): Promise<void> {
  const url = new URL(
    `${driveApiBase()}/drive/v3/files/${encodeURIComponent(input.fileId)}`,
  );
  url.searchParams.set(
    "supportsAllDrives",
    String(input.supportsAllDrives ?? true),
  );

  const res = await fetch(url.toString(), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Google Drive files.delete returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError(
      `file ${input.fileId}`,
      surfaceErrorDetail(text, 404),
    );
  }
  // 204 No Content is the success case.
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(
      `Google Drive files.delete failed: ${surfaceErrorDetail(text, res.status)}`,
    );
  }
}
