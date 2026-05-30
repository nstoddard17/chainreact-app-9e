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

import { outlookEmailFlaggedSubscriptionHandler } from "@/integrations/microsoft-outlook/triggers/emailFlagged/renew";

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
  workflowAccountId: "acct-1",
  userId: "user-1",
  provider: "microsoft-outlook",
  eventType: "email_flagged",
  nodeId: "n1",
  config: {
    type: "subscription-watch",
    subscriptionId: "sub-flagged-1",
    clientState: "deadbeef",
    resource: "/me/messages",
    expiresAt: "2026-05-09T12:00:00Z",
  },
  providerAccountId: "alice@contoso.com",
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
  provider: "microsoft-outlook",
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

describe("outlookEmailFlaggedSubscriptionHandler", () => {
  it("identifies itself with id 'microsoft-outlook:email_flagged'", () => {
    expect(outlookEmailFlaggedSubscriptionHandler.id).toBe(
      "microsoft-outlook:email_flagged",
    );
  });

  it("canHandle returns true for email_flagged + subscription-watch", () => {
    expect(
      outlookEmailFlaggedSubscriptionHandler.canHandle(baseTrigger),
    ).toBe(true);
  });

  it("canHandle returns false for other event types", () => {
    expect(
      outlookEmailFlaggedSubscriptionHandler.canHandle({
        ...baseTrigger,
        eventType: "new_email",
      }),
    ).toBe(false);
  });

  it("declares 1h renewal threshold", () => {
    expect(
      outlookEmailFlaggedSubscriptionHandler.getRenewalThresholdMs(),
    ).toBe(60 * 60 * 1000);
  });

  it("PATCHes with fresh +4230-minute expiration", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockRenewSubscription.mockResolvedValueOnce({
      id: "sub-flagged-1",
      expirationDateTime: "2026-05-15T00:00:00Z",
    });

    await outlookEmailFlaggedSubscriptionHandler.renew({
      trigger: baseTrigger,
    });

    expect(mockRenewSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionId: "sub-flagged-1" }),
    );
    const requestedExpiry = Date.parse(
      mockRenewSubscription.mock.calls[0]![0].expirationDateTime,
    );
    const expected = Date.now() + 4230 * 60 * 1000;
    expect(Math.abs(requestedExpiry - expected)).toBeLessThan(60_000);
  });

  it("persists Graph's authoritative new expiresAt", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockRenewSubscription.mockResolvedValueOnce({
      id: "sub-flagged-1",
      expirationDateTime: "2026-05-15T00:00:00Z",
    });

    await outlookEmailFlaggedSubscriptionHandler.renew({
      trigger: baseTrigger,
    });

    expect(mockUpdateConfig).toHaveBeenCalledWith("tr-1", {
      type: "subscription-watch",
      subscriptionId: "sub-flagged-1",
      clientState: "deadbeef",
      resource: "/me/messages",
      expiresAt: "2026-05-15T00:00:00Z",
    });
  });

  it("throws when subscriptionId is missing", async () => {
    await expect(
      outlookEmailFlaggedSubscriptionHandler.renew({
        trigger: {
          ...baseTrigger,
          config: { ...baseTrigger.config, subscriptionId: undefined },
        },
      }),
    ).rejects.toThrow(/missing subscriptionId/);
  });

  it("throws when no active integration row exists", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    await expect(
      outlookEmailFlaggedSubscriptionHandler.renew({ trigger: baseTrigger }),
    ).rejects.toThrow(/no active integration/);
  });

  it("propagates renewSubscription errors", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockRenewSubscription.mockRejectedValueOnce(
      new Error("Microsoft Graph subscriptions PATCH failed: HTTP 410"),
    );
    await expect(
      outlookEmailFlaggedSubscriptionHandler.renew({ trigger: baseTrigger }),
    ).rejects.toThrow(/HTTP 410/);
    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });
});
