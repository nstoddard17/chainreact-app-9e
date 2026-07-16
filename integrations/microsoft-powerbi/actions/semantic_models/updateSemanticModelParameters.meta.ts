import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for
 * `microsoft-powerbi:update_semantic_model_parameters`.
 * Mirrors `updateSemanticModelParameters.schema.ts` 1:1.
 */
export const microsoftPowerBiUpdateSemanticModelParametersMeta: ActionMeta = {
  key: "microsoft-powerbi:update_semantic_model_parameters",
  provider: "microsoft-powerbi",
  type: "update_semantic_model_parameters",
  displayName: "Update Semantic Model Parameters",
  description:
    "Update Power Query parameter values on a semantic model. The connected user must own the model (pair with Take Over Semantic Model), and some model types (XMLA-modified, live connections) are not supported. Refresh the model afterward to apply.",
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
      description: "The semantic model (dataset) whose parameters to update.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:semantic_models",
      dependsOn: "workspaceId",
      placeholder: "Search semantic models…",
    },
    {
      name: "parameters",
      label: "Parameters",
      description:
        "Parameter names are case-sensitive and must already exist on the model (max 100 per run).",
      type: "object-list",
      required: true,
      listMaxItems: 100,
      itemFields: [
        {
          name: "name",
          label: "Parameter name",
          type: "text",
          required: true,
        },
        {
          name: "newValue",
          label: "New value",
          type: "text",
          required: true,
        },
      ],
    },
  ],
  outputs: [
    {
      name: "updated",
      type: "boolean",
      description: "True when Power BI accepted the parameter update.",
    },
    {
      name: "parameterCount",
      type: "number",
      description: "Number of parameters updated.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 60,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Changes the model's query parameters — the next refresh loads data from the new values.",
};
