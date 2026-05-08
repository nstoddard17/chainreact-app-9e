import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { sheetsApiBase } from "./_base";
import { NotFoundError } from "./errors";

/**
 * Wrapper for Google Sheets `spreadsheets.values.get`.
 *
 * Endpoint: GET {base}/v4/spreadsheets/{id}/values/{range}?majorDimension=ROWS
 * Used by:  read_rows action AND the row_changed trigger's pull hook.
 *
 * Range syntax (Google A1 notation):
 *   - `Sheet1!A:Z`         — every row in columns A through Z.
 *   - `Sheet1!A1:Z100`     — bounded rectangle.
 *   - `Sheet1`             — entire sheet.
 *
 * Notes on Sheets' 400 vs 404 semantics: Google returns 404 only when
 * the SPREADSHEET id doesn't exist. A missing SHEET tab inside a known
 * spreadsheet returns 400 with `error.status === "INVALID_ARGUMENT"`.
 * We surface BOTH as `NotFoundError` so handlers see one consistent
 * "resource not found" path.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 OR HTTP 400 with INVALID_ARGUMENT
 *     status (missing sheet tab).
 *   - generic `Error` on other failures.
 */
export interface ValuesGetInput {
  accessToken: string;
  spreadsheetId: string;
  range: string;
  /** "ROWS" or "COLUMNS". Defaults to "ROWS" — what 99% of consumers want. */
  majorDimension?: "ROWS" | "COLUMNS";
  /**
   * "FORMATTED_VALUE" | "UNFORMATTED_VALUE" | "FORMULA".
   * Defaults to "FORMATTED_VALUE" (matches Google's default).
   */
  valueRenderOption?: "FORMATTED_VALUE" | "UNFORMATTED_VALUE" | "FORMULA";
}

export interface ValuesGetResult {
  range?: string;
  majorDimension?: string;
  /** Each entry is a row (or column) of values. Cells may be string or number. */
  values?: ReadonlyArray<ReadonlyArray<unknown>>;
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

export async function valuesGet(
  input: ValuesGetInput,
): Promise<ValuesGetResult> {
  const url = new URL(
    `${sheetsApiBase()}/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}/values/${encodeURIComponent(input.range)}`,
  );
  url.searchParams.set("majorDimension", input.majorDimension ?? "ROWS");
  if (input.valueRenderOption) {
    url.searchParams.set("valueRenderOption", input.valueRenderOption);
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Google Sheets values.get returned HTTP 401",
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
      // Missing sheet tab inside a known spreadsheet — surface as NotFound.
      throw new NotFoundError(
        `range '${input.range}' on spreadsheet ${input.spreadsheetId}`,
        surfaceErrorDetail(text, 400),
      );
    }
    throw new Error(
      `Google Sheets values.get failed: ${surfaceErrorDetail(text, 400)}`,
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Google Sheets values.get failed: ${surfaceErrorDetail(text, res.status)}`,
    );
  }

  return (await res.json()) as ValuesGetResult;
}
