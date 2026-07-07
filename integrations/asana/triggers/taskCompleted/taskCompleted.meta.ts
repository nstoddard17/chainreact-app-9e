import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `asana:task_completed` — ASANA-2.
 *
 * Webhook-activated (POST /webhooks, filter task+changed
 * fields:["completed"]). The receive path post-fetches the task and
 * dispatches only when `completed === true`, so a merely-updated task
 * never fires this.
 */
export const asanaTaskCompletedTriggerMeta: TriggerMeta = {
  key: "asana:task_completed",
  provider: "asana",
  type: "task_completed",
  displayName: "Task Completed",
  description:
    "Fires when a task in the configured Asana project is marked complete. Confirmed against the task's live state, so plain edits never fire it. Re-completing the same task within 7 days does not re-fire.",
  category: "data",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      description: "Scopes the project picker.",
      type: "combobox",
      optionsSource: "asana:workspaces",
      required: false,
      placeholder: "Search workspaces…",
    },
    {
      name: "projectId",
      label: "Project",
      description: "Project whose task completions fire this trigger.",
      type: "combobox",
      optionsSource: "asana:projects",
      dependsOn: "workspaceId",
      required: true,
      placeholder: "Select a workspace first",
    },
  ],
  payloadShape: [
    {
      name: "changeKind",
      type: "string",
      description: "Always 'task_completed'.",
    },
    {
      name: "taskGid",
      type: "string",
      description: "Gid of the completed task (feed into Get Task).",
    },
    {
      name: "taskName",
      type: "string",
      description: "Name of the completed task. Sensitive — user content.",
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
      name: "completedAt",
      type: "string",
      description: "Completion timestamp from the task, when present.",
      nullable: true,
    },
    {
      name: "actorGid",
      type: "string",
      description: "Gid of the user who completed the task (when present).",
      nullable: true,
    },
    {
      name: "createdAt",
      type: "string",
      description: "Event timestamp (when present).",
      nullable: true,
    },
  ],
  displayOrder: 30,
};
