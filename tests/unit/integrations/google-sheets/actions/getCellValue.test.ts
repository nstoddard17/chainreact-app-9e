/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockValuesGet = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/google-sheets/api/valuesGet", () => ({
  valuesGet: (...args: unknown[]) => mockValuesGet(...args),
}));

import { getCellValue } from "@/integrations/google-sheets/actions/getCellValue";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockValuesGet.mockReset();
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

describe("getCellValue action", () => {
  it("builds <sheetName>!<cell> range and forwards spreadsheetId", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockValuesGet.mockResolvedValue({
      range: "Sheet1!B5",
      majorDimension: "ROWS",
      values: [["hello"]],
    });

    const result = await getCellValue({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
        cell: "B5",
      },
      triggerEvent: sheetsTrigger(),
    });

    expect(mockValuesGet).toHaveBeenCalledWith({
      accessToken: "t",
      spreadsheetId: "ss-1",
      range: "Sheet1!B5",
    });
    expect(result.output).toEqual({
      spreadsheetId: "ss-1",
      sheetName: "Sheet1",
      cell: "B5",
      value: "hello",
    });
  });

  it("maps an empty cell to value: null (Sheets returns no values key)", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockValuesGet.mockResolvedValue({
      range: "Sheet1!A1",
      majorDimension: "ROWS",
      // No `values` key when cell is blank.
    });

    const result = await getCellValue({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        sheetName: "Sheet1",
        cell: "A1",
      },
      triggerEvent: sheetsTrigger(),
    });

    expect(result.output.value).toBeNull();
    expect(result.output.cell).toBe("A1");
  });

  it("maps an empty cell to value: null when values is an empty array", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockValuesGet.mockResolvedValue({
      range: "Sheet1!A1",
      majorDimension: "ROWS",
      values: [],
    });

    const result = await getCellValue({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { spreadsheetId: "ss", sheetName: "Sheet1", cell: "A1" },
      triggerEvent: sheetsTrigger(),
    });

    expect(result.output.value).toBeNull();
  });

  it("preserves numeric cell values (FORMATTED string mode passthrough)", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockValuesGet.mockResolvedValue({ values: [[42]] });

    const result = await getCellValue({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { spreadsheetId: "ss", sheetName: "Sheet1", cell: "C3" },
      triggerEvent: sheetsTrigger(),
    });

    expect(result.output.value).toBe(42);
  });

  it("propagates wrapper errors", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockValuesGet.mockRejectedValue(new Error("boom"));

    await expect(
      getCellValue({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { spreadsheetId: "ss", sheetName: "Sheet1", cell: "A1" },
        triggerEvent: sheetsTrigger(),
      }),
    ).rejects.toThrow(/boom/);
  });

  it("passes accountId through when trigger is from google-sheets", async () => {
    mockRefreshAndRetry.mockResolvedValue({ values: [["x"]] });

    await getCellValue({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { spreadsheetId: "ss", sheetName: "S1", cell: "A1" },
      triggerEvent: sheetsTrigger(),
    });

    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "google-sheets",
        accountId: "alice@example.test",
      }),
    );
  });

  it("passes accountId=null when trigger is NOT from google-sheets", async () => {
    mockRefreshAndRetry.mockResolvedValue({ values: [["x"]] });

    await getCellValue({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { spreadsheetId: "ss", sheetName: "S1", cell: "A1" },
      triggerEvent: nonSheetsTrigger(),
    });

    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: null }),
    );
  });

  describe("schema validation", () => {
    it("accepts valid A1 single-cell references (A1, B5, AA10, ZZ100)", async () => {
      mockRefreshAndRetry.mockResolvedValue({ values: [["x"]] });

      for (const cell of ["A1", "B5", "AA10", "ZZ100"]) {
        await expect(
          getCellValue({
            workflowId: "wf",
            userId: "u",
            runId: "r",
            nodeId: "n",
            config: { spreadsheetId: "ss", sheetName: "S", cell },
            triggerEvent: sheetsTrigger(),
          }),
        ).resolves.toBeDefined();
      }
    });

    it("rejects multi-cell range syntax (A1:B5)", async () => {
      await expect(
        getCellValue({
          workflowId: "wf",
          userId: "u",
          runId: "r",
          nodeId: "n",
          config: { spreadsheetId: "ss", sheetName: "S", cell: "A1:B5" },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow(/A1-style single-cell/);
    });

    it("rejects full-column reference (A:A)", async () => {
      await expect(
        getCellValue({
          workflowId: "wf",
          userId: "u",
          runId: "r",
          nodeId: "n",
          config: { spreadsheetId: "ss", sheetName: "S", cell: "A:A" },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow(/A1-style single-cell/);
    });

    it("rejects cell with no row number (A)", async () => {
      await expect(
        getCellValue({
          workflowId: "wf",
          userId: "u",
          runId: "r",
          nodeId: "n",
          config: { spreadsheetId: "ss", sheetName: "S", cell: "A" },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow(/A1-style single-cell/);
    });

    it("rejects cell with no column letter (1)", async () => {
      await expect(
        getCellValue({
          workflowId: "wf",
          userId: "u",
          runId: "r",
          nodeId: "n",
          config: { spreadsheetId: "ss", sheetName: "S", cell: "1" },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow(/A1-style single-cell/);
    });

    it("rejects empty spreadsheetId / sheetName / cell", async () => {
      await expect(
        getCellValue({
          workflowId: "wf",
          userId: "u",
          runId: "r",
          nodeId: "n",
          config: { spreadsheetId: "", sheetName: "S", cell: "A1" },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow(/spreadsheetId is required/);

      await expect(
        getCellValue({
          workflowId: "wf",
          userId: "u",
          runId: "r",
          nodeId: "n",
          config: { spreadsheetId: "ss", sheetName: "", cell: "A1" },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow(/sheetName is required/);

      await expect(
        getCellValue({
          workflowId: "wf",
          userId: "u",
          runId: "r",
          nodeId: "n",
          config: { spreadsheetId: "ss", sheetName: "S", cell: "" },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow(/cell is required/);
    });

    it("rejects missing fields", async () => {
      await expect(
        getCellValue({
          workflowId: "wf",
          userId: "u",
          runId: "r",
          nodeId: "n",
          config: { sheetName: "S", cell: "A1" }, // no spreadsheetId
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow();
    });

    it("rejects strict-mode config (unknown fields like cellAddress, valueRenderOption)", async () => {
      await expect(
        getCellValue({
          workflowId: "wf",
          userId: "u",
          runId: "r",
          nodeId: "n",
          config: {
            spreadsheetId: "ss",
            sheetName: "S",
            cell: "A1",
            cellAddress: "B2", // V1 field name leaking in
          },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow();

      await expect(
        getCellValue({
          workflowId: "wf",
          userId: "u",
          runId: "r",
          nodeId: "n",
          config: {
            spreadsheetId: "ss",
            sheetName: "S",
            cell: "A1",
            valueRenderOption: "UNFORMATTED_VALUE",
          },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow();
    });
  });
});
