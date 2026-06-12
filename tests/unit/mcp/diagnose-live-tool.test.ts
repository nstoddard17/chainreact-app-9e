/**
 * @jest-environment node
 *
 * Tests for the LIVE MCP tool `diagnose_option_source_live`
 * (scripts/mcp/tools/diagnoseLive.ts) — Slice 4.MCP-STAGE-2B-1.
 *
 * The tool is a `fetch` client onto the app's internal diagnostics route. These
 * tests mock global `fetch` to drive every render + failure path WITHOUT a
 * running app, and prove the protocol egress redacts any secret-shaped string.
 */
import { diagnoseLiveTools } from "@/scripts/mcp/tools/diagnoseLive";
import { buildRegistry } from "@/scripts/mcp/tools";
import { ToolRegistry } from "@/scripts/mcp/registry";
import { handleRpc } from "@/scripts/mcp/protocol";

const handler = diagnoseLiveTools[0]!.handler;

const originalFetch = global.fetch;
let fetchMock: jest.Mock;

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    json: async () => body,
  } as unknown as Response;
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

describe("diagnose_option_source_live — registration", () => {
  it("is registered in the MCP registry", () => {
    const names = buildRegistry().list().map((t) => t.name);
    expect(names).toContain("diagnose_option_source_live");
  });
});

describe("diagnose_option_source_live — input + config guards", () => {
  it("requires source", async () => {
    expect(await handler({ userId: "u1" })).toMatch(/'source' is required/);
  });
  it("requires userId", async () => {
    expect(await handler({ source: "slack:channels" })).toMatch(/'userId' is required/);
  });
  it("requires MCP_DIAGNOSTICS_TOKEN", async () => {
    delete process.env.MCP_DIAGNOSTICS_TOKEN;
    const out = await handler({ source: "slack:channels", userId: "u1" });
    expect(out).toMatch(/MCP_DIAGNOSTICS_TOKEN is not set/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("diagnose_option_source_live — renders the DTO", () => {
  it("renders a success DTO with the item count", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        ok: true,
        source: "slack:channels",
        code: null,
        itemCount: 42,
        hasMore: true,
        credentialDecision: "account",
        requiresIntegration: true,
        integrationConnected: true,
      }),
    );
    const out = await handler({ source: "slack:channels", userId: "u1" });
    expect(out).toContain("result: OK");
    expect(out).toContain("itemCount: 42");
    expect(out).toContain("hasMore: true");
    expect(out).toContain("credentialDecision: account");
  });

  it("renders each error code with its static cause + next-checks", async () => {
    for (const code of [
      "SOURCE_NOT_FOUND",
      "MISSING_DEPENDENCY",
      "INTEGRATION_DISCONNECTED",
      "OWNER_MUST_CONNECT",
      "NOT_WORKFLOW_OWNER",
      "PROVIDER_ERROR",
      "PROVIDER_REAUTH_REQUIRED",
      "SERVER_ERROR",
    ]) {
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          ok: false,
          source: "slack:channels",
          code,
          itemCount: 0,
          hasMore: false,
          credentialDecision: null,
          requiresIntegration: true,
          integrationConnected: false,
        }),
      );
      const out = await handler({ source: "slack:channels", userId: "u1" });
      expect(out).toContain(`code: ${code}`);
      expect(out).toContain("cause:");
      expect(out).toContain("next:");
    }
  });

  it("shows the missing dependency name when present", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        ok: false,
        source: "airtable:fields",
        code: "MISSING_DEPENDENCY",
        itemCount: 0,
        hasMore: false,
        credentialDecision: null,
        requiresIntegration: true,
        integrationConnected: false,
        missingDependency: "baseId",
      }),
    );
    const out = await handler({ source: "airtable:fields", userId: "u1" });
    expect(out).toContain("missingDependency: baseId");
  });
});

describe("diagnose_option_source_live — failure messages", () => {
  it("gives a helpful message on a network failure (never throws)", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED 127.0.0.1:3000"));
    const out = await handler({ source: "slack:channels", userId: "u1" });
    expect(out).toMatch(/Could not reach the diagnostic API/);
    expect(out).toContain("http://127.0.0.1:3000");
  });
  it("explains a 401", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: "unauthorized" }));
    const out = await handler({ source: "slack:channels", userId: "u1" });
    expect(out).toMatch(/rejected the request \(401\)/);
    expect(out).toMatch(/MCP_DIAGNOSTICS_TOKEN/);
  });
  it("explains a 404 (disabled / not found)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { error: "not_found" }));
    const out = await handler({ source: "slack:channels", userId: "u1" });
    expect(out).toMatch(/disabled or not found \(404\)/);
    expect(out).toMatch(/DIAGNOSTICS_API_ENABLED/);
  });
  it("explains a 400 (bad input)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { error: "invalid_input" }));
    const out = await handler({ source: "bad", userId: "u1" });
    expect(out).toMatch(/rejected the input \(400\)/);
  });
});

describe("diagnose_option_source_live — protocol egress redaction", () => {
  it("redacts a secret-shaped string at the tools/call egress", async () => {
    const slackToken = ["xoxb", "123456789012", "abcdEFGHijklMNOP"].join("-");
    // Pathological: the API somehow echoes a token in a field. The renderer
    // would print it, but the protocol egress must redact it.
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        ok: false,
        source: slackToken, // injected secret
        code: "PROVIDER_ERROR",
        itemCount: 0,
        hasMore: false,
        credentialDecision: null,
        requiresIntegration: true,
        integrationConnected: true,
      }),
    );
    const registry = new ToolRegistry();
    for (const t of diagnoseLiveTools) registry.register(t);
    const res = await handleRpc(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "diagnose_option_source_live",
          arguments: { source: "slack:channels", userId: "u1" },
        },
      },
      registry,
    );
    const text = (res?.result as { content: { text: string }[] }).content[0]?.text ?? "";
    expect(text).not.toContain(slackToken);
    expect(text).toContain("[REDACTED:slack-token]");
  });
});
