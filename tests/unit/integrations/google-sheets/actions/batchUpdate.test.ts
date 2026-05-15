/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockValuesBatchUpdate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/google-sheets/api/valuesBatchUpdate", () => ({
  valuesBatchUpdate: (...args: unknown[]) => mockValuesBatchUpdate(...args),
}));

import { batchUpdate } from "@/integrations/google-sheets/actions/batchUpdate";
import { BATCH_UPDATE_MAX_RANGES } from "@/integrations/google-sheets/actions/batchUpdate.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockValuesBatchUpdate.mockReset();
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

const wireRefresh = (response: Record<string, unknown>) => {
  mockValuesBatchUpdate.mockResolvedValue(response);
  mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
};

describe("batchUpdate action", () => {
  it("forwards data + valueInputOption to the wrapper for a single update", async () => {
    wireRefresh({
      spreadsheetId: "ss-1",
      totalUpdatedRows: 1,
      totalUpdatedColumns: 1,
      totalUpdatedCells: 1,
      totalUpdatedSheets: 1,
      responses: [
        {
          spreadsheetId: "ss-1",
          updatedRange: "Sheet1!A1",
          updatedRows: 1,
          updatedColumns: 1,
          updatedCells: 1,
        },
      ],
    });

    const result = await batchUpdate({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss-1",
        valueInputOption: "USER_ENTERED",
        updates: [{ range: "Sheet1!A1", values: [["hello"]] }],
      },
      triggerEvent: sheetsTrigger(),
    });

    expect(mockValuesBatchUpdate).toHaveBeenCalledWith({
      accessToken: "t",
      spreadsheetId: "ss-1",
      valueInputOption: "USER_ENTERED",
      data: [{ range: "Sheet1!A1", values: [["hello"]] }],
    });
    expect(result.output).toEqual({
      spreadsheetId: "ss-1",
      totalUpdatedRanges: 1,
      totalUpdatedCells: 1,
      totalUpdatedRows: 1,
      totalUpdatedColumns: 1,
      responses: [
        {
          updatedRange: "Sheet1!A1",
          updatedRows: 1,
          updatedColumns: 1,
          updatedCells: 1,
        },
      ],
    });
  });

  it("handles multiple updates and sums totals from response", async () => {
    wireRefresh({
      spreadsheetId: "ss",
      totalUpdatedRows: 3,
      totalUpdatedColumns: 5,
      totalUpdatedCells: 7,
      totalUpdatedSheets: 1,
      responses: [
        {
          updatedRange: "Sheet1!A1",
          updatedRows: 1,
          updatedColumns: 1,
          updatedCells: 1,
        },
        {
          updatedRange: "Sheet1!B2:C3",
          updatedRows: 2,
          updatedColumns: 2,
          updatedCells: 4,
        },
        {
          updatedRange: "Sheet1!D5",
          updatedRows: 1,
          updatedColumns: 2,
          updatedCells: 2,
        },
      ],
    });

    const result = await batchUpdate({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        valueInputOption: "RAW",
        updates: [
          { range: "Sheet1!A1", values: [["one"]] },
          { range: "Sheet1!B2:C3", values: [["b2", "c2"], ["b3", "c3"]] },
          { range: "Sheet1!D5", values: [["d5", "e5"]] },
        ],
      },
      triggerEvent: sheetsTrigger(),
    });

    expect(result.output.totalUpdatedRanges).toBe(3);
    expect(result.output.totalUpdatedCells).toBe(7);
    expect(result.output.totalUpdatedRows).toBe(3);
    expect(result.output.totalUpdatedColumns).toBe(5);
    expect(result.output.responses).toHaveLength(3);
  });

  it("forwards RAW valueInputOption (Q11 — explicit)", async () => {
    wireRefresh({});

    await batchUpdate({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        valueInputOption: "RAW",
        updates: [{ range: "Sheet1!A1", values: [["=SUM(A2:A10)"]] }],
      },
      triggerEvent: sheetsTrigger(),
    });

    expect(mockValuesBatchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ valueInputOption: "RAW" }),
    );
  });

  it("falls back to {totalUpdated*: 0, responses: []} when Google returns a bare response", async () => {
    wireRefresh({});

    const result = await batchUpdate({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        valueInputOption: "USER_ENTERED",
        updates: [{ range: "Sheet1!A1", values: [["x"]] }],
      },
      triggerEvent: sheetsTrigger(),
    });

    expect(result.output).toEqual({
      spreadsheetId: "ss",
      totalUpdatedRanges: 0,
      totalUpdatedCells: 0,
      totalUpdatedRows: 0,
      totalUpdatedColumns: 0,
      responses: [],
    });
  });

  it("falls back to per-entry defaults when response entries omit counter fields", async () => {
    wireRefresh({
      responses: [
        { updatedRange: "Sheet1!A1" }, // no counters
      ],
    });

    const result = await batchUpdate({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        valueInputOption: "RAW",
        updates: [{ range: "Sheet1!A1", values: [["x"]] }],
      },
      triggerEvent: sheetsTrigger(),
    });

    expect(result.output.responses).toEqual([
      {
        updatedRange: "Sheet1!A1",
        updatedRows: 0,
        updatedColumns: 0,
        updatedCells: 0,
      },
    ]);
    expect(result.output.totalUpdatedRanges).toBe(1);
  });

  it("propagates wrapper errors", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockValuesBatchUpdate.mockRejectedValue(new Error("boom"));

    await expect(
      batchUpdate({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: {
          spreadsheetId: "ss",
          valueInputOption: "RAW",
          updates: [{ range: "Sheet1!A1", values: [["x"]] }],
        },
        triggerEvent: sheetsTrigger(),
      }),
    ).rejects.toThrow(/boom/);
  });

  it("passes accountId through when trigger is from google-sheets", async () => {
    wireRefresh({});

    await batchUpdate({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        valueInputOption: "RAW",
        updates: [{ range: "Sheet1!A1", values: [["x"]] }],
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
    wireRefresh({});

    await batchUpdate({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        valueInputOption: "RAW",
        updates: [{ range: "Sheet1!A1", values: [["x"]] }],
      },
      triggerEvent: nonSheetsTrigger(),
    });

    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: null }),
    );
  });

  describe("schema validation", () => {
    const baseConfig = {
      spreadsheetId: "ss",
      valueInputOption: "USER_ENTERED" as const,
      updates: [{ range: "Sheet1!A1", values: [["x"]] }],
    };

    it("accepts a single update", async () => {
      wireRefresh({});

      await expect(
        batchUpdate({
          workflowId: "wf",
          userId: "u",
          runId: "r",
          nodeId: "n",
          config: baseConfig,
          triggerEvent: sheetsTrigger(),
        }),
      ).resolves.toBeDefined();
    });

    it("accepts multiple updates", async () => {
      wireRefresh({});

      await expect(
        batchUpdate({
          workflowId: "wf",
          userId: "u",
          runId: "r",
          nodeId: "n",
          config: {
            ...baseConfig,
            updates: [
              { range: "Sheet1!A1", values: [["a"]] },
              { range: "Sheet1!B2:C3", values: [["b2", "c2"], ["b3", "c3"]] },
            ],
          },
          triggerEvent: sheetsTrigger(),
        }),
      ).resolves.toBeDefined();
    });

    it("accepts RAW valueInputOption", async () => {
      wireRefresh({});

      await expect(
        batchUpdate({
          workflowId: "wf",
          userId: "u",
          runId: "r",
          nodeId: "n",
          config: { ...baseConfig, valueInputOption: "RAW" },
          triggerEvent: sheetsTrigger(),
        }),
      ).resolves.toBeDefined();
    });

    it("accepts USER_ENTERED valueInputOption", async () => {
      wireRefresh({});

      await expect(
        batchUpdate({
          workflowId: "wf",
          userId: "u",
          runId: "r",
          nodeId: "n",
          config: { ...baseConfig, valueInputOption: "USER_ENTERED" },
          triggerEvent: sheetsTrigger(),
        }),
      ).resolves.toBeDefined();
    });

    it("accepts mixed primitive cell values (string/number/boolean/null)", async () => {
      wireRefresh({});

      await expect(
        batchUpdate({
          workflowId: "wf",
          userId: "u",
          runId: "r",
          nodeId: "n",
          config: {
            ...baseConfig,
            updates: [
              {
                range: "Sheet1!A1:D1",
                values: [["text", 42, true, null]],
              },
            ],
          },
          triggerEvent: sheetsTrigger(),
        }),
      ).resolves.toBeDefined();
    });

    it("rejects missing spreadsheetId", async () => {
      await expect(
        batchUpdate({
          workflowId: "wf",
          userId: "u",
          runId: "r",
          nodeId: "n",
          config: { valueInputOption: "RAW", updates: baseConfig.updates },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow();
    });

    it("rejects empty spreadsheetId", async () => {
      await expect(
        batchUpdate({
          workflowId: "wf",
          userId: "u",
          runId: "r",
          nodeId: "n",
          config: { ...baseConfig, spreadsheetId: "" },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow(/spreadsheetId is required/);
    });

    it("rejects missing valueInputOption (Q11 — no hidden default)", async () => {
      await expect(
        batchUpdate({
          workflowId: "wf",
          userId: "u",
          runId: "r",
          nodeId: "n",
          config: { spreadsheetId: "ss", updates: baseConfig.updates },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow();
    });

    it("rejects invalid valueInputOption", async () => {
      await expect(
        batchUpdate({
          workflowId: "wf",
          userId: "u",
          runId: "r",
          nodeId: "n",
          config: { ...baseConfig, valueInputOption: "AUTO" },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow();
    });

    it("rejects empty updates array", async () => {
      await expect(
        batchUpdate({
          workflowId: "wf",
          userId: "u",
          runId: "r",
          nodeId: "n",
          config: { ...baseConfig, updates: [] },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow(/non-empty/);
    });

    it("rejects updates array exceeding the cap", async () => {
      const tooMany = Array.from({ length: BATCH_UPDATE_MAX_RANGES + 1 }, (_, i) => ({
        range: `Sheet1!A${i + 1}`,
        values: [[i]],
      }));

      await expect(
        batchUpdate({
          workflowId: "wf",
          userId: "u",
          runId: "r",
          nodeId: "n",
          config: { ...baseConfig, updates: tooMany },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow(/at most 100/);
    });

    it("rejects range without sheet-name prefix", async () => {
      await expect(
        batchUpdate({
          workflowId: "wf",
          userId: "u",
          runId: "r",
          nodeId: "n",
          config: {
            ...baseConfig,
            updates: [{ range: "A1:B2", values: [["x", "y"]] }],
          },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow(/sheet-name prefix/);
    });

    it("rejects empty range", async () => {
      await expect(
        batchUpdate({
          workflowId: "wf",
          userId: "u",
          runId: "r",
          nodeId: "n",
          config: {
            ...baseConfig,
            updates: [{ range: "", values: [["x"]] }],
          },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow(/update range is required/);
    });

    it("rejects empty values 2D array", async () => {
      await expect(
        batchUpdate({
          workflowId: "wf",
          userId: "u",
          runId: "r",
          nodeId: "n",
          config: {
            ...baseConfig,
            updates: [{ range: "Sheet1!A1", values: [] }],
          },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow(/non-empty 2D array/);
    });

    it("rejects invalid cell value type (object)", async () => {
      await expect(
        batchUpdate({
          workflowId: "wf",
          userId: "u",
          runId: "r",
          nodeId: "n",
          config: {
            ...baseConfig,
            updates: [{ range: "Sheet1!A1", values: [[{ nested: "x" }]] }],
          },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow();
    });

    it("rejects invalid cell value type (array)", async () => {
      await expect(
        batchUpdate({
          workflowId: "wf",
          userId: "u",
          runId: "r",
          nodeId: "n",
          config: {
            ...baseConfig,
            updates: [{ range: "Sheet1!A1", values: [[["x"]]] }],
          },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow();
    });

    it("rejects raw requests[] passthrough (V1 escape hatch — accepted plan Decision 1)", async () => {
      await expect(
        batchUpdate({
          workflowId: "wf",
          userId: "u",
          runId: "r",
          nodeId: "n",
          config: {
            spreadsheetId: "ss",
            valueInputOption: "RAW",
            requests: [{ deleteDimension: {} }],
          },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow();
    });

    it("rejects JSON-string updates (V1 stringified mode — NOT PORTED)", async () => {
      await expect(
        batchUpdate({
          workflowId: "wf",
          userId: "u",
          runId: "r",
          nodeId: "n",
          config: {
            spreadsheetId: "ss",
            valueInputOption: "RAW",
            // V1 accepted a stringified JSON updates field — V2 rejects.
            updates: '[{"range":"Sheet1!A1","values":[["x"]]}]',
          },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow();
    });

    it("rejects V1 cell1/value1 UI chrome fields", async () => {
      await expect(
        batchUpdate({
          workflowId: "wf",
          userId: "u",
          runId: "r",
          nodeId: "n",
          config: {
            ...baseConfig,
            cell1: "A1",
            value1: "hello",
          },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow();
    });

    it("rejects strict-mode config (other V1 field names)", async () => {
      for (const extra of [
        { inputMode: "simple" },
        { sheetName: "Sheet1" },
        { cell2: "B1", value2: "y" },
        { data: [{ range: "Sheet1!A1", values: [["x"]] }] }, // Google body field, not action input
      ]) {
        await expect(
          batchUpdate({
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

    it("rejects unknown fields inside an update entry", async () => {
      await expect(
        batchUpdate({
          workflowId: "wf",
          userId: "u",
          runId: "r",
          nodeId: "n",
          config: {
            ...baseConfig,
            updates: [
              {
                range: "Sheet1!A1",
                values: [["x"]],
                majorDimension: "ROWS",
              },
            ],
          },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow();
    });
  });
});
