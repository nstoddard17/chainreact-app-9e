import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Asana `complete_task` ActionMeta — Slice 5.ASANA-1.
 */
export const asanaCompleteTaskMeta: ActionMeta = {
  key: "asana:complete_task",
  provider: "asana",
  type: "complete_task",
  displayName: "Complete Task",
  description:
    "Mark an Asana task as completed. Completing an already-completed task is a no-op.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      type: "combobox",
      optionsSource: "asana:workspaces",
      required: false,
      placeholder: "Search workspaces…",
      description: "Scopes the project and task pickers.",
    },
    {
      name: "projectId",
      label: "Project",
      type: "combobox",
      optionsSource: "asana:projects",
      dependsOn: "workspaceId",
      required: false,
      placeholder: "Select a workspace first",
    },
    {
      name: "taskGid",
      label: "Task",
      type: "combobox",
      optionsSource: "asana:tasks",
      dependsOn: "projectId",
      required: true,
      allowManualEntry: true,
      placeholder: "Select a project first, or paste a task gid",
    },
  ],
  outputs: [
    { name: "taskGid", type: "string", description: "Completed task gid." },
    { name: "completed", type: "boolean", description: "Completion state (true on success)." },
    {
      name: "completedAt",
      type: "string",
      description: "Asana-reported completion timestamp.",
      nullable: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 30,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Marks the task completed. Recoverable — un-complete the task in Asana to undo.",
};
