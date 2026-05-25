/**
 * @jest-environment node
 *
 * Slice 3.MONDAY-7 — Monday trigger discovery + activation wiring.
 *
 * Pins: 5 webhook trigger metas registered (24 actions unchanged),
 * key===provider:type, webhook activation mode, board/column cascade
 * wiring, sensitive payload flags, no secret-shaped payload names, and
 * that each trigger has a registered activation + deactivation hook (the
 * trigger-meta-activation-invariant is also enforced structurally, but
 * this pins the per-key wiring directly).
 */
// Force-load provider modules so activations register at module init.
import "@/integrations/_registry";
import {
  getTriggerMeta,
  listActionMetasForProvider,
  listTriggerMetasForProvider,
} from "@/services/discovery/_registry";
import { findActivation } from "@/services/triggers/activationRegistry";
import { findDeactivation } from "@/services/triggers/deactivationRegistry";

const EXPECTED_TRIGGER_KEYS = [
  "monday:new_item",
  "monday:column_changed",
  "monday:item_moved",
  "monday:new_subitem",
  "monday:new_update",
];

describe("monday triggers — discovery surface", () => {
  it("registers exactly 5 webhook trigger metas in displayOrder", () => {
    const metas = listTriggerMetasForProvider("monday");
    expect(metas).toHaveLength(5);
    expect(metas.map((m) => m.key)).toEqual(EXPECTED_TRIGGER_KEYS);
    const orders = metas.map((m) => m.displayOrder);
    for (let i = 1; i < orders.length; i++) {
      expect(orders[i]!).toBeGreaterThan(orders[i - 1]!);
    }
  });

  it("keeps the 24-action surface unchanged", () => {
    expect(listActionMetasForProvider("monday")).toHaveLength(24);
  });

  it("every trigger is provider=monday, key=provider:type, webhook activation, requiresIntegration", () => {
    for (const m of listTriggerMetasForProvider("monday")) {
      expect(m.provider).toBe("monday");
      expect(m.key).toBe(`monday:${m.type}`);
      expect(m.activation).toBe("webhook");
      expect(m.requiresIntegration).toBe(true);
      expect(m.category).toBe("data");
    }
  });

  it("field + payload names are camelCase; no secret-shaped payload names", () => {
    const BANNED = [
      "token",
      "accessToken",
      "refreshToken",
      "apiKey",
      "clientSecret",
      "secret",
      "webhookSecret",
    ];
    for (const m of listTriggerMetasForProvider("monday")) {
      for (const f of m.fields) expect(f.name).toMatch(/^[a-z][a-zA-Z0-9]*$/);
      for (const o of m.payloadShape) {
        expect(o.name).toMatch(/^[a-z][a-zA-Z0-9]*$/);
        expect(BANNED).not.toContain(o.name);
      }
    }
  });
});

describe("monday triggers — cascade / optionsSource wiring", () => {
  it("board-only triggers wire boardId → monday:boards with NO deps", () => {
    for (const key of [
      "monday:new_item",
      "monday:item_moved",
      "monday:new_subitem",
      "monday:new_update",
    ]) {
      const m = getTriggerMeta(key)!;
      expect(m.fields.map((f) => f.name)).toEqual(["boardId"]);
      const board = m.fields[0]!;
      expect(board.type).toBe("combobox");
      expect(board.optionsSource).toBe("monday:boards");
      expect(board.dependsOn).toBeUndefined();
      expect(board.required).toBe(true);
    }
  });

  it("column_changed adds an OPTIONAL columnId → monday:columns dependsOn boardId", () => {
    const m = getTriggerMeta("monday:column_changed")!;
    const board = m.fields.find((f) => f.name === "boardId")!;
    const column = m.fields.find((f) => f.name === "columnId")!;
    expect(board.optionsSource).toBe("monday:boards");
    expect(board.required).toBe(true);
    expect(column.type).toBe("combobox");
    expect(column.optionsSource).toBe("monday:columns");
    expect(column.dependsOn).toBe("boardId");
    expect(column.required).toBe(false);
  });
});

describe("monday triggers — sensitive payload flags round-trip", () => {
  function sensitiveNames(key: string): string[] {
    return getTriggerMeta(key)!
      .payloadShape.filter((o) => o.sensitive === true)
      .map((o) => o.name)
      .sort();
  }

  it("new_item marks itemName + webUrl sensitive", () => {
    expect(sensitiveNames("monday:new_item")).toEqual(["itemName", "webUrl"]);
  });

  it("column_changed marks itemName + columnTitle + previousValue + newValue sensitive", () => {
    expect(sensitiveNames("monday:column_changed")).toEqual([
      "columnTitle",
      "itemName",
      "newValue",
      "previousValue",
    ]);
  });

  it("item_moved marks itemName sensitive", () => {
    expect(sensitiveNames("monday:item_moved")).toEqual(["itemName"]);
  });

  it("new_subitem marks subitemName sensitive", () => {
    expect(sensitiveNames("monday:new_subitem")).toEqual(["subitemName"]);
  });

  it("new_update marks body + posterName sensitive", () => {
    expect(sensitiveNames("monday:new_update")).toEqual(["body", "posterName"]);
  });
});

describe("monday triggers — activation wiring", () => {
  it("each trigger has a registered activation + deactivation hook", () => {
    for (const key of EXPECTED_TRIGGER_KEYS) {
      const type = key.split(":")[1]!;
      expect(findActivation("monday", type)).not.toBeNull();
      expect(findDeactivation("monday", type)).not.toBeNull();
    }
  });
});
