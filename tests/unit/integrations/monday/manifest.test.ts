/**
 * @jest-environment node
 *
 * Tests for the Monday.com provider manifest — Slice 3.MONDAY-2.
 */
import { mondayManifest } from "@/integrations/monday/manifest";
import { getProvider, providerSupports } from "@/integrations/_registry";
import { listRegisteredHandlers } from "@/services/execution/handlers/_registry";

import { listProviders } from "@/integrations/_registry";
describe("monday manifest", () => {
  it("is registered in the provider registry under id 'monday'", () => {
    expect(getProvider("monday")).toBe(mondayManifest);
  });

  it("declares exactly the 10 accepted MONDAY-2 scopes", () => {
    // D-MON1: 10 scopes total. webhooks:write is REQUIRED per D-MON3.
    // account:read is EXCLUDED — V1's broader choice that nothing in
    // the planned action / trigger surface needs. assets:write is
    // EXCLUDED — Monday's developer portal exposes no such scope;
    // uploads are authorized by assets:read + boards:write.
    expect(mondayManifest.scopes.required).toEqual([
      "me:read",
      "boards:read",
      "boards:write",
      "users:read",
      "updates:read",
      "updates:write",
      "assets:read",
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

  it("declares MONDAY-7 capabilities (oauth + actions + webhookTrigger)", () => {
    expect(mondayManifest.capabilities).toEqual({
      oauth: true,
      // Flipped true in MONDAY-7 — Monday's per-workflow create_webhook /
      // delete_webhook lifecycle backs the 5 webhook triggers.
      webhookTrigger: true,
      // Stays false permanently — Monday triggers are webhook-only (D-MON2).
      pollingTrigger: false,
      // True — full 24-action Monday surface.
      actions: true,
    });
    expect(providerSupports("monday", "oauth")).toBe(true);
    expect(providerSupports("monday", "actions")).toBe(true);
    expect(providerSupports("monday", "webhookTrigger")).toBe(true);
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

// ---------------------------------------------------------------------------
// Merged from the former sibling _registry.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1B; same production imports, all
// assertions preserved verbatim).
// Slice 3.MONDAY-2 + MONDAY-4 — Monday.com handler-registry coverage.
// MONDAY-4 completed the remaining 14 V1 actions under the updated
// provider-completion standard — the registry now holds the full 24-
// action V1 parity surface.
// Pins:
// - All 24 V1 action handlers register.
// - No duplicates.
// - Provider manifest registry returns the Monday manifest.
// ---------------------------------------------------------------------------

// MONDAY-2 (10).
const MONDAY_2_ACTION_TYPES = [
  "create_item",
  "update_item",
  "create_update",
  "create_subitem",
  "delete_item",
  "move_item",
  "get_item",
  "list_items",
  "list_boards",
  "list_users",
];

// MONDAY-4 (14) — every previously-deferred action now ships.
const MONDAY_4_ACTION_TYPES = [
  "archive_item",
  "duplicate_item",
  "create_board",
  "create_group",
  "duplicate_board",
  "add_column",
  "search_items",
  "list_subitems",
  "list_updates",
  "get_board",
  "list_groups",
  "get_user",
  "add_file",
  "download_file",
];

const EXPECTED_ACTION_TYPES = [
  ...MONDAY_2_ACTION_TYPES,
  ...MONDAY_4_ACTION_TYPES,
].sort();

describe("monday handler registry", () => {
  it("registers exactly 24 action handlers (full V1 parity after MONDAY-4)", () => {
    const handlers = listRegisteredHandlers().filter(
      (h) => h.provider === "monday",
    );
    expect(handlers).toHaveLength(24);
  });

  it("registers every expected V1 action type (MONDAY-2 10 + MONDAY-4 14)", () => {
    const handlers = listRegisteredHandlers().filter(
      (h) => h.provider === "monday",
    );
    expect(handlers.map((h) => h.type).sort()).toEqual(EXPECTED_ACTION_TYPES);
  });

  it("registers all 14 previously-deferred actions (MONDAY-4 completion)", () => {
    const handlers = listRegisteredHandlers().filter(
      (h) => h.provider === "monday",
    );
    const registeredTypes = new Set(handlers.map((h) => h.type));
    for (const shipped of MONDAY_4_ACTION_TYPES) {
      expect(registeredTypes.has(shipped)).toBe(true);
    }
  });

  it("registers no duplicate (provider, type) pairs for Monday", () => {
    const handlers = listRegisteredHandlers().filter(
      (h) => h.provider === "monday",
    );
    const keys = handlers.map((h) => `${h.provider}:${h.type}`);
    // Fail-closed floor: an empty registry would make the set/length
    // comparison vacuously true (PROVIDER-CONTRACT-CONSOLIDATION-1B).
    expect(keys).toHaveLength(EXPECTED_ACTION_TYPES.length);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("monday provider registry", () => {
  it("returns the Monday manifest under id 'monday'", () => {
    expect(getProvider("monday")).toBe(mondayManifest);
  });

  it("listProviders includes 'monday'", () => {
    expect(listProviders().some((p) => p.id === "monday")).toBe(true);
  });

  it("providerSupports correctly reports Monday capabilities", () => {
    expect(providerSupports("monday", "oauth")).toBe(true);
    expect(providerSupports("monday", "actions")).toBe(true);
    // webhookTrigger flipped true in MONDAY-7 (create_webhook lifecycle).
    expect(providerSupports("monday", "webhookTrigger")).toBe(true);
    // pollingTrigger stays false permanently (D-MON2 — webhook-only).
    expect(providerSupports("monday", "pollingTrigger")).toBe(false);
  });
});
