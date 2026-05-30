/**
 * @jest-environment node
 */
const mockRefreshAndRetry = jest.fn();
const mockDeleteSubscription = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/microsoft/api/subscriptions", () => ({
  deleteSubscription: (...args: unknown[]) => mockDeleteSubscription(...args),
}));

import { deactivate } from "@/integrations/microsoft-outlook-calendar/triggers/eventChanged/deactivate";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockDeleteSubscription.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

const baseTrigger = {
  id: "tr-1",
  workflowId: "wf-1",
  workflowAccountId: "acct-1",
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

describe("Outlook Calendar event_changed deactivate", () => {
  it("DELETEs the Graph subscription via deleteSubscription wrapper", async () => {
    mockDeleteSubscription.mockResolvedValueOnce(undefined);

    await deactivate({ trigger: baseTrigger, integration: baseIntegration });

    expect(mockDeleteSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "tok",
        subscriptionId: "sub-graph-1",
      }),
    );
  });

  it("threads microsoft-outlook-calendar provider through refreshAndRetry (NOT mail provider)", async () => {
    mockDeleteSubscription.mockResolvedValueOnce(undefined);

    await deactivate({ trigger: baseTrigger, integration: baseIntegration });

    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "microsoft-outlook-calendar",
      }),
    );
  });

  it("no-ops when type is not subscription-watch (defensive)", async () => {
    await deactivate({
      trigger: { ...baseTrigger, config: { type: "polling" } },
      integration: baseIntegration,
    });
    expect(mockDeleteSubscription).not.toHaveBeenCalled();
  });

  it("no-ops when subscriptionId is missing (partial activate state)", async () => {
    await deactivate({
      trigger: {
        ...baseTrigger,
        config: { type: "subscription-watch" },
      },
      integration: baseIntegration,
    });
    expect(mockDeleteSubscription).not.toHaveBeenCalled();
  });

  it("swallows NotFoundError (subscription already gone)", async () => {
    mockDeleteSubscription.mockRejectedValueOnce(new NotFoundError("sub-1"));

    await expect(
      deactivate({ trigger: baseTrigger, integration: baseIntegration }),
    ).resolves.toBeUndefined();
  });

  it("swallows 403 / ErrorAccessDenied (V1 reasoning — Graph auto-cleans on expiry)", async () => {
    mockDeleteSubscription.mockRejectedValueOnce(
      new Error("Microsoft Graph subscriptions DELETE failed: ErrorAccessDenied"),
    );

    await expect(
      deactivate({ trigger: baseTrigger, integration: baseIntegration }),
    ).resolves.toBeUndefined();
  });

  it("propagates other errors (orchestrator catches and continues row deletion)", async () => {
    mockDeleteSubscription.mockRejectedValueOnce(
      new Error("Microsoft Graph subscriptions DELETE failed: HTTP 500"),
    );

    await expect(
      deactivate({ trigger: baseTrigger, integration: baseIntegration }),
    ).rejects.toThrow(/500/);
  });
});
