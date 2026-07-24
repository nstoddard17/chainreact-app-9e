import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `microsoft-onedrive:delete_item` — Slice 4.ONEDRIVE-META-3.
 * Mirrors `deleteItem.schema.ts` (+ the UI-scope `parentItemId`).
 *
 * **Risk: high + destructive + requiresConfirmation (Marcus decision).**
 * Deleting a folder cascades to ALL its children; OneDrive's recycle-bin
 * recovery is time-limited and this action exposes no restore path. Mirrors
 * the Airtable `delete_record` / Excel `delete_worksheet` destructive-trio.
 *
 * Picker cascade: `parentItemId` (UI-scope, optional) → `itemId`.
 */
export const microsoftOneDriveDeleteItemMeta: ActionMeta = {
  key: "microsoft-onedrive:delete_item",
  provider: "microsoft-onedrive",
  type: "delete_item",
  displayName: "Delete Item",
  description:
    "Delete a OneDrive file or folder. Deleting a folder also deletes everything inside it.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "parentItemId",
      label: "Folder",
      description:
        "Pick the item's folder to populate the item picker below. Optional — leave empty if the item id comes from an upstream step.",
      type: "combobox",
      required: false,
      optionsSource: "microsoft-onedrive:folders",
      placeholder: "Pick a folder",
    },
    {
      name: "itemId",
      label: "Item",
      description: "The file or folder to delete. Pick a folder first, or paste an item id.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-onedrive:items",
      allowManualEntry: true,
      dependsOn: "parentItemId",
      placeholder: "Select a folder first, or paste an item id",
    },
  ],
  outputs: [
    { name: "itemId", type: "string", description: "The deleted item's id." },
    { name: "deleted", type: "boolean", description: "True once the delete succeeded." },
    {
      name: "alreadyMissing",
      type: "boolean",
      description: "True if the item was already gone (idempotent delete).",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: true,
  requiresConfirmation: true,
  displayOrder: 70,
  riskLevel: "high",
  riskDescription:
    "Deletes a file or folder. Folder deletes cascade to all children, and recovery via the recycle bin is time-limited and not guaranteed through this action.",
};
