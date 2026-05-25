/**
 * @jest-environment node
 */
const mockRefreshAndRetry = jest.fn();
const mockEventsWatch = jest.fn();
const mockChannelsStop = jest.fn();
const mockBuildChannelToken = jest.fn();
const mockGetActiveForExecution = jest.fn();
const mockUpdateConfig = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/google-calendar/api/eventsWatch", () => ({
  eventsWatch: (...args: unknown[]) => mockEventsWatch(...args),
}));

jest.mock("@/integrations/google-calendar/api/channelsStop", () => ({
  channelsStop: (...args: unknown[]) => mockChannelsStop(...args),
}));

jest.mock("@/integrations/_shared/google/channelToken", () => ({
  buildChannelToken: (...args: unknown[]) => mockBuildChannelToken(...args),
}));

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));

jest.mock("@/repositories/triggerResources", () => ({
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
}));

import { NotFoundError } from "@/integrations/google-calendar/api/errors";
import { calendarEventChangedSubscriptionHandler } from "@/integrations/google-calendar/triggers/eventChanged/renew";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockEventsWatch.mockReset();
  mockChannelsStop.mockReset();
  mockBuildChannelToken.mockReset();
  mockGetActiveForExecution.mockReset();
  mockUpdateConfig.mockReset();

  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockBuildChannelToken.mockReturnValue("hmac-new");
  mockGetActiveForExecution.mockResolvedValue({
    id: "int-1",
    userId: "user-1",
    provider: "google-calendar",
    providerAccountId: "alice@example.com",
  });
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
});

const baseTrigger = {
  id: "tr-1",
  workflowId: "wf-1",
  userId: "user-1",
  provider: "google-calendar",
  eventType: "event_changed",
  nodeId: "node-trigger",
  config: {
    type: "subscription-watch",
    calendarId: "primary",
    channelId: "channel-old",
    resourceId: "res-old",
    syncToken: "sync-keep",
    expiresAt: "2026-05-15T00:00:00Z",
  },
  accountId: null,
  registeredAt: "",
  expiresAt: null,
  lastRenewedAt: null,
  createdAt: "",
  updatedAt: "",
};

describe("calendarEventChangedSubscriptionHandler", () => {
  it("canHandle accepts a Calendar event_changed subscription-watch row", () => {
    expect(
      calendarEventChangedSubscriptionHandler.canHandle(baseTrigger),
    ).toBe(true);
  });

  it("canHandle rejects rows from other providers", () => {
    expect(
      calendarEventChangedSubscriptionHandler.canHandle({
        ...baseTrigger,
        provider: "gmail",
      }),
    ).toBe(false);
  });

  it("canHandle rejects subscription-watch rows of different eventType", () => {
    expect(
      calendarEventChangedSubscriptionHandler.canHandle({
        ...baseTrigger,
        eventType: "other_type",
      }),
    ).toBe(false);
  });

  it("getRenewalThresholdMs returns 24h", () => {
    expect(calendarEventChangedSubscriptionHandler.getRenewalThresholdMs()).toBe(
      24 * 60 * 60 * 1000,
    );
  });

  it("renew creates new channel, stops old, persists with syncToken untouched", async () => {
    mockEventsWatch.mockResolvedValueOnce({
      id: "channel-new",
      resourceId: "res-new",
      expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    mockChannelsStop.mockResolvedValueOnce(undefined);

    await calendarEventChangedSubscriptionHandler.renew({ trigger: baseTrigger });

    // Watch first
    expect(mockEventsWatch).toHaveBeenCalledTimes(1);
    expect(mockEventsWatch.mock.calls[0]![0].channelToken).toBe("hmac-new");
    expect(mockEventsWatch.mock.calls[0]![0].calendarId).toBe("primary");

    // Then stop old
    expect(mockChannelsStop).toHaveBeenCalledTimes(1);
    expect(mockChannelsStop.mock.calls[0]![0]).toEqual({
      accessToken: "tok",
      channelId: "channel-old",
      resourceId: "res-old",
    });

    // Persist: syncToken unchanged, channelId rotated, expiresAt updated
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    const [id, persisted] = mockUpdateConfig.mock.calls[0]!;
    expect(id).toBe("tr-1");
    expect((persisted as Record<string, unknown>).syncToken).toBe("sync-keep");
    expect((persisted as Record<string, unknown>).resourceId).toBe("res-new");
    expect((persisted as Record<string, unknown>).channelId).not.toBe("channel-old");
  });

  it("swallows old-channel NotFoundError and still persists", async () => {
    mockEventsWatch.mockResolvedValueOnce({
      id: "channel-new",
      resourceId: "res-new",
      expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    mockChannelsStop.mockRejectedValueOnce(new NotFoundError("channel"));

    await calendarEventChangedSubscriptionHandler.renew({ trigger: baseTrigger });

    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
  });

  it("logs (does not throw) when stopping old channel fails for non-404 reasons", async () => {
    mockEventsWatch.mockResolvedValueOnce({
      id: "channel-new",
      resourceId: "res-new",
      expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    mockChannelsStop.mockRejectedValueOnce(new Error("HTTP 503"));
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    await calendarEventChangedSubscriptionHandler.renew({ trigger: baseTrigger });

    expect(warnSpy).toHaveBeenCalled();
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it("throws if no active integration is found", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    await expect(
      calendarEventChangedSubscriptionHandler.renew({ trigger: baseTrigger }),
    ).rejects.toThrow(/no active integration/);
  });
});
