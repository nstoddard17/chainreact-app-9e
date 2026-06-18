import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `microsoft-onedrive:copy_item` — Slice 4.ONEDRIVE-META-3.
 * Mirrors `copyItem.schema.ts` (+ the UI-scope `parentItemId`). Write action
 * (medium risk — creates a copy).
 *
 * Async-by-design: the runtime returns `{status:"pending", monitorUrl}`
 * without polling. `targetParentItemId` is the REQUIRED destination;
 * `parentItemId` is the UI-scope SOURCE folder for the `itemId` picker.
 */
export const microsoftOneDriveCopyItemMeta: ActionMeta = {
  key: "microsoft-onedrive:copy_item",
  provider: "microsoft-onedrive",
  type: "copy_item",
  displayName: "Copy Item",
  description:
    "Copy a OneDrive item into another folder. Runs asynchronously — returns a pending status and a monitor URL.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "parentItemId",
      label: "Source Folder",
      description:
        "Pick the item's current folder to populate the item picker below. Optional — leave empty if the item id comes from an upstream step.",
      type: "combobox",
      required: false,
      optionsSource: "microsoft-onedrive:folders",
      placeholder: "Pick the source folder",
    },
    {
      name: "itemId",
      label: "Item",
      description: "The item to copy. Pick a source folder first, or paste an item id.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-onedrive:items",
      dependsOn: "parentItemId",
      placeholder: "Select a source folder first, or paste an item id",
    },
    {
      name: "targetParentItemId",
      sensitivity: "recipient",
      label: "Target Folder",
      description: "The destination folder for the copy (required).",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-onedrive:folders",
      placeholder: "Pick a destination folder",
    },
    {
      name: "newName",
      label: "New Name",
      description: "Name for the copy (optional — omit to keep the source name).",
      type: "text",
      required: false,
    },
  ],
  outputs: [
    { name: "status", type: "string", description: 'Copy status — "pending".' },
    { name: "monitorUrl", type: "string", description: "Graph monitor URL to poll for completion." },
    { name: "sourceItemId", type: "string", description: "The copied item's id." },
    { name: "targetParentItemId", type: "string", description: "The destination folder id." },
    { name: "newName", type: "string", description: "The copy's name (or null)." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 60,
  riskLevel: "medium",
  riskDescription: "Creates a copy (recoverable — delete the copy to undo).",
};
