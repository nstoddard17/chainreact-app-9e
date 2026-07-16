/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockOperationGet = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock(
  "@/integrations/microsoft-powerbi/api/pipelines/pipelineOperationGet",
  () => ({
    pipelineOperationGet: (...args: unknown[]) => mockOperationGet(...args),
  }),
);

import { getPipelineDeploymentStatus } from "@/integrations/microsoft-powerbi/actions/pipelines/getPipelineDeploymentStatus";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockOperationGet.mockReset();
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

describe("get_pipeline_deployment_status action", () => {
  it("returns the fixed operation key set (nullables as null)", async () => {
    mockOperationGet.mockResolvedValueOnce({
      operationId: "op-1",
      status: "Failed",
      executionStartTime: "2026-07-15T10:00:00Z",
      executionEndTime: null,
      sourceStageOrder: 0,
      targetStageOrder: 1,
      errorCode: "DatasetDeploymentFailed",
    });

    const result = await getPipelineDeploymentStatus(
      baseInput({ pipelineId: "pipe-1", operationId: "op-1" }),
    );

    const call = mockOperationGet.mock.calls[0]![0];
    expect(call.pipelineId).toBe("pipe-1");
    expect(call.operationId).toBe("op-1");
    expect(result.output).toEqual({
      status: "Failed",
      executionStartTime: "2026-07-15T10:00:00Z",
      executionEndTime: null,
      sourceStageOrder: 0,
      targetStageOrder: 1,
      errorCode: "DatasetDeploymentFailed",
    });
  });

  it("rejects a missing operationId", async () => {
    await expect(
      getPipelineDeploymentStatus(baseInput({ pipelineId: "pipe-1" })),
    ).rejects.toThrow();
    expect(mockOperationGet).not.toHaveBeenCalled();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      getPipelineDeploymentStatus(
        baseInput({ pipelineId: "pipe-1", operationId: "op-1", expand: "steps" }),
      ),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    mockOperationGet.mockResolvedValueOnce({
      operationId: "op-1",
      status: "Succeeded",
      executionStartTime: null,
      executionEndTime: null,
      sourceStageOrder: null,
      targetStageOrder: null,
      errorCode: null,
    });
    await getPipelineDeploymentStatus({
      ...baseInput({ pipelineId: "pipe-1", operationId: "op-1" }),
      triggerEvent: trigger("microsoft-powerbi"),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("propagates provider failures to the engine (no synthetic envelope)", async () => {
    mockOperationGet.mockRejectedValueOnce(
      new Error("Power BI pipeline operation GET failed: HTTP 500"),
    );
    await expect(
      getPipelineDeploymentStatus(
        baseInput({ pipelineId: "pipe-1", operationId: "op-1" }),
      ),
    ).rejects.toThrow(/HTTP 500/);
  });

  it("never leaks the access token into the output", async () => {
    mockOperationGet.mockResolvedValueOnce({
      operationId: "op-1",
      status: "Executing",
      executionStartTime: null,
      executionEndTime: null,
      sourceStageOrder: null,
      targetStageOrder: null,
      errorCode: null,
    });
    const result = await getPipelineDeploymentStatus(
      baseInput({ pipelineId: "pipe-1", operationId: "op-1" }),
    );
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
