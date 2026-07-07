import type { ActionMeta } from "@/contracts/actionMeta";
import { QUICKBOOKS_CUSTOMER_OUTPUTS } from "./_sharedOutputs";

/** QuickBooks `get_customer` ActionMeta — QUICKBOOKS-1. Read-only. */
export const quickbooksGetCustomerMeta: ActionMeta = {
  key: "quickbooks:get_customer",
  provider: "quickbooks",
  type: "get_customer",
  displayName: "Get Customer",
  description:
    "Read one QuickBooks customer by id. Returns `found: false` when the id doesn't exist (does NOT fail the run).",
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
      description:
        "Pick a customer, or map an id from a previous step / trigger.",
    },
  ],
  outputs: [
    {
      name: "found",
      type: "boolean",
      description:
        "True when the customer exists. Branch on this before using `customer`.",
    },
    {
      name: "customer",
      type: "object",
      description:
        "The customer record (bounded). Null when found is false. Sensitive — contact details and balance.",
      nullable: true,
      sensitive: true,
      fields: [...QUICKBOOKS_CUSTOMER_OUTPUTS],
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 30,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
