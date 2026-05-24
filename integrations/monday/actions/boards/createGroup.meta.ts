import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Monday `create_group` ActionMeta — Slice 3.MONDAY-6.
 */
export const mondayCreateGroupMeta: ActionMeta = {
  key: "monday:create_group",
  provider: "monday",
  type: "create_group",
  displayName: "Create Group",
  description: "Add a group to a Monday board.",
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
      name: "groupTitle",
      label: "Group title",
      type: "text",
      required: true,
      placeholder: "In progress",
    },
    {
      name: "color",
      label: "Color (optional)",
      description: "Monday group color name/hex. Leave empty to let Monday assign one.",
      type: "text",
      required: false,
      placeholder: "#037f4c",
    },
  ],
  outputs: [
    { name: "groupId", type: "string", description: "New group id." },
    { name: "groupTitle", type: "string", description: "Group title.", sensitive: true },
    { name: "groupColor", type: "string", description: "Resolved group color." },
    { name: "boardId", type: "string", description: "Board id (echo)." },
    { name: "createdAt", type: "string", description: "Client-synthesized creation timestamp." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 180,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Adds a group to a board. Recoverable by deleting the group in Monday.",
};
