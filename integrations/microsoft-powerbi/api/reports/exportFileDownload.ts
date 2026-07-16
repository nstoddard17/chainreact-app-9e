import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI
 * `GET /v1.0/myorg/groups/{groupId}/reports/{reportId}/exports/{exportId}/file`
 * (Get File Of Export To File In Group) — binary retrieval of a
 * SUCCEEDED export job's file.
 *
 * The retrieval URL is valid 24 hours after job completion; ChainReact
 * downloads immediately inside the same run and stages the bytes to V2
 * storage (the action returns a FileRef — bytes never enter workflow
 * variables). `powerbiFetch` handles status mapping; the body is read
 * as raw bytes here.
 */

export interface ExportFileDownloadInput {
  accessToken: string;
  groupId: string;
  reportId: string;
  exportId: string;
}

export interface ExportFileDownloadResult {
  bytes: Uint8Array;
  /** Content-Type Power BI responded with. */
  contentType: string;
}

export async function exportFileDownload(
  input: ExportFileDownloadInput,
): Promise<ExportFileDownloadResult> {
  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "GET",
    path: `/groups/${encodeURIComponent(input.groupId)}/reports/${encodeURIComponent(
      input.reportId,
    )}/exports/${encodeURIComponent(input.exportId)}/file`,
    notFoundResource: `export ${input.exportId}`,
    operation: "report export file GET",
  });

  const buf = await res.arrayBuffer();
  return {
    bytes: new Uint8Array(buf),
    contentType:
      res.headers.get("content-type") ?? "application/octet-stream",
  };
}
