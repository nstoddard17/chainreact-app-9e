import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-powerbi:execute_dax_query`.
 * Mirrors `executeDaxQuery.schema.ts` 1:1 (camelCase field names).
 */
export const microsoftPowerBiExecuteDaxQueryMeta: ActionMeta = {
  key: "microsoft-powerbi:execute_dax_query",
  provider: "microsoft-powerbi",
  type: "execute_dax_query",
  displayName: "Execute DAX Query",
  description:
    "Run a single DAX query against a semantic model and return the first result table's rows. Power BI allows one query per call, requires Build permission on the model, and the tenant's \"Dataset Execute Queries REST API\" setting must be enabled.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      description: "The Power BI workspace that contains the semantic model.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:workspaces",
      placeholder: "Search workspaces…",
    },
    {
      name: "semanticModelId",
      label: "Semantic model",
      description: "The semantic model (dataset) to query.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:semantic_models",
      dependsOn: "workspaceId",
      placeholder: "Search semantic models…",
    },
    {
      name: "daxQuery",
      label: "DAX query",
      description:
        "The DAX query to evaluate (one query per run; no MDX or DMV).",
      type: "textarea",
      required: true,
      placeholder: "EVALUATE TOPN(10, 'Sales')",
    },
    {
      name: "maxRows",
      label: "Max rows",
      description:
        "Maximum result rows to return into the workflow (1–1000). Extra rows are dropped and flagged via the truncated output.",
      type: "number",
      required: true,
      numeric: { min: 1, max: 1000, integer: true },
    },
    {
      name: "includeNulls",
      label: "Include nulls",
      description:
        "When enabled, null values are included in the result instead of being omitted.",
      type: "boolean",
      required: false,
      advanced: true,
    },
    {
      name: "impersonatedUserName",
      label: "Impersonated user (UPN)",
      description:
        "Run the query as this user to test row-level security (RLS). Ignored when the model has no RLS.",
      type: "text",
      required: false,
      advanced: true,
      placeholder: "someone@contoso.com",
    },
  ],
  outputs: [
    {
      name: "rows",
      type: "array",
      description:
        "First result table's rows as objects keyed \"Table[Column]\", truncated to maxRows.",
      sensitive: true,
    },
    {
      name: "rowCount",
      type: "number",
      description: "Number of rows returned after truncation.",
    },
    {
      name: "truncated",
      type: "boolean",
      description: "True when the provider returned more rows than maxRows.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 50,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
