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

jest.mock("@/integrations/microsoft-powerbi/api/datasets/refreshesList", () => ({
  refreshesList: (...args: unknown[]) => mockList(...args),
}));

import { getSemanticModelRefreshHistory } from "@/integrations/microsoft-powerbi/actions/semantic_models/getSemanticModelRefreshHistory";

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
    providerAccountId: provider === "microsoft-powerbi" ? "alice@contoso.com" : "",
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

const entry = {
  refreshRequestId: "req-1",
  refreshType: "ViaEnhancedApi",
  status: "Failed",
  startTime: "2026-07-15T10:00:00Z",
  endTime: "2026-07-15T10:05:00Z",
  errorCode: "ModelRefreshFailed_CredentialsNotSpecified",
};

describe("get_semantic_model_refresh_history action", () => {
  it("returns the bounded history page with count and hasMore", async () => {
    mockList.mockResolvedValueOnce({ refreshes: [entry], hasMore: true });

    const result = await getSemanticModelRefreshHistory(
      baseInput({ workspaceId: "ws-1", semanticModelId: "ds-1", top: 1 }),
    );

    const call = mockList.mock.calls[0]![0];
    expect(call.groupId).toBe("ws-1");
    expect(call.datasetId).toBe("ds-1");
    expect(call.top).toBe(1);
    expect(result.output).toEqual({
      refreshes: [entry],
      count: 1,
      hasMore: true,
    });
  });

  it("passes top=undefined when omitted (wrapper defaults to 20)", async () => {
    mockList.mockResolvedValueOnce({ refreshes: [], hasMore: false });

    const result = await getSemanticModelRefreshHistory(
      baseInput({ workspaceId: "ws-1", semanticModelId: "ds-1" }),
    );

    expect(mockList.mock.calls[0]![0].top).toBeUndefined();
    expect(result.output).toEqual({ refreshes: [], count: 0, hasMore: false });
  });

  it("rejects an out-of-range top (1–100)", async () => {
    await expect(
      getSemanticModelRefreshHistory(
        baseInput({ workspaceId: "ws-1", semanticModelId: "ds-1", top: 101 }),
      ),
    ).rejects.toThrow();
    expect(mockList).not.toHaveBeenCalled();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      getSemanticModelRefreshHistory(
        baseInput({
          workspaceId: "ws-1",
          semanticModelId: "ds-1",
          $top: 5,
        }),
      ),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    mockList.mockResolvedValueOnce({ refreshes: [], hasMore: false });

    await getSemanticModelRefreshHistory({
      ...baseInput({ workspaceId: "ws-1", semanticModelId: "ds-1" }),
      triggerEvent: trigger("microsoft-powerbi"),
    });

    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("propagates provider failures to the engine (no synthetic envelope)", async () => {
    mockList.mockRejectedValueOnce(
      new Error("Power BI dataset refreshes GET failed: HTTP 500"),
    );
    await expect(
      getSemanticModelRefreshHistory(
        baseInput({ workspaceId: "ws-1", semanticModelId: "ds-1" }),
      ),
    ).rejects.toThrow(/HTTP 500/);
  });

  it("never leaks the access token into the output", async () => {
    mockList.mockResolvedValueOnce({ refreshes: [entry], hasMore: false });
    const result = await getSemanticModelRefreshHistory(
      baseInput({ workspaceId: "ws-1", semanticModelId: "ds-1" }),
    );
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
