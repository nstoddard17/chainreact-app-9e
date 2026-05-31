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
 * `airtable:fields` options resolver — Slice 4.AIRTABLE-META-2.
 *
 * Lists the fields (columns) of a table. Backs `list_records.fields`
 * (combobox + multiple) and is available for `add_attachment.fieldName`
 * (a tighter `attachment_fields` resolver exists for that). The
 * `create/update_record.fields` typed map has no single-field consumer
 * (it's paste-JSON), but this resolver documents the available field
 * names for authors.
 *
 * **Multi-parent cascade** — `requiredDeps: ["baseId", "tableIdOrName"]`,
 * unblocked by Slice 4.BUILDER-OPTIONS-1. Metadata fields wire
 * `dependsOn: ["baseId", "tableIdOrName"]` (names pinned verbatim to the
 * runtime Zod schemas).
 *
 * **`value` is the field NAME, not its id.** The Airtable runtime keys
 * the `fields` record by name, `list_records.fields` is an array of
 * names, `sort[].field` is a name, and `filterByFormula` references
 * field names — never field ids. So the picker must emit names.
 * `label` = name; `description` = the Airtable field type (a safe schema
 * fact, e.g. "singleLineText" / "multipleAttachments").
 *
 * Source: reuse `basesGetSchema` (GET /v0/meta/bases/{baseId}/tables),
 * then select the table by id OR name (`findTable`, mirroring the
 * runtime `tablesGet`). No new transport. `hasMore: false` (single
 * response). Order PRESERVES Airtable's field-column order.
 *
 * Cascade fallback: deleted/no-access base → `NotFoundError` → empty
 * items; table no longer present in the base → empty items.
 *
 * Error sanitization: auth → `INTEGRATION_DISCONNECTED`; other →
 * `PROVIDER_ERROR`. No token / raw body / record-value leakage (only
 * field NAMES + TYPES — schema metadata, not record content — are
 * surfaced).
 */
export const airtableFieldsResolver: OptionsResolver = {
  source: "airtable:fields",
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

    const items: OptionItem[] = [];
    for (const field of table.fields) {
      if (typeof field.name !== "string" || field.name.length === 0) continue;
      items.push({
        value: field.name,
        label: field.name,
        description: field.type,
      });
    }

    return { items: filterByLabel(items, ctx.q), hasMore: false };
  },
};
