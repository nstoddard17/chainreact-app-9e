import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { AsanaEventObject } from "../_shared/eventMap";

/**
 * Normalize an Asana `task added` webhook event into V2's canonical
 * `TriggerEvent` — Slice 5.ASANA-1.
 *
 * Asana events are COMPACT (gids + action + timestamp only — no task
 * names or field values), so the canonical payload is deliberately small:
 *   changeKind, taskGid, projectGid, actorGid, action, resourceSubtype,
 *   createdAt
 * Workflows chain `asana:get_task` on `{{trigger.taskGid}}` for content.
 * Nothing here is free-form user content, so no `sensitive` flags are
 * needed on the payload shape.
 *
 * `projectGid` comes from the RECEIVING row's configured project (threaded
 * in by receive.ts) — the webhook is project-scoped so the row is the
 * authoritative attribution; compact events don't reliably carry the
 * project in `parent`.
 *
 * Dedup key (no provider-issued event id on Asana webhook bodies):
 * `new_task_in_project:${projectGid}:${taskGid}:${created_at}`.
 * Deterministic, so the per-workflow webhook fan-out (N workflows
 * watching the same project → N deliveries of the same logical event)
 * collapses to a single dispatch round; `dispatchTriggerEvent` then fans
 * out to all rows on `(asana, new_task_in_project)` and the per-trigger
 * projectId filter re-narrows to the right project's workflows.
 */
export function normalizeNewTaskInProject(
  ev: AsanaEventObject,
  ctx: { projectId: string | null },
): TriggerEvent {
  const taskGid = ev.resource?.gid ?? null;
  const createdAt = ev.created_at ?? null;
  const occurredAt = createdAt ?? new Date().toISOString();
  const projectGid = ctx.projectId;

  const eventId = `new_task_in_project:${projectGid ?? "no-project"}:${
    taskGid ?? "no-task"
  }:${createdAt ?? occurredAt}`;

  return {
    provider: "asana",
    eventType: "new_task_in_project",
    eventId,
    occurredAt,
    providerAccountId: projectGid ?? "unknown",
    payload: {
      changeKind: "new_task_in_project",
      taskGid,
      projectGid,
      actorGid: ev.user?.gid ?? null,
      action: ev.action ?? null,
      resourceSubtype: ev.resource?.resource_subtype ?? null,
      createdAt,
    },
  };
}
