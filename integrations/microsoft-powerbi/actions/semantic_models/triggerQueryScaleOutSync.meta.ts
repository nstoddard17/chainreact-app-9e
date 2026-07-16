import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for
 * `microsoft-powerbi:trigger_query_scale_out_sync`.
 * Mirrors `triggerQueryScaleOutSync.schema.ts` 1:1.
 */
export const microsoftPowerBiTriggerQueryScaleOutSyncMeta: ActionMeta = {
  key: "microsoft-powerbi:trigger_query_scale_out_sync",
  provider: "microsoft-powerbi",
  type: "trigger_query_scale_out_sync",
  displayName: "Trigger Query Scale-Out Sync",
  description:
    "Sync a semantic model's read-only query scale-out replicas to the latest data version. Requires a Premium-family capacity with query scale-out enabled on the model.",
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
      description: "The semantic model (dataset) whose replicas to sync.",
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
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 110,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Consumes capacity resources to re-sync the model's read replicas.",
};
