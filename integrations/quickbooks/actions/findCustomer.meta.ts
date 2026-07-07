import type { ActionMeta } from "@/contracts/actionMeta";
import { QUICKBOOKS_CUSTOMER_OUTPUTS } from "./_sharedOutputs";

/**
 * QuickBooks `find_customer` ActionMeta — QUICKBOOKS-1.
 *
 * Read-only exact-match lookup on ONE field per run (QuickBooks' query
 * language has no OR). `found: false` semantics — never fails the run
 * on no-match.
 */
export const quickbooksFindCustomerMeta: ActionMeta = {
  key: "quickbooks:find_customer",
  provider: "quickbooks",
  type: "find_customer",
  displayName: "Find Customer",
  description:
    "Search QuickBooks customers by exact email, display name, or company name. Returns `found: false` when no match exists (does NOT fail the run) — branch on it before using the match.",
  category: "commerce",
  requiresIntegration: true,
  fields: [
    {
      name: "searchBy",
      label: "Search by",
      type: "select",
      required: true,
      options: [
        { value: "email", label: "Email" },
        { value: "displayName", label: "Display name" },
        { value: "companyName", label: "Company name" },
      ],
      description:
        "Which customer field to match. One field per search — QuickBooks cannot search several at once.",
    },
    {
      name: "value",
      label: "Search value",
      type: "text",
      required: true,
      placeholder: "jane@acme.com",
      description: "Exact value to match (case handled by QuickBooks).",
    },
  ],
  outputs: [
    {
      name: "found",
      type: "boolean",
      description:
        "True when at least one customer matched. Branch on this before using the match outputs.",
    },
    {
      name: "matchCount",
      type: "number",
      description: "Number of matches returned (bounded to 10).",
    },
    {
      name: "customer",
      type: "object",
      description:
        "First matching customer (same shape as Get Customer). Null when found is false. Sensitive — contact details and balance.",
      nullable: true,
      sensitive: true,
      fields: [...QUICKBOOKS_CUSTOMER_OUTPUTS],
    },
    {
      name: "customers",
      type: "array",
      description:
        "Up to 10 matching customers (bounded projections). Sensitive — contact details and balances.",
      sensitive: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 20,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
