/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockAssign = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock(
  "@/integrations/microsoft-powerbi/api/pipelines/pipelineStageAssignWorkspace",
  () => ({
    pipelineStageAssignWorkspace: (...args: unknown[]) => mockAssign(...args),
  }),
);

import { assignWorkspaceToPipelineStage } from "@/integrations/microsoft-powerbi/actions/pipelines/assignWorkspaceToPipelineStage";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockAssign.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockAssign.mockResolvedValue(undefined);
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
  stageOrder: "2",
  workspaceId: "ws-1",
};

describe("assign_workspace_to_pipeline_stage action", () => {
  it("assigns the workspace and echoes the fixed key set", async () => {
    const result = await assignWorkspaceToPipelineStage(baseInput(validConfig));

    const call = mockAssign.mock.calls[0]![0];
    expect(call.pipelineId).toBe("pipe-1");
    expect(call.stageOrder).toBe(2); // picker string coerced to number
    expect(call.workspaceId).toBe("ws-1");
    expect(result.output).toEqual({
      assigned: true,
      stageOrder: 2,
      workspaceId: "ws-1",
    });
  });

  it("rejects a missing workspaceId", async () => {
    await expect(
      assignWorkspaceToPipelineStage(
        baseInput({ pipelineId: "pipe-1", stageOrder: "0" }),
      ),
    ).rejects.toThrow();
    expect(mockAssign).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric stageOrder", async () => {
    await expect(
      assignWorkspaceToPipelineStage(
        baseInput({ ...validConfig, stageOrder: "prod" }),
      ),
    ).rejects.toThrow();
    expect(mockAssign).not.toHaveBeenCalled();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      assignWorkspaceToPipelineStage(
        baseInput({ ...validConfig, workspaceName: "Marketing" }),
      ),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    await assignWorkspaceToPipelineStage({
      ...baseInput(validConfig),
      triggerEvent: trigger("microsoft-powerbi"),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("propagates provider failures to the engine (no synthetic envelope)", async () => {
    mockAssign.mockRejectedValueOnce(
      new Error(
        "Power BI pipeline stage assignWorkspace POST failed: WorkspaceAlreadyAssigned",
      ),
    );
    await expect(
      assignWorkspaceToPipelineStage(baseInput(validConfig)),
    ).rejects.toThrow(/WorkspaceAlreadyAssigned/);
  });

  it("never leaks the access token into the output", async () => {
    const result = await assignWorkspaceToPipelineStage(baseInput(validConfig));
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
