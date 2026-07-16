/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockBind = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-powerbi/api/datasets/bindToGateway", () => ({
  bindToGateway: (...args: unknown[]) => mockBind(...args),
}));

import { bindSemanticModelToGateway } from "@/integrations/microsoft-powerbi/actions/semantic_models/bindSemanticModelToGateway";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockBind.mockReset();
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
  gatewayId: "gw-1",
};

describe("bind_semantic_model_to_gateway action", () => {
  it("binds to the gateway without datasource ids by default", async () => {
    mockBind.mockResolvedValueOnce(undefined);

    const result = await bindSemanticModelToGateway(baseInput(validConfig));

    const call = mockBind.mock.calls[0]![0];
    expect(call.groupId).toBe("ws-1");
    expect(call.datasetId).toBe("ds-1");
    expect(call.gatewayObjectId).toBe("gw-1");
    expect(call.datasourceObjectIds).toBeUndefined();
    expect(result.output).toEqual({ bound: true, gatewayId: "gw-1" });
  });

  it("forwards datasourceObjectIds when provided", async () => {
    mockBind.mockResolvedValueOnce(undefined);

    await bindSemanticModelToGateway(
      baseInput({ ...validConfig, datasourceObjectIds: ["dsrc-1", "dsrc-2"] }),
    );

    expect(mockBind.mock.calls[0]![0].datasourceObjectIds).toEqual([
      "dsrc-1",
      "dsrc-2",
    ]);
  });

  it("rejects a missing gatewayId", async () => {
    await expect(
      bindSemanticModelToGateway(
        baseInput({ workspaceId: "ws-1", semanticModelId: "ds-1" }),
      ),
    ).rejects.toThrow();
    expect(mockBind).not.toHaveBeenCalled();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      bindSemanticModelToGateway(
        baseInput({ ...validConfig, gatewayObjectId: "raw-wire-field" }),
      ),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    mockBind.mockResolvedValueOnce(undefined);

    await bindSemanticModelToGateway({
      ...baseInput(validConfig),
      triggerEvent: trigger("microsoft-powerbi"),
    });

    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("propagates provider failures to the engine (no synthetic envelope)", async () => {
    mockBind.mockRejectedValueOnce(
      new Error("Power BI dataset BindToGateway POST failed: DMTS_MonikerWithUnboundDataSources"),
    );
    await expect(
      bindSemanticModelToGateway(baseInput(validConfig)),
    ).rejects.toThrow(/DMTS_MonikerWithUnboundDataSources/);
  });

  it("never leaks the access token into the output", async () => {
    mockBind.mockResolvedValueOnce(undefined);
    const result = await bindSemanticModelToGateway(baseInput(validConfig));
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
