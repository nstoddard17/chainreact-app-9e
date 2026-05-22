import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-outlook:add_categories`.
 *
 * Mirrors `addCategories.schema.ts`. The runtime accepts `categories`
 * as `string | string[]` (CSV-or-array) and the chip input writes
 * `string[]` natively.
 *
 * **IMPORTANT — V1-parity PATCH-replace semantics**:
 * Graph's PATCH on `categories[]` REPLACES the collection rather than
 * appending. Adding one category to a message with three existing
 * categories REPLACES all four with the one. Both V1 and V2 follow
 * this. The description surfaces the behavior so workflow authors
 * aren't surprised.
 *
 * Required scope: `Mail.ReadWrite` (P-O1 manifest widening).
 *
 * Outputs match `addCategories.ts:68-74` exactly.
 */
export const outlookAddCategoriesMeta: ActionMeta = {
  key: "microsoft-outlook:add_categories",
  provider: "microsoft-outlook",
  type: "add_categories",
  displayName: "Set Categories",
  description:
    "Set Outlook categories on a message via Microsoft Graph. NOTE: this is a PATCH-replace — the supplied categories REPLACE the message's existing categories list, they do not append. Workflows that want to merge must read the existing categories first and combine. Requires the Mail.ReadWrite scope.",
  category: "email",
  requiresIntegration: true,
  fields: [
    {
      name: "emailId",
      label: "Email id",
      description:
        "Graph message id whose categories are being set. Source from a trigger payload or fetch_emails result.",
      type: "text",
      required: true,
    },
    {
      name: "categories",
      label: "Categories",
      description:
        "Categories to set on the message. PATCH-REPLACE — these REPLACE any existing categories. Press Enter or click Add to append each category name. Microsoft uses display-name strings (e.g. 'Red Category', 'Follow up') — no id translation.",
      type: "string-array",
      required: true,
      placeholder: "Red Category",
    },
  ],
  outputs: [
    { name: "categorized", type: "boolean", description: "Always true on success." },
    { name: "emailId", type: "string", description: "Echoes the input emailId." },
    {
      name: "categories",
      type: "array",
      description:
        "Final categories on the message after the PATCH. Usually echoes the input list; falls back to the input when Graph omits the field in the response.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 70,
};
