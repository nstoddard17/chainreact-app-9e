import {
  getActionHandler,
  listRegisteredHandlers,
} from "@/services/execution/handlers/_registry";

/**
 * Registry assertion for Slice 17 Commit 4 — all 8 Trello action
 * handlers are registered under the `trello` provider id with their
 * approved type names.
 */
const APPROVED_TYPES = [
  "create_card",
  "update_card",
  "move_card",
  "archive_card",
  "add_comment",
  "add_label_to_card",
  "create_list",
  "create_board",
] as const;

describe("Trello handler registry (Slice 17 Commit 4)", () => {
  it.each(APPROVED_TYPES)("registers trello:%s", (type) => {
    expect(getActionHandler("trello", type)).toBeDefined();
  });

  it("does NOT register types deferred from Batch 1", () => {
    expect(getActionHandler("trello", "add_checklist")).toBeUndefined();
    expect(getActionHandler("trello", "create_checklist_item")).toBeUndefined();
    expect(getActionHandler("trello", "get_cards")).toBeUndefined();
  });

  it("listRegisteredHandlers includes all 8 trello entries", () => {
    const trelloHandlers = listRegisteredHandlers().filter(
      (h) => h.provider === "trello",
    );
    expect(trelloHandlers.length).toBe(APPROVED_TYPES.length);
    const types = new Set(trelloHandlers.map((h) => h.type));
    for (const t of APPROVED_TYPES) {
      expect(types.has(t)).toBe(true);
    }
  });
});
