/**
 * Monday trigger event mapping — Slice 3.MONDAY-7.
 *
 * Two directions, kept in one place so the activate factory and the
 * receive helper can never drift:
 *
 *   1. **V2 trigger type → Monday `create_webhook` event enum**
 *      (`CREATE_WEBHOOK_EVENT`). Used by the activation hook to subscribe
 *      the board to the right Monday event. `column_changed` has a second
 *      enum (`change_specific_column_value`) selected at activation time
 *      when the user sets a `columnId` filter (see `activate.ts`).
 *
 *   2. **Inbound `event.type` → V2 trigger type** (`INBOUND_EVENT_TO_TYPE`).
 *      Used by the receive helper to classify a delivered Monday event.
 *      Monday is inconsistent between legacy "pulse" names
 *      (`create_pulse`, `move_pulse_into_group`) and modern "item" names
 *      (`create_item`, `item_moved_to_any_group`) across board / API
 *      versions, so BOTH are mapped (V1 mapped both too —
 *      `app/api/webhooks/monday/route.ts` triggerMapping).
 */

export const MONDAY_TRIGGER_TYPES = [
  "new_item",
  "column_changed",
  "item_moved",
  "new_subitem",
  "new_update",
] as const;

export type MondayTriggerType = (typeof MONDAY_TRIGGER_TYPES)[number];

/**
 * V2 trigger type → Monday `create_webhook` event enum (default, no
 * config). `column_changed` upgrades to `change_specific_column_value`
 * at activation time when a `columnId` filter is set.
 */
export const CREATE_WEBHOOK_EVENT: Readonly<Record<MondayTriggerType, string>> =
  Object.freeze({
    new_item: "create_item",
    column_changed: "change_column_value",
    item_moved: "item_moved_to_any_group",
    new_subitem: "create_subitem",
    new_update: "create_update",
  });

/** Monday enum used when `column_changed` carries a `columnId` filter. */
export const CHANGE_SPECIFIC_COLUMN_EVENT = "change_specific_column_value";

/**
 * Inbound Monday `event.type` → V2 trigger type. Covers legacy + modern
 * spellings so a board on any Monday API version routes correctly.
 */
export const INBOUND_EVENT_TO_TYPE: Readonly<Record<string, MondayTriggerType>> =
  Object.freeze({
    // new_item
    create_item: "new_item",
    create_pulse: "new_item",
    // column_changed
    change_column_value: "column_changed",
    update_column_value: "column_changed",
    change_specific_column_value: "column_changed",
    // item_moved
    item_moved_to_any_group: "item_moved",
    move_pulse_into_group: "item_moved",
    // new_subitem
    create_subitem: "new_subitem",
    // new_update
    create_update: "new_update",
  });

/**
 * Classify an inbound Monday `event.type` string into a V2 trigger type,
 * or `null` when the event isn't one of the 5 supported triggers (the
 * receive route 200-acks unsupported events).
 */
export function classifyMondayEvent(
  eventType: string | null | undefined,
): MondayTriggerType | null {
  if (typeof eventType !== "string" || eventType.length === 0) return null;
  return INBOUND_EVENT_TO_TYPE[eventType] ?? null;
}
