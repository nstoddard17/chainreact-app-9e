/**
 * @jest-environment node
 */
const mockRefreshAndRetry = jest.fn();
const mockWebhooksDelete = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/airtable/api/webhooks", () => ({
  webhooksCreate: jest.fn(),
  webhooksDelete: (...args: unknown[]) => mockWebhooksDelete(...args),
  webhooksRefresh: jest.fn(),
  webhooksListPayloads: jest.fn(),
}));

import { deactivate } from "@/integrations/airtable/triggers/recordChanged/deactivate";
import { NotFoundError } from "@/integrations/_shared/airtable/errors";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockWebhooksDelete.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

const integration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "airtable",
  providerAccountId: "usrXXX",
  displayName: "alice",
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
    provider: "airtable",
    eventType: "record_changed",
    nodeId: "n-1",
    config,
    providerAccountId: "usrXXX",
    registeredAt: "",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

describe("Airtable record_changed deactivate", () => {
  it("calls webhooksDelete with stored baseId + webhookId", async () => {
    mockWebhooksDelete.mockResolvedValueOnce({});
    await deactivate({
      trigger: trigger({
        type: "subscription-watch",
        baseId: "appBASE",
        webhookId: "achWEBHOOK",
      }),
      integration,
    });
    expect(mockWebhooksDelete).toHaveBeenCalledTimes(1);
    const callArg = mockWebhooksDelete.mock.calls[0]![0];
    expect(callArg.baseId).toBe("appBASE");
    expect(callArg.webhookId).toBe("achWEBHOOK");
  });

  it("swallows NotFoundError (webhook already gone server-side)", async () => {
    mockWebhooksDelete.mockRejectedValueOnce(new NotFoundError("webhook ach"));
    await expect(
      deactivate({
        trigger: trigger({
          type: "subscription-watch",
          baseId: "appBASE",
          webhookId: "achWEBHOOK",
        }),
        integration,
      }),
    ).resolves.toBeUndefined();
  });

  it("swallows 403 (token lacks permission OR webhook owned by different client)", async () => {
    mockWebhooksDelete.mockRejectedValueOnce(
      new Error("Airtable DELETE failed: HTTP 403"),
    );
    await expect(
      deactivate({
        trigger: trigger({
          type: "subscription-watch",
          baseId: "appBASE",
          webhookId: "achWEBHOOK",
        }),
        integration,
      }),
    ).resolves.toBeUndefined();
  });

  it("propagates other errors (network, 5xx) to the lifecycle orchestrator", async () => {
    mockWebhooksDelete.mockRejectedValueOnce(new Error("network ECONNRESET"));
    await expect(
      deactivate({
        trigger: trigger({
          type: "subscription-watch",
          baseId: "appBASE",
          webhookId: "achWEBHOOK",
        }),
        integration,
      }),
    ).rejects.toThrow(/ECONNRESET/);
  });

  it("skips when type is not subscription-watch (defensive)", async () => {
    await deactivate({
      trigger: trigger({ type: "polling" }),
      integration,
    });
    expect(mockWebhooksDelete).not.toHaveBeenCalled();
  });

  it("skips when webhookId or baseId is missing (corrupt row)", async () => {
    await deactivate({
      trigger: trigger({ type: "subscription-watch", baseId: "appBASE" }),
      integration,
    });
    expect(mockWebhooksDelete).not.toHaveBeenCalled();
    await deactivate({
      trigger: trigger({
        type: "subscription-watch",
        webhookId: "achWEBHOOK",
      }),
      integration,
    });
    expect(mockWebhooksDelete).not.toHaveBeenCalled();
  });
});
