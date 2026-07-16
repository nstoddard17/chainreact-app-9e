import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  type OptionItem,
  type OptionsResolver,
} from "@/services/options/types";
import { basesGetSchema } from "@/integrations/airtable/api/bases";
import { recordsList } from "@/integrations/airtable/api/records";
import { NotFoundError } from "@/integrations/_shared/airtable/errors";
import {
  filterByLabel,
  findTable,
  mapAirtableOptionsError,
  requireAirtableIntegration,
  requireDep,
} from "./_shared";

/**
 * `airtable:records` options resolver — RESOLVERS-1.
 *
 * Record picker for `get_record` / `update_record` / `delete_record`
 * `recordId` fields (combobox + manual entry; ids mapped from upstream
 * steps still work). AIRTABLE-META-1 originally rejected record pickers
 * for v1 ("large/ambiguous"); Marcus has since explicitly required them
 * — this resolver reverses that decision (single bounded page + search
 * + manual-entry fallback keeps the "large/ambiguous" concern managed).
 *
 * Endpoints (documented at
 * https://airtable.com/developers/web/api/list-records and
 * https://airtable.com/developers/web/api/get-base-schema):
 *   1. GET /v0/meta/bases/{baseId}/tables (existing `basesGetSchema`
 *      wrapper, `schema.bases:read` scope) — to find the table's PRIMARY
 *      field name (`primaryFieldId` → field name; first field as a
 *      defensive fallback).
 *   2. GET /v0/{baseId}/{tableIdOrName}?pageSize=100&fields[]=<primary>
 *      (existing `recordsList` wrapper, `data.records:read` scope) —
 *      one bounded page, fetching ONLY the primary field so no other
 *      cell data ever leaves the provider boundary.
 *
 * **Multi-parent cascade** — `requiredDeps: ["baseId", "tableIdOrName"]`,
 * names pinned verbatim to the runtime Zod schemas (same deps as
 * `airtable:fields` / `airtable:views`).
 *
 * `value` = the record id (`recXXXXXXXXXXXXXX` — exactly what the
 * handler schemas store). `label` = the record's PRIMARY field value
 * (the record's human identity in Airtable's own UI), falling back to
 * the record id when the primary cell is empty / non-text. The record
 * id rides in `description` for disambiguation. NO other field values,
 * NO raw payload spread.
 *
 * One page only (`pageSize` 100 — Airtable's hard ceiling); `hasMore`
 * is honest via the response's pagination `offset`. Local `ctx.q`
 * filtering on labels; order preserves Airtable's record order.
 *
 * Cascade fallback: deleted/no-access base or table → `NotFoundError`
 * → empty items (the picker shows nothing; manual entry still works).
 *
 * Error sanitization: auth → `INTEGRATION_DISCONNECTED`; other →
 * `PROVIDER_ERROR` (static copy). No token / raw body / cell-data
 * leakage in errors.
 */
const PAGE_SIZE = 100;

export const airtableRecordsResolver: OptionsResolver = {
  source: "airtable:records",
  provider: "airtable",
  requiresIntegration: true,
  requiredDeps: ["baseId", "tableIdOrName"],
  async resolve(ctx) {
    const integration = requireAirtableIntegration(ctx);
    const baseId = requireDep(ctx, "baseId", "base");
    const tableIdOrName = requireDep(ctx, "tableIdOrName", "table");

    // 1. Table schema → primary field name (labels come from it).
    let schema;
    try {
      schema = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "airtable",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          basesGetSchema({ accessToken, baseId, includeViews: false }),
      });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return { items: [], hasMore: false };
      }
      mapAirtableOptionsError(err);
    }

    const table = findTable(schema.tables, tableIdOrName);
    if (!table) {
      // Parent table gone / renamed / no access — empty picker, not error.
      return { items: [], hasMore: false };
    }
    const primaryFieldName =
      table.fields.find((f) => f.id === table.primaryFieldId)?.name ??
      table.fields[0]?.name;

    // 2. One bounded page of records, primary field ONLY.
    let page;
    try {
      page = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "airtable",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          recordsList({
            accessToken,
            baseId,
            tableIdOrName,
            pageSize: PAGE_SIZE,
            ...(primaryFieldName !== undefined
              ? { fields: [primaryFieldName] }
              : {}),
          }),
      });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return { items: [], hasMore: false };
      }
      mapAirtableOptionsError(err);
    }

    const items: OptionItem[] = [];
    for (const record of page.records) {
      if (typeof record.id !== "string" || record.id.length === 0) continue;
      const raw =
        primaryFieldName !== undefined
          ? record.fields?.[primaryFieldName]
          : undefined;
      let label: string;
      if (typeof raw === "string" && raw.trim().length > 0) {
        label = raw;
      } else if (typeof raw === "number") {
        label = String(raw);
      } else {
        label = record.id;
      }
      items.push(
        label === record.id
          ? { value: record.id, label }
          : { value: record.id, label, description: record.id },
      );
    }

    return {
      items: filterByLabel(items, ctx.q),
      hasMore: page.offset !== undefined,
    };
  },
};
