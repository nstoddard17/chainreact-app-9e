/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockCancel = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock(
  "@/integrations/microsoft-powerbi/api/dataflows/dataflowTransactionCancel",
  () => ({
    dataflowTransactionCancel: (...args: unknown[]) => mockCancel(...args),
  }),
);

import { cancelDataflowRefresh } from "@/integrations/microsoft-powerbi/actions/dataflows/cancelDataflowRefresh";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockCancel.mockReset();
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

const TXN = "2026-07-15T10:00:00.00Z@guid$1";

describe("cancel_dataflow_refresh action", () => {
  it("cancels the transaction (transaction-keyed URL — no dataflowId sent) and returns the state", async () => {
    mockCancel.mockResolvedValueOnce({
      transactionId: TXN,
      status: "SuccessfullyMarked",
    });

    const result = await cancelDataflowRefresh(
      baseInput({
        workspaceId: "ws-1",
        dataflowId: "df-1",
        transactionId: TXN,
      }),
    );

    const call = mockCancel.mock.calls[0]![0];
    expect(call.groupId).toBe("ws-1");
    expect(call.transactionId).toBe(TXN);
    // dataflowId exists only for the picker cascade — not in the wrapper call.
    expect(call.dataflowId).toBeUndefined();
    expect(result.output).toEqual({
      transactionId: TXN,
      state: "SuccessfullyMarked",
    });
  });

  it("echoes the config transactionId and null state when the response omits them", async () => {
    mockCancel.mockResolvedValueOnce({ transactionId: null, status: null });

    const result = await cancelDataflowRefresh(
      baseInput({
        workspaceId: "ws-1",
        dataflowId: "df-1",
        transactionId: TXN,
      }),
    );
    expect(result.output).toEqual({ transactionId: TXN, state: null });
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    mockCancel.mockResolvedValueOnce({
      transactionId: TXN,
      status: "alreadyConcluded",
    });

    await cancelDataflowRefresh({
      ...baseInput({
        workspaceId: "ws-1",
        dataflowId: "df-1",
        transactionId: TXN,
      }),
      triggerEvent: trigger("microsoft-powerbi"),
    });

    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("rejects a missing transactionId", async () => {
    await expect(
      cancelDataflowRefresh(
        baseInput({ workspaceId: "ws-1", dataflowId: "df-1" }),
      ),
    ).rejects.toThrow();
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      cancelDataflowRefresh(
        baseInput({
          workspaceId: "ws-1",
          dataflowId: "df-1",
          transactionId: TXN,
          force: true,
        }),
      ),
    ).rejects.toThrow();
  });

  it("propagates provider failures to the engine", async () => {
    mockCancel.mockRejectedValueOnce(
      new Error("Power BI dataflow transaction cancel POST failed: HTTP 400"),
    );
    await expect(
      cancelDataflowRefresh(
        baseInput({
          workspaceId: "ws-1",
          dataflowId: "df-1",
          transactionId: TXN,
        }),
      ),
    ).rejects.toThrow(/HTTP 400/);
  });

  it("never leaks the access token into the output", async () => {
    mockCancel.mockResolvedValueOnce({
      transactionId: TXN,
      status: "SuccessfullyMarked",
    });
    const result = await cancelDataflowRefresh(
      baseInput({
        workspaceId: "ws-1",
        dataflowId: "df-1",
        transactionId: TXN,
      }),
    );
    expect(JSON.stringify(result.output)).not.toContain('"tok"');
  });
});
