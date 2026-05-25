import type { TriggerEvent } from "@/contracts/triggerEvent";
import {
  getBoardId,
  getCreatorId,
  getTimestamp,
  pickIdString,
  pickString,
  type MondayEventObject,
} from "../_shared/fields";

/**
 * Normalize a Monday `create_subitem` webhook event into V2's canonical
 * `TriggerEvent` — Slice 3.MONDAY-7.
 *
 * Canonical payload (MONDAY-7 plan):
 *   changeKind, subitemId, subitemName*, parentItemId, boardId,
 *   createdAt, creatorId    (* = sensitive)
 *
 * Monday's create_subitem event uses `pulseId` for the NEW subitem and
 * `itemId` / `parentItemId` for the parent — so we DON'T reuse the shared
 * `getItemId` (which conflates the two). The subitem id is read from
 * `pulseId` first; the parent from `parentItemId` / `itemId`.
 *
 * Dedup key: `new_subitem:${boardId}:${subitemId}:${createdAt}`.
 */
export function normalizeNewSubitem(ev: MondayEventObject): TriggerEvent {
  const boardId = getBoardId(ev);
  const subitemId = pickIdString(ev, [
    "subitemId",
    "subitem_id",
    "pulseId",
    "pulse_id",
  ]);
  const subitemName = pickString(ev, [
    "subitemName",
    "pulseName",
    "itemName",
    "name",
  ]);
  const parentItemId = pickIdString(ev, [
    "parentItemId",
    "parent_item_id",
    "itemId",
    "item_id",
  ]);
  const createdAt = pickString(ev, [
    "createdAt",
    "created_at",
    "triggerTime",
    "timestamp",
  ]);

  const occurredAt = createdAt ?? getTimestamp(ev) ?? new Date().toISOString();
  const eventId = `new_subitem:${boardId ?? "no-board"}:${
    subitemId ?? "no-subitem"
  }:${createdAt ?? occurredAt}`;

  return {
    provider: "monday",
    eventType: "new_subitem",
    eventId,
    occurredAt,
    accountId: boardId ?? "unknown",
    payload: {
      changeKind: "new_subitem",
      subitemId,
      subitemName,
      parentItemId,
      boardId,
      createdAt,
      creatorId: getCreatorId(ev),
    },
  };
}
