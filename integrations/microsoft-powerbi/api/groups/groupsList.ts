import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI `GET /v1.0/myorg/groups` (Get Groups).
 *
 * Lists the workspaces (v2 "groups") the connected user can access.
 * "My workspace" is deliberately NOT reachable through this provider —
 * every ChainReact Power BI action/trigger is workspace-scoped, so the
 * picker only offers real (shareable) workspaces.
 *
 * Single page: `$top` capped at 200 (options pickers filter client-side
 * via `q`); `hasMore` advertises truncation.
 */

export interface GroupsListInput {
  accessToken: string;
  top?: number;
}

export interface PowerBiGroup {
  id: string;
  name: string;
  isOnDedicatedCapacity: boolean;
  capacityId: string | null;
}

export interface GroupsListResult {
  groups: PowerBiGroup[];
  hasMore: boolean;
}

interface GroupsListBody {
  value?: Array<{
    id?: string;
    name?: string;
    isOnDedicatedCapacity?: boolean;
    capacityId?: string;
  }>;
}

export async function groupsList(
  input: GroupsListInput,
): Promise<GroupsListResult> {
  const top = input.top ?? 200;
  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "GET",
    path: "/groups",
    query: { $top: String(top + 1) },
    operation: "groups GET",
  });

  const body = (await res.json()) as GroupsListBody;
  const rows = body.value ?? [];
  const groups: PowerBiGroup[] = [];
  for (const row of rows.slice(0, top)) {
    if (typeof row.id !== "string" || typeof row.name !== "string") continue;
    groups.push({
      id: row.id,
      name: row.name,
      isOnDedicatedCapacity: row.isOnDedicatedCapacity === true,
      capacityId: typeof row.capacityId === "string" ? row.capacityId : null,
    });
  }
  return { groups, hasMore: rows.length > top };
}
