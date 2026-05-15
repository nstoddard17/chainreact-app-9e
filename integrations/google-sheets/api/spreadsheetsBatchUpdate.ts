import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { sheetsApiBase } from "./_base";
import { NotFoundError } from "./errors";

/**
 * Wrapper for Google Sheets `spreadsheets.batchUpdate`.
 *
 * Endpoint: POST {base}/v4/spreadsheets/{spreadsheetId}:batchUpdate
 * Used by:  delete_row action (Sheets 2.1 Commit 2 — `deleteDimension`
 *           request). Future: format_range (`repeatCell` request) and
 *           insertDimension/copyPaste/etc.
 *
 * The Sheets `batchUpdate` endpoint is the umbrella write API — every
 * non-`values.*` mutation (delete rows, format cells, add sheets, etc.)
 * goes through one POST with a `requests: [...]` body. This wrapper is
 * deliberately untyped on the request shape (`Record<string, unknown>`)
 * because the request union is enormous; callers in handlers build
 * typed requests themselves and the wrapper just transports them.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401 (refreshAndRetry contract).
 *   - `NotFoundError` on HTTP 404 (spreadsheet id doesn't exist) OR
 *     HTTP 400 with `error.status === "INVALID_ARGUMENT"` (missing
 *     sheet/range inside a known spreadsheet). Same NotFound mapping
 *     as the values.* wrappers — handlers see one consistent path.
 *   - generic `Error` on other 4xx/5xx with surfaced Google
 *     `error.message`.
 */
export interface SpreadsheetsBatchUpdateInput {
  accessToken: string;
  spreadsheetId: string;
  /** One or more batchUpdate requests; each request is a single-key object
   * keyed by the request type (e.g. `{deleteDimension: {...}}`,
   * `{repeatCell: {...}}`). */
  requests: ReadonlyArray<Record<string, unknown>>;
  /** Optional response include flag — `false` (default) keeps payloads small. */
  includeSpreadsheetInResponse?: boolean;
}

export interface SpreadsheetsBatchUpdateResult {
  spreadsheetId?: string;
  /** One reply entry per request; shape varies per request type. */
  replies?: ReadonlyArray<Record<string, unknown>>;
  /** Optionally populated when `includeSpreadsheetInResponse: true`. */
  updatedSpreadsheet?: Record<string, unknown>;
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

export async function spreadsheetsBatchUpdate(
  input: SpreadsheetsBatchUpdateInput,
): Promise<SpreadsheetsBatchUpdateResult> {
  const url = new URL(
    `${sheetsApiBase()}/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}:batchUpdate`,
  );

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: input.requests,
      includeSpreadsheetInResponse:
        input.includeSpreadsheetInResponse ?? false,
    }),
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Google Sheets spreadsheets.batchUpdate returned HTTP 401",
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
        `batchUpdate target on spreadsheet ${input.spreadsheetId}`,
        surfaceErrorDetail(text, 400),
      );
    }
    throw new Error(
      `Google Sheets spreadsheets.batchUpdate failed: ${surfaceErrorDetail(text, 400)}`,
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Google Sheets spreadsheets.batchUpdate failed: ${surfaceErrorDetail(text, res.status)}`,
    );
  }

  return (await res.json()) as SpreadsheetsBatchUpdateResult;
}
