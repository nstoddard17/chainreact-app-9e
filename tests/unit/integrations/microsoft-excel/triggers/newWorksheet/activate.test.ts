/**
 * @jest-environment node
 */
import type { IntegrationRecord } from "@/repositories/integrations";
import type { WorkflowNode } from "@/contracts/workflowDefinition";

const mockRefreshAndRetry = jest.fn();
const mockList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-excel/api/worksheetsList", () => ({
  worksheetsList: (...args: unknown[]) => mockList(...args),
}));

import { activate } from "@/integrations/microsoft-excel/triggers/newWorksheet/activate";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockList.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function ctx(overrides?: { workbookId?: string }): {
  integration: IntegrationRecord;
  node: WorkflowNode;
  workflowId: string;
} {
  const integration: IntegrationRecord = {
    id: "int-1",
    accountId: "acct-u-1",
    connectedByUserId: "u-1",
    provider: "microsoft-excel",
    providerAccountId: "alice@contoso.com",
    displayName: "Alice",
    accessTokenEncrypted: "enc",
    refreshTokenEncrypted: "enc",
    accessTokenExpiresAt: null,
    scopes: ["Files.ReadWrite"],
    accountMetadata: {},
    disconnectedAt: null,
    createdAt: "2026-05-09T00:00:00Z",
    updatedAt: "2026-05-09T00:00:00Z",
  };
  const node: WorkflowNode = {
    id: "n-1",
    type: "microsoft-excel:new_worksheet",
    provider: "microsoft-excel",
    kind: "trigger",
    config: { workbookId: overrides?.workbookId ?? "wb-1" },
    position: { x: 0, y: 0 },
  };
  return { integration, node, workflowId: "wf-1" };
}

describe("new_worksheet activation hook", () => {
  it("seeds snapshot with the workbook's worksheet names in workbook order", async () => {
    mockList.mockResolvedValueOnce([
      { id: "ws-1", name: "Sheet1", position: 0 },
      { id: "ws-2", name: "Sheet2", position: 1 },
      { id: "ws-3", name: "Sheet3", position: 2 },
    ]);

    const result = await activate(ctx());

    expect(result.pollingEnabled).toBe(true);
    const snap = result.snapshot as { names: string[]; updatedAt: string };
    expect(snap.names).toEqual(["Sheet1", "Sheet2", "Sheet3"]);
    expect(typeof snap.updatedAt).toBe("string");
  });

  it("seeds an empty snapshot when the workbook has no worksheets", async () => {
    mockList.mockResolvedValueOnce([]);

    const result = await activate(ctx());

    const snap = result.snapshot as { names: string[] };
    expect(snap.names).toEqual([]);
  });

  it("skips entries with empty or non-string names", async () => {
    mockList.mockResolvedValueOnce([
      { id: "ws-1", name: "Sheet1" },
      { id: "ws-2", name: "" },
      { id: "ws-3", name: null as unknown as string },
      { id: "ws-4", name: "Sheet2" },
    ]);

    const result = await activate(ctx());

    const snap = result.snapshot as { names: string[] };
    expect(snap.names).toEqual(["Sheet1", "Sheet2"]);
  });

  it("propagates Graph errors so activation fails closed (closes V1 first-poll-miss bug)", async () => {
    mockList.mockRejectedValueOnce(new Error("Graph 503"));

    await expect(activate(ctx())).rejects.toThrow(/503/);
  });

  it("rejects missing workbookId in node.config (Zod fail)", async () => {
    await expect(activate(ctx({ workbookId: "" }))).rejects.toThrow();
  });
});
