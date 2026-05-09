/**
 * Typed Airtable field polymorphism — Slice 10 Commit 3.
 *
 * Airtable's field type system has 30+ types; Slice 10 Batch 1 supports
 * 14 with both directions (outbound to wire / inbound from wire). V1
 * has the polymorphism but as inline switches duplicated across the
 * 924-LOC `createRecord.ts` and friends, including a
 * heuristic-by-field-name attachment detection ("if field name
 * contains 'photo' it's an attachment"). V2 centralizes both
 * directions in this single typed module + fails LOUD on deferred
 * types (no heuristic-based field detection).
 *
 * Slice 10 Batch 1 — 14 supported types (per
 * `docs/slices/slice-10-airtable.md` §"Field polymorphism strategy"):
 *   singleLineText, longText, number, currency, percent, singleSelect,
 *   multipleSelects, checkbox, date, dateTime, email, url,
 *   phoneNumber, multipleRecordLinks.
 *
 * Deferred (17 types) — explicitly throw `UnsupportedFieldTypeError`:
 *   attachment, formula, rollup, lookup, count, rating, duration,
 *   autoNumber, barcode, button, singleCollaborator,
 *   multipleCollaborators, createdBy, createdTime, lastModifiedBy,
 *   lastModifiedTime, externalSyncSource, aiText.
 *
 * Two directions:
 *   - **`formatFieldValue`** — outbound. Used by create_record /
 *     update_record to coerce a typed user value into Airtable's
 *     wire-format. Most types pass through unchanged; the load-bearing
 *     transformations are date → "YYYY-MM-DD", dateTime → ISO 8601,
 *     and multipleRecordLinks → strip `recXXX::Display Name` →
 *     `recXXX` (V1 displayed-value format that V2 cleans up
 *     defensively).
 *   - **`parseFieldValue`** — inbound. Used by future schema-aware
 *     read paths (record_changed trigger, Commit 4). Read direction
 *     is mostly identity for the supported types — Airtable returns
 *     the same shape it accepts.
 *
 * Both throw `UnsupportedFieldTypeError` with the field type name +
 * the supported set + the deferred set when called with a deferred
 * type — workflows fail loud at design time rather than silently
 * miscoercing.
 *
 * Mirrors `_shared/notion/properties.ts` shape — proves the typed
 * polymorphism module pattern generalizes beyond Notion (Slice 10's
 * stated design intent).
 */

/**
 * The 14 field types Slice 10 Batch 1 supports. Future slices can
 * extend by adding to this union AND adding cases to formatFieldValue
 * / parseFieldValue. The exhaustiveness checks at the bottom of each
 * function will fail to compile if a case is missed.
 */
export type SupportedFieldType =
  | "singleLineText"
  | "longText"
  | "number"
  | "currency"
  | "percent"
  | "singleSelect"
  | "multipleSelects"
  | "checkbox"
  | "date"
  | "dateTime"
  | "email"
  | "url"
  | "phoneNumber"
  | "multipleRecordLinks";

export const SUPPORTED_FIELD_TYPES: ReadonlyArray<SupportedFieldType> = [
  "singleLineText",
  "longText",
  "number",
  "currency",
  "percent",
  "singleSelect",
  "multipleSelects",
  "checkbox",
  "date",
  "dateTime",
  "email",
  "url",
  "phoneNumber",
  "multipleRecordLinks",
];

/**
 * The 17 field types Slice 10 Batch 1 explicitly defers. Listed in the
 * UnsupportedFieldTypeError message so workflow authors know which
 * types are recognized-but-deferred versus unrecognized.
 */
export const DEFERRED_FIELD_TYPES: ReadonlyArray<string> = [
  "attachment",
  "formula",
  "rollup",
  "lookup",
  "count",
  "rating",
  "duration",
  "autoNumber",
  "barcode",
  "button",
  "singleCollaborator",
  "multipleCollaborators",
  "createdBy",
  "createdTime",
  "lastModifiedBy",
  "lastModifiedTime",
  "externalSyncSource",
  "aiText",
];

function isSupported(type: string): type is SupportedFieldType {
  return (SUPPORTED_FIELD_TYPES as ReadonlyArray<string>).includes(type);
}

/**
 * Thrown by both `formatFieldValue` and `parseFieldValue` when called
 * with a field type outside Slice 10 Batch 1's supported set. The
 * error message lists the unsupported type, the supported set, and
 * the deferred set so workflow authors can fix their config without
 * hunting the source. Heuristic-based field detection (V1's
 * "if-name-contains-photo-it's-an-attachment") is rejected per the
 * Slice 10 plan; this is the explicit failure mode that replaces it.
 */
export class UnsupportedFieldTypeError extends Error {
  readonly fieldType: string;
  readonly supportedTypes: readonly string[];
  readonly deferredTypes: readonly string[];
  constructor(fieldType: string) {
    super(
      `Airtable field type '${fieldType}' is not supported in Slice 10 Batch 1. Supported: ${SUPPORTED_FIELD_TYPES.join(", ")}. Deferred: ${DEFERRED_FIELD_TYPES.join(", ")}.`,
    );
    this.name = "UnsupportedFieldTypeError";
    this.fieldType = fieldType;
    this.supportedTypes = SUPPORTED_FIELD_TYPES;
    this.deferredTypes = DEFERRED_FIELD_TYPES;
  }
}

// ─── Outbound: typed input → Airtable wire-format ─────────────────────────

/**
 * Typed input value for each supported field type. Discriminated
 * union — the user supplies one shape per type; the format function
 * coerces it into Airtable's wire-format value.
 *
 * For `multipleRecordLinks`, accepting both `string[]` and `string`
 * matches V1's tolerance — workflow authors writing a single linked
 * record id without wrapping it in an array shouldn't fail; the
 * helper normalizes to `string[]`.
 */
export type TypedFieldInput =
  | { type: "singleLineText"; value: string }
  | { type: "longText"; value: string }
  | { type: "number"; value: number | null }
  | { type: "currency"; value: number | null }
  | { type: "percent"; value: number | null }
  | { type: "singleSelect"; value: string | null }
  | { type: "multipleSelects"; value: ReadonlyArray<string> }
  | { type: "checkbox"; value: boolean }
  | { type: "date"; value: string | Date | null }
  | { type: "dateTime"; value: string | Date | null }
  | { type: "email"; value: string | null }
  | { type: "url"; value: string | null }
  | { type: "phoneNumber"; value: string | null }
  | { type: "multipleRecordLinks"; value: ReadonlyArray<string> | string };

/**
 * V1's "recXXX::Display Name" cleanup — strips the trailing
 * `::Display Name` segment that V1's UI layer attaches when the user
 * picks a linked record from a dropdown. Airtable's API rejects the
 * suffixed form. Defensive — works on either single ids or arrays.
 */
function cleanLinkedRecordId(raw: string): string {
  const idx = raw.indexOf("::");
  return idx === -1 ? raw : raw.slice(0, idx);
}

/**
 * Formats a date input as Airtable's date-only wire format
 * (`YYYY-MM-DD`). Accepts ISO strings, plain date strings, or `Date`
 * objects. Per V1 `createRecord.ts:619-626`, uses the local-time
 * `getFullYear` / `getMonth` / `getDate` to avoid the UTC-shift bug
 * where `new Date("2026-01-01").toISOString().slice(0, 10)` can
 * collide with a previous day in non-UTC timezones.
 */
function formatDateOnly(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(
      `Airtable date field received invalid date value: ${String(value)}`,
    );
  }
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Formats a dateTime input as ISO 8601. Accepts ISO strings or `Date`
 * objects. Uses `Date.toISOString()` directly — Airtable's wire format
 * is the standard ISO with milliseconds + Z suffix.
 */
function formatDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(
      `Airtable dateTime field received invalid date value: ${String(value)}`,
    );
  }
  return date.toISOString();
}

/**
 * Coerce a typed field input into Airtable's wire-format value.
 * Throws `UnsupportedFieldTypeError` when the type is outside Slice 10
 * Batch 1's supported set.
 */
export function formatFieldValue(
  fieldType: string,
  value: unknown,
): unknown {
  if (!isSupported(fieldType)) {
    throw new UnsupportedFieldTypeError(fieldType);
  }
  switch (fieldType) {
    case "singleLineText":
    case "longText":
      return value as string;
    case "number":
    case "currency":
    case "percent":
      return value as number | null;
    case "singleSelect":
      // Airtable accepts the option name. null clears the field.
      return value as string | null;
    case "multipleSelects": {
      const arr = value as ReadonlyArray<string>;
      // Defensive copy — never hand the caller's array to the wire
      // layer; consumers might mutate.
      return [...arr];
    }
    case "checkbox":
      return value as boolean;
    case "date":
      if (value === null) return null;
      return formatDateOnly(value as string | Date);
    case "dateTime":
      if (value === null) return null;
      return formatDateTime(value as string | Date);
    case "email":
    case "url":
    case "phoneNumber":
      return value as string | null;
    case "multipleRecordLinks": {
      const raw = value as ReadonlyArray<string> | string;
      const arr = Array.isArray(raw) ? raw : [raw];
      return arr.map((id) => cleanLinkedRecordId(id));
    }
    default: {
      // Exhaustiveness check — fails to compile if a case is missed
      // when SupportedFieldType is widened.
      const _exhaustive: never = fieldType;
      void _exhaustive;
      throw new UnsupportedFieldTypeError(fieldType);
    }
  }
}

/**
 * Convenience for callers building a full `fields` payload from a
 * typed input map. Each value's `type` discriminator drives the
 * format. Returns the Airtable-shaped object keyed by the same field
 * names.
 *
 * Throws `UnsupportedFieldTypeError` on the first deferred type —
 * fail-fast so a workflow doesn't partially write before discovering
 * an unsupported type later in the map.
 */
export function formatFields(
  inputs: Readonly<Record<string, TypedFieldInput>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, input] of Object.entries(inputs)) {
    out[name] = formatFieldValue(input.type, input.value);
  }
  return out;
}

// ─── Inbound: Airtable wire-format → typed value ──────────────────────────

/**
 * Parsed value matches the input shape per type. Read direction is
 * mostly identity for the supported types — Airtable returns the same
 * shape it accepts. The notable case is `multipleRecordLinks` which
 * always comes back as a plain `string[]` (no display-name suffix).
 */
export type ParsedFieldValue =
  | { type: "singleLineText"; value: string }
  | { type: "longText"; value: string }
  | { type: "number"; value: number | null }
  | { type: "currency"; value: number | null }
  | { type: "percent"; value: number | null }
  | { type: "singleSelect"; value: string | null }
  | { type: "multipleSelects"; value: string[] }
  | { type: "checkbox"; value: boolean }
  | { type: "date"; value: string | null }
  | { type: "dateTime"; value: string | null }
  | { type: "email"; value: string | null }
  | { type: "url"; value: string | null }
  | { type: "phoneNumber"; value: string | null }
  | { type: "multipleRecordLinks"; value: string[] };

/**
 * Extract a typed value from an Airtable record's raw field value.
 * Throws `UnsupportedFieldTypeError` when the type is outside Slice 10
 * Batch 1's supported set — including when the parsing context (a
 * provided schema) declares a deferred type.
 *
 * Read direction quirks:
 *   - `checkbox`: Airtable omits the field entirely when unchecked,
 *     OR returns `true` when checked. Never `false`. Parser normalizes
 *     to a strict boolean.
 *   - `multipleSelects` / `multipleRecordLinks`: Airtable omits the
 *     field when empty rather than returning `[]`. Parser normalizes
 *     to a definite empty array when the raw value is undefined.
 */
export function parseFieldValue(
  fieldType: string,
  rawValue: unknown,
): ParsedFieldValue {
  if (!isSupported(fieldType)) {
    throw new UnsupportedFieldTypeError(fieldType);
  }
  switch (fieldType) {
    case "singleLineText":
    case "longText":
      return {
        type: fieldType,
        value: typeof rawValue === "string" ? rawValue : "",
      };
    case "number":
    case "currency":
    case "percent":
      return {
        type: fieldType,
        value: typeof rawValue === "number" ? rawValue : null,
      };
    case "singleSelect":
      return {
        type: "singleSelect",
        value: typeof rawValue === "string" ? rawValue : null,
      };
    case "multipleSelects":
      return {
        type: "multipleSelects",
        value: Array.isArray(rawValue) ? (rawValue as string[]) : [],
      };
    case "checkbox":
      // Airtable returns `true` when checked, OMITS the field when
      // unchecked. Coerce to a strict boolean.
      return {
        type: "checkbox",
        value: rawValue === true,
      };
    case "date":
    case "dateTime":
      return {
        type: fieldType,
        value: typeof rawValue === "string" ? rawValue : null,
      };
    case "email":
    case "url":
    case "phoneNumber":
      return {
        type: fieldType,
        value: typeof rawValue === "string" ? rawValue : null,
      };
    case "multipleRecordLinks":
      return {
        type: "multipleRecordLinks",
        value: Array.isArray(rawValue) ? (rawValue as string[]) : [],
      };
    default: {
      const _exhaustive: never = fieldType;
      void _exhaustive;
      throw new UnsupportedFieldTypeError(fieldType);
    }
  }
}

/**
 * The shape of an Airtable table-schema field metadata entry — partial
 * subset of what `/v0/meta/bases/{baseId}/tables` returns. Used by
 * `parseFieldsWithSchema` to look up each field's type when the
 * caller has a schema in hand (the trigger path in Commit 4 is the
 * primary consumer).
 */
export interface AirtableFieldSchema {
  id: string;
  name: string;
  type: string;
}

/**
 * Convenience for parsing a full record's fields when the caller has
 * an Airtable table schema in hand. For each field on the record,
 * looks up the field's type via the provided schema and applies the
 * matching parser. Skips properties whose schema-declared type is
 * deferred (returning them in the `skipped` array) so workflows can
 * degrade gracefully on records that mix supported + deferred types.
 *
 * Mirrors Notion's `parseProperties` shape — the second tuple element
 * lets callers decide whether to surface a warning.
 *
 * When a field appears on the record but is missing from the schema
 * (rare — usually means the schema was fetched stale), the field is
 * skipped with `type: "<missing>"`.
 */
export function parseFieldsWithSchema(
  fields: Readonly<Record<string, unknown>>,
  schema: ReadonlyArray<AirtableFieldSchema>,
): {
  parsed: Record<string, ParsedFieldValue>;
  skipped: Array<{ name: string; type: string }>;
} {
  // Index schema entries by both id AND name so callers can use
  // either as the field-map key (V1 supports both).
  const byKey = new Map<string, AirtableFieldSchema>();
  for (const f of schema) {
    byKey.set(f.id, f);
    byKey.set(f.name, f);
  }
  const parsed: Record<string, ParsedFieldValue> = {};
  const skipped: Array<{ name: string; type: string }> = [];
  for (const [name, raw] of Object.entries(fields)) {
    const schemaEntry = byKey.get(name);
    const type = schemaEntry?.type;
    if (!type || !isSupported(type)) {
      skipped.push({ name, type: type ?? "<missing>" });
      continue;
    }
    parsed[name] = parseFieldValue(type, raw);
  }
  return { parsed, skipped };
}
