import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  type OptionItem,
  type OptionsResolver,
} from "@/services/options/types";
import { basesGetSchema } from "@/integrations/airtable/api/bases";
import { NotFoundError } from "@/integrations/_shared/airtable/errors";
import {
  filterByLabel,
  mapAirtableOptionsError,
  requireAirtableIntegration,
  requireDep,
} from "./_shared";

/**
 * `airtable:tables` options resolver — Slice 4.AIRTABLE-META-2.
 *
 * Backs the `tableIdOrName` field on every Airtable action except
 * `get_base_schema` (base-level only), plus the optional
 * `tableIdOrName` on the `record_changed` trigger. Single-parent
 * cascade off `baseId`.
 *
 * **Dep name `baseId` is pinned verbatim** to the Airtable runtime Zod
 * schemas. The metadata fields wire `dependsOn: "baseId"` to this name.
 *
 * **`value` is the table ID (`tblXXX`), not the name.** Rationale:
 *   - the `record_changed` trigger's `activate` passes the value as
 *     Airtable's webhook `recordChangeScope`, which requires a table id;
 *   - action handlers accept id OR name (`tablesGet` matches either), so
 *     an id works everywhere;
 *   - ids are rename-safe.
 * `label` is the table name.
 *
 * Source: reuse `basesGetSchema` (GET /v0/meta/bases/{baseId}/tables) —
 * no new transport. Returns all tables in one response (no pagination)
 * → `hasMore: false`.
 *
 * Ordering: **preserves Airtable's schema order** (mirrors the table-tab
 * order in the Airtable UI — meaningful to authors).
 *
 * Cascade fallback: if `baseId` points at a base that was deleted /
 * lost access between picker mounts, `basesGetSchema` throws
 * `NotFoundError` → return empty `items` (NOT an error). Re-picking the
 * base clears `tableIdOrName` and refetches.
 *
 * Error sanitization: auth errors → `INTEGRATION_DISCONNECTED`; other
 * errors → `PROVIDER_ERROR`. No token / raw body / record-data leakage.
 */
export const airtableTablesResolver: OptionsResolver = {
  source: "airtable:tables",
  provider: "airtable",
  requiresIntegration: true,
  requiredDeps: ["baseId"],
  async resolve(ctx) {
    const integration = requireAirtableIntegration(ctx);
    const baseId = requireDep(ctx, "baseId", "base");

    let schema;
    try {
      schema = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "airtable",
        providerAccountId: integration.accountId,
        apiCall: (accessToken) =>
          basesGetSchema({ accessToken, baseId, includeViews: false }),
      });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return { items: [], hasMore: false };
      }
      mapAirtableOptionsError(err);
    }

    const items: OptionItem[] = [];
    for (const table of schema.tables) {
      if (typeof table.id !== "string" || table.id.length === 0) continue;
      const label =
        typeof table.name === "string" && table.name.length > 0
          ? table.name
          : table.id;
      const fieldCount = table.fields.length;
      items.push({
        value: table.id,
        label,
        description: `${fieldCount} field${fieldCount === 1 ? "" : "s"}`,
      });
    }

    return { items: filterByLabel(items, ctx.q), hasMore: false };
  },
};
