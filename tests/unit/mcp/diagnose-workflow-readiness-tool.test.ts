/**
 * @jest-environment node
 *
 * Tests for the LIVE MCP tool `diagnose_workflow_readiness`
 * (scripts/mcp/tools/diagnoseWorkflow.ts) — Slice 4.MCP-STAGE-2B-3, CS-1.
 *
 * Mocks global `fetch` to drive every render + failure path without a running
 * app, and proves the protocol egress redacts any secret-shaped string.
 */
import { diagnoseWorkflowTools } from "@/scripts/mcp/tools/diagnoseWorkflow";
import { buildRegistry } from "@/scripts/mcp/tools";
import { ToolRegistry } from "@/scripts/mcp/registry";
import { handleRpc } from "@/scripts/mcp/protocol";

const tool = diagnoseWorkflowTools.find((t) => t.name === "diagnose_workflow_readiness")!;
const handler = tool.handler;

const originalFetch = global.fetch;
let fetchMock: jest.Mock;

function jsonResponse(status: number, body: unknown): Response {
  return { status, json: async () => body } as unknown as Response;
}

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

describe("diagnose_workflow_readiness — registration + guards", () => {
  it("is registered in the MCP registry", () => {
    expect(buildRegistry().list().map((t) => t.name)).toContain("diagnose_workflow_readiness");
  });
  it("requires workflowId", async () => {
    expect(await handler({ userId: "u1" })).toMatch(/'workflowId' is required/);
  });
  it("requires userId", async () => {
    expect(await handler({ workflowId: "wf-1" })).toMatch(/'userId' is required/);
  });
  it("requires MCP_DIAGNOSTICS_TOKEN", async () => {
    delete process.env.MCP_DIAGNOSTICS_TOKEN;
    expect(await handler({ workflowId: "wf-1", userId: "u1" })).toMatch(/MCP_DIAGNOSTICS_TOKEN is not set/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("diagnose_workflow_readiness — renders access walls with nothing extra", () => {
  for (const access of ["NOT_FOUND", "NO_ACCOUNT_ACCESS"]) {
    it(`renders ${access} with a meaning and no readiness fields`, async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { workflowId: "wf-1", access }));
      const out = await handler({ workflowId: "wf-1", userId: "u1" });
      expect(out).toContain(`access: ${access}`);
      expect(out).toContain("meaning:");
      expect(out).not.toContain("runnable:");
      expect(out).not.toContain("providers:");
    });
  }
});

describe("diagnose_workflow_readiness — renders the authorized readiness verdict", () => {
  it("runnable:true clean workflow with provider inventory", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        workflowId: "wf-1",
        access: "OK",
        runnable: true,
        readinessError: null,
        graphIssues: [],
        fieldGaps: [],
        providers: [
          { provider: "slack", name: "Slack", enabled: true },
          { provider: "gmail", name: "Gmail", enabled: false },
        ],
      }),
    );
    const out = await handler({ workflowId: "wf-1", userId: "u1" });
    expect(out).toContain("access: OK");
    expect(out).toContain("runnable: true");
    expect(out).toContain("slack (Slack): enabled=true");
    expect(out).toContain("gmail (Gmail): enabled=false");
  });

  it("runnable:false with graph issue + field gap labels", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        workflowId: "wf-1",
        access: "OK",
        runnable: false,
        readinessError: "INVALID_WORKFLOW_GRAPH",
        graphIssues: [
          { code: "no_trigger" },
          { code: "unreachable_node", nodeId: "n3", displayName: "Send Email" },
        ],
        fieldGaps: [],
        providers: [{ provider: "gmail", name: "Gmail", enabled: true }],
      }),
    );
    const out = await handler({ workflowId: "wf-1", userId: "u1" });
    expect(out).toContain("runnable: false");
    expect(out).toContain("readinessError: INVALID_WORKFLOW_GRAPH");
    expect(out).toContain("no_trigger");
    expect(out).toContain("unreachable_node: n3 (Send Email)");
  });

  it("renders field gaps with labels", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        workflowId: "wf-1",
        access: "OK",
        runnable: false,
        readinessError: "MISSING_REQUIRED_FIELDS",
        graphIssues: [],
        fieldGaps: [{ nodeId: "n2", nodeName: "Send Slack Message", missingFields: ["Channel", "Message"] }],
        providers: [],
      }),
    );
    const out = await handler({ workflowId: "wf-1", userId: "u1" });
    expect(out).toContain("Send Slack Message [n2]: Channel, Message");
  });
});

describe("diagnose_workflow_readiness — failure messages", () => {
  it("network failure → helpful message, no bearer echoed", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const out = await handler({ workflowId: "wf-1", userId: "u1" });
    expect(out).toMatch(/Could not reach the diagnostic API/);
    expect(out).not.toContain("mcp-diag-token-0123456789abcdef");
  });
  it("401 → token guidance", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: "unauthorized" }));
    expect(await handler({ workflowId: "wf-1", userId: "u1" })).toMatch(/\(401\)/);
  });
  it("404 → enable guidance", async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { error: "not_found" }));
    expect(await handler({ workflowId: "wf-1", userId: "u1" })).toMatch(/DIAGNOSTICS_API_ENABLED/);
  });
});

describe("diagnose_workflow_readiness — protocol egress redaction", () => {
  it("redacts a secret-shaped string at the tools/call egress", async () => {
    const slackToken = ["xoxb", "123456789012", "abcdEFGHijklMNOP"].join("-");
    fetchMock.mockResolvedValue(
      jsonResponse(200, { workflowId: slackToken, access: "NOT_FOUND" }),
    );
    const registry = new ToolRegistry();
    for (const t of diagnoseWorkflowTools) registry.register(t);
    const res = await handleRpc(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "diagnose_workflow_readiness", arguments: { workflowId: "wf-1", userId: "u1" } },
      },
      registry,
    );
    const text = (res?.result as { content: { text: string }[] }).content[0]?.text ?? "";
    expect(text).not.toContain(slackToken);
    expect(text).toContain("[REDACTED:slack-token]");
  });
});
