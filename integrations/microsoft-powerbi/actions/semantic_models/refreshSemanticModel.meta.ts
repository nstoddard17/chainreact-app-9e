import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-powerbi:refresh_semantic_model`.
 * Mirrors `refreshSemanticModel.schema.ts` 1:1 (camelCase field names).
 *
 * The enhanced-refresh knobs are `advanced: true` — they switch the call
 * onto Power BI's enhanced refresh, which requires Premium / PPU /
 * Embedded capacity (shared capacity rejects them).
 */
export const microsoftPowerBiRefreshSemanticModelMeta: ActionMeta = {
  key: "microsoft-powerbi:refresh_semantic_model",
  provider: "microsoft-powerbi",
  type: "refresh_semantic_model",
  displayName: "Refresh Semantic Model",
  description:
    "Start an on-demand refresh of a semantic model (dataset). Returns a refresh request id; pair with the refresh-completed/failed triggers to react to the outcome.",
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
      description: "The semantic model (dataset) to refresh.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:semantic_models",
      dependsOn: "workspaceId",
      placeholder: "Search semantic models…",
    },
    {
      name: "notifyOption",
      label: "Email notification",
      description:
        "Whether Power BI emails the model owner about this refresh. Required — pick explicitly.",
      type: "select",
      required: true,
      options: [
        { value: "MailOnFailure", label: "Email on failure" },
        { value: "MailOnCompletion", label: "Email on completion" },
        { value: "NoNotification", label: "No email" },
      ],
    },
    {
      name: "refreshType",
      label: "Refresh type (enhanced)",
      description:
        "Enhanced refresh only (Premium/PPU/Embedded capacity). Kind of processing to apply.",
      type: "select",
      required: false,
      advanced: true,
      options: [
        { value: "automatic", label: "Automatic" },
        { value: "full", label: "Full" },
        { value: "clearValues", label: "Clear values" },
        { value: "calculate", label: "Calculate" },
        { value: "dataOnly", label: "Data only" },
        { value: "defragment", label: "Defragment" },
      ],
    },
    {
      name: "commitMode",
      label: "Commit mode (enhanced)",
      description:
        "Enhanced refresh only. Whether objects commit transactionally or in batches.",
      type: "select",
      required: false,
      advanced: true,
      options: [
        { value: "transactional", label: "Transactional" },
        { value: "partialBatch", label: "Partial batch" },
      ],
    },
    {
      name: "maxParallelism",
      label: "Max parallelism (enhanced)",
      description:
        "Enhanced refresh only. Maximum parallel processing threads (1–30).",
      type: "number",
      required: false,
      advanced: true,
      numeric: { min: 1, max: 30, integer: true },
    },
    {
      name: "retryCount",
      label: "Retry count (enhanced)",
      description: "Enhanced refresh only. Provider-side retries (0–5).",
      type: "number",
      required: false,
      advanced: true,
      numeric: { min: 0, max: 5, integer: true },
    },
    {
      name: "applyRefreshPolicy",
      label: "Apply refresh policy (enhanced)",
      description:
        "Enhanced refresh only. Whether the model's incremental refresh policy is applied.",
      type: "boolean",
      required: false,
      advanced: true,
    },
  ],
  outputs: [
    {
      name: "refreshRequestId",
      type: "string",
      description:
        "Power BI refresh request id (x-ms-request-id) — use it to cancel or fetch details. Null if the provider omitted it.",
      nullable: true,
    },
    { name: "workspaceId", type: "string", description: "Workspace id echoed for chaining." },
    { name: "semanticModelId", type: "string", description: "Semantic model id echoed for chaining." },
    {
      name: "enhanced",
      type: "boolean",
      description: "True when enhanced-refresh options were sent.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 10,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Consumes the model's refresh quota and capacity resources; can email the model owner.",
};
