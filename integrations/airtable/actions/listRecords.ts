import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { recordsList } from "../api/records";
import { ListRecordsConfigSchema } from "./listRecords.schema";

/**
 * Airtable `list_records` action handler.
 *
 * Forward-passes the user's filter / sort / view / pagination params
 * verbatim. The pageSize ceiling (100) is enforced at the schema
 * layer — Airtable rejects larger requests anyway.
 *
 * Output shape (downstream variable refs):
 *   { records: [{ id, fields, createdTime }], offset?, count }
 *   - `records` is the raw response from Airtable.
 *   - `offset` is set when there's a next page; null on the last page.
 *   - `count` is `records.length` for downstream branching.
 */
export const listRecords: ActionHandler = async (input) => {
  const config = ListRecordsConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "airtable"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "airtable",
    providerAccountId,
    apiCall: (accessToken) =>
      recordsList({
        accessToken,
        baseId: config.baseId,
        tableIdOrName: config.tableIdOrName,
        filterByFormula: config.filterByFormula,
        pageSize: config.pageSize,
        maxRecords: config.maxRecords,
        offset: config.offset,
        fields: config.fields,
        view: config.view,
        sort: config.sort,
      }),
  });

  return {
    output: {
      records: result.records.map((r) => ({
        id: r.id,
        fields: r.fields,
        createdTime: r.createdTime ?? null,
      })),
      offset: result.offset ?? null,
      count: result.records.length,
    },
  };
};
