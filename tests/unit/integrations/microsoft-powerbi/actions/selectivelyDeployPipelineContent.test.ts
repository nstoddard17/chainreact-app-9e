/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockDeploySelective = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock(
  "@/integrations/microsoft-powerbi/api/pipelines/pipelineDeploySelective",
  () => ({
    pipelineDeploySelective: (...args: unknown[]) =>
      mockDeploySelective(...args),
  }),
);

import { selectivelyDeployPipelineContent } from "@/integrations/microsoft-powerbi/actions/pipelines/selectivelyDeployPipelineContent";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockDeploySelective.mockReset();
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

const validConfig = {
  pipelineId: "pipe-1",
  sourceStageOrder: "0",
  semanticModelIds: ["ds-1", "ds-2"],
  allowCreateArtifact: true,
  allowOverwriteArtifact: true,
};

describe("selectively_deploy_pipeline_content action", () => {
  it("deploys the selected items and returns the operation id", async () => {
    mockDeploySelective.mockResolvedValueOnce({
      operationId: "op-1",
      status: "NotStarted",
    });

    const result = await selectivelyDeployPipelineContent(
      baseInput({ ...validConfig, reportIds: ["rep-1"] }),
    );

    const call = mockDeploySelective.mock.calls[0]![0];
    expect(call.pipelineId).toBe("pipe-1");
    expect(call.sourceStageOrder).toBe(0);
    expect(call.semanticModelIds).toEqual(["ds-1", "ds-2"]);
    expect(call.reportIds).toEqual(["rep-1"]);
    expect(call.dashboardIds).toBeUndefined();
    expect(call.dataflowIds).toBeUndefined();
    expect(call.options).toEqual({
      allowCreateArtifact: true,
      allowOverwriteArtifact: true,
      allowPurgeData: undefined,
    });
    expect(result.output).toEqual({ operationId: "op-1", status: "NotStarted" });
  });

  it("accepts a selection carried by any single one of the four arrays", async () => {
    mockDeploySelective.mockResolvedValueOnce({ operationId: "op-2", status: null });
    await selectivelyDeployPipelineContent(
      baseInput({
        pipelineId: "pipe-1",
        sourceStageOrder: "0",
        dataflowIds: ["df-1"],
        allowCreateArtifact: false,
        allowOverwriteArtifact: true,
      }),
    );
    expect(mockDeploySelective.mock.calls[0]![0].dataflowIds).toEqual(["df-1"]);
  });

  it("rejects when no ids are selected across the four arrays (refinement)", async () => {
    await expect(
      selectivelyDeployPipelineContent(
        baseInput({
          pipelineId: "pipe-1",
          sourceStageOrder: "0",
          semanticModelIds: [],
          allowCreateArtifact: true,
          allowOverwriteArtifact: true,
        }),
      ),
    ).rejects.toThrow(/at least one/i);
    expect(mockDeploySelective).not.toHaveBeenCalled();
  });

  it("rejects missing allowOverwriteArtifact (Q11 — no hidden default)", async () => {
    await expect(
      selectivelyDeployPipelineContent(
        baseInput({
          pipelineId: "pipe-1",
          sourceStageOrder: "0",
          reportIds: ["rep-1"],
          allowCreateArtifact: true,
        }),
      ),
    ).rejects.toThrow();
    expect(mockDeploySelective).not.toHaveBeenCalled();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      selectivelyDeployPipelineContent(
        baseInput({ ...validConfig, datasets: [{ sourceId: "raw-wire" }] }),
      ),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    mockDeploySelective.mockResolvedValueOnce({ operationId: "op-3", status: null });
    await selectivelyDeployPipelineContent({
      ...baseInput(validConfig),
      triggerEvent: trigger("microsoft-powerbi"),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("propagates provider failures to the engine (no synthetic envelope)", async () => {
    mockDeploySelective.mockRejectedValueOnce(
      new Error("Power BI pipeline selective deploy POST failed: ItemNotFound"),
    );
    await expect(
      selectivelyDeployPipelineContent(baseInput(validConfig)),
    ).rejects.toThrow(/ItemNotFound/);
  });

  it("never leaks the access token into the output", async () => {
    mockDeploySelective.mockResolvedValueOnce({ operationId: "op-4", status: null });
    const result = await selectivelyDeployPipelineContent(
      baseInput(validConfig),
    );
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
