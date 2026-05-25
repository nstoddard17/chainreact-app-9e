import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import type { ExcelWorksheet } from "./types";

/**
 * Wrapper for Microsoft Graph
 * `POST /v1.0/me/drive/items/{workbookId}/workbook/worksheets/add`.
 *
 * Used by:  `microsoft_excel_action_create_worksheet` action.
 *
 * Adds a new worksheet to the workbook. When `name` is omitted Graph
 * generates a default name (e.g. "Sheet2"); Slice 15 always passes a
 * name to make the operation deterministic and produce predictable
 * downstream variable references.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (workbook missing).
 *   - generic `Error` on other failures, surfacing Graph's error message
 *     (a duplicate worksheet name yields HTTP 409 → generic Error).
 */

export interface WorksheetsAddInput {
  accessToken: string;
  workbookId: string;
  /** Name for the new worksheet. Required by Slice 15. */
  name: string;
}

export async function worksheetsAdd(
  input: WorksheetsAddInput,
): Promise<ExcelWorksheet> {
  const url = `${graphApiBase()}/v1.0/me/drive/items/${encodeURIComponent(
    input.workbookId,
  )}/workbook/worksheets/add`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: input.name }),
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph workbook/worksheets/add POST returned HTTP 401",
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
      `Microsoft Graph workbook/worksheets/add POST failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  return (await res.json()) as ExcelWorksheet;
}
