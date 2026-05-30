/**
 * @jest-environment node
 */
const mockRefreshAndRetry = jest.fn();
const mockRenewSubscription = jest.fn();
const mockGetActiveForExecution = jest.fn();
const mockUpdateConfig = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/microsoft/api/subscriptions", () => ({
  renewSubscription: (...args: unknown[]) => mockRenewSubscription(...args),
}));

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) =>
    mockGetActiveForExecution(...args),
}));

jest.mock("@/repositories/triggerResources", () => ({
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
}));

import { teamsNewChannelMessageSubscriptionHandler } from "@/integrations/microsoft-teams/triggers/newChannelMessage/renew";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockRenewSubscription.mockReset();
  mockGetActiveForExecution.mockReset();
  mockUpdateConfig.mockReset();
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

describe("Teams new_channel_message renew handler", () => {
  it("canHandle: matches microsoft-teams + new_channel_message + subscription-watch", () => {
    expect(
      teamsNewChannelMessageSubscriptionHandler.canHandle(
        trigger({ type: "subscription-watch" }),
      ),
    ).toBe(true);
  });

  it("canHandle: rejects other providers", () => {
    expect(
      teamsNewChannelMessageSubscriptionHandler.canHandle({
        ...trigger({ type: "subscription-watch" }),
        provider: "microsoft-onedrive",
      }),
    ).toBe(false);
  });

  it("canHandle: rejects other event types", () => {
    expect(
      teamsNewChannelMessageSubscriptionHandler.canHandle({
        ...trigger({ type: "subscription-watch" }),
        eventType: "new_email",
      }),
    ).toBe(false);
  });

  it("canHandle: rejects non-subscription-watch configs", () => {
    expect(
      teamsNewChannelMessageSubscriptionHandler.canHandle(
        trigger({ type: "polling" }),
      ),
    ).toBe(false);
  });

  it("getRenewalThresholdMs returns 1h (matches Microsoft sibling cadence)", () => {
    expect(
      teamsNewChannelMessageSubscriptionHandler.getRenewalThresholdMs(),
    ).toBe(60 * 60 * 1000);
  });

  it("renews subscription via refreshAndRetry + shared renewSubscription wrapper", async () => {
    mockRenewSubscription.mockResolvedValueOnce({
      id: "sub-1",
      expirationDateTime: "2026-05-15T00:00:00.000Z",
    });

    await teamsNewChannelMessageSubscriptionHandler.renew({
      trigger: trigger({
        type: "subscription-watch",
        subscriptionId: "sub-1",
        clientState: "abc",
        resource: "/teams/team-1/channels/ch-1/messages",
        changeType: "created",
        teamId: "team-1",
        channelId: "ch-1",
      }),
    });

    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(1);
    expect(mockRefreshAndRetry.mock.calls[0]![0].provider).toBe(
      "microsoft-teams",
    );
    expect(mockRenewSubscription).toHaveBeenCalledTimes(1);
    expect(mockRenewSubscription.mock.calls[0]![0].subscriptionId).toBe(
      "sub-1",
    );
  });

  it("persists Graph's authoritative expiresAt + preserves other config fields", async () => {
    mockRenewSubscription.mockResolvedValueOnce({
      id: "sub-1",
      expirationDateTime: "2026-05-15T00:00:00.000Z",
    });

    const original = {
      type: "subscription-watch",
      subscriptionId: "sub-1",
      clientState: "preserved-state",
      resource: "/teams/team-1/channels/ch-1/messages",
      changeType: "created",
      teamId: "team-1",
      channelId: "ch-1",
      webhookEnabled: true,
      expiresAt: "OLD",
    };
    await teamsNewChannelMessageSubscriptionHandler.renew({
      trigger: trigger(original),
    });

    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    const [updatedId, updated] = mockUpdateConfig.mock.calls[0]!;
    expect(updatedId).toBe("tr-1");
    expect(updated).toEqual({
      ...original,
      expiresAt: "2026-05-15T00:00:00.000Z",
    });
  });

  it("throws when subscriptionId is missing in config", async () => {
    await expect(
      teamsNewChannelMessageSubscriptionHandler.renew({
        trigger: trigger({ type: "subscription-watch" }),
      }),
    ).rejects.toThrow(/missing subscriptionId/);
  });

  it("throws when integration row is gone", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);

    await expect(
      teamsNewChannelMessageSubscriptionHandler.renew({
        trigger: trigger({
          type: "subscription-watch",
          subscriptionId: "sub-1",
        }),
      }),
    ).rejects.toThrow(/no active integration/);
  });
});
