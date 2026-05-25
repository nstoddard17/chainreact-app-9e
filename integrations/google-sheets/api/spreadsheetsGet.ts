import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { sheetsApiBase } from "./_base";
import { NotFoundError } from "./errors";

/**
 * Wrapper for Google Sheets `spreadsheets.get` (metadata).
 *
 * Endpoint: GET {base}/v4/spreadsheets/{spreadsheetId}?fields=...
 * Used by:  get_sheet_metadata action AND the row_changed trigger's
 *           activate hook (to read sheet metadata + initial row count).
 *
 * `includeGridData` is forced false — we never want full cell payloads
 * in a metadata call. Use `valuesGet` for actual cell data.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401 (refreshAndRetry contract).
 *   - `NotFoundError` on HTTP 404 (spreadsheet id doesn't exist or no access).
 *   - generic `Error` on other 4xx/5xx with surfaced Google error.message.
 */
export interface SpreadsheetsGetInput {
  accessToken: string;
  spreadsheetId: string;
  /** Comma-separated `fields` mask. Defaults to a sensible metadata shape. */
  fields?: string;
}

export interface SheetProperties {
  sheetId?: number;
  title?: string;
  index?: number;
  sheetType?: string;
  gridProperties?: {
    rowCount?: number;
    columnCount?: number;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

export interface SpreadsheetResource {
  spreadsheetId: string;
  properties?: {
    title?: string;
    locale?: string;
    timeZone?: string;
    [k: string]: unknown;
  };
  sheets?: ReadonlyArray<{ properties?: SheetProperties; [k: string]: unknown }>;
  spreadsheetUrl?: string;
  [k: string]: unknown;
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

export async function spreadsheetsGet(
  input: SpreadsheetsGetInput,
): Promise<SpreadsheetResource> {
  const url = new URL(
    `${sheetsApiBase()}/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}`,
  );
  url.searchParams.set(
    "fields",
    input.fields ??
      "spreadsheetId,properties(title,locale,timeZone),sheets(properties(sheetId,title,index,sheetType,gridProperties))",
  );
  url.searchParams.set("includeGridData", "false");

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Google Sheets spreadsheets.get returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError(
      `spreadsheet ${input.spreadsheetId}`,
      surfaceErrorDetail(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Google Sheets spreadsheets.get failed: ${surfaceErrorDetail(text, res.status)}`,
    );
  }

  return (await res.json()) as SpreadsheetResource;
}
