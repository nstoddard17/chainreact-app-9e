import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import type { ExcelTable } from "./types";

/**
 * Wrapper for Microsoft Graph
 * `GET /v1.0/me/drive/items/{workbookId}/workbook/tables`.
 *
 * Added in Slice 4.EXCEL-META-2 to back the `microsoft-excel:tables`
 * options resolver — the `tableName` picker on `add_table_row` and the
 * `new_table_row` / `updated_table_row` triggers.
 *
 * Mirrors `worksheetsList`: a bare-array return (Graph emits `value[]`).
 * A workbook's table list is small, so a single page is sufficient and
 * the resolver advertises `hasMore: false`. Reuses the shared Graph
 * base + error surface; no new transport/error handling.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401 (→ `refreshAndRetry` refresh+retry).
 *   - `NotFoundError` on HTTP 404 (workbook missing or user lacks access).
 *   - generic `Error` on other failures with the Graph error message surfaced.
 */

export interface TablesListInput {
  accessToken: string;
  workbookId: string;
}

export async function tablesList(
  input: TablesListInput,
): Promise<ExcelTable[]> {
  const url = `${graphApiBase()}/v1.0/me/drive/items/${encodeURIComponent(
    input.workbookId,
  )}/workbook/tables`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph workbook/tables GET returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError(
      `workbook ${input.workbookId}`,
      surfaceGraphError(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph workbook/tables GET failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  const body = (await res.json()) as { value?: ExcelTable[] };
  return body.value ?? [];
}
