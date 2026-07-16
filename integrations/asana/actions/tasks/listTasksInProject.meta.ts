import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Asana `list_tasks_in_project` ActionMeta — ASANA-2.
 *
 * Read-only, one page per run with an opaque cursor — the
 * digest/backfill companion for the webhook triggers.
 */
export const asanaListTasksInProjectMeta: ActionMeta = {
  key: "asana:list_tasks_in_project",
  provider: "asana",
  type: "list_tasks_in_project",
  displayName: "List Tasks in Project",
  description:
    "List tasks in an Asana project (one page per run, up to 100). Returns a cursor for the next page — useful for digests and backfills.",
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
      description: "Scopes the project picker.",
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
      name: "pageSize",
      label: "Page size",
      type: "number",
      required: false,
      advanced: true,
      placeholder: "50",
      description: "Tasks per page, 1–100. Defaults to 50.",
    },
    {
      name: "offset",
      label: "Page offset",
      type: "text",
      required: false,
      advanced: true,
      placeholder: "Leave empty for the first page",
      description:
        "Pagination cursor from a previous run's `nextOffset` output.",
    },
  ],
  outputs: [
    {
      name: "tasks",
      type: "array",
      description: "Tasks on this page (bounded fields per task).",
      fields: [
        { name: "taskGid", type: "string", description: "Task gid." },
        {
          name: "taskName",
          type: "string",
          description: "Task name. Sensitive — user content.",
          sensitive: true,
          nullable: true,
        },
        {
          name: "completed",
          type: "boolean",
          description: "Completion state.",
        },
        {
          name: "dueOn",
          type: "string",
          description: "Due date (YYYY-MM-DD), or null.",
          nullable: true,
        },
        {
          name: "assigneeGid",
          type: "string",
          description: "Assignee user gid, or null.",
          nullable: true,
        },
        {
          name: "permalinkUrl",
          type: "string",
          description: "Direct link to the task. Sensitive — access-bearing URL.",
          sensitive: true,
          nullable: true,
        },
      ],
    },
    {
      name: "count",
      type: "number",
      description: "Number of tasks returned on this page.",
    },
    {
      name: "hasMore",
      type: "boolean",
      description: "True when more pages exist.",
    },
    {
      name: "nextOffset",
      type: "string",
      description:
        "Opaque cursor for the next page (feed into `offset`), or null on the last page.",
      nullable: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 70,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
