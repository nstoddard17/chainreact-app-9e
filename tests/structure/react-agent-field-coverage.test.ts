/**
 * REACT-CONFIG-COVERAGE-1 — measurable parity between builder-configurable persisted fields and
 * React/Hermes-discoverable, patch-settable fields.
 *
 * The canonical source is the discovery registry (`ActionMeta` / `TriggerMeta` — the SAME metadata
 * that drives the builder config panel, readiness, and patch validation). This suite fails when any
 * AI-path surface diverges from it:
 *
 *   1. `getNodeSchema` (AI drill-down) must expose every declared field with identical
 *      name/type/required, plus every optionsSource dependency.
 *   2. `getProviderCatalog` (compact catalog) must list every field with matching type/required.
 *   3. The prompt field-schema renderer must render every declared field of every node it covers
 *      (no per-provider node-count overflow past the bound — no silent truncation).
 *   4. The editable-graph builder (edit path) must surface exactly the declared fields minus
 *      `secret`/`connection` sensitivity.
 *   5. The proposed-config sanitizer must accept OR defer (targeted input) a representative value
 *      for every declared non-secret field — never silently drop a declared field.
 *
 * It also prints the field-coverage inventory counts (total / required / optional / resolver-backed
 * / advanced) used in the slice doc.
 */
import type { FieldMeta } from "@/contracts/actionMeta";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import {
  listAllActionMetas,
  listAllTriggerMetas,
  listActionMetasForProvider,
  listTriggerMetasForProvider,
  listProvidersWithMetadata,
} from "@/services/discovery/_registry";
import { getNodeSchema, getProviderCatalog } from "@/services/ai/tools/providerCatalog";
import {
  MAX_FIELD_SCHEMA_NODES,
  buildFieldSchemaLines,
  renderFieldSchemaFragment,
} from "@/services/ai-guidance/promptFieldSchemas";
import { buildEditableWorkflowGraph } from "@/services/ai-guidance/editableGraph/buildEditableWorkflowGraph";
import { sanitizeConfigAgainstFields } from "@/services/ai-guidance/planConfig/sanitizeProposedConfig";

interface NodeMeta {
  readonly key: string;
  readonly kind: "trigger" | "action";
  readonly provider: string;
  readonly type: string;
  readonly fields: readonly FieldMeta[];
}

const ALL_NODES: NodeMeta[] = [
  ...listAllTriggerMetas().map((m) => ({
    key: m.key,
    kind: "trigger" as const,
    provider: m.provider,
    type: m.type,
    fields: m.fields,
  })),
  ...listAllActionMetas().map((m) => ({
    key: m.key,
    kind: "action" as const,
    provider: m.provider,
    type: m.type,
    fields: m.fields,
  })),
];

/** A representative value for a field, by declared type. Deferred-by-design types get a string. */
function representativeValue(f: FieldMeta): unknown {
  const itemValue = (sub: { name: string; type: string; options?: readonly { value: string }[] }): unknown =>
    sub.type === "number" ? 7 : sub.type === "boolean" ? false : sub.options?.[0]?.value ?? "sample";
  switch (f.type) {
    case "number":
      return 7;
    case "boolean":
      return false;
    case "string-array":
      return ["sample"];
    case "select":
    case "combobox": {
      const v = f.options?.[0]?.value ?? "sample";
      return f.multiple === true ? [v] : v;
    }
    case "keyvalue":
      return { k: "v" };
    case "object": {
      const out: Record<string, unknown> = {};
      for (const sub of f.itemFields ?? []) out[sub.name] = itemValue(sub);
      return out;
    }
    case "object-list": {
      const out: Record<string, unknown> = {};
      for (const sub of f.itemFields ?? []) out[sub.name] = itemValue(sub);
      return [out];
    }
    case "keyvalue-list":
      return [{ key: "k", value: "v" }];
    case "json":
      return {};
    default:
      return "sample";
  }
}

describe("React agent field coverage — canonical metadata parity", () => {
  it("has a non-trivial registry to audit", () => {
    expect(ALL_NODES.length).toBeGreaterThan(300);
  });

  it("getNodeSchema exposes every declared field with identical name/type/required + optionsSource deps", () => {
    for (const node of ALL_NODES) {
      const schema = getNodeSchema(node.key);
      expect(schema.ok).toBe(true);
      if (!schema.ok) continue;
      const byName = new Map(schema.data.fields.map((f) => [f.name, f]));
      for (const field of node.fields) {
        const exposed = byName.get(field.name);
        expect(exposed).toBeDefined();
        expect(exposed!.type).toBe(field.type);
        expect(exposed!.required).toBe(field.required);
        if (field.optionsSource) {
          const dep = schema.data.optionsSourceDeps.find((d) => d.field === field.name);
          expect(dep?.optionsSource).toBe(field.optionsSource);
        }
      }
      const required = node.fields.filter((f) => f.required).map((f) => f.name);
      expect([...schema.data.requiredFieldNames].sort()).toEqual(required.sort());
    }
  });

  it("getProviderCatalog lists every declared field with matching type/required/multiple", () => {
    const catalog = getProviderCatalog();
    expect(catalog.ok).toBe(true);
    if (!catalog.ok) return;
    const entryByKey = new Map<string, { name: string; type: string; required: boolean; multiple?: boolean }[]>();
    for (const provider of catalog.data.providers) {
      for (const a of provider.actions) entryByKey.set(a.key, [...a.configFields]);
      for (const t of provider.triggers) entryByKey.set(t.key, [...t.configFields]);
    }
    for (const node of ALL_NODES) {
      const configFields = entryByKey.get(node.key);
      expect(configFields).toBeDefined();
      const byName = new Map(configFields!.map((f) => [f.name, f]));
      for (const field of node.fields) {
        const cf = byName.get(field.name);
        expect(cf).toBeDefined();
        expect(cf!.type).toBe(field.type);
        expect(cf!.required).toBe(field.required);
        expect(cf!.multiple === true).toBe(field.multiple === true);
      }
    }
  });

  it("the prompt field-schema renderer covers every declared field, with no per-provider truncation", () => {
    for (const providerId of listProvidersWithMetadata()) {
      const nodeCount =
        listTriggerMetasForProvider(providerId).length + listActionMetasForProvider(providerId).length;
      // No silent caps: a single provider must fit the bound, or this fails loudly.
      expect(nodeCount).toBeLessThanOrEqual(MAX_FIELD_SCHEMA_NODES);
      const lines = buildFieldSchemaLines([providerId]);
      expect(lines).toHaveLength(nodeCount);
      const joined = lines.join("\n");
      for (const meta of [...listTriggerMetasForProvider(providerId), ...listActionMetasForProvider(providerId)]) {
        expect(joined).toContain(meta.key);
        for (const field of meta.fields) {
          const fragment = renderFieldSchemaFragment(field);
          expect(fragment).toContain(field.name);
          expect(fragment).toContain(field.required ? "required" : "optional");
          if (field.advanced === true) expect(fragment).toContain("advanced");
          if (field.optionsSource) expect(fragment).toContain("dynamic options");
          expect(joined).toContain(fragment);
        }
      }
    }
  });

  it("the editable graph (edit path) surfaces exactly the declared fields minus secret/connection", () => {
    for (const node of ALL_NODES) {
      const def: WorkflowDefinition = {
        nodes: [
          {
            id: "n-1",
            kind: node.kind,
            provider: node.provider,
            type: node.type,
            config: {},
            position: { x: 0, y: 0 },
          },
        ],
        edges: [],
      };
      const { graph } = buildEditableWorkflowGraph(def);
      const exposed = new Set(graph.nodes[0]!.config.map((f) => f.key));
      for (const field of node.fields) {
        const shouldExpose = field.sensitivity !== "secret" && field.sensitivity !== "connection";
        expect(exposed.has(field.name)).toBe(shouldExpose);
      }
    }
  });

  it("every declared non-secret field is patch-settable: a representative value is kept or deferred, never silently dropped", () => {
    for (const node of ALL_NODES) {
      for (const field of node.fields) {
        const result = sanitizeConfigAgainstFields({ [field.name]: representativeValue(field) }, node.fields);
        if (field.sensitivity === "secret" || field.sensitivity === "connection") {
          expect(result.droppedFields).toEqual([field.name]);
          continue;
        }
        const kept = field.name in result.config;
        const deferred = result.deferredFields.includes(field.name);
        if (!kept && !deferred) {
          throw new Error(`Field '${node.key}.${field.name}' (${field.type}) was silently dropped`);
        }
        expect(result.droppedFields).toHaveLength(0);
      }
    }
  });

  it("prints the field-coverage inventory", () => {
    let total = 0;
    let required = 0;
    let optional = 0;
    let resolverBacked = 0;
    let advanced = 0;
    let secretOrConnection = 0;
    for (const node of ALL_NODES) {
      for (const f of node.fields) {
        total += 1;
        if (f.required) required += 1;
        else optional += 1;
        if (f.optionsSource) resolverBacked += 1;
        if (f.advanced === true) advanced += 1;
        if (f.sensitivity === "secret" || f.sensitivity === "connection") secretOrConnection += 1;
      }
    }
    console.log(
      `[react-agent-field-coverage] nodes=${ALL_NODES.length} fields=${total} required=${required} optional=${optional} resolverBacked=${resolverBacked} advanced=${advanced} secretOrConnection=${secretOrConnection}`,
    );
    expect(total).toBeGreaterThan(0);
  });
});
