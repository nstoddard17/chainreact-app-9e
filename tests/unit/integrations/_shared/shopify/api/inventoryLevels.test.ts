/** @jest-environment node */
const mockShopifyRequest = jest.fn();

jest.mock("@/integrations/_shared/shopify/api/_request", () => ({
  shopifyRequest: (...args: unknown[]) => mockShopifyRequest(...args),
}));

import {
  inventoryLevelsAdjust,
  inventoryLevelsSet,
} from "@/integrations/_shared/shopify/api/inventoryLevels";

beforeEach(() => {
  mockShopifyRequest.mockReset();
});

describe("inventoryLevelsSet", () => {
  it("POSTs /inventory_levels/set.json with absolute available value", async () => {
    mockShopifyRequest.mockResolvedValueOnce({
      inventory_level: {
        inventory_item_id: 1,
        location_id: 2,
        available: 50,
      },
    });
    await inventoryLevelsSet({
      shopDomain: "s.myshopify.com",
      accessToken: "tok",
      inventory_item_id: 1,
      location_id: 2,
      available: 50,
    });
    expect(mockShopifyRequest.mock.calls[0]![0]!.path).toBe(
      "/inventory_levels/set.json",
    );
    expect(mockShopifyRequest.mock.calls[0]![0]!.body).toEqual({
      inventory_item_id: 1,
      location_id: 2,
      available: 50,
    });
  });
});

describe("inventoryLevelsAdjust", () => {
  it("POSTs /inventory_levels/adjust.json with delta", async () => {
    mockShopifyRequest.mockResolvedValueOnce({
      inventory_level: {
        inventory_item_id: 1,
        location_id: 2,
        available: 60,
      },
    });
    await inventoryLevelsAdjust({
      shopDomain: "s.myshopify.com",
      accessToken: "tok",
      inventory_item_id: 1,
      location_id: 2,
      available_adjustment: 10,
    });
    expect(mockShopifyRequest.mock.calls[0]![0]!.path).toBe(
      "/inventory_levels/adjust.json",
    );
    expect(mockShopifyRequest.mock.calls[0]![0]!.body).toEqual({
      inventory_item_id: 1,
      location_id: 2,
      available_adjustment: 10,
    });
  });

  it("supports negative deltas (subtract path)", async () => {
    mockShopifyRequest.mockResolvedValueOnce({
      inventory_level: { inventory_item_id: 1, location_id: 2, available: 0 },
    });
    await inventoryLevelsAdjust({
      shopDomain: "s.myshopify.com",
      accessToken: "tok",
      inventory_item_id: 1,
      location_id: 2,
      available_adjustment: -5,
    });
    expect(
      mockShopifyRequest.mock.calls[0]![0]!.body.available_adjustment,
    ).toBe(-5);
  });
});
