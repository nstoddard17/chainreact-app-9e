import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for
 * `microsoft-powerbi:update_gateway_datasource_credentials`.
 * Mirrors `updateGatewayDatasourceCredentials.schema.ts` 1:1.
 *
 * `username`/`password`/`key` are conditionally required BY the schema
 * refinements (per credentialType); `password`/`key` carry
 * `sensitivity: "secret"` and are encrypted in-app before transmission.
 */
export const microsoftPowerBiUpdateGatewayDatasourceCredentialsMeta: ActionMeta =
  {
    key: "microsoft-powerbi:update_gateway_datasource_credentials",
    provider: "microsoft-powerbi",
    type: "update_gateway_datasource_credentials",
    displayName: "Update Gateway Datasource Credentials",
    description:
      "Replace the stored credentials of an on-premises gateway data source. New credentials are encrypted against the gateway's public key before they leave ChainReact.",
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
        description: "The gateway data source whose credentials to replace.",
        type: "combobox",
        required: true,
        optionsSource: "microsoft-powerbi:gateway_datasources",
        dependsOn: "gatewayId",
        placeholder: "Search datasources…",
      },
      {
        name: "credentialType",
        label: "Credential type",
        description:
          "How the gateway authenticates to the data source with the NEW credentials.",
        type: "select",
        required: true,
        options: [
          { value: "Basic", label: "Basic (username + password)" },
          { value: "Windows", label: "Windows (domain\\user + password)" },
          { value: "Key", label: "Key (account/API key)" },
        ],
      },
      {
        name: "username",
        label: "Username",
        description:
          "Required for Basic/Windows credentials — schema enforces. For Windows use domain\\username.",
        type: "text",
        required: false,
        visibleWhen: {
          field: "credentialType",
          valueIn: ["Basic", "Windows"],
        },
        placeholder: "CONTOSO\\svc-powerbi",
      },
      {
        name: "password",
        label: "Password",
        description:
          "Required for Basic/Windows credentials — schema enforces. Encrypted against the gateway public key before leaving ChainReact.",
        type: "text",
        required: false,
        sensitivity: "secret",
        visibleWhen: {
          field: "credentialType",
          valueIn: ["Basic", "Windows"],
        },
      },
      {
        name: "key",
        label: "Key",
        description:
          "Required for Key credentials — schema enforces. Encrypted against the gateway public key before leaving ChainReact.",
        type: "text",
        required: false,
        sensitivity: "secret",
        visibleWhen: { field: "credentialType", valueIn: ["Key"] },
      },
      {
        name: "privacyLevel",
        label: "Privacy level",
        description:
          "Data-combination privacy level. Required — pick explicitly (it changes how Power BI is allowed to fold/combine data across sources).",
        type: "select",
        required: true,
        options: [
          { value: "None", label: "None" },
          { value: "Public", label: "Public" },
          { value: "Organizational", label: "Organizational" },
          { value: "Private", label: "Private" },
        ],
      },
    ],
    outputs: [
      {
        name: "updated",
        type: "boolean",
        description: "True when the credential update was accepted.",
      },
      {
        name: "datasourceId",
        type: "string",
        description: "Datasource id echoed for chaining.",
      },
    ],
    producesFileRef: false,
    consumesFileRef: false,
    displayOrder: 710,
    isDestructive: false,
    requiresConfirmation: false,
    riskLevel: "medium",
    riskDescription:
      "Replaces the credentials every dataset using this gateway data source authenticates with; a wrong value breaks scheduled refreshes until corrected.",
  };
