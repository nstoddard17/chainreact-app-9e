/**
 * @jest-environment node
 *
 * Tests for the Excel `rename_worksheet` action handler. Covers:
 *   - calls worksheetPatch with the right shape (workbookId + current
 *     name in URL, new name in body)
 *   - output mapping (oldWorksheetName / newWorksheetName /
 *     worksheetId / position / renamed: true)
 *   - position may be null when Graph omits it
 *   - error propagation (wrapper errors surface verbatim)
 *   - schema-rejection at parse for unknown fields
 *   - refreshAndRetry accountId routing (Excel trigger → accountId;
 *     non-Excel → null)
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockPatch = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-excel/api/worksheetPatch", () => ({
  worksheetPatch: (...args: unknown[]) => mockPatch(...args),
}));

import { renameWorksheet } from "@/integrations/microsoft-excel/actions/renameWorksheet";
import { RenameWorksheetConfigSchema } from "@/integrations/microsoft-excel/actions/renameWorksheet.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockPatch.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
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

describe("rename_worksheet handler — happy path", () => {
  it("PATCHes the worksheet with the new name and returns mapped output", async () => {
    mockPatch.mockResolvedValueOnce({
      id: "ws-1",
      name: "Q3 Report",
      position: 1,
      visibility: "Visible",
    });

    const result = await renameWorksheet({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        workbookId: "wb-1",
        worksheetName: "Q2 Report",
        newWorksheetName: "Q3 Report",
      },
      triggerEvent: excelTrigger(),
    });

    expect(mockPatch).toHaveBeenCalledTimes(1);
    const arg = mockPatch.mock.calls[0]![0];
    expect(arg).toMatchObject({
      accessToken: "tok",
      workbookId: "wb-1",
      worksheetName: "Q2 Report",
      name: "Q3 Report",
    });

    expect(result.output).toEqual({
      workbookId: "wb-1",
      oldWorksheetName: "Q2 Report",
      newWorksheetName: "Q3 Report",
      worksheetId: "ws-1",
      position: 1,
      renamed: true,
    });
  });

  it("output.newWorksheetName reflects Graph's response value (Graph may normalize)", async () => {
    mockPatch.mockResolvedValueOnce({
      id: "ws-1",
      // Graph echoes the new name back; the handler uses whatever
      // Graph returns rather than the config value.
      name: "Graph Normalized",
    });

    const result = await renameWorksheet({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        newWorksheetName: "Whatever",
      },
      triggerEvent: excelTrigger(),
    });

    expect(result.output.newWorksheetName).toBe("Graph Normalized");
  });

  it("position is null when Graph omits it", async () => {
    mockPatch.mockResolvedValueOnce({ id: "ws-1", name: "Renamed" });

    const result = await renameWorksheet({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        newWorksheetName: "Renamed",
      },
      triggerEvent: excelTrigger(),
    });

    expect(result.output.position).toBeNull();
  });
});

describe("rename_worksheet handler — error surface", () => {
  it("propagates worksheetPatch errors (no silent no-op)", async () => {
    mockPatch.mockRejectedValueOnce(
      new Error("worksheet 'Bogus' not found"),
    );
    await expect(
      renameWorksheet({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          workbookId: "wb-1",
          worksheetName: "Bogus",
          newWorksheetName: "X",
        },
        triggerEvent: excelTrigger(),
      }),
    ).rejects.toThrow(/not found/);
  });

  it("rejects unknown V1-style field at parse time (.strict — oldName)", async () => {
    await expect(
      renameWorksheet({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          workbookId: "wb-1",
          oldName: "Sheet1",
          newWorksheetName: "X",
        },
        triggerEvent: excelTrigger(),
      }),
    ).rejects.toThrow();
    expect(mockPatch).not.toHaveBeenCalled();
  });
});

describe("rename_worksheet handler — refreshAndRetry routing", () => {
  beforeEach(() => {
    mockPatch.mockResolvedValueOnce({ id: "ws-1", name: "X" });
  });

  it("routes to triggerEvent.accountId when the trigger is microsoft-excel", async () => {
    await renameWorksheet({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        newWorksheetName: "X",
      },
      triggerEvent: excelTrigger(),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0]).toMatchObject({
      provider: "microsoft-excel",
      providerAccountId: "alice@contoso.com",
    });
  });

  it("routes with accountId=null when triggerEvent is from a different provider", async () => {
    await renameWorksheet({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        newWorksheetName: "X",
      },
      triggerEvent: nonExcelTrigger(),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0]).toMatchObject({
      provider: "microsoft-excel",
      providerAccountId: null,
    });
  });
});

// ---------------------------------------------------------------------------
// Schema contract tests — merged from the former sibling renameWorksheet.schema.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1A; same production schema import, all
// assertions preserved verbatim).
// Tests for the Excel `rename_worksheet` config schema. Pins the
// required-field contract from parity-microsoft-excel.md §7 and
// Marcus's audit acceptance.
// ---------------------------------------------------------------------------

describe("RenameWorksheetConfigSchema", () => {
  it("accepts a minimal valid config", () => {
    expect(
      RenameWorksheetConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        newWorksheetName: "Renamed",
      }).success,
    ).toBe(true);
  });

  it("rejects when workbookId is missing", () => {
    expect(
      RenameWorksheetConfigSchema.safeParse({
        worksheetName: "Sheet1",
        newWorksheetName: "Renamed",
      }).success,
    ).toBe(false);
  });

  it("rejects when workbookId is empty string", () => {
    expect(
      RenameWorksheetConfigSchema.safeParse({
        workbookId: "",
        worksheetName: "Sheet1",
        newWorksheetName: "Renamed",
      }).success,
    ).toBe(false);
  });

  it("rejects when worksheetName is missing (no silent fallback to first worksheet)", () => {
    expect(
      RenameWorksheetConfigSchema.safeParse({
        workbookId: "wb-1",
        newWorksheetName: "Renamed",
      }).success,
    ).toBe(false);
  });

  it("rejects when worksheetName is empty string", () => {
    expect(
      RenameWorksheetConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "",
        newWorksheetName: "Renamed",
      }).success,
    ).toBe(false);
  });

  it("rejects when newWorksheetName is missing", () => {
    expect(
      RenameWorksheetConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
      }).success,
    ).toBe(false);
  });

  it("rejects when newWorksheetName is empty string", () => {
    expect(
      RenameWorksheetConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        newWorksheetName: "",
      }).success,
    ).toBe(false);
  });

  it("rejects when newWorksheetName exceeds 31 characters (Excel limit)", () => {
    expect(
      RenameWorksheetConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        newWorksheetName: "x".repeat(32),
      }).success,
    ).toBe(false);
  });

  it("accepts newWorksheetName at exactly 31 characters", () => {
    expect(
      RenameWorksheetConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        newWorksheetName: "x".repeat(31),
      }).success,
    ).toBe(true);
  });

  it("rejects unknown fields generally (strict mode)", () => {
    expect(
      RenameWorksheetConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        newWorksheetName: "Renamed",
        xCustom: "v",
      }).success,
    ).toBe(false);
  });

  it("rejects V1 `oldName` (V2 uses `worksheetName` as the address)", () => {
    expect(
      RenameWorksheetConfigSchema.safeParse({
        workbookId: "wb-1",
        oldName: "Sheet1",
        newWorksheetName: "Renamed",
      }).success,
    ).toBe(false);
  });

  it("rejects worksheetId variant (V2 convention is worksheetName)", () => {
    expect(
      RenameWorksheetConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetId: "ws-1",
        newWorksheetName: "Renamed",
      }).success,
    ).toBe(false);
  });
});
