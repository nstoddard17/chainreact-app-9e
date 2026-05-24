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
 * Normalize a Monday `create_item` / `create_pulse` webhook event into
 * V2's canonical `TriggerEvent` — Slice 3.MONDAY-7.
 *
 * Canonical payload (MONDAY-7 plan §"trigger payload normalization"):
 *   changeKind, itemId, itemName*, boardId, groupId, createdAt,
 *   creatorId, webUrl*    (* = sensitive)
 *
 * Only the canonical fields are emitted — the full raw Monday event is
 * NOT forwarded (the task forbids exposing the raw payload). Every
 * sensitive field is declared `sensitive` in the meta so the run-detail
 * API + variable picker redact it.
 *
 * Dedup key (no provider-issued event id on Monday webhook bodies):
 * `new_item:${boardId}:${itemId}:${createdAt}`. Deterministic, so the
 * per-workflow webhook fan-out (N workflows watching the same board →
 * N deliveries of the same logical event) dedups to a single dispatch
 * round; `dispatchTriggerEvent` then fans out to all active workflows on
 * `(monday, new_item)`.
 */
export function normalizeNewItem(ev: MondayEventObject): TriggerEvent {
  const boardId = getBoardId(ev);
  const itemId = getItemId(ev);
  const groupId =
    pickIdString(ev, ["groupId", "group_id"]) ?? pickNestedId(ev, ["group"]);
  const createdAt = pickString(ev, [
    "createdAt",
    "created_at",
    "triggerTime",
    "timestamp",
  ]);
  const webUrl = pickString(ev, ["webUrl", "url"]);

  const occurredAt = createdAt ?? getTimestamp(ev) ?? new Date().toISOString();
  const eventId = `new_item:${boardId ?? "no-board"}:${itemId ?? "no-item"}:${
    createdAt ?? occurredAt
  }`;

  return {
    provider: "monday",
    eventType: "new_item",
    eventId,
    occurredAt,
    accountId: boardId ?? "unknown",
    payload: {
      changeKind: "new_item",
      itemId,
      itemName: getItemName(ev),
      boardId,
      groupId,
      createdAt,
      creatorId: getCreatorId(ev),
      webUrl,
    },
  };
}
