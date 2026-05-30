/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockValuesClear = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/google-sheets/api/valuesClear", () => ({
  valuesClear: (...args: unknown[]) => mockValuesClear(...args),
}));

import { clearRange } from "@/integrations/google-sheets/actions/clearRange";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockValuesClear.mockReset();
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

describe("clearRange action", () => {
  it("forwards spreadsheetId + range to the wrapper, surfaces clearedRange", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockValuesClear.mockResolvedValue({
      spreadsheetId: "ss-1",
      clearedRange: "Sheet1!A1:C5",
    });

    const result = await clearRange({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { spreadsheetId: "ss-1", range: "Sheet1!A1:C5" },
      triggerEvent: trigger(),
    });

    expect(mockValuesClear).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "t",
        spreadsheetId: "ss-1",
        range: "Sheet1!A1:C5",
      }),
    );
    expect(result.output).toEqual({
      spreadsheetId: "ss-1",
      clearedRange: "Sheet1!A1:C5",
    });
  });

  it("rejects strict-mode config (unknown fields)", async () => {
    await expect(
      clearRange({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          spreadsheetId: "s",
          range: "S",
          valueInputOption: "RAW", // not allowed on clear
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("rejects empty spreadsheetId / range", async () => {
    await expect(
      clearRange({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { spreadsheetId: "", range: "S" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/spreadsheetId is required/);
  });
});
