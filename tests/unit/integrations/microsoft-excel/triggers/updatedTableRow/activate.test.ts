/**
 * @jest-environment node
 */
import type { IntegrationRecord } from "@/repositories/integrations";
import type { WorkflowNode } from "@/contracts/workflowDefinition";

const mockRefreshAndRetry = jest.fn();
const mockRows = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-excel/api/tableRowsList", () => ({
  tableRowsList: (...args: unknown[]) => mockRows(...args),
}));

import { activate } from "@/integrations/microsoft-excel/triggers/updatedTableRow/activate";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockRows.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function ctx(overrides?: { tableName?: string }): {
  integration: IntegrationRecord;
  node: WorkflowNode;
  workflowId: string;
} {
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
    type: "microsoft-excel:updated_table_row",
    provider: "microsoft-excel",
    kind: "trigger",
    config: {
      workbookId: "wb-1",
      tableName: overrides?.tableName ?? "Table1",
    },
    position: { x: 0, y: 0 },
  };
  return { integration, node, workflowId: "wf-1" };
}

describe("updated_table_row activation hook", () => {
  it("seeds snapshot keyed by Graph's stable row index", async () => {
    mockRows.mockResolvedValueOnce([
      { index: 0, values: [["alice", 30]] },
      { index: 1, values: [["bob", 25]] },
      { index: 2, values: [["carol", 40]] },
    ]);

    const result = await activate(ctx());

    expect(result.pollingEnabled).toBe(true);
    const snap = result.snapshot as {
      rowHashes: Record<string, string>;
      rowCount: number;
    };
    expect(snap.rowCount).toBe(3);
    expect(Object.keys(snap.rowHashes).sort()).toEqual(["0", "1", "2"]);
  });

  it("seeds an empty snapshot for an empty table", async () => {
    mockRows.mockResolvedValueOnce([]);

    const result = await activate(ctx());

    const snap = result.snapshot as { rowCount: number };
    expect(snap.rowCount).toBe(0);
  });

  it("propagates Graph errors so activation fails closed", async () => {
    mockRows.mockRejectedValueOnce(new Error("Graph throttled"));

    await expect(activate(ctx())).rejects.toThrow(/throttled/);
  });

  it("rejects empty tableName via Zod", async () => {
    await expect(activate(ctx({ tableName: "" }))).rejects.toThrow();
  });
});
