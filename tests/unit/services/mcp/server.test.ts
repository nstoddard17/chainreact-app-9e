/**
 * MCP dispatcher tests — account isolation + scope enforcement + no-leak
 * (Slice 4.PUBLIC-MCP-7).
 *
 * The core security proof at the unit level (always runs, no DB). With mocked
 * repos, asserts:
 *   - a tool can ONLY read within the token's account; a workflow/run in ANOTHER
 *     account resolves to the same `not_found` as a nonexistent one (rule d),
 *   - a tool call without the required scope is denied BEFORE any repo read (rule e),
 *   - tools/list advertises only scope-permitted tools,
 *   - tool output is the safe serialized DTO (no token/secret leak),
 *   - cross-account reads never touch a foreign account id.
 */

const mockAccountGetById = jest.fn();
const mockGetRole = jest.fn();
const mockWfGetById = jest.fn();
const mockWfList = jest.fn();
const mockRunGetById = jest.fn();
const mockRunListByWorkflow = jest.fn();
const mockRunListForDisplay = jest.fn();
const mockIntegrationsList = jest.fn();

jest.mock("@/repositories/accounts", () => ({
  getByIdServiceRole: (...a: unknown[]) => mockAccountGetById(...a),
}));
jest.mock("@/repositories/accountMemberships", () => ({
  getRoleServiceRole: (...a: unknown[]) => mockGetRole(...a),
}));
jest.mock("@/repositories/workflows", () => ({
  getByIdServiceRole: (...a: unknown[]) => mockWfGetById(...a),
  listByAccountServiceRole: (...a: unknown[]) => mockWfList(...a),
}));
jest.mock("@/repositories/workflowRuns", () => ({
  getById: (...a: unknown[]) => mockRunGetById(...a),
  listByWorkflow: (...a: unknown[]) => mockRunListByWorkflow(...a),
  listByAccountForDisplay: (...a: unknown[]) => mockRunListForDisplay(...a),
}));
jest.mock("@/repositories/integrations", () => ({
  listActiveByAccount: (...a: unknown[]) => mockIntegrationsList(...a),
}));

import { handleMcpRpc } from "@/services/mcp/server";

const ALL_SCOPES = ["accounts:read", "workflows:read", "runs:read", "integrations:read"];

function ctx(scopes: string[] = ALL_SCOPES) {
  return { accountId: "A", userId: "uA", scopes };
}

function call(name: string, args: Record<string, unknown> = {}, id: number | string = 1) {
  return { jsonrpc: "2.0" as const, id, method: "tools/call", params: { name, arguments: args } };
}

beforeEach(() => jest.clearAllMocks());

describe("services/mcp/server — protocol", () => {
  it("initialize returns the chainreact server info", async () => {
    const { response } = await handleMcpRpc({ id: 1, method: "initialize" }, ctx());
    const result = response?.result as { serverInfo: { name: string } };
    expect(result.serverInfo.name).toBe("chainreact");
  });

  it("notifications/initialized yields no response", async () => {
    const { response } = await handleMcpRpc({ method: "notifications/initialized" }, ctx());
    expect(response).toBeNull();
  });

  it("tools/list advertises only scope-permitted tools", async () => {
    const { response } = await handleMcpRpc(
      { id: 1, method: "tools/list" },
      ctx(["workflows:read"]),
    );
    const tools = (response?.result as { tools: Array<{ name: string }> }).tools.map((t) => t.name);
    expect(tools.sort()).toEqual(["get_workflow", "list_workflows"]);
    expect(tools).not.toContain("list_integrations");
    expect(tools).not.toContain("get_run_details");
  });
});

describe("services/mcp/server — scope enforcement (rule e)", () => {
  it("denies a tool call missing the required scope, before any repo read", async () => {
    const { response, audit } = await handleMcpRpc(
      call("list_integrations"),
      ctx(["workflows:read"]),
    );
    const result = response?.result as { isError: boolean };
    expect(result.isError).toBe(true);
    expect(audit).toMatchObject({ outcome: "denied", reason: "insufficient_scope" });
    expect(mockIntegrationsList).not.toHaveBeenCalled();
  });
});

describe("services/mcp/server — account isolation (rule d)", () => {
  it("get_workflow for a workflow in ANOTHER account returns not_found", async () => {
    mockWfGetById.mockResolvedValue({ id: "wf-B", accountId: "B", state: "active", draftDefinition: { nodes: [], edges: [] } });
    const { response, audit } = await handleMcpRpc(call("get_workflow", { workflow_id: "wf-B" }), ctx());
    const result = response?.result as { isError: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Not found");
    expect(audit).toMatchObject({ outcome: "not_found", tool: "get_workflow" });
  });

  it("get_run_details for a run in ANOTHER account returns not_found", async () => {
    mockRunGetById.mockResolvedValue({ id: "run-B", accountId: "B" });
    const { response, audit } = await handleMcpRpc(call("get_run_details", { run_id: "run-B" }), ctx());
    expect((response?.result as { isError: boolean }).isError).toBe(true);
    expect(audit).toMatchObject({ outcome: "not_found" });
  });

  it("list_runs filtered by a workflow in ANOTHER account returns not_found (no runs read)", async () => {
    mockWfGetById.mockResolvedValue({ id: "wf-B", accountId: "B" });
    const { response } = await handleMcpRpc(call("list_runs", { workflow_id: "wf-B" }), ctx());
    expect((response?.result as { isError: boolean }).isError).toBe(true);
    expect(mockRunListByWorkflow).not.toHaveBeenCalled();
  });

  it("list_workflows reads ONLY the token's account", async () => {
    mockWfList.mockResolvedValue([
      { id: "wf-A", name: "A flow", state: "active", createdAt: "t", updatedAt: "t" },
    ]);
    const { response } = await handleMcpRpc(call("list_workflows"), ctx());
    expect(mockWfList).toHaveBeenCalledWith("A", { limit: 100 });
    const data = (response?.result as { structuredContent: { workflows: Array<{ id: string }> } }).structuredContent;
    expect(data.workflows.map((w) => w.id)).toEqual(["wf-A"]);
  });

  it("get_workflow in the SAME account returns the detail DTO (no config)", async () => {
    mockWfGetById.mockResolvedValue({
      id: "wf-A",
      accountId: "A",
      name: "Flow",
      state: "active",
      createdAt: "t",
      updatedAt: "t",
      draftDefinition: {
        nodes: [{ id: "n1", kind: "action", provider: "slack", type: "send", config: { secret: "LEAK" }, position: { x: 0, y: 0 } }],
        edges: [],
      },
    });
    const { response, audit } = await handleMcpRpc(call("get_workflow", { workflow_id: "wf-A" }), ctx());
    const result = response?.result as { isError: boolean; structuredContent: unknown };
    expect(result.isError).toBe(false);
    expect(JSON.stringify(result.structuredContent)).not.toContain("LEAK");
    expect(audit).toMatchObject({ outcome: "ok", tool: "get_workflow" });
  });
});

describe("services/mcp/server — no-leak in tool output", () => {
  it("list_integrations returns provider/label/status/usage only — never tokens — and does not mark a co-member's private identity usable", async () => {
    mockIntegrationsList.mockResolvedValue([
      {
        id: "int-1",
        provider: "slack", // account/service → usable by any member
        displayName: "acme.slack.com",
        accessTokenEncrypted: "ENC-LEAK",
        refreshTokenEncrypted: "ENC-LEAK-2",
        scopes: ["chat:write"],
        accountMetadata: { x: "META-LEAK" },
        providerAccountId: "T-LEAK",
        connectedByUserId: "U-LEAK",
        integrationSharingScope: null,
        disconnectedAt: null,
        needsReconnectAt: null,
        createdAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "int-2",
        provider: "gmail", // personal identity connected by ANOTHER member
        displayName: "nate@company.com",
        accessTokenEncrypted: "ENC-LEAK-3",
        refreshTokenEncrypted: "ENC-LEAK-4",
        scopes: ["https://mail.google.com/"],
        accountMetadata: { x: "META-LEAK-2" },
        providerAccountId: "MAILBOX-LEAK",
        connectedByUserId: "OTHER-MEMBER-LEAK",
        integrationSharingScope: null,
        disconnectedAt: null,
        needsReconnectAt: null,
        createdAt: "2026-01-02T00:00:00Z",
      },
    ]);
    // ctx actor "uA" is NOT the gmail connector.
    const { response } = await handleMcpRpc(call("list_integrations"), ctx());
    const structured = (response?.result as {
      structuredContent: { integrations: Array<{ id: string; usage: string }> };
    }).structuredContent;
    const json = JSON.stringify(structured);
    for (const leak of [
      "ENC-LEAK", "META-LEAK", "T-LEAK", "U-LEAK", "chat:write",
      "MAILBOX-LEAK", "OTHER-MEMBER-LEAK", "mail.google.com",
    ]) {
      expect(json).not.toContain(leak);
    }
    expect(json).toContain("acme.slack.com"); // the account's own label is fine

    const byId = new Map(structured.integrations.map((i) => [i.id, i.usage]));
    expect(byId.get("int-1")).toBe("available"); // shared service
    expect(byId.get("int-2")).toBe("not_available"); // co-member's private mailbox
  });
});

describe("services/mcp/server — unknown tool", () => {
  it("returns a tool-level not-found for an unknown tool", async () => {
    const { response, audit } = await handleMcpRpc(call("delete_everything"), ctx());
    expect((response?.result as { isError: boolean }).isError).toBe(true);
    expect(audit).toMatchObject({ outcome: "not_found", reason: "unknown_tool" });
  });
});
