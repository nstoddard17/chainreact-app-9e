import { asanaListRequest, type AsanaPage } from "./_request";

/**
 * Typed Asana project wrapper — Slice 5.ASANA-1.
 *
 * `GET /projects?workspace={gid}&archived=false` (scope `projects:read`).
 * Docs warn the endpoint "may timeout for large domains" — the picker
 * requests one bounded page and refines via the search box.
 */

export interface AsanaProjectSummary {
  gid: string;
  name: string | null;
  archived: boolean | null;
}

export interface ProjectsListInput {
  accessToken: string;
  workspaceGid: string;
  limit: number;
}

export async function projectsList(
  input: ProjectsListInput,
): Promise<AsanaPage<AsanaProjectSummary>> {
  const query = new URLSearchParams({
    workspace: input.workspaceGid,
    archived: "false",
    limit: String(input.limit),
    opt_fields: "name,archived",
  });
  return asanaListRequest<AsanaProjectSummary>({
    accessToken: input.accessToken,
    method: "GET",
    path: "/projects",
    query,
    resourceForNotFound: `workspace ${input.workspaceGid} (list projects)`,
  });
}
