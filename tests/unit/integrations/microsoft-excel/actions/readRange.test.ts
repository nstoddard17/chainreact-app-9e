/**
 * @jest-environment node
 *
 * microsoft-excel:read_range — caller-specified A1 range read.
 *
 * Rules under test: forwards workbook/worksheet/address to the wrapper;
 * bounded projection (no formulas/numberFormat spread); row cap + truncated
 * flag; strict schema rejects unbounded addresses + missing fields; 401
 * propagation.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockRangeGet = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-excel/api/worksheetRangeGet", () => ({
  worksheetRangeGet: (...args: unknown[]) => mockRangeGet(...args),
}));

import { readRange } from "@/integrations/microsoft-excel/actions/readRange";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockRangeGet.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(): TriggerEvent {
  return {
    provider: "microsoft-excel",
    eventType: "new_row",
    eventId: "evt-1",
    occurredAt: "2026-05-09T12:00:00Z",
    providerAccountId: "alice@contoso.com",
    payload: {},
  };
}

function input(config: Record<string, unknown>) {
  return { workflowId: "wf", userId: "u", accountId: "acct-u", runId: "r", nodeId: "n", config, triggerEvent: trigger() };
}

describe("read_range action", () => {
  it("forwards workbook/worksheet/address and projects a bounded shape", async () => {
    mockRangeGet.mockResolvedValueOnce({
      address: "Sheet1!A1:B2",
      rowCount: 2,
      columnCount: 2,
      values: [["a", "b"], ["c", "d"]],
      formulas: [["=1", "=2"], ["=3", "=4"]],
      numberFormat: [["General", "General"], ["General", "General"]],
    });

    const result = await readRange(input({ workbookId: "wb-1", worksheetName: "Sheet1", address: "A1:B2" }));

    expect(mockRangeGet.mock.calls[0]![0]).toEqual(
      expect.objectContaining({ workbookId: "wb-1", worksheetName: "Sheet1", address: "A1:B2" }),
    );
    expect(result.output).toEqual({
      address: "Sheet1!A1:B2",
      rowCount: 2,
      columnCount: 2,
      values: [["a", "b"], ["c", "d"]],
      truncated: false,
    });
    // Raw Graph extras must NOT spread into output.
    expect(result.output).not.toHaveProperty("formulas");
    expect(result.output).not.toHaveProperty("numberFormat");
  });

  it("caps values at 1000 rows and flags truncation (true rowCount preserved)", async () => {
    const bigValues = Array.from({ length: 1500 }, (_, i) => [i]);
    mockRangeGet.mockResolvedValueOnce({
      address: "Sheet1!A1:A1500",
      rowCount: 1500,
      columnCount: 1,
      values: bigValues,
    });

    const result = await readRange(input({ workbookId: "wb-1", worksheetName: "Sheet1", address: "A1:A1500" }));

    expect((result.output.values as unknown[]).length).toBe(1000);
    expect(result.output.truncated).toBe(true);
    expect(result.output.rowCount).toBe(1500);
  });

  it("rejects an unbounded full-column address before any call", async () => {
    await expect(
      readRange(input({ workbookId: "wb-1", worksheetName: "Sheet1", address: "A:A" })),
    ).rejects.toThrow();
    expect(mockRangeGet).not.toHaveBeenCalled();
  });

  it("rejects missing required fields", async () => {
    await expect(readRange(input({ workbookId: "wb-1", worksheetName: "Sheet1" }))).rejects.toThrow();
    await expect(readRange(input({ worksheetName: "Sheet1", address: "A1" }))).rejects.toThrow();
  });

  it("propagates a provider 401", async () => {
    mockRefreshAndRetry.mockReset();
    mockRefreshAndRetry.mockRejectedValue(new Error("Microsoft Graph workbook/.../range GET returned HTTP 401"));
    await expect(
      readRange(input({ workbookId: "wb-1", worksheetName: "Sheet1", address: "A1" })),
    ).rejects.toThrow(/401/);
  });
});
