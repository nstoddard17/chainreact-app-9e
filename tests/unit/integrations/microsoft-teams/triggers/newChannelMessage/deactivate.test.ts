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

import { deactivate } from "@/integrations/microsoft-teams/triggers/newChannelMessage/deactivate";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockDeleteSubscription.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

const baseIntegration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "microsoft-teams",
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

describe("Teams new_channel_message deactivate", () => {
  it("deletes the Graph subscription", async () => {
    mockDeleteSubscription.mockResolvedValueOnce(undefined);

    await deactivate({
      trigger: trigger({
        type: "subscription-watch",
        subscriptionId: "sub-1",
      }),
      integration: baseIntegration,
    });

    expect(mockDeleteSubscription).toHaveBeenCalledTimes(1);
    expect(mockDeleteSubscription.mock.calls[0]![0].subscriptionId).toBe(
      "sub-1",
    );
  });

  it("swallows NotFoundError (subscription already gone)", async () => {
    mockDeleteSubscription.mockRejectedValueOnce(new NotFoundError("sub-1"));

    await expect(
      deactivate({
        trigger: trigger({
          type: "subscription-watch",
          subscriptionId: "sub-1",
        }),
        integration: baseIntegration,
      }),
    ).resolves.toBeUndefined();
  });

  it("swallows 403 ErrorAccessDenied (token lacks permission)", async () => {
    mockDeleteSubscription.mockRejectedValueOnce(
      new Error("HTTP 403 ErrorAccessDenied"),
    );

    await expect(
      deactivate({
        trigger: trigger({
          type: "subscription-watch",
          subscriptionId: "sub-1",
        }),
        integration: baseIntegration,
      }),
    ).resolves.toBeUndefined();
  });

  it("propagates other errors so orchestrator can decide", async () => {
    mockDeleteSubscription.mockRejectedValueOnce(
      new Error("HTTP 500 internal"),
    );

    await expect(
      deactivate({
        trigger: trigger({
          type: "subscription-watch",
          subscriptionId: "sub-1",
        }),
        integration: baseIntegration,
      }),
    ).rejects.toThrow(/500/);
  });

  it("skips deletion when type is not subscription-watch", async () => {
    await deactivate({
      trigger: trigger({
        type: "polling",
        subscriptionId: "sub-1",
      }),
      integration: baseIntegration,
    });

    expect(mockDeleteSubscription).not.toHaveBeenCalled();
  });

  it("skips deletion when subscriptionId is absent", async () => {
    await deactivate({
      trigger: trigger({ type: "subscription-watch" }),
      integration: baseIntegration,
    });

    expect(mockDeleteSubscription).not.toHaveBeenCalled();
  });
});
