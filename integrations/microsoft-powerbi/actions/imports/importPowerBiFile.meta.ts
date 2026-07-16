import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-powerbi:import_power_bi_file`.
 * Mirrors `importPowerBiFile.schema.ts` 1:1 (camelCase field names).
 */
export const microsoftPowerBiImportPowerBiFileMeta: ActionMeta = {
  key: "microsoft-powerbi:import_power_bi_file",
  provider: "microsoft-powerbi",
  type: "import_power_bi_file",
  displayName: "Import Power BI File",
  description:
    "Upload a file (.pbix, .xlsx, .rdl, or dataflow model.json) into a Power BI workspace. Direct upload supports files up to 1 GB; the 1–10 GB temporary-upload path (Premium-only) is not supported. The import is asynchronous — pair with Get Import Status to observe Publishing → Succeeded/Failed. Link-only (provider_url) files are rejected — stage bytes through an upstream get/download step first.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      description: "The Power BI workspace to import into.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:workspaces",
      placeholder: "Search workspaces…",
    },
    {
      name: "file",
      label: "File",
      description:
        "The .pbix (or .xlsx/.rdl/model.json) file to import. Use the variable picker to insert a file from a previous step. Link-only files are rejected — stage the bytes through an upstream get/download step first.",
      type: "file",
      required: true,
      placeholder: "Insert a {{...}} file from a previous step",
    },
    {
      name: "datasetDisplayName",
      label: "Dataset display name",
      description:
        "Target name for the imported dataset; include the file extension (e.g. Report.pbix).",
      type: "text",
      required: true,
      placeholder: "Report.pbix",
    },
    {
      name: "nameConflict",
      label: "If the name already exists",
      description:
        "How Power BI handles a dataset with the same name. Required — pick explicitly. Generate unique name applies to dataflow model.json imports only; .rdl accepts only Abort/Overwrite.",
      type: "select",
      required: true,
      options: [
        { value: "Ignore", label: "Ignore (create another with the same name)" },
        { value: "Abort", label: "Abort the import" },
        { value: "Overwrite", label: "Overwrite the existing dataset" },
        {
          value: "CreateOrOverwrite",
          label: "Create or overwrite",
        },
        {
          value: "GenerateUniqueName",
          label: "Generate a unique name (dataflows only)",
        },
      ],
    },
    {
      name: "skipReport",
      label: "Skip report import",
      description:
        "Import only the dataset, not the report (.pbix only). Power BI accepts only 'true' for this option — leave off to import the report too.",
      type: "boolean",
      required: false,
      advanced: true,
    },
  ],
  outputs: [
    {
      name: "importId",
      type: "string",
      description:
        "Power BI import id — wire it into Get Import Status to poll for completion.",
    },
    {
      name: "importState",
      type: "string",
      description:
        "Import state when the provider includes it on the upload response (usually absent — poll Get Import Status). Null when omitted.",
      nullable: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: true,
  displayOrder: 300,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Uploads content into the workspace and can overwrite an existing dataset depending on the name-conflict mode.",
};
