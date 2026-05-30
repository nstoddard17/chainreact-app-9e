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

import { updateRow } from "@/integrations/google-sheets/actions/updateRow";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockValuesUpdate.mockReset();
});

function trigger(): TriggerEvent {
  return {
    provider: "google-sheets",
    eventType: "row_changed",
    eventId: "evt-1",
    occurredAt: "2026-05-08T12:00:00Z",
    providerAccountId: "alice@example.test",
    payload: {},
  };
}

describe("updateRow action", () => {
  it("wraps row in [[...]] and forwards range + Q11 valueInputOption", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockValuesUpdate.mockResolvedValue({
      spreadsheetId: "ss-1",
      updatedRange: "Sheet1!A5:C5",
      updatedRows: 1,
      updatedColumns: 3,
      updatedCells: 3,
    });

    const result = await updateRow({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss-1",
        range: "Sheet1!A5:C5",
        values: ["bob", "bob@e.test", 99],
        valueInputOption: "USER_ENTERED",
      },
      triggerEvent: trigger(),
    });

    expect(mockValuesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "t",
        spreadsheetId: "ss-1",
        range: "Sheet1!A5:C5",
        valueInputOption: "USER_ENTERED",
        values: [["bob", "bob@e.test", 99]],
      }),
    );
    expect(result.output).toEqual({
      spreadsheetId: "ss-1",
      updatedRange: "Sheet1!A5:C5",
      updatedRows: 1,
      updatedColumns: 3,
      updatedCells: 3,
    });
  });

  it("forwards RAW valueInputOption when chosen", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockValuesUpdate.mockResolvedValue({});

    await updateRow({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        range: "Sheet1!A1:A1",
        values: ["x"],
        valueInputOption: "RAW",
      },
      triggerEvent: trigger(),
    });

    expect(mockValuesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ valueInputOption: "RAW" }),
    );
  });

  it("rejects missing valueInputOption (Q11 — no hidden default)", async () => {
    await expect(
      updateRow({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { spreadsheetId: "s", range: "S", values: ["x"] }, // missing valueInputOption
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("rejects empty values array", async () => {
    await expect(
      updateRow({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          spreadsheetId: "s",
          range: "S",
          values: [],
          valueInputOption: "RAW",
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/non-empty/);
  });

  it("rejects strict-mode config (unknown fields)", async () => {
    await expect(
      updateRow({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          spreadsheetId: "s",
          range: "S",
          values: ["x"],
          valueInputOption: "RAW",
          insertDataOption: "INSERT_ROWS", // belongs on append, not update
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});
