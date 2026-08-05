import type { Json } from "@/types/database.types";

/**
 * SUPABASE-TABLE-TYPING-1B — writing a typed domain value into a `jsonb` column.
 *
 * A domain object is not assignable to the generated `Json` type: `Json`'s
 * object member is an index signature, and TypeScript will not hand an
 * interface (or anything holding `unknown` values, like a zod `z.record`
 * payload) to one. The tempting fix is `value as Json`, which asserts a
 * property nothing has checked — the exact habit this arc removes.
 *
 * `toJsonColumn` instead CONSTRUCTS the `Json` value, so the return type is
 * earned rather than asserted. It reproduces `JSON.stringify` semantics
 * EXACTLY, because supabase-js serializes the payload with `JSON.stringify`
 * anyway — so the bytes reaching Postgres are unchanged and no behaviour moves:
 *
 *   - `undefined`, functions and symbols are DROPPED from objects and become
 *     `null` inside arrays (what `JSON.stringify` does);
 *   - `NaN` / `±Infinity` become `null`;
 *   - `toJSON()` is honoured (so `Date` serializes to its ISO string);
 *   - a circular reference throws, as `JSON.stringify` does.
 *
 * It is deliberately NOT a validator: shape validation belongs to the contract
 * schemas (`TriggerEventSchema`, `WorkflowRunStepSchema`, …). This only proves
 * JSON-encodability.
 */
export function toJsonColumn(label: string, value: unknown): Json {
  return convert(label, value, new WeakSet());
}

function convert(label: string, value: unknown, seen: WeakSet<object>): Json {
  const unwrapped = unwrapToJSON(value);

  if (unwrapped === null) return null;
  const t = typeof unwrapped;
  if (t === "string") return unwrapped as string;
  if (t === "boolean") return unwrapped as boolean;
  if (t === "number") {
    const n = unwrapped as number;
    // JSON.stringify emits null for non-finite numbers.
    return Number.isFinite(n) ? n : null;
  }
  if (t === "bigint") {
    throw new TypeError(`${label}: BigInt cannot be stored in a JSON column`);
  }
  if (t !== "object") {
    // undefined / function / symbol reaching the ROOT has no JSON encoding.
    throw new TypeError(`${label}: value of type ${t} cannot be stored in a JSON column`);
  }

  const obj = unwrapped as object;
  if (seen.has(obj)) {
    throw new TypeError(`${label}: circular reference cannot be stored in a JSON column`);
  }
  seen.add(obj);
  try {
    if (Array.isArray(obj)) {
      const out: Json[] = [];
      for (let i = 0; i < obj.length; i++) {
        out.push(elementOrNull(`${label}[${i}]`, obj[i], seen));
      }
      return out;
    }
    const out: { [key: string]: Json } = {};
    for (const [key, raw] of Object.entries(obj)) {
      const encoded = unwrapToJSON(raw);
      const et = typeof encoded;
      // JSON.stringify omits these keys entirely.
      if (encoded === undefined || et === "function" || et === "symbol") continue;
      out[key] = convert(`${label}.${key}`, encoded, seen);
    }
    return out;
  } finally {
    seen.delete(obj);
  }
}

/** Array holes and non-encodable elements become `null`, as in JSON.stringify. */
function elementOrNull(label: string, value: unknown, seen: WeakSet<object>): Json {
  const encoded = unwrapToJSON(value);
  const t = typeof encoded;
  if (encoded === undefined || t === "function" || t === "symbol") return null;
  return convert(label, encoded, seen);
}

/** Honour a `toJSON()` method, exactly as JSON.stringify does (e.g. Date). */
function unwrapToJSON(value: unknown): unknown {
  if (
    value !== null &&
    typeof value === "object" &&
    "toJSON" in value &&
    typeof (value as { toJSON: unknown }).toJSON === "function"
  ) {
    return (value as { toJSON: () => unknown }).toJSON();
  }
  return value;
}
