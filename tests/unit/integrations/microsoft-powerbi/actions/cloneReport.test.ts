/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockClone = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-powerbi/api/reports/reportClone", () => ({
  reportClone: (...args: unknown[]) => mockClone(...args),
}));

import { cloneReport } from "@/integrations/microsoft-powerbi/actions/reports/cloneReport";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockClone.mockReset();
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

describe("clone_report action", () => {
  it("clones in-place by default and returns the new report identity", async () => {
    mockClone.mockResolvedValueOnce({
      id: "rep-new",
      name: "Q4 Sales (copy)",
      workspaceId: null,
    });

    const result = await cloneReport(
      baseInput({
        workspaceId: "ws-1",
        reportId: "rep-1",
        newReportName: "Q4 Sales (copy)",
      }),
    );

    const call = mockClone.mock.calls[0]![0];
    expect(call.groupId).toBe("ws-1");
    expect(call.reportId).toBe("rep-1");
    expect(call.name).toBe("Q4 Sales (copy)");
    expect(call.targetWorkspaceId).toBeUndefined();
    expect(call.targetModelId).toBeUndefined();

    expect(result.output).toEqual({
      reportId: "rep-new",
      name: "Q4 Sales (copy)",
      workspaceId: null,
    });
  });

  it("sends targetWorkspaceId / targetModelId only when set", async () => {
    mockClone.mockResolvedValueOnce({
      id: "rep-new",
      name: "copy",
      workspaceId: "ws-target",
    });

    const result = await cloneReport(
      baseInput({
        workspaceId: "ws-1",
        reportId: "rep-1",
        newReportName: "copy",
        targetWorkspaceId: "ws-target",
        targetSemanticModelId: "model-9",
      }),
    );

    const call = mockClone.mock.calls[0]![0];
    expect(call.targetWorkspaceId).toBe("ws-target");
    expect(call.targetModelId).toBe("model-9");
    expect(result.output.workspaceId).toBe("ws-target");
  });

  it("rejects a missing newReportName (Q11 — no hidden default)", async () => {
    await expect(
      cloneReport(baseInput({ workspaceId: "ws-1", reportId: "rep-1" })),
    ).rejects.toThrow();
    expect(mockClone).not.toHaveBeenCalled();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      cloneReport(
        baseInput({
          workspaceId: "ws-1",
          reportId: "rep-1",
          newReportName: "copy",
          targetModelId: "raw-wire-field",
        }),
      ),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    mockClone.mockResolvedValueOnce({ id: "rep-new", name: "copy", workspaceId: null });
    await cloneReport({
      ...baseInput({
        workspaceId: "ws-1",
        reportId: "rep-1",
        newReportName: "copy",
      }),
      triggerEvent: trigger("microsoft-powerbi"),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("propagates provider failures to the engine (no synthetic envelope)", async () => {
    mockClone.mockRejectedValueOnce(
      new Error("Power BI report Clone POST failed: PowerBIEntityNotFound"),
    );
    await expect(
      cloneReport(
        baseInput({
          workspaceId: "ws-1",
          reportId: "rep-1",
          newReportName: "copy",
        }),
      ),
    ).rejects.toThrow(/PowerBIEntityNotFound/);
  });

  it("never leaks the access token into the output", async () => {
    mockClone.mockResolvedValueOnce({ id: "rep-new", name: "copy", workspaceId: null });
    const result = await cloneReport(
      baseInput({
        workspaceId: "ws-1",
        reportId: "rep-1",
        newReportName: "copy",
      }),
    );
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
