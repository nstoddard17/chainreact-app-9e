import {
  IntegrationActionRequiredError,
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionItem,
  type OptionsResolver,
} from "@/services/options/types";
import { NotFoundError } from "../api/errors";
import { valuesGet } from "../api/valuesGet";

/**
 * `google-sheets:columns` options resolver — RESOLVERS-1.
 *
 * Backs the header-name pickers on `google-sheets:find_row.column` and the
 * `google-sheets:row_changed` trigger's `keyColumn`. Both fields are HEADER
 * NAMES (not column letters, not indices), so the resolver reads the REAL
 * first row of the selected tab and offers exactly those strings. Never
 * invents columns — an empty result means the UI says "couldn't detect
 * columns" and falls back to manual entry.
 *
 * Endpoint: `GET /v4/spreadsheets/{id}/values/{range}` via the existing
 * `api/valuesGet` wrapper, with `range` = the tab's first row
 * (`'<tab>'!1:1`) — a bounded single-row read rather than the whole-sheet
 * read the find_row handler does.
 * Docs: https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets.values/get
 *
 * Scope: the already-granted `spreadsheets` scope (read/write) covers
 * `values.get` — NO new scope, no reconnect.
 *
 * Source-of-truth alignment with the runtime:
 *   - `findRow.ts` reads the sheet and treats `allRows[0]` as headers, then
 *     does `headers.indexOf(config.column)` — an exact, case-sensitive match
 *     on the raw header cell text. `rowChanged`'s snapshot resolves
 *     `keyColumn` against the same row-1 headers.
 *   - So `value` = `label` = the header cell text VERBATIM (trimmed only to
 *     drop blank cells). Offering anything else would hand the author a
 *     value the handler then fails to find.
 *
 * Behavior (mirrors `microsoft-excel:worksheet_columns`):
 *   - `requiredDeps: ["spreadsheetId", "sheetName"]` — pinned verbatim to
 *     the field names that exist on BOTH consumers (`FindRowConfigSchema`
 *     and the row_changed trigger schema use `spreadsheetId` + `sheetName`).
 *   - Blank header cells are skipped; duplicate header names keep the FIRST
 *     occurrence only (the handler's `indexOf` resolves to the first match
 *     anyway — offering the dupe twice would be a lie).
 *   - Column order is preserved (left-to-right), NOT alpha-sorted: authors
 *     think about headers positionally, and `description` carries the A1
 *     column letter for disambiguation.
 *   - Empty sheet / all-blank row 1 → empty items (honest "no columns
 *     detected", NOT an error).
 *   - Parent spreadsheet/tab gone (NotFoundError — Sheets 404s the
 *     spreadsheet and 400/INVALID_ARGUMENTs a missing tab; the wrapper
 *     folds both into NotFoundError) → empty items, cascade fallback.
 *   - `hasMore: false` — one row is the complete column list.
 *
 * Error sanitization: 401 / action-required → INTEGRATION_DISCONNECTED;
 * anything else → PROVIDER_ERROR with a static message. No tokens, no raw
 * Sheets bodies, and no CELL CONTENT ever reaches the browser — the read is
 * row 1 only, and only header text becomes an option.
 */

/** One page is the header row — Sheets returns it whole; no pagination. */
const HEADER_ROW_RANGE_SUFFIX = "!1:1";

/**
 * A1 range for a tab's first row. The sheet title is ALWAYS single-quoted
 * (Sheets accepts quotes even when unnecessary) and embedded single quotes
 * are doubled — that's Google's escape rule, and it keeps titles with
 * spaces / punctuation / apostrophes ("Bob's Orders") from breaking the
 * range parse.
 */
export function headerRowRange(sheetName: string): string {
  return `'${sheetName.replace(/'/g, "''")}'${HEADER_ROW_RANGE_SUFFIX}`;
}

/** 1-based column number → A1 letter (1 → A, 27 → AA). */
function columnLetter(n: number): string {
  let result = "";
  let remaining = n;
  while (remaining > 0) {
    const rem = (remaining - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return result;
}

export const googleSheetsColumnsResolver: OptionsResolver = {
  source: "google-sheets:columns",
  provider: "google-sheets",
  requiresIntegration: true,
  requiredDeps: ["spreadsheetId", "sheetName"],
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Google Sheets integration. Connect Google Sheets first.",
      );
    }

    const integration = ctx.integration;

    // Defense-in-depth — the route's requiredDeps guard fires first.
    const spreadsheetId = ctx.deps.spreadsheetId;
    const sheetName = ctx.deps.sheetName;
    if (typeof spreadsheetId !== "string" || spreadsheetId.length === 0) {
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Select a spreadsheet first.",
      );
    }
    if (typeof sheetName !== "string" || sheetName.length === 0) {
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Select a sheet first.",
      );
    }

    let result;
    try {
      result = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "google-sheets",
        providerAccountId: null,
        apiCall: (accessToken) =>
          valuesGet({
            accessToken,
            spreadsheetId,
            range: headerRowRange(sheetName),
            majorDimension: "ROWS",
          }),
      });
    } catch (err) {
      if (
        err instanceof IntegrationActionRequiredError ||
        err instanceof Unauthorized401Error
      ) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect Google Sheets and try again.",
        );
      }
      if (err instanceof NotFoundError) {
        // Parent spreadsheet / tab no longer exists — empty picker, not an
        // error (re-picking the parents refetches).
        return { items: [], hasMore: false };
      }
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't read the sheet's columns. Try again.",
      );
    }

    const headerRow = result.values?.[0] ?? [];

    const seen = new Set<string>();
    const items: OptionItem[] = [];
    for (let i = 0; i < headerRow.length; i++) {
      const cell = headerRow[i];
      if (typeof cell !== "string") continue;
      const header = cell.trim();
      if (header.length === 0) continue;
      if (seen.has(header)) continue;
      seen.add(header);
      items.push({
        value: header,
        label: header,
        description: `Column ${columnLetter(i + 1)}`,
      });
    }

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : items;

    // One row IS the complete column list — nothing beyond this page.
    return { items: filtered, hasMore: false };
  },
};
