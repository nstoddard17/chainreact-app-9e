import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import type { ExcelTableColumn } from "./types";

/**
 * Wrapper for Microsoft Graph
 * `GET /v1.0/me/drive/items/{workbookId}/workbook/tables/{tableName}/columns`.
 *
 * Used by:  `microsoft_excel_action_add_table_row` action — fetch the
 *           ordered column list so caller can align supplied values to
 *           the table schema. Graph's row-append endpoint expects values
 *           in the table's column order, not by name.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (workbook missing or table not found).
 *   - generic `Error` on other failures.
 */

export interface TableColumnsListInput {
  accessToken: string;
  workbookId: string;
  /**
   * Excel table name. Caller passes Graph's canonical name (e.g.
   * `"Table1"`), not a worksheet name.
   */
  tableName: string;
}

export async function tableColumnsList(
  input: TableColumnsListInput,
): Promise<ExcelTableColumn[]> {
  const url =
    `${graphApiBase()}/v1.0/me/drive/items/${encodeURIComponent(
      input.workbookId,
    )}/workbook/tables/${encodeURIComponent(input.tableName)}/columns`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph workbook/tables/{name}/columns GET returned HTTP 401",
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
      `Microsoft Graph workbook/tables/{name}/columns GET failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  const body = (await res.json()) as { value?: ExcelTableColumn[] };
  return body.value ?? [];
}
