import { asanaListRequest, asanaRequest, type AsanaPage } from "./_request";

/**
 * Typed Asana task wrappers — Slice 5.ASANA-1.
 *
 * One endpoint per function; bounded field selection via `opt_fields`
 * (never full-record spreads). All ids are string gids.
 *
 * Endpoints (research.md):
 *   - POST /tasks                    (create; scope tasks:write)
 *   - PUT  /tasks/{task_gid}         (partial update / complete; tasks:write)
 *   - GET  /tasks/{task_gid}         (read; tasks:read)
 *   - GET  /tasks?project={gid}      (list for picker; tasks:read)
 */

/** The bounded task shape V2 consumes. Matches TASK_OPT_FIELDS below. */
export interface AsanaTask {
  gid: string;
  name: string | null;
  notes: string | null;
  completed: boolean | null;
  completed_at: string | null;
  due_on: string | null;
  due_at: string | null;
  assignee: { gid: string; name?: string | null } | null;
  projects: Array<{ gid: string }> | null;
  permalink_url: string | null;
  created_at: string | null;
  modified_at: string | null;
}

/**
 * The exact opt_fields set backing `AsanaTask`. Asana's compact records
 * omit most fields; requesting exactly this set keeps outputs bounded and
 * deterministic.
 */
const TASK_OPT_FIELDS = [
  "name",
  "notes",
  "completed",
  "completed_at",
  "due_on",
  "due_at",
  "assignee.name",
  "projects",
  "permalink_url",
  "created_at",
  "modified_at",
].join(",");

export interface TasksCreateInput {
  accessToken: string;
  projectId: string;
  name: string;
  notes?: string;
  /** Asana user gid to assign. Omitted → unassigned. */
  assigneeGid?: string;
  /** Due date `YYYY-MM-DD` (date-only per Asana's due_on). */
  dueOn?: string;
}

export async function tasksCreate(input: TasksCreateInput): Promise<AsanaTask> {
  const data: Record<string, unknown> = {
    name: input.name,
    projects: [input.projectId],
  };
  if (input.notes !== undefined) data.notes = input.notes;
  if (input.assigneeGid !== undefined) data.assignee = input.assigneeGid;
  if (input.dueOn !== undefined) data.due_on = input.dueOn;

  const query = new URLSearchParams({ opt_fields: TASK_OPT_FIELDS });
  return asanaRequest<AsanaTask>({
    accessToken: input.accessToken,
    method: "POST",
    path: "/tasks",
    query,
    data,
    resourceForNotFound: `project ${input.projectId} (create task)`,
  });
}

export interface TasksUpdateInput {
  accessToken: string;
  taskGid: string;
  /** Only the provided fields change — Asana PUT is a partial update. */
  name?: string;
  notes?: string;
  assigneeGid?: string;
  dueOn?: string;
  completed?: boolean;
}

export async function tasksUpdate(input: TasksUpdateInput): Promise<AsanaTask> {
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.notes !== undefined) data.notes = input.notes;
  if (input.assigneeGid !== undefined) data.assignee = input.assigneeGid;
  if (input.dueOn !== undefined) data.due_on = input.dueOn;
  if (input.completed !== undefined) data.completed = input.completed;

  const query = new URLSearchParams({ opt_fields: TASK_OPT_FIELDS });
  return asanaRequest<AsanaTask>({
    accessToken: input.accessToken,
    method: "PUT",
    path: `/tasks/${encodeURIComponent(input.taskGid)}`,
    query,
    data,
    resourceForNotFound: `task ${input.taskGid}`,
  });
}

export interface TasksGetInput {
  accessToken: string;
  taskGid: string;
}

export async function tasksGet(input: TasksGetInput): Promise<AsanaTask> {
  const query = new URLSearchParams({ opt_fields: TASK_OPT_FIELDS });
  return asanaRequest<AsanaTask>({
    accessToken: input.accessToken,
    method: "GET",
    path: `/tasks/${encodeURIComponent(input.taskGid)}`,
    query,
    resourceForNotFound: `task ${input.taskGid}`,
  });
}

/** Compact list-entry shape for the tasks picker. */
export interface AsanaTaskSummary {
  gid: string;
  name: string | null;
  completed: boolean | null;
}

export interface TasksListForProjectInput {
  accessToken: string;
  projectId: string;
  limit: number;
}

export async function tasksListForProject(
  input: TasksListForProjectInput,
): Promise<AsanaPage<AsanaTaskSummary>> {
  const query = new URLSearchParams({
    project: input.projectId,
    limit: String(input.limit),
    opt_fields: "name,completed",
  });
  return asanaListRequest<AsanaTaskSummary>({
    accessToken: input.accessToken,
    method: "GET",
    path: "/tasks",
    query,
    resourceForNotFound: `project ${input.projectId} (list tasks)`,
  });
}
