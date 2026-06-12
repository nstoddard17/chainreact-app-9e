/**
 * @jest-environment node
 *
 * Tests for the LIVE MCP tool `diagnose_workflow_connections`
 * (scripts/mcp/tools/diagnoseWorkflow.ts) — Slice 4.MCP-STAGE-2B-4.
 *
 * Mocks global `fetch` to drive every render + failure path without a running
 * app, and proves the protocol egress redacts any secret-shaped string. The
 * tool is a pure `fetch` client + renderer — it imports no app code.
 */
import { diagnoseWorkflowTools } from "@/scripts/mcp/tools/diagnoseWorkflow";
import { buildRegistry } from "@/scripts/mcp/tools";
import { ToolRegistry } from "@/scripts/mcp/registry";
import { handleRpc } from "@/scripts/mcp/protocol";

const tool = diagnoseWorkflowTools.find((t) => t.name === "diagnose_workflow_connections")!;
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

describe("diagnose_workflow_connections — registration + guards", () => {
  it("is registered in the MCP registry", () => {
    expect(buildRegistry().list().map((t) => t.name)).toContain("diagnose_workflow_connections");
  });
  it("requires workflowId", async () => {
    expect(await handler({ userId: "u1" })).toMatch(/'workflowId' is required/);
  });
  it("requires userId", async () => {
    expect(await handler({ workflowId: "wf-1" })).toMatch(/'userId' is required/);
  });
  it("requires MCP_DIAGNOSTICS_TOKEN", async () => {
    delete process.env.MCP_DIAGNOSTICS_TOKEN;
    expect(await handler({ workflowId: "wf-1", userId: "u1" })).toMatch(
      /MCP_DIAGNOSTICS_TOKEN is not set/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("diagnose_workflow_connections — renders access walls with nothing extra", () => {
  for (const access of ["NOT_FOUND", "NO_ACCOUNT_ACCESS"]) {
    it(`renders ${access} with a meaning and no provider rows`, async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { workflowId: "wf-1", access }));
      const out = await handler({ workflowId: "wf-1", userId: "u1" });
      expect(out).toContain(`access: ${access}`);
      expect(out).toContain("meaning:");
      expect(out).not.toContain("allRequiredConnected:");
      expect(out).not.toContain("providers:");
    });
  }
});

describe("diagnose_workflow_connections — renders the authorized per-provider readout", () => {
  it("renders each provider with status, meaning, node usage, and missing scopes", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        workflowId: "wf-1",
        access: "OK",
        allRequiredConnected: false,
        providers: [
          {
            provider: "slack",
            name: "Slack",
            credentialClass: "account",
            nodeIds: ["trigger-1", "action-1"],
            nodeCount: 2,
            status: "CONNECTED",
            ready: true,
            providerEnabled: true,
            refreshable: true,
            tokenExpired: false,
            scopesSatisfied: true,
            missingScopeCount: 0,
          },
          {
            provider: "gmail",
            name: "Gmail",
            credentialClass: "personal",
            nodeIds: ["action-2"],
            nodeCount: 1,
            status: "MISSING_SCOPES",
            ready: false,
            providerEnabled: true,
            refreshable: true,
            tokenExpired: false,
            scopesSatisfied: false,
            missingScopeCount: 1,
            missingScopes: ["gmail.send"],
          },
        ],
      }),
    );
    const out = await handler({ workflowId: "wf-1", userId: "u1" });
    expect(out).toContain("access: OK");
    expect(out).toContain("allRequiredConnected: false");
    expect(out).toContain("slack (Slack) [account]: CONNECTED (ready=true)");
    expect(out).toContain("usedBy: 2 node(s) — trigger-1, action-1");
    expect(out).toContain("gmail (Gmail) [personal]: MISSING_SCOPES (ready=false)");
    expect(out).toContain("missingScopes: gmail.send");
    expect(out).toContain("meaning:"); // status note rendered MCP-side
  });

  it("NOT_WORKFLOW_OWNER provider renders the provenance-wall meaning", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        workflowId: "wf-1",
        access: "OK",
        allRequiredConnected: false,
        providers: [
          {
            provider: "gmail",
            name: "Gmail",
            credentialClass: "personal",
            nodeIds: ["n1"],
            nodeCount: 1,
            status: "NOT_WORKFLOW_OWNER",
            ready: false,
            providerEnabled: true,
            refreshable: true,
            tokenExpired: null,
            scopesSatisfied: false,
            missingScopeCount: 0,
          },
        ],
      }),
    );
    const out = await handler({ workflowId: "wf-1", userId: "co-member" });
    expect(out).toContain("gmail (Gmail) [personal]: NOT_WORKFLOW_OWNER");
    expect(out).toContain("Provenance wall");
  });

  it("empty graph → access OK, no provider connections", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { workflowId: "wf-1", access: "OK", allRequiredConnected: true, providers: [] }),
    );
    const out = await handler({ workflowId: "wf-1", userId: "u1" });
    expect(out).toContain("allRequiredConnected: true");
    expect(out).toContain("(none");
  });
});

describe("diagnose_workflow_connections — failure messages", () => {
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

describe("diagnose_workflow_connections — protocol egress redaction", () => {
  it("redacts a secret-shaped string at the tools/call egress", async () => {
    const slackToken = ["xoxb", "123456789012", "abcdEFGHijklMNOP"].join("-");
    fetchMock.mockResolvedValue(jsonResponse(200, { workflowId: slackToken, access: "NOT_FOUND" }));
    const registry = new ToolRegistry();
    for (const t of diagnoseWorkflowTools) registry.register(t);
    const res = await handleRpc(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "diagnose_workflow_connections",
          arguments: { workflowId: "wf-1", userId: "u1" },
        },
      },
      registry,
    );
    const text = (res?.result as { content: { text: string }[] }).content[0]?.text ?? "";
    expect(text).not.toContain(slackToken);
    expect(text).toContain("[REDACTED:slack-token]");
  });
});
