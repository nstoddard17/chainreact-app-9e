/**
 * @jest-environment node
 *
 * Certification evidence capture (CS-5A). Proves the SAFETY policy: only
 * read-only + explicitly-approved tools are auto-callable; write/destructive/
 * unknown tools are refused by default; results are reduced to type-only shapes
 * (no real values), scrubbed, and bounded; unsafe evidence is withheld; and the
 * artifact is deterministic. Pure — a mocked callTool is the only boundary.
 */
import {
  deriveEvidenceShape,
  typeSkeleton,
  selectEvidenceTools,
  buildEvidence,
} from "@/integrations/_shared/mcp/evidence";
import { schemaHash, McpCatalogSchema, McpToolSnapshotFileSchema } from "@/core/mcpCompile";
import type { McpCallToolResult } from "@/integrations/_shared/mcp";

// ─── typeSkeleton + deriveEvidenceShape ──────────────────────────────────────

describe("typeSkeleton — type-only, bounded", () => {
  it("reduces values to type names and samples arrays to one element", () => {
    expect(typeSkeleton({ id: "LIN-1", count: 3, ok: true, tags: ["a", "b", "c"] })).toEqual({
      id: "string",
      count: "number",
      ok: "boolean",
      tags: ["string"],
    });
  });
  it("emits null and caps depth", () => {
    expect(typeSkeleton(null)).toBe("null");
    const deep = { a: { b: { c: { d: { e: { f: 1 } } } } } };
    expect(JSON.stringify(typeSkeleton(deep))).toContain('"..."');
  });
});

describe("deriveEvidenceShape", () => {
  it("structured result → type-only shape + fields + curatable recommendation", () => {
    const result: McpCallToolResult = {
      structuredContent: { issues: [{ id: "x", identifier: "LIN-1", title: "T", state: { name: "Todo" } }], nextCursor: "abc" },
    };
    const s = deriveEvidenceShape(result);
    expect(s.resultKind).toBe("structured");
    expect(s.observedShape).toEqual({
      issues: [{ id: "string", identifier: "string", title: "string", state: { name: "string" } }],
      nextCursor: "string",
    });
    expect(s.fieldsObserved).toEqual(["issues", "nextCursor"]);
    expect(s.pagination).toEqual({ cursorField: "nextCursor" });
    expect(s.notes).toContain("pagination_detected");
    expect(s.notes).toContain("resolver_candidate"); // issues rows have id + title
    expect(s.recommendation).toBe("structured_output_curatable");
    expect(s.safe).toBe(true);
  });

  it("parses a JSON text block as structured", () => {
    const result: McpCallToolResult = { content: [{ type: "text", text: '{"id":"LIN-9","title":"T"}' }] };
    const s = deriveEvidenceShape(result);
    expect(s.resultKind).toBe("structured");
    expect(s.observedShape).toEqual({ id: "string", title: "string" });
  });

  it("plain-text result → text kind, length only (never the raw text), text-only recommendation", () => {
    const result: McpCallToolResult = { content: [{ type: "text", text: "Created LIN-42 in Engineering" }] };
    const s = deriveEvidenceShape(result);
    expect(s.resultKind).toBe("text");
    expect(s.textLength).toBe("Created LIN-42 in Engineering".length);
    expect(s.observedShape).toBeUndefined(); // no raw text retained
    expect(s.recommendation).toBe("text_only_appropriate");
  });

  it("empty result → evidence_insufficient", () => {
    expect(deriveEvidenceShape({}).recommendation).toBe("evidence_insufficient");
  });

  it("retains only field NAMES, never business values", () => {
    const s = deriveEvidenceShape({ structuredContent: { email: "secret@example.com", ssn: "123-45-6789" } });
    const json = JSON.stringify(s);
    expect(json).not.toContain("secret@example.com");
    expect(json).not.toContain("123-45-6789");
    expect(json).toContain("email"); // field name is safe metadata
  });

  it("marks evidence unsafe if a token-like string survives scrubbing", () => {
    // A key that itself looks like a secret → the scrub belt-and-suspenders trips.
    const s = deriveEvidenceShape({ structuredContent: { ["eden_pat_abc123def456"]: "x" } });
    expect(s.safe).toBe(false);
  });
});

// ─── selectEvidenceTools — the double gate ───────────────────────────────────

function snapshotOf(tools: { name: string; inputSchema?: Record<string, unknown> }[]) {
  return McpToolSnapshotFileSchema.parse({
    provider: "demo",
    serverUrl: "https://x/mcp",
    capturedBy: "live",
    capturedAt: "2026-01-01",
    tools: tools.map((t) => {
      const inputSchema = t.inputSchema ?? { type: "object", properties: {} };
      return { name: t.name, description: "", inputSchema, outputSchema: null, schemaHash: schemaHash(inputSchema) };
    }),
  });
}

describe("selectEvidenceTools — read-only + explicit approval only", () => {
  const snapshot = snapshotOf([
    { name: "list_things" },
    { name: "search_things" },
    { name: "create_thing" },
    { name: "delete_thing" },
  ]);
  const catalog = McpCatalogSchema.parse({
    provider: "demo",
    serverUrl: "https://x/mcp",
    tools: [
      { tool: "list_things", decision: "ship", type: "list_things", displayName: "List", reason: "x", evidence: { sampleArgs: { limit: 2 } } },
      { tool: "search_things", decision: "ship", type: "search_things", displayName: "Search", reason: "x" }, // read but NOT approved
      { tool: "create_thing", decision: "ship", type: "create_thing", displayName: "Create", reason: "x", evidence: { sampleArgs: { name: "x" } } }, // write + approved → still refused
      { tool: "delete_thing", decision: "skip", reason: "destructive" },
    ],
  });

  it("auto-calls ONLY the read-only tool with a committed evidence approval", () => {
    const { callable } = selectEvidenceTools(catalog, snapshot);
    expect(callable.map((c) => c.tool)).toEqual(["list_things"]);
    expect(callable[0]!.sampleArgs).toEqual({ limit: 2 });
  });

  it("refuses a write tool EVEN WITH an evidence block", () => {
    const { skipped } = selectEvidenceTools(catalog, snapshot);
    const create = skipped.find((s) => s.tool === "create_thing")!;
    expect(create.reason).toMatch(/not read-only|write-tool/i);
  });

  it("refuses an approved-less read tool with a clear reason", () => {
    const { skipped } = selectEvidenceTools(catalog, snapshot);
    expect(skipped.find((s) => s.tool === "search_things")!.reason).toMatch(/no evidence approval/i);
  });

  it("never considers non-ship tools", () => {
    const { callable, skipped } = selectEvidenceTools(catalog, snapshot);
    expect([...callable, ...skipped].map((t) => t.tool)).not.toContain("delete_thing");
  });
});

// ─── buildEvidence — deterministic artifact ──────────────────────────────────

describe("buildEvidence", () => {
  const snapshot = snapshotOf([{ name: "list_things" }, { name: "create_thing" }]);
  const catalog = McpCatalogSchema.parse({
    provider: "demo",
    serverUrl: "https://x/mcp",
    tools: [
      { tool: "list_things", decision: "ship", type: "list_things", displayName: "List", reason: "x", evidence: { sampleArgs: { limit: 2 } } },
      { tool: "create_thing", decision: "ship", type: "create_thing", displayName: "Create", reason: "x" },
    ],
  });

  it("captures the approved read tool and records the write tool as skipped", async () => {
    const calls: string[] = [];
    const artifact = await buildEvidence({
      provider: "demo",
      catalog,
      snapshot,
      callTool: async (tool) => {
        calls.push(tool);
        return { structuredContent: { things: [{ id: "1", name: "n" }] } };
      },
    });
    expect(calls).toEqual(["list_things"]); // write tool NEVER called
    const list = artifact.tools.find((t) => t.tool === "list_things")!;
    expect(list.captureStatus).toBe("captured");
    expect(list.recommendation).toBe("structured_output_curatable");
    const create = artifact.tools.find((t) => t.tool === "create_thing")!;
    expect(create.captureStatus).toBe("skipped");
    // deterministic ordering (sorted by tool name)
    expect(artifact.tools.map((t) => t.tool)).toEqual(["create_thing", "list_things"]);
  });

  it("records a tool-call error safely (scrubbed, bounded) without aborting", async () => {
    const artifact = await buildEvidence({
      provider: "demo",
      catalog,
      snapshot,
      callTool: async () => {
        throw new Error("boom Bearer sk_live_supersecret token leaked");
      },
    });
    const list = artifact.tools.find((t) => t.tool === "list_things")!;
    expect(list.captureStatus).toBe("error");
    expect(list.reason).not.toContain("sk_live_supersecret");
  });

  it("withholds the shape when evidence is unsafe to commit", async () => {
    const artifact = await buildEvidence({
      provider: "demo",
      catalog,
      snapshot,
      callTool: async () => ({ structuredContent: { ["eden_pat_leakykey123456"]: "v" } }),
    });
    const list = artifact.tools.find((t) => t.tool === "list_things")!;
    expect(list.captureStatus).toBe("manual_review_required");
    expect(list.observedShape).toBeUndefined();
  });
});
