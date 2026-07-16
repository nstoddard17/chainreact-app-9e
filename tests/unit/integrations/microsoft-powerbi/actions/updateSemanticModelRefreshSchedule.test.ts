/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockPatch = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock(
  "@/integrations/microsoft-powerbi/api/datasets/refreshScheduleUpdate",
  () => ({
    refreshScheduleUpdate: (...args: unknown[]) => mockPatch(...args),
  }),
);

import { updateSemanticModelRefreshSchedule } from "@/integrations/microsoft-powerbi/actions/semantic_models/updateSemanticModelRefreshSchedule";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockPatch.mockReset();
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

const validConfig = {
  workspaceId: "ws-1",
  semanticModelId: "ds-1",
  enabled: true,
  notifyOption: "MailOnFailure",
};

describe("update_semantic_model_refresh_schedule action", () => {
  it("patches the schedule, forwarding optional fields only when provided", async () => {
    mockPatch.mockResolvedValueOnce(undefined);

    const result = await updateSemanticModelRefreshSchedule(
      baseInput({
        ...validConfig,
        days: ["Monday", "Friday"],
        times: ["07:00", "16:30"],
        localTimeZoneId: "Pacific Standard Time",
      }),
    );

    const call = mockPatch.mock.calls[0]![0];
    expect(call.groupId).toBe("ws-1");
    expect(call.datasetId).toBe("ds-1");
    expect(call.enabled).toBe(true);
    expect(call.notifyOption).toBe("MailOnFailure");
    expect(call.days).toEqual(["Monday", "Friday"]);
    expect(call.times).toEqual(["07:00", "16:30"]);
    expect(call.localTimeZoneId).toBe("Pacific Standard Time");
    expect(result.output).toEqual({ updated: true, semanticModelId: "ds-1" });
  });

  it("leaves omitted optional fields undefined (only-provided-fields PATCH)", async () => {
    mockPatch.mockResolvedValueOnce(undefined);

    await updateSemanticModelRefreshSchedule(baseInput(validConfig));

    const call = mockPatch.mock.calls[0]![0];
    expect(call.days).toBeUndefined();
    expect(call.times).toBeUndefined();
    expect(call.localTimeZoneId).toBeUndefined();
  });

  it("rejects a missing enabled / notifyOption (Q11 — no hidden default)", async () => {
    await expect(
      updateSemanticModelRefreshSchedule(
        baseInput({
          workspaceId: "ws-1",
          semanticModelId: "ds-1",
          notifyOption: "NoNotification",
        }),
      ),
    ).rejects.toThrow();
    await expect(
      updateSemanticModelRefreshSchedule(
        baseInput({ workspaceId: "ws-1", semanticModelId: "ds-1", enabled: true }),
      ),
    ).rejects.toThrow();
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("rejects MailOnCompletion (not valid for schedules)", async () => {
    await expect(
      updateSemanticModelRefreshSchedule(
        baseInput({ ...validConfig, notifyOption: "MailOnCompletion" }),
      ),
    ).rejects.toThrow();
  });

  it("rejects malformed times (must be HH:MM)", async () => {
    await expect(
      updateSemanticModelRefreshSchedule(
        baseInput({ ...validConfig, times: ["7am"] }),
      ),
    ).rejects.toThrow();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      updateSemanticModelRefreshSchedule(
        baseInput({ ...validConfig, value: {} }),
      ),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    mockPatch.mockResolvedValueOnce(undefined);

    await updateSemanticModelRefreshSchedule({
      ...baseInput(validConfig),
      triggerEvent: trigger("microsoft-powerbi"),
    });

    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("propagates provider failures to the engine (no synthetic envelope)", async () => {
    mockPatch.mockRejectedValueOnce(
      new Error("Power BI dataset refreshSchedule PATCH failed: HTTP 400"),
    );
    await expect(
      updateSemanticModelRefreshSchedule(baseInput(validConfig)),
    ).rejects.toThrow(/HTTP 400/);
  });

  it("never leaks the access token into the output", async () => {
    mockPatch.mockResolvedValueOnce(undefined);
    const result = await updateSemanticModelRefreshSchedule(
      baseInput(validConfig),
    );
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
