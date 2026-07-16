import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `microsoft-powerbi:workspace_item_removed`.
 *
 * The payload deliberately carries no `itemName`: the artifact is already
 * gone by the time the diff notices, so its display name is unknowable —
 * replaying a stale name or inventing one would be dishonest output. The
 * description says so plainly rather than leaving authors to discover it.
 */
export const microsoftPowerBiWorkspaceItemRemovedTriggerMeta: TriggerMeta = {
  key: "microsoft-powerbi:workspace_item_removed",
  provider: "microsoft-powerbi",
  type: "workspace_item_removed",
  displayName: "Workspace Item Removed",
  description:
    "Fires once for each report, semantic model, dashboard, or dataflow removed from the workspace. The item's name isn't available — it's already gone — so only its id is passed on.",
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
    { name: "workspaceId", type: "string", description: "The workspace the item was removed from." },
    { name: "itemType", type: "string", description: "One of report, semantic_model, dashboard, dataflow." },
    { name: "itemId", type: "string", description: "The removed item's Power BI id." },
  ],
  displayOrder: 150,
};
