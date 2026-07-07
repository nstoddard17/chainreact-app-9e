import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { AsanaTask } from "@/integrations/_shared/asana/api/tasks";
import type { AsanaEventObject } from "../_shared/eventMap";

/**
 * Normalize an Asana assignee-field change into V2's canonical
 * `TriggerEvent` — ASANA-2 `task_assigned`.
 *
 * The receive helper has ALREADY post-fetched the task and confirmed it
 * currently HAS an assignee before calling this — compact events carry
 * no field values, and unassignment must not fire an "assigned" trigger.
 * The post-fetched assignee is the authoritative "new assignee" (the
 * compact event's `change.new_value` is never trusted for dispatch).
 *
 * Dedup key (timestamp-free, stable semantic identity):
 * `task_assigned:${projectGid}:${taskGid}:${assigneeGid}` — one fire per
 * (task, assignee) pair. Collapses multi-parent duplicate deliveries,
 * provider redeliveries, and the per-workflow webhook fan-out; a
 * DIFFERENT assignee on the same task is a new key and fires again.
 * Documented limitation: re-assigning the SAME user to the same task
 * within the 7-day dedup TTL (A → B → A) does not re-fire for the
 * second A.
 */
export function normalizeTaskAssigned(
  ev: AsanaEventObject,
  ctx: {
    projectId: string | null;
    task: AsanaTask;
    /** Non-null — receive gates on the post-fetch having an assignee. */
    assigneeGid: string;
  },
): TriggerEvent {
  const taskGid = ctx.task.gid;
  const createdAt = ev.created_at ?? null;
  const occurredAt = createdAt ?? new Date().toISOString();
  const projectGid = ctx.projectId;

  return {
    provider: "asana",
    eventType: "task_assigned",
    eventId: `task_assigned:${projectGid ?? "no-project"}:${taskGid}:${ctx.assigneeGid}`,
    occurredAt,
    providerAccountId: projectGid ?? "unknown",
    payload: {
      changeKind: "task_assigned",
      taskGid,
      taskName: ctx.task.name ?? null,
      projectGid,
      newAssigneeGid: ctx.assigneeGid,
      newAssigneeName: ctx.task.assignee?.name ?? null,
      actorGid: ev.user?.gid ?? null,
      createdAt,
    },
  };
}
