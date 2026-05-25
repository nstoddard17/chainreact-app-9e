import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  type OptionItem,
  type OptionsResolver,
} from "@/services/options/types";
import { basesGetSchema } from "@/integrations/airtable/api/bases";
import { NotFoundError } from "@/integrations/_shared/airtable/errors";
import {
  filterByLabel,
  findTable,
  mapAirtableOptionsError,
  requireAirtableIntegration,
  requireDep,
} from "./_shared";

/**
 * `airtable:views` options resolver — Slice 4.AIRTABLE-META-2.
 *
 * Lists the views of a table. Backs `list_records.view`.
 *
 * **Multi-parent cascade** — `requiredDeps: ["baseId", "tableIdOrName"]`
 * (unblocked by BUILDER-OPTIONS-1). Dep names pinned verbatim to the
 * runtime schemas.
 *
 * **`value` is the view NAME, not its id.** Airtable's `view` query
 * param accepts a view name OR id (`recordsList` forwards it verbatim),
 * so there is no id-only consumer. We emit the NAME for consistency with
 * the `fields` resolver (human-readable, label == value, debuggable) and
 * because view names are unique within a table. (Trade-off: renaming a
 * view in Airtable invalidates a saved value — acceptable and rare; ids
 * would be rename-safe but opaque. Documented choice.) `label` = name;
 * `description` = the Airtable view `type` (e.g. "grid" / "kanban") when
 * present — a safe schema fact.
 *
 * Source: reuse `basesGetSchema` with `includeViews: true` (views are
 * only present in the response when requested), then select the table by
 * id OR name. No new transport. `hasMore: false`. Order PRESERVES
 * Airtable's view order (mirrors the Airtable UI view list).
 *
 * Cascade fallback: deleted/no-access base → empty; table gone → empty;
 * table with no views → empty.
 *
 * Error sanitization: auth → `INTEGRATION_DISCONNECTED`; other →
 * `PROVIDER_ERROR`. No token / raw body / record-data leakage (only view
 * names + types — schema metadata — are surfaced).
 */
export const airtableViewsResolver: OptionsResolver = {
  source: "airtable:views",
  provider: "airtable",
  requiresIntegration: true,
  requiredDeps: ["baseId", "tableIdOrName"],
  async resolve(ctx) {
    const integration = requireAirtableIntegration(ctx);
    const baseId = requireDep(ctx, "baseId", "base");
    const tableIdOrName = requireDep(ctx, "tableIdOrName", "table");

    let schema;
    try {
      schema = await refreshAndRetry({
        userId: ctx.userId,
        provider: "airtable",
        accountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          basesGetSchema({ accessToken, baseId, includeViews: true }),
      });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return { items: [], hasMore: false };
      }
      mapAirtableOptionsError(err);
    }

    const table = findTable(schema.tables, tableIdOrName);
    if (!table || !table.views) {
      return { items: [], hasMore: false };
    }

    const items: OptionItem[] = [];
    for (const view of table.views) {
      if (typeof view.name !== "string" || view.name.length === 0) continue;
      items.push({
        value: view.name,
        label: view.name,
        description: view.type,
      });
    }

    return { items: filterByLabel(items, ctx.q), hasMore: false };
  },
};
