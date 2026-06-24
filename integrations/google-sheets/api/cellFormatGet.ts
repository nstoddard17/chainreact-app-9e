import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { sheetsApiBase } from "./_base";
import { NotFoundError } from "./errors";

/**
 * Wrapper for Google Sheets `spreadsheets.get` restricted to a SINGLE cell's
 * user-entered FORMAT — the bounded read-back behind the `format_range` write-smoke
 * verification (no user-facing action reads cell format; `valuesGet` returns values
 * only, not formatting).
 *
 * Endpoint: GET {base}/v4/spreadsheets/{id}?ranges={range}&includeGridData=true
 *           &fields=sheets(data(rowData(values(userEnteredFormat(
 *                     textFormat(bold,italic),horizontalAlignment)))))
 *
 * SAFETY — the `fields` mask is the boundary. It requests ONLY the three
 * `userEnteredFormat` sub-fields below for the ONE cell named in `range`. It does
 * NOT request `effectiveValue` / `formattedValue` / `userEnteredValue` / notes /
 * any other sheet content, so no cell DATA (potential PII) can ever come back — the
 * response carries only format booleans + an alignment enum. `ranges` bounds it to
 * the single smoke cell; `includeGridData=true` is required for per-cell format but
 * the mask keeps the payload tiny.
 *
 * Returns a SANITIZED scalar shape — `bold` / `italic` (boolean | null) and
 * `horizontalAlignment` (the LEFT/CENTER/RIGHT enum | null). An absent format field
 * (a fresh, unformatted cell) is `null`; an unexpected alignment string is coerced
 * to `null` so no arbitrary provider string leaks through.
 *
 * Throws (refreshAndRetry contract): `Unauthorized401Error` on 401, `NotFoundError`
 * on 404, generic `Error` on other non-2xx.
 */
export interface CellFormatGetInput {
  accessToken: string;
  spreadsheetId: string;
  /** A1 range WITH a sheet prefix naming a single cell, e.g. `Data!A1`. */
  range: string;
}

export interface CellUserEnteredFormat {
  /** `userEnteredFormat.textFormat.bold`, or null when unset. */
  bold: boolean | null;
  /** `userEnteredFormat.textFormat.italic`, or null when unset. */
  italic: boolean | null;
  /** `userEnteredFormat.horizontalAlignment`, sanitized to the enum or null. */
  horizontalAlignment: "LEFT" | "CENTER" | "RIGHT" | null;
}

const FIELDS_MASK =
  "sheets(data(rowData(values(userEnteredFormat(textFormat(bold,italic),horizontalAlignment)))))";

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

interface GridCellFormat {
  userEnteredFormat?: {
    textFormat?: { bold?: boolean; italic?: boolean };
    horizontalAlignment?: string;
  };
}
interface GridReadResponse {
  sheets?: ReadonlyArray<{
    data?: ReadonlyArray<{
      rowData?: ReadonlyArray<{ values?: ReadonlyArray<GridCellFormat> }>;
    }>;
  }>;
}

function sanitizeAlignment(v: unknown): "LEFT" | "CENTER" | "RIGHT" | null {
  return v === "LEFT" || v === "CENTER" || v === "RIGHT" ? v : null;
}

export async function cellFormatGet(
  input: CellFormatGetInput,
): Promise<CellUserEnteredFormat> {
  const url = new URL(
    `${sheetsApiBase()}/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}`,
  );
  url.searchParams.set("ranges", input.range);
  url.searchParams.set("includeGridData", "true");
  url.searchParams.set("fields", FIELDS_MASK);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error("Google Sheets spreadsheets.get (cell format) returned HTTP 401");
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError(`spreadsheet ${input.spreadsheetId}`, surfaceErrorDetail(text, 404));
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Google Sheets spreadsheets.get (cell format) failed: ${surfaceErrorDetail(text, res.status)}`,
    );
  }

  const body = (await res.json()) as GridReadResponse;
  const cell = body.sheets?.[0]?.data?.[0]?.rowData?.[0]?.values?.[0]?.userEnteredFormat;
  return {
    bold: typeof cell?.textFormat?.bold === "boolean" ? cell.textFormat.bold : null,
    italic: typeof cell?.textFormat?.italic === "boolean" ? cell.textFormat.italic : null,
    horizontalAlignment: sanitizeAlignment(cell?.horizontalAlignment),
  };
}
