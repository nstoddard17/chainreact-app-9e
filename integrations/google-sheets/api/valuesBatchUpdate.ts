import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { sheetsApiBase } from "./_base";
import { NotFoundError } from "./errors";

/**
 * Wrapper for Google Sheets `spreadsheets.values.batchUpdate`.
 *
 * Endpoint: POST {base}/v4/spreadsheets/{id}/values:batchUpdate
 * Used by:  batch_update action (Sheets 2.2 Commit 2).
 *
 * DISTINCT from `spreadsheets.batchUpdate`
 * (POST /v4/spreadsheets/{id}:batchUpdate — used by delete_row +
 * format_range for `deleteDimension` / `repeatCell` requests). The
 * `values:batchUpdate` endpoint is for multi-RANGE VALUE writes only;
 * it takes a body shape `{ valueInputOption, data: [{range, values}] }`
 * rather than the umbrella `requests[]` shape `spreadsheets.batchUpdate`
 * accepts. The two endpoints are not interchangeable.
 *
 * `valueInputOption` is REQUIRED at the wrapper level (Q11 — the
 * action schema enforces this; the wrapper trusts the schema's
 * decision and forwards it in the body, not the query string —
 * Sheets' `values:batchUpdate` reads it from the body, unlike
 * `values.update` / `values.append` which read it from the URL).
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401 (refreshAndRetry contract).
 *   - `NotFoundError` on HTTP 404 (missing spreadsheet) OR HTTP 400
 *     with `error.status === "INVALID_ARGUMENT"` (missing sheet tab
 *     inside a known spreadsheet OR malformed A1 range). Same
 *     NotFound mapping as the other values.* wrappers — handlers see
 *     one consistent path.
 *   - generic `Error` on other 4xx/5xx with surfaced Google
 *     `error.message`.
 */
export interface ValuesBatchUpdateInput {
  accessToken: string;
  spreadsheetId: string;
  valueInputOption: "RAW" | "USER_ENTERED";
  /** One entry per range. Each entry has a target A1 range
   * (`Sheet1!A1:B2`) and a 2D values matrix. */
  data: ReadonlyArray<{
    range: string;
    values: ReadonlyArray<ReadonlyArray<unknown>>;
  }>;
  includeValuesInResponse?: boolean;
  responseValueRenderOption?: "FORMATTED_VALUE" | "UNFORMATTED_VALUE" | "FORMULA";
}

export interface ValuesBatchUpdateResponseEntry {
  spreadsheetId?: string;
  updatedRange?: string;
  updatedRows?: number;
  updatedColumns?: number;
  updatedCells?: number;
  updatedData?: {
    range?: string;
    majorDimension?: string;
    values?: ReadonlyArray<ReadonlyArray<unknown>>;
  };
}

export interface ValuesBatchUpdateResult {
  spreadsheetId?: string;
  totalUpdatedRows?: number;
  totalUpdatedColumns?: number;
  totalUpdatedCells?: number;
  totalUpdatedSheets?: number;
  /** One reply entry per `data[]` entry, in input order. */
  responses?: ReadonlyArray<ValuesBatchUpdateResponseEntry>;
}

interface SheetsErrorPayload {
  error?: { code?: number; message?: string; status?: string };
}

function surfaceErrorDetail(text: string, status: number): string {
  let detail = `HTTP ${status}`;
  try {
    const parsed = JSON.parse(text) as SheetsErrorPayload;
    if (parsed?.error?.message) detail = parsed.error.message;
    else if (parsed?.error?.status) detail = parsed.error.status;
  } catch {
    // not JSON
  }
  return detail;
}

function is400InvalidArgument(text: string): boolean {
  try {
    const parsed = JSON.parse(text) as SheetsErrorPayload;
    return parsed?.error?.status === "INVALID_ARGUMENT";
  } catch {
    return false;
  }
}

export async function valuesBatchUpdate(
  input: ValuesBatchUpdateInput,
): Promise<ValuesBatchUpdateResult> {
  const url = `${sheetsApiBase()}/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}/values:batchUpdate`;

  const body: Record<string, unknown> = {
    valueInputOption: input.valueInputOption,
    data: input.data.map((d) => ({ range: d.range, values: d.values })),
  };
  if (input.includeValuesInResponse) {
    body.includeValuesInResponse = true;
    if (input.responseValueRenderOption) {
      body.responseValueRenderOption = input.responseValueRenderOption;
    }
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Google Sheets values.batchUpdate returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError(
      `spreadsheet ${input.spreadsheetId}`,
      surfaceErrorDetail(text, 404),
    );
  }
  if (res.status === 400) {
    const text = await res.text();
    if (is400InvalidArgument(text)) {
      throw new NotFoundError(
        `values.batchUpdate target on spreadsheet ${input.spreadsheetId}`,
        surfaceErrorDetail(text, 400),
      );
    }
    throw new Error(
      `Google Sheets values.batchUpdate failed: ${surfaceErrorDetail(text, 400)}`,
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Google Sheets values.batchUpdate failed: ${surfaceErrorDetail(text, res.status)}`,
    );
  }

  return (await res.json()) as ValuesBatchUpdateResult;
}
