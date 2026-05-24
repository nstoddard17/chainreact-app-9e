/**
 * @jest-environment node
 *
 * Slice 3.MONDAY-7 builder-shape test — Monday `column_changed` trigger
 * config. Pins the board → column cascade, the OPTIONAL columnId filter,
 * and runtime-schema parity of the persisted config.
 */
import { mondayColumnChangedTriggerMeta } from "@/integrations/monday/triggers/columnChanged/columnChanged.meta";
import { MondayColumnChangedConfigSchema } from "@/integrations/monday/triggers/columnChanged/schema";

describe("monday column_changed trigger meta — Builder shape", () => {
  it("is a webhook trigger requiring the Monday integration", () => {
    expect(mondayColumnChangedTriggerMeta.activation).toBe("webhook");
    expect(mondayColumnChangedTriggerMeta.requiresIntegration).toBe(true);
    expect(mondayColumnChangedTriggerMeta.key).toBe("monday:column_changed");
  });

  it("board picker wires monday:boards (cascade root, required)", () => {
    const board = mondayColumnChangedTriggerMeta.fields.find(
      (f) => f.name === "boardId",
    )!;
    expect(board.type).toBe("combobox");
    expect(board.optionsSource).toBe("monday:boards");
    expect(board.dependsOn).toBeUndefined();
    expect(board.required).toBe(true);
  });

  it("column picker wires monday:columns dependsOn boardId, OPTIONAL (board → column cascade)", () => {
    const column = mondayColumnChangedTriggerMeta.fields.find(
      (f) => f.name === "columnId",
    )!;
    expect(column.type).toBe("combobox");
    expect(column.optionsSource).toBe("monday:columns");
    expect(column.dependsOn).toBe("boardId");
    expect(column.required).toBe(false);
  });

  it("persisted config with only boardId parses (board-wide change)", () => {
    expect(() =>
      MondayColumnChangedConfigSchema.parse({ boardId: "b-1" }),
    ).not.toThrow();
  });

  it("persisted config with boardId + columnId parses (filtered change)", () => {
    const parsed = MondayColumnChangedConfigSchema.parse({
      boardId: "b-1",
      columnId: "status",
    });
    expect(parsed.boardId).toBe("b-1");
    expect(parsed.columnId).toBe("status");
  });

  it("post-activation merged config (change_specific_column_value) still parses", () => {
    const merged = {
      boardId: "b-1",
      columnId: "status",
      webhookEnabled: true,
      webhookId: "wh-1",
      event: "change_specific_column_value",
      notificationUrl: "https://app.test/api/webhooks/monday?workflowId=wf&nodeId=n",
    };
    expect(() => MondayColumnChangedConfigSchema.parse(merged)).not.toThrow();
  });

  it("marks previousValue + newValue + columnTitle sensitive in the payload shape", () => {
    const byName = new Map(
      mondayColumnChangedTriggerMeta.payloadShape.map((o) => [o.name, o]),
    );
    expect(byName.get("previousValue")!.sensitive).toBe(true);
    expect(byName.get("newValue")!.sensitive).toBe(true);
    expect(byName.get("columnTitle")!.sensitive).toBe(true);
  });
});
