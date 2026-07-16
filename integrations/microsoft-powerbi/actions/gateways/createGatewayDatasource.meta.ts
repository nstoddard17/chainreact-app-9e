import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-powerbi:create_gateway_datasource`.
 * Mirrors `createGatewayDatasource.schema.ts` 1:1 (camelCase field names).
 *
 * `username`/`password`/`key` are conditionally required BY the schema
 * refinements (per credentialType) — meta marks them optional +
 * `visibleWhen` so only the relevant fields show. `password`/`key` carry
 * `sensitivity: "secret"`: values are encrypted against the gateway
 * public key in-app and never appear in outputs or errors.
 */
export const microsoftPowerBiCreateGatewayDatasourceMeta: ActionMeta = {
  key: "microsoft-powerbi:create_gateway_datasource",
  provider: "microsoft-powerbi",
  type: "create_gateway_datasource",
  displayName: "Create Gateway Datasource",
  description:
    "Create a data source on an on-premises data gateway. Credentials are encrypted against the gateway's public key before they leave ChainReact (RSA-OAEP, per Microsoft's documented scheme).",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "gatewayId",
      label: "Gateway",
      description:
        "The on-premises data gateway (you must be a gateway admin). VNet/cloud gateways are not supported by this API.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:gateways",
      placeholder: "Search gateways…",
    },
    {
      name: "datasourceName",
      label: "Datasource name",
      description: "Display name for the new data source on the gateway.",
      type: "text",
      required: true,
      placeholder: "Sales SQL Server",
    },
    {
      name: "datasourceType",
      label: "Datasource type",
      description:
        "The data source type — the documented on-premises gateway set.",
      type: "select",
      required: true,
      options: [
        { value: "SQL", label: "SQL Server" },
        { value: "AnalysisServices", label: "Analysis Services" },
        { value: "Oracle", label: "Oracle" },
        { value: "PostgreSql", label: "PostgreSQL" },
        { value: "MySql", label: "MySQL" },
        { value: "OData", label: "OData" },
        { value: "ODBC", label: "ODBC" },
        { value: "SharePoint", label: "SharePoint" },
        { value: "SAPHana", label: "SAP HANA" },
        { value: "File", label: "File" },
        { value: "Folder", label: "Folder" },
        { value: "Web", label: "Web" },
      ],
    },
    {
      name: "server",
      label: "Server",
      description:
        "Server for the connection details (e.g. SQL/Oracle/SAP HANA). At least one of server, database, or URL is required — schema enforces.",
      type: "text",
      required: false,
      placeholder: "MyServer",
    },
    {
      name: "database",
      label: "Database",
      description:
        "Database for the connection details (e.g. SQL/PostgreSQL/MySQL).",
      type: "text",
      required: false,
      placeholder: "MyDatabase",
    },
    {
      name: "url",
      label: "URL",
      description:
        "URL for the connection details (e.g. OData/SharePoint/Web/File path).",
      type: "text",
      required: false,
      placeholder: "https://example.sharepoint.com/sites/data",
    },
    {
      name: "credentialType",
      label: "Credential type",
      description:
        "How the gateway authenticates to the data source. OAuth2 is not supported by Create Datasource; Anonymous is not offered here.",
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
      visibleWhen: { field: "credentialType", valueIn: ["Basic", "Windows"] },
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
      visibleWhen: { field: "credentialType", valueIn: ["Basic", "Windows"] },
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
        "Data-combination privacy level for this source. Required — pick explicitly (it changes how Power BI is allowed to fold/combine data across sources).",
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
      name: "datasourceId",
      type: "string",
      description:
        "Id of the created gateway data source. Null if the provider omitted it.",
      nullable: true,
    },
    { name: "gatewayId", type: "string", description: "Gateway id echoed for chaining." },
    {
      name: "datasourceName",
      type: "string",
      description: "Datasource name echoed for chaining.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 700,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Creates a data source (with stored credentials) on an on-premises gateway. Credentials are RSA-OAEP-encrypted in-app before transmission.",
};
