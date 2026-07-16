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

jest.mock("@/integrations/microsoft-powerbi/api/datasets/refreshesCreate", () => ({
  refreshesCreate: (...args: unknown[]) => mockCreate(...args),
}));

import { refreshSemanticModel } from "@/integrations/microsoft-powerbi/actions/semantic_models/refreshSemanticModel";

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
    providerAccountId: provider === "microsoft-powerbi" ? "alice@contoso.com" : "",
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

describe("refresh_semantic_model action", () => {
  it("starts a standard refresh and returns the request id", async () => {
    mockCreate.mockResolvedValueOnce({ refreshRequestId: "req-123" });

    const result = await refreshSemanticModel(
      baseInput({
        workspaceId: "ws-1",
        semanticModelId: "ds-1",
        notifyOption: "NoNotification",
      }),
    );

    const call = mockCreate.mock.calls[0]![0];
    expect(call.groupId).toBe("ws-1");
    expect(call.datasetId).toBe("ds-1");
    expect(call.notifyOption).toBe("NoNotification");
    expect(call.enhanced).toBeUndefined();
    expect(result.output).toEqual({
      refreshRequestId: "req-123",
      workspaceId: "ws-1",
      semanticModelId: "ds-1",
      enhanced: false,
    });
  });

  it("sends enhanced options only when an enhanced field is set", async () => {
    mockCreate.mockResolvedValueOnce({ refreshRequestId: "req-9" });

    const result = await refreshSemanticModel(
      baseInput({
        workspaceId: "ws-1",
        semanticModelId: "ds-1",
        notifyOption: "MailOnFailure",
        refreshType: "full",
        maxParallelism: 4,
      }),
    );

    const call = mockCreate.mock.calls[0]![0];
    expect(call.enhanced).toEqual({
      type: "full",
      commitMode: undefined,
      maxParallelism: 4,
      retryCount: undefined,
      applyRefreshPolicy: undefined,
    });
    expect(result.output.enhanced).toBe(true);
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    mockCreate.mockResolvedValueOnce({ refreshRequestId: null });

    await refreshSemanticModel({
      ...baseInput({
        workspaceId: "ws-1",
        semanticModelId: "ds-1",
        notifyOption: "NoNotification",
      }),
      triggerEvent: trigger("microsoft-powerbi"),
    });

    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("rejects a missing notifyOption (Q11 — no hidden default)", async () => {
    await expect(
      refreshSemanticModel(
        baseInput({ workspaceId: "ws-1", semanticModelId: "ds-1" }),
      ),
    ).rejects.toThrow();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      refreshSemanticModel(
        baseInput({
          workspaceId: "ws-1",
          semanticModelId: "ds-1",
          notifyOption: "NoNotification",
          datasetId: "raw-wire-field",
        }),
      ),
    ).rejects.toThrow();
  });

  it("propagates provider failures to the engine (no synthetic envelope)", async () => {
    mockCreate.mockRejectedValueOnce(
      new Error("Power BI dataset refresh POST failed: Invalid dataset refresh request"),
    );
    await expect(
      refreshSemanticModel(
        baseInput({
          workspaceId: "ws-1",
          semanticModelId: "ds-1",
          notifyOption: "NoNotification",
        }),
      ),
    ).rejects.toThrow(/Invalid dataset refresh request/);
  });

  it("never leaks the access token into the output", async () => {
    mockCreate.mockResolvedValueOnce({ refreshRequestId: "req-1" });
    const result = await refreshSemanticModel(
      baseInput({
        workspaceId: "ws-1",
        semanticModelId: "ds-1",
        notifyOption: "NoNotification",
      }),
    );
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
