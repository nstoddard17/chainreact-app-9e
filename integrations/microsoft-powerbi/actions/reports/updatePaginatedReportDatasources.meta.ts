import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for
 * `microsoft-powerbi:update_paginated_report_datasources`. Mirrors
 * `updatePaginatedReportDatasources.schema.ts` 1:1.
 *
 * Row shape = the documented paginated-report wire contract (select by
 * `datasourceName`, provide new server/database) — deliberately NOT
 * the dataset-endpoint selector shape (datasourceType + current
 * connection), which this endpoint does not accept.
 */
export const microsoftPowerBiUpdatePaginatedReportDatasourcesMeta: ActionMeta =
  {
    key: "microsoft-powerbi:update_paginated_report_datasources",
    provider: "microsoft-powerbi",
    type: "update_paginated_report_datasources",
    displayName: "Update Paginated Report Data Sources",
    description:
      "Point a paginated (RDL) report's data sources at a new server and/or database, selected by data source name. Paginated reports only — Power BI reports use Rebind Report instead. The caller must own the report's data sources, the original and new source must have the exact same schema, changing the data source type is not supported, and ODBC sources are not supported.",
    category: "data",
    requiresIntegration: true,
    fields: [
      {
        name: "workspaceId",
        label: "Workspace",
        description:
          "The Power BI workspace that contains the paginated report.",
        type: "combobox",
        required: true,
        optionsSource: "microsoft-powerbi:workspaces",
        placeholder: "Search workspaces…",
      },
      {
        name: "paginatedReportId",
        label: "Paginated report",
        description: "The paginated (RDL) report whose data sources to update.",
        type: "combobox",
        required: true,
        optionsSource: "microsoft-powerbi:paginated_reports",
        dependsOn: "workspaceId",
        placeholder: "Search paginated reports…",
      },
      {
        name: "updates",
        label: "Data source updates",
        description:
          "One row per report data source to retarget. Each row needs the data source name (as defined in the report) and at least one of new server / new database.",
        type: "object-list",
        required: true,
        listMaxItems: 50,
        itemFields: [
          {
            name: "datasourceName",
            label: "Data source name",
            description: "Name of the data source inside the paginated report.",
            type: "text",
            required: true,
          },
          {
            name: "newServer",
            label: "New server",
            description: "New connection server (leave empty to keep).",
            type: "text",
            required: false,
          },
          {
            name: "newDatabase",
            label: "New database",
            description: "New connection database (leave empty to keep).",
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
        description: "True when the update succeeded.",
      },
      {
        name: "updateCount",
        type: "number",
        description: "Number of data source rows submitted.",
      },
    ],
    producesFileRef: false,
    consumesFileRef: false,
    displayOrder: 250,
    isDestructive: false,
    requiresConfirmation: false,
    riskLevel: "medium",
    riskDescription:
      "Repoints a shared report's data connections — every viewer reads from the new server/database after the update.",
  };
