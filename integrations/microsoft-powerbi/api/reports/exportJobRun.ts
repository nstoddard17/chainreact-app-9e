import { exportToFileStart } from "./exportToFileStart";
import { exportStatusGet } from "./exportStatusGet";
import { exportFileDownload } from "./exportFileDownload";

/**
 * Poll-to-completion orchestrator for the Power BI export-to-file job
 * (`ExportTo` → status polls → `/file` download). Composes the three
 * endpoint wrappers — it is NOT an endpoint wrapper itself.
 *
 * Poll cadence honors the `Retry-After` header when Power BI sends it,
 * falling back to 2s between polls. The total in-run poll budget is
 * `EXPORT_POLL_BUDGET_MS` (40s) — the run execution window is 60s, so
 * the budget deliberately leaves headroom for the kick-off request,
 * the file download, and storage staging. Budget exhaustion throws a
 * classifiable, actionable error (export fewer pages / smaller report).
 *
 * `sleep` / `now` are injectable so unit tests run instantly; defaults
 * are a real setTimeout promise and `Date.now`.
 */

export const EXPORT_POLL_BUDGET_MS = 40_000;

/** Fallback delay between polls when Power BI omits `Retry-After`. */
const DEFAULT_POLL_DELAY_MS = 2_000;

export interface ExportJobRunInput {
  accessToken: string;
  groupId: string;
  reportId: string;
  /** Power BI `FileFormat` value, e.g. "PDF" | "PPTX" | "XLSX". */
  format: string;
  /** Power BI reports only — export just this page (wire page name). */
  pageName?: string;
  /** Paginated reports only — RDL parameter values. */
  parameterValues?: ReadonlyArray<{ name: string; value: string }>;
  /** Test seam — defaults to a real setTimeout promise. */
  sleep?: (ms: number) => Promise<void>;
  /** Test seam — defaults to Date.now. */
  now?: () => number;
}

export interface ExportJobRunResult {
  exportId: string;
  bytes: Uint8Array;
  contentType: string;
  /** e.g. ".pdf" — from the final status poll; null when omitted. */
  resourceFileExtension: string | null;
  reportName: string | null;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function exportJobRun(
  input: ExportJobRunInput,
): Promise<ExportJobRunResult> {
  const sleep = input.sleep ?? defaultSleep;
  const now = input.now ?? Date.now;

  const { exportId } = await exportToFileStart({
    accessToken: input.accessToken,
    groupId: input.groupId,
    reportId: input.reportId,
    format: input.format,
    ...(input.pageName !== undefined && { pageName: input.pageName }),
    ...(input.parameterValues !== undefined && {
      parameterValues: input.parameterValues,
    }),
  });

  const startedAt = now();
  for (;;) {
    const status = await exportStatusGet({
      accessToken: input.accessToken,
      groupId: input.groupId,
      reportId: input.reportId,
      exportId,
    });

    if (status.status === "Succeeded") {
      const file = await exportFileDownload({
        accessToken: input.accessToken,
        groupId: input.groupId,
        reportId: input.reportId,
        exportId,
      });
      return {
        exportId,
        bytes: file.bytes,
        contentType: file.contentType,
        resourceFileExtension: status.resourceFileExtension,
        reportName: status.reportName,
      };
    }

    if (status.status === "Failed") {
      throw new Error(
        `Power BI export ${exportId} failed: ${status.errorDetail ?? "the provider reported no error detail"}`,
      );
    }

    const waitMs =
      status.retryAfterSeconds !== null
        ? status.retryAfterSeconds * 1000
        : DEFAULT_POLL_DELAY_MS;
    if (now() - startedAt + waitMs >= EXPORT_POLL_BUDGET_MS) {
      throw new Error(
        `Power BI export ${exportId} is still running after 40s — export fewer pages or a smaller report, then retry.`,
      );
    }
    await sleep(waitMs);
  }
}
