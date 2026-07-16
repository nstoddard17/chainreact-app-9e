import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI
 * `POST /v1.0/myorg/groups/{groupId}/datasets/{datasetId}/Default.UpdateDatasources`
 * (Update Datasources In Group).
 *
 * Body: `updateDetails: [{datasourceSelector: {datasourceType,
 * connectionDetails}, connectionDetails}]` — the selector matches the
 * EXISTING data source, the sibling connectionDetails is the new target.
 * Only provided keys are serialized (Power BI matches on the given
 * subset). Caller must be the dataset owner; original and new source
 * must share the exact same schema; a refresh is required afterward.
 *
 * NOTE: research.md documents the supported source PRODUCTS (SQL Server,
 * Azure SQL, Azure Analysis Services, Azure Synapse, OData, SharePoint,
 * Teradata, SAP HANA) but not the wire `datasourceType` ids beyond the
 * doc's `"Sql"` example. The action schema pins the conventional wire
 * ids (Sql / AnalysisServices / OData / SharePoint / Teradata / SapHana,
 * with Azure SQL + Synapse under Sql); this wrapper passes the given
 * string through unchanged.
 */

export interface DatasourceConnectionDetails {
  server?: string;
  database?: string;
  url?: string;
}

export interface DatasourceUpdate {
  datasourceType: string;
  /** Matches the EXISTING data source (only provided keys sent). */
  current: DatasourceConnectionDetails;
  /** The new connection target (only provided keys sent). */
  target: DatasourceConnectionDetails;
}

export interface DatasourcesUpdateInput {
  accessToken: string;
  groupId: string;
  datasetId: string;
  updates: DatasourceUpdate[];
}

function boundedDetails(
  details: DatasourceConnectionDetails,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (details.server !== undefined) out.server = details.server;
  if (details.database !== undefined) out.database = details.database;
  if (details.url !== undefined) out.url = details.url;
  return out;
}

export async function datasourcesUpdate(
  input: DatasourcesUpdateInput,
): Promise<void> {
  await powerbiFetch({
    accessToken: input.accessToken,
    method: "POST",
    path: `/groups/${encodeURIComponent(input.groupId)}/datasets/${encodeURIComponent(
      input.datasetId,
    )}/Default.UpdateDatasources`,
    body: {
      updateDetails: input.updates.map((u) => ({
        datasourceSelector: {
          datasourceType: u.datasourceType,
          connectionDetails: boundedDetails(u.current),
        },
        connectionDetails: boundedDetails(u.target),
      })),
    },
    notFoundResource: `semantic model ${input.datasetId}`,
    operation: "dataset UpdateDatasources POST",
  });
}
