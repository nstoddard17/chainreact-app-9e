/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockUnassign = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock(
  "@/integrations/microsoft-powerbi/api/pipelines/pipelineStageUnassignWorkspace",
  () => ({
    pipelineStageUnassignWorkspace: (...args: unknown[]) =>
      mockUnassign(...args),
  }),
);

import { unassignWorkspaceFromPipelineStage } from "@/integrations/microsoft-powerbi/actions/pipelines/unassignWorkspaceFromPipelineStage";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUnassign.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockUnassign.mockResolvedValue(undefined);
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

describe("unassign_workspace_from_pipeline_stage action", () => {
  it("unassigns the stage's workspace and echoes the fixed key set", async () => {
    const result = await unassignWorkspaceFromPipelineStage(
      baseInput({ pipelineId: "pipe-1", stageOrder: "1" }),
    );

    const call = mockUnassign.mock.calls[0]![0];
    expect(call.pipelineId).toBe("pipe-1");
    expect(call.stageOrder).toBe(1);
    expect(result.output).toEqual({ unassigned: true, stageOrder: 1 });
  });

  it("rejects a missing stageOrder", async () => {
    await expect(
      unassignWorkspaceFromPipelineStage(baseInput({ pipelineId: "pipe-1" })),
    ).rejects.toThrow();
    expect(mockUnassign).not.toHaveBeenCalled();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      unassignWorkspaceFromPipelineStage(
        baseInput({ pipelineId: "pipe-1", stageOrder: "1", workspaceId: "ws-1" }),
      ),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    await unassignWorkspaceFromPipelineStage({
      ...baseInput({ pipelineId: "pipe-1", stageOrder: "0" }),
      triggerEvent: trigger("microsoft-powerbi"),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("propagates provider failures to the engine (no synthetic envelope)", async () => {
    mockUnassign.mockRejectedValueOnce(
      new Error(
        "Power BI pipeline stage unassignWorkspace POST failed: DeploymentInProgress",
      ),
    );
    await expect(
      unassignWorkspaceFromPipelineStage(
        baseInput({ pipelineId: "pipe-1", stageOrder: "1" }),
      ),
    ).rejects.toThrow(/DeploymentInProgress/);
  });

  it("never leaks the access token into the output", async () => {
    const result = await unassignWorkspaceFromPipelineStage(
      baseInput({ pipelineId: "pipe-1", stageOrder: "1" }),
    );
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
