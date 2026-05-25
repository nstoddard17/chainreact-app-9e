import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { valuesGet } from "../api/valuesGet";
import {
  ReadRowsConfigSchema,
  type ReadRowsConfig,
} from "./readRows.schema";

/**
 * Google Sheets `spreadsheets.values.get` action handler.
 *
 * Read-only. Wraps the principal API call in `refreshAndRetry` (Q3); no
 * idempotency concern since this is GET-shaped.
 *
 * Output preserves the array-of-arrays shape so downstream nodes can
 * iterate. `count` mirrors `values.length` as a top-level convenience for
 * branch-on-empty workflows.
 */
export const readRows: ActionHandler = async (input) => {
  const config: ReadRowsConfig = ReadRowsConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "google-sheets"
      ? input.triggerEvent.accountId
      : null;

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "google-sheets",
    accountId,
    apiCall: (accessToken) =>
      valuesGet({
        accessToken,
        spreadsheetId: config.spreadsheetId,
        range: config.range,
        majorDimension: config.majorDimension,
        valueRenderOption: config.valueRenderOption,
      }),
  });

  const values = result.values ?? [];

  return {
    output: {
      range: result.range ?? config.range,
      majorDimension: result.majorDimension ?? config.majorDimension,
      values,
      count: values.length,
    },
  };
};
