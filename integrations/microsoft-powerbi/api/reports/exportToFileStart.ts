import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI
 * `POST /v1.0/myorg/groups/{groupId}/reports/{reportId}/ExportTo`
 * (Export To File In Group) — the async export-job kick-off.
 *
 * The wrapper synthesizes the wire body from V2-shaped inputs:
 *   - `pageName` (Power BI reports) →
 *     `powerBIReportConfiguration: { pages: [{ pageName }] }` — sent
 *     ONLY when set (omitting it exports the whole report).
 *   - `parameterValues` (paginated reports) →
 *     `paginatedReportConfiguration: { parameterValues }` — sent ONLY
 *     when non-empty.
 * The two configurations are mutually exclusive by construction (each
 * export action passes exactly one kind).
 *
 * Success is HTTP 202 with an `Export` body whose `id` is the exportId
 * used for status polling + file retrieval. Requires the workspace to
 * be on Premium / Embedded / Fabric capacity (NOT PPU or shared) —
 * capacity rejections surface as sanitized provider errors.
 */

export interface ExportToFileStartInput {
  accessToken: string;
  groupId: string;
  reportId: string;
  /** Power BI `FileFormat` value, e.g. "PDF" | "PPTX" | "XLSX". */
  format: string;
  /** Power BI reports only — export just this page (wire page name). */
  pageName?: string;
  /** Paginated reports only — RDL parameter values. */
  parameterValues?: ReadonlyArray<{ name: string; value: string }>;
}

export interface ExportToFileStartResult {
  exportId: string;
}

interface ExportToFileStartBody {
  id?: string;
}

export async function exportToFileStart(
  input: ExportToFileStartInput,
): Promise<ExportToFileStartResult> {
  const body: Record<string, unknown> = { format: input.format };
  if (input.pageName !== undefined) {
    body.powerBIReportConfiguration = {
      pages: [{ pageName: input.pageName }],
    };
  }
  if (input.parameterValues !== undefined && input.parameterValues.length > 0) {
    body.paginatedReportConfiguration = {
      parameterValues: input.parameterValues.map((p) => ({
        name: p.name,
        value: p.value,
      })),
    };
  }

  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "POST",
    path: `/groups/${encodeURIComponent(input.groupId)}/reports/${encodeURIComponent(
      input.reportId,
    )}/ExportTo`,
    body,
    notFoundResource: `report ${input.reportId}`,
    operation: "report ExportTo POST",
  });

  const parsed = (await res.json()) as ExportToFileStartBody;
  if (typeof parsed.id !== "string" || parsed.id.length === 0) {
    throw new Error(
      "Power BI report ExportTo POST returned no export id — cannot poll the export job.",
    );
  }
  return { exportId: parsed.id };
}
