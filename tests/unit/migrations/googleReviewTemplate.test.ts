/**
 * @jest-environment node
 *
 * GOOGLE-REVIEW-TEMPLATE-1 + GOOGLE-REVIEW-CERTIFICATION-2 — dedicated guard for the three
 * official templates shipped for Google OAuth verification, and for the migration that removes
 * the stray zero-step "Official Starter" marketplace card they replace.
 *
 * The generic catalog guards (seedOfficialTemplates / officialTemplateCatalogIntegrity /
 * official-template-node-registration) already prove schema validity, node registration,
 * contract-backed references, and the no-leak rules across the whole catalog. This file pins the
 * things a Google reviewer actually depends on and that a future edit could silently regress:
 *
 *   1. each template exists exactly ONCE, with the required marketplace presentation;
 *   2. the graphs are the intended shapes, wired linearly, in reviewer order;
 *   3. each step carries its reviewer-facing display name;
 *   4. EVERY Google scope the shared OAuth consent screen requests is demonstrated by a real,
 *      registered node — and analytics.edit is demonstrated by the action that actually carries
 *      that scope (create_conversion_event), never by the Measurement-Protocol send_event;
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
import {
  getActionMeta,
  getTriggerMeta,
  listAllActionMetas,
  listAllTriggerMetas,
} from "@/services/discovery/_registry";
import { deriveTemplateCardMeta } from "@/core/workflows/templateCardMeta";
import { buildRequiredFieldsByType, missingRequiredFields } from "@/core/workflows/requiredFields";
import { parseReferences } from "@/core/workflows/variables/variableReferences";

const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");
const files = readdirSync(MIGRATIONS).sort();
const readStripped = (f: string) =>
  readFileSync(join(MIGRATIONS, f), "utf8").replace(/--[^\n]*/g, "");

const SEED_FILES = files.filter((f) => /_seed_official_templates.*\.sql$/.test(f));
const seedCode = SEED_FILES.map(readStripped).join("\n");

const CLEANUP_FILE = "20260810000001_remove_stray_test_official_templates.sql";
const MAIN = "Google Review Test";
const DOCS = "Google Docs Review Test";
const ANALYTICS = "Google Analytics Review Test";

const IDS: Readonly<Record<string, string>> = {
  [MAIN]: "c0ffee00-0000-4000-8000-000000000067",
  [DOCS]: "c0ffee00-0000-4000-8000-000000000068",
  [ANALYTICS]: "c0ffee00-0000-4000-8000-000000000069",
};

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

const rowFor = (name: string): Row => {
  const found = seeded.filter((r) => r.name === name);
  if (found.length !== 1) throw new Error(`expected exactly 1 "${name}", found ${found.length}`);
  return found[0]!;
};
const main = rowFor(MAIN);
const docs = rowFor(DOCS);
const analytics = rowFor(ANALYTICS);
const reviewTemplates = [main, docs, analytics];

const requiredByType = buildRequiredFieldsByType(listAllActionMetas(), listAllTriggerMetas());
const missingFor = (row: Row, nodeId: string): string[] => {
  const node = WorkflowDefinitionSchema.parse(row.def).nodes.find((n) => n.id === nodeId)!;
  return missingRequiredFields(node, requiredByType)
    .map((f) => f.name)
    .sort();
};

const stringLeaves = (v: unknown): string[] =>
  typeof v === "string"
    ? [v]
    : Array.isArray(v)
      ? v.flatMap(stringLeaves)
      : v && typeof v === "object"
        ? Object.values(v).flatMap(stringLeaves)
        : [];

describe("Google reviewer templates — marketplace presentation", () => {
  it.each(reviewTemplates.map((r) => [r.name] as const))(
    "%s is seeded exactly once under its stable id",
    (name) => {
      const row = rowFor(name);
      expect(row.id).toBe(IDS[name]);
      expect(seeded.filter((r) => r.id === row.id)).toHaveLength(1);
    },
  );

  it.each(reviewTemplates.map((r) => [r.name] as const))(
    "%s explains purpose, per-step behaviour, and what the reviewer must select",
    (name) => {
      const d = rowFor(name).description;
      expect(d).toContain("Provided for Google OAuth verification");
      expect(d).toMatch(/Requires one connection/);
      for (const step of ["Step 1", "Step 2", "Step 3", "Step 4", "Step 5"]) {
        expect(d).toContain(step);
      }
      // states what is read vs. what is created/changed/sent, in reviewer-visible language.
      expect(d).toMatch(/READS/);
      expect(d).toMatch(/CREATES|CHANGES|SENDS/);
      expect(d).toMatch(/you select/i);
      expect(d).toMatch(/Nothing runs until you finish setup/);
      expect(d).not.toMatch(/lorem ipsum|starter workflow|Official Starter/i);
      expect(name).not.toMatch(/starter/i);
    },
  );

  it("the main template asserts ChainReact only uses explicitly mapped Google data", () => {
    expect(main.description).toMatch(
      /ChainReact never reads Google data that a step is not wired to/,
    );
  });

  it("derives accurate, expression-free browse cards", () => {
    const cardOf = (row: Row) => deriveTemplateCardMeta(TemplateDefinitionSchema.parse(row.def));

    const m = cardOf(main);
    expect(m.triggerKind).toBe("app");
    expect(m.nodeCount).toBe(7);
    expect(m.stepCount).toBe(6); // action steps; never 0
    expect(m.providers).toEqual(["gmail", "google-drive", "google-sheets", "google-calendar"]);
    expect(m.category).toBe("files-docs");

    const d = cardOf(docs);
    expect(d.triggerKind).toBe("manual");
    expect(d.nodeCount).toBe(5);
    expect(d.stepCount).toBe(4);
    expect(d.providers).toEqual(["google-docs"]);

    const a = cardOf(analytics);
    expect(a.triggerKind).toBe("manual");
    expect(a.nodeCount).toBe(5);
    expect(a.stepCount).toBe(4);
    expect(a.providers).toEqual(["google-analytics"]);

    for (const row of reviewTemplates) {
      expect(JSON.stringify(cardOf(row))).not.toContain("{{");
    }
  });
});

describe("Google reviewer templates — workflow shape", () => {
  it("the main template is one Gmail trigger followed by six Google actions in reviewer order", () => {
    expect(main.def.nodes.map((n) => `${n.provider}:${n.type}`)).toEqual([
      "gmail:new_email",
      "google-drive:upload_file",
      "google-sheets:append_row",
      "google-calendar:create_event",
      "gmail:add_label",
      "gmail:create_draft_reply",
      "gmail:send_email",
    ]);
    expect(main.def.edges.map((e) => `${e.from}->${e.to}`)).toEqual([
      "trigger->a1",
      "a1->a2",
      "a2->a3",
      "a3->a4",
      "a4->a5",
      "a5->a6",
    ]);
  });

  it("the companion templates are manual, self-contained, and single-provider", () => {
    expect(docs.def.nodes.map((n) => `${n.provider}:${n.type}`)).toEqual([
      "native:manual.run",
      "google-docs:create_document",
      "google-docs:update_document",
      "google-docs:get_document",
      "google-docs:share_document",
    ]);
    expect(analytics.def.nodes.map((n) => `${n.provider}:${n.type}`)).toEqual([
      "native:manual.run",
      "google-analytics:run_report",
      "google-analytics:get_realtime_data",
      "google-analytics:find_conversion",
      "google-analytics:create_conversion_event",
    ]);
    for (const row of [docs, analytics]) {
      expect(row.def.edges.map((e) => `${e.from}->${e.to}`)).toEqual([
        "trigger->a1",
        "a1->a2",
        "a2->a3",
        "a3->a4",
      ]);
    }
  });

  it.each(reviewTemplates.map((r) => [r.name] as const))(
    "%s has exactly one trigger, linear unlabeled edges, and a numbered display name per step",
    (name) => {
      const row = rowFor(name);
      expect(row.def.nodes.filter((n) => n.kind === "trigger")).toHaveLength(1);
      expect(row.def.edges.every((e) => e.label === undefined)).toBe(true);
      for (const [i, node] of row.def.nodes.entries()) {
        expect({ id: node.id, named: Boolean(node.displayName) }).toEqual({
          id: node.id,
          named: true,
        });
        expect(node.displayName!.startsWith(`${i + 1}. `)).toBe(true);
        expect(node.displayName!.length).toBeLessThanOrEqual(120);
      }
    },
  );

  it("names the main template steps exactly as the reviewer instructions do", () => {
    expect(main.def.nodes.map((n) => n.displayName)).toEqual([
      "1. Gmail — Read a new email",
      "2. Google Drive — Save the email information",
      "3. Google Sheets — Log the workflow activity",
      "4. Google Calendar — Create a follow-up event",
      "5. Gmail — Apply a review label",
      "6. Gmail — Prepare a reply draft",
      "7. Gmail — Send a confirmation",
    ]);
  });

  it("filters the trigger to a safe reviewer subject using fields the real trigger supports", () => {
    const trigger = main.def.nodes[0]!;
    const fieldNames = new Set(getTriggerMeta("gmail:new_email")!.fields.map((f) => f.name));
    for (const key of Object.keys(trigger.config)) expect(fieldNames.has(key)).toBe(true);
    expect(trigger.config.subject).toBe("ChainReact Google Review");
    // substring ("contains") match — the meta default is exact, so it must be set explicitly.
    expect(trigger.config.subjectExactMatch).toBe(false);
  });

  it.each(reviewTemplates.map((r) => [r.name] as const))(
    "%s uses only registered nodes and real meta field names",
    (name) => {
      for (const node of rowFor(name).def.nodes) {
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
    },
  );
});

describe("Google reviewer templates — full OAuth scope coverage", () => {
  /**
   * Every scope the SHARED Google consent screen requests (all six providers use
   * GOOGLE_CLIENT_ID via integrations/_shared/google/oauth.ts), mapped to the node that
   * demonstrates it. `userinfo.email` is exercised by the connect callback of every non-Gmail
   * Google provider, so it has no workflow node — it is treated as connect-only below.
   */
  const COVERAGE: ReadonlyArray<[string, string]> = [
    ["gmail.readonly", "gmail:new_email"],
    ["gmail.send", "gmail:send_email"],
    ["gmail.modify", "gmail:add_label"],
    ["gmail.compose", "gmail:create_draft_reply"],
    ["drive", "google-drive:upload_file"],
    ["drive", "google-docs:share_document"],
    ["drive.metadata.readonly", "google-sheets:append_row"],
    ["spreadsheets", "google-sheets:append_row"],
    ["documents", "google-docs:create_document"],
    ["documents", "google-docs:update_document"],
    ["documents", "google-docs:get_document"],
    ["calendar.events", "google-calendar:create_event"],
    ["calendar.readonly", "google-calendar:create_event"],
    ["analytics.readonly", "google-analytics:run_report"],
    ["analytics.edit", "google-analytics:create_conversion_event"],
  ];

  const allNodeKeys = new Set(
    reviewTemplates.flatMap((r) => r.def.nodes.map((n) => `${n.provider}:${n.type}`)),
  );

  it.each(COVERAGE)("demonstrates %s via %s", (_scope, key) => {
    expect(allNodeKeys.has(key)).toBe(true);
  });

  it("covers every scope declared by every Google provider manifest", async () => {
    const manifests = await Promise.all([
      import("@/integrations/gmail/manifest").then((m) => m.gmailManifest),
      import("@/integrations/google-drive/manifest").then((m) => m.googleDriveManifest),
      import("@/integrations/google-sheets/manifest").then((m) => m.googleSheetsManifest),
      import("@/integrations/google-docs/manifest").then((m) => m.googleDocsManifest),
      import("@/integrations/google-calendar/manifest").then((m) => m.googleCalendarManifest),
      import("@/integrations/google-analytics/manifest").then((m) => m.googleAnalyticsManifest),
    ]);
    const declared = new Set(manifests.flatMap((m) => [...m.scopes.required, ...m.scopes.optional]));
    // Scopes exercised by a connect callback rather than a workflow node.
    const CONNECT_ONLY = new Set(["https://www.googleapis.com/auth/userinfo.email"]);
    const covered = new Set(
      COVERAGE.map(([scope]) => `https://www.googleapis.com/auth/${scope}`),
    );
    // A new Google scope must arrive WITH a reviewer-visible demonstration, or be removed.
    expect([...declared].filter((s) => !covered.has(s) && !CONNECT_ONLY.has(s))).toEqual([]);
  });

  it("never uses send_event as proof of analytics.edit (it authenticates with a measurement id, not OAuth)", () => {
    expect(allNodeKeys.has("google-analytics:send_event")).toBe(false);
  });

  it("uses no Google Contacts node (no Contacts scope is requested and no Contacts provider ships)", () => {
    for (const row of reviewTemplates) {
      expect(row.def.nodes.some((n) => n.provider.includes("contacts"))).toBe(false);
    }
  });
});

describe("Google reviewer templates — copy / use fidelity", () => {
  it.each(reviewTemplates.map((r) => [r.name] as const))(
    "%s parses the strict template schema AND the workflow schema the /use route re-validates",
    (name) => {
      const row = rowFor(name);
      expect(() => TemplateDefinitionSchema.parse(row.def)).not.toThrow();
      expect(() => WorkflowDefinitionSchema.parse(row.def)).not.toThrow();
    },
  );

  it("preserves every variable mapping and display name through the /use copy", () => {
    const outputsOf = (copied: { nodes: Node[] }, id: string): Set<string> => {
      const n = copied.nodes.find((x) => x.id === id)!;
      const key = `${n.provider}:${n.type}`;
      return n.kind === "trigger"
        ? new Set((getTriggerMeta(key)?.payloadShape ?? []).map((o) => o.name))
        : new Set((getActionMeta(key)?.outputs ?? []).map((o) => o.name));
    };

    let refCount = 0;
    for (const row of reviewTemplates) {
      // createWorkflowFromTemplate persists exactly WorkflowDefinitionSchema.parse(definition).
      const copied = WorkflowDefinitionSchema.parse(row.def) as unknown as { nodes: Node[] };
      expect(copied.nodes.map((n) => n.displayName)).toEqual(
        row.def.nodes.map((n) => n.displayName),
      );
      for (const [i, node] of copied.nodes.entries()) {
        expect(node.config).toEqual(row.def.nodes[i]!.config);
      }
      for (const node of copied.nodes) {
        for (const value of Object.values(node.config).flatMap(stringLeaves)) {
          for (const ref of parseReferences(value)) {
            refCount += 1;
            expect(copied.nodes.some((n) => n.id === ref.nodeId)).toBe(true);
            expect(outputsOf(copied, ref.nodeId).has(ref.path.split(/[.[]/)[0]!)).toBe(true);
          }
        }
      }
    }
    // the mappings actually exist (a silently emptied config would otherwise pass above).
    expect(refCount).toBeGreaterThanOrEqual(20);
  });

  it("logs the Gmail row into Sheets as a typed string-array, not hand-authored JSON", () => {
    expect(main.def.nodes.find((n) => n.id === "a2")!.config.values).toEqual([
      "{{trigger.from}}",
      "{{trigger.subject}}",
      "{{trigger.receivedAt}}",
      "{{trigger.id}}",
      "{{a1.name}}",
    ]);
  });

  it("targets the Gmail label and draft steps at the triggering message only", () => {
    expect(main.def.nodes.find((n) => n.id === "a4")!.config.messageId).toBe("{{trigger.id}}");
    expect(main.def.nodes.find((n) => n.id === "a5")!.config.originalMessageId).toBe(
      "{{trigger.id}}",
    );
  });

  it("chains every Docs step to the document this run created, never a seeded document id", () => {
    for (const id of ["a2", "a3", "a4"]) {
      expect(docs.def.nodes.find((n) => n.id === id)!.config.documentId).toBe("{{a1.documentId}}");
    }
  });
});

describe("Google reviewer templates — reviewer setup experience", () => {
  it("leaves every account-specific Google resource BLANK for the reviewer to select", () => {
    const absent: ReadonlyArray<[Row, string, string]> = [
      [main, "a1", "parentFolderId"], // Drive destination folder
      [main, "a2", "spreadsheetId"], // Sheets file
      [main, "a2", "range"], // Sheets worksheet / range
      [main, "a3", "calendarId"], // Calendar
      [main, "a3", "startDateTime"], // no safe template default
      [main, "a3", "endDateTime"],
      [main, "a4", "labelIds"], // the review label
      [main, "a6", "to"], // recipient — never prewired, even from a variable
      [main, "a6", "cc"],
      [main, "a6", "bcc"],
      [main, "trigger", "labelIds"], // Gmail label filter
      [docs, "a1", "folderId"], // Docs destination folder
      [docs, "a4", "shareWith"], // share recipients
      [docs, "a4", "sendNotification"], // notification consent
      [analytics, "a1", "propertyId"], // Analytics property
      [analytics, "a4", "propertyId"],
    ];
    for (const [row, nodeId, field] of absent) {
      const value = row.def.nodes.find((n) => n.id === nodeId)!.config[field];
      expect({ template: row.name, nodeId, field, value }).toEqual({
        template: row.name,
        nodeId,
        field,
        value: undefined,
      });
    }
  });

  it("surfaces normal Setup Needed states on the main template", () => {
    expect(missingFor(main, "trigger")).toEqual([]);
    expect(missingFor(main, "a1")).toEqual([]);
    expect(missingFor(main, "a2")).toEqual(["range", "spreadsheetId", "valueInputOption"]);
    // Calendar now flags the TIMED date-time pair as well as the Q11 guest choices.
    expect(missingFor(main, "a3")).toEqual([
      "endDateTime",
      "guestsCanInviteOthers",
      "guestsCanSeeOtherGuests",
      "sendNotifications",
      "startDateTime",
    ]);
    expect(missingFor(main, "a4")).toEqual(["labelIds"]);
    expect(missingFor(main, "a5")).toEqual([]);
    expect(missingFor(main, "a6")).toEqual(["to"]);
  });

  it("surfaces normal Setup Needed states on the companion templates", () => {
    expect(missingFor(docs, "a1")).toEqual([]);
    // searchText stays hidden until insertLocation selects a text-anchored mode.
    expect(missingFor(docs, "a2")).toEqual(["insertLocation"]);
    expect(missingFor(docs, "a3")).toEqual([]);
    expect(missingFor(docs, "a4")).toEqual(["sendNotification"]);

    expect(missingFor(analytics, "a1")).toEqual(["dateRange", "metrics", "propertyId"]);
    expect(missingFor(analytics, "a2")).toEqual(["metrics", "propertyId"]);
    expect(missingFor(analytics, "a3")).toEqual(["conversionEventName", "propertyId"]);
    expect(missingFor(analytics, "a4")).toEqual(["propertyId"]);
  });

  it("requires no JSON entry and seeds no fake resource id", () => {
    for (const row of reviewTemplates) {
      for (const node of row.def.nodes) {
        for (const value of Object.values(node.config)) {
          const text = JSON.stringify(value);
          // No hand-authored JSON blob: a STRING config value must not itself be a JSON object
          // or array literal. `{{ref}}` expressions start with a brace but are variable
          // references, not JSON, so they are excluded.
          for (const leaf of stringLeaves(value)) {
            const trimmed = leaf.trim();
            const isExpression = trimmed.startsWith("{{");
            expect({ leaf, jsonBlob: !isExpression && /^[[{]/.test(trimmed) }).toEqual({
              leaf,
              jsonBlob: false,
            });
          }
          expect(text).not.toMatch(
            /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
          );
          expect(text).not.toMatch(/@/);
        }
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
