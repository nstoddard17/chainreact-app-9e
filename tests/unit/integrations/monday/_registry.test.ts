/**
 * @jest-environment node
 *
 * Slice 3.MONDAY-2 — Monday.com handler-registry coverage.
 *
 * Pins:
 *   - All 10 MONDAY-2 action handlers register.
 *   - No duplicates.
 *   - 14 deferred actions are NOT registered.
 *   - Provider manifest registry returns the Monday manifest.
 */
import {
  getProvider,
  listProviders,
  providerSupports,
} from "@/integrations/_registry";
import { mondayManifest } from "@/integrations/monday/manifest";
import { listRegisteredHandlers } from "@/services/execution/handlers/_registry";

const EXPECTED_ACTION_TYPES = [
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
].sort();

const DEFERRED_ACTION_TYPES = [
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

describe("monday handler registry", () => {
  it("registers exactly 10 action handlers (MONDAY-2 subset, NOT all 24)", () => {
    const handlers = listRegisteredHandlers().filter(
      (h) => h.provider === "monday",
    );
    expect(handlers).toHaveLength(10);
  });

  it("registers every expected MONDAY-2 action type", () => {
    const handlers = listRegisteredHandlers().filter(
      (h) => h.provider === "monday",
    );
    expect(handlers.map((h) => h.type).sort()).toEqual(EXPECTED_ACTION_TYPES);
  });

  it("does NOT register any of the 14 deferred V1 Monday actions", () => {
    const handlers = listRegisteredHandlers().filter(
      (h) => h.provider === "monday",
    );
    const registeredTypes = new Set(handlers.map((h) => h.type));
    for (const deferred of DEFERRED_ACTION_TYPES) {
      expect(registeredTypes.has(deferred)).toBe(false);
    }
  });

  it("registers no duplicate (provider, type) pairs for Monday", () => {
    const handlers = listRegisteredHandlers().filter(
      (h) => h.provider === "monday",
    );
    const keys = handlers.map((h) => `${h.provider}:${h.type}`);
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

  it("providerSupports correctly reports MONDAY-2 capabilities", () => {
    expect(providerSupports("monday", "oauth")).toBe(true);
    expect(providerSupports("monday", "actions")).toBe(true);
    // webhookTrigger flips true in MONDAY-5.
    expect(providerSupports("monday", "webhookTrigger")).toBe(false);
    // pollingTrigger stays false permanently (D-MON2 — webhook-only).
    expect(providerSupports("monday", "pollingTrigger")).toBe(false);
  });
});
