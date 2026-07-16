import type { ActionMeta } from "@/contracts/actionMeta";
import { QUICKBOOKS_CUSTOMER_OUTPUTS } from "./_sharedOutputs";

/**
 * QuickBooks `create_customer` ActionMeta — QUICKBOOKS-1.
 *
 * External write (recoverable — the record can be edited/deactivated in
 * QuickBooks) → riskLevel medium. `email` is annotated
 * `sensitivity: "recipient"`: it becomes the customer's billing email —
 * the default destination future invoice sends deliver to.
 */
export const quickbooksCreateCustomerMeta: ActionMeta = {
  key: "quickbooks:create_customer",
  provider: "quickbooks",
  type: "create_customer",
  displayName: "Create Customer",
  description:
    "Create a customer in QuickBooks Online. Display name must be unique across QuickBooks customers, vendors, and employees — a duplicate fails the run with QuickBooks' own error.",
  category: "commerce",
  requiresIntegration: true,
  fields: [
    {
      name: "displayName",
      label: "Display name",
      type: "text",
      required: true,
      placeholder: "Acme Corp",
      description:
        "The customer's display name in QuickBooks. Must be unique across customers, vendors, and employees.",
    },
    {
      name: "companyName",
      label: "Company name",
      type: "text",
      required: false,
      description: "Optional. The customer's company, stored on the record.",
    },
    {
      name: "givenName",
      label: "First name",
      type: "text",
      required: false,
      description: "Optional. The contact's first name.",
    },
    {
      name: "familyName",
      label: "Last name",
      type: "text",
      required: false,
      description: "Optional. The contact's last name.",
    },
    {
      name: "email",
      label: "Email",
      type: "text",
      required: false,
      sensitivity: "recipient",
      description:
        "Primary email — becomes the billing email invoices are sent to.",
    },
    {
      name: "phone",
      label: "Phone",
      type: "text",
      required: false,
      description: "Optional. Primary phone number stored on the record.",
    },
    {
      name: "addressLine1",
      label: "Billing address line 1",
      type: "text",
      required: false,
      description: "Optional. Street address printed on invoices.",
    },
    {
      name: "addressLine2",
      label: "Billing address line 2",
      type: "text",
      required: false,
      description: "Optional. Suite, unit, or floor.",
    },
    {
      name: "city",
      label: "City",
      type: "text",
      required: false,
      description: "Optional. Billing address city.",
    },
    {
      name: "state",
      label: "State / province",
      type: "text",
      required: false,
      description: "Optional. Billing address state or province.",
    },
    {
      name: "postalCode",
      label: "Postal code",
      type: "text",
      required: false,
      description: "Optional. Billing address postal code.",
    },
    {
      name: "country",
      label: "Country",
      type: "text",
      required: false,
      description: "Optional. Billing address country.",
    },
    {
      name: "notes",
      label: "Notes",
      type: "textarea",
      required: false,
      description: "Internal notes on the customer record.",
    },
  ],
  outputs: [...QUICKBOOKS_CUSTOMER_OUTPUTS],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 10,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Creates a customer record in the company's QuickBooks.",
};
