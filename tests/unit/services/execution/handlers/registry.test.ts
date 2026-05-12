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
    // create_channel lands in Slack 2.3 Commit 3; list_channels +
    // get_channel_info already landed in Slack 2.3 Commit 2 (see test
    // below). create_channel remains undefined here as a forward-looking
    // negative assertion.
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

  it("registers the 5 Slack 2.1 Commit 4 message lifecycle actions", () => {
    const expected = [
      "send_channel_message", // existing (slice 1L); included for completeness
      "send_direct_message",
      "update_message",
      "delete_message",
      "get_messages",
      "get_thread_messages",
    ];
    for (const type of expected) {
      expect(getActionHandler("slack", type)).toBeDefined();
    }
  });

  it("registers the 3 Slack 2.1 Commit 5 scheduled message actions", () => {
    expect(getActionHandler("slack", "schedule_message")).toBeDefined();
    expect(getActionHandler("slack", "cancel_scheduled_message")).toBeDefined();
    expect(getActionHandler("slack", "list_scheduled_messages")).toBeDefined();
  });

  it("registers the 4 Slack 2.1 Commit 6 reactions + pins actions", () => {
    expect(getActionHandler("slack", "add_reaction")).toBeDefined();
    expect(getActionHandler("slack", "remove_reaction")).toBeDefined();
    expect(getActionHandler("slack", "pin_message")).toBeDefined();
    expect(getActionHandler("slack", "unpin_message")).toBeDefined();
  });

  it("registers post_interactive_blocks (Slack 2.1 Commit 7 — Block Kit)", () => {
    expect(getActionHandler("slack", "post_interactive_blocks")).toBeDefined();
  });

  it("registers the 2 Slack 2.3 Commit 2 channel read actions", () => {
    expect(getActionHandler("slack", "list_channels")).toBeDefined();
    expect(getActionHandler("slack", "get_channel_info")).toBeDefined();
  });

  it("does NOT yet register Slack actions deferred to later slices (file actions + user-token actions + channel lifecycle/admin + user reads)", () => {
    // File actions land in Slack 2.4 + P-S3 file output contract.
    expect(getActionHandler("slack", "upload_file")).toBeUndefined();
    expect(getActionHandler("slack", "download_file")).toBeUndefined();
    expect(getActionHandler("slack", "get_file_info")).toBeUndefined();
    // User-token actions land after P-S1 user-token storage.
    expect(getActionHandler("slack", "update_user_status")).toBeUndefined();
    expect(getActionHandler("slack", "set_user_presence")).toBeUndefined();
    // Channel lifecycle / membership / metadata land in Slack 2.3 Commit 3.
    expect(getActionHandler("slack", "create_channel")).toBeUndefined();
    expect(getActionHandler("slack", "archive_channel")).toBeUndefined();
    expect(getActionHandler("slack", "unarchive_channel")).toBeUndefined();
    expect(getActionHandler("slack", "rename_channel")).toBeUndefined();
    expect(getActionHandler("slack", "join_channel")).toBeUndefined();
    expect(getActionHandler("slack", "leave_channel")).toBeUndefined();
    expect(getActionHandler("slack", "invite_users_to_channel")).toBeUndefined();
    expect(getActionHandler("slack", "remove_user_from_channel")).toBeUndefined();
    expect(getActionHandler("slack", "set_channel_topic")).toBeUndefined();
    expect(getActionHandler("slack", "set_channel_purpose")).toBeUndefined();
    // User reads land in Slack 2.3 Commit 4.
    expect(getActionHandler("slack", "get_user_info")).toBeUndefined();
    expect(getActionHandler("slack", "list_users")).toBeUndefined();
  });
});
