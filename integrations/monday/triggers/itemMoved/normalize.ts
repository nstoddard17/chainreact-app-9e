import type { TriggerEvent } from "@/contracts/triggerEvent";
import {
  getBoardId,
  getCreatorId,
  getItemId,
  getItemName,
  getTimestamp,
  pickIdString,
  pickNestedId,
  pickString,
  type MondayEventObject,
} from "../_shared/fields";

/**
 * Normalize a Monday `item_moved_to_any_group` / `move_pulse_into_group`
 * webhook event into V2's canonical `TriggerEvent` — Slice 3.MONDAY-7.
 *
 * Canonical payload (MONDAY-7 plan):
 *   changeKind, itemId, itemName*, boardId, previousGroupId,
 *   currentGroupId, movedAt, movedById    (* = sensitive)
 *
 * Group ids arrive in several shapes across Monday versions
 * (`previousGroup.id`, `previousGroupId`, `sourceGroupId`; `group.id`,
 * `groupId`, `destGroupId`) — all covered.
 *
 * Dedup key: `item_moved:${boardId}:${itemId}:${movedAt}`.
 */
export function normalizeItemMoved(ev: MondayEventObject): TriggerEvent {
  const boardId = getBoardId(ev);
  const itemId = getItemId(ev);
  const previousGroupId =
    pickIdString(ev, ["previousGroupId", "previous_group_id", "sourceGroupId"]) ??
    pickNestedId(ev, ["previousGroup", "source_group"]);
  const currentGroupId =
    pickIdString(ev, ["groupId", "group_id", "destGroupId", "dest_group_id"]) ??
    pickNestedId(ev, ["group", "destGroup", "dest_group"]);
  const movedAt = pickString(ev, [
    "movedAt",
    "moved_at",
    "triggerTime",
    "timestamp",
  ]);

  const occurredAt = movedAt ?? getTimestamp(ev) ?? new Date().toISOString();
  const eventId = `item_moved:${boardId ?? "no-board"}:${
    itemId ?? "no-item"
  }:${movedAt ?? occurredAt}`;

  return {
    provider: "monday",
    eventType: "item_moved",
    eventId,
    occurredAt,
    accountId: boardId ?? "unknown",
    payload: {
      changeKind: "item_moved",
      itemId,
      itemName: getItemName(ev),
      boardId,
      previousGroupId,
      currentGroupId,
      movedAt,
      movedById: getCreatorId(ev),
    },
  };
}
