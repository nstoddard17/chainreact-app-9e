import type { ActionMeta } from "@/contracts/actionMeta";
import { QUICKBOOKS_INVOICE_OUTPUTS } from "./_sharedOutputs";

/**
 * QuickBooks `create_invoice` ActionMeta — QUICKBOOKS-1.
 *
 * Creates a DRAFT — never emails the customer (that is the separate
 * Send Invoice action). Line items use `object-list` rows; the row
 * `itemId` is a text sub-field because object-list sub-fields don't
 * support option sources (paste an id from the Items picker on another
 * field, or map one) — documented limitation, revisit if a
 * row-level-resolver field type lands. `customerEmail` is annotated
 * `sensitivity: "recipient"` (it is where a later send delivers).
 */
export const quickbooksCreateInvoiceMeta: ActionMeta = {
  key: "quickbooks:create_invoice",
  provider: "quickbooks",
  type: "create_invoice",
  displayName: "Create Invoice (draft)",
  description:
    "Create a DRAFT invoice in QuickBooks Online. Does NOT email the customer — use Send Invoice for that. Each line references an existing QuickBooks product/service item with an explicit amount; items are never created automatically and tax values are never guessed.",
  category: "commerce",
  requiresIntegration: true,
  fields: [
    {
      name: "customerId",
      label: "Customer",
      type: "combobox",
      optionsSource: "quickbooks:customers",
      required: true,
      allowManualEntry: true,
      placeholder: "Search customers…",
      description: "Who the invoice bills.",
    },
    {
      name: "lineItems",
      label: "Line items",
      type: "object-list",
      required: true,
      description:
        "One row per invoice line. Item id is the QuickBooks product/service id (find ids via the Items dropdown on other fields or in QuickBooks). Amount is the line total — it is never derived for you.",
      itemFields: [
        {
          // RESOLVERS-3 — picked from the company's own product/service
          // catalog (`quickbooks:items`, registered by QUICKBOOKS-1 but
          // referenced by ZERO fields until now — it existed only because a
          // sub-field could not bind an option source). `allowManualEntry`
          // keeps `{{...}}` mapping + paste-an-id working.
          name: "itemId",
          label: "Product/service",
          description:
            "The QuickBooks product or service this line bills for. Pick one, or map it from an earlier step.",
          type: "text",
          required: true,
          placeholder: "Search products and services…",
          optionsSource: "quickbooks:items",
          allowManualEntry: true,
        },
        {
          name: "amount",
          label: "Amount",
          type: "number",
          required: true,
        },
        {
          name: "quantity",
          label: "Quantity",
          type: "number",
          required: false,
        },
        {
          name: "unitPrice",
          label: "Unit price",
          type: "number",
          required: false,
        },
        {
          name: "description",
          label: "Description",
          type: "text",
          required: false,
        },
        {
          // RESOLVERS-3 — `quickbooks:tax_codes` was likewise registered and
          // unreferenced. Stays OPTIONAL and undefaulted: when omitted,
          // QuickBooks' own tax behavior applies (see the schema doc) — the
          // picker only removes the id lookup, it does not change semantics.
          name: "taxCodeId",
          label: "Tax code",
          description:
            "Optional. Leave empty to let QuickBooks apply its own tax behavior for this line.",
          type: "text",
          required: false,
          placeholder: "Search tax codes…",
          optionsSource: "quickbooks:tax_codes",
          allowManualEntry: true,
        },
      ],
    },
    {
      name: "txnDate",
      label: "Invoice date",
      type: "date",
      required: false,
      description: "Defaults to today in QuickBooks when left empty.",
    },
    {
      name: "dueDate",
      label: "Due date",
      type: "date",
      required: false,
      description:
        "When empty, QuickBooks derives it from the payment terms (or the company default).",
    },
    {
      name: "termId",
      label: "Payment terms",
      type: "combobox",
      optionsSource: "quickbooks:terms",
      required: false,
      placeholder: "Company default",
      description:
        "Payment terms (e.g. Net 30) that set when the invoice is due. Leave empty to use the company default.",
    },
    {
      name: "customerEmail",
      label: "Billing email",
      type: "text",
      required: false,
      sensitivity: "recipient",
      description:
        "Stored as the invoice's billing email — where Send Invoice will deliver. Defaults to the customer's email in QuickBooks when left empty.",
    },
    {
      name: "customerMemo",
      label: "Customer memo",
      type: "textarea",
      required: false,
      description: "Printed on the invoice — visible to the customer.",
    },
    {
      name: "privateNote",
      label: "Private note",
      type: "textarea",
      required: false,
      description: "Internal note — never shown to the customer.",
    },
    {
      name: "globalTaxCalculation",
      label: "Tax treatment (non-US companies)",
      type: "select",
      required: false,
      advanced: true,
      options: [
        { value: "TaxExcluded", label: "Tax excluded" },
        { value: "TaxInclusive", label: "Tax inclusive" },
        { value: "NotApplicable", label: "Not applicable" },
      ],
      description:
        "Only for non-US QuickBooks companies. US companies with Automated Sales Tax compute tax automatically — leave empty.",
    },
  ],
  outputs: [...QUICKBOOKS_INVOICE_OUTPUTS],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 40,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Creates a draft invoice in the company's books. Does not email anyone.",
};
