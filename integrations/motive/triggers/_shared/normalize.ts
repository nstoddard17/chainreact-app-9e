import type { TriggerEvent } from "@/contracts/triggerEvent";
import {
  MOTIVE_FIRST_SEEN_DEDUP,
  type MotiveTriggerType,
} from "./eventMap";

/**
 * Normalize a Motive webhook delivery into V2's canonical `TriggerEvent` —
 * MOTIVE-1.
 *
 * Per-event payload field lists are confirmed at live certification (Phase 13),
 * so extraction is DEFENSIVE: it looks for the entity both at the body top level
 * and under a small set of candidate wrapper keys, and pulls a bounded field set
 * with null fallbacks. `companyId` is threaded from the receiving trigger row
 * (the webhook is company-scoped, so the row is the authoritative attribution).
 *
 * Dedup keys use stable semantic ids, never a volatile timestamp (rule 13):
 *   - "created"/"opened"/"upserted"-with-report-id events key on the entity id.
 *   - first-seen `*_upserted` triggers (new_vehicle / new_driver) key on the
 *     entity id ALONE, so an update to an existing entity never re-fires the
 *     "new" workflow within the dedup TTL.
 */

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/** Resolve the entity object: a nested wrapper (by candidate keys) or the body. */
function resolveEntity(
  body: Record<string, unknown>,
  candidateKeys: readonly string[],
): Record<string, unknown> {
  for (const key of candidateKeys) {
    const nested = asRecord(body[key]);
    if (nested) return nested;
  }
  const generic = asRecord(body.data);
  return generic ?? body;
}

function pickStr(
  obj: Record<string, unknown>,
  ...keys: readonly string[]
): string | null {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.length > 0) return v;
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

function pickTimestamp(obj: Record<string, unknown>): string | null {
  return pickStr(
    obj,
    "occurred_at",
    "created_at",
    "start_time",
    "time",
    "updated_at",
    "timestamp",
  );
}

const ENTITY_KEYS: Record<MotiveTriggerType, readonly string[]> = {
  new_inspection_report: ["inspection_report", "inspection", "form_entry"],
  new_hos_violation: ["hos_violation", "violation"],
  new_safety_event: ["driver_performance_event", "event"],
  new_speeding_event: ["speeding_event", "event"],
  new_fault_code: ["fault_code"],
  new_vehicle: ["vehicle"],
  new_driver: ["user", "driver"],
};

export interface NormalizeCtx {
  companyId: string;
  /** The Motive `action` string from the body, when present. */
  action: string | null;
  /** Receipt time — fallback when the payload carries no timestamp. */
  receivedAt: string;
}

export function normalizeMotiveEvent(
  triggerType: MotiveTriggerType,
  body: Record<string, unknown>,
  ctx: NormalizeCtx,
): TriggerEvent {
  const entity = resolveEntity(body, ENTITY_KEYS[triggerType]);
  const entityId = pickStr(entity, "id");
  const occurredAt = pickTimestamp(entity) ?? pickTimestamp(body) ?? ctx.receivedAt;

  const base = {
    changeKind: triggerType,
    action: ctx.action,
    companyId: ctx.companyId,
    occurredAt: occurredAt,
  };

  let payload: Record<string, unknown>;
  switch (triggerType) {
    case "new_inspection_report":
      payload = {
        ...base,
        inspectionReportId: entityId,
        vehicleId: pickStr(entity, "vehicle_id"),
        driverId: pickStr(entity, "driver_id", "user_id"),
        inspectionType: pickStr(entity, "inspection_type", "type"),
        status: pickStr(entity, "status"),
      };
      break;
    case "new_hos_violation":
      payload = {
        ...base,
        violationId: entityId,
        driverId: pickStr(entity, "driver_id", "user_id"),
        violationType: pickStr(entity, "violation_type", "type"),
      };
      break;
    case "new_safety_event":
      payload = {
        ...base,
        safetyEventId: entityId,
        driverId: pickStr(entity, "driver_id", "user_id"),
        vehicleId: pickStr(entity, "vehicle_id"),
        eventTypeName: pickStr(entity, "event_type", "type"),
      };
      break;
    case "new_speeding_event":
      payload = {
        ...base,
        speedingEventId: entityId,
        driverId: pickStr(entity, "driver_id", "user_id"),
        vehicleId: pickStr(entity, "vehicle_id"),
      };
      break;
    case "new_fault_code":
      payload = {
        ...base,
        faultCodeId: entityId,
        vehicleId: pickStr(entity, "vehicle_id"),
        code: pickStr(entity, "code", "fault_code"),
        description: pickStr(entity, "description"),
      };
      break;
    case "new_vehicle":
      payload = {
        ...base,
        vehicleId: entityId,
        number: pickStr(entity, "number"),
        vin: pickStr(entity, "vin"),
        make: pickStr(entity, "make"),
        model: pickStr(entity, "model"),
      };
      break;
    case "new_driver":
      payload = {
        ...base,
        driverId: entityId,
        email: pickStr(entity, "email"),
        firstName: pickStr(entity, "first_name"),
        lastName: pickStr(entity, "last_name"),
        role: pickStr(entity, "role"),
      };
      break;
  }

  // Dedup key: entity id (stable). First-seen upsert triggers key on id ALONE
  // (updates never re-fire). When the id is absent, fall back to occurredAt so
  // unrelated malformed events never collapse onto one key.
  const firstSeen = MOTIVE_FIRST_SEEN_DEDUP.has(triggerType);
  void firstSeen; // both branches key on id-only; documented for clarity.
  const eventId = entityId
    ? `${triggerType}:${ctx.companyId}:${entityId}`
    : `${triggerType}:${ctx.companyId}:no-id:${occurredAt}`;

  return {
    provider: "motive",
    eventType: triggerType,
    eventId,
    occurredAt,
    providerAccountId: ctx.companyId,
    payload,
  };
}
