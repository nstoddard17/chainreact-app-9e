import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI
 * `GET /v1.0/myorg/groups/{groupId}/reports/{reportId}/Export`
 * (Export Report In Group) — synchronous .pbix (or .rdl for paginated
 * reports) definition download. No job/polling — the response IS the
 * file stream (`application/zip` / `application/octet-stream`).
 *
 * Subject to the same limitations as downloading a .pbix from the
 * service (e.g. models with incremental refresh and very large models
 * fail); exporting a report with a Power BI service live connection
 * after Rebind is not supported. Failures surface as sanitized
 * provider errors.
 */

export interface ReportExportDownloadInput {
  accessToken: string;
  groupId: string;
  reportId: string;
}

export interface ReportExportDownloadResult {
  bytes: Uint8Array;
  contentType: string;
}

export async function reportExportDownload(
  input: ReportExportDownloadInput,
): Promise<ReportExportDownloadResult> {
  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "GET",
    path: `/groups/${encodeURIComponent(input.groupId)}/reports/${encodeURIComponent(
      input.reportId,
    )}/Export`,
    notFoundResource: `report ${input.reportId}`,
    operation: "report Export GET",
  });

  const buf = await res.arrayBuffer();
  return {
    bytes: new Uint8Array(buf),
    contentType: res.headers.get("content-type") ?? "application/zip",
  };
}
