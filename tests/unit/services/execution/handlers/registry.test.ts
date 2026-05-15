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

  it("registers the 4 Gmail 2.2 Commit 2 email lifecycle handlers", () => {
    expect(getActionHandler("gmail", "mark_as_read")).toBeDefined();
    expect(getActionHandler("gmail", "mark_as_unread")).toBeDefined();
    expect(getActionHandler("gmail", "archive_email")).toBeDefined();
    expect(getActionHandler("gmail", "delete_email")).toBeDefined();
    const registered = listRegisteredHandlers();
    expect(registered).toContainEqual({
      provider: "gmail",
      type: "mark_as_read",
    });
    expect(registered).toContainEqual({
      provider: "gmail",
      type: "mark_as_unread",
    });
    expect(registered).toContainEqual({
      provider: "gmail",
      type: "archive_email",
    });
    expect(registered).toContainEqual({
      provider: "gmail",
      type: "delete_email",
    });
  });

  it("registers search_emails (Gmail 2.2 Commit 3 — advancedSearch folded as searchMode)", () => {
    expect(getActionHandler("gmail", "search_emails")).toBeDefined();
    expect(listRegisteredHandlers()).toContainEqual({
      provider: "gmail",
      type: "search_emails",
    });
  });

  it("does NOT register a separate gmail:advanced_search action (folded into search_emails per parity decision 1)", () => {
    expect(getActionHandler("gmail", "advanced_search")).toBeUndefined();
    expect(listRegisteredHandlers()).not.toContainEqual({
      provider: "gmail",
      type: "advanced_search",
    });
  });

  it("returns undefined for (provider, type) pairs that no slice has registered yet", () => {
    // find_user_by_email is permanently skipped per Slack 2.3 plan
    // §6 decision 3 (PII scope; V1 orphan).
    expect(getActionHandler("slack", "find_user_by_email")).toBeUndefined();
  });

  it("registers get_attachment (Gmail 2.3 Commit 5 — P-S3 FileRef output)", () => {
    expect(getActionHandler("gmail", "get_attachment")).toBeDefined();
    expect(listRegisteredHandlers()).toContainEqual({
      provider: "gmail",
      type: "get_attachment",
    });
  });

  it("does NOT register a separate gmail:download_attachment action (folded into get_attachment per Gmail 2.3 plan §8 decision 13.1)", () => {
    expect(getActionHandler("gmail", "download_attachment")).toBeUndefined();
    expect(listRegisteredHandlers()).not.toContainEqual({
      provider: "gmail",
      type: "download_attachment",
    });
  });

  it("registers the 2 Microsoft Excel parity Commit 1 row lifecycle handlers (update_row, delete_row)", () => {
    expect(getActionHandler("microsoft-excel", "update_row")).toBeDefined();
    expect(getActionHandler("microsoft-excel", "delete_row")).toBeDefined();
    const registered = listRegisteredHandlers();
    expect(registered).toContainEqual({
      provider: "microsoft-excel",
      type: "update_row",
    });
    expect(registered).toContainEqual({
      provider: "microsoft-excel",
      type: "delete_row",
    });
  });

  it("registers the 2 Microsoft Excel parity Commit 2 worksheet lifecycle handlers (rename_worksheet, delete_worksheet)", () => {
    expect(
      getActionHandler("microsoft-excel", "rename_worksheet"),
    ).toBeDefined();
    expect(
      getActionHandler("microsoft-excel", "delete_worksheet"),
    ).toBeDefined();
    const registered = listRegisteredHandlers();
    expect(registered).toContainEqual({
      provider: "microsoft-excel",
      type: "rename_worksheet",
    });
    expect(registered).toContainEqual({
      provider: "microsoft-excel",
      type: "delete_worksheet",
    });
  });

  it("does NOT register a separate microsoft-excel:add_multiple_rows action (folds into add_row batch mode per parity-microsoft-excel.md §7)", () => {
    expect(
      getActionHandler("microsoft-excel", "add_multiple_rows"),
    ).toBeUndefined();
    expect(listRegisteredHandlers()).not.toContainEqual({
      provider: "microsoft-excel",
      type: "add_multiple_rows",
    });
  });

  it("does NOT register a separate microsoft-excel:create_workbook action (deferred per parity-microsoft-excel.md §7 — ExcelJS binary dep)", () => {
    expect(
      getActionHandler("microsoft-excel", "create_workbook"),
    ).toBeUndefined();
    expect(listRegisteredHandlers()).not.toContainEqual({
      provider: "microsoft-excel",
      type: "create_workbook",
    });
  });

  it("registers the 2 Notion 2.1 Commit 1 page lifecycle handlers (archive_page, restore_page)", () => {
    expect(getActionHandler("notion", "archive_page")).toBeDefined();
    expect(getActionHandler("notion", "restore_page")).toBeDefined();
    const registered = listRegisteredHandlers();
    expect(registered).toContainEqual({
      provider: "notion",
      type: "archive_page",
    });
    expect(registered).toContainEqual({
      provider: "notion",
      type: "restore_page",
    });
  });

  it("registers the 2 Notion 2.1 Commit 2 user lookup handlers (get_user, list_users)", () => {
    expect(getActionHandler("notion", "get_user")).toBeDefined();
    expect(getActionHandler("notion", "list_users")).toBeDefined();
    const registered = listRegisteredHandlers();
    expect(registered).toContainEqual({
      provider: "notion",
      type: "get_user",
    });
    expect(registered).toContainEqual({
      provider: "notion",
      type: "list_users",
    });
  });

  it("registers the 2 Notion 2.1 Commit 3 comment handlers (create_comment, list_comments)", () => {
    expect(getActionHandler("notion", "create_comment")).toBeDefined();
    expect(getActionHandler("notion", "list_comments")).toBeDefined();
    const registered = listRegisteredHandlers();
    expect(registered).toContainEqual({
      provider: "notion",
      type: "create_comment",
    });
    expect(registered).toContainEqual({
      provider: "notion",
      type: "list_comments",
    });
  });

  it("registers the 2 Google Sheets 2.1 Commit 1 cell handlers (get_cell_value, update_cell)", () => {
    expect(getActionHandler("google-sheets", "get_cell_value")).toBeDefined();
    expect(getActionHandler("google-sheets", "update_cell")).toBeDefined();
    const registered = listRegisteredHandlers();
    expect(registered).toContainEqual({
      provider: "google-sheets",
      type: "get_cell_value",
    });
    expect(registered).toContainEqual({
      provider: "google-sheets",
      type: "update_cell",
    });
  });

  it("registers the 2 Google Sheets 2.1 Commit 2 row handlers (delete_row, find_row)", () => {
    expect(getActionHandler("google-sheets", "delete_row")).toBeDefined();
    expect(getActionHandler("google-sheets", "find_row")).toBeDefined();
    const registered = listRegisteredHandlers();
    expect(registered).toContainEqual({
      provider: "google-sheets",
      type: "delete_row",
    });
    expect(registered).toContainEqual({
      provider: "google-sheets",
      type: "find_row",
    });
  });

  it("registers the Google Sheets 2.1 Commit 3 lifecycle handler (create_spreadsheet)", () => {
    expect(getActionHandler("google-sheets", "create_spreadsheet")).toBeDefined();
    expect(listRegisteredHandlers()).toContainEqual({
      provider: "google-sheets",
      type: "create_spreadsheet",
    });
  });

  it("registers the Google Sheets 2.2 Commit 2 batch update handler (batch_update)", () => {
    expect(getActionHandler("google-sheets", "batch_update")).toBeDefined();
    expect(listRegisteredHandlers()).toContainEqual({
      provider: "google-sheets",
      type: "batch_update",
    });
  });

  it("registers the Google Sheets 2.2 Commit 3 format range handler (format_range)", () => {
    expect(getActionHandler("google-sheets", "format_range")).toBeDefined();
    expect(listRegisteredHandlers()).toContainEqual({
      provider: "google-sheets",
      type: "format_range",
    });
  });

  it("registers the 3 Notion 2.1 Commit 4 handlers (create_database, get_block, get_block_children)", () => {
    expect(getActionHandler("notion", "create_database")).toBeDefined();
    expect(getActionHandler("notion", "get_block")).toBeDefined();
    expect(getActionHandler("notion", "get_block_children")).toBeDefined();
    const registered = listRegisteredHandlers();
    expect(registered).toContainEqual({
      provider: "notion",
      type: "create_database",
    });
    expect(registered).toContainEqual({
      provider: "notion",
      type: "get_block",
    });
    expect(registered).toContainEqual({
      provider: "notion",
      type: "get_block_children",
    });
  });

  it("registers create_multiple_records (Airtable 2.1 Commit 3 — true batch create)", () => {
    expect(
      getActionHandler("airtable", "create_multiple_records"),
    ).toBeDefined();
    expect(listRegisteredHandlers()).toContainEqual({
      provider: "airtable",
      type: "create_multiple_records",
    });
  });

  it("registers update_multiple_records (Airtable 2.1 Commit 4 — true batch update)", () => {
    expect(
      getActionHandler("airtable", "update_multiple_records"),
    ).toBeDefined();
    expect(listRegisteredHandlers()).toContainEqual({
      provider: "airtable",
      type: "update_multiple_records",
    });
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

  it("registers all 11 Shopify actions (Slice 12 Commit 3 + Shopify 2.1 Commit 1)", () => {
    const expected = [
      "create_order",
      "update_order_status",
      "add_order_note",
      "create_fulfillment",
      "create_product",
      "update_product",
      "create_product_variant",
      "update_product_variant",
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

  it("registers update_product_variant (Shopify 2.1 Commit 1 — closes the parity-shopify §5 gap)", () => {
    expect(getActionHandler("shopify", "update_product_variant")).toBeDefined();
    expect(listRegisteredHandlers()).toContainEqual({
      provider: "shopify",
      type: "update_product_variant",
    });
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
