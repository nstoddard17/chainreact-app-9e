import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { AsanaEventObject } from "../_shared/eventMap";

/**
 * Normalize an Asana `task changed` webhook event into V2's canonical
 * `TriggerEvent` — Slice 5.ASANA-1.
 *
 * Same compact-payload posture as `newTaskInProject/normalize.ts` (Asana
 * events carry gids only; chain `asana:get_task` for content). Note this
 * trigger can be CHATTY — Asana fires `changed` for any field change on
 * any task in the project; the dedup key includes the event timestamp so
 * distinct edits each dispatch once.
 *
 * Dedup key: `task_updated_in_project:${projectGid}:${taskGid}:${created_at}`.
 */
export function normalizeTaskUpdatedInProject(
  ev: AsanaEventObject,
  ctx: { projectId: string | null },
): TriggerEvent {
  const taskGid = ev.resource?.gid ?? null;
  const createdAt = ev.created_at ?? null;
  const occurredAt = createdAt ?? new Date().toISOString();
  const projectGid = ctx.projectId;

  const eventId = `task_updated_in_project:${projectGid ?? "no-project"}:${
    taskGid ?? "no-task"
  }:${createdAt ?? occurredAt}`;

  return {
    provider: "asana",
    eventType: "task_updated_in_project",
    eventId,
    occurredAt,
    providerAccountId: projectGid ?? "unknown",
    payload: {
      changeKind: "task_updated_in_project",
      taskGid,
      projectGid,
      actorGid: ev.user?.gid ?? null,
      action: ev.action ?? null,
      resourceSubtype: ev.resource?.resource_subtype ?? null,
      createdAt,
    },
  };
}
