/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockOrdersList = jest.fn();
const mockFulfillmentsCreate = jest.fn();
const mockResolveShop = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
}));

jest.mock("@/integrations/_shared/shopify/api/fulfillments", () => ({
  fulfillmentOrdersList: (...args: unknown[]) => mockOrdersList(...args),
  fulfillmentsCreate: (...args: unknown[]) => mockFulfillmentsCreate(...args),
}));

jest.mock("@/integrations/shopify/actions/_resolveShop", () => ({
  resolveShopDomain: (...args: unknown[]) => mockResolveShop(...args),
}));

import { createFulfillment } from "@/integrations/shopify/actions/createFulfillment";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockOrdersList.mockReset();
  mockFulfillmentsCreate.mockReset();
  mockResolveShop.mockReset();
  mockResolveShop.mockResolvedValue({
    shopDomain: "s.myshopify.com",
    accountId: "s.myshopify.com",
  });
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
    providerAccountId: "s.myshopify.com",
    payload: {},
  };
}

const validConfig = {
  order_id: 100,
  notify_customer: true,
  tracking_number: "1Z999",
  tracking_company: "UPS",
} as const;

describe("createFulfillment — happy path (two-step REST flow)", () => {
  it("fetches fulfillment_orders, picks first eligible, then POSTs /fulfillments.json", async () => {
    mockOrdersList.mockResolvedValueOnce([
      {
        id: 11,
        status: "open",
        line_items: [
          { id: 100, remaining_quantity: 2 },
          { id: 101, remaining_quantity: 1 },
        ],
      },
    ]);
    mockFulfillmentsCreate.mockResolvedValueOnce({
      id: 999,
      status: "success",
      tracking_numbers: ["1Z999"],
      tracking_urls: ["https://ups.com/track/1Z999"],
      created_at: "2026-05-09T13:00:00Z",
    });
    const result = await createFulfillment({
      workflowId: "wf-1",
      userId: "u-1",
      accountId: "acct-u-1",
      runId: "run-1",
      nodeId: "n-1",
      config: validConfig,
      triggerEvent: trigger(),
    });
    expect(mockOrdersList).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 100 }),
    );
    expect(mockFulfillmentsCreate.mock.calls[0]![0]).toEqual(
      expect.objectContaining({
        fulfillment_order_id: 11,
        line_items: [
          { id: 100, quantity: 2 },
          { id: 101, quantity: 1 },
        ],
        notify_customer: true,
        tracking_info: { number: "1Z999", company: "UPS" },
      }),
    );
    expect(result.output.fulfillmentId).toBe(999);
  });

  it("prefers `open`/`scheduled` fulfillment orders over closed ones", async () => {
    mockOrdersList.mockResolvedValueOnce([
      {
        id: 11,
        status: "closed",
        line_items: [{ id: 100, remaining_quantity: 0 }],
      },
      {
        id: 12,
        status: "scheduled",
        line_items: [{ id: 200, remaining_quantity: 3 }],
      },
    ]);
    mockFulfillmentsCreate.mockResolvedValueOnce({ id: 999 });
    await createFulfillment({
      workflowId: "wf-1",
      userId: "u-1",
      accountId: "acct-u-1",
      runId: "run-1",
      nodeId: "n-1",
      config: { order_id: 1, notify_customer: false },
      triggerEvent: trigger(),
    });
    expect(mockFulfillmentsCreate.mock.calls[0]![0].fulfillment_order_id).toBe(
      12,
    );
  });

  it("throws when no fulfillment orders exist for the order", async () => {
    mockOrdersList.mockResolvedValueOnce([]);
    await expect(
      createFulfillment({
        workflowId: "wf-1",
        userId: "u-1",
        accountId: "acct-u-1",
        runId: "run-1",
        nodeId: "n-1",
        config: { order_id: 1, notify_customer: false },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/no fulfillment orders/);
    expect(mockFulfillmentsCreate).not.toHaveBeenCalled();
  });

  it("throws when no line items have remaining quantity", async () => {
    mockOrdersList.mockResolvedValueOnce([
      {
        id: 11,
        status: "open",
        line_items: [{ id: 100, remaining_quantity: 0 }],
      },
    ]);
    await expect(
      createFulfillment({
        workflowId: "wf-1",
        userId: "u-1",
        accountId: "acct-u-1",
        runId: "run-1",
        nodeId: "n-1",
        config: { order_id: 1, notify_customer: false },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/no fulfillable line items/);
  });
});

describe("createFulfillment — Q11 notify_customer gate", () => {
  it("rejects missing notify_customer", async () => {
    await expect(
      createFulfillment({
        workflowId: "wf-1",
        userId: "u-1",
        accountId: "acct-u-1",
        runId: "run-1",
        nodeId: "n-1",
        config: { order_id: 1 } as Record<string, unknown>,
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockOrdersList).not.toHaveBeenCalled();
  });

  it("propagates the boolean to the wrapper as notify_customer (V1 silent default fixed)", async () => {
    mockOrdersList.mockResolvedValueOnce([
      {
        id: 11,
        status: "open",
        line_items: [{ id: 100, remaining_quantity: 1 }],
      },
    ]);
    mockFulfillmentsCreate.mockResolvedValueOnce({ id: 1 });
    await createFulfillment({
      workflowId: "wf-1",
      userId: "u-1",
      accountId: "acct-u-1",
      runId: "run-1",
      nodeId: "n-1",
      config: { order_id: 1, notify_customer: false },
      triggerEvent: trigger(),
    });
    expect(mockFulfillmentsCreate.mock.calls[0]![0].notify_customer).toBe(false);
  });
});

describe("createFulfillment — refreshAndRetry wrapping", () => {
  it("wraps BOTH the auxiliary GET and the principal POST", async () => {
    mockOrdersList.mockResolvedValueOnce([
      {
        id: 11,
        status: "open",
        line_items: [{ id: 100, remaining_quantity: 1 }],
      },
    ]);
    mockFulfillmentsCreate.mockResolvedValueOnce({ id: 1 });
    await createFulfillment({
      workflowId: "wf-1",
      userId: "u-1",
      accountId: "acct-u-1",
      runId: "run-1",
      nodeId: "n-1",
      config: { order_id: 1, notify_customer: false },
      triggerEvent: trigger(),
    });
    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(2);
    for (const call of mockRefreshAndRetry.mock.calls) {
      expect(call[0].provider).toBe("shopify");
      expect(call[0].accountId).toBe("s.myshopify.com");
    }
  });
});
