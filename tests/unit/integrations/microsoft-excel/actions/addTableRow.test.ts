/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockColumns = jest.fn();
const mockAdd = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-excel/api/tableColumnsList", () => ({
  tableColumnsList: (...args: unknown[]) => mockColumns(...args),
}));

jest.mock("@/integrations/microsoft-excel/api/tableRowsAdd", () => ({
  tableRowsAdd: (...args: unknown[]) => mockAdd(...args),
}));

import { addTableRow } from "@/integrations/microsoft-excel/actions/addTableRow";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockColumns.mockReset();
  mockAdd.mockReset();
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
    accountId: "alice@contoso.com",
    payload: {},
  };
}

describe("add_table_row action", () => {
  it("appends a positional row verbatim when values is an array", async () => {
    mockAdd.mockResolvedValueOnce({
      index: 7,
      values: [["x", "y", "z"]],
    });

    const result = await addTableRow({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        workbookId: "wb-1",
        tableName: "Table1",
        values: ["x", "y", "z"],
      },
      triggerEvent: trigger(),
    });

    expect(mockColumns).not.toHaveBeenCalled();
    expect(mockAdd.mock.calls[0]![0].values).toEqual([["x", "y", "z"]]);
    expect(result.output).toEqual({
      rowIndex: 7,
      columnCount: 3,
      valuesWritten: ["x", "y", "z"],
    });
  });

  it("aligns keyed values to the table's column order when values is a record", async () => {
    mockColumns.mockResolvedValueOnce([
      { id: "c-1", name: "name", index: 0 },
      { id: "c-2", name: "age", index: 1 },
      { id: "c-3", name: "city", index: 2 },
    ]);
    mockAdd.mockResolvedValueOnce({ index: 3, values: [["alice", 30, "Seattle"]] });

    await addTableRow({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        workbookId: "wb-1",
        tableName: "Table1",
        values: { city: "Seattle", name: "alice", age: 30 },
      },
      triggerEvent: trigger(),
    });

    expect(mockAdd.mock.calls[0]![0].values).toEqual([
      ["alice", 30, "Seattle"],
    ]);
  });

  it("fills missing keyed columns with null", async () => {
    mockColumns.mockResolvedValueOnce([
      { id: "c-1", name: "name", index: 0 },
      { id: "c-2", name: "age", index: 1 },
      { id: "c-3", name: "city", index: 2 },
    ]);
    mockAdd.mockResolvedValueOnce({ index: 3, values: [["alice", null, null]] });

    await addTableRow({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        workbookId: "wb-1",
        tableName: "Table1",
        values: { name: "alice" },
      },
      triggerEvent: trigger(),
    });

    expect(mockAdd.mock.calls[0]![0].values).toEqual([["alice", null, null]]);
  });

  it("respects Graph's column index ordering even when columns are returned out of order", async () => {
    mockColumns.mockResolvedValueOnce([
      { id: "c-3", name: "city", index: 2 },
      { id: "c-1", name: "name", index: 0 },
      { id: "c-2", name: "age", index: 1 },
    ]);
    mockAdd.mockResolvedValueOnce({ index: 3, values: [["a", 1, "x"]] });

    await addTableRow({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        workbookId: "wb-1",
        tableName: "Table1",
        values: { city: "x", age: 1, name: "a" },
      },
      triggerEvent: trigger(),
    });

    expect(mockAdd.mock.calls[0]![0].values).toEqual([["a", 1, "x"]]);
  });

  it("rejects an empty array of values", async () => {
    await expect(
      addTableRow({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: {
          workbookId: "wb-1",
          tableName: "Table1",
          values: [],
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});
