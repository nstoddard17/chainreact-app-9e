import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import type { ExcelRange } from "./types";

/**
 * Wrapper for Microsoft Graph
 * `GET /v1.0/me/drive/items/{workbookId}/workbook/worksheets/{name}/usedRange`.
 *
 * Used by:
 *   - `microsoft_excel_action_add_row` action — find the tail of the
 *     used range so it can append at row N+1.
 *   - `microsoft_excel_action_export_sheet` action — default fetch path
 *     when caller did not pass a custom range.
 *   - `new_row` polling trigger — diff baseline by hashing each row.
 *
 * The `valuesOnly` parameter maps to Graph's
 * `usedRange(valuesOnly=true)` boolean; when true, Graph drops
 * formatted-but-empty trailing rows that can otherwise inflate the
 * used-range envelope after deletions. Slice 15 defaults to `true` for
 * the polling-diff baseline (matches V1's behavior — see V1
 * `microsoft-excel.ts:825-829`).
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (workbook or worksheet missing).
 *   - generic `Error` on other failures, surfacing Graph's error message.
 */

export interface WorksheetUsedRangeInput {
  accessToken: string;
  workbookId: string;
  /** Worksheet name. The API uses the encoded form `('Name')`. */
  worksheetName: string;
  /** Default `true`. See module doc. */
  valuesOnly?: boolean;
}

export async function worksheetUsedRange(
  input: WorksheetUsedRangeInput,
): Promise<ExcelRange> {
  const valuesOnly = input.valuesOnly ?? true;
  const url =
    `${graphApiBase()}/v1.0/me/drive/items/${encodeURIComponent(
      input.workbookId,
    )}/workbook/worksheets('${encodeURIComponent(input.worksheetName)}')/usedRange(valuesOnly=${valuesOnly})`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph workbook/.../usedRange GET returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError(
      `worksheet '${input.worksheetName}' on workbook ${input.workbookId}`,
      surfaceGraphError(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph workbook/.../usedRange GET failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  return (await res.json()) as ExcelRange;
}
