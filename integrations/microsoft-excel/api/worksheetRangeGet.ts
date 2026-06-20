import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import type { ExcelRange } from "./types";

/**
 * Wrapper for Microsoft Graph
 * `GET /v1.0/me/drive/items/{workbookId}/workbook/worksheets('{name}')/range(address='{address}')`.
 *
 * Reads a caller-specified A1 range on a worksheet (distinct from
 * `worksheetUsedRange`, which reads the auto-detected used range, and from
 * the `export_sheet` action, which reads the whole used range). Added for
 * the `read_range` action (Slice 4.EXCEL-READ-2).
 *
 * The `address` is the worksheet-local A1 rectangle (e.g. `"A1:D10"`) — the
 * worksheet is already pinned by the path, so no sheet-qualified prefix is
 * needed. Callers validate the address shape (bounded rectangle) before
 * reaching this wrapper.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401 (refreshAndRetry refreshes + retries).
 *   - `NotFoundError` on HTTP 404 (workbook or worksheet missing).
 *   - generic `Error` on other failures, surfacing Graph's error message.
 */
export interface WorksheetRangeGetInput {
  accessToken: string;
  workbookId: string;
  /** Worksheet name. The API uses the encoded form `('Name')`. */
  worksheetName: string;
  /** Worksheet-local A1 range address, e.g. `"A1:D10"`. */
  address: string;
}

export async function worksheetRangeGet(
  input: WorksheetRangeGetInput,
): Promise<ExcelRange> {
  const url =
    `${graphApiBase()}/v1.0/me/drive/items/${encodeURIComponent(
      input.workbookId,
    )}/workbook/worksheets('${encodeURIComponent(
      input.worksheetName,
    )}')/range(address='${encodeURIComponent(input.address)}')`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph workbook/.../range GET returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError(
      `worksheet '${input.worksheetName}' range '${input.address}' on workbook ${input.workbookId}`,
      surfaceGraphError(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph workbook/.../range GET failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  return (await res.json()) as ExcelRange;
}
