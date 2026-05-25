/**
 * Pure formatter for variable-picker latest-value previews.
 *
 * Slice 3.9 — converts a resolved value (from
 * `resolveValueAtPath`) into a compact display shape the picker
 * renders next to each output button. Scalars stay readable; objects
 * and arrays become non-clickable type chips so the picker doesn't
 * regress into V1's SimpleVariablePicker JSON-inspector kitchen-sink.
 *
 * Design rules:
 *   - `absent` → caller renders nothing. The picker stays compact.
 *   - `scalar` → caller renders the `preview` string verbatim.
 *     Strings get quotes so the author can tell `"42"` from `42`.
 *     Numbers + booleans + null render without quotes.
 *   - `object` / `array` → caller renders a small grey chip (e.g.
 *     `array(3)`); never expanded inline.
 *   - Truncation cap at PREVIEW_MAX_CHARS — long strings end in `…`.
 *   - **Defensive against pathological inputs.** Circular references,
 *     `BigInt`, `Symbol`, `Function`, etc. never crash — they all
 *     fall into the appropriate non-scalar bucket.
 */

export type PreviewKind = "scalar" | "object" | "array" | "absent";

export interface LatestValuePreview {
  readonly kind: PreviewKind;
  /**
   * Display string. For `scalar` this is the quoted/coerced value.
   * For `object` / `array` it's the type chip (e.g. `"object"`,
   * `"array(3)"`). For `absent` it's the empty string.
   */
  readonly preview: string;
}

/** ~40 chars per the slice plan. Picked so a single line fits in the w-72 popover. */
export const PREVIEW_MAX_CHARS = 40;

const ABSENT_PREVIEW: LatestValuePreview = Object.freeze({
  kind: "absent",
  preview: "",
});

/**
 * Format a value for inline display in the variable picker.
 *
 * `found === false` short-circuits to `absent`. Callers can also pass
 * `undefined` directly when convenient — it maps to `absent` too.
 */
export function formatLatestValuePreview(
  input: { found: boolean; value: unknown } | undefined,
): LatestValuePreview {
  if (!input || !input.found) return ABSENT_PREVIEW;
  const v = input.value;
  if (v === null) return { kind: "scalar", preview: "null" };
  if (typeof v === "string") {
    return { kind: "scalar", preview: truncate(JSON.stringify(v)) };
  }
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return { kind: "scalar", preview: String(v) };
    return { kind: "scalar", preview: String(v) };
  }
  if (typeof v === "boolean") {
    return { kind: "scalar", preview: v ? "true" : "false" };
  }
  if (typeof v === "bigint") {
    return { kind: "scalar", preview: `${v.toString()}n` };
  }
  if (Array.isArray(v)) {
    return { kind: "array", preview: `array(${v.length})` };
  }
  if (typeof v === "object") {
    return { kind: "object", preview: "object" };
  }
  // Symbol, function, anything else — surface as the typeof name. The
  // picker never sees these in practice (action outputs are JSON-shaped)
  // but the formatter must not crash.
  return { kind: "object", preview: typeof v };
}

function truncate(s: string): string {
  if (s.length <= PREVIEW_MAX_CHARS) return s;
  // Keep one character for the ellipsis. The runtime resolver doesn't
  // care about this — it's a display-only truncation.
  return `${s.slice(0, PREVIEW_MAX_CHARS - 1)}…`;
}
