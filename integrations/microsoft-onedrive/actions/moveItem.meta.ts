import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `microsoft-onedrive:move_item` — Slice 4.ONEDRIVE-META-3.
 * Mirrors `moveItem.schema.ts` (+ the UI-scope `parentItemId`). Write action
 * (medium risk — reversible). Covers move and/or rename; the runtime schema
 * requires at least one of `targetParentItemId` / `newName` (a cross-field
 * rule the meta can't express — both are optional here).
 *
 * Two distinct folder fields: `parentItemId` (UI-scope SOURCE folder, for
 * the `itemId` picker) and `targetParentItemId` (real DESTINATION folder).
 */
export const microsoftOneDriveMoveItemMeta: ActionMeta = {
  key: "microsoft-onedrive:move_item",
  provider: "microsoft-onedrive",
  type: "move_item",
  displayName: "Move / Rename Item",
  description:
    "Move a OneDrive item to another folder and/or rename it. Set a target folder, a new name, or both.",
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
      description: "The item to move/rename. Pick a source folder first, or paste an item id.",
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
      description:
        "Destination folder (optional — omit to keep the current folder and only rename).",
      type: "combobox",
      required: false,
      optionsSource: "microsoft-onedrive:folders",
      placeholder: "Pick a destination folder",
    },
    {
      name: "newName",
      label: "New Name",
      description: "New item name (optional — omit to keep the current name).",
      type: "text",
      required: false,
    },
  ],
  outputs: [
    { name: "itemId", type: "string", description: "DriveItem id." },
    { name: "name", type: "string", description: "Item name after the change." },
    // Graph may omit these on the PATCH response -> handler returns null.
    { name: "parentReference", type: "object", description: "Parent drive/folder reference (or null).", nullable: true },
    { name: "webUrl", type: "string", description: "Item URL (or null).", nullable: true },
    { name: "lastModifiedDateTime", type: "string", description: "ISO-8601 modified (or null).", nullable: true },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 50,
  riskLevel: "medium",
  riskDescription: "Moves/renames an item (recoverable — move/rename back).",
};
