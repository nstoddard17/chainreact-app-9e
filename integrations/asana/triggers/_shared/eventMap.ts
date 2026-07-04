import type { AsanaWebhookFilter } from "@/integrations/_shared/asana/api/webhooks";

/**
 * Asana trigger ↔ event classification — Slice 5.ASANA-1.
 *
 * Asana webhook events are compact `{ user, resource, parent, action,
 * created_at }` objects. The 2 V2 triggers map to (resource_type, action)
 * pairs; the same pairs are pushed down to Asana as server-side creation
 * `filters` so the endpoint receives less noise.
 *
 *   - `new_task_in_project`     ← resource_type "task", action "added"
 *     (fires when a task is created in — or moved into — the watched
 *     project; Asana's "added" means added-to-the-watched-resource).
 *   - `task_updated_in_project` ← resource_type "task", action "changed"
 *     (any field change on a task in the watched project).
 */

export type AsanaTriggerType = "new_task_in_project" | "task_updated_in_project";

export const ASANA_TRIGGER_TYPES: readonly AsanaTriggerType[] = [
  "new_task_in_project",
  "task_updated_in_project",
];

/** Server-side webhook-creation filters per trigger type. */
export const WEBHOOK_FILTERS: Readonly<
  Record<AsanaTriggerType, readonly AsanaWebhookFilter[]>
> = Object.freeze({
  new_task_in_project: [{ resource_type: "task", action: "added" }],
  task_updated_in_project: [{ resource_type: "task", action: "changed" }],
});

/** Minimal shape of one entry in an Asana webhook `events` array. */
export interface AsanaEventObject {
  user?: { gid?: string } | null;
  resource?: {
    gid?: string;
    resource_type?: string;
    resource_subtype?: string | null;
  } | null;
  parent?: { gid?: string; resource_type?: string } | null;
  action?: string;
  created_at?: string;
}

/**
 * Classify one inbound event into a V2 trigger type, or null when the
 * event is not one V2 dispatches (stories, sections, deletes, …).
 */
export function classifyAsanaEvent(
  ev: AsanaEventObject,
): AsanaTriggerType | null {
  const resourceType = ev.resource?.resource_type;
  const action = ev.action;
  if (resourceType !== "task") return null;
  if (action === "added") return "new_task_in_project";
  if (action === "changed") return "task_updated_in_project";
  return null;
}
