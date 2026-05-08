import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { sheetsApiBase } from "./_base";
import { NotFoundError } from "./errors";

/**
 * Wrapper for Google Sheets `spreadsheets.values.clear`.
 *
 * Endpoint: POST {base}/v4/spreadsheets/{id}/values/{range}:clear
 * Body:     `{}` (no body fields supported by Google).
 * Used by:  clear_range action.
 *
 * Clears cell *values* in the range. Formatting, data validation, and
 * other cell properties are preserved (Google's documented behavior).
 * To remove a row entirely, a future `delete_row` action would call
 * `spreadsheets.batchUpdate` with a DeleteDimensionRequest — out of scope
 * for Slice 5 Batch 1.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (missing spreadsheet) OR HTTP 400 with
 *     INVALID_ARGUMENT status (missing sheet tab).
 *   - generic `Error` on other failures.
 */
export interface ValuesClearInput {
  accessToken: string;
  spreadsheetId: string;
  range: string;
}

export interface ValuesClearResult {
  spreadsheetId?: string;
  clearedRange?: string;
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

export async function valuesClear(
  input: ValuesClearInput,
): Promise<ValuesClearResult> {
  const url = `${sheetsApiBase()}/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}/values/${encodeURIComponent(input.range)}:clear`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Google Sheets values.clear returned HTTP 401",
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
        `range '${input.range}' on spreadsheet ${input.spreadsheetId}`,
        surfaceErrorDetail(text, 400),
      );
    }
    throw new Error(
      `Google Sheets values.clear failed: ${surfaceErrorDetail(text, 400)}`,
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Google Sheets values.clear failed: ${surfaceErrorDetail(text, res.status)}`,
    );
  }

  return (await res.json()) as ValuesClearResult;
}
