/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockStatus = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock(
  "@/integrations/microsoft-powerbi/api/datasets/scaleOutSyncStatusGet",
  () => ({
    scaleOutSyncStatusGet: (...args: unknown[]) => mockStatus(...args),
  }),
);

import { getQueryScaleOutSyncStatus } from "@/integrations/microsoft-powerbi/actions/semantic_models/getQueryScaleOutSyncStatus";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockStatus.mockReset();
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

const validConfig = { workspaceId: "ws-1", semanticModelId: "ds-1" };

const fullStatus = {
  commitVersion: 15,
  targetSyncVersion: 15,
  minActiveReadVersion: 14,
  triggerReason: "automatic",
  syncStartTime: "2026-07-15T12:00:00Z",
  syncEndTime: "2026-07-15T12:01:00Z",
};

describe("get_query_scale_out_sync_status action", () => {
  it("returns the bounded sync status fields", async () => {
    mockStatus.mockResolvedValueOnce(fullStatus);

    const result = await getQueryScaleOutSyncStatus(baseInput(validConfig));

    const call = mockStatus.mock.calls[0]![0];
    expect(call.groupId).toBe("ws-1");
    expect(call.datasetId).toBe("ds-1");
    expect(result.output).toEqual(fullStatus);
  });

  it("passes null fields through", async () => {
    mockStatus.mockResolvedValueOnce({
      commitVersion: null,
      targetSyncVersion: null,
      minActiveReadVersion: null,
      triggerReason: null,
      syncStartTime: null,
      syncEndTime: null,
    });

    const result = await getQueryScaleOutSyncStatus(baseInput(validConfig));
    expect(result.output.commitVersion).toBeNull();
    expect(result.output.syncEndTime).toBeNull();
  });

  it("rejects a missing semanticModelId", async () => {
    await expect(
      getQueryScaleOutSyncStatus(baseInput({ workspaceId: "ws-1" })),
    ).rejects.toThrow();
    expect(mockStatus).not.toHaveBeenCalled();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      getQueryScaleOutSyncStatus(
        baseInput({ ...validConfig, datasetId: "raw-wire-field" }),
      ),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    mockStatus.mockResolvedValueOnce(fullStatus);

    await getQueryScaleOutSyncStatus({
      ...baseInput(validConfig),
      triggerEvent: trigger("microsoft-powerbi"),
    });

    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("propagates provider failures to the engine (no synthetic envelope)", async () => {
    mockStatus.mockRejectedValueOnce(
      new Error("Power BI dataset queryScaleOut syncStatus GET failed: HTTP 400"),
    );
    await expect(
      getQueryScaleOutSyncStatus(baseInput(validConfig)),
    ).rejects.toThrow(/HTTP 400/);
  });

  it("never leaks the access token into the output", async () => {
    mockStatus.mockResolvedValueOnce(fullStatus);
    const result = await getQueryScaleOutSyncStatus(baseInput(validConfig));
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
