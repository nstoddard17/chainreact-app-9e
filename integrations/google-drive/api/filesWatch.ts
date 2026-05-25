import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { driveApiBase } from "./_base";
import { NotFoundError } from "./errors";

/**
 * Wrapper for Google Drive `files.watch`.
 *
 * Endpoint: POST {base}/drive/v3/files/{fileId}/watch
 * Body:     application/json — { id, type: "web_hook", address, token }
 * Response: { kind, id, resourceId, resourceUri, expiration }
 *
 * Drive's watch model: `fileId` can be a specific folder/file id OR the
 * literal string "root" to watch the entire user-owned drive. The
 * `changes.list` delta returned later spans the WHOLE drive regardless;
 * the watch resource just controls notification routing. Folder filtering
 * happens in the trigger's `normalize.ts` if the workflow config narrows
 * it.
 *
 * `expiration` is milliseconds since epoch as a string. The activation /
 * renewal callers convert it to ISO 8601 before persisting.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401 (refreshAndRetry contract).
 *   - `NotFoundError` on HTTP 404 (file/folder id doesn't exist).
 *   - generic `Error` on other failures.
 */
export interface FilesWatchInput {
  accessToken: string;
  /** "root" for whole-drive, or a specific file/folder id. */
  fileId: string;
  channelId: string;
  channelToken: string;
  webhookAddress: string;
  /** Drive default is 1h for files.watch — pass a TTL to lengthen it. */
  ttlSeconds?: number;
  supportsAllDrives?: boolean;
}

export interface WatchResource {
  kind?: string;
  id: string;
  resourceId: string;
  resourceUri?: string;
  /** Milliseconds since epoch as a string. */
  expiration: string;
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

export async function filesWatch(
  input: FilesWatchInput,
): Promise<WatchResource> {
  const url = new URL(
    `${driveApiBase()}/drive/v3/files/${encodeURIComponent(input.fileId)}/watch`,
  );
  url.searchParams.set(
    "supportsAllDrives",
    String(input.supportsAllDrives ?? true),
  );

  const body: Record<string, unknown> = {
    id: input.channelId,
    type: "web_hook",
    address: input.webhookAddress,
    token: input.channelToken,
  };
  if (input.ttlSeconds !== undefined) {
    body.params = { ttl: String(input.ttlSeconds) };
  }

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Google Drive files.watch returned HTTP 401",
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
      `Google Drive files.watch failed: ${surfaceErrorDetail(text, res.status)}`,
    );
  }

  return (await res.json()) as WatchResource;
}
