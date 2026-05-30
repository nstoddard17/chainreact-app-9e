/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

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

import { exportSheet } from "@/integrations/microsoft-excel/actions/exportSheet";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUsed.mockReset();
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

describe("export_sheet action", () => {
  it("materializes data rows as keyed objects when hasHeaders=true (default)", async () => {
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

    const result = await exportSheet({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { workbookId: "wb-1", worksheetName: "Sheet1" },
      triggerEvent: trigger(),
    });

    expect(result.output.headers).toEqual(["name", "age", "city"]);
    expect(result.output.rowCount).toBe(2);
    expect(result.output.columnCount).toBe(3);
    const rows = result.output.rows as Array<Record<string, unknown>>;
    expect(rows[0]).toEqual({ name: "alice", age: 30, city: "Seattle" });
    expect(rows[1]).toEqual({ name: "bob", age: 25, city: "Portland" });
  });

  it("returns positional rows when hasHeaders=false", async () => {
    mockUsed.mockResolvedValueOnce({
      address: "Sheet1!A1:B2",
      rowCount: 2,
      columnCount: 2,
      values: [
        [1, 2],
        [3, 4],
      ],
    });

    const result = await exportSheet({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        hasHeaders: false,
      },
      triggerEvent: trigger(),
    });

    expect(result.output.headers).toBeNull();
    expect(result.output.rowCount).toBe(2);
    expect(result.output.rows).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("applies limit AFTER stripping the header row", async () => {
    mockUsed.mockResolvedValueOnce({
      address: "Sheet1!A1:A4",
      rowCount: 4,
      columnCount: 1,
      values: [["h"], ["a"], ["b"], ["c"]],
    });

    const result = await exportSheet({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { workbookId: "wb-1", worksheetName: "Sheet1", limit: 2 },
      triggerEvent: trigger(),
    });

    expect(result.output.rowCount).toBe(2);
    const rows = result.output.rows as Array<Record<string, unknown>>;
    expect(rows.map((r) => r.h)).toEqual(["a", "b"]);
  });

  it("handles an empty worksheet gracefully", async () => {
    mockUsed.mockResolvedValueOnce({
      address: "Sheet1!A1",
      rowCount: 1,
      columnCount: 1,
      values: [],
    });

    const result = await exportSheet({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { workbookId: "wb-1", worksheetName: "Sheet1" },
      triggerEvent: trigger(),
    });

    expect(result.output.rowCount).toBe(0);
    expect(result.output.headers).toEqual([]);
    expect(result.output.rows).toEqual([]);
  });

  it("rejects limit out of range", async () => {
    await expect(
      exportSheet({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          workbookId: "wb-1",
          worksheetName: "Sheet1",
          limit: 0,
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});
