/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockSpreadsheetsGet = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/google-sheets/api/spreadsheetsGet", () => ({
  spreadsheetsGet: (...args: unknown[]) => mockSpreadsheetsGet(...args),
}));

import { getSheetMetadata } from "@/integrations/google-sheets/actions/getSheetMetadata";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockSpreadsheetsGet.mockReset();
});

function trigger(): TriggerEvent {
  return {
    provider: "google-sheets",
    eventType: "row_changed",
    eventId: "evt-1",
    occurredAt: "2026-05-08T12:00:00Z",
    accountId: "alice@example.test",
    payload: {},
  };
}

describe("getSheetMetadata action", () => {
  it("flattens nested spreadsheet response into stable downstream shape", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockSpreadsheetsGet.mockResolvedValue({
      spreadsheetId: "ss-1",
      properties: {
        title: "Q3 Revenue",
        locale: "en_US",
        timeZone: "America/Los_Angeles",
      },
      sheets: [
        {
          properties: {
            sheetId: 0,
            title: "Sheet1",
            index: 0,
            sheetType: "GRID",
            gridProperties: { rowCount: 1000, columnCount: 26 },
          },
        },
        {
          properties: {
            sheetId: 12345,
            title: "Notes",
            index: 1,
            sheetType: "GRID",
            gridProperties: { rowCount: 100, columnCount: 5 },
          },
        },
      ],
    });

    const result = await getSheetMetadata({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { spreadsheetId: "ss-1" },
      triggerEvent: trigger(),
    });

    expect(result.output).toEqual({
      spreadsheetId: "ss-1",
      title: "Q3 Revenue",
      locale: "en_US",
      timeZone: "America/Los_Angeles",
      sheets: [
        {
          sheetId: 0,
          title: "Sheet1",
          index: 0,
          sheetType: "GRID",
          rowCount: 1000,
          columnCount: 26,
        },
        {
          sheetId: 12345,
          title: "Notes",
          index: 1,
          sheetType: "GRID",
          rowCount: 100,
          columnCount: 5,
        },
      ],
    });
  });

  it("nulls missing fields rather than dropping them (stable variable shape)", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockSpreadsheetsGet.mockResolvedValue({
      spreadsheetId: "ss-2",
      // properties intentionally omitted
      sheets: [{ properties: { title: "Only" } }], // gridProperties omitted
    });

    const result = await getSheetMetadata({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { spreadsheetId: "ss-2" },
      triggerEvent: trigger(),
    });

    expect(result.output.title).toBeNull();
    expect(result.output.locale).toBeNull();
    expect(result.output.timeZone).toBeNull();
    expect(result.output.sheets).toEqual([
      {
        sheetId: null,
        title: "Only",
        index: null,
        sheetType: null,
        rowCount: null,
        columnCount: null,
      },
    ]);
  });

  it("returns empty sheets[] when the response has no sheets", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockSpreadsheetsGet.mockResolvedValue({ spreadsheetId: "ss-3" });

    const result = await getSheetMetadata({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { spreadsheetId: "ss-3" },
      triggerEvent: trigger(),
    });

    expect(result.output.sheets).toEqual([]);
  });

  it("rejects strict-mode config (unknown fields)", async () => {
    await expect(
      getSheetMetadata({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: {
          spreadsheetId: "s",
          includeGridData: true, // intentionally not exposed by V2
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});
