import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import type { ExcelTableRow } from "./types";

/**
 * Wrapper for Microsoft Graph
 * `GET /v1.0/me/drive/items/{workbookId}/workbook/tables/{tableName}/rows`.
 *
 * Used by:  `new_table_row` polling trigger — both activation
 *           (baseline snapshot) and each poll tick (current state for
 *           diff).
 *
 * Returns Graph's stable row resources. The `index` field is the
 * polling-trigger key; it stays pinned to the row across mid-table
 * insertions/deletions, distinct from worksheet position-keyed rows.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (workbook missing or table not found).
 *   - generic `Error` on other failures with Graph error message surfaced.
 */

export interface TableRowsListInput {
  accessToken: string;
  workbookId: string;
  tableName: string;
}

export async function tableRowsList(
  input: TableRowsListInput,
): Promise<ExcelTableRow[]> {
  const url =
    `${graphApiBase()}/v1.0/me/drive/items/${encodeURIComponent(
      input.workbookId,
    )}/workbook/tables/${encodeURIComponent(input.tableName)}/rows`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph workbook/tables/{name}/rows GET returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError(
      `table '${input.tableName}' on workbook ${input.workbookId}`,
      surfaceGraphError(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph workbook/tables/{name}/rows GET failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  const body = (await res.json()) as { value?: ExcelTableRow[] };
  return body.value ?? [];
}
