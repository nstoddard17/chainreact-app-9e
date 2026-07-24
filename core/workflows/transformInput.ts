/**
 * Input classification for `ai:transform_data` (AI-PROVIDER-6 CS-6).
 *
 * The engine pre-resolves `{{…}}` before dispatch and a single-token template
 * returns the RAW value, so the "Data to transform" field arrives as whatever
 * the upstream step produced: an array of rows (`{{analyze.rows}}`), one
 * record (`{{trigger.record}}`), an Analyze Document output object, a parsed
 * document, or any other JSON-compatible workflow variable.
 *
 * This module decides — before any spend — whether that value is structured
 * data at all, and serializes it once, deterministically, under a hard size
 * cap. It deliberately does NOT `String(value)` anything: stringifying an
 * arbitrary object produces `[object Object]`, and paying a model to read that
 * is the exact failure mode the plan's "reject unsupported inputs with typed
 * validation" rule exists to prevent.
 *
 * PURE — no I/O, no env. Refusal reasons describe the SHAPE received (its
 * JavaScript type, its emptiness, its size), never the data itself.
 */

/** Serialized-input ceiling (plan §4.5: transform input ≤ 1 MiB). */
export const TRANSFORM_INPUT_MAX_BYTES = 1024 * 1024;

export type TransformInputClassification =
  | {
      /** A list — one output row per element. */
      readonly kind: "rows";
      readonly json: string;
      readonly count: number;
    }
  | {
      /** A single object — one output record. */
      readonly kind: "record";
      readonly json: string;
      readonly count: 1;
    }
  | { readonly kind: "unsupported"; readonly reason: string };

function byteLength(text: string): number {
  // TextEncoder is available in every runtime this repo targets (node ≥ 18,
  // browsers, edge). Counting BYTES, not chars, matches the wire limit.
  return new TextEncoder().encode(text).length;
}

function serialize(value: unknown): { ok: true; json: string } | { ok: false; reason: string } {
  let json: string | undefined;
  try {
    json = JSON.stringify(value);
  } catch {
    // Circular reference — the only realistic JSON.stringify throw here.
    return {
      ok: false,
      reason: "the value refers back to itself and cannot be read as data",
    };
  }
  if (typeof json !== "string") {
    return { ok: false, reason: "the value could not be read as data" };
  }
  const bytes = byteLength(json);
  if (bytes > TRANSFORM_INPUT_MAX_BYTES) {
    return {
      ok: false,
      reason: `the data is too large to transform in one step (${Math.ceil(bytes / (1024 * 1024))} MB; limit ${TRANSFORM_INPUT_MAX_BYTES / (1024 * 1024)} MB)`,
    };
  }
  return { ok: true, json };
}

/**
 * Classify + serialize the resolved "Data to transform" value.
 *
 * A JSON STRING is accepted and re-parsed (an upstream step that already
 * serialized its payload is a normal shape); free text that is not JSON is
 * refused with a pointer at Analyze Document, which is the action that turns
 * prose into structure.
 */
export function classifyTransformInput(
  value: unknown,
  options: { maxBytes?: number } = {},
): TransformInputClassification {
  const maxBytes = options.maxBytes ?? TRANSFORM_INPUT_MAX_BYTES;

  if (value === undefined || value === null) {
    return { kind: "unsupported", reason: "no data was provided" };
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      return { kind: "unsupported", reason: "the value is empty" };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return {
        kind: "unsupported",
        reason:
          "the value is plain text, not structured data — use Analyze Document to turn text into fields or rows first",
      };
    }
    if (typeof parsed !== "object" || parsed === null) {
      return {
        kind: "unsupported",
        reason: "the value is a single plain value, not a record or a list",
      };
    }
    return classifyTransformInput(parsed, options);
  }

  if (typeof value !== "object") {
    return {
      kind: "unsupported",
      reason: `the value is a ${typeof value}, not a record or a list`,
    };
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return { kind: "unsupported", reason: "the list is empty — there is nothing to transform" };
    }
    const serialized = serialize(value);
    if (!serialized.ok) return { kind: "unsupported", reason: serialized.reason };
    if (byteLength(serialized.json) > maxBytes) {
      return {
        kind: "unsupported",
        reason: "the data is too large to transform in one step",
      };
    }
    return { kind: "rows", json: serialized.json, count: value.length };
  }

  const serialized = serialize(value);
  if (!serialized.ok) return { kind: "unsupported", reason: serialized.reason };
  if (byteLength(serialized.json) > maxBytes) {
    return {
      kind: "unsupported",
      reason: "the data is too large to transform in one step",
    };
  }
  if (Object.keys(value as Record<string, unknown>).length === 0) {
    return { kind: "unsupported", reason: "the record has no fields to transform" };
  }
  return { kind: "record", json: serialized.json, count: 1 };
}
