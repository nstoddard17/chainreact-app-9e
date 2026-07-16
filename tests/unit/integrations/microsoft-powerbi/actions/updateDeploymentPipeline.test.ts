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
  "@/integrations/microsoft-powerbi/api/pipelines/pipelineUpdate",
  () => ({
    pipelineUpdate: (...args: unknown[]) => mockUpdate(...args),
  }),
);

import { updateDeploymentPipeline } from "@/integrations/microsoft-powerbi/actions/pipelines/updateDeploymentPipeline";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUpdate.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockUpdate.mockResolvedValue(undefined);
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

describe("update_deployment_pipeline action", () => {
  it("updates the pipeline and echoes the fixed key set", async () => {
    const result = await updateDeploymentPipeline(
      baseInput({ pipelineId: "pipe-1", displayName: "Renamed" }),
    );

    const call = mockUpdate.mock.calls[0]![0];
    expect(call.pipelineId).toBe("pipe-1");
    expect(call.displayName).toBe("Renamed");
    expect(call.description).toBeUndefined();
    expect(result.output).toEqual({ updated: true, pipelineId: "pipe-1" });
  });

  it("accepts a description-only update", async () => {
    await updateDeploymentPipeline(
      baseInput({ pipelineId: "pipe-1", description: "New purpose" }),
    );
    expect(mockUpdate.mock.calls[0]![0].description).toBe("New purpose");
  });

  it("rejects when neither displayName nor description is provided (refinement)", async () => {
    await expect(
      updateDeploymentPipeline(baseInput({ pipelineId: "pipe-1" })),
    ).rejects.toThrow(/name and\/or description/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      updateDeploymentPipeline(
        baseInput({ pipelineId: "pipe-1", displayName: "N", isActive: true }),
      ),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    await updateDeploymentPipeline({
      ...baseInput({ pipelineId: "pipe-1", displayName: "N" }),
      triggerEvent: trigger("microsoft-powerbi"),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("propagates provider failures to the engine (no synthetic envelope)", async () => {
    mockUpdate.mockRejectedValueOnce(
      new Error("Power BI pipeline update PATCH failed: HTTP 401"),
    );
    await expect(
      updateDeploymentPipeline(
        baseInput({ pipelineId: "pipe-1", displayName: "N" }),
      ),
    ).rejects.toThrow(/HTTP 401/);
  });

  it("never leaks the access token into the output", async () => {
    const result = await updateDeploymentPipeline(
      baseInput({ pipelineId: "pipe-1", displayName: "N" }),
    );
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
