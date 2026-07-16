import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `microsoft-powerbi:dax_query_result_changed`.
 *
 * Content-hash watch over a DAX result set. `maxRows` bounds both the
 * emitted rows and the hashed window — the description says so plainly
 * because a clipped window silently ignoring later-row changes would
 * otherwise look like a bug. `rows` is sensitive: query results routinely
 * carry business-confidential figures.
 */
export const microsoftPowerBiDaxQueryResultChangedTriggerMeta: TriggerMeta = {
  key: "microsoft-powerbi:dax_query_result_changed",
  provider: "microsoft-powerbi",
  type: "dax_query_result_changed",
  displayName: "DAX Query Result Changed",
  description:
    "Fires when the result of a DAX query changes. Only the first Max Rows rows are watched — changes past that limit don't fire.",
  category: "data",
  activation: "polling",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      description: "The Power BI workspace holding the semantic model.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:workspaces",
      placeholder: "Search workspaces…",
    },
    {
      name: "semanticModelId",
      label: "Semantic Model",
      description: "The semantic model (dataset) to query.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:semantic_models",
      dependsOn: "workspaceId",
      placeholder: "Search semantic models…",
    },
    {
      name: "daxQuery",
      label: "DAX Query",
      description:
        "The query whose result is watched for changes. Keep it small and sorted so the watched rows stay stable between runs.",
      type: "textarea",
      required: true,
      placeholder: "EVALUATE TOPN(10, 'Sales', 'Sales'[Amount], DESC)",
    },
    {
      name: "maxRows",
      label: "Max Rows",
      description:
        "How many rows to watch and pass on (1–100). Rows past this limit are ignored for both change detection and the event data.",
      type: "number",
      required: true,
      numeric: { min: 1, max: 100, step: 1, integer: true },
      defaultValue: 20,
    },
  ],
  payloadShape: [
    { name: "workspaceId", type: "string", description: "The workspace that was queried." },
    { name: "semanticModelId", type: "string", description: "The semantic model that was queried." },
    {
      name: "rows",
      type: "array",
      description: "The changed result rows, capped at Max Rows.",
      sensitive: true,
    },
    { name: "rowCount", type: "number", description: "Total rows the query returned, before the Max Rows cap." },
    { name: "truncated", type: "boolean", description: "True when the query returned more rows than Max Rows." },
    { name: "resultHash", type: "string", description: "SHA-256 of the watched rows — changes whenever they do." },
  ],
  displayOrder: 120,
};
