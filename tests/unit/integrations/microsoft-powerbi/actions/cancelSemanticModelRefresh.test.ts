/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockDelete = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-powerbi/api/datasets/refreshesDelete", () => ({
  refreshesDelete: (...args: unknown[]) => mockDelete(...args),
}));

import { cancelSemanticModelRefresh } from "@/integrations/microsoft-powerbi/actions/semantic_models/cancelSemanticModelRefresh";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockDelete.mockReset();
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

const validConfig = {
  workspaceId: "ws-1",
  semanticModelId: "ds-1",
  refreshRequestId: "req-123",
};

describe("cancel_semantic_model_refresh action", () => {
  it("cancels the refresh and echoes ids", async () => {
    mockDelete.mockResolvedValueOnce(undefined);

    const result = await cancelSemanticModelRefresh(baseInput(validConfig));

    const call = mockDelete.mock.calls[0]![0];
    expect(call.groupId).toBe("ws-1");
    expect(call.datasetId).toBe("ds-1");
    expect(call.refreshId).toBe("req-123");
    expect(result.output).toEqual({
      canceled: true,
      refreshRequestId: "req-123",
      semanticModelId: "ds-1",
    });
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    mockDelete.mockResolvedValueOnce(undefined);

    await cancelSemanticModelRefresh({
      ...baseInput(validConfig),
      triggerEvent: trigger("microsoft-powerbi"),
    });

    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("rejects a missing refreshRequestId", async () => {
    await expect(
      cancelSemanticModelRefresh(
        baseInput({ workspaceId: "ws-1", semanticModelId: "ds-1" }),
      ),
    ).rejects.toThrow();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      cancelSemanticModelRefresh(
        baseInput({ ...validConfig, datasetId: "raw-wire-field" }),
      ),
    ).rejects.toThrow();
  });

  it("propagates provider failures to the engine (no synthetic envelope)", async () => {
    mockDelete.mockRejectedValueOnce(
      new Error("Power BI dataset refresh DELETE failed: HTTP 400"),
    );
    await expect(
      cancelSemanticModelRefresh(baseInput(validConfig)),
    ).rejects.toThrow(/HTTP 400/);
  });

  it("never leaks the access token into the output", async () => {
    mockDelete.mockResolvedValueOnce(undefined);
    const result = await cancelSemanticModelRefresh(baseInput(validConfig));
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
