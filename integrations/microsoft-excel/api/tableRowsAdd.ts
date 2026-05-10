import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

/**
 * Wrapper for Microsoft Graph
 * `POST /v1.0/me/drive/items/{workbookId}/workbook/tables/{tableName}/rows`.
 *
 * Used by:  `microsoft_excel_action_add_table_row` action — append one
 *           row to the bottom of an Excel table. Tables have stable
 *           row ids (assigned by Graph), making them the safer surface
 *           for change-tracking triggers than positional worksheet rows.
 *
 * Body shape: `{ values: [[v1, v2, ...]] }`. Outer array = rows
 * (Slice 15 appends a single row at a time), inner array = column
 * values aligned to the table's column order (caller obtains the order
 * via `tableColumnsList`).
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (workbook missing or table not found).
 *   - generic `Error` on other failures, surfacing Graph's error message.
 */

export interface TableRowsAddInput {
  accessToken: string;
  workbookId: string;
  tableName: string;
  /**
   * 2D values array. Outer = rows (length 1 for Slice 15), inner =
   * columns in the table's left-to-right order.
   */
  values: ReadonlyArray<ReadonlyArray<unknown>>;
}

export interface TableRowsAddResult {
  /** Graph-issued stable row index. */
  index: number;
  values: ReadonlyArray<ReadonlyArray<unknown>>;
}

export async function tableRowsAdd(
  input: TableRowsAddInput,
): Promise<TableRowsAddResult> {
  const url =
    `${graphApiBase()}/v1.0/me/drive/items/${encodeURIComponent(
      input.workbookId,
    )}/workbook/tables/${encodeURIComponent(input.tableName)}/rows`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: input.values }),
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph workbook/tables/{name}/rows POST returned HTTP 401",
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
      `Microsoft Graph workbook/tables/{name}/rows POST failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  const body = (await res.json()) as {
    index?: number;
    values?: ReadonlyArray<ReadonlyArray<unknown>>;
  };
  return {
    index: typeof body.index === "number" ? body.index : -1,
    values: body.values ?? input.values,
  };
}
