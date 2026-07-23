/**
 * @jest-environment node
 *
 * MCP schema compiler (CS-2): field mapping, unsupported-schema fail-closed
 * behavior, catalog overrides (omit / required / advanced / multiline), risk
 * classification, output normalization, capability quality, and the
 * provider-level allowlist + integrity rules.
 */
import { schemaHash } from "@/core/mcpCompile/jsonSchema";
import { compileFields } from "@/core/mcpCompile/compileFields";
import {
  classifyToolRisk,
  compileAction,
  compileProvider,
} from "@/core/mcpCompile/compileAction";
import { McpCompileError, type McpCatalogTool } from "@/core/mcpCompile/types";

const TOOL = "unit_tool";

function fields(schema: Record<string, unknown>, overrides = {}) {
  return compileFields(TOOL, schema, overrides);
}

function obj(properties: Record<string, unknown>, required: string[] = []) {
  return { type: "object", properties, required, additionalProperties: false };
}

describe("compileFields — mapping table", () => {
  it("maps the supported scalar family", () => {
    const { fields: f, diagnostics } = fields(
      obj(
        {
          name: { type: "string" },
          body: { type: "string" },
          state: { type: "string", enum: ["open", "closed"] },
          count: { type: "integer", minimum: 1, maximum: 250 },
          score: { type: "number" },
          done: { type: "boolean" },
          day: { type: "string", format: "date" },
          at: { type: "string", format: "date-time" },
          tags: { type: "array", items: { type: "string" }, maxItems: 5 },
          sizes: { type: "array", items: { type: "string", enum: ["s", "m"] } },
        },
        ["name"],
      ),
    );
    expect(diagnostics).toEqual([]);
    const byName = new Map(f.map((x) => [x.name, x.meta]));
    expect(byName.get("name")).toMatchObject({ type: "text", required: true });
    expect(byName.get("body")).toMatchObject({ type: "textarea" }); // multiline name hint
    expect(byName.get("state")).toMatchObject({
      type: "select",
      options: [
        { value: "open", label: "Open" },
        { value: "closed", label: "Closed" },
      ],
    });
    expect(byName.get("count")).toMatchObject({
      type: "number",
      numeric: { min: 1, max: 250, integer: true },
    });
    expect(byName.get("score")).toMatchObject({ type: "number" });
    expect(byName.get("done")).toMatchObject({ type: "boolean" });
    expect(byName.get("day")).toMatchObject({ type: "date" });
    expect(byName.get("at")).toMatchObject({ type: "datetime-utc" });
    expect(byName.get("tags")).toMatchObject({
      type: "string-array",
      stringArrayMaxItems: 5,
    });
    expect(byName.get("sizes")).toMatchObject({ type: "select", multiple: true });
  });

  it("maps flat objects and arrays-of-objects to structured editors (never json)", () => {
    const { fields: f, diagnostics } = fields(
      obj({
        meta: obj({ k: { type: "string" }, n: { type: "number" } }, ["k"]),
        links: {
          type: "array",
          items: obj({ url: { type: "string" }, title: { type: "string" } }, ["url", "title"]),
        },
      }),
    );
    expect(diagnostics).toEqual([]);
    const byName = new Map(f.map((x) => [x.name, x.meta]));
    expect(byName.get("meta")).toMatchObject({
      type: "object",
      itemFields: [
        { name: "k", type: "text", required: true },
        { name: "n", type: "number", required: false },
      ],
    });
    expect(byName.get("links")).toMatchObject({ type: "object-list" });
    expect(f.every((x) => x.meta.type !== "json")).toBe(true);
  });

  it("treats the nullable idioms as optional, not unsupported", () => {
    const { fields: f, diagnostics } = fields(
      obj(
        {
          a: { anyOf: [{ type: "string" }, { type: "null" }] },
          b: { type: ["string", "null"] },
        },
        ["a", "b"],
      ),
    );
    expect(diagnostics).toEqual([]);
    expect(f.every((x) => !x.required && x.nullable)).toBe(true);
  });

  it("fails loudly on unsupported constructs — never silently falls back", () => {
    const cases: Array<[Record<string, unknown>, RegExp]> = [
      [obj({ x: { anyOf: [{ type: "string" }, { type: "number" }] } }), /anyOf/],
      [obj({ x: { $ref: "#/defs/x" } }), /\$ref/],
      [obj({ x: { type: "object", additionalProperties: true, properties: {} } }), /open object|zero usable/],
      [obj({ x: { type: "array", items: { type: "number" } } }), /array of 'number'/],
      [obj({ x: {} }), /no usable type/],
      [obj({ x: { type: "array" } }), /without an items schema/],
      [{ type: "string" }, /must be an object/],
    ];
    for (const [schema, re] of cases) {
      const { diagnostics } = fields(schema);
      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics.map((d) => d.reason).join(" | ")).toMatch(re);
    }
  });

  it("applies catalog overrides: omit (optional only), required pin, advanced, multiline", () => {
    const schema = obj({ id: { type: "string" }, note: { type: "string" }, knob: { type: "string" } });
    const ok = fields(schema, {
      id: { required: true },
      note: { multiline: true },
      knob: { advanced: true },
    });
    expect(ok.diagnostics).toEqual([]);
    const byName = new Map(ok.fields.map((x) => [x.name, x.meta]));
    expect(byName.get("id")).toMatchObject({ required: true });
    expect(byName.get("note")).toMatchObject({ type: "textarea" });
    expect(byName.get("knob")).toMatchObject({ advanced: true });

    const omitted = fields(schema, { knob: { omit: true } });
    expect(omitted.fields.map((f) => f.name)).toEqual(["id", "note"]);

    const bad = fields(obj({ id: { type: "string" } }, ["id"]), { id: { omit: true } });
    expect(bad.diagnostics[0]!.reason).toMatch(/cannot omit a REQUIRED field/);
  });

  it("enumValues override: bare scalar → labelled select (curated closed vocabulary)", () => {
    // A tool field typed `number` with the allowed set only in prose (Linear
    // `priority`) becomes a dropdown of named levels; the IR carries the closed
    // set so the emitter can constrain the zod schema.
    const schema = obj({ priority: { type: "number", description: "0=None…4=Low" } });
    const out = fields(schema, {
      priority: {
        enumValues: [
          { value: 0, label: "No priority" },
          { value: 1, label: "Urgent" },
          { value: 2, label: "High" },
        ],
      },
    });
    expect(out.diagnostics).toEqual([]);
    const priority = out.fields.find((f) => f.name === "priority")!;
    expect(priority.kind).toMatchObject({ k: "curated-enum", valueType: "number" });
    expect(priority.meta).toMatchObject({
      type: "select",
      options: [
        { value: "0", label: "No priority" },
        { value: "1", label: "Urgent" },
        { value: "2", label: "High" },
      ],
    });
  });

  it("enumValues override fails closed on mismatched type, mixed values, or a gap", () => {
    const numOnString = fields(obj({ p: { type: "string" } }), {
      p: { enumValues: [{ value: 1, label: "One" }] },
    });
    expect(numOnString.diagnostics[0]!.reason).toMatch(/are number but the tool field is 'string'/);

    const mixed = fields(obj({ p: { type: "number" } }), {
      p: { enumValues: [{ value: 1, label: "One" }, { value: "two", label: "Two" }] },
    });
    expect(mixed.diagnostics[0]!.reason).toMatch(/mixes number and string/);

    const gap = fields(obj({ p: { type: "number" } }), {
      p: { enumValues: [{ value: 1, label: "One" }, { value: 3, label: "Three" }] },
    });
    expect(gap.diagnostics[0]!.reason).toMatch(/contiguous integer range/);
  });

  it("numericMin/numericMax override injects bounds the tool schema omits", () => {
    const out = fields(obj({ n: { type: "number", maximum: 250 } }), {
      n: { numericMin: 1 },
    });
    expect(out.fields[0]!.meta).toMatchObject({ type: "number", numeric: { min: 1, max: 250 } });
  });
});

describe("risk classification", () => {
  it("classifies deterministically by verb/domain", () => {
    expect(classifyToolRisk("list_issues")).toBe("read");
    expect(classifyToolRisk("get_issue")).toBe("read");
    expect(classifyToolRisk("save_issue")).toBe("write");
    expect(classifyToolRisk("create_attachment")).toBe("write");
    expect(classifyToolRisk("delete_comment")).toBe("destructive");
    expect(classifyToolRisk("archive_project")).toBe("destructive");
    expect(classifyToolRisk("refund_payment")).toBe("financial");
    expect(classifyToolRisk("update_member_role")).toBe("administrative");
    expect(classifyToolRisk("frobnicate")).toBe("unknown");
  });
});

// ─── compileAction / compileProvider ────────────────────────────────────────

const SIMPLE_SCHEMA = obj({ id: { type: "string" }, note: { type: "string" } }, ["id"]);

function snapshotTool(name: string, inputSchema: Record<string, unknown>, outputSchema: Record<string, unknown> | null = null) {
  return {
    name,
    description: "A well-documented unit-test tool for compiler coverage.",
    inputSchema,
    outputSchema,
    schemaHash: schemaHash(inputSchema),
  };
}

function shipEntry(tool: string, type: string, extra: Partial<McpCatalogTool> = {}): McpCatalogTool {
  return {
    tool,
    decision: "ship",
    type,
    displayName: "Unit Action",
    reason: "unit test",
    verified: false,
    ...extra,
  } as McpCatalogTool;
}

describe("compileAction — outputs + risk metadata + capability profile", () => {
  it("compiles a structured outputSchema into a typed OutputMeta tree (quality excellent)", () => {
    const tool = snapshotTool("get_thing", SIMPLE_SCHEMA, {
      type: "object",
      properties: {
        id: { type: "string", description: "Thing id." },
        stats: {
          type: "object",
          properties: { views: { type: "number" } },
        },
        labels: { type: "array" },
      },
    });
    const r = compileAction("unit", tool, shipEntry("get_thing", "get_thing"));
    if ("diagnostics" in r) throw new Error("expected success");
    expect(r.action.meta.outputs).toEqual([
      { name: "id", type: "string", description: "Thing id." },
      { name: "stats", type: "object", fields: [{ name: "views", type: "number" }] },
      { name: "labels", type: "array" },
    ]);
    expect(r.action.capability.outputQuality).toBe("excellent");
  });

  it("uses curated catalog outputs (good) else the bounded text default (poor)", () => {
    const tool = snapshotTool("get_thing", SIMPLE_SCHEMA);
    const curated = compileAction(
      "unit",
      tool,
      shipEntry("get_thing", "get_thing", {
        outputs: [{ name: "issueId", type: "string", description: "Created id." }],
      }),
    );
    if ("diagnostics" in curated) throw new Error("expected success");
    expect(curated.action.meta.outputs).toEqual([
      { name: "issueId", type: "string", description: "Created id." },
    ]);
    expect(curated.action.capability.outputQuality).toBe("good");

    const fallback = compileAction("unit", tool, shipEntry("get_thing", "get_thing"));
    if ("diagnostics" in fallback) throw new Error("expected success");
    expect(fallback.action.meta.outputs).toEqual([
      expect.objectContaining({ name: "text", type: "string" }),
    ]);
    expect(fallback.action.capability.outputQuality).toBe("poor");
  });

  it("destructive classification pins isDestructive + confirmation + high risk", () => {
    const tool = snapshotTool("delete_thing", SIMPLE_SCHEMA);
    const r = compileAction("unit", tool, shipEntry("delete_thing", "delete_thing"));
    if ("diagnostics" in r) throw new Error("expected success");
    expect(r.action.meta).toMatchObject({
      isDestructive: true,
      requiresConfirmation: true,
      riskLevel: "high",
    });
    expect(r.action.capability.risk).toEqual({ classification: "destructive", level: "high" });
  });

  it("human risk override in the catalog wins over the keyword rules", () => {
    const tool = snapshotTool("save_thing", SIMPLE_SCHEMA);
    const r = compileAction("unit", tool, shipEntry("save_thing", "save_thing", { risk: "financial" }));
    if ("diagnostics" in r) throw new Error("expected success");
    expect(r.action.meta.riskLevel).toBe("high");
    expect(r.action.capability.risk.classification).toBe("financial");
  });
});

describe("compileProvider — allowlist + integrity + split tools", () => {
  const snapshotFile = (tools: unknown[]) => ({
    provider: "unit",
    serverUrl: "https://mcp.unit.test/mcp",
    protocolVersion: null,
    capturedBy: "docs-draft",
    capturedAt: "2026-07-22",
    tools,
  });
  const catalogFile = (tools: unknown[]) => ({
    provider: "unit",
    serverUrl: "https://mcp.unit.test/mcp",
    tools,
  });

  it("generates ONLY shipped tools; skip/defer entries are records", () => {
    const compiled = compileProvider(
      snapshotFile([snapshotTool("get_a", SIMPLE_SCHEMA), snapshotTool("delete_b", SIMPLE_SCHEMA)]),
      catalogFile([
        shipEntry("get_a", "get_a"),
        { tool: "delete_b", decision: "skip", reason: "destructive, no demand", verified: false },
      ]),
    );
    expect(compiled.actions.map((a) => a.type)).toEqual(["get_a"]);
    expect(compiled.capabilityReport.actions).toHaveLength(1);
  });

  it("splits one dispatcher tool into multiple typed actions (plan §10.5)", () => {
    // Dispatcher shape: everything optional at the JSON level (the real
    // save_issue contract), with create/update requirements pinned per split.
    const dispatcherSchema = obj({ id: { type: "string" }, title: { type: "string" }, note: { type: "string" } });
    const compiled = compileProvider(
      snapshotFile([snapshotTool("save_x", dispatcherSchema)]),
      catalogFile([
        shipEntry("save_x", "create_x", {
          fieldOverrides: { id: { omit: true }, title: { required: true } },
        }),
        shipEntry("save_x", "update_x", { fieldOverrides: { id: { required: true } } }),
      ]),
    );
    expect(compiled.actions.map((a) => a.type)).toEqual(["create_x", "update_x"]);
    const create = compiled.actions[0]!.meta;
    const update = compiled.actions[1]!.meta;
    expect(create.fields.map((f) => f.name)).toEqual(["title", "note"]);
    expect(create.fields[0]).toMatchObject({ required: true });
    expect(update.fields.find((f) => f.name === "id")).toMatchObject({ required: true });
  });

  it("aggregates unsupported/omission problems into McpCompileError (fail closed)", () => {
    expect(() =>
      compileProvider(
        snapshotFile([snapshotTool("bad_a", obj({ x: { $ref: "#/x" } }))]),
        catalogFile([shipEntry("bad_a", "bad_a")]),
      ),
    ).toThrow(McpCompileError);
  });

  it("rejects a shipped tool missing from the snapshot and a corrupted schemaHash", () => {
    expect(() =>
      compileProvider(snapshotFile([snapshotTool("real", SIMPLE_SCHEMA)]), catalogFile([shipEntry("ghost", "ghost")])),
    ).toThrow(/missing from the snapshot/);

    const corrupted = snapshotTool("real", SIMPLE_SCHEMA);
    corrupted.schemaHash = "deadbeef".repeat(8);
    expect(() =>
      compileProvider(snapshotFile([corrupted]), catalogFile([shipEntry("real", "real")])),
    ).toThrow(/schemaHash does not match/);
  });

  it("refuses a catalog that ships zero tools", () => {
    expect(() =>
      compileProvider(
        snapshotFile([snapshotTool("a", SIMPLE_SCHEMA)]),
        catalogFile([{ tool: "a", decision: "defer", reason: "later", verified: false }]),
      ),
    ).toThrow(/ships zero tools/);
  });
});
