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

jest.mock("@/integrations/microsoft-excel/api/workbooksList", () => ({
  workbooksList: (...args: unknown[]) => mockList(...args),
}));

import { getWorkbooks } from "@/integrations/microsoft-excel/actions/getWorkbooks";

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

describe("get_workbooks action", () => {
  it("normalizes workbook list with count + hasMore + nextLink", async () => {
    mockList.mockResolvedValueOnce({
      workbooks: [
        {
          id: "wb-1",
          name: "Q1.xlsx",
          webUrl: "https://1drv.ms/q1",
          size: 12345,
          lastModifiedDateTime: "2026-05-08T10:00:00Z",
        },
      ],
      nextLink: "https://graph.microsoft.com/v1.0/...&$skiptoken=abc",
    });

    const result = await getWorkbooks({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger(),
    });

    expect(result.output.count).toBe(1);
    expect(result.output.hasMore).toBe(true);
    expect(result.output.nextLink).toMatch(/skiptoken/);
    const wbs = result.output.workbooks as Array<Record<string, unknown>>;
    expect(wbs[0]).toEqual(
      expect.objectContaining({
        workbookId: "wb-1",
        name: "Q1.xlsx",
        size: 12345,
      }),
    );
  });

  it("forwards top to the wrapper", async () => {
    mockList.mockResolvedValueOnce({ workbooks: [], nextLink: null });

    await getWorkbooks({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { top: 50 },
      triggerEvent: trigger(),
    });

    const call = mockList.mock.calls[0]![0];
    expect(call.top).toBe(50);
  });

  it("returns hasMore: false when nextLink is null", async () => {
    mockList.mockResolvedValueOnce({ workbooks: [], nextLink: null });

    const result = await getWorkbooks({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger(),
    });

    expect(result.output.hasMore).toBe(false);
    expect(result.output.nextLink).toBeNull();
  });

  it("rejects top out of range (Graph 1..1000)", async () => {
    await expect(
      getWorkbooks({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { top: 0 },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();

    await expect(
      getWorkbooks({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { top: 1001 },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});
