/**
 * @jest-environment node
 *
 * MCP drift classification + internal review report (CS-4 MCP-DRIFT). Pure logic
 * — no I/O. Proves every classification, the classification→certification-state
 * mapping, the execution decision, and the review report (affected actions,
 * rename detection, unapproved new tools, overall risk, ready-for-certification).
 */
import { schemaHash, McpCatalogSchema, type McpSnapshotTool } from "@/core/mcpCompile";
import {
  classifyToolDrift,
  diffSchemaFields,
  driftToCertificationState,
  driftAllowsExecution,
  buildDriftReport,
} from "@/integrations/_shared/mcp/driftClassify";
import type { McpTool } from "@/integrations/_shared/mcp";

const BASE_SCHEMA = {
  type: "object",
  properties: { title: { type: "string" }, team: { type: "string" } },
  required: ["title", "team"],
  additionalProperties: false,
} as const;

function certified(name: string, schema: Record<string, unknown>): McpSnapshotTool {
  return { name, description: "", inputSchema: schema, outputSchema: null, schemaHash: schemaHash(schema) };
}
function live(name: string, schema: Record<string, unknown>): McpTool {
  return { name, description: "", inputSchema: schema };
}

const pinned = certified("save_issue", BASE_SCHEMA as Record<string, unknown>);

describe("classifyToolDrift", () => {
  it("no_change when the live schema is byte-identical", () => {
    expect(classifyToolDrift(pinned, live("save_issue", BASE_SCHEMA as Record<string, unknown>))).toBe("no_change");
  });

  it("tool_removed when the tool is absent", () => {
    expect(classifyToolDrift(pinned, undefined)).toBe("tool_removed");
  });

  it("safe_addition when a new optional field appears and existing fields are unchanged", () => {
    const s = { ...BASE_SCHEMA, properties: { title: { type: "string" }, team: { type: "string" }, priority: { type: "number" } } };
    expect(classifyToolDrift(pinned, live("save_issue", s as Record<string, unknown>))).toBe("safe_addition");
  });

  it("breaking_change when a certified field is removed", () => {
    const s = { ...BASE_SCHEMA, properties: { title: { type: "string" } }, required: ["title"] };
    expect(classifyToolDrift(pinned, live("save_issue", s as Record<string, unknown>))).toBe("breaking_change");
  });

  it("breaking_change when a field becomes newly required", () => {
    const s = { ...BASE_SCHEMA, properties: { title: { type: "string" }, team: { type: "string" }, project: { type: "string" } }, required: ["title", "team", "project"] };
    expect(classifyToolDrift(pinned, live("save_issue", s as Record<string, unknown>))).toBe("breaking_change");
  });

  it("schema_changed when an existing field is modified (not provably safe)", () => {
    const s = { ...BASE_SCHEMA, properties: { title: { type: "string", maxLength: 5 }, team: { type: "string" } } };
    expect(classifyToolDrift(pinned, live("save_issue", s as Record<string, unknown>))).toBe("schema_changed");
  });
});

describe("classification → certification state + execution decision", () => {
  it("only no_change/safe_addition permit execution", () => {
    expect(driftAllowsExecution("no_change")).toBe(true);
    expect(driftAllowsExecution("safe_addition")).toBe(true);
    expect(driftAllowsExecution("breaking_change")).toBe(false);
    expect(driftAllowsExecution("tool_removed")).toBe(false);
    expect(driftAllowsExecution("tool_renamed")).toBe(false);
    expect(driftAllowsExecution("schema_changed")).toBe(false);
  });

  it("maps to the shared certification states", () => {
    expect(driftToCertificationState("no_change")).toBe("healthy");
    expect(driftToCertificationState("safe_addition")).toBe("needs_review");
    expect(driftToCertificationState("breaking_change")).toBe("blocked");
    expect(driftToCertificationState("tool_removed")).toBe("blocked");
  });
});

describe("diffSchemaFields (names only, never values)", () => {
  it("reports removed / added / newly-required / modified", () => {
    const liveSchema = {
      type: "object",
      properties: { title: { type: "string", maxLength: 9 }, project: { type: "string" } },
      required: ["title", "project"],
    };
    const d = diffSchemaFields(BASE_SCHEMA as Record<string, unknown>, liveSchema);
    expect(d.removed).toEqual(["team"]);
    expect(d.added).toEqual(["project"]);
    expect(d.newlyRequired).toEqual(["project"]);
    expect(d.modified).toEqual(["title"]);
  });
});

describe("buildDriftReport", () => {
  const catalog = McpCatalogSchema.parse({
    provider: "linear",
    serverUrl: "https://mcp.linear.app/mcp",
    tools: [
      { tool: "save_issue", decision: "ship", type: "create_issue", displayName: "Create Issue", reason: "x" },
      { tool: "save_issue", decision: "ship", type: "update_issue", displayName: "Update Issue", reason: "x" },
    ],
  });

  it("no drift → overall none, not ready for certification", () => {
    const report = buildDriftReport({
      provider: "linear",
      serverUrl: "https://mcp.linear.app/mcp",
      certifiedTools: [pinned],
      liveTools: [live("save_issue", BASE_SCHEMA as Record<string, unknown>)],
      catalog,
    });
    expect(report.overallRisk).toBe("none");
    expect(report.readyForCertification).toBe(false);
    expect(report.findings[0]!.affectedActions).toEqual(["linear:create_issue", "linear:update_issue"]);
    expect(report.affectedWorkflows).toBeNull();
  });

  it("breaking drift → overall breaking + affected actions listed", () => {
    const breaking = { ...BASE_SCHEMA, properties: { title: { type: "string" } }, required: ["title"] };
    const report = buildDriftReport({
      provider: "linear",
      serverUrl: "https://mcp.linear.app/mcp",
      certifiedTools: [pinned],
      liveTools: [live("save_issue", breaking as Record<string, unknown>)],
      catalog,
    });
    expect(report.overallRisk).toBe("breaking");
    expect(report.readyForCertification).toBe(true);
    expect(report.findings[0]!.executionAllowed).toBe(false);
    expect(report.findings[0]!.classification).toBe("breaking_change");
  });

  it("safe addition → overall review (still executes)", () => {
    const additive = { ...BASE_SCHEMA, properties: { title: { type: "string" }, team: { type: "string" }, priority: { type: "number" } } };
    const report = buildDriftReport({
      provider: "linear",
      serverUrl: "https://mcp.linear.app/mcp",
      certifiedTools: [pinned],
      liveTools: [live("save_issue", additive as Record<string, unknown>)],
      catalog,
    });
    expect(report.overallRisk).toBe("review");
    expect(report.findings[0]!.executionAllowed).toBe(true);
  });

  it("detects a rename (same schema under a new, uncertified tool name)", () => {
    const report = buildDriftReport({
      provider: "linear",
      serverUrl: "https://mcp.linear.app/mcp",
      certifiedTools: [pinned],
      liveTools: [live("upsert_issue", BASE_SCHEMA as Record<string, unknown>)],
      catalog,
    });
    expect(report.findings[0]!.classification).toBe("tool_renamed");
    expect(report.findings[0]!.renamedTo).toBe("upsert_issue");
    expect(report.findings[0]!.executionAllowed).toBe(false);
  });

  it("surfaces new server tools without ever auto-adopting them", () => {
    const report = buildDriftReport({
      provider: "linear",
      serverUrl: "https://mcp.linear.app/mcp",
      certifiedTools: [pinned],
      liveTools: [
        live("save_issue", BASE_SCHEMA as Record<string, unknown>),
        live("delete_issue", { type: "object", properties: { id: { type: "string" } }, required: ["id"] }),
      ],
      catalog,
    });
    expect(report.unapprovedNewTools).toEqual(["delete_issue"]);
    // Presence in the live catalog does NOT create an action.
    expect(report.findings.map((f) => f.tool)).toEqual(["save_issue"]);
  });
});
