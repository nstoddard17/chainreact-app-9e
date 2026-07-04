import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Asana `update_task` ActionMeta — Slice 5.ASANA-1.
 *
 * workspace → project → task cascade. `allowManualEntry` on the task
 * picker so upstream variables (`{{trigger.taskGid}}`) or pasted gids
 * work without a picker fetch.
 */
export const asanaUpdateTaskMeta: ActionMeta = {
  key: "asana:update_task",
  provider: "asana",
  type: "update_task",
  displayName: "Update Task",
  description:
    "Update an Asana task's name, notes, assignee, or due date. Only the fields you set are changed.",
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
    {
      name: "name",
      label: "New task name",
      type: "text",
      required: false,
      placeholder: "Leave empty to keep the current name",
    },
    {
      name: "notes",
      label: "New notes",
      type: "textarea",
      required: false,
      placeholder: "Leave empty to keep the current notes",
    },
    {
      name: "assigneeId",
      label: "New assignee",
      type: "combobox",
      optionsSource: "asana:users",
      dependsOn: "workspaceId",
      required: false,
      placeholder: "Leave empty to keep the current assignee",
    },
    {
      name: "dueOn",
      label: "New due date",
      type: "date",
      required: false,
    },
  ],
  outputs: [
    { name: "taskGid", type: "string", description: "Updated task gid." },
    {
      name: "taskName",
      type: "string",
      description: "Task name after the update.",
      sensitive: true,
      nullable: true,
    },
    {
      name: "permalinkUrl",
      type: "string",
      description: "Direct link to the task. Sensitive — access-bearing URL.",
      sensitive: true,
      nullable: true,
    },
    {
      name: "assigneeGid",
      type: "string",
      description: "Assignee user gid after the update, or null.",
      nullable: true,
    },
    {
      name: "dueOn",
      type: "string",
      description: "Due date after the update (YYYY-MM-DD), or null.",
      nullable: true,
    },
    { name: "completed", type: "boolean", description: "Completion state after the update." },
    {
      name: "modifiedAt",
      type: "string",
      description: "Asana-reported modification timestamp.",
      nullable: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 20,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Overwrites the provided task fields. Recoverable — re-edit the task in Asana to undo.",
};
