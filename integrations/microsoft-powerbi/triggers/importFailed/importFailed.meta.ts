import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `microsoft-powerbi:import_failed`.
 *
 * Polling on the workspace's import list. Fires once per import that
 * reaches `Failed`, deduped on the provider's import id.
 */
export const microsoftPowerBiImportFailedTriggerMeta: TriggerMeta = {
  key: "microsoft-powerbi:import_failed",
  provider: "microsoft-powerbi",
  type: "import_failed",
  displayName: "Import Failed",
  description: "Fires when a file import into the chosen workspace fails.",
  category: "data",
  activation: "polling",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      description: "The Power BI workspace whose imports to watch.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:workspaces",
      placeholder: "Search workspaces…",
    },
  ],
  payloadShape: [
    { name: "workspaceId", type: "string", description: "Workspace the file was imported into." },
    { name: "importId", type: "string", description: "Power BI's import id." },
    { name: "name", type: "string", description: "Name of the import, or null.", nullable: true },
    { name: "importState", type: "string", description: "Import state — always Failed for this trigger." },
    {
      name: "createdDateTime",
      type: "string",
      description: "When the import was created, or null.",
      nullable: true,
    },
    {
      name: "updatedDateTime",
      type: "string",
      description: "When the import last changed, or null.",
      nullable: true,
    },
  ],
  displayOrder: 80,
};
