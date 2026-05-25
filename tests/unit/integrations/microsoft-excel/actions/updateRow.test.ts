/**
 * @jest-environment node
 *
 * Tests for the Excel `update_row` action handler. Covers:
 *   - handler-internal header read (usedRange GET)
 *   - column-name → column-letter resolution
 *   - row merge (preserves untouched cells)
 *   - fail-loud on unknown columns (no silent skip / no silent create)
 *   - row beyond used range (no silent no-op — handler still PATCHes)
 *   - refreshAndRetry accountId routing for Microsoft Excel triggers
 *     vs other-provider triggers
 *   - output shape (workbookId / worksheetName / rowNumber / address /
 *     columnsUpdated / updatedColumns)
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

import { updateRow } from "@/integrations/microsoft-excel/actions/updateRow";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUsed.mockReset();
  mockPatch.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockPatch.mockResolvedValue({});
});

function excelTrigger(): TriggerEvent {
  return {
    provider: "microsoft-excel",
    eventType: "new_row",
    eventId: "evt-1",
    occurredAt: "2026-05-14T12:00:00Z",
    accountId: "alice@contoso.com",
    payload: {},
  };
}

function nonExcelTrigger(): TriggerEvent {
  return {
    provider: "slack",
    eventType: "slack.message.channel",
    eventId: "Ev1",
    occurredAt: "2026-05-14T12:00:00Z",
    accountId: "T0001",
    payload: {},
  };
}

describe("update_row handler — happy path", () => {
  it("reads headers, merges row, PATCHes full row with merged values", async () => {
    mockUsed.mockResolvedValueOnce({
      address: "Sheet1!A1:C4",
      rowCount: 4,
      columnCount: 3,
      values: [
        ["Name", "Age", "City"],
        ["alice", 30, "Seattle"],
        ["bob", 25, "Portland"],
        ["carol", 40, "Denver"],
      ],
    });

    const result = await updateRow({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rowNumber: 3,
        values: { Age: 26 },
      },
      triggerEvent: excelTrigger(),
    });

    // PATCH was issued at row 3 with the FULL column span,
    // preserving Name + City and overlaying Age.
    expect(mockPatch).toHaveBeenCalledTimes(1);
    const patchArg = mockPatch.mock.calls[0]![0];
    expect(patchArg.address).toBe("A3:C3");
    expect(patchArg.values).toEqual([["bob", 26, "Portland"]]);

    // Output shape.
    expect(result.output).toEqual({
      workbookId: "wb-1",
      worksheetName: "Sheet1",
      rowNumber: 3,
      address: "A3:C3",
      columnsUpdated: 1,
      updatedColumns: ["Age"],
    });
  });

  it("updates multiple columns in one PATCH, preserving other cells", async () => {
    mockUsed.mockResolvedValueOnce({
      address: "Sheet1!A1:D3",
      rowCount: 3,
      columnCount: 4,
      values: [
        ["Name", "Age", "City", "Status"],
        ["alice", 30, "Seattle", "active"],
        ["bob", 25, "Portland", "active"],
      ],
    });

    const result = await updateRow({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rowNumber: 2,
        values: { Name: "ALICE", Status: "inactive" },
      },
      triggerEvent: excelTrigger(),
    });

    const patchArg = mockPatch.mock.calls[0]![0];
    expect(patchArg.address).toBe("A2:D2");
    expect(patchArg.values).toEqual([["ALICE", 30, "Seattle", "inactive"]]);
    expect(result.output.columnsUpdated).toBe(2);
    expect(result.output.updatedColumns).toEqual(["Name", "Status"]);
  });

  it("preserves the existing value when overlay is null (explicit null write)", async () => {
    mockUsed.mockResolvedValueOnce({
      address: "Sheet1!A1:B2",
      rowCount: 2,
      columnCount: 2,
      values: [
        ["Name", "Notes"],
        ["alice", "first note"],
      ],
    });

    const result = await updateRow({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rowNumber: 2,
        values: { Notes: null },
      },
      triggerEvent: excelTrigger(),
    });

    const patchArg = mockPatch.mock.calls[0]![0];
    expect(patchArg.values).toEqual([["alice", null]]);
    expect(result.output.updatedColumns).toEqual(["Notes"]);
  });

  it("handles columns past Z (e.g. AA on a 27-column worksheet)", async () => {
    const headers = Array.from({ length: 27 }, (_, i) => `c${i + 1}`);
    const dataRow = Array.from({ length: 27 }, (_, i) => i + 1);
    mockUsed.mockResolvedValueOnce({
      address: "Sheet1!A1:AA2",
      rowCount: 2,
      columnCount: 27,
      values: [headers, dataRow],
    });

    const result = await updateRow({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rowNumber: 2,
        values: { c27: 999 },
      },
      triggerEvent: excelTrigger(),
    });

    expect(result.output.address).toBe("A2:AA2");
    const patchArg = mockPatch.mock.calls[0]![0];
    expect((patchArg.values[0] as unknown[])[26]).toBe(999);
    // Other cells preserved.
    expect((patchArg.values[0] as unknown[])[0]).toBe(1);
  });
});

describe("update_row handler — fail-loud behavior", () => {
  it("throws when a values key isn't an existing header (no silent skip / no silent create)", async () => {
    mockUsed.mockResolvedValueOnce({
      address: "Sheet1!A1:B2",
      rowCount: 2,
      columnCount: 2,
      values: [
        ["Name", "Age"],
        ["alice", 30],
      ],
    });

    await expect(
      updateRow({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: {
          workbookId: "wb-1",
          worksheetName: "Sheet1",
          rowNumber: 2,
          values: { Email: "alice@example.com" },
        },
        triggerEvent: excelTrigger(),
      }),
    ).rejects.toThrow(/column.*not found.*Email/);

    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("error message lists ALL unknown columns when multiple are wrong", async () => {
    mockUsed.mockResolvedValueOnce({
      address: "Sheet1!A1:B2",
      rowCount: 2,
      columnCount: 2,
      values: [
        ["Name", "Age"],
        ["alice", 30],
      ],
    });

    await expect(
      updateRow({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: {
          workbookId: "wb-1",
          worksheetName: "Sheet1",
          rowNumber: 2,
          values: { Email: "x", Phone: "y" },
        },
        triggerEvent: excelTrigger(),
      }),
    ).rejects.toThrow(/'Email'.*'Phone'/);
  });

  it("throws when the worksheet has no usedRange (empty workbook)", async () => {
    mockUsed.mockResolvedValueOnce({
      address: "Sheet1!A1",
      rowCount: 0,
      columnCount: 0,
      values: [],
    });

    await expect(
      updateRow({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: {
          workbookId: "wb-1",
          worksheetName: "Sheet1",
          rowNumber: 2,
          values: { Name: "alice" },
        },
        triggerEvent: excelTrigger(),
      }),
    ).rejects.toThrow(/no usedRange/);

    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("rejects unknown V1 field at parse time (.strict — matchColumn)", async () => {
    await expect(
      updateRow({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: {
          workbookId: "wb-1",
          worksheetName: "Sheet1",
          rowNumber: 2,
          values: { Name: "alice" },
          matchColumn: "Email",
        },
        triggerEvent: excelTrigger(),
      }),
    ).rejects.toThrow();
  });
});

describe("update_row handler — row outside used range", () => {
  it("writes the supplied columns at the target row, padding others with null (no silent no-op)", async () => {
    mockUsed.mockResolvedValueOnce({
      address: "Sheet1!A1:B2",
      rowCount: 2,
      columnCount: 2,
      values: [
        ["Name", "Age"],
        ["alice", 30],
      ],
    });

    const result = await updateRow({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rowNumber: 50,
        values: { Name: "zoe" },
      },
      triggerEvent: excelTrigger(),
    });

    // Row 50 is beyond the used range; merged row is the supplied
    // value at Name's column + null elsewhere.
    expect(mockPatch).toHaveBeenCalledTimes(1);
    const patchArg = mockPatch.mock.calls[0]![0];
    expect(patchArg.address).toBe("A50:B50");
    expect(patchArg.values).toEqual([["zoe", null]]);
    expect(result.output.rowNumber).toBe(50);
  });
});

describe("update_row handler — refreshAndRetry routing", () => {
  beforeEach(() => {
    mockUsed.mockResolvedValueOnce({
      address: "Sheet1!A1:B2",
      rowCount: 2,
      columnCount: 2,
      values: [
        ["Name", "Age"],
        ["alice", 30],
      ],
    });
  });

  it("routes to triggerEvent.accountId when the trigger is microsoft-excel", async () => {
    await updateRow({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rowNumber: 2,
        values: { Name: "x" },
      },
      triggerEvent: excelTrigger(),
    });
    for (const call of mockRefreshAndRetry.mock.calls) {
      expect(call[0]).toMatchObject({
        provider: "microsoft-excel",
        userId: "u",
        accountId: "alice@contoso.com",
      });
    }
  });

  it("routes with accountId=null when triggerEvent is from a different provider", async () => {
    mockRefreshAndRetry.mockClear();
    mockRefreshAndRetry.mockImplementation(
      async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
    );
    await updateRow({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rowNumber: 2,
        values: { Name: "x" },
      },
      triggerEvent: nonExcelTrigger(),
    });
    for (const call of mockRefreshAndRetry.mock.calls) {
      expect(call[0]).toMatchObject({
        provider: "microsoft-excel",
        accountId: null,
      });
    }
  });
});
