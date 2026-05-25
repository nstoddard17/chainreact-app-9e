/**
 * Typed Notion property polymorphism — Slice 9 Commit 3.
 *
 * Notion's property system is the most polymorphic in V2's provider
 * candidate set: each property type has its own input + output shape,
 * and the wire-format is wrapped in a per-type discriminator object.
 * V1 has the polymorphism but as inline switch statements duplicated
 * across handlers (`formatNotionPropertyValue` for outbound,
 * `parsePropertyValue` implicit per handler). V2 centralizes both
 * directions in this single typed module.
 *
 * Slice 9 Batch 1 — 9 supported types (per docs/slices/slice-9-notion.md
 * §"Property polymorphism strategy"):
 *   - title
 *   - rich_text
 *   - number
 *   - select
 *   - checkbox
 *   - date
 *   - url
 *   - email
 *   - phone_number
 *
 * Deferred — explicitly throw `UnsupportedPropertyTypeError`:
 *   - relation, people, files (require multi-step uuid lookups)
 *   - rollup, formula (mostly read-only; computed by Notion)
 *   - multi_select, status (interact with the database's option set;
 *     would need pre-flight schema fetch + caching to validate cleanly)
 *
 * Two directions:
 *   - **`formatPropertyValue`** — outbound. Used by create_page /
 *     update_page / create_database_entry to coerce a typed user value
 *     into Notion's wire-format property body.
 *   - **`parsePropertyValue`** — inbound. Used by get_page /
 *     query_database (and create_database_entry's response) to extract
 *     a typed value from Notion's wire-format property body.
 *
 * Both throw `UnsupportedPropertyTypeError` with the property type name
 * + the supported set when called with a deferred type — workflows
 * fail loud at design time rather than silently miscoercing.
 */

/**
 * The 9 property types Slice 9 Batch 1 supports. Future slices can
 * extend by adding to this union AND adding cases to formatPropertyValue
 * / parsePropertyValue. The exhaustiveness checks at the bottom of each
 * function will fail to compile if a case is missed.
 */
export type SupportedPropertyType =
  | "title"
  | "rich_text"
  | "number"
  | "select"
  | "checkbox"
  | "date"
  | "url"
  | "email"
  | "phone_number";

export const SUPPORTED_PROPERTY_TYPES: ReadonlyArray<SupportedPropertyType> = [
  "title",
  "rich_text",
  "number",
  "select",
  "checkbox",
  "date",
  "url",
  "email",
  "phone_number",
];

function isSupported(type: string): type is SupportedPropertyType {
  return (SUPPORTED_PROPERTY_TYPES as ReadonlyArray<string>).includes(type);
}

/**
 * Thrown by both `formatPropertyValue` and `parsePropertyValue` when
 * called with a property type outside Slice 9 Batch 1's supported set.
 * The error message lists both the unsupported type and the supported
 * set so workflow authors can fix their config without hunting the
 * source.
 */
export class UnsupportedPropertyTypeError extends Error {
  readonly propertyType: string;
  readonly supportedTypes: readonly string[];
  constructor(propertyType: string) {
    super(
      `Notion property type '${propertyType}' is not supported in Slice 9 Batch 1. Supported: ${SUPPORTED_PROPERTY_TYPES.join(", ")}. Deferred: relation, people, files, rollup, formula, multi_select, status.`,
    );
    this.name = "UnsupportedPropertyTypeError";
    this.propertyType = propertyType;
    this.supportedTypes = SUPPORTED_PROPERTY_TYPES;
  }
}

// ─── Outbound: typed input → Notion wire-format ───────────────────────────

export interface DateValue {
  start: string;
  /** Optional end date for date-range properties. */
  end?: string;
}

/**
 * Typed input value for each supported property type. Discriminated
 * union — the user supplies one shape per type; the format function
 * wraps it in Notion's per-type envelope.
 */
export type TypedPropertyInput =
  | { type: "title"; value: string }
  | { type: "rich_text"; value: string }
  | { type: "number"; value: number | null }
  | { type: "select"; value: string | null }
  | { type: "checkbox"; value: boolean }
  | { type: "date"; value: string | DateValue | null }
  | { type: "url"; value: string | null }
  | { type: "email"; value: string | null }
  | { type: "phone_number"; value: string | null };

/**
 * The shape Notion expects in the request body — discriminator key
 * matches the property type. Values are pure data; no helpers / refs.
 */
export type NotionPropertyValue =
  | { title: Array<{ type: "text"; text: { content: string } }> }
  | { rich_text: Array<{ type: "text"; text: { content: string } }> }
  | { number: number | null }
  | { select: { name: string } | null }
  | { checkbox: boolean }
  | { date: DateValue | null }
  | { url: string | null }
  | { email: string | null }
  | { phone_number: string | null };

function richTextOf(s: string): Array<{ type: "text"; text: { content: string } }> {
  return [{ type: "text", text: { content: s } }];
}

function normalizeDate(value: string | DateValue | null): DateValue | null {
  if (value === null) return null;
  if (typeof value === "string") return { start: value };
  return value.end !== undefined
    ? { start: value.start, end: value.end }
    : { start: value.start };
}

/**
 * Coerce a typed property input into Notion's wire-format property
 * value. Throws `UnsupportedPropertyTypeError` when the type is outside
 * Slice 9 Batch 1's supported set.
 */
export function formatPropertyValue(
  propertyType: string,
  value: unknown,
): NotionPropertyValue {
  if (!isSupported(propertyType)) {
    throw new UnsupportedPropertyTypeError(propertyType);
  }
  switch (propertyType) {
    case "title":
      return { title: richTextOf(value as string) };
    case "rich_text":
      return { rich_text: richTextOf(value as string) };
    case "number":
      return { number: value as number | null };
    case "select":
      return {
        select:
          value === null || value === undefined
            ? null
            : { name: value as string },
      };
    case "checkbox":
      return { checkbox: value as boolean };
    case "date":
      return { date: normalizeDate(value as string | DateValue | null) };
    case "url":
      return { url: value as string | null };
    case "email":
      return { email: value as string | null };
    case "phone_number":
      return { phone_number: value as string | null };
    default: {
      // Exhaustiveness check — fails to compile if a case is missed
      // when SupportedPropertyType is widened.
      const _exhaustive: never = propertyType;
      void _exhaustive;
      throw new UnsupportedPropertyTypeError(propertyType);
    }
  }
}

/**
 * Convenience for callers building a full `properties` payload from
 * a typed input map. Each value's `type` discriminator drives the
 * format. Returns the Notion-shaped object keyed by the same property
 * names.
 */
export function formatProperties(
  inputs: Readonly<Record<string, TypedPropertyInput>>,
): Record<string, NotionPropertyValue> {
  const out: Record<string, NotionPropertyValue> = {};
  for (const [name, input] of Object.entries(inputs)) {
    out[name] = formatPropertyValue(input.type, input.value);
  }
  return out;
}

// ─── Inbound: Notion wire-format → typed value ────────────────────────────

/**
 * The shape Notion returns in get_page / query_database response
 * properties — `{ id, type, <type>: <value> }`. The discriminator is
 * `type`; the value lives at `[type]`.
 */
export interface NotionPropertyResponse {
  id?: string;
  type?: string;
  [discriminator: string]: unknown;
}

/**
 * Parsed value matches the input shape per type, with the addition of
 * `string` for title/rich_text (concatenated plain_text) since Notion
 * returns rich text as an array of segments.
 */
export type ParsedPropertyValue =
  | { type: "title"; value: string }
  | { type: "rich_text"; value: string }
  | { type: "number"; value: number | null }
  | { type: "select"; value: string | null }
  | { type: "checkbox"; value: boolean }
  | { type: "date"; value: DateValue | null }
  | { type: "url"; value: string | null }
  | { type: "email"; value: string | null }
  | { type: "phone_number"; value: string | null };

interface RichTextSegment {
  plain_text?: string;
  text?: { content?: string };
}

function concatRichText(rt: ReadonlyArray<RichTextSegment> | undefined): string {
  if (!rt) return "";
  let out = "";
  for (const seg of rt) {
    if (seg.plain_text !== undefined) out += seg.plain_text;
    else if (seg.text?.content !== undefined) out += seg.text.content;
  }
  return out;
}

/**
 * Extract a typed value from a Notion property response. Throws
 * `UnsupportedPropertyTypeError` when the type is outside Slice 9
 * Batch 1's supported set — including when the response carries a
 * deferred type (e.g., a database with a `relation` property; the
 * action returns rows whose properties include the unsupported type).
 *
 * Workflows can avoid this by selecting only supported-type properties
 * in their query; future slices that add `relation` / `people` / etc.
 * support will widen the union here.
 */
export function parsePropertyValue(
  property: NotionPropertyResponse,
): ParsedPropertyValue {
  const type = property.type;
  if (!type || !isSupported(type)) {
    throw new UnsupportedPropertyTypeError(type ?? "<missing>");
  }
  switch (type) {
    case "title":
      return {
        type: "title",
        value: concatRichText(property.title as ReadonlyArray<RichTextSegment>),
      };
    case "rich_text":
      return {
        type: "rich_text",
        value: concatRichText(
          property.rich_text as ReadonlyArray<RichTextSegment>,
        ),
      };
    case "number":
      return { type: "number", value: (property.number ?? null) as number | null };
    case "select": {
      const sel = property.select as { name?: string } | null | undefined;
      return { type: "select", value: sel?.name ?? null };
    }
    case "checkbox":
      return { type: "checkbox", value: Boolean(property.checkbox) };
    case "date": {
      const d = property.date as DateValue | null | undefined;
      if (d === null || d === undefined) return { type: "date", value: null };
      return {
        type: "date",
        value: d.end !== undefined ? { start: d.start, end: d.end } : { start: d.start },
      };
    }
    case "url":
      return { type: "url", value: (property.url as string | null | undefined) ?? null };
    case "email":
      return {
        type: "email",
        value: (property.email as string | null | undefined) ?? null,
      };
    case "phone_number":
      return {
        type: "phone_number",
        value:
          (property.phone_number as string | null | undefined) ?? null,
      };
    default: {
      const _exhaustive: never = type;
      void _exhaustive;
      throw new UnsupportedPropertyTypeError(type);
    }
  }
}

/**
 * Convenience for parsing a full properties map from a Notion page or
 * database row response. Returns `{ propertyName: ParsedPropertyValue }`.
 *
 * Skips properties whose type is unsupported by default, returning them
 * in the second element of the tuple so callers can decide whether to
 * surface a warning. This is the only spot in the module that does not
 * throw on unsupported types — the rationale: a Notion page may have
 * `relation` / `formula` properties Slice 9 doesn't support, but the
 * supported properties on the same page are still useful. Throwing
 * here would block all access to the page; skipping with a typed
 * "skipped" report lets workflows degrade gracefully.
 */
export function parseProperties(
  properties: Readonly<Record<string, NotionPropertyResponse>>,
): {
  parsed: Record<string, ParsedPropertyValue>;
  skipped: Array<{ name: string; type: string }>;
} {
  const parsed: Record<string, ParsedPropertyValue> = {};
  const skipped: Array<{ name: string; type: string }> = [];
  for (const [name, prop] of Object.entries(properties)) {
    const type = prop?.type;
    if (!type || !isSupported(type)) {
      skipped.push({ name, type: type ?? "<missing>" });
      continue;
    }
    parsed[name] = parsePropertyValue(prop);
  }
  return { parsed, skipped };
}
