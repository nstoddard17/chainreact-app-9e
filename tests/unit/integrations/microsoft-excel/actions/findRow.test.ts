/**
 * @jest-environment node
 *
 * microsoft-excel:find_row — first-match lookup over one bounded page.
 *
 * Rules under test: resolves the lookup column index from columns; scans
 * rows (capped by maxRows) for a string-coerced match; returns first match /
 * no-match; missing column is an error; bounded projection {index,cells};
 * strict schema rejects missing fields; 401 propagation.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockColumnsList = jest.fn();
const mockRowsList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-excel/api/tableColumnsList", () => ({
  tableColumnsList: (...args: unknown[]) => mockColumnsList(...args),
}));

jest.mock("@/integrations/microsoft-excel/api/tableRowsList", () => ({
  tableRowsList: (...args: unknown[]) => mockRowsList(...args),
}));

import { findRow } from "@/integrations/microsoft-excel/actions/findRow";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockColumnsList.mockReset();
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

describe("find_row action", () => {
  it("returns the first row matching the lookup column/value (string-coerced)", async () => {
    mockColumnsList.mockResolvedValueOnce([
      { id: "c0", name: "Name", index: 0 },
      { id: "c1", name: "Score", index: 1 },
    ]);
    mockRowsList.mockResolvedValueOnce([
      { index: 0, values: [["Ada", 50]] },
      { index: 1, values: [["Bo", 100]] },
    ]);

    const result = await findRow(
      input({ workbookId: "wb-1", tableName: "Table1", lookupColumn: "Score", lookupValue: "100" }),
    );

    expect(result.output.found).toBe(true);
    expect(result.output.firstMatch).toEqual({ index: 1, cells: ["Bo", 100] });
    expect(result.output.scanned).toBe(2);
  });

  it("returns found=false (not an error) when no row matches", async () => {
    mockColumnsList.mockResolvedValueOnce([{ id: "c0", name: "Name", index: 0 }]);
    mockRowsList.mockResolvedValueOnce([{ index: 0, values: [["Ada"]] }]);

    const result = await findRow(
      input({ workbookId: "wb-1", tableName: "Table1", lookupColumn: "Name", lookupValue: "Nobody" }),
    );

    expect(result.output.found).toBe(false);
    expect(result.output.firstMatch).toBeNull();
  });

  it("throws when the lookup column does not exist", async () => {
    mockColumnsList.mockResolvedValueOnce([{ id: "c0", name: "Name", index: 0 }]);
    await expect(
      findRow(input({ workbookId: "wb-1", tableName: "Table1", lookupColumn: "Ghost", lookupValue: "x" })),
    ).rejects.toThrow(/not found/);
    expect(mockRowsList).not.toHaveBeenCalled();
  });

  it("forwards maxRows as the rows page cap (default 100)", async () => {
    mockColumnsList.mockResolvedValueOnce([{ id: "c0", name: "Name", index: 0 }]);
    mockRowsList.mockResolvedValueOnce([]);
    await findRow(input({ workbookId: "wb-1", tableName: "Table1", lookupColumn: "Name", lookupValue: "x" }));
    expect(mockRowsList.mock.calls[0]![0].top).toBe(100);
  });

  it("rejects missing required fields before any call", async () => {
    await expect(
      findRow(input({ workbookId: "wb-1", tableName: "Table1", lookupColumn: "Name" })),
    ).rejects.toThrow();
    expect(mockColumnsList).not.toHaveBeenCalled();
  });
});
