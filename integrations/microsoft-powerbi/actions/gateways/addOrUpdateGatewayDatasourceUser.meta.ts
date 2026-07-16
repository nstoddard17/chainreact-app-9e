import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for
 * `microsoft-powerbi:add_or_update_gateway_datasource_user`.
 * Mirrors `addOrUpdateGatewayDatasourceUser.schema.ts` 1:1.
 */
export const microsoftPowerBiAddOrUpdateGatewayDatasourceUserMeta: ActionMeta =
  {
    key: "microsoft-powerbi:add_or_update_gateway_datasource_user",
    provider: "microsoft-powerbi",
    type: "add_or_update_gateway_datasource_user",
    displayName: "Add Gateway Datasource User",
    description:
      "Grant a user access to an on-premises gateway data source (Read, or the broader embed-scenario override right).",
    category: "data",
    requiresIntegration: true,
    fields: [
      {
        name: "gatewayId",
        label: "Gateway",
        description:
          "The on-premises data gateway that hosts the data source.",
        type: "combobox",
        required: true,
        optionsSource: "microsoft-powerbi:gateways",
        placeholder: "Search gateways…",
      },
      {
        name: "datasourceId",
        label: "Datasource",
        description: "The gateway data source to grant access on.",
        type: "combobox",
        required: true,
        optionsSource: "microsoft-powerbi:gateway_datasources",
        dependsOn: "gatewayId",
        placeholder: "Search datasources…",
      },
      {
        name: "principalEmail",
        label: "User email",
        description:
          "Email/UPN of the user to grant access to. Groups are not supported by this Power BI API.",
        type: "text",
        required: true,
        sensitivity: "recipient",
        placeholder: "user@contoso.com",
      },
      {
        name: "accessRight",
        label: "Access right",
        description:
          "Read grants normal datasource use. ReadOverrideEffectiveIdentity additionally lets the principal override effective identity — an embed-scenario right; grant deliberately.",
        type: "select",
        required: true,
        options: [
          { value: "Read", label: "Read" },
          {
            value: "ReadOverrideEffectiveIdentity",
            label: "Read + override effective identity (embed)",
          },
        ],
      },
    ],
    outputs: [
      {
        name: "granted",
        type: "boolean",
        description: "True when the grant was accepted.",
      },
      {
        name: "principalEmail",
        type: "string",
        description: "The granted principal, echoed for chaining.",
      },
      {
        name: "accessRight",
        type: "string",
        description: "The granted right, echoed for chaining.",
      },
    ],
    producesFileRef: false,
    consumesFileRef: false,
    displayOrder: 730,
    isDestructive: false,
    requiresConfirmation: false,
    riskLevel: "medium",
    riskDescription:
      "Grants another principal access to a gateway data source; the override right extends to effective-identity impersonation in embed scenarios.",
  };
