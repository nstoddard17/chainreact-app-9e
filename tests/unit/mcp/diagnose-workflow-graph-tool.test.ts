/**
 * @jest-environment node
 *
 * Tests for the LIVE MCP tool `diagnose_workflow_graph`
 * (scripts/mcp/tools/diagnoseWorkflow.ts — Phase C-1). Mocks global `fetch` to
 * drive render + failure paths, and proves the protocol egress redacts secrets.
 */
import { diagnoseWorkflowTools } from "@/scripts/mcp/tools/diagnoseWorkflow";
import { buildRegistry } from "@/scripts/mcp/tools";
import { ToolRegistry } from "@/scripts/mcp/registry";
import { handleRpc } from "@/scripts/mcp/protocol";

const tool = diagnoseWorkflowTools.find((t) => t.name === "diagnose_workflow_graph")!;
const handler = tool.handler;

const originalFetch = global.fetch;
let fetchMock: jest.Mock;
const jsonResponse = (status: number, body: unknown): Response =>
  ({ status, json: async () => body }) as unknown as Response;

beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  process.env.MCP_DIAGNOSTICS_TOKEN = "mcp-diag-token-0123456789abcdef";
  process.env.MCP_DIAGNOSTICS_URL = "http://127.0.0.1:3000";
});
afterEach(() => {
  global.fetch = originalFetch;
  delete process.env.MCP_DIAGNOSTICS_TOKEN;
  delete process.env.MCP_DIAGNOSTICS_URL;
});

describe("diagnose_workflow_graph — registration + guards", () => {
  it("is registered", () => {
    expect(buildRegistry().list().map((t) => t.name)).toContain("diagnose_workflow_graph");
  });
  it("requires workflowId and userId", async () => {
    expect(await handler({ userId: "u1" })).toMatch(/'workflowId' is required/);
    expect(await handler({ workflowId: "wf-1" })).toMatch(/'userId' is required/);
  });
  it("requires MCP_DIAGNOSTICS_TOKEN", async () => {
    delete process.env.MCP_DIAGNOSTICS_TOKEN;
    expect(await handler({ workflowId: "wf-1", userId: "u1" })).toMatch(/MCP_DIAGNOSTICS_TOKEN is not set/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("diagnose_workflow_graph — renders walls + findings", () => {
  it("NO_ACCOUNT_ACCESS → meaning, no structural detail", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { workflowId: "wf-1", access: "NO_ACCOUNT_ACCESS" }));
    const out = await handler({ workflowId: "wf-1", userId: "u1" });
    expect(out).toContain("access: NO_ACCOUNT_ACCESS");
    expect(out).toContain("meaning:");
    expect(out).not.toContain("structurallyValid:");
  });

  it("OK with findings renders severity/kind/target + reason, no values", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        workflowId: "wf-1",
        access: "OK",
        structurallyValid: false,
        nodeCount: 3,
        edgeCount: 2,
        findings: [
          { kind: "STALE_EDGE", severity: "error", edgeId: "e1", from: "t1", to: "ghost" },
          { kind: "UNSUPPORTED_NODE", severity: "warning", nodeId: "a1", provider: "synthetic", nodeType: "noop", reason: "discovery-meta check" },
          { kind: "MISSING_REQUIRED_FIELDS", severity: "error", nodeId: "a2", displayName: "Send Slack", missingFields: ["Channel", "Message"] },
          { kind: "UNRESOLVED_REFERENCE", severity: "error", nodeId: "a3", token: "{{gone.x}}", fieldLabel: "Message", refPath: "gone.x" },
        ],
      }),
    );
    const out = await handler({ workflowId: "wf-1", userId: "u1" });
    expect(out).toContain("structurallyValid: false");
    expect(out).toContain("nodes: 3  edges: 2");
    expect(out).toContain("[ERROR] STALE_EDGE: edge e1 (t1→ghost)");
    expect(out).toContain("[WARNING] UNSUPPORTED_NODE: node a1 [synthetic:noop]");
    expect(out).toContain("missing fields: Channel, Message");
    expect(out).toContain("broken reference: {{gone.x}} (field: Message)");
  });

  it("OK clean → 'none' line", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { workflowId: "wf-1", access: "OK", structurallyValid: true, nodeCount: 2, edgeCount: 1, findings: [] }),
    );
    expect(await handler({ workflowId: "wf-1", userId: "u1" })).toContain("findings: (none");
  });
});

describe("diagnose_workflow_graph — protocol egress redaction", () => {
  it("redacts a secret-shaped string at tools/call egress", async () => {
    const slackToken = ["xoxb", "123456789012", "abcdEFGHijklMNOP"].join("-");
    fetchMock.mockResolvedValue(jsonResponse(200, { workflowId: slackToken, access: "NOT_FOUND" }));
    const registry = new ToolRegistry();
    for (const t of diagnoseWorkflowTools) registry.register(t);
    const res = await handleRpc(
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "diagnose_workflow_graph", arguments: { workflowId: "wf-1", userId: "u1" } } },
      registry,
    );
    const text = (res?.result as { content: { text: string }[] }).content[0]?.text ?? "";
    expect(text).not.toContain(slackToken);
    expect(text).toContain("[REDACTED:slack-token]");
  });
});
