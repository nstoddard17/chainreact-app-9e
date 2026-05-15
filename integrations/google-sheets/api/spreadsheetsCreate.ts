import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { sheetsApiBase } from "./_base";
import { NotFoundError } from "./errors";

/**
 * Wrapper for Google Sheets `spreadsheets.create`.
 *
 * Endpoint: POST {base}/v4/spreadsheets
 * Used by:  create_spreadsheet action (Sheets 2.1 Commit 3).
 *
 * Unlike the other Sheets wrappers, `spreadsheets.create` does NOT take
 * a spreadsheetId in the URL — Google generates one and returns it in
 * the response. The endpoint is therefore at the collection root.
 *
 * Body shape is the typed-but-narrow subset V2 supports for Batch 1:
 *   - `properties.title`   — required (the spreadsheet's display name).
 *   - `sheets[]`           — optional. When omitted, Google creates the
 *                            default "Sheet1". When provided, each entry
 *                            is `{ properties: { title } }` only — no
 *                            sheetId/index/gridProperties passthrough.
 *
 * Raw API body passthrough is deliberately NOT supported — V1's chrome
 * (locale/timeZone overrides, gridProperties, template chrome, CSV
 * prefill, description-as-A1-note workaround, folder move via Drive)
 * is all audit-skipped (GS-R10). Workflows that need post-create writes
 * compose `create_spreadsheet` → `update_row` / `append_row`.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401 (refreshAndRetry contract).
 *   - `NotFoundError` on HTTP 404 (rare for a collection POST — Google
 *     uses 404 if the user lacks Drive scope, which presents as
 *     no-such-resource). Mirrors other Sheets wrappers' shape so
 *     handlers don't fork their error handling.
 *   - generic `Error` on other 4xx/5xx with surfaced Google
 *     `error.message`.
 */
export interface SpreadsheetsCreateInput {
  accessToken: string;
  title: string;
  /** Optional initial sheet titles. When omitted, Google creates the
   * default "Sheet1". When provided, each name becomes the title of a
   * separate sheet/tab. */
  initialSheetTitles?: ReadonlyArray<string>;
}

export interface SpreadsheetsCreateResult {
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  properties?: {
    title?: string;
    locale?: string;
    timeZone?: string;
    [k: string]: unknown;
  };
  sheets?: ReadonlyArray<{
    properties?: {
      sheetId?: number;
      title?: string;
      index?: number;
      sheetType?: string;
      [k: string]: unknown;
    };
    [k: string]: unknown;
  }>;
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

export async function spreadsheetsCreate(
  input: SpreadsheetsCreateInput,
): Promise<SpreadsheetsCreateResult> {
  const url = `${sheetsApiBase()}/v4/spreadsheets`;

  const body: Record<string, unknown> = {
    properties: { title: input.title },
  };
  if (input.initialSheetTitles && input.initialSheetTitles.length > 0) {
    body.sheets = input.initialSheetTitles.map((title) => ({
      properties: { title },
    }));
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
      "Google Sheets spreadsheets.create returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError(
      "spreadsheets collection",
      surfaceErrorDetail(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Google Sheets spreadsheets.create failed: ${surfaceErrorDetail(text, res.status)}`,
    );
  }

  return (await res.json()) as SpreadsheetsCreateResult;
}
