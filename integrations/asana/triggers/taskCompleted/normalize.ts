import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { AsanaTask } from "@/integrations/_shared/asana/api/tasks";
import type { AsanaEventObject } from "../_shared/eventMap";

/**
 * Normalize an Asana completed-field change into V2's canonical
 * `TriggerEvent` — ASANA-2 `task_completed`.
 *
 * The receive helper has ALREADY post-fetched the task and confirmed
 * `completed === true` before calling this (compact events carry no
 * field values — docs/providers/asana/research.md "Events are compact").
 * A merely-updated task never reaches here.
 *
 * Dedup key (timestamp-free, stable semantic identity):
 * `task_completed:${projectGid}:${taskGid}` — a task completing is one
 * user-visible fact; the task-scoped key collapses Asana's multi-parent
 * duplicate deliveries (the live-proven ASANA-1 double-fire class),
 * provider redeliveries, AND the per-workflow webhook fan-out into one
 * dispatch round. Documented limitation: a task un-completed and
 * re-completed within the 7-day dedup TTL does not re-fire.
 *
 * Payload is bounded; taskName comes from the post-fetch (marked
 * sensitive in the meta — user content).
 */
export function normalizeTaskCompleted(
  ev: AsanaEventObject,
  ctx: { projectId: string | null; task: AsanaTask },
): TriggerEvent {
  const taskGid = ctx.task.gid;
  const createdAt = ev.created_at ?? null;
  const occurredAt = ctx.task.completed_at ?? createdAt ?? new Date().toISOString();
  const projectGid = ctx.projectId;

  return {
    provider: "asana",
    eventType: "task_completed",
    eventId: `task_completed:${projectGid ?? "no-project"}:${taskGid}`,
    occurredAt,
    providerAccountId: projectGid ?? "unknown",
    payload: {
      changeKind: "task_completed",
      taskGid,
      taskName: ctx.task.name ?? null,
      projectGid,
      completedAt: ctx.task.completed_at ?? null,
      actorGid: ev.user?.gid ?? null,
      createdAt,
    },
  };
}
