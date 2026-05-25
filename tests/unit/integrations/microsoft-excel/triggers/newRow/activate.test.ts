/**
 * @jest-environment node
 */
import type { IntegrationRecord } from "@/repositories/integrations";
import type { WorkflowNode } from "@/contracts/workflowDefinition";

const mockRefreshAndRetry = jest.fn();
const mockUsed = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-excel/api/worksheetUsedRange", () => ({
  worksheetUsedRange: (...args: unknown[]) => mockUsed(...args),
}));

import { activate } from "@/integrations/microsoft-excel/triggers/newRow/activate";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUsed.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function ctx(): { integration: IntegrationRecord; node: WorkflowNode; workflowId: string } {
  const integration: IntegrationRecord = {
    id: "int-1",
    userId: "u-1",
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
    type: "microsoft-excel:new_row",
    provider: "microsoft-excel",
    kind: "trigger",
    config: { workbookId: "wb-1", worksheetName: "Sheet1" },
    position: { x: 0, y: 0 },
  };
  return { integration, node, workflowId: "wf-1" };
}

describe("new_row activation hook", () => {
  it("seeds snapshot with one entry per row, keyed by 1-based row index", async () => {
    mockUsed.mockResolvedValueOnce({
      address: "Sheet1!A1:C3",
      rowCount: 3,
      columnCount: 3,
      values: [
        ["name", "age", "city"],
        ["alice", 30, "Seattle"],
        ["bob", 25, "Portland"],
      ],
    });

    const result = await activate(ctx());

    expect(result.pollingEnabled).toBe(true);
    const snap = result.snapshot as {
      rowHashes: Record<string, string>;
      rowCount: number;
    };
    expect(snap.rowCount).toBe(3);
    expect(Object.keys(snap.rowHashes).sort()).toEqual(["1", "2", "3"]);
  });

  it("seeds an empty snapshot when the worksheet is empty (single null cell)", async () => {
    mockUsed.mockResolvedValueOnce({
      address: "Sheet1!A1",
      rowCount: 1,
      columnCount: 1,
      values: [[null]],
    });

    const result = await activate(ctx());

    const snap = result.snapshot as { rowHashes: Record<string, string>; rowCount: number };
    expect(snap.rowCount).toBe(0);
    expect(snap.rowHashes).toEqual({});
  });

  it("propagates errors from usedRange so activation fails closed (closes V1 first-poll-miss bug)", async () => {
    mockUsed.mockRejectedValueOnce(new Error("Graph timeout"));

    await expect(activate(ctx())).rejects.toThrow(/Graph timeout/);
  });

  it("rejects missing workbookId in node.config (Zod fail)", async () => {
    const c = ctx();
    (c.node.config as { workbookId?: string }).workbookId = "";
    await expect(activate(c)).rejects.toThrow();
  });
});
