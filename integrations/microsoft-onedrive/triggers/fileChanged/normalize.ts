import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { DriveRootDeltaItem } from "../../api/driveRootDelta";
import type { DriveItem } from "../../api/types";

/**
 * Convert a Microsoft Graph DriveItem (from id-fetch path) or a delta
 * entry (from delta-fallback path) into the canonical V2 TriggerEvent
 * shape.
 *
 * Dedup key (`(provider, eventId)` for `webhook_event_dedup`):
 *   `${subscriptionId}:${itemId}:${lastModifiedDateTime}` (live items)
 *   `${subscriptionId}:${itemId}:deleted:${notificationOccurredAt}` (deletes)
 *
 * Slice 8 plan §"Dedup key shape":
 *   - `lastModifiedDateTime` discriminates per-version so successive
 *     edits to the same file each fire as distinct events without
 *     re-firing on duplicate notifications.
 *   - The id-fetch and delta-fallback paths produce the same key for
 *     the same change, so they collapse to one dedup row.
 *   - The deleted-item path includes a `:deleted:` infix and the
 *     receipt timestamp because Graph's delta-deleted entries carry
 *     no lastModifiedDateTime.
 *
 * Output payload mirrors Slice 8 plan §"Output shape":
 *   - itemId, kind ("file" | "folder" | null on deleted),
 *   - changeType ("updated" — Graph constant for drive subs),
 *   - source ("id-fetch" | "delta-fallback") for debugging,
 *   - name, size, mimeType, parentReference, webUrl, downloadUrl,
 *     createdDateTime, lastModifiedDateTime.
 */

export interface NormalizeContext {
  /** Graph subscription id from the notification envelope. */
  subscriptionId: string;
  /** ISO-8601 timestamp from the notification or our receipt time. */
  notificationOccurredAt: string;
  /** Account id (email) from the integration row this trigger fired against. */
  accountId: string;
  /** Which receive branch produced this event. Surfaces in payload. */
  source: "id-fetch" | "delta-fallback";
}

const CHANGE_TYPE = "updated";

function deriveKind(item: DriveItem): "file" | "folder" {
  if (item.folder) return "folder";
  if (item.file) return "file";
  // Defensive: Graph items SHOULD always have one of file / folder; if
  // neither is set treat as file so workflows still get a sensible
  // payload.
  return "file";
}

function buildEventId(ctx: NormalizeContext, itemId: string, lastModified: string | undefined): string {
  const versionDiscriminator = lastModified ?? ctx.notificationOccurredAt;
  return `${ctx.subscriptionId}:${itemId}:${versionDiscriminator}`;
}

export function normalize(
  item: DriveItem,
  context: NormalizeContext,
): TriggerEvent {
  const kind = deriveKind(item);
  return {
    provider: "microsoft-onedrive",
    eventType: "file_changed",
    eventId: buildEventId(context, item.id, item.lastModifiedDateTime),
    occurredAt:
      item.lastModifiedDateTime ??
      item.createdDateTime ??
      context.notificationOccurredAt,
    providerAccountId: context.accountId,
    payload: {
      itemId: item.id,
      kind,
      changeType: CHANGE_TYPE,
      source: context.source,
      name: item.name ?? null,
      size: item.size ?? null,
      mimeType: kind === "folder" ? null : item.file?.mimeType ?? null,
      parentReference: item.parentReference ?? null,
      webUrl: item.webUrl ?? null,
      downloadUrl: item["@microsoft.graph.downloadUrl"] ?? null,
      createdDateTime: item.createdDateTime ?? null,
      lastModifiedDateTime: item.lastModifiedDateTime ?? null,
    },
  };
}

/**
 * Minimal payload for items returned by /me/drive/root/delta with a
 * `deleted: { state }` facet OR id-fetch GET that returned 404 after a
 * notification.
 *
 * Stable shape — keeps every payload key from `normalize()` so workflow
 * authors don't have to special-case the missing-body path. Fields we
 * can't recover are `null`. `kind: null` and `name: null` are the
 * unambiguous signals "we know this changed but couldn't fetch the
 * body."
 */
export function normalizeDeleted(
  itemId: string,
  context: NormalizeContext,
): TriggerEvent {
  // Deleted-event dedup key includes a `:deleted:` infix + the
  // notification receipt timestamp so it doesn't collide with a prior
  // live event for the same itemId.
  const eventId = `${context.subscriptionId}:${itemId}:deleted:${context.notificationOccurredAt}`;
  return {
    provider: "microsoft-onedrive",
    eventType: "file_changed",
    eventId,
    occurredAt: context.notificationOccurredAt,
    providerAccountId: context.accountId,
    payload: {
      itemId,
      kind: null,
      changeType: CHANGE_TYPE,
      source: context.source,
      name: null,
      size: null,
      mimeType: null,
      parentReference: null,
      webUrl: null,
      downloadUrl: null,
      createdDateTime: null,
      lastModifiedDateTime: null,
      // Distinguishing flag: workflows can branch on
      // `{{trigger.deleted}}` instead of having to detect a null kind.
      deleted: true,
    },
  };
}

/**
 * Detect whether a delta-fallback entry represents a deleted item.
 * Graph marks deletes with a `deleted: { state: "deleted" }` facet.
 */
export function isDeletedDeltaItem(item: DriveRootDeltaItem): boolean {
  return Boolean(item.deleted);
}
