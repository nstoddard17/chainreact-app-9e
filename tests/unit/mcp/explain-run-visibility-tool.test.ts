/**
 * @jest-environment node
 *
 * Tests for the LIVE MCP tool `explain_run_visibility`
 * (scripts/mcp/tools/diagnoseLive.ts) — Slice 4.MCP-STAGE-2B-3.
 *
 * It calls the SAME gated run-failure route with `mode: "visibility"` and renders
 * ONLY runId + visibility + meaning (strictly narrower than diagnose_run_failure).
 * Mocks global `fetch`; proves egress redaction + that summary fields never render.
 */
import { diagnoseLiveTools } from "@/scripts/mcp/tools/diagnoseLive";
import { buildRegistry } from "@/scripts/mcp/tools";
import { ToolRegistry } from "@/scripts/mcp/registry";
import { handleRpc } from "@/scripts/mcp/protocol";

const tool = diagnoseLiveTools.find((t) => t.name === "explain_run_visibility")!;
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

describe("explain_run_visibility — registration + guards", () => {
  it("is registered in the MCP registry", () => {
    expect(buildRegistry().list().map((t) => t.name)).toContain("explain_run_visibility");
  });
  it("requires runId", async () => {
    expect(await handler({ userId: "u1" })).toMatch(/'runId' is required/);
  });
  it("requires userId", async () => {
    expect(await handler({ runId: "run-1" })).toMatch(/'userId' is required/);
  });
  it("requires MCP_DIAGNOSTICS_TOKEN", async () => {
    delete process.env.MCP_DIAGNOSTICS_TOKEN;
    expect(await handler({ runId: "run-1", userId: "u1" })).toMatch(/MCP_DIAGNOSTICS_TOKEN is not set/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("explain_run_visibility — posts mode:visibility, renders only the classification", () => {
  it("sends mode:visibility in the request body", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { runId: "r1", visibility: "RUNNING" }));
    await handler({ runId: "r1", userId: "u1" });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body);
    expect(body).toMatchObject({ runId: "r1", userId: "u1", mode: "visibility" });
  });

  it("forwards includeTestRuns when set", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { runId: "r1", visibility: "FAILED_VISIBLE" }));
    await handler({ runId: "r1", userId: "u1", includeTestRuns: true });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body);
    expect(body.includeTestRuns).toBe(true);
  });

  const states = [
    "NOT_FOUND",
    "WRONG_ACCOUNT",
    "RUNNING",
    "TEST_RUN",
    "FAILED_VISIBLE",
    "COMPLETED_VISIBLE",
  ];
  for (const visibility of states) {
    it(`renders ${visibility} clearly with a meaning`, async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { runId: "r1", visibility }));
      const out = await handler({ runId: "r1", userId: "u1" });
      expect(out).toContain("explain_run_visibility");
      expect(out).toContain(`visibility: ${visibility}`);
      expect(out).toContain("meaning:");
    });
  }

  it("NEVER renders summary fields even if the DTO somehow carried them", async () => {
    // Defense-in-depth: the visibility renderer ignores any extra fields.
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        runId: "r1",
        visibility: "FAILED_VISIBLE",
        status: "failed",
        steps: [{ nodeId: "a", status: "failed", errorCode: "X" }],
        errorClassification: { title: "T", description: "D", severity: "error" },
      }),
    );
    const out = await handler({ runId: "r1", userId: "u1" });
    expect(out).not.toContain("status:");
    expect(out).not.toContain("steps:");
    expect(out).not.toContain("diagnosis:");
  });
});

describe("explain_run_visibility — failure messages", () => {
  it("network failure → helpful message (no bearer echoed)", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const out = await handler({ runId: "r1", userId: "u1" });
    expect(out).toMatch(/Could not reach the diagnostic API/);
    expect(out).not.toContain("mcp-diag-token-0123456789abcdef");
  });
  it("401 → token guidance", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: "unauthorized" }));
    const out = await handler({ runId: "r1", userId: "u1" });
    expect(out).toMatch(/\(401\)/);
    expect(out).not.toContain("mcp-diag-token-0123456789abcdef");
  });
  it("404 → enable guidance", async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { error: "not_found" }));
    expect(await handler({ runId: "r1", userId: "u1" })).toMatch(/DIAGNOSTICS_API_ENABLED/);
  });
});

describe("explain_run_visibility — protocol egress redaction", () => {
  it("redacts a secret-shaped string at the tools/call egress", async () => {
    const slackToken = ["xoxb", "123456789012", "abcdEFGHijklMNOP"].join("-");
    fetchMock.mockResolvedValue(jsonResponse(200, { runId: slackToken, visibility: "RUNNING" }));
    const registry = new ToolRegistry();
    for (const t of diagnoseLiveTools) registry.register(t);
    const res = await handleRpc(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "explain_run_visibility", arguments: { runId: "r1", userId: "u1" } },
      },
      registry,
    );
    const text = (res?.result as { content: { text: string }[] }).content[0]?.text ?? "";
    expect(text).not.toContain(slackToken);
    expect(text).toContain("[REDACTED:slack-token]");
  });
});
