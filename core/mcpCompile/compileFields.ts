import type { FieldMeta } from "@/contracts/actionMeta";
import { readSchemaNode, type SchemaNode } from "./jsonSchema";
import type {
  CompileDiagnostic,
  CompiledFieldIr,
  CompiledFieldKind,
  CompiledObjectMemberIr,
  McpCatalogFieldOverride,
} from "./types";

/**
 * Field compiler (CS-2): tool `inputSchema` → per-field IR + `FieldMeta`.
 *
 * Mapping table (plan §4.3): string→text (multiline heuristic/override →
 * textarea) · enum→select · format date/date-time→date/datetime-utc ·
 * number/integer→number(+bounds) · boolean→boolean · string[]→string-array ·
 * enum[]→multi-select · flat object→`object` editor · array of flat
 * objects→`object-list`. Anything else is a diagnostic — compilation FAILS
 * unless the catalog omits the (optional) field. Never a raw JSON editor.
 */

const MULTILINE_NAME_HINTS = new Set([
  "description",
  "body",
  "content",
  "text",
  "comment",
  "message",
  "notes",
  "markdown",
]);

/** "dueDate" / "team_id" → "Due date" / "Team id". */
export function humanizeFieldName(name: string): string {
  const words = name
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return words.length === 0 ? name : words[0]!.toUpperCase() + words.slice(1);
}

function enumOptions(values: readonly string[]) {
  return values.map((v) => ({ value: v, label: humanizeFieldName(v) }));
}

function memberFromNode(
  name: string,
  node: SchemaNode,
  required: boolean,
): CompiledObjectMemberIr | string {
  if (node.unsupported) return node.unsupported;
  if (node.enumValues) {
    return { name, required, kind: { k: "enum", values: node.enumValues } };
  }
  switch (node.type) {
    case "string":
      return { name, required, kind: { k: "string" } };
    case "number":
    case "integer":
      return { name, required, kind: { k: "number", integer: node.type === "integer" } };
    case "boolean":
      return { name, required, kind: { k: "boolean" } };
    default:
      return `nested member '${name}' has unsupported type '${node.type ?? "unknown"}' (one level of scalars only)`;
  }
}

function readObjectMembers(
  node: SchemaNode,
): { members: CompiledObjectMemberIr[] } | { error: string } {
  const members: CompiledObjectMemberIr[] = [];
  const requiredSet = new Set(node.required);
  for (const [name, raw] of node.properties ?? []) {
    const child = readSchemaNode(raw);
    const m = memberFromNode(name, child, requiredSet.has(name));
    if (typeof m === "string") return { error: m };
    members.push(m);
  }
  if (members.length === 0) return { error: "object with zero usable members" };
  return { members };
}

export interface CompileFieldsResult {
  readonly fields: CompiledFieldIr[];
  readonly diagnostics: CompileDiagnostic[];
}

export function compileFields(
  tool: string,
  inputSchema: Record<string, unknown>,
  overrides: Readonly<Record<string, McpCatalogFieldOverride>>,
): CompileFieldsResult {
  const fields: CompiledFieldIr[] = [];
  const diagnostics: CompileDiagnostic[] = [];
  const root = readSchemaNode(inputSchema);

  if (root.unsupported || root.type !== "object" || !root.properties) {
    diagnostics.push({
      tool,
      path: "(root)",
      reason: root.unsupported ?? "tool inputSchema must be an object schema",
    });
    return { fields, diagnostics };
  }

  const requiredSet = new Set(root.required);
  for (const [name, rawChild] of root.properties) {
    const override = overrides[name] ?? {};
    const node = readSchemaNode(rawChild);
    const required =
      override.required ?? (requiredSet.has(name) && !node.nullable);
    const path = `properties.${name}`;

    if (override.omit) {
      if (required) {
        diagnostics.push({ tool, path, reason: "cannot omit a REQUIRED field" });
      }
      continue;
    }
    if (node.unsupported) {
      diagnostics.push({ tool, path, reason: node.unsupported });
      continue;
    }

    const kindOrError = fieldKind(name, node, override, path);
    if ("error" in kindOrError) {
      diagnostics.push({ tool, path, reason: kindOrError.error });
      continue;
    }
    const kind = kindOrError.kind;

    const meta: FieldMeta = buildFieldMeta(name, node, kind, required, override);
    fields.push({ name, required, nullable: node.nullable, kind, meta });
  }

  if (fields.length === 0 && diagnostics.length === 0) {
    diagnostics.push({ tool, path: "(root)", reason: "tool declares zero input properties" });
  }
  return { fields, diagnostics };
}

function fieldKind(
  name: string,
  node: SchemaNode,
  override: McpCatalogFieldOverride,
  path: string,
): { kind: CompiledFieldKind } | { error: string } {
  if (node.enumValues) return { kind: { k: "enum", values: node.enumValues } };

  switch (node.type) {
    case "string": {
      if (node.format === "date") return { kind: { k: "date" } };
      if (node.format === "date-time") return { kind: { k: "datetime" } };
      const multiline =
        override.multiline === true ||
        MULTILINE_NAME_HINTS.has(name.toLowerCase()) ||
        (node.maxLength !== null && node.maxLength > 256);
      return { kind: { k: "string", multiline } };
    }
    case "integer":
    case "number":
      return {
        kind: {
          k: "number",
          integer: node.type === "integer",
          ...(node.minimum !== null ? { min: node.minimum } : {}),
          ...(node.maximum !== null ? { max: node.maximum } : {}),
        },
      };
    case "boolean":
      return { kind: { k: "boolean" } };
    case "array": {
      if (!node.items) return { error: "array without an items schema" };
      const item = readSchemaNode(node.items);
      if (item.unsupported) return { error: `array items: ${item.unsupported}` };
      if (item.enumValues) return { kind: { k: "enum-array", values: item.enumValues } };
      if (item.type === "string") {
        return {
          kind: { k: "string-array", ...(node.maxItems !== null ? { maxItems: node.maxItems } : {}) },
        };
      }
      if (item.type === "object") {
        const m = readObjectMembers(item);
        if ("error" in m) return { error: `array items: ${m.error}` };
        return {
          kind: {
            k: "object-list",
            members: m.members,
            ...(node.maxItems !== null ? { maxItems: node.maxItems } : {}),
          },
        };
      }
      return { error: `array of '${item.type ?? "unknown"}' is not supported (${path})` };
    }
    case "object": {
      const m = readObjectMembers(node);
      if ("error" in m) return { error: m.error };
      return { kind: { k: "object", members: m.members } };
    }
    default:
      return { error: `unsupported type '${node.type ?? "unknown"}'` };
  }
}

function itemFieldsFromMembers(members: readonly CompiledObjectMemberIr[]) {
  return members.map((m) => {
    const base = {
      name: m.name,
      label: humanizeFieldName(m.name),
      required: m.required,
    };
    switch (m.kind.k) {
      case "enum":
        return { ...base, type: "select" as const, options: enumOptions(m.kind.values) };
      case "number":
        return { ...base, type: "number" as const };
      case "boolean":
        return { ...base, type: "boolean" as const };
      case "string":
        return { ...base, type: "text" as const };
    }
  });
}

function buildFieldMeta(
  name: string,
  node: SchemaNode,
  kind: CompiledFieldKind,
  required: boolean,
  override: McpCatalogFieldOverride,
): FieldMeta {
  const base = {
    name,
    label: override.label ?? humanizeFieldName(name),
    required,
    ...(override.description ?? node.description
      ? { description: override.description ?? node.description! }
      : {}),
    ...(override.placeholder ? { placeholder: override.placeholder } : {}),
    ...(override.advanced ? { advanced: true } : {}),
    ...(override.sensitivity ? { sensitivity: override.sensitivity } : {}),
    ...(node.defaultValue !== undefined ? { defaultValue: node.defaultValue } : {}),
    ...(override.optionsSource ? { optionsSource: override.optionsSource } : {}),
    ...(override.dependsOn ? { dependsOn: override.dependsOn } : {}),
  };

  switch (kind.k) {
    case "string":
      // A string field with an option source becomes a COMBOBOX — a picker whose
      // committed VALUE stays a string (the id/name the runtime schema expects);
      // the widget adds the dropdown + keeps free-text entry (the name-or-id
      // manual path). Widget upgrade only (RESOLVERS-3/4); the zod schema stays
      // `z.string()`. A multiline+optionsSource combination makes no sense, so the
      // picker wins.
      if (override.optionsSource) return { ...base, type: "combobox" } as FieldMeta;
      return { ...base, type: kind.multiline ? "textarea" : "text" } as FieldMeta;
    case "enum":
      return { ...base, type: "select", options: enumOptions(kind.values) } as FieldMeta;
    case "enum-array":
      return {
        ...base,
        type: "select",
        multiple: true,
        options: enumOptions(kind.values),
      } as FieldMeta;
    case "number": {
      const numeric = {
        ...(kind.min !== undefined ? { min: kind.min } : {}),
        ...(kind.max !== undefined ? { max: kind.max } : {}),
        ...(kind.integer ? { integer: true } : {}),
      };
      return {
        ...base,
        type: "number",
        ...(Object.keys(numeric).length > 0 ? { numeric } : {}),
      } as FieldMeta;
    }
    case "boolean":
      return { ...base, type: "boolean" } as FieldMeta;
    case "date":
      return { ...base, type: "date" } as FieldMeta;
    case "datetime":
      return { ...base, type: "datetime-utc" } as FieldMeta;
    case "string-array":
      return {
        ...base,
        type: "string-array",
        ...(kind.maxItems !== undefined ? { stringArrayMaxItems: kind.maxItems } : {}),
      } as FieldMeta;
    case "object":
      return { ...base, type: "object", itemFields: itemFieldsFromMembers(kind.members) } as FieldMeta;
    case "object-list":
      return {
        ...base,
        type: "object-list",
        itemFields: itemFieldsFromMembers(kind.members),
        ...(kind.maxItems !== undefined ? { listMaxItems: kind.maxItems } : {}),
      } as FieldMeta;
  }
}
