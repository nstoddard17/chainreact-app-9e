/**
 * @jest-environment node
 */
const mockCreate = jest.fn();
const mockDelete = jest.fn();
const mockDecrypt = jest.fn();

jest.mock("@/integrations/_shared/shopify/api/webhooks", () => ({
  webhooksCreate: (...args: unknown[]) => mockCreate(...args),
  webhooksDelete: (...args: unknown[]) => mockDelete(...args),
}));

jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (v: string) => mockDecrypt(v),
}));

import { activate } from "@/integrations/shopify/triggers/webhookReceived/activate";

beforeEach(() => {
  mockCreate.mockReset();
  mockDelete.mockReset();
  mockDecrypt.mockReset();
  mockDecrypt.mockImplementation((v: string) => `decrypted-${v}`);
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.SHOPIFY_WEBHOOK_URL;
});

const baseIntegration = {
  id: "int-1",
  userId: "user-1",
  provider: "shopify",
  providerAccountId: "merchant.myshopify.com",
  displayName: "merchant.myshopify.com",
  accessTokenEncrypted: "ENC-MERCHANT",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: ["read_orders", "write_orders"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "",
  updatedAt: "",
};

const baseNode = {
  id: "node-trigger-1",
  kind: "trigger" as const,
  provider: "shopify",
  type: "webhook_received",
  config: {
    topics: ["orders/create", "customers/create"],
  },
  position: { x: 0, y: 0 },
};

describe("Shopify webhook_received activate — happy path", () => {
  it("creates ONE webhook subscription per topic and persists subscriptions to config", async () => {
    mockCreate
      .mockResolvedValueOnce({ id: 111, topic: "orders/create" })
      .mockResolvedValueOnce({ id: 222, topic: "customers/create" });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      webhookEnabled: true,
      shopDomain: "merchant.myshopify.com",
      topics: ["orders/create", "customers/create"],
      subscriptions: [
        { topic: "orders/create", webhookId: 111 },
        { topic: "customers/create", webhookId: 222 },
      ],
      notificationUrl: expect.stringContaining("/api/webhooks/shopify?"),
    });
    // Permanent endpoint pattern — NO subscription-watch marker.
    expect(result).not.toHaveProperty("type");
  });

  it("threads workflowId + nodeId into the notification URL", async () => {
    mockCreate.mockResolvedValueOnce({ id: 1, topic: "orders/create" });
    await activate({
      node: { ...baseNode, config: { topics: ["orders/create"] } },
      integration: baseIntegration,
      workflowId: "wf-XYZ",
    });
    const callArg = mockCreate.mock.calls[0]![0];
    expect(callArg.address).toContain("workflowId=wf-XYZ");
    expect(callArg.address).toContain("nodeId=node-trigger-1");
  });

  it("uses the merchant's decrypted access token (NOT a platform secret)", async () => {
    mockCreate.mockResolvedValueOnce({ id: 1, topic: "orders/create" });
    await activate({
      node: { ...baseNode, config: { topics: ["orders/create"] } },
      integration: baseIntegration,
      workflowId: "wf-test",
    });
    expect(mockDecrypt).toHaveBeenCalledWith("ENC-MERCHANT");
    expect(mockCreate.mock.calls[0]![0].accessToken).toBe(
      "decrypted-ENC-MERCHANT",
    );
  });

  it("uses the integration's providerAccountId as the shop domain", async () => {
    mockCreate.mockResolvedValueOnce({ id: 1, topic: "orders/create" });
    await activate({
      node: { ...baseNode, config: { topics: ["orders/create"] } },
      integration: baseIntegration,
      workflowId: "wf-test",
    });
    expect(mockCreate.mock.calls[0]![0].shopDomain).toBe(
      "merchant.myshopify.com",
    );
  });

  it("respects SHOPIFY_WEBHOOK_URL override (e2e mock surface)", async () => {
    process.env.SHOPIFY_WEBHOOK_URL = "http://localhost:9882";
    mockCreate.mockResolvedValueOnce({ id: 1, topic: "orders/create" });
    const result = await activate({
      node: { ...baseNode, config: { topics: ["orders/create"] } },
      integration: baseIntegration,
      workflowId: "wf-test",
    });
    expect(result.notificationUrl).toMatch(
      /^http:\/\/localhost:9882\/api\/webhooks\/shopify\?/,
    );
  });
});

describe("Shopify webhook_received activate — schema rejections", () => {
  it("rejects when topics is missing", async () => {
    await expect(
      activate({
        node: { ...baseNode, config: {} },
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow(/topics is required/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects when topics is empty array", async () => {
    await expect(
      activate({
        node: { ...baseNode, config: { topics: [] } },
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow(/topics is required/);
  });

  it("rejects topics outside the Slice 12 Batch 1 allowlist (fail-loud at design time)", async () => {
    await expect(
      activate({
        node: {
          ...baseNode,
          config: { topics: ["orders/create", "orders/cancelled"] },
        },
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow(/orders\/cancelled.*allowlist/);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("Shopify webhook_received activate — best-effort rollback on partial failure", () => {
  it("rolls back the 2 successful subscriptions when topic #3 fails", async () => {
    mockCreate
      .mockResolvedValueOnce({ id: 111, topic: "orders/create" })
      .mockResolvedValueOnce({ id: 222, topic: "customers/create" })
      .mockRejectedValueOnce(new Error("Shopify 422: invalid"));
    mockDelete.mockResolvedValue(undefined);

    await expect(
      activate({
        node: {
          ...baseNode,
          config: {
            topics: [
              "orders/create",
              "customers/create",
              "products/update",
            ],
          },
        },
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow(/Shopify 422/);

    // Both successful subscriptions deleted.
    expect(mockDelete).toHaveBeenCalledTimes(2);
    expect(mockDelete.mock.calls[0]![0].webhookId).toBe(111);
    expect(mockDelete.mock.calls[1]![0].webhookId).toBe(222);
  });

  it("swallows rollback errors and still re-throws the original failure", async () => {
    mockCreate
      .mockResolvedValueOnce({ id: 111, topic: "orders/create" })
      .mockRejectedValueOnce(new Error("primary failure"));
    mockDelete.mockRejectedValueOnce(new Error("rollback failed"));

    await expect(
      activate({
        node: {
          ...baseNode,
          config: { topics: ["orders/create", "customers/create"] },
        },
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow(/primary failure/);
  });
});
