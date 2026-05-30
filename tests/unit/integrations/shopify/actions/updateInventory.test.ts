/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockSet = jest.fn();
const mockAdjust = jest.fn();
const mockResolveShop = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
}));

jest.mock("@/integrations/_shared/shopify/api/inventoryLevels", () => ({
  inventoryLevelsSet: (...args: unknown[]) => mockSet(...args),
  inventoryLevelsAdjust: (...args: unknown[]) => mockAdjust(...args),
}));

jest.mock("@/integrations/shopify/actions/_resolveShop", () => ({
  resolveShopDomain: (...args: unknown[]) => mockResolveShop(...args),
}));

import { updateInventory } from "@/integrations/shopify/actions/updateInventory";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockSet.mockReset();
  mockAdjust.mockReset();
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

describe("updateInventory — set", () => {
  it("calls inventoryLevelsSet with absolute value", async () => {
    mockSet.mockResolvedValueOnce({
      inventory_item_id: 1,
      location_id: 2,
      available: 50,
      updated_at: "2026-05-09T12:00:00Z",
    });
    const result = await updateInventory({
      workflowId: "wf-1",
      userId: "u-1",
      accountId: "acct-u-1",
      runId: "run-1",
      nodeId: "n-1",
      config: {
        inventory_item_id: 1,
        location_id: 2,
        adjustment_type: "set",
        quantity: 50,
      },
      triggerEvent: trigger(),
    });
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        inventory_item_id: 1,
        location_id: 2,
        available: 50,
      }),
    );
    expect(mockAdjust).not.toHaveBeenCalled();
    expect(result.output.newQuantity).toBe(50);
  });
});

describe("updateInventory — add", () => {
  it("calls inventoryLevelsAdjust with positive delta", async () => {
    mockAdjust.mockResolvedValueOnce({
      inventory_item_id: 1,
      location_id: 2,
      available: 60,
    });
    await updateInventory({
      workflowId: "wf-1",
      userId: "u-1",
      accountId: "acct-u-1",
      runId: "run-1",
      nodeId: "n-1",
      config: {
        inventory_item_id: 1,
        location_id: 2,
        adjustment_type: "add",
        quantity: 10,
      },
      triggerEvent: trigger(),
    });
    expect(mockAdjust.mock.calls[0]![0].available_adjustment).toBe(10);
    expect(mockSet).not.toHaveBeenCalled();
  });
});

describe("updateInventory — subtract", () => {
  it("calls inventoryLevelsAdjust with NEGATED delta (schema's quantity is non-negative)", async () => {
    mockAdjust.mockResolvedValueOnce({
      inventory_item_id: 1,
      location_id: 2,
      available: 0,
    });
    await updateInventory({
      workflowId: "wf-1",
      userId: "u-1",
      accountId: "acct-u-1",
      runId: "run-1",
      nodeId: "n-1",
      config: {
        inventory_item_id: 1,
        location_id: 2,
        adjustment_type: "subtract",
        quantity: 5,
      },
      triggerEvent: trigger(),
    });
    expect(mockAdjust.mock.calls[0]![0].available_adjustment).toBe(-5);
  });
});

describe("updateInventory — schema validation", () => {
  it("rejects negative quantity (must be >= 0)", async () => {
    await expect(
      updateInventory({
        workflowId: "wf-1",
        userId: "u-1",
        accountId: "acct-u-1",
        runId: "run-1",
        nodeId: "n-1",
        config: {
          inventory_item_id: 1,
          location_id: 2,
          adjustment_type: "set",
          quantity: -5,
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("rejects unknown adjustment_type", async () => {
    await expect(
      updateInventory({
        workflowId: "wf-1",
        userId: "u-1",
        accountId: "acct-u-1",
        runId: "run-1",
        nodeId: "n-1",
        config: {
          inventory_item_id: 1,
          location_id: 2,
          adjustment_type: "multiply",
          quantity: 5,
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});
