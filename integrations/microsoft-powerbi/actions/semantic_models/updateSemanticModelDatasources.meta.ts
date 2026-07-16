import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for
 * `microsoft-powerbi:update_semantic_model_datasources`.
 * Mirrors `updateSemanticModelDatasources.schema.ts` 1:1.
 */
export const microsoftPowerBiUpdateSemanticModelDatasourcesMeta: ActionMeta = {
  key: "microsoft-powerbi:update_semantic_model_datasources",
  provider: "microsoft-powerbi",
  type: "update_semantic_model_datasources",
  displayName: "Update Semantic Model Data Sources",
  description:
    "Point a semantic model's data-source connections at a new server/database/URL (same source type and schema only). The connected user must own the model (pair with Take Over Semantic Model). Refresh the model afterward to apply the change.",
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
      description: "The semantic model (dataset) whose data sources to update.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:semantic_models",
      dependsOn: "workspaceId",
      placeholder: "Search semantic models…",
    },
    {
      name: "updates",
      label: "Data source updates",
      description:
        "Each row selects an existing data source by its current connection values and gives the new target. Fill at least one current value and one new value per row.",
      type: "object-list",
      required: true,
      listMaxItems: 20,
      itemFields: [
        {
          name: "datasourceType",
          label: "Source type",
          type: "select",
          required: true,
          options: [
            { value: "Sql", label: "SQL Server / Azure SQL / Synapse" },
            { value: "AnalysisServices", label: "Azure Analysis Services" },
            { value: "OData", label: "OData feed" },
            { value: "SharePoint", label: "SharePoint" },
            { value: "Teradata", label: "Teradata" },
            { value: "SapHana", label: "SAP HANA" },
          ],
        },
        {
          name: "currentServer",
          label: "Current server",
          type: "text",
          required: false,
        },
        {
          name: "currentDatabase",
          label: "Current database",
          type: "text",
          required: false,
        },
        {
          name: "currentUrl",
          label: "Current URL",
          type: "text",
          required: false,
        },
        {
          name: "newServer",
          label: "New server",
          type: "text",
          required: false,
        },
        {
          name: "newDatabase",
          label: "New database",
          type: "text",
          required: false,
        },
        {
          name: "newUrl",
          label: "New URL",
          type: "text",
          required: false,
        },
      ],
    },
  ],
  outputs: [
    {
      name: "updated",
      type: "boolean",
      description: "True when Power BI accepted the data-source update.",
    },
    {
      name: "updateCount",
      type: "number",
      description: "Number of data-source updates sent.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 80,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Re-points the model at different source systems — the next refresh loads data from the new connections.",
};
