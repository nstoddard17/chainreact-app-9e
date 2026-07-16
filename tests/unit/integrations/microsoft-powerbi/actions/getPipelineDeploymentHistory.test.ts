/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockOperationsList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock(
  "@/integrations/microsoft-powerbi/api/pipelines/pipelineOperationsList",
  () => ({
    pipelineOperationsList: (...args: unknown[]) =>
      mockOperationsList(...args),
  }),
);

import { getPipelineDeploymentHistory } from "@/integrations/microsoft-powerbi/actions/pipelines/getPipelineDeploymentHistory";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockOperationsList.mockReset();
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

function op(n: number) {
  return {
    operationId: `op-${n}`,
    status: "Succeeded",
    executionStartTime: null,
    executionEndTime: null,
    sourceStageOrder: 0,
    targetStageOrder: 1,
  };
}

describe("get_pipeline_deployment_history action", () => {
  it("returns the operations with the fixed key set and a count", async () => {
    mockOperationsList.mockResolvedValueOnce([op(1), op(2)]);

    const result = await getPipelineDeploymentHistory(
      baseInput({ pipelineId: "pipe-1" }),
    );

    expect(mockOperationsList.mock.calls[0]![0].pipelineId).toBe("pipe-1");
    expect(result.output).toEqual({
      operations: [op(1), op(2)],
      count: 2,
    });
  });

  it("slices client-side to `top` (default 20)", async () => {
    mockOperationsList.mockResolvedValueOnce(
      Array.from({ length: 20 }, (_, i) => op(i)),
    );
    const sliced = await getPipelineDeploymentHistory(
      baseInput({ pipelineId: "pipe-1", top: 3 }),
    );
    expect((sliced.output.operations as unknown[]).length).toBe(3);
    expect(sliced.output.count).toBe(3);

    mockOperationsList.mockResolvedValueOnce(
      Array.from({ length: 20 }, (_, i) => op(i)),
    );
    const defaulted = await getPipelineDeploymentHistory(
      baseInput({ pipelineId: "pipe-1" }),
    );
    expect(defaulted.output.count).toBe(20);
  });

  it("rejects an out-of-range top (numeric bounds 1–100)", async () => {
    await expect(
      getPipelineDeploymentHistory(baseInput({ pipelineId: "pipe-1", top: 0 })),
    ).rejects.toThrow();
    await expect(
      getPipelineDeploymentHistory(
        baseInput({ pipelineId: "pipe-1", top: 101 }),
      ),
    ).rejects.toThrow();
    expect(mockOperationsList).not.toHaveBeenCalled();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      getPipelineDeploymentHistory(
        baseInput({ pipelineId: "pipe-1", skip: 5 }),
      ),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    mockOperationsList.mockResolvedValueOnce([]);
    await getPipelineDeploymentHistory({
      ...baseInput({ pipelineId: "pipe-1" }),
      triggerEvent: trigger("microsoft-powerbi"),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("propagates provider failures to the engine (no synthetic envelope)", async () => {
    mockOperationsList.mockRejectedValueOnce(
      new Error("Power BI pipeline operations GET failed: HTTP 429"),
    );
    await expect(
      getPipelineDeploymentHistory(baseInput({ pipelineId: "pipe-1" })),
    ).rejects.toThrow(/HTTP 429/);
  });

  it("never leaks the access token into the output", async () => {
    mockOperationsList.mockResolvedValueOnce([op(1)]);
    const result = await getPipelineDeploymentHistory(
      baseInput({ pipelineId: "pipe-1" }),
    );
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
