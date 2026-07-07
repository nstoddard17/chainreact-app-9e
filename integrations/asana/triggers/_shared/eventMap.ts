import type { AsanaWebhookFilter } from "@/integrations/_shared/asana/api/webhooks";

/**
 * Asana trigger ↔ event classification — Slice 5.ASANA-1 + ASANA-2.
 *
 * Asana webhook events are compact `{ user, resource, parent, action,
 * created_at, change? }` objects. Each V2 trigger maps to a
 * (resource_type, action[, resource_subtype, fields]) signature; the same
 * signature is pushed down to Asana as server-side creation `filters` so
 * the endpoint receives less noise.
 *
 *   - `new_task_in_project`      ← task + added (created in — or moved
 *     into — the watched project; Asana's "added" means
 *     added-to-the-watched-resource).
 *   - `task_updated_in_project`  ← task + changed (any field).
 *   - `task_completed`           ← task + changed, fields:["completed"]
 *     (ASANA-2). The receive helper post-fetches the task and only
 *     dispatches when `completed === true`.
 *   - `task_assigned`            ← task + changed, fields:["assignee"]
 *     (ASANA-2). Post-fetch reads the authoritative current assignee;
 *     unassignment does not dispatch.
 *   - `comment_added_to_task`    ← story + added,
 *     resource_subtype:"comment_added" (ASANA-2). Post-fetch reads the
 *     story detail (scope stories:read).
 *
 * ASANA-2 note — WHY a per-row matcher and not a global classifier: the
 * three `task + changed` signatures overlap (a completed-flip is also a
 * generic change). Each trigger row owns its OWN webhook (per
 * workflow+node URL), so the row's eventType is the authoritative intent;
 * classification is therefore "does this event match THE ROW's type",
 * not "which single type is this event".
 */

export type AsanaTriggerType =
  | "new_task_in_project"
  | "task_updated_in_project"
  | "task_completed"
  | "task_assigned"
  | "comment_added_to_task";

export const ASANA_TRIGGER_TYPES: readonly AsanaTriggerType[] = [
  "new_task_in_project",
  "task_updated_in_project",
  "task_completed",
  "task_assigned",
  "comment_added_to_task",
];

/** Server-side webhook-creation filters per trigger type. */
export const WEBHOOK_FILTERS: Readonly<
  Record<AsanaTriggerType, readonly AsanaWebhookFilter[]>
> = Object.freeze({
  new_task_in_project: [{ resource_type: "task", action: "added" }],
  task_updated_in_project: [{ resource_type: "task", action: "changed" }],
  task_completed: [
    { resource_type: "task", action: "changed", fields: ["completed"] },
  ],
  task_assigned: [
    { resource_type: "task", action: "changed", fields: ["assignee"] },
  ],
  comment_added_to_task: [
    {
      resource_type: "story",
      action: "added",
      resource_subtype: "comment_added",
    },
  ],
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
  /**
   * Present on field-change events (ASANA-2). `field` names the changed
   * property; `new_value` carries the new scalar/object value when Asana
   * includes it. Compact events may omit the whole object — matchers
   * treat a missing `change` as "allow through" because the server-side
   * `fields` filter already scoped the delivery and the post-fetch is the
   * authoritative gate.
   */
  change?: {
    field?: string;
    action?: string;
    new_value?: { gid?: string; resource_type?: string } | null;
  } | null;
}

/**
 * Does one inbound compact event match the given trigger type's
 * signature? Defense-in-depth mirror of WEBHOOK_FILTERS — a filtered
 * webhook should only deliver its own signature, but we never dispatch
 * on trust.
 */
export function eventMatchesTriggerType(
  ev: AsanaEventObject,
  triggerType: AsanaTriggerType,
): boolean {
  const resourceType = ev.resource?.resource_type;
  const action = ev.action;

  switch (triggerType) {
    case "new_task_in_project":
      return resourceType === "task" && action === "added";
    case "task_updated_in_project":
      return resourceType === "task" && action === "changed";
    case "task_completed": {
      if (resourceType !== "task" || action !== "changed") return false;
      // change.field, when present, must be the filtered field. Absent
      // change → allow; the post-fetch completed===true gate decides.
      const field = ev.change?.field;
      return field === undefined || field === "completed";
    }
    case "task_assigned": {
      if (resourceType !== "task" || action !== "changed") return false;
      const field = ev.change?.field;
      return field === undefined || field === "assignee";
    }
    case "comment_added_to_task":
      return (
        resourceType === "story" &&
        action === "added" &&
        ev.resource?.resource_subtype === "comment_added"
      );
    default:
      return false;
  }
}
