import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { spreadsheetsGet } from "../api/spreadsheetsGet";
import {
  GetSheetMetadataConfigSchema,
  type GetSheetMetadataConfig,
} from "./getSheetMetadata.schema";

/**
 * Google Sheets `spreadsheets.get` action handler.
 *
 * Wraps the principal API call in `refreshAndRetry` (Q3). Read-only — no
 * idempotency concern.
 *
 * Output flattens the nested Google response into a stable downstream
 * shape:
 *   - `title`              top-level spreadsheet title
 *   - `locale`, `timeZone` spreadsheet-level i18n metadata
 *   - `sheets[]`           one entry per sheet/tab with sheetId, title,
 *                          index, sheetType, rowCount, columnCount
 *
 * The flattening means workflows can write
 * `{{getMetaNode.sheets[0].title}}` without traversing nested
 * `properties.gridProperties` paths Google's response uses.
 */
export const getSheetMetadata: ActionHandler = async (input) => {
  const config: GetSheetMetadataConfig =
    GetSheetMetadataConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "google-sheets"
      ? input.triggerEvent.accountId
      : null;

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "google-sheets",
    accountId,
    apiCall: (accessToken) =>
      spreadsheetsGet({
        accessToken,
        spreadsheetId: config.spreadsheetId,
      }),
  });

  const sheets = (result.sheets ?? []).map((s) => {
    const props = s.properties ?? {};
    const grid = props.gridProperties ?? {};
    return {
      sheetId: props.sheetId ?? null,
      title: props.title ?? null,
      index: props.index ?? null,
      sheetType: props.sheetType ?? null,
      rowCount: grid.rowCount ?? null,
      columnCount: grid.columnCount ?? null,
    };
  });

  return {
    output: {
      spreadsheetId: result.spreadsheetId,
      title: result.properties?.title ?? null,
      locale: result.properties?.locale ?? null,
      timeZone: result.properties?.timeZone ?? null,
      sheets,
    },
  };
};
