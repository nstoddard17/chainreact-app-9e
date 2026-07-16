import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for
 * `microsoft-powerbi:test_gateway_datasource_connection`.
 * Mirrors `testGatewayDatasourceConnection.schema.ts` 1:1.
 */
export const microsoftPowerBiTestGatewayDatasourceConnectionMeta: ActionMeta =
  {
    key: "microsoft-powerbi:test_gateway_datasource_connection",
    provider: "microsoft-powerbi",
    type: "test_gateway_datasource_connection",
    displayName: "Test Gateway Datasource Connection",
    description:
      "Check whether an on-premises gateway can reach its data source. An unreachable source is a RESULT (online: false + short error code), not a run failure — branch on the output.",
    category: "data",
    requiresIntegration: true,
    fields: [
      {
        name: "gatewayId",
        label: "Gateway",
        description: "The on-premises data gateway to test from.",
        type: "combobox",
        required: true,
        optionsSource: "microsoft-powerbi:gateways",
        placeholder: "Search gateways…",
      },
      {
        name: "datasourceId",
        label: "Datasource",
        description: "The gateway data source to test connectivity to.",
        type: "combobox",
        required: true,
        optionsSource: "microsoft-powerbi:gateway_datasources",
        dependsOn: "gatewayId",
        placeholder: "Search datasources…",
      },
    ],
    outputs: [
      {
        name: "online",
        type: "boolean",
        description:
          "True when the gateway reached the data source; false on a connectivity failure.",
      },
      {
        name: "errorCode",
        type: "string",
        description:
          "Short Power BI error code when offline (e.g. DM_GWPipeline_Client_GatewayUnreachable). Null when online.",
        nullable: true,
      },
    ],
    producesFileRef: false,
    consumesFileRef: false,
    displayOrder: 720,
    isDestructive: false,
    requiresConfirmation: false,
    riskLevel: "low",
  };
