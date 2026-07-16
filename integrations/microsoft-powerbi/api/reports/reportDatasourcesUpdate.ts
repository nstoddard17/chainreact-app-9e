import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI
 * `POST /v1.0/myorg/groups/{groupId}/reports/{reportId}/Default.UpdateDatasources`
 * (Reports - Update Datasources In Group) — paginated (RDL) reports ONLY.
 *
 * Wire body (verified against the live reference page 2026-07-15):
 * `{ updateDetails: [{ datasourceName, connectionDetails: { server?,
 * database? } }] }` — RDL data sources are selected by NAME, not by a
 * type/current-connection selector (that shape belongs to the DATASET
 * `Default.UpdateDatasources` endpoint). The wrapper synthesizes the
 * wire format from V2-shaped rows; only the set new-connection fields
 * are sent.
 *
 * Documented constraints: original and new data source must share the
 * exact same schema; changing the datasource type is unsupported; ODBC
 * is unsupported; the caller must be the data source owner.
 *
 * // NOTE: the reference page prints the scope as `Reports.ReadWrite.All`
 * // (plural) — research.md §5.2 flags this as a likely doc typo for
 * // `Report.ReadWrite.All`. No request-shape impact.
 */

export interface ReportDatasourceUpdate {
  /** Name of the RDL data source inside the paginated report. */
  datasourceName: string;
  newServer?: string;
  newDatabase?: string;
}

export interface ReportDatasourcesUpdateInput {
  accessToken: string;
  groupId: string;
  reportId: string;
  updates: ReadonlyArray<ReportDatasourceUpdate>;
}

export async function reportDatasourcesUpdate(
  input: ReportDatasourcesUpdateInput,
): Promise<void> {
  const updateDetails = input.updates.map((u) => {
    const connectionDetails: Record<string, string> = {};
    if (u.newServer !== undefined) connectionDetails.server = u.newServer;
    if (u.newDatabase !== undefined) connectionDetails.database = u.newDatabase;
    return { datasourceName: u.datasourceName, connectionDetails };
  });

  await powerbiFetch({
    accessToken: input.accessToken,
    method: "POST",
    path: `/groups/${encodeURIComponent(input.groupId)}/reports/${encodeURIComponent(
      input.reportId,
    )}/Default.UpdateDatasources`,
    body: { updateDetails },
    notFoundResource: `report ${input.reportId}`,
    operation: "report UpdateDatasources POST",
  });
}
