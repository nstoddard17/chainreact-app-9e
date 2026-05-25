import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import type { ExcelWorksheet } from "./types";

/**
 * Wrapper for Microsoft Graph
 * `GET /v1.0/me/drive/items/{workbookId}/workbook/worksheets`.
 *
 * Used by:  `microsoft_excel_action_get_worksheets` action,
 *           `microsoft_excel_action_create_worksheet` (precondition
 *           check / refresh after creation), and the polling triggers
 *           (precondition: confirm worksheet exists at activation).
 *
 * Returns the sorted list of worksheets in a workbook. Graph emits them
 * in their workbook-order via the `position` field; we surface that so
 * callers can render them without re-sorting.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (workbook missing or user lacks access).
 *   - generic `Error` on other failures with Graph error message surfaced.
 */

export interface WorksheetsListInput {
  accessToken: string;
  workbookId: string;
}

export async function worksheetsList(
  input: WorksheetsListInput,
): Promise<ExcelWorksheet[]> {
  const url = `${graphApiBase()}/v1.0/me/drive/items/${encodeURIComponent(
    input.workbookId,
  )}/workbook/worksheets`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph workbook/worksheets GET returned HTTP 401",
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
      `Microsoft Graph workbook/worksheets GET failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  const body = (await res.json()) as { value?: ExcelWorksheet[] };
  return body.value ?? [];
}
