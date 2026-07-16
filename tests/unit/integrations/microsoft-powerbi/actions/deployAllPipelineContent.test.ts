/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockDeployAll = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock(
  "@/integrations/microsoft-powerbi/api/pipelines/pipelineDeployAll",
  () => ({
    pipelineDeployAll: (...args: unknown[]) => mockDeployAll(...args),
  }),
);

import { deployAllPipelineContent } from "@/integrations/microsoft-powerbi/actions/pipelines/deployAllPipelineContent";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockDeployAll.mockReset();
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
  sourceStageOrder: "1",
  allowCreateArtifact: true,
  allowOverwriteArtifact: false,
};

describe("deploy_all_pipeline_content action", () => {
  it("starts a deploy-all and returns the operation id", async () => {
    mockDeployAll.mockResolvedValueOnce({
      operationId: "op-1",
      status: "NotStarted",
    });

    const result = await deployAllPipelineContent(baseInput(validConfig));

    const call = mockDeployAll.mock.calls[0]![0];
    expect(call.pipelineId).toBe("pipe-1");
    // picker string value coerced to a number for the wire body
    expect(call.sourceStageOrder).toBe(1);
    expect(call.options).toEqual({
      allowCreateArtifact: true,
      allowOverwriteArtifact: false,
      allowPurgeData: undefined,
    });
    expect(call.isBackwardDeployment).toBeUndefined();
    expect(result.output).toEqual({ operationId: "op-1", status: "NotStarted" });
  });

  it("passes the advanced flags through when set", async () => {
    mockDeployAll.mockResolvedValueOnce({ operationId: "op-2", status: null });

    const result = await deployAllPipelineContent(
      baseInput({
        ...validConfig,
        isBackwardDeployment: true,
        allowPurgeData: true,
      }),
    );

    const call = mockDeployAll.mock.calls[0]![0];
    expect(call.isBackwardDeployment).toBe(true);
    expect(call.options.allowPurgeData).toBe(true);
    expect(result.output.status).toBeNull();
  });

  it("rejects an empty-string sourceStageOrder (never silently stage 0)", async () => {
    await expect(
      deployAllPipelineContent(
        baseInput({ ...validConfig, sourceStageOrder: "" }),
      ),
    ).rejects.toThrow();
    expect(mockDeployAll).not.toHaveBeenCalled();
  });

  it("rejects missing allowCreateArtifact / allowOverwriteArtifact (Q11 — no hidden default)", async () => {
    await expect(
      deployAllPipelineContent(
        baseInput({ pipelineId: "pipe-1", sourceStageOrder: "1" }),
      ),
    ).rejects.toThrow();
    expect(mockDeployAll).not.toHaveBeenCalled();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      deployAllPipelineContent(
        baseInput({ ...validConfig, options: { allowPurgeData: true } }),
      ),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    mockDeployAll.mockResolvedValueOnce({ operationId: "op-3", status: null });
    await deployAllPipelineContent({
      ...baseInput(validConfig),
      triggerEvent: trigger("microsoft-powerbi"),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("propagates provider failures to the engine (no synthetic envelope)", async () => {
    mockDeployAll.mockRejectedValueOnce(
      new Error("Power BI pipeline deployAll POST failed: PipelineDeployInProgress"),
    );
    await expect(
      deployAllPipelineContent(baseInput(validConfig)),
    ).rejects.toThrow(/PipelineDeployInProgress/);
  });

  it("never leaks the access token into the output", async () => {
    mockDeployAll.mockResolvedValueOnce({ operationId: "op-4", status: null });
    const result = await deployAllPipelineContent(baseInput(validConfig));
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
