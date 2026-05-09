import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import { surfaceGraphError } from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import type { DriveItem } from "./types";

/**
 * Wrapper for Microsoft Graph `GET /v1.0/me/drive/root/delta`.
 *
 * Used by:
 *   - `file_changed` trigger activate hook (initial cursor walk).
 *   - `file_changed` webhook receive's delta-fallback branch (when a
 *     notification arrives without a usable item id).
 *
 * Two call modes:
 *   1. Initial baseline — caller passes no `deltaToken`; wrapper hits
 *      `/me/drive/root/delta?$top=1` and walks `@odata.nextLink` to the
 *      terminal `@odata.deltaLink`. Caller persists the deltaLink as
 *      the baseline cursor; no items returned.
 *   2. Incremental delta — caller passes the persisted `deltaLink` URL
 *      verbatim as `nextLink`; wrapper fetches that URL, paginates
 *      through `nextLink` as needed, and returns all items + the new
 *      terminal `deltaLink`.
 *
 * Why we accept a full URL rather than just a token: Graph's delta link
 * carries multiple opaque query params (`token`, sometimes `select`),
 * and Microsoft documentation explicitly states callers should treat
 * the delta link as opaque and use it verbatim. Persisting the full URL
 * is forward-compatible with any future Graph delta query params.
 *
 * Deleted items appear in the value array with a `deleted: { state }`
 * facet. Slice 8 emits these as separate trigger events with a
 * minimal payload (mirrors Slice 7 calendar's `normalizeDeleted`).
 *
 * Note: Graph's delta endpoint does NOT support `$top` AND `$select`
 * combined; Slice 8 uses neither for incremental calls (we want the
 * full DriveItem on each change). The initial-baseline call uses
 * `$top=1` to fast-walk to the terminal cursor without buffering items.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - generic `Error` on other failures with Graph error message
 *     surfaced.
 *
 * Note on 410 Gone: Graph rotates delta tokens after extended
 * inactivity; the response is HTTP 410 with code `resyncRequired`.
 * Slice 8 surfaces this as a generic Error for now — callers re-
 * baseline on receipt. A typed `DeltaTokenExpiredError` can be added
 * later if multiple call sites need to discriminate.
 */

const BASE_PATH = "/v1.0/me/drive/root/delta";

interface DeltaPageResponse {
  value?: ReadonlyArray<DriveItem & { deleted?: { state?: string } }>;
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
}

export interface DriveRootDeltaInput {
  accessToken: string;
  /**
   * Verbatim delta cursor URL to fetch. Pass the persisted `deltaLink`
   * here. Omit / undefined / empty → initial-baseline mode (walks from
   * the start with `$top=1` and returns no items, just the baseline
   * cursor).
   */
  nextLink?: string;
}

export interface DriveRootDeltaItem extends DriveItem {
  /** Present iff Graph reports the item as deleted. */
  deleted?: { state?: string };
}

export interface DriveRootDeltaResult {
  /** Items returned across all paginated pages of this delta call. */
  items: DriveRootDeltaItem[];
  /**
   * Terminal `@odata.deltaLink` URL — caller persists for the next
   * incremental call. Always present on a successful response.
   */
  deltaLink: string;
}

export async function driveRootDelta(
  input: DriveRootDeltaInput,
): Promise<DriveRootDeltaResult> {
  const initial = !input.nextLink;
  let url: string;
  if (initial) {
    // Initial baseline: $top=1 fast-walks to the terminal deltaLink
    // without buffering items.
    const u = new URL(`${graphApiBase()}${BASE_PATH}`);
    u.searchParams.set("$top", "1");
    url = u.toString();
  } else {
    url = input.nextLink!;
  }

  const items: DriveRootDeltaItem[] = [];
  let pages = 0;
  while (true) {
    if (++pages > 100) {
      throw new Error(
        "microsoft-onedrive driveRootDelta: paginated for too long.",
      );
    }
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${input.accessToken}` },
    });

    if (res.status === 401) {
      throw new Unauthorized401Error(
        "Microsoft Graph me/drive/root/delta returned HTTP 401",
      );
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Microsoft Graph me/drive/root/delta failed: ${surfaceGraphError(text, res.status)}`,
      );
    }

    const body = (await res.json()) as DeltaPageResponse;
    if (!initial && body.value) {
      for (const item of body.value) items.push(item);
    }

    if (body["@odata.nextLink"]) {
      url = body["@odata.nextLink"];
      continue;
    }
    if (body["@odata.deltaLink"]) {
      return { items, deltaLink: body["@odata.deltaLink"] };
    }
    // Defensive: Graph should always return one of nextLink or deltaLink.
    // If neither is present, treat as terminal with an empty cursor —
    // surface as an error so the caller doesn't silently lose the
    // baseline cursor.
    throw new Error(
      "microsoft-onedrive driveRootDelta: response missing both @odata.nextLink and @odata.deltaLink.",
    );
  }
}
