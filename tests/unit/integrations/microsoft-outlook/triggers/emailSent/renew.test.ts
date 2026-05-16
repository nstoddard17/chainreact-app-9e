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

import { outlookEmailSentSubscriptionHandler } from "@/integrations/microsoft-outlook/triggers/emailSent/renew";

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
  provider: "microsoft-outlook",
  eventType: "email_sent",
  nodeId: "n1",
  config: {
    type: "subscription-watch",
    subscriptionId: "sub-sent-1",
    clientState: "deadbeef",
    resource: "/me/mailFolders/SentItems/messages",
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

describe("outlookEmailSentSubscriptionHandler", () => {
  it("identifies itself with id 'microsoft-outlook:email_sent'", () => {
    expect(outlookEmailSentSubscriptionHandler.id).toBe(
      "microsoft-outlook:email_sent",
    );
  });

  it("canHandle matches subscription-watch rows for microsoft-outlook/email_sent", () => {
    expect(
      outlookEmailSentSubscriptionHandler.canHandle(baseTrigger),
    ).toBe(true);

    expect(
      outlookEmailSentSubscriptionHandler.canHandle({
        ...baseTrigger,
        eventType: "new_email", // different eventType — DON'T handle
      }),
    ).toBe(false);

    expect(
      outlookEmailSentSubscriptionHandler.canHandle({
        ...baseTrigger,
        provider: "gmail",
      }),
    ).toBe(false);
  });

  it("declares 1h renewal threshold", () => {
    expect(
      outlookEmailSentSubscriptionHandler.getRenewalThresholdMs(),
    ).toBe(60 * 60 * 1000);
  });

  it("PATCHes the subscription with a fresh +4230-minute expiration", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockRenewSubscription.mockResolvedValueOnce({
      id: "sub-sent-1",
      expirationDateTime: "2026-05-15T00:00:00.000Z",
    });

    await outlookEmailSentSubscriptionHandler.renew({ trigger: baseTrigger });

    expect(mockRenewSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionId: "sub-sent-1" }),
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
      id: "sub-sent-1",
      expirationDateTime: "2026-05-15T00:00:00.000Z",
    });

    await outlookEmailSentSubscriptionHandler.renew({ trigger: baseTrigger });

    expect(mockUpdateConfig).toHaveBeenCalledWith("tr-1", {
      type: "subscription-watch",
      subscriptionId: "sub-sent-1",
      clientState: "deadbeef",
      resource: "/me/mailFolders/SentItems/messages",
      expiresAt: "2026-05-15T00:00:00.000Z",
    });
  });

  it("throws when subscriptionId is missing from config", async () => {
    await expect(
      outlookEmailSentSubscriptionHandler.renew({
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
      outlookEmailSentSubscriptionHandler.renew({ trigger: baseTrigger }),
    ).rejects.toThrow(/no active integration/);
  });

  it("propagates renewSubscription errors and skips persistence", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockRenewSubscription.mockRejectedValueOnce(
      new Error("Microsoft Graph subscriptions PATCH failed: HTTP 410"),
    );

    await expect(
      outlookEmailSentSubscriptionHandler.renew({ trigger: baseTrigger }),
    ).rejects.toThrow(/HTTP 410/);
    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });
});
