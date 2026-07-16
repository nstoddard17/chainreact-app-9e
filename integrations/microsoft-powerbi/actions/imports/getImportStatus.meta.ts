import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-powerbi:get_import_status`.
 * Mirrors `getImportStatus.schema.ts` 1:1.
 */
export const microsoftPowerBiGetImportStatusMeta: ActionMeta = {
  key: "microsoft-powerbi:get_import_status",
  provider: "microsoft-powerbi",
  type: "get_import_status",
  displayName: "Get Import Status",
  description:
    "Read the state of a workspace import (Publishing, Succeeded, or Failed) plus the datasets and reports it produced. Poll this after Import Power BI File to observe completion.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      description: "The Power BI workspace that received the import.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:workspaces",
      placeholder: "Search workspaces…",
    },
    {
      name: "importId",
      label: "Import",
      description:
        "The import to check — usually the importId output of an Import Power BI File step; you can also pick a recent import or paste an id.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:imports",
      dependsOn: "workspaceId",
      allowManualEntry: true,
      placeholder: "Pick an import or insert {{node.importId}}",
    },
  ],
  outputs: [
    {
      name: "importState",
      type: "string",
      description:
        "Import state: Publishing, Succeeded, or Failed. Null if the provider omitted it.",
      nullable: true,
    },
    {
      name: "name",
      type: "string",
      description: "Import name, or null when omitted.",
      nullable: true,
    },
    {
      name: "createdDateTime",
      type: "string",
      description: "When the import was created (ISO-8601), or null.",
      nullable: true,
    },
    {
      name: "updatedDateTime",
      type: "string",
      description: "When the import last changed (ISO-8601), or null.",
      nullable: true,
    },
    {
      name: "reports",
      type: "array",
      description:
        "Reports produced by the import, each {id, name} (name null when omitted).",
    },
    {
      name: "datasets",
      type: "array",
      description:
        "Datasets produced by the import, each {id, name} (name null when omitted).",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 310,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
