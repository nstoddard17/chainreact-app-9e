/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockTakeOver = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-powerbi/api/datasets/takeOver", () => ({
  takeOver: (...args: unknown[]) => mockTakeOver(...args),
}));

import { takeOverSemanticModel } from "@/integrations/microsoft-powerbi/actions/semantic_models/takeOverSemanticModel";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockTakeOver.mockReset();
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

describe("take_over_semantic_model action", () => {
  it("takes over the model and echoes its id", async () => {
    mockTakeOver.mockResolvedValueOnce(undefined);

    const result = await takeOverSemanticModel(baseInput(validConfig));

    const call = mockTakeOver.mock.calls[0]![0];
    expect(call.groupId).toBe("ws-1");
    expect(call.datasetId).toBe("ds-1");
    expect(result.output).toEqual({
      takenOver: true,
      semanticModelId: "ds-1",
    });
  });

  it("rejects a missing semanticModelId", async () => {
    await expect(
      takeOverSemanticModel(baseInput({ workspaceId: "ws-1" })),
    ).rejects.toThrow();
    expect(mockTakeOver).not.toHaveBeenCalled();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      takeOverSemanticModel(
        baseInput({ ...validConfig, datasetId: "raw-wire-field" }),
      ),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    mockTakeOver.mockResolvedValueOnce(undefined);

    await takeOverSemanticModel({
      ...baseInput(validConfig),
      triggerEvent: trigger("microsoft-powerbi"),
    });

    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("propagates provider failures to the engine (no synthetic envelope)", async () => {
    mockTakeOver.mockRejectedValueOnce(
      new Error("Power BI dataset TakeOver POST failed: HTTP 403"),
    );
    await expect(takeOverSemanticModel(baseInput(validConfig))).rejects.toThrow(
      /HTTP 403/,
    );
  });

  it("never leaks the access token into the output", async () => {
    mockTakeOver.mockResolvedValueOnce(undefined);
    const result = await takeOverSemanticModel(baseInput(validConfig));
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
