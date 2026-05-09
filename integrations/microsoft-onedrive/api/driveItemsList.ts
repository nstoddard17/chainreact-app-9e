import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import type { DriveItem } from "./types";

/**
 * Wrapper for Microsoft Graph `GET /v1.0/me/drive/items/{parentId}/children`
 * (and `GET /v1.0/me/drive/root/children` for the drive root).
 *
 * Used by:  `list_items` action.
 *
 * Routing: when `parentItemId` is omitted or `"root"`, hits
 * `/me/drive/root/children`; otherwise `/me/drive/items/{id}/children`.
 * Mirrors V1's `parentFolderId === 'root' || !parentFolderId` branch.
 *
 * Query options Slice 8 supports:
 *   - `top`: $top page size (Graph default 200, max 1000).
 *   - `orderBy`: $orderby clause, e.g. `"name asc"`, `"lastModifiedDateTime desc"`.
 *
 * Slice 8 surfaces `nextLink` (`@odata.nextLink`) for forward-compat
 * but does NOT auto-paginate. Workflow authors who need page 2+ chain
 * a follow-up node.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (parent missing or user lacks access).
 *   - generic `Error` on other failures with Graph error message surfaced.
 */

export interface DriveItemsListInput {
  accessToken: string;
  /** Omit / "root" → drive root. Otherwise the parent folder DriveItem id. */
  parentItemId?: string;
  top?: number;
  orderBy?: string;
}

export interface DriveItemsListResult {
  items: DriveItem[];
  nextLink: string | null;
}

export async function driveItemsList(
  input: DriveItemsListInput,
): Promise<DriveItemsListResult> {
  const isRoot = !input.parentItemId || input.parentItemId === "root";
  const path = isRoot
    ? `/v1.0/me/drive/root/children`
    : `/v1.0/me/drive/items/${encodeURIComponent(input.parentItemId!)}/children`;

  const url = new URL(`${graphApiBase()}${path}`);
  if (input.top !== undefined) {
    url.searchParams.set("$top", String(input.top));
  }
  if (input.orderBy !== undefined) {
    url.searchParams.set("$orderby", input.orderBy);
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph me/drive/.../children GET returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError(
      `driveItem children for ${input.parentItemId ?? "root"}`,
      surfaceGraphError(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph me/drive/.../children GET failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  const body = (await res.json()) as {
    value?: DriveItem[];
    "@odata.nextLink"?: string;
  };
  return {
    items: body.value ?? [],
    nextLink: body["@odata.nextLink"] ?? null,
  };
}
