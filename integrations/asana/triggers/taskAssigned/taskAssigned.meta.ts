import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `asana:task_assigned` — ASANA-2.
 *
 * Webhook-activated (POST /webhooks, filter task+changed
 * fields:["assignee"]). The receive path post-fetches the task and
 * dispatches only when it currently has an assignee — unassignment never
 * fires. Optional assignee filter narrows to assignments TO one user.
 */
export const asanaTaskAssignedTriggerMeta: TriggerMeta = {
  key: "asana:task_assigned",
  provider: "asana",
  type: "task_assigned",
  displayName: "Task Assigned",
  description:
    "Fires when a task in the configured Asana project is assigned or reassigned. Optionally narrow to assignments to one specific user. Unassigning a task does not fire.",
  category: "data",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      description: "Scopes the project and assignee pickers.",
      type: "combobox",
      optionsSource: "asana:workspaces",
      required: false,
      placeholder: "Search workspaces…",
    },
    {
      name: "projectId",
      label: "Project",
      description: "Project whose task assignments fire this trigger.",
      type: "combobox",
      optionsSource: "asana:projects",
      dependsOn: "workspaceId",
      required: true,
      placeholder: "Select a workspace first",
    },
    {
      name: "assigneeId",
      label: "Assignee (optional)",
      description:
        "Only fire when the task is assigned to this user. Leave empty to fire on any assignment.",
      type: "combobox",
      optionsSource: "asana:users",
      dependsOn: "workspaceId",
      required: false,
      placeholder: "Any assignee",
    },
  ],
  payloadShape: [
    {
      name: "changeKind",
      type: "string",
      description: "Always 'task_assigned'.",
    },
    {
      name: "taskGid",
      type: "string",
      description: "Gid of the assigned task (feed into Get Task).",
    },
    {
      name: "taskName",
      type: "string",
      description: "Name of the assigned task. Sensitive — user content.",
      sensitive: true,
      nullable: true,
    },
    {
      name: "projectGid",
      type: "string",
      description: "The watched project's gid.",
      nullable: true,
    },
    {
      name: "newAssigneeGid",
      type: "string",
      description: "Gid of the user the task is now assigned to.",
    },
    {
      name: "newAssigneeName",
      type: "string",
      description: "Display name of the new assignee. Sensitive — a person's name.",
      sensitive: true,
      nullable: true,
    },
    {
      name: "actorGid",
      type: "string",
      description: "Gid of the user who made the assignment (when present).",
      nullable: true,
    },
    {
      name: "createdAt",
      type: "string",
      description: "Event timestamp (when present).",
      nullable: true,
    },
  ],
  displayOrder: 40,
};
