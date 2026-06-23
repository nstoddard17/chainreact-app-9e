/**
 * @jest-environment node
 *
 * Slice 4.ONEDRIVE-META-3 — Microsoft OneDrive discovery-registry coverage.
 *
 * Pins the full 7-action OneDrive surface: keys in displayOrder,
 * key===provider:type, category 'files', camelCase fields, resolver wiring
 * (folders root + items dependsOn parentItemId on move/copy/delete), the
 * UI-scope parentItemId on those cascade actions, delete_item risk trio,
 * downloadUrl sensitive outputs (incl. nested list_items), FileRef-deferred
 * (no producesFileRef/consumesFileRef; content textarea), and the rejected
 * microsoft-onedrive:drives resolver staying absent. NOTE: `get_file` was
 * reworked (ONEDRIVE-GETFILE-DISCOVERY) to a FLAT `microsoft-onedrive:files`
 * picker — no parentItemId, no cascade — so it is asserted separately.
 * Trigger assertions live in microsoft-onedrive-triggers-discovery.test.ts.
 */
import {
  getActionMeta,
  listActionMetasForProvider,
  listProvidersWithMetadata,
} from "@/services/discovery/_registry";

const EXPECTED_KEYS_IN_ORDER = [
  "microsoft-onedrive:list_items",
  "microsoft-onedrive:get_file",
  "microsoft-onedrive:upload_file",
  "microsoft-onedrive:create_folder",
  "microsoft-onedrive:move_item",
  "microsoft-onedrive:copy_item",
  "microsoft-onedrive:delete_item",
];

/**
 * Cascade actions carrying the optional UI-scope parentItemId → folders +
 * itemId → microsoft-onedrive:items (dependsOn parentItemId). `get_file` is
 * deliberately NOT here — its itemId is a flat `microsoft-onedrive:files`
 * picker with no parentItemId (asserted separately below).
 */
const ITEM_CASCADE = [
  "microsoft-onedrive:move_item",
  "microsoft-onedrive:copy_item",
  "microsoft-onedrive:delete_item",
];

describe("microsoft-onedrive discovery — surface", () => {
  it("registers exactly 7 action metas in displayOrder", () => {
    const metas = listActionMetasForProvider("microsoft-onedrive");
    expect(metas).toHaveLength(7);
    expect(metas.map((m) => m.key)).toEqual(EXPECTED_KEYS_IN_ORDER);
  });

  it("every key equals provider:type and provider is 'microsoft-onedrive'", () => {
    for (const m of listActionMetasForProvider("microsoft-onedrive")) {
      expect(m.provider).toBe("microsoft-onedrive");
      expect(m.key).toBe(`microsoft-onedrive:${m.type}`);
    }
  });

  it("every action is category 'files' + requiresIntegration", () => {
    for (const m of listActionMetasForProvider("microsoft-onedrive")) {
      expect(m.category).toBe("files");
      expect(m.requiresIntegration).toBe(true);
    }
  });

  it("displayOrder is strictly ascending (10..70)", () => {
    const orders = listActionMetasForProvider("microsoft-onedrive").map((m) => m.displayOrder);
    expect(orders[0]).toBe(10);
    expect(orders[orders.length - 1]).toBe(70);
    for (let i = 1; i < orders.length; i++) {
      expect(orders[i]!).toBeGreaterThan(orders[i - 1]!);
    }
  });

  it("microsoft-onedrive is reported by listProvidersWithMetadata", () => {
    expect(listProvidersWithMetadata()).toContain("microsoft-onedrive");
  });

  it("NO action produces or consumes a FileRef (FileRef deferred)", () => {
    for (const m of listActionMetasForProvider("microsoft-onedrive")) {
      expect(m.producesFileRef).toBe(false);
      expect(m.consumesFileRef).toBe(false);
    }
  });
});

describe("microsoft-onedrive discovery — field hygiene + resolver wiring", () => {
  it("all field names are camelCase (mirror the runtime Zod schemas)", () => {
    for (const m of listActionMetasForProvider("microsoft-onedrive")) {
      for (const f of m.fields) {
        expect(f.name).toMatch(/^[a-z][a-zA-Z0-9]*$/);
      }
    }
  });

  it("cascade actions carry an optional UI-scope parentItemId → folders (no dep)", () => {
    for (const key of ITEM_CASCADE) {
      const parent = getActionMeta(key)!.fields.find((f) => f.name === "parentItemId")!;
      expect(parent.optionsSource).toBe("microsoft-onedrive:folders");
      expect(parent.dependsOn).toBeUndefined();
      expect(parent.required).toBe(false);
      expect(parent.type).toBe("combobox");
    }
  });

  it("get_file.itemId is a FLAT microsoft-onedrive:files picker — no parentItemId, no dep", () => {
    const getFile = getActionMeta("microsoft-onedrive:get_file")!;
    expect(getFile.fields.find((f) => f.name === "parentItemId")).toBeUndefined();
    const itemId = getFile.fields.find((f) => f.name === "itemId")!;
    expect(itemId.type).toBe("combobox");
    expect(itemId.optionsSource).toBe("microsoft-onedrive:files");
    expect(itemId.dependsOn).toBeUndefined();
    expect(itemId.required).toBe(true);
  });

  it("real parentItemId fields (upload/create/list) use folders, no dep, optional", () => {
    for (const key of [
      "microsoft-onedrive:upload_file",
      "microsoft-onedrive:create_folder",
      "microsoft-onedrive:list_items",
    ]) {
      const parent = getActionMeta(key)!.fields.find((f) => f.name === "parentItemId")!;
      expect(parent.optionsSource).toBe("microsoft-onedrive:folders");
      expect(parent.dependsOn).toBeUndefined();
      expect(parent.required).toBe(false);
    }
  });

  it("cascade itemId fields use microsoft-onedrive:items dependsOn parentItemId", () => {
    for (const key of ITEM_CASCADE) {
      const itemId = getActionMeta(key)!.fields.find((f) => f.name === "itemId")!;
      expect(itemId.optionsSource).toBe("microsoft-onedrive:items");
      expect(itemId.dependsOn).toBe("parentItemId");
      expect(itemId.required).toBe(true);
    }
  });

  it("targetParentItemId uses folders (move optional, copy required)", () => {
    const move = getActionMeta("microsoft-onedrive:move_item")!.fields.find(
      (f) => f.name === "targetParentItemId",
    )!;
    expect(move.optionsSource).toBe("microsoft-onedrive:folders");
    expect(move.required).toBe(false);
    const copy = getActionMeta("microsoft-onedrive:copy_item")!.fields.find(
      (f) => f.name === "targetParentItemId",
    )!;
    expect(copy.optionsSource).toBe("microsoft-onedrive:folders");
    expect(copy.required).toBe(true);
  });

  it("upload_file.content is a textarea (FileRef deferred — no file field, no FileRef claim)", () => {
    const upload = getActionMeta("microsoft-onedrive:upload_file")!;
    const content = upload.fields.find((f) => f.name === "content")!;
    expect(content.type).toBe("textarea");
    expect(content.required).toBe(true);
    expect(upload.consumesFileRef).toBe(false);
    // contentEncoding is a static select.
    const enc = upload.fields.find((f) => f.name === "contentEncoding")!;
    expect(enc.type).toBe("select");
    expect(enc.options!.map((o) => o.value)).toEqual(["utf8", "base64"]);
  });

  it("no field references the rejected microsoft-onedrive:drives resolver", () => {
    for (const m of listActionMetasForProvider("microsoft-onedrive")) {
      for (const f of m.fields) {
        expect(f.optionsSource).not.toBe("microsoft-onedrive:drives");
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
    ];
    for (const m of listActionMetasForProvider("microsoft-onedrive")) {
      const names = m.outputs.map((o) => o.name);
      for (const banned of BANNED) expect(names).not.toContain(banned);
    }
  });
});

describe("microsoft-onedrive discovery — risk", () => {
  it("delete_item is high + destructive + requiresConfirmation (Marcus decision)", () => {
    const m = getActionMeta("microsoft-onedrive:delete_item")!;
    expect(m.riskLevel).toBe("high");
    expect(m.isDestructive).toBe(true);
    expect(m.requiresConfirmation).toBe(true);
    expect(m.riskDescription).toBeDefined();
  });

  it("reads are low; writes are medium; only delete_item is destructive", () => {
    for (const k of ["microsoft-onedrive:get_file", "microsoft-onedrive:list_items"]) {
      expect(getActionMeta(k)!.riskLevel).toBe("low");
    }
    for (const k of [
      "microsoft-onedrive:upload_file",
      "microsoft-onedrive:create_folder",
      "microsoft-onedrive:move_item",
      "microsoft-onedrive:copy_item",
    ]) {
      expect(getActionMeta(k)!.riskLevel).toBe("medium");
    }
    for (const m of listActionMetasForProvider("microsoft-onedrive")) {
      if (m.key !== "microsoft-onedrive:delete_item") {
        expect(m.isDestructive).toBe(false);
        expect(m.requiresConfirmation).toBe(false);
      }
    }
  });
});

describe("microsoft-onedrive discovery — sensitive downloadUrl outputs", () => {
  it("top-level downloadUrl is sensitive on upload_file + get_file", () => {
    for (const key of ["microsoft-onedrive:upload_file", "microsoft-onedrive:get_file"]) {
      const o = getActionMeta(key)!.outputs.find((x) => x.name === "downloadUrl")!;
      expect(o.sensitive).toBe(true);
    }
  });

  it("nested list_items.items[].downloadUrl is sensitive (id/name are not)", () => {
    const items = getActionMeta("microsoft-onedrive:list_items")!.outputs.find(
      (o) => o.name === "items",
    )!;
    expect(items.fields!.find((f) => f.name === "downloadUrl")!.sensitive).toBe(true);
    expect(items.fields!.find((f) => f.name === "itemId")!.sensitive).not.toBe(true);
  });

  it("ids / names / urls / sizes / dates are NOT marked sensitive", () => {
    const NON_SENSITIVE = new Set([
      "itemId",
      "name",
      "webUrl",
      "size",
      "mimeType",
      "kind",
      "parentReference",
      "createdDateTime",
      "lastModifiedDateTime",
      "childCount",
      "count",
      "hasMore",
      "nextLink",
      "deleted",
      "alreadyMissing",
      "status",
      "monitorUrl",
      "sourceItemId",
      "targetParentItemId",
      "newName",
    ]);
    for (const m of listActionMetasForProvider("microsoft-onedrive")) {
      for (const o of m.outputs) {
        if (NON_SENSITIVE.has(o.name)) expect(o.sensitive).not.toBe(true);
      }
    }
  });
});
