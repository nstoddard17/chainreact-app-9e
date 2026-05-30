/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockValuesUpdate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/google-sheets/api/valuesUpdate", () => ({
  valuesUpdate: (...args: unknown[]) => mockValuesUpdate(...args),
}));

import { updateCell } from "@/integrations/google-sheets/actions/updateCell";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockValuesUpdate.mockReset();
});

function sheetsTrigger(): TriggerEvent {
  return {
    provider: "google-sheets",
    eventType: "row_changed",
    eventId: "evt-1",
    occurredAt: "2026-05-08T12:00:00Z",
    providerAccountId: "alice@example.test",
    payload: {},
  };
}

function nonSheetsTrigger(): TriggerEvent {
  return {
    provider: "slack",
    eventType: "message_received",
    eventId: "evt-2",
    occurredAt: "2026-05-08T12:00:00Z",
    providerAccountId: "T123",
    payload: {},
  };
}

describe("updateCell action", () => {
  it("builds <sheetName>!<cell> range and wraps value as [[v]]", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockValuesUpdate.mockResolvedValue({
      spreadsheetId: "ss-1",
      updatedRange: "Sheet1!B5",
      updatedRows: 1,
      updatedColumns: 1,
      updatedCells: 1,
    });

    const result = await updateCell({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
        cell: "B5",
        value: "hello",
        valueInputOption: "USER_ENTERED",
      },
      triggerEvent: sheetsTrigger(),
    });

    expect(mockValuesUpdate).toHaveBeenCalledWith({
      accessToken: "t",
      spreadsheetId: "ss-1",
      range: "Sheet1!B5",
      valueInputOption: "USER_ENTERED",
      values: [["hello"]],
    });
    expect(result.output).toEqual({
      spreadsheetId: "ss-1",
      sheetName: "Sheet1",
      cell: "B5",
      updated: true,
      updatedRange: "Sheet1!B5",
      updatedCells: 1,
    });
  });

  it("forwards RAW valueInputOption when chosen (Q11 — explicit)", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockValuesUpdate.mockResolvedValue({});

    await updateCell({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        sheetName: "Sheet1",
        cell: "A1",
        value: "=SUM(A1:A10)",
        valueInputOption: "RAW",
      },
      triggerEvent: sheetsTrigger(),
    });

    expect(mockValuesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        valueInputOption: "RAW",
        values: [["=SUM(A1:A10)"]],
      }),
    );
  });

  it("accepts numeric value", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockValuesUpdate.mockResolvedValue({});

    await updateCell({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        sheetName: "S",
        cell: "A1",
        value: 42,
        valueInputOption: "USER_ENTERED",
      },
      triggerEvent: sheetsTrigger(),
    });

    expect(mockValuesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ values: [[42]] }),
    );
  });

  it("accepts boolean value", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockValuesUpdate.mockResolvedValue({});

    await updateCell({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        sheetName: "S",
        cell: "A1",
        value: true,
        valueInputOption: "RAW",
      },
      triggerEvent: sheetsTrigger(),
    });

    expect(mockValuesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ values: [[true]] }),
    );
  });

  it("accepts null value (explicit blank-cell)", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockValuesUpdate.mockResolvedValue({});

    await updateCell({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        sheetName: "S",
        cell: "A1",
        value: null,
        valueInputOption: "RAW",
      },
      triggerEvent: sheetsTrigger(),
    });

    expect(mockValuesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ values: [[null]] }),
    );
  });

  it("accepts empty string value (explicit clear)", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockValuesUpdate.mockResolvedValue({});

    await updateCell({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        sheetName: "S",
        cell: "A1",
        value: "",
        valueInputOption: "RAW",
      },
      triggerEvent: sheetsTrigger(),
    });

    expect(mockValuesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ values: [[""]] }),
    );
  });

  it("falls back to config.spreadsheetId / null updatedRange / 0 cells when response is bare", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockValuesUpdate.mockResolvedValue({});

    const result = await updateCell({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        sheetName: "S",
        cell: "A1",
        value: "x",
        valueInputOption: "RAW",
      },
      triggerEvent: sheetsTrigger(),
    });

    expect(result.output).toEqual({
      spreadsheetId: "ss",
      sheetName: "S",
      cell: "A1",
      updated: true,
      updatedRange: null,
      updatedCells: 0,
    });
  });

  it("propagates wrapper errors", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockValuesUpdate.mockRejectedValue(new Error("boom"));

    await expect(
      updateCell({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          spreadsheetId: "ss",
          sheetName: "S",
          cell: "A1",
          value: "x",
          valueInputOption: "RAW",
        },
        triggerEvent: sheetsTrigger(),
      }),
    ).rejects.toThrow(/boom/);
  });

  it("passes accountId through when trigger is from google-sheets", async () => {
    mockRefreshAndRetry.mockResolvedValue({});

    await updateCell({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        sheetName: "S",
        cell: "A1",
        value: "x",
        valueInputOption: "RAW",
      },
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
    mockRefreshAndRetry.mockResolvedValue({});

    await updateCell({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        sheetName: "S",
        cell: "A1",
        value: "x",
        valueInputOption: "RAW",
      },
      triggerEvent: nonSheetsTrigger(),
    });

    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: null }),
    );
  });

  describe("schema validation", () => {
    it("rejects missing valueInputOption (Q11 — no hidden default)", async () => {
      await expect(
        updateCell({
          workflowId: "wf",
          userId: "u",
          accountId: "acct-u",
          runId: "r",
          nodeId: "n",
          config: { spreadsheetId: "s", sheetName: "S", cell: "A1", value: "x" },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow();
    });

    it("rejects undefined value (missing field)", async () => {
      await expect(
        updateCell({
          workflowId: "wf",
          userId: "u",
          accountId: "acct-u",
          runId: "r",
          nodeId: "n",
          config: {
            spreadsheetId: "s",
            sheetName: "S",
            cell: "A1",
            valueInputOption: "RAW",
          },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow();
    });

    it("rejects multi-cell range syntax in cell field (A1:B5)", async () => {
      await expect(
        updateCell({
          workflowId: "wf",
          userId: "u",
          accountId: "acct-u",
          runId: "r",
          nodeId: "n",
          config: {
            spreadsheetId: "ss",
            sheetName: "S",
            cell: "A1:B5",
            value: "x",
            valueInputOption: "RAW",
          },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow(/A1-style single-cell/);
    });

    it("rejects empty spreadsheetId / sheetName / cell", async () => {
      await expect(
        updateCell({
          workflowId: "wf",
          userId: "u",
          accountId: "acct-u",
          runId: "r",
          nodeId: "n",
          config: {
            spreadsheetId: "",
            sheetName: "S",
            cell: "A1",
            value: "x",
            valueInputOption: "RAW",
          },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow(/spreadsheetId is required/);

      await expect(
        updateCell({
          workflowId: "wf",
          userId: "u",
          accountId: "acct-u",
          runId: "r",
          nodeId: "n",
          config: {
            spreadsheetId: "ss",
            sheetName: "",
            cell: "A1",
            value: "x",
            valueInputOption: "RAW",
          },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow(/sheetName is required/);

      await expect(
        updateCell({
          workflowId: "wf",
          userId: "u",
          accountId: "acct-u",
          runId: "r",
          nodeId: "n",
          config: {
            spreadsheetId: "ss",
            sheetName: "S",
            cell: "",
            value: "x",
            valueInputOption: "RAW",
          },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow(/cell is required/);
    });

    it("rejects strict-mode config (unknown fields like range, values, cellAddress)", async () => {
      await expect(
        updateCell({
          workflowId: "wf",
          userId: "u",
          accountId: "acct-u",
          runId: "r",
          nodeId: "n",
          config: {
            spreadsheetId: "ss",
            sheetName: "S",
            cell: "A1",
            value: "x",
            valueInputOption: "RAW",
            range: "Sheet1!A1", // raw API field — must be rejected
          },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow();

      await expect(
        updateCell({
          workflowId: "wf",
          userId: "u",
          accountId: "acct-u",
          runId: "r",
          nodeId: "n",
          config: {
            spreadsheetId: "ss",
            sheetName: "S",
            cell: "A1",
            value: "x",
            valueInputOption: "RAW",
            values: [["x"]], // V1-style array
          },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow();

      await expect(
        updateCell({
          workflowId: "wf",
          userId: "u",
          accountId: "acct-u",
          runId: "r",
          nodeId: "n",
          config: {
            spreadsheetId: "ss",
            sheetName: "S",
            cell: "A1",
            value: "x",
            valueInputOption: "RAW",
            cellAddress: "B2", // V1 field name leaking in
          },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow();
    });
  });
});
