import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Monday `create_subitem` ActionMeta — Slice 3.MONDAY-6.
 *
 * `boardId` is a UI-scope narrower (the parent item's board) so the
 * `parentItemId` picker can cascade. The subitems board itself stays
 * opaque (D-MON6). `columnValues` is paste-JSON.
 */
export const mondayCreateSubitemMeta: ActionMeta = {
  key: "monday:create_subitem",
  provider: "monday",
  type: "create_subitem",
  displayName: "Create Subitem",
  description:
    "Create a subitem under a parent item. Monday resolves the hidden subitems board automatically.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "boardId",
      label: "Board",
      description: "The parent item's board — used to populate the parent-item picker.",
      type: "combobox",
      optionsSource: "monday:boards",
      required: true,
      placeholder: "Search boards…",
    },
    {
      name: "parentItemId",
      label: "Parent item",
      type: "combobox",
      optionsSource: "monday:items",
      dependsOn: "boardId",
      required: true,
      placeholder: "Select a board first",
    },
    {
      name: "subitemName",
      label: "Subitem name",
      type: "text",
      required: true,
      placeholder: "New subtask",
    },
    {
      name: "columnValues",
      label: "Column values (JSON)",
      description:
        'JSON-encoded column-values map for the subitems board. Example: {"status":{"label":"Working on it"}}.',
      type: "textarea",
      required: false,
      placeholder: '{"status":{"label":"Working on it"}}',
    },
  ],
  outputs: [
    { name: "subitemId", type: "string", description: "New subitem id." },
    {
      name: "subitemName",
      type: "string",
      description: "Subitem name.",
      sensitive: true,
    },
    { name: "parentItemId", type: "string", description: "Parent item id (echo)." },
    {
      name: "boardId",
      type: "string",
      description: "Resolved subitems-board id (informational).",
    },
    { name: "createdAt", type: "string", description: "Creation timestamp." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 100,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Creates a subitem. Recoverable by deleting the new subitem.",
};
