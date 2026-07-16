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

jest.mock(
  "@/integrations/microsoft-powerbi/api/dataflows/dataflowRefreshCreate",
  () => ({
    dataflowRefreshCreate: (...args: unknown[]) => mockCreate(...args),
  }),
);

import { refreshDataflow } from "@/integrations/microsoft-powerbi/actions/dataflows/refreshDataflow";

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

describe("refresh_dataflow action", () => {
  it("starts a refresh and returns started + the dataflow id (no refresh id exists)", async () => {
    mockCreate.mockResolvedValueOnce(undefined);

    const result = await refreshDataflow(
      baseInput({
        workspaceId: "ws-1",
        dataflowId: "df-1",
        notifyOption: "NoNotification",
      }),
    );

    const call = mockCreate.mock.calls[0]![0];
    expect(call.groupId).toBe("ws-1");
    expect(call.dataflowId).toBe("df-1");
    expect(call.notifyOption).toBe("NoNotification");
    expect(result.output).toEqual({ started: true, dataflowId: "df-1" });
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    mockCreate.mockResolvedValueOnce(undefined);

    await refreshDataflow({
      ...baseInput({
        workspaceId: "ws-1",
        dataflowId: "df-1",
        notifyOption: "MailOnFailure",
      }),
      triggerEvent: trigger("microsoft-powerbi"),
    });

    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("rejects a missing notifyOption (Q11 — no hidden default)", async () => {
    await expect(
      refreshDataflow(baseInput({ workspaceId: "ws-1", dataflowId: "df-1" })),
    ).rejects.toThrow();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects MailOnCompletion (not supported for dataflows)", async () => {
    await expect(
      refreshDataflow(
        baseInput({
          workspaceId: "ws-1",
          dataflowId: "df-1",
          notifyOption: "MailOnCompletion",
        }),
      ),
    ).rejects.toThrow();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      refreshDataflow(
        baseInput({
          workspaceId: "ws-1",
          dataflowId: "df-1",
          notifyOption: "NoNotification",
          processType: "default",
        }),
      ),
    ).rejects.toThrow();
  });

  it("propagates provider failures to the engine (no synthetic envelope)", async () => {
    mockCreate.mockRejectedValueOnce(
      new Error("Power BI dataflow refresh POST failed: HTTP 429"),
    );
    await expect(
      refreshDataflow(
        baseInput({
          workspaceId: "ws-1",
          dataflowId: "df-1",
          notifyOption: "NoNotification",
        }),
      ),
    ).rejects.toThrow(/HTTP 429/);
  });

  it("never leaks the access token into the output", async () => {
    mockCreate.mockResolvedValueOnce(undefined);
    const result = await refreshDataflow(
      baseInput({
        workspaceId: "ws-1",
        dataflowId: "df-1",
        notifyOption: "NoNotification",
      }),
    );
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
