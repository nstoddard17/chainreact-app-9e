/**
 * Motive trigger event map — MOTIVE-1.
 *
 * V2 short `eventType` (what `TriggerEvent.eventType` and
 * `registerActivation(provider, eventType, …)` use) ↔ Motive's webhook `actions`
 * string (provider wire only). `TriggerEvent.eventType` MUST equal the short
 * form (CLAUDE.md rule 10); the Motive action string appears ONLY on the
 * webhook subscription + the inbound body's `action` field.
 *
 * `firstSeenDedup` triggers use `*_upserted` events (create OR update), so the
 * dedup key is the entity id alone — an update to an existing entity never
 * re-fires a "new" workflow (within the dedup TTL).
 */

export const MOTIVE_TRIGGER_TYPES = [
  "new_inspection_report",
  "new_hos_violation",
  "new_safety_event",
  "new_speeding_event",
  "new_fault_code",
  "new_vehicle",
  "new_driver",
] as const;

export type MotiveTriggerType = (typeof MOTIVE_TRIGGER_TYPES)[number];

/** V2 short type → the Motive webhook `actions` string(s) to subscribe to. */
export const MOTIVE_EVENT_ACTIONS: Record<MotiveTriggerType, readonly string[]> = {
  new_inspection_report: ["inspection_report_upserted"],
  new_hos_violation: ["hos_violation_upserted"],
  new_safety_event: ["driver_performance_event_created"],
  new_speeding_event: ["speeding_event_created"],
  new_fault_code: ["fault_code_opened"],
  new_vehicle: ["vehicle_upserted"],
  new_driver: ["user_upserted"],
};

/**
 * Triggers whose Motive event is an UPSERT (fires on create AND update). Their
 * dedup key is the entity id alone so only the first sighting fires a "new"
 * workflow (documented limitation: re-fire only after the dedup TTL lapses).
 */
export const MOTIVE_FIRST_SEEN_DEDUP: ReadonlySet<MotiveTriggerType> = new Set([
  "new_vehicle",
  "new_driver",
]);

export function isMotiveTriggerType(value: string): value is MotiveTriggerType {
  return (MOTIVE_TRIGGER_TYPES as readonly string[]).includes(value);
}
