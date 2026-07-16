/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockRebind = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-powerbi/api/reports/reportRebind", () => ({
  reportRebind: (...args: unknown[]) => mockRebind(...args),
}));

import { rebindReport } from "@/integrations/microsoft-powerbi/actions/reports/rebindReport";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockRebind.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockRebind.mockResolvedValue(undefined);
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

describe("rebind_report action", () => {
  it("rebinds and returns the fixed output set", async () => {
    const result = await rebindReport(
      baseInput({
        workspaceId: "ws-1",
        reportId: "rep-1",
        semanticModelId: "model-2",
      }),
    );

    const call = mockRebind.mock.calls[0]![0];
    expect(call.groupId).toBe("ws-1");
    expect(call.reportId).toBe("rep-1");
    expect(call.datasetId).toBe("model-2");

    expect(result.output).toEqual({
      rebound: true,
      reportId: "rep-1",
      semanticModelId: "model-2",
    });
  });

  it("rejects a missing semanticModelId (Q11 — behavior-switching, required)", async () => {
    await expect(
      rebindReport(baseInput({ workspaceId: "ws-1", reportId: "rep-1" })),
    ).rejects.toThrow();
    expect(mockRebind).not.toHaveBeenCalled();
  });

  it("rejects raw wire-format keys (.strict())", async () => {
    await expect(
      rebindReport(
        baseInput({
          workspaceId: "ws-1",
          reportId: "rep-1",
          semanticModelId: "model-2",
          datasetId: "raw-wire-field",
        }),
      ),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    await rebindReport({
      ...baseInput({
        workspaceId: "ws-1",
        reportId: "rep-1",
        semanticModelId: "model-2",
      }),
      triggerEvent: trigger("microsoft-powerbi"),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("propagates provider failures (e.g. paginated report rejected) to the engine", async () => {
    mockRebind.mockRejectedValueOnce(
      new Error("Power BI report Rebind POST failed: InvalidRequest"),
    );
    await expect(
      rebindReport(
        baseInput({
          workspaceId: "ws-1",
          reportId: "rep-1",
          semanticModelId: "model-2",
        }),
      ),
    ).rejects.toThrow(/InvalidRequest/);
  });

  it("never leaks the access token into the output", async () => {
    const result = await rebindReport(
      baseInput({
        workspaceId: "ws-1",
        reportId: "rep-1",
        semanticModelId: "model-2",
      }),
    );
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
