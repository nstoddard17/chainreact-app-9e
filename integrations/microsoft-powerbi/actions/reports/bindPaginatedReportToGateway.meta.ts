import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for
 * `microsoft-powerbi:bind_paginated_report_to_gateway`. Mirrors
 * `bindPaginatedReportToGateway.schema.ts` 1:1.
 *
 * `bindDetails` is required (documented wire contract for the
 * paginated-report variant) — each row names an RDL data source in the
 * report and the gateway data source id to bind it to.
 */
export const microsoftPowerBiBindPaginatedReportToGatewayMeta: ActionMeta = {
  key: "microsoft-powerbi:bind_paginated_report_to_gateway",
  provider: "microsoft-powerbi",
  type: "bind_paginated_report_to_gateway",
  displayName: "Bind Paginated Report to Gateway",
  description:
    "Bind a paginated (RDL) report's data sources to an on-premises data gateway. Paginated reports only, and only the on-premises data gateway is supported. Each bind row pairs a data source name from the report with the gateway data source id it should use.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      description: "The Power BI workspace that contains the paginated report.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:workspaces",
      placeholder: "Search workspaces…",
    },
    {
      name: "paginatedReportId",
      label: "Paginated report",
      description: "The paginated (RDL) report to bind.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:paginated_reports",
      dependsOn: "workspaceId",
      placeholder: "Search paginated reports…",
    },
    {
      name: "gatewayId",
      label: "Gateway",
      description:
        "The on-premises data gateway to bind to. For a gateway cluster this is the primary gateway id.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:gateways",
      placeholder: "Search gateways…",
    },
    {
      name: "bindDetails",
      label: "Data source bindings",
      description:
        "One row per report data source: the data source name inside the report and the gateway data source id to bind it to.",
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
          name: "datasourceObjectId",
          label: "Gateway data source id",
          description: "Id (uuid) of the data source in the gateway.",
          type: "text",
          required: true,
        },
      ],
    },
  ],
  outputs: [
    {
      name: "bound",
      type: "boolean",
      description: "True when the bind succeeded.",
    },
    {
      name: "gatewayId",
      type: "string",
      description: "Gateway id echoed for chaining.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 260,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Changes which gateway (and credentials) a shared report's data sources use.",
};
