/**
 * @jest-environment node
 *
 * GOOGLE-REVIEW-TEMPLATE-1 — dedicated guard for the "Google Review Test" official template
 * (the reviewer-facing workflow shipped for Google OAuth verification) and for the migration
 * that removes the stray, empty "Official Starter" marketplace card it replaces.
 *
 * The generic catalog guards (seedOfficialTemplates / officialTemplateCatalogIntegrity /
 * official-template-node-registration) already prove schema validity, node registration,
 * contract-backed references, and the no-leak rules across the whole catalog. This file pins the
 * things a Google reviewer actually depends on and that a future edit could silently regress:
 *
 *   1. the template exists exactly ONCE, with the required marketplace presentation;
 *   2. the graph is the intended 1 trigger + 4 actions, wired linearly, in reviewer order;
 *   3. each step carries its reviewer-facing display name;
 *   4. the Google scope families the verification request covers are each demonstrated by a
 *      real, registered node;
 *   5. the variable mappings survive a /use copy through WorkflowDefinitionSchema verbatim;
 *   6. every account-specific Google resource stays BLANK and surfaces as Setup Needed;
 *   7. no zero-step official template is seeded anywhere in the catalog;
 *   8. the stray-row cleanup migration is DELETE-only, guarded to platform-owned officials,
 *      and cannot match a real seeded template or any user/community template.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { WorkflowDefinitionSchema } from "@/contracts/workflowDefinition";
import { TemplateDefinitionSchema } from "@/contracts/workflowTemplate";
import { getActionMeta, getTriggerMeta, listAllActionMetas, listAllTriggerMetas } from "@/services/discovery/_registry";
import { deriveTemplateCardMeta } from "@/core/workflows/templateCardMeta";
import { buildRequiredFieldsByType, missingRequiredFields } from "@/core/workflows/requiredFields";
import { parseReferences } from "@/core/workflows/variables/variableReferences";

const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");
const files = readdirSync(MIGRATIONS).sort();
const readStripped = (f: string) =>
  readFileSync(join(MIGRATIONS, f), "utf8").replace(/--[^\n]*/g, "");

const SEED_FILES = files.filter((f) => /_seed_official_templates.*\.sql$/.test(f));
const seedCode = SEED_FILES.map(readStripped).join("\n");

const CLEANUP_FILE = "20260730000001_remove_stray_test_official_templates.sql";
const TEMPLATE_ID = "c0ffee00-0000-4000-8000-000000000067";
const TEMPLATE_NAME = "Google Review Test";

interface Node {
  id: string;
  kind: string;
  provider: string;
  type: string;
  displayName?: string;
  config: Record<string, unknown>;
}
interface Def {
  nodes: Node[];
  edges: Array<{ id: string; from: string; to: string; label?: string }>;
}
interface Row {
  id: string;
  name: string;
  description: string;
  def: Def;
}

const rowRe =
  /'(c0ffee00-[0-9a-f-]+)',\s*NULL,\s*NULL,\s*'([^']*)',\s*'([^']*)',\s*'official',\s*'public',\s*'(\{.*?\})'::jsonb/gs;
const seeded: Row[] = [...seedCode.matchAll(rowRe)].map((m) => ({
  id: m[1]!,
  name: m[2]!,
  description: m[3]!,
  def: JSON.parse(m[4]!) as Def,
}));

const matches = seeded.filter((r) => r.name === TEMPLATE_NAME);
const row = matches[0];

describe("Google Review Test template — marketplace presentation", () => {
  it("is seeded exactly once, under the stable id, replacing rather than duplicating a card", () => {
    expect(matches).toHaveLength(1);
    expect(row!.id).toBe(TEMPLATE_ID);
    // no other seeded template shares the id or the name.
    expect(seeded.filter((r) => r.id === TEMPLATE_ID)).toHaveLength(1);
  });

  it("carries the reviewer-facing short + detailed description with no placeholder copy", () => {
    const d = row!.description;
    expect(d).toContain("provided for Google OAuth verification");
    expect(d).toContain("Google Drive");
    expect(d).toContain("Google Sheets");
    expect(d).toContain("Google Calendar");
    expect(d).toContain("Gmail");
    // the reviewer sees a purpose per step, not generic starter copy.
    for (const step of ["Step 1", "Step 2", "Step 3", "Step 4", "Step 5"]) {
      expect(d).toContain(step);
    }
    expect(d).not.toMatch(/lorem ipsum|starter workflow|Official Starter/i);
    expect(row!.name).not.toMatch(/starter/i);
  });

  it("derives an app-triggered card that lists exactly the Google apps it needs", () => {
    const card = deriveTemplateCardMeta(TemplateDefinitionSchema.parse(row!.def));
    expect(card.triggerKind).toBe("app");
    expect(card.nodeCount).toBe(5);
    // the card counts ACTION steps (the trigger is shown separately) — never 0.
    expect(card.stepCount).toBe(4);
    // Pinned so a change to the display heuristic cannot silently move the reviewer's card.
    expect(card.category).toBe("files-docs");
    expect(card.providers).toEqual([
      "gmail",
      "google-drive",
      "google-sheets",
      "google-calendar",
    ]);
    // browse metadata never carries a raw expression or config value.
    expect(JSON.stringify(card)).not.toContain("{{");
  });
});

describe("Google Review Test template — workflow shape", () => {
  it("is one Gmail trigger followed by four Google actions, wired in reviewer order", () => {
    const ordered = row!.def.nodes.map((n) => `${n.provider}:${n.type}`);
    expect(ordered).toEqual([
      "gmail:new_email",
      "google-drive:upload_file",
      "google-sheets:append_row",
      "google-calendar:create_event",
      "gmail:send_email",
    ]);
    expect(row!.def.nodes.filter((n) => n.kind === "trigger")).toHaveLength(1);
    expect(row!.def.nodes.filter((n) => n.kind === "action")).toHaveLength(4);
    expect(row!.def.edges.map((e) => `${e.from}->${e.to}`)).toEqual([
      "trigger->a1",
      "a1->a2",
      "a2->a3",
      "a3->a4",
    ]);
    // linear demo: no branch labels.
    expect(row!.def.edges.every((e) => e.label === undefined)).toBe(true);
  });

  it("labels every step with its reviewer-facing name", () => {
    expect(row!.def.nodes.map((n) => n.displayName)).toEqual([
      "1. Gmail — Read a new email",
      "2. Google Drive — Save the email information",
      "3. Google Sheets — Log the workflow activity",
      "4. Google Calendar — Create a follow-up event",
      "5. Gmail — Send a confirmation",
    ]);
  });

  it("filters the trigger to a safe reviewer subject using fields the real trigger supports", () => {
    const trigger = row!.def.nodes[0]!;
    const meta = getTriggerMeta("gmail:new_email")!;
    const fieldNames = new Set(meta.fields.map((f) => f.name));
    for (const key of Object.keys(trigger.config)) expect(fieldNames.has(key)).toBe(true);
    expect(trigger.config.subject).toBe("ChainReact Google Review");
    // substring ("contains") match — the meta default is exact, so it must be set explicitly.
    expect(trigger.config.subjectExactMatch).toBe(false);
  });

  it("every node is a registered action/trigger and every config key a real meta field", () => {
    for (const node of row!.def.nodes) {
      const key = `${node.provider}:${node.type}`;
      const meta = node.kind === "trigger" ? getTriggerMeta(key) : getActionMeta(key);
      expect(meta).toBeDefined();
      const fieldNames = new Set(meta!.fields.map((f) => f.name));
      for (const configKey of Object.keys(node.config)) {
        expect({ key, configKey, known: fieldNames.has(configKey) }).toEqual({
          key,
          configKey,
          known: true,
        });
      }
    }
  });
});

describe("Google Review Test template — Google scope coverage", () => {
  // One shipped, registered node per Google scope family in the verification request that this
  // template is responsible for demonstrating. Docs (documents) and Analytics
  // (analytics.readonly / analytics.edit) are requested by their own providers and are
  // deliberately NOT demonstrated here — recorded in the slice Owner Report, not faked with a node.
  const COVERAGE: ReadonlyArray<[string, string]> = [
    ["gmail.readonly (read a message)", "gmail:new_email"],
    ["drive (create a file)", "google-drive:upload_file"],
    ["spreadsheets (write a row)", "google-sheets:append_row"],
    ["calendar.events (create an event)", "google-calendar:create_event"],
    ["gmail.send (send a message)", "gmail:send_email"],
  ];

  it.each(COVERAGE)("demonstrates %s via %s", (_scope, key) => {
    const present = row!.def.nodes.some((n) => `${n.provider}:${n.type}` === key);
    expect(present).toBe(true);
  });

  it("uses no Google Contacts node (no Contacts provider ships in V2)", () => {
    expect(row!.def.nodes.some((n) => n.provider.includes("contacts"))).toBe(false);
  });
});

describe("Google Review Test template — copy / use fidelity", () => {
  it("parses the strict template schema AND the workflow schema the /use route re-validates", () => {
    expect(() => TemplateDefinitionSchema.parse(row!.def)).not.toThrow();
    expect(() => WorkflowDefinitionSchema.parse(row!.def)).not.toThrow();
  });

  it("preserves every variable mapping and display name through the /use copy", () => {
    // createWorkflowFromTemplate persists exactly WorkflowDefinitionSchema.parse(definition).
    const copied = WorkflowDefinitionSchema.parse(row!.def);
    expect(copied.nodes.map((n) => n.displayName)).toEqual(
      row!.def.nodes.map((n) => n.displayName),
    );
    for (const [i, node] of copied.nodes.entries()) {
      expect(node.config).toEqual(row!.def.nodes[i]!.config);
    }

    // Every reference resolves to a node in the graph, and to a DECLARED output of that node —
    // including references nested inside a string-array field (the Sheets row values).
    const outputsOf = (id: string): Set<string> => {
      const n = copied.nodes.find((x) => x.id === id)!;
      const key = `${n.provider}:${n.type}`;
      return n.kind === "trigger"
        ? new Set((getTriggerMeta(key)?.payloadShape ?? []).map((o) => o.name))
        : new Set((getActionMeta(key)?.outputs ?? []).map((o) => o.name));
    };
    const leaves = (v: unknown): string[] =>
      typeof v === "string"
        ? [v]
        : Array.isArray(v)
          ? v.flatMap(leaves)
          : v && typeof v === "object"
            ? Object.values(v).flatMap(leaves)
            : [];
    let refCount = 0;
    for (const node of copied.nodes) {
      for (const value of Object.values(node.config).flatMap(leaves)) {
        for (const ref of parseReferences(value)) {
          refCount += 1;
          const target = ref.nodeId === "trigger" ? "trigger" : ref.nodeId;
          expect(copied.nodes.some((n) => n.id === target)).toBe(true);
          expect(outputsOf(target).has(ref.path.split(/[.[]/)[0]!)).toBe(true);
        }
      }
    }
    // the mappings actually exist (a silently emptied config would otherwise pass above).
    expect(refCount).toBeGreaterThanOrEqual(14);
  });

  it("logs the Gmail row into Sheets as a typed string-array, not hand-authored JSON", () => {
    const sheets = row!.def.nodes.find((n) => n.id === "a2")!;
    expect(sheets.config.values).toEqual([
      "{{trigger.from}}",
      "{{trigger.subject}}",
      "{{trigger.receivedAt}}",
      "{{trigger.id}}",
      "{{a1.name}}",
    ]);
  });
});

describe("Google Review Test template — reviewer setup experience", () => {
  const requiredByType = buildRequiredFieldsByType(listAllActionMetas(), listAllTriggerMetas());
  const missingFor = (id: string): string[] => {
    const node = WorkflowDefinitionSchema.parse(row!.def).nodes.find((n) => n.id === id)!;
    return missingRequiredFields(node, requiredByType).map((f) => f.name);
  };

  it("leaves every account-specific Google resource BLANK for the reviewer to select", () => {
    const byId = new Map(row!.def.nodes.map((n) => [n.id, n]));
    const mustBeAbsent: ReadonlyArray<[string, string]> = [
      ["a1", "parentFolderId"], // Drive destination folder
      ["a2", "spreadsheetId"], // Sheets file
      ["a2", "range"], // Sheets worksheet / range
      ["a3", "calendarId"], // Calendar
      ["a3", "startDateTime"], // no safe template default
      ["a3", "endDateTime"],
      ["a4", "to"], // recipient — never prewired, even from a variable
      ["a4", "cc"],
      ["a4", "bcc"],
      ["trigger", "labelIds"], // Gmail label filter
    ];
    for (const [nodeId, field] of mustBeAbsent) {
      expect({ nodeId, field, value: byId.get(nodeId)!.config[field] }).toEqual({
        nodeId,
        field,
        value: undefined,
      });
    }
  });

  it("surfaces normal Setup Needed states instead of hidden placeholders or fake ids", () => {
    // Sheets: the file, the range, and the explicit value-input choice.
    expect(missingFor("a2").sort()).toEqual(["range", "spreadsheetId", "valueInputOption"].sort());
    // Calendar: the Q11 consent/visibility choices stay the reviewer's.
    expect(missingFor("a3").sort()).toEqual(
      ["guestsCanInviteOthers", "guestsCanSeeOtherGuests", "sendNotifications"].sort(),
    );
    // Gmail send: the recipient.
    expect(missingFor("a4")).toEqual(["to"]);
    // The trigger and the Drive step are fully configured by the template.
    expect(missingFor("trigger")).toEqual([]);
    expect(missingFor("a1")).toEqual([]);
  });

  it("requires no JSON entry and seeds no fake resource id", () => {
    for (const node of row!.def.nodes) {
      for (const value of Object.values(node.config)) {
        const text = JSON.stringify(value);
        // no hand-authored JSON blobs in a config value.
        expect(text).not.toMatch(/^"\s*[[{]/);
        // no uuid / long-hex resource ids, and no email address.
        expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        expect(text).not.toMatch(/@/);
      }
    }
  });
});

describe("official catalog — no zero-step card survives", () => {
  it("no seeded official template has an empty or trigger-only definition", () => {
    expect(seeded.length).toBeGreaterThan(0);
    for (const r of seeded) {
      const card = deriveTemplateCardMeta(TemplateDefinitionSchema.parse(r.def));
      expect({ name: r.name, hasSteps: card.stepCount >= 1 }).toEqual({
        name: r.name,
        hasSteps: true,
      });
    }
  });

  it("no seeded official template is named Official Starter", () => {
    expect(seeded.some((r) => /starter/i.test(r.name))).toBe(false);
  });
});

describe("stray-official cleanup migration — DELETE-only and guarded", () => {
  const sql = readStripped(CLEANUP_FILE);

  it("only deletes, and changes no schema, RLS, or grant", () => {
    expect(sql).toMatch(/DELETE\s+FROM\s+public\.workflow_templates/i);
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|ALTER|CREATE|DROP|GRANT|REVOKE|TRUNCATE)\b|POLICY/i);
  });

  it("every statement is guarded to platform-owned official rows", () => {
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    expect(statements.length).toBe(2);
    for (const s of statements) {
      expect(s).toMatch(/source = 'official'/);
      expect(s).toMatch(/account_id IS NULL/);
    }
    // Statement 1 targets the platform invariant violation (an official row WITH an author) —
    // the shape only the DB test fixture produces.
    expect(statements[0]).toMatch(/created_by_user_id IS NOT NULL/);
    // Statement 2 targets the exact broken card: author-less, named 'Official Starter', no nodes.
    expect(statements[1]).toMatch(/created_by_user_id IS NULL/);
    expect(statements[1]).toMatch(/name = 'Official Starter'/);
    expect(statements[1]).toMatch(/jsonb_array_length\(definition -> 'nodes'\), 0\) = 0/);
  });

  it("cannot match any template the seed migrations actually ship", () => {
    // Guard 1 needs a non-null author; every seeded official row is inserted with NULL, NULL.
    expect(seedCode).not.toMatch(/'(c0ffee00-[0-9a-f-]+)',\s*NULL,\s*'[^']/);
    // Guard 2 needs the name 'Official Starter' AND zero nodes; no seeded row has either.
    for (const r of seeded) {
      expect(r.name).not.toBe("Official Starter");
      expect(r.def.nodes.length).toBeGreaterThan(0);
    }
  });
});
