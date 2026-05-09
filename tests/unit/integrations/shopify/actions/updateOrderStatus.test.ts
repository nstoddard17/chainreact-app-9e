/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockOrdersGet = jest.fn();
const mockOrdersUpdate = jest.fn();
const mockOrdersCancel = jest.fn();
const mockResolveShop = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
}));

jest.mock("@/integrations/_shared/shopify/api/orders", () => ({
  ordersGet: (...args: unknown[]) => mockOrdersGet(...args),
  ordersUpdate: (...args: unknown[]) => mockOrdersUpdate(...args),
  ordersCancel: (...args: unknown[]) => mockOrdersCancel(...args),
  ordersCreate: jest.fn(),
}));

jest.mock("@/integrations/shopify/actions/_resolveShop", () => ({
  resolveShopDomain: (...args: unknown[]) => mockResolveShop(...args),
}));

import { updateOrderStatus } from "@/integrations/shopify/actions/updateOrderStatus";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockOrdersGet.mockReset();
  mockOrdersUpdate.mockReset();
  mockOrdersCancel.mockReset();
  mockResolveShop.mockReset();
  mockResolveShop.mockResolvedValue({
    shopDomain: "test-shop.myshopify.com",
    accountId: "test-shop.myshopify.com",
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
    accountId: "test-shop.myshopify.com",
    payload: {},
  };
}

describe("updateOrderStatus — cancel sub-action", () => {
  it("calls ordersCancel with notify_customer (Q11 gate)", async () => {
    mockOrdersCancel.mockResolvedValueOnce({ id: 1, order_number: 1001 });
    const result = await updateOrderStatus({
      workflowId: "wf-1",
      userId: "u-1",
      runId: "run-1",
      nodeId: "n-1",
      config: { action: "cancel", order_id: 1, notify_customer: true },
      triggerEvent: trigger(),
    });
    expect(mockOrdersCancel).toHaveBeenCalledWith(
      expect.objectContaining({
        notify_customer: true,
        orderId: 1,
      }),
    );
    expect(result.output.status).toBe("cancelled");
    expect(result.output.adminUrl).toBe(
      "https://test-shop.myshopify.com/admin/orders/1",
    );
  });

  it("propagates optional reason + restock", async () => {
    mockOrdersCancel.mockResolvedValueOnce({ id: 1 });
    await updateOrderStatus({
      workflowId: "wf-1",
      userId: "u-1",
      runId: "run-1",
      nodeId: "n-1",
      config: {
        action: "cancel",
        order_id: 1,
        notify_customer: false,
        reason: "fraud",
        restock: true,
      },
      triggerEvent: trigger(),
    });
    expect(mockOrdersCancel).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "fraud", restock: true }),
    );
  });

  it("rejects missing notify_customer (Q11 gate)", async () => {
    await expect(
      updateOrderStatus({
        workflowId: "wf-1",
        userId: "u-1",
        runId: "run-1",
        nodeId: "n-1",
        // notify_customer omitted
        config: { action: "cancel", order_id: 1 } as Record<string, unknown>,
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });
});

describe("updateOrderStatus — add_tags sub-action", () => {
  it("fetches existing tags, merges, dedupes, and PUTs the result", async () => {
    mockOrdersGet.mockResolvedValueOnce({ id: 5, tags: "vip, repeat" });
    mockOrdersUpdate.mockResolvedValueOnce({ id: 5, tags: "vip, repeat, urgent" });
    const result = await updateOrderStatus({
      workflowId: "wf-1",
      userId: "u-1",
      runId: "run-1",
      nodeId: "n-1",
      config: {
        action: "add_tags",
        order_id: 5,
        notify_customer: false,
        tags: "vip, urgent",
      },
      triggerEvent: trigger(),
    });
    expect(mockOrdersGet).toHaveBeenCalledTimes(1);
    expect(mockOrdersUpdate).toHaveBeenCalledTimes(1);
    const updateArg = mockOrdersUpdate.mock.calls[0]![0];
    expect(updateArg.fields.tags).toBe("vip, repeat, urgent");
    expect(result.output.status).toBe("tags_added");
  });

  it("wraps BOTH the auxiliary GET and the PUT in refreshAndRetry", async () => {
    mockOrdersGet.mockResolvedValueOnce({ id: 5, tags: "" });
    mockOrdersUpdate.mockResolvedValueOnce({ id: 5 });
    await updateOrderStatus({
      workflowId: "wf-1",
      userId: "u-1",
      runId: "run-1",
      nodeId: "n-1",
      config: {
        action: "add_tags",
        order_id: 5,
        notify_customer: false,
        tags: "new",
      },
      triggerEvent: trigger(),
    });
    // 2 refreshAndRetry calls: one for the GET (auxiliary), one for the
    // PUT (principal).
    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(2);
    expect(mockRefreshAndRetry.mock.calls[0]![0].provider).toBe("shopify");
    expect(mockRefreshAndRetry.mock.calls[1]![0].provider).toBe("shopify");
  });
});

describe("updateOrderStatus — add_note sub-action", () => {
  it("appends new note to existing note, separated by a blank line", async () => {
    mockOrdersGet.mockResolvedValueOnce({ id: 7, note: "first note" });
    mockOrdersUpdate.mockResolvedValueOnce({ id: 7 });
    await updateOrderStatus({
      workflowId: "wf-1",
      userId: "u-1",
      runId: "run-1",
      nodeId: "n-1",
      config: {
        action: "add_note",
        order_id: 7,
        notify_customer: false,
        note: "second note",
      },
      triggerEvent: trigger(),
    });
    expect(mockOrdersUpdate.mock.calls[0]![0].fields.note).toBe(
      "first note\n\nsecond note",
    );
  });

  it("uses just the new note when existing is empty", async () => {
    mockOrdersGet.mockResolvedValueOnce({ id: 7, note: null });
    mockOrdersUpdate.mockResolvedValueOnce({ id: 7 });
    await updateOrderStatus({
      workflowId: "wf-1",
      userId: "u-1",
      runId: "run-1",
      nodeId: "n-1",
      config: {
        action: "add_note",
        order_id: 7,
        notify_customer: false,
        note: "fresh note",
      },
      triggerEvent: trigger(),
    });
    expect(mockOrdersUpdate.mock.calls[0]![0].fields.note).toBe("fresh note");
  });
});

describe("updateOrderStatus — schema rejects unknown actions", () => {
  it("throws on action='fulfill' (deferred — see create_fulfillment)", async () => {
    await expect(
      updateOrderStatus({
        workflowId: "wf-1",
        userId: "u-1",
        runId: "run-1",
        nodeId: "n-1",
        config: {
          action: "fulfill",
          order_id: 1,
          notify_customer: true,
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});
