import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-powerbi:take_over_semantic_model`.
 * Mirrors `takeOverSemanticModel.schema.ts` 1:1.
 */
export const microsoftPowerBiTakeOverSemanticModelMeta: ActionMeta = {
  key: "microsoft-powerbi:take_over_semantic_model",
  provider: "microsoft-powerbi",
  type: "take_over_semantic_model",
  displayName: "Take Over Semantic Model",
  description:
    "Make the connected user the owner of a semantic model. Ownership is required for updating parameters, data sources, and the refresh schedule — and scheduled refresh switches to the new owner's data source credentials.",
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
      description: "The semantic model (dataset) to take ownership of.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:semantic_models",
      dependsOn: "workspaceId",
      placeholder: "Search semantic models…",
    },
  ],
  outputs: [
    {
      name: "takenOver",
      type: "boolean",
      description: "True when Power BI transferred ownership.",
    },
    {
      name: "semanticModelId",
      type: "string",
      description: "Semantic model id echoed for chaining.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 100,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Changes the model's owner — scheduled refresh switches to the new owner's stored credentials.",
};
