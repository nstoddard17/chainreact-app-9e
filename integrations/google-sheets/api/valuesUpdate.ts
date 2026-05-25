import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { sheetsApiBase } from "./_base";
import { NotFoundError } from "./errors";

/**
 * Wrapper for Google Sheets `spreadsheets.values.update`.
 *
 * Endpoint: PUT {base}/v4/spreadsheets/{id}/values/{range}
 *           ?valueInputOption=<RAW|USER_ENTERED>
 * Used by:  update_row action.
 *
 * Update overwrites the cells in `range` with the provided values. Unlike
 * append, there's no "find a table boundary" step — the caller passes the
 * exact target range (e.g. `Sheet1!A5:Z5` to overwrite row 5).
 *
 * `valueInputOption` is REQUIRED at the wrapper level (Q11 enforced by
 * the action schema; wrapper trusts the schema's choice).
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (missing spreadsheet) OR HTTP 400 with
 *     INVALID_ARGUMENT status (missing sheet tab / malformed range).
 *   - generic `Error` on other failures.
 */
export interface ValuesUpdateInput {
  accessToken: string;
  spreadsheetId: string;
  range: string;
  valueInputOption: "RAW" | "USER_ENTERED";
  values: ReadonlyArray<ReadonlyArray<unknown>>;
  includeValuesInResponse?: boolean;
  responseValueRenderOption?: "FORMATTED_VALUE" | "UNFORMATTED_VALUE" | "FORMULA";
}

export interface ValuesUpdateResult {
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

export async function valuesUpdate(
  input: ValuesUpdateInput,
): Promise<ValuesUpdateResult> {
  const url = new URL(
    `${sheetsApiBase()}/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}/values/${encodeURIComponent(input.range)}`,
  );
  url.searchParams.set("valueInputOption", input.valueInputOption);
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
    method: "PUT",
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
      "Google Sheets values.update returned HTTP 401",
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
      `Google Sheets values.update failed: ${surfaceErrorDetail(text, 400)}`,
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Google Sheets values.update failed: ${surfaceErrorDetail(text, res.status)}`,
    );
  }

  return (await res.json()) as ValuesUpdateResult;
}
