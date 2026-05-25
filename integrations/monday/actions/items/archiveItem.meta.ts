import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Monday `archive_item` ActionMeta — Slice 3.MONDAY-6.
 *
 * Recoverable (Monday UI archive → restore). Structural-only output.
 * `boardId` is a UI-scope narrower for the itemId picker (schema marks
 * it optional).
 */
export const mondayArchiveItemMeta: ActionMeta = {
  key: "monday:archive_item",
  provider: "monday",
  type: "archive_item",
  displayName: "Archive Item",
  description:
    "Archive a Monday item. Archived items move to the board archive and are restorable from Monday's UI.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "boardId",
      label: "Board",
      type: "combobox",
      optionsSource: "monday:boards",
      required: true,
      placeholder: "Search boards…",
    },
    {
      name: "itemId",
      label: "Item",
      type: "combobox",
      optionsSource: "monday:items",
      dependsOn: "boardId",
      required: true,
      placeholder: "Select a board first",
    },
  ],
  outputs: [
    { name: "success", type: "boolean", description: "Always true on success." },
    { name: "archivedItemId", type: "string", description: "Archived item id." },
    { name: "archivedAt", type: "string", description: "Client-synthesized archive timestamp." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 80,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Archives an item. Recoverable from Monday's board archive (UI restore); ChainReact has no restore action.",
};
