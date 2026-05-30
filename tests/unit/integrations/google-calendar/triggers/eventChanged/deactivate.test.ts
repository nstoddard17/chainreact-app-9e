/**
 * @jest-environment node
 */
const mockRefreshAndRetry = jest.fn();
const mockChannelsStop = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/google-calendar/api/channelsStop", () => ({
  channelsStop: (...args: unknown[]) => mockChannelsStop(...args),
}));

import { NotFoundError } from "@/integrations/google-calendar/api/errors";
import { deactivate } from "@/integrations/google-calendar/triggers/eventChanged/deactivate";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockChannelsStop.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

const baseTrigger = {
  id: "tr-1",
  workflowId: "wf-1",
  workflowAccountId: "acct-1",
  userId: "user-1",
  provider: "google-calendar",
  eventType: "event_changed",
  nodeId: "n1",
  config: {
    type: "subscription-watch",
    channelId: "channel-1",
    resourceId: "res-1",
  },
  providerAccountId: null,
  registeredAt: "",
  expiresAt: null,
  lastRenewedAt: null,
  createdAt: "",
  updatedAt: "",
};

const baseIntegration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "google-calendar",
  providerAccountId: "alice@example.com",
  displayName: "alice@example.com",
  accessTokenEncrypted: "x",
  refreshTokenEncrypted: "y",
  accessTokenExpiresAt: null,
  scopes: [],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "",
  updatedAt: "",
};

describe("Calendar event_changed deactivate", () => {
  it("calls channels.stop with the stored channelId and resourceId", async () => {
    mockChannelsStop.mockResolvedValueOnce(undefined);

    await deactivate({ trigger: baseTrigger, integration: baseIntegration });

    expect(mockChannelsStop).toHaveBeenCalledTimes(1);
    expect(mockChannelsStop.mock.calls[0]![0]).toEqual({
      accessToken: "tok",
      channelId: "channel-1",
      resourceId: "res-1",
    });
  });

  it("swallows NotFoundError (channel already stopped)", async () => {
    mockChannelsStop.mockRejectedValueOnce(new NotFoundError("channel channel-1"));

    await expect(
      deactivate({ trigger: baseTrigger, integration: baseIntegration }),
    ).resolves.toBeUndefined();
  });

  it("propagates non-404 errors so lifecycle.ts can log them", async () => {
    mockChannelsStop.mockRejectedValueOnce(new Error("HTTP 503"));

    await expect(
      deactivate({ trigger: baseTrigger, integration: baseIntegration }),
    ).rejects.toThrow(/HTTP 503/);
  });

  it("is a no-op when config.type is not subscription-watch", async () => {
    const t = { ...baseTrigger, config: { ...baseTrigger.config, type: "something-else" } };
    await deactivate({ trigger: t, integration: baseIntegration });
    expect(mockChannelsStop).not.toHaveBeenCalled();
  });

  it("is a no-op when channelId or resourceId is missing", async () => {
    const t = { ...baseTrigger, config: { type: "subscription-watch" } };
    await deactivate({ trigger: t, integration: baseIntegration });
    expect(mockChannelsStop).not.toHaveBeenCalled();
  });
});
