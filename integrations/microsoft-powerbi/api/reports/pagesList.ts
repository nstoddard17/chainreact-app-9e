import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI
 * `GET /v1.0/myorg/groups/{groupId}/reports/{reportId}/pages`
 * (Get Pages In Group).
 *
 * Lists the pages of a Power BI report. `name` is the stable wire
 * identifier (e.g. "ReportSection…") that `ExportTo`'s
 * `powerBIReportConfiguration.pages[].pageName` expects; `displayName`
 * is the human label shown in the picker. Fixed-key mapping only.
 */

export interface PagesListInput {
  accessToken: string;
  groupId: string;
  reportId: string;
}

export interface PowerBiReportPage {
  /** Wire page name ("ReportSection…") — the ExportTo pageName value. */
  name: string;
  displayName: string | null;
  order: number | null;
}

interface PagesListBody {
  value?: Array<{
    name?: string;
    displayName?: string;
    order?: number;
  }>;
}

export async function pagesList(
  input: PagesListInput,
): Promise<PowerBiReportPage[]> {
  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "GET",
    path: `/groups/${encodeURIComponent(input.groupId)}/reports/${encodeURIComponent(
      input.reportId,
    )}/pages`,
    notFoundResource: `report ${input.reportId}`,
    operation: "report pages GET",
  });

  const body = (await res.json()) as PagesListBody;
  const rows = body.value ?? [];
  const pages: PowerBiReportPage[] = [];
  for (const row of rows) {
    if (typeof row.name !== "string" || row.name.length === 0) continue;
    pages.push({
      name: row.name,
      displayName:
        typeof row.displayName === "string" ? row.displayName : null,
      order: typeof row.order === "number" ? row.order : null,
    });
  }
  return pages;
}
