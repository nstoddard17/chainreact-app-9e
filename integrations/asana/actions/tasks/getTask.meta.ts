import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Asana `get_task` ActionMeta — Slice 5.ASANA-1.
 *
 * The chaining companion for the compact webhook triggers: Asana events
 * carry only gids, so workflows wire `{{trigger.taskGid}}` into this
 * action for task content.
 */
export const asanaGetTaskMeta: ActionMeta = {
  key: "asana:get_task",
  provider: "asana",
  type: "get_task",
  displayName: "Get Task",
  description:
    "Fetch one Asana task by gid — name, notes, completion, due date, assignee, projects, and link.",
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
    { name: "taskGid", type: "string", description: "Task gid." },
    {
      name: "taskName",
      type: "string",
      description: "Task name.",
      sensitive: true,
      nullable: true,
    },
    {
      name: "notes",
      type: "string",
      description: "Task notes (plain text). Sensitive — free-form user content.",
      sensitive: true,
      nullable: true,
    },
    { name: "completed", type: "boolean", description: "Completion state." },
    {
      name: "completedAt",
      type: "string",
      description: "Completion timestamp, or null.",
      nullable: true,
    },
    {
      name: "dueOn",
      type: "string",
      description: "Due date (YYYY-MM-DD), or null.",
      nullable: true,
    },
    {
      name: "dueAt",
      type: "string",
      description: "Due date-time (ISO), or null.",
      nullable: true,
    },
    {
      name: "assigneeGid",
      type: "string",
      description: "Assignee user gid, or null.",
      nullable: true,
    },
    {
      name: "assigneeName",
      type: "string",
      description: "Assignee display name. Sensitive — a person's name.",
      sensitive: true,
      nullable: true,
    },
    {
      name: "projectGids",
      type: "array",
      description: "Gids of the projects this task belongs to.",
    },
    {
      name: "permalinkUrl",
      type: "string",
      description: "Direct link to the task. Sensitive — access-bearing URL.",
      sensitive: true,
      nullable: true,
    },
    {
      name: "createdAt",
      type: "string",
      description: "Creation timestamp.",
      nullable: true,
    },
    {
      name: "modifiedAt",
      type: "string",
      description: "Last-modified timestamp.",
      nullable: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 50,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
