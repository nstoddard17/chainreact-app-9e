import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

/**
 * Wrapper for Microsoft Graph
 * `DELETE /v1.0/me/drive/items/{workbookId}/workbook/worksheets('{name}')`.
 *
 * Used by:  `microsoft-excel:delete_worksheet` action — remove a
 *           worksheet from a workbook. Excel parity Commit 2.
 *
 * Graph returns HTTP 204 on success with no body. The handler treats
 * the absence of a thrown error as success.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (workbook or worksheet missing).
 *     Surfaces as a clear error rather than a silent no-op — matches
 *     the contract for the other Excel parity wrappers per Marcus's
 *     audit acceptance ("No silent no-op").
 *   - generic `Error` on other failures, surfacing Graph's error
 *     message (e.g. trying to delete the last visible worksheet
 *     yields HTTP 400 → generic Error).
 */

export interface WorksheetDeleteInput {
  accessToken: string;
  workbookId: string;
  worksheetName: string;
}

export async function worksheetDelete(
  input: WorksheetDeleteInput,
): Promise<void> {
  const url =
    `${graphApiBase()}/v1.0/me/drive/items/${encodeURIComponent(
      input.workbookId,
    )}/workbook/worksheets('${encodeURIComponent(input.worksheetName)}')`;

  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph workbook/worksheets('{name}') DELETE returned HTTP 401",
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
      `Microsoft Graph workbook/worksheets('{name}') DELETE failed: ${surfaceGraphError(text, res.status)}`,
    );
  }
}
