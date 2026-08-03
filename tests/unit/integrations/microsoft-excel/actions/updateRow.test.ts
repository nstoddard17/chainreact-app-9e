/**
 * @jest-environment node
 *
 * Tests for the Excel `update_row` action handler. Covers:
 *   - handler-internal header read (usedRange GET)
 *   - column-name → column-letter resolution
 *   - SPARSE payload: only the chosen columns carry a value, everything
 *     else is `null` (Microsoft's documented "leave this cell alone")
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

    // The ADDRESS still spans the whole row, so array indices line up with
    // header indices. The PAYLOAD is sparse: only Age carries a value, and
    // Name + City are `null` — Microsoft's documented "leave this cell
    // alone". `"bob"` and `"Portland"` are NOT re-sent, which is what makes
    // a concurrent edit to either of them survive
    // (EXCEL-UPDATE-ROW-CONCURRENCY-4).
    expect(mockPatch).toHaveBeenCalledTimes(1);
    const patchArg = mockPatch.mock.calls[0]![0];
    expect(patchArg.address).toBe("A3:C3");
    expect(patchArg.values).toEqual([[null, 26, null]]);

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

  it("updates several non-contiguous columns in ONE PATCH, omitting the rest", async () => {
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
    // Two chosen columns written; the two between them left out entirely.
    // Non-contiguous selections need no extra request — the sparse array
    // addresses them in one PATCH.
    expect(patchArg.values).toEqual([["ALICE", null, null, "inactive"]]);
    expect(result.output.columnsUpdated).toBe(2);
    expect(result.output.updatedColumns).toEqual(["Name", "Status"]);
  });

  // This test has now been renamed twice, and the second time was the
  // substantive one. S3 corrected the name from "preserves the existing
  // value when overlay is null" to "CLEARING that cell", believing null was
  // written through as a clear. The S4 audit checked that against
  // Microsoft's documentation and found it backwards: "No update takes
  // place to the intended target (cell) when null input is sent". So an
  // explicit null has never cleared anything — it is a skip, and now the
  // name says so. The saved key is still preserved and still transmitted;
  // only the claim about its effect was wrong.
  it("passes an explicit null straight through, which Excel treats as SKIP, not clear", async () => {
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
    // Both positions are null: Name because it was never selected, Notes
    // because that is literally what the saved config asked for. Neither
    // cell is written.
    expect(patchArg.values).toEqual([[null, null]]);
    // The key is still reported as configured — the user did name it.
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
    const row = patchArg.values[0] as unknown[];
    expect(row[26]).toBe(999);
    // Every other position is omitted, including the first — the old code
    // re-sent `1` here, which is exactly the value a colleague could have
    // just changed.
    expect(row[0]).toBeNull();
    expect(row.filter((c) => c !== null)).toEqual([999]);
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
    // Only the chosen column is written; the row's other value (40) is not
    // echoed back, so it survives a concurrent edit.
    expect(mockPatch.mock.calls[0]![0].values).toEqual([["zoe", null]]);
  });

  it("indexes from the used range's REAL first row, not from row 1", async () => {
    // Graph returns an absolute address and the used range need not start
    // at the top. The row offset still has to come from that address: it is
    // what the heading-row and row-existence guards are computed against.
    await expect(
      run(4, "Sheet1!A3:B5", [
        ["Name", "Age"],
        ["alice", 30],
        ["bob", 25],
      ]),
    ).resolves.toBeDefined();
    // Row 4 is the SECOND row of a used range starting at row 3 — the row
    // the guards had to resolve correctly to allow this write at all. The
    // payload itself no longer depends on which row was read.
    expect(mockPatch.mock.calls[0]![0].values).toEqual([["zoe", null]]);
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

/**
 * EXCEL-UPDATE-ROW-CONCURRENCY-4 — the sparse-write contract.
 *
 * These are the assertions the whole slice exists for. The old handler
 * seeded the payload with the values it had just read, so the row it wrote
 * was a faithful copy of a snapshot that could already be stale — which is
 * how a colleague's edit got silently reverted. The fix is not to send
 * those cells at all: Microsoft documents `null` inside a values array as
 * "No update takes place to the intended target (cell)".
 *
 * The mocks stay at the Graph wrapper boundary, so what is asserted here is
 * the exact request ChainReact would put on the wire.
 */
describe("update_row handler — sparse payload", () => {
  function sheet(values: unknown[][], address = "Sheet1!A1:D3") {
    mockUsed.mockResolvedValueOnce({
      address,
      rowCount: values.length,
      columnCount: values[0]?.length ?? 0,
      values,
    });
  }

  function run(configValues: Record<string, unknown>, rowNumber = 2) {
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
        values: configValues,
      },
      triggerEvent: excelTrigger(),
    });
  }

  const POPULATED: unknown[][] = [
    ["Name", "Age", "City", "Status"],
    ["alice", 30, "Seattle", "active"],
    ["bob", 25, "Portland", "active"],
  ];

  it("NEVER copies a read value into a column the user did not choose", async () => {
    // The headline assertion. Every value present in the GET response must
    // be absent from the PATCH body unless the user asked for it.
    sheet(POPULATED);
    await run({ Status: "paid" });

    const row = mockPatch.mock.calls[0]![0].values[0] as unknown[];
    for (const readValue of ["alice", 30, "Seattle", "active"]) {
      expect(row).not.toContain(readValue);
    }
    expect(row).toEqual([null, null, null, "paid"]);
  });

  it("keeps the three states distinct in the payload", async () => {
    sheet(POPULATED);
    await run({ Name: "ALICE", City: "" });

    // chosen value → the value; chosen blank → ""; not chosen → null.
    // `""` and `null` are NOT interchangeable here: Microsoft documents the
    // first as "the range value is cleared out" and the second as no update
    // at all, which is exactly the distinction the guided editor saves.
    expect(mockPatch.mock.calls[0]![0].values).toEqual([
      ["ALICE", null, "", null],
    ]);
  });

  it("writes a resolved variable value verbatim", async () => {
    // Variables are resolved by the engine before the handler parses config,
    // so by here they are ordinary values and must not be re-interpreted.
    sheet(POPULATED);
    await run({ Name: "Northwind Traders (EMEA) Limited" });
    expect(mockPatch.mock.calls[0]![0].values).toEqual([
      ["Northwind Traders (EMEA) Limited", null, null, null],
    ]);
  });

  it("preserves numbers and booleans as their own types", async () => {
    sheet([
      ["Name", "Qty", "Active"],
      ["alice", 1, false],
    ]);
    await run({ Qty: 42, Active: true });
    expect(mockPatch.mock.calls[0]![0].values).toEqual([[null, 42, true]]);
  });

  it("leaves an untouched FORMULA cell alone instead of flattening it", async () => {
    // A real second data-loss bug the sparse write fixes. `valuesOnly: true`
    // returns CALCULATED values, so the old merge read `=B2*C2` back as
    // `1250` and rewrote it as that literal — destroying a formula in a
    // column the user never selected. The cell is now simply not in the
    // request, so it cannot be replaced by its own result.
    sheet([
      ["Name", "Rate", "Hours", "Total"],
      ["alice", 25, 50, 1250], // `Total` is a formula; Graph returns 1250.
    ]);
    await run({ Name: "ALICE" });

    const row = mockPatch.mock.calls[0]![0].values[0] as unknown[];
    expect(row[3]).toBeNull();
    expect(row).not.toContain(1250);
  });

  it("still writes exactly one PATCH — no per-cell requests, no batch", async () => {
    // The audit rejected per-cell and batched writes: Graph batches are not
    // atomic, and Microsoft states that on a failure "there is no way to
    // confirm the status of other pending requests". One write is what makes
    // partial success impossible.
    sheet(POPULATED);
    await run({ Name: "a", Age: 1, City: "c", Status: "d" });
    expect(mockPatch).toHaveBeenCalledTimes(1);
    expect(mockUsed).toHaveBeenCalledTimes(1);
  });

  it("sends a payload as wide as the header row, whatever is selected", async () => {
    // The array indices ARE the column indices, which is what lets a
    // non-contiguous selection travel in a single request.
    sheet(POPULATED);
    await run({ Status: "paid" });
    expect((mockPatch.mock.calls[0]![0].values[0] as unknown[]).length).toBe(4);
  });

  it("selecting every column produces no nulls at all", async () => {
    sheet(POPULATED);
    await run({ Name: "a", Age: 2, City: "c", Status: "d" });
    expect(mockPatch.mock.calls[0]![0].values).toEqual([["a", 2, "c", "d"]]);
  });

  it("is unaffected by which row was read", async () => {
    // Proves the payload no longer depends on the snapshot. Two different
    // target rows with different contents produce the same request body.
    sheet(POPULATED);
    await run({ Status: "paid" }, 2);
    const first = mockPatch.mock.calls[0]![0].values;

    mockPatch.mockClear();
    sheet(POPULATED);
    await run({ Status: "paid" }, 3);
    expect(mockPatch.mock.calls[0]![0].values).toEqual(first);
  });
});
