/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockCreate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock(
  "@/integrations/microsoft-powerbi/api/pipelines/pipelineCreate",
  () => ({
    pipelineCreate: (...args: unknown[]) => mockCreate(...args),
  }),
);

import { createDeploymentPipeline } from "@/integrations/microsoft-powerbi/actions/pipelines/createDeploymentPipeline";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockCreate.mockReset();
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

describe("create_deployment_pipeline action", () => {
  it("creates the pipeline and returns id + name", async () => {
    mockCreate.mockResolvedValueOnce({
      pipelineId: "pipe-new",
      displayName: "Sales pipeline",
    });

    const result = await createDeploymentPipeline(
      baseInput({ displayName: "Sales pipeline", description: "Nightly BI" }),
    );

    const call = mockCreate.mock.calls[0]![0];
    expect(call.displayName).toBe("Sales pipeline");
    expect(call.description).toBe("Nightly BI");
    expect(result.output).toEqual({
      pipelineId: "pipe-new",
      displayName: "Sales pipeline",
    });
  });

  it("omits description when unset", async () => {
    mockCreate.mockResolvedValueOnce({ pipelineId: "p", displayName: "N" });
    await createDeploymentPipeline(baseInput({ displayName: "N" }));
    expect(mockCreate.mock.calls[0]![0].description).toBeUndefined();
  });

  it("rejects a missing displayName", async () => {
    await expect(
      createDeploymentPipeline(baseInput({ description: "no name" })),
    ).rejects.toThrow();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects a displayName over 256 characters (provider cap)", async () => {
    await expect(
      createDeploymentPipeline(baseInput({ displayName: "x".repeat(257) })),
    ).rejects.toThrow();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      createDeploymentPipeline(
        baseInput({ displayName: "N", stages: 3 }),
      ),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    mockCreate.mockResolvedValueOnce({ pipelineId: "p", displayName: "N" });
    await createDeploymentPipeline({
      ...baseInput({ displayName: "N" }),
      triggerEvent: trigger("microsoft-powerbi"),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("propagates provider failures to the engine (no synthetic envelope)", async () => {
    mockCreate.mockRejectedValueOnce(
      new Error("Power BI pipeline create POST failed: HTTP 403"),
    );
    await expect(
      createDeploymentPipeline(baseInput({ displayName: "N" })),
    ).rejects.toThrow(/HTTP 403/);
  });

  it("never leaks the access token into the output", async () => {
    mockCreate.mockResolvedValueOnce({ pipelineId: "p", displayName: "N" });
    const result = await createDeploymentPipeline(
      baseInput({ displayName: "N" }),
    );
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
