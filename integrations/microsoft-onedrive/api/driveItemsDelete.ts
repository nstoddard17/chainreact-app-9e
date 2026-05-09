import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

/**
 * Wrapper for Microsoft Graph `DELETE /v1.0/me/drive/items/{id}`.
 *
 * Used by:  `delete_item` action.
 *
 * Graph returns 204 No Content on success. The `delete_item` handler
 * catches `NotFoundError` and returns `{deleted: true,
 * alreadyMissing: true}` so retries after a successful first call
 * succeed without a second API call (mirrors Slice 7 `delete_event`'s
 * idempotency contract).
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (item already gone).
 *   - generic `Error` on other failures with Graph error message surfaced.
 */

export interface DriveItemsDeleteInput {
  accessToken: string;
  itemId: string;
}

export async function driveItemsDelete(
  input: DriveItemsDeleteInput,
): Promise<void> {
  const url = `${graphApiBase()}/v1.0/me/drive/items/${encodeURIComponent(input.itemId)}`;

  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph me/drive/items/{id} DELETE returned HTTP 401",
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
      `Microsoft Graph me/drive/items/{id} DELETE failed: ${surfaceGraphError(text, res.status)}`,
    );
  }
}
