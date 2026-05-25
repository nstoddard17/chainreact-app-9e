/**
 * @jest-environment node
 *
 * Slice 3.MONDAY-6 builder-shape test — Monday `create_item` config as
 * it flows into the WorkflowBuilder. Pins runtime-schema parity (V1
 * camelCase), the board → group cascade, and the columnValues paste-JSON
 * textarea.
 */
import { mondayCreateItemMeta } from "@/integrations/monday/actions/items/createItem.meta";
import { CreateItemConfigSchema } from "@/integrations/monday/actions/items/createItem.schema";

describe("monday create_item meta — Builder shape", () => {
  it("preserves runtime camelCase field names (boardId / groupId / itemName / columnValues)", () => {
    expect(mondayCreateItemMeta.fields.map((f) => f.name)).toEqual([
      "boardId",
      "groupId",
      "itemName",
      "columnValues",
    ]);
  });

  it("board picker wires monday:boards with NO deps (cascade root)", () => {
    const f = mondayCreateItemMeta.fields.find((x) => x.name === "boardId")!;
    expect(f.type).toBe("combobox");
    expect(f.optionsSource).toBe("monday:boards");
    expect(f.dependsOn).toBeUndefined();
    expect(f.required).toBe(true);
  });

  it("group picker wires monday:groups dependsOn boardId (board → group cascade)", () => {
    const f = mondayCreateItemMeta.fields.find((x) => x.name === "groupId")!;
    expect(f.type).toBe("combobox");
    expect(f.optionsSource).toBe("monday:groups");
    expect(f.dependsOn).toBe("boardId");
    expect(f.required).toBe(true);
  });

  it("columnValues is a paste-JSON textarea (column-aware editor deferred — D-MON7)", () => {
    const f = mondayCreateItemMeta.fields.find((x) => x.name === "columnValues")!;
    expect(f.type).toBe("textarea");
    expect(f.required).toBe(false);
  });

  it("persisted config (camelCase) parses against the runtime schema", () => {
    const persisted = {
      boardId: "b-1",
      groupId: "g-1",
      itemName: "New task",
      columnValues: '{"status":{"label":"Done"}}',
    };
    expect(() => CreateItemConfigSchema.parse(persisted)).not.toThrow();
  });

  it("risk: medium, not destructive", () => {
    expect(mondayCreateItemMeta.riskLevel).toBe("medium");
    expect(mondayCreateItemMeta.isDestructive).toBe(false);
    expect(mondayCreateItemMeta.requiresConfirmation).toBe(false);
  });
});
