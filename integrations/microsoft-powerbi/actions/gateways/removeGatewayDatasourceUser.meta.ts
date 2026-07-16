import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for
 * `microsoft-powerbi:remove_gateway_datasource_user`.
 * Mirrors `removeGatewayDatasourceUser.schema.ts` 1:1.
 */
export const microsoftPowerBiRemoveGatewayDatasourceUserMeta: ActionMeta = {
  key: "microsoft-powerbi:remove_gateway_datasource_user",
  provider: "microsoft-powerbi",
  type: "remove_gateway_datasource_user",
  displayName: "Remove Gateway Datasource User",
  description:
    "Revoke a principal's access to an on-premises gateway data source. Their datasets stop refreshing through this source immediately.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "gatewayId",
      label: "Gateway",
      description: "The on-premises data gateway that hosts the data source.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:gateways",
      placeholder: "Search gateways…",
    },
    {
      name: "datasourceId",
      label: "Datasource",
      description: "The gateway data source to revoke access on.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:gateway_datasources",
      dependsOn: "gatewayId",
      placeholder: "Search datasources…",
    },
    {
      name: "principalEmail",
      label: "User",
      description:
        "The principal (email/UPN) to remove from the data source.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:gateway_datasource_users",
      dependsOn: ["gatewayId", "datasourceId"],
      allowManualEntry: true,
      sensitivity: "recipient",
      placeholder: "Search datasource users…",
    },
  ],
  outputs: [
    {
      name: "removed",
      type: "boolean",
      description: "True when the revocation was accepted.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 740,
  isDestructive: true,
  requiresConfirmation: true,
  riskLevel: "high",
  riskDescription:
    "Revokes gateway data source access — the principal's dependent datasets stop refreshing until access is re-granted.",
};
