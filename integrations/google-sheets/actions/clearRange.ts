import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { valuesClear } from "../api/valuesClear";
import {
  ClearRangeConfigSchema,
  type ClearRangeConfig,
} from "./clearRange.schema";

/**
 * Google Sheets `spreadsheets.values.clear` action handler.
 *
 * Wraps the principal API call in `refreshAndRetry` (Q3). No idempotency
 * concern — clearing already-empty cells is a no-op and Google returns
 * the same `clearedRange` regardless. Retries are safe.
 */
export const clearRange: ActionHandler = async (input) => {
  const config: ClearRangeConfig = ClearRangeConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "google-sheets"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "google-sheets",
    providerAccountId,
    apiCall: (accessToken) =>
      valuesClear({
        accessToken,
        spreadsheetId: config.spreadsheetId,
        range: config.range,
      }),
  });

  return {
    output: {
      spreadsheetId: result.spreadsheetId ?? config.spreadsheetId,
      clearedRange: result.clearedRange ?? null,
    },
  };
};
