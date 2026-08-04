/**
 * @jest-environment node
 *
 * Tests for the Excel `delete_row` action handler. Covers:
 *   - request shape (single Graph round-trip; address "{N}:{N}";
 *     shift: "Up")
 *   - output shape (workbookId / worksheetName / rowNumber / address /
 *     deleted: true)
 *   - refreshAndRetry accountId routing
 *   - Graph error propagation (NotFoundError surface — no silent no-op)
 *   - schema rejection of V1 bulk / search fields
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockDelete = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-excel/api/worksheetRangeDelete", () => ({
  worksheetRangeDelete: (...args: unknown[]) => mockDelete(...args),
}));

import { deleteRow } from "@/integrations/microsoft-excel/actions/deleteRow";
import { DeleteRowConfigSchema } from "@/integrations/microsoft-excel/actions/deleteRow.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockDelete.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockDelete.mockResolvedValue(undefined);
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

describe("delete_row handler — happy path", () => {
  it("issues Graph DELETE at address '{N}:{N}' with shift=Up", async () => {
    const result = await deleteRow({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rowNumber: 5,
      },
      triggerEvent: excelTrigger(),
    });

    expect(mockDelete).toHaveBeenCalledTimes(1);
    const arg = mockDelete.mock.calls[0]![0];
    expect(arg).toMatchObject({
      accessToken: "tok",
      workbookId: "wb-1",
      worksheetName: "Sheet1",
      address: "5:5",
      shift: "Up",
    });

    expect(result.output).toEqual({
      workbookId: "wb-1",
      worksheetName: "Sheet1",
      rowNumber: 5,
      address: "5:5",
      deleted: true,
    });
  });

  it("formats the address from rowNumber for any positive row number", async () => {
    await deleteRow({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { workbookId: "wb-1", worksheetName: "Sheet1", rowNumber: 1000 },
      triggerEvent: excelTrigger(),
    });
    expect(mockDelete.mock.calls[0]![0].address).toBe("1000:1000");
  });
});

describe("delete_row handler — error surface", () => {
  it("propagates worksheetRangeDelete errors (no silent no-op)", async () => {
    mockDelete.mockRejectedValueOnce(new Error("worksheet 'Bogus' not found"));
    await expect(
      deleteRow({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          workbookId: "wb-1",
          worksheetName: "Bogus",
          rowNumber: 5,
        },
        triggerEvent: excelTrigger(),
      }),
    ).rejects.toThrow(/not found/);
  });

  it("rejects unknown V1 field at parse time (.strict — deleteBy)", async () => {
    await expect(
      deleteRow({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          workbookId: "wb-1",
          worksheetName: "Sheet1",
          rowNumber: 5,
          deleteBy: "row_number",
        },
        triggerEvent: excelTrigger(),
      }),
    ).rejects.toThrow();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("rejects V1 startRow/endRow range mode at parse time", async () => {
    await expect(
      deleteRow({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          workbookId: "wb-1",
          worksheetName: "Sheet1",
          startRow: 5,
          endRow: 10,
        },
        triggerEvent: excelTrigger(),
      }),
    ).rejects.toThrow();
    expect(mockDelete).not.toHaveBeenCalled();
  });
});

describe("delete_row handler — refreshAndRetry routing", () => {
  it("routes to triggerEvent.providerAccountId when the trigger is microsoft-excel", async () => {
    await deleteRow({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { workbookId: "wb-1", worksheetName: "Sheet1", rowNumber: 5 },
      triggerEvent: excelTrigger(),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0]).toMatchObject({
      provider: "microsoft-excel",
      accountId: "acct-u",
      providerAccountId: "alice@contoso.com",
    });
  });

  it("routes with providerAccountId=null when triggerEvent is from a different provider", async () => {
    await deleteRow({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { workbookId: "wb-1", worksheetName: "Sheet1", rowNumber: 5 },
      triggerEvent: nonExcelTrigger(),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0]).toMatchObject({
      provider: "microsoft-excel",
      providerAccountId: null,
    });
  });
});

// ---------------------------------------------------------------------------
// Schema contract tests — merged from the former sibling deleteRow.schema.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1A; same production schema import, all
// assertions preserved verbatim).
// Tests for the Excel `delete_row` config schema. Pins the
// single-row-only contract from parity-microsoft-excel.md §7 +
// Marcus's audit acceptance ("No hidden bulk delete / No
// search-query delete / No silent no-op").
// ---------------------------------------------------------------------------

describe("DeleteRowConfigSchema", () => {
  it("accepts a valid config (workbookId + worksheetName + rowNumber)", () => {
    expect(
      DeleteRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rowNumber: 5,
      }).success,
    ).toBe(true);
  });

  // Required fields

  it("rejects when workbookId is missing", () => {
    expect(
      DeleteRowConfigSchema.safeParse({
        worksheetName: "Sheet1",
        rowNumber: 5,
      }).success,
    ).toBe(false);
  });

  it("rejects when workbookId is empty string", () => {
    expect(
      DeleteRowConfigSchema.safeParse({
        workbookId: "",
        worksheetName: "Sheet1",
        rowNumber: 5,
      }).success,
    ).toBe(false);
  });

  it("rejects when worksheetName is missing", () => {
    expect(
      DeleteRowConfigSchema.safeParse({
        workbookId: "wb-1",
        rowNumber: 5,
      }).success,
    ).toBe(false);
  });

  it("rejects when worksheetName is empty string", () => {
    expect(
      DeleteRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "",
        rowNumber: 5,
      }).success,
    ).toBe(false);
  });

  it("rejects when rowNumber is missing", () => {
    expect(
      DeleteRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
      }).success,
    ).toBe(false);
  });

  it("rejects rowNumber < 1 (must be 1-based)", () => {
    expect(
      DeleteRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rowNumber: 0,
      }).success,
    ).toBe(false);
  });

  it("rejects non-integer rowNumber", () => {
    expect(
      DeleteRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rowNumber: 5.5,
      }).success,
    ).toBe(false);
  });

  // V1 field rejection (.strict + bulk / search modes dropped)

  it("rejects V1 `deleteBy` discriminator", () => {
    expect(
      DeleteRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rowNumber: 5,
        deleteBy: "row_number",
      }).success,
    ).toBe(false);
  });

  it("rejects V1 `startRow` / `endRow` range-delete fields", () => {
    expect(
      DeleteRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        startRow: 5,
        endRow: 10,
      }).success,
    ).toBe(false);
  });

  it("rejects V1 `matchColumn` / `matchValue` / `deleteMultiple` search-then-delete fields", () => {
    for (const dropped of ["matchColumn", "matchValue", "deleteMultiple"]) {
      const r = DeleteRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rowNumber: 5,
        [dropped]: "x",
      });
      expect(r.success).toBe(false);
    }
  });

  it("rejects unknown fields generally (strict mode)", () => {
    expect(
      DeleteRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rowNumber: 5,
        xCustom: "v",
      }).success,
    ).toBe(false);
  });
});
