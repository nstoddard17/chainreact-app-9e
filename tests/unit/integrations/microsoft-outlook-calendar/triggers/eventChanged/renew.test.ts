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

import { outlookCalendarEventChangedSubscriptionHandler } from "@/integrations/microsoft-outlook-calendar/triggers/eventChanged/renew";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockRenewSubscription.mockReset();
  mockGetActiveForExecution.mockReset();
  mockUpdateConfig.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

const baseTrigger = {
  id: "tr-1",
  workflowId: "wf-1",
  userId: "user-1",
  provider: "microsoft-outlook-calendar",
  eventType: "event_changed",
  nodeId: "n1",
  config: {
    type: "subscription-watch",
    subscriptionId: "sub-graph-1",
    clientState: "deadbeef",
    resource: "/me/events",
    changeType: "created,updated,deleted",
    expiresAt: "2026-05-09T12:00:00.000Z",
  },
  accountId: "alice@contoso.com",
  registeredAt: "",
  expiresAt: null,
  lastRenewedAt: null,
  createdAt: "",
  updatedAt: "",
};

const baseIntegration = {
  id: "int-1",
  userId: "user-1",
  provider: "microsoft-outlook-calendar",
  providerAccountId: "alice@contoso.com",
  displayName: "alice@contoso.com",
  accessTokenEncrypted: "x",
  refreshTokenEncrypted: "y",
  accessTokenExpiresAt: null,
  scopes: [],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "",
  updatedAt: "",
};

describe("outlookCalendarEventChangedSubscriptionHandler", () => {
  it("identifies itself with id 'microsoft-outlook-calendar:event_changed'", () => {
    expect(outlookCalendarEventChangedSubscriptionHandler.id).toBe(
      "microsoft-outlook-calendar:event_changed",
    );
  });

  it("canHandle matches subscription-watch rows for microsoft-outlook-calendar/event_changed", () => {
    expect(
      outlookCalendarEventChangedSubscriptionHandler.canHandle(baseTrigger),
    ).toBe(true);

    expect(
      outlookCalendarEventChangedSubscriptionHandler.canHandle({
        ...baseTrigger,
        provider: "microsoft-outlook",
      }),
    ).toBe(false);

    expect(
      outlookCalendarEventChangedSubscriptionHandler.canHandle({
        ...baseTrigger,
        eventType: "different",
      }),
    ).toBe(false);

    expect(
      outlookCalendarEventChangedSubscriptionHandler.canHandle({
        ...baseTrigger,
        config: { ...baseTrigger.config, type: "polling" },
      }),
    ).toBe(false);
  });

  it("declares 1h renewal threshold (60 * 60 * 1000 ms)", () => {
    expect(
      outlookCalendarEventChangedSubscriptionHandler.getRenewalThresholdMs(),
    ).toBe(60 * 60 * 1000);
  });

  it("PATCHes the subscription with a fresh +4230-minute expiration", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockRenewSubscription.mockResolvedValueOnce({
      id: "sub-graph-1",
      expirationDateTime: "2026-05-15T00:00:00.000Z",
    });

    await outlookCalendarEventChangedSubscriptionHandler.renew({
      trigger: baseTrigger,
    });

    expect(mockRenewSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "tok",
        subscriptionId: "sub-graph-1",
      }),
    );
    const requestedExpiry = Date.parse(
      mockRenewSubscription.mock.calls[0]![0].expirationDateTime,
    );
    const expected = Date.now() + 4230 * 60 * 1000;
    expect(Math.abs(requestedExpiry - expected)).toBeLessThan(60_000);
  });

  it("persists Graph's authoritative new expiresAt back to config (preserves clientState + subscriptionId + changeType)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockRenewSubscription.mockResolvedValueOnce({
      id: "sub-graph-1",
      expirationDateTime: "2026-05-15T00:00:00.000Z",
    });

    await outlookCalendarEventChangedSubscriptionHandler.renew({
      trigger: baseTrigger,
    });

    expect(mockUpdateConfig).toHaveBeenCalledWith("tr-1", {
      type: "subscription-watch",
      subscriptionId: "sub-graph-1",
      clientState: "deadbeef",
      resource: "/me/events",
      changeType: "created,updated,deleted",
      expiresAt: "2026-05-15T00:00:00.000Z",
    });
  });

  it("threads microsoft-outlook-calendar provider through refreshAndRetry (NOT mail)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockRenewSubscription.mockResolvedValueOnce({
      id: "sub-graph-1",
      expirationDateTime: "2026-05-15T00:00:00.000Z",
    });

    await outlookCalendarEventChangedSubscriptionHandler.renew({
      trigger: baseTrigger,
    });

    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "microsoft-outlook-calendar",
      }),
    );
  });

  it("throws when subscriptionId is missing from config (partial activate state)", async () => {
    await expect(
      outlookCalendarEventChangedSubscriptionHandler.renew({
        trigger: {
          ...baseTrigger,
          config: { ...baseTrigger.config, subscriptionId: undefined },
        },
      }),
    ).rejects.toThrow(/missing subscriptionId/);
  });

  it("throws when no active integration row exists (user disconnected)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);

    await expect(
      outlookCalendarEventChangedSubscriptionHandler.renew({
        trigger: baseTrigger,
      }),
    ).rejects.toThrow(/no active integration/);
  });

  it("propagates renewSubscription errors (runRenewals counts as error and skips persistence)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockRenewSubscription.mockRejectedValueOnce(
      new Error("Microsoft Graph subscriptions PATCH failed: HTTP 410"),
    );

    await expect(
      outlookCalendarEventChangedSubscriptionHandler.renew({
        trigger: baseTrigger,
      }),
    ).rejects.toThrow(/HTTP 410/);
    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });
});
