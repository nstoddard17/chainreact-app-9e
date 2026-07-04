import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `asana:new_task_in_project` — Slice
 * 5.ASANA-1.
 *
 * Webhook-activated. Activation creates one Asana project webhook
 * (`POST /webhooks`, filter task+added) bound to the configured project;
 * the per-webhook X-Hook-Secret is persisted (encrypted) during the
 * creation handshake. Low risk — observational.
 *
 * `payloadShape` mirrors `normalize.ts`. Asana events are compact (gids
 * only — no task names), so nothing in the payload is sensitive; chain
 * `asana:get_task` on `taskGid` for content.
 */
export const asanaNewTaskInProjectTriggerMeta: TriggerMeta = {
  key: "asana:new_task_in_project",
  provider: "asana",
  type: "new_task_in_project",
  displayName: "New Task in Project",
  description:
    "Fires when a task is created in (or moved into) the configured Asana project. The event carries gids only — chain Get Task for the task's content.",
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
      description: "Project to watch for new tasks.",
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
      description: "Always 'new_task_in_project'.",
    },
    {
      name: "taskGid",
      type: "string",
      description: "Gid of the added task (feed into Get Task).",
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
      description: "Gid of the user who added the task (when present).",
      nullable: true,
    },
    {
      name: "action",
      type: "string",
      description: "Asana event action (always 'added' for this trigger).",
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
  displayOrder: 10,
};
