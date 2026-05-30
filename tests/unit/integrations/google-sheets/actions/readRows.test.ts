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

import { readRows } from "@/integrations/google-sheets/actions/readRows";

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

describe("readRows action", () => {
  it("forwards spreadsheetId + range + majorDimension to the wrapper", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockValuesGet.mockResolvedValue({
      range: "Sheet1!A1:C2",
      majorDimension: "ROWS",
      values: [
        ["a", "b", "c"],
        ["d", "e", "f"],
      ],
    });

    const result = await readRows({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss-1",
        range: "Sheet1!A1:C2",
      },
      triggerEvent: sheetsTrigger(),
    });

    expect(mockValuesGet).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "t",
        spreadsheetId: "ss-1",
        range: "Sheet1!A1:C2",
        majorDimension: "ROWS",
      }),
    );
    expect(result.output.values).toEqual([
      ["a", "b", "c"],
      ["d", "e", "f"],
    ]);
    expect(result.output.count).toBe(2);
    expect(result.output.range).toBe("Sheet1!A1:C2");
  });

  it("uses majorDimension default 'ROWS' when not specified", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockValuesGet.mockResolvedValue({ values: [] });

    await readRows({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { spreadsheetId: "ss", range: "Sheet1" },
      triggerEvent: sheetsTrigger(),
    });

    expect(mockValuesGet).toHaveBeenCalledWith(
      expect.objectContaining({ majorDimension: "ROWS" }),
    );
  });

  it("handles empty response (no values key) → empty array + count=0", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockValuesGet.mockResolvedValue({ range: "Sheet1!A:Z", majorDimension: "ROWS" });

    const result = await readRows({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { spreadsheetId: "ss", range: "Sheet1!A:Z" },
      triggerEvent: sheetsTrigger(),
    });

    expect(result.output.values).toEqual([]);
    expect(result.output.count).toBe(0);
  });

  it("passes accountId through when trigger is from google-sheets", async () => {
    mockRefreshAndRetry.mockResolvedValue({ values: [] });

    await readRows({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { spreadsheetId: "s", range: "S1" },
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
    mockRefreshAndRetry.mockResolvedValue({ values: [] });

    await readRows({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { spreadsheetId: "s", range: "S1" },
      triggerEvent: nonSheetsTrigger(),
    });

    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: null }),
    );
  });

  it("rejects strict-mode config (unknown fields)", async () => {
    await expect(
      readRows({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          spreadsheetId: "s",
          range: "S1",
          valueInputOption: "RAW", // not allowed on read action
        },
        triggerEvent: sheetsTrigger(),
      }),
    ).rejects.toThrow();
  });

  it("rejects empty spreadsheetId / range", async () => {
    await expect(
      readRows({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { spreadsheetId: "", range: "S1" },
        triggerEvent: sheetsTrigger(),
      }),
    ).rejects.toThrow(/spreadsheetId is required/);

    await expect(
      readRows({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { spreadsheetId: "s", range: "" },
        triggerEvent: sheetsTrigger(),
      }),
    ).rejects.toThrow(/range is required/);
  });
});
