/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockOrdersGet = jest.fn();
const mockOrdersUpdate = jest.fn();
const mockResolveShop = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
}));

jest.mock("@/integrations/_shared/shopify/api/orders", () => ({
  ordersGet: (...args: unknown[]) => mockOrdersGet(...args),
  ordersUpdate: (...args: unknown[]) => mockOrdersUpdate(...args),
  ordersCreate: jest.fn(),
  ordersCancel: jest.fn(),
}));

jest.mock("@/integrations/shopify/actions/_resolveShop", () => ({
  resolveShopDomain: (...args: unknown[]) => mockResolveShop(...args),
}));

import { addOrderNote } from "@/integrations/shopify/actions/addOrderNote";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockOrdersGet.mockReset();
  mockOrdersUpdate.mockReset();
  mockResolveShop.mockReset();
  mockResolveShop.mockResolvedValue({
    shopDomain: "s.myshopify.com",
    providerAccountId: "s.myshopify.com",
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

describe("addOrderNote — append=true", () => {
  it("fetches existing note + appends + PUTs", async () => {
    mockOrdersGet.mockResolvedValueOnce({ id: 1, note: "existing" });
    mockOrdersUpdate.mockResolvedValueOnce({ id: 1, note: "existing\n\nnew" });
    await addOrderNote({
      workflowId: "wf-1",
      userId: "u-1",
      accountId: "acct-u-1",
      runId: "run-1",
      nodeId: "n-1",
      config: { order_id: 1, note: "new", append: true },
      triggerEvent: trigger(),
    });
    expect(mockOrdersGet).toHaveBeenCalledTimes(1);
    expect(mockOrdersUpdate.mock.calls[0]![0].fields.note).toBe("existing\n\nnew");
  });

  it("uses just the new note when existing is empty/null", async () => {
    mockOrdersGet.mockResolvedValueOnce({ id: 1, note: null });
    mockOrdersUpdate.mockResolvedValueOnce({ id: 1, note: "fresh" });
    await addOrderNote({
      workflowId: "wf-1",
      userId: "u-1",
      accountId: "acct-u-1",
      runId: "run-1",
      nodeId: "n-1",
      config: { order_id: 1, note: "fresh", append: true },
      triggerEvent: trigger(),
    });
    expect(mockOrdersUpdate.mock.calls[0]![0].fields.note).toBe("fresh");
  });
});

describe("addOrderNote — append=false", () => {
  it("PUTs with overwrite — no auxiliary GET", async () => {
    mockOrdersUpdate.mockResolvedValueOnce({ id: 1, note: "replacement" });
    await addOrderNote({
      workflowId: "wf-1",
      userId: "u-1",
      accountId: "acct-u-1",
      runId: "run-1",
      nodeId: "n-1",
      config: { order_id: 1, note: "replacement", append: false },
      triggerEvent: trigger(),
    });
    expect(mockOrdersGet).not.toHaveBeenCalled();
    expect(mockOrdersUpdate.mock.calls[0]![0].fields.note).toBe("replacement");
  });
});

describe("addOrderNote — schema rejects missing append", () => {
  it("throws when append is omitted (required-no-default)", async () => {
    await expect(
      addOrderNote({
        workflowId: "wf-1",
        userId: "u-1",
        accountId: "acct-u-1",
        runId: "run-1",
        nodeId: "n-1",
        config: { order_id: 1, note: "x" } as Record<string, unknown>,
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});
