/**
 * @jest-environment node
 *
 * Tests for the Excel `update_row` action handler. Covers:
 *   - handler-internal header read (usedRange GET)
 *   - column-name → column-letter resolution
 *   - row merge (preserves untouched cells)
 *   - fail-loud on unknown columns (no silent skip / no silent create)
 *   - SPREADSHEET-GUIDED-CONFIG-S3 fail-closed guards: the heading row is
 *     never a target, and a row beyond the used range is an ERROR with no
 *     PATCH issued (this used to silently CREATE a null-filled row)
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
    providerAccountId: "alice@contoso.com",
    payload: {},
  };
}

function nonExcelTrigger(): TriggerEvent {
  return {
    provider: "slack",
    eventType: "slack.message.channel",
    eventId: "Ev1",
    occurredAt: "2026-05-14T12:00:00Z",
    providerAccountId: "T0001",
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
      accountId: "acct-u",
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
      accountId: "acct-u",
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

  // The name this test used to carry — "preserves the existing value when
  // overlay is null" — described the opposite of what it asserts. The
  // overlaid cell is NOT preserved: `null` is written through and CLEARS
  // it. What is preserved is the other, untouched column. Corrected in
  // SPREADSHEET-GUIDED-CONFIG-S3, where the null path became a documented
  // part of the compatibility contract rather than an accident.
  it("writes an explicit null through, CLEARING that cell while untouched columns survive", async () => {
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
      accountId: "acct-u",
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
      accountId: "acct-u",
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
        accountId: "acct-u",
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
        accountId: "acct-u",
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
        accountId: "acct-u",
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
        accountId: "acct-u",
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

/**
 * SPREADSHEET-GUIDED-CONFIG-S3 — the two fail-closed guards.
 *
 * Both replace behavior that was actively wrong, and both are asserted the
 * same way: the run fails AND no PATCH reaches the provider. "It threw" is
 * only half the claim that matters here — the other half is that nothing
 * was written to the customer's spreadsheet on the way out.
 */
describe("update_row handler — the row must already exist", () => {
  function fourRowSheet() {
    mockUsed.mockResolvedValueOnce({
      address: "Sheet1!A1:B4",
      rowCount: 4,
      columnCount: 2,
      values: [
        ["Name", "Age"],
        ["alice", 30],
        ["bob", 25],
        ["carol", 40],
      ],
    });
  }

  function run(rowNumber: number, address?: string, values?: unknown[][]) {
    if (address && values) {
      mockUsed.mockResolvedValueOnce({
        address,
        rowCount: values.length,
        columnCount: values[0]?.length ?? 0,
        values,
      });
    } else {
      fourRowSheet();
    }
    return updateRow({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rowNumber,
        values: { Name: "zoe" },
      },
      triggerEvent: excelTrigger(),
    });
  }

  it("refuses a row beyond the used range and issues NO patch", async () => {
    // This is the behavior fix. The handler's own comment claimed it threw
    // here; it did not. `existingRow` fell back to `[]`, every unconfigured
    // column became null, and the PATCH wrote that — so "update row 50" on
    // a four-row sheet silently CREATED a null-filled row 50. Update Row
    // must not quietly become Add Row.
    await expect(run(50)).rejects.toThrow(/row 50 does not exist/i);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("names the last row that does exist, so the error is actionable", async () => {
    await expect(run(50)).rejects.toThrow(/through row 4/i);
  });

  it("says it will not create the row rather than leaving that ambiguous", async () => {
    await expect(run(50)).rejects.toThrow(/never creates one/i);
  });

  it("accepts the last row that does exist", async () => {
    await expect(run(4)).resolves.toBeDefined();
    expect(mockPatch).toHaveBeenCalledTimes(1);
    expect(mockPatch.mock.calls[0]![0].values).toEqual([["zoe", 40]]);
  });

  it("indexes from the used range's REAL first row, not from row 1", async () => {
    // Graph returns an absolute address and the used range need not start
    // at the top. Assuming `rowNumber - 1` read a DIFFERENT row's values
    // into the merge and wrote them to the target.
    await expect(
      run(4, "Sheet1!A3:B5", [
        ["Name", "Age"],
        ["alice", 30],
        ["bob", 25],
      ]),
    ).resolves.toBeDefined();
    // Row 4 is the SECOND row of a used range starting at row 3 → alice.
    expect(mockPatch.mock.calls[0]![0].values).toEqual([["zoe", 30]]);
    expect(mockPatch.mock.calls[0]![0].address).toBe("A4:B4");
  });

  it("refuses a row below a used range that starts further down", async () => {
    await expect(
      run(2, "Sheet1!A3:B5", [
        ["Name", "Age"],
        ["alice", 30],
        ["bob", 25],
      ]),
    ).rejects.toThrow();
    expect(mockPatch).not.toHaveBeenCalled();
  });
});

describe("update_row handler — the heading row is never a target", () => {
  it("rejects row 1 and issues NO patch", async () => {
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
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        // Row 1 is stopped by the SCHEMA minimum, before the handler runs
        // at all — which is the earliest possible point and means no Graph
        // call of any kind is made. The handler's own guard is the second
        // line of defence and is exercised below, where the used range
        // starts further down and the heading row is not row 1.
        config: {
          workbookId: "wb-1",
          worksheetName: "Sheet1",
          rowNumber: 1,
          values: { Name: "zoe" },
        },
        triggerEvent: excelTrigger(),
      }),
    ).rejects.toThrow();
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("protects the heading row of a used range that starts further down", async () => {
    mockUsed.mockResolvedValueOnce({
      address: "Sheet1!A3:B5",
      rowCount: 3,
      columnCount: 2,
      values: [
        ["Name", "Age"],
        ["alice", 30],
        ["bob", 25],
      ],
    });
    await expect(
      updateRow({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          workbookId: "wb-1",
          worksheetName: "Sheet1",
          rowNumber: 3,
          values: { Name: "zoe" },
        },
        triggerEvent: excelTrigger(),
      }),
    ).rejects.toThrow(/heading row/i);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("explains what row 1 is for, and where the data starts", async () => {
    await expect(
      updateRow({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          workbookId: "wb-1",
          worksheetName: "Sheet1",
          rowNumber: 1,
          values: { Name: "zoe" },
        },
        triggerEvent: excelTrigger(),
      }),
    ).rejects.toThrow(/column headings.*from 2 onwards/is);
    // Rejected during config parsing, so not even the used-range READ was
    // attempted.
    expect(mockUsed).not.toHaveBeenCalled();
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it.each([0, -1, 2.5])("rejects %p through the same validation path", async (rowNumber) => {
    await expect(
      updateRow({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          workbookId: "wb-1",
          worksheetName: "Sheet1",
          rowNumber,
          values: { Name: "zoe" },
        },
        triggerEvent: excelTrigger(),
      }),
    ).rejects.toThrow();
    expect(mockPatch).not.toHaveBeenCalled();
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
      accountId: "acct-u",
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
      providerAccountId: "alice@contoso.com",
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
      accountId: "acct-u",
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
        providerAccountId: null,
      });
    }
  });
});
