/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockOrdersCreate = jest.fn();
const mockResolveShop = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
}));

jest.mock("@/integrations/_shared/shopify/api/orders", () => ({
  ordersCreate: (...args: unknown[]) => mockOrdersCreate(...args),
  ordersGet: jest.fn(),
  ordersUpdate: jest.fn(),
  ordersCancel: jest.fn(),
}));

jest.mock("@/integrations/shopify/actions/_resolveShop", () => ({
  resolveShopDomain: (...args: unknown[]) => mockResolveShop(...args),
}));

import { createOrder } from "@/integrations/shopify/actions/createOrder";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockOrdersCreate.mockReset();
  mockResolveShop.mockReset();
  mockResolveShop.mockResolvedValue({
    shopDomain: "test-shop.myshopify.com",
    accountId: "test-shop.myshopify.com",
  });
  // Default: invoke the apiCall with a stub access token.
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(): TriggerEvent {
  return {
    provider: "shopify",
    eventType: "webhook_received",
    eventId: "evt-1",
    occurredAt: "2026-05-09T12:00:00Z",
    accountId: "test-shop.myshopify.com",
    payload: {},
  };
}

const validConfig = {
  email: "buyer@example.com",
  line_items: [{ variant_id: 555, quantity: 2 }],
  send_receipt: true,
} as const;

describe("createOrder — happy path", () => {
  it("posts the order via ordersCreate and returns mapped output", async () => {
    mockOrdersCreate.mockResolvedValueOnce({
      id: 1234,
      order_number: 1001,
      total_price: "29.98",
      currency: "USD",
      financial_status: "paid",
      created_at: "2026-05-09T12:00:00Z",
    });
    const result = await createOrder({
      workflowId: "wf-1",
      userId: "u-1",
      runId: "run-1",
      nodeId: "n-1",
      config: validConfig,
      triggerEvent: trigger(),
    });
    expect(result.output).toEqual({
      orderId: 1234,
      orderNumber: 1001,
      orderName: null,
      email: null,
      totalPrice: "29.98",
      currency: "USD",
      financialStatus: "paid",
      fulfillmentStatus: null,
      adminUrl: "https://test-shop.myshopify.com/admin/orders/1234",
      createdAt: "2026-05-09T12:00:00Z",
    });
  });

  it("wraps the principal call in refreshAndRetry with provider='shopify' + accountId pinned", async () => {
    mockOrdersCreate.mockResolvedValueOnce({ id: 1 });
    await createOrder({
      workflowId: "wf-1",
      userId: "u-1",
      runId: "run-1",
      nodeId: "n-1",
      config: validConfig,
      triggerEvent: trigger(),
    });
    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(1);
    const arg = mockRefreshAndRetry.mock.calls[0]![0];
    expect(arg.provider).toBe("shopify");
    expect(arg.userId).toBe("u-1");
    expect(arg.accountId).toBe("test-shop.myshopify.com");
  });

  it("threads the resolved shopDomain into the wrapper (NOT from action config)", async () => {
    mockOrdersCreate.mockResolvedValueOnce({ id: 1 });
    await createOrder({
      workflowId: "wf-1",
      userId: "u-1",
      runId: "run-1",
      nodeId: "n-1",
      config: validConfig,
      triggerEvent: trigger(),
    });
    expect(mockOrdersCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        shopDomain: "test-shop.myshopify.com",
        accessToken: "tok",
        send_receipt: true,
      }),
    );
  });
});

describe("createOrder — Q11 send_receipt gate", () => {
  it("rejects config missing send_receipt", async () => {
    const { send_receipt: _, ...rest } = validConfig;
    void _;
    await expect(
      createOrder({
        workflowId: "wf-1",
        userId: "u-1",
        runId: "run-1",
        nodeId: "n-1",
        config: rest as Record<string, unknown>,
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("propagates the boolean to the wrapper as send_receipt", async () => {
    mockOrdersCreate.mockResolvedValueOnce({ id: 1 });
    await createOrder({
      workflowId: "wf-1",
      userId: "u-1",
      runId: "run-1",
      nodeId: "n-1",
      config: { ...validConfig, send_receipt: false },
      triggerEvent: trigger(),
    });
    expect(mockOrdersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ send_receipt: false }),
    );
  });
});

describe("createOrder — shop NOT overridable from action config", () => {
  it("ignores any shop-shaped fields the user puts in config (strict schema rejects them)", async () => {
    await expect(
      createOrder({
        workflowId: "wf-1",
        userId: "u-1",
        runId: "run-1",
        nodeId: "n-1",
        // Strict schema rejects unknown fields like `shopify_store`.
        config: { ...validConfig, shopify_store: "evil.myshopify.com" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockResolveShop).not.toHaveBeenCalled();
  });
});

describe("createOrder — schema validation", () => {
  it("rejects empty line_items", async () => {
    await expect(
      createOrder({
        workflowId: "wf-1",
        userId: "u-1",
        runId: "run-1",
        nodeId: "n-1",
        config: { ...validConfig, line_items: [] },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("rejects bad country_code (must be 2-letter uppercase)", async () => {
    await expect(
      createOrder({
        workflowId: "wf-1",
        userId: "u-1",
        runId: "run-1",
        nodeId: "n-1",
        config: {
          ...validConfig,
          shipping_address: { country_code: "USA" },
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});
