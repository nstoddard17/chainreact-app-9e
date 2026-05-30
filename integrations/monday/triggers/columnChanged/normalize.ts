import type { TriggerEvent } from "@/contracts/triggerEvent";
import {
  getBoardId,
  getCreatorId,
  getItemId,
  getItemName,
  getTimestamp,
  pickRaw,
  pickString,
  type MondayEventObject,
} from "../_shared/fields";

/**
 * Normalize a Monday `change_column_value` /
 * `change_specific_column_value` / `update_column_value` webhook event
 * into V2's canonical `TriggerEvent` — Slice 3.MONDAY-7.
 *
 * Canonical payload (MONDAY-7 plan):
 *   changeKind, itemId, itemName*, boardId, columnId, columnTitle*,
 *   previousValue*, newValue*, changedAt, changedById   (* = sensitive)
 *
 * `previousValue` / `newValue` are passed through as Monday sends them
 * (string OR object — status/person columns are objects) and are marked
 * sensitive; the run-detail API + variable picker redact them.
 *
 * Dedup key: `column_changed:${boardId}:${itemId}:${columnId}:${changedAt}`.
 * Includes columnId + timestamp so two distinct column edits on the same
 * item are NOT deduped against each other.
 */
export function normalizeColumnChanged(ev: MondayEventObject): TriggerEvent {
  const boardId = getBoardId(ev);
  const itemId = getItemId(ev);
  const columnId = pickString(ev, ["columnId", "column_id"]);
  const changedAt = pickString(ev, [
    "changedAt",
    "changed_at",
    "triggerTime",
    "timestamp",
  ]);

  const occurredAt = changedAt ?? getTimestamp(ev) ?? new Date().toISOString();
  const eventId = `column_changed:${boardId ?? "no-board"}:${
    itemId ?? "no-item"
  }:${columnId ?? "no-column"}:${changedAt ?? occurredAt}`;

  return {
    provider: "monday",
    eventType: "column_changed",
    eventId,
    occurredAt,
    providerAccountId: boardId ?? "unknown",
    payload: {
      changeKind: "column_changed",
      itemId,
      itemName: getItemName(ev),
      boardId,
      columnId,
      columnTitle: pickString(ev, ["columnTitle", "column_title"]),
      previousValue: pickRaw(ev, ["previousValue", "previous_value"]),
      newValue: pickRaw(ev, ["value", "newValue", "new_value"]),
      changedAt,
      changedById: getCreatorId(ev),
    },
  };
}
