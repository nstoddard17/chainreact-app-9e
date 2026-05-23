import type { OutputMeta } from "@/contracts/actionMeta";

/**
 * Slice 3.SEC-7 — server-safe redaction helper for action outputs.
 *
 * Given a handler's raw output value and the declared `OutputMeta[]`
 * for that action, returns a deep clone with every value at a path
 * whose meta declares `sensitive: true` replaced by `REDACTED_SENTINEL`.
 *
 * Consumers:
 *   - `app/api/workflows/_shared.ts:toWorkflowRunDetail` — redacts
 *     `steps[].output` before serializing to the client.
 *   - Future builder-side latest-run preview redactor (so the variable
 *     picker doesn't inline sensitive values).
 *
 * Design rules (locked):
 *
 *   - **Never mutate the input.** Returns a brand-new value graph.
 *     Tests assert this with reference identity comparison on the input
 *     after a redaction round-trip.
 *
 *   - **Missing meta is safe.** If meta is undefined / empty / has no
 *     matching field, the helper returns the value unchanged. This
 *     matches the "do not crash, leave output unchanged" requirement —
 *     redaction is read-side; future slices add provider-side enforcement.
 *
 *   - **Top-level sensitive replaces the whole value.** When meta marks
 *     an output's top-level entry as sensitive, the redactor replaces
 *     the entire matching value (string, number, object, array) with
 *     the sentinel — does NOT try to descend.
 *
 *   - **Nested fields descend.** When meta declares `fields[]` and the
 *     PARENT is not itself sensitive, the redactor walks the parent's
 *     properties and applies the nested meta per key. Unknown keys
 *     (present in the value but not in meta) pass through unchanged.
 *
 *   - **Arrays of objects respect `fields[]` per item.** If meta says
 *     `type: "array"` with `fields[]`, the redactor applies the same
 *     nested redaction to each array element. Useful for results lists
 *     (Stripe getPayments returns `payments[]` each with their own
 *     sensitive fields).
 *
 *   - **Fail-safe on unexpected shapes.** Anything the redactor can't
 *     interpret (a meta says `object` but the value is a string,
 *     `fields[]` says an `email` child but the value has no `email`
 *     key) returns the value untouched. The helper never throws.
 *
 *   - **Sentinel is a stable string.** Downstream consumers can pattern-
 *     match on `REDACTED_SENTINEL` to render an icon, skip clipboard
 *     copy, etc. Do not localize.
 */

export const REDACTED_SENTINEL = "[REDACTED]";

/**
 * Redact an output value against the action's `OutputMeta[]` declaration.
 * Returns a new value; the input is never mutated.
 *
 * Accepts `undefined` / `null` / non-object values and the empty/missing
 * meta cases without throwing.
 */
export function redactOutput(
  value: unknown,
  outputs: readonly OutputMeta[] | undefined,
): unknown {
  if (!outputs || outputs.length === 0) return value;
  // Output-level meta only applies when the value is an object — a
  // bare scalar at the step's top level cannot be field-mapped. This
  // is defense in depth; in practice every handler returns an object.
  if (!isPlainObject(value)) return value;

  return redactObjectAgainstFields(value, outputs);
}

/**
 * Walk a `Record<string, unknown>` against an OutputMeta[] field list.
 * Returns a new object with sensitive children replaced.
 *
 * Keys present in the value but absent in `metaFields` pass through
 * unchanged — the meta describes the documented surface, not the only
 * surface the handler might emit (raw passthrough is a SEC-1 finding;
 * this slice does not depend on metas being exhaustive).
 */
function redactObjectAgainstFields(
  obj: Record<string, unknown>,
  metaFields: readonly OutputMeta[],
): Record<string, unknown> {
  const byName = new Map<string, OutputMeta>(metaFields.map((m) => [m.name, m]));
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    const meta = byName.get(key);
    out[key] = applyMetaToValue(val, meta);
  }
  return out;
}

/**
 * Apply a single OutputMeta entry to a value.
 *
 * Decision tree:
 *   1. No meta → pass through.
 *   2. `sensitive: true` → replace with sentinel. No descent — even if
 *      `fields[]` is declared, the whole subtree is hidden.
 *   3. `fields[]` declared + value is an object → recurse.
 *   4. `fields[]` declared + value is an array of objects → recurse
 *      into each element.
 *   5. Anything else → pass through (scalar without sensitive flag,
 *      shape mismatch, etc).
 */
function applyMetaToValue(value: unknown, meta: OutputMeta | undefined): unknown {
  if (!meta) return value;
  if (meta.sensitive) return REDACTED_SENTINEL;
  if (!meta.fields || meta.fields.length === 0) return value;
  if (isPlainObject(value)) {
    return redactObjectAgainstFields(value, meta.fields);
  }
  if (Array.isArray(value)) {
    // Per-item field-redaction. Non-object items pass through (e.g. an
    // array of strings where meta carries spurious `fields[]` — fail
    // safe rather than throwing).
    return value.map((item) =>
      isPlainObject(item)
        ? redactObjectAgainstFields(item, meta.fields!)
        : item,
    );
  }
  return value;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object") return false;
  if (Array.isArray(v)) return false;
  // Reject class instances + framework objects (Date, RegExp, etc.)
  // to avoid spreading them. The redactor is meant for JSON-shaped
  // handler outputs; anything exotic passes through unchanged.
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}
