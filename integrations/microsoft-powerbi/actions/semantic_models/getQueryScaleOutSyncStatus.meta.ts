import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for
 * `microsoft-powerbi:get_query_scale_out_sync_status`.
 * Mirrors `getQueryScaleOutSyncStatus.schema.ts` 1:1.
 */
export const microsoftPowerBiGetQueryScaleOutSyncStatusMeta: ActionMeta = {
  key: "microsoft-powerbi:get_query_scale_out_sync_status",
  provider: "microsoft-powerbi",
  type: "get_query_scale_out_sync_status",
  displayName: "Get Query Scale-Out Sync Status",
  description:
    "Read the replica sync state of a query scale-out enabled semantic model (commit vs. active read versions and sync timing). Requires a Premium-family capacity.",
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
      description: "The semantic model (dataset) whose sync status to read.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:semantic_models",
      dependsOn: "workspaceId",
      placeholder: "Search semantic models…",
    },
  ],
  outputs: [
    {
      name: "commitVersion",
      type: "number",
      description: "The model's latest committed (write) version, when reported.",
      nullable: true,
    },
    {
      name: "targetSyncVersion",
      type: "number",
      description: "The version the replicas are syncing to, when reported.",
      nullable: true,
    },
    {
      name: "minActiveReadVersion",
      type: "number",
      description:
        "The oldest version still serving reads — equals commitVersion once sync completes.",
      nullable: true,
    },
    {
      name: "triggerReason",
      type: "string",
      description: "explicit | automatic | system, when reported.",
      nullable: true,
    },
    {
      name: "syncStartTime",
      type: "string",
      description: "Sync start time (ISO), when reported.",
      nullable: true,
    },
    {
      name: "syncEndTime",
      type: "string",
      description: "Sync end time (ISO), when reported.",
      nullable: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 120,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
