import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI `GET /v1.0/myorg/groups/{groupId}/reports`
 * (Get Reports In Group).
 *
 * Lists the reports in a workspace — both Power BI reports
 * (`reportType: "PowerBIReport"`) and paginated / RDL reports
 * (`reportType: "PaginatedReport"`). The endpoint has no server-side
 * paging params; list sizes are workspace-bounded. Fixed-key mapping
 * only (never spread the raw rows).
 */

export interface ReportsListInput {
  accessToken: string;
  groupId: string;
}

export interface PowerBiReportSummary {
  id: string;
  name: string;
  reportType: string | null;
  datasetId: string | null;
}

interface ReportsListBody {
  value?: Array<{
    id?: string;
    name?: string;
    reportType?: string;
    datasetId?: string;
  }>;
}

export async function reportsList(
  input: ReportsListInput,
): Promise<PowerBiReportSummary[]> {
  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "GET",
    path: `/groups/${encodeURIComponent(input.groupId)}/reports`,
    notFoundResource: `workspace ${input.groupId}`,
    operation: "reports GET",
  });

  const body = (await res.json()) as ReportsListBody;
  const rows = body.value ?? [];
  const reports: PowerBiReportSummary[] = [];
  for (const row of rows) {
    if (typeof row.id !== "string" || typeof row.name !== "string") continue;
    reports.push({
      id: row.id,
      name: row.name,
      reportType: typeof row.reportType === "string" ? row.reportType : null,
      datasetId: typeof row.datasetId === "string" ? row.datasetId : null,
    });
  }
  return reports;
}
