import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { sheetsApiBase } from "./_base";
import { NotFoundError } from "./errors";

/**
 * Wrapper for Google Sheets `spreadsheets.values.append`.
 *
 * Endpoint: POST {base}/v4/spreadsheets/{id}/values/{range}:append
 *           ?valueInputOption=<RAW|USER_ENTERED>
 *           &insertDataOption=<INSERT_ROWS|OVERWRITE>
 * Used by:  append_row action.
 *
 * Sheets' append semantics: the range is searched for a "table" boundary
 * starting at the given cell; new rows are appended below the bottom of
 * the detected table. Pass a column-letter range (e.g. `Sheet1!A:A`) to
 * have Google detect the table from column A; pass a sheet-only range
 * (e.g. `Sheet1`) to append after the last row of the entire sheet.
 *
 * `valueInputOption` is REQUIRED at the wrapper level (Q11 — the action
 * schema enforces this; the wrapper trusts the schema and forwards the
 * decision verbatim). RAW pastes literal strings, USER_ENTERED parses
 * them like a user typing into the cell (formulas, dates, numbers).
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (missing spreadsheet) OR HTTP 400 with
 *     INVALID_ARGUMENT status (missing sheet tab).
 *   - generic `Error` on other failures.
 */
export interface ValuesAppendInput {
  accessToken: string;
  spreadsheetId: string;
  range: string;
  valueInputOption: "RAW" | "USER_ENTERED";
  /** Defaults to "INSERT_ROWS" — pushes existing rows down rather than overwriting. */
  insertDataOption?: "INSERT_ROWS" | "OVERWRITE";
  /** Each inner array is a row's values. Pass [[...]] for a single row. */
  values: ReadonlyArray<ReadonlyArray<unknown>>;
  /** When true, the response includes the appended values in updates.updatedData. */
  includeValuesInResponse?: boolean;
  /** Defaults to "FORMATTED_VALUE". Only honored when includeValuesInResponse is true. */
  responseValueRenderOption?: "FORMATTED_VALUE" | "UNFORMATTED_VALUE" | "FORMULA";
}

export interface ValuesAppendResult {
  spreadsheetId?: string;
  /** Range Google searched to find the table to append below. */
  tableRange?: string;
  updates?: {
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
  };
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

export async function valuesAppend(
  input: ValuesAppendInput,
): Promise<ValuesAppendResult> {
  const url = new URL(
    `${sheetsApiBase()}/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}/values/${encodeURIComponent(input.range)}:append`,
  );
  url.searchParams.set("valueInputOption", input.valueInputOption);
  url.searchParams.set(
    "insertDataOption",
    input.insertDataOption ?? "INSERT_ROWS",
  );
  if (input.includeValuesInResponse) {
    url.searchParams.set("includeValuesInResponse", "true");
    if (input.responseValueRenderOption) {
      url.searchParams.set(
        "responseValueRenderOption",
        input.responseValueRenderOption,
      );
    }
  }

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      range: input.range,
      majorDimension: "ROWS",
      values: input.values,
    }),
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Google Sheets values.append returned HTTP 401",
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
      `Google Sheets values.append failed: ${surfaceErrorDetail(text, 400)}`,
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Google Sheets values.append failed: ${surfaceErrorDetail(text, res.status)}`,
    );
  }

  return (await res.json()) as ValuesAppendResult;
}
