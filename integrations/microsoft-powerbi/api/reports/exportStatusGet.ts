import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI
 * `GET /v1.0/myorg/groups/{groupId}/reports/{reportId}/exports/{exportId}`
 * (Get Export To File Status In Group).
 *
 * Returns 200 when the job is done and 202 while it is in progress —
 * both are 2xx, so `powerbiFetch` passes them through and the caller
 * branches on `status` (`Undefined | NotStarted | Running | Succeeded |
 * Failed`). The recommended poll interval comes from the `Retry-After`
 * response header ("not always populated" per the docs) — surfaced as
 * `retryAfterSeconds` (null when absent/unparseable).
 *
 * On `Failed` the `Export` body may carry an error object; only a
 * sanitized code/message string is surfaced (never the raw body).
 */

export interface ExportStatusGetInput {
  accessToken: string;
  groupId: string;
  reportId: string;
  exportId: string;
}

export interface ExportStatusGetResult {
  /** Undefined | NotStarted | Running | Succeeded | Failed. */
  status: string;
  percentComplete: number | null;
  /** e.g. ".pdf" / ".pptx" — extension of the produced file. */
  resourceFileExtension: string | null;
  reportName: string | null;
  /** Parsed `Retry-After` header (seconds); null when absent. */
  retryAfterSeconds: number | null;
  /** Sanitized provider error detail when `status === "Failed"`. */
  errorDetail: string | null;
}

interface ExportStatusBody {
  status?: string;
  percentComplete?: number;
  resourceFileExtension?: string;
  reportName?: string;
  error?: { code?: string; message?: string };
}

export async function exportStatusGet(
  input: ExportStatusGetInput,
): Promise<ExportStatusGetResult> {
  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "GET",
    path: `/groups/${encodeURIComponent(input.groupId)}/reports/${encodeURIComponent(
      input.reportId,
    )}/exports/${encodeURIComponent(input.exportId)}`,
    notFoundResource: `export ${input.exportId}`,
    operation: "report export status GET",
  });

  const retryAfterRaw = res.headers.get("retry-after");
  let retryAfterSeconds: number | null = null;
  if (retryAfterRaw !== null) {
    const parsed = Number.parseInt(retryAfterRaw, 10);
    if (Number.isFinite(parsed) && parsed >= 0) retryAfterSeconds = parsed;
  }

  const body = (await res.json()) as ExportStatusBody;
  let errorDetail: string | null = null;
  if (body.error) {
    if (typeof body.error.message === "string" && body.error.message.length > 0)
      errorDetail = body.error.message;
    else if (typeof body.error.code === "string" && body.error.code.length > 0)
      errorDetail = body.error.code;
  }

  return {
    status: typeof body.status === "string" ? body.status : "Undefined",
    percentComplete:
      typeof body.percentComplete === "number" ? body.percentComplete : null,
    resourceFileExtension:
      typeof body.resourceFileExtension === "string"
        ? body.resourceFileExtension
        : null,
    reportName: typeof body.reportName === "string" ? body.reportName : null,
    retryAfterSeconds,
    errorDetail,
  };
}
