import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `microsoft-powerbi:workspace_item_added`.
 *
 * Set-difference watch over the workspace's artifacts, filtered to the
 * types the author picks. Pre-existing artifacts are the activation
 * baseline and are never replayed.
 */
export const microsoftPowerBiWorkspaceItemAddedTriggerMeta: TriggerMeta = {
  key: "microsoft-powerbi:workspace_item_added",
  provider: "microsoft-powerbi",
  type: "workspace_item_added",
  displayName: "Workspace Item Added",
  description:
    "Fires once for each new report, semantic model, dashboard, or dataflow added to the workspace. Items that already exist when the workflow is turned on don't fire.",
  category: "data",
  activation: "polling",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      description: "The Power BI workspace to watch.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:workspaces",
      placeholder: "Search workspaces…",
    },
    {
      name: "itemTypes",
      label: "Item Types",
      description: "Which kinds of item to watch for. Pick at least one.",
      type: "select",
      required: true,
      multiple: true,
      options: [
        { value: "report", label: "Report" },
        { value: "semantic_model", label: "Semantic model" },
        { value: "dashboard", label: "Dashboard" },
        { value: "dataflow", label: "Dataflow" },
      ],
    },
  ],
  payloadShape: [
    { name: "workspaceId", type: "string", description: "The workspace the item was added to." },
    { name: "itemType", type: "string", description: "One of report, semantic_model, dashboard, dataflow." },
    { name: "itemId", type: "string", description: "The new item's Power BI id." },
    { name: "itemName", type: "string", description: "The new item's display name." },
  ],
  displayOrder: 140,
};
