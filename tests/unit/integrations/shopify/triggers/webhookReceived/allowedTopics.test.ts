/** @jest-environment node */
import {
  isAllowedShopifyTopic,
  SHOPIFY_ALLOWED_TOPICS,
} from "@/integrations/shopify/triggers/webhookReceived/allowedTopics";

describe("Shopify allowed topics (Slice 12 Batch 1)", () => {
  it("ships exactly 8 topics (mirrors V1's 8 trigger node types)", () => {
    expect(SHOPIFY_ALLOWED_TOPICS).toHaveLength(8);
  });

  it("includes the 8 user-approved topics", () => {
    expect(SHOPIFY_ALLOWED_TOPICS).toEqual([
      "orders/create",
      "orders/paid",
      "orders/fulfilled",
      "orders/updated",
      "customers/create",
      "products/update",
      "checkouts/create",
      "inventory_levels/update",
    ]);
  });

  it("isAllowedShopifyTopic returns true for each allowlisted topic", () => {
    for (const topic of SHOPIFY_ALLOWED_TOPICS) {
      expect(isAllowedShopifyTopic(topic)).toBe(true);
    }
  });

  it("isAllowedShopifyTopic returns false for V1 topics deferred from Batch 1", () => {
    // Examples of common Shopify topics NOT in Slice 12 Batch 1.
    expect(isAllowedShopifyTopic("orders/cancelled")).toBe(false);
    expect(isAllowedShopifyTopic("customers/update")).toBe(false);
    expect(isAllowedShopifyTopic("app/uninstalled")).toBe(false);
    expect(isAllowedShopifyTopic("draft_orders/create")).toBe(false);
  });

  it("isAllowedShopifyTopic returns false for malformed values", () => {
    expect(isAllowedShopifyTopic("")).toBe(false);
    expect(isAllowedShopifyTopic("orders/CREATE")).toBe(false);
    expect(isAllowedShopifyTopic("orders create")).toBe(false);
  });
});
