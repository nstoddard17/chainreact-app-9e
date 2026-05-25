import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import type { ExcelWorksheet } from "./types";

/**
 * Wrapper for Microsoft Graph
 * `PATCH /v1.0/me/drive/items/{workbookId}/workbook/worksheets('{name}')`.
 *
 * Used by:  `microsoft-excel:rename_worksheet` action — change a
 *           worksheet's display name. Excel parity Commit 2.
 *
 * Body shape is `{ name: <newName> }`. Graph also allows `position`
 * and `visibility` patches at the same endpoint; the wrapper exposes
 * only `name` because that's the only field Commit 2's handler needs.
 * Other fields would expand the schema without a use case.
 *
 * Returns the updated worksheet resource (Graph returns the full
 * resource on success).
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (workbook or worksheet missing).
 *   - generic `Error` on other failures, surfacing Graph's error
 *     message. Duplicate target name yields HTTP 409 → generic Error.
 */

export interface WorksheetPatchInput {
  accessToken: string;
  workbookId: string;
  /** Current worksheet name (used in the URL to address the target). */
  worksheetName: string;
  /** New name. Excel max 31 chars; the wrapper does not validate — schema does. */
  name: string;
}

export async function worksheetPatch(
  input: WorksheetPatchInput,
): Promise<ExcelWorksheet> {
  const url =
    `${graphApiBase()}/v1.0/me/drive/items/${encodeURIComponent(
      input.workbookId,
    )}/workbook/worksheets('${encodeURIComponent(input.worksheetName)}')`;

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: input.name }),
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph workbook/worksheets('{name}') PATCH returned HTTP 401",
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
      `Microsoft Graph workbook/worksheets('{name}') PATCH failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  return (await res.json()) as ExcelWorksheet;
}
