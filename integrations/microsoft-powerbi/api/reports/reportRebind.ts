import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI
 * `POST /v1.0/myorg/groups/{groupId}/reports/{reportId}/Rebind`
 * (Rebind Report In Group).
 *
 * Rebinds a Power BI report to another semantic model (dataset).
 * Paginated reports are NOT supported by this endpoint (they use
 * `Default.UpdateDatasources` instead). Requires Write on the report
 * and Build on the target model; live-connection reports become
 * direct-bound after a rebind. 200 with an empty body on success.
 */

export interface ReportRebindInput {
  accessToken: string;
  groupId: string;
  reportId: string;
  /** Target semantic model (wire name: datasetId). */
  datasetId: string;
}

export async function reportRebind(input: ReportRebindInput): Promise<void> {
  await powerbiFetch({
    accessToken: input.accessToken,
    method: "POST",
    path: `/groups/${encodeURIComponent(input.groupId)}/reports/${encodeURIComponent(
      input.reportId,
    )}/Rebind`,
    body: { datasetId: input.datasetId },
    notFoundResource: `report ${input.reportId}`,
    operation: "report Rebind POST",
  });
}
