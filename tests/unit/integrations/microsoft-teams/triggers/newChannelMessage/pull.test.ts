/**
 * @jest-environment node
 */
const mockRefreshAndRetry = jest.fn();
const mockChannelMessageGet = jest.fn();
const mockGetActiveForExecution = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-teams/api/channelMessageGet", () => ({
  channelMessageGet: (...args: unknown[]) => mockChannelMessageGet(...args),
}));

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) =>
    mockGetActiveForExecution(...args),
}));

jest.mock("@/integrations/_shared/microsoft/api/errors", () => {
  class NotFoundError extends Error {
    readonly resource: string;
    constructor(resource: string) {
      super(`resource '${resource}' not found`);
      this.resource = resource;
      this.name = "NotFoundError";
    }
  }
  return { NotFoundError };
});

import { pull } from "@/integrations/microsoft-teams/triggers/newChannelMessage/pull";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockChannelMessageGet.mockReset();
  mockGetActiveForExecution.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockGetActiveForExecution.mockResolvedValue({
    userId: "user-1",
    providerAccountId: "alice@contoso.com",
  });
});

function trigger(config: Record<string, unknown>) {
  return {
    id: "tr-1",
    workflowId: "wf-1",
    workflowAccountId: "acct-1",
    userId: "user-1",
    provider: "microsoft-teams",
    eventType: "new_channel_message",
    nodeId: "n-1",
    config,
    providerAccountId: null,
    registeredAt: "",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

const validConfig = {
  type: "subscription-watch",
  subscriptionId: "sub-1",
  teamId: "team-1",
  channelId: "ch-1",
  clientState: "x",
};

describe("Teams new_channel_message pull (hydration)", () => {
  it("id-fetches the message via Graph and returns one normalized TriggerEvent", async () => {
    mockChannelMessageGet.mockResolvedValueOnce({
      id: "msg-1",
      createdDateTime: "2026-05-10T12:00:00.000Z",
      body: { contentType: "html", content: "hi" },
    });

    const result = await pull(
      trigger(validConfig),
      "msg-1",
      "2026-05-10T12:00:01.000Z",
    );

    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.eventId).toBe("sub-1:msg-1:created");
    expect(result.events[0]!.payload).toMatchObject({
      messageId: "msg-1",
      teamId: "team-1",
      channelId: "ch-1",
    });
    expect(mockChannelMessageGet.mock.calls[0]![0]).toMatchObject({
      teamId: "team-1",
      channelId: "ch-1",
      messageId: "msg-1",
    });
  });

  it("returns zero events on 404 (message deleted between notification + fetch)", async () => {
    mockChannelMessageGet.mockRejectedValueOnce(new NotFoundError("msg-1"));

    const result = await pull(
      trigger(validConfig),
      "msg-1",
      "2026-05-10T12:00:01.000Z",
    );

    expect(result.events).toEqual([]);
  });

  it("returns zero events when integration row is gone", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);

    const result = await pull(
      trigger(validConfig),
      "msg-1",
      "2026-05-10T12:00:01.000Z",
    );

    expect(result.events).toEqual([]);
    expect(mockChannelMessageGet).not.toHaveBeenCalled();
  });

  it("returns zero events when trigger config is missing required fields", async () => {
    const result = await pull(
      trigger({ type: "subscription-watch" }),
      "msg-1",
      "2026-05-10T12:00:01.000Z",
    );

    expect(result.events).toEqual([]);
    expect(mockChannelMessageGet).not.toHaveBeenCalled();
  });

  it("propagates non-404 hydration errors so the route returns 500 → Microsoft retries", async () => {
    mockChannelMessageGet.mockRejectedValueOnce(new Error("HTTP 500"));

    await expect(
      pull(trigger(validConfig), "msg-1", "2026-05-10T12:00:01.000Z"),
    ).rejects.toThrow(/500/);
  });

  it("threads accountId from integration into refreshAndRetry", async () => {
    mockChannelMessageGet.mockResolvedValueOnce({ id: "msg-1" });

    await pull(trigger(validConfig), "msg-1", "2026-05-10T12:00:01.000Z");

    expect(mockRefreshAndRetry.mock.calls[0]![0].accountId).toBe(
      "alice@contoso.com",
    );
    expect(mockRefreshAndRetry.mock.calls[0]![0].provider).toBe(
      "microsoft-teams",
    );
  });
});
