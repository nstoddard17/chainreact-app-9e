import { createHash } from "node:crypto";

/**
 * Minimal JSON Schema reader for the MCP compiler (CS-2).
 *
 * Deliberately supports ONLY the constructs the field compiler can translate
 * into first-class V2 fields; everything else surfaces as a typed
 * `UnsupportedNode` so `compileFields` can fail loudly (never a silent
 * fallback, never a raw-JSON editor). Full JSON Schema 2020-12 is explicitly
 * out of scope — the catalog curates around gaps.
 */

export interface SchemaNode {
  readonly type: string | null;
  readonly nullable: boolean;
  readonly description: string | null;
  readonly enumValues: readonly string[] | null;
  readonly format: string | null;
  readonly defaultValue: unknown;
  readonly minimum: number | null;
  readonly maximum: number | null;
  readonly maxItems: number | null;
  readonly maxLength: number | null;
  readonly properties: ReadonlyMap<string, Record<string, unknown>> | null;
  readonly required: readonly string[];
  readonly items: Record<string, unknown> | null;
  readonly unsupported: string | null;
}

const SUPPORTED_KEYWORD_TYPES = new Set([
  "string",
  "number",
  "integer",
  "boolean",
  "object",
  "array",
]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Normalize one schema node. Handles the common nullable encodings
 * (`type: ["string","null"]`, `anyOf: [X, {type:"null"}]`) by unwrapping to
 * the non-null branch with `nullable: true`. Any other union / `$ref` /
 * combinator is reported via `unsupported`.
 */
export function readSchemaNode(raw: unknown): SchemaNode {
  const empty: SchemaNode = {
    type: null,
    nullable: false,
    description: null,
    enumValues: null,
    format: null,
    defaultValue: undefined,
    minimum: null,
    maximum: null,
    maxItems: null,
    maxLength: null,
    properties: null,
    required: [],
    items: null,
    unsupported: null,
  };
  if (!isPlainObject(raw)) {
    return { ...empty, unsupported: "schema node is not an object" };
  }

  let node = raw;
  let nullable = false;
  // MCP-NULLABLE-DESCRIPTIONS-1 — vendors put the field's documentation on the
  // WRAPPER of the nullable idiom (`{description, anyOf:[X, {type:"null"}]}`),
  // not on the inner branch. Replacing `node` with the inner branch used to
  // silently drop it, shipping fields with no guidance at all (Linear's
  // nullable params, e.g. assignee). Capture the wrapper's ANNOTATIONS before
  // unwrapping; the inner branch stays the sole structural/validation source
  // (no type/enum/bounds/properties are ever copied from the wrapper), and an
  // inner annotation wins when both declare one.
  let outerDescription: string | null = null;
  let outerDefault: unknown = undefined;

  // anyOf/oneOf: support ONLY the `[X, {type:"null"}]` nullable idiom.
  const union = node.anyOf ?? node.oneOf;
  if (Array.isArray(union)) {
    const nonNull = union.filter(
      (b) => !(isPlainObject(b) && b.type === "null"),
    );
    if (nonNull.length === 1 && union.length !== nonNull.length && isPlainObject(nonNull[0])) {
      nullable = true;
      outerDescription = typeof node.description === "string" ? node.description : null;
      outerDefault = node.default;
      node = nonNull[0];
    } else {
      return { ...empty, unsupported: "anyOf/oneOf union (only the nullable idiom is supported)" };
    }
  }
  for (const kw of ["allOf", "$ref", "not", "if", "then", "else", "patternProperties"]) {
    if (kw in node) return { ...empty, unsupported: `'${kw}' is not supported` };
  }

  // type: ["string","null"] nullable idiom.
  let type: string | null = null;
  if (typeof node.type === "string") {
    type = node.type;
  } else if (Array.isArray(node.type)) {
    const nonNull = node.type.filter((t) => t !== "null");
    if (nonNull.length === 1 && typeof nonNull[0] === "string") {
      type = nonNull[0];
      nullable = nullable || node.type.includes("null");
    } else {
      return { ...empty, unsupported: "multi-type arrays beyond the nullable idiom" };
    }
  }

  const enumRaw = node.enum;
  let enumValues: string[] | null = null;
  if (Array.isArray(enumRaw)) {
    if (!enumRaw.every((v) => typeof v === "string")) {
      return { ...empty, unsupported: "non-string enum values" };
    }
    enumValues = enumRaw as string[];
    if (type === null) type = "string";
  }

  if (type !== null && !SUPPORTED_KEYWORD_TYPES.has(type)) {
    return { ...empty, unsupported: `type '${type}' is not supported` };
  }
  if (type === null && enumValues === null) {
    return { ...empty, unsupported: "schema node declares no usable type" };
  }

  let properties: Map<string, Record<string, unknown>> | null = null;
  if (isPlainObject(node.properties)) {
    properties = new Map();
    for (const [k, v] of Object.entries(node.properties)) {
      if (!isPlainObject(v)) {
        return { ...empty, unsupported: `property '${k}' schema is not an object` };
      }
      properties.set(k, v);
    }
  }
  if (type === "object" && node.additionalProperties === true) {
    return { ...empty, unsupported: "open object (additionalProperties: true)" };
  }
  if (type === "object" && !properties) {
    return { ...empty, unsupported: "object without declared properties" };
  }

  return {
    type,
    nullable,
    description:
      typeof node.description === "string" ? node.description : outerDescription,
    enumValues,
    format: typeof node.format === "string" ? node.format : null,
    defaultValue: node.default !== undefined ? node.default : outerDefault,
    minimum: typeof node.minimum === "number" ? node.minimum : null,
    maximum: typeof node.maximum === "number" ? node.maximum : null,
    maxItems: typeof node.maxItems === "number" ? node.maxItems : null,
    maxLength: typeof node.maxLength === "number" ? node.maxLength : null,
    properties,
    required: Array.isArray(node.required)
      ? node.required.filter((r): r is string => typeof r === "string")
      : [],
    items: isPlainObject(node.items) ? node.items : null,
    unsupported: null,
  };
}

/** Canonical (sorted-key) JSON — stable across property ordering. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** sha256 of the canonical JSON — the drift-pinning hash for a tool schema. */
export function schemaHash(schema: Record<string, unknown>): string {
  return createHash("sha256").update(canonicalJson(schema)).digest("hex");
}
