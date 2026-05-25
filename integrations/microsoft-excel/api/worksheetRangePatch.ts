import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import type { ExcelRange } from "./types";

/**
 * Wrapper for Microsoft Graph
 * `PATCH /v1.0/me/drive/items/{workbookId}/workbook/worksheets/{name}/range(address='...')`.
 *
 * Used by:  `microsoft_excel_action_add_row` action — write a row of
 *           values to a specific A1 range. The caller computes the
 *           target address (e.g. `A12:D12`) from a prior usedRange call
 *           and supplies the values aligned to those columns.
 *
 * Body shape is `{ values: [[v1, v2, ...]] }` — outer array = rows
 * (always length 1 for single-row append in Slice 15), inner array =
 * column values in the address's left-to-right order. Empty cells are
 * `null`.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (workbook or worksheet missing).
 *   - generic `Error` on other failures, surfacing Graph's error message
 *     (range out-of-bounds → HTTP 400 → generic Error).
 */

export interface WorksheetRangePatchInput {
  accessToken: string;
  workbookId: string;
  worksheetName: string;
  /** A1-style range relative to the worksheet, e.g. `"A12:D12"`. */
  address: string;
  /**
   * 2D values array. Outer = rows, inner = columns. Length(inner) MUST
   * match the column-span of `address` or Graph returns HTTP 400.
   */
  values: ReadonlyArray<ReadonlyArray<unknown>>;
}

export async function worksheetRangePatch(
  input: WorksheetRangePatchInput,
): Promise<ExcelRange> {
  const url =
    `${graphApiBase()}/v1.0/me/drive/items/${encodeURIComponent(
      input.workbookId,
    )}/workbook/worksheets('${encodeURIComponent(input.worksheetName)}')/range(address='${encodeURIComponent(input.address)}')`;

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: input.values }),
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph workbook/.../range PATCH returned HTTP 401",
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
      `Microsoft Graph workbook/.../range PATCH failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  return (await res.json()) as ExcelRange;
}
