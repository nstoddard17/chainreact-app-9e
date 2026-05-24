/**
 * @jest-environment node
 *
 * Slice 3.MONDAY-6 — Monday discovery-registry coverage.
 *
 * Pins the full 24-action Monday surface: all keys registered + sorted
 * by displayOrder, key===provider:type, camelCase field/output names,
 * no secret-shaped outputs, resolver wiring on cascade fields, risk
 * classifications, FileRef flags, and that the 14 formerly-deferred
 * actions are present. No Monday trigger metas (staged for MONDAY-7).
 */
import {
  getActionMeta,
  listActionMetasForProvider,
  listTriggerMetasForProvider,
} from "@/services/discovery/_registry";

const EXPECTED_KEYS_IN_ORDER = [
  "monday:create_item",
  "monday:update_item",
  "monday:get_item",
  "monday:list_items",
  "monday:search_items",
  "monday:move_item",
  "monday:duplicate_item",
  "monday:archive_item",
  "monday:delete_item",
  "monday:create_subitem",
  "monday:list_subitems",
  "monday:create_update",
  "monday:list_updates",
  "monday:list_boards",
  "monday:get_board",
  "monday:create_board",
  "monday:duplicate_board",
  "monday:create_group",
  "monday:list_groups",
  "monday:add_column",
  "monday:list_users",
  "monday:get_user",
  "monday:add_file",
  "monday:download_file",
];

// The 14 actions that were "deferred" at MONDAY-1 and completed in
// MONDAY-4 — all must be present in the metadata surface now.
const FORMERLY_DEFERRED = [
  "monday:archive_item",
  "monday:duplicate_item",
  "monday:create_board",
  "monday:create_group",
  "monday:duplicate_board",
  "monday:add_column",
  "monday:search_items",
  "monday:list_subitems",
  "monday:list_updates",
  "monday:get_board",
  "monday:list_groups",
  "monday:get_user",
  "monday:add_file",
  "monday:download_file",
];

describe("monday discovery — surface", () => {
  it("registers exactly 24 action metas in displayOrder", () => {
    const metas = listActionMetasForProvider("monday");
    expect(metas).toHaveLength(24);
    expect(metas.map((m) => m.key)).toEqual(EXPECTED_KEYS_IN_ORDER);
  });

  it("registers NO Monday trigger metas yet (staged for MONDAY-7)", () => {
    expect(listTriggerMetasForProvider("monday")).toEqual([]);
  });

  it("includes all 14 formerly-deferred actions", () => {
    const keys = new Set(listActionMetasForProvider("monday").map((m) => m.key));
    for (const k of FORMERLY_DEFERRED) expect(keys.has(k)).toBe(true);
  });

  it("every key equals provider:type and provider is 'monday'", () => {
    for (const m of listActionMetasForProvider("monday")) {
      expect(m.provider).toBe("monday");
      expect(m.key).toBe(`monday:${m.type}`);
    }
  });

  it("displayOrder is strictly ascending (10..240)", () => {
    const orders = listActionMetasForProvider("monday").map((m) => m.displayOrder);
    for (let i = 1; i < orders.length; i++) {
      expect(orders[i]!).toBeGreaterThan(orders[i - 1]!);
    }
  });
});

describe("monday discovery — field + output hygiene", () => {
  it("all field names are camelCase", () => {
    for (const m of listActionMetasForProvider("monday")) {
      for (const f of m.fields) {
        expect(f.name).toMatch(/^[a-z][a-zA-Z0-9]*$/);
      }
    }
  });

  it("all output names are camelCase", () => {
    for (const m of listActionMetasForProvider("monday")) {
      for (const o of m.outputs) {
        expect(o.name).toMatch(/^[a-z][a-zA-Z0-9]*$/);
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
      "bytes",
      "base64",
    ];
    for (const m of listActionMetasForProvider("monday")) {
      const names = m.outputs.map((o) => o.name);
      for (const banned of BANNED) expect(names).not.toContain(banned);
    }
  });

  it("suspicious-named outputs (body / email / users) are marked sensitive", () => {
    const createUpdate = getActionMeta("monday:create_update")!;
    expect(createUpdate.outputs.find((o) => o.name === "body")!.sensitive).toBe(
      true,
    );
    const getUser = getActionMeta("monday:get_user")!;
    expect(getUser.outputs.find((o) => o.name === "email")!.sensitive).toBe(true);
    const listUsers = getActionMeta("monday:list_users")!;
    expect(listUsers.outputs.find((o) => o.name === "users")!.sensitive).toBe(
      true,
    );
  });
});

describe("monday discovery — resolver wiring (cascades)", () => {
  it("create_item: boardId→monday:boards (no dep), groupId→monday:groups (dep boardId)", () => {
    const m = getActionMeta("monday:create_item")!;
    const board = m.fields.find((f) => f.name === "boardId")!;
    const group = m.fields.find((f) => f.name === "groupId")!;
    expect(board.optionsSource).toBe("monday:boards");
    expect(board.dependsOn).toBeUndefined();
    expect(group.optionsSource).toBe("monday:groups");
    expect(group.dependsOn).toBe("boardId");
  });

  it("update_item: itemId→monday:items + columnId→monday:columns, both dep boardId", () => {
    const m = getActionMeta("monday:update_item")!;
    const item = m.fields.find((f) => f.name === "itemId")!;
    const col = m.fields.find((f) => f.name === "columnId")!;
    expect(item.optionsSource).toBe("monday:items");
    expect(item.dependsOn).toBe("boardId");
    expect(col.optionsSource).toBe("monday:columns");
    expect(col.dependsOn).toBe("boardId");
  });

  it("get_user: userId→monday:users (no dep)", () => {
    const m = getActionMeta("monday:get_user")!;
    const f = m.fields.find((f) => f.name === "userId")!;
    expect(f.optionsSource).toBe("monday:users");
    expect(f.dependsOn).toBeUndefined();
  });

  it("download_file: fileId→monday:item_files (dep columnId); columnId→monday:file_columns (dep boardId)", () => {
    const m = getActionMeta("monday:download_file")!;
    const col = m.fields.find((f) => f.name === "columnId")!;
    const fileId = m.fields.find((f) => f.name === "fileId")!;
    expect(col.optionsSource).toBe("monday:file_columns");
    expect(col.dependsOn).toBe("boardId");
    expect(fileId.optionsSource).toBe("monday:item_files");
    expect(fileId.dependsOn).toBe("columnId");
  });

  it("add_file: file column uses monday:file_columns (sentinel-capable resolver)", () => {
    const m = getActionMeta("monday:add_file")!;
    const col = m.fields.find((f) => f.name === "columnId")!;
    expect(col.optionsSource).toBe("monday:file_columns");
    expect(col.dependsOn).toBe("boardId");
  });
});

describe("monday discovery — UI-scope boardId on item-only actions", () => {
  it("each item-only action declares a boardId combobox for the cascade", () => {
    for (const key of [
      "monday:create_update",
      "monday:create_subitem",
      "monday:list_updates",
      "monday:list_subitems",
      "monday:add_file",
      "monday:download_file",
    ]) {
      const m = getActionMeta(key)!;
      const board = m.fields.find((f) => f.name === "boardId")!;
      expect(board).toBeDefined();
      expect(board.optionsSource).toBe("monday:boards");
      expect(board.dependsOn).toBeUndefined();
    }
  });
});

describe("monday discovery — risk classifications", () => {
  it("delete_item is high + destructive + requiresConfirmation", () => {
    const m = getActionMeta("monday:delete_item")!;
    expect(m.riskLevel).toBe("high");
    expect(m.isDestructive).toBe(true);
    expect(m.requiresConfirmation).toBe(true);
    expect(m.riskDescription).toBeDefined();
    // Structural-only output (no name/columns echoed).
    expect(m.outputs.map((o) => o.name).sort()).toEqual([
      "deletedAt",
      "deletedItemId",
      "success",
    ]);
  });

  it("archive_item is medium + recoverable (NOT destructive)", () => {
    const m = getActionMeta("monday:archive_item")!;
    expect(m.riskLevel).toBe("medium");
    expect(m.isDestructive).toBe(false);
    expect(m.requiresConfirmation).toBe(false);
  });

  it("write actions are medium; pure reads are low", () => {
    const medium = [
      "monday:create_item",
      "monday:update_item",
      "monday:create_update",
      "monday:create_subitem",
      "monday:move_item",
      "monday:duplicate_item",
      "monday:create_board",
      "monday:create_group",
      "monday:duplicate_board",
      "monday:add_column",
      "monday:add_file",
      "monday:download_file",
    ];
    for (const k of medium) expect(getActionMeta(k)!.riskLevel).toBe("medium");
    const low = [
      "monday:get_item",
      "monday:list_items",
      "monday:list_boards",
      "monday:list_users",
      "monday:search_items",
      "monday:list_subitems",
      "monday:list_updates",
      "monday:get_board",
      "monday:list_groups",
      "monday:get_user",
    ];
    for (const k of low) expect(getActionMeta(k)!.riskLevel).toBe("low");
  });

  it("no non-delete action sets isDestructive/requiresConfirmation", () => {
    for (const m of listActionMetasForProvider("monday")) {
      if (m.key === "monday:delete_item") continue;
      expect(m.isDestructive).toBe(false);
      expect(m.requiresConfirmation).toBe(false);
    }
  });
});

describe("monday discovery — FileRef flags", () => {
  it("add_file consumes a FileRef (consumesFileRef true, producesFileRef false)", () => {
    const m = getActionMeta("monday:add_file")!;
    expect(m.consumesFileRef).toBe(true);
    expect(m.producesFileRef).toBe(false);
    expect(m.category).toBe("files");
    expect(m.fields.find((f) => f.name === "file")!.type).toBe("file");
  });

  it("download_file produces a FileRef (producesFileRef true, consumesFileRef false)", () => {
    const m = getActionMeta("monday:download_file")!;
    expect(m.producesFileRef).toBe(true);
    expect(m.consumesFileRef).toBe(false);
    expect(m.category).toBe("files");
    expect(m.outputs.find((o) => o.name === "file")!.type).toBe("fileRef");
  });

  it("no other Monday action declares FileRef flags", () => {
    for (const m of listActionMetasForProvider("monday")) {
      if (m.key === "monday:add_file" || m.key === "monday:download_file") continue;
      expect(m.producesFileRef).toBe(false);
      expect(m.consumesFileRef).toBe(false);
    }
  });
});
