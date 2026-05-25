/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockSpreadsheetsGet = jest.fn();
const mockSpreadsheetsBatchUpdate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/google-sheets/api/spreadsheetsGet", () => ({
  spreadsheetsGet: (...args: unknown[]) => mockSpreadsheetsGet(...args),
}));

jest.mock("@/integrations/google-sheets/api/spreadsheetsBatchUpdate", () => ({
  spreadsheetsBatchUpdate: (...args: unknown[]) => mockSpreadsheetsBatchUpdate(...args),
}));

import { deleteRow } from "@/integrations/google-sheets/actions/deleteRow";
import { NotFoundError } from "@/integrations/google-sheets/api/errors";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockSpreadsheetsGet.mockReset();
  mockSpreadsheetsBatchUpdate.mockReset();
});

function sheetsTrigger(): TriggerEvent {
  return {
    provider: "google-sheets",
    eventType: "row_changed",
    eventId: "evt-1",
    occurredAt: "2026-05-08T12:00:00Z",
    accountId: "alice@example.test",
    payload: {},
  };
}

function nonSheetsTrigger(): TriggerEvent {
  return {
    provider: "slack",
    eventType: "message_received",
    eventId: "evt-2",
    occurredAt: "2026-05-08T12:00:00Z",
    accountId: "T123",
    payload: {},
  };
}

const wireRefresh = (
  metadata: Record<string, unknown>,
  batchResponse: Record<string, unknown> = {},
) => {
  mockSpreadsheetsGet.mockResolvedValue(metadata);
  mockSpreadsheetsBatchUpdate.mockResolvedValue(batchResponse);
  mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
};

describe("deleteRow action", () => {
  it("resolves sheetId from spreadsheets.get and emits the correct deleteDimension request", async () => {
    wireRefresh({
      sheets: [
        { properties: { sheetId: 0, title: "Sheet1" } },
        { properties: { sheetId: 1234567, title: "Other" } },
      ],
    });

    const result = await deleteRow({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss-1",
        sheetName: "Other",
        rowNumber: 5,
      },
      triggerEvent: sheetsTrigger(),
    });

    expect(mockSpreadsheetsGet).toHaveBeenCalledWith({
      accessToken: "t",
      spreadsheetId: "ss-1",
      fields: "sheets(properties(sheetId,title))",
    });
    expect(mockSpreadsheetsBatchUpdate).toHaveBeenCalledWith({
      accessToken: "t",
      spreadsheetId: "ss-1",
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: 1234567,
              dimension: "ROWS",
              startIndex: 4,
              endIndex: 5,
            },
          },
        },
      ],
    });
    expect(result.output).toEqual({
      spreadsheetId: "ss-1",
      sheetName: "Other",
      sheetId: 1234567,
      rowNumber: 5,
      deleted: true,
    });
  });

  it("computes startIndex/endIndex correctly for rowNumber=1", async () => {
    wireRefresh({
      sheets: [{ properties: { sheetId: 0, title: "Sheet1" } }],
    });

    await deleteRow({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { spreadsheetId: "ss", sheetName: "Sheet1", rowNumber: 1 },
      triggerEvent: sheetsTrigger(),
    });

    expect(mockSpreadsheetsBatchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        requests: [
          {
            deleteDimension: {
              range: { sheetId: 0, dimension: "ROWS", startIndex: 0, endIndex: 1 },
            },
          },
        ],
      }),
    );
  });

  it("throws NotFoundError when sheetName is not in the spreadsheet (no batchUpdate call)", async () => {
    wireRefresh({
      sheets: [{ properties: { sheetId: 0, title: "Sheet1" } }],
    });

    await expect(
      deleteRow({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { spreadsheetId: "ss", sheetName: "Missing", rowNumber: 5 },
        triggerEvent: sheetsTrigger(),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(mockSpreadsheetsBatchUpdate).not.toHaveBeenCalled();
  });

  it("treats sheetId=0 as a valid id (numeric falsy guard)", async () => {
    wireRefresh({ sheets: [{ properties: { sheetId: 0, title: "Sheet1" } }] });

    const result = await deleteRow({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { spreadsheetId: "ss", sheetName: "Sheet1", rowNumber: 2 },
      triggerEvent: sheetsTrigger(),
    });

    expect(mockSpreadsheetsBatchUpdate).toHaveBeenCalled();
    expect(result.output.sheetId).toBe(0);
  });

  it("throws NotFoundError when the metadata response has no sheets array", async () => {
    wireRefresh({});

    await expect(
      deleteRow({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { spreadsheetId: "ss", sheetName: "Sheet1", rowNumber: 1 },
        triggerEvent: sheetsTrigger(),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("propagates wrapper errors from spreadsheets.get", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockSpreadsheetsGet.mockRejectedValue(new Error("metadata-boom"));

    await expect(
      deleteRow({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { spreadsheetId: "ss", sheetName: "S", rowNumber: 1 },
        triggerEvent: sheetsTrigger(),
      }),
    ).rejects.toThrow(/metadata-boom/);
  });

  it("propagates wrapper errors from batchUpdate", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockSpreadsheetsGet.mockResolvedValue({
      sheets: [{ properties: { sheetId: 0, title: "S" } }],
    });
    mockSpreadsheetsBatchUpdate.mockRejectedValue(new Error("batch-boom"));

    await expect(
      deleteRow({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { spreadsheetId: "ss", sheetName: "S", rowNumber: 1 },
        triggerEvent: sheetsTrigger(),
      }),
    ).rejects.toThrow(/batch-boom/);
  });

  it("passes accountId through when trigger is from google-sheets (both calls)", async () => {
    wireRefresh({ sheets: [{ properties: { sheetId: 0, title: "S" } }] });

    await deleteRow({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { spreadsheetId: "ss", sheetName: "S", rowNumber: 1 },
      triggerEvent: sheetsTrigger(),
    });

    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(2);
    for (const call of mockRefreshAndRetry.mock.calls) {
      expect(call[0]).toEqual(
        expect.objectContaining({
          provider: "google-sheets",
          accountId: "alice@example.test",
        }),
      );
    }
  });

  it("passes accountId=null when trigger is NOT from google-sheets", async () => {
    wireRefresh({ sheets: [{ properties: { sheetId: 0, title: "S" } }] });

    await deleteRow({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { spreadsheetId: "ss", sheetName: "S", rowNumber: 1 },
      triggerEvent: nonSheetsTrigger(),
    });

    for (const call of mockRefreshAndRetry.mock.calls) {
      expect(call[0]).toEqual(expect.objectContaining({ accountId: null }));
    }
  });

  describe("schema validation", () => {
    it("rejects rowNumber=0 (must be ≥ 1)", async () => {
      await expect(
        deleteRow({
          workflowId: "wf",
          userId: "u",
          runId: "r",
          nodeId: "n",
          config: { spreadsheetId: "ss", sheetName: "S", rowNumber: 0 },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow(/1 or greater/);
    });

    it("rejects negative rowNumber", async () => {
      await expect(
        deleteRow({
          workflowId: "wf",
          userId: "u",
          runId: "r",
          nodeId: "n",
          config: { spreadsheetId: "ss", sheetName: "S", rowNumber: -3 },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow(/1 or greater/);
    });

    it("rejects float rowNumber", async () => {
      await expect(
        deleteRow({
          workflowId: "wf",
          userId: "u",
          runId: "r",
          nodeId: "n",
          config: { spreadsheetId: "ss", sheetName: "S", rowNumber: 2.5 },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow(/integer/);
    });

    it("rejects empty spreadsheetId / sheetName", async () => {
      await expect(
        deleteRow({
          workflowId: "wf",
          userId: "u",
          runId: "r",
          nodeId: "n",
          config: { spreadsheetId: "", sheetName: "S", rowNumber: 1 },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow(/spreadsheetId is required/);

      await expect(
        deleteRow({
          workflowId: "wf",
          userId: "u",
          runId: "r",
          nodeId: "n",
          config: { spreadsheetId: "ss", sheetName: "", rowNumber: 1 },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow(/sheetName is required/);
    });

    it("rejects strict-mode config (V1 kitchen-sink fields like deleteBy / startRow / matchColumn)", async () => {
      const baseConfig = {
        spreadsheetId: "ss",
        sheetName: "S",
        rowNumber: 1,
      };

      for (const extra of [
        { deleteBy: "row_number" },
        { startRow: 2 },
        { endRow: 5 },
        { matchColumn: "Email" },
        { matchValue: "x@e.test" },
        { rowSelection: "last" },
        { deleteAll: true },
      ]) {
        await expect(
          deleteRow({
            workflowId: "wf",
            userId: "u",
            runId: "r",
            nodeId: "n",
            config: { ...baseConfig, ...extra },
            triggerEvent: sheetsTrigger(),
          }),
        ).rejects.toThrow();
      }
    });
  });
});
