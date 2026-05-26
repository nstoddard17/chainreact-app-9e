/**
 * @jest-environment node
 *
 * Slice 4.TRELLO-META-3 — Trello discovery-registry coverage.
 *
 * Pins the full 8-action Trello surface: keys in displayOrder,
 * key===provider:type, category 'data', camelCase fields, resolver wiring
 * (boards root + lists/cards/members/labels dependsOn boardId — all
 * single-parent), the UI-scope boardId on card-targeted actions, the real
 * create_list.idBoard, create_board's explicit visibility select with the
 * public-visibility warning, all-medium / none-destructive risk, sensitive
 * desc/comment outputs, and the rejected checklist resolvers staying
 * absent. Trigger assertions live in trello-triggers-discovery.test.ts.
 */
import {
  getActionMeta,
  listActionMetasForProvider,
  listProvidersWithMetadata,
} from "@/services/discovery/_registry";

const EXPECTED_KEYS_IN_ORDER = [
  "trello:create_card",
  "trello:update_card",
  "trello:move_card",
  "trello:archive_card",
  "trello:add_comment",
  "trello:add_label_to_card",
  "trello:create_list",
  "trello:create_board",
];

/** The 6 card-targeted actions that carry the optional UI-scope boardId. */
const CARD_TARGETED = [
  "trello:create_card",
  "trello:update_card",
  "trello:move_card",
  "trello:archive_card",
  "trello:add_comment",
  "trello:add_label_to_card",
];

describe("trello discovery — surface", () => {
  it("registers exactly 8 action metas in displayOrder", () => {
    const metas = listActionMetasForProvider("trello");
    expect(metas).toHaveLength(8);
    expect(metas.map((m) => m.key)).toEqual(EXPECTED_KEYS_IN_ORDER);
  });

  it("every key equals provider:type and provider is 'trello'", () => {
    for (const m of listActionMetasForProvider("trello")) {
      expect(m.provider).toBe("trello");
      expect(m.key).toBe(`trello:${m.type}`);
    }
  });

  it("every action is category 'data' + requiresIntegration", () => {
    for (const m of listActionMetasForProvider("trello")) {
      expect(m.category).toBe("data");
      expect(m.requiresIntegration).toBe(true);
    }
  });

  it("displayOrder is strictly ascending (10..80)", () => {
    const orders = listActionMetasForProvider("trello").map((m) => m.displayOrder);
    expect(orders[0]).toBe(10);
    expect(orders[orders.length - 1]).toBe(80);
    for (let i = 1; i < orders.length; i++) {
      expect(orders[i]!).toBeGreaterThan(orders[i - 1]!);
    }
  });

  it("trello is reported by listProvidersWithMetadata", () => {
    expect(listProvidersWithMetadata()).toContain("trello");
  });

  it("no Trello action produces or consumes a FileRef", () => {
    for (const m of listActionMetasForProvider("trello")) {
      expect(m.producesFileRef).toBe(false);
      expect(m.consumesFileRef).toBe(false);
    }
  });
});

describe("trello discovery — field hygiene + resolver wiring", () => {
  it("all field names are camelCase (mirror the runtime Zod schemas)", () => {
    for (const m of listActionMetasForProvider("trello")) {
      for (const f of m.fields) {
        expect(f.name).toMatch(/^[a-z][a-zA-Z0-9]*$/);
      }
    }
  });

  it("card-targeted actions carry an optional UI-scope boardId → trello:boards (no dep)", () => {
    for (const key of CARD_TARGETED) {
      const board = getActionMeta(key)!.fields.find((f) => f.name === "boardId")!;
      expect(board.optionsSource).toBe("trello:boards");
      expect(board.dependsOn).toBeUndefined();
      expect(board.required).toBe(false);
      expect(board.type).toBe("combobox");
    }
  });

  it("create_list.idBoard is a REAL required board field → trello:boards (no dep)", () => {
    const idBoard = getActionMeta("trello:create_list")!.fields.find(
      (f) => f.name === "idBoard",
    )!;
    expect(idBoard.optionsSource).toBe("trello:boards");
    expect(idBoard.dependsOn).toBeUndefined();
    expect(idBoard.required).toBe(true);
  });

  it("create_board has NO board field (it creates the board)", () => {
    const fields = getActionMeta("trello:create_board")!.fields.map((f) => f.name);
    expect(fields).not.toContain("boardId");
    expect(fields).not.toContain("idBoard");
  });

  it("list fields use trello:lists dependsOn boardId", () => {
    expect(
      getActionMeta("trello:create_card")!.fields.find((f) => f.name === "listId"),
    ).toMatchObject({ optionsSource: "trello:lists", dependsOn: "boardId" });
    for (const key of ["trello:move_card", "trello:update_card"]) {
      expect(
        getActionMeta(key)!.fields.find((f) => f.name === "idList"),
      ).toMatchObject({ optionsSource: "trello:lists", dependsOn: "boardId" });
    }
  });

  it("cardId fields use trello:cards dependsOn boardId", () => {
    for (const key of [
      "trello:update_card",
      "trello:move_card",
      "trello:archive_card",
      "trello:add_comment",
      "trello:add_label_to_card",
    ]) {
      const cardId = getActionMeta(key)!.fields.find((f) => f.name === "cardId")!;
      expect(cardId.optionsSource).toBe("trello:cards");
      expect(cardId.dependsOn).toBe("boardId");
    }
  });

  it("create_card.idMembers → trello:members (dep boardId, multiple)", () => {
    const members = getActionMeta("trello:create_card")!.fields.find(
      (f) => f.name === "idMembers",
    )!;
    expect(members.optionsSource).toBe("trello:members");
    expect(members.dependsOn).toBe("boardId");
    expect(members.multiple).toBe(true);
  });

  it("label fields use trello:labels dependsOn boardId (idLabels multiple)", () => {
    const idLabels = getActionMeta("trello:create_card")!.fields.find(
      (f) => f.name === "idLabels",
    )!;
    expect(idLabels.optionsSource).toBe("trello:labels");
    expect(idLabels.dependsOn).toBe("boardId");
    expect(idLabels.multiple).toBe(true);

    const labelId = getActionMeta("trello:add_label_to_card")!.fields.find(
      (f) => f.name === "labelId",
    )!;
    expect(labelId.optionsSource).toBe("trello:labels");
    expect(labelId.dependsOn).toBe("boardId");
  });

  it("create_board.visibility is a required static select (private/workspace/public) with NO default", () => {
    const v = getActionMeta("trello:create_board")!.fields.find(
      (f) => f.name === "visibility",
    )!;
    expect(v.type).toBe("select");
    expect(v.required).toBe(true);
    expect(v.defaultValue).toBeUndefined();
    expect(v.optionsSource).toBeUndefined();
    expect(v.options!.map((o) => o.value)).toEqual([
      "private",
      "workspace",
      "public",
    ]);
    // Public-visibility warning is surfaced as inline helper text.
    expect(v.description!.toLowerCase()).toContain("public");
    expect(v.description!.toLowerCase()).toContain("outside");
  });

  it("no field anywhere references the rejected checklist resolvers", () => {
    for (const m of listActionMetasForProvider("trello")) {
      for (const f of m.fields) {
        expect(f.optionsSource).not.toBe("trello:checklists");
        expect(f.optionsSource).not.toBe("trello:check_items");
      }
    }
  });

  it("no secret-shaped output names anywhere", () => {
    const BANNED = [
      "token",
      "accessToken",
      "refreshToken",
      "apiKey",
      "clientSecret",
      "secret",
      "webhookSecret",
      "password",
      "email",
    ];
    for (const m of listActionMetasForProvider("trello")) {
      const names = m.outputs.map((o) => o.name);
      for (const banned of BANNED) expect(names).not.toContain(banned);
    }
  });
});

describe("trello discovery — risk (all medium, none destructive)", () => {
  it("every action is medium risk", () => {
    for (const m of listActionMetasForProvider("trello")) {
      expect(m.riskLevel).toBe("medium");
    }
  });

  it("no action is destructive or requires confirmation (archive_card is reversible; no deletes)", () => {
    for (const m of listActionMetasForProvider("trello")) {
      expect(m.isDestructive).toBe(false);
      expect(m.requiresConfirmation).toBe(false);
    }
  });
});

describe("trello discovery — sensitive outputs", () => {
  it("add_comment.text output is sensitive", () => {
    const o = getActionMeta("trello:add_comment")!.outputs.find(
      (x) => x.name === "text",
    )!;
    expect(o.sensitive).toBe(true);
  });

  it("desc outputs (user Markdown) are sensitive on create/update card + create_board", () => {
    for (const key of [
      "trello:create_card",
      "trello:update_card",
      "trello:create_board",
    ]) {
      const o = getActionMeta(key)!.outputs.find((x) => x.name === "desc")!;
      expect(o.sensitive).toBe(true);
    }
  });

  it("ids / names / urls are NOT marked sensitive", () => {
    const NON_SENSITIVE = new Set([
      "cardId",
      "boardId",
      "listId",
      "idBoard",
      "idList",
      "name",
      "url",
      "shortUrl",
      "pos",
      "closed",
      "commentId",
      "idOrganization",
      "visibility",
    ]);
    for (const m of listActionMetasForProvider("trello")) {
      for (const o of m.outputs) {
        if (NON_SENSITIVE.has(o.name)) expect(o.sensitive).not.toBe(true);
      }
    }
  });
});
