/**
 * @jest-environment node
 *
 * Tests for services/execution/handlers/_registry.ts.
 *
 * Slice 1L registered the first handler (slack:send_channel_message).
 * Slice 2d registered the second (gmail:send_email).
 * Future provider slices append entries; this test pins the contract
 * that survives provider additions.
 */
import {
  getActionHandler,
  listRegisteredHandlers,
} from "@/services/execution/handlers/_registry";

describe("action handler registry", () => {
  it("returns the Slack send_channel_message handler (registered in 1L)", () => {
    expect(getActionHandler("slack", "send_channel_message")).toBeDefined();
  });

  it("returns the Gmail send_email handler (registered in 2d)", () => {
    expect(getActionHandler("gmail", "send_email")).toBeDefined();
  });

  it("returns undefined for (provider, type) pairs that no slice has registered yet", () => {
    expect(getActionHandler("slack", "create_channel")).toBeUndefined();
    expect(getActionHandler("gmail", "create_draft")).toBeUndefined();
  });

  it("listRegisteredHandlers includes both Slack and Gmail entries", () => {
    const registered = listRegisteredHandlers();
    expect(registered).toContainEqual({
      provider: "slack",
      type: "send_channel_message",
    });
    expect(registered).toContainEqual({
      provider: "gmail",
      type: "send_email",
    });
  });

  it("the lookup namespace is (provider, type) — same type from different providers does not collide", () => {
    expect(getActionHandler("gmail", "send_channel_message")).toBeUndefined();
    expect(getActionHandler("slack", "send_email")).toBeUndefined();
  });

  it("registers all 10 Shopify actions (Slice 12 Commit 3)", () => {
    const expected = [
      "create_order",
      "update_order_status",
      "add_order_note",
      "create_fulfillment",
      "create_product",
      "update_product",
      "create_product_variant",
      "create_customer",
      "update_customer",
      "update_inventory",
    ];
    for (const type of expected) {
      expect(getActionHandler("shopify", type)).toBeDefined();
    }
    const shopifyEntries = listRegisteredHandlers().filter(
      (e) => e.provider === "shopify",
    );
    expect(shopifyEntries.map((e) => e.type).sort()).toEqual([...expected].sort());
  });

  it("does NOT register Shopify actions deferred from Batch 1 (e.g. update_product_variant)", () => {
    expect(getActionHandler("shopify", "update_product_variant")).toBeUndefined();
  });
});
