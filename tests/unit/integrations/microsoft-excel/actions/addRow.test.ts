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
    providerAccountId: "alice@contoso.com",
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
      accountId: "acct-u",
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
      accountId: "acct-u",
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
      accountId: "acct-u",
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
      accountId: "acct-u",
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

  // --- empty-string detection + append anchoring (SMOKE-WRITE-39 bugfix) ---
  // Graph's usedRange on a GENUINELY empty worksheet returns the lone cell as
  // the empty STRING "", not null. The old guard saw "" as non-empty and
  // appended at A2; these pin the corrected behavior.
  it("writes to A1 when an empty worksheet's usedRange returns a single empty-STRING cell", async () => {
    mockUsed.mockResolvedValueOnce({
      address: "Sheet1!A1",
      rowCount: 1,
      columnCount: 1,
      values: [[""]],
    });

    const result = await addRow({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        values: ["crsmoke-row", "x"],
      },
      triggerEvent: trigger(),
    });

    expect(result.output.rowIndex).toBe(1);
    expect(result.output.address).toBe("A1:B1");
    expect(mockPatch.mock.calls[0]![0].address).toBe("A1:B1");
    expect(mockPatch.mock.calls[0]![0].values).toEqual([["crsmoke-row", "x"]]);
  });

  it("treats a blank-only multi-cell usedRange ([[\"\", \"\"]]) as empty → A1", async () => {
    mockUsed.mockResolvedValueOnce({
      address: "Sheet1!A1:B1",
      rowCount: 1,
      columnCount: 2,
      values: [["", ""]],
    });

    const result = await addRow({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        values: ["a", "b"],
      },
      triggerEvent: trigger(),
    });

    expect(result.output.rowIndex).toBe(1);
    expect(result.output.address).toBe("A1:B1");
  });

  it("second append lands on row 2 (does NOT overwrite row 1) — anchors on the absolute last used row", async () => {
    // After the first append, the only content is at A1 → Graph's usedRange is
    // the single cell "Sheet1!A1" with rowCount 1. The old code did rowCount+1
    // = 2 (correct here) but the bug surfaced when content started BELOW row 1
    // (see next test). This guards the common A1 case advances to A2.
    mockUsed.mockResolvedValueOnce({
      address: "Sheet1!A1",
      rowCount: 1,
      columnCount: 1,
      values: [["crsmoke-first"]],
    });

    const result = await addRow({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        values: ["crsmoke-second"],
      },
      triggerEvent: trigger(),
    });

    expect(result.output.rowIndex).toBe(2);
    expect(result.output.address).toBe("A2:A2");
    expect(mockPatch.mock.calls[0]![0].values).toEqual([["crsmoke-second"]]);
  });

  it("anchors on the ABSOLUTE last row from the address, not rowCount, when the range starts below row 1", async () => {
    // Content only at A3 → Graph address "Sheet1!A3", rowCount 1. The OLD code
    // (rowCount+1 = 2) would have collided into row 2; the fix parses the
    // address end-row (3) and appends at row 4.
    mockUsed.mockResolvedValueOnce({
      address: "Sheet1!A3",
      rowCount: 1,
      columnCount: 1,
      values: [["lonely"]],
    });

    const result = await addRow({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        values: ["next"],
      },
      triggerEvent: trigger(),
    });

    expect(result.output.rowIndex).toBe(4);
    expect(result.output.address).toBe("A4:A4");
  });

  it("does NOT treat 0 or false as blank — a sheet whose only cell is 0 is non-empty (append advances)", async () => {
    mockUsed.mockResolvedValueOnce({
      address: "Sheet1!A1:B1",
      rowCount: 1,
      columnCount: 2,
      values: [[0, false]],
    });

    const result = await addRow({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        values: ["x", "y"],
      },
      triggerEvent: trigger(),
    });

    // Non-empty → appends past row 1 (absolute last row 1 → row 2), never A1.
    expect(result.output.rowIndex).toBe(2);
    expect(result.output.address).toBe("A2:B2");
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
      accountId: "acct-u",
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

describe("add_row batch mode — handler behavior (Microsoft Excel parity Commit 3)", () => {
  it("appends multiple rows in one Graph PATCH at the tail of the used range", async () => {
    mockUsed.mockResolvedValueOnce({
      address: "Sheet1!A1:C5",
      rowCount: 5,
      columnCount: 3,
      values: [
        ["Name", "Age", "City"],
        ["alice", 30, "Seattle"],
        ["bob", 25, "Portland"],
        ["carol", 40, "Denver"],
        ["dave", 22, "Boise"],
      ],
    });

    const result = await addRow({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rows: [
          { Name: "eve", Age: 28, City: "Austin" },
          { Name: "frank", Age: 35, City: "Boston" },
        ],
      },
      triggerEvent: trigger(),
    });

    expect(mockPatch).toHaveBeenCalledTimes(1);
    const arg = mockPatch.mock.calls[0]![0];
    expect(arg.address).toBe("A6:C7");
    expect(arg.values).toEqual([
      ["eve", 28, "Austin"],
      ["frank", 35, "Boston"],
    ]);

    expect(result.output).toEqual({
      workbookId: "wb-1",
      worksheetName: "Sheet1",
      address: "A6:C7",
      rowCount: 2,
      rowsAdded: 2,
      firstRowNumber: 6,
      lastRowNumber: 7,
      columnCount: 3,
    });
  });

  it("pads missing columns with null and preserves header column order", async () => {
    mockUsed.mockResolvedValueOnce({
      address: "Sheet1!A1:D2",
      rowCount: 2,
      columnCount: 4,
      values: [
        ["Name", "Age", "City", "Status"],
        ["alice", 30, "Seattle", "active"],
      ],
    });

    await addRow({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rows: [
          { Name: "eve", Status: "pending" },
          { Age: 50, City: "Boise" },
        ],
      },
      triggerEvent: trigger(),
    });

    const arg = mockPatch.mock.calls[0]![0];
    expect(arg.values).toEqual([
      ["eve", null, null, "pending"],
      [null, 50, "Boise", null],
    ]);
    expect(arg.address).toBe("A3:D4");
  });

  it("issues exactly ONE Graph PATCH for the whole batch (no silent chunking)", async () => {
    mockUsed.mockResolvedValueOnce({
      address: "Sheet1!A1:B2",
      rowCount: 2,
      columnCount: 2,
      values: [
        ["Name", "Age"],
        ["alice", 30],
      ],
    });
    const rows = Array.from({ length: 500 }, (_, i) => ({
      Name: `row${i}`,
      Age: i,
    }));

    await addRow({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rows,
      },
      triggerEvent: trigger(),
    });

    expect(mockPatch).toHaveBeenCalledTimes(1);
    const arg = mockPatch.mock.calls[0]![0];
    expect(arg.address).toBe("A3:B502");
    expect((arg.values as unknown[][]).length).toBe(500);
  });

  it("rejects >1000 rows BEFORE any Graph round-trip (no silent chunking, no Graph call)", async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => ({ Name: `r${i}` }));

    await expect(
      addRow({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          workbookId: "wb-1",
          worksheetName: "Sheet1",
          rows,
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();

    expect(mockUsed).not.toHaveBeenCalled();
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("fails loudly when a row contains an unknown column (no silent skip)", async () => {
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
      addRow({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          workbookId: "wb-1",
          worksheetName: "Sheet1",
          rows: [{ Name: "eve", Email: "eve@x.com" }],
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/row 1.*'Email'/);

    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("reports unknown columns from ALL rows in a single error (not just the first)", async () => {
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
      addRow({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          workbookId: "wb-1",
          worksheetName: "Sheet1",
          rows: [
            { Name: "eve", Email: "eve@x.com" },
            { Name: "frank", Phone: "555" },
          ],
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/row 1.*'Email'.*row 2.*'Phone'/);
  });

  it("rejects batch mode against an empty worksheet (no headers to validate against)", async () => {
    mockUsed.mockResolvedValueOnce({
      address: "Sheet1!A1",
      rowCount: 1,
      columnCount: 1,
      values: [],
    });

    await expect(
      addRow({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          workbookId: "wb-1",
          worksheetName: "Sheet1",
          rows: [{ Name: "eve" }],
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/requires worksheet headers/);

    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("rejects batch mode when row 1 has no non-empty string headers", async () => {
    mockUsed.mockResolvedValueOnce({
      address: "Sheet1!A1:C2",
      rowCount: 2,
      columnCount: 3,
      values: [
        [null, null, null],
        ["alice", 30, "Seattle"],
      ],
    });

    await expect(
      addRow({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          workbookId: "wb-1",
          worksheetName: "Sheet1",
          rows: [{ Name: "eve" }],
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/non-empty headers/);
  });

  it("rejects both values and rows in one call at parse time (XOR)", async () => {
    await expect(
      addRow({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          workbookId: "wb-1",
          worksheetName: "Sheet1",
          values: ["alice"],
          rows: [{ Name: "alice" }],
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();

    expect(mockUsed).not.toHaveBeenCalled();
    expect(mockPatch).not.toHaveBeenCalled();
  });
});
