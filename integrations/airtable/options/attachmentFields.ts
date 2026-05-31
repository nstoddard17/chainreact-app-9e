import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  type OptionItem,
  type OptionsResolver,
} from "@/services/options/types";
import { basesGetSchema } from "@/integrations/airtable/api/bases";
import { NotFoundError } from "@/integrations/_shared/airtable/errors";
import {
  ATTACHMENT_FIELD_METADATA_TYPES,
  filterByLabel,
  findTable,
  mapAirtableOptionsError,
  requireAirtableIntegration,
  requireDep,
} from "./_shared";

/**
 * `airtable:attachment_fields` options resolver — Slice 4.AIRTABLE-META-2.
 *
 * Lists ONLY the attachment-type fields of a table. Backs
 * `add_attachment.fieldName` so authors pick a valid target field
 * instead of hand-typing (and never accidentally target a non-attachment
 * column).
 *
 * **Multi-parent cascade** — `requiredDeps: ["baseId", "tableIdOrName"]`
 * (unblocked by BUILDER-OPTIONS-1). Dep names pinned verbatim.
 *
 * **`value` is the field NAME** (the `add_attachment` handler forwards
 * `fieldName` into the `fields` map keyed by name). `label` = name;
 * `description` = "Attachment field".
 *
 * Filter: keeps fields whose Airtable metadata `type` is in
 * `ATTACHMENT_FIELD_METADATA_TYPES` (canonical `multipleAttachments`,
 * plus `attachment` defensively — see `_shared.ts`).
 *
 * Source / fallback / sanitization: identical to the `fields` resolver
 * (reuse `basesGetSchema`, select table by id|name, NotFound/table-gone →
 * empty items, auth → `INTEGRATION_DISCONNECTED`, other →
 * `PROVIDER_ERROR`). No new transport; only field NAMES surfaced.
 */
export const airtableAttachmentFieldsResolver: OptionsResolver = {
  source: "airtable:attachment_fields",
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
      return { items: [], hasMore: false };
    }

    const items: OptionItem[] = [];
    for (const field of table.fields) {
      if (typeof field.name !== "string" || field.name.length === 0) continue;
      if (!ATTACHMENT_FIELD_METADATA_TYPES.has(field.type)) continue;
      items.push({
        value: field.name,
        label: field.name,
        description: "Attachment field",
      });
    }

    return { items: filterByLabel(items, ctx.q), hasMore: false };
  },
};
