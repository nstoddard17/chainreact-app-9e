import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `asana:task_updated_in_project` — Slice
 * 5.ASANA-1.
 *
 * Webhook-activated (POST /webhooks, filter task+changed). NOTE: chatty —
 * any field change on any task in the project fires it; the description
 * says so, so authors pick it deliberately.
 */
export const asanaTaskUpdatedInProjectTriggerMeta: TriggerMeta = {
  key: "asana:task_updated_in_project",
  provider: "asana",
  type: "task_updated_in_project",
  displayName: "Task Updated in Project",
  description:
    "Fires when any task in the configured Asana project changes (any field). The event carries gids only — chain Get Task for the task's content. High-traffic projects fire often.",
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
      description: "Project whose task changes fire this trigger.",
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
      description: "Always 'task_updated_in_project'.",
    },
    {
      name: "taskGid",
      type: "string",
      description: "Gid of the changed task (feed into Get Task).",
      nullable: true,
    },
    {
      name: "projectGid",
      type: "string",
      description: "The watched project's gid.",
      nullable: true,
    },
    {
      name: "actorGid",
      type: "string",
      description: "Gid of the user who made the change (when present).",
      nullable: true,
    },
    {
      name: "action",
      type: "string",
      description: "Asana event action (always 'changed' for this trigger).",
      nullable: true,
    },
    {
      name: "resourceSubtype",
      type: "string",
      description: "Task subtype (e.g. default_task, milestone), when present.",
      nullable: true,
    },
    {
      name: "createdAt",
      type: "string",
      description: "Event timestamp (when present).",
      nullable: true,
    },
  ],
  displayOrder: 20,
};
