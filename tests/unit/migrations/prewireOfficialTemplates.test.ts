/**
 * @jest-environment node
 *
 * Validates the variable-only PREWIRING migration (Slice 4.WORKFLOW-TEMPLATES-OFFICIAL-PREWIRE-1).
 * Reads 20260711000000_prewire_official_templates.sql (no DB) and proves the narrow policy holds:
 *   - it is a GUARDED, UPDATE-only, idempotent migration touching only the 3 official UUIDs
 *     (source='official' AND account_id IS NULL — never user/community templates);
 *   - every node provider:type is registered; every config KEY is a real meta field name;
 *   - every `{{src.path}}` reference targets the trigger alias or an upstream node, and its path's
 *     first segment is a DECLARED output (trigger payloadShape / action OutputMeta) — never guessed;
 *   - the CANONICAL runtime resolver resolves every seeded expression against representative
 *     upstream outputs (no MissingVariableError);
 *   - no email / token / secret / id literal leaks; account-resource + recipient + notify/visibility
 *     fields stay BLANK;
 *   - the derived marketplace card meta never exposes a raw `{{...}}` expression.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { WorkflowDefinitionSchema } from "@/contracts/workflowDefinition";
import { TemplateDefinitionSchema, type TemplateDefinition } from "@/contracts/workflowTemplate";
import { getActionMeta, getTriggerMeta } from "@/services/discovery/_registry";
import { parseReferences } from "@/core/workflows/variableReferences";
import { resolveStrict } from "@/workflow-engine/variables/resolveValue";
import { deriveTemplateCardMeta } from "@/core/workflows/templateCardMeta";

const FILE = "20260711000000_prewire_official_templates.sql";
const sql = readFileSync(join(resolve(process.cwd(), "supabase/migrations"), FILE), "utf8");
const code = sql.replace(/--[^\n]*/g, "");

const EXPECTED_UUIDS = [
  "c0ffee00-0000-4000-8000-00000000004e", // support escalation
  "c0ffee00-0000-4000-8000-00000000004c", // lead intake
  "c0ffee00-0000-4000-8000-00000000005a", // onboarding
];

interface Node { id: string; kind: string; provider: string; type: string; position: { x: number; y: number }; config: Record<string, unknown> }
interface Def { nodes: Node[]; edges: unknown[] }

// In each UPDATE statement the definition literal precedes its WHERE id, so file order aligns.
const defs = [...code.matchAll(/'(\{"nodes".*?\})'::jsonb/g)].map((m) => JSON.parse(m[1]!) as Def);
const targetIds = [...code.matchAll(/id = '(c0ffee00-[0-9a-f-]+)'/g)].map((m) => m[1]!);

function metaOutputs(node: Node): Set<string> {
  const key = `${node.provider}:${node.type}`;
  if (node.kind === "trigger") return new Set((getTriggerMeta(key)?.payloadShape ?? []).map((o) => o.name));
  return new Set((getActionMeta(key)?.outputs ?? []).map((o) => o.name));
}
function metaFieldNames(node: Node): Set<string> {
  const key = `${node.provider}:${node.type}`;
  const meta = node.kind === "trigger" ? getTriggerMeta(key) : getActionMeta(key);
  return new Set((meta?.fields ?? []).map((f) => f.name));
}
const firstSeg = (path: string) => path.split(/[.[]/)[0]!;

describe("prewire migration — guarded, UPDATE-only, idempotent", () => {
  it("is UPDATE-only with no INSERT/DELETE/DDL/RLS", () => {
    expect((code.match(/UPDATE\s+public\.workflow_templates/gi) ?? []).length).toBe(3);
    expect(code).not.toMatch(/^\s*INSERT\s+INTO/im);
    expect(code).not.toMatch(/^\s*DELETE\s+FROM/im);
    expect(code).not.toMatch(/\b(ALTER|CREATE|DROP|GRANT|REVOKE)\b|POLICY/i);
  });

  it("targets ONLY the 3 official UUIDs and cannot match user/community templates", () => {
    expect(targetIds).toEqual(EXPECTED_UUIDS);
    // every statement is guarded by source='official' AND account_id IS NULL.
    expect((code.match(/source = 'official'/g) ?? []).length).toBe(3);
    expect((code.match(/account_id IS NULL/g) ?? []).length).toBe(3);
    expect(code).not.toMatch(/source = 'user'/);
  });

  it("leaks NO credential / email / id literal", () => {
    // `\b` so a real HubSpot field name like `hs_task_subject` (…sk_subject…) is not a false
    // positive; real Stripe secret keys are token-delimited (`"sk_live_…"`).
    expect(code).not.toMatch(/xox[baprs]-|\bsk_[a-z0-9]{8,}|whsec_|access_token|client_secret/i);
    expect(code).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i); // no real emails
  });
});

describe("prewire definitions — valid, registered, contract-backed", () => {
  it("parsed 3 definitions, each a valid workflow + template graph", () => {
    expect(defs).toHaveLength(3);
    for (const def of defs) {
      expect(() => WorkflowDefinitionSchema.parse(def)).not.toThrow();
      expect(() => TemplateDefinitionSchema.parse(def)).not.toThrow();
      expect(def.nodes.filter((n) => n.kind === "trigger")).toHaveLength(1);
    }
  });

  it("every node provider:type is registered and every config KEY is a real meta field", () => {
    for (const def of defs) {
      for (const node of def.nodes) {
        const key = `${node.provider}:${node.type}`;
        const meta = node.kind === "trigger" ? getTriggerMeta(key) : getActionMeta(key);
        expect(meta).toBeDefined();
        const fields = metaFieldNames(node);
        for (const k of Object.keys(node.config)) expect(fields.has(k)).toBe(true);
      }
    }
  });

  it("every variable reference targets the trigger/an upstream node and a DECLARED output path", () => {
    for (const def of defs) {
      const byId = new Map(def.nodes.map((n) => [n.id, n]));
      const trigger = def.nodes.find((n) => n.kind === "trigger")!;
      for (const node of def.nodes) {
        for (const value of Object.values(node.config)) {
          if (typeof value !== "string") continue;
          for (const ref of parseReferences(value)) {
            const sourceNode = ref.nodeId === "trigger" ? trigger : byId.get(ref.nodeId);
            expect(sourceNode).toBeDefined(); // no dangling reference
            if (ref.path === "") continue; // whole-node ref (not used here)
            const declared = metaOutputs(sourceNode!);
            // the first path segment must be a declared output of the source node — NOT guessed.
            expect(declared.has(firstSeg(ref.path))).toBe(true);
          }
        }
      }
    }
  });
});

describe("prewire definitions — the canonical resolver resolves every expression", () => {
  it("resolveStrict resolves all configs against representative upstream outputs (no throw)", () => {
    for (const def of defs) {
      // Build a representative variables context: the trigger payload + every action node's
      // declared outputs, each field present with a dummy value.
      const variables: Record<string, unknown> = {};
      const trigger = def.nodes.find((n) => n.kind === "trigger")!;
      const triggerOutputs = metaOutputs(trigger);
      variables.trigger = Object.fromEntries([...triggerOutputs].map((n) => [n, `v_${n}`]));
      for (const node of def.nodes) {
        if (node.kind === "trigger") continue;
        variables[node.id] = Object.fromEntries([...metaOutputs(node)].map((n) => [n, `v_${n}`]));
      }
      for (const node of def.nodes) {
        const resolved = resolveStrict(node.config, { variables }) as Record<string, unknown>;
        // no unresolved tokens remain.
        expect(JSON.stringify(resolved)).not.toContain("{{");
        // a known reference actually substituted (spot-check the support-escalation reply id).
        if (node.id === "a4" && "originalMessageId" in node.config) {
          expect(resolved.originalMessageId).toBe("v_id");
        }
      }
    }
  });
});

describe("prewire definitions — account-specific fields stay blank; card hides expressions", () => {
  // Fields a user MUST still choose — must NOT be prewired in any node config.
  const FORBIDDEN_KEYS = new Set([
    "channel", "listId", "boardId", "groupId", "spreadsheetId", "range",
    "hs_pipeline", "hs_pipeline_stage", "to", "sendNotifications",
    "guestsCanInviteOthers", "guestsCanSeeOtherGuests",
  ]);

  it("no account-resource / recipient / notify-visibility field is prewired (except derived board on a subitem)", () => {
    for (const def of defs) {
      for (const node of def.nodes) {
        for (const key of Object.keys(node.config)) {
          if (!FORBIDDEN_KEYS.has(key)) continue;
          // the ONLY allowed exception: a monday SUBITEM's boardId, derived from the parent
          // item's output (so the user picks the board once, on the parent item).
          const value = node.config[key];
          const isDerived =
            node.type === "create_subitem" &&
            key === "boardId" &&
            typeof value === "string" &&
            value.trim().startsWith("{{") &&
            value.trim().endsWith("}}");
          expect(isDerived).toBe(true);
        }
      }
    }
  });

  it("the derived marketplace card meta never exposes a raw {{...}} expression", () => {
    for (const def of defs) {
      const card = deriveTemplateCardMeta(def as unknown as TemplateDefinition);
      expect(JSON.stringify(card)).not.toContain("{{");
    }
  });
});
