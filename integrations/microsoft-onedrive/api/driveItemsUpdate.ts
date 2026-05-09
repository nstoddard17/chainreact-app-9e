import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import type { DriveItem, DriveItemPatchBody } from "./types";

/**
 * Wrapper for Microsoft Graph `PATCH /v1.0/me/drive/items/{id}`.
 *
 * Used by:  `move_item` action (move + rename in one PATCH; Graph
 *           supports both fields in the same request).
 *
 * Slice 8 sends ONLY the fields that change (no `parentReference` →
 * Graph keeps the current parent; no `name` → Graph keeps the current
 * name). At least one of the two MUST be supplied — enforced by the
 * action schema's cross-field refine, not at this layer.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (item missing or target parent missing).
 *   - generic `Error` on other failures with Graph error message surfaced.
 */

export interface DriveItemsUpdateInput {
  accessToken: string;
  itemId: string;
  /** New parent folder DriveItem id. Omit to keep current parent. */
  targetParentItemId?: string;
  /** New name. Omit to keep current name. */
  newName?: string;
}

export async function driveItemsUpdate(
  input: DriveItemsUpdateInput,
): Promise<DriveItem> {
  const url = `${graphApiBase()}/v1.0/me/drive/items/${encodeURIComponent(input.itemId)}`;

  const body: DriveItemPatchBody = {};
  if (input.newName !== undefined) body.name = input.newName;
  if (input.targetParentItemId !== undefined) {
    body.parentReference = { id: input.targetParentItemId };
  }

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph me/drive/items/{id} PATCH returned HTTP 401",
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
      `Microsoft Graph me/drive/items/{id} PATCH failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  return (await res.json()) as DriveItem;
}
