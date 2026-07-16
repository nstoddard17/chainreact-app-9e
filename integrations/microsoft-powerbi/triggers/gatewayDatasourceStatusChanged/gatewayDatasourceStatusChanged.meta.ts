import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for
 * `microsoft-powerbi:gateway_datasource_status_changed`.
 *
 * Connectivity watch over one on-premises gateway data source. Fires in
 * both directions (went offline / came back), plus when the failure reason
 * changes while still offline — `previousOnline` lets a workflow branch on
 * which transition happened without keeping its own state.
 */
export const microsoftPowerBiGatewayDatasourceStatusChangedTriggerMeta: TriggerMeta =
  {
    key: "microsoft-powerbi:gateway_datasource_status_changed",
    provider: "microsoft-powerbi",
    type: "gateway_datasource_status_changed",
    displayName: "Gateway Data Source Status Changed",
    description:
      "Fires when a gateway data source goes offline or comes back online — and when the failure reason changes while it stays offline.",
    category: "data",
    activation: "polling",
    requiresIntegration: true,
    fields: [
      {
        name: "gatewayId",
        label: "Gateway",
        description: "The on-premises data gateway to watch.",
        type: "combobox",
        required: true,
        optionsSource: "microsoft-powerbi:gateways",
        placeholder: "Search gateways…",
      },
      {
        name: "datasourceId",
        label: "Data Source",
        description: "The data source on that gateway whose connectivity is watched.",
        type: "combobox",
        required: true,
        optionsSource: "microsoft-powerbi:gateway_datasources",
        dependsOn: "gatewayId",
        placeholder: "Search data sources…",
      },
    ],
    payloadShape: [
      { name: "gatewayId", type: "string", description: "The gateway that was checked." },
      { name: "datasourceId", type: "string", description: "The data source that was checked." },
      { name: "online", type: "boolean", description: "Whether the gateway can now reach the data source." },
      {
        name: "errorCode",
        type: "string",
        description: "Power BI's short failure code when offline (e.g. DM_GWPipeline_Client_GatewayUnreachable); null when online.",
        nullable: true,
      },
      { name: "previousOnline", type: "boolean", description: "The connectivity state before this change." },
    ],
    displayOrder: 130,
  };
