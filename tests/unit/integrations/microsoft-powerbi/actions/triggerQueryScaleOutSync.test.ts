/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockSync = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock(
  "@/integrations/microsoft-powerbi/api/datasets/scaleOutSyncTrigger",
  () => ({
    scaleOutSyncTrigger: (...args: unknown[]) => mockSync(...args),
  }),
);

import { triggerQueryScaleOutSync } from "@/integrations/microsoft-powerbi/actions/semantic_models/triggerQueryScaleOutSync";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockSync.mockReset();
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

describe("trigger_query_scale_out_sync action", () => {
  it("triggers the sync and returns the bounded status fields", async () => {
    mockSync.mockResolvedValueOnce({
      commitVersion: 12,
      targetSyncVersion: 12,
      triggerReason: "explicit",
      syncStartTime: "2026-07-15T12:00:00Z",
    });

    const result = await triggerQueryScaleOutSync(baseInput(validConfig));

    const call = mockSync.mock.calls[0]![0];
    expect(call.groupId).toBe("ws-1");
    expect(call.datasetId).toBe("ds-1");
    expect(result.output).toEqual({
      commitVersion: 12,
      targetSyncVersion: 12,
      triggerReason: "explicit",
      syncStartTime: "2026-07-15T12:00:00Z",
    });
  });

  it("passes null status fields through", async () => {
    mockSync.mockResolvedValueOnce({
      commitVersion: null,
      targetSyncVersion: null,
      triggerReason: null,
      syncStartTime: null,
    });

    const result = await triggerQueryScaleOutSync(baseInput(validConfig));
    expect(result.output).toEqual({
      commitVersion: null,
      targetSyncVersion: null,
      triggerReason: null,
      syncStartTime: null,
    });
  });

  it("rejects a missing semanticModelId", async () => {
    await expect(
      triggerQueryScaleOutSync(baseInput({ workspaceId: "ws-1" })),
    ).rejects.toThrow();
    expect(mockSync).not.toHaveBeenCalled();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      triggerQueryScaleOutSync(
        baseInput({ ...validConfig, datasetId: "raw-wire-field" }),
      ),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    mockSync.mockResolvedValueOnce({
      commitVersion: null,
      targetSyncVersion: null,
      triggerReason: null,
      syncStartTime: null,
    });

    await triggerQueryScaleOutSync({
      ...baseInput(validConfig),
      triggerEvent: trigger("microsoft-powerbi"),
    });

    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("propagates provider failures to the engine (no synthetic envelope)", async () => {
    mockSync.mockRejectedValueOnce(
      new Error("Power BI dataset queryScaleOut sync POST failed: HTTP 400"),
    );
    await expect(
      triggerQueryScaleOutSync(baseInput(validConfig)),
    ).rejects.toThrow(/HTTP 400/);
  });

  it("never leaks the access token into the output", async () => {
    mockSync.mockResolvedValueOnce({
      commitVersion: 1,
      targetSyncVersion: 1,
      triggerReason: "explicit",
      syncStartTime: null,
    });
    const result = await triggerQueryScaleOutSync(baseInput(validConfig));
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
