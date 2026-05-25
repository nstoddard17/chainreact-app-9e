import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

/**
 * Wrapper for Microsoft Graph
 * `POST /v1.0/me/drive/items/{workbookId}/workbook/worksheets/{name}/range(address='...')/delete`.
 *
 * Used by:  `microsoft-excel:delete_row` action — remove a single row
 *           from a worksheet by 1-based row number. The caller supplies
 *           an A1 row-range (e.g. `"5:5"`) and Graph deletes that
 *           range, shifting remaining rows up.
 *
 * Body shape is `{ shift: "Up" | "Left" }`. The `delete_row` action
 * always shifts `"Up"` (rows below the deleted row move up by one).
 *
 * Graph returns HTTP 204 on success with no body.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (workbook or worksheet missing —
 *     same error contract as the other Excel wrappers).
 *   - generic `Error` on other failures, surfacing Graph's error
 *     message (out-of-range row → HTTP 400 → generic Error).
 */

export interface WorksheetRangeDeleteInput {
  accessToken: string;
  workbookId: string;
  worksheetName: string;
  /**
   * A1-style address to delete, relative to the worksheet. For a
   * single full row, the form is `"{N}:{N}"` (Excel's row-range
   * shorthand). The caller is responsible for the address format —
   * the wrapper does not validate, only URL-encodes.
   */
  address: string;
  /**
   * Direction to shift remaining cells/rows. Excel parity Commit 1
   * only uses `"Up"` (rows shift up to fill the deleted row's slot).
   */
  shift: "Up" | "Left";
}

export async function worksheetRangeDelete(
  input: WorksheetRangeDeleteInput,
): Promise<void> {
  const url =
    `${graphApiBase()}/v1.0/me/drive/items/${encodeURIComponent(
      input.workbookId,
    )}/workbook/worksheets('${encodeURIComponent(input.worksheetName)}')/range(address='${encodeURIComponent(input.address)}')/delete`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ shift: input.shift }),
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph workbook/.../range/delete returned HTTP 401",
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
      `Microsoft Graph workbook/.../range/delete failed: ${surfaceGraphError(text, res.status)}`,
    );
  }
}
