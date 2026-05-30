import type { TriggerEvent } from "@/contracts/triggerEvent";
import {
  getBoardId,
  getCreatorId,
  getItemId,
  getTimestamp,
  pickIdString,
  pickString,
  type MondayEventObject,
} from "../_shared/fields";

/**
 * Normalize a Monday `create_update` webhook event into V2's canonical
 * `TriggerEvent` — Slice 3.MONDAY-7.
 *
 * Canonical payload (MONDAY-7 plan):
 *   changeKind, updateId, itemId, boardId, body*, createdAt, posterId,
 *   posterName*    (* = sensitive)
 *
 * The update `body` carries user-authored discussion text (potential
 * PII) and is marked sensitive — `body` is also on the structural
 * sensitive-name guard's suspicious list, so the flag is mandatory.
 *
 * Dedup key: `new_update:${boardId}:${updateId}` — `updateId` is a
 * provider-issued stable id (the highest-fidelity dedup signal Monday
 * exposes for updates); falls back to a timestamp-derived key when
 * absent.
 */
export function normalizeNewUpdate(ev: MondayEventObject): TriggerEvent {
  const boardId = getBoardId(ev);
  const updateId = pickIdString(ev, ["updateId", "update_id", "id"]);
  const itemId = getItemId(ev);
  const createdAt = pickString(ev, [
    "createdAt",
    "created_at",
    "triggerTime",
    "timestamp",
  ]);

  const occurredAt = createdAt ?? getTimestamp(ev) ?? new Date().toISOString();
  const eventId = updateId
    ? `new_update:${boardId ?? "no-board"}:${updateId}`
    : `new_update:${boardId ?? "no-board"}:${itemId ?? "no-item"}:${
        createdAt ?? occurredAt
      }`;

  return {
    provider: "monday",
    eventType: "new_update",
    eventId,
    occurredAt,
    providerAccountId: boardId ?? "unknown",
    payload: {
      changeKind: "new_update",
      updateId,
      itemId,
      boardId,
      body: pickString(ev, ["body", "textBody", "text_body", "text"]),
      createdAt,
      posterId: getCreatorId(ev),
      posterName: pickString(ev, [
        "creatorName",
        "userName",
        "posterName",
        "poster_name",
      ]),
    },
  };
}
