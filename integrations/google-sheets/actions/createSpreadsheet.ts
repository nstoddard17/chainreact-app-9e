import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { spreadsheetsCreate } from "../api/spreadsheetsCreate";
import {
  CreateSpreadsheetConfigSchema,
  type CreateSpreadsheetConfig,
} from "./createSpreadsheet.schema";

/**
 * Google Sheets create_spreadsheet action handler (Sheets 2.1 Commit 3).
 *
 * Wraps the principal API call in `refreshAndRetry` (Q3). Side-effectful
 * (creates new resource), but the audit pins create-row-like operations
 * outside Q4 idempotency for v2 — workflows that re-run a create
 * naturally get a second spreadsheet, which is the right semantics for
 * a "creation" action.
 *
 * Output flattens Google's nested response into a stable downstream
 * shape:
 *   - `spreadsheetId`     — Google-assigned id (used by downstream
 *                           `update_row` / `append_row` / etc.).
 *   - `spreadsheetUrl`    — direct link to open the sheet in a browser.
 *   - `title`             — the title Google echoed back (== input.title
 *                           when valid).
 *   - `sheets[]`          — one entry per created sheet, each
 *                           `{sheetId, title}`. With `initialSheetName`
 *                           set there's exactly one entry; without, the
 *                           response contains Google's default "Sheet1".
 *   - `firstSheet`        — convenience scalar = `sheets[0]` or null.
 */
export const createSpreadsheet: ActionHandler = async (input) => {
  const config: CreateSpreadsheetConfig =
    CreateSpreadsheetConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "google-sheets"
      ? input.triggerEvent.accountId
      : null;

  const initialSheetTitles = config.initialSheetName
    ? [config.initialSheetName]
    : undefined;

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "google-sheets",
    accountId,
    apiCall: (accessToken) =>
      spreadsheetsCreate({
        accessToken,
        title: config.title,
        initialSheetTitles,
      }),
  });

  const sheets = (result.sheets ?? []).map((s) => ({
    sheetId: s.properties?.sheetId ?? null,
    title: s.properties?.title ?? null,
  }));

  return {
    output: {
      spreadsheetId: result.spreadsheetId ?? null,
      spreadsheetUrl: result.spreadsheetUrl ?? null,
      title: result.properties?.title ?? config.title,
      sheets,
      firstSheet: sheets[0] ?? null,
    },
  };
};
