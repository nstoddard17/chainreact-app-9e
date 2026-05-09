import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import type { DriveItemCopyBody } from "./types";

/**
 * Wrapper for Microsoft Graph `POST /v1.0/me/drive/items/{id}/copy`.
 *
 * Used by:  `copy_item` action.
 *
 * Async-by-design: Graph returns 202 Accepted with a `Location` header
 * pointing at a "monitor URL" the caller can poll for completion. Slice
 * 8 returns the monitor URL synchronously and does NOT poll — V1's
 * polling loop is the V1 rot we explicitly fix (long-running waits
 * easily exceed serverless timeout for big copies).
 *
 * Conflict behavior defaults to `"fail"` (Q11). Override is exposed for
 * future actions that need rename-on-conflict.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (source or target parent missing).
 *   - generic `Error` on other failures with Graph error message surfaced.
 *   - generic `Error` if Graph returns 200/201 (sync completion is
 *     theoretically possible but Graph does not currently do this for
 *     /copy; the absence of the monitor URL is treated as an error so
 *     callers don't silently lose visibility into the operation).
 */

export interface DriveItemsCopyInput {
  accessToken: string;
  /** DriveItem id to copy. */
  itemId: string;
  /** Destination parent folder DriveItem id. Required. */
  targetParentItemId: string;
  /** Optional new name for the copy; omit to keep the source's name. */
  newName?: string;
  /** Defaults to `"fail"` (Slice 8 Q11). */
  conflictBehavior?: "rename" | "fail" | "replace";
}

export interface DriveItemsCopyResult {
  /** Always "pending" in Slice 8 (Graph returns 202 + Location). */
  status: "pending";
  /** Graph's monitor URL from the Location header. */
  monitorUrl: string;
}

export async function driveItemsCopy(
  input: DriveItemsCopyInput,
): Promise<DriveItemsCopyResult> {
  const url = `${graphApiBase()}/v1.0/me/drive/items/${encodeURIComponent(input.itemId)}/copy`;

  const body: DriveItemCopyBody = {
    parentReference: { id: input.targetParentItemId },
    "@microsoft.graph.conflictBehavior": input.conflictBehavior ?? "fail",
  };
  if (input.newName !== undefined) body.name = input.newName;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
      // Graph honors `Prefer: respond-async` for /copy and emits a
      // monitor URL in the Location header. Without the header Graph's
      // behavior is documented as "may complete synchronously" — Slice
      // 8 always wants async semantics so we always send the header.
      Prefer: "respond-async",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph me/drive/items/{id}/copy returned HTTP 401",
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
      `Microsoft Graph me/drive/items/{id}/copy failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  const monitorUrl = res.headers.get("Location") ?? res.headers.get("location");
  if (!monitorUrl) {
    throw new Error(
      "Microsoft Graph me/drive/items/{id}/copy succeeded but no Location header was returned (cannot surface monitor URL).",
    );
  }

  return { status: "pending", monitorUrl };
}
