import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import type { DriveItem, DriveItemCreateFolderBody } from "./types";

/**
 * Wrapper for Microsoft Graph `POST /v1.0/me/drive/items/{parentId}/children`
 * (and `POST /v1.0/me/drive/root/children` for the drive root) — creating
 * a new folder.
 *
 * Used by:  `create_folder` action.
 *
 * Slice 8 sets `@microsoft.graph.conflictBehavior: "fail"` per Q11 — if
 * a folder of the same name already exists, Graph returns 409 and the
 * wrapper surfaces a clear error (no silent overwrite or rename). V1
 * defaulted to "rename"; V2 makes the contract explicit and predictable.
 *
 * Routing matches `driveItemsList`: when `parentItemId` is omitted or
 * `"root"`, hits `/me/drive/root/children`; otherwise
 * `/me/drive/items/{id}/children`.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (parent missing).
 *   - generic `Error` on other failures (409 conflict surfaced as
 *     "nameAlreadyExists" / similar Graph error code in the message).
 */

export interface DriveItemsCreateFolderInput {
  accessToken: string;
  /** Omit / "root" → drive root. Otherwise parent folder DriveItem id. */
  parentItemId?: string;
  name: string;
  /**
   * Optional override for `@microsoft.graph.conflictBehavior`. Defaults
   * to `"fail"` (Slice 8 Q11). Override is NOT exposed by the action
   * schema — it's here so future actions / triggers that legitimately
   * need rename-on-conflict can reuse the wrapper.
   */
  conflictBehavior?: "rename" | "fail" | "replace";
}

export async function driveItemsCreateFolder(
  input: DriveItemsCreateFolderInput,
): Promise<DriveItem> {
  const isRoot = !input.parentItemId || input.parentItemId === "root";
  const path = isRoot
    ? `/v1.0/me/drive/root/children`
    : `/v1.0/me/drive/items/${encodeURIComponent(input.parentItemId!)}/children`;
  const url = `${graphApiBase()}${path}`;

  const body: DriveItemCreateFolderBody = {
    name: input.name,
    folder: {},
    "@microsoft.graph.conflictBehavior": input.conflictBehavior ?? "fail",
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph me/drive/.../children POST returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError(
      `driveItem parent ${input.parentItemId ?? "root"}`,
      surfaceGraphError(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph me/drive/.../children POST failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  return (await res.json()) as DriveItem;
}
