/**
 * @jest-environment node
 *
 * V2-READY-18 — official-template node registration (structural, no-DB).
 *
 * The seeded official templates are the only user-facing template definitions in
 * the repo; each node carries a real `provider`/`type` identity (their configs
 * are empty placeholders the user fills on /use). If a provider:action/trigger
 * is renamed or removed from the registry, a seeded template silently references
 * a node that no longer exists — a broken "use template" for users (the template
 * analogue of the metadata drift fixed in V2-READY-14/16/17).
 *
 * The existing seed test (tests/unit/migrations/seedOfficialTemplates.test.ts)
 * validates node ids against a HARDCODED `KNOWN_NODES` constant, which stays
 * self-consistent and so CANNOT catch a registry rename. This guard validates
 * each node's `provider:type` against the LIVE discovery registry
 * (getActionMeta / getTriggerMeta), plus — forward-looking, for any future
 * template that ships a non-empty config — that config keys are known field
 * names and every {{nodeId.*}} reference targets a node in the same graph.
 *
 * Definitions are sourced from the seed SQL the same way the seed test does
 * (readFileSync + jsonb-literal regex) — no DB, no mocks.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { getActionMeta, getTriggerMeta } from "@/services/discovery/_registry";
import { parseReferences } from "@/core/workflows/variableReferences";

// Discover EVERY official-seed migration (batch 1 + 2 + any future batch) rather than
// hard-coding one file, so this guard validates the whole shipped catalog against the live
// registry — a renamed/removed provider:type breaks a seeded template's /use for users.
const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");
const SEED_FILES = readdirSync(MIGRATIONS)
  .filter((f) => /_seed_official_templates.*\.sql$/.test(f))
  .sort();
const code = SEED_FILES.map((f) =>
  readFileSync(join(MIGRATIONS, f), "utf8").replace(/--[^\n]*/g, ""),
).join("\n");

interface TemplateNode {
  id: string;
  kind: "trigger" | "action";
  provider: string;
  type: string;
  config?: Record<string, unknown>;
}
interface TemplateDefinition {
  nodes: TemplateNode[];
  edges: unknown[];
}

const definitions: TemplateDefinition[] = [
  ...code.matchAll(/'(\{.*?\})'::jsonb/g),
].map((m) => JSON.parse(m[1]!) as TemplateDefinition);

function metaFor(node: TemplateNode) {
  const key = `${node.provider}:${node.type}`;
  return node.kind === "trigger" ? getTriggerMeta(key) : getActionMeta(key);
}

/** Recursively collect every {{nodeId.path}} reference from a config value. */
function collectRefs(value: unknown): { nodeId: string }[] {
  if (typeof value === "string") return [...parseReferences(value)];
  if (Array.isArray(value)) return value.flatMap(collectRefs);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(collectRefs);
  }
  return [];
}

describe("official-template node registration (V2-READY-18)", () => {
  it("the seed parse found official template definitions (sanity)", () => {
    expect(definitions.length).toBeGreaterThan(0);
    expect(
      definitions.every((d) => Array.isArray(d.nodes) && d.nodes.length > 0),
    ).toBe(true);
  });

  it("every template node provider:type resolves to a registered action/trigger (live registry)", () => {
    const unregistered: string[] = [];
    for (const def of definitions) {
      for (const node of def.nodes) {
        if (metaFor(node) === undefined) {
          unregistered.push(`${node.kind} ${node.provider}:${node.type}`);
        }
      }
    }
    expect(unregistered).toEqual([]);
  });

  it("every node config key is a known field name in its meta (forward-looking; empty configs pass)", () => {
    const unknownFields: string[] = [];
    for (const def of definitions) {
      for (const node of def.nodes) {
        const meta = metaFor(node);
        if (!meta) continue; // reported by the registration test above
        const fieldNames = new Set(meta.fields.map((f) => f.name));
        for (const key of Object.keys(node.config ?? {})) {
          if (!fieldNames.has(key)) {
            unknownFields.push(`${node.provider}:${node.type}.${key}`);
          }
        }
      }
    }
    expect(unknownFields).toEqual([]);
  });

  it("every {{nodeId.*}} reference targets a node in the graph or the trigger alias (forward-looking)", () => {
    const dangling: string[] = [];
    for (const def of definitions) {
      const nodeIds = new Set(def.nodes.map((n) => n.id));
      for (const node of def.nodes) {
        for (const ref of collectRefs(node.config)) {
          if (ref.nodeId !== "trigger" && !nodeIds.has(ref.nodeId)) {
            dangling.push(`${node.id} -> {{${ref.nodeId}...}}`);
          }
        }
      }
    }
    expect(dangling).toEqual([]);
  });
});
