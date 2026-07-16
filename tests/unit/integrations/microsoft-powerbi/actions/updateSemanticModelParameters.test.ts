/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockUpdate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock(
  "@/integrations/microsoft-powerbi/api/datasets/parametersUpdate",
  () => ({
    parametersUpdate: (...args: unknown[]) => mockUpdate(...args),
  }),
);

import { updateSemanticModelParameters } from "@/integrations/microsoft-powerbi/actions/semantic_models/updateSemanticModelParameters";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUpdate.mockReset();
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
  parameters: [
    { name: "ServerName", newValue: "prod-sql" },
    { name: "DatabaseName", newValue: "sales" },
  ],
};

describe("update_semantic_model_parameters action", () => {
  it("updates parameters and reports the count", async () => {
    mockUpdate.mockResolvedValueOnce(undefined);

    const result = await updateSemanticModelParameters(baseInput(validConfig));

    const call = mockUpdate.mock.calls[0]![0];
    expect(call.groupId).toBe("ws-1");
    expect(call.datasetId).toBe("ds-1");
    expect(call.updates).toEqual([
      { name: "ServerName", newValue: "prod-sql" },
      { name: "DatabaseName", newValue: "sales" },
    ]);
    expect(result.output).toEqual({ updated: true, parameterCount: 2 });
  });

  it("rejects an empty parameters list", async () => {
    await expect(
      updateSemanticModelParameters(
        baseInput({ ...validConfig, parameters: [] }),
      ),
    ).rejects.toThrow();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects more than 100 parameters (provider limit)", async () => {
    const parameters = Array.from({ length: 101 }, (_, i) => ({
      name: `P${i}`,
      newValue: "v",
    }));
    await expect(
      updateSemanticModelParameters(baseInput({ ...validConfig, parameters })),
    ).rejects.toThrow();
  });

  it("rejects unknown keys inside a parameter row (.strict())", async () => {
    await expect(
      updateSemanticModelParameters(
        baseInput({
          ...validConfig,
          parameters: [{ name: "P", newValue: "v", currentValue: "leak" }],
        }),
      ),
    ).rejects.toThrow();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      updateSemanticModelParameters(
        baseInput({ ...validConfig, updateDetails: [] }),
      ),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    mockUpdate.mockResolvedValueOnce(undefined);

    await updateSemanticModelParameters({
      ...baseInput(validConfig),
      triggerEvent: trigger("microsoft-powerbi"),
    });

    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("propagates provider failures to the engine (no synthetic envelope)", async () => {
    mockUpdate.mockRejectedValueOnce(
      new Error(
        "Power BI dataset UpdateParameters POST failed: caller is not the dataset owner",
      ),
    );
    await expect(
      updateSemanticModelParameters(baseInput(validConfig)),
    ).rejects.toThrow(/not the dataset owner/);
  });

  it("never leaks the access token into the output", async () => {
    mockUpdate.mockResolvedValueOnce(undefined);
    const result = await updateSemanticModelParameters(baseInput(validConfig));
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
