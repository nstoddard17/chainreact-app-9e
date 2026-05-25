import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { driveApiBase } from "./_base";

/**
 * Wrapper for Google Drive `files.create` (metadata-only).
 *
 * Endpoint: POST {base}/drive/v3/files
 * Body:     application/json — { name, mimeType, parents? }
 * Used by:  createFolder action handler (mimeType =
 *           "application/vnd.google-apps.folder").
 *
 * For binary uploads (uploadFile action) use `filesCreateMultipart` —
 * Drive's metadata-only POST does NOT accept body content.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401 (refreshAndRetry contract).
 *   - generic `Error` on other 4xx/5xx with surfaced Google error message.
 */
export interface FilesCreateInput {
  accessToken: string;
  /** Drive file resource fields. mimeType + name required. */
  body: {
    name: string;
    mimeType: string;
    parents?: ReadonlyArray<string>;
    [k: string]: unknown;
  };
  /** Comma-separated `fields` mask; defaults to `id,name,mimeType,parents`. */
  fields?: string;
  /** Whether to support shared drives. Defaults to true (Slice 4 future-proof). */
  supportsAllDrives?: boolean;
}

export interface DriveFileResource {
  id: string;
  name?: string;
  mimeType?: string;
  parents?: ReadonlyArray<string>;
  webViewLink?: string;
  /** ISO 8601 timestamps Drive returns when requested via fields. */
  createdTime?: string;
  modifiedTime?: string;
  trashed?: boolean;
  [k: string]: unknown;
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
    // not JSON — keep HTTP status
  }
  return detail;
}

export async function filesCreate(
  input: FilesCreateInput,
): Promise<DriveFileResource> {
  const url = new URL(`${driveApiBase()}/drive/v3/files`);
  url.searchParams.set(
    "fields",
    input.fields ?? "id,name,mimeType,parents,webViewLink,createdTime",
  );
  url.searchParams.set(
    "supportsAllDrives",
    String(input.supportsAllDrives ?? true),
  );

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input.body),
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Google Drive files.create returned HTTP 401",
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Google Drive files.create failed: ${surfaceErrorDetail(text, res.status)}`,
    );
  }

  return (await res.json()) as DriveFileResource;
}
