import {
  IntegrationActionRequiredError,
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { NotFoundError } from "../api/errors";
import { spreadsheetsGet } from "../api/spreadsheetsGet";

/**
 * `google-sheets:sheets` options resolver — Slice 3.GSHEETS-2.
 *
 * Backs the `sheetName` field across the 7 actions + 1 trigger that
 * scope to a single worksheet (per the GSHEETS-1 plan §4.1). Reads
 * the sheet list from `spreadsheets.get?includeGridData=false`,
 * which the existing `spreadsheetsGet` wrapper already handles.
 *
 * Architecture:
 *   - `requiresIntegration: true` — same as `google-sheets:spreadsheets`.
 *   - `requiredDeps: ["spreadsheetId"]` — the route validates this
 *     before dispatch and short-circuits with `MISSING_DEPENDENCY` +
 *     `missingDependency: "spreadsheetId"` if absent. The renderer
 *     surfaces a passive "Select Spreadsheet first" trigger (Slice
 *     3.33 cascade UX).
 *   - Goes through `refreshAndRetry` for the same Google-token-
 *     expiry reasons as `spreadsheets`.
 *
 * Mapping (Sheets sheet → OptionItem):
 *   - `value`: sheet `title` (string). The `sheetName` field in every
 *     consuming schema is the title, not the numeric `sheetId` —
 *     consistent with the schemas (delete_row.sheetName, etc.).
 *   - `label`: same as value.
 *   - `description`: `<rowCount> rows × <columnCount> columns` when
 *     both are present + positive. Omitted otherwise. Gives the
 *     workflow author useful context (which sheet is the data, which
 *     is the lookup) without exposing cell content.
 *
 * Sheets returned by `spreadsheets.get` come in workbook order
 * (sheetIndex). The resolver preserves that order — workflow authors
 * tend to think of "the first tab" / "the second tab" by position,
 * not by title.
 *
 * `hasMore` is always `false`. `spreadsheets.get` returns the
 * complete worksheet list in a single call (workbooks max out at a
 * few hundred tabs in practice). No pagination to plumb.
 *
 * Client-side `q` filter — case-insensitive substring match on the
 * label. Mirrors `google-sheets:spreadsheets`.
 *
 * Error sanitization:
 *   - Missing `ctx.deps.spreadsheetId` → `MISSING_DEPENDENCY` (defense
 *     in depth — route already guards). Mirrors the route's
 *     `requiredDeps` short-circuit.
 *   - `IntegrationActionRequiredError` / `Unauthorized401Error` →
 *     `INTEGRATION_DISCONNECTED` with a reconnect prompt.
 *   - `NotFoundError` (Sheets returns 404 when the spreadsheetId is
 *     invalid or the user lost access) → `PROVIDER_ERROR` with a
 *     "couldn't find the spreadsheet" message. The raw resource
 *     identifier is NOT echoed — keeps the surface privacy-safe even
 *     if the picker were ever embedded in a shared context.
 *   - Any other thrown error → `PROVIDER_ERROR` with a generic
 *     "couldn't load Google Sheets" message.
 */

interface SheetProperties {
  title?: unknown;
  gridProperties?: {
    rowCount?: unknown;
    columnCount?: unknown;
  };
}

function describeGrid(props: SheetProperties): string | undefined {
  const grid = props.gridProperties;
  if (!grid || typeof grid !== "object") return undefined;
  const rowCount = typeof grid.rowCount === "number" ? grid.rowCount : null;
  const columnCount =
    typeof grid.columnCount === "number" ? grid.columnCount : null;
  if (rowCount === null || columnCount === null) return undefined;
  if (rowCount <= 0 || columnCount <= 0) return undefined;
  return `${rowCount} rows × ${columnCount} columns`;
}

export const googleSheetsSheetsResolver: OptionsResolver = {
  source: "google-sheets:sheets",
  provider: "google-sheets",
  requiresIntegration: true,
  requiredDeps: ["spreadsheetId"],
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Google Sheets integration. Connect Google Sheets first.",
      );
    }

    const spreadsheetId = ctx.deps.spreadsheetId;
    if (typeof spreadsheetId !== "string" || spreadsheetId.length === 0) {
      // Defense-in-depth — the route's requiredDeps guard should have
      // fired before we got here.
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Select a spreadsheet first.",
      );
    }

    let resource;
    try {
      resource = await refreshAndRetry({
        userId: ctx.userId,
        provider: "google-sheets",
        accountId: null,
        apiCall: (accessToken) =>
          spreadsheetsGet({ accessToken, spreadsheetId }),
      });
    } catch (err) {
      if (err instanceof IntegrationActionRequiredError) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect Google Sheets and try again.",
        );
      }
      if (err instanceof Unauthorized401Error) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect Google Sheets and try again.",
        );
      }
      if (err instanceof NotFoundError) {
        throw new OptionsResolverError(
          "PROVIDER_ERROR",
          "Couldn't find that spreadsheet. Pick another.",
        );
      }
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load Google Sheets. Try again.",
      );
    }

    const rawSheets = Array.isArray(resource.sheets) ? resource.sheets : [];
    const items = rawSheets
      .map((entry) => {
        const props = (entry as { properties?: SheetProperties }).properties;
        if (!props) return null;
        if (typeof props.title !== "string" || props.title.length === 0) {
          return null;
        }
        const description = describeGrid(props);
        return description !== undefined
          ? { value: props.title, label: props.title, description }
          : { value: props.title, label: props.title };
      })
      .filter(
        (
          item,
        ): item is { value: string; label: string; description?: string } =>
          item !== null,
      );

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : items;

    return {
      items: filtered,
      // spreadsheets.get returns the full worksheet list in one call;
      // no pagination cursor exists.
      hasMore: false,
    };
  },
};
