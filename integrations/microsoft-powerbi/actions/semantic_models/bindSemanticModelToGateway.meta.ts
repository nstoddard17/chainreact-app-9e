import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for
 * `microsoft-powerbi:bind_semantic_model_to_gateway`.
 * Mirrors `bindSemanticModelToGateway.schema.ts` 1:1.
 */
export const microsoftPowerBiBindSemanticModelToGatewayMeta: ActionMeta = {
  key: "microsoft-powerbi:bind_semantic_model_to_gateway",
  provider: "microsoft-powerbi",
  type: "bind_semantic_model_to_gateway",
  displayName: "Bind Semantic Model to Gateway",
  description:
    "Bind a semantic model to an on-premises data gateway so its refreshes reach on-prem sources. The connected user must be a data source user on the gateway. When no data source ids are given, Power BI binds to the first matching data source.",
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
      description: "The semantic model (dataset) to bind.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:semantic_models",
      dependsOn: "workspaceId",
      placeholder: "Search semantic models…",
    },
    {
      name: "gatewayId",
      label: "Gateway",
      description:
        "The on-premises data gateway to bind to (for clusters, the primary gateway).",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:gateways",
      placeholder: "Search gateways…",
    },
    {
      name: "datasourceObjectIds",
      label: "Gateway data source ids",
      description:
        "Specific gateway data source ids to bind to. Leave empty to let Power BI bind to the first matching data source.",
      type: "string-array",
      required: false,
      advanced: true,
      stringArrayMaxItems: 100,
    },
  ],
  outputs: [
    {
      name: "bound",
      type: "boolean",
      description: "True when Power BI accepted the gateway bind.",
    },
    {
      name: "gatewayId",
      type: "string",
      description: "Gateway id echoed for chaining.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 90,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Changes which gateway (and credentials) the model's refreshes flow through.",
};
