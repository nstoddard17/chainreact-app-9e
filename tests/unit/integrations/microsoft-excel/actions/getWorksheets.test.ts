/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-excel/api/worksheetsList", () => ({
  worksheetsList: (...args: unknown[]) => mockList(...args),
}));

import { getWorksheets } from "@/integrations/microsoft-excel/actions/getWorksheets";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockList.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(): TriggerEvent {
  return {
    provider: "microsoft-excel",
    eventType: "new_row",
    eventId: "evt-1",
    occurredAt: "2026-05-09T12:00:00Z",
    accountId: "alice@contoso.com",
    payload: {},
  };
}

describe("get_worksheets action", () => {
  it("normalizes the worksheet list and forwards workbookId", async () => {
    mockList.mockResolvedValueOnce([
      { id: "ws-1", name: "Sheet1", position: 0, visibility: "Visible" },
      { id: "ws-2", name: "Sheet2", position: 1 },
    ]);

    const result = await getWorksheets({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { workbookId: "wb-1" },
      triggerEvent: trigger(),
    });

    expect(mockList.mock.calls[0]![0].workbookId).toBe("wb-1");
    expect(result.output.count).toBe(2);
    const sheets = result.output.worksheets as Array<Record<string, unknown>>;
    expect(sheets[0]).toEqual({
      worksheetId: "ws-1",
      name: "Sheet1",
      position: 0,
      visibility: "Visible",
    });
    expect(sheets[1]).toEqual({
      worksheetId: "ws-2",
      name: "Sheet2",
      position: 1,
      visibility: null,
    });
  });

  it("rejects missing workbookId", async () => {
    await expect(
      getWorksheets({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: {},
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});
