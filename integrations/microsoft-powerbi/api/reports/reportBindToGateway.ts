import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI
 * `POST /v1.0/myorg/groups/{groupId}/reports/{reportId}/Default.BindToGateway`
 * (Reports - Bind To Gateway In Group) — paginated (RDL) reports ONLY.
 *
 * Wire body (verified against the live reference page 2026-07-15):
 * `{ gatewayObjectId, bindDetails: [{ dataSourceName,
 * dataSourceObjectId }] }` — BOTH fields are REQUIRED for the report
 * variant (unlike the DATASET `Default.BindToGateway`, whose
 * `datasourceObjectIds` is optional). Each bind detail names an RDL
 * data source in the report and the gateway data source to bind it to.
 * Only the on-premises data gateway is supported.
 */

export interface ReportBindDetail {
  /** Name of the data source inside the paginated report. */
  datasourceName: string;
  /** Gateway data source id (uuid) to bind it to. */
  datasourceObjectId: string;
}

export interface ReportBindToGatewayInput {
  accessToken: string;
  groupId: string;
  reportId: string;
  gatewayObjectId: string;
  bindDetails: ReadonlyArray<ReportBindDetail>;
}

export async function reportBindToGateway(
  input: ReportBindToGatewayInput,
): Promise<void> {
  await powerbiFetch({
    accessToken: input.accessToken,
    method: "POST",
    path: `/groups/${encodeURIComponent(input.groupId)}/reports/${encodeURIComponent(
      input.reportId,
    )}/Default.BindToGateway`,
    body: {
      gatewayObjectId: input.gatewayObjectId,
      bindDetails: input.bindDetails.map((b) => ({
        dataSourceName: b.datasourceName,
        dataSourceObjectId: b.datasourceObjectId,
      })),
    },
    notFoundResource: `report ${input.reportId}`,
    operation: "report BindToGateway POST",
  });
}
