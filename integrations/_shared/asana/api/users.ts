import { asanaListRequest, type AsanaPage } from "./_request";

/**
 * Typed Asana user wrapper — Slice 5.ASANA-1.
 *
 * `GET /users?workspace={gid}` (scope `users:read`). Requests `name` only —
 * V2 deliberately does NOT request user emails for the assignee picker
 * (names label the options; emails would be gratuitous PII in the browser).
 */

export interface AsanaUserSummary {
  gid: string;
  name: string | null;
}

export interface UsersListInput {
  accessToken: string;
  workspaceGid: string;
  limit: number;
}

export async function usersList(
  input: UsersListInput,
): Promise<AsanaPage<AsanaUserSummary>> {
  const query = new URLSearchParams({
    workspace: input.workspaceGid,
    limit: String(input.limit),
    opt_fields: "name",
  });
  return asanaListRequest<AsanaUserSummary>({
    accessToken: input.accessToken,
    method: "GET",
    path: "/users",
    query,
    resourceForNotFound: `workspace ${input.workspaceGid} (list users)`,
  });
}
