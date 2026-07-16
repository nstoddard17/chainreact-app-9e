/**
 * @jest-environment node
 *
 * Config-UX sweep — Notion meta pins (Group F audit items 4, 9, 10, 12, 14).
 *
 * Pins:
 *   - page/block id fields converted from raw text to the EXISTING
 *     `notion:pages` combobox with `allowManualEntry: true` (value stays
 *     the raw id string; `{{...}}` wiring and pasted block ids keep
 *     working — the proven `list_comments.blockId` pattern),
 *   - `search.filter` json → `object` editor whose itemFields mirror the
 *     runtime schema keys EXACTLY (`value` ∈ {page, database};
 *     `property` = "object") and whose committed object round-trips
 *     through the runtime schema,
 *   - `pageSize` pagination knobs and `update_page.archived` moved to
 *     the Advanced tab,
 *   - `create_comment` XOR wording lives on both target fields (readiness
 *     can't see the runtime refine — the copy carries the contract).
 */
import { notionUpdatePageMeta } from "@/integrations/notion/actions/updatePage.meta";
import { notionGetPageMeta } from "@/integrations/notion/actions/getPage.meta";
import { notionArchivePageMeta } from "@/integrations/notion/actions/archivePage.meta";
import { notionRestorePageMeta } from "@/integrations/notion/actions/restorePage.meta";
import { notionCreateCommentMeta } from "@/integrations/notion/actions/createComment.meta";
import { notionCreateDatabaseMeta } from "@/integrations/notion/actions/createDatabase.meta";
import { notionAppendBlockChildrenMeta } from "@/integrations/notion/actions/appendBlockChildren.meta";
import { notionGetBlockChildrenMeta } from "@/integrations/notion/actions/getBlockChildren.meta";
import { notionQueryDatabaseMeta } from "@/integrations/notion/actions/queryDatabase.meta";
import { notionSearchMeta } from "@/integrations/notion/actions/search.meta";
import { notionListUsersMeta } from "@/integrations/notion/actions/listUsers.meta";
import { SearchConfigSchema } from "@/integrations/notion/actions/search.schema";
import type { ActionMeta } from "@/contracts/actionMeta";

function field(meta: ActionMeta, name: string) {
  const f = meta.fields.find((x) => x.name === name);
  if (!f) throw new Error(`${meta.key} has no field '${name}'`);
  return f;
}

describe("notion page/block id fields — notion:pages combobox + manual entry", () => {
  const PICKER_FIELDS: ReadonlyArray<[ActionMeta, string, boolean]> = [
    // [meta, fieldName, required]
    [notionUpdatePageMeta, "pageId", true],
    [notionGetPageMeta, "pageId", true],
    [notionArchivePageMeta, "pageId", true],
    [notionRestorePageMeta, "pageId", true],
    [notionCreateCommentMeta, "pageId", false], // XOR with discussionId — runtime refine
    [notionCreateDatabaseMeta, "parentPageId", true],
    [notionAppendBlockChildrenMeta, "blockId", true],
    // get_block / get_block_children blockId stays raw text (audit item 14
    // was LOW/nice-to-have; skipped to keep the discovery-registry pin
    // surface minimal — block ids dominantly arrive via wiring).
  ];

  it.each(PICKER_FIELDS.map(([m, n, r]) => [m.key, n, m, r] as const))(
    "%s.%s is a notion:pages combobox with manual entry (string value preserved)",
    (_key, name, meta, required) => {
      const f = field(meta, name);
      expect(f.type).toBe("combobox");
      expect(f.optionsSource).toBe("notion:pages");
      expect(f.allowManualEntry).toBe(true);
      expect(f.required).toBe(required);
      // Static options never coexist with the resolver.
      expect(f.options).toBeUndefined();
    },
  );
});

describe("notion:search — filter object editor ↔ runtime schema", () => {
  const filter = field(notionSearchMeta, "filter");

  it("is an optional advanced object (no json shape leftovers)", () => {
    expect(filter.type).toBe("object");
    expect(filter.required).toBe(false);
    expect(filter.advanced).toBe(true);
    expect(filter.jsonShape).toBeUndefined();
  });

  it("itemFields keys equal the runtime schema keys exactly", () => {
    expect(filter.itemFields!.map((f) => f.name)).toEqual([
      "value",
      "property",
    ]);
  });

  it("value options equal the runtime enum; property's only option is the runtime literal", () => {
    const value = filter.itemFields!.find((f) => f.name === "value")!;
    const property = filter.itemFields!.find((f) => f.name === "property")!;
    expect(value.type).toBe("select");
    expect(value.required).toBe(true);
    expect(value.options!.map((o) => o.value)).toEqual(["page", "database"]);
    expect(property.type).toBe("select");
    expect(property.required).toBe(true);
    expect(property.options!.map((o) => o.value)).toEqual(["object"]);
  });

  it("the committed object round-trips through the runtime schema for every value option", () => {
    const value = filter.itemFields!.find((f) => f.name === "value")!;
    for (const opt of value.options!) {
      const committed = { value: opt.value, property: "object" };
      const parsed = SearchConfigSchema.parse({ query: "", filter: committed });
      expect(parsed.filter).toEqual(committed);
    }
  });

  it("omitting the filter stays valid (all-empty object commits undefined)", () => {
    expect(() => SearchConfigSchema.parse({ query: "" })).not.toThrow();
  });
});

describe("notion — Advanced-tab placement (pagination knobs + niche toggles)", () => {
  it.each([
    [notionQueryDatabaseMeta.key, notionQueryDatabaseMeta],
    [notionSearchMeta.key, notionSearchMeta],
    [notionGetBlockChildrenMeta.key, notionGetBlockChildrenMeta],
    [notionListUsersMeta.key, notionListUsersMeta],
  ] as const)("%s.pageSize is advanced", (_key, meta) => {
    expect(field(meta, "pageSize").advanced).toBe(true);
  });

  it("update_page.archived is advanced (dedicated Archive/Restore actions cover the common case)", () => {
    expect(field(notionUpdatePageMeta, "archived").advanced).toBe(true);
  });
});

describe("notion:create_comment — XOR wording on both target fields", () => {
  it("pageId and discussionId descriptions carry the exactly-one contract", () => {
    expect(field(notionCreateCommentMeta, "pageId").description).toMatch(
      /exactly one/i,
    );
    expect(field(notionCreateCommentMeta, "discussionId").description).toMatch(
      /exactly one/i,
    );
  });
});
