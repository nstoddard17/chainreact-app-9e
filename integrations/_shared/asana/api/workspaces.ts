import { asanaListRequest, type AsanaPage } from "./_request";

/**
 * Typed Asana workspace wrapper — Slice 5.ASANA-1.
 *
 * `GET /workspaces` (scope `workspaces:read`). Compact records; one page
 * per call with `hasMore` from `next_page`.
 */

export interface AsanaWorkspaceSummary {
  gid: string;
  name: string | null;
}

export interface WorkspacesListInput {
  accessToken: string;
  limit: number;
}

export async function workspacesList(
  input: WorkspacesListInput,
): Promise<AsanaPage<AsanaWorkspaceSummary>> {
  const query = new URLSearchParams({
    limit: String(input.limit),
    opt_fields: "name",
  });
  return asanaListRequest<AsanaWorkspaceSummary>({
    accessToken: input.accessToken,
    method: "GET",
    path: "/workspaces",
    query,
    resourceForNotFound: "workspaces",
  });
}
