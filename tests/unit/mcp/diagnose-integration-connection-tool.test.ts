/**
 * @jest-environment node
 *
 * Tests for the LIVE MCP tool `diagnose_integration_connection`
 * (scripts/mcp/tools/diagnoseLive.ts) — Slice 4.MCP-STAGE-2B-2, CS-2.
 *
 * Mocks global `fetch` to drive every render + failure path without a running
 * app, and proves the protocol egress redacts any secret-shaped string.
 */
import { diagnoseLiveTools } from "@/scripts/mcp/tools/diagnoseLive";
import { ToolRegistry } from "@/scripts/mcp/registry";
import { handleRpc } from "@/scripts/mcp/protocol";

const tool = diagnoseLiveTools.find((t) => t.name === "diagnose_integration_connection")!;
const handler = tool.handler;

const originalFetch = global.fetch;
let fetchMock: jest.Mock;

function jsonResponse(status: number, body: unknown): Response {
  return { status, json: async () => body } as unknown as Response;
}

function dto(over: Record<string, unknown> = {}) {
  return {
    ok: false,
    provider: "slack",
    accountId: "acct-1",
    status: "DISCONNECTED",
    activeConnectionCount: 0,
    hasActiveRow: false,
    providerEnabled: true,
    refreshable: true,
    credentialClass: "account",
    tokenExpired: null,
    scopesSatisfied: false,
    missingScopeCount: 0,
    ...over,
  };
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

describe("diagnose_integration_connection — registration + guards", () => {
  // TEST-REDUNDANCY-CONSOLIDATION-2A — removed the registration-presence
  // test (`buildRegistry().list()` contains this tool). Survivor:
  // tests/unit/mcp/registry-inventory.test.ts pins the EXACT sorted tool
  // list, so a missing registration fails there — and an unapproved extra
  // one does too, which the removed test could not catch.
  it("requires provider", async () => {
    expect(await handler({ userId: "u1", accountId: "a1" })).toMatch(/'provider' is required/);
  });
  it("requires userId", async () => {
    expect(await handler({ provider: "slack", accountId: "a1" })).toMatch(/'userId' is required/);
  });
  it("requires one of accountId or workflowId", async () => {
    expect(await handler({ provider: "slack", userId: "u1" })).toMatch(/'accountId' or 'workflowId'/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("requires MCP_DIAGNOSTICS_TOKEN", async () => {
    delete process.env.MCP_DIAGNOSTICS_TOKEN;
    const out = await handler({ provider: "slack", userId: "u1", accountId: "a1" });
    expect(out).toMatch(/MCP_DIAGNOSTICS_TOKEN is not set/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("diagnose_integration_connection — renders each status with a plain-English meaning", () => {
  const statuses = [
    "CONNECTED",
    "DISCONNECTED",
    "RECONNECT_REQUIRED",
    "TOKEN_EXPIRED",
    "MISSING_SCOPES",
    "PROVIDER_DISABLED",
    "PROVIDER_UNKNOWN",
    "NO_ACCOUNT_ACCESS",
    "NOT_WORKFLOW_OWNER",
  ];
  for (const status of statuses) {
    it(`renders ${status}`, async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, dto({ status })));
      const out = await handler({ provider: "slack", userId: "u1", accountId: "a1" });
      expect(out).toContain(`status: ${status}`);
      expect(out).toContain("meaning:"); // plain-English interpretation present
    });
  }

  it("lists the missing-scope gap in the MISSING_SCOPES arm", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, dto({ status: "MISSING_SCOPES", missingScopeCount: 2, missingScopes: ["channels:read", "groups:read"] })),
    );
    const out = await handler({ provider: "slack", userId: "u1", accountId: "a1" });
    expect(out).toContain("missingScopes: channels:read, groups:read");
  });

  it("renders tokenExpired null as 'unknown'", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, dto({ status: "CONNECTED", tokenExpired: null })));
    const out = await handler({ provider: "slack", userId: "u1", accountId: "a1" });
    expect(out).toContain("tokenExpired: unknown (no expiry tracked)");
  });
});

describe("diagnose_integration_connection — failure messages", () => {
  it("network failure → helpful 'could not reach' message", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const out = await handler({ provider: "slack", userId: "u1", accountId: "a1" });
    expect(out).toMatch(/Could not reach the diagnostic API/);
    expect(out).toContain("http://127.0.0.1:3000");
  });
  it("401 → token guidance", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: "unauthorized" }));
    expect(await handler({ provider: "slack", userId: "u1", accountId: "a1" })).toMatch(/\(401\)/);
  });
  it("404 → enable guidance", async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { error: "not_found" }));
    expect(await handler({ provider: "slack", userId: "u1", accountId: "a1" })).toMatch(/DIAGNOSTICS_API_ENABLED/);
  });
});

describe("diagnose_integration_connection — protocol egress redaction", () => {
  it("redacts a secret-shaped string at the tools/call egress", async () => {
    const slackToken = ["xoxb", "123456789012", "abcdEFGHijklMNOP"].join("-");
    fetchMock.mockResolvedValue(
      jsonResponse(200, dto({ accountId: slackToken, status: "CONNECTED" })),
    );
    const registry = new ToolRegistry();
    for (const t of diagnoseLiveTools) registry.register(t);
    const res = await handleRpc(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "diagnose_integration_connection",
          arguments: { provider: "slack", userId: "u1", accountId: "a1" },
        },
      },
      registry,
    );
    const text = (res?.result as { content: { text: string }[] }).content[0]?.text ?? "";
    expect(text).not.toContain(slackToken);
    expect(text).toContain("[REDACTED:slack-token]");
  });
});
