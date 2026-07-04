import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Asana `create_task` ActionMeta — Slice 5.ASANA-1.
 *
 * workspace → project cascade; assignee picker scoped to the workspace.
 * Sections deferred (implementation-plan.md) — tasks land in the
 * project's default section.
 */
export const asanaCreateTaskMeta: ActionMeta = {
  key: "asana:create_task",
  provider: "asana",
  type: "create_task",
  displayName: "Create Task",
  description:
    "Create a new task in an Asana project. Optionally set notes, an assignee, and a due date.",
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
      description: "Scopes the project and assignee pickers.",
    },
    {
      name: "projectId",
      label: "Project",
      type: "combobox",
      optionsSource: "asana:projects",
      dependsOn: "workspaceId",
      required: true,
      placeholder: "Select a workspace first",
    },
    {
      name: "name",
      label: "Task name",
      type: "text",
      required: true,
      placeholder: "New task",
    },
    {
      name: "notes",
      label: "Notes",
      type: "textarea",
      required: false,
      placeholder: "Optional task description (plain text).",
    },
    {
      name: "assigneeId",
      label: "Assignee",
      type: "combobox",
      optionsSource: "asana:users",
      dependsOn: "workspaceId",
      required: false,
      placeholder: "Unassigned",
    },
    {
      name: "dueOn",
      label: "Due date",
      type: "date",
      required: false,
    },
  ],
  outputs: [
    { name: "taskGid", type: "string", description: "New task gid." },
    {
      name: "taskName",
      type: "string",
      description: "Task name (provider-returned, else the configured name).",
      sensitive: true,
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
      description: "Assignee user gid, or null when unassigned.",
      nullable: true,
    },
    {
      name: "dueOn",
      type: "string",
      description: "Due date (YYYY-MM-DD), or null.",
      nullable: true,
    },
    { name: "completed", type: "boolean", description: "Always false for a new task." },
    {
      name: "createdAt",
      type: "string",
      description: "Asana-reported creation timestamp.",
      nullable: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 10,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Creates a task in the project. Recoverable — complete or delete the task in Asana to undo.",
};
