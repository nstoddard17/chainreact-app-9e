/**
 * @jest-environment node
 *
 * Slice 3.MONDAY-6 builder-shape test — Monday `delete_item`. Pins the
 * board → item cascade + the high/destructive/confirmation shape that
 * drives the builder's typed-confirmation modal.
 */
import { mondayDeleteItemMeta } from "@/integrations/monday/actions/items/deleteItem.meta";
import { DeleteItemConfigSchema } from "@/integrations/monday/actions/items/deleteItem.schema";

describe("monday delete_item meta — Builder shape", () => {
  it("fields are boardId + itemId (camelCase)", () => {
    expect(mondayDeleteItemMeta.fields.map((f) => f.name)).toEqual([
      "boardId",
      "itemId",
    ]);
  });

  it("item picker wires monday:items dependsOn boardId", () => {
    const f = mondayDeleteItemMeta.fields.find((x) => x.name === "itemId")!;
    expect(f.optionsSource).toBe("monday:items");
    expect(f.dependsOn).toBe("boardId");
  });

  it("declares the destructive trio: high + isDestructive + requiresConfirmation", () => {
    expect(mondayDeleteItemMeta.riskLevel).toBe("high");
    expect(mondayDeleteItemMeta.isDestructive).toBe(true);
    expect(mondayDeleteItemMeta.requiresConfirmation).toBe(true);
  });

  it("risk copy mentions Monday's UI restore but ChainReact's lack of a restore API", () => {
    expect(mondayDeleteItemMeta.riskDescription).toMatch(/restore/i);
    expect(mondayDeleteItemMeta.riskDescription).toMatch(/no restore api/i);
  });

  it("output is structural-only (no item name / column values)", () => {
    expect(mondayDeleteItemMeta.outputs.map((o) => o.name).sort()).toEqual([
      "deletedAt",
      "deletedItemId",
      "success",
    ]);
  });

  it("persisted config parses against the runtime schema", () => {
    expect(() =>
      DeleteItemConfigSchema.parse({ boardId: "b-1", itemId: "i-1" }),
    ).not.toThrow();
  });
});
