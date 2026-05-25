/**
 * Shared Monday webhook payload extractors — Slice 3.MONDAY-7.
 *
 * Monday's webhook bodies are inconsistent: ids arrive as numbers OR
 * strings, and field names flip between snake_case (`pulse_id`,
 * `board_id`, `column_id`) and camelCase (`pulseId`, `boardId`,
 * `columnId`) depending on board / API version. V1 normalized this
 * variance inline in `transformMondayPayload`; V2 centralizes it here so
 * every per-trigger `normalize.ts` reads from one safe extractor set.
 *
 * The inbound body shape is `{ event: { ... } }`. Each extractor reads
 * from the inner `event` object and returns a stable canonical value
 * (`string | null`, never `undefined`) so downstream normalize output
 * keys are always present (matches the GitHub / Trello null-fill
 * convention — downstream variable pickers show the field even when the
 * provider omitted it for this delivery).
 */

export type MondayEventObject = Record<string, unknown>;

/**
 * Extract the inner `event` object from a parsed Monday webhook body.
 * Returns `{}` when absent so callers never null-check.
 */
export function getEventObject(body: Record<string, unknown>): MondayEventObject {
  const ev = body.event;
  if (ev && typeof ev === "object" && !Array.isArray(ev)) {
    return ev as MondayEventObject;
  }
  return {};
}

/** First present key whose value is a non-empty string. */
export function pickString(
  ev: MondayEventObject,
  keys: readonly string[],
): string | null {
  for (const k of keys) {
    const v = ev[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

/**
 * First present key whose value is a string OR finite number, coerced to
 * string. Monday emits ids as either type; we standardize on string
 * (matches every other V2 provider's id outputs).
 */
export function pickIdString(
  ev: MondayEventObject,
  keys: readonly string[],
): string | null {
  for (const k of keys) {
    const v = ev[k];
    if (typeof v === "string" && v.length > 0) return v;
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

/**
 * First present key whose value is a nested object's id field, coerced to
 * string. Handles Monday's `{ group: { id } }` / `{ previousGroup: { id } }`
 * shapes.
 */
export function pickNestedId(
  ev: MondayEventObject,
  keys: readonly string[],
): string | null {
  for (const k of keys) {
    const v = ev[k];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const id = (v as Record<string, unknown>).id;
      if (typeof id === "string" && id.length > 0) return id;
      if (typeof id === "number" && Number.isFinite(id)) return String(id);
    }
  }
  return null;
}

/** Pass-through for raw values (column previous/new values, which may be
 * strings OR objects). Returns `null` only when truly absent. */
export function pickRaw(
  ev: MondayEventObject,
  keys: readonly string[],
): unknown {
  for (const k of keys) {
    if (ev[k] !== undefined && ev[k] !== null) return ev[k];
  }
  return null;
}

// ─── Canonical field extractors (shared across triggers) ─────────────────────

export function getBoardId(ev: MondayEventObject): string | null {
  return pickIdString(ev, ["boardId", "board_id"]);
}

export function getItemId(ev: MondayEventObject): string | null {
  return pickIdString(ev, ["pulseId", "pulse_id", "itemId", "item_id"]);
}

export function getItemName(ev: MondayEventObject): string | null {
  return pickString(ev, ["pulseName", "itemName", "name"]);
}

export function getCreatorId(ev: MondayEventObject): string | null {
  return pickIdString(ev, ["userId", "user_id", "creatorId", "creator_id"]);
}

/** Monday's webhook timestamp — `triggerTime` (modern) or `timestamp`. */
export function getTimestamp(ev: MondayEventObject): string | null {
  return pickString(ev, ["triggerTime", "timestamp"]);
}
