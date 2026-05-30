/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockCustomersUpdate = jest.fn();
const mockResolveShop = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
}));

jest.mock("@/integrations/_shared/shopify/api/customers", () => ({
  customersUpdate: (...args: unknown[]) => mockCustomersUpdate(...args),
  customersCreate: jest.fn(),
}));

jest.mock("@/integrations/shopify/actions/_resolveShop", () => ({
  resolveShopDomain: (...args: unknown[]) => mockResolveShop(...args),
}));

import { updateCustomer } from "@/integrations/shopify/actions/updateCustomer";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockCustomersUpdate.mockReset();
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

describe("updateCustomer", () => {
  it("PUTs supplied fields through customersUpdate", async () => {
    mockCustomersUpdate.mockResolvedValueOnce({
      id: 5,
      email: "new@example.com",
      updated_at: "2026-05-09T12:00:00Z",
    });
    await updateCustomer({
      workflowId: "wf-1",
      userId: "u-1",
      accountId: "acct-u-1",
      runId: "run-1",
      nodeId: "n-1",
      config: {
        customer_id: 5,
        email: "new@example.com",
        accepts_marketing: true,
      },
      triggerEvent: trigger(),
    });
    expect(mockCustomersUpdate.mock.calls[0]![0]).toEqual(
      expect.objectContaining({
        customerId: 5,
        email: "new@example.com",
        accepts_marketing: true,
      }),
    );
  });

  it("returns mapped output", async () => {
    mockCustomersUpdate.mockResolvedValueOnce({
      id: 5,
      email: "x@y.com",
      updated_at: "2026-05-09T12:00:00Z",
    });
    const result = await updateCustomer({
      workflowId: "wf-1",
      userId: "u-1",
      accountId: "acct-u-1",
      runId: "run-1",
      nodeId: "n-1",
      config: { customer_id: 5, note: "VIP" },
      triggerEvent: trigger(),
    });
    expect(result.output).toEqual({
      success: true,
      customerId: 5,
      email: "x@y.com",
      adminUrl: "https://s.myshopify.com/admin/customers/5",
      updatedAt: "2026-05-09T12:00:00Z",
    });
  });
});
