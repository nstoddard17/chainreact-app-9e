/**
 * @jest-environment node
 *
 * Tests for the 5 Monday per-trigger normalizers — Slice 3.MONDAY-7.
 * Covers snake_case/camelCase variance, pulseId fallback, canonical
 * field presence, deterministic dedup keys, and the "no raw payload"
 * rule (only the canonical fields are emitted).
 */
import { normalizeNewItem } from "@/integrations/monday/triggers/newItem/normalize";
import { normalizeColumnChanged } from "@/integrations/monday/triggers/columnChanged/normalize";
import { normalizeItemMoved } from "@/integrations/monday/triggers/itemMoved/normalize";
import { normalizeNewSubitem } from "@/integrations/monday/triggers/newSubitem/normalize";
import { normalizeNewUpdate } from "@/integrations/monday/triggers/newUpdate/normalize";

describe("normalizeNewItem", () => {
  it("normalizes a modern (camelCase) create_item event", () => {
    const ev = normalizeNewItem({
      type: "create_item",
      boardId: 123,
      pulseId: 456,
      pulseName: "New task",
      groupId: "topics",
      triggerTime: "2026-05-24T10:00:00Z",
      userId: 99,
      webUrl: "https://monday.com/boards/123/pulses/456",
    });
    expect(ev.provider).toBe("monday");
    expect(ev.eventType).toBe("new_item");
    expect(ev.accountId).toBe("123");
    expect(ev.payload).toMatchObject({
      changeKind: "new_item",
      itemId: "456",
      itemName: "New task",
      boardId: "123",
      groupId: "topics",
      creatorId: "99",
      webUrl: "https://monday.com/boards/123/pulses/456",
    });
  });

  it("falls back across pulseId / pulse_id / itemId for the item id", () => {
    expect(normalizeNewItem({ pulse_id: 7 }).payload.itemId).toBe("7");
    expect(normalizeNewItem({ itemId: "8" }).payload.itemId).toBe("8");
    expect(normalizeNewItem({ board_id: 1 }).payload.boardId).toBe("1");
  });

  it("derives a deterministic dedup key from board+item+createdAt", () => {
    const ev = normalizeNewItem({
      boardId: 1,
      pulseId: 2,
      createdAt: "2026-05-24T10:00:00Z",
    });
    expect(ev.eventId).toBe("new_item:1:2:2026-05-24T10:00:00Z");
  });

  it("emits ONLY the canonical fields (no raw Monday payload leak)", () => {
    const ev = normalizeNewItem({
      type: "create_item",
      boardId: 1,
      pulseId: 2,
      secretInternalField: "should-not-appear",
    });
    expect(Object.keys(ev.payload).sort()).toEqual([
      "boardId",
      "changeKind",
      "createdAt",
      "creatorId",
      "groupId",
      "itemId",
      "itemName",
      "webUrl",
    ]);
  });
});

describe("normalizeColumnChanged", () => {
  it("normalizes column change with object-valued previous/new values", () => {
    const ev = normalizeColumnChanged({
      type: "change_column_value",
      boardId: 1,
      pulseId: 2,
      pulseName: "Item",
      columnId: "status",
      columnTitle: "Status",
      previousValue: { label: { text: "Working" } },
      value: { label: { text: "Done" } },
      changedAt: "2026-05-24T11:00:00Z",
      userId: 5,
    });
    expect(ev.eventType).toBe("column_changed");
    expect(ev.payload).toMatchObject({
      changeKind: "column_changed",
      itemId: "2",
      itemName: "Item",
      columnId: "status",
      columnTitle: "Status",
      previousValue: { label: { text: "Working" } },
      newValue: { label: { text: "Done" } },
      changedById: "5",
    });
  });

  it("reads newValue from value / newValue / new_value", () => {
    expect(
      normalizeColumnChanged({ value: "v1" }).payload.newValue,
    ).toBe("v1");
    expect(
      normalizeColumnChanged({ new_value: "v2" }).payload.newValue,
    ).toBe("v2");
  });

  it("dedup key includes columnId so distinct column edits don't collide", () => {
    const ev = normalizeColumnChanged({
      boardId: 1,
      pulseId: 2,
      columnId: "status",
      changedAt: "2026-05-24T11:00:00Z",
    });
    expect(ev.eventId).toBe("column_changed:1:2:status:2026-05-24T11:00:00Z");
  });
});

describe("normalizeItemMoved", () => {
  it("normalizes group ids from nested + flat shapes", () => {
    const ev = normalizeItemMoved({
      type: "move_pulse_into_group",
      boardId: 1,
      pulseId: 2,
      pulseName: "Item",
      previousGroup: { id: "todo" },
      group: { id: "done" },
      triggerTime: "2026-05-24T12:00:00Z",
      userId: 5,
    });
    expect(ev.eventType).toBe("item_moved");
    expect(ev.payload).toMatchObject({
      changeKind: "item_moved",
      itemId: "2",
      previousGroupId: "todo",
      currentGroupId: "done",
      movedById: "5",
    });
  });

  it("also reads flat sourceGroupId / destGroupId", () => {
    const ev = normalizeItemMoved({
      boardId: 1,
      pulseId: 2,
      sourceGroupId: "a",
      destGroupId: "b",
    });
    expect(ev.payload.previousGroupId).toBe("a");
    expect(ev.payload.currentGroupId).toBe("b");
  });
});

describe("normalizeNewSubitem", () => {
  it("reads subitemId from pulseId and parentItemId from itemId", () => {
    const ev = normalizeNewSubitem({
      type: "create_subitem",
      boardId: 1,
      pulseId: 99,
      pulseName: "Sub A",
      itemId: 2,
      triggerTime: "2026-05-24T13:00:00Z",
      userId: 5,
    });
    expect(ev.eventType).toBe("new_subitem");
    expect(ev.payload).toMatchObject({
      changeKind: "new_subitem",
      subitemId: "99",
      subitemName: "Sub A",
      parentItemId: "2",
      creatorId: "5",
    });
  });

  it("prefers explicit parentItemId / subitemId when present", () => {
    const ev = normalizeNewSubitem({
      boardId: 1,
      subitemId: "s1",
      parentItemId: "p1",
    });
    expect(ev.payload.subitemId).toBe("s1");
    expect(ev.payload.parentItemId).toBe("p1");
  });
});

describe("normalizeNewUpdate", () => {
  it("normalizes a create_update event", () => {
    const ev = normalizeNewUpdate({
      type: "create_update",
      boardId: 1,
      pulseId: 2,
      updateId: 555,
      body: "Looks good!",
      creatorName: "Alice",
      userId: 5,
      triggerTime: "2026-05-24T14:00:00Z",
    });
    expect(ev.eventType).toBe("new_update");
    expect(ev.payload).toMatchObject({
      changeKind: "new_update",
      updateId: "555",
      itemId: "2",
      body: "Looks good!",
      posterId: "5",
      posterName: "Alice",
    });
  });

  it("uses the stable updateId as the dedup key when present", () => {
    const ev = normalizeNewUpdate({ boardId: 1, updateId: 555 });
    expect(ev.eventId).toBe("new_update:1:555");
  });

  it("falls back to a timestamp-derived dedup key when updateId is absent", () => {
    const ev = normalizeNewUpdate({
      boardId: 1,
      pulseId: 2,
      createdAt: "2026-05-24T14:00:00Z",
    });
    expect(ev.eventId).toBe("new_update:1:2:2026-05-24T14:00:00Z");
  });
});
