/**
 * @jest-environment node
 *
 * Slice 3.MONDAY-2 + MONDAY-4 — Monday.com handler-registry coverage.
 *
 * MONDAY-4 completed the remaining 14 V1 actions under the updated
 * provider-completion standard — the registry now holds the full 24-
 * action V1 parity surface.
 *
 * Pins:
 *   - All 24 V1 action handlers register.
 *   - No duplicates.
 *   - Provider manifest registry returns the Monday manifest.
 */
import {
  getProvider,
  listProviders,
  providerSupports,
} from "@/integrations/_registry";
import { mondayManifest } from "@/integrations/monday/manifest";
import { listRegisteredHandlers } from "@/services/execution/handlers/_registry";

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
    // webhookTrigger flips true in MONDAY-5.
    expect(providerSupports("monday", "webhookTrigger")).toBe(false);
    // pollingTrigger stays false permanently (D-MON2 — webhook-only).
    expect(providerSupports("monday", "pollingTrigger")).toBe(false);
  });
});
