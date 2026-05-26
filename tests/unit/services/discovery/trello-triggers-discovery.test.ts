/**
 * @jest-environment node
 *
 * Slice 4.TRELLO-META-3 — Trello trigger discovery coverage.
 *
 * Pins the 6 per-board webhook triggers: keys + displayOrder, webhook
 * activation, the single boardId picker (→ trello:boards, required, no
 * dep), the shared payload shape, and the sensitive payload fields
 * (cardDesc / commentText / oldValues / body). The activation-registry
 * side is pinned by tests/structure/trigger-meta-activation-invariant.test.ts.
 */
import {
  getTriggerMeta,
  listTriggerMetasForProvider,
} from "@/services/discovery/_registry";

const EXPECTED_KEYS_IN_ORDER = [
  "trello:new_card",
  "trello:card_updated",
  "trello:card_moved",
  "trello:comment_added",
  "trello:member_changed",
  "trello:card_archived",
];

describe("trello trigger discovery — surface", () => {
  it("registers exactly the 6 webhook triggers in displayOrder", () => {
    const metas = listTriggerMetasForProvider("trello");
    expect(metas.map((m) => m.key)).toEqual(EXPECTED_KEYS_IN_ORDER);
    const orders = metas.map((m) => m.displayOrder);
    expect(orders[0]).toBe(10);
    expect(orders[orders.length - 1]).toBe(60);
    for (let i = 1; i < orders.length; i++) {
      expect(orders[i]!).toBeGreaterThan(orders[i - 1]!);
    }
  });

  it("each is a webhook trigger requiring an integration, category data", () => {
    for (const m of listTriggerMetasForProvider("trello")) {
      expect(m.provider).toBe("trello");
      expect(m.key).toBe(`trello:${m.type}`);
      expect(m.activation).toBe("webhook");
      expect(m.requiresIntegration).toBe(true);
      expect(m.category).toBe("data");
    }
  });

  it("each trigger's only config field is boardId → trello:boards (required, no dep)", () => {
    for (const m of listTriggerMetasForProvider("trello")) {
      expect(m.fields.map((f) => f.name)).toEqual(["boardId"]);
      const board = m.fields[0]!;
      expect(board.optionsSource).toBe("trello:boards");
      expect(board.required).toBe(true);
      expect(board.dependsOn).toBeUndefined();
      expect(board.type).toBe("combobox");
    }
  });

  it("no trigger field references the rejected checklist resolvers", () => {
    for (const m of listTriggerMetasForProvider("trello")) {
      for (const f of m.fields) {
        expect(f.optionsSource).not.toBe("trello:checklists");
        expect(f.optionsSource).not.toBe("trello:check_items");
      }
    }
  });
});

describe("trello trigger discovery — payload shape", () => {
  it("all 6 triggers share the same payload shape", () => {
    const shapes = listTriggerMetasForProvider("trello").map((m) =>
      m.payloadShape.map((p) => p.name).join(","),
    );
    const unique = new Set(shapes);
    expect(unique.size).toBe(1);
  });

  it("content payload fields are sensitive; ids/names/dates are not", () => {
    for (const key of EXPECTED_KEYS_IN_ORDER) {
      const t = getTriggerMeta(key)!;
      const byName = new Map(t.payloadShape.map((p) => [p.name, p]));
      for (const name of ["cardDesc", "commentText", "oldValues", "body"]) {
        expect(byName.get(name)!.sensitive).toBe(true);
      }
      for (const name of [
        "cardId",
        "boardId",
        "actionType",
        "classifiedType",
        "listId",
        "memberId",
        "memberName",
        "date",
      ]) {
        expect(byName.get(name)!.sensitive).not.toBe(true);
      }
    }
  });

  it("no secret-shaped payload names", () => {
    const BANNED = [
      "token",
      "accessToken",
      "refreshToken",
      "apiKey",
      "secret",
      "webhookSecret",
      "password",
      "email",
    ];
    for (const m of listTriggerMetasForProvider("trello")) {
      const names = m.payloadShape.map((p) => p.name);
      for (const b of BANNED) expect(names).not.toContain(b);
    }
  });
});
