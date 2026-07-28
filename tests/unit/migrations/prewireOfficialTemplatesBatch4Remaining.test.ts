/**
 * @jest-environment node
 */
// Validates the variable-only PREWIRING migration for the remaining 12 batch-4 official templates
// (Slice 4.WORKFLOW-TEMPLATES-OFFICIAL-PREWIRE-2). Reads
// 20260712000000_prewire_official_templates_batch_4_remaining.sql (no DB) and proves the narrow
// policy holds:
//   - GUARDED, UPDATE-only, idempotent migration touching only the 12 official UUIDs
//     (source='official' AND account_id IS NULL — never user/community templates);
//   - every node provider:type is registered; every config KEY is a real meta field name;
//   - every `{{src.path}}` reference targets the trigger alias or an upstream node, and its path's
//     first segment is a DECLARED output (trigger payloadShape / action OutputMeta) — never guessed;
//   - the CANONICAL runtime resolver resolves every seeded expression (no MissingVariableError);
//   - no email / token / secret / id literal leaks; account-resource + recipient + notify/visibility
//     + consent fields stay BLANK (only two derived-id exceptions: monday create_subitem boardId,
//     google-drive get_file_metadata fileId — both must be `{{...}}` expressions);
//   - the derived marketplace card meta never exposes a raw `{{...}}` expression;
//   - together with 20260711000000, ALL 15 batch-4 templates are prewired.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { WorkflowDefinitionSchema } from "@/contracts/workflowDefinition";
import { TemplateDefinitionSchema, type TemplateDefinition } from "@/contracts/workflowTemplate";
import { getActionMeta, getTriggerMeta } from "@/services/discovery/_registry";
import { parseReferences } from "@/core/workflows/variables/variableReferences";
import { resolveStrict } from "@/workflow-engine/variables/resolveValue";
import { deriveTemplateCardMeta } from "@/core/workflows/templateCardMeta";

const MIGRATIONS_DIR = resolve(process.cwd(), "supabase/migrations");
const FILE = "20260712000000_prewire_official_templates_batch_4_remaining.sql";
const sql = readFileSync(join(MIGRATIONS_DIR, FILE), "utf8");
const code = sql.replace(/--[^\n]*/g, "");

// The 12 remaining batch-4 templates, in file order (04d, 04f, 050..059 minus the 3 prior).
const EXPECTED_UUIDS = [
  "c0ffee00-0000-4000-8000-00000000004d", // lead qualification pipeline
  "c0ffee00-0000-4000-8000-00000000004f", // shopify order operations
  "c0ffee00-0000-4000-8000-000000000050", // stripe payment operations
  "c0ffee00-0000-4000-8000-000000000051", // mailchimp engagement follow-up
  "c0ffee00-0000-4000-8000-000000000052", // product feedback intake
  "c0ffee00-0000-4000-8000-000000000053", // engineering incident intake
  "c0ffee00-0000-4000-8000-000000000054", // new file review pipeline
  "c0ffee00-0000-4000-8000-000000000055", // meeting prep and follow-up
  "c0ffee00-0000-4000-8000-000000000056", // weekly executive report
  "c0ffee00-0000-4000-8000-000000000057", // customer onboarding
  "c0ffee00-0000-4000-8000-000000000058", // content production pipeline
  "c0ffee00-0000-4000-8000-000000000059", // ecommerce customer retention
];

// The 3 templates prewired by the prior migration (20260711000000).
const PRIOR_PREWIRED_UUIDS = [
  "c0ffee00-0000-4000-8000-00000000004e", // support escalation from email
  "c0ffee00-0000-4000-8000-00000000004c", // lead intake to sales handoff
  "c0ffee00-0000-4000-8000-00000000005a", // new team member onboarding
];

interface Node { id: string; kind: string; provider: string; type: string; position: { x: number; y: number }; config: Record<string, unknown> }
interface Def { nodes: Node[]; edges: unknown[] }

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
const isVarExpr = (v: unknown) => typeof v === "string" && v.trim().startsWith("{{") && v.trim().endsWith("}}");

describe("prewire batch-4-remaining migration — guarded, UPDATE-only, idempotent", () => {
  it("is UPDATE-only with no INSERT/DELETE/DDL/RLS", () => {
    expect((code.match(/UPDATE\s+public\.workflow_templates/gi) ?? []).length).toBe(12);
    expect(code).not.toMatch(/^\s*INSERT\s+INTO/im);
    expect(code).not.toMatch(/^\s*DELETE\s+FROM/im);
    expect(code).not.toMatch(/\b(ALTER|CREATE|DROP|GRANT|REVOKE)\b|POLICY/i);
  });

  it("targets ONLY the 12 official UUIDs and cannot match user/community templates", () => {
    expect(targetIds).toEqual(EXPECTED_UUIDS);
    expect((code.match(/source = 'official'/g) ?? []).length).toBe(12);
    expect((code.match(/account_id IS NULL/g) ?? []).length).toBe(12);
    expect(code).not.toMatch(/source = 'user'/);
    // never re-touches the 3 already-prewired rows.
    for (const id of PRIOR_PREWIRED_UUIDS) expect(targetIds).not.toContain(id);
  });

  it("leaks NO credential / email / id literal", () => {
    expect(code).not.toMatch(/xox[baprs]-|\bsk_[a-z0-9]{8,}|whsec_|access_token|client_secret/i);
    expect(code).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i); // no real emails
  });
});

describe("prewire batch-4-remaining definitions — valid, registered, contract-backed", () => {
  it("parsed 12 definitions, each a valid workflow + template graph with one trigger", () => {
    expect(defs).toHaveLength(12);
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
      const order = def.nodes.map((n) => n.id);
      const trigger = def.nodes.find((n) => n.kind === "trigger")!;
      for (const node of def.nodes) {
        const nodeIdx = order.indexOf(node.id);
        for (const value of Object.values(node.config)) {
          if (typeof value !== "string") continue;
          for (const ref of parseReferences(value)) {
            const sourceNode = ref.nodeId === "trigger" ? trigger : byId.get(ref.nodeId);
            expect(sourceNode).toBeDefined(); // no dangling reference
            // references must point at the trigger or a strictly-upstream (earlier) node.
            if (ref.nodeId !== "trigger") {
              expect(order.indexOf(ref.nodeId)).toBeLessThan(nodeIdx);
            }
            if (ref.path === "") continue;
            const declared = metaOutputs(sourceNode!);
            expect(declared.has(firstSeg(ref.path))).toBe(true);
          }
        }
      }
    }
  });
});

describe("prewire batch-4-remaining definitions — the canonical resolver resolves every expression", () => {
  it("resolveStrict resolves all configs against representative upstream outputs (no throw)", () => {
    for (const def of defs) {
      const variables: Record<string, unknown> = {};
      const trigger = def.nodes.find((n) => n.kind === "trigger")!;
      variables.trigger = Object.fromEntries([...metaOutputs(trigger)].map((n) => [n, `v_${n}`]));
      for (const node of def.nodes) {
        if (node.kind === "trigger") continue;
        variables[node.id] = Object.fromEntries([...metaOutputs(node)].map((n) => [n, `v_${n}`]));
      }
      for (const node of def.nodes) {
        const resolved = resolveStrict(node.config, { variables }) as Record<string, unknown>;
        expect(JSON.stringify(resolved)).not.toContain("{{");
      }
    }
  });
});

describe("prewire batch-4-remaining — account-specific fields stay blank; card hides expressions", () => {
  // Fields a user MUST still choose — must NOT be prewired with a literal.
  const FORBIDDEN_KEYS = new Set([
    "channel", "listId", "boardId", "groupId", "spreadsheetId", "range",
    "valueInputOption", "insertDataOption", "databaseId", "parent", "properties",
    "repository", "teamId", "channelId", "audience_id", "propertyId", "accountId",
    "calendarId", "folderId", "parentFolderId", "fileId", "order_id", "append",
    "customerId", "to", "cc", "bcc", "status", "dealstage", "pipeline", "tags",
    "duplicateHandling", "sendNotifications", "guestsCanInviteOthers",
    "guestsCanSeeOtherGuests", "guestsCanModify", "visibility",
  ]);

  it("no account-resource / recipient / notify-visibility / consent field is prewired (except two derived ids)", () => {
    for (const def of defs) {
      for (const node of def.nodes) {
        for (const key of Object.keys(node.config)) {
          if (!FORBIDDEN_KEYS.has(key)) continue;
          const value = node.config[key];
          // EXCEPTION 1: monday SUBITEM boardId derived from the parent item's output.
          const isSubitemBoard = node.type === "create_subitem" && key === "boardId";
          // EXCEPTION 2: drive get_file_metadata fileId derived from the file_changed trigger.
          const isMetadataFileId = node.type === "get_file_metadata" && key === "fileId";
          if (isSubitemBoard || isMetadataFileId) {
            expect(isVarExpr(value)).toBe(true); // must be a {{...}} reference, never a literal
            continue;
          }
          // everything else in the forbidden set must be absent (i.e. never reach here).
          throw new Error(`forbidden field '${key}' prewired on ${node.provider}:${node.type}`);
        }
      }
    }
  });

  it("any email / parentItemId value present is a variable expression, never a literal", () => {
    for (const def of defs) {
      for (const node of def.nodes) {
        for (const key of ["email", "parentItemId"]) {
          if (!(key in node.config)) continue;
          expect(isVarExpr(node.config[key])).toBe(true);
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

describe("batch-4 coverage — all 15 templates are prewired across the two prewire migrations", () => {
  it("the union of both prewire migrations' targets equals all 15 batch-4 UUIDs", () => {
    const priorSql = readFileSync(
      join(MIGRATIONS_DIR, "20260711000000_prewire_official_templates.sql"),
      "utf8",
    ).replace(/--[^\n]*/g, "");
    const priorIds = [...priorSql.matchAll(/id = '(c0ffee00-[0-9a-f-]+)'/g)].map((m) => m[1]!);
    const union = new Set([...priorIds, ...targetIds]);
    // batch 4 is the contiguous range 04c..05a (15 fixed UUIDs).
    const all = [
      "c0ffee00-0000-4000-8000-00000000004c", "c0ffee00-0000-4000-8000-00000000004d",
      "c0ffee00-0000-4000-8000-00000000004e", "c0ffee00-0000-4000-8000-00000000004f",
      "c0ffee00-0000-4000-8000-000000000050", "c0ffee00-0000-4000-8000-000000000051",
      "c0ffee00-0000-4000-8000-000000000052", "c0ffee00-0000-4000-8000-000000000053",
      "c0ffee00-0000-4000-8000-000000000054", "c0ffee00-0000-4000-8000-000000000055",
      "c0ffee00-0000-4000-8000-000000000056", "c0ffee00-0000-4000-8000-000000000057",
      "c0ffee00-0000-4000-8000-000000000058", "c0ffee00-0000-4000-8000-000000000059",
      "c0ffee00-0000-4000-8000-00000000005a",
    ];
    expect(union.size).toBe(15);
    for (const id of all) expect(union.has(id)).toBe(true);
  });
});
