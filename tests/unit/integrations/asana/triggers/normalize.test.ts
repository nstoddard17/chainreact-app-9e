/**
 * @jest-environment node
 *
 * Pure-function tests for the Asana normalizers + P-S2 project filters —
 * Slice 5.ASANA-1 + ASANA-2.
 */
import { normalizeNewTaskInProject } from "@/integrations/asana/triggers/newTaskInProject/normalize";
import { normalizeTaskUpdatedInProject } from "@/integrations/asana/triggers/taskUpdatedInProject/normalize";
import { normalizeTaskCompleted } from "@/integrations/asana/triggers/taskCompleted/normalize";
import { normalizeTaskAssigned } from "@/integrations/asana/triggers/taskAssigned/normalize";
import {
  normalizeCommentAddedToTask,
  COMMENT_TEXT_MAX,
} from "@/integrations/asana/triggers/commentAddedToTask/normalize";
import { asanaNewTaskInProjectFilter } from "@/integrations/asana/triggers/newTaskInProject/filter";
import { asanaTaskUpdatedInProjectFilter } from "@/integrations/asana/triggers/taskUpdatedInProject/filter";
import { asanaTaskCompletedFilter } from "@/integrations/asana/triggers/taskCompleted/filter";
import { asanaTaskAssignedFilter } from "@/integrations/asana/triggers/taskAssigned/filter";
import { asanaCommentAddedToTaskFilter } from "@/integrations/asana/triggers/commentAddedToTask/filter";
import { eventMatchesTriggerType } from "@/integrations/asana/triggers/_shared/eventMap";
import type { AsanaTask } from "@/integrations/_shared/asana/api/tasks";
import type { AsanaStoryDetail } from "@/integrations/_shared/asana/api/stories";

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

const fetchedTask: AsanaTask = {
  gid: "t-1",
  name: "Fetched task name",
  notes: null,
  completed: true,
  completed_at: "2026-07-06T09:00:00.000Z",
  due_on: null,
  due_at: null,
  assignee: { gid: "u-9", name: "Dana Assignee" },
  projects: [{ gid: "p-1" }],
  permalink_url: "https://app.asana.com/0/p-1/t-1",
  created_at: "2026-07-01T00:00:00.000Z",
  modified_at: "2026-07-06T09:00:00.000Z",
};

const fetchedStory: AsanaStoryDetail = {
  gid: "s-77",
  text: "A comment body",
  resource_subtype: "comment_added",
  created_at: "2026-07-06T10:00:00.000Z",
  created_by: { gid: "u-3", name: "Casey Commenter" },
  target: { gid: "t-1" },
};

describe("eventMatchesTriggerType (ASANA-2 per-row matcher)", () => {
  it("matches task+added / task+changed against the ASANA-1 types", () => {
    expect(eventMatchesTriggerType(ev, "new_task_in_project")).toBe(true);
    expect(
      eventMatchesTriggerType({ ...ev, action: "changed" }, "task_updated_in_project"),
    ).toBe(true);
    expect(eventMatchesTriggerType({ ...ev, action: "deleted" }, "new_task_in_project")).toBe(false);
    expect(eventMatchesTriggerType({}, "new_task_in_project")).toBe(false);
  });

  it("task_completed: requires task+changed and, when change is present, field=completed", () => {
    const changed = { ...ev, action: "changed" };
    expect(eventMatchesTriggerType(changed, "task_completed")).toBe(true); // no change obj → post-fetch gates
    expect(
      eventMatchesTriggerType(
        { ...changed, change: { field: "completed", action: "changed" } },
        "task_completed",
      ),
    ).toBe(true);
    expect(
      eventMatchesTriggerType(
        { ...changed, change: { field: "name", action: "changed" } },
        "task_completed",
      ),
    ).toBe(false);
    expect(eventMatchesTriggerType(ev, "task_completed")).toBe(false); // added, not changed
  });

  it("task_assigned: requires task+changed and, when change is present, field=assignee", () => {
    const changed = { ...ev, action: "changed" };
    expect(
      eventMatchesTriggerType(
        { ...changed, change: { field: "assignee", action: "changed" } },
        "task_assigned",
      ),
    ).toBe(true);
    expect(
      eventMatchesTriggerType(
        { ...changed, change: { field: "due_on", action: "changed" } },
        "task_assigned",
      ),
    ).toBe(false);
  });

  it("comment_added_to_task: requires story+added with resource_subtype comment_added", () => {
    const story = {
      ...ev,
      resource: { gid: "s-77", resource_type: "story", resource_subtype: "comment_added" },
    };
    expect(eventMatchesTriggerType(story, "comment_added_to_task")).toBe(true);
    expect(
      eventMatchesTriggerType(
        { ...story, resource: { gid: "s-77", resource_type: "story", resource_subtype: "assigned" } },
        "comment_added_to_task",
      ),
    ).toBe(false);
    expect(
      eventMatchesTriggerType({ ...story, action: "removed" }, "comment_added_to_task"),
    ).toBe(false);
    // A task event never matches the story trigger.
    expect(eventMatchesTriggerType(ev, "comment_added_to_task")).toBe(false);
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

describe("normalizeTaskCompleted (ASANA-2)", () => {
  const changedEv = { ...ev, action: "changed" };

  it("emits the bounded task_completed payload from the post-fetched task", () => {
    const event = normalizeTaskCompleted(changedEv, {
      projectId: "p-1",
      task: fetchedTask,
    });
    expect(event.provider).toBe("asana");
    expect(event.eventType).toBe("task_completed");
    expect(event.eventId).toBe("task_completed:p-1:t-1");
    expect(event.occurredAt).toBe("2026-07-06T09:00:00.000Z"); // completed_at wins
    expect(event.providerAccountId).toBe("p-1");
    expect(event.payload).toEqual({
      changeKind: "task_completed",
      taskGid: "t-1",
      taskName: "Fetched task name",
      projectGid: "p-1",
      completedAt: "2026-07-06T09:00:00.000Z",
      actorGid: "actor-1",
      createdAt: "2026-07-04T05:00:00.000Z",
    });
  });

  it("dedup key is timestamp-free and task-scoped (multi-parent/redelivery collapse)", () => {
    const a = normalizeTaskCompleted(
      { ...changedEv, created_at: "2026-07-06T09:00:00.100Z" },
      { projectId: "p-1", task: fetchedTask },
    );
    const b = normalizeTaskCompleted(
      { ...changedEv, created_at: "2026-07-06T09:00:00.900Z" },
      { projectId: "p-1", task: fetchedTask },
    );
    expect(a.eventId).toBe(b.eventId);
    expect(a.eventId).not.toContain("2026-07-06T09:00");
  });
});

describe("normalizeTaskAssigned (ASANA-2)", () => {
  const changedEv = { ...ev, action: "changed" };

  it("emits the bounded task_assigned payload with the post-fetched assignee", () => {
    const event = normalizeTaskAssigned(changedEv, {
      projectId: "p-1",
      task: fetchedTask,
      assigneeGid: "u-9",
    });
    expect(event.eventType).toBe("task_assigned");
    expect(event.eventId).toBe("task_assigned:p-1:t-1:u-9");
    expect(event.payload).toEqual({
      changeKind: "task_assigned",
      taskGid: "t-1",
      taskName: "Fetched task name",
      projectGid: "p-1",
      newAssigneeGid: "u-9",
      newAssigneeName: "Dana Assignee",
      actorGid: "actor-1",
      createdAt: "2026-07-04T05:00:00.000Z",
    });
  });

  it("dedup key is (task, assignee)-scoped and timestamp-free: same assignee collapses, different assignee fires again", () => {
    const sameA = normalizeTaskAssigned(
      { ...changedEv, created_at: "2026-07-06T09:00:00.100Z" },
      { projectId: "p-1", task: fetchedTask, assigneeGid: "u-9" },
    );
    const sameB = normalizeTaskAssigned(
      { ...changedEv, created_at: "2026-07-06T09:00:00.900Z" },
      { projectId: "p-1", task: fetchedTask, assigneeGid: "u-9" },
    );
    const other = normalizeTaskAssigned(changedEv, {
      projectId: "p-1",
      task: { ...fetchedTask, assignee: { gid: "u-10", name: "Other" } },
      assigneeGid: "u-10",
    });
    expect(sameA.eventId).toBe(sameB.eventId);
    expect(other.eventId).not.toBe(sameA.eventId);
  });
});

describe("normalizeCommentAddedToTask (ASANA-2)", () => {
  const storyEv = {
    ...ev,
    resource: {
      gid: "s-77",
      resource_type: "story",
      resource_subtype: "comment_added",
    },
    parent: { gid: "t-1", resource_type: "task" },
  };

  it("emits the bounded comment payload from the post-fetched story", () => {
    const event = normalizeCommentAddedToTask(storyEv, {
      projectId: "p-1",
      story: fetchedStory,
    });
    expect(event.eventType).toBe("comment_added_to_task");
    expect(event.eventId).toBe("comment_added_to_task:p-1:s-77");
    expect(event.occurredAt).toBe("2026-07-06T10:00:00.000Z");
    expect(event.payload).toEqual({
      changeKind: "comment_added_to_task",
      storyGid: "s-77",
      taskGid: "t-1",
      projectGid: "p-1",
      commentText: "A comment body",
      authorGid: "u-3",
      authorName: "Casey Commenter",
      createdAt: "2026-07-06T10:00:00.000Z",
    });
  });

  it("dedup key is the durable story gid (timestamp-free; every new comment is a new key)", () => {
    const a = normalizeCommentAddedToTask(storyEv, {
      projectId: "p-1",
      story: fetchedStory,
    });
    const b = normalizeCommentAddedToTask(
      { ...storyEv, created_at: "2026-07-06T10:00:59.000Z" },
      { projectId: "p-1", story: fetchedStory },
    );
    expect(a.eventId).toBe(b.eventId);
    const otherComment = normalizeCommentAddedToTask(storyEv, {
      projectId: "p-1",
      story: { ...fetchedStory, gid: "s-78" },
    });
    expect(otherComment.eventId).not.toBe(a.eventId);
  });

  it("truncates comment text to COMMENT_TEXT_MAX and falls back to the event parent for the task gid", () => {
    const long = "x".repeat(COMMENT_TEXT_MAX + 500);
    const event = normalizeCommentAddedToTask(storyEv, {
      projectId: "p-1",
      story: { ...fetchedStory, text: long, target: null },
    });
    expect((event.payload.commentText as string).length).toBe(COMMENT_TEXT_MAX);
    expect(event.payload.taskGid).toBe("t-1"); // ev.parent fallback
  });
});

describe("ASANA-2 P-S2 filters", () => {
  it("task_completed / comment_added filters narrow by project", () => {
    const completed = normalizeTaskCompleted(
      { ...ev, action: "changed" },
      { projectId: "p-1", task: fetchedTask },
    );
    const parsedMatch = asanaTaskCompletedFilter.parseConfig({ projectId: "p-1" });
    const parsedOther = asanaTaskCompletedFilter.parseConfig({ projectId: "p-X" });
    expect(asanaTaskCompletedFilter.evaluate(completed, parsedMatch).kind).toBe("match");
    expect(asanaTaskCompletedFilter.evaluate(completed, parsedOther).kind).toBe("no-match");

    const comment = normalizeCommentAddedToTask(
      {
        ...ev,
        resource: { gid: "s-77", resource_type: "story", resource_subtype: "comment_added" },
      },
      { projectId: "p-1", story: fetchedStory },
    );
    const cMatch = asanaCommentAddedToTaskFilter.parseConfig({ projectId: "p-1" });
    expect(asanaCommentAddedToTaskFilter.evaluate(comment, cMatch).kind).toBe("match");
  });

  it("task_assigned filter: project narrowing + optional assignee filter", () => {
    const assigned = normalizeTaskAssigned(
      { ...ev, action: "changed" },
      { projectId: "p-1", task: fetchedTask, assigneeGid: "u-9" },
    );

    // No assignee filter → any assignment in the project matches.
    const anyAssignee = asanaTaskAssignedFilter.parseConfig({ projectId: "p-1" });
    expect(asanaTaskAssignedFilter.evaluate(assigned, anyAssignee).kind).toBe("match");

    // Builder-cleared "" behaves as no filter.
    const cleared = asanaTaskAssignedFilter.parseConfig({ projectId: "p-1", assigneeId: "" });
    expect(asanaTaskAssignedFilter.evaluate(assigned, cleared).kind).toBe("match");

    // Matching assignee filter.
    const matching = asanaTaskAssignedFilter.parseConfig({ projectId: "p-1", assigneeId: "u-9" });
    expect(asanaTaskAssignedFilter.evaluate(assigned, matching).kind).toBe("match");

    // Non-matching assignee filter.
    const other = asanaTaskAssignedFilter.parseConfig({ projectId: "p-1", assigneeId: "u-42" });
    expect(asanaTaskAssignedFilter.evaluate(assigned, other).kind).toBe("no-match");

    // Wrong project loses before the assignee check.
    const wrongProject = asanaTaskAssignedFilter.parseConfig({ projectId: "p-X", assigneeId: "u-9" });
    expect(asanaTaskAssignedFilter.evaluate(assigned, wrongProject).kind).toBe("no-match");
  });

  it("ASANA-2 filters fail closed without a projectId", () => {
    expect(() => asanaTaskCompletedFilter.parseConfig({})).toThrow();
    expect(() => asanaTaskAssignedFilter.parseConfig({ assigneeId: "u-9" })).toThrow();
    expect(() => asanaCommentAddedToTaskFilter.parseConfig({ projectId: "" })).toThrow();
  });
});
