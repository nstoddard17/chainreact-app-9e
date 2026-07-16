/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockUpdate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock(
  "@/integrations/microsoft-powerbi/api/dataflows/dataflowRefreshScheduleUpdate",
  () => ({
    dataflowRefreshScheduleUpdate: (...args: unknown[]) =>
      mockUpdate(...args),
  }),
);

import { updateDataflowRefreshSchedule } from "@/integrations/microsoft-powerbi/actions/dataflows/updateDataflowRefreshSchedule";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUpdate.mockReset();
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

describe("update_dataflow_refresh_schedule action", () => {
  it("sends only the provided fields (PATCH semantics) and echoes the dataflow id", async () => {
    mockUpdate.mockResolvedValueOnce(undefined);

    const result = await updateDataflowRefreshSchedule(
      baseInput({
        workspaceId: "ws-1",
        dataflowId: "df-1",
        enabled: true,
        notifyOption: "MailOnFailure",
      }),
    );

    const call = mockUpdate.mock.calls[0]![0];
    expect(call.groupId).toBe("ws-1");
    expect(call.dataflowId).toBe("df-1");
    expect(call.enabled).toBe(true);
    expect(call.notifyOption).toBe("MailOnFailure");
    expect(call.days).toBeUndefined();
    expect(call.times).toBeUndefined();
    expect(call.localTimeZoneId).toBeUndefined();
    expect(result.output).toEqual({ updated: true, dataflowId: "df-1" });
  });

  it("forwards days / times / localTimeZoneId when provided", async () => {
    mockUpdate.mockResolvedValueOnce(undefined);

    await updateDataflowRefreshSchedule(
      baseInput({
        workspaceId: "ws-1",
        dataflowId: "df-1",
        enabled: true,
        notifyOption: "NoNotification",
        days: ["Monday", "Thursday"],
        times: ["03:00", "14:30"],
        localTimeZoneId: "Pacific Standard Time",
      }),
    );

    const call = mockUpdate.mock.calls[0]![0];
    expect(call.days).toEqual(["Monday", "Thursday"]);
    expect(call.times).toEqual(["03:00", "14:30"]);
    expect(call.localTimeZoneId).toBe("Pacific Standard Time");
  });

  it("rejects a missing enabled / notifyOption (Q11 — no hidden defaults)", async () => {
    await expect(
      updateDataflowRefreshSchedule(
        baseInput({
          workspaceId: "ws-1",
          dataflowId: "df-1",
          notifyOption: "NoNotification",
        }),
      ),
    ).rejects.toThrow();
    await expect(
      updateDataflowRefreshSchedule(
        baseInput({ workspaceId: "ws-1", dataflowId: "df-1", enabled: true }),
      ),
    ).rejects.toThrow();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects malformed times and invalid days", async () => {
    await expect(
      updateDataflowRefreshSchedule(
        baseInput({
          workspaceId: "ws-1",
          dataflowId: "df-1",
          enabled: true,
          notifyOption: "NoNotification",
          times: ["25:00"],
        }),
      ),
    ).rejects.toThrow();
    await expect(
      updateDataflowRefreshSchedule(
        baseInput({
          workspaceId: "ws-1",
          dataflowId: "df-1",
          enabled: true,
          notifyOption: "NoNotification",
          days: ["Funday"],
        }),
      ),
    ).rejects.toThrow();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects MailOnCompletion (not supported for dataflow schedules)", async () => {
    await expect(
      updateDataflowRefreshSchedule(
        baseInput({
          workspaceId: "ws-1",
          dataflowId: "df-1",
          enabled: true,
          notifyOption: "MailOnCompletion",
        }),
      ),
    ).rejects.toThrow();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      updateDataflowRefreshSchedule(
        baseInput({
          workspaceId: "ws-1",
          dataflowId: "df-1",
          enabled: true,
          notifyOption: "NoNotification",
          value: { enabled: true },
        }),
      ),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    mockUpdate.mockResolvedValueOnce(undefined);

    await updateDataflowRefreshSchedule({
      ...baseInput({
        workspaceId: "ws-1",
        dataflowId: "df-1",
        enabled: false,
        notifyOption: "NoNotification",
      }),
      triggerEvent: trigger("microsoft-powerbi"),
    });

    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("propagates provider failures to the engine", async () => {
    mockUpdate.mockRejectedValueOnce(
      new Error("Power BI dataflow refresh schedule PATCH failed: HTTP 400"),
    );
    await expect(
      updateDataflowRefreshSchedule(
        baseInput({
          workspaceId: "ws-1",
          dataflowId: "df-1",
          enabled: true,
          notifyOption: "NoNotification",
        }),
      ),
    ).rejects.toThrow(/HTTP 400/);
  });

  it("never leaks the access token into the output", async () => {
    mockUpdate.mockResolvedValueOnce(undefined);
    const result = await updateDataflowRefreshSchedule(
      baseInput({
        workspaceId: "ws-1",
        dataflowId: "df-1",
        enabled: true,
        notifyOption: "NoNotification",
      }),
    );
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
