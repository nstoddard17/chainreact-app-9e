/**
 * @jest-environment node
 *
 * Tests for the LIVE MCP tool `diagnose_run_failure`
 * (scripts/mcp/tools/diagnoseLive.ts) — Slice 4.MCP-STAGE-2B-3, CS-2.
 *
 * Mocks global `fetch` to drive every render + failure path without a running
 * app, and proves the protocol egress redacts any secret-shaped string.
 */
import { diagnoseLiveTools } from "@/scripts/mcp/tools/diagnoseLive";
import { ToolRegistry } from "@/scripts/mcp/registry";
import { handleRpc } from "@/scripts/mcp/protocol";

const tool = diagnoseLiveTools.find((t) => t.name === "diagnose_run_failure")!;
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

describe("diagnose_run_failure — registration + guards", () => {
  // TEST-REDUNDANCY-CONSOLIDATION-2A — removed the registration-presence
  // test (`buildRegistry().list()` contains this tool). Survivor:
  // tests/unit/mcp/registry-inventory.test.ts pins the EXACT sorted tool
  // list, so a missing registration fails there — and an unapproved extra
  // one does too, which the removed test could not catch.
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

describe("diagnose_run_failure — renders visibility-only arms with nothing extra", () => {
  for (const visibility of ["NOT_FOUND", "WRONG_ACCOUNT"]) {
    it(`renders ${visibility} with a meaning and no summary fields`, async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { runId: "r1", visibility }));
      const out = await handler({ runId: "r1", userId: "u1" });
      expect(out).toContain(`visibility: ${visibility}`);
      expect(out).toContain("meaning:");
      expect(out).not.toContain("status:");
      expect(out).not.toContain("steps:");
    });
  }
});

describe("diagnose_run_failure — renders the authorized summary safely", () => {
  it("renders FAILED_VISIBLE with classification + steps", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        runId: "r1",
        visibility: "FAILED_VISIBLE",
        status: "failed",
        isTest: false,
        triggeredBy: "manual",
        firstFailedNodeId: "action-1",
        failedStepCount: 1,
        classificationAvailable: true,
        errorClassification: {
          title: "Reconnect Slack",
          description: "Your Slack connection expired.",
          hint: "Reconnect from Apps.",
          action: "reconnect",
          severity: "error",
        },
        steps: [
          { nodeId: "trigger-1", status: "succeeded", errorCode: null },
          { nodeId: "action-1", status: "failed", errorCode: "PROVIDER_REAUTH_REQUIRED" },
        ],
      }),
    );
    const out = await handler({ runId: "r1", userId: "u1" });
    expect(out).toContain("visibility: FAILED_VISIBLE");
    expect(out).toContain("firstFailedNodeId: action-1");
    expect(out).toContain("diagnosis: Reconnect Slack — Your Slack connection expired.");
    expect(out).toContain("suggestedAction: reconnect");
    expect(out).toContain("action-1: failed (PROVIDER_REAUTH_REQUIRED)");
  });

  it("renders RUNNING (no classification)", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        runId: "r1",
        visibility: "RUNNING",
        status: "running",
        isTest: false,
        triggeredBy: "webhook",
        firstFailedNodeId: null,
        failedStepCount: 0,
        classificationAvailable: false,
        errorClassification: null,
        steps: [],
      }),
    );
    const out = await handler({ runId: "r1", userId: "u1" });
    expect(out).toContain("visibility: RUNNING");
    expect(out).toContain("status: running");
    expect(out).not.toContain("diagnosis:");
  });
});

describe("diagnose_run_failure — failure messages", () => {
  it("network failure → helpful message", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const out = await handler({ runId: "r1", userId: "u1" });
    expect(out).toMatch(/Could not reach the diagnostic API/);
  });
  it("401 → token guidance", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: "unauthorized" }));
    expect(await handler({ runId: "r1", userId: "u1" })).toMatch(/\(401\)/);
  });
  it("404 → enable guidance", async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { error: "not_found" }));
    expect(await handler({ runId: "r1", userId: "u1" })).toMatch(/DIAGNOSTICS_API_ENABLED/);
  });
});

describe("diagnose_run_failure — protocol egress redaction", () => {
  it("redacts a secret-shaped string at the tools/call egress", async () => {
    const slackToken = ["xoxb", "123456789012", "abcdEFGHijklMNOP"].join("-");
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        runId: slackToken, // pathological echo
        visibility: "FAILED_VISIBLE",
        status: "failed",
        isTest: false,
        triggeredBy: "manual",
        firstFailedNodeId: "a",
        failedStepCount: 1,
        classificationAvailable: false,
        errorClassification: null,
        steps: [],
      }),
    );
    const registry = new ToolRegistry();
    for (const t of diagnoseLiveTools) registry.register(t);
    const res = await handleRpc(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "diagnose_run_failure", arguments: { runId: "r1", userId: "u1" } },
      },
      registry,
    );
    const text = (res?.result as { content: { text: string }[] }).content[0]?.text ?? "";
    expect(text).not.toContain(slackToken);
    expect(text).toContain("[REDACTED:slack-token]");
  });
});
