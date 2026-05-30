/**
 * @jest-environment node
 */
const mockDelete = jest.fn();
const mockDecrypt = jest.fn();

jest.mock("@/integrations/_shared/shopify/api/webhooks", () => ({
  webhooksDelete: (...args: unknown[]) => mockDelete(...args),
  webhooksCreate: jest.fn(),
}));

jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (v: string) => mockDecrypt(v),
}));

// We reuse the shared module's NotFoundError class for the swallow check.
import { NotFoundError } from "@/integrations/_shared/shopify/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { deactivate } from "@/integrations/shopify/triggers/webhookReceived/deactivate";

beforeEach(() => {
  mockDelete.mockReset();
  mockDecrypt.mockReset();
  mockDecrypt.mockImplementation((v: string) => `decrypted-${v}`);
});

const baseIntegration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "shopify",
  providerAccountId: "merchant.myshopify.com",
  displayName: "merchant.myshopify.com",
  accessTokenEncrypted: "ENC-MERCHANT",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: [],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "",
  updatedAt: "",
};

function trigger(
  subscriptions: Array<{ topic: string; webhookId: number }> | undefined,
  shopDomain: string | undefined = "merchant.myshopify.com",
) {
  const config: Record<string, unknown> = {};
  if (subscriptions !== undefined) config.subscriptions = subscriptions;
  if (shopDomain !== undefined) config.shopDomain = shopDomain;
  return {
    id: "tr-1",
    workflowId: "wf-1",
    workflowAccountId: "acct-1",
    userId: "user-1",
    provider: "shopify",
    eventType: "webhook_received",
    nodeId: "node-1",
    config,
    providerAccountId: "merchant.myshopify.com",
    registeredAt: "",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

describe("Shopify webhook_received deactivate — happy path", () => {
  it("deletes each stored webhook subscription", async () => {
    mockDelete.mockResolvedValue(undefined);
    await deactivate({
      trigger: trigger([
        { topic: "orders/create", webhookId: 111 },
        { topic: "customers/create", webhookId: 222 },
      ]),
      integration: baseIntegration,
    });
    expect(mockDelete).toHaveBeenCalledTimes(2);
    expect(mockDelete.mock.calls[0]![0].webhookId).toBe(111);
    expect(mockDelete.mock.calls[1]![0].webhookId).toBe(222);
  });

  it("uses the integration's providerAccountId as shopDomain (canonical source)", async () => {
    mockDelete.mockResolvedValue(undefined);
    await deactivate({
      trigger: trigger([{ topic: "orders/create", webhookId: 1 }]),
      integration: baseIntegration,
    });
    expect(mockDelete.mock.calls[0]![0].shopDomain).toBe(
      "merchant.myshopify.com",
    );
  });

  it("uses the merchant's decrypted access token", async () => {
    mockDelete.mockResolvedValue(undefined);
    await deactivate({
      trigger: trigger([{ topic: "orders/create", webhookId: 1 }]),
      integration: baseIntegration,
    });
    expect(mockDelete.mock.calls[0]![0].accessToken).toBe(
      "decrypted-ENC-MERCHANT",
    );
  });
});

describe("Shopify webhook_received deactivate — best-effort safety", () => {
  it("swallows NotFoundError per webhook (server-side already deleted)", async () => {
    mockDelete
      .mockRejectedValueOnce(new NotFoundError("webhook 111"))
      .mockResolvedValueOnce(undefined);
    await expect(
      deactivate({
        trigger: trigger([
          { topic: "orders/create", webhookId: 111 },
          { topic: "customers/create", webhookId: 222 },
        ]),
        integration: baseIntegration,
      }),
    ).resolves.toBeUndefined();
    // 2 calls: 1st 404'd, 2nd succeeded.
    expect(mockDelete).toHaveBeenCalledTimes(2);
  });

  it("bails on Unauthorized401Error (merchant uninstalled — token revoked, all subsequent calls would 401)", async () => {
    mockDelete.mockRejectedValueOnce(new Unauthorized401Error());
    await expect(
      deactivate({
        trigger: trigger([
          { topic: "orders/create", webhookId: 111 },
          { topic: "customers/create", webhookId: 222 },
        ]),
        integration: baseIntegration,
      }),
    ).resolves.toBeUndefined();
    // Only the FIRST call ran — 401 short-circuits the loop.
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it("propagates non-404 / non-401 errors (e.g. 5xx)", async () => {
    mockDelete.mockRejectedValueOnce(new Error("HTTP 500"));
    await expect(
      deactivate({
        trigger: trigger([{ topic: "orders/create", webhookId: 111 }]),
        integration: baseIntegration,
      }),
    ).rejects.toThrow(/HTTP 500/);
  });

  it("returns silently when subscriptions array is missing", async () => {
    await expect(
      deactivate({
        trigger: trigger(undefined),
        integration: baseIntegration,
      }),
    ).resolves.toBeUndefined();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("returns silently when subscriptions array is empty", async () => {
    await expect(
      deactivate({
        trigger: trigger([]),
        integration: baseIntegration,
      }),
    ).resolves.toBeUndefined();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("falls back to config.shopDomain when integration.providerAccountId is empty", async () => {
    mockDelete.mockResolvedValue(undefined);
    await deactivate({
      trigger: trigger([{ topic: "orders/create", webhookId: 1 }], "stored.myshopify.com"),
      integration: { ...baseIntegration, providerAccountId: "" },
    });
    expect(mockDelete.mock.calls[0]![0].shopDomain).toBe(
      "stored.myshopify.com",
    );
  });
});
