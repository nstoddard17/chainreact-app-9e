/**
 * @jest-environment node
 *
 * Tests for the Monday.com provider manifest — Slice 3.MONDAY-2.
 */
import { mondayManifest } from "@/integrations/monday/manifest";
import { getProvider, providerSupports } from "@/integrations/_registry";
import { listRegisteredHandlers } from "@/services/execution/handlers/_registry";

describe("monday manifest", () => {
  it("is registered in the provider registry under id 'monday'", () => {
    expect(getProvider("monday")).toBe(mondayManifest);
  });

  it("declares exactly the 11 accepted MONDAY-2 scopes", () => {
    // D-MON1: 11 scopes total. webhooks:write is REQUIRED per D-MON3.
    // account:read is EXCLUDED — V1's broader choice that nothing in
    // the planned action / trigger surface needs.
    expect(mondayManifest.scopes.required).toEqual([
      "me:read",
      "boards:read",
      "boards:write",
      "users:read",
      "updates:read",
      "updates:write",
      "assets:read",
      "assets:write",
      "webhooks:read",
      "webhooks:write",
      "workspaces:read",
    ]);
    expect(mondayManifest.scopes.optional).toEqual([]);
    expect(mondayManifest.scopes.deprecated).toEqual([]);
  });

  it("INCLUDES webhooks:write — D-MON3 required for MONDAY-5 webhook lifecycle", () => {
    expect(mondayManifest.scopes.required).toContain("webhooks:write");
    expect(mondayManifest.scopes.required).toContain("webhooks:read");
  });

  it("EXCLUDES account:read — D-MON1 dropped V1's broader choice", () => {
    expect(mondayManifest.scopes.required).not.toContain("account:read");
  });

  it("is refreshable: true", () => {
    expect(mondayManifest.refreshable).toBe(true);
  });

  it("uses tokenScope: user with accountIdField: email", () => {
    expect(mondayManifest.tokenScope).toBe("user");
    expect(mondayManifest.accountIdField).toBe("email");
  });

  it("declares MONDAY-2 honest capabilities (oauth + actions only)", () => {
    expect(mondayManifest.capabilities).toEqual({
      oauth: true,
      // Flips true in MONDAY-5 — Monday's per-workflow webhook lifecycle.
      webhookTrigger: false,
      // Stays false permanently — Monday triggers are webhook-only.
      pollingTrigger: false,
      // True — 10 action handlers ship in MONDAY-2.
      actions: true,
    });
    expect(providerSupports("monday", "oauth")).toBe(true);
    expect(providerSupports("monday", "actions")).toBe(true);
    expect(providerSupports("monday", "webhookTrigger")).toBe(false);
    expect(providerSupports("monday", "pollingTrigger")).toBe(false);
  });

  it("when actions: true, registers the full 24-action Monday surface (MONDAY-2 10 + MONDAY-4 14)", () => {
    // MONDAY-4 completed the remaining 14 V1 actions under the updated
    // provider-completion standard — all 24 V1 actions now ship.
    const registered = listRegisteredHandlers().filter(
      (h) => h.provider === "monday",
    );
    expect(registered.map((r) => r.type).sort()).toEqual([
      "add_column",
      "add_file",
      "archive_item",
      "create_board",
      "create_group",
      "create_item",
      "create_subitem",
      "create_update",
      "delete_item",
      "download_file",
      "duplicate_board",
      "duplicate_item",
      "get_board",
      "get_item",
      "get_user",
      "list_boards",
      "list_groups",
      "list_items",
      "list_subitems",
      "list_updates",
      "list_users",
      "move_item",
      "search_items",
      "update_item",
    ]);
  });

  it("uses 12h health-check interval (Others bucket in CLAUDE.md)", () => {
    expect(mondayManifest.healthCheckIntervalMs).toBe(12 * 60 * 60 * 1000);
  });

  it("declares apiVersion '2024-01' (matches V1's pinned API header)", () => {
    expect(mondayManifest.apiVersion).toBe("2024-01");
  });

  it("declares oauthFlows: ['v2']", () => {
    expect(mondayManifest.oauthFlows).toEqual(["v2"]);
  });

  it("isEnabled: true (no experimental flag)", () => {
    expect(mondayManifest.isEnabled).toBe(true);
    expect(mondayManifest.isExperimental).toBe(false);
  });

  it("displayName is 'monday.com' (lowercase per brand)", () => {
    expect(mondayManifest.displayName).toBe("monday.com");
  });
});
