/**
 * @jest-environment node
 *
 * Slice 3.MONDAY-6 builder-shape test — Monday `update_item`. Pins the
 * board → item AND board → column cascades + the columnValue paste-JSON
 * textarea + persisted camelCase config.
 */
import { mondayUpdateItemMeta } from "@/integrations/monday/actions/items/updateItem.meta";
import { UpdateItemConfigSchema } from "@/integrations/monday/actions/items/updateItem.schema";

describe("monday update_item meta — Builder shape", () => {
  it("preserves runtime camelCase field names", () => {
    expect(mondayUpdateItemMeta.fields.map((f) => f.name)).toEqual([
      "boardId",
      "itemId",
      "columnId",
      "columnValue",
      "additionalColumns",
    ]);
  });

  it("item picker wires monday:items dependsOn boardId", () => {
    const f = mondayUpdateItemMeta.fields.find((x) => x.name === "itemId")!;
    expect(f.optionsSource).toBe("monday:items");
    expect(f.dependsOn).toBe("boardId");
    expect(f.required).toBe(true);
  });

  it("column picker wires monday:columns dependsOn boardId", () => {
    const f = mondayUpdateItemMeta.fields.find((x) => x.name === "columnId")!;
    expect(f.optionsSource).toBe("monday:columns");
    expect(f.dependsOn).toBe("boardId");
    expect(f.required).toBe(true);
  });

  it("columnValue is a textarea (status/person columns take JSON)", () => {
    const f = mondayUpdateItemMeta.fields.find((x) => x.name === "columnValue")!;
    expect(f.type).toBe("textarea");
    expect(f.required).toBe(true);
  });

  it("persisted config parses against the runtime schema", () => {
    const persisted = {
      boardId: "b-1",
      itemId: "i-1",
      columnId: "status",
      columnValue: '{"label":"Done"}',
      additionalColumns: '{"priority":{"label":"High"}}',
    };
    expect(() => UpdateItemConfigSchema.parse(persisted)).not.toThrow();
  });

  it("risk: medium", () => {
    expect(mondayUpdateItemMeta.riskLevel).toBe("medium");
    expect(mondayUpdateItemMeta.isDestructive).toBe(false);
  });
});
