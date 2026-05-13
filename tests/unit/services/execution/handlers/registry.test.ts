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

  it("registers the 3 Gmail 2.1 Commit 3 draft + reply handlers", () => {
    expect(getActionHandler("gmail", "create_draft")).toBeDefined();
    expect(getActionHandler("gmail", "create_draft_reply")).toBeDefined();
    expect(getActionHandler("gmail", "reply_to_email")).toBeDefined();
    const registered = listRegisteredHandlers();
    expect(registered).toContainEqual({ provider: "gmail", type: "create_draft" });
    expect(registered).toContainEqual({
      provider: "gmail",
      type: "create_draft_reply",
    });
    expect(registered).toContainEqual({
      provider: "gmail",
      type: "reply_to_email",
    });
  });

  it("registers the 3 Gmail 2.2 Commit 1 label handlers", () => {
    expect(getActionHandler("gmail", "add_label")).toBeDefined();
    expect(getActionHandler("gmail", "remove_label")).toBeDefined();
    expect(getActionHandler("gmail", "create_label")).toBeDefined();
    const registered = listRegisteredHandlers();
    expect(registered).toContainEqual({ provider: "gmail", type: "add_label" });
    expect(registered).toContainEqual({
      provider: "gmail",
      type: "remove_label",
    });
    expect(registered).toContainEqual({
      provider: "gmail",
      type: "create_label",
    });
  });

  it("returns undefined for (provider, type) pairs that no slice has registered yet", () => {
    // find_user_by_email is permanently skipped per Slack 2.3 plan
    // §6 decision 3 (PII scope; V1 orphan). gmail:mark_as_read is
    // Gmail 2.2 Commit 2 — not yet registered.
    expect(getActionHandler("slack", "find_user_by_email")).toBeUndefined();
    expect(getActionHandler("gmail", "mark_as_read")).toBeUndefined();
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

  it("registers the 10 Slack 2.3 Commit 3 channel lifecycle / membership / metadata actions", () => {
    const expected = [
      "create_channel",
      "archive_channel",
      "unarchive_channel",
      "rename_channel",
      "join_channel",
      "leave_channel",
      "invite_users_to_channel",
      "remove_user_from_channel",
      "set_channel_topic",
      "set_channel_purpose",
    ];
    for (const type of expected) {
      expect(getActionHandler("slack", type)).toBeDefined();
    }
  });

  it("registers the 2 Slack 2.3 Commit 4 user lookup actions", () => {
    expect(getActionHandler("slack", "get_user_info")).toBeDefined();
    expect(getActionHandler("slack", "list_users")).toBeDefined();
  });

  it("registers upload_file (Slack 2.4 Commit 3 — P-S3 FileRef contract)", () => {
    expect(getActionHandler("slack", "upload_file")).toBeDefined();
    expect(listRegisteredHandlers()).toContainEqual({
      provider: "slack",
      type: "upload_file",
    });
  });

  it("registers download_file + get_file_info (Slack 2.4 Commit 4 — P-S3 stage + provider_url FileRef)", () => {
    expect(getActionHandler("slack", "download_file")).toBeDefined();
    expect(getActionHandler("slack", "get_file_info")).toBeDefined();
    const registered = listRegisteredHandlers();
    expect(registered).toContainEqual({
      provider: "slack",
      type: "download_file",
    });
    expect(registered).toContainEqual({
      provider: "slack",
      type: "get_file_info",
    });
  });

  it("does NOT yet register the deferred Slack 2.5 file trigger (file_uploaded)", () => {
    // Trigger registration happens via filterRegistry, not this
    // action registry — but a defensive assertion against accidental
    // action-side registration of trigger-only types stays cheap.
    expect(getActionHandler("slack", "file_uploaded")).toBeUndefined();
  });

  it("does NOT yet register Slack actions deferred to later slices (user-token actions) and permanently skipped (find_user_by_email)", () => {
    // User-token actions land after P-S1 user-token storage.
    expect(getActionHandler("slack", "update_user_status")).toBeUndefined();
    expect(getActionHandler("slack", "set_user_presence")).toBeUndefined();
    // find_user_by_email permanently skipped per Slack 2.3 plan
    // §6 decision 3 (V1 orphan + PII scope).
    expect(getActionHandler("slack", "find_user_by_email")).toBeUndefined();
  });
});
