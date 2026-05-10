/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockUsed = jest.fn();
const mockPatch = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-excel/api/worksheetUsedRange", () => ({
  worksheetUsedRange: (...args: unknown[]) => mockUsed(...args),
}));

jest.mock("@/integrations/microsoft-excel/api/worksheetRangePatch", () => ({
  worksheetRangePatch: (...args: unknown[]) => mockPatch(...args),
}));

import { addRow } from "@/integrations/microsoft-excel/actions/addRow";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUsed.mockReset();
  mockPatch.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockPatch.mockResolvedValue({});
});

function trigger(): TriggerEvent {
  return {
    provider: "microsoft-excel",
    eventType: "new_row",
    eventId: "evt-1",
    occurredAt: "2026-05-09T12:00:00Z",
    accountId: "alice@contoso.com",
    payload: {},
  };
}

describe("add_row action", () => {
  it("appends at row N+1 with the existing column span", async () => {
    mockUsed.mockResolvedValueOnce({
      address: "Sheet1!A1:C5",
      rowCount: 5,
      columnCount: 3,
      values: [
        ["name", "age", "city"],
        ["alice", 30, "Seattle"],
        ["bob", 25, "Portland"],
        ["carol", 40, "Denver"],
        ["dave", 22, "Boise"],
      ],
    });

    const result = await addRow({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        values: ["eve", 28, "Austin"],
      },
      triggerEvent: trigger(),
    });

    expect(result.output.rowIndex).toBe(6);
    expect(result.output.columnCount).toBe(3);
    expect(result.output.address).toBe("A6:C6");

    const patchCall = mockPatch.mock.calls[0]![0];
    expect(patchCall.address).toBe("A6:C6");
    expect(patchCall.values).toEqual([["eve", 28, "Austin"]]);
  });

  it("pads the supplied values when shorter than the worksheet's columns", async () => {
    mockUsed.mockResolvedValueOnce({
      address: "Sheet1!A1:D2",
      rowCount: 2,
      columnCount: 4,
      values: [
        ["a", "b", "c", "d"],
        [1, 2, 3, 4],
      ],
    });

    const result = await addRow({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        values: [9, 10],
      },
      triggerEvent: trigger(),
    });

    expect(result.output.columnCount).toBe(4);
    expect(result.output.valuesWritten).toEqual([9, 10, null, null]);
    expect(mockPatch.mock.calls[0]![0].values).toEqual([[9, 10, null, null]]);
  });

  it("truncates the supplied values when longer than the worksheet's columns", async () => {
    mockUsed.mockResolvedValueOnce({
      address: "Sheet1!A1:B2",
      rowCount: 2,
      columnCount: 2,
      values: [
        ["a", "b"],
        [1, 2],
      ],
    });

    const result = await addRow({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        values: [9, 10, 11, 12],
      },
      triggerEvent: trigger(),
    });

    expect(result.output.columnCount).toBe(2);
    expect(result.output.valuesWritten).toEqual([9, 10]);
  });

  it("writes to A1 when the worksheet is empty (Graph returns a single null cell)", async () => {
    mockUsed.mockResolvedValueOnce({
      address: "Sheet1!A1",
      rowCount: 1,
      columnCount: 1,
      values: [[null]],
    });

    const result = await addRow({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        values: ["hello", "world"],
      },
      triggerEvent: trigger(),
    });

    expect(result.output.rowIndex).toBe(1);
    expect(result.output.columnCount).toBe(2);
    expect(result.output.address).toBe("A1:B1");
    expect(mockPatch.mock.calls[0]![0].values).toEqual([["hello", "world"]]);
  });

  it("handles column counts past Z (e.g. 27 columns → AA)", async () => {
    const headers = Array.from({ length: 27 }, (_, i) => `c${i + 1}`);
    const dataRow = Array.from({ length: 27 }, (_, i) => i + 1);
    mockUsed.mockResolvedValueOnce({
      address: "Sheet1!A1:AA2",
      rowCount: 2,
      columnCount: 27,
      values: [headers, dataRow],
    });

    const result = await addRow({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        values: Array.from({ length: 27 }, (_, i) => i + 100),
      },
      triggerEvent: trigger(),
    });

    expect(result.output.address).toBe("A3:AA3");
    expect(result.output.columnCount).toBe(27);
  });
});
