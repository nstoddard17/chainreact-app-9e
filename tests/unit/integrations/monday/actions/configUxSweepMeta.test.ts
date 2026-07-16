/**
 * CONFIG-UX sweep (Group B — monday) meta guards.
 *
 * Pins the metadata-only builder-UX changes:
 *
 *   1. Pagination cursors (`list_items.cursor`, `list_boards.cursor`)
 *      live in the Advanced tab — loop composition is power-user; the
 *      normal setup path stays picker + limit only. `list_boards`'s
 *      cursor copy now matches the runtime contract (paste `nextCursor`,
 *      which IS the stringified page index the handler accepts).
 *   2. `add_column.columnType` stays REQUIRED free text (Monday's full
 *      ColumnType value set is not pinnable in-repo — Monday ships new
 *      types; the server validates) — the sweep improved copy only.
 *   3. `update_item.columnValue` keeps its runtime-compatible textarea
 *      (zod accepts string OR object; a typed string is always safe) —
 *      copy-only fix, no shape change.
 */
import { mondayListItemsMeta } from "@/integrations/monday/actions/items/listItems.meta";
import { mondayListBoardsMeta } from "@/integrations/monday/actions/boards/listBoards.meta";
import { mondayAddColumnMeta } from "@/integrations/monday/actions/boards/addColumn.meta";
import { mondayUpdateItemMeta } from "@/integrations/monday/actions/items/updateItem.meta";
import type { ActionMeta, FieldMeta } from "@/contracts/actionMeta";

function field(meta: ActionMeta, name: string): FieldMeta {
  const f = meta.fields.find((x) => x.name === name);
  if (!f) throw new Error(`${meta.key} has no field '${name}'`);
  return f;
}

describe("monday pagination cursors — Advanced tab", () => {
  it("list_items.cursor is advanced, optional, and keeps its key", () => {
    const cursor = field(mondayListItemsMeta, "cursor");
    expect(cursor.advanced).toBe(true);
    expect(cursor.required).toBe(false);
    expect(cursor.type).toBe("text");
    // limit stays a prefilled setup field, not advanced.
    expect(field(mondayListItemsMeta, "limit").defaultValue).toBe(25);
    expect(field(mondayListItemsMeta, "limit").advanced).toBeUndefined();
  });

  it("list_boards.cursor is advanced and its copy no longer contradicts the label", () => {
    const cursor = field(mondayListBoardsMeta, "cursor");
    expect(cursor.advanced).toBe(true);
    expect(cursor.required).toBe(false);
    // The old placeholder said "Page index" while the label said cursor —
    // reconciled to the nextCursor wording the outputs use.
    expect(cursor.placeholder ?? "").not.toMatch(/page index/i);
    expect(cursor.description ?? "").toMatch(/nextCursor/);
    expect(field(mondayListBoardsMeta, "limit").defaultValue).toBe(25);
  });
});

describe("monday copy-only holds (no capability change)", () => {
  it("add_column.columnType stays required free text (forward-compat with new Monday types)", () => {
    const f = field(mondayAddColumnMeta, "columnType");
    expect(f.type).toBe("text");
    expect(f.required).toBe(true);
    expect(f.optionsSource).toBeUndefined();
    expect(f.options).toBeUndefined();
  });

  it("update_item.columnValue stays a required textarea (runtime accepts string or object)", () => {
    const f = field(mondayUpdateItemMeta, "columnValue");
    expect(f.type).toBe("textarea");
    expect(f.required).toBe(true);
    // Copy teaches the three common shapes without changing the contract.
    expect(f.description ?? "").toMatch(/"label":"Done"/);
  });
});
