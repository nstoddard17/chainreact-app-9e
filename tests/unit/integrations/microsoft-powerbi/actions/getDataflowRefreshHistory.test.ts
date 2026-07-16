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

jest.mock(
  "@/integrations/microsoft-powerbi/api/dataflows/dataflowTransactionsList",
  () => ({
    dataflowTransactionsList: (...args: unknown[]) => mockList(...args),
  }),
);

import { getDataflowRefreshHistory } from "@/integrations/microsoft-powerbi/actions/dataflows/getDataflowRefreshHistory";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockList.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(provider = "native"): TriggerEvent {
  return {
    provider,
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-07-15T12:00:00Z",
    providerAccountId:
      provider === "microsoft-powerbi" ? "alice@contoso.com" : "",
    payload: {},
  };
}

function baseInput(config: Record<string, unknown>) {
  return {
    workflowId: "wf",
    userId: "u",
    accountId: "acct-u",
    runId: "r",
    nodeId: "n",
    config,
    triggerEvent: trigger(),
  };
}

describe("get_dataflow_refresh_history action", () => {
  it("lists transactions mapped onto the bounded fixed-key shape + count", async () => {
    mockList.mockResolvedValueOnce({
      transactions: [
        {
          id: "txn-2",
          refreshType: "OnDemand",
          startTime: "2026-07-15T11:00:00Z",
          endTime: null,
          status: "InProgress",
        },
        {
          id: "txn-1",
          refreshType: "Scheduled",
          startTime: "2026-07-15T03:00:00Z",
          endTime: "2026-07-15T03:05:00Z",
          status: "Success",
        },
      ],
      hasMore: false,
    });

    const result = await getDataflowRefreshHistory(
      baseInput({ workspaceId: "ws-1", dataflowId: "df-1" }),
    );

    const call = mockList.mock.calls[0]![0];
    expect(call.groupId).toBe("ws-1");
    expect(call.dataflowId).toBe("df-1");
    expect(call.top).toBeUndefined(); // wrapper owns the default (20)
    expect(result.output).toEqual({
      transactions: [
        {
          transactionId: "txn-2",
          refreshType: "OnDemand",
          startTime: "2026-07-15T11:00:00Z",
          endTime: null,
          status: "InProgress",
        },
        {
          transactionId: "txn-1",
          refreshType: "Scheduled",
          startTime: "2026-07-15T03:00:00Z",
          endTime: "2026-07-15T03:05:00Z",
          status: "Success",
        },
      ],
      count: 2,
    });
  });

  it("forwards top to the wrapper and rejects out-of-range values", async () => {
    mockList.mockResolvedValueOnce({ transactions: [], hasMore: false });
    await getDataflowRefreshHistory(
      baseInput({ workspaceId: "ws-1", dataflowId: "df-1", top: 5 }),
    );
    expect(mockList.mock.calls[0]![0].top).toBe(5);

    await expect(
      getDataflowRefreshHistory(
        baseInput({ workspaceId: "ws-1", dataflowId: "df-1", top: 101 }),
      ),
    ).rejects.toThrow();
    await expect(
      getDataflowRefreshHistory(
        baseInput({ workspaceId: "ws-1", dataflowId: "df-1", top: 0 }),
      ),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    mockList.mockResolvedValueOnce({ transactions: [], hasMore: false });

    await getDataflowRefreshHistory({
      ...baseInput({ workspaceId: "ws-1", dataflowId: "df-1" }),
      triggerEvent: trigger("microsoft-powerbi"),
    });

    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      getDataflowRefreshHistory(
        baseInput({ workspaceId: "ws-1", dataflowId: "df-1", $top: 10 }),
      ),
    ).rejects.toThrow();
    expect(mockList).not.toHaveBeenCalled();
  });

  it("propagates provider failures to the engine", async () => {
    mockList.mockRejectedValueOnce(
      new Error("Power BI resource 'dataflow df-1' not found."),
    );
    await expect(
      getDataflowRefreshHistory(
        baseInput({ workspaceId: "ws-1", dataflowId: "df-1" }),
      ),
    ).rejects.toThrow(/not found/);
  });

  it("never leaks the access token into the output", async () => {
    mockList.mockResolvedValueOnce({ transactions: [], hasMore: false });
    const result = await getDataflowRefreshHistory(
      baseInput({ workspaceId: "ws-1", dataflowId: "df-1" }),
    );
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
