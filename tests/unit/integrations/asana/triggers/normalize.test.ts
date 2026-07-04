/**
 * @jest-environment node
 *
 * Pure-function tests for the Asana normalizers + P-S2 project filters —
 * Slice 5.ASANA-1.
 */
import { normalizeNewTaskInProject } from "@/integrations/asana/triggers/newTaskInProject/normalize";
import { normalizeTaskUpdatedInProject } from "@/integrations/asana/triggers/taskUpdatedInProject/normalize";
import { asanaNewTaskInProjectFilter } from "@/integrations/asana/triggers/newTaskInProject/filter";
import { asanaTaskUpdatedInProjectFilter } from "@/integrations/asana/triggers/taskUpdatedInProject/filter";
import { classifyAsanaEvent } from "@/integrations/asana/triggers/_shared/eventMap";

const ev = {
  user: { gid: "actor-1" },
  resource: {
    gid: "t-1",
    resource_type: "task",
    resource_subtype: "default_task",
  },
  parent: { gid: "p-1", resource_type: "project" },
  action: "added",
  created_at: "2026-07-04T05:00:00.000Z",
};

describe("classifyAsanaEvent", () => {
  it("maps task+added / task+changed and rejects everything else", () => {
    expect(classifyAsanaEvent(ev)).toBe("new_task_in_project");
    expect(classifyAsanaEvent({ ...ev, action: "changed" })).toBe(
      "task_updated_in_project",
    );
    expect(classifyAsanaEvent({ ...ev, action: "deleted" })).toBeNull();
    expect(
      classifyAsanaEvent({
        ...ev,
        resource: { gid: "s-1", resource_type: "story" },
      }),
    ).toBeNull();
    expect(classifyAsanaEvent({})).toBeNull();
  });
});

describe("normalizeNewTaskInProject", () => {
  it("emits the canonical compact payload with the short eventType", () => {
    const event = normalizeNewTaskInProject(ev, { projectId: "p-1" });
    expect(event.provider).toBe("asana");
    expect(event.eventType).toBe("new_task_in_project");
    expect(event.eventId).toBe("new_task_in_project:p-1:t-1");
    expect(event.occurredAt).toBe("2026-07-04T05:00:00.000Z");
    expect(event.providerAccountId).toBe("p-1");
    expect(event.payload).toEqual({
      changeKind: "new_task_in_project",
      taskGid: "t-1",
      projectGid: "p-1",
      actorGid: "actor-1",
      action: "added",
      resourceSubtype: "default_task",
      createdAt: "2026-07-04T05:00:00.000Z",
    });
  });

  it("is deterministic for the same logical event (dedup key)", () => {
    const a = normalizeNewTaskInProject(ev, { projectId: "p-1" });
    const b = normalizeNewTaskInProject(ev, { projectId: "p-1" });
    expect(a.eventId).toBe(b.eventId);
  });

  it("collapses Asana's multi-parent creation delivery: two task+added events for the same task with different created_at share one dedup key (live double-fire, 2026-07-04)", () => {
    // Live repro: creating ONE task delivered task+added twice (one membership
    // event per parent — project and section), created_at 138ms apart. The
    // timestamp must NOT be part of the key or one creation fires two runs.
    const first = normalizeNewTaskInProject(
      { ...ev, created_at: "2026-07-04T15:26:33.839Z" },
      { projectId: "p-1" },
    );
    const second = normalizeNewTaskInProject(
      { ...ev, created_at: "2026-07-04T15:26:33.977Z" },
      { projectId: "p-1" },
    );
    expect(first.eventId).toBe(second.eventId);
    expect(first.eventId).toBe("new_task_in_project:p-1:t-1");
  });

  it("keeps the timestamp discriminator when the task gid is missing (malformed events never share a key)", () => {
    const a = normalizeNewTaskInProject(
      { created_at: "2026-07-04T05:00:00.000Z" },
      { projectId: "p-1" },
    );
    const b = normalizeNewTaskInProject(
      { created_at: "2026-07-04T06:00:00.000Z" },
      { projectId: "p-1" },
    );
    expect(a.eventId).not.toBe(b.eventId);
    expect(a.eventId).toContain("no-task");
  });

  it("degrades safely on a minimal event (nulls, no throw)", () => {
    const event = normalizeNewTaskInProject({}, { projectId: null });
    expect(event.eventId).toContain("no-project");
    expect(event.eventId).toContain("no-task");
    expect(event.providerAccountId).toBe("unknown");
    expect(event.payload.taskGid).toBeNull();
    expect(event.payload.actorGid).toBeNull();
  });
});

describe("normalizeTaskUpdatedInProject", () => {
  it("emits the task_updated shape with its own dedup namespace", () => {
    const event = normalizeTaskUpdatedInProject(
      { ...ev, action: "changed" },
      { projectId: "p-1" },
    );
    expect(event.eventType).toBe("task_updated_in_project");
    expect(event.eventId).toBe(
      "task_updated_in_project:p-1:t-1:2026-07-04T05:00:00.000Z",
    );
    expect(event.payload.changeKind).toBe("task_updated_in_project");
  });
});

describe("P-S2 project filters", () => {
  const matchEvent = normalizeNewTaskInProject(ev, { projectId: "p-1" });

  it("matches when the row's projectId equals the event's projectGid", () => {
    const parsed = asanaNewTaskInProjectFilter.parseConfig({
      projectId: "p-1",
      webhookId: "wh-1",
      extra: "ignored",
    });
    expect(asanaNewTaskInProjectFilter.evaluate(matchEvent, parsed)).toEqual({
      kind: "match",
    });
  });

  it("drops cross-project events (workflow watching project B never fires on A)", () => {
    const parsed = asanaNewTaskInProjectFilter.parseConfig({ projectId: "p-OTHER" });
    const result = asanaNewTaskInProjectFilter.evaluate(matchEvent, parsed);
    expect(result.kind).toBe("no-match");
  });

  it("fails closed on a config without projectId", () => {
    expect(() => asanaNewTaskInProjectFilter.parseConfig({})).toThrow();
    expect(() =>
      asanaTaskUpdatedInProjectFilter.parseConfig({ projectId: "" }),
    ).toThrow();
  });

  it("never matches an event with a null projectGid", () => {
    const nullEvent = normalizeNewTaskInProject(ev, { projectId: null });
    const parsed = asanaNewTaskInProjectFilter.parseConfig({ projectId: "p-1" });
    expect(asanaNewTaskInProjectFilter.evaluate(nullEvent, parsed).kind).toBe(
      "no-match",
    );
  });

  it("task_updated filter narrows by project the same way", () => {
    const updated = normalizeTaskUpdatedInProject(
      { ...ev, action: "changed" },
      { projectId: "p-9" },
    );
    const parsed = asanaTaskUpdatedInProjectFilter.parseConfig({ projectId: "p-9" });
    expect(asanaTaskUpdatedInProjectFilter.evaluate(updated, parsed)).toEqual({
      kind: "match",
    });
  });
});
