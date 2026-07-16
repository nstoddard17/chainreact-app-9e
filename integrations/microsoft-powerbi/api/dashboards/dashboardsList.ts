import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI `GET /v1.0/myorg/groups/{groupId}/dashboards`
 * (Get Dashboards In Group).
 *
 * Lists the dashboards in a workspace — the fourth artifact source behind
 * the `workspace_item_added` / `workspace_item_removed` triggers (reports,
 * semantic models, dataflows have wrappers already). No documented
 * server-side paging params; list sizes are workspace-bounded, matching
 * `reportsList` / `datasetsList`. Fixed-key mapping only (never spread the
 * raw rows — they also carry `embedUrl` / `webUrl`, which are provider URLs
 * and must never reach a workflow variable).
 *
 * NOTE: `docs/providers/microsoft-powerbi/research.md` §5.1 lists
 * `Dashboard.Read.All` among the Entra-portal scopes it could NOT confirm
 * on a fetched Learn reference page, and the provider manifest does not
 * currently request any `Dashboard.*` scope. Dashboard listing may
 * therefore fail authorization until the scope question is settled at the
 * manifest level — the triggers gate the call behind the author's
 * `itemTypes` filter so workspaces that don't watch dashboards never hit
 * this endpoint.
 */

export interface DashboardsListInput {
  accessToken: string;
  groupId: string;
}

export interface PowerBiDashboardSummary {
  id: string;
  displayName: string;
}

interface DashboardsListBody {
  value?: Array<{
    id?: string;
    displayName?: string;
  }>;
}

export async function dashboardsList(
  input: DashboardsListInput,
): Promise<PowerBiDashboardSummary[]> {
  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "GET",
    path: `/groups/${encodeURIComponent(input.groupId)}/dashboards`,
    notFoundResource: `workspace ${input.groupId}`,
    operation: "dashboards GET",
  });

  const body = (await res.json()) as DashboardsListBody;
  const dashboards: PowerBiDashboardSummary[] = [];
  for (const row of body.value ?? []) {
    if (typeof row.id !== "string" || typeof row.displayName !== "string") {
      continue;
    }
    dashboards.push({ id: row.id, displayName: row.displayName });
  }
  return dashboards;
}
