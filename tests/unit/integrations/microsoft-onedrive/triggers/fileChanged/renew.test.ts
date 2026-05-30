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

import { onedriveFileChangedSubscriptionHandler } from "@/integrations/microsoft-onedrive/triggers/fileChanged/renew";

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
  provider: "microsoft-onedrive",
  eventType: "file_changed",
  nodeId: "n1",
  config: {
    type: "subscription-watch",
    subscriptionId: "sub-1",
    clientState: "deadbeef",
    resource: "/me/drive/root",
    changeType: "updated",
    deltaToken: "https://graph/x?token=t",
    expiresAt: "2026-05-09T12:00:00.000Z",
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
  provider: "microsoft-onedrive",
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

describe("onedriveFileChangedSubscriptionHandler", () => {
  it("identifies itself with id 'microsoft-onedrive:file_changed'", () => {
    expect(onedriveFileChangedSubscriptionHandler.id).toBe(
      "microsoft-onedrive:file_changed",
    );
  });

  it("canHandle matches subscription-watch rows for microsoft-onedrive/file_changed", () => {
    expect(
      onedriveFileChangedSubscriptionHandler.canHandle(baseTrigger),
    ).toBe(true);
    expect(
      onedriveFileChangedSubscriptionHandler.canHandle({
        ...baseTrigger,
        provider: "microsoft-outlook",
      }),
    ).toBe(false);
    expect(
      onedriveFileChangedSubscriptionHandler.canHandle({
        ...baseTrigger,
        eventType: "different",
      }),
    ).toBe(false);
    expect(
      onedriveFileChangedSubscriptionHandler.canHandle({
        ...baseTrigger,
        config: { ...baseTrigger.config, type: "polling" },
      }),
    ).toBe(false);
  });

  it("declares 1h renewal threshold", () => {
    expect(
      onedriveFileChangedSubscriptionHandler.getRenewalThresholdMs(),
    ).toBe(60 * 60 * 1000);
  });

  it("PATCHes the subscription with a fresh +4230-minute expiration via refreshAndRetry", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockRenewSubscription.mockResolvedValueOnce({
      id: "sub-1",
      expirationDateTime: "2026-05-15T00:00:00.000Z",
    });

    await onedriveFileChangedSubscriptionHandler.renew({ trigger: baseTrigger });

    expect(mockRenewSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "tok",
        subscriptionId: "sub-1",
      }),
    );
    const requestedExpiry = Date.parse(
      mockRenewSubscription.mock.calls[0]![0].expirationDateTime,
    );
    const expected = Date.now() + 4230 * 60 * 1000;
    expect(Math.abs(requestedExpiry - expected)).toBeLessThan(60_000);
  });

  it("persists Graph's authoritative new expiresAt and preserves clientState/subscriptionId/deltaToken", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockRenewSubscription.mockResolvedValueOnce({
      id: "sub-1",
      expirationDateTime: "2026-05-15T00:00:00.000Z",
    });

    await onedriveFileChangedSubscriptionHandler.renew({ trigger: baseTrigger });

    expect(mockUpdateConfig).toHaveBeenCalledWith("tr-1", {
      type: "subscription-watch",
      subscriptionId: "sub-1",
      clientState: "deadbeef",
      resource: "/me/drive/root",
      changeType: "updated",
      deltaToken: "https://graph/x?token=t",
      expiresAt: "2026-05-15T00:00:00.000Z",
    });
  });

  it("threads microsoft-onedrive provider through refreshAndRetry", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockRenewSubscription.mockResolvedValueOnce({
      id: "sub-1",
      expirationDateTime: "2026-05-15T00:00:00.000Z",
    });

    await onedriveFileChangedSubscriptionHandler.renew({ trigger: baseTrigger });

    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "microsoft-onedrive" }),
    );
  });

  it("throws when subscriptionId is missing from config", async () => {
    await expect(
      onedriveFileChangedSubscriptionHandler.renew({
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
      onedriveFileChangedSubscriptionHandler.renew({ trigger: baseTrigger }),
    ).rejects.toThrow(/no active integration/);
  });

  it("propagates renewSubscription errors and skips persistence", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockRenewSubscription.mockRejectedValueOnce(
      new Error("Microsoft Graph subscriptions PATCH failed: HTTP 410"),
    );

    await expect(
      onedriveFileChangedSubscriptionHandler.renew({ trigger: baseTrigger }),
    ).rejects.toThrow(/HTTP 410/);
    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });
});
