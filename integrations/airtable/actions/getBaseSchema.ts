import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { basesGetSchema } from "../api/bases";
import { GetBaseSchemaConfigSchema } from "./getBaseSchema.schema";

/**
 * Airtable `get_base_schema` action handler.
 *
 * Returns the full table list for a base — each table's id, name,
 * primary field id, fields metadata, and (when `includeViews=true`)
 * views. Used by downstream nodes to look up field types for typed
 * record reads/writes (the trigger path in Commit 4 will consume
 * this metadata via `parseFieldsWithSchema`).
 *
 * Output shape (downstream variable refs):
 *   { baseId, tables: [{ id, name, primaryFieldId, fields, views? }],
 *     tableCount, totalFieldCount }
 *   - tableCount and totalFieldCount mirror V1's outputs at
 *     getBaseSchema.ts:79-82 — useful for downstream branching
 *     ("only proceed if the base has > 0 tables").
 */
export const getBaseSchema: ActionHandler = async (input) => {
  const config = GetBaseSchemaConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "airtable"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "airtable",
    providerAccountId,
    apiCall: (accessToken) =>
      basesGetSchema({
        accessToken,
        baseId: config.baseId,
        includeViews: config.includeViews,
      }),
  });

  const tableCount = result.tables.length;
  const totalFieldCount = result.tables.reduce(
    (sum, t) => sum + t.fields.length,
    0,
  );

  return {
    output: {
      baseId: config.baseId,
      tables: result.tables,
      tableCount,
      totalFieldCount,
    },
  };
};
