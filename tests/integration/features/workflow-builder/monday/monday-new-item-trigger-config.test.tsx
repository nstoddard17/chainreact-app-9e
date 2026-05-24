/**
 * @jest-environment node
 *
 * Slice 3.MONDAY-7 builder-shape test — Monday `new_item` trigger config
 * as it flows into the WorkflowBuilder. Pins the board picker wiring +
 * runtime-schema parity of the persisted config.
 */
import { mondayNewItemTriggerMeta } from "@/integrations/monday/triggers/newItem/newItem.meta";
import { MondayNewItemConfigSchema } from "@/integrations/monday/triggers/newItem/schema";

describe("monday new_item trigger meta — Builder shape", () => {
  it("is a webhook trigger requiring the Monday integration", () => {
    expect(mondayNewItemTriggerMeta.activation).toBe("webhook");
    expect(mondayNewItemTriggerMeta.requiresIntegration).toBe(true);
    expect(mondayNewItemTriggerMeta.key).toBe("monday:new_item");
  });

  it("exposes a single board picker wired to monday:boards (cascade root, no deps)", () => {
    expect(mondayNewItemTriggerMeta.fields.map((f) => f.name)).toEqual([
      "boardId",
    ]);
    const board = mondayNewItemTriggerMeta.fields[0]!;
    expect(board.type).toBe("combobox");
    expect(board.optionsSource).toBe("monday:boards");
    expect(board.dependsOn).toBeUndefined();
    expect(board.required).toBe(true);
  });

  it("persisted config (just boardId) parses against the runtime schema", () => {
    expect(() =>
      MondayNewItemConfigSchema.parse({ boardId: "b-1" }),
    ).not.toThrow();
  });

  it("post-activation merged config (lifecycle fields) still parses", () => {
    const merged = {
      boardId: "b-1",
      webhookEnabled: true,
      webhookId: "wh-1",
      event: "create_item",
      notificationUrl: "https://app.test/api/webhooks/monday?workflowId=wf&nodeId=n",
      columnId: null,
    };
    expect(() => MondayNewItemConfigSchema.parse(merged)).not.toThrow();
  });

  it("rejects an empty boardId (required field)", () => {
    expect(() => MondayNewItemConfigSchema.parse({ boardId: "" })).toThrow();
  });

  it("emits the canonical payload shape including the sensitive itemName/webUrl", () => {
    const names = mondayNewItemTriggerMeta.payloadShape.map((o) => o.name);
    expect(names).toEqual([
      "changeKind",
      "itemId",
      "itemName",
      "boardId",
      "groupId",
      "createdAt",
      "creatorId",
      "webUrl",
    ]);
    const itemName = mondayNewItemTriggerMeta.payloadShape.find(
      (o) => o.name === "itemName",
    )!;
    expect(itemName.sensitive).toBe(true);
  });
});
