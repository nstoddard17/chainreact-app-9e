import { NotFoundError } from "@/integrations/_shared/airtable/errors";
import {
  basesGetSchema,
  type AirtableTableMetadata,
} from "./bases";

/**
 * Airtable Tables API helper — Slice 10 Commit 3.
 *
 * Airtable does NOT expose a per-table metadata endpoint. To fetch
 * one table's schema, V2 hits `GET /v0/meta/bases/{baseId}/tables`
 * via `basesGetSchema` and filters the response client-side.
 *
 * Used by `actions/getTableSchema.ts`.
 *
 * The plan §"V1 audit" classifies V1's `getTableSchema.ts` as "port
 * mostly as-is" — V1 does the same fetch + filter pattern. V2 just
 * routes through the typed wrapper so the 401 / 404 / error mapping
 * stays consistent with every other Airtable wrapper.
 *
 * Throws `NotFoundError("table <baseId>/<tableIdOrName>")` when the
 * base exists but no table matches the id or name. Mirrors the
 * "find" semantic vs "get" semantic from the action plan: actions
 * that target a specific known resource throw NotFoundError; "find"
 * style actions (find_record) return null instead.
 */

export interface TablesGetInput {
  accessToken: string;
  baseId: string;
  /** Accepts both `tblXXXXXXXXX` ids and human-readable names. */
  tableIdOrName: string;
  includeViews: boolean;
}

export async function tablesGet(
  input: TablesGetInput,
): Promise<AirtableTableMetadata> {
  const schema = await basesGetSchema({
    accessToken: input.accessToken,
    baseId: input.baseId,
    includeViews: input.includeViews,
  });
  const match = schema.tables.find(
    (t) => t.id === input.tableIdOrName || t.name === input.tableIdOrName,
  );
  if (!match) {
    throw new NotFoundError(
      `table ${input.baseId}/${input.tableIdOrName}`,
      `no table with id or name '${input.tableIdOrName}' in base ${input.baseId}`,
    );
  }
  return match;
}
