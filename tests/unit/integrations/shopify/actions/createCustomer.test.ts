/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockCustomersCreate = jest.fn();
const mockResolveShop = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
}));

jest.mock("@/integrations/_shared/shopify/api/customers", () => ({
  customersCreate: (...args: unknown[]) => mockCustomersCreate(...args),
  customersUpdate: jest.fn(),
}));

jest.mock("@/integrations/shopify/actions/_resolveShop", () => ({
  resolveShopDomain: (...args: unknown[]) => mockResolveShop(...args),
}));

import { createCustomer } from "@/integrations/shopify/actions/createCustomer";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockCustomersCreate.mockReset();
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
    accountId: "s.myshopify.com",
    payload: {},
  };
}

describe("createCustomer", () => {
  it("maps schema send_welcome_email → wrapper send_email_welcome (Q11 wire-mapping)", async () => {
    mockCustomersCreate.mockResolvedValueOnce({
      id: 5,
      email: "alice@example.com",
      first_name: "Alice",
      last_name: "Smith",
      created_at: "2026-05-09T12:00:00Z",
    });
    await createCustomer({
      workflowId: "wf-1",
      userId: "u-1",
      runId: "run-1",
      nodeId: "n-1",
      config: {
        email: "alice@example.com",
        send_welcome_email: true,
        first_name: "Alice",
      },
      triggerEvent: trigger(),
    });
    // Schema field is `send_welcome_email`; wrapper field is
    // `send_email_welcome` (Shopify's REST name). Verify the rename.
    expect(mockCustomersCreate.mock.calls[0]![0]).toEqual(
      expect.objectContaining({
        email: "alice@example.com",
        send_email_welcome: true,
        first_name: "Alice",
      }),
    );
    expect(mockCustomersCreate.mock.calls[0]![0]).not.toHaveProperty(
      "send_welcome_email",
    );
  });

  it("rejects missing send_welcome_email (Q11 gate)", async () => {
    await expect(
      createCustomer({
        workflowId: "wf-1",
        userId: "u-1",
        runId: "run-1",
        nodeId: "n-1",
        config: { email: "alice@example.com" } as Record<string, unknown>,
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns mapped output", async () => {
    mockCustomersCreate.mockResolvedValueOnce({
      id: 5,
      email: "x@y.com",
      first_name: "X",
      last_name: "Y",
      created_at: "2026-05-09T12:00:00Z",
    });
    const result = await createCustomer({
      workflowId: "wf-1",
      userId: "u-1",
      runId: "run-1",
      nodeId: "n-1",
      config: { email: "x@y.com", send_welcome_email: false },
      triggerEvent: trigger(),
    });
    expect(result.output).toEqual({
      customerId: 5,
      email: "x@y.com",
      firstName: "X",
      lastName: "Y",
      adminUrl: "https://s.myshopify.com/admin/customers/5",
      createdAt: "2026-05-09T12:00:00Z",
    });
  });
});
