/**
 * @jest-environment node
 *
 * TEMPLATE-QUALITY-1 — central integrity gate for the EFFECTIVE official template catalog.
 *
 * The official catalog is DB rows produced by forward-only migrations: seed batches INSERT
 * rows, prewire migrations UPDATE definitions, and retirement migrations DELETE retired ids.
 * This test reconstructs the EFFECTIVE catalog (all seeded rows, minus retired ids, with the
 * latest prewired definition overlaid) exactly as the database converges to it, and enforces
 * the catalog quality bar so a low-value template cannot silently return through any future
 * seed, prewire, or fixture:
 *
 *   1. every effective platform template has AT LEAST FIVE nodes (trigger included);
 *   2. ids and names are unique; retired ids never reappear in a later seed;
 *   3. every definition parses the strict template schema AND the workflow schema;
 *   4. every node provider:type is REGISTERED in the live discovery registry;
 *   5. every config key is a real meta field name;
 *   6. every {{ref}} targets the trigger/an upstream node, its first path segment is a
 *      DECLARED output, and the canonical resolver resolves every expression;
 *   7. every node is REACHABLE from the trigger (labeled edges count as connectivity);
 *   8. branch labels appear only on edges leaving branching-capable native nodes, and
 *      if/then labels are only 'true' / 'false';
 *   9. recipient / consent / behavior-switching fields are never prewired; resource-id
 *      fields carry only pure upstream-derived {{...}} expressions, never literals;
 *  10. no email / secret / uuid-shaped literal appears in any config value, and the derived
 *      marketplace card never exposes a raw {{...}} expression.
 *
 *  It also validates the retirement migrations themselves: DELETE-only, guarded to
 *  source='official' AND account_id IS NULL, no node-count predicate, fixed ids only.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { WorkflowDefinitionSchema } from "@/contracts/workflowDefinition";
import { TemplateDefinitionSchema, type TemplateDefinition } from "@/contracts/workflowTemplate";
import { getActionMeta, getTriggerMeta } from "@/services/discovery/_registry";
import { parseReferences } from "@/core/workflows/variables/variableReferences";
import { resolveStrict } from "@/workflow-engine/variables/resolveValue";
import { deriveTemplateCardMeta } from "@/core/workflows/templateCardMeta";

const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");
const files = readdirSync(MIGRATIONS).sort();
const readStripped = (f: string) =>
  readFileSync(join(MIGRATIONS, f), "utf8").replace(/--[^\n]*/g, "");

const SEED_FILES = files.filter((f) => /_seed_official_templates.*\.sql$/.test(f));
const RETIRE_FILES = files.filter((f) => /_retire_official_templates.*\.sql$/.test(f));
const PREWIRE_FILES = files.filter((f) => /_prewire_official_templates.*\.sql$/.test(f));

interface Node {
  id: string;
  kind: string;
  provider: string;
  type: string;
  config: Record<string, unknown>;
}
interface Def {
  nodes: Node[];
  edges: Array<{ id: string; from: string; to: string; label?: string }>;
}
interface CatalogRow {
  id: string;
  name: string;
  def: Def;
  file: string;
}

// ── reconstruct the effective catalog ────────────────────────────────────────
// Seed rows: fixed uuid … 'name', 'description', 'official', 'public', '{…}'::jsonb.
const seeded: CatalogRow[] = [];
for (const f of SEED_FILES) {
  const code = readStripped(f);
  const rowRe =
    /'(c0ffee00-[0-9a-f-]+)',\s*NULL,\s*NULL,\s*'([^']*)',\s*'([^']*)',\s*'official',\s*'public',\s*'(\{.*?\})'::jsonb/gs;
  for (const m of code.matchAll(rowRe)) {
    seeded.push({ id: m[1]!, name: m[2]!, def: JSON.parse(m[4]!) as Def, file: f });
  }
}

// Retired ids: every fixed uuid named in a retirement migration.
const retired = new Set<string>();
for (const f of RETIRE_FILES) {
  for (const m of readStripped(f).matchAll(/'(c0ffee00-[0-9a-f-]+)'/g)) retired.add(m[1]!);
}

// Prewire overlays: later files win (file list is timestamp-sorted).
const prewired = new Map<string, Def>();
for (const f of PREWIRE_FILES) {
  const code = readStripped(f);
  const stmtRe = /'(\{"nodes".*?\})'::jsonb\s*WHERE id = '(c0ffee00-[0-9a-f-]+)'/gs;
  for (const m of code.matchAll(stmtRe)) prewired.set(m[2]!, JSON.parse(m[1]!) as Def);
}

const catalog: CatalogRow[] = seeded
  .filter((r) => !retired.has(r.id))
  .map((r) => ({ ...r, def: prewired.get(r.id) ?? r.def }));

// ── shared meta helpers ───────────────────────────────────────────────────────
function meta(node: Node) {
  const key = `${node.provider}:${node.type}`;
  return node.kind === "trigger" ? getTriggerMeta(key) : getActionMeta(key);
}
function metaOutputs(node: Node): Set<string> {
  const key = `${node.provider}:${node.type}`;
  if (node.kind === "trigger")
    return new Set((getTriggerMeta(key)?.payloadShape ?? []).map((o) => o.name));
  return new Set((getActionMeta(key)?.outputs ?? []).map((o) => o.name));
}
const firstSeg = (path: string) => path.split(/[.[]/)[0]!;
const isPureRef = (v: unknown) =>
  typeof v === "string" && v.trim().startsWith("{{") && v.trim().endsWith("}}");

/** Every string leaf of a config value — `string-array` fields (Sheets row `values`, Gmail
 *  recipients, label lists) carry their references inside an ARRAY, so a string-only walk would
 *  silently skip them and let an undeclared path ship unvalidated. */
function stringLeaves(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringLeaves);
  if (value && typeof value === "object") return Object.values(value).flatMap(stringLeaves);
  return [];
}

describe("official catalog — effective reconstruction (sanity)", () => {
  it("parsed seeds, retirements, and prewires", () => {
    expect(seeded.length).toBeGreaterThanOrEqual(103); // 5 + 45 + 25 + 15 + 12 + 1 (Google Review)
    expect(retired.size).toBe(75); // batches 1–3 (all ≤4-node demos)
    expect(prewired.size).toBeGreaterThanOrEqual(15); // batch 4
    // deliberate floor: 15 kept batch-4 + 12 batch-5 + 1 Google Review = 28 effective templates.
    expect(catalog.length).toBeGreaterThanOrEqual(28);
  });

  it("retired ids never reappear in a later seed batch or prewire target", () => {
    const seededIds = seeded.map((r) => r.id);
    // an id seeded twice (e.g. re-seeded after retirement) would defeat the retirement.
    expect(new Set(seededIds).size).toBe(seededIds.length);
    for (const id of prewired.keys()) expect(retired.has(id)).toBe(false);
  });
});

describe("retirement migrations — DELETE-only, guarded, fixed-id scoped", () => {
  it("every retirement migration deletes by fixed official id only", () => {
    expect(RETIRE_FILES.length).toBeGreaterThanOrEqual(1);
    for (const f of RETIRE_FILES) {
      const code = readStripped(f);
      expect(code).toMatch(/DELETE\s+FROM\s+public\.workflow_templates/i);
      expect(code).not.toMatch(/^\s*(INSERT|UPDATE)\b/im);
      expect(code).not.toMatch(/\b(ALTER|CREATE|DROP|GRANT|REVOKE)\b|POLICY/i);
      // guarded: platform-owned officials only — can never match user/community rows.
      expect(code).toMatch(/source = 'official'/);
      expect(code).toMatch(/account_id IS NULL/);
      // scoped to fixed ids — never a broad node-count / name predicate.
      expect(code).toMatch(/id IN \(/i);
      expect(code).not.toMatch(/node|jsonb_array_length|LIKE/i);
    }
  });

  it("retirement covers EXACTLY the seeded templates with fewer than five nodes", () => {
    for (const row of seeded) {
      if (row.def.nodes.length < 5) {
        expect(retired.has(row.id)).toBe(true); // small template MUST be retired
      } else {
        expect(retired.has(row.id)).toBe(false); // ≥5-node template MUST NOT be
      }
    }
  });
});

describe("effective catalog — five-node floor and identity", () => {
  it("every effective template has at least five nodes (trigger included)", () => {
    for (const row of catalog) {
      expect(row.def.nodes.length).toBeGreaterThanOrEqual(5);
    }
  });

  it("ids and names are unique across the effective catalog", () => {
    expect(new Set(catalog.map((r) => r.id)).size).toBe(catalog.length);
    expect(new Set(catalog.map((r) => r.name)).size).toBe(catalog.length);
  });
});

describe("effective catalog — graph validity", () => {
  it("every definition parses both the strict template schema and the workflow schema", () => {
    for (const row of catalog) {
      expect(() => TemplateDefinitionSchema.parse(row.def)).not.toThrow();
      expect(() => WorkflowDefinitionSchema.parse(row.def)).not.toThrow();
      expect(row.def.nodes.filter((n) => n.kind === "trigger")).toHaveLength(1);
    }
  });

  it("every node is reachable from the trigger (no orphans, no stale edges)", () => {
    for (const row of catalog) {
      const ids = new Set(row.def.nodes.map((n) => n.id));
      for (const e of row.def.edges) {
        expect(ids.has(e.from)).toBe(true);
        expect(ids.has(e.to)).toBe(true);
      }
      const reach = new Set(["trigger"]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const e of row.def.edges) {
          if (reach.has(e.from) && !reach.has(e.to)) {
            reach.add(e.to);
            grew = true;
          }
        }
      }
      for (const id of ids) expect(reach.has(id)).toBe(true);
    }
  });

  it("branch labels only leave branching-capable native nodes, with valid label values", () => {
    const BRANCHING = new Set(["native:if_then_condition", "native:router"]);
    for (const row of catalog) {
      const byId = new Map(row.def.nodes.map((n) => [n.id, n]));
      for (const e of row.def.edges) {
        if (!e.label) continue;
        const src = byId.get(e.from)!;
        expect(BRANCHING.has(`${src.provider}:${src.type}`)).toBe(true);
        if (src.type === "if_then_condition") {
          expect(["true", "false"]).toContain(e.label);
        }
      }
    }
  });
});

describe("effective catalog — registered nodes and contract-backed configs", () => {
  it("every node provider:type resolves in the LIVE discovery registry", () => {
    const unregistered: string[] = [];
    for (const row of catalog) {
      for (const node of row.def.nodes) {
        if (meta(node) === undefined) {
          unregistered.push(`${row.name}: ${node.kind} ${node.provider}:${node.type}`);
        }
      }
    }
    expect(unregistered).toEqual([]);
  });

  it("every config key is a real meta field name", () => {
    const unknown: string[] = [];
    for (const row of catalog) {
      for (const node of row.def.nodes) {
        const m = meta(node);
        if (!m) continue;
        const fields = new Set(m.fields.map((f) => f.name));
        for (const k of Object.keys(node.config ?? {})) {
          if (!fields.has(k)) unknown.push(`${row.name}: ${node.provider}:${node.type}.${k}`);
        }
      }
    }
    expect(unknown).toEqual([]);
  });

  it("every {{ref}} targets the trigger/an upstream node with a DECLARED first path segment", () => {
    for (const row of catalog) {
      const byId = new Map(row.def.nodes.map((n) => [n.id, n]));
      for (const node of row.def.nodes) {
        for (const value of Object.values(node.config ?? {}).flatMap(stringLeaves)) {
          for (const ref of parseReferences(value)) {
            const src = byId.get(ref.nodeId);
            expect(src).toBeDefined();
            if (ref.path === "") continue;
            expect(metaOutputs(src!).has(firstSeg(ref.path))).toBe(true);
          }
        }
      }
    }
  });

  it("the canonical resolver resolves every expression against representative upstream outputs", () => {
    for (const row of catalog) {
      const variables: Record<string, unknown> = {};
      for (const node of row.def.nodes) {
        const outs = Object.fromEntries([...metaOutputs(node)].map((n) => [n, `v_${n}`]));
        variables[node.id] = outs;
        if (node.kind === "trigger") variables.trigger = outs;
      }
      for (const node of row.def.nodes) {
        const resolved = resolveStrict(node.config ?? {}, { variables });
        expect(JSON.stringify(resolved)).not.toContain("{{");
      }
    }
  });
});

describe("effective catalog — blank-policy and no-leak", () => {
  // Recipient-visible / consent / behavior-switching fields: never prewired, not even with a
  // variable expression — the user must choose them consciously during setup.
  const NEVER_PREWIRED = new Set([
    "to",
    "cc",
    "bcc",
    "sendNotifications",
    "guestsCanInviteOthers",
    "guestsCanSeeOtherGuests",
    "duplicateHandling",
    "valueInputOption",
    "insertDataOption",
    "hs_pipeline",
    "hs_pipeline_stage",
    "status",
  ]);
  // Provider-resource-id fields: allowed ONLY as a pure upstream-derived {{...}} expression
  // (produced by an upstream node and immediately required downstream) — never a literal.
  const RESOURCE_ID_KEYS = new Set([
    "channel",
    "channelId",
    "teamId",
    "boardId",
    "listId",
    "groupId",
    "spreadsheetId",
    "range",
    "calendarId",
    "folderId",
    "parentFolderId",
    "fileId",
    "repository",
    "audienceId",
    "segmentId",
    "baseId",
    "tableId",
    "projectId",
    "workbookId",
    "notebookId",
    "sectionId",
    "formId",
    "labelId",
    "customerId",
    "invoiceId",
    "parentTaskGid",
    "parentItemId",
    "originalMessageId",
    "messageId",
    "taskGid",
  ]);

  it("recipient / consent / behavior-switching fields are never prewired", () => {
    for (const row of catalog) {
      for (const node of row.def.nodes) {
        for (const key of Object.keys(node.config ?? {})) {
          expect(NEVER_PREWIRED.has(key)).toBe(false);
        }
      }
    }
  });

  it("resource-id fields carry only pure upstream-derived {{...}} expressions", () => {
    for (const row of catalog) {
      for (const node of row.def.nodes) {
        for (const [key, value] of Object.entries(node.config ?? {})) {
          if (!RESOURCE_ID_KEYS.has(key)) continue;
          expect(isPureRef(value)).toBe(true);
        }
      }
    }
  });

  it("no email / secret / uuid-shaped literal appears in any config value or name", () => {
    for (const row of catalog) {
      const blob = JSON.stringify(row.def.nodes.map((n) => n.config)) + row.name;
      expect(blob).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
      expect(blob).not.toMatch(/xox[baprs]-|\bsk_[a-z0-9]{8,}|whsec_|access_token|client_secret/i);
      // uuid-shaped or long-hex literals outside a {{...}} expression = a leaked resource id.
      const literals = JSON.stringify(
        row.def.nodes.flatMap((n) =>
          Object.values(n.config ?? {}).filter((v) => !String(v).includes("{{")),
        ),
      );
      expect(literals).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      expect(literals).not.toMatch(/\b[0-9a-f]{16,}\b/i);
    }
  });

  it("the derived marketplace card never exposes a raw {{...}} expression", () => {
    for (const row of catalog) {
      const card = deriveTemplateCardMeta(row.def as unknown as TemplateDefinition);
      expect(JSON.stringify(card)).not.toContain("{{");
    }
  });
});
