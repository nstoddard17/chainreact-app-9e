/**
 * @jest-environment node
 *
 * microsoft-excel:read_table_rows — one bounded page of table rows.
 *
 * Rules under test: forwards workbook/table/top; defaults top to 100; caps
 * top at 500; bounded projection {index,cells}; strict schema rejects
 * missing fields; 401 propagation.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockRowsList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-excel/api/tableRowsList", () => ({
  tableRowsList: (...args: unknown[]) => mockRowsList(...args),
}));

import { readTableRows } from "@/integrations/microsoft-excel/actions/readTableRows";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockRowsList.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(): TriggerEvent {
  return {
    provider: "microsoft-excel",
    eventType: "new_table_row",
    eventId: "evt-1",
    occurredAt: "2026-05-09T12:00:00Z",
    providerAccountId: "alice@contoso.com",
    payload: {},
  };
}

function input(config: Record<string, unknown>) {
  return { workflowId: "wf", userId: "u", accountId: "acct-u", runId: "r", nodeId: "n", config, triggerEvent: trigger() };
}

describe("read_table_rows action", () => {
  it("forwards workbook/table/top and projects {index,cells}", async () => {
    mockRowsList.mockResolvedValueOnce([
      { index: 0, values: [["Ada", "ada@x.com"]] },
      { index: 1, values: [["Bo", "bo@x.com"]] },
    ]);

    const result = await readTableRows(input({ workbookId: "wb-1", tableName: "Table1", top: 25 }));

    expect(mockRowsList.mock.calls[0]![0]).toEqual(
      expect.objectContaining({ workbookId: "wb-1", tableName: "Table1", top: 25 }),
    );
    expect(result.output.rows).toEqual([
      { index: 0, cells: ["Ada", "ada@x.com"] },
      { index: 1, cells: ["Bo", "bo@x.com"] },
    ]);
    expect(result.output.count).toBe(2);
  });

  it("defaults top to 100 when omitted", async () => {
    mockRowsList.mockResolvedValueOnce([]);
    await readTableRows(input({ workbookId: "wb-1", tableName: "Table1" }));
    expect(mockRowsList.mock.calls[0]![0].top).toBe(100);
  });

  it("rejects top > 500 and missing required fields before any call", async () => {
    await expect(readTableRows(input({ workbookId: "wb-1", tableName: "Table1", top: 501 }))).rejects.toThrow();
    await expect(readTableRows(input({ workbookId: "wb-1" }))).rejects.toThrow();
    expect(mockRowsList).not.toHaveBeenCalled();
  });

  it("propagates a provider 401", async () => {
    mockRefreshAndRetry.mockReset();
    mockRefreshAndRetry.mockRejectedValue(new Error("Microsoft Graph workbook/tables/{name}/rows GET returned HTTP 401"));
    await expect(readTableRows(input({ workbookId: "wb-1", tableName: "Table1" }))).rejects.toThrow(/401/);
  });
});
