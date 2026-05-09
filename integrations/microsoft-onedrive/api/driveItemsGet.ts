import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import type { DriveItem } from "./types";

/**
 * Wrapper for Microsoft Graph `GET /v1.0/me/drive/items/{id}`.
 *
 * Used by:
 *   - `get_file` action — primary fetch path.
 *   - `file_changed` trigger receiver (Slice 8 Commit 4) — id-fetch
 *     branch for notifications that carry a resource id.
 *
 * Returns the full DriveItem resource. Slice 8 includes
 * `@microsoft.graph.downloadUrl` in the response — Graph emits this
 * short-lived (~1h) signed URL for files; folders return without it.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (item deleted or user lacks access).
 *   - generic `Error` on other failures with Graph error message surfaced.
 */

export interface DriveItemsGetInput {
  accessToken: string;
  /** Graph DriveItem id. Caller does not URL-encode — wrapper handles it. */
  itemId: string;
}

export async function driveItemsGet(
  input: DriveItemsGetInput,
): Promise<DriveItem> {
  const url = `${graphApiBase()}/v1.0/me/drive/items/${encodeURIComponent(
    input.itemId,
  )}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph me/drive/items/{id} GET returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError(
      `driveItem ${input.itemId}`,
      surfaceGraphError(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph me/drive/items/{id} GET failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  return (await res.json()) as DriveItem;
}
