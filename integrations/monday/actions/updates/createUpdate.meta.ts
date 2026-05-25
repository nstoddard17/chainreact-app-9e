import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Monday `create_update` ActionMeta — Slice 3.MONDAY-6.
 *
 * `boardId` UI-scope narrower drives the item picker. Output `body` is
 * sensitive (comment content).
 */
export const mondayCreateUpdateMeta: ActionMeta = {
  key: "monday:create_update",
  provider: "monday",
  type: "create_update",
  displayName: "Create Update",
  description: "Post an update (comment) to a Monday item.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "boardId",
      label: "Board",
      description: "Used to populate the item picker.",
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
    {
      name: "body",
      label: "Update body",
      type: "textarea",
      required: true,
      placeholder: "Status update…",
    },
  ],
  outputs: [
    { name: "updateId", type: "string", description: "New update id." },
    { name: "itemId", type: "string", description: "Item id (echo)." },
    {
      name: "body",
      type: "string",
      description: "The update body (echo).",
      sensitive: true,
    },
    { name: "createdAt", type: "string", description: "Client-synthesized timestamp." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 120,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Posts a comment visible to item collaborators.",
};
