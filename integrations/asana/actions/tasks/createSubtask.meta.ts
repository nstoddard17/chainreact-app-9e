import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Asana `create_subtask` ActionMeta — ASANA-2.
 *
 * workspace → project → parent-task cascade (reuses the ASANA-1
 * pickers); assignee picker scoped to the workspace. The subtask
 * inherits its parent's project placement.
 */
export const asanaCreateSubtaskMeta: ActionMeta = {
  key: "asana:create_subtask",
  provider: "asana",
  type: "create_subtask",
  displayName: "Create Subtask",
  description:
    "Create a subtask under an existing Asana task. Optionally set notes, an assignee, and a due date.",
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
      description: "Scopes the project, parent-task, and assignee pickers.",
    },
    {
      name: "projectId",
      label: "Project",
      type: "combobox",
      optionsSource: "asana:projects",
      dependsOn: "workspaceId",
      required: false,
      placeholder: "Select a workspace first",
      description: "Scopes the parent-task picker.",
    },
    {
      name: "parentTaskGid",
      label: "Parent task",
      type: "combobox",
      optionsSource: "asana:tasks",
      dependsOn: "projectId",
      required: true,
      allowManualEntry: true,
      placeholder: "Select a project first, or paste a task gid",
      description: "The task the subtask is created under.",
    },
    {
      name: "name",
      label: "Subtask name",
      type: "text",
      required: true,
      placeholder: "New subtask",
    },
    {
      name: "notes",
      label: "Notes",
      type: "textarea",
      required: false,
      placeholder: "Optional subtask description (plain text).",
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
    { name: "taskGid", type: "string", description: "New subtask gid." },
    {
      name: "taskName",
      type: "string",
      description: "Subtask name (provider-returned, else the configured name).",
      sensitive: true,
    },
    {
      name: "parentTaskGid",
      type: "string",
      description: "Gid of the parent task the subtask was created under.",
    },
    {
      name: "permalinkUrl",
      type: "string",
      description: "Direct link to the subtask. Sensitive — access-bearing URL.",
      sensitive: true,
      nullable: true,
    },
    {
      name: "assigneeGid",
      type: "string",
      description: "Assignee user gid, or null.",
      nullable: true,
    },
    {
      name: "dueOn",
      type: "string",
      description: "Due date (YYYY-MM-DD), or null.",
      nullable: true,
    },
    {
      name: "completed",
      type: "boolean",
      description: "Completion state (false for a new subtask).",
    },
    {
      name: "createdAt",
      type: "string",
      description: "Creation timestamp.",
      nullable: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 60,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
