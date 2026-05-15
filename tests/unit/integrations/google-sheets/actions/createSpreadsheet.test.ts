/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockSpreadsheetsCreate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/google-sheets/api/spreadsheetsCreate", () => ({
  spreadsheetsCreate: (...args: unknown[]) => mockSpreadsheetsCreate(...args),
}));

import { createSpreadsheet } from "@/integrations/google-sheets/actions/createSpreadsheet";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockSpreadsheetsCreate.mockReset();
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
  mockSpreadsheetsCreate.mockResolvedValue(response);
  mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
};

describe("createSpreadsheet action", () => {
  it("calls wrapper with title-only when initialSheetName is omitted", async () => {
    wireRefresh({
      spreadsheetId: "ss-new",
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/ss-new/edit",
      properties: { title: "Project Tracker" },
      sheets: [
        { properties: { sheetId: 0, title: "Sheet1" } },
      ],
    });

    const result = await createSpreadsheet({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { title: "Project Tracker" },
      triggerEvent: sheetsTrigger(),
    });

    expect(mockSpreadsheetsCreate).toHaveBeenCalledWith({
      accessToken: "t",
      title: "Project Tracker",
      initialSheetTitles: undefined,
    });
    expect(result.output).toEqual({
      spreadsheetId: "ss-new",
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/ss-new/edit",
      title: "Project Tracker",
      sheets: [{ sheetId: 0, title: "Sheet1" }],
      firstSheet: { sheetId: 0, title: "Sheet1" },
    });
  });

  it("calls wrapper with initialSheetTitles=[name] when initialSheetName is set", async () => {
    wireRefresh({
      spreadsheetId: "ss-2",
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/ss-2/edit",
      properties: { title: "Orders" },
      sheets: [{ properties: { sheetId: 0, title: "Orders Q1" } }],
    });

    const result = await createSpreadsheet({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        title: "Orders",
        initialSheetName: "Orders Q1",
      },
      triggerEvent: sheetsTrigger(),
    });

    expect(mockSpreadsheetsCreate).toHaveBeenCalledWith({
      accessToken: "t",
      title: "Orders",
      initialSheetTitles: ["Orders Q1"],
    });
    expect(result.output.firstSheet).toEqual({
      sheetId: 0,
      title: "Orders Q1",
    });
  });

  it("falls back to config.title when response omits properties.title", async () => {
    wireRefresh({
      spreadsheetId: "ss",
      // No properties / no sheets
    });

    const result = await createSpreadsheet({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { title: "Untitled" },
      triggerEvent: sheetsTrigger(),
    });

    expect(result.output).toEqual({
      spreadsheetId: "ss",
      spreadsheetUrl: null,
      title: "Untitled",
      sheets: [],
      firstSheet: null,
    });
  });

  it("returns spreadsheetId=null and firstSheet=null when response is bare", async () => {
    wireRefresh({});

    const result = await createSpreadsheet({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { title: "X" },
      triggerEvent: sheetsTrigger(),
    });

    expect(result.output).toEqual({
      spreadsheetId: null,
      spreadsheetUrl: null,
      title: "X",
      sheets: [],
      firstSheet: null,
    });
  });

  it("flattens nested sheet properties to {sheetId, title}", async () => {
    wireRefresh({
      spreadsheetId: "ss",
      sheets: [
        {
          properties: {
            sheetId: 123,
            title: "Sheet1",
            index: 0,
            sheetType: "GRID",
            gridProperties: { rowCount: 1000, columnCount: 26 },
          },
        },
      ],
    });

    const result = await createSpreadsheet({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { title: "X" },
      triggerEvent: sheetsTrigger(),
    });

    expect(result.output.sheets).toEqual([{ sheetId: 123, title: "Sheet1" }]);
  });

  it("handles missing sheetId / title in response (null mapping)", async () => {
    wireRefresh({
      spreadsheetId: "ss",
      sheets: [{ properties: {} }],
    });

    const result = await createSpreadsheet({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { title: "X" },
      triggerEvent: sheetsTrigger(),
    });

    expect(result.output.sheets).toEqual([{ sheetId: null, title: null }]);
  });

  it("propagates wrapper errors", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockSpreadsheetsCreate.mockRejectedValue(new Error("create-boom"));

    await expect(
      createSpreadsheet({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { title: "X" },
        triggerEvent: sheetsTrigger(),
      }),
    ).rejects.toThrow(/create-boom/);
  });

  it("passes accountId through when trigger is from google-sheets", async () => {
    wireRefresh({ spreadsheetId: "ss" });

    await createSpreadsheet({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { title: "X" },
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
    wireRefresh({ spreadsheetId: "ss" });

    await createSpreadsheet({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { title: "X" },
      triggerEvent: nonSheetsTrigger(),
    });

    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: null }),
    );
  });

  describe("schema validation", () => {
    it("rejects missing title", async () => {
      await expect(
        createSpreadsheet({
          workflowId: "wf",
          userId: "u",
          runId: "r",
          nodeId: "n",
          config: {},
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow();
    });

    it("rejects empty title", async () => {
      await expect(
        createSpreadsheet({
          workflowId: "wf",
          userId: "u",
          runId: "r",
          nodeId: "n",
          config: { title: "" },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow(/title is required/);
    });

    it("rejects empty initialSheetName (when provided, must be non-empty)", async () => {
      await expect(
        createSpreadsheet({
          workflowId: "wf",
          userId: "u",
          runId: "r",
          nodeId: "n",
          config: { title: "X", initialSheetName: "" },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow(/initialSheetName must be non-empty/);
    });

    it("rejects strict-mode config (V1 chrome fields)", async () => {
      const baseConfig = { title: "X" };
      // V1 field names that explicitly do NOT round-trip into V2:
      // template / initialData / description / sheets / folder /
      // locale / timeZone / sheetNames — all audit-skipped (GS-R10).
      for (const extra of [
        { template: "budget" },
        { initialData: "name,age\nalice,30" },
        { description: "A spreadsheet" },
        { sheets: ["S1", "S2"] },
        { folder: "drive-folder-id" },
        { locale: "en_US" },
        { timeZone: "America/Los_Angeles" },
        { sheetNames: ["S1"] },
      ]) {
        await expect(
          createSpreadsheet({
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
