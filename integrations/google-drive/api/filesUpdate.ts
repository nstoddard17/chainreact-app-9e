import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { driveApiBase } from "./_base";
import { NotFoundError } from "./errors";
import type { DriveFileResource } from "./filesCreate";

/**
 * Wrapper for Google Drive `files.update` (PATCH).
 *
 * Endpoint: PATCH {base}/drive/v3/files/{fileId}
 *           ?addParents=<csv>&removeParents=<csv>&supportsAllDrives=true
 * Body:     application/json — partial file resource (e.g. { trashed: true }
 *           for soft-delete, { name: "..." } for rename).
 *
 * Used by two Slice 4 actions:
 *   - moveFile passes `addParents=NEW` + `removeParents=OLD_CSV`.
 *   - deleteFile (when permanent=false) passes `body={trashed:true}`.
 *
 * The `addParents` / `removeParents` query params are mutually independent
 * — Drive accepts either alone or both together. The body is independently
 * optional; Drive accepts an empty `{}` body when only the parent params
 * are doing the work.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404.
 *   - generic `Error` on other failures.
 */
export interface FilesUpdateInput {
  accessToken: string;
  fileId: string;
  /** Body — partial file resource. Empty object is fine for parent-only moves. */
  body: Record<string, unknown>;
  /** Comma-separated parent ids to attach. */
  addParents?: string;
  /** Comma-separated parent ids to detach. */
  removeParents?: string;
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

export async function filesUpdate(
  input: FilesUpdateInput,
): Promise<DriveFileResource> {
  const url = new URL(
    `${driveApiBase()}/drive/v3/files/${encodeURIComponent(input.fileId)}`,
  );
  url.searchParams.set(
    "fields",
    input.fields ?? "id,name,mimeType,parents,trashed,modifiedTime",
  );
  url.searchParams.set(
    "supportsAllDrives",
    String(input.supportsAllDrives ?? true),
  );
  if (input.addParents) url.searchParams.set("addParents", input.addParents);
  if (input.removeParents) {
    url.searchParams.set("removeParents", input.removeParents);
  }

  const res = await fetch(url.toString(), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input.body),
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Google Drive files.update returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError(
      `file ${input.fileId}`,
      surfaceErrorDetail(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Google Drive files.update failed: ${surfaceErrorDetail(text, res.status)}`,
    );
  }

  return (await res.json()) as DriveFileResource;
}
